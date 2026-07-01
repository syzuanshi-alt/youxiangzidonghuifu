# GitHub-Inspired Skill Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Expand the email AI control center from 6 broad skills to 13 reviewed, auditable skills that improve reply quality, risk precision, knowledge confidence, and safe automation decisions.

**Architecture:** Preserve the existing `processEmailWithAI()` result contract and workbench mapping. Add focused pure helper modules under `src/lib/email-ai-control/`, wire them through `createEmailAgentSkills()`, and update default skill metadata so the admin "Skills 编排" view shows every reviewed skill. Use fail-closed gates for intent/risk/confidence/missing-field/commitment/final-action behavior.

**Tech Stack:** JavaScript ES modules, existing local mock model adapter, existing Node-based regression tests in `tests/rules.test.mjs` and `tests/workbench-ui.test.mjs`.

---

## Files

- Modify: `src/lib/email-ai-control/default-config.js` to replace the 6 default skill metadata records with the reviewed 13-skill chain.
- Modify: `src/lib/email-ai-control/agent-skills.js` to register new skill runners and keep old runner aliases where useful.
- Modify: `src/lib/email-ai-control/process-email.js` to read `context.finalAction` and expose the new audit fields without breaking existing consumers.
- Modify: `src/lib/email-ai-control/config-loader.js` and `src/lib/email-ai-control/store-repository.js` to merge missing default skill metadata into old stores.
- Modify: `src/lib/email-ai-control/knowledge-base-matcher.js` to include match reasons/keywords for confidence scoring.
- Create: `src/lib/email-ai-control/email-context-normalizer.js` for normalized text, field, attachment, and platform signals.
- Create: `src/lib/email-ai-control/intent-detector.js` for detailed intent categories and risk floors.
- Create: `src/lib/email-ai-control/emotion-detector.js` for emotion and escalation signals.
- Create: `src/lib/email-ai-control/knowledge-confidence.js` for none/weak/medium/strong knowledge confidence.
- Create: `src/lib/email-ai-control/missing-fields.js` for required-field gaps by scenario.
- Create: `src/lib/email-ai-control/commitment-risk-checker.js` for output promise/responsibility checks.
- Create: `src/lib/email-ai-control/auto-action-decider.js` for final action gates.
- Modify: `src/emailAiControlApp.js` so skill notes/details are visible in the admin table.
- Modify: `tests/rules.test.mjs` to add backend TDD coverage.
- Modify: `tests/workbench-ui.test.mjs` to assert expanded skill UI visibility.

---

### Task 1: Add Failing Backend Coverage For The 13-Skill Chain

**Files:**
- Modify: `tests/rules.test.mjs`

- [x] **Step 1: Write the failing test**

Add assertions near the existing email AI control tests:

```js
assert.deepEqual(defaultEmailAIStore.agentSkills.map((skill) => skill.key), [
  'normalize_email_context',
  'translate_global_language',
  'detect_customer_intent_detail',
  'detect_customer_emotion',
  'classify_email_risk',
  'retrieve_knowledge',
  'score_knowledge_confidence',
  'extract_missing_fields',
  'draft_reply',
  'polish_reply_tone',
  'check_commitment_risk',
  'decide_auto_action',
  'human_feedback',
]);
assert.ok(defaultEmailAIStore.agentSkills.find((skill) => skill.key === 'check_commitment_risk').notes.includes('退款'));
```

Add process assertions after `lowAIResult`:

```js
assert.ok(lowAIResult.agentTrace.some((step) => step.skillKey === 'normalize_email_context'));
assert.ok(lowAIResult.agentTrace.some((step) => step.skillKey === 'detect_customer_intent_detail'));
assert.ok(lowAIResult.agentTrace.some((step) => step.skillKey === 'score_knowledge_confidence'));
assert.ok(lowAIResult.agentTrace.some((step) => step.skillKey === 'decide_auto_action'));
assert.equal(lowAIResult.intent.primaryIntent, 'pre_sale_product_question');
assert.equal(lowAIResult.knowledgeConfidence.level, 'medium');
```

Add high-risk assertions after `highAIResult`:

```js
assert.equal(highAIResult.intent.primaryIntent, 'refund');
assert.equal(highAIResult.emotion.emotionLevel, 'threatening');
assert.equal(highAIResult.commitmentRisk.blocked, false);
assert.ok(highAIResult.decisionReasons.some((reason) => /高风险|human/i.test(reason)));
```

