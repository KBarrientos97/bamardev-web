import { describe, expect, it } from "vitest";
import type { Comanda, Mesa } from "../../types/salon";
import {
  cantidadItems,
  comandasPendientes,
  consumoDeMesa,
  estaOcupada,
  etiquetaMesa,
  filtrarMesas,
  hace,
  inicialesDe,
  porPersona,
  porServir,
  primerNombre,
  resumirSalon,
  tieneConsumo,
  tieneQueLlevarse,
} from "./logicaSalon";

function comanda(p: Partial<Comanda> = {}): Comanda {
  return {
    id: 1,
    estado: "ENVIADA",
    enviadaEn: "2026-09-08T20:00:00.000Z",
    items: [
      { id: 1, productoId: 1, nombre: "Brasa cuarto", cantidad: 2, precio: 26 },
    ],
    ...p,
  };
}

function mesa(p: Partial<Mesa> = {}): Mesa {
  return {
    id: 1,
    codigo: "M1",
    nombre: "Mesa M1",
    zonaCodigo: "salon",
    zonaNombre: "Salón",
    capacidad: 4,
    capacidadTotal: 4,
    unidas: [],
    activa: true,
    estado: "LIBRE",
    comensales: 0,
    consumo: 0,
    propina: 0,
    comandas: [],
    ...p,
  };
}

describe("lo que la mesa lleva consumido", () => {
  it("suma las comandas cuando el backend manda cero", () => {
    const m = mesa({ comandas: [comanda(), comanda()] });
    expect(consumoDeMesa(m)).toBe(104);
    expect(cantidadItems(m)).toBe(4);
  });

  it("respeta el consumo que ya calculó el backend", () => {
    // Es la fuente de verdad: la mesa puede tener descuentos o propina que la
    // suma de las líneas no ve.
    expect(consumoDeMesa(mesa({ consumo: 120, comandas: [comanda()] }))).toBe(120);
  });

  it("no cuenta lo anulado", () => {
    const c = comanda({
      items: [{ id: 1, productoId: 1, nombre: "Brasa", cantidad: 1, precio: 26 }],
      anulados: [{ id: 2, productoId: 2, nombre: "Coca", cantidad: 1, precio: 10 }],
    });
    expect(consumoDeMesa(mesa({ comandas: [c] }))).toBe(26);
    expect(cantidadItems(mesa({ comandas: [c] }))).toBe(1);
  });

  it("divide entre los comensales, y sin ellos devuelve el total", () => {
    expect(porPersona(mesa({ comensales: 4, comandas: [comanda()] }))).toBe(13);
    expect(porPersona(mesa({ comensales: 0, comandas: [comanda()] }))).toBe(52);
  });
});

describe("lo que falta llevar a la mesa", () => {
  it("una comanda pendiente con productos hay que llevarla", () => {
    expect(tieneQueLlevarse(comanda())).toBe(true);
  });

  it("una comanda ya servida no", () => {
    expect(tieneQueLlevarse(comanda({ estado: "SERVIDA" }))).toBe(false);
  });

  it("una comanda a la que le anularon todo tampoco", () => {
    // Quedaba pendiente y vacía: aparecía en "Por servir" como una fila con su
    // botón "Servido" y bloqueaba el paso a caja.
    const vacia = comanda({
      items: [],
      anulados: [
        { id: 1, productoId: 1, nombre: "Brasa", cantidad: 1, precio: 26, motivo: "Se pidió por error" },
      ],
    });
    expect(tieneQueLlevarse(vacia)).toBe(false);
    expect(comandasPendientes(mesa({ comandas: [vacia] }))).toHaveLength(0);
    expect(tieneConsumo(mesa({ comandas: [vacia] }))).toBe(false);
  });
});

