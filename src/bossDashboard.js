import { buildDraftRecord, buildSendQueueItem, summarizeDraftWorkflow } from './draftWorkflow.js';
import {
  buildSendContextFromFeishuMessages,
} from './feishuAdapter.js';
import { classifyMail, summarizeMails } from './rules.js';
import { evaluateSendGuard } from './sendGuard.js';
import { DEFAULT_AGENT_CONFIG, buildAgentRuntimeContext } from './agentConfig.js';
import { buildPublicFeishuWriteStatus } from './feishuWriteControls.js';
import { getMailRiskState } from './riskState.js';

export const DATA_SOURCE_STATUSES = [
  '真实接入',
  'API 待接入',
  'CSV',
];

const priorityByRisk = {
  high: '高',
  medium: '中',
  low: '低',
  spam: '白',
};

function buildMailWorkItems({
  mails = [],
  messages = [],
  reviews = {},
  agentConfig = DEFAULT_AGENT_CONFIG,
} = {}) {
  const sendContext = buildSendContextFromFeishuMessages(messages);

  return (Array.isArray(mails) ? mails : [])
    .map((mail) => {
      const classifiedMail = classifyMail(mail, { agentConfig });
      const sendGuard = evaluateSendGuard(classifiedMail, {
        repliedMessageIds: sendContext.repliedMessageIds,
        repliedThreadKeys: sendContext.repliedThreadKeys,
        expectedThreadKey: sendContext.expectedThreadKeysByMailId[classifiedMail.id],
      });
      const draftRecord = buildDraftRecord(classifiedMail, reviews[classifiedMail.id]);
      const queueItem = buildSendQueueItem(classifiedMail, draftRecord, sendGuard);

      return {
        ...classifiedMail,
        sendGuard,
        draftRecord,
        queueItem,
        priority: priorityByRisk[classifiedMail.risk],
        sourceStatus: '真实接入',
        sourceLabel: '真实接入',
      };
    });
}

function buildDataSources({ mailSourceStatus = 'API 待接入', hasOrders = false } = {}) {
  const hasMailData = mailSourceStatus !== 'API 待接入';

  return [
    {
      name: '飞书邮箱',
      currentMethod: mailSourceStatus === '真实接入' ? '飞书邮箱 API 只读' : mailSourceStatus,
      status: hasMailData ? '已读取' : '待启动本地 API 代理',
      owner: '利华实现，阿雨验收',
      firstPhase: '是',
      sourceStatus: mailSourceStatus,
      synced: hasMailData,
    },
    {
      name: 'ERP / 订单',
      currentMethod: 'CSV / API 待确认',
      status: hasOrders ? '样例已入看板，API 待接入' : '暂未接入',
      owner: '海龙提供接口信息',
      firstPhase: '是',
      sourceStatus: hasOrders ? 'CSV' : 'API 待接入',
      synced: hasOrders,
    },
    {
      name: '飞书多维表格',
      currentMethod: 'API / 手工',
      status: '待确认',
      owner: '海龙',
      firstPhase: '可选',
      sourceStatus: 'API 待接入',
      synced: false,
    },
    {
      name: '抖店',
      currentMethod: 'API 待申请',
      status: '暂缓',
      owner: '海龙',
      firstPhase: '否',
      sourceStatus: 'API 待接入',
      synced: false,
    },
    {
      name: 'TikTok / TK',
      currentMethod: 'API 待申请',
      status: '暂缓',
      owner: '海龙',
      firstPhase: '否',
      sourceStatus: 'API 待接入',
      synced: false,
    },
    {
      name: 'WhatsApp / Facebook',
      currentMethod: '官方权限高',
      status: '后续',
      owner: '海龙',
      firstPhase: '否',
      sourceStatus: 'API 待接入',
      synced: false,
    },
  ];
}

function buildMailPriorityQueue(mailItems) {
  const priorityOrder = { high: 0, medium: 1, low: 2, spam: 3 };

  return [...mailItems]
    .sort((a, b) => priorityOrder[getMailRiskState(a).risk] - priorityOrder[getMailRiskState(b).risk])
    .slice(0, 12)
    .map((mail) => {
      const riskState = getMailRiskState(mail);
      return {
        id: mail.id,
        subject: mail.subject,
        category: mail.category,
        priority: mail.priority,
        risk: riskState.risk,
        reason: mail.reason,
        action: riskState.action,
        requiresReview: mail.requiresReview,
        handlerStatus: riskState.urgent
          ? '待人工处理'
          : riskState.spam
            ? '建议归档/移箱'
            : mail.queueItem.queueStatus,
        sourceStatus: mail.sourceStatus,
      };
    });
}

