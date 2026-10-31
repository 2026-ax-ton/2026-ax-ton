# SPEC-BE · 백엔드 명세 (PRD → BE Spec)

> **문서 상태** **v1.0 (byeonsoyun 확정)** — §1 배치만 `미정`, §2는 A안 기준으로 **결정**(기술 멘토링 10/30에서 바뀌면 고침), §3은 판매 단계 설계(해커톤에서 만들지 않음) · **최종 수정** 2026-10-22 · **소유자** byeonsoyun
> **이 문서가 답하는 질문** 서버가 없는 지금, 서버는 어디부터 무엇을 하나 · 해커톤에서 만들 것과 판매 때 만들 것을 어떻게 나누나
> **원천** [PRD-AD-03](../30_제품정의/prd/PRD-AD-03_AI-번역검수-에이전트.md), [PRD-CM-01](../30_제품정의/prd/PRD-CM-01_계정-로그인.md), 각 PRD의 ⬜ 요구, `docs/08-overview.md` 5부

---

> 🆕 **2026-10-31 변경 (C06 D-023)** — 단계 S의 **DB·서버 인증·데이터 동기화(BE-CM-01·BE-DATA 일부)를 해커톤(단계 H, 3차 스프린트)으로 당겼다.** `/api` 위치는 저장소 루트 `api/`로 확정(D-005). 작업자앱은 **같은 출처 `/api`로 데이터 동기화**를 한다(제3자 요청은 0건). 해커톤 범위의 정답 명세는 [A02 §14](A02_기술-개발-명세서.md) — 아래 §1·§3과 다르면 A02 §14가 맞다. 사진 신고(BE-WK-04)·알림·증빙 봉인은 여전히 단계 S다.

## 0. 현재 상태와 단계

| 단계 | 서버 | 데이터 | 범위 |
|---|---|---|---|
| **지금 (v1.0)** | 없음. Vercel 정적 배포 (Root Directory `src`, `vercel.json` 없음) | 브라우저 `localStorage` 10칸, `Store`만 접근 | — |
| **단계 H (해커톤)** 🔶 | Vercel 서버리스 함수 `/api/*` — **AI 호출만** | 그대로 `localStorage` | BE-AD-03 |
| **단계 S (판매)** ⬜ | 서버 함수 + 관리형 PostgreSQL + 파일 저장소 + 서버 인증 | `Store` 안쪽만 서버 호출로 교체, 화면은 그대로 | BE-CM-01, BE-DATA, BE-WK-04, BE-AD-05/06 |

**넘지 않는 선 (모든 단계)**: 작업자앱은 `/api/*`를 부르지 않는다(단계 S에서 데이터 동기화는 예외로 따로 결정). AI 결과를 `reviewed`로 저장하는 서버 경로를 만들지 않는다. 신고자 식별값을 받지도 저장하지도 않는다. 키를 응답·로그에 내지 않는다.

---

## 1. 배치 결정 — `/api`를 어디에 두나 (후보 비교)

| 안 | 방식 | 장점 | 걸림 | 확인 필요 |
|---|---|---|---|---|
| **① Root Directory를 저장소 루트로 바꿈** (`docs/12` 원안) | `/api/*.js` 저장소 루트, 정적 파일은 `src/` | `src/`에 서버 코드가 섞이지 않는다 | 배포 설정 변경 → 소유자 승인. 바꾼 뒤 `docs/`·`tests/`가 배포에 노출되지 않게 막아야 한다 | 소유자 승인 (TK-1-11) |
| **② Root Directory `src` 유지, `src/api/*.js`** | 함수를 `src/api/`에 둔다. Node 내장 `fetch`만 써서 **의존성 0 유지** | 배포 설정을 바꾸지 않는다 | "`src/`는 화면 코드" 관례가 깨진다. `test-offline.js` 등이 `src/` 전체를 검사하면 서버 코드의 외부 주소(AI API)가 걸린다 → 검사 범위를 작업자앱으로 한정해야 한다 | Vercel이 Root Directory 아래 `api/`를 함수로 인식하는지 배포 미리보기로 확인 |

