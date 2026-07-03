import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  classifyMail,
  summarizeMails,
  validateSamples,
} from '../src/rules.js';
import {
  buildReplyCandidates,
  replyTemplates,
  validateReplyTemplates,
} from '../src/replyTemplates.js';
import {
  buildMailContentView,
  detectCustomerLanguage,
  translateCustomerMessageToChinese,
} from '../src/emailTranslation.js';
import {
  detectMailArrivalSoundEffects,
  normalizeSoundSettings,
  soundEffectsForActionResult,
  soundEffectsForClosedLoopPayload,
} from '../src/soundEffects.js';
import { sampleMails } from '../src/mailSamples.js';
import {
  REVIEW_OPTIONS,
  exportReviewItems,
  summarizeReviews,
  upsertReview,
} from '../src/reviewStore.js';
import {
  buildThreadKey,
  evaluateSendGuard,
  summarizeSendGuards,
} from '../src/sendGuard.js';
import {
  buildSendContextFromFeishuMessages,
  createMockFeishuMessages,
  mapFeishuMessageToMail,
} from '../src/feishuAdapter.js';
import {
  buildDraftRecord,
  buildSendQueueItem,
  summarizeDraftWorkflow,
} from '../src/draftWorkflow.js';
import {
  RISK_OVERRIDE_OPTIONS,
  applyRiskOverrideToMail,
} from '../src/riskOverrides.js';
import {
  API_CONFIG_FIELDS,
  PERMISSION_REQUIREMENTS,
  buildApiReadiness,
  validateApiConfigDraft,
} from '../src/apiConfig.js';
import {
  DEFAULT_AGENT_CONFIG,
  KNOWLEDGE_BASE_OPTIONS,
  MODEL_OPTIONS,
  REPLY_STYLE_OPTIONS,
  buildAgentRuntimeContext,
  normalizeAgentConfig,
  validateAgentConfig,
} from '../src/agentConfig.js';
import {
  DEFAULT_AGENT_GATEWAY_CONFIG,
  buildAgentGatewayInvokeRequest,
  invokeAgentGateway,
  normalizeAgentGatewayConfig,
  normalizeAgentGatewayResponse,
  validateAgentGatewayConfig,
} from '../src/agentGateway.js';
import {
  readJsonPayload,
} from '../src/httpResponse.js';
import {
  verifyWorkbenchCaptcha,
} from '../server/workbenchCaptcha.mjs';
import {
  DEFAULT_FEISHU_API_BASE,
  buildFeishuBatchGetUserIdRequest,
  buildFeishuBotTextMessageRequest,
  buildFeishuCreateMailFolderRequest,
  buildFeishuUserInfoRequest,
  buildFeishuMailFolderListUrl,
  buildFeishuOAuthAuthorizeUrl,
  buildFeishuMessageDetailUrl,
  buildFeishuMailListUrl,
  buildFeishuArchiveMessageRequest,
  buildFeishuRefreshUserAccessTokenRequest,
  buildFeishuSendMessageRequest,
  buildFeishuUserAccessTokenRequest,
  buildPublicFeishuApiStatus,
  buildTenantAccessTokenRequest,
  decodeFeishuBodyText,
  normalizeFeishuMessageDetailResponse,
  normalizeFeishuCreateMailFolderResponse,
  normalizeFeishuBatchGetUserIdResponse,
  normalizeFeishuUserInfoResponse,
  normalizeFeishuMailFolderListResponse,
  normalizeFeishuMailListResponse,
  normalizeFeishuPageSize,
  validateFeishuApiEnv,
} from '../src/feishuApiClient.js';
import {
  buildPublicFeishuWriteStatus,
  buildWriteActionDecision,
  buildWriteAuditEvent,
  summarizeWriteActions,
} from '../src/feishuWriteControls.js';
import {
  buildClosedLoopBatch,
  summarizeClosedLoopItems,
} from '../src/closedLoopWorkflow.js';
import {
  buildAutoProcessingSwitchReminder,
  findAutoProcessingSwitchFailure,
  isAutoProcessingSwitchFailure,
} from '../src/autoProcessingReminder.js';
import {
  chooseProcessingStatus,
} from '../src/processingStatus.js';
import {
  applyManualArchiveSelectionToMail,
  buildManualArchiveCompletionResult,
  confirmManualArchiveSelection,
  upsertManualArchiveSelection,
} from '../src/manualArchive.js';
import {
  LAUNCH_CHECKLIST_ITEMS,
  buildLaunchChecklist,
} from '../src/launchChecklist.js';
import {
  getPublishedEmailAIConfig,
  mapEmailAIResultToWorkbenchMail,
  processEmailWithAI,
} from '../src/lib/email-ai-control/index.js';
import {
  callOpenAIModel,
  testOpenAIConnection,
} from '../src/lib/email-ai-control/model-adapters/openai-adapter.js';
import {
  checkOutputSafety,
} from '../src/lib/email-ai-control/output-safety-checker.js';
import {
  createDefaultEmailAIStore,
} from '../src/lib/email-ai-control/default-config.js';
import {
  renderPrompt,
} from '../src/lib/email-ai-control/prompt-renderer.js';
import {
  createEmailAIStoreRepository,
} from '../src/lib/email-ai-control/store-repository.js';
import {
  BACKEND_MANAGEMENT_SECTION_KEYS,
  MAIN_WORKBENCH_SECTION_KEYS,
  SETTINGS_COMMANDS,
  SETTINGS_PRIMARY_NAV,
  SETTINGS_SECTION_GROUPS,
  findSettingsCommand,
  findSettingsPrimary,
  flattenSettingsSectionKeys,
  isBackendManagementSection,
  listSettingsCommandsForPrimary,
  listSettingsCommandSectionKeys,
} from '../src/settingsSections.js';
import { orderSamples } from '../src/orderSamples.js';
import {
  DATA_SOURCE_STATUSES,
  buildBossDashboard,
} from '../src/bossDashboard.js';
import * as workbenchFilters from '../src/workbenchFilters.js';
import {
  getMailRiskState,
  normalizeMailRiskSnapshot,
  shouldReplaceStableRiskSnapshot,
} from '../src/riskState.js';
import {
  BOSS_DASHBOARD_API_VERSION,
  buildBossDashboardPayload,
} from '../src/bossDashboardApi.js';
import {
  createFeishuApiServer,
  isCliEntryPoint,
  resolveWorkbenchDataRoot,
} from '../server/feishuApiServer.mjs';
import {
  createWorkbenchAuthStore,
} from '../server/workbenchAuthStore.mjs';
import {
  mergeLocalEnv,
  parseEnvContent,
} from '../server/envLoader.mjs';

const {
  WORKBENCH_FILTERS,
  buildWorkbenchFilterMetrics,
  filterWorkbenchMails,
  getWorkbenchProcessingStatus,
  normalizeWorkbenchFilter,
} = workbenchFilters;

await assert.rejects(
  () => readJsonPayload({
    headers: { get: () => 'text/html; charset=utf-8' },
    text: async () => '<!DOCTYPE html><html><body>not api</body></html>',
    json: async () => {
      throw new Error('should not parse non-json response');
    },
  }, '管理员密码验证失败。'),
  /本地控制服务未启动或接口不可用/,
);

assert.deepEqual(MAIN_WORKBENCH_SECTION_KEYS, [
  'risk-summary',
  'left-mail-list',
  'mail-detail',
  'settings-dock',
]);
assert.deepEqual(RISK_OVERRIDE_OPTIONS.map((option) => option.risk), [
  'high',
  'medium',
  'low',
  'spam',
]);
assert.ok(isBackendManagementSection('loop-control'));
assert.ok(!isBackendManagementSection('email-ai-status'));
assert.ok(!isBackendManagementSection('api-config'));
assert.ok(!isBackendManagementSection('safety-check'));
assert.ok(!isBackendManagementSection('launch-checklist'));
assert.ok(!isBackendManagementSection('agent-config'));
assert.ok(!isBackendManagementSection('knowledge-library'));
assert.ok(!isBackendManagementSection('risk-rule-library'));
assert.ok(!isBackendManagementSection('mail-detail'));
assert.deepEqual(flattenSettingsSectionKeys(SETTINGS_SECTION_GROUPS), BACKEND_MANAGEMENT_SECTION_KEYS);
assert.equal(new Set(BACKEND_MANAGEMENT_SECTION_KEYS).size, BACKEND_MANAGEMENT_SECTION_KEYS.length);
assert.deepEqual(
  SETTINGS_COMMANDS.map((command) => command.key),
  [
    'account-session',
    'loop-control',
    'mailbox-switcher',
    'email-ai-admin-auth',
    'email-ai-models',
    'email-ai-skills',
    'email-ai-versions',
    'email-ai-test',
    'review-export',
    'report-view',
  ],
);
assert.ok(SETTINGS_COMMANDS.every((command) => command.label && command.summary && command.sectionKey));
assert.deepEqual(
  SETTINGS_COMMANDS.filter((command) => command.adminOnly).map((command) => command.emailAITab),
  ['models', 'skills', 'versions', 'test'],
);
assert.equal(listSettingsCommandSectionKeys().includes('email-ai-status'), false);
assert.equal(findSettingsCommand('loop-control').label, '自动处理开关');
assert.equal(findSettingsCommand('report-view').label, '处理报告');
assert.equal(findSettingsCommand('missing-command').key, SETTINGS_COMMANDS[0].key);
assert.deepEqual(
  SETTINGS_PRIMARY_NAV.map((item) => item.key),
  [
    'account-session',
    'loop-control',
    'mailbox-switcher',
    'email-ai-admin-auth',
    'review-export',
    'report-view',
  ],
);
assert.ok(SETTINGS_PRIMARY_NAV.every((item) => item.label && item.summary && item.sectionKey));
assert.deepEqual(
  SETTINGS_PRIMARY_NAV.find((item) => item.key === 'email-ai-admin-auth').commandKeys,
  ['email-ai-admin-auth', 'email-ai-models', 'email-ai-skills', 'email-ai-versions', 'email-ai-test'],
);
assert.deepEqual(
  listSettingsCommandsForPrimary('loop-control').map((command) => command.key),
  ['loop-control'],
);
assert.deepEqual(
  listSettingsCommandsForPrimary('email-ai-admin-auth').map((command) => command.key),
  ['email-ai-admin-auth', 'email-ai-models', 'email-ai-skills', 'email-ai-versions', 'email-ai-test'],
);
assert.deepEqual(listSettingsCommandsForPrimary('general'), []);
assert.equal(findSettingsPrimary('email-ai-status').label, SETTINGS_PRIMARY_NAV[0].label);
assert.equal(findSettingsPrimary('missing-primary').key, SETTINGS_PRIMARY_NAV[0].key);

assert.deepEqual(normalizeSoundSettings({ enabled: true }), { enabled: true });
assert.deepEqual(normalizeSoundSettings({ enabled: 'true' }), { enabled: false });
assert.deepEqual(
  detectMailArrivalSoundEffects({
    previousIds: new Set(['MAIL-001']),
    currentMails: [
      { id: 'MAIL-001', risk: 'low' },
      { id: 'MAIL-002', risk: 'low' },
    ],
    baselineReady: true,
  }),
  ['mail_received'],
);
assert.deepEqual(
  detectMailArrivalSoundEffects({
    previousIds: new Set(['MAIL-001']),
    currentMails: [
      { id: 'MAIL-001', risk: 'low' },
      { id: 'MAIL-003', risk: 'high' },
    ],
    baselineReady: true,
  }),
  ['high_risk'],
);
assert.deepEqual(
  detectMailArrivalSoundEffects({
    previousIds: new Set(),
    currentMails: [{ id: 'MAIL-INIT', risk: 'high' }],
    baselineReady: false,
  }),
  [],
);
assert.deepEqual(soundEffectsForActionResult({ ok: true, action: 'send' }), ['send_success']);
assert.deepEqual(soundEffectsForActionResult({ ok: true, action: 'archive' }), ['archive_success']);
assert.deepEqual(soundEffectsForActionResult({ ok: true, action: 'manual_archive' }), ['archive_success']);
assert.deepEqual(soundEffectsForActionResult({ ok: false, action: 'send' }), ['action_failed']);
assert.deepEqual(
  soundEffectsForClosedLoopPayload({
    ok: true,
    items: [
      { status: 'sent', operation: 'auto_send' },
      { status: 'archived', operation: 'auto_archive' },
    ],
  }),
  ['send_success', 'archive_success'],
);
assert.deepEqual(
  soundEffectsForClosedLoopPayload({
    ok: true,
    items: [{ status: 'blocked', operation: 'auto_send_disabled' }],
  }),
  ['action_failed'],
);

const manualArchiveStore = upsertManualArchiveSelection({}, {
  mailId: 'manual-archive-001',
  checked: true,
  note: '人工判断不需要回复，直接归档。',
});
assert.equal(manualArchiveStore['manual-archive-001'].checked, true);

const manuallyArchivedMail = applyManualArchiveSelectionToMail(classifyMail({
  id: 'manual-archive-001',
  messageId: 'manual-archive-001',
  subject: '普通流程咨询',
  sender: 'buyer-manual@example.test',
  summary: '客户询问普通处理流程，但人工判断本封无需回复。',
}), manualArchiveStore);
assert.equal(manuallyArchivedMail.manualArchive.checked, true);
assert.equal(manuallyArchivedMail.action, 'ignore');
assert.equal(manuallyArchivedMail.risk, 'spam');
assert.equal(manuallyArchivedMail.requiresReview, false);

const manuallyArchivedDraft = buildDraftRecord(manuallyArchivedMail);
const manuallyArchivedQueue = buildSendQueueItem(manuallyArchivedMail, manuallyArchivedDraft, {
  mode: 'ignored',
  allowed: false,
  reasons: ['人工选择归档。'],
});
assert.equal(manuallyArchivedQueue.queueStatus, 'ignored');
assert.equal(manuallyArchivedQueue.canEnterQueue, false);
const manualArchiveCompletion = buildManualArchiveCompletionResult(manuallyArchivedMail, {
  message: '服务端归档未开启，已先在工作台标记为手动归档。',
  updatedAt: '2026-06-15T00:00:00.000Z',
});
assert.equal(manualArchiveCompletion.ok, true);
assert.equal(manualArchiveCompletion.action, 'manual_archive');
assert.equal(manualArchiveCompletion.mode, 'local_manual_archive');
assert.match(manualArchiveCompletion.message, /手动归档/);
const confirmedManualArchive = confirmManualArchiveSelection({}, manuallyArchivedMail, {
  checked: true,
  note: '人工判断不需要回复，直接归档。',
  updatedAt: '2026-06-15T00:00:00.000Z',
});
assert.equal(confirmedManualArchive.selections['manual-archive-001'].checked, true);
assert.equal(confirmedManualArchive.result.action, 'manual_archive');
assert.match(confirmedManualArchive.result.message, /手动归档完成/);
const clearedManualArchive = confirmManualArchiveSelection(confirmedManualArchive.selections, manuallyArchivedMail, {
  checked: false,
  note: '',
  updatedAt: '2026-06-15T00:00:00.000Z',
});
assert.equal(clearedManualArchive.selections['manual-archive-001'], undefined);
assert.equal(clearedManualArchive.result, null);

const resultFocusedDashboard = buildBossDashboard({
  mails: [
    {
      id: 'boss-low-001',
      messageId: 'boss-low-001',
      subject: '已收到资料',
      sender: 'buyer-result@example.test',
      summary: '客户只希望确认邮件已收到。',
    },
    {
      id: 'boss-high-001',
      messageId: 'boss-high-001',
      subject: 'I want a refund',
      sender: 'buyer-risk@example.test',
      summary: '客户明确要求退款。',
    },
  ],
});
assert.equal(resultFocusedDashboard.processingReport.resultSummary.totalMailCount, 2);
assert.equal(resultFocusedDashboard.processingReport.resultSummary.highRiskCount, 1);
assert.ok(resultFocusedDashboard.processingReport.resultSummary.bossConclusion.includes('需要老板关注'));
assert.ok(resultFocusedDashboard.processingReport.executiveItems.length <= 5);

const lowRisk = classifyMail({
  subject: '我想查询订单',
  sender: 'buyer002@example.test',
  summary: '客户要查订单，但是没有提供订单号或下单邮箱。',
});

assert.equal(lowRisk.action, 'auto_reply');
assert.equal(lowRisk.risk, 'low');
assert.equal(lowRisk.requiresReview, false);
assert.equal(lowRisk.allowsRealSend, false);
assert.equal(lowRisk.templateId, 'TPL-ORDER-MISSING-001');
assert.equal(lowRisk.templateSource, 'replyTemplates');
assert.match(lowRisk.replyDraft, /订单号|下单邮箱/);
assert.equal(lowRisk.lane, 'green');
assert.equal(lowRisk.replyCandidates.length, 1);
assert.equal(lowRisk.replyCandidates[0].editable, true);
assert.equal(lowRisk.replyCandidates[0].sendable, true);
assert.equal(lowRisk.replyCandidates[0].allowsRealSend, false);
assert.equal(lowRisk.replyCandidates[0].language, 'zh');
assert.match(lowRisk.replyCandidates[0].contentZh, /订单号|下单邮箱/);

const translatedOrderMessage = translateCustomerMessageToChinese('Hello, I want to check my order status but I do not have the order number.');
assert.match(translatedOrderMessage.text, /订单/);
assert.equal(translatedOrderMessage.source, 'local_fallback');
const translatedMailView = buildMailContentView({
  subject: 'Where is my package?',
  bodyText: 'Hi, could you help me check the tracking number and shipping status?',
});
assert.match(translatedMailView.original, /tracking number/);
assert.match(translatedMailView.translation, /物流|包裹|运输|快递/);
assert.equal(translatedMailView.translationSource, 'local_fallback');
const englishWrongColorBody = 'Hello, I received the wrong color watch. Can you exchange it for the black one?';
const translatedEnglishWrongColor = translateCustomerMessageToChinese(englishWrongColorBody);
assert.equal(translatedEnglishWrongColor.language.code, 'en');
assert.match(translatedEnglishWrongColor.text, /错误颜色|颜色不对|不同颜色/);
assert.match(translatedEnglishWrongColor.text, /手表/);
assert.match(translatedEnglishWrongColor.text, /黑色/);
assert.match(translatedEnglishWrongColor.text, /换/);
assert.doesNotMatch(translatedEnglishWrongColor.text, /客户在询问|客户提到|意图|方向/);
const japaneseWrongColorBody = 'こんにちは。注文した時計と違う色の商品が届きました。黒に交換できますか。';
const translatedJapaneseWrongColor = translateCustomerMessageToChinese(japaneseWrongColorBody);
assert.equal(translatedJapaneseWrongColor.language.code, 'ja');
assert.match(translatedJapaneseWrongColor.text, /订购|订单/);
assert.match(translatedJapaneseWrongColor.text, /手表|商品/);
assert.match(translatedJapaneseWrongColor.text, /不同颜色|颜色不对|错误颜色/);
assert.match(translatedJapaneseWrongColor.text, /黑色/);
assert.match(translatedJapaneseWrongColor.text, /换/);
assert.doesNotMatch(translatedJapaneseWrongColor.text, /客户在询问|客户提到|意图|方向/);
const replyAnalysisShouldNotOverrideBodyTranslation = buildMailContentView({
  subject: 'Wrong color',
  bodyText: englishWrongColorBody,
  aiResult: {
    reply: {
      translationZh: '客户想换货，需要人工确认。',
    },
  },
});
assert.notEqual(replyAnalysisShouldNotOverrideBodyTranslation.translation, '客户想换货，需要人工确认。');
assert.match(replyAnalysisShouldNotOverrideBodyTranslation.translation, /黑色/);
assert.match(replyAnalysisShouldNotOverrideBodyTranslation.translation, /换/);
const englishOrderStatusWithChinesePlaceholders = [
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
].join(' ');
assert.equal(detectCustomerLanguage(englishOrderStatusWithChinesePlaceholders).code, 'en');
const englishOrderStatusView = buildMailContentView({
  bodyText: englishOrderStatusWithChinesePlaceholders,
  aiResult: {
    reply: {
      translationZh: '客户想查询订单状态，需要人工确认。',
    },
  },
});
assert.equal(englishOrderStatusView.customerLanguage.code, 'en');
assert.notEqual(englishOrderStatusView.translationSource, 'original_zh');
assert.match(englishOrderStatusView.translation, /订单.*最新进展|订单状态/);
assert.match(englishOrderStatusView.translation, /发货|配送|物流|追踪|追踪编号|追踪号码/);
assert.match(englishOrderStatusView.translation, /下单日期/);
assert.match(englishOrderStatusView.translation, /购买商品/);
assert.match(englishOrderStatusView.translation, /当前状态/);
assert.doesNotMatch(englishOrderStatusView.translation, /\.。/);
assert.doesNotMatch(englishOrderStatusView.translation, /Customer|Subject:|Dear Support Team|Purchase date|Item purchased|Could you please|客户想查询订单状态，需要人工确认/);
const japaneseOrderStatusWithMetadata = [
  '件名： ご注文状況の確認のお願い サポートチーム 各位 お世話になっております。',
  '数日前に商品を注文いたしましたが、発送・配送に関する連絡が届いておりません。',
  'このためメールにて注文状況の確認をお願いいたします。',
  '注文番号: 【注文番号を記入】 注文日: 【注文日】 購入商品: 【商品名】',
  '現在の注文の状況をご確認の上、ご返事をいただけますでしょうか。',
  'もし発送済みの場合は、追跡番号を送付してください。',
  'また、遅延や不具合が発生している場合は、詳しい状況をご説明いただけますと幸いです。',
  'お手数をおかけし恐れ入りますが、早急なご回答をお待ちしております。',
  '> 发件人：赵允雨 <ayu@vitashinelab.com> > 时间：2026年6月13日 (周六) 12:51 > 主题：【工作台联调】ayu 邮箱真实发送测试 > 收件人：<kinglihua@vitashinelab.com> > 本邮件用于确认新应用授权、发送权限和工作台后端链路是否已经打通。',
].join(' ');
const japaneseOrderStatusView = buildMailContentView({
  bodyText: japaneseOrderStatusWithMetadata,
});
assert.equal(japaneseOrderStatusView.customerLanguage.code, 'ja');
assert.notEqual(japaneseOrderStatusView.translationSource, 'original_zh');
assert.match(japaneseOrderStatusView.translation, /订单状态|订单的当前状态/);
assert.match(japaneseOrderStatusView.translation, /发货|配送|追踪/);
assert.doesNotMatch(japaneseOrderStatusView.original, /发件人|测试时间|本邮件用于|ayu@|kinglihua/);
assert.doesNotMatch(japaneseOrderStatusView.translation, /現在の注文|ご返事|発生|詳しい状況|発件人|发件人|测试时间|本邮件用于|ayu@|kinglihua/);
const portugueseReturnBody = 'E-MAIL DE TESTE - solicitação de devolução. Olá, Recebi o pedido VS-75209, mas a embalagem chegou danificada. Quero saber quais são os próximos passos para devolver ou trocar o produto. Atenciosamente, Beatriz Almeida';
const portugueseReturnView = buildMailContentView({
  bodyText: portugueseReturnBody,
  customerLanguage: { code: 'zh', label: '中文' },
  aiResult: {
    customerLanguage: { code: 'zh', label: '中文' },
    reply: {
      translationZh: '客户在询问订单信息或订单状态。',
    },
  },
});
assert.equal(detectCustomerLanguage(portugueseReturnBody).code, 'pt');
assert.equal(portugueseReturnView.customerLanguage.code, 'pt');
assert.match(portugueseReturnView.translation, /订单 VS-75209/);
assert.match(portugueseReturnView.translation, /包装|包裹/);
assert.match(portugueseReturnView.translation, /损坏/);
assert.match(portugueseReturnView.translation, /退货|换货/);
assert.doesNotMatch(portugueseReturnView.translation, /客户在询问|订单信息或订单状态|E-MAIL DE TESTE|solicitação|devolução/);
const multilingualReturnSamples = [
  ['es', 'Hola, recibí el pedido VS-75209, pero el paquete llegó dañado. Quiero saber los próximos pasos para devolver o cambiar el producto.'],
  ['fr', 'Bonjour, j’ai reçu la commande VS-75209, mais le colis est arrivé endommagé. Je voudrais connaître les prochaines étapes pour retourner ou échanger le produit.'],
  ['de', 'Hallo, ich habe die Bestellung VS-75209 erhalten, aber die Verpackung ist beschädigt angekommen. Ich möchte wissen, wie ich das Produkt zurückgeben oder umtauschen kann.'],
  ['it', 'Ciao, ho ricevuto l’ordine VS-75209, ma il pacco è arrivato danneggiato. Vorrei sapere i prossimi passaggi per restituire o cambiare il prodotto.'],
  ['nl', 'Hallo, ik heb bestelling VS-75209 ontvangen, maar het pakket is beschadigd aangekomen. Ik wil weten wat de volgende stappen zijn om het product te retourneren of om te ruilen.'],
  ['tr', 'Merhaba, VS-75209 siparişini teslim aldım, ancak paket hasarlı geldi. Ürünü iade etmek veya değiştirmek için sonraki adımları öğrenmek istiyorum.'],
  ['vi', 'Xin chào, tôi đã nhận đơn hàng VS-75209 nhưng gói hàng bị hư hỏng khi giao đến. Tôi muốn biết các bước tiếp theo để trả hàng hoặc đổi sản phẩm.'],
  ['id', 'Halo, saya menerima pesanan VS-75209 tetapi kemasannya rusak. Saya ingin tahu langkah berikutnya untuk mengembalikan atau menukar produk.'],
];
multilingualReturnSamples.forEach(([expectedLanguage, body]) => {
  const view = buildMailContentView({ bodyText: body });
  assert.equal(view.customerLanguage.code, expectedLanguage);
  assert.match(view.translation, /VS-75209/);
  assert.match(view.translation, /损坏/);
  assert.match(view.translation, /退货|换货/);
  assert.doesNotMatch(view.translation, /客户在询问|客户提到|Customer|summary/i);
});
const unsupportedForeignView = buildMailContentView({
  bodyText: 'Dette er en testmelding om en ukjent situasjon som ikke har en lokal oversettelsesmal.',
});
assert.doesNotMatch(unsupportedForeignView.translation, /客户在询问|客户提到|客户反馈|客户请求/);
assert.match(unsupportedForeignView.translation, /暂未生成可靠中文全文翻译/);
assert.equal(detectCustomerLanguage('Hola, necesito ayuda con mi pedido.').code, 'es');
assert.equal(detectCustomerLanguage('Bonjour, ou est ma commande ?').code, 'fr');
assert.equal(detectCustomerLanguage('こんにちは、注文を確認したいです。').code, 'ja');
const spanishMailView = buildMailContentView({
  bodyText: 'Hola, necesito ayuda con mi pedido y el envio.',
});
assert.equal(spanishMailView.customerLanguage.code, 'es');
assert.match(spanishMailView.translation, /西班牙语|订单|物流|运输/);
const spanishReplyCandidates = buildReplyCandidates({
  template: replyTemplates.find((template) => template.templateId === 'TPL-ORDER-MISSING-001'),
  action: 'auto_reply',
  risk: 'low',
  customerLanguage: detectCustomerLanguage('Hola, necesito ayuda con mi pedido.'),
});
assert.equal(spanishReplyCandidates[0].language, 'es');
assert.match(spanishReplyCandidates[0].content, /Hola|pedido|Gracias/i);

