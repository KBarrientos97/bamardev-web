import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CarritoCita } from "../../lib/agenda/tiposAgenda";

/**
 * El POS con paquetes de sesiones (agenda fase 3): lo que se descuenta del
 * paquete al cobrar una cita, y a quién se le vende un paquete.
 */

vi.mock("../../lib/agenda/apiAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiAgenda")>();
  return { ...real, apiAgenda: { buscarClientes: vi.fn(), crearCliente: vi.fn() } };
});

import { apiAgenda } from "../../lib/agenda/apiAgenda";
import { ClientePaquete, SesionesDePaquete, SesionesEnVentaDirecta } from "./PaquetesPos";

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

  /** Escribe en el buscador y deja que responda. */
  async function buscar(texto: string) {
    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText("Cliente del paquete"), { target: { value: texto } });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    vi.useRealTimers();
    await act(async () => {});
  }

  it("QA DIA-09: sin resultados lo dice y da de alta con el teléfono que se escribió", async () => {
    vi.mocked(apiAgenda.buscarClientes).mockResolvedValue([]);
    vi.mocked(apiAgenda.crearCliente).mockResolvedValue({
      id: 44,
      nombre: "Lucía Nueva",
      telefono: "70012345",
      fechaNacimiento: null,
      alergias: null,
      notas: null,
      noShows: 0,
      bloqueadoOnline: false,
      ultimaVisita: null,
      creadoEn: "x",
    });
    const elegir = vi.fn();
    render(<ClientePaquete cliente={null} onElegir={elegir} puedeCrear />);
    await buscar("7001 2345");
    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo cliente" }));
    // Lo escrito era un teléfono: va al teléfono, y el nombre queda por poner.
    expect(screen.getByPlaceholderText("70012345")).toHaveValue("7001 2345");
    fireEvent.click(screen.getByRole("button", { name: "Crear cliente" }));
    expect(screen.getByText("Poné el nombre del cliente.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Lucía Nueva" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Crear cliente" }));
    });
    expect(apiAgenda.crearCliente).toHaveBeenCalledWith({ nombre: "Lucía Nueva", telefono: "70012345" });
    expect(elegir).toHaveBeenCalledWith({ id: 44, nombre: "Lucía Nueva" });
  });

  it("QA DIA-09: lo escrito sin dígitos precarga el nombre", async () => {
    vi.mocked(apiAgenda.buscarClientes).mockResolvedValue([]);
    render(<ClientePaquete cliente={null} onElegir={vi.fn()} puedeCrear />);
    await buscar("Lucía");
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo cliente" }));
    expect(screen.getByLabelText("Nombre")).toHaveValue("Lucía");
    expect(screen.getByPlaceholderText("70012345")).toHaveValue("");
  });

  it("QA DIA-09: quien no crea fichas ve «Sin resultados» pero no el alta", async () => {
    vi.mocked(apiAgenda.buscarClientes).mockResolvedValue([]);
    render(<ClientePaquete cliente={null} onElegir={vi.fn()} />);
    await buscar("Lucía");
    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Nuevo cliente" })).not.toBeInTheDocument();
  });

  it("QA DIA-09: si la búsqueda falla no dice «Sin resultados»", async () => {
    vi.mocked(apiAgenda.buscarClientes).mockRejectedValue(new Error("403"));
    render(<ClientePaquete cliente={null} onElegir={vi.fn()} puedeCrear />);
    await buscar("Lucía");
    expect(screen.queryByText("Sin resultados")).not.toBeInTheDocument();
  });

  it("con cliente elegido, se puede cambiar", () => {
    const elegir = vi.fn();
    render(<ClientePaquete cliente={{ id: 5, nombre: "Rosa" }} onElegir={elegir} />);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
    expect(elegir).toHaveBeenCalledWith(null);
  });
});

describe("QA DIA-08: sesión del paquete en la venta directa", () => {
  const OFRECIDA = {
    productoId: 100,
    descripcion: "Depilación láser",
    cantidad: 1,
    paquete: "3 depilaciones",
    restantes: 0,
    ultimoDia: "2026-12-31",
  };

  it("ofrece usar la sesión por línea; por defecto se cobra", () => {
    const onCambiar = vi.fn();
    render(<SesionesEnVentaDirecta ofrecidas={[OFRECIDA]} elegidas={[]} onCambiar={onCambiar} />);
    const caja = screen.getByRole("checkbox");
    expect(caja).not.toBeChecked();
    expect(screen.getByText(/Usar sesión del paquete/)).toBeInTheDocument();
    fireEvent.click(caja);
    expect(onCambiar).toHaveBeenCalledWith([100]);
  });

  it("destildar la vuelve a cobrar", () => {
    const onCambiar = vi.fn();
    render(<SesionesEnVentaDirecta ofrecidas={[OFRECIDA]} elegidas={[100]} onCambiar={onCambiar} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onCambiar).toHaveBeenCalledWith([]);
  });

  it("sin nada que cubra, no dibuja nada", () => {
    const { container } = render(<SesionesEnVentaDirecta ofrecidas={[]} elegidas={[]} onCambiar={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
