import { buildAgentRuntimeContext } from './agentConfig.js';
import {
  buildReplyContext,
  customerSharedInfoSummary,
} from './replyContext.js';

export const replyTemplates = [
  {
    templateId: 'TPL-RECEIVED-001',
    scene: '收到邮件确认',
    risk: 'low',
    action: 'auto_reply',
    content: '您好，麻烦您具体说一下需要我这边协助处理的问题。如果和订单有关，也请把订单号、下单邮箱或相关截图一起发我，方便准确定位。',
    contentZh: '您好，麻烦您具体说一下需要我这边协助处理的问题。如果和订单有关，也请把订单号、下单邮箱或相关截图一起发我，方便准确定位。',
    contentEn: 'Hello, could you please tell me a little more about the issue you need help with? If it is related to an order, please also send the order number, order email, or relevant screenshots so I can locate it accurately.',
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
    content: '您好，麻烦您发一下订单号或下单邮箱，我这边好先定位到对应订单，再确认下一步可以怎么处理。',
    contentZh: '您好，麻烦您发一下订单号或下单邮箱，我这边好先定位到对应订单，再确认下一步可以怎么处理。',
    contentEn: 'Hello, could you please send your order number or the email address used for the order? That will help me locate the order first and then confirm the next available step.',
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
    content: '您好，麻烦您发一下下单邮箱或手机号；如果手边有订单号，也可以一起发我，我这边会更快定位。',
    contentZh: '您好，麻烦您发一下下单邮箱或手机号；如果手边有订单号，也可以一起发我，我这边会更快定位。',
    contentEn: 'Hello, could you please send the email address or phone number used for the order? If you also have the order number, please include it as well so I can locate it faster.',
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
    content: '您好，麻烦您把订单号、下单邮箱和想处理的具体问题发在这封邮件里；如果有截图或视频，也可以一起发我，方便后续核对。',
    contentZh: '您好，麻烦您把订单号、下单邮箱和想处理的具体问题发在这封邮件里；如果有截图或视频，也可以一起发我，方便后续核对。',
    contentEn: 'Hello, could you please reply with your order number, order email, and the exact issue you would like help with? If you have screenshots or videos, feel free to include them so I can check everything together.',
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
    content: '您好，麻烦您再具体说明一下想了解的问题。如果和订单有关，也请把订单号或下单邮箱一起发我，方便准确查询。',
    contentZh: '您好，麻烦您再具体说明一下想了解的问题。如果和订单有关，也请把订单号或下单邮箱一起发我，方便准确查询。',
    contentEn: 'Hello, could you please share a little more detail about your question? If it is related to an order, please also send the order number or order email so I can check it accurately.',
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
    content: '您好，麻烦您发一下订单号、下单邮箱或物流单号，我这边会按这些信息查询当前物流状态。',
    contentZh: '您好，麻烦您发一下订单号、下单邮箱或物流单号，我这边会按这些信息查询当前物流状态。',
    contentEn: 'Hello, could you please send your order number, order email, or tracking number? I can use those details to check the current shipping status.',
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
    content: '您好，麻烦您发一下订单号、下单邮箱，以及想咨询或调整的尺码。如果是下单前咨询，也可以把目标款式和身高体重信息发我。',
    contentZh: '您好，麻烦您发一下订单号、下单邮箱，以及想咨询或调整的尺码。如果是下单前咨询，也可以把目标款式和身高体重信息发我。',
    contentEn: 'Hello, could you please send your order number, order email, and the size you want to confirm or adjust? If this is a pre-purchase size question, you can also send the target style plus your height and weight.',
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
    content: '您好，麻烦您发一下订单号或下单邮箱。如果您想确认发货、物流、订单修改或售后处理，也麻烦顺手说明一下具体事项。',
    contentZh: '您好，麻烦您发一下订单号或下单邮箱。如果您想确认发货、物流、订单修改或售后处理，也麻烦顺手说明一下具体事项。',
    contentEn: 'Hello, could you please send your order number or order email? If you want to check shipping, delivery, order changes, or after-sales handling, please also tell me the specific request.',
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
    content: '您好，麻烦您发一下订单号、下单邮箱或物流单号。如果包裹已经很久没更新，也可以把最后一次物流更新时间或截图一起发我，我这边方便对照。',
    contentZh: '您好，麻烦您发一下订单号、下单邮箱或物流单号。如果包裹已经很久没更新，也可以把最后一次物流更新时间或截图一起发我，我这边方便对照。',
    contentEn: 'Hello, could you please send your order number, order email, or tracking number? If the package has not updated for a while, you can also send the last tracking update time or a screenshot so I can compare the details.',
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
    content: '您好，麻烦您发一下订单号和能展示问题的照片或视频，也请告诉我您希望怎么处理，比如换货、补寄配件或其他售后诉求。',
    contentZh: '您好，麻烦您发一下订单号和能展示问题的照片或视频，也请告诉我您希望怎么处理，比如换货、补寄配件或其他售后诉求。',
    contentEn: 'Hello, could you please send your order number and photos or videos showing the issue? Please also let me know what kind of solution you are hoping for, such as an exchange, replacement parts, or another after-sales request.',
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
    content: '您好，麻烦您发一下合作账号、平台链接、粉丝画像、合作形式和报价区间，我这边方便判断是否匹配当前合作需求。',
    contentZh: '您好，麻烦您发一下合作账号、平台链接、粉丝画像、合作形式和报价区间，我这边方便判断是否匹配当前合作需求。',
    contentEn: 'Hello, could you please send your collaboration account, platform link, audience profile, preferred collaboration format, and pricing range? That will help me check whether it matches our current collaboration needs.',
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
    content: '您好，麻烦您再具体说一下希望我这边协助解决什么问题。如果和订单有关，也请把订单号、下单邮箱和相关截图一起发我。',
    contentZh: '您好，麻烦您再具体说一下希望我这边协助解决什么问题。如果和订单有关，也请把订单号、下单邮箱和相关截图一起发我。',
    contentEn: 'Hello, could you please tell me more specifically what you need help with? If it is related to an order, please also send the order number, order email, and any relevant screenshots.',
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
    providedInfo: 'Hola, veo que ya compartio la informacion del pedido. Indique tambien el problema concreto y, si tiene capturas, fotos o videos relevantes, envielos para poder revisar todo junto.',
    providedIssue: 'Hola, veo que ya compartio la informacion del pedido y explico que el producto o paquete llego danado. Tambien entiendo que desea devolverlo o cambiarlo. Si tiene fotos, videos, capturas o mensajes de la plataforma que muestren el problema, envielos para poder revisar todo junto.',
    medium: 'Hola, para ayudarle con precision, comparta su numero de pedido, el correo usado en el pedido y el problema concreto que necesita resolver.',
    manualHold: 'Hola, esta solicitud requiere datos concretos antes de avanzar. Envie su numero de pedido, correo de pedido, fotos o videos relevantes y la solucion que espera.',
    detailedExtra: 'Si es posible, comparta su numero de pedido, correo de pedido y cualquier captura o video relevante para que podamos revisarlo mas rapido.',
  },
  fr: {
    low: 'Bonjour, merci de nous avoir contactes. Nous avons bien recu votre e-mail. Pour nous aider a verifier plus rapidement, veuillez partager votre numero de commande ou l e-mail utilise pour la commande si necessaire.',
    providedInfo: 'Bonjour, je vois que vous avez deja partage les informations de commande. Veuillez aussi preciser le probleme exact et envoyer toute capture, photo ou video utile afin que je puisse tout verifier ensemble.',
    providedIssue: 'Bonjour, je vois que vous avez deja partage les informations de commande et indique que le produit ou le colis est arrive endommage. Je comprends aussi que vous souhaitez un retour ou un echange. Si vous avez des photos, videos, captures ou messages de plateforme montrant le probleme, envoyez-les afin que je puisse tout verifier ensemble.',
    medium: 'Bonjour, pour vous aider avec precision, veuillez partager votre numero de commande, l e-mail de commande et le probleme exact a traiter.',
    manualHold: 'Bonjour, cette demande necessite des informations concretes avant toute action. Veuillez envoyer le numero de commande, l e-mail de commande, les photos ou videos utiles et la solution souhaitee.',
    detailedExtra: 'Si possible, veuillez partager votre numero de commande, l e-mail de commande et toute capture ou video pertinente afin que nous puissions verifier plus rapidement.',
  },
  de: {
    low: 'Hallo, vielen Dank fur Ihre Nachricht. Wir haben Ihre E-Mail erhalten. Damit wir dies schneller prufen konnen, senden Sie uns bitte bei Bedarf Ihre Bestellnummer oder die E-Mail-Adresse der Bestellung.',
    providedInfo: 'Hallo, ich sehe, dass Sie die Bestellinformationen bereits gesendet haben. Bitte beschreiben Sie auch das genaue Anliegen und senden Sie bei Bedarf relevante Screenshots, Fotos oder Videos, damit ich alles zusammen prufen kann.',
    providedIssue: 'Hallo, ich sehe, dass Sie die Bestellinformationen bereits gesendet und beschrieben haben, dass das Produkt oder Paket beschadigt angekommen ist. Ich verstehe auch, dass Sie eine Ruckgabe oder einen Umtausch wunschen. Wenn Sie Fotos, Videos, Screenshots oder Plattformnachrichten zum Problem haben, senden Sie diese bitte mit, damit ich alles zusammen prufen kann.',
    medium: 'Hallo, damit wir gezielt helfen konnen, senden Sie bitte Ihre Bestellnummer, die Bestell-E-Mail und das konkrete Anliegen.',
    manualHold: 'Hallo, fur diese Anfrage benotigen wir konkrete Angaben, bevor wir sie weiter bearbeiten konnen. Bitte senden Sie Bestellnummer, Bestell-E-Mail, relevante Fotos oder Videos und die gewunschte Losung.',
    detailedExtra: 'Wenn moglich, senden Sie bitte Ihre Bestellnummer, Bestell-E-Mail und relevante Screenshots oder Videos, damit wir dies schneller prufen konnen.',
  },
  pt: {
    low: 'Ola, obrigado por entrar em contato. Recebemos seu e-mail. Para ajudar a verificar mais rapido, envie o numero do pedido ou o e-mail usado no pedido, se aplicavel.',
    providedInfo: 'Ola, vi que voce ja enviou as informacoes do pedido. Por favor, explique tambem o problema especifico e envie capturas, fotos ou videos relevantes, se tiver, para que eu possa conferir tudo junto.',
    providedIssue: 'Ola, vi que voce ja enviou as informacoes do pedido e informou que o produto ou pacote chegou danificado. Tambem entendi que deseja devolucao ou troca. Se tiver fotos, videos, capturas ou mensagens da plataforma mostrando o problema, envie para eu conferir tudo junto.',
    medium: 'Ola, para ajudar com precisao, envie o numero do pedido, o e-mail usado no pedido e o problema especifico que precisa resolver.',
    manualHold: 'Ola, esta solicitacao precisa de informacoes concretas antes de avancar. Envie o numero do pedido, e-mail do pedido, fotos ou videos relevantes e a solucao esperada.',
    detailedExtra: 'Se possivel, envie o numero do pedido, o e-mail do pedido e capturas ou videos relevantes para que possamos verificar mais rapido.',
  },
  it: {
    low: 'Ciao, grazie per averci contattato. Abbiamo ricevuto la tua e-mail. Per aiutarci a verificare piu rapidamente, condividi il numero dell ordine o l e-mail usata per l ordine se necessario.',
    providedInfo: 'Ciao, vedo che hai gia condiviso le informazioni dell ordine. Indicami anche il problema specifico e, se hai screenshot, foto o video pertinenti, inviali cosi posso controllare tutto insieme.',
    providedIssue: 'Ciao, vedo che hai gia condiviso le informazioni dell ordine e indicato che il prodotto o il pacco e arrivato danneggiato. Ho capito anche che desideri un reso o un cambio. Se hai foto, video, screenshot o messaggi della piattaforma che mostrano il problema, inviali cosi posso controllare tutto insieme.',
    medium: 'Ciao, per aiutarti con precisione, condividi il numero dell ordine, l e-mail usata per l ordine e il problema specifico da risolvere.',
    manualHold: 'Ciao, questa richiesta richiede informazioni concrete prima di procedere. Invia numero dell ordine, e-mail dell ordine, foto o video pertinenti e la soluzione che desideri.',
    detailedExtra: 'Se possibile, condividi il numero dell ordine, l e-mail dell ordine e screenshot o video pertinenti per permetterci di verificare piu rapidamente.',
  },
  nl: {
    low: 'Hallo, bedankt voor uw bericht. We hebben uw e-mail ontvangen. Deel indien nodig uw bestelnummer of het e-mailadres van de bestelling zodat we dit sneller kunnen controleren.',
    providedInfo: 'Hallo, ik zie dat u de bestelgegevens al hebt gedeeld. Beschrijf ook het specifieke probleem en stuur eventuele relevante screenshots, fotos of videos mee, zodat ik alles samen kan controleren.',
    providedIssue: 'Hallo, ik zie dat u de bestelgegevens al hebt gedeeld en hebt aangegeven dat het product of pakket beschadigd is aangekomen. Ik begrijp ook dat u het wilt retourneren of ruilen. Als u fotos, videos, screenshots of platformberichten hebt die het probleem tonen, stuur die dan mee zodat ik alles samen kan controleren.',
    medium: 'Hallo, deel uw bestelnummer, bestel-e-mail en het specifieke probleem zodat we gericht kunnen helpen.',
    manualHold: 'Hallo, voor dit verzoek hebben we concrete informatie nodig voordat we verder kunnen. Deel bestelnummer, bestel-e-mail, relevante foto of video en de gewenste oplossing.',
    detailedExtra: 'Deel indien mogelijk uw bestelnummer, bestel-e-mail en relevante screenshots of video zodat we dit sneller kunnen controleren.',
  },
  tr: {
    low: 'Merhaba, bizimle iletisime gectiginiz icin tesekkurler. E-postanizi aldik. Daha hizli kontrol edebilmemiz icin gerekiyorsa siparis numaranizi veya sipariste kullanilan e-posta adresini paylasin.',
    providedInfo: 'Merhaba, siparis bilgilerini zaten paylastiginizi goruyorum. Lutfen cozulmesini istediginiz belirli sorunu da yazin; varsa ilgili ekran goruntusu, fotograf veya videolari da gonderin, birlikte kontrol edebileyim.',
    providedIssue: 'Merhaba, siparis bilgilerini zaten paylastiginizi ve urunun ya da paketin hasarli geldigini belirttiginizi goruyorum. Iade veya degisim istediginizi de anladim. Sorunu gosteren fotograf, video, ekran goruntusu veya platform mesaji varsa gonderin; hepsini birlikte kontrol edeyim.',
    medium: 'Merhaba, dogru yardim saglayabilmemiz icin siparis numaranizi, siparis e-postanizi ve cozulmesini istediginiz belirli sorunu paylasin.',
    manualHold: 'Merhaba, bu talep ilerlemeden once somut bilgi gerektiriyor. Siparis numarasi, siparis e-postasi, ilgili fotograf veya videolar ve beklediginiz cozum bilgisini gonderin.',
    detailedExtra: 'Mumkunse siparis numaranizi, siparis e-postanizi ve ilgili ekran goruntusu veya videolari paylasin.',
  },
  vi: {
    low: 'Xin chao, cam on ban da lien he. Chung toi da nhan duoc email cua ban. Neu can, vui long cung cap ma don hang hoac email dat hang de chung toi kiem tra nhanh hon.',
    providedInfo: 'Xin chao, minh thay ban da cung cap thong tin don hang. Vui long noi ro van de can ho tro va gui them anh chup man hinh, hinh anh hoac video lien quan neu co de minh kiem tra chung.',
    providedIssue: 'Xin chao, minh thay ban da cung cap thong tin don hang va cho biet san pham hoac goi hang bi hu hong khi nhan. Minh cung hieu ban muon tra hang hoac doi hang. Neu co hinh anh, video, anh chup man hinh hoac tin nhan nen tang the hien van de, ban gui them de minh kiem tra chung.',
    medium: 'Xin chao, de ho tro chinh xac, vui long cung cap ma don hang, email dat hang va van de cu the ban can xu ly.',
    manualHold: 'Xin chao, yeu cau nay can thong tin cu the truoc khi tiep tuc. Vui long gui ma don hang, email dat hang, anh hoac video lien quan va phuong an ban mong muon.',
    detailedExtra: 'Neu co the, vui long cung cap ma don hang, email dat hang va anh chup man hinh hoac video lien quan de chung toi kiem tra nhanh hon.',
  },
  id: {
    low: 'Halo, terima kasih telah menghubungi kami. Kami telah menerima email Anda. Jika diperlukan, mohon bagikan nomor pesanan atau email yang digunakan untuk pesanan agar kami dapat memeriksanya lebih cepat.',
    providedInfo: 'Halo, saya melihat Anda sudah membagikan informasi pesanan. Mohon jelaskan juga masalah spesifiknya, dan kirim tangkapan layar, foto, atau video terkait jika ada agar saya dapat memeriksanya bersama.',
    providedIssue: 'Halo, saya melihat Anda sudah membagikan informasi pesanan dan menjelaskan bahwa produk atau paket tiba dalam kondisi rusak. Saya juga memahami Anda ingin mengembalikan atau menukar produk. Jika ada foto, video, tangkapan layar, atau pesan platform yang menunjukkan masalahnya, silakan kirim agar saya dapat memeriksanya bersama.',
    medium: 'Halo, agar kami dapat membantu dengan tepat, mohon bagikan nomor pesanan, email pesanan, dan masalah spesifik yang perlu ditangani.',
    manualHold: 'Halo, permintaan ini membutuhkan informasi konkret sebelum dapat diproses. Mohon kirim nomor pesanan, email pesanan, foto atau video terkait, dan solusi yang Anda harapkan.',
    detailedExtra: 'Jika memungkinkan, bagikan nomor pesanan, email pesanan, serta tangkapan layar atau video yang relevan.',
  },
  ja: {
    low: 'こんにちは。お問い合わせありがとうございます。メールを受け取りました。確認を早めるため、必要に応じて注文番号または注文時のメールアドレスをお知らせください。',
    providedInfo: 'こんにちは。注文情報はすでに共有いただいているようです。あわせて、具体的にお困りの内容と、関連するスクリーンショットや写真・動画があればお送りください。こちらでまとめて確認します。',
    providedIssue: 'こんにちは。注文情報はすでに共有いただいており、商品または荷物が破損して届いたこと、返品または交換をご希望であることも確認しました。問題が分かる写真、動画、スクリーンショット、またはプラットフォーム上のメッセージがあれば、あわせてお送りください。こちらでまとめて確認します。',
    medium: 'こんにちは。正確に対応するため、注文番号、注文時のメールアドレス、解決したい具体的な内容をお知らせください。',
    manualHold: 'こんにちは。このご依頼を進めるには具体的な情報が必要です。注文番号、注文時のメールアドレス、関連する写真や動画、ご希望の対応内容をお送りください。',
    detailedExtra: '可能であれば、注文番号、注文時のメールアドレス、関連するスクリーンショットや動画をお送りください。',
  },
  ko: {
    low: '안녕하세요. 문의해 주셔서 감사합니다. 이메일을 받았습니다. 더 빠른 확인을 위해 필요한 경우 주문 번호 또는 주문 시 사용한 이메일을 알려 주세요.',
    providedInfo: '안녕하세요. 주문 정보는 이미 공유해 주신 것으로 확인됩니다. 추가로 어떤 문제를 해결하고 싶으신지 구체적으로 알려 주시고, 관련 스크린샷이나 사진, 영상이 있다면 함께 보내 주세요.',
    medium: '안녕하세요. 정확한 처리를 위해 주문 번호, 주문 이메일, 해결이 필요한 구체적인 문제를 알려 주세요.',
    manualHold: '안녕하세요. 이 요청을 진행하려면 구체적인 정보가 필요합니다. 주문 번호, 주문 이메일, 관련 사진 또는 영상, 원하시는 해결 방안을 보내 주세요.',
    detailedExtra: '가능하다면 주문 번호, 주문 이메일, 관련 스크린샷 또는 영상을 보내 주세요.',
  },
  ru: {
    low: 'Здравствуйте, спасибо за обращение. Мы получили ваше письмо. Чтобы быстрее проверить запрос, при необходимости пришлите номер заказа или адрес электронной почты, использованный при оформлении заказа.',
    providedInfo: 'Здравствуйте, вижу, что вы уже прислали данные заказа. Пожалуйста, также уточните конкретную проблему и при наличии отправьте скриншоты, фото или видео, чтобы я мог проверить все вместе.',
    medium: 'Здравствуйте, чтобы помочь точно, пришлите номер заказа, почту заказа и конкретную проблему, которую нужно решить.',
    manualHold: 'Здравствуйте, для обработки этого запроса нужны конкретные данные. Пришлите номер заказа, почту заказа, соответствующие фото или видео и желаемое решение.',
    detailedExtra: 'Если возможно, пришлите номер заказа, почту заказа и соответствующие скриншоты или видео.',
  },
  ar: {
    low: 'مرحبا، شكرا لتواصلك معنا. لقد استلمنا بريدك الإلكتروني. لمساعدتنا على التحقق بسرعة أكبر، يرجى مشاركة رقم الطلب أو البريد المستخدم في الطلب عند الحاجة.',
    providedInfo: 'مرحبا، أرى أنك شاركت معلومات الطلب بالفعل. يرجى توضيح المشكلة المحددة أيضا، وإذا كانت لديك لقطات شاشة أو صور أو مقاطع فيديو ذات صلة فأرسلها حتى أتمكن من مراجعة التفاصيل معا.',
    medium: 'مرحبا، لمساعدتك بدقة، يرجى إرسال رقم الطلب والبريد المستخدم في الطلب والمشكلة المحددة التي تريد حلها.',
    manualHold: 'مرحبا، يحتاج هذا الطلب إلى معلومات واضحة قبل المتابعة. يرجى إرسال رقم الطلب وبريد الطلب وأي صور أو مقاطع فيديو ذات صلة والحل المطلوب.',
    detailedExtra: 'إذا أمكن، يرجى مشاركة رقم الطلب وبريد الطلب وأي لقطات شاشة أو مقاطع فيديو ذات صلة.',
  },
  he: {
    low: 'שלום, תודה שפנית אלינו. קיבלנו את האימייל שלך. כדי שנוכל לבדוק מהר יותר, יש לשתף מספר הזמנה או את האימייל ששימש להזמנה במידת הצורך.',
    providedInfo: 'שלום, אני רואה שכבר שיתפת את פרטי ההזמנה. נא לציין גם את הבעיה המדויקת, ואם יש צילומי מסך, תמונות או סרטונים רלוונטיים, אפשר לשלוח אותם כדי שאוכל לבדוק הכול יחד.',
    medium: 'שלום, כדי שנוכל לעזור במדויק, יש לשתף מספר הזמנה, אימייל הזמנה ואת הבעיה הספציפית שצריך לפתור.',
    manualHold: 'שלום, כדי להתקדם עם הבקשה צריך מידע קונקרטי. יש לשלוח מספר הזמנה, אימייל הזמנה, תמונות או סרטונים רלוונטיים והפתרון המבוקש.',
    detailedExtra: 'אם אפשר, יש לשתף מספר הזמנה, אימייל הזמנה וצילומי מסך או סרטונים רלוונטיים.',
  },
  hi: {
    low: 'नमस्ते, संपर्क करने के लिए धन्यवाद। हमें आपका ईमेल मिल गया है। तेजी से जांच करने के लिए, कृपया जरूरत होने पर अपना ऑर्डर नंबर या ऑर्डर में इस्तेमाल ईमेल साझा करें।',
    providedInfo: 'नमस्ते, मैं देख पा रहा हूं कि आपने ऑर्डर जानकारी पहले ही साझा कर दी है। कृपया यह भी बताएं कि आपको किस खास समस्या में सहायता चाहिए, और यदि संबंधित फोटो, वीडियो या स्क्रीनशॉट हों तो उन्हें भी भेज दें।',
    medium: 'नमस्ते, सही सहायता के लिए कृपया अपना ऑर्डर नंबर, ऑर्डर ईमेल और वह खास समस्या साझा करें जिसे हल करना है।',
    manualHold: 'नमस्ते, इस अनुरोध पर आगे बढ़ने से पहले ठोस जानकारी चाहिए। कृपया ऑर्डर नंबर, ऑर्डर ईमेल, संबंधित फोटो या वीडियो और अपेक्षित समाधान साझा करें।',
    detailedExtra: 'यदि संभव हो, तो कृपया ऑर्डर नंबर, ऑर्डर ईमेल और संबंधित स्क्रीनशॉट या वीडियो साझा करें।',
  },
  th: {
    low: 'สวัสดี ขอบคุณที่ติดต่อเรา เราได้รับอีเมลของคุณแล้ว หากจำเป็น โปรดแจ้งหมายเลขคำสั่งซื้อหรืออีเมลที่ใช้สั่งซื้อเพื่อให้เราตรวจสอบได้เร็วขึ้น',
    providedInfo: 'สวัสดี ฉันเห็นว่าคุณได้แจ้งข้อมูลคำสั่งซื้อแล้ว กรุณาอธิบายปัญหาที่ต้องการให้ช่วยเพิ่มเติม และหากมีภาพหน้าจอ รูปภาพ หรือวิดีโอที่เกี่ยวข้อง สามารถส่งมาด้วยได้เพื่อให้ตรวจสอบพร้อมกัน',
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
  if (candidate.replyContext?.hasComponentIssue) {
    const componentIssue = localizedComponentIssuePhrase(candidate.replyContext, languageCode);
    if (componentIssue) return componentIssue;
  }
  if (candidate.replyContext?.hasActionableIssueFacts && phrases.providedIssue) {
    return phrases.providedIssue;
  }
  if (candidate.replyContext?.hasAnyIdentifier && phrases.providedInfo) {
    return phrases.providedInfo;
  }
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

function localizedComponentIssuePhrase(replyContext = {}, languageCode = 'en') {
  const hasStrap = (replyContext.customerFacts?.issueComponents || []).includes('表带');
  const component = hasStrap ? 'strap' : 'part';
  const messages = {
    en: `Hello, I can see you already shared the order information and mentioned that the ${component === 'strap' ? 'watch strap/band' : 'product part'} is broken or damaged. If you have photos, videos, screenshots, or platform messages showing this issue, feel free to send them too so I can review everything together.`,
    es: `Hola, veo que ya compartio la informacion del pedido y explico que ${component === 'strap' ? 'la correa del reloj' : 'la pieza del producto'} esta rota o danada. Si tiene fotos, videos, capturas o mensajes de la plataforma que muestren el problema, envielos para poder revisar todo junto.`,
    fr: `Bonjour, je vois que vous avez deja partage les informations de commande et indique que ${component === 'strap' ? 'le bracelet de la montre' : 'la piece du produit'} est casse ou endommage. Si vous avez des photos, videos, captures ou messages de plateforme montrant le probleme, envoyez-les afin que je puisse tout verifier ensemble.`,
    de: `Hallo, ich sehe, dass Sie die Bestellinformationen bereits gesendet und beschrieben haben, dass ${component === 'strap' ? 'das Uhrenarmband' : 'das Produktteil'} gebrochen oder beschadigt ist. Wenn Sie Fotos, Videos, Screenshots oder Plattformnachrichten zum Problem haben, senden Sie diese bitte mit, damit ich alles zusammen prufen kann.`,
    pt: `Ola, vi que voce ja enviou as informacoes do pedido e informou que ${component === 'strap' ? 'a pulseira do relogio' : 'a peca do produto'} quebrou ou esta danificada. Se tiver fotos, videos, capturas ou mensagens da plataforma mostrando o problema, envie para eu conferir tudo junto.`,
    it: `Ciao, vedo che hai gia condiviso le informazioni dell ordine e indicato che ${component === 'strap' ? 'il cinturino dell orologio' : 'la parte del prodotto'} e rotto o danneggiato. Se hai foto, video, screenshot o messaggi della piattaforma che mostrano il problema, inviali cosi posso controllare tutto insieme.`,
    nl: `Hallo, ik zie dat u de bestelgegevens al hebt gedeeld en hebt aangegeven dat ${component === 'strap' ? 'het horlogebandje' : 'het productonderdeel'} kapot of beschadigd is. Als u fotos, videos, screenshots of platformberichten hebt die het probleem tonen, stuur die dan mee zodat ik alles samen kan controleren.`,
    tr: `Merhaba, siparis bilgilerini zaten paylastiginizi ve ${component === 'strap' ? 'saat kayisinin' : 'urun parcasinin'} kirik veya hasarli oldugunu belirttiginizi goruyorum. Sorunu gosteren fotograf, video, ekran goruntusu veya platform mesaji varsa gonderin; hepsini birlikte kontrol edeyim.`,
    vi: `Xin chao, minh thay ban da cung cap thong tin don hang va cho biet ${component === 'strap' ? 'day dong ho' : 'bo phan san pham'} bi dut, vo hoac hu hong. Neu co hinh anh, video, anh chup man hinh hoac tin nhan nen tang the hien van de, ban gui them de minh kiem tra chung.`,
    id: `Halo, saya melihat Anda sudah membagikan informasi pesanan dan menjelaskan bahwa ${component === 'strap' ? 'tali jam' : 'bagian produk'} patah atau rusak. Jika ada foto, video, tangkapan layar, atau pesan platform yang menunjukkan masalahnya, silakan kirim agar saya dapat memeriksanya bersama.`,
    ja: `こんにちは。注文情報はすでに共有いただいており、${component === 'strap' ? '時計バンド' : '商品の部品'}が破損していることも確認しました。問題が分かる写真、動画、スクリーンショット、またはプラットフォーム上のメッセージがあれば、あわせてお送りください。こちらでまとめて確認します。`,
  };
  return messages[languageCode] || messages.en;
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
  replyContext = null,
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
    replyContext,
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

function contextualTemplateContent(template = {}, replyContext = {}) {
  if (!template?.templateId || !replyContext?.hasAnyIdentifier) return template;
  const shared = customerSharedInfoSummary(replyContext);
  const zhIdentifier = shared.zh || '您提供的信息';
  const enIdentifier = shared.en || 'the information you shared';

  if (template.templateId === 'TPL-ORDER-STATUS-001') {
    return {
      ...template,
      content: `您好，我看到您已经提供了${zhIdentifier}。我这边会先按这条订单记录核对发货、物流或订单状态；如果还有最新物流截图或平台消息，也可以一起发我，方便对照。`,
      contentZh: `您好，我看到您已经提供了${zhIdentifier}。我这边会先按这条订单记录核对发货、物流或订单状态；如果还有最新物流截图或平台消息，也可以一起发我，方便对照。`,
      contentEn: `Hello, I can see you already shared ${enIdentifier}. I will use that to check the order, shipping, or delivery status on this side. If you also have a recent tracking screenshot or platform message, feel free to send it so I can compare the details.`,
    };
  }

  if (template.templateId === 'TPL-LOGISTICS-001' || template.templateId === 'TPL-TRACKING-RECEIVED-001') {
    return {
      ...template,
      content: `您好，我看到您已经提供了${zhIdentifier}。我这边先按这条信息核对当前物流轨迹；如果有最近的物流截图，也可以一起发我，方便判断是否异常。`,
      contentZh: `您好，我看到您已经提供了${zhIdentifier}。我这边先按这条信息核对当前物流轨迹；如果有最近的物流截图，也可以一起发我，方便判断是否异常。`,
      contentEn: `Hello, I can see you already shared ${enIdentifier}. I will use that to check the current tracking details on this side. If you have a recent tracking screenshot, feel free to send it as well so I can compare the status.`,
    };
  }

  if (template.templateId === 'TPL-AFTERSALE-001') {
    if (replyContext.hasEvidence) {
      return {
        ...template,
        content: `您好，我看到您已经提供了${zhIdentifier}和问题素材。我这边会结合这些信息确认问题情况；如果您有期望的处理方式，比如换货、补寄配件或其他方案，也可以直接告诉我。`,
        contentZh: `您好，我看到您已经提供了${zhIdentifier}和问题素材。我这边会结合这些信息确认问题情况；如果您有期望的处理方式，比如换货、补寄配件或其他方案，也可以直接告诉我。`,
        contentEn: `Hello, I can see you already shared ${enIdentifier} and the issue materials. I will check the issue based on these details. If you have a preferred solution, such as an exchange, replacement parts, or another option, please let me know as well.`,
      };
    }
    return {
      ...template,
      content: `您好，我看到您已经提供了${zhIdentifier}。麻烦您再发一下能展示问题的照片或视频，并告诉我您希望怎么处理，我这边方便一起核对。`,
      contentZh: `您好，我看到您已经提供了${zhIdentifier}。麻烦您再发一下能展示问题的照片或视频，并告诉我您希望怎么处理，我这边方便一起核对。`,
      contentEn: `Hello, I can see you already shared ${enIdentifier}. Could you also send photos or videos showing the issue and let me know what solution you are hoping for? That will help me check everything together.`,
    };
  }

  if (template.templateId === 'TPL-SIZE-INQUIRY-001') {
    return {
      ...template,
      content: `您好，我看到您已经提供了${zhIdentifier}。麻烦您再告诉我想咨询或调整的尺码；如果是下单前咨询，也可以把目标款式和身高体重信息发我。`,
      contentZh: `您好，我看到您已经提供了${zhIdentifier}。麻烦您再告诉我想咨询或调整的尺码；如果是下单前咨询，也可以把目标款式和身高体重信息发我。`,
      contentEn: `Hello, I can see you already shared ${enIdentifier}. Could you also tell me the size you want to confirm or adjust? If this is a pre-purchase size question, you can send the target style plus your height and weight as well.`,
    };
  }

  if (template.templateId === 'TPL-AMBIGUOUS-001' || template.templateId === 'TPL-RECEIVED-001' || template.templateId === 'TPL-GENERAL-INFO-001') {
    return {
      ...template,
      content: `您好，我看到您已经提供了${zhIdentifier}。麻烦您再具体说一下希望我这边协助处理什么问题；如果有相关截图或补充说明，也可以一起发我。`,
      contentZh: `您好，我看到您已经提供了${zhIdentifier}。麻烦您再具体说一下希望我这边协助处理什么问题；如果有相关截图或补充说明，也可以一起发我。`,
      contentEn: `Hello, I can see you already shared ${enIdentifier}. Could you please tell me more specifically what you need help with? If you have screenshots or extra details, feel free to send them as well.`,
    };
  }

  return template;
}

function conservativeContent(replyContext = {}) {
  if (replyContext.hasAnyIdentifier) {
    const shared = customerSharedInfoSummary(replyContext);
    return {
      content: `Hello, I can see you already shared ${shared.en || 'the order information'}. Could you also tell me the specific issue you need help with and send any relevant screenshots or videos if available?`,
      contentZh: `您好，我看到您已经提供了${shared.zh || '订单信息'}。麻烦您再具体说一下需要我这边协助解决的问题；如果有相关截图或视频，也可以一起发我。`,
    };
  }
  return {
    content: 'Hello, could you please send your order number or order email, the specific issue you need help with, and any relevant screenshots or videos if available?',
    contentZh: '您好，麻烦您发一下订单号或下单邮箱、需要我这边协助解决的具体问题；如果有相关截图或视频，也可以一起发我。',
  };
}

function detailedExtraContent(replyContext = {}) {
  if (replyContext.hasAnyIdentifier && replyContext.hasEvidence) {
    return {
      content: 'If there are any extra platform messages or tracking updates, feel free to send them too so I can compare the details.',
      contentZh: '如果还有平台消息或最新物流更新，也可以一起发我，方便对照。',
    };
  }
  if (replyContext.hasAnyIdentifier) {
    return {
      content: 'If you have any relevant screenshots, photos, or videos, feel free to send them too so I can compare the details.',
      contentZh: '如果有相关截图、照片或视频，也可以一起发我，方便对照。',
    };
  }
  if (replyContext.hasEvidence) {
    return {
      content: 'Could you also send the order number or order email so I can match these details to the correct order?',
      contentZh: '也麻烦您发一下订单号或下单邮箱，我这边好把这些信息对应到正确订单。',
    };
  }
  return {
    content: 'If possible, please also send the order number, order email, and any relevant screenshots or videos so I can check everything together.',
    contentZh: '如方便，也麻烦您补充订单号、下单邮箱、相关截图或视频，我这边好一起核对。',
  };
}

function joinReplyParts(...parts) {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join('\n');
}

function humanReviewDraftContent(replyContext = {}) {
  const shared = customerSharedInfoSummary(replyContext);
  if (replyContext.hasAnyIdentifier && replyContext.hasEvidence) {
    return {
      content: `Hello, I’m sorry this has caused concern. I can see you already shared ${shared.en || 'the order information'} and the issue materials. I’ll review these details together first so we can confirm the next suitable solution accurately.`,
      contentZh: `您好，很抱歉这件事给您带来困扰。我看到您已经提供了${shared.zh || '订单信息'}和问题素材，我这边会先结合这些信息一起核对，再确认下一步合适的处理方案。`,
    };
  }
  if (replyContext.hasAnyIdentifier) {
    return {
      content: `Hello, I’m sorry this has caused concern. I can see you already shared ${shared.en || 'the order information'}. I’ll use that to check the case first; if you have photos, videos, screenshots, or platform messages that show the issue, feel free to send them too so I can review everything together.`,
      contentZh: `您好，很抱歉这件事给您带来困扰。我看到您已经提供了${shared.zh || '订单信息'}。我这边会先按这些信息核对；如果有能展示问题的照片、视频、截图或平台消息，也可以一起发我，方便我完整对照。`,
    };
  }
  if (replyContext.hasEvidence) {
    return {
      content: 'Hello, I’m sorry this has caused concern. I can see you have shared issue materials. Could you also send your order number or order email so I can match these details to the correct order and review the next suitable solution?',
      contentZh: '您好，很抱歉这件事给您带来困扰。我看到您已经提供了问题素材，也麻烦您补充订单号或下单邮箱，我这边好对应到正确订单后继续核对下一步合适的处理方案。',
    };
  }
  return {
    content: 'Hello, I’m sorry this has caused concern. To help me check this accurately, could you please send your order number or order email, along with any photos, videos, screenshots, or platform messages that show the issue? I’ll review the details based on the information you provide.',
    contentZh: '您好，很抱歉这件事给您带来困扰。为了准确核对，麻烦您发一下订单号或下单邮箱，以及能展示问题的照片、视频、截图或平台消息。我会根据您提供的信息继续确认。',
  };
}

function recommendedReplyContent(contextualTemplate = null, replyContext = {}) {
  const detailedExtra = detailedExtraContent(replyContext);
  if (!contextualTemplate) return humanReviewDraftContent(replyContext);

  return {
    content: joinReplyParts(customerContent(contextualTemplate), detailedExtra.content),
    contentZh: joinReplyParts(referenceContent(contextualTemplate), detailedExtra.contentZh),
  };
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
  emailPayload = {},
  normalizedContext = null,
} = {}) {
  const agent = buildAgentRuntimeContext(agentConfig);
  const replyContext = buildReplyContext({ emailPayload, normalizedContext });
  const contextualTemplate = contextualTemplateContent(template, replyContext);

  if (action === 'ignore' || risk === 'spam') {
    return [];
  }

  if (action === 'blocked' || risk === 'high') {
    const recommended = humanReviewDraftContent(replyContext);
    return alignReplyCandidates([
      makeCandidate({
        candidateId: `RECOMMENDED-${category || 'HIGH'}-001`,
        label: '推荐回复',
        variant: 'recommended',
        content: applyReplyStyle(recommended.content, {
          replyStyle: agent.replyStyle,
          variant: 'recommended',
          action,
          risk,
        }),
        contentZh: recommended.contentZh,
        action,
        risk,
        requiresReview: true,
        sendable: true,
        agent,
        replyContext,
      }),
    ], customerLanguage);
  }

  if (!contextualTemplate) return [];

  if (action === 'draft_only' || risk === 'medium') {
    const recommended = recommendedReplyContent(contextualTemplate, replyContext);
    return alignReplyCandidates([
      makeCandidate({
        candidateId: `${contextualTemplate.templateId}-RECOMMENDED`,
        label: '推荐回复',
        variant: 'recommended',
        content: applyReplyStyle(recommended.content, {
          replyStyle: agent.replyStyle,
          variant: 'recommended',
          action,
          risk,
        }),
        contentZh: recommended.contentZh,
        action,
        risk,
        requiresReview: true,
        sendable: true,
        agent,
        replyContext,
      }),
    ], customerLanguage);
  }

  return alignReplyCandidates([
    makeCandidate({
      candidateId: `${contextualTemplate.templateId}-RECOMMENDED`,
      label: '推荐回复',
      variant: 'recommended',
      content: applyReplyStyle(customerContent(contextualTemplate), {
        replyStyle: agent.replyStyle,
        variant: 'recommended',
        action,
        risk,
      }),
      contentZh: referenceContent(contextualTemplate),
      action,
      risk,
      requiresReview: false,
      sendable: true,
      agent,
      replyContext,
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
