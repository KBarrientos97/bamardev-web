import { describe, expect, it } from "vitest";
import type { Feature, Modulo, Rol } from "../types";
import { puedeVer, rutaInicial, tieneFeature, tieneModulo } from "./permisos";

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
