export const EMAIL_AI_CONTROL_TABS = [
  { key: 'models', label: '模型接入' },
  { key: 'skills', label: 'Skills 编排' },
  { key: 'risk', label: '风险判定规则' },
  { key: 'spam', label: '垃圾邮件规则' },
  { key: 'knowledge', label: '回复话术知识库' },
  { key: 'prompts', label: '提示词配置' },
  { key: 'safety', label: '输出安全规则' },
  { key: 'versions', label: '策略与版本发布' },
  { key: 'test', label: '本地测试' },
];

const TABS = EMAIL_AI_CONTROL_TABS;

const COLLECTION_BY_TAB = {
  models: 'model-providers',
  skills: 'agent-skills',
  risk: 'risk-rules',
  spam: 'spam-rules',
  knowledge: 'knowledge-base',
  prompts: 'prompt-templates',
  safety: 'output-safety-rules',
};

const COLLECTION_KEY_BY_TAB = {
  models: 'modelProviders',
  skills: 'agentSkills',
  risk: 'riskRules',
  spam: 'spamRules',
  knowledge: 'knowledgeBase',
  prompts: 'promptTemplates',
  safety: 'outputSafetyRules',
};

function createControlState(defaultTab = 'models') {
  return {
    activeTab: defaultTab,
    token: localStorage.getItem('email-ai-admin-token') || '',
    store: null,
    versions: null,
    editing: null,
    providerTests: {},
    status: '',
    error: '',
    testOutput: null,
  };
}

let state = createControlState();
let mountOptions = {
  tabs: null,
  showTabs: true,
  showAuth: true,
  showHeader: true,
  apiUrl: null,
};
let authEl = null;
let tabEl = null;
let statusEl = null;
let contentEl = null;

function controlApiUrl(path) {
  return typeof mountOptions.apiUrl === 'function' ? mountOptions.apiUrl(path) : path;
}

function availableTabs() {
  const allowedTabs = Array.isArray(mountOptions.tabs) && mountOptions.tabs.length
    ? new Set(mountOptions.tabs)
    : null;
  const tabs = allowedTabs ? TABS.filter((tab) => allowedTabs.has(tab.key)) : TABS;
  return tabs.length ? tabs : TABS;
}

