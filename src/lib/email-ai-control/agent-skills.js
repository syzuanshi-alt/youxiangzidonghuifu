import {
  detectCustomerLanguage,
  translateCustomerMessageToChinese,
} from '../../emailTranslation.js';
import { generateEmailAIReply } from './reply-generator.js';
import { evaluateRiskRules } from './risk-rule-engine.js';
import { evaluateSpamRules } from './spam-rule-engine.js';
import { matchKnowledgeBase } from './knowledge-base-matcher.js';
import { checkOutputSafety } from './output-safety-checker.js';

function emailOriginalText(emailPayload = {}) {
  return [
    emailPayload.subject,
    emailPayload.body,
    emailPayload.bodyText,
    emailPayload.body_text,
    emailPayload.summary,
  ].filter(Boolean).join('\n');
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
  return {
    translate_global_language: async (context = {}) => {
      const original = emailOriginalText(context.emailPayload);
      const customerLanguage = context.emailPayload?.customerLanguage || languageDetector(original);
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

    classify_email: async (context = {}) => {
      const spam = spamRuleEvaluator(context.emailPayload, context.config);
      const risk = spam.isSpam
        ? {
          level: 'low',
          reasons: ['邮件已命中垃圾邮件规则，不继续生成正常回复。'],
          matchedRules: [],
          suggestedAction: 'ignore_spam',
        }
        : riskRuleEvaluator(context.emailPayload, context.config);
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
        },
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

    review_risk: async (context = {}) => {
      const safetyBase = safetyChecker(context.reply || {}, context.config);
      const highRiskReasons = context.risk?.level === 'high'
        ? ['高风险邮件必须人工审核，禁止自动发送。']
        : [];
      const safety = {
        ...safetyBase,
        needHumanReview: safetyBase.needHumanReview || context.risk?.level === 'high',
        reasons: [
          ...(safetyBase.reasons || []),
          ...highRiskReasons,
        ],
      };
      return {
        contextPatch: { safety },
        output: safety,
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
}
