/* 문구 법정 사항 태그 (PRD-AD-02 FR-10~15 · C06 D-039 · 시행규칙 별표 5)

   ★ 실제 화면(admin/library.html)을 jsdom 으로 돌린다.
     법령 숫자와 이름은 이 묶음에서 다시 적지 않는다 — `curriculum.js` 와
     **같은지만** 본다 (베껴 적으면 법이 개정돼도 검사가 거짓으로 통과한다).
     `test-edu-kind.js` 와 같은 이유다.

   이 묶음이 지키는 것
     1. ★★ **태그가 없는 문구를 막지 않는다** (FR-12) — 이 칸이 생기기 전의
        문구가 전부 그렇다. 「태그 없음」으로 보이고 그대로 쓰인다
     2. ★★ **태그를 고쳐도 검수 판정이 흔들리지 않는다** (FR-11) — status ·
        translations 를 건드리지 않는다. 오역 하나로 안전 지시가 멈추는 판정과
        태그는 다른 축이다
     3. ★★ **AI 가 태그를 달지 않는다** (FR-11) — 화면에 AI 로 태그를 다는 길이 없다
     4. ★ 기본 11개와 특별교육 개별 사항을 함께 달 수 있다 (FR-10·14)
     5. ★ 목록을 법정 사항으로 거를 수 있고, **0개인 사항도 목록에 남는다** (FR-13·15)
        — 비어 있다는 것이 운영자가 알아야 하는 사실이다
     6. ★ 특별교육 39종 전부 개별 사항을 고를 수 있다 (2026-11-16, 대표 12종은 원래 태그로 ·
        나머지 27종은 작업번호-순번 태그로)
     7. ★ 이름표가 법령 모양이다 — 「⑦ …」 · 「특별 11-② …」
     8. ★ 브라우저 규칙 — fetch·ES 모듈 없음, 법령 숫자를 다시 적지 않는다 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { boot, ok, eq, has, report, SRC } = require('./harness');

const text = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (win, node) => node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const change = (win, node) => node.dispatchEvent(new win.Event('change', { bubbles: true }));

const C = vm.runInNewContext(fs.readFileSync(path.join(SRC, 'assets/curriculum.js'), 'utf8') + '\nCurriculum;', {});
const legalSrc = fs.readFileSync(path.join(SRC, 'assets/legaltag.js'), 'utf8');

function open(opts = {}) {
  return boot('admin/library.html',
    Object.assign({ login: 'oper@safety.kr', role: 'operator', page: 'admin/library.js' }, opts));
}

/** 그 문구의 행을 찾는다 */
function rowOf(t, ko) {
  return [...t.win.document.querySelectorAll('#phrase-rows tr')]
    .find((tr) => tr.cells.length === 5 && tr.cells[0].textContent.indexOf(ko) === 0);
}

/* =================================================================
   1. 목록은 `curriculum.js` 한 곳에서 온다 (★ 8)
   ================================================================= */
{
  const t = open();
  const L = t.win.LegalTag;
  ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));

  eq('기본 법정 사항은 curriculum.js 의 법정 11개 그대로',
    L.basics().map((b) => b.no).join(','),
    C.BASIC.filter((b) => b.legal).map((b) => b.no).join(','));
  eq('이름도 그대로', L.basics()[6].title, C.BASIC.find((b) => b.no === 7).title);
  eq('특별교육 39종 전부 — curriculum.js 의 SPECIAL + SPECIAL_LATER',
    L.jobs().map((j) => j.no).sort((a, b) => a - b).join(','),
    C.SPECIAL.concat(C.SPECIAL_LATER).map((s) => s.no).sort((a, b) => a - b).join(','));
  eq('대표 12종의 개별 사항 태그는 curriculum.js 그대로',
    L.jobs().find((j) => j.no === 11).items.map((i) => i.tag).join(','),
    C.SPECIAL.find((s) => s.no === 11).items.map((i) => i.tag).join(','));
  eq('나머지 27종도 태그가 생긴다 (작업번호-순번)',
    L.jobs().find((j) => j.no === C.SPECIAL_LATER[0].no).items[0].tag,
    C.SPECIAL_LATER[0].no + '-1');

  /* ★ 법령 숫자·이름을 legaltag.js 안에 다시 적지 않았는가 */
  const code = legalSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('법정 사항 이름을 베껴 적지 않았다', code.indexOf('기계·기구의 위험성') === -1);
  ok('fetch 를 부르지 않는다', !/\bfetch\s*\(/.test(code));
  ok('ES 모듈이 아니다', !/^\s*(import|export)\s/m.test(code));
  ok('localStorage 를 직접 부르지 않는다 (Store 를 거친다)', !/localStorage/.test(code));
}

