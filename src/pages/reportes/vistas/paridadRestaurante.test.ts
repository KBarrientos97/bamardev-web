import { describe, expect, it } from "vitest";
import { cruzaMedianoche } from "./Cierres.datos";
import { ordenarMeseros, type FilaMesero } from "./datosMeseros";

/** Lo que la web tomó de la app en Reportes del restaurante (8-nov). */

const local = (dia: number, hora: number) => new Date(2026, 10, dia, hora).toISOString();

describe("un turno que cruza la medianoche", () => {
  it("el que abrió un día y cerró al siguiente se marca", () => {
    expect(cruzaMedianoche({ fechaApertura: local(6, 12), fechaCierre: local(7, 4) })).toBe(true);
  });

  it("un turno de noche que cierra antes de las 12 no", () => {
    // Con el prefijo del ISO, que es UTC, en Bolivia las 22:00 ya serían el
    // día siguiente y se marcaría sin haber cruzado nada.
    expect(cruzaMedianoche({ fechaApertura: local(6, 18), fechaCierre: local(6, 23) })).toBe(false);
  });

  it("sin las dos puntas no se dice nada", () => {
    expect(cruzaMedianoche({ fechaApertura: local(6, 18), fechaCierre: null })).toBe(false);
    expect(cruzaMedianoche({})).toBe(false);
  });
});

function fila(nombre: string, p: Partial<FilaMesero>): FilaMesero {
  return {
    clave: nombre,
    nombre,
    sinMesero: false,
    mesas: 1,
    comensales: 1,
    vendido: 100,
    ticket: 100,
    porComensal: 100,
    propinas: 0,
    minutos: null,
    itemsAnulados: 0,
    montoAnulado: 0,
    soloAnulo: false,
    ...p,
  };
}

describe("el orden de los meseros", () => {
  const ana = fila("Ana", { vendido: 1500, mesas: 10, porComensal: 50 });
  const luis = fila("Luis", { vendido: 900, mesas: 12, porComensal: 75 });
  const encargada = fila("Encargada", { vendido: 0, mesas: 0, comensales: 0, porComensal: null, soloAnulo: true });

  it("por lo vendido", () => {
    expect(ordenarMeseros([luis, encargada, ana], "vendido").map((f) => f.nombre)).toEqual(["Ana", "Luis", "Encargada"]);
  });

  it("por comensal, que no premia a quien le tocaron las mesas grandes", () => {
    expect(ordenarMeseros([ana, luis], "porComensal").map((f) => f.nombre)).toEqual(["Luis", "Ana"]);
  });

  it("quien no tiene comensales queda al final, no arriba", () => {
    expect(ordenarMeseros([encargada, ana], "porComensal").map((f) => f.nombre)).toEqual(["Ana", "Encargada"]);
  });

  it("por mesas", () => {
    expect(ordenarMeseros([ana, luis], "mesas").map((f) => f.nombre)).toEqual(["Luis", "Ana"]);
  });

  it("no toca la lista que recibe", () => {
    const lista = [luis, ana];
    ordenarMeseros(lista, "vendido");
    expect(lista.map((f) => f.nombre)).toEqual(["Luis", "Ana"]);
  });
});
