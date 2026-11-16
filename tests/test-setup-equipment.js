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
ok('★★ 새 설비는 검수 대기 — 교육 만들기로 가는 길이 없다', $('list-equip').querySelector('li[data-id="' + d.id + '"] a[href="autogen.html#eq=' + d.id + '"]') === null);
ok('★★ 검수 대기는 교육에 못 쓴다 · review 없는 옛 설비는 쓴다', !S.equipmentReady(d) && S.equipmentReady({ id: 'old' }) && S.equipmentReady({ id: 'x', review: { status: 'approved' } }));

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
/* 2026-11-16 — [카메라로 찍기] = 가이드 촬영(scan.html). 목록 줄에서 그 설비로 연다 */
ok('★ 사진 칸에 [카메라로 찍기 (가이드 촬영)] 버튼', !!$('btn-equip-camera') && $('btn-equip-camera').textContent.indexOf('가이드 촬영') !== -1);
ok('★ 목록 줄의 [카메라로 찍기]가 그 설비의 가이드 촬영으로 간다', Array.from($('list-equip').querySelectorAll('a')).some((x) => (x.getAttribute('href') || '') === 'scan.html?equipment=' + encodeURIComponent(d.id) + '&return=list'));
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
ok('★ 화면 안 일반 카메라는 없다 (가이드 촬영만)', !$('cam-panel') && !$('equip-photo-cam'));

/* 콘텐츠에서 왔으면 돌아가는 길을 보인다 */
const r = boot('admin/setup.html?return=content', { login: 'kim@daesung.co.kr', page: 'admin/setup.js' });
eq('★ ?return=content 면 「콘텐츠로 돌아가기」', r.win.document.getElementById('return-note').hidden, false);
eq('평소에는 안 보인다', $('return-note').hidden, true);

