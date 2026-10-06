import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConfigComision,
  PreviaLiquidacion,
  ResumenComisiones,
} from "../../../lib/agenda/tiposComisiones";

/**
 * Comisiones (fase 2): producción, liquidación con adelantos y porcentajes,
 * con la API mockeada. Quién ve cada pestaña sale de los permisos.
 */

const auth = vi.hoisted(() => ({
  usuario: {
    id: 1,
    rol: "ADMIN",
    permisos: ["comisiones.ver", "comisiones.liquidar"],
    permisosPropios: [] as string[],
  },
  negocio: { id: 3, nombre: "Salón", tipoNegocio: "PELUQUERIA", features: ["agenda", "comisiones", "gastos"] },
}));

vi.mock("../../../store/AuthContext", () => ({ useAuth: () => auth }));

vi.mock("../../../lib/agenda/apiComisiones", () => ({
  apiComisiones: {
    resumen: vi.fn(),
    detalle: vi.fn(),
    previa: vi.fn(),
    liquidar: vi.fn(),
    liquidaciones: vi.fn(),
    liquidacion: vi.fn(),
    adelantos: vi.fn(),
    crearAdelanto: vi.fn(),
    anularAdelanto: vi.fn(),
    config: vi.fn(),
    guardarConfig: vi.fn(),
    bitacora: vi.fn(),
  },
}));

import { apiComisiones } from "../../../lib/agenda/apiComisiones";
import Comisiones from "./Comisiones";

const RESUMEN: ResumenComisiones = {
  desde: "2026-10-19",
  hasta: "2026-10-25",
  sucursalId: null,
  profesionales: [
    {
      recursoId: 7,
      nombre: "Beto",
      color: "#7357B8",
      activo: true,
      produccion: 90,
      produccionServicios: 50,
      produccionProductos: 40,
      servicios: 1,
      comision: 19,
      porLiquidar: 19,
      adelantosPendientes: 10,
    },
  ],
  totales: { produccion: 90, comision: 19, porLiquidar: 19 },
};

const CONFIG: ConfigComision[] = [
  {
    recursoId: 7,
    nombre: "Beto",
    activo: true,
    comisionPct: 50,
    comisionProductoPct: 10,
    servicios: [{ servicioId: 100, servicio: "Corte", comisionPct: 30 }],
  },
];

const PREVIA: PreviaLiquidacion = {
  recurso: { id: 7, nombre: "Beto" },
  desde: "2026-10-19",
  hasta: "2026-10-25",
  produccion: 90,
  comision: 19,
  ajustes: 0,
  adelantos: 10,
  saldoAnterior: 0,
  neto: 9,
  lineas: [
    {
      ventaDetalleId: 1,
      ventaId: 1,
      comprobante: "V-1",
      fecha: "2026-10-21T14:00:00.000Z",
      productoId: 100,
      descripcion: "Corte",
      esServicio: true,
      cantidad: 1,
      subtotal: 50,
      comisionPct: 30,
      comision: 15,
      congelada: true,
      liquidacionId: null,
    },
  ],
  lineasAjuste: [],
  adelantosPendientes: [{ id: 4, fecha: "2026-10-20", monto: 10, nota: "pasaje" }],
  atrasadas: 0,
};

