/*
 * Offline support.
 * - Caches only the app's own files. Scripts students load are never
 *   cached or stored here.
 * - Network first: when online, students always get the latest version
 *   (no version number to bump after an edit). When offline, the saved
 *   copy is used.
 * - Requests to Google (sign-in, Picker, Drive) are not touched.
 */
"use strict";

var CACHE = "teleprompter-v1";
var APP_FILES = [
  "./",
  "index.html",
  "app.js",
  "styles.css",
  "config.js",
  "wordlist.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(APP_FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).then(function (res) {
      if (res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (req.mode === "navigate") return caches.match("index.html");
        return Response.error();
      });
    })
  );
});
