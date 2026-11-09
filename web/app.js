// ==========================================================================
// ANTIGRAVITY AUTO-PILOT CONTROL CENTER - FRONTEND APPLICATION SCRIPT
// ==========================================================================

let appState = {
  running: false,
  state: 'STOPPED',
  target_conv_id: '',
  is_locked: true,
  sent_count: 0,
  current_step: 0,
  cooldown_seconds: 3.0,
  cooldown_remaining: 0.0,
  prompt_text: '继续',
  max_turns: 9999,
  lsp_ok: true
};

let conversationsList = [];
let lastLogCount = 0;
let isPollingActive = true;

// DOM Elements
const mainStatusPill = document.getElementById('mainStatusPill');
const mainStatusText = document.getElementById('mainStatusText');
const lspStatusBadge = document.getElementById('lspStatusBadge');
const lspStatusText = document.getElementById('lspStatusText');

const metricState = document.getElementById('metricState');
const metricStateDetail = document.getElementById('metricStateDetail');
const metricSentCount = document.getElementById('metricSentCount');
const metricCooldown = document.getElementById('metricCooldown');
const cooldownBar = document.getElementById('cooldownBar');
const metricStepDetail = document.getElementById('metricStepDetail');
const metricConvId = document.getElementById('metricConvId');
const copyConvBtn = document.getElementById('copyConvBtn');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const triggerOnceBtn = document.getElementById('triggerOnceBtn');

const convSelect = document.getElementById('convSelect');
const convPreviewSnippet = document.getElementById('convPreviewSnippet');
const convCountHint = document.getElementById('convCountHint');
const refreshConvsBtn = document.getElementById('refreshConvsBtn');
const hideEmptyCheckbox = document.getElementById('hideEmptyCheckbox');
const lockConvCheckbox = document.getElementById('lockConvCheckbox');
const currentNodeBadge = document.getElementById('currentNodeBadge');
const nodeBtnLocal = document.getElementById('nodeBtnLocal');
const nodeBtnWestc = document.getElementById('nodeBtnWestc');
const headerRestartBtn = document.getElementById('headerRestartBtn');

const promptInput = document.getElementById('promptInput');
const cooldownInput = document.getElementById('cooldownInput');
const maxTurnsInput = document.getElementById('maxTurnsInput');
const soundAlertCheckbox = document.getElementById('soundAlertCheckbox');

const consoleBody = document.getElementById('consoleBody');
const autoScrollCheckbox = document.getElementById('autoScrollCheckbox');
const copyLogsBtn = document.getElementById('copyLogsBtn');
const clearLogsBtn = document.getElementById('clearLogsBtn');
const quickTestLspBtn = document.getElementById('quickTestLspBtn');
const toastContainer = document.getElementById('toastContainer');

// ==========================================================================
// Web Audio 声音引擎
// ==========================================================================
function playChime(freq = 528.0) {
  if (!soundAlertCheckbox || !soundAlertCheckbox.checked) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.9);
  } catch (e) {}
}

// ==========================================================================
// Toast 提示
// ==========================================================================
function showToast(message, icon = '✨') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  toastContainer.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(-10px)';
    t.style.transition = 'all 0.3s ease';
    setTimeout(() => t.remove(), 300);
  }, 2600);
}

// ==========================================================================
// API 交互方法
// ==========================================================================
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return;
    const data = await res.json();
    updateUIWithStatus(data);
  } catch (e) {
    // Server might be restarting
  }
}

async function fetchConversations() {
  try {
    const res = await fetch('/api/conversations');
    if (!res.ok) return;
    conversationsList = await res.json();
    renderConversationsDropdown();
  } catch (e) {}
}

async function fetchLogs() {
  try {
    const res = await fetch('/api/logs');
    if (!res.ok) return;
    const logs = await res.json();
    renderLogs(logs);
  } catch (e) {}
}

