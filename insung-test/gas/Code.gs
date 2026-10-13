/* 인성 등급판정소 — 집계용 Google Apps Script
   1. 새 스프레드시트 → 확장 프로그램 → Apps Script → 이 코드 붙여넣기
   2. 배포 → 새 배포 → 유형: 웹 앱, 실행: 나, 액세스: 모든 사용자 → 배포 → URL 복사
   3. config.js 의 GAS_URL 에 붙여넣기
   코드 수정 후에는 "배포 관리 → 버전 업데이트"로 같은 URL 유지
   받는 JSON: { action: "complete"|"vote"|"share", pack, ... } */
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents || "{}");
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var name = { complete: "complete", vote: "vote", share: "share" }[d.action] || "etc";
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(["time", "pack", "grade", "type", "serial", "cuts", "trust", "choice", "method"]);
    sh.appendRow([new Date(), d.pack || "", d.grade || "", d.type || "", d.serial || "", d.cuts || "", d.trust == null ? "" : d.trust, d.choice || "", d.method || ""]);
  } catch (err) {}
  return ContentService.createTextOutput("ok");
}

/* 집계: 등급·부위 분포 → config.js 의 STATS 에 넣을 값. 스크립트 편집기에서 실행 후 로그 확인 */
function stats() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("complete");
  if (!sh) return Logger.log("no data");
  var rows = sh.getDataRange().getValues().slice(1), total = rows.length, g = {}, t = {};
  rows.forEach(function (r) { g[r[2]] = (g[r[2]] || 0) + 1; t[r[3]] = (t[r[3]] || 0) + 1; });
  Object.keys(g).forEach(function (k) { g[k] = Math.round(g[k] / total * 1000) / 1000; });
  Logger.log(JSON.stringify({ total: total, grades: g, types: t }));
}
