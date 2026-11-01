/* /api/reports — 익명 신고 (T13 · TK-3-04).

   ★ 실제 DB를 부르지 않는다. **가짜 `sql`** 을 끼운다 (A02 §14.8).

   이 묶음이 지키는 것
     1. ★★ 저장된 행에 계정을 가리키는 값이 없다 (익명)
     2. 노동자만 보낼 수 있고, 담당자만 보고 상태를 바꿀 수 있다
     3. 사업장이 다르면 안 보이고, 바꿀 수도 없다 (있는지도 알려 주지 않는다)
     4. 같은 신고를 두 번 보내도(끊김 뒤 재전송) 두 번 쌓이지 않는다
     5. 들어온 값 중 우리가 정한 필드만 저장한다 (계정 값이 섞여 와도 버린다)

   케이스: D07 STC-E25-004·005·008
   근거:   A02 §14.3·§14.6 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, eq, report } = require('./harness');

const db = await import('../api/_db.mjs');
const reports = await import('../api/reports.mjs');
const authLib = await import('../api/_auth.mjs');

const ORIGIN = 'https://2026-ax-ton.vercel.app';
const WP_A = 'wp-a';
const WP_B = 'wp-b';

Object.assign(process.env, {
  ALLOWED_ORIGIN: ORIGIN, VERCEL_URL: '', VERCEL_BRANCH_URL: '',
  VERCEL_PROJECT_PRODUCTION_URL: '', ALLOW_FILE_ORIGIN: '0',
  DATABASE_URL: 'postgresql://fake/fake',
});

/* ── 가짜 DB ───────────────────────────────────────────────────────── */

function makeDb() {
  let seq = 0;
  const rows = [];   // { id, workplace_id, data }

  function sql(strings, ...vals) {
    const q = strings.join(' ? ').replace(/\s+/g, ' ').trim().toLowerCase();

    if (q.startsWith('select a.id, a.user_id, a.role')) {
      return Promise.resolve(tokens.has(vals[0]) ? [tokens.get(vals[0])] : []);
    }
    if (q.startsWith("select id from reports where workplace_id =")) {
      const [wp, cid] = vals;
      const hit = rows.find((r) => r.workplace_id === wp && r.data.id === cid);
      return Promise.resolve(hit ? [{ id: hit.id }] : []);
    }
    if (q.startsWith('insert into reports')) {
      const [wp, raw] = vals;
      seq += 1;
      const id = 'r' + seq;
      rows.push({ id, workplace_id: wp, data: JSON.parse(raw) });
      return Promise.resolve([{ id }]);
    }
    if (q.startsWith('select id, data from reports where workplace_id =')) {
      const [wp] = vals;
      return Promise.resolve(rows.filter((r) => r.workplace_id === wp)
        .map((r) => ({ id: r.id, data: r.data })));
    }
    if (q.startsWith('select data from reports where id =')) {
      const [id, wp] = vals;
      const hit = rows.find((r) => r.id === id && r.workplace_id === wp);
      return Promise.resolve(hit ? [{ data: hit.data }] : []);
    }
    if (q.startsWith('update reports set data =')) {
      const [raw, id] = vals;
      const hit = rows.find((r) => r.id === id);
      if (hit) hit.data = JSON.parse(raw);
      return Promise.resolve([]);
    }
    throw new Error('가짜 DB가 모르는 질의: ' + q);
  }
  sql.query = () => Promise.resolve([]);

  return { sql, rows };
}

const tokens = new Map();   // token → account row

function login(token, row) {
  tokens.set(authLib.tokenHash(token), row);
  return token;
}

const fake = makeDb();
db.setSqlForTest(fake.sql);

const W07 = login('tok-w07', {
  id: 'a2', user_id: 'W-4821-07', role: 'worker', name: '', title: '',
  lang: 'km', process_id: 'p-press', workplace_id: WP_A, site_name: '대성정밀',
});
const ADMIN = login('tok-admin', {
  id: 'a1', user_id: 'kim@daesung.co.kr', role: 'admin', name: '김현수',
  title: '', lang: null, process_id: null, workplace_id: WP_A, site_name: '대성정밀',
});
const OTHER = login('tok-other', {
  id: 'a5', user_id: 'park@other.co.kr', role: 'admin', name: '박',
  title: '', lang: null, process_id: null, workplace_id: WP_B, site_name: '다른곳',
});
const OPER = login('tok-oper', {
  id: 'a4', user_id: 'oper@safety.kr', role: 'operator', name: '이수진',
  title: '', lang: null, process_id: null, workplace_id: null, site_name: null,
});

/* ── 부르기 ────────────────────────────────────────────────────────── */

function req(method, qs, body, token) {
  const headers = { 'content-type': 'application/json', origin: ORIGIN };
  if (token) headers.authorization = 'Bearer ' + token;
  return new Request('https://x/api/reports' + (qs || ''), {
    method, headers,
    body: method === 'GET' ? undefined : JSON.stringify(body === undefined ? {} : body),
  });
}
async function call(method, qs, body, token) {
  const res = await reports.handle(req(method, qs, body, token));
  let data; try { data = JSON.parse(await res.text()); } catch (e) { data = null; }
  return { status: res.status, data };
}
const send = (data, token) => call('POST', '', { data }, token);
const list = (token) => call('GET', '', undefined, token);
const setStatus = (rid, status, token) => call('PATCH', '?id=' + encodeURIComponent(rid), { status }, token);

