import { SESv2Client, SendEmailCommand, GetAccountCommand } from '@aws-sdk/client-sesv2';

const sesClient = new SESv2Client({ region: process.env.AWS_REGION || 'us-east-1' });

// Cold start on this host takes ~10s for the SDK's first network call
// (credential resolution + connection setup) — warm it up at boot so the
// first real contact-form submission isn't the one paying that cost.
export function warmUpSesClient(): void {
  sesClient.send(new GetAccountCommand({})).catch(() => {
    // Best-effort only — a failure here just means the first real send
    // pays the cold-start cost instead. Not worth surfacing as an error.
  });
}

const CONTACT_FROM = process.env.CONTACT_FROM_EMAIL || 'contact@colefusion.net';
const CONTACT_TO = process.env.CONTACT_TO_EMAIL || 'colemcmannus@gmail.com';

export interface ContactSubmission {
  name: string;
  email: string;
  reason: string;
  message: string;
}

const REASON_LABELS: Record<string, string> = {
  sales: 'Sales question',
  support: 'Support / bug report',
  partnership: 'Partnership',
  other: 'Something else',
};

export async function sendContactEmail(submission: ContactSubmission): Promise<void> {
  const reasonLabel = REASON_LABELS[submission.reason] || submission.reason;

  const textBody = [
    `New contact form submission from fusionpulse.colefusion.net`,
    ``,
    `Name: ${submission.name}`,
    `Email: ${submission.email}`,
    `Reason: ${reasonLabel}`,
    ``,
    `Message:`,
    submission.message,
  ].join('\n');

  const htmlBody = `
    <div style="font-family: sans-serif; max-width: 560px;">
      <h2>New contact form submission</h2>
      <p><strong>Name:</strong> ${escapeHtml(submission.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(submission.email)}</p>
      <p><strong>Reason:</strong> ${escapeHtml(reasonLabel)}</p>
      <p><strong>Message:</strong></p>
      <p style="white-space: pre-wrap;">${escapeHtml(submission.message)}</p>
    </div>
  `;

  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: `FusionPulse Contact <${CONTACT_FROM}>`,
      Destination: { ToAddresses: [CONTACT_TO] },
      ReplyToAddresses: [submission.email],
      Content: {
        Simple: {
          Subject: { Data: `[FusionPulse] ${reasonLabel} from ${submission.name}` },
          Body: {
            Text: { Data: textBody },
            Html: { Data: htmlBody },
          },
        },
      },
    })
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