// ==========================================================================
// UI 更新渲染
// ==========================================================================
function updateUIWithStatus(status) {
  const prevState = appState.state;
  const prevCount = appState.sent_count;
  appState = status;

  // 1. 顶部 Header 状态药丸
  mainStatusPill.className = 'status-pill ' + (status.running ? (status.state === 'STABILIZING' ? 'stabilizing' : 'running') : 'stopped');
  
  if (!status.running) {
    mainStatusText.innerText = '已停止 STOPPED';
    startBtn.style.display = 'flex';
    stopBtn.style.display = 'none';
  } else {
    if (status.state === 'STABILIZING') {
      mainStatusText.innerText = `冷却等待 (${status.cooldown_remaining}s)`;
    } else if (status.state === 'TRIGGERING') {
      mainStatusText.innerText = '正在发送指令...';
    } else if (status.state === 'COMPLETED') {
      mainStatusText.innerText = '已达成完工退出';
    } else if (status.state === 'BUSY') {
      mainStatusText.innerText = `执行中 (Step ${status.current_step})`;
    } else {
      mainStatusText.innerText = '巡航监听中 RUNNING';
    }
    startBtn.style.display = 'none';
    stopBtn.style.display = 'flex';
  }

  // LSP API 状态
  if (status.lsp_ok) {
    lspStatusBadge.style.color = '#a5f3fc';
    lspStatusBadge.style.borderColor = 'rgba(6, 182, 212, 0.3)';
    lspStatusText.innerText = 'LSP API: 就绪';
  } else {
    lspStatusBadge.style.color = '#fca5a5';
    lspStatusBadge.style.borderColor = 'rgba(244, 63, 94, 0.4)';
    lspStatusText.innerText = 'LSP API: 未检测到';
  }

  // 节点高亮
  if (status.node_type) {
    if (status.node_type.startsWith('ssh:')) {
      const hostName = status.node_type.split('ssh:')[1];
      if (currentNodeBadge) {
        currentNodeBadge.innerText = `☁️ 远程节点: ${hostName}`;
        currentNodeBadge.style.color = '#38bdf8';
        currentNodeBadge.style.borderColor = '#38bdf8';
      }
      if (nodeBtnLocal) nodeBtnLocal.classList.remove('active');
      if (nodeBtnWestc) nodeBtnWestc.classList.add('active');
    } else {
      if (currentNodeBadge) {
        currentNodeBadge.innerText = '🖥️ 本地环境 (Local)';
        currentNodeBadge.style.color = '#38bdf8';
        currentNodeBadge.style.borderColor = 'rgba(56, 189, 248, 0.3)';
      }
      if (nodeBtnLocal) nodeBtnLocal.classList.add('active');
      if (nodeBtnWestc) nodeBtnWestc.classList.remove('active');
    }
  }

  // 2. 指标卡片
  metricState.innerText = status.state;
  metricState.className = 'metric-value status-val ' + (status.running ? (status.state === 'STABILIZING' ? 'stabilizing' : 'running') : '');

  if (status.state === 'BUSY') {
    metricStateDetail.innerText = '模型正在思考中 / 执行工具调用';
  } else if (status.state === 'STABILIZING') {
    metricStateDetail.innerText = `AI回答完成，消抖缓冲倒计时: ${status.cooldown_remaining}s`;
  } else if (status.state === 'IDLE') {
    metricStateDetail.innerText = '已就绪等待下一轮输入';
  } else if (status.state === 'TRIGGERING') {
    metricStateDetail.innerText = '正在向 Antigravity 语言服务发送消息';
  } else {
    metricStateDetail.innerText = '守护进程处于停止待命状态';
  }

  metricSentCount.innerHTML = `${status.sent_count} <span class="unit">轮</span>`;

  // 冷却倒计时与进度条
  metricCooldown.innerHTML = `${status.cooldown_remaining.toFixed(1)} <span class="unit">s</span>`;
  if (status.cooldown_seconds > 0 && status.cooldown_remaining > 0) {
    const pct = Math.max(0, Math.min(100, ((status.cooldown_seconds - status.cooldown_remaining) / status.cooldown_seconds) * 100));
    cooldownBar.style.width = pct + '%';
  } else {
    cooldownBar.style.width = '0%';
  }

  metricStepDetail.innerText = `当前步骤: Step ${status.current_step} ${status.last_snippet ? '· ' + status.last_snippet.slice(0, 30) : ''}`;

  // 目标会话
  if (status.target_conv_id) {
    metricConvId.innerText = status.target_conv_id.slice(0, 16) + '...';
    metricConvId.title = status.target_conv_id;
  } else {
    metricConvId.innerText = '--';
  }

  // 若轮数递增，触发音频
  if (status.sent_count > prevCount && prevCount > 0) {
    playChime(659.2); // E5 chime
  }
}

