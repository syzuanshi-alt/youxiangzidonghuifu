import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import {
  createDefaultEmailAIStore,
  createEmailAIConfigSnapshot,
} from './default-config.js';
import {
  EMAIL_AI_COLLECTIONS,
  normalizeArray,
  normalizeBoolean,
  normalizeIdPrefix,
  normalizeInteger,
  normalizeNumber,
  nowIso,
  withoutSensitiveProviderFields,
} from './types.js';

const DEFAULT_STORE_PATH = 'data/email-ai-control-store.json';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureStoreShape(store) {
  const defaults = createDefaultEmailAIStore();
  return {
    ...defaults,
    ...store,
    modelProviders: Array.isArray(store?.modelProviders) ? store.modelProviders : defaults.modelProviders,
    riskRules: Array.isArray(store?.riskRules) ? store.riskRules : defaults.riskRules,
    spamRules: Array.isArray(store?.spamRules) ? store.spamRules : defaults.spamRules,
    knowledgeBase: Array.isArray(store?.knowledgeBase) ? store.knowledgeBase : defaults.knowledgeBase,
    promptTemplates: Array.isArray(store?.promptTemplates) ? store.promptTemplates : defaults.promptTemplates,
    outputSafetyRules: Array.isArray(store?.outputSafetyRules) ? store.outputSafetyRules : defaults.outputSafetyRules,
    agentSkills: Array.isArray(store?.agentSkills) ? store.agentSkills : defaults.agentSkills,
    agentPipeline: {
      ...defaults.agentPipeline,
      ...(store?.agentPipeline || {}),
    },
    strategyConfig: {
      ...defaults.strategyConfig,
      ...(store?.strategyConfig || {}),
    },
    configVersions: Array.isArray(store?.configVersions) ? store.configVersions : defaults.configVersions,
    testRuns: Array.isArray(store?.testRuns) ? store.testRuns : defaults.testRuns,
  };
}

function collectionKeyFromName(collectionName) {
  const key = EMAIL_AI_COLLECTIONS[collectionName] || collectionName;
  if (!Object.values(EMAIL_AI_COLLECTIONS).includes(key)) {
    const error = new Error(`未知 AI 控制中心配置集合：${collectionName}`);
    error.statusCode = 404;
    error.errorCode = 'email_ai_collection_not_found';
    throw error;
  }
  return key;
}

