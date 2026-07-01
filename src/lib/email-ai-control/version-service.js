import { createEmailAIStoreRepository } from './store-repository.js';

function sortVersions(versions = []) {
  return [...versions].sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
}

export async function listEmailAIConfigVersions({ repository = null, rootDir = process.cwd() } = {}) {
  const repo = repository || createEmailAIStoreRepository({ rootDir });
  const store = await repo.readStore();
  const versions = sortVersions(store.configVersions || []);
  return {
    versions,
    published: versions.find((version) => version.status === 'published') || null,
    draft: versions.find((version) => version.status === 'draft') || null,
  };
}

export async function createEmailAIConfigDraft(input = {}, { repository = null, rootDir = process.cwd() } = {}) {
  const repo = repository || createEmailAIStoreRepository({ rootDir });
  return repo.createDraftVersion(input);
}

export async function publishEmailAIConfigVersion(id, input = {}, { repository = null, rootDir = process.cwd() } = {}) {
  const repo = repository || createEmailAIStoreRepository({ rootDir });
  return repo.publishVersion(id, input);
}

export async function rollbackEmailAIConfigVersion(id, input = {}, { repository = null, rootDir = process.cwd() } = {}) {
  const repo = repository || createEmailAIStoreRepository({ rootDir });
  return repo.rollbackVersion(id, input);
}
