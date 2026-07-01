# Core Agent Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the confirmed "core brain + skills" architecture for the email auto-reply AI, including backend orchestration, admin skill management UI, global language skill, and traceable tests.

**Architecture:** Keep `/api/email-ai/process` stable and route its internals through a new `runEmailAgent()` orchestration layer. Existing engines become skills registered in a small skill registry. The admin UI gets a `Skills 编排` tab backed by store fields and admin collection endpoints.

**Tech Stack:** Vanilla ES modules, Node.js built-in test style via `tests/rules.test.mjs`, Playwright browser regression via `tests/workbench-ui.test.mjs`, current static admin UI in `src/emailAiControlApp.js`.

---

### Task 1: Store Shape And Skill Configuration

**Files:**
- Modify: `src/lib/email-ai-control/default-config.js`
- Modify: `src/lib/email-ai-control/store-repository.js`
- Modify: `src/lib/email-ai-control/types.js`
- Test: `tests/rules.test.mjs`

- [ ] **Step 1: Add failing tests for default skills**

Append assertions near the existing email AI store/default-config tests in `tests/rules.test.mjs`:

```js
const defaultEmailAIStore = createDefaultEmailAIStore();
assert.ok(Array.isArray(defaultEmailAIStore.agentSkills));
assert.deepEqual(defaultEmailAIStore.agentSkills.map((skill) => skill.key), [
  'translate_global_language',
  'classify_email',
  'retrieve_knowledge',
  'draft_reply',
  'review_risk',
  'human_feedback',
]);
assert.equal(defaultEmailAIStore.agentPipeline.enabled, true);
assert.equal(defaultEmailAIStore.agentPipeline.traceEnabled, true);
```

Run:

```bash
/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/rules.test.mjs
```

Expected: FAIL because `agentSkills` and `agentPipeline` do not exist yet.

- [ ] **Step 2: Implement default store fields**

Add `DEFAULT_AGENT_SKILLS` and `DEFAULT_AGENT_PIPELINE` in `src/lib/email-ai-control/default-config.js`:

```js
export const DEFAULT_AGENT_PIPELINE = {
  enabled: true,
  traceEnabled: true,
  defaultFailurePolicy: 'fail_closed',
};

export const DEFAULT_AGENT_SKILLS = [
  {
    id: 'skill-translate-global-language',
    key: 'translate_global_language',
    label: '全球语言自动翻译',
    description: '识别客户语言，生成中文内部理解参考，并约束回复跟随客户语言。',
    enabled: true,
    order: 10,
    required: true,
    failurePolicy: 'fail_closed',
    notes: '',
  },
  {
    id: 'skill-classify-email',
    key: 'classify_email',
    label: '邮件分类',
    description: '判断垃圾邮件、风险等级和建议动作。',
    enabled: true,
    order: 20,
    required: true,
    failurePolicy: 'fail_closed',
    notes: '',
  },
  {
    id: 'skill-retrieve-knowledge',
    key: 'retrieve_knowledge',
    label: '知识库检索',
    description: '从 FAQ、政策、话术和规则依据中检索回复参考。',
    enabled: true,
    order: 30,
    required: false,
    failurePolicy: 'skip_optional',
    notes: '',
  },
  {
    id: 'skill-draft-reply',
    key: 'draft_reply',
    label: '回复生成',
    description: '根据分类、客户语言和知识库结果生成回复草稿或内部建议。',
    enabled: true,
    order: 40,
    required: true,
    failurePolicy: 'fail_closed',
    notes: '',
  },
  {
    id: 'skill-review-risk',
    key: 'review_risk',
    label: '风险审核',
    description: '二次检查退款、法律、赔偿、价格承诺、隐私和编造信息风险。',
    enabled: true,
    order: 50,
    required: true,
    failurePolicy: 'fail_closed',
    notes: '',
  },
  {
    id: 'skill-human-feedback',
    key: 'human_feedback',
    label: '学习反馈',
    description: '记录人工改判、人工修改和转人工原因，作为后续优化依据。',
    enabled: true,
    order: 60,
    required: false,
    failurePolicy: 'skip_optional',
    notes: '',
  },
];
```

Add these fields to `createDefaultEmailAIStore()` and `createEmailAIConfigSnapshot()`.

- [ ] **Step 3: Normalize repository support**

Update `ensureStoreShape()` in `src/lib/email-ai-control/store-repository.js` so existing stores receive defaults:

```js
agentSkills: Array.isArray(store?.agentSkills) ? store.agentSkills : defaults.agentSkills,
agentPipeline: {
  ...defaults.agentPipeline,
  ...(store?.agentPipeline || {}),
},
```

Add `agent-skills` to `EMAIL_AI_COLLECTIONS` in `src/lib/email-ai-control/types.js` and add `normalizeAgentSkill()` in the repository.

- [ ] **Step 4: Verify store tests pass**

Run:

```bash
/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/rules.test.mjs
```

Expected: PASS.

### Task 2: Agent Runner And Skill Registry

