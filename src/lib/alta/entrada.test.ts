import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aliasDeLaDireccion,
  direccionSinAlias,
  olvidarCodigoDeEntrada,
  reiniciarEntradaParaTests,
  tomarCodigoDeEntrada,
  VIGENCIA_CODIGO_MS,
} from "./entrada";

/**
 * El código de la landing viaja en el fragmento y se saca de la barra apenas
 * arranca la app (main.tsx), antes que la telemetría mire la URL.
 */

beforeEach(() => {
  sessionStorage.clear();
  reiniciarEntradaParaTests();
});

afterEach(() => {
  vi.restoreAllMocks();
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

  it("la copia de la pestaña dura lo que el código en el backend (10 minutos)", () => {
    const ahora = Date.now();
    const reloj = vi.spyOn(Date, "now").mockReturnValue(ahora);
    window.history.replaceState(null, "", "/entrar#c=abc123");
    tomarCodigoDeEntrada();

    // Recarga a los 9 minutos: sigue.
    reiniciarEntradaParaTests();
    reloj.mockReturnValue(ahora + VIGENCIA_CODIGO_MS - 60_000);
    expect(tomarCodigoDeEntrada()).toBe("abc123");

    // Recarga pasados los 10: ya no se manda y se borra.
    reiniciarEntradaParaTests();
    reloj.mockReturnValue(ahora + VIGENCIA_CODIGO_MS + 1);
    expect(tomarCodigoDeEntrada()).toBeNull();
    expect(sessionStorage.getItem("bamardev_web_codigo_entrada")).toBeNull();
  });

  it("descarta la copia de antes, sin vencimiento", () => {
    sessionStorage.setItem("bamardev_web_codigo_entrada", "abc123");
    window.history.replaceState(null, "", "/entrar");
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

  it("lo deja como se escribiría a mano: sin espacios", () => {
    expect(aliasDeLaDireccion("?negocio=%20Billar%20Los%20Pinos%20")).toBe("billarlospinos");
    expect(aliasDeLaDireccion("?negocio=billar+los+pinos")).toBe("billarlospinos");
    expect(aliasDeLaDireccion("?negocio=pollos-don-omar2")).toBe("pollos-don-omar2");
  });

  it("descarta lo que no tiene forma de alias", () => {
    expect(aliasDeLaDireccion("?negocio=%3Cscript%3E")).toBe("");
    expect(aliasDeLaDireccion("?negocio=caf%C3%A9")).toBe("");
    expect(aliasDeLaDireccion("?negocio=-pollos")).toBe("");
    expect(aliasDeLaDireccion(`?negocio=${"a".repeat(41)}`)).toBe("");
    expect(aliasDeLaDireccion("?negocio=")).toBe("");
  });
});

describe("direccionSinAlias", () => {
  it("saca negocio y alias y deja lo demás", () => {
    expect(direccionSinAlias("?negocio=x")).toBe("");
    expect(direccionSinAlias("?alias=x&modo=1")).toBe("?modo=1");
    expect(direccionSinAlias("?modo=1&negocio=x&alias=y")).toBe("?modo=1");
  });

  it("sin alias no hay nada que limpiar", () => {
    expect(direccionSinAlias("")).toBeNull();
    expect(direccionSinAlias("?modo=1")).toBeNull();
  });
});
