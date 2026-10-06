import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Caja, ResumenCaja } from "../../types";

/**
 * El cierre de caja en un salón de belleza (QA ronda 1, 06-oct): qué citas
 * quedaron para revisar y por qué (B-28), y sin palabras de restaurante
 * (B-21). Un restaurante ve lo de siempre.
 */

const sesion = vi.hoisted(() => ({ rubro: "PELUQUERIA" as string }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: sesion.rubro,
    incluye: () => true,
    usuario: { rol: "ADMIN" },
  }),
}));

vi.mock("../../lib/api", () => ({
  api: { resumenCaja: vi.fn(), reporteCierreProductos: vi.fn(), cerrarCaja: vi.fn() },
}));

import { api } from "../../lib/api";
import PantallaCierre from "./PantallaCierre";

function resumen(extra: Partial<ResumenCaja> = {}): ResumenCaja {
  return {
    cajaId: 1,
    estado: "ABIERTA",
    montoApertura: 100,
    cantidadVentas: 3,
    totalVentas: 330,
    anuladas: 0,
    porFormaPago: [{ nombre: "Efectivo", monto: 330 }],
    efectivo: 330,
    cambioEntregado: 0,
    ingresos: 0,
    egresos: 0,
    movimientos: [],
    creditoOtorgado: 0,
    abonosCredito: 0,
    abonosEfectivo: 0,
    abonosPorFormaPago: [],
    saldoEsperado: 430,
    ...extra,
  };
}

async function montar() {
  render(
    <PantallaCierre
      caja={{ id: 1, fechaApertura: "2026-10-06T12:00:00.000Z", montoApertura: 100 } as Caja}
      onAtras={() => {}}
      onCerrada={() => {}}
    />,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.rubro = "PELUQUERIA";
});

describe("B-28: las citas para revisar, con nombre y motivo", () => {
  it("lista cuáles y dice el motivo en palabras", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(
      resumen({
        citasCobroRevisar: 3,
        citasRevisar: [
          { id: 13, codigo: "K7M2QX", cliente: "Ana Pisa", motivo: "COBRO_INCOMPLETO" },
          { id: 14, codigo: "P3R8TZ", cliente: "Rosa Mamani", motivo: "YA_COBRADA" },
          { id: 15, codigo: "Q1W2E3", cliente: "Luz Vaca", motivo: "CITA_CERRADA" },
        ],
      }),
    );
    await montar();
    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent("3 cobros de citas para revisar:");
    expect(aviso).toHaveTextContent("Ana Pisa (K7M2QX) · cobrada por menos de lo agendado");
    expect(aviso).toHaveTextContent("Rosa Mamani (P3R8TZ) · cobrada dos veces");
    expect(aviso).toHaveTextContent("Luz Vaca (Q1W2E3) · cobrada estando cerrada");
  });

  it("un backend que sólo manda el conteo sigue diciendo lo de antes", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen({ citasCobroRevisar: 1 }));
    await montar();
    expect(screen.getByRole("alert")).toHaveTextContent("1 cita se cobró de más");
  });
});

describe("B-21: sin palabras de restaurante en un salón", () => {
  it("peluquería: «Ver lo vendido»", async () => {
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    await montar();
    expect(screen.getByText("Ver lo vendido")).toBeInTheDocument();
    expect(screen.queryByText("Ver qué salió del mostrador")).not.toBeInTheDocument();
  });

  it("restaurante: como siempre", async () => {
    sesion.rubro = "RESTAURANTE";
    vi.mocked(api.resumenCaja).mockResolvedValue(resumen());
    await montar();
    expect(screen.getByText("Ver qué salió del mostrador")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
