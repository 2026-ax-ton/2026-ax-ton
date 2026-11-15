/* 사람 조사 ↔ AI 조사 비교 (scripts/compare-research.mjs) + 정답 기준 파일 모양.

   이 묶음이 지키는 것
     1. 정답 기준 파일 2개가 읽히고, 항목마다 keywords·출처·확인 수준이 있다
     2. ★ 짝짓기 — 낱말이 들어 있으면 찾음, 없으면 놓침, 남는 AI 항목은 extra
     3. 재현율 계산 · 출처 겹침 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, eq, report, ROOT } = require('./harness');
const { compare } = await import('../scripts/compare-research.mjs');

const CHECKED = ['원문', '본문만', '막힘'];
['c-press', 'injection-molder'].forEach((name) => {
  const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'research/gold', name + '.json'), 'utf8'));
  ok(name + ': 기계 이름이 있다', !!(g.equipment && g.equipment.name));
  ok(name + ': 항목이 있다', g.items.length >= 5, g.items.length);
  ok(name + ': ★ 항목마다 keywords·출처·확인 수준', g.items.every((it) => it.keywords.length && it.sources.length
    && it.sources.every((s) => s.host && CHECKED.indexOf(s.checked) !== -1)));
  ok(name + ': 막힌 지점을 적었다 (조사 규칙 「못 받은 건 못 받았다고」)', Array.isArray(g.limits) && g.limits.length > 0);
});

const gold = {
  items: [
    { id: 'g1', part: '가드 측방', risk: '손 끼임', keywords: ['가드', '덮개'], sources: [{ host: 'moel.go.kr' }] },
    { id: 'g2', part: '유압호스', risk: '누유', keywords: ['호스', '배관'], sources: [{ host: 'kmecnews.co.kr' }] },
    { id: 'g3', part: '편심하중', risk: '프레임 벌어짐', keywords: ['편심'], sources: [{ host: 'adhmt.com' }] },
  ],
};
const ai = { items: [
  { id: 'r1', part: '덮개 옆', risk: '손이 끼인다', status: 'ok', sources: [{ host: 'www.moel.go.kr' }] },
  { id: 'r2', part: '배관', risk: '기름 분출', status: 'check', sources: [{ host: 'kosha.or.kr' }] },
  { id: 'r3', part: '페달', risk: '오조작', status: 'ok', sources: [] },
] };
const r = compare(gold, ai);
eq('★ 3개 중 2개를 찾았다', r.matched.length, 2);
eq('재현율', Math.round(r.recall * 100), 67);
eq('★ 놓친 것은 편심하중', r.missed.map((g) => g.id).join(), 'g3');
eq('★ AI 에만 있는 항목', r.extra.map((a) => a.id).join(), 'r3');
eq('확인 필요 수', r.aiChecks, 1);
eq('★ 출처 겹침 (www 떼고)', r.sources.shared.join(), 'moel.go.kr');
eq('AI 결과가 비어도 터지지 않는다', compare(gold, null).missed.length, 3);

report('사람 조사 ↔ AI 조사 비교 (정답 기준)');
