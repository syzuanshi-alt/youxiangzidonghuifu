import {
  detectCustomerLanguage,
  translateCustomerMessageToChinese,
} from '../../emailTranslation.js';
import { generateEmailAIReply } from './reply-generator.js';
import { evaluateRiskRules } from './risk-rule-engine.js';
import { evaluateSpamRules } from './spam-rule-engine.js';
import { matchKnowledgeBase } from './knowledge-base-matcher.js';
import { checkOutputSafety } from './output-safety-checker.js';
import { normalizeEmailContext } from './email-context-normalizer.js';
import { detectCustomerIntentDetail } from './intent-detector.js';
import { detectCustomerEmotion } from './emotion-detector.js';
import { scoreKnowledgeConfidence } from './knowledge-confidence.js';
import { extractMissingFields } from './missing-fields.js';
import { checkCommitmentRisk } from './commitment-risk-checker.js';
import { decideAutoAction } from './auto-action-decider.js';

const RISK_WEIGHT = {
  high: 3,
  medium: 2,
  low: 1,
};

function emailBodyTextForTranslation(emailPayload = {}) {
  return [
    emailPayload.bodyText,
    emailPayload.body_text,
    emailPayload.body_plain_text,
    emailPayload.body,
    emailPayload.summary,
    emailPayload.subject,
  ].map((value) => String(value || '').trim()).find(Boolean) || '';
}

function riskFromFloor(floor = 'medium') {
  if (floor === 'high') return {
    level: 'high',
    suggestedAction: 'human_review',
    reason: '精细意图识别命中高风险业务场景。',
  };
  if (floor === 'medium') return {
    level: 'medium',
    suggestedAction: 'human_review',
    reason: '精细意图识别命中需要人工确认的业务场景。',
  };
  return {
    level: 'low',
    suggestedAction: 'draft_only',
    reason: '精细意图识别命中低风险售前场景。',
  };
}

function strongestRisk(baseRisk = {}, intent = {}, emotion = {}) {
  const intentRisk = riskFromFloor(intent.riskFloor || 'medium');
  const emotionRisk = ['angry', 'threatening'].includes(emotion.emotionLevel)
    ? {
      level: 'high',
      suggestedAction: 'human_review',
      reason: '客户情绪或升级信号达到高风险。',
    }
    : ['urgent', 'dissatisfied'].includes(emotion.emotionLevel)
      ? {
        level: 'medium',
        suggestedAction: 'human_review',
        reason: '客户情绪需要人工审核。',
      }
      : {
        level: 'low',
        suggestedAction: 'draft_only',
        reason: '',
      };
  const candidates = [
    {
      level: baseRisk.level || 'medium',
      suggestedAction: baseRisk.suggestedAction || 'human_review',
      reason: (baseRisk.reasons || [])[0] || '规则风险判定。',
    },
    intentRisk,
    emotionRisk,
  ].sort((a, b) => (RISK_WEIGHT[b.level] || 0) - (RISK_WEIGHT[a.level] || 0));

  const top = candidates[0];
  return {
    level: top.level || 'medium',
    reasons: [
      ...(baseRisk.reasons || []),
      intentRisk.reason,
      emotionRisk.reason,
    ].filter(Boolean),
    matchedRules: [
      ...(baseRisk.matchedRules || []),
      ...(intent.primaryIntent ? [`意图：${intent.primaryIntent}`] : []),
      ...(emotion.emotionLevel && emotion.emotionLevel !== 'calm' ? [`情绪：${emotion.emotionLevel}`] : []),
    ],
    suggestedAction: top.suggestedAction || (top.level === 'low' ? 'draft_only' : 'human_review'),
  };
}

