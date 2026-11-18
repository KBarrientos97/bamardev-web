import { describe, expect, it } from "vitest";
import { ctxDe, PERMISOS_NUEVOS, type Plantilla } from "../test/sesiones";
import {
  configuracionEnLista,
  OPCIONES_CONFIGURACION,
  opcionesConfiguracion,
  RUTA_CONFIGURACION,
  veConfiguracion,
} from "./configuracion";
import { aplanar, construirMenu, esActivo, tituloDe, type BloqueMenu, type NodoMenu } from "./menu";
import { puedeVer, rutaInicial, type ContextoPermisos } from "./permisos";
import { RUBROS } from "./rubro";

/**
 * «Configuración» del restaurante (15-nov), como en la app: UNA entrada del
 * menú que abre la lista de lo que se ajusta del negocio. Es el espejo de
 * `PermisosConfiguracionTest.kt` de Android, más las dos opciones que existen
 * sólo en la web (Inventario y stock, Datos de las sucursales).
 *
 * Por qué: en el restaurante el grupo «Configuración» tenía un hijo que
 * también se llamaba «Configuración» (el recibo), y el recibo venía con los
 * extras de las TVs: el dueño de un restaurante sin TVs no encontraba dónde
 * poner su logo.
 */

/** Un restaurante sin TVs: el plan de todos los días, con el cobro por QR. */
const SIN_TVS = [
  "pos", "caja", "catalogo", "usuarios", "offline", "reportes", "inventario", "insumos", "delivery", "recoger",
  "fiado", "pago_qr_mixto", "combos", "mesa_llevar", "movimientos_caja", "autorizacion_pin", "recibo_pdf",
  "aprobacion_inventario",
];
const CON_TICKETS = [...SIN_TVS, "tickets_pedido"];
const CON_MENU = [...SIN_TVS, "menu_digital"];

const ctx = (rol: Plantilla, features: string[], rubro = "RESTAURANTE", opc: { extra?: string[]; sin?: string[] } = {}) =>
  ctxDe(rol, rubro, features, opc);
const opciones = (c: ContextoPermisos) => opcionesConfiguracion((s) => puedeVer(c, s), c.rubro).map((o) => o.titulo);
const menuDe = (c: ContextoPermisos) => construirMenu((s) => puedeVer(c, s), c.rubro);
const nodos = (m: BloqueMenu[]): NodoMenu[] => aplanar(m.flatMap((b) => b.nodos));

