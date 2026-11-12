@echo off
chcp 65001 > nul
title Antigravity 持续开发状态巡检

python --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Python 环境，请确保已安装 Python 并已将其添加到 PATH 中。
    pause
    exit /b 1
)

python status.py
echo.
pause
