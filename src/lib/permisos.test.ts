import { describe, expect, it } from "vitest";
import type { Feature, Modulo, Rol } from "../types";
import {
  RUTA_AGENDA_PRONTO,
  etiquetaRol,
  puede,
  puedeVer,
  rolesAsignables,
  rutaInicial,
  tieneFeature,
  tieneModulo,
  type Seccion,
} from "./permisos";

/** Lo que trae el login de un ADMIN con plan completo. */
const TODOS_MODULOS: Modulo[] = [
  "INVENTARIO",
  "POS",
  "CAJA",
  "REPORTES",
  "USUARIOS",
  "CONFIG",
];
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

function ctx(rol: Rol, modulos = TODOS_MODULOS, features = PLAN_FULL) {
  return { rol, modulos, features };
}

describe("fail-open", () => {
  it("muestra todo cuando la lista de módulos viene vacía", () => {
    // Una sesión guardada antes de que existiera el dato se quedaría sin menú:
    // es peor que mostrar de más, porque el backend igual responde 403.
    expect(tieneModulo([], "POS")).toBe(true);
    expect(tieneModulo(undefined, "REPORTES")).toBe(true);
  });

  it("muestra todo cuando la lista de features viene vacía", () => {
    expect(tieneFeature([], "fiado")).toBe(true);
    expect(tieneFeature(undefined, "delivery")).toBe(true);
  });

  it("no muestra lo que falta cuando la lista SÍ tiene datos", () => {
    expect(tieneModulo(["POS"], "REPORTES")).toBe(false);
    expect(tieneFeature(["pos", "caja"], "fiado")).toBe(false);
  });
});

describe("puedeVer", () => {
  it("un cajero no entra a inventario, reportes ni usuarios", () => {
    const c = ctx("CAJERO", ["POS", "CAJA"]);
    expect(puedeVer(c, "pos")).toBe(true);
    expect(puedeVer(c, "inventario")).toBe(false);
    expect(puedeVer(c, "reportes")).toBe(false);
    expect(puedeVer(c, "usuarios")).toBe(false);
  });

  it("un repartidor NO ve el punto de venta ni las cuentas por cobrar", () => {
    // El repartidor tiene el módulo POS porque es lo que le habilita sus
    // entregas: sin restricción de rol le aparecería el POS entero y podría
    // abrir caja y vender.
    const c = ctx("REPARTIDOR", ["POS", "CAJA"]);
    expect(puedeVer(c, "reparto")).toBe(true);
    expect(puedeVer(c, "pos")).toBe(false);
    expect(puedeVer(c, "creditos")).toBe(false);
    expect(puedeVer(c, "caja")).toBe(false);
  });

  it("nadie más que el repartidor entra a las entregas", () => {
    expect(puedeVer(ctx("ADMIN"), "reparto")).toBe(false);
    expect(puedeVer(ctx("CAJERO"), "reparto")).toBe(false);
  });

  it("el plan puede apagar una sección aunque el rol la permita", () => {
    const sinFiado = ctx("ADMIN", TODOS_MODULOS, ["pos", "caja", "inventario"]);
    expect(puedeVer(sinFiado, "creditos")).toBe(false);
    expect(puedeVer(sinFiado, "pos")).toBe(true);
  });
});

describe("rutaInicial", () => {
  it("manda a cada rol a su pantalla", () => {
    expect(rutaInicial(ctx("ADMIN"))).toBe("/inventario");
    expect(rutaInicial(ctx("CAJERO", ["POS", "CAJA"]))).toBe("/pos");
    expect(rutaInicial(ctx("REPARTIDOR", ["POS", "CAJA"]))).toBe("/reparto");
  });

  it("nunca devuelve una sección que el plan no incluye", () => {
    // Sin esto, un ADMIN con plan BÁSICO entraba a /inventario, el guard lo
    // rechazaba, el rechazo lo mandaba al inicio y volvía a /inventario:
    // un bucle infinito con la pantalla en blanco.
    const basico = ctx("ADMIN", TODOS_MODULOS, [
      "pos",
      "caja",
      "catalogo",
      "usuarios",
      "reportes",
    ]);
    const destino = rutaInicial(basico);
    expect(destino).not.toBe("/inventario");
    expect(destino).toBe("/inventario/productos");
  });

  it("cae en la pantalla de sin acceso cuando no hay ninguna sección", () => {
    const sinNada = ctx("CAJERO", ["CONFIG"], ["catalogo"]);
    expect(rutaInicial(sinNada)).toBe("/sin-acceso");
  });

  it("el destino que elige siempre es visible para ese usuario", () => {
    const casos = [
      ctx("ADMIN"),
      ctx("CAJERO", ["POS", "CAJA"]),
      ctx("REPARTIDOR", ["POS", "CAJA"]),
      ctx("SUPERVISOR"),
      ctx("ADMIN", TODOS_MODULOS, ["pos", "caja", "reportes"]),
    ];
    for (const c of casos) {
      const destino = rutaInicial(c);
      // Si el destino fuera una ruta protegida que no puede ver, el guard la
      // rebotaría al inicio y entraría en bucle.
      expect(destino).not.toBe("/sin-acceso");
    }
  });
});

