/* DB 기반 (T10 · TK-3-01) — 마이그레이션 · 의존성 규칙 · 시연 데이터 넣기.

   ★ 실제 DB를 부르지 않는다. 여기서 보는 것은 **파일에 적힌 약속**이다.
     실물(미리보기 Neon 브랜치에 테이블이 생기고 시연 데이터가 들어간다)은
     `node scripts/seed-demo.mjs --yes` 로 사람이 한 번 확인한다 (STC-E25-015).

   이 묶음이 지키는 것
     1. 테이블 7개와 그 모양이 A02 §14.2 와 같다
     2. **익명·개인정보 경계** — reports 에 계정 열이 없고, accounts 에 외국인등록번호·
        여권번호 열이 없고, 비밀번호 원문·토큰 원문이 저장되지 않는다
     3. **C05 T-5′** — `src/` 는 의존성 0, 서버 `api/` 만 루트 package.json 에 드라이버 1개
     4. 시연 데이터를 베껴 적지 않고 `src/assets/seed.js` 를 그대로 불러 쓴다
     5. 운영 DB를 실수로 건드리지 않는다 (--yes 없으면 보기만, production 이면 멈춤)

   케이스: D07 STC-E25-015 ~ STC-E25-018
   근거:   A02 §14.1·§14.2·§14.6·§14.8 · C06 D-023 · C05 T-5′ · D05 TK-3-01 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { ok, eq, has, report, ROOT } = require('./harness');

const seedMod = await import('../scripts/seed-demo.mjs');

const sqlText = fs.readFileSync(path.join(ROOT, 'db/migrations/001_init.sql'), 'utf8');
const seedSrc = fs.readFileSync(path.join(ROOT, 'scripts/seed-demo.mjs'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** 테이블 하나의 본문(괄호 안)을 꺼낸다. */
function tableBody(name) {
  const m = new RegExp('create table if not exists ' + name + '\\s*\\(([\\s\\S]*?)\\n\\);').exec(sqlText);
  return m ? m[1] : '';
}

/* ───────────────────────────────────────────────────────────────────
   1. 테이블 7개 (A02 §14.2)
   ─────────────────────────────────────────────────────────────────── */

const TABLES = ['workplaces', 'accounts', 'sessions', 'docs', 'library', 'reports', 'audit'];

TABLES.forEach((t) => {
  ok('테이블 ' + t + ' 를 만든다', new RegExp('create table if not exists ' + t + '\\b').test(sqlText));
});

eq('테이블은 정확히 7개다 (A02 §14.2)',
  (sqlText.match(/create table if not exists/g) || []).length, TABLES.length);

ok('여러 번 돌려도 같다 — create table 은 전부 if not exists',
  !/create table (?!if not exists)/.test(sqlText));
ok('인덱스도 if not exists 로 만든다',
  !/create index (?!if not exists)/.test(sqlText));

/* ───────────────────────────────────────────────────────────────────
   2. 익명·개인정보 경계 — 구조로 지킨다
   ─────────────────────────────────────────────────────────────────── */

{
  const reports = tableBody('reports');
  ok('★ 신고 테이블에 계정 열이 없다 (익명은 구조로 지킨다)',
    !/account|user_id|worker|reporter|작성자/i.test(reports), reports.trim());
  ok('신고는 사업장까지만 안다', /workplace_id/.test(reports));
}

{
  const accounts = tableBody('accounts');
  ok('★ 외국인등록번호·여권번호 열이 없다',
    !/passport|resident|alien|foreign|여권|등록번호/i.test(accounts), accounts.trim());
  ok('비밀번호는 해시와 salt 로만 저장한다',
    /pw_hash/.test(accounts) && /pw_salt/.test(accounts));
  ok('비밀번호 원문 열이 없다',
    !/\bpw\s+text|\bpassword\s+text|plain/i.test(accounts));
  ok('역할은 셋뿐이다 (worker · admin · operator)',
    /check \(role in \('worker', 'admin', 'operator'\)\)/.test(accounts));
  ok('5회 실패 잠금을 둘 자리가 있다 (A02 §14.6)',
    /failed_count/.test(accounts) && /locked_until/.test(accounts));
}

{
  const sessions = tableBody('sessions');
  ok('★ 토큰 원문을 저장하지 않는다 (sha256 만)',
    /token_hash\s+text primary key/.test(sessions) && !/\btoken\s+text/.test(sessions));
  ok('만료 시각이 있다 (12시간)', /expires_at\s+timestamptz not null/.test(sessions));
  ok('계정이 지워지면 세션도 지워진다', /on delete cascade/.test(sessions));
}

{
  const audit = tableBody('audit');
  ok('감사 기록은 계정을 남긴다 (신고와 반대로 — 판정·계정·내보내기용)',
    /account_id/.test(audit));
  has('★ 신고는 감사에 남기지 않는다고 적어 뒀다', sqlText, '신고는 기록하지 않는다');
}