/* =================================================================
   2. 이름표가 법령 모양이다 (★ 7)
   ================================================================= */
{
  const t = open();
  const L = t.win.LegalTag;
  eq('기본은 동그라미 번호 + 이름', L.basicLabel(7), '⑦ ' + C.BASIC.find((b) => b.no === 7).title);
  eq('특별은 「특별 작업-사항」 + 이름', L.specialLabel('11-2'), '특별 11-② ' + C.find('11-2').title);
  has('한 함수로 둘 다 부른다 (화면이 종류를 가르지 않아도 된다)', L.label(7), '⑦');
  has('태그 글자를 주면 특별로 읽는다', L.label('11-2'), '특별 11-②');
  eq('없는 사항이어도 터지지 않는다', typeof L.label(99), 'string');
}

/* =================================================================
   3. ★★ 태그가 없는 문구를 막지 않는다 (FR-12)
   ================================================================= */
{
  const t = open();
  const L = t.win.LegalTag;

  /* 예시 데이터의 문구에는 아직 태그가 없다 — 이 칸이 생기기 전 상태다 */
  const list = t.win.Store.library.load();
  ok('예시 문구에는 태그가 없다 (옛 데이터와 같은 처지)', list.every((p) => !L.hasAny(p)));
  eq('태그 칸이 없어도 읽을 수 있다', L.of(list[0]).legalItems.length + L.of(list[0]).specialItems.length, 0);
  eq('문구가 아예 없어도 터지지 않는다', L.of(null).legalItems.length, 0);
  eq('이상한 값이 들어 있어도 걸러 읽는다',
    L.of({ legalItems: ['7', null, 8], specialItems: [3, '11-2', ''] }).legalItems.join(',') + '|'
    + L.of({ legalItems: ['7', null, 8], specialItems: [3, '11-2', ''] }).specialItems.join(','), '8|11-2');

  const row = rowOf(t, '프레스가 멈춰도');
  ok('★★ 태그 없는 문구도 목록에 그대로 보인다', !!row);
  has('★★ 「태그 없음」으로 보인다 (숨기거나 막지 않는다)', text(row.cells[0]), '태그 없음');
  eq('검수 완료 상태는 그대로다', t.win.Store.library.load().find((p) => p.id === 'ph-1').status, 'reviewed');
}

/* =================================================================
   4. ★★ 태그를 달아도 검수 판정이 흔들리지 않는다 (FR-11) · 기본+특별 함께 (FR-10·14)
   ================================================================= */
{
  const t = open();
  const win = t.win;
  const before = win.Store.library.load().find((p) => p.id === 'ph-1');
  const beforeStatus = before.status;
  const beforeTrans = JSON.stringify(before.translations);

  const row = rowOf(t, '프레스가 멈춰도');
  const tagBtn = [...row.querySelectorAll('button')].find((b) => text(b) === '법정 사항');
  ok('행에 「법정 사항」 버튼이 있다 (FR-11 — 카드에서 고친다)', !!tagBtn);
  click(win, tagBtn);

  const panel = win.document.querySelector('#phrase-rows .tag-row');
  ok('고르는 칸이 펼쳐진다', !!panel);
  has('법정 교육 사항 묶음이 있다', text(panel), '법정 교육 사항');
  has('특별교육 개별 사항 묶음이 있다', text(panel), '특별교육 개별 사항');

  /* 기본 ⑦ 을 고르고, 특별교육 11번 작업의 개별 사항 ② 를 고른다 */
  const b7 = panel.querySelector('input[name="tag-ph-1-basic"][value="7"]');
  ok('기본 사항 ⑦ 을 고를 수 있다', !!b7);
  b7.checked = true;
  change(win, b7);

  const jobSel = panel.querySelector('select');
  jobSel.value = '11';
  change(win, jobSel);
  const s112 = panel.querySelector('input[name="tag-ph-1-special"][value="11-2"]');
  ok('★ 작업을 고르면 그 작업의 개별 사항이 나온다 (FR-14)', !!s112);
  s112.checked = true;
  change(win, s112);

  click(win, [...panel.querySelectorAll('button')].find((b) => text(b) === '법정 사항 저장'));

  const after = win.Store.library.load().find((p) => p.id === 'ph-1');
  eq('★ 기본 사항이 저장된다', (after.legalItems || []).join(','), '7');
  eq('★ 특별교육 개별 사항도 함께 저장된다 (FR-10+14 한 문구에 둘 다)', (after.specialItems || []).join(','), '11-2');
  eq('★★ 검수 상태를 건드리지 않는다', after.status, beforeStatus);
  eq('★★ 번역을 건드리지 않는다', JSON.stringify(after.translations), beforeTrans);

  const row2 = rowOf(t, '프레스가 멈춰도');
  has('★ 행에 법령 모양으로 보인다', text(row2.cells[0]), '⑦ ');
  has('★ 특별 사항도 보인다', text(row2.cells[0]), '특별 11-②');
  ok('「태그 없음」은 사라진다', text(row2.cells[0]).indexOf('태그 없음') === -1);
}

