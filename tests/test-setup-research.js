/* 설비 등록의 AI 위험요소 조사 — 필수 단계 (admin/setup.html, 2026-11-21)

   이 묶음이 지키는 것
     1. ★ 조사 전에는 「필수 · 아직 안 함」이고, 서버가 있는 곳에서는 교육 만들기로 가는 길이 없다
     2. ★★ [AI 위험요소 조사 시작] → /api/research → 사진이 있으면 /api/hazards — 교육 만들기와 같은 저장 모양(eq.analysis)
     3. ★★ 조사한 위험요소가 설비 사진 위 위치(박스 번호 = 목록 번호)와 묶여 보인다
     4. ★ 다른 설비 결과·사람이 찍힌 사진은 위치로 쓰지 않는다
     5. 서버가 없는 곳(file://)은 결과 파일 모드로 갈 길을 열어 둔다
     6. 요약 체크리스트에 「6. AI 위험요소 조사」 */

const { boot, ok, eq, has, report } = require('./harness');

const PHOTO = 'data:image/jpeg;base64,/9j/AAAA';
const tick = () => new Promise((r) => setTimeout(r, 0));
const ticks = async (n) => { for (let i = 0; i < (n || 8); i += 1) await tick(); };

const RESEARCH = {
  equipment: { id: 'e-press3' }, model: 'm-test',
  items: [
    { id: 'r1', part: '램과 금형 사이', hazard: 'pinch', status: 'ok', image: 'data:image/jpeg;base64,EXT' },
    { id: 'r2', part: '제어반', hazard: 'shock', status: 'check' },
  ],
};
const MAPPED = { equipment: { id: 'e-press3' }, person: false, mapped: [{ id: 'r1', part: '램과 금형 사이', hazard: 'pinch', box: { x0: 10, y0: 20, x1: 40, y1: 60 }, answer: { x: 25, y: 40, r: 10 } }], missing: ['r2'] };

