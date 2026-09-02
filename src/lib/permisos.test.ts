import { describe, expect, it } from "vitest";
import type { Feature, Modulo, Rol } from "../types";
import { puede, puedeVer, rutaInicial, tieneFeature, tieneModulo } from "./permisos";

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
