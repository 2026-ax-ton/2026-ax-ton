/* /api/scans — 설비 촬영 사진 (Vercel Blob 비공개, 2026-11-14).
   ★ 실제 DB·저장소를 부르지 않는다 — 가짜 sql · 가짜 blob 을 끼운다.
   지키는 것: 담당자만 · 사업장은 토큰에서만 · 남의 사업장 사진은 「없음」 · JPEG 만 · 이름 모양 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, eq, report } = require('./harness');

const db = await import('../api/_db.mjs');
const scans = await import('../api/scans.mjs');
const authLib = await import('../api/_auth.mjs');

const ORIGIN = 'https://2026-ax-ton.vercel.app';
Object.assign(process.env, {
  ALLOWED_ORIGIN: ORIGIN, VERCEL_URL: '', VERCEL_BRANCH_URL: '',
  VERCEL_PROJECT_PRODUCTION_URL: '', ALLOW_FILE_ORIGIN: '0', DATABASE_URL: 'postgresql://fake/fake',
});

const tokens = new Map();
function sql(strings, ...vals) {
  const q = strings.join(' ? ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (q.startsWith('select a.id, a.user_id, a.role')) return Promise.resolve(tokens.has(vals[0]) ? [tokens.get(vals[0])] : []);
  throw new Error('가짜 DB가 모르는 질의: ' + q);
}
sql.query = () => Promise.resolve([]);
db.setSqlForTest(sql);
const login = (t, row) => { tokens.set(authLib.tokenHash(t), row); return t; };
const ADMIN = login('tok-a', { id: 'a1', user_id: 'kim', role: 'admin', workplace_id: 'wpA', site_name: 'A' });
const OTHER = login('tok-b', { id: 'a2', user_id: 'park', role: 'admin', workplace_id: 'wpB', site_name: 'B' });
const WORKER = login('tok-w', { id: 'a3', user_id: 'W-1', role: 'worker', workplace_id: 'wpA', site_name: 'A' });

/* 가짜 저장소 */
const store = new Map();
scans.setBlobForTest({
  put: async (p, bytes, o) => { ok('비공개로 올린다', o.access === 'private'); store.set(p, { bytes, at: new Date('2026-11-14T10:00:00Z') }); return { pathname: p }; },
  list: async ({ prefix }) => ({ blobs: [...store.keys()].filter((p) => p.startsWith(prefix)).map((p) => ({ pathname: p, uploadedAt: store.get(p).at })), hasMore: false }),
  get: async (p) => (store.has(p) ? { statusCode: 200, stream: new Response(store.get(p).bytes).body } : null),
  del: async (paths) => { [].concat(paths).forEach((p) => store.delete(p)); },
});

async function call(body, token) {
  const headers = { 'content-type': 'application/json', origin: ORIGIN };
  if (token) headers.authorization = 'Bearer ' + token;
  const res = await scans.handle(new Request('https://x/api/scans', { method: 'POST', headers, body: JSON.stringify(body) }));
  let data; try { data = JSON.parse(await res.text()); } catch (e) { data = null; }
  return { status: res.status, data };
}
const JPG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
const realLog = console.log;
console.log = () => {};

eq('토큰 없으면 401', (await call({ op: 'list', equipmentId: 'e1' })).status, 401);
eq('노동자는 403', (await call({ op: 'list', equipmentId: 'e1' }, WORKER)).status, 403);
eq('모르는 op 는 400', (await call({ op: 'del' }, ADMIN)).status, 400);
eq('__proto__ op 도 400', (await call({ op: '__proto__' }, ADMIN)).status, 400);

const put = await call({ op: 'put', equipmentId: 'e1', scanId: 's1', name: '0-3-1', data: JPG }, ADMIN);
eq('올린다', put.status, 200);
eq('★ 경로는 토큰의 사업장 아래', put.data && put.data.path, 'scans/wpA/e1/s1/0-3-1.jpg');
await call({ op: 'put', equipmentId: 'e1', scanId: 's1', name: '1-0-0', data: JPG }, ADMIN);
eq('PNG 는 받지 않는다', (await call({ op: 'put', equipmentId: 'e1', scanId: 's1', name: '0-1-1', data: 'data:image/png;base64,AAAA' }, ADMIN)).status, 400);
eq('★ 경로를 넘보는 이름은 막는다', (await call({ op: 'put', equipmentId: '../x', scanId: 's1', name: '0-1-1', data: JPG }, ADMIN)).status, 400);
eq('이름 모양이 다르면 막는다', (await call({ op: 'put', equipmentId: 'e1', scanId: 's1', name: 'a/b', data: JPG }, ADMIN)).status, 400);

