import { describe, expect, it } from "vitest";
import type { Feature } from "../types";
import { ctxDe } from "../test/sesiones";
import {
  RUTA_AGENDA_PRONTO,
  etiquetaRol,
  permisoDeSeccion,
  puede,
  puedeVer,
  rutaInicial,
  soloLoSuyo,
  sobreTodo,
  tieneFeature,
  tienePermiso,
  type ContextoPermisos,
  type Seccion,
} from "./permisos";

/**
 * Desde PLAN-ROLES-NEGOCIO la web decide todo por permisos: las sesiones de
 * estos tests se arman con los permisos de las plantillas del backend
 * (`ctxDe`), no con el nombre del rol. Las plantillas son las del alta: un
 * "Cajero" de un negocio puede tener otros permisos, y entonces ve otra cosa.
 */

const PLAN_FULL: Feature[] = [
  "pos",
  "caja",
  "catalogo",
  "usuarios",
  "inventario",
  "multi_almacen",
  "insumos",
  "delivery",
  "recoger",
  "fiado",
  "reportes",
  "salon",
  "lotes",
  "encargos",
  "gastos",
];

/** Sólo un puñado de permisos, sin plantilla (un rol armado por el negocio). */
function ctxCon(permisos: string[], rubro?: string, features: Feature[] = PLAN_FULL, propios: string[] = []): ContextoPermisos {
  return { permisos, permisosPropios: propios, rubro, features };
}

describe("fail-open de las features", () => {
  it("muestra todo cuando la lista de features viene vacía", () => {
    expect(tieneFeature([], "fiado")).toBe(true);
    expect(tieneFeature(undefined, "delivery")).toBe(true);
  });

  it("no muestra lo que falta cuando la lista SÍ tiene datos", () => {
    expect(tieneFeature(["pos", "caja"], "fiado")).toBe(false);
  });
});

describe("sin permisos no hay respaldo por nombre de rol", () => {
  it("una sesión sin permisos no ve ninguna sección", () => {
    // Antes caía al nombre del rol; ahora AuthContext los pide a /auth/me y,
    // si no vienen, la sesión queda sin acceso.
    const sinPermisos: ContextoPermisos = { features: PLAN_FULL, rubro: "RESTAURANTE" };
    for (const s of ["pos", "caja", "inventario", "reportes", "usuarios", "reparto", "salon"] as Seccion[]) {
      expect(puedeVer(sinPermisos, s), s).toBe(false);
    }
    expect(rutaInicial(sinPermisos)).toBe("/sin-acceso");
  });

  it("tienePermiso / soloLoSuyo / sobreTodo sin sesión dicen que no", () => {
    expect(tienePermiso(null, "ventas.vender")).toBe(false);
    expect(tienePermiso({}, "ventas.vender")).toBe(false);
    expect(soloLoSuyo({}, "agenda.ver")).toBe(false);
    expect(sobreTodo({}, "agenda.ver")).toBe(false);
  });

  it("'sólo lo suyo' es tener el permiso PROPIO; 'sobre todo', tenerlo sin PROPIO", () => {
    const prof = { permisos: ["agenda.ver"], permisosPropios: ["agenda.ver"] };
    expect(soloLoSuyo(prof, "agenda.ver")).toBe(true);
    expect(sobreTodo(prof, "agenda.ver")).toBe(false);
    const recepcion = { permisos: ["agenda.ver"], permisosPropios: [] };
    expect(soloLoSuyo(recepcion, "agenda.ver")).toBe(false);
    expect(sobreTodo(recepcion, "agenda.ver")).toBe(true);
  });
});

