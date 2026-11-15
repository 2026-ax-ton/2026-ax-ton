/* 항목 참고 사진 — api/_images.mjs (2026-11-10 사용자 요청).
   ★ 바깥 주소를 부르지 않는다 — 가짜 fetch 로 경계를 고정한다:
     출처 페이지에 실제로 있는 그림만 · 부위 이름과 맞는 그림만 · jpeg/png/webp 머리만 · 내부 주소 금지 · 없으면 사진 없음 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, eq, has, report } = require('./harness');
const I = await import('../api/_images.mjs');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(12000, 7)]);
const SVG = Buffer.concat([Buffer.from('<svg onload=alert(1)>'), Buffer.alloc(5000, 32)]);
const PAGE = '<html><body>'
  + '<img src="/logo.png" alt="회사 로고">'
  + '<img data-src="/img/ram.jpg" src="/blank.gif" alt="램과 금형 사이 끼임 위치">'
  + '<img src="https://cdn.example.com/svg.jpg" alt="페달 그림">'
  + '<img src="/tiny.jpg" alt="제어반 사진">'
  + '<img src="http://127.0.0.1/x.jpg" alt="유압 호스">'
  + '</body></html>';

const seen = [];
function fake(url, init) {
  seen.push(String(url));
  const u = new URL(url);
  const res = (body, type, status = 200, headers = {}) => new Response(body, { status, headers: { 'content-type': type, ...headers } });
  if (u.hostname === 'photo.example.com' && u.pathname === '/p') return Promise.resolve(res('<meta property="og:image" content="/og.jpg"><img src="/x.png">', 'text/html'));
  if (u.pathname === '/og.jpg') return Promise.resolve(res(Buffer.concat([JPEG, Buffer.from('og')]), 'image/jpeg'));
  if (u.hostname === 'www.youtube.com' && u.pathname === '/oembed') return Promise.resolve(!/zzzzzzzzzzz/.test(u.search) ? res(JSON.stringify({ title: '프레스 안전 영상' }), 'application/json') : res('', 'text/plain', 404));
  /* 🆕 2026-11-11 — 큰 그림(450KB) · 위키미디어 공용 그림과 사용 조건 */
  if (u.hostname === 'big.example.com' && u.pathname.startsWith('/p')) return Promise.resolve(res('<meta name="twitter:image" content="/big' + u.pathname.slice(2) + '.jpg">', 'text/html'));
  if (u.hostname === 'big.example.com') return Promise.resolve(res(Buffer.concat([JPEG, Buffer.alloc(450 * 1024, u.pathname.length), Buffer.from(u.pathname)]), 'image/jpeg'));
  if (u.hostname === 'commons.wikimedia.org' && u.pathname === '/wiki/File:Press.jpg') return Promise.resolve(res('<meta property="og:image" content="https://upload.wikimedia.org/wikipedia/commons/a/ab/Press.jpg">', 'text/html'));
  if (u.hostname === 'upload.wikimedia.org') return Promise.resolve(res(Buffer.concat([JPEG, Buffer.from('wm')]), 'image/jpeg'));
  if (u.hostname === 'commons.wikimedia.org' && u.pathname === '/w/api.php') return Promise.resolve(res(JSON.stringify({ query: { pages: { 12: { imageinfo: [{ extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a href="/u/x">Kim</a>' } } }] } } } }), 'application/json'));
  if (u.hostname === 'i.ytimg.com') return Promise.resolve(res(Buffer.concat([JPEG, Buffer.from('yt')]), 'image/jpeg'));
  if (u.pathname === '/page') return Promise.resolve(res(PAGE, 'text/html; charset=utf-8'));
  if (u.pathname === '/moved') return Promise.resolve(res('', 'text/html', 302, { location: 'http://localhost/page' }));
  if (u.pathname === '/img/ram.jpg') return Promise.resolve(res(JPEG, 'image/jpeg'));
  if (u.pathname === '/svg.jpg') return Promise.resolve(res(SVG, 'image/jpeg'));   // 이름은 jpg 지만 속은 svg
  if (u.pathname === '/tiny.jpg') return Promise.resolve(res(JPEG.subarray(0, 100), 'image/jpeg'));
  return Promise.resolve(res('', 'text/plain', 404));
}

const S = (path, extra) => ({ title: 't', url: 'https://maker.example.com' + path, host: 'maker.example.com', tier: 3, ...extra });
const result = {
  items: [
    { id: 'o1', part: '가드 재전환', official: { code: 'M-30-2002' }, sources: [S('/m30.pdf')] },
    { id: 'r1', part: '램과 금형 사이', sources: [S('/page')] },
    { id: 'r2', part: '페달', sources: [S('/page')] },
    { id: 'r3', part: '제어반', sources: [S('/page')] },
    { id: 'r4', part: '유압 호스', sources: [S('/page')] },
    { id: 'r5', part: '안전문', sources: [S('/doc.pdf'), S('/watch', { tier: 4 })] },
    { id: 'r6', part: '램과 금형 사이', sources: [S('/moved')] },
  ],
};

/* 사진 찾기 질문의 답 — o1 은 사진 페이지(대표 그림), r2 는 유튜브, r3 은 없는 영상 */
const hints = I.readPhotoHints({ items: [
  { id: 'o1', pages: ['https://photo.example.com/p', 'https://made-up.example.org/x', 'https://photo.example.com/a.pdf'] },
  { id: 'r2', pages: [], video: 'https://youtu.be/abcdefghijk' },
  { id: 'r3', video: 'https://www.youtube.com/watch?v=zzzzzzzzzzz' }] },
  { groundingChunks: [{ web: { uri: 'https://photo.example.com/other' } }] });
eq('★★ 사진 페이지는 검색 근거에 있는 사이트만 · PDF 빼고', hints.o1.pages.join(), 'https://photo.example.com/p');
eq('유튜브 주소에서 영상 id', hints.r2.video, 'abcdefghijk');
const out = await I.attachImages(result, { fetchFn: fake, budgetMs: 5000, hints });
const img = (id) => out.items.find((i) => i.id === id).image;

ok('★★ 부위 이름과 맞는 그림이 붙는다 (data-src 우선)', !!img('r1') && /^data:image\/jpeg;base64,/.test(img('r1').data));
eq('사진 출처 페이지·호스트를 남긴다', img('r1').page + '|' + img('r1').host, 'https://maker.example.com/page|maker.example.com');
has('그림 설명(alt)을 남긴다', img('r1').alt, '램과 금형 사이');
ok('★★ 공식 문서 항목도 사진 찾기 페이지의 대표 그림(og:image)을 받는다', !!img('o1') && img('o1').host === 'photo.example.com' && img('o1').kind === 'page');
ok('★★ 유튜브 영상은 공식 썸네일로 · 제목을 설명으로', !!img('r2') && img('r2').kind === 'video' && img('r2').alt === '프레스 안전 영상' && img('r2').page === 'https://www.youtube.com/watch?v=abcdefghijk');
ok('★ 영상 속 장면을 내려받지 않는다 (썸네일 주소만)', !seen.some((u) => /googlevideo|videoplayback/.test(u)));
ok('★★ 이름은 jpg 여도 속이 그림이 아니면(svg) 버린다 (페달은 영상 썸네일로 대신)', img('r2').kind === 'video');
ok('★ 너무 작은 그림(아이콘)은 버린다 · ★★ 없는 영상(oEmbed 404)도 버린다', !img('r3'));
ok('★★ 내부 주소(127.0.0.1) 그림은 열지 않는다', !img('r4') && !seen.some((u) => /127\.0\.0\.1/.test(u)));
ok('★ PDF·동영상 출처는 열지 않는다', !img('r5') && !seen.some((u) => /maker\.example\.com\/(doc\.pdf|watch)/.test(u)));
ok('★★ 리다이렉트로 localhost 에 가면 따라가지 않는다', !img('r6') && !seen.some((u) => /localhost/.test(u)));
eq('붙은 사진 수', out.images, 3);
eq('다른 값은 그대로', out.items.length, result.items.length);

eq('★ 시간이 없으면 그대로 돌려준다', (await I.attachImages(result, { fetchFn: fake, budgetMs: 0 })).items[1].image, undefined);
const broke = await I.attachImages(result, { fetchFn: () => Promise.reject(new Error('net')), budgetMs: 3000 });
eq('★ 네트워크 오류여도 터지지 않고 사진 없음', broke.images, 0);

eq('safeUrl — https 공개 호스트', I.safeUrl('https://kosha.or.kr/a'), true);
eq('safeUrl — IP 금지', I.safeUrl('http://169.254.169.254/latest'), false);
eq('safeUrl — file: 금지', I.safeUrl('file:///etc/passwd'), false);
eq('safeUrl — 점 없는 내부 이름 금지', I.safeUrl('http://intranet/x'), false);
eq('matchPart — 짧은 부위도 맞춘다', I.matchPart('페달', '발 페달 위치') > 0, true);
eq('★★ 영문 글자 조각으로 맞추지 않는다 (실측: 백게이지 ↔ Springback)', I.matchPart('백게이지(backgauge)·피더', 'Addressing Material Springback'), 0);
eq('★★ 설비 이름 낱말만 같으면 안 된다 (실측: C-프레임 ↔ 기계 프레스)', I.matchPart('C-프레임 개방 측면', '기계 프레스', 'C형 유압프레스'), 0);
eq('띄어쓰기가 달라도 낱말이 같으면 맞춘다', I.matchPart('금형교체·정비', '프레스 금형 교체 작업중 협착', '프레스') > 0, true);
eq('★ 영어 부위 이름으로 영어 그림 설명과 맞춘다', I.matchPart('백게이지 back gauge', 'Back gauge of a press brake') > 0, true);
eq('★ 영어 설비 이름 낱말만 같으면 안 된다', I.matchPart('램 ram and press', 'Hydraulic press overview'), 0);
eq('★ 괄호 안 덧붙임은 맞추는 데 안 쓴다', I.matchPart(I.mainName('제어반·배전반(아크플래시·감전 위험)'), '감전/화상 사고'), 0);
eq('matchPart — 관계없는 설명은 0', I.matchPart('램과 금형 사이', '회사 로고'), 0);

/* 🆕 2026-11-11 — 대표 그림 차례 · 종류(kind)·사용 조건(license) · 500KB · 합계를 넘으면 영상 썸네일 */
eq('대표 그림 ① og:image', I.pageImage('<meta content="/a.jpg" property="og:image"><meta name="twitter:image" content="/t.jpg">', 'https://x.com/p'), 'https://x.com/a.jpg');
eq('대표 그림 ② og 없으면 twitter:image', I.pageImage('<meta name="twitter:image" content="/t.jpg"><link rel="image_src" href="/l.jpg">', 'https://x.com/p'), 'https://x.com/t.jpg');
eq('대표 그림 ③ 그다음 link rel=image_src', I.pageImage('<link rel="image_src" href="/l.jpg"><img src="/b.jpg" width="640">', 'https://x.com/p'), 'https://x.com/l.jpg');
eq('대표 그림 ④ 마지막은 width 300 이상인 첫 <img> (작은 것·svg 는 건너뜀)', I.pageImage('<img src="/s.jpg" width="100"><img src="/v.svg" width="500"><img data-src="/d.jpg" src="/b.gif" width=400>', 'https://x.com/'), 'https://x.com/d.jpg');
eq('★★ 사이트 공통 그림(og_image·로고)은 건너뛴다 (실측: woojinplaimm.com/og_image.jpg)', I.pageImage('<meta property="og:image" content="/og_image.jpg?v=1"><meta name="twitter:image" content="/img/logo.png"><img src="/p/ram.jpg" width="800">', 'https://x.com/'), 'https://x.com/p/ram.jpg');
eq('★ 「logo」가 낱말이 아니면 제품 사진이다 (실측: …Closedwithlogo_1200x1200.jpg)', I.siteImage('https://atssafety.com/cdn/shop/files/HPGuard-HingedClosedwithlogo_1200x1200.jpg?v=1') + '|' + I.siteImage('https://x.com/site-logo.png') + '|' + I.siteImage('https://x.com/default_share.jpg'), 'false|true|true');
{
  const g = { groundingChunks: [{ web: { uri: 'https://commons.wikimedia.org/wiki/Main_Page' } }] };
  const h = I.readPhotoHints({ items: [{ id: 'r1', pages: ['https://commons.wikimedia.org/wiki/Category:Gloves', 'https://commons.wikimedia.org/wiki/File:Glove.jpg', 'https://commons.wikimedia.org/wiki/Gloves'] }] }, g);
  eq('★★ 위키미디어 공용은 파일(File:) 페이지만 — 분류·갤러리는 버린다 (실측: 장갑 → 박물관 직물 사진)', h.r1.pages.join(), 'https://commons.wikimedia.org/wiki/File:Glove.jpg');
}
has('지시문이 공용 분류 페이지를 막는다', I.photoSystemText(), 'Category:');
eq('대표 그림이 없으면 빈 값', I.pageImage('<img src="/s.jpg">', 'https://x.com/'), '');
eq('공용 그림 파일 이름 (thumb 주소)', I.commonsFile('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Press%20brake.jpg/800px-Press_brake.jpg'), 'Press brake.jpg');
eq('★ 공용 그림 파일 이름 (thumb.wikimedia.org — 2026-11-11 실측)', I.commonsFile('https://thumb.wikimedia.org/wikipedia/commons/thumb/d/db/Hydraulic_press.jpg/1280px-Hydraulic_press.jpg?utm_source=x'), 'Hydraulic_press.jpg');
eq('★ 그림 주소로 모르면 공용 파일 페이지 이름으로 사용 조건을 읽는다', await I.licenseOf('https://cdn.example.com/a.jpg', 'https://commons.wikimedia.org/wiki/File:Press.jpg', fake), 'CC BY-SA 4.0 · Kim');
eq('공용과 관계없으면 「확인 필요」 (묻지 않는다)', await I.licenseOf('https://cdn.example.com/a.jpg', 'https://maker.example.com/p', () => { throw new Error('부르면 안 됨'); }), '확인 필요');
{
  const replies = [{ text: '사진을 찾았습니다' }, { text: JSON.stringify({ items: [{ id: 'r9', video: 'https://youtu.be/abcdefghijk' }] }), grounding: null }];
  const fh = await I.findPhotoHints(async () => replies.shift(), {}, { name: '프레스' }, [1, 2, 3, 4, 5, 6].map((n) => ({ id: 'r' + n, part: 'x' })), (t) => { try { return JSON.parse(t); } catch (e) { return null; } });
  eq('★★ JSON 이 아닌 답도 실패로 센다 (조용히 빈 힌트가 되지 않게)', fh.calls + '|' + fh.error + '|' + Object.keys(fh.hints).join(), '2|model|r9');
}
eq('공용이 아닌 위키 그림은 조건을 묻지 않는다', I.commonsFile('https://upload.wikimedia.org/wikipedia/en/a/ab/X.jpg') + I.commonsFile('https://maker.example.com/a.jpg'), '');

ok('★★ 붙은 그림은 전부 kind(page|video)·license 가 있다', out.items.filter((i) => i.image).every((i) => /^(page|video)$/.test(i.image.kind) && i.image.license));
eq('★★ 공용이 아닌 그림·영상 썸네일은 사용 조건 「확인 필요」', img('r1').license + '|' + img('r2').license, '확인 필요|확인 필요');

const many = { items: [{ id: 'w1', part: '금형', sources: [] }].concat([1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: 'b' + n, part: '램', sources: [] })), [{ id: 'd1', part: '페달', sources: [] }]) };
const manyHints = { w1: { pages: ['https://commons.wikimedia.org/wiki/File:Press.jpg'], video: 'bbbbbbbbbbb' }, d1: { pages: ['https://big.example.com/p1'], video: 'ddddddddddd' } };
[1, 2, 3, 4, 5, 6, 7].forEach((n) => { manyHints['b' + n] = { pages: ['https://big.example.com/p' + n], video: 'vvvvvvvvvv' + n }; });
const big = await I.attachImages(many, { fetchFn: fake, budgetMs: 8000, hints: manyHints });
const bimg = (id) => big.items.find((i) => i.id === id).image;
eq('★★ 위키미디어 공용 그림은 그 사용 조건을 읽어 온다 (HTML 은 걷어 낸다)', bimg('w1').license, 'CC BY-SA 4.0 · Kim');
ok('★ 300KB 넘는 그림(450KB)도 받는다 — 상한 500KB', bimg('b1').kind === 'page' && bimg('b1').data.length > 450 * 1024);
ok('★★ 같은 그림을 이미 쓴 항목은 영상 썸네일로 대신한다', bimg('d1').kind === 'video' && bimg('d1').page === 'https://www.youtube.com/watch?v=ddddddddddd');
const kinds = [1, 2, 3, 4, 5, 6, 7].map((n) => bimg('b' + n).kind).join();
ok('★★ 합계 2.5MB 를 넘는 항목은 영상 썸네일로 (앞 항목은 페이지 그림)', /^page,page,page,page,page,(video,)*video$/.test(kinds) && big.images === many.items.length);
ok('★ 합계(data URL 길이)가 상한 안이다', big.items.reduce((n, i) => n + (i.image ? i.image.data.length : 0), 0) <= I.IMAGES_TOTAL_BYTES * 1.34);

report('항목 참고 사진 — api/_images.mjs');
