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
import { officialFor, MAX_OFFICIAL_ITEMS } from './_official.mjs';

/* ── 결정에 걸린 값 ─────────────────────────────────────────────────── */

export const BASE_ITEMS = 12;       // 기본 조사 항목 상한 — 담당자가 훑을 수 있는 양
/* 2026-11-09 — 기본 조사만으로는 「이 기계 고유 위험」(C형 편심하중·가드 재전환, 사출 분쇄기)을 두 번 다 놓쳤다.
   같은 설비 정보로 고유 위험만 묻는 두 번째 질문을 **나란히** 보낸다 (차례로 하면 60초 함수 상한을 넘는다) */
export const SPECIFIC_ITEMS = 5;
export const MAX_ITEMS = BASE_ITEMS + SPECIFIC_ITEMS;
export const MIN_SOURCES = 3;       // 이보다 적으면 결과 전체가 「자료 부족」 (FR-AD-08-04)
export const LIMITS = { overview: 400, part: 40, risk: 160, needsPhoto: 80, title: 120, conflict: 200 };

/* 출처 등급 (PRD-AD-08 §7). 숫자가 작을수록 믿는다.
   1 제조사 · 2 공공기관·법령 · 3 일반 웹(업계 전문지·현장 경험 글 포함) · 4 동영상 · 5 판매·자료 중계
   ★ 2026-11-09 사용자 결정: ok 를 공공·제조사로 좁히지 않는다 — 정보가 너무 적어진다.
     믿을 만한 곳 + 현장 경험 글은 모두 근거로 센다. 판매·카탈로그·문서 중계(5, daara·komachine·scribd)도
     근거로 세되 **원본을 확인할 수 있는 링크만** 넣고(verifySources), 화면에 「판매·중계」로 표시한다 (사용자 결정 2)
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
    + 'F) 🆕 설비 종류·모델명으로 학술 논문·연구 보고서(KCI·RISS·DBpia·산업안전보건연구원), 실제 재해 사례(KOSHA 재해사례·중대재해 속보), 사용·정비 동영상(유튜브)도 찾는다. 담당자가 미리 고른 위험유형에 없는 위험도 찾으면 넣는다.\n'
    + rulesText(hazardCodes, BASE_ITEMS);
}

/** 두 번째 질문 — 이 설비에만 있는 위험만. 조사 규칙 절차 3·5(구조·동력 방식 고유 위험은 공통 기준에 안 나온다)를
 *  따로 떼어 묻는다. 찾는 축은 위험성평가에서 쓰는 일반 축(구조·동력·주변 장치·작업 단계·사람 행동)이다.
 *  ponytail: 첫 질문 결과를 못 보고 나란히 돌아 겹치는 항목이 생길 수 있다 — 담당자가 [틀림·빼기]로 지운다 */
export function specificSystemText(hazardCodes = HAZARD_CODES) {
  return '너는 산업안전 자료 조사원이다. 공장 설비 한 대에서 이 설비에만 있는 위험을 찾는다.\n'
    + '어느 공장에나 있는 일반 위험(추락·통로·소음·분진·일반 감전)과, 이 종류 설비라면 누구나 아는 기본 끼임(예: 금형 사이)은 쓰지 않는다.\n'
    + '찾는 곳:\n'
    + 'A) 구조 방식 때문에 생기는 위험 — 같은 종류의 다른 구조(예: C형과 O형, 횡형과 수형)보다 무엇이 더 위험한지. 구조 설명·제조사 기술 자료.\n'
    + 'B) 동력·구동 방식 때문에 생기는 위험 (유압·기계식·전기 가열 등).\n'
    + 'C) 이 설비 옆에 붙여 함께 쓰는 주변 장치·부속 장치에서 생기는 위험.\n'
    + 'D) 작업 단계별 위험 — 준비, 금형·공구 교체, 이상 처리, 청소, 정비, 다시 돌리기. 방호장치를 열거나 끈 뒤 원래대로 돌리지 않고 다시 돌리는 것처럼 사람 행동 때문에 생기는 것도 넣는다.\n'
    + 'E) 근거는 실제 사고 사례, 공식 근로자 교육자료(OPS), 업계 전문지·현장 경험 글에서 찾는다.\n'
    + rulesText(hazardCodes, SPECIFIC_ITEMS);
}