describe("cada sección, con su permiso", () => {
  /** El mapa del brief: las 23 que antes iban por rol y módulo. */
  const MAPA: [Seccion, string][] = [
    ["pos", "ventas.vender"],
    ["caja", "caja.operar"],
    ["creditos", "credito.otorgar"],
    ["inventario", "dashboard.ver"],
    ["productos", "catalogo.editar"],
    ["insumos", "insumos.gestionar"],
    ["almacenes", "almacenes.administrar"],
    ["movimientos", "inventario.mover"],
    ["reportes", "reportes.ver"],
    ["usuarios", "usuarios.administrar"],
    ["reparto", "entregas.realizar"],
    ["salon", "salon.atender"],
    ["mesas", "salon.administrar"],
    ["dashboard", "dashboard.ver"],
    ["busqueda", "catalogo.ver"],
    ["vencimientos", "lotes.gestionar"],
    ["encargos", "encargos.gestionar"],
    ["controlados", "controlados.libro"],
    ["proveedores", "proveedores.gestionar"],
    ["ingreso_mercaderia", "inventario.mover"],
    ["salida_mercaderia", "inventario.mover"],
    ["transferencia_mercaderia", "inventario.mover"],
    ["gastos", "gastos.gestionar"],
    ["roles", "roles.gestionar"],
  ];

  it.each(MAPA)("%s pide %s", (seccion, permiso) => {
    expect(permisoDeSeccion(seccion)).toBe(permiso);
    // El rubro donde existe la sección: farmacia para lo suyo, restaurante
    // para el salón.
    const rubro = ["mesas", "salon", "insumos"].includes(seccion) ? "RESTAURANTE" : "FARMACIA";
    expect(puedeVer(ctxCon([permiso], rubro), seccion)).toBe(true);
    expect(puedeVer(ctxCon([], rubro), seccion)).toBe(false);
  });

  it("créditos se abre también con sólo cobrar abonos", () => {
    expect(puedeVer(ctxCon(["credito.cobrar"]), "creditos")).toBe(true);
  });

  it("un rol con cualquier nombre ve lo que dicen sus permisos", () => {
    // Un "Cajero" al que el dueño le dio el inventario lo ve; no importa cómo
    // se llame su rol ni de qué plantilla nació.
    const cajeroConInventario = ctxDe("CAJERO", "RESTAURANTE", PLAN_FULL, {
      extra: ["dashboard.ver", "inventario.mover"],
    });
    expect(puedeVer(cajeroConInventario, "inventario")).toBe(true);
    expect(puedeVer(cajeroConInventario, "movimientos")).toBe(true);
    expect(puedeVer(cajeroConInventario, "productos")).toBe(false);
  });

  it("el permiso no alcanza si el plan no incluye la feature de la pantalla", () => {
    // Sucursales es de `multi_almacen`, aunque su permiso sea de `inventario`.
    const unLocal = PLAN_FULL.filter((f) => f !== "multi_almacen");
    expect(puedeVer(ctxCon(["almacenes.administrar"], "RESTAURANTE", unLocal), "almacenes")).toBe(false);
    expect(puedeVer(ctxCon(["inventario.mover"], "FARMACIA", unLocal), "transferencia_mercaderia")).toBe(false);
    expect(puedeVer(ctxCon(["inventario.mover"], "FARMACIA", unLocal), "ingreso_mercaderia")).toBe(true);
  });
});

