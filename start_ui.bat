@echo off
cd /d "%~dp0"

if exist "AntigravityAutoPilot.exe" (
    start "" "AntigravityAutoPilot.exe"
    exit /b 0
)

start "" pythonw app_launcher.py
exit /b 0
