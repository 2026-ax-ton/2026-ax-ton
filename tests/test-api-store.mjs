/* /api/store — 동기화와 합치기 (T12 · TK-3-03).

   ★ 실제 DB를 부르지 않는다. **가짜 `sql`** 을 끼운다 (A02 §14.8).

   이 묶음이 지키는 것
     1. ★ 합칠 때 **행이 사라지지 않는다** — 두 기기가 동시에 저장해도 둘 다 남는다
        (미이수가 사라지는 것은 증빙이 사라지는 것이다, C05 P-4)
     2. ★ 노동자는 **자기 `progress` 행만** 쓴다. 남의 행은 서버가 조용히 버린다
     3. ★ 노동자가 읽으면 **자기 것만** 나간다 (남의 기록이 폰에 내려가지 않는다)
     4. 역할·사업장은 토큰에서만. 본문·쿼리에 적어 보내도 안 먹는다
     5. 한 덩어리(setup)는 판으로 막는다 — 오래된 판이면 409
     6. 사람이 승인한 번역을 AI 결과가 덮지 않는다

   케이스: D07 STC-E25-005·006·007 · STC-E25-029~032
   근거:   A02 §14.4 (표 14-3) · §14.5 · C05 P-4 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, eq, report } = require('./harness');

const db = await import('../api/_db.mjs');
const store = await import('../api/store.mjs');
const merge = await import('../api/_merge.mjs');

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
  const data = {
    docs: [],        // { workplace_id, key, data, version }
    library: [],     // { id, data, version }
    sessions: [{ token_hash: null, account_id: null }],
    accounts: [],
  };
  const tokens = new Map();   // token → account row

  function sql(strings, ...vals) {
    const q = strings.join(' ? ').replace(/\s+/g, ' ').trim().toLowerCase();

    if (q.startsWith('select a.id, a.user_id, a.role')) {
      return Promise.resolve(tokens.has(vals[0]) ? [tokens.get(vals[0])] : []);
    }
    if (q.startsWith('select key, data, version from docs where workplace_id =')) {
      return Promise.resolve(data.docs.filter((r) => r.workplace_id === vals[0])
        .map((r) => ({ key: r.key, data: r.data, version: r.version })));
    }
    if (q.startsWith('select data, version from docs where workplace_id =')) {
      return Promise.resolve(data.docs.filter((r) => r.workplace_id === vals[0] && r.key === vals[1])
        .map((r) => ({ data: r.data, version: r.version })));
    }
    if (q.startsWith('select id, data, version from library')) {
      return Promise.resolve(data.library.map((r) => ({ ...r })));
    }
    if (q.startsWith('insert into docs')) {
      const [wp, key, raw] = vals;
      const parsed = JSON.parse(raw);
      const row = data.docs.find((r) => r.workplace_id === wp && r.key === key);
      if (row) { row.data = parsed; row.version += 1; }
      else data.docs.push({ workplace_id: wp, key, data: parsed, version: 1 });
      const now = data.docs.find((r) => r.workplace_id === wp && r.key === key);
      return Promise.resolve([{ data: now.data, version: now.version }]);
    }
    if (q.startsWith('insert into library')) {
      const [id, raw] = vals;
      const parsed = JSON.parse(raw);
      const row = data.library.find((r) => r.id === id);
      if (row) { row.data = parsed; row.version += 1; }
      else data.library.push({ id, data: parsed, version: 1 });
      return Promise.resolve([{ version: data.library.find((r) => r.id === id).version }]);
    }
    throw new Error('가짜 DB가 모르는 질의: ' + q);
  }
  sql.query = () => Promise.resolve([]);

  return { sql, data, tokens };
}

const authLib = await import('../api/_auth.mjs');

const fake = makeDb();
db.setSqlForTest(fake.sql);

/** 토큰 하나를 만들어 그 계정으로 쓰게 한다 */
function login(token, row) {
  fake.tokens.set(authLib.tokenHash(token), row);
  return token;
}

const ADMIN = login('tok-admin', {
  id: 'a1', user_id: 'kim@daesung.co.kr', role: 'admin', name: '김현수',
  title: '', lang: null, process_id: null, workplace_id: WP_A, site_name: '대성정밀',
});
const W07 = login('tok-w07', {
  id: 'a2', user_id: 'W-4821-07', role: 'worker', name: '', title: '',
  lang: 'km', process_id: 'p-press', workplace_id: WP_A, site_name: '대성정밀',
});
const W11 = login('tok-w11', {
  id: 'a3', user_id: 'W-4821-11', role: 'worker', name: '', title: '',
  lang: 'id', process_id: 'p-paint', workplace_id: WP_A, site_name: '대성정밀',
});
const OPER = login('tok-oper', {
  id: 'a4', user_id: 'oper@safety.kr', role: 'operator', name: '이수진',
  title: '', lang: null, process_id: null, workplace_id: null, site_name: null,
});
const OTHER = login('tok-other', {
  id: 'a5', user_id: 'park@other.co.kr', role: 'admin', name: '박',
  title: '', lang: null, process_id: null, workplace_id: WP_B, site_name: '다른곳',
});

