# AS 飞书邮件板块

本项目用于落地飞书邮箱自动回复工作台。当前已经具备最终版本地闭环：飞书只读、受控真实发送、受控归档/移箱、审批、原始来信人策略、限额、审计日志和老板看板同步。

## 当前能力

- 通过本地飞书 API 代理读取当前绑定邮箱的真实邮件。
- 绿色低风险 / 白色垃圾邮件 / 橘色中风险 / 红色高风险四色队列。
- 可以自动回复、建议归档或移箱、只能生成草稿、禁止自动回复四类处理方式。
- 独立话术模板配置，分类规则不再直接写死回复内容。
- 可编辑候选回复：低风险 1 条，中风险 3 条，高风险仅建议不发送。
- 智能体配置入口：可切换本地规则智能体、OpenAI 兼容模型、企业知识库模型占位。
- 知识库选择入口：产品知识、售后规则、物流规则、达人合作、禁用表达；禁用表达默认强制启用。
- 飞书邮件字段适配器，把真实 API 返回映射成工作台邮件对象。
- 本地飞书 API 代理：服务端读取环境变量，前端不接触 App Secret / token / user access token。
- 受控写操作：真实发送、审批后高风险回复、白色垃圾归档/移箱；生产邮箱不开放硬删除。
- API 接入准备清单，明确配置项、权限分层和敏感字段拦截。
- 高风险审批和真实发送护栏检查。
- 发送前检查：真实发送开关、人工审核、重复回复、线程错配、高风险拦截。
- 草稿保存、人工审核通过、闭环处理中心和服务端受控发送。
- 手动归档选择框：人工判断不需要回复的邮件可直接分流到归档 / 移箱，不进入发送队列。
- 老板结果看板：只汇总邮件处理结果、待人工事项、高风险异常、无效邮件和数据来源状态。
- 每封邮件可做规则审核标记：合理、需调整规则、改话术、应拦截。
- 可导出本机浏览器里的审核清单，用于后续同步到话术库和规则库。

## 话术库维护

人类可维护主库：

```text
/Users/renshuang/Desktop/docs/05-平台接口/飞书邮箱自动回复话术库.md
```

业务知识库：

```text
/Users/renshuang/Desktop/docs/05-平台接口/as邮箱自动回复业务知识库.md
```

程序读取配置：

```text
src/replyTemplates.js
```

智能体配置：

```text
src/agentConfig.js
```

发送前护栏配置：

```text
src/sendGuard.js
```

飞书字段适配器：

```text
src/feishuAdapter.js
```

草稿和队列流程：

```text
src/draftWorkflow.js
```

API 接入安全配置：

```text
src/apiConfig.js
```

上线前检查：

```text
src/launchChecklist.js
```

老板看板汇总：

```text
src/bossDashboard.js
```

维护顺序：

1. 先在 Obsidian 话术库补充专业知识、禁用表达和标准话术。
2. 再同步到 `src/replyTemplates.js`。
3. 运行规则测试，确认高风险仍然不会返回可发送话术。

当前样例覆盖：

- 9 个绿色低风险自动回复候选。
- 3 个白色垃圾 / 骚扰邮件样例。
- 11 个橘色中风险人工审核草稿。
- 10 个红色高风险拦截样例。

## 规则审核

工作台每封邮件详情里有“规则审核”区域，可以标记：

- 合理：当前分类、风险和话术都可接受。
- 需调整规则：分类、风险等级或拦截边界不准确。
- 改话术：分类合理，但回复内容需要优化。
- 应拦截：这类邮件不应自动回复或出可发送话术。

审核记录保存在本机浏览器 `localStorage`，右侧“导出审核清单”可复制当前优化项。

## 写操作和发送前检查

工作台现在会在分类和话术命中之后，再执行发送前检查和真实写操作检查。当前检查包括：

- 真实写操作总开关：`FEISHU_WRITE_ENABLED`。
- 分动作开关：`FEISHU_SEND_ENABLED`、`FEISHU_ARCHIVE_ENABLED`、`FEISHU_HIGH_RISK_SEND_ENABLED`。
- 客户回复策略：`FEISHU_CUSTOMER_REPLY_ORIGINAL_SENDER_ENABLED=true` 时，真实客户无需提前加入名单，但只能回复原始来信人。
- 特殊授权名单：`FEISHU_SEND_RECIPIENT_ALLOWLIST`，仅用于内部测试或需要发送给非原始来信人的特批场景。
- 每日限额：`FEISHU_DAILY_SEND_LIMIT`、`FEISHU_DAILY_ARCHIVE_LIMIT`。
- 垃圾邮件分流：广告、骚扰、乱码、无效群发不生成回复，只建议归档或移箱。
- 高风险审批：退款、赔偿、投诉、改价、发货承诺、法律纠纷必须人工审批后才能发送邮件回复。
- 退款 / 赔偿自动处理只限邮件层，不调用真实订单、支付、退款或赔偿接口。
- 人工审核：中风险草稿必须人工审核，不能直接发送。
- 重复回复：同一邮件或同一线程已有回复记录时拦截。
- 线程错配：回复目标线程和当前邮件线程不一致时拦截。
- 硬删除关闭：生产邮箱只做归档/移箱，不做不可恢复删除。