/* =================================================================
   5. 태그를 모두 빼도 문구는 그대로 쓰인다 (FR-12)
   ================================================================= */
{
  const t = open();
  const win = t.win;
  win.Store.library.update((list) => {
    const p = list.find((x) => x.id === 'ph-1');
    p.legalItems = [7];
    p.specialItems = ['11-2'];
  });
  t.run('admin/library.js', { shimLocation: true });

  const row = rowOf(t, '프레스가 멈춰도');
  click(win, [...row.querySelectorAll('button')].find((b) => text(b) === '법정 사항'));
  const panel = win.document.querySelector('#phrase-rows .tag-row');

  has('이미 고른 개별 사항이 보인다 (작업을 다시 고르지 않아도)', text(panel), '특별 11-②');

  const b7 = panel.querySelector('input[name="tag-ph-1-basic"][value="7"]');
  eq('이미 고른 기본 사항이 체크돼 있다', b7.checked, true);
  b7.checked = false;
  change(win, b7);

  /* 고른 개별 사항을 ✕ 로 뺀다 */
  const off = [...panel.querySelectorAll('button')].find((b) => text(b).indexOf('특별 11-②') === 0);
  ok('고른 개별 사항을 뺄 수 있다', !!off);
  click(win, off);

  click(win, [...panel.querySelectorAll('button')].find((b) => text(b) === '법정 사항 저장'));

  const after = win.Store.library.load().find((p) => p.id === 'ph-1');
  eq('기본 사항이 비워진다', (after.legalItems || []).length, 0);
  eq('개별 사항도 비워진다', (after.specialItems || []).length, 0);
  eq('★ 문구는 그대로 검수 완료다 (막지 않는다)', after.status, 'reviewed');
  has('다시 「태그 없음」으로 보인다', text(rowOf(t, '프레스가 멈춰도').cells[0]), '태그 없음');
}

/* =================================================================
   6. 목록 거르기 — 0개인 사항도 남는다 (FR-13·15)
   ================================================================= */
{
  const t = open();
  const win = t.win;
  win.Store.library.update((list) => {
    list.find((x) => x.id === 'ph-1').legalItems = [7];
    list.find((x) => x.id === 'ph-2').legalItems = [8];
    list.find((x) => x.id === 'ph-1').specialItems = ['11-2'];
  });
  t.run('admin/library.js', { shimLocation: true });

  const sel = t.$('filter-legal');
  ok('법정 사항 거르기 칸이 있다', !!sel);
  const labels = [...sel.options].map((o) => o.textContent);

  has('사항마다 문구 개수를 적는다 (FR-13)', labels.find((l) => l.indexOf('⑦') === 0), '1개');
  ok('★★ 0개인 사항도 목록에 남는다 (비어 있다는 것을 알려야 한다)',
    labels.some((l) => l.indexOf('①') === 0 && l.indexOf('0개') !== -1));
  ok('특별교육 작업도 고를 수 있다 (FR-15)', [...sel.options].some((o) => o.value === 'job11'));
  has('작업 아래 개별 사항마다 개수를 적는다 (FR-15)',
    labels.find((l) => l.indexOf('특별 11-②') !== -1), '1개');
  ok('태그 없는 문구만 보기도 있다', [...sel.options].some((o) => o.value === 'none'));

  /* ⑦ 로 거른다 */
  sel.value = 'b7';
  change(win, sel);
  const shown = [...win.document.querySelectorAll('#phrase-rows tr')].filter((tr) => tr.cells.length === 5);
  eq('★ 고른 사항의 문구만 보인다', shown.length, 1);
  has('그 문구가 맞다', text(shown[0].cells[0]), '프레스가 멈춰도');

  /* 아무 문구도 없는 사항 */
  sel.value = 'b1';
  change(win, sel);
  has('★ 비어 있으면 왜 비었는지 말한다', text(t.$('phrase-rows')), '이 법정 사항에 해당하는 문구가 아직 없습니다');

  /* 작업 전체로 거르기 */
  sel.value = 'job11';
  change(win, sel);
  eq('작업으로 거르면 그 작업의 사항을 단 문구가 나온다',
    [...win.document.querySelectorAll('#phrase-rows tr')].filter((tr) => tr.cells.length === 5).length, 1);

  sel.value = 'none';
  change(win, sel);
  const noneRows = [...win.document.querySelectorAll('#phrase-rows tr')].filter((tr) => tr.cells.length === 5);
  ok('태그 없는 문구만 보기가 된다', noneRows.length > 0
    && noneRows.every((tr) => text(tr.cells[0]).indexOf('태그 없음') !== -1));
}

