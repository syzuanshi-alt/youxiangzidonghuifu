import {
  DEFAULT_AGENT_PIPELINE,
  DEFAULT_STRATEGY_CONFIG,
  createDefaultEmailAIStore,
} from './default-config.js';
import { createEmailAIStoreRepository } from './store-repository.js';

function configFromStore(store, version) {
  return {
    version,
    modelProviders: store.modelProviders || [],
    riskRules: store.riskRules || [],
    spamRules: store.spamRules || [],
    knowledgeBase: store.knowledgeBase || [],
    promptTemplates: store.promptTemplates || [],
    outputSafetyRules: store.outputSafetyRules || [],
    agentSkills: store.agentSkills || [],
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
    agentSkills: version.agentSkillsSnapshot || [],
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
