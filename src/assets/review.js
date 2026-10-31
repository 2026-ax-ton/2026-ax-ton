/* ===================================================================
   review.js — 역번역 대조 (공용)

   읽는 키: 없음 (순수 함수만)
   쓰는 키: 없음
   근거: SCREEN 기능9 · PRD §9.3

   번역문을 다시 한국어로 돌린 것(역번역)을 원문과 견줘 본다.
   기능9(운영자 검수)와 기능2(담당자가 문항 번역을 넣을 때) 둘이 같은 판정을
   써야 한다. 두 화면이 각자 판정하면 한쪽이 통과시킨 것을 다른 쪽이 막는다.

   ★ 이것은 사람이 볼 곳을 좁혀 주는 것뿐이다. 판정은 사람이 한다.
     "AI 여기까지 · 승인은 사람" 의 경계가 이 파일이다.

   ★ 가장 중요한 것은 negationFlipped 다.

     낱말이 다른 것만으로는 위험을 가릴 수 없다.
     "환기팬이 돌지 않으면" 이 "팬이 꺼져 있으면" 이 되는 것은 말만 바꿔 쓴 것이고,
     "손을 넣지 마십시오" 가 "손을 넣어도 됩니다" 가 되는 것은 정반대 지시다.
     둘을 같은 세기로 표시하면 운영자가 표시를 무시하게 되고,
     그러면 정작 뜻이 뒤집힌 문구가 그냥 지나간다.
   =================================================================== */

var Review = (function () {
  'use strict';

  function words(text) {
    return String(text || '').split(/\s+/).filter(Boolean);
  }

  /* 낱말의 어간만 비교한다 — "마십시오" 와 "마세요" 를 다르다고 하면
     표시가 너무 많아져서 정작 뒤집힌 곳이 묻힌다. */
  function stem(word) {
    return word.replace(/[.,!?"'()]/g, '').slice(0, 2);
  }

  /* 역번역의 낱말마다 { text, isNew } — isNew 는 원문에 없던 낱말 */
  function diffWords(original, back) {
    var have = {};
    words(original).forEach(function (w) { have[stem(w)] = true; });
    return words(back).map(function (w) {
      return { text: w, isNew: !have[stem(w)] };
    });
  }

  function newWordCount(original, back) {
    return diffWords(original, back).filter(function (t) { return t.isNew; }).length;
  }

  /* 부정 표현의 개수가 한쪽에만 있으면 뜻이 뒤집혔을 수 있다

     ★ 2026-10-31 — 「~면 안 됩니다」가 빠져 있었다.
       실측에서 베트남어 역번역이 "손을 넣으면 안 됩니다" 로 돌아왔는데
       금지가 멀쩡히 살아 있는데도 「뜻 뒤집힘」으로 걸렸다 (헛경보).
       이 파일 맨 위에 적어 둔 대로, 헛경보가 쌓이면 운영자가 표시를 무시하게 되고
       그러면 정작 뜻이 뒤집힌 문구가 그냥 지나간다. 그래서 「안 되다」를 넣는다.

       「안」 하나만으로는 잡지 않는다 — 안전·안내·안쪽이 전부 걸린다.
       뒤에 「되다」의 활용형(되·돼·됩·된·될·됐)이 붙은 것만 부정으로 본다. */
  var NEGATIONS = /(마십시오|마세요|마시오|하지\s*말|않|없|아니|못\s|금지|불가|안\s*[되돼됩된될됐])/g;

  function negationCount(text) {
    var found = String(text || '').match(NEGATIONS);
    return found ? found.length : 0;
  }

  function negationFlipped(original, back) {
    if (!back) return false;
    // 한쪽은 부정이고 다른 쪽은 부정이 아니면 뒤집힌 것이다
    return (negationCount(original) > 0) !== (negationCount(back) > 0);
  }

  return {
    words: words,
    diffWords: diffWords,
    newWordCount: newWordCount,
    negationCount: negationCount,
    negationFlipped: negationFlipped
  };
})();
