/* POST /api/auth/signup — 노동자가 가입 코드로 그 사업장에 들어온다.

   요청  { joinCode, userId(사업장 내 식별번호), pw, lang?, processId?, name? }
   응답  { token, user, linked, expiresAt }
   오류  400 bad_request · 403 bad_code · 409 taken · 500 config

   ★ 외국인등록번호·여권번호를 받지 않는다 (C05 P-8). 사업장 내 식별번호만 쓴다.
   ★ 역할은 서버가 'worker' 로 정한다. 본문의 role 은 보지 않는다 (A02 §14.6).
   ★ 담당자가 등록한 명단에 같은 식별번호가 있으면 **언어·공정을 거기서 가져온다**
     (FR-AD-01-07). 명단에 없어도 가입은 된다 — 둘 중 하나만 있어도 교육은 듣는다.
     여기서 막으면 명단에 빠진 사람이 교육을 못 듣는다. 미이수는 교육의 실패다.

   근거: A02 §14.3·§14.6 · PRD-CM-01 · PRD-AD-01 FR-AD-01-07 */

import { json, fail, log } from '../_shared.mjs';
import { openRequest } from '../_db.mjs';
import {
  clean, cleanJoinCode, hashPassword, newToken, tokenHash, authConfig, publicUser,
  SIGNUP_ROLES, MAX_ID, MAX_PW, MIN_PW, MAX_NAME,
} from '../_auth.mjs';

export const config = { maxDuration: 30 };

/** 담당자가 등록한 노동자 명단에서 같은 식별번호를 찾는다 (setup.workers). */
function findInRoster(setupData, userId) {
  const list = setupData && Array.isArray(setupData.workers) ? setupData.workers : [];
  for (const row of list) {
    if (row && row.id === userId) return row;
  }
  return null;
}

export async function handle(request) {
  const started = Date.now();
  const opened = await openRequest(request);
  if (opened.done) return opened.done;
  const { cors, body, sql } = opened;

  const joinCode = cleanJoinCode(body.joinCode);
  const userId = clean(body.userId, MAX_ID);
  const pw = typeof body.pw === 'string' ? body.pw.slice(0, MAX_PW) : '';
  const name = clean(body.name, MAX_NAME);

  if (!joinCode || !userId || pw.length < MIN_PW) {
    return fail(400, 'bad_request', '가입 코드 · 식별번호 · 비밀번호를 확인해 주세요.', cors);
  }

  const wps = await sql`select id, name from workplaces where join_code = ${joinCode}`;
  const wp = wps && wps[0];
  if (!wp) {
    return fail(403, 'bad_code', '가입 코드가 맞지 않습니다. 담당자에게 확인해 주세요.', cors);
  }

  const dup = await sql`select 1 as x from accounts where user_id = ${userId}`;
  if (dup && dup.length) {
    return fail(409, 'taken', '이미 가입된 식별번호입니다.', cors);
  }

  /* 담당자 명단과 맞춰 본다. 명단에 있으면 언어·공정을 거기서 가져온다. */
  const setupRows = await sql`
    select data from docs where workplace_id = ${wp.id} and key = 'setup'`;
  const roster = findInRoster(setupRows && setupRows[0] ? setupRows[0].data : null, userId);

  const lang = clean(body.lang, 8) || (roster ? clean(roster.lang, 8) : '');
  const processId = clean(body.processId, 60) || (roster ? clean(roster.processId, 60) : '');

  const pwv = hashPassword(pw);
  const rows = await sql`
    insert into accounts (workplace_id, user_id, role, name, lang, process_id, pw_hash, pw_salt)
    values (${wp.id}, ${userId}, ${SIGNUP_ROLES.worker}, ${name || null},
            ${lang || null}, ${processId || null}, ${pwv.hash}, ${pwv.salt})
    returning id, user_id, role, name, title, lang, process_id`;
  const acc = rows[0];

  const cfg = authConfig();
  const token = newToken();
  const expiresAt = new Date(Date.now() + cfg.ttlHours * 3600000).toISOString();
  await sql`
    insert into sessions (token_hash, account_id, expires_at)
    values (${tokenHash(token)}, ${acc.id}, ${expiresAt})`;

  log({ route: 'auth/signup', linked: !!roster, ms: Date.now() - started, status: 200, err: '' });
  return json(200, { token, user: publicUser(acc, wp.name), linked: !!roster, expiresAt }, cors);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
