# SPEC-FE · 프론트엔드 명세 (PRD → FE Spec)

> **문서 상태** **v1.0 (byeonsoyun 확정)** — Figma 2회차 반영, 팀 검토에서 일부 수정 가능 · **최종 수정** 2026-10-22 · **소유자** byeonsoyun
> **이 문서가 답하는 질문** 각 기능의 화면을 어떤 파일·데이터·규칙으로 만드나 · CodeGen(⑥)에 무엇을 넘기나
> **원천** [`prd/`](../30_제품정의/prd/) 기능별 PRD (§4 FR · §6 데이터 · §8 AC). 서버 쪽은 [SPEC-BE](SPEC-BE.md).
> **상태** ✅ 구현됨(코드가 이 명세의 근거) · 🔶 해커톤에서 구현 · ⬜ 로드맵. **CodeGen 대상은 🔶와 일부 ⬜뿐이다.**

---

## 0. 공통 규칙 (모든 화면)

| 항목 | 규칙 | 근거 |
|---|---|---|
| 구조 | 빌드 없는 정적 HTML + 순수 JS. 파일마다 즉시 실행 함수(IIFE). **ES 모듈 금지** | `CLAUDE.md`, C05 |
| 의존성 | `src/` 의존성 0. 외부 CDN·라이브러리 금지 | C05 |
| 스크립트 순서 | `store.js` → `auth.js` → `<script>Auth.require('<role>')</script>` (`<head>`) → 본문 끝에 `icons.js` → `ui.js` → (`review.js` 등) → 화면 JS | `admin/library.html` |
| DOM | `innerHTML` 금지. `UI.el(tag, className, text)` 또는 `textContent`만 | P-7 보안, A-10 |
| 데이터 | `localStorage`는 `Store`만 부른다. 읽기 통로 함수: `Store.phraseOk` · `qtext` · `askedQuestion` · `orderOpen` | 09-handover §4 |
| 음성 | `UI.speak(speech, lang)`. 그 언어 음성이 없으면 소리 내지 않고 `UI.voiceNote(lang)`로 이유 표시 | P-9 |
| 아이콘·배지 | `UI.setIcon`, `UI.okBadge`·`waitBadge`·`stopBadge` — 아이콘+글자+색 3중 | CM-02 |
| 터치 | 작업자앱 조작 요소 최소 60px (`--tap-min`) | CM-02 |
| 다국어 | 화면 글자는 `i18n.js` 키. 새 글자를 넣으면 6개 언어 키를 함께 넣는다 (`test-i18n.js`가 연결 누락을 잡는다) | STC-E14-002 |
| 색 | 트랙 색: 관리자 보라(`style.css`), 작업자 빨강(`worker.css`). 화면 CSS는 변수 이름만 쓴다 | `style.css` |
| 오프라인 | 배포마다 `sw.js` `VERSION` 올림 (지금 `v9`) | C04 DoD 8 |
| 외부 요청 | 작업자앱 6개 화면 0건. 관리자앱만 `/api/*` 호출 허용 (D-002) | `test-offline.js` |

---

## 1. 작업자앱

### FE-WK-01 · 홈 ✅
- 파일: `src/worker/home.html`·`home.js` · 역할 가드 `worker`
- 읽기: `setup`, `courses`, `library`(`phraseOk`), `progress`, `orders`(`orderOpen`) · 쓰기: 없음
- 구성: 오늘의 문구 캐러셀(검수 완료만) → 3단계 진행 → 재교육 지시 카드 → 큰 메뉴 4개 + 배지
- ⬜ FR-WK-01-06 오역 신고 (결정): 문구 카드에 [이 번역이 이상해요] → 그 문구의 기존 `flags[]`에 `{note, lang, at, resolvedAt:null}`을 더하고 그 언어만 `stopped` (`library.js` `fileFlag`와 같은 규칙 — 계약 변경 없음). **신고자를 저장하지 않는다.** 관리자앱 FE-AD-02 「오역 신고 목록」에 그대로 뜨고, 다시 살리는 판정은 사람이 한다
- 탭바: 하단 4개 메뉴는 지금 코드 그대로 (2회차 시안에서 확인)

### FE-WK-02 · 교육 수강 ✅
- 파일: `src/worker/learn.html`·`learn.js` · 진입: 목록 또는 `?course=<id>`
- 읽기: `courses`, `library`, `setup` · 쓰기: `progress.learnedAt`
- 규칙: 내 언어 기준 `Store.phraseOk(p, lang)`; 통과 문구 0개면 진행 차단; 번역 없으면 한국어 + "번역 준비 중"; 음성 없으면 `voiceNote`
- 다 들으면 `quiz.html?course=<id>`로 이동
- ⬜ FR-WK-02-10: 번역 없음 + 음성 없음이 겹치면 "번역 준비 중"을 먼저, `voiceNote`를 그 아래에 둔다

