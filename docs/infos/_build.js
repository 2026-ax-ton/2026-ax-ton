/* docs/infos/_build.js — infos 폴더(하위 폴더 포함)의 .md 를 같은 이름의 .html 로 만든다.
   의존성 0 (Node 내장 모듈만). 저장소 루트에서:  node docs/infos/_build.js
   md 가 원본이다. html 은 손으로 고치지 않는다 — 다음 빌드 때 덮어써진다.
   지원하는 문법: 제목 #~######, <!-- include: 경로 --> (다른 md 를 통째로 끌어옴), <a id="…"></a> 앵커, 표, 목록(들여쓰기 2칸 중첩), 인용(>), 코드 블록(```),
   구분선(---), **굵게**, 인용 안에서는 줄마다 줄바꿈, `코드`, [링크](주소), 맨 주소(https://…), 표 안 <br>. */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var NAV = [
  ['README.md', '처음 (사용법)'],
  ['00_팀원용-설명서/팀원용-설명서.md', '00 팀원용 설명서'],
  ['01_프로젝트-개요/개요.md', '01 프로젝트 개요'],
  ['02_현재-진행/현재-진행.md', '02 현재 진행'],
  ['03_개발/개발.md', '03 개발'],
  ['04_기술스택/기술스택.md', '04 기술 스택'],
  ['05_멘토링/멘토링.md', '05 멘토링'],
  ['06_대회-규정/대회-규정.md', '06 대회 규정'],
  ['07_사업화/사업화.md', '07 사업화'],
  ['08_결정과-문서지도/결정과-문서지도.md', '08 결정과 문서 지도']
];

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 링크 주소: infos 안의 .md 를 가리키면 .html 로 바꾼다 */
function fixHref(href, fromFile) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  var parts = href.split('#');
  var target = path.resolve(path.dirname(fromFile), decodeURI(parts[0]));
  var inside = target.indexOf(ROOT + path.sep) === 0;
  if (inside && /\.md$/.test(parts[0])) parts[0] = parts[0].replace(/\.md$/, '.html');
  return parts.join('#');
}

function inline(text, fromFile) {
  var codes = [];
  var s = text.replace(/`([^`]+)`/g, function (_, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  s = esc(s);
  s = s.replace(/&lt;br&gt;/g, '<br>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t, h) {
    var href = fixHref(h.replace(/&amp;/g, '&'), fromFile);
    var ext = /^https?:/.test(href) ? ' target="_blank" rel="noopener"' : '';
    return '<a href="' + esc(href) + '"' + ext + '>' + t + '</a>';
  });
  s = s.replace(/(^|[\s(（])(https?:\/\/[^\s<)]+)/g, function (_, pre, u) {
    return pre + '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>';
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return '<code>' + esc(codes[+i]) + '</code>'; });
  return s;
}

function slug(t) {
  return t.replace(/[`*]/g, '').trim().replace(/\s+/g, '-').replace(/[^\w가-힣\-]/g, '').toLowerCase();
}

function splitRow(line) {
  var t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  var cells = [], cur = '', inCode = false;
  for (var i = 0; i < t.length; i++) {
    var ch = t[i];
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode && t[i - 1] !== '\\') { cells.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur);
  return cells.map(function (c) { return c.trim().replace(/\\\|/g, '|'); });
}