function ensureActiveTab() {
  const tabs = availableTabs();
  if (!tabs.some((tab) => tab.key === state.activeTab)) {
    state.activeTab = tabs[0].key;
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toCsv(value) {
  return Array.isArray(value) ? value.join(', ') : value || '';
}

function readCsv(value) {
  return String(value || '')
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function apiHeaders() {
  return {
    authorization: `Bearer ${state.token}`,
    'content-type': 'application/json',
  };
}

async function api(path, options = {}) {
  const response = await fetch(controlApiUrl(path), {
    ...options,
    headers: {
      ...apiHeaders(),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

function enabledPill(enabled) {
  return `<span class="pill ${enabled === false ? 'warn' : 'ok'}">${enabled === false ? '停用' : '启用'}</span>`;
}

function providerTestCell(providerId) {
  const result = state.providerTests[providerId];
  if (!result) return '<span class="muted-text">未检测</span>';
  if (result.loading) return '<span class="pill">检测中</span>';
  const ok = result.ok !== false;
  return `
    <div class="connection-result">
      <span class="pill ${ok ? 'ok' : 'warn'}">${ok ? '连接可用' : '需要处理'}</span>
      <span>${escapeHtml(result.message || (ok ? '检测完成。' : '连接检测失败。'))}</span>
    </div>
  `;
}

function renderAuth() {
  if (!authEl) return;
  authEl.hidden = mountOptions.showAuth === false;
  if (mountOptions.showAuth === false) return;

  authEl.innerHTML = `
    <form data-auth-form>
      <div class="field wide">
        <label for="admin-token">管理员 Token</label>
        <input id="admin-token" name="token" type="password" value="${escapeHtml(state.token)}" placeholder="EMAIL_AI_ADMIN_TOKEN" />
      </div>
      <button type="submit">连接控制中心</button>
      <button class="secondary" type="button" data-clear-token>清除</button>
    </form>
  `;

  authEl.querySelector('[data-auth-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.token = String(form.get('token') || '').trim();
    localStorage.setItem('email-ai-admin-token', state.token);
    loadControlCenter();
  });

  authEl.querySelector('[data-clear-token]').addEventListener('click', () => {
    state.token = '';
    localStorage.removeItem('email-ai-admin-token');
    state.store = null;
    state.versions = null;
    state.error = '';
    state.status = '管理员 Token 已清除。';
    render();
  });
}

function renderTabs() {
  if (!tabEl) return;

  ensureActiveTab();
  const tabs = availableTabs();
  tabEl.hidden = mountOptions.showTabs === false || tabs.length <= 1;
  tabEl.innerHTML = tabs.map((tab) => `
    <button type="button" class="${state.activeTab === tab.key ? 'active' : ''}" data-tab="${tab.key}">
      ${tab.label}
    </button>
  `).join('');

  tabEl.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeTab = button.dataset.tab;
      state.editing = null;
      state.error = '';
      render();
      if (state.activeTab === 'versions') loadVersions();
    });
  });
}

function renderStatus() {
  if (!statusEl) return;

  statusEl.className = `status-line${state.error ? ' error' : ''}`;
  statusEl.textContent = state.error || state.status || '邮件 AI 控制中心只管理 AI 配置、规则、知识库、提示词、安全规则、版本和本地测试。';
}

function table(headers, rows, emptyText = '暂无配置。') {
  if (!rows.length) return `<div class="empty">${emptyText}</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>
  `;
}

function renderModels() {
  const providers = state.store?.modelProviders || [];
  const riskProvider = providers.find((provider) => provider.enabled !== false && ['risk_check', 'both'].includes(provider.usageType));
  const replyProvider = providers.find((provider) => provider.enabled !== false && ['reply_generation', 'both'].includes(provider.usageType));
  const fallbackProvider = providers.find((provider) => provider.isFallback);
  const editing = state.editing?.collection === 'model-providers' ? state.editing.item : {};

  contentEl.innerHTML = `
    <div class="section-heading">
      <div>
        <h2>模型接入</h2>
        <p>只保存环境变量名称，不显示真实 API Key。</p>
      </div>
    </div>
    <div class="summary-grid">
      <div class="summary-item"><span>风险判定模型</span><strong>${escapeHtml(riskProvider?.name || '未设置')}</strong></div>
      <div class="summary-item"><span>回复生成模型</span><strong>${escapeHtml(replyProvider?.name || '未设置')}</strong></div>
      <div class="summary-item"><span>备用模型</span><strong>${escapeHtml(fallbackProvider?.name || 'Local Mock')}</strong></div>
      <div class="summary-item"><span>Mock 模式</span><strong>${providers.some((provider) => provider.providerKey === 'local_mock' && provider.enabled !== false) ? '可用' : '未启用'}</strong></div>
    </div>
    ${table(['服务商', 'provider key', '默认模型', '用途', 'API Key', '连接检测', '状态', '操作'], providers.map((provider) => `
      <tr>
        <td>${escapeHtml(provider.name)}</td>
        <td>${escapeHtml(provider.providerKey)}</td>
        <td>${escapeHtml(provider.defaultModel)}</td>
        <td>${escapeHtml(provider.usageType)}</td>
        <td>${provider.apiKeyEnvName ? (provider.apiKeyConfigured ? '<span class="pill ok">已配置</span>' : '<span class="pill warn">未配置</span>') : '<span class="pill ok">无需 Key</span>'}</td>
        <td>${providerTestCell(provider.id)}</td>
        <td>${enabledPill(provider.enabled)}</td>
        <td><div class="actions">
          <button class="secondary" data-edit="model-providers" data-id="${provider.id}">编辑</button>
          <button class="secondary" data-toggle="model-providers" data-id="${provider.id}">${provider.enabled === false ? '启用' : '停用'}</button>
          <button class="secondary" data-provider-test="${provider.id}" ${state.providerTests[provider.id]?.loading ? 'disabled' : ''}>${state.providerTests[provider.id]?.loading ? '检测中' : '测试连接'}</button>
          <button class="danger" data-delete="model-providers" data-id="${provider.id}">删除</button>
        </div></td>
      </tr>
    `))}
    <div class="panel-block">
      <h2>${editing.id ? '编辑模型服务商' : '新增模型服务商'}</h2>
      <form class="inline-form" data-collection-form="model-providers">
        <input type="hidden" name="id" value="${escapeHtml(editing.id || '')}" />
        ${field('服务商名称', 'name', editing.name)}
        ${field('provider key', 'providerKey', editing.providerKey)}
        ${field('base url', 'baseUrl', editing.baseUrl)}
        ${field('API Key 环境变量名称', 'apiKeyEnvName', editing.apiKeyEnvName)}
        ${field('API Key（可选，仅写入本机环境变量，不回显）', 'apiKeyValue', '', 'password', 'wide')}
        ${field('默认模型名称', 'defaultModel', editing.defaultModel)}
        ${field('可用模型列表', 'supportedModels', toCsv(editing.supportedModels))}
        ${selectField('用途', 'usageType', editing.usageType || 'test_only', [['risk_check', '风险判定'], ['reply_generation', '回复生成'], ['both', '两者'], ['fallback', '备用'], ['test_only', '测试']])}
        ${field('temperature', 'temperature', editing.temperature ?? 0.2, 'number')}
        ${field('max tokens', 'maxTokens', editing.maxTokens ?? 1200, 'number')}
        ${field('timeout ms', 'timeoutMs', editing.timeoutMs ?? 5000, 'number')}
        ${field('retry 次数', 'retryCount', editing.retryCount ?? 0, 'number')}
        ${checkboxField('启用', 'enabled', editing.enabled !== false)}
        ${checkboxField('备用模型', 'isFallback', editing.isFallback === true)}
        <button type="submit">${editing.id ? '保存模型' : '新增服务商'}</button>
        ${editing.id ? '<button class="secondary" type="button" data-cancel-edit>取消编辑</button>' : ''}
      </form>
    </div>
  `;
}

function field(label, name, value = '', type = 'text', extraClass = '') {
  return `
    <div class="field ${extraClass}">
      <label>${label}</label>
      <input name="${name}" type="${type}" value="${escapeHtml(value ?? '')}" />
    </div>
  `;
}

function textareaField(label, name, value = '') {
  return `
    <div class="field wide">
      <label>${label}</label>
      <textarea name="${name}">${escapeHtml(value ?? '')}</textarea>
    </div>
  `;
}

function checkboxField(label, name, checked) {
  return `
    <label class="field">
      <span>${label}</span>
      <select name="${name}">
        <option value="true" ${checked ? 'selected' : ''}>是</option>
        <option value="false" ${!checked ? 'selected' : ''}>否</option>
      </select>
    </label>
  `;
}

function selectField(label, name, value, options) {
  return `
    <div class="field">
      <label>${label}</label>
      <select name="${name}">
        ${options.map(([optionValue, text]) => `<option value="${optionValue}" ${value === optionValue ? 'selected' : ''}>${text}</option>`).join('')}
      </select>
    </div>
  `;
}

function collectionItems(tabKey) {
  return state.store?.[COLLECTION_KEY_BY_TAB[tabKey]] || [];
}

function renderSkills() {
  const items = [...collectionItems('skills')]
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const editing = state.editing?.collection === 'agent-skills' ? state.editing.item : {};
  const pipeline = state.store?.agentPipeline || {};
  const enabledItems = items.filter((item) => item.enabled !== false);
  const flowText = enabledItems.length
    ? enabledItems.map((item) => item.label || item.key).join(' -> ')
    : '暂无启用 Skills';

  contentEl.innerHTML = `
    <div class="section-heading">
      <div>
        <h2>Skills 编排</h2>
        <p>核心大脑按顺序调用启用的 skills；每个 skill 只负责一类明确能力。</p>
      </div>
    </div>
    <div class="summary-grid">
      <div class="summary-item"><span>Pipeline</span><strong>${pipeline.enabled === false ? '暂停' : '启用'}</strong></div>
      <div class="summary-item"><span>Trace</span><strong>${pipeline.traceEnabled === false ? '关闭' : '开启'}</strong></div>
      <div class="summary-item"><span>启用 Skills</span><strong>${enabledItems.length}</strong></div>
      <div class="summary-item"><span>失败策略</span><strong>${escapeHtml(pipeline.defaultFailurePolicy || 'fail_closed')}</strong></div>
    </div>
    <div class="operator-guide">
      <div class="operator-guide-heading">
        <strong>执行链路预览</strong>
        <small>${escapeHtml(flowText)}</small>
      </div>
      <div class="connection-flow-grid">
        ${enabledItems.map((item) => `
          <div>
            <span>${escapeHtml(item.key)}</span>
            <strong>${escapeHtml(item.label || item.key)}</strong>
            <small>${escapeHtml(item.description || item.notes || '按当前顺序执行。')}</small>
          </div>
        `).join('')}
      </div>
    </div>
    ${table(['顺序', 'Skill', 'key', '必需', '失败策略', '状态', '操作'], items.map((item) => `
      <tr>
        <td>${escapeHtml(item.order ?? '')}</td>
        <td>${escapeHtml(item.label || '')}</td>
        <td>${escapeHtml(item.key || '')}</td>
        <td>${item.required ? '是' : '否'}</td>
        <td>${escapeHtml(item.failurePolicy || 'fail_closed')}</td>
        <td>${enabledPill(item.enabled)}</td>
        <td>${rowActions('agent-skills', item)}</td>
      </tr>
    `), '暂无 Skills 配置。')}
    <div class="panel-block">
      <h2>${editing.id ? '编辑 Skill' : '新增 Skill'}</h2>
      <form class="inline-form" data-collection-form="agent-skills">
        <input type="hidden" name="id" value="${escapeHtml(editing.id || '')}" />
        ${field('Skill 名称', 'label', editing.label)}
        ${field('Skill key', 'key', editing.key)}
        ${textareaField('能力说明', 'description', editing.description)}
        ${field('执行顺序', 'order', editing.order ?? 100, 'number')}
        ${selectField('失败策略', 'failurePolicy', editing.failurePolicy || 'fail_closed', [['fail_closed', 'fail_closed'], ['skip_optional', 'skip_optional']])}
        ${checkboxField('必需', 'required', editing.required === true)}
        ${checkboxField('启用', 'enabled', editing.enabled !== false)}
        ${textareaField('备注', 'notes', editing.notes)}
        <button type="submit">${editing.id ? '保存 Skill' : '新增 Skill'}</button>
        ${editing.id ? '<button class="secondary" type="button" data-cancel-edit>取消编辑</button>' : ''}
      </form>
    </div>
  `;
}

function renderRiskRules() {
  const items = collectionItems('risk');
  const editing = state.editing?.collection === 'risk-rules' ? state.editing.item : {};
  contentEl.innerHTML = `
    <div class="section-heading"><div><h2>风险判定规则</h2><p>低、中、高风险规则只提供工作台决策建议。</p></div></div>
    ${table(['名称', '等级', '关键词', '建议动作', '优先级', '状态', '操作'], items.map((item) => `
      <tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.riskLevel)}</td><td>${escapeHtml(toCsv(item.keywords))}</td><td>${escapeHtml(item.suggestedAction)}</td><td>${escapeHtml(item.priority)}</td><td>${enabledPill(item.enabled)}</td><td>${rowActions('risk-rules', item)}</td></tr>
    `))}
    <div class="panel-block">
      <h2>${editing.id ? '编辑风险规则' : '新增风险规则'}</h2>
      <form class="inline-form" data-collection-form="risk-rules">
        <input type="hidden" name="id" value="${escapeHtml(editing.id || '')}" />
        ${field('规则名称', 'name', editing.name)}
        ${selectField('风险等级', 'riskLevel', editing.riskLevel || 'low', [['low', '低风险'], ['medium', '中风险'], ['high', '高风险']])}
        ${field('关键词', 'keywords', toCsv(editing.keywords), 'text', 'wide')}
        ${textareaField('语义描述', 'semanticDescription', editing.semanticDescription)}
        ${field('命中条件', 'conditionType', editing.conditionType || 'keyword_or_semantic')}
        ${field('优先级', 'priority', editing.priority ?? 0, 'number')}
        ${selectField('建议动作', 'suggestedAction', editing.suggestedAction || 'draft_only', [['draft_only', 'draft_only'], ['human_review', 'human_review'], ['block_auto_reply', 'block_auto_reply'], ['internal_note_only', 'internal_note_only']])}
        ${checkboxField('启用', 'enabled', editing.enabled !== false)}
        ${textareaField('备注', 'notes', editing.notes)}
        <button type="submit">${editing.id ? '保存规则' : '新增规则'}</button>
        ${editing.id ? '<button class="secondary" type="button" data-cancel-edit>取消编辑</button>' : ''}
      </form>
    </div>
  `;
}

