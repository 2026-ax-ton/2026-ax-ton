/* 설비 촬영 사진 — Vercel Blob(비공개) 에 올리고, 목록을 보고, 한 장을 받는다 (2026-11-14).

   POST /api/scans  { op: 'put',  equipmentId, scanId, name, data: 'data:image/jpeg;base64,…' } → { ok, path }
   POST /api/scans  { op: 'list', equipmentId, scanId? }  → { scans: [{ scanId, count, at }] } · scanId 가 있으면 { paths: [...] }
   POST /api/scans  { op: 'get',  path }                   → { data: 'data:image/jpeg;base64,…' }

   🆕 2026-11-16 교육 그림 (보기 그림·설비 사진을 교육 데이터 밖으로 — 동기화 상한 512KB 를 풀기 위해)
   POST /api/scans  { op: 'media-put', courseId, name, data }   → { ok, ref: 'media:<courseId>/<name>.jpg' }   담당자만
   POST /api/scans  { op: 'media-get', ref }                    → { data: 'data:image/jpeg;base64,…' }       담당자·노동자
   POST /api/scans  { op: 'media-del', courseId }               → { ok, deleted }   담당자만 — 발급 저장이 실패했을 때 올려 둔 그 교육 그림을 치운다 (2026-11-21)
     ★ ref 에는 사업장이 없다 — 저장 경로 media/<내 사업장>/… 는 **토큰에서만** 붙인다. 남의 사업장 그림은 「없음」
     ★ 노동자는 media-get 만. 나머지(촬영 사진 올리기·목록·받기, 교육 그림 올리기)는 담당자만

   ★ 담당자(admin)만 (media-get 은 노동자도). 사업장은 **토큰에서만** 꺼낸다 — 경로가 scans/<내 사업장>/ 로 시작하지 않으면 없는 것으로 본다
   ★ 비공개 저장소다 — 사진 주소를 밖에 내주지 않는다. 받을 때도 이 함수를 거친다 (공장 내부 사진)
   ★ 몸통은 JSON(base64) — guardBasic 이 본문을 글자로 읽는다. 사진 1장 ≈ 0.3~0.5MB, 함수 본문 상한 4.5MB 안
   ★ Blob 라이브러리는 실제로 부를 때만 불러온다 — 검사는 npm install 없이 돈다 (Neon 드라이버와 같은 규칙)
   근거: scan.html 촬영 가이드 · A02 §14.4·§14.6 */

import { json, fail, log, guardBasic, parseJson } from './_shared.mjs';
import { getSql, authed, withDb } from './_db.mjs';

export const config = { maxDuration: 30 };

const MAX_BODY = 3 * 1024 * 1024;          // base64 사진 1장 + 여유
const MAX_PHOTO = 2 * 1024 * 1024;         // 풀어 낸 JPEG 상한
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const NAME_RE = /^[0-9]-[0-9]{1,2}-[0-9]{1,2}$/;   // 바퀴-칸-번호 (scan.js)
const JPEG_RE = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+=*)$/;
const MEDIA_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MEDIA_REF_RE = /^media:([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9_-]{1,64})\.jpg$/;
const MAX_MEDIA = 256 * 1024;              // 교육 그림 1장 — 줄인 사본(긴 변 256~448px)이라 넉넉하다

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

const mediaRoot = (account) => 'media/' + account.workplace_id + '/';

/** 🆕 교육 그림 올리기 — 담당자가 발급할 때 (autogen). 같은 이름이면 덮는다(다시 발급해도 한 장) */
async function mediaPut(account, body, cors) {
  const { courseId, name, data } = body;
  if (!MEDIA_NAME_RE.test(courseId || '') || !MEDIA_NAME_RE.test(name || '')) {
    return fail(400, 'bad_request', '교육·그림 이름을 확인해 주세요.', cors);
  }
  const m = JPEG_RE.exec(typeof data === 'string' ? data : '');
  if (!m) return fail(400, 'bad_request', 'JPEG 그림만 받습니다.', cors);
  const bytes = Buffer.from(m[1], 'base64');
  if (bytes.length > MAX_MEDIA) return fail(413, 'too_large', '그림이 너무 큽니다.', cors);
  const b = await blob();
  await b.put(mediaRoot(account) + courseId + '/' + name + '.jpg', bytes,
    { access: 'private', contentType: 'image/jpeg', addRandomSuffix: false, allowOverwrite: true });
  return json(200, { ok: true, ref: 'media:' + courseId + '/' + name + '.jpg' }, cors);
}

/** 🆕 2026-11-21 교육 그림 치우기 — 그 교육(courseId) 아래 것만, 내 사업장 것만. 주인 없는 그림(공장 내부 사진)을 남기지 않는다 */
async function mediaDel(account, body, cors) {
  if (!MEDIA_NAME_RE.test(body.courseId || '')) return fail(400, 'bad_request', '교육을 확인해 주세요.', cors);
  const b = await blob();
  const paths = (await listAll(b, mediaRoot(account) + body.courseId + '/')).map((x) => x.pathname);
  if (paths.length) await b.del(paths);
  return json(200, { ok: true, deleted: paths.length }, cors);
}

/** 🆕 교육 그림 받기 — 노동자 퀴즈·담당자 화면. 내 사업장 것만 */
async function mediaGet(account, body, cors) {
  const m = MEDIA_REF_RE.exec(typeof body.ref === 'string' ? body.ref : '');
  if (!m) return fail(404, 'not_found', '그림이 없습니다.', cors);
  const r = await (await blob()).get(mediaRoot(account) + m[1] + '/' + m[2] + '.jpg', { access: 'private' });
  if (!r || r.statusCode !== 200 || !r.stream) return fail(404, 'not_found', '그림이 없습니다.', cors);
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
  const body = parseJson(text);
  if (!body) return fail(400, 'bad_request', '보낸 내용을 읽을 수 없습니다.', cors);
  /* ★ 노동자가 할 수 있는 것은 교육 그림 받기(media-get) 하나뿐이다. 나머지는 담당자만 */
  const account = await authed(sql, request);
  if (!account) return fail(401, 'unauthorized', '다시 로그인해 주세요.', cors);
  const workerOk = body.op === 'media-get' && account.role === 'worker';
  if (account.role !== 'admin' && !workerOk) return fail(403, 'forbidden', '담당자 계정만 쓸 수 있습니다.', cors);
  if (!account.workplace_id) return fail(403, 'forbidden', '사업장 계정만 쓸 수 있습니다.', cors);
  const who = { account };

  const OPS = { put, list, get, 'media-put': mediaPut, 'media-get': mediaGet, 'media-del': mediaDel };
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
