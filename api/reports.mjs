/* 익명 신고 — 노동자가 보내고 담당자가 본다 (T13 · TK-3-04).

   POST  /api/reports          ← 노동자 { data } → { id }
   GET   /api/reports          → 담당자 { list: [...] } (자기 사업장만)
   PATCH /api/reports?id=<rid> ← 담당자 { status } → 바뀐 신고

   ★★ 계정은 토큰에서 사업장만 꺼내고 그 자리에서 버린다 (A02 §14.3·§14.6).
     저장되는 행(`reports` 표)에는 애초에 계정 열이 없다 (db/migrations/001_init.sql).
     여기서 한 번 더 지킨다 — 본문에 무엇이 섞여 와도 **우리가 정한 필드만** 저장한다.

   ★ 재전송(끊김 뒤 다시 보내기)으로 같은 신고가 두 번 쌓이지 않게,
     기기가 보낸 id(`data.id`)로 사업장 안에서 먼저 찾아본다 — 있으면 그대로 돌려준다.

   근거: A02 §14.3·§14.4·§14.6 · 제품 원칙(익명 신고) */

import { json, fail, log, guardBasic, parseJson } from './_shared.mjs';
import { getSql, authed, withDb } from './_db.mjs';

export const config = { maxDuration: 30 };

const MAX_BYTES = 8 * 1024;
const MAX_FIELD = 1000;
const STATUSES = ['received', 'urgent', 'resolved'];

function clip(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/** 들어온 것 중 **우리가 정한 필드만** 남긴다. 그 밖의 것(계정 값이 섞여 와도)은 버린다. */
function cleanReport(data) {
  const out = {
    ticket: clip(data.ticket, 40),
    processId: clip(data.processId, 80),
    equipmentId: clip(data.equipmentId, 80),
    hazard: clip(data.hazard, 40),
    memo: clip(data.memo, MAX_FIELD),
    memoFromVoice: !!data.memoFromVoice,
    status: STATUSES.indexOf(data.status) !== -1 ? data.status : 'received',
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
  };
  const clientId = clip(data.id, 60);
  if (clientId) out.id = clientId;
  return out;
}

async function create(sql, account, body, cors) {
  if (account.role !== 'worker') {
    return fail(403, 'forbidden', '노동자 계정만 신고를 보낼 수 있습니다.', cors);
  }
  if (!account.workplace_id) {
    return fail(403, 'forbidden', '사업장에 속한 계정만 보낼 수 있습니다.', cors);
  }
  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
    return fail(400, 'bad_request', '신고 내용을 읽을 수 없습니다.', cors);
  }

  const clean = cleanReport(body.data);

  if (clean.id) {
    const dup = await sql`
      select id from reports
       where workplace_id = ${account.workplace_id} and data->>'id' = ${clean.id}
       limit 1`;
    if (dup && dup[0]) return json(200, { id: dup[0].id }, cors);
  }

  const rows = await sql`
    insert into reports (workplace_id, data)
    values (${account.workplace_id}, ${JSON.stringify(clean)})
    returning id`;

  return json(200, { id: rows[0].id }, cors);
}

/** 담당자에게 돌려준다. 신고자를 가리키는 값은 애초에 저장해 두지 않았다 (A02 §14.6) */
async function list(sql, account, cors) {
  if (account.role !== 'admin') {
    return fail(403, 'forbidden', '담당자 계정만 볼 수 있습니다.', cors);
  }
  if (!account.workplace_id) return json(200, { list: [] }, cors);

  const rows = await sql`
    select id, data from reports
     where workplace_id = ${account.workplace_id}
     order by created_at desc`;

  const out = (rows || []).map((r) => ({ ...r.data, rid: r.id }));
  return json(200, { list: out }, cors);
}

async function setStatus(sql, account, rid, body, cors) {
  if (account.role !== 'admin') {
    return fail(403, 'forbidden', '담당자 계정만 바꿀 수 있습니다.', cors);
  }
  if (!rid) return fail(400, 'bad_request', '어느 신고인지 알 수 없습니다.', cors);
  if (STATUSES.indexOf(body.status) === -1) {
    return fail(400, 'bad_request', '모르는 상태입니다.', cors);
  }

  /* ★ 사업장이 다르면 404 — 있는지 없는지도 알려 주지 않는다 (남의 신고를 더듬지 못하게) */
  const rows = await sql`
    select data from reports where id = ${rid} and workplace_id = ${account.workplace_id}`;
  if (!rows || !rows[0]) return fail(404, 'not_found', '신고를 찾을 수 없습니다.', cors);

  const next = { ...rows[0].data, status: body.status };
  await sql`update reports set data = ${JSON.stringify(next)} where id = ${rid}`;

  return json(200, { ...next, rid }, cors);
}

async function run(request) {
  const started = Date.now();
  const g = await guardBasic(request, { methods: ['GET', 'POST', 'PATCH'], maxBytes: MAX_BYTES });
  if (g.done) return g.done;
  const { cors, text } = g;

  const sql = await getSql();
  if (!sql) return fail(500, 'config', '서버 설정 오류입니다.', cors);

  /* ★ 누구인지는 토큰으로만 안다. 역할·사업장은 본문에 적어 보내도 안 먹는다 */
  const account = await authed(sql, request);
  if (!account) return fail(401, 'unauthorized', '다시 로그인해 주세요.', cors);

  if (request.method === 'GET') {
    const res = await list(sql, account, cors);
    log({ route: 'reports/list', role: account.role, ms: Date.now() - started, status: res.status, err: '' });
    return res;
  }

  const body = parseJson(text);
  if (!body) return fail(400, 'bad_request', '보낸 내용을 읽을 수 없습니다.', cors);

  if (request.method === 'PATCH') {
    const url = new URL(request.url);
    const rid = (url.searchParams.get('id') || '').trim();
    const res = await setStatus(sql, account, rid, body, cors);
    log({ route: 'reports/patch', role: account.role, ms: Date.now() - started, status: res.status, err: '' });
    return res;
  }

  const res = await create(sql, account, body, cors);
  log({ route: 'reports/create', role: account.role, ms: Date.now() - started, status: res.status, err: '' });
  return res;
}

export const handle = withDb('reports', run);

/* default 를 내보내지 않는다 — Vercel 이 옛 Node 방식으로 불러 터진다 (2차에서 겪음) */
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
