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
  const source = String(text || '');
  const patterns = [
    /\border\s*(?:number|no\.?|id)\s*(?:is|为|是|#|:|：|-)?\s*([a-z0-9][a-z0-9-]{4,})\b/gi,
    /\bmy\s+order\s*(?:is|#|:|：|-)\s*([a-z0-9][a-z0-9-]{4,})\b/gi,
    /\b订单(?:号|编号)?\s*(?:是|为|#|:|：|-)?\s*([a-z0-9][a-z0-9-]{4,})\b/gi,
    /注文(?:番号|号)?\s*(?:は|です|#|:|：|-)?\s*([a-z0-9][a-z0-9-]{4,})/gi,
  ];
  return [...new Set(patterns.flatMap((pattern) => {
    const values = [];
    let match = pattern.exec(source);
    while (match) {
      values.push(String(match[1] || '').trim());
      match = pattern.exec(source);
    }
    return values;
  }))];
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