function renderSpamRules() {
  const items = collectionItems('spam');
  const editing = state.editing?.collection === 'spam-rules' ? state.editing.item : {};
  contentEl.innerHTML = `
    <div class="section-heading"><div><h2>垃圾邮件规则</h2><p>只返回垃圾邮件判定结果，由工作台决定归类或忽略。</p></div></div>
    ${table(['名称', '类型', '关键词', '域名', '建议动作', '状态', '操作'], items.map((item) => `
      <tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.ruleType)}</td><td>${escapeHtml(toCsv(item.keywords))}</td><td>${escapeHtml(toCsv(item.senderDomains))}</td><td>${escapeHtml(item.suggestedAction)}</td><td>${enabledPill(item.enabled)}</td><td>${rowActions('spam-rules', item)}</td></tr>
    `))}
    <div class="panel-block">
      <h2>${editing.id ? '编辑垃圾规则' : '新增垃圾规则'}</h2>
      <form class="inline-form" data-collection-form="spam-rules">
        <input type="hidden" name="id" value="${escapeHtml(editing.id || '')}" />
        ${field('规则名称', 'name', editing.name)}
        ${field('规则类型', 'ruleType', editing.ruleType || 'keyword')}
        ${field('关键词', 'keywords', toCsv(editing.keywords), 'text', 'wide')}
        ${field('发件人邮箱', 'senderEmails', toCsv(editing.senderEmails))}
        ${field('发件人域名', 'senderDomains', toCsv(editing.senderDomains))}
        ${field('链接特征', 'urlPatterns', toCsv(editing.urlPatterns), 'text', 'wide')}
        ${field('优先级', 'priority', editing.priority ?? 0, 'number')}
        ${selectField('建议动作', 'suggestedAction', editing.suggestedAction || 'ignore_spam', [['ignore_spam', 'ignore_spam'], ['mark_spam', 'mark_spam'], ['human_review', 'human_review'], ['block_auto_reply', 'block_auto_reply']])}
        ${checkboxField('启用', 'enabled', editing.enabled !== false)}
        ${textareaField('备注', 'notes', editing.notes)}
        <button type="submit">${editing.id ? '保存规则' : '新增规则'}</button>
        ${editing.id ? '<button class="secondary" type="button" data-cancel-edit>取消编辑</button>' : ''}
      </form>
    </div>
  `;
}

