import { buildAgentRuntimeContext } from './agentConfig.js';

export const replyTemplates = [
  {
    templateId: 'TPL-RECEIVED-001',
    scene: '收到邮件确认',
    risk: 'low',
    action: 'auto_reply',
    content: '您好，邮件已收到，我们会尽快查看并处理。如需补充信息，请继续回复本邮件。',
    contentZh: '您好，邮件已收到，我们会尽快查看并处理。如需补充信息，请继续回复本邮件。',
    contentEn: 'Hello, thank you for reaching out. We have received your email and will review it as soon as possible. If you need to add more information, please reply to this email.',
    variables: [],
    requiresReview: false,
    allowsRealSend: false,
    selectionReason: '客户只需要确认邮件已收到，不涉及订单处理、赔付或承诺。',
  },
  {
    templateId: 'TPL-ORDER-MISSING-001',
    scene: '要求补订单号',
    risk: 'low',
    action: 'auto_reply',
    content: '您好，为了更快帮您查询，请提供订单号或下单邮箱。客服确认后会继续处理。',
    contentZh: '您好，为了更快帮您查询，请提供订单号或下单邮箱。客服确认后会继续处理。',
    contentEn: 'Hello, thank you for contacting us. To help us check this faster, please share your order number or the email address used for the order. Our support team will continue after confirming the details.',
    variables: ['orderId', 'buyerEmail'],
    requiresReview: false,
    allowsRealSend: false,
    selectionReason: '客户咨询订单但缺少定位信息，只收集订单号或下单邮箱。',
  },
  {
    templateId: 'TPL-BUYER-EMAIL-MISSING-001',
    scene: '要求补下单邮箱',
    risk: 'low',
    action: 'auto_reply',
    content: '您好，为了更快定位订单，请补充下单邮箱或手机号。我们收到后会继续跟进。',
    contentZh: '您好，为了更快定位订单，请补充下单邮箱或手机号。我们收到后会继续跟进。',
    contentEn: 'Hello, to help us locate your order faster, please share the email address or phone number used for the order. We will follow up after receiving the details.',
    variables: ['buyerEmail', 'phone'],
    requiresReview: false,
    allowsRealSend: false,
    selectionReason: '客户缺少下单邮箱或联系方式，只要求补充信息。',
  },
  {
    templateId: 'TPL-OFF-HOURS-001',
    scene: '非工作时间收到邮件',
    risk: 'low',
    action: 'auto_reply',
    content: '您好，我们已收到您的邮件。客服将在工作时间继续处理，请勿重复提交。',
    contentZh: '您好，我们已收到您的邮件。客服将在工作时间继续处理，请勿重复提交。',
    contentEn: 'Hello, we have received your email. Our support team will continue handling it during working hours. Please do not submit the same request repeatedly.',
    variables: ['workHours'],
    requiresReview: false,
    allowsRealSend: false,
    selectionReason: '只说明客服处理节奏，不承诺处理结果。',
  },
  {
    templateId: 'TPL-GENERAL-INFO-001',
    scene: '普通资料或流程咨询',
    risk: 'low',
    action: 'auto_reply',
    content: '您好，已收到您的问题。我们会按流程协助处理，如涉及订单问题请补充订单号。',
    contentZh: '您好，已收到您的问题。我们会按流程协助处理，如涉及订单问题请补充订单号。',
    contentEn: 'Hello, we have received your question. We will assist according to the normal support process. If this is related to an order, please share your order number.',
    variables: ['orderId'],
    requiresReview: false,
    allowsRealSend: false,
    selectionReason: '普通流程说明，不涉及承诺、赔付或订单修改。',
  },
  {
    templateId: 'TPL-TRACKING-RECEIVED-001',
    scene: '物流查询初步确认',
    risk: 'low',
    action: 'auto_reply',
    content: '您好，已收到您的物流查询。我们会根据订单信息核对物流更新；如方便，请补充订单号或下单邮箱。',
    contentZh: '您好，已收到您的物流查询。我们会根据订单信息核对物流更新；如方便，请补充订单号或下单邮箱。',
    contentEn: 'Hello, we have received your shipping inquiry. We will check the shipping update based on the order information. If possible, please share your order number or order email.',
    variables: ['orderId', 'buyerEmail'],
    requiresReview: false,
    allowsRealSend: false,
    selectionReason: '低风险物流查询只确认收到并请求补充定位信息，不承诺具体到货或发货时间。',
  },
  {
    templateId: 'TPL-SIZE-INQUIRY-001',
    scene: '尺码咨询初步确认',
    risk: 'low',
    action: 'auto_reply',
    content: '您好，已收到您的尺码咨询。为避免订单信息不准确，请补充订单号、下单邮箱和希望调整的尺码，客服会继续核对。',
    contentZh: '您好，已收到您的尺码咨询。为避免订单信息不准确，请补充订单号、下单邮箱和希望调整的尺码，客服会继续核对。',
    contentEn: 'Hello, we have received your size inquiry. To avoid inaccurate order information, please share your order number, order email, and the size you would like to confirm. Our support team will continue checking it.',
    variables: ['orderId', 'buyerEmail', 'size'],
    requiresReview: false,
    allowsRealSend: false,
    selectionReason: '低风险尺码咨询只收集必要信息，不直接承诺修改订单。',
  },
  {
    templateId: 'TPL-ORDER-STATUS-001',
    scene: '查订单',
    risk: 'medium',
    action: 'draft_only',
    content: '您好，我们已收到您的订单查询请求。客服将核对订单状态后回复您。',
    contentZh: '您好，我们已收到您的订单查询请求。客服将核对订单状态后回复您。',
    contentEn: 'Hello, we have received your order status inquiry. Our support team will check the order status before replying with confirmed information.',
    variables: ['orderId'],
    requiresReview: true,
    allowsRealSend: false,
    selectionReason: '订单状态必须核对系统数据，不能自动给结论。',
  },
  {
    templateId: 'TPL-LOGISTICS-001',
    scene: '查物流',
    risk: 'medium',
    action: 'draft_only',
    content: '您好，我们已收到您的物流查询请求。客服将核对物流信息后回复您。',
    contentZh: '您好，我们已收到您的物流查询请求。客服将核对物流信息后回复您。',
    contentEn: 'Hello, we have received your shipping inquiry. Our support team will verify the shipping information before replying with confirmed details.',
    variables: ['trackingNumber', 'carrier'],
    requiresReview: true,
    allowsRealSend: false,
    selectionReason: '物流状态需要核对外部或内部系统，不能自动承诺到货。',
  },
  {
    templateId: 'TPL-AFTERSALE-001',
    scene: '售后咨询',
    risk: 'medium',
    action: 'draft_only',
    content: '您好，我们已收到您的售后咨询。请补充订单号、问题照片或视频，客服会进一步确认。',
    contentZh: '您好，我们已收到您的售后咨询。请补充订单号、问题照片或视频，客服会进一步确认。',
    contentEn: 'Hello, we have received your after-sales inquiry. Please share your order number and any photos or videos related to the issue, and our support team will review them further.',
    variables: ['orderId', 'attachments'],
    requiresReview: true,
    allowsRealSend: false,
    selectionReason: '售后问题需要人工确认订单、照片、视频和处理方案。',
  },
  {
    templateId: 'TPL-CREATOR-COLLAB-001',
    scene: '达人合作',
    risk: 'medium',
    action: 'draft_only',
    content: '您好，感谢联系。请补充合作账号、平台链接和合作诉求，我们会评估后回复。',
    contentZh: '您好，感谢联系。请补充合作账号、平台链接和合作诉求，我们会评估后回复。',
    contentEn: 'Hello, thank you for reaching out. Please share your collaboration account, platform link, and collaboration request. We will review the details before replying.',
    variables: ['platformAccount', 'profileUrl', 'collaborationGoal'],
    requiresReview: true,
    allowsRealSend: false,
    selectionReason: '合作条件需要人工评估，不能由系统自动承诺。',
  },
  {
    templateId: 'TPL-AMBIGUOUS-001',
    scene: '语义不明确',
    risk: 'medium',
    action: 'draft_only',
    content: '您好，我们已收到您的邮件。为避免理解偏差，客服会人工确认后回复。',
    contentZh: '您好，我们已收到您的邮件。为避免理解偏差，客服会人工确认后回复。',
    contentEn: 'Hello, we have received your email. To avoid misunderstanding, our support team will review it manually before replying.',
    variables: [],
    requiresReview: true,
    allowsRealSend: false,
    selectionReason: '客户意图不清楚，默认进入人工审核草稿。',
  },
];

