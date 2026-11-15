/* 위험 항목 참고 사진 — 항목의 **확인된 출처 페이지에 실제로 있는 그림**만 붙인다 (2026-11-10 사용자 요청
   「위험에 각각 사진까지. 리서치해서 같이 넣고, 없으면 넣지 마」).

   밑줄로 시작하는 파일은 Vercel 이 경로로 잡지 않는다. 이 파일은 함수가 아니다.

   ★ AI 에게 사진 주소를 말하게 하지 않는다 — 지어낸 주소가 된다. 서버가 출처 페이지(검색 근거로 확인된 것)를
     직접 열어 <img> 의 alt·title 이 항목 부위 이름과 겹치는 그림만 고른다. 못 찾으면 사진 없음.
   ★ 브라우저는 제3자 주소를 부르지 않는다 — 서버가 받아 data URL 로 돌려준다 (CLAUDE.md 제3자 요청 0건).
   ★ 받은 바이트의 머리(매직 바이트)로 jpeg·png·webp 만 받는다. svg(스크립트가 들어갈 수 있다)·gif 는 버린다.
   ★ 참고용이다. 담당자 검토 화면에만 보이고 교육(courses)에는 넣지 않는다 — 남의 사진이다(저작권).
   ★ 모델 출력에서 온 주소를 연다 — http(s)·공개 호스트 이름만, 리다이렉트도 한 번씩 다시 본다.
     ponytail: 호스트 이름이 사설 IP 로 풀리는 경우(DNS)는 막지 않는다. 막으려면 dns.lookup 으로 주소를 본 뒤 연다 */

export const IMAGE_MAX_BYTES = 500 * 1024;          // 그림 하나 (2026-11-11 300→500KB: 제품 사진이 300KB 를 넘어 버려졌다)
export const IMAGE_MIN_BYTES = 8 * 1024;            // 이보다 작으면 아이콘·버튼·작은 썸네일 (5KB 썸네일은 알아볼 수 없었다)
export const IMAGES_TOTAL_BYTES = 2.5 * 1024 * 1024; // 한 응답 — Vercel 응답 상한 4.5MB 안 (base64 로 1.33배). 넘으면 그 항목은 영상 썸네일(~20KB)로
export const LICENSE_UNKNOWN = '확인 필요';          // 사용 조건을 모르는 그림 — 위키미디어 공용 그림만 조건을 읽어 온다
export const PAGE_MAX_BYTES = 1.5 * 1024 * 1024;
export const FETCH_MS = 6000;
export const MAX_PAGES = 24;
export const PAGES_PER_ITEM = 2;
const UA = 'Mozilla/5.0 (compatible; safety-ai-research/1.0)';

/** 열어도 되는 주소인가 — http(s) · 이름 있는 공개 호스트만 (IP·localhost·내부 이름 안 됨) */
export function safeUrl(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    if (!h || h === 'localhost' || h.indexOf('.') === -1) return false;
    if (/^[\d.]+$/.test(h) || h.indexOf(':') !== -1 || h.startsWith('[')) return false;
    if (/\.(local|internal|localhost|lan|home|corp)$/.test(h)) return false;
    return true;
  } catch (e) {
    return false;
  }
}

/** 리다이렉트를 직접 따라가며 매번 주소를 다시 본다 */
async function get(url, fetchFn, ms, accept) {
  let u = url;
  for (let hop = 0; hop < 4; hop += 1) {
    if (!safeUrl(u) || ms < 300) return null;
    const r = await fetchFn(u, { redirect: 'manual', signal: AbortSignal.timeout(ms), headers: { 'user-agent': UA, accept } });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location');
      if (!loc) return null;
      u = new URL(loc, u).href;
      continue;
    }
    return r.ok ? { res: r, url: u } : null;
  }
  return null;
}

async function bytes(res, max) {
  const len = Number(res.headers.get('content-length'));
  if (len && len > max) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > max ? null : buf;
}

