# -*- coding: utf-8 -*-
"""
极简版：Antigravity 对话结束自动输入“继续”
功能：全自动监控当前活跃对话，每当 AI 回答完毕（一轮结束），自动发送“继续”
特点：后台静默注入，不抢占键盘鼠标，严格保证每轮仅触发一次，不重复发送
"""

import os
import sys
import time
import json
import subprocess
from typing import Tuple

# 解决 Windows 控制台编码
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# 核心路径定位 (兼容 Antigravity 2.0 与旧版 Antigravity IDE)
from ls_discovery import (
    resolve_brain_dir,
    resolve_ls_exe,
    resolve_agentapi_bat,
    get_active_ls_env,
    build_clean_agentapi_env,
    load_conversation_summaries,
    get_conversation_summary,
)

BRAIN_DIR = resolve_brain_dir()
AGENTAPI_BAT = resolve_agentapi_bat()
LS_EXE = resolve_ls_exe()

# 配置项
PROMPT_TEXT = "继续"     # 每次自动输入的内容
COOLDOWN_SECONDS = 3     # AI回答完毕后缓冲等待秒数（确保输出和文件全部就绪）
MAX_TURNS = 9999         # 持续无限轮数模式


def get_latest_conversation() -> Tuple[str, str]:
    """获取最新活跃的主对话 ID 及日志路径（自动跳过子代理会话）"""
    if not os.path.exists(BRAIN_DIR):
        return "", ""
    summaries = load_conversation_summaries()
    candidates = []
    for entry in os.listdir(BRAIN_DIR):
        meta = summaries.get(entry, {})
        if meta.get("is_subagent"):
            continue
        p = os.path.join(BRAIN_DIR, entry, ".system_generated", "logs", "transcript.jsonl")
        if os.path.exists(p):
            candidates.append((entry, p, os.path.getmtime(p)))
    if not candidates:
        return "", ""
    candidates.sort(key=lambda x: x[2], reverse=True)
    return candidates[0][0], candidates[0][1]


def get_target_conversation() -> Tuple[str, str, bool]:
    """
    获取目标对话 ID。
    返回: (conv_id, transcript_path, is_locked)
    """
    # 1. 命令行参数优先
    if len(sys.argv) > 1 and sys.argv[1].strip() and not sys.argv[1].startswith("-"):
        cid = sys.argv[1].strip()
        p = os.path.join(BRAIN_DIR, cid, ".system_generated", "logs", "transcript.jsonl")
        if os.path.exists(p):
            return cid, p, True

    # 2. 检查 config.json 是否锁定了 target_conversation_id
    cfg_path = os.path.join(os.path.dirname(__file__), "config.json")
    if os.path.exists(cfg_path):
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                cid = cfg.get("target_conversation_id", "").strip()
                if cid:
                    p = os.path.join(BRAIN_DIR, cid, ".system_generated", "logs", "transcript.jsonl")
                    if os.path.exists(p):
                        return cid, p, True
        except Exception:
            pass

    cid, p = get_latest_conversation()
    return cid, p, False


COMPLETION_KEYWORDS = [
    "所有任务已完成", "全部任务已完成", "所有需求已完成",
    "已全部完成", "代码修改已全部完成", "all tasks completed",
    "goal_complete"
]


def get_last_step_info(transcript_path: str, conv_id: str = "") -> Tuple[int, bool, bool, str]:
    """
    检查是否一轮对话已结束，并判断是否包含完工声明。
    返回: (step_index, is_finished, is_completed, content_snippet)
    """
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

        has_ask_q = any(
            isinstance(t, dict) and "ask_question" in str(t.get("name") or t.get("tool") or "")
            for t in (tool_calls or [])
        )
        db_running = False
        if conv_id:
            summary = get_conversation_summary(conv_id)
            if summary:
                db_st = summary.get("status", "")
                if db_st in ("CASCADE_RUN_STATUS_RUNNING", "CASCADE_RUN_STATUS_BUSY", "CASCADE_RUN_STATUS_CANCELING") or summary.get("not_fully_idle"):
                    db_running = True

        # 当最后一步是 PLANNER_RESPONSE 且 DONE，且没有未执行完的工具调用及后台任务时，表示本轮已结束
        is_finished = (
            step_type == "PLANNER_RESPONSE"
            and status == "DONE"
            and len(tool_calls) == 0
            and not has_ask_q
            and not db_running
        )

        # 检查是否匹配到完工关键词
        content_lower = content.lower()
        is_completed = is_finished and any(k in content_lower for k in COMPLETION_KEYWORDS)

        return step_idx, is_finished, is_completed, content[:60].replace("\n", " ")
    except Exception:
        return -1, False, False, ""


