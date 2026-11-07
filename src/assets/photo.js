/* ===================================================================
   photo.js — 담당자가 찍은 설비 사진을 **브라우저에서 줄인다** (T17)

   왜 화면에서 줄이나 (FR-AD-07-03)

     폰 카메라 사진은 3~8MB 다. 그대로 보내면 ① 느린 현장 인터넷에서 올라가지
     않고 ② 공급사 요금이 커지고 ③ 서버 본문 상한에 걸린다.
     **줄인 사본만** 보내고, **원본은 어디에도 저장하지 않는다.**

   ★ 이 파일은 `localStorage` 를 부르지 않는다 — 사진을 기기에 남기지 않는다
     (FR-AD-07-03 · D-027 ⑤). 저장 키가 늘지 않으므로 `Store` 를 거칠 일도 없다.
   ★ 네트워크도 부르지 않는다. 부르는 자리는 `net.js` 하나다 (C06 D-030).
   ★ 의존성 0 · ES 모듈 금지 · `file://` 동작 (C05 T-5′·T-2).

   쓰는 곳 (T17 화면 — PRD-AD-07 §11 Q2 가 11/7 에 닫히면 붙인다)

       Photo.shrink(file).then(function (r) {
         if (r.failed) { 이유를 보여 주고 손 흐름으로; return; }
         Net.post('/api/hazards', { image: r.image, mime: r.mime });
       });

   ★ **던지지 않는다.** 못 줄였으면 `{ failed: 이유 }` 를 담아 돌려준다 —
     부르는 쪽이 "도해에서 직접 고르기" 로 이어가야 한다 (FR-AD-07-11).
     캔버스가 없는 아주 오래된 인앱 브라우저도 여기서 조용히 걸러진다.

   근거: PRD-AD-07 §4 FR-03 · §7 · A05 §3.1 · C06 D-027 · A02 §5.2
   =================================================================== */