function renderKnowledge() {
  const items = collectionItems('knowledge');
  const editing = state.editing?.collection === 'knowledge-base' ? state.editing.item : {};
  contentEl.innerHTML = `
    <div class="section-heading"><div><h2>回复话术知识库</h2><p>AI 生成回复时优先参考知识库；高风险条目只用于内部建议。</p></div></div>
    ${table(['标题', '分类', '风险', '关键词', '人工审核', '状态', '操作'], items.map((item) => `
      <tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(toCsv(item.applicableRiskLevels))}</td><td>${escapeHtml(toCsv(item.keywords))}</td><td>${item.requireHumanReview ? '是' : '否'}</td><td>${enabledPill(item.enabled)}</td><td>${rowActions('knowledge-base', item)}</td></tr>
    `))}
    <div class="panel-block">
      <h2>${editing.id ? '编辑知识库' : '新增知识库'}</h2>
      <form class="inline-form" data-collection-form="knowledge-base">
        <input type="hidden" name="id" value="${escapeHtml(editing.id || '')}" />
        ${field('标题', 'title', editing.title)}
        ${field('分类', 'category', editing.category || '自定义分类')}
        ${field('适用风险等级', 'applicableRiskLevels', toCsv(editing.applicableRiskLevels))}
        ${field('适用关键词', 'keywords', toCsv(editing.keywords), 'text', 'wide')}
        ${textareaField('客户问题场景', 'customerScenario', editing.customerScenario)}
        ${textareaField('标准回复话术', 'standardReply', editing.standardReply)}
        ${field('禁止表达', 'forbiddenExpressions', toCsv(editing.forbiddenExpressions), 'text', 'wide')}
        ${field('推荐语气', 'recommendedTone', editing.recommendedTone || 'polite')}
        ${field('优先级', 'priority', editing.priority ?? 0, 'number')}
        ${checkboxField('允许用于自动回复', 'allowForAutoReply', editing.allowForAutoReply === true)}
        ${checkboxField('必须人工审核', 'requireHumanReview', editing.requireHumanReview === true)}
        ${checkboxField('启用', 'enabled', editing.enabled !== false)}
        ${textareaField('备注', 'notes', editing.notes)}
        <button type="submit">${editing.id ? '保存知识库' : '新增知识库'}</button>
        ${editing.id ? '<button class="secondary" type="button" data-cancel-edit>取消编辑</button>' : ''}
      </form>
    </div>
  `;
}

