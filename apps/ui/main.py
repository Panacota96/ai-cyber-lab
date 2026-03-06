from __future__ import annotations

import argparse
import html
import json
import shlex
from typing import Any

import httpx
import uvicorn
from fastapi import FastAPI, File, Form, Query, UploadFile
from fastapi.responses import HTMLResponse

from apps.orchestrator.config import api_host, api_key, orchestrator_url, proposal_providers, ui_port

app = FastAPI(title="AI Cyber Lab UI", version="0.3.0")


# -----------------------------
# HTTP helpers
# -----------------------------
def _fetch_json(method: str, path: str, payload: dict[str, Any] | None = None) -> tuple[int, dict[str, Any]]:
    url = f"{orchestrator_url().rstrip('/')}{path}"
    headers = _api_headers()
    try:
        with httpx.Client(timeout=25.0) as client:
            if method == "GET":
                resp = client.get(url, headers=headers)
            elif method == "PATCH":
                resp = client.patch(url, json=payload or {}, headers=headers)
            else:
                resp = client.post(url, json=payload or {}, headers=headers)
        try:
            return resp.status_code, resp.json()
        except Exception:
            return resp.status_code, {"raw": resp.text}
    except Exception as exc:
        return 503, {"error": str(exc), "url": url}


def _post_upload(path: str, data: dict[str, str], file_name: str, content: bytes, content_type: str) -> tuple[int, dict[str, Any]]:
    url = f"{orchestrator_url().rstrip('/')}{path}"
    files = {"screenshot": (file_name, content, content_type)}
    headers = _api_headers()
    try:
        with httpx.Client(timeout=40.0) as client:
            resp = client.post(url, data=data, files=files, headers=headers)
        try:
            return resp.status_code, resp.json()
        except Exception:
            return resp.status_code, {"raw": resp.text}
    except Exception as exc:
        return 503, {"error": str(exc), "url": url}


# -----------------------------
# rendering helpers
# -----------------------------
def _escape(value: Any) -> str:
    return html.escape(str(value))


def _api_headers() -> dict[str, str]:
    key = api_key()
    if not key:
        return {}
    return {"X-API-Key": key}


def _pretty(value: Any) -> str:
    return html.escape(json.dumps(value, indent=2, ensure_ascii=True))


def _status_chip(text: str) -> str:
    val = (text or "").strip().lower()
    cls = "chip"
    if val in {"completed", "approved", "ok"}:
        cls += " good"
    elif val in {"failed", "rejected", "error"}:
        cls += " bad"
    elif val in {"running", "queued", "pending"}:
        cls += " warn"
    return f"<span class='{cls}'>{_escape(val or 'n/a')}</span>"


def _table(headers: list[str], rows: list[list[str]]) -> str:
    head = "".join(f"<th>{_escape(h)}</th>" for h in headers)
    body_rows = ""
    for row in rows:
        body_rows += "<tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>"
    if not body_rows:
        body_rows = f"<tr><td colspan='{len(headers)}'>No data</td></tr>"
    return f"<table><thead><tr>{head}</tr></thead><tbody>{body_rows}</tbody></table>"


def _detail_summary(detail: Any) -> str:
    if not isinstance(detail, dict):
        return f"<p class='small'>{_escape(str(detail))}</p>"

    rows: list[list[str]] = []
    for key in sorted(detail.keys()):
        value = detail.get(key)
        if isinstance(value, (list, dict)):
            rows.append([_escape(key), _escape(f"{type(value).__name__} ({len(value)})")])
        else:
            rows.append([_escape(key), _escape(value)])
    return _table(["Field", "Value"], rows)


def _layout(
    page: str,
    project: str,
    body: str,
    *,
    flash: str = "",
    detail: Any | None = None,
    view: str = "html",
) -> str:
    health_code, health = _fetch_json("GET", "/health")
    _, ready = _fetch_json("GET", "/ready")

    nav_items = [
        ("recon", "/ui/recon", "Recon"),
        ("graph", "/ui/graph", "Graph"),
        ("proposals", "/ui/proposals", "Proposals"),
        ("cracking", "/ui/cracking", "Cracking"),
        ("docs", "/ui/docs", "Docs"),
        ("sessions", "/ui/sessions", "Sessions"),
        ("reports", "/ui/reports", "Reports"),
    ]
    nav = []
    for key, href, label in nav_items:
        cls = "tab active" if key == page else "tab"
        nav.append(
            f"<a class='{cls}' href='{href}?project={_escape(project)}&view={_escape(view)}'>{label}</a>"
        )

    flash_block = f"<div class='flash'>{_escape(flash)}</div>" if flash else ""
    detail_block = ""
    if detail is not None:
        if view == "json":
            detail_body = f"<pre>{_pretty(detail)}</pre>"
        else:
            detail_body = _detail_summary(detail)
        detail_block = f"<section class='panel'><h3>Result</h3>{detail_body}</section>"

    status_text = _escape(health.get("status", "unknown"))
    degraded = _escape(ready.get("degraded", "?"))
    view_html_cls = "tab active" if view == "html" else "tab"
    view_json_cls = "tab active" if view == "json" else "tab"

    return f"""<!doctype html>
<html>
<head>
  <meta charset='utf-8'/>
  <meta name='viewport' content='width=device-width, initial-scale=1'/>
  <title>AI Cyber Lab Workbench</title>
  <style>
    :root {{
      --bg:#edf3fa;
      --ink:#0f172a;
      --muted:#475569;
      --card:#fff;
      --line:#d6e0ee;
      --brand:#0d4a78;
      --good:#0f8d54;
      --warn:#976300;
      --bad:#b42318;
      --mono:'JetBrains Mono',Consolas,monospace;
    }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:'IBM Plex Sans','Segoe UI',Tahoma,sans-serif; color:var(--ink); background:radial-gradient(1100px 450px at 20% -20%, #d7ebff 0%, transparent 60%),var(--bg); }}
    .wrap {{ max-width:1400px; margin:0 auto; padding:20px; }}
    .top {{ display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px; }}
    .title {{ margin:0; font-size:1.45rem; }}
    .meta {{ color:var(--muted); font-size:.9rem; }}
    .tabs {{ display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; }}
    .tab {{ text-decoration:none; color:var(--ink); border:1px solid var(--line); background:#fff; padding:8px 12px; border-radius:999px; font-weight:700; }}
    .tab.active {{ color:#fff; background:var(--brand); border-color:var(--brand); }}
    .grid {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }}
    .panel {{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px; margin-bottom:14px; box-shadow: 0 5px 14px rgba(13,74,120,.04); }}
    .panel h2,.panel h3 {{ margin:0 0 10px; }}
    .small {{ color:var(--muted); font-size:.86rem; }}
    label {{ display:block; font-size:.82rem; color:var(--muted); font-weight:700; margin:8px 0 4px; }}
    input,textarea,select {{ width:100%; border:1px solid var(--line); border-radius:8px; padding:8px; font:inherit; background:#fff; }}
    textarea {{ min-height:86px; resize:vertical; }}
    button {{ margin-top:10px; border:0; border-radius:8px; background:var(--brand); color:#fff; font-weight:700; padding:9px 12px; cursor:pointer; }}
    button.secondary {{ background:#334155; }}
    .flash {{ border:1px solid #b3d5ff; background:#e8f3ff; color:#0d4a78; border-radius:10px; padding:10px; margin-bottom:14px; }}
    .chip {{ border:1px solid var(--line); border-radius:999px; padding:4px 8px; display:inline-block; font-size:.75rem; text-transform:capitalize; }}
    .chip.good {{ border-color:#b7ebcf; color:var(--good); background:#f0fff6; }}
    .chip.warn {{ border-color:#f6e0a7; color:var(--warn); background:#fff9ea; }}
    .chip.bad {{ border-color:#f3c5c2; color:var(--bad); background:#fff2f1; }}
    table {{ width:100%; border-collapse:collapse; font-size:.9rem; }}
    th,td {{ border:1px solid var(--line); text-align:left; padding:7px; vertical-align:top; }}
    th {{ background:#f3f7ff; }}
    .cmd {{ font-family:var(--mono); background:#0d1524; color:#d8eeff; border-radius:8px; padding:8px; white-space:pre-wrap; }}
    pre {{ background:#0d1524; color:#d8eeff; border-radius:8px; padding:10px; overflow:auto; white-space:pre-wrap; margin:0; }}
    .row {{ display:flex; flex-wrap:wrap; gap:8px; align-items:center; }}
    .split {{ display:grid; grid-template-columns: 2fr 1fr; gap:14px; }}
    .gallery {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:10px; }}
    .card {{ border:1px solid var(--line); border-radius:10px; padding:10px; background:#fff; }}
    #graphCanvas {{ width:100%; height:560px; border:1px solid var(--line); border-radius:10px; background:#fff; }}
    @media (max-width:1000px) {{ .grid,.split {{ grid-template-columns:1fr; }} #graphCanvas {{ height:420px; }} }}
  </style>
</head>
<body>
  <div class='wrap'>
    <div class='top'>
      <h1 class='title'>AI Cyber Lab Workbench</h1>
      <div class='meta'>Project <strong>{_escape(project)}</strong> | Health <strong>{health_code}/{status_text}</strong> | Ready degraded <strong>{degraded}</strong></div>
    </div>
    <div class='tabs'>
      <a class='{view_html_cls}' href='?project={_escape(project)}&view=html'>Readable View</a>
      <a class='{view_json_cls}' href='?project={_escape(project)}&view=json'>JSON View</a>
    </div>
    <nav class='tabs'>{''.join(nav)}</nav>
    {flash_block}
    {body}
    {detail_block}
  </div>
</body>
</html>"""


