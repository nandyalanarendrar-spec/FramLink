import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { start, stop, Client, admin } from './helpers.js';
import { parseFrom } from '../src/utils/mailer.js';

// A stand-in for Brevo's API: records every email it is asked to send, and can be told to refuse
const sent = [];
let refuse = false;
let fake;

before(async () => {
  await start();
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (refuse) {
        res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ message: 'Key not found' }));
        return;
      }
      sent.push({ headers: req.headers, mail: JSON.parse(body) });
      res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ messageId: 'x' }));
    });
  });
  await new Promise((r) => fake.listen(0, r));
  process.env.BREVO_API_KEY = 'test-key-123';
  process.env.BREVO_API_URL = `http://127.0.0.1:${fake.address().port}/v3/smtp/email`;
  process.env.MAIL_FROM = 'FarmLink <noreply@example.com>';
});
after(async () => {
  delete process.env.BREVO_API_KEY;
  delete process.env.BREVO_API_URL;
  await new Promise((r) => fake.close(r));
  await stop();
});

const codeIn = (mail) => mail.textContent.match(/\b(\d{6})\b/)[1];
let n = 0;
const register = (c, extra = {}) => {
  n++;
  return c.post('/api/auth/register', { name: `Mail User ${n}`, phone: `9123${String(450000 + n)}`, email: `mail${n}@test.local`, password: 'Passw0rd1', role: 'buyer', buyerType: 'retailer', ...extra });
};

describe('sender address', () => {
  it('reads "Name <address>" and a bare address', () => {
    assert.deepEqual(parseFrom('FarmLink <noreply@example.com>'), { name: 'FarmLink', email: 'noreply@example.com' });
    assert.deepEqual(parseFrom('"Farm Link" <a@b.com>'), { name: 'Farm Link', email: 'a@b.com' });
    assert.deepEqual(parseFrom('hello@example.com'), { name: 'FarmLink', email: 'hello@example.com' });
  });
});

describe('sending through the Brevo API', () => {
  it('registration emails the code in the format Brevo expects, and the code works', async () => {
    const before = sent.length;
    const c = new Client();
    const res = await register(c);
    assert.equal(res.status, 201);
    assert.equal(res.data.emailSent, true);
    assert.equal(res.data.devOtp, undefined, 'the code is not handed to the browser when real mail is configured');
    assert.equal(sent.length, before + 1);

    const { headers, mail } = sent.at(-1);
    assert.equal(headers['api-key'], 'test-key-123');
    assert.deepEqual(mail.sender, { name: 'FarmLink', email: 'noreply@example.com' });
    assert.equal(mail.to[0].email, `mail${n}@test.local`);
    assert.match(mail.subject, /verify your email/);
    assert.match(mail.htmlContent, new RegExp(codeIn(mail)));

    assert.equal((await c.post('/api/auth/verify-email', { otp: codeIn(mail) })).status, 200);
  });

  it('a name with HTML in it cannot inject markup into the email', async () => {
    await register(new Client(), { name: '<b>Eve</b><script>x</script>' });
    const { mail } = sent.at(-1);
    assert.doesNotMatch(mail.htmlContent, /<script>/);
    assert.match(mail.htmlContent, /&lt;b&gt;Eve&lt;\/b&gt;/);
  });

  it('forgot password emails a reset code only to registered addresses, and the emailed code resets the password', async () => {
    const c = new Client();
    await register(c);
    const email = `mail${n}@test.local`;
    const count = sent.length;

    const unknown = await new Client().post('/api/auth/forgot-password', { email: 'nobody@test.local' });
    assert.equal(unknown.status, 200);
    assert.equal(sent.length, count, 'no email for an unknown address');

    const known = await new Client().post('/api/auth/forgot-password', { email });
    assert.equal(known.status, 200);
    assert.equal(known.data.message, unknown.data.message);
    assert.equal(known.data.devOtp, undefined);
    assert.equal(sent.length, count + 1);
    const { mail } = sent.at(-1);
    assert.match(mail.subject, /reset your password/);

    const reset = await new Client().post('/api/auth/reset-password', { email, code: codeIn(mail), newPassword: 'BrandNew123' });
    assert.equal(reset.status, 200);
    assert.equal((await new Client().post('/api/auth/login', { identifier: email, password: 'BrandNew123' })).status, 200);
  });

  it('changing email sends the code to the NEW address and a notice to the old one', async () => {
    const c = new Client();
    await register(c);
    const oldEmail = `mail${n}@test.local`;
    const req = await c.post('/api/auth/email/request', { newEmail: 'moved@test.local', password: 'Passw0rd1' });
    assert.equal(req.status, 200);
    assert.equal(req.data.emailSent, true);
    const code = sent.at(-1);
    assert.equal(code.mail.to[0].email, 'moved@test.local');

    await c.post('/api/auth/email/confirm', { code: codeIn(code.mail) });
    await new Promise((r) => setTimeout(r, 200)); // the notice is sent just after the response
    const notice = sent.at(-1).mail;
    assert.equal(notice.to[0].email, oldEmail);
    assert.match(notice.subject, /security notice/);
    assert.match(notice.htmlContent, /moved@test\.local/);
  });
});

