import { beforeEach, describe, expect, it } from "vitest";
import type { Carrito, LineaCarrito } from "../../pages/pos/useCarrito";
import type { DetalleVentaInput, Producto } from "../../types";
import type { Recurso } from "./tiposConfigAgenda";
import type { PaqueteDelCliente } from "./tiposSpa";
import {
  carritoConProfesional,
  carritoConSesiones,
  sesionesParaLaVenta,
  guardarAsignacion,
  leerAsignacion,
  profesionalDeLinea,
  profesionalDeTodos,
  profesionalesDelServicio,
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
  servicioIds: [1, 2],
  comisionProductoPct: 10,
  serviciosPropios: [
    { servicioId: 2, precio: 250, duracionMin: null, comisionPct: null },
    { servicioId: 1, precio: null, duracionMin: 20, comisionPct: null },
  ],
});
const beto = recurso({ id: 11, nombre: "Beto", orden: 2, servicioIds: [1] });
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

describe("QA DIA-07: el producto de reventa, sólo si se elige quién lo vendió", () => {
  it("sabe quién cobra % de productos", () => {
    expect(profesionales.map((p) => [p.nombre, p.comisionaProductos])).toEqual([
      ["Ana", true],
      ["Beto", false],
    ]);
  });

  it("el de toda la venta no lo toca; el elegido en su línea va en el detalle", () => {
    const a = { general: 11, porServicio: { 3: 10 } };
    expect(profesionalDeLinea(champu, a)).toBe(10);
    expect(profesionalDeLinea(champu, { general: 11, porServicio: {} })).toBeNull();
    expect(profesionalDeLinea(paquete, { general: 11, porServicio: { 4: 10 } })).toBeNull();
    const c = carritoConProfesional(
      carrito([
        [corte, 1],
        [champu, 2],
      ]),
      a,
      profesionales,
    );
    expect(c.aDetalles().map((d) => [d.productoId, d.recursoId])).toEqual([
      [1, 11],
      [3, 10],
    ]);
    // El precio del producto no cambia: el propio es sólo de servicios.
    expect(c.total).toBe(130);
  });

  it("la propina sigue siendo para quien hizo un servicio", () => {
    const c = carrito([
      [corte, 1],
      [champu, 1],
    ]);
    expect(profesionalesDeLaVenta(c, { general: 11, porServicio: { 3: 10 } }, profesionales)).toEqual([
      { id: 11, nombre: "Beto" },
    ]);
  });
});

describe("QA VER-04: «Por servicio» ofrece a quienes hacen ese servicio", () => {
  it("filtra por servicio y deja al que ya tiene la línea", () => {
    expect(profesionalesDelServicio(2, profesionales, null).map((p) => p.nombre)).toEqual(["Ana"]);
    expect(profesionalesDelServicio(2, profesionales, 11).map((p) => p.nombre)).toEqual(["Ana", "Beto"]);
    expect(profesionalesDelServicio(1, profesionales, null).map((p) => p.nombre)).toEqual(["Ana", "Beto"]);
  });

  it("si nadie lo tiene cargado, ofrece a todos (no frena la venta)", () => {
    expect(profesionalesDelServicio(99, profesionales, null)).toEqual(profesionales);
  });
});

describe("QA DIA-08: la clienta con bono que llega sin cita", () => {
  const paquete = (p: Partial<PaqueteDelCliente> & { id: number }): PaqueteDelCliente => ({
    nombre: "3 cortes",
    compradoEn: "2026-10-01T12:00:00Z",
    venceEn: "2026-12-01T04:00:00Z",
    ultimoDia: "2026-11-30",
    estado: "ACTIVO",
    vencido: false,
    ventaId: 1,
    items: [{ servicioId: 1, servicio: "Corte", sesiones: 3, usadas: 1, restantes: 2 }],
    ...p,
  });

  it("ofrece los servicios que cubre un paquete vigente con saldo, el que vence antes", () => {
    const lineas = carrito([
      [corte, 1],
      [tinte, 1],
      [champu, 1],
    ]).lineas;
    const ofrecidas = sesionesParaLaVenta(lineas, [
      paquete({ id: 2, nombre: "Nuevo", venceEn: "2027-01-01T04:00:00Z", ultimoDia: "2026-12-31" }),
      paquete({ id: 1, nombre: "Viejo" }),
      paquete({ id: 3, nombre: "Anulado", estado: "ANULADO", items: [{ servicioId: 2, servicio: "Tinte", sesiones: 1, usadas: 0, restantes: 1 }] }),
    ]);
    expect(ofrecidas).toEqual([
      { productoId: 1, descripcion: "Corte", cantidad: 1, paquete: "Viejo", restantes: 1, ultimoDia: "2026-11-30" },
    ]);
  });

  it("sin saldo para la cantidad entera, no se ofrece", () => {
    const lineas = carrito([[corte, 3]]).lineas;
    expect(sesionesParaLaVenta(lineas, [paquete({ id: 1 })])).toEqual([]);
    expect(sesionesParaLaVenta(lineas, [paquete({ id: 1, vencido: true })])).toEqual([]);
  });

  it("la línea elegida va a 0 con usarPaquete; sin elegir, el mismo carrito", () => {
    const base = carrito([
      [corte, 1],
      [tinte, 1],
    ]);
    expect(carritoConSesiones(base, [])).toBe(base);
    expect(carritoConSesiones(base, [99])).toBe(base);
    const c = carritoConSesiones(base, [1]);
    expect(c.total).toBe(200);
    expect(c.aDetalles()).toEqual([
      { productoId: 1, cantidad: 1, precio: 0, consumo: "LLEVAR", usarPaquete: true },
      { productoId: 2, cantidad: 1, precio: 200, consumo: "LLEVAR" },
    ]);
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
