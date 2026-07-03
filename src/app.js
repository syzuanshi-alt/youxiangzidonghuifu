import { classifyMail, validateSamples } from './rules.js';
import {
  RISK_OVERRIDE_OPTIONS,
  applyRiskOverrideToMail,
} from './riskOverrides.js?v=fullscreen-settings';
import {
  buildAutoProcessingSwitchReminder,
  findAutoProcessingSwitchFailure,
  isAutoProcessingSwitchFailure,
} from './autoProcessingReminder.js';
import {
  buildMailContentView,
  detectCustomerLanguage,
} from './emailTranslation.js';
import {
  detectMailArrivalSoundEffects,
  normalizeSoundSettings,
  playWorkbenchSound,
  soundEffectsForActionResult,
  soundEffectsForClosedLoopPayload,
} from './soundEffects.js';
import {
  REVIEW_OPTIONS,
  exportReviewItems,
  upsertReview,
} from './reviewStore.js';
import { evaluateSendGuard, summarizeSendGuards } from './sendGuard.js';
import {
  buildSendContextFromFeishuMessages,
} from './feishuAdapter.js';
import {
  buildDraftRecord,
  buildSendQueueItem,
  summarizeDraftWorkflow,
} from './draftWorkflow.js';
import {
  buildApiReadiness,
} from './apiConfig.js';
import { buildLaunchChecklist } from './launchChecklist.js';
import {
  buildAgentRuntimeContext,
  normalizeAgentConfig,
} from './agentConfig.js';
import {
  mapEmailAIResultToWorkbenchMail,
} from './lib/email-ai-control/workbench-mapper.js';
import {
  alignReplyCandidateLanguage,
} from './replyTemplates.js';
import {
  getMailRiskState,
  normalizeMailRiskSnapshot,
  shouldReplaceStableRiskSnapshot,
} from './riskState.js';
import {
  chooseProcessingStatus,
} from './processingStatus.js';
import {
  buildQueueNavigationItems,
  buildWorkbenchFilterMetrics,
  findFirstWorkbenchMailId,
  filterWorkbenchMails,
  getWorkbenchProcessingStatus,
  normalizeWorkbenchFilter,
} from './workbenchFilters.js';
import {
  applyManualArchiveSelectionToMail,
  buildManualArchiveCompletionResult,
  confirmManualArchiveSelection,
  upsertManualArchiveSelection,
} from './manualArchive.js';
import {
  SETTINGS_COMMANDS,
  findSettingsCommand,
  findSettingsPrimary,
} from './settingsSections.js?v=white-side-dashboard-nav';
import {
  mountEmailAIControl,
} from './emailAiControlApp.js?v=admin-password';
import {
  readJsonPayload,
} from './httpResponse.js';

const actionText = {
  auto_reply: '可以自动回复',
  draft_only: '只能生成草稿',
  blocked: '禁止自动回复',
  ignore: '垃圾邮件',
};

const riskText = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  spam: '垃圾邮件',
};

const sendModeText = {
  ready: '允许发送',
  simulation_only: '发送未开放',
  needs_review: '待人工审核',
  blocked: '发送拦截',
  ignored: '建议移箱',
  duplicate: '重复拦截',
  thread_mismatch: '线程错配',
};

const draftStatusText = {
  draft_saved: '草稿已生成',
  waiting_review: '待人工审核',
  review_approved: '审核已通过',
  blocked: '不生成草稿',
  ignored: '不生成草稿',
};

const queueStatusText = {
  simulation_queued: '可进入草稿队列',
  waiting_review: '等待人工审核',
  blocked: '不进入队列',
  ignored: '建议归档/移箱',
  send_guard_blocked: '发送前拦截',
};

const nextStepText = {
  auto_reply: '低风险邮件，可使用候选回复；自动处理开关、原始来信人校验和限额满足后可自动发送。',
  draft_only: '中风险邮件，只生成草稿，人工确认后再发送。',
  blocked: '高风险或禁止场景，必须人工审批后才能发送人工确认内容。',
  ignore: '白色垃圾/骚扰邮件，不回复；自动归档开关满足后可移箱。',
};

const loopOperationText = {
  auto_send: '低风险自动回复',
  auto_archive: '垃圾邮件归档',
  manual_send_after_approval: '审批后发送',
  pending_review: '等待人工审核',
  auto_send_disabled: '自动发送未开启',
  auto_archive_disabled: '自动归档未开启',
  manual_send_blocked: '人工发送受阻',
  no_action: '无动作',
};

const loopStatusText = {
  ready: '待执行',
  sent: '已发送',
  archived: '已归档',
  pending: '待审批',
  blocked: '已阻断',
  skipped: '已跳过',
  failed: '失败',
};

const processingStatusText = {
  pending: '待处理',
  urgent: '需紧急处理',
  completed: '已完成',
};

const FEISHU_WORKBENCH_PAGE_SIZE = 20;
const FEISHU_WORKBENCH_POLL_INTERVAL_MS = 60_000;
const WORKBENCH_METRIC_ORDER = ['urgent', 'pending', 'completed', 'spam', 'all'];
const WORKBENCH_REMEMBERED_PHONE_KEY = 'email-auto-reply-workbench-remembered-phone';
const WORKBENCH_RISK_SNAPSHOTS_KEY = 'feishu-mail-risk-snapshots';
const EMAIL_AI_SYSTEM_TABS = ['models', 'skills', 'versions', 'test'];
const EMAIL_AI_RULE_TABS = ['risk', 'spam', 'knowledge', 'prompts', 'safety'];
const EMAIL_AI_RULE_BUTTONS = [
  {
    key: 'risk',
    label: '风险判定规则',
    description: '调整当前业务场景的低中高风险判断。',
  },
  {
    key: 'spam',
    label: '垃圾邮件规则',
    description: '维护广告、骚扰和无效邮件识别规则。',
  },
  {
    key: 'knowledge',
    label: '回复话术知识库',
    description: '新增或修改标准回复话术和业务知识。',
  },
  {
    key: 'prompts',
    label: '提示词配置',
    description: '维护风险判定、回复生成和输出格式提示词。',
  },
  {
    key: 'safety',
    label: '输出安全规则',
    description: '限制退款、赔偿、补发等敏感承诺输出。',
  },
];
const SYSTEM_RULE_SETTINGS_KEY = 'system-rules';
const SYSTEM_RULE_SETTING_COMMAND_PREFIX = 'system-rule-';
const SYSTEM_RULE_SETTINGS_ITEM = {
  key: SYSTEM_RULE_SETTINGS_KEY,
  label: '系统规则',
  summary: '维护风险、垃圾、话术、提示词和输出安全规则。',
  commandKeys: [
    SYSTEM_RULE_SETTINGS_KEY,
    ...EMAIL_AI_RULE_BUTTONS.map((item) => `${SYSTEM_RULE_SETTING_COMMAND_PREFIX}${item.key}`),
  ],
  children: EMAIL_AI_RULE_BUTTONS.map((item) => ({
    key: `${SYSTEM_RULE_SETTING_COMMAND_PREFIX}${item.key}`,
    ruleKey: item.key,
    label: item.label,
    summary: item.description,
  })),
};

function apiUrl(path) {
  if (window.location.port === '5174') {
    return `http://127.0.0.1:5175${path}`;
  }

  return path;
}

async function processMailWithEmailAI(mail) {
  const response = await fetch(apiUrl('/api/email-ai/process'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      emailId: mail.id || mail.messageId,
      senderEmail: mail.sender || mail.from?.email || '',
      subject: mail.subject || '',
      body: mail.bodyText || mail.summary || '',
      bodyText: mail.bodyText || '',
      summary: mail.summary || '',
      orderInfo: mail.orderInfo || {},
      customerHistory: mail.customerHistory || {},
      source: 'email_auto_reply_workbench',
    }),
  });

  if (!response.ok) {
    throw new Error('邮件 AI 控制中心处理接口不可用。');
  }

  return response.json();
}

async function processMailsWithEmailAI(rawMails) {
  try {
    return await Promise.all(rawMails.map(async (mail) => ({
      ...mail,
      aiResult: await processMailWithEmailAI(mail),
    })));
  } catch (error) {
    apiState = {
      ...apiState,
      note: `${apiState.note || ''} AI 控制中心暂不可用，已使用本地规则兜底。`,
    };
    return rawMails;
  }
}

const apiConfigDraft = {
  appId: 'cli_test_feishu_app',
  mailboxAddress: 'service@example.test',
  callbackUrl: 'https://example.test/feishu/mail/callback',
  environment: 'sandbox',
};

const apiPermissions = {
  mailRead: true,
  mailDraft: true,
  mailSend: false,
  mailboxManage: false,
};

const testStatus = {
  rulesPassed: true,
  syntaxPassed: true,
};

const defaultLoopControls = {
  autoProcessEnabled: false,
  autoSendLowRiskEnabled: false,
  autoArchiveSpamEnabled: false,
  mediumApprovedSendEnabled: false,
  highRiskApprovedSendEnabled: false,
};

const defaultSoundSettings = {
  enabled: false,
};

const defaultKnowledgeItems = [
  {
    id: 'KB-GENERAL-PRICE',
    title: '基础价格咨询',
    keywords: '价格,报价,多少钱,price',
    content: 'Hello, we have received your inquiry. To help us provide more accurate information, please share the product style, material, size, or budget range you are interested in.',
    contentZh: '您好，已收到您的咨询。为便于准确报价，请补充产品款式、材质、尺寸或预算范围，我们会进一步协助确认。',
    enabled: true,
  },
  {
    id: 'KB-SIZE-MATERIAL',
    title: '尺码与材质咨询',
    keywords: '尺码,材质,size,material',
    content: 'Hello, we have received your size or material inquiry. Please share the target style, size, or material preference, and our support team will continue checking the details.',
    contentZh: '您好，已收到您的尺码/材质咨询。请补充目标款式、尺码或材质偏好，客服会继续协助核对。',
    enabled: true,
  },
];

let feishuMessages = [];
let mails = [];
let selectedId = '';
let reviews = loadReviews();
let candidateSelections = loadCandidateSelections();
let agentConfig = loadAgentConfig();
let writeActionResults = loadWriteActionResults();
let closedLoopResult = loadClosedLoopResult();
let loopControls = loadLoopControls();
let soundSettings = loadSoundSettings();
let riskOverrides = loadRiskOverrides();
let riskSnapshots = loadRiskSnapshots();
let manualArchiveSelections = loadManualArchiveSelections();
let knowledgeItems = loadKnowledgeItems();
let activeFilter = 'all';
let mailboxSearchQuery = '';
let mailboxContactPanelOpen = false;
let mailboxListPanelOpen = false;
let mailboxOpenSections = {
  urgent: true,
  inbox: true,
  favorite: false,
  sent: false,
  archived: false,
  deleted: false,
  spam: false,
};
let overviewOpen = true;
let loginMode = 'login';
let loginStatus = '';
let loginError = '';
let loginDraftPhone = localStorage.getItem(WORKBENCH_REMEMBERED_PHONE_KEY) || '';
let captchaConfig = {
  required: false,
  provider: 'disabled',
  siteKey: '',
};
let authChecking = true;
let turnstileScriptLoading = false;
let currentWorkbenchUser = null;
let workbenchStarted = false;
let feishuPollTimer = null;
let settingsOpen = false;
let activeSettingsPrimary = SETTINGS_COMMANDS[0]?.key || 'loop-control';
let activeSettingsCommand = SETTINGS_COMMANDS[0]?.key || 'loop-control';
let expandedSettingsPrimary = '';
let emailAIAdminVerified = false;
let emailAIAdminChecking = false;
let emailAIAdminStatus = '';
let emailAIAdminControl = null;
let emailAIAdminMountedTab = '';
let emailRuleControlOpen = false;
let activeEmailRuleTab = 'risk';
let activeEmailRuleMail = null;
let emailRuleControl = null;
let emailRuleMountedTab = '';
let isLoadingFeishuApiMessages = false;
let mailSoundBaselineReady = false;
let knownMailSoundIds = new Set();
let workbenchAudioContext = null;
const alertedHighRiskIds = new Set();

const loginGateEl = document.querySelector('[data-login-gate]');
const loginCardEl = document.querySelector('[data-login-card]');
const workbenchUserEl = document.querySelector('[data-workbench-user]');
const accountSessionEl = document.querySelector('[data-account-session]');
const mailboxNavEl = document.querySelector('[data-mailbox-nav]');
const listEl = document.querySelector('[data-mail-list]');
const mailboxInlineListEls = Array.from(document.querySelectorAll('[data-mailbox-inline-list]'));
const detailEl = document.querySelector('[data-mail-detail]');
const summaryEl = document.querySelector('[data-summary]');
const overviewEl = document.querySelector('[data-overview-dashboard]');
const overviewContentEl = document.querySelector('[data-overview-content]');
const queueEl = document.querySelector('[data-send-queue]');
const mailboxSwitcherEl = document.querySelector('[data-mailbox-switcher]');
const emailAIStatusEl = document.querySelector('[data-email-ai-status]');
const emailAIAdminAuthEl = document.querySelector('[data-email-ai-admin-auth]');
const emailAIAdminTitleEl = document.querySelector('[data-email-ai-admin-title]');
const emailAISettingsControlEl = document.querySelector('[data-email-ai-settings-control]');
const emailRuleControlPanelEl = document.querySelector('[data-email-rule-control-panel]');
const emailRuleControlBackdropEl = document.querySelector('[data-email-rule-control-backdrop]');
const emailRuleControlRootEl = document.querySelector('[data-email-rule-control-root]');
const emailRuleControlTitleEl = document.querySelector('[data-email-rule-control-title]');
const emailRuleControlContextEl = document.querySelector('[data-email-rule-control-context]');
const returnSystemRulesButtonEl = document.querySelector('[data-return-system-rules]');
const apiModeEl = document.querySelector('[data-api-mode]');
const loopControlEl = document.querySelector('[data-loop-control]');
const settingsPanelEl = document.querySelector('[data-settings-panel]');
const settingsBackdropEl = document.querySelector('[data-settings-backdrop]');
const settingsPrimaryNavEl = document.querySelector('[data-settings-primary-nav]');
const settingsEmptyEl = document.querySelector('[data-settings-empty]');

const defaultApiState = {
  apiProxyAvailable: false,
  configured: false,
  messagesLoaded: false,
  sourceStatus: 'API 待接入',
  statusText: '飞书 API 代理未连接',
  note: '请启动本地飞书 API 代理后查看真实邮箱。',
  missing: [],
  fetchedCount: 0,
  realSendEnabled: false,
  appIdMasked: '',
  mailboxAddress: '',
  botReportEmail: '',
  write: {
    writeEnabled: false,
    sendEnabled: false,
    archiveEnabled: false,
    highRiskSendEnabled: false,
    realSendEnabled: false,
    realArchiveEnabled: false,
    autoProcessEnabled: false,
    autoSendLowRiskEnabled: false,
    autoArchiveSpamEnabled: false,
    customerReplyOriginalSenderEnabled: false,
    unknownCustomerAutoReplyEnabled: false,
    customerReplyPolicy: 'allowlist_only',
    allowlistCount: 0,
    dailySendLimit: 0,
    dailyArchiveLimit: 0,
    hardDeleteEnabled: false,
  },
};

let apiState = { ...defaultApiState };
let emailAIStatus = {
  loading: true,
  ok: false,
  configVersionId: '',
  versionName: '',
  status: '',
  publishedAt: null,
  model: {},
  strategyConfig: {},
  providers: [],
  error: '',
};

function loadReviews() {
  try {
    return JSON.parse(localStorage.getItem('feishu-mail-rule-reviews') || '{}');
  } catch {
    return {};
  }
}

function saveReviews() {
  localStorage.setItem('feishu-mail-rule-reviews', JSON.stringify(reviews));
}

function loadCandidateSelections() {
  try {
    return JSON.parse(localStorage.getItem('feishu-mail-candidate-selections') || '{}');
  } catch {
    return {};
  }
}

function saveCandidateSelections() {
  localStorage.setItem('feishu-mail-candidate-selections', JSON.stringify(candidateSelections));
}

function loadAgentConfig() {
  try {
    return normalizeAgentConfig(JSON.parse(localStorage.getItem('feishu-mail-agent-config') || '{}'));
  } catch {
    return normalizeAgentConfig();
  }
}

function saveAgentConfig() {
  localStorage.setItem('feishu-mail-agent-config', JSON.stringify(agentConfig));
}

function loadWriteActionResults() {
  try {
    return JSON.parse(localStorage.getItem('feishu-mail-write-action-results') || '{}');
  } catch {
    return {};
  }
}

function saveWriteActionResults() {
  localStorage.setItem('feishu-mail-write-action-results', JSON.stringify(writeActionResults));
}

function loadClosedLoopResult() {
  try {
    return JSON.parse(localStorage.getItem('feishu-mail-closed-loop-result') || 'null');
  } catch {
    return null;
  }
}

function saveClosedLoopResult() {
  localStorage.setItem('feishu-mail-closed-loop-result', JSON.stringify(closedLoopResult));
}

function loadLoopControls() {
  try {
    const saved = JSON.parse(localStorage.getItem('feishu-mail-loop-controls') || '{}');
    const legacyApprovedSendEnabled = saved.approvedSendEnabled === true;
    return {
      ...defaultLoopControls,
      ...saved,
      mediumApprovedSendEnabled: saved.mediumApprovedSendEnabled ?? legacyApprovedSendEnabled,
      highRiskApprovedSendEnabled: saved.highRiskApprovedSendEnabled ?? legacyApprovedSendEnabled,
    };
  } catch {
    return { ...defaultLoopControls };
  }
}

