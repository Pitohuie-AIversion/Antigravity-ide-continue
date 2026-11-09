# -*- coding: utf-8 -*-
"""
Antigravity Continuous Runner - Interactive CLI Dashboard
Author: Pair Programming with Antigravity
Usage:
    python main.py                  # Auto-attach or choose from recent conversations
    python main.py --latest         # Auto-attach to the most recently active conversation
    python main.py -c <id>          # Attach to specific conversation ID
"""

import os
import sys
import time
import json
import argparse
import threading
from typing import Optional

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from watcher import AntigravityWatcher, AgentState


# ANSI Color Codes
class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    CYAN = "\033[96m"
    WHITE = "\033[97m"
    BG_BLUE = "\033[44m"
    BG_GREEN = "\033[42m"
    BG_RED = "\033[41m"


STATE_BADGES = {
    AgentState.BUSY: f"{Colors.GREEN}● 思考与执行中 (BUSY){Colors.RESET}",
    AgentState.STABILIZING: f"{Colors.YELLOW}◔ 冷却确认中 (STABILIZING){Colors.RESET}",
    AgentState.IDLE: f"{Colors.BLUE}⚡ 发送继续指令 (TRIGGERING){Colors.RESET}",
    AgentState.WAITING_DECISION: f"{Colors.MAGENTA}❓ 等待用户决策 (WAITING_USER){Colors.RESET}",
    AgentState.COMPLETED: f"{Colors.GREEN}✔ 任务已达成 (COMPLETED){Colors.RESET}",
    AgentState.PAUSED: f"{Colors.RED}⏸ 已手动暂停 (PAUSED){Colors.RESET}",
    AgentState.ERROR: f"{Colors.RED}✖ 发生异常 (ERROR){Colors.RESET}",
    AgentState.UNKNOWN: f"{Colors.DIM}○ 初始化中 (INIT){Colors.RESET}",
}


def print_banner():
    banner = f"""
{Colors.CYAN}{Colors.BOLD}========================================================================{Colors.RESET}
{Colors.WHITE}{Colors.BOLD}   🚀 Antigravity Continuous Runner (无人值守·自动继续监听守护程序)   {Colors.RESET}
{Colors.CYAN}========================================================================{Colors.RESET}
{Colors.DIM}  原生语言服务级无感注入 | 毫秒级 Transcript 事件监听 | 智能防爆流与完成检测{Colors.RESET}
"""
    print(banner)


def load_config(config_path: str = "config.json") -> dict:
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"{Colors.YELLOW}警告: 加载配置文件失败 ({e})，使用默认配置。{Colors.RESET}")
    return {}


def choose_conversation_interactive(watcher: AntigravityWatcher) -> Optional[str]:
    print(f"\n{Colors.WHITE}{Colors.BOLD}正在扫描 Antigravity 最近的活动对话...{Colors.RESET}")
    recent = watcher.list_recent_conversations(limit=6)
    if not recent:
        print(f"{Colors.RED}未发现任何对话记录，请先在 Antigravity IDE 中发起一段对话。{Colors.RESET}")
        return None

    print(f"\n{Colors.CYAN}序号   最后活跃时间           对话 ID (前8位)    对话开头预览{Colors.RESET}")
    print("-" * 72)
    for i, c in enumerate(recent, 1):
        cid_short = c["id"][:8]
        print(f" [{i}]   {c['mtime_str']}   {cid_short}           {c['preview'][:36]}")
    print("-" * 72)

    choice = input(f"\n请选择要监控的对话序号 [回车默认选择 1]: ").strip()
    if not choice:
        return recent[0]["id"]
    try:
        idx = int(choice) - 1
        if 0 <= idx < len(recent):
            return recent[idx]["id"]
    except ValueError:
        pass

    print(f"{Colors.YELLOW}输入无效，默认选择最新对话 [1]{Colors.RESET}")
    return recent[0]["id"]


def keyboard_listener(watcher: AntigravityWatcher, stop_event: threading.Event):
    """Listens for keyboard shortcuts on Windows without blocking."""
    if sys.platform != "win32":
        return

    import msvcrt
    while not stop_event.is_set():
        if msvcrt.kbhit():
            ch = msvcrt.getch()
            try:
                char = ch.decode("utf-8", errors="ignore").lower()
            except Exception:
                continue

            if char in ["p", " "]:
                if watcher.is_paused:
                    watcher.resume()
                else:
                    watcher.pause()
            elif char == "c":
                print(f"\n{Colors.YELLOW}[手动触发] 正在立即注入继续指令...{Colors.RESET}")
                watcher.send_continue_prompt()
            elif char == "l":
                steps = watcher.read_tail_steps(2)
                print(f"\n{Colors.CYAN}--- 最近步骤详情 ---{Colors.RESET}")
                for s in steps:
                    print(f"Step {s.get('step_index')}: {s.get('type')} [{s.get('status')}] - {str(s.get('content', ''))[:80]}")
                print(f"{Colors.CYAN}--------------------{Colors.RESET}")
            elif char == "q":
                print(f"\n{Colors.YELLOW}收到退出指令，正在退出守护程序...{Colors.RESET}")
                stop_event.set()
                break
        time.sleep(0.1)


