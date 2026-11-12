# -*- coding: utf-8 -*-
"""
Antigravity Path, Conversation DB & Language Server Discovery Helpers
Supports both Antigravity 2.0 (~/.gemini/antigravity, language_server.exe, conversation_summaries.db)
and legacy Antigravity IDE (~/.gemini/antigravity-ide, language_server_windows_x64.exe).
"""

import os
import sys
import re
import json
import time
import sqlite3
import subprocess
import threading
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

USER_HOME = os.path.expanduser("~")
LOCAL_APP_DATA = os.environ.get("LOCALAPPDATA", os.path.join(USER_HOME, "AppData", "Local"))

# Environment variables injected inside an active Antigravity agent shell/subshell.
# Leaving them in child agentapi calls causes cross-workspace PermissionDenied errors.
AGENT_CONTEXT_ENV_VARS = (
    "ANTIGRAVITY_AGENT",
    "ANTIGRAVITY_CONVERSATION_ID",
    "ANTIGRAVITY_PROJECT_ID",
    "ANTIGRAVITY_TRAJECTORY_ID",
    "ANTIGRAVITY_SOURCE_METADATA",
)

_cached_ls_env: Dict[str, Any] = {"addr": None, "token": None, "time": 0.0}
_ls_env_lock = threading.Lock()


def sanitize_agent_env(base_env: Optional[Dict[str, str]] = None, clear_ls_overrides: bool = False) -> Dict[str, str]:
    """Return an environment dictionary stripped of caller agent session/project context vars."""
    env = dict(base_env) if base_env is not None else os.environ.copy()
    for var in AGENT_CONTEXT_ENV_VARS:
        env.pop(var, None)
    if clear_ls_overrides:
        env.pop("ANTIGRAVITY_LS_ADDRESS", None)
        env.pop("ANTIGRAVITY_CSRF_TOKEN", None)
    return env


def build_clean_agentapi_env(addr: Optional[str] = None, token: Optional[str] = None) -> Dict[str, str]:
    """Build a clean environment for `agentapi` CLI invocations targeting any workspace."""
    env = sanitize_agent_env(clear_ls_overrides=False)
    if addr:
        env["ANTIGRAVITY_LS_ADDRESS"] = addr
    else:
        env.pop("ANTIGRAVITY_LS_ADDRESS", None)
    if token:
        env["ANTIGRAVITY_CSRF_TOKEN"] = token
    else:
        env.pop("ANTIGRAVITY_CSRF_TOKEN", None)
    return env


def resolve_app_data_dir() -> str:
    env_dir = os.environ.get("ANTIGRAVITY_APP_DATA_DIR", "").strip()
    candidates: List[str] = []
    if env_dir:
        candidates.append(os.path.normpath(env_dir))
    candidates.extend([
        os.path.join(USER_HOME, ".gemini", "antigravity"),
        os.path.join(USER_HOME, ".gemini", "antigravity-ide"),
    ])
    for c in candidates:
        if os.path.exists(os.path.join(c, "conversation_summaries.db")):
            return c
    for c in candidates:
        b = os.path.join(c, "brain")
        if os.path.isdir(b):
            try:
                if any(
                    os.path.exists(os.path.join(b, e, ".system_generated", "logs", "transcript.jsonl"))
                    for e in os.listdir(b)
                ):
                    return c
            except Exception:
                pass
    for c in candidates:
        if os.path.isdir(c):
            return c
    return candidates[0]


def resolve_brain_dir() -> str:
    env_dir = os.environ.get("ANTIGRAVITY_APP_DATA_DIR", "").strip()
    candidates: List[str] = []
    if env_dir:
        candidates.append(os.path.join(os.path.normpath(env_dir), "brain"))
    candidates.extend([
        os.path.join(USER_HOME, ".gemini", "antigravity", "brain"),
        os.path.join(USER_HOME, ".gemini", "antigravity-ide", "brain"),
    ])
    for c in candidates:
        if os.path.isdir(c):
            try:
                if any(
                    os.path.exists(os.path.join(c, e, ".system_generated", "logs", "transcript.jsonl"))
                    for e in os.listdir(c)
                ):
                    return c
            except Exception:
                pass
    for c in candidates:
        if os.path.isdir(c):
            return c
    return candidates[0]


