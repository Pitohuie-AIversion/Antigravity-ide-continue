// ==========================================================================
// ANTIGRAVITY AUTO-PILOT CONTROL CENTER - MULTI-SESSION FLEET SCRIPT
// ==========================================================================

let appState = {
  running: false,
  fleet_running: false,
  active_count: 0,
  total_count: 0,
  busy_count: 0,
  stabilizing_count: 0,
  total_sent_count: 0,
  sessions: [],
  node_type: 'local',
  lsp_ok: true
};

let conversationsList = [];
let lastLogCount = 0;
let lastTotalSentCount = 0;
let isPollingActive = true;

// DOM Elements
const mainStatusPill = document.getElementById('mainStatusPill');
const mainStatusText = document.getElementById('mainStatusText');
const lspStatusBadge = document.getElementById('lspStatusBadge');
const lspStatusText = document.getElementById('lspStatusText');
const headerRestartBtn = document.getElementById('headerRestartBtn');

const metricFleetVal = document.getElementById('metricFleetVal');
const metricFleetDetail = document.getElementById('metricFleetDetail');
const metricTotalSent = document.getElementById('metricTotalSent');
const metricStepVal = document.getElementById('metricStepVal');
const metricStepDetail = document.getElementById('metricStepDetail');
const cooldownBar = document.getElementById('cooldownBar');
const metricNodeDist = document.getElementById('metricNodeDist');
const metricNodeDetail = document.getElementById('metricNodeDetail');

const startAllBtn = document.getElementById('startAllBtn');
const stopAllBtn = document.getElementById('stopAllBtn');
const triggerAllBtn = document.getElementById('triggerAllBtn');
const startAllFleetBtn = document.getElementById('startAllFleetBtn');
const stopAllFleetBtn = document.getElementById('stopAllFleetBtn');

const fleetSection = document.getElementById('fleetSection');
const fleetCountBadge = document.getElementById('fleetCountBadge');
const fleetGrid = document.getElementById('fleetGrid');

const currentNodeBadge = document.getElementById('currentNodeBadge');
const nodeBtnLocal = document.getElementById('nodeBtnLocal');
const nodeBtnWestc = document.getElementById('nodeBtnWestc');

const convSelect = document.getElementById('convSelect');
const convPreviewSnippet = document.getElementById('convPreviewSnippet');
const convCountHint = document.getElementById('convCountHint');
const refreshConvsBtn = document.getElementById('refreshConvsBtn');
const hideEmptyCheckbox = document.getElementById('hideEmptyCheckbox');
const addSessionToFleetBtn = document.getElementById('addSessionToFleetBtn');

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
// Safe Fetch with AbortController Timeout
// ==========================================================================
async function safeFetch(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

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
  if (!toastContainer) return;
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
    const res = await safeFetch('/api/status', {}, 4000);
    if (!res.ok) return;
    const data = await res.json();
    updateUIWithStatus(data);
  } catch (e) {}
}

async function fetchConversations() {
  try {
    const node = appState.node_type || 'local';
    const res = await safeFetch(`/api/conversations?node=${encodeURIComponent(node)}`, {}, 7000);
    if (!res.ok) return;
    conversationsList = await res.json();
    renderConversationsDropdown();
  } catch (e) {}
}

async function fetchLogs() {
  try {
    const res = await safeFetch('/api/logs', {}, 4000);
    if (!res.ok) return;
    const logs = await res.json();
    renderLogs(logs);
  } catch (e) {}
}

