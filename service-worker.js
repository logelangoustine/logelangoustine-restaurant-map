const CACHE_NAME = "loge-langoustine-v3";
const APP_SHELL = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./GithubRestauranter.json",
    "./manifest.webmanifest",
    "./images/logo.png",
    "./images/loge-langoustine.png",
    "./images/app-icon-180.png",
    "./images/app-icon-192.png",
    "./images/app-icon-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => Promise.all(
                cacheNames
                    .filter(cacheName =>
                        cacheName.startsWith("loge-langoustine-") &&
                        cacheName !== CACHE_NAME
                    )
                    .map(cacheName => caches.delete(cacheName))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;
    const requestUrl = new URL(request.url);

    if(request.method !== "GET" || requestUrl.origin !== self.location.origin){
        return;
    }

    event.respondWith(
        fetch(request)
            .then(response => {
                if(response.ok && response.type === "basic"){
                    return caches.open(CACHE_NAME)
                        .then(cache => cache.put(request, response.clone()))
                        .catch(error => {
                            console.error("Kunne ikke cache:", request.url, error);
                        })
                        .then(() => response);
                }
                return response;
            })
            .catch(async () => {
                const cachedResponse = await caches.match(request);
                if(cachedResponse){
                    return cachedResponse;
                }

                if(request.mode === "navigate"){
                    const cachedApp = await caches.match("./index.html");
                    if(cachedApp){
                        return cachedApp;
                    }
                }

                return Response.error();
            })
    );
});