def _session_id(project: str) -> str:
    _, current = _fetch_json("GET", f"/sessions/current?project={project}")
    if not isinstance(current, dict):
        return ""
    return str(current.get("session_id", ""))


# -----------------------------
# page renderers
# -----------------------------
def _render_recon(
    project: str,
    flash: str = "",
    detail: Any | None = None,
    plan: dict[str, Any] | None = None,
    view: str = "html",
) -> str:
    _, jobs_resp = _fetch_json("GET", f"/jobs?project={project}&limit=40")
    _, facts_resp = _fetch_json("GET", f"/projects/{project}/facts?status=approved&limit=40")

    jobs = jobs_resp.get("jobs", []) if isinstance(jobs_resp, dict) else []
    facts = facts_resp.get("facts", []) if isinstance(facts_resp, dict) else []
    sid = _session_id(project)

    cards = ""
    if isinstance(plan, dict):
        for cmd in plan.get("commands", []):
            cmd_list = cmd.get("cmd", []) if isinstance(cmd, dict) else []
            cmd_json = _escape(json.dumps(cmd_list, ensure_ascii=True))
            cards += f"""
            <div class='card'>
              <h3>{_escape(cmd.get('title','Command'))}</h3>
              <div class='cmd'>{_escape(' '.join(cmd_list))}</div>
              <div class='row'>
                {_status_chip(str(cmd.get('risk','low')))}
                <span class='chip'>timeout {int(cmd.get('timeout_sec',120))}s</span>
              </div>
              <p class='small'>{_escape(cmd.get('rationale',''))}</p>
              <form method='post' action='/ui/jobs/create'>
                <input type='hidden' name='project' value='{_escape(project)}'/>
                <input type='hidden' name='session_id' value='{_escape(sid)}'/>
                <input type='hidden' name='purpose' value='{_escape(str(plan.get('purpose','recon')))}'/>
                <input type='hidden' name='profile' value='{_escape(str(plan.get('profile','balanced')))}'/>
                <input type='hidden' name='target' value='{_escape(str(plan.get('target','')))}'/>
                <input type='hidden' name='plan_id' value='{_escape(str(plan.get('plan_id','')))}'/>
                <input type='hidden' name='cmd_json' value='{cmd_json}'/>
                <input type='hidden' name='timeout_sec' value='{_escape(cmd.get('timeout_sec',120))}'/>
                <input type='hidden' name='page' value='recon'/>
                <input type='hidden' name='view' value='{_escape(view)}'/>
                <button type='submit'>Queue + Confirm</button>
              </form>
            </div>
            """

    job_rows = []
    for item in jobs[:30]:
        cmd = " ".join(item.get("command_json", [])[:8]) if isinstance(item.get("command_json", []), list) else ""
        job_rows.append(
            [
                _status_chip(str(item.get("status", ""))),
                _escape(item.get("purpose", "")),
                _escape(item.get("target", "")),
                _escape(cmd),
                _escape(item.get("updated_utc", "")),
            ]
        )

    fact_rows = []
    for f in facts[:40]:
        summary = f"{f.get('subject_type','')}:{f.get('subject_value','')}"
        if f.get("fact_kind") == "relation":
            summary = f"{f.get('subject_type','')}:{f.get('subject_value','')} -[{f.get('relation','')}]-> {f.get('object_type','')}:{f.get('object_value','')}"
        fact_rows.append(
            [
                _status_chip(str(f.get("status", ""))),
                _escape(f.get("fact_kind", "")),
                _escape(summary),
                _escape(f.get("source", "")),
                _escape(f.get("confidence", "")),
            ]
        )

    body = f"""
    <div class='grid'>
      <section class='panel'>
        <h2>Generate Recon Plan</h2>
        <form method='post' action='/ui/recon/plan'>
          <input type='hidden' name='view' value='{_escape(view)}'/>
          <label>Project</label><input name='project' value='{_escape(project)}'/>
          <label>Target (IP/FQDN)</label><input name='target' required placeholder='10.10.10.10'/>
          <label>Purpose</label>
          <select name='purpose'><option value='recon'>recon</option><option value='scanning'>scanning</option></select>
          <label>Profile</label>
          <select name='profile'><option value='stealth'>stealth</option><option value='balanced' selected>balanced</option><option value='aggressive'>aggressive</option></select>
          <label>Discoveries (one per line)</label>
          <textarea name='discoveries' placeholder='80/tcp open http'></textarea>
          <button type='submit'>Generate Commands</button>
        </form>
      </section>
      <section class='panel'>
        <h2>Manual Command</h2>
        <form method='post' action='/ui/jobs/create'>
          <input type='hidden' name='page' value='recon'/>
          <input type='hidden' name='view' value='{_escape(view)}'/>
          <label>Project</label><input name='project' value='{_escape(project)}'/>
          <label>Session ID</label><input name='session_id' value='{_escape(sid)}'/>
          <label>Purpose</label><input name='purpose' value='recon'/>
          <label>Profile</label><input name='profile' value='balanced'/>
          <label>Target</label><input name='target' placeholder='10.10.10.10'/>
          <label>Command</label><textarea name='cmd_text' placeholder='nmap -sC -sV -Pn 10.10.10.10' required></textarea>
          <label>Timeout (sec)</label><input name='timeout_sec' value='180'/>
          <button type='submit'>Queue + Confirm</button>
        </form>
      </section>
    </div>
    <section class='panel'><h2>Planned Commands</h2><div class='gallery'>{cards or '<p class="small">Generate plan to view command cards.</p>'}</div></section>
    <section class='panel'><h2>Recent Jobs</h2>{_table(['Status','Purpose','Target','Command','Updated'], job_rows)}</section>
    <section class='panel'><h2>Approved Facts Snapshot</h2>{_table(['Status','Kind','Discovery','Source','Confidence'], fact_rows)}</section>
    """
    return _layout("recon", project, body, flash=flash, detail=detail, view=view)


