import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { testModelProvider } from './model-adapters/index.js';
import { getPublishedEmailAIConfig } from './config-loader.js';
import { processEmailWithAI } from './process-email.js';
import { runEmailAITest } from './test-runner.js';
import {
  createEmailAIConfigDraft,
  listEmailAIConfigVersions,
  publishEmailAIConfigVersion,
  rollbackEmailAIConfigVersion,
} from './version-service.js';

const ADMIN_PREFIX = '/api/admin/email-ai-control';
const PROVIDER_SECRET_FIELDS = ['apiKeyValue', 'api_key_value', 'apiKey', 'api_key'];

function bearerToken(request) {
  const header = request.headers.authorization || request.headers.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function adminAuthError(env = {}) {
  if (!env.EMAIL_AI_ADMIN_TOKEN) {
    return {
      statusCode: 401,
      payload: {
        ok: false,
        error: 'email_ai_admin_token_missing',
        message: '请先在本地服务端配置 EMAIL_AI_ADMIN_TOKEN。',
      },
    };
  }
  return {
    statusCode: 401,
    payload: {
      ok: false,
      error: 'email_ai_admin_unauthorized',
      message: '无管理员权限访问邮件 AI 控制中心。',
    },
  };
}

function assertAdmin(request, env) {
  if (!env.EMAIL_AI_ADMIN_TOKEN || bearerToken(request) !== env.EMAIL_AI_ADMIN_TOKEN) {
    const error = new Error('无管理员权限访问邮件 AI 控制中心。');
    error.statusCode = 401;
    error.payload = adminAuthError(env).payload;
    throw error;
  }
}

export async function handleEmailAIAdminPasswordLoginRequest({
  body = {},
  env = {},
} = {}) {
  if (!env.EMAIL_AI_ADMIN_TOKEN) {
    return adminAuthError(env);
  }

  const password = String(body.password || '').trim();
  const expectedPassword = String(env.EMAIL_AI_ADMIN_PASSWORD || '').trim();

  if (!expectedPassword) {
    return {
      statusCode: 401,
      payload: {
        ok: false,
        error: 'email_ai_admin_password_missing',
        message: '请先在本地服务端配置 EMAIL_AI_ADMIN_PASSWORD。',
      },
    };
  }

  if (!password || password !== expectedPassword) {
    return {
      statusCode: 401,
      payload: {
        ok: false,
        error: 'email_ai_admin_password_invalid',
        message: '管理员密码不正确。',
      },
    };
  }

  return ok({
    adminToken: env.EMAIL_AI_ADMIN_TOKEN,
    message: '管理员权限已开启。',
  });
}

function assertWorkbench(request, env = {}) {
  if (!env.EMAIL_AI_WORKBENCH_TOKEN) return;
  if (bearerToken(request) !== env.EMAIL_AI_WORKBENCH_TOKEN) {
    const error = new Error('无权限调用邮件 AI 工作台处理接口。');
    error.statusCode = 401;
    error.payload = {
      ok: false,
      error: 'email_ai_workbench_unauthorized',
      message: '无权限调用邮件 AI 工作台处理接口。',
    };
    throw error;
  }
}

function pathParts(pathname) {
  return pathname
    .slice(ADMIN_PREFIX.length)
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
}

function ok(payload = {}, statusCode = 200) {
  return {
    statusCode,
    payload: {
      ok: true,
      ...payload,
    },
  };
}

function stripProviderSecretFields(input = {}) {
  const next = { ...input };
  PROVIDER_SECRET_FIELDS.forEach((field) => {
    delete next[field];
  });
  return next;
}

function providerSecretValue(input = {}) {
  const field = PROVIDER_SECRET_FIELDS.find((name) => input[name] !== undefined && input[name] !== null);
  if (!field) return '';
  return String(input[field] || '').trim();
}

function assertSafeEnvName(envName) {
  if (!/^[A-Z0-9_]+$/.test(envName)) {
    const error = new Error('API Key 环境变量名称只能包含大写字母、数字和下划线。');
    error.statusCode = 400;
    error.payload = {
      ok: false,
      error: 'email_ai_invalid_api_key_env_name',
      message: error.message,
    };
    throw error;
  }
}

function upsertEnvLine(content, key, value) {
  const lines = String(content || '').split(/\r?\n/);
  const safeValue = String(value || '').replace(/\r?\n/g, '');
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (line.trim().startsWith(`${key}=`)) {
      replaced = true;
      return `${key}=${safeValue}`;
    }
    return line;
  });

  if (!replaced) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1].trim() !== '') {
      nextLines.push('');
    }
    nextLines.push(`${key}=${safeValue}`);
  }

  return nextLines.join('\n');
}