describe("capacidades", () => {
  it("las apaga cuando el plan no las incluye", () => {
    // Plan BÁSICO: sólo lo del núcleo, sin ninguna capacidad vendida aparte.
    const basico = ctx("ADMIN", TODOS_MODULOS, ["pos", "caja", "catalogo", "usuarios"]);
    expect(puede(basico, "combos")).toBe(false);
    expect(puede(basico, "mesa_llevar")).toBe(false);
    expect(puede(basico, "pago_qr_mixto")).toBe(false);
    expect(puede(basico, "recibo_pdf")).toBe(false);
    expect(puede(basico, "exportacion")).toBe(false);
    expect(puede(basico, "reportes_operacion")).toBe(false);
    expect(puede(basico, "reportes_rentabilidad")).toBe(false);
  });

  it("las enciende cuando el plan sí las incluye", () => {
    const pro = ctx("ADMIN", TODOS_MODULOS, [
      "pos",
      "combos",
      "mesa_llevar",
      "pago_qr_mixto",
      "recibo_pdf",
      "reportes_operacion",
    ]);
    expect(puede(pro, "combos")).toBe(true);
    expect(puede(pro, "mesa_llevar")).toBe(true);
    expect(puede(pro, "reportes_operacion")).toBe(true);
    // Lo que no compró sigue apagado aunque el plan traiga otras cosas.
    expect(puede(pro, "reportes_rentabilidad")).toBe(false);
  });

  it("mover efectivo de la caja exige además ser encargado", () => {
    // El backend lo bloquea con RolesGuard: ofrecerle el botón al cajero
    // sería ofrecerle un 403.
    const features: Feature[] = ["pos", "caja", "movimientos_caja"];
    expect(puede(ctx("ADMIN", TODOS_MODULOS, features), "movimientos_caja")).toBe(true);
    expect(puede(ctx("SUPERVISOR", TODOS_MODULOS, features), "movimientos_caja")).toBe(true);
    expect(puede(ctx("CAJERO", ["POS", "CAJA"], features), "movimientos_caja")).toBe(false);
  });

  it("falla abierta con la lista de features vacía", () => {
    // Igual que las secciones: un negocio sin features migradas no se queda
    // sin poder trabajar; el backend igual responde 403 si no corresponde.
    const sinFeatures = ctx("ADMIN", TODOS_MODULOS, []);
    expect(puede(sinFeatures, "combos")).toBe(true);
    expect(puede(sinFeatures, "exportacion")).toBe(true);
  });
});

describe("el mesero", () => {
  // El login del rol MESERO en QA llega con `modulos: []`. No es un caso raro:
  // es el caso normal, y por eso el enrutado no puede depender de los módulos.
  const mesero = { rol: "MESERO" as Rol, modulos: [] as Modulo[], features: PLAN_FULL };

  it("entra al salón, no al POS", () => {
    // Igual que AuthenticationActivity en Android: el rol manda al panel del
    // mesero sin pasar por el menú del admin.
    expect(rutaInicial(mesero)).toBe("/salon");
  });

  it("no cobra: nada de POS, caja ni créditos", () => {
    // "No tiene drawer ni caja: el mesero no cobra" (MeserosActivity.kt).
    expect(puedeVer(mesero, "pos")).toBe(false);
    expect(puedeVer(mesero, "caja")).toBe(false);
    expect(puedeVer(mesero, "creditos")).toBe(false);
  });

  it("tampoco administra el catálogo ni ve reportes del negocio", () => {
    expect(puedeVer(mesero, "inventario")).toBe(false);
    expect(puedeVer(mesero, "productos")).toBe(false);
    expect(puedeVer(mesero, "reportes")).toBe(false);
    expect(puedeVer(mesero, "usuarios")).toBe(false);
  });

  it("no crea mesas: las usa", () => {
    // El ABM de mesas y zonas es del admin.
    expect(puedeVer(mesero, "mesas")).toBe(false);
  });

  it("el admin y el supervisor también miran el salón", () => {
    // Para no tener que pedirle el celular a un mesero.
    expect(puedeVer(ctx("ADMIN"), "salon")).toBe(true);
    expect(puedeVer(ctx("SUPERVISOR"), "salon")).toBe(true);
    expect(puedeVer(ctx("MESERO", [], PLAN_FULL), "salon")).toBe(true);
  });

  it("el cajero y el repartidor no entran al salón", () => {
    // El cajero ve las mesas por cobrar desde su POS, que es otra pantalla.
    expect(puedeVer(ctx("CAJERO", ["POS", "CAJA"]), "salon")).toBe(false);
    expect(puedeVer(ctx("REPARTIDOR", ["POS"]), "salon")).toBe(false);
  });

  it("apagar `salon` en el panel saca el salón y las mesas", () => {
    // El bug: `salon` estaba con `feature: null` y un comentario que decía que
    // no existía en el catálogo. Sí existe (se vende en Profesional desde el
    // 09-sep), así que el panel la apagaba y la sección seguía apareciendo.
    const sinSalon = PLAN_FULL.filter((f) => f !== "salon");
    expect(puedeVer(ctx("ADMIN", TODOS_MODULOS, sinSalon), "salon")).toBe(false);
    expect(puedeVer(ctx("ADMIN", TODOS_MODULOS, sinSalon), "mesas")).toBe(false);
    // Y el mesero de ese negocio no tiene a dónde entrar: es una cuenta que
    // quedó sin sección, y la pantalla de sin-acceso lo explica.
    expect(rutaInicial({ rol: "MESERO", modulos: [], features: sinSalon })).toBe(
      "/sin-acceso",
    );
  });

  it("apagar `salon` no toca el resto del menú", () => {
    // El candado es de la sección, no del negocio: el POS y la caja siguen.
    const sinSalon = PLAN_FULL.filter((f) => f !== "salon");
    const admin = ctx("ADMIN", TODOS_MODULOS, sinSalon);
    expect(puedeVer(admin, "pos")).toBe(true);
    expect(puedeVer(admin, "caja")).toBe(true);
    expect(puedeVer(admin, "inventario")).toBe(true);
  });

  it("el admin sigue entrando a lo suyo, no al salón", () => {
    // El salón no puede robarle la pantalla de inicio al admin.
    expect(rutaInicial(ctx("ADMIN"))).toBe("/inventario");
  });
});


