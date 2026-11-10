# -*- coding: utf-8 -*-
"""
Antigravity Auto-Pilot 桌面托盘应用程序启动器
=============================================
特性：
  1. 🖥️ 无黑框托盘运行：作为原生后台应用程序驻留系统任务栏托盘，杜绝黑框干扰
  2. 🌐 启动即开看板：自动拉起默认浏览器访问 http://localhost:5300/
  3. 🖱️ 托盘右键快捷操作：支持快速启动巡航、暂停巡航、打开面板、退出程序
  4. 🔄 单实例与防重检查：若已在运行则直接唤醒浏览器页面
"""

import os
import sys
import time
import socket
import threading
import webbrowser
import subprocess
from typing import Optional

# Ensure UTF-8
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Determine base paths
if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
    BUNDLE_DIR = getattr(sys, "_MEIPASS", BASE_DIR)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    BUNDLE_DIR = BASE_DIR

PORT = 5300
DASHBOARD_URL = f"http://localhost:{PORT}/"
ICON_PATH = os.path.join(BUNDLE_DIR, "assets", "icon.png")
if not os.path.exists(ICON_PATH):
    ICON_PATH = os.path.join(BASE_DIR, "assets", "icon.png")

# Import web_server daemon and server factory
import web_server


def is_port_in_use(port: int) -> bool:
    """检查指定端口是否已被占用"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def create_desktop_shortcut():
    """在用户桌面创建启动快捷方式"""
    if sys.platform != "win32":
        return
    try:
        user_desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        if not os.path.exists(user_desktop):
            # Check Chinese desktop path
            user_desktop = os.path.join(os.path.expanduser("~"), "桌面")
        if not os.path.exists(user_desktop):
            return

        shortcut_path = os.path.join(user_desktop, "⚡ Antigravity Auto-Pilot.lnk")
        ico_path = os.path.join(BASE_DIR, "assets", "icon.ico")
        target_exe = sys.executable if getattr(sys, "frozen", False) else os.path.join(BASE_DIR, "start_ui.bat")

        ps_script = f"""
$ws = New-Object -ComObject WScript.Shell;
$s = $ws.CreateShortcut('{shortcut_path}');
$s.TargetPath = '{target_exe}';
$s.WorkingDirectory = '{BASE_DIR}';
$s.Description = 'Antigravity Auto-Pilot 多会话并发巡航控制中心';
"""
        if os.path.exists(ico_path):
            ps_script += f"$s.IconLocation = '{ico_path},0';\n"
        ps_script += "$s.Save();"

        subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], capture_output=True, timeout=5)
    except Exception:
        pass


class AutoPilotApp:
    def __init__(self):
        self.server = None
        self.server_thread = None
        self.tray_icon = None
        self.is_running = True

    def start_http_server(self):
        """后台启动 HTTP 服务与守护进程"""
        try:
            self.server = web_server.make_http_server(PORT)
            self.server_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
            self.server_thread.start()
            web_server.daemon.add_log(f"⚡ 桌面控制程序启动成功: {DASHBOARD_URL}", "SUCCESS")
        except Exception as e:
            web_server.daemon.add_log(f"HTTP 服务启动失败: {e}", "ERROR")

    def open_dashboard(self, icon=None, item=None):
        """在默认浏览器中打开控制面板"""
        webbrowser.open(DASHBOARD_URL)

    def start_all_sessions(self, icon=None, item=None):
        """一键启动全部会话"""
        web_server.daemon.start_all()
        if self.tray_icon:
            self.notify("🚀 已启动巡航", "全矩阵所有监控会话已进入自驱巡航状态！")

    def stop_all_sessions(self, icon=None, item=None):
        """一键暂停全部会话"""
        web_server.daemon.stop_all()
        if self.tray_icon:
            self.notify("⏹ 已暂停巡航", "所有监控会话已暂停自动检测与指令注入。")

    def notify(self, title: str, message: str):
        """发送托盘通知气泡"""
        try:
            if self.tray_icon:
                self.tray_icon.notify(message, title)
        except Exception:
            pass

    def stop_app(self, icon=None, item=None):
        """安全停止并退出程序"""
        self.is_running = False
        try:
            web_server.daemon.stop_all()
            if self.server:
                self.server.shutdown()
                self.server.server_close()
        except Exception:
            pass
        if self.tray_icon:
            self.tray_icon.stop()
        os._exit(0)

    def run(self):
        # 1. 检查端口是否被既有实例占用
        if is_port_in_use(PORT):
            # 已在运行，直接唤醒浏览器
            self.open_dashboard()
            return

        # 2. 自动更新桌面快捷方式
        create_desktop_shortcut()

        # 3. 启动后台服务器
        self.start_http_server()

        # 4. 延迟 0.8 秒自动打开控制面板页面
        def delayed_open():
            time.sleep(0.8)
            self.open_dashboard()
        threading.Thread(target=delayed_open, daemon=True).start()

        # 5. 启动系统托盘图标
        try:
            import pystray
            from PIL import Image

            if os.path.exists(ICON_PATH):
                image = Image.open(ICON_PATH)
            else:
                image = Image.new("RGBA", (64, 64), color=(56, 189, 248))

            menu = pystray.Menu(
                pystray.MenuItem("🌐 打开 Web 控制面板", self.open_dashboard, default=True),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("🚀 全矩阵启动巡航", self.start_all_sessions),
                pystray.MenuItem("⏹ 全矩阵暂停巡航", self.stop_all_sessions),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("🚪 退出程序", self.stop_app)
            )

            self.tray_icon = pystray.Icon(
                "AntigravityAutoPilot",
                image,
                "⚡ Antigravity Auto-Pilot (运行中)",
                menu
            )

            # 托盘准备完毕通知
            def on_ready(icon):
                icon.notify("⚡ 控制面板已就绪，正在后台静默巡航！\n双击托盘图标可随时唤出看板。", "Antigravity Auto-Pilot")

            self.tray_icon.run(setup=on_ready)

        except Exception as e:
            # 若托盘初始化失败（如某些特殊无GUI环境），退化为常驻循环
            print(f"托盘未加载，转为常驻模式: {e}", flush=True)
            try:
                while self.is_running:
                    time.sleep(1)
            except KeyboardInterrupt:
                self.stop_app()


if __name__ == "__main__":
    app = AutoPilotApp()
    app.run()
