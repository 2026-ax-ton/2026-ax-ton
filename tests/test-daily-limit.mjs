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

/* ── 🆕 2026-11-16 쓰임새(bucket)별 하루 통도 DB 에서 센다 (ai_usage_bucket) ── */
{
  const counts = {};
  const qs = [];
  db.setSqlForTest((strings, ...vals) => {
    const q = strings.join(' ? ').replace(/\s+/g, ' ').trim().toLowerCase();
    qs.push(q);
    if (!q.startsWith('insert into ai_usage_bucket')) throw new Error('가짜 DB가 모르는 질의: ' + q);
    const [bucket, limit] = vals;
    const n = counts[bucket] || 0;
    if (n >= limit) return Promise.resolve([]);
    counts[bucket] = n + 1;
    return Promise.resolve([{ used: n + 1 }]);
  });
  shared.resetDailyCall({ db: true });
  const got = [];
  for (let i = 0; i < 3; i++) got.push(await shared.takeDailyCallFor('photo', 2));
  eq('★ 사진 통은 DB 로 세서 상한 2에서 멈춘다', got.join(','), 'true,true,false');
  shared.resetDailyCall({ db: true });     // ★ 인스턴스 메모리를 비워도(서버가 다시 켜져도) DB 숫자는 그대로다
  eq('★★ 서버가 다시 켜져도 0 으로 돌아가지 않는다', await shared.takeDailyCallFor('photo', 2), false);
  eq('쓰임새가 다르면 다른 통이다', await shared.takeDailyCallFor('other', 2), true);
  ok('더하기와 상한 검사를 한 문장으로 한다 (날짜 + 쓰임새 한 줄)',
    qs.every((q) => q.includes('on conflict (day, bucket) do update') && q.includes('where ai_usage_bucket.used < ?')));
}

{
  db.setSqlForTest(() => Promise.reject(new Error('connection refused')));
  shared.resetDailyCall({ db: true });
  console.log = (s) => logs.push(String(s));
  const r = await shared.takeDailyCallFor('photo', 60);
  console.log = realLog;
  eq('★ 쓰임새 통도 DB 질의가 실패하면 막는다', r, false);
}

{
  const err = Object.assign(new Error('relation "ai_usage_bucket" does not exist'), { code: '42P01' });
  db.setSqlForTest(() => Promise.reject(err));
  shared.resetDailyCall({ db: true });
  logs.length = 0;
  console.log = (s) => logs.push(String(s));
  const got = [await shared.takeDailyCallFor('photo', 1), await shared.takeDailyCallFor('photo', 1)];
  console.log = realLog;
  eq('★ 표가 아직 없으면(운영 DB 에 적용 전) 예전처럼 메모리로 센다 — 사진 분석이 통째로 막히지 않는다', got.join(','), 'true,false');
  ok('표가 없다는 것은 로그에 남긴다', logs.some((l) => l.includes('"err":"no-table"')));
  db.setSqlForTest(null);
}

report('AI 하루 한도 (DB)');
