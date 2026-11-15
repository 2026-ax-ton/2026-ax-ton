/* ===================================================================
   seed.js — 예시 데이터

   ★ 이 파일이 없으면 네 명이 병렬로 개발할 수 없다.

     노동자 팀의 기능3·4 는 관리자 팀의 기능2 가 만든 교육을 읽는다.
     기능2 가 아직 없으면 노동자 팀은 화면에 띄울 것이 없어 손을 못 댄다.
     그래서 8개 키를 전부 그럴듯한 값으로 미리 채워 둔다.

     자기 담당 화면을 만들 때는 상대 팀 화면이 없어도
     여기 데이터를 읽어서 개발하면 된다.

   ★ id 는 손으로 적은 고정값이다.
     courses 가 equipments 를 가리키고 progress 가 courses 를 가리키므로,
     매번 새 id 가 나오면 서로 연결이 끊긴다.

   발표 시연 준비에도 그대로 쓴다. 로그인 화면의 "예시 데이터 채우기" 버튼이 부른다.
   =================================================================== */

var Seed = (function () {
  'use strict';

  /* 시연 계정 3개. 비밀번호는 전부 1234 — 화면에도 그대로 적어 둔다.
     서버가 없어 어차피 평문이고, 감춘 척하는 게 더 나쁘다. */
  var ACCOUNTS = [
    { userId: 'W-4821-07', pw: '1234', role: 'worker',
      name: '', title: '', siteName: '대성정밀', lang: 'km', processId: 'p-press' },
    { userId: 'W-4821-11', pw: '1234', role: 'worker',
      name: '', title: '', siteName: '대성정밀', lang: 'id', processId: 'p-paint' },
    /* 베트남어 · 아직 아무것도 안 들은 사람.
       ★ '글자를 한 자도 안 읽고 끝까지' 를 확인하려면 백지에서 시작하는
         사람이 있어야 한다. 07·11 은 이미 기록이 있어서 그 확인이 안 된다. */
    { userId: 'W-4821-03', pw: '1234', role: 'worker',
      name: '', title: '', siteName: '대성정밀', lang: 'vi', processId: 'p-assembly' },
    /* 한국인 노동자.
       ★ 한국어도 노동자의 언어 중 하나다. 음성이 없을 때 한국어로 되돌리던
         것을 그만두면서(voiceFallback), 한국어는 "되돌림" 이 아니라 "그 사람의
         언어" 로만 나와야 한다는 규칙이 생겼다. 그것을 확인하려면 한국어를
         쓰는 노동자가 필요하다 — UI.voiceSilent() 가 한국어에는 늘 거짓이다.

       ★ 조립에 둔 이유 — 조립을 겨냥한 교육이 아직 없다. 프레스에 두면
         프레스 교육의 대상 인원과 대시보드 조치 목록이 함께 바뀌어,
         이 계정과 상관없는 시연 숫자가 흔들린다. 이 계정의 용도는
         노동자 화면 확인이라 관리자 쪽에 안 나와도 된다. */
    { userId: 'W-4821-31', pw: '1234', role: 'worker',
      name: '', title: '', siteName: '대성정밀', lang: 'ko', processId: 'p-assembly' },
    { userId: 'kim@daesung.co.kr', pw: '1234', role: 'admin',
      name: '김현수', title: '현장 관리자 · 생산팀장', siteName: '대성정밀', lang: '', processId: '' },
    { userId: 'oper@safety.kr', pw: '1234', role: 'operator',
      name: '이수진', title: '시스템 운영자 (내부)', siteName: '', lang: '', processId: '' }
  ];

  var SETUP = {
    site: { name: '대성정밀', sizeBand: '10~49인' },
    languages: ['km', 'id', 'vi'],
    processes: [
      { id: 'p-press',    name: '프레스', icon: '⚙' },
      { id: 'p-paint',    name: '도장',   icon: '🔥' },
      { id: 'p-assembly', name: '조립',   icon: '🔧' }
    ],
    equipments: [
      /* kind — 설비 종류 id (Store.EQUIPMENT_KINDS). 문구·공식 문서·AI 조사가 이 값으로 이어진다 (2026-11-11) */
      { id: 'e-press3', processId: 'p-press', name: '프레스 3호기', kind: 'press',
        icon: '⚙', hazards: ['pinch', 'shock'], note: '' },
      { id: 'e-booth1', processId: 'p-paint', name: '도장 부스 1', kind: 'paint',
        icon: '🔥', hazards: ['fire', 'chemical', 'choke'], note: '' },
      { id: 'e-panel',  processId: 'p-press', name: '배전반 A', kind: 'electric',
        icon: '⚡', hazards: ['shock'], note: '' }
    ],
    workers: [
      { id: 'W-4821-07', lang: 'km', processId: 'p-press' },
      { id: 'W-4821-11', lang: 'id', processId: 'p-paint' },
      { id: 'W-4821-03', lang: 'vi', processId: 'p-assembly' },
      { id: 'W-4821-31', lang: 'ko', processId: 'p-assembly' }
    ]
  };

  /* 안전 문구 라이브러리.
     back 은 역번역 — 번역문을 다시 한국어로 돌린 것이다.
     ph-3 은 부정이 뒤집혀 정반대 지시가 된 경우로, 사람 검수자가 잡아야 하는 장면이다. */
  var LIBRARY = [
    { id: 'ph-1', category: '프레스', status: 'reviewed',
      ko: '프레스가 멈춰도 손을 넣지 마십시오',
      translations: {
        km: { text: 'កុំដាក់ដៃចូល', back: '프레스가 멈춰도 손을 넣지 마십시오' },
        id: { text: 'Jangan masukkan tangan', back: '손을 넣지 마십시오' },
        vi: { text: 'Không cho tay vào', back: '손을 넣지 마십시오' }
      } },
    { id: 'ph-2', category: '프레스', status: 'reviewed',
      ko: '작업 전 전원을 차단하십시오',
      translations: {
        km: { text: 'កាត់ចរន្តអគ្គិសនី', back: '작업 전 전원을 차단하십시오' },
        id: { text: 'Matikan daya sebelum bekerja', back: '작업 전 전원을 끄십시오' },
        vi: { text: 'Tắt nguồn trước khi làm việc', back: '작업 전 전원을 끄십시오' }
      } },
    /* ★ ph-3 은 인도네시아어 번역만 뜻이 뒤집혔다 ("넣지 마십시오" → "넣어도 됩니다").
         그래서 인도네시아어만 중지하고 한국어 원문과 크메르어는 계속 쓴다.
         문구 전체를 내리면 크메르어 노동자도 이 안전 지시를 못 듣는다 —
         그것은 오역보다 나은 상태가 아니다.
         flags[].lang 이 어느 언어의 신고인지를 남긴다. */
    { id: 'ph-3', category: '프레스', status: 'reviewed',
      ko: '프레스가 멈춰도 손을 넣지 마십시오',
      translations: {
        km: { text: 'ទោះម៉ាស៊ីនឈប់ ក៏កុំដាក់ដៃចូល',
              back: '프레스가 멈춰도 손을 넣지 마십시오', status: 'reviewed' },
        id: { text: 'Jika mesin mati, boleh masukkan tangan',
              back: '프레스가 꺼지면 손을 넣어도 됩니다', status: 'stopped' }
      },
      flags: [
        { note: '인도네시아어 번역이 정반대입니다. 손을 넣어도 된다고 읽힙니다.',
          lang: 'id', at: '2026-08-12T02:10:00.000Z', resolvedAt: null }
      ] },
    { id: 'ph-4', category: '도장', status: 'reviewed',
      ko: '도장 작업 시 방독마스크를 착용하십시오',
      translations: {
        km: { text: 'ពាក់ម៉ាស់ការពារឧស្ម័ន', back: '방독마스크를 착용하십시오' },
        id: { text: 'Kenakan masker gas', back: '방독마스크를 착용하십시오' }
      } },
    { id: 'ph-5', category: '도장', status: 'waiting',
      ko: '환기팬이 돌지 않으면 작업을 시작하지 마십시오',
      translations: {
        id: { text: 'Jangan mulai jika kipas mati', back: '팬이 꺼져 있으면 시작하지 마십시오' }
      } },
    { id: 'ph-6', category: '공통', status: 'reviewed',
      ko: '비상정지 버튼은 설비 오른쪽 아래에 있습니다',
      translations: {
        km: { text: 'ប៊ូតុងបញ្ឈប់សង្គ្រោះបន្ទាន់', back: '비상정지 버튼은 설비 오른쪽 아래에 있습니다' },
        vi: { text: 'Nút dừng khẩn cấp ở phía dưới bên phải', back: '비상정지 버튼은 오른쪽 아래에 있습니다' }
      } },
    /* ph-7~9 — C형(갭) 유압프레스 전용 조사 결과. 아직 번역도 사람 검수도 안 됐다 (status: waiting).
         출처: KOSHA CODE M-30-2002 「프레스 방호장치의 선정·설치 및 사용 기술지침」§5.1·§6.5·§7.2
         (가드 측방·상방·하방 금지, 가드 재전환 확인) +
         ADH Machine Tool "Types of Press Machines" (C형 프레임은 편심하중 시 벌어짐·비틀림이
         O형/H형보다 심하다는 구조적 특성, https://www.adhmt.com/types-of-press-machines-drive-frame-and-application-guide/) +
         고용노동부 정책자료실 2004 협착 사망사례(서울, 재생업체, 근로자 2명,
         https://www.moel.go.kr/policy/policydata/view.do?bbs_seq=4842) — 영세사업장 실사례로 확인.
         대상 설비 예시: 남양기공 C형 유압프레스 NCP-20/NCP-30 (제조사 홈페이지는 인증서
         오류로 직접 확인 못함 — 모델명은 참고용, 구조 유형 확정만 신뢰). */
    { id: 'ph-7', category: '프레스', status: 'waiting',
      ko: '덮개(가드) 옆이나 아래로 손을 넣지 마십시오',
      translations: {} },
    { id: 'ph-8', category: '프레스', status: 'waiting',
      ko: '소재는 작업판(테이블) 가운데에 놓고 누르십시오. 한쪽으로 치우쳐 놓지 마십시오',
      translations: {} },
    { id: 'ph-9', category: '프레스', status: 'waiting',
      ko: '덮개를 열고 임시로 조작했다면, 다시 작업을 시작하기 전에 덮개를 제자리로 돌려놓으십시오',
      translations: {} },
    /* ph-10~12 — 유압프레스 전용(기계식엔 없는 위험). 아직 번역도 사람 검수도 안 됐다 (status: waiting).
         출처: 기계설비신문 "유압프레스의 특성과 안전관리의 핵심 수칙" (노정진, 2026.04.06)
         http://www.kmecnews.co.kr/news/articleView.html?idxno=46338
         — C형 유압프레스를 "가장 일반적인 형태"로 명시. 배관·호스 누유, 금형 미고정·과압에
         따른 파편 비산, 안전장치(양수조작·광전자식) 임의해제를 사고 원인으로 지적. */
    { id: 'ph-10', category: '프레스', status: 'waiting',
      ko: '작업 전 유압호스와 배관에서 기름이 새는지 확인하십시오',
      translations: {} },
    { id: 'ph-11', category: '프레스', status: 'waiting',
      ko: '금형을 제대로 고정하지 않았거나 정해진 압력을 넘겨서 누르지 마십시오',
      translations: {} },
    { id: 'ph-12', category: '프레스', status: 'waiting',
      ko: '양손 버튼이나 안전장치를 임의로 풀거나 가리지 마십시오',
      translations: {} },
    /* ph-13~15 — 사출성형기(두 번째 기계, 다른 종류) 조사 결과. 아직 번역도 사람 검수도 안 됐다
         (status: waiting). 같은 조사 방법을 그대로 반복한 것 — docs/devlog/c형프레스-조사-방법.md 참고.
         출처: 안전보건공단 근로자용 OPS "사출성형기 작업안전" (2023-교육혁신실-859, 고용노동부·
         안전보건공단 공동 제작) — 실제 PDF를 직접 열어 확인함.
         https://esafetykorea.or.kr/js/smarteditor2-2.8.2.3/files/20240228090646_170907880643465de79166a246_Name=%5B2023-%EA%B5%90%EC%9C%A1%ED%98%81%EC%8B%A0%EC%8B%A4-859%5D%20%5B2023-%EA%B5%90%EC%9C%A1%ED%98%81%EC%8B%A0%EC%8B%A4-859%5D%20%EC%82%AC%EC%B6%9C%EC%84%B1%ED%98%95%EA%B8%B0_OPS_%EA%B7%BC%EB%A1%9C%EC%9E%90.pdf
         법적 근거(KOSHA Guide M-187-2016 「사출성형기 방호조치에 관한 기술지침」,
         산업안전보건기준에관한규칙 §121)는 게시글 본문으로 존재만 확인, 첨부 PDF 자체는
         다운로드 실패(세션 필요 추정) — 본문 인용은 전부 OPS 쪽에서 가져왔다. */
    { id: 'ph-13', category: '사출성형', status: 'waiting',
      ko: '제품을 꺼낼 때 금형 사이로 손을 넣지 마십시오',
      translations: {} },
    { id: 'ph-14', category: '사출성형', status: 'waiting',
      ko: '안전문의 연동장치(리미트 스위치)를 임의로 무효화하지 마십시오',
      translations: {} },
    { id: 'ph-15', category: '사출성형', status: 'waiting',
      ko: '점검·수리·이물질 제거 작업 전에는 전원을 차단하고 잠금장치와 "작업중" 표시를 하십시오',
      translations: {} }
  ];

  /* 교육 콘텐츠.
     quiz 의 type 세 가지는 발표 대본의 검증 방식을 그대로 옮긴 것이다.
       hotspot — 설비 그림에서 위험 지점 짚기
       choice  — 올바른 작업 고르기
       match   — 보호구 연결하기
     문항은 음성으로 읽어 주므로 글자를 한 자도 읽지 않고 끝낼 수 있어야 한다.

     ★ results 와 why 는 "그 선택이 실제로 어떤 사고가 되는지" 를 적는 자리다.
       맞고 틀림만 알려 주면 다음에 또 같은 선택을 한다.
       results 는 선택지 순서와 같은 길이로 맞춘다. 없으면 기능4 가 일반 문장으로 넘긴다.
       기능2(관리자 콘텐츠 생성)가 앞으로 이 문장을 함께 만들어야 한다.

     ★ i18n 은 문항을 노동자의 언어로 읽는 자리다. 한국어 필드는 그대로 남고
       그 언어에 없는 필드만 한국어로 내려간다. 읽을 때는 Store.qtext() 를 쓴다 —
       answer 가 options 의 인덱스라서 번역 배열의 길이가 다르면 정답이 어긋난다. */
  var COURSES = [
    { id: 'c-press', title: '프레스 3호기 안전교육', equipmentId: 'e-press3',
      languages: ['km', 'id', 'vi'], phraseIds: ['ph-1', 'ph-2', 'ph-3', 'ph-6'],
      approved: true, createdAt: '2026-08-01T02:00:00.000Z',
      /* 프레스만 기한이 있고 도장 부스는 없다 — 대시보드 한 화면에서
         D-day 와 "기한 미정" 이 함께 보여야 기한이 선택이라는 것이 드러난다. */
      dueAt: '2026-10-15',
      quiz: [
        { id: 'q1', type: 'hotspot', hazard: 'pinch',
          prompt: '이 설비에서 손이 끼일 수 있는 곳을 누르세요',
          answer: { x: 52, y: 44, r: 14 },
          i18n: {
            km: { prompt: 'សូមចុចកន្លែងដែលដៃអាចជាប់ក្នុងម៉ាស៊ីននេះ' },
            id: { prompt: 'Tekan bagian yang dapat menjepit tangan pada mesin ini' },
            vi: { prompt: 'Hãy chạm vào chỗ có thể kẹp tay trên máy này' }
          } },
        { id: 'q2', type: 'choice', hazard: 'pinch',
          prompt: '프레스가 멈췄습니다. 어떻게 해야 합니까?',
          options: ['손을 넣어 부품을 꺼낸다', '전원을 차단하고 관리자를 부른다', '발로 눌러 본다'],
          answer: 1,
          results: [
            '멈춘 것처럼 보여도 남아 있는 압력으로 램이 떨어집니다. 손이 끼입니다.',
            '맞습니다. 전원을 차단하고 관리자를 부르면 램이 떨어지지 않습니다.',
            '발로 눌러 보는 동안 램이 내려오면 발이 끼입니다.'
          ],
          i18n: {
            km: {
              prompt: 'ម៉ាស៊ីនកិនបានឈប់។ តើគួរធ្វើអ្វី?',
              options: [
                'ដាក់ដៃចូលដើម្បីយកគ្រឿងបន្លាស់',
                'កាត់ចរន្តអគ្គិសនី ហើយហៅអ្នកគ្រប់គ្រង',
                'ជាន់ដោយជើងសាកល្បង'
              ],
              results: [
                'ទោះបីមើលទៅដូចជាឈប់ក៏ដោយ សម្ពាធនៅសល់អាចធ្វើឲ្យដុំដែកធ្លាក់។ ដៃនឹងជាប់។',
                'ត្រឹមត្រូវ។ កាត់ចរន្តអគ្គិសនី ហើយហៅអ្នកគ្រប់គ្រង ដុំដែកនឹងមិនធ្លាក់ទេ។',
                'ពេលជាន់ដោយជើង ដុំដែកអាចធ្លាក់មកលើជើង។'
              ]
            },
            id: {
              prompt: 'Mesin press berhenti. Apa yang harus dilakukan?',
              options: [
                'Masukkan tangan untuk mengambil komponen',
                'Matikan daya dan panggil pengawas',
                'Coba tekan dengan kaki'
              ],
              results: [
                'Meski terlihat berhenti, tekanan yang tersisa dapat menjatuhkan ram. Tangan terjepit.',
                'Benar. Matikan daya dan panggil pengawas, ram tidak akan jatuh.',
                'Jika ram turun saat Anda menekan dengan kaki, kaki terjepit.'
              ]
            },
            vi: {
              prompt: 'Máy dập đã dừng. Bạn phải làm gì?',
              options: [
                'Cho tay vào để lấy linh kiện',
                'Ngắt điện và gọi quản lý',
                'Thử đạp bằng chân'
              ],
              results: [
                'Dù trông như đã dừng, áp lực còn lại có thể làm đầu dập rơi xuống. Tay sẽ bị kẹp.',
                'Đúng. Ngắt điện và gọi quản lý thì đầu dập không rơi xuống.',
                'Nếu đầu dập hạ xuống khi bạn đạp thử, chân sẽ bị kẹp.'
              ]
            }
          } },
        /* 2026-11-11 — 예전에는 q3 번역을 일부러 비워 「번역 준비 중」 배지와 한국어를 보였다.
             이제는 한국어를 섞지 않고 막으므로(quiz.js ready) 시연 교육은 세 언어를 다 채운다 */
        { id: 'q3', type: 'match', hazard: 'shock',
          prompt: '작업에 맞는 보호구를 연결하세요',
          pairs: [['프레스 작업', '안전장갑'], ['배전반 점검', '절연장갑']],
          why: '작업마다 맞는 보호구가 다릅니다. 배전반 점검에 일반 안전장갑을 끼면 감전을 막지 못합니다.',
          i18n: {
            km: { prompt: 'ភ្ជាប់ឧបករណ៍ការពារដែលត្រូវនឹងការងារ',
              pairs: [['ការងារម៉ាស៊ីនកិន', 'ស្រោមដៃសុវត្ថិភាព'], ['ការត្រួតពិនិត្យតាប្លូអគ្គិសនី', 'ស្រោមដៃអ៊ីសូឡង់']],
              why: 'ការងារនីមួយៗត្រូវការឧបករណ៍ការពារខុសគ្នា។ ស្រោមដៃសុវត្ថិភាពធម្មតាមិនអាចការពារការឆក់ខ្សែភ្លើងពេលត្រួតពិនិត្យតាប្លូអគ្គិសនីបានទេ។' },
            id: { prompt: 'Hubungkan alat pelindung yang sesuai dengan pekerjaan',
              pairs: [['Pekerjaan mesin press', 'Sarung tangan keselamatan'], ['Pemeriksaan panel listrik', 'Sarung tangan isolasi']],
              why: 'Setiap pekerjaan butuh alat pelindung yang berbeda. Sarung tangan keselamatan biasa tidak mencegah sengatan listrik saat memeriksa panel listrik.' },
            vi: { prompt: 'Nối đồ bảo hộ phù hợp với công việc',
              pairs: [['Công việc máy dập', 'Găng tay bảo hộ'], ['Kiểm tra tủ điện', 'Găng tay cách điện']],
              why: 'Mỗi công việc cần đồ bảo hộ khác nhau. Găng tay bảo hộ thường không ngăn được điện giật khi kiểm tra tủ điện.' }
          } }
      ] },
    /* 2026-11-11 — 프레스 문구 ph-3 이 도장 교육에 섞여 있었다. 설비 종류가 다른 문구는 넣지 않는다 */
    { id: 'c-paint', title: '도장 부스 1 안전교육', equipmentId: 'e-booth1',
      languages: ['id'], phraseIds: ['ph-4', 'ph-6'],
      approved: true, createdAt: '2026-08-03T01:00:00.000Z',
      quiz: [
        { id: 'q1', type: 'choice', hazard: 'fire',
          prompt: '도장 작업 중 불이 났습니다. 먼저 무엇을 합니까?',
          options: ['물을 뿌린다', '환기팬을 끄고 대피한다', '창문을 연다'],
          answer: 1,
          results: [
            '도료에 붙은 불에 물을 뿌리면 불이 퍼집니다.',
            '맞습니다. 환기팬을 끄면 유증기가 덕트로 번지지 않습니다. 끄고 바로 대피합니다.',
            '창문을 열면 바람이 들어와 불이 커집니다.'
          ],
          i18n: {
            id: {
              prompt: 'Terjadi kebakaran saat pengecatan. Apa yang dilakukan lebih dulu?',
              options: [
                'Menyiram dengan air',
                'Matikan kipas ventilasi lalu mengungsi',
                'Membuka jendela'
              ],
              results: [
                'Menyiram air pada api cat membuat api menyebar.',
                'Benar. Mematikan kipas mencegah uap cat menyebar ke saluran. Matikan lalu segera keluar.',
                'Membuka jendela membuat angin masuk dan api membesar.'
              ]
            }
          } },
        { id: 'q2', type: 'hotspot', hazard: 'chemical',
          prompt: '방독마스크를 써야 하는 구역을 누르세요',
          answer: { x: 38, y: 60, r: 16 },
          i18n: {
            id: { prompt: 'Tekan area yang wajib memakai masker gas' }
          } }
      ] }
  ];

  /* 수강·검증 이력.
     W-4821-11 은 화재 대응에서 미통과 — 담당자 대시보드의 "이해도 취약 항목"이 여기서 나온다.
     미통과는 노동자의 실패가 아니라 교육의 실패로 기록한다 (SCREEN 기능4).

     ★ attempt · firstPassed 는 기능4 가 함께 남기는 값이다.
       다시 풀면 최신 결과가 앞 결과를 덮으므로, 그것만 남기면
       담당자 대시보드의 "최초 통과율"(목표 70~85%)을 계산할 근거가 사라진다.
       기존 네 필드(score · passed · answers · at)는 그대로라
       이 값을 읽지 않는 화면은 영향받지 않는다. */
  var PROGRESS = [
    { workerId: 'W-4821-07', courseId: 'c-press', lang: 'km',
      learnedAt: '2026-08-10T01:20:00.000Z',
      quiz: { score: 100, passed: true, answers: [1, 1, 1], at: '2026-08-10T01:32:00.000Z',
              attempt: 1, firstPassed: true } },
    { workerId: 'W-4821-11', courseId: 'c-paint', lang: 'id',
      learnedAt: '2026-08-11T05:10:00.000Z',
      quiz: { score: 50, passed: false, answers: [0, 1], at: '2026-08-11T05:24:00.000Z',
              attempt: 1, firstPassed: false } },
    { workerId: 'W-4821-03', courseId: 'c-press', lang: 'vi',
      learnedAt: null, quiz: null }
  ];

  /* 위험요소 신고 — 신고자 식별 정보가 없다. 익명이 기본이다 (PRD §9.2). */
  var REPORTS = [
    { id: 'r-1', processId: 'p-press', equipmentId: 'e-press3', hazard: 'pinch',
      memo: '덮개가 흔들려서 손이 들어갈 틈이 생겼습니다.',
      status: 'urgent', createdAt: '2026-08-09T00:30:00.000Z' },
    { id: 'r-2', processId: 'p-paint', equipmentId: 'e-booth1', hazard: 'choke',
      memo: '환기팬 소음과 진동이 심합니다.',
      status: 'received', createdAt: '2026-08-13T07:15:00.000Z' }
  ];


  /* 재교육 지시 (D2) — W-4821-11 은 도장 교육을 50점으로 통과하지 못했다.

     ★ 지시는 "이 사람이 못했다" 가 아니라 "이 교육을 다시 듣게 한다" 는 뜻이다.
       그래서 note 도 사람이 아니라 내용을 가리킨다.
     ★ 해소 여부는 여기 적지 않는다 — 지시를 내린 뒤 그 교육을 통과했는지를
       progress 로 판정한다. 진실이 두 곳이면 언젠가 어긋난다. */
  var ORDERS = [
    { id: 'or-1', workerId: 'W-4821-11', courseId: 'c-paint',
      note: '환기팬이 멈췄을 때 무엇을 하는지 부분을 다시 들어 주세요.',
      at: '2026-08-12T00:30:00.000Z', by: 'kim@daesung.co.kr', canceledAt: null }
  ];
  var POSTS = [
    { id: 'po-1', title: '프레스 교대 시간 바뀐 것 맞나요?', body: '오늘부터 30분 당겨진다고 들었습니다.',
      author: 'W-4821-07', anonymous: false, createdAt: '2026-08-14T02:00:00.000Z',
      comments: [{ author: 'kim@daesung.co.kr', body: '맞습니다. 다음 주까지만입니다.', createdAt: '2026-08-14T02:40:00.000Z' }] },
    { id: 'po-2', title: '도장실 마스크 어디서 받나요', body: '',
      author: '', anonymous: true, createdAt: '2026-08-15T23:10:00.000Z', comments: [] }
  ];

  /* 지금 저장된 것을 덮어쓰고 예시 데이터를 넣는다.
     세션은 건드리지 않는다 — 채우자마자 로그인이 풀리면 당황스럽다. */
  function fill() {
    Store.accounts.save(ACCOUNTS);
    Store.setup.save(SETUP);
    Store.library.save(LIBRARY);
    Store.courses.save(COURSES);
    Store.progress.save(PROGRESS);
    Store.reports.save(REPORTS);
    Store.posts.save(POSTS);
    Store.orders.save(ORDERS);

    /* ★ prefs(글자 크기)는 건드리지 않는다.
       예시 데이터를 채운다고 저시력 사용자가 키워 놓은 글자가 원래대로
       돌아가면, 그 사람은 화면을 다시 못 읽는다. 기기 설정은 예시가 아니다. */
    return true;
  }

  /* 계정이 하나도 없을 때만 채운다.
     처음 여는 사람이 빈 화면에서 막히지 않게 하되, 쓰던 데이터는 건드리지 않는다. */
  function fillIfEmpty() {
    if (Store.accounts.load().length) return false;
    return fill();
  }

  return { fill: fill, fillIfEmpty: fillIfEmpty, ACCOUNTS: ACCOUNTS };
})();