/* ── 부르기 ────────────────────────────────────────────────────────── */

function req(method, qs, body, token) {
  const headers = { 'content-type': 'application/json', origin: ORIGIN };
  if (token) headers.authorization = 'Bearer ' + token;
  return new Request('https://x/api/store' + qs, {
    method, headers,
    body: method === 'GET' ? undefined : JSON.stringify(body === undefined ? {} : body),
  });
}
async function call(method, qs, body, token) {
  const res = await store.handle(req(method, qs, body, token));
  let data; try { data = JSON.parse(await res.text()); } catch (e) { data = null; }
  return { status: res.status, data };
}
const put = (key, body, token) => call('PUT', '?key=' + key, body, token);
const get = (keys, token) => call('GET', '?keys=' + keys, undefined, token);

const realLog = console.log;
console.log = () => {};

/* ===================================================================
   1. 토큰이 없으면 아무것도 안 된다
   =================================================================== */
{
  eq('토큰 없이 읽으면 401', (await get('setup')).status, 401);
  eq('토큰 없이 쓰면 401', (await put('courses', { data: [] })).status, 401);
  /* ★ 토큰은 헤더로 간다 — 헤더 값은 ASCII 만 된다 (2차에서 겪은 것) */
  eq('모르는 토큰도 401', (await get('setup', 'tok-nobody')).status, 401);
}

/* ===================================================================
   2. 역할 — 서버가 다시 본다 (화면 가드가 있어도)
   =================================================================== */
{
  eq('노동자는 교육을 못 고친다', (await put('courses', { data: [] }, W07)).status, 403);
  eq('노동자는 사업장 설정을 못 고친다', (await put('setup', { data: {} }, W07)).status, 403);
  eq('담당자는 문구 라이브러리를 못 고친다 (운영자만)', (await put('library', { data: [] }, ADMIN)).status, 403);
  eq('담당자는 수강 기록을 못 쓴다 (노동자가 쓴다)', (await put('progress', { data: [] }, ADMIN)).status, 403);
  eq('모르는 키는 400', (await put('reports', { data: [] }, ADMIN)).status, 400);
  eq('★ 신고는 이 경로로 다니지 않는다 (익명, 별도 경로)',
    (await put('reports', { data: [] }, W07)).status, 400);
}

/* ===================================================================
   3. ★ 두 기기가 동시에 저장해도 행이 사라지지 않는다 (STC-E25-006)
   =================================================================== */
{
  const row07 = {
    workerId: 'W-4821-07', courseId: 'c-press', lang: 'km',
    learnedAt: '2026-11-01T01:00:00.000Z',
    quiz: { score: 100, passed: true, answers: [1, 1, 1], at: '2026-11-01T01:10:00.000Z' },
  };
  const row11 = {
    workerId: 'W-4821-11', courseId: 'c-paint', lang: 'id',
    learnedAt: '2026-11-01T02:00:00.000Z',
    quiz: { score: 50, passed: false, answers: [0, 1], at: '2026-11-01T02:10:00.000Z' },
  };

  /* 두 폰 모두 "서버에 아무것도 없다" 고 알고 각자 보낸다 (baseVersion 0) */
  const a = await put('progress', { data: [row07], baseVersion: 0 }, W07);
  const b = await put('progress', { data: [row11], baseVersion: 0 }, W11);

  eq('첫 폰 저장 200', a.status, 200);
  eq('둘째 폰 저장 200', b.status, 200);

  const all = await get('progress', ADMIN);
  const ids = all.data.progress.data.map((r) => r.workerId + '|' + r.courseId).sort();
  eq('★★ 두 기록이 모두 남았다 (덮어쓰지 않았다)', ids.join(','), 'W-4821-07|c-press,W-4821-11|c-paint');
  ok('판이 올라갔다', all.data.progress.version >= 2);
}