describe("el rubro decide qué secciones existen", () => {
  const farmacia = { ...ctx("ADMIN"), rubro: "FARMACIA" };

  it("una farmacia no tiene salón, mesas ni insumos", () => {
    // No es un tema de plan: por más que lo compre, una farmacia no atiende
    // mesas ni transforma materia prima.
    expect(puedeVer(farmacia, "mesas")).toBe(false);
    expect(puedeVer(farmacia, "salon")).toBe(false);
    expect(puedeVer(farmacia, "insumos")).toBe(false);
  });

  it("una farmacia sí vende, cobra fiado y maneja inventario", () => {
    expect(puedeVer(farmacia, "pos")).toBe(true);
    expect(puedeVer(farmacia, "productos")).toBe(true);
    expect(puedeVer(farmacia, "movimientos")).toBe(true);
    expect(puedeVer(farmacia, "almacenes")).toBe(true);
    expect(puedeVer(farmacia, "creditos")).toBe(true);
    expect(puedeVer(farmacia, "reportes")).toBe(true);
  });

  it("un restaurante no pierde nada", () => {
    // La lista es NEGRA: lo que no está, se ve. Es la garantía de que esto no
    // le toca el menú a ningún negocio que ya está trabajando.
    const resto = { ...ctx("ADMIN"), rubro: "RESTAURANTE" };
    expect(puedeVer(resto, "mesas")).toBe(true);
    expect(puedeVer(resto, "insumos")).toBe(true);
    expect(puedeVer(resto, "salon")).toBe(true);
  });

  it("sin rubro se ve todo, como antes", () => {
    // Una sesión guardada antes de que el login mandara `tipoNegocio`.
    expect(puedeVer(ctx("ADMIN"), "mesas")).toBe(true);
    expect(puedeVer(ctx("ADMIN"), "insumos")).toBe(true);
  });

  it("el rubro no le abre la puerta a quien no corresponde", () => {
    // Pasa el filtro de rubro pero lo frena el rol, como siempre.
    const cajero = { ...ctx("CAJERO", ["POS", "CAJA"]), rubro: "FARMACIA" };
    expect(puedeVer(cajero, "productos")).toBe(false);
    expect(puedeVer(cajero, "pos")).toBe(true);
  });
});

describe("dashboard como sub-ítem de Inventario", () => {
  it("existe sólo en farmacia, y pide lo mismo que /inventario", () => {
    const farmacia = { ...ctx("ADMIN"), rubro: "FARMACIA" };
    expect(puedeVer(farmacia, "dashboard")).toBe(true);
    expect(puedeVer(farmacia, "inventario")).toBe(true);
    // Si el plan no trae inventario, tampoco el sub-ítem: llevaría a una ruta
    // que el guard rechaza.
    const sinInventario = { ...ctx("ADMIN", TODOS_MODULOS, ["pos", "caja"]), rubro: "FARMACIA" };
    expect(puedeVer(sinInventario, "dashboard")).toBe(false);
    // El cajero no entra a Inventario, así que tampoco a su Dashboard.
    expect(puedeVer({ ...ctx("CAJERO", ["POS", "CAJA"]), rubro: "FARMACIA" }, "dashboard")).toBe(
      false,
    );
  });

  it("bamardev-restaurant no lo ve: su Inventario sigue siendo un ítem solo", () => {
    expect(puedeVer({ ...ctx("ADMIN"), rubro: "RESTAURANTE" }, "dashboard")).toBe(false);
    expect(puedeVer(ctx("ADMIN"), "dashboard")).toBe(false);
    expect(puedeVer({ ...ctx("ADMIN"), rubro: "RESTAURANTE" }, "inventario")).toBe(true);
  });
});

