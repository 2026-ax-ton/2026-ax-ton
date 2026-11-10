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

export const IMAGE_MAX_BYTES = 300 * 1024;          // 그림 하나
export const IMAGE_MIN_BYTES = 8 * 1024;            // 이보다 작으면 아이콘·버튼·작은 썸네일 (5KB 썸네일은 알아볼 수 없었다)
export const IMAGES_TOTAL_BYTES = 2.5 * 1024 * 1024; // 한 응답 — Vercel 응답 상한 4.5MB 안 (base64 로 1.33배)
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
const STOP = ['위험', '부위', '작업', '포함', '사이', '주변', '상태', '부분', '장치', '기계', '설비', '단계', '영역', '경우', '사용', '관련'];

/** 부위 이름의 낱말(한글 2자+, 영문 4자+)이 그림 설명에 통째로 몇 개 있나.
 *  2026-11-10 실측 — 두 글자 묶음으로 맞추자 「백게이지(backgauge)」가 「Springback」에, 「C-프레임」이 「기계 프레스」에 붙었다.
 *  그래서 낱말 통째로 · 설비 이름 낱말(프레스·사출…)은 빼고 센다 */
export function matchPart(part, text, eqName) {
  const words = (t) => (String(t || '').toLowerCase().match(/[가-힣]{2,}|[a-z]{4,}/g) || []);
  const skip = new Set(STOP.concat(words(eqName)));
  const hay = String(text || '').toLowerCase().replace(/\s+/g, '');
  return Array.from(new Set(words(part))).filter((w) => !skip.has(w) && hay.indexOf(w) !== -1).length;
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

/** 결과의 AI 항목마다 참고 사진을 붙인다 — item.image = { data, page, host, alt }.
 *  실패·시간 초과는 조용히 「사진 없음」. 결과의 다른 값은 바꾸지 않는다 */
export async function attachImages(result, { fetchFn = globalThis.fetch, budgetMs = 10000, eqName = '' } = {}) {
  if (!result || !Array.isArray(result.items) || budgetMs < 1000 || typeof fetchFn !== 'function') return result;
  const deadline = Date.now() + budgetMs;
  const left = () => Math.min(FETCH_MS, deadline - Date.now());

  const pages = new Map();   // url → Promise<[{url,text}]>
  result.items.forEach((it) => {
    if (it.official) return;
    eligibleSources(it).forEach((s) => {
      if (pages.size >= MAX_PAGES || pages.has(s.url)) return;
      pages.set(s.url, get(s.url, fetchFn, left(), 'text/html').then(async (g) => {
        if (!g || !/html/i.test(g.res.headers.get('content-type') || '')) return [];
        const buf = await bytes(g.res, PAGE_MAX_BYTES);
        return buf ? imgCandidates(decode(buf, g.res.headers.get('content-type')), g.url) : [];
      }).catch(() => []));
    });
  });

  const fetchImage = (url) => get(url, fetchFn, left(), 'image/*').then(async (g) => {
    if (!g) return null;
    const buf = await bytes(g.res, IMAGE_MAX_BYTES);
    if (!buf || buf.length < IMAGE_MIN_BYTES) return null;
    const type = sniff(buf);
    return type ? 'data:' + type + ';base64,' + buf.toString('base64') : null;
  }).catch(() => null);

  /* 항목마다 가장 잘 맞는 후보 둘까지 받아 본다 (나란히) */
  const found = await Promise.all(result.items.map(async (it) => {
    if (it.official) return null;
    const srcs = eligibleSources(it);
    const cands = [];
    for (const s of srcs) {
      const list = (await pages.get(s.url)) || [];
      list.forEach((c) => { const sc = matchPart(it.part, c.text, eqName); if (sc) cands.push({ ...c, sc, page: s.url, host: s.host }); });
    }
    cands.sort((a, b) => b.sc - a.sc);
    for (const c of cands.slice(0, 2)) {
      const data = await fetchImage(c.url);
      if (data) return { data, page: c.page, host: c.host, alt: c.text.slice(0, 120), src: c.url };
    }
    return null;
  }));

  /* 같은 그림은 한 항목에만, 합계 상한 안에서 앞 항목부터 */
  let total = 0;
  const used = new Set();
  const items = result.items.map((it, i) => {
    const f = found[i];
    if (!f || used.has(f.src) || total + f.data.length > IMAGES_TOTAL_BYTES * 1.34) return it;
    used.add(f.src);
    total += f.data.length;
    return { ...it, image: { data: f.data, page: f.page, host: f.host, alt: f.alt } };
  });
  return { ...result, items, images: items.filter((it) => it.image).length };
}