assert.ok(MODEL_OPTIONS.length >= 3);
assert.ok(REPLY_STYLE_OPTIONS.some((option) => option.value === 'conservative'));
assert.ok(KNOWLEDGE_BASE_OPTIONS.some((option) => option.id === 'forbiddenExpressions'));
assert.equal(DEFAULT_AGENT_CONFIG.realModelConnected, false);

const normalizedAgentConfig = normalizeAgentConfig({
  modelId: 'openai-compatible',
  replyStyle: 'detailed',
  knowledgeBaseIds: ['productKnowledge'],
});
assert.equal(normalizedAgentConfig.modelId, 'openai-compatible');
assert.equal(normalizedAgentConfig.replyStyle, 'detailed');
assert.ok(normalizedAgentConfig.knowledgeBaseIds.includes('forbiddenExpressions'));
assert.deepEqual(validateAgentConfig(normalizedAgentConfig), []);

const unsafeAgentConfig = normalizeAgentConfig({
  modelId: 'unknown-model',
  replyStyle: 'unknown-style',
  knowledgeBaseIds: [],
});
assert.equal(unsafeAgentConfig.modelId, DEFAULT_AGENT_CONFIG.modelId);
assert.equal(unsafeAgentConfig.replyStyle, DEFAULT_AGENT_CONFIG.replyStyle);
assert.ok(unsafeAgentConfig.knowledgeBaseIds.includes('forbiddenExpressions'));

const agentRuntimeContext = buildAgentRuntimeContext(normalizedAgentConfig);
assert.equal(agentRuntimeContext.realModelConnected, false);
assert.equal(agentRuntimeContext.sourceStatus, '本地配置 / API 待接入');
assert.ok(agentRuntimeContext.knowledgeBaseLabels.includes('产品知识'));
assert.ok(agentRuntimeContext.knowledgeBaseLabels.includes('禁用表达'));

const detailedLowRisk = classifyMail({
  subject: '普通资料咨询',
  sender: 'buyer090@example.test',
  summary: '客户询问普通资料和处理流程，没有订单、退款或投诉诉求。',
}, {
  agentConfig: normalizedAgentConfig,
});
assert.equal(detailedLowRisk.replyCandidates[0].agent.modelId, 'openai-compatible');
assert.equal(detailedLowRisk.replyCandidates[0].agent.replyStyle, 'detailed');
assert.match(detailedLowRisk.replyCandidates[0].content, /补充|订单号|资料|流程/);

assert.equal(DEFAULT_AGENT_GATEWAY_CONFIG.enabled, false);
const externalAgentConfig = normalizeAgentGatewayConfig({
  enabled: true,
  baseUrl: ' https://agents.example.com/ ',
  agentId: ' english-email-cs-agent ',
  timeoutMs: 50_000,
  apiKey: 'should-not-be-kept',
});
assert.equal(externalAgentConfig.baseUrl, 'https://agents.example.com');
assert.equal(externalAgentConfig.agentId, 'english-email-cs-agent');
assert.equal(externalAgentConfig.timeoutMs, 30_000);
assert.equal(Object.hasOwn(externalAgentConfig, 'apiKey'), false);
assert.deepEqual(validateAgentGatewayConfig(externalAgentConfig), []);
assert.ok(validateAgentGatewayConfig({
  ...externalAgentConfig,
  baseUrl: 'http://agents.example.com',
}).some((issue) => issue.includes('HTTPS')));
assert.ok(validateAgentGatewayConfig({
  ...externalAgentConfig,
  agentId: '',
}).some((issue) => issue.includes('agentId')));

const invokeRequest = buildAgentGatewayInvokeRequest({
  config: externalAgentConfig,
  mail: lowRisk,
  agentConfig: normalizedAgentConfig,
});
assert.equal(invokeRequest.url, 'https://agents.example.com/agents/english-email-cs-agent/invoke');
assert.equal(invokeRequest.method, 'POST');
assert.equal(invokeRequest.payload.scene, 'email_auto_reply');
assert.equal(invokeRequest.payload.input.subject, lowRisk.subject);
assert.equal(invokeRequest.payload.options.language, 'en');
assert.equal(invokeRequest.payload.options.tone, 'natural_customer_service');
assert.equal(invokeRequest.payload.context.currentProjectRole, 'caller_only');
assert.equal(JSON.stringify(invokeRequest.payload).includes('should-not-be-kept'), false);

const normalizedGatewayResponse = normalizeAgentGatewayResponse({
  status: 'success',
  outputs: [
    {
      type: 'reply_candidate',
      label: 'Conversational English reply',
      content: 'Hi there, thanks for reaching out. Could you send us your order number?',
      confidence: 0.91,
      requiresReview: false,
      sendable: true,
    },
  ],
  safety: { blocked: false, flags: [] },
}, {
  mail: lowRisk,
  config: externalAgentConfig,
});
assert.equal(normalizedGatewayResponse.candidates.length, 1);
assert.equal(normalizedGatewayResponse.candidates[0].source, 'agent_gateway');
assert.equal(normalizedGatewayResponse.candidates[0].agent.agentId, 'english-email-cs-agent');
assert.equal(normalizedGatewayResponse.candidates[0].allowsRealSend, false);
assert.equal(normalizedGatewayResponse.candidates[0].sendable, true);
assert.match(normalizedGatewayResponse.candidates[0].content, /Hi there/);

const invokedGateway = await invokeAgentGateway({
  config: externalAgentConfig,
  mail: lowRisk,
  agentConfig: normalizedAgentConfig,
  fetchImpl: async (url, options) => {
    assert.equal(url, invokeRequest.url);
    assert.equal(options.method, 'POST');
    const payload = JSON.parse(options.body);
    assert.equal(payload.input.riskContext.risk, 'low');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        outputs: [
          {
            type: 'reply_candidate',
            content: 'Hi there, thanks for reaching out. Please send your order number.',
            confidence: 0.88,
          },
        ],
      }),
    };
  },
});
assert.equal(invokedGateway.ok, true);
assert.equal(invokedGateway.candidates[0].requiresReview, false);
assert.equal(invokedGateway.candidates[0].source, 'agent_gateway');

const draftOnly = classifyMail({
  subject: 'Order SH-TEST-1001 status',
  sender: 'buyer004@example.test',
  summary: '客户提供测试订单号，询问订单状态。',
});

assert.equal(draftOnly.action, 'draft_only');
assert.equal(draftOnly.risk, 'medium');
assert.equal(draftOnly.requiresReview, true);
assert.equal(draftOnly.allowsRealSend, false);
assert.equal(draftOnly.templateId, 'TPL-ORDER-STATUS-001');
assert.equal(draftOnly.templateSource, 'replyTemplates');
assert.match(draftOnly.reason, /核对订单/);
assert.equal(draftOnly.lane, 'orange');
assert.equal(draftOnly.replyCandidates.length, 3);
assert.deepEqual(
  draftOnly.replyCandidates.map((candidate) => candidate.variant),
  ['conservative', 'standard', 'detailed'],
);
assert.ok(draftOnly.replyCandidates.every((candidate) => candidate.editable));
assert.ok(draftOnly.replyCandidates.every((candidate) => candidate.requiresReview));
assert.ok(draftOnly.replyCandidates.every((candidate) => candidate.allowsRealSend === false));

assert.deepEqual(RISK_OVERRIDE_OPTIONS.map((option) => option.risk), ['high', 'medium', 'low', 'spam']);
const manuallyLowRisk = applyRiskOverrideToMail(draftOnly, {
  risk: 'low',
  note: '人工确认只是基础询单，可自动回复。',
  source: 'manual',
  updatedAt: '2026-06-13T00:00:00.000Z',
});
assert.equal(manuallyLowRisk.risk, 'low');
assert.equal(manuallyLowRisk.action, 'auto_reply');
assert.equal(manuallyLowRisk.requiresReview, false);
assert.equal(manuallyLowRisk.riskOverride.risk, 'low');
assert.match(manuallyLowRisk.reason, /人工改判/);
assert.ok(manuallyLowRisk.replyCandidates.length >= 1);
assert.ok(manuallyLowRisk.replyCandidates.every((candidate) => candidate.requiresReview === false));
assert.equal(getWorkbenchProcessingStatus(manuallyLowRisk).status, 'completed');
assert.match(getWorkbenchProcessingStatus(manuallyLowRisk).label, /低风险自动回复/);

const blocked = classifyMail({
  subject: 'I want a refund',
  sender: 'buyer008@example.test',
  summary: '客户明确要求退款。',
});

assert.equal(blocked.action, 'blocked');
assert.equal(blocked.risk, 'high');
assert.equal(blocked.requiresReview, true);
assert.equal(blocked.allowsRealSend, false);
assert.equal(blocked.templateId, null);
assert.equal(blocked.templateSource, 'blocked');
assert.equal(blocked.replyDraft, '');
assert.match(blocked.reason, /高风险/);
assert.equal(blocked.lane, 'red');
assert.ok(blocked.replyCandidates.length >= 1);
assert.ok(blocked.replyCandidates.every((candidate) => candidate.editable));
assert.ok(blocked.replyCandidates.every((candidate) => candidate.sendable === false));
assert.ok(blocked.replyCandidates.every((candidate) => candidate.allowsRealSend === false));

const spam = classifyMail({
  subject: 'SEO backlinks and limited-time promotion',
  sender: 'promo001@example.test',
  summary: '广告推广、外链、群发营销，不涉及真实客户咨询。',
});

assert.equal(spam.action, 'ignore');
assert.equal(spam.risk, 'spam');
assert.equal(spam.lane, 'white');
assert.equal(spam.requiresReview, false);
assert.equal(spam.allowsRealSend, false);
assert.equal(spam.templateId, null);
assert.equal(spam.templateSource, 'spam');
assert.equal(spam.replyDraft, '');
assert.equal(spam.replyCandidates.length, 0);
assert.match(spam.reason, /垃圾|骚扰|广告/);

const autoReplyRiskFixtures = [
  {
    subject: '【自动回复测试10-高风险】客户强烈不满要求退款',
    summary: '测试类型：高风险售后 - 脾气不好要求退款 This is unacceptable. I want a full refund now.',
    risk: 'high',
    action: 'blocked',
  },
  {
    subject: '【垃圾广告测试09】供应商代运营推广邮件',
    summary: '测试类型：垃圾广告 Dear purchasing manager, dropshipping agent, Shopify operation, cheap lab grown diamonds.',
    risk: 'spam',
    action: 'ignore',
  },
  {
    subject: '【自动回复测试08-高风险】客户生气要求退货',
    summary: '测试类型：高风险售后 - 脾气不好要求退货 I am very disappointed and I want to return it.',
    risk: 'high',
    action: 'blocked',
  },
  {
    subject: '【垃圾广告测试07】SEO外链推广邮件',
    summary: '测试类型：垃圾广告 SEO backlinks, guest posts, limited time promotion.',
    risk: 'spam',
    action: 'ignore',
  },
  {
    subject: '【自动回复测试06-高风险】客户反馈疑似重复扣款',
    summary: '测试类型：高风险售后 - 付款异常 I think I was charged twice for the same order.',
    risk: 'high',
    action: 'blocked',
  },
  {
    subject: '【自动回复测试05-高风险】客户要求修改收货地址',
    summary: '测试类型：高风险售后 - 地址变更 My shipping address is wrong. Please change it before the order ships.',
    risk: 'high',
    action: 'blocked',
  },
  {
    subject: '【自动回复测试04-中风险】收到货后商品细节疑问',
    summary: '测试类型：中风险售后 - 商品细节疑问 I received the bracelet today but I am not sure if the metal color is the same as the photos.',
    risk: 'medium',
    action: 'draft_only',
  },
  {
    subject: '【自动回复测试03-中风险】发货延迟追问',
    summary: '测试类型：中风险售后 - 发货延迟追问 My order was expected to ship this week, but I have not received any update yet.',
    risk: 'medium',
    action: 'draft_only',
  },
  {
    subject: '【自动回复测试02-中低风险】戒指尺码变更咨询',
    summary: '测试类型：低风险售后 - 尺码咨询 I am interested in changing the ring size before shipment.',
    risk: 'low',
    action: 'auto_reply',
    templateId: 'TPL-SIZE-INQUIRY-001',
  },
  {
    subject: '【自动回复测试01-低风险】物流单号查询',
    summary: '测试类型：低风险售后 - 查询物流 I would like to know if there is any tracking update.',
    risk: 'low',
    action: 'auto_reply',
    templateId: 'TPL-TRACKING-RECEIVED-001',
  },
];
const autoReplyRiskResults = autoReplyRiskFixtures.map((fixture) => classifyMail({
  subject: fixture.subject,
  sender: 'cui@vitashinelab.com',
  summary: fixture.summary,
}));
assert.deepEqual(autoReplyRiskResults.map((mail) => mail.risk), autoReplyRiskFixtures.map((fixture) => fixture.risk));
assert.deepEqual(autoReplyRiskResults.map((mail) => mail.action), autoReplyRiskFixtures.map((fixture) => fixture.action));
assert.ok(autoReplyRiskResults.filter((mail) => mail.risk === 'low').every((mail) => (
  mail.action === 'auto_reply'
  && mail.replyCandidates.length === 1
  && mail.replyDraft
  && mail.requiresReview === false
)));
assert.deepEqual(
  autoReplyRiskResults.filter((mail) => mail.risk === 'low').map((mail) => mail.templateId),
  autoReplyRiskFixtures.filter((fixture) => fixture.risk === 'low').map((fixture) => fixture.templateId),
);

const ambiguous = classifyMail({
  subject: 'Need help',
  sender: 'buyer011@example.test',
  summary: '客户只说需要帮助，没有清楚说明诉求。',
});

assert.equal(ambiguous.action, 'draft_only');
assert.equal(ambiguous.risk, 'medium');
assert.equal(ambiguous.templateId, 'TPL-AMBIGUOUS-001');
assert.match(ambiguous.reason, /语义不明确/);

const lowRiskTemplates = replyTemplates.filter((template) => template.risk === 'low');
assert.ok(lowRiskTemplates.length >= 5);
assert.ok(lowRiskTemplates.every((template) => template.action === 'auto_reply'));
assert.ok(lowRiskTemplates.every((template) => template.allowsRealSend === false));
assert.ok(replyTemplates.every((template) => template.contentZh && template.contentEn));

const mediumRiskTemplates = replyTemplates.filter((template) => template.risk === 'medium');
assert.ok(mediumRiskTemplates.length >= 5);
assert.ok(mediumRiskTemplates.every((template) => template.action === 'draft_only'));
assert.ok(mediumRiskTemplates.every((template) => template.requiresReview === true));

assert.deepEqual(validateReplyTemplates(replyTemplates), []);
assert.equal(
  buildReplyCandidates({
    template: mediumRiskTemplates[0],
    action: 'draft_only',
    risk: 'medium',
  }).length,
  3,
);

const summary = summarizeMails([lowRisk, draftOnly, blocked, ambiguous, spam]);
assert.deepEqual(summary, {
  total: 5,
  autoReply: 1,
  draftOnly: 2,
  blocked: 1,
  ignored: 1,
  low: 1,
  medium: 2,
  high: 1,
  spam: 1,
  green: 1,
  orange: 2,
  red: 1,
  white: 1,
});

assert.deepEqual(validateSamples([
  { sender: 'buyer001@example.test', subject: 'OK', summary: '普通测试邮件' },
  { sender: 'real.customer@gmail.com', subject: '真实邮箱', summary: '不应该进入样例' },
  { sender: 'buyer002@example.test', subject: 'token', summary: 'App Secret abc' },
]), [
  '第 2 封样例发件人不是 example.test / .test 测试邮箱。',
  '第 3 封样例疑似包含真实凭证关键词。',
]);

const classifiedSamples = sampleMails.map(classifyMail);
const sampleSummary = summarizeMails(classifiedSamples);
assert.ok(sampleMails.length >= 33);
assert.ok(sampleSummary.autoReply >= 8);
assert.ok(sampleSummary.draftOnly >= 10);
assert.ok(sampleSummary.blocked >= 8);
assert.ok(sampleSummary.ignored >= 3);
assert.equal(validateSamples(sampleMails).length, 0);
assert.ok(classifiedSamples.every((mail) => mail.allowsRealSend === false));
assert.ok(classifiedSamples
  .filter((mail) => !['blocked', 'ignore'].includes(mail.action))
  .every((mail) => mail.templateSource === 'replyTemplates' && mail.templateId));
assert.ok(classifiedSamples
  .filter((mail) => mail.action === 'blocked')
  .every((mail) => mail.templateSource === 'blocked' && mail.templateId === null && mail.replyDraft === ''));
assert.ok(classifiedSamples
  .filter((mail) => mail.action === 'ignore')
  .every((mail) => mail.templateSource === 'spam' && mail.templateId === null && mail.replyDraft === ''));

assert.deepEqual(REVIEW_OPTIONS.map((option) => option.value), [
  'reasonable',
  'adjust_rule',
  'adjust_template',
  'should_block',
]);

const reviewState = {};
const firstReview = upsertReview(reviewState, {
  mailId: 'FMAIL-004',
  decision: 'adjust_rule',
  note: '订单状态查询需要补充承运商字段。',
});
assert.equal(firstReview['FMAIL-004'].decision, 'adjust_rule');
assert.equal(firstReview['FMAIL-004'].note, '订单状态查询需要补充承运商字段。');
assert.ok(firstReview['FMAIL-004'].updatedAt);

const secondReview = upsertReview(firstReview, {
  mailId: 'FMAIL-008',
  decision: 'should_block',
  note: '退款邮件必须拦截。',
});

assert.deepEqual(summarizeReviews(secondReview), {
  total: 2,
  reasonable: 0,
  adjustRule: 1,
  adjustTemplate: 0,
  shouldBlock: 1,
});

assert.deepEqual(exportReviewItems(classifiedSamples, secondReview), [
  {
    mailId: 'FMAIL-004',
    subject: 'Order SH-TEST-1001 status',
    category: '查订单',
    risk: 'medium',
    action: 'draft_only',
    templateId: 'TPL-ORDER-STATUS-001',
    decision: 'adjust_rule',
    decisionText: '需调整规则',
    note: '订单状态查询需要补充承运商字段。',
  },
  {
    mailId: 'FMAIL-008',
    subject: 'I want a refund',
    category: '退款 / 退货',
    risk: 'high',
    action: 'blocked',
    templateId: null,
    decision: 'should_block',
    decisionText: '应拦截',
    note: '退款邮件必须拦截。',
  },
]);

assert.equal(
  buildThreadKey({
    threadId: 'thread-test-001',
    sender: 'buyer001@example.test',
    subject: '已发送资料，请查收',
  }),
  'thread-test-001',
);

assert.equal(
  buildThreadKey({
    sender: 'Buyer001@Example.Test',
    subject: 'Re: 已发送资料，请查收',
  }),
  'buyer001@example.test::已发送资料，请查收',
);

const lowRiskSendGuard = evaluateSendGuard(lowRisk);
assert.equal(lowRiskSendGuard.allowed, false);
assert.equal(lowRiskSendGuard.mode, 'simulation_only');
assert.ok(lowRiskSendGuard.reasons.some((reason) => reason.includes('服务端闭环')));
assert.ok(lowRiskSendGuard.checks.some((check) => check.id === 'real_send_disabled' && check.ok === false));

const draftSendGuard = evaluateSendGuard(draftOnly);
assert.equal(draftSendGuard.allowed, false);
assert.equal(draftSendGuard.mode, 'needs_review');
assert.ok(draftSendGuard.reasons.some((reason) => reason.includes('人工审核')));

const blockedSendGuard = evaluateSendGuard(blocked);
assert.equal(blockedSendGuard.allowed, false);
assert.equal(blockedSendGuard.mode, 'blocked');
assert.ok(blockedSendGuard.reasons.some((reason) => reason.includes('高风险')));

const spamSendGuard = evaluateSendGuard(spam);
assert.equal(spamSendGuard.allowed, false);
assert.equal(spamSendGuard.mode, 'ignored');
assert.ok(spamSendGuard.reasons.some((reason) => reason.includes('垃圾') || reason.includes('骚扰')));

const duplicateSendGuard = evaluateSendGuard(lowRisk, {
  repliedMessageIds: ['FMAIL-001'],
  messageId: 'FMAIL-001',
});
assert.equal(duplicateSendGuard.allowed, false);
assert.equal(duplicateSendGuard.mode, 'duplicate');
assert.ok(duplicateSendGuard.reasons.some((reason) => reason.includes('重复回复')));

const threadMismatchGuard = evaluateSendGuard({
  ...lowRisk,
  threadId: 'thread-current',
}, {
  expectedThreadKey: 'thread-other',
});
assert.equal(threadMismatchGuard.allowed, false);
assert.equal(threadMismatchGuard.mode, 'thread_mismatch');
assert.ok(threadMismatchGuard.reasons.some((reason) => reason.includes('线程不一致')));

assert.deepEqual(summarizeSendGuards([
  lowRiskSendGuard,
  draftSendGuard,
  blockedSendGuard,
  spamSendGuard,
  duplicateSendGuard,
  threadMismatchGuard,
]), {
  total: 6,
  allowed: 0,
  simulationOnly: 1,
  needsReview: 1,
  blocked: 1,
  ignored: 1,
  duplicate: 1,
  threadMismatch: 1,
});

const mappedFeishuMail = mapFeishuMessageToMail({
  message_id: 'om_test_001',
  thread_id: 'omt_test_thread_001',
  subject: 'Re: 我想查询订单',
  from: {
    email: 'buyer031@example.test',
  },
  received_at: '2026-06-10 16:45',
  body_preview: '客户想查询订单，但是没有提供订单号。',
});
assert.deepEqual(mappedFeishuMail, {
  id: 'om_test_001',
  messageId: 'om_test_001',
  threadId: 'omt_test_thread_001',
  subject: 'Re: 我想查询订单',
  sender: 'buyer031@example.test',
  receivedAt: '2026-06-10 16:45',
  summary: '客户想查询订单，但是没有提供订单号。',
  bodyText: '客户想查询订单，但是没有提供订单号。',
  status: '飞书 API 导入',
});

assert.equal(mapFeishuMessageToMail({
  message_id: 'om_time_test_001',
  internal_date: '1718086200000',
}).receivedAt, '2024-06-11 14:10');

const mockFeishuMessages = createMockFeishuMessages(sampleMails.slice(0, 3));
assert.equal(mockFeishuMessages.length, 3);
assert.equal(mockFeishuMessages[0].message_id, 'FMAIL-001');
assert.equal(mockFeishuMessages[0].thread_id, 'thread-FMAIL-001');
assert.ok(mockFeishuMessages[0].labels.includes('auto_replied'));

const sendContext = buildSendContextFromFeishuMessages(mockFeishuMessages);
assert.deepEqual(sendContext.repliedMessageIds, ['FMAIL-001']);
assert.deepEqual(sendContext.repliedThreadKeys, ['thread-FMAIL-001']);
assert.equal(sendContext.expectedThreadKeysByMailId['FMAIL-001'], 'thread-FMAIL-001');

const lowRiskDraft = buildDraftRecord(lowRisk);
assert.equal(lowRiskDraft.canSaveDraft, true);
assert.equal(lowRiskDraft.requiresApproval, false);
assert.equal(lowRiskDraft.status, 'draft_saved');
assert.equal(lowRiskDraft.templateId, 'TPL-ORDER-MISSING-001');

const mediumDraftBeforeReview = buildDraftRecord(draftOnly);
assert.equal(mediumDraftBeforeReview.canSaveDraft, true);
assert.equal(mediumDraftBeforeReview.requiresApproval, true);
assert.equal(mediumDraftBeforeReview.status, 'waiting_review');
assert.equal(mediumDraftBeforeReview.approved, false);

const mediumDraftAfterReview = buildDraftRecord(draftOnly, {
  decision: 'reasonable',
});
assert.equal(mediumDraftAfterReview.status, 'review_approved');
assert.equal(mediumDraftAfterReview.approved, true);

const blockedDraft = buildDraftRecord(blocked);
assert.equal(blockedDraft.canSaveDraft, false);
assert.equal(blockedDraft.status, 'blocked');
assert.equal(blockedDraft.content, '');

const spamDraft = buildDraftRecord(spam);
assert.equal(spamDraft.canSaveDraft, false);
assert.equal(spamDraft.status, 'ignored');
assert.equal(spamDraft.content, '');

const lowRiskQueueItem = buildSendQueueItem(lowRisk, lowRiskDraft, lowRiskSendGuard);
assert.equal(lowRiskQueueItem.canEnterQueue, true);
assert.equal(lowRiskQueueItem.queueStatus, 'simulation_queued');
assert.equal(lowRiskQueueItem.realSendAllowed, false);

const mediumQueueBeforeReview = buildSendQueueItem(draftOnly, mediumDraftBeforeReview, draftSendGuard);
assert.equal(mediumQueueBeforeReview.canEnterQueue, false);
assert.equal(mediumQueueBeforeReview.queueStatus, 'waiting_review');

const mediumQueueAfterReview = buildSendQueueItem(draftOnly, mediumDraftAfterReview, draftSendGuard);
assert.equal(mediumQueueAfterReview.canEnterQueue, true);
assert.equal(mediumQueueAfterReview.queueStatus, 'simulation_queued');

const blockedQueueItem = buildSendQueueItem(blocked, blockedDraft, blockedSendGuard);
assert.equal(blockedQueueItem.canEnterQueue, false);
assert.equal(blockedQueueItem.queueStatus, 'blocked');

const spamQueueItem = buildSendQueueItem(spam, spamDraft, spamSendGuard);
assert.equal(spamQueueItem.canEnterQueue, false);
assert.equal(spamQueueItem.queueStatus, 'ignored');
assert.match(spamQueueItem.reason, /垃圾|骚扰|归档|移箱/);

const duplicateQueueItem = buildSendQueueItem(lowRisk, lowRiskDraft, duplicateSendGuard);
assert.equal(duplicateQueueItem.canEnterQueue, false);
assert.equal(duplicateQueueItem.queueStatus, 'send_guard_blocked');

assert.deepEqual(summarizeDraftWorkflow([
  lowRiskQueueItem,
  mediumQueueBeforeReview,
  mediumQueueAfterReview,
  blockedQueueItem,
  spamQueueItem,
  duplicateQueueItem,
]), {
  total: 6,
  draftSaved: 4,
  waitingReview: 1,
  approved: 1,
  queued: 2,
  blocked: 2,
  ignored: 1,
  realSendAllowed: 0,
});