describe("secciones propias de un rubro", () => {
  it("buscar medicamento existe sólo en una farmacia", () => {
    expect(puedeVer({ ...ctx("ADMIN"), rubro: "FARMACIA" }, "busqueda")).toBe(true);
    expect(puedeVer({ ...ctx("ADMIN"), rubro: "RESTAURANTE" }, "busqueda")).toBe(false);
    expect(puedeVer({ ...ctx("ADMIN"), rubro: "MINIMARKET" }, "busqueda")).toBe(false);
  });

  it("sin rubro tampoco aparece", () => {
    // Al revés que la lista negra: lo que nace de un rubro se oculta ante la
    // duda. Una sesión vieja no puede aterrizar en "Buscar medicamento".
    expect(puedeVer(ctx("ADMIN"), "busqueda")).toBe(false);
  });

  it("el cajero de la farmacia la usa; el repartidor no", () => {
    const cajero = { ...ctx("CAJERO", ["POS", "CAJA"]), rubro: "FARMACIA" };
    expect(puedeVer(cajero, "busqueda")).toBe(true);
    const repartidor = { ...ctx("REPARTIDOR", ["POS"]), rubro: "FARMACIA" };
    expect(puedeVer(repartidor, "busqueda")).toBe(false);
  });
});

describe("capacidades que no existen en un rubro", () => {
  it("una farmacia no parte una línea entre mesa y para llevar", () => {
    // Y no alcanza con que el plan no traiga la feature: las features fallan
    // ABIERTAS, así que una farmacia recién dada de alta las veía todas.
    const farmacia = { ...ctx("ADMIN", TODOS_MODULOS, []), rubro: "FARMACIA" };
    expect(puede(farmacia, "mesa_llevar")).toBe(false);
    // El resto de las capacidades sigue igual: no se apagó media app.
    expect(puede(farmacia, "pago_qr_mixto")).toBe(true);
    expect(puede(farmacia, "recibo_pdf")).toBe(true);
  });

  it("un restaurante la conserva", () => {
    const resto = { ...ctx("ADMIN", TODOS_MODULOS, []), rubro: "RESTAURANTE" };
    expect(puede(resto, "mesa_llevar")).toBe(true);
    expect(puede(ctx("ADMIN", TODOS_MODULOS, []), "mesa_llevar")).toBe(true);
  });
});

describe("vencimientos", () => {
  it("es de farmacia y de quien administra", () => {
    const farmacia = (rol: Rol) => ({ ...ctx(rol), rubro: "FARMACIA" });
    expect(puedeVer(farmacia("ADMIN"), "vencimientos")).toBe(true);
    expect(puedeVer(farmacia("SUPERVISOR"), "vencimientos")).toBe(true);
    // El cajero atiende; qué se devuelve al proveedor no es su decisión.
    expect(puedeVer({ ...ctx("CAJERO", ["POS", "CAJA"]), rubro: "FARMACIA" }, "vencimientos")).toBe(
      false,
    );
    expect(puedeVer({ ...ctx("ADMIN"), rubro: "RESTAURANTE" }, "vencimientos")).toBe(false);
  });

  it("pide la feature `lotes`, la misma que exige el backend", () => {
    // `lotes` va sólo en PRO. Con `inventario` como llave, una farmacia BASICO
    // veía Vencimientos en el menú y entraba a un 403.
    const sinLotes = PLAN_FULL.filter((f) => f !== "lotes");
    const basico = { ...ctx("ADMIN", TODOS_MODULOS, sinLotes), rubro: "FARMACIA" };
    expect(puedeVer(basico, "vencimientos")).toBe(false);
    expect(puede(basico, "lotes")).toBe(false);

    const pro = { ...ctx("ADMIN"), rubro: "FARMACIA" };
    expect(puedeVer(pro, "vencimientos")).toBe(true);
    expect(puede(pro, "lotes")).toBe(true);
  });

  it("una farmacia sin features cargadas la sigue viendo (falla abierto)", () => {
    const vacia = { ...ctx("ADMIN", TODOS_MODULOS, []), rubro: "FARMACIA" };
    expect(puedeVer(vacia, "vencimientos")).toBe(true);
    expect(puede(vacia, "lotes")).toBe(true);
  });
});