describe("puedeVer con las plantillas", () => {
  it("el cajero no entra a inventario, reportes ni usuarios", () => {
    const c = ctxDe("CAJERO", "RESTAURANTE", PLAN_FULL);
    expect(puedeVer(c, "pos")).toBe(true);
    expect(puedeVer(c, "caja")).toBe(true);
    expect(puedeVer(c, "creditos")).toBe(true);
    expect(puedeVer(c, "inventario")).toBe(false);
    expect(puedeVer(c, "reportes")).toBe(false);
    expect(puedeVer(c, "usuarios")).toBe(false);
  });

  it("el repartidor sólo entrega: ni POS, ni caja, ni cuentas por cobrar (D1)", () => {
    const c = ctxDe("REPARTIDOR", "RESTAURANTE", PLAN_FULL);
    expect(puedeVer(c, "reparto")).toBe(true);
    expect(puedeVer(c, "pos")).toBe(false);
    expect(puedeVer(c, "creditos")).toBe(false);
    expect(puedeVer(c, "caja")).toBe(false);
  });

  it("'Mis entregas' es de quien reparte, no de quien gestiona todos los pedidos", () => {
    expect(puedeVer(ctxDe("ADMIN", "RESTAURANTE", PLAN_FULL), "reparto")).toBe(false);
    expect(puedeVer(ctxDe("CAJERO", "RESTAURANTE", PLAN_FULL), "reparto")).toBe(false);
    // Aunque el rol traiga los dos (un Administrador con todo): gestiona.
    const ambos = ctxDe("ADMIN", "RESTAURANTE", PLAN_FULL, { extra: ["entregas.realizar"] });
    expect(puedeVer(ambos, "reparto")).toBe(false);
  });

  it("el plan puede apagar una sección aunque el rol la permita", () => {
    const sinFiado = ctxDe("ADMIN", "RESTAURANTE", ["pos", "caja", "inventario"]);
    expect(puedeVer(sinFiado, "creditos")).toBe(false);
    expect(puedeVer(sinFiado, "pos")).toBe(true);
  });
});

describe("rutaInicial", () => {
  it("manda a cada uno a su pantalla, por sus permisos", () => {
    expect(rutaInicial(ctxDe("ADMIN", "RESTAURANTE", PLAN_FULL))).toBe("/inventario");
    expect(rutaInicial(ctxDe("CAJERO", "RESTAURANTE", PLAN_FULL))).toBe("/pos");
    expect(rutaInicial(ctxDe("REPARTIDOR", "RESTAURANTE", PLAN_FULL))).toBe("/reparto");
    expect(rutaInicial(ctxDe("MESERO", "RESTAURANTE", PLAN_FULL))).toBe("/salon");
  });

  it("quien reparte o atiende mesas Y vende entra al POS", () => {
    expect(rutaInicial(ctxCon(["entregas.realizar", "ventas.vender"], "RESTAURANTE"))).toBe("/pos");
    expect(rutaInicial(ctxCon(["salon.atender", "ventas.vender"], "RESTAURANTE"))).toBe("/pos");
    expect(rutaInicial(ctxCon(["entregas.realizar"], "RESTAURANTE"))).toBe("/reparto");
    expect(rutaInicial(ctxCon(["salon.atender"], "RESTAURANTE"))).toBe("/salon");
  });

  it("quien ve sólo su agenda entra a Mi agenda, con o sin la feature", () => {
    const prof = ctxDe("PROFESIONAL", "BARBERIA", ["agenda"]);
    expect(rutaInicial(prof)).toBe(RUTA_AGENDA_PRONTO);
    // Con la agenda apagada la misma ruta dice que llega pronto: por la
    // lista caería en "/sin-acceso", que diría que su cuenta está mal.
    expect(rutaInicial(ctxCon(["agenda.ver"], "BARBERIA", ["pos"], ["agenda.ver"]))).toBe("/mi-agenda");
  });

  it("nunca devuelve una sección que el plan no incluye", () => {
    // Sin esto, un dueño con plan BÁSICO entraba a /inventario, el guard lo
    // rechazaba, el rechazo lo mandaba al inicio y volvía: bucle en blanco.
    const basico = ctxDe("ADMIN", "RESTAURANTE", ["pos", "caja", "catalogo", "usuarios", "reportes"]);
    expect(rutaInicial(basico)).toBe("/inventario/productos");
  });

  it("cae en la pantalla de sin acceso cuando no hay ninguna sección", () => {
    expect(rutaInicial(ctxDe("CAJERO", undefined, ["catalogo"]))).toBe("/sin-acceso");
    // Un rol sin permisos (el "Ayudante" al que le dieron acceso).
    expect(rutaInicial(ctxCon([], "PELUQUERIA"))).toBe("/sin-acceso");
  });

  it("el destino que elige siempre es visible para ese usuario", () => {
    const casos = [
      ctxDe("ADMIN", "RESTAURANTE", PLAN_FULL),
      ctxDe("SUPERVISOR", "FARMACIA", PLAN_FULL),
      ctxDe("CAJERO", "MINIMARKET", PLAN_FULL),
      ctxDe("REPARTIDOR", "FERRETERIA", PLAN_FULL),
      ctxDe("ADMIN", "REPUESTOS", ["pos", "caja", "reportes"]),
    ];
    for (const c of casos) expect(rutaInicial(c)).not.toBe("/sin-acceso");
  });

  it("un usuario que SOLO tiene gastos aterriza en /gastos", () => {
    // Devolvía "/sin-acceso" con "Gastos operativos" dibujado en la barra.
    const soloGastos = ctxCon(["gastos.gestionar"], "RESTAURANTE", ["gastos"]);
    expect(rutaInicial(soloGastos)).toBe("/gastos");
  });

  it("cualquier sección visible le sirve de inicio a alguien que sólo tiene ésa", () => {
    // El orden fijo cubre todas: nadie con una sección en el menú cae en
    // "/sin-acceso".
    expect(rutaInicial(ctxCon(["roles.gestionar"], "RESTAURANTE"))).toBe("/roles");
    expect(rutaInicial(ctxCon(["controlados.libro"], "FARMACIA"))).toBe("/controlados");
    expect(rutaInicial(ctxCon(["salon.administrar"], "RESTAURANTE"))).toBe("/mesas");
  });
});

