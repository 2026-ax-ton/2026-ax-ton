/* 교육 종류·업종 0단계 칸과 법정 안내 (C06 D-039 범위 ⓑ · PRD-AD-04 FR-14~22)

   ★ 실제 화면(admin/content.html·autogen.html·proof.html)을 jsdom 으로 돌린다.
     법령 숫자는 이 묶음에서 다시 적지 않는다 — `curriculum.js` 와 **같은지만** 본다
     (베껴 적으면 데이터가 바뀔 때 검사가 거짓으로 통과한다).

   이 묶음이 지키는 것
     1. ★★ 0단계를 고르지 않아도 **발급을 막지 않는다** — 「미지정」 으로 들어간다 (FR-21)
     2. ★★ 고른 교육의 **법정 최소 시간·교육 사항**이 curriculum.js 그대로 보인다 (FR-17)
     3. ★★ 「법정 시간으로 인정받으려면 함께 진행해야 한다」 고지가 **항상 있다** (FR-22)
     4. ★ 특별교육을 고르면 대상 작업 39종을 고른다. 대표 12개는 세부까지 있다 (FR-16)
     5. ★ 교육 제목에 종류가 앞에 붙고, 담당자가 직접 쓴 제목은 덮지 않는다 (FR-20)
     6. ★ 손으로 만들기와 AI 로 만들기가 **같은 칸**을 쓴다 (코드가 두 벌이 아니다)
     7. ★ 증빙에 교육 종류와 **실제 시간 / 법정 최소 시간**이 나란히 적힌다 (D-039)
     8. ★ 메뉴 이름이 「교육 콘텐츠」다 (FR-14) */

const fs = require('fs');
const path = require('path');
const { boot, ok, eq, has, report, SRC } = require('./harness');

const text = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (win, node) => node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const change = (win, node) => node.dispatchEvent(new win.Event('change', { bubbles: true }));
const input = (win, node) => node.dispatchEvent(new win.Event('input', { bubbles: true }));

/** 0단계에서 교육 종류를 고른다 */
function pickKind(t, kind) {
  const radio = t.win.document.querySelector('input[name="edu-kind"][value="' + kind + '"]');
  radio.checked = true;
  change(t.win, radio);
  return radio;
}

