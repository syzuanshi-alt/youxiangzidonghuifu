import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require('/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  }
}

const { chromium } = loadPlaywright();

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const fixtureMails = [
  {
    id: 'MAIL-HIGH',
    messageId: 'MSG-HIGH',
    subject: '我要取消订单并退款',
    sender: 'high-risk@example.test',
    receivedAt: '2026-06-30 09:00',
    summary: '客户要求取消订单并退款。',
    bodyText: '我要取消订单并退款，请马上处理。',
  },
  {
    id: 'MAIL-MEDIUM',
    messageId: 'MSG-MEDIUM',
    subject: 'Order status SH-TEST-1001',
    sender: 'medium-risk@example.test',
    receivedAt: '2026-06-30 09:10',
    summary: '客户查询订单状态，提供订单号 SH-TEST-1001。',
    bodyText: 'Could you check my order status SH-TEST-1001?',
  },
  {
    id: 'MAIL-LOW',
    messageId: 'MSG-LOW',
    subject: '已发送资料，请查收',
    sender: 'low-risk@example.test',
    receivedAt: '2026-06-30 09:20',
    summary: '客户说明资料已发送，希望确认收到。',
    bodyText: 'The requested file has been sent. Please confirm received.',
  },
  {
    id: 'MAIL-SPAM',
    messageId: 'MSG-SPAM',
    subject: 'SEO backlinks 广告外链推广',
    sender: 'spam@example.test',
    receivedAt: '2026-06-30 09:30',
    summary: '广告推广 seo backlinks unsubscribe。',
    bodyText: 'SEO backlinks promotion, unsubscribe anytime.',
  },
];

const writeStatus = {
  writeEnabled: true,
  sendEnabled: true,
  archiveEnabled: true,
  highRiskSendEnabled: true,
  realSendEnabled: true,
  realArchiveEnabled: true,
  autoProcessEnabled: true,
  autoSendLowRiskEnabled: true,
  autoArchiveSpamEnabled: true,
  customerReplyOriginalSenderEnabled: true,
  unknownCustomerAutoReplyEnabled: true,
  customerReplyPolicy: 'original_sender',
  allowlistCount: 0,
  dailySendLimit: 20,
  dailyArchiveLimit: 100,
  archiveFolderConfigured: true,
  hardDeleteEnabled: false,
};

function startStaticServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const requestedPath = normalize(join(projectRoot, decodeURIComponent(pathname)));

    if (!requestedPath.startsWith(projectRoot) || !existsSync(requestedPath) || !statSync(requestedPath).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'content-type': contentTypes[extname(requestedPath)] || 'application/octet-stream',
    });
    createReadStream(requestedPath).pipe(response);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((closeResolve) => server.close(closeResolve)),
      });
    });
  });
}

