import { describe, expect, it } from "vitest";
import { ctxDe, type Plantilla } from "../test/sesiones";
import { aplanar, construirMenu, esActivo, type ItemNav } from "./menu";
import { puedeVer, RUTA_PAGOS_PENDIENTES, type ContextoPermisos } from "./permisos";
import { queCuentaElMenu } from "./rotuloContador";

/**
 * El atajo «Pagos pendientes» del menú (26-nov): cuelga del mismo permiso que
 * «Seguimiento», justo debajo, y sólo se enciende él en su pantalla.
 */

const PLAN_NUTRICION = ["pos", "caja", "catalogo", "usuarios", "inventario", "reportes", "gastos", "nutricion"];
const ctx = (rol: Plantilla, rubro: string): ContextoPermisos => ctxDe(rol, rubro, PLAN_NUTRICION, {});
const rutas = (c: ContextoPermisos) =>
  aplanar(construirMenu((s) => puedeVer(c, s), c.rubro).flatMap((b) => b.nodos)).map((n) => n.item.a);

describe("«Pagos pendientes» en el menú", () => {
  it("en NUTRICION con el permiso del seguimiento va justo debajo de «Seguimiento»", () => {
    const r = rutas(ctx("ADMIN", "NUTRICION"));
    const i = r.indexOf("/seguimiento");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(r[i + 1]).toBe(RUTA_PAGOS_PENDIENTES);
  });

  it("sin el permiso del seguimiento no aparece", () => {
    const r = rutas(ctx("CAJERO", "NUTRICION"));
    expect(r).not.toContain(RUTA_PAGOS_PENDIENTES);
  });

  it("en otro rubro no aparece", () => {
    for (const rubro of ["RESTAURANTE", "FARMACIA", "BARBERIA"]) {
      expect(rutas(ctx("ADMIN", rubro)), rubro).not.toContain(RUTA_PAGOS_PENDIENTES);
    }
  });
});

describe("qué ítem se enciende", () => {
  const items = aplanar(construirMenu(() => true, "NUTRICION").flatMap((b) => b.nodos)).map((n) => n.item);
  const de = (a: string): ItemNav => items.find((i) => i.a === a)!;

  it("/seguimiento/pagos enciende «Pagos pendientes» y no «Seguimiento»", () => {
    expect(esActivo(de(RUTA_PAGOS_PENDIENTES), "/seguimiento/pagos")).toBe(true);
    expect(esActivo(de("/seguimiento"), "/seguimiento/pagos")).toBe(false);
  });

  it("la hoja de un paciente sigue encendiendo «Seguimiento»", () => {
    expect(esActivo(de("/seguimiento"), "/seguimiento/12")).toBe(true);
    expect(esActivo(de(RUTA_PAGOS_PENDIENTES), "/seguimiento/12")).toBe(false);
    expect(esActivo(de("/seguimiento"), "/seguimiento")).toBe(true);
  });
});

describe("lo que dice el lector de pantalla", () => {
  it("«1 debe», «2 deben»", () => {
    expect(queCuentaElMenu("seguimiento", 1)).toBe("debe");
    expect(queCuentaElMenu("seguimiento", 2)).toBe("deben");
  });
});