function saveLoopControls() {
  localStorage.setItem('feishu-mail-loop-controls', JSON.stringify(loopControls));
}

function loadSoundSettings() {
  try {
    return normalizeSoundSettings(JSON.parse(localStorage.getItem('feishu-mail-sound-settings') || '{}'));
  } catch {
    return { ...defaultSoundSettings };
  }
}

function saveSoundSettings() {
  localStorage.setItem('feishu-mail-sound-settings', JSON.stringify(soundSettings));
}

function loadRiskOverrides() {
  try {
    return JSON.parse(localStorage.getItem('feishu-mail-risk-overrides') || '{}');
  } catch {
    return {};
  }
}

function saveRiskOverrides() {
  localStorage.setItem('feishu-mail-risk-overrides', JSON.stringify(riskOverrides));
}

function loadRiskSnapshots() {
  try {
    const snapshots = JSON.parse(localStorage.getItem(WORKBENCH_RISK_SNAPSHOTS_KEY) || '{}');
    return snapshots && typeof snapshots === 'object' ? snapshots : {};
  } catch {
    return {};
  }
}

function saveRiskSnapshots() {
  localStorage.setItem(WORKBENCH_RISK_SNAPSHOTS_KEY, JSON.stringify(riskSnapshots));
}

function loadManualArchiveSelections() {
  try {
    return JSON.parse(localStorage.getItem('feishu-mail-manual-archive-selections') || '{}');
  } catch {
    return {};
  }
}

function saveManualArchiveSelections() {
  localStorage.setItem('feishu-mail-manual-archive-selections', JSON.stringify(manualArchiveSelections));
}

function loadKnowledgeItems() {
  try {
    return JSON.parse(localStorage.getItem('feishu-mail-knowledge-items') || JSON.stringify(defaultKnowledgeItems));
  } catch {
    return [...defaultKnowledgeItems];
  }
}

function saveKnowledgeItems() {
  localStorage.setItem('feishu-mail-knowledge-items', JSON.stringify(knowledgeItems));
}

function normalizePhone(value = '') {
  return String(value || '').trim().replace(/[^\d+]/g, '');
}

function isValidPhone(phone = '') {
  return /^\+?\d{6,20}$/.test(phone);
}

function maskPhone(phone = '') {
  const normalized = normalizePhone(phone);
  if (normalized.length <= 7) return normalized;
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function saveRememberedPhone(phone, rememberAccount) {
  if (rememberAccount) {
    localStorage.setItem(WORKBENCH_REMEMBERED_PHONE_KEY, normalizePhone(phone));
  } else {
    localStorage.removeItem(WORKBENCH_REMEMBERED_PHONE_KEY);
  }
}

function clearWorkbenchUser() {
  currentWorkbenchUser = null;
}

function setWorkbenchUser(user = {}) {
  currentWorkbenchUser = {
    phone: user.phone || '',
    loginAt: user.lastLoginAt || user.loginAt || new Date().toISOString(),
  };
}

async function fetchWorkbenchAuthJson(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await readJsonPayload(response, '工作台登录接口请求失败。');
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || payload.error || '工作台登录失败。');
  }
  return payload;
}

async function loadWorkbenchCaptchaConfig() {
  try {
    const payload = await fetchWorkbenchAuthJson('/api/workbench-auth/captcha/config', {
      cache: 'no-store',
    });
    captchaConfig = {
      required: payload.required === true,
      provider: payload.provider || 'disabled',
      siteKey: payload.siteKey || '',
    };
  } catch {
    captchaConfig = {
      required: false,
      provider: 'disabled',
      siteKey: '',
    };
  }
}

function mountWorkbenchCaptcha() {
  if (!captchaConfig.required || captchaConfig.provider !== 'turnstile' || !captchaConfig.siteKey) return;
  const widget = loginCardEl?.querySelector('[data-turnstile-widget]');
  const tokenInput = loginCardEl?.querySelector('input[name="captchaToken"]');
  if (!widget || !tokenInput || widget.dataset.rendered === 'true') return;

  const renderWidget = () => {
    if (!window.turnstile || widget.dataset.rendered === 'true') return;
    widget.dataset.rendered = 'true';
    window.turnstile.render(widget, {
      sitekey: captchaConfig.siteKey,
      callback: (token) => {
        tokenInput.value = token || '';
      },
      'expired-callback': () => {
        tokenInput.value = '';
      },
      'error-callback': () => {
        tokenInput.value = '';
      },
    });
  };

  if (window.turnstile) {
    renderWidget();
    return;
  }

  if (!turnstileScriptLoading) {
    turnstileScriptLoading = true;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = renderWidget;
    document.head.append(script);
  }
}

function renderLoginGate() {
  if (!loginGateEl || !loginCardEl) return;

  const loggedIn = Boolean(currentWorkbenchUser);
  loginGateEl.classList.toggle('open', !loggedIn);
  loginGateEl.setAttribute('aria-hidden', loggedIn ? 'true' : 'false');
  document.body.classList.toggle('login-mode', !loggedIn);

  if (workbenchUserEl) {
    workbenchUserEl.textContent = loggedIn ? `已登录：${maskPhone(currentWorkbenchUser.phone)}` : '';
  }

  if (loggedIn) return;

  const isCreate = loginMode === 'create';
  const rememberedPhone = localStorage.getItem(WORKBENCH_REMEMBERED_PHONE_KEY) || '';
  const captchaBlock = captchaConfig.required
    ? `
      <section class="login-human-check" data-workbench-captcha>
        <strong>真人验证</strong>
        <span>${captchaConfig.provider === 'turnstile' ? '请完成 Cloudflare Turnstile 验证后继续。' : '请完成真人验证后继续。'}</span>
        <div class="turnstile-widget" data-turnstile-widget></div>
        <input name="captchaToken" type="hidden" autocomplete="off" />
      </section>
    `
    : '';

  loginCardEl.innerHTML = `
    <div class="login-heading">
      <span>邮件自动回复工作台</span>
      <h1>${isCreate ? '创建工作台账号' : '登录工作台'}</h1>
      <p>使用手机号和密码登录。密码由浏览器密码管理器保存，工作台不会明文保存。</p>
    </div>

    <div class="login-mode-tabs">
      <button type="button" class="${loginMode === 'login' ? 'active' : ''}" data-login-mode="login">登录账号</button>
      <button type="button" class="${loginMode === 'create' ? 'active' : ''}" data-login-mode="create">创建账号</button>
    </div>

    <form class="login-form" data-workbench-login-form>
      <label>
        <span>手机号</span>
        <input name="phone" inputmode="tel" autocomplete="username tel" value="${escapeHtml(loginDraftPhone || rememberedPhone)}" placeholder="请输入手机号" />
      </label>

      <label>
        <span>密码${isCreate ? '（至少 8 位）' : ''}</span>
        <input name="password" type="password" autocomplete="${isCreate ? 'new-password' : 'current-password'}" placeholder="${isCreate ? '设置登录密码' : '请输入密码'}" />
      </label>

      ${isCreate ? `
        <label>
          <span>开户注册码</span>
          <input name="inviteCode" autocomplete="off" placeholder="请输入管理员提供的邀请码" />
        </label>
      ` : ''}

      ${captchaBlock}

      <label class="inline-check login-check">
        <input name="rememberAccount" type="checkbox" ${rememberedPhone ? 'checked' : ''} />
        <span>记住账号</span>
      </label>

      <label class="inline-check login-check">
        <input name="rememberLogin" type="checkbox" />
        <span>保持登录状态</span>
      </label>

      ${loginError ? `<div class="login-message error">${displayText(loginError)}</div>` : ''}
      ${loginStatus ? `<div class="login-message">${displayText(loginStatus)}</div>` : ''}

      <button class="primary-button login-submit" type="submit">${authChecking ? '验证中' : isCreate ? '创建并进入工作台' : '登录工作台'}</button>
    </form>
  `;

  loginCardEl.querySelectorAll('[data-login-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      loginMode = button.dataset.loginMode;
      loginStatus = '';
      loginError = '';
      renderLoginGate();
    });
  });

  loginCardEl.querySelector('[data-workbench-login-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const phone = normalizePhone(formData.get('phone'));
    const password = String(formData.get('password') || '');
    const rememberAccount = Boolean(formData.get('rememberAccount'));
    loginDraftPhone = phone;

    if (!isValidPhone(phone)) {
      loginError = '请输入有效手机号。';
      loginStatus = '';
      renderLoginGate();
      return;
    }

    if (password.length < (isCreate ? 8 : 1)) {
      loginError = isCreate ? '密码至少需要 8 位。' : '请输入密码。';
      loginStatus = '';
      renderLoginGate();
      return;
    }

    authChecking = true;
    loginError = '';
    loginStatus = isCreate ? '正在创建账号...' : '正在登录...';
    renderLoginGate();

    try {
      const payload = await fetchWorkbenchAuthJson(
        isCreate ? '/api/workbench-auth/register' : '/api/workbench-auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            phone,
            password,
            inviteCode: String(formData.get('inviteCode') || '').trim(),
            captchaToken: String(formData.get('captchaToken') || '').trim(),
            rememberLogin: Boolean(formData.get('rememberLogin')),
          }),
        },
      );
      saveRememberedPhone(phone, rememberAccount);
      setWorkbenchUser(payload.user || { phone });
      loginStatus = '';
      loginError = '';
      renderLoginGate();
      startWorkbench();
    } catch (error) {
      loginError = error.message;
      loginStatus = '';
      renderLoginGate();
    } finally {
      authChecking = false;
      if (!currentWorkbenchUser) renderLoginGate();
    }
  });

  mountWorkbenchCaptcha();
}

async function initializeWorkbenchAuth() {
  authChecking = true;
  renderLoginGate();
  await loadWorkbenchCaptchaConfig();

  try {
    const payload = await fetchWorkbenchAuthJson('/api/workbench-auth/me', {
      cache: 'no-store',
    });
    setWorkbenchUser(payload.user || {});
  } catch {
    clearWorkbenchUser();
    loginStatus = '';
    loginError = '';
  } finally {
    authChecking = false;
    renderLoginGate();
    if (currentWorkbenchUser) {
      startWorkbench();
    }
  }
}

function renderAccountSession() {
  if (!accountSessionEl) return;

  const userLabel = currentWorkbenchUser?.phone
    ? maskPhone(currentWorkbenchUser.phone)
    : '未登录';
  const loginAt = currentWorkbenchUser?.loginAt
    ? new Date(currentWorkbenchUser.loginAt).toLocaleString('zh-CN')
    : '暂无登录记录';

  accountSessionEl.innerHTML = `
    <div class="account-session-card">
      <div>
        <span>当前账号</span>
        <strong>${displayText(userLabel)}</strong>
        <small>登录时间：${displayText(loginAt)}</small>
      </div>
      <div class="account-session-actions">
        <button class="secondary-button" type="button" data-switch-workbench-account>切换账号</button>
        <button class="secondary-button" type="button" data-settings-logout-workbench>退出登录</button>
      </div>
    </div>
  `;

  accountSessionEl.querySelector('[data-switch-workbench-account]')?.addEventListener('click', () => {
    logoutWorkbench();
  });

  accountSessionEl.querySelector('[data-settings-logout-workbench]')?.addEventListener('click', () => {
    logoutWorkbench();
  });
}

async function logoutWorkbench() {
  await fetch(apiUrl('/api/workbench-auth/logout'), {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {});
  clearWorkbenchUser();
  settingsOpen = false;
  emailRuleControlOpen = false;
  overviewOpen = true;
  if (feishuPollTimer) {
    clearInterval(feishuPollTimer);
    feishuPollTimer = null;
  }
  workbenchStarted = false;
  renderLoginGate();
  renderSettingsShell();
  renderEmailRuleControlPanel();
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function displayText(value, fallback = '暂无内容。') {
  return escapeHtml(value || fallback);
}

function emailAIAdminToken() {
  return localStorage.getItem('email-ai-admin-token') || '';
}

function emailAIAdminSessionActive() {
  return sessionStorage.getItem('email-ai-admin-password-verified') === 'true';
}

function setEmailAIAdminSessionActive(active) {
  if (active) {
    sessionStorage.setItem('email-ai-admin-password-verified', 'true');
  } else {
    sessionStorage.removeItem('email-ai-admin-password-verified');
  }
}

function emailAIControlTabLabel(tabKey) {
  return {
    models: '模型接入',
    skills: 'Skills 编排',
    versions: '策略与版本发布',
    test: '本地测试',
    risk: '风险判定规则',
    spam: '垃圾邮件规则',
    knowledge: '回复话术知识库',
    prompts: '提示词配置',
    safety: '输出安全规则',
  }[tabKey] || 'AI 管理配置';
}

function visibleSettingsCommands() {
  return SETTINGS_COMMANDS.filter((command) => !command.adminOnly || emailAIAdminVerified);
}

function visibleSettingsPrimaryItems() {
  const visibleCommands = visibleSettingsCommands();
  const primaryItems = SETTINGS_COMMANDS
    .filter((command) => !command.adminOnly)
    .map((command) => {
      const commandKeys = command.key === 'email-ai-admin-auth'
        ? ['email-ai-admin-auth', ...visibleCommands.filter((item) => item.adminOnly).map((item) => item.key)]
        : [command.key];
      return {
        ...command,
        commandKeys,
        children: commandKeys
          .slice(1)
          .map((commandKey) => visibleCommands.find((item) => item.key === commandKey))
          .filter(Boolean),
      };
    });
  const adminPrimaryItem = primaryItems.find((item) => item.key === 'email-ai-admin-auth');
  const regularPrimaryItems = primaryItems.filter((item) => item.key !== 'email-ai-admin-auth');
  const insertIndex = regularPrimaryItems.findIndex((item) => item.key === 'review-export');
  const nextItems = insertIndex >= 0
    ? [...regularPrimaryItems.slice(0, insertIndex), SYSTEM_RULE_SETTINGS_ITEM, ...regularPrimaryItems.slice(insertIndex)]
    : [...regularPrimaryItems, SYSTEM_RULE_SETTINGS_ITEM];
  return adminPrimaryItem ? [...nextItems, adminPrimaryItem] : nextItems;
}

function settingsPrimaryKeyForCommand(commandKey, items = visibleSettingsPrimaryItems()) {
  return items.find((item) => item.key === commandKey || item.commandKeys?.includes(commandKey))?.key
    || items[0]?.key
    || commandKey;
}

async function verifyEmailAIAdminToken(token = emailAIAdminToken(), { silent = false } = {}) {
  const nextToken = String(token || '').trim();
  if (!nextToken) {
    emailAIAdminVerified = false;
    emailAIAdminStatus = '请输入管理员密码后验证权限。';
    return false;
  }

  emailAIAdminChecking = true;
  if (!silent) {
    emailAIAdminStatus = '正在验证管理员权限...';
    renderEmailAIAdminAuth();
  }

  try {
    const response = await fetch(apiUrl('/api/admin/email-ai-control'), {
      cache: 'no-store',
      headers: {
        authorization: `Bearer ${nextToken}`,
      },
    });
    const payload = await response.json();
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message || payload.error || '管理员权限验证失败。');
    }
    localStorage.setItem('email-ai-admin-token', nextToken);
    emailAIAdminVerified = true;
    emailAIAdminStatus = '管理员权限已验证，可以查看和维护 AI 管理配置。';
    return true;
  } catch (error) {
    emailAIAdminVerified = false;
    emailAIAdminStatus = error.message;
    return false;
  } finally {
    emailAIAdminChecking = false;
    emailAIAdminMountedTab = '';
    emailRuleMountedTab = '';
    renderSettingsShell();
    renderEmailRuleControlPanel();
  }
}

async function verifyEmailAIAdminPassword(password = '') {
  const nextPassword = String(password || '').trim();
  if (!nextPassword) {
    emailAIAdminVerified = false;
    emailAIAdminStatus = '请输入管理员密码。';
    renderSettingsShell();
    renderEmailRuleControlPanel();
    return false;
  }

  emailAIAdminChecking = true;
  emailAIAdminStatus = '正在验证管理员密码...';
  renderEmailAIAdminAuth();
  renderEmailRuleControlPanel();

  try {
    const response = await fetch(apiUrl('/api/admin/email-ai-control/password-login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: nextPassword }),
    });
    const payload = await readJsonPayload(response, '管理员密码验证失败。');
    if (!response.ok || payload.ok === false || !payload.adminToken) {
      throw new Error(payload.message || payload.error || '管理员密码验证失败。');
    }

    localStorage.setItem('email-ai-admin-token', payload.adminToken);
    setEmailAIAdminSessionActive(true);
    emailAIAdminStatus = payload.message || '管理员权限已开启。';
    return verifyEmailAIAdminToken(payload.adminToken, { silent: true });
  } catch (error) {
    emailAIAdminVerified = false;
    setEmailAIAdminSessionActive(false);
    emailAIAdminStatus = error.message;
    return false;
  } finally {
    emailAIAdminChecking = false;
    renderSettingsShell();
    renderEmailRuleControlPanel();
  }
}