var Photo = (function () {
  'use strict';

  /* ── 결정에 걸린 값 (FR-AD-07-03 「사본 크기 상한은 개발자가 정한다」) ──

     긴 변 1024px · JPEG 품질 0.7 부터 — 설비 사진에서 위험 지점을 **짚을**
     만큼은 보이고, 보통 100~250KB 로 떨어진다.
     목표 300KB 는 서버 상한(750KB, `api/hazards.mjs`)의 절반 아래다 —
     base64 로 4/3 커지는 것까지 보고 여유를 둔 값이다. */
  var MAX_EDGE = 1024;
  var TARGET_BYTES = 300 * 1024;
  var QUALITIES = [0.7, 0.55, 0.4];   // 목표보다 크면 품질만 내려 다시 뽑는다
  var MAX_INPUT_BYTES = 20 * 1024 * 1024;  // 20MB 넘는 파일은 사진이 아니라고 본다
  var MIMES = ['image/jpeg', 'image/png', 'image/webp'];
  var OUT_MIME = 'image/jpeg';        // 줄인 사본은 언제나 JPEG (가장 작다)

  /** 긴 변을 `maxEdge` 로 맞춘 크기. 원본이 더 작으면 **키우지 않는다** —
   *  키워도 정보가 늘지 않고 용량만 커진다. */
  function fit(w, h, maxEdge) {
    var max = maxEdge || MAX_EDGE;
    if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 };
    var long = Math.max(w, h);
    if (long <= max) return { w: Math.round(w), h: Math.round(h) };
    var k = max / long;
    /* 1px 아래로 내려가지 않게 한다 — 아주 가늘고 긴 사진 */
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }

  /** data URL 에서 base64 몸통만 꺼낸다.
   *  ★ 서버는 **머리(`data:image/jpeg;base64,`)가 붙으면 거절**한다 —
   *    조용히 고쳐 주면 다음에도 그렇게 보내게 된다 (`api/hazards.mjs`). */
  function body(dataUrl) {
    var at = String(dataUrl || '').indexOf(',');
    return at === -1 ? '' : dataUrl.slice(at + 1);
  }

  function bytesOf(base64) {
    var s = String(base64 || '');
    if (!s) return 0;
    var pad = s.charAt(s.length - 1) === '=' ? (s.charAt(s.length - 2) === '=' ? 2 : 1) : 0;
    return Math.floor((s.length * 3) / 4) - pad;
  }

  /** 캔버스를 쓸 수 있나. 없으면 부르는 쪽이 **묻기 전에** 손 흐름을 고를 수 있다. */
  function available() {
    if (typeof document === 'undefined' || typeof FileReader === 'undefined') return false;
    try {
      var c = document.createElement('canvas');
      return !!(c && c.getContext && c.getContext('2d') && c.toDataURL);
    } catch (e) {
      return false;
    }
  }

  function fail(why, message) {
    return { failed: why, message: message };
  }

  /** 사진 하나를 줄인다. 언제나 성공한 Promise 를 돌려준다.
   *
   *  돌려주는 값
   *    { image, mime, bytes, width, height }   줄인 사본 (base64 몸통만)
   *    { failed, message }                     못 줄였다 — 이유를 화면에 적는다
   */
  function shrink(file, opts) {
    var o = opts || {};
    var maxEdge = o.maxEdge || MAX_EDGE;
    var target = o.targetBytes || TARGET_BYTES;

    return new Promise(function (done) {
      if (!file) return done(fail('empty', '사진을 고르지 않았습니다.'));
      if (!available()) {
        return done(fail('unsupported',
          '이 브라우저에서는 사진을 줄일 수 없습니다. 도해에서 직접 고르실 수 있습니다.'));
      }
      if (file.type && MIMES.indexOf(file.type) === -1) {
        return done(fail('type', '사진 파일(JPG·PNG·WebP)만 넣을 수 있습니다.'));
      }
      if (file.size && file.size > MAX_INPUT_BYTES) {
        return done(fail('too_big', '사진이 너무 큽니다. 다시 찍어 주세요.'));
      }

      var reader = new FileReader();
      reader.onerror = function () { done(fail('read', '사진을 읽지 못했습니다. 다시 찍어 주세요.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { done(fail('decode', '사진을 읽지 못했습니다. 다시 찍어 주세요.')); };
        img.onload = function () {
          var size = fit(img.width, img.height, maxEdge);
          if (!size.w || !size.h) return done(fail('decode', '사진을 읽지 못했습니다. 다시 찍어 주세요.'));

          var canvas = document.createElement('canvas');
          canvas.width = size.w;
          canvas.height = size.h;
          var ctx = canvas.getContext('2d');
          if (!ctx) return done(fail('unsupported', '이 브라우저에서는 사진을 줄일 수 없습니다.'));

          try {
            ctx.drawImage(img, 0, 0, size.w, size.h);
          } catch (e) {
            return done(fail('decode', '사진을 읽지 못했습니다. 다시 찍어 주세요.'));
          }

          /* 목표 크기에 들 때까지 **품질만** 내린다. 크기를 더 줄이면 위험 지점을
             짚을 수 없게 된다 — 작게 만드는 것보다 **보이는 것**이 먼저다. */
          var out = '';
          var bytes = 0;
          for (var i = 0; i < QUALITIES.length; i += 1) {
            try {
              out = body(canvas.toDataURL(OUT_MIME, QUALITIES[i]));
            } catch (e) {
              return done(fail('unsupported', '이 브라우저에서는 사진을 줄일 수 없습니다.'));
            }
            bytes = bytesOf(out);
            if (bytes && bytes <= target) break;
          }

          if (!out) return done(fail('encode', '사진을 줄이지 못했습니다. 다시 찍어 주세요.'));
          if (bytes > target) {
            /* 가장 낮은 품질로도 목표를 넘었다 — 보내지 않고 다시 찍게 한다.
               억지로 더 줄이면 사람이 짚을 수 없는 사진이 된다 */
            return done(fail('too_big', '사진이 너무 큽니다. 조금 멀리서 다시 찍어 주세요.'));
          }

          done({ image: out, mime: OUT_MIME, bytes: bytes, width: size.w, height: size.h });
        };
        img.src = reader.result;
      };

      try {
        reader.readAsDataURL(file);
      } catch (e) {
        done(fail('read', '사진을 읽지 못했습니다. 다시 찍어 주세요.'));
      }
    });
  }

  return {
    shrink: shrink,
    fit: fit,
    available: available,
    bytesOf: bytesOf,
    MAX_EDGE: MAX_EDGE,
    TARGET_BYTES: TARGET_BYTES,
    MIMES: MIMES,
    OUT_MIME: OUT_MIME
  };
})();
