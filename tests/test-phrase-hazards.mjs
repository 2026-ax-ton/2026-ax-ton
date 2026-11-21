/* 문구 위험유형 태그 — Store.phrasesFor(종류, 목록, 위험) · /api/translate draft 거르기 (2026-11-17)
   ★ 실제 AI 를 부르지 않는다.
   지키는 것: 다른 종류 문구는 안 섞임 · 위험이 겹치는 문구만 · 태그 없는 문구는 빠지지 않음 · 초안에 status 없음 */

import fs from 'fs';
import vm from 'vm';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const H = require('./harness');
const { report } = H;
/* 이 파일은 (값, 기대, 설명) 순서로 쓴다 — harness 는 (설명, …) */
const eq = (actual, expected, label) => H.eq(label, actual, expected);
const ok = (cond, label) => H.ok(label, cond);

/* store.js 를 브라우저 없이 싣는다 — localStorage 만 가짜 */
const mem = {};
const ctx = { window: {}, localStorage: { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } }, console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../src/assets/store.js', import.meta.url), 'utf8') + '\nthis.Store = Store;', ctx);
const Store = ctx.Store;

const list = [
  { id: 'a', category: '프레스', hazards: ['pinch'] },
  { id: 'b', category: '프레스', hazards: ['shock'] },
  { id: 'c', category: '프레스' },                     // 태그 없음 — 옛 문구
  { id: 'd', category: '공통', hazards: [] },
  { id: 'e', category: '도장', hazards: ['pinch'] },  // 다른 종류
];
const ids = (xs) => xs.map((p) => p.id).join(',');
eq(ids(Store.phrasesFor('press', list)), 'a,b,c,d', '위험을 안 주면 지금과 같다 (종류 + 공통)');
eq(ids(Store.phrasesFor('press', list, ['pinch'])), 'a,c,d', '끼임 설비 — 감전 문구는 빠지고 태그 없는 문구는 남는다');
eq(ids(Store.phrasesFor('press', list, ['pinch', 'shock'])), 'a,b,c,d', '위험 둘이면 둘 다');
ok(!Store.phrasesFor('press', list, ['pinch']).some((p) => p.id === 'e'), '다른 종류 문구는 위험이 같아도 안 섞인다');

const T = await import('../api/translate.mjs');
const req = T.readDraft({ kind: '프레스', hazards: [{ code: 'pinch', label: '끼임' }], existing: ['이미 있는 문장'] });
ok(!!req, '초안 요청을 읽는다');
eq(T.readDraft({ kind: '프레스', hazards: [{ code: 'BAD!', label: 'x' }] }), null, '이상한 위험 코드는 거절');
eq(T.readDraft({ kind: '', hazards: [{ code: 'pinch', label: '끼임' }] }), null, '종류가 없으면 거절');
const out = T.cleanDraft('```json\n' + JSON.stringify({ phrases: [
  { ko: '금형 사이에 손을 넣지 마십시오', hazard: 'pinch', status: 'reviewed' },
  { ko: '이미 있는 문장', hazard: 'pinch' },
  { ko: '전원을 끄십시오', hazard: 'shock' },
  { ko: '양손 버튼을 쓰십시오', hazard: 'pinch' },
  { ko: '세 번째 끼임 문장', hazard: 'pinch' },
] }) + '\n```', req);
eq(out.length, T.DRAFT.perHazard, '위험당 개수 상한 · 중복 · 모르는 위험 코드를 거른다');
ok(out.every((p) => !('status' in p)), '★ 초안에 status 가 없다 — 저장은 언제나 waiting');
eq(T.cleanDraft('말만 하고 JSON 없음', req).length, 0, 'JSON 이 아니면 빈 목록');

/* seed — 문구마다 위험 태그 배열이 있다 (빈 배열 = 위험 무관) */
const seed = fs.readFileSync(new URL('../src/assets/seed.js', import.meta.url), 'utf8');
eq((seed.match(/\{ id: 'ph-\d+', category: '[^']+', status: '\w+', hazards: \[/g) || []).length, 15, 'seed 문구 15개 모두 hazards 태그');

report('문구 위험유형 태그 — 위험별 매칭 · AI 초안은 waiting');