{
  /* 같은 사람이 다시 풀면 최신 결과가 남는다 — 단, 옛 기록이 늦게 올라와도 덮지 않는다 */
  const again = {
    workerId: 'W-4821-07', courseId: 'c-press', lang: 'km',
    learnedAt: '2026-11-01T03:00:00.000Z',
    quiz: { score: 100, passed: true, answers: [1, 1, 1], at: '2026-11-01T03:30:00.000Z', attempt: 2 },
  };
  await put('progress', { data: [again], baseVersion: 0 }, W07);

  const stale = {
    workerId: 'W-4821-07', courseId: 'c-press', lang: 'km',
    learnedAt: '2026-10-01T00:00:00.000Z',
    quiz: { score: 30, passed: false, answers: [0], at: '2026-10-01T00:10:00.000Z' },
  };
  await put('progress', { data: [stale], baseVersion: 0 }, W07);

  const all = await get('progress', ADMIN);
  const mine = all.data.progress.data.find((r) => r.workerId === 'W-4821-07');
  eq('다시 푼 최신 결과가 남는다', mine.quiz.attempt, 2);
  ok('★ 느린 기기가 올린 옛 기록이 새 기록을 지우지 않는다', mine.quiz.passed === true);
}

/* ===================================================================
   4. ★ 노동자는 자기 행만 (STC-E25-005)
   =================================================================== */
{
  const forged = {
    workerId: 'W-4821-11', courseId: 'c-press', lang: 'id',
    learnedAt: '2026-11-01T05:00:00.000Z',
    quiz: { score: 100, passed: true, answers: [1, 1, 1], at: '2026-11-01T05:10:00.000Z' },
  };
  const before = (await get('progress', ADMIN)).data.progress.data.length;
  const res = await put('progress', { data: [forged], baseVersion: 0 }, W07);
  const after = (await get('progress', ADMIN)).data.progress.data;

  eq('남의 행을 끼워 보내도 200 이다 (조용히 버린다)', res.status, 200);
  eq('★★ 남의 행은 들어가지 않았다', after.length, before);
  ok('★ 남의 통과 기록을 만들어 줄 수 없다',
    !after.some((r) => r.workerId === 'W-4821-11' && r.courseId === 'c-press'));
}

/* ===================================================================
   5. ★ 노동자가 읽으면 자기 것만 (A02 §14.4)
   =================================================================== */
{
  const asAdmin = (await get('progress', ADMIN)).data.progress.data;
  const asWorker = (await get('progress', W07)).data.progress.data;

  ok('담당자는 전체를 본다', asAdmin.length >= 2);
  ok('★★ 노동자에게는 자기 것만 내려간다',
    asWorker.length > 0 && asWorker.every((r) => r.workerId === 'W-4821-07'), JSON.stringify(asWorker));
}

/* ===================================================================
   6. 사업장 분리 (STC-E25-004 의 일부)
   =================================================================== */
{
  await put('courses', { data: [{ id: 'c-press', title: '프레스' }], baseVersion: 0 }, ADMIN);
  const other = await get('courses', OTHER);
  eq('★ 다른 사업장 담당자에게는 우리 교육이 안 보인다', other.data.courses.data.length, 0);

  /* 본문에 남의 사업장을 적어 보내도 자기 사업장에만 들어간다 */
  await put('courses', { data: [{ id: 'c-x', title: '남의것' }], baseVersion: 0, workplaceId: WP_A }, OTHER);
  const mine = await get('courses', ADMIN);
  ok('★ 본문에 적은 사업장 값은 보지 않는다',
    !mine.data.courses.data.some((c) => c.id === 'c-x'));
}

/* ===================================================================
   7. 한 덩어리(setup)는 판으로 막는다 (STC-E25-007)
   =================================================================== */
{
  const first = await put('setup', { data: { site: { name: '대성정밀' } }, baseVersion: 0 }, ADMIN);
  eq('처음 저장은 된다', first.status, 200);
  const v = first.data.version;

  const stale = await put('setup', { data: { site: { name: '엉뚱한곳' } }, baseVersion: 0 }, ADMIN);
  eq('★ 오래된 판으로 저장하면 409', stale.status, 409);
  eq('그때 서버의 지금 값을 함께 준다', stale.data.data.site.name, '대성정밀');
  eq('지금 판도 알려 준다 (받아서 다시 보낸다)', stale.data.version, v);

  const retry = await put('setup', { data: { site: { name: '대성정밀2' } }, baseVersion: stale.data.version }, ADMIN);
  eq('당겨온 판으로 다시 보내면 들어간다', retry.status, 200);
  eq('값이 바뀌었다', retry.data.data.site.name, '대성정밀2');
}

