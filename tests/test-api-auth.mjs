/* /api/auth/* — 진짜 로그인 (T11 · TK-3-02).

   ★ 실제 DB를 부르지 않는다. **가짜 `sql`** 을 끼워 넣는다 (A02 §14.8).
     질의 문자열과 값이 따로 오는 태그 템플릿이라, 값이 문자열로 섞여 들어가는지
     (SQL 인젝션) 도 여기서 그대로 드러난다.

   이 묶음이 지키는 것
     1. 비밀번호 원문이 DB·응답·로그 어디에도 없다
     2. 아이디가 없는 것과 비밀번호가 틀린 것을 **구분해서 알려 주지 않는다**
     3. 5번 틀리면 잠기고, 잠긴 동안에는 맞는 비밀번호로도 못 들어간다
     4. 역할·사업장은 **서버가 정한다** — 본문에 적어 보내도 안 먹는다
     5. 토큰 원문은 응답에만, DB에는 sha256 지문만
     6. 로그아웃은 실패하지 않는다 (공용 폰)

   케이스: D07 STC-E25-001·002·003·014 · STC-E25-020~023
   근거:   A02 §14.3·§14.6 · PRD-CM-01 · PRD-AD-01 FR-AD-01-07 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, eq, has, report } = require('./harness');

const db = await import('../api/_db.mjs');
const authLib = await import('../api/_auth.mjs');
const login = await import('../api/auth/login.mjs');
const logout = await import('../api/auth/logout.mjs');
const signup = await import('../api/auth/signup.mjs');
const signupWp = await import('../api/auth/signup-workplace.mjs');

const ORIGIN = 'https://2026-ax-ton.vercel.app';

function setEnv(extra) {
  Object.assign(process.env, {
    ALLOWED_ORIGIN: ORIGIN,
    VERCEL_URL: '',
    VERCEL_BRANCH_URL: '',
    VERCEL_PROJECT_PRODUCTION_URL: '',
    ALLOW_FILE_ORIGIN: '0',
    DATABASE_URL: 'postgresql://fake/fake',
    SESSION_TTL_HOURS: '12',
    LOGIN_MAX_FAIL: '5',
    LOGIN_LOCK_MIN: '10',
  }, extra || {});
}

/* ── 가짜 DB ────────────────────────────────────────────────────────
   표 네 개를 배열로 들고, 질의 문자열을 보고 해당하는 일을 한다.
   ★ 값(${...})은 **문자열에 섞이지 않고 따로** 온다 — 드라이버와 같은 모양이다. */

