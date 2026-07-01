import { testCustomConnection } from './custom-adapter.js';

export async function callAnthropicModel(args = {}) {
  return {
    draft: '',
    internalSuggestion: 'Anthropic adapter placeholder: local execution uses Local Mock until real provider calls are enabled.',
    tone: 'internal',
    provider: args.provider?.providerKey || 'anthropic',
  };
}

export async function testAnthropicConnection(provider = {}, env = process.env) {
  return testCustomConnection(provider, env);
}