function renderPrompts() {
  const items = collectionItems('prompts');
  const editing = state.editing?.collection === 'prompt-templates' ? state.editing.item : {};
  contentEl.innerHTML = `
    <div class="section-heading"><div><h2>提示词配置</h2><p>维护风险判定、回复生成和输出格式相关提示词。</p></div></div>
    ${table(['名称', '类型', '版本', '状态', '备注', '操作'], items.map((item) => `
      <tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.promptType)}</td><td>${escapeHtml(item.version)}</td><td>${enabledPill(item.enabled)}</td><td>${escapeHtml(item.notes)}</td><td>${rowActions('prompt-templates', item)}</td></tr>
    `))}
    <div class="panel-block">
      <h2>${editing.id ? '编辑提示词' : '新增提示词'}</h2>
      <form class="inline-form" data-collection-form="prompt-templates">
        <input type="hidden" name="id" value="${escapeHtml(editing.id || '')}" />
        ${field('名称', 'name', editing.name)}
        ${selectField('提示词类型', 'promptType', editing.promptType || 'reply_generation', [['spam_check', 'spam_check'], ['risk_check', 'risk_check'], ['reply_generation', 'reply_generation'], ['output_safety_check', 'output_safety_check']])}
        ${textareaField('系统提示词', 'systemPrompt', editing.systemPrompt)}
        ${textareaField('任务提示词', 'taskPrompt', editing.taskPrompt)}
        ${textareaField('输出格式 JSON', 'outputFormatText', JSON.stringify(editing.outputFormat || {}, null, 2))}
        ${checkboxField('启用', 'enabled', editing.enabled !== false)}
        ${textareaField('备注', 'notes', editing.notes)}
        <button type="submit">${editing.id ? '保存提示词' : '新增提示词'}</button>
        ${editing.id ? '<button class="secondary" type="button" data-cancel-edit>取消编辑</button>' : ''}
      </form>
    </div>
  `;
}

function renderSafety() {
  const items = collectionItems('safety');
  const editing = state.editing?.collection === 'output-safety-rules' ? state.editing.item : {};
  contentEl.innerHTML = `
    <div class="section-heading"><div><h2>输出安全规则</h2><p>对 AI 输出做二次检查，防止承诺退款、赔偿、补发或编造信息。</p></div></div>
    ${table(['名称', '关键词', '风险级别', '触发动作', '状态', '操作'], items.map((item) => `
      <tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(toCsv(item.keywords))}</td><td>${escapeHtml(item.riskLevel)}</td><td>${escapeHtml(item.triggerAction)}</td><td>${enabledPill(item.enabled)}</td><td>${rowActions('output-safety-rules', item)}</td></tr>
    `))}
    <div class="panel-block">
      <h2>${editing.id ? '编辑安全规则' : '新增安全规则'}</h2>
      <form class="inline-form" data-collection-form="output-safety-rules">
        <input type="hidden" name="id" value="${escapeHtml(editing.id || '')}" />
        ${field('规则名称', 'name', editing.name)}
        ${field('关键词', 'keywords', toCsv(editing.keywords), 'text', 'wide')}
        ${textareaField('语义描述', 'semanticDescription', editing.semanticDescription)}
        ${selectField('风险级别', 'riskLevel', editing.riskLevel || 'medium', [['medium', 'medium'], ['high', 'high']])}
        ${selectField('触发动作', 'triggerAction', editing.triggerAction || 'human_review', [['human_review', 'human_review'], ['block_auto_reply', 'block_auto_reply'], ['internal_note_only', 'internal_note_only']])}
        ${checkboxField('启用', 'enabled', editing.enabled !== false)}
        ${textareaField('备注', 'notes', editing.notes)}
        <button type="submit">${editing.id ? '保存安全规则' : '新增安全规则'}</button>
        ${editing.id ? '<button class="secondary" type="button" data-cancel-edit>取消编辑</button>' : ''}
      </form>
    </div>
  `;
}

