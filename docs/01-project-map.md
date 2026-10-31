# 01. 프로젝트 지도

무엇을 만드는지, 파일이 어디 있는지, 데이터가 어떻게 오가는지 한 장에 모았습니다.
**막히면 여기로 돌아오세요.**

---

## 무엇을 만드나

**이주노동자 안전교육 이해도 검증 플랫폼.**

중대재해처벌법이 50인 미만 사업장까지 확대됐고 제조 현장의 이주노동자도 늘었는데,
재해는 줄지 않습니다. 안전 정보가 노동자에게 전달되는 방식이 그대로이기 때문입니다.

> **교육 완료의 기준이 출석부 서명입니다.
> 서명은 참석의 증거일 뿐, 이해의 증거가 아닙니다.**

### 사용자 두 명

**입국 3개월 차, 크메르어를 쓰고 프레스 공정에서 일합니다.**
한국어 교육을 들었지만 이해하지 못했고, 모른다고 하면 불이익이 있을까 봐 묻지 않습니다.

**40인 공장 생산팀장이자 안전 업무 겸직 담당자입니다.**
5개 국어를 쓰는 노동자 12명을 교육해야 하는데, 시간이 없어 한국어 자료를 읽고 서명을 받습니다.

### 한 줄 정리

> **이해했는지 확인되지 않으면 교육이 끝나지 않는 시스템.**
> 사업주가 원하는 증빙과 노동자에게 필요한 진짜 교육을 같은 절차 하나에 묶었습니다.

---

## 기능 9개와 화면 11개

로그인에서 역할이 갈리고, 그 뒤로 두 갈래가 서로 만나지 않습니다.

### 노동자 (`src/worker/`)

글자를 읽지 않고 완주할 수 있어야 하는 화면입니다.

| 화면 | 기능 | 파일 | 담당 |
|---|---|---|---|
| 홈 | — | `worker/home.html` `.js` | P2 |
| 안전교육 수강 | 기능3 | `worker/learn.html` `.js` | P1 |
| **이해도 검증** | **기능4** | `worker/quiz.html` `.js` | P1 |
| 위험요소 신고 | 기능8 | `worker/report.html` `.js` | P2 |
| 현장 즉시 소통 | 기능7 | `worker/talk.html` `.js` | P2 |
| 마이페이지 | — | `worker/my.html` `.js` | P2 |

### 담당자 · 운영자 (`src/admin/`)

전담 안전관리자가 없는 50인 미만 사업장에서 생산팀장이 안전 업무를 겸직하는 상황을 전제합니다.
증빙 작성 시간을 실제로 줄이는 것이 도입의 유일한 현실적 유인입니다.

| 화면 | 기능 | 파일 | 담당 |
|---|---|---|---|
| 사업장 · 설비 등록 | 기능1 | `admin/setup.html` `.js` | P1 **(완료)** |
| 담당자 대시보드 | 기능6 | `admin/dashboard.html` `.js` | P3 |
| 교육 콘텐츠 생성 · 승인 | 기능2 | `admin/content.html` `.js` | P3 |
| 교육 증빙 생성 | 기능5 | `admin/proof.html` `.js` | P4 |
| 안전 문구 라이브러리 | 기능9 | `admin/library.html` `.js` | P4 |

### 발표에서 말하는 핵심 3개

1. **현장 맞춤 다국어 안전교육 생성** (기능2) — AI 는 문구를 새로 쓰지 않고, 사람이 검수한 라이브러리에서 고르기만 합니다
2. **문해력 독립 이해도 검증** (기능4) — 이 제품의 심장. 통과하지 못하면 교육 완료로 기록되지 않습니다
3. **법정 교육 증빙 자동 생성** (기능5) — 증빙 작성 시간이 2시간에서 5분으로

---

## 폴더 구조

