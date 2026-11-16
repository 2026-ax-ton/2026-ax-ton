/* ===================================================================
   legaltag.js — 문구에 다는 **법정 사항 태그** (PRD-AD-02 FR-10~15 · C06 D-039)

   왜 다나 — 증빙에 「이 교육이 법정 사항 중 무엇을 다뤘는가」를 적으려면,
   안전 지시 문구 하나하나가 어느 사항에 해당하는지 알아야 한다. 지금의
   분류(`category`: 프레스·도장·공통)는 **설비 종류**를 가르는 칸이라 법정
   사항과 다른 축이다. 그래서 **옆에 하나 더** 붙인다 (FR-10).

   태그 두 종류

     기본   `7`      시행규칙 별표 5 제1호다목의 법정 교육 사항 11개
                    (채용 시·작업내용 변경 시 교육 내용)
     특별   `11-2`   별표 5 제1호라목, 특별교육 대상 작업의 **개별 사항**
                    (= 작업 번호 - 사항 번호. 11-2 = 프레스 작업의 ② 방호장치)

   ★ **법령 숫자와 이름을 여기에 다시 적지 않는다.** 목록은 `curriculum.js`
     한 곳이다 (C06 D-046). 이 파일은 **고르는 화면 조각과 이름표**만 만든다.
     베껴 적으면 법이 개정될 때 한쪽만 고쳐진다.

   ★ 태그가 없는 문구도 지금처럼 쓸 수 있다 (FR-12). 「태그 없음」으로
     보이고 막지 않는다 — 이 칸이 생기기 전의 문구가 전부 그렇다.

   ★ 태그는 **사람이** 정한다 (FR-11). AI 가 달지 않는다. 번역 판정과도
     상관없다 — 태그를 바꿔도 언어별 상태는 그대로다.

   🆕 2026-11-16 — 특별교육 대상 작업 **39종 전부** 개별 사항을 고를 수 있다.
     대표 12종(`Curriculum.SPECIAL`, ★)은 영상용 세부 내용까지 있고,
     나머지 27종(`Curriculum.SPECIAL_LATER`)은 별표 5 개별 사항 **이름만** 있다
     (수빈 「영상 제작용 교육 항목 정리」 8절 — 원문을 줄여 적음). 태그는 이름과
     번호만 있으면 되므로 27종도 「작업-순번」(예 `1-2`)으로 단다.
     개별 사항 이름이 비어 있는 작업이 생기면 그 작업만 고를 수 없다고 화면에 적는다.

   ★ 서버를 부르지 않는다. 바깥 요청 0건, ES 모듈 아님 (file:// 에서 열린다).

   문구에 저장되는 칸 (library) — **더하기만 했다**
     legalItems    : [7, 8]        기본 법정 사항 번호
     specialItems  : ['11-2']      특별교육 개별 사항 태그

   근거: PRD-AD-02 §4 FR-10~15 · §7 · C06 D-039·D-046 · 시행규칙 별표 5
   =================================================================== */

