# -*- coding: utf-8 -*-
"""
Antigravity Continuous Runner - Core Watcher Engine
Author: Pair Programming with Antigravity
Description:
    Monitors Antigravity IDE conversation state in real-time by inspecting
    transcript logs and automatically sends continuation prompts via the native
    Agent API (language server) when the model completes a turn and enters an idle state.
"""

import os
import sys
import json
import time
import subprocess
from enum import Enum
from typing import Dict, Any, List, Optional, Tuple, Callable

from ls_discovery import (
    resolve_brain_dir,
    resolve_ls_exe,
    resolve_agentapi_bat,
    get_active_ls_env,
    build_clean_agentapi_env,
    load_conversation_summaries,
    get_conversation_summary,
)


class AgentState(Enum):
    UNKNOWN = "UNKNOWN"
    BUSY = "BUSY"                    # Model is thinking, planning, or executing tools
    STABILIZING = "STABILIZING"      # Model finished turn, waiting for idle delay debounce
    IDLE = "IDLE"                    # Ready for continuation prompt
    WAITING_DECISION = "WAITING_DECISION"  # Waiting for human answer to a question
    COMPLETED = "COMPLETED"          # Task finished (matched completion keyword)
    PAUSED = "PAUSED"                # Paused by user
    ERROR = "ERROR"


