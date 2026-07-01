import {
  callAnthropicModel,
  testAnthropicConnection,
} from './anthropic-adapter.js';
import {
  callCustomModel,
  testCustomConnection,
} from './custom-adapter.js';
import {
  callMockModel,
  testMockConnection,
} from './mock-adapter.js';
import {
  callOpenAIModel,
  testOpenAIConnection,
} from './openai-adapter.js';

function providerKey(provider = {}) {
  return String(provider.providerKey || provider.provider_key || '').toLowerCase();
}

export function pickModelProvider(config = {}, usageType = 'reply_generation') {
  const providers = (config.modelProviders || []).filter((provider) => provider.enabled !== false);
  const exact = providers.find((provider) => provider.usageType === usageType);
  const both = providers.find((provider) => provider.usageType === 'both');
  const fallback = providers.find((provider) => provider.isFallback || provider.usageType === 'fallback');
  return exact || both || fallback || providers[0] || {
    id: 'provider-local-mock',
    name: 'Local Mock',
    providerKey: 'local_mock',
    defaultModel: 'local-mock-email-ai',
  };
}

export async function callModel(args = {}) {
  const key = providerKey(args.provider);
  if (!key || key.includes('mock') || key === 'local_mock') return callMockModel(args);
  if (key.includes('openai') || key.includes('openrouter') || key.includes('deepseek') || key.includes('qwen') || key.includes('gemini')) {
    return callOpenAIModel(args);
  }
  if (key.includes('claude') || key.includes('anthropic')) return callAnthropicModel(args);
  return callCustomModel(args);
}

export async function testModelProvider(provider = {}, env = process.env) {
  const key = providerKey(provider);
  if (!key || key.includes('mock') || key === 'local_mock') return testMockConnection(provider, env);
  if (key.includes('openai') || key.includes('openrouter') || key.includes('deepseek') || key.includes('qwen') || key.includes('gemini')) {
    return testOpenAIConnection(provider, env);
  }
  if (key.includes('claude') || key.includes('anthropic')) return testAnthropicConnection(provider, env);
  return testCustomConnection(provider, env);
}
