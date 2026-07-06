import {
  extractReferenceTokens,
} from './orderIdentifiers.js';

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

function trimTransportMetadata(text = '') {
  return String(text || '')
    .split(/\s+>\s*(?:发件人|寄件人|收件人|时间|测试时间|主题|送达检测|本邮件用于|当前发送邮箱)\s*[:：]/)[0]
    .trim();
}

function stripSubjectHeaders(text = '') {
  return String(text || '')
    .replace(/\bSubject:\s*[^.!?\n]*?\s+(?=(?:Dear|Hello|Hi)\b)/gi, '')
    .replace(/(^|\s)件名[:：]\s*.*?(?=(?:サポートチーム|各位|お世話になっております|こんにちは|こんばんは))/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeRepeatedSentences(text = '') {
  const seen = new Set();
  return (String(text || '').match(/[^.!?。！？\n]+[.!?。！？]?/g) || [])
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => {
      const key = sentence.toLowerCase();
      if (sentence.length < 24) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' ')
    .trim();
}

function cleanCustomerMessageText(text = '') {
  return dedupeRepeatedSentences(stripSubjectHeaders(trimTransportMetadata(text))) || normalizeText(text);
}

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

function countMatches(text = '', pattern) {
  return (String(text || '').match(pattern) || []).length;
}

function stripBracketedPlaceholders(text = '') {
  return String(text || '')
    .replace(/[【\[][^\]】]{0,80}[\]】]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasLatinDominantMixedText(text = '') {
  const source = stripBracketedPlaceholders(text);
  const chineseCount = countMatches(source, /[\u3400-\u9fff]/g);
  const latinCount = countMatches(source, /[a-z]/gi);
  return latinCount >= 25 && latinCount >= Math.max(1, chineseCount * 3);
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
  if (/[\u0600-\u06ff]/.test(original)) return languageResult('ar', { confidence: 0.9 });
  if (/[\u0590-\u05ff]/.test(original)) return languageResult('he', { confidence: 0.9 });
  if (/[\u0900-\u097f]/.test(original)) return languageResult('hi', { confidence: 0.9 });
  if (/[\u0e00-\u0e7f]/.test(original)) return languageResult('th', { confidence: 0.9 });
  if (/[\u0370-\u03ff]/.test(original)) return languageResult('el', { confidence: 0.9 });
  if (/[\u0400-\u04ff]/.test(original)) return languageResult('ru', { confidence: 0.9 });

  const detectionText = stripBracketedPlaceholders(original);
  const mixedLatinDominant = hasLatinDominantMixedText(original);
  if (hasChinese(detectionText) && !mixedLatinDominant) {
    return languageResult('zh', { confidence: 0.95 });
  }

  const latin = normalizeLatinText(detectionText || original);
  const languageScores = [
    ['es', [
      /\b(hola|gracias|por favor|necesito|donde|cuanto|ayuda)\b/,
      /\b(pedido|envio|reembolso|devolucion|devolver|cambiar|producto|paquete|danado|dañado)\b/,
      /[¿¡ñ]/i,
    ]],
    ['fr', [
      /\b(bonjour|merci|client|ou est|s'il vous plait)\b/,
      /\b(commande|livraison|remboursement|retour|retourner|echanger|produit|colis|endommage)\b/,
      /[çœ]/i,
    ]],
    ['de', [
      /\b(hallo|danke|bitte|kunde)\b/,
      /\b(bestellung|lieferung|ruckerstattung|ruckgabe|zuruckgeben|umtauschen|produkt|paket|beschadigt)\b/,
      /[ß]/i,
    ]],
    ['pt', [
      /\b(ola|obrigado|obrigada|por favor|cliente)\b/,
      /\b(pedido|envio|reembolso|devolucao|devolver|trocar|produto|embalagem|danificada|danificado)\b/,
      /[ãõ]/i,
    ]],
    ['it', [
      /\b(ciao|grazie|per favore|cliente)\b/,
      /\b(ordine|spedizione|rimborso|reso|restituire|cambiare|prodotto|pacco|danneggiato)\b/,
    ]],
    ['nl', [
      /\b(hallo|bedankt|alstublieft)\b/,
      /\b(bestelling|verzending|terugbetaling|retour|retourneren|ruilen|product|pakket|beschadigd)\b/,
    ]],
    ['tr', [
      /\b(merhaba|tesekkur|lutfen|musteri)\b/,
      /\b(siparis|kargo|iade|degistirmek|urun|paket|hasarli)\b/,
      /[ğışöçü]/i,
    ]],
    ['vi', [
      /\b(xin chao|cam on|khach hang)\b/,
      /\b(don hang|giao hang|hoan tien|tra lai|doi|san pham|goi hang|hu hong)\b/,
      /[ăâêôơưđ]/i,
    ]],
    ['id', [
      /\b(halo|terima kasih|tolong|pelanggan)\b/,
      /\b(pesanan|pengiriman|pengembalian dana|mengembalikan|menukar|produk|kemasan|rusak)\b/,
    ]],
    ['en', [
      /\b(hello|hi|thanks|thank you|please|customer|help|could you|can you)\b/,
      /\b(order|shipping|tracking|refund|return|package)\b/,
      /\b(product|material|size|color|stock|information|available)\b/,
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

  if (/[a-z]/i.test(detectionText || original)) return languageResult('en', { confidence: mixedLatinDominant ? 0.85 : 0.5 });
  if (hasChinese(original)) return languageResult('zh', { confidence: 0.75 });
  return languageResult('unknown', { confidence: 0.25 });
}

function translateKnownPlaceholders(text = '') {
  return String(text || '')
    .replace(/【注文番号を記入】/g, '【填写订单号】')
    .replace(/【注文日】/g, '【下单日期】')
    .replace(/【商品名】/g, '【商品名称】');
}

function valueAfterColon(text = '') {
  const parts = String(text || '').split(/[:：]/);
  return parts.length > 1
    ? translateKnownPlaceholders(parts.slice(1).join(':').trim()).replace(/[.!?。！？]+$/u, '')
    : '';
}

function colorZh(text = '') {
  const lower = normalizeLatinText(text);
  if (/\bblack\b/.test(lower) || /黒|黑/.test(text)) return '黑色';
  if (/\bwhite\b/.test(lower) || /白/.test(text)) return '白色';
  if (/\bred\b/.test(lower) || /赤|红/.test(text)) return '红色';
  if (/\bblue\b/.test(lower) || /青|蓝/.test(text)) return '蓝色';
  if (/\bgreen\b/.test(lower) || /緑|绿/.test(text)) return '绿色';
  if (/\bgold\b/.test(lower) || /金/.test(text)) return '金色';
  if (/\bsilver\b/.test(lower) || /銀|银/.test(text)) return '银色';
  if (/\bbrown\b/.test(lower) || /茶|棕/.test(text)) return '棕色';
  return '';
}

function productZh(text = '') {
  const lower = normalizeLatinText(text);
  if (/\bwatch(es)?\b/.test(lower) || /時計|手表/.test(text)) return '手表';
  if (/\bshoe(s)?\b/.test(lower) || /靴|鞋/.test(text)) return '鞋子';
  if (/\bbag(s)?\b/.test(lower) || /バッグ|包/.test(text)) return '包';
  if (/\bitem\b|\bproduct\b|\bgoods\b/.test(lower) || /商品/.test(text)) return '商品';
  return '商品';
}

function referenceZh(refs = []) {
  return refs.length ? `订单 ${refs.join('、')}` : '订单';
}

function hasDamageSignal(text = '') {
  const lower = normalizeLatinText(text);
  return /(damag|danad|dañ|dano|danific|endommag|abim|abîm|beschadig|danneggi|hasar|hu hong|rusak|broken|defective|损坏|破损|受损|壊|不良)/.test(lower)
    || /破損|壊れ|不具合/.test(text);
}

function returnExchangeZh(text = '') {
  const lower = normalizeLatinText(text);
  const wantsReturn = /(return|devolver|retour|retourner|zuruckgeben|restituire|retourneren|iade|tra lai|tra hang|mengembalikan|退货|返品)/.test(lower)
    || /返品|退货/.test(text);
  const wantsExchange = /(exchange|replace|trocar|cambiar|echange|echanger|umtauschen|cambiare|ruilen|degistirmek|doi|menukar|换货|交換)/.test(lower)
    || /交換|换货/.test(text);
  if (wantsReturn && wantsExchange) return '我想退货或换货。';
  if (wantsReturn) return '我想退货。';
  if (wantsExchange) return '我想换货。';
  if (/refund|返金|退款/.test(lower) || /返金|退款/.test(text)) return '我想退款。';
  return '';
}

function translateEnglishCustomerSentence(sentence = '') {
  const lower = normalizeLatinText(sentence);
  const refs = extractReferenceTokens(sentence);
  const refText = refs.length ? ` ${refs.join('、')}` : '';
  const color = colorZh(sentence);
  const product = productZh(sentence);
  const issueParts = [];

  if (refs.length && /\border\b/.test(lower) && hasDamageSignal(sentence)) {
    issueParts.push(`我的${referenceZh(refs)} 到货时${product}或包裹已经损坏。`);
    const resolution = returnExchangeZh(sentence);
    if (resolution) issueParts.push(resolution);
    return issueParts.join('\n');
  }

  if (/^(hi|hello|dear team|dear support)[,!. ]*$/i.test(sentence)) return '您好。';
  if (/hope you.?re doing well/.test(lower)) return '希望您一切顺利。';
  if (/latest progress of my order/.test(lower)) return '我想查询订单的最新进展。';
  if (/placed the purchase a few days ago/.test(lower) && /shipment|delivery/.test(lower)) {
    return '我几天前下单了，但还没有收到发货或配送更新。';
  }
  if (/my order number is/.test(lower)) return `我的订单号是：${valueAfterColon(sentence) || '未填写'}。`;
  if (/purchase date/.test(lower)) return `下单日期：${valueAfterColon(sentence) || '未填写'}。`;
  if (/item purchased/.test(lower)) return `购买商品：${valueAfterColon(sentence) || '未填写'}。`;
  if (/confirm the current status of this order/.test(lower)) return '请帮我确认这个订单的当前状态。';
  if (/goods have been dispatched/.test(lower) && /tracking number/.test(lower)) {
    return '如果商品已经发出，请尽快发送物流追踪号码。';
  }
  if (/delay or problem with my order/.test(lower)) {
    return '如果我的订单有任何延迟或问题，请详细告知，方便我安排后续事宜。';
  }
  if (/looking forward to your prompt reply/.test(lower)) return '期待您尽快回复。';
  if (/best regards/.test(lower)) return '祝好。';
  if ((/wrong color|different color|incorrect color/.test(lower)) && /\b(received|got|arrived|sent)\b/.test(lower)) {
    return `我收到的${product}颜色不对。`;
  }
  if (/\bexchange|replace|change\b/.test(lower) && color) {
    return `可以换成${color}吗？`;
  }
  if (/\bexchange|replace|change\b/.test(lower)) return '可以更换吗？';
  if (/\b(order status|check my order|track my order)\b/.test(lower)) {
    return `可以帮我查询订单状态${refText}吗？`;
  }
  if (/where is my package/.test(lower)) return '我的包裹在哪里？';
  if (/could you help me check (the )?tracking number/.test(lower)) return '可以帮我查询物流单号吗？';
  if (/shipping status/.test(lower)) return '运输状态。';
  if (/tracking number/.test(lower)) return '物流单号。';
  if (/do not have the order number|don't have the order number/.test(lower)) return '我没有订单号。';
  if (/order number/.test(lower)) return `订单号${refText}。`;
  if (/order email/.test(lower)) return '下单邮箱。';
  if (/i want (a )?refund|request (a )?refund/.test(lower)) return '我想申请退款。';
  if (/i want to return|request (a )?return/.test(lower)) return '我想申请退货。';
  if (/cancel my order/.test(lower)) return '取消我的订单。';
  if (/item is damaged|product is damaged|arrived damaged/.test(lower)) return '商品损坏了。';
  if (/broken|defective/.test(lower)) return '商品破损或有缺陷。';
  if (/what size|which size|size should i choose/.test(lower)) return '我应该选择什么尺码？';
  if (/material/.test(lower) && /color/.test(lower) && /stock|available|information/.test(lower)) {
    return '请提供产品的尺码、材质、颜色和库存信息。';
  }
  if (/is .* available|in stock/.test(lower)) return '是否有库存？';
  if (/requested file has been sent/.test(lower) || /file has been sent/.test(lower)) return '要求的资料已经发送。';
  if (/please confirm received/.test(lower)) return '请确认是否收到。';
  if (/thank you|thanks/.test(lower)) return '谢谢。';
  return '';
}

function translateCommonCommerceSentence(sentence = '') {
  const lower = normalizeLatinText(sentence);
  const refs = extractReferenceTokens(sentence);
  const refText = refs.length ? ` ${refs.join('、')}` : '';
  const hasOrderWord = /(pedido|commande|bestellung|ordine|siparis|don hang|pesanan|order|bestelling)/.test(lower);
  const resolution = returnExchangeZh(sentence);

  if (/^(ola|hola|bonjour|hallo|ciao|merhaba|xin chao|halo)[,!. ]*$/i.test(lower)) return '您好。';
  if (/e-mail de teste|email de teste|mail de teste/.test(lower) && /devolu|return|retour|ruckgabe|restitu|retourneren|iade|tra lai|mengembalikan/.test(lower)) {
    return '测试邮件：退货申请。';
  }
  if (refs.length && hasOrderWord && hasDamageSignal(sentence)) {
    return [
      `我的${referenceZh(refs)} 到货时商品或包裹已经损坏。`,
      resolution,
    ].filter(Boolean).join('\n');
  }
  if (refs.length && hasOrderWord && resolution) {
    return [
      `我提供的订单号是：${refs.join('、')}。`,
      resolution,
    ].join('\n');
  }
  if (hasDamageSignal(sentence) && resolution) {
    return [
      '商品或包裹到货时已经损坏。',
      resolution,
    ].join('\n');
  }
  if (refs.length
    && /(embalagem|paquete|colis|verpackung|pacco|verpakking|pakket|paket|goi hang|kemasan|package)/.test(lower)
    && /(danific|danad|dañ|dano|endommag|beschadig|danneggi|hasar|hu hong|rusak|damag)/.test(lower)) {
    return `我收到了订单${refText}，但包装或包裹送达时已经损坏。`;
  }
  if (/(recebi|recibi|recu|j.ai recu|erhalten|ricevuto|ontvangen|teslim aldim|nhan duoc|menerima)/.test(lower)
    && /(pedido|commande|bestellung|ordine|siparis|don hang|pesanan|order)/.test(lower)
    && /(embalagem|paquete|colis|verpackung|pacco|verpakking|pakket|paket|goi hang|kemasan|package)/.test(lower)
    && /(danific|danad|dañ|dano|endommag|beschadig|danneggi|hasar|hu hong|rusak|damag)/.test(lower)) {
    return `我收到了订单${refText}，但包装或包裹送达时已经损坏。`;
  }
  if (/(recebi|recibi|recu|j.ai recu|erhalten|ricevuto|ontvangen|teslim aldim|nhan duoc|menerima)/.test(lower)
    && /(pedido|commande|bestellung|ordine|siparis|don hang|pesanan|order)/.test(lower)) {
    return `我收到了订单${refText}。`;
  }
  if (/(embalagem|paquete|colis|verpackung|pacco|verpakking|pakket|paket|goi hang|kemasan|package)/.test(lower)
    && /(danific|danad|dañ|dano|endommag|beschadig|danneggi|hasar|hu hong|rusak|damag)/.test(lower)) {
    return '但包装或包裹送达时已经损坏。';
  }
  if (/(proximos passos|proximos pasos|prochaines etapes|nachsten schritte|prossimi passaggi|volgende stappen|sonraki adim|cac buoc tiep theo|langkah berikutnya|next steps)/.test(lower)
    && /(devolver|trocar|devolver|cambiar|retourner|echanger|zuruckgeben|umtauschen|restituire|cambiare|retourneren|ruilen|iade|degistirmek|tra lai|tra hang|doi|mengembalikan|menukar|return|exchange)/.test(lower)) {
    return '我想了解退货或换货的下一步。';
  }
  if (/(devolver|trocar|cambiar|retourner|echanger|zuruckgeben|umtauschen|restituire|cambiare|retourneren|ruilen|iade|degistirmek|tra lai|tra hang|doi|mengembalikan|menukar)/.test(lower)) {
    return '我想退货或换货。';
  }
  if (/(atenciosamente|atentamente|cordialement|mit freundlichen grussen|distinti saluti|met vriendelijke groet|saygilarimla|best regards)/.test(lower)) {
    return '此致。';
  }

  return '';
}

function translateJapaneseCustomerSentence(sentence = '') {
  const product = productZh(sentence);
  const color = colorZh(sentence);

  if (/^(こんにちは|こんばんは|お世話になります)[。.!！ ]*$/.test(sentence)) return '您好。';
  if (/サポートチーム|各位|お世話になっております/.test(sentence)) return '客服团队各位，您好。';
  if (/数日前に商品を注文/.test(sentence) && /発送|配送/.test(sentence)) {
    return '我几天前订购了商品，但还没有收到发货或配送相关通知。';
  }
  if (/メールにて注文状況の確認/.test(sentence)) return '因此想通过邮件确认订单状态。';
  if (/注文番号|注文日|購入商品/.test(sentence)) {
    return translateKnownPlaceholders(sentence)
      .replace(/注文番号[:：]\s*/g, '订单号：')
      .replace(/注文日[:：]\s*/g, ' 下单日期：')
      .replace(/購入商品[:：]\s*/g, ' 购买商品：')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (/現在の注文の状況/.test(sentence)) return '请帮我确认当前订单状态并回复。';
  if (/発送済み/.test(sentence) && /追跡番号/.test(sentence)) return '如果已经发货，请发送物流追踪号码。';
  if (/遅延|不具合/.test(sentence)) return '如果发生延迟或问题，请说明详细情况。';
  if (/早急なご回答|回答をお待ち/.test(sentence)) return '麻烦您尽快回复。';
  if ((/違う色|異なる色|色が違|色違い/.test(sentence)) && /届き|届いた|受け取り|受け取/.test(sentence)) {
    return `收到的${product}和我订购的是不同颜色。`;
  }
  if (/交換/.test(sentence) && color) return `可以换成${color}吗？`;
  if (/交換/.test(sentence)) return '可以更换吗？';
  if (/注文/.test(sentence) && /(確認|状況|ステータス)/.test(sentence)) return '我想确认订单状态。';
  if (/(配送|発送|配達)/.test(sentence) && /(確認|状況|追跡)/.test(sentence)) return '我想确认配送或物流状态。';
  if (/返金/.test(sentence)) return '我想申请退款。';
  if (/返品/.test(sentence)) return '我想申请退货。';
  return '';
}

function addTemplateSentenceBoundaries(text = '') {
  return String(text || '')
    .replace(/\s+(Purchase date\s*:)/gi, '. $1')
    .replace(/\s+(Item purchased\s*:)/gi, '. $1')
    .replace(/\s+(Could you please\b)/gi, '. $1')
    .replace(/\s+(If the goods have been dispatched\b)/gi, '. $1')
    .replace(/\s+(Should there be any delay\b)/gi, '. $1')
    .replace(/\s+(Looking forward to your prompt reply\b)/gi, '. $1')
    .replace(/\s+(Best regards\b)/gi, '. $1')
    .replace(/\s+(注文日\s*:)/gu, '。$1')
    .replace(/\s+(購入商品\s*:)/gu, '。$1')
    .replace(/\s+(現在の注文)/gu, '。$1')
    .replace(/\s+(もし発送済み)/gu, '。$1')
    .replace(/\s+(また、遅延)/gu, '。$1')
    .replace(/\s+(お手数をおかけ)/gu, '。$1');
}

function splitCustomerSentences(text = '') {
  return (addTemplateSentenceBoundaries(text).match(/[^.!?。！？\n]+[.!?。！？]?/g) || [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function translateKnownCustomerSentences(text = '') {
  return splitCustomerSentences(text)
    .map((sentence) => (
      translateJapaneseCustomerSentence(sentence)
      || translateEnglishCustomerSentence(sentence)
      || translateCommonCommerceSentence(sentence)
    ))
    .filter(Boolean);
}

export function translateCustomerMessageToChinese(text = '') {
  const original = cleanCustomerMessageText(text);
  const language = detectCustomerLanguage(original);
  if (!original) {
    return {
      text: '当前邮件没有可翻译的正文。',
      source: 'empty',
      language,
    };
  }

  if (language.code === 'zh') {
    return {
      text: original,
      source: 'original_zh',
      language,
    };
  }

  const translatedSentences = translateKnownCustomerSentences(original);

  return {
    text: translatedSentences.length
      ? translatedSentences.join('\n')
      : `已识别客户来信语言：${language.label}。暂未生成可靠中文全文翻译，请人工查看上方客户原文。`,
    source: 'local_fallback',
    language,
  };
}

export function buildMailContentView(mail = {}) {
  const original = cleanCustomerMessageText(mail.bodyText || mail.summary || '当前邮件未返回可读正文。');
  const fallback = translateCustomerMessageToChinese(original);
  const providedLanguage = mail.customerLanguage
    || mail.aiResult?.customerLanguage
    || mail.aiResult?.reply?.customerLanguage
    || null;
  const detectedLanguage = fallback.language || detectCustomerLanguage(original);
  const customerLanguage = providedLanguage?.code === 'zh' && detectedLanguage.code !== 'zh'
    ? detectedLanguage
    : providedLanguage || detectedLanguage;
  const aiTranslation = normalizeText(
    mail.customerMessageTranslationZh
      || mail.translation?.zh
      || mail.translationZh
      || mail.aiResult?.translation?.zh
      || mail.aiResult?.customerMessageTranslationZh
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
