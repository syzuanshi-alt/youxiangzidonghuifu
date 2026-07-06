import { buildReplyCandidates, getTemplateByScene } from './replyTemplates.js';

export const RISK_OVERRIDE_OPTIONS = [
  { risk: 'high', label: '改为高风险', action: 'blocked', scene: '' },
  { risk: 'medium', label: '改为中风险', action: 'draft_only', scene: '语义不明确' },
  { risk: 'low', label: '改为低风险', action: 'auto_reply', scene: '普通资料或流程咨询' },
  { risk: 'spam', label: '标记为垃圾邮件', action: 'ignore', scene: '' },
];

const LANE_BY_RISK = {
  low: 'green',
  medium: 'orange',
  high: 'red',
  spam: 'white',
};

function optionForRisk(risk) {
  return RISK_OVERRIDE_OPTIONS.find((option) => option.risk === risk) || null;
}

function hasOverride(override) {
  return override && optionForRisk(override.risk);
}

function isManualLowRiskAutoReply(option, override) {
  return option.risk === 'low' && override?.source === 'manual';
}

export function applyRiskOverrideToMail(mail = {}, override = null, { agentConfig = {} } = {}) {
  if (!hasOverride(override)) return mail;

  const option = optionForRisk(override.risk);
  const template = option.scene ? getTemplateByScene(option.scene) : null;
  const requiresReview = option.risk === 'medium' || option.risk === 'high';
  const category = `人工改判：${option.risk === 'low' ? '低风险' : option.risk === 'medium' ? '中风险' : option.risk === 'high' ? '高风险' : '垃圾邮件'}`;
  const reason = [
    `人工改判为${option.risk === 'spam' ? '垃圾邮件' : `${category.replace('人工改判：', '')}邮件`}。`,
    override.note || '',
  ].filter(Boolean).join(' ');
  const replyCandidates = buildReplyCandidates({
    template,
    action: option.action,
    risk: option.risk,
    category,
    reason,
    agentConfig,
  });
  const recommendedCandidate = replyCandidates.find((candidate) => candidate.variant === 'recommended')
    || replyCandidates[0];
  const processingStatus = isManualLowRiskAutoReply(option, override)
    ? {
        status: 'completed',
        action: 'auto_send',
        label: '已改为低风险自动回复',
        completed: true,
        completedAt: override.updatedAt || '',
      }
    : mail.processingStatus || null;

  return {
    ...mail,
    originalRisk: mail.originalRisk || mail.risk,
    originalAction: mail.originalAction || mail.action,
    category,
    action: option.action,
    risk: option.risk,
    lane: LANE_BY_RISK[option.risk],
    requiresReview,
    replyDraft: recommendedCandidate?.content || (template ? template.content : ''),
    replyCandidates,
    templateId: template ? template.templateId : null,
    templateSource: template ? 'riskOverride' : option.action === 'blocked' ? 'blocked' : option.action === 'ignore' ? 'spam' : 'riskOverride',
    templateSelectionReason: template ? `人工改判后使用 ${template.scene} 话术。` : '',
    processingStatus,
    reason,
    riskOverride: {
      ...override,
      source: 'manual',
    },
  };
}
