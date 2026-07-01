export const MODEL_OPTIONS = [
  {
    id: 'local-rule-agent',
    label: '本地规则智能体',
    description: '使用当前规则引擎和本地话术库，不连接真实大模型。',
    sourceStatus: '本地配置',
    realModelConnected: false,
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI 兼容模型',
    description: '预留给后续大模型 API，当前只记录配置，不发起调用。',
    sourceStatus: 'API 待接入',
    realModelConnected: false,
  },
  {
    id: 'enterprise-knowledge-agent',
    label: '企业知识库模型',
    description: '预留给业务知识库增强回复，当前不连接真实模型。',
    sourceStatus: 'API 待接入',
    realModelConnected: false,
  },
];

export const REPLY_STYLE_OPTIONS = [
  {
    value: 'standard',
    label: '标准客服',
    description: '语气清晰克制，适合默认回复。',
  },
  {
    value: 'conservative',
    label: '保守确认',
    description: '少承诺，只确认收到和补充信息。',
  },
  {
    value: 'detailed',
    label: '详细说明',
    description: '信息更完整，适合需要补材料或解释流程的场景。',
  },
];

export const KNOWLEDGE_BASE_OPTIONS = [
  {
    id: 'productKnowledge',
    label: '产品知识',
    description: '产品规格、适配、材质、使用方式。',
    required: false,
  },
  {
    id: 'aftersaleRules',
    label: '售后规则',
    description: '售后材料、问题图片、处理边界。',
    required: false,
  },
  {
    id: 'logisticsRules',
    label: '物流规则',
    description: '物流查询口径、承运商、时效禁用语。',
    required: false,
  },
  {
    id: 'creatorCollaboration',
    label: '达人合作',
    description: '合作门槛、账号信息、报价审批边界。',
    required: false,
  },
  {
    id: 'forbiddenExpressions',
    label: '禁用表达',
    description: '禁止退款、赔偿、改价、发货时间和法律承诺。',
    required: true,
  },
];

export const DEFAULT_AGENT_CONFIG = {
  modelId: 'local-rule-agent',
  replyStyle: 'standard',
  knowledgeBaseIds: KNOWLEDGE_BASE_OPTIONS.map((option) => option.id),
  candidateCount: 3,
  realModelConnected: false,
  sourceStatus: '本地配置 / API 待接入',
};

function optionIds(options, key = 'id') {
  return new Set(options.map((option) => option[key]));
}

function uniqueKnownIds(ids, knownIds) {
  return [...new Set(ids)].filter((id) => knownIds.has(id));
}

export function normalizeAgentConfig(config = {}) {
  const knownModelIds = optionIds(MODEL_OPTIONS);
  const knownStyleIds = optionIds(REPLY_STYLE_OPTIONS, 'value');
  const knownKnowledgeBaseIds = optionIds(KNOWLEDGE_BASE_OPTIONS);
  const requiredKnowledgeBaseIds = KNOWLEDGE_BASE_OPTIONS
    .filter((option) => option.required)
    .map((option) => option.id);

  const modelId = knownModelIds.has(config.modelId)
    ? config.modelId
    : DEFAULT_AGENT_CONFIG.modelId;
  const replyStyle = knownStyleIds.has(config.replyStyle)
    ? config.replyStyle
    : DEFAULT_AGENT_CONFIG.replyStyle;
  const selectedKnowledgeBaseIds = Array.isArray(config.knowledgeBaseIds)
    ? uniqueKnownIds(config.knowledgeBaseIds, knownKnowledgeBaseIds)
    : DEFAULT_AGENT_CONFIG.knowledgeBaseIds;
  const knowledgeBaseIds = [...new Set([
    ...selectedKnowledgeBaseIds,
    ...requiredKnowledgeBaseIds,
  ])];

  return {
    ...DEFAULT_AGENT_CONFIG,
    modelId,
    replyStyle,
    knowledgeBaseIds,
    candidateCount: Number.isFinite(Number(config.candidateCount))
      ? Math.max(1, Math.min(5, Number(config.candidateCount)))
      : DEFAULT_AGENT_CONFIG.candidateCount,
    realModelConnected: false,
    sourceStatus: '本地配置 / API 待接入',
  };
}

export function validateAgentConfig(config = {}) {
  const normalized = normalizeAgentConfig(config);
  const issues = [];
  const model = MODEL_OPTIONS.find((option) => option.id === normalized.modelId);
  const missingRequired = KNOWLEDGE_BASE_OPTIONS
    .filter((option) => option.required && !normalized.knowledgeBaseIds.includes(option.id))
    .map((option) => option.label);

  if (!model) {
    issues.push('智能体模型配置无效。');
  }

  if (missingRequired.length > 0) {
    issues.push(`必须启用知识库：${missingRequired.join('、')}。`);
  }

  if (normalized.realModelConnected !== false) {
    issues.push('当前阶段禁止在前端标记真实大模型已接入。');
  }

  return issues;
}

export function buildAgentRuntimeContext(config = {}) {
  const normalized = normalizeAgentConfig(config);
  const model = MODEL_OPTIONS.find((option) => option.id === normalized.modelId);
  const style = REPLY_STYLE_OPTIONS.find((option) => option.value === normalized.replyStyle);
  const knowledgeBases = KNOWLEDGE_BASE_OPTIONS
    .filter((option) => normalized.knowledgeBaseIds.includes(option.id));

  return {
    modelId: normalized.modelId,
    modelLabel: model?.label || '本地规则智能体',
    replyStyle: normalized.replyStyle,
    replyStyleLabel: style?.label || '标准客服',
    knowledgeBaseIds: knowledgeBases.map((option) => option.id),
    knowledgeBaseLabels: knowledgeBases.map((option) => option.label),
    sourceStatus: '本地配置 / API 待接入',
    realModelConnected: false,
    realSendEnabled: false,
  };
}
