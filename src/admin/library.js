/* ===================================================================
   library.js — 기능9 안전 문구 라이브러리 (운영자)

   담당: P4
   기능번호: 기능9
   읽는 키: library
   쓰는 키: library
   근거: SCREEN 기능9 · PRD §9.3

   ★ 이 화면은 노동자에게 보이지 않지만 제품 신뢰의 단일 최대 요인이다.
     검수를 지나지 않은 문구가 안전 지시로 나가면 오역이 그대로 사고가 된다.

   이 파일이 코드로 지키는 것 —

   · 검수 판정은 언어별로 낼 수 있다 (translations[code].status).
     크메르어 번역 하나가 오역이어도 문구 전체를 내리면 인도네시아어·베트남어
     노동자도 그 안전 지시를 못 듣는다. 그것은 오역보다 나은 상태가 아니다.
     읽을 때는 Store.phraseOk(p, lang) 을 쓴다.

   · 오역 신고는 접수하는 순간 status 를 'stopped' 로 내린다.
     확인한 뒤 내리는 순서가 아니다. 오역이 걸린 문구가 현장에 한 시간 더
     붙어 있는 것이 더 위험하다.

   · 역번역 차이 표시는 AI 가 찾은 것이고, 승인·중지는 사람이 누른다.
     화면에 그 경계를 적는다 (AI 여기까지).

   · 'reviewed' 로 올리려면 번역이 하나라도 있어야 한다.
     번역이 없는 문구를 검수 완료로 두면 기능2 선택지에 빈 문구가 올라간다.

   · 새로 추가한 문구는 반드시 'waiting'(검수 대기) 으로 들어간다.
     추가 폼에서 'reviewed' 를 만들 수 있게 하면 검수를 지나지 않은 문구가
     그대로 안전 지시가 된다. 올리는 것은 사람이 판정 버튼을 누를 때다.

   · 번역문을 받으면 역번역도 함께 받는다. 견줄 것이 없으면 판정 화면에
     대조할 칸만 늘고, 검수자는 읽지도 못하는 문장을 눈감고 승인하게 된다.

   -------------------------------------------------------------------
   골격입니다. 남은 것은 화면 아래 "여기부터 채우시면 됩니다" 에 적혀 있습니다.
   =================================================================== */

