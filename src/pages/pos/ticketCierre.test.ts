import { describe, expect, it } from "vitest";
import type { ReporteCierreProductos } from "../../types";
import {
  COLUMNAS_TICKET,
  consolidarProductos,
  lineaDelTurno,
  lineasTicketCierre,
  montoTicket,
  textoTicketCierre,
} from "./ticketCierre";

/**
 * El ticket de cierre de 58 mm (PLAN-ELGANADERO-16NOV §4.2): el papel sale
 * con el formato exacto del plan, a 32 columnas.
 */

// Las horas con el constructor local: la prueba no depende de la zona del equipo.
const ABRIO = new Date(2026, 10, 16, 11, 44);
const CERRO = new Date(2026, 10, 16, 19, 30);

const item = (nombre: string, cantidad: number, total: number, productoId?: number) => ({
  nombre,
  cantidad,
  precio: total / cantidad,
  total,
  ...(productoId != null ? { productoId } : {}),
});

/** Lo del plan: «Chubi ×20» está repartido en dos categorías. */
const VENDIDO: ReporteCierreProductos = {
  unidades: 26,
  total: 265,
  lineas: 3,
  categorias: [
    { nombre: "XL", unidades: 3, total: 105, items: [item("Dulce de leche XL", 3, 105, 2)] },
    { nombre: "Toppings", unidades: 12, total: 60, items: [item("Chubi", 12, 60, 1)] },
    { nombre: "M", unidades: 3, total: 60, items: [item("Dulce de leche M", 3, 60, 3)] },
    { nombre: "Toppings 2", unidades: 8, total: 40, items: [item("Chubi", 8, 40, 1)] },
  ],
  porMedio: [
    { medio: "EFECTIVO", nombre: "Efectivo", ventas: 4, unidades: 20, total: 210, categorias: [] },
    { medio: "QR", nombre: "QR", ventas: 1, unidades: 6, total: 55, categorias: [] },
  ],
  plataformas: [
    {
      plataforma: "YANGO",
      pedidos: 2,
      unidades: 3,
      total: 75,
      categorias: [{ nombre: "L", unidades: 3, total: 75, items: [item("Nutella L", 3, 75, 4)] }],
    },
    {
      plataforma: "PEDIDOS_YA",
      pedidos: 1,
      unidades: 1,
      total: 35,
      categorias: [{ nombre: "XL", unidades: 1, total: 35, items: [item("Leche condensada XL", 1, 35, 5)] }],
    },
  ],
};

const DATOS = {
  negocio: "El Ganadero",
  sede: "Plazuela Fatima",
  abrio: ABRIO,
  cerro: CERRO,
  cajero: "darwin",
  esperado: 210,
  contado: 210,
  diferencia: 0,
};

const DEL_PLAN = [
  "EL GANADERO",
  "Plazuela Fatima",
  "Cierre 16/11 11:44-19:30",
  "Cajero: darwin",
  "--------------------------------",
  "20 Chubi                  100.00",
  " 3 Dulce de leche XL      105.00",
  " 3 Dulce de leche M        60.00",
  "--------------------------------",
  "Vendido 26 u              265.00",
  "  Efectivo                210.00",
  "  QR                       55.00",
  "--------------------------------",
  "YANGO 2 ped (no se cobra)",
  " 3 Nutella L               75.00",
  "PEDIDOSYA 1 ped",
  " 1 Leche condensada XL     35.00",
  "--------------------------------",
  "Efectivo esperado         210.00",
  "Contado                   210.00",
  "Diferencia                  0.00",
];

