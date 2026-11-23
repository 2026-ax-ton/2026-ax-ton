/* 교육 영상 (2026-11-23) — 수강 첫 단계에 같은 출처 영상만 붙는다 (제3자 요청 0건)
   지키는 것: 같은 출처 경로면 <video> + 「AI로 만든 장면」 표시 · 바깥 주소(https://, //)는 붙이지 않는다 · 둘째 단계에는 없다 */
const { boot, ok, eq, report } = require('./harness');

function open(src) {
  const t = boot('worker/learn.html', {
    login: 'W-4821-07', page: 'worker/learn.js',
    before: (w) => w.Store.courses.update((list) => { list.find((c) => c.id === 'c-press').video = { src }; }),
  });
  t.win.document.querySelector('#course-list .course-open').dispatchEvent(new t.win.MouseEvent('click', { bubbles: true }));
  return t;
}

const a = open('/media/press.mp4');
ok('화면 오류 없음', a.errors.length === 0, a.errors.join(' | '));
const v = a.win.document.querySelector('#course-video video');
ok('★ 같은 출처 경로면 첫 단계에 영상이 붙는다', !!v && v.getAttribute('src') === '/media/press.mp4');
eq('★ 「AI로 만든 장면」 표시 (내 언어)', a.win.document.querySelector('#course-video p').textContent.trim(), a.win.I18N.t('learn.aiVideo', 'km'));
a.$('btn-next').dispatchEvent(new a.win.MouseEvent('click', { bubbles: true }));
eq('둘째 단계에는 영상이 없다', a.$('course-video').hidden, true);

['https://cdn.example.com/x.mp4', '//cdn.example.com/x.mp4', 'javascript:alert(1)'].forEach((src) => {
  const b = open(src);
  ok('★★ 바깥 주소는 붙이지 않는다 — ' + src, !b.win.document.querySelector('#course-video video'));
});

/* 담당자 교육 목록 — 발급한 교육의 영상을 같은 자리에서 본다 */
function admin(src) {
  return boot('admin/content.html', {
    login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/content.js',
    before: (w) => w.Store.courses.update((list) => { list.find((c) => c.id === 'c-press').video = { src }; }),
  });
}
const d = admin('/media/press.mp4');
ok('담당자 화면 오류 없음', d.errors.length === 0, d.errors.join(' | '));
const watch = Array.from(d.win.document.querySelectorAll('#course-rows button')).find((b) => b.textContent === '영상 보기');
ok('★ 영상이 있는 교육에 [영상 보기]', !!watch);
const vrow = d.win.document.querySelector('#course-rows .course-video-row');
ok('처음에는 접혀 있다', !!vrow && vrow.hidden === true);
watch.dispatchEvent(new d.win.MouseEvent('click', { bubbles: true }));
ok('★ 누르면 같은 영상이 펼쳐진다', vrow.hidden === false && vrow.querySelector('video').getAttribute('src') === '/media/press.mp4');
ok('「AI 로 만든 장면」 표시', vrow.textContent.indexOf('AI(Seedance)로 만든 장면') !== -1);
const e = admin('https://cdn.example.com/x.mp4');
ok('★★ 바깥 주소면 담당자 화면에도 붙이지 않는다', !e.win.document.querySelector('#course-rows video')
  && !Array.from(e.win.document.querySelectorAll('#course-rows button')).some((b) => b.textContent === '영상 보기'));

report('교육 영상 — 같은 출처만 (노동자 수강 · 담당자 교육 목록)');
