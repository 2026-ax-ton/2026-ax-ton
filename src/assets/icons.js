/* ===================================================================
   icons.js — 화면의 그림문자를 선으로 그린 아이콘으로

   ★ 왜 이모지를 그만뒀나
     이모지는 기기마다 다르게 그려진다. 같은 ⚠ 가 안드로이드에서는 노란
     삼각형이고 다른 기기에서는 다른 모양이다. 그리고 대부분의 이모지는
     둥글고 알록달록해서, 안전 지시를 하는 화면의 말투와 맞지 않는다.
     현장에서 쓰는 안전보건 픽토그램은 전부 단색 선 그림이다.

   ★ 그래도 이모지를 코드에서 지우지 않았다
     HTML 에 남아 있는 이모지는 JS 가 멈췄을 때 화면이 비지 않게 하는
     대비책이다 (i18n.js 가 한국어 원문을 남겨 두는 것과 같은 이유).
     여기서 하는 일은 "있으면 더 좋게 바꿔 끼우는 것" 이다.

   ★ 저장된 데이터를 고치지 않는다
     setup.processes[].icon 과 equipments[].icon 은 localStorage 에
     이모지로 들어 있다. 그 값을 바꾸면 이미 등록해 둔 사업장이 깨진다.
     그래서 저장은 그대로 두고 그릴 때만 바꾼다 (EMOJI 표).
     표에 없는 값은 글자 그대로 나간다 — 담당자가 넣은 것을 지우지 않는다.

   ★ 외부 요청 0건을 지킨다
     아이콘 폰트도 svg 파일도 쓰지 않는다. 전부 이 파일 안의 좌표다.

   ★ innerHTML 을 쓰지 않는다. createElementNS 로 만든다 (diagrams.js 와 같다).

   ★ 색만으로 구분하지 않는다
     모양이 서로 다르다 — 체크 / 찬 원 / 빈 원 / 삼각형.
     흑백으로 인쇄해도 뜻이 남아야 한다 (증빙이 흑백으로 나간다).

   쓰는 법
     Icons.node('speaker')     아이콘 하나 (없는 이름이면 글자 노드)
     Icons.node(어떤 이모지)    이모지로도 찾는다
     Icons.upgrade(document)   화면에 이미 박혀 있는 이모지를 바꿔 끼운다
   =================================================================== */