/** 두 질문의 결과를 합친다. 고유 위험 항목에 표시(pass)를 붙인다 — 모델이 붙인 표시는 지운다 */
export function mergeRaw(base, extra) {
  const items = (b, max, pass) => (b && Array.isArray(b.items) ? b.items.slice(0, max) : [])
    .map((p) => (p && typeof p === 'object' ? { ...p, pass } : p));
  const limits = (b) => (b && Array.isArray(b.limits) ? b.limits : []);
  const n = (b) => (b && Array.isArray(b.items) ? b.items.length : 0);
  return {
    ...(base || {}),
    items: items(base, BASE_ITEMS, '').concat(items(extra, SPECIFIC_ITEMS, 'specific')),
    limits: limits(base).concat(limits(extra)),
    cut: Math.max(0, n(base) - BASE_ITEMS) + Math.max(0, n(extra) - SPECIFIC_ITEMS),   // 상한을 넘어 자른 수 — dropped.over 에 더한다
  };
}

/** 두 검색 근거를 합친다 */
export function mergeGrounding(a, b) {
  const c = (m) => (m && Array.isArray(m.groundingChunks) ? m.groundingChunks : []);
  return { groundingChunks: c(a).concat(c(b)) };
}

/** 두 질문이 같이 쓰는 규칙 — 출처·문서번호·동영상·모양 */
function rulesText(hazardCodes, max) {
  return '규칙:\n'
    + '1) 반드시 검색으로 실제로 본 자료만 근거로 쓴다. 우선순위: 제조사 설명서 > 공식 교육자료·KOSHA GUIDE·법령 > 업계 전문지·현장 경험 글 > 일반 웹 > 동영상. 판매·카탈로그·문서 공유 페이지는 실제로 연 그 글의 주소를 그대로 적을 때만 쓴다(사이트 첫 화면·검색 결과 주소는 쓰지 않는다).\n'
    + '2) 문서 번호(예: KOSHA CODE M-30-2002)·사고 날짜·장소는 검색 요약이 틀리는 일이 많다. 자료 본문에서 확인한 것만 쓰고, 확인 못 했으면 쓰지 않는다.\n'
    + '3) 동영상은 있다는 것만 알릴 수 있다. 동영상 내용을 근거로 쓰지 않는다.\n'
    + '4) 모델명 자료를 찾지 못하면 추측하지 말고 같은 종류 설비의 일반 자료를 쓰고 general 을 true 로 한다.\n'
    + `5) 항목은 많아도 ${max}개. 항목마다 부위(part), 위험유형(hazard), 위험 설명(risk), 근거(sources)를 쓴다.\n`
    + `6) hazard 는 다음 중 하나만 쓴다: ${hazardCodes.join(', ')}. 어디에도 맞지 않으면 unknown.\n`
    + '7) risk 는 무엇이 왜 위험한지 한국어 한 문장으로 쓴다. 노동자에게 하는 지시문(~하십시오)을 쓰지 않는다.\n'
    + '8) sources 에는 실제로 본 자료의 제목(title)·주소(url)·종류(kind)만 쓴다. 주소를 지어내지 않는다. kind 는 manual(제조사), official(공공·법령), journal(업계 전문지·기사), paper(학술 논문·연구 보고서), experience(현장 경험 글), web(그 밖) 중 하나. experience 는 글쓴이가 직접 겪거나 작업한 내용일 때만 쓴다.\n'
    + '9) 자료끼리 말이 다르면 하나를 고르지 말고 conflict 에 양쪽 내용을 짧게 쓴다.\n'
    + '10) 사진으로 확인해야 할 부위면 needsPhoto 에 찍을 부위와 각도를 짧게 쓴다(예: 램과 금형 사이를 정면에서).\n'
    + '10-1) partEn 에 그 부위의 영어 이름을 짧게 쓴다(예: ram and die, back gauge). 영어 자료의 그림 설명과 맞춰 참고 사진을 찾는 데 쓴다.\n'
    + '11) 열리지 않은 자료, 내용을 못 본 자료, 찾지 못한 것은 limits 에 「무엇을, 어디까지 확인했고 어디서 막혔는지」로 구체적으로 적는다. 「참고용」처럼 뭉뚱그리지 않는다.\n'
    + '12) 설명 없이 아래 모양의 JSON 하나만 출력한다.\n'
    + '{"overview": "...", "general": false, "items": [{"part": "...", "partEn": "...", "hazard": "'
    + hazardCodes[0] + '", "risk": "...", "sources": [{"title": "...", "url": "https://...", "kind": "experience"}],'
    + ' "conflict": "", "needsPhoto": ""}], "limits": ["..."]}';
}

