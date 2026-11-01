import { asyncHandler, AppError } from '../utils/AppError.js';
import { mailProvider, parseFrom, sendTestEmail } from '../utils/mailer.js';

// Which mail service is active (never the keys themselves)
export const mailStatus = asyncHandler(async (_req, res) => {
  const provider = mailProvider();
  res.json({ provider, from: provider ? parseFrom(process.env.MAIL_FROM || process.env.SMTP_USER).email : null });
});

// Send a real email to the admin's own address to prove delivery works
export const mailTest = asyncHandler(async (req, res) => {
  if (!mailProvider()) throw new AppError('Email is not set up on the server yet. See the README (Email).', 400);
  try {
    await sendTestEmail(req.user.email, req.user.name);
  } catch (err) {
    console.error('[mail] test failed:', err.message);
    throw new AppError(`The mail service refused it: ${err.message}`, 502);
  }
  res.json({ message: `Test email sent to ${req.user.email}`, provider: mailProvider() });
});