const workbenchFilterRows = [
  { ...lowRisk, id: 'FILTER-LOW', sendGuard: lowRiskSendGuard, queueItem: lowRiskQueueItem },
  { ...draftOnly, id: 'FILTER-MEDIUM', sendGuard: draftSendGuard, queueItem: mediumQueueBeforeReview },
  { ...blocked, id: 'FILTER-HIGH', sendGuard: blockedSendGuard, queueItem: blockedQueueItem },
  { ...spam, id: 'FILTER-SPAM', sendGuard: spamSendGuard, queueItem: spamQueueItem },
];
const blockedMediumConflict = {
  ...draftOnly,
  id: 'FILTER-BLOCKED-MEDIUM-CONFLICT',
  risk: 'medium',
  action: 'blocked',
  lane: 'orange',
};
assert.deepEqual(WORKBENCH_FILTERS.map((filter) => filter.key), [
  'all',
  'pending',
  'urgent',
  'completed',
  'spam',
]);
assert.equal(getWorkbenchProcessingStatus(workbenchFilterRows[0]).status, 'pending');
assert.equal(getWorkbenchProcessingStatus(workbenchFilterRows[2]).status, 'urgent');
assert.equal(getWorkbenchProcessingStatus(blockedMediumConflict).status, 'urgent');
assert.deepEqual(getMailRiskState(blockedMediumConflict), {
  risk: 'high',
  label: '高风险',
  lane: 'red',
  action: 'blocked',
  urgent: true,
  spam: false,
  sourceRisk: 'medium',
  sourceAction: 'blocked',
});
assert.deepEqual(normalizeMailRiskSnapshot(blockedMediumConflict), {
  risk: 'high',
  action: 'blocked',
  lane: 'red',
});
assert.equal(shouldReplaceStableRiskSnapshot(null, { risk: 'high' }), true);
assert.equal(shouldReplaceStableRiskSnapshot({ source: 'auto', risk: 'medium' }, { risk: 'high' }), false);
assert.equal(shouldReplaceStableRiskSnapshot({ source: 'auto', risk: 'high' }, { risk: 'medium' }), false);
assert.equal(shouldReplaceStableRiskSnapshot({ source: 'manual', risk: 'high' }, { risk: 'low' }), false);
assert.equal(shouldReplaceStableRiskSnapshot({ source: 'auto', risk: 'medium' }, { risk: 'high' }, { risk: 'high' }), true);
assert.deepEqual(
  filterWorkbenchMails(workbenchFilterRows, 'pending').map((mail) => mail.id),
  ['FILTER-LOW', 'FILTER-MEDIUM', 'FILTER-HIGH', 'FILTER-SPAM'],
);
assert.deepEqual(
  filterWorkbenchMails(workbenchFilterRows, 'inbox').map((mail) => mail.id),
  ['FILTER-LOW', 'FILTER-MEDIUM'],
);
assert.equal(normalizeWorkbenchFilter('high_risk'), 'urgent');
assert.deepEqual(
  filterWorkbenchMails(workbenchFilterRows, 'low_risk').map((mail) => mail.id),
  ['FILTER-LOW'],
);
assert.deepEqual(
  filterWorkbenchMails([...workbenchFilterRows, blockedMediumConflict], 'medium_risk').map((mail) => mail.id),
  ['FILTER-MEDIUM'],
);
assert.deepEqual(
  filterWorkbenchMails([...workbenchFilterRows, blockedMediumConflict], 'high_risk').map((mail) => mail.id),
  ['FILTER-HIGH', 'FILTER-BLOCKED-MEDIUM-CONFLICT'],
);
assert.deepEqual(
  filterWorkbenchMails([...workbenchFilterRows, blockedMediumConflict], 'urgent').map((mail) => mail.id),
  ['FILTER-HIGH', 'FILTER-BLOCKED-MEDIUM-CONFLICT'],
);
assert.deepEqual(
  filterWorkbenchMails(workbenchFilterRows, 'completed').map((mail) => mail.id),
  [],
);
assert.deepEqual(
  filterWorkbenchMails(workbenchFilterRows, 'spam').map((mail) => mail.id),
  ['FILTER-SPAM'],
);
const workbenchMetrics = buildWorkbenchFilterMetrics({
  results: workbenchFilterRows,
  reviews: { 'FILTER-HIGH': { decision: 'reasonable' } },
  sourceLabel: 'API 邮件',
  sourceStatus: '真实接入',
});
assert.equal(workbenchMetrics.find((metric) => metric.key === 'all').count, 4);
assert.equal(workbenchMetrics.find((metric) => metric.key === 'pending').count, 4);
assert.equal(workbenchMetrics.find((metric) => metric.key === 'urgent').count, 1);
assert.equal(workbenchMetrics.find((metric) => metric.key === 'completed').count, 0);
assert.equal(workbenchMetrics.find((metric) => metric.key === 'all').label, 'API 邮件');
assert.equal(workbenchMetrics.find((metric) => metric.key === 'all').sourceStatus, '真实接入');
assert.equal(workbenchMetrics.find((metric) => metric.key === 'spam').openLabel, '打开垃圾邮件');
assert.equal(typeof workbenchFilters.findFirstWorkbenchMailId, 'function');
assert.equal(workbenchFilters.findFirstWorkbenchMailId(workbenchFilterRows, 'pending', { reviews: {} }), 'FILTER-LOW');
assert.equal(workbenchFilters.findFirstWorkbenchMailId(workbenchFilterRows, 'urgent', { reviews: {} }), 'FILTER-HIGH');

assert.equal(typeof workbenchFilters.buildQueueNavigationItems, 'function');
const queueNavigationItems = workbenchFilters.buildQueueNavigationItems(workbenchFilterRows);
assert.deepEqual(queueNavigationItems.map((item) => item.mailId), ['FILTER-LOW']);
assert.equal(queueNavigationItems[0].subject, lowRisk.subject);
assert.equal(queueNavigationItems[0].filterKey, 'queue');

const completedLowRisk = {
  ...workbenchFilterRows[0],
  processingStatus: {
    status: 'completed',
    action: 'send',
    label: '已自动回复',
  },
};
const completedHighRisk = {
  ...workbenchFilterRows[2],
  processingStatus: {
    status: 'completed',
    action: 'send',
    label: '已人工发送',
  },
};
const workbenchRowsWithCompleted = [
  completedLowRisk,
  workbenchFilterRows[1],
  completedHighRisk,
  workbenchFilterRows[3],
];
assert.equal(getWorkbenchProcessingStatus(completedLowRisk).status, 'completed');
assert.equal(getWorkbenchProcessingStatus(completedHighRisk).status, 'completed');
assert.deepEqual(
  filterWorkbenchMails(workbenchRowsWithCompleted, 'completed').map((mail) => mail.id),
  ['FILTER-LOW', 'FILTER-HIGH'],
);
assert.deepEqual(
  filterWorkbenchMails(workbenchRowsWithCompleted, 'urgent').map((mail) => mail.id),
  [],
);
assert.deepEqual(
  filterWorkbenchMails(workbenchRowsWithCompleted, 'pending').map((mail) => mail.id),
  ['FILTER-MEDIUM', 'FILTER-SPAM'],
);

const failedLowRisk = {
  ...workbenchFilterRows[0],
  id: 'FILTER-FAILED-LOW',
  processingStatus: {
    status: 'failed',
    action: 'send',
    label: '发送失败',
    failed: true,
    reason: '低风险自动发送开关未开启。',
  },
};
assert.equal(getWorkbenchProcessingStatus(failedLowRisk).status, 'pending');
assert.equal(getWorkbenchProcessingStatus(failedLowRisk).label, '动作失败待处理');
const completedStatusWinsOverLocalFailure = chooseProcessingStatus(
  {
    status: 'failed',
    action: 'send',
    label: '动作失败待处理',
    failed: true,
  },
  {
    status: 'completed',
    action: 'send',
    label: '已自动回复',
    completed: true,
  },
);
assert.equal(completedStatusWinsOverLocalFailure.status, 'completed');
assert.equal(completedStatusWinsOverLocalFailure.label, '已自动回复');
assert.deepEqual(
  filterWorkbenchMails([...workbenchFilterRows, failedLowRisk], 'urgent').map((mail) => mail.id),
  ['FILTER-HIGH'],
);
assert.deepEqual(
  filterWorkbenchMails([...workbenchFilterRows, failedLowRisk], 'pending').map((mail) => mail.id),
  ['FILTER-LOW', 'FILTER-MEDIUM', 'FILTER-HIGH', 'FILTER-SPAM', 'FILTER-FAILED-LOW'],
);

assert.ok(API_CONFIG_FIELDS.every((field) => field.secret === false));
assert.ok(API_CONFIG_FIELDS.some((field) => field.key === 'appId'));
assert.ok(API_CONFIG_FIELDS.some((field) => field.key === 'mailboxAddress'));
assert.ok(PERMISSION_REQUIREMENTS.some((permission) => permission.key === 'mailRead'));
assert.ok(PERMISSION_REQUIREMENTS.some((permission) => permission.key === 'mailDraft'));
assert.ok(PERMISSION_REQUIREMENTS.some((permission) => permission.key === 'mailSend'));

assert.deepEqual(validateApiConfigDraft({
  appId: 'cli_test_app_id',
  mailboxAddress: 'service@example.test',
  appSecret: 'should-not-save',
  access_token: 'should-not-save',
  password: 'should-not-save',
}), [
  '禁止在工作台保存敏感字段：appSecret。',
  '禁止在工作台保存敏感字段：access_token。',
  '禁止在工作台保存敏感字段：password。',
]);

const apiReadiness = buildApiReadiness({
  config: {
    appId: 'cli_test_app_id',
    mailboxAddress: 'service@example.test',
    callbackUrl: 'https://example.test/feishu/mail/callback',
    environment: 'sandbox',
  },
  permissions: {
    mailRead: true,
    mailDraft: true,
    mailSend: false,
    mailboxManage: false,
  },
});
assert.equal(apiReadiness.readyForReadSimulation, true);
assert.equal(apiReadiness.readyForRealSend, false);
assert.equal(apiReadiness.secretIssues.length, 0);
assert.ok(apiReadiness.permissionChecks.find((check) => check.key === 'mailSend').ok === false);

const missingFeishuEnv = validateFeishuApiEnv({
  FEISHU_APP_ID: 'cli_test_app_id',
});
assert.equal(missingFeishuEnv.configured, false);
assert.deepEqual(missingFeishuEnv.missing, [
  'FEISHU_APP_SECRET',
  'FEISHU_USER_MAILBOX_ID',
]);
assert.equal(missingFeishuEnv.sourceStatus, 'API 待接入');
assert.equal(missingFeishuEnv.realSendEnabled, false);

const readyFeishuEnv = validateFeishuApiEnv({
  FEISHU_APP_ID: 'cli_test_app_id',
  FEISHU_APP_SECRET: 'secret_should_not_be_public',
  FEISHU_USER_MAILBOX_ID: 'user-mailbox-test',
});
assert.equal(readyFeishuEnv.configured, true);
assert.deepEqual(readyFeishuEnv.missing, []);
assert.equal(readyFeishuEnv.sourceStatus, '真实接入');
assert.equal(readyFeishuEnv.canReadMail, true);
assert.equal(readyFeishuEnv.realSendEnabled, false);

const publicFeishuStatus = buildPublicFeishuApiStatus({
  FEISHU_APP_ID: 'cli_test_app_id',
  FEISHU_APP_SECRET: 'secret_should_not_be_public',
  FEISHU_USER_MAILBOX_ID: 'user-mailbox-test',
  FEISHU_MAIL_FOLDER_ID: 'INBOX',
  FEISHU_USER_ACCESS_TOKEN: 'user-token-should-not-leak',
  FEISHU_USER_REFRESH_TOKEN: 'refresh-token-should-not-leak',
  FEISHU_USER_ACCESS_TOKEN_EXPIRES_AT: '2099-01-01T00:00:00.000Z',
});
assert.equal(publicFeishuStatus.configured, true);
assert.equal(publicFeishuStatus.appIdConfigured, true);
assert.equal(publicFeishuStatus.appSecretConfigured, true);
assert.equal(publicFeishuStatus.userMailboxIdConfigured, true);
assert.equal(publicFeishuStatus.userAccessTokenConfigured, true);
assert.equal(publicFeishuStatus.userRefreshTokenConfigured, true);
assert.equal(publicFeishuStatus.userTokenAutoRefreshReady, true);
assert.equal(publicFeishuStatus.realSendEnabled, false);
assert.equal(JSON.stringify(publicFeishuStatus).includes('secret_should_not_be_public'), false);
assert.equal(JSON.stringify(publicFeishuStatus).includes('user-token-should-not-leak'), false);
assert.equal(JSON.stringify(publicFeishuStatus).includes('refresh-token-should-not-leak'), false);

const writeStatusDisabled = buildPublicFeishuWriteStatus({
  FEISHU_WRITE_ENABLED: 'false',
  FEISHU_USER_ACCESS_TOKEN: 'user-token-should-not-leak',
});
assert.equal(writeStatusDisabled.writeEnabled, false);
assert.equal(writeStatusDisabled.realSendEnabled, false);
assert.equal(JSON.stringify(writeStatusDisabled).includes('user-token-should-not-leak'), false);

const writeEnv = {
  FEISHU_WRITE_ENABLED: 'true',
  FEISHU_SEND_ENABLED: 'true',
  FEISHU_ARCHIVE_ENABLED: 'true',
  FEISHU_HIGH_RISK_SEND_ENABLED: 'true',
  FEISHU_USER_ACCESS_TOKEN: 'user-token-should-not-leak',
  FEISHU_SEND_RECIPIENT_ALLOWLIST: 'buyer002@example.test,buyer004@example.test,buyer008@example.test',
  FEISHU_ARCHIVE_FOLDER_ID: 'archive-folder-test',
  FEISHU_DAILY_SEND_LIMIT: '3',
  FEISHU_DAILY_ARCHIVE_LIMIT: '5',
};
const writeStatusReady = buildPublicFeishuWriteStatus(writeEnv);
assert.equal(writeStatusReady.writeEnabled, true);
assert.equal(writeStatusReady.realSendEnabled, true);
assert.equal(writeStatusReady.userAccessTokenConfigured, true);
assert.equal(writeStatusReady.allowlistCount, 3);
assert.equal(JSON.stringify(writeStatusReady).includes('user-token-should-not-leak'), false);

const lowRiskWriteDecision = buildWriteActionDecision({
  action: 'send',
  mail: lowRisk,
  recipient: lowRisk.sender,
  content: lowRisk.replyDraft,
  env: writeEnv,
  usage: { sentToday: 0, archivedToday: 0 },
});
assert.equal(lowRiskWriteDecision.allowed, true);
assert.equal(lowRiskWriteDecision.mode, 'ready');
assert.equal(lowRiskWriteDecision.requiresApproval, false);

const allowlistBlockedDecision = buildWriteActionDecision({
  action: 'send',
  mail: lowRisk,
  recipient: 'outside@example.test',
  content: lowRisk.replyDraft,
  env: writeEnv,
});
assert.equal(allowlistBlockedDecision.allowed, false);
assert.equal(allowlistBlockedDecision.mode, 'recipient_not_allowlisted');

const unknownCustomerEnv = {
  ...writeEnv,
  FEISHU_SEND_RECIPIENT_ALLOWLIST: '',
  FEISHU_CUSTOMER_REPLY_ORIGINAL_SENDER_ENABLED: 'true',
};
const unknownCustomerWriteStatus = buildPublicFeishuWriteStatus(unknownCustomerEnv);
assert.equal(unknownCustomerWriteStatus.realSendEnabled, true);
assert.equal(unknownCustomerWriteStatus.allowlistCount, 0);
assert.equal(unknownCustomerWriteStatus.unknownCustomerAutoReplyEnabled, true);
assert.equal(unknownCustomerWriteStatus.customerReplyOriginalSenderEnabled, true);
assert.equal(unknownCustomerWriteStatus.customerReplyPolicy, 'original_sender');

const unknownCustomerLowRiskDecision = buildWriteActionDecision({
  action: 'send',
  mail: lowRisk,
  recipient: lowRisk.sender,
  content: lowRisk.replyDraft,
  env: unknownCustomerEnv,
});
assert.equal(unknownCustomerLowRiskDecision.allowed, true);
assert.equal(unknownCustomerLowRiskDecision.mode, 'ready');

const unknownCustomerWrongRecipientDecision = buildWriteActionDecision({
  action: 'send',
  mail: lowRisk,
  recipient: 'other-customer@example.test',
  content: lowRisk.replyDraft,
  env: unknownCustomerEnv,
});
assert.equal(unknownCustomerWrongRecipientDecision.allowed, false);
assert.equal(unknownCustomerWrongRecipientDecision.mode, 'recipient_not_original_sender');

const unknownNoReplyDecision = buildWriteActionDecision({
  action: 'send',
  mail: {
    ...lowRisk,
    sender: 'no-reply@example.test',
  },
  recipient: 'no-reply@example.test',
  content: lowRisk.replyDraft,
  env: unknownCustomerEnv,
});
assert.equal(unknownNoReplyDecision.allowed, false);
assert.equal(unknownNoReplyDecision.mode, 'automated_sender_blocked');

const unknownCustomerMediumDecision = buildWriteActionDecision({
  action: 'send',
  mail: draftOnly,
  recipient: draftOnly.sender,
  content: draftOnly.replyDraft,
  review: { decision: 'reasonable' },
  env: unknownCustomerEnv,
});
assert.equal(unknownCustomerMediumDecision.allowed, true);
assert.equal(unknownCustomerMediumDecision.mode, 'ready');

const unknownCustomerHighDecision = buildWriteActionDecision({
  action: 'send',
  mail: blocked,
  recipient: blocked.sender,
  content: blocked.replyCandidates[0].content,
  review: { decision: 'reasonable' },
  env: unknownCustomerEnv,
});
assert.equal(unknownCustomerHighDecision.allowed, true);
assert.equal(unknownCustomerHighDecision.mode, 'ready');

const unknownCustomerMediumWrongRecipientDecision = buildWriteActionDecision({
  action: 'send',
  mail: draftOnly,
  recipient: 'other-customer@example.test',
  content: draftOnly.replyDraft,
  review: { decision: 'reasonable' },
  env: unknownCustomerEnv,
});
assert.equal(unknownCustomerMediumWrongRecipientDecision.allowed, false);
assert.equal(unknownCustomerMediumWrongRecipientDecision.mode, 'recipient_not_original_sender');

const mediumWriteBeforeApproval = buildWriteActionDecision({
  action: 'send',
  mail: draftOnly,
  recipient: draftOnly.sender,
  content: draftOnly.replyDraft,
  env: writeEnv,
});
assert.equal(mediumWriteBeforeApproval.allowed, false);
assert.equal(mediumWriteBeforeApproval.mode, 'approval_required');

const mediumWriteAfterApproval = buildWriteActionDecision({
  action: 'send',
  mail: draftOnly,
  recipient: draftOnly.sender,
  content: draftOnly.replyDraft,
  review: { decision: 'reasonable' },
  env: writeEnv,
});
assert.equal(mediumWriteAfterApproval.allowed, true);
assert.equal(mediumWriteAfterApproval.requiresApproval, true);

const highRiskWriteAfterApproval = buildWriteActionDecision({
  action: 'send',
  mail: blocked,
  recipient: blocked.sender,
  content: blocked.replyCandidates[0].content,
  review: { decision: 'reasonable' },
  env: writeEnv,
});
assert.equal(highRiskWriteAfterApproval.allowed, true);
assert.equal(highRiskWriteAfterApproval.paymentActionAllowed, false);
assert.equal(highRiskWriteAfterApproval.orderActionAllowed, false);

const spamSendDecision = buildWriteActionDecision({
  action: 'send',
  mail: spam,
  recipient: spam.sender,
  content: '不应该发送',
  env: writeEnv,
});
assert.equal(spamSendDecision.allowed, false);
assert.equal(spamSendDecision.mode, 'spam_cannot_send');

const spamArchiveDecision = buildWriteActionDecision({
  action: 'archive',
  mail: spam,
  recipient: spam.sender,
  env: writeEnv,
});
assert.equal(spamArchiveDecision.allowed, true);
assert.equal(spamArchiveDecision.mode, 'ready');

const loopLowRisk = { ...lowRisk, id: 'LOOP-LOW-001' };
const loopDraftOnly = { ...draftOnly, id: 'LOOP-MEDIUM-001' };
const loopBlocked = { ...blocked, id: 'LOOP-HIGH-001' };
const loopSpam = {
  ...spam,
  id: 'LOOP-SPAM-001',
  messageId: 'om_spam_001',
};
const closedLoopBatch = buildClosedLoopBatch({
  mails: [loopLowRisk, loopDraftOnly, loopBlocked, {
    ...spam,
    id: loopSpam.id,
    messageId: 'om_spam_001',
  }],
  env: {
    ...writeEnv,
    FEISHU_AUTO_PROCESS_ENABLED: 'true',
    FEISHU_AUTO_SEND_LOW_RISK_ENABLED: 'true',
    FEISHU_AUTO_ARCHIVE_SPAM_ENABLED: 'true',
  },
  reviews: {
    [loopBlocked.id]: { decision: 'reasonable', note: '审批通过，仅做邮件层回复。' },
  },
  selectedReplies: {
    [loopBlocked.id]: { content: blocked.replyCandidates[1].content },
  },
});
assert.deepEqual(summarizeClosedLoopItems(closedLoopBatch.items), {
  total: 4,
  autoSendReady: 1,
  archiveReady: 1,
  manualSendReady: 1,
  pendingReview: 1,
  blocked: 0,
  skipped: 0,
});
assert.equal(closedLoopBatch.items.find((item) => item.mailId === loopLowRisk.id).operation, 'auto_send');
assert.equal(closedLoopBatch.items.find((item) => item.mailId === loopSpam.id).operation, 'auto_archive');
assert.equal(closedLoopBatch.items.find((item) => item.mailId === loopDraftOnly.id).operation, 'pending_review');
assert.equal(closedLoopBatch.items.find((item) => item.mailId === loopBlocked.id).operation, 'manual_send_after_approval');
assert.equal(closedLoopBatch.items.find((item) => item.mailId === loopBlocked.id).content, blocked.replyCandidates[1].content);

const closedLoopDuplicateBatch = buildClosedLoopBatch({
  mails: [{
    ...loopLowRisk,
    sendGuard: {
      mode: 'duplicate',
      reasons: ['同一邮件或线程已经有回复记录，必须拦截避免重复回复。'],
    },
  }],
  env: {
    ...writeEnv,
    FEISHU_AUTO_PROCESS_ENABLED: 'true',
    FEISHU_AUTO_SEND_LOW_RISK_ENABLED: 'true',
  },
});
assert.equal(closedLoopDuplicateBatch.items[0].operation, 'send_guard_blocked');
assert.equal(closedLoopDuplicateBatch.items[0].status, 'blocked');
assert.match(closedLoopDuplicateBatch.items[0].reasons[0], /重复回复/);

const runtimeClosedBatch = buildClosedLoopBatch({
  mails: [loopLowRisk],
  env: {
    ...writeEnv,
    FEISHU_AUTO_PROCESS_ENABLED: 'true',
    FEISHU_AUTO_SEND_LOW_RISK_ENABLED: 'true',
  },
  runtimeControls: {
    autoProcessEnabled: false,
    autoSendLowRiskEnabled: true,
  },
});
assert.equal(runtimeClosedBatch.items[0].operation, 'closed_loop_disabled');
assert.equal(runtimeClosedBatch.items[0].status, 'skipped');
assert.equal(isAutoProcessingSwitchFailure(runtimeClosedBatch.items[0]), true);
assert.equal(findAutoProcessingSwitchFailure(runtimeClosedBatch)?.operation, 'closed_loop_disabled');

const runtimeLowRiskClosedBatch = buildClosedLoopBatch({
  mails: [loopLowRisk],
  env: {
    ...writeEnv,
    FEISHU_AUTO_PROCESS_ENABLED: 'true',
    FEISHU_AUTO_SEND_LOW_RISK_ENABLED: 'true',
  },
  runtimeControls: {
    autoProcessEnabled: true,
    autoSendLowRiskEnabled: false,
  },
});
assert.equal(runtimeLowRiskClosedBatch.items[0].operation, 'auto_send_disabled');
assert.equal(runtimeLowRiskClosedBatch.items[0].status, 'skipped');
assert.equal(isAutoProcessingSwitchFailure(runtimeLowRiskClosedBatch.items[0]), true);

const runtimeApprovedSendClosedBatch = buildClosedLoopBatch({
  mails: [loopBlocked],
  env: {
    ...writeEnv,
    FEISHU_AUTO_PROCESS_ENABLED: 'true',
  },
  runtimeControls: {
    autoProcessEnabled: true,
    approvedSendEnabled: false,
  },
  reviews: {
    [loopBlocked.id]: { decision: 'reasonable' },
  },
  selectedReplies: {
    [loopBlocked.id]: { content: blocked.replyCandidates[1].content },
  },
});
assert.equal(runtimeApprovedSendClosedBatch.items[0].operation, 'approved_send_disabled');
assert.equal(runtimeApprovedSendClosedBatch.items[0].status, 'skipped');
assert.equal(isAutoProcessingSwitchFailure(runtimeApprovedSendClosedBatch.items[0]), true);
assert.match(
  buildAutoProcessingSwitchReminder(runtimeApprovedSendClosedBatch.items[0]),
  /打开右侧的“自动处理开关”/,
);
assert.equal(isAutoProcessingSwitchFailure({ mode: 'send_disabled', message: '真实发送开关关闭。' }), true);
assert.equal(isAutoProcessingSwitchFailure({ mode: 'approval_required', message: '该风险等级必须人工审批。' }), false);

const runtimeMediumApprovedSendClosedBatch = buildClosedLoopBatch({
  mails: [loopDraftOnly],
  env: {
    ...writeEnv,
    FEISHU_AUTO_PROCESS_ENABLED: 'true',
  },
  runtimeControls: {
    autoProcessEnabled: true,
    mediumApprovedSendEnabled: false,
    highRiskApprovedSendEnabled: true,
  },
  reviews: {
    [loopDraftOnly.id]: { decision: 'reasonable' },
  },
});
assert.equal(runtimeMediumApprovedSendClosedBatch.items[0].operation, 'approved_send_disabled');
assert.match(runtimeMediumApprovedSendClosedBatch.items[0].reasons[0], /中风险/);

const runtimeHighRiskApprovedSendClosedBatch = buildClosedLoopBatch({
  mails: [loopBlocked],
  env: {
    ...writeEnv,
    FEISHU_AUTO_PROCESS_ENABLED: 'true',
  },
  runtimeControls: {
    autoProcessEnabled: true,
    mediumApprovedSendEnabled: true,
    highRiskApprovedSendEnabled: false,
  },
  reviews: {
    [loopBlocked.id]: { decision: 'reasonable' },
  },
  selectedReplies: {
    [loopBlocked.id]: { content: blocked.replyCandidates[1].content },
  },
});
assert.equal(runtimeHighRiskApprovedSendClosedBatch.items[0].operation, 'approved_send_disabled');
assert.match(runtimeHighRiskApprovedSendClosedBatch.items[0].reasons[0], /高风险/);