/** 한글 사이트는 euc-kr 이 아직 있다 — 머리·meta 의 charset 으로 푼다 */
function decode(buf, type) {
  const m = /charset=([\w-]+)/i.exec(type || '') || /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4096).toString('latin1'));
  try { return new TextDecoder(m ? m[1].toLowerCase() : 'utf-8').decode(buf); } catch (e) { return buf.toString('utf8'); }
}

function unescape(t) {
  return String(t).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** 페이지의 그림 후보 — [{ url, text }] (text = alt + title) */
export function imgCandidates(html, pageUrl) {
  const out = [];
  const tags = String(html).match(/<img\b[^>]*>/gi) || [];
  tags.forEach((tag) => {
    const a = {};
    tag.replace(/\b(src|data-src|data-original|data-lazy-src|alt|title)\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, k, v, d, s) => {
      a[k.toLowerCase()] = unescape(d !== undefined ? d : s);
      return m;
    });
    const src = a['data-src'] || a['data-original'] || a['data-lazy-src'] || a.src;
    const text = ((a.alt || '') + ' ' + (a.title || '')).trim();
    if (!src || !text || /^data:/i.test(src) || /\.(svg|gif)(\?|$)/i.test(src)) return;
    try { out.push({ url: new URL(src, pageUrl).href, text }); } catch (e) { /* 버림 */ }
  });
  return out;
}

/* 어디에나 붙는 말 — 이것만 같아서는 그 부위 그림이 아니다 */
const STOP = ['위험', '부위', '작업', '포함', '사이', '주변', '상태', '부분', '장치', '기계', '설비', '단계', '영역', '경우', '사용', '관련',
  'area', 'zone', 'point', 'part', 'parts', 'side', 'unit', 'system', 'machine', 'machinery', 'equipment', 'with', 'from', 'during',
  /* 설비 이름은 한글로 오니 영어 설비 이름 낱말은 여기서 뺀다. ponytail: 새 설비 종류가 생기면 그 영어 이름을 더한다 */
  'press', 'presses', 'hydraulic', 'injection', 'molding', 'moulding', 'mold', 'mould',
  /* 어디에나 붙는 꾸밈말 — 2026-11-10 실측: 「plastic」이 lockout 사진에, 「electrical」이 interlock 사진에 붙었다 */
  'plastic', 'plastics', 'electrical', 'electric', 'safety', 'power', 'control', 'mechanical'];

/** 부위 이름의 낱말(한글 2자+, 영문 4자+)이 그림 설명에 통째로 몇 개 있나.
 *  2026-11-10 실측 — 두 글자 묶음으로 맞추자 「백게이지(backgauge)」가 「Springback」에, 「C-프레임」이 「기계 프레스」에 붙었다.
 *  그래서 낱말 통째로 · 설비 이름 낱말(프레스·사출…)은 빼고 센다 */
export function matchPart(part, text, eqName) {
  const words = (t) => (String(t || '').toLowerCase().match(/[가-힣]{2,}|[a-z]{4,}/g) || []);
  const skip = new Set(STOP.concat(words(eqName)));
  const hay = String(text || '').toLowerCase().replace(/\s+/g, '');
  return Array.from(new Set(words(part))).filter((w) => !skip.has(w) && hay.indexOf(w) !== -1).length;
}

/** 괄호 안 덧붙임은 뺀다 — 2026-11-10 실측: 「제어반(아크플래시·감전 위험)」의 「감전」, 「분출(금형·노즐 이외)」의 「금형」이
 *  다른 사고 그림에 붙었다. 부위 이름 본체로만 맞춘다 */
export function mainName(t) {
  return String(t || '').replace(/\([^)]*\)/g, ' ');
}

/** 받은 바이트가 정말 그림인가 — 머리로 정한다 (서버가 보낸 content-type 은 믿지 않는다) */
export function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}

