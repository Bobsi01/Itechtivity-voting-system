import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';
import { encodeStubPayload, generateStubSignature } from '../crypto/stub-tokens';

const compose = readFileSync('docker-compose.yml', 'utf8');
const password = /POSTGRES_PASSWORD:\s*(\S+)/.exec(compose)?.[1];
assert(password);
const database = 'itech_audit_20261024_f7ac5223';
process.env.DATABASE_URL = `postgresql://itech_admin:${encodeURIComponent(password)}@127.0.0.1:5433/${database}`;
process.env.DIRECT_URL = process.env.DATABASE_URL;
assert(new URL(process.env.DATABASE_URL).hostname === '127.0.0.1');
assert(new URL(process.env.DATABASE_URL).pathname === `/${database}`);
const db = new PrismaClient();
const base = 'http://127.0.0.1:3310';
const secret = 'audit-hmac-539bfe825ee34e0dae4b1400a6f48ec0';
const suffix = crypto.randomBytes(4).toString('hex');
const fixturePassword = crypto.randomUUID();
type Json = { [key: string]: unknown };
async function request(path: string, cookie = '', body?: object | string, key?: string, method?: string) {
  const response = await fetch(base + path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { cookie, 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const data = await response.json() as Json;
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
}
async function main() {
  const booth = await db.booth.create({ data: { code: `QA${suffix}`, projectTitle: 'Isolated QA', capstoneCategory: 'BSCS' } });
  const booth2 = await db.booth.create({ data: { code: `QB${suffix}`, projectTitle: 'Isolated QA second', capstoneCategory: 'BSCS' } });
  const cookies = new Map<Role, string>();
  const users = new Map<Role, string>();
  for (const role of ['ADMIN', 'PRODUCTION', 'REGISTRATION', 'EXHIBITOR'] as Role[]) {
    const email = `${role.toLowerCase()}-${suffix}@qa.example.test`;
    const user = await db.user.create({ data: { email, fullName: 'Isolated QA', passwordHash: await bcrypt.hash(fixturePassword, 10), role, boothId: role === 'EXHIBITOR' ? booth.id : null } });
    users.set(role, user.id);
    const login = await request('/api/auth/login', '', { email, password: fixturePassword });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    assert(login.cookie);
    cookies.set(role, login.cookie);
  }
  console.log('PASS four roles authenticated through HTTP login');
  const award = await db.award.findFirstOrThrow({ where: { isActive: true } });
  const cards: string[] = [];
  for (let index = 1; index <= 7; index++) {
    const serial = `Q27-Q${suffix.toUpperCase()}-${String(index).padStart(4, '0')}`;
    cards.push(serial);
    const stubSerial = `${serial}-S${award.slotNumber}`;
    await db.bingoCard.create({ data: { cardSerial: serial, masterQrHash: `MASTER:${serial}`, stubs: { create: { slotNumber: award.slotNumber, awardId: award.id, stubSerial, signatureHash: generateStubSignature(stubSerial, award.slotNumber, secret) } } } });
  }
  const reg = cookies.get('REGISTRATION')!;
  const exhibitor = cookies.get('EXHIBITOR')!;
  const bindBody = (card: string) => ({ buyerType: 'VISITOR', buyerName: `Private Buyer ${suffix}`, affiliation: 'Private Affiliation', contactInfo: 'private-contact', cardSerials: [card] });
  const voteBody = (card: string, target = booth.id) => ({ boothId: target, qrPayload: encodeStubPayload(`${card}-S${award.slotNumber}`, award.slotNumber, secret) });
  const regKey = `qa-reg-${suffix}`;
  const regRace = await Promise.all([request('/api/registration/bind', reg, bindBody(cards[0]), regKey), request('/api/registration/bind', reg, bindBody(cards[1]), regKey)]);
  assert.deepEqual(regRace.map(result => result.status).sort(), [200, 409]);
  assert.equal(await db.registrationTransaction.count({ where: { processedByUserId: users.get('REGISTRATION') } }), 1);
  console.log('PASS distinct registration same-key race: 200/409; one transaction');
  const active = regRace[0].status === 200 ? cards[0] : cards[1];
  const replayReg = await request('/api/registration/bind', reg, bindBody(active), regKey);
  assert.deepEqual(replayReg.data, regRace.find(result => result.status === 200)!.data);
  for (const card of cards.slice(2, 5)) assert.equal((await request('/api/registration/bind', reg, bindBody(card), `bind-${card}`)).status, 200);
  const voteKey = `qa-vote-${suffix}`;
  const voteRace = await Promise.all([request('/api/vote', exhibitor, voteBody(cards[2]), voteKey), request('/api/vote', exhibitor, voteBody(cards[3]), voteKey)]);
  assert.deepEqual(voteRace.map(result => result.status).sort(), [200, 409]);
  assert.equal(await db.vote.count({ where: { boothId: booth.id } }), 1);
  console.log('PASS distinct vote same-key race: 200/409; one vote');
  const voted = voteRace[0].status === 200 ? cards[2] : cards[3];
  const sameKey = `same-vote-${suffix}`;
  const sameRace = await Promise.all([request('/api/vote', exhibitor, voteBody(active), sameKey), request('/api/vote', exhibitor, voteBody(active), sameKey)]);
  assert.deepEqual(sameRace.map(result => result.status), [200, 200]);
  assert.deepEqual(sameRace[0].data, sameRace[1].data);
  console.log('PASS same payload race: identical receipt, exactly one additional vote');
  for (const path of ['/api/vote', '/api/registration/bind']) {
    const cookie = path.includes('vote') ? exhibitor : reg;
    assert.equal((await request(path, cookie, '{broken', `raw-${suffix}`)).status, 400);
    assert.equal((await request(path, cookie, JSON.stringify({ fill: 'x'.repeat(33000) }), `large-${suffix}`)).status, 413);
  }
  console.log('PASS malformed JSON 400 and oversized JSON 413 on both mutation routes');
  const rollbackBind = await request('/api/registration/bind', reg, { ...bindBody(cards[5]), cardSerials: [cards[5], `Q27-Q${suffix.toUpperCase()}-9999`] }, `rollback-bind-${suffix}`);
  assert.equal(rollbackBind.status, 400);
  assert.equal((await db.bingoCard.findUniqueOrThrow({ where: { cardSerial: cards[5] } })).status, 'GENERATED');
  const rollbackVote = await request('/api/vote', cookies.get('ADMIN')!, voteBody(cards[4], crypto.randomUUID()), `rollback-vote-${suffix}`);
  assert.equal(rollbackVote.status, 500);
  assert.equal((await db.ticketStub.findUniqueOrThrow({ where: { stubSerial: `${cards[4]}-S${award.slotNumber}` } })).status, 'ACTIVATED');
  assert.equal(await db.idempotencyLog.count({ where: { idempotencyKey: { contains: `rollback-vote-${suffix}` } } }), 0);
  console.log('PASS missing-card registration and foreign-key vote failure preserve inventory; failed vote creates no receipt');
  assert.equal((await request('/api/vote', exhibitor, voteBody(cards[4], booth2.id), `tenant-${suffix}`)).status, 403);
  const publicResult = await request('/api/cards/validate', '', { code: voted });
  assert.equal(publicResult.status, 200);
  const publicText = JSON.stringify(publicResult.data);
  assert(!publicText.includes('Private Buyer') && !publicText.includes('Private Affiliation') && !publicText.includes('private-contact') && !publicText.includes(booth.code));
  assert.equal(publicResult.data.demographics, null);
  assert.equal((await request('/api/cards/validate', '', { code: voteBody(voted).qrPayload })).status, 200);
  assert.equal((await request('/api/cards/validate', '', { code: `${voted}-S${award.slotNumber}.INVALID0` })).status, 400);
  console.log('PASS public serial has no buyer, contact, affiliation or destination disclosure; tenant mismatch denied');
  for (const role of ['ADMIN', 'PRODUCTION', 'REGISTRATION', 'EXHIBITOR'] as Role[]) {
    const cookie = cookies.get(role)!;
    const expected: Array<[string, number]> = [['/api/admin/stats', role === 'ADMIN' ? 200 : 403], ['/api/production/files', role === 'ADMIN' || role === 'PRODUCTION' ? 200 : 403]];
    for (const [path, status] of expected) {
      const result = await request(path, cookie);
      assert.equal(result.status, status, `${role} ${path}: ${JSON.stringify(result.data)}`);
    }
    if (role !== 'ADMIN' && role !== 'REGISTRATION') assert.equal((await request('/api/registration/bind', cookie, bindBody(cards[5]), `role-reg-${suffix}`)).status, 403);
    if (role !== 'ADMIN' && role !== 'EXHIBITOR') assert.equal((await request('/api/vote', cookie, voteBody(cards[4]), `role-vote-${suffix}`)).status, 403);
  }
  console.log('PASS four-role admin/production matrix and wrong-role registration/vote negatives');
  const admin = cookies.get('ADMIN')!;
  const programCode = `Q${suffix}`.toUpperCase();
  assert.equal((await request('/api/admin/programs', admin, { code: programCode, name: 'Isolated QA Program', order: 999 })).status, 200);
  const program = await db.academicProgram.findUniqueOrThrow({ where: { code: programCode } });
  assert.equal((await request('/api/admin/programs', admin, { id: program.id, name: 'Isolated QA Program Updated', isActive: false }, undefined, 'PATCH')).status, 200);
  assert.equal((await db.academicProgram.findUniqueOrThrow({ where: { id: program.id } })).isActive, false);
  assert.equal((await request('/api/admin/audit-logs?page=invalid', admin)).status, 400);
  assert.equal((await request('/api/admin/audit-logs?actorRole=UNKNOWN', admin)).status, 400);
  assert.equal((await request('/api/admin/audit-logs?unexpected=field', admin)).status, 400);
  assert.equal((await request('/api/admin/audit-logs', admin)).status, 200);
  assert.equal((await request('/api/admin/export?type=invalid', admin)).status, 400);
  for (const type of ['standings', 'votes', 'registrations']) {
    const response = await fetch(`${base}/api/admin/export?type=${type}`, { headers: { cookie: admin } });
    assert.equal(response.status, 200);
    assert(response.headers.get('content-type')?.includes('text/csv'));
    assert((await response.text()).length > 50);
  }
  const calibration = await fetch(`${base}/api/production/calibration`, { headers: { cookie: cookies.get('PRODUCTION')! } });
  assert.equal(calibration.status, 200);
  assert(calibration.headers.get('content-type')?.includes('application/pdf'));
  assert.equal(Buffer.from(await calibration.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  const boundCard = await db.bingoCard.findUniqueOrThrow({ where: { cardSerial: voted } });
  assert.equal((await request('/api/admin/cards', admin, { cardId: boundCard.id, action: 'VOID' }, undefined, 'PATCH')).status, 200);
  assert.equal((await request('/api/admin/cards', admin, { cardId: boundCard.id, action: 'RESTORE' }, undefined, 'PATCH')).status, 200);
  assert.equal((await db.ticketStub.findUniqueOrThrow({ where: { stubSerial: `${voted}-S${award.slotNumber}` } })).status, 'REDEEMED');
  assert.equal((await db.bingoCard.findUniqueOrThrow({ where: { id: boundCard.id } })).status, 'ACTIVATED');
  const untouched = await db.bingoCard.findUniqueOrThrow({ where: { cardSerial: cards[6] } });
  assert.equal((await request('/api/admin/cards', admin, { cardId: untouched.id, action: 'RESTORE' }, undefined, 'PATCH')).status, 200);
  assert.equal((await db.bingoCard.findUniqueOrThrow({ where: { id: untouched.id } })).status, 'GENERATED');
  const malformedRoutes: Array<[string, string, string, number]> = [
    ['/api/admin/programs', admin, 'POST', 2048], ['/api/admin/programs', admin, 'PATCH', 2048],
    ['/api/admin/config', admin, 'POST', 32 * 1024], ['/api/admin/booths', admin, 'POST', 3 * 1024 * 1024],
    ['/api/admin/cards', admin, 'PATCH', 2048], ['/api/production/generate', cookies.get('PRODUCTION')!, 'POST', 2048],
    ['/api/exhibitor/members', exhibitor, 'POST', 2048], ['/api/exhibitor/booth', exhibitor, 'PATCH', 5 * 1024 * 1024],
  ];
  for (const [path, cookie, method, limit] of malformedRoutes) {
    assert.equal((await request(path, cookie, '{broken', undefined, method)).status, 400, `${method} ${path} malformed`);
    assert.equal((await request(path, cookie, JSON.stringify({ fill: 'x'.repeat(limit + 1) }), undefined, method)).status, 413, `${method} ${path} oversized`);
  }
  console.log('PASS program create/update, audit query400, all CSV exports, calibration PDF, VOID/RESTORE redeemed preservation and nonVOID no-op; eight mutation entrypoints400/413');
  const config = await db.eventConfig.findFirstOrThrow();
  let pendingVote: ReturnType<typeof request> | undefined;
  let pendingBind: ReturnType<typeof request> | undefined;
  try {
    await db.$transaction(async tx => {
      await tx.eventConfig.update({ where: { id: config.id }, data: { isVotingOpen: false, isRegistrationOpen: false } });
      pendingVote = request('/api/vote', exhibitor, voteBody(cards[4]), `freeze-vote-${suffix}`);
      pendingBind = request('/api/registration/bind', reg, bindBody(cards[5]), `freeze-bind-${suffix}`);
      await new Promise(resolve => setTimeout(resolve, 300));
    });
    assert(pendingVote && pendingBind);
    assert.equal((await pendingVote).data.error, 'VOTING_IS_CLOSED');
    assert.equal((await pendingBind).status, 403);
    const boothClosed = await request('/api/booths', exhibitor);
    assert.equal(boothClosed.status, 200);
    assert.equal(boothClosed.data.isVotingOpen, false);
    assert.equal((await request('/api/vote', exhibitor, voteBody(voted), voteKey)).status, 200);
    assert.deepEqual((await request('/api/registration/bind', reg, bindBody(active), regKey)).data, replayReg.data);
    assert.equal(await db.vote.count({ where: { boothId: booth.id } }), 2);
    assert.equal((await db.bingoCard.findUniqueOrThrow({ where: { cardSerial: cards[5] } })).status, 'GENERATED');
    console.log('PASS closure locks block pending new mutations; cached vote and registration replays remain 200; unchanged counts');
  } finally {
    await db.eventConfig.update({ where: { id: config.id }, data: { isVotingOpen: config.isVotingOpen, isRegistrationOpen: config.isRegistrationOpen } });
  }
  await db.user.update({ where: { id: users.get('EXHIBITOR')! }, data: { boothId: booth2.id } });
  assert.equal((await request('/api/vote', exhibitor, voteBody(cards[4]), `stale-${suffix}`)).status, 401);
  await db.user.update({ where: { id: users.get('REGISTRATION')! }, data: { passwordHash: await bcrypt.hash(crypto.randomUUID(), 10) } });
  assert.equal((await request('/api/registration/bind', reg, bindBody(cards[6]), `stale-reg-${suffix}`)).status, 403);
  console.log('PASS booth reassignment and password change invalidate actual prior login cookies');
  console.log('Fixture prefix retained:', suffix);
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'QA failure'); process.exitCode = 1; }).finally(() => db.$disconnect());