function makeDb() {
  const data = { workplaces: [], accounts: [], sessions: [], docs: [] };
  const seen = [];          // 돌린 질의 (문자열, 값) — 검사에서 들여다본다
  let nextId = 1;

  function sql(strings, ...vals) {
    const q = strings.join(' ? ').replace(/\s+/g, ' ').trim().toLowerCase();
    seen.push({ q, vals });

    /* 토큰 → 계정 (accountFromToken) */
    if (q.startsWith('select a.id, a.user_id, a.role, a.name, a.title, a.lang, a.process_id, a.workplace_id')) {
      const s = data.sessions.find((r) => r.token_hash === vals[0] && new Date(r.expires_at) > new Date());
      if (!s) return Promise.resolve([]);
      const a = data.accounts.find((r) => r.id === s.account_id);
      const w = data.workplaces.find((r) => r.id === a.workplace_id);
      return Promise.resolve([{ ...a, site_name: w ? w.name : null }]);
    }

    /* 로그인 — 아이디로 계정 찾기 */
    if (q.includes('from accounts a') && q.includes('where a.user_id =')) {
      const a = data.accounts.find((r) => r.user_id === vals[0]);
      if (!a) return Promise.resolve([]);
      const w = data.workplaces.find((r) => r.id === a.workplace_id);
      return Promise.resolve([{ ...a, site_name: w ? w.name : null }]);
    }

    if (q.startsWith('select 1 as x from accounts where user_id =')) {
      return Promise.resolve(data.accounts.filter((r) => r.user_id === vals[0]).map(() => ({ x: 1 })));
    }

    if (q.startsWith('select id, name from workplaces where join_code =')) {
      return Promise.resolve(data.workplaces.filter((r) => r.join_code === vals[0])
        .map((r) => ({ id: r.id, name: r.name })));
    }

    if (q.startsWith('select data from docs where workplace_id =')) {
      return Promise.resolve(data.docs.filter((r) => r.workplace_id === vals[0] && r.key === 'setup')
        .map((r) => ({ data: r.data })));
    }

    if (q.startsWith('insert into workplaces')) {
      const row = { id: 'w' + (nextId += 1), name: vals[0], size_band: vals[1], join_code: vals[2] };
      data.workplaces.push(row);
      return Promise.resolve([{ id: row.id }]);
    }

    if (q.startsWith('insert into accounts')) {
      /* 열 순서는 질의마다 다르다 — 이름으로 읽는다 */
      const cols = /insert into accounts \(([^)]*)\)/.exec(q)[1].split(',').map((c) => c.trim());
      const row = { id: 'a' + (nextId += 1), failed_count: 0, locked_until: null };
      cols.forEach((c, i) => { row[c] = vals[i]; });
      data.accounts.push(row);
      return Promise.resolve([{
        id: row.id, user_id: row.user_id, role: row.role, name: row.name,
        title: row.title || null, lang: row.lang || null, process_id: row.process_id || null,
      }]);
    }

    if (q.startsWith('insert into sessions')) {
      data.sessions.push({ token_hash: vals[0], account_id: vals[1], expires_at: vals[2] });
      return Promise.resolve([]);
    }

    if (q.startsWith('update accounts set failed_count = ? , locked_until = ?')) {
      const a = data.accounts.find((r) => r.id === vals[2]);
      if (a) { a.failed_count = vals[0]; a.locked_until = vals[1]; }
      return Promise.resolve([]);
    }

    if (q.startsWith('update accounts set failed_count = 0, locked_until = null')) {
      const a = data.accounts.find((r) => r.id === vals[0]);
      if (a) { a.failed_count = 0; a.locked_until = null; }
      return Promise.resolve([]);
    }

    if (q.startsWith('delete from sessions where expires_at < now()')) {
      data.sessions = data.sessions.filter((r) => new Date(r.expires_at) > new Date());
      return Promise.resolve([]);
    }

    if (q.startsWith('delete from sessions where token_hash =')) {
      data.sessions = data.sessions.filter((r) => r.token_hash !== vals[0]);
      return Promise.resolve([]);
    }

    throw new Error('가짜 DB가 모르는 질의: ' + q);
  }

  sql.query = () => Promise.resolve([]);
  return { sql, data, seen };
}

/* ── 요청 만들기 ───────────────────────────────────────────────────── */

function post(body, opts) {
  const o = opts || {};
  const headers = { 'content-type': 'application/json' };
  if (o.origin !== null) headers.origin = o.origin || ORIGIN;
  if (o.token) headers.authorization = 'Bearer ' + o.token;
  return new Request('https://x/api/auth/x', {
    method: o.method || 'POST',
    headers,
    body: o.method && o.method !== 'POST' ? undefined : JSON.stringify(body === undefined ? {} : body),
  });
}

const logs = [];
const realLog = console.log;
console.log = (line) => { logs.push(String(line)); };

async function body(res) {
  try { return JSON.parse(await res.text()); } catch (e) { return null; }
}

/* ===================================================================
   1. 사업장 등록 → 담당자 계정 (STC-E25-001)
   =================================================================== */

let fake = makeDb();
db.setSqlForTest(fake.sql);
setEnv();

let adminToken = '';
let joinCode = '';
let workplaceId = '';

