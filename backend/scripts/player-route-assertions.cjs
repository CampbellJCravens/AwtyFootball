/**
 * The player routes end to end against a stubbed Prisma: what an anonymous
 * caller can and cannot write. No database, no network beyond localhost:
 *   node scripts/player-route-assertions.cjs
 */
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const assert = require('assert');
const http = require('http');
const express = require('express');

const players = { p1: { id: 'p1', name: 'Has Phone', phone: '17135550100' }, p2: { id: 'p2', name: 'No Phone', phone: null } };
const writes = [];
const db = {
  player: {
    findUnique: async ({ where }) => players[where.id] || null,
    update: async ({ where, data }) => { writes.push({ id: where.id, data }); return { ...players[where.id], ...data }; },
    create: async ({ data }) => { writes.push({ create: data }); return { id: 'new', ...data }; },
  },
  $transaction: async fn => fn(db),
};
const stub = (rel, exports) => {
  const file = require.resolve(rel);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub('../src/prisma', { __esModule: true, default: db });
stub('../src/services/whatsapp/polls', { resyncPollsForPhone: async () => {} });
stub('../src/services/phoneLinks', { clearPlayerClaims: async () => {} });

const router = require('../src/routes/players').default;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { if (req.headers['x-test-admin']) req.user = { id: 'u', email: 'a@b', role: 'admin' }; next(); });
app.use('/api/players', router);

const call = (port, method, path, body, admin) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body);
  const req = http.request({ port, method, path, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), ...(admin ? { 'x-test-admin': '1' } : {}) } }, res => {
    let buf = '';
    res.on('data', c => (buf += c));
    res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }));
  });
  req.on('error', reject);
  req.end(data);
});

const server = app.listen(0, async () => {
  const port = server.address().port;
  let n = 0;
  const check = async (label, method, path, body, admin, status, wrote) => {
    const before = writes.length;
    const res = await call(port, method, path, body, admin);
    assert.strictEqual(res.status, status, `${label}: status ${res.status} ${JSON.stringify(res.body)}`);
    assert.strictEqual(writes.length - before, wrote ? 1 : 0, `${label}: write count`);
    n++;
    return res;
  };
  try {
    await check('anon cannot grant the dues exemption', 'PATCH', '/api/players/p1', { isAlumni: true }, false, 403, false);
    await check('anon cannot rename', 'PATCH', '/api/players/p1', { name: 'Someone Else' }, false, 403, false);
    await check('anon cannot drop someone off the roster', 'PATCH', '/api/players/p1', { onRoster: false }, false, 403, false);
    await check('anon cannot replace a phone', 'PATCH', '/api/players/p1', { phone: '7135550199' }, false, 403, false);
    await check('anon cannot clear a phone', 'PATCH', '/api/players/p1', { phone: '' }, false, 403, false);
    const mixed = await check('a mixed request writes nothing', 'PATCH', '/api/players/p1', { pictureUrl: 'data:image/png;base64,AAAA', isAlumni: true }, false, 403, false);
    assert.deepStrictEqual(mixed.body.fields, ['isAlumni']);
    await check('anon adds a missing phone', 'PATCH', '/api/players/p2', { phone: '713-555-0142' }, false, 200, true);
    assert.strictEqual(writes[writes.length - 1].data.phone, '17135550142');
    await check('anon sets a photo', 'PATCH', '/api/players/p1', { pictureUrl: 'data:image/png;base64,AAAA' }, false, 200, true);
    await check('anon adds themselves by name', 'POST', '/api/players', { name: 'New Guy' }, false, 201, true);
    await check('anon cannot create an exempt player', 'POST', '/api/players', { name: 'New Guy', isAlumni: true }, false, 403, false);
    await check('admin edits everything', 'PATCH', '/api/players/p1', { name: 'Renamed', isAlumni: true, phone: '' }, true, 200, true);
    await check('admin creates with flags', 'POST', '/api/players', { name: 'Guest7', onRoster: false }, true, 201, true);
    console.log(`player-route assertions: ${n} passed`);
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
