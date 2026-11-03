import type { ComponentProps, ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mesa } from "../../types/salon";

/**
 * La caja cobra una mesa del salón (SAL-01 / COB-12 y SAL-08 / COB-13): la
 * propina de la mesa llega al backend, viaja el total que la cajera tiene en
 * pantalla y, si el mesero le sumó algo en el medio, la cuenta se recarga con
 * un aviso que dice qué pasó. El POS entero, con las pantallas de mentira:
 * lo que se prueba es lo que decide el POS. Salvo al final, con la pantalla de
 * cobro de verdad: qué queda de lo que la cajera ya marcó en ella cuando el
 * POS le recarga la cuenta.
 */

const datos = vi.hoisted(() => ({ mesa: null as unknown as Mesa, pantallaDeVerdad: false }));

function mesa(p: Partial<Mesa> = {}): Mesa {
  return {
    id: 4,
    codigo: "M4",
    nombre: "Mesa M4",
    zonaCodigo: "salon",
    zonaNombre: "Salón",
    capacidad: 4,
    capacidadTotal: 4,
    unidas: [],
    activa: true,
    estado: "CUENTA",
    meseroId: 7,
    meseroNombre: "Luis",
    comensales: 2,
    consumo: 197,
    propina: 0,
    comandas: [],
    ...p,
  };
}
datos.mesa = mesa();

vi.mock("../../store/AuthContext", async () => {
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({
      negocio: { id: 1, nombre: "Resto Bar", features: ["pos", "salon"] },
      usuario: { id: 1, username: "caja", rol: "CAJERO", ...permisosDe("CAJERO") },
      rubro: "RESTAURANTE",
      incluye: () => true,
      puede: (s: string) => s !== "hoy",
      cupo: undefined,
      licencia: null,
      actualizarCupo: vi.fn(),
      refrescarCupo: vi.fn(async () => {}),
    }),
  };
});

vi.mock("../../lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    cajaActual: vi.fn(async () => ({
      caja: { id: 1, almacenId: 1, almacen: null, fechaApertura: "2026-10-28T12:00:00.000Z", montoApertura: 0 },
    })),
    getProductos: vi.fn(async () => []),
    getCategorias: vi.fn(async () => []),
    getFormasPago: vi.fn(async () => []),
    getRepartidores: vi.fn(async () => []),
    mesasPorCobrar: vi.fn(async () => [datos.mesa]),
    entregasMesero: vi.fn(async () => null),
    crearVenta: vi.fn(),
    cobrarMesa: vi.fn(),
    mesa: vi.fn(),
  },
}));

vi.mock("../../lib/apiMonedero", () => ({
  apiMonedero: { paquetesCreditos: vi.fn(), comprarCreditos: vi.fn(), compraCreditos: vi.fn() },
}));
vi.mock("../../lib/agenda/apiConfigAgenda", () => ({
  apiConfigAgenda: { recursos: vi.fn(async () => []) },
}));
vi.mock("../../lib/agenda/apiAgenda", () => ({
  apiAgenda: { hoy: vi.fn(async () => ({ citas: [] })), carrito: vi.fn() },
  mensajeDe: (_e: unknown, d: string) => d,
}));

vi.mock("./PantallaVenta", () => ({
  default: (props: { cabecera?: ReactNode }) => <div>{props.cabecera}</div>,
}));

vi.mock("./MesasPorCobrar", () => ({
  default: (p: { onCobrar: (m: Mesa) => void }) => (
    <button onClick={() => p.onCobrar(datos.mesa)}>cobrar la M4</button>
  ),
}));

// El cobro: dice qué cobra y con qué, y paga justo el total (con o sin la
// propina de la mesa, como la manda la pantalla de verdad). Con
// `datos.pantallaDeVerdad`, es la de verdad.
vi.mock("./PantallaCobro", async (importOriginal) => {
  const { default: PantallaCobroDeVerdad } = await importOriginal<typeof import("./PantallaCobro")>();
  return {
    default: (props: ComponentProps<typeof PantallaCobroDeVerdad>) =>
      datos.pantallaDeVerdad ? (
        <PantallaCobroDeVerdad {...props} />
      ) : (
        <div>
          <p>
            cobro de {props.subtitulo ?? "mostrador"} por {props.total} ({props.cobroDeMesa ?? "sin mesa"})
          </p>
          {props.error && <p>error: {props.error}</p>}
          <button onClick={() => props.onConfirmar([{ formaPagoId: 1, monto: props.total }], { propinaMesa: 5 })}>
            pagar con propina
          </button>
          <button onClick={() => props.onConfirmar([{ formaPagoId: 1, monto: props.total }])}>pagar</button>
        </div>
      ),
  };
});

