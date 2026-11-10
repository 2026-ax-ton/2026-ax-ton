/* 기능1 설비 등록 — 제조사·모델명·연식 (PRD-AD-08 S1 · FR-AD-08-01·02)

   이 묶음이 지키는 것
     1. 세 칸은 선택이다 — 비워도 설비가 저장된다 (FR-02)
     2. 넣으면 그대로 저장되고 목록에 보인다
     3. ★ 연식은 범위 밖이면 버린다 — 잘못된 값으로 리서치하지 않게
     4. ★ 기존 필드(hazards·icon·processId)는 그대로다 — 더하기만 */

const { boot, ok, eq, has, report } = require('./harness');

const t = boot('admin/setup.html', { login: 'kim@daesung.co.kr', page: 'admin/setup.js' });
const { win } = t;
const doc = win.document;
const $ = (id) => doc.getElementById(id);
const S = win.Store;

function addEquip(name, maker, model, year) {
  $('equip-name').value = name;
  $('equip-maker').value = maker;
  $('equip-model').value = model;
  $('equip-year').value = year;
  $('form-equip').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  return S.setup.load().equipments.find((e) => e.name === name);
}

ok('화면에 제조사·모델명·연식 칸이 있다', !!($('equip-maker') && $('equip-model') && $('equip-year')));

const a = addEquip('프레스 9호기', '화천기계', 'HPC-110', '2019');
ok('설비가 저장됐다', !!a);
eq('제조사', a && a.maker, '화천기계');
eq('모델명', a && a.model, 'HPC-110');
eq('연식은 숫자로', a && a.year, 2019);
ok('★ 기존 필드는 그대로 있다', a && Array.isArray(a.hazards) && !!a.icon && !!a.processId);
has('목록에 제조사·모델명이 보인다', $('list-equip').textContent, '화천기계 · HPC-110 · 2019');
eq('저장 뒤 칸이 비워진다', $('equip-maker').value + $('equip-model').value + $('equip-year').value, '');

const b = addEquip('도장 부스 2', '', '', '');
ok('★ 세 칸을 비워도 저장된다 (선택)', !!b);
eq('빈 제조사는 빈 문자열', b && b.maker, '');
eq('빈 연식은 null', b && b.year, null);

const c = addEquip('분전반 X', '', '', '1800');
eq('★ 범위 밖 연식은 버린다', c && c.year, null);

/* 2026-11-11 — 설비 탭이 원천: 종류(고정 id) · 사진 · 수정 · AI 분석 결과 */
ok('★ 설비 종류 칸 — 고정 목록', $('equip-kind').options.length === S.EQUIPMENT_KINDS.length && $('equip-kind').options[0].value === 'press');
$('equip-kind').value = 'injection';
const d = addEquip('사출기 1', '우진', 'TB-G5', '');
eq('★★ 종류가 id 로 저장된다', d && d.kind, 'injection');
eq('새 설비는 사진·분석이 비어 있다', d && (d.photo + '|' + d.analysis), '|null');
has('목록에 종류가 보인다', $('list-equip').querySelector('li[data-id="' + d.id + '"]').textContent, '종류 · 사출성형');
ok('★ 분석·교육 만들기로 가는 길 (설비 id)', $('list-equip').querySelector('li[data-id="' + d.id + '"] a[href="autogen.html#eq=' + d.id + '"]') !== null);

/* 수정 — 분석 결과가 있던 설비의 종류를 바꾸면 분석을 지운다 (다른 설비의 결과가 남지 않게) */
S.setup.update((s) => { const e = s.equipments.find((x) => x.id === d.id); e.analysis = { at: '2026-11-11T00:00:00Z', research: { items: [{ id: 'r1' }, { id: 'r2' }] }, guided: { mapped: [{ id: 'r1' }] } }; });
/* 종류 칸이 없던 옛 설비 하나 */
S.setup.update((s) => { s.equipments.push({ id: 'e-old', processId: s.processes[0].id, name: '옛 분전반', icon: '⚡', hazards: [], note: '' }); });
const editBtn = Array.from($('list-equip').querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === '사출기 1 설비 수정');
ok('수정 버튼이 있다', !!editBtn);
// 목록을 다시 그려야 분석 줄이 보인다
$('equip-kind').dispatchEvent(new win.Event('change'));
editBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
eq('★ 수정을 누르면 그 설비 값이 폼에 들어간다', $('equip-name').value + '|' + $('equip-kind').value + '|' + $('equip-edit-id').value, '사출기 1|injection|' + d.id);
$('equip-model').value = 'TB-G5';
$('form-equip').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
const d2 = S.setup.load().equipments.find((e) => e.id === d.id);
ok('★ 종류·모델·사진이 그대로면 분석을 남긴다', !!d2.analysis);
has('★ 목록에 분석 요약 (위험 · 사진 위치 · 위치 확인 필요)', $('list-equip').textContent, 'AI 분석: 위험 2 · 사진 위치 1 · 위치 확인 필요 1');
eq('수정해도 설비 수는 그대로', S.setup.load().equipments.filter((e) => e.name === '사출기 1').length, 1);
Array.from($('list-equip').querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === '사출기 1 설비 수정').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
$('equip-kind').value = 'press';
$('form-equip').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
const d3 = S.setup.load().equipments.find((e) => e.id === d.id);
eq('★★ 종류를 바꾸면 예전 AI 분석을 지운다', d3.kind + '|' + d3.analysis, 'press|null');
has('★ 종류가 없던 옛 설비는 「종류 확인 필요」(이름으로 짐작)', $('list-equip').querySelector('li[data-id="e-old"]').textContent, '종류 확인 필요 (전기설비?)');
eq('저장 뒤 수정 상태가 풀린다', $('equip-edit-id').value + '|' + $('btn-equip-cancel').hidden, '|true');

/* 콘텐츠에서 왔으면 돌아가는 길을 보인다 */
const r = boot('admin/setup.html?return=content', { login: 'kim@daesung.co.kr', page: 'admin/setup.js' });
eq('★ ?return=content 면 「콘텐츠로 돌아가기」', r.win.document.getElementById('return-note').hidden, false);
eq('평소에는 안 보인다', $('return-note').hidden, true);

ok('화면 오류 없음', t.errors.length === 0, t.errors.join(' | '));
report('설비 등록 — 제조사·모델명·연식 (PRD-AD-08 S1)');