describe("encargos", () => {
  it("los anota quien atiende, también el cajero", () => {
    // El que escucha "¿no tenés…?" es el del mostrador, no el que administra.
    expect(puedeVer({ ...ctx("CAJERO", ["POS", "CAJA"]), rubro: "FARMACIA" }, "encargos")).toBe(
      true,
    );
    expect(puedeVer({ ...ctx("ADMIN"), rubro: "FARMACIA" }, "encargos")).toBe(true);
  });

  it("no existe fuera de farmacia", () => {
    expect(puedeVer({ ...ctx("ADMIN"), rubro: "RESTAURANTE" }, "encargos")).toBe(false);
    expect(puedeVer(ctx("ADMIN"), "encargos")).toBe(false);
  });

  it("apagar `encargos` en el panel la saca del menú", () => {
    // Es la feature que pide el backend: sin ella, entrar daba 403.
    const sinEncargos = PLAN_FULL.filter((f) => f !== "encargos");
    expect(
      puedeVer({ ...ctx("CAJERO", ["POS", "CAJA"], sinEncargos), rubro: "FARMACIA" }, "encargos"),
    ).toBe(false);
  });
});

describe("libro de controlados", () => {
  it("lo lee quien responde ante el SEDES, no el cajero", () => {
    // Trae nombres de pacientes y de médicos.
    expect(puedeVer({ ...ctx("ADMIN"), rubro: "FARMACIA" }, "controlados")).toBe(true);
    expect(puedeVer({ ...ctx("SUPERVISOR"), rubro: "FARMACIA" }, "controlados")).toBe(true);
    expect(puedeVer({ ...ctx("CAJERO", ["POS", "CAJA"]), rubro: "FARMACIA" }, "controlados")).toBe(
      false,
    );
  });

  it("es una obligación legal: no depende de lo que se contrató", () => {
    const planMinimo: Feature[] = ["pos", "caja", "inventario"];
    expect(
      puedeVer({ ...ctx("ADMIN", TODOS_MODULOS, planMinimo), rubro: "FARMACIA" }, "controlados"),
    ).toBe(true);
  });

  it("no existe fuera de farmacia", () => {
    expect(puedeVer({ ...ctx("ADMIN"), rubro: "RESTAURANTE" }, "controlados")).toBe(false);
    expect(puedeVer(ctx("ADMIN"), "controlados")).toBe(false);
  });
});

describe("proveedores", () => {
  it("los ve quien recibe la mercadería, no el cajero", () => {
    expect(puedeVer({ ...ctx("ADMIN"), rubro: "FARMACIA" }, "proveedores")).toBe(true);
    expect(puedeVer({ ...ctx("CAJERO", ["POS", "CAJA"]), rubro: "FARMACIA" }, "proveedores")).toBe(
      false,
    );
  });

  it("no existe fuera de farmacia", () => {
    expect(puedeVer({ ...ctx("ADMIN"), rubro: "RESTAURANTE" }, "proveedores")).toBe(false);
  });
});

describe("ingreso y salida de mercadería", () => {
  it("son las dos pantallas guiadas de la farmacia", () => {
    const farmacia = { ...ctx("ADMIN"), rubro: "FARMACIA" };
    expect(puedeVer(farmacia, "ingreso_mercaderia")).toBe(true);
    expect(puedeVer(farmacia, "salida_mercaderia")).toBe(true);
  });

  it("un restaurante no las ve, y su Movimientos queda igual", () => {
    // Es la garantía de que este rubro no le toca el menú a nadie más: el
    // negocio que ya trabaja sigue cargando entradas y salidas desde
    // Movimientos, con el formulario de siempre.
    const resto = { ...ctx("ADMIN"), rubro: "RESTAURANTE" };
    expect(puedeVer(resto, "ingreso_mercaderia")).toBe(false);
    expect(puedeVer(resto, "salida_mercaderia")).toBe(false);
    expect(puedeVer(resto, "movimientos")).toBe(true);
  });

  it("sin rubro tampoco aparecen", () => {
    expect(puedeVer(ctx("ADMIN"), "ingreso_mercaderia")).toBe(false);
    expect(puedeVer(ctx("ADMIN"), "salida_mercaderia")).toBe(false);
    expect(puedeVer(ctx("ADMIN"), "movimientos")).toBe(true);
  });

  it("mover stock no es atender el mostrador: el cajero no entra", () => {
    const cajero = { ...ctx("CAJERO", ["POS", "CAJA"]), rubro: "FARMACIA" };
    expect(puedeVer(cajero, "ingreso_mercaderia")).toBe(false);
    expect(puedeVer(cajero, "salida_mercaderia")).toBe(false);
    // Y lo que sí es del mostrador lo sigue teniendo.
    expect(puedeVer(cajero, "busqueda")).toBe(true);
  });

  it("piden lo mismo que Movimientos: sin inventario en el plan, no están", () => {
    const sinInventario = {
      ...ctx("ADMIN", TODOS_MODULOS, ["pos", "caja", "catalogo"]),
      rubro: "FARMACIA",
    };
    expect(puedeVer(sinInventario, "movimientos")).toBe(false);
    expect(puedeVer(sinInventario, "ingreso_mercaderia")).toBe(false);
    expect(puedeVer(sinInventario, "salida_mercaderia")).toBe(false);
  });
});

