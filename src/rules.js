import { buildReplyCandidates, getTemplateByScene } from './replyTemplates.js';
import { detectCustomerLanguage } from './emailTranslation.js';
import { getMailRiskState } from './riskState.js';
import { normalizeEmailContext } from './lib/email-ai-control/email-context-normalizer.js';

const HIGH_RISK = [
  {
    name: '退款 / 退货',
    keywords: ['退款', '退货', '退钱', '取消订单', 'refund', 'return'],
    reason: '命中退款 / 退货高风险诉求，必须人工处理。',
  },
  {
    name: '付款异常',
    keywords: ['付款异常', '重复扣款', '重复收费', 'charged twice', 'double charged', 'payment record'],
    reason: '命中付款异常或疑似重复扣款，高风险问题必须人工核对。',
  },
  {
    name: '赔偿 / 补偿',
    keywords: ['赔偿', '补偿', '优惠券', '折扣', '补发', '赔付', 'compensation'],
    reason: '命中赔偿 / 补偿诉求，不能自动承诺。',
  },
  {
    name: '投诉 / 差评',
    keywords: ['投诉', '差评', '曝光', '平台申诉', 'bad review', 'negative review'],
    reason: '命中投诉 / 差评风险，必须人工跟进。',
  },
  {
    name: '改价 / 改订单',
    keywords: ['改价', '改地址', '改商品', '改数量', '修改订单', '修改收货地址', '地址变更', 'change my address', 'shipping address is wrong', 'please change it before'],
    reason: '命中订单修改诉求，不能自动处理。',
  },
  {
    name: '承诺发货时间',
    keywords: ['今天发货', '马上发货', '承诺发货', '什么时候到', 'arrive today'],
    reason: '涉及发货或到货承诺，必须人工确认。',
  },
  {
    name: '法律 / 平台纠纷',
    keywords: ['律师', '监管', '法律', '知识产权', '纠纷', 'lawyer', 'legal'],
    reason: '涉及法律或平台纠纷，必须人工处理。',
  },
];

const MEDIUM_RISK = [
  {
    name: '查订单',
    keywords: ['订单状态', '查询订单', '订单号', 'order status', 'status', '注文状況', '注文番号', '注文確認'],
    reason: '客户查询订单，需要人工核对订单状态。',
  },
  {
    name: '查物流',
    keywords: ['物流', '快递', '包裹', '签收', '发货延迟', 'package', 'shipping', 'tracking', 'expected to ship', 'not received any update', '配送状況', '発送状況', '追跡', '配達'],
    reason: '客户查询物流，需要核对物流系统，不能自动承诺到货。',
  },
  {
    name: '售后咨询',
    keywords: ['商品问题', '商品细节疑问', '坏了', '破损', '换货', '售后', 'metal color', 'product issue'],
    reason: '客户提出售后咨询，需要人工确认问题材料和处理方案。',
  },
  {
    name: '达人合作',
    keywords: ['合作', '报价', '寄样', '达人', 'collaboration', 'creator'],
    reason: '合作条件需要人工判断。',
  },
];

const LOW_RISK = [
  {
    name: '要求补订单号',
    keywords: ['查询订单', '查订单', '订单', 'order'],
    reason: '客户咨询订单但缺少订单号或下单邮箱，可以自动要求补充信息。',
  },
  {
    name: '要求补下单邮箱',
    keywords: ['下单邮箱', '联系方式', '手机号'],
    reason: '客户咨询订单但缺少下单邮箱或联系方式，可以自动要求补充信息。',
  },
  {
    name: '收到邮件确认',
    keywords: ['已发送', '请查收', '收到请回复', 'sent', 'received'],
    reason: '只做收件确认，不涉及订单、赔付或承诺。',
  },
  {
    name: '非工作时间收到邮件',
    keywords: ['什么时候回复', '客服', '上班', 'working time'],
    reason: '只说明工作时间处理，不承诺处理结果。',
  },
  {
    name: '普通资料或流程咨询',
    keywords: ['营业时间', '资料', '流程', '普通咨询'],
    reason: '普通流程说明，不涉及承诺和赔付。',
  },
  {
    name: '物流查询初步确认',
    keywords: ['低风险售后 - 查询物流', '低风险】物流单号查询'],
    reason: '低风险物流查询只确认收到并收集订单定位信息，不自动承诺到货或发货时间。',
    explicitLowRisk: true,
  },
  {
    name: '尺码咨询初步确认',
    keywords: ['低风险售后 - 尺码咨询', '中低风险】戒指尺码变更咨询'],
    reason: '低风险尺码咨询只收集订单号、邮箱和目标尺码，不直接修改订单。',
    explicitLowRisk: true,
  },
];

