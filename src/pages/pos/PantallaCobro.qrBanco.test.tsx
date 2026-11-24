import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El QR del banco en la caja (PLAN-QR-AUTOMATICO D4): con cuenta del banco, el
 * QR sale por el monto exacto y el cobro NO se puede registrar hasta que el
 * banco avisa; al vender viaja el `pagoQrId`. Sin cuenta del banco, o en una
 * pantalla que no lo pide (la mesa), es el QR de siempre con confirmación a
 * mano. Y cambiar de método o salir cierra el QR abierto.
 */

const sesion = vi.hoisted(() => ({ features: ["pos", "pago_qr_mixto"] as string[] }));

vi.mock("../../store/AuthContext", async () => {
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({
      negocio: { id: 1, tipoNegocio: "ACADEMIA", features: sesion.features },
      usuario: { id: 1, username: "recepcion", rol: "CAJERO", ...permisosDe("CAJERO") },
      incluye: (f: string) => sesion.features.includes(f),
    }),
  };
});

vi.mock("../../lib/belleza/apiExtras", () => ({
  apiExtras: { consultarVale: vi.fn(), formaPagoVale: vi.fn() },
}));

vi.mock("../../lib/api", () => ({
  api: {
    cobroQrDisponible: vi.fn(),
    crearCobroQr: vi.fn(),
    estadoCobroQr: vi.fn(),
    verificarCobroQr: vi.fn(),
    anularCobroQr: vi.fn(),
  },
}));

// El QR fijo y el del banco, en versión mínima: lo que importa es lo que la
// pantalla de cobro le pasa y decide con eso.
vi.mock("../../components/QrCobro", () => ({
  QrParaCobrar: ({
    onConfirmar,
    banco,
  }: {
    onConfirmar: () => void;
    banco?: { manda: boolean; estado: string; imagen: string | null };
  }) =>
    banco?.manda ? (
      <p>
        QR del banco: {banco.estado}
        {banco.imagen ? <img src={banco.imagen} alt="QR del banco" /> : null}
      </p>
    ) : (
      <button onClick={onConfirmar}>Ya llegó el QR</button>
    ),
}));

import { api } from "../../lib/api";
import PantallaCobro from "./PantallaCobro";

const FORMAS = [
  { id: 10, nombre: "Efectivo" },
  { id: 11, nombre: "QR" },
];
const COBRO = { id: 7, monto: 200, venceEn: "2099-01-01T00:00:00Z", imagenQr: "data:image/png;base64,AAAA" };

function montar(opc: { qrBanco?: boolean } = { qrBanco: true }) {
  const onConfirmar = vi.fn();
  render(
    <PantallaCobro total={200} formasPago={FORMAS} onAtras={() => {}} onConfirmar={onConfirmar} enviando={false} error="" {...opc} />,
  );
  return onConfirmar;
}

const metodo = (m: "Efectivo" | "QR") => fireEvent.click(screen.getAllByText(m).find((el) => el.closest("button"))!);
const cobrar = () => screen.getByRole("button", { name: /Confirmar cobro/ });
const avanzar = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(api.cobroQrDisponible).mockResolvedValue({ automatico: true });
  vi.mocked(api.crearCobroQr).mockResolvedValue(COBRO);
  vi.mocked(api.estadoCobroQr).mockResolvedValue({ id: 7, estado: "PENDIENTE", monto: 200, venceEn: COBRO.venceEn, pagadoEn: null });
  vi.mocked(api.anularCobroQr).mockResolvedValue({ id: 7, estado: "ANULADO", monto: 200, venceEn: COBRO.venceEn, pagadoEn: null });
});
afterEach(() => vi.useRealTimers());

describe("El QR del banco en la caja", () => {
  it("con cuenta del banco, pide el QR por el monto exacto y no deja cobrar hasta que el banco avisa", async () => {
    const onConfirmar = montar();
    await avanzar(0);
    metodo("QR");
    await avanzar(800);
    expect(api.crearCobroQr).toHaveBeenCalledWith(200);
    expect(screen.getByRole("img", { name: "QR del banco" })).toBeInTheDocument();
    expect(screen.getByText(/QR del banco: esperando/)).toBeInTheDocument();

    // Mientras no pague, el botón está apagado y no registra nada.
    expect(cobrar()).toBeDisabled();
    fireEvent.click(cobrar());
    expect(onConfirmar).not.toHaveBeenCalled();

    // El banco avisa: el cobro se habilita solo y viaja el pagoQrId.
    vi.mocked(api.estadoCobroQr).mockResolvedValue({ id: 7, estado: "PAGADO", monto: 200, venceEn: COBRO.venceEn, pagadoEn: "2026-11-24T12:00:00Z" });
    await avanzar(3100);
    expect(screen.getByText(/QR del banco: pagado/)).toBeInTheDocument();
    expect(cobrar()).toBeEnabled();
    fireEvent.click(cobrar());
    expect(onConfirmar).toHaveBeenCalledWith([{ formaPagoId: 11, monto: 200, pagoQrId: 7 }]);
    // Ya está cobrado: salir de la pantalla no lo anula.
    expect(api.anularCobroQr).not.toHaveBeenCalled();
  });

  it("cambiar a efectivo cierra el QR abierto en el banco", async () => {
    montar();
    await avanzar(0);
    metodo("QR");
    await avanzar(800);
    expect(api.crearCobroQr).toHaveBeenCalledTimes(1);
    metodo("Efectivo");
    await avanzar(0);
    expect(api.anularCobroQr).toHaveBeenCalledWith(7);
  });

  it("sin cuenta del banco es el QR de siempre: confirmación a mano y sin pagoQrId", async () => {
    vi.mocked(api.cobroQrDisponible).mockResolvedValue({ automatico: false });
    const onConfirmar = montar();
    await avanzar(0);
    metodo("QR");
    await avanzar(800);
    expect(api.crearCobroQr).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Ya llegó el QR"));
    fireEvent.click(cobrar());
    expect(onConfirmar).toHaveBeenCalledWith([{ formaPagoId: 11, monto: 200 }]);
  });

  it("si el banco no puede abrir el QR, la caja sigue con el QR fijo (no queda trabada)", async () => {
    vi.mocked(api.crearCobroQr).mockRejectedValue(new Error("El pago por QR todavía no está habilitado."));
    const onConfirmar = montar();
    await avanzar(0);
    metodo("QR");
    await avanzar(800);
    fireEvent.click(screen.getByText("Ya llegó el QR"));
    fireEvent.click(cobrar());
    expect(onConfirmar).toHaveBeenCalledWith([{ formaPagoId: 11, monto: 200 }]);
  });

  it("una pantalla que no lo pide (la mesa) ni siquiera consulta al banco", async () => {
    montar({ qrBanco: false });
    await avanzar(0);
    metodo("QR");
    await avanzar(800);
    expect(api.cobroQrDisponible).not.toHaveBeenCalled();
    expect(api.crearCobroQr).not.toHaveBeenCalled();
    expect(screen.getByText("Ya llegó el QR")).toBeInTheDocument();
  });

  it("un cliente de la API sin los métodos nuevos (prueba, versión vieja) cae al QR fijo", async () => {
    vi.mocked(api.cobroQrDisponible).mockImplementation(() => {
      throw new TypeError("api.cobroQrDisponible is not a function");
    });
    montar();
    await avanzar(0);
    metodo("QR");
    await avanzar(800);
    expect(screen.getByText("Ya llegó el QR")).toBeInTheDocument();
  });
});
