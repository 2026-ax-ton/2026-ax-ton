/* 동기화 — 기기와 서버가 데이터를 주고받는 한 자리 (T12 · TK-3-03).

   GET  /api/store?keys=setup,courses,…   → { setup: {data, version}, … }
   PUT  /api/store?key=progress           ← { data, baseVersion } → { data, version }

   ★ 경로에 `:key` 를 쓰지 않고 `?key=` 로 받는다 (A02 §14.3 과 다른 점).
     동적 경로 파일(`[key].mjs`)을 쓰면 플랫폼이 어떻게 부르는지가 하나 더 늘어난다.
     2차에서 `export default` 하나로 함수가 통째로 안 뜬 적이 있어, **플랫폼에
     맡기는 부분을 늘리지 않는다.** 하는 일은 같다.

   넘지 않는 선 (A02 §14.4·§14.6)
     · 역할과 사업장은 **토큰에서만** 꺼낸다. 본문·쿼리의 사업장 값은 보지 않는다
     · 노동자는 **자기 `progress` 행만** 쓸 수 있다. 남의 행은 서버가 조용히 버린다
     · 노동자가 `progress` 를 읽으면 **자기 것만** 나간다
     · 합치기는 행 단위다 — 덩어리째 덮어써서 남의 기록을 지우지 않는다 (C05 P-4)
     · `reports`(익명 신고)는 여기로 다니지 않는다. 별도 경로다 (T13)

   근거: A02 §14.3·§14.4·§14.5·§14.6 · D06 §3.1 [8] */

import { json, fail, log, guardBasic, parseJson } from './_shared.mjs';
import { getSql, authed, withDb } from './_db.mjs';
import { mergeList, canReplaceDoc, LIST_KEYS, DOC_KEYS } from './_merge.mjs';

export const config = { maxDuration: 30 };

/* 한 사업장이 보내는 한 덩어리의 상한. 교육·기록이 쌓여도 넘지 않는 크기다 */
const MAX_SYNC_BYTES = 512 * 1024;

/* 사업장별 저장 키(docs 표)와 공용 키(library 표)를 가른다 */
const WORKPLACE_KEYS = ['setup', 'courses', 'progress', 'posts', 'orders'];
const SHARED_KEYS = ['library'];
const ALL_KEYS = [...WORKPLACE_KEYS, ...SHARED_KEYS];

/* 누가 쓸 수 있나 (A02 §14.4 표 14-3) */
const WRITERS = {
  setup: ['admin'],
  courses: ['admin'],
  orders: ['admin'],
  posts: ['worker', 'admin'],
  progress: ['worker'],
  library: ['operator'],
};

function emptyFor(key) {
  return key === 'setup' ? {} : [];
}

/** 노동자에게는 자기 기록만 보여 준다 (A02 §14.4) */
function readFilter(key, account, data) {
  if (key === 'progress' && account.role === 'worker') {
    return (Array.isArray(data) ? data : []).filter((r) => r && r.workerId === account.user_id);
  }
  return data;
}

/* ── 읽기 ──────────────────────────────────────────────────────────── */

async function pull(sql, account, keys, cors) {
  const out = {};

  const wanted = keys.filter((k) => ALL_KEYS.indexOf(k) !== -1);
  const mine = wanted.filter((k) => WORKPLACE_KEYS.indexOf(k) !== -1);
  const shared = wanted.filter((k) => SHARED_KEYS.indexOf(k) !== -1);

  if (mine.length && account.workplace_id) {
    /* 한 사업장의 저장 키는 많아야 5줄이다. 배열을 질의에 넘기는 대신
       다 가져와서 고른다 — 드라이버가 배열을 어떤 타입으로 보내는지에
       기대지 않는다 (플랫폼에 맡기는 부분을 늘리지 않는다). */
    const rows = await sql`
      select key, data, version from docs where workplace_id = ${account.workplace_id}`;
    (rows || []).forEach((r) => {
      if (mine.indexOf(r.key) === -1) return;
      out[r.key] = { data: readFilter(r.key, account, r.data), version: r.version };
    });
  }

  if (shared.length) {
    const rows = await sql`select id, data, version from library order by id`;
    /* 문구는 행마다 판이 따로다. 기기에는 **가장 큰 판**을 알려 준다 —
       그래야 다음에 보낼 때 "내가 본 판" 을 하나로 말할 수 있다. */
    let version = 0;
    const list = (rows || []).map((r) => {
      if (r.version > version) version = r.version;
      return r.data;
    });
    out.library = { data: list, version };
  }

  /* 서버에 아직 없는 키도 모양을 맞춰 돌려준다. 화면이 분기하지 않게 한다 */
  wanted.forEach((k) => {
    if (!out[k]) out[k] = { data: emptyFor(k), version: 0 };
  });

  return json(200, out, cors);
}

/* ── 쓰기 ──────────────────────────────────────────────────────────── */