/* =================================================================
   7. 새 문구를 추가할 때도 고를 수 있다 (FR-11)
   ================================================================= */
{
  const t = open();
  const win = t.win;
  const box = t.$('add-legal');
  ok('추가 폼에 고르는 칸이 있다', !!box && box.querySelector('input[name="add-legal-basic"]'));

  t.$('add-ko').value = '금형을 고정했는지 확인하십시오';
  const b8 = box.querySelector('input[name="add-legal-basic"][value="8"]');
  b8.checked = true;
  change(win, b8);

  t.$('form-add').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));

  const added = win.Store.library.load().find((p) => p.ko === '금형을 고정했는지 확인하십시오');
  ok('문구가 추가된다', !!added);
  eq('★ 고른 법정 사항이 함께 저장된다', (added.legalItems || []).join(','), '8');
  eq('★★ 그래도 검수 대기로 들어간다 (태그가 검수를 대신하지 않는다)', added.status, 'waiting');

  /* 고르지 않으면 칸을 만들지 않는다 — 「태그 없음」과 같은 상태 */
  t.$('add-ko').value = '통로를 막지 마십시오';
  t.$('form-add').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  const plain = win.Store.library.load().find((p) => p.ko === '통로를 막지 마십시오');
  ok('고르지 않으면 태그 칸을 만들지 않는다', plain && plain.legalItems === undefined);
  eq('그 문구도 그대로 들어간다', plain.status, 'waiting');
}

/* =================================================================
   8. 특별교육 39종 전부 고를 수 있다 (★ 6, 2026-11-16 부터)
   ================================================================= */
{
  const t = open();
  const L = t.win.LegalTag;
  eq('개별 사항이 있는 작업 = 특별교육 39종 전부', L.jobs().length, 39);
  ok('「아직 자료가 없어 고를 수 없습니다」 안내가 더는 없다',
    text(t.$('add-legal')).indexOf('아직 자료가 없어 고를 수 없습니다') === -1);
  eq('고르는 칸에 39종이 다 나온다',
    [...t.$('add-legal').querySelectorAll('select option')].filter((o) => o.value).length, 39);
}

/* =================================================================
   9. ★★ AI 가 태그를 달지 않는다 (FR-11)
   ================================================================= */
{
  const lib = fs.readFileSync(path.join(SRC, 'admin/library.js'), 'utf8');
  /* 태그를 쓰는 자리는 사람이 누르는 두 곳뿐이다 — 추가 폼과 행의 저장 버튼 */
  const writes = (lib.match(/legalItems\s*=/g) || []).length + (lib.match(/legalItems\s*=/g) || []).length;
  ok('태그를 쓰는 자리가 몇 곳 없다 (사람이 누르는 곳만)', writes <= 4, String(writes));
  ok('★★ AI 응답에서 태그를 받지 않는다',
    !/legalItems|specialItems/.test(lib.slice(lib.indexOf('function saveAgentResults'), lib.indexOf('function runAgent'))));
  const agent = fs.readFileSync(path.join(SRC, 'assets/agent.js'), 'utf8');
  ok('★★ 에이전트 코드가 태그를 만들지 않는다', !/legalItems|specialItems/.test(agent));
}

report('문구 법정 사항 태그 — 사람이 달고, 없어도 막지 않는다');
