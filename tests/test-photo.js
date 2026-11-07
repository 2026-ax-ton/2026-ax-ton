/* src/assets/photo.js — 담당자 사진을 브라우저에서 줄인다 (T17 · FR-AD-07-03).

   ★ jsdom 에는 **캔버스가 없다.** 그래서 이 묶음은 두 가지를 한다:
     ① 크기 계산·용량 계산 같은 **순수 함수**를 그대로 검사한다
     ② 캔버스가 없을 때 **조용히 터지지 않고 이유를 돌려주는지** 본다 —
        아주 오래된 인앱 브라우저가 바로 이 상태다. 여기서 던지면 담당자
        화면이 아무 반응 없는 화면이 된다 (FR-AD-07-11)
     그려서 줄이는 실제 동작은 **사람이 실기기로** 확인한다 (D07 🧑).

   이 묶음이 지키는 것
     1. ★★ `localStorage` 를 부르지 않는다 — 사진을 기기에 남기지 않는다 (FR-03)
     2. ★★ 네트워크를 부르지 않는다 — 부르는 자리는 `net.js` 하나다 (C06 D-030)
     3. ★★ 캔버스가 없으면 **이유를 담아 돌려준다.** 던지지 않는다
     4. ★ 긴 변을 1024px 로 맞추되 **작은 사진을 키우지 않는다**
     5. ★ 사진이 아닌 파일·너무 큰 파일은 받지 않는다
     6. ★ 서버가 거절하는 `data:` 머리를 붙여 보내지 않는다 (base64 몸통만)
     7. 의존성 0 · ES 모듈 금지 · `innerHTML` 금지 (C05)

   근거: PRD-AD-07 §4 FR-03·11 · §7 · A05 §3.1 · C05 T-2·T-5′ */

const fs = require('fs');
const path = require('path');
const { ok, eq, report, SRC } = require('./harness');

const code = fs.readFileSync(path.join(SRC, 'assets/photo.js'), 'utf8');

/** 캔버스 없는 창에서 photo.js 를 그대로 돌린다 (jsdom 기본 상태와 같다). */
function load(overrides) {
  const win = {
    Promise,
    FileReader: function FileReader() {},
    Image: function Image() {},
    document: {
      createElement: () => ({ getContext: () => null }),
    },
    ...overrides,
  };
  const fn = new Function(
    'document', 'FileReader', 'Image',
    code + '\n;return Photo;',
  );
  return fn(win.document, win.FileReader, win.Image);
}

const Photo = load();

