const RISK_LABELS = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  spam: '垃圾邮件',
};

const LANE_BY_RISK = {
  low: 'green',
  medium: 'orange',
  high: 'red',
  spam: 'white',
};

const ACTION_BY_RISK = {
  low: 'auto_reply',
  medium: 'draft_only',
  high: 'blocked',
  spam: 'ignore',
};

function normalizeRisk(value = '') {
  return ['low', 'medium', 'high', 'spam'].includes(value) ? value : 'medium';
}

function normalizeAction(value = '') {
  return ['auto_reply', 'draft_only', 'blocked', 'ignore'].includes(value) ? value : '';
}

export function getMailRiskState(mail = {}) {
  const sourceRisk = normalizeRisk(mail.risk);
  const sourceAction = normalizeAction(mail.action);
  let risk = sourceRisk;

  if (sourceAction === 'ignore' || sourceRisk === 'spam') {
    risk = 'spam';
  } else if (sourceAction === 'blocked' || sourceRisk === 'high') {
    risk = 'high';
  }

  const action = risk === 'high'
    ? 'blocked'
    : risk === 'spam'
      ? 'ignore'
      : sourceAction || ACTION_BY_RISK[risk];

  return {
    risk,
    label: RISK_LABELS[risk],
    lane: LANE_BY_RISK[risk],
    action,
    urgent: risk === 'high',
    spam: risk === 'spam',
    sourceRisk,
    sourceAction,
  };
}

export function normalizeMailRiskSnapshot(mail = {}) {
  const state = getMailRiskState(mail);
  return {
    risk: state.risk,
    action: state.action,
    lane: state.lane,
  };
}

export function normalizeMailRiskFields(mail = {}) {
  return {
    ...mail,
    ...normalizeMailRiskSnapshot(mail),
  };
}

export function isHighRiskMail(mail = {}) {
  return getMailRiskState(mail).urgent;
}

export function isSpamMail(mail = {}) {
  return getMailRiskState(mail).spam;
}