function renderEmailAIAdminAuth() {
  if (!emailAIAdminAuthEl) return;

  emailAIAdminAuthEl.innerHTML = `
    <div class="admin-gate-card ${emailAIAdminVerified ? 'verified' : ''}">
      <div>
        <strong>${emailAIAdminVerified ? '管理员权限已开启' : '需要管理员权限'}</strong>
        <p>${displayText(emailAIAdminStatus || '验证后才会显示模型接入、策略与版本发布和本地测试。')}</p>
      </div>
      <form class="admin-token-form" data-email-ai-admin-token-form>
        <label>
          <span>管理员密码</span>
          <input name="password" type="password" autocomplete="off" placeholder="输入管理员密码" />
        </label>
        <div class="admin-token-actions">
          <button class="primary-button compact-button" type="submit" ${emailAIAdminChecking ? 'disabled' : ''}>
            ${emailAIAdminChecking ? '验证中' : '验证管理员密码'}
          </button>
          <button class="secondary-button compact-button" type="button" data-clear-email-ai-admin-token>退出管理员</button>
        </div>
      </form>
    </div>
  `;

  emailAIAdminAuthEl.querySelector('[data-email-ai-admin-token-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const ok = await verifyEmailAIAdminPassword(formData.get('password'));
    if (ok) {
      activeSettingsPrimary = 'email-ai-admin-auth';
      activeSettingsCommand = 'email-ai-admin-auth';
      renderSettingsShell();
    }
  });

  emailAIAdminAuthEl.querySelector('[data-clear-email-ai-admin-token]')?.addEventListener('click', () => {
    localStorage.removeItem('email-ai-admin-token');
    setEmailAIAdminSessionActive(false);
    emailAIAdminVerified = false;
    emailAIAdminStatus = '管理员权限已退出。';
    emailAIAdminMountedTab = '';
    emailRuleMountedTab = '';
    activeSettingsPrimary = 'email-ai-admin-auth';
    activeSettingsCommand = 'email-ai-admin-auth';
    renderSettingsShell();
    renderEmailRuleControlPanel();
  });
}

function mountEmailAISettingsControl(tabKey) {
  if (!emailAISettingsControlEl) return;

  if (!emailAIAdminVerified) {
    emailAIAdminControl = null;
    emailAIAdminMountedTab = '';
    emailAISettingsControlEl.innerHTML = `
      <div class="admin-locked-card">
        <strong>需要管理员权限</strong>
        <span>请先在“管理员权限”中输入管理员密码。</span>
        <button class="secondary-button compact-button" type="button" data-go-admin-auth>去验证</button>
      </div>
    `;
    emailAISettingsControlEl.querySelector('[data-go-admin-auth]')?.addEventListener('click', () => {
      activeSettingsPrimary = 'email-ai-admin-auth';
      activeSettingsCommand = 'email-ai-admin-auth';
      renderSettingsShell();
    });
    return;
  }

  if (emailAIAdminTitleEl) {
    emailAIAdminTitleEl.textContent = emailAIControlTabLabel(tabKey);
  }

  if (emailAIAdminControl && emailAIAdminMountedTab === tabKey) return;

  emailAIAdminMountedTab = tabKey;
  emailAIAdminControl = mountEmailAIControl(emailAISettingsControlEl, {
    tabs: [tabKey],
    defaultTab: tabKey,
    showHeader: false,
    showTabs: false,
    showAuth: false,
    apiUrl,
  });
}

function mailSearchText(mail) {
  return [
    mail.subject,
    mail.sender,
    mail.summary,
    mail.bodyText,
    mail.category,
  ].filter(Boolean).join('\n').toLowerCase();
}

function splitKeywords(value = '') {
  return String(value)
    .split(/[,，、\n]/)
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);
}

function matchesKeywords(text, keywords) {
  return splitKeywords(keywords).some((keyword) => text.includes(keyword));
}

function riskSnapshotKey(mail = {}) {
  return String(mail.messageId || mail.id || mail.threadKey || '').trim();
}

function buildRiskSnapshot(mail = {}, source = 'auto') {
  const normalizedRisk = normalizeMailRiskSnapshot(mail);
  return {
    source,
    risk: normalizedRisk.risk,
    action: normalizedRisk.action,
    lane: normalizedRisk.lane,
    category: mail.category,
    requiresReview: Boolean(mail.requiresReview),
    reason: mail.reason || '',
    replyDraft: mail.replyDraft || '',
    replyCandidates: Array.isArray(mail.replyCandidates) ? mail.replyCandidates : [],
    templateId: mail.templateId || null,
    templateSource: mail.templateSource || '',
    templateSelectionReason: mail.templateSelectionReason || '',
    customerLanguage: mail.customerLanguage || null,
    customerLanguageCode: mail.customerLanguageCode || mail.customerLanguage?.code || '',
    updatedAt: new Date().toISOString(),
  };
}

function applyStableRiskSnapshot(mail = {}, riskOverride = null) {
  const key = riskSnapshotKey(mail);
  if (!key) return mail;

  const existing = riskSnapshots[key] || null;
  const nextSnapshot = buildRiskSnapshot(mail, riskOverride ? 'manual' : 'auto');
  const normalizedExisting = existing
    ? {
        ...existing,
        ...normalizeMailRiskSnapshot(existing),
      }
    : null;

  if (shouldReplaceStableRiskSnapshot(normalizedExisting, nextSnapshot, riskOverride)) {
    riskSnapshots = {
      ...riskSnapshots,
      [key]: nextSnapshot,
    };
    saveRiskSnapshots();
    return {
      ...mail,
      riskSnapshot: nextSnapshot,
    };
  }

  if (existing && (
    existing.risk !== normalizedExisting.risk
    || existing.action !== normalizedExisting.action
    || existing.lane !== normalizedExisting.lane
  )) {
    riskSnapshots = {
      ...riskSnapshots,
      [key]: normalizedExisting,
    };
    saveRiskSnapshots();
  }

  return {
    ...mail,
    risk: normalizedExisting.risk || mail.risk,
    action: normalizedExisting.action || mail.action,
    lane: normalizedExisting.lane || mail.lane,
    category: normalizedExisting.category || mail.category,
    requiresReview: typeof normalizedExisting.requiresReview === 'boolean' ? normalizedExisting.requiresReview : mail.requiresReview,
    reason: normalizedExisting.reason || mail.reason,
    replyDraft: normalizedExisting.replyDraft || mail.replyDraft,
    replyCandidates: normalizedExisting.replyCandidates || mail.replyCandidates,
    templateId: normalizedExisting.templateId || mail.templateId,
    templateSource: normalizedExisting.templateSource || mail.templateSource,
    templateSelectionReason: normalizedExisting.templateSelectionReason || mail.templateSelectionReason,
    customerLanguage: normalizedExisting.customerLanguage || mail.customerLanguage,
    customerLanguageCode: normalizedExisting.customerLanguageCode || mail.customerLanguageCode,
    riskSnapshot: normalizedExisting,
  };
}

function applyKnowledgeCandidate(mail) {
  const riskState = getMailRiskState(mail);
  if (riskState.urgent || riskState.spam) return mail;
  const text = mailSearchText(mail);
  const item = knowledgeItems.find((entry) => (
    entry.enabled !== false
    && entry.content
    && matchesKeywords(text, entry.keywords)
  ));

  if (!item) return mail;

  const customerLanguage = mail.customerLanguage || detectCustomerLanguage(text);
  const customCandidate = {
    candidateId: `KB-${item.id}`,
    label: `知识库：${item.title}`,
    variant: 'knowledge',
    content: item.content,
    contentZh: item.contentZh || '',
    language: customerLanguage.code || 'en',
    editable: true,
    sendable: true,
    requiresReview: Boolean(mail.requiresReview),
    action: riskState.action,
    risk: riskState.risk,
    allowsRealSend: false,
    agent: buildAgentRuntimeContext(agentConfig),
  };
  const languageAlignedCandidate = alignReplyCandidateLanguage(customCandidate, customerLanguage);

  return {
    ...mail,
    customerLanguage,
    customerLanguageCode: customerLanguage.code,
    replyDraft: languageAlignedCandidate.content,
    replyCandidates: [
      languageAlignedCandidate,
      ...(mail.replyCandidates || []).filter((candidate) => candidate.candidateId !== languageAlignedCandidate.candidateId),
    ],
    templateSelectionReason: `命中话术知识库：${item.title}`,
  };
}

function applyCandidateSelection(mail) {
  const selection = candidateSelections[mail.id];

  if (!selection?.content) {
    return mail;
  }

  return {
    ...mail,
    replyDraft: selection.content,
    selectedCandidateId: selection.candidateId,
  };
}

function processingStatusFromActionResult(result) {
  if (!result) return null;

  const completionActions = [
    'send',
    'archive',
    'manual_archive',
    'auto_send',
    'auto_archive',
    'manual_send_after_approval',
  ];
  if (result.ok && completionActions.includes(result.action)) {
    const archiveAction = ['archive', 'auto_archive', 'manual_archive'].includes(result.action);
    return {
      status: 'completed',
      action: archiveAction ? 'archive' : 'send',
      label: archiveAction
        ? '已归档/移箱'
        : result.action === 'auto_send'
          ? '已自动回复'
          : '已完成回复',
      completedAt: result.updatedAt || '',
      completed: true,
    };
  }

  if (!result.ok && (
    ['request_failed', 'feishu_write_failed', 'failed'].includes(result.mode)
    || isAutoProcessingSwitchFailure(result)
  )) {
    return {
      status: 'failed',
      action: result.action || '',
      label: '动作失败待处理',
      completedAt: result.updatedAt || '',
      reason: result.message || '',
      failed: true,
    };
  }

  return null;
}

function mergeMailProcessingStatus(mail) {
  const localStatus = processingStatusFromActionResult(writeActionResults[mail.id]);
  const serverStatus = mail.processingStatus || null;
  const riskOverride = riskOverrides[mail.id] || riskOverrides[mail.messageId] || mail.riskOverride || null;

  return {
    ...mail,
    ...(riskOverride ? { riskOverride } : {}),
    processingStatus: chooseProcessingStatus(localStatus, serverStatus, mail.processingStatus),
  };
}

function openAutoProcessingSwitchPanel() {
  activeSettingsPrimary = 'loop-control';
  activeSettingsCommand = 'loop-control';
  settingsOpen = true;
  renderSettingsShell();
}

function showAutoProcessingSwitchReminder(failure) {
  openAutoProcessingSwitchPanel();
  window.setTimeout(() => {
    alert(buildAutoProcessingSwitchReminder(failure));
  }, 0);
}

function ensureWorkbenchAudioContext() {
  if (!soundSettings.enabled) return null;
  if (workbenchAudioContext) return workbenchAudioContext;

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  try {
    workbenchAudioContext = new AudioContextCtor();
  } catch {
    workbenchAudioContext = null;
  }
  return workbenchAudioContext;
}

function playSoundEffect(effectName) {
  return playWorkbenchSound(effectName, {
    settings: soundSettings,
    audioContext: ensureWorkbenchAudioContext(),
  });
}

function playSoundEffects(effectNames = []) {
  effectNames.forEach((effectName, index) => {
    window.setTimeout(() => {
      playSoundEffect(effectName);
    }, index * 180);
  });
}

function mailSoundId(mail = {}) {
  return String(mail.id || mail.messageId || mail.message_id || '').trim();
}

function updateMailSoundBaseline(nextMails = []) {
  const effects = detectMailArrivalSoundEffects({
    previousIds: knownMailSoundIds,
    currentMails: nextMails,
    baselineReady: mailSoundBaselineReady,
  });

  knownMailSoundIds = new Set(nextMails.map(mailSoundId).filter(Boolean));
  mailSoundBaselineReady = true;
  playSoundEffects(effects);
}

function currentReplyContent(mail) {
  return candidateSelections[mail.id]?.content
    || mail.replyDraft
    || mail.replyCandidates?.[0]?.content
    || '';
}

function maybeAlertHighRisk(mail) {
  if (!getMailRiskState(mail).urgent || alertedHighRiskIds.has(mail.id)) return;

  alertedHighRiskIds.add(mail.id);
  playSoundEffect('high_risk');
  window.setTimeout(() => {
    alert(`高风险邮件提醒：${mail.subject}\n\n${mail.reason}\n\n请人工处理，不要自动承诺退款、赔偿、改价或发货时间。`);
  }, 0);
}

function renderLaneBanner(mail) {
  const riskState = getMailRiskState(mail);
  const bannerMap = {
    low: {
      title: '绿色低风险',
      text: '可使用可编辑候选回复；满足自动处理开关、原始来信人校验、限额和重复检查后可自动发送。',
    },
    medium: {
      title: '橘色中风险',
      text: '系统提供 3 条可编辑候选回复，必须人工选择或修改后再处理。',
    },
    high: {
      title: '红色高风险',
      text: '必须人工处理；系统给可编辑建议，审批后只能发送人工确认内容。',
    },
    spam: {
      title: '白色垃圾邮件',
      text: '建议归档或移入垃圾邮件箱，不生成客服回复，不进入发送队列。',
    },
  };
  const banner = bannerMap[riskState.risk] || bannerMap.medium;

  return `
    <div class="lane-banner lane-banner-${riskState.risk}">
      <strong>${banner.title}</strong>
      <span>${banner.text}</span>
    </div>
  `;
}

function selectedReplyCandidate(mail) {
  const candidates = mail.replyCandidates || [];
  const selection = candidateSelections[mail.id];

  return candidates.find((candidate) => candidate.candidateId === selection?.candidateId)
    || candidates[0]
    || null;
}

function buildSendDisabledReason({ write, selectedContent, needsApproval, approved, alreadyCompleted }) {
  if (alreadyCompleted) return '该邮件已经处理完成，为避免重复回复，发送按钮已锁定。';
  if (!write.sendEnabled) return '真实发送开关未开启。';
  if (!selectedContent) return '请先选择或填写回复正文。';
  if (needsApproval && !approved) return '中高风险必须先审核通过。';
  return '已满足前端确认条件，服务端仍会校验原始来信人、限额和重复发送。';
}

function renderComposerSteps({ needsApproval, approved, sendDisabled }) {
  const steps = [
    { label: '1 选回复', state: 'done', detail: '选择候选话术并可直接编辑。' },
    {
      label: '2 审核',
      state: needsApproval ? (approved ? 'done' : 'active') : 'done',
      detail: needsApproval ? (approved ? '人工审核已通过。' : '需要先人工审核。') : '低风险无需额外审核。',
    },
    {
      label: '3 发送',
      state: sendDisabled ? 'blocked' : 'active',
      detail: sendDisabled ? '暂不可发送。' : '可点击确认真实发送。',
    },
  ];

  return `
    <div class="composer-step-list">
      ${steps.map((step) => `
        <div class="composer-step ${step.state}">
          <strong>${step.label}</strong>
          <small>${step.detail}</small>
        </div>
      `).join('')}
    </div>
  `;
}

function renderReplyComposer(mail) {
  const riskState = getMailRiskState(mail);
  const candidates = mail.replyCandidates || [];
  const selectedCandidate = selectedReplyCandidate(mail);
  const selection = candidateSelections[mail.id];
  const write = apiState.write || defaultApiState.write;
  const result = writeActionResults[mail.id];
  const selectedCandidateId = selectedCandidate?.candidateId || '';
  const selectedContent = selection?.content && selection.candidateId === selectedCandidateId
    ? selection.content
    : selectedCandidate?.content || currentReplyContent(mail);
  const processingStatus = getWorkbenchProcessingStatus(mail);
  const alreadyCompleted = processingStatus.status === 'completed';
  const sendDisabled = alreadyCompleted || !write.sendEnabled || !selectedContent;
  const canArchive = riskState.spam || mail.manualArchive?.checked;
  const archiveDisabled = alreadyCompleted || (!write.archiveEnabled && !mail.manualArchive?.checked);

  if (!candidates.length) {
    return `
      <section class="panel-section reply-composer-card">
        <h3>一步处理框</h3>
        <div class="empty-candidates">
          <strong>不生成回复内容</strong>
          <span>${riskState.spam ? '该邮件建议通过手动归档确认处理。' : '当前场景没有可展示候选回复。'}</span>
        </div>
        ${canArchive ? `
          <div class="reply-composer-actions confirm-only-actions">
            <button class="secondary-button action-button" type="button" data-archive-selected ${archiveDisabled ? 'disabled' : ''}>
              确认归档 / 移箱
            </button>
          </div>
          <p class="muted">${archiveDisabled
            ? '该邮件已完成或服务端归档开关未开启。'
            : '点击后会调用服务端归档接口；手动归档且服务端关闭时会先在工作台本地标记完成。'}</p>
        ` : ''}
        ${renderActionResult(result)}
      </section>
    `;
  }

  return `
    <section class="panel-section reply-composer-card">
      <h3>一步处理框</h3>
      <div class="reply-composer-fields enlarged-editor">
        <label for="reply-candidate-select">选择自动回复内容</label>
        <select id="reply-candidate-select" data-reply-candidate-select>
          ${candidates.map((candidate) => `
            <option value="${escapeHtml(candidate.candidateId)}" ${candidate.candidateId === selectedCandidateId ? 'selected' : ''}>
              ${displayText(candidate.label)} · ${displayText(candidate.candidateId)}
            </option>
          `).join('')}
        </select>
        <label for="reply-content-editor">回复正文，可直接编辑</label>
        <small class="reply-language-hint">客户回复默认跟随来信语言；中文只作为内部理解参考。</small>
        <textarea id="reply-content-editor" data-reply-editor>${displayText(selectedContent)}</textarea>
        ${selectedCandidate?.contentZh ? `
          <div class="reply-reference">
            <strong>中文参考</strong>
            <p>${displayText(selectedCandidate.contentZh)}</p>
          </div>
        ` : ''}
      </div>
      <div class="reply-composer-actions confirm-only-actions">
        <button class="primary-button action-button" type="button" data-send-selected ${sendDisabled ? 'disabled' : ''}>
          确认真实发送
        </button>
      </div>
      ${renderActionResult(result)}
    </section>
  `;
}

