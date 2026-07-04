import { getMailRiskState } from './riskState.js';

const APPROVED_DECISIONS = new Set(['reasonable']);
const BLOCKING_GUARD_MODES = new Set(['blocked', 'ignored', 'duplicate', 'thread_mismatch']);

function isReviewApproved(review) {
  return APPROVED_DECISIONS.has(review?.decision);
}

export function buildDraftRecord(mail, review = null) {
  const riskState = getMailRiskState(mail);
  const hasDraftContent = Boolean(mail.templateId && mail.replyDraft);
  const isManualArchive = mail.manualArchive?.checked === true;
  const isIgnored = riskState.spam || isManualArchive;
  const canSaveDraft = !isIgnored && !riskState.urgent && hasDraftContent;
  const requiresApproval = canSaveDraft && (mail.requiresReview || riskState.action === 'draft_only' || riskState.risk === 'medium');
  const approved = requiresApproval ? isReviewApproved(review) : canSaveDraft;

  let status = 'draft_saved';
  if (isIgnored) {
    status = 'ignored';
  } else if (!canSaveDraft) {
    status = 'blocked';
  } else if (requiresApproval && !approved) {
    status = 'waiting_review';
  } else if (requiresApproval && approved) {
    status = 'review_approved';
  }

  return {
    mailId: mail.id,
    messageId: mail.messageId || mail.id,
    threadId: mail.threadId || null,
    templateId: mail.templateId,
    action: isManualArchive ? 'manual_archive' : riskState.action,
    risk: riskState.risk,
    canSaveDraft,
    requiresApproval,
    approved,
    status,
    content: canSaveDraft ? mail.replyDraft : '',
  };
}

export function buildSendQueueItem(mail, draftRecord, sendGuard) {
  const guardBlocked = BLOCKING_GUARD_MODES.has(sendGuard.mode);
  const waitingReview = draftRecord.status === 'waiting_review';
  const isManualArchive = mail.manualArchive?.checked === true || draftRecord.action === 'manual_archive';
  const canEnterQueue = draftRecord.canSaveDraft && !waitingReview && !guardBlocked;

  let queueStatus = 'simulation_queued';
  if (draftRecord.status === 'ignored' || sendGuard.mode === 'ignored') {
    queueStatus = 'ignored';
  } else if (!draftRecord.canSaveDraft || draftRecord.status === 'blocked') {
    queueStatus = 'blocked';
  } else if (waitingReview) {
    queueStatus = 'waiting_review';
  } else if (guardBlocked) {
    queueStatus = 'send_guard_blocked';
  }

  return {
    mailId: mail.id,
    messageId: mail.messageId || mail.id,
    threadId: mail.threadId || null,
    subject: mail.subject,
    sender: mail.sender,
    templateId: draftRecord.templateId,
    draftStatus: draftRecord.status,
    queueStatus,
    canEnterQueue,
    realSendAllowed: sendGuard.allowed,
    simulatedOnly: !sendGuard.allowed && canEnterQueue,
    content: draftRecord.content,
    reason: queueStatus === 'ignored'
      ? isManualArchive
        ? '人工选择归档 / 移箱，不生成回复，不进入发送队列。'
        : '垃圾 / 骚扰邮件不生成回复，满足自动归档开关后可移箱。'
      : canEnterQueue
        ? '已进入草稿队列，真实发送仍需服务端闭环校验。'
        : sendGuard.reasons[0] || '草稿未满足入队条件。',
  };
}

export function summarizeDraftWorkflow(queueItems) {
  return queueItems.reduce((summary, item) => {
    summary.total += 1;
    summary.draftSaved += !['blocked', 'ignored'].includes(item.draftStatus) ? 1 : 0;
    summary.waitingReview += item.queueStatus === 'waiting_review' ? 1 : 0;
    summary.approved += item.draftStatus === 'review_approved' ? 1 : 0;
    summary.queued += item.canEnterQueue ? 1 : 0;
    summary.blocked += ['blocked', 'send_guard_blocked'].includes(item.queueStatus) ? 1 : 0;
    summary.ignored += item.queueStatus === 'ignored' ? 1 : 0;
    summary.realSendAllowed += item.realSendAllowed ? 1 : 0;
    return summary;
  }, {
    total: 0,
    draftSaved: 0,
    waitingReview: 0,
    approved: 0,
    queued: 0,
    blocked: 0,
    ignored: 0,
    realSendAllowed: 0,
  });
}
