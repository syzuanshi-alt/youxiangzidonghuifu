function normalizeText(value = '') {
  return String(value || '').trim();
}

export const CUSTOMER_LANGUAGE_LABELS = {
  zh: '中文',
  en: '英语',
  es: '西班牙语',
  fr: '法语',
  de: '德语',
  pt: '葡萄牙语',
  it: '意大利语',
  nl: '荷兰语',
  tr: '土耳其语',
  vi: '越南语',
  id: '印尼语',
  ja: '日语',
  ko: '韩语',
  ru: '俄语',
  ar: '阿拉伯语',
  he: '希伯来语',
  hi: '印地语',
  th: '泰语',
  el: '希腊语',
  unknown: '未知语言',
};

function hasChinese(text = '') {
  return /[\u3400-\u9fff]/.test(text);
}

function hasAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function normalizeLatinText(text = '') {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function languageResult(code, {
  confidence = 0.65,
  source = 'local_detector',
} = {}) {
  return {
    code,
    label: CUSTOMER_LANGUAGE_LABELS[code] || CUSTOMER_LANGUAGE_LABELS.unknown,
    confidence,
    source,
  };
}

function scoreLanguage(text, patterns = []) {
  return patterns.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0);
}

export function detectCustomerLanguage(text = '') {
  const original = normalizeText(text);
  if (!original) return languageResult('unknown', { confidence: 0, source: 'empty' });
  if (/[\u3040-\u30ff]/.test(original)) return languageResult('ja', { confidence: 0.95 });
  if (/[\uac00-\ud7af]/.test(original)) return languageResult('ko', { confidence: 0.95 });
  if (hasChinese(original)) return languageResult('zh', { confidence: 0.95 });
  if (/[\u0600-\u06ff]/.test(original)) return languageResult('ar', { confidence: 0.9 });
  if (/[\u0590-\u05ff]/.test(original)) return languageResult('he', { confidence: 0.9 });
  if (/[\u0900-\u097f]/.test(original)) return languageResult('hi', { confidence: 0.9 });
  if (/[\u0e00-\u0e7f]/.test(original)) return languageResult('th', { confidence: 0.9 });
  if (/[\u0370-\u03ff]/.test(original)) return languageResult('el', { confidence: 0.9 });
  if (/[\u0400-\u04ff]/.test(original)) return languageResult('ru', { confidence: 0.9 });

  const latin = normalizeLatinText(original);
  const languageScores = [
    ['es', [
      /\b(hola|gracias|pedido|envio|reembolso|devolucion|por favor|necesito|donde|cuanto|ayuda)\b/,
      /[¿¡ñ]/i,
    ]],
    ['fr', [
      /\b(bonjour|merci|commande|livraison|remboursement|retour|annuler|client|colis|ou est|s'il vous plait)\b/,
      /[çœ]/i,
    ]],
    ['de', [
      /\b(hallo|danke|bestellung|lieferung|ruckerstattung|ruckgabe|bitte|paket|kunde)\b/,
      /[ß]/i,
    ]],
    ['pt', [
      /\b(ola|obrigado|obrigada|pedido|envio|reembolso|devolucao|por favor|cliente|pacote)\b/,
      /[ãõ]/i,
    ]],
    ['it', [
      /\b(ciao|grazie|ordine|spedizione|rimborso|reso|per favore|cliente|pacco)\b/,
    ]],
    ['nl', [
      /\b(hallo|bedankt|bestelling|verzending|terugbetaling|retour|alstublieft|pakket)\b/,
    ]],
    ['tr', [
      /\b(merhaba|tesekkur|siparis|kargo|iade|lutfen|musteri)\b/,
      /[ğışöçü]/i,
    ]],
    ['vi', [
      /\b(xin chao|cam on|don hang|giao hang|hoan tien|khach hang)\b/,
      /[ăâêôơưđ]/i,
    ]],
    ['id', [
      /\b(halo|terima kasih|pesanan|pengiriman|pengembalian dana|tolong|pelanggan)\b/,
    ]],
    ['en', [
      /\b(hello|hi|thanks|thank you|order|shipping|tracking|refund|return|please|customer|package|help)\b/,
    ]],
  ].map(([code, patterns]) => ({
    code,
    score: scoreLanguage(latin, patterns),
  })).sort((a, b) => b.score - a.score);

  const best = languageScores[0];
  if (best?.score > 0) {
    return languageResult(best.code, {
      confidence: Math.min(0.95, 0.55 + best.score * 0.2),
    });
  }

  if (/[a-z]/i.test(original)) return languageResult('en', { confidence: 0.5 });
  return languageResult('unknown', { confidence: 0.25 });
}

function collectFallbackTranslationNotes(text = '') {
  const lower = normalizeLatinText(text);
  const notes = [];

  if (hasAny(lower, [/order/, /order number/, /order id/, /order status/, /pedido/, /commande/, /bestellung/, /ordine/, /注文/, /주문/])) {
    notes.push('客户在询问订单信息或订单状态。');
  }
  if (hasAny(lower, [/tracking/, /shipping/, /shipment/, /package/, /delivery/, /where is my package/, /envio/, /livraison/, /colis/, /spedizione/, /versand/, /配送/, /発送/, /配達/])) {
    notes.push('客户在询问物流、包裹或运输状态。');
  }
  if (hasAny(lower, [/refund/, /return/, /cancel/, /chargeback/, /reembolso/, /devolucion/, /remboursement/, /retour/, /annuler/, /ruckerstattung/, /返品/, /返金/])) {
    notes.push('客户提到退款、退货、取消订单或支付争议，需要人工谨慎处理。');
  }
  if (hasAny(lower, [/damaged/, /broken/, /defective/, /photo/, /video/, /quality/, /danado/, /endommage/, /defectueux/, /beschadigt/, /破損/])) {
    notes.push('客户反馈商品问题或可能需要补充图片、视频等资料。');
  }
  if (hasAny(lower, [/size/, /material/, /color/, /stock/, /available/, /talla/, /taille/, /groesse/, /größe/, /色/, /サイズ/])) {
    notes.push('客户在询问尺码、材质、颜色或库存等产品信息。');
  }
  if (hasAny(lower, [/help/, /support/, /question/, /inquiry/, /ayuda/, /aide/, /hilfe/, /assistenza/])) {
    notes.push('客户请求客服协助处理问题。');
  }

  return notes;
}

function translateKnownCustomerSentences(text = '') {
  const patterns = [
    [/^(hi|hello|dear team|dear support)[,!. ]*$/i, '您好。'],
    [/where is my package/i, '我的包裹在哪里？'],
    [/could you help me check (the )?tracking number/i, '可以帮我查询物流单号吗？'],
    [/shipping status/i, '运输状态。'],
    [/tracking number/i, '物流单号。'],
    [/i want to check my order status/i, '我想查询订单状态。'],
    [/check my order/i, '查询我的订单。'],
    [/order status/i, '订单状态。'],
    [/do not have the order number|don't have the order number/i, '我没有订单号。'],
    [/order number/i, '订单号。'],
    [/order email/i, '下单邮箱。'],
    [/i want (a )?refund|request (a )?refund/i, '我想申请退款。'],
    [/i want to return|request (a )?return/i, '我想申请退货。'],
    [/cancel my order/i, '取消我的订单。'],
    [/item is damaged|product is damaged|arrived damaged/i, '商品损坏了。'],
    [/broken|defective/i, '商品破损或有缺陷。'],
    [/what size|which size|size should i choose/i, '我应该选择什么尺码？'],
    [/is .* available|in stock/i, '是否有库存？'],
    [/thank you|thanks/i, '谢谢。'],
  ];

  return text
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .map((sentence) => patterns.find(([pattern]) => pattern.test(sentence))?.[1] || '')
    .filter(Boolean);
}

export function translateCustomerMessageToChinese(text = '') {
  const original = normalizeText(text);
  const language = detectCustomerLanguage(original);
  if (!original) {
    return {
      text: '当前邮件没有可翻译的正文。',
      source: 'empty',
      language,
    };
  }

  if (hasChinese(original)) {
    return {
      text: original,
      source: 'original_zh',
      language,
    };
  }

  const translatedSentences = translateKnownCustomerSentences(original);
  const notes = collectFallbackTranslationNotes(original)
    .filter((note) => !translatedSentences.some((sentence) => sentence.includes(note.slice(0, 4))));

  return {
    text: translatedSentences.length || notes.length
      ? [...translatedSentences, ...notes].join('\n')
      : `已识别客户来信语言：${language.label}。暂未生成可靠中文全文翻译，请人工查看上方客户原文。`,
    source: 'local_fallback',
    language,
  };
}

export function buildMailContentView(mail = {}) {
  const original = normalizeText(mail.bodyText || mail.summary || '当前邮件未返回可读正文。');
  const fallback = translateCustomerMessageToChinese(original);
  const customerLanguage = mail.customerLanguage
    || mail.aiResult?.customerLanguage
    || mail.aiResult?.reply?.customerLanguage
    || fallback.language
    || detectCustomerLanguage(original);
  const aiTranslation = normalizeText(
    mail.customerMessageTranslationZh
      || mail.translation?.zh
      || mail.aiResult?.translation?.zh
      || mail.aiResult?.reply?.translationZh
      || mail.aiResult?.reply?.customerMessageZh,
  );

  return {
    original,
    translation: aiTranslation || fallback.text,
    translationSource: aiTranslation ? 'ai' : fallback.source,
    customerLanguage,
    language: customerLanguage,
    languageLabel: customerLanguage.label || CUSTOMER_LANGUAGE_LABELS[customerLanguage.code] || CUSTOMER_LANGUAGE_LABELS.unknown,
  };
}
