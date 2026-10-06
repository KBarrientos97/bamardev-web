import { describe, expect, it } from "vitest";
import type { Feature } from "../../types";
import { ctxDe, type Plantilla } from "../../test/sesiones";
import { construirMenu } from "../menu";
import { puedeVer, rutaInicial, type Seccion } from "../permisos";

/**
 * Las dos secciones de configuración de la agenda (A8 y A11). Están en su
 * propio archivo para no chocar con los tests de permisos de siempre mientras
 * la agenda se arma en varias ramas.
 */

const PLAN_BELLEZA: Feature[] = ["pos", "caja", "catalogo", "usuarios", "inventario", "reportes", "agenda"];

function ctx(plantilla: Plantilla, rubro: string | undefined, features: Feature[] = PLAN_BELLEZA) {
  return ctxDe(plantilla, rubro, features);
}

const AMBAS: Seccion[] = ["agenda_config", "config_negocio"];

describe("configuración de la agenda", () => {
  it("el dueño de un salón con la feature ve las dos", () => {
    for (const s of AMBAS) expect(puedeVer(ctx("ADMIN", "PELUQUERIA"), s)).toBe(true);
  });

  it("el encargado, con agenda.configurar, ve las dos (es el permiso que pide el backend)", () => {
    expect(puedeVer(ctx("SUPERVISOR", "BARBERIA"), "agenda_config")).toBe(true);
    expect(puedeVer(ctx("SUPERVISOR", "BARBERIA"), "config_negocio")).toBe(true);
    // Un encargado al que el dueño le sacó la configuración, no.
    const sinConfig = ctxDe("SUPERVISOR", "BARBERIA", PLAN_BELLEZA, { sin: ["agenda.configurar"] });
    for (const s of AMBAS) expect(puedeVer(sinConfig, s)).toBe(false);
  });

  it("recepción y el profesional no la ven", () => {
    for (const s of AMBAS) {
      expect(puedeVer(ctx("CAJERO", "SPA"), s)).toBe(false);
      expect(puedeVer(ctx("PROFESIONAL", "SPA"), s)).toBe(false);
    }
  });

  it("la decide el permiso, no el nombre del rol", () => {
    const soloConfig = { rubro: "UNAS", features: PLAN_BELLEZA, permisos: ["agenda.configurar"] };
    expect(puedeVer(soloConfig, "agenda_config")).toBe(true);
  });

  it("sin la feature `agenda` no existe", () => {
    const sinAgenda = PLAN_BELLEZA.filter((f) => f !== "agenda");
    for (const s of AMBAS) expect(puedeVer(ctx("ADMIN", "PELUQUERIA", sinAgenda), s)).toBe(false);
  });

  it("no falla abierta: con la lista de features vacía tampoco aparece", () => {
    for (const s of AMBAS) {
      expect(puedeVer(ctx("ADMIN", "PELUQUERIA", []), s)).toBe(false);
      expect(puedeVer({ rubro: "PELUQUERIA", permisos: ["agenda.configurar"] }, s)).toBe(false);
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
    expect(m[0]).toEqual({
      bloque: "agenda",
      items: ["Agenda"],
    });
    const agenda = construirMenu((s) => puedeVer(ctx("ADMIN", "PELUQUERIA"), s), "PELUQUERIA")[0].nodos[0];
    expect(agenda.hijos.map((h) => h.item.label)).toEqual([
      "Agenda del día",
      "Hoy",
      "Reportes",
      "Configuración",
    ]);
    // El grupo no tiene pantalla propia: lleva a la del día.
    expect(agenda.item.a).toBe("/agenda");
    expect(m.find((b) => b.bloque === "administracion")?.items).toContain("Configuración");
  });

  it("en un restaurante el menú queda exactamente igual con o sin la feature", () => {
    const base: Feature[] = ["pos", "caja", "catalogo", "usuarios", "inventario", "reportes", "salon"];
    expect(rotulos(ctx("ADMIN", "RESTAURANTE", [...base, "agenda"]))).toEqual(
      rotulos(ctx("ADMIN", "RESTAURANTE", base)),
    );
    expect(rotulos(ctx("ADMIN", "RESTAURANTE", base)).some((b) => b.bloque === "agenda")).toBe(false);
  });
});
