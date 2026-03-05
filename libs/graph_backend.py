from __future__ import annotations

import json
import uuid
from functools import lru_cache
from typing import Any

from apps.orchestrator.config import (
    graph_backend,
    neo4j_database,
    neo4j_password,
    neo4j_uri,
    neo4j_user,
)
from libs.logs import get_logger

logger = get_logger(__name__)

try:
    from neo4j import GraphDatabase  # type: ignore
except Exception:  # pragma: no cover - optional dependency runtime
    GraphDatabase = None


def _normalize_node_id(kind: str, value: str) -> str:
    k = (kind or "unknown").strip().lower()
    v = (value or "").strip()
    return f"{k}:{v}" if v else ""


def _normalize_status(value: str) -> str:
    text = (value or "pending").strip().lower()
    if text in {"pending", "approved", "rejected"}:
        return text
    return "pending"


def _neo4j_backend_requested() -> bool:
    mode = graph_backend()
    if mode == "neo4j":
        return True
    if mode == "sqlite":
        return False
    return GraphDatabase is not None and bool(neo4j_uri())


def _neo4j_backend_enabled() -> bool:
    return _neo4j_backend_requested() and GraphDatabase is not None


@lru_cache(maxsize=1)
def _neo4j_driver() -> Any | None:
    if not _neo4j_backend_enabled():
        return None
    try:
        return GraphDatabase.driver(neo4j_uri(), auth=(neo4j_user(), neo4j_password()))
    except Exception as exc:  # pragma: no cover - network/runtime dependent
        logger.warning(
            "neo4j driver initialization failed",
            extra={
                "event": "neo4j_driver_failed",
                "details": {"error": str(exc), "uri": neo4j_uri()},
            },
        )
        return None


def graph_backend_status() -> dict[str, Any]:
    mode = graph_backend()
    selected = "neo4j" if _neo4j_backend_enabled() else "sqlite"
    return {
        "configured": mode,
        "selected": selected,
        "neo4j_available": GraphDatabase is not None,
        "neo4j_uri": neo4j_uri(),
        "neo4j_database": neo4j_database(),
    }


def _upsert_entity(tx: Any, payload: dict[str, Any]) -> None:
    tx.run(
        """
        MERGE (p:Project {name: $project})
        MERGE (n:Entity {project: $project, node_id: $node_id})
        ON CREATE SET n.created_utc = $created_utc
        SET n.kind = $kind,
            n.value = $value,
            n.updated_utc = $created_utc,
            n.source = $source,
            n.status = $status,
            n.confidence = $confidence,
            n.session_id = $session_id,
            n.job_id = $job_id,
            n.key_name = $key_name,
            n.details_json = $details_json
        MERGE (p)-[:HAS_ENTITY]->(n)
        """,
        payload,
    )

    if payload.get("session_id"):
        tx.run(
            """
            MERGE (p:Project {name: $project})
            MERGE (s:Session {project: $project, session_id: $session_id})
            ON CREATE SET s.created_utc = $created_utc
            SET s.updated_utc = $created_utc
            MERGE (p)-[:HAS_SESSION]->(s)
            WITH s
            MATCH (n:Entity {project: $project, node_id: $node_id})
            MERGE (s)-[:HAS_ENTITY]->(n)
            """,
            payload,
        )


