import { describe, expect, it } from "vitest";
import type { Feature } from "../types";
import { ctxDe, type Plantilla } from "../test/sesiones";
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
 * Las secciones de la agenda (fase 1 de belleza): las deciden los permisos,
 * la feature `agenda` y el rubro, y no le mueven nada a Omar ni a la farmacia.
 */

const CON_AGENDA: Feature[] = ["pos", "caja", "catalogo", "usuarios", "reportes", "agenda", "clientes"];
const SIN_AGENDA: Feature[] = ["pos", "caja", "catalogo", "usuarios", "reportes"];

const ctx = (plantilla: Plantilla, rubro: string | undefined, features: Feature[] = CON_AGENDA) =>
  ctxDe(plantilla, rubro, features);

const AGENDA: Seccion[] = ["agenda", "hoy", "mi_agenda"];
const ver = (c: ContextoPermisos) => AGENDA.filter((s) => puedeVer(c, s));

describe("quién ve la agenda", () => {
  it("recepción y dueño ven Agenda y Hoy; el profesional sólo Mi agenda", () => {
    expect(ver(ctx("ADMIN", "PELUQUERIA"))).toEqual(["agenda", "hoy"]);
    expect(ver(ctx("SUPERVISOR", "BARBERIA"))).toEqual(["agenda", "hoy"]);
    expect(ver(ctx("CAJERO", "SPA"))).toEqual(["agenda", "hoy"]);
    expect(ver(ctx("PROFESIONAL", "UNAS"))).toEqual(["mi_agenda"]);
  });

  it("el profesional sigue sin ver nada más", () => {
    const otras: Seccion[] = ["pos", "caja", "inventario", "reportes", "usuarios", "creditos", "gastos"];
    for (const s of otras) expect(puedeVer(ctx("PROFESIONAL", "PELUQUERIA"), s), s).toBe(false);
  });

  it("sin la feature `agenda` no hay agenda, ni siquiera con la lista vacía", () => {
    expect(ver(ctx("ADMIN", "PELUQUERIA", SIN_AGENDA))).toEqual([]);
    expect(ver(ctx("ADMIN", "PELUQUERIA", []))).toEqual([]);
  });

  it("Omar y la farmacia no la ven aunque alguien les prenda la feature", () => {
    expect(ver(ctx("ADMIN", "RESTAURANTE"))).toEqual([]);
    expect(ver(ctx("CAJERO", "RESTAURANTE"))).toEqual([]);
    expect(ver(ctx("ADMIN", "FARMACIA"))).toEqual([]);
    // Sin rubro (una sesión vieja) tampoco.
    expect(ver(ctx("ADMIN", undefined))).toEqual([]);
  });

  it("el mesero y el repartidor no entran", () => {
    expect(ver(ctx("MESERO", "PELUQUERIA"))).toEqual([]);
    expect(ver(ctx("REPARTIDOR", "PELUQUERIA"))).toEqual([]);
  });
});

describe("dónde entra cada uno", () => {
  it("en belleza con agenda: recepción a Hoy, dueño y encargado a la Agenda", () => {
    // Quien configura la agenda la mira entera; quien atiende el mostrador,
    // la lista de hoy.
    expect(rutaInicial(ctx("CAJERO", "PELUQUERIA"))).toBe("/hoy");
    expect(rutaInicial(ctx("ADMIN", "PELUQUERIA"))).toBe("/agenda");
    expect(rutaInicial(ctx("SUPERVISOR", "SPA"))).toBe("/agenda");
    expect(rutaInicial(ctx("PROFESIONAL", "BARBERIA"))).toBe("/mi-agenda");
  });

  it("sin la feature, todos entran donde entraban", () => {
    expect(rutaInicial(ctx("CAJERO", "PELUQUERIA", SIN_AGENDA))).toBe("/pos");
    expect(rutaInicial(ctx("ADMIN", "PELUQUERIA", SIN_AGENDA))).not.toBe("/agenda");
  });

  it("Omar sigue entrando al POS y a inventario", () => {
    expect(rutaInicial(ctx("CAJERO", "RESTAURANTE"))).toBe("/pos");
    expect(rutaInicial(ctx("ADMIN", "RESTAURANTE", [...CON_AGENDA, "inventario"]))).toBe("/inventario");
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

describe("la agenda, permiso por permiso", () => {
  const RECEPCION = ["agenda.ver", "agenda.gestionar", "agenda.estado", "cliente.ver_ficha"];
  const conPermisos = (permisos: string[], propios: string[] = [], rubro = "PELUQUERIA"): ContextoPermisos => ({
    features: CON_AGENDA,
    rubro,
    permisos,
    permisosPropios: propios,
  });
  const verTodo = (c: ContextoPermisos) =>
    (["agenda", "hoy", "mi_agenda", "agenda_config", "config_negocio"] as Seccion[]).filter((s) => puedeVer(c, s));

  it("recepción ve Agenda y Hoy, no la configuración", () => {
    expect(verTodo(conPermisos(RECEPCION))).toEqual(["agenda", "hoy"]);
  });

  it("con alcance PROPIO se ve sólo Mi agenda", () => {
    expect(verTodo(conPermisos(["agenda.ver", "agenda.estado"], ["agenda.ver", "agenda.estado"]))).toEqual([
      "mi_agenda",
    ]);
  });

  it("con agenda.configurar se ve la configuración y las reglas", () => {
    expect(verTodo(conPermisos([...RECEPCION, "agenda.configurar"]))).toEqual([
      "agenda",
      "hoy",
      "agenda_config",
      "config_negocio",
    ]);
  });

  it("sin agenda.ver no hay agenda, se llame como se llame el rol", () => {
    expect(verTodo(conPermisos(["ventas.vender"]))).toEqual([]);
  });

  it("el rubro sigue mandando: un restaurante no ve la agenda aunque lleguen permisos", () => {
    expect(verTodo(conPermisos([...RECEPCION, "agenda.configurar"], [], "RESTAURANTE"))).toEqual([]);
  });
});

describe("tienePermiso / veSoloSuAgenda", () => {
  it("manda el permiso; sin permisos, no", () => {
    expect(tienePermiso({ permisos: ["agenda.sobreturno"] }, "agenda.sobreturno")).toBe(true);
    expect(tienePermiso({ permisos: [] }, "agenda.sobreturno")).toBe(false);
    expect(tienePermiso({}, "agenda.sobreturno")).toBe(false);
    expect(tienePermiso(null, "agenda.sobreturno")).toBe(false);
  });

  it("ve sólo su agenda: agenda.ver PROPIO y sin gestionar la de todos", () => {
    expect(veSoloSuAgenda({})).toBe(false);
    expect(veSoloSuAgenda({ permisos: ["agenda.ver"], permisosPropios: ["agenda.ver"] })).toBe(true);
    expect(veSoloSuAgenda({ permisos: ["agenda.ver"], permisosPropios: [] })).toBe(false);
    expect(
      veSoloSuAgenda({ permisos: ["agenda.ver", "agenda.gestionar"], permisosPropios: ["agenda.ver"] }),
    ).toBe(false);
  });
});