async function push(sql, account, key, body, cors) {
  if (ALL_KEYS.indexOf(key) === -1) {
    return fail(400, 'bad_request', '모르는 저장 키입니다.', cors);
  }
  if ((WRITERS[key] || []).indexOf(account.role) === -1) {
    /* ★ 화면 가드가 있어도 서버가 다시 본다. 주소를 직접 쳐도 막힌다 */
    return fail(403, 'forbidden', '이 자료를 고칠 수 있는 역할이 아닙니다.', cors);
  }
  if (WORKPLACE_KEYS.indexOf(key) !== -1 && !account.workplace_id) {
    return fail(403, 'forbidden', '사업장에 속한 계정만 고칠 수 있습니다.', cors);
  }

  const incoming = body.data;
  const baseVersion = Number(body.baseVersion) || 0;

  /* 공용 문구 라이브러리 — 행마다 판이 따로다 */
  if (key === 'library') return pushLibrary(sql, account, incoming, cors);

  const rows = await sql`
    select data, version from docs
     where workplace_id = ${account.workplace_id} and key = ${key}`;
  const current = rows && rows[0];
  const serverVersion = current ? current.version : 0;
  const base = current ? current.data : emptyFor(key);

  let merged;
  let dropped = 0;

  if (DOC_KEYS.indexOf(key) !== -1) {
    /* 한 덩어리 — 오래된 판이면 받지 않는다. 화면이 당겨와 다시 보낸다 */
    if (serverVersion !== 0 && !canReplaceDoc(serverVersion, baseVersion)) {
      return json(409, {
        error: 'stale', message: '다른 기기에서 먼저 바뀌었습니다. 불러온 뒤 다시 저장합니다.',
        data: base, version: serverVersion,
      }, cors);
    }
    merged = (incoming && typeof incoming === 'object') ? incoming : base;
  } else if (LIST_KEYS.indexOf(key) !== -1) {
    /* ★ 노동자는 자기 행만. 남의 행은 조용히 버린다 (A02 §14.4) */
    const allow = (key === 'progress' && account.role === 'worker')
      ? (row) => row && row.workerId === account.user_id
      : null;
    const r = mergeList(key, base, incoming, allow);
    merged = r.list;
    dropped = r.dropped;
  } else {
    return fail(400, 'bad_request', '모르는 저장 키입니다.', cors);
  }

  const saved = await sql`
    insert into docs (workplace_id, key, data, version, updated_at)
    values (${account.workplace_id}, ${key}, ${JSON.stringify(merged)}, 1, now())
    on conflict (workplace_id, key) do update set
      data = excluded.data, version = docs.version + 1, updated_at = now()
    returning data, version`;

  if (dropped) {
    /* 버린 것이 있으면 로그에 센다. 누구 것인지는 남기지 않는다 */
    log({ route: 'store/push', key, dropped, status: 200, err: '' });
  }

  return json(200, {
    data: readFilter(key, account, saved[0].data), version: saved[0].version,
  }, cors);
}

/** 문구 라이브러리 — 전 사업장 공용이라 행(문구 id)마다 따로 저장한다 */
async function pushLibrary(sql, account, incoming, cors) {
  const list = Array.isArray(incoming) ? incoming : [];
  const rows = await sql`select id, data, version from library`;
  const base = (rows || []).map((r) => r.data);

  const r = mergeList('library', base, list, null);
  let version = 0;

  for (const phrase of r.list) {
    if (!phrase || !phrase.id) continue;
    const saved = await sql`
      insert into library (id, data, version, updated_at)
      values (${phrase.id}, ${JSON.stringify(phrase)}, 1, now())
      on conflict (id) do update set
        data = excluded.data, version = library.version + 1, updated_at = now()
      returning version`;
    if (saved[0].version > version) version = saved[0].version;
  }

  return json(200, { data: r.list, version }, cors);
}

/* ── 들어오는 길 ───────────────────────────────────────────────────── */

async function run(request) {
  const started = Date.now();
  const g = await guardBasic(request, { methods: ['GET', 'PUT'], maxBytes: MAX_SYNC_BYTES });
  if (g.done) return g.done;
  const { cors, text } = g;

  const sql = await getSql();
  if (!sql) return fail(500, 'config', '서버 설정 오류입니다.', cors);

  /* ★ 누구인지는 토큰으로만 안다 (A02 §14.6) */
  const account = await authed(sql, request);
  if (!account) return fail(401, 'unauthorized', '다시 로그인해 주세요.', cors);

  const url = new URL(request.url);

  if (request.method === 'GET') {
    const keys = (url.searchParams.get('keys') || '').split(',')
      .map((k) => k.trim()).filter(Boolean);
    if (!keys.length) return fail(400, 'bad_request', '무엇을 불러올지 적어 주세요.', cors);
    const res = await pull(sql, account, keys, cors);
    log({ route: 'store/pull', role: account.role, n: keys.length, ms: Date.now() - started, status: 200, err: '' });
    return res;
  }

  const key = (url.searchParams.get('key') || '').trim();
  const body = parseJson(text);
  if (!body) return fail(400, 'bad_request', '보낸 내용을 읽을 수 없습니다.', cors);

  const res = await push(sql, account, key, body, cors);
  log({ route: 'store/push', role: account.role, key, ms: Date.now() - started, status: res.status, err: '' });
  return res;
}

export const handle = withDb('store', run);

/* default 를 내보내지 않는다 — Vercel 이 옛 Node 방식으로 불러 터진다 (2차에서 겪음) */
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
