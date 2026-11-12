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
const hideSubagentsCheckbox = document.getElementById('hideSubagentsCheckbox');
const addSessionToFleetBtn = document.getElementById('addSessionToFleetBtn');
const addMonitorOnlyBtn = document.getElementById('addMonitorOnlyBtn');

const radarGrid = document.getElementById('radarGrid');
const radarCountBadge = document.getElementById('radarCountBadge');
const refreshRadarBtn = document.getElementById('refreshRadarBtn');

const promptInput = document.getElementById('promptInput');
const saveCustomPromptBtn = document.getElementById('saveCustomPromptBtn');
const promptMacroBar = document.getElementById('promptMacroBar');
const enrollTagsInput = document.getElementById('enrollTagsInput');
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
const countAttention = document.getElementById('countAttention');
const countLocal = document.getElementById('countLocal');
const countSsh = document.getElementById('countSsh');

let currentFleetFilter = 'all';
let currentFleetSearch = '';
let currentFleetSort = 'activity';

// Batch Operations & Multi-Select
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const fleetBatchBar = document.getElementById('fleetBatchBar');
const batchSelectedCount = document.getElementById('batchSelectedCount');
const batchStartBtn = document.getElementById('batchStartBtn');
const batchStopBtn = document.getElementById('batchStopBtn');
const batchEditBtn = document.getElementById('batchEditBtn');
const batchRemoveBtn = document.getElementById('batchRemoveBtn');
const batchClearBtn = document.getElementById('batchClearBtn');

// Backup & Restore Elements
const openBackupModalBtn = document.getElementById('openBackupModalBtn');
const closeBackupModalBtn = document.getElementById('closeBackupModalBtn');
const backupModal = document.getElementById('backupModal');
const downloadBackupBtn = document.getElementById('downloadBackupBtn');
const importConfigTextarea = document.getElementById('importConfigTextarea');
const chooseImportFileBtn = document.getElementById('chooseImportFileBtn');
const importConfigFile = document.getElementById('importConfigFile');
const submitImportBtn = document.getElementById('submitImportBtn');

// Notification & Strategy Elements
const toggleNotifBtn = document.getElementById('toggleNotifBtn');
const openStrategyModalBtn = document.getElementById('openStrategyModalBtn');
const strategyModal = document.getElementById('strategyModal');
const closeStrategyModalBtn = document.getElementById('closeStrategyModalBtn');
const cancelStrategyModalBtn = document.getElementById('cancelStrategyModalBtn');
const saveStrategyModalBtn = document.getElementById('saveStrategyModalBtn');
const stratAutoAdoptCheckbox = document.getElementById('stratAutoAdoptCheckbox');
const stratSmartBackoffCheckbox = document.getElementById('stratSmartBackoffCheckbox');
const stratAutoArchiveCheckbox = document.getElementById('stratAutoArchiveCheckbox');
const stratStallAlertInput = document.getElementById('stratStallAlertInput');

let selectedSessionIds = new Set();

const consoleBody = document.getElementById('consoleBody');
const autoScrollCheckbox = document.getElementById('autoScrollCheckbox');
const copyLogsBtn = document.getElementById('copyLogsBtn');
const clearLogsBtn = document.getElementById('clearLogsBtn');
const quickTestLspBtn = document.getElementById('quickTestLspBtn');
const toastContainer = document.getElementById('toastContainer');

// Log Console Toolbar Elements
const logSearchInput = document.getElementById('logSearchInput');
const clearLogSearchBtn = document.getElementById('clearLogSearchBtn');
const logLevelPills = document.querySelectorAll('.log-filter-pill');

let currentLogLevel = 'ALL';
let currentLogSearch = '';
let cachedLogs = [];

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

async function fetchConversations(force = false) {
  try {
    const node = appState.node_type || 'local';
    const url = `/api/conversations?node=${encodeURIComponent(node)}${force ? '&force=1' : ''}`;
    const res = await safeFetch(url, {}, 7000);
    if (!res.ok) return;
    conversationsList = await res.json();
    renderConversationsDropdown();
    renderRadarList();
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

function formatWorkspaceShort(ws) {
  if (!ws) return '';
  const clean = ws.replace(/\\/g, '/').replace(/\/+$/, '');
  if (/^[A-Za-z]:$/.test(clean)) return clean + '/';
  const parts = clean.split('/').filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1];
  return ws;
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
  const errorCount = status.error_count || 0;
  const totalSent = status.total_sent_count || 0;

  // 1. 顶部 Header 状态
  if (activeCount > 0) {
    mainStatusPill.className = 'status-pill running';
    mainStatusText.innerText = `${activeCount} 会话自动巡航中`;
  } else if (totalCount > 0) {
    mainStatusPill.className = 'status-pill stabilizing';
    mainStatusText.innerText = `${totalCount} 会话仅监控中`;
  } else {
    mainStatusPill.className = 'status-pill stopped';
    mainStatusText.innerText = '0 会话纳管 (已待命)';
  }

  // LSP API 状态
  if (status.lsp_ok) {
    lspStatusBadge.style.color = '#a5f3fc';
    lspStatusBadge.style.borderColor = 'rgba(6, 182, 212, 0.3)';
    lspStatusText.innerText = status.lsp_addr ? `LSP: ${status.lsp_addr}` : 'LSP API: 就绪';
  } else {
    lspStatusBadge.style.color = '#fca5a5';
    lspStatusBadge.style.borderColor = 'rgba(244, 63, 94, 0.4)';
    lspStatusText.innerText = status.lsp_bin_ok ? 'LSP 服务未运行' : 'LSP API: 未检测到';
  }

  // 2. 指标卡片
  if (metricFleetVal) {
    metricFleetVal.innerHTML = `${activeCount} / ${totalCount} <span class="unit">巡航</span>`;
  }
  if (metricFleetDetail) {
    if (totalCount > 0) {
      const errSuffix = errorCount > 0 ? ` · ${errorCount} 异常` : '';
      metricFleetDetail.innerText = `${busyCount} 运行中 · ${stabilizingCount} 冷却中${errSuffix}`;
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
        const wsShort = top.workspace ? formatWorkspaceShort(top.workspace) : (top.node_type.startsWith('ssh:') ? top.node_type.slice(4) : '本地');
        metricStepDetail.innerText = `[${wsShort}] ${(top.title || '').slice(0, 18)}`;
      }
    } else {
      metricStepVal.innerText = 'Step --';
      if (metricStepDetail) metricStepDetail.innerText = '活跃会话状态跟踪中';
    }
  }

  // 节点与数据源分布统计
  if (metricNodeDist) {
    const localCount = sessions.filter(s => !s.node_type.startsWith('ssh:')).length;
    const remoteCount = sessions.filter(s => s.node_type.startsWith('ssh:')).length;
    metricNodeDist.innerText = `${localCount} 本地 + ${remoteCount} 远程`;
  }
  if (metricNodeDetail) {
    const dbText = status.summaries_db_exists ? 'DB索引正常' : '纯日志模式';
    const lsText = status.lsp_addr ? `LSP ${status.lsp_addr.split(':')[1] || ''}` : 'LSP待检测';
    metricNodeDetail.innerText = `${dbText} · ${lsText}`;
  }

  // 3. 渲染多会话矩阵看板与发现雷达
  renderFleetMatrix(sessions);
  renderRadarList();

  // 4. 音频提示与桌面通知：若全量注入增加
  if (totalSent > lastTotalSentCount && lastTotalSentCount > 0) {
    playChime(659.2); // E5
    sendDesktopNotification('全矩阵自动注入触发', `已完成新一轮指令注入，全矩阵累计已注入 ${totalSent} 轮！`);
  }
  lastTotalSentCount = totalSent;
}

