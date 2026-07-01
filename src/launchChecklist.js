export const LAUNCH_CHECKLIST_ITEMS = [
  {
    key: 'rulesApproved',
    label: '规则和风险边界已验证',
    phase: 'read_api',
  },
  {
    key: 'templateLibraryReady',
    label: '话术库和代码模板已同步',
    phase: 'read_api',
  },
  {
    key: 'apiReadiness',
    label: '读取邮件和保存草稿配置已就绪',
    phase: 'read_api',
  },
  {
    key: 'secretsExternalOnly',
    label: '密钥只放外部安全环境',
    phase: 'read_api',
  },
  {
    key: 'draftQueueReady',
    label: '草稿队列和闭环处理可运行',
    phase: 'read_api',
  },
  {
    key: 'docsUpdated',
    label: '规则文档和 README 已更新',
    phase: 'read_api',
  },
  {
    key: 'rollbackPlan',
    label: '回滚和暂停自动化方案已准备',
    phase: 'real_send',
  },
  {
    key: 'productionSendApproval',
    label: '真实发送已完成专项审批',
    phase: 'real_send',
  },
];

function makeItem(key, ok, detail) {
  const base = LAUNCH_CHECKLIST_ITEMS.find((item) => item.key === key);
  return {
    ...base,
    status: ok ? 'done' : 'blocked',
    detail,
  };
}

function summarizeItems(items) {
  return items.reduce((summary, item) => {
    summary.total += 1;
    summary.done += item.status === 'done' ? 1 : 0;
    summary.pending += item.status === 'pending' ? 1 : 0;
    summary.blocked += item.status === 'blocked' ? 1 : 0;
    return summary;
  }, {
    total: 0,
    done: 0,
    pending: 0,
    blocked: 0,
  });
}

export function buildLaunchChecklist({
  apiReadiness,
  workflowSummary,
  testStatus = {},
  docsUpdated = false,
  templateLibraryReady = false,
  rollbackPlanReady = false,
  productionSendApproved = false,
} = {}) {
  const rulesPassed = testStatus.rulesPassed === true && testStatus.syntaxPassed === true;
  const secretsSafe = apiReadiness?.secretIssues?.length === 0;
  const draftQueueReady = Number(workflowSummary?.queued || 0) > 0
    && Number(workflowSummary?.realSendAllowed || 0) === 0;

  const items = [
    makeItem(
      'rulesApproved',
      rulesPassed,
      rulesPassed ? '规则测试和语法检查已通过。' : '需先通过规则测试和语法检查。',
    ),
    makeItem(
      'templateLibraryReady',
      templateLibraryReady,
      templateLibraryReady ? '话术库和代码模板已对齐。' : '需确认 Obsidian 话术库和代码模板一致。',
    ),
    makeItem(
      'apiReadiness',
      apiReadiness?.readyForReadSimulation === true,
      apiReadiness?.readyForReadSimulation
        ? '读取邮件和保存草稿的配置占位已就绪。'
        : '需补齐非敏感配置和读取 / 草稿权限。',
    ),
    makeItem(
      'secretsExternalOnly',
      secretsSafe,
      secretsSafe ? '工作台未保存 App Secret、token 或密码。' : '发现敏感字段，必须移出工作台。',
    ),
    makeItem(
      'draftQueueReady',
      draftQueueReady,
      draftQueueReady ? '草稿队列可运行，真实动作由服务端闭环控制。' : '需先跑通草稿队列和闭环处理。',
    ),
    makeItem(
      'docsUpdated',
      docsUpdated,
      docsUpdated ? 'README 和规则草案已同步。' : '需补齐规则文档和 README。',
    ),
    makeItem(
      'rollbackPlan',
      rollbackPlanReady,
      rollbackPlanReady ? '已准备暂停、回滚和人工接管方案。' : '真实发送前必须有暂停和回滚方案。',
    ),
    makeItem(
      'productionSendApproval',
      productionSendApproved,
      productionSendApproved ? '真实发送已完成专项审批。' : '真实发送需配置审批、原始来信人策略、限额和暂停开关。',
    ),
  ];

  const readApiKeys = LAUNCH_CHECKLIST_ITEMS
    .filter((item) => item.phase === 'read_api')
    .map((item) => item.key);
  const readyForReadApi = items
    .filter((item) => readApiKeys.includes(item.key))
    .every((item) => item.status === 'done');
  const readyForRealSend = readyForReadApi
    && rollbackPlanReady
    && productionSendApproved
    && apiReadiness?.readyForRealSend === true;

  return {
    items,
    summary: summarizeItems(items),
    readyForReadApi,
    readyForRealSend,
  };
}
