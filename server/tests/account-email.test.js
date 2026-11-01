import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, db, Client, person } from './helpers.js';

before(start);
after(stop);

const login = (email, password) => new Client().post('/api/auth/login', { identifier: email, password });

describe('login with email', () => {
  it('works with the email in any case and with stray spaces, and with the phone number', async () => {
    const p = await person('buyer');
    assert.equal((await login(p.email.toUpperCase(), 'Passw0rd1')).status, 200);
    assert.equal((await login(`  ${p.email}  `, 'Passw0rd1')).status, 200);
    const phone = (await p.client.get('/api/auth/me')).data.user.phone;
    assert.equal((await login(phone, 'Passw0rd1')).status, 200);
    assert.equal((await login(p.email, 'WrongPass1')).status, 401);
  });
});

describe('forgot password', () => {
  it('gives the same answer for registered and unknown emails, and hands out no code for unknown ones', async () => {
    const p = await person('buyer');
    const known = await new Client().post('/api/auth/forgot-password', { email: p.email });
    const unknown = await new Client().post('/api/auth/forgot-password', { email: 'nobody@test.local' });
    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    assert.equal(known.data.message, unknown.data.message);
    assert.ok(known.data.devOtp, 'development mode shows the code when SMTP is not set');
    assert.equal(unknown.data.devOtp, undefined);
    assert.equal((await new Client().post('/api/auth/forgot-password', { email: 'not-an-email' })).status, 400);
  });

  it('a right code sets a new password; the old one stops working; the code works once', async () => {
    const p = await person('farmer');
    const code = (await new Client().post('/api/auth/forgot-password', { email: p.email })).data.devOtp;
    const reset = (body) => new Client().post('/api/auth/reset-password', { email: p.email, ...body });

    assert.equal((await reset({ code, newPassword: 'short1' })).status, 400, 'weak password');
    assert.equal((await reset({ code: '000000', newPassword: 'BrandNew123' })).status, 400, 'wrong code');
    assert.equal((await reset({ code, newPassword: 'BrandNew123' })).status, 200);
    assert.equal((await login(p.email, 'Passw0rd1')).status, 401);
    assert.equal((await login(p.email, 'BrandNew123')).status, 200);
    assert.equal((await reset({ code, newPassword: 'AnotherOne1' })).status, 400, 'the code cannot be reused');
  });

  it('five wrong codes lock that code; an unknown email and a wrong code look the same; an old code expires', async () => {
    const p = await person('buyer');
    const code = (await new Client().post('/api/auth/forgot-password', { email: p.email })).data.devOtp;
    const reset = (email, c) => new Client().post('/api/auth/reset-password', { email, code: c, newPassword: 'BrandNew123' });
    const wrong = await reset(p.email, '111111');
    const ghost = await reset('ghost@test.local', '111111');
    assert.equal(wrong.status, 400);
    assert.equal(ghost.status, 400);
    assert.equal(wrong.data.message, ghost.data.message);
    for (let i = 0; i < 4; i++) await reset(p.email, '111111');
    assert.equal((await reset(p.email, code)).status, 429, 'locked even with the right code');

    // an expired code is refused
    const q = await person('buyer');
    const qc = (await new Client().post('/api/auth/forgot-password', { email: q.email })).data.devOtp;
    await db().collection('users').updateOne({ _id: q.id }, { $set: { 'passwordReset.expiresAt': new Date(Date.now() - 1000) } });
    assert.equal((await reset(q.email, qc)).status, 400);
  });

  it('asking again within a minute sends no new code', async () => {
    const p = await person('buyer');
    const first = await new Client().post('/api/auth/forgot-password', { email: p.email });
    const second = await new Client().post('/api/auth/forgot-password', { email: p.email });
    assert.ok(first.data.devOtp);
    assert.equal(second.status, 200);
    assert.equal(second.data.devOtp, undefined);
    // the first code still works
    assert.equal((await new Client().post('/api/auth/reset-password', { email: p.email, code: first.data.devOtp, newPassword: 'BrandNew123' })).status, 200);
  });

  it('resetting also proves the email, and signs out every device', async () => {
    const p = await person('buyer');
    const other = await login(p.email, 'Passw0rd1'); // a second device
    assert.equal(other.status, 200);
    const stillIn = new Client();
    stillIn.cookie = p.client.cookie;
    assert.equal((await stillIn.get('/api/auth/me')).status, 200);

    const code = (await new Client().post('/api/auth/forgot-password', { email: p.email })).data.devOtp;
    await new Client().post('/api/auth/reset-password', { email: p.email, code, newPassword: 'BrandNew123' });
    assert.equal((await p.client.get('/api/auth/me')).status, 401, 'the old session is gone');
    const fresh = await login(p.email, 'BrandNew123');
    assert.equal(fresh.status, 200);
  });
});

