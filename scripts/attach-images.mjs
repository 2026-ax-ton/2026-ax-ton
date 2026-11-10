/* 결과 파일에 항목 참고 사진을 붙인다 — AI 를 다시 부르지 않고 출처 페이지만 연다 (api/_images.mjs).
   node scripts/attach-images.mjs research/runs/a.json research/runs/a_img.json */
import fs from 'fs';
import { attachImages } from '../api/_images.mjs';

const [from, to] = process.argv.slice(2);
if (!from || !to) { console.error('쓰는 법: node scripts/attach-images.mjs <결과 파일> <새 파일>'); process.exit(1); }
const run = JSON.parse(fs.readFileSync(from, 'utf8'));
const t0 = Date.now();
run.research.items.forEach((it) => { delete it.image; });   // 다시 맞출 때 옛 사진을 남기지 않는다
run.research = await attachImages(run.research, { budgetMs: 30000, eqName: (run.equipment && run.equipment.name) || '' });
run.research.items.forEach((it) => console.log((it.image ? '  📷 ' : '  · ') + it.id + ' ' + it.part
  + (it.image ? ' — ' + it.image.host + ' 「' + it.image.alt + '」 ' + Math.round(it.image.data.length * 0.75 / 1024) + 'KB' : '')));
console.log('사진 ' + run.research.images + '/' + run.research.items.length + ' · ' + (Date.now() - t0) + 'ms');
fs.writeFileSync(to, JSON.stringify(run, null, 2));
