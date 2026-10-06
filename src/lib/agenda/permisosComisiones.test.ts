import { describe, expect, it } from "vitest";
import type { Feature, Rol } from "../../types";
import { construirMenu } from "../menu";
import { puedeVer, type ContextoPermisos } from "../permisos";

/**
 * Comisiones, "Mi producción" y reportes de agenda (fase 2): quién los ve,
 * con los permisos que manda el backend (PLAN-ROLES §5.4) y sin ellos.
 */

const PLAN: Feature[] = ["pos", "caja", "catalogo", "usuarios", "reportes", "agenda", "comisiones"];

/** Los permisos de cada plantilla de belleza que importan acá. */
const PERMISOS: Record<string, { permisos: string[]; propios: string[] }> = {
  ADMIN: { permisos: ["agenda.ver", "comisiones.ver", "comisiones.liquidar", "agenda.reportes"], propios: [] },
  SUPERVISOR: { permisos: ["agenda.ver", "comisiones.ver", "agenda.reportes"], propios: [] },
  CAJERO: { permisos: ["agenda.ver"], propios: [] },
  PROFESIONAL: { permisos: ["agenda.ver", "comisiones.ver"], propios: ["agenda.ver", "comisiones.ver"] },
};

function ctx(rol: Rol, rubro = "PELUQUERIA", features: Feature[] = PLAN): ContextoPermisos {
  const p = PERMISOS[rol];
  return { rol, rubro, features, modulos: [], permisos: p.permisos, permisosPropios: p.propios };
}

describe("comisiones (fase 2)", () => {
  it("las ven el dueño y el encargado; no la recepción ni, en esa pantalla, el profesional", () => {
    expect(puedeVer(ctx("ADMIN"), "comisiones")).toBe(true);
    expect(puedeVer(ctx("SUPERVISOR"), "comisiones")).toBe(true);
    expect(puedeVer(ctx("CAJERO"), "comisiones")).toBe(false);
    expect(puedeVer(ctx("PROFESIONAL"), "comisiones")).toBe(false);
  });

  it("el profesional ve la suya en Mi agenda; nadie más usa esa tarjeta", () => {
    expect(puedeVer(ctx("PROFESIONAL"), "mi_produccion")).toBe(true);
    expect(puedeVer(ctx("ADMIN"), "mi_produccion")).toBe(false);
    expect(puedeVer(ctx("CAJERO"), "mi_produccion")).toBe(false);
  });

  it("sin la feature no existen, ni con la lista vacía (feature estricta)", () => {
    const sin = PLAN.filter((f) => f !== "comisiones");
    expect(puedeVer(ctx("ADMIN", "PELUQUERIA", sin), "comisiones")).toBe(false);
    expect(puedeVer(ctx("PROFESIONAL", "PELUQUERIA", sin), "mi_produccion")).toBe(false);
    expect(puedeVer({ rol: "ADMIN", rubro: "PELUQUERIA", features: [] }, "comisiones")).toBe(false);
  });

  it("un restaurante o una farmacia no las ven aunque alguien prenda la feature", () => {
    for (const rubro of ["RESTAURANTE", "FARMACIA", "MINIMARKET"]) {
      expect(puedeVer(ctx("ADMIN", rubro), "comisiones")).toBe(false);
      expect(puedeVer(ctx("ADMIN", rubro), "reportes_agenda")).toBe(false);
    }
  });
});

describe("reportes de agenda", () => {
  it("con agenda.reportes: dueño y encargado sí, recepción y profesional no", () => {
    expect(puedeVer(ctx("ADMIN"), "reportes_agenda")).toBe(true);
    expect(puedeVer(ctx("SUPERVISOR"), "reportes_agenda")).toBe(true);
    expect(puedeVer(ctx("CAJERO"), "reportes_agenda")).toBe(false);
    expect(puedeVer(ctx("PROFESIONAL"), "reportes_agenda")).toBe(false);
  });

  it("van con la agenda, no con comisiones", () => {
    const sinComisiones = PLAN.filter((f) => f !== "comisiones");
    expect(puedeVer(ctx("ADMIN", "BARBERIA", sinComisiones), "reportes_agenda")).toBe(true);
  });
});

describe("menú", () => {
  it("el dueño de un salón tiene Reportes de agenda y Comisiones", () => {
    const c = ctx("ADMIN");
    const items = construirMenu((s) => puedeVer(c, s), c.rubro).flatMap((b) => b.nodos.map((n) => n.item.label));
    expect(items).toContain("Reportes de agenda");
    expect(items).toContain("Comisiones");
  });
});
