import { describe, expect, it } from "vitest";
import type { Feature } from "../types";
import { aplanar, construirMenu, esMenuDeAgenda } from "./menu";
import { puedeVer } from "./permisos";

/**
 * Personal (PLAN-ROLES §9): la pantalla existe sólo en los negocios con
 * agenda (rubro de belleza + feature `agenda`), y la corta el permiso
 * `personal.gestionar` (dueño y encargado).
 */
const SALON: Feature[] = ["pos", "caja", "usuarios", "agenda", "comisiones", "propinas"];
const POLLERIA: Feature[] = ["pos", "caja", "usuarios", "reportes", "delivery"];

const ctx = (extra: Partial<Parameters<typeof puedeVer>[0]> = {}) => ({
  rubro: "BARBERIA",
  features: SALON,
  ...extra,
});

describe("sección Personal", () => {
  it("el dueño y el encargado del salón la ven con personal.gestionar", () => {
    expect(puedeVer(ctx({ permisos: ["personal.gestionar"] }), "personal")).toBe(true);
    expect(puedeVer(ctx({ permisos: ["personal.gestionar", "ventas.vender"] }), "personal")).toBe(true);
  });

  it("sin el permiso no la ve (recepción, el profesional)", () => {
    expect(puedeVer(ctx({ permisos: ["ventas.vender", "agenda.ver"] }), "personal")).toBe(false);
    expect(puedeVer(ctx({ permisos: ["agenda.ver"], permisosPropios: ["agenda.ver"] }), "personal")).toBe(false);
  });

  it("sin la feature agenda no existe, aunque tenga el permiso", () => {
    expect(puedeVer(ctx({ features: ["pos", "usuarios"], permisos: ["personal.gestionar"] }), "personal")).toBe(
      false,
    );
  });

  it("Omar (restaurante) no la ve: ni con agenda prendida por error, ni con sesión vieja sin permisos", () => {
    expect(puedeVer(ctx({ rubro: "RESTAURANTE", features: POLLERIA }), "personal")).toBe(false);
    expect(
      puedeVer(
        ctx({ rubro: "RESTAURANTE", features: [...POLLERIA, "agenda"], permisos: ["personal.gestionar"] }),
        "personal",
      ),
    ).toBe(false);
  });

  it("sin permisos no la ve nadie: no hay respaldo por nombre de rol", () => {
    expect(puedeVer(ctx(), "personal")).toBe(false);
  });
});

describe("menú: Personal en Equipo", () => {
  const menu = (c: ReturnType<typeof ctx>) =>
    construirMenu((s) => puedeVer(c, s), c.rubro, undefined, esMenuDeAgenda(c.rubro, c.features));

  it("es el primer hijo de Equipo en el salón", () => {
    const m = menu(ctx({ permisos: ["personal.gestionar", "usuarios.administrar"] }));
    const equipo = m.flatMap((b) => b.nodos).find((n) => n.item.label === "Equipo");
    expect(equipo?.hijos[0]?.item).toMatchObject({ label: "Personal", a: "/personal" });
  });

  it("no aparece en el menú de un restaurante", () => {
    const m = menu(ctx({ rubro: "RESTAURANTE", features: POLLERIA }));
    expect(aplanar(m.flatMap((b) => b.nodos)).map((n) => n.item.label)).not.toContain("Personal");
  });
});