def _render_graph(
    project: str,
    session_id: str = "",
    include_pending: bool = False,
    flash: str = "",
    detail: Any | None = None,
    focus_kind: str = "",
    min_confidence: float = 0.6,
    view: str = "html",
) -> str:
    query = f"/projects/{project}/graph?include_pending={'true' if include_pending else 'false'}&limit=3000"
    if session_id.strip():
        query += f"&session_id={session_id.strip()}"
    _, graph = _fetch_json("GET", query)

    _, sessions_resp = _fetch_json("GET", f"/projects/{project}/sessions?limit=200")
    _, pending_resp = _fetch_json("GET", f"/facts/review?project={project}&status=pending&limit=100")

    sessions = sessions_resp.get("sessions", []) if isinstance(sessions_resp, dict) else []
    pending = pending_resp.get("facts", []) if isinstance(pending_resp, dict) else []

    options = ["<option value=''>All sessions</option>"]
    for s in sessions[:200]:
        sid = str(s.get("session_id", ""))
        selected = " selected" if sid == session_id else ""
        label = f"{sid} | {s.get('status','')} | {s.get('started_utc','')}"
        options.append(f"<option value='{_escape(sid)}'{selected}>{_escape(label)}</option>")

    review_rows = []
    for f in pending[:100]:
        summary = f"{f.get('subject_type','')}:{f.get('subject_value','')}"
        if f.get("fact_kind") == "relation":
            summary = f"{f.get('subject_type','')}:{f.get('subject_value','')} -[{f.get('relation','')}]-> {f.get('object_type','')}:{f.get('object_value','')}"
        fact_id = str(f.get("fact_id", ""))
        actions = (
            f"<form method='post' action='/ui/facts/{_escape(fact_id)}/approve' style='display:inline'>"
            f"<input type='hidden' name='project' value='{_escape(project)}'/><input type='hidden' name='session_id' value='{_escape(session_id)}'/><input type='hidden' name='include_pending' value={'1' if include_pending else '0'}/><input type='hidden' name='focus_kind' value='{_escape(focus_kind)}'/><input type='hidden' name='min_confidence' value='{_escape(min_confidence)}'/><input type='hidden' name='view' value='{_escape(view)}'/><button type='submit'>Approve</button></form> "
            f"<form method='post' action='/ui/facts/{_escape(fact_id)}/reject' style='display:inline'>"
            f"<input type='hidden' name='project' value='{_escape(project)}'/><input type='hidden' name='session_id' value='{_escape(session_id)}'/><input type='hidden' name='include_pending' value={'1' if include_pending else '0'}/><input type='hidden' name='focus_kind' value='{_escape(focus_kind)}'/><input type='hidden' name='min_confidence' value='{_escape(min_confidence)}'/><input type='hidden' name='view' value='{_escape(view)}'/><button class='secondary' type='submit'>Reject</button></form>"
        )
        review_rows.append(
            [
                _escape(f.get("fact_kind", "")),
                _escape(summary),
                _escape(f.get("source", "")),
                _escape(f.get("confidence", "")),
                actions,
            ]
        )

    nodes = graph.get("nodes", []) if isinstance(graph, dict) else []
    edges = graph.get("edges", []) if isinstance(graph, dict) else []

    if not isinstance(nodes, list):
        nodes = []
    if not isinstance(edges, list):
        edges = []

    if focus_kind.strip():
        kind = focus_kind.strip().lower()
        allowed_nodes = {str(n.get("id", "")) for n in nodes if str(n.get("kind", "")).lower() == kind}
        edges = [
            e
            for e in edges
            if str(e.get("source", "")) in allowed_nodes or str(e.get("target", "")) in allowed_nodes
        ]
        related = set()
        for e in edges:
            related.add(str(e.get("source", "")))
            related.add(str(e.get("target", "")))
        nodes = [n for n in nodes if str(n.get("id", "")) in related]

    max_nodes = 260
    if len(nodes) > max_nodes:
        keep = {str(n.get("id", "")) for n in nodes[:max_nodes]}
        nodes = [n for n in nodes if str(n.get("id", "")) in keep]
        edges = [
            e
            for e in edges
            if str(e.get("source", "")) in keep and str(e.get("target", "")) in keep
        ]

    kind_counts: dict[str, int] = {}
    for n in nodes:
        k = str(n.get("kind", "unknown")).strip().lower() or "unknown"
        kind_counts[k] = kind_counts.get(k, 0) + 1

    kind_options = ["<option value=''>All entity kinds</option>"]
    for k in sorted(kind_counts.keys()):
        selected = " selected" if k == focus_kind.strip().lower() else ""
        kind_options.append(f"<option value='{_escape(k)}'{selected}>{_escape(k)} ({kind_counts[k]})</option>")

    filtered_graph = {
        "project": project,
        "session_id": session_id,
        "include_pending": include_pending,
        "backend": graph.get("backend", "sqlite") if isinstance(graph, dict) else "sqlite",
        "nodes": nodes,
        "edges": edges,
        "stats": {"nodes": len(nodes), "edges": len(edges)},
    }
    graph_json = json.dumps(filtered_graph, ensure_ascii=True)

    body = f"""
    <div class='split'>
      <section class='panel'>
        <h2>Discoveries Graph</h2>
        <form method='get' action='/ui/graph' class='row'>
          <input type='hidden' name='project' value='{_escape(project)}'/>
          <input type='hidden' name='view' value='{_escape(view)}'/>
          <div style='flex:1;min-width:260px'><label>Session Filter</label><select name='session_id'>{''.join(options)}</select></div>
          <div><label>Include Pending</label><select name='include_pending'><option value='1'{' selected' if include_pending else ''}>yes</option><option value='0'{' selected' if not include_pending else ''}>no</option></select></div>
          <div><label>Focus Kind</label><select name='focus_kind'>{''.join(kind_options)}</select></div>
          <div><label>Min Confidence</label><input type='number' min='0' max='1' step='0.05' name='min_confidence' value='{_escape(min_confidence)}'/></div>
          <div><button type='submit'>Refresh Graph</button></div>
        </form>
        <p class='small'>Showing {_escape(len(nodes))} nodes / {_escape(len(edges))} edges (capped for readability). Backend: {_escape(filtered_graph.get('backend','sqlite'))}.</p>
        <div id='graphCanvas'></div>
        <p class='small'>Tip: click nodes/edges for details in the inspector panel.</p>
      </section>
      <section class='panel'>
        <h2>Inspector</h2>
        <pre id='graphInspector'>Select a node or edge.</pre>
      </section>
    </div>
    <section class='panel'><h2>Pending Fact Review</h2>{_table(['Kind','Discovery','Source','Confidence','Actions'], review_rows)}</section>
    <script src='https://unpkg.com/cytoscape@3.30.2/dist/cytoscape.min.js'></script>
    <script>
      const graphPayload = {graph_json};
      const elements = [];
      const minConfidence = {min_confidence};
      const nodes = (graphPayload.nodes || []).map(n => ({{ data: {{ id: n.id, label: n.label, kind: n.kind, meta: n.meta || {{}} }} }}));
      const edges = (graphPayload.edges || [])
        .filter(e => Number((e.meta || {{}}).confidence || 0.5) >= minConfidence)
        .map(e => ({{ data: {{ id: e.id, source: e.source, target: e.target, label: e.label, meta: e.meta || {{}} }} }}));
      elements.push(...nodes, ...edges);

      const cy = cytoscape({{
        container: document.getElementById('graphCanvas'),
        elements,
        style: [
          {{ selector: 'node', style: {{ 'label': 'data(label)', 'background-color': '#0d4a78', 'color': '#fff', 'font-size': 10, 'text-wrap': 'wrap', 'text-max-width': 120, 'text-valign': 'center', 'text-halign': 'center' }} }},
          {{ selector: 'node[kind="port"]', style: {{ 'background-color': '#1982c4' }} }},
          {{ selector: 'node[kind="service"]', style: {{ 'background-color': '#2b7a0b' }} }},
          {{ selector: 'node[kind="user"]', style: {{ 'background-color': '#8a5d00' }} }},
          {{ selector: 'node[kind="password"], node[kind="hash"]', style: {{ 'background-color': '#b42318' }} }},
          {{ selector: 'edge', style: {{ 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'line-color': '#8aa1be', 'target-arrow-color': '#8aa1be', 'label': 'data(label)', 'font-size': 9, 'text-background-color': '#fff', 'text-background-opacity': 1, 'text-background-padding': 2 }} }},
        ],
        layout: {{ name: 'cose', animate: false, padding: 20, nodeRepulsion: 70000, edgeElasticity: 70 }}
      }});

      const inspector = document.getElementById('graphInspector');
      cy.on('tap', 'node, edge', function(evt) {{
        inspector.textContent = JSON.stringify(evt.target.data(), null, 2);
      }});
    </script>
    """
    return _layout("graph", project, body, flash=flash, detail=detail, view=view)


