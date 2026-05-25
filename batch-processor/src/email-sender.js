import nodemailer from 'nodemailer';

function buildTransport({ dryRun }) {
  if (dryRun) {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set');
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

export async function sendEmail({ subject, html, text, dryRun = false }) {
  const transport = buildTransport({ dryRun });
  const from = process.env.GMAIL_USER || (dryRun ? 'dry-run@local' : null);
  const to = process.env.EMAIL_TO || from;

  if (!to) throw new Error('EMAIL_TO (or GMAIL_USER) must be set');

  const info = await transport.sendMail({ from, to, subject, html, text });

  if (dryRun) {
    console.log('[email] DRY RUN — message envelope:');
    console.log(info.message);
  } else {
    console.log(`[email] sent to ${to} — messageId=${info.messageId}`);
  }

  return info;
}