/* ───────────────────────────────────────────────────────────────────
   3. 저장 키 — Store 키와 1:1 (A02 §14.2)
   ─────────────────────────────────────────────────────────────────── */

{
  const docs = tableBody('docs');
  const m = /check \(key in \(([^)]*)\)\)/.exec(docs);
  const keys = m ? m[1].split(',').map((s) => s.trim().replace(/'/g, '')) : [];
  eq('사업장별 저장 키는 5개다', keys.join(','), 'setup,courses,progress,posts,orders');

  /* prefs 는 기기 설정이라 서버에 올리지 않는다. library 는 공용이라 따로 둔다.
     accounts·session 은 서버 테이블이 대신한다. reports 도 따로 둔다 (익명). */
  ['prefs', 'accounts', 'session', 'library', 'reports'].forEach((k) => {
    ok('저장 키에 ' + k + ' 를 넣지 않는다', keys.indexOf(k) === -1);
  });

  ok('409 판정 기준인 version 이 있다', /version\s+int not null default 1/.test(docs));
  ok('사업장 + 키가 기본키다', /primary key \(workplace_id, key\)/.test(docs));
}

/* ───────────────────────────────────────────────────────────────────
   4. C05 T-5′ — src/ 는 의존성 0, 서버만 드라이버 1개
   ─────────────────────────────────────────────────────────────────── */

{
  const deps = Object.keys(pkg.dependencies || {});
  eq('★ 서버 의존성은 1개뿐이다', deps.length, 1);
  eq('그 1개는 Neon 드라이버다', deps[0], '@neondatabase/serverless');
  eq('개발용 의존성은 두지 않는다 (jsdom 은 저장소 밖)',
    Object.keys(pkg.devDependencies || {}).length, 0);

  /* ★ 함정 — 루트에 "type": "module" 을 넣으면 tests/*.js(CommonJS)가 전부 깨진다.
     서버 함수는 .mjs 확장자로 이미 구분돼 있어서 필요가 없다. */
  ok('★ 루트 package.json 에 "type": "module" 이 없다 (있으면 tests/*.js 가 다 깨진다)',
    pkg.type === undefined || pkg.type === 'commonjs', String(pkg.type));

  ok('버전을 고정한다 (^ ~ 없이)',
    /^\d+\.\d+\.\d+$/.test(pkg.dependencies['@neondatabase/serverless']),
    pkg.dependencies['@neondatabase/serverless']);

  ok('package-lock.json 이 저장소에 있다 (CI·Vercel 이 같은 판을 깐다)',
    fs.existsSync(path.join(ROOT, 'package-lock.json')));

  /* ★ 드라이버를 맨 위에서 불러오면 npm install 을 안 한 사람은 이 검사조차
     못 돌린다. 실제로 넣을 때만(main 안에서) 불러온다. */
  ok('★ 드라이버는 실제로 넣을 때만 불러온다 (검사는 npm install 없이 돈다)',
    !/^import .*@neondatabase/m.test(seedSrc)
    && /await import\('@neondatabase\/serverless'\)/.test(seedSrc));

  ok('★ src/ 아래에는 package.json 이 없다 (브라우저는 의존성 0)',
    !fs.existsSync(path.join(ROOT, 'src/package.json')));
  ok('★ src/ 아래에는 node_modules 가 없다',
    !fs.existsSync(path.join(ROOT, 'src/node_modules')));

  /* 드라이버를 쓰는 곳은 서버와 도구뿐이다 — 브라우저 코드는 부르지 않는다 */
  const srcFiles = (function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  })(path.join(ROOT, 'src'));
  const offenders = srcFiles.filter((f) => /\.(js|html)$/.test(f))
    /* Auth.require('worker') 같은 우리 함수는 제외하고 bare require 만 본다 */
    .filter((f) => /@neondatabase|(^|[^.\w])require\(['"][^.\/]/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(ROOT, f));
  eq('★ src/ 의 어떤 파일도 npm 패키지를 부르지 않는다', offenders.join(', '), '');
}

/* 규칙 문구가 문서에도 그대로 적혀 있다 (코드와 문서가 어긋나지 않게) */
{
  const claude = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  has('CLAUDE.md 코드 규칙에 T-5′ 가 적혀 있다', claude,
    '`src/` 는 의존성 0, 서버 `api/` 만 드라이버 1개');
  const c05 = fs.readFileSync(
    path.join(ROOT, 'docs/documentations/00_개발컨벤션/C05_개발규칙.md'), 'utf8');
  has('C05 에 T-1′ 가 있다', c05, 'T-1′');
  has('C05 에 T-5′ 가 있다', c05, 'T-5′');
}

/* ───────────────────────────────────────────────────────────────────
   5. 시연 데이터 — seed.js 하나가 정답이다
   ─────────────────────────────────────────────────────────────────── */

{
  const data = seedMod.loadSeed(ROOT);

  has('★ 시연 데이터를 베껴 적지 않고 src/assets/seed.js 를 불러 쓴다',
    seedSrc, "'src/assets/seed.js'");

  eq('계정 6개를 읽었다', data.accounts.length, 6);
  eq('문구 6개를 읽었다', data.library.length, 6);
  eq('교육 2개를 읽었다', data.courses.length, 2);
  eq('신고 2건을 읽었다', data.reports.length, 2);
  eq('사업장 이름을 읽었다', data.setup.site.name, '대성정밀');
  ['setup', 'courses', 'progress', 'posts', 'orders'].forEach((k) => {
    ok('저장 키 ' + k + ' 를 읽었다', data[k] !== undefined);
  });
  ok('기기 설정(prefs)은 가져오지 않는다 — 서버에 올리지 않는다',
    data.prefs === undefined);

  /* 운영자는 사업장을 가로지른다 → workplace_id 가 null 이어야 한다 */
  const oper = data.accounts.filter((a) => a.role === 'operator');
  eq('운영자 계정이 1개다', oper.length, 1);
  has('넣을 때 운영자는 사업장을 null 로 둔다', seedSrc, "a.role === 'operator' ? null : workplaceId");
}

{
  const statements = seedMod.splitStatements(sqlText);
  eq('마이그레이션을 문장 단위로 나눈다 (HTTP 드라이버는 한 번에 한 문장)',
    statements.length, 12);
  eq('그중 테이블 만들기가 7개다',
    statements.filter((s) => /^create table/.test(s)).length, 7);
  ok('주석만 남은 빈 문장이 없다', statements.every((s) => s.length > 10));
}

/* ───────────────────────────────────────────────────────────────────
   6. 비밀번호 — 원문을 넣지 않는다
   ─────────────────────────────────────────────────────────────────── */

{
  const a = seedMod.hashPassword('1234');
  const b = seedMod.hashPassword('1234');
  eq('해시는 64바이트(hex 128자)다', a.hash.length, 128);
  eq('salt 는 16바이트(hex 32자)다', a.salt.length, 32);
  ok('★ 같은 비밀번호라도 계정마다 salt 가 다르다', a.salt !== b.salt);
  ok('★ 같은 비밀번호라도 저장되는 해시가 다르다', a.hash !== b.hash);
  ok('해시에 비밀번호 원문이 들어 있지 않다', a.hash.indexOf('1234') === -1);

  const insert = /insert into accounts[\s\S]*?on conflict/.exec(seedSrc)[0];
  ok('★ 계정을 넣을 때 비밀번호 원문(a.pw)을 넣지 않는다',
    !/\$\{a\.pw\}/.test(insert));
  ok('해시와 salt 만 넣는다', /pw\.hash/.test(insert) && /pw\.salt/.test(insert));
}

/* ───────────────────────────────────────────────────────────────────
   7. 넣는 방식 — 질의와 안전장치
   ─────────────────────────────────────────────────────────────────── */

{
  /* 매개변수 방식만 쓴다 (A02 §14.3). 문자열을 이어 붙인 질의가 없다 */
  ok('★ 문자열을 이어 붙여 질의를 만들지 않는다',
    !/sql\s*\(\s*['"`]/.test(seedSrc) && !/sql\.unsafe/.test(seedSrc));
  const rawQueries = (seedSrc.match(/sql\.query\(([^)]*)\)/g) || []);
  eq('sql.query() 는 마이그레이션 한 곳뿐이다', rawQueries.length, 1);
  eq('그 인자는 파일에서 읽은 문장 변수다', rawQueries[0], 'sql.query(stmt)');

  /* 신고를 넣는 질의에 계정 값이 섞이지 않는다 */
  const rep = /insert into reports[^`]*/.exec(seedSrc)[0];
  ok('★ 신고를 넣을 때 계정 값을 넣지 않는다',
    !/account|userId|workerId/i.test(rep), rep);

  /* 운영 DB 보호 */
  has('운영(production) 환경이면 멈춘다', seedSrc, "env.VERCEL_ENV === 'production'");
  has('--yes 를 붙여야 실제로 넣는다', seedSrc, "--yes");
  has('연결 문자열은 .env.local 에서 읽는다 (명령줄에 남기지 않는다)', seedSrc, 'DATABASE_URL');
  ok('★ 연결 문자열·키 값이 파일에 박혀 있지 않다',
    !/postgres(ql)?:\/\/[^\s'"`]*:[^\s'"`]*@/.test(seedSrc));
  ok('신고가 이미 있으면 다시 쌓지 않는다', /select count\(\*\)::int as n from reports/.test(seedSrc));
}

report('DB 기반 — 마이그레이션 · 의존성 규칙 · 시연 데이터 (T10)');
