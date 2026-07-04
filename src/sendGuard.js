import { getMailRiskState } from './riskState.js';

const MODE_TEXT = {
  ready: '允许发送',
  simulation_only: '发送未开放',
  needs_review: '待人工审核',
  blocked: '已拦截',
  ignored: '垃圾邮件',
  duplicate: '重复回复',
  thread_mismatch: '线程错配',
};

function normalizeSubject(subject = '') {
  return subject
    .replace(/^\s*(re|fw|fwd)\s*:\s*/i, '')
    .trim();
}

function normalizeSender(sender = '') {
  return sender.trim().toLowerCase();
}

function toLookupSet(value) {
  if (!value) return new Set();
  if (value instanceof Set) return value;
  return new Set(value);
}

export function buildThreadKey(mail) {
  if (mail.threadId) return String(mail.threadId);

  const sender = normalizeSender(mail.sender);
  const subject = normalizeSubject(mail.subject);
  return `${sender}::${subject}`;
}

export function getMessageId(mail, context = {}) {
  return String(context.messageId || mail.messageId || mail.id || buildThreadKey(mail));
}

function makeCheck(id, label, ok, detail) {
  return {
    id,
    label,
    ok,
    detail,
  };
}

export function evaluateSendGuard(mail, context = {}) {
  const riskState = getMailRiskState(mail);
  const threadKey = buildThreadKey(mail);
  const messageId = getMessageId(mail, context);
  const repliedMessageIds = toLookupSet(context.repliedMessageIds);
  const repliedThreadKeys = toLookupSet(context.repliedThreadKeys);
  const expectedThreadKey = context.expectedThreadKey || threadKey;

  const isDuplicate = repliedMessageIds.has(messageId) || repliedThreadKeys.has(threadKey);
  const isThreadMismatch = expectedThreadKey !== threadKey;
  const isBlocked = riskState.urgent;
  const isManualArchive = mail.manualArchive?.checked === true;
  const isIgnored = riskState.spam || isManualArchive;
  const needsReview = mail.requiresReview || riskState.action === 'draft_only' || riskState.risk === 'medium';
  const hasSendableTemplate = Boolean(mail.templateId && mail.replyDraft);
  const realSendEnabled = mail.allowsRealSend === true;

  const checks = [
    makeCheck(
      'message_not_replied',
      '未发现同一邮件或线程已回复',
      !isDuplicate,
      isDuplicate ? '同一邮件或线程已经有回复记录，必须拦截避免重复回复。' : '可以继续检查。',
    ),
    makeCheck(
      'thread_matches',
      '回复目标线程一致',
      !isThreadMismatch,
      isThreadMismatch ? '当前邮件线程与预期回复线程不一致。' : '线程匹配。',
    ),
    makeCheck(
      'not_high_risk',
      '不是高风险拦截场景',
      !isBlocked,
      isBlocked ? '高风险或已拦截邮件不能进入发送流程。' : '未命中高风险拦截。',
    ),
    makeCheck(
      'not_spam',
      '不是垃圾或手动归档邮件',
      !isIgnored,
      isIgnored
        ? isManualArchive
          ? '人工已选择归档 / 移箱，不生成回复，不进入发送队列。'
          : '垃圾 / 骚扰邮件不生成回复，建议归档或移入垃圾邮件箱。'
        : '未命中垃圾邮件队列。',
    ),
    makeCheck(
      'review_not_required',
      '无需人工审核',
      !needsReview,
      needsReview ? '中风险、草稿或需人工审核邮件不能直接发送。' : '无需人工审核。',
    ),
    makeCheck(
      'template_available',
      '存在可展示话术',
      hasSendableTemplate,
      hasSendableTemplate ? '已命中话术模板。' : '没有可发送话术。',
    ),
    makeCheck(
      'real_send_disabled',
      '服务端真实发送资格',
      realSendEnabled,
      realSendEnabled ? '模板级真实发送资格已开启。' : '模板不会绕过服务端闭环；真实发送由服务端开关、原始来信人、审批和限额决定。',
    ),
  ];

  const reasons = checks
    .filter((check) => !check.ok)
    .map((check) => check.detail);

  let mode = 'ready';
  if (isDuplicate) {
    mode = 'duplicate';
  } else if (isThreadMismatch) {
    mode = 'thread_mismatch';
  } else if (isIgnored) {
    mode = 'ignored';
  } else if (isBlocked) {
    mode = 'blocked';
  } else if (needsReview || !hasSendableTemplate) {
    mode = 'needs_review';
  } else if (!realSendEnabled) {
    mode = 'simulation_only';
  }

  return {
    allowed: mode === 'ready',
    mode,
    modeText: MODE_TEXT[mode],
    threadKey,
    messageId,
    checks,
    reasons,
  };
}

export function summarizeSendGuards(guards) {
  return guards.reduce((summary, guard) => {
    summary.total += 1;
    summary.allowed += guard.allowed ? 1 : 0;
    summary.simulationOnly += guard.mode === 'simulation_only' ? 1 : 0;
    summary.needsReview += guard.mode === 'needs_review' ? 1 : 0;
    summary.blocked += guard.mode === 'blocked' ? 1 : 0;
    summary.ignored += guard.mode === 'ignored' ? 1 : 0;
    summary.duplicate += guard.mode === 'duplicate' ? 1 : 0;
    summary.threadMismatch += guard.mode === 'thread_mismatch' ? 1 : 0;
    return summary;
  }, {
    total: 0,
    allowed: 0,
    simulationOnly: 0,
    needsReview: 0,
    blocked: 0,
    ignored: 0,
    duplicate: 0,
    threadMismatch: 0,
  });
}