var Icons = (function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  /* 좌표계는 24×24 다. 선 굵기 1.7 · 끝을 둥글게.
     칸을 꽉 채우지 않고 여백을 둔다 — 글자 옆에 놓였을 때 튀지 않는다. */
  var SHAPES = {

    /* ---- 노동자 하단 탭 ---- */
    'home': [
      ['path', { d: 'M3 11.4 12 3.2l9 8.2' }],
      ['path', { d: 'M5.6 10.2V20.8h12.8V10.2' }],
      ['path', { d: 'M9.8 20.8v-5.6h4.4v5.6' }]
    ],
    'headphones': [
      ['path', { d: 'M4.2 15.2v-3.4a7.8 7.8 0 0 1 15.6 0v3.4' }],
      ['rect', { x: 2.4, y: 14, width: 4.4, height: 7, rx: 2.2 }],
      ['rect', { x: 17.2, y: 14, width: 4.4, height: 7, rx: 2.2 }]
    ],
    /* 🆕 2026-11-15 로그인 화면 (Figma 시안) — 방패 · 눈(비밀번호 보기) */
    'shield': [
      ['path', { d: 'M12 2.8l7.6 3v5.6c0 4.8-3.2 8.4-7.6 9.8-4.4-1.4-7.6-5-7.6-9.8V5.8z' }]
    ],
    'eye': [
      ['path', { d: 'M2.4 12s3.6-6.6 9.6-6.6 9.6 6.6 9.6 6.6-3.6 6.6-9.6 6.6S2.4 12 2.4 12z' }],
      ['circle', { cx: 12, cy: 12, r: 3 }]
    ],
    'camera': [
      ['rect', { x: 2.6, y: 7, width: 18.8, height: 13.4, rx: 2.6 }],
      ['path', { d: 'M8.6 7l1.5-2.6h3.8L15.4 7' }],
      ['circle', { cx: 12, cy: 13.7, r: 3.6 }]
    ],
    'chat': [
      ['rect', { x: 3, y: 4.4, width: 18, height: 12.8, rx: 3 }],
      ['path', { d: 'M8.2 17.2v4.2l4.6-4.2' }]
    ],
    'person': [
      ['circle', { cx: 12, cy: 8, r: 3.7 }],
      ['path', { d: 'M4.6 20.8a7.4 7.4 0 0 1 14.8 0' }]
    ],

    /* ---- 관리자 상단 메뉴 ---- */
    'chart': [
      ['path', { d: 'M3.4 20.6h17.2' }],
      ['rect', { x: 5, y: 12, width: 3.4, height: 6 }],
      ['rect', { x: 10.3, y: 7.4, width: 3.4, height: 10.6 }],
      ['rect', { x: 15.6, y: 14, width: 3.4, height: 4 }]
    ],
    'factory': [
      ['path', { d: 'M3.4 20.6h17.2' }],
      ['path', { d: 'M4 20V10.6l4.6 2.8V10.6l4.6 2.8V7.6l6.8 4V20' }],
      ['path', { d: 'M7 16.8h1.8' }],
      ['path', { d: 'M11.6 16.8h1.8' }],
      ['path', { d: 'M16.2 16.8h1.8' }]
    ],
    'doc-edit': [
      ['path', { d: 'M13.6 3.4H6.4A1.6 1.6 0 0 0 4.8 5v14a1.6 1.6 0 0 0 1.6 1.6h11.2A1.6 1.6 0 0 0 19.2 19v-6.4' }],
      ['path', { d: 'M13.6 3.4v5.2h5.6' }],
      ['path', { d: 'M8.4 14.4h5' }],
      ['path', { d: 'M8.4 17.4h3' }]
    ],
    'file': [
      ['path', { d: 'M13.6 3.4H6.4A1.6 1.6 0 0 0 4.8 5v14a1.6 1.6 0 0 0 1.6 1.6h11.2A1.6 1.6 0 0 0 19.2 19V9z' }],
      ['path', { d: 'M13.6 3.4V9h5.6' }],
      ['path', { d: 'M8.4 13.2h7.2' }],
      ['path', { d: 'M8.4 16.6h4.6' }]
    ],
    'search': [
      ['circle', { cx: 10.8, cy: 10.8, r: 6.4 }],
      ['path', { d: 'M15.6 15.6l4.9 4.9' }]
    ],

    /* ---- 상태 — 모양이 서로 달라야 흑백으로도 구분된다 ---- */
    'check': [
      ['path', { d: 'M4.6 12.6l4.9 4.9L19.4 6.9', 'stroke-width': 2.1 }]
    ],
    'dot': [
      ['circle', { cx: 12, cy: 12, r: 5.4, fill: 'currentColor', stroke: 'none' }]
    ],
    'circle': [
      ['circle', { cx: 12, cy: 12, r: 6.4 }]
    ],
    'alert': [
      ['path', { d: 'M12 3.8l9.4 16.4H2.6z' }],
      ['path', { d: 'M12 9.4v4.8' }],
      ['circle', { cx: 12, cy: 17.2, r: 1.05, fill: 'currentColor', stroke: 'none' }]
    ],
    'alert-circle': [
      ['circle', { cx: 12, cy: 12, r: 8.4 }],
      ['path', { d: 'M12 7.6v5' }],
      ['circle', { cx: 12, cy: 16.2, r: 1.05, fill: 'currentColor', stroke: 'none' }]
    ],
    'check-circle': [
      ['circle', { cx: 12, cy: 12, r: 8.4 }],
      ['path', { d: 'M7.9 12.3l2.9 2.9 5.3-5.9', 'stroke-width': 1.9 }]
    ],
    'repeat': [
      ['path', { d: 'M4.2 12A7.8 7.8 0 0 1 12 4.2h4.4' }],
      ['path', { d: 'M14.2 1.9l2.6 2.3-2.6 2.3' }],
      ['path', { d: 'M19.8 12A7.8 7.8 0 0 1 12 19.8H7.6' }],
      ['path', { d: 'M9.8 22.1l-2.6-2.3 2.6-2.3' }]
    ],
    'clipboard': [
      ['rect', { x: 5, y: 4.6, width: 14, height: 16.2, rx: 2.2 }],
      ['path', { d: 'M9.2 4.6V3h5.6v1.6' }],
      ['path', { d: 'M8.6 10.2h6.8' }],
      ['path', { d: 'M8.6 13.8h6.8' }],
      ['path', { d: 'M8.6 17.4h4.2' }]
    ],

    /* ---- 위험유형 (Store.HAZARDS) ---- */
    'gear': [
      ['circle', { cx: 12, cy: 12, r: 3.3 }],
      ['path', { d: 'M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3' }],
      ['path', { d: 'M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1' }]
    ],
    'bolt': [
      ['path', { d: 'M13.6 2.4L6.2 13.4h5.2L10.4 21.6 17.8 10.6h-5.2z' }]
    ],
    'flame': [
      ['path', { d: 'M12 21.4c3.5 0 6-2.3 6-5.6 0-4.4-4.2-6-3.3-10.8-2.9 1.2-5.2 3.9-5.2 6.4 0 1.5.6 2.3.6 2.3s-1.2-1-2.5.2c-1 .9-1.7 2.2-1.7 3.9 0 2.6 2.2 3.6 6.1 3.6z' }]
    ],
    'ladder': [
      ['path', { d: 'M7.6 2.6v18.8' }],
      ['path', { d: 'M16.4 2.6v18.8' }],
      ['path', { d: 'M7.6 6.6h8.8M7.6 11h8.8M7.6 15.4h8.8M7.6 19.8h8.8' }]
    ],
    'mask': [
      ['path', { d: 'M4.4 9.6c2.4-1.4 4.9-2 7.6-2s5.2.6 7.6 2v2.9c0 3.5-3.4 6.3-7.6 6.3s-7.6-2.8-7.6-6.3z' }],
      ['path', { d: 'M4.4 11.4h15.2' }],
      ['path', { d: 'M2.6 8.4l1.8 1.2M21.4 8.4l-1.8 1.2' }]
    ],
    'flask': [
      ['path', { d: 'M9.6 3.2h4.8v5.4l4.4 8.8a1.9 1.9 0 0 1-1.7 2.8H6.9a1.9 1.9 0 0 1-1.7-2.8l4.4-8.8z' }],
      ['path', { d: 'M8.8 3.2h6.4' }],
      ['path', { d: 'M6.9 14.6h10.2' }]
    ],

    /* ---- 설비·공정 고르는 후보 (Store.ICONS) ---- */
    'wrench': [
      ['path', { d: 'M14.4 3.2a5.2 5.2 0 0 0-4.4 7.9L3.4 17.8l2.8 2.8 6.7-6.6a5.2 5.2 0 0 0 6.6-7.3l-2.9 2.9-2.6-2.6z' }]
    ],
    'nut': [
      ['path', { d: 'M12 2.9l7.9 4.5v9.2L12 21.1l-7.9-4.5V7.4z' }],
      ['circle', { cx: 12, cy: 12, r: 3.2 }]
    ],
    'extinguisher': [
      ['rect', { x: 8.2, y: 7.6, width: 7.6, height: 13.2, rx: 2.2 }],
      ['path', { d: 'M10.2 7.6V5.4h3.6v2.2' }],
      ['path', { d: 'M13.8 6.2h3.8v3.4' }],
      ['path', { d: 'M8.2 11.6h7.6' }]
    ],
    'box': [
      ['path', { d: 'M3.6 8.2L12 4l8.4 4.2v8.6L12 21l-8.4-4.2z' }],
      ['path', { d: 'M3.6 8.2L12 12.5l8.4-4.3' }],
      ['path', { d: 'M12 12.5V21' }]
    ],
    'tractor': [
      ['circle', { cx: 7, cy: 17.4, r: 3.4 }],
      ['circle', { cx: 17.6, cy: 18, r: 2.8 }],
      ['path', { d: 'M4.2 14.6V8.8h4.9l2 5.8' }],
      ['path', { d: 'M11.1 14.6h5.5V10.8h-3.4' }]
    ],

    /* ---- 이해도 검증 문항 3유형 ---- */
    'touch': [
      ['path', { d: 'M10.2 12.4V5.6a1.8 1.8 0 0 1 3.6 0V12' }],
      ['path', { d: 'M13.8 10.8a1.7 1.7 0 0 1 3.4 0V15c0 3.4-2.4 5.9-5.8 5.9-2.9 0-4.6-1.6-5.4-3.8L4.6 13.4a1.6 1.6 0 0 1 2.9-1.3l.9 1.9' }]
    ],
    'checkbox': [
      ['rect', { x: 3.6, y: 3.6, width: 16.8, height: 16.8, rx: 3.2 }],
      ['path', { d: 'M7.8 12.2l3 3 5.4-6', 'stroke-width': 1.9 }]
    ],
    'link': [
      ['path', { d: 'M9.4 14.6l5.2-5.2' }],
      ['path', { d: 'M11.8 7.2l1.8-1.8a3.8 3.8 0 0 1 5.4 5.4l-1.8 1.8' }],
      ['path', { d: 'M12.2 16.8l-1.8 1.8a3.8 3.8 0 0 1-5.4-5.4l1.8-1.8' }]
    ],

    /* ---- 음성 ---- */
    'speaker': [
      ['path', { d: 'M4 9.4h3.6L12 5.4v13.2L7.6 14.6H4z' }],
      ['path', { d: 'M15.4 9.2a4.4 4.4 0 0 1 0 5.6' }],
      ['path', { d: 'M18 6.6a8 8 0 0 1 0 10.8' }]
    ],
    /* 🆕 2026-11-11 재생 중인 음성 버튼 — 누르면 그만 듣는다 */
    'stop': [
      ['rect', { x: 6.5, y: 6.5, width: 11, height: 11, rx: 1.5 }]
    ],
    'speaker-off': [
      ['path', { d: 'M4 9.4h3.6L12 5.4v13.2L7.6 14.6H4z' }],
      ['path', { d: 'M16 9.6l5 4.8M21 9.6l-5 4.8', 'stroke-width': 1.9 }]
    ],
    'mic': [
      ['rect', { x: 9, y: 2.8, width: 6, height: 10.6, rx: 3 }],
      ['path', { d: 'M5.6 11.6a6.4 6.4 0 0 0 12.8 0' }],
      ['path', { d: 'M12 18v3.2' }],
      ['path', { d: 'M8.6 21.2h6.8' }]
    ],

    /* ---- 조작 버튼 ---- */
    'pencil': [
      ['path', { d: 'M16.4 3.4l4.2 4.2L9.4 18.8 4.9 20l1.2-4.5z' }],
      ['path', { d: 'M14.4 5.4l4.2 4.2' }]
    ],
    'trash': [
      ['path', { d: 'M4.2 7h15.6' }],
      ['path', { d: 'M9.2 7V4.6h5.6V7' }],
      ['path', { d: 'M6.2 7l1 13.4h9.6L17.8 7' }],
      ['path', { d: 'M10.4 11v5.8M13.6 11v5.8' }]
    ],
    'printer': [
      ['path', { d: 'M7 8.4V3.4h10v5' }],
      ['rect', { x: 3.4, y: 8.4, width: 17.2, height: 8, rx: 2.2 }],
      ['path', { d: 'M7 14h10v6.6H7z' }]
    ],
    'save': [
      ['path', { d: 'M4.6 4.6h11.2l4.2 4.2v11.2H4.6z' }],
      ['path', { d: 'M8.2 4.6v5h7v-5' }],
      ['rect', { x: 8.2, y: 13, width: 7.6, height: 7 }]
    ],
    'send': [
      ['path', { d: 'M3.2 12L20.8 4.2l-7.8 17.6-2.4-7.4z' }],
      ['path', { d: 'M10.6 14.4L20.8 4.2' }]
    ],

    /* ---- 그 밖 ---- */
    'glasses': [
      ['path', { d: 'M3.4 10.4h17.2' }],
      ['path', { d: 'M4 10.4l1 5.6h5l1-4h2l1 4h5l1-5.6' }]
    ],
    'wifi-off': [
      ['path', { d: 'M3 3.4l18 18' }],
      ['path', { d: 'M8.6 15a5 5 0 0 1 5.6-.9' }],
      ['path', { d: 'M5.6 11.4a10 10 0 0 1 11.8-1.6' }],
      ['circle', { cx: 12, cy: 18.6, r: 1.05, fill: 'currentColor', stroke: 'none' }]
    ],
    'barrier': [
      ['rect', { x: 3, y: 8.4, width: 18, height: 7, rx: 1.2 }],
      ['path', { d: 'M7.2 8.4l-4 7M13.2 8.4l-4 7M19.2 8.4l-4 7' }],
      ['path', { d: 'M5 15.4v5.6M19 15.4v5.6' }]
    ],
    'helmet': [
      ['path', { d: 'M4.4 15.6a7.6 7.6 0 0 1 15.2 0' }],
      ['path', { d: 'M9.2 8.6V5.8a1 1 0 0 1 1-1h3.6a1 1 0 0 1 1 1v2.8' }],
      ['path', { d: 'M2.6 15.6h18.8' }],
      ['path', { d: 'M6.2 19.2h11.6' }]
    ],
    'tools': [
      ['path', { d: 'M3.4 20.6l6.2-6.2' }],
      ['path', { d: 'M13.6 3.4l3 3-3 3-3-3z' }],
      ['path', { d: 'M15.4 8.2l5.2 5.2-2.2 2.2-5.2-5.2' }],
      ['path', { d: 'M8 4.2l3 3-2 2-3-3z' }]
    ],
    'qr': [
      ['rect', { x: 3.4, y: 3.4, width: 6.4, height: 6.4, rx: 1 }],
      ['rect', { x: 14.2, y: 3.4, width: 6.4, height: 6.4, rx: 1 }],
      ['rect', { x: 3.4, y: 14.2, width: 6.4, height: 6.4, rx: 1 }],
      ['path', { d: 'M14.2 14.2h3v3h-3zM17.6 17.6h3v3h-3z' }]
    ],
    'clock': [
      ['circle', { cx: 12, cy: 12, r: 8.4 }],
      ['path', { d: 'M12 7.2V12l3.4 2.2' }]
    ]
  };

  /* 저장돼 있거나 HTML 에 박혀 있는 이모지 → 아이콘 이름.

     ★ 이 표에 없는 값은 건드리지 않는다. 담당자가 직접 넣은 글자가
       조용히 사라지면 안 된다.

     ★ 이모지를 코드포인트로 적는다. 편집기와 셸을 거치면서 이모지 글자가
       깨질 수 있는데, 그러면 표가 조용히 안 맞게 된다. */
  var C = String.fromCharCode;
  var EMOJI = {};
  function map(cp, name) { EMOJI[cp > 0xFFFF ? surrogate(cp) : C(cp)] = name; }
  function surrogate(cp) {
    var v = cp - 0x10000;
    return C(0xD800 + (v >> 10)) + C(0xDC00 + (v & 0x3FF));
  }

  /* 노동자 하단 탭 */
  map(0x1F3E0, 'home');          /* 집 */
  map(0x1F3A7, 'headphones');    /* 헤드폰 */
  map(0x1F4F7, 'camera');        /* 사진기 */
  map(0x1F4AC, 'chat');          /* 말풍선 */
  map(0x1F64B, 'person');        /* 손 든 사람 */
  /* 관리자 상단 메뉴 */
  map(0x1F4CA, 'chart');         /* 막대 그래프 */
  map(0x1F3ED, 'factory');       /* 공장 */
  map(0x1F4DD, 'doc-edit');      /* 메모 */
  map(0x1F4C4, 'file');          /* 문서 */
  map(0x1F50D, 'search');        /* 돋보기 */
  /* 상태 */
  map(0x2713, 'check');          /* 체크 */
  map(0x2714, 'check');
  map(0x25CF, 'dot');            /* 찬 원 */
  map(0x25CB, 'circle');         /* 빈 원 */
  map(0x26A0, 'alert');          /* 경고 삼각형 */
  map(0x2705, 'check-circle');   /* 초록 체크 */
  map(0x1F501, 'repeat');        /* 다시 */
  map(0x1F4CB, 'clipboard');     /* 클립보드 */
  /* 위험유형 */
  map(0x2699, 'gear');           /* 톱니 — 끼임 */
  map(0x26A1, 'bolt');           /* 번개 — 감전 */
  map(0x1F525, 'flame');         /* 불 — 화재 */
  map(0x1FA9C, 'ladder');        /* 사다리 — 추락 */
  map(0x1F637, 'mask');          /* 마스크 — 질식 */
  map(0x1F9EA, 'flask');         /* 시험관 — 화학물질 */
  /* 설비·공정 후보 */
  map(0x1F527, 'wrench');
  map(0x1F529, 'nut');
  map(0x1F9EF, 'extinguisher');
  map(0x1F4E6, 'box');
  map(0x1F69C, 'tractor');
  /* 문항 3유형 */
  map(0x1F446, 'touch');         /* 위험 지점 짚기 */
  map(0x2611, 'checkbox');       /* 올바른 작업 고르기 */
  map(0x1F517, 'link');          /* 보호구 연결하기 */
  /* 음성 */
  map(0x1F50A, 'speaker');
  map(0x1F507, 'speaker-off');
  map(0x1F3A4, 'mic');
  /* 조작 버튼 */
  map(0x270F, 'pencil');
  map(0x1F5D1, 'trash');
  map(0x1F5A8, 'printer');
  map(0x1F4BE, 'save');
  map(0x270B, 'send');           /* 이대로 알리기 */
  /* 그 밖 */
  map(0x1F576, 'glasses');       /* 이름 감추기 */
  map(0x1F4F4, 'wifi-off');      /* 오프라인 */
  map(0x1F6A7, 'barrier');       /* 준비 중 */
  map(0x1F477, 'helmet');        /* 노동자 */
  map(0x1F6E0, 'tools');         /* 담당자 */

  /* 값이 아이콘 이름인지, 이모지인지, 그 밖인지 판정한다.
     돌려주는 것은 아이콘 이름이거나 빈 문자열이다. */
  function nameOf(value) {
    if (value == null) return '';
    var v = String(value);
    if (SHAPES[v]) return v;                              // 이름으로 부른 경우
    if (EMOJI[v]) return EMOJI[v];                        // 이모지 하나
    var VS = new RegExp('[' + C(0xFE0E) + C(0xFE0F) + ']', 'g');
    var bare = v.replace(VS, '').trim();          // 뒤에 붙는 변형 선택자
    if (SHAPES[bare]) return bare;
    if (EMOJI[bare]) return EMOJI[bare];
    return '';
  }

  function has(name) { return !!SHAPES[String(name)]; }

  /* svg 하나 만들기. 크기는 CSS 가 정한다 (1em) — 이모지가 있던 자리의
     font-size 를 그대로 따라가서 화면마다 크기를 다시 잡을 일이 없다. */
  function svg(name) {
    var shape = SHAPES[String(name)];
    if (!shape) return null;

    var node = document.createElementNS(NS, 'svg');
    node.setAttribute('viewBox', '0 0 24 24');
    node.setAttribute('class', 'icon');
    node.setAttribute('data-icon', name);          // 검사와 디버깅이 이걸 본다
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', 'currentColor');
    node.setAttribute('stroke-width', '1.7');
    node.setAttribute('stroke-linecap', 'round');
    node.setAttribute('stroke-linejoin', 'round');
    node.setAttribute('aria-hidden', 'true');      // 뜻은 옆 글자가 나른다
    node.setAttribute('focusable', 'false');

    for (var i = 0; i < shape.length; i++) {
      var tag = shape[i][0];
      var attrs = shape[i][1];
      var child = document.createElementNS(NS, tag);
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          child.setAttribute(k, String(attrs[k]));
        }
      }
      node.appendChild(child);
    }
    return node;
  }

  /* 화면에 넣을 노드 하나.
     ★ 아이콘이 없으면 글자를 그대로 돌려준다 — 조용히 사라지지 않는다. */
  function node(value) {
    var name = nameOf(value);
    if (name) {
      var s = svg(name);
      if (s) return s;
    }
    return document.createTextNode(value == null ? '' : String(value));
  }

  /* 이미 화면에 박혀 있는 이모지를 바꿔 끼운다.
     HTML 에 이모지를 그대로 남겨 두는 이유는 JS 가 멈췄을 때의 대비책이다.

     ★ 글자가 이모지 하나뿐인 칸만 바꾼다. 문장 속 이모지를 건드리면
       그 문장이 잘린다. */
  function upgrade(root) {
    var scope = root || document;
    if (!scope.querySelectorAll) return scope;
    /* ★ 아이콘 자리로 쓰이는 칸을 전부 훑는다.
       aria-hidden="true" 인 span 은 "뜻은 옆 글자가 나르고 이건 그림" 이라는
       표시라서, 그 안에 이모지 하나만 있으면 아이콘 자리로 본다. */
    var boxes = scope.querySelectorAll(
      '.ico, .pict, .icon-slot, span[aria-hidden="true"]');
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      if (box.querySelector && box.querySelector('svg')) continue;   // 이미 바꾼 칸
      var name = nameOf(box.textContent.trim());
      if (!name) continue;
      var s = svg(name);
      if (!s) continue;
      box.textContent = '';
      box.appendChild(s);
    }
    return scope;
  }

  return {
    node: node, svg: svg, has: has, nameOf: nameOf, upgrade: upgrade,
    NAMES: Object.keys(SHAPES), EMOJI: EMOJI
  };
})();