// ==========================================================================
// 渲染多会话矩阵看板卡片
// ==========================================================================
function renderFleetMatrix(sessions) {
  if (!fleetGrid) return;

  const validIds = new Set((sessions || []).map(s => s.id));
  Array.from(selectedSessionIds).forEach(cid => {
    if (!validIds.has(cid)) selectedSessionIds.delete(cid);
  });

  const isBusyEff = (s) => s.state === 'BUSY' || (!s.enabled && s.live_state === 'BUSY');
  const isAttentionEff = (s) => (
    s.state === 'ERROR' || s.state === 'OFFLINE' || s.state === 'WAITING_DECISION' ||
    !!s.error || s.live_state === 'WAITING_DECISION'
  );

  const total = sessions ? sessions.length : 0;
  const activeCount = sessions ? sessions.filter(s => s.enabled).length : 0;
  const busyCount = sessions ? sessions.filter(isBusyEff).length : 0;
  const stoppedCount = sessions ? sessions.filter(s => !s.enabled || s.state === 'STOPPED' || s.state === 'COMPLETED').length : 0;
  const attentionCount = sessions ? sessions.filter(isAttentionEff).length : 0;
  const localCount = sessions ? sessions.filter(s => !s.node_type || !s.node_type.startsWith('ssh:')).length : 0;
  const sshCount = sessions ? sessions.filter(s => s.node_type && s.node_type.startsWith('ssh:')).length : 0;

  if (countAll) countAll.innerText = total;
  if (countActive) countActive.innerText = activeCount;
  if (countBusy) countBusy.innerText = busyCount;
  if (countStopped) countStopped.innerText = stoppedCount;
  if (countAttention) countAttention.innerText = attentionCount;
  if (countLocal) countLocal.innerText = localCount;
  if (countSsh) countSsh.innerText = sshCount;

  if (fleetCountBadge) {
    fleetCountBadge.innerText = `${activeCount} 巡航 / ${total} 纳管`;
  }

  if (!sessions || sessions.length === 0) {
    fleetGrid.innerHTML = `
      <div class="fleet-empty-state">
        <span class="empty-icon">🛸</span>
        <div class="empty-title">当前并发监控池为空</div>
        <div class="empty-sub">您还没有纳管任何会话。可直接在下方【Antigravity 会话实时雷达】或【纳管新会话】中一键开启实时监控或自动巡航。</div>
        <button class="btn-pill-action primary" onclick="document.getElementById('radarSection').scrollIntoView({behavior:'smooth'})" style="margin-top: 6px;">
          📡 查看发现的 Antigravity 会话
        </button>
      </div>
    `;
    updateBatchBar();
    return;
  }

  // 1. 关键词搜索过滤
  let filtered = sessions.slice();
  const q = currentFleetSearch.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(s => {
      const titleMatch = (s.title || '').toLowerCase().includes(q);
      const idMatch = (s.id || '').toLowerCase().includes(q);
      const wsMatch = (s.workspace || '').toLowerCase().includes(q);
      const nodeMatch = (s.node_type || '').toLowerCase().includes(q);
      const promptMatch = (s.prompt || '').toLowerCase().includes(q);
      const stateMatch = (s.state || '').toLowerCase().includes(q) || (s.live_state || '').toLowerCase().includes(q);
      const tagsMatch = (s.tags || []).some(t => t.toLowerCase().includes(q));
      return titleMatch || idMatch || wsMatch || nodeMatch || promptMatch || stateMatch || tagsMatch;
    });
  }

  // 2. 状态标签过滤
  if (currentFleetFilter === 'active') {
    filtered = filtered.filter(s => s.enabled);
  } else if (currentFleetFilter === 'busy') {
    filtered = filtered.filter(isBusyEff);
  } else if (currentFleetFilter === 'stopped') {
    filtered = filtered.filter(s => !s.enabled || s.state === 'STOPPED' || s.state === 'COMPLETED');
  } else if (currentFleetFilter === 'attention') {
    filtered = filtered.filter(isAttentionEff);
  } else if (currentFleetFilter === 'local') {
    filtered = filtered.filter(s => !s.node_type || !s.node_type.startsWith('ssh:'));
  } else if (currentFleetFilter === 'ssh') {
    filtered = filtered.filter(s => s.node_type && s.node_type.startsWith('ssh:'));
  } else if (currentFleetFilter.startsWith('tag:')) {
    const targetTag = currentFleetFilter.slice(4);
    filtered = filtered.filter(s => (s.tags || []).includes(targetTag));
  }

  // 3. 排序 (置顶优先)
  if (currentFleetSort === 'step') {
    filtered.sort((a, b) => (b.current_step || 0) - (a.current_step || 0));
  } else if (currentFleetSort === 'name') {
    filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else {
    filtered.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  }
  filtered.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  // 动态同步分类标签筛选按钮
  const filterPillsContainer = document.getElementById('fleetFilterPills');
  if (filterPillsContainer) {
    const allTagsMap = {};
    (sessions || []).forEach(s => {
      (s.tags || []).forEach(t => {
        allTagsMap[t] = (allTagsMap[t] || 0) + 1;
      });
    });
    filterPillsContainer.querySelectorAll('.tag-filter-pill').forEach(el => el.remove());
    Object.keys(allTagsMap).sort().forEach(tag => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isAct = (currentFleetFilter === 'tag:' + tag);
      btn.className = `filter-pill tag-filter-pill ${isAct ? 'active' : ''}`;
      btn.dataset.filter = 'tag:' + tag;
      btn.innerHTML = `🏷️ ${escapeHtml(tag)} (${allTagsMap[tag]})`;
      btn.addEventListener('click', () => {
        filterPillsContainer.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        currentFleetFilter = 'tag:' + tag;
        renderFleetMatrix(appState.sessions || []);
      });
      filterPillsContainer.appendChild(btn);
    });
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
    updateBatchBar();
    return;
  }

  fleetGrid.innerHTML = '';
  filtered.forEach(s => {
    const isRemote = s.node_type && s.node_type.startsWith('ssh:');
    const nodeLabel = isRemote ? `☁️ ${escapeHtml(s.node_type.slice(4))}` : '🖥️ 本地';
    const nodeClass = isRemote ? 'remote' : 'local';
    const wsShort = s.workspace ? formatWorkspaceShort(s.workspace) : '';
    const wsChipHtml = wsShort
      ? `<span class="workspace-chip" title="工作区: ${escapeHtml(s.workspace)}">📁 ${escapeHtml(wsShort)}</span>`
      : '';

    const tagsHtml = (s.tags && s.tags.length > 0)
      ? s.tags.map(t => `<span class="session-tag-chip" title="分类标签: ${escapeHtml(t)}">#${escapeHtml(t)}</span>`).join('')
      : '';

    let velocityHtml = '';
    const effectiveBusy = s.state === 'BUSY' || (!s.enabled && s.live_state === 'BUSY');
    if (s.step_velocity && s.step_velocity > 0) {
      velocityHtml = `<span class="velocity-badge pulse" title="当前推进速率: 每分钟约 ${s.step_velocity} 步">⚡ +${s.step_velocity} 步/分</span>`;
    } else if (effectiveBusy && (s.busy_duration || 0) > 90) {
      velocityHtml = `<span class="velocity-badge thinking" title="深度运算与规划中">⏳ 深度运算</span>`;
    }

    const dur = s.busy_duration || 0;
    let durText = '';
    if (dur >= 60) {
      durText = ` · ${Math.floor(dur / 60)}m ${dur % 60}s`;
    } else if (dur > 0) {
      durText = ` · ${dur}s`;
    }

    let statusText = '就绪待命';
    let statusClass = 'idle';
    let cardStateClass = '';

    const isBgActive = Boolean(s.not_fully_idle && s.db_status === 'CASCADE_RUN_STATUS_IDLE');

    if (!s.enabled) {
      const ls = s.live_state || 'UNKNOWN';
      if (s.state === 'COMPLETED' || ls === 'COMPLETED') {
        statusText = '🎉 任务已完工';
        statusClass = 'completed';
      } else if (ls === 'BUSY') {
        statusText = isBgActive
          ? `👁️ 仅监控 · ⏳ 后台任务活跃${durText}`
          : `👁️ 仅监控 · ⚡ 运行中${durText}`;
        statusClass = 'monitor';
        cardStateClass = 'busy';
      } else if (ls === 'WAITING_DECISION') {
        statusText = '👁️ 仅监控 · ❓ 待人工回答';
        statusClass = 'waiting';
        cardStateClass = 'waiting';
      } else if (ls === 'OFFLINE') {
        statusText = '👁️ 仅监控 · ⚠️ 离线/缺失';
        statusClass = 'offline';
      } else if (ls === 'EMPTY') {
        statusText = '👁️ 仅监控 · 🌱 空白未开始';
        statusClass = 'stopped';
      } else if (ls === 'IDLE') {
        statusText = '👁️ 仅监控 · 🟢 会话空闲';
        statusClass = 'monitor';
      } else {
        statusText = '👁️ 仅监控 (检测状态中)';
        statusClass = 'stopped';
      }
    } else if (s.state === 'BUSY') {
      statusText = isBgActive
        ? `⏳ 后台任务活跃 (Step ${s.current_step}${durText})`
        : `⚡ 思考执行中 (Step ${s.current_step}${durText})`;
      statusClass = dur > 300 ? 'busy stalled' : 'busy';
      cardStateClass = 'busy';
    } else if (s.state === 'WAITING_DECISION') {
      statusText = '❓ 等待人工回答 (ask_question)';
      statusClass = 'waiting';
      cardStateClass = 'waiting';
    } else if (s.state === 'ERROR') {
      const retryHint = s.cooldown_remaining > 0 ? ` · ${s.cooldown_remaining}s后重试` : '';
      statusText = `❌ 注入失败${retryHint}`;
      statusClass = 'error';
      cardStateClass = 'error';
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
      statusText = '⚠️ 节点离线 / 日志缺失';
      statusClass = 'offline';
    } else {
      statusText = '🟢 就绪监听';
      statusClass = 'idle';
      cardStateClass = 'running';
    }

    const card = document.createElement('div');
    card.className = `fleet-card ${cardStateClass} ${s.pinned ? 'pinned' : ''}`;
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

    const snippetHtml = s.last_snippet
      ? `<div class="fleet-card-snippet" title="${escapeHtml(s.last_snippet)}">📝 ${escapeHtml(s.last_snippet)}</div>`
      : '';

    const errorHtml = s.error
      ? `<div class="fleet-card-error" title="${escapeHtml(s.error)}">⚠️ 最近异常: ${escapeHtml(s.error)}</div>`
      : '';

    card.innerHTML = `
      <div class="fleet-card-header">
        <div class="fleet-card-tags">
          <label class="fleet-card-select-wrap" title="选择此会话进行批量控制">
            <input type="checkbox" class="card-select-checkbox" data-cid="${s.id}" ${selectedSessionIds.has(s.id) ? 'checked' : ''}>
          </label>
          <span class="node-chip ${nodeClass}">${nodeLabel}</span>
          ${wsChipHtml}
          ${s.node_type.startsWith('ssh:') ? `<span class="node-ping-badge" onclick="pingSshNode('${escapeHtml(escapeJsStr(s.node_type))}', this)" title="点击测试远程 SSH 连通性与网络延迟">⚡ 测速</span>` : ''}
          ${tagsHtml}
          <span class="conv-id-chip" title="点击复制完整会话ID: ${escapeHtml(s.id)}" onclick="copyText('${escapeHtml(escapeJsStr(s.id))}')">${escapeHtml(s.id.slice(0, 8))}...</span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="pin-btn ${s.pinned ? 'pinned' : ''}" onclick="toggleSessionPin('${escapeHtml(escapeJsStr(s.id))}', ${!s.pinned})" title="${s.pinned ? '取消置顶' : '置顶此会话'}">📌</button>
          <label class="fleet-switch" title="开启/关闭自动注入（关闭后仍保持实时监控）">
            <input type="checkbox" class="session-toggle" data-cid="${s.id}" ${s.enabled ? 'checked' : ''}>
            <span class="fleet-slider"></span>
          </label>
        </div>
      </div>

      <div class="fleet-card-title" title="${escapeHtml(s.title)}">
        <span class="title-text">${escapeHtml(s.title)}</span>
        <button class="btn-rename" onclick="handleInlineRename('${escapeHtml(escapeJsStr(s.id))}')" title="重命名会话">✏️</button>
      </div>

      <div class="fleet-card-status-row">
        <span class="fleet-status-badge ${statusClass}">${statusText}</span>
        <div style="display: flex; gap: 6px; align-items: center;">
          ${velocityHtml}
          <span style="font-size: 11px; color: #64748b; font-family: var(--font-mono);">
            Step ${s.current_step >= 0 ? s.current_step : '--'}
          </span>
        </div>
      </div>

      ${cooldownBarHtml}
      ${snippetHtml}
      ${errorHtml}

      <div class="fleet-card-stats">
        <div class="stat-cell">
          <span class="stat-cell-label">已成功注入</span>
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
        <button class="btn-card-action" onclick="handleCardTranscript('${escapeHtml(escapeJsStr(s.id))}', '${escapeHtml(escapeJsStr(s.node_type))}')" title="查看该会话最新步骤与转录回溯">
          📜 进展
        </button>
        <button class="btn-card-action" onclick="handleCardClone('${escapeHtml(escapeJsStr(s.id))}')" title="克隆该会话参数至新建表单">
          📑 克隆
        </button>
        <button class="btn-card-action primary" onclick="handleCardTrigger('${escapeHtml(escapeJsStr(s.id))}')" title="立即向该会话发送一次指令">
          ⚡ 立即注入
        </button>
        <button class="btn-card-action" onclick="handleCardEdit('${escapeHtml(escapeJsStr(s.id))}')" title="修改该会话提示词与冷却参数">
          ⚙️ 配置
        </button>
        <button class="btn-card-action danger" onclick="handleCardRemove('${escapeHtml(escapeJsStr(s.id))}')" title="移出并发监控池">
          🗑️ 移出
        </button>
      </div>
    `;

    fleetGrid.appendChild(card);
  });

  // 绑定卡片复选框事件
  fleetGrid.querySelectorAll('.card-select-checkbox').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const cid = e.target.dataset.cid;
      if (e.target.checked) {
        selectedSessionIds.add(cid);
      } else {
        selectedSessionIds.delete(cid);
      }
      updateBatchBar();
    });
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

  updateBatchBar();
}

