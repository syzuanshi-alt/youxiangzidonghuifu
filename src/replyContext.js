import { normalizeEmailContext } from './lib/email-ai-control/email-context-normalizer.js';

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

export function buildReplyContext({
  emailPayload = {},
  normalizedContext = null,
} = {}) {
  const context = normalizedContext || normalizeEmailContext(emailPayload);
  const orderNumbers = unique(context.detectedFields?.orderNumbers);
  const emails = unique(context.detectedFields?.emails);
  const trackingNumbers = unique(context.detectedFields?.trackingNumbers);
  const hasAttachment = context.attachmentSignals?.hasAttachment === true;
  const mentionedAttachment = context.attachmentSignals?.mentionedAttachment === true;

  return {
    normalizedContext: context,
    orderNumbers,
    emails,
    trackingNumbers,
    hasOrderIdentifier: orderNumbers.length > 0 || emails.length > 0,
    hasTrackingIdentifier: trackingNumbers.length > 0,
    hasAnyIdentifier: orderNumbers.length > 0 || emails.length > 0 || trackingNumbers.length > 0,
    hasEvidence: hasAttachment || mentionedAttachment,
    hasAttachment,
    mentionedAttachment,
  };
}

export function providedIdentifierZh(replyContext = {}) {
  if (replyContext.orderNumbers?.length) return `订单号 ${replyContext.orderNumbers[0]}`;
  if (replyContext.emails?.length) return `下单邮箱 ${replyContext.emails[0]}`;
  if (replyContext.trackingNumbers?.length) return `物流单号 ${replyContext.trackingNumbers[0]}`;
  return '';
}

export function providedIdentifierEn(replyContext = {}) {
  if (replyContext.orderNumbers?.length) return `order number ${replyContext.orderNumbers[0]}`;
  if (replyContext.emails?.length) return `order email ${replyContext.emails[0]}`;
  if (replyContext.trackingNumbers?.length) return `tracking number ${replyContext.trackingNumbers[0]}`;
  return '';
}

export function customerSharedInfoSummary(replyContext = {}) {
  return {
    zh: providedIdentifierZh(replyContext),
    en: providedIdentifierEn(replyContext),
  };
}
