export function isCompletedProcessingStatus(status = null) {
  return status?.status === 'completed'
    || ['sent', 'archived', 'completed'].includes(status?.status)
    || status?.completed === true;
}

export function hasFailedProcessingStatus(status = null) {
  return ['failed', 'blocked'].includes(status?.status)
    || status?.failed === true;
}

export function chooseProcessingStatus(...statuses) {
  const candidates = statuses.filter(Boolean);
  return candidates.find(isCompletedProcessingStatus) || candidates[0] || null;
}
