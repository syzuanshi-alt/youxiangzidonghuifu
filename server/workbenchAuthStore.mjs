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

function normalizePhone(phone = '') {
  const digits = String(phone || '').trim().replace(/[^\d]/g, '');
  if (digits.length === 13 && digits.startsWith('86')) {
    return digits.slice(2);
  }
  return digits;
}

function publicUser(record = {}) {
  return {
    id: record.id || '',
    phone: record.phone || '',
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

  async function createUser({ phone, password } = {}) {
    const normalizedPhone = normalizePhone(phone);
    const store = await readStore();
    if (!normalizedPhone) {
      throw new Error('手机号不能为空。');
    }
    if (store.users.some((user) => user.phone === normalizedPhone)) {
      throw new Error('这个手机号已创建账号。');
    }

    const record = {
      id: `user_${randomBytes(12).toString('hex')}`,
      phone: normalizedPhone,
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

  async function findUserByPhone(phone) {
    const normalizedPhone = normalizePhone(phone);
    const store = await readStore();
    const record = store.users.find((user) => user.phone === normalizedPhone);
    return record ? publicUser(record) : null;
  }

  async function findRawUserByPhone(phone) {
    const normalizedPhone = normalizePhone(phone);
    const store = await readStore();
    return store.users.find((user) => user.phone === normalizedPhone) || null;
  }

  async function verifyPassword(phone, password) {
    const record = await findRawUserByPhone(phone);
    if (!record) return false;
    return verifyPasswordHash(password, record.passwordHash);
  }

  async function updatePassword({ phone, newPassword } = {}) {
    const normalizedPhone = normalizePhone(phone);
    const store = await readStore();
    const record = store.users.find((user) => user.phone === normalizedPhone);
    if (!record) {
      throw new Error('账号不存在。');
    }

    record.passwordHash = await hashPassword(newPassword);
    store.sessions = store.sessions.filter((item) => item.phone !== normalizedPhone);
    await writeStore(store);

    return {
      user: publicUser(record),
      rawRecord: record,
    };
  }

  async function createSession({ phone, rememberLogin = false } = {}) {
    const normalizedPhone = normalizePhone(phone);
    const store = await readStore();
    const record = store.users.find((user) => user.phone === normalizedPhone);
    if (!record) {
      throw new Error('账号不存在。');
    }

    const now = Date.now();
    const session = {
      token: randomBytes(32).toString('hex'),
      phone: normalizedPhone,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + (rememberLogin ? rememberTtlMs : sessionTtlMs)).toISOString(),
      rememberLogin: Boolean(rememberLogin),
    };
    record.lastLoginAt = new Date(now).toISOString();
    store.sessions = store.sessions
      .filter((item) => item.expiresAt && Date.parse(item.expiresAt) > now)
      .filter((item) => item.phone !== normalizedPhone);
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

    const record = store.users.find((user) => user.phone === session.phone);
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