def main():
    parser = argparse.ArgumentParser(description="Antigravity Continuous Conversation Watcher")
    parser.add_argument("-c", "--conversation-id", help="指定要监控的对话 ID")
    parser.add_argument("-l", "--latest", action="store_true", help="直接监控最新活动对话，不弹出交互选择")
    parser.add_argument("-p", "--prompt", help="自定义继续提示词")
    parser.add_argument("--idle", type=int, help="等待进入空闲的冷却秒数 (默认 6 秒)")
    parser.add_argument("--max-turns", type=int, help="最多自动继续轮数 (默认 50)")
    parser.add_argument("--no-sound", action="store_true", help="禁用继续时的音效提示")
    parser.add_argument("--config", default="config.json", help="配置文件路径")

    args = parser.parse_args()
    print_banner()

    # Load configuration
    config = load_config(args.config)
    if args.idle is not None:
        config["idle_delay_seconds"] = args.idle
    if args.max_turns is not None:
        config["max_turns"] = args.max_turns
    if args.prompt:
        config["continue_prompt"] = args.prompt
    if args.no_sound:
        config["sound_alert"] = False

    watcher = AntigravityWatcher(config=config)

    # Determine conversation to attach
    target_id = args.conversation_id
    if not target_id:
        if args.latest or config.get("auto_select_latest", False):
            recent = watcher.list_recent_conversations(limit=1)
            if recent:
                target_id = recent[0]["id"]
            else:
                print(f"{Colors.RED}未找到任何活动对话。{Colors.RESET}")
                return
        else:
            target_id = choose_conversation_interactive(watcher)

    if not target_id or not watcher.attach(target_id):
        print(f"{Colors.RED}附加对话失败，程序退出。{Colors.RESET}")
        return

    # Print session status
    print(f"\n{Colors.BOLD}监控目标对话:{Colors.RESET} {Colors.GREEN}{watcher.conversation_id}{Colors.RESET}")
    print(f"{Colors.BOLD}日志文件路径:{Colors.RESET} {watcher.transcript_path}")
    print(f"{Colors.BOLD}冷却延迟设定:{Colors.RESET} {watcher.idle_delay} 秒")
    print(f"{Colors.BOLD}最大继续轮数:{Colors.RESET} {watcher.max_turns} 轮")
    print(f"{Colors.BOLD}继续指令模板:{Colors.RESET} {Colors.DIM}\"{watcher.continue_prompt}\"{Colors.RESET}")
    print(f"{Colors.YELLOW}快捷键支持: [P/空格] 暂停/恢复 | [C] 立即强行继续 | [L] 查看最近步骤 | [Q] 退出{Colors.RESET}\n")

    stop_event = threading.Event()
    key_thread = threading.Thread(target=keyboard_listener, args=(watcher, stop_event), daemon=True)
    key_thread.start()

    last_rendered_state = None
    last_rendered_reason = ""
    tick_count = 0

    try:
        while not stop_event.is_set():
            state, reason = watcher.evaluate_status()

            # Dynamic line rendering
            badge = STATE_BADGES.get(state, str(state))
            timestamp = time.strftime("%H:%M:%S")
            status_line = (
                f"\r[{timestamp}] {badge} | 轮数: {watcher.turn_count}/{watcher.max_turns} | {reason}"
            )
            # Pad with spaces to clear previous text
            padded_line = status_line.ljust(85)
            sys.stdout.write(padded_line)
            sys.stdout.flush()

            if state == AgentState.IDLE:
                print()  # Newline for send log
                watcher.send_continue_prompt()
                time.sleep(2.0)  # Wait for agent to start next turn

            elif state == AgentState.COMPLETED:
                print(f"\n\n{Colors.GREEN}{Colors.BOLD}🎉 监测到终止条件达成: {reason}{Colors.RESET}")
                break

            elif state == AgentState.WAITING_DECISION:
                # Prompt user once and sleep
                if last_rendered_state != AgentState.WAITING_DECISION:
                    print(f"\n{Colors.MAGENTA}⚠️ 模型正在等待您在 IDE 界面输入回答，守护程序进入待机...{Colors.RESET}")
                time.sleep(2.0)

            time.sleep(1.0)
            last_rendered_state = state
            last_rendered_reason = reason

    except KeyboardInterrupt:
        print(f"\n\n{Colors.YELLOW}收到 Ctrl+C，正在退出守护程序...{Colors.RESET}")
    finally:
        stop_event.set()
        print(f"\n{Colors.CYAN}守护程序已终止。共计自动触发 {watcher.turn_count} 轮继续操作。感谢使用！{Colors.RESET}")


if __name__ == "__main__":
    main()
