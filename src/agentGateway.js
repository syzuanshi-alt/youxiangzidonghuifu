import { getMailRiskState } from './riskState.js';

export const DEFAULT_AGENT_GATEWAY_CONFIG = {
  enabled: false,
  baseUrl: '',
  agentId: '',
  scene: 'email_auto_reply',
  language: 'en',
  tone: 'natural_customer_service',
  timeoutMs: 8000,
  fallbackToLocal: true,
  invocationMode: 'manual',
};

const MAX_TIMEOUT_MS = 30000;
const MIN_TIMEOUT_MS = 1000;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanBaseUrl(value) {
  return trimString(value).replace(/\/+$/, '');
}

function clampTimeout(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_AGENT_GATEWAY_CONFIG.timeoutMs;
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, numeric));
}

function isLocalHttpUrl(url) {
  return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
}

function safeJson(value) {
  return value && typeof value === 'object' ? value : {};
}

export function normalizeAgentGatewayConfig(config = {}) {
  return {
    ...DEFAULT_AGENT_GATEWAY_CONFIG,
    enabled: config.enabled === true,
    baseUrl: cleanBaseUrl(config.baseUrl),
    agentId: trimString(config.agentId),
    scene: trimString(config.scene) || DEFAULT_AGENT_GATEWAY_CONFIG.scene,
    language: trimString(config.language) || DEFAULT_AGENT_GATEWAY_CONFIG.language,
    tone: trimString(config.tone) || DEFAULT_AGENT_GATEWAY_CONFIG.tone,
    timeoutMs: clampTimeout(config.timeoutMs),
    fallbackToLocal: config.fallbackToLocal !== false,
    invocationMode: config.invocationMode === 'auto' ? 'auto' : 'manual',
  };
}

export function validateAgentGatewayConfig(config = {}) {
  const normalized = normalizeAgentGatewayConfig(config);
  const issues = [];

  if (!normalized.enabled) return issues;

  if (!normalized.baseUrl) {
    issues.push('启用外部智能体渠道时必须填写 Agent Gateway 地址。');
  }

  if (!normalized.agentId) {
    issues.push('启用外部智能体渠道时必须填写 agentId。');
  }

  if (normalized.baseUrl) {
    try {
      const url = new URL(normalized.baseUrl);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalHttpUrl(url))) {
        issues.push('Agent Gateway 公网地址必须使用 HTTPS；本地调试仅允许 localhost / 127.0.0.1。');
      }
    } catch {
      issues.push('Agent Gateway 地址格式无效。');
    }
  }

  return issues;
}

export function buildAgentGatewayInvokeRequest({
  config = {},
  mail = {},
  agentConfig = {},
  candidateCount,
} = {}) {
  const normalized = normalizeAgentGatewayConfig(config);
  const riskState = getMailRiskState(mail);
  const url = `${normalized.baseUrl}/agents/${encodeURIComponent(normalized.agentId)}/invoke`;
  const requestedCandidateCount = Number.isFinite(Number(candidateCount))
    ? Number(candidateCount)
    : Number(agentConfig.candidateCount || 3);
  const payload = {
    scene: normalized.scene,
    input: {
      subject: mail.subject || '',
      body: mail.bodyText || mail.summary || '',
      summary: mail.summary || '',
      sender: mail.sender || '',
      receivedAt: mail.receivedAt || '',
      attachments: Array.isArray(mail.attachments) ? mail.attachments : [],
      riskContext: {
        risk: riskState.risk || '',
        action: riskState.action || '',
        category: mail.category || '',
        reason: mail.reason || '',
        requiresReview: mail.requiresReview === true,
        templateId: mail.templateId || null,
      },
      businessContext: {
        sourceStatus: mail.sourceStatus || '',
        threadId: mail.threadId || mail.thread_id || null,
        messageId: mail.messageId || mail.message_id || mail.id || null,
      },
    },
    options: {
      language: normalized.language,
      tone: normalized.tone,
      candidateCount: Math.max(1, Math.min(5, requestedCandidateCount)),
      fallbackToLocal: normalized.fallbackToLocal,
    },
    context: {
      currentProjectRole: 'caller_only',
      agentCodeEmbedded: false,
      sendActionAllowed: false,
    },
  };

  return {
    url,
    method: 'POST',
    timeoutMs: normalized.timeoutMs,
    payload,
  };
}

