import { describe, expect, it } from "vitest";
import { ctxDe, PERMISOS_NUEVOS, type Plantilla } from "../test/sesiones";
import { aplanar, construirMenu, type NodoMenu } from "./menu";
import { puedeVer, rutaInicial } from "./permisos";

/**
 * Pollos Don Omar con las plantillas nuevas (PLAN-ROLES-NEGOCIO §5, decisión
 * 1): tiene que ver EXACTAMENTE las mismas pantallas que antes. Las sesiones se
 * arman con los permisos de las plantillas de restaurante de `catalogo.ts`
 * (cruzados con su plan, como lo hace el backend en el login), y lo esperado
 * son las pantallas que dibujaba la web antes —por rol y módulos de PROD—,
 * capturadas el 06-oct-2026 corriendo el `permisos.ts` viejo.
 *
 * El 11-oct Administración pasó a agruparse por tema en todos los rubros (la
 * división de la barbería, pedido de Kevin): cambió DÓNDE está cada pantalla,
 * no CUÁLES ve. `PANTALLAS_06_OCT` es lo que no se puede mover; `HOY`, cómo
 * se dibuja.
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

function menuDe(plantilla: Plantilla, features: string[], extra: string[] = []) {
  const ctx = ctxDe(plantilla, "RESTAURANTE", features, { extra });
  return { ctx, bloques: construirMenu((s) => puedeVer(ctx, s), "RESTAURANTE") };
}

function loQueVe(plantilla: Plantilla, features: string[], extra: string[] = []) {
  const { ctx, bloques } = menuDe(plantilla, features, extra);
  return {
    ruta: rutaInicial(ctx),
    menu: bloques.map((b) => ({ bloque: b.bloque, items: plano(b.nodos) })),
  };
}

/** Las pantallas, sin los títulos de grupo (Equipo, Finanzas) y sin importar dónde están. */
function pantallas(plantilla: Plantilla, features: string[]) {
  const { bloques } = menuDe(plantilla, features);
  return aplanar(bloques.flatMap((b) => b.nodos))
    .filter((n) => n.item.seccion)
    .map((n) => `${n.item.label} ${n.item.a}`)
    .sort();
}

const INVENTARIO_OMAR = [
  "Inventario /inventario",
  "Artículos /inventario/productos",
  "Categorías /inventario/categorias",
  "Insumos /inventario/insumos",
  "Movimientos /inventario/movimientos",
];

/** Lo que dibujaba la web el 06-oct (rol + módulos de PROD), aplanado. */
const PANTALLAS_06_OCT = {
  OMAR_ADMIN: [
    "Punto de venta /pos",
    ...INVENTARIO_OMAR,
    "Cuentas por cobrar /creditos",
    "Reportes /reportes",
    "Usuarios /usuarios",
  ],
  COMPLETO_ADMIN: [
    "Punto de venta /pos",
    ...INVENTARIO_OMAR,
    "Almacenes /inventario/almacenes",
    "Mesas del salón /mesas",
    "Cuentas por cobrar /creditos",
    "Gastos operativos /gastos",
    "Reportes /reportes",
    "Usuarios /usuarios",
  ],
};

/** Cómo se dibuja desde el 11-oct. Vender y Stock, igual que antes. */
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
      {
        bloque: "administracion",
        // Sin Roles, Equipo tiene un solo hijo y no se dibuja: Usuarios va
        // suelto en su lugar. Lo mismo Finanzas desde que Reportes es de
        // primer nivel (13-oct): le queda sólo Cuentas por cobrar.
        items: ["Usuarios /usuarios", "Cuentas por cobrar /creditos", "Reportes /reportes"],
      },
    ],
  },
  CAJERO: {
    ruta: "/pos",
    menu: [
      { bloque: "vender", items: ["Punto de venta /pos"] },
      // Una carpeta "Finanzas" con una sola cosa adentro sería un clic de más.
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
          "Usuarios /usuarios",
          "Finanzas /creditos",
          "  Cuentas por cobrar /creditos",
          "  Gastos operativos /gastos",
          "Reportes /reportes",
          // Lo que se arma una vez, abajo.
          "Mesas del salón /mesas",
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

  it("la división por tema (11-oct) cambia de lugar las pantallas, no cuáles ve", () => {
    expect(pantallas("ADMIN", OMAR)).toEqual([...PANTALLAS_06_OCT.OMAR_ADMIN].sort());
    expect(pantallas("ADMIN", COMPLETO)).toEqual([...PANTALLAS_06_OCT.COMPLETO_ADMIN].sort());
  });

  it("los permisos nuevos sólo le suman la pantalla de Roles, al lado de Usuarios", () => {
    // El Administrador recibe `roles.gestionar` y compañía en la migración:
    // lo único que se le suma es el ítem nuevo, que con Usuarios arma Equipo.
    const conNuevos = loQueVe("ADMIN", OMAR, PERMISOS_NUEVOS);
    expect(conNuevos.ruta).toBe("/inventario");
    expect(conNuevos.menu).toEqual(
      HOY.OMAR_ADMIN.menu.map((b) =>
        b.bloque === "administracion"
          ? {
              ...b,
              items: [
                "Equipo /usuarios",
                "  Usuarios /usuarios",
                "  Roles /roles",
                "Cuentas por cobrar /creditos",
                "Reportes /reportes",
              ],
            }
          : b,
      ),
    );
  });
});
