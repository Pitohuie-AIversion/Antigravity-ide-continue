#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Antigravity Auto-Pilot Web 控制中心与多会话并发自驱巡航守护引擎
==============================================================
特性：
  1. 🚀 多会话并发监控矩阵 (Multi-Session Concurrent Fleet)：支持同时纳管多个对话，多线程独立轮询与状态机运转
  2. 🌐 跨设备多节点支持：本地电脑 (Local Windows) 与 远程 SSH 主机 (如 seetacloud-westc 恒源云) 混合并发
  3. ⏱ 独立消抖与冷却控制：每个会话独立步数跟踪、独立冷却倒计时、独立提示词注入与任务完工检测
  4. ⚡ 非阻塞双栈通信：IPv4/IPv6 Dual-Stack HTTP 极速响应，线程安全可重入锁 (RLock) 杜绝死锁
"""

import os
import sys
import re
import json
import time
import socket
import subprocess
import threading
import concurrent.futures
import urllib.request
from collections import deque
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from typing import Dict, Any, List, Optional, Tuple

# Ensure UTF-8 on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

PORT = 5300
USER_HOME = os.path.expanduser("~")
BRAIN_DIR = os.path.join(USER_HOME, ".gemini", "antigravity-ide", "brain")
LOCAL_APP_DATA = os.environ.get("LOCALAPPDATA", os.path.join(USER_HOME, "AppData", "Local"))
LS_EXE = os.path.join(
    LOCAL_APP_DATA, "Programs", "Antigravity IDE", "resources", "app",
    "extensions", "antigravity", "bin", "language_server_windows_x64.exe"
)
AGENTAPI_BAT = os.path.join(USER_HOME, ".gemini", "antigravity-ide", "bin", "agentapi.bat")

_cached_ls_env = {"addr": None, "token": None, "time": 0.0}

def get_active_ls_env(force_refresh: bool = False) -> Tuple[Optional[str], Optional[str]]:
    """Dynamically discover the active Antigravity Language Server port and CSRF token on Windows.
    This guarantees seamless injection even when user switches Google accounts or restarts the IDE.
    """
    global _cached_ls_env
    now = time.time()
    if not force_refresh and _cached_ls_env["addr"] and (now - _cached_ls_env["time"] < 60.0):
        return _cached_ls_env["addr"], _cached_ls_env["token"]

    if sys.platform != "win32":
        return None, None

    try:
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

        # 1. Parse listening ports in 20ms using native Windows netstat
        ports_by_pid = {}
        try:
            res_netstat = subprocess.run(
                ['netstat', '-ano', '-p', 'tcp'],
                capture_output=True, text=True, startupinfo=startupinfo, timeout=2.0
            )
            for line in res_netstat.stdout.splitlines():
                if 'LISTENING' in line:
                    parts = line.strip().split()
                    if len(parts) >= 5:
                        local_addr, pid_str = parts[1], parts[4]
                        if ':' in local_addr and pid_str.isdigit():
                            port = int(local_addr.rsplit(':', 1)[1])
                            pid = int(pid_str)
                            ports_by_pid.setdefault(pid, []).append(port)
        except Exception:
            pass

        # 2. Query running language_server processes
        ps_cmd = 'Get-CimInstance Win32_Process -Filter "Name LIKE \'%language_server_windows_x64%\'" | Select-Object ProcessId, CommandLine | ConvertTo-Json'
        res = subprocess.run(
            ['powershell', '-NoProfile', '-Command', ps_cmd],
            capture_output=True, text=True, encoding='utf-8', errors='replace',
            startupinfo=startupinfo, timeout=4.0
        )
        if not res.stdout.strip():
            return None, None
        procs = json.loads(res.stdout)
        if isinstance(procs, dict):
            procs = [procs]

        # Prioritize main extension server (subclient_type ide, without --enable_lsp)
        procs_sorted = sorted(procs, key=lambda p: 0 if ('--enable_lsp' not in (p.get('CommandLine') or '')) else 1)

        probe_bin = LS_EXE if os.path.exists(LS_EXE) else AGENTAPI_BAT
        for p in procs_sorted:
            pid = p.get('ProcessId')
            cmdline = p.get('CommandLine') or ''
            token_m = re.search(r'--csrf_token\s+([a-f0-9\-]+)', cmdline)
            token = token_m.group(1) if token_m else ''
            ports = ports_by_pid.get(pid, [])
            for port in ports:
                probe_env = os.environ.copy()
                probe_env['ANTIGRAVITY_LS_ADDRESS'] = f'127.0.0.1:{port}'
                if token:
                    probe_env['ANTIGRAVITY_CSRF_TOKEN'] = token
                test_res = subprocess.run(
                    [probe_bin, 'agentapi', 'get-conversation-metadata', 'test_probe'] if probe_bin == LS_EXE else [probe_bin, 'get-conversation-metadata', 'test_probe'],
                    capture_output=True, text=True, encoding='utf-8', errors='replace',
                    env=probe_env, startupinfo=startupinfo, timeout=2.0
                )
                # Successful response or valid RPC trajectory error indicates active language server
                out = test_res.stdout or ""
                if test_res.returncode == 0 or "trajectory not found" in out or "conversationMetadata" in out:
                    addr = f'127.0.0.1:{port}'
                    _cached_ls_env["addr"] = addr
                    _cached_ls_env["token"] = token
                    _cached_ls_env["time"] = now
                    return addr, token


        # Fallback to first available candidate
        for p in procs_sorted:
            pid = p.get('ProcessId')
            cmdline = p.get('CommandLine') or ''
            token_m = re.search(r'--csrf_token\s+([a-f0-9\-]+)', cmdline)
            token = token_m.group(1) if token_m else ''
            ports = ports_by_pid.get(pid, [])
            if ports and token:
                addr = f'127.0.0.1:{ports[0]}'
                _cached_ls_env["addr"] = addr
                _cached_ls_env["token"] = token
                _cached_ls_env["time"] = now
                return addr, token
    except Exception:
        pass

    return None, None

if getattr(sys, 'frozen', False):
    APP_DIR = os.path.dirname(sys.executable)
    local_web = os.path.join(APP_DIR, "web")
    if os.path.exists(local_web):
        WEB_DIR = local_web
    else:
        BUNDLE_DIR = getattr(sys, '_MEIPASS', APP_DIR)
        WEB_DIR = os.path.join(BUNDLE_DIR, "web")
    CONFIG_PATH = os.path.join(APP_DIR, "config.json")
else:
    APP_DIR = os.path.dirname(os.path.abspath(__file__))
    CONFIG_PATH = os.path.join(APP_DIR, "config.json")
    WEB_DIR = os.path.join(APP_DIR, "web")

COMPLETION_KEYWORDS = [
    "所有任务已完成", "全部任务已完成", "所有需求已完成",
    "已全部完成", "代码修改已全部完成", "all tasks completed",
    "goal_complete", "已达成任务交付", "任务交付完成",
    "已全部实现", "全部需求开发完毕", "all goals achieved"
]


def run_ssh(host: str, remote_cmd: str, timeout: float = 8.0) -> subprocess.CompletedProcess:
    """Execute remote command over SSH safely with no port forwarding conflicts and no stdin hang."""
    startupinfo = None
    if os.name == 'nt':
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

    cmd = [
        "ssh",
        "-o", "ClearAllForwardings=yes",
        "-o", "ConnectTimeout=4",
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "LogLevel=ERROR",
        host,
        remote_cmd
    ]
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdin=subprocess.DEVNULL,
        startupinfo=startupinfo,
        timeout=timeout
    )


class MultiSessionDaemon:
    """Core daemon managing multi-session concurrent inspection, state machines, and silent injection."""

    def __init__(self):
        self.lock = threading.RLock()
        self.node_type = "local"  # Active node tab for browsing
        self.is_running = True    # Global fleet engine switch
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.cached_convs: Dict[str, List[Dict[str, Any]]] = {}
        self.last_convs_time: Dict[str, float] = {}
        self.logs = deque(maxlen=300)
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=6)
        self.start_time = time.time()
        self.webhook: Dict[str, Any] = {
            "enabled": False,
            "url": "",
            "platform": "feishu",
            "notify_on_trigger": False,
            "notify_on_complete": True,
            "notify_on_error": True
        }
        self.strategy: Dict[str, Any] = {
            "smart_backoff": True,
            "auto_archive_completed": False,
            "auto_adopt_sessions": False,
            "stall_alert_seconds": 300,
            "max_parallel_workers": 6
        }
        self._last_auto_adopt_check = 0.0
        self.injection_timestamps = deque(maxlen=300)
        self.telemetry_history = deque(maxlen=60)
        self._last_telemetry_snapshot = 0.0
        self.notification_callback: Optional[Any] = None
        self._last_config_mtime = 0.0

        # Load initial config and registered sessions
        self.load_config()

        # Start SSH keepalive background thread
        self._start_ssh_keepalive()

        # Start main concurrent worker thread
        self._start_worker()

    def add_log(self, text: str, level: str = "INFO", session_tag: str = ""):
        ts = time.strftime("%H:%M:%S")
        full_text = f"[{session_tag}] {text}" if session_tag else text
        entry = {
            "timestamp": ts,
            "level": level,
            "text": full_text
        }
        with self.lock:
            self.logs.append(entry)
        try:
            print(f"[{ts}] [{level}] {full_text}", flush=True)
        except UnicodeEncodeError:
            print(f"[{ts}] [{level}] {full_text.encode('ascii', 'replace').decode('ascii')}", flush=True)

    def _start_ssh_keepalive(self):
        def keepalive_worker():
            while True:
                time.sleep(30)
                try:
                    with self.lock:
                        has_ssh = any(s.get("node_type", "").startswith("ssh:") for s in self.sessions.values()) or self.node_type.startswith("ssh:")
                    if has_ssh:
                        run_ssh("seetacloud-westc", "true", timeout=4.0)
                except Exception:
                    pass
        t = threading.Thread(target=keepalive_worker, daemon=True)
        t.start()

    def _start_worker(self):
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.worker_thread.start()

    def load_config(self, is_reload: bool = False):
        if os.path.exists(CONFIG_PATH):
            try:
                self._last_config_mtime = os.path.getmtime(CONFIG_PATH)
                with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    with self.lock:
                        self.node_type = cfg.get("node_type", self.node_type)
                        
                        self.webhook = cfg.get("webhook", self.webhook)
                        cfg_strat = cfg.get("strategy", {})
                        self.strategy["smart_backoff"] = bool(cfg_strat.get("smart_backoff", True))
                        self.strategy["auto_archive_completed"] = bool(cfg_strat.get("auto_archive_completed", False))
                        self.strategy["auto_adopt_sessions"] = bool(cfg_strat.get("auto_adopt_sessions", False))
                        self.strategy["stall_alert_seconds"] = int(cfg_strat.get("stall_alert_seconds", 300))
                        
                        monitored = cfg.get("monitored_sessions", [])
                        # Backward compatibility for single target_conversation_id
                        if not monitored and cfg.get("target_conversation_id"):
                            monitored = [{
                                "id": cfg.get("target_conversation_id"),
                                "node_type": cfg.get("node_type", "local"),
                                "title": "默认迁移会话",
                                "prompt": cfg.get("continue_prompt", "继续"),
                                "cooldown": float(cfg.get("idle_delay_seconds", 3.0)),
                                "max_turns": int(cfg.get("max_turns", 9999)),
                                "enabled": True
                            }]

                        configured_ids = set()
                        for s in monitored:
                            cid = s.get("id", "").strip()
                            if not cid:
                                continue
                            configured_ids.add(cid)
                            
                            if cid in self.sessions:
                                # Update existing session configuration while preserving live state & counters
                                cur = self.sessions[cid]
                                cur["title"] = s.get("title", cur["title"])
                                cur["prompt"] = s.get("prompt", cur["prompt"])
                                cur["cooldown"] = float(s.get("cooldown", cur["cooldown"]))
                                cur["max_turns"] = int(s.get("max_turns", cur["max_turns"]))
                                cur["pinned"] = bool(s.get("pinned", cur.get("pinned", False)))
                                new_enabled = bool(s.get("enabled", True))
                                if cur["enabled"] != new_enabled:
                                    cur["enabled"] = new_enabled
                                    cur["state"] = "IDLE" if new_enabled else "STOPPED"
                            else:
                                self.sessions[cid] = {
                                    "id": cid,
                                    "node_type": s.get("node_type", "local"),
                                    "title": s.get("title", cid[:12]),
                                    "prompt": s.get("prompt", "继续"),
                                    "cooldown": float(s.get("cooldown", 3.0)),
                                    "max_turns": int(s.get("max_turns", 9999)),
                                    "enabled": bool(s.get("enabled", True)),
                                    "pinned": bool(s.get("pinned", False)),
                                    "state": "IDLE" if s.get("enabled", True) else "STOPPED",
                                    "current_step": 0,
                                    "last_handled_step": -1,
                                    "sent_count": 0,
                                    "cooldown_remaining": 0.0,
                                    "idle_start_time": None,
                                    "last_snippet": "",
                                    "error": "",
                                    "updated_at": time.time()
                                }
                if is_reload:
                    self.add_log("检测到外部配置文件修改，已自动热重载 (Hot-Reload)", "SUCCESS", session_tag="CONFIG")
            except Exception as e:
                self.add_log(f"加载 config.json 失败: {e}", "WARN")

        # If still empty, scan local and register latest session as default
        if not self.sessions:
            convs = self.scan_conversations(node="local", limit=1, force=True)
            if convs:
                c = convs[0]
                self.add_session(
                    conv_id=c["id"],
                    node_type="local",
                    title=c["preview"][:30],
                    prompt="继续",
                    cooldown=3.0,
                    max_turns=9999,
                    enabled=True
                )

    def save_config(self):
        try:
            with self.lock:
                sess_list = []
                for s in self.sessions.values():
                    sess_list.append({
                        "id": s["id"],
                        "node_type": s["node_type"],
                        "title": s["title"],
                        "prompt": s["prompt"],
                        "cooldown": s["cooldown"],
                        "max_turns": s["max_turns"],
                        "enabled": s["enabled"],
                        "pinned": bool(s.get("pinned", False))
                    })
                data = {
                    "node_type": self.node_type,
                    "monitored_sessions": sess_list,
                    "target_conversation_id": sess_list[0]["id"] if sess_list else "",
                    "continue_prompt": sess_list[0]["prompt"] if sess_list else "继续",
                    "idle_delay_seconds": sess_list[0]["cooldown"] if sess_list else 3.0,
                    "max_turns": sess_list[0]["max_turns"] if sess_list else 9999,
                    "webhook": self.webhook,
                    "strategy": self.strategy
                }
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            try:
                self._last_config_mtime = os.path.getmtime(CONFIG_PATH)
            except Exception:
                pass
        except Exception as e:
            self.add_log(f"持久化 config.json 失败: {e}", "ERROR")


    def send_webhook(self, event_type: str, title: str, conv_id: str, message: str, extra: Dict[str, Any] = None):
        # Trigger native desktop notification if registered
        if self.notification_callback:
            try:
                type_labels = {"COMPLETE": "🎉 任务完工", "ERROR": "⚠️ 异常告警", "TRIGGER": "⚡ 自动注入"}
                label = type_labels.get(event_type, f"⚡ {event_type}")
                self.notification_callback(f"{label} · {title[:16]}", message)
            except Exception:
                pass

        with self.lock:
            wh = dict(self.webhook)
        if not wh.get("enabled") or not wh.get("url"):
            return

        if event_type == "TRIGGER" and not wh.get("notify_on_trigger"):
            return
        if event_type == "COMPLETE" and not wh.get("notify_on_complete", True):
            return
        if event_type == "ERROR" and not wh.get("notify_on_error", True):
            return

        url = wh.get("url", "").strip()
        platform = str(wh.get("platform", "feishu")).lower()

        def _do_post():
            try:
                now_str = time.strftime("%Y-%m-%d %H:%M:%S")
                summary_text = (
                    f"【Antigravity 巡航通知 · {event_type}】\n"
                    f"会话: {title}\n"
                    f"ID: {conv_id[:12]}...\n"
                    f"时间: {now_str}\n"
                    f"详情: {message}"
                )
                payload: Dict[str, Any] = {}
                if platform in ("feishu", "lark"):
                    payload = {"msg_type": "text", "content": {"text": summary_text}}
                elif platform in ("dingtalk", "wecom"):
                    payload = {"msgtype": "text", "text": {"content": summary_text}}
                else:
                    payload = {
                        "event": event_type,
                        "session_id": conv_id,
                        "title": title,
                        "message": message,
                        "timestamp": now_str,
                        "extra": extra or {}
                    }
                data_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                req = urllib.request.Request(
                    url,
                    data=data_bytes,
                    headers={"Content-Type": "application/json; charset=utf-8", "User-Agent": "Antigravity-Fleet/2.0"},
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=5.0) as resp:
                    pass
            except Exception as ex:
                self.add_log(f"Webhook 推送失败: {ex}", "WARN", session_tag="WEBHOOK")

        threading.Thread(target=_do_post, daemon=True).start()

    def test_webhook(self, url: str, platform: str) -> Tuple[bool, str]:
        if not url:
            return False, "Webhook URL 不能为空"
        try:
            now_str = time.strftime("%Y-%m-%d %H:%M:%S")
            test_msg = f"🔔 [Antigravity Fleet 测试通知]\n时间: {now_str}\n状态: Webhook 链路握手成功，多会话控制中心通讯正常！"
            payload: Dict[str, Any] = {}
            platform_lower = platform.lower()
            if platform_lower in ("feishu", "lark"):
                payload = {"msg_type": "text", "content": {"text": test_msg}}
            elif platform_lower in ("dingtalk", "wecom"):
                payload = {"msgtype": "text", "text": {"content": test_msg}}
            else:
                payload = {"event": "TEST", "message": test_msg, "timestamp": now_str}

            data_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=data_bytes,
                headers={"Content-Type": "application/json; charset=utf-8", "User-Agent": "Antigravity-Fleet/2.0"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                return True, f"测试推送成功！HTTP Status: {resp.status}"
        except Exception as e:
            return False, f"测试推送异常: {str(e)}"

    def get_telemetry_payload(self) -> Dict[str, Any]:
        with self.lock:
            now = time.time()
            uptime_sec = int(now - self.start_time)
            recent_injections = sum(1 for t in self.injection_timestamps if now - t <= 60)

            sess_list = list(self.sessions.values())
            active_count = len([s for s in sess_list if s.get("enabled")])
            busy_count = len([s for s in sess_list if s.get("state") == "BUSY"])
            total_sent = sum(s.get("sent_count", 0) for s in sess_list)
            total_steps = sum(max(0, s.get("current_step", 0)) for s in sess_list)

            # Record periodic snapshot every 3 seconds
            if now - self._last_telemetry_snapshot >= 3.0:
                self._last_telemetry_snapshot = now
                self.telemetry_history.append({
                    "time": time.strftime("%H:%M:%S"),
                    "injections_per_min": recent_injections,
                    "active_count": active_count,
                    "busy_count": busy_count,
                    "total_steps": total_steps
                })

            return {
                "uptime_seconds": uptime_sec,
                "uptime_formatted": f"{uptime_sec // 3600}时 {(uptime_sec % 3600) // 60}分 {uptime_sec % 60}秒",
                "injections_per_min": recent_injections,
                "active_count": active_count,
                "total_count": len(sess_list),
                "busy_count": busy_count,
                "total_sent_count": total_sent,
                "total_steps": total_steps,
                "history": list(self.telemetry_history),
                "webhook": self.webhook,
                "strategy": self.strategy
            }

    def add_session(self, conv_id: str, node_type: str = "local", title: str = "",
                    prompt: str = "继续", cooldown: float = 3.0, max_turns: int = 9999,
                    enabled: bool = True) -> bool:
        conv_id = conv_id.strip()
        if not conv_id:
            return False

        if not title:
            # Try to resolve title from cached conversations
            with self.lock:
                cached = self.cached_convs.get(node_type, [])
            found = next((c for c in cached if c["id"] == conv_id), None)
            if found:
                title = found.get("preview", "")[:40]
            else:
                title = f"{node_type[:5]}·{conv_id[:8]}"

        with self.lock:
            is_new = conv_id not in self.sessions
            self.sessions[conv_id] = {
                "id": conv_id,
                "node_type": node_type,
                "title": title,
                "prompt": prompt or "继续",
                "cooldown": max(1.0, float(cooldown)),
                "max_turns": int(max_turns),
                "enabled": enabled,
                "state": "IDLE" if enabled else "STOPPED",
                "current_step": 0,
                "last_handled_step": -1,
                "sent_count": 0,
                "cooldown_remaining": 0.0,
                "idle_start_time": None,
                "last_snippet": "",
                "error": "",
                "pinned": False,
                "updated_at": time.time()
            }

        self.save_config()
        action_desc = "新增并纳管" if is_new else "更新配置"
        self.add_log(f"{action_desc}会话 [{title}] (节点: {node_type})", "SUCCESS")
        return True

    def remove_session(self, conv_id: str) -> bool:
        conv_id = conv_id.strip()
        with self.lock:
            s = self.sessions.pop(conv_id, None)
        if s:
            self.save_config()
            self.add_log(f"已移出会话 [{s.get('title', conv_id[:8])}]", "INFO")
            return True
        return False

    def toggle_session(self, conv_id: str, enabled: Optional[bool] = None) -> bool:
        conv_id = conv_id.strip()
        with self.lock:
            s = self.sessions.get(conv_id)
            if not s:
                return False
            new_val = (not s["enabled"]) if enabled is None else bool(enabled)
            s["enabled"] = new_val
            s["state"] = "IDLE" if new_val else "STOPPED"
            s["cooldown_remaining"] = 0.0
            s["idle_start_time"] = None
            title = s.get("title", conv_id[:8])

        self.save_config()
        status_txt = "开启自驱" if new_val else "暂停自驱"
        self.add_log(f"会话 [{title}] {status_txt}", "SUCCESS" if new_val else "INFO")
        return True

    def update_session(self, conv_id: str, data: Dict[str, Any]) -> bool:
        conv_id = conv_id.strip()
        with self.lock:
            s = self.sessions.get(conv_id)
            if not s:
                return False
            if "prompt" in data: s["prompt"] = str(data["prompt"]).strip() or "继续"
            if "cooldown" in data: s["cooldown"] = max(1.0, float(data["cooldown"]))
            if "max_turns" in data: s["max_turns"] = int(data["max_turns"])
            if "title" in data: s["title"] = str(data["title"]).strip()
            if "pinned" in data: s["pinned"] = bool(data["pinned"])
        self.save_config()
        self.add_log(f"会话 [{conv_id[:8]}] 参数已更新", "SUCCESS")
        return True

    def start_all(self):
        with self.lock:
            self.is_running = True
            for s in self.sessions.values():
                s["enabled"] = True
                if s["state"] == "STOPPED":
                    s["state"] = "IDLE"
        self.save_config()
        self.add_log("🚀 已一键启动全矩阵自驱巡航！", "SUCCESS")

    def stop_all(self):
        with self.lock:
            for s in self.sessions.values():
                s["enabled"] = False
                s["state"] = "STOPPED"
                s["cooldown_remaining"] = 0.0
                s["idle_start_time"] = None
        self.save_config()
        self.add_log("⏹ 已全部暂停自驱巡航守护。", "INFO")

    def batch_toggle(self, conv_ids: List[str], enabled: bool) -> int:
        count = 0
        with self.lock:
            for cid in conv_ids:
                if cid in self.sessions:
                    self.sessions[cid]["enabled"] = enabled
                    self.sessions[cid]["state"] = "IDLE" if enabled else "STOPPED"
                    self.sessions[cid]["cooldown_remaining"] = 0.0
                    self.sessions[cid]["idle_start_time"] = None
                    count += 1
        if count > 0:
            self.save_config()
            self.add_log(f"批量{'开启' if enabled else '暂停'}了 {count} 个会话巡航", "SUCCESS" if enabled else "INFO")
        return count

    def batch_remove(self, conv_ids: List[str]) -> int:
        count = 0
        with self.lock:
            for cid in conv_ids:
                if self.sessions.pop(cid, None):
                    count += 1
        if count > 0:
            self.save_config()
            self.add_log(f"批量移出了 {count} 个会话", "INFO")
        return count

    def batch_update(self, conv_ids: List[str], prompt: Optional[str] = None,
                     cooldown: Optional[float] = None) -> int:
        count = 0
        with self.lock:
            for cid in conv_ids:
                if cid in self.sessions:
                    if prompt is not None:
                        self.sessions[cid]["prompt"] = prompt.strip() or "继续"
                    if cooldown is not None:
                        self.sessions[cid]["cooldown"] = max(1.0, float(cooldown))
                    count += 1
        if count > 0:
            self.save_config()
            self.add_log(f"批量更新了 {count} 个会话参数 (提示词/冷却)", "SUCCESS")
        return count

    def trigger_session(self, conv_id: str, text: Optional[str] = None) -> bool:
        with self.lock:
            s = self.sessions.get(conv_id)
            if not s:
                return False
            node = s["node_type"]
            prompt = text or s["prompt"]
            title = s.get("title", conv_id[:8])

        self.add_log(f"手动单次注入指令 -> \"{prompt}\"", "INFO", session_tag=title[:10])
        ok = self.send_message(node, conv_id, prompt)
        if ok:
            with self.lock:
                if conv_id in self.sessions:
                    self.sessions[conv_id]["sent_count"] += 1
        return ok

    def set_node(self, node_type: str):
        with self.lock:
            self.node_type = node_type
        self.add_log(f"控制台浏览视图切换至 -> {node_type}", "INFO")
        self.save_config()

    def scan_conversations(self, node: str, limit: int = 50, force: bool = False) -> List[Dict[str, Any]]:
        with self.lock:
            cached = list(self.cached_convs.get(node, []))
            last_t = self.last_convs_time.get(node, 0.0)

        now = time.time()
        if not force and (now - last_t < 15.0) and cached:
            return cached

        # 1. 远程 SSH 扫描
        if node.startswith("ssh:"):
            host = node.split("ssh:")[1]
            try:
                res = run_ssh(host, f"python3 /root/.gemini/antigravity-ide/bin/remote_scan.py {limit}", timeout=10.0)
                if res.returncode == 0:
                    for line in reversed(res.stdout.strip().split("\n")):
                        line = line.strip()
                        if line.startswith("[") and line.endswith("]"):
                            data = json.loads(line)
                            with self.lock:
                                self.cached_convs[node] = data
                                self.last_convs_time[node] = now
                            return data
            except Exception as e:
                self.add_log(f"远程节点 [{host}] 扫描会话失败: {e}", "WARN")
            return cached or []

        # 2. 本地扫描
        if not os.path.exists(BRAIN_DIR):
            return []

        convs = []
        try:
            for entry in os.listdir(BRAIN_DIR):
                p = os.path.join(BRAIN_DIR, entry, ".system_generated", "logs", "transcript.jsonl")
                if os.path.exists(p):
                    mtime = os.path.getmtime(p)
                    step_count = self._count_steps(p)
                    is_empty = (step_count == 0)
                    preview = self._extract_preview(p, is_empty)
                    convs.append({
                        "id": entry,
                        "mtime": mtime,
                        "mtime_str": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(mtime)),
                        "preview": preview,
                        "step_count": step_count,
                        "is_empty": is_empty,
                        "is_remote": False
                    })
        except Exception:
            pass

        convs.sort(key=lambda x: x["mtime"], reverse=True)
        res_list = convs[:limit]
        with self.lock:
            self.cached_convs[node] = res_list
            self.last_convs_time[node] = now
        return res_list

    def _extract_preview(self, transcript_file: str, is_empty: bool = False) -> str:
        if is_empty:
            return "🌱 (新建空白会话 · 尚未发消息)"
        try:
            with open(transcript_file, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    item = json.loads(line)
                    if item.get("type") == "USER_INPUT" and item.get("content"):
                        content = str(item.get("content")).strip()
                        if "<USER_REQUEST>" in content:
                            content = content.split("<USER_REQUEST>")[1].split("</USER_REQUEST>")[0].strip()
                        content = content.replace("\n", " ")
                        return (content[:70] + "...") if len(content) > 70 else content
        except Exception:
            pass
        return "🌱 (新建空白会话 · 尚未发消息)"

    def _count_steps(self, transcript_file: str) -> int:
        try:
            with open(transcript_file, "r", encoding="utf-8", errors="ignore") as f:
                return sum(1 for line in f if line.strip())
        except Exception:
            return 0

    def send_message(self, node: str, conv_id: str, text: str) -> bool:
        # 1. 远程 SSH 注入
        if node.startswith("ssh:"):
            host = node.split("ssh:")[1]
            try:
                cmd_str = f"/root/.gemini/antigravity-ide/bin/agentapi_auto.sh send-message {conv_id} {json.dumps(text)}"
                res = run_ssh(host, cmd_str, timeout=12.0)
                if res.returncode == 0:
                    self.add_log(f"远程注入成功: \"{text}\"", "TRIGGER", session_tag=f"{host}/{conv_id[:8]}")
                    return True
                else:
                    err_msg = res.stderr.strip() or res.stdout.strip()
                    self.add_log(f"远程注入失败: {err_msg}", "ERROR", session_tag=conv_id[:8])
                    return False
            except Exception as e:
                self.add_log(f"远程注入异常: {e}", "ERROR", session_tag=conv_id[:8])
                return False

        # 2. 本地注入
        cmd = []
        if os.path.exists(LS_EXE):
            cmd = [LS_EXE, "agentapi", "send-message", conv_id, text]
        elif os.path.exists(AGENTAPI_BAT):
            cmd = [AGENTAPI_BAT, "send-message", conv_id, text]
        else:
            self.add_log("未找到 Language Server agentapi 执行接口", "ERROR", session_tag=conv_id[:8])
            return False

        try:
            startupinfo = None
            if os.name == 'nt':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

            run_env = os.environ.copy()
            addr, token = get_active_ls_env()
            if addr:
                run_env["ANTIGRAVITY_LS_ADDRESS"] = addr
            if token:
                run_env["ANTIGRAVITY_CSRF_TOKEN"] = token

            res = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                stdin=subprocess.DEVNULL,
                startupinfo=startupinfo,
                env=run_env,
                timeout=10
            )
            if res.returncode == 0:
                self.add_log(f"本地注入成功: \"{text}\"", "TRIGGER", session_tag=f"本地/{conv_id[:8]}")
                return True
            else:
                # 账户切换或服务重启时，强制刷新地址与令牌重试一次
                addr, token = get_active_ls_env(force_refresh=True)
                if addr:
                    run_env["ANTIGRAVITY_LS_ADDRESS"] = addr
                if token:
                    run_env["ANTIGRAVITY_CSRF_TOKEN"] = token
                retry_res = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    stdin=subprocess.DEVNULL,
                    startupinfo=startupinfo,
                    env=run_env,
                    timeout=10
                )
                if retry_res.returncode == 0:
                    self.add_log(f"本地注入重试成功: \"{text}\"", "TRIGGER", session_tag=f"本地/{conv_id[:8]}")
                    return True

                err_detail = (retry_res.stderr.strip() or retry_res.stdout.strip() or res.stderr.strip() or res.stdout.strip())
                self.add_log(f"本地注入失败 (Code {retry_res.returncode}): {err_detail}", "ERROR", session_tag=conv_id[:8])
                return False
        except Exception as e:
            self.add_log(f"本地注入进程异常: {e}", "ERROR", session_tag=conv_id[:8])
            return False

    def generate_report(self) -> str:
        with self.lock:
            total_sent = sum(s.get("sent_count", 0) for s in self.sessions.values())
            active_count = sum(1 for s in self.sessions.values() if s.get("enabled"))
            total_count = len(self.sessions)
            sess_items = list(self.sessions.values())

        now_str = time.strftime("%Y-%m-%d %H:%M:%S")
        uptime_sec = int(time.time() - self.start_time)
        uptime_fmt = f"{uptime_sec // 3600}小时 {(uptime_sec % 3600) // 60}分钟"

        md = []
        md.append(f"# ⚡ Antigravity Auto-Pilot · 矩阵任务交付与巡航报告")
        md.append(f"> 自动生成时间: **{now_str}** · 巡航总时长: **{uptime_fmt}**\n")
        md.append(f"### 📊 矩阵核心态势")
        md.append(f"- **纳管会话总数**: {total_count} 个")
        md.append(f"- **正在并发巡航**: {active_count} 个")
        md.append(f"- **累计自驱动注入**: {total_sent} 轮")
        md.append(f"- **底层通道状态**: 🟢 Language Server gRPC 探活正常\n")
        md.append(f"### 📋 各会话执行明细与产出追踪")
        md.append(f"| 节点 | 标题 | 会话 ID | 状态 | 当前步数 | 已注入 | 任务提示词与最新摘要 |")
        md.append(f"| :--- | :--- | :--- | :--- | :--- | :--- | :--- |")
        for s in sess_items:
            node = "☁️ 远程" if s.get("node_type", "").startswith("ssh:") else "🖥️ 本地"
            title = s.get("title", s["id"][:8]).replace("|", "-")
            cid = s["id"]
            state = s.get("state", "UNKNOWN")
            st_icon = "🟢" if state in ("BUSY", "IDLE") else ("🎉" if state == "COMPLETED" else "⏸️")
            step = s.get("current_step", 0)
            sent = s.get("sent_count", 0)
            snippet = (s.get("last_snippet") or s.get("prompt") or "").replace("|", "-").replace("\n", " ")[:60]
            md.append(f"| {node} | **{title}** | `{cid[:8]}..` | {st_icon} {state} | Step {step} | {sent} 轮 | {snippet} |")

        md.append("\n---\n*Report generated automatically by Antigravity Auto-Pilot Engine.*")
        return "\n".join(md)

    def _get_step_info(self, node: str, conv_id: str):
        # 1. 远程 SSH 检查
        if node.startswith("ssh:"):
            host = node.split("ssh:")[1]
            try:
                res = run_ssh(host, f"python3 /root/.gemini/antigravity-ide/bin/remote_status.py {conv_id}", timeout=6.0)
                if res.returncode == 0:
                    for line in reversed(res.stdout.strip().split("\n")):
                        line = line.strip()
                        if line.startswith("{") and line.endswith("}"):
                            data = json.loads(line)
                            step_idx = data.get("step_index", -1)
                            finished = data.get("is_turn_complete", False)
                            snippet = data.get("snippet", "")
                            content_lower = snippet.lower()
                            is_completed = finished and any(k in content_lower for k in COMPLETION_KEYWORDS)
                            return step_idx, finished, is_completed, snippet
                else:
                    return -1, False, False, f"远程离线/拒绝连接: {res.stderr.strip()[:40]}"
            except Exception as e:
                return -1, False, False, f"检测异常: {e}"
            return -1, False, False, ""

        # 2. 本地检查
        transcript_path = os.path.join(BRAIN_DIR, conv_id, ".system_generated", "logs", "transcript.jsonl")
        if not os.path.exists(transcript_path):
            return -1, False, False, ""
        try:
            with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = [l.strip() for l in f if l.strip()]
            if not lines:
                return -1, False, False, ""

            last_step = None
            for line_str in reversed(lines[-5:]):
                try:
                    last_step = json.loads(line_str)
                    break
                except Exception:
                    continue
            if not last_step:
                return -1, False, False, ""

            step_idx = last_step.get("step_index", -1)
            step_type = last_step.get("type", "")
            status = last_step.get("status", "")
            tool_calls = last_step.get("tool_calls", [])
            content = str(last_step.get("content", ""))

            is_finished = (step_type == "PLANNER_RESPONSE" and status == "DONE" and len(tool_calls) == 0)
            content_lower = content.lower()
            is_completed = is_finished and any(k.lower() in content_lower for k in COMPLETION_KEYWORDS)

            return step_idx, is_finished, is_completed, content[:80].replace("\n", " ")
        except Exception:
            return -1, False, False, ""

    def get_session_transcript(self, conv_id: str, node: str = "local", limit: int = 15) -> List[Dict[str, Any]]:
        conv_id = conv_id.strip()
        if not conv_id:
            return []

        if node.startswith("ssh:"):
            host = node.split("ssh:")[1]
            try:
                cmd = f"python3 /root/.gemini/antigravity-ide/bin/remote_status.py --transcript {conv_id} {limit}"
                res = run_ssh(host, cmd, timeout=7.0)
                if res.returncode == 0:
                    for line in reversed(res.stdout.strip().split("\n")):
                        line = line.strip()
                        if line.startswith("{") and line.endswith("}"):
                            data = json.loads(line)
                            return data.get("steps", [])
            except Exception:
                pass
            return []

        # Local lookup
        target_dir = os.path.join(BRAIN_DIR, conv_id)
        if not os.path.exists(target_dir):
            import glob
            matches = glob.glob(os.path.join(BRAIN_DIR, conv_id + "*"))
            if matches:
                target_dir = matches[0]

        transcript_path = os.path.join(target_dir, ".system_generated", "logs", "transcript.jsonl")
        if not os.path.exists(transcript_path):
            return []

        try:
            with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = [l.strip() for l in f if l.strip()]

            steps = []
            for line_str in lines[-limit:]:
                try:
                    step = json.loads(line_str)
                    content = str(step.get("content", "")).strip()
                    if "<USER_REQUEST>" in content:
                        content = content.split("<USER_REQUEST>")[1].split("</USER_REQUEST>")[0].strip()
                    tool_names = [t.get("name") or t.get("tool") or "tool" for t in step.get("tool_calls", []) if isinstance(t, dict)]
                    steps.append({
                        "step_index": step.get("step_index", -1),
                        "type": step.get("type", ""),
                        "source": step.get("source", ""),
                        "status": step.get("status", ""),
                        "tool_calls": tool_names,
                        "content": content[:600] if len(content) > 600 else content,
                    })
                except Exception:
                    continue
            return steps
        except Exception:
            return []

    def _worker_loop(self):
        """High-performance concurrent loop servicing all active sessions."""
        while True:
            try:
                # 1. 外部 config.json 热重载检测
                try:
                    if os.path.exists(CONFIG_PATH):
                        mtime = os.path.getmtime(CONFIG_PATH)
                        if self._last_config_mtime > 0 and (mtime - self._last_config_mtime > 0.05):
                            self.load_config(is_reload=True)
                except Exception:
                    pass

                with self.lock:
                    if not self.is_running:
                        active_sessions = []
                    else:
                        active_sessions = [dict(s) for s in self.sessions.values() if s.get("enabled")]


                if not active_sessions:
                    time.sleep(1.0)
                    continue

                now = time.time()

                # 2. 自动嗅探与纳管新活动会话 (Auto-adopt sessions)
                if self.strategy.get("auto_adopt_sessions") and (now - self._last_auto_adopt_check > 25.0):
                    self._last_auto_adopt_check = now
                    try:
                        recent_convs = self.scan_conversations(node="local", limit=6, force=True)
                        for c in recent_convs:
                            cid = c.get("id")
                            if cid and cid not in self.sessions and c.get("step_count", 0) >= 1:
                                prev = c.get("preview", "")[:35] or f"本地·{cid[:8]}"
                                self.add_session(
                                    conv_id=cid,
                                    node_type="local",
                                    title=prev,
                                    prompt=self.continue_prompt or "继续",
                                    cooldown=max(1.0, float(self.idle_delay_seconds)),
                                    max_turns=9999,
                                    enabled=True
                                )
                                self.add_log(f"自动嗅探并纳管新活动会话 [{prev}] (当前第 {c.get('step_count')} 步)", "SUCCESS", session_tag="AUTO-ADOPT")
                    except Exception:
                        pass

                # Process all active sessions concurrently using thread pool
                futures = {
                    self.executor.submit(self._get_step_info, s["node_type"], s["id"]): s
                    for s in active_sessions
                }

                for future in concurrent.futures.as_completed(futures, timeout=10.0):
                    s = futures[future]
                    cid = s["id"]
                    try:
                        step_idx, finished, is_completed, snippet = future.result()
                    except Exception as e:
                        step_idx, finished, is_completed, snippet = -1, False, False, str(e)

                    # State machine transition for this session
                    with self.lock:
                        curr = self.sessions.get(cid)
                        if not curr or not curr.get("enabled"):
                            continue

                        curr["current_step"] = step_idx
                        curr["last_snippet"] = snippet
                        curr["updated_at"] = now

                        # 1. 任务完成判定
                        if is_completed:
                            curr["state"] = "COMPLETED"
                            curr["enabled"] = False
                            self.add_log(f"🎉 达成任务完工声明: '{snippet}'", "SUCCESS", session_tag=curr["title"][:10])
                            self.send_webhook("COMPLETE", curr["title"], cid, f"达成完工目标声明: {snippet}")
                            self.save_config()
                            continue

                        # 2. 步骤完结判定与消抖
                        if finished and step_idx != curr["last_handled_step"]:
                            if curr["idle_start_time"] is None:
                                curr["idle_start_time"] = now
                                curr["state"] = "STABILIZING"

                            elapsed = now - curr["idle_start_time"]
                            remain = max(0.0, curr["cooldown"] - elapsed)
                            curr["cooldown_remaining"] = round(remain, 1)

                            if elapsed >= curr["cooldown"]:
                                curr["state"] = "TRIGGERING"
                                curr["sent_count"] += 1
                                current_count = curr["sent_count"]
                                curr["last_handled_step"] = step_idx
                                curr["idle_start_time"] = None
                                curr["cooldown_remaining"] = 0.0
                                p_text = curr["prompt"]
                                node = curr["node_type"]
                                title = curr["title"]
                                max_t = curr["max_turns"]

                                # Trigger outside lock
                                threading.Thread(
                                    target=self._async_inject,
                                    args=(node, cid, p_text, current_count, step_idx, title, max_t),
                                    daemon=True
                                ).start()
                        else:
                            curr["idle_start_time"] = None
                            curr["cooldown_remaining"] = 0.0
                            if step_idx == -1 and "拒绝连接" in snippet:
                                curr["state"] = "OFFLINE"
                                curr["busy_start_time"] = None
                                curr["busy_duration"] = 0
                            elif not finished:
                                curr["state"] = "BUSY"
                                if curr.get("busy_start_time") is None:
                                    curr["busy_start_time"] = now
                                curr["busy_duration"] = int(now - curr["busy_start_time"])
                            else:
                                curr["state"] = "IDLE"
                                curr["busy_start_time"] = None
                                curr["busy_duration"] = 0

            except Exception as e:
                print(f"[Worker Error] {e}", flush=True)

            time.sleep(1.2)

    def _async_inject(self, node: str, cid: str, p_text: str, current_count: int,
                      step_idx: int, title: str, max_t: int):
        with self.lock:
            self.injection_timestamps.append(time.time())
        self.add_log(f"检测到第 {step_idx} 步完成，自动注入第 {current_count} 轮: \"{p_text}\"", "TRIGGER", session_tag=title[:10])
        self.send_webhook("TRIGGER", title, cid, f"检测到第 {step_idx} 步完成，已注入第 {current_count} 轮: \"{p_text}\"")
        ok = self.send_message(node, cid, p_text)
        if not ok:
            self.send_webhook("ERROR", title, cid, f"第 {current_count} 轮指令注入失败")
            with self.lock:
                if cid in self.sessions and self.strategy.get("smart_backoff", True):
                    fail_count = self.sessions[cid].get("fail_count", 0) + 1
                    self.sessions[cid]["fail_count"] = fail_count
                    backoff = min(60.0, self.sessions[cid].get("cooldown", 3.0) * (1.6 ** fail_count))
                    self.sessions[cid]["cooldown_remaining"] = round(backoff, 1)
        else:
            with self.lock:
                if cid in self.sessions:
                    self.sessions[cid]["fail_count"] = 0

        if current_count >= max_t:
            with self.lock:
                if cid in self.sessions:
                    self.sessions[cid]["enabled"] = False
                    self.sessions[cid]["state"] = "STOPPED"
            self.add_log(f"已达到最大轮数 ({max_t})，会话自驱完成并安全退出。", "SUCCESS", session_tag=title[:10])
            self.send_webhook("COMPLETE", title, cid, f"已达到最大设定轮数 ({max_t})，安全完成巡航。")
            self.save_config()

    def get_status_payload(self) -> Dict[str, Any]:
        with self.lock:
            lsp_exists = os.path.exists(LS_EXE) or os.path.exists(AGENTAPI_BAT)
            sess_list = list(self.sessions.values())
            running_sessions = [s for s in sess_list if s.get("enabled")]
            busy_sessions = [s for s in sess_list if s.get("state") == "BUSY"]
            stabilizing_sessions = [s for s in sess_list if s.get("state") == "STABILIZING"]
            total_sent = sum(s.get("sent_count", 0) for s in sess_list)

            # Fallback legacy fields for single-session backward compatibility
            primary = running_sessions[0] if running_sessions else (sess_list[0] if sess_list else {})

            return {
                "running": len(running_sessions) > 0,
                "fleet_running": len(running_sessions) > 0,
                "active_count": len(running_sessions),
                "total_count": len(sess_list),
                "busy_count": len(busy_sessions),
                "stabilizing_count": len(stabilizing_sessions),
                "total_sent_count": total_sent,
                "sessions": sess_list,
                "node_type": self.node_type,
                "lsp_ok": lsp_exists or any(s.get("node_type", "").startswith("ssh:") for s in sess_list),
                "lsp_path": LS_EXE if os.path.exists(LS_EXE) else AGENTAPI_BAT,
                "pid": os.getpid(),

                # Legacy compatibility
                "state": primary.get("state", "STOPPED"),
                "target_conv_id": primary.get("id", ""),
                "prompt_text": primary.get("prompt", "继续"),
                "cooldown_seconds": primary.get("cooldown", 3.0),
                "cooldown_remaining": primary.get("cooldown_remaining", 0.0),
                "sent_count": primary.get("sent_count", 0),
                "current_step": primary.get("current_step", 0),
                "last_snippet": primary.get("last_snippet", "")
            }


# Singleton daemon instance
daemon = MultiSessionDaemon()


class AutoPilotHTTPHandler(SimpleHTTPRequestHandler):
    """Custom request handler with REST API support and static file serving."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, format, *args):
        pass

    def send_json(self, data: Any, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]

        if path == "/api/status":
            self.send_json(daemon.get_status_payload())
        elif path == "/api/conversations":
            node = daemon.node_type
            if "node=" in self.path:
                node = self.path.split("node=")[1].split("&")[0]
            force = ("force=1" in self.path)
            convs = daemon.scan_conversations(node=node, limit=40, force=force)
            self.send_json(convs)
        elif path == "/api/logs":
            with daemon.lock:
                logs_list = list(daemon.logs)
            self.send_json(logs_list)
        elif path == "/api/telemetry":
            self.send_json(daemon.get_telemetry_payload())
        elif path == "/api/webhook":
            with daemon.lock:
                wh = dict(daemon.webhook)
            self.send_json(wh)
        elif path == "/api/strategy":
            with daemon.lock:
                st = dict(daemon.strategy)
            self.send_json(st)
        elif path == "/api/config/export":
            with daemon.lock:
                export_data = {
                    "node_type": daemon.node_type,
                    "monitored_sessions": list(daemon.sessions.values()),
                    "webhook": daemon.webhook,
                    "strategy": daemon.strategy,
                    "exported_at": time.time(),
                    "version": "2.2.0"
                }
            self.send_json(export_data)
        elif path == "/api/fleet/report":
            report_md = daemon.generate_report()
            self.send_json({"ok": True, "report": report_md})
        elif path == "/api/sessions/transcript":
            cid = ""
            node = "local"
            limit = 12
            if "conv_id=" in self.path:
                cid = self.path.split("conv_id=")[1].split("&")[0]
            if "node=" in self.path:
                node = self.path.split("node=")[1].split("&")[0]
            if "limit=" in self.path:
                try:
                    limit = int(self.path.split("limit=")[1].split("&")[0])
                except Exception:
                    pass
            steps = daemon.get_session_transcript(cid, node=node, limit=limit)
            self.send_json({"ok": True, "conv_id": cid, "steps": steps})
        elif path == "/preview" or path == "/preview/":
            seagent_dir = os.path.join(os.path.dirname(APP_DIR), "seagent2.1")
            preview_file = os.path.join(seagent_dir, "preview.html")
            if os.path.exists(preview_file):
                with open(preview_file, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            else:
                self.send_response(404)
                self.end_headers()
        elif path.startswith("/preview/"):
            rel_file = path[len("/preview/"):]
            seagent_dir = os.path.join(os.path.dirname(APP_DIR), "seagent2.1")
            target_file = os.path.normpath(os.path.join(seagent_dir, rel_file))
            # 🛡️ Sentinel: Fix path traversal by using commonpath instead of startswith
            if os.path.commonpath([target_file, seagent_dir]) == seagent_dir and os.path.exists(target_file) and os.path.isfile(target_file):
                mime = "text/plain"
                if target_file.endswith(".html"): mime = "text/html; charset=utf-8"
                elif target_file.endswith(".js"): mime = "application/javascript; charset=utf-8"
                elif target_file.endswith(".css") or target_file.endswith(".wxss"): mime = "text/css; charset=utf-8"
                elif target_file.endswith(".json"): mime = "application/json; charset=utf-8"
                elif target_file.endswith(".png"): mime = "image/png"
                elif target_file.endswith(".jpg"): mime = "image/jpeg"
                with open(target_file, "rb") as f:
                    data = f.read()
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_response(404)
                self.end_headers()
        else:
            super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        content_len = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(content_len) if content_len > 0 else b"{}"

        try:
            body = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
        except Exception:
            body = {}

        if path == "/api/set_node":
            node = body.get("node_type", "local").strip()
            daemon.set_node(node)
            self.send_json({
                "ok": True,
                "node_type": daemon.node_type,
                "status": daemon.get_status_payload(),
                "conversations": daemon.scan_conversations(node=node, limit=40, force=True)
            })

        # Multi-Session Fleet Endpoints
        elif path == "/api/sessions/add":
            cid = body.get("conv_id", "").strip()
            node = body.get("node_type", daemon.node_type).strip()
            title = body.get("title", "").strip()
            prompt = body.get("prompt", "继续").strip()
            cooldown = float(body.get("cooldown", 3.0))
            max_turns = int(body.get("max_turns", 9999))
            enabled = bool(body.get("enabled", True))
            ok = daemon.add_session(cid, node, title, prompt, cooldown, max_turns, enabled)
            self.send_json({"ok": ok, "status": daemon.get_status_payload()})

        elif path == "/api/sessions/remove":
            cid = body.get("conv_id", "").strip()
            ok = daemon.remove_session(cid)
            self.send_json({"ok": ok, "status": daemon.get_status_payload()})

        elif path == "/api/sessions/toggle":
            cid = body.get("conv_id", "").strip()
            enabled = body.get("enabled", None)
            ok = daemon.toggle_session(cid, enabled)
            self.send_json({"ok": ok, "status": daemon.get_status_payload()})

        elif path == "/api/sessions/update":
            cid = body.get("conv_id", "").strip()
            ok = daemon.update_session(cid, body)
            self.send_json({"ok": ok, "status": daemon.get_status_payload()})

        elif path == "/api/sessions/trigger_once":
            cid = body.get("conv_id", "").strip()
            text = body.get("text", None)
            ok = daemon.trigger_session(cid, text)
            self.send_json({"ok": ok, "status": daemon.get_status_payload()})

        elif path == "/api/sessions/pin":
            cid = body.get("conv_id", "").strip()
            pinned = bool(body.get("pinned", False))
            with daemon.lock:
                if cid in daemon.sessions:
                    daemon.sessions[cid]["pinned"] = pinned
            daemon.save_config()
            self.send_json({"ok": True, "conv_id": cid, "pinned": pinned, "status": daemon.get_status_payload()})

        elif path == "/api/sessions/start_all":
            daemon.start_all()
            self.send_json({"ok": True, "status": daemon.get_status_payload()})

        elif path == "/api/sessions/stop_all":
            daemon.stop_all()
            self.send_json({"ok": True, "status": daemon.get_status_payload()})

        elif path == "/api/sessions/batch_toggle":
            cids = body.get("conv_ids", [])
            enabled = bool(body.get("enabled", True))
            count = daemon.batch_toggle(cids, enabled)
            self.send_json({"ok": True, "count": count, "status": daemon.get_status_payload()})

        elif path == "/api/sessions/batch_remove":
            cids = body.get("conv_ids", [])
            count = daemon.batch_remove(cids)
            self.send_json({"ok": True, "count": count, "status": daemon.get_status_payload()})

        elif path == "/api/sessions/batch_update":
            cids = body.get("conv_ids", [])
            prompt = body.get("prompt")
            cooldown = body.get("cooldown")
            count = daemon.batch_update(cids, prompt, cooldown)
            self.send_json({"ok": True, "count": count, "status": daemon.get_status_payload()})

        elif path == "/api/config/import":
            monitored = body.get("monitored_sessions", [])
            if not isinstance(monitored, list):
                self.send_json({"ok": False, "message": "无效配置 (缺少 monitored_sessions)"}, status=400)
            else:
                with daemon.lock:
                    for s in monitored:
                        cid = s.get("id", "").strip()
                        if not cid:
                            continue
                        daemon.sessions[cid] = {
                            "id": cid,
                            "node_type": s.get("node_type", "local"),
                            "title": s.get("title", cid[:12]),
                            "prompt": s.get("prompt", "继续"),
                            "cooldown": float(s.get("cooldown", 3.0)),
                            "max_turns": int(s.get("max_turns", 9999)),
                            "enabled": bool(s.get("enabled", True)),
                            "state": "IDLE" if s.get("enabled", True) else "STOPPED",
                            "current_step": s.get("current_step", 0),
                            "last_handled_step": -1,
                            "sent_count": s.get("sent_count", 0),
                            "cooldown_remaining": 0.0,
                            "idle_start_time": None,
                            "last_snippet": "",
                            "error": "",
                            "updated_at": time.time(),
                            "busy_start_time": None,
                            "busy_duration": 0
                        }
                    if "webhook" in body and isinstance(body["webhook"], dict):
                        daemon.webhook.update(body["webhook"])
                    if "strategy" in body and isinstance(body["strategy"], dict):
                        daemon.strategy.update(body["strategy"])
                daemon.save_config()
                daemon.add_log(f"成功导入并合并 {len(monitored)} 个会话配置！", "SUCCESS")
                self.send_json({"ok": True, "count": len(monitored), "status": daemon.get_status_payload()})

        # Legacy Compatibility Endpoints
        elif path == "/api/start":
            cid = body.get("conv_id", "").strip()
            node = body.get("node_type", daemon.node_type).strip()
            prompt = body.get("prompt", "继续").strip()
            cooldown = float(body.get("cooldown", 3.0))
            max_turns = int(body.get("max_turns", 9999))
            if cid:
                daemon.add_session(cid, node, "", prompt, cooldown, max_turns, enabled=True)
            daemon.start_all()
            self.send_json({"ok": True, "message": "全矩阵自驱巡航已启动", "status": daemon.get_status_payload()})

        elif path == "/api/stop":
            daemon.stop_all()
            self.send_json({"ok": True, "message": "自驱巡航已停止", "status": daemon.get_status_payload()})

        elif path == "/api/trigger_once":
            cid = body.get("conv_id", "").strip()
            text = body.get("text", "")
            if not cid:
                with daemon.lock:
                    if daemon.sessions:
                        cid = list(daemon.sessions.keys())[0]
            ok = daemon.trigger_session(cid, text) if cid else False
            self.send_json({"ok": ok, "message": "已发送单次注入" if ok else "发送失败"})

        elif path == "/api/save_config":
            daemon.save_config()
            self.send_json({"ok": True, "message": "配置已保存"})

        elif path == "/api/clear_logs":
            with daemon.lock:
                daemon.logs.clear()
            self.send_json({"ok": True, "message": "日志已清空"})

        elif path == "/api/webhook/update":
            with daemon.lock:
                daemon.webhook["enabled"] = bool(body.get("enabled", False))
                daemon.webhook["url"] = body.get("url", "").strip()
                daemon.webhook["platform"] = body.get("platform", "feishu").strip()
                daemon.webhook["notify_on_trigger"] = bool(body.get("notify_on_trigger", False))
                daemon.webhook["notify_on_complete"] = bool(body.get("notify_on_complete", True))
                daemon.webhook["notify_on_error"] = bool(body.get("notify_on_error", True))
            daemon.save_config()
            daemon.add_log(f"已更新 Webhook 配置: 平台={daemon.webhook['platform']}, 启用={daemon.webhook['enabled']}", "SUCCESS", session_tag="CONFIG")
            self.send_json({"ok": True, "webhook": daemon.webhook})

        elif path == "/api/webhook/test":
            url = body.get("url", "").strip() or daemon.webhook.get("url", "")
            platform = body.get("platform", "").strip() or daemon.webhook.get("platform", "feishu")
            ok, msg = daemon.test_webhook(url, platform)
            self.send_json({"ok": ok, "message": msg})

        elif path == "/api/strategy/update":
            with daemon.lock:
                if "smart_backoff" in body:
                    daemon.strategy["smart_backoff"] = bool(body["smart_backoff"])
                if "auto_archive_completed" in body:
                    daemon.strategy["auto_archive_completed"] = bool(body["auto_archive_completed"])
                if "auto_adopt_sessions" in body:
                    daemon.strategy["auto_adopt_sessions"] = bool(body["auto_adopt_sessions"])
                if "stall_alert_seconds" in body:
                    daemon.strategy["stall_alert_seconds"] = max(30, int(body["stall_alert_seconds"]))
            daemon.save_config()
            self.send_json({"ok": True, "strategy": daemon.strategy})

        elif path == "/api/ssh/ping":
            host = body.get("host", "").strip() or "seetacloud-westc"
            t0 = time.time()
            try:
                res = run_ssh(host, "echo __ANTIGRAVITY_PONG__ && test -x /root/.gemini/antigravity-ide/bin/agentapi_auto.sh && echo __AGENTAPI_OK__", timeout=6.0)
                latency_ms = round((time.time() - t0) * 1000, 1)
                out = res.stdout or ""
                if res.returncode == 0 and "__ANTIGRAVITY_PONG__" in out:
                    agentapi_ok = "__AGENTAPI_OK__" in out
                    self.send_json({
                        "ok": True,
                        "host": host,
                        "latency_ms": latency_ms,
                        "agentapi_ok": agentapi_ok,
                        "status": "ONLINE"
                    })
                else:
                    err = res.stderr.strip() or res.stdout.strip() or "SSH 连接超时或握手失败"
                    self.send_json({
                        "ok": False,
                        "host": host,
                        "error": err,
                        "latency_ms": latency_ms,
                        "status": "OFFLINE"
                    })
            except Exception as e:
                self.send_json({
                    "ok": False,
                    "host": host,
                    "error": str(e),
                    "status": "ERROR"
                })

        elif path == "/api/restart":
            self.send_json({"ok": True, "message": "服务正在重启中..."})
            def restart_worker():
                time.sleep(0.5)
                daemon.stop_all()
                try:
                    if getattr(sys, "frozen", False):
                        subprocess.Popen([sys.executable], cwd=APP_DIR)
                    else:
                        launcher_script = os.path.join(APP_DIR, "app_launcher.py")
                        target = launcher_script if os.path.exists(launcher_script) else os.path.abspath(__file__)
                        subprocess.Popen([sys.executable, target], cwd=APP_DIR)
                except Exception as e:
                    print(f"Restart error: {e}", flush=True)
                os._exit(0)
            threading.Thread(target=restart_worker, daemon=True).start()

        else:
            self.send_json({"error": "Unknown endpoint"}, 404)


class DualStackHTTPServer(ThreadingHTTPServer):
    """Dual-stack HTTP server enabling simultaneous IPv4 and IPv6 handling."""
    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except Exception:
            pass
        super().server_bind()


def make_http_server(port: int):
    try:
        class IPv6DualStack(DualStackHTTPServer):
            address_family = socket.AF_INET6
        return IPv6DualStack(("", port), AutoPilotHTTPHandler)
    except Exception:
        return ThreadingHTTPServer(("0.0.0.0", port), AutoPilotHTTPHandler)


def main():
    if not os.path.exists(WEB_DIR):
        os.makedirs(WEB_DIR, exist_ok=True)

    server = make_http_server(PORT)
    daemon.add_log(f"⚡ 多会话并发控制中心已就绪: http://localhost:{PORT}", "SUCCESS")
    print("=" * 68)
    print("   ⚡ Antigravity Auto-Pilot 多会话并发巡航控制中心 (Fleet Engine)")
    print("=" * 68)
    print(f"[*] 本地 Web 控制台 : http://localhost:{PORT}")
    print(f"[*] 当前纳管会话数 : {len(daemon.sessions)} 个")
    print("按 Ctrl+C 退出 Web 服务\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n正在停止服务...")
    finally:
        daemon.stop_all()
        server.server_close()
        print("[*] 服务已退出。")


if __name__ == "__main__":
    main()
