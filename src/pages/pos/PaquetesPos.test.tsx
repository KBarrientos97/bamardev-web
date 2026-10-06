import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CarritoCita } from "../../lib/agenda/tiposAgenda";

/**
 * El POS con paquetes de sesiones (agenda fase 3): lo que se descuenta del
 * paquete al cobrar una cita, y a quién se le vende un paquete.
 */

vi.mock("../../lib/agenda/apiAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiAgenda")>();
  return { ...real, apiAgenda: { buscarClientes: vi.fn() } };
});

import { apiAgenda } from "../../lib/agenda/apiAgenda";
import { ClientePaquete, SesionesDePaquete } from "./PaquetesPos";

const CITA: CarritoCita = {
  citaId: 9,
  codigo: "X",
  estado: "POR_COBRAR",
  ventaId: null,
  cobroRevisar: false,
  sucursalId: 1,
  cliente: { id: 5, nombre: "Rosa" },
  lineas: [
    {
      productoId: 100,
      descripcion: "Masaje",
      cantidad: 1,
      precio: 150,
      recursoId: 1,
      recurso: "Ana",
      paquete: { paqueteClienteId: 3, nombre: "5 masajes", restantes: 2, ultimoDia: "2026-12-31" },
    },
  ],
  total: 150,
  totalConPaquetes: 0,
};

beforeEach(() => vi.clearAllMocks());

describe("sesiones de paquete al cobrar la cita", () => {
  it("dice qué se descuenta y, con el carrito vacío, deja completar sin pagos", () => {
    const completar = vi.fn();
    const sinPaquete = vi.fn();
    render(
      <SesionesDePaquete
        cita={CITA}
        carritoVacio
        procesando={false}
        onCobrarSinPaquete={sinPaquete}
        onCompletar={completar}
      />,
    );
    expect(screen.getByText(/Masaje · Ana — 5 masajes, le quedan 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Completar con el paquete" }));
    expect(completar).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cobrar sin usar el paquete" }));
    expect(sinPaquete).toHaveBeenCalled();
  });

  it("sin sesiones que usar no aparece", () => {
    const { container } = render(
      <SesionesDePaquete
        cita={{ ...CITA, lineas: [{ ...CITA.lineas[0], paquete: null }] }}
        carritoVacio
        procesando={false}
        onCobrarSinPaquete={vi.fn()}
        onCompletar={vi.fn()}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("con algo más en el carrito, se cobra por el camino de siempre", () => {
    render(
      <SesionesDePaquete
        cita={CITA}
        carritoVacio={false}
        procesando={false}
        onCobrarSinPaquete={vi.fn()}
        onCompletar={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Completar con el paquete" })).toBeNull();
  });
});

describe("a quién se le vende el paquete", () => {
  it("busca la ficha y la elige", async () => {
    vi.useFakeTimers();
    vi.mocked(apiAgenda.buscarClientes).mockResolvedValue([
      {
        id: 5,
        nombre: "Rosa Mamani",
        telefono: "71234567",
        fechaNacimiento: null,
        alergias: null,
        notas: null,
        noShows: 0,
        bloqueadoOnline: false,
        ultimaVisita: null,
        creadoEn: "x",
      },
    ]);
    const elegir = vi.fn();
    render(<ClientePaquete cliente={null} onElegir={elegir} />);
    fireEvent.change(screen.getByLabelText("Cliente del paquete"), { target: { value: "rosa" } });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    vi.useRealTimers();
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Rosa Mamani/ }));
    expect(apiAgenda.buscarClientes).toHaveBeenCalledWith("rosa");
    expect(elegir).toHaveBeenCalledWith({ id: 5, nombre: "Rosa Mamani" });
  });

  it("con cliente elegido, se puede cambiar", () => {
    const elegir = vi.fn();
    render(<ClientePaquete cliente={{ id: 5, nombre: "Rosa" }} onElegir={elegir} />);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
    expect(elegir).toHaveBeenCalledWith(null);
  });
});