const realLog = console.log;
console.log = () => {};

/* ===================================================================
   1. 토큰 없이는 아무것도 안 된다
   =================================================================== */
{
  eq('토큰 없이 보내면 401', (await send({ hazard: 'cut' })).status, 401);
  eq('토큰 없이 보면 401', (await list()).status, 401);
  eq('모르는 토큰도 401', (await list('tok-nobody')).status, 401);
}

/* ===================================================================
   2. 역할 — 노동자만 보내고, 담당자만 본다
   =================================================================== */
{
  eq('담당자는 신고를 못 보낸다 (보내는 쪽이 아니다)',
    (await send({ hazard: 'cut' }, ADMIN)).status, 403);
  eq('운영자도 못 보낸다', (await send({ hazard: 'cut' }, OPER)).status, 403);
  eq('노동자는 목록을 못 본다 (익명을 지킨다 — 자기 것도 못 고른다)',
    (await list(W07)).status, 403);
}

/* ===================================================================
   3. ★★ 저장된 행에 계정을 가리키는 값이 없다 (STC-E25-008)
   =================================================================== */
{
  const sent = await send({
    id: 'cl-1', ticket: 'R-261101-0001', processId: 'p-press', equipmentId: 'eq-1',
    hazard: 'cut', memo: '프레스 보호덮개가 빠져 있습니다', memoFromVoice: false,
    status: 'received', createdAt: '2026-11-01T00:00:00.000Z',
    userId: 'W-4821-07', workerId: 'W-4821-07', author: 'W-4821-07',  // 끼워 보내도
  }, W07);
  eq('보내면 200', sent.status, 200);
  ok('id 를 돌려준다', !!sent.data.id);

  const stored = fake.rows.find((r) => r.id === sent.data.id);
  ok('★★ 저장된 행에 userId·workerId·author 가 없다',
    !('userId' in stored.data) && !('workerId' in stored.data) && !('author' in stored.data),
    JSON.stringify(stored.data));
  eq('정한 필드만 남는다', Object.keys(stored.data).sort().join(','),
    'createdAt,equipmentId,hazard,id,memo,memoFromVoice,processId,status,ticket');
}

/* ===================================================================
   4. 같은 신고를 두 번 보내도 두 번 쌓이지 않는다 (재전송)
   =================================================================== */
{
  const before = (await list(ADMIN)).data.list.length;
  await send({ id: 'cl-2', hazard: 'fall', ticket: 'R-2' }, W07);
  const once = (await list(ADMIN)).data.list.length;
  eq('처음 보내면 하나 늘어난다', once, before + 1);

  const again = await send({ id: 'cl-2', hazard: 'fall', ticket: 'R-2' }, W07);
  eq('다시 보내도 200', again.status, 200);
  const twice = (await list(ADMIN)).data.list.length;
  eq('★ 끊김 뒤 재전송해도 두 번 쌓이지 않는다', twice, once);
}

/* ===================================================================
   5. 사업장 분리 — 남의 사업장 신고는 안 보이고, 못 바꾼다
   =================================================================== */
{
  const mine = await list(ADMIN);
  const other = await list(OTHER);
  ok('담당자는 자기 사업장 신고를 본다', mine.data.list.length > 0);
  eq('★ 다른 사업장 담당자에게는 안 보인다', other.data.list.length, 0);

  const rid = mine.data.list[0].rid;
  eq('★ 남의 사업장 신고는 바꿀 수 없다 (있는지도 알려 주지 않는다)',
    (await setStatus(rid, 'urgent', OTHER)).status, 404);
}

/* ===================================================================
   6. 담당자가 상태를 바꾼다
   =================================================================== */
{
  const mine = await list(ADMIN);
  const rid = mine.data.list[0].rid;

  eq('노동자는 상태를 못 바꾼다', (await setStatus(rid, 'urgent', W07)).status, 403);
  eq('모르는 상태는 400', (await setStatus(rid, 'ate-everything', ADMIN)).status, 400);
  eq('없는 id 는 404', (await setStatus('no-such-id', 'urgent', ADMIN)).status, 404);

  const res = await setStatus(rid, 'urgent', ADMIN);
  eq('담당자가 바꾸면 200', res.status, 200);
  eq('상태가 바뀐다', res.data.status, 'urgent');

  const after = await list(ADMIN);
  eq('목록에도 반영된다', after.data.list.find((r) => r.rid === rid).status, 'urgent');
}

/* ===================================================================
   7. 들어오는 길
   =================================================================== */
{
  eq('신고 내용이 없으면 400', (await call('POST', '', {}, W07)).status, 400);
  eq('DELETE 는 받지 않는다', (await call('DELETE', '', undefined, ADMIN)).status, 405);

  const other = await reports.handle(new Request('https://x/api/reports', {
    method: 'GET', headers: { origin: 'https://evil.example', authorization: 'Bearer ' + ADMIN },
  }));
  eq('다른 출처는 403', other.status, 403);
}

db.setSqlForTest(null);
console.log = realLog;
report('/api/reports — 익명 신고 (T13)');
