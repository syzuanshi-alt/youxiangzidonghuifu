function sortedEnabledSkills(agentSkills = []) {
  return (Array.isArray(agentSkills) ? agentSkills : [])
    .filter((skill) => skill.enabled !== false)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function traceEntry({
  skillKey,
  status,
  startedAt,
  output = {},
  reason = '',
  error = '',
  failurePolicy = '',
} = {}) {
  return {
    skillKey,
    status,
    durationMs: Math.max(0, Date.now() - startedAt),
    output,
    reason,
    error,
    failurePolicy,
  };
}

export async function runEmailAgent({
  emailPayload = {},
  config = {},
  skills = {},
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  let context = {
    emailPayload,
    config,
    env,
    fetchImpl,
    customerLanguage: emailPayload.customerLanguage || null,
    translation: null,
    spam: null,
    risk: null,
    knowledge: { entries: [], refs: [] },
    reply: null,
    replyProvider: null,
    safety: null,
    feedback: null,
  };
  const trace = [];
  const configuredSkills = sortedEnabledSkills(config.agentSkills);

  for (const skillConfig of configuredSkills) {
    const startedAt = Date.now();
    const skillKey = skillConfig.key;
    const runner = skills[skillKey];

    if (!runner) {
      trace.push(traceEntry({
        skillKey,
        status: 'skipped',
        startedAt,
        reason: 'No registered runner.',
      }));
      continue;
    }

    try {
      const result = await runner(context);
      context = {
        ...context,
        ...(result.contextPatch || {}),
      };
      trace.push(traceEntry({
        skillKey,
        status: result.skipped ? 'skipped' : 'passed',
        startedAt,
        output: result.output || {},
        reason: result.reason || '',
      }));
    } catch (error) {
      const failurePolicy = skillConfig.failurePolicy
        || config.agentPipeline?.defaultFailurePolicy
        || 'fail_closed';
      trace.push(traceEntry({
        skillKey,
        status: 'failed',
        startedAt,
        error: error.message,
        failurePolicy,
      }));
      if (failurePolicy !== 'skip_optional') throw error;
    }
  }

  return {
    context,
    agentTrace: config.agentPipeline?.traceEnabled === false ? [] : trace,
  };
}
