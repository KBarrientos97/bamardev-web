import { describe, expect, it } from "vitest";
import type { CajaSupervisionApi } from "../api";
import { destinoDelMovimiento, tituloDeMovimiento } from "./EfectivoSupervision.datos";

const caja = (id: number, cajero: string, cajeroId: number, abierta = true): CajaSupervisionApi => ({
  id,
  abierta,
  cajero,
  cajeroId,
  desde: 1_000 + id,
  hasta: abierta ? null : 9_000,
  inicial: 50,
  ventas: 0,
  vendido: 0,
  anuladas: 0,
});

const delTurno = { cajaId: 1, cajero: "Pepe", desde: 1_001, esperado: 145 };

describe("a qué caja va un movimiento de Supervisión", () => {
  it("con una sola caja abierta va a la del turno, con su esperado, y no se elige", () => {
    const d = destinoDelMovimiento(delTurno, [caja(1, "Pepe", 20), caja(2, "Kevin", 10, false)], 10);
    expect(d).toEqual({ cajaId: 1, deQuien: { nombre: "Pepe", desde: 1_001 }, esperado: 145 });
  });

  it("si la del turno es la del propio administrador y hay otra abierta, propone la otra", () => {
    // El turno por defecto es la caja abierta más vieja: la del dueño. Tocaba
    // "Cena" pensando en la cajera y se descontaba de su propia caja.
    const d = destinoDelMovimiento(
      { cajaId: 2, cajero: "Kevin", desde: 1_002, esperado: 50 },
      [caja(2, "Kevin", 10), caja(1, "Pepe", 20)],
      10,
    );
    expect(d.cajaId).toBe(1);
    expect(d.deQuien.nombre).toBe("Pepe");
    // El esperado de la otra no se sabe: el cuadro lo pide.
    expect(d.esperado).toBeNull();
    expect(d.cajas?.map((c) => c.id)).toEqual([2, 1]);
  });

  it("si la del turno es de otra persona, se queda en ella aunque haya más abiertas", () => {
    const d = destinoDelMovimiento(delTurno, [caja(1, "Pepe", 20), caja(2, "Kevin", 10)], 10);
    expect(d.cajaId).toBe(1);
    expect(d.esperado).toBe(145);
    expect(d.cajas).toHaveLength(2);
  });

  it("no propone sola una caja que quedó abierta de otro día", () => {
    // El sábado el admin atiende con su caja de hoy y la de Pepe quedó abierta
    // desde el jueves: el gasto iba a la del jueves y la de hoy cerraba con faltante.
    const jornada = 1_500;
    const hoy = { ...caja(2, "Kevin", 10), desde: 2_000 };
    const delJueves = { ...caja(1, "Pepe", 20), desde: 100 };
    const d = destinoDelMovimiento({ cajaId: 2, cajero: "Kevin", desde: 2_000, esperado: 80 }, [hoy, delJueves], 10, jornada);
    expect(d.cajaId).toBe(2);
    expect(d.esperado).toBe(80);
    // Se puede elegir igual en el cuadro.
    expect(d.cajas?.map((c) => c.id)).toEqual([2, 1]);
  });

  it("sin saber quién mira, no adivina: la del turno", () => {
    const d = destinoDelMovimiento(delTurno, [caja(1, "Pepe", 20), caja(2, "Kevin", 10)], undefined);
    expect(d.cajaId).toBe(1);
  });
});

describe("el título de un movimiento", () => {
  it("con motivo: la etiqueta y lo que se escribió, si es otra cosa", () => {
    expect(tituloDeMovimiento({ codigo: "GASTO", cena: false, texto: "Hielo", tipo: "EGRESO" })).toBe("Gasto · Hielo");
    expect(tituloDeMovimiento({ codigo: "RETIRO", cena: false, texto: "Retiro", tipo: "EGRESO" })).toBe("Retiro");
    // Una cena de un backend anterior, sin código.
    expect(tituloDeMovimiento({ cena: true, texto: "Cena", tipo: "EGRESO" })).toBe("Cena");
  });

  it("sin motivo: lo que se escribió, o de qué lado fue", () => {
    expect(tituloDeMovimiento({ cena: false, texto: "Vuelto", tipo: "INGRESO" })).toBe("Vuelto");
    expect(tituloDeMovimiento({ cena: false, texto: null, tipo: "EGRESO" })).toBe("Salida de efectivo");
  });
});
