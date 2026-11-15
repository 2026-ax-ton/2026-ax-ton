# 실측용 설비 사진 — 출처와 라이선스

2026-11-09 Wikimedia Commons 에서 받은 **자유 이용 사진**이다 (긴 변 1280px 축소본). 사용자 설비 사진이 없어 실측(S3 사진 위치)에만 쓴다.
실제 교육·시연에 쓸 때는 사용자 현장 사진으로 바꾼다. CC BY-SA 사진을 고쳐 다시 배포하면 같은 라이선스를 따라야 한다.

| 파일 | 쓰는 곳 | 원본 | 작가 | 라이선스 | 메모 |
|---|---|---|---|---|---|
| `gap-press-clutch.jpg` | 기계 1 C형 프레스 **주 사진** | [Part Revolution Clutch System on modern Gap Frame Press](https://commons.wikimedia.org/wiki/File:Part_Revolution_Clutch_System_on_modern_Gap_Frame_Press.jpg) | Sam D. Wilbur | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | 실제 현장 · C형(갭) 프레임 · 금형부·광전자식 안전장치 보임 · 사람 없음. ⚠️ **기계식(링크)** 프레스다 — 유압 고유 위험(호스·배관)은 이 사진에 없다 |
| `gap-press-row.jpg` | 기계 1 보조 | [Modern Day Gap Frame Presses](https://commons.wikimedia.org/wiki/File:Modern_Day_Gap_Frame_Presses.jpg) | Sam D. Wilbur | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | 제품 사진(배경 흰색) · 가드·양수 조작반 보임 · 사람 없음 |
| `injection-bimaterial.jpg` | 기계 2 횡형 사출성형기 **주 사진** | [Bi material molding machine](https://commons.wikimedia.org/wiki/File:Bi_material_molding_machine.jpg) | Cjp24 | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | 횡형 전체 · 안전문·형체부·사출부·호퍼·비상정지 보임 · 사람 없음 |
| `injection-rohini.jpg` | 기계 2 보조 | [Injection moulding machine](https://commons.wikimedia.org/wiki/File:Injection_moulding_machine.jpg) | Rohini | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | 실제 현장 · 어둡다 · 사람 없음 |
| `injection-arburg.jpg` | **사람 감지 검사용** (교육에 안 씀) | [Arburg-swiss plastic 2026](https://commons.wikimedia.org/wiki/File:Arburg-swiss_plastic_2026.jpg) | Bricetofly | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) | 왼쪽 끝에 **사람이 일부 찍혀 있다** → FR-20(사람 찍히면 지점 0개)을 실물로 확인하는 데 쓴다 |

받지 않은 것: 흐린 동영상 캡처 1장, 도식(그림) 1장 — 실측에 맞지 않아 지웠다. 유압식 C형 프레스 자유 이용 사진은 찾지 못했다.

## 이 사진에서 만든 파일 (2026-11-15 합치기 때 적음)

`research/runs/*_boxes.jpg` 는 위 사진 위에 박스를 그린 **2차 저작물**이다.
원본이 CC BY-SA 면 이 파일도 **같은 라이선스 · 같은 출처 표기**로만 다시 쓸 수 있다
(이 표가 그 표기다). 공개 저장소에 올라가 있는 것도 그래서 괜찮다.
제출본·발표 자료에 넣을 때는 작가 이름과 라이선스를 화면에 같이 적는다.

---

## 규칙 — AI 조사가 찾아 온 참고 사진은 저장소에 두지 않는다 (2026-11-15)

위 표의 Wikimedia 사진과 달리, **AI 조사(`/api/research`)가 웹에서 찾아 오는 참고 사진은
남의 저작물이고 이용 조건을 모른다.** 그래서 어디에도 남기지 않는다.

| 어디 | 어떻게 |
|---|---|
| 제품 (설비·교육) | 저장하지도 발급하지도 않는다. 화면에서 「실제 설비 사진 아님 · 이용 조건: 확인 필요」로 구분해 보여 주기만 한다 |
| 실측 기록 (`research/runs/*.json`) | **출처(`page`·`host`·`alt`)만 남기고 그림(`data`)은 뺀다.** 원본은 `page` 주소에 있다 |

**2026-11-15 — 실제로 한 번 올라갔다.** `2026-11-10_c-press_v3-img.json`(1장)과
`2026-11-10_injection-molder_v4.json`(3장)에 `miis.kosha.or.kr` ·
`yushinamerica.com` · `advancedchemsolutions.com` 의 사진이 통째로 박힌 채
**공개 저장소에 들어가 있었다** (합치기 때 따라 들어온 것을 못 걸렀다). 그림만 빼고 출처는 남겼다.

★ 지금은 `tests/test-no-secrets.mjs` 가 막는다 — `page`·`host` 가 붙은 `data:image` 가
저장소의 json 에 있으면 검사가 깨진다. 다시 섞여 들어오면 합치는 단계에서 걸린다.

⚠️ **git 이력에는 남아 있다.** 지금 시점에서 지웠을 뿐, 과거 커밋에는 그대로 있다.
완전히 없애려면 이력을 다시 쓰고 강제 push 를 해야 하는데 팀 저장소 규칙상 금지다
(`--force` 금지). 이력까지 정리하려면 팀 합의가 먼저다.
