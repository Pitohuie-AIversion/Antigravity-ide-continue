@echo off
chcp 65001 >nul
title Antigravity Auto-Pilot Web Control Center
echo ============================================================
echo   ⚡ Antigravity 自动化巡航 Web 控制中心启动中...
echo ============================================================
echo.
cd /d "%~dp0"

echo [*] 检查 5300 端口占用...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5300 ^| findstr LISTENING') do (
    echo [*] 正在终止旧服务实例 (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

echo [*] 正在打开控制台界面: http://localhost:5300
timeout /t 1 >nul
start "" "http://localhost:5300"

echo [*] 正在运行后端服务...
python -u web_server.py

pause
