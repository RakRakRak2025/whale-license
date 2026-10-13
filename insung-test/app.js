/* ============================================================
   인성 손절 테스트 — 엔진
   콘텐츠는 packs/<PACK>.js, 배포 설정은 config.js. 이 파일은 둘 다 모른 채 동작합니다.
   화면: intro → quiz → (memo) → judging → result
   결과 페이지(r/*.html)는 body[data-result] + ?a=답변코드 로 같은 엔진을 재사용합니다.
   ============================================================ */
(function () {
  "use strict";

  var CFG = window.INSUNG_CONFIG || {};
  var ROOT = (document.body.getAttribute("data-root") || "");
  var PACK_ID = CFG.PACK || "sonjeol-v1";
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var UA = navigator.userAgent || "";
  var IN_APP = /KAKAOTALK|Instagram|FBAN|FBAV|NAVER\(inapp|Line\//i.test(UA);
  var IS_ANDROID = /Android/i.test(UA);
  var P = null;
  var state = { i: 0, picks: [], t0: 0 };

  /* ── 유틸 ── */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function fill(tpl, map) { return String(tpl).replace(/\{(\w+)\}/g, function (_, k) { return map[k] != null ? map[k] : ""; }); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, reduce ? Math.min(ms, 120) : ms); }); }
  function show(id) {
    ["intro", "quiz", "judging", "result"].forEach(function (k) { $(k).classList.toggle("on", k === id); });
    window.scrollTo(0, 0);
    $("sharebar").classList.toggle("on", id === "result");
  }
  function encode(picks) { return picks.join(""); }
  function decode(s) {
    if (!/^[0-3]+$/.test(s || "")) return null;
    var a = s.split("").map(Number);
    return a.length === P.questions.length ? a : null;
  }
  function serialOf(picks) {
    var h = 7; picks.forEach(function (p, i) { h = (h * 31 + p + 1 + i) % 1679616; });
    return h.toString(36).toUpperCase().padStart(4, "0");
  }
  function axisOf(k) { for (var i = 0; i < P.axes.length; i++) if (P.axes[i].k === k) return P.axes[i]; return null; }
  function bandOf(risk) { for (var i = 0; i < P.bands.length; i++) if (risk <= P.bands[i].max) return P.bands[i]; return P.bands[P.bands.length - 1]; }
  function bandByKey(key) { for (var i = 0; i < P.bands.length; i++) if (P.bands[i].key === key) return P.bands[i]; return null; }

  /* ── 측정 ── */
  function ga(name, params) { try { if (window.gtag) window.gtag("event", name, params || {}); } catch (e) {} }
  function log(payload) {
    if (!CFG.GAS_URL) return;
    payload.pack = PACK_ID;
    try { fetch(CFG.GAS_URL, { method: "POST", mode: "no-cors", body: JSON.stringify(payload) }).catch(function () {}); } catch (e) {}
  }
  function initGA() {
    if (!CFG.GA4_ID) return;
    var s = document.createElement("script"); s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + CFG.GA4_ID; document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date()); window.gtag("config", CFG.GA4_ID);
  }
  function initKakao() {
    if (!CFG.KAKAO_JS_KEY) return;
    var s = document.createElement("script"); s.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js"; s.async = true;
    s.onload = function () { try { if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(CFG.KAKAO_JS_KEY); } catch (e) {} };
    document.head.appendChild(s);
  }

  /* ── 채점 ── */
  function judge(picks) {
    var s = {}, total = 0, chk = null, chkOf = 0, goods = [], bads = [];
    P.axes.forEach(function (a) { s[a.k] = 0; });
    picks.forEach(function (oi, qi) {
      var q = P.questions[qi], o = q.o[oi];
      if (q.ax === "chk") { chk = o.p; chkOf = q.chkOf || 0; return; }
      s[q.ax] += o.p; total += o.p;
      if (o.good && o.p >= 3) goods.push({ p: o.p, q: qi, text: o.good });
      if (o.bad && o.p <= 1) bads.push({ p: o.p, q: qi, text: o.bad });
    });
    var minS = 9, minK = null;
    P.axes.forEach(function (a) { if (s[a.k] < minS) { minS = s[a.k]; minK = a.k; } });
    var risk = Math.round(Math.max(P.risk.min, Math.min(P.risk.max, P.risk.base - total * P.risk.per)));
    var type = null;
    for (var r = 0; r < P.rules.length && !type; r++) { if (P.rules[r].test(s, total, minS)) type = P.rules[r].type; }
    if (!type) {
      var mx = Math.max.apply(null, P.axes.map(function (a) { return s[a.k]; }));
      var tied = P.axes.filter(function (a) { return s[a.k] === mx; }).map(function (a) { return a.k; });
      var seed = picks.reduce(function (acc, p, i) { return acc + p * (i + 1); }, 0);
      type = P.topByAxis[tied[seed % tied.length]];
    }
    var weakAxis = minS <= P.weakMax ? minK : null;
    var weakLine = weakAxis ? axisOf(weakAxis).low : P.noWeak;
    goods.sort(function (a, b) { return b.p - a.p || a.q - b.q; });
    bads.sort(function (a, b) { return a.p - b.p || a.q - b.q; });
    var trust = null;
    if (chk !== null) { var base = P.questions[chkOf].o[picks[chkOf]].p; trust = Math.abs(base - chk) >= P.trust.diff ? P.trust.bad : P.trust.ok; }
    return { picks: picks, code: encode(picks), serial: serialOf(picks), s: s, total: total, risk: risk, band: bandOf(risk), type: type,
      weakAxis: weakAxis, weakLine: weakLine, reasons: goods.slice(0, 3), cuts: bads.slice(0, 3), trust: trust };
  }
  function reasonText(res) { return res.cuts.length ? res.cuts[0].text.replace(/\.$/, "") : P.share.reasonNone; }
  function resultUrl(res, method) {
    var base = (CFG.BASE_URL || "").replace(/\/$/, "");
    var u = base + "/r/" + res.type + "-" + res.band.key + ".html" + (res.code ? "?a=" + res.code : "");
    if (method) u += (res.code ? "&" : "?") + "utm_source=" + method + "&utm_medium=share&utm_campaign=" + PACK_ID + "&utm_content=" + res.type;
    return u;
  }
  function shareMap(res, method) {
    var t = P.types[res.type];
    return { risk: res.risk, type: t.name, reason: reasonText(res), url: resultUrl(res, method), best: P.types[t.best].name };
  }

  /* ── 광고 ── */
  var adfitLoaded = false, adsenseLoaded = false;
  function mountAd(key, host) {
    var slot = (CFG.ADS || {})[key];
    if (!slot || slot.provider === "none" || !slot.unit) { host.classList.add("empty"); return; }
    host.style.setProperty("--ad-h", slot.height + "px");
    var box = host.querySelector(".ad-box");
    if (slot.provider === "adfit") {
      var ins = document.createElement("ins");
      ins.className = "kakao_ad_area"; ins.style.display = "none";
      ins.setAttribute("data-ad-unit", slot.unit); ins.setAttribute("data-ad-width", slot.width); ins.setAttribute("data-ad-height", slot.height);
      box.appendChild(ins);
      if (!adfitLoaded) { adfitLoaded = true; var s = document.createElement("script"); s.async = true; s.src = "//t1.daumcdn.net/kas/static/ba.min.js"; document.body.appendChild(s); }
    } else if (slot.provider === "adsense" && CFG.ADS.adsense_client) {
      if (!adsenseLoaded) { adsenseLoaded = true; var g = document.createElement("script"); g.async = true; g.crossOrigin = "anonymous"; g.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + CFG.ADS.adsense_client; document.head.appendChild(g); }
      var ad = document.createElement("ins");
      ad.className = "adsbygoogle"; ad.style.display = "block"; ad.style.width = "100%";
      ad.setAttribute("data-ad-client", CFG.ADS.adsense_client); ad.setAttribute("data-ad-slot", slot.unit); ad.setAttribute("data-ad-format", "auto"); ad.setAttribute("data-full-width-responsive", "true");
      box.appendChild(ad);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    } else { host.classList.add("empty"); }
  }
  function adHtml(key) { return '<div class="ad" data-ad="' + key + '"><span class="ad-label">' + esc(P.ui.adLabel) + '</span><div class="ad-box"></div></div>'; }
  function mountAds(root) { Array.prototype.forEach.call(root.querySelectorAll("[data-ad]"), function (el) { mountAd(el.getAttribute("data-ad"), el); }); }

  /* ── 첫 화면 ── */
  function renderIntro() {
    var I = P.intro, el = $("intro");
    var count = (CFG.STATS && CFG.STATS.total) ? '<p class="count">' + esc(fill(I.countLabel, { n: CFG.STATS.total.toLocaleString("ko-KR") })) + "</p>" : "";
    el.innerHTML =
      '<div class="hero" id="hero"><img src="' + ROOT + esc(I.hero) + '" alt="" onerror="this.parentNode.classList.add(\'empty\')"></div>' +
      '<p class="eyebrow">' + esc(P.title) + "</p>" +
      "<h1>" + I.headline.map(esc).join("<br>") + "</h1>" +
      '<p class="muted">' + esc(I.lead) + "</p>" +
      '<ul class="intro-bullets">' + I.bullets.map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("") + "</ul>" + count +
      '<button class="btn primary" id="startBtn" type="button">' + esc(I.cta) + "</button>" +
      '<p class="small muted">' + esc(I.disclaimer) + "</p>" +
      adHtml("intro_bottom") +
      '<div class="spacer"></div>' +
      "<footer><span>" + esc(CFG.CREDIT || "") + "</span></footer>";
    mountAds(el);
    $("startBtn").addEventListener("click", function () {
      state = { i: 0, picks: [], t0: Date.now() };
      ga("quiz_start", { pack: PACK_ID });
      show("quiz"); renderQuestion();
    });
  }

  /* ── 문항 ── */
  function renderQuestion() {
    var i = state.i, q = P.questions[i], n = P.questions.length, el = $("quiz");
    var axName = q.ax === "chk" ? P.ui.trustLabel : axisOf(q.ax).name;
    el.innerHTML =
      '<div class="bar"><i id="pbar"></i></div>' +
      '<div class="q-meta"><span>' + esc(P.ui.qLabel) + " <b>" + (i + 1) + "</b> / " + n + '</span><span class="q-axis">' + esc(axName) + "</span></div>" +
      '<p class="q-text">' + esc(q.t) + "</p>" +
      '<div class="opts">' + q.o.map(function (o, oi) { return '<button class="btn" type="button" data-oi="' + oi + '">' + esc(o.x) + "</button>"; }).join("") + "</div>" +
      '<p class="toast" id="toast" role="status"></p>' +
      '<div class="q-foot">' + (i > 0 ? '<button class="link" type="button" id="backBtn">이전</button>' : "<span></span>") + "</div>";
    requestAnimationFrame(function () { $("pbar").style.width = (Math.pow(i / n, 0.6) * 100).toFixed(1) + "%"; });
    var busy = false;
    Array.prototype.forEach.call(el.querySelectorAll("[data-oi]"), function (b) {
      b.addEventListener("click", function () {
        if (busy) return; busy = true;
        var oi = +b.getAttribute("data-oi"), o = q.o[oi];
        Array.prototype.forEach.call(el.querySelectorAll("[data-oi]"), function (x) { x.classList.add(x === b ? "picked" : "dim"); });
        var t = $("toast"); t.textContent = o.r || ""; t.classList.add("on");
        if (navigator.vibrate && !reduce) { try { navigator.vibrate(8); } catch (e) {} }
        state.picks[i] = oi;
        ga("question_answer", { q_index: i + 1, option: oi });
        wait(o.r ? 700 : 260).then(function () {
          state.i = i + 1;
          if (P.midMemo && i === P.midMemo.after) return showMemo().then(next);
          next();
        });
      });
    });
    var back = $("backBtn");
    if (back) back.addEventListener("click", function () { state.i = i - 1; state.picks.length = state.i; renderQuestion(); });
    var first = el.querySelector("[data-oi]"); if (first) first.focus({ preventScroll: true });
    function next() { if (state.i < n) renderQuestion(); else finish(); }
  }
  function showMemo() {
    var hasCut = state.picks.some(function (oi, qi) { var q = P.questions[qi]; return q.ax !== "chk" && q.o[oi].p === 0; });
    var m = document.createElement("div"); m.className = "memo";
    m.innerHTML = '<img class="mood" src="' + ROOT + (hasCut ? "assets/mood-warn.png" : "assets/mood-safe.png") + '" alt="" onerror="this.remove()"><p>' + esc(hasCut ? P.midMemo.cut : P.midMemo.clean) + '</p><button class="link" type="button">계속</button>';
    $("app").appendChild(m);
    return new Promise(function (resolve) {
      var done = false; function go() { if (done) return; done = true; m.remove(); resolve(); }
      m.querySelector("button").addEventListener("click", go);
      m.addEventListener("click", go);
      setTimeout(go, 2400);
    });
  }
  function finish() {
    var res = judge(state.picks);
    ga("quiz_complete", { risk: res.risk, band: res.band.key, type: res.type, seconds: Math.round((Date.now() - state.t0) / 1000) });
    log({ action: "complete", grade: res.band.key, type: res.type, serial: res.serial, cuts: String(res.risk), trust: res.trust === P.trust.ok ? 1 : 0 });
    show("judging"); runJudging(res).then(function () { renderResult(res, { animate: true }); show("result"); });
  }

  /* ── 계산 연출: 숫자가 올라가다 멈춤 ── */
  function runJudging(res) {
    var el = $("judging");
    el.innerHTML = '<p class="jg-title" id="jgTitle">' + esc(P.ui.judging[0]) + '</p><p class="jg-num"><span id="jgNum">0</span><small>%</small></p><p class="jg-sub" id="jgSub"></p><img class="jg-mood" id="jgMood" alt="" hidden>';
    var titles = P.ui.judging, num = $("jgNum"), title = $("jgTitle");
    var dur = reduce ? 200 : 1900, start = null, target = res.risk;
    return new Promise(function (resolve) {
      function step(ts) {
        if (!start) start = ts;
        var p = Math.min(1, (ts - start) / dur), e = 1 - Math.pow(1 - p, 3);
        num.textContent = Math.round(target * e);
        var ti = Math.min(titles.length - 1, Math.floor(p * titles.length));
        title.textContent = titles[ti];
        if (p < 1) requestAnimationFrame(step); else resolve();
      }
      requestAnimationFrame(step);
    }).then(function () {
      num.textContent = target;
      title.textContent = P.ui.riskLabel;
      $("jgSub").textContent = res.band.label + " · " + res.band.line;
      var m = $("jgMood"); m.src = ROOT + res.band.mood; m.hidden = false; m.onerror = function () { m.hidden = true; };
      if (navigator.vibrate && !reduce) { try { navigator.vibrate([30, 40, 60]); } catch (e) {} }
      return wait(1300);
    });
  }

  /* ── 결과 ── */
  var currentRes = null, cardUrl = null;
  function axesHtml(res) {
    return '<div class="axes">' + P.axes.map(function (a) {
      var v = res.s[a.k], weak = res.weakAxis === a.k;
      return '<div class="ax' + (weak ? " weak" : "") + '"><span class="ax-name">' + esc(a.name) + '</span><span class="ax-bar"><i style="width:' + (v / 8 * 100).toFixed(0) + '%"></i></span><span class="ax-no num">' + v + "/8</span></div>";
    }).join("") + "</div>";
  }
  function renderResult(res, opts) {
    currentRes = res; cardUrl = null;
    var t = P.types[res.type], full = !!res.picks, el = $("result");
    var rarity = (CFG.STATS && CFG.STATS.grades && CFG.STATS.grades[res.band.key] != null) ? '<p class="rarity">' + esc(fill(P.ui.rarity, { pct: Math.round(CFG.STATS.grades[res.band.key] * 100) })) + "</p>" : "";
    var coupang = "";
    if (CFG.COUPANG && CFG.COUPANG.enabled && CFG.COUPANG.widgets && CFG.COUPANG.widgets[res.type]) {
      coupang = '<div class="card coupang"><h2>' + esc(P.ui.coupangTitle) + '</h2><p class="disclosure">' + esc(P.ui.coupangDisclosure) + "</p>" +
        '<iframe title="쿠팡 파트너스" src="https://ads-partners.coupang.com/widgets.html?id=' + encodeURIComponent(CFG.COUPANG.widgets[res.type]) + "&template=carousel&trackingCode=" + encodeURIComponent(CFG.COUPANG.tracking) + "&subId=" + encodeURIComponent(res.type) + '&width=100%25&height=140" height="140" scrolling="no" referrerpolicy="unsafe-url"></iframe></div>';
    }
    var more = (CFG.MORE_TESTS || []).map(function (m) {
      return m.soon || !m.url ? '<div class="soon"><b>' + esc(m.title) + "</b><span>" + esc(m.desc || P.ui.soon) + "</span></div>"
        : '<a href="' + esc(m.url) + '"><b>' + esc(m.title) + "</b><span>" + esc(m.desc || "") + "</span></a>";
    }).join("");
    var peer = (CFG.PEER_ENABLED && full) ? '<button class="btn ghost" type="button" id="peerBtn">' + esc(P.ui.peer) + "</button>" : "";
    var reasons = full && res.reasons.length ? '<div class="card"><h2>' + esc(P.ui.reasonsTitle) + '</h2><ul class="list good">' + res.reasons.map(function (r) { return "<li><span>" + esc(r.text) + "</span></li>"; }).join("") + "</ul></div>" : "";
    var cuts = full ? '<div class="card"><h2>' + esc(P.ui.cutsTitle) + "</h2>" + (res.cuts.length ? '<ul class="list bad">' + res.cuts.map(function (r) { return "<li><span>" + esc(r.text) + "</span></li>"; }).join("") + "</ul>" : '<p class="muted">' + esc(P.ui.cutsNone) + "</p>") + "</div>" : "";
    el.innerHTML =
      (!full ? '<button class="btn primary" type="button" id="meTooTop">' + esc(P.ui.meToo) + "</button>" : "") +
      '<div class="card res-top"><p class="eyebrow">' + esc(P.ui.riskLabel) + '</p><p class="res-risk"><b class="num">' + res.risk + '</b><span>%</span></p><span class="res-band ' + esc(res.band.key) + '">' + esc(res.band.label) + '</span><p class="res-line">' + esc(res.band.line) + "</p>" + rarity + "</div>" +
      '<div class="card"><div class="res-type"><div><p class="tl">' + esc(P.ui.typeLabel) + '</p><p class="tn">' + esc(t.name) + '</p><p class="tw">' + esc(res.weakLine || "") + '</p></div><img src="' + ROOT + esc(t.img) + '" alt="" onerror="this.classList.add(\'empty\')"></div><p class="res-desc">' + esc(t.desc) + "</p>" + (full && res.trust ? '<p class="trust">' + esc(P.ui.trust) + ": " + esc(res.trust) + "</p>" : "") + "</div>" +
      reasons + cuts +
      (full ? '<div class="card"><h2>' + esc(P.ui.axesTitle) + "</h2>" + axesHtml(res) + "</div>" : "") +
      '<div class="card"><div class="pair"><div><b>' + esc(P.ui.pairBest) + "</b><strong>" + esc(P.types[t.best].name) + "</strong><span>" + esc(t.bestWhy) + "</span></div><div><b>" + esc(P.ui.pairWorst) + "</b><strong>" + esc(P.types[t.worst].name) + "</strong><span>" + esc(t.worstWhy) + "</span></div></div>" +
      '<button class="btn ghost" type="button" id="pairBtn">' + esc(fill(P.share.pairCta, { best: P.types[t.best].name })) + "</button>" + peer + "</div>" +
      '<div class="card-img" id="cardImg"><img id="cardPng" alt="결과 이미지"><p class="hint">' + esc(P.ui.saveHint) + '</p><a class="btn ghost" id="cardDl" download="sonjeol-' + esc(res.type) + "-" + esc(res.band.key) + '.png" hidden>이미지 파일로 받기</a></div>' +
      (IN_APP ? '<div class="inapp" id="inapp"><span>' + esc(P.ui.inapp) + "</span>" + (IS_ANDROID ? '<a href="#" id="extBtn">다른 브라우저로 열기</a>' : "") + "</div>" : "") +
      coupang +
      adHtml("result_mid") +
      '<div class="card vote" id="vote"><p class="vote-q">' + esc(P.vote.q) + '</p><div class="btn-row">' + P.vote.options.map(function (o) { return '<button class="btn" type="button" data-v="' + esc(o.k) + '">' + esc(o.x) + "</button>"; }).join("") + '</div><p class="vote-out" id="voteOut"></p></div>' +
      '<div class="sec more"><h2>' + esc(P.ui.more) + "</h2>" + more + "</div>" +
      adHtml("result_bottom") +
      '<button class="btn quiet" type="button" id="againBtn">' + esc(P.ui.again) + "</button>" +
      "<footer><span>" + esc(P.intro.disclaimer) + "</span><span>" + esc(CFG.CREDIT || "") + "</span></footer>";
    mountAds(el);

    /* 하단 바 */
    var sb = $("sharebar-in");
    if (full) {
      var third = CFG.KAKAO_JS_KEY ? (navigator.share ? P.ui.native : P.ui.link) : (navigator.share ? P.ui.native : "");
      sb.innerHTML = '<button class="btn kakao" type="button" id="kakaoBtn">' + esc(CFG.KAKAO_JS_KEY ? P.ui.kakao : P.ui.link) + "</button>" +
        '<button class="btn" type="button" id="saveBtn">' + esc(P.ui.save) + "</button>" +
        (third ? '<button class="btn" type="button" id="moreShareBtn">' + esc(third) + "</button>" : "");
      $("kakaoBtn").addEventListener("click", function () { CFG.KAKAO_JS_KEY ? shareKakao(res) : copyLink(res, "link"); });
      $("saveBtn").addEventListener("click", function () { saveCard(res); });
      var ms = $("moreShareBtn"); if (ms) ms.addEventListener("click", function () { navigator.share ? shareNative(res) : copyLink(res, "link"); });
    } else {
      sb.innerHTML = '<button class="btn main" type="button" id="meTooBtn">' + esc(P.ui.meToo) + '</button><button class="btn" type="button" id="copyBtn2">' + esc(P.ui.link) + "</button>";
      $("meTooBtn").addEventListener("click", goHome);
      $("copyBtn2").addEventListener("click", function () { copyLink(res, "link"); });
      var top = $("meTooTop"); if (top) top.addEventListener("click", goHome);
    }
    $("pairBtn").addEventListener("click", function () { CFG.KAKAO_JS_KEY ? shareKakao(res, "pair") : copyLink(res, "pair"); });
    $("againBtn").addEventListener("click", goHome);
    var ext = $("extBtn"); if (ext) ext.addEventListener("click", function (e) { e.preventDefault(); openExternal(); });
    var peerBtn = $("peerBtn"); if (peerBtn) peerBtn.addEventListener("click", function () { copyLink(res, "peer"); });

    /* 투표 */
    var voted = null; try { voted = localStorage.getItem("insung:vote:" + PACK_ID); } catch (e) {}
    function showVote(k) {
      var pick = P.vote.options.filter(function (o) { return o.k === k; })[0];
      var stat = (CFG.STATS && CFG.STATS.vote && CFG.STATS.vote[k] != null) ? " 지금까지 " + Math.round(CFG.STATS.vote[k] * 100) + "%가 같은 선택." : " " + P.vote.after;
      $("voteOut").textContent = (pick ? pick.x : "") + " 선택." + stat;
      Array.prototype.forEach.call(el.querySelectorAll("[data-v]"), function (b) { b.classList.toggle("picked", b.getAttribute("data-v") === k); b.disabled = true; });
    }
    if (voted) showVote(voted);
    Array.prototype.forEach.call(el.querySelectorAll("[data-v]"), function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-v");
        try { localStorage.setItem("insung:vote:" + PACK_ID, k); } catch (e) {}
        ga("vote", { choice: k }); log({ action: "vote", choice: k }); showVote(k);
      });
    });

    if (full) renderCardImage(res);
  }
  function goHome() {
    var home = (ROOT ? ROOT : "./") + "index.html";
    if (document.body.hasAttribute("data-result")) { location.href = home; return; }
    history.replaceState(null, "", location.pathname);
    renderIntro(); show("intro");
  }

  /* ── 공유 ── */
  function shareKakao(res, variant) {
    var m = shareMap(res, "kakao");
    var img = (CFG.BASE_URL || "").replace(/\/$/, "") + "/assets/cards/" + res.type + "-" + res.band.key + ".png";
    try {
      window.Kakao.Share.sendDefault({
        objectType: "feed",
        content: { title: fill(P.share.kakaoTitle, m), description: fill(P.share.kakaoDesc, m), imageUrl: img, imageWidth: 1080, imageHeight: 1920, link: { mobileWebUrl: m.url, webUrl: m.url } },
        buttons: [{ title: P.ui.meToo, link: { mobileWebUrl: m.url, webUrl: m.url } }]
      });
      ga("share", { method: "kakao", item_id: res.type, variant: variant || "main" }); log({ action: "share", method: "kakao" });
    } catch (e) { copyLink(res, "link"); }
  }
  function copyLink(res, method) {
    var m = shareMap(res, method), text = fill(P.share.text, m);
    function done() { toastBar(P.ui.linkDone); ga("share", { method: method, item_id: res.type }); log({ action: "share", method: method }); }
    function fallback() {
      var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:0;top:0;opacity:0"; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { window.prompt("아래 문구를 복사하세요", text); }
      ta.remove();
    }
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  }
  function shareNative(res) {
    var m = shareMap(res, "native");
    var data = { title: P.title, text: fill(P.share.text, { risk: m.risk, type: m.type, reason: m.reason, url: "" }).trim(), url: m.url };
    var go = function (d) { navigator.share(d).then(function () { ga("share", { method: "native", item_id: res.type }); log({ action: "share", method: "native" }); }).catch(function () {}); };
    if (cardUrl && navigator.canShare && window.File) {
      try {
        fetch(cardUrl).then(function (r) { return r.blob(); }).then(function (b) {
          var f = new File([b], "sonjeol.png", { type: "image/png" });
          if (navigator.canShare({ files: [f] })) go({ files: [f], title: data.title, text: data.text + " " + data.url }); else go(data);
        }).catch(function () { go(data); });
        return;
      } catch (e) {}
    }
    go(data);
  }
  function toastBar(msg) {
    var t = document.createElement("div");
    t.textContent = msg; t.setAttribute("role", "status");
    t.style.cssText = "position:fixed;left:50%;bottom:calc(88px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:#191F28;color:#fff;padding:10px 16px;border-radius:12px;font-size:14px;font-weight:600;z-index:30;";
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 1600);
  }
  function openExternal() {
    var url = location.href;
    if (/KAKAOTALK/i.test(UA)) { location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(url); return; }
    location.href = "intent://" + url.replace(/^https?:\/\//, "") + "#Intent;scheme=https;package=com.android.chrome;end";
  }
  function saveCard(res) {
    var box = $("cardImg");
    if (!cardUrl) { renderCardImage(res); }
    box.classList.add("on"); box.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    ga("share", { method: "image", item_id: res.type }); log({ action: "share", method: "image" });
  }

  /* ── 결과 이미지 (캔버스 1080×1920) ── */
  function loadImg(src) { return new Promise(function (resolve) { var im = new Image(); if (/^https?:\/\//.test(src) && src.indexOf(location.origin) !== 0) im.crossOrigin = "anonymous"; im.onload = function () { resolve(im); }; im.onerror = function () { resolve(null); }; im.src = src; }); }
  function wrap(ctx, text, maxW, maxLines) {
    var lines = [], line = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text[i], test = line + ch;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = ch === " " ? "" : ch; } else line = test;
    }
    if (line) lines.push(line);
    if (maxLines && lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/.{2}$/, "") + "…"; }
    return lines;
  }
  function rr(x, X, Y, W, H, R) { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); }
  function drawCard(res, charImg) {
    var W = 1080, H = 1920, c = document.createElement("canvas"); c.width = W; c.height = H;
    var x = c.getContext("2d"), t = P.types[res.type], PAD = 72, CW = W - PAD * 2;
    var ink = "#191F28", muted = "#6B7684", surface = "#F2F4F6", line = "#E5E8EB", blue = "#3366F6", red = "#E8503E", green = "#22A06B";
    var F = '"Pretendard Variable", Pretendard, "Noto Sans KR", sans-serif';
    x.fillStyle = "#FFFFFF"; x.fillRect(0, 0, W, H);
    x.textBaseline = "alphabetic";
    /* 상단 */
    x.fillStyle = muted; x.font = "600 28px " + F; x.fillText(P.title, PAD, 120);
    x.fillStyle = muted; x.font = "600 30px " + F; x.fillText(P.ui.riskLabel, PAD, 220);
    x.fillStyle = ink; x.font = "800 150px " + F; x.fillText(String(res.risk), PAD, 370);
    var nw = x.measureText(String(res.risk)).width; x.font = "700 56px " + F; x.fillText("%", PAD + nw + 10, 370);
    var bandColor = res.band.key === "danger" ? red : res.band.key === "warn" ? "#C47A00" : green;
    var bandBg = res.band.key === "danger" ? "#FDEEEC" : res.band.key === "warn" ? "#FFF4E0" : "#E8F7EF";
    x.font = "700 28px " + F; var bw = x.measureText(res.band.label).width + 48;
    x.fillStyle = bandBg; rr(x, PAD, 400, bw, 56, 28); x.fill(); x.fillStyle = bandColor; x.fillText(res.band.label, PAD + 24, 439);
    x.fillStyle = muted; x.font = "400 28px " + F; wrap(x, res.band.line, CW, 2).forEach(function (l, i) { x.fillText(l, PAD, 510 + i * 40); });
    /* 유형 */
    var y = 640;
    x.fillStyle = surface; rr(x, PAD, y, CW, 300, 28); x.fill();
    if (charImg) { var s = 236, r = Math.min(s / charImg.width, s / charImg.height), dw = charImg.width * r, dh = charImg.height * r; x.drawImage(charImg, W - PAD - 32 - dw, y + 32 + (s - dh) / 2, dw, dh); }
    x.fillStyle = muted; x.font = "600 26px " + F; x.fillText(P.ui.typeLabel, PAD + 36, y + 72);
    x.fillStyle = ink; x.font = "800 48px " + F; wrap(x, t.name, CW - 320, 2).forEach(function (l, i) { x.fillText(l, PAD + 36, y + 140 + i * 56); });
    x.fillStyle = red; x.font = "600 28px " + F; wrap(x, res.weakLine || "", CW - 320, 2).forEach(function (l, i) { x.fillText(l, PAD + 36, y + 236 + i * 36); });
    /* 참아주는 이유 / 손절 사유 */
    y = 1000;
    function block(title, items, color, maxItems) {
      x.fillStyle = ink; x.font = "700 32px " + F; x.fillText(title, PAD, y); y += 52;
      if (!items.length) { x.fillStyle = muted; x.font = "400 27px " + F; x.fillText(P.ui.cutsNone, PAD, y); y += 48; return; }
      items.slice(0, maxItems).forEach(function (it) {
        x.fillStyle = color; x.beginPath(); x.arc(PAD + 10, y - 10, 8, 0, Math.PI * 2); x.fill();
        x.fillStyle = ink; x.font = "400 27px " + F;
        wrap(x, it.text, CW - 44, 2).forEach(function (l, i) { x.fillText(l, PAD + 36, y + i * 36); });
        y += 36 * Math.min(2, wrap(x, it.text, CW - 44).length) + 14;
      });
      y += 24;
    }
    block(P.ui.reasonsTitle, res.reasons, green, 2);
    block(P.ui.cutsTitle, res.cuts, red, 2);
    /* 항목별 (하단 고정) */
    var by = H - 470;
    x.fillStyle = ink; x.font = "700 32px " + F; x.fillText(P.ui.axesTitle, PAD, by); by += 44;
    P.axes.forEach(function (a) {
      var v = res.s[a.k], weak = res.weakAxis === a.k;
      x.fillStyle = weak ? red : ink; x.font = "600 26px " + F; x.fillText(a.name, PAD, by + 8);
      var bx = PAD + 110, bwid = CW - 110 - 90;
      x.fillStyle = "#E9ECEF"; rr(x, bx, by - 12, bwid, 22, 11); x.fill();
      x.fillStyle = weak ? red : blue; rr(x, bx, by - 12, Math.max(22, bwid * v / 8), 22, 11); x.fill();
      x.fillStyle = muted; x.font = "500 24px " + F; x.textAlign = "right"; x.fillText(v + "/8", W - PAD, by + 8); x.textAlign = "left";
      by += 52;
    });
    /* 하단 */
    x.fillStyle = line; x.fillRect(PAD, H - 130, CW, 2);
    x.fillStyle = muted; x.font = "500 24px " + F; x.fillText((CFG.BASE_URL || "").replace(/^https?:\/\//, ""), PAD, H - 80);
    x.textAlign = "right"; x.font = "400 22px " + F; x.fillText(P.ui.disclaimer + (CFG.CREDIT ? " · " + CFG.CREDIT : ""), W - PAD, H - 80); x.textAlign = "left";
    return c;
  }
  function renderCardImage(res) {
    var t = P.types[res.type];
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    return ready.then(function () { return loadImg(ROOT + t.img); }).then(function (im) {
      var c = drawCard(res, im);
      cardUrl = c.toDataURL("image/png");
      var img = $("cardPng"); if (img) { img.src = cardUrl; }
      var dl = $("cardDl"); if (dl && !IN_APP) { dl.href = cardUrl; dl.hidden = false; }
      window.__card = cardUrl;
      return cardUrl;
    });
  }

  /* ── 부팅 ── */
  function boot(pack) {
    P = pack;
    initGA(); initKakao();
    var q = new URLSearchParams(location.search);
    var picks = decode(q.get("a"));
    var staticResult = document.body.getAttribute("data-result");
    if (picks) {
      var res = judge(picks);
      renderResult(res, { animate: false }); show("result");
      if (q.get("card") === "1") { renderCardImage(res).then(function () { document.body.setAttribute("data-card-ready", "1"); }); }
      return;
    }
    if (staticResult) {
      var m = /^([a-z]+)-([a-z]+)$/.exec(staticResult);
      if (m && P.types[m[1]] && bandByKey(m[2])) {
        var b = bandByKey(m[2]);
        renderResult({ type: m[1], band: b, risk: Math.round((b.max + (P.bands.indexOf(b) ? P.bands[P.bands.indexOf(b) - 1].max : 0)) / 2), weakLine: "", reasons: [], cuts: [], s: {}, trust: null, serial: "", code: "" }, { animate: false });
        show("result"); return;
      }
    }
    renderIntro(); show("intro");
  }
  function loadPack() {
    if (window.INSUNG_PACKS && window.INSUNG_PACKS[PACK_ID]) return boot(window.INSUNG_PACKS[PACK_ID]);
    var s = document.createElement("script"); s.src = ROOT + "packs/" + PACK_ID + ".js";
    s.onload = function () { boot(window.INSUNG_PACKS[PACK_ID]); };
    s.onerror = function () { $("intro").innerHTML = '<p class="muted">내용을 불러오지 못했어요. 새로고침해 주세요.</p>'; };
    document.head.appendChild(s);
  }
  window.INSUNG = { judge: function (p) { return judge(p); }, encode: encode, pack: function () { return P; }, keyOf: function (r) { return r.type + "-" + r.band.key; } };
  loadPack();
})();
