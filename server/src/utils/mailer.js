import nodemailer from 'nodemailer';

// Two ways to send, picked from the environment:
//   BREVO_API_KEY            -> Brevo's HTTP API (works on hosts that block SMTP ports)
//   SMTP_HOST/USER/PASS      -> any SMTP server, including Brevo's SMTP relay, Gmail, etc.
// With neither, nothing is sent: the code is logged and, in development only, shown on screen.
let transporter;

export const mailProvider = () => (process.env.BREVO_API_KEY ? 'brevo-api' : process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS ? 'smtp' : null);
export const mailConfigured = () => mailProvider() !== null;

function getTransporter() {
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

// "FarmLink <hello@example.com>" or just "hello@example.com"
export function parseFrom(value = '') {
  const m = String(value).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || 'FarmLink', email: m[2].trim() } : { name: 'FarmLink', email: String(value).trim() };
}
const fromHeader = () => process.env.MAIL_FROM || process.env.SMTP_USER;

// Names and addresses come from users, so they are escaped before going into HTML
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function sendViaBrevo({ to, subject, text, html }) {
  const sender = parseFrom(process.env.MAIL_FROM);
  if (!sender.email) throw new Error('MAIL_FROM must be set to a sender you verified in Brevo');
  const res = await fetch(process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Brevo answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function send(mail) {
  if (mailProvider() === 'brevo-api') return sendViaBrevo(mail);
  await getTransporter().sendMail({ from: fromHeader(), ...mail });
}

const CODE_MAILS = {
  verify: { subject: 'FarmLink: verify your email', intro: 'Your FarmLink verification code is', ignore: 'If you did not register, ignore this email.', minutes: 10 },
  reset: { subject: 'FarmLink: reset your password', intro: 'Your FarmLink password reset code is', ignore: 'If you did not ask to reset your password, ignore this email. Your password has not changed.', minutes: 15 },
  'email-change': { subject: 'FarmLink: confirm your new email', intro: 'Your code to confirm this as your new FarmLink email is', ignore: 'If you did not ask for this, ignore this email.', minutes: 10 },
};

/** Email a 6-digit code. purpose: 'verify' | 'reset' | 'email-change'. Without a mail service the code is only logged (development). Throws if sending fails. */
export async function sendCodeEmail(to, name, code, purpose = 'verify') {
  const m = CODE_MAILS[purpose];
  if (!mailConfigured()) {
    console.log(`[mail not configured] ${purpose} code for ${to}: ${code}`);
    return;
  }
  await send({
    to,
    subject: m.subject,
    text: `Hi ${name},\n\n${m.intro} ${code}. It expires in ${m.minutes} minutes.\n\n${m.ignore}`,
    html: `<div style="font-family:sans-serif"><h2>FarmLink</h2><p>Hi ${esc(name)},</p><p>${m.intro}:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>It expires in ${m.minutes} minutes. ${m.ignore}</p></div>`,
  });
}

export const sendOtpEmail = (to, name, otp) => sendCodeEmail(to, name, otp, 'verify');

/** A plain heads-up, e.g. "your email was changed", sent to the old address */
export async function sendSecurityNotice(to, name, message) {
  if (!mailConfigured()) {
    console.log(`[mail not configured] security notice for ${to}: ${message}`);
    return;
  }
  await send({
    to,
    subject: 'FarmLink: security notice',
    text: `Hi ${name},\n\n${message}\n\nIf this was not you, contact FarmLink support right away.`,
    html: `<div style="font-family:sans-serif"><h2>FarmLink</h2><p>Hi ${esc(name)},</p><p>${esc(message)}</p><p>If this was not you, contact FarmLink support right away.</p></div>`,
  });
}

/** Lets the admin check that email delivery really works. Throws if it does not. */
export async function sendTestEmail(to, name) {
  if (!mailConfigured()) throw new Error('Email is not set up on the server yet');
  await send({
    to,
    subject: 'FarmLink: test email',
    text: `Hi ${name},\n\nThis is a test from FarmLink. If you can read it, sign-up codes and password resets will reach people.`,
    html: `<div style="font-family:sans-serif"><h2>FarmLink</h2><p>Hi ${esc(name)},</p><p>This is a test from FarmLink. If you can read it, sign-up codes and password resets will reach people.</p></div>`,
  });
}
