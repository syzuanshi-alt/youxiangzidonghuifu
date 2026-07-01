const EMOTION_DEFINITIONS = [
  {
    level: 'threatening',
    keywords: ['lawyer', 'legal', 'court', 'fraud', 'scam', 'chargeback', 'complain to the platform', 'bad review', 'negative review', '律师', '法律', '法院', '拒付', '平台投诉', '差评'],
  },
  {
    level: 'angry',
    keywords: ['angry', 'furious', 'unacceptable', 'terrible', '垃圾', '生气', '愤怒', '无法接受'],
  },
  {
    level: 'dissatisfied',
    keywords: ['not satisfied', 'disappointed', 'poor quality', 'defective', '不满意', '失望', '质量糟糕'],
  },
  {
    level: 'urgent',
    keywords: ['urgent', 'asap', 'asked many times', 'worried', 'hurry', 'immediately', '紧急', '马上', '多次追问', '焦急', '催促'],
  },
  {
    level: 'concerned',
    keywords: ['concerned', 'question', 'help', 'worried', '担心', '帮助', '咨询'],
  },
];

const LEVEL_WEIGHT = {
  calm: 0,
  concerned: 1,
  urgent: 2,
  dissatisfied: 3,
  angry: 4,
  threatening: 5,
};

export function detectCustomerEmotion({
  emailPayload = {},
  normalizedContext = null,
} = {}) {
  const text = normalizedContext?.normalizedText || [
    emailPayload.subject,
    emailPayload.body,
    emailPayload.bodyText,
    emailPayload.body_text,
    emailPayload.summary,
  ].filter(Boolean).join('\n').toLowerCase();

  const matched = EMOTION_DEFINITIONS
    .map((definition) => ({
      ...definition,
      matches: definition.keywords.filter((keyword) => text.includes(keyword.toLowerCase())),
    }))
    .filter((definition) => definition.matches.length > 0)
    .sort((a, b) => (LEVEL_WEIGHT[b.level] || 0) - (LEVEL_WEIGHT[a.level] || 0));

  const top = matched[0] || { level: 'calm', matches: [] };
  const escalationSignals = matched
    .filter((item) => ['urgent', 'dissatisfied', 'angry', 'threatening'].includes(item.level))
    .map((item) => item.level);

  return {
    emotionLevel: top.level,
    emotionReasons: top.matches.length
      ? matched.map((item) => `${item.level}: ${item.matches.join(', ')}`)
      : ['未识别到明显负面情绪。'],
    escalationSignals: [...new Set(escalationSignals)],
  };
}