(function () {
  'use strict';

  var $ = UI.$;
  var user = Auth.current();

  UI.fillAdminBar(user);
  UI.markCurrentTab();
  UI.warnIfBlocked();

  var filter = 'all';

  /* -----------------------------------------------------------------
     읽기
     ----------------------------------------------------------------- */

  function phrases() { return Store.library.load(); }

  function langName(code) {
    var l = Store.language(code);
    return (l && l.name) || code;
  }

  function langsOf(phrase) {
    var t = phrase.translations || {};
    return Object.keys(t).filter(function (code) { return t[code] && t[code].text; });
  }

  /* 아직 조치하지 않은 오역 신고 */
  function openFlags(phrase) {
    return (Array.isArray(phrase.flags) ? phrase.flags : [])
      .filter(function (f) { return f && !f.resolvedAt; });
  }

  /* -----------------------------------------------------------------
     역번역 대조

     번역문을 다시 한국어로 돌린 것이 원문과 다른 곳을 표시한다.
     ph-3 처럼 부정이 뒤집히면 "넣지 마십시오" 가 "넣어도 됩니다" 가 되는데,
     그 두 낱말이 원문에 없다는 사실로 잡힌다.

     ★ 이것은 사람이 볼 곳을 좁혀 주는 것뿐이다. 판정은 사람이 한다.
     ----------------------------------------------------------------- */

  /* 판정 함수는 assets/review.js 에 있다 — 기능2 가 문항 번역을 넣을 때
     같은 판정을 쓴다. 두 화면이 각자 판정하면 한쪽이 통과시킨 것을
     다른 쪽이 막는다. */
  var diffWords = Review.diffWords;
  var negationFlipped = Review.negationFlipped;

  function diffCell(title, text, marks) {
    var cell = UI.el('div', 'diff-cell' + (marks ? ' flag' : ''));
    cell.appendChild(UI.el('h4', null, title));

    var p = UI.el('p');
    if (!marks) {
      p.textContent = text;
    } else {
      marks.forEach(function (token, i) {
        if (i) p.appendChild(document.createTextNode(' '));
        if (token.isNew) p.appendChild(UI.el('mark', null, token.text));
        else p.appendChild(document.createTextNode(token.text));
      });
    }
    cell.appendChild(p);
    return cell;
  }

  /* -----------------------------------------------------------------
     쓰기 — 전부 Store.library.update 한 사이클을 지난다
     ----------------------------------------------------------------- */

  function commit(fn, message) {
    var result = Store.library.update(fn);
    render();
    if (!result.ok) UI.toast('저장하지 못했습니다. 이 브라우저의 저장소가 막혀 있습니다.');
    else if (message) UI.toast(message);
    return result;
  }

  /* 판정을 내린다. lang 이 있으면 그 언어만, 없으면 문구 전체.

     ★ 언어별 판정이 있는 이유 — 크메르어 번역 하나가 오역이어도 문구 전체를
       내리면 인도네시아어·베트남어 노동자도 그 안전 지시를 못 듣는다.
       그것은 오역보다 나은 상태가 아니다. */
  function setStatus(id, status, lang) {
    var target = Store.findBy(phrases(), 'id', id);

    if (status === 'reviewed') {
      if (target && !langsOf(target).length) {
        UI.toast('번역이 하나도 없는 문구는 검수 완료로 둘 수 없습니다.');
        return;
      }
      /* 그 언어의 신고만 본다. 다른 언어 신고 때문에 이 언어를 다시 쓰지
         못하게 막으면, 운영자는 신고를 한꺼번에 닫아 버리게 된다. */
      var open = openFlags(target).filter(function (f) {
        return lang ? (f.lang === lang) : true;
      });
      if (target && open.length) {
        if (!window.confirm(
          '아직 처리하지 않은 오역 신고가 있습니다.\n' +
          '신고를 처리하지 않고 다시 쓰기로 하시겠습니까?')) return;
      }
    }

    commit(function (list) {
      var p = Store.findBy(list, 'id', id);
      if (!p) return;

      if (lang) {
        var t = (p.translations || {})[lang];
        if (!t) return;
        t.status = status;

        /* ★ 사람이 정했다는 기록을 남긴다 (🆕 T6 · A02 §6.3 · FR-AD-02-09).
           AI 는 이 칸을 만들지 않는다. agent 는 있는데 judged 가 없으면
           "AI 가 내놓았고 아직 아무도 안 봤다" 는 뜻이고, 그 구분이
           「AI 는 여기까지 · 승인은 사람」을 나중에 증명할 수 있게 한다. */
        t.judged = { by: user.userId, at: new Date().toISOString() };
      } else {
        p.status = status;
      }

      /* 다시 쓰기로 했다면 그 판단으로 신고를 닫는다. 신고가 계속 열려 있으면
         큐에 남아서 무엇을 처리했는지 알 수 없다.
         ★ 언어별 판정으로는 그 언어의 신고만 닫는다. 문구 전체 신고는
           그대로 남긴다 — 한 언어를 고친 것이 문구 전체를 고친 것은 아니다. */
      if (status === 'reviewed') {
        (p.flags || []).forEach(function (f) {
          if (f.resolvedAt) return;
          if (lang && f.lang !== lang) return;
          f.resolvedAt = new Date().toISOString();
        });
      }
    }, statusMessage(status, lang));
  }

  function statusMessage(status, lang) {
    var who = lang ? (langName(lang) + ' 번역을 ') : '이 문구를 ';
    return status === 'reviewed'
      ? who + '검수 완료로 올렸습니다.'
      : who + '사용 중지로 내렸습니다.';
  }

  /* ★ 접수 = 즉시 중지. 두 동작이 한 사이클 안에 같이 일어난다.
       확인한 뒤 내리는 순서가 아니다 — 오역이 한 시간 더 붙어 있는 것이 더 위험하다.

     lang 이 있으면 그 언어만 내려간다. 나머지 언어 노동자는 계속 듣는다. */
  function fileFlag(id, note, lang) {
    commit(function (list) {
      var p = Store.findBy(list, 'id', id);
      if (!p) return;
      if (!Array.isArray(p.flags)) p.flags = [];
      p.flags.push({
        note: note, lang: lang || '',
        at: new Date().toISOString(), resolvedAt: null
      });

      if (lang && (p.translations || {})[lang]) p.translations[lang].status = 'stopped';
      else p.status = 'stopped';
    }, lang
      ? '접수했습니다. ' + langName(lang) + ' 번역만 사용 중지입니다. 다른 언어는 계속 나갑니다.'
      : '접수했습니다. 이 문구는 지금부터 사용 중지입니다.');
  }

  /* -----------------------------------------------------------------
     1. 오역 신고 큐
     ----------------------------------------------------------------- */

  function renderFlagQueue(list) {
    var box = $('flag-queue');
    box.textContent = '';

    var flagged = list.filter(function (p) { return openFlags(p).length; });

    if (!flagged.length) {
      box.appendChild(UI.el('p', 'empty', '처리할 오역 신고가 없습니다.'));
      return;
    }

    flagged.forEach(function (p) {
      var item = UI.el('div', 'queue-item');
      item.setAttribute('data-urgent', 'yes');   // 오역 신고는 전부 긴급이다

      var top = UI.el('div', 'queue-top');
      top.appendChild(UI.el('strong', null, p.ko));
      top.appendChild(UI.phraseBadge(p.status));
      /* 어느 언어가 내려갔는지. 문구 전체가 살아 있어도 한 언어만 멈춰 있을 수 있다. */
      Store.stoppedLangs(p).forEach(function (code) {
        top.appendChild(UI.stopBadge(langName(code) + ' 중지'));
      });
      item.appendChild(top);

      openFlags(p).forEach(function (f) {
        item.appendChild(UI.el('p', 'body', f.note || '(내용 없음)'));
        // 어느 언어의 신고인지. 그 언어만 내려간 것과 문구 전체가 내려간 것은 다르다
        item.appendChild(UI.el('p', 'meta', '접수 ' + UI.formatDate(f.at) +
          ' · ' + (f.lang ? langName(f.lang) + ' 번역' : '문구 전체')));
      });

      var row = UI.el('div', 'btn-row');

      /* 신고마다 "다시 사용" 을 따로 준다.
         인도네시아어 신고를 처리하는 것과 문구 전체를 다시 쓰는 것은 다른 판단이다.
         한 버튼으로 묶으면 한 언어를 고친 것이 문구 전체를 되살리게 된다. */
      var langsFlagged = {};
      openFlags(p).forEach(function (f) { langsFlagged[f.lang || ''] = true; });

      Object.keys(langsFlagged).forEach(function (code) {
        var label = code
          ? langName(code) + ' 번역이 고쳐졌습니다 — 다시 사용'
          : '고쳐졌습니다 — 문구 전체 다시 사용';
        var fixed = UI.el('button', 'btn-sm go', label);
        fixed.type = 'button';
        fixed.addEventListener('click', function () {
          setStatus(p.id, 'reviewed', code || undefined);
        });
        row.appendChild(fixed);
      });

      var keep = UI.el('button', 'btn-sm', '신고만 닫기 (중지 유지)');
      keep.type = 'button';
      keep.addEventListener('click', function () {
        commit(function (all) {
          var t = Store.findBy(all, 'id', p.id);
          (t.flags || []).forEach(function (f) {
            if (!f.resolvedAt) f.resolvedAt = new Date().toISOString();
          });
        }, '신고를 닫았습니다. 중지는 그대로입니다.');
      });
      row.appendChild(keep);

      item.appendChild(row);
      box.appendChild(item);
    });
  }

  /* -----------------------------------------------------------------
     2. 판정이 필요한 문구 — 검수 대기 + 사용 중지
     ----------------------------------------------------------------- */

  function renderReview(list) {
    var box = $('review-list');
    box.textContent = '';

    /* 문구 전체가 대기·중지이거나, 어느 한 언어라도 완료가 아니면 판정이 필요하다.
       p.status 만 보면 "인도네시아어만 중지" 인 문구가 목록에서 사라진다. */
    var need = list.filter(function (p) {
      if (p.status !== 'reviewed') return true;
      return langsOf(p).some(function (code) {
        return Store.phraseStatus(p, code) !== 'reviewed';
      });
    });

    if (!need.length) {
      box.appendChild(UI.el('p', 'empty', '판정이 필요한 문구가 없습니다.'));
      return;
    }

    need.forEach(function (p) {
      var block = UI.el('div', 'review-block');

      var head = UI.el('div', 'queue-top');
      head.appendChild(UI.el('strong', null, p.ko));
      head.appendChild(UI.phraseBadge(p.status));
      block.appendChild(head);

      var langs = langsOf(p);
      if (!langs.length) {
        block.appendChild(UI.el('p', 'empty', '아직 번역이 없습니다. 초안 번역이 들어오면 대조할 수 있습니다.'));
      }

      langs.forEach(function (code) {
        var t = p.translations[code];
        var lang = Store.language(code);
        var marks = diffWords(p.ko, t.back);
        var newCount = marks.filter(function (m) { return m.isNew; }).length;
        var flipped = negationFlipped(p.ko, t.back);

        block.appendChild(UI.el('p', 'meta', langName(code)));

        // 부정이 뒤집힌 경우만 크게 경고한다. 나머지는 낱말 개수만 알린다.
        if (flipped) {
          var alarm = UI.el('p', 'flip-warn');
          alarm.appendChild(UI.el('strong', null, '★ 부정이 뒤집혔을 수 있습니다'));
          alarm.appendChild(document.createTextNode(
            ' — 한쪽에만 금지 표현이 있습니다. 그대로 나가면 정반대 지시가 됩니다.'));
          block.appendChild(alarm);
        }

        var diff = UI.el('div', 'diff' + (flipped ? ' danger' : ''));
        diff.appendChild(diffCell('원문 (한국어)', p.ko, null));
        diff.appendChild(diffCell('역번역 — ' + langName(code) + ' 를 한국어로 되돌린 것',
          t.back, newCount ? marks : null));
        block.appendChild(diff);

        var note = newCount
          ? '원문에 없는 낱말 ' + newCount + '개를 표시했습니다. 말만 바꿔 쓴 것인지 뜻이 달라진 것인지는 사람이 봅니다.'
          : '역번역이 원문과 같습니다.';
        block.appendChild(UI.el('p', 'diff-note', note));

        block.appendChild(UI.el('p', 'meta', '번역문 — ' + t.text));

        /* ★ 이 언어만의 판정. 크메르어 오역 하나로 문구 전체를 내리면
             인도네시아어·베트남어 노동자도 이 안전 지시를 못 듣는다. */
        var langRow = UI.el('div', 'btn-row lang-verdict');
        langRow.appendChild(UI.phraseBadge(Store.phraseStatus(p, code)));

        if (Store.phraseStatus(p, code) !== 'reviewed') {
          var langOk = UI.el('button', 'btn-sm go', langName(code) + '만 검수 완료');
          langOk.type = 'button';
          langOk.addEventListener('click', function () {
            setStatus(p.id, 'reviewed', code);
          });
          langRow.appendChild(langOk);
        }
        if (Store.phraseStatus(p, code) !== 'stopped') {
          var langStop = UI.el('button', 'btn-sm danger', langName(code) + '만 중지');
          langStop.type = 'button';
          langStop.addEventListener('click', function () {
            setStatus(p.id, 'stopped', code);
          });
          langRow.appendChild(langStop);
        }
        block.appendChild(langRow);
      });

      var row = UI.el('div', 'btn-row');

      var okBtn = UI.el('button', 'btn-sm go', '문구 전체 검수 완료 — 안전 지시로 쓴다');
      okBtn.type = 'button';
      okBtn.addEventListener('click', function () { setStatus(p.id, 'reviewed'); });
      row.appendChild(okBtn);

      if (p.status !== 'stopped') {
        var stopBtn = UI.el('button', 'btn-sm danger', '문구 전체 사용 중지');
        stopBtn.type = 'button';
        stopBtn.addEventListener('click', function () { setStatus(p.id, 'stopped'); });
        row.appendChild(stopBtn);
      }

      block.appendChild(row);
      box.appendChild(block);
    });
  }

  /* -----------------------------------------------------------------
     3. 문구 추가

     ★ 새 문구는 반드시 'waiting'(검수 대기) 으로 들어간다.
       이 폼에서 'reviewed' 를 만들 수 있게 하면 검수를 지나지 않은 문구가
       그대로 안전 지시가 된다. 올리는 것은 위 판정 버튼을 누르는 사람이다.

     ★ 번역문을 받으면 역번역도 함께 받는다.
       역번역이 없으면 판정 화면이 견줄 것이 없어서, 검수자는 읽지도 못하는
       문장을 눈감고 승인하게 된다. 그러면 이 화면이 있는 이유가 사라진다.
     ----------------------------------------------------------------- */

  /* 한국어는 원문 칸이 이미 받는다 */
  var ADD_LANGS = Store.LANGUAGES.filter(function (l) { return l.code !== 'ko'; });

  function addId(code, kind) { return 'add-' + code + '-' + kind; }

  function addInput(id, placeholder) {
    var input = document.createElement('input');
    input.type = 'text';
    input.id = id;
    if (placeholder) input.placeholder = placeholder;
    return input;
  }

  /* 언어 칸은 한 번만 만든다.
     render() 는 무엇을 저장할 때마다 도는데, 그때 다시 만들면 적고 있던
     번역이 사라진다. 언어 목록은 Store.LANGUAGES 로 고정이라 다시 만들 이유도 없다. */
  function buildAddInputs() {
    var box = $('add-i18n');
    if (!box) return;
    box.textContent = '';

    box.appendChild(UI.el('h3', 'sub', '번역'));
    box.appendChild(UI.el('p', 'muted',
      '넣은 언어만 저장됩니다. 번역이 하나도 없어도 추가할 수 있지만, ' +
      '그 문구는 검수 완료로 올라가지 않습니다.'));

    ADD_LANGS.forEach(function (l) {
      var wrap = UI.el('div', 'i18n-box');
      wrap.appendChild(UI.el('h4', null, l.name + ' (' + l.native + ')'));

      var f1 = UI.el('div', 'field');
      var lb1 = UI.el('label', null, '번역문');
      lb1.setAttribute('for', addId(l.code, 'text'));
      f1.appendChild(lb1);
      var text = addInput(addId(l.code, 'text'), l.native + ' 로 쓴 안전 문구');
      text.addEventListener('input', function () { renderAddBackCheck(l.code); });
      f1.appendChild(text);
      wrap.appendChild(f1);

      var f2 = UI.el('div', 'field');
      var lb2 = UI.el('label', null, '역번역 — 위 번역을 다시 한국어로');
      lb2.setAttribute('for', addId(l.code, 'back'));
      f2.appendChild(lb2);
      var back = addInput(addId(l.code, 'back'), '예) 프레스가 멈춰도 손을 넣지 마십시오');
      back.addEventListener('input', function () { renderAddBackCheck(l.code); });
      f2.appendChild(back);
      wrap.appendChild(f2);

      var warn = UI.el('div', 'i18n-warn', '');
      warn.id = addId(l.code, 'warn');
      wrap.appendChild(warn);

      box.appendChild(wrap);
    });
  }

  /* 적는 동안 바로 대조해 준다.
     ★ 판정은 assets/review.js 것을 그대로 쓴다 — 기능2 의 문항 번역 칸과
       같은 함수다. 두 화면이 각자 판정하면 한쪽이 통과시킨 것을 다른 쪽이 막는다.
     ★ 여기 뜨는 것은 AI 가 찾아 준 것이고, 추가를 막지는 않는다.
       판정은 사람이 위 버튼으로 한다 (화면 맨 위 "AI 여기까지"). */
  function renderAddBackCheck(code) {
    var box = $(addId(code, 'warn'));
    if (!box) return;
    box.textContent = '';

    var ko = $('add-ko').value.trim();
    var text = $(addId(code, 'text')).value.trim();
    var back = $(addId(code, 'back')).value.trim();

    if (!text) return;                  // 안 넣은 언어에는 말을 걸지 않는다

    if (!back) {
      box.appendChild(UI.el('p', 'muted',
        '역번역을 적어 주세요. 없으면 검수 화면에서 견줄 것이 없습니다.'));
      return;
    }
    if (!ko) return;                    // 원문이 없으면 견줄 대상이 없다

    if (negationFlipped(ko, back)) {
      var w = UI.el('div', 'warnbox');
      var wt = UI.el('strong', null);
    wt.appendChild(UI.iconBox('alert', null));
    wt.appendChild(document.createTextNode(' 뜻이 뒤집혔을 수 있습니다'));
    w.appendChild(wt);
      w.appendChild(UI.el('p', null,
        '한쪽에만 "않 · 마십시오 · 금지" 같은 부정 표현이 있습니다. ' +
        '"손을 넣지 마십시오" 가 "손을 넣어도 됩니다" 로 바뀌면 정반대 지시가 됩니다. ' +
        '번역을 다시 확인해 주세요.'));
      box.appendChild(w);
      return;
    }

    var n = Review.newWordCount(ko, back);
    box.appendChild(UI.el('p', 'muted',
      n ? '원문에 없던 낱말 ' + n + '개. 뜻이 같으면 그대로 두셔도 됩니다.'
        : '역번역이 원문과 같은 낱말로 돌아왔습니다.'));
  }

  function renderAllBackChecks() {
    ADD_LANGS.forEach(function (l) { renderAddBackCheck(l.code); });
  }

  /* 분류 후보는 지금 라이브러리에 있는 것만 올린다.
     ★ Store.setup 의 공정 이름을 쓰지 않는 이유 — 라이브러리는 운영자가 여러
       사업장을 가로질러 관리하는 것이다. 한 사업장의 설정에 묶으면 다른
       사업장의 분류가 후보에서 사라진다. */
  function renderCategoryList(list) {
    var box = $('add-category-list');
    if (!box) return;
    box.textContent = '';

    var seen = {};
    list.forEach(function (p) {
      var c = (p.category || '').trim();
      if (!c || seen[c]) return;
      seen[c] = true;
      var opt = document.createElement('option');
      opt.value = c;
      box.appendChild(opt);
    });
  }

  /* 폼에 적힌 번역을 모은다.
     번역문이 빈 언어는 아예 넣지 않는다 — 빈 칸이 들어가면 판정 화면에
     견줄 것 없는 칸만 늘어나고, langsOf() 가 세지도 않는다.
     역번역이 빈 언어는 따로 돌려줘서 접수를 막는다. */
  function collectAddTranslations() {
    var out = { map: {}, missingBack: [] };

    ADD_LANGS.forEach(function (l) {
      var text = $(addId(l.code, 'text')).value.trim();
      var back = $(addId(l.code, 'back')).value.trim();
      if (!text) return;
      if (!back) { out.missingBack.push(l); return; }
      out.map[l.code] = { text: text, back: back };
    });

    return out;
  }

  function clearAddForm() {
    $('add-ko').value = '';
    $('add-category').value = '';
    ADD_LANGS.forEach(function (l) {
      $(addId(l.code, 'text')).value = '';
      $(addId(l.code, 'back')).value = '';
      var w = $(addId(l.code, 'warn'));
      if (w) w.textContent = '';
    });
  }

  /* -----------------------------------------------------------------
     4. 문구 목록
     ----------------------------------------------------------------- */

  function renderRows(list) {
    var body = $('phrase-rows');
    body.textContent = '';

    /* 걸러 보기도 언어별 판정을 본다. p.status 만 보면 "인도네시아어만 중지" 인
       문구가 '사용 중지' 목록에서 빠진다. */
    var shown = filter === 'all' ? list : list.filter(function (p) {
      if (p.status === filter) return true;
      return langsOf(p).some(function (code) { return Store.phraseStatus(p, code) === filter; });
    });

    if (!shown.length) {
      var empty = UI.el('tr');
      var cell = UI.el('td');
      cell.colSpan = 5;
      cell.appendChild(UI.el('p', 'empty', '해당하는 문구가 없습니다.'));
      empty.appendChild(cell);
      body.appendChild(empty);
      return;
    }

    shown.forEach(function (p) {
      var tr = UI.el('tr');

      var first = UI.el('td');
      first.appendChild(document.createTextNode(p.ko));
      if (openFlags(p).length) {
        first.appendChild(UI.el('span', 'sub', '오역 신고 ' + openFlags(p).length + '건'));
      }
      tr.appendChild(first);

      tr.appendChild(UI.el('td', null, p.category || '-'));

      var langCell = UI.el('td');
      var chips = UI.el('div', 'chips');
      var langs = langsOf(p);
      if (!langs.length) {
        chips.appendChild(UI.el('span', 'badge badge-neutral', '번역 없음'));
      } else {
        /* 언어마다 그 언어의 판정을 함께 보인다.
           색만으로 구분하지 않는다 — 아이콘 + 글자 + 색 3중 (UI.phraseBadge). */
        langs.forEach(function (code) {
          var st = Store.phraseStatus(p, code);
          if (st === 'reviewed') {
            chips.appendChild(UI.el('span', 'badge badge-neutral', langName(code)));
          } else {
            var b = UI.phraseBadge(st);
            b.appendChild(document.createTextNode(' ' + langName(code)));
            chips.appendChild(b);
          }
        });
      }
      langCell.appendChild(chips);
      tr.appendChild(langCell);

      var statusCell = UI.el('td');
      statusCell.appendChild(UI.phraseBadge(p.status));
      // 문구 전체는 살아 있어도 한 언어만 멈춰 있을 수 있다. 그 사실을 숨기지 않는다.
      Store.stoppedLangs(p).forEach(function (code) {
        statusCell.appendChild(UI.el('span', 'sub', langName(code) + ' 중지'));
      });
      tr.appendChild(statusCell);

      var actCell = UI.el('td');
      var row = UI.el('div', 'btn-row');

      if (p.status !== 'reviewed') {
        var okBtn = UI.el('button', 'btn-sm go', '검수 완료');
        okBtn.type = 'button';
        okBtn.addEventListener('click', function () { setStatus(p.id, 'reviewed'); });
        row.appendChild(okBtn);
      }
      if (p.status !== 'stopped') {
        var stopBtn = UI.el('button', 'btn-sm danger', '사용 중지');
        stopBtn.type = 'button';
        stopBtn.addEventListener('click', function () { setStatus(p.id, 'stopped'); });
        row.appendChild(stopBtn);
      }
      actCell.appendChild(row);
      tr.appendChild(actCell);

      body.appendChild(tr);
    });
  }

  /* -----------------------------------------------------------------
     5. 라이브러리 상태
     ----------------------------------------------------------------- */

  function renderStats(list) {
    var box = $('stats');
    box.textContent = '';

    /* 언어 하나만 중지된 문구도 '사용 중지' 로 센다 — 어딘가에서 안전 지시가
       나가지 않고 있다는 뜻이고, 그것이 이 타일이 알려야 하는 것이다. */
    var count = function (status) {
      return list.filter(function (p) {
        if (p.status === status) return true;
        return langsOf(p).some(function (code) { return Store.phraseStatus(p, code) === status; });
      }).length;
    };
    var flagged = list.filter(function (p) { return openFlags(p).length; }).length;

    var tiles = [
      { label: '검수 완료', value: count('reviewed'), unit: '개',
        hint: '한 언어라도 안전 지시로 쓸 수 있습니다', alert: false },
      { label: '검수 대기', value: count('waiting'), unit: '개',
        hint: '한 언어라도 아직 쓰이지 않습니다', alert: false },
      { label: '오역 신고', value: flagged, unit: '건',
        hint: '접수 즉시 그 언어가 중지된 것', alert: flagged > 0 },
      { label: '사용 중지', value: count('stopped'), unit: '개',
        hint: '한 언어라도 나오지 않습니다', alert: false },
      { label: '전체', value: list.length, unit: '개',
        hint: '원래 목표는 200개입니다', alert: false }
    ];

    tiles.forEach(function (t) {
      var cell = UI.el('div', 'kpi' + (t.alert ? ' alert' : ''));
      cell.appendChild(UI.el('dt', null, t.label));
      var dd = UI.el('dd', null, String(t.value));
      dd.appendChild(UI.el('small', null, t.unit));
      cell.appendChild(dd);
      cell.appendChild(UI.el('p', 'hint', t.hint));
      box.appendChild(cell);
    });
  }

  /* -----------------------------------------------------------------
     신고 폼의 문구 선택
     ----------------------------------------------------------------- */

  function renderFlagForm(list) {
    // 이미 중지된 문구는 다시 신고할 이유가 적다. 쓰이고 있는 것만 올린다.
    var usable = list.filter(function (p) { return p.status !== 'stopped'; });
    var keep = $('flag-phrase').value;
    UI.fillSelect($('flag-phrase'), usable,
      function (p) { return p.id; },
      function (p) { return p.ko; });
    if (keep && Store.findBy(usable, 'id', keep)) $('flag-phrase').value = keep;
    $('form-flag').hidden = !usable.length;
    renderFlagLangs();
  }

  /* 고른 문구가 가진 언어만 올린다. 없는 언어를 신고하면 내릴 대상이 없다.

     ★ 첫 칸은 빈 칸이고, 고르지 않으면 접수되지 않는다. 기본값을 두지 않는 이유 —

       특정 언어를 기본으로 두면, 손대지 않고 접수한 순간 엉뚱한 언어가 내려가고
       정작 오역인 번역은 계속 현장에 나간다.
       "문구 전체" 를 기본으로 두면 한 언어의 오역으로 다른 언어 노동자까지
       안전 지시를 잃는다 — 언어별 판정을 만든 이유가 사라진다.

     둘 다 조용히 잘못되므로, 한 번 고르게 하는 쪽을 택했다. */
  var FLAG_ALL = 'ALL';

  function renderFlagLangs() {
    var sel = $('flag-lang');
    if (!sel) return;
    var p = Store.findBy(phrases(), 'id', $('flag-phrase').value);
    var codes = p ? langsOf(p).filter(function (code) {
      return Store.phraseStatus(p, code) !== 'stopped';
    }) : [];

    sel.textContent = '';

    var blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '— 고르세요 —';
    sel.appendChild(blank);

    codes.forEach(function (code) {
      var opt = document.createElement('option');
      opt.value = code;
      opt.textContent = langName(code) + ' 번역만';
      sel.appendChild(opt);
    });

    var whole = document.createElement('option');
    whole.value = FLAG_ALL;
    whole.textContent = '문구 전체 (한국어 원문이 잘못됐을 때)';
    sel.appendChild(whole);
  }

  /* -----------------------------------------------------------------
     그리기 — 상태가 바뀌면 전부 다시 그린다.
     부분 갱신을 하면 큐와 목록과 타일이 금방 서로 어긋난다.
     ----------------------------------------------------------------- */

  function render() {
    var list = phrases();
    renderFlagQueue(list);
    renderReview(list);
    renderRows(list);
    renderStats(list);
    renderFlagForm(list);
    renderCategoryList(list);

    ['all', 'reviewed', 'waiting', 'stopped'].forEach(function (key) {
      var btn = $('filter-' + key);
      if (btn) btn.setAttribute('aria-pressed', filter === key ? 'true' : 'false');
    });
  }

  /* -----------------------------------------------------------------
     이벤트 연결
     ----------------------------------------------------------------- */

  $('flag-phrase').addEventListener('change', renderFlagLangs);

  $('form-flag').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = $('flag-phrase').value;
    var note = $('flag-note').value.trim();
    if (!id) { UI.toast('신고할 문구를 골라 주세요.'); return; }
    var pick = $('flag-lang').value;
    if (!pick) {
      UI.toast('어느 언어의 번역인지 골라 주세요. 그 언어만 사용 중지됩니다.');
      $('flag-lang').focus();
      return;
    }
    if (!note) { UI.toast('무엇이 잘못됐는지 한 줄 적어 주세요.'); $('flag-note').focus(); return; }
    fileFlag(id, note, pick === FLAG_ALL ? '' : pick);
    $('flag-note').value = '';
  });

  ['all', 'reviewed', 'waiting', 'stopped'].forEach(function (key) {
    var btn = $('filter-' + key);
    if (btn) btn.addEventListener('click', function () { filter = key; render(); });
  });

  window.addEventListener('storage', function (e) {
    if (e.key === Store.library.KEY) render();
  });

  /* 원문이 바뀌면 이미 적어 둔 역번역들을 다시 견준다.
     원문을 나중에 고치는 일이 흔한데, 그때 대조가 옛 원문에 머물러 있으면
     화면이 조용히 틀린 말을 하게 된다. */
  $('add-ko').addEventListener('input', renderAllBackChecks);

  $('form-add').addEventListener('submit', function (e) {
    e.preventDefault();

    var ko = $('add-ko').value.trim();
    if (!ko) { UI.toast('한국어 원문을 적어 주세요.'); $('add-ko').focus(); return; }

    var picked = collectAddTranslations();

    /* ★ 역번역 없는 번역은 받지 않는다. 그대로 받으면 판정 화면에 견줄 것이
         없는 칸이 생기고, 검수자는 읽지도 못하는 문장을 눈감고 승인하게 된다.
         그 승인이 곧 현장에 나가는 안전 지시다. */
    if (picked.missingBack.length) {
      var first = picked.missingBack[0];
      UI.toast(picked.missingBack.map(function (l) { return l.name; }).join(' · ') +
        ' 의 역번역을 적어 주세요. 대조할 것이 없으면 검수를 할 수 없습니다.');
      $(addId(first.code, 'back')).focus();
      return;
    }

    var phrase = {
      id: Store.uid(),
      category: $('add-category').value.trim(),
      ko: ko,
      /* ★ 반드시 검수 대기다. 이 폼에서 'reviewed' 를 만들지 않는다 —
           검수를 지나지 않은 문구는 어떤 화면에서도 안전 지시로 쓰이지 않는다. */
      status: 'waiting',
      translations: picked.map,
      flags: []
    };

    var saved = commit(function (list) { list.push(phrase); },
      '추가했습니다. 검수 대기입니다 — 판정을 받아야 안전 지시로 나갑니다.');

    // 저장에 실패했으면 적은 것을 지우지 않는다. 다시 칠 수는 없다.
    if (saved && saved.ok) clearAddForm();
  });

  buildAddInputs();

  render();
})();
