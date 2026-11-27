import { describe, expect, it } from "vitest";
import { ctxDe, PERMISOS_NUEVOS, type Plantilla } from "../test/sesiones";
import { aplanar, construirMenu, type NodoMenu } from "./menu";
import { permisoDeSeccion, puedeVer, rutaInicial, type ContextoPermisos } from "./permisos";
import { RUBROS } from "./rubro";

/**
 * «Costos de platos» (CONTRATO-recetas-plato §3.5): sólo en el restaurante,
 * para quien ve los costos y con las recetas prendidas en Configuración. Con
 * el ajuste apagado —el de fábrica— el menú de todos los negocios queda
 * idéntico: `omarPermisos.test.ts` lo sigue vigilando sin el ajuste, y acá se
 * compara el mismo menú con el ajuste apagado a propósito y prendido.
 */

/** Los planes de `omarPermisos.test.ts`: el de Omar y un restaurante con todo. */
const OMAR = [
  "pos",
  "caja",
  "catalogo",
  "usuarios",
  "offline",
  "reportes",
  "inventario",
  "insumos",
  "delivery",
  "recoger",
  "fiado",
  "pago_qr_mixto",
  "combos",
  "mesa_llevar",
  "movimientos_caja",
  "autorizacion_pin",
  "recibo_pdf",
  "aprobacion_inventario",
];
const COMPLETO = [...OMAR, "multi_almacen", "salon", "gastos", "reportes_operacion", "reportes_rentabilidad", "exportacion"];

const PLANTILLAS: Plantilla[] = ["ADMIN", "SUPERVISOR", "CAJERO", "MESERO", "REPARTIDOR"];

const plano = (n: NodoMenu[], d = 0): string[] =>
  n.flatMap((x) => [`${"  ".repeat(d)}${x.item.label} ${x.item.a}`, ...plano(x.hijos, d + 1)]);

function menu(ctx: ContextoPermisos) {
  return construirMenu((s) => puedeVer(ctx, s), ctx.rubro).map((b) => ({ bloque: b.bloque, items: plano(b.nodos) }));
}

const COSTOS = "Costos de platos /inventario/costos-platos";
const tieneCostos = (ctx: ContextoPermisos) =>
  aplanar(construirMenu((s) => puedeVer(ctx, s), ctx.rubro).flatMap((b) => b.nodos)).some(
    (n) => `${n.item.label} ${n.item.a}` === COSTOS,
  );

describe("«Costos de platos» en el menú", () => {
  it("con las recetas apagadas, o sin el dato, el menú de todos queda idéntico", () => {
    for (const plantilla of PLANTILLAS) {
      for (const plan of [OMAR, COMPLETO]) {
        const ctx = ctxDe(plantilla, "RESTAURANTE", plan, { extra: plantilla === "ADMIN" ? PERMISOS_NUEVOS : [] });
        expect(menu({ ...ctx, recetas: false }), `${plantilla}`).toEqual(menu(ctx));
        expect(rutaInicial({ ...ctx, recetas: false })).toBe(rutaInicial(ctx));
        expect(tieneCostos(ctx)).toBe(false);
      }
    }
  });

  it("prendidas, el dueño la ve en Inventario, justo después de Artículos, y nada más se mueve", () => {
    const sin = ctxDe("ADMIN", "RESTAURANTE", OMAR);
    const con = { ...sin, recetas: true };
    expect(menu(con).find((b) => b.bloque === "stock")?.items).toEqual([
      "Inventario /inventario",
      "  Artículos /inventario/productos",
      `  ${COSTOS}`,
      "  Categorías /inventario/categorias",
      "  Insumos /inventario/insumos",
      "  Almacenes /inventario/almacenes",
      "  Movimientos /inventario/movimientos",
    ]);
    expect(menu(con).filter((b) => b.bloque !== "stock")).toEqual(menu(sin).filter((b) => b.bloque !== "stock"));
    // Entra donde entraba.
    expect(rutaInicial(con)).toBe(rutaInicial(sin));
  });

  it("es plata del negocio: la ven quienes ven los costos (dueño y encargado), no la caja", () => {
    const ve = (p: Plantilla) => tieneCostos({ ...ctxDe(p, "RESTAURANTE", COMPLETO), recetas: true });
    expect(ve("ADMIN")).toBe(true);
    expect(ve("SUPERVISOR")).toBe(true);
    expect(ve("CAJERO")).toBe(false);
    expect(ve("MESERO")).toBe(false);
    expect(ve("REPARTIDOR")).toBe(false);
  });

  it("sólo existe en el restaurante, aunque llegara el dato prendido", () => {
    for (const rubro of [...RUBROS.filter((r) => r !== "RESTAURANTE"), "RUBRO_NUEVO"]) {
      expect(tieneCostos({ ...ctxDe("ADMIN", rubro, []), recetas: true }), rubro).toBe(false);
    }
  });
});

describe("la sección costos_platos", () => {
  const ctx = (permisos: string[], recetas?: boolean, rubro = "RESTAURANTE"): ContextoPermisos => ({
    permisos,
    permisosPropios: [],
    rubro,
    features: ["catalogo", "inventario"],
    recetas,
  });

  it("pide `costos.ver`, sin feature del plan", () => {
    expect(permisoDeSeccion("costos_platos")).toBe("costos.ver");
    expect(puedeVer(ctx(["costos.ver"], true), "costos_platos")).toBe(true);
    expect(puedeVer({ ...ctx(["costos.ver"], true), features: ["pos"] }, "costos_platos")).toBe(true);
    expect(puedeVer(ctx(["catalogo.editar", "insumos.gestionar"], true), "costos_platos")).toBe(false);
  });

  it("con las recetas apagadas, o sin saberlo, no", () => {
    expect(puedeVer(ctx(["costos.ver"], false), "costos_platos")).toBe(false);
    expect(puedeVer(ctx(["costos.ver"]), "costos_platos")).toBe(false);
  });

  it("fuera del restaurante, o sin rubro, no", () => {
    expect(puedeVer(ctx(["costos.ver"], true, "FARMACIA"), "costos_platos")).toBe(false);
    expect(puedeVer({ ...ctx(["costos.ver"], true), rubro: undefined }, "costos_platos")).toBe(false);
  });
});
