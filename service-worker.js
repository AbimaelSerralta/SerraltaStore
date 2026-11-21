const CACHE_NAME = "serraltastore-shell-v10";
const APP_FILES = [
  "./", "./index.html", "./manifest.json",
  "./css/base.css", "./css/inicio.css", "./css/productos.css",
  "./css/inventario.css", "./css/clientes.css", "./css/ventas.css", "./css/cuentas.css", "./css/notificaciones.css",
  "./js/app.js", "./js/database.js", "./js/inicio.js", "./js/productos.js",
  "./js/inventario.js", "./js/clientes.js", "./js/ventas.js", "./js/cuentas.js",
  "./js/historial.js", "./js/reportes.js", "./js/respaldos.js", "./js/notificaciones.js",
  "./views/inicio.html", "./views/productos.html", "./views/producto-form.html",
  "./views/inventario.html", "./views/clientes.html", "./views/ventas.html",
  "./views/cuentas.html", "./views/historial.html", "./views/reportes.html", "./views/respaldos.html", "./views/notificaciones.html",
  "./img/icon-180.png", "./img/icon-192.png", "./img/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("serraltastore-") && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
        }
        return response;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    fetch(request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request))
  );
});