def _upsert_relation(tx: Any, payload: dict[str, Any]) -> None:
    tx.run(
        """
        MERGE (p:Project {name: $project})
        MERGE (s:Entity {project: $project, node_id: $subject_node_id})
        ON CREATE SET s.created_utc = $created_utc
        SET s.kind = $subject_type,
            s.value = $subject_value,
            s.updated_utc = $created_utc,
            s.status = $status,
            s.confidence = $confidence,
            s.session_id = $session_id,
            s.job_id = $job_id
        MERGE (o:Entity {project: $project, node_id: $object_node_id})
        ON CREATE SET o.created_utc = $created_utc
        SET o.kind = $object_type,
            o.value = $object_value,
            o.updated_utc = $created_utc,
            o.status = $status,
            o.confidence = $confidence,
            o.session_id = $session_id,
            o.job_id = $job_id
        MERGE (p)-[:HAS_ENTITY]->(s)
        MERGE (p)-[:HAS_ENTITY]->(o)
        MERGE (s)-[r:RELATED {fact_id: $fact_id}]->(o)
        SET r.label = $relation,
            r.status = $status,
            r.confidence = $confidence,
            r.source = $source,
            r.created_utc = $created_utc,
            r.session_id = $session_id,
            r.job_id = $job_id,
            r.key_name = $key_name,
            r.value = $value,
            r.details_json = $details_json
        """,
        payload,
    )

    if payload.get("session_id"):
        tx.run(
            """
            MERGE (p:Project {name: $project})
            MERGE (sess:Session {project: $project, session_id: $session_id})
            ON CREATE SET sess.created_utc = $created_utc
            SET sess.updated_utc = $created_utc
            MERGE (p)-[:HAS_SESSION]->(sess)
            WITH sess
            MATCH (s:Entity {project: $project, node_id: $subject_node_id})
            MATCH (o:Entity {project: $project, node_id: $object_node_id})
            MERGE (sess)-[:HAS_ENTITY]->(s)
            MERGE (sess)-[:HAS_ENTITY]->(o)
            """,
            payload,
        )


def sync_facts_to_graph(facts: list[dict[str, Any]]) -> dict[str, Any]:
    if not facts:
        return {"backend": graph_backend_status()["selected"], "processed": 0, "synced": 0}

    if not _neo4j_backend_enabled():
        return {"backend": "sqlite", "processed": len(facts), "synced": 0}

    driver = _neo4j_driver()
    if driver is None:
        return {"backend": "sqlite", "processed": len(facts), "synced": 0, "error": "neo4j unavailable"}

    synced = 0
    try:
        with driver.session(database=neo4j_database()) as session:
            for raw in facts:
                subject_type = str(raw.get("subject_type") or raw.get("entity_type") or "unknown")
                subject_value = str(raw.get("subject_value") or raw.get("value") or "")
                object_type = str(raw.get("object_type") or "")
                object_value = str(raw.get("object_value") or "")
                relation = str(raw.get("relation") or "related_to")
                status = _normalize_status(str(raw.get("status") or "pending"))

                payload = {
                    "project": str(raw.get("project", "default")),
                    "session_id": str(raw.get("session_id") or ""),
                    "job_id": str(raw.get("job_id") or ""),
                    "source": str(raw.get("source") or "job"),
                    "fact_id": str(raw.get("fact_id") or uuid.uuid4().hex),
                    "key_name": str(raw.get("key_name") or ""),
                    "value": str(raw.get("value") or ""),
                    "status": status,
                    "confidence": float(raw.get("confidence") or 0.5),
                    "created_utc": str(raw.get("created_utc") or ""),
                    "details_json": json.dumps(raw.get("details") or {}, ensure_ascii=True),
                    "kind": subject_type.strip().lower() or "unknown",
                    "node_id": _normalize_node_id(subject_type, subject_value),
                    "subject_type": subject_type.strip().lower() or "unknown",
                    "subject_value": subject_value,
                    "relation": relation.strip().lower() or "related_to",
                    "object_type": object_type.strip().lower(),
                    "object_value": object_value,
                    "subject_node_id": _normalize_node_id(subject_type, subject_value),
                    "object_node_id": _normalize_node_id(object_type, object_value),
                }

                if not payload["subject_node_id"]:
                    continue

                kind = str(raw.get("fact_kind") or "entity").strip().lower()
                if kind == "relation" and payload["object_node_id"]:
                    session.execute_write(_upsert_relation, payload)
                else:
                    session.execute_write(_upsert_entity, payload)
                synced += 1
    except Exception as exc:  # pragma: no cover - runtime network dependent
        logger.warning(
            "neo4j fact sync failed",
            extra={
                "event": "neo4j_sync_failed",
                "details": {"error": str(exc), "facts": len(facts)},
            },
        )
        return {
            "backend": "sqlite",
            "processed": len(facts),
            "synced": synced,
            "error": str(exc),
        }

    return {"backend": "neo4j", "processed": len(facts), "synced": synced}


