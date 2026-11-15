/* ===================================================================
   limits.js — **교육 1건이 커지지 않게 하는 상한** (2026-11-15)

   왜 필요한가 (11/13 발견 2 · 11/15 실측)

     동기화 한 덩어리의 상한은 512KB 다 (`api/store.mjs` MAX_SYNC_BYTES).
     그런데 AI 자동 생성으로 만든 교육 1건을 재 보니 **약 530KB** 였다 —
       · 보기 그림 12장 (560×316~374 JPEG)     175KB
       · 설비 사진 1장 (교육에 통째로 복사된다)  340KB
       · 문항 글·위험요소                        14KB
     **교육을 하나도 올리지 못하는 크기**다. 넘는 것을 막는 검사도 없어서
     담당자는 발급 버튼을 누른 뒤에야 「저장하지 못했습니다」를 본다.

   무엇을 하나 — 두 겹이다

     ① **줄인다** — 보기 그림은 긴 변 320px, 설비 사진은 560px 로 다시 뽑는다
        (`Photo.shrinkDataUrl`). 화면에서 보기 그림은 최대 420px 폭으로
        그려지고(`worker.css .choice-btn .pic`), 설비 사진은 위험 지점을 짚는
        그림이라 조금 더 크게 둔다
     ② **막는다** — 그래도 상한을 넘으면 **발급 전에** 이유를 보여 주고 막는다
        (`admin/autogen` 검토 단계). 서버도 저장할 때 같은 값으로 다시 본다
        (`api/_courses.mjs`) — 화면을 거치지 않고 들어오는 길이 있기 때문이다

   ★ 이 파일은 **숫자가 사는 한 곳**이다. 서버 쪽 같은 값은
     `api/_courses.mjs` 맨 위에 **한 벌 더** 있다 — `src/` 는 ES 모듈이
     아니고(C05 T-2, `file://` 에서 열린다) 서버는 ES 모듈이라 한 파일을
     같이 쓸 수 없다. **두 곳이 어긋나지 않는지는 검사가 지킨다**
     (`tests/test-course-size.js`).

   ★ 바깥을 부르지 않는다 — 네트워크·`localStorage`·캔버스 없음. 순수 계산만.

   근거: C06 D-048 · A02 §14.5 · PRD-AD-08 §13 · D07 STC-E25-020~022
   =================================================================== */

var Limits = (function () {
  'use strict';

  /* ── 결정에 걸린 값 (C06 D-048) ──────────────────────────────────

     교육 1건 100KB × 5건 = 500KB 로 512KB 상한 아래에 든다.
     시연에서 필요한 「교육 3건 이상」(07 11/15 블록)을 넘는다.
     아래 상한대로 줄이면 11/12 실측 교육(설비 사진 1장 + 보기 그림 12장 +
     문항 10개)이 **약 90KB 로 추정**된다 — 10KB 가 여유다. 추정인 이유는
     다시 뽑는 일이 브라우저 캔버스에서 일어나기 때문이다. 실제 값은 담당자
     화면에서 한 바퀴 돌려 재야 한다 (D07 🧑). */
  var MAX_COURSE_BYTES = 100 * 1024;

  /* 보기 그림(그림 고르기 문항의 `pics`) — 교육 하나가 가질 수 있는 장수와 한 장 크기.
     12장은 「위험 5개 × 그림 고르기 1문항 × 보기 3장」을 담고도 남는 수다.
     320px 는 화면에 그려지는 최대 폭 420px 보다 작다 — 폰에서 조금 부드럽게
     보이지만, 「안전하게 일하는 그림」을 **고르는** 데는 충분하다 */
  var MAX_PICS = 12;
  var PIC_MAX_EDGE = 320;
  var PIC_MAX_BYTES = 6 * 1024;

  /* 설비 사진 1장 — 노동자가 위험 지점을 **짚는** 그림이라 보기 그림보다 크게 둔다.
     11/12 실측 원본은 1280×944 · 332KB 였다 */
  var PHOTO_MAX_EDGE = 560;
  var PHOTO_MAX_BYTES = 36 * 1024;

  /** UTF-8 로 몇 바이트인가 — 한글은 글자당 3바이트라 `length` 로는 모자란다 */
  function bytesOf(value) {
    var s = typeof value === 'string' ? value : JSON.stringify(value === undefined ? null : value);
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(s).length;
    /* 아주 오래된 브라우저 — 자리수만 세어도 상한 판정에는 충분하다 */
    return unescape(encodeURIComponent(s)).length;
  }

  /** 교육 한 건의 보기 그림 전부 — [{ qi, pi, pic }] */
  function picsOf(course) {
    var out = [];
    var quiz = course && Array.isArray(course.quiz) ? course.quiz : [];
    quiz.forEach(function (q, qi) {
      var pics = q && Array.isArray(q.pics) ? q.pics : [];
      pics.forEach(function (pic, pi) {
        if (typeof pic === 'string' && pic.indexOf('data:image/') === 0) out.push({ qi: qi, pi: pi, pic: pic });
      });
    });
    return out;
  }

  /** 교육 한 건이 차지하는 바이트 */
  function courseBytes(course) {
    return bytesOf(course);
  }

  /** 사람이 읽는 크기 — 「77KB」 */
  function kb(bytes) {
    return Math.round(bytes / 1024) + 'KB';
  }

  /** 교육 한 건의 크기 문제 — 없으면 ''.
   *
   *  ★ 순서가 중요하다. **무엇을 줄이면 되는지**를 먼저 말해 준다 —
   *    「100KB 를 넘었습니다」만 보여 주면 담당자가 할 수 있는 일이 없다. */
  function courseSizeProblem(course) {
    if (!course || typeof course !== 'object') return '';
    var pics = picsOf(course);
    if (pics.length > MAX_PICS) {
      return '보기 그림이 ' + pics.length + '장입니다. ' + MAX_PICS + '장까지 넣을 수 있습니다';
    }
    var big = null;
    for (var i = 0; i < pics.length; i += 1) {
      var n = bytesOf(pics[i].pic);
      if (n > PIC_MAX_BYTES) { big = { at: pics[i].qi + 1, bytes: n }; break; }
    }
    if (big) {
      return big.at + '번째 문항의 보기 그림이 ' + kb(big.bytes) + ' 입니다. 한 장은 ' + kb(PIC_MAX_BYTES) + ' 까지입니다';
    }
    var photo = course.photo;
    if (typeof photo === 'string' && photo.indexOf('data:image/') === 0) {
      var pb = bytesOf(photo);
      if (pb > PHOTO_MAX_BYTES) {
        return '설비 사진이 ' + kb(pb) + ' 입니다. ' + kb(PHOTO_MAX_BYTES) + ' 까지입니다';
      }
    }
    var total = courseBytes(course);
    if (total > MAX_COURSE_BYTES) {
      return '교육 1건이 ' + kb(total) + ' 입니다. ' + kb(MAX_COURSE_BYTES) + ' 까지입니다';
    }
    return '';
  }

  return {
    MAX_COURSE_BYTES: MAX_COURSE_BYTES,
    MAX_PICS: MAX_PICS,
    PIC_MAX_EDGE: PIC_MAX_EDGE,
    PIC_MAX_BYTES: PIC_MAX_BYTES,
    PHOTO_MAX_EDGE: PHOTO_MAX_EDGE,
    PHOTO_MAX_BYTES: PHOTO_MAX_BYTES,
    bytesOf: bytesOf,
    picsOf: picsOf,
    courseBytes: courseBytes,
    courseSizeProblem: courseSizeProblem,
    kb: kb
  };
})();
