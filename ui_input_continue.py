# -*- coding: utf-8 -*-
"""
前台物理模拟版：在 Antigravity 界面输入框中打字“继续”并按回车
特点：通过 Windows 原生 API 模拟键盘输入（适合需要真实界面敲击体验的用户）
"""

import os
import sys
import time
import json
import ctypes
from ctypes import wintypes

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

# 键盘扫描码与虚拟键码
VK_RETURN = 0x0D
VK_CONTROL = 0x11
VK_L = 0x4C
VK_V = 0x56
KEYEVENTF_KEYUP = 0x0002

USER_HOME = os.path.expanduser("~")
BRAIN_DIR = os.path.join(USER_HOME, ".gemini", "antigravity-ide", "brain")
COOLDOWN_SECONDS = 3


def set_clipboard_text(text: str):
    """将文本写入 Windows 剪贴板"""
    CF_UNICODETEXT = 13
    GMEM_MOVEABLE = 0x0002
    
    user32.OpenClipboard(0)
    user32.EmptyClipboard()
    
    text_bytes = (text + '\0').encode('utf-16le')
    h_mem = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(text_bytes))
    ptr = kernel32.GlobalLock(h_mem)
    ctypes.memmove(ptr, text_bytes, len(text_bytes))
    kernel32.GlobalUnlock(h_mem)
    user32.SetClipboardData(CF_UNICODETEXT, h_mem)
    user32.CloseClipboard()


def send_keys_paste_and_enter():
    """模拟 Ctrl+V 粘贴并按回车"""
    # 按下 Ctrl
    user32.keybd_event(VK_CONTROL, 0, 0, 0)
    time.sleep(0.05)
    # 按下 V
    user32.keybd_event(VK_V, 0, 0, 0)
    time.sleep(0.05)
    # 释放 V
    user32.keybd_event(VK_V, 0, KEYEVENTF_KEYUP, 0)
    # 释放 Ctrl
    user32.keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0)
    time.sleep(0.1)
    # 按下 Enter
    user32.keybd_event(VK_RETURN, 0, 0, 0)
    time.sleep(0.05)
    # 释放 Enter
    user32.keybd_event(VK_RETURN, 0, KEYEVENTF_KEYUP, 0)


def get_latest_conversation() -> str:
    if not os.path.exists(BRAIN_DIR):
        return ""
    candidates = []
    for entry in os.listdir(BRAIN_DIR):
        p = os.path.join(BRAIN_DIR, entry, ".system_generated", "logs", "transcript.jsonl")
        if os.path.exists(p):
            candidates.append((p, os.path.getmtime(p)))
    if not candidates:
        return ""
    candidates.sort(key=lambda x: x[1], reverse=True)
    return candidates[0][0]


def is_round_finished(transcript_path: str) -> bool:
    try:
        with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = [l.strip() for l in f if l.strip()]
        if not lines:
            return False
        last_step = json.loads(lines[-1])
        return (last_step.get("type") == "PLANNER_RESPONSE" and 
                last_step.get("status") == "DONE" and 
                len(last_step.get("tool_calls", [])) == 0)
    except Exception:
        return False


def main():
    print("=" * 60)
    print("   ⌨️ Antigravity 界面自动打字【继续】程序")
    print("=" * 60)
    print("说明：监控到一轮结束时，将自动将【继续】贴入当前窗口并按回车")
    print("按 Ctrl+C 停止\n")

    transcript_path = get_latest_conversation()
    if not transcript_path:
        print("[错误] 未找到任何活动对话。")
        return

    idle_start = None
    count = 0

    while True:
        try:
            # 持续跟随最新对话
            latest_path = get_latest_conversation()
            if latest_path:
                transcript_path = latest_path

            if is_round_finished(transcript_path):
                now = time.time()
                if idle_start is None:
                    idle_start = now
                if now - idle_start >= COOLDOWN_SECONDS:
                    count += 1
                    timestamp = time.strftime("%H:%M:%S")
                    print(f"[{timestamp}] 一轮结束，前台模拟输入：\"继续\" (第 {count} 次)")
                    
                    set_clipboard_text("继续")
                    send_keys_paste_and_enter()
                    
                    time.sleep(3.0)
                    idle_start = None
            else:
                idle_start = None

            time.sleep(1.0)
        except KeyboardInterrupt:
            print("\n已退出。")
            break


if __name__ == "__main__":
    main()
