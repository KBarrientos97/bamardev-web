import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { iniciarTelemetria, reportarError } from "./lib/telemetria";

// Antes del render: si el arranque explota, el error igual llega a PostHog.
iniciarTelemetria();

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