{
  const res = await signupWp.handle(post({
    siteName: '대성정밀', sizeBand: '10~49인',
    userId: 'kim@daesung.co.kr', pw: '1234', name: '김현수', title: '생산팀장',
  }));
  const b = await body(res);

  eq('사업장 등록 200', res.status, 200);
  ok('토큰을 받는다', typeof b.token === 'string' && b.token.length === 64, String(b.token));
  ok('가입 코드를 받는다', typeof b.joinCode === 'string' && b.joinCode.length > 0);
  eq('역할은 서버가 담당자로 정한다', b.user.role, 'admin');
  eq('사업장 이름이 같이 온다', b.user.siteName, '대성정밀');

  adminToken = b.token;
  joinCode = b.joinCode;
  workplaceId = fake.data.workplaces[0].id;

  /* 가입 코드는 사람이 전화로 불러 준다 — 헷갈리는 글자를 쓰지 않는다 */
  ok('★ 가입 코드에 헷갈리는 글자(0·O·1·I·L)가 없다', !/[0O1IL]/.test(joinCode), joinCode);

  const acc = fake.data.accounts[0];
  ok('★ DB에 비밀번호 원문이 없다', JSON.stringify(acc).indexOf('1234') === -1, JSON.stringify(acc));
  eq('해시는 128자', String(acc.pw_hash).length, 128);
  eq('salt 는 32자', String(acc.pw_salt).length, 32);

  const flat = JSON.stringify(b);
  ok('★ 응답에 비밀번호 관련 값이 하나도 없다',
    flat.indexOf('pw_hash') === -1 && flat.indexOf('pw_salt') === -1 && flat.indexOf('1234') === -1);

  /* 토큰은 지문만 저장된다 */
  const s = fake.data.sessions[0];
  ok('★ DB 세션에 토큰 원문이 없다', s.token_hash !== b.token);
  eq('지문은 sha256 이다', s.token_hash, authLib.tokenHash(b.token));
  eq('지문은 64자', s.token_hash.length, 64);
}

{
  const res = await signupWp.handle(post({
    siteName: '다른곳', userId: 'kim@daesung.co.kr', pw: '1234',
  }));
  eq('같은 아이디로 또 만들 수 없다', res.status, 409);
  eq('그때 사업장을 더 만들지 않는다', fake.data.workplaces.length, 1);
}

{
  const res = await signupWp.handle(post({ siteName: '', userId: '', pw: '' }));
  eq('빈 값이면 400', res.status, 400);
  const short = await signupWp.handle(post({ siteName: 'ㄱ', userId: 'a@b.c', pw: '1' }));
  eq('너무 짧은 비밀번호는 400', short.status, 400);
}

/* ===================================================================
   2. 노동자 가입 — 가입 코드와 담당자 명단 (STC-E25-001 · FR-AD-01-07)
   =================================================================== */

{
  /* 담당자가 등록한 노동자 명단을 setup 에 넣어 둔다 */
  fake.data.docs.push({
    workplace_id: workplaceId, key: 'setup',
    data: { workers: [{ id: 'W-4821-07', lang: 'km', processId: 'p-press' }] },
  });

  const bad = await signup.handle(post({ joinCode: 'ZZZZ-ZZZZ', userId: 'W-1', pw: '1234' }));
  eq('가입 코드가 틀리면 403', bad.status, 403);
  const badBody = await body(bad);
  eq('코드가 틀렸다고만 말한다', badBody.error, 'bad_code');
  ok('★ 그 사업장이 있는지 없는지를 흘리지 않는다',
    badBody.message.indexOf('대성정밀') === -1);

  const res = await signup.handle(post({
    joinCode: joinCode.toLowerCase(), userId: 'W-4821-07', pw: '1234',
  }));
  const b = await body(res);
  eq('가입 코드는 대소문자를 가리지 않는다', res.status, 200);
  eq('역할은 서버가 노동자로 정한다', b.user.role, 'worker');
  ok('★ 담당자 명단과 연결됐다', b.linked === true);
  eq('명단의 언어를 가져온다', b.user.lang, 'km');
  eq('명단의 공정을 가져온다', b.user.processId, 'p-press');
}

{
  /* 명단에 없는 사람도 가입은 된다 — 막으면 교육을 못 듣는다 */
  const res = await signup.handle(post({
    joinCode: joinCode, userId: 'W-9999-99', pw: '1234', lang: 'vi',
  }));
  const b = await body(res);
  eq('명단에 없어도 가입된다', res.status, 200);
  ok('연결은 안 됐다고 알려 준다', b.linked === false);
  eq('본인이 고른 언어가 들어간다', b.user.lang, 'vi');
}

{
  /* ★ 역할을 본문으로 올릴 수 없다 */
  const res = await signup.handle(post({
    joinCode: joinCode, userId: 'W-8888-88', pw: '1234', role: 'operator', workplaceId: 'w-남의것',
  }));
  const b = await body(res);
  eq('★ 본문에 role: operator 를 넣어도 노동자다', b.user.role, 'worker');
  const made = fake.data.accounts.find((a) => a.user_id === 'W-8888-88');
  eq('★ 본문에 적은 사업장이 아니라 가입 코드의 사업장에 들어간다', made.workplace_id, workplaceId);
}

