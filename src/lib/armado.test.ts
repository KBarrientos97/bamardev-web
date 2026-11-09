import { afterEach, describe, expect, it } from "vitest";
import {
  capturarEntradaDeSoporte,
  olvidarTokenDeSoporte,
  payloadJwt,
  sesionDeSoporte,
  sesionDeToken,
  textoVence,
  tokenDeSoporte,
  vencida,
} from "./armado";

/** La entrada del soporte desde el panel (y "Te la armamos", PLAN-PAGINA-PRO M5). */

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwtDePrueba = (payload: Record<string, unknown>) => `${b64({ alg: "HS256" })}.${b64(payload)}.firma`;

afterEach(() => {
  olvidarTokenDeSoporte();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("token de soporte", () => {
  it("lee el payload sin verificar la firma", () => {
    expect(payloadJwt(jwtDePrueba({ soporte: true, armado: true, exp: 100 }))).toEqual({ soporte: true, armado: true, exp: 100 });
    expect(payloadJwt("no.es.jwt")).toBeNull();
    expect(payloadJwt("x")).toBeNull();
  });

  it("sólo un token de soporte; el armado sale del claim", () => {
    expect(sesionDeToken(jwtDePrueba({ soporte: true, armado: true, exp: 100, negocioId: 7 }))).toMatchObject({
      armado: true,
      vence: 100_000,
      negocioId: 7,
    });
    expect(sesionDeToken(jwtDePrueba({ soporte: true }))?.armado).toBe(false);
    expect(sesionDeToken(jwtDePrueba({ sub: 1 }))).toBeNull();
  });

  it("la entrada del panel guarda el token en la pestaña, limpia la barra y va a /soporte", () => {
    localStorage.setItem("bamardev_web_token", "la-del-dueño");
    const token = jwtDePrueba({ soporte: true, armado: true, exp: Date.now() / 1000 + 1800 });
    window.history.replaceState(null, "", `/#soporte=${encodeURIComponent(token)}&armado=1`);
    expect(capturarEntradaDeSoporte()).toBe(true);
    expect(window.location.pathname).toBe("/soporte");
    expect(window.location.hash).toBe("");
    // La sesión normal del navegador, intacta.
    expect(localStorage.getItem("bamardev_web_token")).toBe("la-del-dueño");
    expect(tokenDeSoporte()).toBe(token);
    expect(sesionDeSoporte()?.armado).toBe(true);
    // En cualquier otra pantalla de esa pestaña, la sesión de siempre.
    window.history.replaceState(null, "", "/pos");
    expect(tokenDeSoporte()).toBeNull();
  });

  it("sin #soporte no hace nada", () => {
    window.history.replaceState(null, "", "/pos#otra=1");
    expect(capturarEntradaDeSoporte()).toBe(false);
    expect(window.location.pathname).toBe("/pos");
  });

  it("vencida y cuánto le queda", () => {
    expect(vencida(null)).toBe(true);
    expect(vencida({ token: "t", armado: true, vence: 1000, negocioId: 1 }, 2000)).toBe(true);
    expect(vencida({ token: "t", armado: true, vence: 3000, negocioId: 1 }, 2000)).toBe(false);
    expect(textoVence(10 * 60_000 + 5_000, 0)).toBe("se vence en 10 min");
    expect(textoVence(20_000, 0)).toBe("se vence en menos de un minuto");
    expect(textoVence(null)).toBe("");
  });
});