export function userText(eq) {
  const lines = ['설비 종류·이름: ' + (eq.name || '(없음)')];
  if (eq.maker) lines.push('제조사: ' + eq.maker);
  if (eq.model) lines.push('모델명: ' + eq.model);
  if (eq.year) lines.push('연식: ' + eq.year);
  /* 확인된 공식 문서 항목은 이미 결과 맨 앞에 들어간다 — AI 는 겹치지 않게 보충만 한다.
     서버 상수(_official.mjs)라 사람이 적은 값이 섞이지 않는다 */
  const docs = officialFor(eq);
  if (docs.length) {
    lines.push('아래 공식 문서 항목은 이미 확인되어 결과에 들어 있다. 같은 내용을 다시 쓰지 말고 빠진 것을 보충하라:');
    docs.forEach((d) => d.items.forEach((it) => lines.push('- ' + d.code + ' ' + it.section + ' ' + it.part + ': ' + it.risk)));
  }
  lines.push('이 설비의 위험 부위와 주의할 점을 조사하라.');
  return lines.join('\n');
}

/** 확인된 공식 문서 항목을 결과 **맨 앞에** 넣는다 (사용자 결정 2026-11-09 「공적인 문서가 1차」).
 *  공식 문서도 없고 AI 결과에 공공 출처도 없으면 noOfficial — ok 를 하나도 두지 않는다 */
export function withOfficial(result, eq, docs = officialFor(eq)) {
  const official = [];
  docs.forEach((d) => d.items.slice(0, MAX_OFFICIAL_ITEMS).forEach((it) => {
    if (official.length >= MAX_OFFICIAL_ITEMS) return;
    official.push({
      id: 'o' + (official.length + 1),
      part: it.part,
      hazard: it.hazard,
      risk: it.risk,
      sources: [{ title: d.title + ' ' + it.section, url: d.url, host: d.host, tier: 2, kind: 'official' }],
      unverifiedSources: 0,
      conflict: '',
      needsPhoto: '',
      specific: false,
      official: { code: d.code, title: d.title, section: it.section, publisher: d.publisher, year: d.year },
      status: 'ok',
      reasons: [],
    });
  }));
  const items = result.items.map((it) => ({ ...it }));
  const noOfficial = !official.length && !items.some((it) => it.sources.some((s) => s.tier === 2));
  if (noOfficial) {
    items.forEach((it) => { it.status = 'check'; it.reasons = it.reasons.concat('공식 문서를 확인하지 못함'); });
  }
  const codes = docs.map((d) => d.code);
  return {
    ...result,
    items: official.concat(items),
    officialDocs: docs.map((d) => ({ code: d.code, title: d.title, publisher: d.publisher, year: d.year, url: d.url })),
    noOfficial,
    /* 사람이 원문으로 확인한 번호는 「원문 확인」 목록에서 뺀다 */
    docNumbers: (result.docNumbers || []).filter((n) => codes.indexOf(n) === -1),
  };
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
  return modelKind === 'experience' || modelKind === 'journal' || modelKind === 'paper' ? modelKind : 'web';   // 🆕 2026-11-22 paper(학술 논문)
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
/** 주소 비교용 — 소문자 호스트·www 뗌, #·utm_ 값·끝 / 를 떼고, 인코딩 차이를 푼다. 주소가 아니면 '' */
export function sameUrl(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    const q = Array.from(u.searchParams.entries()).filter(([k]) => !/^utm_/i.test(k))
      .map(([k, v]) => k + '=' + v).join('&');
    let path = u.pathname.replace(/\/+$/, '');
    try { path = decodeURIComponent(path); } catch (e) { /* 그대로 */ }
    return u.hostname.toLowerCase().replace(/^www\./, '') + path + (q ? '?' + q : '');
  } catch (e) {
    return '';
  }
}

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
    /* 판매·중계(5)는 2026-11-09 사용자 결정대로 「원본을 확인할 수 있는 링크만」 넣는다 —
       도메인만 같아서는 안 되고, 검색 도구가 실제로 연 바로 그 주소여야 한다.
       ponytail: Gemini 는 검색 근거가 경유 주소라 정확히 맞는 일이 없어 판매 출처가 늘 빠진다 (Gemini 안 씀) */
    if (tier === 5) {
      const want = sameUrl(s.url);
      if (!want || !grounded.some((g) => sameUrl(g.uri) === want)) { unverified += 1; return; }
    }
    out.push({ title: clip(s.title, LIMITS.title) || hit.title, url: String(s.url).slice(0, 500), host, tier, kind: kindOf(tier, s.kind) });
  });
  return { sources: out, unverified };
}

