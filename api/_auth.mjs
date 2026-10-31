/* 비밀번호와 토큰 — 바깥을 부르지 않는 순수 계산만 둔다 (DB·네트워크 없음).

   ★ 이 파일이 **비밀번호 형식의 정답 한 곳**이다.
     `scripts/seed-demo.mjs`(시연 계정 만들기)와 `api/auth/*`(로그인)가
     같은 함수를 쓴다. 두 곳에 따로 적으면 시연 계정으로 로그인이 안 된다.

   ★ 드라이버를 부르지 않는다. 그래서 `npm install` 없이도 검사가 돈다.

   넘지 않는 선 (A02 §14.6)
     · 비밀번호 원문을 저장하지도, 응답·로그에 내지도 않는다
     · 토큰 원문을 DB에 저장하지 않는다 — sha256 지문만 둔다
     · 비교는 길이가 달라도 같은 시간이 걸리게 한다 (timingSafeEqual)

   근거: A02 §14.6 · C06 D-023 */

import crypto from 'crypto';

/* ── 결정에 걸린 값 (A02 §14.6·§14.7) ──────────────────────────────── */

export const SCRYPT_KEYLEN = 64;        // 해시 길이 (바이트) → hex 128자
export const SCRYPT_SALT_BYTES = 16;    // 계정별 salt (바이트) → hex 32자
export const TOKEN_BYTES = 32;          // 토큰 난수 길이 (바이트) → hex 64자

export const DEFAULT_TTL_HOURS = 12;    // SESSION_TTL_HOURS
export const DEFAULT_MAX_FAIL = 5;      // LOGIN_MAX_FAIL
export const DEFAULT_LOCK_MIN = 10;     // LOGIN_LOCK_MIN

/* ── 비밀번호 ──────────────────────────────────────────────────────── */

/** 새 비밀번호를 해시한다. 같은 비밀번호라도 계정마다 다른 값이 나온다. */
export function hashPassword(pw) {
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES).toString('hex');
  const hash = crypto.scryptSync(pw, salt, SCRYPT_KEYLEN).toString('hex');
  return { hash, salt };
}

/** 맞는 비밀번호인가. 틀린 경우와 모양이 깨진 경우 모두 false 다. */
export function verifyPassword(pw, hash, salt) {
  if (typeof pw !== 'string' || typeof hash !== 'string' || typeof salt !== 'string') return false;
  if (hash.length !== SCRYPT_KEYLEN * 2 || !salt) return false;
  let got;
  try {
    got = crypto.scryptSync(pw, salt, SCRYPT_KEYLEN);
  } catch (e) {
    return false;
  }
  const want = Buffer.from(hash, 'hex');
  if (want.length !== got.length) return false;
  return crypto.timingSafeEqual(got, want);
}

/* ── 토큰 ──────────────────────────────────────────────────────────── */

/** 로그인할 때마다 새로 만든다. 원문은 이 응답에만 나가고 DB에는 지문만 남는다. */
export function newToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

export function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** `Authorization: Bearer <token>` 에서 토큰만 꺼낸다. 없으면 빈 문자열. */
export function bearer(request) {
  const raw = (request.headers.get('authorization') || '').trim();
  const m = /^Bearer\s+([A-Za-z0-9._-]+)$/.exec(raw);
  return m ? m[1] : '';
}

/* ── 설정값 (환경변수, A02 §14.7) ──────────────────────────────────── */

export function authConfig() {
  return {
    ttlHours: Number(process.env.SESSION_TTL_HOURS) || DEFAULT_TTL_HOURS,
    maxFail: Number(process.env.LOGIN_MAX_FAIL) || DEFAULT_MAX_FAIL,
    lockMin: Number(process.env.LOGIN_LOCK_MIN) || DEFAULT_LOCK_MIN,
  };
}

/* ── 입력 다듬기 ───────────────────────────────────────────────────── */

export const MAX_ID = 120;
export const MAX_PW = 200;
export const MIN_PW = 4;        // 시연 계정이 1234 다 (C06 D-023 — 현장 도입 때 올린다)
export const MAX_NAME = 60;

export function clean(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** 가입 코드 — 사람이 받아 적는 값이라 대문자로 맞춘다. */
export function cleanJoinCode(v) {
  return clean(v, 40).toUpperCase();
}

/* 역할은 서버가 정한다. 요청 본문의 role 을 그대로 믿지 않는다 (A02 §14.6).
   운영자 계정은 가입으로 만들 수 없다 — 사업장을 가로지르는 내부 계정이다. */
export const SIGNUP_ROLES = { workplace: 'admin', worker: 'worker' };

/** 화면에 내려보내는 사용자 정보. **비밀번호 관련 값은 한 개도 넣지 않는다.** */
export function publicUser(row, siteName) {
  return {
    userId: row.user_id,
    role: row.role,
    name: row.name || '',
    title: row.title || '',
    siteName: siteName || '',
    lang: row.lang || '',
    processId: row.process_id || '',
  };
}
