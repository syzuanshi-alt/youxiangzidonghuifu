import { getMailRiskState } from './riskState.js';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);
const APPROVED_REVIEW_DECISIONS = new Set(['reasonable', 'approved']);
const DEFAULT_DAILY_SEND_LIMIT = 20;
const DEFAULT_DAILY_ARCHIVE_LIMIT = 100;
const AUTOMATED_SENDER_LOCAL_PARTS = new Set([
  'no-reply',
  'noreply',
  'do-not-reply',
  'donotreply',
  'notification',
  'notifications',
  'mailer-daemon',
]);

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function readBool(value) {
  return TRUE_VALUES.has(String(value || '').trim().toLowerCase());
}

function readInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function readList(value) {
  if (!hasValue(value)) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function localPart(value = '') {
  return normalizeEmail(value).split('@')[0] || '';
}

function isAutomatedSenderAddress(value = '') {
  const local = localPart(value);
  return AUTOMATED_SENDER_LOCAL_PARTS.has(local)
    || local.startsWith('no-reply')
    || local.startsWith('noreply')
    || local.startsWith('do-not-reply')
    || local.startsWith('donotreply');
}

function isApproved(review) {
  return APPROVED_REVIEW_DECISIONS.has(review?.decision);
}

function needsApproval(mail) {
  const riskState = getMailRiskState(mail);
  return mail.requiresReview
    || riskState.action === 'draft_only'
    || riskState.urgent
    || riskState.risk === 'medium'
    || ['退款 / 退货', '赔偿 / 补偿'].includes(mail.category);
}

function canUseOriginalSenderReplyPolicy({ config, mail, recipient }) {
  const normalizedRecipient = normalizeEmail(recipient);
  const normalizedSender = normalizeEmail(mail.sender);

  return config.customerReplyOriginalSenderEnabled
    && hasValue(normalizedSender)
    && normalizedRecipient === normalizedSender
    && !isAutomatedSenderAddress(normalizedSender);
}

function makeDecision({
  action,
  allowed,
  mode,
  reasons = [],
  requiresApproval = false,
  config,
}) {
  return {
    action,
    allowed,
    mode,
    reasons,
    requiresApproval,
    realSendEnabled: action === 'send' && allowed,
    realArchiveEnabled: action === 'archive' && allowed,
    paymentActionAllowed: false,
    orderActionAllowed: false,
    writeEnabled: config.writeEnabled,
  };
}

export function buildFeishuWriteConfig(env = {}) {
  const writeEnabled = readBool(env.FEISHU_WRITE_ENABLED);
  const sendEnabled = writeEnabled && readBool(env.FEISHU_SEND_ENABLED);
  const archiveEnabled = writeEnabled && readBool(env.FEISHU_ARCHIVE_ENABLED);
  const highRiskSendEnabled = writeEnabled && readBool(env.FEISHU_HIGH_RISK_SEND_ENABLED);
  const autoProcessEnabled = writeEnabled && readBool(env.FEISHU_AUTO_PROCESS_ENABLED);
  const autoSendLowRiskEnabled = autoProcessEnabled
    && sendEnabled
    && readBool(env.FEISHU_AUTO_SEND_LOW_RISK_ENABLED);
  const autoArchiveSpamEnabled = autoProcessEnabled
    && archiveEnabled
    && readBool(env.FEISHU_AUTO_ARCHIVE_SPAM_ENABLED);
  const userAccessTokenConfigured = hasValue(env.FEISHU_USER_ACCESS_TOKEN);
  const allowlist = readList(env.FEISHU_SEND_RECIPIENT_ALLOWLIST);
  const customerReplyOriginalSenderEnabled = readBool(env.FEISHU_CUSTOMER_REPLY_ORIGINAL_SENDER_ENABLED)
    || readBool(env.FEISHU_ALLOW_UNKNOWN_CUSTOMER_AUTO_REPLY);
  const archiveFolderId = hasValue(env.FEISHU_ARCHIVE_FOLDER_ID)
    ? String(env.FEISHU_ARCHIVE_FOLDER_ID).trim()
    : '';
  const dailySendLimit = readInt(env.FEISHU_DAILY_SEND_LIMIT, DEFAULT_DAILY_SEND_LIMIT);
  const dailyArchiveLimit = readInt(env.FEISHU_DAILY_ARCHIVE_LIMIT, DEFAULT_DAILY_ARCHIVE_LIMIT);

  return {
    writeEnabled,
    sendEnabled,
    archiveEnabled,
    highRiskSendEnabled,
    autoProcessEnabled,
    autoSendLowRiskEnabled,
    autoArchiveSpamEnabled,
    userAccessTokenConfigured,
    allowlist,
    customerReplyOriginalSenderEnabled,
    unknownCustomerAutoReplyEnabled: customerReplyOriginalSenderEnabled,
    archiveFolderId,
    archiveFolderConfigured: hasValue(archiveFolderId),
    dailySendLimit,
    dailyArchiveLimit,
    realSendEnabled: sendEnabled
      && userAccessTokenConfigured
      && (allowlist.length > 0 || customerReplyOriginalSenderEnabled),
    realArchiveEnabled: archiveEnabled && userAccessTokenConfigured && hasValue(archiveFolderId),
  };
}

export function buildPublicFeishuWriteStatus(env = {}) {
  const config = buildFeishuWriteConfig(env);

  return {
    writeEnabled: config.writeEnabled,
    sendEnabled: config.sendEnabled,
    archiveEnabled: config.archiveEnabled,
    highRiskSendEnabled: config.highRiskSendEnabled,
    autoProcessEnabled: config.autoProcessEnabled,
    autoSendLowRiskEnabled: config.autoSendLowRiskEnabled,
    autoArchiveSpamEnabled: config.autoArchiveSpamEnabled,
    userAccessTokenConfigured: config.userAccessTokenConfigured,
    allowlistCount: config.allowlist.length,
    customerReplyOriginalSenderEnabled: config.customerReplyOriginalSenderEnabled,
    unknownCustomerAutoReplyEnabled: config.unknownCustomerAutoReplyEnabled,
    customerReplyPolicy: config.customerReplyOriginalSenderEnabled
      ? 'original_sender'
      : 'allowlist_only',
    archiveFolderConfigured: config.archiveFolderConfigured,
    dailySendLimit: config.dailySendLimit,
    dailyArchiveLimit: config.dailyArchiveLimit,
    realSendEnabled: config.realSendEnabled,
    realArchiveEnabled: config.realArchiveEnabled,
    hardDeleteEnabled: false,
    endpoints: {
      send: '/api/feishu/mail/actions/send',
      archive: '/api/feishu/mail/actions/archive',
      delete: '/api/feishu/mail/actions/delete',
      approve: '/api/feishu/mail/actions/approve',
      process: '/api/feishu/mail/actions/process',
    },
  };
}

export function buildWriteActionDecision({
  action,
  mail = {},
  recipient = '',
  content = '',
  review = null,
  env = {},
  usage = {},
} = {}) {
  const config = buildFeishuWriteConfig(env);
  const riskState = getMailRiskState(mail);
  const reasons = [];

  if (action === 'delete') {
    return makeDecision({
      action,
      allowed: false,
      mode: 'hard_delete_disabled',
      reasons: ['生产邮箱不开放不可恢复硬删除。'],
      config,
    });
  }

  if (!config.writeEnabled) {
    return makeDecision({
      action,
      allowed: false,
      mode: 'write_paused',
      reasons: ['真实写操作总开关关闭。'],
      config,
    });
  }

  if (!config.userAccessTokenConfigured) {
    return makeDecision({
      action,
      allowed: false,
      mode: 'missing_user_access_token',
      reasons: ['缺少 FEISHU_USER_ACCESS_TOKEN，不能调用飞书写接口。'],
      config,
    });
  }

  if (action === 'archive') {
    if (!config.archiveEnabled) {
      reasons.push('自动归档 / 移箱开关关闭。');
      return makeDecision({ action, allowed: false, mode: 'archive_disabled', reasons, config });
    }
    if (!config.archiveFolderConfigured) {
      reasons.push('缺少 FEISHU_ARCHIVE_FOLDER_ID。');
      return makeDecision({ action, allowed: false, mode: 'missing_archive_folder', reasons, config });
    }
    if (!riskState.spam) {
      reasons.push('只有白色垃圾 / 骚扰邮件允许自动归档。');
      return makeDecision({ action, allowed: false, mode: 'not_spam_archive', reasons, config });
    }
    if (Number(usage.archivedToday || 0) >= config.dailyArchiveLimit) {
      reasons.push('今日归档数量已达到限额。');
      return makeDecision({ action, allowed: false, mode: 'archive_limit_reached', reasons, config });
    }
    return makeDecision({ action, allowed: true, mode: 'ready', config });
  }

  if (action !== 'send') {
    return makeDecision({
      action,
      allowed: false,
      mode: 'unsupported_action',
      reasons: ['不支持的写操作。'],
      config,
    });
  }

  if (!config.sendEnabled) {
    reasons.push('真实发送开关关闭。');
    return makeDecision({ action, allowed: false, mode: 'send_disabled', reasons, config });
  }

  if (riskState.spam) {
    reasons.push('白色垃圾 / 骚扰邮件不能发送回复。');
    return makeDecision({ action, allowed: false, mode: 'spam_cannot_send', reasons, config });
  }

  if (!hasValue(content)) {
    reasons.push('缺少要发送的邮件内容。');
    return makeDecision({ action, allowed: false, mode: 'missing_content', reasons, config });
  }

  const approvalRequired = needsApproval(mail);
  if (approvalRequired && !isApproved(review)) {
    reasons.push('该风险等级或诉求必须人工审批后才能真实发送。');
    return makeDecision({
      action,
      allowed: false,
      mode: 'approval_required',
      reasons,
      requiresApproval: true,
      config,
    });
  }

  const normalizedRecipient = normalizeEmail(recipient);
  const normalizedSender = normalizeEmail(mail.sender);
  const recipientAllowlisted = config.allowlist.includes(normalizedRecipient);
  const canReplyOriginalSender = canUseOriginalSenderReplyPolicy({ config, mail, recipient });

  if (!recipientAllowlisted && !canReplyOriginalSender) {
    if (config.customerReplyOriginalSenderEnabled
      && isAutomatedSenderAddress(normalizedSender)) {
      reasons.push('该发件人像系统通知或 no-reply 邮箱，不自动回复。');
      return makeDecision({ action, allowed: false, mode: 'automated_sender_blocked', reasons, config });
    }

    if (config.customerReplyOriginalSenderEnabled
      && normalizedRecipient !== normalizedSender) {
      reasons.push('未知客户自动回复只能发送给原始来信人。');
      return makeDecision({ action, allowed: false, mode: 'recipient_not_original_sender', reasons, config });
    }

    reasons.push(config.customerReplyOriginalSenderEnabled
      ? '收件人不在特殊授权名单内，且不满足原始来信人回复规则。'
      : '未开启原始来信人回复策略，且收件人不在特殊授权名单内。');
    return makeDecision({ action, allowed: false, mode: 'recipient_not_allowlisted', reasons, config });
  }

  if (Number(usage.sentToday || 0) >= config.dailySendLimit) {
    reasons.push('今日真实发送数量已达到限额。');
    return makeDecision({ action, allowed: false, mode: 'send_limit_reached', reasons, config });
  }

  if (riskState.urgent && !config.highRiskSendEnabled) {
    reasons.push('审批后高风险回复开关关闭。');
    return makeDecision({
      action,
      allowed: false,
      mode: 'high_risk_send_disabled',
      reasons,
      requiresApproval: approvalRequired,
      config,
    });
  }

  return makeDecision({
    action,
    allowed: true,
    mode: 'ready',
    requiresApproval: approvalRequired,
    config,
  });
}

export function summarizeWriteActions(decisions) {
  return decisions.reduce((summary, decision) => {
    summary.total += 1;
    summary.allowed += decision.allowed ? 1 : 0;
    summary.blocked += decision.allowed ? 0 : 1;
    summary.sendReady += decision.allowed && decision.action === 'send' ? 1 : 0;
    summary.archiveReady += decision.allowed && decision.action === 'archive' ? 1 : 0;
    summary.approvalRequired += decision.mode === 'approval_required' ? 1 : 0;
    return summary;
  }, {
    total: 0,
    allowed: 0,
    blocked: 0,
    sendReady: 0,
    archiveReady: 0,
    approvalRequired: 0,
  });
}

export function buildWriteAuditEvent({
  action,
  mail = {},
  decision,
  actor = 'local-operator',
  result = {},
  createdAt = new Date().toISOString(),
} = {}) {
  const riskState = getMailRiskState(mail);
  return {
    createdAt,
    action,
    actor,
    mailId: mail.id || mail.mailId || null,
    messageId: mail.messageId || mail.id || null,
    threadId: mail.threadId || null,
    subject: mail.subject || '',
    risk: riskState.risk || '',
    category: mail.category || '',
    templateId: mail.templateId || null,
    allowed: Boolean(decision?.allowed),
    mode: decision?.mode || 'unknown',
    reasons: decision?.reasons || [],
    result: {
      ok: Boolean(result.ok),
      messageId: result.messageId || result.message_id || null,
      threadId: result.threadId || result.thread_id || null,
      archived: Boolean(result.archived),
      deleted: Boolean(result.deleted),
      error: result.error || null,
    },
  };
}