describe("Configuración del restaurante: qué opciones ve cada quien", () => {
  it("un restaurante sin TVs ve el recibo y el QR adentro, con lo de la web", () => {
    // El caso que lo trajo: sin los extras de las TVs no había dónde poner el logo.
    expect(opciones(ctx("ADMIN", SIN_TVS))).toEqual([
      // Primera, y sólo en la web (16-nov).
      "Punto de venta",
      // Caja (17-nov): justo después, con el mismo permiso que Punto de venta.
      "Caja",
      "Ticket y recibo",
      "QR de cobro",
      "Inventario y stock",
      "Datos de las sucursales",
    ]);
  });

  it("con los tickets también está Tickets y despacho, en su orden", () => {
    expect(opciones(ctx("ADMIN", CON_TICKETS))).toEqual([
      "Punto de venta",
      "Caja",
      "Ticket y recibo",
      "Tickets y despacho",
      "QR de cobro",
      "Inventario y stock",
      "Datos de las sucursales",
    ]);
  });

  it("con sólo el menú digital no hay Tickets y despacho: no saca número", () => {
    expect(opciones(ctx("ADMIN", CON_MENU))).not.toContain("Tickets y despacho");
    expect(opciones(ctx("ADMIN", CON_MENU)).slice(0, 3)).toEqual(["Punto de venta", "Caja", "Ticket y recibo"]);
  });

  it("Punto de venta (16-nov): del dueño, con `negocio.configurar`, sin feature del plan", () => {
    expect(opciones(ctx("ADMIN", ["pos", "caja"]))).toContain("Punto de venta");
    // Si el dueño le da el permiso al encargado, también la ve.
    expect(opciones(ctx("SUPERVISOR", SIN_TVS, "RESTAURANTE", { extra: ["negocio.configurar"] }))).toContain(
      "Punto de venta",
    );
    expect(opciones(ctx("ADMIN", SIN_TVS, "RESTAURANTE", { sin: ["negocio.configurar"] }))).not.toContain(
      "Punto de venta",
    );
    expect(puedeVer(ctx("ADMIN", SIN_TVS, "FARMACIA"), "config_pos")).toBe(false);
    expect(puedeVer(ctx("ADMIN", SIN_TVS, "PELUQUERIA"), "config_pos")).toBe(false);
  });

  it("no suma nada al grupo «Configuración» de los demás rubros", () => {
    const rutas = nodos(menuDe(ctx("ADMIN", SIN_TVS, "FARMACIA", { extra: PERMISOS_NUEVOS }))).map((n) => n.item.a);
    expect(rutas).not.toContain("/configuracion/punto-de-venta");
  });

  it("el encargado: el recibo (y los tickets, con el extra); el QR y lo del dueño, no", () => {
    // De fábrica no tiene `qr.configurar` ni `negocio.configurar`.
    expect(opciones(ctx("SUPERVISOR", SIN_TVS))).toEqual(["Ticket y recibo"]);
    expect(opciones(ctx("SUPERVISOR", CON_TICKETS))).toEqual(["Ticket y recibo", "Tickets y despacho"]);
  });

  it("si el dueño le saca «Recibo y logo» al encargado de un local sin TVs, no tiene Configuración", () => {
    const c = ctx("SUPERVISOR", SIN_TVS, "RESTAURANTE", { sin: ["recibo.configurar"] });
    expect(opciones(c)).toEqual([]);
    expect(veConfiguracion((s) => puedeVer(c, s), c.rubro)).toBe(false);
  });

  it("la cajera no tiene nada que configurar: ni la entrada en el menú", () => {
    // Sin `qr.configurar` (migración del 16-oct) ni `recibo.configurar`.
    for (const plan of [SIN_TVS, CON_TICKETS]) {
      const c = ctx("CAJERO", plan);
      expect(opciones(c)).toEqual([]);
      expect(nodos(menuDe(c)).map((n) => n.item.a)).not.toContain(RUTA_CONFIGURACION);
      expect(nodos(menuDe(c)).map((n) => n.item.label)).not.toContain("Configuración");
    }
  });

  it("el mesero y el repartidor no ven Configuración", () => {
    for (const rol of ["MESERO", "REPARTIDOR"] as Plantilla[]) {
      expect(veConfiguracion((s) => puedeVer(ctx(rol, CON_TICKETS), s), "RESTAURANTE"), rol).toBe(false);
    }
  });

  it("sin el cobro por QR en el plan, el QR no aparece ni suelto ni adentro", () => {
    const c = ctx("ADMIN", SIN_TVS.filter((f) => f !== "pago_qr_mixto"));
    expect(opciones(c)).not.toContain("QR de cobro");
    expect(nodos(menuDe(c)).map((n) => n.item.a)).not.toContain("/configuracion/qr-cobro");
  });

  it("cada opción lleva a la pantalla que ya existía", () => {
    expect(OPCIONES_CONFIGURACION.map((o) => [o.titulo, o.a])).toEqual([
      ["Punto de venta", "/configuracion/punto-de-venta"],
      ["Caja", "/configuracion/caja"],
      ["Ticket y recibo", "/configuracion/recibo"],
      ["Tickets y despacho", "/configuracion/tickets"],
      ["QR de cobro", "/configuracion/qr-cobro"],
      ["Inventario y stock", "/configuracion/inventario"],
      ["Datos de las sucursales", "/configuracion/sucursales"],
    ]);
  });

  it("las tres de la app dicen lo mismo que la app (strings de Android)", () => {
    const detalle = (t: string) => OPCIONES_CONFIGURACION.find((o) => o.titulo === t)?.detalle;
    expect(detalle("Ticket y recibo")).toBe("El logo, el papel de 58 u 80 mm, la letra y qué se imprime al cobrar.");
    expect(detalle("Tickets y despacho")).toBe("Cómo se numeran los pedidos y si se usa la pantalla de Despacho.");
    expect(detalle("QR de cobro")).toBe("La cuenta a la que entra la plata cuando el cliente paga con QR.");
  });

  it.each(RUBROS.filter((r) => r !== "RESTAURANTE"))("%s no tiene la lista: ni opciones ni ruta", (rubro) => {
    // A propósito: fuera del restaurante no cambia nada (el billar sigue con
    // su QR de cobro como estaba, el instituto con el suyo en Mi negocio).
    expect(configuracionEnLista(rubro)).toBe(false);
    for (const rol of ["ADMIN", "SUPERVISOR", "CAJERO"] as Plantilla[]) {
      const c = ctx(rol, [...CON_TICKETS, "billar", "agenda", "academia"], rubro, { extra: PERMISOS_NUEVOS });
      expect(opciones(c), rol).toEqual([]);
      expect(nodos(menuDe(c)).map((n) => n.item.a), rol).not.toContain(RUTA_CONFIGURACION);
    }
  });
});

