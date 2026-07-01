function lowRiskConfiguredAction(risk = {}, config = {}) {
  const suggestedAction = risk.suggestedAction || '';
  if (suggestedAction === 'block_auto_reply') return 'blocked';
  if (suggestedAction === 'human_review' || suggestedAction === 'internal_note_only') return 'human_review';

  const configuredAction = config.strategyConfig?.lowRiskDefaultAction || suggestedAction || 'draft_only';
  return configuredAction === 'auto_send_allowed' ? 'auto_send_allowed' : 'draft_only';
}

export function decideAutoAction({
  spam = {},
  risk = {},
  safety = {},
  commitmentRisk = {},
  knowledgeConfidence = {},
  missingFields = {},
  reply = {},
  config = {},
} = {}) {
  const decisionReasons = [];

  if (spam.isSpam) {
    return {
      finalAction: 'ignore_spam',
      decisionReasons: ['垃圾邮件或钓鱼/营销邮件，忽略客户回复。'],
      autoSendEligibility: false,
    };
  }

  if (commitmentRisk.blocked || safety.blocked) {
    return {
      finalAction: 'blocked',
      decisionReasons: [
        '输出命中承诺或安全阻断规则。',
        ...(commitmentRisk.reasons || []),
        ...(safety.reasons || []),
      ],
      autoSendEligibility: false,
    };
  }

  if (risk.level === 'high') {
    return {
      finalAction: 'human_review',
      decisionReasons: ['高风险邮件需要 human review，禁止自动发送。'],
      autoSendEligibility: false,
    };
  }

  if (risk.level === 'medium' || safety.needHumanReview) {
    return {
      finalAction: 'human_review',
      decisionReasons: ['中风险或安全规则要求人工审核。'],
      autoSendEligibility: false,
    };
  }

  if (!reply.draft) {
    return {
      finalAction: 'human_review',
      decisionReasons: ['没有客户可见草稿，转人工确认。'],
      autoSendEligibility: false,
    };
  }

  if (['none', 'weak'].includes(knowledgeConfidence.level)) {
    return {
      finalAction: 'human_review',
      decisionReasons: ['知识库置信度不足，禁止自动发送。'],
      autoSendEligibility: false,
    };
  }

  if (missingFields.missingFieldSeverity === 'critical') {
    return {
      finalAction: 'human_review',
      decisionReasons: ['缺少关键信息，禁止自动发送。'],
      autoSendEligibility: false,
    };
  }

  const finalAction = lowRiskConfiguredAction(risk, config);
  if (finalAction === 'auto_send_allowed') {
    decisionReasons.push('低风险、知识库置信度足够、无关键缺失字段且策略允许自动发送。');
  } else {
    decisionReasons.push('低风险草稿生成完成，默认仅保存草稿。');
  }

  return {
    finalAction,
    decisionReasons,
    autoSendEligibility: finalAction === 'auto_send_allowed',
  };
}
