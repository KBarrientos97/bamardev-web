import { describe, expect, it } from "vitest";
import { fijarMoneda, fmtCantidad, fmtFecha, fmtMoney, fmtNum, isoDia, iniciales } from "./format";

describe("fmtFecha", () => {
  it("no corre el día con una fecha suelta yyyy-MM-dd", () => {
    // El navegador parsea "2026-09-01" como medianoche UTC, que en Bolivia
    // (UTC-4) cae el 31/08. Si esto falla, los rangos de los reportes
    // muestran un día menos del que se pidió.
    expect(fmtFecha("2026-09-01")).toBe("01/09/2026");
    expect(fmtFecha("2026-01-01")).toBe("01/01/2026");
    expect(fmtFecha("2026-12-31")).toBe("31/12/2026");
  });

  it("acepta un timestamp completo", () => {
    expect(fmtFecha("2026-09-02T14:30:00.000Z")).toMatch(/^\d{2}\/\d{2}\/2026$/);
  });

  it("devuelve un guion cuando no hay fecha", () => {
    expect(fmtFecha(null)).toBe("—");
    expect(fmtFecha(undefined)).toBe("—");
    expect(fmtFecha("")).toBe("—");
  });
});

describe("isoDia", () => {
  it("usa el día local y no el UTC", () => {
    // A las 22:00 de Bolivia ya es el día siguiente en UTC: si isoDia usara
    // toISOString, un cierre de caja de la noche quedaría fechado mañana.
    expect(isoDia(new Date(2026, 8, 1, 22, 30))).toBe("2026-09-01");
    expect(isoDia(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("es la inversa de fmtFecha", () => {
    const d = new Date(2026, 8, 1);
    expect(fmtFecha(isoDia(d))).toBe("01/09/2026");
  });
});

describe("fmtMoney", () => {
  it("formatea en bolivianos con dos decimales", () => {
    fijarMoneda("BOB");
    expect(fmtMoney(1234.5)).toBe("Bs 1.234,50");
    expect(fmtMoney(0)).toBe("Bs 0,00");
  });

  it("trata null y undefined como cero", () => {
    fijarMoneda("BOB");
    expect(fmtMoney(null)).toBe("Bs 0,00");
    expect(fmtMoney(undefined)).toBe("Bs 0,00");
  });
});

describe("fmtCantidad", () => {
  it("la cantidad entera va sin ,00 y la que tiene fracción, con lo que necesita", () => {
    // Kevin, 25-oct: "3,00 en unidad no da". Antes el stock salía "48,00 Unidad".
    expect(fmtCantidad(9)).toBe("9");
    expect(fmtCantidad(48)).toBe("48");
    expect(fmtCantidad(0.5)).toBe("0,5");
    expect(fmtCantidad(2.25)).toBe("2,25");
  });

  it("llega a los 3 decimales con los que se guarda el stock", () => {
    // Con 2 decimales, 0,125 kg de un insumo salía "0,13": cinco gramos que no
    // están en ningún lado.
    expect(fmtCantidad(0.125)).toBe("0,125");
    expect(fmtCantidad(2.5)).toBe("2,5");
    expect(fmtCantidad(1.23456)).toBe("1,235");
  });

  it("redondea antes de formatear: el resto de punto flotante de una cuenta no se ve", () => {
    // Lo útil de Stock crítico es stock − vencido: 2,3 − 0,3 da 1,9999999999999998
    // y salía "2,00".
    expect(fmtCantidad(2.3 - 0.3)).toBe("2");
    expect(fmtCantidad(0.1 + 0.2)).toBe("0,3");
  });

  it("un saldo que redondea a cero no lleva signo", () => {
    // Un −0,0004 del kardex salía "-0" con fmtNum.
    expect(fmtCantidad(-0.0004)).toBe("0");
    expect(fmtCantidad(-0.0001)).toBe("0");
    expect(fmtCantidad(-2.5)).toBe("-2,5");
  });

  it("separa los miles como la plata", () => {
    expect(fmtCantidad(1500)).toBe("1.500");
    expect(fmtCantidad(1234.5)).toBe("1.234,5");
  });

  it("trata null y undefined como cero", () => {
    expect(fmtCantidad(null)).toBe("0");
    expect(fmtCantidad(undefined)).toBe("0");
  });

  it("acepta menos decimales para un promedio", () => {
    // "2 por día" y "1,5 por día" en el pedido sugerido; antes "2,0 por día".
    expect(fmtCantidad(2, 1)).toBe("2");
    expect(fmtCantidad(1.5, 1)).toBe("1,5");
    expect(fmtCantidad(2.25, 1)).toBe("2,3");
    expect(fmtCantidad(1.96, 1)).toBe("2");
  });
});

describe("fmtNum", () => {
  it("respeta los decimales pedidos", () => {
    expect(fmtNum(1500)).toBe("1.500");
    expect(fmtNum(2.5, 2)).toBe("2,50");
  });

  it("fuerza o redondea los decimales: por eso las cantidades van con fmtCantidad", () => {
    expect(fmtNum(48, 2)).toBe("48,00");
    expect(fmtNum(2.5)).toBe("3");
  });
});

describe("iniciales", () => {
  it("toma las dos primeras palabras", () => {
    expect(iniciales("Juan Perez")).toBe("JP");
    expect(iniciales("Administrador")).toBe("A");
    expect(iniciales("")).toBe("?");
    expect(iniciales(null)).toBe("?");
  });
});
