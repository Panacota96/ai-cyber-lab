from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def data_root() -> Path:
    return Path(os.getenv("AICL_DATA_ROOT", "./data")).resolve()


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def schema_root() -> Path:
    return Path(os.getenv("AICL_SCHEMA_ROOT", str(repo_root() / "automation" / "schemas"))).resolve()


def validate_notes() -> bool:
    return os.getenv("AICL_VALIDATE_NOTES", "true").lower() == "true"


def session_log_dir() -> Path:
    default_dir = data_root() / "projects" / "_logs"
    return Path(os.getenv("AICL_SESSION_LOG_DIR", str(default_dir))).resolve()


def session_log_compress_after_days() -> int:
    return int(os.getenv("AICL_SESSION_LOG_COMPRESS_AFTER_DAYS", "1"))


def session_log_retention_days() -> int:
    return int(os.getenv("AICL_SESSION_LOG_RETENTION_DAYS", "30"))


def default_project() -> str:
    return os.getenv("AICL_PROJECT", "default")


def qdrant_url() -> str:
    return os.getenv("AICL_QDRANT_URL", "http://localhost:6333")


def qdrant_collection() -> str:
    return os.getenv("AICL_QDRANT_COLLECTION", "aicl_knowledge")


def vector_size() -> int:
    return int(os.getenv("AICL_VECTOR_SIZE", "256"))


def ollama_url() -> str:
    return os.getenv("AICL_OLLAMA_URL", "http://localhost:11434")


def ollama_model() -> str:
    return os.getenv("AICL_OLLAMA_MODEL", "llama3.1:8b")


def ollama_embed_model() -> str:
    return os.getenv("AICL_OLLAMA_EMBED_MODEL", "nomic-embed-text")


def api_host() -> str:
    return os.getenv("AICL_API_HOST", "0.0.0.0")


def api_port() -> int:
    return int(os.getenv("AICL_API_PORT", "8080"))


def log_dir() -> Path:
    default_logs = "/mnt/c/Users/david/OneDrive - Pontificia Universidad Javeriana/Documents/GitHub/ai-cyber-lab/logs"
    return Path(os.getenv("AICL_LOG_DIR", default_logs)).resolve()


def log_file() -> str:
    return os.getenv("AICL_LOG_FILE", "aicl.log")


def log_path() -> Path:
    return log_dir() / log_file()


def log_max_bytes() -> int:
    return int(os.getenv("AICL_LOG_MAX_BYTES", str(1024 * 1024)))


def log_level() -> str:
    return os.getenv("AICL_LOG_LEVEL", "INFO")


def ffuf_wordlist() -> str:
    return os.getenv("AICL_FFUF_WORDLIST", "").strip()


def enable_langfuse() -> bool:
    return os.getenv("AICL_ENABLE_LANGFUSE", "false").lower() == "true"


def use_llm_router() -> bool:
    return os.getenv("AICL_USE_LLM_ROUTER", "false").lower() == "true"


def exec_backend() -> str:
    return os.getenv("AICL_EXEC_BACKEND", "host").strip().lower()


def tool_exec_url() -> str:
    return os.getenv("AICL_TOOL_EXEC_URL", "http://127.0.0.1:8082")


def tool_exec_timeout_s() -> float:
    return float(os.getenv("AICL_TOOL_EXEC_TIMEOUT_SEC", "8"))


def tools_core_container() -> str:
    return os.getenv("AICL_DOCKER_TOOLS_CONTAINER", "aicl-tools-core")


def py2_container() -> str:
    return os.getenv("AICL_DOCKER_PY2_CONTAINER", "aicl-py2-runner")


def py3_container() -> str:
    return os.getenv("AICL_DOCKER_PY3_CONTAINER", "aicl-py3-runner")


def exegol_container() -> str:
    return os.getenv("AICL_DOCKER_EXEGOL_CONTAINER", "aicl-exegol")


def ui_enabled() -> bool:
    return os.getenv("AICL_UI_ENABLED", "true").lower() == "true"


def ui_port() -> int:
    return int(os.getenv("AICL_UI_PORT", "8091"))


def orchestrator_url() -> str:
    return os.getenv("AICL_ORCHESTRATOR_URL", f"http://127.0.0.1:{api_port()}")