class AntigravityWatcher:
    def __init__(
        self,
        conversation_id: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        on_state_change: Optional[Callable[[AgentState, str], None]] = None,
        on_turn_continue: Optional[Callable[[int, str], None]] = None,
        on_log: Optional[Callable[[str, str], None]] = None,
    ):
        self.config = config or {}
        self.idle_delay = self.config.get("idle_delay_seconds", 6)
        self.max_turns = self.config.get("max_turns", 50)
        self.continue_prompt = self.config.get(
            "continue_prompt",
            "请继续推进当前任务，执行下一步。若全部任务均已完成，请在回复中明确说明【所有任务已完成】。"
        )
        self.completion_keywords = [
            k.lower() for k in self.config.get("completion_keywords", [
                "所有任务已完成", "全部任务已完成", "所有需求已完成",
                "已全部完成", "代码修改已全部完成", "all tasks completed"
            ])
        ]
        self.pause_on_question = self.config.get("pause_on_question", True)
        self.sound_alert = self.config.get("sound_alert", True)

        self.on_state_change = on_state_change
        self.on_turn_continue = on_turn_continue
        self.on_log = on_log

        # Locate paths (supports Antigravity 2.0 ~/.gemini/antigravity and legacy ~/.gemini/antigravity-ide)
        self.user_home = os.path.expanduser("~")
        self.local_app_data = os.environ.get("LOCALAPPDATA", os.path.join(self.user_home, "AppData", "Local"))
        self.brain_dir = resolve_brain_dir()
        self.language_server_exe = resolve_ls_exe()
        self.agentapi_bat = resolve_agentapi_bat()

        # State tracking
        self.conversation_id = conversation_id
        self.transcript_path = ""
        self.state = AgentState.UNKNOWN
        self.turn_count = 0
        self.last_step_index = -1
        self.last_mtime = 0.0
        self.first_idle_time = 0.0
        self.is_running = False
        self.is_paused = False

    def log(self, message: str, level: str = "INFO"):
        if self.on_log:
            self.on_log(message, level)
        else:
            timestamp = time.strftime("%H:%M:%S")
            print(f"[{timestamp}] [{level}] {message}")

    def list_recent_conversations(self, limit: int = 10, include_subagents: bool = False) -> List[Dict[str, Any]]:
        """List recently active conversations sorted by modification time."""
        if not os.path.exists(self.brain_dir):
            return []

        summaries = load_conversation_summaries()
        results = []
        for entry in os.listdir(self.brain_dir):
            full_path = os.path.join(self.brain_dir, entry)
            if not os.path.isdir(full_path):
                continue
            transcript_file = os.path.join(full_path, ".system_generated", "logs", "transcript.jsonl")
            if os.path.exists(transcript_file):
                meta = summaries.get(entry, {})
                if not include_subagents and meta.get("is_subagent"):
                    continue
                mtime = os.path.getmtime(transcript_file)
                snippet = meta.get("title") or meta.get("preview") or self._get_conversation_preview(transcript_file)
                results.append({
                    "id": entry,
                    "transcript_path": transcript_file,
                    "mtime": mtime,
                    "mtime_str": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(mtime)),
                    "preview": snippet,
                    "workspace": meta.get("workspace", ""),
                    "db_status": meta.get("status", ""),
                    "is_subagent": bool(meta.get("is_subagent")),
                })

        results.sort(key=lambda x: x["mtime"], reverse=True)
        return results[:limit]

    def _get_conversation_preview(self, transcript_file: str) -> str:
        """Extract the first user prompt or snippet from transcript as a preview."""
        try:
            with open(transcript_file, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    item = json.loads(line)
                    if item.get("type") == "USER_INPUT" and item.get("content"):
                        content = str(item.get("content")).strip().replace("\n", " ")
                        return (content[:60] + "...") if len(content) > 60 else content
        except Exception:
            pass
        return "(无预览内容)"

    def attach(self, conversation_id: Optional[str] = None) -> bool:
        """Attach to a specified conversation or automatically select the most recent one."""
        if not conversation_id:
            recent = self.list_recent_conversations(limit=1)
            if not recent:
                self.log("未找到任何 Antigravity 对话记录", "ERROR")
                return False
            self.conversation_id = recent[0]["id"]
            self.transcript_path = recent[0]["transcript_path"]
            self.log(f"自动关联最新对话: {self.conversation_id}", "INFO")
        else:
            self.conversation_id = conversation_id
            self.transcript_path = os.path.join(
                self.brain_dir, self.conversation_id, ".system_generated", "logs", "transcript.jsonl"
            )
            if not os.path.exists(self.transcript_path):
                self.log(f"未找到对话日志文件: {self.transcript_path}", "ERROR")
                return False
            self.log(f"已关联对话: {self.conversation_id}", "INFO")

        return True

    def _set_state(self, new_state: AgentState, reason: str = ""):
        if self.state != new_state:
            self.state = new_state
            if self.on_state_change:
                self.on_state_change(new_state, reason)

    def read_tail_steps(self, n: int = 5) -> List[Dict[str, Any]]:
        """Read the last n steps from transcript.jsonl efficiently."""
        if not self.transcript_path or not os.path.exists(self.transcript_path):
            return []

        try:
            with open(self.transcript_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
                valid_lines = [l.strip() for l in lines if l.strip()]
                tail_lines = valid_lines[-n:] if len(valid_lines) >= n else valid_lines
                return [json.loads(l) for l in tail_lines]
        except Exception as e:
            self.log(f"读取日志异常: {e}", "WARN")
            return []

    def evaluate_status(self) -> Tuple[AgentState, str]:
        """
        Evaluate current state from transcript.
        Returns (state, description).
        """
        if self.is_paused:
            return AgentState.PAUSED, "已手动暂停监控"

        if not os.path.exists(self.transcript_path):
            return AgentState.ERROR, "日志文件不存在"

        mtime = os.path.getmtime(self.transcript_path)
        now = time.time()
        steps = self.read_tail_steps(3)

        if not steps:
            return AgentState.UNKNOWN, "对话尚无事件记录"

        last_step = steps[-1]
        step_type = last_step.get("type", "")
        status = last_step.get("status", "")
        source = last_step.get("source", "")
        tool_calls = last_step.get("tool_calls", [])
        content = str(last_step.get("content", ""))

        self.last_step_index = last_step.get("step_index", self.last_step_index)

        # Check if model explicitly called ask_question
        if self.pause_on_question and any(
            isinstance(call, dict) and "ask_question" in str(call.get("name") or call.get("tool") or "")
            for call in (tool_calls or [])
        ):
            self.first_idle_time = 0.0
            return AgentState.WAITING_DECISION, "模型正在等待用户回答问题 (ask_question)"

        # Check Antigravity 2.0 conversation_summaries.db live status (catches background tasks)
        db_running = False
        if self.conversation_id:
            summary = get_conversation_summary(self.conversation_id)
            if summary:
                db_st = summary.get("status", "")
                not_idle = bool(summary.get("not_fully_idle", False))
                if db_st in ("CASCADE_RUN_STATUS_RUNNING", "CASCADE_RUN_STATUS_BUSY", "CASCADE_RUN_STATUS_CANCELING") or not_idle:
                    db_running = True

        # Check if currently executing tool or pending response
        is_tool_running = step_type not in ["PLANNER_RESPONSE", "USER_INPUT"]
        has_pending_tools = len(tool_calls) > 0
        is_model_done = (step_type == "PLANNER_RESPONSE" and status == "DONE" and not has_pending_tools and not db_running)

        # Check completion keywords in model final content
        if is_model_done and content:
            lower_content = content.lower()
            for kw in self.completion_keywords:
                if kw in lower_content:
                    return AgentState.COMPLETED, f"检测到任务完成关键字: 【{kw}】"

        if is_tool_running or has_pending_tools or db_running or (not is_model_done):
            self.first_idle_time = 0.0
            reason = "后台任务/子代理执行中" if db_running else f"模型正在执行中 (Step {self.last_step_index}, {step_type})"
            return AgentState.BUSY, reason

        # If model is done, verify idle stability delay
        if self.first_idle_time == 0.0:
            self.first_idle_time = now

        elapsed_idle = now - self.first_idle_time
        if elapsed_idle < self.idle_delay:
            remaining = int(self.idle_delay - elapsed_idle) + 1
            return AgentState.STABILIZING, f"模型已完成回答，冷却确认中 (剩余 {remaining}s)..."

        # Check max turns
        if self.turn_count >= self.max_turns:
            return AgentState.COMPLETED, f"已达到设定的最大继续轮数限制 ({self.max_turns})"

        return AgentState.IDLE, "模型就绪，等待发送继续指令"

    def send_continue_prompt(self, custom_prompt: Optional[str] = None) -> bool:
        """Send continuation message into Antigravity IDE conversation queue."""
        prompt_to_send = custom_prompt or self.continue_prompt
        next_turn = self.turn_count + 1

        self.log(f"触发第 {next_turn} 轮自动继续...", "INFO")
        success = self._send_message_via_agentapi(prompt_to_send)

        if success:
            self.turn_count = next_turn
            if self.on_turn_continue:
                self.on_turn_continue(self.turn_count, prompt_to_send)
            self._play_chime()
            # Reset idle time
            self.first_idle_time = 0.0
        else:
            self.log("发送继续指令失败，请检查 Language Server 是否运行", "ERROR")

        return success

    def _send_message_via_agentapi(self, message: str) -> bool:
        """Call language server agentapi send-message directly."""
        cmd = []
        if os.path.exists(self.language_server_exe):
            cmd = [self.language_server_exe, "agentapi", "send-message", self.conversation_id, message]
        elif os.path.exists(self.agentapi_bat):
            cmd = [self.agentapi_bat, "send-message", self.conversation_id, message]
        else:
            self.log("未找到 agentapi 可执行程序", "ERROR")
            return False

        try:
            # Run without opening popup window on Windows
            startupinfo = None
            if os.name == 'nt':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

            addr, token = get_active_ls_env()
            run_env = build_clean_agentapi_env(addr=addr, token=token)

            res = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                stdin=subprocess.DEVNULL,
                env=run_env,
                startupinfo=startupinfo,
                timeout=15
            )


            if res.returncode == 0:
                self.log(f"已成功注入指令到对话队列: \"{message[:30]}...\"", "SUCCESS")
                return True
            else:
                self.log(f"agentapi 返回错误 (code {res.returncode}): {res.stderr or res.stdout}", "ERROR")
                return False
        except Exception as e:
            self.log(f"调用 agentapi 失败: {e}", "ERROR")
            return False

    def _play_chime(self):
        """Play a non-blocking subtle notification sound if enabled."""
        if not self.sound_alert or os.name != 'nt':
            return
        try:
            import winsound
            winsound.MessageBeep(winsound.MB_ICONASTERISK)
        except Exception:
            pass

    def pause(self):
        self.is_paused = True
        self._set_state(AgentState.PAUSED, "已暂停")
        self.log("监控已暂停", "WARN")

    def resume(self):
        self.is_paused = False
        self.first_idle_time = 0.0
        self.log("监控已恢复", "INFO")

    def step_once(self) -> AgentState:
        """Perform a single monitoring tick."""
        state, reason = self.evaluate_status()
        self._set_state(state, reason)

        if state == AgentState.IDLE:
            self.send_continue_prompt()
            # After sending, sleep a short moment for IDE to register
            time.sleep(1.5)
            self._set_state(AgentState.BUSY, "已发送继续指令，等待模型响应")

        return state