Add unsafe auto-send policy assertions after `autoSendLowAIResult`:

```js
const autoSendRefundResult = await processEmailWithAI({
  senderEmail: 'buyer-ai-auto-refund@example.test',
  subject: 'Refund request',
  body: 'I want a refund for my order.',
  source: 'email_auto_reply_workbench',
}, { repository: autoSendPolicyRepository });
assert.equal(autoSendRefundResult.risk.level, 'high');
assert.notEqual(autoSendRefundResult.finalAction, 'auto_send_allowed');
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/rules.test.mjs
```

Expected: FAIL because default skills still contain the old 6 keys or new audit fields are missing.

---

### Task 2: Implement Expanded Skill Metadata And Store Compatibility

**Files:**
- Modify: `src/lib/email-ai-control/default-config.js`
- Modify: `src/lib/email-ai-control/store-repository.js`
- Modify: `src/lib/email-ai-control/config-loader.js`

- [x] **Step 1: Write minimal implementation**

Replace `DEFAULT_AGENT_SKILLS` with the 13 reviewed records. Each record must include the approved `key`, Chinese `label`, specific `description`, `order` in increments of 10, `required`, `failurePolicy`, and detailed `notes`.

Add a helper in `store-repository.js`:

```js
function mergeDefaultAgentSkills(agentSkills = [], defaultSkills = createDefaultEmailAIStore().agentSkills) {
  const existing = Array.isArray(agentSkills) ? agentSkills : [];
  const byKey = new Map(existing.map((skill) => [skill.key, skill]));
  return defaultSkills.map((defaultSkill) => ({
    ...defaultSkill,
    ...(byKey.get(defaultSkill.key) || {}),
    id: byKey.get(defaultSkill.key)?.id || defaultSkill.id,
    key: defaultSkill.key,
    order: defaultSkill.order,
  }));
}
```

Use that helper in `ensureStoreShape()` for `agentSkills`. Add equivalent merge logic in `config-loader.js` when building a mock default config so old stored files also receive missing skills.

- [x] **Step 2: Run backend test**

Run the same Node test command. Expected: the default-skill assertion passes, later behavior assertions still fail because runners do not exist.

---

### Task 3: Add Pure Detection And Gate Modules

**Files:**
- Create: `src/lib/email-ai-control/email-context-normalizer.js`
- Create: `src/lib/email-ai-control/intent-detector.js`
- Create: `src/lib/email-ai-control/emotion-detector.js`
- Create: `src/lib/email-ai-control/knowledge-confidence.js`
- Create: `src/lib/email-ai-control/missing-fields.js`
- Create: `src/lib/email-ai-control/commitment-risk-checker.js`
- Create: `src/lib/email-ai-control/auto-action-decider.js`
- Modify: `src/lib/email-ai-control/knowledge-base-matcher.js`

- [x] **Step 1: Implement focused helpers**

Implement these exported functions:

```js
export function normalizeEmailContext(emailPayload = {}) { /* returns normalizedText/threadContext/detectedFields */ }
export function detectCustomerIntentDetail(context = {}) { /* returns primaryIntent/secondaryIntents/intentConfidence/intentReasons/riskFloor */ }
export function detectCustomerEmotion(context = {}) { /* returns emotionLevel/emotionReasons/escalationSignals */ }
export function scoreKnowledgeConfidence(context = {}) { /* returns level/score/reasons/missingKnowledgeReason */ }
export function extractMissingFields(context = {}) { /* returns missingFields/questionToAsk/missingFieldSeverity */ }
export function checkCommitmentRisk(context = {}) { /* returns blocked/reasons/matchedPatterns */ }
export function decideAutoAction(context = {}) { /* returns finalAction/decisionReasons/autoSendEligibility */ }
```

Use deterministic keyword groups for this first implementation. Risk floors must be:

```js
refund|return|exchange|chargeback|quality_complaint|signed_not_received|bad_review_threat|platform_complaint|legal_threat|compensation_request -> high
shipment_urgency|logistics_abnormal|order_status_query -> medium
pre_sale_product_question|tax_shipping_fee|delivery_time_question -> low
```

Update `matchKnowledgeBase()` to return `matchedKeywords` and `matchReasons`.

