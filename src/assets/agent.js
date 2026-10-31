/* ===================================================================
   agent.js — AI 번역·검수 에이전트 루프 (공용, 운영자 화면이 부른다)

   읽는 키: 없음 (화면이 문구를 넘겨 준다)
   쓰는 키: 없음 (저장은 화면이 Store 로 한다)
   근거: A02 §6 · D06 §3.2 [6] · PRD-AD-03 · SPEC-BE §2.1

   한 언어를 맡아 이렇게 돈다.

     번역 → 자기 번역을 한국어로 되돌림(역번역) → 원문과 대조
       뜻이 안 뒤집혔으면 끝
       뒤집혔으면 되돌린 문장을 힌트로 주고 다시 번역 (최대 2번 더)
       그래도 뒤집히면 ★ 사람에게 올린다

   ★ 이 파일이 지키는 제품 원칙

     1. **AI 는 절대 승인하지 않는다.** 서버가 status 를 보내와도 쓰지 않는다.
        저장 상태는 화면이 상수 'waiting' 으로 넣는다 (FR-AD-03-06).
        "AI 는 여기까지 · 승인은 사람" 의 경계가 이 파일이다.
     2. **역번역에 한국어 원문을 주지 않는다.** 서버가 지키지만 여기서도 보내지
        않는다. 원문을 보면 모델이 원문에 맞춰 고쳐서 대조가 무의미해진다.
     3. **실패해도 화면을 숨기지 않는다.** 어떤 오류든 이유를 담아 돌려주고,
        화면은 손 입력 칸을 보인다 (FR-AD-03-07).
     4. **AI 출력은 믿지 않는 문자열이다.** 여기서는 모양만 보고, 보여 주는 쪽이
        textContent 로만 넣는다 (FR-AD-03-11).
   =================================================================== */

