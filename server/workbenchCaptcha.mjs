function readBooleanEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

export function buildWorkbenchCaptchaConfig(env = {}) {
  const required = readBooleanEnv(env.WORKBENCH_CAPTCHA_REQUIRED, false);
  const provider = String(env.WORKBENCH_CAPTCHA_PROVIDER || (required ? 'turnstile' : 'disabled')).trim().toLowerCase();

  return {
    required,
    provider,
    siteKey: provider === 'turnstile' ? String(env.TURNSTILE_SITE_KEY || '').trim() : '',
  };
}

export async function verifyWorkbenchCaptcha({
  env = {},
  token = '',
  fetchImpl = fetch,
  remoteIp = '',
} = {}) {
  const config = buildWorkbenchCaptchaConfig(env);
  if (!config.required) {
    return { ok: true, skipped: true };
  }

  const captchaToken = String(token || '').trim();
  if (!captchaToken) {
    return {
      ok: false,
      error: 'workbench_captcha_required',
      message: '请先完成人机真人验证。',
    };
  }

  if (config.provider !== 'turnstile') {
    return {
      ok: false,
      error: 'workbench_captcha_provider_unsupported',
      message: '真人验证服务未正确配置。',
    };
  }

  const secretKey = String(env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secretKey) {
    return {
      ok: false,
      error: 'workbench_captcha_secret_missing',
      message: '真人验证密钥未配置。',
    };
  }

  const form = new URLSearchParams();
  form.set('secret', secretKey);
  form.set('response', captchaToken);
  if (remoteIp) form.set('remoteip', remoteIp);

  const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success !== true) {
    return {
      ok: false,
      error: 'workbench_captcha_invalid',
      message: '真人验证失败，请重试。',
    };
  }

  return { ok: true };
}
