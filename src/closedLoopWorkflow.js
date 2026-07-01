import { classifyMail } from './rules.js';
import { buildFeishuWriteConfig, buildWriteActionDecision } from './feishuWriteControls.js';
import { getMailRiskState } from './riskState.js';

const CONTROL_KEYS = [
  'autoProcessEnabled',
  'autoSendLowRiskEnabled',
  'autoArchiveSpamEnabled',
  'approvedSendEnabled',
  'mediumApprovedSendEnabled',
  'highRiskApprovedSendEnabled',
];

function pickMailId(mail) {
  return mail.id || mail.mailId || mail.messageId || mail.message_id || '';
}

function pickByKnownKeys(store, keys) {
  if (!store) return null;
  const key = keys.find((item) => item !== undefined && item !== null && String(item).trim() !== '');
  return key ? store[key] || null : null;
}

function pickSelectedReply(selectedReplies, mail) {
  return pickByKnownKeys(selectedReplies, [
    pickMailId(mail),
    mail.messageId,
    mail.message_id,
  ])?.content || '';
}

function pickReview(reviews, mail) {
  return pickByKnownKeys(reviews, [
    pickMailId(mail),
    mail.messageId,
    mail.message_id,
  ]);
}

function defaultReplyContent(mail, selectedReplies) {
  return pickSelectedReply(selectedReplies, mail)
    || mail.replyDraft
    || mail.replyCandidates?.find((candidate) => candidate.variant === 'standard')?.content
    || mail.replyCandidates?.[0]?.content
    || '';
}

function sendGuardBlocks(mail) {
  const mode = mail.sendGuard?.mode;
  const riskState = getMailRiskState(mail);
  if (!mode || ['ready', 'simulation_only', 'needs_review', 'ignored'].includes(mode)) {
    return null;
  }

  if (mode === 'blocked' && riskState.urgent) {
    return null;
  }

  return {
    mode,
    reasons: mail.sendGuard?.reasons?.length
      ? mail.sendGuard.reasons
      : ['发送前检查未通过。'],
  };
}

function hasRuntimeControls(runtimeControls) {
  return CONTROL_KEYS.some((key) => typeof runtimeControls?.[key] === 'boolean');
}

function effectiveBool(envValue, runtimeValue) {
  const envEnabled = ['1', 'true', 'yes', 'on', 'enabled'].includes(String(envValue || '').trim().toLowerCase());
  return envEnabled && runtimeValue !== false;
}

export function buildEffectiveClosedLoopEnv(env = {}, runtimeControls = {}) {
  if (!hasRuntimeControls(runtimeControls)) {
    return { ...env };
  }

  return {
    ...env,
    FEISHU_AUTO_PROCESS_ENABLED: effectiveBool(
      env.FEISHU_AUTO_PROCESS_ENABLED,
      runtimeControls.autoProcessEnabled,
    ) ? 'true' : 'false',
    FEISHU_AUTO_SEND_LOW_RISK_ENABLED: effectiveBool(
      env.FEISHU_AUTO_SEND_LOW_RISK_ENABLED,
      runtimeControls.autoSendLowRiskEnabled,
    ) ? 'true' : 'false',
    FEISHU_AUTO_ARCHIVE_SPAM_ENABLED: effectiveBool(
      env.FEISHU_AUTO_ARCHIVE_SPAM_ENABLED,
      runtimeControls.autoArchiveSpamEnabled,
    ) ? 'true' : 'false',
  };
}

function makeItem({
  mail,
  operation,
  content = '',
  decision = null,
  status = 'pending',
  reasons = [],
}) {
  const riskState = getMailRiskState(mail);
  return {
    mailId: pickMailId(mail),
    messageId: mail.messageId || mail.message_id || pickMailId(mail),
    threadId: mail.threadId || mail.thread_id || null,
    subject: mail.subject || '',
    sender: mail.sender || mail.from?.email || '',
    risk: riskState.risk,
    category: mail.category,
    templateId: mail.templateId || null,
    operation,
    status,
    content,
    action: decision?.action || null,
    mode: decision?.mode || null,
    reasons: decision?.reasons || reasons,
    allowed: Boolean(decision?.allowed),
    requiresApproval: Boolean(decision?.requiresApproval),
    paymentActionAllowed: false,
    orderActionAllowed: false,
  };
}

export function summarizeClosedLoopItems(items = []) {
  return items.reduce((summary, item) => {
    summary.total += 1;
    summary.autoSendReady += item.operation === 'auto_send' && item.allowed ? 1 : 0;
    summary.archiveReady += item.operation === 'auto_archive' && item.allowed ? 1 : 0;
    summary.manualSendReady += item.operation === 'manual_send_after_approval' && item.allowed ? 1 : 0;
    summary.pendingReview += item.operation === 'pending_review' ? 1 : 0;
    summary.blocked += item.status === 'blocked' ? 1 : 0;
    summary.skipped += item.status === 'skipped' ? 1 : 0;
    return summary;
  }, {
    total: 0,
    autoSendReady: 0,
    archiveReady: 0,
    manualSendReady: 0,
    pendingReview: 0,
    blocked: 0,
    skipped: 0,
  });
}

