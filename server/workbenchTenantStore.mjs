import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

function defaultStore() {
  return {
    tenants: [],
    oauthStates: [],
  };
}

function normalizeAccount(account = '') {
  return String(account || '').trim().toLowerCase();
}

function safeSegment(value = '') {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 96) || 'unknown';
}

function publicTenant(record = {}) {
  return {
    userId: record.userId || '',
    account: record.account || '',
    mailboxAddress: record.mailboxAddress || '',
    botReportEmail: record.botReportEmail || '',
    archiveFolderId: record.archiveFolderId || '',
    archiveFolderName: record.archiveFolderName || '',
    userAccessTokenConfigured: Boolean(record.userAccessToken),
    userRefreshTokenConfigured: Boolean(record.userRefreshToken),
    userAccessTokenExpiresAt: record.userAccessTokenExpiresAt || '',
    userRefreshTokenExpiresAt: record.userRefreshTokenExpiresAt || '',
    createdAt: record.createdAt || '',
    updatedAt: record.updatedAt || '',
  };
}

function envFromTenant(env = {}, tenant = {}) {
  return {
    ...env,
    FEISHU_USER_MAILBOX_ID: tenant.mailboxAddress || '',
    FEISHU_BOT_REPORT_EMAIL: tenant.botReportEmail || '',
    FEISHU_USER_ACCESS_TOKEN: tenant.userAccessToken || '',
    FEISHU_USER_REFRESH_TOKEN: tenant.userRefreshToken || '',
    FEISHU_USER_ACCESS_TOKEN_EXPIRES_AT: tenant.userAccessTokenExpiresAt || '',
    FEISHU_USER_REFRESH_TOKEN_EXPIRES_AT: tenant.userRefreshTokenExpiresAt || '',
    FEISHU_ARCHIVE_FOLDER_ID: tenant.archiveFolderId || '',
    FEISHU_ARCHIVE_FOLDER_NAME: tenant.archiveFolderName || env.FEISHU_ARCHIVE_FOLDER_NAME || '',
  };
}

export function tenantRuntimeRoot(rootDir, userId = '') {
  return join(rootDir, 'tenants', safeSegment(userId));
}