describe("transferencia de mercadería", () => {
  it("la farmacia con varias sucursales la tiene", () => {
    expect(puedeVer({ ...ctx("ADMIN"), rubro: "FARMACIA" }, "transferencia_mercaderia")).toBe(
      true,
    );
  });

  it("sin el plan de varias sucursales no hay a dónde transferir", () => {
    const unLocal = {
      ...ctx("ADMIN", TODOS_MODULOS, PLAN_FULL.filter((f) => f !== "multi_almacen")),
      rubro: "FARMACIA",
    };
    expect(puedeVer(unLocal, "transferencia_mercaderia")).toBe(false);
    // Ingreso y salida no dependen de eso.
    expect(puedeVer(unLocal, "ingreso_mercaderia")).toBe(true);
  });

  it("el cajero no mueve stock, y fuera de farmacia no existe", () => {
    const cajero = { ...ctx("CAJERO", ["POS", "CAJA"]), rubro: "FARMACIA" };
    expect(puedeVer(cajero, "transferencia_mercaderia")).toBe(false);
    expect(puedeVer({ ...ctx("ADMIN"), rubro: "RESTAURANTE" }, "transferencia_mercaderia")).toBe(
      false,
    );
    expect(puedeVer(ctx("ADMIN"), "transferencia_mercaderia")).toBe(false);
  });
});

describe("gastos operativos", () => {
  it("el admin y el supervisor lo ven; el cajero no", () => {
    // El backend lo exige con RolesGuard: un cajero no carga gastos del
    // negocio. Ofrecerselo seria mandarlo a un 403.
    expect(puedeVer(ctx("ADMIN"), "gastos")).toBe(true);
    expect(puedeVer(ctx("SUPERVISOR"), "gastos")).toBe(true);
    expect(puedeVer(ctx("CAJERO", ["POS", "CAJA"]), "gastos")).toBe(false);
  });

  it("apagar `gastos` en el panel saca la seccion", () => {
    const sinGastos = PLAN_FULL.filter((f) => f !== "gastos");
    expect(puedeVer(ctx("ADMIN", TODOS_MODULOS, sinGastos), "gastos")).toBe(false);
    // Y no se lleva puesto el resto del sistema.
    expect(puedeVer(ctx("ADMIN", TODOS_MODULOS, sinGastos), "reportes")).toBe(true);
  });

  it("un usuario que SOLO tiene gastos aterriza en /gastos", () => {
    // Devolvia "/sin-acceso" --"tu cuenta no tiene secciones"-- con "Gastos
    // operativos" dibujado en la barra de al lado, porque el menu filtra por
    // `puedeVer` y `rutaInicial` no lo tenia en su lista.
    const soloGastos = ctx("ADMIN", ["REPORTES"], ["gastos"]);
    expect(puedeVer(soloGastos, "gastos")).toBe(true);
    expect(rutaInicial(soloGastos)).toBe("/gastos");
  });
});

// ── Belleza (fase 0) ────────────────────────────────────────────────────────

/** Todas las secciones, para probar que el profesional no ve NINGUNA. */
const TODAS: Seccion[] = [
  "pos", "caja", "inventario", "productos", "insumos", "almacenes",
  "movimientos", "creditos", "reportes", "usuarios", "reparto", "salon",
  "mesas", "dashboard", "busqueda", "vencimientos", "encargos", "controlados",
  "proveedores", "ingreso_mercaderia", "salida_mercaderia",
  "transferencia_mercaderia", "gastos",
];

/** El perfil que manda el backend para una barbería (contrato §7). */
const PERFIL_BARBERIA = {
  etiquetasRol: { CAJERO: "Recepción", PROFESIONAL: "Barbero" },
  config: { rolesOfrecidos: ["ADMIN", "SUPERVISOR", "CAJERO", "PROFESIONAL"] },
};

