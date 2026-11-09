# -*- coding: utf-8 -*-
"""
窗口与进程诊断脚本 (Window & Process Inspector)
用于查询当前 Antigravity IDE、前台激活窗口以及相关进程的 PID 与 HWND 句柄
"""
import sys
import ctypes
from ctypes import wintypes
import subprocess

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

user32 = ctypes.windll.user32
WINSTA_ALL = 0x37F
DESKTOP_ALL = 0x1FF

# 连接到 Windows 交互式桌面 WinSta0\Default
hwinsta = user32.OpenWindowStationW("WinSta0", False, WINSTA_ALL)
if hwinsta:
    user32.SetProcessWindowStation(hwinsta)
hdesk = user32.OpenDesktopW("default", 0, False, DESKTOP_ALL)
if hdesk:
    user32.SetThreadDesktop(hdesk)

# 获取前台窗口
hwnd_fg = user32.GetForegroundWindow()
pid_fg = wintypes.DWORD()
user32.GetWindowThreadProcessId(hwnd_fg, ctypes.byref(pid_fg))
len_fg = user32.GetWindowTextLengthW(hwnd_fg)
buff_fg = ctypes.create_unicode_buffer(len_fg + 1)
user32.GetWindowTextW(hwnd_fg, buff_fg, len_fg + 1)

print("=" * 65)
print("【当前激活前台窗口 (Foreground Window)】")
print(f"窗口句柄 (HWND) : {hwnd_fg} (0x{hwnd_fg:08X})")
print(f"进程 PID        : {pid_fg.value}")
print(f"窗口标题        : {buff_fg.value}")
print("=" * 65)

# 枚举当前交互桌面上的所有顶层窗口
windows = []
def enum_proc(hwnd, lParam):
    l = user32.GetWindowTextLengthW(hwnd)
    if l > 0:
        b = ctypes.create_unicode_buffer(l + 1)
        user32.GetWindowTextW(hwnd, b, l + 1)
        p = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(p))
        if user32.IsWindowVisible(hwnd):
            windows.append((hwnd, p.value, b.value))
    return True

DESKENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
if hdesk:
    user32.EnumDesktopWindows(hdesk, DESKENUMPROC(enum_proc), 0)
else:
    user32.EnumWindows(DESKENUMPROC(enum_proc), 0)

print("\n【当前可见桌面窗口 (包含 Antigravity IDE)】")
for h, p, t in windows:
    t_lower = t.lower()
    if any(k in t_lower for k in ["antigravity", "chatgpt", "chrome", "continue", "seagent", "微信"]):
        print(f"PID: {p:<8} | HWND: {h:<10} (0x{h:08X}) | 标题: {t}")

print("\n" + "=" * 65)