def _render_proposals(
    project: str,
    flash: str = "",
    detail: Any | None = None,
    proposal: dict[str, Any] | None = None,
    view: str = "html",
) -> str:
    sid = _session_id(project)
    provider_panels = ""
    ensemble_cards = ""

    if isinstance(proposal, dict):
        for provider in proposal.get("providers", []):
            if not isinstance(provider, dict):
                continue
            status = str(provider.get("status", "unknown"))
            provider_cards = ""
            for item in provider.get("commands", []):
                if not isinstance(item, dict):
                    continue
                cmd = item.get("cmd", [])
                if not isinstance(cmd, list):
                    continue
                provider_cards += (
                    "<div class='card'>"
                    f"<h3>{_escape(item.get('title', 'Command'))}</h3>"
                    f"<div class='cmd'>{_escape(' '.join(cmd))}</div>"
                    f"<p class='small'>{_escape(item.get('rationale', ''))}</p>"
                    "</div>"
                )
            provider_panels += (
                "<section class='panel'>"
                f"<h2>{_escape(str(provider.get('provider', 'provider')).title())} {_status_chip(status)}</h2>"
                f"<p class='small'>{_escape(provider.get('error', ''))}</p>"
                f"<div class='gallery'>{provider_cards or '<p class=\"small\">No commands proposed.</p>'}</div>"
                "</section>"
            )

        for item in proposal.get("ensemble", []):
            if not isinstance(item, dict):
                continue
            cmd = item.get("cmd", [])
            if not isinstance(cmd, list):
                continue
            quality = item.get("quality", {}) if isinstance(item.get("quality"), dict) else {}
            score = quality.get("score", "n/a")
            grade = quality.get("grade", "n/a")
            recommended = bool(quality.get("recommended"))
            cmd_json = _escape(json.dumps(cmd, ensure_ascii=True))
            providers = ", ".join(item.get("providers", [])) if isinstance(item.get("providers"), list) else ""
            ensemble_cards += f"""
            <div class='card'>
              <h3>{_escape(item.get('title', 'Command'))}</h3>
              <div class='cmd'>{_escape(' '.join(cmd))}</div>
              <div class='row'>
                {_status_chip(str(item.get('risk', 'medium')))}
                <span class='chip'>providers: {_escape(providers or 'n/a')}</span>
                <span class='chip'>consensus: {_escape('yes' if item.get('consensus') else 'no')}</span>
                <span class='chip'>quality: {_escape(score)} ({_escape(grade)})</span>
                <span class='chip {'good' if recommended else 'warn'}'>recommended: {_escape('yes' if recommended else 'review')}</span>
              </div>
              <p class='small'>{_escape(item.get('rationale', ''))}</p>
              <p class='small'>{_escape(str(quality.get('explanation', '')))}</p>
              <form method='post' action='/ui/jobs/create'>
                <input type='hidden' name='project' value='{_escape(project)}'/>
                <input type='hidden' name='session_id' value='{_escape(sid)}'/>
                <input type='hidden' name='purpose' value='recon'/>
                <input type='hidden' name='profile' value='balanced'/>
                <input type='hidden' name='target' value='{_escape(str(proposal.get('target', '')))}'/>
                <input type='hidden' name='plan_id' value='{_escape(str(proposal.get('proposal_id', '')))}'/>
                <input type='hidden' name='cmd_json' value='{cmd_json}'/>
                <input type='hidden' name='timeout_sec' value='180'/>
                <input type='hidden' name='page' value='proposals'/>
                <input type='hidden' name='view' value='{_escape(view)}'/>
                <button type='submit'>Queue + Confirm</button>
              </form>
            </div>
            """

    body = f"""
    <div class='grid'>
      <section class='panel'>
        <h2>Generate Multi-LLM Proposals</h2>
        <form method='post' action='/ui/proposals/generate'>
          <input type='hidden' name='view' value='{_escape(view)}'/>
          <label>Project</label><input name='project' value='{_escape(project)}'/>
          <label>Target (IP/FQDN)</label><input name='target' required placeholder='10.10.10.10'/>
          <label>Purpose</label>
          <select name='purpose'><option value='recon'>recon</option><option value='scanning'>scanning</option><option value='cracking'>cracking</option></select>
          <label>Aggressiveness</label>
          <select name='profile'><option value='stealth'>stealth</option><option value='balanced' selected>balanced</option><option value='aggressive'>aggressive</option></select>
          <label>Providers (comma-separated)</label><input name='providers' value='{_escape(",".join(proposal_providers()))}'/>
          <label>Discoveries (one per line)</label>
          <textarea name='discoveries' placeholder='80/tcp open http'></textarea>
          <button type='submit'>Generate Proposals</button>
        </form>
      </section>
      <section class='panel'>
        <h2>Review Workflow</h2>
        <p class='small'>Default is human-readable cards. Switch to JSON view when you need raw payload details.</p>
        <p class='small'>Ensemble commands include deterministic quality scoring (feasibility/safety/evidence-fit/novelty).</p>
      </section>
    </div>
    <section class='panel'><h2>Ensemble (Manual Review)</h2><div class='gallery'>{ensemble_cards or '<p class=\"small\">Generate a proposal to view ensemble commands.</p>'}</div></section>
    {provider_panels}
    """
    return _layout("proposals", project, body, flash=flash, detail=detail, view=view)


