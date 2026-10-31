/* 시연 데이터를 DB에 넣는다 — 미리보기(Preview) Neon 브랜치 전용.

   쓰는 법 (저장소 루트에서)

       node scripts/seed-demo.mjs              무엇을 할지만 찍는다 (아무것도 안 바꾼다)
       node scripts/seed-demo.mjs --yes        실제로 넣는다
       node scripts/seed-demo.mjs --yes --no-migrate    테이블 생성은 건너뛴다

   연결 문자열은 **대화나 명령줄에 남기지 않는다.** 저장소 루트 `.env.local` 에 적는다
   (`.gitignore` 가 `.env.*` 를 막는다):

       DATABASE_URL=postgresql://…  ← Neon **미리보기 브랜치**의 것

   ★ 운영 DB에는 돌리지 않는다. VERCEL_ENV=production 이면 멈춘다 (A02 §14.8).
   ★ 시연 데이터의 정답은 `src/assets/seed.js` 하나다 — 여기에 베껴 적지 않고
     그 파일을 그대로 불러 쓴다. 두 곳에 있으면 언젠가 어긋난다.
   ★ 질의는 매개변수 방식만 쓴다 (A02 §14.3). 문자열을 이어 붙이지 않는다.

   근거: A02 §14.2·§14.8 · C06 D-023 · D05 TK-3-01 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

/* ★ 드라이버는 실제로 넣을 때만 불러온다 (main 안에서 동적 import).
     맨 위에서 불러오면 `npm install` 을 안 한 사람은 `tests/test-db.mjs` 조차
     못 돌린다 — "확인이 빠르다" 가 이 프로젝트의 중요한 성질이다 (C05 T-5′). */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── 결정에 걸린 값 (A02 §14.2·§14.6) ──────────────────────────────── */

const DEMO_JOIN_CODE = 'DEMO-4821';   // 시연 사업장 가입 코드 (workplaces.join_code)
const SCRYPT_KEYLEN = 64;             // 비밀번호 해시 길이 (바이트)
const SCRYPT_SALT_BYTES = 16;         // 계정별 salt 길이 (바이트)

/* ★ T11(api/auth)에서 로그인을 만들 때 **이 형식을 그대로** 쓴다.
     여기와 로그인이 다른 방식으로 해시하면 시연 계정으로 로그인이 안 된다.
     `tests/test-db.mjs` 가 이 세 값을 고정해 둔다. */
export function hashPassword(pw) {
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES).toString('hex');
  const hash = crypto.scryptSync(pw, salt, SCRYPT_KEYLEN).toString('hex');
  return { hash, salt };
}

/* ── .env.local 읽기 (의존성 0 — measure-ai.mjs 와 같은 방식) ──────── */

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

/* ── 시연 데이터 읽기 — src/assets/seed.js 를 그대로 돌린다 ────────── */

/** seed.js 의 fill() 이 Store 에 저장하려는 값을 가로채 그대로 돌려준다. */
export function loadSeed(root) {
  const code = fs.readFileSync(path.join(root || ROOT, 'src/assets/seed.js'), 'utf8');
  const captured = {};
  const Store = {};
  ['accounts', 'setup', 'library', 'courses', 'progress', 'reports', 'posts', 'orders', 'prefs']
    .forEach(function (k) {
      Store[k] = {
        save: function (v) { captured[k] = v; },
        load: function () { return captured[k] === undefined ? [] : captured[k]; },
      };
    });
  const Seed = new Function('Store', code + '\n;return Seed;')(Store);
  Seed.fill();
  return captured;
}

/* ── 마이그레이션 ──────────────────────────────────────────────────── */

/** 001_init.sql 을 문장 단위로 나눈다. HTTP 드라이버는 한 번에 한 문장만 받는다.
    이 파일은 우리가 쓴 고정 파일이고 바깥 값이 들어오지 않는다. */