/* ===================================================================
   1. 칸이 양쪽 화면에 같은 모양으로 있다 (FR-14·15)
   =================================================================== */
{
  const t = boot('admin/content.html', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/content.js' });

  ok('0단계 칸이 설비 선택보다 앞에 있다',
    t.$('step0') && t.$('step0').compareDocumentPosition(t.$('eq-pick')) === 4);
  eq('업종은 제조업·건설업 둘이다',
    [...t.win.document.querySelectorAll('input[name="edu-industry"]')].map((n) => n.value).join(','),
    'manufacturing,construction');
  eq('교육 종류는 4가지다 (정기교육 포함 — D-039 범위 ⓑ)',
    [...t.win.document.querySelectorAll('input[name="edu-kind"]')].map((n) => n.value).join(','),
    t.win.Curriculum.TRAININGS.map((x) => x.id).join(','));
  ok('★ 고르기 전에는 안내 상자가 「고르면 보여 준다」 고만 적는다',
    /교육 종류를 고르면/.test(text(t.$('edu-kind-box'))));
  eq('0단계 배지는 「미지정」 이다', text(t.$('b-step0')), '미지정');

  const ag = boot('admin/autogen.html', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/autogen.js' });
  ok('★ AI 로 만들기 화면에도 같은 칸이 있다 (칸이 두 벌이 아니다)',
    !!ag.win.document.querySelector('input[name="edu-kind"]'));
  eq('★ 두 화면이 같은 공용 파일을 싣는다 (edukind.js)',
    [ 'admin/content.html', 'admin/autogen.html' ]
      .map((f) => /assets\/edukind\.js/.test(fs.readFileSync(path.join(SRC, f), 'utf8')))
      .join(','), 'true,true');
}

/* ===================================================================
   2. 법정 최소 시간·교육 사항이 데이터 그대로 보인다 (FR-17)
   =================================================================== */
{
  const t = boot('admin/content.html', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/content.js' });
  const C = t.win.Curriculum;

  pickKind(t, 'daily-hire');
  const box = () => text(t.$('edu-kind-box'));

  const daily = C.TRAININGS.find((x) => x.id === 'daily-hire');
  has('★★ 법정 최소 시간을 적는다', box(), t.win.EduKind.minutesText(daily.minMinutes.daily));
  has('언제 하는 교육인지 적는다', box(), daily.when);

  const legalTitles = C.BASIC.filter((b) => b.legal).map((b) => b.title);
  eq('★★ 꼭 다뤄야 하는 교육 사항 개수가 별표 5 기본 사항과 같다',
    t.win.EduKind.contentTitles({ kind: 'daily-hire', industry: 'manufacturing', specialNo: 0 }).length,
    legalTitles.length);
  has('첫 번째 법정 사항 이름이 그대로 보인다', box(), legalTitles[0]);
  has('★★ 법정 시간 인정 조건 고지가 있다 (FR-22)', box(), '법정 교육시간으로 인정받으려면');
  has('출처를 적는다', box(), '별표');

  /* 정기교육 — 범위 ⓑ 로 들어온 것 */
  pickKind(t, 'regular');
  eq('★★ 정기교육은 정기교육 사항을 보여 준다 (기본 11개가 아니다)',
    t.win.EduKind.contentTitles({ kind: 'regular', industry: 'manufacturing', specialNo: 0 }).length,
    C.REGULAR.length);
  has('정기교육 법정 최소 시간(현장직 반기)을 적는다', box(),
    t.win.EduKind.minutesText(C.TRAININGS.find((x) => x.id === 'regular').minMinutes.other));

  /* 작업내용 변경 시 교육 — 현장 작업 사항을 먼저 (FR-25) */
  const changeTitles = t.win.EduKind.contentTitles({ kind: 'job-change', industry: 'manufacturing', specialNo: 0 });
  const focus = C.TRAININGS.find((x) => x.id === 'job-change').focus;
  ok('★ 변경 시 교육은 현장 작업 사항(focus)을 앞에 둔다',
    focus.indexOf(C.BASIC.filter((b) => b.legal).find((b) => b.title === changeTitles[0]).no) !== -1);
  eq('그래도 사항 개수는 11개 그대로다', changeTitles.length, C.BASIC.filter((b) => b.legal).length);
}

/* ===================================================================
   3. 특별교육 — 대상 작업 39종 (FR-16)
   =================================================================== */
{
  const t = boot('admin/content.html', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/content.js' });
  const C = t.win.Curriculum;

  ok('특별교육을 고르기 전에는 작업 고르기 칸이 없다', !t.$('edu-special'));
  pickKind(t, 'special');
  const sel = t.$('edu-special');
  ok('★★ 특별교육을 고르면 대상 작업 칸이 나온다', !!sel);
  eq('★★ 작업 39종을 모두 고를 수 있다 (대표 12 + 나머지 27)',
    sel.querySelectorAll('option').length - 1, C.SPECIAL.length + C.SPECIAL_LATER.length);
  eq('★ 세부 사항까지 있는 대표 작업에는 표시(★)가 붙는다',
    [...sel.querySelectorAll('option')].filter((o) => o.textContent.indexOf('★') === 0).length,
    C.SPECIAL.length);

  /* 프레스 작업(11번)을 고르면 그 작업의 개별 사항까지 센다 (FR-26) */
  sel.value = '11';
  change(t.win, sel);
  const press = C.SPECIAL.find((s) => s.no === 11);
  const titles = t.win.EduKind.contentTitles({ kind: 'special', industry: 'manufacturing', specialNo: 11 });
  eq('★★ 기본 11개 + 그 작업의 개별 사항을 함께 센다',
    titles.length, C.BASIC.filter((b) => b.legal).length + press.items.length);
  has('개별 사항 이름이 그대로 보인다', text(t.$('edu-kind-box')), press.items[0].title);
  has('0단계 배지에 고른 작업이 보인다', text(t.$('b-step0')), press.title);

  /* 나머지 27개 작업 — 법정 사항 이름은 있고, 영상용 세부 대본만 없다 */
  const later = C.SPECIAL_LATER[0].no;
  sel.value = String(later);
  change(t.win, sel);
  const laterJob = t.win.EduKind.specialJob(later);
  eq('★ 나머지 27개 작업도 법정 개별 사항 이름까지 센다',
    t.win.EduKind.contentTitles({ kind: 'special', industry: 'manufacturing', specialNo: later }).length,
    C.BASIC.filter((b) => b.legal).length + laterJob.items.length);
  has('★ 영상용 세부 대본이 대표 12개에만 있다는 것을 적는다 (조용히 비우지 않는다)',
    text(t.$('edu-kind-box')), '영상용 세부 대본은 대표 12개');
}

/* ===================================================================
   4. 제목 접두 · 발급 (FR-20·21)
   =================================================================== */
{
  const t = boot('admin/content.html', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/content.js' });

  /* 제목 자동 채움에 종류가 앞에 붙는다 */
  pickKind(t, 'daily-hire');
  has('★ 제목 앞에 교육 종류가 붙는다', t.$('draft-title').value, '[일용직 채용 시]');
  pickKind(t, 'special');
  has('특별교육이면 특별교육으로 바뀐다', t.$('draft-title').value, '[특별교육]');

  /* 담당자가 직접 쓴 제목은 덮지 않는다 */
  t.$('draft-title').value = '프레스 3호기 — 신규 입사자용';
  input(t.win, t.$('draft-title'));
  pickKind(t, 'regular');
  eq('★★ 담당자가 쓴 제목은 교육 종류를 바꿔도 그대로다',
    t.$('draft-title').value, '프레스 3호기 — 신규 입사자용');

  /* 0단계를 고르지 않아도 발급을 막지 않는다 */
  const t2 = boot('admin/content.html', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/content.js' });
  const steps = [...t2.$('draft-check').querySelectorAll('li')];
  const step0 = steps.find((li) => /0\. 교육 종류/.test(text(li)));
  ok('★★ 0단계가 확인 목록에 있고, 안 골랐어도 통과로 센다 (발급을 막지 않는다)',
    !!step0 && step0.getAttribute('data-done') === 'yes');
  has('안 고르면 「미지정」 으로 적는다', text(step0), '미지정');
}

/* ===================================================================
   5. 증빙 — 교육 종류와 실제/법정 시간 (D-039)
   =================================================================== */
{
  const t = boot('admin/proof.html', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/proof.js' });
  const body = text(t.win.document.body);

  has('★★ 증빙에 교육 종류 줄이 있다', body, '교육 종류');
  has('★★ 실제 교육 시간 줄이 있다', body, '실제 교육 시간');
  ok('★ 교육 종류를 고르지 않은 옛 교육은 「미지정」 으로 적는다 (숨기지 않는다)',
    /미지정/.test(body));

  /* 종류가 있는 교육에서는 법정 최소 시간이 나란히 붙는다 */
  const courses = t.win.Store.courses.load();
  ok('예시 데이터에 교육이 있다', courses.length > 0);
  eq('★ EduKind.label 은 종류가 있으면 그 이름을, 없으면 「미지정」 을 돌려준다',
    [t.win.EduKind.label({ eduKind: 'daily-hire' }), t.win.EduKind.label({})].join('|'),
    '일용직 채용 시 교육|미지정');
  ok('★★ 법정 최소 시간 문구는 curriculum.js 숫자에서 만든다',
    t.win.EduKind.minText('daily-hire').indexOf(t.win.EduKind.minutesText(
      t.win.Curriculum.TRAININGS.find((x) => x.id === 'daily-hire').minMinutes.daily)) !== -1);
}

/* ===================================================================
   6. 메뉴 이름 (FR-14) · 브라우저 규칙
   =================================================================== */
{
  const pages = ['admin/content.html', 'admin/autogen.html', 'admin/dashboard.html',
    'admin/library.html', 'admin/proof.html', 'admin/setup.html'];
  const bad = pages.filter((f) => {
    const html = fs.readFileSync(path.join(SRC, f), 'utf8');
    return !/>교육 콘텐츠<\/a>/.test(html);
  });
  eq('★ 관리자 화면 6개의 메뉴 이름이 「교육 콘텐츠」다', bad.join(','), '');

  const src = fs.readFileSync(path.join(SRC, 'assets/edukind.js'), 'utf8');
  ok('★★ 공용 칸은 서버를 부르지 않는다', !/fetch\(|XMLHttpRequest|Net\./.test(src));
  ok('★ ES 모듈이 아니다 (file:// 에서 열린다)', !/^\s*(import|export)\s/m.test(src));
  ok('★ 법령 숫자를 여기 다시 적지 않는다 — 시간은 curriculum.js 에서 읽는다',
    !/minMinutes\s*=\s*\{/.test(src) && /Curriculum\.TRAININGS/.test(src));
}

/* ===================================================================
   🆕 FR-AD-04-23 · AC-AD-04-10 — 특별교육 대상으로 표시한 설비를 고르면
   ⚠ 안내가 뜨고, 특별교육이면 대상 작업이 미리 골라진다. 교육 종류는 바꾸지 않는다
   =================================================================== */
{
  const mark = (win) => win.Store.setup.update((s) => {
    s.equipments.forEach((e) => { if (e.id === 'e-press3') e.specialWork = [11]; });
  });
  const t = boot('admin/content.html', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/content.js', before: mark });
  t.$('draft-equip').value = 'e-press3';
  change(t.win, t.$('draft-equip'));
  const note = () => text(t.$('edu-equip-note'));
  ok('★ 표시한 설비를 고르면 ⚠ 안내가 뜬다', !!t.$('edu-equip-note'));
  has('안내에 작업 번호와 이름이 있다', note(), '11.');
  has('★ 다른 교육 종류면 「특별교육을 하면 채용 시·변경 시 교육을 한 것으로 본다」를 알린다', note(), '한 것으로 봅니다');
  ok('★★ 교육 종류를 마음대로 특별교육으로 바꾸지 않는다', !t.win.document.querySelector('input[name="edu-kind"]:checked'));
  ok('안내는 아이콘과 글자 — 색만으로 알리지 않는다', !!t.$('edu-equip-note').querySelector('svg, .ico'));

  pickKind(t, 'special');
  eq('★★ 특별교육을 고르면 대상 작업이 그 설비 번호로 미리 골라진다', t.$('edu-special').value, '11');
  has('미리 골랐다고 알린다', note(), '미리 골랐습니다');

  t.$('edu-special').value = '13';
  change(t.win, t.$('edu-special'));
  eq('★ 담당자가 바꾼 작업은 그대로 둔다', t.$('edu-special').value, '13');
  has('표시와 다르면 다르다고 알린다', note(), '다릅니다');

  /* 표시 없는 설비로 바꾸면 안내가 사라진다 */
  t.$('draft-equip').value = 'e-booth1';
  change(t.win, t.$('draft-equip'));
  ok('표시 없는 설비면 안내가 없다', !t.$('edu-equip-note'));

  /* AI 로 만들기도 같은 칸 */
  const ag = boot('admin/autogen.html#eq=e-press3', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/autogen.js', before: mark });
  ok('★ AI 로 만들기에서도 표시한 설비면 안내가 뜬다', !!ag.$('edu-equip-note'));
  pickKind(ag, 'special');
  eq('AI 로 만들기에서도 대상 작업이 미리 골라진다', ag.$('edu-special').value, '11');
  eq('저장되는 칸은 그대로다 (specialJob 만, 설비 표시는 따로 저장하지 않는다)',
    Object.keys(ag.win.EduKind.fields({ kind: 'special', specialNo: 11, industry: 'manufacturing', equipSpecial: 11 })).join(','),
    'eduKind,industry,specialJob');
}

report('교육 종류·업종 0단계 칸과 법정 안내 (C06 D-039)');
