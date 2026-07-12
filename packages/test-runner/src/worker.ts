import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { runTest, closeRunner } from './executor.js';
import type { TestRunRequest } from './types.js';

const QUEUE_URL = process.env.SQS_QUEUE_URL || '';
const REGION = process.env.AWS_REGION || 'us-east-1';

const sqs = new SQSClient({ region: REGION });

export async function startWorker() {
  if (!QUEUE_URL) {
    console.log('No SQS_QUEUE_URL set — running in local mode (no queue polling)');
    await new Promise(() => {}); // Keep process alive
    return;
  }

  console.log(`FusionPulse test worker polling: ${QUEUE_URL}`);

  while (true) {
    try {
      const response = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
        VisibilityTimeout: 300,
      }));

      if (!response.Messages?.length) continue;

      for (const message of response.Messages) {
        const request: TestRunRequest = JSON.parse(message.Body!);
        console.log(`Running test: ${request.runId} (${request.testType})`);

        try {
          const result = await runTest(request);
          console.log(`Test ${request.runId}: ${result.status} (${result.durationMs}ms, ${result.stepsPassed}/${result.stepsTotal} steps)`);

          // Report results back via API
          await fetch(`${process.env.API_URL || 'http://localhost:3001'}/api/internal/test-runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_API_KEY || '' },
            body: JSON.stringify(result),
          });
        } catch (err: any) {
          console.error(`Test ${request.runId} failed:`, err.message);
        }

        await sqs.send(new DeleteMessageCommand({
          QueueUrl: QUEUE_URL,
          ReceiptHandle: message.ReceiptHandle!,
        }));
      }
    } catch (err: any) {
      console.error('SQS poll error:', err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// Start worker if run directly
process.on('SIGTERM', async () => {
  await closeRunner();
  process.exit(0);
});

startWorker().catch(console.error);
