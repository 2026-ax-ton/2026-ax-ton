/* docs/infos/_check-links.js — docs/ 와 CLAUDE.md 의 상대 링크가 실제 파일을 가리키는지 검사한다.
   의존성 0. 저장소 루트에서:  node docs/infos/_check-links.js
   깨진 링크가 있으면 목록을 찍고 종료 코드 1. 마무리 루틴에서 쓴다. */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..', '..');
var KNOWN = ['docs/mockups/ADMIN-SCREENS.md'];   // 원래부터 저장소 밖 PDF 를 가리키는 문서 (2026-10-31 기록)

// 저장소에 올리지 않는 폴더는 검사하지 않는다 (2026-11-17).
// `docs/발표/.../참고자료/` 는 발표 자료를 만들려고 다른 곳의 문서를 복사해 모아 둔
// 개인 작업용 폴더다. 복사본이라 원본 기준의 상대 링크가 당연히 안 맞고,
// `.gitignore` 가 막고 있어 저장소에도 올라가지 않는다. 여기를 검사하면
// 고칠 수 없는 오류가 매번 나와서 진짜 깨진 링크가 묻힌다.
var SKIP_DIRS = ['참고자료', '팀문서'];

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var p = path.join(dir, e.name);
    if (e.isDirectory()) { if (SKIP_DIRS.indexOf(e.name) === -1) walk(p, out); }
    else if (/\.(md|html)$/.test(e.name)) out.push(p);
  });
  return out;
}
var files = walk(path.join(ROOT, 'docs'), []).concat([path.join(ROOT, 'CLAUDE.md'), path.join(ROOT, 'README.md')]);
var count = 0, broken = [];
files.forEach(function (f) {
  var rel = path.relative(ROOT, f).split(path.sep).join('/');
  if (KNOWN.indexOf(rel) !== -1 || rel.indexOf('docs/mockups/') === 0 && /\.html$/.test(rel)) return;
  var s = fs.readFileSync(f, 'utf8');
  if (/\.md$/.test(f)) s = s.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');   // 코드 예시 안의 경로는 링크가 아니다
  var re = /\]\((<[^>]+>|[^)\s]+)\)|(?:href|src)="([^"]+)"/g, m;
  while ((m = re.exec(s))) {
    var u = (m[1] || m[2]).replace(/^<|>$/g, '');
    if (/^(https?:|mailto:|#|data:|javascript:)/.test(u)) continue;
    var p = decodeURIComponent(u.split('#')[0]);
    if (!p) continue;
    count++;
    if (!fs.existsSync(path.resolve(path.dirname(f), p))) broken.push(rel + ' → ' + u);
  }
});
console.log('링크 ' + count + '개 검사, 깨진 링크 ' + broken.length + '개');
broken.forEach(function (b) { console.log('  ✗ ' + b); });
process.exitCode = broken.length ? 1 : 0;
