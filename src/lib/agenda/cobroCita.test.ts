import { describe, expect, it } from "vitest";
import type { Producto } from "../../types";
import { haceCuanto, sinVer } from "./avisos";
import {
  catalogoConCita,
  citaDeLaUrl,
  citaQueCobra,
  coberturaCita,
  detallesConProfesional,
  productosDeLaCita,
  rutaCobroCita,
  textoCoberturaIncompleta,
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

  it("carga un producto por línea; lo que el catálogo ya no tiene, con lo del carrito (A-03)", () => {
    const c = carrito({
      lineas: [
        ...carrito().lineas,
        { productoId: 100, descripcion: "Corte dama", cantidad: 1, precio: 80, recursoId: 2, recurso: "Ana" },
        { productoId: 999, descripcion: "Servicio desactivado", cantidad: 1, precio: 5, recursoId: 1, recurso: "Carla" },
      ],
    });
    const { productos, desactivados } = productosDeLaCita(c, [producto(100, "Corte dama"), producto(101, "Brushing")]);
    expect(productos.map((p) => p.id)).toEqual([100, 101, 100, 999]);
    expect(productos[3]).toMatchObject({ nombre: "Servicio desactivado", precio: 5, tipoProducto: "SERVICIO" });
    expect(desactivados).toEqual(["Servicio desactivado"]);
  });

  it("el catálogo del POS suma los servicios de la cita que no tiene, sin repetir", () => {
    const catalogo = [producto(100, "Corte dama")];
    expect(catalogoConCita(catalogo, null)).toBe(catalogo);
    expect(catalogoConCita([producto(100, "Corte dama"), producto(101, "Brushing")], carrito())).toHaveLength(2);
    const conCita = catalogoConCita(catalogo, carrito());
    expect(conCita.map((p) => p.id)).toEqual([100, 101]);
    expect(conCita[1]).toMatchObject({ nombre: "Brushing", precio: 40 });
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

describe("¿la venta cubre la cita? (A-02)", () => {
  const bs = (n: number) => `Bs ${n}`;

  it("con todos sus servicios y su total, la cubre", () => {
    const d = [
      { productoId: 100, cantidad: 1, precio: 80 },
      { productoId: 101, cantidad: 1, precio: 40 },
      // Lo que se suma de más no la descubre.
      { productoId: 500, cantidad: 1, precio: 10 },
    ];
    expect(coberturaCita(d, carrito(), 130)?.cubre).toBe(true);
  });

  it("sin un servicio no la cubre y dice cuál falta", () => {
    const c = coberturaCita([{ productoId: 100, cantidad: 1, precio: 80 }], carrito(), 80)!;
    expect(c.cubre).toBe(false);
    expect(c.faltan).toEqual(["Brushing"]);
    expect(textoCoberturaIncompleta(c, bs)).toBe(
      "Esta venta no cubre toda la cita (faltan: Brushing · cobrás Bs 80 de Bs 120). " +
        "La cita se dará por cobrada pero quedará marcada para revisar en el cierre de caja.",
    );
  });

  it("compara como multiconjunto: dos cortes agendados piden dos", () => {
    const c = carrito({
      lineas: [
        { productoId: 100, descripcion: "Corte", cantidad: 1, precio: 80, recursoId: 1, recurso: "Carla" },
        { productoId: 100, descripcion: "Corte", cantidad: 1, precio: 80, recursoId: 2, recurso: "Ana" },
      ],
      total: 160,
    });
    // Partida entre mesa y llevar sigue siendo la misma cantidad.
    expect(coberturaCita([{ productoId: 100, cantidad: 2, precio: 80 }], c, 160)?.cubre).toBe(true);
    expect(coberturaCita([{ productoId: 100, cantidad: 1, precio: 80 }], c, 80)?.faltan).toEqual(["Corte"]);
  });

  it("con los servicios pero por menos plata tampoco la cubre", () => {
    const d = [
      { productoId: 100, cantidad: 1, precio: 50 },
      { productoId: 101, cantidad: 1, precio: 40 },
    ];
    const c = coberturaCita(d, carrito(), 90)!;
    expect(c.cubre).toBe(false);
    expect(c.faltan).toEqual([]);
    expect(textoCoberturaIncompleta(c, bs)).toContain("(cobrás Bs 90 de Bs 120)");
  });

  it("sin cita, o si ya no la cobra, no hay nada que confirmar", () => {
    expect(coberturaCita([{ productoId: 100, cantidad: 1 }], null, 80)).toBeNull();
    expect(coberturaCita([{ productoId: 500, cantidad: 1 }], carrito(), 10)).toBeNull();
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
