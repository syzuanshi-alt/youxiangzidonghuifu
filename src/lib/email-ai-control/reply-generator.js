import {
  callModel,
  pickModelProvider,
} from './model-adapters/index.js';
import { renderPrompt } from './prompt-renderer.js';

export async function generateEmailAIReply({
  emailPayload = {},
  config = {},
  spam = {},
  risk = {},
  knowledge = { entries: [], refs: [] },
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const provider = pickModelProvider(config, 'reply_generation');

  if (spam.isSpam) {
    return {
      reply: {
        draft: '',
        internalSuggestion: '该邮件命中垃圾邮件规则，不生成客户回复。',
        tone: 'internal',
      },
      provider,
      prompt: null,
    };
  }

  const prompt = renderPrompt({
    config,
    promptType: 'reply_generation',
    emailPayload,
    spam,
    risk,
    knowledgeBaseRefs: knowledge.refs || [],
    knowledgeBaseEntries: knowledge.entries || [],
  });

  const modelReply = await callModel({
    mode: 'reply',
    provider,
    emailPayload,
    risk,
    knowledgeEntries: knowledge.entries || [],
    prompt,
    env,
    fetchImpl,
  });

  return {
    reply: {
      draft: modelReply.draft || '',
      internalSuggestion: modelReply.internalSuggestion || '',
      translationZh: modelReply.translationZh || '',
      customerLanguage: modelReply.customerLanguage || emailPayload.customerLanguage || null,
      tone: modelReply.tone || (risk.level === 'high' ? 'internal' : 'polite'),
    },
    provider,
    prompt,
  };
}
