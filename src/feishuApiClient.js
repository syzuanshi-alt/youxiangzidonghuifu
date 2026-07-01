export const DEFAULT_FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';
export const DEFAULT_FEISHU_MAIL_PAGE_SIZE = 20;
export const MAX_FEISHU_MAIL_PAGE_SIZE = 20;
const TOKEN_STATUS_SKEW_MS = 5 * 60 * 1000;

export const FEISHU_REQUIRED_ENV_KEYS = [
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'FEISHU_USER_MAILBOX_ID',
];

export const DEFAULT_FEISHU_MAIL_FOLDER_ID = 'INBOX';

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function readEnv(env, key) {
  return hasValue(env[key]) ? String(env[key]).trim() : '';
}

function normalizeIsoTimestamp(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function isIsoTimestampNearExpiry(value, now = Date.now()) {
  const timestamp = Date.parse(String(value || '').trim());
  return Number.isFinite(timestamp) && timestamp - now <= TOKEN_STATUS_SKEW_MS;
}

function isReadableText(value) {
  return /[\u4e00-\u9fa5a-zA-Z0-9]/.test(value);
}

function isLikelyBase64(value) {
  const text = normalizeBase64Candidate(value);
  return text.length >= 8
    && /^[A-Za-z0-9+/_-]+={0,2}$/.test(text);
}

function normalizeBase64Candidate(value) {
  return String(value || '')
    .trim()
    .replace(/\\r|\\n/g, '')
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
}

function padBase64(value) {
  const remainder = value.length % 4;
  return remainder === 0 ? value : `${value}${'='.repeat(4 - remainder)}`;
}

export function decodeFeishuBodyText(value) {
  if (!hasValue(value)) return '';

  const originalText = String(value);
  const normalizedText = normalizeBase64Candidate(originalText);
  if (!isLikelyBase64(normalizedText)) {
    return originalText;
  }

  try {
    const decoded = Buffer.from(padBase64(normalizedText), 'base64').toString('utf8');
    return isReadableText(decoded) ? decoded : originalText;
  } catch {
    return originalText;
  }
}

export function normalizeFeishuPageSize(pageSize = DEFAULT_FEISHU_MAIL_PAGE_SIZE) {
  const parsed = Number(pageSize);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_FEISHU_MAIL_PAGE_SIZE;
  }

  return Math.min(parsed, MAX_FEISHU_MAIL_PAGE_SIZE);
}

export function validateFeishuApiEnv(env = {}) {
  const missing = FEISHU_REQUIRED_ENV_KEYS.filter((key) => !hasValue(env[key]));
  const configured = missing.length === 0;

  return {
    configured,
    missing,
    canReadMail: configured,
    canSaveDraft: false,
    canSendMail: false,
    realSendEnabled: false,
    sourceStatus: configured ? '真实接入' : 'API 待接入',
  };
}

export function buildPublicFeishuApiStatus(env = {}) {
  const readiness = validateFeishuApiEnv(env);
  const userAccessTokenExpiresAt = normalizeIsoTimestamp(env.FEISHU_USER_ACCESS_TOKEN_EXPIRES_AT);
  const userRefreshTokenExpiresAt = normalizeIsoTimestamp(env.FEISHU_USER_REFRESH_TOKEN_EXPIRES_AT);
  const userAccessTokenConfigured = hasValue(env.FEISHU_USER_ACCESS_TOKEN);
  const userRefreshTokenConfigured = hasValue(env.FEISHU_USER_REFRESH_TOKEN);

  return {
    ...readiness,
    appIdConfigured: hasValue(env.FEISHU_APP_ID),
    appSecretConfigured: hasValue(env.FEISHU_APP_SECRET),
    userMailboxIdConfigured: hasValue(env.FEISHU_USER_MAILBOX_ID),
    userAccessTokenConfigured,
    userRefreshTokenConfigured,
    userTokenAutoRefreshReady: userAccessTokenConfigured && userRefreshTokenConfigured,
    userTokenNeedsReauthorization: userAccessTokenConfigured && !userRefreshTokenConfigured,
    userAccessTokenExpiringSoon: Boolean(userAccessTokenExpiresAt && isIsoTimestampNearExpiry(userAccessTokenExpiresAt)),
    userRefreshTokenExpiringSoon: Boolean(userRefreshTokenExpiresAt && isIsoTimestampNearExpiry(userRefreshTokenExpiresAt)),
    userAccessTokenExpiresAt,
    userRefreshTokenExpiresAt,
    apiBaseConfigured: hasValue(env.FEISHU_API_BASE),
    apiProxyAvailable: true,
    endpoints: {
      status: '/api/feishu/status',
      messages: '/api/feishu/mail/messages',
      botMessage: '/api/feishu/bot/messages/send',
      ensureArchiveFolder: '/api/feishu/mail/folders/ensure-archive',
    },
    note: readiness.configured
      ? '邮件读取 API 可尝试读取；真实发送和归档由服务端写操作开关控制。'
      : '需要在本地服务端环境变量中补齐飞书应用配置。',
  };
}