describe("capacidades", () => {
  it("las apaga cuando el plan no las incluye", () => {
    const basico = ctxDe("ADMIN", "RESTAURANTE", ["pos", "caja", "catalogo", "usuarios"]);
    expect(puede(basico, "combos")).toBe(false);
    expect(puede(basico, "mesa_llevar")).toBe(false);
    expect(puede(basico, "pago_qr_mixto")).toBe(false);
    expect(puede(basico, "recibo_pdf")).toBe(false);
    expect(puede(basico, "exportacion")).toBe(false);
    expect(puede(basico, "reportes_operacion")).toBe(false);
    expect(puede(basico, "reportes_rentabilidad")).toBe(false);
  });

  it("las enciende cuando el plan sí las incluye", () => {
    const pro = ctxDe("ADMIN", "RESTAURANTE", ["pos", "combos", "mesa_llevar", "pago_qr_mixto", "recibo_pdf", "reportes_operacion"]);
    expect(puede(pro, "combos")).toBe(true);
    expect(puede(pro, "mesa_llevar")).toBe(true);
    expect(puede(pro, "reportes_operacion")).toBe(true);
    expect(puede(pro, "reportes_rentabilidad")).toBe(false);
  });

  it("mover efectivo de la caja pide `caja.movimientos`", () => {
    // El backend lo corta por ese permiso: ofrecerle el botón a quien no lo
    // tiene sería ofrecerle un 403.
    const features: Feature[] = ["pos", "caja", "movimientos_caja"];
    expect(puede(ctxDe("ADMIN", "RESTAURANTE", features), "movimientos_caja")).toBe(true);
    expect(puede(ctxDe("SUPERVISOR", "RESTAURANTE", features), "movimientos_caja")).toBe(true);
    expect(puede(ctxDe("CAJERO", "RESTAURANTE", features), "movimientos_caja")).toBe(false);
    expect(puede(ctxCon(["caja.movimientos"], "RESTAURANTE", features), "movimientos_caja")).toBe(true);
  });

  it("falla abierta con la lista de features vacía", () => {
    const sinFeatures = ctxDe("ADMIN", "RESTAURANTE", []);
    expect(puede(sinFeatures, "combos")).toBe(true);
    expect(puede(sinFeatures, "exportacion")).toBe(true);
  });
});

