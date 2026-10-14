import { describe, expect, it } from "vitest";
import { aspectoMovimiento, hojaMovimientos, montoConSigno, netoDe, textoTurno, type MovimientoCaja } from "./MovimientosCaja.datos";

function movimiento(p: Partial<MovimientoCaja> = {}): MovimientoCaja {
  return {
    id: 1,
    clase: "INGRESO",
    fecha: "2026-10-08T15:00:00.000Z",
    concepto: "Sencillo",
    detalle: null,
    usuario: "Ana",
    turnoId: 12,
    monto: 50,
    ...p,
  };
}

describe("movimientos de caja", () => {
  it("las entradas suman y las salidas restan: el monto del backend viene siempre positivo", () => {
    expect(montoConSigno(movimiento({ clase: "INGRESO", monto: 50 }))).toBe(50);
    expect(montoConSigno(movimiento({ clase: "EGRESO", monto: 20 }))).toBe(-20);
    expect(montoConSigno(movimiento({ clase: "COBRO_CREDITO", monto: 30 }))).toBe(30);
  });

  it("un cobro de fiado es una entrada, con el reloj ámbar del crédito", () => {
    expect(aspectoMovimiento("COBRO_CREDITO")).toEqual({ icono: "clock", tono: "ambar", etiqueta: "Cobro de fiado", entra: true });
    expect(aspectoMovimiento("EGRESO")).toMatchObject({ tono: "rosa", entra: false });
  });

  it("un cobro que hizo el dueño no pasa por una caja y se dice sin turno", () => {
    expect(textoTurno(12)).toBe("Turno #12");
    expect(textoTurno(null)).toBe("Sin turno");
  });

  it("el neto cambia de etiqueta y de color con el signo; en cero va apagado", () => {
    expect(netoDe(120)).toEqual({ etiqueta: "Neto que entró", tono: "marca" });
    expect(netoDe(-40)).toEqual({ etiqueta: "Neto que salió", tono: "alerta" });
    expect(netoDe(0.003)).toEqual({ etiqueta: "Neto", tono: "apagado" });
  });

  it("el Excel lleva el monto con signo y dice qué página y qué filtro es", () => {
    const h = hojaMovimientos([movimiento({ clase: "EGRESO", monto: 20 })], { page: 2, limite: 50, total: 120, totalPaginas: 3 }, "SALIDA");
    expect(h.nombre).toBe("Salidas pág. 2 de 3");
    const [titulos, fila] = h.filas;
    expect(fila[titulos.indexOf("Monto (Bs)")]).toBe(-20);
    expect(fila[titulos.indexOf("Tipo")]).toBe("Egreso");
  });
});
