import { getDraftEmailAIConfig } from './config-loader.js';
import { processEmailWithAI } from './process-email.js';
import { createEmailAIStoreRepository } from './store-repository.js';

export async function runEmailAITest(input = {}, {
  repository = null,
  rootDir = process.cwd(),
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const repo = repository || createEmailAIStoreRepository({ rootDir });
  const versionSource = input.versionSource || input.version_source || 'published';
  const draftConfig = versionSource === 'draft'
    ? await getDraftEmailAIConfig({ repository: repo, rootDir })
    : null;

  const result = await processEmailWithAI({
    emailId: input.emailId || input.email_id || 'local-test',
    senderEmail: input.senderEmail || input.sender_email || 'test@example.test',
    subject: input.subject || input.testSubject || input.test_subject || '',
    body: input.body || input.testBody || input.test_body || '',
    orderInfo: input.orderInfo || input.order_info || {},
    customerHistory: input.customerHistory || input.customer_history || {},
    source: 'email_auto_reply_workbench',
  }, {
    repository: repo,
    rootDir,
    env,
    fetchImpl,
  });

  const status = result.success ? 'passed' : 'failed';
  const testRun = await repo.recordTestRun({
    testInput: input,
    testResult: result,
    usedVersionId: draftConfig?.version?.id || result.configVersionId || null,
    usedMock: input.useMock !== false,
    status,
    errorMessage: result.error || '',
  });

  return {
    status,
    testRun,
    result,
  };
}