**Files:**
- Create: `src/lib/email-ai-control/agent-skills.js`
- Create: `src/lib/email-ai-control/email-agent.js`
- Modify: `src/lib/email-ai-control/process-email.js`
- Modify: `src/lib/email-ai-control/index.js`
- Test: `tests/rules.test.mjs`

- [ ] **Step 1: Add failing tests for agent trace**

Add tests around the existing `processEmailWithAI()` section in `tests/rules.test.mjs`:

```js
const tracedAIResult = await processEmailWithAI({
  emailId: 'agent-trace-low',
  senderEmail: 'trace@example.test',
  subject: 'Product material question',
  body: 'Hello, could you tell me more about the product material?',
  source: 'email_auto_reply_workbench',
}, { repository: emailAIRepo, rootDir: emailAITmpDir, env: { ...process.env }, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });

assert.ok(Array.isArray(tracedAIResult.agentTrace));
assert.ok(tracedAIResult.agentTrace.some((step) => step.skillKey === 'translate_global_language'));
assert.ok(tracedAIResult.agentTrace.some((step) => step.skillKey === 'classify_email'));
assert.ok(tracedAIResult.agentTrace.some((step) => step.skillKey === 'review_risk'));
assert.equal(tracedAIResult.success, true);
```

Run:

```bash
/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/rules.test.mjs
```

Expected: FAIL because `agentTrace` is not present.

- [ ] **Step 2: Create skill registry**

Create `src/lib/email-ai-control/agent-skills.js` with exported skill runners:

```js
export function createEmailAgentSkills({ evaluateSpamRules, evaluateRiskRules, matchKnowledgeBase, generateEmailAIReply, checkOutputSafety, detectCustomerLanguage, translateCustomerMessageToChinese }) {
  return {
    translate_global_language: async (context) => {
      const original = [context.emailPayload.subject, context.emailPayload.body, context.emailPayload.bodyText, context.emailPayload.summary].filter(Boolean).join('\n');
      const customerLanguage = context.emailPayload.customerLanguage || detectCustomerLanguage(original);
      const translation = translateCustomerMessageToChinese(original);
      return {
        contextPatch: {
          emailPayload: {
            ...context.emailPayload,
            customerLanguage,
          },
          customerLanguage,
          translation,
        },
        output: { customerLanguage, translationSource: translation.source },
      };
    },
    classify_email: async (context) => {
      const spam = evaluateSpamRules(context.emailPayload, context.config);
      const risk = spam.isSpam
        ? { level: 'low', reasons: ['邮件已命中垃圾邮件规则，不继续生成正常回复。'], matchedRules: [], suggestedAction: 'ignore_spam' }
        : evaluateRiskRules(context.emailPayload, context.config);
      return { contextPatch: { spam, risk }, output: { spam, risk } };
    },
    retrieve_knowledge: async (context) => {
      const knowledge = context.spam?.isSpam ? { entries: [], refs: [] } : matchKnowledgeBase(context.emailPayload, context.risk, context.config);
      return { contextPatch: { knowledge }, output: { refs: knowledge.refs || [] } };
    },
    draft_reply: async (context) => {
      const result = await generateEmailAIReply(context);
      return { contextPatch: { reply: result.reply, replyProvider: result.provider }, output: { tone: result.reply?.tone || '', hasDraft: Boolean(result.reply?.draft) } };
    },
    review_risk: async (context) => {
      const safetyBase = checkOutputSafety(context.reply, context.config);
      const safety = {
        ...safetyBase,
        needHumanReview: safetyBase.needHumanReview || context.risk?.level === 'high',
        reasons: [
          ...(safetyBase.reasons || []),
          ...(context.risk?.level === 'high' ? ['高风险邮件必须人工审核，禁止自动发送。'] : []),
        ],
      };
      return { contextPatch: { safety }, output: safety };
    },
    human_feedback: async (context) => ({
      contextPatch: {
        feedback: {
          manualRiskOverride: context.emailPayload.manualRiskOverride || null,
          humanReview: context.emailPayload.humanReview || null,
        },
      },
      output: { recorded: Boolean(context.emailPayload.manualRiskOverride || context.emailPayload.humanReview) },
    }),
  };
}
```

- [ ] **Step 3: Create `runEmailAgent()`**

Create `src/lib/email-ai-control/email-agent.js` with:

