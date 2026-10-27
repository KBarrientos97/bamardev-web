import { describe, expect, it } from "vitest";
import type { ReporteCierreProductos } from "../../types";
import {
  precioQueMultiplica,
  renglonesVisibles,
  renglonVendido,
  separarTiempoDeMesa,
  textoCantidadPorPrecio,
  textoMesasCobradas,
  textoProductos,
  textoUnidades,
} from "./productosVendidos";

/**
 * Un turno del billar como lo manda el backend (25-oct): el "Tiempo de mesa"
 * va como un producto más, marcado, dentro de "Sin categoría" y de los totales.
 * Dos mesas cobradas (Bs 10 y Bs 40) dan un precio promedio de Bs 25 que no
 * existe.
 */
const BILLAR: ReporteCierreProductos = {
  unidades: 7,
  total: 130,
  lineas: 5,
  categorias: [
    {
      nombre: "Sin categoría",
      unidades: 4,
      total: 80,
      items: [
        { productoId: 99, nombre: "Tiempo de mesa", cantidad: 2, precio: 25, total: 50, tiempoMesa: true },
        { productoId: 5, nombre: "Cerveza", cantidad: 2, precio: 15, total: 30 },
      ],
    },
    {
      nombre: "Cervezas",
      unidades: 2,
      total: 35,
      items: [
        { productoId: 1, nombre: "PACEÑA BOTELLA", cantidad: 1, precio: 25, total: 25 },
        { productoId: 2, nombre: "PALITO PACEÑA", cantidad: 1, precio: 10, total: 10 },
      ],
    },
    { nombre: "Cigarros", unidades: 1, total: 15, items: [{ productoId: 3, nombre: "HILLS", cantidad: 1, precio: 15, total: 15 }] },
  ],
};

describe("el tiempo de mesa va aparte de lo vendido (billar, 25-oct)", () => {
  it("sale de su categoría, de las unidades, del total y de los productos", () => {
    const { tiempo, productos } = separarTiempoDeMesa(BILLAR);
    // Un renglón por mesa cerrada: 2 mesas, Bs 50.
    expect(tiempo).toEqual({ mesas: 2, total: 50 });
    // Antes: "7 unidades · 5 productos", con dos "unidades" que eran mesas.
    expect(productos).toMatchObject({ unidades: 5, total: 80, lineas: 4 });
    const sinCategoria = productos.categorias.find((c) => c.nombre === "Sin categoría");
    expect(sinCategoria).toEqual({ nombre: "Sin categoría", unidades: 2, total: 30, items: [BILLAR.categorias[0].items[1]] });
    // Lo que queda suma lo mismo que el turno menos el tiempo.
    expect(productos.categorias.reduce((t, c) => t + c.total, 0)).toBe(80);
  });

  it("las categorías se vuelven a ordenar por total: la del tiempo estaba arriba por la plata de las mesas", () => {
    const { productos } = separarTiempoDeMesa(BILLAR);
    expect(productos.categorias.map((c) => c.nombre)).toEqual(["Cervezas", "Sin categoría", "Cigarros"]);
  });

  it("una categoría que sólo tenía el tiempo no se muestra", () => {
    const soloTiempo: ReporteCierreProductos = {
      unidades: 3,
      total: 45,
      lineas: 2,
      categorias: [
        { nombre: "Cervezas", unidades: 2, total: 30, items: [{ productoId: 1, nombre: "Paceña", cantidad: 2, precio: 15, total: 30 }] },
        { nombre: "Sin categoría", unidades: 1, total: 15, items: [{ productoId: 99, nombre: "Tiempo de mesa", cantidad: 1, precio: 15, total: 15, tiempoMesa: true }] },
      ],
    };
    const { tiempo, productos } = separarTiempoDeMesa(soloTiempo);
    expect(tiempo).toEqual({ mesas: 1, total: 15 });
    expect(productos.categorias.map((c) => c.nombre)).toEqual(["Cervezas"]);
    expect(productos).toMatchObject({ unidades: 2, total: 30, lineas: 1 });
  });

  it("un turno con sólo tiempo de mesa queda sin productos", () => {
    const { tiempo, productos } = separarTiempoDeMesa({
      unidades: 1,
      total: 10,
      lineas: 1,
      categorias: [{ nombre: "Sin categoría", unidades: 1, total: 10, items: [{ nombre: "Tiempo de mesa", cantidad: 1, precio: 10, total: 10, tiempoMesa: true }] }],
    });
    expect(tiempo).toEqual({ mesas: 1, total: 10 });
    expect(productos).toEqual({ categorias: [], unidades: 0, total: 0, lineas: 0 });
  });

  it("sin tiempo de mesa (restaurante, farmacia, belleza) todo queda igual, en el orden del backend", () => {
    const restaurante: ReporteCierreProductos = {
      unidades: 5,
      total: 60,
      lineas: 2,
      categorias: [
        { nombre: "Pollos", unidades: 1, total: 45, items: [{ nombre: "Pollo entero", cantidad: 1, precio: 45, total: 45 }] },
        { nombre: "Bebidas", unidades: 4, total: 15, items: [{ nombre: "Agua", cantidad: 4, precio: 3.75, total: 15 }] },
      ],
    };
    const r = separarTiempoDeMesa(restaurante);
    expect(r.tiempo).toBeNull();
    expect(r.productos).toBe(restaurante);
  });
});