function updateBatchBar() {
  if (!fleetBatchBar || !batchSelectedCount) return;
  const count = selectedSessionIds.size;
  if (count > 0) {
    fleetBatchBar.style.display = 'flex';
    batchSelectedCount.innerText = `已选 ${count} 个`;
  } else {
    fleetBatchBar.style.display = 'none';
  }
  if (selectAllCheckbox) {
    const checkboxes = fleetGrid ? fleetGrid.querySelectorAll('.card-select-checkbox') : [];
    selectAllCheckbox.checked = checkboxes.length > 0 && Array.from(checkboxes).every(c => c.checked);
  }
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

  // 全选控制
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const checked = e.target.checked;
      const visibleCheckboxes = fleetGrid ? fleetGrid.querySelectorAll('.card-select-checkbox') : [];
      visibleCheckboxes.forEach(chk => {
        chk.checked = checked;
        const cid = chk.dataset.cid;
        if (checked) selectedSessionIds.add(cid);
        else selectedSessionIds.delete(cid);
      });
      updateBatchBar();
    });
  }

  // 批量开启
  if (batchStartBtn) {
    batchStartBtn.addEventListener('click', async () => {
      if (selectedSessionIds.size === 0) return;
      showToast(`正在批量开启 ${selectedSessionIds.size} 个会话...`, '🚀');
      try {
        await safeFetch('/api/sessions/batch_toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conv_ids: Array.from(selectedSessionIds), enabled: true })
        });
        showToast(`已批量开启 ${selectedSessionIds.size} 个会话巡航！`, '🚀');
        fetchStatus();
      } catch (e) {
        showToast('批量操作失败: ' + e.message, '✖');
      }
    });
  }

  // 批量暂停
  if (batchStopBtn) {
    batchStopBtn.addEventListener('click', async () => {
      if (selectedSessionIds.size === 0) return;
      showToast(`正在批量暂停 ${selectedSessionIds.size} 个会话...`, '⏹');
      try {
        await safeFetch('/api/sessions/batch_toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conv_ids: Array.from(selectedSessionIds), enabled: false })
        });
        showToast(`已批量暂停 ${selectedSessionIds.size} 个会话`, '⏹');
        fetchStatus();
      } catch (e) {
        showToast('批量操作失败: ' + e.message, '✖');
      }
    });
  }

  // 批量修改提示词与冷却
  if (batchEditBtn) {
    batchEditBtn.addEventListener('click', async () => {
      if (selectedSessionIds.size === 0) return;
      const newPrompt = window.prompt(`批量修改这 ${selectedSessionIds.size} 个会话的注入指令 (留空则不修改):`, '');
      if (newPrompt === null) return;
      const newCooldown = window.prompt(`批量修改消抖冷却秒数 (留空则不修改):`, '');
      if (newCooldown === null) return;

      const payload = { conv_ids: Array.from(selectedSessionIds) };
      if (newPrompt.trim()) payload.prompt = newPrompt.trim();
      if (newCooldown.trim()) payload.cooldown = parseFloat(newCooldown);

      try {
        await safeFetch('/api/sessions/batch_update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast(`已批量更新 ${selectedSessionIds.size} 个会话参数！`, '⚙️');
        fetchStatus();
      } catch (e) {
        showToast('批量更新失败: ' + e.message, '✖');
      }
    });
  }

  // 批量移出
  if (batchRemoveBtn) {
    batchRemoveBtn.addEventListener('click', async () => {
      if (selectedSessionIds.size === 0) return;
      if (!confirm(`确定将选中的 ${selectedSessionIds.size} 个会话全部从监控池移出吗？`)) return;
      try {
        await safeFetch('/api/sessions/batch_remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conv_ids: Array.from(selectedSessionIds) })
        });
        showToast(`已移出 ${selectedSessionIds.size} 个会话`, '🗑️');
        selectedSessionIds.clear();
        updateBatchBar();
        fetchStatus();
      } catch (e) {
        showToast('批量移出失败: ' + e.message, '✖');
      }
    });
  }

  // 清除批量选择
  if (batchClearBtn) {
    batchClearBtn.addEventListener('click', () => {
      selectedSessionIds.clear();
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
      const checkboxes = fleetGrid ? fleetGrid.querySelectorAll('.card-select-checkbox') : [];
      checkboxes.forEach(c => c.checked = false);
      updateBatchBar();
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

function initBackupRestoreModal() {
  if (openBackupModalBtn && backupModal) {
    openBackupModalBtn.addEventListener('click', () => {
      backupModal.style.display = 'flex';
    });
  }

  if (closeBackupModalBtn && backupModal) {
    closeBackupModalBtn.addEventListener('click', () => {
      backupModal.style.display = 'none';
    });
  }

  if (backupModal) {
    backupModal.addEventListener('click', (e) => {
      if (e.target === backupModal) {
        backupModal.style.display = 'none';
      }
    });
  }

  if (downloadBackupBtn) {
    downloadBackupBtn.addEventListener('click', () => {
      window.location.href = '/api/config/export';
      showToast('正在下载全量配置文件...', '💾');
    });
  }

  if (chooseImportFileBtn && importConfigFile) {
    chooseImportFileBtn.addEventListener('click', () => {
      importConfigFile.click();
    });
  }

  if (importConfigFile) {
    importConfigFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (importConfigTextarea) {
          importConfigTextarea.value = evt.target.result;
          showToast(`已加载文件: ${file.name}`, '📁');
        }
      };
      reader.readAsText(file, 'UTF-8');
    });
  }

  if (submitImportBtn) {
    submitImportBtn.addEventListener('click', async () => {
      const text = importConfigTextarea ? importConfigTextarea.value.trim() : '';
      if (!text) {
        showToast('请先选择文件或粘贴 JSON 配置文本', '⚠️');
        return;
      }
      try {
        const payload = JSON.parse(text);
        submitImportBtn.disabled = true;
        showToast('正在导入配置...', '⏳');
        const res = await safeFetch('/api/config/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.ok) {
          showToast(`成功导入并纳管 ${data.count} 个会话！`, '🎉');
          if (backupModal) backupModal.style.display = 'none';
          fetchStatus();
          fetchLogs();
        } else {
          showToast(`导入失败: ${data.message || '格式错误'}`, '❌');
        }
      } catch (err) {
        showToast('JSON 解析失败，请检查配置内容是否合法', '❌');
      } finally {
        submitImportBtn.disabled = false;
      }
    });
  }
}

