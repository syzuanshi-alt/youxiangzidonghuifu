import {
  mailText,
  normalizeArray,
} from './types.js';

export function matchKnowledgeBase(emailPayload = {}, risk = {}, config = {}) {
  const text = mailText(emailPayload);
  const riskLevel = risk.level || 'medium';

  const entries = (config.knowledgeBase || [])
    .filter((entry) => entry.enabled !== false)
    .filter((entry) => {
      const levels = normalizeArray(entry.applicableRiskLevels);
      return levels.length === 0 || levels.includes(riskLevel);
    })
    .map((entry) => ({
      entry,
      matches: normalizeArray(entry.keywords).filter((keyword) => text.includes(keyword.toLowerCase())),
    }))
    .filter((item) => item.matches.length > 0)
    .sort((a, b) => Number(b.entry.priority || 0) - Number(a.entry.priority || 0));

  return {
    entries: entries.map((item) => item.entry),
    refs: entries.map((item) => ({
      id: item.entry.id,
      title: item.entry.title,
      category: item.entry.category,
    })),
  };
}