export function buildClosedLoopBatch({
  mails = [],
  env = {},
  reviews = {},
  selectedReplies = {},
  usage = {},
  agentConfig = {},
  runtimeControls = {},
} = {}) {
  const effectiveEnv = buildEffectiveClosedLoopEnv(env, runtimeControls);
  const config = buildFeishuWriteConfig(effectiveEnv);
  const runtimeControlsProvided = hasRuntimeControls(runtimeControls);
  const fallbackApprovedSendEnabled = runtimeControls.approvedSendEnabled !== false;
  const mediumApprovedSendEnabled = !runtimeControlsProvided
    || (runtimeControls.mediumApprovedSendEnabled ?? fallbackApprovedSendEnabled) !== false;
  const highRiskApprovedSendEnabled = !runtimeControlsProvided
    || (runtimeControls.highRiskApprovedSendEnabled ?? fallbackApprovedSendEnabled) !== false;
  let sentInBatch = Number(usage.sentToday || 0);
  let archivedInBatch = Number(usage.archivedToday || 0);
  const items = mails.map((mail) => {
    const classified = mail.risk ? mail : classifyMail(mail, { agentConfig });
    const riskState = getMailRiskState(classified);
    const review = pickReview(reviews, classified);

    if (!config.autoProcessEnabled) {
      return makeItem({
        mail: classified,
        operation: 'closed_loop_disabled',
        status: 'skipped',
        reasons: ['工作台闭环总开关未开启，未执行真实动作。'],
      });
    }

    if (riskState.spam) {
      if (!config.autoArchiveSpamEnabled) {
        return makeItem({
          mail: classified,
          operation: 'auto_archive_disabled',
          status: 'skipped',
          reasons: ['自动归档开关未开启。'],
        });
      }

      const decision = buildWriteActionDecision({
        action: 'archive',
        mail: classified,
        recipient: classified.sender,
        env: effectiveEnv,
        usage: {
          ...usage,
          archivedToday: archivedInBatch,
          sentToday: sentInBatch,
        },
      });
      archivedInBatch += decision.allowed ? 1 : 0;

      return makeItem({
        mail: classified,
        operation: 'auto_archive',
        decision,
        status: decision.allowed ? 'ready' : 'blocked',
      });
    }

    const content = defaultReplyContent(classified, selectedReplies);
    const sendGuardBlock = sendGuardBlocks(classified);
    if (sendGuardBlock) {
      return makeItem({
        mail: classified,
        operation: 'send_guard_blocked',
        content,
        status: 'blocked',
        reasons: sendGuardBlock.reasons,
      });
    }

    if (riskState.risk === 'low' && riskState.action === 'auto_reply') {
      if (!config.autoSendLowRiskEnabled) {
        return makeItem({
          mail: classified,
          operation: 'auto_send_disabled',
          status: 'skipped',
          content,
          reasons: ['低风险自动发送开关未开启。'],
        });
      }

      const decision = buildWriteActionDecision({
        action: 'send',
        mail: classified,
        recipient: classified.sender,
        content,
        env: effectiveEnv,
        usage: {
          ...usage,
          sentToday: sentInBatch,
          archivedToday: archivedInBatch,
        },
      });
      sentInBatch += decision.allowed ? 1 : 0;

      return makeItem({
        mail: classified,
        operation: 'auto_send',
        content,
        decision,
        status: decision.allowed ? 'ready' : 'blocked',
      });
    }

    if (riskState.risk === 'medium' || riskState.urgent || classified.requiresReview) {
      const isHighRiskApproval = riskState.urgent;
      const approvedSendEnabled = isHighRiskApproval
        ? highRiskApprovedSendEnabled
        : mediumApprovedSendEnabled;

      if (!approvedSendEnabled) {
        return makeItem({
          mail: classified,
          operation: 'approved_send_disabled',
          content,
          status: 'skipped',
          reasons: [isHighRiskApproval
            ? '高风险审核后发送开关未开启。'
            : '中风险审核后发送开关未开启。'],
        });
      }

      const decision = buildWriteActionDecision({
        action: 'send',
        mail: classified,
        recipient: classified.sender,
        content,
        review,
        env: effectiveEnv,
        usage: {
          ...usage,
          sentToday: sentInBatch,
          archivedToday: archivedInBatch,
        },
      });

      if (!decision.allowed) {
        return makeItem({
          mail: classified,
          operation: decision.mode === 'approval_required' ? 'pending_review' : 'manual_send_blocked',
          content,
          decision,
          status: decision.mode === 'approval_required' ? 'pending' : 'blocked',
        });
      }

      sentInBatch += 1;
      return makeItem({
        mail: classified,
        operation: 'manual_send_after_approval',
        content,
        decision,
        status: 'ready',
      });
    }

    return makeItem({
      mail: classified,
      operation: 'no_action',
      status: 'skipped',
      reasons: ['当前邮件未命中闭环处理动作。'],
    });
  });

  return {
    items,
    summary: summarizeClosedLoopItems(items),
    writeEnabled: config.writeEnabled,
    autoProcessEnabled: config.autoProcessEnabled,
    autoSendLowRiskEnabled: config.autoSendLowRiskEnabled,
    autoArchiveSpamEnabled: config.autoArchiveSpamEnabled,
    approvedSendEnabled: mediumApprovedSendEnabled && highRiskApprovedSendEnabled,
    mediumApprovedSendEnabled,
    highRiskApprovedSendEnabled,
  };
}