> **`미정`** — 두 안 모두 §2 API 계약은 같다. 저장소 소유자 승인 + 기술 멘토링(10/30) 질문 1로 정하고 C06 D-005에 기록한다. 코드 생성은 함수 본문부터 시작하고 위치만 나중에 옮긴다.

---

## 2. 단계 H — AI 호출 함수 (BE-AD-03) 🔶

### 2.1 D-006 A안 기준 (브라우저가 지휘, 함수는 한 단계만) — 기본안 (결정)

#### `POST /api/translate`
| 항목 | 내용 |
|---|---|
| 요청 | `{ "ko": string(1~300자), "lang": "km"|"id"|"vi"|"ne"|"th", "attempt": 0~2 }` |
| 응답 200 | `{ "text": string, "model": string }` — **`status` 필드를 돌려주지 않는다** |
| 처리 | 모델에 "산업안전 지시문을 `<언어>`로 번역. 부정·금지 표현을 반드시 보존. 번역문만 출력" 지시. `attempt > 0`이면 "앞 번역에서 부정이 뒤집혔다"를 덧붙인다 |
| 모델 | Gemini `gemini-3.1-flash-lite` (N-64, C06 D-018) — 환경변수 `AI_MODEL_TRANSLATE`. 요청 형식은 [A02 §5.3](A02_기술-개발-명세서.md) |

#### `POST /api/backtranslate`
| 항목 | 내용 |
|---|---|
| 요청 | `{ "text": string(1~600자), "lang": 언어 코드 }` |
| 응답 200 | `{ "back": string(한국어), "model": string }` |
| 처리 | **번역과 다른 모델 또는 다른 프롬프트**로 한국어 역번역 (같은 오류를 같이 놓치지 않게 — R-03, A01 질문 3). 환경변수 `AI_MODEL_BACK` |

### 2.2 공통 규칙

| 항목 | 규칙 |
|---|---|
| 출처 | 배포 주소(`ALLOWED_ORIGIN`)만 통과. 해커톤 시연 기간에만 `ALLOW_FILE_ORIGIN=1`로 `Origin: null`(`file://` 제출본) 허용 + CORS 헤더 + `OPTIONS` 204 ([A02 §5.2](A02_기술-개발-명세서.md), C06 D-019) |
| 키 | `GEMINI_API_KEY` 환경변수(Vercel)만. `x-goog-api-key` 헤더로 보낸다. 코드·응답·로그에 없음 (STC-E19-001) |
| 입력 검증 | 언어 코드 허용 목록, 길이 상한, JSON 아닌 본문 거부 → 400 |
| 출력 검증 | 모델 출력에서 앞뒤 공백 제거, 길이 상한, 빈 문자열이면 502. HTML은 그대로 문자열로 돌려준다 (표시 쪽이 `textContent`) |
| 시간 | 함수 `maxDuration` 30초 (Vercel 최대 300초, N-60), 모델 호출 타임아웃 20초 |
| 오류 | `{ "error": "code", "message": "한국어 설명" }` · 400 입력 · 429 상한 · 502 모델 오류 · 504 시간 초과. 화면은 어떤 오류든 손 입력 경로로 돌아간다 |
| 상한 | 호출 상한: 문구 1개 × 언어 5 × 2단계 × 3회 = 30회/문구. 일일 상한 환경변수 `AI_DAILY_LIMIT` (결정) |
| 개인정보 | 요청 본문은 안전 문구뿐이다. 노동자·신고 데이터를 보내지 않는다 (A-8) |
| 로그 | 언어·시도·지연 시간·오류 코드만. 문구 원문·키는 남기지 않는다 |
| 의존성 | 없음. Node 18 이상 내장 `fetch`로 모델 API 호출 |
| 비용 | 문구 100개당 약 1.1~3.3달러 (N-65) |
| 요금제 | Hobby는 비상업 용도만 (N-61) — 판매 전에 Pro로 옮긴다 |

### 2.3 D-006 B안을 고를 경우 (서버가 루프 전체) — 예비안, 멘토링에서 B안을 권하면 쓴다

