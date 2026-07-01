import { getPublishedEmailAIConfig } from './config-loader.js';
import { createEmailAgentSkills } from './agent-skills.js';
import { runEmailAgent } from './email-agent.js';
import { pickModelProvider } from './model-adapters/index.js';
import { detectCustomerLanguage } from '../../emailTranslation.js';

function modelSummary(config = {}, replyProvider = null) {
  const riskProvider = pickModelProvider(config, 'risk_check');
  return {
    riskModelProvider: riskProvider?.name || riskProvider?.providerKey || '',
    riskModel: riskProvider?.defaultModel || '',
    replyModelProvider: replyProvider?.name || replyProvider?.providerKey || '',
    replyModel: replyProvider?.defaultModel || '',
  };
}

function lowRiskFinalAction(risk = {}, config = {}) {
  const suggestedAction = risk.suggestedAction || '';
  if (suggestedAction === 'block_auto_reply') return 'blocked';
  if (suggestedAction === 'human_review' || suggestedAction === 'internal_note_only') return 'human_review';

  const configuredAction = config.strategyConfig?.lowRiskDefaultAction || suggestedAction || 'draft_only';
  return configuredAction === 'auto_send_allowed' ? 'auto_send_allowed' : 'draft_only';
}

function finalActionFromResult({ spam, risk, safety, config }) {
  if (spam.isSpam) return 'ignore_spam';
  if (safety.blocked) return 'blocked';
  if (risk.level === 'high') return 'human_review';
  if (risk.level === 'medium' || safety.needHumanReview) return 'human_review';
  return lowRiskFinalAction(risk, config);
}

function failedResult(emailPayload, error) {
  const customerLanguage = emailPayload.customerLanguage
    || detectCustomerLanguage([
      emailPayload.subject,
      emailPayload.bodyText || emailPayload.body_text || emailPayload.body || emailPayload.summary,
    ].filter(Boolean).join('\n'));

  return {
    success: false,
    source: emailPayload.source || 'email_auto_reply_workbench',
    customerLanguage,
    configVersionId: '',
    spam: {
      isSpam: false,
      confidence: 0,
      matchedRules: [],
    },
    risk: {
      level: 'medium',
      reasons: ['AI 处理失败，默认交由人工确认。'],
      matchedRules: [],
    },
    knowledgeBaseRefs: [],
    reply: {
      draft: '',
      internalSuggestion: '',
      tone: 'internal',
    },
    safety: {
      needHumanReview: true,
      blocked: false,
      reasons: ['AI 处理失败。'],
    },
    finalAction: 'failed',
    model: {},
    error: error.message,
  };
}

export async function processEmailWithAI(emailPayload = {}, {
  repository = null,
  rootDir = process.cwd(),
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  try {
    const customerLanguage = emailPayload.customerLanguage
      || detectCustomerLanguage([
        emailPayload.subject,
        emailPayload.bodyText || emailPayload.body_text || emailPayload.body || emailPayload.summary,
      ].filter(Boolean).join('\n'));
    const payloadWithLanguage = {
      ...emailPayload,
      customerLanguage,
    };
    const config = await getPublishedEmailAIConfig({ repository, rootDir });
    const {
      context,
      agentTrace,
    } = await runEmailAgent({
      emailPayload: payloadWithLanguage,
      config,
      skills: createEmailAgentSkills(),
      env,
      fetchImpl,
    });
    const spam = context.spam || { isSpam: false, confidence: 0, matchedRules: [] };
    const risk = context.risk || {
      level: 'medium',
      reasons: ['未完成风险判定，默认交由人工确认。'],
      matchedRules: [],
    };
    const knowledge = context.knowledge || { entries: [], refs: [] };
    const reply = context.reply || {
      draft: '',
      internalSuggestion: '',
      tone: 'internal',
      customerLanguage: context.customerLanguage || customerLanguage,
    };
    const safety = context.safety || {
      needHumanReview: true,
      blocked: false,
      reasons: ['未完成输出安全审核，默认交由人工确认。'],
    };
    const finalAction = context.finalAction || finalActionFromResult({
      spam,
      risk,
      safety,
      config,
    });

    return {
      success: true,
      source: payloadWithLanguage.source || 'email_auto_reply_workbench',
      customerLanguage,
      configVersionId: config.version?.id || 'mock-default',
      spam: {
        isSpam: spam.isSpam,
        confidence: spam.confidence,
        matchedRules: spam.matchedRules,
      },
      risk: {
        level: risk.level,
        reasons: risk.reasons || [],
        matchedRules: risk.matchedRules || [],
      },
      knowledgeBaseRefs: knowledge.refs || [],
      intent: context.intent || null,
      emotion: context.emotion || null,
      knowledgeConfidence: context.knowledgeConfidence || null,
      missingFields: context.missingFields || null,
      reply,
      commitmentRisk: context.commitmentRisk || {
        blocked: false,
        reasons: [],
        matchedPatterns: [],
      },
      safety: {
        needHumanReview: safety.needHumanReview,
        blocked: safety.blocked,
        reasons: safety.reasons,
      },
      finalAction,
      decisionReasons: context.decisionReasons || [],
      model: modelSummary(config, context.replyProvider),
      agentTrace,
    };
  } catch (error) {
    return failedResult(emailPayload, error);
  }
}
