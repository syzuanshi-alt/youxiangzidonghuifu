import {
  includesAnyText,
  normalizeArray,
} from './types.js';

export function checkOutputSafety(reply = {}, config = {}) {
  const draft = String(reply.draft || '');
  const internalSuggestion = String(reply.internalSuggestion || '');
  const text = `${draft}\n${internalSuggestion}`;

  const matched = (config.outputSafetyRules || [])
    .filter((rule) => rule.enabled !== false)
    .filter((rule) => includesAnyText(text, normalizeArray(rule.keywords)))
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));

  const blocked = matched.some((rule) => rule.triggerAction === 'block_auto_reply');
  const needHumanReview = blocked || matched.some((rule) => ['human_review', 'internal_note_only'].includes(rule.triggerAction));

  return {
    needHumanReview,
    blocked,
    reasons: matched.map((rule) => `${rule.name}: ${rule.semanticDescription || rule.notes || '命中输出安全规则。'}`),
    matchedRules: matched.map((rule) => rule.name),
  };
}
