const SECRET_KEY_PATTERNS = [
  /secret/i,
  /token/i,
  /password/i,
  /passwd/i,
  /private[_-]?key/i,
];

export const API_CONFIG_FIELDS = [
  {
    key: 'appId',
    label: '飞书应用 App ID',
    required: true,
    secret: false,
    placeholder: '只记录应用 ID，不记录 App Secret',
  },
  {
    key: 'mailboxAddress',
    label: '测试邮箱地址',
    required: true,
    secret: false,
    placeholder: 'service@example.test',
  },
  {
    key: 'callbackUrl',
    label: '回调地址',
    required: false,
    secret: false,
    placeholder: 'https://example.test/feishu/mail/callback',
  },
  {
    key: 'environment',
    label: '接入环境',
    required: true,
    secret: false,
    placeholder: 'sandbox / production',
  },
];

export const PERMISSION_REQUIREMENTS = [
  {
    key: 'mailRead',
    label: '读取邮件',
    level: 'required_for_read',
    description: '用于读取邮件列表、正文摘要和线程信息。',
  },
  {
    key: 'mailDraft',
    label: '保存草稿',
    level: 'required_for_draft',
    description: '用于把审核后的内容保存为草稿，不直接发送。',
  },
  {
    key: 'mailSend',
    label: '真实发送',
    level: 'restricted',
    description: '接 API 初期保持关闭，低风险验证稳定后再单独评估。',
  },
  {
    key: 'mailboxManage',
    label: '邮箱管理',
    level: 'restricted',
    description: '不作为第一阶段能力，避免超出自动回复范围。',
  },
];

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function isSecretKey(key) {
  return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function validateApiConfigDraft(config = {}) {
  return Object.keys(config)
    .filter(isSecretKey)
    .map((key) => `禁止在工作台保存敏感字段：${key}。`);
}

export function buildApiReadiness({ config = {}, permissions = {} } = {}) {
  const secretIssues = validateApiConfigDraft(config);
  const configChecks = API_CONFIG_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    required: field.required,
    ok: !field.required || hasValue(config[field.key]),
    detail: field.required && !hasValue(config[field.key])
      ? `缺少${field.label}。`
      : field.placeholder,
  }));

  const permissionChecks = PERMISSION_REQUIREMENTS.map((permission) => ({
    ...permission,
    ok: permissions[permission.key] === true,
  }));

  const hasRequiredConfig = configChecks
    .filter((check) => check.required)
    .every((check) => check.ok);
  const readReady = ['mailRead', 'mailDraft'].every((key) => permissions[key] === true);
  const restrictedPermissionOpen = ['mailSend', 'mailboxManage'].some((key) => permissions[key] === true);

  return {
    configChecks,
    permissionChecks,
    secretIssues,
    readyForReadSimulation: hasRequiredConfig && readReady && secretIssues.length === 0,
    readyForRealSend: false,
    restrictedPermissionOpen,
  };
}
