/* 설비 사진 1장을 실제 Gemini 에 넣어 **위험 지점 좌표가 쓸 만한지** 재 본다.

   왜 재나 — PRD-AD-07 §11 Q8 · C06 D-027 (방식 (a) Gemini 확정, 2026-11-04)

     방식은 닫혔지만 **좌표 품질은 아직 안 잰 것**이다. FR-AD-07-04 는 "지점마다
     위치(사진 기준 퍼센트 좌표)·위험유형·짧은 이유"를 받는다고 적어 두었는데,
     `gemini-3.1-flash-lite` (C06 D-028) 가 설비 사진에서 그 좌표를 **실제로**
     주는지는 모델을 불러 봐야 안다.

     못 쓸 수준이면 FR-04 를 「좌표」에서 **「위험유형 목록 + 이유」**로 줄이고,
     지점은 담당자가 사진 위에서 직접 찍는다 (PRD-AD-07 §11 Q8 개발자 답).
     그 판단을 **눈으로 보고** 하기 위한 도구다.

   쓰는 법 (저장소 루트에서)

       node scripts/measure-hazards.mjs <사진1> [사진2] …
       node scripts/measure-hazards.mjs photos/press.jpg photos/panel.jpg

     키는 **대화나 명령줄에 남기지 않는다.** 저장소 루트 `.env.local` 에 적는다
     (`.gitignore` 가 `.env.*` 를 막는다). 둘 중 아무 이름이나 된다:

       GEMINI_API_KEY=<개발용 키>            또는
       GEMINI_HACKATHON_KEY=<해커톤용 임시 키>

     모델을 바꿔 견주려면 (기본 `gemini-3.1-flash-lite`):

       node scripts/measure-hazards.mjs --model gemini-3.8-flash photos/press.jpg

   ★ 판정은 사람이 한다. 이 스크립트는 **저장하지 않고 화면에 찍기만** 한다
     (`scripts/measure-ai.mjs` 와 같은 원칙 — 실측 기록은 사람이 D07 에 옮긴다).
   ★ 사진은 **설비만** 찍힌 것으로 한다. 사람 얼굴·이름표가 들어간 사진으로
     재지 않는다 (A05 §3.1 · FR-AD-07-02).
   ★ 위험유형 6종은 화면이 쓰는 `src/assets/store.js` 의 `Store.HAZARDS` 를
     **그대로 읽어 온다** — 두 곳에 베끼지 않는다 (FR-AD-07-05).

   근거: PRD-AD-07 §4 FR-04·05·20·21 · §11 Q4·Q5·Q8 · C06 D-027·D-028 · A02 §5.3
   ============================================================================ */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── 결정에 걸린 값 ─────────────────────────────────────────────────── */

export const MAX_POINTS = 5;              // PRD-AD-07 §11 Q4 결정 (사진 1장당 5개)
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;  // 4MB — 이보다 크면 줄여서 다시 (FR-03)
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';   // C06 D-028
const TIMEOUT_MS = 30000;                 // 사진은 글보다 오래 걸린다 (번역은 20초)
const MAX_OUTPUT_TOKENS = 1200;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic',
};

/* ── 위험유형 6종 — 화면이 쓰는 표를 그대로 읽는다 ─────────────────── */

/** `src/assets/store.js` 를 통째로 돌려 `Store.HAZARDS` 를 꺼낸다.
 *  브라우저 전역 코드라 `localStorage` 가 필요해서 아주 작은 대역을 끼운다.
 *  (`scripts/measure-ai.mjs` 가 `review.js` 를 불러 쓰는 것과 같은 방법 — 의존성 0) */
export function readHazards(root = ROOT) {
  const code = fs.readFileSync(path.join(root, 'src/assets/store.js'), 'utf8');
  const store = new Function('localStorage', 'location', code + '\n;return Store;')(
    { getItem: () => null, setItem: () => {}, removeItem: () => {}, length: 0, key: () => null },
    { protocol: 'https:' },
  );
  return store.HAZARDS.map((h) => h.code);
}

