import { describe, expect, it } from "vitest";
import type { FilaPorSucursal, PorSucursalApi } from "../api";
import {
  aclaracionDeFila,
  columnasConDatos,
  filaGeneral,
  filasDeLocales,
  hayQueComparar,
  hojaComparativo,
  localQueMasVendio,
  tonoUtilidad,
} from "./CompararSucursales.datos";

const fila = (p: Partial<FilaPorSucursal>): FilaPorSucursal => ({
  sucursalId: 1,
  nombre: "Centro",
  general: false,
  tipo: "SUCURSAL",
  activa: true,
  esPrincipal: false,
  ventas: 0,
  tickets: 0,
  costoVentas: 0,
  utilidadBruta: 0,
  margenBrutoPct: null,
  ventasSinCosto: 0,
  mermas: 0,
  gastosOperativos: 0,
  bajoLaLinea: 0,
  utilidadOperativa: 0,
  ...p,
});

/** El ejemplo del contrato (§9.4). */
const D: PorSucursalApi = {
  desde: "2026-11-01T04:00:00.000Z",
  hasta: "2026-12-01T04:00:00.000Z",
  alcance: "organizacion",
  filas: [
    fila({ sucursalId: 1, nombre: "Sucursal A", esPrincipal: true, ventas: 180, tickets: 3, costoVentas: 90, utilidadBruta: 90, margenBrutoPct: 50, gastosOperativos: 200, bajoLaLinea: 30, utilidadOperativa: -110 }),
    fila({ sucursalId: 2, nombre: "Sucursal B", ventas: 70, tickets: 2, costoVentas: 24, utilidadBruta: 46, margenBrutoPct: 65.71, gastosOperativos: 50, utilidadOperativa: -4 }),
    fila({ sucursalId: null, nombre: "General del negocio", general: true, tipo: null, gastosOperativos: 80, utilidadOperativa: -80 }),
  ],
  total: fila({ sucursalId: null, nombre: "Total", ventas: 250, tickets: 5, costoVentas: 114, utilidadBruta: 136, margenBrutoPct: 54.4, gastosOperativos: 330, bajoLaLinea: 30, utilidadOperativa: -194 }),
};

describe("comparar sucursales", () => {
  it("hay algo que comparar con 2+ locales; la fila general no cuenta como local", () => {
    expect(hayQueComparar(D)).toBe(true);
    expect(hayQueComparar({ filas: [D.filas[0], D.filas[2]] })).toBe(false);
    expect(hayQueComparar({ filas: [] })).toBe(false);
  });

  it("separa los locales de la fila «General del negocio»", () => {
    expect(filasDeLocales(D).map((f) => f.nombre)).toEqual(["Sucursal A", "Sucursal B"]);
    expect(filaGeneral(D)?.nombre).toBe("General del negocio");
    expect(filaGeneral({ filas: [D.filas[0]] })).toBeNull();
  });

  it("el local que más vendió sale de las ventas; si nadie vendió, no hay «mejor»", () => {
    expect(localQueMasVendio(D)?.nombre).toBe("Sucursal A");
    expect(localQueMasVendio({ filas: [fila({ ventas: 0 }), fila({ sucursalId: 2, ventas: 0 })] })).toBeNull();
  });

  it("las columnas de mermas y de banco e impuestos sólo van si alguna fila las tiene", () => {
    expect(columnasConDatos(D)).toEqual({ mermas: false, bajoLaLinea: true });
    const conMermas = { ...D, total: { ...D.total, mermas: 5 } };
    expect(columnasConDatos(conMermas).mermas).toBe(true);
  });

  it("aclara un depósito, un local dado de baja y los gastos generales", () => {
    expect(aclaracionDeFila(D.filas[0])).toBeNull();
    expect(aclaracionDeFila(D.filas[2])).toMatch(/ningún local/);
    expect(aclaracionDeFila(fila({ tipo: "DEPOSITO" }))).toBe("Depósito");
    expect(aclaracionDeFila(fila({ activa: false }))).toBe("Dada de baja");
  });

  it("una utilidad en cero no es una pérdida", () => {
    expect(tonoUtilidad(-110)).toBe("negativo");
    expect(tonoUtilidad(46)).toBe("positivo");
    expect(tonoUtilidad(0)).toBe("neutro");
    expect(tonoUtilidad(0.004)).toBe("neutro");
  });
});

describe("el Excel del comparativo", () => {
  it("lleva una fila por local, la general y el total, con el rótulo del rubro", () => {
    const h = hojaComparativo(D, "Sede");
    expect(h.nombre).toBe("Por sucursal");
    expect(h.filas[0]).toEqual([
      "Sede",
      "Ventas (Bs)",
      "Tickets",
      "Costo de lo vendido (Bs)",
      "Utilidad bruta (Bs)",
      "Margen bruto (%)",
      "Gastos (Bs)",
      "Utilidad operativa (Bs)",
      "Banco e impuestos (Bs)",
    ]);
    expect(h.filas.map((f) => f[0])).toEqual(["Sede", "Sucursal A", "Sucursal B", "General del negocio", "Total"]);
    expect(h.filas[1]).toEqual(["Sucursal A", 180, 3, 90, 90, 50, 200, -110, 30]);
    expect(h.filas[4]).toEqual(["Total", 250, 5, 114, 136, 54.4, 330, -194, 30]);
  });

  it("con mermas agrega su columna; sin banco ni impuestos, no", () => {
    const d: PorSucursalApi = {
      ...D,
      filas: D.filas.map((f) => ({ ...f, bajoLaLinea: 0 })),
      total: { ...D.total, bajoLaLinea: 0, mermas: 7 },
    };
    const cabecera = hojaComparativo(d).filas[0] as string[];
    expect(cabecera).toContain("Mermas (Bs)");
    expect(cabecera).not.toContain("Banco e impuestos (Bs)");
  });
});
