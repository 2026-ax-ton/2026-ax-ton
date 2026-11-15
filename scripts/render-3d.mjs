/* 3D 재연 장면(scripts/video3d/press.html)을 mp4 클립으로 뽑는다 — 안전교육 영상용 로컬 도구.
   node scripts/render-3d.mjs  → http://127.0.0.1:8766/press.html?cap=pinch,safe,drop,blocked 를 브라우저로 연다
   페이지가 프레임 PNG 를 POST /frame 으로 보내면 임시 폴더에 쌓고, POST /done 에서 ffmpeg 로 묶는다.
   결과: research/videos/3d/press_<클립>.mp4 (gitignore) · ?icon=1 → scripts/video3d/pencil.png
   127.0.0.1 에만 열고, 클립 이름은 영문 소문자만 받는다. */
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PAGES = path.join(ROOT, 'scripts', 'video3d');
const OUT = path.join(ROOT, 'research', 'videos', '3d');
const PORT = Number(process.argv[2] || 8766);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'safety-3d-'));
fs.mkdirSync(OUT, { recursive: true });

function readBody(req) {
  return new Promise((ok, fail) => {
    const parts = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 20e6) { fail(new Error('too big')); req.destroy(); } else parts.push(c); });
    req.on('end', () => ok(Buffer.concat(parts).toString('utf8')));
  });
}
const png = (dataUrl) => Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET') {
      const f = path.join(PAGES, path.basename(u.pathname) || 'press.html');
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream', 'Cache-Control': 'no-store' });
      return res.end(fs.readFileSync(f));
    }
    const clip = u.searchParams.get('clip') || '';
    if (u.pathname === '/icon') {
      fs.writeFileSync(path.join(PAGES, 'pencil.png'), png(await readBody(req)));
      console.log('아이콘 → scripts/video3d/pencil.png');
    } else if (!/^[a-z]+$/.test(clip)) {
      res.writeHead(400); return res.end();
    } else if (u.pathname === '/frame') {
      const dir = path.join(tmp, clip); fs.mkdirSync(dir, { recursive: true });
      const n = Number(u.searchParams.get('f')) | 0;
      fs.writeFileSync(path.join(dir, 'f' + String(n).padStart(4, '0') + '.png'), png(await readBody(req)));
    } else if (u.pathname === '/done') {
      const out = path.join(OUT, 'press_' + clip + '.mp4');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(Number(u.searchParams.get('fps')) || 24), '-i', path.join(tmp, clip, 'f%04d.png'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', out]);
      console.log('클립 → ' + path.relative(ROOT, out) + ' (' + fs.readdirSync(path.join(tmp, clip)).length + '프레임)');
    }
    res.writeHead(204); res.end();
  } catch (e) { console.error(e.message); res.writeHead(500); res.end(); }
}).listen(PORT, '127.0.0.1', () => console.log('http://127.0.0.1:' + PORT + '/press.html?cap=pinch,safe,drop,blocked'));