/* ── 지시문 ─────────────────────────────────────────────────────────────
   ★ 이 지시문이 T17 서버 함수로 옮겨 갈 원안이다. 여기서 먼저 다듬는다.
   ★ 안전 문구를 **쓰게 하지 않는다** — 문구는 검수된 라이브러리에서 고른다
     (FR-AD-07-09). 그래서 "이유"는 담당자 참고용 한 마디만 받는다. */

export function systemText(hazardCodes) {
  return '너는 산업안전 점검자다. 공장 설비 사진 한 장을 보고 위험 지점을 찾는다.\n'
    + '규칙:\n'
    + `1) 위험 지점은 많아도 ${MAX_POINTS}개까지만 낸다. 확실한 것부터 낸다.\n`
    + '2) 위치는 사진을 기준으로 한 **퍼센트**로 낸다. x 는 왼쪽에서, y 는 위에서,'
    + ' r 은 그 지점을 덮는 원의 반지름이다. 셋 다 0~100 사이의 숫자다.\n'
    + `3) 위험유형은 다음 중 하나만 쓴다: ${hazardCodes.join(', ')}.\n`
    + '4) 이유는 한국어 한 문장으로 짧게 쓴다. 지시문이나 안전 수칙을 쓰지 않는다.\n'
    + '5) 사진에 사람의 얼굴이나 몸, 이름표가 보이면 person 을 true 로 한다.\n'
    + '6) 설명 없이 아래 모양의 JSON 하나만 출력한다.\n'
    + '{"person": false, "points": [{"x": 50, "y": 40, "r": 8,'
    + ` "hazard": "${hazardCodes[0]}", "why": "..."}]}`;
}

/* ── 응답 거르기 ────────────────────────────────────────────────────────
   ★ 모델 출력은 **믿을 수 없는 문자열**이다 (FR-AD-07-12). 여기서 거른 모양이
     T17 서버 함수가 쓸 모양이다 — 그래서 검사로 고정해 둔다
     (`tests/test-measure-hazards.mjs`). */