def _render_cracking(
    project: str,
    flash: str = "",
    detail: Any | None = None,
    plan: dict[str, Any] | None = None,
    view: str = "html",
) -> str:
    _, jobs_resp = _fetch_json("GET", f"/jobs?project={project}&purpose=cracking&limit=40")
    jobs = jobs_resp.get("jobs", []) if isinstance(jobs_resp, dict) else []
    sid = _session_id(project)

    cards = ""
    if isinstance(plan, dict):
        for cmd in plan.get("commands", []):
            cmd_list = cmd.get("cmd", []) if isinstance(cmd, dict) else []
            cards += f"""
            <div class='card'>
              <h3>{_escape(cmd.get('title','Command'))}</h3>
              <div class='cmd'>{_escape(' '.join(cmd_list))}</div>
              <p class='small'>{_escape(cmd.get('rationale',''))}</p>
              <form method='post' action='/ui/jobs/create'>
                <input type='hidden' name='project' value='{_escape(project)}'/>
                <input type='hidden' name='session_id' value='{_escape(sid)}'/>
                <input type='hidden' name='purpose' value='cracking'/>
                <input type='hidden' name='profile' value='{_escape(plan.get('profile','balanced'))}'/>
                <input type='hidden' name='target' value='{_escape(plan.get('target',''))}'/>
                <input type='hidden' name='plan_id' value='{_escape(plan.get('plan_id',''))}'/>
                <input type='hidden' name='cmd_json' value='{_escape(json.dumps(cmd_list, ensure_ascii=True))}'/>
                <input type='hidden' name='timeout_sec' value='{_escape(cmd.get('timeout_sec',300))}'/>
                <input type='hidden' name='page' value='cracking'/>
                <input type='hidden' name='view' value='{_escape(view)}'/>
                <button type='submit'>Queue + Confirm</button>
              </form>
            </div>
            """

    job_rows = []
    for item in jobs[:30]:
        cmd = " ".join(item.get("command_json", [])[:8]) if isinstance(item.get("command_json", []), list) else ""
        job_rows.append(
            [
                _status_chip(str(item.get("status", ""))),
                _escape(item.get("target", "")),
                _escape(cmd),
                _escape(item.get("updated_utc", "")),
            ]
        )

    body = f"""
    <div class='grid'>
      <section class='panel'>
        <h2>Generate Cracking Plan</h2>
        <p class='small'>Authorized labs/CTFs only.</p>
        <form method='post' action='/ui/cracking/plan'>
          <input type='hidden' name='view' value='{_escape(view)}'/>
          <label>Project</label><input name='project' value='{_escape(project)}'/>
          <label>Target/Context</label><input name='target' required placeholder='hash dump source'/>
          <label>Profile</label>
          <select name='profile'><option value='stealth'>stealth</option><option value='balanced' selected>balanced</option><option value='aggressive'>aggressive</option></select>
          <button type='submit'>Generate Cracking Commands</button>
        </form>
      </section>
      <section class='panel'>
        <h2>Manual Cracking Command</h2>
        <form method='post' action='/ui/jobs/create'>
          <input type='hidden' name='page' value='cracking'/>
          <input type='hidden' name='view' value='{_escape(view)}'/>
          <label>Project</label><input name='project' value='{_escape(project)}'/>
          <label>Session ID</label><input name='session_id' value='{_escape(sid)}'/>
          <label>Command</label><textarea name='cmd_text' placeholder='john --wordlist=... hashes.txt' required></textarea>
          <label>Timeout (sec)</label><input name='timeout_sec' value='300'/>
          <input type='hidden' name='purpose' value='cracking'/>
          <input type='hidden' name='profile' value='balanced'/>
          <button type='submit'>Queue + Confirm</button>
        </form>
      </section>
    </div>
    <section class='panel'><h2>Planned Commands</h2><div class='gallery'>{cards or '<p class="small">Generate plan to view command cards.</p>'}</div></section>
    <section class='panel'><h2>Recent Cracking Jobs</h2>{_table(['Status','Target','Command','Updated'], job_rows)}</section>
    """
    return _layout("cracking", project, body, flash=flash, detail=detail, view=view)


def _render_docs(project: str, flash: str = "", detail: Any | None = None, view: str = "html") -> str:
    _, findings_resp = _fetch_json("GET", f"/findings?project={project}&limit=200")
    _, evidence_resp = _fetch_json("GET", f"/evidence?project={project}&limit=200")
    findings = findings_resp.get("findings", []) if isinstance(findings_resp, dict) else []
    evidence = evidence_resp.get("evidence", []) if isinstance(evidence_resp, dict) else []
    sid = _session_id(project)

    finding_cards = ""
    for f in findings[:100]:
        finding_cards += f"""
        <div class='card'>
          <h3>{_escape(f.get('title','Finding'))}</h3>
          <div class='row'>{_status_chip(str(f.get('severity','medium')))} {_status_chip(str(f.get('status','open')))}</div>
          <p class='small'>{_escape(f.get('description',''))}</p>
          <div class='small'>session: {_escape(f.get('session_id',''))}</div>
        </div>
        """

    evidence_rows = []
    for e in evidence[:150]:
        tags = ", ".join(e.get("tags_json", [])) if isinstance(e.get("tags_json"), list) else ""
        evidence_rows.append(
            [
                _escape(e.get("file_name", "")),
                _escape(e.get("finding_id", "")),
                _escape(tags),
                _escape(e.get("report_section", "")),
                _escape(e.get("created_utc", "")),
            ]
        )

    body = f"""
    <div class='grid'>
      <section class='panel'>
        <h2>Create Finding</h2>
        <form method='post' action='/ui/findings/create'>
          <input type='hidden' name='view' value='{_escape(view)}'/>
          <label>Project</label><input name='project' value='{_escape(project)}'/>
          <label>Session ID</label><input name='session_id' value='{_escape(sid)}'/>
          <label>Title</label><input name='title' required/>
          <label>Severity</label><select name='severity'><option value='low'>low</option><option value='medium' selected>medium</option><option value='high'>high</option><option value='critical'>critical</option></select>
          <label>Description</label><textarea name='description'></textarea>
          <button type='submit'>Save Finding</button>
        </form>
      </section>
      <section class='panel'>
        <h2>Upload Screenshot Evidence</h2>
        <form method='post' action='/ui/evidence/upload' enctype='multipart/form-data'>
          <input type='hidden' name='view' value='{_escape(view)}'/>
          <label>Project</label><input name='project' value='{_escape(project)}'/>
          <label>Session ID</label><input name='session_id' value='{_escape(sid)}'/>
          <label>Finding ID (optional)</label><input name='finding_id'/>
          <label>Report Section</label><input name='report_section' placeholder='recon/exploitation/impact'/>
          <label>Tags (comma-separated)</label><input name='tags' placeholder='web,proof'/>
          <label>Screenshot file</label><input name='screenshot' type='file' required/>
          <button type='submit'>Upload Evidence</button>
        </form>
      </section>
    </div>
    <section class='panel'><h2>Findings</h2><div class='gallery'>{finding_cards or '<p class="small">No findings yet.</p>'}</div></section>
    <section class='panel'><h2>Evidence</h2>{_table(['File','Finding','Tags','Report Section','Created'], evidence_rows)}</section>
    """
    return _layout("docs", project, body, flash=flash, detail=detail, view=view)


