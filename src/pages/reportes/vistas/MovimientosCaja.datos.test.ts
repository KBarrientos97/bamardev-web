import { describe, expect, it } from "vitest";
import {
  anuladosDelFiltro,
  aspectoMovimiento,
  efectoEnGanancia,
  filasPorMotivo,
  hojaMovimientos,
  montoConSigno,
  netoDe,
  textoTurno,
  tituloMovimiento,
  type AnuladoCaja,
  type MovimientoCaja,
} from "./MovimientosCaja.datos";

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

describe("movimientos de caja con motivo (billar, 25-oct)", () => {
  const PAGINA = { page: 1, limite: 50, total: 2, totalPaginas: 1 };

  it("el título nombra el motivo y lo que se escribió, como en Supervisión", () => {
    expect(tituloMovimiento(movimiento({ clase: "EGRESO", concepto: "Hielo", origen: "GASTO" }))).toBe("Gasto · Hielo");
    expect(tituloMovimiento(movimiento({ clase: "EGRESO", concepto: "Pago a proveedor", origen: "PROVEEDOR" }))).toBe("Pago a proveedor");
    expect(tituloMovimiento(movimiento({ clase: "EGRESO", concepto: "Cena", origen: "CENA" }))).toBe("Cena");
    expect(tituloMovimiento(movimiento({ clase: "INGRESO", concepto: "", origen: "SENCILLO" }))).toBe("Sencillo");
  });

  it("sin motivo el título es el de siempre, también con la propina de belleza", () => {
    // La propina trae código pero no es un motivo del billar: no se renombra.
    expect(tituloMovimiento(movimiento({ concepto: "Sencillo" }))).toBe("Sencillo");
    expect(tituloMovimiento(movimiento({ concepto: "Propina de Ana", origen: "PROPINA" }))).toBe("Propina de Ana");
    expect(tituloMovimiento(movimiento({ clase: "EGRESO", concepto: "" }))).toBe("Egreso");
  });

  it("la cena y el gasto restan de la ganancia; lo demás no, y sin motivo no se dice nada", () => {
    expect(efectoEnGanancia("CENA")).toBe("resta");
    expect(efectoEnGanancia("GASTO")).toBe("resta");
    for (const c of ["PROVEEDOR", "RETIRO", "OTRA_SALIDA", "SENCILLO", "OTRA_ENTRADA"]) expect(efectoEnGanancia(c)).toBe("no-cambia");
    expect(efectoEnGanancia(null)).toBeNull();
    expect(efectoEnGanancia("PROPINA")).toBeNull();
  });

  it("por motivo: cada uno con su nombre, su signo y si resta; sin el campo, nada", () => {
    const filas = filasPorMotivo([
      { codigo: "CENA", monto: 600, cantidad: 30 },
      { codigo: "PROVEEDOR", monto: 800, cantidad: 2 },
      { codigo: "SENCILLO", monto: 200, cantidad: 1 },
    ]);
    expect(filas.map((f) => [f.etiqueta, f.monto, f.cantidad, f.efecto])).toEqual([
      ["Cena", -600, 30, "resta"],
      ["Pago a proveedor", -800, 2, "no-cambia"],
      ["Sencillo", 200, 1, "no-cambia"],
    ]);
    expect(filasPorMotivo(undefined)).toEqual([]);
    expect(filasPorMotivo([])).toEqual([]);
  });

  it("los anulados siguen al filtro de la lista", () => {
    const anulado = (clase: "INGRESO" | "EGRESO", id: number): AnuladoCaja => ({
      id,
      clase,
      fecha: "2026-10-24T23:00:00.000Z",
      concepto: clase === "EGRESO" ? "Cena" : "Sencillo",
      usuario: "Kevin",
      turnoId: 9,
      monto: 20,
      origen: clase === "EGRESO" ? "CENA" : "SENCILLO",
      anuladoPor: "Kevin",
      anuladoEn: "2026-10-24T23:05:00.000Z",
    });
    const todos = [anulado("EGRESO", 1), anulado("INGRESO", 2)];
    expect(anuladosDelFiltro(todos, "").map((a) => a.id)).toEqual([1, 2]);
    expect(anuladosDelFiltro(todos, "SALIDA").map((a) => a.id)).toEqual([1]);
    expect(anuladosDelFiltro(todos, "ENTRADA").map((a) => a.id)).toEqual([2]);
    expect(anuladosDelFiltro(undefined, "")).toEqual([]);
  });

  it("el Excel lleva la columna Motivo sólo si alguna fila tiene uno", () => {
    const conMotivo = hojaMovimientos(
      [movimiento({ clase: "EGRESO", concepto: "Hielo", origen: "GASTO" }), movimiento({ concepto: "Sencillo", origen: null })],
      PAGINA,
      "",
    );
    const [titulos, gasto, comun] = conMotivo.filas;
    expect(titulos).toContain("Motivo");
    expect(gasto[titulos.indexOf("Motivo")]).toBe("Gasto");
    expect(gasto[titulos.indexOf("Concepto")]).toBe("Hielo");
    expect(comun[titulos.indexOf("Motivo")]).toBeNull();
    // Restaurante, farmacia, belleza (y un backend anterior): las columnas de siempre.
    const sinMotivo = hojaMovimientos([movimiento(), movimiento({ concepto: "Propina", origen: "PROPINA" })], PAGINA, "");
    expect(sinMotivo.filas[0]).toEqual(["Fecha", "Tipo", "Concepto", "Detalle", "Usuario", "Turno", "Monto (Bs)"]);
  });
});
