import { buildBossDashboard } from './bossDashboard.js';
import { getMailRiskState } from './riskState.js';

const FEISHU_DASHBOARD_PAGE_SIZE = 20;

let dashboard = buildBossDashboard();

const riskText = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
  spam: '垃圾邮件',
};

const actionText = {
  autoReply: '可自动回复',
  draftOnly: '生成草稿待审',
  blocked: '高风险拦截',
  ignored: '垃圾邮件归档',
};

function sourceBadge(status) {
  return `<span class="source-badge">${status}</span>`;
}

function apiUrl(path) {
  if (window.location.port === '5174') {
    return `http://127.0.0.1:5175${path}`;
  }

  return path;
}

function renderOverview() {
  const metrics = dashboard.processingReport?.resultMetrics || dashboard.processingReport?.headlineMetrics || [];
  document.querySelector('[data-boss-overview]').innerHTML = metrics.map((metric) => {
    const tone = metric.key === 'high_exceptions'
      ? 'metric-blocked'
      : metric.key === 'waiting_review'
        ? 'metric-draft'
        : metric.key === 'spam_count'
          ? 'metric-spam'
          : 'metric-auto';

    return `
      <article class="metric ${tone}">
        <span>${metric.label}</span>
        <strong>${metric.value}</strong>
        <small>${metric.detail} · ${metric.sourceStatus}</small>
      </article>
    `;
  }).join('');
}

function renderSources() {
  const rows = (dashboard.processingReport.sourceTrustRows || dashboard.processingReport.analysisRows || [])
    .filter((source) => ['邮件读取与分类', '真实写操作', '风险拦截'].includes(source.name))
    .slice(0, 3);
  document.querySelector('[data-source-table]').innerHTML = rows.map((source) => `
    <tr>
      <td>${source.name}</td>
      <td>${source.metric || source.sourceStatus}</td>
      <td>${source.detail}</td>
      <td>${sourceBadge(source.sourceStatus)}</td>
    </tr>
  `).join('');
}

function renderMailPriority() {
  const items = dashboard.processingReport.executiveItems || dashboard.processingReport.exceptionItems || [];
  document.querySelector('[data-mail-priority]').innerHTML = items.length ? items.map((mail) => {
    const riskState = getMailRiskState(mail);
    return `
      <article class="work-item risk-line-${riskState.risk}">
        <div>
          <strong>${mail.subject}</strong>
          <p>${mail.status} · ${mail.reason}</p>
        </div>
        <div class="item-meta">
          <span class="risk risk-${riskState.risk}">${riskState.label || riskText[riskState.risk]}</span>
          ${sourceBadge(mail.sourceStatus)}
        </div>
      </article>
    `;
  }).join('') : '<article class="work-item"><strong>暂无待审或异常邮件</strong><p>当前工作台没有需要关注的异常。</p></article>';
}

function renderResultConclusion() {
  const summary = dashboard.processingReport.resultSummary;
  const rows = summary ? [
    {
      label: '今日结论',
      value: summary.bossConclusion,
      risk: summary.highRiskCount > 0 ? 'high' : summary.waitingReviewCount > 0 ? 'medium' : 'low',
      detail: `邮件 ${summary.totalMailCount}，已分流 ${summary.handledCount}，待人工 ${summary.waitingReviewCount}。`,
    },
    {
      label: '数据可信度',
      value: summary.sourceStatus,
      risk: summary.sourceStatus === '真实接入' ? 'low' : 'medium',
      detail: summary.sourceStatus === '真实接入'
        ? '来自飞书 API 读取结果。'
        : '当前仍需确认 API 读取状态。',
    },
  ] : [];

  document.querySelector('[data-order-examples]').innerHTML = rows.map((row) => `
    <article class="work-item risk-line-${row.risk}">
      <div>
        <strong>${row.label}</strong>
        <p>${row.value}</p>
        <p>${row.detail}</p>
      </div>
      <div class="item-meta">
        <span class="risk risk-${row.risk}">${riskText[row.risk]}</span>
      </div>
    </article>
  `).join('');
}

function listBlock(title, items) {
  return `
    <section class="acceptance-block">
      <h3>${title}</h3>
      <ul>
        ${items.map((item) => `<li>${item}</li>`).join('')}
      </ul>
    </section>
  `;
}

function renderAcceptance() {
  const analysis = dashboard.processingAnalysis;
  const report = dashboard.processingReport;
  document.querySelector('[data-acceptance]').innerHTML = [
    listBlock('报告不展示的动作', [
      '不展示模板、队列、接口配置和技术开关。',
      '不在处理报告里处理邮件，只输出结果。',
    ]),
    listBlock('安全边界', analysis.boundaryNotes.slice(0, 3)),
    listBlock('来源口径', (report.sourceTrustRows || []).slice(0, 3).map((row) => `${row.name}：${row.sourceStatus}`)),
  ].join('');
}

function renderAll() {
  renderOverview();
  renderSources();
  renderMailPriority();
  renderResultConclusion();
  renderAcceptance();
}

async function loadDashboard() {
  try {
    const statusResponse = await fetch(apiUrl('/api/feishu/status'), { cache: 'no-store' });
    const statusPayload = statusResponse.ok ? await statusResponse.json() : {};

    if (!statusResponse.ok || !statusPayload.configured) {
      dashboard = buildBossDashboard({
        writeStatus: statusPayload.write,
      });
      return;
    }

    const messagesResponse = await fetch(
      apiUrl(`/api/feishu/mail/messages?all=true&page_size=${FEISHU_DASHBOARD_PAGE_SIZE}`),
      { cache: 'no-store' },
    );
    const messagesPayload = await messagesResponse.json();

    if (!messagesResponse.ok || !messagesPayload.ok) {
      dashboard = buildBossDashboard({
        writeStatus: statusPayload.write,
      });
      return;
    }

    dashboard = buildBossDashboard({
      mails: messagesPayload.mails || [],
      messages: messagesPayload.messages || [],
      writeStatus: statusPayload.write,
    });
  } catch {
    try {
      const snapshotResponse = await fetch('./data/boss-dashboard.json', { cache: 'no-store' });
      const snapshotPayload = snapshotResponse.ok ? await snapshotResponse.json() : {};
      dashboard = snapshotPayload.data || buildBossDashboard();
    } catch {
      dashboard = buildBossDashboard();
    }
  }
}

await loadDashboard();
renderAll();
