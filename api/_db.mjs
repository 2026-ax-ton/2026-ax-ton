/* DB 연결과 토큰 확인 — `api/` 함수들이 함께 쓴다.

   밑줄로 시작하는 파일은 Vercel 이 경로로 잡지 않는다. 이 파일은 함수가 아니다.

   ★ 드라이버는 **처음 쓸 때만** 불러온다 (동적 import).
     맨 위에서 불러오면 `npm install` 안 한 사람은 검사조차 못 돌린다 (C05 T-5′).
   ★ 검사는 `setSqlForTest()` 로 가짜 `sql` 을 끼운다 — 실제 DB를 부르지 않는다 (A02 §14.8).
   ★ 질의는 매개변수 방식(sql`… ${v}`)만 쓴다. 문자열을 이어 붙이지 않는다 (A02 §14.3).

   근거: A02 §14.3·§14.6·§14.8 */

import { bearer, tokenHash } from './_auth.mjs';
import { guardBasic, parseJson, fail, log } from './_shared.mjs';

let testSql = null;
let cached = null;

/** 검사에서만 쓴다. null 을 넣으면 원래대로 돌아간다. */
export function setSqlForTest(fn) {
  testSql = fn;
  cached = null;
}

/** 연결된 `sql` 을 돌려준다. 설정이 없으면 null (부르는 쪽이 500 을 낸다). */
export async function getSql() {
  if (testSql) return testSql;
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const { neon } = await import('@neondatabase/serverless');
  cached = neon(url);
  return cached;
}

/* ── 토큰 → 계정 (A02 §14.6) ────────────────────────────────────────
   ★ 역할과 사업장은 **토큰에서만** 꺼낸다. 요청 본문에 적힌 사업장·역할은
     믿지 않는다 — 주소를 직접 쳐도 남의 사업장 데이터가 나오면 안 된다. */

/** 토큰이 살아 있으면 계정을 돌려준다. 없거나 만료면 null. */
export async function accountFromToken(sql, token) {
  if (!token) return null;
  const rows = await sql`
    select a.id, a.user_id, a.role, a.name, a.title, a.lang, a.process_id, a.workplace_id,
           w.name as site_name
      from sessions s
      join accounts a on a.id = s.account_id
      left join workplaces w on w.id = a.workplace_id
     where s.token_hash = ${tokenHash(token)}
       and s.expires_at > now()`;
  return rows && rows[0] ? rows[0] : null;
}

/** 요청의 `Authorization: Bearer` 로 계정을 찾는다. */
export async function authed(sql, request) {
  return accountFromToken(sql, bearer(request));
}

/** 만료된 세션을 치운다. 로그인할 때 한 번씩 부른다 (따로 도는 것을 두지 않는다). */
export async function sweepSessions(sql) {
  await sql`delete from sessions where expires_at < now()`;
}

/* ── DB가 아플 때 (2026-11-01 미리보기에서 실물로 드러남) ────────────

   ★ 질의가 던지면 플랫폼이 **날것의 500 「Internal Server Error」** 를 낸다.
     그건 JSON 이 아니라서 화면이 읽지 못하고, 화면은 "뭔가 터졌다" 만 안다.
     우리 모양 `{error, message}` 으로 바꿔 줘야 화면이 **로컬 모드로 이어갈지**
     고를 수 있다 (C05 원칙 2 · C06 D-031).

   ★ 왜 이유를 밖으로 내지 않나 — 질의문·표 이름·연결 문자열이 섞여 나올 수 있다.
     우리가 지은 한 마디만 내보내고, 자세한 것은 함수 로그에만 남긴다 (A02 §14.6). */

export function withDb(route, handler) {
  return async function (request) {
    try {
      return await handler(request);
    } catch (e) {
      /* 메시지는 로그에만. 키·연결 문자열이 섞일 수 있어 본문에는 넣지 않는다 */
      log({ route, status: 503, err: 'db', why: (e && e.message ? String(e.message) : '').slice(0, 120) });
      return fail(503, 'db', 'DB에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    }
  };
}

/* ── 요청 열기 — `/api/auth/*` 네 함수가 똑같이 하는 앞부분 ──────────
   출처·메서드·크기 검사(통과 문구는 보지 않는다) → JSON 읽기 → DB 연결.
   돌려주는 값: { done: Response } 면 여기서 끝, { cors, body, sql } 면 통과. */

export async function openRequest(request) {
  const g = await guardBasic(request);
  if (g.done) return { done: g.done };
  const { cors, text } = g;

  const body = parseJson(text);
  if (!body) return { done: fail(400, 'bad_request', '보낸 내용을 읽을 수 없습니다.', cors) };

  const sql = await getSql();
  /* DB 주소가 없는 것은 **서버 설정이 덜 된 것**이지 사람이 틀린 것이 아니다.
     401 로 뭉개면 "환경변수를 Preview 에 안 넣었다" 를 영영 모른다 (2차에서 겪음). */
  if (!sql) return { done: fail(500, 'config', '서버 설정 오류입니다.', cors) };

  return { cors, body, sql };
}