export function buildTenantAccessTokenRequest({
  appId,
  appSecret,
  apiBase = DEFAULT_FEISHU_API_BASE,
} = {}) {
  return {
    url: `${trimTrailingSlash(apiBase)}/auth/v3/tenant_access_token/internal`,
    options: {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        app_id: appId,
        app_secret: appSecret,
      }),
    },
  };
}

export function buildFeishuOAuthAuthorizeUrl({
  appId,
  apiBase = DEFAULT_FEISHU_API_BASE,
  redirectUri,
  state = 'mail-workbench',
  scope = '',
} = {}) {
  const url = new URL(`${trimTrailingSlash(apiBase)}/authen/v1/index`);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('app_id', appId);
  url.searchParams.set('state', state);
  if (hasValue(scope)) {
    url.searchParams.set('scope', scope);
  }

  return url.toString();
}

export function buildFeishuUserAccessTokenRequest({
  appId,
  appSecret,
  apiBase = DEFAULT_FEISHU_API_BASE,
  code,
  redirectUri,
} = {}) {
  return {
    url: `${trimTrailingSlash(apiBase)}/authen/v2/oauth/token`,
    options: {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: appId,
        client_secret: appSecret,
        code,
        redirect_uri: redirectUri,
      }),
    },
  };
}

export function buildFeishuRefreshUserAccessTokenRequest({
  appId,
  appSecret,
  apiBase = DEFAULT_FEISHU_API_BASE,
  refreshToken,
} = {}) {
  return {
    url: `${trimTrailingSlash(apiBase)}/authen/v2/oauth/token`,
    options: {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: appId,
        client_secret: appSecret,
        refresh_token: refreshToken,
      }),
    },
  };
}

export function buildFeishuMailListUrl({
  apiBase = DEFAULT_FEISHU_API_BASE,
  userMailboxId,
  pageSize = DEFAULT_FEISHU_MAIL_PAGE_SIZE,
  pageToken = '',
  folderId = DEFAULT_FEISHU_MAIL_FOLDER_ID,
  labelId = '',
} = {}) {
  const safeMailboxId = encodeURIComponent(userMailboxId);
  const url = new URL(`${trimTrailingSlash(apiBase)}/mail/v1/user_mailboxes/${safeMailboxId}/messages`);
  url.searchParams.set('page_size', String(normalizeFeishuPageSize(pageSize)));

  if (hasValue(folderId)) {
    url.searchParams.set('folder_id', String(folderId).trim());
  } else if (hasValue(labelId)) {
    url.searchParams.set('label_id', String(labelId).trim());
  }

  if (hasValue(pageToken)) {
    url.searchParams.set('page_token', String(pageToken).trim());
  }

  return url.toString();
}

export function buildFeishuMailFolderListUrl({
  apiBase = DEFAULT_FEISHU_API_BASE,
  userMailboxId,
  pageSize = DEFAULT_FEISHU_MAIL_PAGE_SIZE,
  pageToken = '',
} = {}) {
  const safeMailboxId = encodeURIComponent(userMailboxId);
  const url = new URL(`${trimTrailingSlash(apiBase)}/mail/v1/user_mailboxes/${safeMailboxId}/folders`);
  url.searchParams.set('page_size', String(normalizeFeishuPageSize(pageSize)));

  if (hasValue(pageToken)) {
    url.searchParams.set('page_token', String(pageToken).trim());
  }

  return url.toString();
}

export function buildFeishuMessageDetailUrl({
  apiBase = DEFAULT_FEISHU_API_BASE,
  userMailboxId,
  messageId,
} = {}) {
  const safeMailboxId = encodeURIComponent(userMailboxId);
  const safeMessageId = encodeURIComponent(messageId);

  return `${trimTrailingSlash(apiBase)}/mail/v1/user_mailboxes/${safeMailboxId}/messages/${safeMessageId}`;
}

