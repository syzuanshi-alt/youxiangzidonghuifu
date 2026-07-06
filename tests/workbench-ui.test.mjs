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
    id: 'MAIL-COMPLETED',
    messageId: 'MSG-COMPLETED',
    subject: '已完成历史邮件',
    sender: 'done@example.test',
    receivedAt: '2026-06-30 09:25',
    summary: '这封邮件已经由服务端历史状态标记完成。',
    bodyText: 'This message has already been handled.',
    processingStatus: {
      status: 'completed',
      action: 'send',
      label: '已自动回复',
      completedAt: '2026-06-30T01:26:00.000Z',
    },
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
  {
    id: 'MAIL-EN-PLACEHOLDER',
    messageId: 'MSG-EN-PLACEHOLDER',
    subject: 'Inquiry About My Order Status',
    sender: 'english-placeholder@example.test',
    receivedAt: '2026-06-30 09:40',
    summary: '英文订单状态邮件包含中文占位符。',
    bodyText: [
      'Subject: Inquiry About My Order Status Dear Support Team, Hope you’re doing well.',
      'I am writing to check the latest progress of my order.',
      'I placed the purchase a few days ago but haven’t received any update about shipment or delivery yet.',
      'My order number is: [填写订单号]',
      'Purchase date: [下单日期]',
      'Item purchased: [商品名称]',
      'Could you please help me confirm the current status of this order?',
      'If the goods have been dispatched, kindly send me the tracking number as soon as possible.',
      'Should there be any delay or problem with my order, please inform me in detail so I can arrange accordingly.',
      'Looking forward to your prompt reply.',
      'Best regards, [你的姓名] [联系方式]',
    ].join(' '),
  },
  {
    id: 'MAIL-JA-METADATA',
    messageId: 'MSG-JA-METADATA',
    subject: 'Japanese metadata order status',
    sender: 'japanese-metadata@example.test',
    receivedAt: '2026-06-30 09:45',
    summary: '日文订单状态邮件后面混入测试链路元数据。',
    bodyText: [
      '件名： ご注文状況の確認のお願い サポートチーム 各位 お世話になっております。',
      '数日前に商品を注文いたしましたが、発送・配送に関する連絡が届いておりません。',
      'このためメールにて注文状況の確認をお願いいたします。',
      '注文番号: 【注文番号を記入】 注文日: 【注文日】 購入商品: 【商品名】',
      '現在の注文の状況をご確認の上、ご返事をいただけますでしょうか。',
      'もし発送済みの場合は、追跡番号を送付してください。',
      'また、遅延や不具合が発生している場合は、詳しい状況をご説明いただけますと幸いです。',
      'お手数をおかけし恐れ入りますが、早急なご回答をお待ちしております。',
      '> 发件人：赵允雨 <ayu@vitashinelab.com> > 时间：2026年6月13日 (周六) 12:51 > 主题：【工作台联调】ayu 邮箱真实发送测试 > 收件人：<kinglihua@vitashinelab.com> > 本邮件用于确认新应用授权、发送权限和工作台后端链路是否已经打通。',
    ].join(' '),
  },
  {
    id: 'MAIL-PT-DAMAGED',
    messageId: 'MSG-PT-DAMAGED',
    subject: '[TEST][PT][Devolução] Pedido VS-75209 chegou com problema',
    sender: 'portuguese-damaged@example.test',
    receivedAt: '2026-06-30 09:50',
    summary: '葡语退货/换货邮件。',
    bodyText: 'E-MAIL DE TESTE - solicitação de devolução. Olá, Recebi o pedido VS-75209, mas a embalagem chegou danificada. Quero saber quais são os próximos passos para devolver ou trocar o produto. Atenciosamente, Beatriz Almeida',
  },
];

const fixtureNewHighRiskMail = {
  id: 'MAIL-NEW-HIGH',
  messageId: 'MSG-NEW-HIGH',
  subject: '新邮件：客户要求退款',
  sender: 'new-high-risk@example.test',
  receivedAt: '2026-06-30 10:00',
  summary: '新收到客户退款请求。',
  bodyText: '我需要取消这个订单并退款，请尽快处理。',
};