/** 모델이 코드 울타리(```json)로 싸서 주는 일이 흔하다. 벗기고 JSON 만 꺼낸다. */
export function parseModelJson(text) {
  if (typeof text !== 'string') return null;
  let t = text.trim();
  const fence = /^```[a-z]*\s*([\s\S]*?)\s*```$/i.exec(t);
  if (fence) t = fence[1].trim();
  /* 앞뒤에 말을 붙여 주는 경우 — 첫 { 부터 마지막 } 까지만 본다 */
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a === -1 || b === -1 || b < a) return null;
  try {
    const v = JSON.parse(t.slice(a, b + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function num(v) {
  return typeof v === 'number' && isFinite(v) ? v : null;
}

/** 쓸 수 있는 지점만 남긴다. 버린 것은 **몇 개를 왜 버렸는지** 함께 돌려준다 —
 *  화면에도 그렇게 적어야 한다 (FR-AD-07-05 "몇 개를 버렸는지 화면에 적는다"). */
export function filterPoints(raw, hazardCodes, max = MAX_POINTS) {
  const dropped = { hazard: 0, range: 0, shape: 0, over: 0 };
  const list = Array.isArray(raw) ? raw : [];
  const kept = [];

  list.forEach((p) => {
    if (!p || typeof p !== 'object') { dropped.shape += 1; return; }
    const x = num(p.x); const y = num(p.y); const r = num(p.r);
    if (x === null || y === null || r === null) { dropped.shape += 1; return; }
    if (typeof p.hazard !== 'string' || hazardCodes.indexOf(p.hazard) === -1) {
      dropped.hazard += 1; return;   // 6종 밖 — 버린다 (FR-05)
    }
    if (x < 0 || x > 100 || y < 0 || y > 100 || r <= 0 || r > 100) {
      dropped.range += 1; return;    // 퍼센트가 아니다 (픽셀을 준 경우 등)
    }
    if (kept.length >= max) { dropped.over += 1; return; }   // Q4 상한
    kept.push({
      x, y, r,
      hazard: p.hazard,
      /* 이유는 참고용이고 문구로 저장하지 않는다 (FR-09). 길이만 자른다 */
      why: typeof p.why === 'string' ? p.why.trim().slice(0, 120) : '',
    });
  });

  return { points: kept, dropped };
}

/** 터치 구역이 겹치는 지점은 하나로 합친다 (FR-AD-07-21 · WK-03 FR-14 의 60px).
 *  여기서는 **겹치는 쌍이 몇 쌍인지만** 세어 알려 준다 — 합치는 규칙은 화면이
 *  정해야 하고(어느 쪽 위험유형을 남기나), 실측에서는 "얼마나 겹치나"가 궁금하다. */
export function overlapCount(points) {
  let n = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      if (Math.sqrt(dx * dx + dy * dy) < points[i].r + points[j].r) n += 1;
    }
  }
  return n;
}

/* ── 여기서부터는 실제로 부르는 부분 ───────────────────────────────── */

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

async function callModel(key, model, system, mime, base64) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      // 키는 주소가 아니라 헤더로 보낸다 — 주소는 기록에 남기 쉽다 (A02 §5.3)
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{
          role: 'user',
          parts: [
            { inline_data: { mime_type: mime, data: base64 } },
            { text: '이 설비 사진의 위험 지점을 찾아라.' },
          ],
        }],
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          thinkingConfig: { thinkingLevel: 'low' },
        },
      }),
      signal: ac.signal,
    });
    const ms = Date.now() - started;
    if (res.status === 429) return { error: '공급사 한도 (429)', ms };
    if (!res.ok) return { error: '모델 응답 ' + res.status, ms };
    const data = await res.json();
    if (data && data.promptFeedback && data.promptFeedback.blockReason) {
      return { error: '모델이 막음 (' + data.promptFeedback.blockReason + ')', ms };
    }
    const parts = data && data.candidates && data.candidates[0]
      && data.candidates[0].content && data.candidates[0].content.parts;
    const text = parts && parts[0] && typeof parts[0].text === 'string' ? parts[0].text : '';
    const usage = (data && data.usageMetadata) || {};
    return { text, ms, usage };
  } catch (e) {
    const ms = Date.now() - started;
    return { error: ac.signal.aborted ? TIMEOUT_MS + 'ms 초과' : '모델에 닿지 못함', ms };
  } finally {
    clearTimeout(timer);
  }
}

/* ── 명령줄 ────────────────────────────────────────────────────────── */