// El QR del negocio: sólo el botón con el que la cajera dice que la plata
// llegó, con el monto que tenía que llegar.
vi.mock("../../components/QrCobro", () => ({
  QrParaCobrar: (p: { confirmado: boolean; onConfirmar: () => void; monto?: string }) => (
    <button onClick={p.onConfirmar} disabled={p.confirmado}>
      {p.confirmado ? `Pago confirmado (${p.monto})` : `Confirmar pago recibido (${p.monto})`}
    </button>
  ),
}));

vi.mock("../../lib/belleza/apiExtras", () => ({
  apiExtras: { consultarVale: vi.fn(), formaPagoVale: vi.fn() },
}));

vi.mock("./PantallaRecibo", () => ({ default: () => <p>recibo</p> }));

import { api } from "../../lib/api";
import Pos from "./Pos";

async function irAlCobroDeLaMesa() {
  render(
    <MemoryRouter initialEntries={["/pos"]}>
      <Pos />
    </MemoryRouter>,
  );
  await act(async () => {});
  await act(async () => {});
  fireEvent.click(await screen.findByText("1 mesa esperando cobro"));
  fireEvent.click(screen.getByText("cobrar la M4"));
}

async function tocar(texto: string) {
  await act(async () => {
    fireEvent.click(screen.getByText(texto));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  datos.mesa = mesa();
  datos.pantallaDeVerdad = false;
  vi.mocked(api.getFormasPago).mockResolvedValue([]);
});

describe("la caja cobra una mesa", () => {
  it("la propina y el total en pantalla llegan al backend", async () => {
    // La propina se descartaba (ni el campo había) y el total no viajaba.
    vi.mocked(api.cobrarMesa).mockResolvedValue({ id: 99, total: 197 } as never);
    await irAlCobroDeLaMesa();
    expect(screen.getByText("cobro de M4 por 197 (caja)")).toBeInTheDocument();
    await tocar("pagar con propina");

    expect(api.cobrarMesa).toHaveBeenCalledWith(4, {
      pagos: [{ formaPagoId: 1, monto: 197 }],
      propina: 5,
      totalEsperado: 197,
      clienteRequestId: expect.any(String),
    });
    expect(await screen.findByText("recibo")).toBeInTheDocument();
  });

  it("SAL-08: si la mesa cambió mientras cobraba, recarga la cuenta y dice el total nuevo", async () => {
    // Antes llegaba "Los pagos (197) deben sumar el total de la venta (217)":
    // cierto, y no le decía a la cajera qué pasó ni qué hacer.
    vi.mocked(api.cobrarMesa).mockRejectedValueOnce(
      new Error(
        "La mesa M4 cambió mientras cobrabas: ahora son Bs 217.00. Volvé a entrar a la mesa para cobrar el total nuevo.",
      ),
    );
    vi.mocked(api.mesa).mockResolvedValue(mesa({ estado: "OCUPADA", consumo: 217 }));
    await irAlCobroDeLaMesa();
    await tocar("pagar");

    expect(api.mesa).toHaveBeenCalledWith(4);
    expect(screen.getByText("cobro de M4 por 217 (caja)")).toBeInTheDocument();
    expect(
      screen.getByText(
        /^error: La cuenta de M4 cambió mientras cobrabas: ahora son Bs\s217,00\. Revisá el total con el cliente y cobrá de nuevo\.$/,
      ),
    ).toBeInTheDocument();

    // Cobrar de nuevo manda el total nuevo, con la misma identidad de cobro:
    // el intento anterior se rechazó, no se registró nada.
    vi.mocked(api.cobrarMesa).mockResolvedValueOnce({ id: 99, total: 217 } as never);
    await tocar("pagar");
    const [primero, segundo] = vi.mocked(api.cobrarMesa).mock.calls.map((c) => c[1]);
    expect(segundo.totalEsperado).toBe(217);
    expect(segundo.clienteRequestId).toBe(primero.clienteRequestId);
  });

  it("si no puede releer la mesa, queda el mensaje del backend", async () => {
    vi.mocked(api.cobrarMesa).mockRejectedValueOnce(
      new Error(
        "La mesa M4 cambió mientras cobrabas: ahora son Bs 217.00. Volvé a entrar a la mesa para cobrar el total nuevo.",
      ),
    );
    vi.mocked(api.mesa).mockRejectedValue(new Error("403"));
    await irAlCobroDeLaMesa();
    await tocar("pagar");
    expect(screen.getByText(/^error: La mesa M4 cambió mientras cobrabas/)).toBeInTheDocument();
    expect(screen.getByText("cobro de M4 por 197 (caja)")).toBeInTheDocument();
  });
});

describe("la cuenta recargada, con la pantalla de cobro de verdad", () => {
  beforeEach(() => {
    datos.pantallaDeVerdad = true;
    vi.mocked(api.getFormasPago).mockResolvedValue([
      { id: 10, nombre: "Efectivo" },
      { id: 11, nombre: "QR" },
    ]);
  });

  async function confirmarCobro() {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Confirmar cobro/ }));
    });
  }

  it("el QR confirmado por la cuenta vieja no vale para la nueva: se confirma de nuevo", async () => {
    // Revisión del 29-oct: la cajera confirmaba el QR por Bs 197, llegaba el
    // "cambió mientras cobrabas" y la pantalla seguía en "Pago confirmado" con
    // la cuenta ya en Bs 217. "Confirmar cobro" mandaba 217 por QR sin que
    // nadie hubiera visto en el banco los Bs 20 de diferencia.
    vi.mocked(api.cobrarMesa).mockRejectedValueOnce(
      new Error(
        "La mesa M4 cambió mientras cobrabas: ahora son Bs 217.00. Volvé a entrar a la mesa para cobrar el total nuevo.",
      ),
    );
    vi.mocked(api.mesa).mockResolvedValue(mesa({ estado: "OCUPADA", consumo: 217 }));
    await irAlCobroDeLaMesa();
    fireEvent.click(screen.getByRole("button", { name: "QR" }));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar pago recibido \(Bs\s197,00\)/ }));
    await confirmarCobro();
    expect(api.cobrarMesa).toHaveBeenCalledTimes(1);

    // La cuenta nueva, con el aviso a la vista y nada confirmado.
    expect(screen.getByRole("button", { name: /Confirmar cobro · Bs\s217,00/ })).toBeInTheDocument();
    expect(screen.getByText(/La cuenta de M4 cambió mientras cobrabas: ahora son Bs\s217,00/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pago confirmado/ })).not.toBeInTheDocument();

    // Cobrar en el acto no manda nada: el cobro arrancó de nuevo, como al
    // volver a entrar a la mesa.
    await confirmarCobro();
    expect(api.cobrarMesa).toHaveBeenCalledTimes(1);

    // Por QR, el pago de la cuenta nueva está por confirmar.
    fireEvent.click(screen.getByRole("button", { name: "QR" }));
    await confirmarCobro();
    expect(screen.getByText("Confirmá que el pago por QR llegó antes de cobrar.")).toBeInTheDocument();
    expect(api.cobrarMesa).toHaveBeenCalledTimes(1);

    // Confirmado el de Bs 217, sale el cobro nuevo.
    vi.mocked(api.cobrarMesa).mockResolvedValueOnce({ id: 99, total: 217 } as never);
    fireEvent.click(screen.getByRole("button", { name: /Confirmar pago recibido \(Bs\s217,00\)/ }));
    await confirmarCobro();
    expect(vi.mocked(api.cobrarMesa).mock.calls[1][1]).toMatchObject({
      pagos: [{ formaPagoId: 11, monto: 217 }],
      totalEsperado: 217,
    });
    expect(await screen.findByText("recibo")).toBeInTheDocument();
  });
});