describe("el mesero", () => {
  const mesero = ctxDe("MESERO", "RESTAURANTE", PLAN_FULL);

  it("entra al salón, no al POS", () => {
    expect(rutaInicial(mesero)).toBe("/salon");
  });

  it("no cobra ni administra: nada de POS, caja, créditos, catálogo ni mesas", () => {
    for (const s of ["pos", "caja", "creditos", "inventario", "productos", "reportes", "usuarios", "mesas"] as Seccion[]) {
      expect(puedeVer(mesero, s), s).toBe(false);
    }
  });

  it("el dueño y el encargado también miran el salón; el repartidor no", () => {
    expect(puedeVer(ctxDe("ADMIN", "RESTAURANTE", PLAN_FULL), "salon")).toBe(true);
    expect(puedeVer(ctxDe("SUPERVISOR", "RESTAURANTE", PLAN_FULL), "salon")).toBe(true);
    expect(puedeVer(ctxDe("REPARTIDOR", "RESTAURANTE", PLAN_FULL), "salon")).toBe(false);
    // La plantilla del cajero atiende mesas (`salon.atender`): puede entrar
    // al panel, pero su inicio sigue siendo el POS porque vende.
    expect(puedeVer(ctxDe("CAJERO", "RESTAURANTE", PLAN_FULL), "salon")).toBe(true);
    expect(rutaInicial(ctxDe("CAJERO", "RESTAURANTE", PLAN_FULL))).toBe("/pos");
  });

  it("apagar `salon` en el panel saca el salón y las mesas, y deja al mesero sin sección", () => {
    const sinSalon = PLAN_FULL.filter((f) => f !== "salon");
    expect(puedeVer(ctxDe("ADMIN", "RESTAURANTE", sinSalon), "salon")).toBe(false);
    expect(puedeVer(ctxDe("ADMIN", "RESTAURANTE", sinSalon), "mesas")).toBe(false);
    expect(rutaInicial(ctxDe("MESERO", "RESTAURANTE", sinSalon))).toBe("/sin-acceso");
    // El resto del menú del dueño no se toca.
    expect(puedeVer(ctxDe("ADMIN", "RESTAURANTE", sinSalon), "pos")).toBe(true);
    expect(puedeVer(ctxDe("ADMIN", "RESTAURANTE", sinSalon), "inventario")).toBe(true);
  });
});

describe("el rubro decide qué secciones existen", () => {
  const farmacia = ctxDe("ADMIN", "FARMACIA", PLAN_FULL);

  it("una farmacia no tiene salón, mesas ni insumos", () => {
    expect(puedeVer(farmacia, "mesas")).toBe(false);
    expect(puedeVer(farmacia, "salon")).toBe(false);
    expect(puedeVer(farmacia, "insumos")).toBe(false);
  });

  it("una farmacia sí vende, cobra fiado y maneja inventario", () => {
    for (const s of ["pos", "productos", "movimientos", "almacenes", "creditos", "reportes"] as Seccion[]) {
      expect(puedeVer(farmacia, s), s).toBe(true);
    }
  });

  it("un restaurante y un negocio sin rubro no pierden nada", () => {
    for (const rubro of ["RESTAURANTE", undefined]) {
      const c = ctxDe("ADMIN", rubro, PLAN_FULL);
      expect(puedeVer(c, "mesas")).toBe(true);
      expect(puedeVer(c, "insumos")).toBe(true);
      expect(puedeVer(c, "salon")).toBe(true);
    }
  });

  it("lo que nace de la farmacia no existe fuera de ella, ni sin rubro", () => {
    const propias: Seccion[] = [
      "dashboard",
      "busqueda",
      "vencimientos",
      "encargos",
      "controlados",
      "proveedores",
      "ingreso_mercaderia",
      "salida_mercaderia",
      "transferencia_mercaderia",
    ];
    for (const s of propias) {
      expect(puedeVer(farmacia, s), s).toBe(true);
      expect(puedeVer(ctxDe("ADMIN", "RESTAURANTE", PLAN_FULL), s), s).toBe(false);
      expect(puedeVer(ctxDe("ADMIN", "MINIMARKET", PLAN_FULL), s), s).toBe(false);
      expect(puedeVer(ctxDe("ADMIN", undefined, PLAN_FULL), s), s).toBe(false);
    }
    // Movimientos de siempre sigue en todos.
    expect(puedeVer(ctxDe("ADMIN", "RESTAURANTE", PLAN_FULL), "movimientos")).toBe(true);
  });
});

