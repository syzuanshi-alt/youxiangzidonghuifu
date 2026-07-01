const SWITCH_DISABLED_OPERATIONS = new Set([
  'closed_loop_disabled',
  'auto_send_disabled',
  'auto_archive_disabled',
  'approved_send_disabled',
]);

const SWITCH_DISABLED_MODES = new Set([
  'write_paused',
  'send_disabled',
  'archive_disabled',
  'high_risk_send_disabled',
  'closed_loop_disabled',
  'auto_send_disabled',
  'auto_archive_disabled',
  'approved_send_disabled',
]);

function collectReasonText(result = {}) {
  return [
    result.message,
    result.reason,
    ...(Array.isArray(result.reasons) ? result.reasons : []),
  ].filter(Boolean).join(' ');
}

export function isAutoProcessingSwitchFailure(result = {}) {
  const mode = result.mode || '';
  const operation = result.operation || result.action || '';
  const reasonText = collectReasonText(result);

  return SWITCH_DISABLED_OPERATIONS.has(operation)
    || SWITCH_DISABLED_MODES.has(mode)
    || /自动处理.*未开启|总开关未开启|自动发送.*未开启|低风险自动发送.*未开启|自动归档.*未开启|真实发送开关关闭|真实写操作总开关关闭|审核后发送开关未开启|高风险.*发送开关未开启|中风险.*发送开关未开启/.test(reasonText);
}

export function findAutoProcessingSwitchFailure(payload = {}) {
  if (isAutoProcessingSwitchFailure(payload)) {
    return payload;
  }

  return (payload.items || []).find((item) => isAutoProcessingSwitchFailure(item)) || null;
}

export function buildAutoProcessingSwitchReminder(failure = {}) {
  const reason = collectReasonText(failure);
  return [
    '动作失败待处理：当前自动处理或对应发送/归档开关未开启。',
    '我已打开右侧的“自动处理开关”，请开启自动处理总开关及对应的发送、归档或审核后发送开关后重试。',
    reason ? `失败原因：${reason}` : '',
  ].filter(Boolean).join('\n');
}
