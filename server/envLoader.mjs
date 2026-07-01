import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function stripWrappingQuotes(value) {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];

  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function parseEnvContent(content = '') {
  return String(content)
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
        return env;
      }

      const separatorIndex = trimmed.indexOf('=');
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1);

      if (!/^[A-Z0-9_]+$/.test(key)) {
        return env;
      }

      env[key] = stripWrappingQuotes(value);
      return env;
    }, {});
}

export function mergeLocalEnv({ baseEnv = {}, localEnv = {} } = {}) {
  return {
    ...localEnv,
    ...baseEnv,
  };
}

export function loadLocalEnv({ rootDir = process.cwd(), filename = '.env.local', baseEnv = process.env } = {}) {
  const filePath = join(rootDir, filename);

  if (!existsSync(filePath)) {
    return {
      env: { ...baseEnv },
      loaded: false,
      path: filePath,
    };
  }

  const localEnv = parseEnvContent(readFileSync(filePath, 'utf8'));

  return {
    env: mergeLocalEnv({ baseEnv, localEnv }),
    loaded: true,
    path: filePath,
  };
}