重复回复和线程错配会基于真实飞书邮件返回的 `message_id`、`thread_id` 和历史回复标识判断；没有真实邮件时不展示本地样例。

## 草稿队列和闭环处理

工作台现在把“生成内容”和“准备发送”拆成三个步骤：

1. 草稿保存：低风险和中风险有模板时都可以保存草稿，高风险和垃圾邮件不保存草稿。
2. 人工审核：中风险草稿必须标记“合理”后，才算审核通过。
3. 草稿队列：低风险草稿、已审核通过的中风险草稿可以进入队列，真实动作交给服务端闭环处理。
4. 白色垃圾队列：垃圾 / 骚扰邮件只显示建议归档或移箱，不进入发送队列。

队列和真实发送拆开处理。进入队列不代表一定能发，真实发送按钮还会经过服务端写操作总开关、原始来信人策略、审批、限额和线程检查。

## 飞书 API 读取映射

工作台只读取本地飞书 API 代理返回的真实邮箱数据。代理未启动、飞书配置未补齐或读取失败时，邮件列表保持为空，不再回退到本地样例。

```text
飞书 mail/v1 消息 -> src/feishuApiClient.js -> src/feishuAdapter.js -> 工作台 mail 对象 -> 规则判断 -> 发送前检查
```

当前已固定的字段关系：

- `message_id` -> `id` / `messageId`
- `thread_id` -> `threadId`
- `subject` -> `subject`
- `from.email` -> `sender`
- `received_at` -> `receivedAt`
- `body_preview` -> `summary`
- `labels: ['auto_replied']` -> 已回复记录，用于重复拦截
- `expected_thread_id` -> 预期回复线程，用于线程错配检查

## 飞书只读 API 代理

本地代理入口：

```text
server/feishuApiServer.mjs
```

读取接口：

```text
GET /api/feishu/status
GET /api/feishu/mail/messages?page_size=20
```

写操作接口：

```text
POST /api/feishu/mail/actions/send
POST /api/feishu/mail/actions/archive
POST /api/feishu/mail/actions/approve
POST /api/feishu/mail/actions/process
POST /api/feishu/mail/folders/ensure-archive
POST /api/feishu/bot/messages/send
```

缺少读取配置时，邮件接口会返回 `503` 和 `sourceStatus: "API 待接入"`；读取成功时，返回 `sourceStatus: "真实接入"`。写操作缺少开关、token、原始来信人策略或审批时会返回阻断原因，并写入本地审计日志。

方式一：运行服务时直接提供环境变量：

```bash
FEISHU_APP_ID="你的 App ID" \
FEISHU_APP_SECRET="只放在本机环境变量" \
FEISHU_USER_MAILBOX_ID="测试邮箱的 user_mailbox_id" \
FEISHU_WRITE_ENABLED="false" \
node server/feishuApiServer.mjs
```

方式二：复制本地配置样例，只在本机填写：

```bash
cp .env.local.example .env.local
```

然后编辑 `.env.local`：

```text
FEISHU_APP_ID=你的 App ID
FEISHU_APP_SECRET=你的 App Secret
FEISHU_USER_MAILBOX_ID=测试邮箱的 user_mailbox_id
EMAIL_AI_ADMIN_TOKEN=请改成一串本机自定义随机口令
FEISHU_MAIL_FOLDER_ID=INBOX
FEISHU_WRITE_ENABLED=false
```

`.env.local` 已被 `.gitignore` 忽略，不要把它发到聊天、文档或 GitHub。服务端启动时会自动读取 `.env.local`，但 shell 环境变量优先级更高。

`EMAIL_AI_ADMIN_TOKEN` 是邮件 AI 控制中心的本机管理员口令，只用于保护 `/api/admin/email-ai-control/*` 这些后台配置接口。它不是飞书、邮箱或 DeepSeek 官方发放的 token，也不需要去平台查询。第一次部署或换电脑时，在新机器的 `.env.local` 里自己生成并填写一串随机值，例如：

