import {
  normalizeArray,
  senderDomain,
} from './types.js';

function joinText(values = []) {
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n');
}

function extractOrderNumbers(text = '') {
  const matches = String(text).match(/\b(?:order|订单)\s*[#:：-]?\s*([a-z0-9-]{5,})\b/gi) || [];
  return matches.map((match) => match.replace(/\b(?:order|订单)\s*[#:：-]?\s*/i, '').trim());
}

function extractTrackingNumbers(text = '') {
  const matches = String(text).match(/\b(?:tracking|物流|运单)\s*(?:number|no\.?|单号)?\s*[:：#-]?\s*([a-z0-9-]{8,})\b/gi) || [];
  return matches.map((match) => match.replace(/\b(?:tracking|物流|运单)\s*(?:number|no\.?|单号)?\s*[:：#-]?\s*/i, '').trim());
}

export function normalizeEmailContext(emailPayload = {}) {
  const originalText = joinText([
    emailPayload.subject,
    emailPayload.body,
    emailPayload.bodyText,
    emailPayload.body_text,
    emailPayload.summary,
  ]);
  const normalizedText = originalText.toLowerCase();
  const senderEmail = String(emailPayload.senderEmail || emailPayload.sender || '').trim().toLowerCase();
  const attachments = normalizeArray(emailPayload.attachments || emailPayload.attachmentNames);
  const mentionedAttachment = /attach|attachment|photo|video|picture|image|screenshot|附件|图片|照片|视频|截图/.test(normalizedText);

  return {
    originalText,
    normalizedText,
    sender: senderEmail,
    senderDomain: senderDomain(senderEmail),
    threadContext: {
      messageId: emailPayload.messageId || emailPayload.message_id || emailPayload.id || '',
      threadId: emailPayload.threadId || emailPayload.thread_id || '',
      hasHistory: Boolean(emailPayload.history || emailPayload.threadSummary || emailPayload.previousMessages),
    },
    detectedFields: {
      orderNumbers: extractOrderNumbers(originalText),
      trackingNumbers: extractTrackingNumbers(originalText),
      emails: originalText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [],
    },
    attachmentSignals: {
      hasAttachment: attachments.length > 0 || Boolean(emailPayload.hasAttachment),
      attachmentNames: attachments,
      mentionedAttachment,
    },
    platformSignals: {
      mentionsPlatform: /platform|paypal|stripe|shopify|amazon|ebay|投诉平台|平台投诉|平台/.test(normalizedText),
      mentionsReview: /bad review|negative review|one star|差评|负面评价|一星/.test(normalizedText),
    },
  };
}
