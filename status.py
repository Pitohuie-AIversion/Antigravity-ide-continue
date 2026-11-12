# -*- coding: utf-8 -*-
"""
Antigravity Continuous Runner - System Health & Fleet Status Inspector
终端多会话并发健康巡检工具：检查 Web 守护进程、纳管会话矩阵状态、步数与 Web 控制中心
"""

import os
import sys
import json
import time
import subprocess
import urllib.request

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from ls_discovery import resolve_brain_dir, load_conversation_summaries, probe_ls_connection

BRAIN_DIR = resolve_brain_dir()
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
API_STATUS_URL = "http://127.0.0.1:5300/api/status"


def get_live_daemon_status():
    """尝试从运行中的 5300 控制中心拉取实时全量状态"""
    try:
        req = urllib.request.Request(API_STATUS_URL, headers={"User-Agent": "FleetStatusCLI/1.0"})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8"))
    except Exception:
        pass
    return None


def check_active_processes():
    """检查正在运行的 AntigravityAutoPilot, web_server 或 8092 仿真服务器"""
    active_procs = []
    try:
        if sys.platform == "win32":
            cmd = "powershell -Command \"Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*web_server.py*' -or $_.CommandLine -like '*AntigravityAutoPilot*' -or $_.CommandLine -like '*auto_continue*' -or $_.CommandLine -like '*http.server 8092*' } | Select-Object ProcessId, CommandLine\""
            res = subprocess.run(cmd, shell=True, capture_output=True, text=True, errors="replace")
            for line in res.stdout.splitlines():
                line = line.strip()
                if any(k in line for k in ["web_server.py", "AntigravityAutoPilot", "auto_continue", "8092"]):
                    active_procs.append(line)
    except Exception:
        pass
    return active_procs


def get_local_transcript_summary(conv_id: str):
    """读取本地会话 transcript 的最新概览"""
    transcript_path = os.path.join(BRAIN_DIR, conv_id, ".system_generated", "logs", "transcript.jsonl")
    if not os.path.exists(transcript_path):
        return None

    total_steps = 0
    planner_done = 0
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
                    if step.get("type") == "PLANNER_RESPONSE" and step.get("status") == "DONE":
                        planner_done += 1
                except Exception:
                    pass
    except Exception:
        pass

    return {
        "total_steps": total_steps,
        "planner_done": planner_done,
        "last_step": last_step,
        "mtime": os.path.getmtime(transcript_path)
    }


def main():
    print("=" * 72)
    print("   ⚡ Antigravity Auto-Pilot · 多会话并发矩阵健康巡检 (Fleet Status)")
    print("=" * 72)

    if "--report" in sys.argv:
        try:
            req = urllib.request.Request("http://127.0.0.1:5300/api/fleet/report", headers={"User-Agent": "FleetStatusCLI/1.0"})
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                print(data.get("report", "无报告内容"))
                return
        except Exception as e:
            print(f"[!] 拉取交付报告失败: {e}")
            return

    live_status = get_live_daemon_status()

    if live_status:
        active_cnt = live_status.get("active_count", 0)
        total_cnt = live_status.get("total_count", 0)
        total_sent = live_status.get("total_sent_count", 0)
        pid = live_status.get("pid", "--")

        print(f"[*] 控制中心状态 : 🟢 在线 (PID: {pid} · http://localhost:5300)")
        print(f"[*] 纳管会话矩阵 : {active_cnt} / {total_cnt} 正在并发巡航")
        print(f"[*] 全矩阵累计注入: {total_sent} 轮")
        print("-" * 72)

        sessions = live_status.get("sessions", [])
        if sessions:
            print(f"{'工作区/节点':<18} {'会话ID':<13} {'状态':<18} {'步数与速率':<16} {'已注入':<8} {'提示词与异常'}")
            print("-" * 88)
            for s in sessions:
                raw_node = s.get("node_type", "local")
                ws = s.get("workspace") or ("本地" if raw_node == "local" else raw_node[4:])
                node_short = ws[-16:] if len(ws) > 16 else ws
                pin_mark = "📌" if s.get("pinned") else ""
                cid_short = pin_mark + s.get("id", "")[:8] + ".."
                state = s.get("state", "UNKNOWN")
                live_st = s.get("live_state", "")
                dur = s.get("busy_duration", 0)
                dur_str = f"({dur}s)" if dur > 0 and (state == "BUSY" or live_st == "BUSY") else ""
                disp_state = f"MON/{live_st}" if (not s.get("enabled") and live_st) else state
                state_str = f"{disp_state} {dur_str}".strip()
                vel = s.get("step_velocity", 0.0)
                vel_str = f" (+{vel}/m)" if vel > 0 else ""
                step = f"Step {s.get('current_step', '--')}{vel_str}"
                sent = f"{s.get('sent_count', 0)} 轮"
                tags = s.get("tags", [])
                tag_str = f" [#{','.join(tags)}]" if tags else ""
                err = s.get("error", "")
                extra = f"ERR: {err[:22]}" if err else f"\"{(s.get('prompt', '继续')[:14] + tag_str)}\""
                enabled_mark = "🟢" if s.get("enabled") else "👁️"
                print(f"{node_short:<18} {cid_short:<13} {enabled_mark} {state_str:<16} {step:<16} {sent:<8} {extra}")
        else:
            print("  ⚪ 暂无纳管会话记录")

    else:
        print("[*] 控制中心状态 : ⚪ 后端守护进程离线 (可运行 start_ui.bat 启动)")
        # 从本地 config.json 读取
        if os.path.exists(CONFIG_PATH):
            try:
                with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    monitored = cfg.get("monitored_sessions", [])
                    print(f"[*] 静态配置纳管数: {len(monitored)} 个会话")
                    for idx, s in enumerate(monitored, 1):
                        cid = s.get("id", "")
                        node = s.get("node_type", "local")
                        title = s.get("title", cid[:8])
                        print(f"  {idx}. [{node}] {cid[:8]}... - {title}")
            except Exception as e:
                print(f"[!] 读取配置异常: {e}")

    # Language Server 与 Antigravity 会话总览
    probe = probe_ls_connection(force_refresh=True)
    ls_state = f"🟢 在线 ({probe.get('addr')} · {probe.get('latency_ms')}ms)" if probe.get("ok") else f"🔴 未连接 ({probe.get('error')})"
    print(f"\n[ Antigravity LSP 通道诊断 ]")
    print(f"  • 接口状态     : {ls_state}")
    print(f"  • 会话目录     : {BRAIN_DIR}")
    summaries = load_conversation_summaries()
    if summaries:
        main_convs = [v for v in summaries.values() if not v.get("is_subagent")]
        sub_cnt = len(summaries) - len(main_convs)
        print(f"  • 本地会话总数 : {len(main_convs)} 个主会话 (另有 {sub_cnt} 个子代理会话)")

    # 活跃进程与端口提示
    print("\n[ 活跃系统进程检测 ]")
    procs = check_active_processes()
    if procs:
        for p in procs:
            print(f"  🟢 {p}")
    else:
        print("  ⚪ 当前未检测到常驻服务进程")

    print("\n[ 常用快捷链接 ]")
    print("  • Web 控制中心 : http://localhost:5300/")
    print("=" * 72)


if __name__ == "__main__":
    main()
