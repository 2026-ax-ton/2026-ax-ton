/* scripts/backup.mjs — 사업장별 백업 (T14 · TK-3-05).

   ★ 실제 DB를 부르지 않는다. **가짜 `sql`** 을 끼운다 (A02 §14.8, seed-demo.mjs 와 같은 방식).

   이 묶음이 지키는 것
     1. ★ 계정 보안 값(해시·salt·실패 횟수·잠금)을 꺼내지 않는다 — 백업은 복구용이지
        계정 보안 값까지 가져갈 이유가 없다 (A02 §14.6)
     2. 신고는 꺼내도 그대로 익명이다 (계정 값이 없다)
     3. 드라이버는 실제로 쓸 때만 불러온다 (검사는 npm install 없이 돈다)
     4. 백업 출력 폴더(`backups/`)는 저장소에 올라가지 않는다

   근거: A02 §14.6·§14.8 · A04 1-5 · D05 TK-3-05 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { ok, eq, has, report, ROOT } = require('./harness');

const backup = await import('../scripts/backup.mjs');

const backupSrc = fs.readFileSync(path.join(ROOT, 'scripts/backup.mjs'), 'utf8');
const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');

/* ── 가짜 DB ───────────────────────────────────────────────────────── */

function makeSql() {
  return function sql(strings, ...vals) {
    const q = strings.join(' ? ').replace(/\s+/g, ' ').trim().toLowerCase();

    if (q.startsWith('select user_id, role, name, title, lang, process_id, created_at')) {
      return Promise.resolve([{
        user_id: 'W-4821-07', role: 'worker', name: '', title: '',
        lang: 'km', process_id: 'p-press', created_at: '2026-01-01T00:00:00.000Z',
        /* ★ 실제로는 select 에 안 나오지만, 가짜 sql 이 실수로 더 줘도
           collect() 가 직접 걸러낸다는 것까지 함께 본다 */
        pw_hash: 'ff'.repeat(64), pw_salt: 'aa'.repeat(16),
        failed_count: 3, locked_until: '2099-01-01T00:00:00.000Z',
      }]);
    }
    if (q.startsWith('select key, data, version, updated_at from docs')) {
      return Promise.resolve([
        { key: 'setup', data: { site: { name: '대성정밀' } }, version: 3, updated_at: '2026-01-02T00:00:00.000Z' },
      ]);
    }
    if (q.startsWith('select id, data, created_at from reports')) {
      return Promise.resolve([
        { id: 'r1', data: { hazard: 'cut', status: 'received' }, created_at: '2026-01-03T00:00:00.000Z' },
      ]);
    }
    throw new Error('가짜 DB가 모르는 질의: ' + q);
  };
}

/* ===================================================================
   1. 계정 보안 값을 꺼내지 않는다
   =================================================================== */
{
  const sql = makeSql();
  const data = await backup.collect(sql, { id: 'wp-1', name: '대성정밀', size_band: '50-99' });

  eq('계정 1명', data.accounts.length, 1);
  const acc = data.accounts[0];
  ok('★★ 해시·salt·잠금 값이 없다',
    !('pw_hash' in acc) && !('pw_salt' in acc) && !('failed_count' in acc) && !('locked_until' in acc),
    JSON.stringify(acc));
  eq('복구에 필요한 값은 남는다', acc.userId, 'W-4821-07');
  eq('역할도 남는다', acc.role, 'worker');
}

/* ===================================================================
   2. 모양 — 사업장 · docs(키별) · 신고 · 찍은 시각
   =================================================================== */
{
  const sql = makeSql();
  const data = await backup.collect(sql, { id: 'wp-1', name: '대성정밀', size_band: '50-99' });

  eq('사업장 이름', data.workplace.name, '대성정밀');
  eq('docs 는 키로 접근한다', data.docs.setup.site.name, '대성정밀');
  eq('신고 1건', data.reports.length, 1);
  ok('★ 신고에도 계정 값이 없다', !('workerId' in data.reports[0]) && !('author' in data.reports[0]));
  ok('찍은 시각이 있다', typeof data.exportedAt === 'string' && data.exportedAt.length > 0);
}

/* ===================================================================
   3. 드라이버 · 저장소 규칙
   =================================================================== */
{
  ok('★ 드라이버는 실제로 쓸 때만 불러온다 (검사는 npm install 없이 돈다)',
    !/^import .*@neondatabase/m.test(backupSrc)
    && /await import\('@neondatabase\/serverless'\)/.test(backupSrc));

  has('★ 백업 출력 폴더는 저장소에 올리지 않는다', gitignore, 'backups/');

  ok('--yes 없이는 쓰지 않는다고 적혀 있다', /--yes/.test(backupSrc));
  has('비밀번호 해시를 꺼내지 않는다고 주석에 적혀 있다', backupSrc, '비밀번호 해시');
}

report('scripts/backup.mjs — 사업장별 백업 (T14)');
