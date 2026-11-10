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
const convSearchInput = document.getElementById('convSearchInput');
const convPreviewSnippet = document.getElementById('convPreviewSnippet');
const convCountHint = document.getElementById('convCountHint');
const refreshConvsBtn = document.getElementById('refreshConvsBtn');
const hideEmptyCheckbox = document.getElementById('hideEmptyCheckbox');
const addSessionToFleetBtn = document.getElementById('addSessionToFleetBtn');

const promptInput = document.getElementById('promptInput');
const cooldownInput = document.getElementById('cooldownInput');
const maxTurnsInput = document.getElementById('maxTurnsInput');
const soundAlertCheckbox = document.getElementById('soundAlertCheckbox');

// Fleet Toolbar Elements
const fleetSearchInput = document.getElementById('fleetSearchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const fleetSortSelect = document.getElementById('fleetSortSelect');
const toggleMuteBtn = document.getElementById('toggleMuteBtn');
const filterPills = document.querySelectorAll('.filter-pill');
const countAll = document.getElementById('countAll');
const countActive = document.getElementById('countActive');
const countBusy = document.getElementById('countBusy');
const countStopped = document.getElementById('countStopped');
const countLocal = document.getElementById('countLocal');
const countSsh = document.getElementById('countSsh');

let currentFleetFilter = 'all';
let currentFleetSearch = '';
let currentFleetSort = 'activity';

const consoleBody = document.getElementById('consoleBody');
const autoScrollCheckbox = document.getElementById('autoScrollCheckbox');
const copyLogsBtn = document.getElementById('copyLogsBtn');
const clearLogsBtn = document.getElementById('clearLogsBtn');
const quickTestLspBtn = document.getElementById('quickTestLspBtn');
const toastContainer = document.getElementById('toastContainer');

// Telemetry & Webhook Elements
const telemetrySection = document.getElementById('telemetrySection');
const toggleTelemetryBtn = document.getElementById('toggleTelemetryBtn');
const telemetryCanvas = document.getElementById('telemetryCanvas');
const telemRate = document.getElementById('telemRate');
const telemUptime = document.getElementById('telemUptime');
const telemWebhookBadge = document.getElementById('telemWebhookBadge');

const openWebhookModalBtn = document.getElementById('openWebhookModalBtn');
const closeWebhookModalBtn = document.getElementById('closeWebhookModalBtn');
const webhookModal = document.getElementById('webhookModal');
const whEnabledCheckbox = document.getElementById('whEnabledCheckbox');
const whUrlInput = document.getElementById('whUrlInput');
const whNotifyComplete = document.getElementById('whNotifyComplete');
const whNotifyError = document.getElementById('whNotifyError');
const whNotifyTrigger = document.getElementById('whNotifyTrigger');
const testWebhookBtn = document.getElementById('testWebhookBtn');
const saveWebhookBtn = document.getElementById('saveWebhookBtn');
const platformPills = document.querySelectorAll('.platform-pill');
let currentWebhookPlatform = 'feishu';

// Transcript Modal Elements
const transcriptModal = document.getElementById('transcriptModal');
const transcriptModalTitle = document.getElementById('transcriptModalTitle');
const transcriptTimeline = document.getElementById('transcriptTimeline');
const refreshTranscriptBtn = document.getElementById('refreshTranscriptBtn');
const closeTranscriptModalBtn = document.getElementById('closeTranscriptModalBtn');
const copyTranscriptBtn = document.getElementById('copyTranscriptBtn');
const closeTranscriptFooterBtn = document.getElementById('closeTranscriptFooterBtn');
let currentTranscriptConv = { id: '', node: '' };
let transcriptCache = [];

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

  const total = sessions ? sessions.length : 0;
  const activeCount = sessions ? sessions.filter(s => s.enabled).length : 0;
  const busyCount = sessions ? sessions.filter(s => s.enabled && s.state === 'BUSY').length : 0;
  const stoppedCount = sessions ? sessions.filter(s => !s.enabled || s.state === 'STOPPED' || s.state === 'COMPLETED').length : 0;
  const localCount = sessions ? sessions.filter(s => !s.node_type || !s.node_type.startsWith('ssh:')).length : 0;
  const sshCount = sessions ? sessions.filter(s => s.node_type && s.node_type.startsWith('ssh:')).length : 0;

  if (countAll) countAll.innerText = total;
  if (countActive) countActive.innerText = activeCount;
  if (countBusy) countBusy.innerText = busyCount;
  if (countStopped) countStopped.innerText = stoppedCount;
  if (countLocal) countLocal.innerText = localCount;
  if (countSsh) countSsh.innerText = sshCount;

  if (fleetCountBadge) {
    fleetCountBadge.innerText = `${activeCount} / ${total} 巡航中`;
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

  // 1. 关键词搜索过滤
  let filtered = sessions.slice();
  const q = currentFleetSearch.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(s => {
      const titleMatch = (s.title || '').toLowerCase().includes(q);
      const idMatch = (s.id || '').toLowerCase().includes(q);
      const nodeMatch = (s.node_type || '').toLowerCase().includes(q);
      const promptMatch = (s.prompt || '').toLowerCase().includes(q);
      const stateMatch = (s.state || '').toLowerCase().includes(q);
      return titleMatch || idMatch || nodeMatch || promptMatch || stateMatch;
    });
  }

  // 2. 状态标签过滤
  if (currentFleetFilter === 'active') {
    filtered = filtered.filter(s => s.enabled);
  } else if (currentFleetFilter === 'busy') {
    filtered = filtered.filter(s => s.enabled && s.state === 'BUSY');
  } else if (currentFleetFilter === 'stopped') {
    filtered = filtered.filter(s => !s.enabled || s.state === 'STOPPED' || s.state === 'COMPLETED');
  } else if (currentFleetFilter === 'local') {
    filtered = filtered.filter(s => !s.node_type || !s.node_type.startsWith('ssh:'));
  } else if (currentFleetFilter === 'ssh') {
    filtered = filtered.filter(s => s.node_type && s.node_type.startsWith('ssh:'));
  }

  // 3. 排序
  if (currentFleetSort === 'step') {
    filtered.sort((a, b) => (b.current_step || 0) - (a.current_step || 0));
  } else if (currentFleetSort === 'name') {
    filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else {
    filtered.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  }

  if (filtered.length === 0) {
    fleetGrid.innerHTML = `
      <div class="fleet-empty-state" style="grid-column: 1 / -1; padding: 36px 20px;">
        <span class="empty-icon">🔍</span>
        <div class="empty-title">未找到匹配的会话</div>
        <div class="empty-sub">当前筛选或检索条件下无匹配会话。请尝试清除检索关键词或切换筛选标签。</div>
        <button class="btn-pill-action" onclick="resetFleetFilter()" style="margin-top: 8px;">重置筛选条件</button>
      </div>
    `;
    return;
  }

  fleetGrid.innerHTML = '';
  filtered.forEach(s => {
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
        <button class="btn-card-action" onclick="handleCardTranscript('${s.id}', '${s.node_type}')" title="查看该会话最新步骤与转录回溯">
          📜 进展
        </button>
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

// ==========================================================================
// 矩阵检索、筛选与排序工具栏事件绑定 (Fleet Toolbar)
// ==========================================================================
window.resetFleetFilter = function() {
  currentFleetFilter = 'all';
  currentFleetSearch = '';
  currentFleetSort = 'activity';
  if (fleetSearchInput) fleetSearchInput.value = '';
  if (clearSearchBtn) clearSearchBtn.style.display = 'none';
  if (fleetSortSelect) fleetSortSelect.value = 'activity';
  filterPills.forEach(p => {
    if (p.dataset.filter === 'all') p.classList.add('active');
    else p.classList.remove('active');
  });
  renderFleetMatrix(appState.sessions || []);
};

function initFleetToolbar() {
  if (fleetSearchInput) {
    fleetSearchInput.addEventListener('input', (e) => {
      currentFleetSearch = e.target.value;
      if (clearSearchBtn) {
        clearSearchBtn.style.display = currentFleetSearch ? 'block' : 'none';
      }
      renderFleetMatrix(appState.sessions || []);
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (fleetSearchInput) fleetSearchInput.value = '';
      currentFleetSearch = '';
      clearSearchBtn.style.display = 'none';
      renderFleetMatrix(appState.sessions || []);
    });
  }

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFleetFilter = pill.dataset.filter || 'all';
      renderFleetMatrix(appState.sessions || []);
    });
  });

  if (fleetSortSelect) {
    fleetSortSelect.addEventListener('change', (e) => {
      currentFleetSort = e.target.value || 'activity';
      renderFleetMatrix(appState.sessions || []);
    });
  }

  // 提示音静音初始状态与切换
  const savedMute = localStorage.getItem('antigravity_sound_muted');
  if (savedMute === 'true') {
    if (soundAlertCheckbox) soundAlertCheckbox.checked = false;
    if (toggleMuteBtn) toggleMuteBtn.innerText = '🔇 提示音: 关';
  }

  if (toggleMuteBtn) {
    toggleMuteBtn.addEventListener('click', () => {
      if (!soundAlertCheckbox) return;
      soundAlertCheckbox.checked = !soundAlertCheckbox.checked;
      const isMuted = !soundAlertCheckbox.checked;
      toggleMuteBtn.innerText = isMuted ? '🔇 提示音: 关' : '🔊 提示音: 开';
      localStorage.setItem('antigravity_sound_muted', isMuted ? 'true' : 'false');
      showToast(`提示音已${isMuted ? '关闭' : '开启'}`, isMuted ? '🔇' : '🔊');
    });
  }
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
// 会话转录时光轴交互逻辑 (Transcript Inspector Modal)
// ==========================================================================
window.handleCardTranscript = async function(cid, node) {
  currentTranscriptConv = { id: cid, node: node || 'local' };
  const s = appState.sessions.find(item => item.id === cid);
  const title = s ? s.title : cid.slice(0, 8);
  if (transcriptModalTitle) transcriptModalTitle.textContent = `[${title.slice(0, 24)}] 最新执行进展回溯`;
  if (transcriptModal) transcriptModal.style.display = 'flex';
  await loadTranscriptTimeline();
};

async function loadTranscriptTimeline() {
  if (!transcriptTimeline || !currentTranscriptConv.id) return;
  transcriptTimeline.innerHTML = '<div class="timeline-empty">⏳ 正在同步最新会话转录...</div>';
  try {
    const url = `/api/sessions/transcript?conv_id=${encodeURIComponent(currentTranscriptConv.id)}&node=${encodeURIComponent(currentTranscriptConv.node)}&limit=15`;
    const res = await safeFetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    transcriptCache = data.steps || [];

    if (transcriptCache.length === 0) {
      transcriptTimeline.innerHTML = '<div class="timeline-empty">🌱 暂无步骤记录或转录文件为空</div>';
      return;
    }

    transcriptTimeline.innerHTML = '';
    transcriptCache.forEach(st => {
      const card = document.createElement('div');
      const isUser = st.type === 'USER_INPUT' || st.source === 'USER_EXPLICIT';
      const hasTools = st.tool_calls && st.tool_calls.length > 0;
      card.className = `timeline-step-card ${isUser ? 'user' : (hasTools ? 'tool' : 'model')}`;

      let toolsHtml = '';
      if (hasTools) {
        toolsHtml = `<div class="timeline-tool-tags">` +
          st.tool_calls.map(t => `<span class="timeline-tool-tag">🛠️ ${escapeHtml(t)}</span>`).join('') +
          `</div>`;
      }

      card.innerHTML = `
        <div class="timeline-step-header">
          <span class="timeline-step-index">Step ${st.step_index >= 0 ? st.step_index : '--'}</span>
          <span class="timeline-step-type">${isUser ? '👤 用户 / 注入指令' : (hasTools ? '⚡ 工具调用中' : '🤖 AI 规划与回答')} [${escapeHtml(st.status || 'DONE')}]</span>
        </div>
        ${toolsHtml}
        <div class="timeline-step-content">${escapeHtml(st.content || '(无文字输出)')}</div>
      `;
      transcriptTimeline.appendChild(card);
    });

    transcriptTimeline.parentElement.scrollTop = transcriptTimeline.parentElement.scrollHeight;
  } catch (err) {
    transcriptTimeline.innerHTML = `<div class="timeline-empty" style="color: #f43f5e;">同步转录失败: ${escapeHtml(err.message)}</div>`;
  }
}

if (refreshTranscriptBtn) {
  refreshTranscriptBtn.addEventListener('click', () => {
    showToast('正在刷新步骤进展...', '🔄');
    loadTranscriptTimeline();
  });
}

if (closeTranscriptModalBtn && transcriptModal) {
  closeTranscriptModalBtn.addEventListener('click', () => {
    transcriptModal.style.display = 'none';
  });
}

if (closeTranscriptFooterBtn && transcriptModal) {
  closeTranscriptFooterBtn.addEventListener('click', () => {
    transcriptModal.style.display = 'none';
  });
}

if (transcriptModal) {
  transcriptModal.addEventListener('click', (e) => {
    if (e.target === transcriptModal) {
      transcriptModal.style.display = 'none';
    }
  });
}

if (copyTranscriptBtn) {
  copyTranscriptBtn.addEventListener('click', () => {
    if (!transcriptCache || transcriptCache.length === 0) {
      showToast('暂无内容可复制', '⚠️');
      return;
    }
    const text = transcriptCache.map(st => `[Step ${st.step_index}] ${st.type} (${st.status}):\n${st.content}\n`).join('\n---\n');
    navigator.clipboard.writeText(text).then(() => {
      showToast('已复制最近步骤进展到剪贴板！', '📋');
    });
  });
}

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
  let filtered = hideEmpty
    ? conversationsList.filter(c => !c.is_empty && c.step_count > 0)
    : conversationsList;

  const searchQuery = convSearchInput ? convSearchInput.value.trim().toLowerCase() : '';
  if (searchQuery) {
    filtered = filtered.filter(c => {
      const idMatch = c.id.toLowerCase().includes(searchQuery);
      const prevMatch = (c.preview || '').toLowerCase().includes(searchQuery);
      return idMatch || prevMatch;
    });
  }

  const displayList = filtered;
  const emptyCount = conversationsList.filter(c => c.is_empty || c.step_count === 0).length;

  if (convCountHint) {
    if (searchQuery) {
      convCountHint.innerText = `搜索匹配到 ${displayList.length} 个会话 (关键词: "${searchQuery}")`;
    } else {
      convCountHint.innerText = hideEmpty 
        ? `已显示 ${displayList.length} 个有记录会话 (已过滤 ${emptyCount} 个空白会话)` 
        : `已扫描全部 ${conversationsList.length} 个会话 (含 ${emptyCount} 个空白会话)`;
    }
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

if (convSearchInput) {
  convSearchInput.addEventListener('input', renderConversationsDropdown);
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
// 实时效能与活动图表渲染 (Live Telemetry Canvas Visualizer)
// ==========================================================================
function renderTelemetryCanvas(history = []) {
  if (!telemetryCanvas) return;
  const ctx = telemetryCanvas.getContext('2d');
  if (!ctx) return;

  const width = telemetryCanvas.width;
  const height = telemetryCanvas.height;

  // 清空画布
  ctx.clearRect(0, 0, width, height);

  // 绘制半透明水平参考网格线
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  [0.25, 0.5, 0.75].forEach(ratio => {
    const y = Math.round(height * ratio);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // 提取数值点 (支持纯数值数组或 { injections_per_min, ... } 历史对象列表)
  let rawItems = history && history.length ? [...history] : [0, 0];
  let dataPoints = rawItems.map(item => {
    if (typeof item === 'object' && item !== null) {
      return Number(item.injections_per_min || 0);
    }
    return Number(item) || 0;
  });
  if (dataPoints.length === 1) dataPoints = [0, dataPoints[0]];

  const maxVal = Math.max(5, ...dataPoints);
  const paddingX = 14;
  const paddingY = 12;
  const graphW = width - paddingX * 2;
  const graphH = height - paddingY * 2;
  const stepX = graphW / (dataPoints.length - 1);

  // 计算折线坐标
  const coords = dataPoints.map((val, idx) => {
    const x = paddingX + idx * stepX;
    const y = paddingY + graphH - (val / maxVal) * graphH;
    return { x, y, val };
  });

  // 1. 绘制荧光面积渐变底色
  const fillGrad = ctx.createLinearGradient(0, paddingY, 0, height);
  fillGrad.addColorStop(0, 'rgba(56, 189, 248, 0.32)');
  fillGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.12)');
  fillGrad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

  ctx.beginPath();
  ctx.moveTo(coords[0].x, height);
  coords.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(coords[coords.length - 1].x, height);
  ctx.closePath();
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // 2. 绘制发光青色折线
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.4;
  ctx.shadowColor = 'rgba(56, 189, 248, 0.75)';
  ctx.shadowBlur = 10;
  coords.forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.restore();

  // 若全零显示轻量待机呼吸提示
  const isAllZero = dataPoints.every(v => v === 0);
  if (isAllZero) {
    ctx.save();
    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚡ 矩阵就绪监测中 · 暂无注入峰值，波形将在触发自驱轮次时实时跃升', width / 2, height / 2 + 4);
    ctx.restore();
  }

  // 3. 最新活动节点脉冲圆点
  const lastPoint = coords[coords.length - 1];
  ctx.beginPath();
  ctx.arc(lastPoint.x, lastPoint.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#38bdf8';
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 8;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(lastPoint.x, lastPoint.y, 7, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

async function fetchTelemetry() {
  try {
    const res = await safeFetch('/api/telemetry');
    if (!res.ok) return;
    const data = await res.json();
    if (data) {
      const t = data.telemetry || data;
      if (telemRate) telemRate.textContent = (t.injections_per_min || 0).toFixed(1);
      if (telemUptime) telemUptime.textContent = t.uptime_formatted || '0时 0分';
      renderTelemetryCanvas(t.history || []);
    }
  } catch (err) {
    // 轮询非阻塞
  }
}

async function updateWebhookBadge() {
  if (!telemWebhookBadge) return;
  try {
    const res = await safeFetch('/api/webhook');
    if (!res.ok) return;
    const wh = await res.json();
    if (wh.enabled && wh.url) {
      const platMap = { feishu: '飞书', dingtalk: '钉钉', wecom: '企微', generic: '通用' };
      const platName = platMap[wh.platform] || wh.platform;
      telemWebhookBadge.textContent = `已启用 (${platName})`;
      telemWebhookBadge.style.color = '#34d399';
    } else {
      telemWebhookBadge.textContent = '未配置';
      telemWebhookBadge.style.color = '#64748b';
    }
  } catch (err) {}
}

// 效能图表显示/隐藏切换
if (toggleTelemetryBtn && telemetrySection) {
  toggleTelemetryBtn.addEventListener('click', () => {
    if (telemetrySection.style.display === 'none') {
      telemetrySection.style.display = 'block';
      toggleTelemetryBtn.textContent = '📈 隐藏图表';
    } else {
      telemetrySection.style.display = 'none';
      toggleTelemetryBtn.textContent = '📈 效能图表';
    }
  });
}

// ==========================================================================
// Webhook 模态弹窗控制 (Webhook Modal Actions)
// ==========================================================================
const platformPlaceholders = {
  feishu: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  dingtalk: 'https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxxxxxxxxxxxxxx',
  wecom: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  generic: 'https://your-domain.com/api/autopilot-webhook'
};

if (platformPills) {
  platformPills.forEach(pill => {
    pill.addEventListener('click', () => {
      platformPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentWebhookPlatform = pill.dataset.platform || 'feishu';
      if (whUrlInput && (!whUrlInput.value || Object.values(platformPlaceholders).includes(whUrlInput.value))) {
        whUrlInput.placeholder = platformPlaceholders[currentWebhookPlatform] || '';
      }
    });
  });
}

if (openWebhookModalBtn && webhookModal) {
  openWebhookModalBtn.addEventListener('click', async () => {
    webhookModal.style.display = 'flex';
    try {
      const res = await safeFetch('/api/webhook');
      if (res.ok) {
        const wh = await res.json();
        if (whEnabledCheckbox) whEnabledCheckbox.checked = !!wh.enabled;
        if (whUrlInput) whUrlInput.value = wh.url || '';
        if (whNotifyComplete) whNotifyComplete.checked = wh.notify_on_complete !== false;
        if (whNotifyError) whNotifyError.checked = wh.notify_on_error !== false;
        if (whNotifyTrigger) whNotifyTrigger.checked = !!wh.notify_on_trigger;
        
        currentWebhookPlatform = wh.platform || 'feishu';
        platformPills.forEach(p => {
          if (p.dataset.platform === currentWebhookPlatform) p.classList.add('active');
          else p.classList.remove('active');
        });
      }
    } catch (e) {
      console.warn('读取 Webhook 配置失败:', e);
    }
  });
}

if (closeWebhookModalBtn && webhookModal) {
  closeWebhookModalBtn.addEventListener('click', () => {
    webhookModal.style.display = 'none';
  });
}

if (webhookModal) {
  webhookModal.addEventListener('click', (e) => {
    if (e.target === webhookModal) {
      webhookModal.style.display = 'none';
    }
  });
}

// 测试 Webhook 发送
if (testWebhookBtn) {
  testWebhookBtn.addEventListener('click', async () => {
    const url = whUrlInput ? whUrlInput.value.trim() : '';
    if (!url) {
      showToast('请先输入 Webhook 接收端 URL', '⚠️');
      return;
    }
    testWebhookBtn.disabled = true;
    showToast('正在向机器人发送测试通知...', '🧪');
    try {
      const res = await safeFetch('/api/webhook/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, platform: currentWebhookPlatform })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('测试通知发送成功！请检查群聊消息', '🎉');
      } else {
        showToast(`测试发送失败: ${data.message || '请检查 URL 是否有效'}`, '❌');
      }
    } catch (err) {
      showToast(`网络异常: ${err.message}`, '❌');
    } finally {
      testWebhookBtn.disabled = false;
    }
  });
}

// 保存 Webhook 配置
if (saveWebhookBtn) {
  saveWebhookBtn.addEventListener('click', async () => {
    const payload = {
      enabled: whEnabledCheckbox ? whEnabledCheckbox.checked : false,
      platform: currentWebhookPlatform,
      url: whUrlInput ? whUrlInput.value.trim() : '',
      notify_on_complete: whNotifyComplete ? whNotifyComplete.checked : true,
      notify_on_error: whNotifyError ? whNotifyError.checked : true,
      notify_on_trigger: whNotifyTrigger ? whNotifyTrigger.checked : false
    };

    saveWebhookBtn.disabled = true;
    try {
      const res = await safeFetch('/api/webhook/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Webhook 自动化推送配置已保存！', '💾');
        updateWebhookBadge();
        if (webhookModal) webhookModal.style.display = 'none';
      } else {
        showToast('保存失败，请检查后端状态', '❌');
      }
    } catch (err) {
      showToast(`保存失败: ${err.message}`, '❌');
    } finally {
      saveWebhookBtn.disabled = false;
    }
  });
}

// ==========================================================================
// 初始化与高频巡航轮询循环
// ==========================================================================
async function initApp() {
  initFleetToolbar();
  await fetchStatus();
  await fetchConversations();
  await fetchLogs();
  await fetchTelemetry();
  await updateWebhookBadge();

  // 1.5 秒轮询状态与日志
  setInterval(() => {
    if (isPollingActive) {
      fetchStatus();
      fetchLogs();
    }
  }, 1500);

  // 3 秒轮询效能曲线
  setInterval(() => {
    if (isPollingActive) {
      fetchTelemetry();
    }
  }, 3000);

  // 15 秒更新一次会话扫描缓存与 Webhook 状态
  setInterval(() => {
    if (isPollingActive) {
      fetchConversations();
      updateWebhookBadge();
    }
  }, 15000);
}

document.addEventListener('DOMContentLoaded', initApp);
