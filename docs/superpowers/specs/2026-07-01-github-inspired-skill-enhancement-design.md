# GitHub-Inspired Skill Enhancement Design

**Date:** 2026-07-01

**Status:** Draft for user review. Do not implement until every skill below is reviewed and approved by the user.

**Goal:** Strengthen the email auto-reply agent in four areas: reply quality, risk precision, knowledge retrieval accuracy, and safe automation rate. Use open-source customer-support agent projects as workflow references, but rewrite all business logic locally for AS email support.

## Decision

Keep the existing "core Agent + Skills" architecture. Do not replace the current 6-step pipeline directly. Instead, expand it into a reviewed, fine-grained skill chain with explicit safety gates.

External GitHub projects may be used only as design references for:

- triage and specialist routing,
- human-in-the-loop escalation,
- retrieval-augmented reply drafting,
- output guardrails,
- confidence scoring,
- execution traces and auditability.

External projects must not be copied into the product as-is. Their refund, compensation, account, order, or tool-action behavior cannot be inherited because AS email handling has stricter operational risk boundaries.

## Reference Sources

Use these sources as pattern references, not as direct code dependencies:

- OpenAI customer support agents demo: `https://github.com/openai/openai-cs-agents-demo`
- LangChain human-in-the-loop documentation: `https://docs.langchain.com/oss/python/langchain/human-in-the-loop`
- LangGraph customer-support examples candidate: `https://github.com/langchain-ai/langgraph/tree/main/examples/customer-support`
- ShopBot/customer-service-agent candidate: `https://github.com/Bessiedelight/customer-service-agent`

Network note: the LangChain documentation URL returned HTTP 200 from this machine. Several GitHub pages timed out from this local network during drafting, so GitHub candidates must be manually rechecked before any detailed adoption.

## Existing Baseline

The current project already has 6 top-level skills:

1. `translate_global_language`
2. `classify_email`
3. `retrieve_knowledge`
4. `draft_reply`
5. `review_risk`
6. `human_feedback`

These are useful but too broad. For example, `classify_email` currently combines spam, intent, emotion, risk, and action suggestions. `review_risk` combines multiple safety checks. The enhancement splits these responsibilities so each skill can be audited, tested, and improved independently.

## Target Skill Chain

```text
normalize_email_context
  -> translate_global_language
  -> detect_customer_intent_detail
  -> detect_customer_emotion
  -> classify_email_risk
  -> retrieve_knowledge
  -> score_knowledge_confidence
  -> extract_missing_fields
  -> draft_reply
  -> polish_reply_tone
  -> check_commitment_risk
  -> decide_auto_action
  -> human_feedback
```

The chain is intentionally conservative. Earlier skills prepare facts and risk signals. Later skills draft, polish, and then re-check the output before any final action is chosen.

## Shared Skill Contract

Each skill must follow the existing runner style:

```js
{
  contextPatch: {},
  output: {},
  skipped: false,
  reason: ''
}
```

Each skill must be configurable in the admin "Skills 编排" view with:

- `key`
- `label`
- `description`
- `enabled`
- `order`
- `required`
- `failurePolicy`
- `notes`

Required safety skills use `fail_closed`. Optional formatting or feedback skills may use `skip_optional`.

## Skill Review Cards

### 1. `normalize_email_context`

**Label:** 邮件上下文整理

**Purpose:** Normalize subject, body, body preview, historical thread text, sender, order clues, attachment clues, and platform clues into one structured context.

**Inputs:** raw `emailPayload`, subject, body/bodyText/body_text, summary, sender, threadId, messageId, attachments when available.

**Outputs:** `normalizedText`, `threadContext`, `detectedFields`, `attachmentSignals`, `platformSignals`.

**Failure policy:** `fail_closed`.

**Can pass as low-risk only if:** it only normalizes existing data and does not infer missing facts.

**Forbidden:** infer order status, tracking status, refund status, warehouse status, uploaded evidence, or hidden customer intent.

### 2. `translate_global_language`

**Label:** 全球语言识别与翻译

**Purpose:** Detect the customer's language and create Chinese internal understanding. Customer-facing replies must follow the customer's original language.

**Inputs:** normalized text, original email fields, optional existing `customerLanguage`.

**Outputs:** `customerLanguage`, `translationZh`, `translationSource`, `languageConfidence`.

**Failure policy:** `fail_closed`.

**Can pass as low-risk only if:** reply language can be identified or safely defaulted with human-readable trace.

**Forbidden:** put Chinese explanation into customer-visible replies unless the customer's language is Chinese.

### 3. `detect_customer_intent_detail`

**Label:** 精细意图识别

**Purpose:** Detect detailed business intent before risk classification.

**Intent categories:** pre-sale product question, tax question, shipping fee question, delivery time question, order status query, shipment urgency, logistics abnormality, signed-but-not-received, quality complaint, waterproof issue, watch band issue, return, exchange, refund, chargeback, discount/compensation request, bad review threat, platform complaint, legal threat, partnership, unrelated marketing, phishing/spam.

