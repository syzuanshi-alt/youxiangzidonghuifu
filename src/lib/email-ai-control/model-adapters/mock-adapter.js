import { detectCustomerLanguage, translateCustomerMessageToChinese } from '../../../emailTranslation.js';
import { alignReplyCandidateLanguage } from '../../../replyTemplates.js';

export async function callMockModel({
  mode = 'reply',
  emailPayload = {},
  risk = {},
  knowledgeEntries = [],
} = {}) {
  if (mode === 'risk') {
    return {
      level: risk.level || 'medium',
      reasons: risk.reasons || [],
      confidence: 0.72,
    };
  }

  const topKnowledge = knowledgeEntries[0] || null;
  const riskLevel = risk.level || 'medium';
  const customerLanguage = emailPayload.customerLanguage || detectCustomerLanguage([
    emailPayload.subject,
    emailPayload.bodyText || emailPayload.body_text || emailPayload.body || emailPayload.summary,
  ].filter(Boolean).join('\n'));
  const translation = translateCustomerMessageToChinese([
    emailPayload.subject,
    emailPayload.bodyText || emailPayload.body_text || emailPayload.body || emailPayload.summary,
  ].filter(Boolean).join('\n')).text;

  if (riskLevel === 'high') {
    const knowledgeSuggestion = topKnowledge
      ? [
        `命中知识库：${topKnowledge.title || topKnowledge.id}`,
        topKnowledge.customerScenario ? `适用场景：${topKnowledge.customerScenario}` : '',
        topKnowledge.standardReply ? `人工参考话术：${topKnowledge.standardReply}` : '',
        topKnowledge.forbiddenExpressions?.length ? `禁用表达：${topKnowledge.forbiddenExpressions.join('、')}` : '',
      ].filter(Boolean)
      : [];
    return {
      draft: '',
      internalSuggestion: [
        '该邮件已识别为高风险，请人工核对客户诉求、订单信息和平台规则后再回复。',
        '回复时不要承诺退款、赔偿、补发、发货时间、法律责任或平台处理结果。',
        ...knowledgeSuggestion,
      ].join('\n'),
      translationZh: translation,
      customerLanguage,
      tone: 'internal',
    };
  }

  if (topKnowledge?.standardReply) {
    const alignedKnowledgeReply = alignReplyCandidateLanguage({
      candidateId: 'MOCK-KNOWLEDGE-DRAFT',
      variant: riskLevel === 'low' ? 'standard' : 'conservative',
      content: topKnowledge.standardReplyEn || topKnowledge.standardReply,
      contentZh: topKnowledge.standardReplyZh || topKnowledge.standardReply || '',
      language: 'en',
      sendable: true,
      action: riskLevel === 'low' ? 'auto_reply' : 'draft_only',
      risk: riskLevel,
    }, customerLanguage);

    return {
      draft: alignedKnowledgeReply.content,
      internalSuggestion: '',
      translationZh: translation,
      customerLanguage,
      tone: topKnowledge.recommendedTone || 'polite',
    };
  }

  const alignedDraft = alignReplyCandidateLanguage({
    candidateId: 'MOCK-STANDARD-DRAFT',
    variant: riskLevel === 'low' ? 'standard' : 'conservative',
    content: [
      'Hello, thank you for reaching out.',
      'We have received your message and will review the details carefully before providing confirmed information.',
    ].join(' '),
    contentZh: '您好，感谢联系。我们已收到您的邮件，会认真核对相关信息后再提供确认回复。',
    language: 'en',
    sendable: true,
    action: riskLevel === 'low' ? 'auto_reply' : 'draft_only',
    risk: riskLevel,
  }, customerLanguage);

  return {
    draft: alignedDraft.content,
    internalSuggestion: '',
    translationZh: translation,
    customerLanguage,
    tone: 'polite',
    subject: emailPayload.subject || '',
  };
}

export async function testMockConnection() {
  return {
    ok: true,
    status: 'connected',
    checkedAt: new Date().toISOString(),
    message: 'Local Mock 可用。',
  };
}