const l = await call({ op: 'list', equipmentId: 'e1' }, ADMIN);
eq('촬영 묶음 1개 · 사진 2장', JSON.stringify(l.data.scans.map((s) => [s.scanId, s.count])), '[["s1",2]]');
eq('한 묶음의 사진 경로', (await call({ op: 'list', equipmentId: 'e1', scanId: 's1' }, ADMIN)).data.paths.length, 2);
eq('★ 다른 사업장에는 안 보인다', (await call({ op: 'list', equipmentId: 'e1' }, OTHER)).data.scans.length, 0);

const g = await call({ op: 'get', path: 'scans/wpA/e1/s1/0-3-1.jpg' }, ADMIN);
eq('사진을 받는다', g.data && g.data.data, JPG);
eq('★ 남의 사업장 사진은 404', (await call({ op: 'get', path: 'scans/wpA/e1/s1/0-3-1.jpg' }, OTHER)).status, 404);
eq('★ .. 경로는 404', (await call({ op: 'get', path: 'scans/wpA/../wpB/x.jpg' }, ADMIN)).status, 404);

/* 🆕 2026-11-16 교육 그림 (media-put · media-get) — 교육 데이터 밖으로 */
{
  const mp = await call({ op: 'media-put', courseId: 'c1', name: 'q0-1', data: JPG }, ADMIN);
  eq('★ 교육 그림을 올리면 사업장이 없는 주소(media:)를 준다', mp.data && mp.data.ref, 'media:c1/q0-1.jpg');
  ok('★ 저장 경로는 토큰의 사업장 아래', store.has('media/wpA/c1/q0-1.jpg'));
  eq('★★ 노동자는 그림을 올릴 수 없다', (await call({ op: 'media-put', courseId: 'c1', name: 'x', data: JPG }, WORKER)).status, 403);
  eq('PNG 는 받지 않는다', (await call({ op: 'media-put', courseId: 'c1', name: 'x', data: 'data:image/png;base64,AAAA' }, ADMIN)).status, 400);
  eq('★ 경로를 넘보는 교육 id 는 막는다', (await call({ op: 'media-put', courseId: '../c', name: 'x', data: JPG }, ADMIN)).status, 400);
  const big = 'data:image/jpeg;base64,' + Buffer.alloc(300 * 1024, 1).toString('base64');
  eq('너무 큰 그림은 413', (await call({ op: 'media-put', courseId: 'c1', name: 'big', data: big }, ADMIN)).status, 413);

  eq('★★ 노동자도 자기 사업장 교육 그림은 받는다', (await call({ op: 'media-get', ref: 'media:c1/q0-1.jpg' }, WORKER)).data.data, JPG);
  eq('담당자도 받는다', (await call({ op: 'media-get', ref: 'media:c1/q0-1.jpg' }, ADMIN)).data.data, JPG);
  eq('★★ 다른 사업장은 같은 주소로도 404', (await call({ op: 'media-get', ref: 'media:c1/q0-1.jpg' }, OTHER)).status, 404);
  eq('★ 주소 모양이 다르면 404 (경로를 넘볼 수 없다)', (await call({ op: 'media-get', ref: 'media:../wpB/c1/x.jpg' }, WORKER)).status, 404);
  eq('★★ 노동자는 촬영 사진(scans)은 여전히 못 받는다', (await call({ op: 'get', path: 'scans/wpA/e1/s1/0-3-1.jpg' }, WORKER)).status, 403);

  /* 🆕 2026-11-21 media-del — 발급 저장이 실패했을 때 그 교육 그림만 치운다 */
  await call({ op: 'media-put', courseId: 'c2', name: 'photo', data: JPG }, ADMIN);
  await call({ op: 'media-put', courseId: 'c2', name: 'q0-0', data: JPG }, OTHER);   // 남의 사업장 같은 교육 id
  eq('★★ 노동자는 그림을 치울 수 없다', (await call({ op: 'media-del', courseId: 'c2' }, WORKER)).status, 403);
  eq('교육 id 모양이 다르면 400', (await call({ op: 'media-del', courseId: '../c' }, ADMIN)).status, 400);
  const md = await call({ op: 'media-del', courseId: 'c2' }, ADMIN);
  eq('★ 그 교육 그림을 치운다', md.status + '|' + (md.data && md.data.deleted), '200|1');
  ok('★★ 내 사업장의 그 교육 것만 — 다른 교육·남의 사업장 그림은 그대로', !store.has('media/wpA/c2/photo.jpg') && store.has('media/wpA/c1/q0-1.jpg') && store.has('media/wpB/c2/q0-0.jpg'));
}

scans.setBlobForTest({ list: async () => { throw new Error('boom secret'); } });
const bad = await call({ op: 'list', equipmentId: 'e1' }, ADMIN);
eq('저장소가 아프면 502 storage (DB 오류로 뭉개지 않는다)', bad.status + ' ' + (bad.data && bad.data.error), '502 storage');
ok('오류 원문을 밖에 내지 않는다', !/boom|secret/.test(JSON.stringify(bad.data)));

scans.setBlobForTest(null);
db.setSqlForTest(null);
console.log = realLog;
report('/api/scans — 설비 촬영 사진');