function renderConversationsDropdown() {
  if (!convSelect) return;
  const currentVal = convSelect.value || appState.target_conv_id;

  convSelect.innerHTML = '';
  if (conversationsList.length === 0) {
    convSelect.innerHTML = '<option value="">未找到任何对话记录</option>';
    convCountHint.innerText = '扫描到 0 个会话';
    return;
  }

  const hideEmpty = hideEmptyCheckbox ? hideEmptyCheckbox.checked : true;
  const filtered = hideEmpty
    ? conversationsList.filter(c => !c.is_empty && c.step_count > 0)
    : conversationsList;

  const displayList = filtered.length > 0 ? filtered : conversationsList;
  const emptyCount = conversationsList.filter(c => c.is_empty || c.step_count === 0).length;

  convCountHint.innerText = hideEmpty 
    ? `已显示 ${displayList.length} 个有记录会话 (已过滤 ${emptyCount} 个空白会话)` 
    : `已扫描全部 ${conversationsList.length} 个会话 (含 ${emptyCount} 个空白会话)`;

  displayList.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    let titleSnippet = c.preview && c.preview !== '(无预览内容)' ? c.preview : c.id.slice(0, 14);
    if (c.is_empty || c.step_count === 0) {
      opt.innerText = `[${c.mtime_str.slice(5)}] 🌱 [新建空白会话 · 未发消息] (${c.id.slice(0, 8)}...)`;
    } else {
      opt.innerText = `[${c.mtime_str.slice(5)}] ${titleSnippet} (${c.id.slice(0, 8)}...)`;
    }
    if (c.id === currentVal) {
      opt.selected = true;
    }
    convSelect.appendChild(opt);
  });

  // 如果原本选中的会话不在当前过滤列表中，则默认选中第一个
  if (!convSelect.value && convSelect.options.length > 0) {
    convSelect.selectedIndex = 0;
  }

  updateSelectedConvPreview();
}

function updateSelectedConvPreview() {
  const selectedId = convSelect.value;
  const found = conversationsList.find(c => c.id === selectedId);
  if (found) {
    convPreviewSnippet.innerText = `会话 [${found.id.slice(0, 8)}] 预览: ${found.preview} (共 ${found.step_count} 步 · 更新于 ${found.mtime_str})`;
  } else {
    convPreviewSnippet.innerText = `当前会话 ID: ${selectedId || '(未指定)'}`;
  }
}

function renderLogs(logs) {
  if (!consoleBody) return;
  if (logs.length === lastLogCount) return;
  lastLogCount = logs.length;

  consoleBody.innerHTML = '';
  logs.forEach(item => {
    const row = document.createElement('div');
    row.className = 'log-line';

    let tagClass = 'tag-info';
    if (item.level === 'TRIGGER') tagClass = 'tag-trigger';
    else if (item.level === 'SUCCESS') tagClass = 'tag-success';
    else if (item.level === 'WARN') tagClass = 'tag-warn';
    else if (item.level === 'ERROR') tagClass = 'tag-error';

    row.innerHTML = `
      <span class="log-ts">[${item.timestamp}]</span>
      <span class="log-tag ${tagClass}">[${item.level}]</span>
      <span class="log-msg">${escapeHtml(item.text)}</span>
    `;
    consoleBody.appendChild(row);
  });

  if (autoScrollCheckbox && autoScrollCheckbox.checked) {
    consoleBody.scrollTop = consoleBody.scrollHeight;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
}

// ==========================================================================
// 用户操作交互事件
// ==========================================================================
startBtn.addEventListener('click', async () => {
  const conv_id = convSelect.value || appState.target_conv_id;
  const prompt = promptInput.value.trim() || '继续';
  const cooldown = parseFloat(cooldownInput.value) || 3.0;
  const max_turns = parseInt(maxTurnsInput.value) || 9999;
  const is_locked = lockConvCheckbox ? lockConvCheckbox.checked : true;

  try {
    startBtn.disabled = true;
    const btnTitle = startBtn.querySelector('.btn-title');
    if (btnTitle) btnTitle.innerText = '正在启动巡航...';
    showToast('正在启动自驱巡航...', '🚀');

    const res = await fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conv_id, prompt, cooldown, max_turns, is_locked })
    });
    const data = await res.json();
    if (data.ok) {
      showToast('自驱巡航已启动！', '🚀');
      playChime(523.2);
      fetchStatus();
      fetchLogs();
    } else {
      showToast('启动失败: ' + (data.message || '未知错误'), '⚠️');
    }
  } catch (e) {
    showToast('启动请求异常: ' + e.message, '✖');
  } finally {
    startBtn.disabled = false;
    const btnTitle = startBtn.querySelector('.btn-title');
    if (btnTitle) btnTitle.innerText = '启动自驱巡航';
  }
});

stopBtn.addEventListener('click', async () => {
  try {
    stopBtn.disabled = true;
    const res = await fetch('/api/stop', { method: 'POST' });
    const data = await res.json();
    showToast('自驱巡航已停止', '⏹');
    fetchStatus();
  } catch (e) {
    showToast('停止请求失败', '✖');
  } finally {
    stopBtn.disabled = false;
  }
});