describe("menú del restaurante: una sola «Configuración», sin hijos", () => {
  const configuracion = (c: ContextoPermisos) => nodos(menuDe(c)).filter((n) => n.item.label === "Configuración");

  it.each([
    ["el dueño sin TVs", ctx("ADMIN", SIN_TVS)],
    ["el dueño con tickets", ctx("ADMIN", CON_TICKETS)],
    ["el dueño con todo y Roles", ctx("ADMIN", [...CON_TICKETS, "menu_digital", "salon", "gastos"], "RESTAURANTE", { extra: PERMISOS_NUEVOS })],
    ["el encargado", ctx("SUPERVISOR", CON_TICKETS)],
  ])("%s: una entrada a la lista, y ninguna opción suelta en el menú", (_quien, c) => {
    // Antes: el grupo «Configuración» con un hijo «Configuración» (el recibo)
    // y las demás opciones colgando. Ahora están en la pantalla de la lista.
    const [unica, ...otras] = configuracion(c);
    expect(otras).toEqual([]);
    expect(unica.item.a).toBe(RUTA_CONFIGURACION);
    expect(unica.hijos).toEqual([]);
    const rutas = nodos(menuDe(c)).map((n) => n.item.a);
    for (const o of OPCIONES_CONFIGURACION) expect(rutas).not.toContain(o.a);
  });

  it("va al final de Administración, donde estaba el grupo", () => {
    const adm = menuDe(ctx("ADMIN", [...CON_TICKETS, "salon"]))
      .find((b) => b.bloque === "administracion")!
      .nodos.map((n) => n.item.label);
    expect(adm.at(-1)).toBe("Configuración");
    expect(adm.at(-2)).toBe("Mesas del salón");
  });

  it("se enciende en la lista y en cada una de sus pantallas, y la barra del celular dice Configuración", () => {
    const planos = nodos(menuDe(ctx("ADMIN", CON_TICKETS)));
    const [entrada] = planos.filter((n) => n.item.label === "Configuración");
    for (const ruta of [RUTA_CONFIGURACION, ...OPCIONES_CONFIGURACION.map((o) => o.a)]) {
      expect(esActivo(entrada.item, ruta), ruta).toBe(true);
      expect(tituloDe(planos, ruta), ruta).toBe("Configuración");
      // Y es lo único encendido: la barra no marca dos lugares a la vez.
      expect(planos.filter((n) => !n.esTitulo && esActivo(n.item, ruta)), ruta).toEqual([entrada]);
    }
    expect(esActivo(entrada.item, "/inventario")).toBe(false);
    expect(esActivo(entrada.item, "/configuracionx")).toBe(false);
  });

  it("no cambia a dónde entra nadie", () => {
    expect(rutaInicial(ctx("ADMIN", SIN_TVS))).toBe("/inventario");
    expect(rutaInicial(ctx("CAJERO", SIN_TVS))).toBe("/pos");
  });
});

/**
 * Los demás rubros NO cambian (decisión del 15-nov): lo que se esperaba acá
 * es el menú que dibujaba la web antes de la lista del restaurante, sacado el
 * 16-nov corriendo el `menu.ts` anterior con estas mismas sesiones.
 */