**Inputs:** normalized text, translation, sender/domain clues.

**Outputs:** `primaryIntent`, `secondaryIntents`, `intentConfidence`, `intentReasons`.

**Failure policy:** `fail_closed`.

**Can pass as low-risk only if:** intent is a pre-sale or general FAQ question and has no order, complaint, refund, logistics abnormality, platform, legal, or strong emotion signals.

**Forbidden:** classify refund, return, exchange, quality, complaint, legal, platform, bad review, chargeback, or shipment urgency as low risk.

### 4. `detect_customer_emotion`

**Label:** 客户情绪与升级判断

**Purpose:** Detect emotional intensity and escalation signals that should affect risk.

**Inputs:** normalized text, translation, intent result, thread repetition signals when available.

**Outputs:** `emotionLevel`, `emotionReasons`, `escalationSignals`.

**Emotion levels:** calm, concerned, urgent, dissatisfied, angry, threatening.

**Failure policy:** `skip_optional` for first implementation, but missing output must not reduce risk.

**Can pass as low-risk only if:** emotion is calm or mildly concerned and no repeated chasing, anger, threat, or complaint signal exists.

**Forbidden:** allow strong emotion to increase automation. Strong emotion must move the message toward human review.

### 5. `classify_email_risk`

**Label:** 风险分层

**Purpose:** Combine spam rules, detailed intent, emotion, keywords, knowledge risk, and business policy into one risk level and suggested action.

**Inputs:** spam rules, risk rules, detailed intent, emotion, normalized context, config.

**Outputs:** `risk.level`, `risk.reasons`, `risk.matchedRules`, `risk.suggestedAction`.

**Risk levels:** spam, low, medium, high.

**Failure policy:** `fail_closed`.

**Low-risk examples:** general product material, size, color, stock, tax/fee FAQ, normal delivery estimate question without order urgency.

**Medium-risk examples:** shipment urgency, delayed logistics, unclear order issue, repeated follow-up, missing information but no direct complaint.

**High-risk examples:** refund, return, exchange, chargeback, quality complaint, package signed but not received, legal threat, platform complaint, bad review threat, compensation request, responsibility dispute.

**Forbidden:** downgrade medium/high signals because a low-risk FAQ keyword also appears.

### 6. `retrieve_knowledge`

**Label:** 知识库检索与依据选择

**Purpose:** Retrieve FAQ, policy, standard wording, and forbidden-expression entries by intent, risk, keyword, and later semantic matching.

**Inputs:** normalized text, detailed intent, risk, customer language, config knowledge base.

**Outputs:** `knowledge.entries`, `knowledge.refs`, `knowledge.matchedKeywords`, `knowledge.matchReasons`.

**Failure policy:** `skip_optional`, but missing knowledge must reduce automation eligibility.

**Can pass as low-risk only if:** at least one enabled low-risk knowledge entry matches the customer's actual question.

**Forbidden:** treat non-matching knowledge as factual support.

### 7. `score_knowledge_confidence`

**Label:** 知识库置信度评分

**Purpose:** Decide whether retrieved knowledge is strong enough to support a customer-visible reply.

**Inputs:** retrieved entries, intent result, risk result, normalized text.

**Outputs:** `knowledgeConfidence`, `knowledgeConfidenceReasons`, `missingKnowledgeReason`.

**Confidence levels:** none, weak, medium, strong.

**Failure policy:** `fail_closed`.

**Strong confidence requires:** matching intent, matching risk level, specific FAQ/policy coverage, and no conflict with forbidden expressions.

**Forbidden:** allow auto-send or clean draft-only flow when confidence is none or weak.

### 8. `extract_missing_fields`

**Label:** 缺失信息识别

**Purpose:** Detect what information is missing before drafting or taking action.

**Inputs:** normalized context, intent, risk, knowledge entries, existing order clues.

**Outputs:** `missingFields`, `questionToAsk`, `missingFieldSeverity`.

**Typical fields:** order number, buyer email, tracking number, product model, issue photo/video, package photo, platform screenshot, desired resolution.

**Failure policy:** `fail_closed`.

**Can pass as low-risk only if:** the FAQ answer does not require the missing field.

**Forbidden:** promise processing, investigation, refund, reshipment, or delivery timing when required fields are missing.

### 9. `draft_reply`

**Label:** 回复草稿生成

**Purpose:** Generate a customer-visible draft for safe cases or an internal suggestion for risky cases.

**Inputs:** customer language, normalized context, intent, emotion, risk, knowledge, confidence, missing fields, config, model provider.

**Outputs:** `reply.draft`, `reply.internalSuggestion`, `reply.translationZh`, `reply.tone`, `reply.customerLanguage`.

**Failure policy:** `fail_closed`.

**Customer-visible draft allowed only if:** risk is low, knowledge confidence is medium/strong, no severe missing field blocks the answer, and no commitment risk appears.

**Forbidden:** invent order status, tracking number, warehouse verification, uploaded evidence, refund, return approval, replacement, discount, compensation, legal conclusion, or platform outcome.

### 10. `polish_reply_tone`