def _render_sessions(
    project: str,
    flash: str = "",
    detail: Any | None = None,
    timeline: dict[str, Any] | None = None,
    filters: dict[str, str] | None = None,
    view: str = "html",
) -> str:
    filters = filters or {}
    status = filters.get("status", "")
    operator = filters.get("operator", "")
    q = filters.get("q", "")

    _, current = _fetch_json("GET", f"/sessions/current?project={project}")
    params = f"project={project}&limit=200"
    if status:
        params += f"&status={status}"
    if operator:
        params += f"&operator={operator}"
    if q:
        params += f"&q={q}"
    _, sessions_resp = _fetch_json("GET", f"/projects/{project}/sessions?{params}")
    _, jobs_resp = _fetch_json("GET", f"/jobs?project={project}&limit=100")

    sessions = sessions_resp.get("sessions", []) if isinstance(sessions_resp, dict) else []
    jobs = jobs_resp.get("jobs", []) if isinstance(jobs_resp, dict) else []

    session_rows = []
    for s in sessions[:200]:
        sid = str(s.get("session_id", ""))
        actions = (
            f"<a class='tab' href='/ui/graph?project={_escape(project)}&session_id={_escape(sid)}&include_pending=1&view={_escape(view)}'>Graph</a> "
            f"<form method='post' action='/ui/exports/session' style='display:inline'><input type='hidden' name='project' value='{_escape(project)}'/><input type='hidden' name='session_id' value='{_escape(sid)}'/><input type='hidden' name='view' value='{_escape(view)}'/><button type='submit'>Export</button></form> "
            f"<form method='post' action='/ui/sessions/timeline' style='display:inline'><input type='hidden' name='project' value='{_escape(project)}'/><input type='hidden' name='session_id' value='{_escape(sid)}'/><input type='hidden' name='view' value='{_escape(view)}'/><button class='secondary' type='submit'>Timeline</button></form>"
        )
        session_rows.append(
            [
                _escape(sid),
                _status_chip(str(s.get("status", ""))),
                _escape(s.get("operator", "")),
                _escape(s.get("started_utc", "")),
                _escape(s.get("ended_utc", "")),
                actions,
            ]
        )

    job_rows = []
    for item in jobs[:60]:
        cmd = " ".join(item.get("command_json", [])[:8]) if isinstance(item.get("command_json", []), list) else ""
        job_rows.append(
            [
                _status_chip(str(item.get("status", ""))),
                _escape(item.get("session_id", "")),
                _escape(item.get("purpose", "")),
                _escape(cmd),
                _escape(item.get("updated_utc", "")),
            ]
        )

    timeline_block = "<p class='small'>Select a session to display timeline.</p>"
    if isinstance(timeline, dict):
        events = timeline.get("events", []) if isinstance(timeline.get("events", []), list) else []
        rows = []
        for e in events[:400]:
            rows.append(
                [
                    _escape(e.get("timestamp", "")),
                    _escape(e.get("type", "")),
                    _escape(e.get("title", "")),
                ]
            )
        timeline_block = _table(["Timestamp", "Type", "Title"], rows)

    body = f"""
    <div class='grid'>
      <section class='panel'>
        <h2>Session Control</h2>
        <form method='post' action='/ui/session/start'>
          <input type='hidden' name='view' value='{_escape(view)}'/>
          <label>Project</label><input name='project' value='{_escape(project)}'/>
          <label>Operator</label><input name='operator' value='david'/>
          <button type='submit'>Start Session</button>
        </form>
        <form method='post' action='/ui/session/end'>
          <input type='hidden' name='view' value='{_escape(view)}'/>
          <label>Project</label><input name='project' value='{_escape(project)}'/>
          <label>Summary</label><input name='summary' value='session complete'/>
          <button type='submit'>End Session</button>
        </form>
      </section>
      <section class='panel'>
        <h2>Session Filters + Export</h2>
        <form method='get' action='/ui/sessions'>
          <label>Project</label><input name='project' value='{_escape(project)}'/>
          <input type='hidden' name='view' value='{_escape(view)}'/>
          <label>Status</label><input name='status' value='{_escape(status)}' placeholder='active/ended'/>
          <label>Operator</label><input name='operator' value='{_escape(operator)}'/>
          <label>Search</label><input name='q' value='{_escape(q)}' placeholder='session id or summary'/>
          <button type='submit'>Apply Filters</button>
        </form>
        <form method='post' action='/ui/exports/project'>
          <input type='hidden' name='project' value='{_escape(project)}'/>
          <input type='hidden' name='view' value='{_escape(view)}'/>
          <button type='submit'>Export Project</button>
        </form>
      </section>
    </div>
    <section class='panel'><h2>Current Session</h2><div class='row'><span class='chip'>{_escape(current.get('session_id','none') if isinstance(current, dict) else 'none')}</span>{_status_chip(str((current or {}).get('status','none')) if isinstance(current, dict) else 'none')}</div></section>
    <section class='panel'><h2>Sessions List</h2>{_table(['Session ID','Status','Operator','Started','Ended','Actions'], session_rows)}</section>
    <section class='panel'><h2>Jobs During Sessions</h2>{_table(['Status','Session','Purpose','Command','Updated'], job_rows)}</section>
    <section class='panel'><h2>Timeline</h2>{timeline_block}</section>
    """
    return _layout("sessions", project, body, flash=flash, detail=detail, view=view)


