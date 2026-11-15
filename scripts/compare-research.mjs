/* 사람 조사(정답 기준, research/gold/*.json) ↔ AI 리서치 결과(research/runs/*.json) 비교.

   PRD-AD-08 §1 지표 「놓친 위험」 — 사람이 꼽은 위험 중 AI 목록에 없는 것.

   짝짓기: 정답 항목의 keywords 중 하나라도 AI 항목의 「부위 + 설명」에 들어 있으면 같은 위험으로 본다.
   ponytail: 낱말 짝짓기라 같은 뜻 다른 말(예: 「덮개」↔「가드」)은 keywords 에 둘 다 적어야 잡힌다.
             더 정확히 하려면 사람이 짝을 확정하는 칸을 둔다 (담당자 검토 화면이 그 일을 한다).

   쓰는 법
     node scripts/compare-research.mjs research/gold/c-press.json research/runs/2026-11-09_c-press.json
   아무것도 부르지 않는다 (네트워크 0). 결과는 화면에만 — 문서로 옮기는 것은 사람이 한다. */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function hostsOf(list) {
  const s = new Set();
  (list || []).forEach((x) => (x.sources || []).forEach((src) => { if (src.host) s.add(String(src.host).replace(/^www\./, '')); }));
  return s;
}

export function compare(gold, ai) {
  const aiItems = (ai && ai.items) || [];
  const text = (it) => String(it.part || '') + ' ' + String(it.risk || '');
  const matched = [];
  const missed = [];
  const usedAi = new Set();

  gold.items.forEach((g) => {
    const hits = aiItems.filter((a) => g.keywords.some((k) => text(a).indexOf(k) !== -1));
    if (hits.length) { matched.push({ gold: g, ai: hits }); hits.forEach((h) => usedAi.add(h.id)); }
    else missed.push(g);
  });

  const extra = aiItems.filter((a) => !usedAi.has(a.id));
  const gHosts = hostsOf(gold.items);
  const aHosts = hostsOf(aiItems);
  const shared = [...gHosts].filter((h) => aHosts.has(h));

  return {
    recall: gold.items.length ? matched.length / gold.items.length : 0,
    matched, missed, extra,
    sources: { gold: [...gHosts], ai: [...aHosts], shared },
    aiChecks: aiItems.filter((a) => a.status !== 'ok').length,
  };
}

function main() {
  const [goldPath, runPath] = process.argv.slice(2);
  if (!goldPath || !runPath) {
    console.error('node scripts/compare-research.mjs <research/gold/…json> <research/runs/…json>');
    process.exit(1);
  }
  const gold = JSON.parse(fs.readFileSync(goldPath, 'utf8'));
  const run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
  const r = compare(gold, run.research);
  const pct = Math.round(r.recall * 100);

  console.log('── ' + gold.equipment.name + ' · AI ' + (run.provider || '') + ' ' + (run.model || ''));
  console.log('  사람이 꼽은 위험 ' + gold.items.length + '개 중 AI 가 찾은 것 ' + r.matched.length + '개 (재현율 ' + pct + '%)');
  r.matched.forEach((m) => console.log('  ✓ ' + m.gold.part + '  ←  ' + m.ai.map((a) => a.part + (a.status === 'ok' ? '' : '(확인 필요)')).join(', ')));
  r.missed.forEach((g) => console.log('  ✗ 놓침: ' + g.part + ' — ' + g.risk));
  console.log('  AI 에만 있는 항목 ' + r.extra.length + '개' + (r.extra.length ? ': ' + r.extra.map((a) => a.part).join(', ') : ''));
  console.log('  AI 「확인 필요」 ' + r.aiChecks + '개 / 전체 ' + ((run.research && run.research.items) || []).length + '개');
  console.log('  출처 사이트 — 사람 ' + r.sources.gold.join(', ') + ' / AI ' + (r.sources.ai.join(', ') || '없음') + ' / 겹침 ' + (r.sources.shared.join(', ') || '없음'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
