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
    { id: 'o1', part: '램과 금형 사이', official: { code: 'M-30-2002' }, sources: [S('/page')] },
    { id: 'r1', part: '램과 금형 사이', sources: [S('/page')] },
    { id: 'r2', part: '페달', sources: [S('/page')] },
    { id: 'r3', part: '제어반', sources: [S('/page')] },
    { id: 'r4', part: '유압 호스', sources: [S('/page')] },
    { id: 'r5', part: '안전문', sources: [S('/doc.pdf'), S('/watch', { tier: 4 })] },
    { id: 'r6', part: '램과 금형 사이', sources: [S('/moved')] },
  ],
};

const out = await I.attachImages(result, { fetchFn: fake, budgetMs: 5000 });
const img = (id) => out.items.find((i) => i.id === id).image;

ok('★★ 부위 이름과 맞는 그림이 붙는다 (data-src 우선)', !!img('r1') && /^data:image\/jpeg;base64,/.test(img('r1').data));
eq('사진 출처 페이지·호스트를 남긴다', img('r1').page + '|' + img('r1').host, 'https://maker.example.com/page|maker.example.com');
has('그림 설명(alt)을 남긴다', img('r1').alt, '램과 금형 사이');
ok('★★ 공식 문서 항목은 건드리지 않는다', !img('o1'));
ok('★★ 이름은 jpg 여도 속이 그림이 아니면(svg) 버린다', !img('r2'));
ok('★ 너무 작은 그림(아이콘)은 버린다', !img('r3'));
ok('★★ 내부 주소(127.0.0.1) 그림은 열지 않는다', !img('r4') && !seen.some((u) => /127\.0\.0\.1/.test(u)));
ok('★ PDF·동영상 출처는 열지 않는다', !img('r5') && !seen.some((u) => /doc\.pdf|watch/.test(u)));
ok('★★ 리다이렉트로 localhost 에 가면 따라가지 않는다', !img('r6') && !seen.some((u) => /localhost/.test(u)));
eq('붙은 사진 수', out.images, 1);
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
eq('matchPart — 관계없는 설명은 0', I.matchPart('램과 금형 사이', '회사 로고'), 0);

report('항목 참고 사진 — api/_images.mjs');
