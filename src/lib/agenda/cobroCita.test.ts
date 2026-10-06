import { describe, expect, it } from "vitest";
import type { Producto } from "../../types";
import { haceCuanto, sinVer } from "./avisos";
import {
  citaDeLaUrl,
  citaQueCobra,
  detallesConProfesional,
  productosDeLaCita,
  rutaCobroCita,
} from "./cobroCita";
import type { AvisoAgenda, CarritoCita } from "./tiposAgenda";

/**
 * El cobro de la cita del lado de la web (PLAN-AGENDA-BELLEZA §10): de la
 * agenda al POS con el carrito armado, y del carrito a la venta con el
 * profesional de cada servicio.
 */

function carrito(extra: Partial<CarritoCita> = {}): CarritoCita {
  return {
    citaId: 9,
    codigo: "K7M2QX",
    estado: "POR_COBRAR",
    ventaId: null,
    cobroRevisar: false,
    sucursalId: 1,
    cliente: { id: 5, nombre: "Rosa Mamani" },
    lineas: [
      { productoId: 100, descripcion: "Corte dama", cantidad: 1, precio: 80, recursoId: 1, recurso: "Carla" },
      { productoId: 101, descripcion: "Brushing", cantidad: 1, precio: 40, recursoId: 2, recurso: "Ana" },
    ],
    total: 120,
    ...extra,
  };
}

const producto = (id: number, nombre: string): Producto =>
  ({ id, nombre, precio: 10, tipoProducto: "SERVICIO", stockTotal: 0 }) as Producto;

describe("de la agenda al POS", () => {
  it("la ruta lleva la cita y el POS la lee", () => {
    expect(rutaCobroCita(9)).toBe("/pos?cita=9");
    expect(citaDeLaUrl("?cita=9")).toBe(9);
    expect(citaDeLaUrl("")).toBeNull();
    expect(citaDeLaUrl("?cita=abc")).toBeNull();
    expect(citaDeLaUrl("?cita=-3")).toBeNull();
  });

  it("carga un producto por línea y avisa lo que el catálogo ya no tiene", () => {
    const c = carrito({
      lineas: [
        ...carrito().lineas,
        { productoId: 100, descripcion: "Corte dama", cantidad: 1, precio: 80, recursoId: 2, recurso: "Ana" },
        { productoId: 999, descripcion: "Servicio borrado", cantidad: 1, precio: 5, recursoId: 1, recurso: "Carla" },
      ],
    });
    const { productos, faltan } = productosDeLaCita(c, [producto(100, "Corte dama"), producto(101, "Brushing")]);
    expect(productos.map((p) => p.id)).toEqual([100, 101, 100]);
    expect(faltan).toEqual(["Servicio borrado"]);
  });
});

describe("del carrito a la venta", () => {
  it("cada servicio va con su profesional; lo de reventa, sin profesional", () => {
    const detalles = detallesConProfesional(
      [
        { productoId: 100, cantidad: 1, precio: 80 },
        { productoId: 101, cantidad: 1, precio: 40 },
        { productoId: 500, cantidad: 2, precio: 25 },
      ],
      carrito(),
    );
    expect(detalles).toEqual([
      { productoId: 100, cantidad: 1, precio: 80, recursoId: 1 },
      { productoId: 101, cantidad: 1, precio: 40, recursoId: 2 },
      { productoId: 500, cantidad: 2, precio: 25 },
    ]);
  });

  it("dos cortes juntos en el carrito, hechos por dos personas, se parten", () => {
    const c = carrito({
      lineas: [
        { productoId: 100, descripcion: "Corte", cantidad: 1, precio: 80, recursoId: 1, recurso: "Carla" },
        { productoId: 100, descripcion: "Corte", cantidad: 1, precio: 80, recursoId: 2, recurso: "Ana" },
      ],
    });
    expect(detallesConProfesional([{ productoId: 100, cantidad: 3, precio: 80 }], c)).toEqual([
      { productoId: 100, cantidad: 1, precio: 80, recursoId: 1 },
      { productoId: 100, cantidad: 1, precio: 80, recursoId: 2 },
      // La tercera la sumó la cajera: no es de nadie.
      { productoId: 100, cantidad: 1, precio: 80 },
    ]);
  });

  it("las unidades seguidas de la misma persona van juntas", () => {
    const c = carrito({
      lineas: [
        { productoId: 100, descripcion: "Corte", cantidad: 1, precio: 80, recursoId: 1, recurso: "Carla" },
        { productoId: 100, descripcion: "Corte", cantidad: 1, precio: 80, recursoId: 1, recurso: "Carla" },
      ],
    });
    expect(detallesConProfesional([{ productoId: 100, cantidad: 2, precio: 80 }], c)).toEqual([
      { productoId: 100, cantidad: 2, precio: 80, recursoId: 1 },
    ]);
  });

  it("sin cita, la venta es la de siempre", () => {
    const d = [{ productoId: 100, cantidad: 1, precio: 80 }];
    expect(detallesConProfesional(d, null)).toBe(d);
    expect(citaQueCobra(d, null)).toBeNull();
  });

  it("si la cajera sacó todos los servicios de la cita, la venta ya no la cobra", () => {
    expect(citaQueCobra([{ productoId: 100, cantidad: 1 }], carrito())).toBe(9);
    expect(citaQueCobra([{ productoId: 500, cantidad: 1 }], carrito())).toBeNull();
  });
});

describe("avisos de la campana", () => {
  const aviso = (en: string): AvisoAgenda => ({
    clave: en,
    tipo: "CITA_NUEVA",
    citaId: 1,
    codigo: "X",
    cliente: "Rosa",
    sucursalId: 1,
    inicio: null,
    recursos: [],
    usuario: null,
    en,
    texto: "",
  });

  it("cuenta los que llegaron después de la última vez que se abrió", () => {
    const lista = [aviso("2026-10-21T14:10:00.000Z"), aviso("2026-10-21T14:00:00.000Z")];
    expect(sinVer(lista, null)).toHaveLength(2);
    expect(sinVer(lista, "2026-10-21T14:05:00.000Z")).toHaveLength(1);
    expect(sinVer(lista, "2026-10-21T14:10:00.000Z")).toHaveLength(0);
  });

  it("dice hace cuánto", () => {
    const ahora = new Date("2026-10-21T15:00:00.000Z").getTime();
    expect(haceCuanto("2026-10-21T15:00:00.000Z", ahora)).toBe("recién");
    expect(haceCuanto("2026-10-21T14:55:00.000Z", ahora)).toBe("hace 5 min");
    expect(haceCuanto("2026-10-21T12:00:00.000Z", ahora)).toBe("hace 3 h");
    expect(haceCuanto("2026-10-20T12:00:00.000Z", ahora)).toBe("ayer");
  });
});