def _sqlite_graph(
    project: str,
    *,
    session_id: str | None,
    include_pending: bool,
    limit: int,
) -> dict[str, Any]:
    from libs.workbench_db import build_graph

    out = build_graph(project, session_id=session_id, include_pending=include_pending, limit=limit)
    out.setdefault("backend", "sqlite")
    return out


def _node_meta(node: Any) -> dict[str, Any]:
    props = dict(node)
    details_raw = props.get("details_json")
    details: dict[str, Any] = {}
    if isinstance(details_raw, str) and details_raw:
        try:
            details = json.loads(details_raw)
        except Exception:
            details = {"raw": details_raw}
    return {
        "status": props.get("status", "pending"),
        "source": props.get("source", ""),
        "confidence": props.get("confidence", 0.5),
        "session_id": props.get("session_id", ""),
        "job_id": props.get("job_id", ""),
        "details": details,
        "key_name": props.get("key_name", ""),
        "value": props.get("value", ""),
        "fact_id": props.get("fact_id", ""),
    }


def _edge_meta(rel: Any) -> dict[str, Any]:
    props = dict(rel)
    details_raw = props.get("details_json")
    details: dict[str, Any] = {}
    if isinstance(details_raw, str) and details_raw:
        try:
            details = json.loads(details_raw)
        except Exception:
            details = {"raw": details_raw}
    return {
        "status": props.get("status", "pending"),
        "source": props.get("source", ""),
        "confidence": props.get("confidence", 0.5),
        "session_id": props.get("session_id", ""),
        "job_id": props.get("job_id", ""),
        "details": details,
        "key_name": props.get("key_name", ""),
        "value": props.get("value", ""),
        "fact_id": props.get("fact_id", ""),
    }


def _neo4j_graph(
    project: str,
    *,
    session_id: str | None,
    include_pending: bool,
    limit: int,
) -> dict[str, Any]:
    driver = _neo4j_driver()
    if driver is None:
        return _sqlite_graph(project, session_id=session_id, include_pending=include_pending, limit=limit)

    sid = session_id or ""
    node_map: dict[str, dict[str, Any]] = {}
    edge_map: dict[str, dict[str, Any]] = {}

    try:
        with driver.session(database=neo4j_database()) as session:
            edge_rows = session.run(
                """
                MATCH (s:Entity {project: $project})-[r:RELATED]->(o:Entity {project: $project})
                WHERE ($include_pending OR coalesce(r.status, 'pending') = 'approved')
                  AND ($session_id = '' OR coalesce(r.session_id, '') = $session_id)
                RETURN s, r, o
                LIMIT $limit
                """,
                project=project,
                include_pending=include_pending,
                session_id=sid,
                limit=limit,
            )

            for row in edge_rows:
                s = row["s"]
                r = row["r"]
                o = row["o"]

                s_props = dict(s)
                o_props = dict(o)
                r_props = dict(r)

                src_id = str(s_props.get("node_id") or _normalize_node_id(s_props.get("kind", ""), s_props.get("value", "")))
                dst_id = str(o_props.get("node_id") or _normalize_node_id(o_props.get("kind", ""), o_props.get("value", "")))
                if not src_id or not dst_id:
                    continue

                node_map[src_id] = {
                    "id": src_id,
                    "label": str(s_props.get("value", "")),
                    "kind": str(s_props.get("kind", "unknown")),
                    "meta": _node_meta(s),
                }
                node_map[dst_id] = {
                    "id": dst_id,
                    "label": str(o_props.get("value", "")),
                    "kind": str(o_props.get("kind", "unknown")),
                    "meta": _node_meta(o),
                }

                edge_id = str(r_props.get("fact_id") or uuid.uuid4().hex)
                edge_map[edge_id] = {
                    "id": edge_id,
                    "source": src_id,
                    "target": dst_id,
                    "label": str(r_props.get("label") or "related_to"),
                    "meta": _edge_meta(r),
                }

            node_rows = session.run(
                """
                MATCH (n:Entity {project: $project})
                WHERE ($include_pending OR coalesce(n.status, 'pending') = 'approved')
                  AND ($session_id = '' OR coalesce(n.session_id, '') = $session_id)
                RETURN n
                LIMIT $limit
                """,
                project=project,
                include_pending=include_pending,
                session_id=sid,
                limit=limit,
            )

            for row in node_rows:
                n = row["n"]
                n_props = dict(n)
                node_id = str(n_props.get("node_id") or _normalize_node_id(n_props.get("kind", ""), n_props.get("value", "")))
                if not node_id:
                    continue
                if node_id in node_map:
                    continue
                node_map[node_id] = {
                    "id": node_id,
                    "label": str(n_props.get("value", "")),
                    "kind": str(n_props.get("kind", "unknown")),
                    "meta": _node_meta(n),
                }
    except Exception as exc:  # pragma: no cover - runtime network dependent
        logger.warning(
            "neo4j graph read failed, using sqlite",
            extra={"event": "neo4j_graph_read_failed", "details": {"error": str(exc)}},
        )
        return _sqlite_graph(project, session_id=session_id, include_pending=include_pending, limit=limit)

    return {
        "project": project,
        "session_id": session_id,
        "include_pending": include_pending,
        "backend": "neo4j",
        "nodes": list(node_map.values()),
        "edges": list(edge_map.values()),
        "stats": {
            "nodes": len(node_map),
            "edges": len(edge_map),
            "facts": len(edge_map) + len(node_map),
        },
    }