// ==========================================================================
// 操作系统桌面弹窗通知 (Web Notification API)
// ==========================================================================
function sendDesktopNotification(title, body) {
  const notifEnabled = localStorage.getItem('antigravity_notif_enabled') === 'true';
  if (!notifEnabled || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(`Antigravity AutoPilot · ${title}`, {
        body: body,
        icon: '/favicon.ico',
        tag: 'autopilot-event'
      });
    } catch (e) {}
  }
}

function initNotifications() {
  const notifEnabled = localStorage.getItem('antigravity_notif_enabled') === 'true';
  if (toggleNotifBtn) {
    toggleNotifBtn.innerText = notifEnabled ? '🔔 桌面通知: 开' : '🔕 桌面通知: 关';
    toggleNotifBtn.addEventListener('click', async () => {
      if (!('Notification' in window)) {
        showToast('当前浏览器不支持桌面通知 API', '⚠️');
        return;
      }
      if (Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          showToast('桌面通知授权未开启', '⚠️');
          localStorage.setItem('antigravity_notif_enabled', 'false');
          toggleNotifBtn.innerText = '🔕 桌面通知: 关';
          return;
        }
      }
      const cur = localStorage.getItem('antigravity_notif_enabled') === 'true';
      const next = !cur;
      localStorage.setItem('antigravity_notif_enabled', next ? 'true' : 'false');
      toggleNotifBtn.innerText = next ? '🔔 桌面通知: 开' : '🔕 桌面通知: 关';
      showToast(`桌面弹窗通知已${next ? '开启' : '关闭'}`, next ? '🔔' : '🔕');
      if (next) {
        sendDesktopNotification('通知已就绪', '当会话触发注入、达成完工或发生卡顿预警，将向您推送桌面弹窗。');
      }
    });
  }
}

// ==========================================================================
// 远程节点实时 SSH 连通性与网络测速
// ==========================================================================
window.pingSshNode = async function(nodeType, el) {
  const host = nodeType.replace('ssh:', '');
  if (!host || !el) return;
  const originalText = el.textContent;
  el.textContent = '⏳ 测速中...';
  el.style.opacity = '0.7';
  try {
    const res = await safeFetch('/api/ssh/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host })
    });
    const data = await res.json();
    if (data.ok) {
      el.textContent = `🟢 ${data.latency_ms}ms`;
      el.style.color = '#10b981';
      showToast(`远程节点 [${host}] 测速正常: 往返延迟 ${data.latency_ms}ms`, '🟢');
    } else {
      el.textContent = '🔴 异常';
      el.style.color = '#f43f5e';
      showToast(`远程节点 [${host}] 测速失败: ${data.error || '无法连通'}`, '❌');
    }
  } catch (err) {
    el.textContent = '⚠️ 失败';
    showToast(`测速异常: ${err.message}`, '⚠️');
  } finally {
    el.style.opacity = '1';
    setTimeout(() => {
      el.textContent = originalText;
      el.style.color = '';
    }, 6000);
  }
};

// ==========================================================================
// 巡航调度与自愈策略设置弹窗 (Strategy Modal)
// ==========================================================================
function initStrategyModal() {
  if (openStrategyModalBtn && strategyModal) {
    openStrategyModalBtn.addEventListener('click', async () => {
      strategyModal.style.display = 'flex';
      try {
        const res = await safeFetch('/api/telemetry');
        if (res.ok) {
          const data = await res.json();
          const strat = data.strategy || {};
          if (stratAutoAdoptCheckbox) stratAutoAdoptCheckbox.checked = !!strat.auto_adopt_sessions;
          if (stratSmartBackoffCheckbox) stratSmartBackoffCheckbox.checked = strat.smart_backoff !== false;
          if (stratAutoArchiveCheckbox) stratAutoArchiveCheckbox.checked = !!strat.auto_archive_completed;
          if (stratStallAlertInput) stratStallAlertInput.value = strat.stall_alert_seconds || 300;
        }
      } catch (e) {}
    });
  }

  function closeStrategy() {
    if (strategyModal) strategyModal.style.display = 'none';
  }

  if (closeStrategyModalBtn) closeStrategyModalBtn.addEventListener('click', closeStrategy);
  if (cancelStrategyModalBtn) cancelStrategyModalBtn.addEventListener('click', closeStrategy);
  if (strategyModal) {
    strategyModal.addEventListener('click', (e) => {
      if (e.target === strategyModal) closeStrategy();
    });
  }

  if (saveStrategyModalBtn) {
    saveStrategyModalBtn.addEventListener('click', async () => {
      saveStrategyModalBtn.disabled = true;
      saveStrategyModalBtn.innerText = '⏳ 保存中...';
      try {
        const payload = {
          auto_adopt_sessions: stratAutoAdoptCheckbox ? stratAutoAdoptCheckbox.checked : false,
          smart_backoff: stratSmartBackoffCheckbox ? stratSmartBackoffCheckbox.checked : true,
          auto_archive_completed: stratAutoArchiveCheckbox ? stratAutoArchiveCheckbox.checked : false,
          stall_alert_seconds: stratStallAlertInput ? parseInt(stratStallAlertInput.value, 10) || 300 : 300
        };
        const res = await safeFetch('/api/strategy/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.ok) {
          showToast('巡航调度策略已成功更新并热生效！', '⚙️');
          closeStrategy();
        } else {
          showToast('更新失败: ' + (data.error || '未知错误'), '❌');
        }
      } catch (err) {
        showToast('保存策略网络异常: ' + err.message, '⚠️');
      } finally {
        saveStrategyModalBtn.disabled = false;
        saveStrategyModalBtn.innerText = '💾 保存生效';
      }
    });
  }
}

