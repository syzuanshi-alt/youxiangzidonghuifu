export async function callCustomModel() {
  return {
    draft: '',
    internalSuggestion: 'Custom API adapter is configured as a placeholder. Enable Local Mock for local tests.',
    tone: 'internal',
  };
}

export async function testCustomConnection(provider = {}, env = process.env) {
  const apiKeyEnvName = provider.apiKeyEnvName || '';
  return {
    ok: Boolean(provider.baseUrl && (!apiKeyEnvName || env[apiKeyEnvName])),
    status: provider.baseUrl ? 'configured' : 'missing_base_url',
    checkedAt: new Date().toISOString(),
    message: provider.baseUrl ? 'Custom API 基础配置存在；真实调用仍需接入适配器。' : '缺少 base url。',
  };
}