const runtimeHighRiskGuardedApprovalBatch = buildClosedLoopBatch({
  mails: [{
    ...loopBlocked,
    sendGuard: {
      mode: 'blocked',
      reasons: ['高风险或已拦截邮件不能进入发送流程。'],
    },
  }],
  env: {
    ...writeEnv,
    FEISHU_AUTO_PROCESS_ENABLED: 'true',
  },
  runtimeControls: {
    autoProcessEnabled: true,
    highRiskApprovedSendEnabled: true,
  },
  reviews: {
    [loopBlocked.id]: { decision: 'reasonable' },
  },
  selectedReplies: {
    [loopBlocked.id]: { content: blocked.replyCandidates[1].content },
  },
});
assert.equal(runtimeHighRiskGuardedApprovalBatch.items[0].operation, 'manual_send_after_approval');

const hardDeleteDecision = buildWriteActionDecision({
  action: 'delete',
  mail: spam,
  recipient: spam.sender,
  env: writeEnv,
});
assert.equal(hardDeleteDecision.allowed, false);
assert.equal(hardDeleteDecision.mode, 'hard_delete_disabled');

assert.deepEqual(summarizeWriteActions([
  lowRiskWriteDecision,
  allowlistBlockedDecision,
  mediumWriteBeforeApproval,
  mediumWriteAfterApproval,
  spamArchiveDecision,
]), {
  total: 5,
  allowed: 3,
  blocked: 2,
  sendReady: 2,
  archiveReady: 1,
  approvalRequired: 1,
});

const sendRequest = buildFeishuSendMessageRequest({
  apiBase: DEFAULT_FEISHU_API_BASE,
  userMailboxId: 'service@example.test',
  userAccessToken: 'user-token-should-not-leak',
  recipient: 'buyer002@example.test',
  subject: 'Re: 我想查询订单',
  content: '您好，请补充订单号。',
  dedupeKey: 'dedupe-test-001',
});
assert.equal(
  sendRequest.url,
  `${DEFAULT_FEISHU_API_BASE}/mail/v1/user_mailboxes/service%40example.test/messages/send`,
);
assert.equal(sendRequest.options.method, 'POST');
assert.equal(sendRequest.options.headers.authorization, 'Bearer user-token-should-not-leak');
assert.deepEqual(JSON.parse(sendRequest.options.body), {
  subject: 'Re: 我想查询订单',
  to: [{ mail_address: 'buyer002@example.test' }],
  body_plain_text: '您好，请补充订单号。',
  dedupe_key: 'dedupe-test-001',
});

const archiveRequest = buildFeishuArchiveMessageRequest({
  apiBase: DEFAULT_FEISHU_API_BASE,
  userMailboxId: 'service@example.test',
  userAccessToken: 'user-token-should-not-leak',
  messageId: 'om_test_001',
  archiveFolderId: 'archive-folder-test',
});
assert.equal(archiveRequest.options.method, 'POST');
assert.equal(archiveRequest.options.headers.authorization, 'Bearer user-token-should-not-leak');
assert.deepEqual(JSON.parse(archiveRequest.options.body), {
  message_ids: ['om_test_001'],
  add_folder: 'archive-folder-test',
});

const botTextRequest = buildFeishuBotTextMessageRequest({
  apiBase: DEFAULT_FEISHU_API_BASE,
  tenantAccessToken: 'tenant-token-should-not-leak',
  recipient: 'ou_user_001',
  text: '工作台联调消息',
});
assert.equal(botTextRequest.url, `${DEFAULT_FEISHU_API_BASE}/im/v1/messages?receive_id_type=user_id`);
assert.equal(botTextRequest.options.method, 'POST');
assert.equal(botTextRequest.options.headers.authorization, 'Bearer tenant-token-should-not-leak');
assert.deepEqual(JSON.parse(botTextRequest.options.body), {
  receive_id: 'ou_user_001',
  msg_type: 'text',
  content: JSON.stringify({ text: '工作台联调消息' }),
});

const userIdRequest = buildFeishuBatchGetUserIdRequest({
  apiBase: DEFAULT_FEISHU_API_BASE,
  tenantAccessToken: 'tenant-token-should-not-leak',
  emails: ['owner@example.test'],
});
assert.equal(userIdRequest.url, `${DEFAULT_FEISHU_API_BASE}/contact/v3/users/batch_get_id?user_id_type=user_id`);
assert.equal(userIdRequest.options.method, 'POST');
assert.equal(userIdRequest.options.headers.authorization, 'Bearer tenant-token-should-not-leak');
assert.deepEqual(JSON.parse(userIdRequest.options.body), {
  emails: ['owner@example.test'],
});

const userInfoRequest = buildFeishuUserInfoRequest({
  apiBase: DEFAULT_FEISHU_API_BASE,
  userAccessToken: 'user-token-should-not-leak',
});
assert.equal(userInfoRequest.url, `${DEFAULT_FEISHU_API_BASE}/authen/v1/user_info`);
assert.equal(userInfoRequest.options.method, 'GET');
assert.equal(userInfoRequest.options.headers.authorization, 'Bearer user-token-should-not-leak');

const auditEvent = buildWriteAuditEvent({
  action: 'send',
  mail: lowRisk,
  decision: lowRiskWriteDecision,
  actor: 'operator@example.test',
  result: { ok: true, messageId: 'om_sent_001' },
});
assert.equal(auditEvent.action, 'send');
assert.equal(auditEvent.risk, 'low');
assert.equal(auditEvent.allowed, true);
assert.equal(auditEvent.result.ok, true);
assert.equal(JSON.stringify(auditEvent).includes('user-token-should-not-leak'), false);

const parsedLocalEnv = parseEnvContent(`
  # local only
  FEISHU_APP_ID=cli_test_app_id
  FEISHU_APP_SECRET="secret_only_in_local_env"
  FEISHU_USER_MAILBOX_ID='user-mailbox-test'
  FEISHU_MAIL_FOLDER_ID=INBOX
  EMPTY_VALUE=
  INVALID_LINE
`);
assert.deepEqual(parsedLocalEnv, {
  FEISHU_APP_ID: 'cli_test_app_id',
  FEISHU_APP_SECRET: 'secret_only_in_local_env',
  FEISHU_USER_MAILBOX_ID: 'user-mailbox-test',
  FEISHU_MAIL_FOLDER_ID: 'INBOX',
  EMPTY_VALUE: '',
});

assert.deepEqual(mergeLocalEnv({
  baseEnv: {
    FEISHU_APP_ID: 'from-shell',
  },
  localEnv: parsedLocalEnv,
}), {
  FEISHU_APP_ID: 'from-shell',
  FEISHU_APP_SECRET: 'secret_only_in_local_env',
  FEISHU_USER_MAILBOX_ID: 'user-mailbox-test',
  FEISHU_MAIL_FOLDER_ID: 'INBOX',
  EMPTY_VALUE: '',
});

const tenantTokenRequest = buildTenantAccessTokenRequest({
  appId: 'cli_test_app_id',
  appSecret: 'secret_only_on_server',
});
assert.equal(
  tenantTokenRequest.url,
  `${DEFAULT_FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`,
);
assert.equal(tenantTokenRequest.options.method, 'POST');
assert.deepEqual(JSON.parse(tenantTokenRequest.options.body), {
  app_id: 'cli_test_app_id',
  app_secret: 'secret_only_on_server',
});

const oauthAuthorizeUrl = new URL(buildFeishuOAuthAuthorizeUrl({
  appId: 'cli_test_app_id',
  redirectUri: 'http://127.0.0.1:5175/oauth/callback',
  state: 'mail-workbench-test',
  scope: 'mail:user_mailbox.message:send im:message:send_as_bot',
}));
assert.equal(oauthAuthorizeUrl.origin + oauthAuthorizeUrl.pathname, `${DEFAULT_FEISHU_API_BASE}/authen/v1/index`);
assert.equal(oauthAuthorizeUrl.searchParams.get('app_id'), 'cli_test_app_id');
assert.equal(oauthAuthorizeUrl.searchParams.get('redirect_uri'), 'http://127.0.0.1:5175/oauth/callback');
assert.equal(oauthAuthorizeUrl.searchParams.get('state'), 'mail-workbench-test');
assert.equal(oauthAuthorizeUrl.searchParams.get('scope'), 'mail:user_mailbox.message:send im:message:send_as_bot');

const userTokenRequest = buildFeishuUserAccessTokenRequest({
  appId: 'cli_test_app_id',
  appSecret: 'secret_only_on_server',
  code: 'auth-code-test',
  redirectUri: 'http://127.0.0.1:5175/oauth/callback',
});
assert.equal(userTokenRequest.url, `${DEFAULT_FEISHU_API_BASE}/authen/v2/oauth/token`);
assert.equal(userTokenRequest.options.method, 'POST');
assert.deepEqual(JSON.parse(userTokenRequest.options.body), {
  grant_type: 'authorization_code',
  client_id: 'cli_test_app_id',
  client_secret: 'secret_only_on_server',
  code: 'auth-code-test',
  redirect_uri: 'http://127.0.0.1:5175/oauth/callback',
});

const refreshUserTokenRequest = buildFeishuRefreshUserAccessTokenRequest({
  appId: 'cli_test_app_id',
  appSecret: 'secret_only_on_server',
  refreshToken: 'refresh-token-should-not-leak',
});
assert.equal(refreshUserTokenRequest.url, `${DEFAULT_FEISHU_API_BASE}/authen/v2/oauth/token`);
assert.equal(refreshUserTokenRequest.options.method, 'POST');
assert.deepEqual(JSON.parse(refreshUserTokenRequest.options.body), {
  grant_type: 'refresh_token',
  client_id: 'cli_test_app_id',
  client_secret: 'secret_only_on_server',
  refresh_token: 'refresh-token-should-not-leak',
});

assert.equal(
  buildFeishuMailListUrl({
    userMailboxId: 'user-mailbox-test',
    pageSize: 10,
    pageToken: 'next-page',
  }),
  `${DEFAULT_FEISHU_API_BASE}/mail/v1/user_mailboxes/user-mailbox-test/messages?page_size=10&folder_id=INBOX&page_token=next-page`,
);

assert.equal(
  buildFeishuMailListUrl({
    userMailboxId: 'user-mailbox-test',
    pageSize: 10,
    folderId: 'folder-test',
  }),
  `${DEFAULT_FEISHU_API_BASE}/mail/v1/user_mailboxes/user-mailbox-test/messages?page_size=10&folder_id=folder-test`,
);

assert.equal(
  buildFeishuMailListUrl({
    userMailboxId: 'user-mailbox-test',
    pageSize: 10,
    folderId: '',
    labelId: 'label-test',
  }),
  `${DEFAULT_FEISHU_API_BASE}/mail/v1/user_mailboxes/user-mailbox-test/messages?page_size=10&label_id=label-test`,
);

assert.equal(
  buildFeishuMailFolderListUrl({
    userMailboxId: 'service@example.test',
    pageSize: 20,
    pageToken: 'folder-next-page',
  }),
  `${DEFAULT_FEISHU_API_BASE}/mail/v1/user_mailboxes/service%40example.test/folders?page_size=20&page_token=folder-next-page`,
);

const createFolderRequest = buildFeishuCreateMailFolderRequest({
  apiBase: DEFAULT_FEISHU_API_BASE,
  userMailboxId: 'service@example.test',
  tenantAccessToken: 'tenant-token-should-not-leak',
  name: '工作台归档',
  parentFolderId: '0',
});
assert.equal(createFolderRequest.url, `${DEFAULT_FEISHU_API_BASE}/mail/v1/user_mailboxes/service%40example.test/folders`);
assert.equal(createFolderRequest.options.method, 'POST');
assert.equal(createFolderRequest.options.headers.authorization, 'Bearer tenant-token-should-not-leak');
assert.deepEqual(JSON.parse(createFolderRequest.options.body), {
  name: '工作台归档',
  parent_folder_id: '0',
});

assert.equal(normalizeFeishuPageSize(3), 3);
assert.equal(normalizeFeishuPageSize(20), 20);
assert.equal(normalizeFeishuPageSize(30), 20);
assert.equal(normalizeFeishuPageSize('bad'), 20);

assert.equal(
  buildFeishuMessageDetailUrl({
    userMailboxId: 'user-mailbox-test',
    messageId: 'om_real_test_001',
  }),
  `${DEFAULT_FEISHU_API_BASE}/mail/v1/user_mailboxes/user-mailbox-test/messages/om_real_test_001`,
);
assert.equal(decodeFeishuBodyText('5a6i5oi35oOz5p+l6K+i6K6i5Y2V'), '客户想查询订单');
assert.equal(decodeFeishuBodyText('5oKo5aW977yM\\n6K+36Zeu5Lu35qC85aSa5bCR'), '您好，请问价格多少');
assert.equal(decodeFeishuBodyText('6K-36Zeu572R56uZ5oCO5LmI5omT5byA'.replace('-', '+')), '请问网站怎么打开');
assert.equal(decodeFeishuBodyText('客户想查询订单'), '客户想查询订单');

const normalizedFeishuIdListResponse = normalizeFeishuMailListResponse({
  code: 0,
  msg: 'success',
  data: {
    has_more: false,
    items: ['om_real_test_001'],
  },
});
assert.deepEqual(normalizedFeishuIdListResponse.messageIds, ['om_real_test_001']);
assert.equal(normalizedFeishuIdListResponse.messages[0].message_id, 'om_real_test_001');

const normalizedFeishuResponse = normalizeFeishuMailListResponse({
  code: 0,
  msg: 'success',
  data: {
    has_more: true,
    page_token: 'next-page',
    items: [
      {
        message_id: 'om_real_test_001',
        thread_id: 'omt_real_test_001',
        subject: 'Order status',
        from: {
          email: 'buyer032@example.test',
        },
        create_time: '2026-06-11T10:00:00+08:00',
        body_preview: '客户询问订单状态。',
      },
    ],
  },
});
assert.equal(normalizedFeishuResponse.hasMore, true);
assert.equal(normalizedFeishuResponse.pageToken, 'next-page');
assert.deepEqual(normalizedFeishuResponse.messages[0], {
  message_id: 'om_real_test_001',
  thread_id: 'omt_real_test_001',
  subject: 'Order status',
  from: {
    email: 'buyer032@example.test',
  },
  received_at: '2026-06-11T10:00:00+08:00',
  body_preview: '客户询问订单状态。',
  body_text: '客户询问订单状态。',
  labels: [],
  expected_thread_id: 'omt_real_test_001',
});

const normalizedFolderListResponse = normalizeFeishuMailFolderListResponse({
  code: 0,
  msg: 'success',
  data: {
    has_more: false,
    items: [
      {
        folder_id: 'folder-archive-001',
        name: '工作台归档',
        parent_folder_id: '0',
      },
    ],
  },
});
assert.equal(normalizedFolderListResponse.folders[0].folder_id, 'folder-archive-001');
assert.equal(normalizedFolderListResponse.folders[0].name, '工作台归档');
assert.equal(normalizedFolderListResponse.hasMore, false);

assert.deepEqual(normalizeFeishuCreateMailFolderResponse({
  code: 0,
  msg: 'success',
  data: {
    folder: {
      folder_id: 'folder-archive-002',
      name: '工作台归档',
      parent_folder_id: '0',
    },
  },
}), {
  folder_id: 'folder-archive-002',
  name: '工作台归档',
  parent_folder_id: '0',
});

assert.deepEqual(normalizeFeishuBatchGetUserIdResponse({
  code: 0,
  msg: 'success',
  data: {
    user_list: [
      {
        email: 'owner@example.test',
        user_id: 'ou_user_001',
      },
    ],
  },
}), [
  {
    email: 'owner@example.test',
    user_id: 'ou_user_001',
  },
]);

assert.deepEqual(normalizeFeishuUserInfoResponse({
  code: 0,
  msg: 'success',
  data: {
    user_id: 'ou_user_001',
    open_id: 'ou_open_001',
  },
}), {
  user_id: 'ou_user_001',
  open_id: 'ou_open_001',
});

assert.deepEqual(normalizeFeishuMessageDetailResponse({
  code: 0,
  msg: 'ok',
  data: {
    message: {
      message_id: 'om_real_test_003',
      thread_id: 'omt_real_test_003',
      subject: '订单查询',
      head_from: {
        mail_address: 'buyer034@example.test',
        name: '测试买家',
      },
      internal_date: '1718086200000',
      body_plain_text: '5a6i5oi35oOz5p+l6K+i6K6i5Y2V77yM5L2G5piv5rKh5pyJ5o+Q5L6b6K6i5Y2V5Y+377yB',
      label_ids: ['INBOX'],
    },
  },
}), {
  message_id: 'om_real_test_003',
  thread_id: 'omt_real_test_003',
  subject: '订单查询',
  from: {
    email: 'buyer034@example.test',
  },
  received_at: '1718086200000',
  body_preview: '客户想查询订单，但是没有提供订单号！',
  body_text: '客户想查询订单，但是没有提供订单号！',
  labels: ['INBOX'],
  expected_thread_id: 'omt_real_test_003',
});

const unsafeApiReadiness = buildApiReadiness({
  config: {
    appId: 'cli_test_app_id',
    mailboxAddress: 'service@example.test',
    app_secret: 'unsafe',
  },
  permissions: {
    mailRead: true,
    mailDraft: true,
    mailSend: true,
    mailboxManage: true,
  },
});
assert.equal(unsafeApiReadiness.readyForReadSimulation, false);
assert.equal(unsafeApiReadiness.readyForRealSend, false);
assert.deepEqual(unsafeApiReadiness.secretIssues, [
  '禁止在工作台保存敏感字段：app_secret。',
]);

assert.ok(LAUNCH_CHECKLIST_ITEMS.some((item) => item.key === 'rulesApproved'));
assert.ok(LAUNCH_CHECKLIST_ITEMS.some((item) => item.key === 'secretsExternalOnly'));
assert.ok(LAUNCH_CHECKLIST_ITEMS.some((item) => item.key === 'rollbackPlan'));

const launchChecklist = buildLaunchChecklist({
  apiReadiness,
  workflowSummary: summarizeDraftWorkflow([lowRiskQueueItem, mediumQueueAfterReview]),
  testStatus: {
    rulesPassed: true,
    syntaxPassed: true,
  },
  docsUpdated: true,
  templateLibraryReady: true,
  rollbackPlanReady: false,
  productionSendApproved: false,
});
assert.equal(launchChecklist.readyForReadApi, true);
assert.equal(launchChecklist.readyForRealSend, false);
assert.equal(launchChecklist.summary.blocked, 2);
assert.ok(launchChecklist.items.find((item) => item.key === 'rollbackPlan').status === 'blocked');
assert.ok(launchChecklist.items.find((item) => item.key === 'productionSendApproval').status === 'blocked');

const unsafeLaunchChecklist = buildLaunchChecklist({
  apiReadiness: unsafeApiReadiness,
  workflowSummary: summarizeDraftWorkflow([blockedQueueItem]),
  testStatus: {
    rulesPassed: false,
    syntaxPassed: true,
  },
  docsUpdated: false,
  templateLibraryReady: false,
  rollbackPlanReady: false,
  productionSendApproved: false,
});
assert.equal(unsafeLaunchChecklist.readyForReadApi, false);
assert.equal(unsafeLaunchChecklist.readyForRealSend, false);
assert.ok(unsafeLaunchChecklist.summary.blocked >= 5);

assert.deepEqual(DATA_SOURCE_STATUSES, [
  '真实接入',
  'API 待接入',
  'CSV',
]);

assert.ok(orderSamples.length >= 5);
assert.ok(orderSamples.every((order) => order.orderId.startsWith('SANDBOX-')));
assert.ok(orderSamples.every((order) => ['CSV', 'mock'].includes(order.sourceStatus)));

const bossDashboard = buildBossDashboard({
  mails: sampleMails,
  messages: createMockFeishuMessages(sampleMails),
  orderSamples,
  reviews: secondReview,
  agentConfig: normalizedAgentConfig,
  writeStatus: writeStatusReady,
});

assert.equal(bossDashboard.overview.syncedDataSources, 2);
assert.equal(bossDashboard.overview.targetDataSources, 6);
assert.equal(bossDashboard.overview.totalMailCount, sampleMails.length);
assert.ok(bossDashboard.overview.pendingItems >= 1);
assert.ok(bossDashboard.overview.highPriorityExceptions >= sampleSummary.high);
assert.equal(bossDashboard.overview.realSendEnabled, true);
assert.equal(bossDashboard.overview.realArchiveEnabled, true);
assert.equal(bossDashboard.overview.writeAllowlistCount, 3);
assert.equal(bossDashboard.overview.hardDeleteEnabled, false);
assert.equal(bossDashboard.agentRuntime.modelId, 'openai-compatible');
assert.equal(bossDashboard.agentRuntime.realModelConnected, false);
assert.match(bossDashboard.agentRuntime.sourceStatus, /API 待接入/);
assert.ok(bossDashboard.agentRuntime.knowledgeBaseLabels.includes('禁用表达'));
assert.match(bossDashboard.overview.dataTrustText, /真实接入/);
assert.match(bossDashboard.overview.dataTrustText, /CSV/);
assert.match(bossDashboard.overview.dataTrustText, /API 待接入/);
assert.equal(bossDashboard.processingAnalysis.riskDistribution.low, sampleSummary.low);
assert.equal(bossDashboard.processingAnalysis.riskDistribution.medium, sampleSummary.medium);
assert.equal(bossDashboard.processingAnalysis.riskDistribution.high, sampleSummary.high);
assert.equal(bossDashboard.processingAnalysis.riskDistribution.spam, sampleSummary.spam);
assert.equal(bossDashboard.processingAnalysis.actionDistribution.autoReply, sampleSummary.autoReply);
assert.equal(bossDashboard.processingAnalysis.actionDistribution.draftOnly, sampleSummary.draftOnly);
assert.equal(bossDashboard.processingAnalysis.actionDistribution.blocked, sampleSummary.blocked);
assert.equal(bossDashboard.processingAnalysis.actionDistribution.ignored, sampleSummary.ignored);
assert.equal(bossDashboard.processingReport.headlineMetrics.length, 6);
assert.ok(bossDashboard.processingReport.headlineMetrics.some((metric) => metric.key === 'draft_count'));
assert.ok(bossDashboard.processingReport.analysisRows.some((row) => row.name === '真实写操作'));
assert.ok(bossDashboard.processingReport.exceptionItems.every((item) => item.kind === 'mail'));
assert.equal(Object.hasOwn(bossDashboard.acceptance, 'completed'), false);
assert.equal(Object.hasOwn(bossDashboard.acceptance, 'notCompleted'), false);
assert.equal(Object.hasOwn(bossDashboard.acceptance, 'blockers'), false);
assert.equal(Object.hasOwn(bossDashboard.acceptance, 'nextWeekPlan'), false);
assert.ok(bossDashboard.processingAnalysis.sourceRows.every((row) => row.sourceStatus));
assert.ok(bossDashboard.processingAnalysis.exceptionItems.every((item) => item.kind === 'mail'));
assert.ok(bossDashboard.processingAnalysis.boundaryNotes.some((note) => note.includes('退款/赔偿')));

assert.ok(bossDashboard.dataSources.some((source) => source.name === '飞书邮箱' && source.sourceStatus === '真实接入'));
assert.ok(bossDashboard.dataSources.some((source) => source.name === 'ERP / 订单' && source.sourceStatus === 'CSV'));

assert.ok(bossDashboard.mailPriorityQueue.length >= 8);
assert.ok(bossDashboard.mailPriorityQueue.some((mail) => mail.priority === '高' && mail.sourceStatus === '真实接入'));
assert.ok(bossDashboard.orderExamples.some((order) => order.risk === 'high' && order.sourceStatus === 'CSV'));

assert.deepEqual(bossDashboard.acceptance.disabledHighRiskActions, [
  '退款自动处理',
  '改价自动处理',
  '发货时间承诺',
  '赔偿承诺',
  '高风险自动回复',
]);
assert.equal(bossDashboard.acceptance.canRunPage, true);
assert.equal(bossDashboard.acceptance.demoBoundaryClear, false);

const bossDashboardPayload = buildBossDashboardPayload({
  dashboard: bossDashboard,
  generatedAt: '2026-06-11T00:00:00.000Z',
});
assert.equal(bossDashboardPayload.apiVersion, BOSS_DASHBOARD_API_VERSION);
assert.equal(bossDashboardPayload.endpoint, '/data/boss-dashboard.json');
assert.equal(bossDashboardPayload.generatedAt, '2026-06-11T00:00:00.000Z');
assert.equal(bossDashboardPayload.data.overview.realSendEnabled, true);
assert.equal(bossDashboardPayload.boundary.realMailSendEnabled, true);
assert.equal(bossDashboardPayload.boundary.realMailArchiveEnabled, true);
assert.equal(bossDashboardPayload.boundary.hardDeleteEnabled, false);
assert.equal(bossDashboardPayload.boundary.writeAllowlistCount, 3);
assert.equal(bossDashboardPayload.boundary.realFeishuApiConnected, true);
assert.ok(bossDashboardPayload.data.acceptance.disabledHighRiskActions.includes('退款自动处理'));

const bossDashboardSnapshot = JSON.parse(readFileSync(
  new URL('../data/boss-dashboard.json', import.meta.url),
  'utf8',
));
assert.equal(bossDashboardSnapshot.apiVersion, BOSS_DASHBOARD_API_VERSION);
assert.equal(bossDashboardSnapshot.endpoint, '/data/boss-dashboard.json');
assert.equal(bossDashboardSnapshot.data.overview.realSendEnabled, false);
assert.equal(bossDashboardSnapshot.boundary.realMailSendEnabled, false);
assert.equal(bossDashboardSnapshot.boundary.realMailArchiveEnabled, false);
assert.equal(bossDashboardSnapshot.boundary.hardDeleteEnabled, false);
assert.equal(bossDashboardSnapshot.data.overview.totalMailCount, 0);
assert.equal(bossDashboardSnapshot.data.overview.sourceStatus, 'API 待接入');
assert.equal(bossDashboardSnapshot.data.dataSources.find((source) => source.name === '飞书邮箱').sourceStatus, 'API 待接入');

const liveApiDashboard = buildBossDashboard({
  mails: [lowRisk, draftOnly],
  messages: createMockFeishuMessages([lowRisk, draftOnly]),
  orderSamples: [],
  reviews: {},
  agentConfig: normalizedAgentConfig,
  writeStatus: writeStatusReady,
});
assert.equal(liveApiDashboard.overview.totalMailCount, 2);
assert.equal(liveApiDashboard.overview.sourceStatus, '真实接入');
assert.equal(liveApiDashboard.dataSources.find((source) => source.name === '飞书邮箱').sourceStatus, '真实接入');
assert.ok(liveApiDashboard.processingReport.sourceTrustRows.every((row) => row.sourceStatus !== '飞书邮箱测试数据'));