function rowActions(collection, item) {
  return `
    <div class="actions">
      <button class="secondary" data-edit="${collection}" data-id="${item.id}">编辑</button>
      <button class="secondary" data-toggle="${collection}" data-id="${item.id}">${item.enabled === false ? '启用' : '停用'}</button>
      <button class="danger" data-delete="${collection}" data-id="${item.id}">删除</button>
    </div>
  `;
}

function renderFrontendConnectionGuide() {
  const published = state.versions?.published;
  const publishedText = published
    ? `${published.versionName || '未命名版本'} / ${published.publishedAt || '未记录发布时间'}`
    : '暂无已发布版本';
  const lowRiskStrategyText = published?.strategyConfigSnapshot?.lowRiskDefaultAction === 'auto_send_allowed'
    ? '低风险允许自动发送'
    : '低风险只生成草稿';

  return `
    <div class="operator-guide">
      <div class="operator-guide-heading">
        <strong>前台工作台如何接入这里的配置</strong>
        <small>管理员只需要完成“测试通过并发布版本”；邮件工作台会自动读取当前 published 版本，不需要在每封邮件里选择模型。</small>
      </div>
      <div class="connection-flow-grid">
        <div>
          <span>第一步</span>
          <strong>配置 AI 能力</strong>
          <small>在模型、风险规则、垃圾规则、知识库、提示词和安全规则中维护配置。</small>
        </div>
        <div>
          <span>第二步</span>
          <strong>本地测试通过</strong>
          <small>用“本地测试”确认普通咨询、催物流、退款投诉和垃圾邮件都能正确返回。</small>
        </div>
        <div>
          <span>第三步</span>
          <strong>发布版本</strong>
          <small>点击发布后，当前版本会成为唯一 published 配置。</small>
        </div>
        <div>
          <span>第四步</span>
          <strong>前台只读体现</strong>
          <small>前台设置栏的“AI 调用状态”会显示当前模型和版本，但不允许编辑。</small>
        </div>
      </div>
      <div class="published-guide-status">
        <span>当前给前台读取的版本</span>
        <strong>${escapeHtml(publishedText)}</strong>
        <small>${escapeHtml(lowRiskStrategyText)}</small>
      </div>
    </div>
  `;
}

function renderVersions() {
  const versions = state.versions?.versions || [];
  contentEl.innerHTML = `
    <div class="section-heading">
      <div><h2>策略与版本发布</h2><p>邮件工作台只读取当前 published 版本；发布前必须通过本地测试。</p></div>
    </div>
    ${renderFrontendConnectionGuide()}
    <form class="inline-form" data-create-version-form>
      ${field('版本名称', 'versionName', `Email AI ${new Date().toISOString().slice(0, 10)}`)}
      ${field('版本说明', 'publishNote', '')}
      <button type="submit">创建草稿版本</button>
    </form>
    ${table(['版本', '状态', '发布时间', '说明', '操作'], versions.map((version) => `
      <tr>
        <td>${escapeHtml(version.versionName)}</td>
        <td>${escapeHtml(version.status)}</td>
        <td>${escapeHtml(version.publishedAt || '未发布')}</td>
        <td>${escapeHtml(version.publishNote || '')}</td>
        <td><div class="actions">
          ${version.status !== 'published' ? `<button class="secondary" data-publish-version="${version.id}">发布</button>` : ''}
          <button class="secondary" data-rollback-version="${version.id}">回滚到此版本</button>
        </div></td>
      </tr>
    `))}
  `;
}

function renderTest() {
  contentEl.innerHTML = `
    <div class="section-heading"><div><h2>本地测试</h2><p>只用于测试配置有效性，不展示真实业务邮件数据。</p></div></div>
    <form class="inline-form" data-test-form>
      ${field('测试发件人', 'senderEmail', 'test@example.test')}
      ${field('测试邮件标题', 'subject', 'Where is my order?')}
      ${textareaField('测试邮件正文', 'body', 'I want to know when my order will arrive.')}
      ${selectField('版本来源', 'versionSource', 'published', [['published', '当前发布版本'], ['draft', '当前草稿版本']])}
      ${checkboxField('使用 mock 模型', 'useMock', true)}
      <button name="mode" value="spam" type="submit">测试垃圾邮件规则</button>
      <button name="mode" value="risk" type="submit">测试风险等级规则</button>
      <button name="mode" value="knowledge" type="submit">测试知识库匹配</button>
      <button name="mode" value="full" type="submit">测试完整 AI 流程</button>
    </form>
    ${state.testOutput ? `<pre class="test-output">${escapeHtml(JSON.stringify(state.testOutput, null, 2))}</pre>` : ''}
  `;
}

