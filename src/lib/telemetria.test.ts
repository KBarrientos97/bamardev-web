import posthog from "posthog-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { esRutaPublica, filtrarEvento, iniciarTelemetria } from "./telemetria";

// B01 (ronda 1 de QA): el token del enlace de gestión salía a PostHog en un
// `$web_vitals` con `$current_url`. Nada de las páginas del cliente final
// (`/r/…`, `/p/…`) puede salir del navegador.
describe("telemetría en las páginas públicas", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reconoce la reserva y la página del negocio como públicas", () => {
    expect(esRutaPublica("/r/bellavista/c/aMj7OBA9fSpfPPFJ7sJeFw")).toBe(true);
    expect(esRutaPublica("/r/bellavista")).toBe(true);
    expect(esRutaPublica("/p/bellavista/privacidad")).toBe(true);
    expect(esRutaPublica("/pos")).toBe(false);
    expect(esRutaPublica("/pagina")).toBe(false);
    expect(esRutaPublica("/reportes")).toBe(false);
  });

  it("en una ruta pública no inicia PostHog aunque haya clave", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_prueba");
    const init = vi.spyOn(posthog, "init").mockImplementation(() => undefined as never);
    window.history.pushState({}, "", "/r/bellavista/c/aMj7OBA9fSpfPPFJ7sJeFw");
    await iniciarTelemetria();
    expect(init).not.toHaveBeenCalled();
  });

  it("fuera de lo público inicia sin web vitals ni dead clicks, con el filtro puesto", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_prueba");
    const init = vi.spyOn(posthog, "init").mockImplementation(() => undefined as never);
    vi.spyOn(posthog, "register").mockImplementation(() => undefined);
    window.history.pushState({}, "", "/pos");
    await iniciarTelemetria();
    expect(init).toHaveBeenCalledTimes(1);
    const config = init.mock.calls[0][1]!;
    expect(config).toMatchObject({
      capture_performance: false,
      capture_dead_clicks: false,
      autocapture: false,
      capture_pageview: false,
      before_send: filtrarEvento,
    });
  });

  // posthog-js se baja aparte (import dinámico): el login y un error del
  // arranque pueden llegar antes que él, y no se tienen que perder.
  it("lo reportado mientras posthog-js se baja sale apenas carga, con el alias del login", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_prueba");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { default: ph } = await import("posthog-js");
    vi.spyOn(ph, "init").mockImplementation(() => undefined as never);
    vi.spyOn(ph, "register").mockImplementation(() => undefined);
    const identify = vi.spyOn(ph, "identify").mockImplementation(() => undefined);
    const capture = vi.spyOn(ph, "capture").mockImplementation(() => undefined);
    window.history.pushState({}, "", "/pos");
    const t = await import("./telemetria");

    const carga = t.iniciarTelemetria();
    t.identificar("resto", "admin", "ADMIN");
    t.reportarError("cobrar", new Error("sin red"));
    expect(capture).not.toHaveBeenCalled();

    await carga;
    expect(identify).toHaveBeenCalledWith("resto_admin", expect.objectContaining({ negocio_alias: "resto" }));
    expect(capture).toHaveBeenCalledWith(
      "error_app",
      expect.objectContaining({ donde: "cobrar", mensaje: "sin red", negocio_alias: "resto", cliente: "web" }),
    );
  });

  it("descarta cualquier evento que lleve una URL pública", () => {
    window.history.pushState({}, "", "/pos");
    const conToken = {
      event: "$web_vitals",
      properties: {
        $current_url: "https://app-qa.bamardev.com/r/elnavajazo/c/aMj7OBA9fSpfPPFJ7sJeFw",
        $pathname: "/r/elnavajazo/c/aMj7OBA9fSpfPPFJ7sJeFw",
      },
    };
    expect(filtrarEvento(conToken)).toBeNull();
    expect(filtrarEvento({ properties: { $current_url: "https://app.bamardev.com/p/bv" } })).toBeNull();
    const delPos = { properties: { $current_url: "https://app.bamardev.com/pos", $pathname: "/pos" } };
    expect(filtrarEvento(delPos)).toBe(delPos);
    // Si el navegador ya está en una ruta pública, se descarta todo.
    window.history.pushState({}, "", "/p/bellavista");
    expect(filtrarEvento(delPos)).toBeNull();
  });
});
