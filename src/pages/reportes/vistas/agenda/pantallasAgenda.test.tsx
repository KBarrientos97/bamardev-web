import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReporteAgenda } from "../../../../lib/agenda/tiposComisiones";
import { ContextoReporte, type DatosReporte } from "../../contexto";

/**
 * Los reportes de la agenda dentro de Reportes: piden el período y la
 * sucursal de arriba, y cada uno dibuja su parte de la misma respuesta.
 */

vi.mock("../../../../lib/agenda/apiComisiones", () => ({
  apiComisiones: { reporteAgenda: vi.fn() },
}));

import { apiComisiones } from "../../../../lib/agenda/apiComisiones";
import { Asistencia, OcupacionAgenda, Profesionales, Retencion, Servicios } from "./VistasAgenda";

const contexto: DatosReporte = {
  periodo: { preset: "mes", desde: "2026-10-01", hasta: "2026-10-12" },
  comparacion: { desde: "2026-09-01", hasta: "2026-09-12", contra: "1–12 de septiembre", leyenda: "1–12 de septiembre" },
  rango: { desde: "2026-10-01", hasta: "2026-10-12", sucursalId: 4 },
  rangoAnterior: { desde: "2026-09-01", hasta: "2026-09-12", sucursalId: 4 },
  sucursalNombre: "Centro",
  registrarExportacion: vi.fn(),
  veReporte: () => true,
};

const REPORTE: ReporteAgenda = {
  desde: "2026-10-01",
  hasta: "2026-10-12",
  sucursalId: 4,
  produccion: [
    { recursoId: 1, nombre: "Ana", color: "#7357B8", produccion: 350, produccionServicios: 300, produccionProductos: 50, servicios: 3, clientes: 3, ticketMedio: 116.67 },
    { recursoId: 2, nombre: "Beto", color: "#2A93D5", produccion: 200, produccionServicios: 200, produccionProductos: 0, servicios: 2, clientes: 2, ticketMedio: 100 },
  ],
  serviciosTop: [
    { servicioId: 10, servicio: "Corte", pedidos: 30, cobrados: 28, ingresos: 900 },
    { servicioId: 11, servicio: "Color", pedidos: 8, cobrados: 8, ingresos: 2400 },
  ],
  asistencia: {
    total: 20,
    completadas: 14,
    noShows: 2,
    canceladas: 3,
    abandonadas: 0,
    pendientes: 1,
    tasaNoShow: 10,
    tasaCancelacion: 15,
    porOrigen: [
      { origen: "INTERNA", total: 12, noShows: 1 },
      { origen: "ONLINE", total: 8, noShows: 1 },
      { origen: "WALKIN", total: 0, noShows: 0 },
    ],
  },
  ticketMedio: { ventas: 5, total: 550, ticketMedio: 110 },
  ocupacion: {
    minutosDisponibles: 1200,
    minutosReservados: 540,
    pct: 45,
    recursos: [
      { recursoId: 1, nombre: "Ana", color: "#7357B8", minutosDisponibles: 600, minutosReservados: 360, pct: 60, dias: [] },
      { recursoId: 2, nombre: "Beto", color: "#2A93D5", minutosDisponibles: 600, minutosReservados: 180, pct: 30, dias: [] },
    ],
  },
  retencion: { dias: 90, clientes: 10, volvieron: 4, pct: 40, nuevos: 6, recurrentes: 4, ventanaAbierta: 3 },
};

async function montar(vista: ReactNode) {
  render(
    <MemoryRouter>
      <ContextoReporte.Provider value={contexto}>{vista}</ContextoReporte.Provider>
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiComisiones.reporteAgenda).mockResolvedValue(REPORTE);
});

describe("reportes de la agenda", () => {
  it("producción: pide el período y la sucursal de arriba, con el ticket medio y cada profesional", async () => {
    await montar(<Profesionales />);
    expect(apiComisiones.reporteAgenda).toHaveBeenCalledWith({ desde: "2026-10-01", hasta: "2026-10-12", sucursalId: 4, diasRetencion: 90 });
    expect(screen.getByText("Bs 110,00")).toBeInTheDocument();
    expect(screen.getByText("5 citas cobradas")).toBeInTheDocument();
    expect(screen.getAllByText("Beto").length).toBeGreaterThan(0);
  });

  it("servicios: el más pedido y el que más deja", async () => {
    await montar(<Servicios />);
    expect(screen.getByText("El más pedido")).toBeInTheDocument();
    expect(screen.getAllByText("Corte").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Color").length).toBeGreaterThan(0);
  });

  it("asistencia: las tasas del backend y los orígenes con citas", async () => {
    await montar(<Asistencia />);
    expect(screen.getByText("10 %")).toBeInTheDocument();
    expect(screen.getByText("15 %")).toBeInTheDocument();
    expect(screen.getByText("Reserva online")).toBeInTheDocument();
    expect(screen.queryByText("Sin turno")).toBeNull();
  });

  it("ocupación: la general y la de cada profesional, en horas", async () => {
    await montar(<OcupacionAgenda />);
    expect(screen.getByText("45 %")).toBeInTheDocument();
    expect(screen.getByText("9 h de 20 h")).toBeInTheDocument();
    expect(screen.getByText("Horas libres")).toBeInTheDocument();
  });

  it("retención: cambia la ventana sin tocar el período, y avisa lo que todavía puede subir", async () => {
    await montar(<Retencion />);
    expect(screen.getByText("40 %")).toBeInTheDocument();
    expect(screen.getByText(/3 clientes todavía pueden volver/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "30 días" }));
    });
    expect(apiComisiones.reporteAgenda).toHaveBeenLastCalledWith({ desde: "2026-10-01", hasta: "2026-10-12", sucursalId: 4, diasRetencion: 30 });
  });

  it("un porcentaje que el backend no puede calcular es una raya", async () => {
    vi.mocked(apiComisiones.reporteAgenda).mockResolvedValue({ ...REPORTE, ticketMedio: { ventas: 0, total: 0, ticketMedio: null } });
    await montar(<Profesionales />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