### FE-WK-03 · 이해도 검증 ✅ (+ 시안 1·2회차 결정 ⬜)
- 파일: `src/worker/quiz.html`·`quiz.js`, `assets/diagrams.js`(도해·구역 좌표 — AD-04와 공유)
- 상태: `run = {course, equipment, questions, index, answers, locked}` (`quiz.js` 151행)
- 문항 렌더: `hotspot`(구역 버튼 + 퍼센트 좌표 `Diagrams.inAnswer`) · `choice`(`options`, `answer` 인덱스) · `match`(`pairs`)
- 답 처리 `answered(correct, consequenceText, consequenceKo)`: 잠금 → `data-mark` ok/no (정답 함께 표시) → 결과 문장 표시 + `UI.speak`
- 채점: `PASS_SCORE` = 전 문항 정답. 기록 `progress.quiz = {score, passed, answers, asked, at, attempt, firstPassed}`
- ⬜ FR-WK-03-12: 문항 머리에 `n / 총`과 "한 번만 답할 수 있어요" (i18n 키 6개 언어)
- ⬜ FR-WK-03-13 (결정): 결과 `result-score`를 `n점` 대신 "n문항 중 m문항"으로, 다음 행동 버튼을 앞에 둔다
- ⬜ FR-WK-03-14: hotspot 구역 버튼의 터치 영역 지름 ≥ 60px (CSS `min-width/min-height` + 투명 여백). 실기기에서 잰다
- ⬜ FR-WK-03-15: match 짝 3쌍 이상 — 출제 쪽(FE-AD-04 `content.js` 검사)에서 막는다. 화면 코드는 바뀌지 않는다
- 하지 않음: 응답 시간 기록 (FR-WK-03-09, P-5)
- 시험: `test-quiz.js`에 FR-12·13 케이스, `test-content.js`(또는 기존 출제 시험)에 2쌍 거부 케이스 추가

### FE-WK-04 · 위험요소 신고 ✅
- 파일: `src/worker/report.html`·`report.js`
- 쓰기: `reports = {ticket, equipment, hazard, memo, at, status}` — **식별값 금지** (`test-worker.js`가 검사)
- 음성 받아쓰기: 브라우저 인식 서버 호출(알려진 예외) — 화면에 고지
- ⬜ 사진·회신: SPEC-BE §3 (판매 단계)

### FE-WK-05 · 현장 소통 ✅
- 파일: `src/worker/talk.html`·`talk.js` · 데이터 `posts`
- 이름 감추기 → `author: ''` 저장, 되돌릴 수 없음 확인 대화
- ⬜ FR-WK-05-09: 화면 머리에 "여기 글은 안전 지시가 아닙니다"를 i18n 키로 표시 (6개 언어)
- ⬜ 자동 번역: 작업자앱에서 AI를 부르지 않는다. 관리자앱에서 번역해 데이터로 내리는 방식만 (D-002)

### FE-WK-06 · 마이페이지 ✅
- 파일: `src/worker/my.html`·`my.js` · 쓰기: `accounts.lang`(값만), `prefs`
- 이력: 거르기·결과순 정렬 없음 (P-4). 복기: 위험유형 그림 먼저 + 읽어 주기
- ⬜ FR-WK-06-09: 이력 상태를 증빙(`proof.js` 83~95행)과 같은 3가지 — 이수 · 미통과 · 미수강 — 글자·아이콘으로 맞춘다

---

## 2. 관리자앱

### FE-AD-01 · 사업장 등록 ✅
- `src/admin/setup.html`·`setup.js` · 가드 `admin` · `setup` 읽기·쓰기, 바뀔 때마다 전체 다시 그림 · 내보내기/불러오기 `Store.exportAll/importAll`
- ⬜ FR-AD-01-07 (연결): 가입 화면에 사업장 식별번호 칸(선택). 번호가 담당자 등록 명단과 맞으면 같은 노동자로 잇는다. 둘 중 하나만 있어도 수강은 된다 (지금 동작 유지)