describe("ticket de cierre: el formato del plan", () => {
  it("sale exacto, con Chubi sumado entre categorías y ordenado por cantidad", () => {
    expect(lineasTicketCierre(VENDIDO, DATOS)).toEqual(DEL_PLAN);
    expect(textoTicketCierre(VENDIDO, DATOS)).toBe(DEL_PLAN.join("\n"));
  });

  it("ningún renglón pasa de 32 columnas, aunque el nombre sea larguísimo", () => {
    const largo = {
      ...VENDIDO,
      categorias: [
        {
          nombre: "X",
          unidades: 1,
          total: 1234.5,
          items: [item("Dulce de leche con muchísimos toppings y salsa extra XL", 1, 1234.5, 9)],
        },
      ],
    };
    const lineas = lineasTicketCierre(largo, {
      ...DATOS,
      negocio: "Pollos y parrilladas Don Omar de la Plazuela",
      sede: "x".repeat(60),
    });
    for (const l of lineas) expect(l.length).toBeLessThanOrEqual(COLUMNAS_TICKET);
    // El monto nunca se recorta: lo que se pierde es el nombre.
    expect(lineas.find((l) => l.includes("Dulce de leche con"))).toMatch(/ 1234\.50$/);
  });

  it("sin los campos nuevos (un backend anterior) salen los productos y el total", () => {
    const { porMedio: _m, plataformas: _p, ...viejo } = VENDIDO;
    const lineas = lineasTicketCierre(viejo, DATOS);
    expect(lineas).toContain("Vendido 26 u              265.00");
    expect(lineas.join("\n")).not.toMatch(/Efectivo {2,}210|YANGO|QR/);
    expect(lineas.filter((l) => l.startsWith("-"))).toHaveLength(3);
  });

  it("antes de cerrar sólo lleva «Efectivo esperado» y el turno dice «Turno … desde»", () => {
    const lineas = lineasTicketCierre(VENDIDO, { ...DATOS, cerro: null, contado: null, diferencia: null });
    expect(lineas).toContain("Turno 16/11 desde 11:44");
    expect(lineas.at(-1)).toBe("Efectivo esperado         210.00");
    expect(lineas.join("\n")).not.toMatch(/Contado|Diferencia/);
  });

  it("sin sucursal (un solo local) y sin plataformas no deja renglones vacíos ni rayas de más", () => {
    const { plataformas: _p, ...sinApps } = VENDIDO;
    const lineas = lineasTicketCierre(sinApps, { ...DATOS, sede: null });
    expect(lineas[1]).toBe("Cierre 16/11 11:44-19:30");
    expect(lineas.filter((l) => l.startsWith("-"))).toHaveLength(3);
    expect(lineas.some((l) => l === "")).toBe(false);
  });

  it("la diferencia se calcula contra el esperado si no viene, y lleva su signo", () => {
    const l = lineasTicketCierre(VENDIDO, { ...DATOS, contado: 205, diferencia: undefined });
    expect(l.at(-1)).toBe("Diferencia                 -5.00");
    const s = lineasTicketCierre(VENDIDO, { ...DATOS, contado: 212.5, diferencia: undefined });
    expect(s.at(-1)).toBe("Diferencia                  2.50");
  });

  it("un turno que cruzó la medianoche lleva las dos fechas", () => {
    expect(lineaDelTurno(new Date(2026, 10, 16, 18, 0), new Date(2026, 10, 17, 1, 5))).toBe(
      "Cierre 16/11 18:00-17/11 01:05",
    );
  });

  it("sin ventas dice que no hubo y no se rompe", () => {
    const vacio: ReporteCierreProductos = { categorias: [], unidades: 0, total: 0, lineas: 0 };
    const lineas = lineasTicketCierre(vacio, DATOS);
    expect(lineas).toContain("Sin ventas en el turno");
    expect(lineas).toContain(`Vendido 0 u${" ".repeat(17)}0.00`);
  });
});

describe("consolidarProductos", () => {
  it("suma el mismo artículo entre categorías y no mezcla dos con el mismo nombre", () => {
    const r = consolidarProductos([
      { nombre: "A", unidades: 2, total: 10, items: [item("Oreo", 2, 10, 7)] },
      { nombre: "B", unidades: 3, total: 15, items: [item("Oreo", 3, 15, 7), item("Oreo", 1, 6, 8)] },
    ]);
    expect(r).toEqual([
      { nombre: "Oreo", cantidad: 5, total: 25 },
      { nombre: "Oreo", cantidad: 1, total: 6 },
    ]);
  });

  it("los borrados (sin id real) se juntan por nombre; las cantidades por peso conservan sus decimales", () => {
    const r = consolidarProductos([
      { nombre: "A", unidades: 1, total: 4, items: [item("Viejo", 0.5, 4, 0), item("Viejo", 0.25, 2, 0)] },
    ]);
    expect(r).toEqual([{ nombre: "Viejo", cantidad: 0.75, total: 6 }]);
  });

  it("con igual cantidad, el de más plata primero; el tiempo de mesa no es un producto", () => {
    const r = consolidarProductos([
      {
        nombre: "A",
        unidades: 5,
        total: 30,
        items: [item("Barato", 2, 10, 1), item("Caro", 2, 20, 2), { ...item("Tiempo de mesa", 1, 50, 3), tiempoMesa: true }],
      },
    ]);
    expect(r.map((p) => p.nombre)).toEqual(["Caro", "Barato"]);
  });
});

describe("montoTicket", () => {
  it("punto y dos decimales, sin -0", () => {
    expect(montoTicket(100)).toBe("100.00");
    expect(montoTicket(-0.001)).toBe("0.00");
    expect(montoTicket(-5)).toBe("-5.00");
  });
});
