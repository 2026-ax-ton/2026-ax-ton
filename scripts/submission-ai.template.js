/* ===================================================================
   submission-ai.template.js — 제출본에서만 실리는 조각 (C06 D-034 ②)

   ★ 이 파일은 `src/` 안에 없다. 일부러 그렇다.

     `src/` 는 「제3자 요청 0건 · 키 0건」을 검사로 증명한 상태다
     (`tests/test-smoke.js` 는 `src/` 어디에도 fetch 가 net.js·sw.js 밖에
      없는지 보고, `tests/test-agent-boundary.js` 는 `AIza…` 가 없는지 본다).
     공급사를 직접 부르는 코드와 키를 `src/` 에 넣으면 그 증명이 깨지고,
     배포본에도 같이 실려 버린다. 그래서 틀만 여기 두고,
     `scripts/build-submission.mjs` 가 `submission/` 으로 찍어 낸다.

   왜 있나 — 2026-11-03 개정 공지 (C08 §7.1)

     「프론트엔드 HTML + 팀에서 직접 운영하는 백엔드 서버와 통신하는 방식은 불가」
     → 제출본은 우리 `/api` 를 부를 수 없다 (C06 D-034).
     「다만 AI 모델 API 를 HTML 에서 직접 호출하는 것은 허용」
     → 제출본에서는 이 조각이 Gemini 를 직접 부른다.

   무엇을 갈아 끼우나

     Net.aiReady()  false → true   (제출본에서도 AI 버튼이 산다)
     Net.post()     /api/translate · /api/backtranslate · /api/hazards 세 길만
                    가로챈다. 그 밖의 길(로그인·동기화·신고)은 **원래대로 둔다** —
                    우리 서버는 부르지 않으므로 그대로 로컬 모드로 간다.

   넘지 않는 선 (배포본과 똑같이 지킨다)

     · 노동자 화면에는 이 조각을 싣지 않는다 — 제3자 요청 0건 그대로
       (`build-submission.mjs` 가 운영자 화면 한 장에만 넣는다)
     · AI 결과는 언제나 `waiting`. 승인은 사람만 한다 (FR-AD-03-06)
     · 역번역에는 원문 한국어를 주지 않는다 (A02 §5.4)
     · 지시문은 서버(`api/*.mjs`)에서 **그대로 뽑아 온다** — 두 곳에
       손으로 베끼지 않는다 (빌드가 끼워 넣는다)
     · 사진 위험 지점의 **거르는 규칙**(6종 밖 버림·5개 상한·퍼센트 검사)도
       `api/_hazards.mjs` 의 **소스를 그대로 끼워 넣는다** — 베끼지 않는다.
       제출본에서 경계가 느슨해지면 그게 가장 위험하다 (C06 D-027)
     · 사진은 담당자가 찍은 설비 사진만 보낸다. 사람·이름표가 찍혔다고 하면
       지점을 **돌려주지 않고** 다시 찍게 한다 (FR-AD-07-20)
     · 실패·한도·시간 초과면 이유를 적고 손 입력으로 돌아간다 (FR-AD-03-07)
     · 모델 출력은 믿을 수 없는 문자열이다 — 보여 주는 쪽이 textContent 를 쓴다

   ★ 이 파일 안의 __대문자_빈칸__ 은 빌드가 채운다. 키를 여기에 적지 않는다.
   =================================================================== */

