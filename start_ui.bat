@echo off
chcp 65001 >nul
title Antigravity Auto-Pilot 启动器
echo ============================================================
echo   ⚡ Antigravity Auto-Pilot 自动化巡航控制程序启动中...
echo ============================================================
echo.
cd /d "%~dp0"

if exist "AntigravityAutoPilot.exe" (
    echo [*] 正在拉起原生独立可执行程序 AntigravityAutoPilot.exe...
    start "" "AntigravityAutoPilot.exe"
    exit
)

echo [*] 正在启动 Python 原生托盘应用程序...
start "" pythonw app_launcher.py
exit