describe("farmacia: quién ve qué con las plantillas", () => {
  const dependiente = ctxDe("CAJERO", "FARMACIA", PLAN_FULL);
  const encargado = ctxDe("SUPERVISOR", "FARMACIA", PLAN_FULL);

  it("el dependiente atiende: busca, vende, anota encargos", () => {
    for (const s of ["pos", "busqueda", "encargos", "creditos"] as Seccion[]) expect(puedeVer(dependiente, s), s).toBe(true);
  });

  it("el dependiente no mueve stock ni lee el libro de controlados", () => {
    for (const s of [
      "productos",
      "dashboard",
      "vencimientos",
      "controlados",
      "proveedores",
      "ingreso_mercaderia",
      "salida_mercaderia",
      "transferencia_mercaderia",
    ] as Seccion[]) {
      expect(puedeVer(dependiente, s), s).toBe(false);
    }
  });

  it("el encargado (D2) administra el inventario, los lotes y el libro", () => {
    for (const s of ["inventario", "productos", "vencimientos", "controlados", "proveedores", "ingreso_mercaderia"] as Seccion[]) {
      expect(puedeVer(encargado, s), s).toBe(true);
    }
  });

  it("vencimientos pide la feature `lotes`, la misma que exige el backend", () => {
    const sinLotes = PLAN_FULL.filter((f) => f !== "lotes");
    const basico = ctxDe("ADMIN", "FARMACIA", sinLotes);
    expect(puedeVer(basico, "vencimientos")).toBe(false);
    expect(puede(basico, "lotes")).toBe(false);
    // Una farmacia sin features cargadas la sigue viendo (falla abierto).
    expect(puedeVer(ctxDe("ADMIN", "FARMACIA", []), "vencimientos")).toBe(true);
  });

  it("el libro de controlados es una obligación legal: no depende del plan", () => {
    expect(puedeVer(ctxDe("ADMIN", "FARMACIA", ["pos", "caja", "inventario"]), "controlados")).toBe(true);
  });

  it("apagar `encargos` en el panel la saca", () => {
    const sin = PLAN_FULL.filter((f) => f !== "encargos");
    expect(puedeVer(ctxDe("CAJERO", "FARMACIA", sin), "encargos")).toBe(false);
  });
});

describe("gastos operativos", () => {
  it("el dueño y el encargado lo ven; el cajero no", () => {
    expect(puedeVer(ctxDe("ADMIN", "RESTAURANTE", PLAN_FULL), "gastos")).toBe(true);
    expect(puedeVer(ctxDe("SUPERVISOR", "RESTAURANTE", PLAN_FULL), "gastos")).toBe(true);
    expect(puedeVer(ctxDe("CAJERO", "RESTAURANTE", PLAN_FULL), "gastos")).toBe(false);
  });

  it("apagar `gastos` en el panel saca la sección y nada más", () => {
    const sinGastos = PLAN_FULL.filter((f) => f !== "gastos");
    expect(puedeVer(ctxDe("ADMIN", "RESTAURANTE", sinGastos), "gastos")).toBe(false);
    expect(puedeVer(ctxDe("ADMIN", "RESTAURANTE", sinGastos), "reportes")).toBe(true);
  });
});

// ── Belleza ─────────────────────────────────────────────────────────────────

/** Las secciones que antes iban por rol: el profesional no ve ninguna. */
const CLASICAS: Seccion[] = [
  "pos", "caja", "inventario", "productos", "insumos", "almacenes",
  "movimientos", "creditos", "reportes", "usuarios", "reparto", "salon",
  "mesas", "dashboard", "busqueda", "vencimientos", "encargos", "controlados",
  "proveedores", "ingreso_mercaderia", "salida_mercaderia",
  "transferencia_mercaderia", "gastos", "roles",
];