const FORBIDDEN_AUTO_REPLY_PATTERNS = [
  /同意退款/,
  /可以退款/,
  /马上退款/,
  /赔偿/,
  /补偿/,
  /今天发货/,
  /马上发货/,
  /一定到货/,
  /可以改价/,
  /已经改价/,
  /we will refund/i,
  /refund approved/i,
  /compensation/i,
];

const SUPPORTED_REPLY_LANGUAGE_CODES = new Set([
  'zh',
  'en',
  'es',
  'fr',
  'de',
  'pt',
  'it',
  'nl',
  'tr',
  'vi',
  'id',
  'ja',
  'ko',
  'ru',
  'ar',
  'he',
  'hi',
  'th',
]);

const REPLY_LANGUAGE_PHRASES = {
  es: {
    low: 'Hola, gracias por contactarnos. Hemos recibido su correo. Para ayudarle a revisar esto mas rapido, comparta su numero de pedido o el correo usado en el pedido si corresponde.',
    medium: 'Hola, hemos recibido su correo. Para evitar informacion incorrecta, nuestro equipo revisara los detalles manualmente antes de responder.',
    manualHold: 'Hola, hemos recibido su correo. Como esta solicitud necesita revision manual, nuestro equipo continuara el seguimiento despues de confirmar la informacion relevante.',
    detailedExtra: 'Si es posible, comparta su numero de pedido, correo de pedido y cualquier captura o video relevante para que podamos revisarlo mas rapido.',
  },
  fr: {
    low: 'Bonjour, merci de nous avoir contactes. Nous avons bien recu votre e-mail. Pour nous aider a verifier plus rapidement, veuillez partager votre numero de commande ou l e-mail utilise pour la commande si necessaire.',
    medium: 'Bonjour, nous avons bien recu votre e-mail. Pour eviter toute information inexacte, notre equipe verifiera les details manuellement avant de repondre.',
    manualHold: 'Bonjour, nous avons bien recu votre e-mail. Comme cette demande necessite une verification manuelle, notre equipe poursuivra le suivi apres confirmation des informations pertinentes.',
    detailedExtra: 'Si possible, veuillez partager votre numero de commande, l e-mail de commande et toute capture ou video pertinente afin que nous puissions verifier plus rapidement.',
  },
  de: {
    low: 'Hallo, vielen Dank fur Ihre Nachricht. Wir haben Ihre E-Mail erhalten. Damit wir dies schneller prufen konnen, senden Sie uns bitte bei Bedarf Ihre Bestellnummer oder die E-Mail-Adresse der Bestellung.',
    medium: 'Hallo, wir haben Ihre E-Mail erhalten. Um ungenaue Informationen zu vermeiden, wird unser Support-Team die Details manuell prufen, bevor es antwortet.',
    manualHold: 'Hallo, wir haben Ihre E-Mail erhalten. Da diese Anfrage eine manuelle Prufung erfordert, wird unser Support-Team nach Bestatigung der relevanten Informationen weiter nachfassen.',
    detailedExtra: 'Wenn moglich, senden Sie bitte Ihre Bestellnummer, Bestell-E-Mail und relevante Screenshots oder Videos, damit wir dies schneller prufen konnen.',
  },
  pt: {
    low: 'Ola, obrigado por entrar em contato. Recebemos seu e-mail. Para ajudar a verificar mais rapido, envie o numero do pedido ou o e-mail usado no pedido, se aplicavel.',
    medium: 'Ola, recebemos seu e-mail. Para evitar informacoes incorretas, nossa equipe revisara os detalhes manualmente antes de responder.',
    manualHold: 'Ola, recebemos seu e-mail. Como esta solicitacao precisa de revisao manual, nossa equipe continuara o acompanhamento depois de confirmar as informacoes relevantes.',
    detailedExtra: 'Se possivel, envie o numero do pedido, o e-mail do pedido e capturas ou videos relevantes para que possamos verificar mais rapido.',
  },
  it: {
    low: 'Ciao, grazie per averci contattato. Abbiamo ricevuto la tua e-mail. Per aiutarci a verificare piu rapidamente, condividi il numero dell ordine o l e-mail usata per l ordine se necessario.',
    medium: 'Ciao, abbiamo ricevuto la tua e-mail. Per evitare informazioni imprecise, il nostro team verifichera manualmente i dettagli prima di rispondere.',
    manualHold: 'Ciao, abbiamo ricevuto la tua e-mail. Poiche questa richiesta richiede una revisione manuale, il nostro team continuera il follow-up dopo aver confermato le informazioni pertinenti.',
    detailedExtra: 'Se possibile, condividi il numero dell ordine, l e-mail dell ordine e screenshot o video pertinenti per permetterci di verificare piu rapidamente.',
  },
  nl: {
    low: 'Hallo, bedankt voor uw bericht. We hebben uw e-mail ontvangen. Deel indien nodig uw bestelnummer of het e-mailadres van de bestelling zodat we dit sneller kunnen controleren.',
    medium: 'Hallo, we hebben uw e-mail ontvangen. Om onjuiste informatie te voorkomen, controleert ons supportteam de gegevens handmatig voordat we antwoorden.',
    manualHold: 'Hallo, we hebben uw e-mail ontvangen. Omdat dit verzoek handmatige controle nodig heeft, volgt ons supportteam dit verder op nadat de relevante informatie is bevestigd.',
    detailedExtra: 'Deel indien mogelijk uw bestelnummer, bestel-e-mail en relevante screenshots of video zodat we dit sneller kunnen controleren.',
  },
  tr: {
    low: 'Merhaba, bizimle iletisime gectiginiz icin tesekkurler. E-postanizi aldik. Daha hizli kontrol edebilmemiz icin gerekiyorsa siparis numaranizi veya sipariste kullanilan e-posta adresini paylasin.',
    medium: 'Merhaba, e-postanizi aldik. Yanlis bilgi vermemek icin destek ekibimiz yanitlamadan once ayrintilari manuel olarak kontrol edecektir.',
    manualHold: 'Merhaba, e-postanizi aldik. Bu talep manuel inceleme gerektirdigi icin destek ekibimiz ilgili bilgileri dogruladiktan sonra takip edecektir.',
    detailedExtra: 'Mumkunse siparis numaranizi, siparis e-postanizi ve ilgili ekran goruntusu veya videolari paylasin.',
  },
  vi: {
    low: 'Xin chao, cam on ban da lien he. Chung toi da nhan duoc email cua ban. Neu can, vui long cung cap ma don hang hoac email dat hang de chung toi kiem tra nhanh hon.',
    medium: 'Xin chao, chung toi da nhan duoc email cua ban. De tranh thong tin khong chinh xac, doi ngu ho tro se kiem tra thu cong truoc khi phan hoi.',
    manualHold: 'Xin chao, chung toi da nhan duoc email cua ban. Vi yeu cau nay can duoc xem xet thu cong, doi ngu ho tro se tiep tuc theo doi sau khi xac nhan thong tin lien quan.',
    detailedExtra: 'Neu co the, vui long cung cap ma don hang, email dat hang va anh chup man hinh hoac video lien quan de chung toi kiem tra nhanh hon.',
  },
  id: {
    low: 'Halo, terima kasih telah menghubungi kami. Kami telah menerima email Anda. Jika diperlukan, mohon bagikan nomor pesanan atau email yang digunakan untuk pesanan agar kami dapat memeriksanya lebih cepat.',
    medium: 'Halo, kami telah menerima email Anda. Untuk menghindari informasi yang tidak akurat, tim dukungan kami akan memeriksa detailnya secara manual sebelum membalas.',
    manualHold: 'Halo, kami telah menerima email Anda. Karena permintaan ini memerlukan pemeriksaan manual, tim dukungan kami akan menindaklanjuti setelah mengonfirmasi informasi terkait.',
    detailedExtra: 'Jika memungkinkan, bagikan nomor pesanan, email pesanan, serta tangkapan layar atau video yang relevan.',
  },
  ja: {
    low: 'こんにちは。お問い合わせありがとうございます。メールを受け取りました。確認を早めるため、必要に応じて注文番号または注文時のメールアドレスをお知らせください。',
    medium: 'こんにちは。メールを受け取りました。誤った情報を避けるため、サポートチームが内容を手動で確認してから返信します。',
    manualHold: 'こんにちは。メールを受け取りました。このご依頼は手動確認が必要なため、関連情報を確認した後にサポートチームが引き続き対応します。',
    detailedExtra: '可能であれば、注文番号、注文時のメールアドレス、関連するスクリーンショットや動画をお送りください。',
  },
  ko: {
    low: '안녕하세요. 문의해 주셔서 감사합니다. 이메일을 받았습니다. 더 빠른 확인을 위해 필요한 경우 주문 번호 또는 주문 시 사용한 이메일을 알려 주세요.',
    medium: '안녕하세요. 이메일을 받았습니다. 부정확한 안내를 피하기 위해 지원팀이 세부 내용을 수동으로 확인한 후 답변드리겠습니다.',
    manualHold: '안녕하세요. 이메일을 받았습니다. 이 요청은 수동 확인이 필요하므로 관련 정보를 확인한 뒤 지원팀이 계속 안내드리겠습니다.',
    detailedExtra: '가능하다면 주문 번호, 주문 이메일, 관련 스크린샷 또는 영상을 보내 주세요.',
  },
  ru: {
    low: 'Здравствуйте, спасибо за обращение. Мы получили ваше письмо. Чтобы быстрее проверить запрос, при необходимости пришлите номер заказа или адрес электронной почты, использованный при оформлении заказа.',
    medium: 'Здравствуйте, мы получили ваше письмо. Чтобы избежать неточной информации, наша служба поддержки вручную проверит детали перед ответом.',
    manualHold: 'Здравствуйте, мы получили ваше письмо. Поскольку этот запрос требует ручной проверки, наша служба поддержки продолжит обработку после подтверждения соответствующей информации.',
    detailedExtra: 'Если возможно, пришлите номер заказа, почту заказа и соответствующие скриншоты или видео.',
  },
  ar: {
    low: 'مرحبا، شكرا لتواصلك معنا. لقد استلمنا بريدك الإلكتروني. لمساعدتنا على التحقق بسرعة أكبر، يرجى مشاركة رقم الطلب أو البريد المستخدم في الطلب عند الحاجة.',
    medium: 'مرحبا، لقد استلمنا بريدك الإلكتروني. لتجنب أي معلومات غير دقيقة، سيراجع فريق الدعم التفاصيل يدويا قبل الرد.',
    manualHold: 'مرحبا، لقد استلمنا بريدك الإلكتروني. لأن هذا الطلب يحتاج إلى مراجعة يدوية، سيتابع فريق الدعم بعد تأكيد المعلومات ذات الصلة.',
    detailedExtra: 'إذا أمكن، يرجى مشاركة رقم الطلب وبريد الطلب وأي لقطات شاشة أو مقاطع فيديو ذات صلة.',
  },
  he: {
    low: 'שלום, תודה שפנית אלינו. קיבלנו את האימייל שלך. כדי שנוכל לבדוק מהר יותר, יש לשתף מספר הזמנה או את האימייל ששימש להזמנה במידת הצורך.',
    medium: 'שלום, קיבלנו את האימייל שלך. כדי להימנע ממידע לא מדויק, צוות התמיכה יבדוק את הפרטים ידנית לפני המענה.',
    manualHold: 'שלום, קיבלנו את האימייל שלך. מכיוון שבקשה זו דורשת בדיקה ידנית, צוות התמיכה ימשיך בטיפול לאחר אישור המידע הרלוונטי.',
    detailedExtra: 'אם אפשר, יש לשתף מספר הזמנה, אימייל הזמנה וצילומי מסך או סרטונים רלוונטיים.',
  },
  hi: {
    low: 'नमस्ते, संपर्क करने के लिए धन्यवाद। हमें आपका ईमेल मिल गया है। तेजी से जांच करने के लिए, कृपया जरूरत होने पर अपना ऑर्डर नंबर या ऑर्डर में इस्तेमाल ईमेल साझा करें।',
    medium: 'नमस्ते, हमें आपका ईमेल मिल गया है। गलत जानकारी से बचने के लिए हमारी सहायता टीम जवाब देने से पहले विवरण मैन्युअल रूप से जांचेगी।',
    manualHold: 'नमस्ते, हमें आपका ईमेल मिल गया है। इस अनुरोध को मैन्युअल समीक्षा की जरूरत है, इसलिए संबंधित जानकारी की पुष्टि के बाद सहायता टीम आगे फॉलो अप करेगी।',
    detailedExtra: 'यदि संभव हो, तो कृपया ऑर्डर नंबर, ऑर्डर ईमेल और संबंधित स्क्रीनशॉट या वीडियो साझा करें।',
  },
  th: {
    low: 'สวัสดี ขอบคุณที่ติดต่อเรา เราได้รับอีเมลของคุณแล้ว หากจำเป็น โปรดแจ้งหมายเลขคำสั่งซื้อหรืออีเมลที่ใช้สั่งซื้อเพื่อให้เราตรวจสอบได้เร็วขึ้น',
    medium: 'สวัสดี เราได้รับอีเมลของคุณแล้ว เพื่อหลีกเลี่ยงข้อมูลที่ไม่ถูกต้อง ทีมสนับสนุนจะตรวจสอบรายละเอียดด้วยตนเองก่อนตอบกลับ',
    manualHold: 'สวัสดี เราได้รับอีเมลของคุณแล้ว เนื่องจากคำขอนี้ต้องมีการตรวจสอบด้วยตนเอง ทีมสนับสนุนจะติดตามต่อหลังจากยืนยันข้อมูลที่เกี่ยวข้อง',
    detailedExtra: 'หากเป็นไปได้ โปรดแจ้งหมายเลขคำสั่งซื้อ อีเมลคำสั่งซื้อ และภาพหน้าจอหรือวิดีโอที่เกี่ยวข้อง',
  },
};