function blocks(lines, fromFile, br) {
  var out = [], i = 0;
  while (i < lines.length) {
    var line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }
    var m;
    if (/^```/.test(line)) {
      var buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
      continue;
    }
    if (/^<a id="[\w-]+"><\/a>\s*$/.test(line)) { out.push(line.trim()); i++; continue; }
    if (/^<!--.*-->\s*$/.test(line)) { i++; continue; }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      var lv = m[1].length;
      out.push('<h' + lv + ' id="' + esc(slug(m[2])) + '">' + inline(m[2], fromFile) + '</h' + lv + '>');
      i++; continue;
    }
    if (/^---+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^\s*>/.test(line)) {
      var q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push('<blockquote>' + blocks(q, fromFile, true) + '</blockquote>');
      continue;
    }
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1])) {
      var head = splitRow(line); i += 2;
      var rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
      var h = '<div class="tbl"><table><thead><tr>' + head.map(function (c) { return '<th>' + inline(c, fromFile) + '</th>'; }).join('') + '</tr></thead><tbody>';
      rows.forEach(function (r) { h += '<tr>' + r.map(function (c) { return '<td>' + inline(c, fromFile) + '</td>'; }).join('') + '</tr>'; });
      out.push(h + '</tbody></table></div>');
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      var items = [];
      while (i < lines.length && (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        var mm = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (mm) items.push({ ind: mm[1].length, ol: /\d/.test(mm[2]), text: mm[3] });
        else items[items.length - 1].text += ' ' + lines[i].trim();
        i++;
      }
      out.push(renderList(items, 0, fromFile).html);
      continue;
    }
    var p = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|```|\||\s*>|\s*([-*]|\d+\.)\s|---+\s*$|<a id=|<!--)/.test(lines[i])) p.push(lines[i++]);
    if (!p.length) { p.push(lines[i++]); }
    out.push('<p>' + p.map(function (x) { return inline(x, fromFile); }).join(br ? '<br>' : ' ') + '</p>');
  }
  return out.join('\n');
}

function renderList(items, start, fromFile) {
  var base = items[start].ind, tag = items[start].ol ? 'ol' : 'ul';
  var html = '<' + tag + '>', k = start;
  while (k < items.length && items[k].ind >= base) {
    if (items[k].ind > base) {
      var sub = renderList(items, k, fromFile);
      html = html.replace(/<\/li>$/, sub.html + '</li>');
      k = sub.next; continue;
    }
    html += '<li>' + inline(items[k].text, fromFile) + '</li>';
    k++;
  }
  return { html: html + '</' + tag + '>', next: k };
}

var CSS = [
  ':root{--bg:#fbfaf8;--fg:#1f2328;--muted:#5d6670;--line:#e3e0da;--card:#ffffff;--accent:#6a4bc4;--accent-soft:#efeafb;--code:#f3f1ec;--quote:#f7f4ee}',
  '@media (prefers-color-scheme:dark){:root{--bg:#16171a;--fg:#e7e7ea;--muted:#a0a5ad;--line:#2d3036;--card:#1d1f23;--accent:#b49cff;--accent-soft:#2a2440;--code:#25272c;--quote:#202227}}',
  '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.7 "Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif}',
  '.wrap{display:flex;max-width:1280px;margin:0 auto}',
  'nav{width:230px;flex:none;padding:24px 16px;position:sticky;top:0;height:100vh;overflow:auto;border-right:1px solid var(--line)}',
  'nav .brand{font-weight:700;margin-bottom:12px;font-size:14px;color:var(--muted)}nav .sub{margin:16px 0 6px;padding:0 10px;font-size:12px;font-weight:700;color:var(--muted)}',
  'nav a{display:block;padding:6px 10px;border-radius:8px;color:var(--fg);text-decoration:none;font-size:14px}',
  'nav a:hover{background:var(--accent-soft)}nav a.on{background:var(--accent-soft);color:var(--accent);font-weight:700}',
  'main{flex:1;min-width:0;padding:28px 40px 80px}',
  'h1{font-size:26px;margin:0 0 12px}h2{font-size:20px;margin:32px 0 10px}h3{font-size:17px;margin:24px 0 8px}h4{font-size:15px}h5,h6{font-size:14px;margin:18px 0 6px}',
  'a{color:var(--accent)}code{background:var(--code);padding:1px 5px;border-radius:4px;font-size:.9em}',
  'pre{background:var(--code);padding:14px;border-radius:8px;overflow:auto;line-height:1.45}pre code{background:none;padding:0}',
  'blockquote{margin:12px 0;padding:8px 16px;background:var(--quote);border-left:3px solid var(--accent);border-radius:0 8px 8px 0}blockquote p{margin:6px 0}',
  '.tbl{overflow-x:auto;margin:12px 0}table{border-collapse:collapse;width:100%;background:var(--card);font-size:14px}',
  'th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}th{background:var(--accent-soft);white-space:nowrap}td{min-width:3.2em}',
  'hr{border:0;border-top:1px solid var(--line);margin:28px 0}',
  '.src{margin-top:48px;font-size:12px;color:var(--muted)}',
  '@media (max-width:800px){.wrap{display:block}nav{position:static;width:auto;height:auto;border-right:0;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:4px;padding:12px 16px}nav .brand{width:100%;margin:0}main{padding:20px 16px 60px}}'
].join('\n');