export function buildFeishuCreateMailFolderRequest({
  apiBase = DEFAULT_FEISHU_API_BASE,
  userMailboxId,
  tenantAccessToken,
  name,
  parentFolderId = '0',
} = {}) {
  const safeMailboxId = encodeURIComponent(userMailboxId);

  return {
    url: `${trimTrailingSlash(apiBase)}/mail/v1/user_mailboxes/${safeMailboxId}/folders`,
    options: {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tenantAccessToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        name,
        parent_folder_id: parentFolderId,
      }),
    },
  };
}

export function buildFeishuSendMessageRequest({
  apiBase = DEFAULT_FEISHU_API_BASE,
  userMailboxId,
  userAccessToken,
  recipient,
  subject,
  content,
  dedupeKey = '',
} = {}) {
  const safeMailboxId = encodeURIComponent(userMailboxId);
  const body = {
    subject,
    to: [
      {
        mail_address: recipient,
      },
    ],
    body_plain_text: content,
  };

  if (hasValue(dedupeKey)) {
    body.dedupe_key = dedupeKey;
  }

  return {
    url: `${trimTrailingSlash(apiBase)}/mail/v1/user_mailboxes/${safeMailboxId}/messages/send`,
    options: {
      method: 'POST',
      headers: {
        authorization: `Bearer ${userAccessToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
    },
  };
}

export function buildFeishuArchiveMessageRequest({
  apiBase = DEFAULT_FEISHU_API_BASE,
  userMailboxId,
  userAccessToken,
  messageId,
  archiveFolderId,
} = {}) {
  const safeMailboxId = encodeURIComponent(userMailboxId);

  return {
    url: `${trimTrailingSlash(apiBase)}/mail/v1/user_mailboxes/${safeMailboxId}/messages/batch_modify`,
    options: {
      method: 'POST',
      headers: {
        authorization: `Bearer ${userAccessToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        message_ids: [messageId],
        add_folder: archiveFolderId,
      }),
    },
  };
}

export function buildFeishuBotTextMessageRequest({
  apiBase = DEFAULT_FEISHU_API_BASE,
  tenantAccessToken,
  recipient,
  text,
  receiveIdType = 'user_id',
} = {}) {
  const url = new URL(`${trimTrailingSlash(apiBase)}/im/v1/messages`);
  url.searchParams.set('receive_id_type', receiveIdType);

  return {
    url: url.toString(),
    options: {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tenantAccessToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        receive_id: recipient,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      }),
    },
  };
}

export function buildFeishuBatchGetUserIdRequest({
  apiBase = DEFAULT_FEISHU_API_BASE,
  tenantAccessToken,
  emails = [],
  userIdType = 'user_id',
} = {}) {
  const url = new URL(`${trimTrailingSlash(apiBase)}/contact/v3/users/batch_get_id`);
  url.searchParams.set('user_id_type', userIdType);

  return {
    url: url.toString(),
    options: {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tenantAccessToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        emails,
      }),
    },
  };
}