const emptyApiDashboard = buildBossDashboard();
assert.equal(emptyApiDashboard.overview.totalMailCount, 0);
assert.equal(emptyApiDashboard.dataSources.find((source) => source.name === '飞书邮箱').sourceStatus, 'API 待接入');
assert.equal(emptyApiDashboard.mailPriorityQueue.length, 0);

const serverEntryPath = fileURLToPath(new URL('../server/feishuApiServer.mjs', import.meta.url));
assert.equal(isCliEntryPoint(pathToFileURL(serverEntryPath).href, serverEntryPath), true);
assert.equal(isCliEntryPoint(pathToFileURL(serverEntryPath).href, '/tmp/other-entry.mjs'), false);
const serverSource = readFileSync(new URL('../server/feishuApiServer.mjs', import.meta.url), 'utf8');
const apiLaunchAgentInstallerSource = readFileSync(new URL('../scripts/installFeishuApiLaunchAgent.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(packageJson.scripts.start, 'node server/feishuApiServer.mjs');
assert.match(serverSource, /process\.env\.HOST\s*\|\|\s*'0\.0\.0\.0'/);
assert.match(apiLaunchAgentInstallerSource, /<key>HOST<\/key>\s*<string>127\.0\.0\.1<\/string>/);
assert.equal(resolveWorkbenchDataRoot({
  rootDir: '/app/workbench',
  env: {},
}), resolve('/app/workbench'));
assert.equal(resolveWorkbenchDataRoot({
  rootDir: '/app/workbench',
  env: { RAILWAY_VOLUME_MOUNT_PATH: '/railway-volume' },
}), resolve('/railway-volume'));
assert.equal(resolveWorkbenchDataRoot({
  rootDir: '/app/workbench',
  env: { WORKBENCH_DATA_DIR: '/workbench-data', RAILWAY_VOLUME_MOUNT_PATH: '/railway-volume' },
}), resolve('/workbench-data'));

async function withTestServer(server, fn) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function waitForCondition(predicate, {
  timeoutMs = 1000,
  intervalMs = 25,
} = {}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return true;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }

  return false;
}

function cookieHeaderFromResponse(response) {
  return String(response.headers.get('set-cookie') || '')
    .split(',')
    .map((part) => part.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

const authStoreRoot = mkdtempSync(join(tmpdir(), 'workbench-auth-store-'));
try {
  const authStore = createWorkbenchAuthStore({ rootDir: authStoreRoot });
  const created = await authStore.createUser({
    phone: '18800000000',
    password: 'StrongPass123',
  });

  assert.equal(created.user.phone, '18800000000');
  assert.equal(created.user.password, undefined);
  assert.equal(created.rawRecord.password, undefined);
  assert.notEqual(created.rawRecord.passwordHash, 'StrongPass123');
  assert.equal(await authStore.verifyPassword('18800000000', 'StrongPass123'), true);
  assert.equal(await authStore.verifyPassword('18800000000', 'wrong-password'), false);
  await authStore.updatePassword({ phone: '18800000000', newPassword: 'ChangedPass123' });
  assert.equal(await authStore.verifyPassword('18800000000', 'StrongPass123'), false);
  assert.equal(await authStore.verifyPassword('18800000000', 'ChangedPass123'), true);
  const countryCodeUser = await authStore.createUser({
    phone: '+86 17694856832',
    password: 'CountryCodePass123',
  });
  assert.equal(countryCodeUser.user.phone, '17694856832');
  assert.equal(await authStore.verifyPassword('17694856832', 'CountryCodePass123'), true);
  assert.equal(await authStore.verifyPassword('8617694856832', 'CountryCodePass123'), true);

  const session = await authStore.createSession({
    phone: '18800000000',
    rememberLogin: true,
  });
  assert.equal(session.user.phone, '18800000000');
  assert.equal(typeof session.token, 'string');
  assert.equal(session.token.length > 40, true);
  assert.equal((await authStore.findSession(session.token)).user.phone, '18800000000');
  await authStore.deleteSession(session.token);
  assert.equal(await authStore.findSession(session.token), null);
} finally {
  rmSync(authStoreRoot, { recursive: true, force: true });
}

const authApiRoot = mkdtempSync(join(tmpdir(), 'workbench-auth-api-'));
try {
  await withTestServer(createFeishuApiServer({
    rootDir: new URL('../', import.meta.url),
    env: {
      WORKBENCH_AUTH_REQUIRED: 'true',
      WORKBENCH_DATA_DIR: authApiRoot,
      WORKBENCH_SIGNUP_INVITE_CODE: 'invite-code',
      WORKBENCH_SESSION_SECRET: 'test-session-secret',
      WORKBENCH_CAPTCHA_REQUIRED: 'false',
      FEISHU_APP_ID: 'cli_test_app_id',
    },
    fetchImpl: async () => {
      throw new Error('认证门禁测试不应该请求外部 API。');
    },
  }), async (baseUrl) => {
    const meBeforeLoginResponse = await fetch(`${baseUrl}/api/workbench-auth/me`);
    const meBeforeLoginPayload = await meBeforeLoginResponse.json();
    assert.equal(meBeforeLoginResponse.status, 401);
    assert.equal(meBeforeLoginPayload.ok, false);

    const blockedMessagesResponse = await fetch(`${baseUrl}/api/feishu/mail/messages?all=true&page_size=1`);
    assert.equal(blockedMessagesResponse.status, 401);

    const blockedProcessResponse = await fetch(`${baseUrl}/api/email-ai/process`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject: 'test' }),
    });
    assert.equal(blockedProcessResponse.status, 401);

    const blockedActionResponse = await fetch(`${baseUrl}/api/feishu/mail/actions/process`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(blockedActionResponse.status, 401);

    const registerWithoutInviteResponse = await fetch(`${baseUrl}/api/workbench-auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '18800000000',
        password: 'StrongPass123',
      }),
    });
    assert.equal(registerWithoutInviteResponse.status, 403);

    const registerResponse = await fetch(`${baseUrl}/api/workbench-auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '18800000000',
        password: 'StrongPass123',
        inviteCode: 'invite-code',
        rememberLogin: true,
      }),
    });
    const registerPayload = await registerResponse.json();
    const registerCookie = cookieHeaderFromResponse(registerResponse);
    assert.equal(registerResponse.status, 201);
    assert.equal(registerPayload.ok, true);
    assert.equal(registerPayload.user.phone, '18800000000');
    assert.match(registerResponse.headers.get('set-cookie'), /workbench_session=/);
    assert.match(registerResponse.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(registerResponse.headers.get('set-cookie'), /Max-Age=2592000/);

    const meResponse = await fetch(`${baseUrl}/api/workbench-auth/me`, {
      headers: { cookie: registerCookie },
    });
    const mePayload = await meResponse.json();
    assert.equal(meResponse.status, 200);
    assert.equal(mePayload.user.phone, '18800000000');

    const rawStore = JSON.parse(readFileSync(join(authApiRoot, 'data/workbench-auth-store.json'), 'utf8'));
    assert.equal(rawStore.users[0].password, undefined);
    assert.notEqual(rawStore.users[0].passwordHash, 'StrongPass123');

    const logoutResponse = await fetch(`${baseUrl}/api/workbench-auth/logout`, {
      method: 'POST',
      headers: { cookie: registerCookie },
    });
    assert.equal(logoutResponse.status, 200);

    const meAfterLogoutResponse = await fetch(`${baseUrl}/api/workbench-auth/me`, {
      headers: { cookie: registerCookie },
    });
    assert.equal(meAfterLogoutResponse.status, 401);

    const wrongPasswordResponse = await fetch(`${baseUrl}/api/workbench-auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '18800000000',
        password: 'wrong-password',
      }),
    });
    assert.equal(wrongPasswordResponse.status, 401);

    const loginResponse = await fetch(`${baseUrl}/api/workbench-auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '18800000000',
        password: 'StrongPass123',
      }),
    });
    const loginCookie = cookieHeaderFromResponse(loginResponse);
    assert.equal(loginResponse.status, 200);
    assert.match(loginResponse.headers.get('set-cookie'), /workbench_session=/);
    assert.match(loginResponse.headers.get('set-cookie'), /Max-Age=28800/);

    const unauthenticatedChangePasswordResponse = await fetch(`${baseUrl}/api/workbench-auth/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'StrongPass123',
        newPassword: 'ChangedPass123',
      }),
    });
    assert.equal(unauthenticatedChangePasswordResponse.status, 401);

    const wrongCurrentPasswordResponse = await fetch(`${baseUrl}/api/workbench-auth/change-password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: loginCookie,
      },
      body: JSON.stringify({
        currentPassword: 'wrong-password',
        newPassword: 'ChangedPass123',
      }),
    });
    assert.equal(wrongCurrentPasswordResponse.status, 401);

    const changePasswordResponse = await fetch(`${baseUrl}/api/workbench-auth/change-password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: loginCookie,
      },
      body: JSON.stringify({
        currentPassword: 'StrongPass123',
        newPassword: 'ChangedPass123',
      }),
    });
    const changePasswordCookie = cookieHeaderFromResponse(changePasswordResponse);
    assert.equal(changePasswordResponse.status, 200);
    assert.match(changePasswordResponse.headers.get('set-cookie'), /workbench_session=/);

    const oldPasswordAfterChangeResponse = await fetch(`${baseUrl}/api/workbench-auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '18800000000',
        password: 'StrongPass123',
      }),
    });
    assert.equal(oldPasswordAfterChangeResponse.status, 401);

    const newPasswordAfterChangeResponse = await fetch(`${baseUrl}/api/workbench-auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '18800000000',
        password: 'ChangedPass123',
      }),
    });
    assert.equal(newPasswordAfterChangeResponse.status, 200);

    const wrongResetCodeResponse = await fetch(`${baseUrl}/api/workbench-auth/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '18800000000',
        newPassword: 'ResetPass123',
        resetCode: 'wrong-code',
      }),
    });
    assert.equal(wrongResetCodeResponse.status, 403);

    const resetPasswordResponse = await fetch(`${baseUrl}/api/workbench-auth/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '18800000000',
        newPassword: 'ResetPass123',
        resetCode: 'invite-code',
      }),
    });
    assert.equal(resetPasswordResponse.status, 200);
    assert.match(resetPasswordResponse.headers.get('set-cookie'), /workbench_session=/);
    const resetPasswordCookie = cookieHeaderFromResponse(resetPasswordResponse);

    const changedPasswordAfterResetResponse = await fetch(`${baseUrl}/api/workbench-auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '18800000000',
        password: 'ChangedPass123',
      }),
    });
    assert.equal(changedPasswordAfterResetResponse.status, 401);

    const resetPasswordLoginResponse = await fetch(`${baseUrl}/api/workbench-auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '18800000000',
        password: 'ResetPass123',
      }),
    });
    assert.equal(resetPasswordLoginResponse.status, 200);
    const resetPasswordLoginCookie = cookieHeaderFromResponse(resetPasswordLoginResponse);

    const authenticatedMessagesResponse = await fetch(`${baseUrl}/api/feishu/mail/messages?all=true&page_size=1`, {
      headers: { cookie: resetPasswordLoginCookie || resetPasswordCookie || changePasswordCookie },
    });
    assert.notEqual(authenticatedMessagesResponse.status, 401);

    const countryCodeRegisterResponse = await fetch(`${baseUrl}/api/workbench-auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '+86 17694856832',
        password: 'CountryCodePass123',
        inviteCode: 'invite-code',
      }),
    });
    const countryCodeRegisterPayload = await countryCodeRegisterResponse.json();
    assert.equal(countryCodeRegisterResponse.status, 201);
    assert.equal(countryCodeRegisterPayload.user.phone, '17694856832');

    const countryCodeLoginResponse = await fetch(`${baseUrl}/api/workbench-auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '17694856832',
        password: 'CountryCodePass123',
      }),
    });
    assert.equal(countryCodeLoginResponse.status, 200);

    const countryCodeResetResponse = await fetch(`${baseUrl}/api/workbench-auth/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '8617694856832',
        newPassword: 'CountryReset123',
        resetCode: 'invite-code',
      }),
    });
    assert.equal(countryCodeResetResponse.status, 200);

    const statusAfterAuthResponse = await fetch(`${baseUrl}/api/feishu/status`);
    const statusAfterAuthPayload = await statusAfterAuthResponse.json();
    assert.equal(statusAfterAuthPayload.workbenchAuth.storeFileExists, true);
    assert.equal(statusAfterAuthPayload.workbenchAuth.hasUsers, true);
    assert.equal(statusAfterAuthPayload.workbenchAuth.userCount >= 2, true);
    assert.equal(JSON.stringify(statusAfterAuthPayload.workbenchAuth).includes('17694856832'), false);
  });
} finally {
  rmSync(authApiRoot, { recursive: true, force: true });
}

const captchaApiRoot = mkdtempSync(join(tmpdir(), 'workbench-auth-captcha-'));
try {
  await withTestServer(createFeishuApiServer({
    rootDir: new URL('../', import.meta.url),
    env: {
      WORKBENCH_AUTH_REQUIRED: 'true',
      WORKBENCH_DATA_DIR: captchaApiRoot,
      WORKBENCH_SIGNUP_INVITE_CODE: 'invite-code',
      WORKBENCH_SESSION_SECRET: 'test-session-secret',
      WORKBENCH_CAPTCHA_REQUIRED: 'true',
      WORKBENCH_CAPTCHA_PROVIDER: 'turnstile',
      TURNSTILE_SITE_KEY: 'site-key-test',
      TURNSTILE_SECRET_KEY: 'secret-key-test',
      FEISHU_APP_ID: 'cli_test_app_id',
    },
    fetchImpl: async () => {
      throw new Error('缺少验证码时不应该请求外部 API。');
    },
  }), async (baseUrl) => {
    const captchaConfigResponse = await fetch(`${baseUrl}/api/workbench-auth/captcha/config`);
    const captchaConfigPayload = await captchaConfigResponse.json();
    assert.equal(captchaConfigResponse.status, 200);
    assert.equal(captchaConfigPayload.required, true);
    assert.equal(captchaConfigPayload.provider, 'turnstile');
    assert.equal(captchaConfigPayload.siteKey, 'site-key-test');
    assert.equal(JSON.stringify(captchaConfigPayload).includes('secret-key-test'), false);

    const loginWithoutCaptchaResponse = await fetch(`${baseUrl}/api/workbench-auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '18800000000',
        password: 'StrongPass123',
      }),
    });
    const loginWithoutCaptchaPayload = await loginWithoutCaptchaResponse.json();
    assert.equal(loginWithoutCaptchaResponse.status, 400);
    assert.match(loginWithoutCaptchaPayload.message, /真人验证/);
  });
} finally {
  rmSync(captchaApiRoot, { recursive: true, force: true });
}

{
  const verification = await verifyWorkbenchCaptcha({
    env: {
      WORKBENCH_CAPTCHA_REQUIRED: 'true',
      WORKBENCH_CAPTCHA_PROVIDER: 'turnstile',
      TURNSTILE_SITE_KEY: 'site-key-test',
      TURNSTILE_SECRET_KEY: 'secret-key-test',
    },
    token: 'customer-token',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        success: false,
        'error-codes': ['invalid-input-secret'],
      }),
    }),
  });
  assert.equal(verification.ok, false);
  assert.deepEqual(verification.errorCodes, ['invalid-input-secret']);
  assert.match(verification.message, /Secret Key.*Site Key|密钥/);
}

await withTestServer(createFeishuApiServer({
  rootDir: new URL('../', import.meta.url),
  env: {
    RAILWAY_PUBLIC_DOMAIN: 'workbench.example.test',
    FEISHU_APP_ID: 'cli_test_app_id',
  },
  fetchImpl: async () => {
    throw new Error('Railway 默认认证门禁不应该请求外部 API。');
  },
}), async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/feishu/mail/messages?all=true&page_size=1`);
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error, 'workbench_auth_required');
});

await withTestServer(createFeishuApiServer({
  rootDir: new URL('../', import.meta.url),
  env: {
    FEISHU_APP_ID: 'cli_test_app_id',
  },
  fetchImpl: async () => {
    throw new Error('缺配置时不应该请求飞书 API。');
  },
}), async (baseUrl) => {
  const statusResponse = await fetch(`${baseUrl}/api/feishu/status`);
  const statusPayload = await statusResponse.json();
  assert.equal(statusResponse.status, 200);
  assert.equal(statusPayload.configured, false);
  assert.deepEqual(statusPayload.missing, [
    'FEISHU_APP_SECRET',
    'FEISHU_USER_MAILBOX_ID',
  ]);
  assert.equal(statusPayload.sourceStatus, 'API 待接入');
  assert.equal(statusPayload.realSendEnabled, false);
  assert.equal(statusPayload.mailSync.enabled, false);
  assert.equal(JSON.stringify(statusPayload).includes('cli_test_app_id'), false);

  const messagesResponse = await fetch(`${baseUrl}/api/feishu/mail/messages?page_size=5`);
  const messagesPayload = await messagesResponse.json();
  assert.equal(messagesResponse.status, 503);
  assert.equal(messagesPayload.ok, false);
  assert.equal(messagesPayload.error, 'missing_feishu_env');
  assert.equal(messagesPayload.sourceStatus, 'API 待接入');
  assert.equal(messagesPayload.realSendEnabled, false);

  const pageResponse = await fetch(`${baseUrl}/index.html`);
  assert.equal(pageResponse.status, 200);
});

await withTestServer(createFeishuApiServer({
  rootDir: new URL('../', import.meta.url),
  env: {
    FEISHU_APP_ID: 'cli_test_app_id',
  },
  fetchImpl: async () => {
    throw new Error('健康检查不应该请求飞书 API。');
  },
}), async (baseUrl) => {
  const healthResponse = await fetch(`${baseUrl}/healthz`);
  const healthPayload = await healthResponse.json();
  assert.equal(healthResponse.status, 200);
  assert.equal(healthPayload.ok, true);
  assert.equal(healthPayload.service, 'as-feishu-mail-panel');
  assert.equal(healthPayload.status, 'ok');
});

const railwayDataRoot = mkdtempSync(join(tmpdir(), 'railway-data-root-'));
try {
  await withTestServer(createFeishuApiServer({
    rootDir: new URL('../', import.meta.url),
    env: {
      WORKBENCH_DATA_DIR: railwayDataRoot,
      FEISHU_APP_ID: 'cli_test_app_id',
    },
    fetchImpl: async () => {
      throw new Error('AI 配置初始化不应该请求飞书 API。');
    },
  }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/email-ai/status`);
    assert.equal(response.status, 200);
  });

  const seededStorePath = join(railwayDataRoot, 'data/email-ai-control-store.json');
  const seededStore = JSON.parse(readFileSync(seededStorePath, 'utf8'));
  assert.equal(existsSync(join(railwayDataRoot, '.runtime')), true);
  assert.ok(seededStore.riskRules.some((rule) => rule.id === 'risk-low-general-question'));
} finally {
  rmSync(railwayDataRoot, { recursive: true, force: true });
}

const blockedAuditEvents = [];
await withTestServer(createFeishuApiServer({
  rootDir: new URL('../', import.meta.url),
  env: {
    FEISHU_APP_ID: 'cli_test_app_id',
    FEISHU_APP_SECRET: 'secret_only_on_server',
    FEISHU_USER_MAILBOX_ID: 'service@example.test',
    FEISHU_WRITE_ENABLED: 'false',
    FEISHU_USER_ACCESS_TOKEN: 'user-token-should-not-leak',
  },
  auditWriter: async (event) => {
    blockedAuditEvents.push(event);
  },
  fetchImpl: async () => {
    throw new Error('写开关关闭时不应该请求飞书写接口。');
  },
}), async (baseUrl) => {
  const statusResponse = await fetch(`${baseUrl}/api/feishu/status`);
  const statusPayload = await statusResponse.json();
  assert.equal(statusResponse.status, 200);
  assert.equal(statusPayload.write.writeEnabled, false);
  assert.equal(statusPayload.write.realSendEnabled, false);
  assert.equal(JSON.stringify(statusPayload).includes('user-token-should-not-leak'), false);

  const sendResponse = await fetch(`${baseUrl}/api/feishu/mail/actions/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mail: lowRisk,
      recipient: lowRisk.sender,
      content: lowRisk.replyDraft,
      actor: 'operator@example.test',
    }),
  });
  const sendPayload = await sendResponse.json();
  assert.equal(sendResponse.status, 403);
  assert.equal(sendPayload.ok, false);
  assert.equal(sendPayload.mode, 'write_paused');
  assert.equal(sendPayload.realSendEnabled, false);
  assert.equal(blockedAuditEvents.length, 1);
  assert.equal(blockedAuditEvents[0].allowed, false);
});

const blockedBotAuditEvents = [];
await withTestServer(createFeishuApiServer({
  rootDir: new URL('../', import.meta.url),
  env: {
    FEISHU_APP_ID: 'cli_test_app_id',
    FEISHU_APP_SECRET: 'secret_only_on_server',
    FEISHU_USER_MAILBOX_ID: 'service@example.test',
    FEISHU_BOT_REPORT_EMAIL: 'owner@example.test',
    FEISHU_WRITE_ENABLED: 'false',
  },
  auditWriter: async (event) => {
    blockedBotAuditEvents.push(event);
  },
  fetchImpl: async () => {
    throw new Error('写开关关闭时不应该请求飞书机器人接口。');
  },
}), async (baseUrl) => {
  const botResponse = await fetch(`${baseUrl}/api/feishu/bot/messages/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: '工作台联调消息',
      actor: 'operator@example.test',
    }),
  });
  const botPayload = await botResponse.json();
  assert.equal(botResponse.status, 403);
  assert.equal(botPayload.ok, false);
  assert.equal(botPayload.action, 'bot_message');
  assert.equal(botPayload.mode, 'bot_message_blocked');
  assert.equal(blockedBotAuditEvents.length, 1);
  assert.equal(blockedBotAuditEvents[0].allowed, false);
});

const writeFetchCalls = [];
const writeAuditEvents = [];
await withTestServer(createFeishuApiServer({
  rootDir: new URL('../', import.meta.url),
  env: {
    FEISHU_APP_ID: 'cli_test_app_id',
    FEISHU_APP_SECRET: 'secret_only_on_server',
    FEISHU_USER_MAILBOX_ID: 'service@example.test',
    FEISHU_WRITE_ENABLED: 'true',
    FEISHU_SEND_ENABLED: 'true',
    FEISHU_ARCHIVE_ENABLED: 'true',
    FEISHU_HIGH_RISK_SEND_ENABLED: 'true',
    FEISHU_USER_ACCESS_TOKEN: 'user-token-should-not-leak',
    FEISHU_SEND_RECIPIENT_ALLOWLIST: `${lowRisk.sender},${blocked.sender}`,
    FEISHU_ARCHIVE_FOLDER_ID: 'archive-folder-test',
  },
  auditWriter: async (event) => {
    writeAuditEvents.push(event);
  },
  fetchImpl: async (url, options = {}) => {
    writeFetchCalls.push({ url, options });

    if (url.includes('/messages/send')) {
      return {
        json: async () => ({
          code: 0,
          msg: 'success',
          data: {
            message_id: 'om_sent_001',
            thread_id: 'thread-sent-001',
          },
        }),
      };
    }

    if (url.includes('/messages/batch_modify')) {
      return {
        json: async () => ({
          code: 0,
          msg: 'success',
          data: {},
        }),
      };
    }

    throw new Error(`unexpected write url ${url}`);
  },
}), async (baseUrl) => {
  const sendResponse = await fetch(`${baseUrl}/api/feishu/mail/actions/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mail: lowRisk,
      recipient: lowRisk.sender,
      subject: `Re: ${lowRisk.subject}`,
      content: lowRisk.replyDraft,
      actor: 'operator@example.test',
    }),
  });
  const sendPayload = await sendResponse.json();
  assert.equal(sendResponse.status, 200);
  assert.equal(sendPayload.ok, true);
  assert.equal(sendPayload.action, 'send');
  assert.equal(sendPayload.result.messageId, 'om_sent_001');
  assert.equal(JSON.stringify(sendPayload).includes('user-token-should-not-leak'), false);
  assert.match(writeFetchCalls[0].url, /\/mail\/v1\/user_mailboxes\/service%40example.test\/messages\/send/);
  assert.equal(JSON.parse(writeFetchCalls[0].options.body).to[0].mail_address, lowRisk.sender);

  const highRiskResponse = await fetch(`${baseUrl}/api/feishu/mail/actions/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mail: blocked,
      recipient: blocked.sender,
      subject: `Re: ${blocked.subject}`,
      content: blocked.replyCandidates[0].content,
      review: { decision: 'reasonable' },
      actor: 'operator@example.test',
    }),
  });
  const highRiskPayload = await highRiskResponse.json();
  assert.equal(highRiskResponse.status, 200);
  assert.equal(highRiskPayload.ok, true);
  assert.equal(highRiskPayload.paymentActionAllowed, false);
  assert.equal(highRiskPayload.orderActionAllowed, false);

  const archiveResponse = await fetch(`${baseUrl}/api/feishu/mail/actions/archive`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mail: {
        ...spam,
        messageId: 'om_spam_001',
      },
      actor: 'operator@example.test',
    }),
  });
  const archivePayload = await archiveResponse.json();
  assert.equal(archiveResponse.status, 200);
  assert.equal(archivePayload.ok, true);
  assert.equal(archivePayload.action, 'archive');
  assert.equal(archivePayload.result.archived, true);
  assert.match(writeFetchCalls[2].url, /\/messages\/batch_modify/);

  const approveResponse = await fetch(`${baseUrl}/api/feishu/mail/actions/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mail: blocked,
      review: { decision: 'reasonable', note: '审批通过，仅处理邮件回复。' },
      actor: 'operator@example.test',
    }),
  });
  const approvePayload = await approveResponse.json();
  assert.equal(approveResponse.status, 200);
  assert.equal(approvePayload.ok, true);
  assert.equal(approvePayload.action, 'approve');
  assert.equal(writeAuditEvents.length, 4);
  assert.equal(writeAuditEvents.filter((event) => event.allowed).length, 4);
  assert.equal(JSON.stringify(writeAuditEvents).includes('user-token-should-not-leak'), false);
});

