const INTENT_DEFINITIONS = [
  {
    key: 'refund',
    riskFloor: 'high',
    keywords: ['refund', 'money back', '退钱', '退款', '退费'],
  },
  {
    key: 'return',
    riskFloor: 'high',
    keywords: ['return item', 'return order', 'send back', 'want to return', '退货', '退回'],
  },
  {
    key: 'exchange',
    riskFloor: 'high',
    keywords: ['exchange', 'replacement', 'replace it', '换货', '更换'],
  },
  {
    key: 'chargeback',
    riskFloor: 'high',
    keywords: ['chargeback', 'dispute payment', '拒付', '支付争议'],
  },
  {
    key: 'legal_threat',
    riskFloor: 'high',
    keywords: ['lawyer', 'legal', 'court', 'fraud', 'scam', '律师', '法律', '法院', '欺诈', '诈骗'],
  },
  {
    key: 'platform_complaint',
    riskFloor: 'high',
    keywords: ['complain to the platform', 'platform complaint', 'platform penalty', '投诉平台', '平台投诉', '平台处罚'],
  },
  {
    key: 'bad_review_threat',
    riskFloor: 'high',
    keywords: ['bad review', 'negative review', 'one star', 'leave a review', '差评', '负面评价', '一星'],
  },
  {
    key: 'compensation_request',
    riskFloor: 'high',
    keywords: ['compensation', 'compensate', 'discount for this issue', '赔偿', '补偿', '赔付'],
  },
  {
    key: 'signed_not_received',
    riskFloor: 'high',
    keywords: ['delivered but not received', 'signed but not received', 'not received package', '已签收未收到', '显示签收但没收到', '未收到包裹'],
  },
  {
    key: 'quality_complaint',
    riskFloor: 'high',
    keywords: ['quality issue', 'poor quality', 'defective', 'not working', 'watch does not work', '质量', '有缺陷', '不工作', '质量糟糕'],
  },
  {
    key: 'shipment_urgency',
    riskFloor: 'medium',
    keywords: ['when will my order ship', 'ship my order', 'when will ship', '催发货', '什么时候发货', '赶紧发货'],
  },
  {
    key: 'logistics_abnormal',
    riskFloor: 'medium',
    keywords: ['logistics abnormal', 'package not moving', 'shipping delay', 'delayed', 'stuck', '物流异常', '物流不动', '包裹卡住', '延迟'],
  },
  {
    key: 'order_status_query',
    riskFloor: 'medium',
    keywords: ['order status', 'my order', 'tracking number', 'tracking information', 'pedido', 'envio', '订单状态', '物流单号', '追踪信息'],
  },
  {
    key: 'tax_shipping_fee',
    riskFloor: 'low',
    keywords: ['tax', 'customs fee', 'shipping fee', 'duty', '税费', '海关费', '运费', '关税'],
  },
  {
    key: 'delivery_time_question',
    riskFloor: 'low',
    keywords: ['delivery time', 'shipping time', 'how long', 'when arrive', '多久', '送货时间', '需要多长时间'],
  },
  {
    key: 'pre_sale_product_question',
    riskFloor: 'low',
    keywords: ['product', 'material', 'size', 'color', 'stock', 'style', '产品', '材质', '尺寸', '颜色', '库存'],
  },
];

const RISK_WEIGHT = {
  high: 3,
  medium: 2,
  low: 1,
};

function includesKeyword(text, keyword) {
  return text.includes(String(keyword).toLowerCase());
}

export function detectCustomerIntentDetail({
  emailPayload = {},
  normalizedContext = null,
} = {}) {
  const text = normalizedContext?.normalizedText || [
    emailPayload.subject,
    emailPayload.body,
    emailPayload.bodyText,
    emailPayload.body_text,
    emailPayload.summary,
  ].filter(Boolean).join('\n').toLowerCase();

  const matched = INTENT_DEFINITIONS
    .map((definition) => ({
      ...definition,
      matches: definition.keywords.filter((keyword) => includesKeyword(text, keyword)),
    }))
    .filter((definition) => definition.matches.length > 0);

  const sorted = [...matched].sort((a, b) => {
    const riskDiff = (RISK_WEIGHT[b.riskFloor] || 0) - (RISK_WEIGHT[a.riskFloor] || 0);
    if (riskDiff !== 0) return riskDiff;
    return b.matches.length - a.matches.length;
  });
  const primary = sorted[0] || {
    key: 'general_unclear',
    riskFloor: 'medium',
    matches: [],
  };

  return {
    primaryIntent: primary.key,
    secondaryIntents: sorted.slice(1).map((item) => item.key),
    intentConfidence: primary.matches.length > 1 ? 0.86 : primary.matches.length === 1 ? 0.72 : 0.35,
    intentReasons: primary.matches.length
      ? sorted.map((item) => `${item.key}: ${item.matches.join(', ')}`)
      : ['未命中明确意图，默认按需人工确认。'],
    riskFloor: primary.riskFloor,
    matchedKeywords: sorted.flatMap((item) => item.matches),
  };
}
