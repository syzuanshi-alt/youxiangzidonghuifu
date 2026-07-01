create extension if not exists pgcrypto;

create table if not exists public.email_ai_model_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider_key text not null unique,
  base_url text,
  api_key_env_name text,
  default_model text,
  supported_models jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  usage_type text not null check (usage_type in ('risk_check', 'reply_generation', 'both', 'fallback', 'test_only')),
  is_fallback boolean not null default false,
  temperature numeric not null default 0.2,
  max_tokens integer not null default 1200,
  timeout_ms integer not null default 5000,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_ai_risk_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  keywords text[] not null default '{}',
  semantic_description text,
  condition_type text not null default 'keyword_or_semantic',
  priority integer not null default 0,
  suggested_action text not null check (suggested_action in ('draft_only', 'human_review', 'block_auto_reply', 'internal_note_only')),
  enabled boolean not null default true,
  version integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_ai_spam_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rule_type text not null,
  keywords text[] not null default '{}',
  sender_emails text[] not null default '{}',
  sender_domains text[] not null default '{}',
  url_patterns text[] not null default '{}',
  priority integer not null default 0,
  suggested_action text not null check (suggested_action in ('ignore_spam', 'mark_spam', 'human_review', 'block_auto_reply')),
  enabled boolean not null default true,
  version integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_ai_knowledge_base (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  applicable_risk_levels text[] not null default '{}',
  keywords text[] not null default '{}',
  customer_scenario text,
  standard_reply text,
  forbidden_expressions text[] not null default '{}',
  recommended_tone text,
  allow_for_auto_reply boolean not null default false,
  require_human_review boolean not null default false,
  priority integer not null default 0,
  enabled boolean not null default true,
  version integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_ai_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  prompt_type text not null check (prompt_type in ('spam_check', 'risk_check', 'reply_generation', 'output_safety_check')),
  system_prompt text,
  task_prompt text,
  output_format jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  version integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_ai_output_safety_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  keywords text[] not null default '{}',
  semantic_description text,
  risk_level text not null,
  trigger_action text not null check (trigger_action in ('human_review', 'block_auto_reply', 'internal_note_only')),
  enabled boolean not null default true,
  version integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_ai_config_versions (
  id uuid primary key default gen_random_uuid(),
  version_name text not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  model_config jsonb not null default '[]'::jsonb,
  risk_rules_snapshot jsonb not null default '[]'::jsonb,
  spam_rules_snapshot jsonb not null default '[]'::jsonb,
  knowledge_base_snapshot jsonb not null default '[]'::jsonb,
  prompt_templates_snapshot jsonb not null default '[]'::jsonb,
  output_safety_rules_snapshot jsonb not null default '[]'::jsonb,
  publish_note text,
  published_by uuid null,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists email_ai_one_published_version_idx
  on public.email_ai_config_versions ((status))
  where status = 'published';

create table if not exists public.email_ai_test_runs (
  id uuid primary key default gen_random_uuid(),
  test_input jsonb not null default '{}'::jsonb,
  test_result jsonb not null default '{}'::jsonb,
  used_version_id uuid null references public.email_ai_config_versions(id) on delete set null,
  used_mock boolean not null default true,
  status text not null,
  error_message text null,
  created_by uuid null,
  created_at timestamptz not null default now()
);

insert into public.email_ai_model_providers
  (name, provider_key, default_model, supported_models, enabled, usage_type, is_fallback)
values
  ('Local Mock', 'local_mock', 'local-mock-email-ai', '["local-mock-email-ai"]'::jsonb, true, 'both', true)
on conflict (provider_key) do nothing;

insert into public.email_ai_risk_rules
  (name, risk_level, keywords, semantic_description, priority, suggested_action, notes)
values
  ('低风险普通咨询', 'low', array['product','material','size','color','stock','产品','材质','尺寸','颜色','库存'], '普通咨询，不涉及投诉、退款、赔偿、差评、平台处罚或严重情绪。', 10, 'draft_only', '默认只生成草稿。'),
  ('低风险物流查询', 'low', array['shipping information','tracking number','物流查询','物流单号'], '普通物流状态询问，不包含异常、催促、投诉或承诺诉求。', 9, 'draft_only', '只确认收到并引导补充定位信息。'),
  ('中风险客户不满', 'medium', array['not satisfied','unhappy','disappointed','worried','asked many times','不满意','焦急','多次追问','催促'], '客户表达不满、焦急或反复追问，但尚未明确投诉、退款、赔偿或法律威胁。', 30, 'human_review', '需要人工审核。'),
  ('中风险物流异常', 'medium', array['logistics abnormal','delayed','delay','package not moving','not received any update','物流异常','发货延迟','没有更新'], '物流异常、延迟或客户催促履约，不能自动承诺发货或到货时间。', 35, 'human_review', '需要人工核对物流状态。'),
  ('高风险退款争议', 'high', array['refund','return','chargeback','退款','退货','拒付','退钱'], '客户明确要求退款、退货或发生支付争议。', 80, 'human_review', '禁止自动发送。'),
  ('高风险法律威胁', 'high', array['lawyer','legal','court','fraud','scam','律师','法院','法律','欺诈','诈骗'], '涉及律师、法院、法律责任、欺诈或虚假宣传。', 95, 'human_review', '只允许内部建议。'),
  ('高风险平台投诉', 'high', array['complain to platform','platform complaint','platform penalty','投诉平台','平台投诉','平台处罚'], '客户或平台官方提到投诉、处罚或平台介入。', 90, 'human_review', '平台声誉和处罚风险。'),
  ('高风险差评威胁', 'high', array['bad review','negative review','one star','差评','负面评价','一星'], '客户威胁差评或负面公开评价。', 85, 'human_review', '品牌声誉风险。');

insert into public.email_ai_spam_rules
  (name, rule_type, keywords, url_patterns, priority, suggested_action, notes)
values
  ('广告推广', 'promotion', array['promotion','advertising','seo','backlinks','推广','广告','外链'], '{}', 50, 'ignore_spam', '明显广告和外链推广。'),
  ('可疑链接', 'suspicious_link', array['click here','login now','verify account','点击链接','立即登录','验证账户'], array['bit.ly','tinyurl','login-verify','account-secure'], 70, 'block_auto_reply', '诱导点击或可疑短链。'),
  ('无关营销', 'irrelevant_marketing', array['casino','loan','invoice service','mass marketing','赌博','贷款','发票','刷单','代运营'], '{}', 60, 'ignore_spam', '无关灰产或营销内容。'),
  ('乱码邮件', 'garbled', array['乱码','无效内容','asdfasdf','qwertyuiop','test spam'], '{}', 40, 'ignore_spam', '正文大量乱码或模板重复。'),
  ('钓鱼邮件', 'phishing', array['password expired','account suspended','verify your mailbox','密码过期','账户暂停','钓鱼'], array['password','mailbox-login','verify'], 90, 'block_auto_reply', '可疑登录或凭证诱导。');

insert into public.email_ai_knowledge_base
  (title, category, applicable_risk_levels, keywords, customer_scenario, standard_reply, forbidden_expressions, recommended_tone, allow_for_auto_reply, require_human_review, priority, notes)
values
  ('普通产品咨询回复', '产品信息咨询', array['low'], array['product','material','size','color','stock','产品','材质','尺寸','颜色','库存'], '客户询问产品基础信息。', 'Hello, thank you for reaching out. We have received your product question. Please share the specific style, size, material or color you are interested in, and our support team will help confirm the details.', array['guarantee','always available','一定有货'], 'polite', false, false, 30, '低风险产品咨询草稿。'),
  ('物流查询回复', '物流咨询', array['low','medium'], array['shipping','tracking','package','logistics','物流','快递','包裹'], '客户询问物流或包裹状态。', 'Hello, we have received your shipping inquiry. To avoid inaccurate information, please share your order number or order email if available, and our support team will check the latest shipping status.', array['arrive tomorrow','already shipped','一定到货','马上发货'], 'polite', false, true, 25, '物流状态需人工核对。'),
  ('发货延迟安抚回复', '发货延迟', array['medium'], array['delay','delayed','not received any update','发货延迟','没有更新'], '客户催促发货或物流无更新。', 'Hello, we understand your concern. We have received your message and will ask support to verify the order and shipping status before replying with confirmed information.', array['ship today','arrive tomorrow','今天发货','明天到'], 'calm', false, true, 40, '安抚但不承诺时效。'),
  ('退款咨询谨慎回复', '退款咨询', array['high'], array['refund','return','退款','退货'], '客户询问退款或退货。', '', array['we will refund','refund approved','可以退款','马上退款'], 'calm', false, true, 90, '高风险只生成内部建议。'),
  ('投诉类内部建议', '投诉安抚', array['high'], array['complaint','complain','bad review','投诉','差评'], '投诉、差评或平台投诉风险。', '', array['we admit fault','compensation','承认责任','赔偿'], 'calm', false, true, 95, '提醒人工核对平台规则和订单事实。'),
  ('高风险邮件禁止自动回复说明', '高风险内部建议', array['high'], array['legal','lawyer','platform','chargeback','法律','律师','平台','拒付'], '法律、平台、拒付或品牌风险。', '', array['legal responsibility','we are responsible','法律责任','我们负责'], 'internal', false, true, 100, '仅用于内部建议。');

insert into public.email_ai_prompt_templates
  (name, prompt_type, system_prompt, task_prompt, output_format, notes)
values
  ('风险判定提示词', 'risk_check', 'You classify customer emails into spam, low, medium or high risk.', 'Return spam, risk level, reasons, matched rules, suggested action and whether human review is required.', '{"spam":{"isSpam":false,"confidence":0,"reasons":[]},"risk":{"level":"low","reasons":[],"matchedRules":[]},"finalAction":"draft_only"}'::jsonb, '默认 mock 风险判定提示词。'),
  ('回复生成提示词', 'reply_generation', 'You draft cautious, polite support replies based on approved knowledge base entries.', 'Do not overpromise, admit liability, fabricate order or logistics data, or promise refund, compensation or reshipment.', '{"reply":{"draft":"","internalSuggestion":"","tone":"polite"}}'::jsonb, '默认 mock 回复生成提示词。'),
  ('输出格式提示词', 'output_safety_check', 'Return strict JSON for the email workbench.', 'The workbench parses spam, risk, reply, safety and finalAction from JSON.', '{"spam":{"isSpam":false,"confidence":0.2,"reasons":[]},"risk":{"level":"low","reasons":[],"matchedRules":[]},"reply":{"draft":"","internalSuggestion":"","tone":"polite"},"safety":{"needHumanReview":false,"blocked":false,"reasons":[]},"finalAction":"draft_only"}'::jsonb, '统一输出格式。');

insert into public.email_ai_output_safety_rules
  (name, keywords, semantic_description, risk_level, trigger_action, notes)
values
  ('禁止承诺退款', array['we will refund','refund approved','refund today','可以退款','马上退款','同意退款','承诺退款'], '禁止在自动回复中承诺退款或退款时间。', 'high', 'block_auto_reply', '资金相关承诺必须人工审核。'),
  ('禁止承诺赔偿', array['compensate','compensation','赔偿','补偿','赔付'], '禁止承诺赔偿、补偿或优惠。', 'high', 'block_auto_reply', '利益让渡必须人工确认。'),
  ('禁止承诺补发', array['reship','send a replacement','补发','重新发货'], '禁止承诺补发或重新发货。', 'high', 'human_review', '补发需核对订单和售后规则。'),
  ('禁止承认法律责任', array['we are legally responsible','admit liability','legal responsibility','承认法律责任','我们负责法律问题'], '禁止承认法律责任或作出法律结论。', 'high', 'block_auto_reply', '法律风险必须人工处理。'),
  ('禁止编造订单信息', array['your order is confirmed','order has been changed','订单已修改','订单正常','已确认订单'], '禁止在未核对系统时编造订单状态。', 'medium', 'human_review', '订单信息必须从系统核对。'),
  ('禁止编造物流信息', array['already shipped','tracking number','will arrive tomorrow','arrive tomorrow','已经发货','物流单号','明天到货'], '禁止编造物流状态、物流单号或到货时间。', 'medium', 'human_review', '物流必须核对后再回复。'),
  ('禁止绝对化表达', array['guarantee','always','never','一定','保证','绝对'], '避免绝对化和过度承诺表达。', 'medium', 'human_review', '客服表达应克制。');
