import { describe, expect, it } from "vitest";
import type { Feature, Rol } from "../types";
import { construirMenu } from "./menu";
import {
  puedeVer,
  rutaInicial,
  tienePermiso,
  veSoloSuAgenda,
  type ContextoPermisos,
  type Seccion,
} from "./permisos";

/**
 * Las secciones de la agenda (fase 1 de belleza): las decide la feature
 * `agenda`, el rubro y el rol —sin módulo, D23—, y no le mueven nada a Omar
 * ni a la farmacia.
 */

const CON_AGENDA: Feature[] = ["pos", "caja", "catalogo", "usuarios", "reportes", "agenda", "clientes"];
const SIN_AGENDA: Feature[] = ["pos", "caja", "catalogo", "usuarios", "reportes"];

function ctx(rol: Rol, rubro: string, features: Feature[] = CON_AGENDA): ContextoPermisos {
  // Los roles de belleza no traen módulos de agenda: la lista del cajero es la
  // de siempre y la del profesional viene vacía.
  const modulos = rol === "PROFESIONAL" ? [] : rol === "CAJERO" ? ["POS", "CAJA"] : ["INVENTARIO", "POS", "CAJA", "REPORTES", "USUARIOS"];
  return { rol, modulos, features, rubro };
}

const AGENDA: Seccion[] = ["agenda", "hoy", "mi_agenda"];
const ver = (c: ContextoPermisos) => AGENDA.filter((s) => puedeVer(c, s));

describe("quién ve la agenda", () => {
  it("recepción y dueño ven Agenda y Hoy; el profesional sólo Mi agenda", () => {
    expect(ver(ctx("ADMIN", "PELUQUERIA"))).toEqual(["agenda", "hoy"]);
    expect(ver(ctx("SUPERVISOR", "BARBERIA"))).toEqual(["agenda", "hoy"]);
    expect(ver(ctx("CAJERO", "SPA"))).toEqual(["agenda", "hoy"]);
    expect(ver(ctx("PROFESIONAL", "UNAS"))).toEqual(["mi_agenda"]);
  });

  it("el profesional sigue sin ver nada más, aunque sus listas fallen abiertas", () => {
    const otras: Seccion[] = ["pos", "caja", "inventario", "reportes", "usuarios", "creditos", "gastos"];
    for (const s of otras) expect(puedeVer(ctx("PROFESIONAL", "PELUQUERIA"), s), s).toBe(false);
  });

  it("sin la feature `agenda` no hay agenda, ni siquiera con la lista vacía", () => {
    // La regla de siempre falla abierta; la agenda no: se prende a propósito.
    expect(ver(ctx("ADMIN", "PELUQUERIA", SIN_AGENDA))).toEqual([]);
    expect(ver(ctx("ADMIN", "PELUQUERIA", []))).toEqual([]);
    expect(ver({ rol: "PROFESIONAL", rubro: "BARBERIA" })).toEqual([]);
  });

  it("Omar y la farmacia no la ven aunque alguien les prenda la feature", () => {
    expect(ver(ctx("ADMIN", "RESTAURANTE"))).toEqual([]);
    expect(ver(ctx("CAJERO", "RESTAURANTE"))).toEqual([]);
    expect(ver(ctx("ADMIN", "FARMACIA"))).toEqual([]);
    // Sin rubro (una sesión vieja) tampoco.
    expect(ver({ rol: "ADMIN", features: CON_AGENDA })).toEqual([]);
  });

  it("el mesero y el repartidor no entran", () => {
    expect(ver(ctx("MESERO", "PELUQUERIA"))).toEqual([]);
    expect(ver(ctx("REPARTIDOR", "PELUQUERIA"))).toEqual([]);
  });
});

describe("dónde entra cada uno", () => {
  it("en belleza con agenda: recepción a Hoy, dueño y encargado a la Agenda", () => {
    expect(rutaInicial(ctx("CAJERO", "PELUQUERIA"))).toBe("/hoy");
    expect(rutaInicial(ctx("ADMIN", "PELUQUERIA"))).toBe("/agenda");
    expect(rutaInicial(ctx("SUPERVISOR", "SPA"))).toBe("/agenda");
    expect(rutaInicial(ctx("PROFESIONAL", "BARBERIA"))).toBe("/mi-agenda");
  });

  it("sin la feature, todos entran donde entraban", () => {
    expect(rutaInicial(ctx("CAJERO", "PELUQUERIA", SIN_AGENDA))).toBe("/pos");
    expect(rutaInicial(ctx("ADMIN", "PELUQUERIA", SIN_AGENDA))).not.toBe("/agenda");
    expect(rutaInicial(ctx("PROFESIONAL", "BARBERIA", SIN_AGENDA))).toBe("/mi-agenda");
  });

  it("Omar sigue entrando al POS y a inventario", () => {
    expect(rutaInicial(ctx("CAJERO", "RESTAURANTE"))).toBe("/pos");
    expect(rutaInicial({ ...ctx("ADMIN", "RESTAURANTE"), features: [...CON_AGENDA, "inventario"] })).toBe(
      "/inventario",
    );
  });
});

describe("el menú", () => {
  const etiquetas = (c: ContextoPermisos) =>
    construirMenu((s) => puedeVer(c, s), c.rubro)
      .flatMap((b) => b.nodos)
      .map((n) => n.item.label);

  it("en un salón con agenda, el grupo Agenda y Clientes van primero", () => {
    expect(etiquetas(ctx("CAJERO", "PELUQUERIA")).slice(0, 3)).toEqual(["Agenda", "Clientes", "Punto de venta"]);
  });

  it("al restaurante no le aparece nada nuevo", () => {
    const menu = etiquetas(ctx("ADMIN", "RESTAURANTE"));
    expect(menu).not.toContain("Agenda");
    expect(menu).not.toContain("Hoy");
    expect(menu).not.toContain("Clientes");
  });
});

