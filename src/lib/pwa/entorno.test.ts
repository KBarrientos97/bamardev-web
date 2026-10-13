import { describe, expect, it } from "vitest";
import { abiertaComoApp, esAndroid, esIOS, esLaApp, navegadorIOS } from "./entorno";

// User agents reales (recortados a lo que importa).
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const CHROME_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1";
const EDGE_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/138.0.3351.83 Mobile/15E148 Safari/605.1.15";
const INSTAGRAM_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 389.0.0.20.80";
const IPAD_COMO_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

describe("esLaApp: sólo la app se instala, nunca la página de un negocio", () => {
  it.each([
    ["app.bamardev.com", "/"],
    ["app.bamardev.com", "/pos"],
    ["app-qa.bamardev.com", "/agenda/hoy"],
    ["localhost", "/login"],
    // Una pantalla de la app que empieza con p o r no es pública.
    ["app.bamardev.com", "/productos"],
    ["app.bamardev.com", "/reportes"],
  ])("%s%s es la app", (host, ruta) => {
    expect(esLaApp(host, ruta)).toBe(true);
  });

  it.each([
    ["app.bamardev.com", "/p/barberia-juan"],
    ["app.bamardev.com", "/r/barberia-juan/reservar"],
    ["link.bamardev.com", "/barberia-juan"],
    ["link-qa.bamardev.com", "/"],
  ])("%s%s es pública", (host, ruta) => {
    expect(esLaApp(host, ruta)).toBe(false);
  });
});

describe("esIOS", () => {
  it("reconoce el iPhone con cualquier navegador", () => {
    expect(esIOS(SAFARI_IPHONE)).toBe(true);
    expect(esIOS(CHROME_IPHONE)).toBe(true);
  });

  it("el iPad se hace pasar por Mac: lo delata la pantalla táctil", () => {
    expect(esIOS(IPAD_COMO_MAC, 5)).toBe(true);
    // Una Mac de verdad no tiene pantalla táctil.
    expect(esIOS(IPAD_COMO_MAC, 0)).toBe(false);
  });

  it("Android y Windows no son iOS", () => {
    expect(esIOS(CHROME_ANDROID, 5)).toBe(false);
    expect(esIOS(CHROME_WINDOWS)).toBe(false);
    expect(esAndroid(CHROME_ANDROID)).toBe(true);
    expect(esAndroid(SAFARI_IPHONE)).toBe(false);
  });
});

describe("navegadorIOS: los pasos cambian según el navegador", () => {
  it.each([
    [SAFARI_IPHONE, "safari"],
    [CHROME_IPHONE, "chrome"],
    [EDGE_IPHONE, "edge"],
    // El navegador de adentro de Instagram no deja agregar a inicio.
    [INSTAGRAM_IPHONE, "otro"],
  ])("%#", (ua, esperado) => {
    expect(navegadorIOS(ua)).toBe(esperado);
  });
});

describe("abiertaComoApp", () => {
  it("en iOS lo dice navigator.standalone", () => {
    expect(abiertaComoApp(() => false, true)).toBe(true);
  });

  it("en el resto, el modo de pantalla", () => {
    expect(abiertaComoApp((q) => q === "(display-mode: standalone)", undefined)).toBe(true);
    expect(abiertaComoApp(() => false, undefined)).toBe(false);
    expect(abiertaComoApp(() => false, false)).toBe(false);
  });
});
