function pickSender(message) {
  return message.from?.email
    || message.sender?.email
    || message.from_email
    || 'unknown@example.test';
}

function pickSummary(message) {
  return message.body_preview
    || message.body_text
    || message.snippet
    || message.plain_text
    || message.summary
    || '';
}

function formatFeishuTime(value) {
  if (!value) return '';

  const text = String(value);
  if (!/^\d{12,}$/.test(text)) {
    return text;
  }

  const date = new Date(Number(text));
  if (Number.isNaN(date.getTime())) {
    return text;
  }

  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function mapFeishuMessageToMail(message) {
  const id = message.message_id || message.id;
  const receivedAt = message.received_at
    || message.internal_date
    || message.create_time
    || message.date
    || '';

  return {
    id,
    messageId: message.message_id || id,
    threadId: message.thread_id || message.conversation_id || `thread-${id}`,
    subject: message.subject || '(无标题)',
    sender: pickSender(message),
    receivedAt: formatFeishuTime(receivedAt) || '飞书 API 时间未知',
    summary: pickSummary(message),
    bodyText: message.body_text || pickSummary(message),
    status: '飞书 API 导入',
  };
}

export function createMockFeishuMessages(mails) {
  return mails.map((mail) => {
    const threadId = `thread-${mail.id}`;

    return {
      message_id: mail.id,
      thread_id: threadId,
      subject: mail.subject,
      from: {
        email: mail.sender,
      },
      received_at: mail.receivedAt,
      body_preview: mail.summary,
      labels: mail.id === 'FMAIL-001' ? ['auto_replied'] : [],
      expected_thread_id: mail.id === 'FMAIL-014'
        ? 'thread-previous-file-confirmation'
        : threadId,
    };
  });
}

export function buildSendContextFromFeishuMessages(messages) {
  return messages.reduce((context, message) => {
    const labels = message.labels || [];
    const messageId = message.message_id || message.id;
    const threadId = message.thread_id || message.conversation_id || `thread-${messageId}`;

    context.expectedThreadKeysByMailId[messageId] = message.expected_thread_id || threadId;

    if (labels.includes('auto_replied')) {
      context.repliedMessageIds.push(messageId);
      context.repliedThreadKeys.push(threadId);
    }

    return context;
  }, {
    repliedMessageIds: [],
    repliedThreadKeys: [],
    expectedThreadKeysByMailId: {},
  });
}