{
  const res = await signup.handle(post({ joinCode: joinCode, userId: 'W-4821-07', pw: '1234' }));
  eq('이미 가입된 식별번호면 409', res.status, 409);
}

/* ===================================================================
   3. 로그인 (STC-E25-001)
   =================================================================== */

let workerToken = '';

{
  const res = await login.handle(post({ userId: 'W-4821-07', pw: '1234' }));
  const b = await body(res);
  eq('로그인 200', res.status, 200);
  ok('토큰 64자', typeof b.token === 'string' && b.token.length === 64);
  eq('사용자 정보가 온다', b.user.userId, 'W-4821-07');
  eq('사업장 이름이 온다', b.user.siteName, '대성정밀');
  ok('만료 시각이 온다', typeof b.expiresAt === 'string');

  const hours = (new Date(b.expiresAt) - Date.now()) / 3600000;
  ok('만료는 12시간 뒤다', hours > 11.9 && hours < 12.1, String(hours));

  workerToken = b.token;

  const flat = JSON.stringify(b);
  ok('★ 응답에 해시·salt 가 없다',
    flat.indexOf('pw_hash') === -1 && flat.indexOf('pw_salt') === -1 && flat.indexOf('token_hash') === -1);
}

{
  /* ★ 아이디가 없는 것과 비밀번호가 틀린 것을 구분해 주지 않는다 */
  const noId = await login.handle(post({ userId: '없는아이디', pw: '1234' }));
  const badPw = await login.handle(post({ userId: 'W-9999-99', pw: '틀린비번' }));
  const a = await body(noId);
  const c = await body(badPw);

  eq('없는 아이디도 401', noId.status, 401);
  eq('틀린 비밀번호도 401', badPw.status, 401);
  eq('★ 오류 코드가 같다', a.error, c.error);
  eq('★ 메시지도 똑같다', a.message, c.message);
  ok('★ "없는 아이디" 라고 말하지 않는다', a.message.indexOf('없') === -1, a.message);
}

{
  const res = await login.handle(post({ userId: '', pw: '' }));
  eq('빈 값이면 400', res.status, 400);
}

/* ===================================================================
   4. 5번 틀리면 잠긴다 (STC-E25-002)
   =================================================================== */

{
  const who = 'W-9999-99';
  /* 앞 절에서 한 번 틀려 둔 것이 남아 있다. 세는 것을 보는 절이라 0 에서 시작한다 */
  const start = fake.data.accounts.find((a) => a.user_id === who);
  start.failed_count = 0;
  start.locked_until = null;

  let last;
  for (let i = 0; i < 5; i += 1) {
    last = await login.handle(post({ userId: who, pw: '틀림' }));
  }
  eq('다섯 번째까지는 401 이다 (잠겼다고 알려 주지 않는다)', last.status, 401);

  const acc = fake.data.accounts.find((a) => a.user_id === who);
  ok('★ 잠금 시각이 생겼다', !!acc.locked_until);
  const mins = (new Date(acc.locked_until) - Date.now()) / 60000;
  ok('10분 뒤까지 잠긴다', mins > 9.5 && mins < 10.5, String(mins));

  const right = await login.handle(post({ userId: who, pw: '1234' }));
  const b = await body(right);
  eq('★ 잠긴 동안에는 맞는 비밀번호로도 못 들어간다', right.status, 423);
  eq('그때는 잠겼다고 말해 준다 (기다리면 풀린다)', b.error, 'locked');

  /* 잠금이 풀리면 다시 들어갈 수 있고, 실패 횟수는 0 으로 돌아간다 */
  acc.locked_until = new Date(Date.now() - 1000).toISOString();
  acc.failed_count = 3;
  const after = await login.handle(post({ userId: who, pw: '1234' }));
  eq('잠금이 풀리면 들어간다', after.status, 200);
  eq('★ 실패 횟수가 0 으로 돌아간다', acc.failed_count, 0);
  eq('잠금 시각도 지워진다', acc.locked_until, null);
}

/* ===================================================================
   5. SQL 인젝션 (STC-E25-014)
   =================================================================== */

