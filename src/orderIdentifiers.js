const ORDER_LABEL_PATTERN = /(?:\bmy\s+order\b|\border\s*(?:number|no\.?|id)?\b|\bpedido\b(?:\s*(?:n[º°o.]|numero|número))?|\bn[uú]mero\s+d[eo]\s+pedido\b|\bcommande\b(?:\s*(?:n[º°o.]|numero|numéro))?|\bnum[eé]ro\s+d[ea]\s+commande\b|\bbestellnummer\b|\bbestellung\b(?:\s*(?:nr\.?|nummer))?|\bordine\b(?:\s*(?:n\.?|numero))?|\bnumero\s+d['’]?ordine\b|\bbestelling\b(?:\s*(?:nr\.?|nummer))?|\bsipari[şs]\b(?:\s*(?:no\.?|numarasi|numarası))?|\bdon\s*hang\b|\bpesanan\b|订单(?:号|编号)?|訂單(?:號|編號)?|注文(?:番号|号)?)/giu;

const STANDALONE_IDENTIFIER_PATTERN = /\b[A-Z]{1,8}(?:[-\s]+[A-Z]{1,12}){0,2}[-\s]*\d{4,}[A-Z0-9-]*\b/g;

const LEADING_CONNECTOR_PATTERN = /^(?:\s|[:：#№º°.\-–—])*(?:(?:is|are|was|为|是|号为|编号为|は|です|n[º°o.]|no\.?|nr\.?|num[eé]ro|numero|number|id)\b(?:\s|[:：#№º°.\-–—])*)*/iu;

function normalizeIdentifierParts(parts = []) {
  const normalized = parts
    .map((part) => String(part || '').replace(/[^a-z0-9]/gi, '').trim())
    .filter(Boolean)
    .map((part) => /[a-z]/i.test(part) ? part.toUpperCase() : part);
  if (!normalized.some((part) => /\d/.test(part))) return '';
  const joined = normalized.join('-');
  const compactLength = joined.replace(/-/g, '').length;
  return compactLength >= 5 ? joined : '';
}

function parseIdentifierAfterLabel(tail = '') {
  const cleaned = String(tail || '').replace(LEADING_CONNECTOR_PATTERN, '');
  const tokens = cleaned.match(/[a-z0-9]+/giu) || [];
  const parts = [];
  let seenDigit = false;
  for (const token of tokens) {
    const tokenText = String(token || '');
    const hasDigit = /\d/.test(tokenText);
    const isLowerWord = /^[a-z]+$/u.test(tokenText) && tokenText === tokenText.toLowerCase();
    if (seenDigit && !hasDigit && isLowerWord) break;
    if (!seenDigit && !hasDigit && parts.length >= 3) break;
    if (!seenDigit && !hasDigit && tokenText.length > 12) break;
    parts.push(tokenText);
    if (hasDigit) seenDigit = true;
    if (seenDigit && parts.length >= 5) break;
  }
  return normalizeIdentifierParts(parts);
}

function normalizeStandaloneIdentifier(value = '') {
  const tokens = String(value || '').match(/[a-z0-9]+/giu) || [];
  return normalizeIdentifierParts(tokens);
}

export function extractOrderIdentifiers(text = '') {
  const source = String(text || '');
  const identifiers = [];

  let labelMatch = ORDER_LABEL_PATTERN.exec(source);
  while (labelMatch) {
    const tail = source.slice(labelMatch.index + labelMatch[0].length, labelMatch.index + labelMatch[0].length + 90);
    const identifier = parseIdentifierAfterLabel(tail);
    if (identifier) identifiers.push(identifier);
    labelMatch = ORDER_LABEL_PATTERN.exec(source);
  }

  const standaloneMatches = source.match(STANDALONE_IDENTIFIER_PATTERN) || [];
  standaloneMatches.forEach((match) => {
    const identifier = normalizeStandaloneIdentifier(match);
    if (identifier) identifiers.push(identifier);
  });

  return [...new Set(identifiers)];
}

export function extractReferenceTokens(text = '') {
  return extractOrderIdentifiers(text);
}
