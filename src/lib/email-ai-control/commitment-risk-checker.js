const COMMITMENT_PATTERNS = [
  {
    key: 'refund_promise',
    pattern: /we will refund|refund approved|refund today|马上退款|同意退款|承诺退款/i,
    reason: '命中退款承诺风险。',
  },
  {
    key: 'compensation_promise',
    pattern: /compensate|compensation approved|赔偿|补偿|赔付/i,
    reason: '命中赔偿或补偿承诺风险。',
  },
  {
    key: 'reship_promise',
    pattern: /we will reship|send a replacement|replacement approved|补发|重新发货/i,
    reason: '命中补发或更换承诺风险。',
  },
  {
    key: 'delivery_guarantee',
    pattern: /guaranteed delivery|arrive tomorrow|arrive on|一定到货|保证到货|明天到/i,
    reason: '命中到货时间承诺风险。',
  },
  {
    key: 'fabricated_logistics',
    pattern: /already shipped|tracking number\s+\w+|物流单号|已经发货/i,
    reason: '命中未核实物流事实风险。',
  },
  {
    key: 'liability_admission',
    pattern: /we admit fault|we are responsible|legal responsibility|承认责任|我们负责/i,
    reason: '命中责任承认或法律责任风险。',
  },
  {
    key: 'placeholder_leak',
    pattern: /\[(?:tracking number|人工填写|附件|order number)\]|123456|xxx/i,
    reason: '命中客户可见占位符风险。',
  },
];

export function checkCommitmentRisk({
  reply = {},
} = {}) {
  const draft = String(reply.draft || reply.polishedDraft || '');
  const text = draft;
  const matched = COMMITMENT_PATTERNS
    .filter((item) => item.pattern.test(text));

  return {
    blocked: matched.length > 0,
    reasons: matched.map((item) => item.reason),
    matchedPatterns: matched.map((item) => item.key),
  };
}