/* 🆕 2026-11-16 — 같은 이름 · 위험유형 목록/직접 입력 · 수정은 「등록 설비」 안에서 · AI 검수 승인 */
{
  const before = S.setup.load().equipments.length;
  addEquip(' 프레스  9호기', '', '', '');
  eq('★★ 같은 이름(띄어쓰기 달라도)은 등록하지 않는다', S.setup.load().equipments.length, before);
  has('「동일한 이름을 가진 설비가 존재합니다」', doc.getElementById('toast').textContent, '동일한 이름을 가진 설비가 존재합니다');

  ok('★ 픽토그램 고르기가 없다 (종류에서 정한다)', !$('pick-equip-icon'));
  ok('★ 공식 분류 드롭다운 — 6종 밖이 더 있다', $('hazard-add').querySelectorAll('optgroup option').length >= 15);
  $('hazard-add').value = 'noise';
  $('hazard-add').dispatchEvent(new win.Event('change'));
  $('hazard-custom').value = '고압가스';
  $('btn-hazard-custom').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  $('equip-kind').value = 'electric';
  const n = addEquip('위험유형 시험기', '', '', '');
  eq('★★ 목록에서 더한 것 + 직접 적은 것이 저장된다', n && n.hazards.join(), 'noise,x:고압가스');
  eq('★ 아이콘은 종류에서 (전기설비 → ⚡)', n && n.icon, '⚡');
  has('목록에 직접 적은 위험유형이 보인다', $('list-equip').querySelector('li[data-id="' + n.id + '"]').textContent, '고압가스');
  eq('★ 저장 뒤 6종 밖 칩은 비워진다', doc.querySelectorAll('input[name="hazard"]').length, S.HAZARDS.length);
  eq('★ 등록 뒤 AI 검수 바로가기', $('equip-added').hidden + '|' + $('equip-added-go').getAttribute('href'), 'false|#list');

  /* 수정 — 폼이 「등록 설비」 칸 안으로 옮겨 간다 */
  Array.from($('list-equip').querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === '위험유형 시험기 설비 수정').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('★★ 수정 폼은 등록 화면이 아니라 등록 설비 칸 안에 있다', $('equip-edit-slot').contains($('form-equip')) && !$('equip-edit-slot').hidden);
  eq('수정 화면이 보인다', doc.querySelector('[data-view="list"]').hidden + '|' + doc.querySelector('[data-view="equip"]').hidden, 'false|true');
  eq('★ 수정 폼에 그 설비의 위험유형(6종 밖 포함)이 그대로', Array.from(doc.querySelectorAll('input[name="hazard"]:checked')).map((x) => x.value).join(), 'noise,x:고압가스');
  $('btn-equip-cancel').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('취소하면 폼이 등록 화면으로 돌아간다', $('equip-form-home').contains($('form-equip')) && $('equip-edit-slot').hidden);

  /* AI 검수 — 서버가 없는 곳(검사)에서는 「검수 못 함」, 등록은 그대로 */
  return new Promise((done) => setTimeout(done, 30)).then(() => {
    has('★ 서버가 없으면 「AI 검수 못 함」 · 등록은 남는다', $('list-equip').querySelector('li[data-id="' + n.id + '"]').textContent, 'AI 검수 못 함');
    /* 검수 결과를 넣고 승인/삭제 */
    S.setup.update((s) => {
      const e = s.equipments.find((x) => x.id === n.id);
      e.analysis = { at: 'x' };
      e.review = { status: 'waiting', items: [
        { key: 'kind', field: '설비 종류', claim: '전기설비', verdict: 'wrong', suggest: '사출성형기', reason: 'r', sources: [{ title: 'KOSHA', url: 'https://kosha.or.kr/a', host: 'kosha.or.kr' }], decision: '' },
        { key: 'hazard:1', field: '위험유형', claim: '고압가스', code: 'x:고압가스', verdict: 'wrong', suggest: '', reason: 'r', sources: [], decision: '' },
        { key: 'add:끼임', field: '위험유형 추가 제안', claim: '', label: '끼임', verdict: 'wrong', suggest: '끼임', reason: 'r', sources: [], decision: '' },
        { key: 'hazard:0', field: '위험유형', claim: '소음', code: 'noise', verdict: 'ok', suggest: '', reason: 'r', sources: [], decision: '' },
      ] };
    });
    $('equip-kind').dispatchEvent(new win.Event('change'));   // 다시 그리게
    win.dispatchEvent(new win.HashChangeEvent('hashchange'));
    const li = () => $('list-equip').querySelector('li[data-id="' + n.id + '"]');
    // 다시 그리기 — 아무 commit 이나 (언어 칩 change)
    $('pick-lang').dispatchEvent(new win.Event('change'));
    has('★ AI 가 조사한 부분이 「AI 조사」로 표시된다', li().querySelector('.ai-found').textContent, 'AI 조사');
    has('승인 대기 건수', li().textContent, '승인할 항목 4건');
    has('★ 승인하면 무엇이 바뀌는지 미리 말한다', li().textContent, '승인하면 설비 종류을(를) 「사출성형기」(으)로 바꿉니다');
    const btns = (label) => Array.from(li().querySelectorAll('.review-item')).map((x) => Array.from(x.querySelectorAll('button')).find((b) => b.textContent === label));
    btns('승인')[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    let e2 = S.setup.load().equipments.find((x) => x.id === n.id);
    eq('★★ 종류 승인 → AI 값으로 바뀌고 아이콘·옛 분석도 따라간다', e2.kind + '|' + e2.icon + '|' + e2.analysis, 'injection|🏭|null');
    btns('승인')[1].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    btns('승인')[2].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    e2 = S.setup.load().equipments.find((x) => x.id === n.id);
    eq('★★ 관계없는 위험유형은 빠지고, 추가 제안은 더해진다', e2.hazards.join(), 'noise,pinch');
    btns('삭제')[3].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    e2 = S.setup.load().equipments.find((x) => x.id === n.id);
    eq('★ 전부 정하면 검수 완료', e2.review.status, 'approved');
    has('검수 완료 표시', li().textContent, '담당자 승인 완료');
    /* 수정 — 메모를 달아 재조사 */
    S.setup.update((s) => { s.equipments.find((x) => x.id === n.id).review.items[3].decision = ''; });
    $('pick-lang').dispatchEvent(new win.Event('change'));
    btns('수정')[3].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const memo = li().querySelectorAll('.review-memo')[0];
    ok('[수정]을 누르면 메모 칸이 열린다', memo && !memo.hidden);
    memo.querySelector('textarea').value = '프레스 소음 기준으로 다시';
    memo.querySelector('button').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    e2 = S.setup.load().equipments.find((x) => x.id === n.id);
    eq('★★ 메모가 남고 다시 검수를 부른다', e2.review.items[3].note + '|' + e2.review.status, '프레스 소음 기준으로 다시|checking');
    /* 담당자 메뉴 — 5개 그룹 · 누르면 열리고 남는다 · 바깥을 누르면 닫힌다 */
    const groups = doc.querySelectorAll('.admin-menu .menu-btn');
    eq('★ 담당자 메뉴는 5개 그룹', groups.length, 5);
    const setupBtn = Array.from(groups).find((b) => b.textContent.indexOf('설비') !== -1);
    eq('★ 지금 화면의 그룹이 표시된다', setupBtn.getAttribute('aria-current'), 'page');
    setupBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const panel = doc.getElementById(setupBtn.getAttribute('aria-controls'));
    ok('★★ 누르면 상세 메뉴가 열린다', !panel.hidden && setupBtn.getAttribute('aria-expanded') === 'true');
    has('상세 메뉴에 등록 설비 확인·수정', panel.textContent, '등록 설비 확인·수정');
    setupBtn.dispatchEvent(new win.MouseEvent('mouseleave', { bubbles: true }));
    ok('★★ 마우스를 떼도 열린 채로 남는다', !panel.hidden);
    doc.body.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok('바깥을 누르면 닫힌다', panel.hidden);
    ok('화면 오류 없음', t.errors.length === 0, t.errors.join(' | '));
    report('설비 등록 — 제조사·모델명·연식 (PRD-AD-08 S1)');
  });
}
