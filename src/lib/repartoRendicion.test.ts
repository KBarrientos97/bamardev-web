import { describe, expect, it } from "vitest";
import {
  aEntregar,
  delRepartidor,
  entregasPorRecibir,
  hayRepartidores,
  idsTildados,
  marcarTodas,
  normalizarRendicion,
  pendientesDeOtraCaja,
  sumaTildada,
  textoEntrega,
  textoLlevo,
  textoOtraCaja,
  textoPedidos,
  type EntregaDeRendicion,
  type RepartidorDeRendicion,
} from "./repartoRendicion";
import { fmtHora } from "./format";

/** Una entrega con plata sin recibir, salvo lo que se cambie. */
function entrega(extra: Partial<EntregaDeRendicion> = {}): EntregaDeRendicion {
  return {
    id: 55,
    ventaId: 900,
    comprobante: "V-000900",
    cliente: "Carla Mamani",
    entregadoEn: "2026-11-18T01:15:00.000Z",
    total: 130,
    efectivo: 130,
    qr: 0,
    envio: 7,
    estado: "PENDIENTE",
    recibidaEn: null,
    recibidaPorNombre: null,
    puedeRecibir: true,
    cajaDe: null,
    ...extra,
  };
}

function repartidor(extra: Partial<RepartidorDeRendicion> = {}): RepartidorDeRendicion {
  return {
    repartidorId: 129,
    nombre: "Pedro Rojas",
    entregados: 3,
    enCamino: 1,
    cobradoEfectivo: 250,
    cobradoQr: 80,
    envios: 21,
    pendiente: 130,
    recibido: 120,
    entregas: [],
    productos: { unidades: 0, categorias: [] },
    ...extra,
  };
}

describe("lo que llevó", () => {
  it("por categoría, en el orden del servidor: «Pollos 5 · Bebidas 3 · Porciones 1»", () => {
    expect(
      textoLlevo({
        unidades: 9,
        categorias: [
          { nombre: "Pollos", unidades: 5, items: [{ nombre: "Brasa entero", cantidad: 2 }] },
          { nombre: "Bebidas", unidades: 3, items: [] },
          { nombre: "Porciones", unidades: 1, items: [] },
        ],
      }),
    ).toBe("Pollos 5 · Bebidas 3 · Porciones 1");
  });

  it("sin nada, vacío; una categoría en cero no aparece; medio kilo no se redondea", () => {
    expect(textoLlevo({ unidades: 0, categorias: [] })).toBe("");
    expect(textoLlevo(undefined)).toBe("");
    expect(
      textoLlevo({
        unidades: 1.5,
        categorias: [
          { nombre: "Carnes", unidades: 1.5, items: [] },
          { nombre: "Bebidas", unidades: 0, items: [] },
        ],
      }),
    ).toBe("Carnes 1,5");
  });
});

describe("los pedidos del repartidor", () => {
  it("«3 entregados · 1 en camino», en singular cuando es uno, y sin el cero", () => {
    expect(textoPedidos({ entregados: 3, enCamino: 1 })).toBe("3 entregados · 1 en camino");
    expect(textoPedidos({ entregados: 1, enCamino: 0 })).toBe("1 entregado");
    expect(textoPedidos({ entregados: 0, enCamino: 2 })).toBe("2 en camino");
    // Sólo una plata vieja sin recibir.
    expect(textoPedidos({ entregados: 0, enCamino: 0 })).toBe("Sin pedidos hoy");
  });

  it("el renglón de la casilla: comprobante, cliente y hora; sin comprobante, el número de venta", () => {
    expect(textoEntrega(entrega())).toBe(`V-000900 · Carla Mamani · ${fmtHora("2026-11-18T01:15:00.000Z")}`);
    expect(textoEntrega(entrega({ comprobante: null, cliente: null }))).toBe(`#900 · ${fmtHora("2026-11-18T01:15:00.000Z")}`);
  });
});

describe("la plata que se recibe", () => {
  const rep = repartidor({
    entregas: [
      entrega({ id: 55, efectivo: 130 }),
      entrega({ id: 56, ventaId: 901, efectivo: 60.1 }),
      // Ya recibida, cobrada por QR (sin fila) y en camino: no se tildan.
      entrega({ id: 40, ventaId: 880, estado: "RECIBIDA", efectivo: 120 }),
      entrega({ id: null, ventaId: 902, estado: null, efectivo: 0, qr: 80 }),
      entrega({ id: null, ventaId: 903, estado: null, entregadoEn: null, efectivo: 0 }),
    ],
  });

  it("sólo las PENDIENTE con fila son por recibir", () => {
    expect(entregasPorRecibir(rep).map((e) => e.id)).toEqual([55, 56]);
  });

  it("de entrada van todas tildadas y suman al centavo (130 + 60,10 = 190,10, no 190,10000000000002)", () => {
    const ninguna = new Set<number>();
    expect(idsTildados(rep, ninguna)).toEqual([55, 56]);
    expect(sumaTildada(rep, ninguna)).toBe(190.1);
  });

  it("destildar una le resta su plata; destildar todas da cero", () => {
    expect(idsTildados(rep, new Set([56]))).toEqual([55]);
    expect(sumaTildada(rep, new Set([56]))).toBe(130);
    expect(sumaTildada(rep, new Set([55, 56]))).toBe(0);
  });

  it("una destildada que ya no está pendiente no cuenta para nada (llegó la lista nueva)", () => {
    expect(sumaTildada(rep, new Set([40, 999]))).toBe(190.1);
  });

  it("«Marcar todas» y «ninguna» tocan sólo las de este repartidor", () => {
    const deOtro = 777;
    const ninguna = marcarTodas(rep, new Set([deOtro]), false);
    expect([...ninguna].sort()).toEqual([55, 56, deOtro].sort());
    const todas = marcarTodas(rep, ninguna, true);
    expect([...todas]).toEqual([deOtro]);
  });

  it("lo que tiene que entregar: con el control, lo pendiente; apagado, todo el efectivo cobrado", () => {
    expect(aEntregar(rep, true)).toBe(130);
    expect(aEntregar(rep, false)).toBe(250);
  });
});

