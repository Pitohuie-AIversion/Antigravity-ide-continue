import os
import sys
import subprocess

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

script = r"""
$targets = @(
    [Environment]::GetFolderPath('Desktop'),
    "C:\Users\Administrator\Desktop",
    "X:\Users\Administrator\Desktop"
)

$wsh = New-Object -ComObject WScript.Shell

foreach ($t in $targets) {
    if (Test-Path $t) {
        $p = Join-Path $t "Antigravity Auto-Pilot.lnk"
        $sc = $wsh.CreateShortcut($p)
        $sc.TargetPath = "d:\📁 01_Workspaces (代码与工程区)\continue\AntigravityAutoPilot.exe"
        $sc.WorkingDirectory = "d:\📁 01_Workspaces (代码与工程区)\continue"
        $sc.IconLocation = "d:\📁 01_Workspaces (代码与工程区)\continue\assets\icon.ico,0"
        $sc.Description = "Antigravity Auto-Pilot 多会话并发控制中心"
        $sc.Save()
        Write-Output "Created: $p"
    }
}

$wsShortcut = "d:\📁 01_Workspaces (代码与工程区)\continue\启动控制中心.lnk"
$sc2 = $wsh.CreateShortcut($wsShortcut)
$sc2.TargetPath = "d:\📁 01_Workspaces (代码与工程区)\continue\AntigravityAutoPilot.exe"
$sc2.WorkingDirectory = "d:\📁 01_Workspaces (代码与工程区)\continue"
$sc2.IconLocation = "d:\📁 01_Workspaces (代码与工程区)\continue\assets\icon.ico,0"
$sc2.Description = "Antigravity Auto-Pilot 多会话并发控制中心"
$sc2.Save()
Write-Output "Created: $wsShortcut"
"""

p = subprocess.run(["powershell", "-NoProfile", "-Command", script], capture_output=True, text=True, errors="replace")
print("PowerShell Output:")
print(p.stdout)
