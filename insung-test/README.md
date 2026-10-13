# 인성 등급판정소

소고기 등급판정 제도를 그대로 가져와 밥상머리 인성을 판정하는 SNS 공유형 테스트. 서버 없이 정적 파일만으로 동작합니다.

## 구조

```
insung-test/
  index.html          첫 화면 + 테스트 (엔진 로드)
  app.js              엔진. 문항·채점·판정 연출·결과 카드·공유·광고·측정
  app.css             화면 스타일
  config.js           배포 설정 (주소, GAS, GA4, 카카오 키, 광고 슬롯, 쿠팡, 통계)
  packs/insung-v1.js  콘텐츠팩 (문항·항목·결과·문구). 시즌판은 이 파일을 복사해 만듭니다
  build.js            결과 페이지 40장 + 결과 카드 PNG 40장 생성
  r/                  결과 페이지 (build.js pages 가 생성). 카톡 미리보기·광고 지면
  assets/             캐릭터 이미지, 히어로, 카드 PNG (build.js cards 가 생성)
  plan.html           기획서
```

엔진과 콘텐츠가 분리되어 있어서, 시즌판(송년회 편 등)은 `packs/` 에 파일 하나를 추가하고 `config.js` 의 `PACK` 만 바꾸면 됩니다.

## 에셋 넣기

`assets/` 에 아래 파일을 둡니다 (PNG, 투명 배경 권장).

| 파일 | 내용 |
|---|---|
| char-yangji.png · char-udun.png · char-ansim.png · char-deungsim.png · char-satae.png · char-galbi.png · char-chadol.png · char-salchi.png | 부위 캐릭터 8종 (1:1) |
| judge.png | 판정사 (1:1). 중간 메모·판정 연출에 사용 |
| hero.png | 첫 화면 (4:3) |

없으면 자리를 비워 둔 채 동작합니다.

## 배포 순서

1. `config.js` 의 `BASE_URL` 을 실제 주소로 바꿉니다 (예: `https://insung.tastyulsan.kr`). 끝에 슬래시 없이.
2. `node build.js pages` → `r/` 에 결과 페이지 40장이 생깁니다. OG 태그에 BASE_URL 이 들어갑니다.
3. `npm i playwright && npx playwright install chromium` 후 `node build.js cards` → `assets/cards/` 에 결과 카드 PNG, `assets/og-default.png` 가 생깁니다. 규칙상 나올 수 없는 조합 6개(살치살 1+ 이하, 갈비·차돌박이 1++)는 건너뜁니다.
4. 폴더 전체를 정적 호스팅에 올립니다. **고래 퍼널(Netlify)과 다른 호스팅**을 권합니다. Netlify 신규 무료 플랜은 크레딧이 떨어지면 팀의 모든 사이트가 멈춥니다. Cloudflare Pages 무료 플랜 권장.
5. 카카오 디벨로퍼스에서 JavaScript 키 발급, 플랫폼 > Web 에 도메인 등록 → `config.js` 의 `KAKAO_JS_KEY`.
6. GA4 측정 ID → `GA4_ID`. 이벤트: quiz_start, question_answer(q_index), quiz_complete(grade, type, seconds), share(method, item_id), vote(choice).
7. (선택) Google Apps Script 웹앱 → `GAS_URL`. 받는 JSON: `{action:"complete"|"vote"|"share", pack, ...}`. 시트에 appendRow 하는 doPost 하나면 됩니다.
8. 광고: 카카오 애드핏 광고단위 ID → `ADS.*.unit`, `provider: "adfit"`. AdSense 승인 후 `adsense_client` 와 슬롯 ID. 쿠팡 파트너스 위젯 ID → `COUPANG.widgets.<부위>`.
9. 출시 1주 뒤 집계로 `STATS` 를 채우면 첫 화면 참여자 수와 결과 카드 희소성 %가 켜집니다.

## 실기기 점검 (배포 전 필수)

카카오톡·인스타그램 인앱 브라우저 × iOS·Android 에서:
- 결과 카드 이미지 길게 눌러 저장이 되는지
- 카톡 공유 미리보기에 결과별 카드가 뜨는지 (이미지 교체 시 파일명을 바꿔야 캐시가 풀립니다)
- 하단 공유 바가 인앱 브라우저 하단 바와 겹치지 않는지
- AdSense 앵커 광고를 켤 경우 상단 고정으로 설정 (하단은 공유 바와 겹침)

## 등급 변환표 재보정

`packs/insung-v1.js` 의 `map` (항목 합계 0~8 → No.1~9) 이 등급 분포를 정합니다. 출시 1주 로그의 등급 분포가 목표(1++ 15% · 1+ 25% · 1등급 30% · 2등급 20% · 3등급 10%)와 다르면 이 배열만 조정합니다.