export function normalizeReplyLanguageCode(customerLanguage = 'en') {
  const rawCode = typeof customerLanguage === 'string'
    ? customerLanguage
    : customerLanguage?.code;
  const code = String(rawCode || 'en').trim().toLowerCase();
  return SUPPORTED_REPLY_LANGUAGE_CODES.has(code) ? code : 'en';
}

function localizedPhraseForCandidate(candidate = {}, languageCode = 'en') {
  const phrases = REPLY_LANGUAGE_PHRASES[languageCode];
  if (!phrases) return candidate.content;
  if (candidate.variant === 'manual_hold' || candidate.risk === 'high' || candidate.action === 'blocked') {
    return phrases.manualHold;
  }
  if (candidate.risk === 'medium' || candidate.action === 'draft_only' || candidate.variant === 'conservative') {
    return candidate.variant === 'detailed' && phrases.detailedExtra
      ? [phrases.medium, phrases.detailedExtra].join('\n')
      : phrases.medium;
  }
  if (candidate.variant === 'detailed' && phrases.detailedExtra) {
    return [phrases.low, phrases.detailedExtra].join('\n');
  }
  return phrases.low;
}

export function alignReplyCandidateLanguage(candidate = {}, customerLanguage = 'en') {
  if (!candidate || !candidate.candidateId) return candidate;
  if (!candidate.sendable && ['manual_guidance', 'internal_suggestion'].includes(candidate.variant)) {
    return {
      ...candidate,
      language: 'zh',
    };
  }

  const languageCode = normalizeReplyLanguageCode(customerLanguage);
  if (languageCode === 'zh') {
    return {
      ...candidate,
      content: candidate.contentZh || candidate.content,
      language: 'zh',
    };
  }

  return {
    ...candidate,
    content: localizedPhraseForCandidate(candidate, languageCode),
    language: languageCode,
  };
}

