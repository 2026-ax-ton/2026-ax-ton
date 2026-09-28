# 개발 문서

이주노동자 안전교육 이해도 검증 플랫폼 — 팀 개발 문서입니다.

**코드나 깃허브를 잘 몰라도 됩니다.** 아래 순서대로만 따라오시면 됩니다.

---

## 어떤 상황에 무엇을 읽나요

| 상황 | 읽을 것 |
|---|---|
| **이 프로젝트가 뭔지 처음부터 끝까지 알고 싶습니다** | [08-overview.md](08-overview.md) — **전체 설명 한 문서** ★ |
| **나 뭐 하면 되죠?** | [07-next-tasks.md](07-next-tasks.md) — 다음 할 일 ★ |
| **개발을 이어받습니다 / 며칠 만에 다시 옵니다** | [09-handover.md](09-handover.md) — **인계 문서** ★ 구조 · 데이터 계약 · 작업 리듬 · **함정 모음** |
| **손으로 직접 확인해 보려 합니다** | [10-checklist.md](10-checklist.md) — **체크리스트** ★ 성공/실패 케이스 · 경계 · 시연 코스 |
| **발표를 준비합니다** | [presentation/](presentation/README.md) — **발표 폴더** ★ 평가지표 8칸 대조 · 왜 이 문제인가 · 차별점 · Claude 활용 · 대본 · 예상 질문 |
| **발표팀인데 개발자가 아닙니다** | [발표-인계/](발표-인계/README.md) — **개발자가 발표팀에 넘기는 것** ★ 사업자 관점 · 아키텍처 그림 · **최신 숫자** · 촬영 대본 · PPT 대조 · 개발 질문 답변 |
| **해커톤(11월 말) AI Agent 를 붙이려 합니다** | [12-hackathon-agent-plan.md](12-hackathon-agent-plan.md) — **전부 "후보"** ★ 주제·평가표 공지 전까지 코드를 쓰지 않습니다 |
| 발표 근거 원본 (더 자세함) | [11-evaluation.md](11-evaluation.md) — 자체 평가 · 시장조사 · **출처 링크 15건** |
| **오늘 처음입니다** | [00-getting-started.md](00-getting-started.md) — 설치부터 첫 화면까지 |
| **화면별 요구사항** | [02-positions.md](02-positions.md) — 팀 시절 기록이지만 내용은 유효 |
| **이 프로젝트가 뭐죠?** | [01-project-map.md](01-project-map.md) — 폴더 · 데이터 · 화면 전체 지도 |
| **오늘 한 일을 남깁니다** | [04-devlog.md](04-devlog.md) — 개발일지 쓰는 법 |
| **무엇이 먼저죠?** | [06-feature-priority.md](06-feature-priority.md) — 필수 / 사용성 / 향후 3층 |
| **뭔가 막혔습니다** | [05-troubleshooting.md](05-troubleshooting.md) — 충돌 · push 실패 · 화면이 안 뜸 |
| **화면을 새로 안 만들고 싶습니다** | [mockups/README.md](mockups/README.md) — 기획 시안 옮겨 오는 법 |

> **★ 2026-08-21 — 개인 개발로 전환됐습니다.**
> 포지션(P1~P4) 구분이 없어졌습니다. [07-next-tasks.md](07-next-tasks.md) 하나만 보시면 됩니다.
> [02-positions.md](02-positions.md) 와 [03-prompts.md](03-prompts.md) 는 팀 시절 기록입니다.

---

## 처음이라면 이 순서

1. **[00-getting-started.md](00-getting-started.md)** 를 위에서부터 그대로 따라 합니다 (한 번만)
2. Claude Code 를 열고 **"나 뭐 하면 되는지 알려줘"** 라고 씁니다

끝입니다. 브랜치를 보고 내 포지션을 알아내서, 지금 상태와 다음 할 일을 알려 줍니다.
문서를 미리 읽지 않아도 됩니다.

**팀원에게 이 프로젝트를 설명해야 하면** → [08-overview.md](08-overview.md) 하나면 됩니다.
무엇을 만들었고 · 무엇이 되고 안 되고 · 데이터와 배포가 어떻게 돌아가고 ·
서버를 붙이면 어떻게 되는지까지 전부 들어 있습니다.

더 알고 싶으면 — [07-next-tasks.md](07-next-tasks.md) 할 일 목록 ·
[06-feature-priority.md](06-feature-priority.md) 우선순위 3층 ·
[01-project-map.md](01-project-map.md) 전체 지도

---

## 알아두면 좋은 것

**git 명령어를 직접 칠 필요가 없습니다.**
저장소에 [`CLAUDE.md`](../CLAUDE.md) 가 있어서 Claude Code 가 자동으로 읽습니다.
작업을 시작하면 알아서 최신 코드를 받아오고, 한 덩어리가 끝나면 알아서 저장하고 올립니다.
개발일지도 알아서 적어 줍니다.

**PR 이 없습니다.** `feature/byeonsoyun` 에 올리고, 덩어리가 끝나면 `develop` 에 머지합니다.

**빌드가 없습니다.** `npm install` 같은 건 안 합니다.
`src/index.html` 을 더블클릭하면 그게 바로 화면입니다.

---

## 폴더

```
2026-ax-ton/
├── CLAUDE.md        Claude Code 가 자동으로 읽는 규칙
├── docs/            지금 보고 계신 곳
│   └── devlog/      각자의 개발일지
├── git-rules/       팀 git 규칙 원본
└── src/             ★ 실제 코드
```

---

## 그 밖에 여기 있는 것

| 파일 | 무엇 |
|---|---|
| `평가지표.png` | **Campus AX-Ton 아이디어톤 평가항목** (문제정의 20 · AI활용 20 · 해결방식 30 · 실행력·발표 30) |
| `mockups/` | 기획 시안. 실제 화면과 대조한 결과는 `07-next-tasks.md` 의 B4 에 있습니다 |
