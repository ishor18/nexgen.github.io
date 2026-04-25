const CACHE_NAME = 'nexgen-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/main.js',
    '/supabase.js',
    '/auth.html',
    '/blog.html',
    '/about.html',
    '/contact.html'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});