function alignReplyCandidates(candidates = [], customerLanguage = 'en') {
  return candidates.map((candidate) => alignReplyCandidateLanguage(candidate, customerLanguage));
}

export function getTemplateByScene(scene) {
  return replyTemplates.find((template) => template.scene === scene) || null;
}

function makeCandidate({
  candidateId,
  label,
  variant,
  content,
  contentZh = '',
  action,
  risk,
  requiresReview,
  sendable,
  agent,
  language = 'en',
}) {
  return {
    candidateId,
    label,
    variant,
    content,
    contentZh,
    language,
    editable: true,
    sendable,
    requiresReview,
    action,
    risk,
    allowsRealSend: false,
    agent,
  };
}

function hasChinese(text = '') {
  return /[\u3400-\u9fff]/.test(text);
}

function customerContent(template = {}) {
  return template.contentEn || template.content || '';
}

function referenceContent(template = {}) {
  return template.contentZh || template.content || '';
}

function applyReplyStyle(content, {
  replyStyle,
  variant,
  action,
  risk,
}) {
  const english = !hasChinese(content);

  if (replyStyle === 'conservative') {
    if (variant === 'conservative') return content;
    return [
      content,
      english
        ? 'To avoid inaccurate information, please use the above message only after checking it against the current email details.'
        : '为避免信息不准确，以上内容仍需按当前邮件信息核对后使用。',
    ].join('\n');
  }

  if (replyStyle === 'detailed' && action !== 'blocked' && risk !== 'high') {
    if (english && /share|order number|order email|photo|video|details|information/i.test(content)) return content;
    if (!english && /补充|截图|视频|订单号|下单邮箱/.test(content)) return content;
    return [
      content,
      english
        ? 'If possible, please share your order number, order email, or any relevant details so we can check this faster.'
        : '如方便，请补充订单号、下单邮箱或相关资料，便于我们更快核对。',
    ].join('\n');
  }

  return content;
}

