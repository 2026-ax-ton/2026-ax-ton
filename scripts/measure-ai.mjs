/* 실제 Gemini 로 안전 문구를 5개 언어에 번역·역번역해 보고 결과를 표로 찍는다.
   STC-E16-008 (실물) 과 2차 마무리 실측(T9 · TK-2-11)의 측정 도구다.

   쓰는 법 (저장소 루트에서)

       node scripts/measure-ai.mjs            문구 10개 (기본)
       node scripts/measure-ai.mjs 3          앞 3개만
       node scripts/measure-ai.mjs "직접 쓴 문구"

   통과 문구는 **대화나 명령줄에 남기지 않는다.** 저장소 루트에 `.env.local` 을
   만들고 아래 두 줄을 적는다 (`.gitignore` 가 `.env.*` 를 막는다):

       AGENT_PASS=<Vercel 에 넣은 통과 문구>
       BASE_URL=https://2026-ax-ton-git-feat-agent-prd-v1-a-636a.vercel.app

   ★ 판정은 사람이 한다. 이 스크립트는 저장하지 않고 화면에 찍기만 한다.
   ★ 에이전트와 **같은 절차**를 돈다 (번역 → 역번역 → 대조 → 재시도 2회 → 올림).
     판정은 `src/assets/review.js` 를 그대로 불러 쓴다 — 두 곳에 복사하지 않는다. */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── .env.local 읽기 (의존성 0) ────────────────────────────────────── */

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

/* ── 화면이 쓰는 대조 판정을 그대로 쓴다 ──────────────────────────── */

const reviewCode = fs.readFileSync(path.join(ROOT, 'src/assets/review.js'), 'utf8');
const Review = new Function(reviewCode + '\n;return Review;')();

/* ── 측정 대상 ─────────────────────────────────────────────────────
   앞 5개는 예시 데이터(`src/assets/seed.js`)의 실제 문구다.
   뒤 5개는 재해 유형(끼임·감전·화재·추락·중독)을 고루 덮으려고 더했다. */

const PHRASES = [
  '프레스가 멈춰도 손을 넣지 마십시오',
  '작업 전 전원을 차단하십시오',
  '도장 작업 시 방독마스크를 착용하십시오',
  '환기팬이 돌지 않으면 작업을 시작하지 마십시오',
  '비상정지 버튼은 설비 오른쪽 아래에 있습니다',
  '회전 중인 롤러에 손이나 옷이 닿지 않게 하십시오',
  '젖은 손으로 배전반을 만지지 마십시오',
  '용접 작업 주변에 기름이나 종이를 두지 마십시오',
  '2미터 이상 높이에서는 반드시 안전대를 거십시오',
  '밀폐 공간에 혼자 들어가지 마십시오',
];

const LANGS = ['km', 'id', 'vi', 'ne', 'th'];
const NAMES = { km: '크메르어', id: '인도네시아어', vi: '베트남어', ne: '네팔어', th: '태국어' };
const MAX_RETRY = 2;   // agent.js 와 같다

const arg = process.argv[2];
const list = !arg ? PHRASES
  : (/^\d+$/.test(arg) ? PHRASES.slice(0, Number(arg)) : [arg]);

/* ── 부르기 ────────────────────────────────────────────────────────── */

let calls = 0;

async function call(route, body) {
  calls += 1;
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE, 'x-agent-pass': PASS },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  let data;
  try { data = await res.json(); } catch (e) { data = { error: 'parse' }; }
  return { status: res.status, ms, data };
}