```bash
python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(32))
PY
```

然后重启本地服务，在浏览器的“邮件 AI 控制中心”页面把同一串值输入“管理员 Token”并连接。更换邮箱账号时通常不需要更换这个管理员 Token；只有换电脑、重建 `.env.local`、怀疑口令泄露，或想更换后台管理口令时才需要重新生成。

说明：飞书邮件列表接口要求 `folder_id` 或 `label_id` 二选一。项目默认用 `FEISHU_MAIL_FOLDER_ID=INBOX` 读取收件箱；如果后续要读取指定标签，可以清空 `FEISHU_MAIL_FOLDER_ID` 并填写 `FEISHU_MAIL_LABEL_ID`。

说明：邮件列表当前默认每次读取 20 封。实测 `page_size=30` 会触发飞书字段校验失败，代理会把超过 20 的请求自动压到 20。

可选环境变量：

```bash
PORT=5175
FEISHU_API_BASE="https://open.feishu.cn/open-apis"
```

受控写操作环境变量：

```bash
FEISHU_WRITE_ENABLED=true
FEISHU_SEND_ENABLED=true
FEISHU_ARCHIVE_ENABLED=true
FEISHU_HIGH_RISK_SEND_ENABLED=true
FEISHU_AUTO_PROCESS_ENABLED=true
FEISHU_AUTO_SEND_LOW_RISK_ENABLED=true
FEISHU_AUTO_ARCHIVE_SPAM_ENABLED=true
FEISHU_AUTO_PROCESS_SCHEDULE_ENABLED=false
FEISHU_AUTO_PROCESS_INTERVAL_MS=60000
FEISHU_USER_ACCESS_TOKEN="通过 /oauth/start 自动写入"
FEISHU_USER_REFRESH_TOKEN="通过 /oauth/start 自动写入"
FEISHU_USER_ACCESS_TOKEN_EXPIRES_AT="通过 /oauth/start 自动写入"
FEISHU_USER_REFRESH_TOKEN_EXPIRES_AT="通过 /oauth/start 自动写入"
FEISHU_CUSTOMER_REPLY_ORIGINAL_SENDER_ENABLED=true
FEISHU_SEND_RECIPIENT_ALLOWLIST="test@example.com,internal@example.com"
FEISHU_ARCHIVE_FOLDER_ID="archive_folder_id"
FEISHU_ARCHIVE_FOLDER_NAME="工作台归档"
FEISHU_BOT_REPORT_EMAIL="boss@example.com"
FEISHU_DAILY_SEND_LIMIT=20
FEISHU_DAILY_ARCHIVE_LIMIT=100
```

说明：飞书发送邮件接口需要 `user_access_token` 和发送用户邮件权限。授权入口 `/oauth/start` 会默认申请 `offline_access`，回调成功后把 `FEISHU_USER_ACCESS_TOKEN`、`FEISHU_USER_REFRESH_TOKEN` 和过期时间写入本机 `.env.local`。服务端会在 token 临近过期或飞书返回过期错误时自动刷新，并把新 token 写回本机；如果状态页显示“缺少 refresh token”，需要确认飞书应用已开通并发布 `offline_access` 后重新授权一次。服务端调用官方 `POST /mail/v1/user_mailboxes/:user_mailbox_id/messages/send`，前端不接触 token。自动闭环由 `/api/feishu/mail/actions/process` 统一处理。低风险自动发送必须满足总开关、分动作开关、原始来信人校验、限额和审计日志；中高风险必须人工审核后才能发送给原始来信人。`FEISHU_SEND_RECIPIENT_ALLOWLIST` 仅作为特殊授权名单，不是客户自动回复的必备条件。无人值守后台闭环需要额外开启 `FEISHU_AUTO_PROCESS_SCHEDULE_ENABLED=true`，服务端会读取审计日志跳过已发送/已归档邮件，避免重复处理。

说明：`POST /api/feishu/mail/folders/ensure-archive` 会在权限满足时查找或创建 `FEISHU_ARCHIVE_FOLDER_NAME`，并把得到的 `FEISHU_ARCHIVE_FOLDER_ID` 写回 `.env.local`。`POST /api/feishu/bot/messages/send` 默认把文本消息发送到 `FEISHU_BOT_REPORT_EMAIL`，用于老板看板或联调通知。

工作台里的闭环处理中心还有一层“本次运行开关”：

- 闭环处理总开关。
- 低风险自动回复。
- 垃圾邮件自动归档。
- 审批后发送。

