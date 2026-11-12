const CACHE = 'camera2-v1';
const ASSETS = ['./', './index.html', './assets/css/style.css', './assets/js/app.js', './assets/img/icon.svg', './manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); });
self.addEventListener('fetch', e => { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))); });
