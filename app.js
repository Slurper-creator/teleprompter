/*
 * Teleprompter — runs entirely in the browser.
 * - No server, no analytics, no cookies.
 * - Script text is never stored or sent anywhere (only display settings
 *   like speed and text size are remembered on the device).
 * - Script text is always inserted with textContent, never as HTML,
 *   so nothing in a document can run as code.
 * - Google access uses the narrowest Drive scope (drive.file): the app
 *   can only read the single doc the student picks.
 */
(function () {
  "use strict";

  // Refuse to run inside another site's frame (clickjacking). GitHub Pages
  // can't send X-Frame-Options, and a <meta> CSP ignores frame-ancestors.
  if (window.top !== window.self) {
    document.body.replaceChildren();
    document.body.textContent = "Open the Teleprompter directly at its own address.";
    return;
  }

  var CFG = window.TELEPROMPTER_CONFIG || {};
  var MAX_CHARS = 500000;              // ~250 pages of text
  var MAX_FILE_BYTES = 20 * 1024 * 1024;
  var MAX_UNZIPPED_BYTES = 60 * 1024 * 1024;
  var DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
  var W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

  // ---------- Elements ----------
  function $(id) { return document.getElementById(id); }
  var loadScreen = $("loadScreen"), prompterScreen = $("prompterScreen");
  var scriptInput = $("scriptInput"), fileInput = $("fileInput");
  var startBtn = $("startBtn"), statusEl = $("status");
  var googleBlock = $("googleBlock"), pickDocBtn = $("pickDocBtn");
  var viewport = $("viewport"), scroller = $("scroller"), scriptText = $("scriptText");
  var guide = $("guide"), controls = $("controls");
  var playBtn = $("playBtn"), backBtn = $("backBtn"), restartBtn = $("restartBtn");
  var speedIn = $("speed"), speedOut = $("speedOut");
  var fontIn = $("fontSize"), fontOut = $("fontOut");
  var mirrorBtn = $("mirrorBtn"), fsBtn = $("fsBtn"), keysBtn = $("keysBtn");
  var playIcon = $("playIcon"), playLabel = $("playLabel"), announcer = $("announcer");

  // ---------- Status messages ----------
  function setStatus(msg, kind) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (kind ? " " + kind : "");
    // Mark the text box invalid only when the error is about it.
    if (kind !== "error") scriptInput.removeAttribute("aria-invalid");
  }

  // Tells screen-reader users what a keyboard shortcut just changed.
  var announceTimer = 0;
  function announce(msg) {
    clearTimeout(announceTimer);
    announcer.textContent = "";
    // A short gap makes screen readers repeat the same message twice in a row.
    announceTimer = setTimeout(function () { announcer.textContent = msg; }, 50);
  }

  // ---------- Settings (display preferences only) ----------
  var settings = { speed: 5, font: 56, mirror: false, letterKeys: true };
  try {
    var saved = JSON.parse(localStorage.getItem("tp-settings") || "{}");
    if (saved && typeof saved === "object") {
      if (Number.isFinite(saved.speed)) settings.speed = clamp(saved.speed, 1, 20);
      if (Number.isFinite(saved.font)) settings.font = clamp(saved.font, 24, 120);
      settings.mirror = saved.mirror === true;
      settings.letterKeys = saved.letterKeys !== false;
    }
  } catch (e) { /* storage unavailable; use defaults */ }

  function saveSettings() {
    try { localStorage.setItem("tp-settings", JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  // ---------- Text cleanup & rendering ----------
  function cleanText(raw) {
    var t = String(raw || "")
      .replace(/^﻿/, "")                 // byte-order mark
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "") // control chars
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (t.length > MAX_CHARS) t = t.slice(0, MAX_CHARS);
    return t;
  }

  // ---------- Language filter ----------
  // Builds one regex from wordlist.js + config.js. Each letter may repeat
  // (fuuuck), use a look-alike (sh1t, a$$) or be split by . _ - (f.u.c.k).
  var FILTER_MODE = ["mask", "block", "off"].indexOf(CFG.PROFANITY_FILTER) >= 0
    ? CFG.PROFANITY_FILTER : "mask";
  var LOOKALIKES = { a: "a@4", b: "b8", e: "e3", g: "g9", i: "i1!|*", l: "l1|", o: "o0", s: "s$5", t: "t7+", u: "uv*" };
  var allowedWords = {};
  (CFG.ALLOWED_WORDS || []).forEach(function (w) { allowedWords[String(w).toLowerCase()] = true; });
  var badWordRe = buildBadWordRe(
    [].concat(window.TELEPROMPTER_WORDLIST || [], CFG.EXTRA_BLOCKED_WORDS || []));

  function buildBadWordRe(words) {
    var parts = [];
    words.forEach(function (entry) {
      var w = String(entry || "").trim().toLowerCase();
      var anyStart = w.charAt(0) === "*", anyEnd = w.length > 1 && w.slice(-1) === "*";
      w = w.replace(/^\*|\*$/g, "");
      if (!w || allowedWords[w]) return;
      var core = w.split("").map(function (ch) {
        if (/\s/.test(ch)) return "\\s+";
        var set = (LOOKALIKES[ch] || ch).replace(/[\\\]\[^-]/g, "\\$&");
        return "[" + set + "]{1,8}";
      }).join("[._-]{0,3}");
      // Bounded repeats ({1,8}, {0,30}) keep matching fast on huge or
      // hostile input; unbounded + and * can take minutes on "assssss…".
      parts.push({
        len: w.length,
        re: "(?<![\\p{L}\\p{N}])" + (anyStart ? "\\p{L}{0,30}" : "") + core +
          (anyEnd ? "\\p{L}{0,30}" : "(?:e?s)?") + "(?![\\p{L}\\p{N}])"
      });
    });
    if (!parts.length) return null;
    parts.sort(function (x, y) { return y.len - x.len; });
    return new RegExp(parts.map(function (p) { return p.re; }).join("|"), "giu");
  }

  function isBadWord(match) { return !allowedWords[match.toLowerCase()]; }

  function maskBadWords(text) {
    if (FILTER_MODE === "off" || !badWordRe) return text;
    return text.replace(badWordRe, function (m) {
      return isBadWord(m) ? m.replace(/\S/g, "*") : m;
    });
  }

  function findBadWords(text) {
    var found = [];
    if (FILTER_MODE === "off" || !badWordRe) return found;
    badWordRe.lastIndex = 0;
    var m;
    while ((m = badWordRe.exec(text))) {
      if (isBadWord(m[0])) found.push({ index: m.index, length: m[0].length });
    }
    return found;
  }

  function renderScript(text) {
    scriptText.replaceChildren();
    var lines = maskBadWords(text).split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var p = document.createElement("p");
      p.textContent = line;                   // safe: never parsed as HTML
      scriptText.appendChild(p);
    }
  }

  // ---------- Load screen actions ----------
  startBtn.addEventListener("click", function () {
    var text = cleanText(scriptInput.value);
    if (!text) {
      setStatus("Paste your script or load a file first.", "error");
      scriptInput.setAttribute("aria-invalid", "true");
      scriptInput.focus();
      return;
    }
    if (FILTER_MODE === "block") {
      var bad = findBadWords(scriptInput.value);
      if (bad.length) {
        setStatus("Your script has " + bad.length + (bad.length === 1 ? " word" : " words") +
          " that aren't allowed. The first one is highlighted. Change " +
          (bad.length === 1 ? "it" : "them") + ", then press Start.", "error");
        scriptInput.setAttribute("aria-invalid", "true");
        scriptInput.focus();
        scriptInput.setSelectionRange(bad[0].index, bad[0].index + bad[0].length);
        return;
      }
    }
    setStatus("");
    openPrompter(text);
  });

  scriptInput.addEventListener("input", function () {
    if (scriptInput.getAttribute("aria-invalid")) {
      scriptInput.removeAttribute("aria-invalid");
      setStatus("");
    }
  });

  fileInput.addEventListener("change", async function () {
    var file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setStatus("That file is too large (20 MB max).", "error");
      return;
    }
    var name = file.name.toLowerCase();
    try {
      setStatus("Reading " + file.name + "…");
      var text;
      if (name.endsWith(".docx")) {
        text = await docxToText(await file.arrayBuffer());
      } else if (name.endsWith(".txt") || file.type === "text/plain") {
        text = await file.text();
      } else {
        setStatus("Please choose a .docx or .txt file.", "error");
        return;
      }
      text = cleanText(text);
      if (!text) { setStatus("That file has no text in it.", "error"); return; }
      scriptInput.value = text;
      setStatus("Loaded " + file.name + ". Press Start when ready.", "ok");
    } catch (err) {
      console.error(err);
      setStatus("Couldn't read that file. Try copying and pasting the text instead.", "error");
    }
  });

  // ---------- .docx reader (no libraries) ----------
  // A .docx is a ZIP archive; the text lives in word/document.xml.
  async function docxToText(buf) {
    var xml = await readZipEntry(buf, "word/document.xml");
    // Real .docx files never have a DOCTYPE; refusing one blocks
    // entity-expansion tricks ("billion laughs").
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unexpected DOCTYPE");
    var doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("Bad document XML");
    var body = doc.getElementsByTagNameNS(W_NS, "body")[0];
    if (!body) return "";
    var out = [];
    var paras = body.getElementsByTagNameNS(W_NS, "p");
    for (var i = 0; i < paras.length; i++) {
      var p = paras[i], s = "";
      var walker = doc.createTreeWalker(p, NodeFilter.SHOW_ELEMENT);
      var node;
      while ((node = walker.nextNode())) {
        if (node.namespaceURI !== W_NS) continue;
        if (node.localName === "t") s += node.textContent;
        else if (node.localName === "tab") s += " ";
        else if (node.localName === "br" || node.localName === "cr") s += "\n";
      }
      out.push(s);
    }
    return out.join("\n");
  }

  async function readZipEntry(buf, wanted) {
    var dv = new DataView(buf);
    var len = buf.byteLength;
    // Find "End of central directory" record.
    var eocd = -1;
    for (var i = len - 22; i >= Math.max(0, len - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Not a zip/docx file");
    var count = dv.getUint16(eocd + 10, true);
    var ptr = dv.getUint32(eocd + 16, true);
    var dec = new TextDecoder();
    for (var n = 0; n < count; n++) {
      if (ptr + 46 > len || dv.getUint32(ptr, true) !== 0x02014b50) throw new Error("Bad zip directory");
      var method = dv.getUint16(ptr + 10, true);
      var compSize = dv.getUint32(ptr + 20, true);
      var rawSize = dv.getUint32(ptr + 24, true);
      var nameLen = dv.getUint16(ptr + 28, true);
      var extraLen = dv.getUint16(ptr + 30, true);
      var commentLen = dv.getUint16(ptr + 32, true);
      var localOff = dv.getUint32(ptr + 42, true);
      var name = dec.decode(new Uint8Array(buf, ptr + 46, nameLen));
      ptr += 46 + nameLen + extraLen + commentLen;
      if (name !== wanted) continue;

      if (rawSize > MAX_UNZIPPED_BYTES) throw new Error("Document too large");
      if (localOff + 30 > len || dv.getUint32(localOff, true) !== 0x04034b50) throw new Error("Bad zip entry");
      var start = localOff + 30 + dv.getUint16(localOff + 26, true) + dv.getUint16(localOff + 28, true);
      if (start + compSize > len) throw new Error("Truncated zip");
      var data = new Uint8Array(buf, start, compSize);
      if (method === 0) return dec.decode(data);
      if (method !== 8) throw new Error("Unsupported compression");
      // Unzip in chunks and stop at the limit, so a "zip bomb" that lies
      // about its size can't fill memory before the check.
      var reader = new Blob([data]).stream()
        .pipeThrough(new DecompressionStream("deflate-raw")).getReader();
      var chunks = [], total = 0, chunk;
      while (!(chunk = await reader.read()).done) {
        total += chunk.value.byteLength;
        if (total > MAX_UNZIPPED_BYTES) {
          reader.cancel().catch(function () {});
          throw new Error("Document too large");
        }
        chunks.push(chunk.value);
      }
      return dec.decode(await new Blob(chunks).arrayBuffer());
    }
    throw new Error("No document text found");
  }

  // ---------- Google Doc picker (optional) ----------
  var googleReady = false, tokenClient = null, accessToken = null;
  var googleConfigured = !!(CFG.GOOGLE_CLIENT_ID && CFG.GOOGLE_API_KEY && CFG.GOOGLE_APP_ID);

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.async = true; s.defer = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("Failed to load " + src)); };
      document.head.appendChild(s);
    });
  }

  if (googleConfigured) {
    googleBlock.hidden = false;
    pickDocBtn.disabled = true;
    pickDocBtn.textContent = "Loading Google…";
    Promise.all([
      loadScript("https://apis.google.com/js/api.js"),
      loadScript("https://accounts.google.com/gsi/client")
    ]).then(function () {
      return new Promise(function (resolve) { window.gapi.load("picker", resolve); });
    }).then(function () {
      var tcConfig = {
        client_id: CFG.GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: onToken,
        error_callback: function (e) {
          setStatus(e && e.type === "popup_closed" ? "Sign-in was closed." : "Sign-in didn't work. Try again.", "error");
        }
      };
      if (CFG.SCHOOL_DOMAIN) tcConfig.hosted_domain = CFG.SCHOOL_DOMAIN;
      tokenClient = window.google.accounts.oauth2.initTokenClient(tcConfig);
      googleReady = true;
      pickDocBtn.disabled = false;
      pickDocBtn.textContent = "Choose Google Doc";
    }).catch(function (err) {
      console.error(err);
      pickDocBtn.textContent = "Google unavailable — paste or upload below";
      setStatus("Couldn't reach Google. You can still paste your script or upload a file.", "error");
    });
  }

  pickDocBtn.addEventListener("click", function () {
    if (!googleReady) return;
    setStatus("");
    if (accessToken) { showPicker(); return; }
    // Must be called directly from the click so the sign-in popup isn't blocked.
    tokenClient.requestAccessToken({ prompt: "" });
  });

  function onToken(resp) {
    if (!resp || resp.error || !resp.access_token) {
      setStatus("Sign-in didn't work. Try again.", "error");
      return;
    }
    if (!window.google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_SCOPE)) {
      setStatus("Please allow access to the doc you choose, then try again.", "error");
      return;
    }
    accessToken = resp.access_token;               // kept in memory only
    var ttl = (Number(resp.expires_in) || 3600) * 1000;
    setTimeout(function () { accessToken = null; }, Math.max(60000, ttl - 60000));
    showPicker();
  }

  function showPicker() {
    var P = window.google.picker;
    var view = new P.DocsView(P.ViewId.DOCUMENTS)
      .setMimeTypes("application/vnd.google-apps.document")
      .setIncludeFolders(true)
      .setMode(P.DocsViewMode.LIST);
    new P.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(CFG.GOOGLE_API_KEY)
      .setAppId(CFG.GOOGLE_APP_ID)
      .setTitle("Choose your script")
      .setCallback(onPicked)
      .build()
      .setVisible(true);
  }

  async function onPicked(data) {
    var P = window.google.picker;
    if (data[P.Response.ACTION] !== P.Action.PICKED) return;
    var doc = data[P.Response.DOCUMENTS][0];
    var id = doc[P.Document.ID];
    var name = doc[P.Document.NAME] || "your doc";
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) { setStatus("That file couldn't be opened.", "error"); return; }
    setStatus("Loading “" + name + "”…");
    try {
      var url = "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(id) +
        "/export?mimeType=text%2Fplain";
      var res = await fetch(url, {
        headers: { Authorization: "Bearer " + accessToken },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store"
      });
      if (res.status === 401) { accessToken = null; throw new Error("Session expired"); }
      if (!res.ok) throw new Error("Drive returned " + res.status);
      var text = cleanText(await res.text());
      if (!text) { setStatus("That doc is empty.", "error"); return; }
      scriptInput.value = text;
      setStatus("Loaded “" + name + "”. Press Start when ready.", "ok");
    } catch (err) {
      console.error(err);
      setStatus("Couldn't load that doc. Try again, or copy and paste the text.", "error");
    }
  }

  // ---------- Prompter ----------
  var playing = false, offset = 0, lastTs = 0, rafId = 0, wakeLock = null, fadeTimer = 0;

  function openPrompter(text) {
    renderScript(text);
    loadScreen.hidden = true;
    prompterScreen.hidden = false;
    document.title = "Teleprompter — playing your script";
    offset = 0;
    applySettings();
    applyOffset();
    playBtn.focus();
  }

  function closePrompter() {
    pause();
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    prompterScreen.hidden = true;
    loadScreen.hidden = false;
    document.title = "Teleprompter";
    scriptInput.focus();
  }

  function maxOffset() {
    return Math.max(0, scriptText.offsetHeight - viewport.clientHeight);
  }

  function applyOffset() {
    offset = clamp(offset, 0, maxOffset());
    scroller.style.transform = "translate3d(0," + (-offset) + "px,0)";
  }

  function pixelsPerSecond() {
    // Scales with text size so a given speed "feels" the same at any size.
    return settings.speed * 12 * (settings.font / 56);
  }

  function tick(ts) {
    if (!playing) return;
    if (lastTs) {
      var dt = Math.min(0.1, (ts - lastTs) / 1000);  // avoid jumps after tab switch
      offset += pixelsPerSecond() * dt;
      if (offset >= maxOffset()) { offset = maxOffset(); applyOffset(); pause(); announce("End of script"); return; }
      applyOffset();
    }
    lastTs = ts;
    rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (playing) return;
    if (offset >= maxOffset()) offset = 0;           // finished? start over
    playing = true;
    lastTs = 0;
    playIcon.textContent = "\u275A\u275A";
    playLabel.textContent = "Pause";
    rafId = requestAnimationFrame(tick);
    requestWakeLock();
    scheduleFade();
  }

  function pause() {
    playing = false;
    cancelAnimationFrame(rafId);
    playIcon.textContent = "\u25B6";
    playLabel.textContent = "Play";
    releaseWakeLock();
    showControls();
  }

  function togglePlay() { playing ? pause() : play(); }
  function togglePlayAndAnnounce() { togglePlay(); announce(playing ? "Playing" : "Paused"); }

  // Keep the Chromebook screen awake while scrolling.
  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", function () { wakeLock = null; });
      }
    } catch (e) { /* not critical */ }
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && playing) requestWakeLock();
  });

  // Fade controls while playing; show on mouse/touch.
  function showControls() {
    controls.classList.remove("faded");
    clearTimeout(fadeTimer);
  }
  function scheduleFade() {
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(function () { if (playing) controls.classList.add("faded"); }, 2500);
  }
  prompterScreen.addEventListener("pointermove", function () {
    showControls();
    if (playing) scheduleFade();
  });

  function applySettings() {
    speedIn.value = settings.speed; speedOut.textContent = settings.speed;
    speedIn.setAttribute("aria-valuetext", settings.speed + " of 20");
    fontIn.value = settings.font; fontOut.textContent = settings.font;
    fontIn.setAttribute("aria-valuetext", settings.font + " pixels");
    keysBtn.setAttribute("aria-pressed", String(settings.letterKeys));
    scriptText.style.fontSize = settings.font + "px";
    guide.style.fontSize = settings.font + "px";
    viewport.classList.toggle("mirrored", settings.mirror);
    mirrorBtn.setAttribute("aria-pressed", String(settings.mirror));
    applyOffset();
  }

  function setSpeed(v) { settings.speed = clamp(Math.round(v), 1, 20); applySettings(); saveSettings(); }
  function setFont(v) {
    // Keep the same spot in the script when resizing.
    var ratio = maxOffset() ? offset / maxOffset() : 0;
    settings.font = clamp(Math.round(v / 2) * 2, 24, 120);
    applySettings();
    offset = ratio * maxOffset();
    applyOffset();
    saveSettings();
  }

  // Control wiring
  playBtn.addEventListener("click", togglePlayAndAnnounce);
  backBtn.addEventListener("click", closePrompter);
  restartBtn.addEventListener("click", function () { offset = 0; applyOffset(); announce("Back at the top"); });
  speedIn.addEventListener("input", function () { setSpeed(Number(speedIn.value)); });
  fontIn.addEventListener("input", function () { setFont(Number(fontIn.value)); });
  mirrorBtn.addEventListener("click", function () {
    settings.mirror = !settings.mirror; applySettings(); saveSettings();
  });
  keysBtn.addEventListener("click", function () {
    settings.letterKeys = !settings.letterKeys; applySettings(); saveSettings();
    announce(settings.letterKeys ? "Letter key shortcuts on" : "Letter key shortcuts off");
  });
  fsBtn.addEventListener("click", toggleFullscreen);
  viewport.addEventListener("click", togglePlay);    // tap the text to play/pause

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    else document.documentElement.requestFullscreen().catch(function () {});
  }
  document.addEventListener("fullscreenchange", function () {
    fsBtn.textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
  });

  // Manual scrolling (mouse wheel / touchpad) — works while paused or playing.
  viewport.addEventListener("wheel", function (e) {
    e.preventDefault();
    offset += e.deltaY;
    applyOffset();
  }, { passive: false });

  // Touch drag for touchscreen Chromebooks.
  var touchY = null;
  viewport.addEventListener("touchstart", function (e) { touchY = e.touches[0].clientY; }, { passive: true });
  viewport.addEventListener("touchmove", function (e) {
    if (touchY === null) return;
    var y = e.touches[0].clientY;
    offset += touchY - y; touchY = y;
    applyOffset();
  }, { passive: true });
  viewport.addEventListener("touchend", function () { touchY = null; });

  // Keyboard shortcuts (only on the prompter screen).
  // - Space, Enter and arrows keep their normal job on a focused button or
  //   slider, so keyboard users can operate every control.
  // - Single-character shortcuts (K, M, F, +, -) can be turned off with the
  //   "Letter keys" button (WCAG 2.1.4), for speech-input users.
  document.addEventListener("keydown", function (e) {
    if (prompterScreen.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target || {};
    var onButton = t.tagName === "BUTTON";
    var onRange = t.type === "range";
    var key = e.key;
    var isLetterKey = key.length === 1 && key !== " ";
    if (isLetterKey && !settings.letterKeys) return;

    showControls();
    if (playing) scheduleFade();

    switch (key) {
      case " ":
        if (onButton) return;                 // let Space press the focused button
        e.preventDefault(); togglePlayAndAnnounce(); break;
      case "k": case "K":
        e.preventDefault(); togglePlayAndAnnounce(); break;
      case "ArrowUp":
        if (onRange) return;
        e.preventDefault(); setSpeed(settings.speed + 1); announce("Speed " + settings.speed); break;
      case "ArrowDown":
        if (onRange) return;
        e.preventDefault(); setSpeed(settings.speed - 1); announce("Speed " + settings.speed); break;
      case "PageDown":
        e.preventDefault(); offset += viewport.clientHeight * 0.5; applyOffset(); break;
      case "PageUp":
        e.preventDefault(); offset -= viewport.clientHeight * 0.5; applyOffset(); break;
      case "Home":
        if (onRange) return;
        e.preventDefault(); offset = 0; applyOffset(); announce("Back at the top"); break;
      case "+": case "=":
        setFont(settings.font + 4); announce("Text size " + settings.font); break;
      case "-": case "_":
        setFont(settings.font - 4); announce("Text size " + settings.font); break;
      case "m": case "M":
        mirrorBtn.click(); announce(settings.mirror ? "Mirror on" : "Mirror off"); break;
      case "f": case "F":
        toggleFullscreen(); break;
      case "Escape":
        if (!document.fullscreenElement) closePrompter(); break;
    }
  });

  window.addEventListener("resize", applyOffset);
  applySettings();

  // ---------- Offline support ----------
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function (err) { console.error(err); });
  }
})();