```
2026-ax-ton/
├── CLAUDE.md                Claude Code 가 자동으로 읽는 규칙
├── docs/                    개발 문서 (지금 이 폴더)
│   ├── devlog/              각자의 개발일지
│   └── mockups/             옮겨 오면 되는 정적 화면 (기획 시안)
├── git-rules/GIT.md         팀 git 규칙 원본
└── src/                     ★ 실제 코드. 여기만 고칩니다
    ├── index.html           로그인 — 여기서 역할이 갈린다
    ├── signup.html          회원가입
    ├── assets/              ★ 공용. 고치기 전에 팀에 알릴 것
    │   ├── store.js           데이터 계층 — 두 팀의 계약
    │   ├── auth.js            로그인 · 세션 · 화면 가드
    │   ├── ui.js              배지 · 칩 · 목록 · 토스트
    │   ├── seed.js            예시 데이터
    │   ├── login.js           로그인 화면 로직
    │   ├── signup.js          회원가입 화면 로직
    │   ├── app.css            공통 컴포넌트
    │   ├── style.css          토큰 · 버튼 · 배지 · 폼
    │   └── style-admin.css    adminbar · sec-head · kpi · btn-sm · tabbar
    ├── worker/              ★ 노동자 팀 (P1 · P2)
    │   ├── worker.css
    │   └── home / learn / quiz / report / talk / my  (.html + .js)
    └── admin/               ★ 관리자 팀 (P3 · P4)
        ├── admin.css
        └── setup / dashboard / content / proof / library  (.html + .js)
```

### 이 구조를 지탱하는 규칙 하나

> **1화면 = HTML 1개 + JS 1개, 주인은 1명.**

네 명이 부딪히지 않는 이유의 전부입니다.
같은 파일을 두 사람이 열지 않으니 충돌이 날 자리가 없습니다.

**`src/assets/` 만 네 명이 함께 씁니다.** 여기를 고쳐야 하면 팀에 먼저 말하세요.
자기 트랙에만 필요한 스타일은 `src/worker/worker.css` 또는 `src/admin/admin.css` 에 쓰면 됩니다.

---

## 데이터 — 두 팀이 만나는 유일한 지점

코드는 나뉘어도 데이터는 하나입니다.
**화면 코드는 `localStorage` 를 직접 부르지 않습니다.** 반드시 `Store` 를 거칩니다.
나중에 서버가 생기면 `src/assets/store.js` 하나만 바꾸면 되기 때문입니다.

| 저장소 | 쓰는 쪽 | 읽는 쪽 |
|---|---|---|
| `Store.accounts` | 회원가입 | 로그인 |
| `Store.session` | 로그인 | 모든 화면(가드) |
| `Store.setup` | 관리자 기능1 | 노동자 전부 · 관리자 전부 |
| `Store.library` | 운영자 기능9 | 관리자 기능2 · 노동자 기능3 |
| `Store.courses` | 관리자 기능2 | 노동자 기능3·4 |
| `Store.progress` | 노동자 기능3·4 | 관리자 기능5·6 |
| `Store.reports` | 노동자 기능8 | 관리자 기능6 |
| `Store.posts` | 노동자 기능7 | 노동자 기능7 |

### 쓰는 법

저장소마다 `load()` `save(data)` `update(fn)` `updatedAt()` `clear()` 가 있습니다.

```js
// 읽기
var courses = Store.courses.load();
var setup = Store.setup.load();

// 읽기 → 고치기 → 저장 한 사이클
Store.progress.update(function (list) {
  list.push({
    workerId: user.userId,
    courseId: 'c-press',
    lang: 'km',
    learnedAt: new Date().toISOString(),
    quiz: { score: 100, passed: true, answers: [1, 1, 1], at: new Date().toISOString() }
  });
});

// 통째로 갈아끼우기
Store.reports.save(newList);
```

**저장 데이터의 모양을 바꾸면 다른 사람 화면이 깨집니다.** 바꾸기 전에 팀에 알리세요.

### 공통 어휘

`Store` 가 들고 있습니다. 각자 다시 만들지 마세요.

