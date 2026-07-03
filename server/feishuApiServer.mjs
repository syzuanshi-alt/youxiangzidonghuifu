import { createReadStream } from 'node:fs';
import { appendFile, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLocalEnv } from './envLoader.mjs';
import { createWorkbenchAuthStore } from './workbenchAuthStore.mjs';
import {
  buildWorkbenchCaptchaConfig,
  verifyWorkbenchCaptcha,
} from './workbenchCaptcha.mjs';
import { buildClosedLoopBatch } from '../src/closedLoopWorkflow.js';
import {
  buildSendContextFromFeishuMessages,
  mapFeishuMessageToMail,
} from '../src/feishuAdapter.js';
import {
  isCompletedProcessingStatus,
} from '../src/processingStatus.js';
import {
  createEmailAIStoreRepository,
  mapEmailAIResultToWorkbenchMail,
  processEmailWithAI,
} from '../src/lib/email-ai-control/index.js';
import {
  handleEmailAIAdminRequest,
  handleEmailAIAdminPasswordLoginRequest,
  handleEmailAIProcessRequest,
  handleEmailAIStatusRequest,
  normalizeEmailAIHttpError,
} from '../src/lib/email-ai-control/http-handlers.js';
import { applyRiskOverrideToMail } from '../src/riskOverrides.js';
import { evaluateSendGuard } from '../src/sendGuard.js';
import {
  DEFAULT_FEISHU_MAIL_PAGE_SIZE,
  assertFeishuApiSuccess,
  buildFeishuBatchGetUserIdRequest,
  buildFeishuUserInfoRequest,
  buildFeishuMessageDetailUrl,
  buildFeishuBotTextMessageRequest,
  buildFeishuCreateMailFolderRequest,
  buildFeishuMailFolderListUrl,
  buildFeishuMailListUrl,
  buildFeishuOAuthAuthorizeUrl,
  buildFeishuArchiveMessageRequest,
  buildFeishuRefreshUserAccessTokenRequest,
  buildFeishuSendMessageRequest,
  buildFeishuUserAccessTokenRequest,
  buildFeishuServerConfig,
  buildPublicFeishuApiStatus,
  buildTenantAccessTokenRequest,
  extractTenantAccessToken,
  normalizeFeishuMessageDetailResponse,
  normalizeFeishuCreateMailFolderResponse,
  normalizeFeishuBatchGetUserIdResponse,
  normalizeFeishuUserInfoResponse,
  normalizeFeishuMailFolderListResponse,
  normalizeFeishuMailListResponse,
  validateFeishuApiEnv,
} from '../src/feishuApiClient.js';
import {
  buildPublicFeishuWriteStatus,
  buildWriteActionDecision,
  buildWriteAuditEvent,
} from '../src/feishuWriteControls.js';

const DEFAULT_PORT = 5175;
const DEFAULT_MAIL_READ_CACHE_TTL_MS = 60_000;
const DEFAULT_MAIL_AUTO_SYNC_INTERVAL_MS = 60_000;
const DEFAULT_MAIL_AUTO_SYNC_PAGE_SIZE = 20;
const USER_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const REFRESH_TOKEN_OAUTH_SCOPE = 'offline_access';
const DEFAULT_OAUTH_SCOPES = [
  REFRESH_TOKEN_OAUTH_SCOPE,
  'mail:user_mailbox.message:readonly',
  'mail:user_mailbox.message.address:read',
  'mail:user_mailbox.message.subject:read',
  'mail:user_mailbox.message.body:read',
  'mail:user_mailbox.message:send',
].join(' ');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function toFilePath(rootDir, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const decodedPath = decodeURIComponent(requestedPath);
  const safePath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  const rootPath = resolve(rootDir);
  const filePath = resolve(join(rootPath, safePath));

  if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${sep}`)) {
    return null;
  }

  return filePath;
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  response.end(html);
}

function requestCorsHeaders(request) {
  const origin = request?.headers?.origin || '';
  if (!origin) return { 'access-control-allow-origin': '*' };
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    vary: 'origin',
  };
}

function sendOptions(response, request) {
  response.writeHead(204, {
    ...requestCorsHeaders(request),
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-max-age': '600',
  });
  response.end();
}

function sendMethodNotAllowed(response) {
  sendJson(response, 405, {
    ok: false,
    error: 'method_not_allowed',
    message: '当前接口不支持这个请求方法。',
    realSendEnabled: false,
  });
}

function readBooleanEnv(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function readPositiveIntEnv(value, fallback) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function buildFullMailSyncSearchParams(pageSize = DEFAULT_MAIL_AUTO_SYNC_PAGE_SIZE) {
  return new URLSearchParams({
    all: 'true',
    page_size: String(pageSize),
  });
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function maskConfigValue(value = '') {
  const text = String(value || '').trim();
  if (text.length <= 8) return text ? '已配置' : '';
  return `${text.slice(0, 6)}…${text.slice(-4)}`;
}

function normalizeOAuthScope(scope = '') {
  const scopes = String(scope || '')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!scopes.includes(REFRESH_TOKEN_OAUTH_SCOPE)) {
    scopes.unshift(REFRESH_TOKEN_OAUTH_SCOPE);
  }

  return [...new Set(scopes)].join(' ');
}

function buildLocalOAuthRedirectUri({ request, env }) {
  if (env.FEISHU_OAUTH_REDIRECT_URI) {
    return String(env.FEISHU_OAUTH_REDIRECT_URI).trim();
  }

  return `http://${request.headers.host || '127.0.0.1:5175'}/oauth/callback`;
}

