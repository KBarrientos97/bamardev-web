import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/agenda/apiAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiAgenda")>();
  return { ...real, apiAgenda: { buscarClientes: vi.fn(), crearCliente: vi.fn() } };
});

import { apiAgenda } from "../../lib/agenda/apiAgenda";
import BloqueDescuentos from "./BloqueDescuentos";
import type { Descuentos } from "./useDescuentos";

/** Los renglones de descuento y el campo del cupón en el carrito. */

function descuentos(cambios: Partial<Descuentos> = {}): Descuentos {
  return {
    activo: true,
    conCupones: true,
    cupones: [],
    agregarCupon: vi.fn(),
    quitarCupon: vi.fn(),
    clienteId: null,
    setClienteId: vi.fn(),
    cotizacion: null,
    cargando: false,
    error: "",
    total: (b) => b,
    extraVenta: () => ({}),
    vigente: true,
    reiniciar: vi.fn(),
    recotizar: vi.fn(),
    ...cambios,
  };
}

describe("BloqueDescuentos", () => {
  it("apagado no dibuja nada (el carrito de Omar no cambia)", () => {
    const { container } = render(<BloqueDescuentos descuentos={descuentos({ activo: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("muestra lo aplicado y explica lo que no aplicó", () => {
    render(
      <BloqueDescuentos
        descuentos={descuentos({
          cupones: ["VERANO15"],
          cotizacion: {
            subtotal: 120,
            descuentoTotal: 15,
            total: 105,
            aplicadas: [
              {
                promocionId: 1,
                version: 1,
                nombre: "Bs 15 menos",
                origen: "CUPON",
                codigo: "VERANO15",
                alcance: "TICKET",
                monto: 15,
              },
            ],
            descartadas: [
              { promocionId: null, nombre: null, codigo: "VIEJO", motivo: "Ese cupón ya venció" },
            ],
            descuentosEsperados: [{ promocionId: 1, monto: 15 }],
          },
        })}
      />,
    );
    expect(screen.getByText("Bs 15 menos")).toBeInTheDocument();
    expect(screen.getByText("(VERANO15)")).toBeInTheDocument();
    expect(screen.getByText("VIEJO: Ese cupón ya venció")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar el cupón VERANO15" })).toBeInTheDocument();
  });

  it("el cupón se escribe y se aplica", () => {
    const d = descuentos();
    render(<BloqueDescuentos descuentos={d} />);
    fireEvent.change(screen.getByLabelText("Código de cupón"), { target: { value: "verano15" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(d.agregarCupon).toHaveBeenCalledWith("verano15");
  });

  it("sin cupones en el plan, no hay campo", () => {
    render(<BloqueDescuentos descuentos={descuentos({ conCupones: false })} />);
    expect(screen.queryByLabelText("Código de cupón")).not.toBeInTheDocument();
  });
});

describe("QA DIA-09: «Asociar cliente» con alta rápida", () => {
  async function buscar(texto: string) {
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Asociar cliente" }));
    fireEvent.change(screen.getByLabelText("Buscar cliente"), { target: { value: texto } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();
    await act(async () => {});
  }

  it("sin resultados ofrece crearlo, y el creado queda en la venta", async () => {
    vi.mocked(apiAgenda.buscarClientes).mockResolvedValue([]);
    vi.mocked(apiAgenda.crearCliente).mockResolvedValue({
      id: 61,
      nombre: "Rosa Nueva",
      telefono: "71234567",
      fechaNacimiento: null,
      alergias: null,
      notas: null,
      noShows: 0,
      bloqueadoOnline: false,
      ultimaVisita: null,
      creadoEn: "x",
    });
    const d = descuentos();
    render(<BloqueDescuentos descuentos={d} conClientes puedeCrearClientes />);
    await buscar("Rosa Nueva");
    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo cliente" }));
    expect(screen.getByLabelText("Nombre")).toHaveValue("Rosa Nueva");
    fireEvent.change(screen.getByPlaceholderText("70012345"), { target: { value: "71234567" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Crear cliente" }));
    });
    expect(apiAgenda.crearCliente).toHaveBeenCalledWith({ nombre: "Rosa Nueva", telefono: "71234567" });
    expect(d.setClienteId).toHaveBeenCalledWith(61);
  });

  it("sin permiso para crear fichas, sólo dice «Sin resultados»", async () => {
    vi.mocked(apiAgenda.buscarClientes).mockResolvedValue([]);
    render(<BloqueDescuentos descuentos={descuentos()} conClientes />);
    await buscar("Rosa");
    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Nuevo cliente" })).not.toBeInTheDocument();
  });
});