/** 모양 다듬기 + 근거 대조 + 판정을 한 번에. 돌려주는 값은 화면이 그대로 쓴다. */
export function cleanResult(raw, grounding, eq, hazardCodes = HAZARD_CODES) {
  const grounded = groundedSources(grounding);
  const dropped = { shape: 0, over: (raw && Number.isInteger(raw.cut) && raw.cut) || 0 };
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
      partEn: clip(p.partEn, LIMITS.part).replace(/[^A-Za-z0-9 ,/()-]/g, ''),   // 참고 사진 찾기용 (영어 그림 설명과 맞춘다)
      hazard,
      risk: clip(p.risk, LIMITS.risk),
      sources: v.sources,
      unverifiedSources: v.unverified,
      conflict: clip(p.conflict, LIMITS.conflict),
      needsPhoto: clip(p.needsPhoto, LIMITS.needsPhoto),
      specific: p.pass === 'specific',   // 두 번째 질문(이 기계 고유 위험)에서 나온 항목
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
    /* 근거로 세는 출처 = 동영상(4)만 빼고 전부. 판매·중계(5)는 원본 링크가 확인된 것만 들어와 있다 */
    const counted = item.sources.filter((s) => s.tier !== 4);
    if (!counted.length) reasons.push('동영상 출처만 있음');
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

/* ── 🆕 2026-11-16 등록 정보 검수 (설비 화면 → /api/research 의 verify) ─────────────
   담당자가 적은 설비 종류·제조사·모델·연식·위험유형이 맞는지 공개 자료로 확인한다.
   ★ 「맞음」「틀림」은 **검색 근거로 확인된 출처가 있을 때만** 받는다. 없으면 「확인 못 함」.
   ★ 빠진 위험유형 제안은 화면이 보낸 분류 목록(allowed) 안의 이름만, 확인된 출처가 있을 때만 받는다.
   ★ 아무것도 저장하지 않는다 — 반영은 담당자가 [승인]할 때 화면이 한다. */

export const VERIFY = { claims: 30, allowed: 40, label: 30, value: 60, note: 200, reason: 200, suggest: 60, missing: 6 };
export const VERDICTS = ['ok', 'wrong', 'unknown'];

/** 요청의 verify 를 다듬는다. 없거나 모양이 틀리면 null */
export function readVerify(body) {
  const v = body && body.verify;
  if (!v || typeof v !== 'object' || !Array.isArray(v.claims)) return null;
  const claims = [];
  v.claims.slice(0, VERIFY.claims).forEach((c) => {
    if (!c || typeof c !== 'object') return;
    const key = typeof c.key === 'string' && /^[a-z]+(:[^\s"`{}<>]{1,30})?$/i.test(c.key) ? c.key : '';
    const value = cleanField(c.value, VERIFY.value);
    if (!key || !value || claims.some((x) => x.key === key)) return;
    claims.push({ key, field: cleanField(c.field, VERIFY.label) || key, value, note: cleanField(c.note, VERIFY.note) });
  });
  if (!claims.length) return null;
  const allowed = (Array.isArray(v.allowed) ? v.allowed : []).map((x) => cleanField(x, VERIFY.label)).filter(Boolean).slice(0, VERIFY.allowed);
  return { claims, allowed };
}

export function verifySystemText() {
  return '너는 산업안전 자료 검수원이다. 담당자가 공장 설비 한 대를 등록하며 적은 정보가 맞는지 공개 자료로 확인한다.\n'
    + '규칙:\n'
    + '1) 반드시 검색으로 실제로 본 자료만 근거로 쓴다. 우선순위: 제조사 자료 > KOSHA GUIDE·법령·공식 교육자료 > 업계 전문지 > 일반 웹.\n'
    + '2) 항목(key)마다 verdict 를 ok(자료로 맞다고 확인), wrong(자료와 다르다), unknown(자료를 못 찾음) 중 하나로 쓴다. 추측으로 ok 를 쓰지 않는다.\n'
    + '3) wrong 이면 suggest 에 자료가 말하는 올바른 값을 짧게 쓴다. 위험유형이 이 설비와 관계없으면 wrong 이고 suggest 는 비운다.\n'
    + '4) reason 은 한국어 한 문장. 담당자 메모(note)가 있으면 그 지적을 먼저 확인하고 reason 에 답한다.\n'
    + '5) 담당자가 적지 않았지만 이 설비에 분명히 있는 위험유형이 있으면 missing 에 넣는다. hazard 는 주어진 분류 목록의 이름 그대로만 쓴다.\n'
    + '6) sources 에는 실제로 본 자료의 제목(title)·주소(url)만 쓴다. 주소를 지어내지 않는다.\n'
    + '7) 설명 없이 아래 모양의 JSON 하나만 출력한다.\n'
    + '{"checks": [{"key": "kind", "verdict": "ok", "suggest": "", "reason": "...", "sources": [{"title": "...", "url": "https://..."}]}],'
    + ' "missing": [{"hazard": "...", "reason": "...", "sources": [{"title": "...", "url": "https://..."}]}]}';
}

export function verifyUserText(eq, v) {
  const lines = ['설비 이름: ' + eq.name, '확인할 항목 (key · 항목 · 담당자가 적은 값 · 담당자 메모):'];
  v.claims.forEach((c) => lines.push('- ' + c.key + ' · ' + c.field + ' · ' + c.value + (c.note ? ' · 메모: ' + c.note : '')));
  if (v.allowed.length) lines.push('위험유형 분류 목록: ' + v.allowed.join(', '));
  lines.push('각 항목이 맞는지 확인하라.');
  return lines.join('\n');
}

/** 모델 출력 → 화면이 그대로 쓰는 검수 결과. 확인된 출처가 없으면 ok·wrong 을 unknown 으로 내린다 */
export function cleanVerify(raw, grounding, eq, v) {
  const grounded = groundedSources(grounding);
  const got = raw && Array.isArray(raw.checks) ? raw.checks : [];
  const checks = v.claims.map((c) => {
    const m = got.find((x) => x && x.key === c.key) || null;
    const src = verifySources(m && m.sources, grounded, eq && eq.maker);
    let verdict = m && VERDICTS.indexOf(m.verdict) !== -1 ? m.verdict : 'unknown';
    let reason = clip(m && m.reason, VERIFY.reason);
    if (!m) reason = 'AI 가 이 항목에 답하지 않음';
    if (verdict !== 'unknown' && !src.sources.length) {
      verdict = 'unknown';
      reason = (reason ? reason + ' — ' : '') + '근거 출처를 확인하지 못해 판정하지 않음';
    }
    return {
      key: c.key, field: c.field, claim: c.value, verdict,
      suggest: verdict === 'wrong' ? clip(m && m.suggest, VERIFY.suggest) : '',
      reason, sources: src.sources, unverifiedSources: src.unverified,
    };
  });
  const missing = [];
  (raw && Array.isArray(raw.missing) ? raw.missing : []).forEach((m) => {
    if (!m || missing.length >= VERIFY.missing) return;
    const label = clip(m.hazard, VERIFY.label);
    if (v.allowed.indexOf(label) === -1 || missing.some((x) => x.label === label)) return;
    if (v.claims.some((c) => c.key.indexOf('hazard:') === 0 && c.value === label)) return;   // 이미 적은 것
    const src = verifySources(m.sources, grounded, eq && eq.maker);
    if (!src.sources.length) return;   // 근거 없는 제안은 받지 않는다
    missing.push({ key: 'add:' + label, field: '위험유형 추가 제안', claim: '', label, verdict: 'wrong', suggest: label, reason: clip(m.reason, VERIFY.reason), sources: src.sources, unverifiedSources: src.unverified });
  });
  return { checks, missing };
}
