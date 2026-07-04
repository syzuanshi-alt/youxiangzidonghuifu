import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function defaultStore() {
  return {
    users: [],
    sessions: [],
    captchaChallenges: [],
    smsCodes: [],
  };
}

function normalizeAccount(account = '') {
  const rawText = String(account || '').trim();
  const phoneLike = normalizePhone(rawText);
  if (/^\+?[\d\s().-]+$/.test(rawText) && phoneLike.length >= 6) {
    return phoneLike;
  }
  return rawText.toLowerCase();
}

function isValidAccount(account = '') {
  const normalized = normalizeAccount(account);
  return normalized.length >= 3
    && normalized.length <= 64
    && /^[a-z0-9._@+-]+$/.test(normalized);
}

function normalizePhone(phone = '') {
  const digits = String(phone || '').trim().replace(/[^\d]/g, '');
  if (digits.length === 13 && digits.startsWith('86')) {
    return digits.slice(2);
  }
  return digits;
}

function accountForRecord(record = {}) {
  return normalizeAccount(record.account || record.phone || '');
}

function publicUser(record = {}) {
  const account = accountForRecord(record);
  return {
    id: record.id || '',
    account,
    phone: record.phone || (/^\d{6,20}$/.test(account) ? account : ''),
    createdAt: record.createdAt || '',
    lastLoginAt: record.lastLoginAt || '',
  };
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(String(password), salt, 64);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPasswordHash(password, passwordHash) {
  const [scheme, salt, expectedHex] = String(passwordHash || '').split(':');
  if (scheme !== 'scrypt' || !salt || !expectedHex) return false;

  const actual = await scrypt(String(password), salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createWorkbenchAuthStore({
  rootDir = process.cwd(),
  sessionTtlMs = DEFAULT_SESSION_TTL_MS,
  rememberTtlMs = DEFAULT_REMEMBER_TTL_MS,
} = {}) {
  const storePath = join(rootDir, 'data/workbench-auth-store.json');

  async function readStore() {
    try {
      const parsed = JSON.parse(await readFile(storePath, 'utf8'));
      return {
        ...defaultStore(),
        ...parsed,
        users: Array.isArray(parsed.users) ? parsed.users : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        captchaChallenges: Array.isArray(parsed.captchaChallenges) ? parsed.captchaChallenges : [],
        smsCodes: Array.isArray(parsed.smsCodes) ? parsed.smsCodes : [],
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

  function findUserRecord(store, account) {
    const normalizedAccount = normalizeAccount(account);
    return store.users.find((user) => accountForRecord(user) === normalizedAccount) || null;
  }

  async function createUser({ account, phone, password } = {}) {
    const normalizedAccount = normalizeAccount(account || phone);
    const store = await readStore();
    if (!isValidAccount(normalizedAccount)) {
      throw new Error('账号格式不正确，请使用 3-64 位邮箱、字母、数字、下划线、短横线或点号。');
    }
    if (findUserRecord(store, normalizedAccount)) {
      throw new Error('这个账号已创建。');
    }

    const record = {
      id: `user_${randomBytes(12).toString('hex')}`,
      account: normalizedAccount,
      phone: /^\d{6,20}$/.test(normalizedAccount) ? normalizedAccount : '',
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString(),
      lastLoginAt: '',
    };
    store.users.push(record);
    await writeStore(store);

    return {
      user: publicUser(record),
      rawRecord: record,
    };
  }

  async function findUserByAccount(account) {
    const normalizedAccount = normalizeAccount(account);
    const store = await readStore();
    const record = findUserRecord(store, normalizedAccount);
    return record ? publicUser(record) : null;
  }

  async function findUserByPhone(phone) {
    return findUserByAccount(phone);
  }

  async function findRawUserByAccount(account) {
    const normalizedAccount = normalizeAccount(account);
    const store = await readStore();
    return findUserRecord(store, normalizedAccount);
  }

  async function findRawUserByPhone(phone) {
    return findRawUserByAccount(phone);
  }

  async function verifyPassword(account, password) {
    const record = await findRawUserByAccount(account);
    if (!record) return false;
    return verifyPasswordHash(password, record.passwordHash);
  }

  async function updatePassword({ account, phone, newPassword } = {}) {
    const normalizedAccount = normalizeAccount(account || phone);
    const store = await readStore();
    const record = findUserRecord(store, normalizedAccount);
    if (!record) {
      throw new Error('账号不存在。');
    }

    record.passwordHash = await hashPassword(newPassword);
    store.sessions = store.sessions.filter((item) => normalizeAccount(item.account || item.phone) !== normalizedAccount);
    await writeStore(store);

    return {
      user: publicUser(record),
      rawRecord: record,
    };
  }

  async function createSession({ account, phone, rememberLogin = false } = {}) {
    const normalizedAccount = normalizeAccount(account || phone);
    const store = await readStore();
    const record = findUserRecord(store, normalizedAccount);
    if (!record) {
      throw new Error('账号不存在。');
    }

    const now = Date.now();
    const session = {
      token: randomBytes(32).toString('hex'),
      account: accountForRecord(record),
      phone: record.phone || '',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + (rememberLogin ? rememberTtlMs : sessionTtlMs)).toISOString(),
      rememberLogin: Boolean(rememberLogin),
    };
    record.lastLoginAt = new Date(now).toISOString();
    store.sessions = store.sessions
      .filter((item) => item.expiresAt && Date.parse(item.expiresAt) > now)
      .filter((item) => normalizeAccount(item.account || item.phone) !== normalizedAccount);
    store.sessions.push(session);
    await writeStore(store);

    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: publicUser(record),
    };
  }

  async function findSession(token) {
    const sessionToken = String(token || '').trim();
    if (!sessionToken) return null;

    const store = await readStore();
    const now = Date.now();
    const session = store.sessions.find((item) => item.token === sessionToken);
    if (!session || !session.expiresAt || Date.parse(session.expiresAt) <= now) {
      return null;
    }

    const record = findUserRecord(store, session.account || session.phone);
    if (!record) return null;

    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: publicUser(record),
    };
  }

  async function deleteSession(token) {
    const sessionToken = String(token || '').trim();
    const store = await readStore();
    const beforeCount = store.sessions.length;
    store.sessions = store.sessions.filter((item) => item.token !== sessionToken);
    if (store.sessions.length !== beforeCount) {
      await writeStore(store);
    }
  }

  async function countUsers() {
    const store = await readStore();
    return store.users.length;
  }

  async function getStorageStatus() {
    const store = await readStore();
    let storeFileExists = true;
    try {
      await stat(storePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        storeFileExists = false;
      } else {
        throw error;
      }
    }

    return {
      storeFileExists,
      hasUsers: store.users.length > 0,
      userCount: store.users.length,
      sessionCount: store.sessions.length,
    };
  }

  return {
    createUser,
    findUserByAccount,
    findUserByPhone,
    verifyPassword,
    updatePassword,
    createSession,
    findSession,
    deleteSession,
    countUsers,
    getStorageStatus,
    readStore,
  };
}
