# 🚀 Antigravity Continuous Runner (无人值守·自动继续监听守护程序)

专门为 **Antigravity IDE** 量身定制的对话自动监控与自动继续守护程序。

---

## 💡 为什么需要它？

在进行复杂的大型任务、全项目重构或多步代码编写时，Antigravity IDE 的 Agent 往往会在完成一个子阶段后暂停并等待用户输入（例如：“请问是否继续？”、“第一步已完成，下一步如何处理？”），或者由于单轮输出步数上限而进入等待态。

如果你需要离开电脑、进行长任务测试或希望 AI **完全自主连续执行**，本工具可以实现：
1. **自动监控当前会话**：毫秒级实时读取 Antigravity 原生 Transcript 事件流。
2. **精准状态识别**：精确区分 AI 正在思考执行（Busy）、冷却确认（Stabilizing）、等待输入（Idle）还是等待用户回答选择题（Waiting Decision）。
3. **原生无感注入**：基于 Antigravity 原生语言服务协议（`language_server` / `agentapi` RPC），直接将继续指令推入会话队列，**不占用焦点、不抢夺鼠标键盘、窗口最小化依然完美工作**！
4. **智能防爆流与防死循环**：内置冷却防抖机制、最大轮数限制与完成关键字检测（当 AI 明确回复“所有任务已完成”时自动收尾停机并播放提示音）。

---

## 📂 项目结构

```text
continue/
├── web_server.py  # 🌐 自动化控制中心后端服务（零三方依赖，标准库驱动）
├── web/           # 🎨 Cyberpunk 现代化 Web UI 控制界面 (HTML/CSS/JS)
│   ├── index.html # 仪表盘控制台结构
│   ├── style.css  # 霓虹深色暗黑风格设计系统
│   └── app.js     # 实时轮询驱动、Web Audio 声音合成与状态管理
├── start_ui.bat   # 🚀 双击一键启动 Web 控制中心并自动弹窗浏览器 (http://localhost:5300)
├── auto_continue.py # 轻量极简守护后台进程
├── main.py        # 交互式终端控制台与状态仪表盘
├── watcher.py     # 核心监控引擎与 Antigravity 原生 RPC 通信器
├── config.json    # 运行配置文件（支持自定义提示词、轮数、关键字等）
├── start.bat      # Windows CLI 一键快速启动脚本
└── README.md      # 使用说明文档
```

---

## ⚡ 快速使用

### 方式 1：Web 控制中心可视化界面（强烈推荐 ⭐⭐⭐⭐⭐）
直接双击打开 **`start_ui.bat`**，系统将自动启动后端服务并在默认浏览器打开：
👉 **`http://localhost:5300`**

- **大按钮一键启停**：醒目红绿巨型按钮，状态一目了然；
- **单次强制触发**：点击 `⚡ 立即发送一次` 无需等待即可立即推送指令；
- **全自动会话管理**：下拉自动罗列全部活跃历史会话，点击预览会话内容，支持随时切换目标或一键锁定；
- **消抖冷却与参数微调**：滑块实时调节冷却防抖秒数（1~15秒），快捷药丸一键选用提示词；
- **实时审计控制台**：嵌入式终端流，实时回传会话状态、当前步骤、注入时间戳与完成状态。

### 方式 2：CLI 终端极简模式
直接在资源管理器中双击打开 **`start.bat`**，或在命令行运行：

```bash
# 1. 默认启动：扫描最近活跃的对话，交互式选择
python main.py

# 2. 自动秒挂载最新活跃的对话（无需人工选择，即开即用）
python main.py --latest

# 3. 指定具体的对话 ID 进行监控
python main.py -c b3636e97-3c55-494b-82c5-6b9b1accf5fe

# 4. 自定义继续提示词与最大轮数
python main.py --latest -p "请继续编写单元测试并修复所有报错" --max-turns 30
```

---

## ⌨️ 运行时快捷键

在监控运行窗口中，支持以下单键无回车热键：

| 快捷键 | 功能说明 |
| :---: | :--- |
| **`[P]` 或 `[空格]`** | **暂停 / 恢复**：手动暂停自动继续，或恢复监听 |
| **`[C]`** | **立即强行触发**：不等倒计时，立即发送一次继续指令 |
| **`[L]`** | **查看日志**：在终端打印最近 2 条详细步骤信息 |
| **`[Q]`** | **安全退出**：平稳退出守护程序并打印本次运行统计 |

---

## ⚙️ 配置文件说明 (`config.json`)

程序首次运行时会自动读取同目录下的 `config.json`，各项参数如下：

```json
{
  // 模型回答结束后的冷却确认秒数（防止工具尚未完全退出误判空闲）
  "idle_delay_seconds": 6,

  // 最大自动继续轮数（防死循环/防 token 异常消耗）
  "max_turns": 50,

  // 默认发送给 Antigravity IDE 的继续提示词
  "continue_prompt": "请继续推进当前任务，执行下一步。若全部任务均已完成，请在回复中明确说明【所有任务已完成】。",

  // 任务完成检测关键字列表（命中其中任意一个将自动停止监控并提示）
  "completion_keywords": [
    "所有任务已完成",
    "全部任务已完成",
    "所有需求已完成",
    "所有需求均已完成",
    "已全部完成",
    "代码修改已全部完成",
    "【所有任务已完成】",
    "all tasks completed",
    "all tasks are completed",
    "task completed successfully"
  ],

  // 当模型使用 ask_question 明确向用户提出选择/提问时是否暂停等待人工决策
  "pause_on_question": true,

  // 触发继续时是否播放系统轻音提示
  "sound_alert": true,

  // 是否默认自动选择最新的活动对话
  "auto_select_latest": true
}
```

---

## 🔍 技术原理说明

1. **事件流捕获**：
   Antigravity IDE 会在本地目录 `~/.gemini/antigravity-ide/brain/<conv_id>/.system_generated/logs/transcript.jsonl` 持续记录完整的运行时轨迹。守护程序使用高效尾部增量解析提取最新状态。
2. **原生 RPC 驱动**：
   通过调用 Antigravity IDE 随身附带的 `language_server_windows_x64.exe agentapi send-message <conv_id> <content>`，将消息无缝提交到底层 gRPC/IPC 消息管道。
3. **响应式唤醒**：
   消息提交后，Antigravity 内核的 `Reactive Wakeup` 机制会自动解冻等待中的模型进程，将继续指令当做用户新输入推入当前对话上下文，实现全自动运转。