describe("el profesional (interino, sin agenda todavía)", () => {
  it("no ve ninguna sección, aunque sus listas vengan vacías", () => {
    // Su rol no tiene módulos (D23): con la lista vacía todo falla abierto, y
    // es justo el caso que tiene que seguir cerrado.
    const sinNada = { rol: "PROFESIONAL" as Rol, modulos: [], features: [], rubro: "BARBERIA" };
    const conTodo = { ...ctx("PROFESIONAL"), rubro: "BARBERIA" };
    for (const seccion of TODAS) {
      expect(puedeVer(sinNada, seccion), seccion).toBe(false);
      expect(puedeVer(conTodo, seccion), seccion).toBe(false);
    }
  });

  it("aterriza en el aviso de su agenda, no en /sin-acceso", () => {
    // "/sin-acceso" le diría que su cuenta está mal configurada.
    expect(RUTA_AGENDA_PRONTO).toBe("/mi-agenda");
    expect(rutaInicial({ rol: "PROFESIONAL", modulos: [], features: [], rubro: "BARBERIA" })).toBe(
      "/mi-agenda",
    );
    expect(rutaInicial({ rol: "PROFESIONAL" })).toBe("/mi-agenda");
  });

  it("los demás roles siguen aterrizando donde siempre", () => {
    expect(rutaInicial({ ...ctx("ADMIN"), rubro: "BARBERIA" })).toBe("/inventario");
    expect(rutaInicial({ ...ctx("CAJERO", ["POS", "CAJA"]), rubro: "BARBERIA" })).toBe("/pos");
  });
});

describe("belleza: lo de gastronomía no existe", () => {
  it.each(["PELUQUERIA", "BARBERIA", "SPA", "UNAS"])(
    "%s no tiene salón, mesas ni insumos, aunque el plan los traiga",
    (rubro) => {
      // Segundo candado: el backend ya no le da esas features, pero con la
      // lista vacía (o una prendida a mano) fallarían abiertas.
      for (const features of [PLAN_FULL, []]) {
        const admin = { ...ctx("ADMIN", TODOS_MODULOS, features), rubro };
        expect(puedeVer(admin, "mesas")).toBe(false);
        expect(puedeVer(admin, "salon")).toBe(false);
        expect(puedeVer(admin, "insumos")).toBe(false);
        expect(puede(admin, "mesa_llevar")).toBe(false);
      }
    },
  );

  it("una barbería sí vende, cobra y maneja su catálogo", () => {
    const barberia = { ...ctx("ADMIN"), rubro: "BARBERIA" };
    expect(puedeVer(barberia, "pos")).toBe(true);
    expect(puedeVer(barberia, "caja")).toBe(true);
    expect(puedeVer(barberia, "productos")).toBe(true);
    expect(puedeVer(barberia, "reportes")).toBe(true);
    expect(puedeVer(barberia, "usuarios")).toBe(true);
    // Lo de farmacia tampoco aparece: la lista blanca no la incluye.
    expect(puedeVer(barberia, "busqueda")).toBe(false);
  });

  it("restaurante, minimarket y farmacia quedan como estaban", () => {
    const resto = { ...ctx("ADMIN"), rubro: "RESTAURANTE" };
    const mini = { ...ctx("ADMIN"), rubro: "MINIMARKET" };
    expect(puedeVer(resto, "mesas")).toBe(true);
    expect(puedeVer(resto, "salon")).toBe(true);
    expect(puedeVer(mini, "insumos")).toBe(true);
    // Lista vacía = falla abierto: el restaurante sigue partiendo mesa/llevar.
    expect(puede({ ...ctx("ADMIN", TODOS_MODULOS, []), rubro: "RESTAURANTE" }, "mesa_llevar")).toBe(
      true,
    );
    expect(puede({ ...ctx("ADMIN", TODOS_MODULOS, []), rubro: "FARMACIA" }, "mesa_llevar")).toBe(
      false,
    );
  });
});

describe("etiquetaRol", () => {
  it("sin negocio, o en los rubros de siempre, dice lo de siempre", () => {
    expect(etiquetaRol("CAJERO")).toBe("Cajero");
    expect(etiquetaRol("ADMIN")).toBe("Administrador");
    expect(etiquetaRol("PROFESIONAL")).toBe("Profesional");
    expect(etiquetaRol("CAJERO", { tipoNegocio: "RESTAURANTE" })).toBe("Cajero");
    expect(etiquetaRol("CAJERO", { tipoNegocio: "FARMACIA" })).toBe("Cajero");
  });

  it("con el perfil, usa sus etiquetas", () => {
    const barberia = { tipoNegocio: "BARBERIA", perfil: PERFIL_BARBERIA };
    expect(etiquetaRol("CAJERO", barberia)).toBe("Recepción");
    expect(etiquetaRol("PROFESIONAL", barberia)).toBe("Barbero");
    // Lo que el perfil no nombra cae al respaldo del rubro: en un salón el
    // ADMIN es el "Dueño" (QA B-19), como lo dice el backend en el login.
    expect(etiquetaRol("ADMIN", barberia)).toBe("Dueño");
    expect(etiquetaRol("SUPERVISOR", barberia)).toBe("Supervisor");
  });

  it("el ADMIN de restaurante y farmacia sigue siendo Administrador", () => {
    expect(etiquetaRol("ADMIN", { tipoNegocio: "RESTAURANTE" })).toBe("Administrador");
    expect(etiquetaRol("ADMIN", { tipoNegocio: "FARMACIA" })).toBe("Administrador");
  });

  it("el perfil manda sobre el respaldo por rubro", () => {
    const propio = {
      tipoNegocio: "PELUQUERIA",
      perfil: { etiquetasRol: { PROFESIONAL: "Colorista" } },
    };
    expect(etiquetaRol("PROFESIONAL", propio)).toBe("Colorista");
  });

  it("en belleza sin perfil (backend viejo) cae al respaldo del rubro", () => {
    expect(etiquetaRol("CAJERO", { tipoNegocio: "SPA" })).toBe("Recepción");
    expect(etiquetaRol("PROFESIONAL", { tipoNegocio: "SPA" })).toBe("Terapeuta");
    expect(etiquetaRol("PROFESIONAL", { tipoNegocio: "UNAS" })).toBe("Manicurista");
    expect(etiquetaRol("PROFESIONAL", { tipoNegocio: "PELUQUERIA" })).toBe("Estilista");
  });

  it("una etiqueta vacía del perfil no deja el rol sin nombre", () => {
    const vacio = { tipoNegocio: "RESTAURANTE", perfil: { etiquetasRol: { CAJERO: "  " } } };
    expect(etiquetaRol("CAJERO", vacio)).toBe("Cajero");
  });
});