// 卡片交互快捷处理
window.toggleSessionPin = async function(cid, pinned) {
  try {
    const res = await safeFetch('/api/sessions/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conv_id: cid, pinned })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(pinned ? '已将该会话置顶' : '已取消会话置顶', '📌');
      fetchStatus();
    }
  } catch (err) {
    showToast('置顶操作失败: ' + err.message, '⚠️');
  }
};

window.handleInlineRename = async function(cid) {
  const s = (appState.sessions || []).find(item => item.id === cid);
  const currentTitle = s ? s.title : '';
  const newTitle = prompt('请输入会话新名称:', currentTitle || '');
  if (newTitle === null || !newTitle.trim()) return;
  try {
    const res = await safeFetch('/api/sessions/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conv_id: cid, title: newTitle.trim() })
    });
    const data = await res.json();
    if (data.ok) {
      showToast('会话名称已更新', '✏️');
      fetchStatus();
    }
  } catch (err) {
    showToast('重命名失败: ' + err.message, '⚠️');
  }
};

window.handleCardClone = function(cid) {
  const s = (appState.sessions || []).find(item => item.id === cid);
  if (!s) return;
  if (promptInput) promptInput.value = s.prompt || '';
  if (cooldownInput) cooldownInput.value = s.cooldown || 3.0;
  if (maxTurnsInput) maxTurnsInput.value = s.max_turns || 9999;
  if (enrollTagsInput) enrollTagsInput.value = (s.tags || []).join(', ');
  showToast(`已克隆会话 [${s.title}] 配置参数至纳管表单`, '📑');
  const enrollSec = document.getElementById('enrollSection');
  if (enrollSec) enrollSec.scrollIntoView({ behavior: 'smooth' });
};

function initReportModal() {
  const openReportModalBtn = document.getElementById('openReportModalBtn');
  const closeReportModalBtn = document.getElementById('closeReportModalBtn');
  const reportModal = document.getElementById('reportModal');
  const refreshReportBtn = document.getElementById('refreshReportBtn');
  const downloadReportBtn = document.getElementById('downloadReportBtn');
  const copyReportBtn = document.getElementById('copyReportBtn');
  const reportMarkdownPre = document.getElementById('reportMarkdownPre');

  let currentReportText = '';

  async function loadReport() {
    if (!reportMarkdownPre) return;
    reportMarkdownPre.textContent = '⏳ 正在聚合生成最新全矩阵交付报告...';
    try {
      const res = await safeFetch('/api/fleet/report');
      const data = await res.json();
      if (data.ok) {
        currentReportText = data.report || '';
        reportMarkdownPre.textContent = currentReportText;
      } else {
        reportMarkdownPre.textContent = '❌ 生成报告失败: ' + (data.error || '未知异常');
      }
    } catch (err) {
      reportMarkdownPre.textContent = '⚠️ 网络异常: ' + err.message;
    }
  }

  if (openReportModalBtn && reportModal) {
    openReportModalBtn.addEventListener('click', () => {
      reportModal.style.display = 'flex';
      loadReport();
    });
  }

  function closeReport() {
    if (reportModal) reportModal.style.display = 'none';
  }

  if (closeReportModalBtn) closeReportModalBtn.addEventListener('click', closeReport);
  if (reportModal) {
    reportModal.addEventListener('click', (e) => {
      if (e.target === reportModal) closeReport();
    });
  }
  if (refreshReportBtn) {
    refreshReportBtn.addEventListener('click', () => {
      showToast('正在重新汇总全矩阵报告...', '🔄');
      loadReport();
    });
  }
  if (copyReportBtn) {
    copyReportBtn.addEventListener('click', () => {
      if (!currentReportText) return;
      navigator.clipboard.writeText(currentReportText).then(() => {
        showToast('已复制完整 Markdown 交付报告！', '📋');
      });
    });
  }
  if (downloadReportBtn) {
    downloadReportBtn.addEventListener('click', () => {
      if (!currentReportText) return;
      const blob = new Blob([currentReportText], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.href = url;
      a.download = `Antigravity_Fleet_Report_${ts}.md`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('已下载交付总结报告', '⬇️');
    });
  }
}

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
    }, 15000);
    const data = await res.json();
    if (data.ok) {
      showToast(`已成功注入会话 [${cid.slice(0, 8)}]`, '⚡');
      playChime(659.2);
    } else {
      showToast(`注入失败: ${data.error || '请检查会话或节点状态'}`, '⚠️');
    }
    fetchStatus();
    fetchLogs();
  } catch (e) {
    showToast('注入请求异常: ' + e.message, '✖');
  }
};

// Session Edit Modal Elements
const sessionEditModal = document.getElementById('sessionEditModal');
const sessionEditModalTitle = document.getElementById('sessionEditModalTitle');
const editSessionCid = document.getElementById('editSessionCid');
const editSessionTitle = document.getElementById('editSessionTitle');
const editSessionPrompt = document.getElementById('editSessionPrompt');
const editSessionCooldown = document.getElementById('editSessionCooldown');
const editSessionMaxTurns = document.getElementById('editSessionMaxTurns');
const editSessionTags = document.getElementById('editSessionTags');
const editSessionPinned = document.getElementById('editSessionPinned');
const editPromptMacroBar = document.getElementById('editPromptMacroBar');
const saveEditPromptMacroBtn = document.getElementById('saveEditPromptMacroBtn');
const closeSessionEditModalBtn = document.getElementById('closeSessionEditModalBtn');
const cancelSessionEditBtn = document.getElementById('cancelSessionEditBtn');
const saveSessionEditBtn = document.getElementById('saveSessionEditBtn');

window.handleCardEdit = function(cid) {
  const s = (appState.sessions || []).find(item => item.id === cid);
  if (!s) return;
  if (!sessionEditModal) return;
  if (sessionEditModalTitle) sessionEditModalTitle.textContent = `配置会话 · ${(s.title || cid.slice(0, 8)).slice(0, 22)}`;
  if (editSessionCid) editSessionCid.value = s.id;
  if (editSessionTitle) editSessionTitle.value = s.title || '';
  if (editSessionPrompt) editSessionPrompt.value = s.prompt || '继续';
  if (editSessionCooldown) editSessionCooldown.value = s.cooldown || 3.0;
  if (editSessionMaxTurns) editSessionMaxTurns.value = s.max_turns || 9999;
  if (editSessionTags) editSessionTags.value = (s.tags || []).join(', ');
  if (editSessionPinned) editSessionPinned.checked = !!s.pinned;
  renderMacroBars();
  sessionEditModal.style.display = 'flex';
};

function initSessionEditModal() {
  const closeFn = () => {
    if (sessionEditModal) sessionEditModal.style.display = 'none';
  };
  if (closeSessionEditModalBtn) closeSessionEditModalBtn.addEventListener('click', closeFn);
  if (cancelSessionEditBtn) cancelSessionEditBtn.addEventListener('click', closeFn);
  if (sessionEditModal) {
    sessionEditModal.addEventListener('click', (e) => {
      if (e.target === sessionEditModal) closeFn();
    });
  }
  if (saveSessionEditBtn) {
    saveSessionEditBtn.addEventListener('click', async () => {
      const cid = editSessionCid ? editSessionCid.value : '';
      if (!cid) return;
      saveSessionEditBtn.disabled = true;
      try {
        const res = await safeFetch('/api/sessions/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conv_id: cid,
            title: editSessionTitle ? editSessionTitle.value.trim() : undefined,
            prompt: editSessionPrompt ? (editSessionPrompt.value.trim() || '继续') : '继续',
            cooldown: editSessionCooldown ? (parseFloat(editSessionCooldown.value) || 3.0) : 3.0,
            max_turns: editSessionMaxTurns ? (parseInt(editSessionMaxTurns.value, 10) || 9999) : 9999,
            tags: editSessionTags ? editSessionTags.value : '',
            pinned: editSessionPinned ? editSessionPinned.checked : false
          })
        });
        const data = await res.json();
        if (data.ok) {
          showToast('会话配置已保存更新！', '⚙️');
          closeFn();
          fetchStatus();
        } else {
          showToast('更新会话失败', '⚠️');
        }
      } catch (e) {
        showToast('更新异常: ' + e.message, '✖');
      } finally {
        saveSessionEditBtn.disabled = false;
      }
    });
  }
}

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
let transcriptLiveTimer = null;
let currentTranscriptFilter = 'ALL';
let currentTranscriptSearch = '';

const transcriptLiveCheckbox = document.getElementById('transcriptLiveCheckbox');
const transcriptSearchInput = document.getElementById('transcriptSearchInput');
const transcriptFilterPills = document.getElementById('transcriptFilterPills');