export function createWorkbenchTenantStore({
  rootDir = process.cwd(),
  env = process.env,
} = {}) {
  const storePath = join(rootDir, 'data/workbench-tenant-store.json');

  async function readStore() {
    try {
      const parsed = JSON.parse(await readFile(storePath, 'utf8'));
      return {
        ...defaultStore(),
        ...parsed,
        tenants: Array.isArray(parsed.tenants) ? parsed.tenants : [],
        oauthStates: Array.isArray(parsed.oauthStates) ? parsed.oauthStates : [],
      };
    } catch (error) {
      if (error.code === 'ENOENT') return defaultStore();
      throw error;
    }
  }

  async function writeStore(store) {
    await mkdir(dirname(storePath), { recursive: true });
    await writeFile(storePath, `${JSON.stringify({
      ...defaultStore(),
      ...store,
    }, null, 2)}\n`, 'utf8');
  }

  function findTenantRecord(store, user = {}) {
    const userId = String(user.id || '').trim();
    const account = normalizeAccount(user.account || user.phone || '');
    return store.tenants.find((tenant) => (
      (userId && tenant.userId === userId)
        || (account && normalizeAccount(tenant.account) === account)
    )) || null;
  }

  async function ensureTenant(user = {}) {
    const store = await readStore();
    const now = new Date().toISOString();
    let record = findTenantRecord(store, user);
    if (!record) {
      record = {
        userId: user.id || `user_${randomBytes(8).toString('hex')}`,
        account: normalizeAccount(user.account || user.phone || ''),
        mailboxAddress: '',
        botReportEmail: '',
        userAccessToken: '',
        userRefreshToken: '',
        userAccessTokenExpiresAt: '',
        userRefreshTokenExpiresAt: '',
        archiveFolderId: '',
        archiveFolderName: '',
        createdAt: now,
        updatedAt: now,
      };

      const hasAnyTenantMailbox = store.tenants.some((tenant) => tenant.mailboxAddress);
      if (!hasAnyTenantMailbox && env.FEISHU_USER_MAILBOX_ID) {
        record.mailboxAddress = String(env.FEISHU_USER_MAILBOX_ID || '').trim();
        record.botReportEmail = String(env.FEISHU_BOT_REPORT_EMAIL || '').trim();
        record.userAccessToken = String(env.FEISHU_USER_ACCESS_TOKEN || '').trim();
        record.userRefreshToken = String(env.FEISHU_USER_REFRESH_TOKEN || '').trim();
        record.userAccessTokenExpiresAt = String(env.FEISHU_USER_ACCESS_TOKEN_EXPIRES_AT || '').trim();
        record.userRefreshTokenExpiresAt = String(env.FEISHU_USER_REFRESH_TOKEN_EXPIRES_AT || '').trim();
        record.archiveFolderId = String(env.FEISHU_ARCHIVE_FOLDER_ID || '').trim();
        record.archiveFolderName = String(env.FEISHU_ARCHIVE_FOLDER_NAME || '').trim();
        record.seededFromGlobalEnv = true;
      }

      store.tenants.push(record);
      await writeStore(store);
    }
    return record;
  }

  async function getTenant(user = {}) {
    const record = await ensureTenant(user);
    return publicTenant(record);
  }

  async function buildTenantContext(user = {}) {
    const record = await ensureTenant(user);
    const runtimeRoot = tenantRuntimeRoot(rootDir, record.userId);
    return {
      tenant: publicTenant(record),
      tenantEnv: envFromTenant(env, record),
      runtimeRoot,
      mailboxBound: Boolean(record.mailboxAddress),
    };
  }

  async function updateTenantConfig(user = {}, updates = {}) {
    await ensureTenant(user);
    const store = await readStore();
    const storedRecord = findTenantRecord(store, user);
    const previousMailbox = storedRecord.mailboxAddress || '';

    if (updates.mailboxAddress !== undefined) {
      storedRecord.mailboxAddress = String(updates.mailboxAddress || '').trim();
    }
    if (updates.botReportEmail !== undefined) {
      storedRecord.botReportEmail = String(updates.botReportEmail || '').trim();
    }
    if (updates.archiveFolderId !== undefined) {
      storedRecord.archiveFolderId = String(updates.archiveFolderId || '').trim();
    }
    if (updates.archiveFolderName !== undefined) {
      storedRecord.archiveFolderName = String(updates.archiveFolderName || '').trim();
    }
    if (updates.resetAuth || (updates.mailboxAddress !== undefined && storedRecord.mailboxAddress !== previousMailbox)) {
      storedRecord.userAccessToken = '';
      storedRecord.userRefreshToken = '';
      storedRecord.userAccessTokenExpiresAt = '';
      storedRecord.userRefreshTokenExpiresAt = '';
      storedRecord.archiveFolderId = '';
    }
    storedRecord.updatedAt = new Date().toISOString();
    await writeStore(store);
    return publicTenant(storedRecord);
  }

  async function updateTenantTokens(user = {}, updates = {}) {
    await ensureTenant(user);
    const store = await readStore();
    const storedRecord = findTenantRecord(store, user);

    if (updates.FEISHU_USER_ACCESS_TOKEN !== undefined) {
      storedRecord.userAccessToken = String(updates.FEISHU_USER_ACCESS_TOKEN || '').trim();
    }
    if (updates.FEISHU_USER_REFRESH_TOKEN !== undefined) {
      storedRecord.userRefreshToken = String(updates.FEISHU_USER_REFRESH_TOKEN || '').trim();
    }
    if (updates.FEISHU_USER_ACCESS_TOKEN_EXPIRES_AT !== undefined) {
      storedRecord.userAccessTokenExpiresAt = String(updates.FEISHU_USER_ACCESS_TOKEN_EXPIRES_AT || '').trim();
    }
    if (updates.FEISHU_USER_REFRESH_TOKEN_EXPIRES_AT !== undefined) {
      storedRecord.userRefreshTokenExpiresAt = String(updates.FEISHU_USER_REFRESH_TOKEN_EXPIRES_AT || '').trim();
    }
    if (updates.FEISHU_ARCHIVE_FOLDER_ID !== undefined) {
      storedRecord.archiveFolderId = String(updates.FEISHU_ARCHIVE_FOLDER_ID || '').trim();
    }
    if (updates.FEISHU_ARCHIVE_FOLDER_NAME !== undefined) {
      storedRecord.archiveFolderName = String(updates.FEISHU_ARCHIVE_FOLDER_NAME || '').trim();
    }
    storedRecord.updatedAt = new Date().toISOString();
    await writeStore(store);
    return publicTenant(storedRecord);
  }

  async function createOAuthState(user = {}, stateHint = '') {
    const tenant = await ensureTenant(user);
    const store = await readStore();
    const state = `wb_${randomBytes(18).toString('hex')}`;
    const now = Date.now();
    store.oauthStates = store.oauthStates
      .filter((item) => item.createdAt && now - Date.parse(item.createdAt) < 15 * 60 * 1000)
      .filter((item) => item.userId !== tenant.userId);
    store.oauthStates.push({
      state,
      stateHint: String(stateHint || '').trim(),
      userId: tenant.userId,
      account: tenant.account,
      createdAt: new Date(now).toISOString(),
    });
    await writeStore(store);
    return state;
  }

  async function consumeOAuthState(state) {
    const stateValue = String(state || '').trim();
    const store = await readStore();
    const item = store.oauthStates.find((entry) => entry.state === stateValue) || null;
    store.oauthStates = store.oauthStates.filter((entry) => entry.state !== stateValue);
    if (item) await writeStore(store);
    return item;
  }

  async function storageStatus() {
    const store = await readStore();
    return {
      tenantCount: store.tenants.length,
      boundTenantCount: store.tenants.filter((tenant) => tenant.mailboxAddress).length,
      oauthStateCount: store.oauthStates.length,
    };
  }

  return {
    readStore,
    getTenant,
    buildTenantContext,
    updateTenantConfig,
    updateTenantTokens,
    createOAuthState,
    consumeOAuthState,
    storageStatus,
  };
}