function page(mdRel, body, title) {
  var fromDir = path.dirname(path.join(ROOT, mdRel));
  var nav = NAV.map(function (n) {
    var href = path.relative(fromDir, path.join(ROOT, n[0].replace(/\.md$/, '.html'))).split(path.sep).join('/');
    return '<a href="' + encodeURI(href) + '"' + (n[0] === mdRel ? ' class="on"' : '') + '>' + esc(n[1]) + '</a>';
  }).join('\n');
  var main = NAV.some(function (n) { return n[0] === mdRel; });
  if (!main) {
    var sibs = fs.readdirSync(fromDir).filter(function (f) { return /\.md$/.test(f); }).sort(function (x, y) { return x === 'README.md' ? -1 : y === 'README.md' ? 1 : x < y ? -1 : 1; });
    nav += '\n<div class="sub">' + esc(path.basename(fromDir)) + '</div>\n' + sibs.map(function (f) {
      var rel = path.relative(ROOT, path.join(fromDir, f)).split(path.sep).join('/');
      return '<a href="' + encodeURI(f.replace(/\.md$/, '.html')) + '"' + (rel === mdRel ? ' class="on"' : '') + '>' + esc(f === 'README.md' ? '이 폴더 안내' : f.replace(/\.md$/, '').replace(/_/g, ' ')) + '</a>';
    }).join('\n');
  }
  return '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>' + esc(title) + '</title>\n<style>\n' + CSS + '\n</style>\n</head>\n<body>\n<div class="wrap">\n<nav><div class="brand">infos · 프로젝트 정보</div>\n' + nav + '\n</nav>\n<main>\n' + body +
    '\n<p class="src">이 페이지는 <code>' + esc(path.basename(mdRel)) + '</code>에서 만들었다. 원본은 md다 — 고칠 때는 md를 고치고 <code>node docs/infos/_build.js</code>를 실행한다.</p>\n</main>\n</div>\n</body>\n</html>\n';
}

/* <!-- include: 경로 --> 줄을 그 md 의 내용으로 바꾼다 (html 에서만).
   포함되는 문서의 제목은 한 단계 내리고, 상대 링크는 포함하는 문서 기준으로 고친다. */
function expandIncludes(md, file) {
  return md.split('\n').map(function (line) {
    var m = /^<!--\s*include:\s*(.+?)\s*-->\s*$/.exec(line);
    if (!m) return line;
    var src = path.resolve(path.dirname(file), m[1]);
    if (!fs.existsSync(src)) { console.error('포함할 파일 없음: ' + m[1]); process.exitCode = 1; return line; }
    var inFence = false;
    return fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n').split('\n').map(function (l) {
      if (/^```/.test(l)) inFence = !inFence;
      if (!inFence && /^#{1,5}\s/.test(l)) l = '#' + l;
      return l.replace(/\]\(([^)\s]+)\)/g, function (all, href) {
        if (/^(https?:|mailto:|#)/.test(href)) return all;
        var parts = href.split('#');
        var abs = path.resolve(path.dirname(src), decodeURI(parts[0]));
        parts[0] = path.relative(path.dirname(file), abs).split(path.sep).join('/');
        return '](' + parts.join('#') + ')';
      });
    }).join('\n');
  }).join('\n');
}

function allMd(dir) {
  var out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var full = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(allMd(full));
    else if (/\.md$/.test(e.name)) out.push(path.relative(ROOT, full).split(path.sep).join('/'));
  });
  return out;
}

var count = 0;
NAV.forEach(function (n) {
  if (!fs.existsSync(path.join(ROOT, n[0]))) { console.error('없음: ' + n[0]); process.exitCode = 1; }
});
allMd(ROOT).sort().forEach(function (rel) {
  var file = path.join(ROOT, rel);
  var md = expandIncludes(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), file);
  var t = /^#\s+(.*)$/m.exec(md);
  var title = t ? t[1].replace(/[`*]/g, '') : rel;
  fs.writeFileSync(file.replace(/\.md$/, '.html'), page(rel, blocks(md.split('\n'), file), title), 'utf8');
  count++;
});
console.log('html ' + count + '개를 만들었다.');