export function createEmailAgentSkills({
  spamRuleEvaluator = evaluateSpamRules,
  riskRuleEvaluator = evaluateRiskRules,
  knowledgeMatcher = matchKnowledgeBase,
  replyGenerator = generateEmailAIReply,
  safetyChecker = checkOutputSafety,
  languageDetector = detectCustomerLanguage,
  translator = translateCustomerMessageToChinese,
} = {}) {
  const skills = {
    normalize_email_context: async (context = {}) => {
      const normalizedContext = normalizeEmailContext(context.emailPayload || {});
      return {
        contextPatch: { normalizedContext },
        output: {
          hasThreadId: Boolean(normalizedContext.threadContext.threadId),
          mentionedAttachment: normalizedContext.attachmentSignals.mentionedAttachment,
          orderNumbers: normalizedContext.detectedFields.orderNumbers,
        },
      };
    },

    translate_global_language: async (context = {}) => {
      const original = emailBodyTextForTranslation(context.emailPayload);
      const languageSource = [
        context.emailPayload?.subject,
        original,
      ].filter(Boolean).join('\n');
      const customerLanguage = context.emailPayload?.customerLanguage || languageDetector(languageSource);
      const translation = translator(original);
      return {
        contextPatch: {
          emailPayload: {
            ...(context.emailPayload || {}),
            customerLanguage,
          },
          customerLanguage,
          translation,
        },
        output: {
          customerLanguage,
          translationSource: translation.source,
        },
      };
    },

    detect_customer_intent_detail: async (context = {}) => {
      const intent = detectCustomerIntentDetail({
        emailPayload: context.emailPayload,
        normalizedContext: context.normalizedContext,
      });
      return {
        contextPatch: { intent },
        output: intent,
      };
    },

    detect_customer_emotion: async (context = {}) => {
      const emotion = detectCustomerEmotion({
        emailPayload: context.emailPayload,
        normalizedContext: context.normalizedContext,
      });
      return {
        contextPatch: { emotion },
        output: emotion,
      };
    },

    classify_email_risk: async (context = {}) => {
      const spam = spamRuleEvaluator(context.emailPayload, context.config);
      const risk = spam.isSpam
        ? {
          level: 'low',
          reasons: ['邮件已命中垃圾邮件规则，不继续生成正常回复。'],
          matchedRules: [],
          suggestedAction: 'ignore_spam',
        }
        : strongestRisk(
          riskRuleEvaluator(context.emailPayload, context.config),
          context.intent || {},
          context.emotion || {},
        );
      return {
        contextPatch: {
          spam,
          risk,
        },
        output: {
          spam,
          risk,
        },
      };
    },

    retrieve_knowledge: async (context = {}) => {
      const knowledge = context.spam?.isSpam
        ? { entries: [], refs: [] }
        : knowledgeMatcher(context.emailPayload, context.risk, context.config);
      return {
        contextPatch: { knowledge },
        output: {
          refs: knowledge.refs || [],
          matchedKeywords: knowledge.matchedKeywords || [],
        },
      };
    },

    score_knowledge_confidence: async (context = {}) => {
      const knowledgeConfidence = context.spam?.isSpam
        ? {
          level: 'none',
          score: 0,
          reasons: ['垃圾邮件不需要知识库支撑。'],
          missingKnowledgeReason: '',
        }
        : scoreKnowledgeConfidence({
          knowledge: context.knowledge,
          risk: context.risk,
          intent: context.intent,
        });
      return {
        contextPatch: { knowledgeConfidence },
        output: knowledgeConfidence,
      };
    },

    extract_missing_fields: async (context = {}) => {
      const missingFields = extractMissingFields({
        intent: context.intent,
        normalizedContext: context.normalizedContext,
      });
      return {
        contextPatch: { missingFields },
        output: missingFields,
      };
    },

    draft_reply: async (context = {}) => {
      const result = await replyGenerator({
        emailPayload: context.emailPayload,
        config: context.config,
        spam: context.spam || {},
        risk: context.risk || {},
        knowledge: context.knowledge || { entries: [], refs: [] },
        env: context.env,
        fetchImpl: context.fetchImpl,
      });
      return {
        contextPatch: {
          reply: result.reply,
          replyProvider: result.provider,
          prompt: result.prompt,
        },
        output: {
          tone: result.reply?.tone || '',
          hasDraft: Boolean(result.reply?.draft),
        },
      };
    },

    polish_reply_tone: async (context = {}) => {
      const draft = String(context.reply?.draft || '').replace(/\s+/g, ' ').trim();
      const reply = context.reply
        ? {
          ...context.reply,
          draft,
          polishedDraft: draft,
        }
        : context.reply;
      return {
        contextPatch: { reply },
        output: {
          toneChanged: Boolean(context.reply?.draft && context.reply.draft !== draft),
          toneNotes: draft ? '仅压缩多余空白，未新增事实或承诺。' : '无客户可见草稿，跳过润色。',
        },
      };
    },

    check_commitment_risk: async (context = {}) => {
      const safetyBase = safetyChecker({
        draft: context.reply?.draft || '',
        internalSuggestion: '',
      }, context.config);
      const commitmentRisk = checkCommitmentRisk({
        reply: context.reply || {},
      });
      const highRiskReasons = context.risk?.level === 'high'
        ? ['高风险邮件必须人工审核，禁止自动发送。']
        : [];
      const safety = {
        ...safetyBase,
        blocked: safetyBase.blocked || commitmentRisk.blocked,
        needHumanReview: safetyBase.needHumanReview || commitmentRisk.blocked || context.risk?.level === 'high',
        reasons: [
          ...(safetyBase.reasons || []),
          ...(commitmentRisk.reasons || []),
          ...highRiskReasons,
        ],
      };
      return {
        contextPatch: { safety, commitmentRisk },
        output: {
          safety,
          commitmentRisk,
        },
      };
    },

    decide_auto_action: async (context = {}) => {
      const decision = decideAutoAction({
        spam: context.spam || {},
        risk: context.risk || {},
        safety: context.safety || {},
        commitmentRisk: context.commitmentRisk || {},
        knowledgeConfidence: context.knowledgeConfidence || {},
        missingFields: context.missingFields || {},
        reply: context.reply || {},
        config: context.config || {},
      });
      return {
        contextPatch: decision,
        output: decision,
      };
    },

    human_feedback: async (context = {}) => {
      const feedback = {
        manualRiskOverride: context.emailPayload?.manualRiskOverride || null,
        manualArchive: context.emailPayload?.manualArchive || null,
        humanReview: context.emailPayload?.humanReview || null,
        editedReply: context.emailPayload?.editedReply || null,
      };
      return {
        contextPatch: { feedback },
        output: {
          recorded: Object.values(feedback).some(Boolean),
        },
      };
    },
  };

  skills.classify_email = skills.classify_email_risk;
  skills.review_risk = skills.check_commitment_risk;

  return skills;
}
