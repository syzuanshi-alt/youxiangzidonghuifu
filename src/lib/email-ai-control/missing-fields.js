const FIELD_REQUIREMENTS = {
  order_status_query: ['order_number_or_email'],
  shipment_urgency: ['order_number_or_email'],
  logistics_abnormal: ['order_number_or_email'],
  signed_not_received: ['order_number_or_email', 'package_photo_or_platform_screenshot'],
  quality_complaint: ['order_number_or_email', 'issue_photo_or_video'],
  refund: ['order_number_or_email', 'desired_resolution'],
  return: ['order_number_or_email', 'return_reason'],
  exchange: ['order_number_or_email', 'issue_photo_or_video'],
};

const FIELD_LABELS = {
  order_number_or_email: '订单号或下单邮箱',
  package_photo_or_platform_screenshot: '包裹照片或平台截图',
  issue_photo_or_video: '问题图片或视频',
  desired_resolution: '客户期望处理方式',
  return_reason: '退货原因',
};

function hasOrderIdentifier(normalizedContext = {}) {
  return (normalizedContext.detectedFields?.orderNumbers || []).length > 0
    || (normalizedContext.detectedFields?.emails || []).length > 0;
}

function hasEvidence(normalizedContext = {}) {
  return normalizedContext.attachmentSignals?.hasAttachment === true;
}

function hasDesiredResolution(text = '') {
  return /refund|return|exchange|replace|退款|退货|换货|补发|赔偿/.test(text);
}

export function extractMissingFields({
  intent = {},
  normalizedContext = {},
} = {}) {
  const required = FIELD_REQUIREMENTS[intent.primaryIntent] || [];
  const text = normalizedContext.normalizedText || '';
  const missingFields = required.filter((field) => {
    if (field === 'order_number_or_email') return !hasOrderIdentifier(normalizedContext);
    if (field === 'package_photo_or_platform_screenshot') return !hasEvidence(normalizedContext);
    if (field === 'issue_photo_or_video') return !hasEvidence(normalizedContext);
    if (field === 'desired_resolution') return !hasDesiredResolution(text);
    if (field === 'return_reason') return !/because|reason|原因|不喜欢|不符合|defective|quality/.test(text);
    return false;
  });

  const missingFieldSeverity = missingFields.length > 0 ? 'critical' : 'none';
  return {
    missingFields,
    questionToAsk: missingFields.length
      ? `麻烦客户补充${missingFields.map((field) => FIELD_LABELS[field] || field).join('、')}。`
      : '',
    missingFieldSeverity,
  };
}