const botFetchCalls = [];
const botAuditEvents = [];
await withTestServer(createFeishuApiServer({
  rootDir: new URL('../', import.meta.url),
  env: {
    FEISHU_APP_ID: 'cli_test_app_id',
    FEISHU_APP_SECRET: 'secret_only_on_server',
    FEISHU_USER_MAILBOX_ID: 'service@example.test',
    FEISHU_BOT_REPORT_EMAIL: 'service@example.test',
    FEISHU_WRITE_ENABLED: 'true',
    FEISHU_USER_ACCESS_TOKEN: 'user-token-should-not-leak',
  },
  auditWriter: async (event) => {
    botAuditEvents.push(event);
  },
  fetchImpl: async (url, options = {}) => {
    botFetchCalls.push({ url, options });

    if (url.includes('/auth/v3/tenant_access_token/internal')) {
      return {
        json: async () => ({
          code: 0,
          msg: 'success',
          tenant_access_token: 'tenant-token-should-not-leak',
        }),
      };
    }

    if (url.includes('/contact/v3/users/batch_get_id')) {
      return {
        json: async () => ({
          code: 0,
          msg: 'success',
          data: {
            user_list: [
              {
                email: 'service@example.test',
              },
            ],
          },
        }),
      };
    }

    if (url.includes('/authen/v1/user_info')) {
      return {
        json: async () => ({
          code: 0,
          msg: 'success',
          data: {
            user_id: 'ou_user_001',
            open_id: 'ou_open_001',
          },
        }),
      };
    }

    if (url.includes('/im/v1/messages')) {
      return {
        json: async () => ({
          code: 0,
          msg: 'success',
          data: {
            message_id: 'om_bot_001',
            chat_id: 'oc_bot_001',
          },
        }),
      };
    }

    throw new Error(`unexpected bot url ${url}`);
  },
}), async (baseUrl) => {
  const botResponse = await fetch(`${baseUrl}/api/feishu/bot/messages/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: '工作台联调消息',
      actor: 'operator@example.test',
    }),
  });
  const botPayload = await botResponse.json();
  assert.equal(botResponse.status, 200);
  assert.equal(botPayload.ok, true);
  assert.equal(botPayload.action, 'bot_message');
  assert.equal(botPayload.result.messageId, 'om_bot_001');
  assert.equal(botFetchCalls.length, 4);
  assert.match(botFetchCalls[1].url, /\/contact\/v3\/users\/batch_get_id\?user_id_type=user_id/);
  assert.equal(JSON.parse(botFetchCalls[1].options.body).emails[0], 'service@example.test');
  assert.match(botFetchCalls[2].url, /\/authen\/v1\/user_info/);
  assert.match(botFetchCalls[3].url, /\/im\/v1\/messages\?receive_id_type=user_id/);
  assert.equal(JSON.parse(botFetchCalls[3].options.body).receive_id, 'ou_user_001');
  assert.equal(botAuditEvents.length, 1);
  assert.equal(botAuditEvents[0].allowed, true);
  assert.equal(JSON.stringify(botPayload).includes('tenant-token-should-not-leak'), false);
  assert.equal(JSON.stringify(botAuditEvents).includes('tenant-token-should-not-leak'), false);
});

const folderRootDir = mkdtempSync(join(tmpdir(), 'feishu-folder-test-'));
try {
  const folderEnvPath = join(folderRootDir, '.env.local');
  writeFileSync(folderEnvPath, [
    'FEISHU_APP_ID=cli_test_app_id',
    'FEISHU_APP_SECRET=secret_only_on_server',
    'FEISHU_USER_MAILBOX_ID=service@example.test',
    '',
  ].join('\n'));

  const folderFetchCalls = [];
  const folderAuditEvents = [];
  await withTestServer(createFeishuApiServer({
    rootDir: folderRootDir,
    envInfo: {
      loaded: true,
      path: folderEnvPath,
    },
    env: {
      FEISHU_APP_ID: 'cli_test_app_id',
      FEISHU_APP_SECRET: 'secret_only_on_server',
      FEISHU_USER_MAILBOX_ID: 'service@example.test',
    },
    auditWriter: async (event) => {
      folderAuditEvents.push(event);
    },
    fetchImpl: async (url, options = {}) => {
      folderFetchCalls.push({ url, options });

      if (url.includes('/auth/v3/tenant_access_token/internal')) {
        return {
          json: async () => ({
            code: 0,
            msg: 'success',
            tenant_access_token: 'tenant-token-should-not-leak',
          }),
        };
      }

      if (url.includes('/folders') && options.method === 'GET') {
        return {
          json: async () => ({
            code: 0,
            msg: 'success',
            data: {
              has_more: false,
              items: [],
            },
          }),
        };
      }

      if (url.includes('/folders') && options.method === 'POST') {
        return {
          json: async () => ({
            code: 0,
            msg: 'success',
            data: {
              folder: {
                folder_id: 'folder-archive-created',
                name: '工作台归档',
                parent_folder_id: '0',
              },
            },
          }),
        };
      }

      throw new Error(`unexpected folder url ${url}`);
    },
  }), async (baseUrl) => {
    const folderResponse = await fetch(`${baseUrl}/api/feishu/mail/folders/ensure-archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actor: 'operator@example.test',
      }),
    });
    const folderPayload = await folderResponse.json();
    assert.equal(folderResponse.status, 200);
    assert.equal(folderPayload.ok, true);
    assert.equal(folderPayload.action, 'ensure_archive_folder');
    assert.equal(folderPayload.mode, 'archive_folder_created');
    assert.equal(folderPayload.result.folderId, 'folder-archive-created');
    assert.equal(folderFetchCalls.length, 3);
    assert.match(folderFetchCalls[1].url, /\/mail\/v1\/user_mailboxes\/service%40example.test\/folders/);
    assert.equal(JSON.parse(folderFetchCalls[2].options.body).name, '工作台归档');
    assert.equal(folderAuditEvents.length, 1);
    assert.equal(folderAuditEvents[0].allowed, true);
    assert.match(readFileSync(folderEnvPath, 'utf8'), /FEISHU_ARCHIVE_FOLDER_ID=folder-archive-created/);
    assert.equal(JSON.stringify(folderPayload).includes('tenant-token-should-not-leak'), false);
  });
} finally {
  rmSync(folderRootDir, { recursive: true, force: true });
}

const refreshRootDir = mkdtempSync(join(tmpdir(), 'feishu-refresh-test-'));
try {
  const refreshEnvPath = join(refreshRootDir, '.env.local');
  writeFileSync(refreshEnvPath, [
    'FEISHU_APP_ID=cli_test_app_id',
    'FEISHU_APP_SECRET=secret_only_on_server',
    'FEISHU_USER_MAILBOX_ID=service@example.test',
    'FEISHU_WRITE_ENABLED=true',
    'FEISHU_SEND_ENABLED=true',
    'FEISHU_USER_ACCESS_TOKEN=expired-user-token',
    'FEISHU_USER_REFRESH_TOKEN=refresh-token-should-not-leak',
    'FEISHU_CUSTOMER_REPLY_ORIGINAL_SENDER_ENABLED=true',
    '',
  ].join('\n'));

  const refreshFetchCalls = [];
  await withTestServer(createFeishuApiServer({
    rootDir: refreshRootDir,
    env: {
      FEISHU_APP_ID: 'cli_test_app_id',
      FEISHU_APP_SECRET: 'secret_only_on_server',
      FEISHU_USER_MAILBOX_ID: 'service@example.test',
      FEISHU_WRITE_ENABLED: 'true',
      FEISHU_SEND_ENABLED: 'true',
      FEISHU_USER_ACCESS_TOKEN: 'expired-user-token',
      FEISHU_USER_REFRESH_TOKEN: 'refresh-token-should-not-leak',
      FEISHU_CUSTOMER_REPLY_ORIGINAL_SENDER_ENABLED: 'true',
    },
    envInfo: {
      loaded: true,
      path: refreshEnvPath,
    },
    fetchImpl: async (url, options = {}) => {
      refreshFetchCalls.push({ url, options });

      if (url.includes('/messages/send') && refreshFetchCalls.filter((call) => call.url.includes('/messages/send')).length === 1) {
        return {
          json: async () => ({
            code: 99991663,
            msg: 'Authentication token expired. Please request a new one.',
          }),
        };
      }

      if (url.includes('/authen/v2/oauth/token')) {
        assert.equal(JSON.parse(options.body).grant_type, 'refresh_token');
        return {
          json: async () => ({
            code: 0,
            data: {
              access_token: 'fresh-user-token-should-not-leak',
              refresh_token: 'fresh-refresh-token-should-not-leak',
              expires_in: 7200,
              refresh_expires_in: 2592000,
            },
          }),
        };
      }

      if (url.includes('/messages/send')) {
        assert.equal(options.headers.authorization, 'Bearer fresh-user-token-should-not-leak');
        return {
          json: async () => ({
            code: 0,
            msg: 'success',
            data: {
              message_id: 'om_sent_after_refresh',
              thread_id: 'thread-sent-after-refresh',
            },
          }),
        };
      }

      throw new Error(`unexpected refresh url ${url}`);
    },
  }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/feishu/mail/actions/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mail: lowRisk,
        recipient: lowRisk.sender,
        subject: `Re: ${lowRisk.subject}`,
        content: lowRisk.replyDraft,
        actor: 'operator@example.test',
      }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.result.messageId, 'om_sent_after_refresh');
    assert.equal(refreshFetchCalls.filter((call) => call.url.includes('/messages/send')).length, 2);
    assert.equal(refreshFetchCalls.filter((call) => call.url.includes('/authen/v2/oauth/token')).length, 1);
    const updatedEnvContent = readFileSync(refreshEnvPath, 'utf8');
    assert.match(updatedEnvContent, /FEISHU_USER_ACCESS_TOKEN=fresh-user-token-should-not-leak/);
    assert.match(updatedEnvContent, /FEISHU_USER_REFRESH_TOKEN=fresh-refresh-token-should-not-leak/);
    assert.match(updatedEnvContent, /FEISHU_USER_ACCESS_TOKEN_EXPIRES_AT=/);
    assert.match(updatedEnvContent, /FEISHU_USER_REFRESH_TOKEN_EXPIRES_AT=/);
    assert.equal(JSON.stringify(payload).includes('fresh-user-token-should-not-leak'), false);
  });
} finally {
  rmSync(refreshRootDir, { recursive: true, force: true });
}

const proactiveRefreshRootDir = mkdtempSync(join(tmpdir(), 'feishu-proactive-refresh-test-'));
try {
  const proactiveRefreshEnvPath = join(proactiveRefreshRootDir, '.env.local');
  writeFileSync(proactiveRefreshEnvPath, [
    'FEISHU_APP_ID=cli_test_app_id',
    'FEISHU_APP_SECRET=secret_only_on_server',
    'FEISHU_USER_MAILBOX_ID=service@example.test',
    'FEISHU_WRITE_ENABLED=true',
    'FEISHU_SEND_ENABLED=true',
    'FEISHU_USER_ACCESS_TOKEN=nearly-expired-user-token',
    'FEISHU_USER_REFRESH_TOKEN=refresh-token-should-not-leak',
    `FEISHU_USER_ACCESS_TOKEN_EXPIRES_AT=${new Date(Date.now() - 1000).toISOString()}`,
    'FEISHU_CUSTOMER_REPLY_ORIGINAL_SENDER_ENABLED=true',
    '',
  ].join('\n'));

  const proactiveRefreshFetchCalls = [];
  await withTestServer(createFeishuApiServer({
    rootDir: proactiveRefreshRootDir,
    env: {
      FEISHU_APP_ID: 'cli_test_app_id',
      FEISHU_APP_SECRET: 'secret_only_on_server',
      FEISHU_USER_MAILBOX_ID: 'service@example.test',
      FEISHU_WRITE_ENABLED: 'true',
      FEISHU_SEND_ENABLED: 'true',
      FEISHU_USER_ACCESS_TOKEN: 'nearly-expired-user-token',
      FEISHU_USER_REFRESH_TOKEN: 'refresh-token-should-not-leak',
      FEISHU_USER_ACCESS_TOKEN_EXPIRES_AT: new Date(Date.now() - 1000).toISOString(),
      FEISHU_CUSTOMER_REPLY_ORIGINAL_SENDER_ENABLED: 'true',
    },
    envInfo: {
      loaded: true,
      path: proactiveRefreshEnvPath,
    },
    fetchImpl: async (url, options = {}) => {
      proactiveRefreshFetchCalls.push({ url, options });

      if (url.includes('/authen/v2/oauth/token')) {
        assert.equal(JSON.parse(options.body).grant_type, 'refresh_token');
        return {
          json: async () => ({
            code: 0,
            data: {
              access_token: 'fresh-proactive-token-should-not-leak',
              refresh_token: 'fresh-proactive-refresh-should-not-leak',
              expires_in: 7200,
            },
          }),
        };
      }

      if (url.includes('/messages/send')) {
        assert.equal(options.headers.authorization, 'Bearer fresh-proactive-token-should-not-leak');
        return {
          json: async () => ({
            code: 0,
            msg: 'success',
            data: {
              message_id: 'om_sent_after_proactive_refresh',
              thread_id: 'thread-sent-after-proactive-refresh',
            },
          }),
        };
      }

      throw new Error(`unexpected proactive refresh url ${url}`);
    },
  }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/feishu/mail/actions/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mail: lowRisk,
        recipient: lowRisk.sender,
        subject: `Re: ${lowRisk.subject}`,
        content: lowRisk.replyDraft,
        actor: 'operator@example.test',
      }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.result.messageId, 'om_sent_after_proactive_refresh');
    assert.equal(proactiveRefreshFetchCalls.filter((call) => call.url.includes('/authen/v2/oauth/token')).length, 1);
    assert.equal(proactiveRefreshFetchCalls.filter((call) => call.url.includes('/messages/send')).length, 1);

    const updatedEnvContent = readFileSync(proactiveRefreshEnvPath, 'utf8');
    assert.match(updatedEnvContent, /FEISHU_USER_ACCESS_TOKEN=fresh-proactive-token-should-not-leak/);
    assert.match(updatedEnvContent, /FEISHU_USER_REFRESH_TOKEN=fresh-proactive-refresh-should-not-leak/);
    assert.match(updatedEnvContent, /FEISHU_USER_ACCESS_TOKEN_EXPIRES_AT=/);
    assert.equal(JSON.stringify(payload).includes('fresh-proactive-token-should-not-leak'), false);
  });
} finally {
  rmSync(proactiveRefreshRootDir, { recursive: true, force: true });
}

await withTestServer(createFeishuApiServer({
  rootDir: new URL('../', import.meta.url),
  env: {
    FEISHU_APP_ID: 'cli_test_app_id',
    FEISHU_APP_SECRET: 'secret_only_on_server',
    FEISHU_USER_MAILBOX_ID: 'service@example.test',
    FEISHU_WRITE_ENABLED: 'true',
    FEISHU_ARCHIVE_ENABLED: 'true',
    FEISHU_USER_ACCESS_TOKEN: 'user-token-should-not-leak',
    FEISHU_ARCHIVE_FOLDER_ID: 'archive-folder-test',
  },
  fetchImpl: async (url) => {
    if (url.includes('/messages/batch_modify')) {
      return {
        status: 404,
        text: async () => '404 page not found',
      };
    }

    throw new Error(`unexpected non-json url ${url}`);
  },
}), async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/feishu/mail/actions/archive`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mail: {
        ...spam,
        messageId: 'om_spam_001',
      },
      actor: 'operator@example.test',
    }),
  });
  const payload = await response.json();
  assert.equal(response.status, 500);
  assert.equal(payload.ok, false);
  assert.match(payload.message, /飞书接口返回非 JSON 响应/);
  assert.match(payload.message, /404/);
});

const closedLoopFetchCalls = [];
const closedLoopAuditEvents = [];
await withTestServer(createFeishuApiServer({
  rootDir: new URL('../', import.meta.url),
  env: {
    FEISHU_APP_ID: 'cli_test_app_id',
    FEISHU_APP_SECRET: 'secret_only_on_server',
    FEISHU_USER_MAILBOX_ID: 'service@example.test',
    FEISHU_WRITE_ENABLED: 'true',
    FEISHU_SEND_ENABLED: 'true',
    FEISHU_ARCHIVE_ENABLED: 'true',
    FEISHU_HIGH_RISK_SEND_ENABLED: 'true',
    FEISHU_AUTO_PROCESS_ENABLED: 'true',
    FEISHU_AUTO_SEND_LOW_RISK_ENABLED: 'true',
    FEISHU_AUTO_ARCHIVE_SPAM_ENABLED: 'true',
    FEISHU_USER_ACCESS_TOKEN: 'user-token-should-not-leak',
    FEISHU_SEND_RECIPIENT_ALLOWLIST: `${loopLowRisk.sender},${loopDraftOnly.sender},${loopBlocked.sender}`,
    FEISHU_ARCHIVE_FOLDER_ID: 'archive-folder-test',
  },
  auditWriter: async (event) => {
    closedLoopAuditEvents.push(event);
  },
  fetchImpl: async (url, options = {}) => {
    closedLoopFetchCalls.push({ url, options });
    if (url.includes('/messages/send')) {
      return {
        json: async () => ({
          code: 0,
          msg: 'success',
          data: {
            message_id: `sent-${closedLoopFetchCalls.length}`,
            thread_id: `thread-sent-${closedLoopFetchCalls.length}`,
          },
        }),
      };
    }
    if (url.includes('/messages/batch_modify')) {
      return {
        json: async () => ({
          code: 0,
          msg: 'success',
          data: {},
        }),
      };
    }
    throw new Error(`unexpected closed loop url ${url}`);
  },
}), async (baseUrl) => {
  const processResponse = await fetch(`${baseUrl}/api/feishu/mail/actions/process`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mails: [loopLowRisk, loopDraftOnly, loopBlocked, loopSpam],
      reviews: {
        [loopBlocked.id]: { decision: 'reasonable', note: '审批通过，仅邮件层回复。' },
      },
      selectedReplies: {
        [loopBlocked.id]: { content: loopBlocked.replyCandidates[1].content },
      },
      actor: 'operator@example.test',
    }),
  });
  const processPayload = await processResponse.json();
  assert.equal(processResponse.status, 200);
  assert.equal(processPayload.ok, true);
  assert.equal(processPayload.action, 'process');
  assert.deepEqual(processPayload.summary, {
    total: 4,
    autoSent: 1,
    archived: 1,
    manualSent: 1,
    pendingReview: 1,
    blocked: 0,
    skipped: 0,
    failed: 0,
  });
  assert.equal(processPayload.items.find((item) => item.mailId === loopLowRisk.id).status, 'sent');
  assert.equal(processPayload.items.find((item) => item.mailId === loopSpam.id).status, 'archived');
  assert.equal(processPayload.items.find((item) => item.mailId === loopDraftOnly.id).status, 'pending');
  assert.equal(processPayload.items.find((item) => item.mailId === loopBlocked.id).status, 'sent');
  assert.equal(closedLoopFetchCalls.length, 3);
  assert.equal(closedLoopAuditEvents.length, 3);
  assert.equal(JSON.stringify(processPayload).includes('user-token-should-not-leak'), false);

  const skippedResponse = await fetch(`${baseUrl}/api/feishu/mail/actions/process`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mails: [loopLowRisk, loopDraftOnly, loopBlocked, loopSpam],
      skipMailIds: [loopLowRisk.id, loopBlocked.id, loopSpam.id],
      reviews: {
        [loopBlocked.id]: { decision: 'reasonable', note: '审批通过，仅邮件层回复。' },
      },
      actor: 'scheduled-auto-process',
    }),
  });
  const skippedPayload = await skippedResponse.json();
  assert.equal(skippedResponse.status, 200);
  assert.deepEqual(skippedPayload.summary, {
    total: 1,
    autoSent: 0,
    archived: 0,
    manualSent: 0,
    pendingReview: 1,
    blocked: 0,
    skipped: 0,
    failed: 0,
  });
  assert.equal(skippedPayload.items[0].mailId, loopDraftOnly.id);
  assert.equal(closedLoopFetchCalls.length, 3);
  assert.equal(closedLoopAuditEvents.length, 3);
});

const feishuFetchCalls = [];
await withTestServer(createFeishuApiServer({
  rootDir: new URL('../', import.meta.url),
  env: {
    FEISHU_APP_ID: 'cli_test_app_id',
    FEISHU_APP_SECRET: 'secret_only_on_server',
    FEISHU_USER_MAILBOX_ID: 'user-mailbox-test',
  },
  fetchImpl: async (url, options = {}) => {
    feishuFetchCalls.push({ url, options });

    if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
      return {
        json: async () => ({
          code: 0,
          tenant_access_token: 'tenant-token-test',
        }),
      };
    }

    if (url.includes('/messages/om_real_test_002')) {
      return {
        json: async () => ({
          code: 0,
          msg: 'ok',
          data: {
            message: {
              message_id: 'om_real_test_002',
              thread_id: 'omt_real_test_002',
              subject: '我想查询订单',
              head_from: {
                mail_address: 'buyer033@example.test',
                name: '测试买家',
              },
              internal_date: '2026-06-11T11:30:00+08:00',
              body_plain_text: '客户想查询订单，但是没有提供订单号。',
              label_ids: ['INBOX'],
            },
          },
        }),
      };
    }

    return {
      json: async () => ({
        code: 0,
        data: {
          has_more: false,
          page_token: '',
          items: ['om_real_test_002'],
        },
      }),
    };
  },
}), async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/feishu/mail/messages?page_size=3`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.sourceStatus, '真实接入');
  assert.equal(payload.realSendEnabled, false);
  assert.equal(payload.messages.length, 1);
  assert.equal(payload.messages[0].message_id, 'om_real_test_002');
  assert.equal(payload.mails[0].id, 'om_real_test_002');
  assert.equal(payload.mails[0].sender, 'buyer033@example.test');
  assert.equal(payload.mails[0].subject, '我想查询订单');
  assert.match(payload.mails[0].summary, /没有提供订单号/);
  assert.equal(payload.mails[0].sourceStatus, '真实接入');
  assert.equal(payload.mails[0].status, '飞书 API 只读导入');
  assert.equal(feishuFetchCalls.length, 3);
  assert.match(feishuFetchCalls[1].url, /page_size=3/);
  assert.match(feishuFetchCalls[2].url, /\/messages\/om_real_test_002/);
  assert.equal(JSON.stringify(payload).includes('secret_only_on_server'), false);

  const cachedResponse = await fetch(`${baseUrl}/api/feishu/mail/messages?page_size=3`);
  const cachedPayload = await cachedResponse.json();
  assert.equal(cachedResponse.status, 200);
  assert.equal(cachedPayload.ok, true);
  assert.equal(cachedPayload.cacheStatus, 'hit');
  assert.equal(cachedPayload.mails[0].id, 'om_real_test_002');
  assert.equal(feishuFetchCalls.length, 3);

  const largePageResponse = await fetch(`${baseUrl}/api/feishu/mail/messages?page_size=30`);
  const largePagePayload = await largePageResponse.json();
  assert.equal(largePageResponse.status, 200);
  assert.equal(largePagePayload.ok, true);
  assert.equal(feishuFetchCalls.length, 6);
	  assert.match(feishuFetchCalls[4].url, /page_size=20/);
	});

const auditStateRootDir = mkdtempSync(join(tmpdir(), 'feishu-audit-state-test-'));
try {
  mkdirSync(join(auditStateRootDir, '.runtime'), { recursive: true });
  writeFileSync(join(auditStateRootDir, '.runtime/feishu-actions.ndjson'), `${JSON.stringify({
    createdAt: '2026-06-13T03:00:00.000Z',
    action: 'send',
    actor: 'scheduled-auto-process',
    mailId: 'om_real_test_004',
    messageId: 'om_real_test_004',
    threadId: 'omt_real_test_004',
    subject: '我想查询订单',
    risk: 'low',
    allowed: true,
    mode: 'ready',
    result: {
      ok: true,
      messageId: 'sent-om-real-test-004',
      threadId: 'thread-sent-004',
      archived: false,
      error: null,
    },
  })}\n${JSON.stringify({
    createdAt: '2026-06-13T03:05:00.000Z',
    action: 'send',
    actor: 'scheduled-auto-process',
    mailId: 'om_real_test_004',
    messageId: 'om_real_test_004',
    threadId: 'omt_real_test_004',
    subject: '我想查询订单',
    risk: 'high',
    allowed: false,
    mode: 'high_risk_send_disabled',
    result: {
      ok: false,
      error: '动作失败待处理：高风险发送开关未开启。',
    },
  })}\n`, 'utf8');

  await withTestServer(createFeishuApiServer({
    rootDir: auditStateRootDir,
    env: {
      FEISHU_APP_ID: 'cli_test_app_id',
      FEISHU_APP_SECRET: 'secret_only_on_server',
      FEISHU_USER_MAILBOX_ID: 'user-mailbox-test',
    },
    fetchImpl: async (url) => {
      if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
        return {
          json: async () => ({
            code: 0,
            tenant_access_token: 'tenant-token-test',
          }),
        };
      }

      if (url.includes('/messages/om_real_test_004')) {
        return {
          json: async () => ({
            code: 0,
            msg: 'ok',
            data: {
              message: {
                message_id: 'om_real_test_004',
                thread_id: 'omt_real_test_004',
                subject: '我想查询订单',
                head_from: {
                  mail_address: 'buyer044@example.test',
                },
                internal_date: '2026-06-13T10:00:00+08:00',
                body_plain_text: '客户想查询订单，但是没有提供订单号。',
                label_ids: ['INBOX'],
              },
            },
          }),
        };
      }

      if (url.includes('/messages/renamed-om-real-test-004')) {
        return {
          json: async () => ({
            code: 0,
            msg: 'ok',
            data: {
              message: {
                message_id: 'renamed-om-real-test-004',
                thread_id: 'omt_real_test_004',
                subject: '我想查询订单',
                head_from: {
                  mail_address: 'buyer044@example.test',
                },
                internal_date: '2026-06-13T10:01:00+08:00',
                body_plain_text: '同一封原始邮件同步后消息 ID 变化，但时间早于完成时间。',
                label_ids: ['INBOX'],
              },
            },
          }),
        };
      }

      if (url.includes('/messages/sent-om-real-test-004')) {
        return {
          json: async () => ({
            code: 0,
            msg: 'ok',
            data: {
              message: {
                message_id: 'sent-om-real-test-004',
                thread_id: 'thread-sent-004',
                subject: 'Re: 我想查询订单',
                head_from: {
                  mail_address: 'buyer044@example.test',
                },
                internal_date: '2026-06-13T10:05:00+08:00',
                body_plain_text: '客户回复同一线程，消息 ID 已变化。',
                label_ids: ['INBOX'],
              },
            },
          }),
        };
      }

      if (url.includes('/messages/new-reply-om-real-test-004')) {
        return {
          json: async () => ({
            code: 0,
            msg: 'ok',
            data: {
              message: {
                message_id: 'new-reply-om-real-test-004',
                thread_id: 'omt_real_test_004',
                subject: 'Re: 我想查询订单',
                head_from: {
                  mail_address: 'buyer044@example.test',
                },
                internal_date: '2026-06-13T12:30:00+08:00',
                body_plain_text: '客户在完成回复后又发来新问题，不能被误判为已完成。',
                label_ids: ['INBOX'],
              },
            },
          }),
        };
      }

      if (url.includes('/messages/unknown-time-thread-004')) {
        return {
          json: async () => ({
            code: 0,
            msg: 'ok',
            data: {
              message: {
                message_id: 'unknown-time-thread-004',
                thread_id: 'omt_real_test_004',
                subject: 'Re: 我想查询订单',
                head_from: {
                  mail_address: 'buyer044@example.test',
                },
                body_plain_text: '缺少可解析时间时，不能只因为线程相同就标记完成。',
                label_ids: ['INBOX'],
              },
            },
          }),
        };
      }

      return {
        json: async () => ({
          code: 0,
          data: {
            has_more: false,
            page_token: '',
            items: [
              'om_real_test_004',
              'renamed-om-real-test-004',
              'sent-om-real-test-004',
              'new-reply-om-real-test-004',
              'unknown-time-thread-004',
            ],
          },
        }),
      };
    },
  }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/feishu/mail/messages?all=true&page_size=20`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    const originalMail = payload.mails.find((mail) => mail.id === 'om_real_test_004');
    const renamedOriginalMail = payload.mails.find((mail) => mail.id === 'renamed-om-real-test-004');
    const sentThreadMail = payload.mails.find((mail) => mail.id === 'sent-om-real-test-004');
    const newReplyMail = payload.mails.find((mail) => mail.id === 'new-reply-om-real-test-004');
    const unknownTimeThreadMail = payload.mails.find((mail) => mail.id === 'unknown-time-thread-004');
    assert.equal(originalMail.processingStatus.status, 'completed');
    assert.equal(originalMail.processingStatus.action, 'send');
    assert.equal(originalMail.processingStatus.label, '已自动回复');
    assert.equal(renamedOriginalMail.processingStatus.status, 'completed');
    assert.equal(renamedOriginalMail.processingStatus.action, 'send');
    assert.equal(sentThreadMail.processingStatus.status, 'completed');
    assert.equal(sentThreadMail.processingStatus.action, 'send');
    assert.equal(sentThreadMail.processingStatus.label, '已自动回复');
    assert.equal(newReplyMail.processingStatus, undefined);
    assert.equal(unknownTimeThreadMail.processingStatus, undefined);
    assert.equal(payload.processingStatusSummary.completedCount, 3);
  });
} finally {
  rmSync(auditStateRootDir, { recursive: true, force: true });
}

const detailLimitFetchCalls = [];
await withTestServer(createFeishuApiServer({
  rootDir: new URL('../', import.meta.url),
  env: {
    FEISHU_APP_ID: 'cli_test_app_id',
    FEISHU_APP_SECRET: 'secret_only_on_server',
    FEISHU_USER_MAILBOX_ID: 'user-mailbox-test',
  },
  fetchImpl: async (url) => {
    detailLimitFetchCalls.push(url);

    if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
      return {
        json: async () => ({
          code: 0,
          tenant_access_token: 'tenant-token-test',
        }),
      };
    }

    if (url.includes('/messages/om_rate_limited_001')) {
      return {
        json: async () => ({
          code: 99991400,
          msg: 'request trigger frequency limit',
        }),
      };
    }

    return {
      json: async () => ({
        code: 0,
        data: {
          has_more: false,
          items: [{
            message_id: 'om_rate_limited_001',
            thread_id: 'thread-rate-limited-001',
            subject: 'List fallback subject',
            from: { email: 'fallback@example.test' },
            body_preview: '列表里已有可读摘要。',
          }],
        },
      }),
    };
  },
}), async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/feishu/mail/messages?page_size=1`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.detailStatus, 'partial');
  assert.equal(payload.mails[0].id, 'om_rate_limited_001');
  assert.equal(payload.mails[0].subject, 'List fallback subject');
  assert.equal(payload.mails[0].sourceStatus, '真实接入');
  assert.equal(detailLimitFetchCalls.length, 3);
});

