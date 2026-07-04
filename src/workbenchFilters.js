import { getMailRiskState } from './riskState.js';
import {
  hasFailedProcessingStatus,
  isCompletedProcessingStatus,
} from './processingStatus.js';

export const WORKBENCH_FILTERS = [
  { key: 'all', label: '全部邮件', tone: '' },
  { key: 'pending', label: '待处理', tone: 'metric-pending', note: '未完成' },
  { key: 'urgent', label: '需紧急处理', tone: 'metric-urgent', note: '高风险优先' },
  { key: 'completed', label: '已完成', tone: 'metric-completed', note: '已回复/归档' },
  { key: 'spam', label: '垃圾邮件', tone: 'metric-spam', note: '自动归档' },
];

const EXTRA_WORKBENCH_FILTER_KEYS = [
  'inbox',
  'low_risk',
  'medium_risk',
  'favorite',
  'sent',
  'archived',
  'deleted',
  'auto_reply',
  'review',
  'blocked',
  'reviewed',
  'send_blocked',
  'queue',
];

const WORKBENCH_FILTER_ALIASES = {
  high_risk: 'urgent',
};

export function normalizeWorkbenchFilter(filterKey) {
  const normalizedKey = WORKBENCH_FILTER_ALIASES[filterKey] || filterKey;
  return WORKBENCH_FILTERS.some((filter) => filter.key === normalizedKey)
    || EXTRA_WORKBENCH_FILTER_KEYS.includes(normalizedKey)
    ? normalizedKey
    : 'all';
}

function hasCompletedProcessing(mail = {}) {
  return isCompletedProcessingStatus(mail.processingStatus);
}

function hasFailedProcessing(mail = {}) {
  return hasFailedProcessingStatus(mail.processingStatus);
}

function processingAction(mail = {}) {
  return mail.processingStatus?.action || mail.processingStatus?.lastAction || '';
}

function isArchiveProcessingAction(action = '') {
  return ['archive', 'archived', 'manual_archive', 'auto_archive'].includes(action);
}

export function getWorkbenchProcessingStatus(mail = {}) {
  const failed = hasFailedProcessing(mail);
  const riskState = getMailRiskState(mail);

  if (hasCompletedProcessing(mail)) {
    const action = processingAction(mail);
    const label = mail.processingStatus?.label
      || (isArchiveProcessingAction(action) ? '已归档/移箱' : '已完成回复');

    return {
      status: 'completed',
      label,
      tone: 'completed',
      completed: true,
      urgent: false,
    };
  }

  if (riskState.urgent) {
    return {
      status: 'urgent',
      label: failed ? '动作失败待处理' : '需紧急处理',
      tone: 'urgent',
      completed: false,
      urgent: true,
    };
  }

  if (riskState.spam) {
    return {
      status: 'ignored',
      label: '无需处理',
      tone: 'ignored',
      completed: false,
      urgent: false,
      ignored: true,
    };
  }

  if (failed) {
    return {
      status: 'pending',
      label: '动作失败待处理',
      tone: 'pending',
      completed: false,
      urgent: false,
      failed: true,
    };
  }

  return {
    status: 'pending',
    label: '待处理',
    tone: 'pending',
    completed: false,
    urgent: false,
  };
}

export function getWorkbenchMailBadgeState(mail = {}) {
  const processingStatus = getWorkbenchProcessingStatus(mail);
  const action = processingAction(mail);

  if (processingStatus.status === 'completed' && isArchiveProcessingAction(action)) {
    return {
      risk: 'archived',
      label: processingStatus.label || '已归档/移箱',
      lane: 'archived',
      action,
      urgent: false,
      spam: false,
    };
  }

  return getMailRiskState(mail);
}

export function filterWorkbenchMails(results, filterKey, { reviews = {} } = {}) {
  const normalizedFilter = normalizeWorkbenchFilter(filterKey);

  return results.filter((mail) => {
    const processingStatus = getWorkbenchProcessingStatus(mail);
    const riskState = getMailRiskState(mail);
    const completed = processingStatus.status === 'completed';
    const urgent = processingStatus.status === 'urgent';
    const ignored = processingStatus.status === 'ignored';

    if (normalizedFilter === 'all') return true;
    if (normalizedFilter === 'pending') return !completed && !ignored;
    if (normalizedFilter === 'inbox') return !completed && !urgent && !riskState.spam;
    if (normalizedFilter === 'urgent') return urgent;
    if (normalizedFilter === 'completed') return completed;
    if (normalizedFilter === 'low_risk') return !completed && riskState.risk === 'low';
    if (normalizedFilter === 'medium_risk') return !completed && riskState.risk === 'medium';
    if (normalizedFilter === 'favorite') return Boolean(mail.favorite || mail.starred);
    if (normalizedFilter === 'sent') return completed && ['send', 'sent', 'auto_send', 'manual_send'].includes(mail.processingStatus?.action || mail.processingStatus?.lastAction || '');
    if (normalizedFilter === 'archived') return completed && ['archive', 'archived', 'manual_archive'].includes(mail.processingStatus?.action || mail.processingStatus?.lastAction || '');
    if (normalizedFilter === 'deleted') return Boolean(mail.deleted || mail.processingStatus?.action === 'delete');
    if (normalizedFilter === 'auto_reply') return !completed && !urgent && riskState.action === 'auto_reply';
    if (normalizedFilter === 'review') return !completed && Boolean(mail.requiresReview || mail.draftRecord?.requiresApproval);
    if (normalizedFilter === 'spam') return ignored;
    if (normalizedFilter === 'blocked') return !completed && riskState.urgent;
    if (normalizedFilter === 'reviewed') return Boolean(reviews[mail.id]);
    if (normalizedFilter === 'send_blocked') return !completed && mail.sendGuard?.allowed === false;
    if (normalizedFilter === 'queue') return !completed && Boolean(mail.queueItem?.canEnterQueue);
    return true;
  });
}

export function buildWorkbenchFilterMetrics({
  results,
  reviews = {},
  sourceLabel = 'API 邮件',
  sourceStatus = 'API 待接入',
} = {}) {
  const rows = Array.isArray(results) ? results : [];

  return WORKBENCH_FILTERS.map((filter) => ({
    ...filter,
    label: filter.key === 'all' ? sourceLabel : filter.label,
    count: filterWorkbenchMails(rows, filter.key, { reviews }).length,
    openLabel: filter.key === 'all' ? '打开全部邮件' : `打开${filter.label}`,
    sourceStatus: filter.key === 'all' ? sourceStatus : filter.note || '',
  }));
}

export function findFirstWorkbenchMailId(results, filterKey, { reviews = {} } = {}) {
  return filterWorkbenchMails(Array.isArray(results) ? results : [], filterKey, { reviews })[0]?.id || null;
}

export function buildQueueNavigationItems(results, { limit = 8 } = {}) {
  return (Array.isArray(results) ? results : [])
    .filter((mail) => !getWorkbenchProcessingStatus(mail).completed && mail.queueItem?.canEnterQueue)
    .slice(0, limit)
    .map((mail) => ({
      mailId: mail.id,
      subject: mail.queueItem?.subject || mail.subject || '(无标题)',
      templateId: mail.queueItem?.templateId || mail.templateId || '无模板',
      queueStatus: mail.queueItem?.queueStatus || 'simulation_queued',
      sourceStatus: mail.sourceStatus || '',
      filterKey: 'queue',
    }));
}