describe("el plano del salón", () => {
  const mesas = [
    mesa({ id: 1, estado: "LIBRE", zonaCodigo: "salon" }),
    mesa({ id: 2, estado: "OCUPADA", zonaCodigo: "salon", meseroId: 7 }),
    mesa({ id: 3, estado: "CUENTA", zonaCodigo: "terraza", meseroId: 7 }),
    mesa({ id: 4, estado: "PAGADA", zonaCodigo: "terraza", meseroId: 9 }),
    mesa({ id: 5, estado: "RESERVADA", zonaCodigo: "barra" }),
  ];

  it("cuenta cada estado por separado", () => {
    expect(resumirSalon(mesas)).toEqual({
      libres: 1,
      ocupadas: 1,
      porCobrar: 1,
      porLiberar: 1,
    });
  });

  it("filtra por zona", () => {
    expect(filtrarMesas(mesas, { zonaCodigo: "terraza" }).map((m) => m.id)).toEqual([3, 4]);
  });

  it("cruza zona con 'mis mesas' en vez de reemplazarla", () => {
    // "Mis mesas de la terraza" es una pregunta que el mesero hace de verdad.
    const r = filtrarMesas(mesas, { zonaCodigo: "terraza", soloMias: true, miMeseroId: 7 });
    expect(r.map((m) => m.id)).toEqual([3]);
  });

  it("sin zona, 'mis mesas' trae las de todo el salón", () => {
    const r = filtrarMesas(mesas, { soloMias: true, miMeseroId: 7 });
    expect(r.map((m) => m.id)).toEqual([2, 3]);
  });

  it("una mesa está ocupada aunque ya la hayan cobrado", () => {
    expect(estaOcupada(mesa({ estado: "OCUPADA" }))).toBe(true);
    expect(estaOcupada(mesa({ estado: "CUENTA" }))).toBe(true);
    expect(estaOcupada(mesa({ estado: "PAGADA" }))).toBe(true);
    expect(estaOcupada(mesa({ estado: "LIBRE" }))).toBe(false);
    expect(estaOcupada(mesa({ estado: "RESERVADA" }))).toBe(false);
  });
});

describe("por servir", () => {
  it("junta las comandas de TODAS las mesas, no sólo las mías", () => {
    const mesas = [
      mesa({ id: 1, meseroId: 7, comandas: [comanda({ id: 10 })] }),
      mesa({ id: 2, meseroId: 9, comandas: [comanda({ id: 20 })] }),
    ];
    expect(porServir(mesas).map((f) => f.comanda.id)).toEqual([10, 20]);
  });

  it("primero lo más viejo", () => {
    const mesas = [
      mesa({ id: 1, comandas: [comanda({ id: 10, enviadaEn: "2026-09-08T21:00:00.000Z" })] }),
      mesa({ id: 2, comandas: [comanda({ id: 20, enviadaEn: "2026-09-08T20:00:00.000Z" })] }),
    ];
    expect(porServir(mesas).map((f) => f.comanda.id)).toEqual([20, 10]);
  });

  it("deja fuera lo ya servido", () => {
    const mesas = [mesa({ id: 1, comandas: [comanda({ estado: "SERVIDA" })] })];
    expect(porServir(mesas)).toHaveLength(0);
  });
});

describe("cómo se llama la mesa en pantalla", () => {
  it("sola es su código", () => {
    expect(etiquetaMesa(mesa())).toBe("M1");
  });

  it("unida se canta con las arrimadas", () => {
    // El mesero tiene que ver que está sentando al grupo en la mesa armada.
    const m = mesa({ unidas: [{ id: 2, codigo: "M2", capacidad: 6 }] });
    expect(etiquetaMesa(m)).toBe("M1 + M2");
  });
});

describe("nombres y tiempos", () => {
  it("saca las iniciales del mesero", () => {
    expect(inicialesDe("Carlos Vargas")).toBe("CV");
    expect(inicialesDe("Carlos")).toBe("CA");
    expect(inicialesDe("")).toBe("?");
    expect(inicialesDe(null)).toBe("?");
  });

  it("en la barra va sólo el primer nombre", () => {
    expect(primerNombre("Carlos Vargas Sánchez")).toBe("Carlos");
    expect(primerNombre(null)).toBe("");
  });

  it("dice hace cuánto en el formato corto de la app", () => {
    const ahora = new Date("2026-09-08T22:00:00.000Z").getTime();
    expect(hace("2026-09-08T21:48:00.000Z", ahora)).toBe("12m");
    expect(hace("2026-09-08T20:25:00.000Z", ahora)).toBe("1h 35m");
    expect(hace("2026-09-08T22:00:00.000Z", ahora)).toBe("0m");
  });

  it("sin fecha no inventa nada", () => {
    // La tarjeta esconde el dato en vez de mostrar un guion suelto.
    expect(hace(null)).toBe("");
    expect(hace("no es fecha")).toBe("");
  });
});
