/* ============================================================
   인성 손절 테스트 — 배포 설정
   이 파일만 고치면 배포 환경이 바뀝니다. 콘텐츠는 packs/ 에 있습니다.
   ============================================================ */
window.INSUNG_CONFIG = {
  /* 사이트 주소 (끝에 슬래시 없이). 결과 페이지 링크·OG·공유에 사용 */
  BASE_URL: "https://insung.example.com",

  /* 현재 활성 콘텐츠팩. 시즌판은 packs/ 에 파일을 추가하고 여기만 바꿉니다 */
  PACK: "sonjeol-v1",

  /* Google Apps Script 웹앱 URL. 비우면 로깅·투표 집계를 보내지 않습니다
     action: "complete" (등급·부위·판정번호) / "vote" (선택) / "share" (방식) */
  GAS_URL: "",

  /* GA4 측정 ID (G-XXXXXXXXXX). 비우면 gtag를 로드하지 않습니다 */
  GA4_ID: "",

  /* 카카오 JavaScript 키. 비우면 카톡 공유 버튼이 '링크 복사'로 대체됩니다 */
  KAKAO_JS_KEY: "",

  /* 광고 슬롯. provider: "adfit" | "adsense" | "none"
     unit은 애드핏 광고단위 ID 또는 애드센스 data-ad-slot.
     문항 화면·판정 연출 화면에는 슬롯이 없습니다 (정책: 콘텐츠 없는 화면, 버튼 인접 금지) */
  ADS: {
    intro_bottom: { provider: "none", unit: "", width: 320, height: 100 },
    result_mid:   { provider: "none", unit: "", width: 320, height: 100 },
    result_bottom:{ provider: "none", unit: "", width: 320, height: 250 },
    /* AdSense 자동광고(앵커·비네트)는 승인 후 ca-pub ID를 넣으면 로드됩니다 */
    adsense_client: ""
  },

  /* 쿠팡 파트너스 위젯. 유형 키별로 위젯 ID를 넣습니다 (예: 사과할 때 주는 선물 큐레이션).
     비어 있는 유형은 위젯을 숨깁니다. 고지 문구는 위젯 바로 위에 자동 표시 */
  COUPANG: {
    enabled: false,
    tracking: "",
    widgets: { care: "", honest: "", calm: "", sense: "", keeper: "", cactus: "", fast: "", halo: "" }
  },

  /* 희소성·투표 표시. 출시 1주 뒤 실집계로 채웁니다. 비어 있으면 표시하지 않습니다.
     예: { total: 48210, grades: { safe: 0.18, ok: 0.41, warn: 0.29, danger: 0.12 }, vote: { read: 0.63, unread: 0.37 } } */
  STATS: null,

  /* 2차 기능: 친구가 대신 판정 (GAS에 "peer" action 추가 후 true) */
  PEER_ENABLED: false,

  /* 결과 아래 '다른 테스트' 목록 */
  MORE_TESTS: [
    { title: "고래 MBTI", desc: "나와 닮은 고래는?", url: "https://tastyulsan.netlify.app" },
    { title: "송년회 손절 테스트", desc: "12월 오픈 예정", url: "", soon: true }
  ],

  /* 제작 크레딧 (카드 하단) */
  CREDIT: "제작 맛있는울산"
};
