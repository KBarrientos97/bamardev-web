import { describe, expect, it } from "vitest";
import { fijarMoneda, fmtFecha, fmtMoney, fmtNum, isoDia, iniciales } from "./format";

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

describe("fmtNum", () => {
  it("respeta los decimales pedidos", () => {
    expect(fmtNum(1500)).toBe("1.500");
    expect(fmtNum(2.5, 2)).toBe("2,50");
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
