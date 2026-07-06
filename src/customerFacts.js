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
  return /(damag|danad|dano|danific|endommag|abim|beschadig|danneggi|hasar|hu hong|rusak|broken|broke|break|defective|damage|snap|snapped|裂|断|损坏|破损|受损|质量|有缺陷|不工作)/.test(lower)
    || /破損|壊れ|不具合|断裂|断了|断掉|裂开|裂了|坏了|表带断|表扣坏|链节断/.test(String(text || ''));
}

function detectIssueComponents(text = '') {
  const source = String(text || '');
  const lower = normalizeLatinText(source);
  const components = [];
  if (/(watch\s*)?(strap|band|bracelet)\b|表带|錶帶|表鏈|表链|時計バンド|時計のバンド|시계줄|시계 밴드|correa|pulseira|bracelet|armband|cinturino|kayis|tali jam/.test(lower)
    || /表带|錶帶|表鏈|表链|時計バンド|時計のバンド|시계줄|시계 밴드/.test(source)) {
    components.push('表带');
  }
  if (/\b(clasp|buckle|扣|表扣|錶扣|留め具|버클|fecho|hebilla|boucle|schnalle|fibbia)\b/.test(lower)
    || /表扣|錶扣|扣子|留め具|버클/.test(source)) {
    components.push('表扣');
  }
  if (/\b(link|chain|链节|鏈節|表链|表鏈|コマ|リンク)\b/.test(lower)
    || /链节|鏈節|表链|表鏈/.test(source)) {
    components.push('表链/链节');
  }
  if (/\b(glass|crystal|screen|镜面|鏡面|表镜|表鏡)\b/.test(lower)
    || /镜面|鏡面|表镜|表鏡|玻璃/.test(source)) {
    components.push('表镜');
  }
  return unique(components);
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

function componentEnglishLabel(component = '') {
  if (component === '表带') return 'watch strap/band';
  if (component === '表扣') return 'watch clasp/buckle';
  if (component === '表链/链节') return 'watch bracelet/link';
  if (component === '表镜') return 'watch glass/crystal';
  return 'product part';
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
  const issueComponents = detectIssueComponents(source);
  const componentIssue = damageIssue && issueComponents.length > 0;
  const returnRequest = hasReturnRequest(source);
  const exchangeRequest = hasExchangeRequest(source);
  const refundRequest = hasRefundRequest(source);
  const requestedResolutions = resolutionLabels({
    returnRequest,
    exchangeRequest,
    refundRequest,
  });
  const issueComponentsEn = issueComponents.map(componentEnglishLabel);

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
    zhParts.push(componentIssue
      ? `客户已说明${issueComponents.join('、')}损坏/断裂`
      : '客户已说明商品或包裹到货损坏/破损');
    enParts.push(componentIssue
      ? `customer said ${issueComponentsEn.join(', ')} is damaged or broken`
      : 'customer said the product or package arrived damaged');
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
    hasComponentIssue: componentIssue,
    issueComponents,
    issueComponentsEn,
    hasReturnRequest: returnRequest,
    hasExchangeRequest: exchangeRequest,
    hasRefundRequest: refundRequest,
    hasDesiredResolution: requestedResolutions.length > 0,
    hasActionableIssueFacts: damageIssue && (requestedResolutions.length > 0 || componentIssue),
    requestedResolutions,
    factsZh: zhParts.join('；'),
    factsEn: enParts.join('; '),
  };
}
