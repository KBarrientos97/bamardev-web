import { beforeEach, describe, expect, it } from "vitest";
import {
  aliasDeLaDireccion,
  olvidarCodigoDeEntrada,
  reiniciarEntradaParaTests,
  tomarCodigoDeEntrada,
} from "./entrada";

/**
 * El código de la landing viaja en el fragmento y se saca de la barra apenas
 * arranca la app (main.tsx), antes que la telemetría mire la URL.
 */

beforeEach(() => {
  sessionStorage.clear();
  reiniciarEntradaParaTests();
});

describe("tomarCodigoDeEntrada", () => {
  it("lee el código, lo borra de la dirección y lo sigue teniendo", () => {
    window.history.replaceState(null, "", "/entrar?negocio=x#c=abc123");
    expect(tomarCodigoDeEntrada()).toBe("abc123");
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("?negocio=x");
    // La pantalla lo vuelve a pedir después: ya no está en la dirección.
    expect(tomarCodigoDeEntrada()).toBe("abc123");
  });

  it("sobrevive a una recarga de la pestaña hasta que se canjea", () => {
    window.history.replaceState(null, "", "/entrar#c=abc123");
    tomarCodigoDeEntrada();
    reiniciarEntradaParaTests(); // la recarga: se pierde la memoria
    window.history.replaceState(null, "", "/entrar");
    expect(tomarCodigoDeEntrada()).toBe("abc123");

    olvidarCodigoDeEntrada();
    expect(tomarCodigoDeEntrada()).toBeNull();
  });

  it("no toca el fragmento de otras rutas", () => {
    window.history.replaceState(null, "", "/pos#c=abc123");
    expect(tomarCodigoDeEntrada()).toBeNull();
    expect(window.location.hash).toBe("#c=abc123");
  });
});

describe("aliasDeLaDireccion", () => {
  it("toma ?negocio= o ?alias=, en minúsculas", () => {
    expect(aliasDeLaDireccion("?negocio=BillarLosPinos")).toBe("billarlospinos");
    expect(aliasDeLaDireccion("?alias=pollos")).toBe("pollos");
    expect(aliasDeLaDireccion("")).toBe("");
  });
});