**Label:** 真人客服语气润色

**Purpose:** Improve low-risk customer-facing drafts so they sound natural, concise, and helpful.

**Inputs:** draft reply, customer language, tone policy, forbidden-expression list.

**Outputs:** `reply.polishedDraft`, `toneNotes`, `toneChanged`.

**Failure policy:** `skip_optional`.

**Can pass as low-risk only if:** it preserves facts and makes no new promises.

**Forbidden:** add new facts, add discount/compensation language, increase certainty, or remove required human-review wording.

### 11. `check_commitment_risk`

**Label:** 承诺与责任风险复查

**Purpose:** Re-check generated output for promises, responsibility admissions, and unsafe operational statements.

**Inputs:** draft/polished draft, internal suggestion, risk, knowledge, output safety rules.

**Outputs:** `commitmentRisk.blocked`, `commitmentRisk.reasons`, `commitmentRisk.matchedPatterns`.

**Failure policy:** `fail_closed`.

**Must block:** refund promise, return approval, replacement/reshipment promise, compensation, discount promise, guaranteed delivery time, confirmed warehouse action, confirmed platform handling, responsibility admission, legal conclusion, invented tracking/order facts, placeholder leakage, attachment reference when no attachment exists.

**Forbidden:** let a polished draft bypass safety because the original risk was low.

### 12. `decide_auto_action`

**Label:** 自动处理资格判定

**Purpose:** Produce the final action after all classification, drafting, and safety checks.

**Inputs:** spam result, risk, knowledge confidence, missing fields, reply, safety, commitment risk, strategy config.

**Outputs:** `finalAction`, `decisionReasons`, `autoSendEligibility`.

**Failure policy:** `fail_closed`.

**Allowed final actions:** `ignore_spam`, `draft_only`, `human_review`, `blocked`, optional `auto_send_allowed`.

**Default:** no auto-send. `auto_send_allowed` can only appear if the strategy config explicitly enables it and every low-risk gate passes.

**Forbidden:** auto-send medium-risk, high-risk, weak-knowledge, missing-critical-field, or commitment-risk messages.

### 13. `human_feedback`

**Label:** 人工反馈学习

**Purpose:** Record human review, manual risk override, edited reply, archive decision, send result, and reasons for future rule and knowledge updates.

**Inputs:** manual review state, edited reply, final action, agent trace, knowledge refs, risk decision.

**Outputs:** `feedback.recorded`, `learningSignals`, `recommendedRuleUpdates`.

**Failure policy:** `skip_optional`.

**Can pass as low-risk only if:** it records feedback without changing the current automated decision.

**Forbidden:** automatically rewrite production rules, prompt templates, or knowledge base entries without user/admin approval.

## Risk Gates

The following gates must be enforced before any customer-visible reply is considered safe:

1. Not spam/phishing.
2. Intent is low-risk.
3. Emotion is calm or mildly concerned.
4. Risk level is low.
5. Knowledge confidence is medium or strong.
6. No critical missing fields.
7. Draft exists in the customer's language.
8. No forbidden commitment or responsibility statement.
9. Strategy config allows the selected final action.

If any gate fails, the result must move to `human_review`, `blocked`, or `ignore_spam`.

## Testing Requirements

Backend tests must cover:

1. Each default skill appears in the published config with stable key/order.
2. Refund/return/exchange/chargeback always become high risk.
3. Quality complaint, signed-but-not-received, bad review threat, legal threat, and platform complaint always become high risk.
4. Shipment urgency and logistics abnormality become at least medium risk.
5. Low-risk FAQ with strong knowledge can produce a draft.
6. Weak/no knowledge prevents auto-send and records the reason.
7. Missing order/tracking/evidence fields prevent operational promises.
8. Polishing cannot add new promises or facts.
9. Commitment-risk checker blocks unsafe draft text.
10. Final action never auto-sends unless all gates pass and config explicitly allows it.

UI tests must cover:

1. "Skills 编排" renders the expanded skill list in order.
2. Skill detail notes are visible for admin review.
3. Local test output includes each skill trace.
4. A high-risk sample displays human review or blocked status.

## Rollout Plan After User Review

Implementation must not start until the user approves this document.

After approval:

1. Create a detailed implementation plan.
2. Add default expanded skill metadata.
3. Implement the new pure helper modules behind the current agent runner.
4. Preserve existing public result fields so the workbench does not break.
5. Extend tests before changing risky behavior.
6. Run existing regression tests:

```bash
/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/rules.test.mjs
/Users/renshuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tests/workbench-ui.test.mjs
```

## Non-Goals

This design does not add direct order-system mutation, automatic refunds, automatic replacements, automatic compensation, automatic legal/platform handling, CRM writes, model training, or unreviewed GitHub code imports.

## Review Checklist

Before implementation, the user should review:

- whether every skill name is understandable,
- whether every forbidden boundary matches AS business policy,
- whether each low/medium/high risk example is correct,
- whether any missing business scenario should become a new skill or rule,
- whether `auto_send_allowed` should remain disabled by default.