function normalizeOutputToCandidate(output, index, { mail = {}, config = {} } = {}) {
  const normalized = normalizeAgentGatewayConfig(config);
  const riskState = getMailRiskState(mail);
  const content = trimString(output.content || output.text || output.message);
  if (!content) return null;
  const safeSendable = output.sendable !== false && !riskState.urgent && !riskState.spam;
  const requiresReview = output.requiresReview === true || mail.requiresReview === true || riskState.risk === 'medium' || riskState.urgent;

  return {
    candidateId: `AGENT-${normalized.agentId || 'external'}-${mail.id || 'mail'}-${index + 1}`,
    label: trimString(output.label) || `外部智能体候选 ${index + 1}`,
    variant: 'agent_gateway',
    content,
    editable: true,
    sendable: safeSendable,
    requiresReview,
    action: riskState.action || '',
    risk: riskState.risk || '',
    allowsRealSend: false,
    source: 'agent_gateway',
    confidence: Number.isFinite(Number(output.confidence)) ? Number(output.confidence) : null,
    agent: {
      gatewayUrl: normalized.baseUrl,
      agentId: normalized.agentId,
      scene: normalized.scene,
      language: normalized.language,
      tone: normalized.tone,
      sourceStatus: '外部 Agent Gateway',
      realModelConnected: true,
    },
  };
}

export function normalizeAgentGatewayResponse(response = {}, context = {}) {
  const body = safeJson(response);
  const outputs = Array.isArray(body.outputs)
    ? body.outputs
    : Array.isArray(body.candidates)
      ? body.candidates
      : [];
  const candidates = outputs
    .filter((output) => !output.type || output.type === 'reply_candidate')
    .map((output, index) => normalizeOutputToCandidate(output, index, context))
    .filter(Boolean);

  return {
    ok: body.status !== 'error' && safeJson(body.safety).blocked !== true,
    status: body.status || 'success',
    candidates,
    safety: safeJson(body.safety),
    fallbackReason: body.fallbackReason || '',
    raw: body,
  };
}

export async function invokeAgentGateway({
  config = {},
  mail = {},
  agentConfig = {},
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalized = normalizeAgentGatewayConfig(config);
  const issues = validateAgentGatewayConfig(normalized);

  if (!normalized.enabled) {
    return {
      ok: false,
      status: 'disabled',
      candidates: [],
      safety: {},
      fallbackReason: '外部智能体渠道未启用。',
      issues,
    };
  }

  if (issues.length) {
    return {
      ok: false,
      status: 'invalid_config',
      candidates: [],
      safety: {},
      fallbackReason: issues[0],
      issues,
    };
  }

  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      status: 'fetch_unavailable',
      candidates: [],
      safety: {},
      fallbackReason: '当前环境不可调用 Agent Gateway。',
      issues: [],
    };
  }

  const request = buildAgentGatewayInvokeRequest({
    config: normalized,
    mail,
    agentConfig,
  });

  try {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request.payload),
    });

    const body = await response.json();
    if (!response.ok) {
      return {
        ok: false,
        status: 'request_failed',
        candidates: [],
        safety: safeJson(body.safety),
        fallbackReason: body.message || `Agent Gateway 返回 ${response.status}`,
        raw: body,
      };
    }

    return normalizeAgentGatewayResponse(body, {
      mail,
      config: normalized,
    });
  } catch (error) {
    return {
      ok: false,
      status: 'request_error',
      candidates: [],
      safety: {},
      fallbackReason: error.message || 'Agent Gateway 请求失败。',
    };
  }
}