describe("la respuesta del servidor", () => {
  it("lee los números aunque vengan como texto (un Decimal) y completa lo que falta", () => {
    const r = normalizarRendicion({
      activa: true,
      desde: "2026-11-18T10:00:00.000Z",
      pendiente: "130.00",
      recibido: 120,
      repartidores: [
        {
          repartidorId: 129,
          nombre: "Pedro Rojas",
          entregados: 3,
          enCamino: 1,
          cobradoEfectivo: "250.00",
          cobradoQr: 80,
          envios: 21,
          pendiente: "130",
          recibido: 120,
          entregas: [{ id: 55, ventaId: 900, comprobante: "V-000900", cliente: "Carla Mamani", entregadoEn: "2026-11-18T01:15:00.000Z", total: "130.00", efectivo: "130.00", qr: 0, envio: 7, estado: "PENDIENTE" }],
        },
      ],
    });
    expect(r).not.toBeNull();
    expect(r!.pendiente).toBe(130);
    const rep = r!.repartidores[0];
    expect(rep.cobradoEfectivo).toBe(250);
    expect(rep.entregas[0]).toMatchObject({ id: 55, efectivo: 130, estado: "PENDIENTE", recibidaEn: null });
    // Sin `productos` no se rompe: no llevó nada que mostrar.
    expect(rep.productos).toEqual({ unidades: 0, categorias: [] });
  });

  it("algo que no es una rendición da null (un backend anterior que contesta otra cosa)", () => {
    expect(normalizarRendicion(null)).toBeNull();
    expect(normalizarRendicion({ message: "Not Found" })).toBeNull();
    expect(normalizarRendicion([])).toBeNull();
  });

  it("un estado desconocido o un id raro no se toman como plata por recibir", () => {
    const r = normalizarRendicion({
      activa: true,
      repartidores: [{ repartidorId: 1, nombre: "", entregas: [{ id: null, estado: "PENDIENTE" }, { id: 3, estado: "OTRO" }] }],
    })!;
    expect(r.repartidores[0].nombre).toBe("Repartidor");
    expect(entregasPorRecibir(r.repartidores[0])).toEqual([]);
  });

  it("sin repartidores no hay botón; con alguno, sí", () => {
    expect(hayRepartidores(null)).toBe(false);
    expect(hayRepartidores(normalizarRendicion({ activa: false, repartidores: [] }))).toBe(false);
    expect(hayRepartidores(normalizarRendicion({ activa: false, repartidores: [{ repartidorId: 1, nombre: "Luis" }] }))).toBe(true);
  });

  it("el repartidor ve lo suyo por id, nunca lo de otro aunque venga uno solo", () => {
    const r = normalizarRendicion({ activa: true, repartidores: [{ repartidorId: 129, nombre: "Pedro Rojas" }] });
    expect(delRepartidor(r, 129)?.nombre).toBe("Pedro Rojas");
    expect(delRepartidor(r, 7)).toBeNull();
    expect(delRepartidor(r, undefined)).toBeNull();
  });
});

describe("la plata que cuenta el arqueo de otra caja", () => {
  const rep = repartidor({
    entregas: [
      entrega({ id: 55, efectivo: 130 }),
      entrega({ id: 56, ventaId: 901, efectivo: 60, puedeRecibir: false, cajaDe: "Ana Quispe" }),
      entrega({ id: 57, ventaId: 902, efectivo: 25, puedeRecibir: false }),
    ],
  });

  it("no se tilda, no suma en «Recibí Bs X» y «Marcar todas / ninguna» no la toca", () => {
    expect(entregasPorRecibir(rep).map((e) => e.id)).toEqual([55]);
    expect(idsTildados(rep, new Set())).toEqual([55]);
    expect(sumaTildada(rep, new Set())).toBe(130);
    expect([...marcarTodas(rep, new Set(), false)]).toEqual([55]);
  });

  it("se lista aparte, diciendo qué caja la recibe", () => {
    const otras = pendientesDeOtraCaja(rep);
    expect(otras.map((e) => e.id)).toEqual([56, 57]);
    expect(textoOtraCaja(otras[0])).toBe("La recibe la caja de Ana Quispe");
    expect(textoOtraCaja(otras[1])).toBe("La recibe otra caja");
  });

  it("un backend anterior no manda `puedeRecibir`: toda PENDIENTE se recibe, como hoy", () => {
    const r = normalizarRendicion({
      activa: true,
      repartidores: [
        {
          repartidorId: 129,
          nombre: "Pedro Rojas",
          entregas: [
            { id: 55, ventaId: 900, efectivo: 130, estado: "PENDIENTE" },
            { id: 56, ventaId: 901, efectivo: 60, estado: "PENDIENTE", puedeRecibir: false, cajaDe: "Ana Quispe" },
            { id: 57, ventaId: 902, efectivo: 25, estado: "PENDIENTE", puedeRecibir: true },
          ],
        },
      ],
    })!;
    const [p] = r.repartidores;
    expect(p.entregas.map((e) => [e.puedeRecibir, e.cajaDe])).toEqual([
      [true, null],
      [false, "Ana Quispe"],
      [true, null],
    ]);
    expect(entregasPorRecibir(p).map((e) => e.id)).toEqual([55, 57]);
    expect(sumaTildada(p, new Set())).toBe(155);
  });
});
