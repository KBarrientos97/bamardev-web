import { describe, expect, it } from "vitest";
import type { Feature, Modulo, Rol } from "../../types";
import { construirMenu } from "../menu";
import { puedeVer, rutaInicial, type Seccion } from "../permisos";

/**
 * Las dos secciones de configuración de la agenda (A8 y A11). Están en su
 * propio archivo para no chocar con los tests de permisos de siempre mientras
 * la agenda se arma en varias ramas.
 */

const MODULOS: Modulo[] = ["INVENTARIO", "POS", "CAJA", "REPORTES", "USUARIOS", "CONFIG"];
const PLAN_BELLEZA: Feature[] = ["pos", "caja", "catalogo", "usuarios", "inventario", "reportes", "agenda"];

function ctx(rol: Rol, rubro: string | undefined, features: Feature[] = PLAN_BELLEZA, modulos = MODULOS) {
  return { rol, rubro, features, modulos };
}

const AMBAS: Seccion[] = ["agenda_config", "config_negocio"];

describe("configuración de la agenda", () => {
  it("el dueño de un salón con la feature ve las dos", () => {
    for (const s of AMBAS) expect(puedeVer(ctx("ADMIN", "PELUQUERIA"), s)).toBe(true);
  });

  it("el encargado configura la agenda pero no las reglas del negocio", () => {
    expect(puedeVer(ctx("SUPERVISOR", "BARBERIA"), "agenda_config")).toBe(true);
    expect(puedeVer(ctx("SUPERVISOR", "BARBERIA"), "config_negocio")).toBe(false);
  });

  it("recepción y el profesional no la ven", () => {
    for (const s of AMBAS) {
      expect(puedeVer(ctx("CAJERO", "SPA"), s)).toBe(false);
      expect(puedeVer(ctx("PROFESIONAL", "SPA"), s)).toBe(false);
    }
  });

  it("no pide módulo de rol (D23): un admin sin módulos la sigue viendo", () => {
    expect(puedeVer(ctx("ADMIN", "UNAS", PLAN_BELLEZA, ["POS"]), "agenda_config")).toBe(true);
  });

  it("sin la feature `agenda` no existe", () => {
    const sinAgenda = PLAN_BELLEZA.filter((f) => f !== "agenda");
    for (const s of AMBAS) expect(puedeVer(ctx("ADMIN", "PELUQUERIA", sinAgenda), s)).toBe(false);
  });

  it("no falla abierta: con la lista de features vacía tampoco aparece", () => {
    for (const s of AMBAS) {
      expect(puedeVer(ctx("ADMIN", "PELUQUERIA", []), s)).toBe(false);
      expect(puedeVer({ rol: "ADMIN", rubro: "PELUQUERIA" }, s)).toBe(false);
    }
  });

  it("restaurante, minimarket y farmacia no ven nada nuevo, ni con la feature prendida", () => {
    for (const rubro of ["RESTAURANTE", "MINIMARKET", "FARMACIA", undefined]) {
      for (const s of AMBAS) expect(puedeVer(ctx("ADMIN", rubro), s)).toBe(false);
    }
  });

  it("el inicio de un restaurante no cambia", () => {
    const antes = rutaInicial(ctx("ADMIN", "RESTAURANTE", ["pos", "caja", "inventario"]));
    const con = rutaInicial(ctx("ADMIN", "RESTAURANTE", ["pos", "caja", "inventario", "agenda"]));
    expect(con).toBe(antes);
  });
});

describe("menú", () => {
  const rotulos = (c: ReturnType<typeof ctx>) =>
    construirMenu((s) => puedeVer(c, s), c.rubro).map((b) => ({
      bloque: b.bloque,
      items: b.nodos.map((n) => n.item.label),
    }));

  it("en un salón con agenda aparece el bloque Agenda y la configuración del negocio", () => {
    const m = rotulos(ctx("ADMIN", "PELUQUERIA"));
    expect(m[0]).toEqual({ bloque: "agenda", items: ["Configuración de agenda"] });
    expect(m.find((b) => b.bloque === "administracion")?.items).toContain("Configuración del negocio");
  });

  it("en un restaurante el menú queda exactamente igual con o sin la feature", () => {
    const base: Feature[] = ["pos", "caja", "catalogo", "usuarios", "inventario", "reportes", "salon"];
    expect(rotulos(ctx("ADMIN", "RESTAURANTE", [...base, "agenda"]))).toEqual(
      rotulos(ctx("ADMIN", "RESTAURANTE", base)),
    );
    expect(rotulos(ctx("ADMIN", "RESTAURANTE", base)).some((b) => b.bloque === "agenda")).toBe(false);
  });
});