export function buildFeishuUserInfoRequest({
  apiBase = DEFAULT_FEISHU_API_BASE,
  userAccessToken,
} = {}) {
  return {
    url: `${trimTrailingSlash(apiBase)}/authen/v1/user_info`,
    options: {
      method: 'GET',
      headers: {
        authorization: `Bearer ${userAccessToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
    },
  };
}

export function assertFeishuApiSuccess(payload, operationName = '飞书 API') {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`${operationName} 返回为空。`);
  }

  if (payload.code !== undefined && payload.code !== 0) {
    throw new Error(`${operationName} 调用失败：${payload.msg || payload.message || payload.code}`);
  }
}

export function extractTenantAccessToken(payload) {
  assertFeishuApiSuccess(payload, '获取 tenant_access_token');
  const token = payload.tenant_access_token || payload.data?.tenant_access_token;

  if (!hasValue(token)) {
    throw new Error('获取 tenant_access_token 失败：响应中没有 token。');
  }

  return token;
}

function pickSender(item) {
  if (item.head_from?.mail_address) {
    return { email: item.head_from.mail_address };
  }

  if (typeof item.from === 'string') {
    return { email: item.from };
  }

  if (item.from?.email) {
    return { email: item.from.email };
  }

  if (item.sender?.email) {
    return { email: item.sender.email };
  }

  return {
    email: item.from_email || item.sender_email || 'unknown@example.test',
  };
}

function pickReceivedAt(item) {
  return item.received_at
    || item.internal_date
    || item.create_time
    || item.send_time
    || item.date
    || '';
}

function pickBodyPreview(item) {
  return decodeFeishuBodyText(item.body_preview
    || item.body_plain_text
    || item.snippet
    || item.summary
    || item.plain_text
    || item.body?.content
    || '');
}

export function normalizeFeishuMessageItem(item = {}) {
  if (typeof item === 'string') {
    return {
      message_id: item,
      thread_id: `thread-${item}`,
      subject: '(无标题)',
      from: {
        email: 'unknown@example.test',
      },
      received_at: '',
      body_preview: '',
      labels: [],
      expected_thread_id: `thread-${item}`,
    };
  }

  const messageId = item.message_id || item.id;
  const threadId = item.thread_id || item.conversation_id || `thread-${messageId}`;

  return {
    message_id: messageId,
    thread_id: threadId,
    subject: item.subject || '(无标题)',
    from: pickSender(item),
    received_at: pickReceivedAt(item),
    body_preview: pickBodyPreview(item),
    body_text: pickBodyPreview(item),
    labels: Array.isArray(item.labels)
      ? item.labels
      : Array.isArray(item.label_ids) ? item.label_ids : [],
    expected_thread_id: item.expected_thread_id || threadId,
  };
}

export function normalizeFeishuMailListResponse(payload = {}) {
  assertFeishuApiSuccess(payload, '读取飞书邮箱邮件列表');

  const data = payload.data || payload;
  const items = data.items || data.messages || [];
  const messageIds = items
    .map((item) => (typeof item === 'string' ? item : item.message_id || item.id))
    .filter(hasValue);

  return {
    messages: items.map(normalizeFeishuMessageItem),
    messageIds,
    hasMore: Boolean(data.has_more),
    pageToken: data.page_token || data.next_page_token || '',
    rawCount: items.length,
  };
}

export function normalizeFeishuMailFolderListResponse(payload = {}) {
  assertFeishuApiSuccess(payload, '读取飞书邮箱文件夹列表');

  const data = payload.data || payload;
  const items = Array.isArray(data.items)
    ? data.items
    : Array.isArray(data.folders)
      ? data.folders
      : [];
  const folders = items.map((item = {}) => ({
    folder_id: item.folder_id || item.id || '',
    name: item.name || item.display_name || '',
    parent_folder_id: item.parent_folder_id || item.parent_id || '',
    unread_count: item.unread_count || 0,
  }));

  return {
    folders,
    hasMore: Boolean(data.has_more),
    pageToken: data.page_token || data.next_page_token || '',
  };
}

export function normalizeFeishuCreateMailFolderResponse(payload = {}) {
  assertFeishuApiSuccess(payload, '创建飞书邮箱文件夹');

  const data = payload.data?.folder || payload.data || payload.folder || payload;
  return {
    folder_id: data.folder_id || data.id || '',
    name: data.name || data.display_name || '',
    parent_folder_id: data.parent_folder_id || data.parent_id || '',
  };
}

export function normalizeFeishuBatchGetUserIdResponse(payload = {}) {
  assertFeishuApiSuccess(payload, '通过邮箱获取飞书用户 ID');

  const data = payload.data || payload;
  return Array.isArray(data.user_list) ? data.user_list : [];
}

export function normalizeFeishuUserInfoResponse(payload = {}) {
  assertFeishuApiSuccess(payload, '获取飞书授权用户信息');

  return payload.data || payload;
}

export function normalizeFeishuMessageDetailResponse(payload = {}) {
  assertFeishuApiSuccess(payload, '读取飞书邮箱邮件详情');

  const message = payload.data?.message || payload.message || payload.data || payload;
  return normalizeFeishuMessageItem(message);
}

export function buildFeishuServerConfig(env = process.env) {
  return {
    appId: readEnv(env, 'FEISHU_APP_ID'),
    appSecret: readEnv(env, 'FEISHU_APP_SECRET'),
    userMailboxId: readEnv(env, 'FEISHU_USER_MAILBOX_ID'),
    mailFolderId: readEnv(env, 'FEISHU_MAIL_FOLDER_ID') || DEFAULT_FEISHU_MAIL_FOLDER_ID,
    mailLabelId: readEnv(env, 'FEISHU_MAIL_LABEL_ID'),
    apiBase: readEnv(env, 'FEISHU_API_BASE') || DEFAULT_FEISHU_API_BASE,
  };
}