async function writeLocalEnvSecret(envPath, envName, secretValue) {
  let content = '';
  try {
    content = await readFile(envPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await mkdir(dirname(envPath), { recursive: true });
  const nextContent = upsertEnvLine(content, envName, secretValue);
  await writeFile(envPath, nextContent.endsWith('\n') ? nextContent : `${nextContent}\n`, 'utf8');
}

async function saveProviderApiKeySecret({
  input,
  existingProvider,
  rootDir,
  env = {},
  envInfo = {},
} = {}) {
  const secretValue = providerSecretValue(input);
  if (!secretValue) return false;

  const envName = String(
    input.apiKeyEnvName
      || input.api_key_env_name
      || existingProvider?.apiKeyEnvName
      || '',
  ).trim();
  if (!envName) {
    const error = new Error('请先填写 API Key 环境变量名称，再保存 API Key。');
    error.statusCode = 400;
    error.payload = {
      ok: false,
      error: 'email_ai_api_key_env_name_required',
      message: error.message,
    };
    throw error;
  }

  assertSafeEnvName(envName);
  const envPath = envInfo.path || join(rootDir || process.cwd(), '.env.local');
  await writeLocalEnvSecret(envPath, envName, secretValue);
  env[envName] = secretValue;
  if (envInfo) {
    envInfo.loaded = true;
    envInfo.path = envPath;
  }
  return true;
}

export async function handleEmailAIProcessRequest({
  request,
  body,
  repository,
  rootDir,
  env,
  fetchImpl,
} = {}) {
  assertWorkbench(request, env);
  const result = await processEmailWithAI({
    emailId: body.emailId || body.email_id,
    senderEmail: body.senderEmail || body.sender_email || body.sender || '',
    subject: body.subject || '',
    body: body.body || body.bodyText || body.body_text || body.body_plain_text || body.summary || '',
    bodyText: body.bodyText || body.body_text || body.body || body.body_plain_text || '',
    body_text: body.body_text || body.bodyText || body.body || body.body_plain_text || '',
    body_plain_text: body.body_plain_text || '',
    summary: body.summary || '',
    orderInfo: body.orderInfo || body.order_info || {},
    customerHistory: body.customerHistory || body.customer_history || {},
    source: body.source || 'email_auto_reply_workbench',
  }, {
    repository,
    rootDir,
    env,
    fetchImpl,
  });

  return {
    statusCode: result.success ? 200 : 500,
    payload: result,
  };
}

function pickProviderSummary(config = {}, usageType = 'reply_generation') {
  const providers = (config.modelProviders || []).filter((provider) => provider.enabled !== false);
  return providers.find((provider) => provider.usageType === usageType)
    || providers.find((provider) => provider.usageType === 'both')
    || providers.find((provider) => provider.isFallback || provider.usageType === 'fallback')
    || providers[0]
    || null;
}

function publicProviderSummary(provider = {}, env = {}) {
  const apiKeyEnvName = provider.apiKeyEnvName || '';
  return {
    id: provider.id || '',
    name: provider.name || provider.providerKey || '',
    providerKey: provider.providerKey || '',
    defaultModel: provider.defaultModel || '',
    usageType: provider.usageType || '',
    enabled: provider.enabled !== false,
    isFallback: provider.isFallback === true,
    apiKeyEnvName,
    apiKeyConfigured: Boolean(apiKeyEnvName && env[apiKeyEnvName]),
  };
}

export async function handleEmailAIStatusRequest({
  request,
  repository,
  rootDir,
  env = {},
} = {}) {
  assertWorkbench(request, env);
  const config = await getPublishedEmailAIConfig({ repository, rootDir });
  const riskProvider = pickProviderSummary(config, 'risk_check');
  const replyProvider = pickProviderSummary(config, 'reply_generation');

  return ok({
    configVersionId: config.version?.id || '',
    versionName: config.version?.versionName || '',
    status: config.version?.status || '',
    publishedAt: config.version?.publishedAt || null,
    model: {
      riskModelProvider: riskProvider?.name || riskProvider?.providerKey || '',
      riskModel: riskProvider?.defaultModel || '',
      replyModelProvider: replyProvider?.name || replyProvider?.providerKey || '',
      replyModel: replyProvider?.defaultModel || '',
    },
    strategyConfig: config.strategyConfig || {},
    providers: (config.modelProviders || []).map((provider) => publicProviderSummary(provider, env)),
  });
}

export async function handleEmailAIAdminRequest({
  request,
  requestUrl,
  body = {},
  repository,
  rootDir,
  env,
  envInfo,
  fetchImpl,
} = {}) {
  assertAdmin(request, env);
  const [resource, id, action] = pathParts(requestUrl.pathname);
  const method = request.method || 'GET';

  if (!resource) {
    const store = await repository.readStore();
    return ok({ store: repository.sanitizeStoreForResponse(store) });
  }

  if (resource === 'versions') {
    if (method === 'GET' && !id) {
      return ok(await listEmailAIConfigVersions({ repository, rootDir }));
    }

    if (method === 'POST' && id === 'create-draft') {
      const version = await createEmailAIConfigDraft(body, { repository, rootDir });
      return ok({ version }, 201);
    }

    if (method === 'POST' && id && action === 'publish') {
      const version = await publishEmailAIConfigVersion(id, body, { repository, rootDir });
      return ok({ published: version });
    }

    if (method === 'POST' && id && action === 'rollback') {
      const version = await rollbackEmailAIConfigVersion(id, body, { repository, rootDir });
      return ok({ published: version });
    }
  }

  if (resource === 'test' && method === 'POST') {
    const testResult = await runEmailAITest(body, {
      repository,
      rootDir,
      env,
      fetchImpl,
    });
    return ok(testResult);
  }

  if (resource === 'model-providers' && id && action === 'test' && method === 'POST') {
    const providers = await repository.list('model-providers');
    const provider = providers.find((item) => item.id === id);
    if (!provider) {
      return {
        statusCode: 404,
        payload: {
          ok: false,
          error: 'email_ai_provider_not_found',
          message: '未找到模型服务商。',
        },
      };
    }
    return ok({ result: await testModelProvider(provider, env) });
  }

  if (['model-providers', 'risk-rules', 'spam-rules', 'knowledge-base', 'prompt-templates', 'output-safety-rules', 'agent-skills'].includes(resource)) {
    if (method === 'GET' && !id) {
      return ok({ items: await repository.list(resource) });
    }
    if (method === 'POST' && !id) {
      if (resource === 'model-providers') {
        const secretSaved = await saveProviderApiKeySecret({
          input: body,
          rootDir,
          env,
          envInfo,
        });
        return ok({
          item: await repository.create(resource, stripProviderSecretFields(body)),
          ...(secretSaved ? { secretSaved } : {}),
        }, 201);
      }
      return ok({ item: await repository.create(resource, body) }, 201);
    }
    if (['PUT', 'PATCH'].includes(method) && id) {
      if (resource === 'model-providers') {
        const providers = await repository.list(resource);
        const existingProvider = providers.find((item) => item.id === id);
        const secretSaved = await saveProviderApiKeySecret({
          input: body,
          existingProvider,
          rootDir,
          env,
          envInfo,
        });
        return ok({
          item: await repository.update(resource, id, stripProviderSecretFields(body)),
          ...(secretSaved ? { secretSaved } : {}),
        });
      }
      return ok({ item: await repository.update(resource, id, body) });
    }
    if (method === 'DELETE' && id) {
      return ok({ removed: await repository.remove(resource, id) });
    }
  }

  return {
    statusCode: 404,
    payload: {
      ok: false,
      error: 'email_ai_api_not_found',
      message: '未开放该邮件 AI 控制中心接口。',
    },
  };
}

export function normalizeEmailAIHttpError(error) {
  return {
    statusCode: error.statusCode || 500,
    payload: error.payload || {
      ok: false,
      error: error.errorCode || 'email_ai_control_error',
      message: error.message,
    },
  };
}