function eligibleSources(it) {
  return (it.sources || []).filter((s) => s.tier !== 4 && !/\.pdf(\?|#|$)/i.test(s.url) && safeUrl(s.url)).slice(0, PAGES_PER_ITEM);
}

/** 사이트 공통 그림(로고·공유용 기본 그림)인가 — 파일 이름으로 본다.
 *  2026-11-11 실측: woojinplaimm.com/og_image.jpg (모든 페이지 같은 그림)가 「잔류 에너지」 사진으로 붙었다 */
export function siteImage(url) {
  let name = '';
  try { name = decodeURIComponent(new URL(url, 'https://x.invalid/').pathname.split('/').pop() || ''); } catch (e) { name = String(url); }
  /* 「logo」는 낱말일 때만 — atssafety.com 의 제품 사진 이름이 「…Closedwithlogo_1200x1200.jpg」다 */
  return /(^|[^a-z])(logo|favicon)([^a-z]|$)/i.test(name) || /^(og[_-]?image|default|share|placeholder)([_.-]|$)/i.test(name);
}

/** 페이지 대표 그림 — 「이 부위 사진이 있는 페이지」로 찾은 곳에서만 쓴다.
 *  차례: og:image → twitter:image → <link rel=image_src> → width 300 이상인 첫 <img> */
export function pageImage(html, pageUrl) {
  const s = String(html);
  const usable = (c) => !!c && !/^data:/i.test(c) && !/\.(svg|gif)(\?|$)/i.test(c) && !siteImage(c);
  const attr = (m, name) => { const c = m && new RegExp('\\s' + name + '\\s*=\\s*["\']([^"\']+)["\']', 'i').exec(m[0]); return c ? c[1] : ''; };
  const meta = (key) => attr(new RegExp('<meta\\b[^>]*(?:property|name)\\s*=\\s*["\']' + key + '["\'][^>]*>', 'i').exec(s), 'content');
  const bigImg = () => {
    for (const tag of s.match(/<img\b[^>]*>/gi) || []) {
      const w = /\swidth\s*=\s*["']?(\d+)/i.exec(tag);
      const src = attr([tag], 'data-src') || attr([tag], 'src');
      if (w && Number(w[1]) >= 300 && usable(src)) return src;
    }
    return '';
  };
  for (const c of [meta('og:image'), meta('twitter:image'), attr(/<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*>/i.exec(s), 'href'), bigImg()]) {
    if (!usable(c)) continue;
    try { return new URL(unescape(c), pageUrl).href; } catch (e) { /* 다음 후보 */ }
  }
  return '';
}

/** 위키미디어 공용 그림이면 파일 이름 (사용 조건을 물을 수 있다). 아니면 '' */
export function commonsFile(url) {
  try {
    const u = new URL(url);
    const p = u.pathname.split('/');
    /* 2026-11-11 실측: 공용 파일 페이지의 og:image 가 upload. 이 아니라 thumb.wikimedia.org 로 온다 */
    if (/^(upload|thumb)\.wikimedia\.org$/.test(u.hostname) && p[2] === 'commons') return decodeURIComponent(p[p[3] === 'thumb' ? 6 : 5] || '');
    if (u.hostname === 'commons.wikimedia.org' && /^\/wiki\/File:/.test(u.pathname)) return decodeURIComponent(u.pathname.slice(11));
  } catch (e) { /* 아님 */ }
  return '';
}

/** 공용 API 의 extmetadata → 「라이선스 · 저작자」 한 줄. 없으면 '' */
export function readCommonsLicense(data) {
  const pages = data && data.query && data.query.pages;
  const p = pages && Object.values(pages)[0];
  const m = p && p.imageinfo && p.imageinfo[0] && p.imageinfo[0].extmetadata;
  const v = (k) => (m && m[k] && typeof m[k].value === 'string' ? m[k].value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '');
  const lic = v('LicenseShortName');
  return lic ? (lic + (v('Artist') ? ' · ' + v('Artist') : '')).slice(0, 160) : '';
}

/** 그림의 사용 조건 — 위키미디어 공용 그림(그림 주소 또는 공용 파일 페이지)이면 공용 API 로 읽는다. 못 읽으면 '확인 필요' */
export async function licenseOf(imgUrl, pageUrl, fetchFn = globalThis.fetch, ms = FETCH_MS) {
  const file = commonsFile(imgUrl) || commonsFile(pageUrl);
  if (!file) return LICENSE_UNKNOWN;
  const g = await get('https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles='
    + encodeURIComponent('File:' + file), fetchFn, ms, 'application/json').catch(() => null);
  const data = g ? await g.res.json().catch(() => null) : null;
  return readCommonsLicense(data) || LICENSE_UNKNOWN;
}

/* ── 사진 찾기 질문 (2026-11-10 사용자 요청 「모든 항목에 사진, 유튜브 캡처라도」) ─────────────
   출처 페이지에는 부위 사진이 드물다(실측 프레스 0/18). 그래서 조사가 끝난 뒤 같은 모델에게 **사진만** 묻는다 —
   항목마다 그 부위가 사진·그림으로 보이는 페이지와 유튜브 영상 하나. 모델이 준 주소는 그대로 믿지 않는다:
   페이지는 검색 근거(검색 도구가 연 곳)에 있는 사이트만, 영상은 유튜브 공식 oEmbed 로 있는 영상인지 본다.
   ★ 영상 속 장면을 잘라 내지 않는다 — 영상을 내려받아야 하고 유튜브 약관이 막는다. 유튜브가 직접 만든 썸네일만 쓴다 */

export function photoSystemText() {
  return '너는 산업안전 교육 자료의 사진을 찾는 조사원이다. 설비의 위험 항목마다 그 부위나 위험 상황이 사진·그림으로 보이는 자료를 웹 검색으로 찾는다.\n'
    + '규칙:\n'
    + '1) 항목마다 그 부위 사진·그림이 실제로 있는 웹 페이지 주소를 1~2개 pages 에 쓴다. 위키미디어 공용 사진이 있으면 먼저 쓴다(사용 조건이 적혀 있다) — 사진 한 장의 파일 페이지(https://commons.wikimedia.org/wiki/File:...)만 쓰고, 분류(Category:)·갤러리 페이지는 쓰지 않는다. 제조사 제품 페이지, 안전보건공단 재해사례·교육자료, 업계 기사, 현장 블로그도 된다. PDF 는 쓰지 않는다.\n'
    + '2) 모든 항목에 반드시 유튜브 영상 하나를 video 에 쓴다(https://www.youtube.com/watch?v=...). 그 부위·위험·작업을 보여 주는 영상이 가장 좋고, 없으면 같은 종류 설비의 작업·안전 영상이라도 쓴다. video 를 비우지 않는다.\n'
    + '3) 반드시 검색으로 실제로 연 주소만 쓴다. 주소를 지어내지 않는다. 페이지를 못 찾으면 pages 는 비운다.\n'
    + '4) 설명 없이 아래 모양의 JSON 하나만 출력한다.\n'
    + '{"items": [{"id": "r1", "pages": ["https://..."], "video": "https://www.youtube.com/watch?v=..."}]}';
}

export function photoUserText(eq, items) {
  const clean = (v) => String(v || '').replace(/[\r\n"`{}<>]/g, ' ').slice(0, 60);
  return ['설비: ' + clean(eq && eq.name) + (eq && eq.maker ? ' / 제조사 ' + clean(eq.maker) : '') + (eq && eq.model ? ' / 모델 ' + clean(eq.model) : ''),
    '위험 항목:']
    .concat(items.map((it) => '- ' + clean(it.id) + ': ' + clean(it.part) + (it.partEn ? ' (' + clean(it.partEn) + ')' : '')))
    .join('\n');
}

export const YT_ID = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

/** 모델 답 → { id: { pages:[url], video:'ID' } }. 페이지는 검색 근거에 있는 사이트만 (지어낸 주소 거르기) */
export function readPhotoHints(raw, grounding) {
  const chunks = grounding && Array.isArray(grounding.groundingChunks) ? grounding.groundingChunks : [];
  const hosts = new Set(chunks.map((c) => c && c.web && hostName(c.web.uri)).filter(Boolean));
  const out = {};
  (raw && Array.isArray(raw.items) ? raw.items : []).forEach((p) => {
    if (!p || typeof p.id !== 'string') return;
    const pages = (Array.isArray(p.pages) ? p.pages : []).map(String)
      .filter((u) => safeUrl(u) && !/\.pdf(\?|#|$)/i.test(u) && hosts.has(hostName(u)) && !commonsList(u)).slice(0, 2);
    const v = YT_ID.exec(String(p.video || ''));
    out[p.id.slice(0, 10)] = { pages, video: v ? v[1] : '' };
  });
  return out;
}

function hostName(u) {
  try { return new URL(String(u)).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; }
}

/** 위키미디어 공용의 파일(File:)이 아닌 페이지인가 — 분류(Category:)·갤러리는 아무 첫 그림이 대표 그림이 된다.
 *  2026-11-11 실측: 「장갑」에 박물관 직물 사진, 「유압유」에 해상 유정 폭발, 「제어반」에 녹음실이 붙었다 */
function commonsList(u) {
  return hostName(u) === 'commons.wikimedia.org' && !commonsFile(u);
}

/* 2026-11-10 실측 — 항목 20개를 한 질문에 넣자 항목마다 검색하느라 90초를 넘었다. 5개씩 나눠 나란히 보낸다 */
export const PHOTO_BATCH = 5;

/** 사진 찾기 질문을 보내고 힌트를 돌려준다 (calls = 보낸 질문 수). 실패한 묶음은 빈 힌트 — 그 항목 사진은 출처 페이지에서만 */
export async function findPhotoHints(callModel, cfg, eq, items, parseJson, maxCalls = Infinity, batch = PHOTO_BATCH) {
  const groups = [];
  for (let i = 0; i < items.length && groups.length < maxCalls; i += batch) groups.push(items.slice(i, i + batch));
  const rs = await Promise.all(groups.map((g) => callModel(cfg, photoSystemText(), photoUserText(eq, g),
    { maxOutputTokens: 4000, maxText: 8000, tools: [{ google_search: {} }] }).catch(() => ({ error: 'network' }))));
  const hints = {};
  const errors = [];
  rs.forEach((r) => {
    if (r.error) { errors.push(r.error); return; }
    /* 2026-11-11 실측: 사출기 첫 묶음(o1~o8)이 오류 없이 빈 힌트였다 — JSON 이 아닌 답도 실패로 센다 */
    const raw = parseJson(r.text);
    if (!raw || !Array.isArray(raw.items)) { errors.push('model'); return; }
    Object.assign(hints, readPhotoHints(raw, r.grounding));
  });
  return { hints, calls: groups.length, error: errors.join(',') };
}

/** 결과의 항목마다 참고 사진을 붙인다 — item.image = { data, page, host, alt, kind: 'page'|'video', license }.
 *  찾는 차례: ① 출처 페이지의 그림(설명이 부위 이름과 맞을 때) ② 사진 찾기로 받은 페이지의 그림(맞는 설명 → 없으면 대표 그림)
 *  ③ 유튜브 영상 썸네일. 썸네일은 페이지 그림이 있어도 받아 둔다 — 합계 상한을 넘거나 같은 그림이 이미 쓰였으면 대신 쓴다.
 *  license: 위키미디어 공용 그림이면 그 사용 조건, 아니면 '확인 필요' (영상 썸네일 포함 — 남의 것이다).
 *  실패·시간 초과는 조용히 「사진 없음」. 결과의 다른 값은 바꾸지 않는다 */
export async function attachImages(result, { fetchFn = globalThis.fetch, budgetMs = 10000, eqName = '', hints = {} } = {}) {
  if (!result || !Array.isArray(result.items) || budgetMs < 1000 || typeof fetchFn !== 'function') return result;
  const deadline = Date.now() + budgetMs;
  const left = () => Math.min(FETCH_MS, deadline - Date.now());

  const pages = new Map();   // url → Promise<{ cands:[{url,text}], og }>
  const openPage = (url) => {
    if (!pages.has(url) && pages.size < MAX_PAGES * 2) {
      pages.set(url, get(url, fetchFn, left(), 'text/html').then(async (g) => {
        if (!g || !/html/i.test(g.res.headers.get('content-type') || '')) return null;
        const buf = await bytes(g.res, PAGE_MAX_BYTES);
        if (!buf) return null;
        const html = decode(buf, g.res.headers.get('content-type'));
        return { cands: imgCandidates(html, g.url), og: pageImage(html, g.url) };
      }).catch(() => null));
    }
    return pages.get(url) || Promise.resolve(null);
  };
  result.items.forEach((it) => {
    eligibleSources(it).forEach((s) => openPage(s.url));
    ((hints[it.id] && hints[it.id].pages) || []).forEach(openPage);
  });

  const fetchImage = (url) => get(url, fetchFn, left(), 'image/*').then(async (g) => {
    if (!g) return null;
    const buf = await bytes(g.res, IMAGE_MAX_BYTES);
    if (!buf || buf.length < IMAGE_MIN_BYTES) return null;
    const type = sniff(buf);
    return type ? 'data:' + type + ';base64,' + buf.toString('base64') : null;
  }).catch(() => null);

  /** 유튜브 — 공식 oEmbed 로 있는 영상인지·제목을 보고, 유튜브가 만든 썸네일(hqdefault)을 받는다 */
  const fetchVideo = async (id) => {
    const watch = 'https://www.youtube.com/watch?v=' + id;
    const o = await get('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(watch), fetchFn, left(), 'application/json').catch(() => null);
    if (!o) return null;
    const meta = await o.res.json().catch(() => null);
    if (!meta || typeof meta.title !== 'string') return null;
    const data = await fetchImage('https://i.ytimg.com/vi/' + id + '/hqdefault.jpg');
    return data ? { data, page: watch, host: 'youtube.com', alt: meta.title.slice(0, 120), src: 'yt:' + id, kind: 'video', license: LICENSE_UNKNOWN } : null;
  };

  const fromPages = async (it, h) => {
    const name = mainName(it.part + ' ' + (it.partEn || ''));
    const cands = [];
    for (const s of eligibleSources(it)) {
      const p = await openPage(s.url);
      (p ? p.cands : []).forEach((c) => { const sc = matchPart(name, c.text, eqName); if (sc) cands.push({ ...c, sc: sc + 10, page: s.url, host: s.host }); });
    }
    for (const url of h.pages || []) {
      const p = await openPage(url);
      if (!p) continue;
      p.cands.forEach((c) => { const sc = matchPart(name, c.text, eqName); if (sc) cands.push({ ...c, sc: sc + 5, page: url, host: hostName(url) }); });
      if (p.og) cands.push({ url: p.og, text: '', sc: 1, page: url, host: hostName(url) });
    }
    cands.sort((a, b) => b.sc - a.sc);
    for (const c of cands.slice(0, 3)) {
      const data = await fetchImage(c.url);
      if (data) return { data, page: c.page, host: c.host, alt: (c.text || '페이지 대표 그림').slice(0, 120), src: c.url, kind: 'page', license: await licenseOf(c.url, c.page, fetchFn, left()) };
    }
    return null;
  };

  const found = await Promise.all(result.items.map((it) => {
    const h = hints[it.id] || { pages: [], video: '' };
    return Promise.all([fromPages(it, h), h.video ? fetchVideo(h.video) : null]);
  }));

  /* 같은 그림은 한 항목에만, 합계 상한 안에서 앞 항목부터. 페이지 그림이 안 되면 영상 썸네일 */
  let total = 0;
  const used = new Set();
  const items = result.items.map((it, i) => {
    const f = found[i].find((c) => c && !used.has(c.src) && total + c.data.length <= IMAGES_TOTAL_BYTES * 1.34);
    if (!f) return it;
    used.add(f.src);
    total += f.data.length;
    return { ...it, image: { data: f.data, page: f.page, host: f.host, alt: f.alt, kind: f.kind, license: f.license } };
  });
  return { ...result, items, images: items.filter((it) => it.image).length };
}
