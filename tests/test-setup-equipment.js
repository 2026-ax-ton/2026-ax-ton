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

ok('화면 오류 없음', t.errors.length === 0, t.errors.join(' | '));
report('설비 등록 — 제조사·모델명·연식 (PRD-AD-08 S1)');
