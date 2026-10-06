import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Vale, ValeDetalle } from "../../lib/belleza/apiExtras";

/**
 * Gift cards: vender un vale (el cobro entra a la caja), consultar el saldo,
 * el listado con lo que el negocio todavía debe en servicios, y anular uno
 * sin usar (sólo un encargado).
 */

const sesion = vi.hoisted(() => ({ rol: "CAJERO" as string, permisos: ["vales.vender"] as string[] }));

vi.mock("../../store/AuthContext", () => {
  const valor = () => ({
    negocio: { id: 1, tipoNegocio: "SPA", features: ["gift_cards"] },
    usuario: { id: 1, username: "u", rol: sesion.rol, permisos: sesion.permisos, permisosPropios: [] },
  });
  return { useAuth: valor, useAuthOpcional: valor };
});

vi.mock("../../lib/api", () => ({
  api: { getFormasPago: vi.fn() },
}));

vi.mock("../../lib/belleza/apiExtras", () => ({
  apiExtras: {
    vales: vi.fn(),
    vale: vi.fn(),
    consultarVale: vi.fn(),
    emitirVale: vi.fn(),
    anularVale: vi.fn(),
  },
}));

import { api } from "../../lib/api";
import { apiExtras } from "../../lib/belleza/apiExtras";
import GiftCards from "./GiftCards";

const vale = (over: Partial<Vale> = {}): Vale => ({
  id: 5,
  codigo: "K7QM-2XPA",
  montoInicial: 200,
  saldo: 80,
  venceEn: "2026-12-31",
  estado: "USABLE",
  beneficiario: "María",
  comprador: null,
  nota: null,
  formaPago: "Efectivo",
  creadoEn: "2026-10-06T10:00:00Z",
  anuladaEn: null,
  motivoAnulacion: null,
  ...over,
});

const detalle = (over: Partial<ValeDetalle> = {}): ValeDetalle => ({
  ...vale(),
  movimientos: [
    { id: 1, tipo: "EMISION", monto: 200, saldoDespues: 200, fecha: "2026-10-06T10:00:00Z", venta: null },
    {
      id: 2,
      tipo: "USO",
      monto: -120,
      saldoDespues: 80,
      fecha: "2026-10-06T11:00:00Z",
      venta: { id: 9, comprobante: "V-000009", estado: "APROBADO" },
    },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  sesion.rol = "CAJERO";
  sesion.permisos = ["vales.vender"];
  vi.mocked(apiExtras.vales).mockResolvedValue({ vales: [vale()], saldoVigente: 80, vigentes: 1 });
  vi.mocked(api.getFormasPago).mockResolvedValue([
    { id: 10, nombre: "Efectivo" },
    { id: 11, nombre: "QR" },
  ]);
});

async function montar() {
  render(
    <MemoryRouter>
      <GiftCards />
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("Gift cards", () => {
  it("lista los vales con su saldo y lo que se debe en servicios", async () => {
    await montar();
    expect(apiExtras.vales).toHaveBeenCalledWith("USABLES", undefined);
    const lista = screen.getByRole("list", { name: "Vales" });
    expect(within(lista).getByText("K7QM-2XPA")).toBeInTheDocument();
    expect(within(lista).getByText(/Para María · vence 31\/12\/2026/)).toBeInTheDocument();
    expect(screen.getByText("1 vales con saldo · es servicio que el negocio debe")).toBeInTheDocument();
  });

  it("vende un vale en efectivo con su cambio y muestra el código", async () => {
    vi.mocked(apiExtras.emitirVale).mockResolvedValue({ ...vale({ saldo: 150, montoInicial: 150 }), cambio: 50 });
    await montar();
    fireEvent.click(screen.getByText("Vender vale"));
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Monto del vale"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("Efectivo recibido"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Para quién"), { target: { value: "María" } });
    await act(async () => {
      fireEvent.click(screen.getByText(/Cobrar Bs/));
    });
    expect(apiExtras.emitirVale).toHaveBeenCalledWith(
      expect.objectContaining({ monto: 150, formaPagoId: 10, recibido: 200, beneficiario: "María" }),
    );
    expect(vi.mocked(apiExtras.emitirVale).mock.calls[0][0].clienteRequestId).toBeTruthy();
    expect(screen.getByText("Vale vendido")).toBeInTheDocument();
    expect(screen.getByText(/Cambio/)).toHaveTextContent("50,00");
  });

  it("consulta el saldo por código", async () => {
    vi.mocked(apiExtras.consultarVale).mockResolvedValue(vale());
    await montar();
    fireEvent.change(screen.getByLabelText("Código del vale"), { target: { value: "k7qm2xpa" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Ver"));
    });
    expect(apiExtras.consultarVale).toHaveBeenCalledWith("K7QM2XPA");
    expect(screen.getByText("Saldo").parentElement ?? screen.getByText(/Saldo/)).toHaveTextContent("80,00");
  });

  it("el detalle muestra el historial; el cajero no lo puede anular", async () => {
    vi.mocked(apiExtras.vale).mockResolvedValue(detalle());
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByText("K7QM-2XPA"));
    });
    const historial = screen.getByRole("list", { name: "Historial del vale" });
    expect(within(historial).getByText(/Usado en V-000009/)).toBeInTheDocument();
    expect(screen.queryByText("Anular vale")).not.toBeInTheDocument();
  });

  it("el encargado anula un vale sin usar y le dice cuánto devolver", async () => {
    sesion.rol = "SUPERVISOR";
    sesion.permisos = ["vales.vender", "vales.anular"];
    const sinUsar = detalle({ saldo: 60, movimientos: [detalle().movimientos[0]] });
    vi.mocked(apiExtras.vale).mockResolvedValue(sinUsar);
    vi.mocked(apiExtras.anularVale).mockResolvedValue({
      ...sinUsar,
      estado: "ANULADA",
      saldo: 0,
      devolucion: { monto: 60, desdeCaja: true, formaPago: "Efectivo" },
    });
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByText("K7QM-2XPA"));
    });
    fireEvent.click(screen.getByText("Anular vale"));
    await act(async () => {
      fireEvent.click(screen.getByText("Anular"));
    });
    expect(apiExtras.anularVale).toHaveBeenCalledWith(5, expect.any(String));
    expect(screen.getByText(/Devolvé Bs.60,00 en efectivo/)).toBeInTheDocument();
  });

  it("QA N2-18: un vale cuyo uso se devolvió (venta anulada) se puede anular", async () => {
    sesion.rol = "SUPERVISOR";
    sesion.permisos = ["vales.vender", "vales.anular"];
    const base = detalle().movimientos;
    vi.mocked(apiExtras.vale).mockResolvedValue(
      detalle({
        saldo: 200,
        movimientos: [
          ...base,
          {
            id: 3,
            tipo: "DEVOLUCION",
            monto: 120,
            saldoDespues: 200,
            fecha: "2026-10-06T12:00:00Z",
            venta: { id: 9, comprobante: "V-000009", estado: "ANULADO" },
          },
        ],
      }),
    );
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByText("K7QM-2XPA"));
    });
    expect(screen.getByText("Anular vale")).toBeInTheDocument();
  });
});