var LegalTag = (function () {
  'use strict';

  /* 번호를 동그라미로 — 법령 원문이 ①②③ 로 적혀 있어 대조하기 쉽다.
     11을 넘으면 그냥 숫자로 적는다 (없는 글자를 지어내지 않는다) */
  var CIRCLED = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮'];

  function circled(n) {
    return CIRCLED[n] || String(n);
  }

  /** 기본 법정 사항 11개 — [{ no, title }] */
  function basics() {
    return Curriculum.BASIC.filter(function (b) { return b.legal; })
      .map(function (b) { return { no: b.no, title: b.title }; });
  }

  /** 개별 사항을 고를 수 있는 특별교육 작업 — [{ no, title, detailed, items: [{ tag, title }] }]
   *  detailed: 영상용 세부 내용까지 있는 대표 12종(★). 나머지는 별표 5 개별 사항 이름만 */
  function jobs() {
    var detailed = (Curriculum.SPECIAL || []).map(function (s) {
      return {
        no: s.no,
        title: s.title,
        detailed: true,
        items: s.items.map(function (it) { return { tag: it.tag, title: it.title }; })
      };
    });
    var later = (Curriculum.SPECIAL_LATER || []).filter(function (r) { return r.items && r.items.length; })
      .map(function (r) {
        return {
          no: r.no,
          title: r.title,
          detailed: false,
          items: r.items.map(function (name, i) { return { tag: r.no + '-' + (i + 1), title: name }; })
        };
      });
    return detailed.concat(later).sort(function (a, b) { return a.no - b.no; });
  }

  /** 개별 사항 이름이 아직 없는 작업 — 고를 수 없다는 것을 화면에 적는다 (지금은 없다) */
  function jobsWithoutItems() {
    return (Curriculum.SPECIAL_LATER || []).filter(function (r) { return !r.items || !r.items.length; });
  }

  /** 태그 → 개별 사항 이름. 대표 12종은 curriculum.find, 나머지는 jobs() 에서 */
  function itemTitle(tag) {
    var item = Curriculum.find(tag);
    if (item) return item.title;
    var no = String(tag || '').split('-')[0];
    var job = jobs().filter(function (j) { return String(j.no) === no; })[0];
    var hit = job && job.items.filter(function (it) { return it.tag === tag; })[0];
    return hit ? hit.title : '';
  }

  /** 문구의 태그 — 칸이 없는 옛 문구도 터지지 않는다 (FR-12) */
  function of(phrase) {
    var p = phrase || {};
    return {
      legalItems: (Array.isArray(p.legalItems) ? p.legalItems : []).filter(function (n) { return typeof n === 'number'; }),
      specialItems: (Array.isArray(p.specialItems) ? p.specialItems : []).filter(function (t) { return typeof t === 'string' && t; })
    };
  }

  function hasAny(phrase) {
    var t = of(phrase);
    return t.legalItems.length > 0 || t.specialItems.length > 0;
  }

  /** 기본 사항 번호 → 「⑦ 기계·기구의 위험성과 작업의 순서 및 동선」 */
  function basicLabel(no) {
    var b = Curriculum.BASIC.filter(function (x) { return x.legal && x.no === no; })[0];
    return b ? circled(no) + ' ' + b.title : circled(no);
  }

  /** 개별 사항 태그 → 「특별 11-② 방호장치 종류와 취급」 */
  function specialLabel(tag) {
    var title = itemTitle(tag);
    var part = String(tag || '').split('-');
    var head = '특별 ' + part[0] + '-' + circled(Number(part[1]));
    return title ? head + ' ' + title : head;
  }

  /** 어느 쪽이든 하나 — 화면이 두 종류를 구분하지 않아도 되게 */
  function label(tag) {
    return typeof tag === 'number' ? basicLabel(tag) : specialLabel(tag);
  }

  /** 문구 카드·행에 붙일 이름표. 태그가 없으면 「태그 없음」 하나 (FR-12).
   *  ★ 색만으로 구분하지 않는다 — 글자가 곧 뜻이다 */
  function chips(phrase) {
    var box = UI.el('div', 'chips tag-chips');
    var t = of(phrase);
    if (!t.legalItems.length && !t.specialItems.length) {
      box.appendChild(UI.el('span', 'badge badge-neutral', '태그 없음'));
      return box;
    }
    t.legalItems.slice().sort(function (a, b) { return a - b; }).forEach(function (no) {
      box.appendChild(UI.el('span', 'badge badge-neutral', basicLabel(no)));
    });
    t.specialItems.slice().sort().forEach(function (tag) {
      box.appendChild(UI.el('span', 'badge badge-neutral', specialLabel(tag)));
    });
    return box;
  }

  /** 사항마다 문구가 몇 개인가 — 비어 있는 사항을 운영자가 알아야 한다 (FR-13·15)
   *  { basic: { 7: 2, … }, special: { '11-2': 1, … } } */
  function counts(list) {
    var out = { basic: {}, special: {} };
    basics().forEach(function (b) { out.basic[b.no] = 0; });
    jobs().forEach(function (j) { j.items.forEach(function (it) { out.special[it.tag] = 0; }); });
    (Array.isArray(list) ? list : []).forEach(function (p) {
      var t = of(p);
      t.legalItems.forEach(function (no) { if (out.basic[no] !== undefined) out.basic[no] += 1; });
      t.specialItems.forEach(function (tag) { if (out.special[tag] !== undefined) out.special[tag] += 1; });
    });
    return out;
  }

  /** 이 문구가 고른 사항에 해당하나 — 목록 거르기 (FR-13)
   *  value: '' (전부) · 'none' (태그 없음) · 'b7' (기본 7) · 's11-2' · 'job11' (작업 전체) */
  function matches(phrase, value) {
    if (!value) return true;
    var t = of(phrase);
    if (value === 'none') return !hasAny(phrase);
    if (value.indexOf('b') === 0) return t.legalItems.indexOf(Number(value.slice(1))) !== -1;
    if (value.indexOf('job') === 0) {
      var no = value.slice(3);
      return t.specialItems.some(function (tag) { return String(tag).split('-')[0] === no; });
    }
    if (value.indexOf('s') === 0) return t.specialItems.indexOf(value.slice(1)) !== -1;
    return true;
  }

  /** 거르기 칸의 선택지 — [{ value, label }]. 개수를 함께 적는다 (FR-13·15) */
  function filterOptions(list) {
    var c = counts(list);
    var all = (Array.isArray(list) ? list : []);
    var out = [
      { value: '', label: '법정 사항 — 전부 (' + all.length + '개)' },
      { value: 'none', label: '태그 없음 (' + all.filter(function (p) { return !hasAny(p); }).length + '개)' }
    ];
    basics().forEach(function (b) {
      out.push({ value: 'b' + b.no, label: basicLabel(b.no) + ' — ' + c.basic[b.no] + '개' });
    });
    jobs().forEach(function (j) {
      var sum = j.items.reduce(function (n, it) { return n + c.special[it.tag]; }, 0);
      out.push({ value: 'job' + j.no, label: '특별 ' + (j.detailed ? '★ ' : '') + j.no + ' ' + j.title + ' — ' + sum + '개', group: true });
      j.items.forEach(function (it) {
        out.push({ value: 's' + it.tag, label: '   ' + specialLabel(it.tag) + ' — ' + c.special[it.tag] + '개' });
      });
    });
    return out;
  }

  /** 고르는 칸 — 기본 11개 체크박스 + 작업을 고르면 그 작업의 개별 사항 (FR-11·14).
   *
   *  `name` 으로 입력 이름을 가른다 (추가 폼과 행마다 따로 쓴다).
   *  `selected` 는 `of(phrase)` 모양. 돌려주는 것은 지금 고른 값을 읽는 함수다.
   */
  function picker(name, selected, onChange) {
    var sel = selected || { legalItems: [], specialItems: [] };
    var box = UI.el('div', 'tag-picker');

    box.appendChild(UI.el('p', 'sub', '이 문구가 다루는 법정 교육 사항을 고릅니다. 고르지 않아도 문구는 그대로 쓰입니다.'));

    var basicBox = UI.el('fieldset', 'tag-group');
    basicBox.appendChild(UI.el('legend', null, '법정 교육 사항 (채용 시·작업내용 변경 시)'));
    var basicWrap = UI.el('div', 'picker');
    basics().forEach(function (b) {
      var chip = UI.chip({
        name: name + '-basic', value: String(b.no), label: basicLabel(b.no),
        checked: sel.legalItems.indexOf(b.no) !== -1
      });
      if (onChange) chip.querySelector('input').addEventListener('change', onChange);
      basicWrap.appendChild(chip);
    });
    basicBox.appendChild(basicWrap);
    box.appendChild(basicBox);

    var spBox = UI.el('fieldset', 'tag-group');
    spBox.appendChild(UI.el('legend', null, '특별교육 개별 사항 (해당할 때만)'));
    var jobSel = UI.el('select');
    jobSel.id = name + '-job';
    var none = UI.el('option', null, '작업을 고르면 개별 사항이 나옵니다');
    none.value = '';
    jobSel.appendChild(none);
    jobs().forEach(function (j) {
      var o = UI.el('option', null, (j.detailed ? '★ ' : '') + j.no + '. ' + j.title);
      o.value = String(j.no);
      jobSel.appendChild(o);
    });
    spBox.appendChild(jobSel);

    var itemWrap = UI.el('div', 'picker');
    itemWrap.id = name + '-items';
    spBox.appendChild(itemWrap);

    /* 이미 고른 개별 사항은 작업을 고르지 않아도 보여야 한다 — 안 그러면
       화면을 다시 열 때 고른 것이 사라진 것처럼 보인다 */
    var chosen = UI.el('div', 'chips');
    function renderChosen() {
      chosen.textContent = '';
      if (!sel.specialItems.length) return;
      sel.specialItems.slice().sort().forEach(function (tag) {
        var b = UI.el('button', 'btn-sm', specialLabel(tag) + ' ✕');
        b.type = 'button';
        b.setAttribute('aria-label', specialLabel(tag) + ' 빼기');
        b.addEventListener('click', function () {
          sel.specialItems = sel.specialItems.filter(function (x) { return x !== tag; });
          renderChosen();
          renderItems();
          if (onChange) onChange();
        });
        chosen.appendChild(b);
      });
    }

    function renderItems() {
      itemWrap.textContent = '';
      var no = jobSel.value;
      if (!no) return;
      var job = jobs().filter(function (j) { return String(j.no) === no; })[0];
      if (!job) return;
      job.items.forEach(function (it) {
        var chip = UI.chip({
          name: name + '-special', value: it.tag, label: specialLabel(it.tag),
          checked: sel.specialItems.indexOf(it.tag) !== -1
        });
        var input = chip.querySelector('input');
        input.addEventListener('change', function () {
          if (input.checked) {
            if (sel.specialItems.indexOf(it.tag) === -1) sel.specialItems.push(it.tag);
          } else {
            sel.specialItems = sel.specialItems.filter(function (x) { return x !== it.tag; });
          }
          renderChosen();
          if (onChange) onChange();
        });
        itemWrap.appendChild(chip);
      });
    }

    jobSel.addEventListener('change', renderItems);
    spBox.appendChild(chosen);

    var all = jobs();
    var plain = all.filter(function (j) { return !j.detailed; }).length;
    spBox.appendChild(UI.el('p', 'sub',
      '특별교육 대상 작업 ' + all.length + '종을 고를 수 있습니다. ★ 표시 ' + (all.length - plain) + '종은 영상용 세부 내용까지 있고, '
      + '나머지 ' + plain + '종은 별표 5 개별 사항 이름만 있습니다.'));
    var later = jobsWithoutItems();
    if (later.length) {
      spBox.appendChild(UI.el('p', 'sub',
        '개별 사항 이름이 없는 ' + later.length + '종은 고를 수 없습니다.'));
    }
    box.appendChild(spBox);

    renderChosen();
    renderItems();

    /* 지금 고른 값을 읽는다 — 저장하는 쪽이 부른다 */
    box.read = function () {
      /* 기본 사항은 지금 화면에 다 떠 있으니 체크된 것을 읽는다.
         개별 사항은 **작업을 바꾸면 화면에서 사라지므로** 고른 목록(`sel`)을
         따로 들고 있다 — 체크박스만 읽으면 다른 작업에서 고른 것이 지워진다 */
      var basicsOn = UI.checkedValues(name + '-basic', box).map(Number);
      return { legalItems: basicsOn.sort(function (a, b) { return a - b; }), specialItems: sel.specialItems.slice().sort() };
    };
    return box;
  }

  return {
    basics: basics,
    jobs: jobs,
    jobsWithoutItems: jobsWithoutItems,
    of: of,
    hasAny: hasAny,
    label: label,
    basicLabel: basicLabel,
    specialLabel: specialLabel,
    circled: circled,
    chips: chips,
    counts: counts,
    matches: matches,
    filterOptions: filterOptions,
    picker: picker
  };
})();
