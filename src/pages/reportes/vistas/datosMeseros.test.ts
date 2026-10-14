import { describe, expect, it } from "vitest";
import type { MeserosApi } from "../api";
import { filasMeseros, quienVendioMas, textoMinutos } from "./datosMeseros";

type Item = MeserosApi["items"][number];

function item(over: Partial<Item>): Item {
  return {
    meseroId: 1,
    mesero: "Ana",
    mesas: 10,
    comensales: 30,
    vendido: 1500,
    ticketPromedio: 150,
    porComensal: 50,
    propinas: 40,
    itemsAnulados: 0,
    montoAnulado: 0,
    minutosPromedio: 55,
    ...over,
  };
}

function respuesta(items: Item[]): MeserosApi {
  return {
    totales: {
      vendido: 0,
      mesas: 0,
      comensales: 0,
      propinas: 0,
      ticketPromedio: 0,
      porComensal: 0,
      itemsAnulados: 0,
      montoAnulado: 0,
      meseros: items.length,
    },
    items,
  };
}

describe("ventas por mesero", () => {
  it("van del que más vendió al que menos", () => {
    const filas = filasMeseros(
      respuesta([item({ meseroId: 1, mesero: "Ana", vendido: 900 }), item({ meseroId: 2, mesero: "Luis", vendido: 1500 })]),
    );
    expect(filas.map((f) => f.nombre)).toEqual(["Luis", "Ana"]);
  });

  it("quien sólo anuló no tiene ticket ni tiempo por mesa: no es Bs 0 por mesa", () => {
    // Lo anulado va a nombre de quien lo sacó de la cuenta: el encargado
    // aparece sin mesas, y el backend le manda los promedios en 0.
    const [f] = filasMeseros(
      respuesta([
        item({ meseroId: 9, mesero: "Encargado", mesas: 0, comensales: 0, vendido: 0, ticketPromedio: 0, porComensal: 0, propinas: 0, minutosPromedio: 0, itemsAnulados: 3, montoAnulado: 45 }),
      ]),
    );
    expect(f).toMatchObject({ soloAnulo: true, ticket: null, porComensal: null, minutos: null, itemsAnulados: 3 });
  });

  it("sin comensales cargados no hay gasto por comensal", () => {
    const [f] = filasMeseros(respuesta([item({ comensales: 0, porComensal: 0 })]));
    expect(f.porComensal).toBeNull();
    expect(f.ticket).toBe(150);
  });

  it("una mesa sin las dos puntas no promedia minutos: 0 min no es un dato", () => {
    expect(filasMeseros(respuesta([item({ minutosPromedio: 0 })]))[0].minutos).toBeNull();
  });

  it("una sesión sin mesero se muestra igual, con su nombre", () => {
    // Es venta de mesas de antes del panel: esconderla haría que el total no
    // cuadre con las ventas de salón. Pero no es una persona, y no cuenta
    // como un mesero más.
    const [f] = filasMeseros(respuesta([item({ meseroId: null, mesero: "" })]));
    expect(f.nombre).toBe("Sin mesero");
    expect(f.sinMesero).toBe(true);
    expect(f.clave).toMatch(/^sin-mesero/);
  });

  it("el ranking de ventas deja afuera a quien no vendió nada", () => {
    const filas = filasMeseros(
      respuesta([item({ meseroId: 1, vendido: 500 }), item({ meseroId: 2, mesas: 0, vendido: 0, itemsAnulados: 2 })]),
    );
    expect(quienVendioMas(filas).map((f) => f.clave)).toEqual(["1"]);
  });

  it("el tiempo de una mesa se lee en minutos o en horas y minutos", () => {
    expect([45, 80, 120, 59.6].map(textoMinutos)).toEqual(["45 min", "1 h 20 min", "2 h", "1 h"]);
  });
});
