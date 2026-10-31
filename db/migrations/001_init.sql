-- 001_init.sql — 해커톤 3차 DB 기반 (테이블 7개)
--
-- 근거: A02 §14.2 (DDL 초안) · C06 D-023 (Neon Postgres 도입)
-- 규칙: 테이블 변경은 db/migrations/NNN_설명.sql 파일로만 한다.
--       운영 DB에 손으로 고치지 않는다 (A02 §14.2).
--
-- 넘지 않는 선 — 이 파일이 코드로 지키는 제품 원칙
--   · accounts 에 외국인등록번호·여권번호 열을 두지 않는다 (사업장 내 식별번호만)
--   · reports 에 계정 열을 두지 않는다 — 익명을 구조로 지킨다 (A02 §14.6)
--   · 비밀번호는 원문을 저장하지 않는다 (scrypt 해시 + 계정별 salt)
--   · sessions 에 토큰 원문을 저장하지 않는다 (sha256 만)
--
-- 여러 번 돌려도 같은 결과가 되게 if not exists 로 쓴다 (미리보기 브랜치를 자주 다시 만든다).

-- gen_random_uuid() — Postgres 13+ 코어에 있다. 구형 대비로 확장을 함께 건다.
create extension if not exists pgcrypto;

-- ── 1. 사업장 ────────────────────────────────────────────────────────
create table if not exists workplaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  size_band   text,
  join_code   text unique not null,          -- 노동자 가입 코드 (담당자가 재발급 가능)
  created_at  timestamptz default now()
);

-- ── 2. 계정 ──────────────────────────────────────────────────────────
-- user_id: 노동자 = 사업장 내 식별번호, 담당자·운영자 = 이메일
-- workplace_id: 운영자는 null (사업장을 가로지른다)
create table if not exists accounts (
  id            uuid primary key default gen_random_uuid(),
  workplace_id  uuid references workplaces,
  user_id       text unique not null,
  role          text not null check (role in ('worker', 'admin', 'operator')),
  name          text,
  title         text,
  lang          text,
  process_id    text,
  pw_hash       text not null,               -- scrypt (node:crypto)
  pw_salt       text not null,               -- 계정별 salt
  failed_count  int default 0,               -- 5회 실패 → 잠금 (A02 §14.6)
  locked_until  timestamptz,
  created_at    timestamptz default now()
);
create index if not exists accounts_workplace_idx on accounts (workplace_id);

-- ── 3. 세션 ──────────────────────────────────────────────────────────
-- 토큰 원문은 저장하지 않는다. 만료 12시간 (SESSION_TTL_HOURS).
create table if not exists sessions (
  token_hash  text primary key,              -- sha256(token)
  account_id  uuid references accounts on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz default now()
);
create index if not exists sessions_expires_idx on sessions (expires_at);

-- ── 4. 사업장별 저장 키 (Store 키와 1:1) ─────────────────────────────
-- prefs(글자 크기)는 기기 설정이라 올리지 않는다.
-- accounts·session 은 위 서버 테이블이 대신한다. library 는 공용이라 따로 둔다.
create table if not exists docs (
  workplace_id  uuid references workplaces,
  key           text check (key in ('setup', 'courses', 'progress', 'posts', 'orders')),
  data          jsonb not null,
  version       int not null default 1,      -- 409 판정 기준 (A02 §14.4)
  updated_at    timestamptz default now(),
  primary key (workplace_id, key)
);

-- ── 5. 안전 문구 라이브러리 (전 사업장 공용, 운영자 관리) ────────────
create table if not exists library (
  id          text primary key,              -- 문구 id (ph-1 …)
  data        jsonb not null,                -- translations[lang].agent·judged 포함 (A02 §6.3)
  version     int not null default 1,
  updated_at  timestamptz default now()
);

-- ── 6. 익명 신고 ─────────────────────────────────────────────────────
-- ★ 계정 열이 없다. 토큰에서 사업장만 꺼내고 계정은 버린다 (A02 §14.3).
--   익명성이 깨지면 신고가 멈추고, 재해 감소의 선행지표도 함께 사라진다.
create table if not exists reports (
  id            uuid primary key default gen_random_uuid(),
  workplace_id  uuid references workplaces,
  data          jsonb not null,
  created_at    timestamptz default now()
);
create index if not exists reports_workplace_idx on reports (workplace_id, created_at desc);

-- ── 7. 감사 기록 ─────────────────────────────────────────────────────
-- ★ 신고는 기록하지 않는다 (A02 §14.6 익명).
create table if not exists audit (
  id            bigserial primary key,
  workplace_id  uuid,
  account_id    uuid,
  action        text,
  target        text,
  at            timestamptz default now()
);
create index if not exists audit_workplace_idx on audit (workplace_id, at desc);
