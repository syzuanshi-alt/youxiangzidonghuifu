export const EMAIL_AI_COLLECTIONS = {
  'model-providers': 'modelProviders',
  'risk-rules': 'riskRules',
  'spam-rules': 'spamRules',
  'knowledge-base': 'knowledgeBase',
  'prompt-templates': 'promptTemplates',
  'output-safety-rules': 'outputSafetyRules',
  'agent-skills': 'agentSkills',
};

export const EMAIL_AI_COLLECTION_LABELS = {
  modelProviders: '模型服务商',
  riskRules: '风险判定规则',
  spamRules: '垃圾邮件规则',
  knowledgeBase: '回复话术知识库',
  promptTemplates: '提示词模板',
  outputSafetyRules: '输出安全规则',
  agentSkills: 'Agent Skills',
};

export const RISK_LEVELS = ['low', 'medium', 'high'];
export const FINAL_ACTIONS = [
  'ignore_spam',
  'draft_only',
  'human_review',
  'auto_send_allowed',
  'blocked',
  'failed',
];

export function normalizeIdPrefix(value = 'item') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'item';
}

export function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on', '启用'].includes(value.trim().toLowerCase());
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

export function normalizeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

export function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function nowIso() {
  return new Date().toISOString();
}

export function mailText(emailPayload = {}) {
  return [
    emailPayload.senderEmail,
    emailPayload.sender,
    emailPayload.subject,
    emailPayload.body,
    emailPayload.bodyText,
    emailPayload.summary,
  ].filter(Boolean).join('\n').toLowerCase();
}

export function senderDomain(senderEmail = '') {
  const value = String(senderEmail).trim().toLowerCase();
  const atIndex = value.lastIndexOf('@');
  return atIndex >= 0 ? value.slice(atIndex + 1) : '';
}

export function includesAnyText(text, values = []) {
  const normalizedText = String(text || '').toLowerCase();
  return normalizeArray(values).some((value) => normalizedText.includes(value.toLowerCase()));
}

export function withoutSensitiveProviderFields(provider = {}, env = process.env) {
  const apiKeyEnvName = provider.apiKeyEnvName || provider.api_key_env_name || '';
  return {
    ...provider,
    apiKeyEnvName,
    api_key_env_name: undefined,
    apiKeyConfigured: Boolean(apiKeyEnvName && env[apiKeyEnvName]),
  };
}
