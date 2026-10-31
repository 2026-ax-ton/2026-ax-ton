/* POST /api/auth/logout — 토큰을 버린다.

   요청  {} · `Authorization: Bearer <token>`
   응답  { ok: true }

   ★ 토큰이 이미 없거나 틀려도 200 이다. 로그아웃은 **실패하면 안 되는 일**이다 —
     공용 폰에서 "로그아웃이 안 됐습니다" 를 보여 주면 다음 사람이 그대로 쓴다.
     지울 것이 없으면 이미 지워진 것이고, 화면은 어느 쪽이든 토큰을 버린다.

   근거: A02 §14.3·§14.6 · PRD-CM-01 · A04 2-5 (공용 폰) */

import { json } from '../_shared.mjs';
import { openRequest } from '../_db.mjs';
import { bearer, tokenHash } from '../_auth.mjs';

export const config = { maxDuration: 30 };

export async function handle(request) {
  const opened = await openRequest(request);
  if (opened.done) return opened.done;
  const { cors, sql } = opened;

  const token = bearer(request);
  if (token) {
    await sql`delete from sessions where token_hash = ${tokenHash(token)}`;
  }

  return json(200, { ok: true }, cors);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
