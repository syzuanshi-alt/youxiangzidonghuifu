import { getMailRiskState } from './riskState.js';

export const REVIEW_OPTIONS = [
  {
    value: 'reasonable',
    label: '合理',
    description: '当前分类、风险和话术都可接受。',
  },
  {
    value: 'adjust_rule',
    label: '需调整规则',
    description: '分类、风险等级或拦截边界不准确。',
  },
  {
    value: 'adjust_template',
    label: '改话术',
    description: '分类合理，但回复内容需要优化。',
  },
  {
    value: 'should_block',
    label: '应拦截',
    description: '这类邮件不应自动回复或出可发送话术。',
  },
];

const REVIEW_LABELS = Object.fromEntries(
  REVIEW_OPTIONS.map((option) => [option.value, option.label]),
);

export function upsertReview(currentReviews, review) {
  return {
    ...currentReviews,
    [review.mailId]: {
      decision: review.decision,
      note: review.note || '',
      updatedAt: review.updatedAt || new Date().toISOString(),
    },
  };
}

export function summarizeReviews(reviews) {
  return Object.values(reviews).reduce((summary, review) => {
    summary.total += 1;
    summary.reasonable += review.decision === 'reasonable' ? 1 : 0;
    summary.adjustRule += review.decision === 'adjust_rule' ? 1 : 0;
    summary.adjustTemplate += review.decision === 'adjust_template' ? 1 : 0;
    summary.shouldBlock += review.decision === 'should_block' ? 1 : 0;
    return summary;
  }, {
    total: 0,
    reasonable: 0,
    adjustRule: 0,
    adjustTemplate: 0,
    shouldBlock: 0,
  });
}

export function exportReviewItems(classifiedMails, reviews) {
  return classifiedMails
    .filter((mail) => reviews[mail.id])
    .map((mail) => {
      const review = reviews[mail.id];
      const riskState = getMailRiskState(mail);
      return {
        mailId: mail.id,
        subject: mail.subject,
        category: mail.category,
        risk: riskState.risk,
        action: riskState.action,
        templateId: mail.templateId,
        decision: review.decision,
        decisionText: REVIEW_LABELS[review.decision],
        note: review.note,
      };
    });
}
