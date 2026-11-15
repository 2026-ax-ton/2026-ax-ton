/* 평가문항 번역 — api/_quiztrans.mjs · /api/translate-quiz (2026-11-11)
   ★ 실제 AI·DB 를 부르지 않는다. 가짜 fetch · 가짜 sql 을 끼운다.
   지키는 것: 선택지·결과 개수가 같아야 한다(정답 인덱스) · 빈 칸 없음 · 한국어 글자가 남으면 실패(설비 이름은 예외) · 담당자만 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, eq, has, report } = require('./harness');
const db = await import('../api/_db.mjs');
const shared = await import('../api/_shared.mjs');
const authLib = await import('../api/_auth.mjs');
const T = await import('../api/_quiztrans.mjs');
const api = await import('../api/translate-quiz.mjs');

const ORIGIN = 'https://2026-ax-ton.vercel.app';
const realLog = console.log;
console.log = () => {};
Object.assign(process.env, {
  ALLOWED_ORIGIN: ORIGIN, VERCEL_URL: '', VERCEL_BRANCH_URL: '', VERCEL_PROJECT_PRODUCTION_URL: '', ALLOW_FILE_ORIGIN: '0',
  DATABASE_URL: 'postgresql://fake/fake', GEMINI_API_KEY: 'AIzaSyFAKE0000000000translatequiz', AI_MODEL_TRANSLATE: 'gemini-3.1-flash-lite', AI_DAILY_LIMIT: '600',
});
delete process.env.AI_PROVIDER;
shared.resetDailyCall();
const tokens = new Map();
db.setSqlForTest((strings, ...vals) => {
  const q = strings.join(' ? ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (q.startsWith('select a.id, a.user_id, a.role')) return Promise.resolve(tokens.has(vals[0]) ? [tokens.get(vals[0])] : []);
  throw new Error('가짜 DB: ' + q);
});
const login = (t, row) => { tokens.set(authLib.tokenHash(t), row); return t; };
const ADMIN = login('tok-a', { id: 'a1', user_id: 'kim', role: 'admin', name: '김', workplace_id: 'wp', site_name: 'A' });
const WORKER = login('tok-w', { id: 'a2', user_id: 'W', role: 'worker', name: '', workplace_id: 'wp', site_name: 'A' });

const ITEMS = T.cleanItems([
  { id: 'q1', prompt: '사진에서 「램」을 누르세요', why: '램이 내려온다' },
  { id: 'q2', prompt: '어떻게 합니까?', options: ['가', '나', '다'], results: ['ㄱ', 'ㄴ', 'ㄷ'], why: '해설' },
  { id: 'bad id!', prompt: 'x' },
]);
eq('모양이 틀린 문항은 버린다', ITEMS.map((q) => q.id).join(), 'q1,q2');

const good = { items: [
  { id: 'q1', prompt: 'ចុច ដុំដែក', why: 'ដុំដែកចុះមក' },
  { id: 'q2', prompt: 'ធ្វើអ្វី?', options: ['ក', 'ខ', 'គ'], results: ['១', '២', '៣'], why: 'ពន្យល់' },
] };
const r1 = T.readTranslations(good, ITEMS, []);
eq('★ 온전한 번역은 받는다', Object.keys(r1.i18n).join() + '|' + r1.failed.length, 'q1,q2|0');
const r2 = T.readTranslations({ items: [good.items[0], { ...good.items[1], options: ['ក', 'ខ'] }] }, ITEMS, []);
has('★★ 선택지 개수가 다르면 실패 (정답 인덱스가 어긋난다)', JSON.stringify(r2.failed), 'options 개수가 다름');
const r3 = T.readTranslations({ items: [{ ...good.items[0], prompt: 'ចុច 램' }, good.items[1]] }, ITEMS, []);
has('★★ 한국어 글자가 남으면 실패 (한국어를 섞지 않는다)', JSON.stringify(r3.failed), '한국어 글자가 남음');
const r4 = T.readTranslations({ items: [{ ...good.items[0], prompt: 'ចុច 프레스 3호기' }, good.items[1]] }, ITEMS, ['프레스 3호기']);
eq('★ 설비 이름(고유명사)은 남아도 된다', r4.failed.length, 0);
const r5 = T.readTranslations({ items: [good.items[1]] }, ITEMS, []);
has('번역이 안 온 문항은 실패', JSON.stringify(r5.failed), '번역이 오지 않음');
const r6 = T.readTranslations({ items: [good.items[0], { ...good.items[1], why: '' }] }, ITEMS, []);
has('빈 칸이면 실패', JSON.stringify(r6.failed), 'why 빈 칸');
eq('prevention 은 비어도 실패가 아니다 (노동자에게 안 나간다)', T.readTranslations({ items: [good.items[0], { ...good.items[1] }] }, T.cleanItems([ITEMS[0], { ...ITEMS[1], prevention: '예방' }]), []).failed.length, 0);
has('★ 깨진 글자(U+FFFD)가 있으면 실패', JSON.stringify(T.readTranslations({ items: [{ ...good.items[0], prompt: 'ចុច �' }, good.items[1]] }, ITEMS, []).failed), '깨진 글자');
has('지시문 — 개수·순서 그대로', T.systemText('크메르어'), '개수와 순서를 그대로');

globalThis.fetch = async (url, init) => {
  if (!(init && init.body)) return new Response('', { status: 404 });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(good) }] } }] }), { status: 200 });
};
const call = async (body, tok = ADMIN) => {
  const res = await api.handle(new Request('https://x/api/translate-quiz', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, authorization: 'Bearer ' + tok }, body: JSON.stringify(body) }));
  return { status: res.status, data: await res.json().catch(() => null) };
};
const BODY = { equipment: { id: 'e-press3', name: '프레스 3호기' }, lang: 'km', items: ITEMS };
eq('노동자는 못 부른다', (await call(BODY, WORKER)).status, 403);
eq('모르는 언어는 400', (await call({ ...BODY, lang: 'xx' })).status, 400);
eq('문항이 없으면 400', (await call({ ...BODY, items: [] })).status, 400);
const ok1 = await call(BODY);
eq('★ 200 · 번역 · 설비 id 를 돌려준다', ok1.status + '|' + Object.keys(ok1.data.i18n).join() + '|' + ok1.data.equipment.id, '200|q1,q2|e-press3');

db.setSqlForTest(null);
console.log = realLog;
report('평가문항 번역 — /api/translate-quiz');
