# Core Agent Skills Design

**Goal:** Turn the email auto-reply AI into a "core brain + skills" architecture while keeping the current workbench process API and user-facing workflow stable.

**Decision:** Use a thin orchestration layer around the existing AI control modules. Do not replace the current rule engines, knowledge matcher, reply generator, safety checker, or language helpers. Wrap them as standard skills and expose skill orchestration in the admin UI.

## Current State

The current backend entry point is `processEmailWithAI()` in `src/lib/email-ai-control/process-email.js`. It runs a fixed pipeline:

1. Detect customer language.
2. Evaluate spam rules.
3. Evaluate risk rules.
4. Match knowledge base entries.
5. Generate reply.
6. Check output safety.
7. Decide final action.

The admin UI in `src/emailAiControlApp.js` already manages model providers, risk rules, spam rules, knowledge base entries, prompt templates, output safety rules, versions, and local tests. This gives us a natural place to add skill visibility and configuration without changing the main workbench screen.

## Target Architecture

Add a new agent orchestration layer:

```text
processEmailWithAI
  -> runEmailAgent
      -> translate_global_language
      -> classify_email
      -> retrieve_knowledge
      -> draft_reply
      -> review_risk
      -> human_feedback
      -> final action decision
```

The core agent is the decision maker. It owns the execution context, chooses whether to run or skip a skill, collects trace data, and returns the final result in the same shape that the workbench already consumes.

Skills are focused functions with a shared contract:

```js
{
  key: 'draft_reply',
  label: '回复生成',
  enabled: true,
  order: 40,
  required: true,
  run: async (context) => ({
    contextPatch: {},
    output: {},
    skipped: false,
    reason: ''
  })
}
```

## Initial Skills

### `translate_global_language`

Detects customer language and creates a Chinese internal reference when possible. It uses existing helpers in `src/emailTranslation.js`. Customer-facing replies must remain in the customer's language; Chinese output is only for internal understanding.

### `classify_email`

Runs spam and risk classification. It wraps `evaluateSpamRules()` and `evaluateRiskRules()`. If spam is detected, the skill records `ignore_spam` guidance and prevents normal reply generation unless a later admin configuration explicitly changes that behavior.

### `retrieve_knowledge`

Runs `matchKnowledgeBase()` against the current email, risk result, and published config. It records matched entries and references used by reply generation.

### `draft_reply`

Runs `generateEmailAIReply()`. It generates either a customer-facing draft or an internal suggestion. Spam emails get no customer reply.

### `review_risk`

Runs `checkOutputSafety()` and applies high-risk escalation rules. It is the second-pass safety gate for refund promises, legal language, compensation, reshipment promises, fabricated order/logistics details, privacy-sensitive content, and important customer flags when available.

### `human_feedback`

Records feedback-related context when present: manual risk override, manual archive, human review notes, and edited reply content. The first implementation records this in the agent trace and test output only; it does not train a model or create a separate feedback database.

## Data Model

Extend the email AI store with:

```js
agentSkills: [
  {
    id: 'skill-classify-email',
    key: 'classify_email',
    label: '邮件分类',
    description: '判断垃圾邮件、风险等级和建议动作。',
    enabled: true,
    order: 20,
    required: true,
    failurePolicy: 'fail_closed',
    notes: ''
  }
],
agentPipeline: {
  enabled: true,
  traceEnabled: true,
  defaultFailurePolicy: 'fail_closed'
}
```

Version snapshots must include `agentSkillsSnapshot` and `agentPipelineSnapshot`, so a published version can be rolled back with the exact skill order and switches that produced it.

## API Behavior

Keep existing endpoints stable:

- `/api/email-ai/process` returns the existing result shape plus `agentTrace`.
- `/api/email-ai/status` returns existing status plus a compact `agent` summary.
- `/api/admin/email-ai-control` returns the sanitized store including `agentSkills` and `agentPipeline`.

Add admin collection support:

- `GET/POST/PUT/DELETE /api/admin/email-ai-control/agent-skills`
- `PUT /api/admin/email-ai-control/agent-pipeline`

The public workbench does not need to know about this change. Existing mapping in `workbench-mapper.js` continues reading `spam`, `risk`, `reply`, `safety`, and `finalAction`.

## Admin UI

Add a new tab in `src/emailAiControlApp.js`:

```text
Skills 编排
```

The tab contains:

1. **Agent 总览:** pipeline enabled status, trace status, current published version, enabled skill count.
2. **Skill 配置表:** label, key, order, required, failure policy, enabled, actions.
3. **Skill 编辑表单:** label, description, order, required, enabled, failure policy, notes.
4. **执行链路预览:** visual text flow showing the enabled skills in execution order.

Enhance the existing `本地测试` tab to show `agentTrace` in the JSON output. This is enough for the first version; no new workflow canvas or drag-and-drop editor is needed.

## Failure Handling

The initial failure policies are:

- `fail_closed`: return a failed AI result or force human review.
- `skip_optional`: skip the failed optional skill and continue.

Required safety skills use `fail_closed`. Optional feedback logging uses `skip_optional`.

If a skill fails, the trace records:

```js
{
  skillKey: 'review_risk',
  status: 'failed',
  durationMs: 12,
  error: 'Output safety checker returned an invalid result.',
  failurePolicy: 'fail_closed'
}
```

## Testing Plan

Add backend unit coverage for:

1. Default store includes agent skills and pipeline configuration.
2. `runEmailAgent()` returns the same high-level result fields as `processEmailWithAI()`.
3. Spam mail skips customer reply generation and records trace.
4. High-risk mail forces human review after `review_risk`.
5. Global language skill detects Spanish/English/Chinese and preserves reply-language expectations.
6. Admin repository can create, update, toggle, and delete agent skills.

Add browser/UI coverage for:

1. Admin settings can open `Skills 编排`.
2. Skill rows render in order.
3. Enable/disable and edit forms call the correct admin endpoints.
4. Local test output includes `agentTrace`.

Run existing tests afterward:

```bash
/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/rules.test.mjs
/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/workbench-ui.test.mjs
```

## Non-Goals

This phase does not add CRM lookup, order system lookup, automatic ticket creation, model training, drag-and-drop workflow editing, or live production sending changes. Those can be added as new skills after the orchestration layer is stable.

## Rollout

1. Add default skills and pipeline fields to store shape.
2. Add skill registry and agent runner.
3. Route `processEmailWithAI()` through the agent runner.
4. Add admin API support for skill configuration.
5. Add `Skills 编排` UI tab.
6. Extend tests.
7. Verify existing workbench behavior still passes.
