/* 离线词典 Service Worker：联网时优先取最新版，断网时回落到缓存 */
const CACHE = 'offline-dict-v21';
/* 安装时只预缓存外壳 + 前两段词库（快），其余分片在激活后后台补齐 */
const CORE = ['./index.html', './dict.js', './dict-2.js', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
const REST = ['./dict-3.js', './dict-4.js', './dict-5.js', './dict-6.js', './dict-7.js', './dict-8.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(CORE.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }).then(function () {
      /* 后台把剩余分片灌进缓存，保证断网也能查到全部词 */
      return caches.open(CACHE).then(function (c) {
        return REST.reduce(function (p, u) {
          return p.then(function () {
            return c.match(u).then(function (hit) {
              if (hit) return;
              return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
            });
          });
        }, Promise.resolve());
      });
    })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 在线翻译等跨域请求不接管

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy); }).catch(function () {});
        return res;
      }).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  /* 缓存优先、后台更新：先秒开旧文件，同时静默拉取新版，下次打开就是新的 */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return res;
      });
      if (hit) { net.catch(function () {}); return hit; }
      return net;
    })
  );
});
