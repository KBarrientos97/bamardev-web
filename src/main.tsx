import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { rutaLargaDeLink } from "./lib/pagina/link";
import { enHostLink, esRutaDePaginaPublica } from "./lib/pagina/rutas";
import { iniciarTelemetria, reportarError } from "./lib/telemetria";

// La página del negocio pide sus letras a Google Fonts apenas monta (ver
// `cargarFuentesPagina`), y eso son dos dominios más con su DNS y su TLS.
// Abrir las conexiones ya, mientras baja el pedazo de la página, ahorra esas
// idas y vueltas en datos móviles. Sólo ahí: la app no usa esas letras.
const ruta = enHostLink() ? rutaLargaDeLink(location.pathname) : location.pathname;
if (ruta && esRutaDePaginaPublica(ruta)) {
  for (const [href, anonimo] of [
    ["https://fonts.googleapis.com", false],
    ["https://fonts.gstatic.com", true],
  ] as const) {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = href;
    // Los archivos de letra se piden en modo CORS: sin esto la conexión
    // abierta no se reaprovecha.
    if (anonimo) link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }
}

// Antes del render: si el arranque explota, el error igual llega a PostHog
// (posthog-js se baja aparte y lo que pase mientras tanto espera en una fila).
// En lo público no hace nada: ni se baja.
void iniciarTelemetria();

// Red de seguridad para lo que NO pasa por el interceptor del API: un error de
// render, un `undefined.map` en una pantalla, una promesa sin catch. Sin esto
// el cajero ve una pantalla en blanco y nosotros nunca nos enteramos.
window.addEventListener("error", (e) => {
  reportarError("window.onerror", e.error ?? e.message, {
    tipo: "js",
    origen: `${e.filename}:${e.lineno}`,
  });
});
window.addEventListener("unhandledrejection", (e) => {
  reportarError("unhandledrejection", e.reason, { tipo: "js" });
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