async function installApiRoutes(page, capturedActions) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/feishu/status') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          configured: true,
          messagesLoaded: true,
          fetchedCount: fixtureMails.length,
          sourceStatus: '真实接入',
          statusText: `已接入 · ${fixtureMails.length} 封`,
          note: 'UI 测试拦截的飞书状态。',
          write: writeStatus,
        }),
      });
      return;
    }

    if (path === '/api/feishu/mail/messages') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          allPagesFetched: true,
          pageCount: 1,
          cacheStatus: 'fresh',
          sourceStatus: '真实接入',
          messages: [],
          mails: fixtureMails,
        }),
      });
      return;
    }

    if (path === '/api/email-ai/status') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          configVersionId: 'TEST-PUBLISHED',
          versionName: 'UI Test Published',
          status: 'published',
          publishedAt: '2026-06-30T00:00:00.000Z',
          model: {},
          strategyConfig: { lowRiskDefaultAction: 'auto_send_allowed' },
          providers: [],
        }),
      });
      return;
    }

    if (path === '/api/email-ai/process') {
      const payload = JSON.parse(request.postData() || '{}');
      const subject = String(payload.subject || '');
      const isHigh = subject.includes('退款');
      const isMedium = subject.includes('Order status');
      const isLow = subject.includes('已发送资料');
      const isSpam = subject.includes('SEO backlinks');
      const risk = isHigh ? 'high' : isMedium ? 'medium' : isLow ? 'low' : 'medium';

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          configVersionId: 'TEST-PUBLISHED',
          finalAction: isSpam
            ? 'ignore_spam'
            : isHigh
              ? 'blocked'
              : isLow
                ? 'auto_send_allowed'
                : 'human_review',
          customerLanguage: { code: subject.includes('Order status') ? 'en' : 'zh', label: '测试语言' },
          spam: {
            isSpam,
            matchedRules: isSpam ? ['垃圾 / 广告'] : [],
          },
          risk: {
            level: isSpam ? 'spam' : risk,
            matchedRules: [isSpam ? '垃圾邮件' : risk === 'high' ? '退款/退货高风险' : risk === 'medium' ? '查订单' : '收到邮件确认'],
            reasons: [isSpam ? '命中广告推广特征。' : `测试 ${risk} 风险邮件。`],
          },
          safety: {
            needHumanReview: isHigh || isMedium,
            reasons: [],
          },
          reply: {
            draft: isSpam || isHigh
              ? ''
              : isLow
                ? '已收到您的资料，我们会尽快查看。'
                : 'Thanks for your message. We will check the order status and get back to you.',
            internalSuggestion: '高风险邮件需要人工核对后处理。',
            customerLanguage: { code: subject.includes('Order status') ? 'en' : 'zh', label: '测试语言' },
          },
          model: {
            replyModel: 'ui-test-model',
          },
          knowledgeBaseRefs: [],
        }),
      });
      return;
    }

    if (path === '/api/feishu/mail/actions/send' || path === '/api/feishu/mail/actions/archive') {
      const payload = JSON.parse(request.postData() || '{}');
      capturedActions.push({
        path,
        payload,
      });
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          action: path.endsWith('/archive') ? 'archive' : 'send',
          mode: 'ready',
        }),
      });
      return;
    }

    if (path === '/api/feishu/mail/actions/approve' || path === '/api/feishu/mail/risk-overrides') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (path === '/api/admin/email-ai-control' && request.method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          store: {
            modelProviders: [],
            riskRules: [],
            spamRules: [],
            knowledgeBase: [],
            promptTemplates: [],
            outputSafetyRules: [],
            agentPipeline: {
              enabled: true,
              traceEnabled: true,
              defaultFailurePolicy: 'fail_closed',
            },
            agentSkills: [
              {
                id: 'skill-translate-global-language',
                key: 'translate_global_language',
                label: '全球语言自动翻译',
                description: '识别客户语言并生成中文内部理解参考。',
                enabled: true,
                order: 10,
                required: true,
                failurePolicy: 'fail_closed',
                notes: '',
              },
              {
                id: 'skill-classify-email',
                key: 'classify_email',
                label: '邮件分类',
                description: '判断垃圾邮件、风险等级和建议动作。',
                enabled: true,
                order: 20,
                required: true,
                failurePolicy: 'fail_closed',
                notes: '',
              },
              {
                id: 'skill-check-commitment-risk',
                key: 'check_commitment_risk',
                label: '承诺与责任风险复查',
                description: '专门复查生成内容中的承诺和责任风险。',
                enabled: true,
                order: 110,
                required: true,
                failurePolicy: 'fail_closed',
                notes: '发现退款、补发、赔偿、到货时间、责任承认、平台处理结果时必须阻断自动发送并转人工。',
              },
              {
                id: 'skill-decide-auto-action',
                key: 'decide_auto_action',
                label: '自动处理资格判定',
                description: '综合风险、知识库置信度、缺失字段和安全复查输出最终动作。',
                enabled: true,
                order: 120,
                required: true,
                failurePolicy: 'fail_closed',
                notes: '默认不开放自动发送；只有低风险且所有 gate 通过才允许自动发送候选。',
              },
            ],
          },
        }),
      });
      return;
    }

    if (path === '/api/admin/email-ai-control/versions' && request.method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, versions: [], published: null }),
      });
      return;
    }

    if (path === '/api/admin/email-ai-control/password-login') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, message: '管理员密码验证失败。' }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, message: `Unhandled test route: ${path}` }),
    });
  });
}

async function waitForText(page, text) {
  await page.waitForFunction(
    (expectedText) => document.body.innerText.includes(expectedText),
    text,
    { timeout: 5_000 },
  );
}

async function clickMailRow(page, text) {
  await page.locator('.mail-row').filter({ hasText: text }).first().click();
}

async function readJsonLocalStorage(page, key) {
  return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) || '{}'), key);
}

const server = await startStaticServer();
const browser = await chromium.launch({ headless: true });
const capturedActions = [];
const consoleErrors = [];
const pageErrors = [];

