import { describe, expect, it } from "vitest";
import { ctxDe, PERMISOS_NUEVOS, type Plantilla } from "../test/sesiones";
import { construirMenu, type NodoMenu } from "./menu";
import { puedeVer, rutaInicial } from "./permisos";

/**
 * Pollos Don Omar con las plantillas nuevas (PLAN-ROLES-NEGOCIO §5, decisión
 * 1): tiene que ver EXACTAMENTE lo mismo que hoy. Las sesiones se arman con
 * los permisos de las plantillas de restaurante de `catalogo.ts` (cruzados con
 * su plan, como lo hace el backend en el login), y lo esperado es lo que
 * dibujaba la web antes de este cambio —por rol y módulos de PROD—, capturado
 * el 06-oct-2026 corriendo el `permisos.ts` viejo.
 */

/** BASICO + las 12 cortesías del 01-sep (memoria "Features de Omar en prod"). */
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
/** Un restaurante con todo: salón, gastos y varias sucursales. */
const COMPLETO = [
  ...OMAR,
  "multi_almacen",
  "salon",
  "gastos",
  "reportes_operacion",
  "reportes_rentabilidad",
  "exportacion",
  "lotes",
  "encargos",
];

const plano = (n: NodoMenu[], d = 0): string[] =>
  n.flatMap((x) => [`${"  ".repeat(d)}${x.item.label} ${x.item.a}`, ...plano(x.hijos, d + 1)]);

function loQueVe(plantilla: Plantilla, features: string[], extra: string[] = []) {
  const ctx = ctxDe(plantilla, "RESTAURANTE", features, { extra });
  return {
    ruta: rutaInicial(ctx),
    menu: construirMenu((s) => puedeVer(ctx, s), "RESTAURANTE").map((b) => ({ bloque: b.bloque, items: plano(b.nodos) })),
  };
}

/** Lo que dibujaba la web antes (rol + módulos de PROD). */
const HOY = {
  OMAR_ADMIN: {
    ruta: "/inventario",
    menu: [
      { bloque: "vender", items: ["Punto de venta /pos"] },
      {
        bloque: "stock",
        items: [
          "Inventario /inventario",
          "  Artículos /inventario/productos",
          "  Categorías /inventario/categorias",
          "  Insumos /inventario/insumos",
          "  Movimientos /inventario/movimientos",
        ],
      },
      { bloque: "administracion", items: ["Cuentas por cobrar /creditos", "Reportes /reportes", "Usuarios /usuarios"] },
    ],
  },
  CAJERO: {
    ruta: "/pos",
    menu: [
      { bloque: "vender", items: ["Punto de venta /pos"] },
      { bloque: "administracion", items: ["Cuentas por cobrar /creditos"] },
    ],
  },
  REPARTIDOR: { ruta: "/reparto", menu: [{ bloque: "vender", items: ["Mis entregas /reparto"] }] },
  COMPLETO_ADMIN: {
    ruta: "/inventario",
    menu: [
      { bloque: "vender", items: ["Punto de venta /pos"] },
      {
        bloque: "stock",
        items: [
          "Inventario /inventario",
          "  Artículos /inventario/productos",
          "  Categorías /inventario/categorias",
          "  Insumos /inventario/insumos",
          "  Almacenes /inventario/almacenes",
          "  Movimientos /inventario/movimientos",
        ],
      },
      {
        bloque: "administracion",
        items: [
          "Mesas del salón /mesas",
          "Cuentas por cobrar /creditos",
          "Gastos operativos /gastos",
          "Reportes /reportes",
          "Usuarios /usuarios",
        ],
      },
    ],
  },
  MESERO: { ruta: "/salon", menu: [] },
};

describe("Omar ve lo mismo que hoy con las plantillas de restaurante", () => {
  it("Administrador (omar): mismo menú y entra a Inventario", () => {
    expect(loQueVe("ADMIN", OMAR)).toEqual(HOY.OMAR_ADMIN);
  });

  it("Cajero: mismo menú y entra al POS", () => {
    expect(loQueVe("CAJERO", OMAR)).toEqual(HOY.CAJERO);
  });

  it("Repartidor (omardelivery): sólo sus entregas", () => {
    expect(loQueVe("REPARTIDOR", OMAR)).toEqual(HOY.REPARTIDOR);
  });

  it("con el plan completo tampoco cambia nada (salón, gastos, varias sucursales)", () => {
    expect(loQueVe("ADMIN", COMPLETO)).toEqual(HOY.COMPLETO_ADMIN);
    expect(loQueVe("CAJERO", COMPLETO)).toEqual(HOY.CAJERO);
    expect(loQueVe("MESERO", COMPLETO)).toEqual(HOY.MESERO);
    expect(loQueVe("REPARTIDOR", COMPLETO)).toEqual(HOY.REPARTIDOR);
  });

  it("los permisos nuevos sólo le suman la pantalla de Roles, al lado de Usuarios", () => {
    // El Administrador recibe `roles.gestionar` y compañía en la migración:
    // lo único que se le mueve del menú es el ítem nuevo.
    const conNuevos = loQueVe("ADMIN", OMAR, PERMISOS_NUEVOS);
    expect(conNuevos.ruta).toBe("/inventario");
    expect(conNuevos.menu).toEqual(
      HOY.OMAR_ADMIN.menu.map((b) =>
        b.bloque === "administracion" ? { ...b, items: [...b.items, "Roles /roles"] } : b,
      ),
    );
  });
});