```js
export async function runEmailAgent({ emailPayload, config, skills, env, fetchImpl }) {
  let context = {
    emailPayload,
    config,
    env,
    fetchImpl,
    spam: null,
    risk: null,
    knowledge: { entries: [], refs: [] },
    reply: null,
    safety: null,
  };
  const trace = [];
  const configuredSkills = [...(config.agentSkills || [])]
    .filter((skill) => skill.enabled !== false)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  for (const skillConfig of configuredSkills) {
    const startedAt = Date.now();
    const runner = skills[skillConfig.key];
    if (!runner) {
      trace.push({ skillKey: skillConfig.key, status: 'skipped', durationMs: 0, reason: 'No registered runner.' });
      continue;
    }
    try {
      const result = await runner(context);
      context = { ...context, ...(result.contextPatch || {}) };
      trace.push({ skillKey: skillConfig.key, status: result.skipped ? 'skipped' : 'passed', durationMs: Date.now() - startedAt, output: result.output || {}, reason: result.reason || '' });
    } catch (error) {
      const failurePolicy = skillConfig.failurePolicy || config.agentPipeline?.defaultFailurePolicy || 'fail_closed';
      trace.push({ skillKey: skillConfig.key, status: 'failed', durationMs: Date.now() - startedAt, error: error.message, failurePolicy });
      if (failurePolicy !== 'skip_optional') throw error;
    }
  }

  return { context, agentTrace: config.agentPipeline?.traceEnabled === false ? [] : trace };
}
```

- [ ] **Step 4: Route `processEmailWithAI()` through the agent**

In `process-email.js`, build registered skills with existing engines, call `runEmailAgent()`, then assemble the existing result shape from `context`.

- [ ] **Step 5: Export agent runner**

Export `runEmailAgent` from `src/lib/email-ai-control/index.js`.

- [ ] **Step 6: Verify tests pass**

Run:

```bash
/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/rules.test.mjs
```

Expected: PASS.

### Task 3: Admin API Support

**Files:**
- Modify: `src/lib/email-ai-control/http-handlers.js`
- Modify: `src/lib/email-ai-control/store-repository.js`
- Test: `tests/rules.test.mjs`

- [ ] **Step 1: Add failing admin collection test**

Add repository assertions in `tests/rules.test.mjs`:

```js
const createdSkill = await emailAIRepo.create('agent-skills', {
  key: 'custom_test_skill',
  label: '测试 Skill',
  description: '测试管理端新增 skill。',
  enabled: true,
  order: 90,
  required: false,
  failurePolicy: 'skip_optional',
});
assert.equal(createdSkill.key, 'custom_test_skill');
const updatedSkill = await emailAIRepo.update('agent-skills', createdSkill.id, { ...createdSkill, enabled: false });
assert.equal(updatedSkill.enabled, false);
```

Run tests and expect FAIL until collection support exists.

- [ ] **Step 2: Add collection route**

In `http-handlers.js`, include `agent-skills` in the allowed collection list:

```js
if (['model-providers', 'risk-rules', 'spam-rules', 'knowledge-base', 'prompt-templates', 'output-safety-rules', 'agent-skills'].includes(resource)) {
  // Use the existing collection create/update/delete branch without changing its behavior.
}
```

- [ ] **Step 3: Verify admin support**

Run:

```bash
/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/rules.test.mjs
```

Expected: PASS.

### Task 4: Admin UI Skills Tab

**Files:**
- Modify: `src/emailAiControlApp.js`
- Modify: `src/app.js`
- Test: `tests/workbench-ui.test.mjs`

- [ ] **Step 1: Add failing browser test for Skills tab**

Extend `tests/workbench-ui.test.mjs` after opening settings/admin rules flow:

```js
await page.locator('[data-settings-primary="email-ai-admin-auth"]').click();
await waitForText(page, '管理员密码');
```

For the mounted control route, mock `/api/admin/email-ai-control` to include `agentSkills` and assert:

```js
await waitForText(page, 'Skills 编排');
await page.locator('button[data-tab="skills"]').click();
await waitForText(page, '全球语言自动翻译');
await waitForText(page, '执行链路预览');
```

Expected: FAIL because the tab does not exist.

- [ ] **Step 2: Add tab metadata and collection mapping**

In `src/emailAiControlApp.js`, add:

```js
{ key: 'skills', label: 'Skills 编排' }
```

Add mapping:

```js
skills: 'agent-skills'
skills: 'agentSkills'
```

- [ ] **Step 3: Render skills tab**

Add `renderSkills()` with summary, table, form, and flow preview. Use existing `field()`, `selectField()`, `checkboxField()`, `rowActions()`, and `saveCollectionItem()` helpers.

- [ ] **Step 4: Wire settings entry**

Update `src/app.js` constants so admin/system rule navigation can mount the `skills` tab if needed. Keep existing rule buttons intact.

- [ ] **Step 5: Verify UI test**

Run:

```bash
/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/workbench-ui.test.mjs
```

Expected: PASS.

### Task 5: Full Regression

**Files:**
- Verify only.

- [ ] **Step 1: Run all available tests**

Run:

```bash
/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/rules.test.mjs && /Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/workbench-ui.test.mjs
```

Expected:

```text
rules.test.mjs passed
workbench-ui.test.mjs passed
```

- [ ] **Step 2: Manual smoke via dev server if UI changed materially**

Run:

```bash
/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m http.server 5174
```

Open with Playwright and verify the workbench loads, settings opens, and no console/page errors appear.

- [ ] **Step 3: Stop dev server**

Send Ctrl-C to the server session.
