import { describe, expect, it } from "vitest";
import type { CierreApi } from "../api";
import { diaDelTurno, diferenciaDe, estadoDe, hojaCierres, resumenCierres, tituloCierre, turnoDe } from "./Cierres.datos";

/** Un instante en la hora LOCAL de la máquina que corre el test: el turno sale de la hora local. */
function local(anio: number, mes: number, dia: number, hora: number, minuto = 0): string {
  return new Date(anio, mes - 1, dia, hora, minuto).toISOString();
}

function cierre(p: Partial<CierreApi> = {}): CierreApi {
  return {
    id: 1,
    fecha: "8 oct",
    fechaApertura: local(2026, 10, 8, 20),
    fechaCierre: local(2026, 10, 9, 3),
    cajero: "María F.",
    duracion: "7h",
    totalDia: 900,
    apertura: 100,
    efectivo: 629.33,
    qr: 270.67,
    esperado: 729.33,
    conteo: 729.33,
    ...p,
  };
}

describe("cierres: el turno", () => {
  it("sale de la hora local de apertura: mañana de 6 a 12, tarde de 12 a 18, noche el resto", () => {
    expect(turnoDe(local(2026, 10, 8, 6))).toBe("Mañana");
    expect(turnoDe(local(2026, 10, 8, 11, 59))).toBe("Mañana");
    expect(turnoDe(local(2026, 10, 8, 12))).toBe("Tarde");
    expect(turnoDe(local(2026, 10, 8, 17, 59))).toBe("Tarde");
    expect(turnoDe(local(2026, 10, 8, 18))).toBe("Noche");
    expect(turnoDe(local(2026, 10, 9, 2))).toBe("Noche");
    expect(turnoDe(local(2026, 10, 9, 5, 59))).toBe("Noche");
  });

  it("sin la hora de apertura no se inventa el turno", () => {
    expect(turnoDe(null)).toBeNull();
    expect(turnoDe("no es fecha")).toBeNull();
    // Un día pelado es medianoche UTC: en Bolivia daría "Noche" del día anterior.
    expect(turnoDe("2026-10-08")).toBeNull();
  });

  it("el día es el de la apertura, con el día de la semana: la noche del jueves no es del viernes", () => {
    expect(diaDelTurno(cierre())).toBe("Jue 08/10/2026");
    expect(tituloCierre(cierre())).toBe("Jue 08/10/2026 · Noche");
  });

  it("la versión corta (celular) deja el turno y saca el año", () => {
    // Entero no entraba en 375 px y lo que se cortaba era justo el turno.
    expect(tituloCierre(cierre(), false)).toBe("Jue 08/10 · Noche");
  });

  it("sin fechas con hora queda lo que mande el backend", () => {
    expect(tituloCierre(cierre({ fechaApertura: "", fechaCierre: null }))).toBe("8 oct");
  });
});

describe("cierres: la diferencia", () => {
  it("es lo contado menos lo esperado", () => {
    expect(diferenciaDe(cierre({ esperado: 729.33, conteo: 712.33 }))).toBe(-17);
    expect(diferenciaDe(cierre({ esperado: 525.16, conteo: 533.16 }))).toBe(8);
  });

  it("una diferencia de centavos cuenta como que cuadró", () => {
    expect(estadoDe(diferenciaDe(cierre({ esperado: 400, conteo: 400.004 })))).toBe("cuadra");
    expect(estadoDe(-17)).toBe("faltante");
    expect(estadoDe(8)).toBe("sobrante");
  });

  it("faltantes y sobrantes se suman por separado: no se compensan entre sí", () => {
    // Netos, −Bs 50 en un turno y +Bs 50 en otro daban "cuadró".
    const r = resumenCierres([
      cierre({ esperado: 729.33, conteo: 712.33 }), // −17
      cierre({ esperado: 766.01, conteo: 724.01 }), // −42
      cierre({ esperado: 525.16, conteo: 533.16 }), // +8
      cierre({ esperado: 572.87, conteo: 588.87 }), // +16
      cierre({ esperado: 580.74, conteo: 580.74 }),
    ]);
    expect(r).toEqual({ cierres: 5, cuadraron: 1, faltantes: -59, conFaltante: 2, sobrantes: 24, conSobrante: 2 });
  });

  it("el Excel lleva la diferencia como número y el estado con su nombre", () => {
    const h = hojaCierres([cierre({ esperado: 729.33, conteo: 712.33 })]);
    const [titulos, fila] = h.filas;
    expect(fila[titulos.indexOf("Diferencia (Bs)")]).toBe(-17);
    expect(fila[titulos.indexOf("Estado")]).toBe("Faltante");
    expect(fila[titulos.indexOf("Turno")]).toBe("Noche");
  });
});