describe("rolesAsignables", () => {
  it("sin perfil no ofrece PROFESIONAL: es lo de siempre", () => {
    expect(rolesAsignables({ rolActual: "ADMIN", conSalon: true })).toEqual([
      "SUPERVISOR",
      "CAJERO",
      "MESERO",
      "REPARTIDOR",
    ]);
    expect(rolesAsignables({ rolActual: "ADMIN", conSalon: false, perfil: null })).toEqual([
      "SUPERVISOR",
      "CAJERO",
      "REPARTIDOR",
    ]);
  });

  it("un perfil sin rolesOfrecidos da los de siempre, sin PROFESIONAL", () => {
    // Sin la clave = los roles de siempre (contrato §7).
    expect(rolesAsignables({ rolActual: "ADMIN", conSalon: true, perfil: { config: {} } })).toEqual([
      "SUPERVISOR",
      "CAJERO",
      "MESERO",
      "REPARTIDOR",
    ]);
  });

  it("con rolesOfrecidos, la lista filtra todos los roles", () => {
    // En una barbería no hay repartidores ni meseros: no se ofrecen aunque el
    // negocio tuviera salón. ADMIN viene en la lista y sigue sin ofrecerse.
    expect(
      rolesAsignables({ rolActual: "ADMIN", conSalon: false, perfil: PERFIL_BARBERIA }),
    ).toEqual(["SUPERVISOR", "CAJERO", "PROFESIONAL"]);
    expect(
      rolesAsignables({ rolActual: "ADMIN", conSalon: true, perfil: PERFIL_BARBERIA }),
    ).toEqual(["SUPERVISOR", "CAJERO", "PROFESIONAL"]);
  });

  it("la lista no le abre al mesero un negocio sin salón", () => {
    const conMesero = { config: { rolesOfrecidos: ["ADMIN", "CAJERO", "MESERO"] } };
    expect(rolesAsignables({ rolActual: "ADMIN", conSalon: false, perfil: conMesero })).toEqual([
      "CAJERO",
    ]);
    expect(rolesAsignables({ rolActual: "ADMIN", conSalon: true, perfil: conMesero })).toEqual([
      "CAJERO",
      "MESERO",
    ]);
  });

  it("el supervisor también asigna al profesional, dentro de la lista", () => {
    expect(
      rolesAsignables({ rolActual: "SUPERVISOR", conSalon: false, perfil: PERFIL_BARBERIA }),
    ).toEqual(["CAJERO", "PROFESIONAL"]);
  });

  it("sin perfil, un supervisor sólo asigna personal de piso", () => {
    expect(
      rolesAsignables({ rolActual: "SUPERVISOR", conSalon: true, perfil: null }),
    ).toEqual(["CAJERO", "MESERO", "REPARTIDOR"]);
  });

  it("el rol que ya tiene el usuario se sigue mostrando", () => {
    // Un profesional creado antes de que el perfil dejara de ofrecerlo: si no
    // se mostrara, guardarle el teléfono le cambiaría el rol.
    const r = rolesAsignables({ rolActual: "ADMIN", rolDelUsuario: "PROFESIONAL", conSalon: false });
    expect(r).toContain("PROFESIONAL");
    expect(rolesAsignables({ rolActual: "ADMIN", rolDelUsuario: "ADMIN", conSalon: false })).toContain(
      "ADMIN",
    );
    // Lo mismo con un rol que la lista del rubro ya no trae.
    expect(
      rolesAsignables({
        rolActual: "ADMIN",
        rolDelUsuario: "REPARTIDOR",
        conSalon: false,
        perfil: PERFIL_BARBERIA,
      }),
    ).toContain("REPARTIDOR");
  });
});