function renderOAuthMessagePage({ title, message, detail = '', status = 'ok' }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f8fb; color: #172033; }
    main { max-width: 680px; margin: 12vh auto; padding: 32px; background: #fff; border: 1px solid #dde3ee; border-radius: 12px; box-shadow: 0 16px 50px rgba(20, 32, 52, .08); }
    .badge { display: inline-flex; padding: 6px 10px; border-radius: 999px; background: ${status === 'ok' ? '#e9f8ef' : '#fff0ee'}; color: ${status === 'ok' ? '#127a3d' : '#b42318'}; font-size: 13px; font-weight: 700; }
    h1 { margin: 18px 0 10px; font-size: 24px; letter-spacing: 0; }
    p { line-height: 1.7; color: #526071; }
    code { padding: 2px 6px; border-radius: 6px; background: #f0f3f8; }
    a { color: #165dff; text-decoration: none; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <span class="badge">${status === 'ok' ? '授权完成' : '需要处理'}</span>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    ${detail ? `<p>${detail}</p>` : ''}
  </main>
</body>
</html>`;
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

async function updateLocalEnvValues(envPath, updates) {
  let content = '';

  try {
    content = await readFile(envPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const nextContent = Object.entries(updates).reduce(
    (currentContent, [key, value]) => upsertEnvLine(currentContent, key, value),
    content,
  );
  await writeFile(envPath, nextContent.endsWith('\n') ? nextContent : `${nextContent}\n`, 'utf8');
}

async function pathExists(pathname) {
  try {
    await stat(pathname);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export function resolveWorkbenchDataRoot({
  rootDir = process.cwd(),
  env = process.env,
} = {}) {
  const resolvedAppRoot = rootDir instanceof URL ? fileURLToPath(rootDir) : rootDir;
  const configuredDataRoot = String(
    env.WORKBENCH_DATA_DIR
      || env.RAILWAY_VOLUME_MOUNT_PATH
      || '',
  ).trim();

  return configuredDataRoot ? resolve(configuredDataRoot) : resolve(resolvedAppRoot);
}

async function initializeWorkbenchDataRoot({
  appRoot,
  dataRoot,
} = {}) {
  await mkdir(dataRoot, { recursive: true });
  await mkdir(join(dataRoot, '.runtime'), { recursive: true });

  const sourceStorePath = join(appRoot, 'data/email-ai-control-store.json');
  const targetStorePath = join(dataRoot, 'data/email-ai-control-store.json');
  if (await pathExists(targetStorePath)) return;
  if (!(await pathExists(sourceStorePath))) return;

  await mkdir(dirname(targetStorePath), { recursive: true });
  await copyFile(sourceStorePath, targetStorePath);
}

function extractUserAccessToken(payload) {
  assertFeishuApiSuccess(payload, '获取 user_access_token');
  const data = payload?.data || payload || {};
  const token = payload?.data?.access_token
    || payload?.data?.user_access_token
    || payload?.access_token
    || payload?.user_access_token;

  if (!token) {
    throw new Error('获取 user_access_token 失败：响应中没有 access_token。');
  }

  return {
    token,
    refreshToken: payload?.data?.refresh_token || payload?.refresh_token || '',
    expiresIn: readPositiveIntEnv(data.expires_in || data.expire || data.expires, 0),
    refreshExpiresIn: readPositiveIntEnv(
      data.refresh_expires_in
        || data.refresh_token_expires_in
        || data.refresh_expire
        || data.refresh_expires,
      0,
    ),
  };
}

function buildUserTokenEnvUpdates({
  token,
  refreshToken = '',
  expiresIn = 0,
  refreshExpiresIn = 0,
  now = Date.now(),
}) {
  const updates = {
    FEISHU_USER_ACCESS_TOKEN: token,
  };

  if (refreshToken) {
    updates.FEISHU_USER_REFRESH_TOKEN = refreshToken;
  }

  if (expiresIn) {
    updates.FEISHU_USER_ACCESS_TOKEN_EXPIRES_AT = new Date(now + expiresIn * 1000).toISOString();
  }

  if (refreshExpiresIn) {
    updates.FEISHU_USER_REFRESH_TOKEN_EXPIRES_AT = new Date(now + refreshExpiresIn * 1000).toISOString();
  }

  return updates;
}

function isUserAccessTokenNearExpiry(env, now = Date.now()) {
  const expiresAt = Date.parse(String(env.FEISHU_USER_ACCESS_TOKEN_EXPIRES_AT || '').trim());
  return Number.isFinite(expiresAt) && expiresAt - now <= USER_TOKEN_REFRESH_SKEW_MS;
}

function isExpiredUserAccessTokenPayload(payload) {
  if (!payload || typeof payload !== 'object' || payload.code === undefined || payload.code === 0) {
    return false;
  }

  return /token expired|access token expired|authentication token expired|user_access_token.*expired/i
    .test(`${payload.msg || ''} ${payload.message || ''} ${payload.code || ''}`);
}

async function refreshUserAccessToken({
  fetchImpl,
  config,
  env,
  envInfo,
  rootDir,
}) {
  if (!env.FEISHU_USER_REFRESH_TOKEN) {
    throw new Error('user_access_token 已过期，且缺少 FEISHU_USER_REFRESH_TOKEN。请重新打开 /oauth/start 完成飞书授权。');
  }

  const refreshRequest = buildFeishuRefreshUserAccessTokenRequest({
    appId: config.appId,
    appSecret: config.appSecret,
    apiBase: config.apiBase,
    refreshToken: env.FEISHU_USER_REFRESH_TOKEN,
  });
  const tokenPayload = await fetchJson(fetchImpl, refreshRequest.url, refreshRequest.options);
  const {
    token,
    refreshToken,
    expiresIn,
    refreshExpiresIn,
  } = extractUserAccessToken(tokenPayload);
  const envPath = envInfo.path || join(rootDir, '.env.local');
  const updates = buildUserTokenEnvUpdates({
    token,
    refreshToken,
    expiresIn,
    refreshExpiresIn,
  });

  await updateLocalEnvValues(envPath, updates);
  Object.assign(env, updates);

  return token;
}

async function ensureFreshUserAccessToken({
  fetchImpl,
  config,
  env,
  envInfo,
  rootDir,
}) {
  if (!env.FEISHU_USER_ACCESS_TOKEN) {
    return '';
  }

  if (!isUserAccessTokenNearExpiry(env)) {
    return env.FEISHU_USER_ACCESS_TOKEN;
  }

  return refreshUserAccessToken({
    fetchImpl,
    config,
    env,
    envInfo,
    rootDir,
  });
}

async function fetchJsonWithAutoRefreshingUserToken({
  fetchImpl,
  config,
  env,
  envInfo,
  rootDir,
  buildRequest,
}) {
  let userAccessToken = await ensureFreshUserAccessToken({
    fetchImpl,
    config,
    env,
    envInfo,
    rootDir,
  });
  let requestConfig = buildRequest(userAccessToken);
  let payload = await fetchJson(fetchImpl, requestConfig.url, requestConfig.options);

  if (isExpiredUserAccessTokenPayload(payload)) {
    userAccessToken = await refreshUserAccessToken({
      fetchImpl,
      config,
      env,
      envInfo,
      rootDir,
    });
    requestConfig = buildRequest(userAccessToken);
    payload = await fetchJson(fetchImpl, requestConfig.url, requestConfig.options);
  }

  return payload;
}

async function serveStaticFile(requestUrl, response, rootDir) {
  const staticPathname = requestUrl.pathname === '/admin/email-ai-control'
    ? '/admin/email-ai-control/index.html'
    : requestUrl.pathname.endsWith('/')
      ? `${requestUrl.pathname}index.html`
      : requestUrl.pathname;
  const filePath = toFilePath(rootDir, staticPathname);

  if (!filePath) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(filePath)] || 'application/octet-stream',
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

async function fetchJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);

  if (typeof response.text === 'function') {
    const text = await response.text();
    const trimmedText = text.trim();

    if (!trimmedText) return {};

    try {
      return JSON.parse(trimmedText);
    } catch {
      const status = response.status ? `HTTP ${response.status}` : 'HTTP 状态未知';
      throw new Error(`飞书接口返回非 JSON 响应（${status}）：${trimmedText.slice(0, 160)}`);
    }
  }

  if (typeof response.json === 'function') {
    return response.json();
  }

  throw new Error('飞书接口没有返回可解析的 JSON 响应。');
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    const error = new Error('请求体不是合法 JSON。');
    error.statusCode = 400;
    error.errorCode = 'invalid_json';
    error.mode = 'validation_failed';
    throw error;
  }
}

const WORKBENCH_SESSION_COOKIE = 'workbench_session';

function parseCookieHeader(header = '') {
  return String(header || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex <= 0) return cookies;
      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function requestHost(request) {
  return String(request.headers.host || '').split(':')[0].toLowerCase();
}

function isLocalRequest(request) {
  return ['127.0.0.1', 'localhost', '::1'].includes(requestHost(request));
}

function isSecureCookieRequest(request) {
  const forwardedProto = String(request.headers['x-forwarded-proto'] || '').toLowerCase();
  return forwardedProto === 'https' || !isLocalRequest(request);
}

function buildWorkbenchSessionCookie(request, token, { maxAgeSeconds = 0 } = {}) {
  const parts = [
    `${WORKBENCH_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (maxAgeSeconds) parts.push(`Max-Age=${maxAgeSeconds}`);
  if (isSecureCookieRequest(request)) parts.push('Secure');
  return parts.join('; ');
}

function buildClearWorkbenchSessionCookie(request) {
  const parts = [
    `${WORKBENCH_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isSecureCookieRequest(request)) parts.push('Secure');
  return parts.join('; ');
}

function normalizeWorkbenchPhone(value = '') {
  const digits = String(value || '').trim().replace(/[^\d]/g, '');
  if (digits.length === 13 && digits.startsWith('86')) {
    return digits.slice(2);
  }
  return digits;
}

function isValidWorkbenchPhone(value = '') {
  return /^\d{6,20}$/.test(normalizeWorkbenchPhone(value));
}

function unauthorizedWorkbenchPayload(message = '请先登录工作台。') {
  return {
    ok: false,
    error: 'workbench_auth_required',
    message,
  };
}

function shouldRequireWorkbenchAuth(env = {}) {
  const runningOnRailway = Boolean(env.RAILWAY_PUBLIC_DOMAIN || env.RAILWAY_ENVIRONMENT || env.RAILWAY_SERVICE_ID);
  return readBooleanEnv(env.WORKBENCH_AUTH_REQUIRED, runningOnRailway);
}

function isProtectedWorkbenchApiPath(pathname = '') {
  return pathname === '/oauth/start'
    || pathname === '/api/email-ai/process'
    || pathname === '/api/feishu/config/update'
    || pathname.startsWith('/api/feishu/mail');
}

function sanitizeWriteResult(payload) {
  return {
    ok: true,
    messageId: payload?.data?.message_id || payload?.message_id || null,
    threadId: payload?.data?.thread_id || payload?.thread_id || null,
    archived: true,
  };
}

function sanitizeBotMessageResult(payload) {
  return {
    ok: true,
    messageId: payload?.data?.message_id || payload?.message_id || null,
    chatId: payload?.data?.chat_id || payload?.chat_id || null,
  };
}

function buildWriteMailFromLoopItem(item) {
  return {
    id: item.mailId,
    messageId: item.messageId,
    threadId: item.threadId,
    subject: item.subject,
    sender: item.sender,
    risk: item.risk,
    category: item.category,
    templateId: item.templateId,
    action: item.operation === 'auto_archive' ? 'ignore' : item.risk === 'high' ? 'blocked' : 'auto_reply',
    requiresReview: item.requiresApproval,
  };
}

function findReviewForLoopItem(reviews = {}, item) {
  return reviews[item.mailId] || reviews[item.messageId] || null;
}

function summarizeProcessItems(items = []) {
  return items.reduce((summary, item) => {
    summary.total += 1;
    summary.autoSent += item.operation === 'auto_send' && item.status === 'sent' ? 1 : 0;
    summary.archived += item.operation === 'auto_archive' && item.status === 'archived' ? 1 : 0;
    summary.manualSent += item.operation === 'manual_send_after_approval' && item.status === 'sent' ? 1 : 0;
    summary.pendingReview += item.operation === 'pending_review' ? 1 : 0;
    summary.blocked += item.status === 'blocked' ? 1 : 0;
    summary.skipped += item.status === 'skipped' ? 1 : 0;
    summary.failed += item.status === 'failed' ? 1 : 0;
    return summary;
  }, {
    total: 0,
    autoSent: 0,
    archived: 0,
    manualSent: 0,
    pendingReview: 0,
    blocked: 0,
    skipped: 0,
    failed: 0,
  });
}

async function defaultAuditWriter(event, { rootDir }) {
  const auditPath = resolve(rootDir, '.runtime/feishu-actions.ndjson');
  await mkdir(dirname(auditPath), { recursive: true });
  await appendFile(auditPath, `${JSON.stringify(event)}\n`, 'utf8');
}

async function loadProcessedMailKeys(rootDir) {
  const auditPath = resolve(rootDir, '.runtime/feishu-actions.ndjson');
  const processed = new Set();
  let content = '';

  try {
    content = await readFile(auditPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return processed;
  }

  content.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;

    try {
      const event = JSON.parse(line);
      const actionDone = ['send', 'archive'].includes(event.action)
        && event.allowed
        && event.result?.ok;

      if (!actionDone) return;
      if (event.mailId) processed.add(String(event.mailId));
      if (event.messageId) processed.add(String(event.messageId));
    } catch {
      // Ignore malformed local audit lines; they should not stop the worker.
    }
  });

  return processed;
}

function buildProcessingStatusFromAuditEvent(event = {}) {
  const action = event.action || '';
  const ok = Boolean(event.allowed && event.result?.ok);

  if (['send', 'archive'].includes(action) && ok) {
    return {
      status: 'completed',
      action,
      label: action === 'archive' ? '已归档/移箱' : event.actor === 'scheduled-auto-process' ? '已自动回复' : '已完成回复',
      completedAt: event.createdAt || '',
      actor: event.actor || '',
      mode: event.mode || '',
    };
  }

  if (['send', 'archive'].includes(action) && !ok) {
    return {
      status: 'failed',
      action,
      label: action === 'archive' ? '归档失败' : '发送失败',
      completedAt: event.createdAt || '',
      actor: event.actor || '',
      mode: event.mode || '',
      reason: event.result?.error || event.reasons?.[0] || '',
    };
  }

  return null;
}

function processingStatusKeysFromAuditEvent(event = {}) {
  return {
    directKeys: [
      event.mailId,
      event.messageId,
      event.result?.messageId,
      event.result?.message_id,
    ].filter(Boolean).map((key) => String(key)),
    threadKeys: [
      event.threadId,
      event.result?.threadId,
      event.result?.thread_id,
    ].filter(Boolean).map((key) => `thread:${key}`),
  };
}

function parseProcessingTimestamp(value = '') {
  if (!value) return NaN;

  const text = String(value).trim();
  if (/^\d{12,}$/.test(text)) {
    const numericTime = Number(text);
    return Number.isFinite(numericTime) ? numericTime : NaN;
  }

  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function canApplyThreadProcessingStatus(status = {}, mail = {}) {
  if (!status || status.status !== 'completed') return false;

  const completedAt = parseProcessingTimestamp(status.completedAt);
  const mailReceivedAt = parseProcessingTimestamp(mail.receivedAt || mail.received_at || mail.internal_date || mail.create_time || '');

  return Number.isFinite(completedAt)
    && Number.isFinite(mailReceivedAt)
    && mailReceivedAt <= completedAt + 60_000;
}

function shouldReplaceProcessingStatus(existing = null, next = null) {
  if (!existing) return true;
  if (isCompletedProcessingStatus(existing)) return false;
  if (isCompletedProcessingStatus(next)) return true;
  return true;
}

async function loadMailProcessingStatusMap(rootDir) {
  const auditPath = resolve(rootDir, '.runtime/feishu-actions.ndjson');
  const statusMap = new Map();
  let content = '';

  try {
    content = await readFile(auditPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return statusMap;
  }

  content.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;

    try {
      const event = JSON.parse(line);
      const status = buildProcessingStatusFromAuditEvent(event);
      if (!status) return;

      const setStatus = (key, value) => {
        const existing = statusMap.get(key) || null;
        if (shouldReplaceProcessingStatus(existing, value)) {
          statusMap.set(key, value);
        }
      };
      const keys = processingStatusKeysFromAuditEvent(event);
      keys.directKeys.forEach((mailId) => {
        setStatus(mailId, {
          ...status,
          matchScope: 'direct',
        });
      });
      keys.threadKeys.forEach((threadKey) => {
        setStatus(threadKey, {
          ...status,
          matchScope: 'thread',
        });
      });
    } catch {
      // Ignore malformed local audit lines; they should not stop the workbench.
    }
  });

  return statusMap;
}

async function loadRiskOverrideMap(rootDir) {
  const overridePath = resolve(rootDir, '.runtime/risk-overrides.json');

  try {
    return JSON.parse(await readFile(overridePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return {};
  }
}

async function saveRiskOverrideMap(rootDir, overrides) {
  const overridePath = resolve(rootDir, '.runtime/risk-overrides.json');
  await mkdir(dirname(overridePath), { recursive: true });
  await writeFile(overridePath, JSON.stringify(overrides, null, 2), 'utf8');
}

function findRiskOverride(overrides = {}, mail = {}) {
  return overrides[mail.id] || overrides[mail.messageId] || overrides[mail.message_id] || null;
}

async function getTenantAccessToken(fetchImpl, config) {
  const tokenRequest = buildTenantAccessTokenRequest({
    appId: config.appId,
    appSecret: config.appSecret,
    apiBase: config.apiBase,
  });
  const payload = await fetchJson(fetchImpl, tokenRequest.url, tokenRequest.options);

  return extractTenantAccessToken(payload);
}

async function fetchFeishuMessageDetail(fetchImpl, config, tenantAccessToken, messageId) {
  const detailUrl = buildFeishuMessageDetailUrl({
    apiBase: config.apiBase,
    userMailboxId: config.userMailboxId,
    messageId,
  });
  const payload = await fetchJson(fetchImpl, detailUrl, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${tenantAccessToken}`,
      'content-type': 'application/json; charset=utf-8',
    },
  });

  return normalizeFeishuMessageDetailResponse(payload);
}

async function fetchFeishuMessageDetailsSoft(fetchImpl, config, tenantAccessToken, normalized) {
  const details = [];
  const fallbackById = new Map(normalized.messages.map((message) => [message.message_id, message]));
  let failed = 0;

  for (const messageId of normalized.messageIds) {
    try {
      details.push(await fetchFeishuMessageDetail(fetchImpl, config, tenantAccessToken, messageId));
    } catch (error) {
      failed += 1;
      details.push(fallbackById.get(messageId) || {
        message_id: messageId,
        thread_id: `thread-${messageId}`,
        subject: '(无标题)',
        from: { email: 'unknown@example.test' },
        received_at: '',
        body_preview: '',
        labels: [],
        expected_thread_id: `thread-${messageId}`,
      });
    }
  }

  return {
    messages: details,
    detailStatus: failed > 0 ? 'partial' : 'complete',
    detailFailedCount: failed,
  };
}

async function fetchFeishuMailListPage(fetchImpl, config, tenantAccessToken, {
  pageSize,
  pageToken,
} = {}) {
  const mailListUrl = buildFeishuMailListUrl({
    apiBase: config.apiBase,
    userMailboxId: config.userMailboxId,
    pageSize,
    pageToken,
    folderId: config.mailFolderId,
    labelId: config.mailLabelId,
  });
  const mailListPayload = await fetchJson(fetchImpl, mailListUrl, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${tenantAccessToken}`,
      'content-type': 'application/json; charset=utf-8',
    },
  });

  return normalizeFeishuMailListResponse(mailListPayload);
}

async function fetchFeishuAllMailListPages(fetchImpl, config, tenantAccessToken, {
  pageSize,
  startPageToken = '',
} = {}) {
  const seenPageTokens = new Set();
  const seenMessageIds = new Set();
  const messages = [];
  const messageIds = [];
  let pageToken = startPageToken;
  let hasMore = false;
  let pageCount = 0;
  let rawCount = 0;

  do {
    if (seenPageTokens.has(pageToken)) {
      throw new Error('飞书分页 token 重复，已停止全量抓取，避免无限循环。');
    }
    seenPageTokens.add(pageToken);

    const normalized = await fetchFeishuMailListPage(fetchImpl, config, tenantAccessToken, {
      pageSize,
      pageToken,
    });
    pageCount += 1;
    rawCount += normalized.rawCount;

    normalized.messageIds.forEach((messageId, index) => {
      if (seenMessageIds.has(messageId)) return;
      seenMessageIds.add(messageId);
      messageIds.push(messageId);
      messages.push(normalized.messages[index]);
    });

    hasMore = normalized.hasMore;
    pageToken = normalized.pageToken;

    if (hasMore && !pageToken) {
      throw new Error('飞书返回还有下一页，但没有返回 page_token，无法保证全量无遗漏。');
    }
  } while (hasMore);

  return {
    messages,
    messageIds,
    hasMore: false,
    pageToken: '',
    rawCount,
    pageCount,
    allPagesFetched: true,
  };
}

async function fetchFeishuMailFolders(fetchImpl, config, tenantAccessToken) {
  const folders = [];
  let pageToken = '';
  let hasMore = false;

  do {
    const folderListUrl = buildFeishuMailFolderListUrl({
      apiBase: config.apiBase,
      userMailboxId: config.userMailboxId,
      pageSize: DEFAULT_FEISHU_MAIL_PAGE_SIZE,
      pageToken,
    });
    const payload = await fetchJson(fetchImpl, folderListUrl, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${tenantAccessToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
    });
    const normalized = normalizeFeishuMailFolderListResponse(payload);

    folders.push(...normalized.folders);
    hasMore = normalized.hasMore;
    pageToken = normalized.pageToken;

    if (hasMore && !pageToken) {
      throw new Error('飞书返回还有下一页文件夹，但没有返回 page_token。');
    }
  } while (hasMore);

  return folders;
}

async function ensureArchiveFolder({
  body,
  env,
  envInfo = {},
  fetchImpl,
  auditWriter,
  rootDir,
}) {
  const readiness = validateFeishuApiEnv(env);
  const archiveFolderName = String(
    body.name || env.FEISHU_ARCHIVE_FOLDER_NAME || '工作台归档',
  ).trim();
  const actor = body.actor || 'local-operator';
  const reasons = [];

  if (!readiness.configured) {
    reasons.push(`飞书 API 配置不完整：${readiness.missing.join(', ')}`);
  }
  if (!archiveFolderName) {
    reasons.push('归档文件夹名称不能为空。');
  }

  if (reasons.length > 0) {
    await auditWriter({
      action: 'ensure_archive_folder',
      actor,
      at: new Date().toISOString(),
      allowed: false,
      mode: 'archive_folder_blocked',
      reasons,
      result: {
        ok: false,
        error: reasons[0],
      },
    }, { rootDir });

    return {
      statusCode: 403,
      payload: {
        ok: false,
        action: 'ensure_archive_folder',
        mode: 'archive_folder_blocked',
        reasons,
      },
    };
  }

  const config = buildFeishuServerConfig(env);
  const tenantAccessToken = await getTenantAccessToken(fetchImpl, config);
  const folders = await fetchFeishuMailFolders(fetchImpl, config, tenantAccessToken);
  let archiveFolder = folders.find((folder) => folder.name === archiveFolderName);
  let created = false;

  if (!archiveFolder) {
    const createRequest = buildFeishuCreateMailFolderRequest({
      apiBase: config.apiBase,
      userMailboxId: config.userMailboxId,
      tenantAccessToken,
      name: archiveFolderName,
      parentFolderId: body.parentFolderId || env.FEISHU_ARCHIVE_PARENT_FOLDER_ID || '0',
    });
    const createPayload = await fetchJson(fetchImpl, createRequest.url, createRequest.options);
    archiveFolder = normalizeFeishuCreateMailFolderResponse(createPayload);
    created = true;
  }

  if (!archiveFolder?.folder_id) {
    throw new Error('飞书归档文件夹创建或读取成功，但响应中没有 folder_id。');
  }

  const envPath = envInfo.path || join(rootDir, '.env.local');
  await updateLocalEnvValues(envPath, {
    FEISHU_ARCHIVE_FOLDER_ID: archiveFolder.folder_id,
    FEISHU_ARCHIVE_FOLDER_NAME: archiveFolder.name || archiveFolderName,
  });
  env.FEISHU_ARCHIVE_FOLDER_ID = archiveFolder.folder_id;
  env.FEISHU_ARCHIVE_FOLDER_NAME = archiveFolder.name || archiveFolderName;

  const result = {
    ok: true,
    folderId: archiveFolder.folder_id,
    name: archiveFolder.name || archiveFolderName,
    created,
  };
  await auditWriter({
    action: 'ensure_archive_folder',
    actor,
    at: new Date().toISOString(),
    allowed: true,
    mode: created ? 'archive_folder_created' : 'archive_folder_found',
    reasons: [],
    result,
  }, { rootDir });

  return {
    statusCode: 200,
    payload: {
      ok: true,
      action: 'ensure_archive_folder',
      mode: created ? 'archive_folder_created' : 'archive_folder_found',
      result,
    },
  };
}

async function updateRiskOverrideAction({ body, rootDir }) {
  const mailId = body.mailId || body.messageId || '';
  const risk = body.risk || '';

  if (!mailId) {
    return {
      statusCode: 400,
      payload: {
        ok: false,
        action: 'risk_override',
        error: 'missing_mail_id',
        mode: 'validation_failed',
        message: '缺少 mailId。',
      },
    };
  }

  const overrides = await loadRiskOverrideMap(rootDir);

  if (body.clear) {
    delete overrides[mailId];
    if (body.messageId) delete overrides[body.messageId];
    await saveRiskOverrideMap(rootDir, overrides);
    return {
      statusCode: 200,
      payload: {
        ok: true,
        action: 'risk_override',
        mode: 'cleared',
        mailId,
      },
    };
  }

  if (!['low', 'medium', 'high', 'spam'].includes(risk)) {
    return {
      statusCode: 400,
      payload: {
        ok: false,
        action: 'risk_override',
        error: 'invalid_risk',
        mode: 'validation_failed',
        message: 'risk 只能是 low、medium、high 或 spam。',
      },
    };
  }

  const override = {
    risk,
    note: body.note || '',
    actor: body.actor || 'local-operator',
    updatedAt: new Date().toISOString(),
  };
  overrides[mailId] = override;
  if (body.messageId) {
    overrides[body.messageId] = override;
  }
  await saveRiskOverrideMap(rootDir, overrides);

  return {
    statusCode: 200,
    payload: {
      ok: true,
      action: 'risk_override',
      mode: 'saved',
      mailId,
      override,
    },
  };
}

async function updateFeishuLocalConfig({ body, env, envInfo, rootDir }) {
  const envPath = envInfo.path || join(rootDir, '.env.local');
  const updates = {};
  const previousAppId = env.FEISHU_APP_ID || '';
  const previousMailbox = env.FEISHU_USER_MAILBOX_ID || '';

  if (body.appId) updates.FEISHU_APP_ID = String(body.appId).trim();
  if (body.appSecret) updates.FEISHU_APP_SECRET = String(body.appSecret).trim();
  if (body.mailboxAddress) updates.FEISHU_USER_MAILBOX_ID = String(body.mailboxAddress).trim();
  if (body.botReportEmail) updates.FEISHU_BOT_REPORT_EMAIL = String(body.botReportEmail).trim();

  const appChanged = updates.FEISHU_APP_ID && updates.FEISHU_APP_ID !== previousAppId;
  const mailboxChanged = updates.FEISHU_USER_MAILBOX_ID && updates.FEISHU_USER_MAILBOX_ID !== previousMailbox;
  if (appChanged || mailboxChanged || body.resetAuth) {
    updates.FEISHU_USER_ACCESS_TOKEN = '';
    updates.FEISHU_USER_REFRESH_TOKEN = '';
    updates.FEISHU_USER_ACCESS_TOKEN_EXPIRES_AT = '';
    updates.FEISHU_USER_REFRESH_TOKEN_EXPIRES_AT = '';
    updates.FEISHU_ARCHIVE_FOLDER_ID = '';
  }

  if (Object.keys(updates).length === 0) {
    return {
      statusCode: 400,
      payload: {
        ok: false,
        action: 'config_update',
        error: 'empty_config_update',
        mode: 'validation_failed',
        message: '没有可更新的配置。',
      },
    };
  }

  await updateLocalEnvValues(envPath, updates);
  Object.assign(env, updates);

  return {
    statusCode: 200,
    payload: {
      ok: true,
      action: 'config_update',
      updatedKeys: Object.keys(updates).map((key) => (/SECRET|TOKEN/.test(key) ? `${key}:masked` : key)),
      oauthStartUrl: '/oauth/start?state=mail-workbench',
      resetAuth: Boolean(appChanged || mailboxChanged || body.resetAuth),
    },
  };
}

async function readFeishuMessages({ fetchImpl, env, searchParams }) {
  const readiness = validateFeishuApiEnv(env);

  if (!readiness.configured) {
    return {
      statusCode: 503,
      payload: {
        ok: false,
        error: 'missing_feishu_env',
        missing: readiness.missing,
        sourceStatus: readiness.sourceStatus,
        realSendEnabled: false,
        message: '请先在本地服务端环境变量中配置 FEISHU_APP_ID、FEISHU_APP_SECRET、FEISHU_USER_MAILBOX_ID。',
      },
    };
  }

  const config = buildFeishuServerConfig(env);
  const tenantAccessToken = await getTenantAccessToken(fetchImpl, config);
  const pageSize = searchParams.get('page_size') || undefined;
  const pageToken = searchParams.get('page_token') || '';
  const fetchAllPages = ['1', 'true', 'yes', 'on'].includes(
    String(searchParams.get('all') || '').trim().toLowerCase(),
  );
  const normalized = fetchAllPages
    ? await fetchFeishuAllMailListPages(fetchImpl, config, tenantAccessToken, {
      pageSize,
      startPageToken: pageToken,
    })
    : await fetchFeishuMailListPage(fetchImpl, config, tenantAccessToken, {
      pageSize,
      pageToken,
    });
  const detailResult = normalized.messageIds.length
    ? await fetchFeishuMessageDetailsSoft(fetchImpl, config, tenantAccessToken, normalized)
    : {
      messages: normalized.messages,
      detailStatus: 'list_only',
      detailFailedCount: 0,
    };
  const detailMessages = detailResult.messages;
  const mails = detailMessages.map((message) => ({
    ...mapFeishuMessageToMail(message),
    status: '飞书 API 只读导入',
    sourceStatus: '真实接入',
  }));

  return {
    statusCode: 200,
    payload: {
      ok: true,
      sourceStatus: '真实接入',
      realSendEnabled: false,
      hasMore: normalized.hasMore,
      pageToken: normalized.pageToken,
      rawCount: normalized.rawCount,
      pageCount: normalized.pageCount || 1,
      allPagesFetched: Boolean(normalized.allPagesFetched),
      detailStatus: detailResult.detailStatus,
      detailFailedCount: detailResult.detailFailedCount,
      messages: detailMessages,
      mails,
    },
  };
}

async function executeWriteAction({
  action,
  body,
  env,
  envInfo = {},
  fetchImpl,
  auditWriter,
  rootDir,
}) {
  const mail = body.mail || {};
  const recipient = body.recipient || mail.sender || '';
  const content = body.content || mail.replyDraft || '';
  const review = body.review || null;
  const actor = body.actor || 'local-operator';
  const usage = body.usage || {};
  const decision = buildWriteActionDecision({
    action,
    mail,
    recipient,
    content,
    review,
    env,
    usage,
  });

  if (!decision.allowed) {
    const auditEvent = buildWriteAuditEvent({
      action,
      mail,
      decision,
      actor,
      result: {
        ok: false,
        error: decision.reasons[0] || decision.mode,
      },
    });
    await auditWriter(auditEvent, { rootDir });

    return {
      statusCode: 403,
      payload: {
        ok: false,
        action,
        mode: decision.mode,
        reasons: decision.reasons,
        realSendEnabled: false,
        realArchiveEnabled: false,
        paymentActionAllowed: false,
        orderActionAllowed: false,
      },
    };
  }

  const config = buildFeishuServerConfig(env);
  const buildRequestConfig = (token) => {
    if (action === 'send') {
      return buildFeishuSendMessageRequest({
        apiBase: config.apiBase,
        userMailboxId: config.userMailboxId,
        userAccessToken: token,
        recipient,
        subject: body.subject || mail.subject || '(无标题)',
        content,
        dedupeKey: body.dedupeKey || `${mail.messageId || mail.id || 'mail'}-${Date.now()}`,
      });
    }

    if (action === 'archive') {
      return buildFeishuArchiveMessageRequest({
        apiBase: config.apiBase,
        userMailboxId: config.userMailboxId,
        userAccessToken: token,
        messageId: mail.messageId || mail.id,
        archiveFolderId: env.FEISHU_ARCHIVE_FOLDER_ID,
      });
    }

    return null;
  };

  const payload = await fetchJsonWithAutoRefreshingUserToken({
    fetchImpl,
    config,
    env,
    envInfo,
    rootDir,
    buildRequest: buildRequestConfig,
  });

  if (action === 'send') {
    assertFeishuApiSuccess(payload, '真实发送邮件');
  } else if (action === 'archive') {
    assertFeishuApiSuccess(payload, '归档 / 移箱邮件');
  }

  const result = action === 'archive'
    ? { ok: true, archived: true }
    : sanitizeWriteResult(payload);
  const auditEvent = buildWriteAuditEvent({
    action,
    mail,
    decision,
    actor,
    result,
  });
  await auditWriter(auditEvent, { rootDir });

  return {
    statusCode: 200,
    payload: {
      ok: true,
      action,
      mode: decision.mode,
      result,
      realSendEnabled: action === 'send',
      realArchiveEnabled: action === 'archive',
      paymentActionAllowed: false,
      orderActionAllowed: false,
    },
  };
}

async function executeBotMessageAction({
  body,
  env,
  envInfo = {},
  fetchImpl,
  auditWriter,
  rootDir,
}) {
  const recipient = body.recipient || env.FEISHU_BOT_REPORT_EMAIL || '';
  const text = body.text || body.message || body.content || '';
  const actor = body.actor || 'local-operator';
  const writeEnabled = readBooleanEnv(env.FEISHU_WRITE_ENABLED, false);
  const readiness = validateFeishuApiEnv(env);
  const reasons = [];

  if (!writeEnabled) {
    reasons.push('真实写操作总开关关闭。');
  }
  if (!readiness.configured) {
    reasons.push(`飞书 API 配置不完整：${readiness.missing.join(', ')}`);
  }
  if (!recipient) {
    reasons.push('缺少飞书消息接收邮箱 FEISHU_BOT_REPORT_EMAIL 或请求 recipient。');
  }
  if (!text.trim()) {
    reasons.push('缺少飞书消息正文。');
  }

  if (reasons.length > 0) {
    await auditWriter({
      action: 'bot_message',
      actor,
      at: new Date().toISOString(),
      recipient,
      allowed: false,
      mode: 'bot_message_blocked',
      reasons,
      result: {
        ok: false,
        error: reasons[0],
      },
    }, { rootDir });

    return {
      statusCode: 403,
      payload: {
        ok: false,
        action: 'bot_message',
        mode: 'bot_message_blocked',
        reasons,
      },
    };
  }

  const config = buildFeishuServerConfig(env);
  const tenantAccessToken = await getTenantAccessToken(fetchImpl, config);
  let receiveId = body.receiveId || env.FEISHU_BOT_REPORT_USER_ID || '';
  let receiveIdType = body.receiveIdType || (receiveId ? env.FEISHU_BOT_REPORT_RECEIVE_ID_TYPE || 'user_id' : 'user_id');

  if (!receiveId) {
    const userIdRequest = buildFeishuBatchGetUserIdRequest({
      apiBase: config.apiBase,
      tenantAccessToken,
      emails: [recipient],
      userIdType: 'user_id',
    });
    const userIdPayload = await fetchJson(fetchImpl, userIdRequest.url, userIdRequest.options);
    const users = normalizeFeishuBatchGetUserIdResponse(userIdPayload);
    const matchedUser = users.find((user) => user.email === recipient) || users[0] || {};

    receiveId = matchedUser.user_id || matchedUser.open_id || matchedUser.union_id || '';
    receiveIdType = matchedUser.user_id
      ? 'user_id'
      : matchedUser.open_id
        ? 'open_id'
        : matchedUser.union_id
          ? 'union_id'
          : receiveIdType;
  }

  if (!receiveId && env.FEISHU_USER_ACCESS_TOKEN && recipient === env.FEISHU_USER_MAILBOX_ID) {
    const userInfoPayload = await fetchJsonWithAutoRefreshingUserToken({
      fetchImpl,
      config,
      env,
      envInfo,
      rootDir,
      buildRequest: (userAccessToken) => buildFeishuUserInfoRequest({
        apiBase: config.apiBase,
        userAccessToken,
      }),
    });
    const userInfo = normalizeFeishuUserInfoResponse(userInfoPayload);

    receiveId = userInfo.user_id || userInfo.open_id || userInfo.union_id || '';
    receiveIdType = userInfo.user_id
      ? 'user_id'
      : userInfo.open_id
        ? 'open_id'
        : userInfo.union_id
          ? 'union_id'
          : receiveIdType;
  }

  if (!receiveId) {
    throw new Error('通过邮箱获取飞书用户 ID 失败：响应中没有 user_id。请确认应用权限包含 contact:user.employee_id:readonly，且接收邮箱属于应用可见范围。');
  }

  const messageRequest = buildFeishuBotTextMessageRequest({
    apiBase: config.apiBase,
    tenantAccessToken,
    recipient: receiveId,
    text,
    receiveIdType,
  });
  const payload = await fetchJson(fetchImpl, messageRequest.url, messageRequest.options);
  assertFeishuApiSuccess(payload, '发送飞书机器人消息');

  const result = sanitizeBotMessageResult(payload);
  await auditWriter({
    action: 'bot_message',
    actor,
    at: new Date().toISOString(),
    recipient,
    allowed: true,
    mode: 'bot_text_message_sent',
    reasons: [],
    result,
  }, { rootDir });

  return {
    statusCode: 200,
    payload: {
      ok: true,
      action: 'bot_message',
      mode: 'bot_text_message_sent',
      result,
    },
  };
}

async function recordApprovalAction({
  body,
  auditWriter,
  rootDir,
}) {
  const mail = body.mail || {};
  const decision = {
    allowed: true,
    mode: 'approved',
    reasons: [],
  };
  const auditEvent = buildWriteAuditEvent({
    action: 'approve',
    mail,
    decision,
    actor: body.actor || 'local-operator',
    result: {
      ok: true,
      messageId: mail.messageId || mail.id || null,
    },
  });
  await auditWriter(auditEvent, { rootDir });

  return {
    statusCode: 200,
    payload: {
      ok: true,
      action: 'approve',
      mode: 'approved',
      review: {
        decision: body.review?.decision || 'reasonable',
        note: body.review?.note || '',
      },
      paymentActionAllowed: false,
      orderActionAllowed: false,
    },
  };
}

async function executeClosedLoopProcess({
  body,
  env,
  envInfo = {},
  fetchImpl,
  auditWriter,
  rootDir,
  emailAIRepository,
}) {
  let mails = Array.isArray(body.mails) ? body.mails : [];

  if (mails.length === 0) {
    const readResult = await readFeishuMessages({
      fetchImpl,
      env,
      searchParams: new URLSearchParams({
        all: 'true',
        page_size: String(body.pageSize || 20),
      }),
    });

    if (readResult.statusCode !== 200 || !readResult.payload.ok) {
      return {
        statusCode: readResult.statusCode,
        payload: {
          ok: false,
          action: 'process',
          error: readResult.payload.error || 'read_failed',
          message: readResult.payload.message || '闭环处理前读取飞书邮件失败。',
          sourceStatus: readResult.payload.sourceStatus || 'API 待接入',
        },
      };
    }

    const rawMessages = readResult.payload.messages || [];
    const sendContext = buildSendContextFromFeishuMessages(rawMessages);
    const riskOverrides = await loadRiskOverrideMap(rootDir);
    mails = await Promise.all((readResult.payload.mails || []).map(async (mail) => {
      const aiResult = await processEmailWithAI({
        emailId: mail.id || mail.messageId,
        senderEmail: mail.sender || mail.from?.email || '',
        subject: mail.subject || '',
        body: mail.bodyText || mail.summary || '',
        orderInfo: body.orderInfo || {},
        customerHistory: body.customerHistory || {},
        source: 'email_auto_reply_workbench',
      }, {
        repository: emailAIRepository,
        rootDir,
        env,
        fetchImpl,
      });
      const classified = applyRiskOverrideToMail(mapEmailAIResultToWorkbenchMail(mail, aiResult), findRiskOverride(riskOverrides, mail), {
        agentConfig: body.agentConfig || {},
      });
      const sendGuard = evaluateSendGuard(classified, {
        repliedMessageIds: sendContext.repliedMessageIds,
        repliedThreadKeys: sendContext.repliedThreadKeys,
        expectedThreadKey: sendContext.expectedThreadKeysByMailId[classified.id],
      });

      return {
        ...classified,
        sendGuard: {
          mode: sendGuard.mode,
          reasons: sendGuard.reasons,
        },
      };
    }));
  }

  const skipMailIds = new Set((body.skipMailIds || []).map((mailId) => String(mailId)));
  if (skipMailIds.size > 0) {
    mails = mails.filter((mail) => {
      const mailId = mail.id || mail.mailId || '';
      const messageId = mail.messageId || mail.id || '';

      return !skipMailIds.has(String(mailId)) && !skipMailIds.has(String(messageId));
    });
  }

  const batch = buildClosedLoopBatch({
    mails,
    env,
    reviews: body.reviews || {},
    selectedReplies: body.selectedReplies || {},
    usage: body.usage || {},
    agentConfig: body.agentConfig || {},
    runtimeControls: body.runtimeControls || {},
  });
  const processedItems = [];

  for (const item of batch.items) {
    if (item.status !== 'ready') {
      processedItems.push(item);
      continue;
    }

    const realAction = item.operation === 'auto_archive' ? 'archive' : 'send';
    const actionMail = buildWriteMailFromLoopItem(item);

    try {
      const result = await executeWriteAction({
        action: realAction,
        body: {
          mail: actionMail,
          recipient: item.sender,
          subject: item.subject?.startsWith('Re:') ? item.subject : `Re: ${item.subject}`,
          content: item.content,
          review: findReviewForLoopItem(body.reviews || {}, item),
          actor: body.actor || 'closed-loop',
          usage: body.usage || {},
        },
        env,
        envInfo,
        fetchImpl,
        auditWriter,
        rootDir,
      });
      const payload = result.payload || {};

      processedItems.push({
        ...item,
        status: payload.ok
          ? realAction === 'archive' ? 'archived' : 'sent'
          : 'blocked',
        result: payload.result || null,
        mode: payload.mode || item.mode,
        reasons: payload.reasons || item.reasons,
      });
    } catch (error) {
      await auditWriter(buildWriteAuditEvent({
        action: realAction,
        mail: actionMail,
        decision: {
          allowed: false,
          mode: 'feishu_write_failed',
          reasons: [error.message],
        },
        actor: body.actor || 'closed-loop',
        result: {
          ok: false,
          error: error.message,
        },
      }), { rootDir });

      processedItems.push({
        ...item,
        status: 'failed',
        mode: 'feishu_write_failed',
        reasons: [error.message],
      });
    }
  }

  return {
    statusCode: 200,
    payload: {
      ok: true,
      action: 'process',
      mode: 'closed_loop_processed',
      summary: summarizeProcessItems(processedItems),
      items: processedItems,
      write: buildPublicFeishuWriteStatus(env),
      paymentActionAllowed: false,
      orderActionAllowed: false,
    },
  };
}

export function createFeishuApiServer({
  rootDir = process.cwd(),
  env = process.env,
  fetchImpl = fetch,
  envInfo = {},
  auditWriter = defaultAuditWriter,
} = {}) {
  const resolvedRoot = rootDir instanceof URL ? fileURLToPath(rootDir) : rootDir;
  const resolvedDataRoot = resolveWorkbenchDataRoot({
    rootDir: resolvedRoot,
    env,
  });
  const runtimeEnvInfo = {
    ...envInfo,
    path: envInfo.path || join(resolvedDataRoot, '.env.local'),
  };
  let dataRootReady = null;
  function ensureDataRootReady() {
    if (!dataRootReady) {
      dataRootReady = initializeWorkbenchDataRoot({
        appRoot: resolvedRoot,
        dataRoot: resolvedDataRoot,
      });
      dataRootReady.catch(() => {});
    }
    return dataRootReady;
  }
  const emailAIRepository = createEmailAIStoreRepository({
    rootDir: resolvedDataRoot,
    env,
  });
  const workbenchAuthStore = createWorkbenchAuthStore({
    rootDir: resolvedDataRoot,
    sessionTtlMs: readPositiveIntEnv(env.WORKBENCH_SESSION_TTL_HOURS, 8) * 60 * 60 * 1000,
    rememberTtlMs: readPositiveIntEnv(env.WORKBENCH_REMEMBER_TTL_DAYS, 30) * 24 * 60 * 60 * 1000,
  });
  const mailReadCache = new Map();
  const mailReadCacheTtlMs = Number(env.FEISHU_MAIL_READ_CACHE_TTL_MS || DEFAULT_MAIL_READ_CACHE_TTL_MS);
  const mailSyncEnabled = readBooleanEnv(env.FEISHU_MAIL_AUTO_SYNC_ENABLED, false);
  const mailSyncIntervalMs = readPositiveIntEnv(
    env.FEISHU_MAIL_SYNC_INTERVAL_MS,
    DEFAULT_MAIL_AUTO_SYNC_INTERVAL_MS,
  );
  const mailSyncPageSize = readPositiveIntEnv(
    env.FEISHU_MAIL_SYNC_PAGE_SIZE,
    DEFAULT_MAIL_AUTO_SYNC_PAGE_SIZE,
  );
  const autoProcessScheduleEnabled = readBooleanEnv(env.FEISHU_AUTO_PROCESS_SCHEDULE_ENABLED, false);
  const autoProcessIntervalMs = readPositiveIntEnv(
    env.FEISHU_AUTO_PROCESS_INTERVAL_MS,
    mailSyncIntervalMs,
  );
  const mailSyncStatus = {
    enabled: mailSyncEnabled,
    intervalMs: mailSyncIntervalMs,
    pageSize: mailSyncPageSize,
    allPages: true,
    inFlight: false,
    lastStartedAt: '',
    lastSyncedAt: '',
    lastError: '',
    lastCount: 0,
    lastPageCount: 0,
    lastDetailStatus: '',
    lastDetailFailedCount: 0,
  };
  const autoProcessStatus = {
    enabled: autoProcessScheduleEnabled,
    intervalMs: autoProcessIntervalMs,
    inFlight: false,
    lastStartedAt: '',
    lastProcessedAt: '',
    lastError: '',
    lastKnownProcessedCount: 0,
    lastSummary: null,
  };
  let mailSyncTimer = null;
  let mailSyncPromise = null;
  let autoProcessTimer = null;
  let autoProcessPromise = null;

  function workbenchSessionMaxAgeSeconds(rememberLogin = false) {
    const defaultValue = rememberLogin ? 30 * 24 * 60 * 60 : 8 * 60 * 60;
    const envValue = rememberLogin
      ? readPositiveIntEnv(env.WORKBENCH_REMEMBER_TTL_DAYS, 30) * 24 * 60 * 60
      : readPositiveIntEnv(env.WORKBENCH_SESSION_TTL_HOURS, 8) * 60 * 60;
    return envValue || defaultValue;
  }

  async function findWorkbenchSession(request) {
    if (!shouldRequireWorkbenchAuth(env)) return null;
    const cookies = parseCookieHeader(request.headers.cookie || '');
    return workbenchAuthStore.findSession(cookies[WORKBENCH_SESSION_COOKIE] || '');
  }

  async function requireWorkbenchSession(request, response) {
    if (!shouldRequireWorkbenchAuth(env)) return true;
    const session = await findWorkbenchSession(request);
    if (session) return true;

    sendJson(response, 401, unauthorizedWorkbenchPayload(), requestCorsHeaders(request));
    return false;
  }

  async function verifyWorkbenchHuman(request, body = {}) {
    const verification = await verifyWorkbenchCaptcha({
      env,
      token: body.captchaToken || body.captcha_token || '',
      fetchImpl,
      remoteIp: String(request.headers['x-forwarded-for'] || '').split(',')[0].trim(),
    });
    if (verification.ok) return null;
    if (Array.isArray(verification.errorCodes) && verification.errorCodes.length > 0) {
      console.warn('[workbench-auth] Turnstile verification failed:', verification.errorCodes.join(', '));
    }
    return {
      statusCode: 400,
      payload: {
        ok: false,
        error: verification.error,
        captchaErrorCodes: verification.errorCodes || [],
        message: verification.message || '请先完成人机真人验证。',
      },
    };
  }

  function sendWorkbenchSession(response, request, statusCode, payload, session, rememberLogin = false) {
    const maxAgeSeconds = workbenchSessionMaxAgeSeconds(rememberLogin);
    sendJson(response, statusCode, payload, {
      ...requestCorsHeaders(request),
      'set-cookie': buildWorkbenchSessionCookie(request, session.token, { maxAgeSeconds }),
    });
  }

  function sendWorkbenchAuthJson(response, request, statusCode, payload, headers = {}) {
    sendJson(response, statusCode, payload, {
      ...requestCorsHeaders(request),
      ...headers,
    });
  }

  async function handleWorkbenchRegister(request, response) {
    const body = await readJsonBody(request);
    const captchaError = await verifyWorkbenchHuman(request, body);
    if (captchaError) {
      sendWorkbenchAuthJson(response, request, captchaError.statusCode, captchaError.payload);
      return;
    }

    const phone = normalizeWorkbenchPhone(body.phone);
    const password = String(body.password || '');
    if (!isValidWorkbenchPhone(phone)) {
      sendWorkbenchAuthJson(response, request, 400, {
        ok: false,
        error: 'workbench_phone_invalid',
        message: '请输入有效手机号。',
      });
      return;
    }
    if (password.length < 8) {
      sendWorkbenchAuthJson(response, request, 400, {
        ok: false,
        error: 'workbench_password_too_short',
        message: '密码至少需要 8 位。',
      });
      return;
    }

    const inviteCode = String(env.WORKBENCH_SIGNUP_INVITE_CODE || '').trim();
    const submittedInviteCode = String(body.inviteCode || body.invite_code || '').trim();
    const userCount = await workbenchAuthStore.countUsers();
    if (inviteCode && submittedInviteCode !== inviteCode) {
      sendWorkbenchAuthJson(response, request, 403, {
        ok: false,
        error: 'workbench_invite_code_invalid',
        message: '开户注册码不正确。',
      });
      return;
    }
    if (!inviteCode && userCount > 0) {
      sendWorkbenchAuthJson(response, request, 403, {
        ok: false,
        error: 'workbench_signup_closed',
        message: '账号创建已关闭，请联系管理员开户注册码。',
      });
      return;
    }

    try {
      const created = await workbenchAuthStore.createUser({ phone, password });
      const rememberLogin = body.rememberLogin === true || body.remember_login === true;
      const session = await workbenchAuthStore.createSession({ phone, rememberLogin });
      sendWorkbenchSession(response, request, 201, {
        ok: true,
        user: created.user,
        message: '账号已创建并登录。',
      }, session, rememberLogin);
    } catch (error) {
      sendWorkbenchAuthJson(response, request, 409, {
        ok: false,
        error: 'workbench_account_conflict',
        message: error.message || '账号创建失败。',
      });
    }
  }

  async function handleWorkbenchLogin(request, response) {
    const body = await readJsonBody(request);
    const captchaError = await verifyWorkbenchHuman(request, body);
    if (captchaError) {
      sendWorkbenchAuthJson(response, request, captchaError.statusCode, captchaError.payload);
      return;
    }

    const phone = normalizeWorkbenchPhone(body.phone);
    const password = String(body.password || '');
    if (!isValidWorkbenchPhone(phone) || !password) {
      sendWorkbenchAuthJson(response, request, 400, {
        ok: false,
        error: 'workbench_login_invalid',
        message: '请输入手机号和密码。',
      });
      return;
    }

    const verified = await workbenchAuthStore.verifyPassword(phone, password);
    if (!verified) {
      sendWorkbenchAuthJson(response, request, 401, {
        ok: false,
        error: 'workbench_login_failed',
        message: '手机号或密码不正确。',
      });
      return;
    }

    const rememberLogin = body.rememberLogin === true || body.remember_login === true;
    const session = await workbenchAuthStore.createSession({ phone, rememberLogin });
    sendWorkbenchSession(response, request, 200, {
      ok: true,
      user: session.user,
      message: '登录成功。',
    }, session, rememberLogin);
  }

  async function handleWorkbenchResetPassword(request, response) {
    const body = await readJsonBody(request);
    const captchaError = await verifyWorkbenchHuman(request, body);
    if (captchaError) {
      sendWorkbenchAuthJson(response, request, captchaError.statusCode, captchaError.payload);
      return;
    }

    const phone = normalizeWorkbenchPhone(body.phone);
    const newPassword = String(body.newPassword || body.new_password || '');
    if (!isValidWorkbenchPhone(phone)) {
      sendWorkbenchAuthJson(response, request, 400, {
        ok: false,
        error: 'workbench_phone_invalid',
        message: '请输入有效手机号。',
      });
      return;
    }
    if (newPassword.length < 8) {
      sendWorkbenchAuthJson(response, request, 400, {
        ok: false,
        error: 'workbench_password_too_short',
        message: '新密码至少需要 8 位。',
      });
      return;
    }

    const resetCode = String(env.WORKBENCH_PASSWORD_RESET_CODE || env.WORKBENCH_SIGNUP_INVITE_CODE || '').trim();
    const submittedResetCode = String(body.resetCode || body.reset_code || body.inviteCode || body.invite_code || '').trim();
    if (!resetCode) {
      sendWorkbenchAuthJson(response, request, 403, {
        ok: false,
        error: 'workbench_password_reset_disabled',
        message: '管理员还没有配置密码重置码。',
      });
      return;
    }
    if (submittedResetCode !== resetCode) {
      sendWorkbenchAuthJson(response, request, 403, {
        ok: false,
        error: 'workbench_password_reset_code_invalid',
        message: '密码重置码不正确。',
      });
      return;
    }

    const existingUser = await workbenchAuthStore.findUserByPhone(phone);
    if (!existingUser) {
      sendWorkbenchAuthJson(response, request, 404, {
        ok: false,
        error: 'workbench_account_not_found',
        message: '未找到这个手机号对应的工作台账号。',
      });
      return;
    }

    const updated = await workbenchAuthStore.updatePassword({ phone, newPassword });
    const rememberLogin = body.rememberLogin === true || body.remember_login === true;
    const session = await workbenchAuthStore.createSession({ phone, rememberLogin });
    sendWorkbenchSession(response, request, 200, {
      ok: true,
      user: updated.user,
      message: '密码已重置并登录。',
    }, session, rememberLogin);
  }

  async function handleWorkbenchChangePassword(request, response) {
    const body = await readJsonBody(request);
    const session = await findWorkbenchSession(request);
    if (!session) {
      sendWorkbenchAuthJson(response, request, 401, unauthorizedWorkbenchPayload());
      return;
    }

    const currentPassword = String(body.currentPassword || body.current_password || '');
    const newPassword = String(body.newPassword || body.new_password || '');
    if (!currentPassword || newPassword.length < 8) {
      sendWorkbenchAuthJson(response, request, 400, {
        ok: false,
        error: 'workbench_password_invalid',
        message: '请输入当前密码，并设置至少 8 位的新密码。',
      });
      return;
    }

    const verified = await workbenchAuthStore.verifyPassword(session.user.phone, currentPassword);
    if (!verified) {
      sendWorkbenchAuthJson(response, request, 401, {
        ok: false,
        error: 'workbench_current_password_invalid',
        message: '当前密码不正确。',
      });
      return;
    }

    const updated = await workbenchAuthStore.updatePassword({
      phone: session.user.phone,
      newPassword,
    });
    const rememberLogin = body.rememberLogin === true || body.remember_login === true;
    const nextSession = await workbenchAuthStore.createSession({
      phone: session.user.phone,
      rememberLogin,
    });
    sendWorkbenchSession(response, request, 200, {
      ok: true,
      user: updated.user,
      message: '密码已修改，请使用新密码登录。',
    }, nextSession, rememberLogin);
  }

  async function handleWorkbenchLogout(request, response) {
    const cookies = parseCookieHeader(request.headers.cookie || '');
    await workbenchAuthStore.deleteSession(cookies[WORKBENCH_SESSION_COOKIE] || '');
    sendWorkbenchAuthJson(response, request, 200, {
      ok: true,
      message: '已退出登录。',
    }, {
      'set-cookie': buildClearWorkbenchSessionCookie(request),
    });
  }

  async function handleWorkbenchMe(request, response) {
    const session = await findWorkbenchSession(request);
    if (!session) {
      sendWorkbenchAuthJson(response, request, 401, unauthorizedWorkbenchPayload());
      return;
    }

    sendWorkbenchAuthJson(response, request, 200, {
      ok: true,
      user: session.user,
      expiresAt: session.expiresAt,
    });
  }

  async function attachProcessingStatusToMailPayload(payload = {}) {
    const statusMap = await loadMailProcessingStatusMap(resolvedDataRoot);
    const riskOverrides = await loadRiskOverrideMap(resolvedDataRoot);
    const mails = Array.isArray(payload.mails)
      ? payload.mails.map((mail) => {
        const directProcessingStatus = statusMap.get(String(mail.id))
          || statusMap.get(String(mail.messageId || mail.message_id || ''));
        const threadProcessingStatus = statusMap.get(`thread:${mail.threadId || mail.thread_id || ''}`);
        const processingStatus = directProcessingStatus
          || (canApplyThreadProcessingStatus(threadProcessingStatus, mail) ? threadProcessingStatus : null);
        const riskOverride = findRiskOverride(riskOverrides, mail);

        return {
          ...mail,
          ...(processingStatus ? { processingStatus } : {}),
          ...(riskOverride ? { riskOverride } : {}),
        };
      })
      : payload.mails;

    return {
      ...payload,
      mails,
      processingStatusSummary: {
        completedCount: Array.isArray(mails)
          ? mails.filter((mail) => mail.processingStatus?.status === 'completed').length
          : 0,
      },
    };
  }

  async function refreshMailSyncCache(reason = 'scheduled') {
    if (!mailSyncEnabled) return mailSyncStatus;
    if (mailSyncPromise) return mailSyncPromise;

    const readiness = validateFeishuApiEnv(env);
    if (!readiness.configured) {
      mailSyncStatus.lastError = `飞书 API 配置不完整：${readiness.missing.join(', ')}`;
      return mailSyncStatus;
    }

    mailSyncStatus.inFlight = true;
    mailSyncStatus.lastStartedAt = new Date().toISOString();
    const searchParams = buildFullMailSyncSearchParams(mailSyncPageSize);
    const cacheKey = searchParams.toString();

    mailSyncPromise = (async () => {
      try {
        const result = await readFeishuMessages({
          fetchImpl,
          env,
          searchParams,
        });

        if (result.statusCode !== 200 || !result.payload.ok) {
          throw new Error(result.payload.message || result.payload.error || '飞书邮件同步失败。');
        }

        const cachedAt = Date.now();
        const payload = await attachProcessingStatusToMailPayload({
          ...result.payload,
          cacheStatus: 'scheduled',
          syncReason: reason,
        });
        mailReadCache.set(cacheKey, {
          cachedAt,
          payload,
        });
        mailSyncStatus.lastSyncedAt = new Date(cachedAt).toISOString();
        mailSyncStatus.lastError = '';
        mailSyncStatus.lastCount = payload.mails?.length || 0;
        mailSyncStatus.lastPageCount = payload.pageCount || 1;
        mailSyncStatus.lastDetailStatus = payload.detailStatus || '';
        mailSyncStatus.lastDetailFailedCount = payload.detailFailedCount || 0;
      } catch (error) {
        mailSyncStatus.lastError = error.message;
      } finally {
        mailSyncStatus.inFlight = false;
        mailSyncPromise = null;
      }

      return mailSyncStatus;
    })();

    return mailSyncPromise;
  }

  async function runScheduledAutoProcess(reason = 'scheduled') {
    if (!autoProcessScheduleEnabled) return autoProcessStatus;
    if (autoProcessPromise) return autoProcessPromise;

    const readiness = validateFeishuApiEnv(env);
    if (!readiness.configured) {
      autoProcessStatus.lastError = `飞书 API 配置不完整：${readiness.missing.join(', ')}`;
      return autoProcessStatus;
    }

    autoProcessStatus.inFlight = true;
    autoProcessStatus.lastStartedAt = new Date().toISOString();

    autoProcessPromise = (async () => {
      try {
        const processedMailKeys = await loadProcessedMailKeys(resolvedDataRoot);
        autoProcessStatus.lastKnownProcessedCount = processedMailKeys.size;
        const result = await executeClosedLoopProcess({
          body: {
            pageSize: mailSyncPageSize,
            actor: 'scheduled-auto-process',
            skipMailIds: Array.from(processedMailKeys),
            runtimeControls: {
              autoProcessEnabled: true,
              autoSendLowRiskEnabled: true,
              autoArchiveSpamEnabled: true,
            },
            reason,
          },
          env,
          envInfo: runtimeEnvInfo,
          fetchImpl,
          auditWriter,
          rootDir: resolvedDataRoot,
          emailAIRepository,
        });

        if (result.statusCode !== 200 || !result.payload?.ok) {
          throw new Error(result.payload?.message || result.payload?.error || '后台闭环处理失败。');
        }

        autoProcessStatus.lastProcessedAt = new Date().toISOString();
        autoProcessStatus.lastError = '';
        autoProcessStatus.lastSummary = result.payload.summary || null;
      } catch (error) {
        autoProcessStatus.lastError = error.message;
      } finally {
        autoProcessStatus.inFlight = false;
        autoProcessPromise = null;
      }

      return autoProcessStatus;
    })();

    return autoProcessPromise;
  }

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url, 'http://127.0.0.1');

    try {
      if (request.method === 'OPTIONS') {
        sendOptions(response, request);
        return;
      }

      if (requestUrl.pathname === '/healthz') {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          sendMethodNotAllowed(response);
          return;
        }
        sendJson(response, 200, {
          ok: true,
          status: 'ok',
          service: 'as-feishu-mail-panel',
        });
        return;
      }

      await ensureDataRootReady();

      if (requestUrl.pathname === '/api/workbench-auth/captcha/config') {
        if (request.method !== 'GET') {
          sendMethodNotAllowed(response);
          return;
        }
        sendJson(response, 200, {
          ok: true,
          ...buildWorkbenchCaptchaConfig(env),
        }, requestCorsHeaders(request));
        return;
      }

      if (requestUrl.pathname === '/api/workbench-auth/register') {
        if (request.method !== 'POST') {
          sendMethodNotAllowed(response);
          return;
        }
        await handleWorkbenchRegister(request, response);
        return;
      }

      if (requestUrl.pathname === '/api/workbench-auth/login') {
        if (request.method !== 'POST') {
          sendMethodNotAllowed(response);
          return;
        }
        await handleWorkbenchLogin(request, response);
        return;
      }

      if (requestUrl.pathname === '/api/workbench-auth/reset-password') {
        if (request.method !== 'POST') {
          sendMethodNotAllowed(response);
          return;
        }
        await handleWorkbenchResetPassword(request, response);
        return;
      }

      if (requestUrl.pathname === '/api/workbench-auth/change-password') {
        if (request.method !== 'POST') {
          sendMethodNotAllowed(response);
          return;
        }
        await handleWorkbenchChangePassword(request, response);
        return;
      }

      if (requestUrl.pathname === '/api/workbench-auth/logout') {
        if (request.method !== 'POST') {
          sendMethodNotAllowed(response);
          return;
        }
        await handleWorkbenchLogout(request, response);
        return;
      }

      if (requestUrl.pathname === '/api/workbench-auth/me') {
        if (request.method !== 'GET') {
          sendMethodNotAllowed(response);
          return;
        }
        await handleWorkbenchMe(request, response);
        return;
      }

      if (shouldRequireWorkbenchAuth(env) && isProtectedWorkbenchApiPath(requestUrl.pathname)) {
        const allowed = await requireWorkbenchSession(request, response);
        if (!allowed) return;
      }

      if (requestUrl.pathname === '/oauth/start') {
        if (request.method !== 'GET') {
          sendMethodNotAllowed(response);
          return;
        }

        const config = buildFeishuServerConfig(env);
        const redirectUri = buildLocalOAuthRedirectUri({ request, env });
        response.writeHead(302, {
          location: buildFeishuOAuthAuthorizeUrl({
            appId: config.appId,
            apiBase: config.apiBase,
            redirectUri,
            state: requestUrl.searchParams.get('state') || 'mail-workbench',
            scope: normalizeOAuthScope(requestUrl.searchParams.get('scope') || env.FEISHU_OAUTH_SCOPE || DEFAULT_OAUTH_SCOPES),
          }),
          'cache-control': 'no-store',
        });
        response.end();
        return;
      }

      if (requestUrl.pathname === '/oauth/callback') {
        if (request.method !== 'GET') {
          sendMethodNotAllowed(response);
          return;
        }

        const code = requestUrl.searchParams.get('code') || '';
        if (!code) {
          sendHtml(response, 400, renderOAuthMessagePage({
            title: '飞书授权未完成',
            message: '回调里没有 code。请从 /oauth/start 重新发起授权。',
            status: 'error',
          }));
          return;
        }

        const config = buildFeishuServerConfig(env);
        const redirectUri = buildLocalOAuthRedirectUri({ request, env });
        const tokenRequest = buildFeishuUserAccessTokenRequest({
          appId: config.appId,
          appSecret: config.appSecret,
          apiBase: config.apiBase,
          code,
          redirectUri,
        });
        const tokenPayload = await fetchJson(fetchImpl, tokenRequest.url, tokenRequest.options);
        const {
          token,
          refreshToken,
          expiresIn,
          refreshExpiresIn,
        } = extractUserAccessToken(tokenPayload);
        const envPath = runtimeEnvInfo.path || join(resolvedDataRoot, '.env.local');
        const updates = buildUserTokenEnvUpdates({
          token,
          refreshToken,
          expiresIn,
          refreshExpiresIn,
        });

        await updateLocalEnvValues(envPath, updates);
        Object.assign(env, updates);

        const refreshReady = Boolean(refreshToken || env.FEISHU_USER_REFRESH_TOKEN);

        sendHtml(response, 200, renderOAuthMessagePage({
          title: refreshReady ? 'user_access_token 和 refresh_token 已写入' : 'user_access_token 已写入，但 refresh_token 未返回',
          message: refreshReady
            ? '.env.local 已更新，后续 user_access_token 过期会由本地服务自动续期。'
            : '.env.local 已更新，但飞书没有返回 refresh_token。请确认应用权限已开通并发布 offline_access 后，再从 /oauth/start 重新授权一次。',
          detail: '<a href="/api/feishu/status">查看本地飞书状态</a> · <a href="/">回到工作台</a>',
          status: refreshReady ? 'ok' : 'error',
        }));
        return;
      }

      if (requestUrl.pathname === '/api/admin/email-ai-control/password-login') {
        if (request.method !== 'POST') {
          sendMethodNotAllowed(response);
          return;
        }
        const body = await readJsonBody(request);
        const result = await handleEmailAIAdminPasswordLoginRequest({
          body,
          env,
        }).catch(normalizeEmailAIHttpError);
        sendJson(response, result.statusCode, result.payload);
        return;
      }

      if (requestUrl.pathname.startsWith('/api/admin/email-ai-control')) {
        const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
          ? await readJsonBody(request)
          : {};
        const result = await handleEmailAIAdminRequest({
          request,
          requestUrl,
          body,
          repository: emailAIRepository,
          rootDir: resolvedDataRoot,
          env,
          envInfo: runtimeEnvInfo,
          fetchImpl,
        }).catch(normalizeEmailAIHttpError);
        sendJson(response, result.statusCode, result.payload);
        return;
      }

      if (requestUrl.pathname === '/api/email-ai/process') {
        if (request.method !== 'POST') {
          sendMethodNotAllowed(response);
          return;
        }
        const body = await readJsonBody(request);
        const result = await handleEmailAIProcessRequest({
          request,
          body,
          repository: emailAIRepository,
          rootDir: resolvedDataRoot,
          env,
          fetchImpl,
        }).catch(normalizeEmailAIHttpError);
        sendJson(response, result.statusCode, result.payload);
        return;
      }

      if (requestUrl.pathname === '/api/email-ai/status') {
        if (request.method !== 'GET') {
          sendMethodNotAllowed(response);
          return;
        }
        const result = await handleEmailAIStatusRequest({
          request,
          repository: emailAIRepository,
          rootDir: resolvedDataRoot,
          env,
        }).catch(normalizeEmailAIHttpError);
        sendJson(response, result.statusCode, result.payload);
        return;
      }

      if (requestUrl.pathname === '/api/feishu/status') {
        if (request.method !== 'GET') {
          sendMethodNotAllowed(response);
          return;
        }

        sendJson(response, 200, {
          ...buildPublicFeishuApiStatus(env),
          write: buildPublicFeishuWriteStatus(env),
          workbenchStorage: {
            dataRootConfigured: Boolean(env.WORKBENCH_DATA_DIR || env.RAILWAY_VOLUME_MOUNT_PATH),
            workbenchDataDirConfigured: Boolean(env.WORKBENCH_DATA_DIR),
            railwayVolumeMountPathConfigured: Boolean(env.RAILWAY_VOLUME_MOUNT_PATH),
            localEnvLoaded: Boolean(runtimeEnvInfo.loaded),
          },
          workbenchAuth: await workbenchAuthStore.getStorageStatus(),
          mailSync: {
            ...mailSyncStatus,
            inFlight: mailSyncStatus.inFlight || Boolean(mailSyncPromise),
          },
          autoProcessSchedule: {
            ...autoProcessStatus,
            inFlight: autoProcessStatus.inFlight || Boolean(autoProcessPromise),
          },
          mailboxAddress: env.FEISHU_USER_MAILBOX_ID || '',
          botReportEmail: env.FEISHU_BOT_REPORT_EMAIL || '',
          appIdMasked: maskConfigValue(env.FEISHU_APP_ID),
          localEnvLoaded: Boolean(runtimeEnvInfo.loaded),
        });
        return;
      }

      if (requestUrl.pathname === '/api/feishu/mail/messages') {
        if (request.method !== 'GET') {
          sendMethodNotAllowed(response);
          return;
        }

        const cacheKey = requestUrl.searchParams.toString() || 'default';
        const cached = mailReadCache.get(cacheKey);
        const now = Date.now();

        if (cached && now - cached.cachedAt <= mailReadCacheTtlMs) {
          const payload = await attachProcessingStatusToMailPayload(cached.payload);
          sendJson(response, 200, {
            ...payload,
            cacheStatus: 'hit',
            cachedAt: new Date(cached.cachedAt).toISOString(),
          });
          return;
        }

        const result = await readFeishuMessages({
          fetchImpl,
          env,
          searchParams: requestUrl.searchParams,
        });

        if (result.statusCode === 200 && result.payload.ok) {
          if (result.payload.allPagesFetched) {
            mailSyncStatus.lastSyncedAt = new Date(now).toISOString();
            mailSyncStatus.lastError = '';
            mailSyncStatus.lastCount = result.payload.mails?.length || 0;
            mailSyncStatus.lastPageCount = result.payload.pageCount || 1;
            mailSyncStatus.lastDetailStatus = result.payload.detailStatus || '';
            mailSyncStatus.lastDetailFailedCount = result.payload.detailFailedCount || 0;
          }

          const payload = await attachProcessingStatusToMailPayload({
            ...result.payload,
            cacheStatus: 'miss',
          });
          mailReadCache.set(cacheKey, {
            cachedAt: now,
            payload,
          });
          sendJson(response, result.statusCode, {
            ...payload,
            cacheStatus: 'miss',
          });
          return;
        }

        if (cached) {
          const payload = await attachProcessingStatusToMailPayload(cached.payload);
          sendJson(response, 200, {
            ...payload,
            ok: true,
            cacheStatus: 'stale',
            cachedAt: new Date(cached.cachedAt).toISOString(),
            staleReason: result.payload.message || result.payload.error || '飞书读取失败，已回退到本地缓存。',
          });
          return;
        }

        sendJson(response, result.statusCode, result.payload);
        return;
      }

      if (requestUrl.pathname === '/api/feishu/mail/actions/send') {
        if (request.method !== 'POST') {
          sendMethodNotAllowed(response);
          return;
        }
        const body = await readJsonBody(request);
        const result = await executeWriteAction({
          action: 'send',
          body,
          env,
          envInfo: runtimeEnvInfo,
          fetchImpl,
          auditWriter,
          rootDir: resolvedDataRoot,
        });
        sendJson(response, result.statusCode, result.payload);
        return;
      }

      if (requestUrl.pathname === '/api/feishu/mail/actions/archive') {
        if (request.method !== 'POST') {
          sendMethodNotAllowed(response);
          return;
        }
        const body = await readJsonBody(request);
        const result = await executeWriteAction({
          action: 'archive',
          body,
          env,
          envInfo: runtimeEnvInfo,
          fetchImpl,
          auditWriter,
          rootDir: resolvedDataRoot,
        });
        sendJson(response, result.statusCode, result.payload);
        return;
      }

      if (requestUrl.pathname === '/api/feishu/mail/actions/approve') {
        if (request.method !== 'POST') {
          sendMethodNotAllowed(response);
          return;
        }
        const body = await readJsonBody(request);
        const result = await recordApprovalAction({
          body,
          auditWriter,
          rootDir: resolvedDataRoot,
        });
        sendJson(response, result.statusCode, result.payload);
        return;
      }

      if (requestUrl.pathname === '/api/feishu/mail/actions/process') {
        if (request.method !== 'POST') {
          sendMethodNotAllowed(response);
          return;
        }
        const body = await readJsonBody(request);
        const result = await executeClosedLoopProcess({
          body,
          env,
          envInfo: runtimeEnvInfo,
          fetchImpl,
          auditWriter,
          rootDir: resolvedDataRoot,
          emailAIRepository,
        });
        sendJson(response, result.statusCode, result.payload);
        return;
      }

      if (requestUrl.pathname === '/api/feishu/bot/messages/send') {
        if (request.method !== 'POST') {
          sendMethodNotAllowed(response);
          return;
        }
        const body = await readJsonBody(request);
        const result = await executeBotMessageAction({
          body,
          env,
          envInfo: runtimeEnvInfo,
          fetchImpl,
          auditWriter,
          rootDir: resolvedDataRoot,
        });
        sendJson(response, result.statusCode, result.payload);
        return;
      }

      if (requestUrl.pathname === '/api/feishu/mail/folders/ensure-archive') {
        if (request.method !== 'POST') {
          sendMethodNotAllowed(response);
          return;
        }
        const body = await readJsonBody(request);
        const result = await ensureArchiveFolder({
          body,
          env,
          envInfo: runtimeEnvInfo,
          fetchImpl,
          auditWriter,
          rootDir: resolvedDataRoot,
        });
        sendJson(response, result.statusCode, result.payload);
        return;
      }

      if (requestUrl.pathname === '/api/feishu/mail/risk-overrides') {
        if (request.method !== 'POST') {
          sendMethodNotAllowed(response);
          return;
        }
        const body = await readJsonBody(request);
        const result = await updateRiskOverrideAction({
          body,
          rootDir: resolvedDataRoot,
        });
        sendJson(response, result.statusCode, result.payload);
        return;
      }

      if (requestUrl.pathname === '/api/feishu/config/update') {
        if (request.method !== 'POST') {
          sendMethodNotAllowed(response);
          return;
        }
        const body = await readJsonBody(request);
        const result = await updateFeishuLocalConfig({
          body,
          env,
          envInfo: runtimeEnvInfo,
          rootDir: resolvedDataRoot,
        });
        sendJson(response, result.statusCode, result.payload);
        return;
      }

      if (requestUrl.pathname.startsWith('/api/')) {
        sendJson(response, 404, {
          ok: false,
          error: 'api_not_found',
          message: '未开放该 API。',
          realSendEnabled: false,
        });
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendMethodNotAllowed(response);
        return;
      }

      await serveStaticFile(requestUrl, response, resolvedRoot);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      sendJson(response, statusCode, {
        ok: false,
        error: error.errorCode || 'feishu_api_proxy_error',
        mode: error.mode || 'server_error',
        message: error.message,
        sourceStatus: 'API 待接入',
        realSendEnabled: false,
      });
    }
  });

  server.on('listening', () => {
    ensureDataRootReady();

    if (mailSyncEnabled) {
      ensureDataRootReady().then(() => refreshMailSyncCache('startup')).catch((error) => {
        mailSyncStatus.lastError = error.message;
      });
      mailSyncTimer = setInterval(() => {
        refreshMailSyncCache('interval');
      }, mailSyncIntervalMs);
      mailSyncTimer.unref?.();
    }

    if (autoProcessScheduleEnabled) {
      ensureDataRootReady().then(() => runScheduledAutoProcess('startup')).catch((error) => {
        autoProcessStatus.lastError = error.message;
      });
      autoProcessTimer = setInterval(() => {
        runScheduledAutoProcess('interval');
      }, autoProcessIntervalMs);
      autoProcessTimer.unref?.();
    }
  });

  server.on('close', () => {
    if (mailSyncTimer) {
      clearInterval(mailSyncTimer);
      mailSyncTimer = null;
    }
    if (autoProcessTimer) {
      clearInterval(autoProcessTimer);
      autoProcessTimer = null;
    }
  });

  return server;
}

export function isCliEntryPoint(moduleUrl, argvPath) {
  return Boolean(argvPath) && fileURLToPath(moduleUrl) === resolve(argvPath);
}

if (isCliEntryPoint(import.meta.url, process.argv[1])) {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const rootDir = resolve(process.cwd());
  const dataRoot = resolveWorkbenchDataRoot({
    rootDir,
    env: process.env,
  });
  const envInfo = loadLocalEnv({ rootDir: dataRoot });
  const host = process.env.HOST || '0.0.0.0';
  const server = createFeishuApiServer({
    rootDir,
    env: envInfo.env,
    envInfo,
  });

  server.listen(port, host, () => {
    console.log(`飞书邮箱工作台 API 代理已启动：http://${host}:${port}`);
    console.log(`运行数据目录：${dataRoot}`);
    console.log(`本地环境文件：${envInfo.loaded ? '已加载 .env.local' : '未发现 .env.local，使用当前 shell 环境变量'}`);
    console.log('真实写操作受 FEISHU_WRITE_ENABLED、原始来信人策略、审批和限额控制。App Secret / token 只从本地环境变量读取，不写入前端。');
  });
}