async function montar(pestana?: string) {
  render(
    <MemoryRouter initialEntries={[`/comisiones${pestana ? `?pestana=${pestana}` : ""}`]}>
      <Comisiones />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  // Miércoles 21-oct-2026 en La Paz.
  vi.setSystemTime(new Date("2026-10-21T15:00:00.000Z"));
  auth.usuario.rol = "ADMIN";
  auth.usuario.permisos = ["comisiones.ver", "comisiones.liquidar"];
  vi.mocked(apiComisiones.resumen).mockResolvedValue(RESUMEN);
  vi.mocked(apiComisiones.config).mockResolvedValue(CONFIG);
  vi.mocked(apiComisiones.previa).mockResolvedValue(PREVIA);
  vi.mocked(apiComisiones.bitacora).mockResolvedValue([]);
  vi.mocked(apiComisiones.adelantos).mockResolvedValue([]);
  vi.mocked(apiComisiones.liquidaciones).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("comisiones", () => {
  it("producción de la semana: pide el período de lunes a domingo y muestra la fila", async () => {
    await montar();
    expect(apiComisiones.resumen).toHaveBeenCalledWith({ desde: "2026-10-19", hasta: "2026-10-25" });
    const tabla = screen.getByRole("region", { name: "Producción por profesional" });
    expect(within(tabla).getByText("Beto")).toBeInTheDocument();
    expect(within(tabla).getAllByText(/19,00/).length).toBeGreaterThan(0);

    // La quincena del 16 al 31.
    fireEvent.click(screen.getByRole("button", { name: "Quincena" }));
    await act(async () => {});
    expect(apiComisiones.resumen).toHaveBeenLastCalledWith({ desde: "2026-10-16", hasta: "2026-10-31" });
  });

  it("liquidar: muestra el neto con el adelanto descontado y cierra con el gasto", async () => {
    vi.mocked(apiComisiones.liquidar).mockResolvedValue({
      id: 9,
      recursoId: 7,
      recurso: "Beto",
      periodo: "SEMANA",
      desde: "2026-10-19",
      hasta: "2026-10-25",
      produccion: 90,
      comision: 19,
      ajustes: 0,
      adelantos: 10,
      saldoAnterior: 0,
      neto: 9,
      nota: null,
      gastoId: 33,
      cerradaEn: "2026-10-21T15:00:00.000Z",
      cerradaPor: "admin",
      lineas: [],
      adelantosDescontados: [],
    });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Liquidar a Beto" }));
    await act(async () => {});
    expect(apiComisiones.previa).toHaveBeenCalledWith({ recursoId: 7, desde: "2026-10-19", hasta: "2026-10-25" });
    const seccion = screen.getByRole("region", { name: "Liquidación a cerrar" });
    expect(within(seccion).getByText("A pagar").nextSibling).toHaveTextContent("9,00");
    expect(within(seccion).getByText(/pasaje/)).toBeInTheDocument();

    fireEvent.click(within(seccion).getByRole("checkbox", { name: /Registrar el pago como gasto/ }));
    fireEvent.click(within(seccion).getByRole("button", { name: "Cerrar liquidación" }));
    const confirmar = screen.getByRole("dialog", { name: "¿Cerrar la liquidación?" });
    await act(async () => {
      fireEvent.click(within(confirmar).getByRole("button", { name: "Cerrar liquidación" }));
    });
    expect(apiComisiones.liquidar).toHaveBeenCalledWith({
      recursoId: 7,
      desde: "2026-10-19",
      hasta: "2026-10-25",
      periodo: "SEMANA",
      nota: null,
      registrarGasto: true,
      metodoPago: "EFECTIVO",
    });
    expect(screen.getByText(/Liquidación de Beto cerrada/)).toHaveTextContent("(registrada en Gastos)");
  });

  it("un período ya liquidado muestra el motivo del backend", async () => {
    vi.mocked(apiComisiones.previa).mockRejectedValue(
      new Error("Ese período se pisa con una liquidación ya cerrada (2026-10-19 a 2026-10-25)."),
    );
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Liquidar a Beto" }));
    await act(async () => {});
    expect(screen.getByText(/se pisa con una liquidación ya cerrada/)).toBeInTheDocument();
  });

  it("porcentajes: guarda base, productos y el propio del servicio", async () => {
    vi.mocked(apiComisiones.guardarConfig).mockResolvedValue(CONFIG[0]);
    await montar("porcentajes");
    const form = screen.getByRole("region", { name: "Porcentajes de Beto" });
    fireEvent.change(within(form).getByLabelText("% de Corte"), { target: { value: "35" } });
    fireEvent.change(within(form).getByLabelText(/Comisión sobre productos/), { target: { value: "" } });
    await act(async () => {
      fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    });
    expect(apiComisiones.guardarConfig).toHaveBeenCalledWith(7, {
      comisionPct: 50,
      comisionProductoPct: null,
      servicios: [{ servicioId: 100, comisionPct: 35 }],
    });
  });

  it("un % fuera de 0 a 100 no se manda", async () => {
    await montar("porcentajes");
    const form = screen.getByRole("region", { name: "Porcentajes de Beto" });
    fireEvent.change(within(form).getByLabelText(/Comisión sobre servicios/), { target: { value: "120" } });
    await act(async () => {
      fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    });
    expect(within(form).getByText(/van de 0 a 100/)).toBeInTheDocument();
    expect(apiComisiones.guardarConfig).not.toHaveBeenCalled();
  });

  it("adelantos: registra uno nuevo", async () => {
    vi.mocked(apiComisiones.crearAdelanto).mockResolvedValue({
      id: 5,
      recursoId: 7,
      recurso: "Beto",
      fecha: "2026-10-21",
      monto: 50,
      nota: null,
      liquidacionId: null,
      anulado: false,
      registradoPor: "admin",
      creadoEn: "2026-10-21T15:00:00.000Z",
    });
    await montar("adelantos");
    fireEvent.click(screen.getByRole("button", { name: "Nuevo adelanto" }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog", { name: "Nuevo adelanto" });
    fireEvent.change(within(dialogo).getByLabelText("Profesional"), { target: { value: "7" } });
    fireEvent.change(within(dialogo).getByLabelText("Monto (Bs)"), { target: { value: "50" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Registrar" }));
    });
    expect(apiComisiones.crearAdelanto).toHaveBeenCalledWith({
      recursoId: 7,
      fecha: "2026-10-21",
      monto: 50,
      nota: null,
    });
  });

  it("el encargado mira pero no liquida, no da adelantos ni cambia porcentajes", async () => {
    auth.usuario.rol = "SUPERVISOR";
    auth.usuario.permisos = ["comisiones.ver"];
    await montar("porcentajes");
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Producción", "Adelantos", "Liquidaciones"]);
    expect(screen.queryByRole("button", { name: "Liquidar a Beto" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Adelantos" }));
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Nuevo adelanto" })).not.toBeInTheDocument();
  });
});