// ==========================================================================
// UI 更新渲染
// ==========================================================================
function updateUIWithStatus(status) {
  appState = status;
  const sessions = status.sessions || [];
  const activeCount = status.active_count || 0;
  const totalCount = status.total_count || 0;
  const busyCount = status.busy_count || 0;
  const stabilizingCount = status.stabilizing_count || 0;
  const totalSent = status.total_sent_count || 0;

  // 1. 顶部 Header 状态
  if (activeCount > 0) {
    mainStatusPill.className = 'status-pill running';
    mainStatusText.innerText = `${activeCount} 会话并发巡航中`;
  } else {
    mainStatusPill.className = 'status-pill stopped';
    mainStatusText.innerText = '0 会话运行 (已待命)';
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

  // 2. 指标卡片
  if (metricFleetVal) {
    metricFleetVal.innerHTML = `${activeCount} / ${totalCount} <span class="unit">巡航</span>`;
  }
  if (metricFleetDetail) {
    if (activeCount > 0) {
      metricFleetDetail.innerText = `${busyCount} 思考中 · ${stabilizingCount} 冷却中 · ${activeCount - busyCount - stabilizingCount} 就绪`;
    } else {
      metricFleetDetail.innerText = '全矩阵处于待命或暂停状态';
    }
  }

  if (metricTotalSent) {
    metricTotalSent.innerHTML = `${totalSent} <span class="unit">轮</span>`;
  }

  // 活跃动态步骤跟踪
  if (metricStepVal) {
    const activeWithStep = sessions.filter(s => s.current_step > 0);
    if (activeWithStep.length > 0) {
      activeWithStep.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
      const top = activeWithStep[0];
      metricStepVal.innerText = `Step ${top.current_step}`;
      if (metricStepDetail) {
        metricStepDetail.innerText = `[${top.node_type.startsWith('ssh:') ? '恒源云' : '本地'}] ${top.title.slice(0, 16)}...`;
      }
    } else {
      metricStepVal.innerText = 'Step --';
      if (metricStepDetail) metricStepDetail.innerText = '活跃会话状态跟踪中';
    }
  }

  // 节点分布统计
  if (metricNodeDist) {
    const localCount = sessions.filter(s => !s.node_type.startsWith('ssh:')).length;
    const remoteCount = sessions.filter(s => s.node_type.startsWith('ssh:')).length;
    metricNodeDist.innerText = `${localCount} 本地 + ${remoteCount} 恒源云`;
  }

  // 3. 渲染多会话矩阵看板
  renderFleetMatrix(sessions);

  // 4. 音频提示：若全量注入增加
  if (totalSent > lastTotalSentCount && lastTotalSentCount > 0) {
    playChime(659.2); // E5
  }
  lastTotalSentCount = totalSent;
}

// ==========================================================================
// 渲染多会话矩阵看板卡片
// ==========================================================================
function renderFleetMatrix(sessions) {
  if (!fleetGrid) return;

  if (fleetCountBadge) {
    const active = sessions.filter(s => s.enabled).length;
    fleetCountBadge.innerText = `${active} / ${sessions.length} 巡航中`;
  }

  if (!sessions || sessions.length === 0) {
    fleetGrid.innerHTML = `
      <div class="fleet-empty-state">
        <span class="empty-icon">🛸</span>
        <div class="empty-title">当前并发监控池为空</div>
        <div class="empty-sub">您还没有纳管任何会话。请在下方选择目标会话并点击【➕ 将此会话加入并发监控池】即可开启多线程自动化。</div>
        <button class="btn-pill-action primary" onclick="document.getElementById('enrollSection').scrollIntoView({behavior:'smooth'})" style="margin-top: 6px;">
          ➕ 立即纳管第一个会话
        </button>
      </div>
    `;
    return;
  }

  fleetGrid.innerHTML = '';
  sessions.forEach(s => {
    const isRemote = s.node_type && s.node_type.startsWith('ssh:');
    const nodeLabel = isRemote ? '☁️ 恒源云西区' : '🖥️ 本地开发';
    const nodeClass = isRemote ? 'remote' : 'local';

    let statusText = '就绪待命';
    let statusClass = 'idle';
    let cardStateClass = '';

    if (!s.enabled) {
      statusText = '已暂停';
      statusClass = 'stopped';
    } else if (s.state === 'BUSY') {
      statusText = `⚡ 思考执行中 (Step ${s.current_step})`;
      statusClass = 'busy';
      cardStateClass = 'busy';
    } else if (s.state === 'STABILIZING') {
      statusText = `⏱ 冷却中 (${s.cooldown_remaining}s)`;
      statusClass = 'stabilizing';
      cardStateClass = 'stabilizing';
    } else if (s.state === 'TRIGGERING') {
      statusText = '🚀 正在注入...';
      statusClass = 'triggering';
      cardStateClass = 'running';
    } else if (s.state === 'COMPLETED') {
      statusText = '🎉 任务已完工';
      statusClass = 'completed';
    } else if (s.state === 'OFFLINE') {
      statusText = '⚠️ 节点离线';
      statusClass = 'offline';
    } else {
      statusText = '🟢 就绪监听';
      statusClass = 'idle';
      cardStateClass = 'running';
    }

    const card = document.createElement('div');
    card.className = `fleet-card ${cardStateClass}`;
    card.id = `card-${s.id}`;

    // 冷却倒计时条
    let cooldownBarHtml = '';
    if (s.state === 'STABILIZING' && s.cooldown > 0 && s.cooldown_remaining > 0) {
      const pct = Math.max(0, Math.min(100, ((s.cooldown - s.cooldown_remaining) / s.cooldown) * 100));
      cooldownBarHtml = `
        <div class="fleet-card-cooldown-bar">
          <div class="fleet-card-cooldown-fill" style="width: ${pct}%;"></div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="fleet-card-header">
        <div class="fleet-card-tags">
          <span class="node-chip ${nodeClass}">${nodeLabel}</span>
          <span class="conv-id-chip" title="点击复制完整会话ID" onclick="copyText('${s.id}')">${s.id.slice(0, 8)}...</span>
        </div>
        <label class="fleet-switch" title="开启/暂停该会话自驱巡航">
          <input type="checkbox" class="session-toggle" data-cid="${s.id}" ${s.enabled ? 'checked' : ''}>
          <span class="fleet-slider"></span>
        </label>
      </div>

      <div class="fleet-card-title" title="${escapeHtml(s.title)}">
        ${escapeHtml(s.title)}
      </div>

      <div class="fleet-card-status-row">
        <span class="fleet-status-badge ${statusClass}">${statusText}</span>
        <span style="font-size: 11px; color: #64748b; font-family: var(--font-mono);">
          Step ${s.current_step >= 0 ? s.current_step : '--'}
        </span>
      </div>

      ${cooldownBarHtml}

      <div class="fleet-card-stats">
        <div class="stat-cell">
          <span class="stat-cell-label">已注入</span>
          <span class="stat-cell-val">${s.sent_count} 轮</span>
        </div>
        <div class="stat-cell">
          <span class="stat-cell-label">消抖冷却</span>
          <span class="stat-cell-val">${s.cooldown}s</span>
        </div>
        <div class="stat-cell">
          <span class="stat-cell-label">上限轮数</span>
          <span class="stat-cell-val">${s.max_turns}</span>
        </div>
      </div>

      <div class="fleet-card-prompt" title="自动注入指令">
        💬 "${escapeHtml(s.prompt)}"
      </div>

      <div class="fleet-card-actions">
        <button class="btn-card-action primary" onclick="handleCardTrigger('${s.id}')" title="立即向该会话发送一次指令">
          ⚡ 立即注入
        </button>
        <button class="btn-card-action" onclick="handleCardEdit('${s.id}')" title="修改该会话提示词与冷却参数">
          ⚙️ 配置
        </button>
        <button class="btn-card-action danger" onclick="handleCardRemove('${s.id}')" title="移出并发监控池">
          🗑️ 移出
        </button>
      </div>
    `;

    fleetGrid.appendChild(card);
  });

  // 绑定开关事件
  fleetGrid.querySelectorAll('.session-toggle').forEach(input => {
    input.addEventListener('change', async (e) => {
      const cid = e.target.dataset.cid;
      const enabled = e.target.checked;
      try {
        await safeFetch('/api/sessions/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conv_id: cid, enabled })
        });
        showToast(`会话 ${cid.slice(0, 8)} ${enabled ? '已开启巡航' : '已暂停'}`, enabled ? '🚀' : '⏹');
        fetchStatus();
      } catch (err) {
        showToast('切换失败: ' + err.message, '✖');
      }
    });
  });
}

// 卡片交互快捷处理
window.copyText = function(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`已复制会话 ID: ${text.slice(0, 12)}...`, '📋');
  });
};

