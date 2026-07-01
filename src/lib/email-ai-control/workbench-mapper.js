import { detectCustomerLanguage } from '../../emailTranslation.js';
import { normalizeMailRiskSnapshot } from '../../riskState.js';

const LANE_BY_RISK = {
  low: 'green',
  medium: 'orange',
  high: 'red',
  spam: 'white',
};

function normalizeBodyTranslation(aiResult = {}, mail = {}) {
  const zh = String(
    aiResult.customerMessageTranslationZh
      || aiResult.translation?.zh
      || aiResult.translationZh
      || mail.customerMessageTranslationZh
      || mail.translation?.zh
      || '',
  ).trim();

  if (!zh) return null;

  return {
    zh,
    source: String(aiResult.customerMessageTranslationSource || aiResult.translation?.source || mail.translation?.source || '').trim(),
    language: aiResult.translation?.language || aiResult.customerLanguage || mail.translation?.language || mail.customerLanguage || null,
  };
}

function actionFromFinalAction(finalAction, riskLevel, isSpam) {
  if (isSpam || finalAction === 'ignore_spam') return 'ignore';
  if (finalAction === 'blocked' || riskLevel === 'high') return 'blocked';
  if (finalAction === 'auto_send_allowed') return 'auto_reply';
  return 'draft_only';
}

function customerLanguageCode(customerLanguage = {}) {
  return String(customerLanguage?.code || customerLanguage || 'en').trim().toLowerCase() || 'en';
}

function makeReplyCandidates(aiResult, action, risk, customerLanguage) {
  if (aiResult.spam?.isSpam || action === 'ignore') return [];

  if (risk === 'high' || action === 'blocked') {
    return [
      {
        candidateId: `EMAIL-AI-${aiResult.configVersionId || 'mock'}-INTERNAL`,
        label: 'AI 内部处理建议',
        variant: 'internal_suggestion',
        content: aiResult.reply?.internalSuggestion || '高风险邮件需要人工核对后处理。',
        editable: true,
        sendable: false,
        requiresReview: true,
        action,
        risk,
        allowsRealSend: false,
        agent: {
          modelId: aiResult.model?.replyModel || 'local-mock-email-ai',
          sourceStatus: 'email_ai_control_center',
        },
        language: 'zh',
      },
    ];
  }

  const draft = aiResult.reply?.draft || '';
  if (!draft) return [];

  return [
    {
      candidateId: `EMAIL-AI-${aiResult.configVersionId || 'mock'}-DRAFT`,
      label: 'AI 配置草稿',
      variant: 'standard',
      content: draft,
      editable: true,
      sendable: true,
      requiresReview: aiResult.safety?.needHumanReview === true || action === 'draft_only',
      action,
      risk,
      allowsRealSend: false,
      agent: {
        modelId: aiResult.model?.replyModel || 'local-mock-email-ai',
        sourceStatus: 'email_ai_control_center',
      },
      language: customerLanguageCode(customerLanguage),
    },
  ];
}

export function mapEmailAIResultToWorkbenchMail(mail = {}, aiResult = {}) {
  const customerLanguage = aiResult.customerLanguage
    || aiResult.reply?.customerLanguage
    || mail.customerLanguage
    || detectCustomerLanguage([
      mail.subject,
      mail.summary,
      mail.bodyText,
      mail.body,
    ].filter(Boolean).join('\n'));
  const bodyTranslation = normalizeBodyTranslation(aiResult, mail);

  if (!aiResult.success) {
    return {
      ...mail,
      aiResult,
      customerLanguage,
      customerLanguageCode: customerLanguage.code,
      translation: bodyTranslation || mail.translation || null,
      translationZh: bodyTranslation?.zh || mail.translationZh || '',
      customerMessageTranslationZh: bodyTranslation?.zh || mail.customerMessageTranslationZh || '',
      customerMessageTranslationSource: bodyTranslation?.source || mail.customerMessageTranslationSource || '',
      category: 'AI 处理失败',
      action: 'draft_only',
      risk: 'medium',
      lane: 'orange',
      requiresReview: true,
      allowsRealSend: false,
      replyDraft: '',
      replyCandidates: [],
      templateId: null,
      templateSource: 'email-ai-control',
      templateSelectionReason: aiResult.error || 'AI 处理失败，使用人工审核兜底。',
      reason: aiResult.error || 'AI 处理失败。',
    };
  }

  const isSpam = aiResult.spam?.isSpam === true;
  const rawRisk = isSpam ? 'spam' : aiResult.risk?.level || 'medium';
  const rawAction = actionFromFinalAction(aiResult.finalAction, rawRisk, isSpam);
  const normalizedRisk = normalizeMailRiskSnapshot({ risk: rawRisk, action: rawAction });
  const risk = normalizedRisk.risk;
  const action = normalizedRisk.action;
  const replyCandidates = makeReplyCandidates(aiResult, action, risk, customerLanguage);
  const primaryCandidate = replyCandidates.find((candidate) => candidate.variant === 'standard') || replyCandidates[0] || null;

  return {
    ...mail,
    aiResult,
    customerLanguage,
    customerLanguageCode: customerLanguage.code,
    translation: bodyTranslation || mail.translation || null,
    translationZh: bodyTranslation?.zh || mail.translationZh || '',
    customerMessageTranslationZh: bodyTranslation?.zh || mail.customerMessageTranslationZh || '',
    customerMessageTranslationSource: bodyTranslation?.source || mail.customerMessageTranslationSource || '',
    category: isSpam
      ? '垃圾邮件'
      : aiResult.risk?.matchedRules?.[0] || aiResult.knowledgeBaseRefs?.[0]?.category || 'AI 风险判定',
    action,
    risk,
    lane: normalizedRisk.lane || LANE_BY_RISK[risk] || 'orange',
    requiresReview: aiResult.safety?.needHumanReview === true || ['human_review', 'blocked', 'failed'].includes(aiResult.finalAction),
    allowsRealSend: false,
    replyDraft: primaryCandidate?.content || '',
    replyCandidates,
    templateId: aiResult.knowledgeBaseRefs?.[0]?.id || null,
    templateSource: 'email-ai-control',
    templateSelectionReason: aiResult.knowledgeBaseRefs?.length
      ? `命中 AI 控制中心知识库：${aiResult.knowledgeBaseRefs.map((ref) => ref.title).join('、')}`
      : `AI 控制中心版本：${aiResult.configVersionId}`,
    reason: [
      ...(aiResult.spam?.matchedRules || []),
      ...(aiResult.risk?.reasons || []),
      ...(aiResult.safety?.reasons || []),
    ].filter(Boolean).join('；') || 'AI 控制中心返回处理建议。',
  };
}