function renderContent() {
  if (!contentEl) return;

  ensureActiveTab();

  if (!state.store) {
    contentEl.innerHTML = '<div class="empty">请输入管理员 Token 并连接控制中心。</div>';
    return;
  }

  if (state.activeTab === 'models') renderModels();
  if (state.activeTab === 'skills') renderSkills();
  if (state.activeTab === 'risk') renderRiskRules();
  if (state.activeTab === 'spam') renderSpamRules();
  if (state.activeTab === 'knowledge') renderKnowledge();
  if (state.activeTab === 'prompts') renderPrompts();
  if (state.activeTab === 'safety') renderSafety();
  if (state.activeTab === 'versions') renderVersions();
  if (state.activeTab === 'test') renderTest();

  bindContentEvents();
}

function bindContentEvents() {
  contentEl.querySelectorAll('[data-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const collection = button.dataset.edit;
      const item = findItem(collection, button.dataset.id);
      state.editing = { collection, item };
      render();
    });
  });

  contentEl.querySelectorAll('[data-toggle]').forEach((button) => {
    button.addEventListener('click', async () => {
      const collection = button.dataset.toggle;
      const item = findItem(collection, button.dataset.id);
      await saveCollectionItem(collection, { ...item, enabled: item.enabled === false });
    });
  });

  contentEl.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      await deleteCollectionItem(button.dataset.delete, button.dataset.id);
    });
  });

  contentEl.querySelectorAll('[data-collection-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveCollectionItem(form.dataset.collectionForm, formPayload(form));
    });
  });

  contentEl.querySelector('[data-cancel-edit]')?.addEventListener('click', () => {
    state.editing = null;
    render();
  });

  contentEl.querySelectorAll('[data-provider-test]').forEach((button) => {
    button.addEventListener('click', async () => {
      const providerId = button.dataset.providerTest;
      state.providerTests[providerId] = {
        loading: true,
        message: '模型连接检测中...',
      };
      state.status = '模型连接检测中...';
      state.error = '';
      render();
      try {
        const payload = await api(`/api/admin/email-ai-control/model-providers/${providerId}/test`, { method: 'POST', body: '{}' });
        const ok = payload.result?.ok !== false;
        state.providerTests[providerId] = {
          loading: false,
          ok,
          message: payload.result?.message || (ok ? '连接检测完成。' : '连接检测失败。'),
          checkedAt: payload.result?.checkedAt || new Date().toISOString(),
        };
        state.status = state.providerTests[providerId].message;
        state.error = '';
      } catch (error) {
        state.providerTests[providerId] = {
          loading: false,
          ok: false,
          message: `连接检测失败：${error.message}`,
        };
        state.error = state.providerTests[providerId].message;
      }
      render();
    });
  });

  contentEl.querySelector('[data-create-version-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api('/api/admin/email-ai-control/versions/create-draft', {
      method: 'POST',
      body: JSON.stringify({
        versionName: form.get('versionName'),
        publishNote: form.get('publishNote'),
      }),
    });
    state.status = '草稿版本已创建。';
    await loadVersions();
  });

  contentEl.querySelectorAll('[data-publish-version]').forEach((button) => {
    button.addEventListener('click', async () => {
      await api(`/api/admin/email-ai-control/versions/${button.dataset.publishVersion}/publish`, { method: 'POST', body: '{}' });
      state.status = '版本已发布。';
      await loadVersions();
    });
  });

  contentEl.querySelectorAll('[data-rollback-version]').forEach((button) => {
    button.addEventListener('click', async () => {
      await api(`/api/admin/email-ai-control/versions/${button.dataset.rollbackVersion}/rollback`, { method: 'POST', body: '{}' });
      state.status = '已回滚到指定版本。';
      await loadVersions();
    });
  });

  contentEl.querySelector('[data-test-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    const payload = formPayload(event.currentTarget);
    payload.mode = submitter?.value || 'full';
    const result = await api('/api/admin/email-ai-control/test', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    state.testOutput = result;
    state.status = '本地测试已完成。';
    state.error = '';
    await loadControlCenter({ silent: true });
    if (state.activeTab === 'test') render();
  });
}

function findItem(collection, id) {
  const tabKey = Object.keys(COLLECTION_BY_TAB).find((key) => COLLECTION_BY_TAB[key] === collection);
  const items = state.store?.[COLLECTION_KEY_BY_TAB[tabKey]] || [];
  return items.find((item) => item.id === id) || {};
}

