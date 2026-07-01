export async function readJsonPayload(response, fallbackMessage = '接口请求失败。') {
  const contentType = response?.headers?.get?.('content-type') || '';

  if (!String(contentType).toLowerCase().includes('application/json')) {
    await response?.text?.().catch(() => '');
    throw new Error(`${fallbackMessage} 本地控制服务未启动或接口不可用，请使用 npm run dev:api 启动后重试。`);
  }

  return response.json();
}