export function buildReplyCandidates({
  template = null,
  action,
  risk,
  category = '',
  reason = '',
  agentConfig = {},
  customerLanguage = 'en',
} = {}) {
  const agent = buildAgentRuntimeContext(agentConfig);

  if (action === 'ignore' || risk === 'spam') {
    return [];
  }

  if (action === 'blocked' || risk === 'high') {
    return alignReplyCandidates([
      makeCandidate({
        candidateId: `BLOCKED-${category || 'HIGH'}-GUIDE-001`,
        label: '人工处理建议',
        variant: 'manual_guidance',
        content: applyReplyStyle([
          '该邮件已识别为高风险，请人工核对客户诉求、订单信息和平台规则后再回复。',
          '回复时不要直接承诺退款、赔偿、改价、发货时间或平台纠纷处理结果。',
        ].join('\n'), {
          replyStyle: agent.replyStyle,
          variant: 'manual_guidance',
          action,
          risk,
        }),
        contentZh: [
          '该邮件已识别为高风险，请人工核对客户诉求、订单信息和平台规则后再回复。',
          '回复时不要直接承诺退款、赔偿、改价、发货时间或平台纠纷处理结果。',
        ].join('\n'),
        action,
        risk,
        requiresReview: true,
        sendable: false,
        agent,
        language: 'zh',
      }),
      makeCandidate({
        candidateId: `BLOCKED-${category || 'HIGH'}-HOLD-002`,
        label: '安抚确认建议',
        variant: 'manual_hold',
        content: applyReplyStyle([
          'Hello, we have received your email.',
          'Because this request needs manual review, our support team will continue following up after confirming the relevant information.',
        ].join('\n'), {
          replyStyle: agent.replyStyle,
          variant: 'manual_hold',
          action,
          risk,
        }),
        contentZh: [
          '您好，我们已收到您的邮件。',
          '由于该问题需要人工核对，我们会在确认相关信息后再由客服继续跟进。',
        ].join('\n'),
        action,
        risk,
        requiresReview: true,
        sendable: false,
        agent,
        language: 'en',
      }),
    ], customerLanguage);
  }

  if (!template) return [];

  if (action === 'draft_only' || risk === 'medium') {
    return alignReplyCandidates([
      makeCandidate({
        candidateId: `${template.templateId}-CONSERVATIVE`,
        label: '保守版',
        variant: 'conservative',
        content: applyReplyStyle('Hello, we have received your email. To avoid inaccurate information, our support team will review it manually before replying.', {
          replyStyle: agent.replyStyle,
          variant: 'conservative',
          action,
          risk,
        }),
        contentZh: '您好，我们已收到您的邮件。为避免信息不准确，客服会人工核对后回复您。',
        action,
        risk,
        requiresReview: true,
        sendable: true,
        agent,
      }),
      makeCandidate({
        candidateId: `${template.templateId}-STANDARD`,
        label: '标准版',
        variant: 'standard',
        content: applyReplyStyle(customerContent(template), {
          replyStyle: agent.replyStyle,
          variant: 'standard',
          action,
          risk,
        }),
        contentZh: referenceContent(template),
        action,
        risk,
        requiresReview: true,
        sendable: true,
        agent,
      }),
      makeCandidate({
        candidateId: `${template.templateId}-DETAILED`,
        label: '详细版',
        variant: 'detailed',
        content: applyReplyStyle([
          customerContent(template),
          'If possible, please share your order number, order email, and any relevant screenshots or videos so our support team can check this faster.',
        ].join('\n'), {
          replyStyle: agent.replyStyle,
          variant: 'detailed',
          action,
          risk,
        }),
        contentZh: [
          referenceContent(template),
          '如方便，请补充订单号、下单邮箱、相关截图或视频，便于客服更快核对。',
        ].join('\n'),
        action,
        risk,
        requiresReview: true,
        sendable: true,
        agent,
      }),
    ], customerLanguage);
  }

  return alignReplyCandidates([
    makeCandidate({
      candidateId: `${template.templateId}-STANDARD`,
      label: '标准版',
      variant: 'standard',
      content: applyReplyStyle(customerContent(template), {
        replyStyle: agent.replyStyle,
        variant: 'standard',
        action,
        risk,
      }),
      contentZh: referenceContent(template),
      action,
      risk,
      requiresReview: false,
      sendable: true,
      agent,
    }),
  ], customerLanguage);
}

