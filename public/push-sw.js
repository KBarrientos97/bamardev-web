/*
 * Push en la PWA (FCM). Lo carga el service worker de Workbox con
 * importScripts (vite.config.ts): no es un SW aparte, así la app sigue con uno
 * solo. Muestra SIEMPRE una notificación por cada push (iOS lo exige: un push
 * sin notificación visible le quita el permiso a la app) y, al tocarla, lleva
 * a la pantalla del aviso (`data.url`).
 *
 * FCM manda un JSON con `notification` (título y texto, lo que pone la
 * consola) y `data` (claves propias). Se aceptan los dos.
 */

/**
 * Sólo rutas de la app ("/reportes/cierres"): una dirección completa,
 * "//otro.sitio" o basura abren el inicio. Es la misma regla que
 * `src/lib/push/destino.ts` (este archivo no pasa por Vite y no puede
 * importarla); `pushSw.test.ts` prueba las dos con la misma tabla.
 */
function rutaDePush(url) {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) return "/";
  try {
    const base = "https://app.invalid";
    const u = new URL(url, base);
    if (u.origin !== base) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}

/**
 * La ventana a reusar: una que esté en la app. La página pública de un
 * negocio, la reserva o la TV del salón (mismo origen, otra cosa) no escuchan
 * el aviso de navegar: con una de ésas sola, se abre otra ventana.
 */
function ventanaDeLaApp(ventanas) {
  for (const v of ventanas) {
    let ruta = "/";
    try {
      ruta = new URL(v.url).pathname;
    } catch {
      continue;
    }
    if (/^\/(p|r|tv|prueba-push)(\/|$)/.test(ruta)) continue;
    if ("focus" in v) return v;
  }
  return null;
}

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
      data: { url: rutaDePush(extra.url) },
    }),
  );
});

/*
 * Con la app abierta, se la trae al frente y se le pide que vaya a la ruta
 * con un mensaje (la escucha `useNavegarDesdePush`): navega el router, sin
 * recargar, así no se pierde lo que estaba a medio hacer en otra pantalla.
 * `client.navigate()` recargaría la página entera y además sólo anda con las
 * ventanas que este SW ya controla. Sin ventana de la app, se abre una nueva
 * directo en la ruta.
 */
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const ruta = rutaDePush(evento.notification.data && evento.notification.data.url);
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (ventanas) => {
      const v = ventanaDeLaApp(ventanas);
      if (!v) return self.clients.openWindow(ruta);
      // Primero el foco: el navegador sólo lo deja traer al frente mientras
      // dura el toque. Si igual lo niega, la ruta se pide de todos modos.
      try {
        await v.focus();
      } catch {
        // Sigue abajo.
      }
      v.postMessage({ tipo: "bamardev:abrir-url", url: ruta });
    }),
  );
});