function buildOrderExamples(orders) {
  return orders.map((order) => ({
    ...order,
    sourceStatus: order.sourceStatus,
    sourceLabel: order.sourceLabel,
  }));
}

function uniqueSourceStatuses(dataSources, orders) {
  return [...new Set([
    ...dataSources.map((source) => source.sourceStatus),
    ...orders.map((order) => order.sourceStatus),
  ])];
}

function buildProcessingAnalysis(mailItems, mailSummary, workflowSummary, writeStatus) {
  const exceptionItems = mailItems
    .filter((mail) => (
      getMailRiskState(mail).urgent
      || mail.requiresReview
      || ['blocked', 'duplicate', 'thread_mismatch'].includes(mail.sendGuard?.mode)
    ))
    .slice(0, 12)
    .map((mail) => {
      const riskState = getMailRiskState(mail);
      return {
        kind: 'mail',
        id: mail.id,
        subject: mail.subject,
        risk: riskState.risk,
        action: riskState.action,
        reason: mail.reason,
        status: riskState.urgent
          ? '高风险待人工处理'
          : mail.requiresReview
            ? '待人工审核'
            : mail.sendGuard?.mode || '待处理',
        sourceStatus: mail.sourceStatus,
      };
    });

  return {
    riskDistribution: {
      low: mailSummary.low,
      medium: mailSummary.medium,
      high: mailSummary.high,
      spam: mailSummary.spam,
    },
    actionDistribution: {
      autoReply: mailSummary.autoReply,
      draftOnly: mailSummary.draftOnly,
      blocked: mailSummary.blocked,
      ignored: mailSummary.ignored,
    },
    workflowDistribution: {
      draftSaved: workflowSummary.draftSaved,
      waitingReview: workflowSummary.waitingReview,
      approved: workflowSummary.approved,
      queued: workflowSummary.queued,
      sendGuardBlocked: workflowSummary.blocked,
      ignored: workflowSummary.ignored,
      realSendAllowed: workflowSummary.realSendAllowed,
    },
    sourceRows: [
      {
        name: '邮件读取与分类',
        metric: `${mailSummary.total} 封`,
        detail: '来自飞书邮箱工作台分类结果，按低/中/高/垃圾四类汇总。',
        sourceStatus: mailItems[0]?.sourceStatus || 'API 待接入',
      },
      {
        name: '候选回复与草稿',
        metric: `${workflowSummary.draftSaved} 条`,
        detail: `可入队 ${workflowSummary.queued}，待人工审核 ${workflowSummary.waitingReview}。`,
        sourceStatus: mailItems[0]?.sourceStatus || 'API 待接入',
      },
      {
        name: '真实写操作',
        metric: writeStatus.writeEnabled ? '受控开放' : '暂停',
        detail: `发送 ${writeStatus.realSendEnabled ? '开' : '关'}，归档 ${writeStatus.realArchiveEnabled ? '开' : '关'}，原始来信人 ${writeStatus.customerReplyOriginalSenderEnabled ? '开' : '关'}，特殊名单 ${writeStatus.allowlistCount || 0}。`,
        sourceStatus: writeStatus.writeEnabled ? '真实接入' : 'API 待接入',
      },
      {
        name: '风险拦截',
        metric: `${mailSummary.high + mailSummary.ignored} 封`,
        detail: '高风险不自动发送，垃圾邮件不生成客服回复。',
        sourceStatus: mailItems[0]?.sourceStatus || 'API 待接入',
      },
    ],
    exceptionItems,
    boundaryNotes: [
      '退款/赔偿类当前只处理邮件回复与审批记录，不触发订单、支付或赔偿接口。',
      '高风险邮件必须人工接触内容并审批后才能发送人工确认回复。',
      '垃圾邮件按归档/移箱设计，不做不可恢复硬删除。',
      '所有老板看板数据块必须保留来源状态，未读取真实 API 时不能标成真实接入。',
    ],
  };
}