const allPageFetchCalls = [];
await withTestServer(createFeishuApiServer({
  rootDir: new URL('../', import.meta.url),
  env: {
    FEISHU_APP_ID: 'cli_test_app_id',
    FEISHU_APP_SECRET: 'secret_only_on_server',
    FEISHU_USER_MAILBOX_ID: 'user-mailbox-test',
  },
  fetchImpl: async (url) => {
    allPageFetchCalls.push(url);

    if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
      return {
        json: async () => ({
          code: 0,
          tenant_access_token: 'tenant-token-test',
        }),
      };
    }

    if (url.includes('/messages/om_all_page_001')) {
      return {
        json: async () => ({
          code: 0,
          data: {
            message: {
              message_id: 'om_all_page_001',
              thread_id: 'thread-all-page-001',
              subject: '第一页邮件',
              head_from: { mail_address: 'page1@example.test' },
              body_plain_text: '第一页正文',
            },
          },
        }),
      };
    }

    if (url.includes('/messages/om_all_page_002')) {
      return {
        json: async () => ({
          code: 0,
          data: {
            message: {
              message_id: 'om_all_page_002',
              thread_id: 'thread-all-page-002',
              subject: '第二页邮件',
              head_from: { mail_address: 'page2@example.test' },
              body_plain_text: '第二页正文',
            },
          },
        }),
      };
    }

    const parsedUrl = new URL(url);
    if (parsedUrl.pathname.endsWith('/messages') && parsedUrl.searchParams.get('page_token') === 'next-page-token') {
      return {
        json: async () => ({
          code: 0,
          data: {
            has_more: false,
            page_token: '',
            items: ['om_all_page_002'],
          },
        }),
      };
    }

    if (parsedUrl.pathname.endsWith('/messages')) {
      return {
        json: async () => ({
          code: 0,
          data: {
            has_more: true,
            page_token: 'next-page-token',
            items: ['om_all_page_001'],
          },
        }),
      };
    }

    throw new Error(`unexpected all-page url ${url}`);
  },
}), async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/feishu/mail/messages?all=true&page_size=20`);
  const payload = await response.json();
  const listCalls = allPageFetchCalls.filter((url) => new URL(url).pathname.endsWith('/messages'));
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.allPagesFetched, true);
  assert.equal(payload.pageCount, 2);
  assert.equal(payload.hasMore, false);
  assert.equal(payload.mails.length, 2);
  assert.deepEqual(payload.mails.map((mail) => mail.subject), ['第一页邮件', '第二页邮件']);
  assert.equal(listCalls.length, 2);
  assert.match(listCalls[0], /page_size=20/);
  assert.doesNotMatch(listCalls[0], /page_token=next-page-token/);
  assert.match(listCalls[1], /page_token=next-page-token/);
});

const scheduledSyncFetchCalls = [];
await withTestServer(createFeishuApiServer({
  rootDir: new URL('../', import.meta.url),
  env: {
    FEISHU_APP_ID: 'cli_test_app_id',
    FEISHU_APP_SECRET: 'secret_only_on_server',
    FEISHU_USER_MAILBOX_ID: 'user-mailbox-test',
    FEISHU_MAIL_AUTO_SYNC_ENABLED: 'true',
    FEISHU_MAIL_SYNC_INTERVAL_MS: '10000',
    FEISHU_MAIL_SYNC_PAGE_SIZE: '20',
  },
  fetchImpl: async (url) => {
    scheduledSyncFetchCalls.push(url);

    if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
      return {
        json: async () => ({
          code: 0,
          tenant_access_token: 'tenant-token-test',
        }),
      };
    }

    if (url.includes('/messages/om_scheduled_001')) {
      return {
        json: async () => ({
          code: 0,
          data: {
            message: {
              message_id: 'om_scheduled_001',
              thread_id: 'thread-scheduled-001',
              subject: '定时同步第一页',
              head_from: { mail_address: 'scheduled1@example.test' },
              body_plain_text: '第一页正文',
            },
          },
        }),
      };
    }

    if (url.includes('/messages/om_scheduled_002')) {
      return {
        json: async () => ({
          code: 0,
          data: {
            message: {
              message_id: 'om_scheduled_002',
              thread_id: 'thread-scheduled-002',
              subject: '定时同步第二页',
              head_from: { mail_address: 'scheduled2@example.test' },
              body_plain_text: '第二页正文',
            },
          },
        }),
      };
    }

    const parsedUrl = new URL(url);
    if (parsedUrl.pathname.endsWith('/messages') && parsedUrl.searchParams.get('page_token') === 'scheduled-next') {
      return {
        json: async () => ({
          code: 0,
          data: {
            has_more: false,
            page_token: '',
            items: ['om_scheduled_002'],
          },
        }),
      };
    }

    if (parsedUrl.pathname.endsWith('/messages')) {
      return {
        json: async () => ({
          code: 0,
          data: {
            has_more: true,
            page_token: 'scheduled-next',
            items: ['om_scheduled_001'],
          },
        }),
      };
    }

    throw new Error(`unexpected scheduled sync url ${url}`);
  },
}), async (baseUrl) => {
  const synced = await waitForCondition(async () => {
    const response = await fetch(`${baseUrl}/api/feishu/status`);
    const payload = await response.json();
    return payload.mailSync.lastSyncedAt && payload.mailSync.lastCount === 2;
  });
  assert.equal(synced, true);

  const statusResponse = await fetch(`${baseUrl}/api/feishu/status`);
  const statusPayload = await statusResponse.json();
  assert.equal(statusPayload.mailSync.enabled, true);
  assert.equal(statusPayload.mailSync.intervalMs, 10000);
  assert.equal(statusPayload.mailSync.pageSize, 20);
  assert.equal(statusPayload.mailSync.lastCount, 2);
  assert.equal(statusPayload.mailSync.lastPageCount, 2);
  assert.equal(statusPayload.mailSync.lastDetailStatus, 'complete');
  assert.equal(statusPayload.mailSync.lastDetailFailedCount, 0);
  assert.equal(statusPayload.mailSync.lastError, '');

  const messagesResponse = await fetch(`${baseUrl}/api/feishu/mail/messages?all=true&page_size=20`);
  const messagesPayload = await messagesResponse.json();
  assert.equal(messagesPayload.cacheStatus, 'hit');
  assert.equal(messagesPayload.allPagesFetched, true);
  assert.equal(messagesPayload.pageCount, 2);
  assert.deepEqual(messagesPayload.mails.map((mail) => mail.subject), ['定时同步第一页', '定时同步第二页']);
  assert.ok(scheduledSyncFetchCalls.some((url) => new URL(url).searchParams.get('page_token') === 'scheduled-next'));
});

const workbenchSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
assert.match(workbenchSource, /FEISHU_WORKBENCH_PAGE_SIZE = 20/);
assert.match(workbenchSource, /mail\/messages\?all=true&page_size=\$\{FEISHU_WORKBENCH_PAGE_SIZE\}/);
assert.match(workbenchSource, /setInterval\(.*loadFeishuApiMessages/s);

const envLocalExampleSource = readFileSync(new URL('../.env.local.example', import.meta.url), 'utf8');
const readmeSource = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
assert.match(envLocalExampleSource, /EMAIL_AI_ADMIN_TOKEN=/);
assert.match(envLocalExampleSource, /WORKBENCH_DATA_DIR=/);
assert.match(envLocalExampleSource, /FEISHU_AUTO_PROCESS_SCHEDULE_ENABLED=false/);
assert.match(readmeSource, /EMAIL_AI_ADMIN_TOKEN/);
assert.match(readmeSource, /管理员 Token/);
assert.match(readmeSource, /Railway 云端部署/);
assert.match(readmeSource, /\/healthz/);
assert.match(readmeSource, /WORKBENCH_DATA_DIR=\/data/);

await withTestServer(createFeishuApiServer({
  rootDir: new URL('../', import.meta.url),
  env: {
    FEISHU_APP_ID: 'railway_min_scope_app_id',
    FEISHU_APP_SECRET: 'secret_only_on_server',
    FEISHU_USER_MAILBOX_ID: 'service@example.test',
  },
}), async (baseUrl) => {
  const response = await fetch(`${baseUrl}/oauth/start?state=railway-prod`, {
    redirect: 'manual',
  });
  assert.equal(response.status, 302);
  const authorizeUrl = new URL(response.headers.get('location'));
  const scopes = authorizeUrl.searchParams.get('scope').split(/\s+/);
  assert.equal(authorizeUrl.searchParams.get('app_id'), 'railway_min_scope_app_id');
  assert.equal(authorizeUrl.searchParams.get('state'), 'railway-prod');
  assert.equal(scopes.includes('offline_access'), true);
  assert.equal(scopes.includes('mail:user_mailbox.message:readonly'), true);
  assert.equal(scopes.includes('mail:user_mailbox.message.address:read'), true);
  assert.equal(scopes.includes('mail:user_mailbox.message.subject:read'), true);
  assert.equal(scopes.includes('mail:user_mailbox.message.body:read'), true);
  assert.equal(scopes.includes('mail:user_mailbox.message:send'), true);
  assert.equal(scopes.includes('mail:user_mailbox.message:modify'), false);
  assert.equal(scopes.includes('mail:user_mailbox.folder:read'), false);
  assert.equal(scopes.includes('mail:user_mailbox.folder:write'), false);
  assert.equal(scopes.includes('im:message:send_as_bot'), false);
  assert.equal(scopes.includes('contact:user.employee_id:readonly'), false);
  assert.equal(new Set(scopes).size, scopes.length);
});

await withTestServer(createFeishuApiServer({
  rootDir: new URL('../', import.meta.url),
  env: {
    FEISHU_APP_ID: 'cli_test_app_id',
    FEISHU_APP_SECRET: 'secret_only_on_server',
    FEISHU_USER_MAILBOX_ID: 'service@example.test',
    FEISHU_OAUTH_SCOPE: 'mail:user_mailbox.message:send im:message:send_as_bot',
  },
}), async (baseUrl) => {
  const response = await fetch(`${baseUrl}/oauth/start?state=mail-workbench-test`, {
    redirect: 'manual',
  });
  assert.equal(response.status, 302);
  const authorizeUrl = new URL(response.headers.get('location'));
  const scopes = authorizeUrl.searchParams.get('scope').split(/\s+/);
  assert.equal(authorizeUrl.searchParams.get('app_id'), 'cli_test_app_id');
  assert.equal(authorizeUrl.searchParams.get('state'), 'mail-workbench-test');
  assert.equal(scopes.includes('offline_access'), true);
  assert.equal(scopes.includes('mail:user_mailbox.message:send'), true);
  assert.equal(scopes.includes('im:message:send_as_bot'), true);
  assert.equal(new Set(scopes).size, scopes.length);
});

const oauthRootDir = mkdtempSync(join(tmpdir(), 'feishu-oauth-test-'));
try {
  writeFileSync(join(oauthRootDir, '.env.local'), [
    'FEISHU_APP_ID=cli_test_app_id',
    'FEISHU_APP_SECRET=secret_only_on_server',
    'FEISHU_USER_MAILBOX_ID=service@example.test',
    'FEISHU_USER_ACCESS_TOKEN=旧token占位',
    '',
  ].join('\n'));

  const oauthFetchCalls = [];
  const oauthEnv = {
    FEISHU_APP_ID: 'cli_test_app_id',
    FEISHU_APP_SECRET: 'secret_only_on_server',
    FEISHU_USER_MAILBOX_ID: 'service@example.test',
  };
  await withTestServer(createFeishuApiServer({
    rootDir: oauthRootDir,
    env: oauthEnv,
    envInfo: {
      loaded: true,
      path: join(oauthRootDir, '.env.local'),
    },
    fetchImpl: async (url, options = {}) => {
      oauthFetchCalls.push({ url, options });
      assert.match(url, /\/authen\/v2\/oauth\/token$/);
      assert.equal(JSON.parse(options.body).code, 'auth-code-test');
      return {
        json: async () => ({
          code: 0,
          msg: 'success',
          data: {
            access_token: 'user-token-should-not-leak',
            refresh_token: 'refresh-token-should-not-leak',
            expires_in: 7200,
            refresh_expires_in: 2592000,
          },
        }),
      };
    },
  }), async (baseUrl) => {
    const callbackResponse = await fetch(`${baseUrl}/oauth/callback?code=auth-code-test&state=mail-workbench`);
    const callbackHtml = await callbackResponse.text();
    assert.equal(callbackResponse.status, 200);
    assert.match(callbackHtml, /user_access_token 和 refresh_token 已写入/);
    assert.equal(callbackHtml.includes('user-token-should-not-leak'), false);
    assert.equal(callbackHtml.includes('refresh-token-should-not-leak'), false);
    assert.equal(oauthFetchCalls.length, 1);

    const updatedEnvContent = readFileSync(join(oauthRootDir, '.env.local'), 'utf8');
    assert.match(updatedEnvContent, /FEISHU_USER_ACCESS_TOKEN=user-token-should-not-leak/);
    assert.match(updatedEnvContent, /FEISHU_USER_REFRESH_TOKEN=refresh-token-should-not-leak/);
    assert.match(updatedEnvContent, /FEISHU_USER_ACCESS_TOKEN_EXPIRES_AT=/);
    assert.match(updatedEnvContent, /FEISHU_USER_REFRESH_TOKEN_EXPIRES_AT=/);
  });
} finally {
  rmSync(oauthRootDir, { recursive: true, force: true });
}

const railwayOauthDataRoot = mkdtempSync(join(tmpdir(), 'railway-oauth-data-'));
try {
  const oauthEnv = {
    WORKBENCH_DATA_DIR: railwayOauthDataRoot,
    FEISHU_APP_ID: 'cli_test_app_id',
    FEISHU_APP_SECRET: 'secret_only_on_server',
    FEISHU_USER_MAILBOX_ID: 'service@example.test',
  };
  await withTestServer(createFeishuApiServer({
    rootDir: new URL('../', import.meta.url),
    env: oauthEnv,
    fetchImpl: async (url, options = {}) => {
      assert.match(url, /\/authen\/v2\/oauth\/token$/);
      assert.equal(JSON.parse(options.body).code, 'railway-auth-code-test');
      return {
        json: async () => ({
          code: 0,
          msg: 'success',
          data: {
            access_token: 'railway-user-token-should-not-leak',
            refresh_token: 'railway-refresh-token-should-not-leak',
            expires_in: 7200,
            refresh_expires_in: 2592000,
          },
        }),
      };
    },
  }), async (baseUrl) => {
    const callbackResponse = await fetch(`${baseUrl}/oauth/callback?code=railway-auth-code-test&state=railway-prod`);
    assert.equal(callbackResponse.status, 200);
  });

  const envFileText = readFileSync(join(railwayOauthDataRoot, '.env.local'), 'utf8');
  assert.match(envFileText, /FEISHU_USER_ACCESS_TOKEN=railway-user-token-should-not-leak/);
  assert.match(envFileText, /FEISHU_USER_REFRESH_TOKEN=railway-refresh-token-should-not-leak/);
} finally {
  rmSync(railwayOauthDataRoot, { recursive: true, force: true });
}

const workbenchHtml = readFileSync('index.html', 'utf8');
const emailAIControlHtml = readFileSync('admin/email-ai-control/index.html', 'utf8');
const emailAIControlAppSource = readFileSync('src/emailAiControlApp.js', 'utf8');
const workbenchAppSource = readFileSync('src/app.js', 'utf8');
assert.equal(workbenchHtml.includes('admin/email-ai-control'), false);
assert.equal(workbenchHtml.includes('邮件 AI 控制中心'), false);
assert.equal(workbenchHtml.includes('data-agent-config'), false);
assert.equal(workbenchHtml.includes('data-knowledge-library'), false);
assert.equal(workbenchHtml.includes('data-risk-rule-library'), false);
assert.equal(workbenchHtml.includes('data-safety'), false);
assert.equal(workbenchHtml.includes('data-api-config'), false);
assert.equal(workbenchHtml.includes('data-launch-checklist'), false);
assert.equal(workbenchHtml.includes('data-email-ai-status'), true);
assert.equal(workbenchHtml.includes('data-settings-section="email-ai-status"'), false);
assert.ok(workbenchHtml.indexOf('data-settings-section="email-ai-admin-auth"') < workbenchHtml.indexOf('data-email-ai-status'));
assert.equal(workbenchHtml.includes('闭环处理'), false);
assert.equal(workbenchAppSource.includes('function renderEmailAISettingsStatus'), true);
assert.equal(workbenchAppSource.includes('前后台怎么连'), true);
assert.equal(workbenchAppSource.includes('前台工作台会自动读取当前 published 版本'), true);
assert.equal(workbenchAppSource.includes('低风险邮件自动回复'), true);
assert.equal(workbenchAppSource.includes('中风险邮件审核后发送'), true);
assert.equal(workbenchAppSource.includes('高风险邮件审核后发送'), true);
assert.equal(workbenchAppSource.includes('renderEmailAIReadOnlyStatus(mail)'), false);
assert.equal(workbenchAppSource.includes('data-invoke-agent'), false);
assert.equal(emailAIControlHtml.includes('返回邮件工作台'), false);
assert.ok(emailAIControlAppSource.includes('前台工作台如何接入这里的配置'));
assert.ok(emailAIControlAppSource.includes('前台设置栏的“AI 调用状态”会显示当前模型和版本'));
assert.ok(emailAIControlAppSource.includes('模型连接检测中'));
assert.ok(emailAIControlAppSource.includes('连接检测失败'));

const emailAITestRoot = mkdtempSync(join(tmpdir(), 'email-ai-control-test-'));
try {
  const defaultEmailAIStore = createDefaultEmailAIStore();
  assert.ok(Array.isArray(defaultEmailAIStore.agentSkills));
	  assert.deepEqual(defaultEmailAIStore.agentSkills.map((skill) => skill.key), [
	    'normalize_email_context',
	    'translate_global_language',
	    'detect_customer_intent_detail',
	    'detect_customer_emotion',
	    'classify_email_risk',
	    'retrieve_knowledge',
	    'score_knowledge_confidence',
	    'extract_missing_fields',
	    'draft_reply',
	    'polish_reply_tone',
	    'check_commitment_risk',
	    'decide_auto_action',
	    'human_feedback',
	  ]);
	  assert.ok(defaultEmailAIStore.agentSkills.find((skill) => skill.key === 'draft_reply').notes.includes('同语种回复'));
	  assert.ok(defaultEmailAIStore.agentSkills.find((skill) => skill.key === 'check_commitment_risk').notes.includes('退款'));
	  assert.equal(defaultEmailAIStore.agentPipeline.enabled, true);
	  assert.equal(defaultEmailAIStore.agentPipeline.traceEnabled, true);
	  assert.ok(defaultEmailAIStore.riskRules.some((rule) => rule.id === 'risk-high-faq-aftersale-watch'));
	  assert.ok(defaultEmailAIStore.knowledgeBase.some((entry) => entry.id === 'kb-faq-taxes-customs-shipping-fee' && entry.standardReplyEn));
	  assert.ok(defaultEmailAIStore.promptTemplates.find((template) => template.id === 'prompt-reply-generation').systemPrompt.includes('primary reference standard'));
	  const faqPrompt = renderPrompt({
	    config: defaultEmailAIStore,
	    promptType: 'reply_generation',
	    emailPayload: {
	      subject: 'Customs fee question',
	      body: 'Do I need to pay tax?',
	      customerLanguage: { code: 'en', label: 'English' },
	    },
	    spam: { isSpam: false },
	    risk: { level: 'low' },
	    knowledgeBaseRefs: [{ id: 'kb-faq-taxes-customs-shipping-fee', title: '售前：税费、海关费、运费' }],
	    knowledgeBaseEntries: [defaultEmailAIStore.knowledgeBase.find((entry) => entry.id === 'kb-faq-taxes-customs-shipping-fee')],
	  });
	  assert.match(faqPrompt.taskPrompt, /Taxes and customs fees are covered by us/);

	  const repository = createEmailAIStoreRepository({ rootDir: emailAITestRoot });
	  const mockConfig = await getPublishedEmailAIConfig({ repository });
  assert.equal(mockConfig.version.status, 'mock');
  assert.ok(mockConfig.modelProviders.some((provider) => provider.providerKey === 'local_mock'));

  const legacySkillRoot = mkdtempSync(join(tmpdir(), 'email-ai-legacy-skills-'));
  try {
    const legacySkillRepository = createEmailAIStoreRepository({ rootDir: legacySkillRoot });
    await legacySkillRepository.updateStore((store) => ({
      ...store,
      agentSkills: [
        {
          id: 'skill-classify-email',
          key: 'classify_email',
          label: '旧邮件分类',
          enabled: true,
          order: 20,
          required: true,
          failurePolicy: 'fail_closed',
        },
        {
          id: 'skill-custom-extra',
          key: 'custom_extra_skill',
          label: '自定义扩展 Skill',
          enabled: true,
          order: 140,
          required: false,
          failurePolicy: 'skip_optional',
        },
      ],
    }));
    const legacySkillStore = await legacySkillRepository.readStore();
    assert.equal(legacySkillStore.agentSkills.some((skill) => skill.key === 'classify_email'), false);
    assert.equal(legacySkillStore.agentSkills.some((skill) => skill.key === 'classify_email_risk'), true);
    assert.equal(legacySkillStore.agentSkills.some((skill) => skill.key === 'custom_extra_skill'), true);
  } finally {
    rmSync(legacySkillRoot, { recursive: true, force: true });
  }

  const lowAIResult = await processEmailWithAI({
    senderEmail: 'buyer-ai-low@example.test',
    subject: 'Product material question',
    body: 'Could you share the product size, material, color and stock information?',
    source: 'email_auto_reply_workbench',
  }, { repository });
  assert.equal(lowAIResult.success, true);
  assert.equal(lowAIResult.risk.level, 'low');
  assert.equal(lowAIResult.finalAction, 'draft_only');
  assert.equal(lowAIResult.reply.tone, 'polite');
  assert.equal(lowAIResult.customerLanguage.code, 'en');
  assert.ok(Array.isArray(lowAIResult.agentTrace));
  assert.ok(lowAIResult.agentTrace.some((step) => step.skillKey === 'normalize_email_context'));
  assert.ok(lowAIResult.agentTrace.some((step) => step.skillKey === 'translate_global_language'));
	  assert.ok(lowAIResult.agentTrace.some((step) => step.skillKey === 'detect_customer_intent_detail'));
	  assert.ok(lowAIResult.agentTrace.some((step) => step.skillKey === 'score_knowledge_confidence'));
	  assert.ok(lowAIResult.agentTrace.some((step) => step.skillKey === 'decide_auto_action'));
  assert.equal(lowAIResult.intent.primaryIntent, 'pre_sale_product_question');
  assert.equal(lowAIResult.knowledgeConfidence.level, 'medium');

  const bodyTranslationAIResult = await processEmailWithAI({
    senderEmail: 'buyer-ai-translation@example.test',
    subject: 'Internal routing label should not become translation',
    bodyText: englishWrongColorBody,
    summary: '客户想换色，需要人工处理。',
    source: 'email_auto_reply_workbench',
  }, { repository });
  assert.equal(bodyTranslationAIResult.success, true);
  assert.equal(bodyTranslationAIResult.customerLanguage.code, 'en');
  assert.match(bodyTranslationAIResult.translation.zh, /错误颜色|颜色不对|不同颜色/);
  assert.match(bodyTranslationAIResult.translation.zh, /黑色/);
  assert.match(bodyTranslationAIResult.customerMessageTranslationZh, /黑色/);
  assert.doesNotMatch(bodyTranslationAIResult.translation.zh, /Internal routing label|客户想换色|意图|方向/);
  const mappedTranslationMail = mapEmailAIResultToWorkbenchMail({
    id: 'MAIL-TRANSLATION',
    sender: 'buyer-ai-translation@example.test',
    subject: 'Internal routing label should not become translation',
    summary: '客户想换色，需要人工处理。',
    bodyText: englishWrongColorBody,
  }, bodyTranslationAIResult);
  assert.match(mappedTranslationMail.customerMessageTranslationZh, /黑色/);
  assert.equal(mappedTranslationMail.translation.source, bodyTranslationAIResult.translation.source);
  const mappedTranslationView = buildMailContentView(mappedTranslationMail);
  assert.match(mappedTranslationView.original, /wrong color watch/);
  assert.match(mappedTranslationView.translation, /黑色/);
  assert.doesNotMatch(mappedTranslationView.translation, /客户想换色|Internal routing label/);

  const taxFAQAIResult = await processEmailWithAI({
    senderEmail: 'buyer-ai-tax@example.test',
    subject: 'Customs fee and shipping fee',
	    body: 'Do I need to pay tax, customs fee or shipping fee for this watch?',
	    source: 'email_auto_reply_workbench',
	  }, { repository });
	  assert.equal(taxFAQAIResult.success, true);
	  assert.equal(taxFAQAIResult.risk.level, 'low');
	  assert.ok(taxFAQAIResult.knowledgeBaseRefs.some((ref) => ref.id === 'kb-faq-taxes-customs-shipping-fee'));
	  assert.match(taxFAQAIResult.reply.draft, /Taxes and customs fees are covered by us/);

	  const spanishAIResult = await processEmailWithAI({
	    senderEmail: 'buyer-ai-es@example.test',
	    subject: 'Consulta sobre pedido',
    body: 'Hola, necesito ayuda con mi pedido y el envio.',
    source: 'email_auto_reply_workbench',
  }, { repository });
  assert.equal(spanishAIResult.success, true);
  assert.equal(spanishAIResult.customerLanguage.code, 'es');
  assert.equal(spanishAIResult.reply.customerLanguage.code, 'es');
  assert.match(spanishAIResult.reply.draft, /Hola|pedido|Gracias/i);

  const autoSendPolicyRoot = mkdtempSync(join(tmpdir(), 'email-ai-auto-send-policy-'));
  try {
    const autoSendPolicyRepository = createEmailAIStoreRepository({ rootDir: autoSendPolicyRoot });
    await autoSendPolicyRepository.updateStore((store) => ({
      ...store,
      strategyConfig: {
        ...(store.strategyConfig || {}),
        lowRiskDefaultAction: 'auto_send_allowed',
      },
    }));
    const autoSendLowAIResult = await processEmailWithAI({
      senderEmail: 'buyer-ai-auto-low@example.test',
      subject: 'Product material question',
      body: 'Could you share the product size, material, color and stock information?',
      source: 'email_auto_reply_workbench',
    }, { repository: autoSendPolicyRepository });
    assert.equal(autoSendLowAIResult.success, true);
    assert.equal(autoSendLowAIResult.risk.level, 'low');
    assert.equal(autoSendLowAIResult.finalAction, 'auto_send_allowed');
    assert.equal(mapEmailAIResultToWorkbenchMail({
      id: 'MAIL-AUTO-LOW',
      sender: 'buyer-ai-auto-low@example.test',
      subject: 'Product material question',
    }, autoSendLowAIResult).action, 'auto_reply');

    const autoSendRefundResult = await processEmailWithAI({
      senderEmail: 'buyer-ai-auto-refund@example.test',
      subject: 'Refund request',
      body: 'I want a refund for my order.',
      source: 'email_auto_reply_workbench',
    }, { repository: autoSendPolicyRepository });
    assert.equal(autoSendRefundResult.risk.level, 'high');
    assert.notEqual(autoSendRefundResult.finalAction, 'auto_send_allowed');
  } finally {
    rmSync(autoSendPolicyRoot, { recursive: true, force: true });
  }

  const mediumAIResult = await processEmailWithAI({
    senderEmail: 'buyer-ai-medium@example.test',
    subject: 'Where is my package?',
    body: 'I have asked many times and I am worried because the logistics status looks abnormal.',
    source: 'email_auto_reply_workbench',
  }, { repository });
  assert.equal(mediumAIResult.risk.level, 'medium');
  assert.equal(mediumAIResult.finalAction, 'human_review');

  const highAIResult = await processEmailWithAI({
    senderEmail: 'buyer-ai-high@example.test',
    subject: 'Refund complaint',
    body: 'I want a refund now or I will complain to the platform and leave a bad review.',
    source: 'email_auto_reply_workbench',
  }, { repository });
	  assert.equal(highAIResult.risk.level, 'high');
	  assert.equal(highAIResult.safety.needHumanReview, true);
	  assert.ok(['human_review', 'blocked'].includes(highAIResult.finalAction));
	  assert.equal(highAIResult.intent.primaryIntent, 'refund');
	  assert.equal(highAIResult.emotion.emotionLevel, 'threatening');
	  assert.equal(highAIResult.commitmentRisk.blocked, false);
	  assert.ok(highAIResult.decisionReasons.some((reason) => /高风险|human/i.test(reason)));

	  const qualityFAQAIResult = await processEmailWithAI({
	    senderEmail: 'buyer-ai-quality@example.test',
	    subject: 'Quality issue',
	    body: 'The watch is defective and not working. I am very angry about the quality.',
	    source: 'email_auto_reply_workbench',
	  }, { repository });
	  assert.equal(qualityFAQAIResult.risk.level, 'high');
	  assert.ok(qualityFAQAIResult.knowledgeBaseRefs.some((ref) => ref.id === 'kb-faq-quality-complaint'));
	  assert.equal(qualityFAQAIResult.reply.draft, '');
	  assert.match(qualityFAQAIResult.reply.internalSuggestion, /命中知识库：售后：质量不满/);

  const spamAIResult = await processEmailWithAI({
    senderEmail: 'promo@marketing.example',
    subject: 'SEO backlinks and promotion',
    body: 'We provide cheap SEO backlinks, casino traffic and mass marketing links.',
    source: 'email_auto_reply_workbench',
  }, { repository });
  assert.equal(spamAIResult.spam.isSpam, true);
  assert.equal(spamAIResult.finalAction, 'ignore_spam');
  assert.equal(spamAIResult.reply.draft, '');

  const safetyRefund = checkOutputSafety({
    draft: 'We will refund your order today and compensate you immediately.',
    internalSuggestion: '',
  }, mockConfig);
  assert.equal(safetyRefund.needHumanReview, true);
  assert.equal(safetyRefund.blocked, true);
  assert.ok(safetyRefund.reasons.some((reason) => /退款|赔偿|refund|compensate/i.test(reason)));

  const safetyLogistics = checkOutputSafety({
    draft: 'Your package has already shipped with tracking number 123456 and will arrive tomorrow.',
    internalSuggestion: '',
  }, mockConfig);
  assert.equal(safetyLogistics.needHumanReview, true);
  assert.ok(safetyLogistics.reasons.some((reason) => /物流|tracking|arrive/i.test(reason)));

  const deepSeekRequests = [];
  const deepSeekReply = await callOpenAIModel({
    provider: {
      providerKey: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKeyEnvName: 'DEEPSEEK_API_KEY',
      defaultModel: 'deepseek-chat',
      temperature: 0.1,
      maxTokens: 800,
    },
    prompt: {
      systemPrompt: 'You are a safe email reply assistant.',
      taskPrompt: 'Generate a cautious customer service reply.',
    },
    risk: { level: 'low' },
    env: {
      DEEPSEEK_API_KEY: 'deepseek-adapter-secret',
    },
    fetchImpl: async (url, options) => {
      deepSeekRequests.push({ url, options });
      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: {
                  draft: 'Thank you for reaching out. We will check this carefully.',
                  internalSuggestion: '',
                  tone: 'polite',
                },
              }),
            },
          },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(deepSeekRequests.length, 1);
  assert.equal(deepSeekRequests[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(deepSeekRequests[0].options.headers.authorization, 'Bearer deepseek-adapter-secret');
  assert.equal(JSON.parse(deepSeekRequests[0].options.body).model, 'deepseek-chat');
  assert.equal(deepSeekReply.draft, 'Thank you for reaching out. We will check this carefully.');
  assert.equal(deepSeekReply.tone, 'polite');

  const deepSeekMissingKeyCheck = await testOpenAIConnection({
    providerKey: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    apiKeyEnvName: 'DEEPSEEK_API_KEY',
  }, {});
  assert.equal(deepSeekMissingKeyCheck.ok, false);
  assert.match(deepSeekMissingKeyCheck.message, /DEEPSEEK_API_KEY/);

  const deepSeekConfiguredCheck = await testOpenAIConnection({
    providerKey: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    apiKeyEnvName: 'DEEPSEEK_API_KEY',
  }, {
    DEEPSEEK_API_KEY: 'configured',
  });
  assert.equal(deepSeekConfiguredCheck.ok, true);
  assert.match(deepSeekConfiguredCheck.message, /基础配置已通过/);

  await withTestServer(createFeishuApiServer({
    rootDir: emailAITestRoot,
    env: {
      EMAIL_AI_ADMIN_TOKEN: 'admin-secret',
      OPENAI_API_KEY: 'real-openai-key-should-not-leak',
    },
  }), async (baseUrl) => {
    const forbiddenResponse = await fetch(`${baseUrl}/api/admin/email-ai-control/model-providers`);
    assert.equal(forbiddenResponse.status, 401);

    const createProviderResponse = await fetch(`${baseUrl}/api/admin/email-ai-control/model-providers`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer admin-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'OpenAI Test',
        providerKey: 'openai_test',
        apiKeyEnvName: 'OPENAI_API_KEY',
        defaultModel: 'gpt-test',
        usageType: 'test_only',
        enabled: true,
      }),
    });
    assert.equal(createProviderResponse.status, 201);
    const createProviderText = await createProviderResponse.text();
    assert.equal(createProviderText.includes('real-openai-key-should-not-leak'), false);
    const createdProvider = JSON.parse(createProviderText);
    assert.equal(createdProvider.item.apiKeyConfigured, true);

    const createDeepSeekResponse = await fetch(`${baseUrl}/api/admin/email-ai-control/model-providers`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer admin-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'DeepSeek Test',
        providerKey: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        apiKeyEnvName: 'DEEPSEEK_API_KEY',
        apiKeyValue: 'deepseek-secret-should-not-leak',
        defaultModel: 'deepseek-chat',
        supportedModels: ['deepseek-chat', 'deepseek-reasoner'],
        usageType: 'both',
        enabled: false,
      }),
    });
    assert.equal(createDeepSeekResponse.status, 201);
    const createDeepSeekText = await createDeepSeekResponse.text();
    assert.equal(createDeepSeekText.includes('deepseek-secret-should-not-leak'), false);
    const createdDeepSeek = JSON.parse(createDeepSeekText);
    assert.equal(createdDeepSeek.secretSaved, true);
    assert.equal(createdDeepSeek.item.apiKeyConfigured, true);

    const envFileText = readFileSync(join(emailAITestRoot, '.env.local'), 'utf8');
    assert.match(envFileText, /^DEEPSEEK_API_KEY=deepseek-secret-should-not-leak$/m);

    const storeText = readFileSync(join(emailAITestRoot, 'data/email-ai-control-store.json'), 'utf8');
    assert.equal(storeText.includes('deepseek-secret-should-not-leak'), false);

    const modelProvidersResponse = await fetch(`${baseUrl}/api/admin/email-ai-control/model-providers`, {
      headers: { authorization: 'Bearer admin-secret' },
    });
    assert.equal(modelProvidersResponse.status, 200);
    const modelProvidersText = await modelProvidersResponse.text();
    assert.equal(modelProvidersText.includes('deepseek-secret-should-not-leak'), false);
    const modelProvidersPayload = JSON.parse(modelProvidersText);
    const deepSeekProvider = modelProvidersPayload.items.find((item) => item.providerKey === 'deepseek');
    assert.equal(deepSeekProvider.apiKeyConfigured, true);

    const createAgentSkillResponse = await fetch(`${baseUrl}/api/admin/email-ai-control/agent-skills`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer admin-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        key: 'custom_test_skill',
        label: '测试 Skill',
        description: '测试管理端新增 skill。',
        enabled: true,
        order: 90,
        required: false,
        failurePolicy: 'skip_optional',
      }),
    });
    assert.equal(createAgentSkillResponse.status, 201);
    const createdAgentSkillPayload = await createAgentSkillResponse.json();
    assert.equal(createdAgentSkillPayload.item.key, 'custom_test_skill');
    const updateAgentSkillResponse = await fetch(`${baseUrl}/api/admin/email-ai-control/agent-skills/${createdAgentSkillPayload.item.id}`, {
      method: 'PUT',
      headers: {
        authorization: 'Bearer admin-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ...createdAgentSkillPayload.item,
        enabled: false,
      }),
    });
    assert.equal(updateAgentSkillResponse.status, 200);
    const updatedAgentSkillPayload = await updateAgentSkillResponse.json();
    assert.equal(updatedAgentSkillPayload.item.enabled, false);

    const aiProcessResponse = await fetch(`${baseUrl}/api/email-ai/process`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        senderEmail: 'buyer-process@example.test',
        subject: 'Product information',
        body: 'Can you tell me the material and color?',
        source: 'email_auto_reply_workbench',
      }),
    });
    assert.equal(aiProcessResponse.status, 200);
    const aiProcessPayload = await aiProcessResponse.json();
    assert.equal(aiProcessPayload.success, true);
    assert.equal(aiProcessPayload.risk.level, 'low');

    const blockedDraftResponse = await fetch(`${baseUrl}/api/admin/email-ai-control/versions/create-draft`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer admin-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ versionName: 'Blocked Draft', publishNote: 'should fail before test' }),
    });
    const blockedDraftPayload = await blockedDraftResponse.json();
    const blockedPublishResponse = await fetch(`${baseUrl}/api/admin/email-ai-control/versions/${blockedDraftPayload.version.id}/publish`, {
      method: 'POST',
      headers: { authorization: 'Bearer admin-secret' },
    });
    assert.equal(blockedPublishResponse.status, 409);

    const testRunResponse = await fetch(`${baseUrl}/api/admin/email-ai-control/test`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer admin-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        subject: 'Logistics question',
        body: 'Where is my order? The logistics update is delayed.',
        senderEmail: 'buyer-test-run@example.test',
        useMock: true,
        versionSource: 'draft',
      }),
    });
    assert.equal(testRunResponse.status, 200);
    const testRunPayload = await testRunResponse.json();
    assert.equal(testRunPayload.status, 'passed');

    const firstDraftResponse = await fetch(`${baseUrl}/api/admin/email-ai-control/versions/create-draft`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer admin-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ versionName: 'Email AI v1', publishNote: 'first publishable version' }),
    });
    const firstDraftPayload = await firstDraftResponse.json();
    const firstPublishResponse = await fetch(`${baseUrl}/api/admin/email-ai-control/versions/${firstDraftPayload.version.id}/publish`, {
      method: 'POST',
      headers: { authorization: 'Bearer admin-secret' },
    });
    assert.equal(firstPublishResponse.status, 200);

    const secondDraftResponse = await fetch(`${baseUrl}/api/admin/email-ai-control/versions/create-draft`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer admin-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ versionName: 'Email AI v2', publishNote: 'second version' }),
    });
    const secondDraftPayload = await secondDraftResponse.json();
    const secondPublishResponse = await fetch(`${baseUrl}/api/admin/email-ai-control/versions/${secondDraftPayload.version.id}/publish`, {
      method: 'POST',
      headers: { authorization: 'Bearer admin-secret' },
    });
    assert.equal(secondPublishResponse.status, 200);

    const versionsResponse = await fetch(`${baseUrl}/api/admin/email-ai-control/versions`, {
      headers: { authorization: 'Bearer admin-secret' },
    });
    const versionsPayload = await versionsResponse.json();
    assert.equal(versionsPayload.versions.filter((version) => version.status === 'published').length, 1);
    assert.equal(versionsPayload.published.versionName, 'Email AI v2');

    const rollbackResponse = await fetch(`${baseUrl}/api/admin/email-ai-control/versions/${firstDraftPayload.version.id}/rollback`, {
      method: 'POST',
      headers: { authorization: 'Bearer admin-secret' },
    });
    assert.equal(rollbackResponse.status, 200);
    const rollbackPayload = await rollbackResponse.json();
    assert.equal(rollbackPayload.published.versionName, 'Email AI v1');

    const aiStatusResponse = await fetch(`${baseUrl}/api/email-ai/status`);
    assert.equal(aiStatusResponse.status, 200);
    const aiStatusText = await aiStatusResponse.text();
    assert.equal(aiStatusText.includes('real-openai-key-should-not-leak'), false);
    assert.equal(aiStatusText.includes('deepseek-secret-should-not-leak'), false);
    const aiStatusPayload = JSON.parse(aiStatusText);
    assert.equal(aiStatusPayload.ok, true);
    assert.equal(aiStatusPayload.configVersionId, rollbackPayload.published.id);
    assert.ok(aiStatusPayload.model.replyModelProvider);
    assert.ok(aiStatusPayload.providers.every((provider) => provider.apiKeyValue === undefined));
  });
} finally {
  rmSync(emailAITestRoot, { recursive: true, force: true });
}

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.ok(indexHtml.includes('data-app-layout'));
assert.equal(indexHtml.includes('data-side-nav'), false);
assert.equal(indexHtml.includes('data-nav-dashboard'), false);
assert.equal(indexHtml.includes('data-nav-workbench'), false);
assert.equal(indexHtml.includes('data-nav-settings'), false);
assert.equal(indexHtml.includes('<strong>系统设置</strong>'), false);
assert.ok(indexHtml.includes('settings-dock-button'));
assert.ok(indexHtml.includes('data-open-settings'));
assert.ok(indexHtml.includes('aria-label="打开系统设置"'));
assert.ok(indexHtml.includes('mailbox-settings-dock'));
assert.ok(indexHtml.indexOf('mailbox-settings-dock') < indexHtml.indexOf('</aside>'));
assert.ok(indexHtml.includes('返回系统规则'));
assert.equal(indexHtml.includes('data-rule-toggle'), false);
assert.equal(indexHtml.includes('data-rule-menu'), false);
assert.ok(indexHtml.includes('data-mailbox-nav'));
assert.ok(indexHtml.includes('data-mailbox-contact'));
assert.ok(indexHtml.includes('data-mailbox-list-toggle'));
assert.equal(indexHtml.includes('>♙<'), false);
assert.ok(indexHtml.includes('data-mailbox-contact-panel'));
assert.ok(indexHtml.includes('data-mailbox-list-panel'));
assert.ok(indexHtml.includes('data-mailbox-search'));
assert.ok(indexHtml.includes('data-open-overview'));
assert.ok(indexHtml.includes('data-mailbox-section="urgent"'));
assert.ok(indexHtml.indexOf('data-mailbox-section="urgent"') < indexHtml.indexOf('data-mailbox-section="inbox"'));
assert.ok(indexHtml.includes('data-mailbox-filter="inbox"'));
assert.ok(indexHtml.includes('data-mailbox-submenu="inbox"'));
assert.ok(indexHtml.includes('data-mailbox-filter="urgent"'));
assert.ok(indexHtml.indexOf('data-mailbox-filter="urgent"') < indexHtml.indexOf('data-mailbox-filter="inbox"'));
assert.ok(indexHtml.indexOf('data-mailbox-filter="inbox"') < indexHtml.indexOf('data-mailbox-filter="favorite"'));
assert.equal(indexHtml.includes('data-mailbox-filter="high_risk"'), false);
assert.equal(indexHtml.includes('data-mailbox-count="high_risk"'), false);
assert.ok(indexHtml.includes('data-mailbox-filter="favorite"'));
assert.ok(indexHtml.includes('data-mailbox-filter="sent"'));
assert.ok(indexHtml.includes('data-mailbox-filter="archived"'));
assert.ok(indexHtml.includes('data-mailbox-filter="deleted"'));
assert.ok(indexHtml.includes('data-mailbox-filter="spam"'));
assert.ok(indexHtml.includes('data-mailbox-inline-list="urgent"'));
assert.ok(indexHtml.includes('data-mailbox-inline-list="inbox"'));
assert.ok(indexHtml.includes('data-mailbox-inline-list="sent"'));
assert.ok(indexHtml.includes('data-mailbox-inline-list="archived"'));
assert.ok(indexHtml.includes('data-mailbox-inline-list="deleted"'));
assert.ok(indexHtml.includes('data-mailbox-inline-list="spam"'));
assert.ok(indexHtml.indexOf('data-mailbox-submenu="sent"') < indexHtml.indexOf('data-mailbox-inline-list="sent"'));
assert.equal(indexHtml.includes('写邮件'), false);
assert.equal(indexHtml.includes('文件夹'), false);

const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
assert.ok(appJs.includes('处理趋势'));
assert.ok(appJs.includes('处理状态分布'));
assert.ok(appJs.includes('AI 状态'));
assert.ok(appJs.includes('自动化状态'));
assert.ok(appJs.includes('data-mailbox-filter'));
assert.ok(appJs.includes('mailboxSearchQuery'));
assert.ok(appJs.includes('data-mailbox-section-toggle'));
assert.ok(appJs.includes('data-mailbox-contact'));
assert.ok(appJs.includes('data-mailbox-list-toggle'));
assert.ok(appJs.includes('mailboxInlineListEls'));
assert.ok(appJs.includes('data-mailbox-inline-list'));
assert.ok(appJs.includes('WORKBENCH_RISK_SNAPSHOTS_KEY'));
assert.ok(appJs.includes('applyStableRiskSnapshot'));
assert.ok(appJs.includes('riskSnapshotKey'));
assert.ok(appJs.includes('getMailRiskState(mail)'));
assert.equal(appJs.includes('feishu-mail-risk-rules'), false);
assert.equal(appJs.includes('applyRiskRule'), false);
assert.equal(appJs.includes('riskText[mail.risk]'), false);
assert.equal(appJs.includes('renderMainNavigationState'), false);
assert.equal(appJs.includes('ruleMenuOpen'), false);
assert.equal(appJs.includes('data-nav-workbench'), false);
assert.equal(appJs.includes('data-rule-toggle'), false);
assert.ok(appJs.includes('compact-mail-row'));
assert.ok(appJs.includes('settings-sub-nav'));
assert.ok(appJs.includes('data-settings-command'));
assert.ok(appJs.includes('SYSTEM_RULE_SETTINGS_ITEM'));
assert.ok(appJs.includes('data-settings-rule'));
assert.ok(appJs.includes('系统规则'));
assert.ok(appJs.includes('openEmailRuleControl(button.dataset.settingsRule'));
assert.ok(appJs.includes('const childMenuOpen = expandedSettingsPrimary === item.key;'));
assert.ok(appJs.includes('childMenuOpen && item.children?.length'));
assert.ok(appJs.includes('const adminPrimaryItem = primaryItems.find((item) => item.key === \'email-ai-admin-auth\');'));
assert.ok(appJs.includes('adminPrimaryItem ? [...nextItems, adminPrimaryItem] : nextItems'));
assert.ok(appJs.includes('expandedSettingsPrimary'));
assert.ok(appJs.includes('const hasChildren = Boolean(activePrimary.children?.length);'));
assert.ok(appJs.includes('expandedSettingsPrimary === nextPrimaryKey ? \'\' : nextPrimaryKey'));
assert.ok(appJs.includes('returnToSystemRulesSettings'));
assert.ok(appJs.includes('data-return-system-rules'));
assert.ok(indexHtml.includes('data-return-system-rules'));
assert.equal(appJs.includes('aria-label="打开系统设置">?</button>'), false);

const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
assert.equal(/\.settings-dock-button\s*\{[^}]*position:\s*fixed/s.test(stylesSource), false);
assert.ok(stylesSource.includes('.settings-panel .settings-content'));
assert.ok(stylesSource.includes('.settings-primary-item,'));
assert.ok(stylesSource.includes('.settings-rule-empty'));
assert.ok(stylesSource.includes('color: #dcecff'));
assert.ok(stylesSource.includes('/* Workbench detail contrast and mailbox list sizing */'));
assert.ok(stylesSource.includes('flex: 1 1 300px;'));
assert.ok(stylesSource.includes('.detail-card .panel-section,'));
assert.ok(stylesSource.includes('.reply-composer-card,'));
assert.ok(stylesSource.includes('.mail-rule-button,'));
assert.ok(stylesSource.includes('.mail-rule-button:hover'));
assert.ok(stylesSource.includes('/* Mailbox row state contrast */'));
assert.ok(stylesSource.includes('.mail-row.status-completed,'));
assert.ok(stylesSource.includes('.mail-row.status-pending,'));
assert.ok(stylesSource.includes('.mail-row.status-urgent,'));
assert.ok(stylesSource.includes('rgba(7, 31, 64, 0.92)'));
assert.ok(stylesSource.includes('/* Inline mailbox list layout */'));
assert.ok(stylesSource.includes('.mailbox-list-panel {'));
assert.ok(stylesSource.includes('display: none;'));
assert.ok(stylesSource.includes('.mailbox-inline-list'));
assert.ok(stylesSource.includes('min-height: 58px;'));
assert.ok(stylesSource.includes('.mailbox-inline-list .compact-mail-row span.row-meta'));
assert.ok(stylesSource.includes('margin: 2px 0;'));
assert.ok(stylesSource.includes('.mailbox-inline-list .compact-mail-row .status-pill'));
assert.ok(stylesSource.includes('margin-top: 0;'));
assert.ok(stylesSource.includes('/* System rule control dark surface sweep */'));
assert.ok(stylesSource.includes('.email-rule-control-panel .tab-bar button'));
assert.ok(stylesSource.includes('.email-rule-control-panel .status-line'));
assert.ok(stylesSource.includes('.email-rule-control-panel .tab-content'));
assert.ok(stylesSource.includes('.email-rule-control-panel button.secondary'));
assert.ok(stylesSource.includes('.email-rule-control-panel button.danger'));
assert.ok(stylesSource.includes('.email-rule-control-panel .table-wrap'));
assert.ok(stylesSource.includes('.email-rule-control-panel .empty'));
assert.ok(stylesSource.includes('/* Admin control dark surface sweep */'));
assert.ok(stylesSource.includes('.settings-panel .ai-control-embedded .status-line'));
assert.ok(stylesSource.includes('.settings-panel .ai-control-embedded .tab-content'));
assert.ok(stylesSource.includes('.settings-panel .ai-control-embedded .operator-guide'));
assert.ok(stylesSource.includes('.settings-panel .ai-control-embedded button.secondary'));
assert.ok(stylesSource.includes('.settings-panel .ai-control-embedded button.danger'));
assert.ok(stylesSource.includes('.settings-panel .overview-ai-list div'));
assert.ok(stylesSource.includes('.settings-panel .config-list li'));
assert.ok(stylesSource.includes('.settings-panel .email-ai-readonly-card .readonly-model-grid div'));
assert.ok(stylesSource.includes('.settings-panel .email-ai-readonly-card .operator-guide'));
assert.ok(stylesSource.includes('.settings-panel .sound-control-card'));

console.log('rules.test.mjs passed');
