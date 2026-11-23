/* 3D 돌려보기 문항 (orbit-hotspot, 2026-11-23) — 노동자 퀴즈
   지키는 것: 장면 묶음을 ◀ ▶ 로 돌린다 · 장면마다 정답이 다르다 · 안 보이는 장면에서 누르면 채점하지 않는다
            · 맞으면 누른 장면 번호까지 남긴다 · 바깥 주소 장면은 문항째 뺀다 (제3자 요청 0건) */
const { boot, ok, eq, report } = require('./harness');

const FR = ['/s/00.jpg', '/s/01.jpg', '/s/02.jpg'];
const ANS = [null, { x: 50, y: 50, r: 10 }, { x: 20, y: 20, r: 10 }];

function start(frames) {
  return boot('worker/quiz.html?course=c-orbit', {
    login: 'W-4821-31', page: 'worker/quiz.js',   // 한국어 노동자 (조립 공정)
    before: (w) => {
      const eqId = 'e-mill-t';
      w.Store.setup.update((s) => { s.equipments.push({ id: eqId, processId: 'p-assembly', name: '밀링', kind: 'milling', icon: '⚙', hazards: ['pinch'], note: '' }); });
      w.Store.courses.update((list) => { list.push({
        id: 'c-orbit', title: '돌려보기', equipmentId: eqId, languages: ['ko', 'km'], phraseIds: ['ph-1'],
        quiz: [
          { id: 'q1', type: 'orbit-hotspot', prompt: '설비를 돌려 보며 「램」을(를) 누르세요', frames, answers: ANS, start: 0, why: '램이 내려온다', hazardId: 'r1' },
          { id: 'q2', type: 'choice', prompt: '고르세요', options: ['가', '나'], answer: 0 },
        ],
        dueAt: '', approved: true, createdAt: new Date().toISOString(),
      }); });
      w.Store.progress.update((list) => { list.push({ workerId: 'W-4821-31', courseId: 'c-orbit', learnedAt: new Date().toISOString(), quiz: null }); });
    },
  });
}

const t = start(FR);
const d = t.win.document;
ok('화면 오류 없음', t.errors.length === 0, t.errors.join(' | '));
const fig = d.querySelector('.orbit-figure');
ok('★ 돌려보기 문항이 첫 문항으로 뜬다', !!fig && d.getElementById('step-count').textContent.indexOf('1 / 2') !== -1);
const img = () => fig.querySelector('img').getAttribute('src');
eq('시작 장면', img(), '/s/00.jpg');
const [prev, next] = d.querySelectorAll('.orbit-turn .btn');
const click = (el) => el.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true }));
fig.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
const tap = (x, y) => fig.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
const submit = d.getElementById('btn-orbit-submit');

click(prev);
eq('첫 장면에서 ◀ 는 더 가지 않는다', img(), '/s/00.jpg');
tap(50, 50);
click(submit);
ok('★★ 안 보이는 장면에서 누르면 채점하지 않는다 (다시 할 수 있다)', d.getElementById('consequence').hidden && !submit.disabled);
click(next);
eq('★ ▶ 로 다음 장면', img(), '/s/01.jpg');
ok('장면을 돌리면 앞 장면에서 누른 표시는 지운다', !fig.querySelector('.tapmark') && submit.disabled);
tap(52, 49);
click(submit);
eq('★★ 그 장면의 정답 원 안이면 맞음', fig.querySelector('.tapmark').getAttribute('data-mark'), 'ok');
ok('제출 뒤 잠김', submit.disabled);

const bad = start(['https://cdn.example.com/a.jpg', '/s/01.jpg', '/s/02.jpg']);
ok('★★ 바깥 주소 장면이 있으면 문항째 뺀다', !bad.win.document.querySelector('.orbit-figure') && bad.win.document.getElementById('step-count').textContent.indexOf('1 / 1') !== -1);

report('3D 돌려보기 문항 (orbit-hotspot)');
