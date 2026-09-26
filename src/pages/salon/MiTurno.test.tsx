import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mesa, TurnoMesero } from "../../types/salon";
import MiTurno from "./MiTurno";

const turnoMesero = vi.fn();
const mesaCerrada = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    turnoMesero: () => turnoMesero(),
    mesaCerrada: (id: number) => mesaCerrada(id),
    cerrarTurnoMesero: vi.fn(),
  },
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ logout: vi.fn(), negocio: { nombre: "Pollos Don Omar" } }),
}));

function turno(p: Partial<TurnoMesero> = {}): TurnoMesero {
  return {
    meseroNombre: "Mesero Auditoria",
    turno: "Turno noche",
    desde: "2026-09-24T20:00:00.000Z",
    vendidoCobrado: 91,
    mesasCerradas: 2,
    mesasAbiertas: 0,
    comensales: 4,
    propinas: 0,
    enMesasAbiertas: 0,
    mesasPorLiberar: 0,
    mesasSinCerrar: [],
    efectivoSinEntregar: 0,
    franjas: [],
    historial: [
      {
        sesionId: 7,
        mesaCodigo: "M3",
        comensales: 2,
        total: 47,
        comprobante: "V-000005",
        cerradaEn: "2026-09-24T22:12:00.000Z",
      },
    ],
    ...p,
  };
}

describe("Mi turno del mesero (web)", () => {
  beforeEach(() => {
    turnoMesero.mockReset();
    mesaCerrada.mockReset();
  });

  it("con efectivo sin entregar lo muestra y no deja cerrar el turno", async () => {
    // Antes la web sólo miraba las mesas: dejaba tocar "Cerrar mi turno" con
    // plata encima y recién ahí el backend lo rechazaba.
    turnoMesero.mockResolvedValue(turno({ efectivoSinEntregar: 44 }));
    render(<MiTurno onIrAEntregas={() => {}} />);

    expect(await screen.findByText("Efectivo sin entregar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar mi turno" })).toBeDisabled();
    expect(screen.getByText(/tenés que entregar en caja/)).toBeInTheDocument();
  });

  it("sin plata encima ni mesas, el turno se puede cerrar", async () => {
    turnoMesero.mockResolvedValue(turno());
    render(<MiTurno />);
    await screen.findByText("Mesas cobradas en mi turno");
    expect(screen.queryByText("Efectivo sin entregar")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar mi turno" })).toBeEnabled();
  });

  it("tocar una mesa cobrada abre su recibo", async () => {
    // Las filas no hacían nada: el cliente que volvía a pedir el recibo se
    // quedaba sin él.
    turnoMesero.mockResolvedValue(turno());
    const cobrada: Mesa = {
      id: 3,
      codigo: "M3",
      nombre: "Mesa M3",
      zonaCodigo: "salon",
      zonaNombre: "Salón",
      capacidad: 4,
      capacidadTotal: 4,
      unidas: [],
      activa: true,
      estado: "PAGADA",
      comensales: 2,
      consumo: 47,
      propina: 0,
      comprobante: "V-000005",
      comandas: [],
      cobro: {
        fecha: "2026-09-24T22:12:00.000Z",
        total: 47,
        pagos: [{ formaPago: "QR", monto: 47, recibido: 0, entregado: 0 }],
      },
    };
    mesaCerrada.mockResolvedValue(cobrada);
    render(<MiTurno />);

    fireEvent.click(await screen.findByTitle("Ver el recibo"));
    await waitFor(() => expect(mesaCerrada).toHaveBeenCalledWith(7));
    expect(await screen.findByText("RECIBO DE PAGO")).toBeInTheDocument();
  });

  it("las franjas aparecen sólo si hubo más de una", async () => {
    turnoMesero.mockResolvedValue(
      turno({
        franjas: [
          {
            franja: "TARDE",
            nombre: "Tarde",
            desde: "2026-09-24T18:00:00.000Z",
            hasta: "2026-09-24T19:00:00.000Z",
            mesas: 1,
            comensales: 2,
            vendido: 44,
            propinas: 0,
          },
        ],
      }),
    );
    render(<MiTurno />);
    await screen.findByText("Mesas cobradas en mi turno");
    expect(screen.queryByText("Cómo fue cada turno")).not.toBeInTheDocument();
  });
});