```js
Store.LANGUAGES     // 6종 — km · id · vi · ne · th · ko
Store.HAZARDS       // 6종 — 끼임 · 감전 · 화재 · 추락 · 질식 · 화학물질
Store.ICONS         // 픽토그램 10개
Store.SIZE_BANDS    // 사업장 규모 3구간
Store.ROLES         // worker · admin · operator (+ 도착 화면)
Store.PHRASE_STATUS // 검수 상태 3종 — reviewed · waiting · stopped

Store.language('km')   // → { code, name, native }
Store.hazard('pinch')  // → { code, label, icon }
Store.role('worker')   // → { code, label, landing }
Store.findBy(list, 'id', 'e-press3')
Store.uid()            // 새 id
```

### 상대 팀을 기다리지 않는 법

관리자 팀의 기능2가 아직 없어도, 노동자 팀은 개발할 수 있습니다.
`src/assets/seed.js` 가 8개 키를 전부 그럴듯한 값으로 채웁니다.

로그인 화면의 **예시 데이터 채우기** 버튼을 누르면 됩니다.
설비 3대, 문구 6개, 교육 2개, 수강 이력 3건, 신고 2건, 게시글 2건이 생깁니다.

id 는 손으로 적은 고정값이라(`e-press3` `c-press` `ph-1` …) 서로 연결이 끊기지 않습니다.

---

## 화면 가드

모든 페이지 `<head>` 에 이 세 줄이 **순서대로** 들어갑니다.

```html
<script src="../assets/store.js"></script>
<script src="../assets/auth.js"></script>
<script>Auth.require('worker');</script>
```

- 로그인 안 했으면 → 로그인 화면으로
- 역할이 다르면 → 자기 역할의 첫 화면으로

`Auth.require('worker')` / `Auth.require('admin')` / `Auth.require('operator')` /
`Auth.require(['admin', 'operator'])` 형태로 씁니다.

### 그 외 `Auth`

```js
var user = Auth.current();   // { userId, role, name, title, siteName, lang, processId } 또는 null
Auth.logout();               // 세션 지우고 로그인 화면으로
```

---

## 공용 UI 조각

`src/assets/ui.js` 에 있습니다. **각자 다시 만들면 네 화면의 디자인이 흩어집니다.**

```js
UI.$('id')                       // getElementById
UI.$$('.sel')                    // querySelectorAll → 배열
UI.el('div', 'className', '글자')  // 요소 만들기 (textContent 로 안전하게)

UI.okBadge('완료')                // ✓ 초록
UI.waitBadge('대기')              // ● 노랑
UI.stopBadge('중지')              // ! 빨강
UI.neutralBadge('미설정')          // ○ 회색
UI.phraseBadge('reviewed')       // 검수 상태 배지

UI.chip({ type: 'checkbox', name: 'lang', value: 'km', label: '크메르어', sub: 'ភាសាខ្មែរ' })
UI.checkedValues('lang')         // 체크된 값들
UI.pickedValue('proc-icon')      // 라디오로 고른 값
UI.fillSelect(select, items, getValue, getLabel)

UI.toast('저장했습니다.')
UI.emptyRow('아직 없습니다.')      // 빈 목록 안내
UI.itemRow('⚙', '프레스 3호기', '프레스 공정')

UI.fillAdminBar(user)            // 관리자 상단바 채우기
UI.fillWorkerBar(user)           // 노동자 상단바 채우기
UI.markCurrentTab()              // 하단 탭에 현재 위치 표시
UI.warnIfBlocked()               // 저장소가 막힌 환경이면 경고 띄우기
UI.formatDate(iso)
```

---

## 지켜야 할 규칙과 그 이유

문서(`PRD-safety.pdf` `SCREEN-safety.pdf`)에서 온 제약입니다. 나중에 뜯어고치면 비용이 큽니다.