/* ===================================================================
   8. 문구 — 사람이 승인한 것을 AI 가 덮지 않는다
   =================================================================== */
{
  const judged = {
    id: 'ph-1', ko: '프레스에 손을 넣지 마십시오',
    translations: { km: { text: '사람이 승인한 것', status: 'reviewed', judged: { by: 'oper@safety.kr', at: '2026-11-01T10:00:00.000Z' } } },
  };
  await put('library', { data: [judged], baseVersion: 0 }, OPER);

  const older = {
    id: 'ph-1', ko: '프레스에 손을 넣지 마십시오',
    translations: { km: { text: 'AI 가 나중에 만든 것', status: 'waiting', agent: { at: '2026-10-01T00:00:00.000Z', tries: 1 } } },
  };
  const res = await put('library', { data: [older], baseVersion: 0 }, OPER);

  eq('★ 사람이 나중에 본 판정이 이긴다',
    res.data.data.find((p) => p.id === 'ph-1').translations.km.text, '사람이 승인한 것');

  const everyone = await get('library', W07);
  eq('문구는 전원이 읽는다 (노동자도)', everyone.data.library.data.length, 1);
}

/* ===================================================================
   9. 글·댓글 — 합집합이다 (한쪽에만 있는 댓글이 사라지지 않는다)
   =================================================================== */
{
  const mine = {
    id: 'po-1', title: '교대 시간', body: '', author: 'W-4821-07', anonymous: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    comments: [{ author: 'kim@daesung.co.kr', body: '맞습니다', createdAt: '2026-11-01T01:00:00.000Z' }],
  };
  await put('posts', { data: [mine], baseVersion: 0 }, W07);

  const theirs = {
    ...mine,
    comments: [{ author: 'W-4821-11', body: '저도 들었어요', createdAt: '2026-11-01T02:00:00.000Z' }],
  };
  const res = await put('posts', { data: [theirs], baseVersion: 0 }, W11);

  const post = res.data.data.find((p) => p.id === 'po-1');
  eq('★ 댓글 둘이 모두 남았다', post.comments.length, 2);
  eq('시간 순으로 선다', post.comments[0].author, 'kim@daesung.co.kr');

  /* 같은 댓글을 두 번 보내도 두 개가 되지 않는다 */
  const again = await put('posts', { data: [theirs], baseVersion: 0 }, W11);
  eq('같은 댓글이 겹치지 않는다', again.data.data.find((p) => p.id === 'po-1').comments.length, 2);
}

/* ===================================================================
   10. 들어오는 길
   =================================================================== */
{
  eq('무엇을 불러올지 안 적으면 400', (await get('', ADMIN)).status, 400);
  eq('POST 는 받지 않는다 (GET·PUT 만)', (await call('POST', '?key=courses', {}, ADMIN)).status, 405);
  eq('서버에 없는 키도 모양을 맞춰 준다', (await get('orders', ADMIN)).data.orders.data.length, 0);
  eq('그때 판은 0 이다', (await get('orders', ADMIN)).data.orders.version, 0);

  const other = await store.handle(new Request('https://x/api/store?keys=setup', {
    method: 'GET', headers: { origin: 'https://evil.example', authorization: 'Bearer ' + ADMIN },
  }));
  eq('다른 출처는 403', other.status, 403);
}

/* ===================================================================
   11. 합치기 규칙 자체 (순수 계산)
   =================================================================== */
{
  const r = merge.mergeList('courses', [{ id: 'a' }], [{ id: 'b' }], null);
  eq('없던 행은 더해진다', r.list.length, 2);

  const r2 = merge.mergeList('courses', [{ id: 'a', t: 1 }], [{ id: 'a', t: 2 }], null);
  eq('같은 id 는 들어온 것이 이긴다', r2.list[0].t, 2);

  const r3 = merge.mergeList('progress', [], [{ workerId: 'x' }], null);
  eq('★ 모양이 깨진 행(courseId 없음)은 버린다', r3.list.length, 0);

  const r4 = merge.mergeList('progress', [], [{ workerId: 'x', courseId: 'c' }], (row) => row.workerId === 'y');
  eq('허락되지 않은 행은 버린다', r4.list.length, 0);
  eq('버린 수를 센다', r4.dropped, 1);

  ok('같은 판이면 덮어쓸 수 있다', merge.canReplaceDoc(3, 3));
  ok('오래된 판이면 못 덮어쓴다', !merge.canReplaceDoc(3, 2));
}

db.setSqlForTest(null);
console.log = realLog;
report('/api/store — 동기화와 합치기 (T12)');