def send_continue(conv_id: str, text: str = PROMPT_TEXT) -> bool:
    """通过 Antigravity 官方语言服务接口向会话队列发送继续"""
    cmd = []
    if os.path.exists(LS_EXE):
        cmd = [LS_EXE, "agentapi", "send-message", conv_id, text]
    elif os.path.exists(AGENTAPI_BAT):
        cmd = [AGENTAPI_BAT, "send-message", conv_id, text]
    else:
        print("[错误] 未找到 agentapi 执行文件")
        return False

    try:
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
            timeout=10
        )
        return res.returncode == 0
    except Exception as e:
        print(f"[错误] 发送失败: {e}")
        return False


def main():
    print("=" * 60)
    print("   🚀 Antigravity 自动输入【继续】守护程序")
    print("=" * 60)
    print(f"模式：每当一轮对话结束，自动输入: \"{PROMPT_TEXT}\"")
    print("按 Ctrl+C 随时停止运行\n")

    current_conv_id, transcript_path, is_locked = get_target_conversation()
    if not current_conv_id:
        print("[错误] 未找到任何活动对话，请先在 Antigravity 中发起对话。")
        return

    print(f"[*] 监控目标对话 : {current_conv_id} {'(锁定模式)' if is_locked else '(动态跟踪最新)'}")
    print(f"[*] 冷却确认延迟 : {COOLDOWN_SECONDS} 秒")
    print(f"[*] 最大轮数上限 : {MAX_TURNS} 轮")
    print(f"[*] 正在持续监听中...\n")

    idle_start_time = None
    last_handled_step = -1
    sent_count = 0

    try:
        while True:
            # 若未显式锁定对话，且发现有显著更新的对话产生时切换
            if not is_locked:
                latest_id, latest_path = get_latest_conversation()
                if latest_id and latest_id != current_conv_id:
                    curr_mtime = os.path.getmtime(transcript_path) if os.path.exists(transcript_path) else 0
                    new_mtime = os.path.getmtime(latest_path) if os.path.exists(latest_path) else 0
                    if new_mtime > curr_mtime + 4.0:
                        current_conv_id = latest_id
                        transcript_path = latest_path
                        idle_start_time = None
                        last_handled_step = -1
                        print(f"\n[*] 自动切换到最新对话: {current_conv_id}")

            step_idx, finished, is_completed, snippet = get_last_step_info(transcript_path, current_conv_id)
            now = time.time()

            if is_completed:
                print(f"\n[🎉 完工] 检测到完成声明: '{snippet}'")
                print("[*] 所有任务均已全部达成，守护程序安全退出。")
                break

            # 只有当该步为已完成状态，且尚未针对此步骤触发过“继续”时才处理
            if finished and step_idx != last_handled_step:
                if idle_start_time is None:
                    idle_start_time = now
                
                elapsed = now - idle_start_time
                if elapsed >= COOLDOWN_SECONDS:
                    timestamp = time.strftime("%H:%M:%S")
                    next_round = sent_count + 1
                    print(f"[{timestamp}] 检测到一轮对话结束 (Step {step_idx})，自动输入: \"{PROMPT_TEXT}\" (第 {next_round} 轮)")
                    
                    ok = send_continue(current_conv_id, PROMPT_TEXT)
                    if not ok:
                        print(f"[{timestamp}] 发送失败，请检查 Language Server 进程，将在稍后重试。")
                        time.sleep(3.0)
                    else:
                        sent_count = next_round
                        last_handled_step = step_idx
                        if os.name == 'nt':
                            try:
                                import winsound
                                winsound.MessageBeep(winsound.MB_ICONASTERISK)
                            except Exception:
                                pass
                    
                    idle_start_time = None

                    if sent_count >= MAX_TURNS:
                        print(f"\n[*] 已达到最大轮数上限 ({MAX_TURNS})，守护程序安全退出。")
                        break
            else:
                # 处于思考或工具执行状态，重置冷却计时
                idle_start_time = None

            time.sleep(1.0)

    except KeyboardInterrupt:
        print(f"\n[已退出] 共计自动输入 {sent_count} 次【{PROMPT_TEXT}】。")


if __name__ == "__main__":
    main()