/** 에이전트와 같은 절차로 한 언어를 끝까지 */
async function runLang(ko, lang) {
  let hint = '';
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    const t = await call('translate', { ko, lang, attempt, hint });
    if (t.status !== 200) {
      return { ok: false, why: `번역 ${t.status} ${t.data.error || ''} — ${t.data.message || ''}`, ms: t.ms, tries: attempt + 1 };
    }
    const b = await call('backtranslate', { text: t.data.text, lang });
    if (b.status !== 200) {
      return { ok: false, why: `역번역 ${b.status} ${b.data.error || ''} — ${b.data.message || ''}`, ms: t.ms + b.ms, tries: attempt + 1 };
    }

    const flipped = Review.negationFlipped(ko, b.data.back);
    const newWords = Review.newWordCount(ko, b.data.back);
    const base = {
      ok: true, text: t.data.text, back: b.data.back,
      ms: t.ms + b.ms, tries: attempt + 1, flipped, newWords,
    };
    if (!flipped) return { ...base, escalated: false };
    /* ★ 뜻이 뒤집힌 장면은 그대로 찍어 둔다 — 이것이 이 제품의 핵심 장면이다 */
    console.log(`      [시도 ${attempt + 1}] 뜻 뒤집힘 → 번역: ${t.data.text}`);
    console.log(`                      역번역: ${b.data.back}`);
    if (attempt >= MAX_RETRY) return { ...base, escalated: true };
    hint = b.data.back;
  }
}

/* ── 돈다 ──────────────────────────────────────────────────────────── */

console.log(`주소: ${BASE}`);
console.log(`문구 ${list.length}개 × 언어 ${LANGS.length}개\n`);

const rows = [];

for (const ko of list) {
  console.log(`── ${ko}`);
  for (const lang of LANGS) {
    const r = await runLang(ko, lang);
    rows.push({ ko, lang, ...r });
    if (!r.ok) {
      console.log(`   ${NAMES[lang]}: 실패 — ${r.why}`);
      continue;
    }
    console.log(`   ${NAMES[lang]}: ${r.escalated ? '★ 사람에게 올림' : '받음'}`
      + ` (시도 ${r.tries}/3, ${r.ms}ms, 새 낱말 ${r.newWords})`);
    if (r.escalated) console.log(`      역번역: ${r.back}`);
  }
}

/* ── 요약 ──────────────────────────────────────────────────────────── */

const good = rows.filter((r) => r.ok);
const bad = rows.filter((r) => !r.ok);
const retried = good.filter((r) => r.tries > 1);
const escalated = good.filter((r) => r.escalated);
const pct = (n, d) => (d ? (n / d * 100).toFixed(1) : '0.0') + '%';
const avg = good.length ? Math.round(good.reduce((s, r) => s + r.ms, 0) / good.length) : 0;
const sorted = good.map((r) => r.ms).sort((a, b) => a - b);
const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;

console.log('\n\n### D07 §6 · D08 에 붙일 표\n');
console.log('| 항목 | 값 |');
console.log('|---|---|');
console.log(`| 문구 × 언어 | ${list.length} × ${LANGS.length} = ${rows.length}건 |`);
console.log(`| 모델 호출 | ${calls}번 |`);
console.log(`| 성공 | ${good.length}건 (${pct(good.length, rows.length)}) |`);
console.log(`| 실패 | ${bad.length}건 (${pct(bad.length, rows.length)}) |`);
console.log(`| 재시도율 (2회 이상 시도) | ${retried.length}건 (${pct(retried.length, good.length)}) |`);
console.log(`| 사람에게 올림 | ${escalated.length}건 (${pct(escalated.length, good.length)}) |`);
console.log(`| 처리 시간 평균 | ${avg}ms |`);
console.log(`| 처리 시간 p95 | ${p95}ms |`);

if (bad.length) {
  console.log('\n**실패한 것**\n');
  console.log('| 문구 | 언어 | 이유 |');
  console.log('|---|---|---|');
  bad.forEach((r) => console.log(`| ${r.ko} | ${NAMES[r.lang]} | ${r.why} |`));
}

if (escalated.length) {
  console.log('\n**사람에게 올린 것 (운영자가 직접 넣어야 승인된다)**\n');
  console.log('| 문구 | 언어 | 역번역 |');
  console.log('|---|---|---|');
  escalated.forEach((r) => console.log(`| ${r.ko} | ${NAMES[r.lang]} | ${r.back} |`));
}
