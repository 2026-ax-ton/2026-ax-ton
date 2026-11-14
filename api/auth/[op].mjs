/* /api/auth/<op> — 로그인·로그아웃·가입 둘을 서버 함수 하나로 묶는다 (2026-11-14).

   ★ 왜: Vercel Hobby 요금제는 배포 하나에 서버 함수 12개까지다 (개인 비공개 사본 배포가 13개로 막혔다).
     주소는 그대로 — /api/auth/login · logout · signup · signup-workplace. 화면(auth.js)·검사는 바뀌지 않는다.
     본문은 밑줄 파일(_login.mjs 등)에 그대로 있다 — 밑줄 파일은 Vercel 이 함수로 세지 않는다. */
import { handle as login } from './_login.mjs';
import { handle as logout } from './_logout.mjs';
import { handle as signup } from './_signup.mjs';
import { handle as signupWorkplace } from './_signup-workplace.mjs';

export const config = { maxDuration: 30 };

const OPS = { login, logout, signup, 'signup-workplace': signupWorkplace };

export function handle(request) {
  const op = new URL(request.url).pathname.replace(/\/+$/, '').split('/').pop();
  const fn = Object.prototype.hasOwnProperty.call(OPS, op) ? OPS[op] : null;
  if (!fn) return new Response(JSON.stringify({ ok: false, error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  return fn(request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