def _render_reports(project: str, flash: str = "", detail: Any | None = None, view: str = "html") -> str:
    _, facts_resp = _fetch_json("GET", f"/projects/{project}/facts?status=approved&limit=80")
    _, findings_resp = _fetch_json("GET", f"/findings?project={project}&limit=80")
    _, evidence_resp = _fetch_json("GET", f"/evidence?project={project}&limit=80")

    facts = facts_resp.get("facts", []) if isinstance(facts_resp, dict) else []
    findings = findings_resp.get("findings", []) if isinstance(findings_resp, dict) else []
    evidence = evidence_resp.get("evidence", []) if isinstance(evidence_resp, dict) else []

    finding_rows = []
    for f in findings[:80]:
        finding_rows.append(
            [
                _escape(f.get("title", "")),
                _status_chip(str(f.get("severity", ""))),
                _status_chip(str(f.get("status", ""))),
                _escape(f.get("session_id", "")),
            ]
        )

    evidence_rows = []
    for e in evidence[:80]:
        evidence_rows.append(
            [
                _escape(e.get("file_name", "")),
                _escape(e.get("finding_id", "")),
                _escape(e.get("report_section", "")),
            ]
        )

    fact_rows = []
    for f in facts[:80]:
        fact_rows.append(
            [
                _escape(f.get("fact_kind", "")),
                _escape(f.get("subject_type", "")),
                _escape(f.get("subject_value", "")),
                _escape(f.get("confidence", "")),
            ]
        )

    body = f"""
    <div class='grid'>
      <section class='panel'>
        <h2>Generate Session Report</h2>
        <form method='post' action='/ui/reports/generate'>
          <input type='hidden' name='view' value='{_escape(view)}'/>
          <label>Project</label><input name='project' value='{_escape(project)}'/>
          <label>Prompt</label>
          <textarea name='prompt'>generate markdown report and writeup from project notes and artifacts</textarea>
          <button type='submit'>Generate Markdown</button>
        </form>
      </section>
      <section class='panel'>
        <h2>Export Bundle</h2>
        <p class='small'>Use Sessions page for per-session export and project export. Exports include Markdown + HTML + JSON.</p>
      </section>
    </div>
    <section class='panel'><h2>Findings For Report</h2>{_table(['Title','Severity','Status','Session'], finding_rows)}</section>
    <section class='panel'><h2>Evidence For Report</h2>{_table(['File','Finding','Section'], evidence_rows)}</section>
    <section class='panel'><h2>Approved Facts For Report</h2>{_table(['Kind','Type','Value','Confidence'], fact_rows)}</section>
    """
    return _layout("reports", project, body, flash=flash, detail=detail, view=view)


# -----------------------------
# page routes
# -----------------------------
@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def home(project: str = Query(default="demo"), view: str = Query(default="html")) -> str:
    return _render_recon(project=project, view=view)


@app.get("/ui/recon", response_class=HTMLResponse)
def page_recon(project: str = Query(default="demo"), view: str = Query(default="html")) -> str:
    return _render_recon(project=project, view=view)


@app.post("/ui/recon/plan", response_class=HTMLResponse)
def ui_recon_plan(
    project: str = Form(...),
    target: str = Form(...),
    purpose: str = Form("recon"),
    profile: str = Form("balanced"),
    discoveries: str = Form(""),
    view: str = Form("html"),
) -> str:
    disc = [x.strip() for x in discoveries.splitlines() if x.strip()]
    code, out = _fetch_json(
        "POST",
        "/planner/commands",
        {"project": project, "target": target, "purpose": purpose, "profile": profile, "discoveries": disc},
    )
    return _render_recon(
        project=project,
        flash=f"/planner/commands status={code}",
        detail=out,
        plan=out if code == 200 else None,
        view=view,
    )


@app.get("/ui/graph", response_class=HTMLResponse)
def page_graph(
    project: str = Query(default="demo"),
    session_id: str = Query(default=""),
    include_pending: int = Query(default=0),
    focus_kind: str = Query(default=""),
    min_confidence: float = Query(default=0.6),
    view: str = Query(default="html"),
) -> str:
    return _render_graph(
        project=project,
        session_id=session_id,
        include_pending=bool(include_pending),
        focus_kind=focus_kind,
        min_confidence=min_confidence,
        view=view,
    )


@app.get("/ui/proposals", response_class=HTMLResponse)
def page_proposals(project: str = Query(default="demo"), view: str = Query(default="html")) -> str:
    return _render_proposals(project=project, view=view)


@app.post("/ui/proposals/generate", response_class=HTMLResponse)
def ui_proposals_generate(
    project: str = Form(...),
    target: str = Form(...),
    purpose: str = Form("recon"),
    profile: str = Form("balanced"),
    providers: str = Form("codex,claude,gemini"),
    discoveries: str = Form(""),
    view: str = Form("html"),
) -> str:
    provider_list = [x.strip() for x in providers.split(",") if x.strip()]
    disc = [x.strip() for x in discoveries.splitlines() if x.strip()]
    code, out = _fetch_json(
        "POST",
        "/proposals/commands",
        {
            "project": project,
            "target": target,
            "purpose": purpose,
            "profile": profile,
            "providers": provider_list,
            "discoveries": disc,
        },
    )
    return _render_proposals(
        project=project,
        flash=f"/proposals/commands status={code}",
        detail=out,
        proposal=out if code == 200 else None,
        view=view,
    )


@app.post("/ui/facts/{fact_id}/approve", response_class=HTMLResponse)
def ui_fact_approve(
    fact_id: str,
    project: str = Form(...),
    session_id: str = Form(""),
    include_pending: int = Form(1),
    focus_kind: str = Form(""),
    min_confidence: float = Form(0.6),
    view: str = Form("html"),
) -> str:
    code, out = _fetch_json("POST", f"/facts/review/{fact_id}/approve", {"reviewer": "ui"})
    return _render_graph(
        project=project,
        session_id=session_id,
        include_pending=bool(include_pending),
        flash=f"approve fact status={code}",
        detail=out,
        focus_kind=focus_kind,
        min_confidence=min_confidence,
        view=view,
    )


@app.post("/ui/facts/{fact_id}/reject", response_class=HTMLResponse)
def ui_fact_reject(
    fact_id: str,
    project: str = Form(...),
    session_id: str = Form(""),
    include_pending: int = Form(1),
    focus_kind: str = Form(""),
    min_confidence: float = Form(0.6),
    view: str = Form("html"),
) -> str:
    code, out = _fetch_json("POST", f"/facts/review/{fact_id}/reject", {"reviewer": "ui"})
    return _render_graph(
        project=project,
        session_id=session_id,
        include_pending=bool(include_pending),
        flash=f"reject fact status={code}",
        detail=out,
        focus_kind=focus_kind,
        min_confidence=min_confidence,
        view=view,
    )


@app.get("/ui/cracking", response_class=HTMLResponse)
def page_cracking(project: str = Query(default="demo"), view: str = Query(default="html")) -> str:
    return _render_cracking(project=project, view=view)


@app.post("/ui/cracking/plan", response_class=HTMLResponse)
def ui_cracking_plan(
    project: str = Form(...),
    target: str = Form(...),
    profile: str = Form("balanced"),
    view: str = Form("html"),
) -> str:
    code, out = _fetch_json(
        "POST",
        "/planner/commands",
        {"project": project, "target": target, "purpose": "cracking", "profile": profile, "discoveries": []},
    )
    return _render_cracking(
        project=project,
        flash=f"/planner/commands status={code}",
        detail=out,
        plan=out if code == 200 else None,
        view=view,
    )