const trendTestNow = new Date();

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function trendTestDate(daysAgo = 0, time = '09:00') {
  const [hour = '09', minute = '00'] = time.split(':');
  const date = new Date(trendTestNow);
  date.setHours(Number(hour), Number(minute), 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

function formatWorkbenchDateTime(date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-') + ` ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function formatWorkbenchDateKey(date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-');
}

function formatTrendLabel(date) {
  return `${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function expectedRecentTrendDates() {
  return Array.from({ length: 7 }, (_, index) => trendTestDate(6 - index, '12:00'));
}

function buildTrendFixtureMails() {
  const daysByMailId = {
    'MAIL-HIGH': 0,
    'MAIL-MEDIUM': 0,
    'MAIL-LOW': 1,
    'MAIL-COMPLETED': 0,
    'MAIL-SPAM': 0,
    'MAIL-EN-PLACEHOLDER': 2,
    'MAIL-JA-METADATA': 3,
    'MAIL-PT-DAMAGED': 4,
  };

  return fixtureMails.map((mail, index) => {
    const daysAgo = daysByMailId[mail.id] ?? index;
    const receivedAt = formatWorkbenchDateTime(trendTestDate(daysAgo, `09:${padDatePart(index)}`));
    return {
      ...mail,
      receivedAt,
      processingStatus: mail.processingStatus
        ? {
          ...mail.processingStatus,
          completedAt: trendTestDate(daysAgo, `10:${padDatePart(index)}`).toISOString(),
        }
        : mail.processingStatus,
    };
  });
}

const writeStatus = {
  writeEnabled: true,
  sendEnabled: true,
  archiveEnabled: true,
  highRiskSendEnabled: true,
  realSendEnabled: true,
  realArchiveEnabled: true,
  autoProcessEnabled: false,
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

async function installApiRoutes(page, capturedActions, options = {}) {
  const authState = {
    account: '',
    password: 'StrongPass123',
    session: '',
  };
  const mailState = options.mailState || {
    mails: fixtureMails,
    failMessages: false,
    onMessagesRequest: null,
  };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/workbench-auth/captcha/config') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          required: true,
          provider: 'turnstile',
          siteKey: 'ui-test-site-key',
        }),
      });
      return;
    }

    if (path === '/api/workbench-auth/me') {
      if (!authState.session) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, message: '请先登录工作台。' }),
        });
        return;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          user: { account: authState.account, createdAt: '2026-07-03T00:00:00.000Z' },
        }),
      });
      return;
    }

    if (path === '/api/workbench-auth/register' || path === '/api/workbench-auth/login' || path === '/api/workbench-auth/reset-password') {
      const payload = JSON.parse(request.postData() || '{}');
      if (!payload.captchaToken) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, message: '请先完成人机真人验证。' }),
        });
        return;
      }
      if (options.authDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.authDelayMs));
      }
      authState.account = String(payload.account || payload.phone || '');
      authState.password = String(payload.newPassword || payload.password || authState.password);
      authState.session = 'ui-test-session';
      await route.fulfill({
        status: path.endsWith('/register') ? 201 : 200,
        contentType: 'application/json',
        headers: {
          'set-cookie': 'workbench_session=ui-test-session; Path=/; HttpOnly; SameSite=Lax',
        },
        body: JSON.stringify({
          ok: true,
          user: { account: authState.account, createdAt: '2026-07-03T00:00:00.000Z' },
        }),
      });
      return;
    }

    if (path === '/api/workbench-auth/change-password') {
      const payload = JSON.parse(request.postData() || '{}');
      if (!authState.session) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, message: '请先登录工作台。' }),
        });
        return;
      }
      if (payload.currentPassword !== authState.password) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, message: '当前密码不正确。' }),
        });
        return;
      }
      authState.password = String(payload.newPassword || '');
      authState.session = 'ui-test-session-changed';
      capturedActions.push({ type: 'change-password', payload });
      await route.fulfill({
        contentType: 'application/json',
        headers: {
          'set-cookie': 'workbench_session=ui-test-session-changed; Path=/; HttpOnly; SameSite=Lax',
        },
        body: JSON.stringify({
          ok: true,
          user: { account: authState.account, createdAt: '2026-07-03T00:00:00.000Z' },
          message: '密码已修改。',
        }),
      });
      return;
    }

    if (path === '/api/workbench-auth/logout') {
      authState.session = '';
      await route.fulfill({
        contentType: 'application/json',
        headers: {
          'set-cookie': 'workbench_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
        },
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (path === '/api/feishu/status') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          configured: true,
          mailboxBound: true,
          messagesLoaded: true,
          fetchedCount: mailState.mails.length,
          sourceStatus: '真实接入',
          statusText: `已接入 · ${mailState.mails.length} 封`,
          note: 'UI 测试拦截的飞书状态。',
          write: writeStatus,
        }),
      });
      return;
    }

    if (path === '/api/feishu/mail/messages') {
      mailState.requestCount = (mailState.requestCount || 0) + 1;
      mailState.onMessagesRequest?.({
        fail: mailState.failMessages === true,
        mails: mailState.mails,
        requestCount: mailState.requestCount,
      });
      if (mailState.failMessages === true) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            message: '模拟飞书读取失败。',
            sourceStatus: '真实接入',
          }),
        });
        return;
      }

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          allPagesFetched: true,
          pageCount: 1,
          cacheStatus: 'fresh',
          sourceStatus: '真实接入',
          messages: [],
          mails: mailState.mails,
        }),
      });
      return;
    }

    if (path === '/api/feishu/config/update') {
      const payload = JSON.parse(request.postData() || '{}');
      capturedActions.push({ type: 'feishu-config-update', payload });
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          action: 'config_update',
          resetAuth: Boolean(payload.resetAuth),
          mailboxBound: Boolean(payload.mailboxAddress),
          updatedKeys: ['tenantMailbox'],
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
      capturedActions.push({ path, payload });
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
            translationZh: isMedium || subject.includes('[PT]') ? '客户在询问订单信息或订单状态。' : '',
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

    if (path === '/api/feishu/mail/actions/send'
      || path === '/api/feishu/mail/actions/archive'
      || path === '/api/feishu/mail/actions/delete') {
      const payload = JSON.parse(request.postData() || '{}');
      capturedActions.push({
        path,
        payload,
      });
      const action = path.endsWith('/archive')
        ? 'archive'
        : path.endsWith('/delete')
          ? 'delete'
          : 'send';
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          action,
          mode: action === 'delete' ? 'soft_delete' : 'ready',
          result: action === 'delete' ? { ok: true, deleted: true } : undefined,
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
const httpErrors = [];
const mailState = {
  mails: buildTrendFixtureMails(),
  failMessages: false,
  onMessagesRequest: null,
  requestCount: 0,
};

function waitForNextMailRequest(predicate = () => true) {
  return new Promise((resolve) => {
    mailState.onMessagesRequest = (event) => {
      if (!predicate(event)) return;
      mailState.onMessagesRequest = null;
      resolve(event);
    };
  });
}

try {
  const page = await browser.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text();
      if (!/Failed to load resource: the server responded with a status of (401|503)/.test(text)) {
        consoleErrors.push(text);
      }
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('response', (response) => {
    const url = response.url();
    const expectedMailReadFailure = response.status() === 503 && url.includes('/api/feishu/mail/messages');
    if (response.status() >= 400 && response.status() !== 401 && !expectedMailReadFailure) {
      httpErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await page.route('https://challenges.cloudflare.com/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/turnstile/v0/api.js')) {
      await route.fulfill({
        contentType: 'application/javascript',
        body: `
          window.turnstile = {
            render: (element, options) => {
              element.dataset.testTurnstileRendered = 'true';
              window.__lastTurnstileOptions = options;
              return 'ui-test-turnstile-widget';
            },
            reset: () => {}
          };
        `,
      });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });

  await installApiRoutes(page, capturedActions, { authDelayMs: 250, mailState });
  await page.addInitScript(() => {
    localStorage.removeItem('email-auto-reply-workbench-accounts');
    localStorage.removeItem('email-auto-reply-workbench-session');
    localStorage.removeItem('email-auto-reply-workbench-sms-codes');
    localStorage.removeItem('email-auto-reply-workbench-remembered-account');
    localStorage.removeItem('email-auto-reply-workbench-remembered-phone');
    localStorage.removeItem('feishu-mail-risk-overrides');
    localStorage.removeItem('feishu-mail-manual-archive-selections');
    localStorage.removeItem('feishu-mail-write-action-results');
    localStorage.setItem('feishu-mail-candidate-selections', JSON.stringify({
      'MAIL-MEDIUM': {
        candidateId: 'OLD-STANDARD',
        content: '旧三版候选回复缓存',
      },
    }));
    localStorage.setItem('feishu-mail-reply-draft-schema-version', 'single-recommended-v1');
    localStorage.setItem('feishu-mail-risk-snapshots', JSON.stringify({
      'MAIL-MEDIUM': {
        risk: 'medium',
        action: 'draft_only',
        replyDraft: '旧风险快照回复',
        replyCandidates: [{ candidateId: 'OLD-SNAPSHOT', content: '旧风险快照回复' }],
      },
    }));
    localStorage.removeItem('feishu-mail-rule-reviews');
  });

  await page.goto(server.origin, { waitUntil: 'domcontentloaded' });
  await waitForText(page, '登录工作台');
  await waitForText(page, '真人验证');
  assert.equal(await page.getByText('本地模拟短信验证码').count(), 0);
  await page.locator('[data-login-mode="reset"]').click();
  await waitForText(page, '重置工作台密码');
  await page.locator('[data-login-mode="create"]').click();
  await page.locator('input[name="account"]').fill('ops.team@example.com');
  await page.locator('input[name="password"]').fill('StrongPass123');
  await page.locator('input[name="inviteCode"]').fill('invite-code');
  await page.locator('input[name="rememberAccount"]').check();
  await page.evaluate(() => {
    document.querySelector('input[name="captchaToken"]').value = 'ui-captcha-token';
    window.__captchaWidgetBeforeSubmit = document.querySelector('[data-turnstile-widget]');
  });
  await page.locator('[data-workbench-login-form]').locator('button[type="submit"]').click();
  await page.waitForTimeout(50);
  const captchaWidgetStayedMounted = await page.evaluate(() => window.__captchaWidgetBeforeSubmit?.isConnected === true);
  assert.equal(captchaWidgetStayedMounted, true);
  await waitForText(page, '数据总览');
  const storedAccounts = await page.evaluate(() => localStorage.getItem('email-auto-reply-workbench-accounts'));
  const storedSmsCodes = await page.evaluate(() => localStorage.getItem('email-auto-reply-workbench-sms-codes'));
  const rememberedPhone = await page.evaluate(() => localStorage.getItem('email-auto-reply-workbench-remembered-account'));
  assert.equal(storedAccounts, null);
  assert.equal(storedSmsCodes, null);
  assert.equal(rememberedPhone, 'ops.team@example.com');
  assert.equal(await page.evaluate(() => localStorage.getItem('feishu-mail-candidate-selections')), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('feishu-mail-reply-draft-schema-version')), 'fact-grounded-replies-v2');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('feishu-mail-risk-snapshots') || '{}')), {});
  const blueTheme = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const overviewPanelStyle = getComputedStyle(document.querySelector('.overview-panel'));
    const primaryButtonStyle = getComputedStyle(document.querySelector('.primary-button'));
    return {
      blue: rootStyle.getPropertyValue('--blue').trim(),
      bodyBackground: bodyStyle.backgroundColor,
      panelBackground: overviewPanelStyle.backgroundColor,
      primaryButtonBackgroundImage: primaryButtonStyle.backgroundImage,
      primaryButtonColor: primaryButtonStyle.color,
    };
  });
  assert.equal(blueTheme.blue, '#1478ff');
  assert.notEqual(blueTheme.bodyBackground, 'rgb(242, 241, 238)');
  assert.notEqual(blueTheme.panelBackground, 'rgb(255, 255, 255)');
  assert.match(blueTheme.primaryButtonBackgroundImage, /(rgb|rgba)\(8, 55, 121/);
  assert.equal(blueTheme.primaryButtonColor, 'rgb(207, 231, 255)');
  await page.locator('.overview-trend-chart').waitFor({ state: 'visible', timeout: 2_000 });
  assert.equal(await page.locator('.overview-trend-bar').count() > 0, true);
  assert.equal(await page.locator('.overview-trend-point').count(), 0);
  await page.locator('.overview-trend-bar .overview-chart-tooltip').first().waitFor({ state: 'attached', timeout: 2_000 });
  assert.match(await page.locator('.overview-trend-bar .overview-chart-tooltip').first().innerText(), /收到邮件：\d+/);
  const expectedTrendDates = expectedRecentTrendDates();
  const expectedTrendLabels = expectedTrendDates.map(formatTrendLabel);
  const expectedTrendKeys = expectedTrendDates.map(formatWorkbenchDateKey);
  assert.deepEqual(await page.locator('.overview-trend-label').allInnerTexts(), expectedTrendLabels);
  const todayKey = expectedTrendKeys.at(-1);
  const yesterdayKey = expectedTrendKeys.at(-2);
  const firstTrendKey = expectedTrendKeys[0];
  const todayReceivedBar = page.locator(`.overview-trend-bar[data-trend-date="${todayKey}"][data-trend-series="received"]`);
  const todayCompletedBar = page.locator(`.overview-trend-bar[data-trend-date="${todayKey}"][data-trend-series="completed"]`);
  const todaySpamBar = page.locator(`.overview-trend-bar[data-trend-date="${todayKey}"][data-trend-series="spam"]`);
  const yesterdayReceivedBar = page.locator(`.overview-trend-bar[data-trend-date="${yesterdayKey}"][data-trend-series="received"]`);
  assert.equal(await todayReceivedBar.getAttribute('data-trend-value'), '4');
  assert.equal(await todayCompletedBar.getAttribute('data-trend-value'), '1');
  assert.equal(await todaySpamBar.getAttribute('data-trend-value'), '1');
  assert.equal(await yesterdayReceivedBar.getAttribute('data-trend-value'), '1');
  assert.equal(await page.locator(`.overview-trend-bar[data-trend-date="${firstTrendKey}"][data-trend-series="received"]`).getAttribute('data-tooltip-align'), 'left');
  assert.equal(await todayReceivedBar.getAttribute('data-tooltip-align'), 'right');
  assert.match(await todayReceivedBar.locator('.overview-chart-tooltip').innerText(), new RegExp(`${expectedTrendLabels.at(-1)} · 收到邮件：4`));
  assert.equal(await page.locator('.overview-distribution-item .overview-chart-tooltip').count(), 4);
  const donutTotalAlignment = await page.locator('.overview-donut').evaluate((donut) => {
    const total = donut.querySelector('.overview-donut-total');
    if (!total) return null;
    const donutRect = donut.getBoundingClientRect();
    const totalRect = total.getBoundingClientRect();
    return {
      centerOffsetX: Math.abs((totalRect.left + totalRect.width / 2) - (donutRect.left + donutRect.width / 2)),
      centerOffsetY: Math.abs((totalRect.top + totalRect.height / 2) - (donutRect.top + donutRect.height / 2)),
      label: total.querySelector('span')?.textContent?.trim() || '',
      value: total.querySelector('strong')?.textContent?.trim() || '',
    };
  });
  assert.notEqual(donutTotalAlignment, null);
  assert.equal(donutTotalAlignment.label, '总计');
  assert.match(donutTotalAlignment.value, /^\d+$/);
  assert.equal(donutTotalAlignment.centerOffsetX <= 1, true);
  assert.equal(donutTotalAlignment.centerOffsetY <= 1, true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForText(page, '数据总览');
  assert.equal(await page.locator('.login-overlay.open').count(), 0);
  await waitForText(page, '我要取消订单并退款');
  const initialAiSubjects = capturedActions
    .filter((action) => action.path === '/api/email-ai/process')
    .map((action) => action.payload.subject);
  assert.equal(initialAiSubjects.includes('已完成历史邮件'), false);
  assert.equal(initialAiSubjects.includes('SEO backlinks 广告外链推广'), false);
  await waitForText(page, '收件箱');
  await waitForText(page, '待处理');
  await waitForText(page, '已处理');
  await waitForText(page, '回收站');
  assert.equal(await page.locator('[data-mailbox-filter="urgent"]').count(), 0);
  assert.equal(await page.locator('[data-mailbox-filter="low_risk"]').count(), 0);
  assert.equal(await page.locator('[data-mailbox-filter="medium_risk"]').count(), 0);
  assert.equal(await page.locator('[data-mailbox-filter="archived"]').count(), 0);
  assert.equal(await page.locator('[data-mailbox-filter="deleted"]').count(), 1);

  const failedMailRead = waitForNextMailRequest((event) => event.fail === true);
  mailState.failMessages = true;
  await page.evaluate(() => window.__workbenchTestHooks.refreshFeishuMessages());
  await failedMailRead;
  await page.waitForTimeout(120);
  assert.equal(
    await page.locator('body').evaluate((body) => body.innerText.includes('我要取消订单并退款')),
    true,
    '邮件接口短暂失败时 should keep the last successful mail list instead of clearing to zero',
  );

  const newMailRead = waitForNextMailRequest((event) => (
    event.fail === false
      && event.mails.some((mail) => mail.id === 'MAIL-NEW-HIGH')
  ));
  mailState.failMessages = false;
  mailState.mails = [
    {
      ...fixtureNewHighRiskMail,
      receivedAt: formatWorkbenchDateTime(trendTestDate(0, '10:00')),
    },
    ...buildTrendFixtureMails(),
  ];
  await page.evaluate(() => window.__workbenchTestHooks.refreshFeishuMessages());
  await newMailRead;
  await page.locator('.mail-toast.is-high').filter({ hasText: '新邮件：客户要求退款' }).waitFor({ state: 'visible', timeout: 3_000 });
  await page.locator('.mail-toast.is-high').filter({ hasText: '高风险' }).waitFor({ state: 'visible', timeout: 1_000 });

  await page.locator('[data-overview-open-settings]').first().click();
  await page.locator('[data-settings-primary="account-session"]').click();
  await waitForText(page, '账号与登录');
  const accountActions = await page.locator('[data-account-session-actions]').evaluate((element) => (
    Array.from(element.querySelectorAll('button, summary')).map((node) => node.textContent.trim())
  ));
  assert.deepEqual(accountActions.slice(0, 3), ['切换账号', '退出登录', '修改密码']);
  assert.equal(await page.locator('[data-account-change-password-form]').isVisible(), false);
  await page.locator('[data-account-password-toggle]').click();
  assert.equal(await page.locator('[data-account-change-password-form]').isVisible(), true);
  await page.locator('[data-account-change-password-form] input[name="currentPassword"]').fill('StrongPass123');
  await page.locator('[data-account-change-password-form] input[name="newPassword"]').fill('ChangedPass123');
  await page.locator('[data-account-change-password-form] input[name="confirmPassword"]').fill('ChangedPass123');
  await page.locator('[data-account-change-password-form] button[type="submit"]').click();
  await waitForText(page, '密码已修改');
  assert.equal(capturedActions.some((item) => item.type === 'change-password' && item.payload.newPassword === 'ChangedPass123'), true);

  await page.locator('[data-settings-primary="mailbox-switcher"]').click();
  await waitForText(page, '邮箱与报告机器人');
  await waitForText(page, '把当前工作台账号和一个飞书邮箱对应起来');
  await waitForText(page, '保存邮箱绑定只保存当前账号的邮箱关系');
  const dailyBindingSection = page.locator('[data-mailbox-binding-basic]');
  assert.equal(await dailyBindingSection.locator('input[name="appId"]').count(), 0);
  assert.equal(await dailyBindingSection.locator('input[name="appSecret"]').count(), 0);
  assert.equal(await dailyBindingSection.locator('input[name="botReportEmail"]').count(), 0);
  assert.equal(await dailyBindingSection.locator('input[name="resetAuth"]').count(), 0);
  await page.locator('[data-mailbox-switch-form] input[name="mailboxAddress"]').fill('newbox@example.com');
  await page.locator('[data-mailbox-switch-form] button[type="submit"]').click();
  await waitForText(page, '配置已保存');
  const normalConfigUpdate = capturedActions.findLast((item) => item.type === 'feishu-config-update');
  assert.equal(normalConfigUpdate.payload.mailboxAddress, 'newbox@example.com');
  assert.equal(normalConfigUpdate.payload.resetAuth, false);
  await page.locator('[data-reset-auth-details]').click();
  await waitForText(page, '只有更换飞书应用、修改报告接收人、授权错了邮箱');
  await waitForText(page, '清空当前账号已保存的飞书 token');
  await waitForText(page, '它不会删除邮件、不会删除账号、不会修改程序代码');
  await page.locator('[data-mailbox-switch-form] input[name="botReportEmail"]').fill('ops-report@example.com');
  await page.locator('[data-save-advanced-mailbox-config]').click();
  await waitForText(page, '高级配置已保存');
  const advancedConfigUpdate = capturedActions.findLast((item) => item.type === 'feishu-config-update');
  assert.equal(advancedConfigUpdate.payload.botReportEmail, 'ops-report@example.com');
  assert.equal(advancedConfigUpdate.payload.resetAuth, false);
  await page.evaluate(() => document.querySelectorAll('.action-notice').forEach((node) => node.remove()));
  await page.locator('[data-advanced-mailbox-config]').evaluate((node) => {
    node.open = true;
  });
  await page.locator('[data-reset-auth-and-save]').click();
  const resetConfigUpdate = capturedActions.findLast((item) => item.type === 'feishu-config-update');
  assert.equal(resetConfigUpdate.payload.mailboxAddress, 'newbox@example.com');
  assert.equal(resetConfigUpdate.payload.resetAuth, true);

  await page.locator('[data-settings-primary="account-session"]').click();
  await waitForText(page, '账号与登录');
  await page.locator('[data-settings-logout-workbench]').click();
  await waitForText(page, '登录工作台');
  await page.locator('[data-login-mode="reset"]').click();
  const resetForm = page.locator('[data-workbench-login-form]');
  await resetForm.locator('input[name="account"]').fill('ops.team@example.com');
  await resetForm.locator('input[name="password"]').fill('ResetPass123');
  await resetForm.locator('input[name="resetCode"]').fill('invite-code');
  await page.evaluate(() => {
    document.querySelector('input[name="captchaToken"]').value = 'ui-reset-captcha-token';
  });
  await page.locator('[data-workbench-login-form]').locator('button[type="submit"]').click();
  await waitForText(page, '数据总览');
  await page.waitForFunction(() => {
    const completedCount = document.querySelector('.overview-stat-card.completed strong')?.textContent || '0';
    return Number(completedCount.replace(/[^\d]/g, '') || 0) > 0;
  });

  await page.locator('.overview-stat-card.completed').click();
  await waitForText(page, '邮箱');
  await waitForText(page, '已完成历史邮件');
  const completedHistoryRow = page.locator('.mail-row').filter({ hasText: '已完成历史邮件' }).first();
  await completedHistoryRow.locator('.status-pill-completed').waitFor({ state: 'visible', timeout: 2_000 });
  assert.match(await completedHistoryRow.innerText(), /已自动回复/);

  await page.locator('[data-mailbox-search]').fill('');
  await page.locator('button[data-mailbox-filter="pending"]').click();
  await waitForText(page, '新邮件：客户要求退款');

  await page.evaluate(() => window.__workbenchTestHooks.setMailboxFilter('all'));
  await waitForText(page, 'Order status SH-TEST-1001');
  await page.locator('[data-mailbox-search]').fill('Inquiry About My Order Status');
  await clickMailRow(page, 'Inquiry About My Order Status');
  const englishPlaceholderOriginalBlock = await page.locator('.mail-original-block').innerText();
  const englishPlaceholderTranslationBlock = await page.locator('.mail-translation-block').innerText();
  assert.match(englishPlaceholderOriginalBlock, /英语/);
  assert.match(englishPlaceholderTranslationBlock, /订单.*最新进展|订单状态/);
  assert.match(englishPlaceholderTranslationBlock, /发货|配送|物流|追踪/);
  assert.match(englishPlaceholderTranslationBlock, /下单日期/);
  assert.match(englishPlaceholderTranslationBlock, /购买商品/);
  assert.doesNotMatch(englishPlaceholderTranslationBlock, /原文已是中文|Subject:|Dear Support Team|Purchase date|Item purchased|Could you please/);

  await page.locator('[data-mailbox-search]').fill('Japanese metadata');
  await clickMailRow(page, 'Japanese metadata order status');
  const japaneseMetadataOriginalBlock = await page.locator('.mail-original-block').innerText();
  const japaneseMetadataTranslationBlock = await page.locator('.mail-translation-block').innerText();
  assert.match(japaneseMetadataOriginalBlock, /日语/);
  assert.doesNotMatch(japaneseMetadataOriginalBlock, /发件人|测试时间|本邮件用于|ayu@|kinglihua/);
  assert.match(japaneseMetadataTranslationBlock, /订单状态|订单的当前状态/);
  assert.match(japaneseMetadataTranslationBlock, /发货|配送|追踪/);
  assert.doesNotMatch(japaneseMetadataTranslationBlock, /原文已是中文|現在の注文|ご返事|発生|詳しい状況|发件人|测试时间|本邮件用于|ayu@|kinglihua/);

  await page.locator('[data-mailbox-search]').fill('Devolução');
  await clickMailRow(page, 'Pedido VS-75209 chegou com problema');
  const portugueseOriginalBlock = await page.locator('.mail-original-block').innerText();
  const portugueseTranslationBlock = await page.locator('.mail-translation-block').innerText();
  assert.match(portugueseOriginalBlock, /葡萄牙语/);
  assert.match(portugueseTranslationBlock, /订单 VS-75209/);
  assert.match(portugueseTranslationBlock, /包装|包裹/);
  assert.match(portugueseTranslationBlock, /损坏/);
  assert.match(portugueseTranslationBlock, /退货|换货/);
  assert.doesNotMatch(portugueseTranslationBlock, /原文已是中文|客户在询问订单信息或订单状态|solicitação|devolução/);
  await page.locator('[data-mailbox-search]').fill('');

  await page.evaluate(() => window.__workbenchTestHooks.setMailboxFilter('pending'));
  await page.locator('[data-mailbox-search]').fill('已发送资料');
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
  const settingsBlueTheme = await page.evaluate(() => {
    const settingsItem = document.querySelector('.settings-primary-item:not(.active)');
    const settingsActiveItem = document.querySelector('.settings-primary-item.active');
    const pick = (element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
        borderColor: style.borderColor,
      };
    };
    return {
      settingsItem: pick(settingsItem),
      settingsActiveItem: pick(settingsActiveItem),
    };
  });
  assert.equal(settingsBlueTheme.settingsItem.backgroundColor, 'rgba(3, 14, 29, 0.68)');
  assert.equal(settingsBlueTheme.settingsItem.color, 'rgb(200, 222, 248)');
  assert.equal(settingsBlueTheme.settingsActiveItem.color, 'rgb(255, 255, 255)');
  await page.locator('[data-close-settings]').click();

  await page.locator('[data-mailbox-search]').fill('');
  await page.evaluate(() => window.__workbenchTestHooks.setMailboxFilter('pending'));
  await page.locator('[data-mailbox-search]').fill('Order status');
  await clickMailRow(page, 'Order status SH-TEST-1001');
  await waitForText(page, '客户原文');
  await waitForText(page, 'Could you check my order status SH-TEST-1001?');
  const mediumTranslationBlock = await page.locator('.mail-translation-block').innerText();
  assert.match(mediumTranslationBlock, /订单状态/);
  assert.match(mediumTranslationBlock, /SH-TEST-1001/);
  assert.doesNotMatch(mediumTranslationBlock, /客户想查订单状态，需要人工确认/);
  await page.locator('input[name="riskOverride"][value="medium"]').check();
  await page.locator('[data-confirm-risk-override]').click();
  await page.waitForFunction(() => {
    const overrides = JSON.parse(localStorage.getItem('feishu-mail-risk-overrides') || '{}');
    return overrides['MAIL-MEDIUM']?.risk === 'medium';
  });
  await page.locator('input[name="riskOverride"][value="spam"]').check();
  await page.locator('[data-confirm-risk-override]').click();
  await page.waitForFunction(() => {
    const overrides = JSON.parse(localStorage.getItem('feishu-mail-risk-overrides') || '{}');
    return overrides['MAIL-MEDIUM']?.risk === 'spam';
  });
  await page.evaluate(() => window.__workbenchTestHooks.setMailboxFilter('spam'));
  await waitForText(page, 'Order status SH-TEST-1001');
  const spamOverrideRow = await page.locator('.mail-row').filter({ hasText: 'Order status SH-TEST-1001' }).first().innerText();
  assert.match(spamOverrideRow, /垃圾邮件/);
  assert.match(spamOverrideRow, /无需处理/);
  assert.doesNotMatch(spamOverrideRow, /待处理/);
  await page.evaluate(() => window.__workbenchTestHooks.setMailboxFilter('pending'));
  await page.waitForFunction(() => ![...document.querySelectorAll('.mail-row')]
    .some((row) => row.textContent.includes('Order status SH-TEST-1001')));
  await page.evaluate(() => window.__workbenchTestHooks.setMailboxFilter('spam'));
  await clickMailRow(page, 'Order status SH-TEST-1001');
  await page.locator('.override-choice').filter({ hasText: '恢复系统判定' }).locator('input').check();
  await page.locator('[data-confirm-risk-override]').click();
  await page.waitForFunction(() => {
    const overrides = JSON.parse(localStorage.getItem('feishu-mail-risk-overrides') || '{}');
    return !overrides['MAIL-MEDIUM'] && !overrides['MSG-MEDIUM'];
  });

  await page.evaluate(() => window.__workbenchTestHooks.setMailboxFilter('pending'));
  await page.locator('[data-mailbox-search]').fill('已发送资料');
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

  await page.evaluate(() => window.__workbenchTestHooks.setMailboxFilter('spam'));
  await clickMailRow(page, 'SEO backlinks 广告外链推广');
  const archiveButton = page.locator('[data-archive-selected]');
  await archiveButton.waitFor({ state: 'visible', timeout: 2_000 });
  await archiveButton.click();
  assert.equal(
    capturedActions.some((action) => action.path === '/api/feishu/mail/actions/archive'),
    true,
    '归档 / 移箱 should call the archive endpoint',
  );
  await page.evaluate(() => window.__workbenchTestHooks.setMailboxFilter('completed'));
  await waitForText(page, 'SEO backlinks 广告外链推广');
  const archivedSpamRow = await page.locator('.mail-row').filter({ hasText: 'SEO backlinks 广告外链推广' }).first().innerText();
  assert.match(archivedSpamRow, /已归档/);
  assert.doesNotMatch(archivedSpamRow, /垃圾邮件/);

  await page.locator('[data-mailbox-search]').fill('');
  await page.evaluate(() => window.__workbenchTestHooks.setMailboxFilter('pending'));
  await page.locator('[data-mailbox-search]').fill('Order status');
  await clickMailRow(page, 'Order status SH-TEST-1001');
  await page.locator('[data-manual-archive-toggle]').check();
  await page.locator('[data-confirm-manual-archive]').click();
  const manualArchiveSelections = await readJsonLocalStorage(page, 'feishu-mail-manual-archive-selections');
  assert.equal(manualArchiveSelections['MAIL-MEDIUM']?.checked, true);
  await page.evaluate(() => window.__workbenchTestHooks.setMailboxFilter('completed'));
  await waitForText(page, 'Order status SH-TEST-1001');
  const manuallyArchivedRow = await page.locator('.mail-row').filter({ hasText: 'Order status SH-TEST-1001' }).first().innerText();
  assert.match(manuallyArchivedRow, /已归档/);
  assert.doesNotMatch(manuallyArchivedRow, /垃圾邮件/);

  await page.locator('[data-mailbox-search]').fill('');
  await page.evaluate(() => window.__workbenchTestHooks.setMailboxFilter('pending'));
  await page.locator('[data-mailbox-search]').fill('我要取消订单');
  await clickMailRow(page, '我要取消订单并退款');
  await page.locator('[data-delete-selected]').click();
  assert.equal(
    capturedActions.some((action) => action.path === '/api/feishu/mail/actions/delete'),
    true,
    '移动到回收站 should call the soft delete endpoint',
  );
  await page.waitForFunction(() => {
    const results = JSON.parse(localStorage.getItem('feishu-mail-write-action-results') || '{}');
    return results['MAIL-HIGH']?.ok === true && results['MAIL-HIGH']?.action === 'delete';
  });
  await page.evaluate(() => window.__workbenchTestHooks.setMailboxFilter('pending'));
  await page.waitForFunction(() => ![...document.querySelectorAll('.mail-row')]
    .some((row) => row.textContent.includes('我要取消订单并退款')));
  await page.evaluate(() => window.__workbenchTestHooks.setMailboxFilter('deleted'));
  await waitForText(page, '我要取消订单并退款');
  const deletedRow = await page.locator('.mail-row').filter({ hasText: '我要取消订单并退款' }).first().innerText();
  assert.match(deletedRow, /已删除/);

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
  assert.deepEqual(httpErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log('workbench-ui.test.mjs passed');
} finally {
  await browser.close();
  await server.close();
}