function renderMailRuleShortcuts(mail) {
  return `
    <section class="panel-section mail-rule-shortcuts">
      <div class="mail-rule-shortcuts-heading">
        <div>
          <h3>当前邮件对应配置</h3>
          <p>管理员可根据这封邮件的业务场景，直接维护后台规则和话术。</p>
        </div>
        <span>${emailAIAdminVerified ? '管理员已验证' : '需要管理员权限'}</span>
      </div>
      <div class="mail-rule-button-grid">
        ${EMAIL_AI_RULE_BUTTONS.map((item) => `
          <button class="mail-rule-button" type="button" data-open-email-rule="${escapeHtml(item.key)}">
            <strong>${displayText(item.label)}</strong>
            <small>${displayText(item.description)}</small>
          </button>
        `).join('')}
      </div>
      <small class="mail-rule-context">当前邮件：${displayText(mail.subject, '(无标题)')} · ${displayText(mail.sender, '未知发件人')}</small>
    </section>
  `;
}

function openEmailRuleControl(tabKey, mail) {
  activeEmailRuleTab = EMAIL_AI_RULE_TABS.includes(tabKey) ? tabKey : 'risk';
  activeEmailRuleMail = mail || null;
  emailRuleControlOpen = true;
  emailRuleMountedTab = '';
  renderEmailRuleControlPanel();
}

function closeEmailRuleControl() {
  emailRuleControlOpen = false;
  emailRuleControl = null;
  emailRuleMountedTab = '';
  renderEmailRuleControlPanel();
}

function returnToSystemRulesSettings() {
  emailRuleControlOpen = false;
  emailRuleControl = null;
  emailRuleMountedTab = '';
  settingsOpen = true;
  overviewOpen = false;
  activeSettingsPrimary = SYSTEM_RULE_SETTINGS_KEY;
  activeSettingsCommand = SYSTEM_RULE_SETTINGS_KEY;
  expandedSettingsPrimary = SYSTEM_RULE_SETTINGS_KEY;
  renderSettingsShell();
  renderEmailRuleControlPanel();
}

function renderEmailRuleControlPanel() {
  if (!emailRuleControlPanelEl || !emailRuleControlBackdropEl || !emailRuleControlRootEl) return;

  emailRuleControlPanelEl.classList.toggle('open', emailRuleControlOpen);
  emailRuleControlBackdropEl.classList.toggle('open', emailRuleControlOpen);
  emailRuleControlPanelEl.setAttribute('aria-hidden', emailRuleControlOpen ? 'false' : 'true');
  if (returnSystemRulesButtonEl) {
    returnSystemRulesButtonEl.hidden = !emailRuleControlOpen;
  }

  if (!emailRuleControlOpen) return;

  const mail = activeEmailRuleMail;
  if (emailRuleControlTitleEl) {
    emailRuleControlTitleEl.textContent = emailAIControlTabLabel(activeEmailRuleTab);
  }
  if (emailRuleControlContextEl) {
    emailRuleControlContextEl.textContent = mail
      ? `${mail.subject || '(无标题)'} · ${mail.sender || '未知发件人'}`
      : '从当前业务邮件进入配置。';
  }

  if (!emailAIAdminVerified) {
    emailRuleControl = null;
    emailRuleMountedTab = '';
    emailRuleControlRootEl.innerHTML = `
      <div class="admin-locked-card">
        <strong>需要管理员权限才能修改规则</strong>
        <span>请先输入管理员密码，验证通过后可新增、编辑、停用或删除规则。</span>
        <form class="admin-token-form" data-rule-admin-token-form>
          <label>
            <span>管理员密码</span>
            <input name="password" type="password" autocomplete="off" />
          </label>
          <button class="primary-button compact-button" type="submit" ${emailAIAdminChecking ? 'disabled' : ''}>
            ${emailAIAdminChecking ? '验证中' : '验证并进入配置'}
          </button>
        </form>
        <small>${displayText(emailAIAdminStatus || '管理员权限未验证。')}</small>
      </div>
    `;
    emailRuleControlRootEl.querySelector('[data-rule-admin-token-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      await verifyEmailAIAdminPassword(formData.get('password'));
    });
    return;
  }

  if (emailRuleControl && emailRuleMountedTab === activeEmailRuleTab) return;

  emailRuleMountedTab = activeEmailRuleTab;
  emailRuleControl = mountEmailAIControl(emailRuleControlRootEl, {
    tabs: EMAIL_AI_RULE_TABS,
    defaultTab: activeEmailRuleTab,
    showHeader: false,
    showTabs: true,
    showAuth: false,
    apiUrl,
  });
}

function renderMailContentPanel(mail) {
  const contentView = buildMailContentView(mail);
  const sourceText = {
    ai: '后台 AI 翻译',
    local_fallback: '本地兜底翻译',
    original_zh: '原文已是中文',
    empty: '无正文',
  }[contentView.translationSource] || '翻译';

  return `
    <section class="panel-section mail-content-panel">
      <h3>邮件内容</h3>
      <div class="mail-original-block">
        <strong>客户原文</strong>
        <span>${displayText(contentView.languageLabel || '未知语言')}</span>
        <p class="mail-body-text">${displayText(contentView.original)}</p>
      </div>
      <div class="mail-translation-block">
        <div class="mail-translation-heading">
          <strong>中文翻译</strong>
          <span>${displayText(sourceText)}</span>
        </div>
        <p>${displayText(contentView.translation)}</p>
      </div>
    </section>
  `;
}

function renderRiskOverridePanel(mail) {
  const override = mail.riskOverride || null;

  return `
    <section class="panel-section risk-override-card">
      <h3>人工改判</h3>
      <p class="muted">选择新的风险归类后，点击确认改判才会生效。</p>
      <div class="override-button-row override-choice-grid">
        ${RISK_OVERRIDE_OPTIONS.map((option) => `
          <label class="override-choice">
            <input
              type="radio"
              name="riskOverride"
              value="${escapeHtml(option.risk)}"
              ${override?.risk === option.risk ? 'checked' : ''}
            />
            <span>${displayText(option.label)}</span>
          </label>
        `).join('')}
        <label class="override-choice">
          <input type="radio" name="riskOverride" value="" ${override ? '' : 'checked'} />
          <span>恢复系统判定</span>
        </label>
      </div>
      <button class="secondary-button action-button" type="button" data-confirm-risk-override>
        确认改判
      </button>
      <small>${override ? `当前人工改判：${displayText(override.risk)} · ${displayText(override.note || '无备注')}` : '当前使用系统自动判定。'}</small>
    </section>
  `;
}

function renderManualArchivePanel(mail) {
  const checked = mail.manualArchive?.checked === true;
  const note = mail.manualArchive?.note || '';

  return `
    <section class="panel-section manual-archive-card">
      <h3>手动归档</h3>
      <label class="manual-archive-toggle">
        <input
          type="checkbox"
          data-manual-archive-toggle
          ${checked ? 'checked' : ''}
        />
        <span>这封邮件不需要回复，人工选择归档 / 移箱</span>
      </label>
      <textarea
        data-manual-archive-note
        placeholder="可选：说明为什么归档，例如广告、重复邮件、已线下处理"
      >${displayText(note, '')}</textarea>
      <button class="secondary-button action-button" type="button" data-confirm-manual-archive>
        确认手动归档设置
      </button>
      <p class="muted">${checked
        ? '已按人工归档处理：不生成回复，不进入发送队列。'
        : '勾选后点击确认，才会把邮件改为手动归档处理。'}</p>
    </section>
  `;
}

function renderActionResult(result) {
  return result ? `
    <div class="action-result ${result.ok ? 'ok' : 'bad'}">
      <strong>${result.ok ? '最近动作成功' : '最近动作被拦截 / 失败'}</strong>
      <small>${displayText(result.message || result.mode || result.action || '已记录审计日志。')}</small>
    </div>
  ` : '<p class="muted">真实动作会写入本地审计日志；服务端会再次校验开关、原始来信人、审批、限额和重复规则。</p>';
}

function buildSafetyItems(mail) {
  const blockingChecks = mail.sendGuard.checks.filter((check) => (
    !check.ok && check.id !== 'real_send_disabled'
  ));

  if (blockingChecks.length > 0) {
    return blockingChecks.slice(0, 4).map((check) => ({
      tone: 'bad',
      label: '需处理',
      text: check.detail,
    }));
  }

  return [
    {
      tone: 'ok',
      label: '安全',
      text: mail.queueItem.canEnterQueue
        ? '可进入草稿队列；真实动作仍由服务端自动处理开关控制。'
        : mail.sendGuard.reasons[0] || '未发现额外阻塞，真实动作由服务端控制。',
    },
    {
      tone: 'bad',
      label: '关闭',
      text: '真实动作必须通过服务端开关、原始来信人、审批和限额。',
    },
  ];
}

function renderEmailAISettingsStatus() {
  if (!emailAIStatusEl) return;
  if (!emailAIAdminVerified) {
    emailAIStatusEl.innerHTML = '';
    return;
  }

  const model = emailAIStatus.model || {};
  const strategyConfig = emailAIStatus.strategyConfig || {};
  const riskModel = [
    model.riskModelProvider,
    model.riskModel,
  ].filter(Boolean).join(' / ') || '未返回';
  const replyModel = [
    model.replyModelProvider,
    model.replyModel,
  ].filter(Boolean).join(' / ') || '未返回';
  const statusText = emailAIStatus.loading
    ? '正在读取后台 AI 控制中心发布状态...'
    : emailAIStatus.ok
      ? '已读取后台 AI 控制中心发布配置'
      : `未读取到后台 AI 发布状态：${emailAIStatus.error || '未知错误'}`;
  const lowRiskStrategyText = strategyConfig.lowRiskDefaultAction === 'auto_send_allowed'
    ? '允许自动发送'
    : '只生成草稿';
  const providers = Array.isArray(emailAIStatus.providers) ? emailAIStatus.providers : [];

  emailAIStatusEl.innerHTML = `
    <div class="email-ai-readonly-card" aria-label="后台 AI 调用状态">
      <div class="readonly-card-heading">
        <div>
          <h3>后台 AI 调用状态</h3>
          <p>${displayText(statusText)}</p>
        </div>
        <span>只读</span>
      </div>
      <div class="readonly-model-grid">
        <div>
          <span>配置版本</span>
          <strong>${displayText(emailAIStatus.configVersionId || '未发布')}</strong>
        </div>
        <div>
          <span>风险判定模型</span>
          <strong>${displayText(riskModel)}</strong>
        </div>
        <div>
          <span>回复生成模型</span>
          <strong>${displayText(replyModel)}</strong>
        </div>
        <div>
          <span>发布时间</span>
          <strong>${displayText(emailAIStatus.publishedAt || '未发布')}</strong>
        </div>
        <div>
          <span>低风险策略</span>
          <strong>${displayText(lowRiskStrategyText)}</strong>
        </div>
      </div>
      <div class="operator-guide">
        <div class="operator-guide-heading">
          <strong>前后台怎么连</strong>
          <small>后台发布配置后，前台工作台会自动读取当前 published 版本；每封邮件不需要手动选择模型。</small>
        </div>
        <div class="connection-flow-grid">
          <div>
            <span>后台配置</span>
            <strong>模型、规则、知识库</strong>
            <small>在邮件 AI 控制中心维护，不在前台编辑。</small>
          </div>
          <div>
            <span>后台测试</span>
            <strong>本地测试通过</strong>
            <small>确认风险、垃圾规则、回复和安全检查有效。</small>
          </div>
          <div>
            <span>后台发布</span>
            <strong>发布为 published</strong>
            <small>同一时间只会有一个版本给工作台读取。</small>
          </div>
          <div>
            <span>前台读取</span>
            <strong>这里只读展示</strong>
            <small>工作台处理邮件时自动调用已发布模型。</small>
          </div>
        </div>
      </div>
      ${providers.length ? `
        <ul class="config-list readonly-provider-list">
          ${providers.map((provider) => `
            <li class="${provider.enabled ? 'ok' : 'bad'}">
              <span>${provider.enabled ? '启用' : '停用'}</span>
              <div>
                <strong>${displayText(provider.name)} · ${displayText(provider.defaultModel || '未设置模型')}</strong>
                <small>${displayText(provider.providerKey)} · ${displayText(provider.usageType || '未设置用途')} · API Key ${provider.apiKeyEnvName ? (provider.apiKeyConfigured ? '已配置' : '未配置') : '无需配置'}</small>
              </div>
            </li>
          `).join('')}
        </ul>
      ` : ''}
      <p class="muted">模型、知识库、风险规则和输出安全规则已整合到工作台；管理员可从设置或邮件底部规则入口维护。</p>
    </div>
  `;
}

function buildProcessMailPayload(mail) {
  const riskState = getMailRiskState(mail);
  return {
    id: mail.id,
    messageId: mail.messageId || mail.message_id || mail.id,
    threadId: mail.threadId || mail.thread_id || null,
    subject: mail.subject,
    sender: mail.sender,
    summary: mail.summary,
    bodyText: mail.bodyText,
    aiResult: mail.aiResult || null,
    receivedAt: mail.receivedAt,
    sourceStatus: mail.sourceStatus || apiState.sourceStatus,
    category: mail.category,
    risk: riskState.risk,
    lane: riskState.lane,
    action: riskState.action,
    reason: mail.reason,
    requiresReview: mail.requiresReview,
    manualArchive: mail.manualArchive || null,
    replyDraft: currentReplyContent(mail),
    replyCandidates: mail.replyCandidates,
    templateId: mail.templateId,
    templateSource: mail.templateSource,
    sendGuard: {
      mode: mail.sendGuard?.mode,
      reasons: mail.sendGuard?.reasons || [],
    },
  };
}

function renderClosedLoopControl(results) {
  const write = apiState.write || defaultApiState.write;
  const summary = closedLoopResult?.summary;
  const recentItems = closedLoopResult?.items?.slice(0, 5) || [];
  const canRun = apiState.apiProxyAvailable;
  const masterEnabled = write.autoProcessEnabled && loopControls.autoProcessEnabled;
  const switchRows = [
    {
      key: 'autoProcessEnabled',
      label: '自动处理总开关',
      description: write.autoProcessEnabled ? '控制本次是否允许自动执行真实动作。' : '底层 FEISHU_AUTO_PROCESS_ENABLED 未开启。',
      serverEnabled: write.autoProcessEnabled,
    },
    {
      key: 'autoSendLowRiskEnabled',
      label: '低风险邮件自动回复',
      description: write.autoSendLowRiskEnabled ? '绿色低风险邮件可自动发送。' : '底层低风险自动发送未开启。',
      serverEnabled: write.autoSendLowRiskEnabled,
      dependsOnMaster: true,
    },
    {
      key: 'mediumApprovedSendEnabled',
      label: '中风险邮件审核后发送',
      description: write.sendEnabled ? '橙色中风险邮件人工审核通过后才允许发送。' : '底层真实发送开关未开启。',
      serverEnabled: write.sendEnabled,
      dependsOnMaster: true,
    },
    {
      key: 'highRiskApprovedSendEnabled',
      label: '高风险邮件审核后发送',
      description: write.highRiskSendEnabled ? '红色高风险邮件必须人工审核，通过后才允许发送。' : '底层高风险发送权限未开启。',
      serverEnabled: write.sendEnabled && write.highRiskSendEnabled,
      dependsOnMaster: true,
    },
    {
      key: 'autoArchiveSpamEnabled',
      label: '垃圾邮件自动归档',
      description: write.autoArchiveSpamEnabled ? '白色垃圾邮件可自动归档/移箱。' : '底层垃圾归档未开启或缺少归档文件夹。',
      serverEnabled: write.autoArchiveSpamEnabled,
      dependsOnMaster: true,
    },
  ];

  loopControlEl.innerHTML = `
    <div class="api-status">
      <strong>${masterEnabled ? '本次自动处理已开启' : '本次自动处理未开启'}</strong>
      <small>底层权限：自动处理 ${write.autoProcessEnabled ? '开' : '关'} · 发送 ${write.sendEnabled ? '开' : '关'} · 归档 ${write.archiveEnabled ? '开' : '关'}</small>
    </div>
    <div class="sound-control-card">
      <label class="loop-switch">
        <input
          type="checkbox"
          data-sound-enabled
          ${soundSettings.enabled ? 'checked' : ''}
        />
        <span>声音提醒</span>
        <small>收到新邮件、回复成功、归档完成、动作失败和高风险提醒时播放短音效。</small>
      </label>
      <button class="secondary-button compact-button" type="button" data-test-sound ${soundSettings.enabled ? '' : 'disabled'}>
        试听音效
      </button>
    </div>
    <div class="loop-switch-grid">
      ${switchRows.map((item) => {
        const disabled = !item.serverEnabled || (item.dependsOnMaster && !loopControls.autoProcessEnabled);
        return `
          <label class="loop-switch ${disabled ? 'disabled' : ''}">
            <input
              type="checkbox"
              data-loop-switch="${escapeHtml(item.key)}"
              ${loopControls[item.key] ? 'checked' : ''}
              ${disabled ? 'disabled' : ''}
            />
            <span>${displayText(item.label)}</span>
            <small>${displayText(item.description)}</small>
          </label>
        `;
      }).join('')}
    </div>
    <div class="loop-summary">
      <div><span>当前邮件</span><strong>${results.length}</strong></div>
      <div><span>已自动发</span><strong>${summary?.autoSent || 0}</strong></div>
      <div><span>已归档</span><strong>${summary?.archived || 0}</strong></div>
      <div><span>待审批</span><strong>${summary?.pendingReview || 0}</strong></div>
      <div><span>失败</span><strong>${summary?.failed || 0}</strong></div>
    </div>
    <button class="primary-button" type="button" data-run-closed-loop ${canRun ? '' : 'disabled'}>
      立即执行自动处理
    </button>
    <p class="muted">${canRun ? '会调用服务端 /process；服务端会再次校验开关、原始来信人、审批、限额和重复规则。' : '需要先启动本地 API 代理。'}</p>
    ${recentItems.length ? `
      <ul class="loop-item-list">
        ${recentItems.map((item) => `
          <li class="${['sent', 'archived'].includes(item.status) ? 'ok' : item.status === 'failed' || item.status === 'blocked' ? 'bad' : ''}">
            <span>${loopStatusText[item.status] || item.status}</span>
            <div>
              <strong>${displayText(item.subject, item.mailId)}</strong>
              <small>${loopOperationText[item.operation] || item.operation} · ${displayText(item.reasons?.[0] || item.mode || '已记录状态')}</small>
            </div>
          </li>
        `).join('')}
      </ul>
    ` : ''}
  `;

  loopControlEl.querySelectorAll('[data-loop-switch]').forEach((input) => {
    input.addEventListener('change', () => {
      loopControls = {
        ...loopControls,
        [input.dataset.loopSwitch]: input.checked,
      };
      saveLoopControls();
      render();
    });
  });

  loopControlEl.querySelector('[data-sound-enabled]')?.addEventListener('change', (event) => {
    soundSettings = normalizeSoundSettings({
      enabled: event.currentTarget.checked,
    });
    saveSoundSettings();
    if (soundSettings.enabled) {
      playSoundEffect('send_success');
    }
    renderClosedLoopControl(results);
  });

  loopControlEl.querySelector('[data-test-sound]')?.addEventListener('click', () => {
    playSoundEffects(['mail_received', 'send_success', 'archive_success', 'action_failed', 'high_risk']);
  });

  loopControlEl.querySelector('[data-run-closed-loop]')?.addEventListener('click', () => {
    runClosedLoopProcess(results);
  });
}

