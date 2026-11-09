# -*- coding: utf-8 -*-
"""
Antigravity Continuous Runner - System Health & Status Inspector
快速健康巡检工具：检查守护进程、监控目标会话、累计注入轮数与 Web 仿真服务器状态
"""

import os
import sys
import json
import time
import subprocess

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

USER_HOME = os.path.expanduser("~")
BRAIN_DIR = os.path.join(USER_HOME, ".gemini", "antigravity-ide", "brain")
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")


def check_python_processes():
    """检查正在运行的 auto_continue 或 main 守护进程"""
    active_daemons = []
    try:
        if sys.platform == "win32":
            cmd = "powershell -Command \"Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*auto_continue*' -or $_.CommandLine -like '*watcher*' -or $_.CommandLine -like '*http.server 5218*' } | Select-Object ProcessId, CommandLine\""
            res = subprocess.run(cmd, shell=True, capture_output=True, text=True, errors="replace")
            for line in res.stdout.splitlines():
                line = line.strip()
                if "auto_continue" in line or "http.server 5218" in line:
                    active_daemons.append(line)
    except Exception:
        pass
    return active_daemons


def get_target_conversation_stats(conv_id: str):
    """读取指定会话的 transcript.jsonl 统计数据"""
    transcript_path = os.path.join(BRAIN_DIR, conv_id, ".system_generated", "logs", "transcript.jsonl")
    if not os.path.exists(transcript_path):
        return None

    total_steps = 0
    planner_done_count = 0
    user_input_count = 0
    last_step = {}

    try:
        with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                total_steps += 1
                try:
                    step = json.loads(line)
                    last_step = step
                    stype = step.get("type", "")
                    status = step.get("status", "")
                    if stype == "PLANNER_RESPONSE" and status == "DONE":
                        planner_done_count += 1
                    elif stype == "USER_INPUT":
                        user_input_count += 1
                except Exception:
                    pass
    except Exception:
        pass

    return {
        "total_steps": total_steps,
        "planner_done_count": planner_done_count,
        "user_input_count": user_input_count,
        "last_step": last_step,
        "last_mtime": os.path.getmtime(transcript_path)
    }


def main():
    print("=" * 68)
    print("   🔍 Antigravity Continuous Runner · 状态与健康巡检")
    print("=" * 68)

    # 1. 读取配置文件
    target_id = ""
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                target_id = cfg.get("target_conversation_id", "")
                print(f"[*] 配置文件锁定会话 : {target_id or '未锁定 (动态扫描)'}")
                print(f"[*] 自动继续提示词   : \"{cfg.get('continue_prompt', '继续')}\"")
                print(f"[*] 冷却防抖时间     : {cfg.get('idle_delay_seconds', 3)} 秒")
        except Exception as e:
            print(f"[!] 读取 config.json 失败: {e}")

    # 2. 会话统计
    if target_id:
        stats = get_target_conversation_stats(target_id)
        if stats:
            print("\n[ 会话健康数据 ]")
            print(f"  • 总步骤记录数 (Steps)  : {stats['total_steps']}")
            print(f"  • 用户输入步数 (Inputs) : {stats['user_input_count']}")
            print(f"  • 完成回复轮数 (Turns)  : {stats['planner_done_count']}")
            mtime_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stats["last_mtime"]))
            print(f"  • 最近一次活动时间      : {mtime_str}")

            last_s = stats.get("last_step", {})
            stype = last_s.get("type", "UNKNOWN")
            status = last_s.get("status", "UNKNOWN")
            print(f"  • 最新一步状态          : type={stype}, status={status}")
        else:
            print(f"\n[!] 目标会话目录不存在或尚无日志")

    # 3. 运行中进程
    print("\n[ 活跃守护进程检测 ]")
    daemons = check_python_processes()
    if daemons:
        for d in daemons:
            print(f"  🟢 {d}")
    else:
        print("  ⚪ 当前未检测到外部常驻守护进程")

    print("\n" + "=" * 68)


if __name__ == "__main__":
    main()
