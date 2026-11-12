@echo off
chcp 65001 >nul
title Antigravity Auto-Pilot 一键重启
echo ============================================================
echo   ⚡ 正在重启 Antigravity Auto-Pilot 控制中心...
echo ============================================================
echo.
cd /d "%~dp0"

echo [*] 正在检查并释放 5300 端口旧进程...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5300 ^| findstr LISTENING') do (
    echo [*] 终止占用端口 5300 的进程 PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

timeout /t 1 >nul

echo [*] 正在启动全新服务进程...
start "" "http://localhost:5300"
python -u web_server.py

pause
