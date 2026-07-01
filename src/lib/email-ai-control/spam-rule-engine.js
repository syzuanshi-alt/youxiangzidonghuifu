import {
  includesAnyText,
  mailText,
  normalizeArray,
  senderDomain,
} from './types.js';

function scoreFromMatches(matches, rule) {
  if (matches.length === 0) return 0;
  return Math.min(0.95, 0.45 + matches.length * 0.15 + Number(rule.priority || 0) / 300);
}

export function evaluateSpamRules(emailPayload = {}, config = {}) {
  const text = mailText(emailPayload);
  const senderEmail = String(emailPayload.senderEmail || emailPayload.sender || '').trim().toLowerCase();
  const domain = senderDomain(senderEmail);

  const matched = (config.spamRules || [])
    .filter((rule) => rule.enabled !== false)
    .map((rule) => {
      const matches = [];
      normalizeArray(rule.keywords).forEach((keyword) => {
        if (text.includes(keyword.toLowerCase())) matches.push(keyword);
      });
      normalizeArray(rule.senderEmails).forEach((email) => {
        if (senderEmail === email.toLowerCase()) matches.push(email);
      });
      normalizeArray(rule.senderDomains).forEach((senderDomainValue) => {
        if (domain === senderDomainValue.toLowerCase() || domain.endsWith(`.${senderDomainValue.toLowerCase()}`)) {
          matches.push(senderDomainValue);
        }
      });
      normalizeArray(rule.urlPatterns).forEach((pattern) => {
        if (includesAnyText(text, [pattern])) matches.push(pattern);
      });
      return {
        rule,
        matches,
        confidence: scoreFromMatches(matches, rule),
      };
    })
    .filter((item) => item.matches.length > 0)
    .sort((a, b) => b.confidence - a.confidence || Number(b.rule.priority || 0) - Number(a.rule.priority || 0));

  const top = matched[0] || null;

  return {
    isSpam: Boolean(top),
    confidence: top ? top.confidence : 0.05,
    matchedRules: matched.map((item) => item.rule.name),
    reasons: matched.map((item) => `${item.rule.name}: ${item.rule.semanticDescription || item.rule.notes || item.matches.join(', ')}`),
    suggestedAction: top?.rule?.suggestedAction || 'ignore_spam',
  };
}