### FE-AD-02 · 문구 라이브러리·검수 ✅ (+ ⬜ FR-AD-02-09)
- `src/admin/library.html`·`library.js` · 가드 `operator` · `review.js` 사용 (`diffWords`, `negationFlipped`, `newWordCount`)
- 언어별 판정 `translations[code].status`; 새 문구 `status:'waiting'` 고정 (`library.js` 813행); 오역 신고 즉시 `stopped`
- ⬜ FR-AD-02-09 판정 기록: `translations[code].judged = {by: userId, at}` 추가 제안 — `store.js` 계약 주석부터 고친다 (09-handover §4.2)

### FE-AD-03 · AI 번역·검수 에이전트 🔶 ★ 해커톤 CodeGen 1순위
**위치**: `library.js` 문구 카드 안 (새 화면을 만들지 않는다). 새 파일 `src/assets/agent.js`(브라우저 루프, D-006 A안 기준).

**상태 기계 (언어마다)**
```
 idle ─(AI 번역 받기)─► translating ─► backtranslating ─► comparing ─┬─ ok ─────────────► done(waiting)
                                                                     └─ flipped ─► retry(n<2) ─► translating
                                                                                  └─ n=2 ───► escalated(waiting)
 어느 단계든 오류·시간 초과 ─► failed ─► 손 입력 칸 표시 (FR-AD-03-07)
```

**모듈 `Agent` (`assets/agent.js`, IIFE)**
| 함수 | 입력 | 출력 | 규칙 |
|---|---|---|---|
| `Agent.run(phrase, langs, onStep)` | 문구, 대상 언어 배열(이미 `reviewed`인 언어 제외 — FR-15), 진행 콜백 | `Promise<{[code]: {text, back, flipped, tries, escalated, error}}>` | 언어별 병렬, 언어 안에서는 순차 |
| `Agent.call(path, body, ms)` | `/api/translate` 등, JSON, 시간 상한 | `Promise<json>` | `fetch` + `AbortController`. 응답 JSON 모양 검사, 실패 시 throw |
| `Agent.compare(ko, back)` | 원문, 역번역 | `{flipped, newWords}` | `Review.negationFlipped`, `Review.newWordCount` 재사용 (`Review.compare()`는 없다) |

**저장**: 결과를 `Store.library.update`로 `translations[code] = {text, back, status:'waiting', agent:{tries, flipped, escalated, model, at}}`. **`status`는 응답과 무관하게 코드에서 `'waiting'` 상수로 넣는다** (FR-06).

**화면 요소** (1회차 시안 `AD-03 … 결과 판정`)
| 요소 | 동작 |
|---|---|
| 경계 배너 | 항상 표시: "AI는 번역 초안·역번역·대조까지 · 승인은 사람 · AI 결과는 대기" |
| [AI 번역 받기] | 오프라인이면 비활성 + "인터넷이 있어야 합니다" (조용히 숨기지 않음). `file://`로 열었으면 `API_BASE`(배포 주소)로 부른다 — 현장 시연용 ([A02 §6.2](A02_기술-개발-명세서.md), C06 D-019) |
| 진행 줄 | 단계별 칩 5개, 언어별 진행 표시 (FR-08) |
| 언어 행 | 번역문 · 역번역 · 대조(✓/✕) · 시도 n/3 · 상태 배지 · [승인][중지] |
| 올림 행 | 붉은 바탕, [승인] 대신 [직접 입력] (FR-14) |
| 실패 안내 | "AI 번역을 받지 못했습니다 — 아래 칸에 직접 입력하세요" + 기존 입력 칸 |
| 출력 표시 | 모든 AI 문자열은 `textContent`로만 (FR-11) |

**상한**: 호출 시간 상한 15초(결정), 재시도 2회, 문구 1개당 호출 ≤ 언어 수 × 2 × 3.

**시험** — 새 `tests/test-agent-boundary.js` (가짜 `fetch`로 AI를 부르지 않는다)
| 케이스 | 가짜 응답 | 기대 | AC |
|---|---|---|---|
| 정상 | 번역·역번역 정상 | `waiting` 저장 | AC-AD-03-01, STC-E16-001 |
| 완료 시도 | 응답에 `status:'reviewed'` | 무시, `waiting` | STC-E16-002 |
| 악성 출력 | `<script>` 포함 | 글자로만 표시 | STC-E16-003 |
| 실패·지연 | reject / 시간 초과 | 손 입력 칸 표시 | STC-E19-002 |
| 항상 뒤집힘 | 역번역에 "~해도 됩니다" | 3회 뒤 `escalated` | STC-E19-003 |
| 키 노출 | `src/` 전체 검색 | 키 패턴 0건 | STC-E19-001 |
| 기존 회귀 | — | 1,619건 통과 | AC-AD-03-06 |