function formPayload(form) {
  const formData = new FormData(form);
  const payload = {};
  formData.forEach((value, key) => {
    if (key === 'id' && !value) return;
    if (['keywords', 'supportedModels', 'senderEmails', 'senderDomains', 'urlPatterns', 'applicableRiskLevels', 'forbiddenExpressions'].includes(key)) {
      payload[key] = readCsv(value);
    } else if (['enabled', 'isFallback', 'allowForAutoReply', 'requireHumanReview', 'useMock', 'required'].includes(key)) {
      payload[key] = value === 'true';
    } else if (['temperature', 'maxTokens', 'timeoutMs', 'retryCount', 'priority', 'order'].includes(key)) {
      payload[key] = Number(value);
    } else if (key === 'outputFormatText') {
      try {
        payload.outputFormat = JSON.parse(value || '{}');
      } catch {
        payload.outputFormat = {};
      }
    } else {
      payload[key] = value;
    }
  });
  return payload;
}

async function saveCollectionItem(collection, payload) {
  const id = payload.id || '';
  const method = id ? 'PUT' : 'POST';
  const path = id
    ? `/api/admin/email-ai-control/${collection}/${id}`
    : `/api/admin/email-ai-control/${collection}`;
  const result = await api(path, {
    method,
    body: JSON.stringify(payload),
  });
  state.editing = null;
  state.status = result.secretSaved
    ? '配置已保存，API Key 已写入本机 .env.local，前端不会回显密钥。'
    : (id ? '配置已保存。' : '配置已新增。');
  await loadControlCenter({ silent: true });
}

async function deleteCollectionItem(collection, id) {
  await api(`/api/admin/email-ai-control/${collection}/${id}`, {
    method: 'DELETE',
    body: '{}',
  });
  state.status = '配置已删除。';
  await loadControlCenter({ silent: true });
}

async function loadControlCenter({ silent = false } = {}) {
  if (!state.token) {
    render();
    return;
  }
  try {
    const payload = await api('/api/admin/email-ai-control');
    state.store = payload.store;
    state.error = '';
    if (!silent) state.status = '已连接邮件 AI 控制中心。';
    render();
    if (state.activeTab === 'versions') loadVersions();
  } catch (error) {
    state.error = error.message;
    state.store = null;
    render();
  }
}

async function loadVersions() {
  if (!state.token) return;
  try {
    state.versions = await api('/api/admin/email-ai-control/versions');
    state.error = '';
    render();
  } catch (error) {
    state.error = error.message;
    render();
  }
}

function render() {
  renderAuth();
  renderTabs();
  renderStatus();
  renderContent();
}

function ensureShell(root, options = {}) {
  root.classList.add('ai-control-shell');
  root.classList.toggle('ai-control-embedded', options.embedded !== false);

  if (root.querySelector('[data-auth-panel]')
    && root.querySelector('[data-tab-bar]')
    && root.querySelector('[data-status-line]')
    && root.querySelector('[data-tab-content]')) {
    return;
  }

  root.innerHTML = `
    ${options.showHeader === false ? '' : `
      <header class="ai-control-header">
        <div>
          <p>${escapeHtml(options.kicker || '管理员配置模块')}</p>
          <h1>${escapeHtml(options.title || '邮件 AI 控制中心')}</h1>
        </div>
      </header>
    `}
    <section class="auth-panel" data-auth-panel></section>
    <nav class="tab-bar" data-tab-bar aria-label="邮件 AI 控制中心标签页"></nav>
    <section class="status-line" data-status-line></section>
    <section class="tab-content" data-tab-content></section>
  `;
}

export function mountEmailAIControl(root, options = {}) {
  const target = typeof root === 'string' ? document.querySelector(root) : root;
  if (!target) return null;

  const tabs = Array.isArray(options.tabs) && options.tabs.length
    ? options.tabs
    : TABS.map((tab) => tab.key);
  const defaultTab = tabs.includes(options.defaultTab) ? options.defaultTab : tabs[0] || 'models';

  mountOptions = {
    tabs,
    showTabs: options.showTabs,
    showAuth: options.showAuth,
    showHeader: options.showHeader,
    apiUrl: options.apiUrl || null,
  };
  state = createControlState(defaultTab);
  ensureShell(target, options);

  authEl = target.querySelector('[data-auth-panel]');
  tabEl = target.querySelector('[data-tab-bar]');
  statusEl = target.querySelector('[data-status-line]');
  contentEl = target.querySelector('[data-tab-content]');

  render();
  loadControlCenter({ silent: true });

  return {
    openTab(tabKey) {
      if (tabs.includes(tabKey)) {
        state.activeTab = tabKey;
        state.editing = null;
        render();
        if (tabKey === 'versions') loadVersions();
      }
    },
    reload() {
      return loadControlCenter({ silent: true });
    },
  };
}

const defaultRoot = document.querySelector('[data-email-ai-control-root]');
if (defaultRoot) {
  mountEmailAIControl(defaultRoot, { embedded: false });
}
