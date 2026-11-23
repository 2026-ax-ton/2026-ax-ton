/* 배포 주소에서 이 기기 로그인 · 언어 바꾸기 (2026-11-23)
   지키는 것: 서버를 부를 수 있는 곳에서는 서버에 닿지 못해 들어온 이 기기 로그인만 믿는다 (남은 옛 로그인으로 동기화 없이 돌지 않게)
            · 서버 로그인 중 언어를 바꾸면 그 사용자 정보에 반영된다 */
const { boot, ok, eq, report } = require('./harness');

const a = boot('index.html', { login: 'W-4821-07', offline: false });
a.win.Net.available = () => true;   // 배포 주소처럼 — 서버를 부를 수 있다
ok('★★ 배포 주소에서 서버 없이 남은 옛 이 기기 로그인은 로그인으로 보지 않는다', a.win.Auth.canServer() && a.win.Auth.current() === null);

const b = boot('index.html', { login: 'W-4821-07' });
b.win.Net.available = () => true;
eq('★ 서버에 닿지 못해 들어온 이 기기 로그인은 그대로', b.win.Auth.current() && b.win.Auth.current().userId, 'W-4821-07');

const c = boot('index.html', {
  before: (w) => {
    w.sessionStorage.setItem('safety.token.v1', 'tok-test');
    w.sessionStorage.setItem('safety.user.v1', JSON.stringify({ userId: 'W-9', role: 'worker', lang: 'km' }));
  },
});
eq('서버 로그인 사용자', c.win.Auth.current().lang, 'km');
ok('★★ 서버 로그인 중 언어 바꾸기 → 그 사용자 정보에', c.win.Auth.setLang('ko').ok && c.win.Auth.current().lang === 'ko');

report('배포 주소 — 이 기기 로그인 · 언어 바꾸기');