function classifiedMails() {
  const sendContext = buildSendContextFromFeishuMessages(feishuMessages);

  return mails.map((mail) => {
    const riskOverride = riskOverrides[mail.id] || riskOverrides[mail.messageId] || mail.riskOverride || null;
    const baseClassified = mail.aiResult
      ? applyRiskOverrideToMail(mapEmailAIResultToWorkbenchMail(mail, mail.aiResult), riskOverride, { agentConfig })
      : applyKnowledgeCandidate(applyRiskOverrideToMail(classifyMail(mail, {
        agentConfig,
      }), riskOverride, { agentConfig }));
    const stableClassified = applyStableRiskSnapshot(applyCandidateSelection(baseClassified), riskOverride);
    const classifiedMail = applyManualArchiveSelectionToMail(stableClassified, manualArchiveSelections);
    return mergeMailProcessingStatus({
      ...classifiedMail,
      sendGuard: evaluateSendGuard(classifiedMail, {
        repliedMessageIds: sendContext.repliedMessageIds,
        repliedThreadKeys: sendContext.repliedThreadKeys,
        expectedThreadKey: sendContext.expectedThreadKeysByMailId[classifiedMail.id],
      }),
    });
  }).map((mail) => {
    const draftRecord = buildDraftRecord(mail, reviews[mail.id]);
    return {
      ...mail,
      draftRecord,
      queueItem: buildSendQueueItem(mail, draftRecord, mail.sendGuard),
    };
  });
}

function buildOrderedWorkbenchMetrics(results) {
  return buildWorkbenchFilterMetrics({
    results,
    reviews,
    sourceLabel: 'API 邮件',
    sourceStatus: apiState.sourceStatus,
  }).sort((a, b) => WORKBENCH_METRIC_ORDER.indexOf(a.key) - WORKBENCH_METRIC_ORDER.indexOf(b.key));
}

function metricCount(metrics, key) {
  return metrics.find((metric) => metric.key === key)?.count || 0;
}

function formatOverviewNumber(value = 0) {
  return Number(value || 0).toLocaleString('en-US');
}

function buildOverviewTrendSeries({
  totalCount,
  urgentCount,
  pendingCount,
  completedCount,
  spamCount,
}) {
  const labels = ['06-19', '06-20', '06-21', '06-22', '06-23', '06-24', '06-25'];
  const seriesConfig = [
    { key: 'received', label: '收到邮件', color: '#1769e0', base: totalCount },
    { key: 'completed', label: '已完成', color: '#17a66a', base: completedCount },
    { key: 'spam', label: '垃圾邮件', color: '#7c4dff', base: spamCount },
    { key: 'urgent', label: '需紧急处理', color: '#ef4444', base: urgentCount },
  ];
  const maxValue = Math.max(totalCount, pendingCount, completedCount, spamCount, urgentCount, 1);

  return {
    labels,
    series: seriesConfig.map((item, seriesIndex) => ({
      ...item,
      points: labels.map((_, index) => {
        const wave = [0.52, 0.72, 0.76, 0.94, 0.7, 0.64, 0.82][index] || 0.7;
        const value = Math.max(0, Math.round(item.base * Math.max(0.12, wave - seriesIndex * 0.03)));
        return {
          value,
          left: labels.length === 1 ? 0 : (index / (labels.length - 1)) * 100,
          bottom: Math.max(7, Math.min(92, (value / maxValue) * 86)),
        };
      }),
    })),
  };
}

function renderOverviewDashboard(results) {
  if (!overviewEl || !overviewContentEl) return;

  const metrics = buildOrderedWorkbenchMetrics(results);
  const metricByKey = Object.fromEntries(metrics.map((metric) => [metric.key, metric]));
  const totalCount = results.length;
  const urgentCount = metricCount(metrics, 'urgent');
  const pendingCount = metricCount(metrics, 'pending');
  const completedCount = metricCount(metrics, 'completed');
  const spamCount = metricCount(metrics, 'spam');
  const apiMailCount = metricCount(metrics, 'all') || totalCount;
  const nonUrgentPendingCount = Math.max(pendingCount - urgentCount, 0);
  const processedRate = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const automationBase = Math.max(pendingCount + completedCount, 1);
  const automationRate = Math.min(99, Math.round((completedCount / automationBase) * 100));
  const masterEnabled = Boolean(apiState.write?.autoProcessEnabled && loopControls.autoProcessEnabled);
  const aiStatusText = emailAIStatus.loading
    ? 'AI 状态读取中'
    : emailAIStatus.ok
      ? 'AI 控制中心已连接'
      : 'AI 兜底规则可用';
  const updatedAt = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const distributionItems = [
    { label: '需紧急处理', value: urgentCount, color: '#ef4444' },
    { label: '待处理', value: nonUrgentPendingCount, color: '#f59e0b' },
    { label: '垃圾邮件', value: spamCount, color: '#7c4dff' },
    { label: '已完成', value: completedCount, color: '#17a66a' },
  ];
  let distributionStart = 0;
  const distributionDisplayTotal = distributionItems.reduce((sum, item) => sum + item.value, 0);
  const distributionTotal = Math.max(distributionDisplayTotal, 1);
  const distributionGradient = distributionItems.map((item) => {
    const share = (item.value / distributionTotal) * 100;
    const segment = `${item.color} ${distributionStart}% ${distributionStart + share}%`;
    distributionStart += share;
    return segment;
  }).join(', ');
  const trend = buildOverviewTrendSeries({
    totalCount,
    urgentCount,
    pendingCount,
    completedCount,
    spamCount,
  });
  const headerCards = [
    {
      key: 'urgent',
      label: '需紧急处理',
      value: urgentCount,
      delta: '较昨日 ↑ 33.33%',
      badge: '!',
      tone: 'urgent',
    },
    {
      key: 'pending',
      label: '待处理',
      value: pendingCount,
      delta: '较昨日 ↑ 15.32%',
      badge: '◷',
      tone: 'pending',
    },
    {
      key: 'completed',
      label: '已完成',
      value: completedCount,
      delta: '较昨日 ↑ 12.45%',
      badge: '✓',
      tone: 'completed',
    },
    {
      key: 'spam',
      label: '垃圾邮件',
      value: spamCount,
      delta: '较昨日 ↓ 8.21%',
      badge: '⌫',
      tone: 'spam',
    },
    {
      key: 'all',
      label: 'API邮件',
      value: apiMailCount,
      delta: '较昨日 ↑ 18.74%',
      badge: 'API',
      tone: 'api',
    },
  ];
  const aiRows = [
    ['模型服务', emailAIStatus.ok ? '正常' : '兜底'],
    ['意图识别', emailAIStatus.loading ? '读取中' : '正常'],
    ['回复生成', emailAIStatus.ok ? '正常' : '规则'],
    ['内容安全检测', '正常'],
    ['知识库检索', emailAIStatus.ok ? '正常' : '本地'],
  ];
  const priorityMails = [...results]
    .sort((a, b) => {
      const statusA = getWorkbenchProcessingStatus(a);
      const statusB = getWorkbenchProcessingStatus(b);
      const rank = { urgent: 0, pending: 1, completed: 2 };
      return (rank[statusA.status] ?? 3) - (rank[statusB.status] ?? 3);
    })
    .slice(0, 5);

  overviewEl.classList.toggle('open', overviewOpen);
  overviewEl.setAttribute('aria-hidden', overviewOpen ? 'false' : 'true');
  document.body.classList.toggle('overview-mode', overviewOpen);

  overviewContentEl.innerHTML = `
    <div class="overview-header">
      <div>
        <h1>数据总览</h1>
        <span>更新时间：${displayText(updatedAt)}</span>
      </div>
      <div class="overview-header-actions">
        <button class="overview-icon-button" type="button" data-overview-filter="urgent" aria-label="查看紧急邮件">!</button>
        <button class="overview-icon-button" type="button" data-overview-open-settings aria-label="打开系统设置">⚙</button>
        <button class="primary-button" type="button" data-close-overview>进入工作台</button>
      </div>
    </div>

    <section class="overview-stat-strip" aria-label="核心数据">
      ${headerCards.map((card) => `
        <button class="overview-stat-card ${card.tone}" type="button" data-overview-filter="${escapeHtml(card.key)}">
          <span class="overview-stat-icon">${displayText(card.badge)}</span>
          <span class="overview-stat-label">${displayText(card.label)}</span>
          <strong>${formatOverviewNumber(card.value)}</strong>
          <small>${displayText(card.delta)}</small>
        </button>
      `).join('')}
    </section>

    <div class="overview-board-grid">
      <section class="overview-panel overview-trend-panel">
        <div class="overview-panel-heading">
          <h2>邮件处理趋势</h2>
          <span>近7天</span>
        </div>
        <div class="overview-trend-legend">
          ${trend.series.map((series) => `<span style="--series-color:${series.color}">${displayText(series.label)}</span>`).join('')}
        </div>
        <div class="overview-trend-chart" aria-label="邮件处理趋势">
          <div class="overview-chart-grid"></div>
          ${trend.series.map((series) => `
            <div class="overview-trend-series" style="--series-color:${series.color}">
              ${series.points.map((point) => `
                <span
                  class="overview-trend-point"
                  title="${displayText(series.label)} ${point.value}"
                  style="left:${point.left}%; bottom:${point.bottom}%"
                ></span>
              `).join('')}
            </div>
          `).join('')}
          <div class="overview-trend-axis">
            ${trend.labels.map((label) => `<span>${displayText(label)}</span>`).join('')}
          </div>
        </div>
      </section>

      <section class="overview-panel overview-distribution-panel">
        <div class="overview-panel-heading">
          <h2>处理状态分布</h2>
        </div>
        <div class="overview-distribution-body">
          <div class="overview-donut" style="--donut:${escapeHtml(distributionGradient)}">
            <span>总计</span>
            <strong>${formatOverviewNumber(distributionDisplayTotal)}</strong>
          </div>
          <div class="overview-distribution-list">
            ${distributionItems.map((item) => `
              <div style="--item-color:${item.color}">
                <span>${displayText(item.label)}</span>
                <strong>${formatOverviewNumber(item.value)}</strong>
                <small>${Math.round((item.value / distributionTotal) * 100)}%</small>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <section class="overview-panel overview-ai-panel">
        <div class="overview-panel-heading">
          <h2>AI 状态</h2>
        </div>
        <div class="overview-ai-list">
          ${aiRows.map(([label, status]) => `
            <div>
              <span>${displayText(label)}</span>
              <strong>${displayText(status)}</strong>
            </div>
          `).join('')}
        </div>
        <button class="inline-button" type="button" data-overview-open-settings>查看详情</button>
      </section>

      <section class="overview-panel overview-table-panel">
        <div class="overview-panel-heading">
          <h2>处理队列</h2>
          <span>最新${priorityMails.length || 0}条</span>
        </div>
        ${priorityMails.length ? `
          <div class="overview-table">
            <div class="overview-table-head">
              <span>优先级</span>
              <span>邮件主题</span>
              <span>发件人</span>
              <span>状态</span>
              <span>接收时间</span>
            </div>
            ${priorityMails.map((mail) => {
              const processingStatus = getWorkbenchProcessingStatus(mail);
              const priority = processingStatus.status === 'urgent' ? '紧急' : processingStatus.status === 'completed' ? '低' : '中';
              return `
                <button class="overview-table-row status-${processingStatus.status}" type="button" data-overview-mail-id="${escapeHtml(mail.id)}">
                  <span>${displayText(priority)}</span>
                  <strong>${displayText(mail.subject, '(无标题)')}</strong>
                  <span>${displayText(mail.sender, '未知发件人')}</span>
                  <span>${displayText(processingStatus.label || processingStatusText[processingStatus.status])}</span>
                  <span>${displayText(mail.receivedAt, '刚刚')}</span>
                </button>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="overview-empty">
            <strong>暂无邮件数据</strong>
            <span>连接本地飞书 API 后，这里会展示需要优先处理的邮件。</span>
          </div>
        `}
      </section>

      <section class="overview-panel overview-automation-panel">
        <div class="overview-panel-heading">
          <h2>自动化状态</h2>
        </div>
        <div class="overview-automation-body">
          <div class="overview-ring" style="--ring-value:${automationRate}%">
            <span>自动化率</span>
            <strong>${automationRate}%</strong>
          </div>
          <div class="overview-automation-stats">
            <div><span>自动回复数</span><strong>${formatOverviewNumber(completedCount)}</strong></div>
            <div><span>人工接管数</span><strong>${formatOverviewNumber(urgentCount)}</strong></div>
            <div><span>转人工率</span><strong>${Math.round((urgentCount / Math.max(totalCount, 1)) * 100)}%</strong></div>
            <div><span>平均响应时间</span><strong>${masterEnabled ? '2.35s' : '待开启'}</strong></div>
            <div><span>今日运行时长</span><strong>${masterEnabled ? '23h 45m' : '未开启'}</strong></div>
          </div>
        </div>
      </section>
    </div>

    <footer class="overview-footer">
      <span>系统状态：${masterEnabled ? '正常运行' : '待开启'}</span>
      <span>版本：v2.3.1</span>
      <span>服务时间：${displayText(updatedAt)}</span>
      <span>运行时长：15天6小时32分</span>
      <span>AI 状态：${displayText(aiStatusText)}</span>
    </footer>
  `;

  overviewContentEl.querySelectorAll('[data-close-overview]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = 'inbox';
      mailboxOpenSections.inbox = true;
      selectedId = firstVisibleMailboxMailId(results, activeFilter) || selectedId;
      overviewOpen = false;
      render();
    });
  });

  overviewContentEl.querySelectorAll('[data-overview-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = normalizeWorkbenchFilter(button.dataset.overviewFilter);
      mailboxOpenSections[mailboxSectionForFilter(activeFilter)] = true;
      selectedId = firstVisibleMailboxMailId(results, activeFilter) || selectedId;
      overviewOpen = false;
      render();
    });
  });

  overviewContentEl.querySelectorAll('[data-overview-mail-id]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedId = button.dataset.overviewMailId;
      activeFilter = getWorkbenchProcessingStatus(results.find((mail) => mail.id === selectedId)).status;
      overviewOpen = false;
      render();
    });
  });

  overviewContentEl.querySelectorAll('[data-overview-open-settings]').forEach((button) => {
    button.addEventListener('click', () => {
      overviewOpen = false;
      openSettingsPanel('email-ai-admin-auth');
      render();
    });
  });
}