function stopTranscriptLiveTimer() {
  if (transcriptLiveTimer) {
    clearInterval(transcriptLiveTimer);
    transcriptLiveTimer = null;
  }
}

function startTranscriptLiveTimer() {
  stopTranscriptLiveTimer();
  if (transcriptLiveCheckbox && transcriptLiveCheckbox.checked && transcriptModal && transcriptModal.style.display !== 'none') {
    transcriptLiveTimer = setInterval(() => {
      loadTranscriptTimeline(true);
    }, 3000);
  }
}

function closeTranscriptModal() {
  if (transcriptModal) transcriptModal.style.display = 'none';
  stopTranscriptLiveTimer();
}

window.handleCardTranscript = async function(cid, node) {
  currentTranscriptConv = { id: cid, node: node || 'local' };
  const s = appState.sessions.find(item => item.id === cid);
  const title = s ? s.title : cid.slice(0, 8);
  if (transcriptModalTitle) transcriptModalTitle.textContent = `[${title.slice(0, 24)}] 最新执行进展回溯`;
  if (transcriptModal) transcriptModal.style.display = 'flex';
  currentTranscriptSearch = '';
  if (transcriptSearchInput) transcriptSearchInput.value = '';
  await loadTranscriptTimeline();
  startTranscriptLiveTimer();
};