triggerOnceBtn.addEventListener('click', async () => {
  const conv_id = convSelect.value || appState.target_conv_id;
  const text = promptInput.value.trim() || '继续';

  try {
    triggerOnceBtn.disabled = true;
    const btnTitle = triggerOnceBtn.querySelector('.btn-title');
    if (btnTitle) btnTitle.innerText = '正在注入...';
    showToast(`正在注入指令: "${text}"`, '⚡');

    const res = await fetch('/api/trigger_once', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conv_id, text })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`已成功注入: "${text}"`, '⚡');
      playChime(659.2);
    } else {
      showToast('发送失败，请检查会话状态', '⚠️');
    }
    fetchStatus();
    fetchLogs();
  } catch (e) {
    showToast('注入请求异常', '✖');
  } finally {
    triggerOnceBtn.disabled = false;
    const btnTitle = triggerOnceBtn.querySelector('.btn-title');
    if (btnTitle) btnTitle.innerText = '立即发送一次';
  }
});

// 快捷提示词药丸点击
document.querySelectorAll('.prompt-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    promptInput.value = pill.dataset.val;
    showToast(`已选用提示词: "${pill.dataset.val}"`, '💬');
  });
});

// 会话下拉选择改变
convSelect.addEventListener('change', () => {
  updateSelectedConvPreview();
  const conv_id = convSelect.value;
  if (conv_id) {
    fetch('/api/save_config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_conversation_id: conv_id })
    });
  }
});

refreshConvsBtn.addEventListener('click', async () => {
  refreshConvsBtn.innerText = '⏳ 扫描中...';
  await fetchConversations();
  refreshConvsBtn.innerText = '🔄 刷新会话列表';
  showToast('会话列表已刷新', '🔄');
});

if (hideEmptyCheckbox) {
  hideEmptyCheckbox.addEventListener('change', () => {
    renderConversationsDropdown();
    showToast(hideEmptyCheckbox.checked ? '已隐藏未发言空白会话' : '已显示所有会话', '👁️');
  });
}

// 节点切换事件
if (nodeBtnLocal) {
  nodeBtnLocal.addEventListener('click', async () => {
    showToast('正在切换至本地开发区...', '🔄');
    try {
      const res = await fetch('/api/set_node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_type: 'local' })
      });
      const data = await res.json();
      if (data.ok) {
        conversationsList = data.conversations || [];
        renderConversationsDropdown();
        fetchStatus();
        fetchLogs();
        showToast('已切换至本地工作区！', '🖥️');
      }
    } catch (e) {
      showToast('切换本地节点失败', '✖');
    }
  });
}

if (nodeBtnWestc) {
  nodeBtnWestc.addEventListener('click', async () => {
    showToast('正在连接恒源云 (seetacloud-westc) 并检索会话...', '⏳');
    try {
      const res = await fetch('/api/set_node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_type: 'ssh:seetacloud-westc' })
      });
      const data = await res.json();
      if (data.ok) {
        conversationsList = data.conversations || [];
        renderConversationsDropdown();
        fetchStatus();
        fetchLogs();
        showToast('已成功连接远程 seetacloud-westc 节点！', '☁️');
      }
    } catch (e) {
      showToast('连接远程节点失败', '✖');
    }
  });
}

if (headerRestartBtn) {
  headerRestartBtn.addEventListener('click', async () => {
    if (!confirm('确定要重启 Antigravity Auto-Pilot 后端控制服务吗？')) return;
    showToast('正在重启后端守护服务...', '🔄');
    try {
      await fetch('/api/restart', { method: 'POST' });
    } catch (e) {}
    setTimeout(() => {
      window.location.reload();
    }, 1800);
  });
}

// 复制会话 ID
copyConvBtn.addEventListener('click', () => {
  const cid = appState.target_conv_id;
  if (!cid) return;
  navigator.clipboard.writeText(cid).then(() => {
    showToast('会话 ID 已复制到剪贴板', '📋');
  });
});

// 复制日志
copyLogsBtn.addEventListener('click', () => {
  const text = Array.from(consoleBody.querySelectorAll('.log-line'))
    .map(el => el.innerText)
    .join('\n');
  navigator.clipboard.writeText(text).then(() => {
    showToast('日志已复制到剪贴板', '📋');
  });
});

// 清空日志
clearLogsBtn.addEventListener('click', async () => {
  await fetch('/api/clear_logs', { method: 'POST' });
  consoleBody.innerHTML = '';
  lastLogCount = 0;
  showToast('日志已清空', '🗑️');
});

// 快速测试 LSP
quickTestLspBtn.addEventListener('click', () => {
  if (appState.lsp_ok) {
    showToast('Language Server 接口正常且就绪', '✅');
  } else {
    showToast('未检测到 Language Server 接口', '❌');
  }
});

// ==========================================================================
// 初始化与轮询驱动
// ==========================================================================
async function init() {
  await fetchConversations();
  await fetchStatus();
  await fetchLogs();

  // 定时轮询状态与日志
  setInterval(() => {
    if (isPollingActive) {
      fetchStatus();
      fetchLogs();
    }
  }, 1000);
}

document.addEventListener('DOMContentLoaded', init);