window.handleCardTrigger = async function(cid) {
  try {
    const s = appState.sessions.find(item => item.id === cid);
    const text = s ? s.prompt : '继续';
    showToast(`正在向 ${cid.slice(0, 8)} 注入指令...`, '⚡');
    const res = await safeFetch('/api/sessions/trigger_once', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conv_id: cid, text })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`已成功注入会话 [${cid.slice(0, 8)}]`, '⚡');
      playChime(659.2);
    } else {
      showToast('注入失败，请检查会话或节点状态', '⚠️');
    }
    fetchStatus();
    fetchLogs();
  } catch (e) {
    showToast('注入请求异常', '✖');
  }
};

window.handleCardEdit = function(cid) {
  const s = appState.sessions.find(item => item.id === cid);
  if (!s) return;
  const newPrompt = window.prompt(`修改会话 [${s.title.slice(0, 15)}] 的自动注入指令:`, s.prompt);
  if (newPrompt === null) return;
  const newCooldown = window.prompt(`修改消抖冷却时间 (秒):`, s.cooldown);
  if (newCooldown === null) return;

  safeFetch('/api/sessions/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conv_id: cid,
      prompt: newPrompt.trim() || '继续',
      cooldown: parseFloat(newCooldown) || 3.0
    })
  }).then(() => {
    showToast('会话配置已更新！', '⚙️');
    fetchStatus();
  });
};

