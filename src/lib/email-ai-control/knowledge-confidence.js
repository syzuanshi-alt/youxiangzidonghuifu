const INTENT_CATEGORY_HINTS = {
  pre_sale_product_question: ['产品咨询', '售前咨询'],
  tax_shipping_fee: ['售前咨询'],
  delivery_time_question: ['售前咨询'],
  order_status_query: ['售中'],
  shipment_urgency: ['售中'],
  logistics_abnormal: ['售中'],
  quality_complaint: ['售后'],
  refund: ['退款', '售后'],
  return: ['退货', '售后'],
  exchange: ['售后'],
  signed_not_received: ['售后'],
};

function riskMatches(entry = {}, riskLevel = '') {
  const levels = Array.isArray(entry.applicableRiskLevels) ? entry.applicableRiskLevels : [];
  return levels.length === 0 || levels.includes(riskLevel);
}

function intentMatches(entry = {}, intent = {}) {
  const hints = INTENT_CATEGORY_HINTS[intent.primaryIntent] || [];
  const searchable = [
    entry.title,
    entry.category,
    entry.customerScenario,
    entry.notes,
  ].filter(Boolean).join('\n');
  return hints.length === 0 || hints.some((hint) => searchable.includes(hint));
}

export function scoreKnowledgeConfidence({
  knowledge = { entries: [] },
  risk = {},
  intent = {},
} = {}) {
  const entries = Array.isArray(knowledge.entries) ? knowledge.entries : [];
  if (entries.length === 0) {
    return {
      level: 'none',
      score: 0,
      reasons: ['未命中知识库。'],
      missingKnowledgeReason: '未命中可支撑回复的知识库条目。',
    };
  }

  const top = entries[0];
  const hasKeywordMatches = (knowledge.matchedKeywords || []).length > 0;
  const matchedRisk = riskMatches(top, risk.level || 'medium');
  const matchedIntent = intentMatches(top, intent);
  const autoAllowed = top.allowForAutoReply === true && top.requireHumanReview !== true;

  let score = 0.35;
  if (hasKeywordMatches) score += 0.2;
  if (matchedRisk) score += 0.15;
  if (matchedIntent) score += 0.15;
  if (autoAllowed) score += 0.1;
  if ((top.priority || 0) >= 50) score += 0.05;

  const rawLevel = score >= 0.8 ? 'strong' : score >= 0.55 ? 'medium' : score >= 0.25 ? 'weak' : 'none';
  const level = rawLevel === 'strong' && Number(top.priority || 0) < 50 ? 'medium' : rawLevel;

  return {
    level,
    score: Number(score.toFixed(2)),
    reasons: [
      `命中知识库：${top.title || top.id}`,
      matchedRisk ? '风险等级匹配。' : '风险等级不完全匹配。',
      matchedIntent ? '业务意图匹配。' : '业务意图不完全匹配。',
      autoAllowed ? '条目允许低风险自动候选。' : '条目需要人工审核或仅作参考。',
    ],
    missingKnowledgeReason: ['none', 'weak'].includes(level) ? '知识库命中不足以支撑自动回复。' : '',
  };
}
