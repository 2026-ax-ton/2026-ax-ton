/* 설비 촬영 사진 — Vercel Blob(비공개) 에 올리고, 목록을 보고, 한 장을 받는다 (2026-11-14).

   POST /api/scans  { op: 'put',  equipmentId, scanId, name, data: 'data:image/jpeg;base64,…' } → { ok, path }
   POST /api/scans  { op: 'list', equipmentId, scanId? }  → { scans: [{ scanId, count, at }] } · scanId 가 있으면 { paths: [...] }
   POST /api/scans  { op: 'get',  path }                   → { data: 'data:image/jpeg;base64,…' }

   ★ 담당자(admin)만. 사업장은 **토큰에서만** 꺼낸다 — 경로가 scans/<내 사업장>/ 로 시작하지 않으면 없는 것으로 본다
   ★ 비공개 저장소다 — 사진 주소를 밖에 내주지 않는다. 받을 때도 이 함수를 거친다 (공장 내부 사진)
   ★ 몸통은 JSON(base64) — guardBasic 이 본문을 글자로 읽는다. 사진 1장 ≈ 0.3~0.5MB, 함수 본문 상한 4.5MB 안
   ★ Blob 라이브러리는 실제로 부를 때만 불러온다 — 검사는 npm install 없이 돈다 (Neon 드라이버와 같은 규칙)
   근거: scan.html 촬영 가이드 · A02 §14.4·§14.6 */

import { json, fail, log, guardBasic, parseJson } from './_shared.mjs';
import { getSql, requireAdmin, withDb } from './_db.mjs';

export const config = { maxDuration: 30 };

const MAX_BODY = 3 * 1024 * 1024;          // base64 사진 1장 + 여유
const MAX_PHOTO = 2 * 1024 * 1024;         // 풀어 낸 JPEG 상한
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const NAME_RE = /^[0-9]-[0-9]{1,2}-[0-9]{1,2}$/;   // 바퀴-칸-번호 (scan.js)
const JPEG_RE = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+=*)$/;

let blobForTest = null;
export function setBlobForTest(b) { blobForTest = b; }
async function blob() { return blobForTest || import('@vercel/blob'); }

const root = (account) => 'scans/' + account.workplace_id + '/';

async function put(account, body, cors) {
  const { equipmentId, scanId, name, data } = body;
  if (!ID_RE.test(equipmentId || '') || !ID_RE.test(scanId || '') || !NAME_RE.test(name || '')) {
    return fail(400, 'bad_request', '설비·촬영·사진 이름을 확인해 주세요.', cors);
  }
  const m = JPEG_RE.exec(typeof data === 'string' ? data : '');
  if (!m) return fail(400, 'bad_request', 'JPEG 사진만 받습니다.', cors);
  const bytes = Buffer.from(m[1], 'base64');
  if (bytes.length > MAX_PHOTO) return fail(413, 'too_large', '사진이 너무 큽니다.', cors);
  const path = root(account) + equipmentId + '/' + scanId + '/' + name + '.jpg';
  const b = await blob();
  await b.put(path, bytes, { access: 'private', contentType: 'image/jpeg', addRandomSuffix: false, allowOverwrite: true });
  return json(200, { ok: true, path }, cors);
}

async function listAll(b, prefix) {
  const out = [];
  let cursor;
  do {
    const r = await b.list({ prefix, cursor, limit: 1000 });
    (r.blobs || []).forEach((x) => out.push(x));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

async function list(account, body, cors) {
  const { equipmentId, scanId } = body;
  if (!ID_RE.test(equipmentId || '') || (scanId !== undefined && !ID_RE.test(scanId))) {
    return fail(400, 'bad_request', '설비를 확인해 주세요.', cors);
  }
  const prefix = root(account) + equipmentId + '/' + (scanId ? scanId + '/' : '');
  const blobs = await listAll(await blob(), prefix);
  if (scanId) return json(200, { paths: blobs.map((x) => x.pathname).sort() }, cors);
  const by = new Map();
  blobs.forEach((x) => {
    const id = x.pathname.slice(prefix.length).split('/')[0];
    const s = by.get(id) || { scanId: id, count: 0, at: '' };
    s.count += 1;
    const at = new Date(x.uploadedAt).toISOString();
    if (at > s.at) s.at = at;
    by.set(id, s);
  });
  return json(200, { scans: [...by.values()].sort((a, b2) => (a.at < b2.at ? 1 : -1)) }, cors);
}

async function get(account, body, cors) {
  const path = typeof body.path === 'string' ? body.path : '';
  /* ★ 남의 사업장 경로·이상한 경로는 「없음」 — 있는지도 알려 주지 않는다 */
  if (path.indexOf(root(account)) !== 0 || path.indexOf('..') !== -1 || !/\.jpg$/.test(path)) {
    return fail(404, 'not_found', '사진이 없습니다.', cors);
  }
  const r = await (await blob()).get(path, { access: 'private' });
  if (!r || r.statusCode !== 200 || !r.stream) return fail(404, 'not_found', '사진이 없습니다.', cors);
  const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
  return json(200, { data: 'data:image/jpeg;base64,' + buf.toString('base64') }, cors);
}

async function run(request) {
  const started = Date.now();
  const g = await guardBasic(request, { methods: ['POST'], maxBytes: MAX_BODY });
  if (g.done) return g.done;
  const { cors, text } = g;

  const sql = await getSql();
  if (!sql) return fail(500, 'config', '서버 설정 오류입니다.', cors);
  const who = await requireAdmin(sql, request, cors);
  if (who.done) return who.done;
  if (!who.account.workplace_id) return fail(403, 'forbidden', '사업장 계정만 쓸 수 있습니다.', cors);

  const body = parseJson(text);
  if (!body) return fail(400, 'bad_request', '보낸 내용을 읽을 수 없습니다.', cors);
  const OPS = { put, list, get };
  const op = Object.prototype.hasOwnProperty.call(OPS, body.op) ? OPS[body.op] : null;
  if (!op) return fail(400, 'bad_request', '알 수 없는 요청입니다.', cors);
  let res;
  try {
    res = await op(who.account, body, cors);
  } catch (e) {
    /* 저장소 오류를 DB 오류(withDb)로 뭉개지 않는다 — 원문은 로그에만 */
    log({ route: 'scans', op: body.op, status: 502, err: 'storage', why: String(e && e.message || '').slice(0, 120) });
    return fail(502, 'storage', '사진 저장소에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요.', cors);
  }
  log({ route: 'scans', op: body.op, status: res.status, ms: Date.now() - started });
  return res;
}

export const handle = withDb('scans', run);

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