/* =================================================================
   1. 규칙 — 저장도 네트워크도 하지 않는다
   ================================================================= */
{
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('★★ localStorage 를 부르지 않는다 (사진을 기기에 남기지 않는다)',
    !/localStorage/.test(bare));
  ok('★★ Store 를 거치지 않는다 (저장 키가 늘지 않는다)', !/Store\./.test(bare));
  ok('★★ 네트워크를 부르지 않는다 (부르는 자리는 net.js 하나)',
    !/\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(bare));
  ok('★ innerHTML 을 쓰지 않는다', !/innerHTML/.test(code));
  ok('★ ES 모듈을 쓰지 않는다 (file:// 에서 막힌다)', !/^\s*(import|export)\s/m.test(code));
  ok('★ 공급사 주소가 없다 (보내는 것은 net.js 가 한다)',
    !/googleapis|generativelanguage|https?:\/\//.test(bare));
}

/* =================================================================
   2. 크기 계산 — 긴 변 1024px, 작은 사진은 키우지 않는다
   ================================================================= */
{
  eq('기본 긴 변은 1024px', Photo.MAX_EDGE, 1024);

  const wide = Photo.fit(4032, 3024);
  eq('가로가 긴 사진 — 가로를 1024 로', wide.w, 1024);
  eq('비율을 지킨다', wide.h, 768);

  const tall = Photo.fit(3024, 4032);
  eq('세로가 긴 사진 — 세로를 1024 로', tall.h, 1024);
  eq('비율을 지킨다 (세로)', tall.w, 768);

  const small = Photo.fit(640, 480);
  eq('★ 작은 사진은 키우지 않는다 (가로)', small.w, 640);
  eq('★ 작은 사진은 키우지 않는다 (세로)', small.h, 480);

  const exact = Photo.fit(1024, 1024);
  eq('딱 맞으면 그대로', exact.w + 'x' + exact.h, '1024x1024');

  const thin = Photo.fit(8000, 3);
  eq('★ 아주 가늘고 긴 사진도 1px 아래로 내려가지 않는다', thin.h >= 1, true);
  eq('그 경우 긴 변은 상한에 맞는다', thin.w, 1024);

  eq('크기를 모르면 0', Photo.fit(0, 0).w, 0);
  eq('음수도 0', Photo.fit(-10, 10).w, 0);
  eq('상한을 직접 줄 수 있다', Photo.fit(2048, 1024, 512).w, 512);
}

/* =================================================================
   3. 용량 계산 — base64 길이에서 바이트를 센다
   ================================================================= */
{
  const b64 = (s) => Buffer.from(s).toString('base64');
  eq('채움 없음', Photo.bytesOf(b64('abc')), 3);
  eq('채움 1개(=)', Photo.bytesOf(b64('abcde')), 5);
  eq('채움 2개(==)', Photo.bytesOf(b64('abcd')), 4);
  eq('빈 값은 0', Photo.bytesOf(''), 0);
  eq('없는 값도 0', Photo.bytesOf(undefined), 0);
  eq('목표 크기는 300KB', Photo.TARGET_BYTES, 300 * 1024);
  ok('★ 목표가 서버 상한(750KB)보다 넉넉히 작다 — base64 로 4/3 커진다',
    Photo.TARGET_BYTES * (4 / 3) < 750 * 1024);
}

/* =================================================================
   4. 캔버스가 없을 때 — 던지지 않고 이유를 돌려준다
   ================================================================= */
{
  eq('★★ 캔버스가 없으면 available() 이 거짓', Photo.available(), false);

  const file = { type: 'image/jpeg', size: 1234 };
  Photo.shrink(file).then((r) => {
    ok('★★ 던지지 않고 돌려준다', !!r.failed);
    eq('★★ 이유가 「쓸 수 없다」다', r.failed, 'unsupported');
    ok('★★ 손 흐름으로 가라고 적어 준다 (도해에서 직접 고르기)',
      /도해에서 직접/.test(r.message));
  });
}

/* =================================================================
   5. 받지 않는 입력 — 캔버스가 있어도 먼저 걸러진다
   ================================================================= */
{
  /* 캔버스가 있는 창을 흉내 낸다 (그리기까지 가지는 않는다 — 입력 검사만 본다) */
  const WithCanvas = load({
    document: {
      createElement: () => ({
        getContext: () => ({ drawImage: () => {} }),
        toDataURL: () => 'data:image/jpeg;base64,AAAA',
      }),
    },
  });
  eq('캔버스가 있으면 available() 이 참', WithCanvas.available(), true);

  WithCanvas.shrink(null).then((r) => {
    eq('★ 사진을 안 고르면 empty', r.failed, 'empty');
  });
  WithCanvas.shrink({ type: 'application/pdf', size: 10 }).then((r) => {
    eq('★ 사진이 아닌 파일은 type', r.failed, 'type');
  });
  /* 2026-11-07 (D-038) — 앨범의 HEIC·GIF 도 그림이면 받는다. 출력은 언제나 JPEG */
  ok('★ 입력은 image/* 면 받는다 (앨범 사진)', /\^image\\\//.test(code));
  WithCanvas.shrink({ type: 'text/plain', size: 10 }).then((r) => {
    eq('★ 그림이 아닌 파일은 type', r.failed, 'type');
  });
  WithCanvas.shrink({ type: 'image/jpeg', size: 21 * 1024 * 1024 }).then((r) => {
    eq('★ 20MB 를 넘으면 too_big', r.failed, 'too_big');
  });

  eq('★ 받는 형식은 셋뿐이다', WithCanvas.MIMES.join(','), 'image/jpeg,image/png,image/webp');
  eq('★ 줄인 사본은 언제나 JPEG (가장 작다)', WithCanvas.OUT_MIME, 'image/jpeg');
}

/* =================================================================
   6. 서버가 거절하는 모양을 보내지 않는다 (base64 몸통만)
   ================================================================= */
{
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, '');
  ok('★★ data URL 에서 쉼표 뒤 몸통만 꺼낸다', /indexOf\(','\)/.test(bare));
  ok('★ 서버가 머리 붙은 값을 거절한다는 것을 적어 두었다',
    /머리.*거절|거절.*머리/.test(code));

  /* 서버 쪽 짝 — 같은 약속을 양쪽에 적어 두었는지 */
  const api = fs.readFileSync(path.join(SRC, '../api/hazards.mjs'), 'utf8');
  ok('★★ 서버는 base64 몸통만 받는다', /BASE64\s*=/.test(api));
  ok('★ 서버 상한이 750KB 다', /750 \* 1024/.test(api));
}

report('사진 줄이기 — 기기에 남기지 않고, 못 줄이면 이유를 돌려준다');
