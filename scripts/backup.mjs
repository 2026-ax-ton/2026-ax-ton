/* 사업장별 백업 — DB에 있는 것을 JSON 으로 꺼내 개인 PC 에 둔다 (T14 · TK-3-05).

   쓰는 법 (저장소 루트에서)

       node scripts/backup.mjs              무엇을 꺼낼지만 찍는다 (파일을 쓰지 않는다)
       node scripts/backup.mjs --yes        실제로 backups/<날짜>/ 에 파일을 쓴다

   연결 문자열은 **대화나 명령줄에 남기지 않는다.** 저장소 루트 `.env.local` 에 적는다
   (`scripts/seed-demo.mjs` 와 같은 방식):

       DATABASE_URL=postgresql://…  ← Neon **운영 브랜치**의 것 (운영 데이터를 백업한다)

   ★ 저장소에 올리지 않는다. `backups/` 는 `.gitignore` 가 막는다 — 개인정보가 섞인
     사업장 데이터를 커밋하면 공개 저장소에 그대로 남는다.
   ★ 비밀번호 해시·salt, 세션 토큰 지문은 꺼내지 않는다. 백업은 **복구용 데이터**지
     계정 보안 값까지 가져갈 이유가 없다 (A02 §14.6).
   ★ 신고(`reports`)는 원래부터 계정 값이 없다 — 꺼내도 그대로 익명이다.
   ★ Neon 스냅샷(DB 통째로, 포인트인타임 복구용)은 이 스크립트가 아니라
     Neon 콘솔에서 사람이 한다 (A04 1-5). 이 스크립트는 **사업장이 읽을 수 있는
     JSON 한 벌**을 더 만드는 것이다 — 둘은 서로를 대신하지 않는다.
   ★ 질의는 매개변수 방식만 쓴다 (A02 §14.3). 문자열을 이어 붙이지 않는다.

   근거: A02 §14.8 · A04 1-5 · D05 TK-3-05 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/* ★ 드라이버는 실제로 쓸 때만 불러온다 (main 안에서 동적 import, seed-demo.mjs 와 같다) */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── .env.local 읽기 (seed-demo.mjs 와 같은 방식, 의존성 0) ─────────── */

function readEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return {};
  const out = {};
  fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) return;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  });
  return out;
}

/* 파일 이름에 쓸 수 없는 글자를 치운다. 사업장 이름이 그대로 파일명이 된다 */
function slug(name) {
  return String(name || 'workplace')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'workplace';
}

/* ── 한 사업장을 꺼낸다 ────────────────────────────────────────────── */

/** 계정에서 복구에 필요한 것만 남긴다. 해시·salt·실패 횟수는 꺼내지 않는다
    (A02 §14.6 — 백업은 복구용이지 계정 보안 값까지 가져갈 이유가 없다). */
function publicAccount(row) {
  return {
    userId: row.user_id, role: row.role, name: row.name, title: row.title,
    lang: row.lang, processId: row.process_id, createdAt: row.created_at,
  };
}

export async function collect(sql, workplace) {
  const [accounts, docs, reports] = await Promise.all([
    sql`select user_id, role, name, title, lang, process_id, created_at
          from accounts where workplace_id = ${workplace.id}`,
    sql`select key, data, version, updated_at from docs where workplace_id = ${workplace.id}`,
    sql`select id, data, created_at from reports where workplace_id = ${workplace.id}`,
  ]);

  const out = {
    workplace: { id: workplace.id, name: workplace.name, sizeBand: workplace.size_band },
    accounts: accounts.map(publicAccount),
    docs: {},
    reports: reports.map((r) => ({ ...r.data, createdAt: r.created_at })),
    exportedAt: new Date().toISOString(),
  };
  docs.forEach((d) => { out.docs[d.key] = d.data; });
  return out;
}

/* ── 실행 ──────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);
  const apply = args.indexOf('--yes') !== -1;
  const env = { ...readEnvLocal(), ...process.env };

  /* 서버(`api/_db.mjs`)와 같은 순서로 본다 — 미리보기에서 백업을 돌리면
     SAFETY_DATABASE_URL 이 그 브랜치의 DB 를 가리킨다 */
  const url = env.SAFETY_DATABASE_URL || env.DATABASE_URL;
  if (!url) {
    console.error('연결 문자열이 없습니다. 저장소 루트 .env.local 에 DATABASE_URL= 을 적어 주세요.');
    console.error('(값은 대화·명령줄에 남기지 않습니다.)');
    process.exit(1);
  }

  let host = '(읽을 수 없음)';
  try { host = new URL(url).host; } catch (e) { /* 모양이 달라도 연결은 드라이버가 판단한다 */ }

  let neon;
  try {
    ({ neon } = await import('@neondatabase/serverless'));
  } catch (e) {
    console.error('드라이버가 없습니다. 저장소 루트에서 `npm install` 을 한 번 하세요.');
    process.exit(1);
  }
  const sql = neon(url);

  const workplaces = await sql`select id, name, size_band from workplaces order by name`;

  console.log('');
  console.log('  꺼낼 곳 :', host);
  console.log('  사업장  :', workplaces.length + '개');
  console.log('');

  if (!workplaces.length) {
    console.log('  꺼낼 사업장이 없습니다.');
    return;
  }

  if (!apply) {
    workplaces.forEach((w) => console.log('  - ' + (w.name || '(이름 없음)') + ' (' + w.id + ')'));
    console.log('');
    console.log('  보기만 했습니다. 실제로 파일을 쓰려면 --yes 를 붙이세요.');
    console.log('');
    return;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const dir = path.join(ROOT, 'backups', stamp);
  fs.mkdirSync(dir, { recursive: true });

  for (const w of workplaces) {
    const data = await collect(sql, w);
    const file = path.join(dir, slug(w.name) + '.json');
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log('  ✓ ' + (w.name || '(이름 없음)') + ' → ' + path.relative(ROOT, file));
  }

  console.log('');
  console.log('  ' + workplaces.length + '개 사업장을 ' + path.relative(ROOT, dir) + ' 에 저장했습니다.');
  console.log('  이 폴더는 저장소에 올라가지 않습니다 (.gitignore). 개인 PC 에만 보관하세요.');
  console.log('  Neon 스냅샷(DB 전체 복구용)은 Neon 콘솔에서 따로 뜹니다 (A04 1-5).');
  console.log('');
}

/* 다른 곳에서 불러 쓸 때(검사)는 실행하지 않는다 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(function (e) { console.error(e.message); process.exit(1); });
}