try {
  const page = await browser.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await installApiRoutes(page, capturedActions);
  await page.addInitScript(() => {
    const phone = '18800000000';
    localStorage.setItem('email-auto-reply-workbench-accounts', JSON.stringify({
      [phone]: {
        phone,
        password: 'password123',
        createdAt: new Date().toISOString(),
      },
    }));
    localStorage.setItem('email-auto-reply-workbench-session', JSON.stringify({
      phone,
      loginAt: new Date().toISOString(),
    }));
    localStorage.removeItem('feishu-mail-risk-overrides');
    localStorage.removeItem('feishu-mail-manual-archive-selections');
    localStorage.removeItem('feishu-mail-write-action-results');
    localStorage.removeItem('feishu-mail-candidate-selections');
    localStorage.removeItem('feishu-mail-rule-reviews');
  });

  await page.goto(server.origin, { waitUntil: 'domcontentloaded' });
  await waitForText(page, '数据总览');
  await page.locator('[data-close-overview]').click();
  await waitForText(page, '邮箱');

  await page.locator('.mailbox-alert-item[data-mailbox-filter="urgent"]').click();
  await waitForText(page, '我要取消订单并退款');

  await page.locator('button[data-mailbox-filter="medium_risk"]').click();
  await waitForText(page, 'Order status SH-TEST-1001');

  await page.locator('button[data-mailbox-filter="low_risk"]').click();
  await waitForText(page, '已发送资料，请查收');

  await page.locator('button[data-mailbox-filter="spam"]').first().click();
  await page.locator('[data-mailbox-search]').fill('广告外链推广');
  await waitForText(page, 'SEO backlinks 广告外链推广');

  await page.locator('[data-open-settings]').first().click();
  await waitForText(page, '设置');
  await page.locator('[data-settings-primary="system-rules"]').click();
  await waitForText(page, '请选择左侧系统规则项');
  await page.locator('[data-settings-rule="risk"]').click();
  await waitForText(page, '需要管理员权限才能修改规则');
  await page.locator('[data-return-system-rules]').click();
  await waitForText(page, '系统规则');
  await page.locator('[data-settings-primary="email-ai-admin-auth"]').click();
  await waitForText(page, '管理员密码');
  await page.locator('[data-close-settings]').click();

  await page.locator('[data-mailbox-search]').fill('');
  await page.locator('button[data-mailbox-filter="medium_risk"]').click();
  await clickMailRow(page, 'Order status SH-TEST-1001');
  await page.locator('input[name="riskOverride"][value="medium"]').check();
  await page.locator('[data-confirm-risk-override]').click();
  await page.waitForFunction(() => {
    const overrides = JSON.parse(localStorage.getItem('feishu-mail-risk-overrides') || '{}');
    return overrides['MAIL-MEDIUM']?.risk === 'medium';
  });
  await page.locator('.override-choice').filter({ hasText: '恢复系统判定' }).locator('input').check();
  await page.locator('[data-confirm-risk-override]').click();
  await page.waitForFunction(() => {
    const overrides = JSON.parse(localStorage.getItem('feishu-mail-risk-overrides') || '{}');
    return !overrides['MAIL-MEDIUM'] && !overrides['MSG-MEDIUM'];
  });

  await page.locator('button[data-mailbox-filter="low_risk"]').click();
  await clickMailRow(page, '已发送资料，请查收');
  await page.locator('[data-send-selected]').click();
  await page.waitForFunction(
    () => window.__sentReady === true,
    null,
    { timeout: 100 },
  ).catch(() => {});
  assert.equal(
    capturedActions.some((action) => action.path === '/api/feishu/mail/actions/send'),
    true,
    '确认真实发送 should call the send endpoint',
  );

  await page.locator('button[data-mailbox-filter="spam"]:not([data-mailbox-section-toggle])').click();
  await clickMailRow(page, 'SEO backlinks 广告外链推广');
  const archiveButton = page.locator('[data-archive-selected]');
  await archiveButton.waitFor({ state: 'visible', timeout: 2_000 });
  await archiveButton.click();
  assert.equal(
    capturedActions.some((action) => action.path === '/api/feishu/mail/actions/archive'),
    true,
    '归档 / 移箱 should call the archive endpoint',
  );

  await page.locator('button[data-mailbox-filter="medium_risk"]').click();
  await clickMailRow(page, 'Order status SH-TEST-1001');
  await page.locator('[data-manual-archive-toggle]').check();
  await page.locator('[data-confirm-manual-archive]').click();
  const manualArchiveSelections = await readJsonLocalStorage(page, 'feishu-mail-manual-archive-selections');
  assert.equal(manualArchiveSelections['MAIL-MEDIUM']?.checked, true);

  await page.evaluate(async () => {
    localStorage.setItem('email-ai-admin-token', 'admin-secret');
    const root = document.createElement('section');
    root.setAttribute('data-test-email-ai-control-root', '');
    document.body.append(root);
    const module = await import('/src/emailAiControlApp.js?v=skills-ui-test');
    module.mountEmailAIControl(root, {
      embedded: false,
      showAuth: false,
      showHeader: false,
    });
  });
  await waitForText(page, 'Skills 编排');
  await page.locator('[data-test-email-ai-control-root] [data-tab="skills"]').click();
  await waitForText(page, '全球语言自动翻译');
  await waitForText(page, '承诺与责任风险复查');
  await waitForText(page, '自动处理资格判定');
  await waitForText(page, '退款、补发、赔偿');
  await waitForText(page, '执行链路预览');

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log('workbench-ui.test.mjs passed');
} finally {
  await browser.close();
  await server.close();
}
