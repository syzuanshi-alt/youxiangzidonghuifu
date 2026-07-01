export function findPromptTemplate(config = {}, promptType = '') {
  return (config.promptTemplates || [])
    .filter((template) => template.enabled !== false)
    .find((template) => template.promptType === promptType)
    || null;
}

function formatList(values = []) {
  return (Array.isArray(values) ? values : [])
    .filter(Boolean)
    .join(', ');
}

function formatKnowledgeBaseEntry(entry = {}, index = 0) {
  return [
    `#${index + 1} ${entry.title || entry.id || 'Untitled knowledge entry'}`,
    `Category: ${entry.category || ''}`,
    `Scenario: ${entry.customerScenario || ''}`,
    `Standard reply: ${entry.standardReply || ''}`,
    `Standard reply EN: ${entry.standardReplyEn || ''}`,
    `Forbidden expressions: ${formatList(entry.forbiddenExpressions)}`,
    `Recommended tone: ${entry.recommendedTone || ''}`,
    `Require human review: ${entry.requireHumanReview ? 'yes' : 'no'}`,
    `Allow auto reply: ${entry.allowForAutoReply ? 'yes' : 'no'}`,
    `Notes: ${entry.notes || ''}`,
  ].filter((line) => !line.endsWith(': ')).join('\n');
}

export function renderPrompt({
  config = {},
  promptType = 'reply_generation',
  emailPayload = {},
  spam = {},
  risk = {},
  knowledgeBaseRefs = [],
  knowledgeBaseEntries = [],
} = {}) {
  const template = findPromptTemplate(config, promptType);
  const customerLanguage = emailPayload.customerLanguage || {};
  const languageCode = customerLanguage.code || customerLanguage || 'unknown';
  const languageLabel = customerLanguage.label || '';
  const knowledgeDetails = (knowledgeBaseEntries || [])
    .map(formatKnowledgeBaseEntry)
    .join('\n\n');
  return {
    systemPrompt: template?.systemPrompt || '',
    taskPrompt: [
      template?.taskPrompt || '',
      `Customer language: ${languageCode}${languageLabel ? ` (${languageLabel})` : ''}`,
      'Customer-facing replies must use the same language as the customer email. Put any Chinese explanation only in translationZh or internalSuggestion.',
      `Subject: ${emailPayload.subject || ''}`,
      `Sender: ${emailPayload.senderEmail || ''}`,
      `Body: ${emailPayload.bodyText || emailPayload.body_text || emailPayload.body || emailPayload.summary || ''}`,
      `Spam: ${spam.isSpam ? 'yes' : 'no'}`,
      `Risk: ${risk.level || 'medium'}`,
      `Knowledge refs: ${knowledgeBaseRefs.map((ref) => ref.title).join(', ')}`,
      knowledgeDetails ? `Knowledge base entries:\n${knowledgeDetails}` : '',
    ].filter(Boolean).join('\n'),
    outputFormat: template?.outputFormat || {},
  };
}