function renderSummary(results) {
  activeFilter = normalizeWorkbenchFilter(activeFilter);
  const metrics = buildOrderedWorkbenchMetrics(results);

  summaryEl.innerHTML = `
    ${metrics.map((metric) => `
      <button
        class="metric metric-button metric-key-${escapeHtml(metric.key)} ${metric.tone} ${metric.key === activeFilter ? 'active' : ''}"
        type="button"
        aria-label="${escapeHtml(metric.openLabel)}"
        title="${escapeHtml(metric.openLabel)}"
        data-filter="${escapeHtml(metric.key)}"
      >
        <span>${displayText(metric.label)}</span>
        <strong>${metric.count}</strong>
        ${metric.sourceStatus ? `<small>${displayText(metric.sourceStatus)}</small>` : ''}
      </button>
    `).join('')}
  `;

  summaryEl.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = normalizeWorkbenchFilter(button.dataset.filter);
      mailboxOpenSections[mailboxSectionForFilter(activeFilter)] = true;
      selectedId = firstVisibleMailboxMailId(results, activeFilter) || selectedId;
      render();
    });
  });
}

function mailboxCount(results, filterKey) {
  return filterWorkbenchMails(results, filterKey, { reviews }).length;
}

function filterByMailboxSearch(rows) {
  const query = mailboxSearchQuery.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((mail) => mailSearchText(mail).includes(query));
}

function visibleMailboxResults(results, filterKey = activeFilter) {
  return filterByMailboxSearch(filterWorkbenchMails(results, filterKey, { reviews }));
}

function firstVisibleMailboxMailId(results, filterKey = activeFilter) {
  return visibleMailboxResults(Array.isArray(results) ? results : [], filterKey)[0]?.id || null;
}

function mailboxSectionForFilter(filterKey) {
  const normalizedFilter = normalizeWorkbenchFilter(filterKey);
  if (normalizedFilter === 'urgent') return 'urgent';
  if (['inbox', 'low_risk', 'medium_risk'].includes(normalizedFilter)) return 'inbox';
  if (['favorite', 'sent', 'archived', 'deleted', 'spam'].includes(normalizedFilter)) return normalizedFilter;
  return 'inbox';
}

function mailboxFilterLabel(filterKey) {
  const labels = {
    inbox: '收件箱',
    urgent: '需紧急处理',
    low_risk: '低风险',
    medium_risk: '中风险',
    favorite: '收藏',
    sent: '已发送',
    archived: '已归档',
    deleted: '已删除',
    spam: '垃圾邮件',
  };
  return labels[normalizeWorkbenchFilter(filterKey)] || '当前队列';
}

function renderMailboxNavigation(results) {
  if (!mailboxNavEl) return;

  const countKeys = [
    'urgent',
    'inbox',
    'low_risk',
    'medium_risk',
    'favorite',
    'sent',
    'archived',
    'deleted',
    'spam',
  ];

  countKeys.forEach((key) => {
    mailboxNavEl.querySelectorAll(`[data-mailbox-count="${key}"]`).forEach((node) => {
      node.textContent = mailboxCount(results, key);
    });
  });

  const searchInput = mailboxNavEl.querySelector('[data-mailbox-search]');
  if (searchInput) {
    if (searchInput.value !== mailboxSearchQuery) {
      searchInput.value = mailboxSearchQuery;
    }
    if (searchInput.dataset.boundMailboxSearch !== 'true') {
      searchInput.dataset.boundMailboxSearch = 'true';
      searchInput.addEventListener('input', (event) => {
        mailboxSearchQuery = event.currentTarget.value;
        const currentResults = classifiedMails();
        selectedId = firstVisibleMailboxMailId(currentResults, activeFilter) || selectedId;
        overviewOpen = false;
        render();
        const nextInput = document.querySelector('[data-mailbox-search]');
        nextInput?.focus();
        nextInput?.setSelectionRange(mailboxSearchQuery.length, mailboxSearchQuery.length);
      });
    }
  }

  const selectedMail = results.find((mail) => mail.id === selectedId);
  const contactPanel = mailboxNavEl.querySelector('[data-mailbox-contact-panel]');
  if (contactPanel) {
    contactPanel.hidden = !mailboxContactPanelOpen;
    contactPanel.innerHTML = `
      <strong>联系人</strong>
      <span>${displayText(selectedMail?.sender, '未选择邮件')}</span>
      <small>${displayText(selectedMail?.mailboxAccount || selectedMail?.recipient || apiConfigDraft.mailboxAddress, '当前邮箱账号')}</small>
    `;
  }

  const listPanel = mailboxNavEl.querySelector('[data-mailbox-list-panel]');
  if (listPanel) {
    listPanel.hidden = !mailboxListPanelOpen;
    listPanel.innerHTML = `
      <strong>列表视图</strong>
      <span>当前：${displayText(mailboxFilterLabel(activeFilter))}</span>
      <small>${mailboxSearchQuery.trim() ? `搜索：${displayText(mailboxSearchQuery.trim())}` : '未输入搜索关键词'}</small>
    `;
  }

  mailboxNavEl.querySelector('[data-mailbox-contact]')?.classList.toggle('active', mailboxContactPanelOpen);
  mailboxNavEl.querySelector('[data-mailbox-list-toggle]')?.classList.toggle('active', mailboxListPanelOpen);

  const contactButton = mailboxNavEl.querySelector('[data-mailbox-contact]');
  if (contactButton && contactButton.dataset.boundMailboxContact !== 'true') {
    contactButton.dataset.boundMailboxContact = 'true';
    contactButton.addEventListener('click', () => {
      mailboxContactPanelOpen = !mailboxContactPanelOpen;
      if (mailboxContactPanelOpen) mailboxListPanelOpen = false;
      renderMailboxNavigation(classifiedMails());
    });
  }

  const listButton = mailboxNavEl.querySelector('[data-mailbox-list-toggle]');
  if (listButton && listButton.dataset.boundMailboxList !== 'true') {
    listButton.dataset.boundMailboxList = 'true';
    listButton.addEventListener('click', () => {
      mailboxListPanelOpen = !mailboxListPanelOpen;
      if (mailboxListPanelOpen) mailboxContactPanelOpen = false;
      renderMailboxNavigation(classifiedMails());
    });
  }

  mailboxNavEl.querySelectorAll('[data-mailbox-section]').forEach((section) => {
    const sectionKey = section.dataset.mailboxSection;
    const isOpen = mailboxOpenSections[sectionKey] !== false;
    section.classList.toggle('open', isOpen);
    const submenu = section.querySelector(`[data-mailbox-submenu="${sectionKey}"]`);
    if (submenu) submenu.hidden = !isOpen;
    const toggle = section.querySelector(`[data-mailbox-section-toggle="${sectionKey}"]`);
    if (toggle) toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  mailboxNavEl.querySelectorAll('[data-mailbox-section-toggle]').forEach((button) => {
    const sectionKey = button.dataset.mailboxSectionToggle;
    button.classList.toggle('active', mailboxSectionForFilter(activeFilter) === sectionKey);
    if (button.dataset.boundMailboxSection === 'true') return;
    button.dataset.boundMailboxSection = 'true';
    button.addEventListener('click', () => {
      const currentResults = classifiedMails();
      const filterKey = normalizeWorkbenchFilter(button.dataset.mailboxFilter || sectionKey);
      mailboxOpenSections[sectionKey] = mailboxOpenSections[sectionKey] === false;
      activeFilter = filterKey;
      selectedId = firstVisibleMailboxMailId(currentResults, activeFilter) || selectedId;
      overviewOpen = false;
      render();
    });
  });

  mailboxNavEl.querySelectorAll('[data-mailbox-filter]').forEach((button) => {
    if (button.dataset.mailboxSectionToggle) return;
    const filterKey = normalizeWorkbenchFilter(button.dataset.mailboxFilter);
    button.classList.toggle('active', filterKey === activeFilter);
    if (button.dataset.boundMailboxFilter === 'true') return;
    button.dataset.boundMailboxFilter = 'true';
    button.addEventListener('click', () => {
      const currentResults = classifiedMails();
      activeFilter = normalizeWorkbenchFilter(button.dataset.mailboxFilter);
      mailboxOpenSections[mailboxSectionForFilter(activeFilter)] = true;
      selectedId = firstVisibleMailboxMailId(currentResults, activeFilter) || selectedId;
      overviewOpen = false;
      render();
    });
  });
}

function renderSettingsShell() {
  if (!settingsPanelEl) return;

  const settingsNavItems = visibleSettingsPrimaryItems();
  const settingsCommands = visibleSettingsCommands();
  activeSettingsPrimary = settingsPrimaryKeyForCommand(activeSettingsPrimary, settingsNavItems);
  const activePrimary = findSettingsPrimary(activeSettingsPrimary, settingsNavItems);
  const hasChildren = Boolean(activePrimary.children?.length);
  if (!hasChildren && expandedSettingsPrimary === activePrimary.key) {
    expandedSettingsPrimary = '';
  }
  if (!activePrimary.commandKeys?.includes(activeSettingsCommand)) {
    activeSettingsCommand = activePrimary.key;
  }
  const activeCommand = activePrimary.key === SYSTEM_RULE_SETTINGS_KEY
    ? null
    : findSettingsCommand(activeSettingsCommand, settingsCommands);

  settingsPanelEl.classList.toggle('open', settingsOpen);
  settingsPanelEl.setAttribute('aria-hidden', settingsOpen ? 'false' : 'true');
  settingsBackdropEl?.classList.toggle('open', settingsOpen);
  document.body.classList.toggle('settings-mode', settingsOpen);

  if (settingsPrimaryNavEl) {
    settingsPrimaryNavEl.innerHTML = settingsNavItems.map((item) => {
      const childMenuOpen = expandedSettingsPrimary === item.key;
      return `
      <div class="settings-nav-group ${item.key === activePrimary.key ? 'active' : ''}" data-settings-nav-group="${escapeHtml(item.key)}">
        <button class="settings-primary-item ${item.key === activePrimary.key && activeSettingsCommand === item.key ? 'active' : ''}" type="button" data-settings-primary="${escapeHtml(item.key)}">
          <strong>${displayText(item.label)}</strong>
          <small>${displayText(item.summary)}</small>
        </button>
        ${childMenuOpen && item.children?.length ? `
          <div class="settings-sub-nav" data-settings-submenu="${escapeHtml(item.key)}">
            ${item.children.map((child) => {
              const isRuleChild = Boolean(child.ruleKey);
              const isActiveChild = isRuleChild
                ? emailRuleControlOpen && child.ruleKey === activeEmailRuleTab
                : child.key === activeSettingsCommand;
              const actionAttribute = isRuleChild
                ? `data-settings-rule="${escapeHtml(child.ruleKey)}"`
                : `data-settings-command="${escapeHtml(child.key)}"`;
              return `
              <button class="settings-sub-item ${isRuleChild ? 'settings-rule-item' : ''} ${isActiveChild ? 'active' : ''}" type="button" ${actionAttribute}>
                <strong>${displayText(child.label)}</strong>
                <small>${displayText(child.summary)}</small>
              </button>
            `;
            }).join('')}
          </div>
        ` : ''}
      </div>
    `;
    }).join('');

    settingsPrimaryNavEl.querySelectorAll('[data-settings-primary]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextPrimaryKey = button.dataset.settingsPrimary;
        const nextPrimary = findSettingsPrimary(nextPrimaryKey, settingsNavItems);
        activeSettingsPrimary = nextPrimaryKey;
        activeSettingsCommand = activeSettingsPrimary;
        expandedSettingsPrimary = nextPrimary.children?.length
          ? (expandedSettingsPrimary === nextPrimaryKey ? '' : nextPrimaryKey)
          : '';
        settingsOpen = true;
        renderSettingsShell();
      });
    });

    settingsPrimaryNavEl.querySelectorAll('[data-settings-command]').forEach((button) => {
      button.addEventListener('click', () => {
        activeSettingsCommand = button.dataset.settingsCommand;
        activeSettingsPrimary = settingsPrimaryKeyForCommand(activeSettingsCommand, settingsNavItems);
        expandedSettingsPrimary = activeSettingsPrimary;
        settingsOpen = true;
        renderSettingsShell();
      });
    });

    settingsPrimaryNavEl.querySelectorAll('[data-settings-rule]').forEach((button) => {
      button.addEventListener('click', () => {
        activeSettingsPrimary = SYSTEM_RULE_SETTINGS_KEY;
        activeSettingsCommand = `${SYSTEM_RULE_SETTING_COMMAND_PREFIX}${button.dataset.settingsRule}`;
        expandedSettingsPrimary = SYSTEM_RULE_SETTINGS_KEY;
        settingsOpen = false;
        overviewOpen = false;
        renderSettingsShell();
        openEmailRuleControl(button.dataset.settingsRule, selectedMailForRuleNavigation());
      });
    });
  }

  settingsPanelEl.querySelectorAll('[data-settings-section]').forEach((section) => {
    const visible = activeCommand?.sectionKey === section.dataset.settingsSection;
    section.hidden = !visible;
  });

  if (settingsEmptyEl) {
    settingsEmptyEl.hidden = Boolean(activeCommand);
    settingsEmptyEl.classList.toggle('settings-rule-empty', activePrimary.key === SYSTEM_RULE_SETTINGS_KEY);
    const titleEl = settingsEmptyEl.querySelector('h2');
    const textEl = settingsEmptyEl.querySelector('p');
    if (titleEl) titleEl.textContent = activePrimary.label;
    if (textEl) {
      textEl.textContent = activePrimary.key === SYSTEM_RULE_SETTINGS_KEY
        ? '请选择左侧系统规则项，进入对应规则的新增、修改、停用或删除配置。'
        : '请选择左侧设置项查看具体配置。';
    }
  }

  renderAccountSession();
  renderEmailAIAdminAuth();
  renderEmailAISettingsStatus();

  if (activeCommand?.emailAITab) {
    mountEmailAISettingsControl(activeCommand.emailAITab);
  }
}

function renderSafety(results) {
  const issues = apiState.sourceStatus === '真实接入' ? [] : validateSamples(mails);
  const hasUnsafeSend = results.some((mail) => mail.allowsRealSend);
  const highRiskAutoReply = results.some((mail) => {
    const riskState = getMailRiskState(mail);
    return riskState.urgent && riskState.sourceAction === 'auto_reply';
  });
  const spamSendable = results.some((mail) => getMailRiskState(mail).spam && mail.queueItem.canEnterQueue);
  const sendSummary = summarizeSendGuards(results.map((mail) => mail.sendGuard));
  const aiControlReady = results.some((mail) => mail.aiResult?.success);
  const apiReadiness = buildApiReadiness({
    config: apiConfigDraft,
    permissions: apiPermissions,
  });

  const checks = [
    {
      ok: !hasUnsafeSend,
      text: '模板不会绕过服务端写操作护栏',
    },
    {
      ok: !highRiskAutoReply,
      text: '高风险不会自动回复',
    },
    {
      ok: !spamSendable,
      text: '垃圾 / 骚扰邮件不进入发送队列',
    },
    {
      ok: issues.length === 0,
      text: apiState.sourceStatus === '真实接入'
        ? '真实邮件仅通过本地代理读取，前端不保存凭证'
        : '真实邮箱未读取，当前不展示本地样例数据',
    },
    {
      ok: !apiState.write?.hardDeleteEnabled,
      text: '生产邮箱不开放不可恢复硬删除',
    },
    {
      ok: sendSummary.duplicate >= 1 && sendSummary.threadMismatch >= 1,
      text: '重复回复和线程错配会被拦截',
    },
    {
      ok: apiReadiness.secretIssues.length === 0,
      text: 'API 配置未保存 App Secret / token / 密码',
    },
    {
      ok: aiControlReady || !results.length,
      text: aiControlReady
        ? 'AI 模型、知识库和输出安全规则由后台已发布版本提供'
        : '未读取到后台 AI 处理结果时，前台只使用本地兜底规则',
    },
  ];

  safetyEl.innerHTML = `
    ${checks.map((check) => `
      <li class="${check.ok ? 'ok' : 'bad'}">
        <span>${check.ok ? '通过' : '需处理'}</span>
        ${check.text}
      </li>
    `).join('')}
    ${issues.map((issue) => `
      <li class="bad"><span>需处理</span>${issue}</li>
    `).join('')}
  `;
}