{
  const evil = "' or 1=1 --";
  const res = await login.handle(post({ userId: evil, pw: 'x' }));
  eq('★ 인젝션 문자열로 로그인되지 않는다', res.status, 401);

  const last = fake.seen[fake.seen.length - 1] || fake.seen[0];
  const used = fake.seen.filter((s) => s.vals.indexOf(evil) !== -1);
  ok('★ 그 문자열은 값으로 들어갔다 (질의문에 섞이지 않았다)', used.length > 0);
  ok('★ 어떤 질의문에도 그 문자열이 붙어 있지 않다',
    fake.seen.every((s) => s.q.indexOf('1=1') === -1));
  ok('오류 없이 평범하게 거절한다', res.status === 401 && last !== undefined);
}

/* ===================================================================
   6. 토큰 — 만료·로그아웃 (STC-E25-003)
   =================================================================== */

{
  const acc = await db.accountFromToken(fake.sql, workerToken);
  ok('살아 있는 토큰으로 계정을 찾는다', acc && acc.user_id === 'W-4821-07');

  const none = await db.accountFromToken(fake.sql, '없는토큰');
  eq('모르는 토큰은 아무것도 아니다', none, null);

  const empty = await db.accountFromToken(fake.sql, '');
  eq('빈 토큰도 아무것도 아니다', empty, null);

  /* 만료된 토큰 */
  const s = fake.data.sessions.find((r) => r.token_hash === authLib.tokenHash(workerToken));
  const keep = s.expires_at;
  s.expires_at = new Date(Date.now() - 1000).toISOString();
  const expired = await db.accountFromToken(fake.sql, workerToken);
  eq('★ 만료된 토큰은 통하지 않는다', expired, null);
  s.expires_at = keep;
}

{
  const before = fake.data.sessions.length;
  const res = await logout.handle(post({}, { token: workerToken }));
  eq('로그아웃 200', res.status, 200);
  eq('세션이 하나 지워졌다', fake.data.sessions.length, before - 1);
  eq('지워진 뒤에는 그 토큰이 안 통한다', await db.accountFromToken(fake.sql, workerToken), null);

  /* ★ 공용 폰 — 로그아웃은 실패하면 안 된다 */
  const again = await logout.handle(post({}, { token: workerToken }));
  eq('★ 이미 지워진 토큰으로 또 불러도 200', again.status, 200);
  const noToken = await logout.handle(post({}));
  eq('★ 토큰이 아예 없어도 200', noToken.status, 200);
}

{
  /* 로그인할 때 만료된 세션을 치운다 */
  fake.data.sessions.push({
    token_hash: 'x'.repeat(64), account_id: 'a2',
    expires_at: new Date(Date.now() - 60000).toISOString(),
  });
  await login.handle(post({ userId: 'W-4821-07', pw: '1234' }));
  ok('★ 로그인할 때 만료된 세션을 치운다',
    !fake.data.sessions.some((r) => r.token_hash === 'x'.repeat(64)));
}

/* ===================================================================
   7. 들어오는 길 — 출처·메서드·설정
   =================================================================== */

{
  const other = await login.handle(new Request('https://x/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: '{}',
  }));
  eq('다른 출처는 403', other.status, 403);
  ok('403 에는 CORS 허용 헤더를 붙이지 않는다',
    other.headers.get('access-control-allow-origin') === null);

  const get = await login.handle(post({}, { method: 'GET' }));
  eq('GET 은 우리 405 를 돌려준다', get.status, 405);
  eq('플랫폼 405 가 아니라 우리 것이다', (await body(get)).error, 'method');

  const broken = await login.handle(new Request('https://x/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: '이건 JSON 이 아니다',
  }));
  eq('JSON 이 아니면 400', broken.status, 400);
}

{
  /* ★ 통과 문구(X-Agent-Pass)는 로그인에 필요 없다 — 로그인 전에 부르는 함수다 */
  delete process.env.AGENT_PASS;
  const res = await login.handle(post({ userId: 'W-4821-07', pw: '1234' }));
  eq('★ 통과 문구 없이도 로그인된다', res.status, 200);
  setEnv();
}

