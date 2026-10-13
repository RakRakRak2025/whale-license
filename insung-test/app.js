/* ============================================================
   인성 등급판정소 — 엔진
   콘텐츠는 packs/<PACK>.js, 배포 설정은 config.js. 이 파일은 둘 다 모른 채 동작합니다.
   화면: intro → quiz → (memo) → judging → result
   결과 페이지(r/*.html)는 body[data-result] + ?a=답변코드 로 같은 엔진을 재사용합니다.
   ============================================================ */
(function () {
  "use strict";

  var CFG = window.INSUNG_CONFIG || {};
  var ROOT = (document.body.getAttribute("data-root") || "");
  var PACK_ID = CFG.PACK || "insung-v1";
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var UA = navigator.userAgent || "";
  var IN_APP = /KAKAOTALK|Instagram|FBAN|FBAV|NAVER\(inapp|Line\//i.test(UA);
  var IS_ANDROID = /Android/i.test(UA);
  var P = null;      // 콘텐츠팩
  var state = { i: 0, picks: [], t0: 0 };

  /* ── 유틸 ── */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function fill(tpl, map) { return String(tpl).replace(/\{(\w+)\}/g, function (_, k) { return map[k] != null ? map[k] : ""; }); }
  function gslug(g) { return g.replace(/\+/g, "p"); }
  function gfromSlug(s) { return s.replace(/p/g, "+"); }
  function ro(label) { return label + (/등급$/.test(label) ? "으로" : "로"); }
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
    return "No." + h.toString(36).toUpperCase().padStart(4, "0");
  }

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
    var sum = {}, low = {}, chk = null, chkOf = 0;
    P.axes.forEach(function (a) { sum[a.k] = 0; });
    picks.forEach(function (oi, qi) {
      var q = P.questions[qi], o = q.o[oi];
      if (q.ax === "chk") { chk = o.p; chkOf = q.chkOf || 0; return; }
      sum[q.ax] += o.p;
      if (o.cb && (!low[q.ax] || o.p < low[q.ax].p)) low[q.ax] = o;
    });
    var no = {}, gi = {}, total = 0, minNo = 9;
    P.axes.forEach(function (a) {
      no[a.k] = P.map[Math.max(0, Math.min(8, sum[a.k]))];
      gi[a.k] = P.grades.order.indexOf(P.grades.of(no[a.k]));
      total += no[a.k]; minNo = Math.min(minNo, no[a.k]);
    });
    var fin = Math.min.apply(null, P.axes.map(function (a) { return gi[a.k]; }));
    var grade = P.grades.order[fin];
    var cuts = fin < P.grades.order.length - 1 ? P.axes.filter(function (a) { return gi[a.k] === fin; }).map(function (a) { return a.k; }) : [];
    var type = null;
    for (var r = 0; r < P.rules.length && !type; r++) { if (P.rules[r].test(no, total, minNo)) type = P.rules[r].type; }
    if (!type) {
      var mx = Math.max.apply(null, P.axes.map(function (a) { return no[a.k]; }));
      var tied = P.axes.filter(function (a) { return no[a.k] === mx; }).map(function (a) { return a.k; });
      var seed = picks.reduce(function (s, p, i) { return s + p * (i + 1); }, 0);
      type = P.topByAxis[tied[seed % tied.length]];
    }
    var trust = null;
    if (chk !== null) { var base = P.questions[chkOf].o[picks[chkOf]].p; trust = Math.abs(base - chk) >= P.trust.diff ? P.trust.bad : P.trust.ok; }
    var callback = "";
    if (cuts.length) { var ax = axisOf(cuts[0]); callback = low[cuts[0]] ? low[cuts[0]].cb : ax.fallback; }
    return { picks: picks, no: no, gi: gi, grade: grade, cuts: cuts, type: type, trust: trust, callback: callback, serial: serialOf(picks), code: encode(picks) };
  }
  function axisOf(k) { for (var i = 0; i < P.axes.length; i++) if (P.axes[i].k === k) return P.axes[i]; return null; }
  function cutText(res) {
    if (!res.cuts.length) return P.share.cutNone;
    return fill(P.share.cutSome, { axes: res.cuts.map(function (k) { return axisOf(k).short; }).join("·") });
  }
  function resultUrl(res, method) {
    var base = (CFG.BASE_URL || "").replace(/\/$/, "");
    var u = base + "/r/" + res.type + "-" + gslug(res.grade) + ".html?a=" + res.code;
    if (method) u += "&utm_source=" + method + "&utm_medium=share&utm_campaign=" + PACK_ID + "&utm_content=" + res.type;
    return u;
  }
  function shareMap(res, method) {
    return { grade: P.grades.label(res.grade), type: P.types[res.type].name, cut: cutText(res), url: resultUrl(res, method), best: P.types[P.types[res.type].best].name };
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
      '<p class="eyebrow">' + esc(P.title) + " · " + esc(P.subtitle) + "</p>" +
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
      '<div class="q-meta"><span>' + esc(P.ui.qLabel) + " <b>" + (i + 1) + " / " + n + "</b></span><span class=\"q-axis\">" + esc(axName) + "</span></div>" +
      '<p class="q-text">' + esc(q.t) + "</p>" +
      '<div class="opts">' + q.o.map(function (o, oi) { return '<button class="btn" type="button" data-oi="' + oi + '">' + esc(o.x) + "</button>"; }).join("") + "</div>" +
      '<p class="toast" id="toast" role="status"></p>' +
      '<div class="q-foot">' + (i > 0 ? '<button class="link" type="button" id="backBtn">이전 문항</button>' : "<span></span>") + '<span class="small muted num">' + esc(q.src) + "</span></div>";
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
        wait(o.r ? 720 : 260).then(function () {
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
    m.innerHTML = '<img class="judge" src="' + ROOT + 'assets/judge.png" alt="" onerror="this.remove()"><p>' + esc(hasCut ? P.midMemo.cut : P.midMemo.clean) + '</p><button class="link" type="button">계속</button>';
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
    ga("quiz_complete", { grade: res.grade, type: res.type, seconds: Math.round((Date.now() - state.t0) / 1000) });
    log({ action: "complete", grade: res.grade, type: res.type, serial: res.serial, cuts: res.cuts.join(""), trust: res.trust === P.trust.ok ? 1 : 0 });
    show("judging"); runJudging(res).then(function () { renderResult(res, { animate: true }); show("result"); });
  }

  /* ── 판정 연출 ── */
  function runJudging(res) {
    var el = $("judging");
    el.innerHTML =
      '<img class="judge" src="' + ROOT + 'assets/judge.png" alt="" style="width:120px;height:120px;object-fit:contain;align-self:center" onerror="this.remove()">' +
      '<p class="jg-title" id="jgTitle"></p>' +
      '<div class="jg-axes">' + P.axes.map(function (a) {
        return '<div class="jg-ax" data-k="' + a.k + '"><span class="ax-name">' + esc(a.name) + '</span><span class="ax-bar"><i></i></span><span class="ax-no">No.-</span></div>';
      }).join("") + "</div>" +
      '<div class="jg-stamp" id="jgStamp"></div>';
    var title = $("jgTitle");
    var chain = Promise.resolve();
    P.axes.forEach(function (a, k) {
      chain = chain.then(function () {
        title.textContent = P.ui.judging[k] || "";
        var row = el.querySelector('[data-k="' + a.k + '"]'); row.classList.add("on");
        row.querySelector(".ax-bar i").style.width = (res.no[a.k] / 9 * 100).toFixed(1) + "%";
        row.querySelector(".ax-no").textContent = "No." + res.no[a.k];
        if (res.cuts.indexOf(a.k) > -1) row.classList.add("cut");
        return wait(560);
      });
    });
    return chain.then(function () {
      title.textContent = P.ui.judging[P.axes.length] || "";
      return wait(600);
    }).then(function () {
      title.textContent = P.grades.stampLine[res.grade] || "";
      $("jgStamp").innerHTML = stampHtml(res.grade, true);
      if (navigator.vibrate && !reduce) { try { navigator.vibrate([30, 40, 60]); } catch (e) {} }
      return wait(900);
    });
  }
  function stampHtml(grade, animate) {
    return '<div class="stamp' + (animate && !reduce ? " drop" : "") + '" aria-label="최종 ' + esc(P.grades.label(grade)) + '"><span class="stamp-grade">' + esc(grade) + '</span><span class="stamp-sub">등급</span></div>';
  }

  /* ── 결과 카드 (DOM) ── */
  function certHtml(res, opts) {
    var t = P.types[res.type], full = !!res.picks;
    var axes = full ? P.axes.map(function (a) {
      var n = res.no[a.k], d = a.desc[n >= 7 ? 2 : n >= 4 ? 1 : 0], cut = res.cuts.indexOf(a.k) > -1;
      return '<div class="ax' + (cut ? " cutax" : "") + '"><span class="ax-name">' + esc(a.name) + '</span><span class="ax-bar"><i style="width:' + (n / 9 * 100).toFixed(1) + '%"></i></span><span class="ax-no">No.' + n + '</span><span class="ax-desc">' + esc(d) + " · " + esc(P.grades.label(P.grades.order[res.gi[a.k]])) + (cut ? " · " + esc(P.ui.cutHere) : "") + "</span></div>";
    }).join("") : "";
    var cutline = !full ? "" : res.cuts.length
      ? fill(P.ui.cutLine, { axes: res.cuts.map(function (k) { return axisOf(k).name; }).join(", "), grade: ro(P.grades.label(res.grade)) })
      : P.ui.cutLineNone;
    var rarity = "";
    if (CFG.STATS && CFG.STATS.grades && CFG.STATS.grades[res.grade] != null) rarity = '<p class="cert-rarity">' + esc(fill(P.ui.rarity, { pct: Math.round(CFG.STATS.grades[res.grade] * 100), grade: P.grades.label(res.grade) })) + "</p>";
    return '<div class="cert-top"><span class="cert-title">' + esc(P.ui.certTitle) + '</span><span class="cert-no">' + esc(res.serial || "") + "</span></div>" +
      '<div class="cert-main"><img class="cert-char" src="' + ROOT + esc(t.img) + '" alt="" onerror="this.classList.add(\'empty\')">' +
      '<div><div class="cut-label">판정 부위</div><div class="cut-name">' + esc(t.name) + '</div><div class="cut-tag">' + esc(t.tag) + "</div></div>" +
      stampHtml(res.grade, opts && opts.animate) + "</div>" +
      (axes ? '<div class="axes">' + axes + "</div>" : "") +
      (cutline ? '<p class="cert-cutline">' + esc(cutline) + "</p>" : "") +
      (res.callback ? '<p class="cert-callback">"' + esc(res.callback) + '"</p>' : "") +
      '<p class="cert-desc">' + esc(t.desc) + " " + esc(P.grades.text[res.grade]) + "</p>" +
      '<div class="cert-pair"><div><b>' + esc(P.ui.pairBest) + "</b>" + esc(P.types[t.best].name) + " · " + esc(t.bestWhy) + "</div><div><b>" + esc(P.ui.pairWorst) + "</b>" + esc(P.types[t.worst].name) + " · " + esc(t.worstWhy) + "</div></div>" +
      rarity +
      (res.trust ? '<p class="cert-trust">' + esc(P.ui.trust) + ": " + esc(res.trust) + "</p>" : "") +
      '<div class="cert-foot"><span>' + esc(P.title) + (CFG.CREDIT ? " · " + esc(CFG.CREDIT) : "") + "</span><span>" + esc(P.ui.disclaimer) + "</span></div>";
  }

  /* ── 결과 화면 ── */
  var currentRes = null, cardUrl = null;
  function renderResult(res, opts) {
    currentRes = res; cardUrl = null;
    var t = P.types[res.type], full = !!res.picks, el = $("result");
    var coupang = "";
    if (CFG.COUPANG && CFG.COUPANG.enabled && CFG.COUPANG.widgets && CFG.COUPANG.widgets[res.type]) {
      coupang = '<div class="sec coupang"><h2>' + esc(P.ui.coupangTitle) + " · " + esc(t.name) + '</h2><p class="disclosure">' + esc(P.ui.coupangDisclosure) + "</p>" +
        '<iframe title="쿠팡 파트너스" src="https://ads-partners.coupang.com/widgets.html?id=' + encodeURIComponent(CFG.COUPANG.widgets[res.type]) + "&template=carousel&trackingCode=" + encodeURIComponent(CFG.COUPANG.tracking) + '&subId=' + encodeURIComponent(res.type) + '&width=100%25&height=140" height="140" scrolling="no" referrerpolicy="unsafe-url"></iframe></div>';
    }
    var more = (CFG.MORE_TESTS || []).map(function (m) {
      return m.soon || !m.url ? '<div class="soon"><b>' + esc(m.title) + "</b><span>" + esc(m.desc || P.ui.soon) + "</span></div>"
        : '<a href="' + esc(m.url) + '"><b>' + esc(m.title) + "</b><span>" + esc(m.desc || "") + "</span></a>";
    }).join("");
    var peer = (CFG.PEER_ENABLED && full) ? '<button class="btn ghost" type="button" id="peerBtn">' + esc(P.ui.peer) + "</button>" : "";
    el.innerHTML =
      (!full ? '<button class="btn primary" type="button" id="meTooTop">나도 판정받기</button>' : "") +
      '<div class="cert" id="cert">' + certHtml(res, opts) + "</div>" +
      '<div class="card-img" id="cardImg"><img id="cardPng" alt="결과 카드"><p class="hint">' + esc(P.ui.saveHint) + '</p><a class="btn ghost" id="cardDl" download="insung-' + esc(res.type) + "-" + esc(gslug(res.grade)) + '.png" hidden>이미지 파일로 받기</a></div>' +
      (IN_APP ? '<div class="inapp" id="inapp"><span>' + esc(P.ui.inapp) + '</span>' + (IS_ANDROID ? '<a href="#" id="extBtn">다른 브라우저로 열기</a>' : "") + "</div>" : "") +
      '<button class="btn ghost" type="button" id="pairBtn">' + esc(fill(P.share.pairCta, { best: P.types[t.best].name })) + "</button>" + peer +
      coupang +
      adHtml("result_mid") +
      '<div class="vote" id="vote"><p class="vote-q">' + esc(P.vote.q) + '</p><div class="btn-row">' + P.vote.options.map(function (o) { return '<button class="btn" type="button" data-v="' + esc(o.k) + '">' + esc(o.x) + "</button>"; }).join("") + '</div><p class="vote-out" id="voteOut"></p></div>' +
      '<div class="sec more"><h2>' + esc(P.ui.more) + "</h2>" + more + "</div>" +
      adHtml("result_bottom") +
      '<button class="btn ghost" type="button" id="againBtn">' + esc(P.ui.again) + "</button>" +
      "<footer><span>" + esc(P.intro.disclaimer) + "</span><span>" + esc(CFG.CREDIT || "") + "</span></footer>";
    mountAds(el);

    /* 공유 바 */
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
      sb.innerHTML = '<button class="btn kakao" type="button" id="meTooBtn">나도 판정받기</button><button class="btn" type="button" id="copyBtn2">' + esc(P.ui.link) + "</button>";
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
    function showVote(k) { $("voteOut").textContent = "당신의 판결: " + P.vote.options.filter(function (o) { return o.k === k; }).map(function (o) { return o.x; })[0] + ". " + P.vote.after; Array.prototype.forEach.call(el.querySelectorAll("[data-v]"), function (b) { b.classList.toggle("picked", b.getAttribute("data-v") === k); b.disabled = true; }); }
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
    var img = (CFG.BASE_URL || "").replace(/\/$/, "") + "/assets/cards/" + res.type + "-" + gslug(res.grade) + ".png";
    try {
      window.Kakao.Share.sendDefault({
        objectType: "feed",
        content: { title: fill(P.share.kakaoTitle, m), description: fill(P.share.kakaoDesc, m), imageUrl: img, imageWidth: 1080, imageHeight: 1920, link: { mobileWebUrl: m.url, webUrl: m.url } },
        buttons: [{ title: "나도 판정받기", link: { mobileWebUrl: m.url, webUrl: m.url } }]
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
    var data = { title: P.title, text: fill(P.share.text, { grade: m.grade, type: m.type, cut: m.cut, url: "" }).trim(), url: m.url };
    var go = function (d) { navigator.share(d).then(function () { ga("share", { method: "native", item_id: res.type }); log({ action: "share", method: "native" }); }).catch(function () {}); };
    if (cardUrl && navigator.canShare && window.File) {
      try {
        fetch(cardUrl).then(function (r) { return r.blob(); }).then(function (b) {
          var f = new File([b], "insung.png", { type: "image/png" });
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
    t.style.cssText = "position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:#1E1C19;color:#FFFDF7;padding:10px 16px;font-size:13.5px;z-index:30;";
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

  /* ── 카드 이미지 (캔버스 1080×1920) ── */
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
  function drawCard(res, charImg) {
    var W = 1080, H = 1920, c = document.createElement("canvas"); c.width = W; c.height = H;
    var x = c.getContext("2d"), t = P.types[res.type], PAD = 72;
    var ink = "#1E1C19", muted = "#6A655C", line = "#E3DFD6", red = "#B3261E", paper = "#FFFDF7", soft = "#F1EFE8";
    var fd = '"Nanum Myeongjo", serif', fb = '"IBM Plex Sans KR", sans-serif', fm = '"IBM Plex Mono", monospace';
    x.fillStyle = paper; x.fillRect(0, 0, W, H);
    x.strokeStyle = ink; x.lineWidth = 3; x.strokeRect(40, 40, W - 80, H - 80);
    x.strokeStyle = line; x.lineWidth = 2; x.strokeRect(52, 52, W - 104, H - 104);
    /* 제목 */
    x.fillStyle = ink; x.font = "800 44px " + fd; x.textBaseline = "alphabetic"; x.fillText(P.ui.certTitle, PAD, 150);
    x.fillStyle = muted; x.font = "500 26px " + fm; x.textAlign = "right"; x.fillText(res.serial, W - PAD, 150); x.textAlign = "left";
    x.fillStyle = ink; x.fillRect(PAD, 176, W - PAD * 2, 4);
    /* 캐릭터 */
    var cy = 200, ch = 380;
    if (charImg) { var r = Math.min(ch / charImg.width, ch / charImg.height), dw = charImg.width * r, dh = charImg.height * r; x.drawImage(charImg, (W - dw) / 2, cy + (ch - dh) / 2, dw, dh); }
    else { x.fillStyle = soft; x.fillRect((W - ch) / 2, cy, ch, ch); }
    /* 부위 + 도장 */
    var y = 660;
    x.fillStyle = muted; x.font = "600 24px " + fb; x.fillText("판정 부위", PAD, y);
    x.fillStyle = ink; x.font = "800 96px " + fd; x.fillText(t.name, PAD, y + 108);
    x.font = "600 34px " + fb; x.fillText(t.tag, PAD, y + 164);
    x.save(); x.translate(W - PAD - 130, y + 70); x.rotate(-12 * Math.PI / 180);
    x.strokeStyle = red; x.lineWidth = 8; x.beginPath(); x.arc(0, 0, 118, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 104, 0, Math.PI * 2); x.stroke();
    x.fillStyle = red; x.textAlign = "center"; x.font = "800 86px " + fd; x.fillText(res.grade, 0, 26); x.font = "700 24px " + fb; x.fillText("등 급", 0, 70); x.restore(); x.textAlign = "left";
    /* 항목 막대 */
    y = 900;
    P.axes.forEach(function (a) {
      var n = res.no[a.k], cut = res.cuts.indexOf(a.k) > -1;
      x.fillStyle = cut ? red : ink; x.font = "600 28px " + fb; x.fillText(a.name, PAD, y + 10);
      var bx = PAD + 250, bw = W - PAD * 2 - 250 - 120;
      x.fillStyle = line; x.fillRect(bx, y - 12, bw, 22);
      x.fillStyle = cut ? red : ink; x.fillRect(bx, y - 12, bw * n / 9, 22);
      x.font = "500 28px " + fm; x.textAlign = "right"; x.fillText("No." + n, W - PAD, y + 10); x.textAlign = "left";
      x.fillStyle = muted; x.font = "400 22px " + fb; x.fillText(a.desc[n >= 7 ? 2 : n >= 4 ? 1 : 0] + " · " + P.grades.label(P.grades.order[res.gi[a.k]]) + (cut ? " · " + P.ui.cutHere : ""), bx, y + 44);
      y += 84;
    });
    /* 깎인 이유 + 되받아치기 */
    y += 10;
    var cutline = res.cuts.length ? fill(P.ui.cutLine, { axes: res.cuts.map(function (k) { return axisOf(k).name; }).join(", "), grade: ro(P.grades.label(res.grade)) }) : P.ui.cutLineNone;
    x.fillStyle = red; x.font = "700 30px " + fb;
    wrap(x, cutline, W - PAD * 2, 2).forEach(function (l) { x.fillText(l, PAD, y); y += 42; });
    if (res.callback) { y += 12; x.fillStyle = ink; x.font = "700 34px " + fd; wrap(x, "“" + res.callback + "”", W - PAD * 2, 2).forEach(function (l) { x.fillText(l, PAD, y); y += 48; }); }
    y += 8; x.fillStyle = ink; x.font = "400 26px " + fb;
    wrap(x, t.desc, W - PAD * 2, 3).forEach(function (l) { x.fillText(l, PAD, y); y += 37; });
    /* 궁합: 하단에서 위로 고정 배치 (본문 길이와 무관) */
    var py = H - 290;
    x.fillStyle = line; x.fillRect(PAD, py - 40, W - PAD * 2, 2);
    var colW = (W - PAD * 2 - 40) / 2;
    [[P.ui.pairBest, P.types[t.best].name, t.bestWhy], [P.ui.pairWorst, P.types[t.worst].name, t.worstWhy]].forEach(function (p, i) {
      var cx = PAD + i * (colW + 40), yy = py;
      x.fillStyle = muted; x.font = "600 22px " + fb; x.fillText(p[0], cx, yy); yy += 34;
      x.fillStyle = ink; x.font = "700 30px " + fd; x.fillText(p[1], cx, yy); yy += 36;
      x.font = "400 22px " + fb; wrap(x, p[2], colW, 2).forEach(function (l) { x.fillText(l, cx, yy); yy += 30; });
    });
    /* 하단 */
    x.fillStyle = ink; x.fillRect(PAD, H - 120, W - PAD * 2, 3);
    x.fillStyle = muted; x.font = "500 24px " + fm; x.fillText((CFG.BASE_URL || "").replace(/^https?:\/\//, ""), PAD, H - 76);
    x.textAlign = "right"; x.font = "400 22px " + fb; x.fillText(P.ui.disclaimer + (CFG.CREDIT ? " · " + CFG.CREDIT : ""), W - PAD, H - 76); x.textAlign = "left";
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
      var m = /^([a-z]+)-(1pp|1p|1|2|3)$/.exec(staticResult);
      if (m && P.types[m[1]]) {
        renderResult({ type: m[1], grade: gfromSlug(m[2]), cuts: [], no: {}, gi: {}, callback: "", trust: null, serial: "" }, { animate: false });
        show("result"); return;
      }
    }
    renderIntro(); show("intro");
  }
  function loadPack() {
    if (window.INSUNG_PACKS && window.INSUNG_PACKS[PACK_ID]) return boot(window.INSUNG_PACKS[PACK_ID]);
    var s = document.createElement("script"); s.src = ROOT + "packs/" + PACK_ID + ".js";
    s.onload = function () { boot(window.INSUNG_PACKS[PACK_ID]); };
    s.onerror = function () { $("intro").innerHTML = '<p class="muted">콘텐츠를 불러오지 못했습니다. 새로고침해 주세요.</p>'; };
    document.head.appendChild(s);
  }
  window.INSUNG = { judge: function (p) { return judge(p); }, encode: encode, gslug: gslug, pack: function () { return P; } };
  loadPack();
})();