(async () => {
  const t = boot('admin/setup.html#list', {
    login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/setup.js',
    before: (w) => {
      w.sessionStorage.setItem('safety.token.v1', 'tok-test');
      w.Store.setup.update((s) => { s.equipments.find((e) => e.id === 'e-press3').photo = PHOTO; });
    },
  });
  const { win, $ } = t;
  const S = win.Store;
  const row = () => win.document.querySelector('#list-equip li[data-id="e-press3"]');
  const calls = [];
  let hazardsReply = MAPPED;
  win.Net.post = (path, body) => {
    calls.push({ path, body });
    if (path === '/api/research' && !body.verify) return Promise.resolve({ ok: true, status: 200, data: JSON.parse(JSON.stringify(RESEARCH)) });
    if (path === '/api/hazards') return Promise.resolve({ ok: true, status: 200, data: JSON.parse(JSON.stringify(hazardsReply)) });
    return Promise.resolve({ ok: false, status: 404, data: {} });
  };
  /* 목록을 다시 그린다 (토큰·사진이 들어간 뒤) */
  S.setup.update(() => {});
  $('equip-kind').dispatchEvent(new win.Event('change'));
  win.dispatchEvent(new win.HashChangeEvent('hashchange'));

  ok('화면 오류 없음', t.errors.length === 0, t.errors.join(' | '));
  has('★ 조사 전에는 「필수」로 보인다', row().textContent, '필수 · 아직 안 함');
  ok('★★ 조사 전에는 (서버가 있는 곳에서) 교육 만들기로 가는 길이 없다',
    !Array.from(row().querySelectorAll('a')).some((a) => (a.getAttribute('href') || '').indexOf('autogen.html') === 0));
  const btn = row().querySelector('button[data-research]');
  ok('조사 버튼이 있다', !!btn && btn.textContent.indexOf('AI 위험요소 조사 시작') !== -1);

  btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await ticks();
  const rc = calls.find((c) => c.path === '/api/research' && !c.body.verify);
  eq('★★ 조사에 설비 id·종류를 보낸다', rc && rc.body.equipment.id + '|' + rc.body.equipment.kind, 'e-press3|press');
  const hc = calls.find((c) => c.path === '/api/hazards');
  ok('★★ 사진이 있으면 그 사진으로 위치를 찾는다', !!hc && hc.body.image === PHOTO && hc.body.items.length === 2 && hc.body.equipment.id === 'e-press3');
  const a = S.setup.load().equipments.find((e) => e.id === 'e-press3').analysis;
  eq('★★ 교육 만들기와 같은 모양으로 설비에 저장한다', a && a.research.items.length + '|' + a.guided.mapped.length + '|' + a.source + '|' + a.kind, '2|1|server|press');
  ok('★ 외부 참고 사진은 저장하지 않는다 (동기화 512KB)', !JSON.stringify(a).includes('EXT'));

  has('★ 조사를 마치면 「조사 완료」', row().textContent, '조사 완료');
  const boxes = row().querySelectorAll('.equip-research-fig .ag-box');
  eq('★★ 사진 위 박스 = 위치를 찾은 위험요소 수', boxes.length, 1);
  eq('★ 박스 번호 = 목록 번호', boxes[0] && boxes[0].textContent, '#1');
  eq('박스 자리는 % 좌표', boxes[0] && boxes[0].style.left + '|' + boxes[0].style.width, '10%|30%');
  has('★ 위치 못 찾은 위험요소는 「위치 확인 필요」 — 지어내지 않는다', row().querySelector('.equip-research-list').textContent, '제어반 — 감전 · 위치 확인 필요');
  ok('★★ 조사를 마치면 교육 만들기로 간다', Array.from(row().querySelectorAll('a')).some((x) => x.getAttribute('href') === 'autogen.html#eq=e-press3'));
  has('★ 요약에 6단계 AI 위험요소 조사', $('checklist').textContent, '6. AI 위험요소 조사');

  /* 사람이 찍힌 사진 — 조사는 남기고 위치는 쓰지 않는다 */
  hazardsReply = { equipment: { id: 'e-press3' }, person: true, mapped: [], missing: [] };
  row().querySelector('button[data-research]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await ticks();
  const a2 = S.setup.load().equipments.find((e) => e.id === 'e-press3').analysis;
  eq('★ 사람이 찍힌 사진이면 위치를 쓰지 않는다 (조사는 남긴다)', a2.research.items.length + '|' + a2.guided, '2|null');

  /* 다른 설비 결과 — 위치를 버린다 */
  hazardsReply = Object.assign({}, MAPPED, { equipment: { id: 'e-other' } });
  row().querySelector('button[data-research]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await ticks();
  eq('★ 다른 설비의 위치 결과는 버린다', S.setup.load().equipments.find((e) => e.id === 'e-press3').analysis.guided, null);
  ok('화면 오류 없음 (흐름 끝)', t.errors.length === 0, t.errors.join(' | '));

  /* 서버가 없는 곳 — 조사 버튼 대신 결과 파일 모드로 */
  const off = boot('admin/setup.html#list', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/setup.js' });
  off.win.Net.onHttps = () => false;
  off.$('pick-lang').dispatchEvent(new off.win.Event('change'));   // 다시 그리기 (언어 칸은 저장 즉시 render)
  const offRow = off.win.document.querySelector('#list-equip li[data-id="e-press3"]');
  ok('★ 서버가 없는 곳에서는 조사 버튼 대신 이유를 적는다', !!offRow && !offRow.querySelector('button[data-research]') && offRow.textContent.indexOf('배포 주소(https)') !== -1);
  ok('★ 서버가 없는 곳은 결과 파일 모드로 갈 길을 열어 둔다', !!offRow && Array.from(offRow.querySelectorAll('a')).some((x) => x.textContent.indexOf('결과 파일') !== -1));

  report('설비 등록 — AI 위험요소 조사 (필수 단계)');
})();