window.handleCardRemove = async function(cid) {
  if (!confirm(`确定将该会话从并发监控池移出吗？`)) return;
  try {
    await safeFetch('/api/sessions/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conv_id: cid })
    });
    showToast(`会话已移出监控池`, '🗑️');
    fetchStatus();
  } catch (e) {
    showToast('移除失败: ' + e.message, '✖');
  }
};

// ==========================================================================
// 会话下拉列表渲染
// ==========================================================================
function renderConversationsDropdown() {
  if (!convSelect) return;
  const currentVal = convSelect.value;

  convSelect.innerHTML = '';
  if (conversationsList.length === 0) {
    convSelect.innerHTML = '<option value="">未找到任何对话记录</option>';
    if (convCountHint) convCountHint.innerText = '扫描到 0 个会话';
    return;
  }

  const hideEmpty = hideEmptyCheckbox ? hideEmptyCheckbox.checked : true;
  const filtered = hideEmpty
    ? conversationsList.filter(c => !c.is_empty && c.step_count > 0)
    : conversationsList;

  const displayList = filtered.length > 0 ? filtered : conversationsList;
  const emptyCount = conversationsList.filter(c => c.is_empty || c.step_count === 0).length;

  if (convCountHint) {
    convCountHint.innerText = hideEmpty 
      ? `已显示 ${displayList.length} 个有记录会话 (已过滤 ${emptyCount} 个空白会话)` 
      : `已扫描全部 ${conversationsList.length} 个会话 (含 ${emptyCount} 个空白会话)`;
  }

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
    convPreviewSnippet.innerText = `当前选定 ID: ${selectedId || '(未指定)'}`;
  }
}

// ==========================================================================
// 日志控制台渲染
// ==========================================================================
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
// 事件绑定：全矩阵控制与会话纳管
// ==========================================================================
// 1. 全部启动
async function handleStartAll() {
  try {
    showToast('正在启动全矩阵自驱巡航...', '🚀');
    const res = await safeFetch('/api/sessions/start_all', { method: 'POST' });
    const data = await res.json();
    showToast('全矩阵自驱巡航已启动！', '🚀');
    playChime(523.2);
    fetchStatus();
    fetchLogs();
  } catch (e) {
    showToast('启动失败: ' + e.message, '✖');
  }
}
if (startAllBtn) startAllBtn.addEventListener('click', handleStartAll);
if (startAllFleetBtn) startAllFleetBtn.addEventListener('click', handleStartAll);

// 2. 全部暂停
async function handleStopAll() {
  try {
    const res = await safeFetch('/api/sessions/stop_all', { method: 'POST' });
    showToast('全矩阵自驱已全部暂停', '⏹');
    fetchStatus();
    fetchLogs();
  } catch (e) {
    showToast('暂停请求失败', '✖');
  }
}
if (stopAllBtn) stopAllBtn.addEventListener('click', handleStopAll);
if (stopAllFleetBtn) stopAllFleetBtn.addEventListener('click', handleStopAll);

// 3. 全矩阵单次注入
if (triggerAllBtn) {
  triggerAllBtn.addEventListener('click', async () => {
    const activeSessions = (appState.sessions || []).filter(s => s.enabled);
    if (activeSessions.length === 0) {
      showToast('当前没有运行中的会话，请先启用至少一个会话', '⚠️');
      return;
    }
    showToast(`正在向 ${activeSessions.length} 个会话同时发送指令...`, '⚡');
    for (const s of activeSessions) {
      safeFetch('/api/sessions/trigger_once', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conv_id: s.id, text: s.prompt })
      });
    }
    setTimeout(() => {
      showToast(`已向全矩阵发送完成`, '✨');
      fetchStatus();
      fetchLogs();
    }, 600);
  });
}