function renderApiConfig() {
  const apiReadiness = buildApiReadiness({
    config: apiConfigDraft,
    permissions: apiPermissions,
  });

  apiConfigEl.innerHTML = `
    <div class="api-status">
      <strong>${apiState.statusText}</strong>
      <small>真实发送：${apiState.write?.realSendEnabled ? '受控开放' : '关闭'} · 自动归档：${apiState.write?.realArchiveEnabled ? '受控开放' : '关闭'}</small>
    </div>
    <ul class="config-list">
      <li class="${apiState.apiProxyAvailable ? 'ok' : 'bad'}">
        <span>${apiState.apiProxyAvailable ? '可用' : '未启动'}</span>
        <div>
          <strong>本地 API 代理</strong>
          <small>${apiState.note}</small>
        </div>
      </li>
      <li class="${apiState.configured ? 'ok' : 'bad'}">
        <span>${apiState.configured ? '已配置' : '待配置'}</span>
        <div>
          <strong>飞书只读配置</strong>
          <small>${apiState.missing?.length ? `缺少：${apiState.missing.join('、')}` : '环境变量已就绪，可尝试只读读取。'}</small>
        </div>
      </li>
      <li class="${apiState.messagesLoaded ? 'ok' : 'bad'}">
        <span>${apiState.messagesLoaded ? '已读取' : '未读取'}</span>
        <div>
          <strong>邮件来源</strong>
          <small>${apiState.messagesLoaded ? `已读取 ${apiState.fetchedCount} 封真实飞书邮件。` : '未读取真实飞书邮箱；当前列表为空。'}</small>
        </div>
      </li>
      <li class="${apiState.userTokenAutoRefreshReady ? 'ok' : 'bad'}">
        <span>${apiState.userTokenAutoRefreshReady ? '可续期' : '需授权'}</span>
        <div>
          <strong>发送授权续期</strong>
          <small>${
            apiState.userTokenAutoRefreshReady
              ? `refresh token 已保存${apiState.userAccessTokenExpiresAt ? `；当前 token 到期 ${displayText(apiState.userAccessTokenExpiresAt)}` : '，过期时会自动刷新。'}`
              : '缺少 refresh token，请打开授权入口完成一次带 offline_access 的授权。'
          }</small>
        </div>
      </li>
      ${apiReadiness.configChecks.map((check) => `
        <li class="${check.ok ? 'ok' : 'bad'}">
          <span>${check.ok ? '通过' : '缺少'}</span>
          <div>
            <strong>${check.label}</strong>
            <small>${apiConfigDraft[check.key] || check.detail}</small>
          </div>
        </li>
      `).join('')}
      ${apiReadiness.permissionChecks.map((check) => `
        <li class="${check.ok ? 'ok' : 'bad'}">
          <span>${check.ok ? '允许' : '关闭'}</span>
          <div>
            <strong>${check.label}</strong>
            <small>${check.description}</small>
          </div>
        </li>
      `).join('')}
      <li class="${apiReadiness.secretIssues.length === 0 ? 'ok' : 'bad'}">
        <span>${apiReadiness.secretIssues.length === 0 ? '通过' : '拦截'}</span>
        <div>
          <strong>敏感字段</strong>
          <small>${apiReadiness.secretIssues[0] || '不在工作台保存 App Secret、token、邮箱密码。'}</small>
        </div>
      </li>
    </ul>
    <ul class="config-list">
      <li class="${apiState.write?.writeEnabled ? 'ok' : 'bad'}">
        <span>${apiState.write?.writeEnabled ? '开启' : '暂停'}</span>
        <div>
          <strong>真实写操作总开关</strong>
          <small>发送：${apiState.write?.sendEnabled ? '开启' : '关闭'}；归档：${apiState.write?.archiveEnabled ? '开启' : '关闭'}；高风险审批后回复：${apiState.write?.highRiskSendEnabled ? '开启' : '关闭'}</small>
        </div>
      </li>
      <li class="${apiState.write?.customerReplyOriginalSenderEnabled || apiState.write?.allowlistCount > 0 ? 'ok' : 'bad'}">
        <span>${apiState.write?.customerReplyOriginalSenderEnabled ? '开启' : apiState.write?.allowlistCount > 0 ? '特批' : '关闭'}</span>
        <div>
          <strong>客户回复安全策略</strong>
          <small>原始来信人回复：${apiState.write?.customerReplyOriginalSenderEnabled ? '开启' : '关闭'}；特殊授权名单 ${apiState.write?.allowlistCount || 0} 个；每日发送限额 ${apiState.write?.dailySendLimit || 0}。</small>
        </div>
      </li>
      <li class="${apiState.write?.hardDeleteEnabled ? 'bad' : 'ok'}">
        <span>${apiState.write?.hardDeleteEnabled ? '危险' : '关闭'}</span>
        <div>
          <strong>硬删除</strong>
          <small>生产邮箱仅支持归档 / 移箱，不开放不可恢复删除。</small>
        </div>
      </li>
    </ul>
    <p class="muted">真实写操作只在本地服务端执行；前端不保存 App Secret、token 或 user access token。</p>
  `;
}

function renderWriteActions(mail) {
  const write = apiState.write || defaultApiState.write;
  const riskState = getMailRiskState(mail);
  const result = writeActionResults[mail.id];
  const review = reviews[mail.id];
  const replyContent = currentReplyContent(mail);
  const canShowSend = !riskState.spam;
  const canShowArchive = riskState.spam;
  const approvalText = mail.requiresReview || riskState.urgent
    ? (review?.decision === 'reasonable' ? '已审批' : '待审批')
    : '无需审批';

  return `
    <section class="panel-section real-action-card">
      <h3>真实动作</h3>
      <div class="decision-grid">
        <div>
          <span>写操作</span>
          <strong>${write.writeEnabled ? '总开关开启' : '总开关暂停'}</strong>
          <small>发送 ${write.sendEnabled ? '开启' : '关闭'} · 归档 ${write.archiveEnabled ? '开启' : '关闭'} · 原始来信人 ${write.customerReplyOriginalSenderEnabled ? '开启' : '关闭'} · 特殊名单 ${write.allowlistCount || 0}</small>
        </div>
        <div>
          <span>审批状态</span>
          <strong>${approvalText}</strong>
          <small>中风险、高风险、退款/赔偿类必须审批后发送；服务端会再次校验。</small>
        </div>
      </div>
      <div class="real-action-buttons">
        ${canShowSend ? `
          <button
            class="primary-button action-button"
            type="button"
            data-real-action="send"
            ${write.sendEnabled && replyContent ? '' : 'disabled'}
          >真实发送邮件</button>
        ` : ''}
        ${canShowArchive ? `
          <button
            class="secondary-button action-button"
            type="button"
            data-real-action="archive"
            ${write.archiveEnabled ? '' : 'disabled'}
          >归档 / 移箱</button>
        ` : ''}
      </div>
      ${result ? `
        <div class="action-result ${result.ok ? 'ok' : 'bad'}">
          <strong>${result.ok ? '最近动作成功' : '最近动作被拦截 / 失败'}</strong>
          <small>${displayText(result.message || result.mode || result.action || '已记录审计日志。')}</small>
        </div>
      ` : '<p class="muted">真实动作会写入本地审计日志；服务端不会返回任何密钥。</p>'}
    </section>
  `;
}

function renderLaunchChecklist(results) {
  const apiReadiness = buildApiReadiness({
    config: apiConfigDraft,
    permissions: apiPermissions,
  });
  const workflowSummary = summarizeDraftWorkflow(results.map((mail) => mail.queueItem));
  const launchChecklist = buildLaunchChecklist({
    apiReadiness,
    workflowSummary,
    testStatus,
    docsUpdated: true,
    templateLibraryReady: true,
    rollbackPlanReady: false,
    productionSendApproved: false,
  });

  launchChecklistEl.innerHTML = `
    <div class="api-status">
      <strong>${launchChecklist.readyForReadApi ? '可进入只读 API 接入准备' : 'API 接入仍有阻塞'}</strong>
      <small>真实发送：${apiState.write?.realSendEnabled ? '服务端受控开放' : launchChecklist.readyForRealSend ? '可评估开放' : '待开关/权限'}</small>
    </div>
    <ul class="config-list">
      ${launchChecklist.items.map((item) => `
        <li class="${item.status === 'done' ? 'ok' : 'bad'}">
          <span>${item.status === 'done' ? '完成' : '阻塞'}</span>
          <div>
            <strong>${item.label}</strong>
            <small>${item.detail}</small>
          </div>
        </li>
      `).join('')}
    </ul>
  `;
}

function renderQueue(results) {
  if (!queueEl) return;
  const queueItems = buildQueueNavigationItems(results);

  queueEl.innerHTML = queueItems.length
    ? queueItems.map((item) => `
      <li>
        <button class="queue-button" type="button" data-queue-mail-id="${escapeHtml(item.mailId)}">
          <span>打开</span>
          <div>
            <strong>${displayText(item.mailId)} · ${displayText(item.templateId)}</strong>
            <small>${displayText(item.subject)}</small>
          </div>
        </button>
      </li>
    `).join('')
    : '<li><span>空</span><div><strong>暂无可入队草稿</strong><small>低风险或已审核草稿会进入这里。</small></div></li>';

  queueEl.querySelectorAll('[data-queue-mail-id]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = 'queue';
      selectedId = button.dataset.queueMailId;
      render();
    });
  });
}

function renderMailboxSwitcher() {
  if (!mailboxSwitcherEl) return;

  const tokenStatusClass = apiState.userTokenAutoRefreshReady ? 'ok' : 'bad';
  const tokenStatusText = apiState.userTokenAutoRefreshReady ? '自动续期已就绪' : '需要重新授权';

  mailboxSwitcherEl.innerHTML = `
    <form class="connection-form" data-mailbox-switch-form>
      <div class="api-status">
        <strong>当前邮箱：${displayText(apiState.mailboxAddress || '未读取邮箱地址')}</strong>
        <small>App：${displayText(apiState.appIdMasked || '未配置')}</small>
        <small>报告机器人接收人：${displayText(apiState.botReportEmail || '未配置')}</small>
      </div>
      <div class="connection-status ${tokenStatusClass}">
        <strong>${tokenStatusText}</strong>
        <small>${apiState.userTokenAutoRefreshReady
          ? '已保存 refresh token，发送和归档时会自动续期。'
          : '缺少 refresh token，保存新配置后请打开飞书授权入口。'}</small>
      </div>

      <section class="connection-section mailbox-config-section">
        <div class="connection-section-heading">
          <strong>飞书应用</strong>
          <small>更换飞书应用或重置应用密钥时填写。</small>
        </div>
        <div class="connection-field-grid">
          <div class="field">
            <label for="feishu-app-id">App ID <span>更换应用时填</span></label>
            <input id="feishu-app-id" name="appId" autocomplete="off" placeholder="例：cli_xxxxxxxxxxxxxxxx；不更换应用可留空" />
            <small>不更换应用可以留空。完整 App ID 不在页面回显。</small>
          </div>
          <div class="field">
            <label for="feishu-app-secret">App Secret <span>重置密钥时填</span></label>
            <input id="feishu-app-secret" name="appSecret" type="password" autocomplete="new-password" placeholder="粘贴新应用的 App Secret；不修改可留空" />
            <small>只写入本机服务端配置，不保存到浏览器。</small>
          </div>
        </div>
      </section>

      <section class="connection-section mailbox-config-section">
        <div class="connection-section-heading">
          <strong>邮箱账号</strong>
          <small>工作台读取、回复、归档和报告提醒使用这些地址。</small>
        </div>
        <div class="connection-field-grid">
          <div class="field">
            <label for="feishu-mailbox-address">工作台邮箱 <span>必填</span></label>
            <input id="feishu-mailbox-address" name="mailboxAddress" autocomplete="email" placeholder="例：ayu@vitashinelab.com" value="${escapeHtml(apiState.mailboxAddress || '')}" />
            <small>用于读取邮件、回复和归档。</small>
          </div>
          <div class="field">
            <label for="feishu-bot-report-email">报告接收人 <span>可同邮箱</span></label>
            <input id="feishu-bot-report-email" name="botReportEmail" autocomplete="email" placeholder="例：ayu@vitashinelab.com" value="${escapeHtml(apiState.botReportEmail || apiState.mailboxAddress || '')}" />
            <small>处理报告和异常提醒会发给这个飞书用户。</small>
          </div>
        </div>
      </section>

      <section class="connection-section mailbox-config-section">
        <div class="connection-section-heading">
          <strong>保存与授权</strong>
          <small>保存本机配置后，按需重新打开飞书授权入口。</small>
        </div>
        <label class="inline-check connection-check">
          <input type="checkbox" name="resetAuth" />
          <span>清空旧授权并重新授权</span>
        </label>
        <small class="field-hint">更换 App、邮箱或授权用户时勾选；只改报告接收人不用勾选。</small>
        <div class="connection-actions">
          <button class="secondary-button" type="submit">保存本地配置</button>
          <a class="secondary-button" href="${apiUrl('/oauth/start?state=mail-workbench')}">打开飞书授权入口</a>
        </div>
      </section>
    </form>
  `;

  mailboxSwitcherEl.querySelector('[data-mailbox-switch-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      appId: String(formData.get('appId') || '').trim(),
      appSecret: String(formData.get('appSecret') || '').trim(),
      mailboxAddress: String(formData.get('mailboxAddress') || '').trim(),
      botReportEmail: String(formData.get('botReportEmail') || '').trim(),
      resetAuth: Boolean(formData.get('resetAuth')),
    };

    try {
      const response = await fetch(apiUrl('/api/feishu/config/update'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      alert(result.ok
        ? `配置已保存${result.resetAuth ? '，请重新授权。' : '。'}`
        : (result.message || result.error || '配置保存失败。'));
      loadFeishuApiMessages({ preserveSelection: true });
    } catch (error) {
      alert(`配置保存失败：${error.message}`);
    }
  });
}

function renderList(results) {
  const visibleResults = visibleMailboxResults(results, activeFilter);
  const activeSection = mailboxSectionForFilter(activeFilter);
  const targetListEl = mailboxInlineListEls.find((node) => node.dataset.mailboxInlineList === activeSection) || listEl;
  const sectionOpen = mailboxOpenSections[activeSection] !== false;

  if (listEl && listEl !== targetListEl) {
    listEl.innerHTML = '';
  }

  mailboxInlineListEls.forEach((node) => {
    node.hidden = true;
    node.innerHTML = '';
  });

  if (!targetListEl || !sectionOpen) return;

  targetListEl.hidden = false;

  if (!visibleResults.length) {
    targetListEl.innerHTML = `
      <div class="empty-list compact-empty-list">
        <strong>当前队列暂无邮件</strong>
        <span>${mailboxSearchQuery.trim() ? '当前搜索没有匹配邮件，可以清空关键词或切换分类。' : '当前分类没有可打开邮件，可以回到收件箱继续处理。'}</span>
        <button class="secondary-button compact-button" type="button" data-reset-filter>返回收件箱</button>
      </div>
    `;
    targetListEl.querySelector('[data-reset-filter]')?.addEventListener('click', () => {
      mailboxSearchQuery = '';
      activeFilter = 'inbox';
      mailboxOpenSections.inbox = true;
      settingsOpen = false;
      closeEmailRuleControl();
      selectedId = firstVisibleMailboxMailId(results, activeFilter) || selectedId;
      render();
    });
    return;
  }

  targetListEl.innerHTML = visibleResults.map((mail) => {
    const processingStatus = getWorkbenchProcessingStatus(mail);
    const riskState = getMailRiskState(mail);

    return `
      <button class="mail-row compact-mail-row lane-${riskState.lane} status-${processingStatus.status} ${mail.id === selectedId ? 'active' : ''}" data-id="${escapeHtml(mail.id)}">
        <span class="row-top">
          <strong>${displayText(mail.subject, '(无标题)')}</strong>
          <em class="risk risk-${riskState.risk}">${displayText(riskState.label || riskText[riskState.risk])}</em>
        </span>
        <span class="row-meta">${displayText(mail.sender, '未知发件人')}</span>
        <span class="row-bottom">
          <small>${displayText(mail.receivedAt, '刚刚')}</small>
          <small class="status-pill status-pill-${processingStatus.status}">${displayText(processingStatus.label || processingStatusText[processingStatus.status])}</small>
        </span>
      </button>
    `;
  }).join('');

  targetListEl.querySelectorAll('.mail-row').forEach((button) => {
    button.addEventListener('click', () => {
      selectedId = button.dataset.id;
      render();
    });
  });
}

function renderDetail(results) {
  const mail = results.find((item) => item.id === selectedId) || results[0];
  if (!mail) {
    detailEl.innerHTML = `
      <div class="empty-detail">
        <strong>当前分类暂无邮件</strong>
        <span>换一个左侧分类，或返回全部邮件。</span>
        <button class="secondary-button compact-button" type="button" data-reset-filter>返回收件箱</button>
      </div>
    `;
    detailEl.querySelector('[data-reset-filter]')?.addEventListener('click', () => {
      mailboxSearchQuery = '';
      activeFilter = 'inbox';
      mailboxOpenSections.inbox = true;
      settingsOpen = false;
      closeEmailRuleControl();
      selectedId = firstVisibleMailboxMailId(classifiedMails(), activeFilter) || selectedId;
      render();
    });
    return;
  }

  maybeAlertHighRisk(mail);

  detailEl.innerHTML = `
    <div class="detail-heading">
      <div>
        <p class="eyebrow">${displayText(mail.id)}</p>
        <h2>${displayText(mail.subject, '(无标题)')}</h2>
        <p>${displayText(mail.sender, '未知发件人')} · ${displayText(mail.receivedAt, '刚刚')}</p>
      </div>
    </div>

    ${renderMailContentPanel(mail)}

    ${renderRiskOverridePanel(mail)}

    ${renderManualArchivePanel(mail)}

    ${renderReplyComposer(mail)}

    ${renderMailRuleShortcuts(mail)}
  `;

  const reviewForm = detailEl.querySelector('[data-review-form]');
  reviewForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(reviewForm);
    reviews = upsertReview(reviews, {
      mailId: reviewForm.dataset.mailId,
      decision: formData.get('decision'),
      note: formData.get('note').trim(),
    });
    saveReviews();
    syncApproval(mail, reviews[mail.id]);
    render();
  });

  detailEl.querySelector('[data-confirm-risk-override]')?.addEventListener('click', () => {
    const selectedRisk = detailEl.querySelector('input[name="riskOverride"]:checked')?.value || null;
    updateRiskOverride(mail, selectedRisk);
  });

  detailEl.querySelector('[data-confirm-manual-archive]')?.addEventListener('click', () => {
    const checked = detailEl.querySelector('[data-manual-archive-toggle]')?.checked === true;
    updateManualArchiveSelection(mail, checked);
  });

  detailEl.querySelectorAll('[data-open-email-rule]').forEach((button) => {
    button.addEventListener('click', () => {
      openEmailRuleControl(button.dataset.openEmailRule, mail);
    });
  });

  wireReplyComposer(mail);
}

