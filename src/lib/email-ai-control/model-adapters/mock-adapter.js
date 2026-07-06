import { detectCustomerLanguage, translateCustomerMessageToChinese } from '../../../emailTranslation.js';
import { alignReplyCandidateLanguage } from '../../../replyTemplates.js';
import {
  buildReplyContext,
  customerSharedInfoSummary,
} from '../../../replyContext.js';

export async function callMockModel({
  mode = 'reply',
  emailPayload = {},
  risk = {},
  knowledgeEntries = [],
  normalizedContext = null,
  missingFields = null,
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
  const replyContext = buildReplyContext({ emailPayload, normalizedContext });
  const sharedInfo = customerSharedInfoSummary(replyContext);

  if (riskLevel === 'high') {
    const highRiskDraft = alignReplyCandidateLanguage({
      candidateId: 'MOCK-HIGH-RISK-RECOMMENDED',
      variant: 'recommended',
      content: replyContext.hasAnyIdentifier
        ? `Hello, I’m sorry this has caused concern. I can see you already shared ${sharedInfo.en || 'the order information'}. I’ll use that to review the case first; if you have photos, videos, screenshots, or platform messages that show the issue, feel free to send them too so I can check everything together.`
        : 'Hello, I’m sorry this has caused concern. To help me check this accurately, could you please send your order number or order email, along with any photos, videos, screenshots, or platform messages that show the issue? I’ll review the details based on the information you provide.',
      contentZh: replyContext.hasAnyIdentifier
        ? `您好，很抱歉这件事给您带来困扰。我看到您已经提供了${sharedInfo.zh || '订单信息'}。我这边会先按这些信息核对；如果有能展示问题的照片、视频、截图或平台消息，也可以一起发我，方便完整对照。`
        : '您好，很抱歉这件事给您带来困扰。为了准确核对，麻烦您发一下订单号或下单邮箱，以及能展示问题的照片、视频、截图或平台消息。我会根据您提供的信息继续确认。',
      language: 'en',
      sendable: true,
      action: 'blocked',
      risk: 'high',
      replyContext,
    }, customerLanguage);
    const knowledgeSuggestion = topKnowledge
      ? [
        `命中知识库：${topKnowledge.title || topKnowledge.id}`,
        topKnowledge.customerScenario ? `适用场景：${topKnowledge.customerScenario}` : '',
        topKnowledge.standardReply ? `人工参考话术：${topKnowledge.standardReply}` : '',
        topKnowledge.forbiddenExpressions?.length ? `禁用表达：${topKnowledge.forbiddenExpressions.join('、')}` : '',
      ].filter(Boolean)
      : [];
    return {
      draft: highRiskDraft.content,
      internalSuggestion: [
        '该邮件已识别为高风险，推荐回复仅作为人工审核草稿。',
        '发送前必须核对客户诉求、订单信息、证据材料和平台规则；不要承诺退款、赔偿、补发、发货时间、法律责任或平台处理结果。',
        ...knowledgeSuggestion,
      ].join('\n'),
      translationZh: translation,
      customerLanguage,
      tone: 'internal',
    };
  }

  if (topKnowledge?.standardReply) {
    const knowledgeTitle = `${topKnowledge.title || ''} ${topKnowledge.category || ''}`.toLowerCase();
    const alreadyHasOrderInfo = replyContext.hasAnyIdentifier && !(missingFields?.missingFields || []).includes('order_number_or_email');
    const contextualKnowledgeReply = alreadyHasOrderInfo && /logistics|shipping|订单|物流|包裹|shipment|order/.test(knowledgeTitle)
      ? {
        content: `Hello, I can see you already shared ${sharedInfo.en || 'the order information'}. I will use that to check the current order or shipping status on this side. If you have a recent tracking screenshot or platform message, feel free to send it too so I can compare the details.`,
        contentZh: `您好，我看到您已经提供了${sharedInfo.zh || '订单信息'}。我这边会先按这条信息核对当前订单或物流状态；如果有最新物流截图或平台消息，也可以一起发我，方便对照。`,
      }
      : null;
    const alignedKnowledgeReply = alignReplyCandidateLanguage({
      candidateId: 'MOCK-KNOWLEDGE-DRAFT',
      variant: riskLevel === 'low' ? 'standard' : 'conservative',
      content: contextualKnowledgeReply?.content || topKnowledge.standardReplyEn || topKnowledge.standardReply,
      contentZh: contextualKnowledgeReply?.contentZh || topKnowledge.standardReplyZh || topKnowledge.standardReply || '',
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
      replyContext.hasAnyIdentifier
        ? `Hello, I can see you already shared ${sharedInfo.en || 'the order information'}. Could you also tell me the specific issue you need help with and send any relevant screenshots or videos if available?`
        : 'Hello, could you please send your order number or order email, the specific issue you need help with, and any relevant screenshots or videos if available?',
    ].join(' '),
    contentZh: replyContext.hasAnyIdentifier
      ? `您好，我看到您已经提供了${sharedInfo.zh || '订单信息'}。麻烦您再具体说一下需要我这边协助解决的问题；如果有相关截图或视频，也可以一起发我。`
      : '您好，麻烦您发一下订单号或下单邮箱、需要我这边协助解决的具体问题；如果有相关截图或视频，也可以一起发我。',
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
