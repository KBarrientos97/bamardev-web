import { describe, expect, it } from "vitest";
import { diaDeJornada, normalizarHistorial, rangoSemana, textoDia } from "./historialReparto";

/** El historial del repartidor por día (`GET /reparto/historial`) y la semana que pide «Mi día». */

describe("normalizarHistorial", () => {
  it("cada campo en su tipo y el día más reciente arriba", () => {
    const h = normalizarHistorial({
      cantidad: 3,
      totalEnvios: "22.50",
      dias: [
        { dia: "2026-11-18", cantidad: 1, totalEnvios: 7, entregas: [{ ventaId: 1, numero: "V-1", cliente: "Ana", entregadoEn: "2026-11-18T20:00:00Z", envio: "7", formaPago: "Efectivo", total: 50 }] },
        { dia: "2026-11-20", cantidad: 2, totalEnvios: 15.5, entregas: [{ ventaId: 2, numero: null, cliente: "", envio: 8 }] },
      ],
    });
    expect(h?.totalEnvios).toBe(22.5);
    expect(h?.dias.map((d) => d.dia)).toEqual(["2026-11-20", "2026-11-18"]);
    expect(h?.dias[1].entregas[0]).toEqual({ ventaId: 1, numero: "V-1", cliente: "Ana", entregadoEn: "2026-11-18T20:00:00Z", envio: 7, formaPago: "Efectivo", total: 50 });
    // Lo que falta no rompe: número de respaldo, «Sin nombre».
    expect(h?.dias[0].entregas[0]).toMatchObject({ numero: "#2", cliente: "Sin nombre", formaPago: "Sin detalle" });
  });

  it("algo que no es un historial (un backend anterior) da null", () => {
    expect(normalizarHistorial(null)).toBeNull();
    expect(normalizarHistorial({ message: "Not Found" })).toBeNull();
  });
});

describe("la semana de jornada", () => {
  it("antes de las 6:00 de Bolivia todavía es el día anterior", () => {
    // 20-nov 05:30 en Bolivia = 09:30 UTC.
    expect(diaDeJornada(new Date("2026-11-20T09:30:00Z"))).toBe("2026-11-19");
    // 20-nov 06:30 en Bolivia = 10:30 UTC.
    expect(diaDeJornada(new Date("2026-11-20T10:30:00Z"))).toBe("2026-11-20");
  });

  it("los últimos 7 días, hoy incluido, aunque cruce de mes", () => {
    expect(rangoSemana(new Date("2026-11-20T15:00:00Z"))).toEqual({ desde: "2026-11-14", hasta: "2026-11-20" });
    expect(rangoSemana(new Date("2026-12-03T15:00:00Z"))).toEqual({ desde: "2026-11-27", hasta: "2026-12-03" });
  });

  it("el encabezado del día", () => {
    expect(textoDia("2026-11-20")).toBe("vie 20/11");
  });
});