function updateManualArchiveSelection(mail, checked) {
  const note = detailEl.querySelector('[data-manual-archive-note]')?.value.trim() || '';
  const confirmedAt = new Date().toISOString();
  const confirmation = confirmManualArchiveSelection(manualArchiveSelections, mail, {
    checked,
    note,
    updatedAt: confirmedAt,
  });

  manualArchiveSelections = confirmation.selections;
  saveManualArchiveSelections();
  if (confirmation.result) {
    writeActionResults = {
      ...writeActionResults,
      [mail.id]: confirmation.result,
    };
    saveWriteActionResults();
    playSoundEffects(soundEffectsForActionResult(confirmation.result));
    alert(confirmation.result.message);
  } else {
    alert('已取消手动归档设置。');
  }
  render();
}

function markLocalManualArchive(mail) {
  const result = buildManualArchiveCompletionResult(mail, {
    message: '服务端归档未开启，已先在工作台标记为手动归档完成。',
  });
  writeActionResults = {
    ...writeActionResults,
    [mail.id]: result,
  };
  saveWriteActionResults();
  playSoundEffects(soundEffectsForActionResult(result));
  alert(result.message);
  render();
}

function readReplyComposer(mail) {
  const select = detailEl.querySelector('[data-reply-candidate-select]');
  const editor = detailEl.querySelector('[data-reply-editor]');
  const candidateId = select?.value || selectedReplyCandidate(mail)?.candidateId || '';
  const content = editor?.value.trim() || '';

  return { candidateId, content };
}

function saveReplyComposerSelection(mail, { silent = false } = {}) {
  const riskState = getMailRiskState(mail);
  const { candidateId, content } = readReplyComposer(mail);

  if (!candidateId && !riskState.spam) {
    alert('请先选择一条回复内容。');
    return null;
  }

  if (!content && !riskState.spam) {
    alert('回复正文不能为空。');
    return null;
  }

  if (candidateId) {
    candidateSelections = {
      ...candidateSelections,
      [mail.id]: {
        candidateId,
        content,
        updatedAt: new Date().toISOString(),
      },
    };
    saveCandidateSelections();
  }

  if (!silent) {
    alert('已保存当前回复内容。');
  }

  return { candidateId, content };
}

function wireReplyComposer(mail) {
  const select = detailEl.querySelector('[data-reply-candidate-select]');
  const editor = detailEl.querySelector('[data-reply-editor]');

  select?.addEventListener('change', () => {
    const candidate = (mail.replyCandidates || [])
      .find((item) => item.candidateId === select.value);
    if (editor && candidate) {
      editor.value = candidate.content;
    }
  });

  detailEl.querySelector('[data-save-reply]')?.addEventListener('click', () => {
    saveReplyComposerSelection(mail);
    render();
  });

  detailEl.querySelector('[data-approve-and-save]')?.addEventListener('click', () => {
    const saved = saveReplyComposerSelection(mail, { silent: true });
    if (!saved) return;

    reviews = upsertReview(reviews, {
      mailId: mail.id,
      decision: 'reasonable',
      note: reviews[mail.id]?.note || '已人工审核通过，可使用当前编辑回复；发送前仍由服务端校验原始来信人、开关和限额。',
    });
    saveReviews();
    syncApproval(mail, reviews[mail.id]);
    alert('已审核通过并保存当前回复。');
    render();
  });

  detailEl.querySelector('[data-send-selected]')?.addEventListener('click', async () => {
    const saved = saveReplyComposerSelection(mail, { silent: true });
    if (!saved) return;
    if ((mail.requiresReview || getMailRiskState(mail).urgent || mail.draftRecord?.requiresApproval)
      && reviews[mail.id]?.decision !== 'reasonable') {
      reviews = upsertReview(reviews, {
        mailId: mail.id,
        decision: 'reasonable',
        note: reviews[mail.id]?.note || '用户点击确认真实发送时完成前端审核确认；服务端仍需校验原始来信人、开关、限额和重复规则。',
      });
      saveReviews();
      await syncApproval(mail, reviews[mail.id]);
    }
    performRealAction('send', mail, saved.content);
  });

  detailEl.querySelector('[data-archive-selected]')?.addEventListener('click', () => {
    if (mail.manualArchive?.checked && !(apiState.write || defaultApiState.write).archiveEnabled) {
      markLocalManualArchive(mail);
      return;
    }
    performRealAction('archive', mail);
  });
}

async function syncApproval(mail, review) {
  if (!apiState.apiProxyAvailable || !review) return;

  try {
    await fetch(apiUrl('/api/feishu/mail/actions/approve'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mail,
        review,
        actor: 'local-operator',
      }),
    });
  } catch {
    // 审批同步失败不影响本地审核标记，发送时服务端仍会再次校验。
  }
}

async function syncRiskOverride(mail, override, { clear = false } = {}) {
  if (!apiState.apiProxyAvailable) return;

  await fetch(apiUrl('/api/feishu/mail/risk-overrides'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mailId: mail.id,
      messageId: mail.messageId || mail.id,
      risk: override?.risk,
      note: override?.note || '',
      clear,
      actor: 'local-operator',
    }),
  });
}

async function updateRiskOverride(mail, risk = null) {
  const nextOverrides = { ...riskOverrides };

  if (!risk) {
    delete nextOverrides[mail.id];
    if (mail.messageId) delete nextOverrides[mail.messageId];
    riskOverrides = nextOverrides;
    saveRiskOverrides();
    const nextSnapshots = { ...riskSnapshots };
    delete nextSnapshots[mail.id];
    if (mail.messageId) delete nextSnapshots[mail.messageId];
    riskSnapshots = nextSnapshots;
    saveRiskSnapshots();
    await syncRiskOverride(mail, null, { clear: true }).catch(() => {});
    render();
    return;
  }

  const override = {
    risk,
    note: `人工在工作台改判为 ${risk}。`,
    source: 'manual',
    updatedAt: new Date().toISOString(),
  };
  nextOverrides[mail.id] = override;
  if (mail.messageId) nextOverrides[mail.messageId] = override;
  riskOverrides = nextOverrides;
  saveRiskOverrides();
  await syncRiskOverride(mail, override).catch(() => {});
  render();
}

async function performRealAction(action, mail, contentOverride = null) {
  const endpoint = action === 'archive'
    ? '/api/feishu/mail/actions/archive'
    : '/api/feishu/mail/actions/send';
  const content = contentOverride ?? currentReplyContent(mail);

  try {
    const response = await fetch(apiUrl(endpoint), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mail,
        recipient: mail.sender,
        subject: mail.subject?.startsWith('Re:') ? mail.subject : `Re: ${mail.subject}`,
        content,
        review: reviews[mail.id] || null,
        actor: 'local-operator',
      }),
    });
    const payload = await response.json();
    const message = payload.ok
      ? `${action === 'archive' ? '归档 / 移箱' : '真实发送'}已完成。`
      : (payload.reasons?.[0] || payload.message || payload.error || '真实动作未放行。');

    writeActionResults = {
      ...writeActionResults,
      [mail.id]: {
        ok: Boolean(payload.ok),
        action,
        mode: payload.mode,
        message,
        updatedAt: new Date().toISOString(),
      },
    };
    saveWriteActionResults();
    playSoundEffects(soundEffectsForActionResult({
      ok: Boolean(payload.ok),
      action,
      mode: payload.mode,
    }));
    if (!payload.ok && isAutoProcessingSwitchFailure({
      ...payload,
      action,
      message,
    })) {
      showAutoProcessingSwitchReminder({
        ...payload,
        action,
        message,
      });
    } else {
      alert(message);
    }
    render();
  } catch (error) {
    writeActionResults = {
      ...writeActionResults,
      [mail.id]: {
        ok: false,
        action,
        mode: 'request_failed',
        message: error.message,
        updatedAt: new Date().toISOString(),
      },
    };
    saveWriteActionResults();
    playSoundEffects(soundEffectsForActionResult({
      ok: false,
      action,
      mode: 'request_failed',
    }));
    alert(`真实动作失败：${error.message}`);
    render();
  }
}

function mergeClosedLoopActionResults(payload) {
  const updatedAt = new Date().toISOString();
  const updates = {};

  (payload.items || []).forEach((item) => {
    updates[item.mailId] = {
      ok: ['sent', 'archived'].includes(item.status),
      action: item.operation,
      mode: item.mode || item.status,
      message: item.reasons?.[0] || loopStatusText[item.status] || item.status,
      updatedAt,
    };
  });

  writeActionResults = {
    ...writeActionResults,
    ...updates,
  };
  saveWriteActionResults();
}

async function runClosedLoopProcess(results) {
  try {
    const response = await fetch(apiUrl('/api/feishu/mail/actions/process'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mails: results.map(buildProcessMailPayload),
        reviews,
        selectedReplies: candidateSelections,
        runtimeControls: loopControls,
        actor: 'local-operator',
        agentConfig,
      }),
    });
    const payload = await response.json();

    closedLoopResult = {
      ...payload,
      updatedAt: new Date().toISOString(),
    };
    saveClosedLoopResult();

    if (payload.ok) {
      mergeClosedLoopActionResults(payload);
    }
    playSoundEffects(soundEffectsForClosedLoopPayload(payload));

    const switchFailure = findAutoProcessingSwitchFailure(payload);
    if (switchFailure) {
      showAutoProcessingSwitchReminder(switchFailure);
    } else {
      alert(payload.ok
        ? `自动处理完成：自动发送 ${payload.summary?.autoSent || 0}，归档 ${payload.summary?.archived || 0}，待审批 ${payload.summary?.pendingReview || 0}。`
        : (payload.message || payload.error || '自动处理未完成。'));
    }
    render();
  } catch (error) {
    closedLoopResult = {
      ok: false,
      action: 'process',
      summary: {
        total: 0,
        autoSent: 0,
        archived: 0,
        manualSent: 0,
        pendingReview: 0,
        blocked: 0,
        skipped: 0,
        failed: 1,
      },
      items: [],
      error: error.message,
      updatedAt: new Date().toISOString(),
    };
    saveClosedLoopResult();
    playSoundEffect('action_failed');
    alert(`自动处理失败：${error.message}`);
    render();
  }
}

function render() {
  const results = classifiedMails();
  activeFilter = normalizeWorkbenchFilter(activeFilter);
  const visibleResults = visibleMailboxResults(results, activeFilter);

  if (visibleResults.length && !visibleResults.some((mail) => mail.id === selectedId)) {
    selectedId = visibleResults[0].id;
  }

  if (apiModeEl) {
    apiModeEl.textContent = apiState.statusText;
  }
  renderSummary(results);
  renderOverviewDashboard(results);
  renderClosedLoopControl(results);
  renderQueue(results);
  renderMailboxSwitcher();
  renderEmailAISettingsStatus();
  renderSettingsShell();
  renderMailboxNavigation(results);
  renderList(results);
  renderDetail(visibleResults);
}

async function loadEmailAIStatus() {
  emailAIStatus = {
    ...emailAIStatus,
    loading: true,
    error: '',
  };
  renderEmailAISettingsStatus();

  try {
    const response = await fetch(apiUrl('/api/email-ai/status'), { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message || payload.error || 'AI 状态读取失败。');
    }
    emailAIStatus = {
      ...payload,
      loading: false,
      error: '',
    };
  } catch (error) {
    emailAIStatus = {
      loading: false,
      ok: false,
      configVersionId: '',
      versionName: '',
      status: '',
      publishedAt: null,
      model: {},
      strategyConfig: {},
      providers: [],
      error: error.message,
    };
  }

  renderEmailAISettingsStatus();
}

async function loadFeishuApiMessages({ preserveSelection = false } = {}) {
  if (isLoadingFeishuApiMessages) return;
  isLoadingFeishuApiMessages = true;

  try {
    const statusResponse = await fetch(apiUrl('/api/feishu/status'), { cache: 'no-store' });

    if (!statusResponse.ok) {
      throw new Error('本地飞书 API 代理未连接。');
    }

    const statusPayload = await statusResponse.json();
    apiState = {
      ...defaultApiState,
      ...statusPayload,
      write: statusPayload.write || defaultApiState.write,
      apiProxyAvailable: true,
      sourceStatus: statusPayload.sourceStatus || 'API 待接入',
      statusText: statusPayload.configured ? '飞书 API 只读已配置' : 'API 代理可用 · 待配置',
      note: statusPayload.note || '本地 API 代理可用。',
    };

    if (!statusPayload.configured) {
      render();
      return;
    }

    const messagesResponse = await fetch(
      apiUrl(`/api/feishu/mail/messages?all=true&page_size=${FEISHU_WORKBENCH_PAGE_SIZE}`),
      { cache: 'no-store' },
    );
    const messagesPayload = await messagesResponse.json();

    if (!messagesResponse.ok || !messagesPayload.ok) {
      apiState = {
        ...apiState,
        messagesLoaded: false,
        statusText: '飞书 API 读取失败',
        note: messagesPayload.message || '读取飞书邮件失败；当前列表为空。',
        sourceStatus: messagesPayload.sourceStatus || 'API 待接入',
      };
      feishuMessages = [];
      mails = [];
      selectedId = '';
      render();
      return;
    }

    feishuMessages = messagesPayload.messages || [];
    const rawMails = messagesPayload.mails?.length
      ? messagesPayload.mails
      : [];
    mails = await processMailsWithEmailAI(rawMails);
    updateMailSoundBaseline(mails);
    selectedId = preserveSelection && mails.some((mail) => mail.id === selectedId)
      ? selectedId
      : mails[0]?.id || '';
    apiState = {
      ...apiState,
      messagesLoaded: true,
      fetchedCount: mails.length,
      sourceStatus: messagesPayload.sourceStatus || '真实接入',
      statusText: messagesPayload.allPagesFetched
        ? `已接入 · ${mails.length} 封`
        : `已接入 · ${mails.length} 封`,
      note: messagesPayload.cacheStatus === 'stale'
        ? `飞书触发限频，已显示本地缓存。${messagesPayload.staleReason || ''}`
        : `已通过本地代理读取真实飞书邮箱${messagesPayload.allPagesFetched ? `，已翻完 ${messagesPayload.pageCount || 1} 页。` : '。'}真实写操作受服务端开关、原始来信人、审批和限额控制。`,
      realSendEnabled: apiState.write?.realSendEnabled || false,
      write: apiState.write || defaultApiState.write,
    };
    render();
  } catch (error) {
    apiState = {
      ...defaultApiState,
      statusText: '飞书 API 代理未连接',
      note: `${error.message} 当前列表为空。`,
    };
    feishuMessages = [];
    mails = [];
    selectedId = '';
    render();
  } finally {
    isLoadingFeishuApiMessages = false;
  }
}

function startWorkbench() {
  if (workbenchStarted || !currentWorkbenchUser) return;
  workbenchStarted = true;
  renderLoginGate();
  render();

  if (emailAIAdminSessionActive() && emailAIAdminToken()) {
    verifyEmailAIAdminToken(emailAIAdminToken(), { silent: true });
  } else {
    emailAIAdminVerified = false;
    emailAIAdminStatus = '请输入管理员密码后验证权限。';
  }

  loadEmailAIStatus();
  loadFeishuApiMessages();

  if (!feishuPollTimer) {
    feishuPollTimer = setInterval(() => {
      if (currentWorkbenchUser) {
        loadFeishuApiMessages({ preserveSelection: true });
      }
    }, FEISHU_WORKBENCH_POLL_INTERVAL_MS);
  }
}

function selectedMailForRuleNavigation() {
  const results = classifiedMails();
  return results.find((mail) => mail.id === selectedId) || results[0] || null;
}

function openSettingsPanel(commandKey = 'loop-control') {
  activeSettingsPrimary = commandKey;
  activeSettingsCommand = commandKey;
  settingsOpen = true;
  renderSettingsShell();
}

document.querySelector('[data-export-reviews]').addEventListener('click', () => {
  const exportItems = exportReviewItems(classifiedMails(), reviews);
  const text = exportItems.length
    ? exportItems.map((item) => [
      `邮件：${item.mailId} ${item.subject}`,
      `规则：${item.category} / ${item.risk} / ${item.action}`,
      `模板：${item.templateId || '无'}`,
      `审核：${item.decisionText}`,
      `备注：${item.note || '无'}`,
    ].join('\n')).join('\n\n')
    : '暂无审核标记。';

  navigator.clipboard?.writeText(text);
  alert(text);
});

document.querySelectorAll('[data-open-settings]').forEach((button) => {
  button.addEventListener('click', () => {
    overviewOpen = false;
    closeEmailRuleControl();
    openSettingsPanel(activeSettingsPrimary || SETTINGS_COMMANDS[0]?.key || 'account-session');
  });
});

document.querySelectorAll('[data-open-overview]').forEach((button) => {
  button.addEventListener('click', () => {
    overviewOpen = true;
    settingsOpen = false;
    closeEmailRuleControl();
    render();
  });
});

document.querySelector('[data-close-settings]')?.addEventListener('click', () => {
  settingsOpen = false;
  renderSettingsShell();
});

settingsBackdropEl?.addEventListener('click', () => {
  settingsOpen = false;
  renderSettingsShell();
});

document.querySelector('[data-close-email-rule-control]')?.addEventListener('click', () => {
  closeEmailRuleControl();
});

returnSystemRulesButtonEl?.addEventListener('click', () => {
  returnToSystemRulesSettings();
});

emailRuleControlBackdropEl?.addEventListener('click', () => {
  closeEmailRuleControl();
});

initializeWorkbenchAuth();
