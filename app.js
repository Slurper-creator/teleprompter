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
  var mirrorBtn = $("mirrorBtn"), fsBtn = $("fsBtn");

  // ---------- Status messages ----------
  function setStatus(msg, kind) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  // ---------- Settings (display preferences only) ----------
  var settings = { speed: 5, font: 56, mirror: false };
  try {
    var saved = JSON.parse(localStorage.getItem("tp-settings") || "{}");
    if (saved && typeof saved === "object") {
      if (Number.isFinite(saved.speed)) settings.speed = clamp(saved.speed, 1, 20);
      if (Number.isFinite(saved.font)) settings.font = clamp(saved.font, 24, 120);
      settings.mirror = saved.mirror === true;
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

  function renderScript(text) {
    scriptText.replaceChildren();
    var lines = text.split("\n");
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
      scriptInput.focus();
      return;
    }
    openPrompter(text);
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
      var stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      var out = await new Response(stream).arrayBuffer();
      if (out.byteLength > MAX_UNZIPPED_BYTES) throw new Error("Document too large");
      return dec.decode(out);
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
      if (offset >= maxOffset()) { offset = maxOffset(); applyOffset(); pause(); return; }
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
    playBtn.innerHTML = "&#10074;&#10074; Pause";
    playBtn.setAttribute("aria-pressed", "true");
    rafId = requestAnimationFrame(tick);
    requestWakeLock();
    scheduleFade();
  }

  function pause() {
    playing = false;
    cancelAnimationFrame(rafId);
    playBtn.innerHTML = "&#9654; Play";
    playBtn.setAttribute("aria-pressed", "false");
    releaseWakeLock();
    showControls();
  }

  function togglePlay() { playing ? pause() : play(); }

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
    fontIn.value = settings.font; fontOut.textContent = settings.font;
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
  playBtn.addEventListener("click", togglePlay);
  backBtn.addEventListener("click", closePrompter);
  restartBtn.addEventListener("click", function () { offset = 0; applyOffset(); });
  speedIn.addEventListener("input", function () { setSpeed(Number(speedIn.value)); });
  fontIn.addEventListener("input", function () { setFont(Number(fontIn.value)); });
  mirrorBtn.addEventListener("click", function () {
    settings.mirror = !settings.mirror; applySettings(); saveSettings();
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

  // Keyboard shortcuts (only on the prompter screen)
  document.addEventListener("keydown", function (e) {
    if (prompterScreen.hidden) return;
    var onRange = e.target && e.target.type === "range";
    switch (e.key) {
      case " ":
      case "k":
        e.preventDefault(); togglePlay(); break;
      case "ArrowUp":
        if (onRange) return;
        e.preventDefault(); setSpeed(settings.speed + 1); break;
      case "ArrowDown":
        if (onRange) return;
        e.preventDefault(); setSpeed(settings.speed - 1); break;
      case "PageDown":
        e.preventDefault(); offset += viewport.clientHeight * 0.5; applyOffset(); break;
      case "PageUp":
        e.preventDefault(); offset -= viewport.clientHeight * 0.5; applyOffset(); break;
      case "Home":
        e.preventDefault(); offset = 0; applyOffset(); break;
      case "+": case "=":
        setFont(settings.font + 4); break;
      case "-": case "_":
        setFont(settings.font - 4); break;
      case "m": case "M":
        mirrorBtn.click(); break;
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
