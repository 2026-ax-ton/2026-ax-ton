/* 실제 Gemini 로 문구 하나를 5개 언어로 번역·역번역해 보고, 결과를 표로 찍는다.
   STC-E16-008 (실물 — 실제 Gemini) 의 측정 도구다 (T4 · TK-2-05).

   쓰는 법 (저장소 루트에서)

       node scripts/measure-ai.mjs

   통과 문구는 **대화나 명령줄에 남기지 않는다.** 저장소 루트에 `.env.local` 을
   만들고 아래 두 줄을 적는다 (`.gitignore` 가 `.env.*` 를 막는다):

       AGENT_PASS=<Vercel 에 넣은 통과 문구>
       BASE_URL=https://2026-ax-ton-git-feat-agent-prd-v1-a-636a.vercel.app

   ★ 판정은 사람이 한다. 이 스크립트는 사람이 볼 곳을 좁혀 줄 뿐이다.
     결과를 저장하지 않고 화면에 찍기만 한다. */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── .env.local 읽기 (의존성 0 — 따옴표와 주석만 걷어낸다) ─────────── */

function readEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return {};
  const out = {};
  fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) return;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  });
  return out;
}

const env = { ...readEnvLocal(), ...process.env };
const BASE = (env.BASE_URL || '').replace(/\/$/, '');
const PASS = env.AGENT_PASS || '';

if (!BASE || !PASS) {
  console.error('BASE_URL 과 AGENT_PASS 가 필요하다. 위 주석대로 .env.local 을 만든다.');
  process.exit(1);
}

/* ── 화면이 쓰는 대조 판정을 그대로 쓴다 (두 곳에 복사하지 않는다) ──── */

const reviewCode = fs.readFileSync(path.join(ROOT, 'src/assets/review.js'), 'utf8');
const Review = new Function(reviewCode + '\n;return Review;')();

/* ── 측정 ──────────────────────────────────────────────────────────── */

const LANGS = ['km', 'id', 'vi', 'ne', 'th'];
const NAMES = { km: '크메르어', id: '인도네시아어', vi: '베트남어', ne: '네팔어', th: '태국어' };
const KO = process.argv[2] || '회전 중인 롤러에 손을 넣지 마세요.';

async function call(route, body) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/${route}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': BASE,
      'x-agent-pass': PASS,
    },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  let data;
  try { data = await res.json(); } catch (e) { data = { error: 'parse' }; }
  return { status: res.status, ms, data };
}

console.log(`문구: ${KO}`);
console.log(`주소: ${BASE}\n`);

const rows = [];

for (const lang of LANGS) {
  const t = await call('translate', { ko: KO, lang, attempt: 0 });
  if (t.status !== 200) {
    rows.push({ lang, ok: false, why: `번역 ${t.status} ${t.data.error || ''}`, ms: t.ms });
    console.log(`${NAMES[lang]}: 번역 실패 ${t.status} ${t.data.error || ''} ${t.data.message || ''}`);
    continue;
  }

  const b = await call('backtranslate', { text: t.data.text, lang });
  if (b.status !== 200) {
    rows.push({ lang, ok: false, why: `역번역 ${b.status} ${b.data.error || ''}`, ms: t.ms + b.ms });
    console.log(`${NAMES[lang]}: 역번역 실패 ${b.status} ${b.data.error || ''}`);
    continue;
  }

  const flipped = Review.negationFlipped(KO, b.data.back);
  const newWords = Review.newWordCount(KO, b.data.back);

  rows.push({
    lang, ok: true, ms: t.ms + b.ms,
    text: t.data.text, back: b.data.back, flipped, newWords,
    models: `${t.data.model} / ${b.data.model}`,
  });

  console.log(`── ${NAMES[lang]} (${t.ms + b.ms}ms) ──`);
  console.log(`  번역   ${t.data.text}`);
  console.log(`  역번역 ${b.data.back}`);
  console.log(`  뜻 뒤집힘: ${flipped ? '★ 예 — 사람에게 올림' : '아니오'} · 새 낱말 ${newWords}개\n`);
}

/* ── D07 에 붙일 표 ────────────────────────────────────────────────── */

console.log('\n### D07 STC-E16-008 에 붙일 표\n');
console.log('| 언어 | 처리 시간 | 뜻 뒤집힘 | 새 낱말 | 역번역 |');
console.log('|---|---|---|---|---|');
rows.forEach((r) => {
  if (!r.ok) {
    console.log(`| ${NAMES[r.lang]} | ${r.ms}ms | — | — | 실패: ${r.why} |`);
    return;
  }
  console.log(`| ${NAMES[r.lang]} | ${r.ms}ms | ${r.flipped ? '★ 예' : '아니오'} | ${r.newWords} | ${r.back} |`);
});

const good = rows.filter((r) => r.ok);
const flippedCount = good.filter((r) => r.flipped).length;
const avg = good.length ? Math.round(good.reduce((s, r) => s + r.ms, 0) / good.length) : 0;
console.log(`\n성공 ${good.length}/${LANGS.length} · 평균 ${avg}ms · 뜻 뒤집힘 ${flippedCount}건`);
if (good.length) console.log(`모델: ${good[0].models}`);
