import os
import sys
import subprocess

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

base_dir = os.path.dirname(os.path.abspath(__file__))
exe_path = os.path.join(base_dir, "AntigravityAutoPilot.exe")
target_path = exe_path if os.path.exists(exe_path) else os.path.join(base_dir, "start_ui.bat")
icon_path = os.path.join(base_dir, "assets", "icon.ico")

script = f"""
$desktop = [Environment]::GetFolderPath('Desktop')
$wsh = New-Object -ComObject WScript.Shell

if (Test-Path $desktop) {{
    $p = Join-Path $desktop "Antigravity Auto-Pilot.lnk"
    $sc = $wsh.CreateShortcut($p)
    $sc.TargetPath = '{target_path}'
    $sc.WorkingDirectory = '{base_dir}'
    if (Test-Path '{icon_path}') {{
        $sc.IconLocation = '{icon_path},0'
    }}
    $sc.Description = "Antigravity Auto-Pilot 多会话并发控制中心"
    $sc.Save()
    Write-Output "Created: $p"
}}

$wsShortcut = Join-Path '{base_dir}' "启动控制中心.lnk"
$sc2 = $wsh.CreateShortcut($wsShortcut)
$sc2.TargetPath = '{target_path}'
$sc2.WorkingDirectory = '{base_dir}'
if (Test-Path '{icon_path}') {{
    $sc2.IconLocation = '{icon_path},0'
}}
$sc2.Description = "Antigravity Auto-Pilot 多会话并发控制中心"
$sc2.Save()
Write-Output "Created: $wsShortcut"
"""

p = subprocess.run(["powershell", "-NoProfile", "-Command", script], capture_output=True, text=True, errors="replace")
print("PowerShell Output:")
print(p.stdout)
