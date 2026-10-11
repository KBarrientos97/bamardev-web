import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReporteAgenda } from "../../lib/agenda/tiposComisiones";

/** Reportes de agenda: lo que manda el backend, dibujado tal cual. */

vi.mock("../../lib/agenda/apiComisiones", () => ({
  apiComisiones: { reporteAgenda: vi.fn() },
}));

import { apiComisiones } from "../../lib/agenda/apiComisiones";
import ReportesAgenda from "./ReportesAgenda";

const REPORTE: ReporteAgenda = {
  desde: "2026-09-22",
  hasta: "2026-10-21",
  sucursalId: null,
  produccion: [
    {
      recursoId: 1,
      nombre: "Ana",
      color: "#7357B8",
      produccion: 350,
      produccionServicios: 350,
      produccionProductos: 0,
      servicios: 3,
      clientes: 3,
      ticketMedio: 116.67,
    },
  ],
  serviciosTop: [
    { servicioId: 100, servicio: "Corte", pedidos: 4, cobrados: 2, ingresos: 100 },
    { servicioId: 101, servicio: "Tinte", pedidos: 1, cobrados: 1, ingresos: 250 },
  ],
  asistencia: {
    total: 6,
    completadas: 2,
    noShows: 1,
    canceladas: 1,
    abandonadas: 0,
    pendientes: 2,
    tasaNoShow: 16.7,
    tasaCancelacion: 16.7,
    porOrigen: [
      { origen: "INTERNA", total: 6, noShows: 1 },
      { origen: "ONLINE", total: 0, noShows: 0 },
      { origen: "WALKIN", total: 0, noShows: 0 },
    ],
  },
  ticketMedio: { ventas: 3, total: 350, ticketMedio: 116.67 },
  ocupacion: {
    minutosDisponibles: 1440,
    minutosReservados: 150,
    pct: 10.4,
    recursos: [
      {
        recursoId: 1,
        nombre: "Ana",
        color: "#7357B8",
        minutosDisponibles: 1440,
        minutosReservados: 150,
        pct: 10.4,
        dias: [],
      },
    ],
  },
  retencion: { dias: 90, clientes: 2, volvieron: 1, pct: 50, nuevos: 2, recurrentes: 0, ventanaAbierta: 1 },
};

async function montar() {
  render(
    <MemoryRouter>
      <ReportesAgenda />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T15:00:00.000Z"));
  vi.mocked(apiComisiones.reporteAgenda).mockResolvedValue(REPORTE);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reportes de agenda", () => {
  it("pide los últimos 30 días con retención a 90 y dibuja cada bloque", async () => {
    await montar();
    expect(apiComisiones.reporteAgenda).toHaveBeenCalledWith({
      desde: "2026-09-22",
      hasta: "2026-10-21",
      diasRetencion: 90,
    });
    // Las tarjetas de arriba: ticket medio y tasa de no-shows.
    expect(screen.getAllByText("Ticket medio")[0].parentElement?.parentElement).toHaveTextContent("116,67");
    expect(screen.getByText("No-shows").parentElement?.parentElement).toHaveTextContent("16,7%");
    expect(screen.getByRole("region", { name: "Producción por profesional" })).toHaveTextContent("Ana");
    const top = screen.getByRole("region", { name: "Servicios más pedidos" });
    expect(within(top).getAllByRole("listitem")[0]).toHaveTextContent("Corte");
    expect(screen.getByRole("region", { name: "Ocupación por profesional" })).toHaveTextContent("10,4%");
    const ret = screen.getByRole("region", { name: "Retención" });
    expect(ret).toHaveTextContent("1 (50%)");
    expect(ret).toHaveTextContent("1 todavía pueden volver");
  });

  it("cambiar el rango o la ventana vuelve a pedir", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "7 días" }));
    await act(async () => {});
    expect(apiComisiones.reporteAgenda).toHaveBeenLastCalledWith({
      desde: "2026-10-15",
      hasta: "2026-10-21",
      diasRetencion: 90,
    });
    fireEvent.change(screen.getByLabelText("Ventana"), { target: { value: "30" } });
    await act(async () => {});
    expect(apiComisiones.reporteAgenda).toHaveBeenLastCalledWith({
      desde: "2026-10-15",
      hasta: "2026-10-21",
      diasRetencion: 30,
    });
  });
});
