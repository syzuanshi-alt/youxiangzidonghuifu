import { testCustomConnection } from './custom-adapter.js';

function providerKey(provider = {}) {
  return String(provider.providerKey || provider.provider_key || '').toLowerCase();
}

function defaultBaseUrl(provider = {}) {
  const key = providerKey(provider);
  if (key.includes('deepseek')) return 'https://api.deepseek.com';
  if (key.includes('openrouter')) return 'https://openrouter.ai/api/v1';
  if (key.includes('openai')) return 'https://api.openai.com/v1';
  return '';
}

function chatCompletionsUrl(provider = {}) {
  const baseUrl = String(provider.baseUrl || provider.base_url || defaultBaseUrl(provider)).trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('模型服务商缺少 base url。');
  }
  return baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
}

function readProviderNumber(provider = {}, camelKey, snakeKey, fallback) {
  const value = provider[camelKey] ?? provider[snakeKey];
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function buildMessages(args = {}) {
  const prompt = args.prompt || {};
  const systemPrompt = prompt.systemPrompt || prompt.system_prompt || 'You are a safe customer service email assistant.';
  const taskPrompt = prompt.taskPrompt || prompt.task_prompt || JSON.stringify({
    emailPayload: args.emailPayload || {},
    risk: args.risk || {},
    knowledgeEntries: args.knowledgeEntries || [],
  }, null, 2);

  return [
    { role: 'system', content: String(systemPrompt || '') },
    { role: 'user', content: String(taskPrompt || '') },
  ];
}

function parseModelContent(content = '', args = {}) {
  const text = String(content || '').trim();
  if (!text) {
    return {
      draft: '',
      internalSuggestion: '',
      tone: args.risk?.level === 'high' ? 'internal' : 'polite',
    };
  }

  try {
    const parsed = JSON.parse(text);
    const reply = parsed.reply || parsed;
    return {
      draft: String(reply.draft || reply.customerReply || reply.customer_reply || ''),
      internalSuggestion: String(reply.internalSuggestion || reply.internal_suggestion || parsed.internalSuggestion || ''),
      translationZh: String(reply.translationZh || reply.translation_zh || parsed.translationZh || parsed.translation_zh || ''),
      tone: String(reply.tone || parsed.tone || (args.risk?.level === 'high' ? 'internal' : 'polite')),
    };
  } catch {
    if (args.risk?.level === 'high') {
      return {
        draft: '',
        internalSuggestion: text,
        tone: 'internal',
      };
    }
    return {
      draft: text,
      internalSuggestion: '',
      tone: 'polite',
    };
  }
}

export async function callOpenAIModel(args = {}) {
  const provider = args.provider || {};
  const env = args.env || process.env;
  const fetchImpl = args.fetchImpl || fetch;
  const apiKeyEnvName = provider.apiKeyEnvName || provider.api_key_env_name || '';
  const apiKey = apiKeyEnvName ? env[apiKeyEnvName] : '';

  if (apiKeyEnvName && !apiKey) {
    throw new Error(`模型服务商缺少环境变量 ${apiKeyEnvName}。`);
  }

  const timeoutMs = readProviderNumber(provider, 'timeoutMs', 'timeout_ms', 30000);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), Math.max(timeoutMs, 1000))
    : null;

  try {
    const response = await fetchImpl(chatCompletionsUrl(provider), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: provider.defaultModel || provider.default_model || 'gpt-4o-mini',
        messages: buildMessages(args),
        temperature: readProviderNumber(provider, 'temperature', 'temperature', 0.2),
        max_tokens: readProviderNumber(provider, 'maxTokens', 'max_tokens', 1200),
      }),
      ...(controller ? { signal: controller.signal } : {}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`模型调用失败：HTTP ${response.status} ${errorText.slice(0, 300)}`);
    }

    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content
      || payload.choices?.[0]?.text
      || payload.output_text
      || '';
    return {
      ...parseModelContent(content, args),
      provider: provider.providerKey || provider.provider_key || 'openai',
      raw: payload,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`模型调用超时：${timeoutMs}ms。`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function testOpenAIConnection(provider = {}, env = process.env) {
  const baseCheck = await testCustomConnection(provider, env);
  const apiKeyEnvName = provider.apiKeyEnvName || provider.api_key_env_name || '';
  const missingKey = apiKeyEnvName && !env[apiKeyEnvName];

  if (!provider.baseUrl && !provider.base_url && !defaultBaseUrl(provider)) {
    return {
      ...baseCheck,
      ok: false,
      message: '缺少 base url。',
    };
  }

  if (missingKey) {
    return {
      ...baseCheck,
      ok: false,
      status: 'missing_api_key',
      message: `缺少 API Key 环境变量 ${apiKeyEnvName}，请在模型表单里填写 API Key 后保存。`,
    };
  }

  return {
    ...baseCheck,
    ok: true,
    status: 'configured',
    message: '模型基础配置已通过：base url 和 API Key 已配置。',
  };
}
