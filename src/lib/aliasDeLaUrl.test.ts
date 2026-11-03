import { describe, expect, it } from "vitest";
import { aliasDeLaDireccion, direccionSinAlias, usuarioDeLaDireccion } from "./aliasDeLaUrl";

/**
 * El alias del enlace de la landing (`?negocio=…`) se lee para el login y se
 * limpia de la dirección (PLAN-ALTA-LANDING B5).
 */

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

  it("saca también el usuario del QR de despacho", () => {
    expect(direccionSinAlias("?negocio=pollos&usuario=despacho")).toBe("");
    expect(direccionSinAlias("?usuario=despacho&modo=1")).toBe("?modo=1");
  });

  it("sin alias no hay nada que limpiar", () => {
    expect(direccionSinAlias("")).toBeNull();
    expect(direccionSinAlias("?modo=1")).toBeNull();
  });
});

describe("usuarioDeLaDireccion", () => {
  it("el QR de despacho trae el usuario: en la tablet sólo falta la contraseña", () => {
    expect(usuarioDeLaDireccion("?negocio=pollos&usuario=Despacho")).toBe("despacho");
    expect(usuarioDeLaDireccion("?negocio=pollos")).toBe("");
  });

  it("descarta lo que no tiene forma de usuario", () => {
    expect(usuarioDeLaDireccion("?usuario=%3Cscript%3E")).toBe("");
    expect(usuarioDeLaDireccion("?usuario=ab")).toBe("");
  });
});