`POST /api/agent/translate-review` — 요청 `{ko, langs[]}` → 응답 `{results: {[code]: {text, back, flipped, tries, escalated}}}`. 비교 로직을 서버로 옮겨야 하므로 `review.js`를 서버에서도 읽을 수 있게 구조를 바꿔야 한다 (두 곳 복사 금지). 화면은 단계별 진행을 보여 줄 수 없다 → 시연 효과가 줄어든다.

### 2.4 시험 (서버 쪽)

| 케이스 | 기대 |
|---|---|
| 허용 안 된 언어 코드 | 400 |
| 키 없음 | 500 + "서버 설정 오류" (키 값은 출력 안 함) |
| 모델 시간 초과 (가짜) | 504 |
| 응답에 `status` 필드가 없다 | 항상 |

---

## 3. 단계 S — 판매용 서버 (판매 단계 설계) ⬜

### 3.1 BE-DATA · 데이터 저장소

`Store` 10칸이 그대로 테이블이 된다 (`docs/08-overview.md` 5.2).

| 테이블 | 핵심 열 | 비고 |
|---|---|---|
| `workplaces` | id, name, size_band, langs[] | **다중 사업장** (AD-01 FR-06) — 모든 테이블에 `workplace_id` |
| `accounts` | id, workplace_id, role, lang, password_hash | 외국인등록번호·여권번호 열 없음 (P-8) |
| `setup_*` | processes, equipment, workers(사업장 내 식별번호) | |
| `phrases` / `phrase_translations` | ko, category / lang, text, back, status, judged_by, judged_at, agent_json | 판정 기록 (AD-02 FR-09) |
| `courses` / `quiz_items` | 문항, i18n, retired | 발급 후 정답 번호 변경 불가 — DB 제약으로 막는다 |
| `progress` | worker_id, course_id, learned_at, quiz_json | 수정 불가(추가만) — 증빙 무결성 |
| `reports` | ticket, workplace_id, equipment, hazard, memo, photo_key, status | **신고자 열 없음** (P-3) |
| `posts` | author(감추면 NULL), body, comments | |
| `orders` | course_id, target, note, at | 해소는 저장 안 함 |
| (`prefs`) | — | 서버로 올리지 않는다 (기기 설정) |

### 3.2 API (요약)

| ID | 경로 | 용도 | 원천 PRD |
|---|---|---|---|
| BE-CM-01 | `POST /api/auth/login` · `/signup` · `/logout` | 서버 인증·세션 쿠키 (`Auth` 안쪽만 교체) | CM-01 FR-06 |
| BE-DATA | `GET/PUT /api/store/:key` | `Store.load/save` 대체 (화면 코드 변경 없음) | 08-overview 5.3 |
| BE-WK-04 | `POST /api/reports` (사진 업로드) · `GET /api/reports/:ticket` | 사진 첨부·접수 번호로 회신 조회 (로그인 없이 번호만) | WK-04 FR-06·07 |
| BE-AD-05 | 예약 작업 `cron` | 기한·미이수 알림 | AD-05 FR-08 |
| BE-AD-06 | `POST /api/proof/seal` | 증빙 생성 시점 해시·타임스탬프 | AD-06 FR-08 |

### 3.3 판매 단계에서 잃는 것 (미리 적어 둠)

- `file://` 더블클릭 확인이 사라진다. 오프라인 우선 동작이 별도 과제가 된다. 개인정보를 서버에 담으므로 보안·법적 책임이 생긴다 (`docs/08-overview.md` 5.4).

---

## 제·개정 이력

| 버전 | 날짜 | 작성자 | 내용 |
|---|---|---|---|
| 0.1 | 2026-10-22 | byeonsoyun | 최초 작성. 단계 H(AI 함수)·단계 S(판매) 분리, `/api` 배치 후보 2안 |
| 1.0 | 2026-10-22 | byeonsoyun | A안을 기본안으로 결정, `/api` 배치만 미정으로 남김, 최종본으로 확정 |
| 1.0.1 | 2026-10-23 | byeonsoyun | AI 공급사 Gemini 반영(C06 D-018), §2.2 출처 규칙에 시연 기간 `null` 출처 추가(C06 D-019) |
| 1.1 | 2026-10-31 | byeonsoyun | D-023 반영 안내: DB·인증·동기화를 단계 H로 당김, `/api` 루트 확정, 상세는 A02 §14 |