function buildProcessingReport(mailSummary, workflowSummary, writeStatus, processingAnalysis) {
  const mailSourceStatus = processingAnalysis.sourceRows[0]?.sourceStatus || 'API 待接入';
  const writeSourceStatus = writeStatus.writeEnabled ? '真实接入' : 'API 待接入';
  const highRiskCount = mailSummary.high;
  const waitingReviewCount = workflowSummary.waitingReview;
  const handledCount = mailSummary.autoReply + mailSummary.ignored;
  const bossConclusion = highRiskCount > 0
    ? `今天有 ${highRiskCount} 封高风险邮件需要老板关注，退款、投诉、改价或发货承诺不得自动处理。`
    : waitingReviewCount > 0
      ? `今天有 ${waitingReviewCount} 封邮件等待人工审核，老板只需关注是否影响客户体验。`
      : mailSummary.total > 0
        ? '今天邮件已完成分类分流，暂无需要老板介入的高风险异常。'
        : '当前没有读取到邮件数据，请先确认飞书 API 状态。';
  const resultSummary = {
    totalMailCount: mailSummary.total,
    handledCount,
    waitingReviewCount,
    highRiskCount,
    spamCount: mailSummary.spam,
    bossConclusion,
    sourceStatus: mailSourceStatus,
  };
  const executiveItems = processingAnalysis.exceptionItems.slice(0, 5);

  return {
    resultSummary,
    resultMetrics: [
      {
        key: 'mail_total',
        label: '今日邮件总量',
        value: resultSummary.totalMailCount,
        detail: '已进入工作台并完成分类。',
        sourceStatus: mailSourceStatus,
      },
      {
        key: 'handled_count',
        label: '已分流处理',
        value: resultSummary.handledCount,
        detail: '低风险候选回复 + 垃圾/无效分流。',
        sourceStatus: mailSourceStatus,
      },
      {
        key: 'waiting_review',
        label: '待人工处理',
        value: resultSummary.waitingReviewCount,
        detail: '需要客服或负责人确认。',
        sourceStatus: mailSourceStatus,
      },
      {
        key: 'high_exceptions',
        label: '高风险异常',
        value: resultSummary.highRiskCount,
        detail: '退款、投诉、改价、发货承诺等。',
        sourceStatus: mailSourceStatus,
      },
      {
        key: 'spam_count',
        label: '无效/垃圾',
        value: resultSummary.spamCount,
        detail: '不回复，只归档或移箱。',
        sourceStatus: mailSourceStatus,
      },
    ],
    executiveItems,
    headlineMetrics: [
      {
        key: 'mail_total',
        label: '今日邮件处理量',
        value: mailSummary.total,
        detail: '进入工作台并完成分类的邮件数量。',
        sourceStatus: mailSourceStatus,
      },
      {
        key: 'waiting_review',
        label: '待人工审核',
        value: workflowSummary.waitingReview,
        detail: '中高风险或需人工确认后才能发送的草稿。',
        sourceStatus: mailSourceStatus,
      },
      {
        key: 'high_exceptions',
        label: '高风险异常',
        value: mailSummary.high,
        detail: '退款、投诉、差评、改价、发货承诺等必须人工处理。',
        sourceStatus: mailSourceStatus,
      },
      {
        key: 'spam_count',
        label: '垃圾邮件',
        value: mailSummary.spam,
        detail: '白色队列，只归档/移箱，不生成客服回复。',
        sourceStatus: mailSourceStatus,
      },
      {
        key: 'draft_count',
        label: '草稿生成数',
        value: workflowSummary.draftSaved,
        detail: '已生成并可供客服选择、编辑或审核的话术草稿。',
        sourceStatus: mailSourceStatus,
      },
      {
        key: 'send_control',
        label: '可发送/拦截',
        value: `${workflowSummary.queued}/${workflowSummary.blocked}`,
        detail: `真实发送 ${writeStatus.realSendEnabled ? '开' : '关'}，归档 ${writeStatus.realArchiveEnabled ? '开' : '关'}，原始来信人 ${writeStatus.customerReplyOriginalSenderEnabled ? '开' : '关'}，特殊名单 ${writeStatus.allowlistCount || 0}。`,
        sourceStatus: writeSourceStatus,
      },
    ],
    analysisRows: processingAnalysis.sourceRows,
    funnelRows: [
      { label: '草稿已生成', value: workflowSummary.draftSaved, sourceStatus: mailSourceStatus },
      { label: '待审核', value: workflowSummary.waitingReview, sourceStatus: mailSourceStatus },
      { label: '已审核', value: workflowSummary.approved, sourceStatus: mailSourceStatus },
      { label: '可进入发送队列', value: workflowSummary.queued, sourceStatus: writeSourceStatus },
      { label: '发送前拦截', value: workflowSummary.blocked, sourceStatus: writeSourceStatus },
    ],
    exceptionItems: processingAnalysis.exceptionItems,
    sourceTrustRows: processingAnalysis.sourceRows.map((row) => ({
      name: row.name,
      sourceStatus: row.sourceStatus,
      detail: row.detail,
    })),
  };
}

