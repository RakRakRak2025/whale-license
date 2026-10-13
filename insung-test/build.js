#!/usr/bin/env node
/* ============================================================
   빌드 스크립트
   node build.js pages   → r/<type>-<grade>.html 결과 페이지 생성 (Node만 필요)
   node build.js cards   → assets/cards/<type>-<grade>.png + assets/og-default.png 렌더 (Playwright 필요)
   node build.js         → 둘 다
   배포 전 config.js 의 BASE_URL 을 실제 주소로 바꾼 뒤 실행합니다.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = __dirname;
const mode = process.argv[2] || "all";

/* config.js / packs/*.js 는 브라우저 전역에 쓰는 파일이라 가짜 window로 읽습니다 */
function loadGlobals() {
  const win = {};
  const ctx = vm.createContext({ window: win });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "config.js"), "utf8"), ctx);
  const CFG = win.INSUNG_CONFIG;
  vm.runInContext(fs.readFileSync(path.join(ROOT, "packs", CFG.PACK + ".js"), "utf8"), ctx);
  return { CFG, P: win.INSUNG_PACKS[CFG.PACK] };
}
const { CFG, P } = loadGlobals();
const BASE = (CFG.BASE_URL || "").replace(/\/$/, "");
const GRADES = ["1++", "1+", "1", "2", "3"];
const gslug = (g) => g.replace(/\+/g, "p");
const glabel = (g) => (g.indexOf("+") > -1 ? g : g + "등급");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));

