/* 설비 등록 때 특별교육 대상 안내 (PRD-AD-01 FR-08·09 · 시행규칙 별표 5)

   ★ 실제 화면(admin/setup.html)을 jsdom 으로 돌린다.
     낱말 표와 작업 이름은 이 묶음에서 다시 적지 않는다 — `curriculum.js` 와
     **같은지만** 본다 (`test-edu-kind.js`·`test-legal-tag.js` 와 같은 이유).

   이 묶음이 지키는 것
     1. ★★ **안내는 저장을 막지 않는다** (FR-08) — 낱말이 걸려도 그냥 저장된다
     2. ★★ **우리가 표시하지 않는다** (FR-09) — 체크칸은 기본 해제다.
        「5대 이상」·「1톤 이상」 같은 조건은 담당자만 안다
     3. ★★ 체크해야만 `specialWork` 가 저장된다. 배지도 그때만 붙는다
     4. ★ 낱말이 지워지면 안내도 사라진다 (FR-08)
     5. ★ 「타워크레인」은 「크레인」과 다른 작업이다 (30·39 vs 14) — 먼저 걸려야 한다
     6. ★ 조건(`when`)을 함께 보여 준다 — 조건 없이 「대상입니다」라고 하면 단정이 된다
     7. ★ 수정하러 들어가면 표시가 되살아난다 (조용히 풀리지 않는다)
     8. ★ 다음 설비로 표시가 딸려 가지 않는다
     9. ★ 칸이 없는 옛 설비도 그대로 보인다

   근거: PRD-AD-01 §4 FR-08·09 · C06 D-039·D-046 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { boot, ok, eq, has, report, SRC } = require('./harness');

const text = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');
const input = (win, n) => n.dispatchEvent(new win.Event('input', { bubbles: true }));
const click = (win, n) => n.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const submit = (win, n) => n.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));

const C = vm.runInNewContext(fs.readFileSync(path.join(SRC, 'assets/curriculum.js'), 'utf8') + '\nCurriculum;', {});
const setupSrc = fs.readFileSync(path.join(SRC, 'admin/setup.js'), 'utf8');

function open() {
  return boot('admin/setup.html', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/setup.js' });
}

/** 설비 이름을 적는다 — 안내는 입력하는 동안 뜬다 */
function typeName(t, name) {
  t.$('equip-name').value = name;
  input(t.win, t.$('equip-name'));
  return t.$('equip-special');
}

/* =================================================================
   1. 낱말 표는 curriculum.js 한 곳에서 온다
   ================================================================= */
{
  const t = open();
  ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));

  const W = t.win.Curriculum.EQUIP_WORDS;
  eq('낱말 표가 화면에서도 같은 것이다', W.length, C.EQUIP_WORDS.length);
  ok('모든 줄이 작업 번호를 가리킨다', W.every((r) => r.jobs.length > 0));
  ok('★ 가리키는 작업이 실제로 있다 (별표 5)', W.every((r) => r.jobs.every((no) => !!C.job(no))));

  const code = setupSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('설비 화면이 낱말을 베껴 적지 않았다', code.indexOf('둥근톱') === -1 && code.indexOf('호이스트') === -1);
}

/* =================================================================
   2. ★ 낱말이 걸리면 뜨고, 지워지면 사라진다 (FR-08)
   ================================================================= */
{
  const t = open();

  eq('처음에는 안내가 없다', t.$('equip-special').hidden, true);

  let box = typeName(t, '프레스 3호기');
  eq('★ 낱말이 걸리면 뜬다', box.hidden, false);
  has('무엇에 걸렸는지 말한다', text(box), C.job(11).title);
  has('별표 5 몇 호인지 적는다', text(box), '별표 5 제11호');
  has('★★ 「일 수 있습니다」 — 단정하지 않는다', text(box), '특별교육 대상일 수 있습니다');
  has('★ 조건을 함께 적는다 (담당자만 아는 것)', text(box), '5대 이상');
  has('법정 시간을 적는다', text(box), '일용직 2시간');

  box = typeName(t, '컨베이어 1호');
  eq('★ 낱말이 없으면 사라진다', box.hidden, true);

  box = typeName(t, '');
  eq('이름을 비우면 사라진다', box.hidden, true);
}

/* =================================================================
   3. ★ 타워크레인은 크레인과 다른 작업이다
   ================================================================= */
{
  const t = open();
  const tower = text(typeName(t, '타워크레인 1호'));
  has('★ 타워크레인은 설치·해체(30)', tower, C.job(30).title);
  has('★ 타워크레인은 신호 업무(39)도', tower, C.job(39).title);
  ok('★★ 크레인 작업(14)으로 잘못 읽지 않는다', tower.indexOf(C.job(14).title) === -1);

  has('그냥 크레인은 14호', text(typeName(t, '천장크레인 2호')), C.job(14).title);
}