describe("A7 · Clientes", () => {
  it("recepción y dueño la ven; el profesional no (ve la ficha mínima en su cita)", () => {
    expect(puedeVer(ctx("ADMIN", "PELUQUERIA"), "clientes")).toBe(true);
    expect(puedeVer(ctx("SUPERVISOR", "SPA"), "clientes")).toBe(true);
    expect(puedeVer(ctx("CAJERO", "BARBERIA"), "clientes")).toBe(true);
    expect(puedeVer(ctx("PROFESIONAL", "PELUQUERIA"), "clientes")).toBe(false);
  });

  it("sin la feature `clientes` no existe, aunque la lista venga vacía", () => {
    expect(puedeVer(ctx("ADMIN", "PELUQUERIA", ["pos", "agenda"]), "clientes")).toBe(false);
    expect(puedeVer(ctx("ADMIN", "PELUQUERIA", []), "clientes")).toBe(false);
  });

  it("Omar y la farmacia no la ven aunque tengan la feature", () => {
    expect(puedeVer(ctx("ADMIN", "RESTAURANTE"), "clientes")).toBe(false);
    expect(puedeVer(ctx("ADMIN", "FARMACIA"), "clientes")).toBe(false);
  });
});

/**
 * PLAN-ROLES R4: cuando el backend manda `permisos`, las secciones de la
 * agenda (que el backend ya corta por permisos) se deciden con ellos y no
 * por el nombre del rol. Sin permisos, todo sigue como arriba.
 */
describe("la agenda por permisos (cuando vienen)", () => {
  const RECEPCION = ["agenda.ver", "agenda.gestionar", "agenda.estado", "cliente.ver_ficha"];
  const conPermisos = (
    rol: Rol,
    permisos: string[],
    propios: string[] = [],
    rubro = "PELUQUERIA",
  ): ContextoPermisos => ({ ...ctx(rol, rubro), permisos, permisosPropios: propios, arquetipo: rol });
  const ver = (c: ContextoPermisos) =>
    (["agenda", "hoy", "mi_agenda", "agenda_config", "config_negocio"] as Seccion[]).filter((s) =>
      puedeVer(c, s),
    );

  it("recepción ve Agenda y Hoy, no la configuración", () => {
    expect(ver(conPermisos("CAJERO", RECEPCION))).toEqual(["agenda", "hoy"]);
  });

  it("el profesional (alcance PROPIO) ve sólo Mi agenda", () => {
    expect(ver(conPermisos("PROFESIONAL", ["agenda.ver", "agenda.estado"], ["agenda.ver", "agenda.estado"]))).toEqual([
      "mi_agenda",
    ]);
  });

  it("el encargado con agenda.configurar ve la configuración y las reglas", () => {
    expect(ver(conPermisos("SUPERVISOR", [...RECEPCION, "agenda.configurar"]))).toEqual([
      "agenda",
      "hoy",
      "agenda_config",
      "config_negocio",
    ]);
  });

  it("un cajero al que no le llegó agenda.ver no ve la agenda aunque su rol la tuviera", () => {
    expect(ver(conPermisos("CAJERO", ["ventas.vender"]))).toEqual([]);
  });

  it("el rubro sigue mandando: un restaurante no ve la agenda aunque lleguen permisos", () => {
    expect(ver(conPermisos("ADMIN", [...RECEPCION, "agenda.configurar"], [], "RESTAURANTE"))).toEqual([]);
  });

  it("lo demás no cambia por traer permisos (Omar y la farmacia)", () => {
    const omar = { ...ctx("CAJERO", "RESTAURANTE", ["pos", "caja", "fiado"]), permisos: ["ventas.vender"] };
    expect(puedeVer(omar, "pos")).toBe(true);
    expect(puedeVer(omar, "caja")).toBe(true);
    expect(puedeVer(omar, "reportes")).toBe(false);
  });

  it("la ruta inicial sale del arquetipo si viene", () => {
    expect(rutaInicial({ ...conPermisos("PROFESIONAL", ["agenda.ver"], ["agenda.ver"]) })).toBe("/mi-agenda");
    expect(rutaInicial(conPermisos("CAJERO", RECEPCION))).toBe("/hoy");
  });
});

describe("tienePermiso / veSoloSuAgenda", () => {
  it("con permisos manda el permiso; sin ellos, el respaldo", () => {
    expect(tienePermiso({ permisos: ["agenda.sobreturno"] }, "agenda.sobreturno", false)).toBe(true);
    expect(tienePermiso({ permisos: [] }, "agenda.sobreturno", true)).toBe(false);
    expect(tienePermiso({}, "agenda.sobreturno", true)).toBe(true);
    expect(tienePermiso(null, "agenda.sobreturno", false)).toBe(false);
  });

  it("ve sólo su agenda: por alcance si hay permisos, por rol si no", () => {
    expect(veSoloSuAgenda({ rol: "PROFESIONAL" })).toBe(true);
    expect(veSoloSuAgenda({ rol: "CAJERO" })).toBe(false);
    expect(veSoloSuAgenda({ rol: "CAJERO", permisos: ["agenda.ver"], permisosPropios: ["agenda.ver"] })).toBe(true);
    expect(
      veSoloSuAgenda({ rol: "PROFESIONAL", permisos: ["agenda.ver", "agenda.gestionar"], permisosPropios: [] }),
    ).toBe(false);
  });
});
