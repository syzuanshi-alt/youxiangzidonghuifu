import { resolve } from 'node:path';

import { mapFeishuMessageToMail } from '../src/feishuAdapter.js';
import {
  buildFeishuMailListUrl,
  buildFeishuServerConfig,
  buildPublicFeishuApiStatus,
  buildTenantAccessTokenRequest,
  extractTenantAccessToken,
  normalizeFeishuMailListResponse,
} from '../src/feishuApiClient.js';
import { loadLocalEnv } from '../server/envLoader.mjs';

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

function printSafeStatus(status, envInfo) {
  console.log(JSON.stringify({
    configured: status.configured,
    missing: status.missing,
    canReadMail: status.canReadMail,
    realSendEnabled: status.realSendEnabled,
    sourceStatus: status.sourceStatus,
    localEnvLoaded: envInfo.loaded,
  }, null, 2));
}

async function main() {
  const rootDir = resolve(process.cwd());
  const envInfo = loadLocalEnv({ rootDir });
  const publicStatus = buildPublicFeishuApiStatus(envInfo.env);

  if (!publicStatus.configured) {
    console.log('飞书只读 API 配置未补齐：');
    printSafeStatus(publicStatus, envInfo);
    process.exitCode = 1;
    return;
  }

  const config = buildFeishuServerConfig(envInfo.env);
  const tokenRequest = buildTenantAccessTokenRequest({
    appId: config.appId,
    appSecret: config.appSecret,
    apiBase: config.apiBase,
  });
  const tokenResponse = await fetchJson(tokenRequest.url, tokenRequest.options);
  const tenantAccessToken = extractTenantAccessToken(tokenResponse.payload);
  const mailListUrl = buildFeishuMailListUrl({
    apiBase: config.apiBase,
    userMailboxId: config.userMailboxId,
    pageSize: 5,
    folderId: config.mailFolderId,
    labelId: config.mailLabelId,
  });
  const mailListResponse = await fetchJson(mailListUrl, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${tenantAccessToken}`,
      'content-type': 'application/json; charset=utf-8',
    },
  });
  const normalized = normalizeFeishuMailListResponse(mailListResponse.payload);
  const mails = normalized.messages.map(mapFeishuMessageToMail);

  console.log(JSON.stringify({
    ok: true,
    sourceStatus: '真实接入',
    localEnvLoaded: envInfo.loaded,
    fetchedCount: mails.length,
    hasMore: normalized.hasMore,
    pageTokenPresent: Boolean(normalized.pageToken),
    realSendEnabled: false,
    recentSubjects: mails.slice(0, 3).map((mail) => ({
      id: mail.id,
      subject: mail.subject,
      sender: mail.sender,
      receivedAt: mail.receivedAt,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    realSendEnabled: false,
  }, null, 2));
  process.exitCode = 1;
});
