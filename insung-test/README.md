# 인성 손절 테스트

친구들이 아직 널 안 버린 이유. 11가지 일상 상황에 답하면 손절 위험도(%), 친구들이 참아주는 이유, 손절 사유가 나오는 SNS 공유형 테스트. 서버 없이 정적 파일만으로 동작합니다.

## 구조

```
insung-test/
  index.html          첫 화면 + 테스트 (엔진 로드)
  app.js              엔진. 문항·채점·계산 연출·결과·이미지 카드·공유·광고·측정
  app.css             화면 스타일 (흰 바탕, 큰 글씨, 둥근 카드, 하단 고정 버튼)
  config.js           배포 설정 (주소, GAS, GA4, 카카오 키, 광고 슬롯, 쿠팡, 통계)
  packs/sonjeol-v1.js 콘텐츠팩 (문항·항목·유형·문구). 시즌판은 이 파일을 복사해 만듭니다
  build.js            결과 페이지 + 결과 카드 PNG 생성
  r/                  결과 페이지 32장 (유형 8 × 위험도 구간 4). 카톡 미리보기·광고 지면
  assets/             캐릭터 이미지, 히어로, 카드 PNG (build.js cards 가 생성)
  gas/Code.gs         집계 스크립트
  plan.html           기획서
```

엔진과 콘텐츠가 분리되어 있어서, 시즌판(송년회 편 등)은 `packs/` 에 파일 하나를 추가하고 `config.js` 의 `PACK` 만 바꾸면 됩니다.

## 결과 구조

- **손절 위험도** 0~100%. 점수 문항 10개 합계(0~40)로 계산. `packs` 의 `risk` 로 조정
- **구간** safe(안전) · ok(아직 괜찮음) · warn(주의) · danger(위험)
- **유형 8** 다 챙기는 사람 · 거짓말 못 하는 사람 · 뒤끝 없는 사람 · 눈치 빠른 사람 · 약속 지키는 사람 · 말에 가시 있는 사람 · 빨리 친해지는 사람 · 손절 사유 없는 사람. 제목은 강점, 빨간 부제는 가장 낮은 항목에서 자동 생성
- **그래도 참아주는 이유 / 손절 사유** 고른 답에 붙은 친구들 증언 문장. 이게 공유 문구의 재료
- **답변 일관성** 1번과 11번이 3점 이상 다르면 "낮음"

## 에셋 넣기

`assets/` 에 아래 파일을 둡니다 (PNG, 투명 배경 권장). 없으면 자리를 비워 둔 채 동작합니다.

| 파일 | 내용 |
|---|---|
| type-care.png · type-honest.png · type-calm.png · type-sense.png · type-keeper.png · type-cactus.png · type-fast.png · type-halo.png | 유형 캐릭터 8종 (1:1) |
| mood-safe.png · mood-warn.png · mood-danger.png | 위험도 구간 표정 3종. 중간 메모·계산 연출에 사용 |
| hero.png | 첫 화면 (4:3) |

## 배포 순서

1. `config.js` 의 `BASE_URL` 을 실제 주소로 바꿉니다. 끝에 슬래시 없이.
2. `node build.js pages` → `r/` 에 결과 페이지가 생깁니다. OG 태그에 BASE_URL 이 들어갑니다.
3. `npm i playwright && npx playwright install chromium` 후 `node build.js cards` → `assets/cards/` 에 결과 카드 PNG, `assets/og-default.png` 가 생깁니다. '손절 사유 없는 사람'은 안전 구간에서만 나오므로 그 외 조합 3개는 건너뜁니다.
4. 폴더 전체를 정적 호스팅에 올립니다. **고래 퍼널(Netlify)과 다른 호스팅**을 권합니다. Netlify 신규 무료 플랜은 크레딧이 떨어지면 팀의 모든 사이트가 멈춥니다. Cloudflare Pages 무료 플랜 권장.
5. 카카오 디벨로퍼스에서 JavaScript 키 발급, 플랫폼 > Web 에 도메인 등록 → `KAKAO_JS_KEY`.
6. GA4 측정 ID → `GA4_ID`. 이벤트: quiz_start, question_answer(q_index), quiz_complete(risk, band, type, seconds), share(method, item_id), vote(choice).
7. (선택) Google Apps Script 웹앱 → `GAS_URL`. `gas/Code.gs` 를 시트에 붙여넣고 웹앱으로 배포. 받는 JSON: `{action:"complete"|"vote"|"share", pack, ...}`.
8. 광고: 카카오 애드핏 광고단위 ID → `ADS.*.unit`, `provider: "adfit"`. AdSense 승인 후 `adsense_client` 와 슬롯 ID. 쿠팡 파트너스 위젯 ID → `COUPANG.widgets.<유형>`.
9. 출시 1주 뒤 집계(`gas/Code.gs` 의 `stats()`)로 `STATS` 를 채우면 첫 화면 참여자 수, 결과의 "n%가 같은 구간", 투표 비율이 켜집니다.

## 실기기 점검 (배포 전 필수)

카카오톡·인스타그램 인앱 브라우저 × iOS·Android 에서:
- 결과 이미지 길게 눌러 저장이 되는지
- 카톡 공유 미리보기에 결과별 카드가 뜨는지 (이미지 교체 시 파일명을 바꿔야 캐시가 풀립니다)
- 하단 고정 바가 인앱 브라우저 하단 바와 겹치지 않는지
- AdSense 앵커 광고를 켤 경우 상단 고정으로 설정 (하단은 공유 바와 겹침)

## 위험도 분포 재보정

`packs/sonjeol-v1.js` 의 `risk: { base, per, min, max }` 와 `bands[].max` 가 분포를 정합니다. 출시 1주 로그에서 '위험' 구간이 너무 많거나 적으면 이 값만 조정합니다. 목표: 안전 15% · 아직 괜찮음 40% · 주의 30% · 위험 15%.
