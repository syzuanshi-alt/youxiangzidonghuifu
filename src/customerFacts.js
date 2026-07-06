function normalizeLatinText(text = '') {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u');
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function hasDamageIssue(text = '') {
  const lower = normalizeLatinText(text);
  return /(damag|danad|dano|danific|endommag|abim|beschadig|danneggi|hasar|hu hong|rusak|broken|defective|damage|损坏|破损|受损|质量|有缺陷|不工作)/.test(lower)
    || /破損|壊れ|不具合/.test(String(text || ''));
}

function hasReturnRequest(text = '') {
  const lower = normalizeLatinText(text);
  return /(return|send back|devolver|devolucao|retour|retourner|zuruckgeben|restituire|retourneren|iade|tra lai|tra hang|mengembalikan|退货|退回)/.test(lower)
    || /返品/.test(String(text || ''));
}

function hasExchangeRequest(text = '') {
  const lower = normalizeLatinText(text);
  return /(exchange|replace|replacement|trocar|cambiar|echange|echanger|umtauschen|cambiare|ruilen|degistirmek|doi|menukar|换货|更换)/.test(lower)
    || /交換/.test(String(text || ''));
}

function hasRefundRequest(text = '') {
  const lower = normalizeLatinText(text);
  return /(refund|money back|reembolso|remboursement|ruckerstattung|rimborso|terugbetaling|hoan tien|pengembalian dana|退款|退钱|退费)/.test(lower)
    || /返金/.test(String(text || ''));
}

function resolutionLabels({
  returnRequest,
  exchangeRequest,
  refundRequest,
} = {}) {
  const labels = [];
  if (returnRequest) labels.push('退货');
  if (exchangeRequest) labels.push('换货');
  if (refundRequest) labels.push('退款');
  return labels;
}

export function detectCustomerFacts(text = '', {
  orderNumbers = [],
  trackingNumbers = [],
  emails = [],
} = {}) {
  const source = String(text || '');
  const normalizedOrderNumbers = unique(orderNumbers);
  const normalizedTrackingNumbers = unique(trackingNumbers);
  const normalizedEmails = unique(emails);
  const damageIssue = hasDamageIssue(source);
  const returnRequest = hasReturnRequest(source);
  const exchangeRequest = hasExchangeRequest(source);
  const refundRequest = hasRefundRequest(source);
  const requestedResolutions = resolutionLabels({
    returnRequest,
    exchangeRequest,
    refundRequest,
  });

  const zhParts = [];
  const enParts = [];
  if (normalizedOrderNumbers.length) {
    zhParts.push(`客户已提供订单号 ${normalizedOrderNumbers.join('、')}`);
    enParts.push(`customer already provided order number ${normalizedOrderNumbers.join(', ')}`);
  }
  if (normalizedEmails.length) {
    zhParts.push(`客户已提供邮箱 ${normalizedEmails.join('、')}`);
    enParts.push(`customer already provided email ${normalizedEmails.join(', ')}`);
  }
  if (normalizedTrackingNumbers.length) {
    zhParts.push(`客户已提供物流单号 ${normalizedTrackingNumbers.join('、')}`);
    enParts.push(`customer already provided tracking number ${normalizedTrackingNumbers.join(', ')}`);
  }
  if (damageIssue) {
    zhParts.push('客户已说明商品或包裹到货损坏/破损');
    enParts.push('customer said the product or package arrived damaged');
  }
  if (requestedResolutions.length) {
    zhParts.push(`客户诉求是${requestedResolutions.join('或')}`);
    enParts.push(`customer requested ${requestedResolutions.join(' or ')}`);
  }

  return {
    orderNumbers: normalizedOrderNumbers,
    trackingNumbers: normalizedTrackingNumbers,
    emails: normalizedEmails,
    hasDamageIssue: damageIssue,
    hasReturnRequest: returnRequest,
    hasExchangeRequest: exchangeRequest,
    hasRefundRequest: refundRequest,
    hasDesiredResolution: requestedResolutions.length > 0,
    hasActionableIssueFacts: damageIssue && requestedResolutions.length > 0,
    requestedResolutions,
    factsZh: zhParts.join('；'),
    factsEn: enParts.join('; '),
  };
}