function renderTranscriptCards() {
  if (!transcriptTimeline) return;
  if (!transcriptCache || transcriptCache.length === 0) {
    transcriptTimeline.innerHTML = '<div class="timeline-empty">🌱 暂无步骤记录或转录文件为空</div>';
    return;
  }

  const query = currentTranscriptSearch.trim().toLowerCase();
  const filtered = transcriptCache.filter(st => {
    // 1. Filter by category
    const isUser = st.type === 'USER_INPUT' || st.source === 'USER_EXPLICIT';
    const hasTools = st.tool_calls && st.tool_calls.length > 0;
    if (currentTranscriptFilter === 'USER' && !isUser) return false;
    if (currentTranscriptFilter === 'TOOL' && !hasTools) return false;
    if (currentTranscriptFilter === 'MODEL' && (isUser || hasTools)) return false;

    // 2. Filter by search query
    if (query) {
      const contentMatch = (st.content || '').toLowerCase().includes(query);
      const toolsMatch = (st.tool_calls || []).some(t => t.toLowerCase().includes(query));
      const typeMatch = (st.type || '').toLowerCase().includes(query);
      if (!contentMatch && !toolsMatch && !typeMatch) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    transcriptTimeline.innerHTML = '<div class="timeline-empty">🔍 未找到匹配该条件的步骤事件</div>';
    return;
  }

  transcriptTimeline.innerHTML = '';
  filtered.forEach(st => {
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
}

async function loadTranscriptTimeline(isBackgroundPoll = false) {
  if (!transcriptTimeline || !currentTranscriptConv.id) return;
  if (!isBackgroundPoll) {
    transcriptTimeline.innerHTML = '<div class="timeline-empty">⏳ 正在同步最新会话转录...</div>';
  }
  try {
    const url = `/api/sessions/transcript?conv_id=${encodeURIComponent(currentTranscriptConv.id)}&node=${encodeURIComponent(currentTranscriptConv.node)}&limit=25`;
    const res = await safeFetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    transcriptCache = data.steps || [];
    renderTranscriptCards();

    if (!isBackgroundPoll) {
      transcriptTimeline.parentElement.scrollTop = transcriptTimeline.parentElement.scrollHeight;
    }
  } catch (err) {
    if (!isBackgroundPoll) {
      transcriptTimeline.innerHTML = `<div class="timeline-empty" style="color: #f43f5e;">同步转录失败: ${escapeHtml(err.message)}</div>`;
    }
  }
}

if (transcriptLiveCheckbox) {
  transcriptLiveCheckbox.addEventListener('change', () => {
    if (transcriptLiveCheckbox.checked) {
      startTranscriptLiveTimer();
      showToast('已开启会话转录实时轮询 (3s)', '🟢');
    } else {
      stopTranscriptLiveTimer();
      showToast('已暂停会话转录实时轮询', '⏸️');
    }
  });
}

if (transcriptSearchInput) {
  transcriptSearchInput.addEventListener('input', (e) => {
    currentTranscriptSearch = e.target.value;
    renderTranscriptCards();
  });
}

if (transcriptFilterPills) {
  transcriptFilterPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.tr-pill');
    if (!pill) return;
    transcriptFilterPills.querySelectorAll('.tr-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentTranscriptFilter = pill.getAttribute('data-tr') || 'ALL';
    renderTranscriptCards();
  });
}

if (refreshTranscriptBtn) {
  refreshTranscriptBtn.addEventListener('click', () => {
    showToast('正在刷新步骤进展...', '🔄');
    loadTranscriptTimeline();
  });
}

if (closeTranscriptModalBtn) {
  closeTranscriptModalBtn.addEventListener('click', closeTranscriptModal);
}

if (closeTranscriptFooterBtn) {
  closeTranscriptFooterBtn.addEventListener('click', closeTranscriptModal);
}

if (transcriptModal) {
  transcriptModal.addEventListener('click', (e) => {
    if (e.target === transcriptModal) {
      closeTranscriptModal();
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
// 会话发现雷达 & 下拉列表渲染 (Antigravity Live Sessions)
// ==========================================================================
function filterDiscoveredConversations() {
  const hideEmpty = hideEmptyCheckbox ? hideEmptyCheckbox.checked : true;
  const hideSubagents = hideSubagentsCheckbox ? hideSubagentsCheckbox.checked : true;
  return (conversationsList || []).filter(c => {
    if (hideEmpty && (c.is_empty || c.step_count === 0)) return false;
    if (hideSubagents && c.is_subagent) return false;
    return true;
  });
}

window.quickEnrollSession = async function(cid, enabled = true) {
  const node_type = appState.node_type || 'local';
  const prompt = (promptInput ? promptInput.value.trim() : '') || '继续推进下一项任务';
  const cooldown = (cooldownInput ? parseFloat(cooldownInput.value) : 3.0) || 3.0;
  const max_turns = (maxTurnsInput ? parseInt(maxTurnsInput.value, 10) : 9999) || 9999;
  const found = (conversationsList || []).find(c => c.id === cid);
  const title = found ? (found.title || found.preview) : `会话·${cid.slice(0, 8)}`;

  try {
    const res = await safeFetch('/api/sessions/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conv_id: cid,
        node_type,
        title,
        prompt,
        cooldown,
        max_turns,
        enabled
      })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`已将 [${title.slice(0, 14)}] 加入${enabled ? '自动巡航' : '仅实时监控'}！`, enabled ? '🚀' : '👁️');
      playChime(enabled ? 659.2 : 523.2);
      fetchStatus();
      fetchLogs();
    } else {
      showToast('加入会话失败', '⚠️');
    }
  } catch (e) {
    showToast('请求异常: ' + e.message, '✖');
  }
};

function renderRadarList() {
  if (!radarGrid) return;
  const displayList = filterDiscoveredConversations();
  const totalMain = (conversationsList || []).filter(c => !c.is_subagent).length;
  const subCount = (conversationsList || []).filter(c => c.is_subagent).length;

  if (radarCountBadge) {
    radarCountBadge.innerText = `显示 ${displayList.length} / 主会话 ${totalMain}` + (subCount > 0 ? ` · 含子代理 ${subCount}` : '');
  }

  if (displayList.length === 0) {
    radarGrid.innerHTML = `<div class="radar-empty">🔍 当前过滤条件下未发现 Antigravity 活动会话</div>`;
    return;
  }

  const monitoredById = {};
  (appState.sessions || []).forEach(s => { monitoredById[s.id] = s; });

  radarGrid.innerHTML = '';
  displayList.slice(0, 12).forEach(c => {
    const monitored = monitoredById[c.id];
    const effLive = (monitored && monitored.live_state && monitored.live_state !== 'UNKNOWN') ? monitored.live_state : c.live_state;
    const isBusy = effLive === 'BUSY';
    const isWaiting = effLive === 'WAITING_DECISION';
    const isCompleted = effLive === 'COMPLETED';
    const isEmpty = effLive === 'EMPTY' || c.is_empty || c.step_count === 0;
    const isBgOnly = isBusy && Boolean(c.not_fully_idle && c.db_status === 'CASCADE_RUN_STATUS_IDLE');
    const stateClass = isBusy ? 'busy' : (isWaiting ? 'waiting' : (isCompleted ? 'completed' : (isEmpty ? 'empty' : 'idle')));
    const stateText = isBgOnly ? '⏳ 后台活跃' : (isBusy ? '⚡ 运行中' : (isWaiting ? '❓ 待回答' : (isCompleted ? '🎉 已完工' : (isEmpty ? '🌱 空白' : '🟢 空闲'))));
    const wsShort = c.workspace ? formatWorkspaceShort(c.workspace) : '';
    const displayTitle = c.title || c.preview || c.id.slice(0, 14);
    const safeCidJs = escapeHtml(escapeJsStr(c.id));
    const safeNodeJs = escapeHtml(escapeJsStr(appState.node_type || 'local'));

    let actionBtnsHtml = `
      <button class="btn-card-action" onclick="handleCardTranscript('${safeCidJs}', '${safeNodeJs}')" title="查看实时对话转录与最近步骤">
        📜 进展
      </button>
    `;
    if (monitored) {
      const mLabel = monitored.enabled ? '🟢 巡航中' : '👁️ 监控中';
      const nextEn = !monitored.enabled;
      actionBtnsHtml += `
        <button class="btn-card-action ${monitored.enabled ? '' : 'primary'}" onclick="toggleMonitoredFromRadar('${safeCidJs}', ${nextEn})">
          ${mLabel} (${monitored.enabled ? '切换仅监控' : '开启巡航'})
        </button>
      `;
    } else {
      actionBtnsHtml += `
        <button class="btn-card-action" onclick="quickEnrollSession('${safeCidJs}', false)" title="仅实时监控状态，不自动注入">
          👁️ 仅监控
        </button>
        <button class="btn-card-action primary" onclick="quickEnrollSession('${safeCidJs}', true)" title="加入矩阵并启用自动续写">
          🚀 自动巡航
        </button>
      `;
    }

    const card = document.createElement('div');
    card.className = `radar-card ${isBusy ? 'busy' : ''}`;
    card.innerHTML = `
      <div class="radar-card-top">
        <div class="radar-card-badges">
          <span class="radar-state-pill ${stateClass}">${stateText}</span>
          ${wsShort ? `<span class="workspace-chip" title="${escapeHtml(c.workspace)}">📁 ${escapeHtml(wsShort)}</span>` : ''}
          ${c.is_subagent ? `<span class="session-tag-chip">🤖 ${escapeHtml(c.agent_name || 'subagent')}</span>` : ''}
        </div>
        <span class="conv-id-chip" title="复制完整ID: ${escapeHtml(c.id)}" onclick="copyText('${safeCidJs}')">${escapeHtml(c.id.slice(0, 8))}...</span>
      </div>
      <div class="radar-card-title" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</div>
      <div class="radar-card-meta">
        <span>${monitored && monitored.current_step > c.step_count ? monitored.current_step : c.step_count} 步</span>
        <span>${escapeHtml((c.mtime_str || '').slice(5))}</span>
      </div>
      <div class="radar-card-actions">${actionBtnsHtml}</div>
    `;
    radarGrid.appendChild(card);
  });
}

window.toggleMonitoredFromRadar = async function(cid, enabled) {
  try {
    await safeFetch('/api/sessions/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conv_id: cid, enabled })
    });
    showToast(`会话 ${cid.slice(0, 8)} 已切换为${enabled ? '自动巡航' : '仅监控模式'}`, enabled ? '🚀' : '👁️');
    fetchStatus();
  } catch (e) {
    showToast('切换失败: ' + e.message, '✖');
  }
};

function renderConversationsDropdown() {
  if (!convSelect) return;
  const currentVal = convSelect.value;

  convSelect.innerHTML = '';
  if (conversationsList.length === 0) {
    convSelect.innerHTML = '<option value="">未找到任何对话记录</option>';
    if (convCountHint) convCountHint.innerText = '扫描到 0 个会话';
    return;
  }

  let filtered = filterDiscoveredConversations();

  const searchQuery = convSearchInput ? convSearchInput.value.trim().toLowerCase() : '';
  if (searchQuery) {
    filtered = filtered.filter(c => {
      const idMatch = c.id.toLowerCase().includes(searchQuery);
      const titleMatch = (c.title || '').toLowerCase().includes(searchQuery);
      const prevMatch = (c.preview || '').toLowerCase().includes(searchQuery);
      const wsMatch = (c.workspace || '').toLowerCase().includes(searchQuery);
      return idMatch || titleMatch || prevMatch || wsMatch;
    });
  }

  const displayList = filtered;
  const emptyCount = conversationsList.filter(c => c.is_empty || c.step_count === 0).length;
  const subCount = conversationsList.filter(c => c.is_subagent).length;

  if (convCountHint) {
    if (searchQuery) {
      convCountHint.innerText = `搜索匹配到 ${displayList.length} 个会话 (关键词: "${searchQuery}")`;
    } else {
      convCountHint.innerText = `已显示 ${displayList.length} 个会话 (过滤 ${emptyCount} 空白 / ${subCount} 子代理)`;
    }
  }

  displayList.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    const statusIcon = c.live_state === 'BUSY' ? '⚡ ' : (c.is_empty || c.step_count === 0 ? '🌱 ' : '🟢 ');
    const wsTag = c.workspace ? `[${formatWorkspaceShort(c.workspace)}] ` : '';
    const subTag = c.is_subagent ? `[🤖 ${c.agent_name || 'sub'}] ` : '';
    let titleSnippet = c.title || (c.preview && c.preview !== '(无预览内容)' ? c.preview : c.id.slice(0, 14));
    if (c.is_empty || c.step_count === 0) {
      opt.innerText = `[${c.mtime_str.slice(5)}] ${statusIcon}${wsTag}[新建空白会话] (${c.id.slice(0, 8)}...)`;
    } else {
      opt.innerText = `[${c.mtime_str.slice(5)}] ${statusIcon}${subTag}${wsTag}${titleSnippet} (${c.step_count}步 · ${c.id.slice(0, 8)})`;
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
    const wsText = found.workspace ? `工作区: ${found.workspace} · ` : '';
    const statusLabel = found.live_state === 'BUSY' ? '⚡运行中' : (found.is_empty ? '🌱空白' : '🟢空闲');
    convPreviewSnippet.innerText = `[${statusLabel}] ${wsText}${found.title || found.preview} (${found.step_count} 步 · 更新于 ${found.mtime_str})`;
  } else {
    convPreviewSnippet.innerText = `当前选定 ID: ${selectedId || '(未指定)'}`;
  }
}

// ==========================================================================
// 日志控制台渲染与过滤
// ==========================================================================
function renderLogs(logs) {
  if (!consoleBody) return;
  if (logs) cachedLogs = logs;
  const rawLogs = cachedLogs || [];

  // 1. 过滤日志等级
  let filtered = rawLogs;
  if (currentLogLevel !== 'ALL') {
    filtered = filtered.filter(item => item.level === currentLogLevel);
  }

  // 2. 关键词检索
  const q = currentLogSearch.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(item => {
      const textMatch = (item.text || '').toLowerCase().includes(q);
      const tagMatch = (item.level || '').toLowerCase().includes(q);
      const tsMatch = (item.timestamp || '').includes(q);
      return textMatch || tagMatch || tsMatch;
    });
  }

  consoleBody.innerHTML = '';
  if (filtered.length === 0) {
    consoleBody.innerHTML = `<div class="log-line info"><span class="log-msg" style="color: #64748b;">(无匹配日志记录)</span></div>`;
    return;
  }

  filtered.forEach(item => {
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

function initLogConsoleToolbar() {
  if (logSearchInput) {
    logSearchInput.addEventListener('input', (e) => {
      currentLogSearch = e.target.value;
      if (clearLogSearchBtn) {
        clearLogSearchBtn.style.display = currentLogSearch ? 'block' : 'none';
      }
      renderLogs();
    });
  }

  if (clearLogSearchBtn) {
    clearLogSearchBtn.addEventListener('click', () => {
      if (logSearchInput) logSearchInput.value = '';
      currentLogSearch = '';
      clearLogSearchBtn.style.display = 'none';
      renderLogs();
    });
  }

  logLevelPills.forEach(pill => {
    pill.addEventListener('click', () => {
      logLevelPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentLogLevel = pill.dataset.level || 'ALL';
      renderLogs();
    });
  });
}

// ==========================================================================
// 常用提示词宏管理 (Prompt Macros + LocalStorage)
// ==========================================================================
const DEFAULT_PROMPT_MACROS = [
  { label: '🚀 /goal 全局开发', val: '[/goal](slashCommand;goal) 继续全局开发' },
  { label: '📋 /plan 规划阶段', val: '[/plan](slashCommand;plan) 规划并推进下一阶段' },
  { label: '⚡ 继续推进任务', val: '继续推进下一项任务' },
  { label: '🧪 自测与验证', val: '自测代码并验证效果' },
  { label: '📊 交付总结报告', val: '生成完整交付总结报告' }
];

function getCustomMacros() {
  try {
    const raw = localStorage.getItem('antigravity_custom_macros');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function saveCustomMacro(val) {
  const text = (val || '').trim();
  if (!text) return;
  const list = getCustomMacros();
  if (!list.includes(text)) {
    list.unshift(text);
    localStorage.setItem('antigravity_custom_macros', JSON.stringify(list.slice(0, 12)));
  }
  renderMacroBars();
  showToast(`已保存常用指令: ${text.slice(0, 16)}`, '⭐');
}

function deleteCustomMacro(val) {
  const list = getCustomMacros().filter(x => x !== val);
  localStorage.setItem('antigravity_custom_macros', JSON.stringify(list));
  renderMacroBars();
}

function renderSingleMacroBar(container, targetInput) {
  if (!container || !targetInput) return;
  container.innerHTML = '';
  DEFAULT_PROMPT_MACROS.forEach(m => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'prompt-pill';
    btn.textContent = m.label;
    btn.addEventListener('click', () => {
      targetInput.value = m.val;
      showToast(`已填入预设指令: ${m.val.slice(0, 18)}`, '💬');
    });
    container.appendChild(btn);
  });
  getCustomMacros().forEach(val => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'prompt-pill';
    btn.innerHTML = `⭐ ${escapeHtml(val.slice(0, 16))}`;
    btn.title = val;
    btn.addEventListener('click', () => {
      targetInput.value = val;
      showToast(`已填入常用指令: ${val.slice(0, 18)}`, '⭐');
    });
    const del = document.createElement('span');
    del.className = 'prompt-macro-delete';
    del.textContent = '✕';
    del.title = '删除常用指令';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCustomMacro(val);
    });
    btn.appendChild(del);
    container.appendChild(btn);
  });
}

function renderMacroBars() {
  renderSingleMacroBar(promptMacroBar, promptInput);
  renderSingleMacroBar(editPromptMacroBar, editSessionPrompt);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsStr(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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
      showToast('当前没有开启巡航的会话，请先启用至少一个会话', '⚠️');
      return;
    }
    showToast(`正在向 ${activeSessions.length} 个会话同时发送指令...`, '⚡');
    const results = await Promise.all(activeSessions.map(async (s) => {
      try {
        const res = await safeFetch('/api/sessions/trigger_once', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conv_id: s.id, text: s.prompt })
        }, 15000);
        return await res.json();
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }));
    const okCount = results.filter(r => r && r.ok).length;
    const failCount = results.length - okCount;
    if (failCount === 0) {
      showToast(`已成功向 ${okCount} 个活跃会话发送指令！`, '✨');
    } else {
      showToast(`全矩阵注入: ${okCount} 成功, ${failCount} 失败（详情见卡片与日志）`, '⚠️');
    }
    fetchStatus();
    fetchLogs();
  });
}

