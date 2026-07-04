import { buildAgentRuntimeContext } from './agentConfig.js';

export const replyTemplates = [
  {
    templateId: 'TPL-RECEIVED-001',
    scene: '收到邮件确认',
    risk: 'low',
    action: 'auto_reply',
    content: '您好，请说明您需要我们协助处理的具体问题；如涉及订单，请一并提供订单号、下单邮箱或相关截图，便于准确定位。',
    contentZh: '您好，请说明您需要我们协助处理的具体问题；如涉及订单，请一并提供订单号、下单邮箱或相关截图，便于准确定位。',
    contentEn: 'Hello, please share the specific issue you need help with. If it is related to an order, please also include the order number, order email, or relevant screenshots so we can locate it accurately.',
    variables: ['orderId', 'buyerEmail', 'attachments'],
    requiresReview: false,
    allowsRealSend: false,
    selectionReason: '客户诉求较泛时，直接索要可用于处理的信息，不发送空确认。',
  },
  {
    templateId: 'TPL-ORDER-MISSING-001',
    scene: '要求补订单号',
    risk: 'low',
    action: 'auto_reply',
    content: '您好，为了更快帮您查询，请提供订单号或下单邮箱。我会据此定位订单，并确认下一步可处理事项。',
    contentZh: '您好，为了更快帮您查询，请提供订单号或下单邮箱。我会据此定位订单，并确认下一步可处理事项。',
    contentEn: 'Hello, to help us check this faster, please share your order number or the email address used for the order. We can use that information to locate the order and confirm the next available step.',
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
    content: '您好，为了更快定位订单，请补充下单邮箱或手机号；如果有订单号，也请一并提供。',
    contentZh: '您好，为了更快定位订单，请补充下单邮箱或手机号；如果有订单号，也请一并提供。',
    contentEn: 'Hello, to help us locate your order faster, please share the email address or phone number used for the order. If you also have the order number, please include it as well.',
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
    content: '您好，为了便于准确处理，请在本邮件中补充订单号、下单邮箱和具体诉求；如有截图或视频，也请一并发送。',
    contentZh: '您好，为了便于准确处理，请在本邮件中补充订单号、下单邮箱和具体诉求；如有截图或视频，也请一并发送。',
    contentEn: 'Hello, to help us handle this accurately, please reply with your order number, order email, and the specific issue. If you have screenshots or videos, please include them as well.',
    variables: ['orderId', 'buyerEmail', 'attachments'],
    requiresReview: false,
    allowsRealSend: false,
    selectionReason: '非工作时间也只索要处理所需信息，不发送等待人工的空回复。',
  },
  {
    templateId: 'TPL-GENERAL-INFO-001',
    scene: '普通资料或流程咨询',
    risk: 'low',
    action: 'auto_reply',
    content: '您好，请补充您想了解的具体问题；如涉及订单，请提供订单号或下单邮箱，便于准确查询。',
    contentZh: '您好，请补充您想了解的具体问题；如涉及订单，请提供订单号或下单邮箱，便于准确查询。',
    contentEn: 'Hello, please share the specific question you would like help with. If it is related to an order, please provide the order number or order email so we can check it accurately.',
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
    content: '您好，请提供订单号、下单邮箱或物流单号，我会根据这些信息查询当前物流状态。',
    contentZh: '您好，请提供订单号、下单邮箱或物流单号，我会根据这些信息查询当前物流状态。',
    contentEn: 'Hello, please share your order number, order email, or tracking number. We can use those details to check the current shipping status.',
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
    content: '您好，请补充订单号、下单邮箱和您想咨询或调整的尺码；如果是下单前咨询，请提供目标款式和身高体重信息。',
    contentZh: '您好，请补充订单号、下单邮箱和您想咨询或调整的尺码；如果是下单前咨询，请提供目标款式和身高体重信息。',
    contentEn: 'Hello, please share your order number, order email, and the size you want to confirm or adjust. If this is a pre-purchase size question, please include the target style and your height and weight.',
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
    content: '您好，请提供订单号或下单邮箱；如果您想确认发货、物流、修改或售后处理，也请说明具体事项。',
    contentZh: '您好，请提供订单号或下单邮箱；如果您想确认发货、物流、修改或售后处理，也请说明具体事项。',
    contentEn: 'Hello, please share your order number or order email. If you want to check shipping, delivery, order changes, or after-sales handling, please also describe the specific request.',
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
    content: '您好，请提供订单号、下单邮箱或物流单号；如果包裹长时间未更新，也请补充最后一次物流更新时间或截图。',
    contentZh: '您好，请提供订单号、下单邮箱或物流单号；如果包裹长时间未更新，也请补充最后一次物流更新时间或截图。',
    contentEn: 'Hello, please share your order number, order email, or tracking number. If the package has not updated for a long time, please also include the last tracking update time or a screenshot.',
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
    content: '您好，请提供订单号、问题照片或视频，并说明您希望我们协助处理的方式，例如换货、补寄配件或其他售后诉求。',
    contentZh: '您好，请提供订单号、问题照片或视频，并说明您希望我们协助处理的方式，例如换货、补寄配件或其他售后诉求。',
    contentEn: 'Hello, please share your order number, photos or videos of the issue, and the solution you are requesting, such as an exchange, replacement parts, or another after-sales request.',
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
    content: '您好，请补充合作账号、平台链接、粉丝画像、合作形式和报价区间，便于判断是否匹配当前合作需求。',
    contentZh: '您好，请补充合作账号、平台链接、粉丝画像、合作形式和报价区间，便于判断是否匹配当前合作需求。',
    contentEn: 'Hello, please share your collaboration account, platform link, audience profile, preferred collaboration format, and pricing range so we can check whether it matches our current collaboration needs.',
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
    content: '您好，为了准确处理，请补充您希望我们协助解决的具体问题；如涉及订单，请提供订单号、下单邮箱和相关截图。',
    contentZh: '您好，为了准确处理，请补充您希望我们协助解决的具体问题；如涉及订单，请提供订单号、下单邮箱和相关截图。',
    contentEn: 'Hello, to handle this accurately, please describe the specific issue you need help with. If it is related to an order, please include the order number, order email, and relevant screenshots.',
    variables: ['orderId', 'buyerEmail', 'attachments'],
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
    medium: 'Hola, para ayudarle con precision, comparta su numero de pedido, el correo usado en el pedido y el problema concreto que necesita resolver.',
    manualHold: 'Hola, esta solicitud requiere datos concretos antes de avanzar. Envie su numero de pedido, correo de pedido, fotos o videos relevantes y la solucion que espera.',
    detailedExtra: 'Si es posible, comparta su numero de pedido, correo de pedido y cualquier captura o video relevante para que podamos revisarlo mas rapido.',
  },
  fr: {
    low: 'Bonjour, merci de nous avoir contactes. Nous avons bien recu votre e-mail. Pour nous aider a verifier plus rapidement, veuillez partager votre numero de commande ou l e-mail utilise pour la commande si necessaire.',
    medium: 'Bonjour, pour vous aider avec precision, veuillez partager votre numero de commande, l e-mail de commande et le probleme exact a traiter.',
    manualHold: 'Bonjour, cette demande necessite des informations concretes avant toute action. Veuillez envoyer le numero de commande, l e-mail de commande, les photos ou videos utiles et la solution souhaitee.',
    detailedExtra: 'Si possible, veuillez partager votre numero de commande, l e-mail de commande et toute capture ou video pertinente afin que nous puissions verifier plus rapidement.',
  },
  de: {
    low: 'Hallo, vielen Dank fur Ihre Nachricht. Wir haben Ihre E-Mail erhalten. Damit wir dies schneller prufen konnen, senden Sie uns bitte bei Bedarf Ihre Bestellnummer oder die E-Mail-Adresse der Bestellung.',
    medium: 'Hallo, damit wir gezielt helfen konnen, senden Sie bitte Ihre Bestellnummer, die Bestell-E-Mail und das konkrete Anliegen.',
    manualHold: 'Hallo, fur diese Anfrage benotigen wir konkrete Angaben, bevor wir sie weiter bearbeiten konnen. Bitte senden Sie Bestellnummer, Bestell-E-Mail, relevante Fotos oder Videos und die gewunschte Losung.',
    detailedExtra: 'Wenn moglich, senden Sie bitte Ihre Bestellnummer, Bestell-E-Mail und relevante Screenshots oder Videos, damit wir dies schneller prufen konnen.',
  },
  pt: {
    low: 'Ola, obrigado por entrar em contato. Recebemos seu e-mail. Para ajudar a verificar mais rapido, envie o numero do pedido ou o e-mail usado no pedido, se aplicavel.',
    medium: 'Ola, para ajudar com precisao, envie o numero do pedido, o e-mail usado no pedido e o problema especifico que precisa resolver.',
    manualHold: 'Ola, esta solicitacao precisa de informacoes concretas antes de avancar. Envie o numero do pedido, e-mail do pedido, fotos ou videos relevantes e a solucao esperada.',
    detailedExtra: 'Se possivel, envie o numero do pedido, o e-mail do pedido e capturas ou videos relevantes para que possamos verificar mais rapido.',
  },
  it: {
    low: 'Ciao, grazie per averci contattato. Abbiamo ricevuto la tua e-mail. Per aiutarci a verificare piu rapidamente, condividi il numero dell ordine o l e-mail usata per l ordine se necessario.',
    medium: 'Ciao, per aiutarti con precisione, condividi il numero dell ordine, l e-mail usata per l ordine e il problema specifico da risolvere.',
    manualHold: 'Ciao, questa richiesta richiede informazioni concrete prima di procedere. Invia numero dell ordine, e-mail dell ordine, foto o video pertinenti e la soluzione che desideri.',
    detailedExtra: 'Se possibile, condividi il numero dell ordine, l e-mail dell ordine e screenshot o video pertinenti per permetterci di verificare piu rapidamente.',
  },
  nl: {
    low: 'Hallo, bedankt voor uw bericht. We hebben uw e-mail ontvangen. Deel indien nodig uw bestelnummer of het e-mailadres van de bestelling zodat we dit sneller kunnen controleren.',
    medium: 'Hallo, deel uw bestelnummer, bestel-e-mail en het specifieke probleem zodat we gericht kunnen helpen.',
    manualHold: 'Hallo, voor dit verzoek hebben we concrete informatie nodig voordat we verder kunnen. Deel bestelnummer, bestel-e-mail, relevante foto of video en de gewenste oplossing.',
    detailedExtra: 'Deel indien mogelijk uw bestelnummer, bestel-e-mail en relevante screenshots of video zodat we dit sneller kunnen controleren.',
  },
  tr: {
    low: 'Merhaba, bizimle iletisime gectiginiz icin tesekkurler. E-postanizi aldik. Daha hizli kontrol edebilmemiz icin gerekiyorsa siparis numaranizi veya sipariste kullanilan e-posta adresini paylasin.',
    medium: 'Merhaba, dogru yardim saglayabilmemiz icin siparis numaranizi, siparis e-postanizi ve cozulmesini istediginiz belirli sorunu paylasin.',
    manualHold: 'Merhaba, bu talep ilerlemeden once somut bilgi gerektiriyor. Siparis numarasi, siparis e-postasi, ilgili fotograf veya videolar ve beklediginiz cozum bilgisini gonderin.',
    detailedExtra: 'Mumkunse siparis numaranizi, siparis e-postanizi ve ilgili ekran goruntusu veya videolari paylasin.',
  },
  vi: {
    low: 'Xin chao, cam on ban da lien he. Chung toi da nhan duoc email cua ban. Neu can, vui long cung cap ma don hang hoac email dat hang de chung toi kiem tra nhanh hon.',
    medium: 'Xin chao, de ho tro chinh xac, vui long cung cap ma don hang, email dat hang va van de cu the ban can xu ly.',
    manualHold: 'Xin chao, yeu cau nay can thong tin cu the truoc khi tiep tuc. Vui long gui ma don hang, email dat hang, anh hoac video lien quan va phuong an ban mong muon.',
    detailedExtra: 'Neu co the, vui long cung cap ma don hang, email dat hang va anh chup man hinh hoac video lien quan de chung toi kiem tra nhanh hon.',
  },
  id: {
    low: 'Halo, terima kasih telah menghubungi kami. Kami telah menerima email Anda. Jika diperlukan, mohon bagikan nomor pesanan atau email yang digunakan untuk pesanan agar kami dapat memeriksanya lebih cepat.',
    medium: 'Halo, agar kami dapat membantu dengan tepat, mohon bagikan nomor pesanan, email pesanan, dan masalah spesifik yang perlu ditangani.',
    manualHold: 'Halo, permintaan ini membutuhkan informasi konkret sebelum dapat diproses. Mohon kirim nomor pesanan, email pesanan, foto atau video terkait, dan solusi yang Anda harapkan.',
    detailedExtra: 'Jika memungkinkan, bagikan nomor pesanan, email pesanan, serta tangkapan layar atau video yang relevan.',
  },
  ja: {
    low: 'こんにちは。お問い合わせありがとうございます。メールを受け取りました。確認を早めるため、必要に応じて注文番号または注文時のメールアドレスをお知らせください。',
    medium: 'こんにちは。正確に対応するため、注文番号、注文時のメールアドレス、解決したい具体的な内容をお知らせください。',
    manualHold: 'こんにちは。このご依頼を進めるには具体的な情報が必要です。注文番号、注文時のメールアドレス、関連する写真や動画、ご希望の対応内容をお送りください。',
    detailedExtra: '可能であれば、注文番号、注文時のメールアドレス、関連するスクリーンショットや動画をお送りください。',
  },
  ko: {
    low: '안녕하세요. 문의해 주셔서 감사합니다. 이메일을 받았습니다. 더 빠른 확인을 위해 필요한 경우 주문 번호 또는 주문 시 사용한 이메일을 알려 주세요.',
    medium: '안녕하세요. 정확한 처리를 위해 주문 번호, 주문 이메일, 해결이 필요한 구체적인 문제를 알려 주세요.',
    manualHold: '안녕하세요. 이 요청을 진행하려면 구체적인 정보가 필요합니다. 주문 번호, 주문 이메일, 관련 사진 또는 영상, 원하시는 해결 방안을 보내 주세요.',
    detailedExtra: '가능하다면 주문 번호, 주문 이메일, 관련 스크린샷 또는 영상을 보내 주세요.',
  },
  ru: {
    low: 'Здравствуйте, спасибо за обращение. Мы получили ваше письмо. Чтобы быстрее проверить запрос, при необходимости пришлите номер заказа или адрес электронной почты, использованный при оформлении заказа.',
    medium: 'Здравствуйте, чтобы помочь точно, пришлите номер заказа, почту заказа и конкретную проблему, которую нужно решить.',
    manualHold: 'Здравствуйте, для обработки этого запроса нужны конкретные данные. Пришлите номер заказа, почту заказа, соответствующие фото или видео и желаемое решение.',
    detailedExtra: 'Если возможно, пришлите номер заказа, почту заказа и соответствующие скриншоты или видео.',
  },
  ar: {
    low: 'مرحبا، شكرا لتواصلك معنا. لقد استلمنا بريدك الإلكتروني. لمساعدتنا على التحقق بسرعة أكبر، يرجى مشاركة رقم الطلب أو البريد المستخدم في الطلب عند الحاجة.',
    medium: 'مرحبا، لمساعدتك بدقة، يرجى إرسال رقم الطلب والبريد المستخدم في الطلب والمشكلة المحددة التي تريد حلها.',
    manualHold: 'مرحبا، يحتاج هذا الطلب إلى معلومات واضحة قبل المتابعة. يرجى إرسال رقم الطلب وبريد الطلب وأي صور أو مقاطع فيديو ذات صلة والحل المطلوب.',
    detailedExtra: 'إذا أمكن، يرجى مشاركة رقم الطلب وبريد الطلب وأي لقطات شاشة أو مقاطع فيديو ذات صلة.',
  },
  he: {
    low: 'שלום, תודה שפנית אלינו. קיבלנו את האימייל שלך. כדי שנוכל לבדוק מהר יותר, יש לשתף מספר הזמנה או את האימייל ששימש להזמנה במידת הצורך.',
    medium: 'שלום, כדי שנוכל לעזור במדויק, יש לשתף מספר הזמנה, אימייל הזמנה ואת הבעיה הספציפית שצריך לפתור.',
    manualHold: 'שלום, כדי להתקדם עם הבקשה צריך מידע קונקרטי. יש לשלוח מספר הזמנה, אימייל הזמנה, תמונות או סרטונים רלוונטיים והפתרון המבוקש.',
    detailedExtra: 'אם אפשר, יש לשתף מספר הזמנה, אימייל הזמנה וצילומי מסך או סרטונים רלוונטיים.',
  },
  hi: {
    low: 'नमस्ते, संपर्क करने के लिए धन्यवाद। हमें आपका ईमेल मिल गया है। तेजी से जांच करने के लिए, कृपया जरूरत होने पर अपना ऑर्डर नंबर या ऑर्डर में इस्तेमाल ईमेल साझा करें।',
    medium: 'नमस्ते, सही सहायता के लिए कृपया अपना ऑर्डर नंबर, ऑर्डर ईमेल और वह खास समस्या साझा करें जिसे हल करना है।',
    manualHold: 'नमस्ते, इस अनुरोध पर आगे बढ़ने से पहले ठोस जानकारी चाहिए। कृपया ऑर्डर नंबर, ऑर्डर ईमेल, संबंधित फोटो या वीडियो और अपेक्षित समाधान साझा करें।',
    detailedExtra: 'यदि संभव हो, तो कृपया ऑर्डर नंबर, ऑर्डर ईमेल और संबंधित स्क्रीनशॉट या वीडियो साझा करें।',
  },
  th: {
    low: 'สวัสดี ขอบคุณที่ติดต่อเรา เราได้รับอีเมลของคุณแล้ว หากจำเป็น โปรดแจ้งหมายเลขคำสั่งซื้อหรืออีเมลที่ใช้สั่งซื้อเพื่อให้เราตรวจสอบได้เร็วขึ้น',
    medium: 'สวัสดี เพื่อให้ช่วยได้อย่างถูกต้อง โปรดแจ้งหมายเลขคำสั่งซื้อ อีเมลที่ใช้สั่งซื้อ และปัญหาเฉพาะที่ต้องการให้ช่วย',
    manualHold: 'สวัสดี คำขอนี้ต้องใช้ข้อมูลที่ชัดเจนก่อนดำเนินการต่อ โปรดส่งหมายเลขคำสั่งซื้อ อีเมลคำสั่งซื้อ รูปภาพหรือวิดีโอที่เกี่ยวข้อง และวิธีแก้ไขที่ต้องการ',
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
        ? 'If any key details are missing, please ask the customer for the order number, order email, and relevant screenshots before making a final decision.'
        : '如关键信息缺失，请先向客户补充索要订单号、下单邮箱和相关截图，再给出最终处理结论。',
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
        label: '客户沟通要点',
        variant: 'internal_suggestion',
        content: applyReplyStyle([
          '内部要点：先确认客户具体诉求、订单号、下单邮箱、问题照片或视频。',
          '如果信息缺失，可人工改写为索要信息的回复；不要发送“已收到，等人工回复”这类空确认。',
        ].join('\n'), {
          replyStyle: agent.replyStyle,
          variant: 'internal_suggestion',
          action,
          risk,
        }),
        contentZh: [
          '内部要点：先确认客户具体诉求、订单号、下单邮箱、问题照片或视频。',
          '如果信息缺失，可人工改写为索要信息的回复；不要发送“已收到，等人工回复”这类空确认。',
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
        content: applyReplyStyle('Hello, to handle this accurately, please share your order number or order email, the specific issue you need help with, and any relevant screenshots or videos.', {
          replyStyle: agent.replyStyle,
          variant: 'conservative',
          action,
          risk,
        }),
        contentZh: '您好，为了准确处理，请补充订单号或下单邮箱、您需要协助解决的具体问题，以及相关截图或视频。',
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
          'If possible, please share your order number, order email, and any relevant screenshots or videos so we can check this faster.',
        ].join('\n'), {
          replyStyle: agent.replyStyle,
          variant: 'detailed',
          action,
          risk,
        }),
        contentZh: [
          referenceContent(template),
          '如方便，请补充订单号、下单邮箱、相关截图或视频，便于更快核对。',
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
