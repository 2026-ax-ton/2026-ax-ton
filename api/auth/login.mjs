/* POST /api/auth/login — 아이디와 비밀번호로 토큰을 받는다.

   요청  { userId, pw }
   응답  { token, user, expiresAt }     ← 비밀번호 관련 값은 한 개도 나가지 않는다
   오류  400 bad_request · 401 bad_login · 423 locked · 500 config

   넘지 않는 선 (A02 §14.6)
     · **아이디가 없는 것과 비밀번호가 틀린 것을 구분해서 알려 주지 않는다.**
       "그 아이디는 있다" 를 흘리면 식별번호를 하나씩 넣어 명단을 만들 수 있다
     · 5번 틀리면 10분 잠근다 (LOGIN_MAX_FAIL · LOGIN_LOCK_MIN)
     · 토큰 원문은 이 응답에만 나가고 DB에는 sha256 지문만 남는다
     · 로그에 아이디·비밀번호·토큰을 남기지 않는다

   근거: A02 §14.3·§14.6 · PRD-CM-01 FR-CM-01-06 */

import { json, fail, log } from '../_shared.mjs';
import { openRequest, sweepSessions } from '../_db.mjs';
import {
  clean, verifyPassword, newToken, tokenHash, authConfig, publicUser,
  MAX_ID, MAX_PW,
} from '../_auth.mjs';

export const config = { maxDuration: 30 };

export async function handle(request) {
  const started = Date.now();
  const opened = await openRequest(request);
  if (opened.done) return opened.done;
  const { cors, body, sql } = opened;

  const userId = clean(body.userId, MAX_ID);
  const pw = typeof body.pw === 'string' ? body.pw.slice(0, MAX_PW) : '';
  if (!userId || !pw) {
    return fail(400, 'bad_request', '아이디와 비밀번호를 입력해 주세요.', cors);
  }

  const cfg = authConfig();
  const rows = await sql`
    select a.id, a.user_id, a.role, a.name, a.title, a.lang, a.process_id,
           a.pw_hash, a.pw_salt, a.failed_count, a.locked_until,
           w.name as site_name
      from accounts a
      left join workplaces w on w.id = a.workplace_id
     where a.user_id = ${userId}`;
  const acc = rows && rows[0];

  /* 잠긴 계정은 비밀번호를 보지 않고 돌려보낸다. 맞는 비밀번호로도 못 들어간다. */
  if (acc && acc.locked_until && new Date(acc.locked_until) > new Date()) {
    log({ route: 'auth/login', ms: Date.now() - started, status: 423, err: 'locked' });
    return fail(423, 'locked', '여러 번 틀려서 잠겼습니다. 잠시 뒤 다시 시도해 주세요.', cors);
  }

  /* ★ 계정이 없어도 비밀번호를 확인하는 척 같은 일을 한다.
     아이디가 있을 때만 느려지면, 걸리는 시간만 재도 명단을 만들 수 있다. */
  const okPw = acc
    ? verifyPassword(pw, acc.pw_hash, acc.pw_salt)
    : verifyPassword(pw, 'x'.repeat(128), 'x');

  if (!acc || !okPw) {
    if (acc) {
      const failed = (acc.failed_count || 0) + 1;
      const lock = failed >= cfg.maxFail;
      await sql`
        update accounts
           set failed_count = ${lock ? 0 : failed},
               locked_until = ${lock ? new Date(Date.now() + cfg.lockMin * 60000).toISOString() : null}
         where id = ${acc.id}`;
    }
    log({ route: 'auth/login', ms: Date.now() - started, status: 401, err: 'bad_login' });
    return fail(401, 'bad_login', '아이디 또는 비밀번호가 맞지 않습니다.', cors);
  }

  /* 들어왔으면 실패 횟수를 0 으로 되돌린다. 어제 두 번 틀린 것이 쌓이면 안 된다. */
  if (acc.failed_count || acc.locked_until) {
    await sql`update accounts set failed_count = 0, locked_until = null where id = ${acc.id}`;
  }

  await sweepSessions(sql);

  const token = newToken();
  const expiresAt = new Date(Date.now() + cfg.ttlHours * 3600000).toISOString();
  await sql`
    insert into sessions (token_hash, account_id, expires_at)
    values (${tokenHash(token)}, ${acc.id}, ${expiresAt})`;

  log({ route: 'auth/login', role: acc.role, ms: Date.now() - started, status: 200, err: '' });
  return json(200, { token, user: publicUser(acc, acc.site_name), expiresAt }, cors);
}

/* default 를 내보내지 않는다 — Vercel 이 옛 Node 방식으로 불러 터진다 (2차에서 겪음) */
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