/* ── 결과 페이지 ── */
function buildPages() {
  const tpl = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  fs.mkdirSync(path.join(ROOT, "r"), { recursive: true });
  let n = 0;
  for (const type of P.typeOrder) {
    for (const g of GRADES) {
      const t = P.types[type], slug = `${type}-${gslug(g)}`;
      const url = `${BASE}/r/${slug}.html`;
      const title = `나 인성 ${glabel(g)} ${t.name} 나옴 | ${P.title}`;
      const desc = `${t.tag}. ${P.grades.text[g]} 너는 몇 등급?`;
      const img = `${BASE}/assets/cards/${slug}.png`;
      let html = tpl
        .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
        .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
        .replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${esc(title)}$2`)
        .replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
        .replace(/(<meta property="og:image" content=")[^"]*(">)/, `$1${esc(img)}$2`)
        .replace(/(<meta property="og:image:width" content=")[^"]*(">)/, `$11080$2`)
        .replace(/(<meta property="og:image:height" content=")[^"]*(">)/, `$11920$2`)
        .replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${esc(url)}$2`)
        .replace(/href="app\.css"/, 'href="../app.css"')
        .replace(/src="config\.js"/, 'src="../config.js"')
        .replace(/src="app\.js"/, 'src="../app.js"')
        .replace(/<body>/, `<body data-root="../" data-result="${slug}">`);
      fs.writeFileSync(path.join(ROOT, "r", `${slug}.html`), html);
      n++;
    }
  }
  /* index.html 의 OG도 BASE_URL 기준으로 맞춤 */
  const idx = tpl
    .replace(/(<meta property="og:image" content=")[^"]*(">)/, `$1${esc(BASE + "/assets/og-default.png")}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${esc(BASE + "/")}$2`);
  if (idx !== tpl) fs.writeFileSync(path.join(ROOT, "index.html"), idx);
  console.log(`pages: ${n} result pages → r/`);
}

/* ── 카드 PNG ── */
async function buildCards() {
  let chromium;
  try { ({ chromium } = require("playwright")); }
  catch (e) {
    try { ({ chromium } = require(path.join(process.env.NODE_TOOLS || "", "node_modules/playwright"))); }
    catch (e2) { console.error("playwright 가 필요합니다: npm i playwright && npx playwright install chromium"); process.exit(1); }
  }
  fs.mkdirSync(path.join(ROOT, "assets", "cards"), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 480, height: 900 }, deviceScaleFactor: 1 });
  const fileUrl = "file://" + path.join(ROOT, "index.html");
  await page.goto(fileUrl, { waitUntil: "load" });
  await page.waitForFunction(() => window.INSUNG && window.INSUNG.pack());

  /* 각 (부위, 등급) 조합을 만드는 답변 조합을 찾습니다. 규칙상 불가능한 조합은 건너뜁니다 */
  const reps = await page.evaluate((GRADES) => {
    /* 점수 문항 전부를 전수 탐색 (4^10). 신뢰도 문항은 1번과 같은 점수의 선택지로 맞춰 '양호'가 나오게 함 */
    const P = window.INSUNG.pack(), out = {}, qs = P.questions;
    const scoreIdx = qs.map((q, i) => (q.ax === "chk" ? -1 : i)).filter((i) => i >= 0);
    const chkIdx = qs.map((q, i) => (q.ax === "chk" ? i : -1)).filter((i) => i >= 0);
    const total = Math.pow(4, scoreIdx.length), want = P.typeOrder.length * GRADES.length;
    for (let n = 0; n < total; n++) {
      const picks = new Array(qs.length).fill(0);
      let m = n; scoreIdx.forEach((qi) => { picks[qi] = m % 4; m = Math.floor(m / 4); });
      chkIdx.forEach((ci) => { const base = qs[qs[ci].chkOf || 0]; const p = base.o[picks[qs[ci].chkOf || 0]].p; let best = 0; qs[ci].o.forEach((o, oi) => { if (Math.abs(o.p - p) < Math.abs(qs[ci].o[best].p - p)) best = oi; }); picks[ci] = best; });
      const r = window.INSUNG.judge(picks);
      const key = r.type + "-" + window.INSUNG.gslug(r.grade);
      if (!out[key]) { out[key] = r.code; if (Object.keys(out).length >= want) break; }
    }
    return out;
  }, GRADES);

  const made = [], skipped = [];
  for (const type of P.typeOrder) {
    for (const g of GRADES) {
      const slug = `${type}-${gslug(g)}`;
      if (!reps[slug]) { skipped.push(slug); continue; }
      await page.goto(`${fileUrl}?a=${reps[slug]}&card=1`, { waitUntil: "load" });
      await page.waitForSelector('body[data-card-ready="1"]', { timeout: 20000 });
      const dataUrl = await page.evaluate(() => window.__card);
      fs.writeFileSync(path.join(ROOT, "assets", "cards", `${slug}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
      made.push(slug);
    }
  }
  /* 기본 OG 이미지 (1200×630): 종이 + 제목 + 히어로 */
  await page.goto(fileUrl, { waitUntil: "load" });
  const og = await page.evaluate(async ({ title, sub }) => {
    await (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve());
    const c = document.createElement("canvas"); c.width = 1200; c.height = 630; const x = c.getContext("2d");
    x.fillStyle = "#FFFDF7"; x.fillRect(0, 0, 1200, 630);
    x.strokeStyle = "#1E1C19"; x.lineWidth = 3; x.strokeRect(30, 30, 1140, 570);
    x.strokeStyle = "#E3DFD6"; x.lineWidth = 2; x.strokeRect(42, 42, 1116, 546);
    const im = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = "assets/hero.png"; });
    if (im) { const h = 520, w = im.width * h / im.height; x.drawImage(im, 1200 - w - 60, 55, w, h); }
    x.fillStyle = "#6A655C"; x.font = '600 26px "IBM Plex Sans KR", sans-serif'; x.fillText(sub, 80, 170);
    x.fillStyle = "#1E1C19"; x.font = '800 72px "Nanum Myeongjo", serif'; x.fillText("당신의 인성,", 80, 270); x.fillText("몇 등급입니까?", 80, 360);
    x.font = '400 28px "IBM Plex Sans KR", sans-serif'; x.fillText("소고기 등급판정 기준 그대로 · 11문항 · 2분", 80, 430);
    x.save(); x.translate(240, 520); x.rotate(-12 * Math.PI / 180);
    x.strokeStyle = "#B3261E"; x.lineWidth = 6; x.beginPath(); x.arc(0, 0, 62, 0, Math.PI * 2); x.stroke();
    x.fillStyle = "#B3261E"; x.textAlign = "center"; x.font = '800 44px "Nanum Myeongjo", serif'; x.fillText("1++", 0, 16); x.restore();
    x.fillStyle = "#1E1C19"; x.font = '800 30px "Nanum Myeongjo", serif'; x.fillText(title, 340, 530);
    return c.toDataURL("image/png");
  }, { title: P.title, sub: P.subtitle });
  fs.writeFileSync(path.join(ROOT, "assets", "og-default.png"), Buffer.from(og.split(",")[1], "base64"));
  await browser.close();
  console.log(`cards: ${made.length} rendered, ${skipped.length} impossible combos skipped (${skipped.join(", ")})`);
  fs.writeFileSync(path.join(ROOT, "assets", "cards", "_index.json"), JSON.stringify({ made, skipped, reps }, null, 2));
}

(async () => {
  if (mode === "pages" || mode === "all") buildPages();
  if (mode === "cards" || mode === "all") await buildCards();
})().catch((e) => { console.error(e); process.exit(1); });
