export const MAIN_WORKBENCH_SECTION_KEYS = [
  'risk-summary',
  'left-mail-list',
  'mail-detail',
  'settings-dock',
];

export const SETTINGS_SECTION_GROUPS = [
  {
    key: 'operations',
    label: '工作台操作',
    description: '自动处理开关、审核导出和处理报告。',
    sectionKeys: [
      'account-session',
      'loop-control',
      'review-export',
      'report-view',
    ],
  },
  {
    key: 'connection',
    label: '接口与邮箱',
    description: '邮箱账号和报告机器人配置。',
    sectionKeys: [
      'mailbox-switcher',
    ],
  },
];

export const BACKEND_MANAGEMENT_SECTION_KEYS = SETTINGS_SECTION_GROUPS
  .flatMap((group) => group.sectionKeys);

export const SETTINGS_COMMANDS = [
  {
    key: 'account-session',
    label: '账号与登录',
    summary: '查看当前账号、切换账号或退出登录。',
    sectionKey: 'account-session',
  },
  {
    key: 'loop-control',
    label: '自动处理开关',
    summary: '控制自动发送、自动归档和审批后发送。',
    sectionKey: 'loop-control',
  },
  {
    key: 'mailbox-switcher',
    label: '邮箱账号',
    summary: '配置工作台邮箱、报告接收人和授权入口。',
    sectionKey: 'mailbox-switcher',
  },
  {
    key: 'email-ai-admin-auth',
    label: '管理员权限',
    summary: '验证后显示 AI 调用状态和管理配置。',
    sectionKey: 'email-ai-admin-auth',
  },
  {
    key: 'email-ai-models',
    label: '模型接入',
    summary: '管理员维护模型服务商和连接测试。',
    sectionKey: 'email-ai-admin-control',
    adminOnly: true,
    emailAITab: 'models',
  },
  {
    key: 'email-ai-skills',
    label: 'Skills 编排',
    summary: '管理员维护核心大脑调用的专项 skills。',
    sectionKey: 'email-ai-admin-control',
    adminOnly: true,
    emailAITab: 'skills',
  },
  {
    key: 'email-ai-versions',
    label: '策略与版本发布',
    summary: '管理员创建草稿、发布或回滚策略版本。',
    sectionKey: 'email-ai-admin-control',
    adminOnly: true,
    emailAITab: 'versions',
  },
  {
    key: 'email-ai-test',
    label: '本地测试',
    summary: '管理员测试垃圾、风险、知识库和完整流程。',
    sectionKey: 'email-ai-admin-control',
    adminOnly: true,
    emailAITab: 'test',
  },
  {
    key: 'review-export',
    label: '审核导出',
    summary: '导出本机规则审核记录。',
    sectionKey: 'review-export',
  },
  {
    key: 'report-view',
    label: '处理报告',
    summary: '查看处理结果汇总和异常事项。',
    sectionKey: 'report-view',
  },
];

export const SETTINGS_PRIMARY_NAV = SETTINGS_COMMANDS
  .filter((command) => !command.adminOnly)
  .map((command) => ({
    ...command,
    commandKeys: command.key === 'email-ai-admin-auth'
      ? ['email-ai-admin-auth', 'email-ai-models', 'email-ai-skills', 'email-ai-versions', 'email-ai-test']
      : [command.key],
  }));

export function flattenSettingsSectionKeys(groups = SETTINGS_SECTION_GROUPS) {
  return groups.flatMap((group) => group.sectionKeys);
}

export function isBackendManagementSection(sectionKey) {
  return BACKEND_MANAGEMENT_SECTION_KEYS.includes(sectionKey);
}

export function listSettingsCommandSectionKeys(commands = SETTINGS_COMMANDS) {
  return commands.map((command) => command.sectionKey);
}

export function findSettingsCommand(commandKey, commands = SETTINGS_COMMANDS) {
  return commands.find((command) => command.key === commandKey) || commands[0];
}

export function findSettingsPrimary(primaryKey, items = SETTINGS_PRIMARY_NAV) {
  return items.find((item) => item.key === primaryKey) || items[0];
}

export function listSettingsCommandsForPrimary(primaryKey) {
  const primary = SETTINGS_PRIMARY_NAV.find((item) => item.key === primaryKey);
  if (!primary) return [];
  return (primary.commandKeys || [])
    .map((commandKey) => SETTINGS_COMMANDS.find((command) => command.key === commandKey))
    .filter(Boolean);
}