export function validateReplyTemplates(templates) {
  const issues = [];
  const ids = new Set();

  templates.forEach((template, index) => {
    const label = template.templateId || `第 ${index + 1} 条模板`;

    if (!template.templateId) issues.push(`${label} 缺少 templateId。`);
    if (ids.has(template.templateId)) issues.push(`${label} 的 templateId 重复。`);
    ids.add(template.templateId);

    if (!template.scene) issues.push(`${label} 缺少 scene。`);
    if (!template.content) issues.push(`${label} 缺少 content。`);
    if (!template.contentZh) issues.push(`${label} 缺少 contentZh。`);
    if (!template.contentEn) issues.push(`${label} 缺少 contentEn。`);
    if (!['low', 'medium'].includes(template.risk)) {
      issues.push(`${label} 的 risk 只能是 low 或 medium，高风险不提供可发送话术。`);
    }
    if (template.allowsRealSend !== false) {
      issues.push(`${label} 的 allowsRealSend 必须为 false。`);
    }
    if (template.action === 'draft_only' && template.requiresReview !== true) {
      issues.push(`${label} 是草稿模板，必须 requiresReview。`);
    }
    if (
      template.action === 'auto_reply' &&
      FORBIDDEN_AUTO_REPLY_PATTERNS.some((pattern) => pattern.test([
        template.content,
        template.contentZh,
        template.contentEn,
      ].filter(Boolean).join('\n')))
    ) {
      issues.push(`${label} 的自动回复内容包含禁用承诺表达。`);
    }
  });

  return issues;
}