describe("el profesional", () => {
  it("no ve ninguna de las secciones de siempre, aunque las features fallen abiertas", () => {
    for (const features of [PLAN_FULL, []]) {
      const prof = ctxDe("PROFESIONAL", "BARBERIA", features);
      for (const s of CLASICAS) expect(puedeVer(prof, s), s).toBe(false);
    }
  });

  it("los demás aterrizan donde siempre en un salón sin agenda", () => {
    expect(rutaInicial(ctxDe("ADMIN", "BARBERIA", PLAN_FULL))).toBe("/inventario");
    expect(rutaInicial(ctxDe("CAJERO", "BARBERIA", PLAN_FULL))).toBe("/pos");
  });
});

describe("belleza: lo de gastronomía no existe", () => {
  it.each(["PELUQUERIA", "BARBERIA", "SPA", "UNAS"])(
    "%s no tiene salón, mesas ni insumos, aunque el plan los traiga",
    (rubro) => {
      for (const features of [PLAN_FULL, []]) {
        const admin = ctxDe("ADMIN", rubro, features);
        expect(puedeVer(admin, "mesas")).toBe(false);
        expect(puedeVer(admin, "salon")).toBe(false);
        expect(puedeVer(admin, "insumos")).toBe(false);
        expect(puede(admin, "mesa_llevar")).toBe(false);
      }
    },
  );

  it("un restaurante sigue partiendo mesa/llevar; una farmacia no", () => {
    expect(puede(ctxDe("ADMIN", "RESTAURANTE", []), "mesa_llevar")).toBe(true);
    expect(puede(ctxDe("ADMIN", "FARMACIA", []), "mesa_llevar")).toBe(false);
  });

  it("ventas, caja y créditos: por permiso, como en todos los rubros", () => {
    const salon = (permisos: string[]) => ctxCon(permisos, "UNAS", [...PLAN_FULL, "agenda"]);
    const recepcion = ["ventas.vender", "caja.operar", "credito.otorgar", "credito.cobrar"];
    for (const s of ["pos", "caja", "creditos"] as Seccion[]) {
      expect(puedeVer(salon(recepcion), s), s).toBe(true);
      expect(puedeVer(salon(["ventas.ver_precios"]), s), s).toBe(false);
    }
    expect(puedeVer(salon(recepcion.filter((p) => p !== "ventas.vender")), "pos")).toBe(false);
    expect(puedeVer(salon(recepcion.filter((p) => p !== "ventas.vender")), "caja")).toBe(true);
  });
});

describe("etiquetaRol (vocabulario del rubro)", () => {
  const PERFIL_BARBERIA = { etiquetasRol: { CAJERO: "Recepción", PROFESIONAL: "Barbero" } };

  it("sin negocio, o en los rubros de siempre, dice lo de siempre", () => {
    expect(etiquetaRol("CAJERO")).toBe("Cajero");
    expect(etiquetaRol("ADMIN")).toBe("Administrador");
    expect(etiquetaRol("PROFESIONAL")).toBe("Profesional");
    expect(etiquetaRol("CAJERO", { tipoNegocio: "RESTAURANTE" })).toBe("Cajero");
  });

  it("con el perfil, usa sus etiquetas; si no, el respaldo del rubro", () => {
    const barberia = { tipoNegocio: "BARBERIA", perfil: PERFIL_BARBERIA };
    expect(etiquetaRol("PROFESIONAL", barberia)).toBe("Barbero");
    // "Administrador" en todos los rubros (antes "Dueño" en un salón).
    expect(etiquetaRol("ADMIN", barberia)).toBe("Administrador");
    expect(etiquetaRol("ADMIN", { tipoNegocio: "PELUQUERIA" })).toBe("Administrador");
    expect(etiquetaRol("PROFESIONAL", { tipoNegocio: "SPA" })).toBe("Terapeuta");
    expect(etiquetaRol("PROFESIONAL", { tipoNegocio: "UNAS" })).toBe("Manicurista");
  });

  it("un código que no conoce lo devuelve tal cual", () => {
    expect(etiquetaRol("COBRADOR")).toBe("COBRADOR");
  });
});
