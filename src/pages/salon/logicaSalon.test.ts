import { describe, expect, it } from "vitest";
import type { Comanda, Mesa } from "../../types/salon";
import {
  cantidadItems,
  comandasPendientes,
  conLocalDeZona,
  consumoDeMesa,
  estaOcupada,
  etiquetaMesa,
  filtrarMesas,
  hace,
  inicialesDe,
  nivelDeEspera,
  mesasParaElegir,
  porPersona,
  porServir,
  primerNombre,
  resumirSalon,
  tandasDelSalon,
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

describe("el color del tiempo de la mesa (UX-MESEROS §1)", () => {
  const ahora = Date.parse("2026-11-10T22:00:00.000Z");
  const hace_ = (min: number) => new Date(ahora - min * 60000).toISOString();

  it("hasta la hora es normal, de 1 a 2 horas larga, más es muy larga", () => {
    expect(nivelDeEspera(hace_(59), ahora)).toBe("normal");
    expect(nivelDeEspera(hace_(60), ahora)).toBe("larga");
    expect(nivelDeEspera(hace_(119), ahora)).toBe("larga");
    expect(nivelDeEspera(hace_(120), ahora)).toBe("muyLarga");
    // La mesa olvidada abierta desde ayer: era el mismo gris que "5m".
    expect(nivelDeEspera(hace_(29 * 60), ahora)).toBe("muyLarga");
  });

  it("sin fecha, o con una fecha rota, no alarma", () => {
    expect(nivelDeEspera(null, ahora)).toBe("normal");
    expect(nivelDeEspera("no-es-fecha", ahora)).toBe("normal");
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

  it("tocar un contador filtra por ese estado, cruzado con zona y 'mis mesas' (UX-MESEROS §1)", () => {
    expect(filtrarMesas(mesas, { estado: "OCUPADA" }).map((m) => m.id)).toEqual([2]);
    expect(filtrarMesas(mesas, { estado: "CUENTA", zonaCodigo: "salon" })).toEqual([]);
    const r = filtrarMesas(mesas, { estado: "CUENTA", soloMias: true, miMeseroId: 7 });
    expect(r.map((m) => m.id)).toEqual([3]);
  });

  it("arma las tandas: para atender, con gente y libres", () => {
    // Para atender = con algo para llevar o con la cuenta pedida. Antes iban
    // todas por número y del mismo tamaño, y lo urgente quedaba abajo.
    const conPedido = mesa({ id: 6, estado: "OCUPADA", comandas: [comanda()] });
    const servida = mesa({ id: 7, estado: "OCUPADA", comandas: [comanda({ estado: "SERVIDA" })] });
    const t = tandasDelSalon([...mesas, conPedido, servida]);
    expect(t.atender.map((m) => m.id)).toEqual([3, 6]);
    expect(t.enUso.map((m) => m.id)).toEqual([2, 4, 5, 7]);
    expect(t.libres.map((m) => m.id)).toEqual([1]);
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

/**
 * BUG-salon-4: a qué mesas se puede ir al pasar, juntar o unir. Son las
 * reglas del backend: una mesa que la lista ofrece y el backend rechaza es un
 * toque perdido con el cliente esperando.
 */
describe("las mesas que se ofrecen para pasar, juntar o unir", () => {
  const actual = mesa({ id: 1, codigo: "M1", estado: "OCUPADA" });
  const libre = mesa({ id: 2, codigo: "M2" });
  const libreConArrimada = mesa({ id: 3, codigo: "M3", unidas: [{ id: 9, codigo: "M9", capacidad: 2 }] });
  const arrimada = mesa({ id: 9, codigo: "M9", unidaAId: 3 });
  const ocupada = mesa({ id: 4, codigo: "M4", estado: "OCUPADA" });
  const enCaja = mesa({ id: 5, codigo: "M5", estado: "CUENTA" });
  const pagada = mesa({ id: 6, codigo: "M6", estado: "PAGADA" });
  const reservada = mesa({ id: 7, codigo: "M7", estado: "RESERVADA" });
  const todas = [actual, libre, libreConArrimada, arrimada, ocupada, enCaja, pagada, reservada];
  const codigos = (ms: Mesa[]) => ms.map((m) => m.codigo);

  it("unir: sólo libres sin otras arrimadas ni arrimadas a otra", () => {
    // El backend: "ya tiene otras mesas unidas: separalas primero". Las
    // uniones son planas, y la lista las ofrecía igual.
    expect(codigos(mesasParaElegir("unir", actual, todas))).toEqual(["M2"]);
  });

  it("juntar: con gente y sin cobrar; la pagada no", () => {
    // El backend: "ya se cobró: no se puede juntar". La lista usaba
    // estaOcupada, que cuenta la PAGADA.
    expect(codigos(mesasParaElegir("juntar", actual, todas))).toEqual(["M4", "M5"]);
  });

  it("pasar: a una libre, también si tiene otras arrimadas (no a la arrimada)", () => {
    expect(codigos(mesasParaElegir("pasar", actual, todas))).toEqual(["M2", "M3"]);
  });

  it("nunca ofrece la misma mesa", () => {
    const libreActual = mesa({ id: 2, codigo: "M2" });
    expect(codigos(mesasParaElegir("unir", libreActual, todas))).not.toContain("M2");
  });
});

describe("el local de la mesa (PLAN-SUCURSAL-TOTAL, etapa 5)", () => {
  const zonas = [
    { id: 1, codigo: "salon", nombre: "Salón", sucursalId: 10, sucursalNombre: "Centro" },
    { id: 2, codigo: "salon", nombre: "Salón", sucursalId: 20, sucursalNombre: "Sur" },
  ];
  const c1 = mesa({ id: 1, codigo: "C1", zonaId: 1, estado: "OCUPADA" });
  const c2 = mesa({ id: 2, codigo: "C2", zonaId: 1 });
  const s1 = mesa({ id: 3, codigo: "S1", zonaId: 2 });
  const s2 = mesa({ id: 4, codigo: "S2", zonaId: 2, estado: "OCUPADA" });
  const todas = conLocalDeZona([c1, c2, s1, s2], zonas);
  const codigos = (ms: Mesa[]) => ms.map((m) => m.codigo);

  it("la mesa hereda el local de su zona", () => {
    expect(todas.map((m) => m.sucursalId)).toEqual([10, 10, 20, 20]);
    expect(todas[2].sucursalNombre).toBe("Sur");
  });

  it("sin zonas con local devuelve la misma lista, sin copiarla", () => {
    const lista = [c1, c2];
    expect(conLocalDeZona(lista, [{ id: 1, codigo: "salon", nombre: "Salón" }])).toBe(lista);
  });

  it("no ofrece mesas de otro local para pasar, juntar ni unir", () => {
    expect(codigos(mesasParaElegir("pasar", todas[0], todas))).toEqual(["C2"]);
    expect(codigos(mesasParaElegir("unir", todas[0], todas))).toEqual(["C2"]);
    expect(codigos(mesasParaElegir("juntar", todas[0], todas))).toEqual([]);
  });

  it("la mesa que vuelve de una acción (sin local) se ubica por la lista del salón", () => {
    const sinLocal = mesa({ id: 1, codigo: "C1", zonaId: 1, estado: "OCUPADA" });
    expect(codigos(mesasParaElegir("pasar", sinLocal, todas))).toEqual(["C2"]);
  });

  it("una mesa sin local conocido (dato viejo) no se excluye", () => {
    const vieja = mesa({ id: 9, codigo: "V1" });
    expect(codigos(mesasParaElegir("pasar", todas[0], [...todas, vieja]))).toEqual(["C2", "V1"]);
  });

  it("filtrar por zona de un local no mezcla la zona de igual código del otro", () => {
    expect(codigos(filtrarMesas(todas, { zonaCodigo: "salon", sucursalId: 20 }))).toEqual(["S1", "S2"]);
    expect(codigos(filtrarMesas(todas, { zonaCodigo: "salon" }))).toEqual(["C1", "C2", "S1", "S2"]);
  });
});