export function splitStatements(sqlText) {
  return sqlText
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ── 넣기 ──────────────────────────────────────────────────────────── */

async function seed(sql, data, log) {
  /* 1. 사업장 — 가입 코드가 같으면 이름만 맞춘다 (매번 새로 만들지 않는다) */
  const site = data.setup.site || {};
  const wp = await sql`
    insert into workplaces (name, size_band, join_code)
    values (${site.name || '시연 사업장'}, ${site.sizeBand || null}, ${DEMO_JOIN_CODE})
    on conflict (join_code) do update set name = excluded.name, size_band = excluded.size_band
    returning id`;
  const workplaceId = wp[0].id;
  log('사업장 ' + site.name + ' (' + DEMO_JOIN_CODE + ') → ' + workplaceId);

  /* 2. 계정 — 비밀번호는 해시만 들어간다. 운영자는 사업장이 없다 (null) */
  for (const a of data.accounts) {
    const pw = hashPassword(a.pw);
    await sql`
      insert into accounts (workplace_id, user_id, role, name, title, lang, process_id, pw_hash, pw_salt)
      values (${a.role === 'operator' ? null : workplaceId}, ${a.userId}, ${a.role},
              ${a.name || null}, ${a.title || null}, ${a.lang || null}, ${a.processId || null},
              ${pw.hash}, ${pw.salt})
      on conflict (user_id) do update set
        workplace_id = excluded.workplace_id, role = excluded.role, name = excluded.name,
        title = excluded.title, lang = excluded.lang, process_id = excluded.process_id,
        pw_hash = excluded.pw_hash, pw_salt = excluded.pw_salt,
        failed_count = 0, locked_until = null`;
  }
  log('계정 ' + data.accounts.length + '개 (비밀번호는 scrypt 해시만 저장)');

  /* 3. 사업장별 저장 키 5개 (docs) — Store 키와 1:1 (A02 §14.2) */
  for (const key of ['setup', 'courses', 'progress', 'posts', 'orders']) {
    await sql`
      insert into docs (workplace_id, key, data, version, updated_at)
      values (${workplaceId}, ${key}, ${JSON.stringify(data[key])}, 1, now())
      on conflict (workplace_id, key) do update set
        data = excluded.data, version = docs.version + 1, updated_at = now()`;
  }
  log('저장 키 5개 (setup · courses · progress · posts · orders)');

  /* 4. 안전 문구 라이브러리 — 전 사업장 공용 */
  for (const phrase of data.library) {
    await sql`
      insert into library (id, data, version, updated_at)
      values (${phrase.id}, ${JSON.stringify(phrase)}, 1, now())
      on conflict (id) do update set
        data = excluded.data, version = library.version + 1, updated_at = now()`;
  }
  log('문구 ' + data.library.length + '개');

  /* 5. 익명 신고 — 계정 값을 넣지 않는다. 이미 있으면 다시 쌓지 않는다 */
  const existing = await sql`select count(*)::int as n from reports where workplace_id = ${workplaceId}`;
  if (existing[0].n > 0) {
    log('신고 ' + existing[0].n + '건이 이미 있다 — 건너뛴다 (중복으로 쌓지 않는다)');
  } else {
    for (const r of data.reports) {
      await sql`insert into reports (workplace_id, data) values (${workplaceId}, ${JSON.stringify(r)})`;
    }
    log('신고 ' + data.reports.length + '건 (익명 — 계정 열이 없다)');
  }

  return workplaceId;
}

/* ── 실행 ──────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);
  const apply = args.indexOf('--yes') !== -1;
  const migrate = args.indexOf('--no-migrate') === -1;
  const env = { ...readEnvLocal(), ...process.env };

  if (env.VERCEL_ENV === 'production') {
    console.error('운영(production) 환경에서는 돌리지 않습니다. 미리보기 브랜치에만 넣습니다.');
    process.exit(1);
  }

  const url = env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL 이 없습니다. 저장소 루트 .env.local 에 Neon **미리보기 브랜치**의');
    console.error('연결 문자열을 DATABASE_URL= 로 적어 주세요 (값은 대화·명령줄에 남기지 않습니다).');
    process.exit(1);
  }

  let host = '(읽을 수 없음)';
  try { host = new URL(url).host; } catch (e) { /* 모양이 달라도 연결은 드라이버가 판단한다 */ }

  const data = loadSeed(ROOT);
  console.log('');
  console.log('  넣을 곳 :', host);
  console.log('  넣을 것 : 사업장 1 · 계정 ' + data.accounts.length + ' · 저장 키 5 · 문구 '
    + data.library.length + ' · 신고 ' + data.reports.length);
  console.log('  테이블  :', migrate ? 'db/migrations/001_init.sql 먼저 적용' : '건너뜀 (--no-migrate)');
  console.log('');

  if (!apply) {
    console.log('  보기만 했습니다. 실제로 넣으려면 --yes 를 붙이세요.');
    console.log('');
    return;
  }

  let neon;
  try {
    ({ neon } = await import('@neondatabase/serverless'));
  } catch (e) {
    console.error('드라이버가 없습니다. 저장소 루트에서 `npm install` 을 한 번 하세요.');
    process.exit(1);
  }
  const sql = neon(url);

  if (migrate) {
    const file = path.join(ROOT, 'db/migrations/001_init.sql');
    const statements = splitStatements(fs.readFileSync(file, 'utf8'));
    for (const stmt of statements) await sql.query(stmt);
    console.log('  ✓ 테이블 — 문장 ' + statements.length + '개 적용 (여러 번 돌려도 같다)');
  }

  const workplaceId = await seed(sql, data, function (m) { console.log('  ✓ ' + m); });

  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name`;
  console.log('');
  console.log('  테이블 ' + tables.length + '개 :', tables.map((t) => t.table_name).join(', '));
  console.log('  시연 사업장 id :', workplaceId);
  console.log('  시연 계정 비밀번호는 전부 1234 입니다 (시연용 — 운영 DB에 쓰지 않습니다).');
  console.log('');
}

/* 다른 곳에서 불러 쓸 때(검사)는 실행하지 않는다 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(function (e) { console.error(e.message); process.exit(1); });
}
