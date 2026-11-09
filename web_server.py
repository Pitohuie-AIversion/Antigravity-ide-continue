#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Antigravity Auto-Pilot Web 控制中心与自驱巡航守护服务 (Dual Node: Local & Remote SSH)
==================================================================================
支持：
  1. 🏠 本地电脑 Antigravity IDE 对话自动巡航与静默指令注入
  2. ☁️ 远程 SSH 主机（如 seetacloud-westc 恒源云节点）对话环境自动对接、心跳保活与静默注入
  3. 双向无感控制台，实时步骤监控、冷却倒计时、声音提示与日志审计
"""

import os
import sys
import json
import time
import socket
import subprocess
import threading
from collections import deque
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from typing import Dict, Any, List, Optional

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
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
WEB_DIR = os.path.join(os.path.dirname(__file__), "web")

COMPLETION_KEYWORDS = [
    "所有任务已完成", "全部任务已完成", "所有需求已完成",
    "已全部完成", "代码修改已全部完成", "all tasks completed",
    "goal_complete"
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
        "-o", "ConnectTimeout=5",
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


class AutoPilotDaemon:
    """Core daemon managing local & remote SSH inspection and injection loops."""

    def __init__(self):
        self.lock = threading.RLock()
        self.node_type = "local"  # "local" or "ssh:seetacloud-westc"
        self.remote_host = "seetacloud-westc"
        self.is_running = False
        self.state_name = "STOPPED"  # STOPPED, IDLE, BUSY, STABILIZING, TRIGGERING, COMPLETED
        self.target_conv_id = ""
        self.is_locked = False
        self.prompt_text = "继续"
        self.cooldown_seconds = 3.0
        self.max_turns = 9999
        self.sent_count = 0
        self.current_step = 0
        self.last_snippet = ""
        self.cooldown_remaining = 0.0
        self.idle_start_time = None
        self.last_handled_step = -1
        self.worker_thread: Optional[threading.Thread] = None
        self.logs = deque(maxlen=250)

        self.cached_convs: List[Dict[str, Any]] = []
        self.last_convs_time = 0.0

        # Load initial config if present
        self.load_config()

        # Start SSH keepalive background thread
        self._start_ssh_keepalive()

    def add_log(self, text: str, level: str = "INFO"):
        ts = time.strftime("%H:%M:%S")
        entry = {
            "timestamp": ts,
            "level": level,
            "text": text
        }
        with self.lock:
            self.logs.append(entry)
        print(f"[{ts}] [{level}] {text}")

    def _start_ssh_keepalive(self):
        def keepalive_worker():
            while True:
                time.sleep(25)
                with self.lock:
                    nt = self.node_type
                if nt.startswith("ssh:"):
                    host = nt.split("ssh:")[1]
                    try:
                        run_ssh(host, "true", timeout=5.0)
                    except Exception:
                        pass
        t = threading.Thread(target=keepalive_worker, daemon=True)
        t.start()

    def load_config(self):
        if os.path.exists(CONFIG_PATH):
            try:
                with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    self.node_type = cfg.get("node_type", "local")
                    self.target_conv_id = cfg.get("target_conversation_id", "").strip()
                    self.cooldown_seconds = float(cfg.get("idle_delay_seconds", 3))
                    self.max_turns = int(cfg.get("max_turns", 9999))
                    self.prompt_text = cfg.get("continue_prompt", "继续")
                    self.is_locked = bool(self.target_conv_id)
            except Exception as e:
                self.add_log(f"加载 config.json 失败: {e}", "WARN")

        # Fallback to latest conversation if empty
        if not self.target_conv_id:
            recent = self.scan_conversations(limit=1, force=True)
            if recent:
                self.target_conv_id = recent[0]["id"]

    def save_config(self, cfg_data: Dict[str, Any]):
        try:
            current = {}
            if os.path.exists(CONFIG_PATH):
                with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                    current = json.load(f)
            current.update(cfg_data)
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(current, f, ensure_ascii=False, indent=2)
            self.add_log("配置已更新并持久化至 config.json", "SUCCESS")
        except Exception as e:
            self.add_log(f"保存 config.json 失败: {e}", "ERROR")

    def set_node(self, node_type: str):
        with self.lock:
            old_node = self.node_type
            self.node_type = node_type
            self.cached_convs = []
            self.last_convs_time = 0.0
            if old_node != node_type:
                self.target_conv_id = ""
                self.idle_start_time = None
                self.last_handled_step = -1
                self.sent_count = 0
                self.current_step = 0
                self.last_snippet = ""
                if self.is_running:
                    self.is_running = False
                    self.state_name = "STOPPED"

        self.add_log(f"已切换工作节点 -> {node_type}", "INFO")
        convs = self.scan_conversations(limit=1, force=True)
        if convs:
            with self.lock:
                self.target_conv_id = convs[0]["id"]
            self.add_log(f"已自动对准该节点最新活跃会话: [{self.target_conv_id[:8]}...]", "SUCCESS")
        self.save_config({"node_type": node_type, "target_conversation_id": self.target_conv_id})

    def scan_conversations(self, limit: int = 50, force: bool = False) -> List[Dict[str, Any]]:
        with self.lock:
            node = self.node_type
            target_id = self.target_conv_id
            cached = list(self.cached_convs)
            last_t = self.last_convs_time

        now = time.time()
        if not force and (now - last_t < 15.0) and cached:
            for c in cached:
                c["is_current"] = (c["id"] == target_id)
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
                            for c in data:
                                c["is_current"] = (c["id"] == target_id)
                            with self.lock:
                                self.cached_convs = data
                                self.last_convs_time = now
                            return data
            except Exception as e:
                self.add_log(f"远程节点 [{host}] 扫描会话失败: {e}", "WARN")
            return cached or []

        # 2. 本地扫描
        if not os.path.exists(BRAIN_DIR):
            return []

        convs = []
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
                    "is_remote": False,
                    "is_current": (entry == target_id)
                })

        convs.sort(key=lambda x: x["mtime"], reverse=True)
        res_list = convs[:limit]
        with self.lock:
            self.cached_convs = res_list
            self.last_convs_time = now
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
                        # Clean xml-like tags if present
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
                lines = [l for l in f if l.strip()]
                return len(lines)
        except Exception:
            return 0

    def send_message(self, conv_id: str, text: str) -> bool:
        with self.lock:
            node = self.node_type

        # 1. 远程 SSH 注入
        if node.startswith("ssh:"):
            host = node.split("ssh:")[1]
            try:
                cmd_str = f"/root/.gemini/antigravity-ide/bin/agentapi_auto.sh send-message {conv_id} {json.dumps(text)}"
                res = run_ssh(host, cmd_str, timeout=12.0)
                if res.returncode == 0:
                    self.add_log(f"成功向远程 [{host} / {conv_id[:8]}...] 注入指令: \"{text}\"", "TRIGGER")
                    return True
                else:
                    err_msg = res.stderr.strip() or res.stdout.strip()
                    self.add_log(f"远程注入失败 ({host}): {err_msg}", "ERROR")
                    return False
            except Exception as e:
                self.add_log(f"远程注入异常: {e}", "ERROR")
                return False

        # 2. 本地注入
        cmd = []
        if os.path.exists(LS_EXE):
            cmd = [LS_EXE, "agentapi", "send-message", conv_id, text]
        elif os.path.exists(AGENTAPI_BAT):
            cmd = [AGENTAPI_BAT, "send-message", conv_id, text]
        else:
            self.add_log("未找到 Language Server agentapi 执行接口", "ERROR")
            return False

        try:
            startupinfo = None
            if os.name == 'nt':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

            res = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                stdin=subprocess.DEVNULL,
                startupinfo=startupinfo,
                timeout=10
            )
            if res.returncode == 0:
                self.add_log(f"成功向本地会话 [{conv_id[:8]}...] 注入指令: \"{text}\"", "TRIGGER")
                return True
            else:
                self.add_log(f"本地注入失败 (Code {res.returncode}): {res.stderr.strip()}", "ERROR")
                return False
        except Exception as e:
            self.add_log(f"本地执行进程异常: {e}", "ERROR")
            return False

    def trigger_once(self, conv_id: Optional[str] = None, text: Optional[str] = None) -> bool:
        with self.lock:
            target = conv_id or self.target_conv_id
            content = text or self.prompt_text
        if not target:
            self.add_log("未能触发：目标会话 ID 为空", "WARN")
            return False
        self.add_log(f"手动单次触发指令 -> [{target[:8]}...]", "INFO")
        ok = self.send_message(target, content)
        if ok:
            with self.lock:
                self.sent_count += 1
        return ok

    def start(self, conv_id: str, prompt: str, cooldown: float, max_turns: int, is_locked: bool) -> bool:
        with self.lock:
            if self.is_running:
                already_running = True
            else:
                already_running = False
                self.target_conv_id = conv_id or self.target_conv_id
                self.prompt_text = prompt or self.prompt_text
                self.cooldown_seconds = max(1.0, float(cooldown))
                self.max_turns = int(max_turns)
                self.is_locked = bool(is_locked)
                self.is_running = True
                self.state_name = "IDLE"
                self.idle_start_time = None
                self.last_handled_step = -1

                target_cid = self.target_conv_id
                p_text = self.prompt_text
                cd = self.cooldown_seconds
                mt = self.max_turns
                nt = self.node_type

        if already_running:
            self.add_log("守护进程已经在运行中", "WARN")
            return False

        # Save config and log outside lock to prevent any lock contention
        self.save_config({
            "node_type": nt,
            "target_conversation_id": target_cid,
            "continue_prompt": p_text,
            "idle_delay_seconds": cd,
            "max_turns": mt
        })

        node_label = f"远程 {nt}" if nt.startswith("ssh:") else "本地"
        self.add_log(f"🚀 自驱巡航已启动！节点: {node_label} · 目标会话: {target_cid[:12]}... (冷却: {cd}s)", "SUCCESS")

        with self.lock:
            self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
            self.worker_thread.start()
        return True

    def stop(self) -> bool:
        was_running = False
        with self.lock:
            if self.is_running:
                was_running = True
                self.is_running = False
                self.state_name = "STOPPED"
                self.cooldown_remaining = 0.0

        if was_running:
            self.add_log("⏹ 自驱巡航守护进程已手动停止。", "INFO")
        return was_running

    def _worker_loop(self):
        while True:
            with self.lock:
                if not self.is_running:
                    break
                cid = self.target_conv_id
                locked = self.is_locked
                cooldown = self.cooldown_seconds
                max_t = self.max_turns
                p_text = self.prompt_text
                node = self.node_type

            # Check step info
            step_idx, finished, is_completed, snippet = self._get_step_info(cid)
            now = time.time()

            with self.lock:
                self.current_step = step_idx
                self.last_snippet = snippet

            if is_completed:
                self.add_log(f"🎉 达成任务完工声明: '{snippet}'", "SUCCESS")
                self.add_log("已达成完工条件，自驱守护程序安全停止。", "SUCCESS")
                with self.lock:
                    self.is_running = False
                    self.state_name = "COMPLETED"
                break

            if finished and step_idx != self.last_handled_step:
                if self.idle_start_time is None:
                    self.idle_start_time = now
                    with self.lock:
                        self.state_name = "STABILIZING"

                elapsed = now - self.idle_start_time
                remain = max(0.0, cooldown - elapsed)
                with self.lock:
                    self.cooldown_remaining = round(remain, 1)

                if elapsed >= cooldown:
                    with self.lock:
                        self.state_name = "TRIGGERING"
                        self.sent_count += 1
                        current_count = self.sent_count
                        self.last_handled_step = step_idx
                        self.idle_start_time = None
                        self.cooldown_remaining = 0.0

                    node_tag = f"[{node}] " if node.startswith("ssh:") else ""
                    self.add_log(f"{node_tag}检测到第 {step_idx} 步完成，自动注入第 {current_count} 轮: \"{p_text}\"", "TRIGGER")
                    self.send_message(cid, p_text)

                    if current_count >= max_t:
                        self.add_log(f"已达到预设最大轮数 ({max_t})，自驱程序安全退出。", "SUCCESS")
                        with self.lock:
                            self.is_running = False
                            self.state_name = "STOPPED"
                        break
            else:
                with self.lock:
                    self.idle_start_time = None
                    self.cooldown_remaining = 0.0
                    self.state_name = "BUSY" if not finished else "IDLE"

            # Polling delay: 2.0s for remote SSH, 0.8s for local
            delay = 2.0 if node.startswith("ssh:") else 0.8
            time.sleep(delay)

    def _get_step_info(self, conv_id: str):
        with self.lock:
            node = self.node_type

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
            except Exception as e:
                return -1, False, False, f"远程检测失败: {e}"
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

            last_step = json.loads(lines[-1])
            step_idx = last_step.get("step_index", -1)
            step_type = last_step.get("type", "")
            status = last_step.get("status", "")
            tool_calls = last_step.get("tool_calls", [])
            content = str(last_step.get("content", ""))

            is_finished = (step_type == "PLANNER_RESPONSE" and status == "DONE" and len(tool_calls) == 0)
            content_lower = content.lower()
            is_completed = is_finished and any(k in content_lower for k in COMPLETION_KEYWORDS)

            return step_idx, is_finished, is_completed, content[:80].replace("\n", " ")
        except Exception:
            return -1, False, False, ""

    def get_status_payload(self) -> Dict[str, Any]:
        with self.lock:
            lsp_exists = os.path.exists(LS_EXE) or os.path.exists(AGENTAPI_BAT)
            is_remote = self.node_type.startswith("ssh:")
            return {
                "running": self.is_running,
                "state": self.state_name,
                "node_type": self.node_type,
                "is_remote": is_remote,
                "remote_host": self.node_type.split("ssh:")[1] if is_remote else "",
                "target_conv_id": self.target_conv_id,
                "is_locked": self.is_locked,
                "prompt_text": self.prompt_text,
                "cooldown_seconds": self.cooldown_seconds,
                "max_turns": self.max_turns,
                "sent_count": self.sent_count,
                "current_step": self.current_step,
                "last_snippet": self.last_snippet,
                "cooldown_remaining": self.cooldown_remaining,
                "lsp_ok": True if is_remote else lsp_exists,
                "lsp_path": (f"SSH AgentAPI ({self.node_type})" if is_remote else (LS_EXE if os.path.exists(LS_EXE) else AGENTAPI_BAT)),
                "pid": os.getpid()
            }


# Singleton daemon instance
daemon = AutoPilotDaemon()


class AutoPilotHTTPHandler(SimpleHTTPRequestHandler):
    """Custom request handler with REST API support and static file serving."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, format, *args):
        # Silence routine static request logging in terminal
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
            force = ("force=1" in self.path)
            convs = daemon.scan_conversations(limit=40, force=force)
            self.send_json(convs)
        elif path == "/api/logs":
            with daemon.lock:
                logs_list = list(daemon.logs)
            self.send_json(logs_list)
        else:
            # Fallback to static web files
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
                "conversations": daemon.scan_conversations(limit=40, force=True)
            })

        elif path == "/api/start":
            conv_id = body.get("conv_id", "").strip()
            prompt = body.get("prompt", "继续").strip()
            cooldown = float(body.get("cooldown", 3.0))
            max_turns = int(body.get("max_turns", 9999))
            is_locked = bool(body.get("is_locked", True))

            ok = daemon.start(conv_id, prompt, cooldown, max_turns, is_locked)
            self.send_json({"ok": ok, "message": "自驱程序已启动" if ok else "自驱程序已在运行中", "status": daemon.get_status_payload()})

        elif path == "/api/stop":
            ok = daemon.stop()
            self.send_json({"ok": True, "message": "自驱程序已停止", "status": daemon.get_status_payload()})

        elif path == "/api/trigger_once":
            conv_id = body.get("conv_id", "")
            text = body.get("text", "")
            ok = daemon.trigger_once(conv_id, text)
            self.send_json({"ok": ok, "message": "已发送单次注入" if ok else "发送失败"})

        elif path == "/api/save_config":
            daemon.save_config(body)
            self.send_json({"ok": True, "message": "配置已保存"})

        elif path == "/api/clear_logs":
            with daemon.lock:
                daemon.logs.clear()
            self.send_json({"ok": True, "message": "日志已清空"})

        elif path == "/api/restart":
            self.send_json({"ok": True, "message": "服务正在重启中..."})
            def restart_worker():
                time.sleep(0.5)
                daemon.stop()
                python_exe = sys.executable
                script_path = os.path.abspath(__file__)
                if os.name == 'nt':
                    subprocess.Popen([python_exe, "-u", script_path], creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS)
                else:
                    subprocess.Popen([python_exe, "-u", script_path])
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
    # Try IPv6 dual-stack (accepts [::1] and 127.0.0.1 seamlessly on Windows)
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
    daemon.add_log(f"Web 控制中心已就绪: http://localhost:{PORT}", "SUCCESS")
    print("=" * 65)
    print("   ⚡ Antigravity Auto-Pilot UI 控制中心 (Dual-Node Local/SSH)")
    print("=" * 65)
    print(f"[*] 本地 Web 控制台 : http://localhost:{PORT}")
    print(f"[*] 当前执行节点    : {daemon.node_type}")
    print(f"[*] 默认监控会话    : {daemon.target_conv_id}")
    print("按 Ctrl+C 退出 Web 服务\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n正在停止服务...")
    finally:
        daemon.stop()
        server.server_close()
        print("[*] 服务已退出。")


if __name__ == "__main__":
    main()
