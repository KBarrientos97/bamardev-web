import { describe, expect, it, vi } from "vitest";
import type { Carrito } from "../../pages/pos/useCarrito";
import {
  carritoConCuotas,
  cuotasIniciales,
  detallesDeCuotas,
  enlaceDeCuotas,
  montoValido,
  pagadorPorDefecto,
  totalCuotas,
  ventaConCuotas,
  type CobroCuotas,
} from "./cobroCuotas";
import type { Venta } from "../../types";

/** El cobro de cuotas en el POS (E9): viajan aparte del carrito de productos. */

function carrito(): Carrito {
  return {
    lineas: [],
    unidades: 1,
    subtotal: 60,
    total: 60,
    agregar: vi.fn(),
    setCantidad: vi.fn(),
    setNota: vi.fn(),
    setEnMesa: vi.fn(),
    setConsumo: vi.fn(),
    setConsumoTodo: vi.fn(),
    quitar: vi.fn(),
    vaciar: vi.fn(),
    aDetalles: () => [{ productoId: 9, cantidad: 1, precio: 60, consumo: "LLEVAR" }],
  };
}

const COBRO: CobroCuotas = {
  inscripcionId: 5,
  alumno: { id: 3, nombre: "Bustillos Rek, Camila" },
  pagadores: [{ clienteId: 30, nombre: "Camila", rol: "ALUMNO", principal: true }],
  pagadorId: 30,
  sedeGrupo: "Norte",
  otraSede: true,
  lineas: [
    { cuotaId: 11, productoId: 77, descripcion: "Barbería · Cuota 2", monto: 750, saldo: 750, vencida: true },
    { cuotaId: 12, productoId: 77, descripcion: "Barbería · Cuota 3", monto: 200, saldo: 533, vencida: false },
  ],
};

describe("las cuotas en la venta", () => {
  it("sin cuotas el carrito es el MISMO: la venta sale como siempre", () => {
    const c = carrito();
    expect(carritoConCuotas(c, null, vi.fn())).toBe(c);
    expect(detallesDeCuotas(null)).toEqual([]);
  });

  it("cada cuota es un detalle con cuotaId, montoCuota y cantidad 1, aunque compartan producto", () => {
    expect(detallesDeCuotas(COBRO)).toEqual([
      { productoId: 77, cantidad: 1, precio: 750, cuotaId: 11, montoCuota: 750 },
      { productoId: 77, cantidad: 1, precio: 200, cuotaId: 12, montoCuota: 200 },
    ]);
  });

  it("el carrito de la pantalla suma las cuotas y vaciarlo las suelta", () => {
    const c = carrito();
    const soltar = vi.fn();
    const conCuotas = carritoConCuotas(c, COBRO, soltar);
    expect(totalCuotas(COBRO)).toBe(950);
    expect(conCuotas.total).toBe(1010);
    expect(conCuotas.unidades).toBe(3);
    expect(conCuotas.aDetalles()).toHaveLength(3);
    conCuotas.vaciar();
    expect(c.vaciar).toHaveBeenCalled();
    expect(soltar).toHaveBeenCalled();
  });

  it("el abono va de más que cero hasta el saldo", () => {
    expect(montoValido(200, 533)).toBe(true);
    expect(montoValido(533, 533)).toBe(true);
    expect(montoValido(534, 533)).toBe(false);
    expect(montoValido(0, 533)).toBe(false);
  });

  it("las vencidas arriba y marcadas; si ninguna venció, la primera", () => {
    const lineas = cuotasIniciales({
      alumno: { id: 1, nombre: "A" },
      pagadores: [],
      lineas: [
        { productoId: 7, cuotaId: 1, descripcion: "M3", saldo: 533, vence: "2026-11-01", vencida: false },
        { productoId: 7, cuotaId: 2, descripcion: "M2", saldo: 333, vence: "2026-09-17", vencida: true },
      ],
    });
    expect(lineas.map((l) => [l.linea.cuotaId, l.elegida])).toEqual([
      [2, true],
      [1, false],
    ]);
    const ninguna = cuotasIniciales({
      alumno: { id: 1, nombre: "A" },
      pagadores: [],
      lineas: [
        { productoId: 7, cuotaId: 1, descripcion: "M2", saldo: 533, vence: "2026-11-01", vencida: false },
        { productoId: 7, cuotaId: 2, descripcion: "M3", saldo: 533, vence: "2026-12-01", vencida: false },
      ],
    });
    expect(ninguna.map((l) => l.elegida)).toEqual([true, false]);
  });

  it("lo acordado al inscribir se reparte en orden: enteras las que alcanza, el resto como abono", () => {
    const carrito = {
      alumno: { id: 1, nombre: "A" },
      pagadores: [],
      lineas: [
        { productoId: 7, cuotaId: 1, descripcion: "M1", saldo: 500, vence: "2026-10-10", vencida: false },
        { productoId: 7, cuotaId: 2, descripcion: "M2", saldo: 500, vence: "2026-11-10", vencida: false },
        { productoId: 7, cuotaId: 3, descripcion: "M3", saldo: 500, vence: "2026-12-10", vencida: false },
      ],
    };
    const r = cuotasIniciales(carrito, 700);
    expect(r.map((l) => [l.linea.cuotaId, l.elegida, l.linea.monto])).toEqual([
      [1, true, 500],
      [2, true, 200],
      [3, false, 500],
    ]);
    expect(cuotasIniciales(carrito, 300).map((l) => l.elegida)).toEqual([true, false, false]);
  });

  it("paga por defecto el principal, en el orden del backend", () => {
    expect(
      pagadorPorDefecto([
        { clienteId: 40, nombre: "Rosa", rol: "TUTOR", principal: true },
        { clienteId: 41, nombre: "Joaquín", rol: "ALUMNO", principal: false },
      ]),
    ).toBe(40);
    expect(pagadorPorDefecto([])).toBeNull();
  });
});

