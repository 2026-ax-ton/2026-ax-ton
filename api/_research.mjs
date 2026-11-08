/* 기계 리서치 — 지시문과 **모델 출력 거르기** (PRD-AD-08 S2 · S4 일부).

   밑줄로 시작하는 파일은 Vercel 이 경로로 잡지 않는다. 이 파일은 함수가 아니다.
   바깥을 부르지 않는 순수 계산만 둔다 — 검사가 가짜 응답으로 경계를 고정한다.

   「AI 를 학습시킨다」 = 파인튜닝이 아니라 아래 넷이다 (PRD-AD-08 §7)
     1. 고정 지시문 (`systemText`)        — 역할 · 출처 우선순위 · 추측 금지 · 안전 지시 쓰기 금지
     2. 출력 모양 고정 (`cleanItems`)      — 모양이 틀린 항목은 버린다
     3. 근거 강제 (`verifySources`)        — 검색 근거(groundingMetadata)에 실제로 있는 출처만 인정
     4. 서버 판정 (`judge`)                — 6종 · 출처 수 · 출처 등급 · 충돌로 ok / check 를 매긴다

   넘지 않는 선
     · 「위험 설명」은 담당자 참고용이다. 노동자에게 가는 안전 지시 문장이 아니다 (P-1, FR-AD-08-08)
     · 출처가 충돌하면 AI 가 고르지 않는다 — 양쪽을 다 남기고 check (FR-AD-08-07)
     · 모델 출력은 믿을 수 없는 문자열이다. 여기서 HTML 을 만들지 않는다 */

import { HAZARD_CODES } from './_hazards.mjs';

/* ── 결정에 걸린 값 ─────────────────────────────────────────────────── */

export const MAX_ITEMS = 12;        // 기계 1대 주의사항 상한 — 담당자가 훑을 수 있는 양
export const MIN_SOURCES = 3;       // 이보다 적으면 결과 전체가 「자료 부족」 (FR-AD-08-04)
export const LIMITS = { overview: 400, part: 40, risk: 160, needsPhoto: 80, title: 120, conflict: 200 };

/* 출처 등급 (PRD-AD-08 §7). 숫자가 작을수록 믿는다.
   1 제조사 · 2 공공기관·법령 · 3 일반 웹(업계 전문지·현장 경험 글 포함) · 4 동영상 · 5 판매·자료 중계
   ★ 2026-11-09 사용자 결정: ok 를 공공·제조사로 좁히지 않는다 — 정보가 너무 적어진다.
     믿을 만한 곳 + 현장 경험 글은 모두 근거로 센다. 대신 판매·카탈로그·문서 중계(5)는
     제품 사양용이지 위험 근거가 아니므로 ok 에 세지 않는다 (실측에서 daara·komachine·scribd 가 섞였다)
   ★ 등급은 **서버가 도메인으로 정한다.** 모델이 「제조사 자료」라고 말해도
     블로그·위키 도메인이면 1 이 되지 않는다. */
export const PUBLIC_DOMAINS = [
  'kosha.or.kr', 'law.go.kr', 'moel.go.kr', 'go.kr', 'osha.gov', 'cdc.gov', 'hse.gov.uk', 'iso.org',
  'esafetykorea.or.kr',   // 고용노동부·안전보건공단 공식 근로자 교육자료(OPS) 게시처 (2026-11-09 사람 조사)
];
export const VIDEO_DOMAINS = ['youtube.com', 'youtu.be'];
/* 판매·카탈로그·문서 중계 — 블로그 검사보다 먼저 본다 (blog.daara.co.kr 은 판매사 블로그) */
export const SALES_DOMAINS = [
  'daara.co.kr', 'komachine.com', 'scribd.com', 'alibaba.com', 'made-in-china.com', 'ec21.com',
  'tradekorea.com', 'coupang.com', '11st.co.kr', 'gmarket.co.kr', 'auction.co.kr', 'smartstore.naver.com',
  'amazon.com', 'ebay.com', 'machinio.com', 'exapro.com',
];
export const BLOG_DOMAINS = [
  'tistory.com', 'naver.com', 'blog.', 'wikipedia.org', 'namu.wiki', 'medium.com', 'velog.io', 'brunch.co.kr',
];