function main() {
  const argv = process.argv.slice(2);
  let model = DEFAULT_MODEL;
  const files = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--model') { model = argv[i + 1] || model; i += 1; } else files.push(argv[i]);
  }

  const env = { ...readEnvLocal(), ...process.env };
  const key = (env.GEMINI_API_KEY || env.GEMINI_HACKATHON_KEY || '').trim();

  if (!key) {
    console.error('GEMINI_API_KEY 나 GEMINI_HACKATHON_KEY 가 필요하다. 위 주석대로 .env.local 에 적는다.');
    process.exit(1);
  }
  if (!files.length) {
    console.error('재 볼 사진을 적어 준다: node scripts/measure-hazards.mjs <사진1> [사진2] …');
    console.error('★ 설비만 찍힌 사진으로 한다 (사람 얼굴·이름표가 없는 것, A05 §3.1).');
    process.exit(1);
  }

  const hazards = readHazards();
  const system = systemText(hazards);

  console.log('모델 ' + model + ' · 위험유형 ' + hazards.length + '종 (' + hazards.join('·') + ')'
    + ' · 지점 상한 ' + MAX_POINTS + '개');
  console.log('★ 판정은 사람이 한다. 저장하지 않는다 — 결과는 D07 에 사람이 옮긴다.\n');

  const run = async () => {
    for (const file of files) {
      const abs = path.resolve(process.cwd(), file);
      console.log('── ' + file + ' ' + '─'.repeat(Math.max(0, 54 - file.length)));

      if (!fs.existsSync(abs)) { console.log('  파일이 없다\n'); continue; }
      const mime = MIME[path.extname(abs).toLowerCase()];
      if (!mime) { console.log('  읽을 수 없는 형식이다 (' + Object.keys(MIME).join(' ') + ')\n'); continue; }

      const buf = fs.readFileSync(abs);
      const kb = Math.round(buf.length / 1024);
      if (buf.length > MAX_IMAGE_BYTES) {
        console.log('  ' + kb + 'KB — 너무 크다. ' + Math.round(MAX_IMAGE_BYTES / 1024)
          + 'KB 아래로 줄여서 다시 넣는다 (FR-AD-07-03 의 사본 상한을 정하는 데도 이 숫자가 쓰인다)\n');
        continue;
      }
      console.log('  보낸 크기 ' + kb + 'KB (' + mime + ')');

      const r = await callModel(key, model, system, mime, buf.toString('base64'));
      if (r.error) { console.log('  ✗ ' + r.error + ' · ' + r.ms + 'ms\n'); continue; }

      const body = parseModelJson(r.text);
      if (!body) {
        console.log('  ✗ JSON 이 아니다 · ' + r.ms + 'ms');
        console.log('    받은 앞부분: ' + JSON.stringify(String(r.text).slice(0, 160)) + '\n');
        continue;
      }

      const { points, dropped } = filterPoints(body.points, hazards);
      const over = overlapCount(points);
      const droppedTotal = dropped.hazard + dropped.range + dropped.shape + dropped.over;

      console.log('  걸린 시간 ' + r.ms + 'ms'
        + (r.usage && r.usage.totalTokenCount ? ' · 토큰 ' + r.usage.totalTokenCount : ''));
      console.log('  사람·이름표: ' + (body.person === true ? '있다고 했다 → 다시 찍게 한다 (FR-20)' : '없다고 했다'));
      console.log('  쓸 수 있는 지점 ' + points.length + '개'
        + (droppedTotal ? ' · 버린 것 ' + droppedTotal + '개 (6종 밖 ' + dropped.hazard
          + ' · 좌표 범위 밖 ' + dropped.range + ' · 모양 틀림 ' + dropped.shape
          + ' · 상한 초과 ' + dropped.over + ')' : ''));
      if (over) console.log('  겹치는 쌍 ' + over + '쌍 → 합쳐 보여야 한다 (FR-21)');

      points.forEach((p, i) => {
        console.log('    ' + (i + 1) + ') ' + p.hazard.padEnd(9)
          + ' x' + String(Math.round(p.x)).padStart(3) + '% y' + String(Math.round(p.y)).padStart(3) + '%'
          + ' r' + String(Math.round(p.r)).padStart(3) + '%  ' + p.why);
      });
      if (!points.length) console.log('    (없다 — FR-04 를 「좌표」에서 「위험유형 + 이유」로 줄일지 판단한다)');
      console.log('');
    }

    console.log('사람이 볼 것');
    console.log('  1. 좌표가 **사진에서 실제로 그 자리**인가 — 사진을 열고 x%·y% 를 짚어 본다');
    console.log('  2. AC-AD-07-01 의 「지점 2개 이상」이 나오는가');
    console.log('  3. 지연이 운영자가 기다릴 만한가 (번역은 평균 2.9초였다, D07 §6.4)');
    console.log('  4. 결과를 D07 §6 에 옮기고, 못 쓸 수준이면 PRD-AD-07 FR-04 를 줄인다');
  };

  run();
}

/* 검사가 `import` 할 때는 돌지 않게 한다 (`measure-ai.mjs` 와 달리 이 파일은
   거르는 함수를 검사가 가져다 쓴다 — 그 함수들이 T17 의 원안이다). */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