export function buildBossDashboard({
  mails = [],
  messages = [],
  orderSamples = [],
  reviews = {},
  agentConfig = DEFAULT_AGENT_CONFIG,
  writeStatus = buildPublicFeishuWriteStatus(),
} = {}) {
  const mailItems = buildMailWorkItems({
    mails,
    messages,
    reviews,
    agentConfig,
  });
  const mailSummary = summarizeMails(mailItems);
  const workflowSummary = summarizeDraftWorkflow(mailItems.map((mail) => mail.queueItem));
  const dataSources = buildDataSources({
    mailSourceStatus: mailItems[0]?.sourceStatus || 'API 待接入',
    hasOrders: orderSamples.length > 0,
  });
  const orderExamples = buildOrderExamples(orderSamples);
  const highRiskOrders = orderExamples.filter((order) => order.risk === 'high').length;
  const pendingOrderItems = orderExamples.filter((order) => order.requiresManual).length;
  const sourceStatuses = uniqueSourceStatuses(dataSources, orderExamples);
  const agentRuntime = buildAgentRuntimeContext(agentConfig);
  const processingAnalysis = buildProcessingAnalysis(
    mailItems,
    mailSummary,
    workflowSummary,
    writeStatus,
  );

  return {
    overview: {
      syncedDataSources: dataSources.filter((source) => source.synced).length,
      targetDataSources: dataSources.length,
      totalMailCount: mailItems.length,
      pendingItems: mailSummary.draftOnly + mailSummary.blocked + pendingOrderItems,
      highPriorityExceptions: mailSummary.high + highRiskOrders,
      spamMailCount: mailSummary.ignored,
      whiteQueueCount: mailSummary.white,
      agentModelLabel: agentRuntime.modelLabel,
      agentSourceStatus: agentRuntime.sourceStatus,
      writeEnabled: Boolean(writeStatus.writeEnabled),
      realArchiveEnabled: Boolean(writeStatus.realArchiveEnabled),
      writeAllowlistCount: writeStatus.allowlistCount || 0,
      hardDeleteEnabled: Boolean(writeStatus.hardDeleteEnabled),
      draftCount: workflowSummary.draftSaved,
      simulationQueueCount: workflowSummary.queued,
      realSendEnabled: Boolean(writeStatus.realSendEnabled),
      dataTrustText: sourceStatuses.join(' / '),
      sourceStatus: mailItems[0]?.sourceStatus || 'API 待接入',
    },
    processingAnalysis,
    processingReport: buildProcessingReport(
      mailSummary,
      workflowSummary,
      writeStatus,
      processingAnalysis,
    ),
    dataSources,
    agentRuntime,
    mailPriorityQueue: buildMailPriorityQueue(mailItems),
    orderExamples,
    acceptance: {
      canRunPage: true,
      demoBoundaryClear: dataSources.every((source) => source.sourceStatus !== '真实接入'),
      disabledHighRiskActions: [
        '退款自动处理',
        '改价自动处理',
        '发货时间承诺',
        '赔偿承诺',
        '高风险自动回复',
      ],
      reportPositioning: [
        '只汇报工作台处理量、异常、草稿漏斗和来源可信度。',
        '不在老板看板处理邮件，不展示密钥，不绕过工作台审批。',
        '真实接入、CSV 和 API 待接入必须清楚标记。',
      ],
    },
  };
}