describe("los demás rubros: su Configuración queda como estaba", () => {
  /** Los renglones de Configuración (o Mi negocio en el instituto), con su sangría. */
  const plano = (n: NodoMenu[], d = 0): string[] =>
    n.flatMap((x) => [`${"  ".repeat(d)}${x.item.label} ${x.item.a}`, ...plano(x.hijos, d + 1)]);
  const deConfiguracion = (c: ContextoPermisos) => {
    const adm = menuDe(c).find((b) => b.bloque === "administracion")?.nodos ?? [];
    return plano(
      adm.filter((n) => n.item.label === "Configuración" || n.item.label === "Mi negocio" || n.item.a.startsWith("/configuracion")),
    );
  };
  const GRUPO_DE_SIEMPRE = [
    "Configuración /configuracion/sucursales",
    "  Datos de las sucursales /configuracion/sucursales",
    "  QR de cobro /configuracion/qr-cobro",
  ];

  it.each(["FARMACIA", "MINIMARKET", "FERRETERIA", "REPUESTOS", "PELUQUERIA", "BARBERIA", "SPA", "UNAS", "BILLAR", "RUBRO_NUEVO"])(
    "%s: el dueño, con el grupo de siempre (sucursales y QR)",
    (rubro) => {
      expect(deConfiguracion(ctx("ADMIN", SIN_TVS, rubro))).toEqual(GRUPO_DE_SIEMPRE);
      expect(deConfiguracion(ctx("ADMIN", SIN_TVS, rubro, { extra: PERMISOS_NUEVOS }))).toEqual(GRUPO_DE_SIEMPRE);
      // El encargado y la cajera no tienen nada de esto, como antes.
      expect(deConfiguracion(ctx("SUPERVISOR", SIN_TVS, rubro))).toEqual([]);
      expect(deConfiguracion(ctx("CAJERO", SIN_TVS, rubro))).toEqual([]);
    },
  );

  it("un salón con agenda: su «Configuración» con las reglas del negocio adentro", () => {
    expect(deConfiguracion(ctx("ADMIN", [...SIN_TVS, "agenda"], "PELUQUERIA"))).toEqual([
      "Configuración /configuracion/negocio",
      "  Configuración /configuracion/negocio",
      "  Datos de las sucursales /configuracion/sucursales",
      "  QR de cobro /configuracion/qr-cobro",
    ]);
  });

  it("una farmacia sin el cobro por QR: los datos de las sucursales, sueltos", () => {
    expect(deConfiguracion(ctx("ADMIN", ["pos", "caja", "catalogo", "usuarios", "inventario", "reportes"], "FARMACIA"))).toEqual([
      "Datos de las sucursales /configuracion/sucursales",
    ]);
  });

  it("el billar: quien sólo cambia el QR lo tiene suelto, como hoy", () => {
    const c = ctx("CAJERO", [...SIN_TVS, "billar"], "BILLAR", { extra: ["qr.configurar"] });
    expect(deConfiguracion(c)).toEqual(["QR de cobro /configuracion/qr-cobro"]);
  });

  it("el instituto: el QR de cobro sigue en Mi negocio", () => {
    const c = ctx("ADMIN", ["pos", "caja", "catalogo", "usuarios", "academia", "pago_qr_mixto"], "ACADEMIA", {
      extra: PERMISOS_NUEVOS,
    });
    expect(deConfiguracion(c)).toEqual([
      "Mi negocio /personal",
      "  Personal /personal",
      "  Usuarios /usuarios",
      "  Roles /roles",
      "  QR de cobro /configuracion/qr-cobro",
    ]);
  });

  it("la barra del celular sigue diciendo el nombre de cada pantalla", () => {
    const planos = nodos(menuDe(ctx("ADMIN", SIN_TVS, "FARMACIA")));
    expect(tituloDe(planos, "/configuracion/sucursales")).toBe("Datos de las sucursales");
    expect(tituloDe(planos, "/configuracion/qr-cobro")).toBe("QR de cobro");
  });
});
