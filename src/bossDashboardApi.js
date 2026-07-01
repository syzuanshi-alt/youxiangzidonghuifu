import { buildBossDashboard } from './bossDashboard.js';

export const BOSS_DASHBOARD_API_VERSION = 'boss-dashboard.v1';

export function buildBossDashboardPayload({
  dashboard = buildBossDashboard(),
  generatedAt = new Date().toISOString(),
} = {}) {
  const realFeishuApiConnected = dashboard.dataSources.some((source) => (
    source.name === '飞书邮箱' && source.sourceStatus === '真实接入'
  ));
  const realOrderApiConnected = dashboard.dataSources.some((source) => (
    source.name.includes('订单') && source.sourceStatus === '真实接入'
  ));

  return {
    apiVersion: BOSS_DASHBOARD_API_VERSION,
    endpoint: '/data/boss-dashboard.json',
    generatedAt,
    data: dashboard,
    boundary: {
      realFeishuApiConnected,
      realOrderApiConnected,
      realMailSendEnabled: Boolean(dashboard.overview.realSendEnabled),
      realMailArchiveEnabled: Boolean(dashboard.overview.realArchiveEnabled),
      hardDeleteEnabled: Boolean(dashboard.overview.hardDeleteEnabled),
      writeAllowlistCount: dashboard.overview.writeAllowlistCount || 0,
      sourceStatuses: dashboard.dataSources.map((source) => ({
        name: source.name,
        sourceStatus: source.sourceStatus,
      })),
    },
  };
}