describe("la venta recién cobrada, para el recibo", () => {
  it("cada renglón de la carrera lleva su cuota en orden, y dice si pagó el tutor", () => {
    const venta = {
      id: 9,
      detalles: [
        { productoId: 5, producto: "Polera", cantidad: 1, precio: 60, subtotal: 60, nota: null, consumo: "LLEVAR" },
        { productoId: 77, producto: "Barbería", cantidad: 1, precio: 750, subtotal: 750, nota: null, consumo: "LLEVAR" },
        { productoId: 77, producto: "Barbería", cantidad: 1, precio: 200, subtotal: 200, nota: null, consumo: "LLEVAR" },
      ],
      cuotas: [
        { cuotaId: 11, concepto: "Cuota 2/3", alumno: "A", cobrado: 750, pagado: 750, saldo: 0, estado: "PAGADA", saldoCurso: 333, proximaCuota: null },
        { cuotaId: 12, concepto: "Cuota 3/3", alumno: "A", cobrado: 200, pagado: 200, saldo: 333, estado: "PARCIAL", saldoCurso: 333, proximaCuota: null },
      ],
    } as unknown as Venta;
    const conTutor: CobroCuotas = {
      ...COBRO,
      pagadores: [
        { clienteId: 70, nombre: "Patricia Suárez", rol: "TUTOR", principal: true },
        { clienteId: 30, nombre: "Camila", rol: "ALUMNO", principal: false },
      ],
      pagadorId: 70,
    };
    const r = ventaConCuotas(venta, conTutor);
    expect(r.detalles?.map((d) => d.cuotaId)).toEqual([undefined, 11, 12]);
    expect(r.pagadorCuotas).toEqual({ nombre: "Patricia Suárez", rol: "TUTOR" });
    expect(ventaConCuotas(venta, { ...conTutor, pagadorId: 30 }).pagadorCuotas).toBeNull();
    expect(ventaConCuotas(venta, null)).toBe(venta);
  });
});

describe("enlaceDeCuotas (contrato #39, B-14)", () => {
  const base = { cuotaId: 1, concepto: "M1", alumno: "A", cobrado: 1, pagado: 1, saldo: 0, estado: "PAGADA", saldoCurso: 0, proximaCuota: null };
  it("toma el enlace de la venta, null si dijo que no hay, undefined si no lo mandó", () => {
    expect(enlaceDeCuotas([{ ...base, enlacePago: null }, { ...base, enlacePago: "https://x/p/a/pagar/t" }])).toBe("https://x/p/a/pagar/t");
    expect(enlaceDeCuotas([{ ...base, enlacePago: null }])).toBeNull();
    expect(enlaceDeCuotas([base])).toBeUndefined();
  });
});
