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

function normalizeTurnstileErrorCodes(payload = {}) {
  const codes = Array.isArray(payload['error-codes']) ? payload['error-codes'] : [];
  return codes.map((code) => String(code || '').trim()).filter(Boolean);
}

function messageForTurnstileErrorCodes(errorCodes = []) {
  if (errorCodes.includes('invalid-input-secret') || errorCodes.includes('missing-input-secret')) {
    return '真人验证失败：Turnstile Secret Key 不正确，或与 Site Key 不属于同一个 widget。请检查 Railway 的 TURNSTILE_SECRET_KEY。';
  }
  if (errorCodes.includes('invalid-input-response') || errorCodes.includes('missing-input-response')) {
    return '真人验证失败：验证码结果无效或未提交，请刷新页面后重新验证。';
  }
  if (errorCodes.includes('timeout-or-duplicate')) {
    return '真人验证已过期或被重复使用，请重新完成验证后再提交。';
  }
  if (errorCodes.includes('bad-request')) {
    return '真人验证失败：验证请求格式异常，请刷新页面后重试。';
  }
  if (errorCodes.includes('internal-error')) {
    return '真人验证服务临时异常，请稍后重试。';
  }
  return '真人验证失败，请重试。';
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
    const errorCodes = normalizeTurnstileErrorCodes(payload);
    return {
      ok: false,
      error: 'workbench_captcha_invalid',
      errorCodes,
      message: messageForTurnstileErrorCodes(errorCodes),
    };
  }

  return { ok: true };
}
