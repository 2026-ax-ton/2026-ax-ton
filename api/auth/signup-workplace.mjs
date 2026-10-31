/* POST /api/auth/signup-workplace — 사업장을 만들고 담당자 계정을 만든다.

   요청  { siteName, sizeBand?, userId(이메일), pw, name?, title? }
   응답  { token, user, joinCode, expiresAt }
   오류  400 bad_request · 409 taken · 500 config

   ★ 가입 코드는 **서버가 만든다.** 담당자가 고르게 하면 「1234」 가 된다.
     이 코드를 받은 사람만 그 사업장의 노동자로 가입할 수 있다 (FR-AD-01-07).
   ★ 역할은 서버가 'admin' 으로 정한다. 본문의 role 은 보지 않는다 (A02 §14.6).
   ★ 운영자 계정은 이 길로 만들 수 없다 — 사업장을 가로지르는 내부 계정이다.

   근거: A02 §14.3·§14.6 · PRD-AD-01 FR-AD-01-06·07 */

import { json, fail, log } from '../_shared.mjs';
import { openRequest , withDb } from '../_db.mjs';
import {
  clean, hashPassword, newToken, tokenHash, authConfig, publicUser,
  SIGNUP_ROLES, MAX_ID, MAX_PW, MIN_PW, MAX_NAME,
} from '../_auth.mjs';

export const config = { maxDuration: 30 };

/* 사람이 전화로 불러 줄 수 있어야 한다 — 헷갈리는 글자(0·O·1·I·L)를 뺀다. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function makeJoinCode() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    if (i === 4) out += '-';
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

async function run(request) {
  const started = Date.now();
  const opened = await openRequest(request);
  if (opened.done) return opened.done;
  const { cors, body, sql } = opened;

  const siteName = clean(body.siteName, MAX_NAME);
  const sizeBand = clean(body.sizeBand, 40);
  const userId = clean(body.userId, MAX_ID);
  const pw = typeof body.pw === 'string' ? body.pw.slice(0, MAX_PW) : '';
  const name = clean(body.name, MAX_NAME);
  const title = clean(body.title, MAX_NAME);

  if (!siteName || !userId || pw.length < MIN_PW) {
    return fail(400, 'bad_request', '사업장 이름 · 아이디 · 비밀번호를 확인해 주세요.', cors);
  }

  const dup = await sql`select 1 as x from accounts where user_id = ${userId}`;
  if (dup && dup.length) {
    return fail(409, 'taken', '이미 있는 아이디입니다.', cors);
  }

  const joinCode = makeJoinCode();
  const wp = await sql`
    insert into workplaces (name, size_band, join_code)
    values (${siteName}, ${sizeBand || null}, ${joinCode})
    returning id`;
  const workplaceId = wp[0].id;

  const pwv = hashPassword(pw);
  const rows = await sql`
    insert into accounts (workplace_id, user_id, role, name, title, pw_hash, pw_salt)
    values (${workplaceId}, ${userId}, ${SIGNUP_ROLES.workplace}, ${name || null}, ${title || null},
            ${pwv.hash}, ${pwv.salt})
    returning id, user_id, role, name, title, lang, process_id`;
  const acc = rows[0];

  const cfg = authConfig();
  const token = newToken();
  const expiresAt = new Date(Date.now() + cfg.ttlHours * 3600000).toISOString();
  await sql`
    insert into sessions (token_hash, account_id, expires_at)
    values (${tokenHash(token)}, ${acc.id}, ${expiresAt})`;

  log({ route: 'auth/signup-workplace', ms: Date.now() - started, status: 200, err: '' });
  return json(200, { token, user: publicUser(acc, siteName), joinCode, expiresAt }, cors);
}

/* ★ DB가 아파도 날것의 500 을 내지 않는다 — 화면이 로컬 모드로 이어갈 수 있게
   우리 모양 `{error:'db'}` 로 바꿔 준다 (2026-11-01 미리보기에서 실물로 드러남) */
export const handle = withDb('auth/signup-workplace', run);

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
