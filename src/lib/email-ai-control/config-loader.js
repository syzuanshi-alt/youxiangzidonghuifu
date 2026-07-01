import {
  DEFAULT_AGENT_SKILLS,
  DEFAULT_AGENT_PIPELINE,
  DEFAULT_STRATEGY_CONFIG,
  createDefaultEmailAIStore,
} from './default-config.js';
import { createEmailAIStoreRepository } from './store-repository.js';

function mergeDefaultAgentSkills(agentSkills = []) {
  const existing = Array.isArray(agentSkills) ? agentSkills : [];
  const byKey = new Map(existing.map((skill) => [skill.key, skill]));
  const defaultKeys = new Set(DEFAULT_AGENT_SKILLS.map((skill) => skill.key));
  const deprecatedDefaultKeys = new Set(['classify_email', 'review_risk']);
  const mergedDefaults = DEFAULT_AGENT_SKILLS.map((defaultSkill) => {
    const existingSkill = byKey.get(defaultSkill.key) || {};
    return {
      ...defaultSkill,
      ...existingSkill,
      id: existingSkill.id || defaultSkill.id,
      key: defaultSkill.key,
      order: defaultSkill.order,
      required: defaultSkill.required,
      failurePolicy: defaultSkill.failurePolicy,
      notes: existingSkill.notes || defaultSkill.notes,
    };
  });
  const customSkills = existing.filter((skill) => !defaultKeys.has(skill.key) && !deprecatedDefaultKeys.has(skill.key));
  return [...mergedDefaults, ...customSkills];
}

function configFromStore(store, version) {
  return {
    version,
    modelProviders: store.modelProviders || [],
    riskRules: store.riskRules || [],
    spamRules: store.spamRules || [],
    knowledgeBase: store.knowledgeBase || [],
    promptTemplates: store.promptTemplates || [],
    outputSafetyRules: store.outputSafetyRules || [],
    agentSkills: mergeDefaultAgentSkills(store.agentSkills),
    agentPipeline: {
      ...DEFAULT_AGENT_PIPELINE,
      ...(store.agentPipeline || {}),
    },
    strategyConfig: {
      ...DEFAULT_STRATEGY_CONFIG,
      ...(store.strategyConfig || {}),
    },
  };
}

function configFromPublishedVersion(version) {
  return {
    version,
    modelProviders: version.modelConfig || [],
    riskRules: version.riskRulesSnapshot || [],
    spamRules: version.spamRulesSnapshot || [],
    knowledgeBase: version.knowledgeBaseSnapshot || [],
    promptTemplates: version.promptTemplatesSnapshot || [],
    outputSafetyRules: version.outputSafetyRulesSnapshot || [],
    agentSkills: mergeDefaultAgentSkills(version.agentSkillsSnapshot),
    agentPipeline: {
      ...DEFAULT_AGENT_PIPELINE,
      ...(version.agentPipelineSnapshot || {}),
    },
    strategyConfig: {
      ...DEFAULT_STRATEGY_CONFIG,
      ...(version.strategyConfigSnapshot || {}),
    },
  };
}

export async function getPublishedEmailAIConfig({ repository = null, rootDir = process.cwd() } = {}) {
  const repo = repository || createEmailAIStoreRepository({ rootDir });
  const store = await repo.readStore();
  const published = (store.configVersions || [])
    .filter((version) => version.status === 'published')
    .sort((a, b) => String(b.publishedAt || b.updatedAt || '').localeCompare(String(a.publishedAt || a.updatedAt || '')))[0];

  if (published) {
    return configFromPublishedVersion(published);
  }

  const defaultStore = {
    ...createDefaultEmailAIStore(),
    ...store,
  };

  return configFromStore(defaultStore, {
    id: 'mock-default',
    versionName: 'Local Mock Default',
    status: 'mock',
    publishedAt: null,
  });
}

export async function getDraftEmailAIConfig({ repository = null, rootDir = process.cwd() } = {}) {
  const repo = repository || createEmailAIStoreRepository({ rootDir });
  const store = await repo.readStore();
  const draft = (store.configVersions || [])
    .filter((version) => version.status === 'draft')
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))[0];

  return draft
    ? configFromPublishedVersion(draft)
    : configFromStore(store, {
      id: 'draft-current',
      versionName: 'Current Draft',
      status: 'draft',
      publishedAt: null,
    });
}