`.env.local` 是底层权限上限，工作台开关只能在底层已开启时生效。也就是说，页面不能把 `.env.local` 里关闭的真实发送强行打开；但页面可以把已经允许的能力临时关闭，方便试验。

浏览器打开：

```text
http://127.0.0.1:5175
```

未配置真实飞书环境变量时，可以启动代理检查配置状态：

```bash
node server/feishuApiServer.mjs
```

此时工作台会显示 `API 代理可用 · 待配置`，邮件列表保持为空。

配置完成后，先跑只读冒烟测试：

```bash
node scripts/feishuReadSmokeTest.mjs
```

这个脚本只输出是否读取成功、读取到几封邮件和前 3 封邮件的基础字段，不打印 App Secret 或 access token。生产邮箱会显示真实邮件标题和发件人，运行后不要把输出截图外传。

## Railway 云端部署

第一版云端建议使用 Railway 单个 Node Web Service：服务端会同时托管工作台静态页面和 API。Railway 需要公网可访问监听地址，服务启动时默认监听 `0.0.0.0`；本地如需只监听本机，可设置 `HOST=127.0.0.1`。

Railway 服务配置：

```text
Repository: syzuanshi-alt/youxiangzidonghuifu
Branch: main
Start Command: npm start
Healthcheck Path: /healthz
Volume Mount Path: /data
```

Railway 环境变量最小配置：

```bash
WORKBENCH_DATA_DIR=/data
FEISHU_APP_ID=你的 App ID
FEISHU_APP_SECRET=你的 App Secret
FEISHU_USER_MAILBOX_ID=目标邮箱 user_mailbox_id
EMAIL_AI_ADMIN_TOKEN=随机长 token
EMAIL_AI_ADMIN_PASSWORD=后台登录密码
FEISHU_MAIL_FOLDER_ID=INBOX
FEISHU_OAUTH_REDIRECT_URI=https://<Railway域名>/oauth/callback
FEISHU_WRITE_ENABLED=true
FEISHU_SEND_ENABLED=true
FEISHU_HIGH_RISK_SEND_ENABLED=false
FEISHU_AUTO_PROCESS_ENABLED=true
FEISHU_AUTO_SEND_LOW_RISK_ENABLED=true
FEISHU_AUTO_ARCHIVE_SPAM_ENABLED=false
FEISHU_AUTO_PROCESS_SCHEDULE_ENABLED=false
FEISHU_CUSTOMER_REPLY_ORIGINAL_SENDER_ENABLED=true
FEISHU_DAILY_SEND_LIMIT=5
FEISHU_DAILY_ARCHIVE_LIMIT=0
```

上线顺序：

1. 先保持 `FEISHU_AUTO_PROCESS_SCHEDULE_ENABLED=false` 部署，避免未验证前后台自动处理。
2. 在飞书开放平台把回调地址配置为 `https://<Railway域名>/oauth/callback`。
3. 打开 `https://<Railway域名>/oauth/start?state=railway-prod` 完成飞书 OAuth。
4. 检查 `https://<Railway域名>/healthz` 返回 200，再检查 `/api/feishu/status` 和邮件读取接口。
5. 用真实低风险测试邮件验证发送、审计日志和重启后处理状态保留。
6. 验证通过后再把 `FEISHU_AUTO_PROCESS_SCHEDULE_ENABLED=true`，进入半自动发送。

默认 `/oauth/start` 只申请 `offline_access`、邮件读取正文 / 地址 / 主题和 `mail:user_mailbox.message:send`。归档 / 移箱、飞书机器人通知等第二阶段能力需要先在飞书开放平台追加权限，再用 `FEISHU_OAUTH_SCOPE` 显式覆盖授权范围。

回滚或紧急暂停时，立即关闭：

```bash
FEISHU_AUTO_PROCESS_SCHEDULE_ENABLED=false
FEISHU_AUTO_SEND_LOW_RISK_ENABLED=false
FEISHU_SEND_ENABLED=false
```

## API 接入准备

工作台右侧有“API 接入准备”卡片，会显示本地代理、飞书只读配置和邮件来源状态。

允许记录的非敏感配置：

- 飞书应用 App ID。
- 测试邮箱地址。
- 回调地址。
- 接入环境。

禁止进入工作台的敏感字段：

- App Secret。
- access token / refresh token。
- 邮箱密码。
- private key。

权限分层当前按能力拆分：