| 규칙 | 왜 |
|---|---|
| **외부 요청 0건** — CDN · 웹폰트 · 외부 이미지 · npm 금지 | 인터넷 없이 `file://` 로 열려 확인이 가장 빠릅니다. 픽토그램은 `assets/icons.js` 의 선 아이콘 |
| **`innerHTML` 금지, `textContent` 만** (`UI.el` 사용) | 설비 이름 한 줄로 화면이 깨지면 안 됩니다 |
| **ES 모듈(`import`/`export`) 금지** | `file://` 에서 CORS 로 막힙니다. `var X = (function(){...})()` 형태로 |
| **색상만으로 상태를 구분하지 않는다** — 아이콘 + 글자 + 색 | 흑백으로 봐도, 색약이 있어도 뜻이 남아야 합니다 |
| **터치 타깃 60px** (노동자 화면 전면) | 장갑 낀 손으로 조작합니다. 관리자 화면은 표 안 보조 조작만 40px |
| **문해력을 전제하지 않는다** (노동자 화면) | 글자를 한 자도 읽지 않고 끝낼 수 있어야 합니다. 안내에 음성 병행 |
| **외국인등록번호 · 여권번호를 받지 않는다** | 사업장 내 식별번호로 충분합니다 |
| **위험요소 신고는 익명** | 익명성이 깨지면 신고가 멈추고, 재해 감소의 선행지표도 사라집니다 |
| **검수 완료 문구만 안전 지시로 쓴다** (`status === 'reviewed'`) | 오역이 그대로 사고가 됩니다 |
| **"면책" 표현 금지** | 증빙은 교육 실시의 기록일 뿐 법적 책임을 대신하지 않습니다 |
| **개인 점수의 인사·평가 목적 내보내기 없음** | 감시 도구가 되는 순간 제품의 전제가 무너집니다 |

---

## 저장 위치가 브라우저라서 생기는 일

**모르면 고장으로 오해합니다.**

- **오리진별로 갈립니다.** `file://` · `localhost` · `*.vercel.app` 의 데이터가 전부 별개입니다.
  로컬에서 넣은 설비가 배포 주소에 안 보이는 것은 정상입니다
- **다른 기기·다른 브라우저에서는 안 보입니다.** 발표 때 심사위원 폰으로 열면 빈 화면입니다
- **시크릿 모드나 사이트 데이터 삭제 시 사라집니다.** 발표 전에 백업하세요
  (설비 등록 화면 우측 `내보내기` → JSON 복사)
- **약 5MB 제한.** 사진을 base64 로 넣으면 몇 장 만에 찹니다.
  사진이 필요해지는 시점이 서버가 필요해지는 시점입니다

---

## 확인 방법

빌드가 없으므로 서버를 띄울 필요가 없습니다.

1. `src/index.html` 을 더블클릭
2. **예시 데이터 채우기** 누르기
3. 로그인 — 비밀번호는 전부 `1234`

| 아이디 | 역할 | 도착 |
|---|---|---|
| `W-4821-07` | 노동자 | `worker/home.html` |
| `kim@daesung.co.kr` | 담당자 | `admin/dashboard.html` |
| `oper@safety.kr` | 운영자 | `admin/library.html` |

4. 개발자도구(F12) → **Console** 에 빨간 오류가 없는지, **Network** 에 외부 요청이 없는지

---

## 참고 자료

| 무엇 | 어디 |
|---|---|
| 제품 요구사항 원문 | `보관_아이디어톤-원본/docs/PRD-safety.pdf` |
| 화면 구성 원문 | `보관_아이디어톤-원본/docs/SCREEN-safety.pdf` |
| 2분 발표 대본 | `보관_아이디어톤-원본/docs/PRESENTATION-safety.md` |
| **정적 목업 (옮겨 오면 되는 화면들)** | **`docs/mockups/`** |
| 관리자 화면 설계 메모 | `docs/mockups/ADMIN-SCREENS.md` |
| 팀 git 규칙 | `git-rules/GIT.md` |

> 위 세 개의 PDF·대본은 `projects/` 폴더에 있고 **저장소 밖입니다.** 필요하면 관리자에게 받으세요.
> 없어도 개발에는 지장이 없습니다 — 필요한 내용은 각 파일의 주석과 이 문서에 옮겨 두었습니다.
>
> **목업은 `docs/mockups/` 에 복사해 두었습니다.** 클론하면 바로 받아집니다.
> 새로 만들지 말고 그걸 옮겨 오세요 — 사용법은 [`mockups/README.md`](mockups/README.md) 에 있습니다.