/* =================================================================
   4. ★★ 안내가 저장을 막지 않는다 · 우리가 표시하지 않는다 (FR-08·09)
   ================================================================= */
{
  const t = open();
  const win = t.win;
  const before = win.Store.setup.load().equipments.length;

  const box = typeName(t, '프레스 9호기');
  const check = win.document.getElementById('equip-special-on');
  ok('체크칸이 있다 (FR-09)', !!check);
  eq('★★ 기본은 해제다 — 조건을 모르는 채로 단정하지 않는다', check.checked, false);

  t.$('equip-proc').value = win.Store.setup.load().processes[0].id;
  submit(win, t.$('form-equip'));

  const list = win.Store.setup.load().equipments;
  eq('★★ 낱말이 걸려도 그냥 저장된다 (막지 않는다)', list.length, before + 1);
  const saved = list[list.length - 1];
  eq('저장된 이름이 맞다', saved.name, '프레스 9호기');
  eq('★★ 체크하지 않았으면 표시가 들어가지 않는다', (saved.specialWork || []).length, 0);

  const shown = text(t.$('list-equip'));
  ok('★★ 목록에 특별교육 배지가 붙지 않는다', shown.indexOf('특별교육 · ') === -1);
}

/* =================================================================
   5. ★★ 체크하면 저장되고 배지가 붙는다 (FR-09)
   ================================================================= */
{
  const t = open();
  const win = t.win;

  typeName(t, '프레스 7호기');
  const check = win.document.getElementById('equip-special-on');
  check.checked = true;
  t.$('equip-proc').value = win.Store.setup.load().processes[0].id;
  submit(win, t.$('form-equip'));

  const saved = win.Store.setup.load().equipments.filter((e) => e.name === '프레스 7호기')[0];
  ok('설비가 저장됐다', !!saved);
  eq('★★ 체크한 작업 번호가 저장된다', (saved.specialWork || []).join(','), '11');

  has('★ 목록에 「특별교육」 배지가 붙는다', text(t.$('list-equip')), '특별교육 · ' + C.job(11).title);

  /* ★ 다음 설비로 딸려 가지 않는다 (폼이 비워졌다) */
  eq('★ 저장 뒤 이름칸이 비었다', t.$('equip-name').value, '');
  eq('★ 안내도 접힌다', t.$('equip-special').hidden, true);

  typeName(t, '프레스 8호기');
  eq('★★ 다음 설비의 체크칸은 다시 해제다', win.document.getElementById('equip-special-on').checked, false);
}

/* =================================================================
   6. ★ 수정하러 들어가면 표시가 되살아난다
   ================================================================= */
{
  const t = open();
  const win = t.win;
  win.Store.setup.update((s) => {
    const eqp = s.equipments.find((e) => e.id === 'e-press3');
    eqp.specialWork = [11];
  });
  t.run('admin/setup.js', { shimLocation: true });

  has('저장된 설비에 배지가 보인다', text(t.$('list-equip')), '특별교육 · ' + C.job(11).title);

  const row = [...win.document.querySelectorAll('#list-equip li')].find((li) => li.getAttribute('data-id') === 'e-press3');
  click(win, [...row.querySelectorAll('button')].find((b) => text(b) === '수정'));

  eq('이름이 들어왔다', t.$('equip-name').value, '프레스 3호기');
  eq('★ 안내가 떠 있다', t.$('equip-special').hidden, false);
  eq('★★ 표시가 되살아난다 (조용히 풀리지 않는다)',
    win.document.getElementById('equip-special-on').checked, true);

  /* 체크를 풀고 저장하면 표시가 빠진다 */
  win.document.getElementById('equip-special-on').checked = false;
  submit(win, t.$('form-equip'));
  const after = win.Store.setup.load().equipments.find((e) => e.id === 'e-press3');
  eq('★ 풀면 빠진다', (after.specialWork || []).length, 0);
  eq('설비는 그대로 남는다', after.name, '프레스 3호기');
}

/* =================================================================
   7. ★ 칸이 없는 옛 설비도 그대로 보인다
   ================================================================= */
{
  const t = open();
  const list = t.win.Store.setup.load().equipments;
  ok('예시 설비에는 칸이 없다 (옛 데이터와 같은 처지)',
    list.every((e) => e.specialWork === undefined));
  ok('그래도 목록이 그려진다', t.win.document.querySelectorAll('#list-equip li').length === list.length);
  ok('배지는 붙지 않는다', text(t.$('list-equip')).indexOf('특별교육 · ') === -1);
  ok('오류 없음', t.errors.length === 0, t.errors.join(' | '));
}

report('설비 등록 — 특별교육 대상 안내 (판정이 아니라 안내다)');