{
  /* DB 설정이 없으면 "사람이 틀렸다(401)" 가 아니라 "서버 설정(500)" 이다 */
  db.setSqlForTest(null);
  const keep = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const res = await login.handle(post({ userId: 'W-4821-07', pw: '1234' }));
  const b = await body(res);
  eq('★ DB 주소가 없으면 500 (401 로 뭉개지 않는다)', res.status, 500);
  eq('설정 오류라고 말한다', b.error, 'config');
  ok('★ 그때도 연결 문자열을 내보이지 않는다', JSON.stringify(b).indexOf('postgres') === -1);
  process.env.DATABASE_URL = keep;
  db.setSqlForTest(fake.sql);
}

/* ===================================================================
   7-2. DB가 아플 때 — 날것의 500 을 내지 않는다
        (2026-11-01 미리보기에서 실물로 드러났다: 표가 없는 DB에 물어보니
         플랫폼이 JSON 이 아닌 「Internal Server Error」를 냈고, 화면은
         그것을 읽지 못해 로컬 모드로 이어갈 수조차 없었다)
   =================================================================== */

{
  const angry = () => { throw new Error('relation "accounts" does not exist'); };
  angry.query = () => Promise.resolve([]);
  db.setSqlForTest(angry);

  const res = await login.handle(post({ userId: 'W-4821-07', pw: '1234' }));
  const b = await body(res);
  eq('★ DB가 던져도 우리 모양으로 답한다 (503)', res.status, 503);
  eq('화면이 읽을 수 있는 코드다', b.error, 'db');
  ok('★ 표 이름·질의문을 밖으로 내지 않는다',
    JSON.stringify(b).indexOf('accounts') === -1 && JSON.stringify(b).indexOf('relation') === -1);
  ok('자세한 것은 로그에만 남는다', logs.join(' ').indexOf('relation') !== -1);

  /* 로그아웃은 DB가 아파도 화면이 토큰을 버릴 수 있어야 한다 — 우리 모양으로 답한다 */
  const out = await logout.handle(post({}, { token: 'x'.repeat(64) }));
  eq('로그아웃도 날것의 500 을 내지 않는다', out.status, 503);

  db.setSqlForTest(fake.sql);
}

/* ===================================================================
   8. 로그 — 아이디·비밀번호·토큰을 남기지 않는다 (A02 §14.6)
   =================================================================== */

{
  const all = logs.join('\n');
  ok('★ 로그에 비밀번호가 없다', all.indexOf('1234') === -1);
  ok('★ 로그에 토큰이 없다', adminToken ? all.indexOf(adminToken) === -1 : true);
  ok('★ 로그에 아이디가 없다', all.indexOf('kim@daesung.co.kr') === -1);
  ok('로그는 한 줄 JSON 이다', logs.every((l) => {
    try { JSON.parse(l); return true; } catch (e) { return false; }
  }), logs.slice(0, 2).join(' | '));
  ok('무슨 길이었는지는 남는다 (고칠 때 필요하다)', all.indexOf('auth/login') !== -1);
}

/* ===================================================================
   9. 함수의 모양 — Vercel 이 Web 방식으로 부르게 (2차에서 겪은 것)
   =================================================================== */

[['login', login], ['logout', logout], ['signup', signup], ['signup-workplace', signupWp]]
  .forEach(([name, mod]) => {
    ok(name + ': ★ default 를 내보내지 않는다 (내보내면 옛 Node 방식으로 불려 터진다)',
      mod.default === undefined);
    ok(name + ': POST 를 받는다', mod.POST === mod.handle);
    ok(name + ': GET 도 받아서 우리 405 를 돌려준다', mod.GET === mod.handle);
    eq(name + ': maxDuration 30초', mod.config.maxDuration, 30);
  });

/* 비밀번호 확인 자체도 한 번 본다 (형식이 바뀌면 시연 계정이 못 들어온다) */
{
  const v = authLib.hashPassword('1234');
  ok('맞는 비밀번호는 통과', authLib.verifyPassword('1234', v.hash, v.salt));
  ok('틀린 비밀번호는 거절', !authLib.verifyPassword('12345', v.hash, v.salt));
  ok('해시가 깨져 있어도 터지지 않는다', !authLib.verifyPassword('1234', 'zz', v.salt));
  ok('값이 문자열이 아니어도 터지지 않는다', !authLib.verifyPassword(null, v.hash, v.salt));
}

db.setSqlForTest(null);
console.log = realLog;
report('/api/auth — 진짜 로그인 (T11)');
