from __future__ import annotations

import os
import re
from typing import Any, Literal, TypedDict

import httpx

from apps.agents.knowledge_agent import handle_knowledge
from apps.agents.pentest_agent import handle_pentest
from apps.agents.report_agent import handle_report
from apps.agents.research_agent import handle_research
from apps.agents.study_agent import handle_study
from apps.orchestrator.config import default_project, ollama_router_model, ollama_url, use_llm_router
from libs.logs import get_logger
from libs.trace import trace_event

logger = get_logger(__name__)

Route = Literal["study", "pentest", "report", "knowledge", "research"]


class OrchestratorState(TypedDict, total=False):
    user_input: str
    project: str
    route: Route
    context: dict[str, Any]
    result: str


KEYWORDS: dict[Route, tuple[str, ...]] = {
    "study": ("ccna", "cpts", "portswigger", "study", "flashcard", "revision", "cert"),
    "pentest": (
        "nmap",
        "enum",
        "recon",
        "ctf",
        "exploit",
        "privesc",
        "burp",
        "target",
    ),
    "report": ("report", "writeup", "finding", "executive summary", "markdown"),
    "knowledge": ("remember", "knowledge", "store", "retrieve", "rag", "search notes"),
    "research": ("research", "compare", "explain", "reference", "latest"),
}


def _keyword_route(user_input: str) -> Route:
    text = user_input.lower()
    for route, keys in KEYWORDS.items():
        if any(k in text for k in keys):
            return route
    return "research"


def _extract_label(response_text: str) -> Route:
    cleaned = re.sub(r"[^a-z]", "", response_text.lower())
    for route in ("study", "pentest", "report", "knowledge", "research"):
        if route in cleaned:
            return route
    return "research"


def _llm_route(user_input: str) -> Route:
    prompt = (
        "Classify the request into exactly one label: "
        "study|pentest|report|knowledge|research. "
        "Return only the label. Request: "
        f"{user_input}"
    )

    try:
        with httpx.Client(timeout=8.0) as client:
            response = client.post(
                f"{ollama_url().rstrip('/')}/api/generate",
                json={"model": ollama_router_model(), "prompt": prompt, "stream": False},
            )
            response.raise_for_status()
            data = response.json()
            route = _extract_label(data.get("response", ""))
            logger.info(
                "llm route selected",
                extra={"event": "llm_route", "details": {"route": route}},
            )
            return route
    except Exception as exc:
        logger.warning(
            "llm route failed, using keyword route",
            extra={"event": "llm_route_fallback", "details": {"error": str(exc)}},
        )
        return _keyword_route(user_input)


def _router_node(state: OrchestratorState) -> OrchestratorState:
    if use_llm_router():
        route = _llm_route(state["user_input"])
        mode = "llm"
    else:
        route = _keyword_route(state["user_input"])
        mode = "keyword"
    logger.info(
        "router selected route",
        extra={
            "event": "router_selected",
            "details": {"route": route, "mode": mode, "project": state.get("project", "default")},
        },
    )
    trace_event(
        "router_selected",
        input_text=state.get("user_input", ""),
        metadata={"route": route, "project": state.get("project", "default")},
    )
    return {"route": route}


def _study_node(state: OrchestratorState) -> OrchestratorState:
    result = handle_study(state["user_input"], project=state["project"])
    return {"result": result}


def _pentest_node(state: OrchestratorState) -> OrchestratorState:
    result = handle_pentest(state["user_input"], project=state["project"])
    return {"result": result}


def _report_node(state: OrchestratorState) -> OrchestratorState:
    result = handle_report(state["user_input"], project=state["project"])
    return {"result": result}


def _knowledge_node(state: OrchestratorState) -> OrchestratorState:
    result = handle_knowledge(state["user_input"], project=state["project"])
    return {"result": result}


def _research_node(state: OrchestratorState) -> OrchestratorState:
    result = handle_research(state["user_input"], project=state["project"])
    return {"result": result}


def _route_decider(state: OrchestratorState) -> Route:
    return state.get("route", "research")


def _dispatch(route: Route, state: OrchestratorState) -> OrchestratorState:
    if route == "study":
        return _study_node(state)
    if route == "pentest":
        return _pentest_node(state)
    if route == "report":
        return _report_node(state)
    if route == "knowledge":
        return _knowledge_node(state)
    return _research_node(state)


def _build_graph() -> Any:
    if os.getenv("AICL_USE_LANGGRAPH", "false").lower() != "true":
        logger.info("langgraph disabled", extra={"event": "langgraph_disabled"})
        return None

    try:
        from langgraph.graph import END, StateGraph
    except Exception:
        logger.warning("langgraph import failed", extra={"event": "langgraph_import_failed"})
        return None

    builder = StateGraph(OrchestratorState)
    builder.add_node("router", _router_node)
    builder.add_node("study", _study_node)
    builder.add_node("pentest", _pentest_node)
    builder.add_node("report", _report_node)
    builder.add_node("knowledge", _knowledge_node)
    builder.add_node("research", _research_node)

    builder.set_entry_point("router")
    builder.add_conditional_edges(
        "router",
        _route_decider,
        {
            "study": "study",
            "pentest": "pentest",
            "report": "report",
            "knowledge": "knowledge",
            "research": "research",
        },
    )

    builder.add_edge("study", END)
    builder.add_edge("pentest", END)
    builder.add_edge("report", END)
    builder.add_edge("knowledge", END)
    builder.add_edge("research", END)

    return builder.compile()


GRAPH = _build_graph()


def run_orchestrator(user_input: str, project: str | None = None) -> dict[str, Any]:
    state: OrchestratorState = {
        "user_input": user_input,
        "project": project or default_project(),
        "context": {},
    }
    if GRAPH is not None:
        logger.info("running with langgraph", extra={"event": "orchestrator_mode_langgraph"})
        final_state = GRAPH.invoke(state)
    else:
        logger.info("running with direct dispatch", extra={"event": "orchestrator_mode_direct"})
        routed = _router_node(state)
        state.update(routed)
        state.update(_dispatch(state["route"], state))
        final_state = state

    return {
        "project": state["project"],
        "route": final_state.get("route", "research"),
        "result": final_state.get("result", ""),
    }
