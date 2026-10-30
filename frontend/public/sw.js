// Veda service worker: keeps the app usable on flaky rural networks and offline.
// - Pages (incl. the student screens, pre-cached at install): network first, then the last cached copy.
// - Static assets: cache first.
// - API data is NOT cached here: lib/api.ts keeps the last good copy of every GET (cards, quizzes,
//   today's plan) in localStorage and shows an "offline" notice; finished quizzes are queued and sent later.
const CACHE = "veda-v3";
const PRECACHE = ["/", "/student", "/student/today", "/student/vidya", "/teacher", "/manifest.webmanifest", "/logo.png", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return; // data + auth: handled by the app, never by this cache

  const isStatic = url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?|webmanifest)$/.test(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(() => caches.match(url.pathname).then((hit) => hit || caches.match("/student/today") || caches.match("/"))),
    );
  }
});