def build_graph_data(
    project: str,
    *,
    session_id: str | None = None,
    include_pending: bool = False,
    limit: int = 5000,
) -> dict[str, Any]:
    if _neo4j_backend_enabled():
        return _neo4j_graph(project, session_id=session_id, include_pending=include_pending, limit=limit)
    return _sqlite_graph(project, session_id=session_id, include_pending=include_pending, limit=limit)


def query_graph_data(
    project: str,
    *,
    q: str,
    session_id: str | None = None,
    include_pending: bool = True,
    limit: int = 5000,
    max_matches: int = 60,
) -> dict[str, Any]:
    query = q.strip().lower()
    graph = build_graph_data(project, session_id=session_id, include_pending=include_pending, limit=limit)
    nodes = graph.get("nodes", []) if isinstance(graph.get("nodes"), list) else []
    edges = graph.get("edges", []) if isinstance(graph.get("edges"), list) else []

    if not query:
        return {
            "project": project,
            "query": q,
            "matches": [],
            "nodes": [],
            "edges": [],
            "stats": {"nodes": 0, "edges": 0, "matches": 0},
            "backend": graph.get("backend", "sqlite"),
        }

    match_ids = []
    for n in nodes:
        text = " ".join([
            str(n.get("id", "")),
            str(n.get("label", "")),
            str(n.get("kind", "")),
        ]).lower()
        if query in text:
            match_ids.append(str(n.get("id", "")))
        if len(match_ids) >= max_matches:
            break

    keep_nodes: set[str] = set(match_ids)
    keep_edges: list[dict[str, Any]] = []
    for e in edges:
        src = str(e.get("source", ""))
        dst = str(e.get("target", ""))
        if src in keep_nodes or dst in keep_nodes:
            keep_edges.append(e)
            keep_nodes.add(src)
            keep_nodes.add(dst)

    node_map = {str(n.get("id", "")): n for n in nodes}
    filtered_nodes = [node_map[nid] for nid in keep_nodes if nid in node_map]

    return {
        "project": project,
        "query": q,
        "matches": match_ids,
        "nodes": filtered_nodes,
        "edges": keep_edges,
        "stats": {
            "nodes": len(filtered_nodes),
            "edges": len(keep_edges),
            "matches": len(match_ids),
        },
        "backend": graph.get("backend", "sqlite"),
    }


