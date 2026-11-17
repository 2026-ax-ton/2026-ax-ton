# 보호 규칙 원본 — 지워졌을 때 이걸로 되돌린다

`develop`·`main` 에 걸린 보호 규칙의 **정의 그대로**입니다 (C06 D-049 · D-051).

## 왜 파일로 두나

규칙은 GitHub 설정 화면에만 있어서, **관리자가 실수로 끄거나 지우면 무엇이 있었는지 아무도 모릅니다.**
2026-11-17 에 관리자를 두 명으로 늘리면서(byeonsoyun · yesol) 같이 넣었습니다.
여기 있는 파일이 그 시점의 정답입니다.

## 지금 걸려 있는 것

| | `develop` | `main` |
|---|---|---|
| 직접 push | 막음 (PR 필수) | 막음 (PR 필수) |
| 승인 필요 인원 | **0명** | **0명** |
| 검사 `run-all` 통과 | **필수** | **필수** |
| `develop` 최신 상태 필수 | **예** | 아니오 |
| 브랜치 삭제·강제 push | 막음 | 막음 |
| **관리자 우회** | **없음** | **없음** |

★ **관리자도 우회하지 못합니다.** 규칙이 모두에게 똑같이 걸립니다 — 관리자가 두 명이 되었기 때문이고,
   관리자 본인이 실수로 `main` 에 직접 올리는 일(2026-11-16 에 실제로 있었습니다)도 함께 막습니다.

## 되돌리는 법

규칙 id 는 `develop` = `27385524`, `main` = `24105759` 입니다.

```bash
# 내용이 바뀌었을 때 — 덮어쓴다
gh api --method PUT repos/2026-ax-ton/2026-ax-ton/rulesets/27385524 \
  --input .github/rulesets/develop.json
gh api --method PUT repos/2026-ax-ton/2026-ax-ton/rulesets/24105759 \
  --input .github/rulesets/main.json

# 통째로 지워졌을 때 — 새로 만든다 (새 id 가 생기므로 이 문서의 id 를 고친다)
gh api --method POST repos/2026-ax-ton/2026-ax-ton/rulesets \
  --input .github/rulesets/develop.json

# 지금 상태 확인
gh api repos/2026-ax-ton/2026-ax-ton/rulesets \
  -q '.[] | "\(.id) \(.name) \(.enforcement)"'
```

## 고칠 때

설정 화면에서 바꿨으면 **이 파일도 같이 고쳐 주세요.** 두 곳이 어긋나면 되돌릴 기준이 사라집니다.