describe("cómo se lee cada renglón de lo vendido", () => {
  it("el precio se muestra sólo si multiplica: un promedio de dos precios no", () => {
    // 2 a Bs 10 y 1 a Bs 8 (le cambiaron el precio en el turno): el backend
    // manda Bs 9,33 de promedio y "3 × Bs 9,33" daba 27,99, no los Bs 28.
    expect(precioQueMultiplica({ cantidad: 3, precio: 9.33, total: 28 })).toBeNull();
    expect(precioQueMultiplica({ cantidad: 4, precio: 15, total: 60 })).toBe(15);
    expect(precioQueMultiplica({ cantidad: 0.5, precio: 15, total: 7.5 })).toBe(15);
    // El resto de punto flotante (3 × 8,90 = 26,700000000000003) no es "otro precio".
    expect(precioQueMultiplica({ cantidad: 3, precio: 8.9, total: 26.7 })).toBe(8.9);
  });

  it("con la marca de varios precios no hay precio, aunque el promedio multiplique", () => {
    // 1 a Bs 10 y 1 a Bs 12: 2 × 11 = 22 da justo, pero "Bs 11,00" no existió.
    expect(precioQueMultiplica({ cantidad: 2, precio: 11, total: 22, variosPrecios: true })).toBeNull();
    expect(renglonVendido({ productoId: 3, nombre: "Palito", cantidad: 2, precio: 11, total: 22, variosPrecios: true }, 0).precio).toBeNull();
  });

  it("cantidades sin ceros y plata con centavos: 3 u × Bs 10,00 (Kevin, 25-oct)", () => {
    expect(textoCantidadPorPrecio(3, 10)).toBe("3 u × Bs 10,00");
    expect(textoCantidadPorPrecio(0.5, 15)).toBe("0,5 u × Bs 15,00");
    expect(textoCantidadPorPrecio(3, null)).toBe("3 u · varios precios");
  });

  it("una sola es «1 unidad», no «1 unidades»", () => {
    expect(textoUnidades(1)).toBe("1 unidad");
    expect(textoUnidades(9)).toBe("9 unidades");
    expect(textoUnidades(0.5)).toBe("0,5 unidades");
    expect(textoUnidades(1.5)).toBe("1,5 unidades");
    expect(textoProductos(1)).toBe("1 producto");
    expect(textoProductos(4)).toBe("4 productos");
    expect(textoMesasCobradas(1)).toBe("1 mesa cobrada");
    expect(textoMesasCobradas(2)).toBe("2 mesas cobradas");
  });

  it("la fila se identifica por el artículo: dos que se llaman igual no se pisan", () => {
    // Un producto dado de baja y otro nuevo con el mismo nombre en la misma
    // categoría tenían la misma key, y con el sondeo cada 5 s React podía
    // duplicar u omitir una fila.
    const a = renglonVendido({ productoId: 1, nombre: "PALITO PACEÑA", cantidad: 1, precio: 10, total: 10 }, 0);
    const b = renglonVendido({ productoId: 2, nombre: "PALITO PACEÑA", cantidad: 1, precio: 10, total: 10 }, 1);
    expect(a.clave).not.toBe(b.clave);
    // Un backend anterior no manda el artículo: el nombre con su lugar.
    expect(renglonVendido({ nombre: "Paceña", cantidad: 1, precio: 15, total: 15 }, 3).clave).toBe("Paceña-3");
    expect(renglonVendido({ nombre: "Paceña", cantidad: 3, precio: 9.33, total: 28 }, 0).precio).toBeNull();
  });
});

describe("cuántos renglones se ven de entrada", () => {
  it("los primeros del tope, en el orden en que vienen, aunque corten una categoría", () => {
    expect(renglonesVisibles([4, 3, 5], 6)).toEqual({ visibles: [4, 2, 0], ocultos: 6 });
  });

  it("sin tope, o si sobra uno solo, se ven todos: el botón ocuparía el mismo renglón", () => {
    expect(renglonesVisibles([4, 3, 5])).toEqual({ visibles: [4, 3, 5], ocultos: 0 });
    expect(renglonesVisibles([4, 3], 6)).toEqual({ visibles: [4, 3], ocultos: 0 });
    expect(renglonesVisibles([4, 4], 6)).toEqual({ visibles: [4, 2], ocultos: 2 });
  });
});
