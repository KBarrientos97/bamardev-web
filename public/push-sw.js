/*
 * Push en la PWA (FCM). Lo carga el service worker de Workbox con
 * importScripts (vite.config.ts): no es un SW aparte, así la app sigue con uno
 * solo. Muestra SIEMPRE una notificación por cada push (iOS lo exige: un push
 * sin notificación visible le quita el permiso a la app) y, al tocarla, abre
 * la app o la trae al frente.
 *
 * FCM manda un JSON con `notification` (título y texto, lo que pone la
 * consola) y `data` (claves propias). Se aceptan los dos.
 */
self.addEventListener("push", (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    datos = { notification: { body: evento.data ? evento.data.text() : "" } };
  }
  const aviso = datos.notification || {};
  const extra = datos.data || {};
  const titulo = aviso.title || extra.titulo || "BamarDev";
  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: aviso.body || extra.cuerpo || "",
      icon: "/pwa-192.png",
      badge: "/pwa-192.png",
      data: { url: extra.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const url = (evento.notification.data && evento.notification.data.url) || "/";
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ("focus" in v) return v.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
