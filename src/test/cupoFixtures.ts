import type { CupoEstado } from "../types";

/**
 * Un cupo del Plan Emprendedor para los tests, con lo del contrato (§4.1):
 * 50 ventas y 50 citas por día, 1 crédito por venta y 2 por cita. Se pisa lo
 * que cada caso necesita.
 */
export function cupoEmprendedor(
  over: {
    fecha?: string;
    ventas?: number;
    limiteVentas?: number | null;
    citas?: number;
    limiteCitas?: number | null;
    saldo?: number;
  } = {},
): CupoEstado {
  return {
    plan: "EMPRENDEDOR",
    ilimitado: false,
    fecha: over.fecha ?? "2026-10-09",
    hoy: {
      ventas: { usadas: over.ventas ?? 0, limite: over.limiteVentas === undefined ? 50 : over.limiteVentas },
      citas: { usadas: over.citas ?? 0, limite: over.limiteCitas === undefined ? 50 : over.limiteCitas },
    },
    creditos: { saldo: over.saldo ?? 0, congelado: false },
    creditosPorVenta: 1,
    creditosPorCita: 2,
    sugerirBasico: false,
  };
}

/** Lo que manda el backend a un Básico o Profesional: nada que controlar. */
export const CUPO_ILIMITADO: CupoEstado = {
  plan: "BASICO",
  ilimitado: true,
  fecha: "2026-10-09",
  hoy: { ventas: { usadas: 0, limite: null }, citas: { usadas: 0, limite: null } },
  creditos: { saldo: 0, congelado: true },
  creditosPorVenta: 1,
  creditosPorCita: 2,
  sugerirBasico: false,
};