// 4. 将选定会话加入监控池 (自动巡航 或 仅监控)
async function enrollSelectedFromForm(enabled = true) {
  const conv_id = convSelect.value;
  if (!conv_id) {
    showToast('请先选择一个有效的会话', '⚠️');
    return;
  }

  const node_type = appState.node_type || 'local';
  const prompt = (promptInput ? promptInput.value.trim() : '') || '继续推进下一项任务';
  const cooldown = (cooldownInput ? parseFloat(cooldownInput.value) : 3.0) || 3.0;
  const max_turns = (maxTurnsInput ? parseInt(maxTurnsInput.value, 10) : 9999) || 9999;
  const tags = enrollTagsInput ? enrollTagsInput.value.trim() : '';

  const found = conversationsList.find(c => c.id === conv_id);
  const title = found ? (found.title || found.preview) : `会话·${conv_id.slice(0, 8)}`;

  try {
    if (addSessionToFleetBtn) addSessionToFleetBtn.disabled = true;
    if (addMonitorOnlyBtn) addMonitorOnlyBtn.disabled = true;
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
        enabled,
        tags
      })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`已纳管会话 [${title.slice(0, 14)}] (${enabled ? '自动巡航' : '仅实时监控'})！`, enabled ? '🚀' : '👁️');
      playChime(enabled ? 659.2 : 523.2);
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
    if (addSessionToFleetBtn) addSessionToFleetBtn.disabled = false;
    if (addMonitorOnlyBtn) addMonitorOnlyBtn.disabled = false;
  }
}

if (addSessionToFleetBtn) {
  addSessionToFleetBtn.addEventListener('click', () => enrollSelectedFromForm(true));
}
if (addMonitorOnlyBtn) {
  addMonitorOnlyBtn.addEventListener('click', () => enrollSelectedFromForm(false));
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
      currentNodeBadge.innerText = nodeType.startsWith('ssh:') ? `☁️ 远程节点: ${nodeType.slice(4)}` : '🖥️ 本地环境 (Local)';
    }
    if (nodeType === 'local') {
      nodeBtnLocal.classList.add('active');
      nodeBtnWestc.classList.remove('active');
    } else {
      nodeBtnLocal.classList.remove('active');
      nodeBtnWestc.classList.add('active');
    }
    showToast(`视图已切换至: ${nodeType}`, '🌐');
    fetchConversations(true);
  });
}

if (nodeBtnLocal) nodeBtnLocal.addEventListener('click', () => selectNode('local'));
if (nodeBtnWestc) nodeBtnWestc.addEventListener('click', () => selectNode('ssh:seetacloud-westc'));

if (saveCustomPromptBtn) {
  saveCustomPromptBtn.addEventListener('click', () => saveCustomMacro(promptInput ? promptInput.value : ''));
}
if (saveEditPromptMacroBtn) {
  saveEditPromptMacroBtn.addEventListener('click', () => saveCustomMacro(editSessionPrompt ? editSessionPrompt.value : ''));
}

if (convSelect) {
  convSelect.addEventListener('change', updateSelectedConvPreview);
}

if (convSearchInput) {
  convSearchInput.addEventListener('input', renderConversationsDropdown);
}

if (refreshConvsBtn) {
  refreshConvsBtn.addEventListener('click', async () => {
    refreshConvsBtn.innerText = '⏳ 扫描中...';
    await fetchConversations(true);
    refreshConvsBtn.innerText = '🔄 刷新会话列表';
    showToast('会话列表已刷新', '🔄');
  });
}

if (refreshRadarBtn) {
  refreshRadarBtn.addEventListener('click', async () => {
    refreshRadarBtn.innerText = '⏳ 扫描中...';
    await fetchConversations(true);
    refreshRadarBtn.innerText = '🔄 立即扫描';
    showToast('Antigravity 会话雷达已刷新', '📡');
  });
}

if (hideEmptyCheckbox) {
  hideEmptyCheckbox.addEventListener('change', () => {
    renderConversationsDropdown();
    renderRadarList();
  });
}
if (hideSubagentsCheckbox) {
  hideSubagentsCheckbox.addEventListener('change', () => {
    renderConversationsDropdown();
    renderRadarList();
  });
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
  quickTestLspBtn.addEventListener('click', async () => {
    showToast('正在主动探测 Antigravity Language Server 与索引数据库...', '🔍');
    try {
      const res = await safeFetch('/api/lsp/probe', {}, 6000);
      const data = await res.json();
      if (data.ok) {
        showToast(`LSP 握手正常 (${data.addr} · ${data.latency_ms}ms) · 索引DB: ${data.db_exists ? '就绪' : '无'}`, '✅');
      } else {
        showToast(`LSP 探测异常: ${data.error || '未发现活跃服务'}`, '⚠️');
      }
      fetchStatus();
    } catch (e) {
      showToast('LSP 探测请求失败: ' + e.message, '✖');
    }
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
  initLogConsoleToolbar();
  initBackupRestoreModal();
  initNotifications();
  initStrategyModal();
  initReportModal();
  initSessionEditModal();
  renderMacroBars();
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

  // 4 秒自动刷新一次会话实时雷达列表，15 秒刷新一次 Webhook 状态
  setInterval(() => {
    if (isPollingActive) {
      fetchConversations();
    }
  }, 4000);

  setInterval(() => {
    if (isPollingActive) {
      updateWebhookBadge();
    }
  }, 15000);
}

document.addEventListener('DOMContentLoaded', initApp);
