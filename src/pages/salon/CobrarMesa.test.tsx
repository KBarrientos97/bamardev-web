import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mesa } from "../../types/salon";

/**
 * El mesero cobra su propia mesa (SAL-02, SAL-01, SAL-08): con la propina, el
 * aviso del efectivo que se queda, el total esperado y el recibo al terminar.
 * Con la pantalla de cobro de verdad: lo que se prueba es lo que viaja.
 */

vi.mock("../../store/AuthContext", async () => {
  const { permisosDe } = await import("../../test/sesiones");
  const features = ["pos", "salon", "mesero_cobra", "pago_qr_mixto"];
  return {
    useAuth: () => ({
      negocio: { id: 1, tipoNegocio: "RESTAURANTE", features },
      usuario: { id: 7, username: "carla", rol: "MESERO", ...permisosDe("MESERO") },
      incluye: (f: string) => features.includes(f),
    }),
  };
});

vi.mock("../../lib/api", () => ({
  api: {
    getFormasPago: vi.fn(),
    cobrarMesa: vi.fn(),
    mesa: vi.fn(),
  },
}));

vi.mock("../../components/QrCobro", () => ({
  QrParaCobrar: ({ onConfirmar }: { onConfirmar: () => void }) => (
    <button onClick={onConfirmar}>Ya llegó el QR</button>
  ),
}));

import { api } from "../../lib/api";
import CobrarMesa from "./CobrarMesa";

function mesa(p: Partial<Mesa> = {}): Mesa {
  return {
    id: 1,
    codigo: "M1",
    nombre: "Mesa M1",
    zonaCodigo: "salon",
    zonaNombre: "Salón",
    capacidad: 4,
    capacidadTotal: 4,
    unidas: [],
    activa: true,
    estado: "CUENTA",
    meseroId: 7,
    comensales: 2,
    consumo: 52,
    propina: 0,
    comandas: [],
    ...p,
  };
}

const COBRADA = mesa({
  estado: "PAGADA",
  cobro: {
    fecha: "2026-10-28T22:00:00.000Z",
    total: 52,
    pagos: [{ formaPago: "Efectivo", monto: 52, recibido: 60, entregado: 8 }],
  },
});

async function montar(props: Partial<Parameters<typeof CobrarMesa>[0]> = {}) {
  const onCobrada = vi.fn();
  const onCuentaCambiada = vi.fn();
  render(
    <CobrarMesa
      mesa={mesa()}
      onAtras={() => {}}
      onCobrada={onCobrada}
      onCuentaCambiada={onCuentaCambiada}
      {...props}
    />,
  );
  await act(async () => {});
  return { onCobrada, onCuentaCambiada };
}

const escribir = (etiqueta: RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

async function confirmar() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Confirmar cobro/ }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getFormasPago).mockResolvedValue([
    { id: 10, nombre: "Efectivo" },
    { id: 11, nombre: "QR" },
  ] as never);
  vi.mocked(api.cobrarMesa).mockResolvedValue({ id: 99 } as never);
  vi.mocked(api.mesa).mockResolvedValue(COBRADA);
});

describe("el mesero cobra su mesa", () => {
  it("manda el total como totalEsperado y la propina aparte de los pagos", async () => {
    // Sin totalEsperado, si otro le sumaba un pedido a la mesa en el medio, el
    // backend respondía "los pagos no suman el total". Y la propina no se
    // mandaba nunca: Mi turno no la veía.
    await montar();
    escribir(/Efectivo recibido/, "60");
    escribir(/Propina \(opcional\)/, "5");
    await confirmar();

    expect(api.cobrarMesa).toHaveBeenCalledWith(1, {
      pagos: [{ formaPagoId: 10, monto: 52, recibido: 60 }],
      propina: 5,
      totalEsperado: 52,
      clienteRequestId: expect.any(String),
    });
  });

  it("sin propina no la manda", async () => {
    await montar();
    escribir(/Efectivo recibido/, "52");
    await confirmar();
    expect(vi.mocked(api.cobrarMesa).mock.calls[0][1]).not.toHaveProperty("propina");
  });

  it("antes de cobrar avisa cuánto efectivo se queda y que lo entregue en caja", async () => {
    await montar();
    expect(screen.getByRole("note")).toHaveTextContent(
      /Te quedás con Bs\s52,00 en efectivo\. Entregalos en caja/,
    );

    // En mixto, sólo la parte en efectivo: lo del QR no pasa por su mano.
    fireEvent.click(screen.getByRole("button", { name: "Mixto" }));
    escribir(/Monto pagado por QR/, "20");
    expect(screen.getByRole("note")).toHaveTextContent(/Te quedás con Bs\s32,00 en efectivo/);

    // Todo por QR: no hay nada que entregar.
    fireEvent.click(screen.getByRole("button", { name: "QR" }));
    expect(screen.queryByText(/Te quedás con/)).not.toBeInTheDocument();
  });

  it("al terminar relee la mesa para abrirle el recibo al cliente", async () => {
    const { onCobrada } = await montar();
    escribir(/Efectivo recibido/, "60");
    await confirmar();
    expect(api.mesa).toHaveBeenCalledWith(1);
    expect(onCobrada).toHaveBeenCalledWith("M1 cobrada · Bs 52,00", COBRADA);
  });

  it("si la cuenta cambió mientras cobraba, vuelve a la mesa recargada con el aviso", async () => {
    // El mesero de al lado le sumó un pedido: se vuelve a la mesa (que aplica
    // de nuevo las reglas, p. ej. no cobrar con platos sin servir) en vez de
    // cobrar ahí mismo un total que nadie le cantó al cliente.
    vi.mocked(api.cobrarMesa).mockRejectedValue(
      new Error("La mesa M1 cambió mientras cobrabas: ahora son Bs 72.00. Volvé a entrar a la mesa para cobrar el total nuevo."),
    );
    const recargada = mesa({ estado: "OCUPADA", consumo: 72 });
    vi.mocked(api.mesa).mockResolvedValue(recargada);
    const { onCobrada, onCuentaCambiada } = await montar();
    escribir(/Efectivo recibido/, "60");
    await confirmar();

    expect(onCobrada).not.toHaveBeenCalled();
    expect(onCuentaCambiada).toHaveBeenCalledWith(
      recargada,
      expect.stringMatching(/^La cuenta de M1 cambió mientras cobrabas: ahora son Bs\s72,00\./),
    );
  });

  it("si no puede releer la mesa, queda el mensaje del backend", async () => {
    vi.mocked(api.cobrarMesa).mockRejectedValue(
      new Error("La mesa M1 cambió mientras cobrabas: ahora son Bs 72.00. Volvé a entrar a la mesa para cobrar el total nuevo."),
    );
    vi.mocked(api.mesa).mockRejectedValue(new Error("Sin internet."));
    const { onCuentaCambiada } = await montar();
    escribir(/Efectivo recibido/, "60");
    await confirmar();

    expect(onCuentaCambiada).not.toHaveBeenCalled();
    expect(screen.getByText(/Volvé a entrar a la mesa/)).toBeInTheDocument();
  });
});