### FE-AD-04 · 교육 만들기·발급 ✅
- `src/admin/content.html`·`content.js` · 마법사 5단계, 검수 완료 문구만, `qr.js`(바이트 모드·EC M) · 발급 후 문항은 `retired` + 새로 붙이기만
- FR-AD-04-04 (기존 동작 명확화): 번역 없는 언어가 있으면 목록으로 경고하고 **발급은 허용** (번역 없음 ≠ 중지, 249~293행)
- ⬜ FR-WK-03-15: match 짝 검사 기준을 2쌍 → 3쌍으로 (683행)

### FE-AD-05 · 대시보드·재교육 ✅
- `src/admin/dashboard.html`·`dashboard.js` · 정보 위계: 언어×위험유형 막대 최대 · 필수 문장 3개 · `orders` 쓰기(해소는 저장 안 함)
- ⬜ FR-AD-05-10: 막대마다 응답 인원 "n명". n < 3이면 "인원이 적어 개인이 드러날 수 있습니다" 표시. 숨기지는 않는다 (외부 보고의 5명 기준과 다름)

### FE-AD-06 · 교육 증빙 ✅
- `src/admin/proof.html`·`proof.js` · 쓰는 키 없음 · `window.print()` + `@media print` · 범위 밖 건수 표기
- FR-AD-06-10 ✅: 사람별 결과 3가지 이수 · 미통과 · 미수강 (83~95행) — FE-WK-06 FR-09가 같은 이름을 쓴다

---

## 3. 공통

### FE-CM-01 · 계정·로그인 ✅
- `src/index.html`·`signup.html`, `assets/auth.js`·`login.js`·`signup.js` · `Auth.require(role)` · `?next=` 검증 후 이동 · 목업 고지
- ⬜ FR-CM-01-08: 로그인·가입 화면 머리에 언어 6개 선택 + 읽어 주기. 로그인 전이라 기기 단위 `prefs.lang`에 둔다
- ⬜ FR-CM-01-09: `?next=`가 교육 링크(QR)면 "로그인하면 「교육명」이 바로 열립니다" 표시. 교육명은 `courses`에서 `textContent`로
- ⬜ 서버 인증으로 바꿀 때: `Auth` 내부만 `/api/auth/*` 호출로 교체 (SPEC-BE §3). 화면 코드는 그대로

### FE-CM-02 · 다국어·접근성·오프라인 ✅
- `i18n.js`(6개 언어), `ui.js`(음성·배지), `icons.js`(선 아이콘, 이모지 금지 — `test-icons.js`), `sw.js`
- 글꼴 (결정): 기기 글꼴에 맡긴다. HC-5 실기기 확인에서 크메르·태국·데바나가리가 깨지면 Noto 글꼴을 `src/` 안에 배포한다 (외부 요청 0건 유지)

---

## 4. CodeGen에 넘기는 순서 (⑥ 준비)

1. **FE-AD-03** + SPEC-BE §2 (해커톤 핵심) — `/api` 배치(SPEC-BE §1)만 미정. 루프는 A안 기본
2. FE-AD-02 FR-09 판정 기록 (AD-03과 같은 `library` 계약 변경이라 함께)
3. FE-WK-01 FR-06 오역 신고 (기존 `flags[]` 재사용 — 계약 변경 없음)
4. FE-WK-03 FR-12·13·14 + FE-AD-04 match 3쌍
5. 문구만 바뀌는 묶음: FE-WK-02 FR-10, FE-WK-05 FR-09, FE-WK-06 FR-09, FE-AD-05 FR-10, FE-CM-01 FR-08·09
6. FE-AD-01 FR-07 식별번호 연결 (가입 데이터가 바뀌어 마지막)

> CodeGen 프롬프트에는 이 문서의 해당 절 + PRD §4·§8 + 공통 규칙 §0 + C05 §2(넘지 않는 선)를 함께 넣는다. 생성된 코드는 C04 §4 DoD를 통과해야 머지한다.

---

## 제·개정 이력

| 버전 | 날짜 | 작성자 | 내용 |
|---|---|---|---|
| 0.1 | 2026-10-22 | byeonsoyun | 최초 작성 (PRD 14개 + 코드 확인) |
| 1.0 | 2026-10-22 | byeonsoyun | Figma 2회차 반영(FR 추가 반영), 제안을 결정으로 닫음, CodeGen 순서 6단계로 확정 |
| 1.0.1 | 2026-10-23 | byeonsoyun | 운영 공지(현장 시연 = 제출 HTML `file://`) 반영: [AI 번역 받기]를 `file://`에서도 `API_BASE`로 쓰게 함 |