function normalizeProvider(input = {}, existing = {}) {
  const timestamp = nowIso();
  const providerKey = input.providerKey || input.provider_key || existing.providerKey || '';
  const supportedModels = normalizeArray(input.supportedModels ?? input.supported_models ?? existing.supportedModels);
  return {
    ...existing,
    id: input.id || existing.id || `provider-${normalizeIdPrefix(providerKey || input.name)}-${randomUUID().slice(0, 8)}`,
    name: input.name ?? existing.name ?? '',
    providerKey,
    baseUrl: input.baseUrl ?? input.base_url ?? existing.baseUrl ?? '',
    apiKeyEnvName: input.apiKeyEnvName ?? input.api_key_env_name ?? existing.apiKeyEnvName ?? '',
    defaultModel: input.defaultModel ?? input.default_model ?? existing.defaultModel ?? '',
    supportedModels,
    enabled: normalizeBoolean(input.enabled, existing.enabled ?? true),
    usageType: input.usageType ?? input.usage_type ?? existing.usageType ?? 'test_only',
    isFallback: normalizeBoolean(input.isFallback ?? input.is_fallback, existing.isFallback ?? false),
    temperature: normalizeNumber(input.temperature, existing.temperature ?? 0.2),
    maxTokens: normalizeInteger(input.maxTokens ?? input.max_tokens, existing.maxTokens ?? 1200),
    timeoutMs: normalizeInteger(input.timeoutMs ?? input.timeout_ms, existing.timeoutMs ?? 5000),
    retryCount: normalizeInteger(input.retryCount ?? input.retry_count, existing.retryCount ?? 0),
    createdAt: existing.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

function normalizeRiskRule(input = {}, existing = {}) {
  const timestamp = nowIso();
  return {
    ...existing,
    id: input.id || existing.id || `risk-${normalizeIdPrefix(input.name)}-${randomUUID().slice(0, 8)}`,
    name: input.name ?? existing.name ?? '',
    riskLevel: input.riskLevel ?? input.risk_level ?? existing.riskLevel ?? 'low',
    keywords: normalizeArray(input.keywords ?? existing.keywords),
    semanticDescription: input.semanticDescription ?? input.semantic_description ?? existing.semanticDescription ?? '',
    conditionType: input.conditionType ?? input.condition_type ?? existing.conditionType ?? 'keyword_or_semantic',
    priority: normalizeInteger(input.priority, existing.priority ?? 0),
    suggestedAction: input.suggestedAction ?? input.suggested_action ?? existing.suggestedAction ?? 'draft_only',
    enabled: normalizeBoolean(input.enabled, existing.enabled ?? true),
    version: normalizeInteger(input.version, existing.version ?? 1),
    notes: input.notes ?? existing.notes ?? '',
    createdAt: existing.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

function normalizeSpamRule(input = {}, existing = {}) {
  const timestamp = nowIso();
  return {
    ...existing,
    id: input.id || existing.id || `spam-${normalizeIdPrefix(input.name)}-${randomUUID().slice(0, 8)}`,
    name: input.name ?? existing.name ?? '',
    ruleType: input.ruleType ?? input.rule_type ?? existing.ruleType ?? 'keyword',
    keywords: normalizeArray(input.keywords ?? existing.keywords),
    senderEmails: normalizeArray(input.senderEmails ?? input.sender_emails ?? existing.senderEmails),
    senderDomains: normalizeArray(input.senderDomains ?? input.sender_domains ?? existing.senderDomains),
    urlPatterns: normalizeArray(input.urlPatterns ?? input.url_patterns ?? existing.urlPatterns),
    priority: normalizeInteger(input.priority, existing.priority ?? 0),
    suggestedAction: input.suggestedAction ?? input.suggested_action ?? existing.suggestedAction ?? 'ignore_spam',
    enabled: normalizeBoolean(input.enabled, existing.enabled ?? true),
    version: normalizeInteger(input.version, existing.version ?? 1),
    notes: input.notes ?? existing.notes ?? '',
    createdAt: existing.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

function normalizeKnowledgeBaseItem(input = {}, existing = {}) {
  const timestamp = nowIso();
  return {
    ...existing,
    id: input.id || existing.id || `kb-${normalizeIdPrefix(input.title)}-${randomUUID().slice(0, 8)}`,
    title: input.title ?? existing.title ?? '',
    category: input.category ?? existing.category ?? '自定义分类',
    applicableRiskLevels: normalizeArray(input.applicableRiskLevels ?? input.applicable_risk_levels ?? existing.applicableRiskLevels),
    keywords: normalizeArray(input.keywords ?? existing.keywords),
    customerScenario: input.customerScenario ?? input.customer_scenario ?? existing.customerScenario ?? '',
    standardReply: input.standardReply ?? input.standard_reply ?? existing.standardReply ?? '',
    forbiddenExpressions: normalizeArray(input.forbiddenExpressions ?? input.forbidden_expressions ?? existing.forbiddenExpressions),
    recommendedTone: input.recommendedTone ?? input.recommended_tone ?? existing.recommendedTone ?? 'polite',
    allowForAutoReply: normalizeBoolean(input.allowForAutoReply ?? input.allow_for_auto_reply, existing.allowForAutoReply ?? false),
    requireHumanReview: normalizeBoolean(input.requireHumanReview ?? input.require_human_review, existing.requireHumanReview ?? false),
    priority: normalizeInteger(input.priority, existing.priority ?? 0),
    enabled: normalizeBoolean(input.enabled, existing.enabled ?? true),
    version: normalizeInteger(input.version, existing.version ?? 1),
    notes: input.notes ?? existing.notes ?? '',
    createdAt: existing.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

function normalizePromptTemplate(input = {}, existing = {}) {
  const timestamp = nowIso();
  return {
    ...existing,
    id: input.id || existing.id || `prompt-${normalizeIdPrefix(input.name)}-${randomUUID().slice(0, 8)}`,
    name: input.name ?? existing.name ?? '',
    promptType: input.promptType ?? input.prompt_type ?? existing.promptType ?? 'reply_generation',
    systemPrompt: input.systemPrompt ?? input.system_prompt ?? existing.systemPrompt ?? '',
    taskPrompt: input.taskPrompt ?? input.task_prompt ?? existing.taskPrompt ?? '',
    outputFormat: input.outputFormat ?? input.output_format ?? existing.outputFormat ?? {},
    enabled: normalizeBoolean(input.enabled, existing.enabled ?? true),
    version: normalizeInteger(input.version, existing.version ?? 1),
    notes: input.notes ?? existing.notes ?? '',
    createdAt: existing.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

function normalizeOutputSafetyRule(input = {}, existing = {}) {
  const timestamp = nowIso();
  return {
    ...existing,
    id: input.id || existing.id || `safety-${normalizeIdPrefix(input.name)}-${randomUUID().slice(0, 8)}`,
    name: input.name ?? existing.name ?? '',
    keywords: normalizeArray(input.keywords ?? existing.keywords),
    semanticDescription: input.semanticDescription ?? input.semantic_description ?? existing.semanticDescription ?? '',
    riskLevel: input.riskLevel ?? input.risk_level ?? existing.riskLevel ?? 'medium',
    triggerAction: input.triggerAction ?? input.trigger_action ?? existing.triggerAction ?? 'human_review',
    enabled: normalizeBoolean(input.enabled, existing.enabled ?? true),
    version: normalizeInteger(input.version, existing.version ?? 1),
    notes: input.notes ?? existing.notes ?? '',
    createdAt: existing.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

function normalizeAgentSkill(input = {}, existing = {}) {
  const timestamp = nowIso();
  const key = input.key ?? existing.key ?? '';
  return {
    ...existing,
    id: input.id || existing.id || `skill-${normalizeIdPrefix(key || input.label)}-${randomUUID().slice(0, 8)}`,
    key,
    label: input.label ?? existing.label ?? '',
    description: input.description ?? existing.description ?? '',
    enabled: normalizeBoolean(input.enabled, existing.enabled ?? true),
    order: normalizeInteger(input.order, existing.order ?? 100),
    required: normalizeBoolean(input.required, existing.required ?? false),
    failurePolicy: input.failurePolicy ?? input.failure_policy ?? existing.failurePolicy ?? 'fail_closed',
    notes: input.notes ?? existing.notes ?? '',
    createdAt: existing.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

function normalizeItemForCollection(collectionKey, input, existing = {}) {
  if (collectionKey === 'modelProviders') return normalizeProvider(input, existing);
  if (collectionKey === 'riskRules') return normalizeRiskRule(input, existing);
  if (collectionKey === 'spamRules') return normalizeSpamRule(input, existing);
  if (collectionKey === 'knowledgeBase') return normalizeKnowledgeBaseItem(input, existing);
  if (collectionKey === 'promptTemplates') return normalizePromptTemplate(input, existing);
  if (collectionKey === 'outputSafetyRules') return normalizeOutputSafetyRule(input, existing);
  if (collectionKey === 'agentSkills') return normalizeAgentSkill(input, existing);
  return input;
}

function sanitizeStoreForResponse(store, env) {
  return {
    ...store,
    modelProviders: store.modelProviders.map((provider) => withoutSensitiveProviderFields(provider, env)),
  };
}

export function createEmailAIStoreRepository({
  rootDir = process.cwd(),
  storePath = DEFAULT_STORE_PATH,
  env = process.env,
} = {}) {
  const resolvedRoot = rootDir instanceof URL ? rootDir.pathname : rootDir;
  const resolvedStorePath = resolve(resolvedRoot, storePath);

  async function readStore() {
    try {
      const text = await readFile(resolvedStorePath, 'utf8');
      return ensureStoreShape(JSON.parse(text));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const store = createDefaultEmailAIStore();
      await writeStore(store);
      return store;
    }
  }

  async function writeStore(store) {
    const shaped = ensureStoreShape(store);
    await mkdir(dirname(resolvedStorePath), { recursive: true });
    await writeFile(resolvedStorePath, `${JSON.stringify(shaped, null, 2)}\n`, 'utf8');
    return shaped;
  }

  async function updateStore(updater) {
    const store = await readStore();
    const next = await updater(clone(store));
    return writeStore(next);
  }

  async function list(collectionName) {
    const collectionKey = collectionKeyFromName(collectionName);
    const store = await readStore();
    const items = store[collectionKey] || [];
    return collectionKey === 'modelProviders'
      ? items.map((item) => withoutSensitiveProviderFields(item, env))
      : clone(items);
  }

  async function create(collectionName, input) {
    const collectionKey = collectionKeyFromName(collectionName);
    let createdItem = null;
    await updateStore((store) => {
      const item = normalizeItemForCollection(collectionKey, input);
      store[collectionKey] = [item, ...(store[collectionKey] || [])];
      createdItem = item;
      return store;
    });
    return collectionKey === 'modelProviders'
      ? withoutSensitiveProviderFields(createdItem, env)
      : clone(createdItem);
  }

  async function update(collectionName, id, input) {
    const collectionKey = collectionKeyFromName(collectionName);
    let updatedItem = null;
    await updateStore((store) => {
      const items = store[collectionKey] || [];
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) {
        const error = new Error('未找到要更新的配置项。');
        error.statusCode = 404;
        error.errorCode = 'email_ai_item_not_found';
        throw error;
      }
      updatedItem = normalizeItemForCollection(collectionKey, { ...input, id }, items[index]);
      store[collectionKey] = [
        ...items.slice(0, index),
        updatedItem,
        ...items.slice(index + 1),
      ];
      return store;
    });
    return collectionKey === 'modelProviders'
      ? withoutSensitiveProviderFields(updatedItem, env)
      : clone(updatedItem);
  }

  async function remove(collectionName, id) {
    const collectionKey = collectionKeyFromName(collectionName);
    let removed = null;
    await updateStore((store) => {
      const items = store[collectionKey] || [];
      removed = items.find((item) => item.id === id) || null;
      if (!removed) {
        const error = new Error('未找到要删除的配置项。');
        error.statusCode = 404;
        error.errorCode = 'email_ai_item_not_found';
        throw error;
      }
      store[collectionKey] = items.filter((item) => item.id !== id);
      return store;
    });
    return clone(removed);
  }

  async function recordTestRun({
    testInput = {},
    testResult = {},
    usedVersionId = null,
    usedMock = true,
    status = 'passed',
    errorMessage = '',
    createdBy = null,
  } = {}) {
    const timestamp = nowIso();
    const testRun = {
      id: `test-run-${randomUUID()}`,
      testInput,
      testResult,
      usedVersionId,
      usedMock,
      status,
      errorMessage,
      createdBy,
      createdAt: timestamp,
    };
    await updateStore((store) => {
      store.testRuns = [testRun, ...(store.testRuns || [])].slice(0, 100);
      return store;
    });
    return testRun;
  }

  async function createDraftVersion({ versionName = '', publishNote = '', publishedBy = null } = {}) {
    let version = null;
    await updateStore((store) => {
      const timestamp = nowIso();
      const snapshot = createEmailAIConfigSnapshot(store);
      version = {
        id: `version-${randomUUID()}`,
        versionName: versionName || `Email AI Draft ${timestamp}`,
        status: 'draft',
        modelConfig: snapshot.modelConfig,
        riskRulesSnapshot: snapshot.riskRulesSnapshot,
        spamRulesSnapshot: snapshot.spamRulesSnapshot,
        knowledgeBaseSnapshot: snapshot.knowledgeBaseSnapshot,
        promptTemplatesSnapshot: snapshot.promptTemplatesSnapshot,
        outputSafetyRulesSnapshot: snapshot.outputSafetyRulesSnapshot,
        agentSkillsSnapshot: snapshot.agentSkillsSnapshot,
        agentPipelineSnapshot: snapshot.agentPipelineSnapshot,
        strategyConfigSnapshot: snapshot.strategyConfigSnapshot,
        publishNote,
        publishedBy,
        publishedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      store.configVersions = [version, ...(store.configVersions || [])];
      return store;
    });
    return clone(version);
  }

  async function hasPassingTestRun() {
    const store = await readStore();
    return (store.testRuns || []).some((run) => run.status === 'passed');
  }

  async function publishVersion(id, { publishedBy = null } = {}) {
    let published = null;
    await updateStore((store) => {
      if (!(store.testRuns || []).some((run) => run.status === 'passed')) {
        const error = new Error('发布前必须先通过本地测试。');
        error.statusCode = 409;
        error.errorCode = 'email_ai_test_required';
        throw error;
      }
      const timestamp = nowIso();
      const versions = store.configVersions || [];
      const index = versions.findIndex((version) => version.id === id);
      if (index < 0) {
        const error = new Error('未找到要发布的版本。');
        error.statusCode = 404;
        error.errorCode = 'email_ai_version_not_found';
        throw error;
      }
      store.configVersions = versions.map((version) => {
        if (version.id === id) {
          published = {
            ...version,
            status: 'published',
            publishedBy: publishedBy || version.publishedBy || null,
            publishedAt: timestamp,
            updatedAt: timestamp,
          };
          return published;
        }
        return version.status === 'published'
          ? { ...version, status: 'archived', updatedAt: timestamp }
          : version;
      });
      return store;
    });
    return clone(published);
  }

  async function rollbackVersion(id, { publishedBy = null } = {}) {
    let published = null;
    await updateStore((store) => {
      const timestamp = nowIso();
      const versions = store.configVersions || [];
      const target = versions.find((version) => version.id === id);
      if (!target) {
        const error = new Error('未找到要回滚的版本。');
        error.statusCode = 404;
        error.errorCode = 'email_ai_version_not_found';
        throw error;
      }
      store.configVersions = versions.map((version) => {
        if (version.id === id) {
          published = {
            ...version,
            status: 'published',
            publishedBy: publishedBy || version.publishedBy || null,
            publishedAt: timestamp,
            updatedAt: timestamp,
          };
          return published;
        }
        return version.status === 'published'
          ? { ...version, status: 'archived', updatedAt: timestamp }
          : version;
      });
      return store;
    });
    return clone(published);
  }

  return {
    rootDir: resolvedRoot,
    storePath: resolvedStorePath,
    env,
    readStore,
    writeStore,
    updateStore,
    sanitizeStoreForResponse: (store) => sanitizeStoreForResponse(store, env),
    list,
    create,
    update,
    remove,
    createDraftVersion,
    publishVersion,
    rollbackVersion,
    hasPassingTestRun,
    recordTestRun,
  };
}