(function () {
  'use strict';

  if (typeof Net === 'undefined') return;

  /* ── 빌드가 채우는 자리 ──────────────────────────────────────────── */

  var KEY = '__GEMINI_KEY__';                 // 해커톤용 임시 키 (행사 뒤 폐기)
  var MODEL_TRANSLATE = '__MODEL_TRANSLATE__';
  var MODEL_BACK = '__MODEL_BACK__';
  var LANG_NAMES = __LANG_NAMES__;            // 서버 `_shared.mjs` 의 고정 표
  var SYS_TRANSLATE = __SYS_TRANSLATE__;      // api/translate.mjs 에서 뽑아 왔다
  var SYS_TRANSLATE_RETRY = __SYS_TRANSLATE_RETRY__;
  var SYS_BACK = __SYS_BACK__;                // api/backtranslate.mjs 에서
  var MODEL_PHOTO = '__MODEL_PHOTO__';        // 사진 (없으면 번역과 같은 모델)
  var SYS_HAZARDS = __SYS_HAZARDS__;          // api/_hazards.mjs 의 systemText

  /* ── 서버와 같은 값 (A02 §5.2·§5.3) ─────────────────────────────── */

  var BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
  var TIMEOUT_MS = 20000;
  var MAX_OUTPUT_TOKENS = 600;
  var MAX_TEXT = 600;
  var MAX_PHOTO_TOKENS = 1200;      // 사진 응답은 JSON 이라 번역문보다 길다
  var MAX_PHOTO_ANSWER = 4000;
  var PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
  var BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

  /* ── api/_hazards.mjs 를 그대로 끼워 넣은 자리 (빌드가 채운다) ──────
     `export` 만 떼고 소스를 옮긴다. HAZARDS·MAX_POINTS·systemText·
     parseModelJson·filterPoints·overlapCount 가 여기서 생긴다. */
  /* eslint-disable */
__HAZARD_RULES__
  /* eslint-enable */

  /* 하루 상한 — 서버의 3층 방어 중 우리가 파일 안에서 흉내 낼 수 있는 몫이다
     (A02 §5.6). 공급사 예산 상한이 마지막 방어로 남아 있다 (A04 6-1). */
  var DAILY_LIMIT = 300;
  var used = 0;

  if (!KEY || KEY.indexOf('__') === 0) return;   // 키를 못 채웠으면 끼어들지 않는다

  /* ── 공급사를 한 번 부른다 ──────────────────────────────────────── */

  function callModel(model, systemText, parts, maxTokens) {
    var ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ac) ac.abort(); }, TIMEOUT_MS);

    var opts = {
      method: 'POST',
      headers: {
        /* 키는 주소(쿼리)가 아니라 헤더로 보낸다 — 주소는 기록에 남기 쉽다 */
        'x-goog-api-key': KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemText }] },
        contents: [{ role: 'user', parts: parts }],
        generationConfig: {
          maxOutputTokens: maxTokens || MAX_OUTPUT_TOKENS,
          thinkingConfig: { thinkingLevel: 'low' }
        }
      })
    };
    if (ac) opts.signal = ac.signal;

    return fetch(BASE + '/' + encodeURIComponent(model) + ':generateContent', opts)
      .then(function (res) {
        clearTimeout(timer);
        if (res.status === 429) return { error: 'limit', why: '공급사 한도' };
        if (!res.ok) return { error: 'model', why: '모델 응답 ' + res.status };
        return res.json().then(function (data) {
          if (data && data.promptFeedback && data.promptFeedback.blockReason) {
            return { error: 'model', why: '모델이 막음' };
          }
          var got = data && data.candidates && data.candidates[0]
            && data.candidates[0].content && data.candidates[0].content.parts;
          var out = got && got[0] && typeof got[0].text === 'string' ? got[0].text.trim() : '';
          if (out.length < 1) return { error: 'model', why: '빈 출력' };
          return { text: out };
        }, function () { return { error: 'model', why: 'JSON 이 아님' }; });
      }, function () {
        clearTimeout(timer);
        var timedOut = ac && ac.signal.aborted;
        return timedOut
          ? { error: 'timeout', why: TIMEOUT_MS + 'ms 초과' }
          : { error: 'model', why: '모델에 닿지 못함' };
      });
  }

  /* 서버가 내던 것과 **같은 모양**으로 돌려준다. 부르는 쪽(agent.js)은
     제출본인지 배포본인지 알 필요가 없다. */
  function okBody(body) { return { ok: true, status: 200, data: body }; }

  var STATUS = { model: 502, timeout: 504, limit: 429 };
  var MESSAGE = {
    model: '번역 모델이 응답하지 못했습니다.',
    timeout: '번역 모델이 제시간에 답하지 못했습니다.',
    limit: 'AI 사용 한도에 걸렸습니다. 잠시 뒤 다시 받거나 직접 입력해 주세요.'
  };

  function failBody(r) {
    var code = STATUS[r.error] ? r.error : 'model';
    return {
      ok: false,
      status: STATUS[code],
      data: {
        error: code,
        message: MESSAGE[code] + (r.why ? ' (' + r.why + ')' : '')
      }
    };
  }

  function overLimit() {
    return {
      ok: false,
      status: 429,
      data: { error: 'limit', message: '오늘 AI 사용 한도를 넘었습니다.' }
    };
  }

  /* ── 두 길을 가로챈다 ───────────────────────────────────────────── */

  function translate(body) {
    var ko = body && typeof body.ko === 'string' ? body.ko.trim() : '';
    var name = LANG_NAMES[body && body.lang];
    var attempt = body && body.attempt ? body.attempt : 0;
    var hint = body && typeof body.hint === 'string' ? body.hint.trim() : '';
    if (!ko || !name) {
      return Promise.resolve({
        ok: false, status: 400,
        data: { error: 'bad_request', message: '보낸 내용을 읽을 수 없습니다.' }
      });
    }
    var sys = SYS_TRANSLATE.replace('__LANG__', name);
    /* 재시도에는 앞 역번역을 붙여 무엇이 뒤집혔는지 알린다 (A02 §5.3) */
    if (attempt > 0 && hint) sys += SYS_TRANSLATE_RETRY.replace('__HINT__', hint);
    return callModel(MODEL_TRANSLATE, sys, [{ text: ko }], MAX_OUTPUT_TOKENS)
      .then(function (r) {
        if (r.error) return failBody(r);
        /* 길이 상한은 부르는 쪽이 본다 — 번역문 600자, 사진 응답 JSON 은 다르다 */
        if (r.text.length > MAX_TEXT) return failBody({ error: 'model', why: '출력이 너무 김' });
        return okBody({ text: r.text, model: MODEL_TRANSLATE, attempt: attempt });
      });
  }

  function backtranslate(body) {
    var text = body && typeof body.text === 'string' ? body.text.trim() : '';
    var name = LANG_NAMES[body && body.lang];
    if (!text || !name) {
      return Promise.resolve({
        ok: false, status: 400,
        data: { error: 'bad_request', message: '보낸 내용을 읽을 수 없습니다.' }
      });
    }
    /* ★ 한국어 원문은 주지 않는다 — 주면 모델이 원문에 맞춰 고쳐서
         대조가 무의미해진다 (A02 §5.4). 여기서도 `text` 만 넘긴다. */
    return callModel(MODEL_BACK, SYS_BACK.replace('__LANG__', name),
      [{ text: text }], MAX_OUTPUT_TOKENS)
      .then(function (r) {
        if (r.error) return failBody(r);
        if (r.text.length > MAX_TEXT) return failBody({ error: 'model', why: '출력이 너무 김' });
        return okBody({ back: r.text, model: MODEL_BACK });
      });
  }

  /* ── 사진 위험 지점 (T17 · FR-AD-07) ─────────────────────────────
     `api/hazards.mjs` 와 **같은 울타리**를 지킨다 — 거르는 규칙은 위에 끼워 넣은
     `api/_hazards.mjs` 소스를 그대로 쓴다. 다른 점은 둘뿐이다:
       ① 토큰·역할 검사가 없다 (제출본에는 서버도 계정도 없다 — 목업 로그인이다)
       ② 사진 크기 상한을 화면 쪽(`photo.js` 300KB)에 맡긴다 */
  function hazards(body) {
    var image = body && typeof body.image === 'string' ? body.image.trim() : '';
    var mime = body && typeof body.mime === 'string' ? body.mime.trim() : '';
    if (!image || PHOTO_MIMES.indexOf(mime) === -1 || !BASE64.test(image)) {
      return Promise.resolve({
        ok: false, status: 400,
        data: { error: 'bad_request', message: '사진을 읽을 수 없습니다. 다시 찍어 주세요.' }
      });
    }
    return callModel(MODEL_PHOTO, SYS_HAZARDS, [
      { inline_data: { mime_type: mime, data: image } },
      { text: '이 설비 사진의 위험 지점을 찾아라.' }
    ], MAX_PHOTO_TOKENS).then(function (r) {
      if (r.error) return failBody(r);
      if (r.text.length > MAX_PHOTO_ANSWER) {
        return failBody({ error: 'model', why: '출력이 너무 김' });
      }
      var answer = parseModelJson(r.text);
      if (!answer) {
        /* 받은 글을 응답에 담지 않는다 — 화면은 손 흐름으로 간다 (FR-11) */
        return {
          ok: false, status: 502,
          data: { error: 'model', message: 'AI 응답을 읽을 수 없습니다. 직접 만드실 수 있습니다.' }
        };
      }
      /* ★ 사람·이름표가 찍혔으면 지점을 **아예 돌려주지 않는다** (FR-20).
         화면에서 가리는 것으로 두지 않는다 — 서버가 하는 것과 같다 */
      if (answer.person === true) {
        return okBody({
          person: true, retake: true, points: [], dropped: null, overlaps: 0, model: MODEL_PHOTO
        });
      }
      var kept = filterPoints(answer.points, HAZARDS, MAX_POINTS);
      return okBody({
        person: false,
        retake: false,
        points: kept.points,
        dropped: kept.dropped,
        overlaps: overlapCount(kept.points),
        model: MODEL_PHOTO
      });
    });
  }

  var realPost = Net.post;

  Net.post = function (path, body, opts) {
    if (used >= DAILY_LIMIT) return Promise.resolve(overLimit());
    if (path === '/api/translate') { used += 1; return translate(body); }
    if (path === '/api/backtranslate') { used += 1; return backtranslate(body); }
    if (path === '/api/hazards') { used += 1; return hazards(body); }
    /* 그 밖의 길은 건드리지 않는다. 우리 서버는 어차피 부르지 않으므로
       `onHttps()` 가 거짓이라 손 입력·로컬 모드로 간다 (C06 D-034). */
    return realPost(path, body, opts);
  };

  /* AI 버튼을 살린다. 서버 대신 공급사를 직접 부를 수 있게 됐다 */
  Net.aiReady = function () { return true; };

  /* 통과 문구는 **우리 서버**가 보는 값이다 (A02 §5.6). 제출본에는 그 서버가
     없으니 물어볼 이유도 없다 — 현장에서 긴 문구를 타이핑하게 만들지 않는다.
     키 자체가 이미 파일에 있어서, 문구를 더 받아도 막아 주는 것이 없다. */
  try {
    if (!sessionStorage.getItem('safety.agentPass')) {
      sessionStorage.setItem('safety.agentPass', '제출본');
    }
  } catch (e) { /* 저장을 막은 브라우저 — 운영자가 직접 입력하면 된다 */ }
}());