describe('changing password while logged in', () => {
  it('keeps this device logged in and signs the others out', async () => {
    const p = await person('buyer');
    const phone = new Client();
    await phone.post('/api/auth/login', { identifier: p.email, password: 'Passw0rd1' });
    assert.equal((await phone.get('/api/auth/me')).status, 200);

    const res = await p.client.post('/api/auth/change-password', { currentPassword: 'Passw0rd1', newPassword: 'BrandNew123' });
    assert.equal(res.status, 200);
    assert.equal((await p.client.get('/api/auth/me')).status, 200, 'this device stays in');
    assert.equal((await phone.get('/api/auth/me')).status, 401, 'the other device is signed out');
  });
});

describe('changing the email', () => {
  it('needs the current password, a different and free email, and a code sent to the new address', async () => {
    const p = await person('buyer');
    const taken = await person('buyer');
    const ask = (body) => p.client.post('/api/auth/email/request', body);

    assert.equal((await ask({ newEmail: 'fresh@test.local', password: 'WrongPass1' })).status, 400);
    assert.equal((await ask({ newEmail: p.email, password: 'Passw0rd1' })).status, 400, 'same email');
    assert.equal((await ask({ newEmail: taken.email, password: 'Passw0rd1' })).status, 409, 'already registered');
    assert.equal((await ask({ newEmail: 'nope', password: 'Passw0rd1' })).status, 400);
    assert.equal((await new Client().post('/api/auth/email/request', { newEmail: 'x@test.local', password: 'Passw0rd1' })).status, 401);

    const sent = await ask({ newEmail: 'Fresh@Test.Local', password: 'Passw0rd1' });
    assert.equal(sent.status, 200);
    assert.equal(sent.data.email, 'fresh@test.local');
    assert.ok(sent.data.devOtp);
    assert.equal((await ask({ newEmail: 'another@test.local', password: 'Passw0rd1' })).status, 429, 'one code a minute');

    // nothing changes until the code is confirmed
    assert.equal((await p.client.get('/api/auth/me')).data.user.email, p.email);
    assert.equal((await p.client.post('/api/auth/email/confirm', { code: '000000' })).status, 400);
    const done = await p.client.post('/api/auth/email/confirm', { code: sent.data.devOtp });
    assert.equal(done.status, 200);
    assert.equal(done.data.user.email, 'fresh@test.local');
    assert.equal(done.data.user.emailVerified, true);
    assert.equal((await login('fresh@test.local', 'Passw0rd1')).status, 200);
    assert.equal((await login(p.email, 'Passw0rd1')).status, 401, 'the old email no longer logs in');
    assert.equal((await p.client.post('/api/auth/email/confirm', { code: sent.data.devOtp })).status, 400, 'the code works once');
  });

  it('five wrong codes lock the request; an expired code is refused; a race for the same email is refused', async () => {
    const p = await person('buyer');
    const sent = await p.client.post('/api/auth/email/request', { newEmail: 'locked@test.local', password: 'Passw0rd1' });
    for (let i = 0; i < 5; i++) await p.client.post('/api/auth/email/confirm', { code: '111111' });
    assert.equal((await p.client.post('/api/auth/email/confirm', { code: sent.data.devOtp })).status, 429);

    const q = await person('buyer');
    const qs = await q.client.post('/api/auth/email/request', { newEmail: 'late@test.local', password: 'Passw0rd1' });
    await db().collection('users').updateOne({ _id: q.id }, { $set: { 'pendingEmail.expiresAt': new Date(Date.now() - 1000) } });
    assert.equal((await q.client.post('/api/auth/email/confirm', { code: qs.data.devOtp })).status, 400);

    // two people pending on the same new address: only the first to confirm gets it
    const a = await person('buyer'), b = await person('buyer');
    const ra = await a.client.post('/api/auth/email/request', { newEmail: 'shared@test.local', password: 'Passw0rd1' });
    const rb = await b.client.post('/api/auth/email/request', { newEmail: 'shared@test.local', password: 'Passw0rd1' });
    assert.equal((await a.client.post('/api/auth/email/confirm', { code: ra.data.devOtp })).status, 200);
    assert.equal((await b.client.post('/api/auth/email/confirm', { code: rb.data.devOtp })).status, 409);
  });
});
