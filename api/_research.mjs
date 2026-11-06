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
   1 제조사 · 2 공공기관·법령 · 3 일반 웹 · 4 동영상
   ★ 등급은 **서버가 도메인으로 정한다.** 모델이 「제조사 자료」라고 말해도
     블로그·위키 도메인이면 1 이 되지 않는다. */
export const PUBLIC_DOMAINS = [
  'kosha.or.kr', 'law.go.kr', 'moel.go.kr', 'go.kr', 'osha.gov', 'cdc.gov', 'hse.gov.uk', 'iso.org',
];
export const VIDEO_DOMAINS = ['youtube.com', 'youtu.be'];
export const BLOG_DOMAINS = [
  'tistory.com', 'naver.com', 'blog.', 'wikipedia.org', 'namu.wiki', 'medium.com', 'velog.io', 'brunch.co.kr',
];

/* ── 지시문 ───────────────────────────────────────────────────────────── */

/** 사람이 적은 값을 지시문에 넣기 전에 다듬는다 — 줄바꿈·따옴표로 지시를 덧붙이지 못하게 */
export function cleanField(v, max) {
  return typeof v === 'string' ? v.replace(/[\r\n"`{}<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function systemText(hazardCodes = HAZARD_CODES) {
  return '너는 산업안전 자료 조사원이다. 공장 설비 한 대의 위험과 주의할 점을 공개 자료에서 찾아 정리한다.\n'
    + '규칙:\n'
    + '1) 반드시 Google 검색으로 찾은 자료만 근거로 쓴다. 자료 우선순위: 제조사 설명서 > 안전보건공단(KOSHA GUIDE)·'
    + '산업안전보건기준에 관한 규칙 > 일반 웹 > 동영상.\n'
    + '2) 모델명 자료를 찾지 못하면 추측하지 말고 같은 종류 설비의 일반 자료를 쓰고 general 을 true 로 한다.\n'
    + `3) 항목은 많아도 ${MAX_ITEMS}개. 항목마다 부위(part), 위험유형(hazard), 위험 설명(risk), 근거(sources)를 쓴다.\n`
    + `4) hazard 는 다음 중 하나만 쓴다: ${hazardCodes.join(', ')}. 어디에도 맞지 않으면 unknown.\n`
    + '5) risk 는 무엇이 왜 위험한지 한국어 한 문장으로 쓴다. 노동자에게 하는 지시문(~하십시오)을 쓰지 않는다.\n'
    + '6) sources 에는 실제로 본 자료의 제목(title)과 주소(url)만 쓴다. 주소를 지어내지 않는다.\n'
    + '7) 자료끼리 말이 다르면 하나를 고르지 말고 conflict 에 양쪽 내용을 짧게 쓴다.\n'
    + '8) 사진으로 확인해야 할 부위면 needsPhoto 에 찍을 부위와 각도를 짧게 쓴다(예: 램과 금형 사이를 정면에서).\n'
    + '9) 설명 없이 아래 모양의 JSON 하나만 출력한다.\n'
    + '{"overview": "...", "general": false, "items": [{"part": "...", "hazard": "'
    + hazardCodes[0] + '", "risk": "...", "sources": [{"title": "...", "url": "https://..."}],'
    + ' "conflict": "", "needsPhoto": ""}]}';
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
  if (endsWithAny(host, BLOG_DOMAINS)) return 3;
  const hint = String(makerHint || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (hint.length >= 3 && host.replace(/[^a-z0-9]/g, '').indexOf(hint) !== -1) return 1;
  return 3;
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
    out.push({ title: clip(s.title, LIMITS.title) || hit.title, url: String(s.url).slice(0, 500), host, tier: tierOf(host, makerHint) });
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

  return {
    overview: clip(raw && raw.overview, LIMITS.overview),
    general: !!(raw && raw.general === true) || !(eq && eq.model),
    items,
    dropped,
    sourceCount: allHosts.size,
    thin,
  };
}

/** 항목 하나의 판정 — ok 는 아래를 **전부** 만족할 때만 (FR-AD-08-13) */
export function judge(item) {
  const reasons = [];
  if (item.hazard === 'unknown') reasons.push('위험유형을 정하지 못함');
  if (!item.sources.length) {
    reasons.push(item.unverifiedSources ? '출처 주소를 검색 근거에서 찾지 못함' : '확인된 출처 없음');
  }
  else if (!item.sources.some((s) => s.tier <= 2) && item.sources.length < 2) reasons.push('믿을 만한 출처가 하나뿐');
  if (item.sources.length && item.sources.every((s) => s.tier === 4)) reasons.push('동영상 출처만 있음');
  if (item.conflict) reasons.push('출처끼리 말이 다름');
  return { status: reasons.length ? 'check' : 'ok', reasons };
}