def subgraph_data(
    project: str,
    *,
    root: str,
    depth: int = 2,
    session_id: str | None = None,
    include_pending: bool = True,
    limit: int = 5000,
) -> dict[str, Any]:
    graph = build_graph_data(project, session_id=session_id, include_pending=include_pending, limit=limit)
    nodes = graph.get("nodes", []) if isinstance(graph.get("nodes"), list) else []
    edges = graph.get("edges", []) if isinstance(graph.get("edges"), list) else []

    root_text = root.strip().lower()
    if not root_text:
        return {
            "project": project,
            "root": root,
            "depth": depth,
            "nodes": [],
            "edges": [],
            "stats": {"nodes": 0, "edges": 0, "roots": 0},
            "backend": graph.get("backend", "sqlite"),
        }

    root_ids = [
        str(n.get("id", ""))
        for n in nodes
        if root_text in str(n.get("id", "")).lower() or root_text in str(n.get("label", "")).lower()
    ]

    adj: dict[str, set[tuple[str, str]]] = {}
    edge_by_id: dict[str, dict[str, Any]] = {}
    for e in edges:
        edge_id = str(e.get("id", uuid.uuid4().hex))
        src = str(e.get("source", ""))
        dst = str(e.get("target", ""))
        edge_by_id[edge_id] = e
        adj.setdefault(src, set()).add((dst, edge_id))
        adj.setdefault(dst, set()).add((src, edge_id))

    visited_nodes: set[str] = set(root_ids)
    visited_edges: set[str] = set()
    frontier: set[str] = set(root_ids)

    for _ in range(max(0, min(depth, 5))):
        next_frontier: set[str] = set()
        for node_id in frontier:
            for neighbor, edge_id in adj.get(node_id, set()):
                visited_edges.add(edge_id)
                if neighbor not in visited_nodes:
                    visited_nodes.add(neighbor)
                    next_frontier.add(neighbor)
        if not next_frontier:
            break
        frontier = next_frontier

    node_map = {str(n.get("id", "")): n for n in nodes}
    filtered_nodes = [node_map[nid] for nid in visited_nodes if nid in node_map]
    filtered_edges = [edge_by_id[eid] for eid in visited_edges if eid in edge_by_id]

    return {
        "project": project,
        "root": root,
        "depth": depth,
        "root_ids": root_ids,
        "nodes": filtered_nodes,
        "edges": filtered_edges,
        "stats": {
            "nodes": len(filtered_nodes),
            "edges": len(filtered_edges),
            "roots": len(root_ids),
        },
        "backend": graph.get("backend", "sqlite"),
    }


def graph_timeline_data(
    project: str,
    *,
    session_id: str | None = None,
    include_pending: bool = True,
    limit: int = 500,
) -> dict[str, Any]:
    from libs.workbench_db import list_facts

    status = None if include_pending else "approved"
    facts = list_facts(project, limit=limit, status=status, session_id=session_id)

    events: list[dict[str, Any]] = []
    for item in facts:
        kind = str(item.get("fact_kind", "entity"))
        if kind == "relation":
            title = (
                f"{item.get('subject_type','')}:{item.get('subject_value','')}"
                f" -[{item.get('relation','')}]-> "
                f"{item.get('object_type','')}:{item.get('object_value','')}"
            )
        else:
            title = f"{item.get('subject_type','')}:{item.get('subject_value','')}"

        events.append(
            {
                "timestamp": item.get("created_utc", ""),
                "type": "fact",
                "title": title,
                "data": {
                    "fact_id": item.get("fact_id"),
                    "status": item.get("status"),
                    "confidence": item.get("confidence"),
                    "source": item.get("source"),
                    "job_id": item.get("job_id"),
                    "session_id": item.get("session_id"),
                },
            }
        )

    events.sort(key=lambda x: str(x.get("timestamp", "")))
    return {
        "project": project,
        "session_id": session_id,
        "include_pending": include_pending,
        "count": len(events),
        "events": events,
        "backend": graph_backend_status().get("selected", "sqlite"),
    }
