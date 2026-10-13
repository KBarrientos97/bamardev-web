import { describe, expect, it } from "vitest";
import type { CierreApi, CierresApi, DescuentosApi } from "../api";
import { cajaDe, hojaCajeros, unirCajeros } from "./Cajeros.datos";

function turno(cajero: string, esperado: number, conteo: number): CierreApi {
  return {
    id: Math.round(Math.random() * 1e9),
    fecha: "8 oct",
    fechaApertura: "2026-10-08T16:00:00.000Z",
    fechaCierre: "2026-10-09T02:00:00.000Z",
    cajero,
    duracion: "10h",
    totalDia: 0,
    apertura: 0,
    efectivo: 0,
    qr: 0,
    esperado,
    conteo,
  };
}

const sinDescuentos: Pick<DescuentosApi, "descuentosPorCajero" | "anulacionesPorCajero"> = {
  descuentosPorCajero: [],
  anulacionesPorCajero: [],
};

describe("ventas por cajero: la unión", () => {
  it("junta lo que cobró, sus turnos, sus anulaciones y sus descuentos por nombre", () => {
    const cierres: CierresApi = {
      performance: [
        { cajero: "Luis Mamani", ventas: 115, total: 6_728 },
        { cajero: "María F.", ventas: 80, total: 4_637 },
      ],
      historial: [turno("María F.", 100, 100), turno("luis mamani ", 200, 200)],
    };
    const filas = unirCajeros(cierres, {
      descuentosPorCajero: [{ cajero: "María F.", monto: 35.86, cantidad: 5 }],
      anulacionesPorCajero: [{ cajero: "Luis Mamani", monto: 166.7, cantidad: 4 }],
    });
    expect(filas.map((f) => f.cajero)).toEqual(["Luis Mamani", "María F."]);
    expect(filas[0]).toMatchObject({ turnos: 1, ventas: 115, total: 6_728, anuladas: 4, anulado: 166.7, tickets: 0 });
    expect(filas[1]).toMatchObject({ turnos: 1, ventas: 80, tickets: 5, descuentos: 35.86, anuladas: 0 });
  });

  it("el ticket promedio es el total sobre las ventas; sin ventas es null, no Bs 0", () => {
    const filas = unirCajeros(
      { performance: [{ cajero: "Ana", ventas: 4, total: 100 }], historial: [turno("Pedro", 50, 50)] },
      sinDescuentos,
    );
    expect(filas.find((f) => f.cajero === "Ana")?.ticketPromedio).toBe(25);
    expect(filas.find((f) => f.cajero === "Pedro")?.ticketPromedio).toBeNull();
  });

  it("quien sólo abrió caja o sólo anuló también aparece", () => {
    const filas = unirCajeros(
      { performance: [], historial: [turno("Pedro", 50, 50)] },
      { descuentosPorCajero: [], anulacionesPorCajero: [{ cajero: "Rosa", monto: 20, cantidad: 1 }] },
    );
    expect(filas.map((f) => f.cajero).sort()).toEqual(["Pedro", "Rosa"]);
  });
});

describe("ventas por cajero: la caja", () => {
  it("cuenta los turnos de cada uno y suma sus diferencias", () => {
    const [f] = unirCajeros(
      { performance: [], historial: [turno("Ana", 100, 90), turno("Ana", 200, 195), turno("Ana", 50, 50)] },
      sinDescuentos,
    );
    expect(f).toMatchObject({ turnos: 3, turnosConDiferencia: 2, diferencia: -15 });
    expect(cajaDe(f)).toEqual({ tipo: "diferencia", monto: -15 });
  });

  it("cuadra sólo si cuadraron todos sus turnos; los centavos no cuentan", () => {
    const [f] = unirCajeros({ performance: [], historial: [turno("Ana", 100, 100.004), turno("Ana", 80, 80)] }, sinDescuentos);
    expect(cajaDe(f)).toEqual({ tipo: "cuadra" });
  });

  it("diferencias que se compensan no se leen como que cuadró", () => {
    // −Bs 50 en un turno y +Bs 50 en otro: la plata que faltó en uno no
    // desaparece porque sobró en otro.
    const [f] = unirCajeros({ performance: [], historial: [turno("Ana", 100, 50), turno("Ana", 100, 150)] }, sinDescuentos);
    expect(cajaDe(f)).toEqual({ tipo: "compensada" });
  });

  it("sin turnos la caja no se juzga", () => {
    const [f] = unirCajeros({ performance: [{ cajero: "Ana", ventas: 1, total: 10 }], historial: [] }, sinDescuentos);
    expect(cajaDe(f)).toEqual({ tipo: "sinTurnos" });
  });

  it("el Excel deja la diferencia vacía a quien no tuvo turnos", () => {
    const filas = unirCajeros({ performance: [{ cajero: "Ana", ventas: 1, total: 10 }], historial: [] }, sinDescuentos);
    const [titulos, fila] = hojaCajeros(filas).filas;
    expect(fila[titulos.indexOf("Diferencia de caja (Bs)")]).toBeNull();
    expect(fila[titulos.indexOf("Caja")]).toBe("Sin turnos");
  });
});