def resolve_summaries_db() -> str:
    app_dir = resolve_app_data_dir()
    primary = os.path.join(app_dir, "conversation_summaries.db")
    if os.path.exists(primary):
        return primary
    for base in (
        os.path.join(USER_HOME, ".gemini", "antigravity"),
        os.path.join(USER_HOME, ".gemini", "antigravity-ide"),
    ):
        p = os.path.join(base, "conversation_summaries.db")
        if os.path.exists(p):
            return p
    return primary


def resolve_ls_exe() -> str:
    candidates = [
        os.path.join(LOCAL_APP_DATA, "Programs", "antigravity", "resources", "bin", "language_server.exe"),
        os.path.join(LOCAL_APP_DATA, "Programs", "Antigravity IDE", "resources", "app", "extensions", "antigravity", "bin", "language_server_windows_x64.exe"),
        r"D:\Program Files\Antigravity IDE\resources\app\extensions\antigravity\bin\language_server_windows_x64.exe",
        r"C:\Program Files\Antigravity IDE\resources\app\extensions\antigravity\bin\language_server_windows_x64.exe",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return candidates[0]


def resolve_agentapi_bat() -> str:
    candidates = [
        os.path.join(USER_HOME, ".gemini", "antigravity", "bin", "agentapi.bat"),
        os.path.join(USER_HOME, ".gemini", "antigravity-ide", "bin", "agentapi.bat"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return candidates[0]


def parse_workspace_uris(raw_uris: Any) -> Tuple[str, List[str]]:
    """Convert Antigravity workspace_uris JSON/list into readable paths like D:/HydroDisturb-Bench."""
    uris: List[str] = []
    if isinstance(raw_uris, list):
        uris = [str(u) for u in raw_uris if u]
    elif isinstance(raw_uris, str) and raw_uris.strip():
        s = raw_uris.strip()
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                uris = [str(u) for u in parsed if u]
            elif isinstance(parsed, str):
                uris = [parsed]
        except Exception:
            uris = [s]

    cleaned: List[str] = []
    for u in uris:
        txt = urllib.parse.unquote(u).strip()
        if txt.startswith("file:///"):
            txt = txt[8:]
        elif txt.startswith("file://"):
            txt = txt[7:]
        # Normalize Windows drive letter to uppercase e.g. e:/ -> E:/
        if len(txt) >= 2 and txt[1] == ":" and txt[0].isalpha():
            txt = txt[0].upper() + txt[1:]
        if txt and txt not in cleaned:
            cleaned.append(txt)

    primary = cleaned[0] if cleaned else ""
    return primary, cleaned


def parse_iso_timestamp(ts_str: Optional[str]) -> float:
    """Parse timestamps such as '2026-11-12 06:01:02.2707128+00:00' into Unix epoch seconds (Python 3.8 safe)."""
    if not ts_str or not isinstance(ts_str, str):
        return 0.0
    s = ts_str.strip()
    if not s:
        return 0.0
    try:
        s = s.replace("T", " ")
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        # Truncate >6 fractional digits to 6 digits for Python 3.8 datetime.fromisoformat
        m = re.match(r"^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})(?:\.(\d+))?([+-]\d{2}:?\d{2})?$", s)
        if m:
            base, frac, tz = m.group(1), m.group(2), m.group(3)
            norm = base
            if frac:
                norm += "." + (frac[:6].ljust(6, "0"))
            if tz:
                if len(tz) == 5 and ":" not in tz:
                    tz = tz[:3] + ":" + tz[3:]
                norm += tz
            dt = datetime.fromisoformat(norm)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.timestamp()
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return 0.0


def _row_to_summary_dict(row: sqlite3.Row) -> Dict[str, Any]:
    d = dict(row)
    cid = str(d.get("conversation_id") or "").strip()
    title = str(d.get("title") or "").strip()
    preview = str(d.get("preview") or "").strip()
    agent_name = str(d.get("agent_name") or "").strip()
    parent_id = str(d.get("parent_conversation_id") or "").strip()
    nesting_depth = int(d.get("nesting_depth") or 0)
    not_fully_idle = bool(d.get("not_fully_idle") or 0)
    killed = bool(d.get("killed") or 0)
    db_status = str(d.get("status") or "").strip()
    step_count = int(d.get("step_count") or 0)
    project_id = str(d.get("project_id") or "").strip()
    workspace, workspaces = parse_workspace_uris(d.get("workspace_uris"))
    mtime = parse_iso_timestamp(d.get("last_modified_time"))
    is_subagent = (nesting_depth > 0) or bool(parent_id) or bool(agent_name)

    return {
        "id": cid,
        "title": title,
        "preview": preview,
        "step_count": step_count,
        "mtime": mtime,
        "mtime_str": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(mtime)) if mtime > 0 else "",
        "workspace": workspace,
        "workspaces": workspaces,
        "status": db_status,
        "project_id": project_id,
        "agent_name": agent_name,
        "parent_conversation_id": parent_id,
        "nesting_depth": nesting_depth,
        "not_fully_idle": not_fully_idle,
        "killed": killed,
        "is_subagent": is_subagent,
    }


def load_conversation_summaries(db_path: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    """Read Antigravity 2.0 conversation_summaries.db safely in read-only mode."""
    target_db = db_path or resolve_summaries_db()
    if not target_db or not os.path.exists(target_db):
        return {}
    conn = None
    try:
        db_uri = Path(target_db).resolve().as_uri() + "?mode=ro"
        conn = sqlite3.connect(db_uri, uri=True, timeout=1.5)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT conversation_id, title, preview, step_count, last_modified_time,
                   workspace_uris, status, project_id, agent_name,
                   parent_conversation_id, nesting_depth, not_fully_idle, killed
            FROM conversation_summaries
            """
        ).fetchall()
        result: Dict[str, Dict[str, Any]] = {}
        for r in rows:
            item = _row_to_summary_dict(r)
            if item["id"]:
                result[item["id"]] = item
        return result
    except Exception:
        return {}
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def get_conversation_summary(conv_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Read a single conversation row from conversation_summaries.db in read-only mode."""
    cid = (conv_id or "").strip()
    if not cid:
        return None
    target_db = db_path or resolve_summaries_db()
    if not target_db or not os.path.exists(target_db):
        return None
    conn = None
    try:
        db_uri = Path(target_db).resolve().as_uri() + "?mode=ro"
        conn = sqlite3.connect(db_uri, uri=True, timeout=1.5)
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """
            SELECT conversation_id, title, preview, step_count, last_modified_time,
                   workspace_uris, status, project_id, agent_name,
                   parent_conversation_id, nesting_depth, not_fully_idle, killed
            FROM conversation_summaries
            WHERE conversation_id = ?
            LIMIT 1
            """,
            (cid,),
        ).fetchone()
        return _row_to_summary_dict(row) if row is not None else None
    except Exception:
        return None
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def get_active_ls_env(force_refresh: bool = False) -> Tuple[Optional[str], Optional[str]]:
    """Dynamically discover the active Antigravity Language Server port and CSRF token on Windows."""
    global _cached_ls_env
    now = time.time()
    if not force_refresh and _cached_ls_env["addr"] and (now - _cached_ls_env["time"] < 60.0):
        return _cached_ls_env["addr"], _cached_ls_env["token"]

    if sys.platform != "win32":
        return None, None

    with _ls_env_lock:
        now = time.time()
        if not force_refresh and _cached_ls_env["addr"] and (now - _cached_ls_env["time"] < 60.0):
            return _cached_ls_env["addr"], _cached_ls_env["token"]
        return _discover_ls_env_locked(now)


def _discover_ls_env_locked(now: float) -> Tuple[Optional[str], Optional[str]]:
    ls_exe = resolve_ls_exe()
    agentapi_bat = resolve_agentapi_bat()

    try:
        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

        # 1. Parse listening ports using native Windows netstat
        ports_by_pid: Dict[int, List[int]] = {}
        try:
            res_netstat = subprocess.run(
                ["netstat", "-ano", "-p", "tcp"],
                capture_output=True, text=True, startupinfo=startupinfo, timeout=2.0
            )
            for line in res_netstat.stdout.splitlines():
                if "LISTENING" in line:
                    parts = line.strip().split()
                    if len(parts) >= 5:
                        local_addr, pid_str = parts[1], parts[4]
                        if ":" in local_addr and pid_str.isdigit():
                            port = int(local_addr.rsplit(":", 1)[1])
                            pid = int(pid_str)
                            ports_by_pid.setdefault(pid, []).append(port)
        except Exception:
            pass

        # 2. Query running language_server processes
        ps_cmd = 'Get-CimInstance Win32_Process -Filter "Name LIKE \'%language_server%\'" | Select-Object ProcessId, ExecutablePath, CommandLine | ConvertTo-Json'
        res = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            startupinfo=startupinfo, timeout=4.0
        )
        if not res.stdout.strip():
            return None, None
        procs = json.loads(res.stdout)
        if isinstance(procs, dict):
            procs = [procs]

        # Prioritize main hub/extension server (without --enable_lsp)
        procs_sorted = sorted(procs, key=lambda p: 0 if ("--enable_lsp" not in (p.get("CommandLine") or "")) else 1)

        for p in procs_sorted:
            pid = p.get("ProcessId")
            cmdline = p.get("CommandLine") or ""
            proc_exe = p.get("ExecutablePath") or ""
            probe_bin = proc_exe if (proc_exe and os.path.exists(proc_exe)) else (ls_exe if os.path.exists(ls_exe) else agentapi_bat)
            if not probe_bin or not os.path.exists(probe_bin):
                continue
            token_m = re.search(r"--csrf_token\s+([a-f0-9\-]+)", cmdline)
            token = token_m.group(1) if token_m else ""
            ports = ports_by_pid.get(pid, [])
            for port in ports:
                addr = f"127.0.0.1:{port}"
                probe_env = build_clean_agentapi_env(addr=addr, token=token)
                probe_cmd = (
                    [probe_bin, "agentapi", "get-conversation-metadata", "test_probe"]
                    if probe_bin.lower().endswith(".exe")
                    else [probe_bin, "get-conversation-metadata", "test_probe"]
                )
                test_res = subprocess.run(
                    probe_cmd,
                    capture_output=True, text=True, encoding="utf-8", errors="replace",
                    stdin=subprocess.DEVNULL,
                    env=probe_env, startupinfo=startupinfo, timeout=2.5
                )
                out = (test_res.stdout or "") + "\n" + (test_res.stderr or "")
                if test_res.returncode == 0 or "trajectory not found" in out or "conversationMetadata" in out:
                    _cached_ls_env["addr"] = addr
                    _cached_ls_env["token"] = token
                    _cached_ls_env["time"] = now
                    return addr, token

        # Fallback to first available candidate
        for p in procs_sorted:
            pid = p.get("ProcessId")
            cmdline = p.get("CommandLine") or ""
            token_m = re.search(r"--csrf_token\s+([a-f0-9\-]+)", cmdline)
            token = token_m.group(1) if token_m else ""
            ports = ports_by_pid.get(pid, [])
            if ports and token:
                addr = f"127.0.0.1:{ports[0]}"
                _cached_ls_env["addr"] = addr
                _cached_ls_env["token"] = token
                _cached_ls_env["time"] = now
                return addr, token
    except Exception:
        pass

    return None, None


def probe_ls_connection(force_refresh: bool = True) -> Dict[str, Any]:
    """Actively test Language Server gRPC API health, summaries DB, and brain directory."""
    t0 = time.time()
    ls_exe = resolve_ls_exe()
    agentapi_bat = resolve_agentapi_bat()
    brain_dir = resolve_brain_dir()
    summaries_db = resolve_summaries_db()
    db_exists = os.path.exists(summaries_db)
    addr, token = get_active_ls_env(force_refresh=force_refresh)

    result: Dict[str, Any] = {
        "ok": False,
        "connected": False,
        "addr": addr or "",
        "has_token": bool(token),
        "ls_exe": ls_exe if os.path.exists(ls_exe) else (agentapi_bat if os.path.exists(agentapi_bat) else ""),
        "brain_dir": brain_dir,
        "brain_exists": os.path.isdir(brain_dir),
        "summaries_db": summaries_db,
        "db_exists": db_exists,
        "latency_ms": 0.0,
        "error": "",
    }

    probe_bin = result["ls_exe"]
    if not probe_bin:
        result["error"] = "未找到 language_server.exe 或 agentapi.bat"
        return result

    if not addr:
        result["error"] = "未检测到运行中的 Antigravity Language Server 监听端口"
        return result

    try:
        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

        env = build_clean_agentapi_env(addr=addr, token=token)
        cmd = (
            [probe_bin, "agentapi", "get-conversation-metadata", "test_probe"]
            if probe_bin.lower().endswith(".exe")
            else [probe_bin, "get-conversation-metadata", "test_probe"]
        )
        res = subprocess.run(
            cmd,
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            stdin=subprocess.DEVNULL, env=env, startupinfo=startupinfo, timeout=3.5
        )
        out = (res.stdout or "") + "\n" + (res.stderr or "")
        result["latency_ms"] = round((time.time() - t0) * 1000, 1)
        if res.returncode == 0 or "trajectory not found" in out or "conversationMetadata" in out:
            result["ok"] = True
            result["connected"] = True
        else:
            result["error"] = (res.stderr.strip() or res.stdout.strip() or f"Code {res.returncode}")[:200]
    except Exception as e:
        result["error"] = str(e)

    return result
