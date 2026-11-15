/* AI 하루 한도 (A02 §5.6 3층, 2026-11-15) — DB 한 줄에서 함께 센다.
   ★ 실제 DB를 부르지 않는다 — `ai_usage` 를 흉내 내는 가짜 sql 을 끼운다.
   지키는 것: 상한에서 멈춤 · 더하기와 검사가 한 문장 · DB가 실패하면 막는다 · DB가 없으면 메모리 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, eq, report } = require('./harness');

const db = await import('../api/_db.mjs');
const shared = await import('../api/_shared.mjs');

let used = 0;
const seen = [];
function sql(strings, ...vals) {
  const q = strings.join(' ? ').replace(/\s+/g, ' ').trim().toLowerCase();
  seen.push(q);
  if (q.startsWith('insert into ai_usage')) {
    const limit = vals[0];
    if (used === 0) { used = 1; return Promise.resolve([{ used }]); }
    if (used < limit) { used += 1; return Promise.resolve([{ used }]); }
    return Promise.resolve([]);
  }
  throw new Error('가짜 DB가 모르는 질의: ' + q);
}

const realLog = console.log;
const logs = [];

{
  db.setSqlForTest(sql);
  shared.resetDailyCall({ db: true });
  const got = [];
  for (let i = 0; i < 4; i++) got.push(await shared.takeDailyCall(3));
  eq('DB로 세서 상한 3에서 멈춘다', got.join(','), 'true,true,true,false');
  ok('더하기와 상한 검사를 한 문장으로 한다 (동시에 와도 넘지 않게)',
    seen.every((q) => q.includes('on conflict (day) do update') && q.includes('where ai_usage.used < ?')));
}

{
  db.setSqlForTest(() => Promise.reject(new Error('connection refused')));
  shared.resetDailyCall({ db: true });
  console.log = (s) => logs.push(String(s));
  const r = await shared.takeDailyCall(600);
  console.log = realLog;
  eq('★ DB 질의가 실패하면 막는다 (돈 나가는 쪽으로 열지 않는다)', r, false);
  ok('실패는 로그에 남긴다', logs.some((l) => l.includes('daily-limit') && l.includes('"err":"db"')));
}

{
  db.setSqlForTest(null);
  const keep = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  delete process.env.SAFETY_DATABASE_URL;
  shared.resetDailyCall({ db: true });
  const got = [await shared.takeDailyCall(1), await shared.takeDailyCall(1)];
  eq('DB가 없으면 메모리로 센다', got.join(','), 'true,false');
  if (keep !== undefined) process.env.DATABASE_URL = keep;
}

{
  let touched = false;
  db.setSqlForTest(() => { touched = true; return Promise.resolve([]); });
  shared.resetDailyCall();
  const r = await shared.takeDailyCall(5);
  ok('검사용 resetDailyCall() 뒤에는 가짜 sql 을 건드리지 않는다', r === true && !touched);
  db.setSqlForTest(null);
}

report('AI 하루 한도 (DB)');
