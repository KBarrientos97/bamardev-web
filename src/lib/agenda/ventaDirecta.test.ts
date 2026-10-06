import { beforeEach, describe, expect, it } from "vitest";
import type { Carrito, LineaCarrito } from "../../pages/pos/useCarrito";
import type { DetalleVentaInput, Producto } from "../../types";
import type { Recurso } from "./tiposConfigAgenda";
import {
  carritoConProfesional,
  guardarAsignacion,
  leerAsignacion,
  profesionalDeTodos,
  profesionalesDeLaVenta,
  profesionalesParaPos,
  SIN_ASIGNAR,
} from "./ventaDirecta";

const producto = (id: number, nombre: string, precio: number, extra: Partial<Producto> = {}) =>
  ({ id, nombre, precio, tipoProducto: "SERVICIO", ...extra }) as Producto;

const corte = producto(1, "Corte", 50);
const tinte = producto(2, "Tinte", 200);
const champu = producto(3, "Champú", 40, { tipoProducto: "ALMACENABLE" });
const paquete = producto(4, "3 cortes", 120, { esPaquete: true });

function carrito(lineas: [Producto, number][]): Carrito {
  const ls: LineaCarrito[] = lineas.map(([p, cantidad]) => ({ producto: p, cantidad, enMesa: 0, nota: "" }));
  const total = ls.reduce((s, l) => s + l.cantidad * l.producto.precio, 0);
  return {
    lineas: ls,
    unidades: ls.reduce((s, l) => s + l.cantidad, 0),
    subtotal: total,
    total,
    aDetalles: (): DetalleVentaInput[] =>
      ls.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad, precio: l.producto.precio, consumo: "LLEVAR" })),
  } as Carrito;
}

const recurso = (r: Partial<Recurso> & { id: number; nombre: string }): Recurso =>
  ({
    tipo: "PROFESIONAL",
    activo: true,
    orden: 0,
    sucursalIds: [1],
    servicioIds: [],
    ...r,
  }) as Recurso;

const ana = recurso({
  id: 10,
  nombre: "Ana",
  orden: 1,
  serviciosPropios: [
    { servicioId: 2, precio: 250, duracionMin: null, comisionPct: null },
    { servicioId: 1, precio: null, duracionMin: 20, comisionPct: null },
  ],
});
const beto = recurso({ id: 11, nombre: "Beto", orden: 2 });
const profesionales = profesionalesParaPos(
  [
    beto,
    ana,
    recurso({ id: 12, nombre: "Cabina", tipo: "ESPACIO" }),
    recurso({ id: 13, nombre: "Carla", activo: false }),
    recurso({ id: 14, nombre: "Del Norte", sucursalIds: [2] }),
  ],
  1,
);

describe("venta directa con profesional (N2-13)", () => {
  it("ofrece sólo profesionales activos de la sucursal, en el orden de la agenda", () => {
    expect(profesionales.map((p) => p.nombre)).toEqual(["Ana", "Beto"]);
    expect(profesionales[0].precios).toEqual({ 2: 250 });
  });

  it("sin nadie asignado el carrito es el mismo (la venta de siempre)", () => {
    const c = carrito([[tinte, 1]]);
    expect(carritoConProfesional(c, SIN_ASIGNAR, profesionales)).toBe(c);
  });

  it("con profesional: su precio propio en la línea y en el total, y recursoId en los detalles", () => {
    const c = carritoConProfesional(
      carrito([
        [tinte, 1],
        [corte, 2],
        [champu, 1],
      ]),
      { general: 10, porServicio: {} },
      profesionales,
    );
    expect(c.lineas.map((l) => l.producto.precio)).toEqual([250, 50, 40]);
    expect(c.total).toBe(390);
    expect(c.aDetalles()).toEqual([
      { productoId: 2, cantidad: 1, precio: 250, consumo: "LLEVAR", recursoId: 10 },
      { productoId: 1, cantidad: 2, precio: 50, consumo: "LLEVAR", recursoId: 10 },
      // El producto de reventa va sin profesional, como en el cobro de una cita.
      { productoId: 3, cantidad: 1, precio: 40, consumo: "LLEVAR" },
    ]);
  });

  it("por servicio: el cambiado manda sobre el de toda la venta, y se puede dejar sin nadie", () => {
    const base = carrito([
      [tinte, 1],
      [corte, 1],
    ]);
    const c = carritoConProfesional(base, { general: 10, porServicio: { 2: 11 } }, profesionales);
    // Beto no tiene precio propio en el tinte: el de lista.
    expect(c.total).toBe(250);
    expect(c.aDetalles().map((d) => d.recursoId)).toEqual([11, 10]);
    const sinNadie = carritoConProfesional(base, { general: 10, porServicio: { 1: null } }, profesionales);
    expect(sinNadie.aDetalles().map((d) => d.recursoId)).toEqual([10, undefined]);
  });

  it("un paquete no lleva profesional", () => {
    const c = carrito([[paquete, 1]]);
    expect(carritoConProfesional(c, { general: 10, porServicio: {} }, profesionales)).toBe(c);
  });

  it("la propina se ofrece a los profesionales de la venta, sin repetir", () => {
    const c = carrito([
      [tinte, 1],
      [corte, 1],
      [champu, 1],
    ]);
    expect(profesionalesDeLaVenta(c, { general: 10, porServicio: {} }, profesionales)).toEqual([
      { id: 10, nombre: "Ana" },
    ]);
    expect(profesionalesDeLaVenta(c, { general: 10, porServicio: { 1: 11 } }, profesionales)).toEqual([
      { id: 10, nombre: "Ana" },
      { id: 11, nombre: "Beto" },
    ]);
    expect(profesionalesDeLaVenta(c, SIN_ASIGNAR, profesionales)).toEqual([]);
  });

  describe("sobrevive a un F5", () => {
    beforeEach(() => sessionStorage.clear());

    it("guarda y lee la asignación; vacía no deja nada", () => {
      guardarAsignacion({ general: 10, porServicio: { 2: 11 } });
      expect(leerAsignacion()).toEqual({ general: 10, porServicio: { 2: 11 } });
      guardarAsignacion(SIN_ASIGNAR);
      expect(sessionStorage.getItem("bamar.profesionalVenta")).toBeNull();
      expect(leerAsignacion()).toEqual(SIN_ASIGNAR);
    });
  });
});

describe("profesionalDeTodos (QA PER-07)", () => {
  it("uno solo para todos los servicios, o VARIOS si difieren", () => {
    expect(profesionalDeTodos([1, 2], { general: 7, porServicio: {} })).toBe(7);
    expect(profesionalDeTodos([1, 2], { general: 7, porServicio: { 2: 7 } })).toBe(7);
    expect(profesionalDeTodos([1, 2], { general: 7, porServicio: { 2: 8 } })).toBe("VARIOS");
    expect(profesionalDeTodos([1, 2], { general: null, porServicio: { 1: 8, 2: 8 } })).toBe(8);
    expect(profesionalDeTodos([1, 2], { general: 7, porServicio: { 1: null } })).toBe("VARIOS");
    expect(profesionalDeTodos([], SIN_ASIGNAR)).toBeNull();
  });
});
