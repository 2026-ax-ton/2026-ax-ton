/* 공식 문서 목록 — **사람이 원문으로 확인한** 공식 기준 문서와 그 안의 주의사항 (PRD-AD-08 S2).

   밑줄로 시작하는 파일은 Vercel 이 경로로 잡지 않는다. 이 파일은 함수가 아니다.

   ★ 2026-11-09 사용자 결정 — 「공적인 문서는 1차적으로 가장 지켜져야 한다.」
     AI 조사는 두 번 다 KOSHA M-30-2002 를 못 찾았고(한 번은 틀린 번호 M-122-2012 를 적었다)
     「가드 재전환」(§7.2)을 놓쳤다. 그래서 확인된 공식 문서 항목은 AI 에게 맡기지 않고
     **결과 맨 앞에 고정**한다. AI 는 그 뒤를 보충한다.
   ★ 여기에는 원문(표지·본문)을 직접 열어 확인한 것만 넣는다. 근거: research/gold/*.json 의
     `checked: '원문'` 항목 · docs/infos/09_AI교육자동생성/2026-11-09_기계조사-결과.md.
     tests/test-api-research.mjs 가 gold 와 대조한다 — 어긋나면 검사가 깨진다.
   ★ 새 기계 종류를 넣을 때도 같은 절차(조사 규칙 md)로 원문을 확인한 뒤에만 더한다. */

export const MAX_OFFICIAL_ITEMS = 8;   // 한 설비에 붙는 공식 항목 상한 (지금 가장 많은 것: 사출 OPS 8)

const M30_URL = 'https://www.moel.go.kr/local/busanbukbu/common/downloadFile.do?file_seq=21171050364&bbs_seq=62551&bbs_id=LOCAL5';
const OPS_INJ_URL = 'https://esafetykorea.or.kr/js/smarteditor2-2.8.2.3/files/20240228090646_170907880643465de79166a246_Name=%5B2023-%EA%B5%90%EC%9C%A1%ED%98%81%EC%8B%A0%EC%8B%A4-859%5D%20%5B2023-%EA%B5%90%EC%9C%A1%ED%98%81%EC%8B%A0%EC%8B%A4-859%5D%20%EC%82%AC%EC%B6%9C%EC%84%B1%ED%98%95%EA%B8%B0_OPS_%EA%B7%BC%EB%A1%9C%EC%9E%90.pdf';

export const OFFICIAL_DOCS = [
  {
    match: /프레스/,
    code: 'M-30-2002',
    title: 'KOSHA CODE M-30-2002 프레스 방호장치의 선정·설치 및 사용 기술지침',
    publisher: '한국산업안전공단',
    year: 2002,
    url: M30_URL,
    host: 'moel.go.kr',
    items: [
      { gold: 'g1', section: '§5.1·§6.5', part: '가드 측방·상방·하방', hazard: 'pinch', risk: '가드 옆·위·아래로 손을 넣으면 금형 사이에 끼인다' },
      { gold: 'g3', section: '§7.2', part: '가드 재전환', hazard: 'pinch', risk: '가드를 열고 임시 조작한 뒤 제자리로 돌리지 않고 작업을 다시 시작하면 끼인다' },
    ],
  },
  {
    match: /사출/,
    code: '2023-교육혁신실-859',
    title: 'OPS 사출성형기 작업안전 (고용노동부·안전보건공단 근로자용 교육자료)',
    publisher: '고용노동부·안전보건공단',
    year: 2023,
    url: OPS_INJ_URL,
    host: 'esafetykorea.or.kr',
    items: [
      { gold: 'g1', section: '위험요인', part: '금형 사이 (제품 취출)', hazard: 'pinch', risk: '제품을 꺼내다 금형 사이에 손이 끼인다' },
      { gold: 'g2', section: '위험요인', part: '이젝터와 금형 사이', hazard: 'pinch', risk: '점검 중 이젝터와 금형 사이에 신체가 끼인다' },
      { gold: 'g3', section: '위험요인', part: '분쇄기', hazard: 'pinch', risk: '분쇄기 스크랩을 제거하다 손가락이 감긴다' },
      { gold: 'g4', section: '사고사례', part: '안전문 연동장치', hazard: 'pinch', risk: '안전문 연동장치(리미트 스위치)를 무효화하고 작업하다 끼인다 (실제 사고)' },
      { gold: 'g5', section: '안전점검표', part: '가열 실린더 히터', hazard: 'fire', risk: '히터 방호덮개가 없으면 고온부에 화상' },
      { gold: 'g6', section: '안전점검표', part: '노즐 충전부', hazard: 'shock', risk: '노즐 충전부에 절연캡이 없으면 감전' },
      { gold: 'g7', section: '안전점검표', part: '수리·점검 (전원)', hazard: 'pinch', risk: '전원 차단·잠금·「작업중」 표시 없이 점검하면 갑자기 움직여 끼인다' },
      { gold: 'g8', section: '안전점검표', part: '비상정지 버튼', hazard: 'pinch', risk: '비상정지 버튼이 작동하지 않으면 사고를 멈출 수 없다' },
    ],
  },
];

/** 설비 이름에 맞는 공식 문서 — 이름 낱말로만 맞춘다 (제조사·모델명은 보지 않는다) */
export function officialFor(eq, docs = OFFICIAL_DOCS) {
  const name = String((eq && eq.name) || '');
  return docs.filter((d) => d.match.test(name));
}
