// sw.js - Service Worker cơ bản
const CACHE_NAME = 'wukong-slot-cache-v1';
// Danh sách các file giao diện cốt lõi cần được lưu lại
const urlsToCache = [
  '/',
  '/index.html',
  '/css/global.css',
  '/css/login.css',
  '/assets/videos/promo.mp4',
  '/assets/images/favicon.png'
];

// Sự kiện 'install': được gọi khi service worker được cài đặt
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Sự kiện 'fetch': được gọi mỗi khi có một yêu cầu mạng từ trang web
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Nếu tìm thấy yêu cầu trong cache, trả về nó ngay lập tức
        if (response) {
          return response;
        }
        // Nếu không, thực hiện yêu cầu mạng thực sự
        return fetch(event.request);
      }
    )
  );
});