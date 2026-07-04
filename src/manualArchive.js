export function normalizeManualArchiveSelection(selection = {}) {
  return {
    checked: selection.checked === true,
    note: String(selection.note || '').trim(),
    updatedAt: selection.updatedAt || '',
  };
}

export function upsertManualArchiveSelection(store = {}, {
  mailId,
  checked = false,
  note = '',
  updatedAt = new Date().toISOString(),
} = {}) {
  if (!mailId) return { ...store };

  const next = { ...store };
  if (!checked) {
    delete next[mailId];
    return next;
  }

  next[mailId] = normalizeManualArchiveSelection({
    checked: true,
    note,
    updatedAt,
  });
  return next;
}

export function applyManualArchiveSelectionToMail(mail = {}, store = {}) {
  const selection = normalizeManualArchiveSelection(store[mail.id] || store[mail.messageId]);
  if (!selection.checked) return mail;

  return {
    ...mail,
    requiresReview: false,
    allowsRealSend: false,
    replyDraft: '',
    replyCandidates: [],
    templateId: null,
    templateSource: 'manualArchive',
    category: mail.category || '人工归档',
    reason: selection.note || '人工选择手动归档，不生成回复，不进入发送队列。',
    manualArchive: selection,
  };
}

export function buildManualArchiveCompletionResult(mail = {}, {
  message = '已在工作台标记为手动归档完成；真实归档 / 移箱可在服务端开关开启后执行。',
  updatedAt = new Date().toISOString(),
} = {}) {
  return {
    ok: true,
    action: 'manual_archive',
    mode: 'local_manual_archive',
    mailId: mail.id || mail.messageId || '',
    message,
    updatedAt,
  };
}

export function confirmManualArchiveSelection(store = {}, mail = {}, {
  checked = false,
  note = '',
  updatedAt = new Date().toISOString(),
  message = '已在工作台标记为手动归档完成；该邮件状态已更新为已完成。',
} = {}) {
  let selections = upsertManualArchiveSelection(store, {
    mailId: mail.id,
    checked,
    note,
    updatedAt,
  });

  if (mail.messageId && mail.messageId !== mail.id) {
    selections = upsertManualArchiveSelection(selections, {
      mailId: mail.messageId,
      checked,
      note,
      updatedAt,
    });
  }

  return {
    selections,
    result: checked
      ? buildManualArchiveCompletionResult(mail, { message, updatedAt })
      : null,
  };
}