- [x] **Step 2: Run backend test**

Run the same Node test command. Expected: helper modules load, but agent trace behavior still fails until runners are wired.

---

### Task 4: Wire The New Skill Runners

**Files:**
- Modify: `src/lib/email-ai-control/agent-skills.js`
- Modify: `src/lib/email-ai-control/reply-generator.js` only if the draft skill needs missing-field or confidence context.

- [x] **Step 1: Register skill runners**

Add imports for the new helper modules and register runners for:

```js
normalize_email_context
detect_customer_intent_detail
detect_customer_emotion
classify_email_risk
score_knowledge_confidence
extract_missing_fields
polish_reply_tone
check_commitment_risk
decide_auto_action
```

Keep aliases for old configured stores:

```js
classify_email: async (context) => skills.classify_email_risk(context)
review_risk: async (context) => skills.check_commitment_risk(context)
```

`classify_email_risk` must combine spam, risk rules, intent risk floor, and emotion escalation. `draft_reply` must skip customer-visible drafts when risk is high, confidence is weak/none, or missing fields are critical.

- [x] **Step 2: Run backend test**

Run the same Node test command. Expected: backend assertions pass or reveal exact gate logic gaps.

---

### Task 5: Preserve Public Result Shape And Add Audit Fields

**Files:**
- Modify: `src/lib/email-ai-control/process-email.js`
- Modify: `src/lib/email-ai-control/workbench-mapper.js` only if existing UI needs the new final action reasons.

- [x] **Step 1: Expose audit fields**

Return these additional fields from `processEmailWithAI()`:

```js
intent: context.intent || null,
emotion: context.emotion || null,
knowledgeConfidence: context.knowledgeConfidence || null,
missingFields: context.missingFields || null,
commitmentRisk: context.commitmentRisk || null,
decisionReasons: context.decisionReasons || [],
```

Use `context.finalAction` when present, falling back to the existing `finalActionFromResult()` logic.

- [x] **Step 2: Run backend test**

Run the same Node test command. Expected: backend regression passes.

---

### Task 6: Add Admin UI Visibility For Reviewed Skill Content

**Files:**
- Modify: `src/emailAiControlApp.js`
- Modify: `tests/workbench-ui.test.mjs`

- [x] **Step 1: Write failing UI test**

In the skills UI test, assert that the expanded skill names and notes render:

```js
await waitForText(page, '承诺与责任风险复查');
await waitForText(page, '自动处理资格判定');
await waitForText(page, '退款、补发、赔偿');
```

- [x] **Step 2: Run UI test to verify failure**

Run:

```bash
/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/workbench-ui.test.mjs
```

Expected: FAIL until UI renders notes.

- [x] **Step 3: Update UI**

In `renderSkills()`, add a compact notes row/column so each skill's `notes` appears in the table or flow cards.

- [x] **Step 4: Run UI test**

Run the same UI test command. Expected: PASS.

---

### Task 7: Final Regression And Commit

**Files:**
- All modified implementation and test files.

- [x] **Step 1: Run full regression**

Run:

```bash
/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/rules.test.mjs
/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/workbench-ui.test.mjs
```

Expected: both tests pass.

- [x] **Step 2: Review diff**

Run:

```bash
git diff --stat
git diff -- docs/superpowers/specs/2026-07-01-github-inspired-skill-enhancement-design.md
```

Expected: implementation files changed; the approved design spec is unchanged unless a review-approved correction is needed.

- [x] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-07-01-github-inspired-skill-enhancement-implementation.md src/lib/email-ai-control src/emailAiControlApp.js tests/rules.test.mjs tests/workbench-ui.test.mjs
git commit -m "Implement reviewed email AI skill enhancement"
```

Expected: commit succeeds on `codex/github-inspired-skill-enhancement`.

---

## Self-Review

Spec coverage: the plan maps all 13 approved skills into metadata, runner wiring, audit fields, UI visibility, and tests. It explicitly covers reply quality, risk precision, knowledge confidence, and safe automation gating.

Placeholder scan: no open-ended implementation placeholders are intended; helper behavior is constrained to deterministic keyword groups and explicit risk floors for this phase.

Type consistency: public field names use `intent`, `emotion`, `knowledgeConfidence`, `missingFields`, `commitmentRisk`, `decisionReasons`, and `finalAction` consistently across tests, process output, and agent context.