var Agent = (function () {
  'use strict';

  /* ── 결정에 걸린 값 — 한 곳에 모은다 ──────────────────────────────

     API_BASE 는 보통 빈 문자열이다 = 같은 출처 '/api/...' 를 부른다.
     제출 HTML 을 file:// 로 더블클릭해 여는 현장 시연에서만 배포 주소가 필요하다
     (C08 §7 · C06 D-019). 그때 서버는 ALLOW_FILE_ORIGIN=1 이어야 받아 준다. */
  var API_BASE = 'https://2026-ax-ton.vercel.app';  // A02 §5.2 · C06 D-019

  var MAX_RETRY = 2;              // A02 §6.2 — 첫 시도 + 재시도 2회 = 최대 3번
  var CALL_TIMEOUT_MS = 25000;    // A02 §6.2 — 서버는 20초, 여기는 조금 더 준다
  var MAX_BACK = 600;             // A02 §5.4 — 역번역에 넘길 글자 수 상한

  /* ★ 문구 하나에 쓸 수 있는 호출 수의 천장 (A02 §6.4 · FR-AD-03-09).
     언어 5 × 2단계 × (첫 시도 + 재시도 2) = 30.

     언어마다 따로 세면 「언어 수가 늘면 비용도 같이 는다」를 아무도 못 막는다.
     문구 하나가 쓸 수 있는 총량을 여기서 한 번에 막는다 — 설정이 잘못돼
     언어가 20개가 돼도 이 천장은 그대로다. 공급사 요금은 사고로 늘어난다. */
  var MAX_CALLS_PER_PHRASE = 30;

  /* ★ 언어를 한꺼번에 출발시키지 않고 조금씩 어긋나게 띄운다 (2026-10-31 실측).
     5개 언어 × 2단계를 동시에 쏘면 공급사 **분당 한도**에 걸린다 —
     10문구 × 5언어 실측에서 실패 18건 중 대부분이 공급사 429 였다.
     기다리는 것이 아니라 출발만 어긋나게 하는 것이라, 전체 시간은
     마지막 언어의 지연(약 1.6초)만큼만 늘어난다. */
  var STAGGER_MS = 400;
  var PASS_KEY = 'safety.agentPass';

  /* ── 운영자 통과 문구 (A02 §5.6 2층) ───────────────────────────────
     sessionStorage 다 — 탭을 닫으면 사라진다. localStorage 가 아니므로
     Store 를 거치지 않는다 (Store 는 남겨야 할 10칸의 통로다).
     이 값은 남기면 안 되는 쪽이다. */

  function getPass() {
    try { return sessionStorage.getItem(PASS_KEY) || ''; } catch (e) { return ''; }
  }

  function setPass(v) {
    try { sessionStorage.setItem(PASS_KEY, String(v || '')); } catch (e) { /* 막혀 있으면 그냥 못 쓴다 */ }
  }

  function hasPass() { return !!getPass(); }

  /* ── 번역할 언어 (한국어는 뺀다) ──────────────────────────────────── */

  function langCodes() {
    var list = (typeof Store !== 'undefined' && Store.LANGUAGES) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].code !== 'ko') out.push(list[i].code);
    }
    return out;
  }

  /* ── 지금 부를 수 있나 ────────────────────────────────────────────── */

  function offline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  /** 부를 수 없으면 이유를 돌려준다. 부를 수 있으면 빈 문자열.
   *  ★ 버튼을 조용히 숨기지 않는다 — 이유를 보여 주고 손 입력 칸을 연다. */
  function blockedReason() {
    if (offline()) return '인터넷이 끊겨 있습니다. 직접 입력하실 수 있습니다.';
    if (!hasPass()) return '운영자 통과 문구를 입력하세요.';
    return '';
  }

  /* ── 한 번 부르기 ────────────────────────────────────────────────── */

  function apiUrl(path) {
    var file = typeof location !== 'undefined' && location.protocol === 'file:';
    return (file ? API_BASE : '') + path;
  }

  /** 서버를 한 번 부른다. 실패는 전부 { code, message } 를 담아 던진다. */
  function call(path, body) {
    var ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ac) ac.abort(); }, CALL_TIMEOUT_MS);
    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Pass': getPass() },
      body: JSON.stringify(body)
    };
    if (ac) opts.signal = ac.signal;

    return fetch(apiUrl(path), opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          throw agentError(data && data.error ? String(data.error) : 'model',
            data && data.message ? String(data.message) : '서버가 응답하지 못했습니다.');
        }
        return data;
      });
    }, function (e) {
      // 끊김·시간 초과 — 둘 다 손 입력으로 돌아간다
      var timedOut = (ac && ac.signal.aborted) || (e && e.name === 'AbortError');
      throw agentError(timedOut ? 'timeout' : 'network',
        timedOut ? 'AI 가 제시간에 답하지 못했습니다.' : 'AI 서버에 닿지 못했습니다.');
    }).then(function (data) {
      clearTimeout(timer);
      return data;
    }, function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  function wait(ms) {
    if (!ms) return Promise.resolve();
    return new Promise(function (done) { setTimeout(done, ms); });
  }

  function agentError(code, message) {
    var e = new Error(message);
    e.code = code;
    e.userMessage = message;
    return e;
  }

  /** 응답 모양을 본다. AI 가 보낸 것은 믿지 않는다. */
  function takeText(data, field) {
    var v = data ? data[field] : null;
    if (typeof v !== 'string' || !v.trim()) {
      throw agentError('shape', 'AI 응답을 알아볼 수 없습니다.');
    }
    return v.trim();
  }

  /* ── 대조 (판정은 review.js 한 곳에만 둔다) ───────────────────────── */

  function compare(ko, back) {
    return {
      flipped: Review.negationFlipped(ko, back),
      newWords: Review.newWordCount(ko, back)
    };
  }

  /* ── 한 언어를 끝까지 ────────────────────────────────────────────── */

  function step(onStep, lang, state, attempt) {
    if (typeof onStep === 'function') onStep(lang, state, attempt);
  }

  /** 문구 하나가 쓸 수 있는 호출 지갑. 언어들이 **같은 지갑**을 나눠 쓴다. */
  function newBudget(limit) {
    return { left: typeof limit === 'number' ? limit : MAX_CALLS_PER_PHRASE };
  }

  /**
   * 한국어 문구 하나를 한 언어로 번역하고 스스로 검사한다.
   *
   * 돌려주는 값 (언제나 Promise, 거절하지 않는다 — 화면이 언어마다 따로 보여 준다)
   *   성공  { lang, ok:true,  text, back, tries, flipped, newWords, escalated, model }
   *   실패  { lang, ok:false, code, message, tries }
   *
   * ★ status 를 돌려주지 않는다. 저장 상태는 화면이 'waiting' 으로 넣는다.
   */
  function runLang(phrase, lang, onStep, budget) {
    var ko = phrase && typeof phrase.ko === 'string' ? phrase.ko.trim() : '';
    if (!ko) {
      return Promise.resolve(fail(lang, 'bad_request', '번역할 한국어 문구가 없습니다.', 0));
    }

    var wallet = budget || newBudget();
    var hint = '';
    var attempt = 0;

    /** 지갑에서 한 번 꺼낸다. 비었으면 던진다 — 부르기 전에 막는다. */
    function spend() {
      if (wallet.left <= 0) {
        throw agentError('budget', '이 문구에 쓸 수 있는 AI 호출을 다 썼습니다. 직접 입력해 주세요.');
      }
      wallet.left -= 1;
    }

    function round() {
      step(onStep, lang, 'translating', attempt);
      return Promise.resolve().then(function () {
        spend();
        return call('/api/translate', { ko: ko, lang: lang, attempt: attempt, hint: hint });
      })
        .then(function (t) {
          var text = takeText(t, 'text');
          step(onStep, lang, 'backtranslating', attempt);

          /* ★ 역번역에는 번역문만 보낸다. 한국어 원문은 넣지 않는다 (A02 §5.4) */
          spend();
          return call('/api/backtranslate', { text: text.slice(0, MAX_BACK), lang: lang })
            .then(function (b) {
              var back = takeText(b, 'back');
              step(onStep, lang, 'comparing', attempt);

              var c = compare(ko, back);
              var done = {
                lang: lang,
                ok: true,
                text: text,
                back: back,
                tries: attempt + 1,
                flipped: c.flipped,
                newWords: c.newWords,
                escalated: false,
                model: typeof t.model === 'string' ? t.model : ''
              };

              if (!c.flipped) {
                step(onStep, lang, 'done', attempt);
                return done;
              }

              if (attempt >= MAX_RETRY) {
                /* 상한까지 갔는데도 뜻이 뒤집힌다 → 사람에게 올린다.
                   번역문은 버리지 않고 함께 올린다 — 사람이 고쳐 쓸 재료다. */
                done.escalated = true;
                step(onStep, lang, 'escalated', attempt);
                return done;
              }

              hint = back;          // 되돌린 문장을 힌트로 준다
              attempt += 1;
              step(onStep, lang, 'retry', attempt);
              return round();
            });
        })
        .catch(function (e) {
          step(onStep, lang, 'failed', attempt);
          return fail(lang, e && e.code ? e.code : 'model',
            e && e.userMessage ? e.userMessage : 'AI 번역에 실패했습니다.', attempt + 1);
        });
    }

    return round();
  }

  function fail(lang, code, message, tries) {
    return { lang: lang, ok: false, code: code, message: message, tries: tries || 0 };
  }

  /* ── 여러 언어를 한 번에 ─────────────────────────────────────────── */

  /** 이미 사람이 승인한 언어는 건드리지 않는다 (FR-AD-03-15). */
  function isReviewed(phrase, lang) {
    var t = phrase && phrase.translations && phrase.translations[lang];
    return !!(t && t.status === 'reviewed');
  }

  /**
   * 문구 하나를 여러 언어로. 언어끼리는 동시에, 한 언어 안에서는 차례로.
   * 돌려주는 값: { results: [runLang 결과…], skipped: [승인돼서 건너뛴 언어…] }
   */
  function run(phrase, langs, onStep) {
    var want = langs && langs.length ? langs : langCodes();
    var skipped = [];
    var todo = [];

    for (var i = 0; i < want.length; i++) {
      if (isReviewed(phrase, want[i])) skipped.push(want[i]);
      else todo.push(want[i]);
    }

    var blocked = blockedReason();
    if (blocked) {
      var code = offline() ? 'offline' : 'pass_required';
      return Promise.resolve({
        results: todo.map(function (l) { return fail(l, code, blocked, 0); }),
        skipped: skipped
      });
    }

    /* ★ 언어들이 같은 지갑을 나눠 쓴다 — 문구 하나의 총량이 천장이다 */
    var wallet = newBudget();
    return Promise.all(todo.map(function (l, i) {
      // 출발만 어긋나게 띄운다 (공급사 분당 한도)
      return wait(i * STAGGER_MS).then(function () {
        return runLang(phrase, l, onStep, wallet);
      });
    }))
      .then(function (results) {
        return { results: results, skipped: skipped, callsLeft: wallet.left };
      });
  }

  /* ── 저장할 모양으로 바꾼다 (A02 §6.3) ─────────────────────────────
     ★ status 는 언제나 상수 'waiting' 이다. 결과에 무엇이 들어 있든. */

  function toTranslation(result, now) {
    if (!result || !result.ok) return null;
    return {
      text: result.text,
      back: result.back,
      status: 'waiting',
      agent: {
        tries: result.tries,
        flipped: !!result.flipped,
        escalated: !!result.escalated,
        model: result.model || '',
        at: now || new Date().toISOString(),
        /* ★ AI 가 내놓은 번역문을 그대로 얼려 둔다.
           「사람에게 올린 언어는 AI 번역문 그대로 승인할 수 없다」(FR-AD-03-14)를
           이 한 칸으로 판정한다 — 지금 text 가 이것과 같으면 아무도 손대지 않은
           것이다. 따로 "사람이 고쳤음" 표시를 두면 켜고 끄는 것을 잊는다. */
        text: result.text
      }
    };
  }

  return {
    runLang: runLang,
    run: run,
    compare: compare,
    toTranslation: toTranslation,
    langCodes: langCodes,
    isReviewed: isReviewed,
    blockedReason: blockedReason,
    getPass: getPass,
    setPass: setPass,
    hasPass: hasPass,
    apiUrl: apiUrl,
    newBudget: newBudget,
    MAX_RETRY: MAX_RETRY,
    MAX_CALLS_PER_PHRASE: MAX_CALLS_PER_PHRASE,
    STAGGER_MS: STAGGER_MS,
    CALL_TIMEOUT_MS: CALL_TIMEOUT_MS,
    API_BASE: API_BASE
  };
})();