/* ── 지시문 ───────────────────────────────────────────────────────────── */

/** 사람이 적은 값을 지시문에 넣기 전에 다듬는다 — 줄바꿈·따옴표로 지시를 덧붙이지 못하게 */
export function cleanField(v, max) {
  return typeof v === 'string' ? v.replace(/[\r\n"`{}<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/* 지시문 — 2026-11-09 사람 조사 규칙(docs/infos/09_AI교육자동생성/2026-11-09_기계조사-규칙.md)을 합쳤다.
   두 기계를 실제로 조사하다 걸린 함정(검색 요약의 틀린 문서번호·틀린 사고 날짜, 동명이인 모델,
   못 열린 자료를 「참고용」으로 뭉뚱그리기)을 모델에게도 똑같이 금지한다. */
export function systemText(hazardCodes = HAZARD_CODES) {
  return '너는 산업안전 자료 조사원이다. 공장 설비 한 대의 위험과 주의할 점을 공개 자료에서 찾아 정리한다.\n'
    + '조사 순서:\n'
    + 'A) 먼저 설비의 구조 방식(예: C형·O형, 횡형·수형, 유압·기계식)을 정한다. 제조사·점유율 통계는 없을 때가 많으니 구조로 좁힌다.\n'
    + 'B) 공식 기준 문서(KOSHA GUIDE, 산업안전보건기준에 관한 규칙)를 찾는다. 공식 근로자용 교육자료(OPS·한 장 자료)가 있으면 그것을 가장 먼저 쓴다.\n'
    + 'C) 공통 기준만으로 안 나오는 이 설비 고유의 위험(구조·동력 방식 때문에 생기는 것)을 따로 찾는다.\n'
    + 'D) 제조사·모델명이 있으면 그 제조사 자료를 찾되, 모델명이 같아도 제조사가 다르면 다른 제품이다.\n'
    + 'E) 현장 경험 글을 넓게 찾는다: 작업자·정비 기사·안전관리자가 직접 겪은 일을 쓴 블로그·카페·커뮤니티 글, 업계 전문지·안전 신문 기사, 사고 경험담. 공식 문서에 없어도 현장에서 실제로 다치는 곳이면 항목으로 넣는다.\n'
    + '규칙:\n'
    + '1) 반드시 검색으로 실제로 본 자료만 근거로 쓴다. 우선순위: 제조사 설명서 > 공식 교육자료·KOSHA GUIDE·법령 > 업계 전문지·현장 경험 글 > 일반 웹 > 동영상. 판매·카탈로그·문서 공유 페이지는 제품 사양을 확인하는 데만 쓰고 위험의 근거로 쓰지 않는다.\n'
    + '2) 문서 번호(예: KOSHA CODE M-30-2002)·사고 날짜·장소는 검색 요약이 틀리는 일이 많다. 자료 본문에서 확인한 것만 쓰고, 확인 못 했으면 쓰지 않는다.\n'
    + '3) 동영상은 있다는 것만 알릴 수 있다. 동영상 내용을 근거로 쓰지 않는다.\n'
    + '4) 모델명 자료를 찾지 못하면 추측하지 말고 같은 종류 설비의 일반 자료를 쓰고 general 을 true 로 한다.\n'
    + `5) 항목은 많아도 ${MAX_ITEMS}개. 항목마다 부위(part), 위험유형(hazard), 위험 설명(risk), 근거(sources)를 쓴다.\n`
    + `6) hazard 는 다음 중 하나만 쓴다: ${hazardCodes.join(', ')}. 어디에도 맞지 않으면 unknown.\n`
    + '7) risk 는 무엇이 왜 위험한지 한국어 한 문장으로 쓴다. 노동자에게 하는 지시문(~하십시오)을 쓰지 않는다.\n'
    + '8) sources 에는 실제로 본 자료의 제목(title)·주소(url)·종류(kind)만 쓴다. 주소를 지어내지 않는다. kind 는 manual(제조사), official(공공·법령), journal(업계 전문지·기사), experience(현장 경험 글), web(그 밖) 중 하나. experience 는 글쓴이가 직접 겪거나 작업한 내용일 때만 쓴다.\n'
    + '9) 자료끼리 말이 다르면 하나를 고르지 말고 conflict 에 양쪽 내용을 짧게 쓴다.\n'
    + '10) 사진으로 확인해야 할 부위면 needsPhoto 에 찍을 부위와 각도를 짧게 쓴다(예: 램과 금형 사이를 정면에서).\n'
    + '11) 열리지 않은 자료, 내용을 못 본 자료, 찾지 못한 것은 limits 에 「무엇을, 어디까지 확인했고 어디서 막혔는지」로 구체적으로 적는다. 「참고용」처럼 뭉뚱그리지 않는다.\n'
    + '12) 설명 없이 아래 모양의 JSON 하나만 출력한다.\n'
    + '{"overview": "...", "general": false, "items": [{"part": "...", "hazard": "'
    + hazardCodes[0] + '", "risk": "...", "sources": [{"title": "...", "url": "https://...", "kind": "experience"}],'
    + ' "conflict": "", "needsPhoto": ""}], "limits": ["..."]}';
}

export function userText(eq) {
  const lines = ['설비 종류·이름: ' + (eq.name || '(없음)')];
  if (eq.maker) lines.push('제조사: ' + eq.maker);
  if (eq.model) lines.push('모델명: ' + eq.model);
  if (eq.year) lines.push('연식: ' + eq.year);
  lines.push('이 설비의 위험 부위와 주의할 점을 조사하라.');
  return lines.join('\n');
}

/* ── 거르기 ───────────────────────────────────────────────────────────── */

function clip(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** 주소에서 호스트만 꺼낸다 (소문자, www 뗌). 주소가 아니면 '' */
export function hostOf(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

function endsWithAny(host, list) {
  return list.some((d) => (d.endsWith('.') ? host.indexOf(d) !== -1 : host === d || host.endsWith('.' + d)));
}

/** 출처 등급 — 도메인으로만 정한다. 1 은 「제조사 이름이 도메인에 들어 있을 때」만 */
export function tierOf(host, makerHint) {
  if (!host) return 3;
  if (endsWithAny(host, VIDEO_DOMAINS)) return 4;
  if (endsWithAny(host, PUBLIC_DOMAINS)) return 2;
  if (endsWithAny(host, SALES_DOMAINS)) return 5;
  if (endsWithAny(host, BLOG_DOMAINS)) return 3;
  const hint = String(makerHint || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (hint.length >= 3 && host.replace(/[^a-z0-9]/g, '').indexOf(hint) !== -1) return 1;
  return 3;
}

/** 출처 종류 — 등급이 도메인으로 정해지면 그것을 따르고, 일반 웹(3)일 때만 모델의 표시
 *  (업계 전문지·현장 경험 글)를 받는다. 화면에 「경험 글」로 보여 담당자가 직접 읽게 한다 */
export const KINDS = { 1: 'manual', 2: 'official', 4: 'video', 5: 'sales' };
export function kindOf(tier, modelKind) {
  if (KINDS[tier]) return KINDS[tier];
  return modelKind === 'experience' || modelKind === 'journal' ? modelKind : 'web';
}

/** 모델이 실제로 본 출처 — groundingMetadata.groundingChunks[].web.{uri,title}.
 *  ★ title 은 보통 도메인(예: kosha.or.kr)이고 uri 는 검색 경유 주소다. */
export function groundedSources(meta) {
  const chunks = meta && Array.isArray(meta.groundingChunks) ? meta.groundingChunks : [];
  return chunks
    .map((c) => c && c.web)
    .filter((w) => w && typeof w.uri === 'string')
    .map((w) => ({
      uri: w.uri,
      title: typeof w.title === 'string' ? w.title : '',
      host: hostOf(w.uri) && !/vertexaisearch|googleapis|google\.com/.test(hostOf(w.uri))
        ? hostOf(w.uri)
        : String(w.title || '').toLowerCase().replace(/^www\./, '').trim(),
    }));
}

/** 항목의 출처를 검색 근거와 맞춰 본다.
 *  ★ 모델이 적은 주소의 도메인이 검색 근거에 **있을 때만** 인정한다 — 지어낸 주소를 걸러 낸다.
 *  ponytail: 도메인 단위 대조라 같은 사이트의 다른 쪽을 지어내면 못 잡는다.
 *            더 엄격하게 하려면 groundingSupports(문장↔근거 위치)로 문장 단위 대조한다. */
export function verifySources(itemSources, grounded, makerHint) {
  const list = Array.isArray(itemSources) ? itemSources : [];
  const out = [];
  let unverified = 0;
  list.slice(0, 5).forEach((s) => {
    const host = hostOf(s && s.url);
    const hit = host && grounded.find((g) => g.host && (g.host === host || host.endsWith('.' + g.host) || g.host.endsWith('.' + host)));
    if (!hit) { unverified += 1; return; }
    if (out.some((o) => o.host === host)) return;   // 같은 사이트는 한 번만 센다
    const tier = tierOf(host, makerHint);
    out.push({ title: clip(s.title, LIMITS.title) || hit.title, url: String(s.url).slice(0, 500), host, tier, kind: kindOf(tier, s.kind) });
  });
  return { sources: out, unverified };
}

/** 모양 다듬기 + 근거 대조 + 판정을 한 번에. 돌려주는 값은 화면이 그대로 쓴다. */
export function cleanResult(raw, grounding, eq, hazardCodes = HAZARD_CODES) {
  const grounded = groundedSources(grounding);
  const dropped = { shape: 0, over: 0 };
  const items = [];
  const list = raw && Array.isArray(raw.items) ? raw.items : [];

  list.forEach((p) => {
    if (!p || typeof p !== 'object' || !clip(p.part, LIMITS.part) || !clip(p.risk, LIMITS.risk)) {
      dropped.shape += 1; return;
    }
    if (items.length >= MAX_ITEMS) { dropped.over += 1; return; }
    const hazard = typeof p.hazard === 'string' && hazardCodes.indexOf(p.hazard) !== -1 ? p.hazard : 'unknown';
    const v = verifySources(p.sources, grounded, eq && eq.maker);
    const item = {
      id: 'r' + (items.length + 1),
      part: clip(p.part, LIMITS.part),
      hazard,
      risk: clip(p.risk, LIMITS.risk),
      sources: v.sources,
      unverifiedSources: v.unverified,
      conflict: clip(p.conflict, LIMITS.conflict),
      needsPhoto: clip(p.needsPhoto, LIMITS.needsPhoto),
    };
    const j = judge(item);
    item.status = j.status;
    item.reasons = j.reasons;
    items.push(item);
  });

  const allHosts = new Set();
  items.forEach((it) => it.sources.forEach((s) => allHosts.add(s.host)));
  const thin = allHosts.size < MIN_SOURCES;

  /* 자료가 모자라면 「ok」 를 하나도 두지 않는다 — 담당자가 전부 본다 (FR-AD-08-04·13) */
  if (thin) {
    items.forEach((it) => {
      if (it.status === 'ok') { it.status = 'check'; it.reasons = it.reasons.concat('자료가 모자람'); }
    });
  }

  const overview = clip(raw && raw.overview, LIMITS.overview);
  /* 못 받은 자료·막힌 지점 — 「참고용」으로 뭉뚱그리지 않게 모델이 적고, 화면이 그대로 보인다 (조사 규칙) */
  const limits = (raw && Array.isArray(raw.limits) ? raw.limits : []).map((x) => clip(x, LIMITS.conflict)).filter(Boolean).slice(0, 10);

  /* 🆕 2026-11-09 실측 — GPT 가 막힌 지점(limits)에 「M-122-2012」를 적었다. 사람이 원문 표지로
     확인한 진짜 번호는 M-30-2002 다. 항목 판정(judge)은 limits·개요를 보지 않으므로,
     글 어디에 나온 문서번호든 모아 「원문으로 확인할 번호」로 따로 돌려준다 (담당자 화면에 보인다) */
  const docText = [overview].concat(limits, items.map((it) => it.part + ' ' + it.risk)).join('\n');
  const docNumbers = Array.from(new Set(docText.match(DOC_NO_ALL) || [])).slice(0, 10);

  return {
    overview,
    limits,
    docNumbers,
    general: !!(raw && raw.general === true) || !(eq && eq.model),
    items,
    dropped,
    sourceCount: allHosts.size,
    thin,
  };
}

/** 항목 하나의 판정 — ok 는 아래를 **전부** 만족할 때만 (FR-AD-08-13) */
/* 문서번호(예: M-30-2002, KOSHA GUIDE G-12-2020) · 사고 사례 · 날짜 */
export const DOC_NO = /\b[A-Z]{1,2}-\d{1,3}-(?:19|20)\d{2}\b/;
export const DOC_NO_ALL = /\b[A-Z]{1,2}-\d{1,3}-(?:19|20)\d{2}\b/g;
export const INCIDENT = /사고|사망|재해|부상|협착/;
export const DATED = /(?:19|20)\d{2}\s*년|(?:19|20)\d{2}[./-]\d{1,2}/;

export function judge(item) {
  const reasons = [];
  if (item.hazard === 'unknown') reasons.push('위험유형을 정하지 못함');
  if (!item.sources.length) {
    reasons.push(item.unverifiedSources ? '출처 주소를 검색 근거에서 찾지 못함' : '확인된 출처 없음');
  }
  else {
    /* 근거로 세는 출처 = 제조사·공공·일반 웹(전문지·경험 글). 동영상·판매 페이지는 세지 않는다 */
    const counted = item.sources.filter((s) => s.tier <= 3);
    if (item.sources.every((s) => s.tier === 4)) reasons.push('동영상 출처만 있음');
    else if (!counted.length) reasons.push('판매·자료 중계 페이지만 있음');
    else if (!counted.some((s) => s.tier <= 2) && counted.length < 2) reasons.push('믿을 만한 출처가 하나뿐');
  }
  if (item.conflict) reasons.push('출처끼리 말이 다름');
  /* 2026-11-09 사람 조사에서 실제로 겪은 함정 — 검색 요약이 문서번호(M-122-2012 → 실제 M-30-2002)와
     사고 날짜·장소(2020 평택 → 실제 2004 서울)를 틀리게 냈다. 그런 값이 든 문장은 공공 출처가 받쳐야 ok */
  const hasPublic = item.sources.some((s) => s.tier === 2);
  const text = String(item.part || '') + ' ' + String(item.risk || '');
  if (DOC_NO.test(text) && !hasPublic) reasons.push('문서번호가 있는데 공공 출처로 확인되지 않음');
  if (INCIDENT.test(text) && DATED.test(text) && !hasPublic && item.sources.length < 2) {
    reasons.push('날짜가 든 사고 사례인데 출처가 하나뿐');
  }
  return { status: reasons.length ? 'check' : 'ok', reasons };
}