// 4. 将选定会话加入监控池
if (addSessionToFleetBtn) {
  addSessionToFleetBtn.addEventListener('click', async () => {
    const conv_id = convSelect.value;
    if (!conv_id) {
      showToast('请先选择一个有效的会话', '⚠️');
      return;
    }

    const node_type = appState.node_type || 'local';
    const prompt = promptInput.value.trim() || '继续推进下一项任务';
    const cooldown = parseFloat(cooldownInput.value) || 3.0;
    const max_turns = parseInt(maxTurnsInput.value) || 9999;

    const found = conversationsList.find(c => c.id === conv_id);
    const title = found ? found.preview : `会话·${conv_id.slice(0, 8)}`;

    try {
      addSessionToFleetBtn.disabled = true;
      const res = await safeFetch('/api/sessions/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conv_id,
          node_type,
          title,
          prompt,
          cooldown,
          max_turns,
          enabled: true
        })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`已成功纳管会话 [${title.slice(0, 12)}...] 并开启巡航！`, '🚀');
        playChime(659.2);
        fetchStatus();
        fetchLogs();
        if (fleetSection) {
          fleetSection.scrollIntoView({ behavior: 'smooth' });
        }
      } else {
        showToast('添加失败', '⚠️');
      }
    } catch (e) {
      showToast('请求异常: ' + e.message, '✖');
    } finally {
      addSessionToFleetBtn.disabled = false;
    }
  });
}

// 5. 节点切换
function selectNode(nodeType) {
  if (appState.node_type === nodeType) return;
  safeFetch('/api/set_node', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_type: nodeType })
  }).then(async () => {
    appState.node_type = nodeType;
    if (currentNodeBadge) {
      currentNodeBadge.innerText = nodeType.startsWith('ssh:') ? '☁️ 远程节点: 恒源云西区' : '🖥️ 本地环境 (Local)';
    }
    if (nodeType === 'local') {
      nodeBtnLocal.classList.add('active');
      nodeBtnWestc.classList.remove('active');
    } else {
      nodeBtnLocal.classList.remove('active');
      nodeBtnWestc.classList.add('active');
    }
    showToast(`视图已切换至: ${nodeType}`, '🌐');
    fetchConversations();
  });
}

if (nodeBtnLocal) nodeBtnLocal.addEventListener('click', () => selectNode('local'));
if (nodeBtnWestc) nodeBtnWestc.addEventListener('click', () => selectNode('ssh:seetacloud-westc'));

// 快捷药丸
document.querySelectorAll('.prompt-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    promptInput.value = pill.dataset.val;
    showToast(`已选用提示词: "${pill.dataset.val}"`, '💬');
  });
});

if (convSelect) {
  convSelect.addEventListener('change', updateSelectedConvPreview);
}

if (refreshConvsBtn) {
  refreshConvsBtn.addEventListener('click', async () => {
    refreshConvsBtn.innerText = '⏳ 扫描中...';
    await fetchConversations();
    refreshConvsBtn.innerText = '🔄 刷新会话列表';
    showToast('会话列表已刷新', '🔄');
  });
}

if (hideEmptyCheckbox) {
  hideEmptyCheckbox.addEventListener('change', renderConversationsDropdown);
}

// 顶部重启服务
if (headerRestartBtn) {
  headerRestartBtn.addEventListener('click', async () => {
    if (!confirm('确定重启 Auto-Pilot 后端守护进程吗？')) return;
    try {
      headerRestartBtn.disabled = true;
      showToast('正在重启后端服务...', '🔄');
      await safeFetch('/api/restart', { method: 'POST' }, 2000);
      setTimeout(() => {
        location.reload();
      }, 1500);
    } catch (e) {
      setTimeout(() => location.reload(), 1500);
    }
  });
}

// 日志控制
if (clearLogsBtn) {
  clearLogsBtn.addEventListener('click', async () => {
    await safeFetch('/api/clear_logs', { method: 'POST' });
    showToast('日志已清空', '🗑️');
    fetchLogs();
  });
}

if (copyLogsBtn) {
  copyLogsBtn.addEventListener('click', () => {
    if (!consoleBody) return;
    const text = consoleBody.innerText;
    navigator.clipboard.writeText(text).then(() => {
      showToast('所有运行日志已复制到剪贴板', '📋');
    });
  });
}

if (quickTestLspBtn) {
  quickTestLspBtn.addEventListener('click', () => {
    fetchStatus().then(() => {
      showToast(appState.lsp_ok ? 'LSP 通道处于就绪可用状态' : '未检测到 LSP 接口', appState.lsp_ok ? '✅' : '⚠️');
    });
  });
}

// ==========================================================================
// 初始化与高频巡航轮询循环
// ==========================================================================
async function initApp() {
  await fetchStatus();
  await fetchConversations();
  await fetchLogs();

  // 1.5 秒轮询状态与日志
  setInterval(() => {
    if (isPollingActive) {
      fetchStatus();
      fetchLogs();
    }
  }, 1500);

  // 15 秒更新一次会话扫描缓存
  setInterval(() => {
    if (isPollingActive) {
      fetchConversations();
    }
  }, 15000);
}

document.addEventListener('DOMContentLoaded', initApp);