@app.post("/ui/jobs/create", response_class=HTMLResponse)
def ui_jobs_create(
    project: str = Form(...),
    page: str = Form("recon"),
    session_id: str = Form(""),
    purpose: str = Form("recon"),
    profile: str = Form("balanced"),
    target: str = Form(""),
    plan_id: str = Form(""),
    timeout_sec: int = Form(120),
    cmd_json: str = Form(""),
    cmd_text: str = Form(""),
    view: str = Form("html"),
) -> str:
    cmd: list[str] = []
    if cmd_json.strip():
        try:
            raw = json.loads(cmd_json)
            if isinstance(raw, list):
                cmd = [str(x) for x in raw if str(x).strip()]
        except Exception:
            cmd = []
    if not cmd and cmd_text.strip():
        cmd = shlex.split(cmd_text.strip())

    if not cmd:
        if page == "cracking":
            return _render_cracking(project=project, flash="No command provided", view=view)
        if page == "proposals":
            return _render_proposals(project=project, flash="No command provided", view=view)
        return _render_recon(project=project, flash="No command provided", view=view)

    create_code, created = _fetch_json(
        "POST",
        "/jobs",
        {
            "project": project,
            "cmd": cmd,
            "timeout_sec": timeout_sec,
            "session_id": session_id or None,
            "purpose": purpose,
            "profile": profile,
            "target": target,
            "plan_id": plan_id,
            "auto_confirm": False,
        },
    )
    detail: Any = created
    flash = f"/jobs create status={create_code}"

    job_id = str(created.get("job_id", "")) if isinstance(created, dict) else ""
    if create_code == 200 and job_id:
        confirm_code, confirmed = _fetch_json("POST", f"/jobs/{job_id}/confirm", {})
        detail = {"create": created, "confirm": confirmed}
        flash = f"/jobs create={create_code} confirm={confirm_code}"

    if page == "cracking":
        return _render_cracking(project=project, flash=flash, detail=detail, view=view)
    if page == "proposals":
        return _render_proposals(project=project, flash=flash, detail=detail, view=view)
    return _render_recon(project=project, flash=flash, detail=detail, view=view)


@app.get("/ui/docs", response_class=HTMLResponse)
def page_docs(project: str = Query(default="demo"), view: str = Query(default="html")) -> str:
    return _render_docs(project=project, view=view)


@app.post("/ui/findings/create", response_class=HTMLResponse)
def ui_findings_create(
    project: str = Form(...),
    session_id: str = Form(""),
    title: str = Form(...),
    severity: str = Form("medium"),
    description: str = Form(""),
    view: str = Form("html"),
) -> str:
    code, out = _fetch_json(
        "POST",
        "/findings",
        {
            "project": project,
            "session_id": session_id or None,
            "title": title,
            "severity": severity,
            "status": "open",
            "description": description,
            "facts": [],
            "evidence": [],
        },
    )
    return _render_docs(project=project, flash=f"/findings status={code}", detail=out, view=view)


@app.post("/ui/evidence/upload", response_class=HTMLResponse)
async def ui_evidence_upload(
    project: str = Form(...),
    session_id: str = Form(""),
    finding_id: str = Form(""),
    report_section: str = Form(""),
    tags: str = Form(""),
    screenshot: UploadFile = File(...),
    view: str = Form("html"),
) -> str:
    content = await screenshot.read()
    code, out = _post_upload(
        "/evidence/upload",
        {
            "project": project,
            "session_id": session_id,
            "finding_id": finding_id,
            "report_section": report_section,
            "tags": tags,
        },
        file_name=screenshot.filename or "evidence.bin",
        content=content,
        content_type=screenshot.content_type or "application/octet-stream",
    )
    return _render_docs(project=project, flash=f"/evidence/upload status={code}", detail=out, view=view)


@app.get("/ui/sessions", response_class=HTMLResponse)
def page_sessions(
    project: str = Query(default="demo"),
    status: str = Query(default=""),
    operator: str = Query(default=""),
    q: str = Query(default=""),
    view: str = Query(default="html"),
) -> str:
    return _render_sessions(
        project=project,
        filters={"status": status, "operator": operator, "q": q},
        view=view,
    )


@app.post("/ui/sessions/timeline", response_class=HTMLResponse)
def ui_sessions_timeline(
    project: str = Form(...),
    session_id: str = Form(...),
    status: str = Form(default=""),
    operator: str = Form(default=""),
    q: str = Form(default=""),
    view: str = Form("html"),
) -> str:
    code, out = _fetch_json("GET", f"/sessions/{session_id}/timeline")
    return _render_sessions(
        project=project,
        flash=f"/sessions/{session_id}/timeline status={code}",
        detail=out,
        timeline=out,
        filters={"status": status, "operator": operator, "q": q},
        view=view,
    )


@app.post("/ui/exports/session", response_class=HTMLResponse)
def ui_export_session(project: str = Form(...), session_id: str = Form(...), view: str = Form("html")) -> str:
    code, out = _fetch_json(
        "POST",
        "/exports/session",
        {"project": project, "session_id": session_id, "include_pending_facts": True},
    )
    return _render_sessions(project=project, flash=f"/exports/session status={code}", detail=out, view=view)


@app.post("/ui/exports/project", response_class=HTMLResponse)
def ui_export_project(project: str = Form(...), view: str = Form("html")) -> str:
    code, out = _fetch_json("POST", "/exports/project", {"project": project, "include_pending_facts": True})
    return _render_sessions(project=project, flash=f"/exports/project status={code}", detail=out, view=view)


@app.post("/ui/session/start", response_class=HTMLResponse)
def ui_session_start(project: str = Form(...), operator: str = Form("unknown"), view: str = Form("html")) -> str:
    code, out = _fetch_json("POST", "/sessions/start", {"project": project, "operator": operator})
    return _render_sessions(project=project, flash=f"/sessions/start status={code}", detail=out, view=view)


@app.post("/ui/session/end", response_class=HTMLResponse)
def ui_session_end(project: str = Form(...), summary: str = Form(""), view: str = Form("html")) -> str:
    code, out = _fetch_json("POST", "/sessions/end", {"project": project, "summary": summary})
    return _render_sessions(project=project, flash=f"/sessions/end status={code}", detail=out, view=view)


@app.get("/ui/reports", response_class=HTMLResponse)
def page_reports(project: str = Query(default="demo"), view: str = Query(default="html")) -> str:
    return _render_reports(project=project, view=view)


@app.post("/ui/reports/generate", response_class=HTMLResponse)
def ui_reports_generate(project: str = Form(...), prompt: str = Form(...), view: str = Form("html")) -> str:
    code, out = _fetch_json("POST", "/route", {"project": project, "user_input": prompt})
    return _render_reports(project=project, flash=f"/route status={code}", detail=out, view=view)


def _run_cli() -> None:
    parser = argparse.ArgumentParser(description="Run AI Cyber Lab UI")
    parser.add_argument("--host", default=api_host())
    parser.add_argument("--port", type=int, default=ui_port())
    args = parser.parse_args()
    uvicorn.run("apps.ui.main:app", host=args.host, port=args.port, reload=False)


if __name__ == "__main__":
    _run_cli()