describe('when the mail service refuses (wrong key, provider down)', () => {
  before(() => { refuse = true; });
  after(() => { refuse = false; });

  it('sign-up still works and says the email did not go out; resend can be retried', async () => {
    const c = new Client();
    const res = await register(c);
    assert.equal(res.status, 201);
    assert.equal(res.data.emailSent, false);
    assert.equal(res.data.devOtp, undefined, 'no code is leaked either');
    refuse = false;
    // after the cooldown a resend works; here we only check the endpoint reports the outcome honestly
    const again = await c.post('/api/auth/resend-otp');
    assert.ok([200, 429].includes(again.status));
    refuse = true;
  });

  it('forgot password answers the same as ever, so a failure reveals nothing', async () => {
    const c = new Client();
    await register(c);
    const known = await new Client().post('/api/auth/forgot-password', { email: `mail${n}@test.local` });
    const unknown = await new Client().post('/api/auth/forgot-password', { email: 'nobody@test.local' });
    assert.equal(known.status, 200);
    assert.deepEqual(known.data, unknown.data);
  });

  it('change email tells the user it could not send', async () => {
    const c = new Client();
    await register(c);
    const res = await c.post('/api/auth/email/request', { newEmail: 'later@test.local', password: 'Passw0rd1' });
    assert.equal(res.status, 200);
    assert.equal(res.data.emailSent, false);
  });
});

describe('admin email check', () => {
  it('shows the provider (never the key) and sends a real test email to the admin', async () => {
    const a = await admin();
    const status = await a.get('/api/admin/mail');
    assert.equal(status.data.provider, 'brevo-api');
    assert.equal(status.data.from, 'noreply@example.com');
    assert.doesNotMatch(status.raw, /test-key-123/);

    const count = sent.length;
    const res = await a.post('/api/admin/mail/test');
    assert.equal(res.status, 200);
    assert.equal(sent.length, count + 1);
    assert.equal(sent.at(-1).mail.to[0].email, 'admin@test.local');
  });

  it('reports a refusal from the mail service, a missing setup, and keeps non-admins out', async () => {
    const a = new Client();
    await a.post('/api/auth/login', { identifier: 'admin@test.local', password: 'Passw0rd1' });
    refuse = true;
    const bad = await a.post('/api/admin/mail/test');
    refuse = false;
    assert.equal(bad.status, 502);
    assert.match(bad.data.message, /refused/);
    assert.doesNotMatch(JSON.stringify(bad.data), /test-key-123/);

    assert.equal((await register(new Client()).then((r) => r.status)), 201);
    const user = new Client();
    await register(user);
    assert.equal((await user.post('/api/admin/mail/test')).status, 403);

    const key = process.env.BREVO_API_KEY;
    delete process.env.BREVO_API_KEY;
    assert.equal((await a.post('/api/admin/mail/test')).status, 400);
    assert.equal((await a.get('/api/admin/mail')).data.provider, null);
    process.env.BREVO_API_KEY = key;
  });
});
