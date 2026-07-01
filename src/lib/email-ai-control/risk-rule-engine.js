import {
  mailText,
  normalizeArray,
} from './types.js';

const RISK_WEIGHT = {
  high: 3,
  medium: 2,
  low: 1,
};

function ruleMatches(rule, text) {
  const keywordMatches = normalizeArray(rule.keywords)
    .filter((keyword) => text.includes(keyword.toLowerCase()));

  if (keywordMatches.length > 0) return keywordMatches;

  const description = String(rule.semanticDescription || '').toLowerCase();
  if (!description) return [];

  const semanticHints = description
    .split(/[，,。.；;\s]+/)
    .filter((word) => word.length >= 4)
    .slice(0, 8);
  return semanticHints.filter((hint) => text.includes(hint));
}

export function evaluateRiskRules(emailPayload = {}, config = {}) {
  const text = mailText(emailPayload);
  const matched = (config.riskRules || [])
    .filter((rule) => rule.enabled !== false)
    .map((rule) => ({
      rule,
      matches: ruleMatches(rule, text),
    }))
    .filter((item) => item.matches.length > 0)
    .sort((a, b) => {
      const riskDiff = (RISK_WEIGHT[b.rule.riskLevel] || 0) - (RISK_WEIGHT[a.rule.riskLevel] || 0);
      if (riskDiff !== 0) return riskDiff;
      return Number(b.rule.priority || 0) - Number(a.rule.priority || 0);
    });

  const top = matched[0] || null;

  if (!top) {
    return {
      level: 'medium',
      reasons: ['未命中明确低风险规则，默认按中风险交由人工确认。'],
      matchedRules: [],
      suggestedAction: 'human_review',
    };
  }

  return {
    level: top.rule.riskLevel || 'medium',
    reasons: matched.map((item) => item.rule.semanticDescription || item.rule.notes || item.rule.name),
    matchedRules: matched.map((item) => item.rule.name),
    suggestedAction: top.rule.suggestedAction || (top.rule.riskLevel === 'low' ? 'draft_only' : 'human_review'),
  };
}