const SPAM_RISK = [
  {
    name: '垃圾 / 广告',
    keywords: ['广告', '推广', 'seo', 'backlinks', '外链', '群发', 'unsubscribe', 'casino', '贷款', '发票代开', '加v', 'telegram'],
    reason: '命中垃圾 / 广告 / 群发推广特征，建议归入白色垃圾队列，不进入客服回复流程。',
  },
  {
    name: '骚扰 / 无效内容',
    keywords: ['乱码', '无效内容', '骚扰', '测试垃圾', 'spam', 'junk mail'],
    reason: '命中骚扰或无效邮件特征，建议归入白色垃圾队列，不生成回复。',
  },
];

const LANE_BY_RISK = {
  low: 'green',
  medium: 'orange',
  high: 'red',
  spam: 'white',
};

const CREDENTIAL_PATTERNS = [
  /app\s*secret/i,
  /token/i,
  /password/i,
  /邮箱密码/,
  /密钥/,
];

function normalizeMail(mail) {
  return [
    mail.subject,
    mail.summary,
    mail.bodyText,
    mail.body_text,
    mail.body_plain_text,
    mail.body,
    mail.body_preview,
  ].filter(Boolean).join('\n').toLowerCase();
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function hasNegatedHighRiskContext(text) {
  return [
    '未提出退款',
    '没有退款',
    '无退款诉求',
    '没有退货',
    '未提出退货',
    '没有订单、退款或投诉诉求',
    '没有具体高风险诉求',
  ].some((phrase) => text.includes(phrase));
}

function isMissingOrderContext(text) {
  return [
    '没有提供订单号',
    '未提供订单号',
    '缺少订单号',
    '没有提供订单号或下单邮箱',
    '未提供下单邮箱',
    '缺少下单邮箱',
  ].some((phrase) => text.includes(phrase));
}

function matchLowRisk(text) {
  return LOW_RISK.find((rule) => {
    if (!includesAny(text, rule.keywords)) return false;
    if (['要求补订单号', '要求补下单邮箱'].includes(rule.name)) {
      return isMissingOrderContext(text);
    }
    return true;
  });
}

function matchExplicitLowRisk(text) {
  return LOW_RISK.find((rule) => rule.explicitLowRisk && includesAny(text, rule.keywords));
}

function makeResult(mail, rule, action, risk, requiresReview, options = {}) {
  const template = ['blocked', 'ignore'].includes(action)
    ? null
    : getTemplateByScene(rule.name);
  const normalizedContext = options.normalizedContext || normalizeEmailContext(mail);
  const customerLanguage = options.customerLanguage
    || mail.customerLanguage
    || detectCustomerLanguage([
      mail.subject,
      mail.summary,
      mail.bodyText,
    ].filter(Boolean).join('\n'));
  const replyCandidates = buildReplyCandidates({
    template,
    action,
    risk,
    category: rule.name,
    reason: rule.reason,
    agentConfig: options.agentConfig,
    customerLanguage,
    emailPayload: mail,
    normalizedContext,
  });
  const recommendedCandidate = replyCandidates.find((candidate) => candidate.variant === 'recommended')
    || replyCandidates[0];

  return {
    ...mail,
    category: rule.name,
    action,
    risk,
    lane: LANE_BY_RISK[risk],
    requiresReview: template ? template.requiresReview : requiresReview,
    allowsRealSend: false,
    replyDraft: recommendedCandidate?.content || (template ? template.content : ''),
    replyCandidates,
    customerLanguage,
    customerLanguageCode: customerLanguage.code,
    templateId: template ? template.templateId : null,
    templateSource: template
      ? 'replyTemplates'
      : action === 'blocked'
        ? 'blocked'
        : action === 'ignore'
          ? 'spam'
          : 'missing',
    templateSelectionReason: template ? template.selectionReason : '',
    reason: rule.reason,
  };
}

export function classifyMail(mail, options = {}) {
  const text = normalizeMail(mail);

  const explicitLowRiskRule = matchExplicitLowRisk(text);
  if (explicitLowRiskRule) {
    return makeResult(mail, explicitLowRiskRule, 'auto_reply', 'low', false, options);
  }

  const highRiskRule = hasNegatedHighRiskContext(text)
    ? null
    : HIGH_RISK.find((rule) => includesAny(text, rule.keywords));
  if (highRiskRule) {
    return makeResult(mail, highRiskRule, 'blocked', 'high', true, options);
  }

  const spamRule = SPAM_RISK.find((rule) => includesAny(text, rule.keywords));
  if (spamRule) {
    return makeResult(mail, spamRule, 'ignore', 'spam', false, options);
  }

  const missingInfoRule = matchLowRisk(text);
  if (missingInfoRule && ['要求补订单号', '要求补下单邮箱'].includes(missingInfoRule.name)) {
    return makeResult(mail, missingInfoRule, 'auto_reply', 'low', false, options);
  }

  const mediumRiskRule = MEDIUM_RISK.find((rule) => includesAny(text, rule.keywords));
  if (mediumRiskRule) {
    return makeResult(mail, mediumRiskRule, 'draft_only', 'medium', true, options);
  }

  const lowRiskRule = matchLowRisk(text);
  if (lowRiskRule) {
    return makeResult(mail, lowRiskRule, 'auto_reply', 'low', false, options);
  }

  return makeResult(
    mail,
    {
      name: '语义不明确',
      reason: '语义不明确或邮件诉求不完整，只能生成草稿并交给人工确认。',
    },
    'draft_only',
    'medium',
    true,
    options,
  );
}

export function summarizeMails(mails) {
  return mails.reduce((summary, mail) => {
    const riskState = getMailRiskState(mail);
    summary.total += 1;
    summary.autoReply += riskState.action === 'auto_reply' ? 1 : 0;
    summary.draftOnly += riskState.action === 'draft_only' ? 1 : 0;
    summary.blocked += riskState.action === 'blocked' ? 1 : 0;
    summary.ignored += riskState.action === 'ignore' ? 1 : 0;
    summary.low += riskState.risk === 'low' ? 1 : 0;
    summary.medium += riskState.risk === 'medium' ? 1 : 0;
    summary.high += riskState.risk === 'high' ? 1 : 0;
    summary.spam += riskState.risk === 'spam' ? 1 : 0;
    summary.green += riskState.lane === 'green' ? 1 : 0;
    summary.orange += riskState.lane === 'orange' ? 1 : 0;
    summary.red += riskState.lane === 'red' ? 1 : 0;
    summary.white += riskState.lane === 'white' ? 1 : 0;
    return summary;
  }, {
    total: 0,
    autoReply: 0,
    draftOnly: 0,
    blocked: 0,
    ignored: 0,
    low: 0,
    medium: 0,
    high: 0,
    spam: 0,
    green: 0,
    orange: 0,
    red: 0,
    white: 0,
  });
}

export function validateSamples(samples) {
  const issues = [];

  samples.forEach((sample, index) => {
    const number = index + 1;
    const sender = sample.sender || '';
    const content = `${sample.subject || ''}\n${sample.summary || ''}`;

    if (!sender.endsWith('.test') && !sender.endsWith('@example.test')) {
      issues.push(`第 ${number} 封样例发件人不是 example.test / .test 测试邮箱。`);
    }

    if (CREDENTIAL_PATTERNS.some((pattern) => pattern.test(content))) {
      issues.push(`第 ${number} 封样例疑似包含真实凭证关键词。`);
    }
  });

  return issues;
}