- 读取邮件：需要 `mail:user_mailbox.message:readonly`、地址、标题和正文读取权限。
- 真实发送：需要 `mail:user_mailbox.message:send`、OAuth 授权后的 `FEISHU_USER_ACCESS_TOKEN`，以及用于自动续期的 `offline_access` / `FEISHU_USER_REFRESH_TOKEN`。
- 归档 / 移箱：需要 `mail:user_mailbox.message:modify`、`mail:user_mailbox.folder:read`、`mail:user_mailbox.folder:write`，并配置或自动创建归档目标。
- 飞书机器人通知：需要 `im:message:send_as_bot` 或同等消息发送权限，还需要 `contact:user.employee_id:readonly` 用邮箱解析接收人的飞书用户 ID，且应用已安装/可用范围包含接收人。
- 硬删除：生产邮箱不开放。

正式接飞书 API 前，需要到飞书开放平台核对实际权限名称。本项目当前已经固定安全边界：真实发送和归档均可接入，但必须受服务端开关、原始来信人策略、审批、限额和审计日志控制。

## 上线前检查

工作台右侧有“上线前检查”卡片，用于区分读取、写操作、真实发送和归档能力：

- 读取 API 准备：规则、话术、配置、密钥安全、文档都通过后，可以读取真实邮箱。
- 写操作准备：必须配置总开关、分动作开关、原始来信人策略、限额、审计日志和暂停方案。
- 真实发送准备：必须通过原始来信人策略、审批和服务端发送接口。
- 自动归档准备：只对白色垃圾邮件开放归档/移箱，不做硬删除。

当前检查项包括：

- 规则和风险边界已验证。
- 话术库和代码模板已同步。
- 读取邮件和保存草稿配置已就绪。
- 密钥只放外部安全环境。
- 草稿队列和闭环处理可运行。
- 规则文档和 README 已更新。
- 回滚和暂停自动化方案已准备。
- 真实发送、归档和高风险审批后回复均受专项开关控制。

## 老板看板同步

老板 / 高管视角页面：

```text
http://127.0.0.1:5175/boss.html
```

老板看板本地接口快照：

```text
http://127.0.0.1:5175/data/boss-dashboard.json
```

当前接入到看板的数据源：

- 飞书邮箱：来自当前绑定邮箱的飞书 API 只读结果；未读取成功时标记 `API 待接入`。
- 订单：当前没有真实 ERP / 订单 API 接入，默认不展示订单样例。

老板看板展示：

- 今日邮件总量、已分流处理、待人工处理、高风险异常、无效 / 垃圾邮件。
- 今日结论：直接告诉老板是否有需要关注的风险。
- 最多 5 条需要老板关注的异常 / 待决策邮件。
- 数据来源状态：真实飞书、API 待接入或其他来源，不展示执行层细节。

边界说明：

- 工作台已经改为只读真实飞书 API；未配置凭证或读取失败时列表为空。
- 当前没有真实 ERP / 订单 API 接入。
- 所有数据块都必须标明来源状态。
- 老板看板不展示模板、草稿漏斗、接口配置和技术开关；这些留在利华工作台。
- 真实发送和归档受控开放时会进入老板看板；退款、赔偿、改价、发货时间承诺只处理邮件回复和审批记录，不调用真实订单/支付动作。

更新老板看板快照：

```bash
node scripts/exportBossDashboardSnapshot.mjs
```

## 本地运行

启动飞书只读 API 代理：

```bash
node server/feishuApiServer.mjs
```

然后打开：

```text
http://127.0.0.1:5175
```

如果本机有 `npm`，也可以运行：

```bash
npm run dev:api
```

真实配置填好后，先运行：

```bash
node scripts/feishuReadSmokeTest.mjs
```

再启动工作台：

```bash
node server/feishuApiServer.mjs
```

## 测试

如果本机没有 `npm`，可以直接用 Node 运行：

```bash
node tests/rules.test.mjs
```

当前环境里可用的 Node 路径：

```bash
/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/rules.test.mjs
```

## 安全边界

- 可以读取真实飞书邮箱，并在配置齐全时执行受控真实发送和受控归档/移箱。
- 不把邮箱密码、token、App Secret、user access token 写入代码、README、Obsidian 或前端 localStorage。
- 真实发送必须通过服务端开关、原始来信人策略、审批、限额、重复回复和线程一致检查。
- 不开放不可恢复硬删除。
- 退款、赔偿、投诉、改价、发货承诺、高风险自动回复只做邮件层审批后回复，不调用真实订单/支付/退款接口。
- 未成功读取飞书 API 时不展示本地样例；只有代理成功读取真实邮箱时才标记 `真实接入`。
