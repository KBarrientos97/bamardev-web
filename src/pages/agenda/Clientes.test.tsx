import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClienteFichaDetalle } from "../../lib/agenda/tiposAgenda";
import { ficha } from "../../test/agendaFixtures";

/**
 * A7 · Cliente: el buscador, la ficha con su historial de citas y compras,
 * y lo que recepción completa a mano (alergias, notas, reserva online).
 */

// La ficha suma lo del spa (fase 3) y lo de la fase 4 (ficha técnica) según
// las features del negocio: sin ninguna, no se ve ni se pide nada.
vi.mock("../../store/AuthContext", () => {
  const auth = { negocio: { features: [] }, usuario: null };
  return { useAuth: () => auth, useAuthOpcional: () => auth };
});

vi.mock("../../lib/agenda/apiAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiAgenda")>();
  return {
    ...real,
    apiAgenda: { buscarClientes: vi.fn(), cliente: vi.fn(), editarCliente: vi.fn() },
  };
});

import { apiAgenda } from "../../lib/agenda/apiAgenda";
import Clientes from "./Clientes";

const rosa = ficha({ noShows: 2, bloqueadoOnline: true, ultimaVisita: "2026-10-01T14:00:00.000Z" });
const detalle: ClienteFichaDetalle = {
  ...rosa,
  alergias: "Amoníaco",
  notas: "Prefiere a Carla",
  citas: [
    {
      id: 30,
      codigo: "K7M2QX",
      estado: "COMPLETADA",
      origen: "INTERNA",
      sucursalId: 1,
      sucursal: "Centro",
      inicio: "2026-10-01T14:00:00.000Z",
      fin: "2026-10-01T14:45:00.000Z",
      total: 80,
      ventaId: 77,
      cobroRevisar: false,
      motivoCancelacion: null,
      lineas: [
        {
          servicioId: 100,
          servicio: "Corte dama",
          recursoId: 1,
          recurso: "Carla R.",
          inicio: "2026-10-01T14:00:00.000Z",
          fin: "2026-10-01T14:45:00.000Z",
          precio: 80,
        },
      ],
    },
  ],
  compras: [
    {
      id: 77,
      comprobante: "V-000012",
      fecha: "2026-10-01T15:00:00.000Z",
      total: 105,
      estado: "APROBADO",
      citaId: 30,
      fiado: false,
      items: [
        { producto: "Corte dama", cantidad: 1, subtotal: 80 },
        { producto: "Shampoo", cantidad: 1, subtotal: 25 },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiAgenda.buscarClientes).mockResolvedValue([rosa, ficha({ id: 6, nombre: "Lucía Paz", telefono: null })]);
  vi.mocked(apiAgenda.cliente).mockResolvedValue(detalle);
});

async function montar() {
  render(<Clientes />);
  await act(async () => {});
}

describe("A7 · Clientes", () => {
  it("lista con sus marcas: inasistencias y sin reserva online", async () => {
    await montar();
    expect(apiAgenda.buscarClientes).toHaveBeenCalledWith("");
    const fila = screen.getByRole("button", { name: "Ver la ficha de Rosa Mamani" });
    expect(within(fila).getByText("2 inasistencias")).toBeInTheDocument();
    expect(within(fila).getByText("Sin reserva online")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver la ficha de Lucía Paz" })).toHaveTextContent("Sin teléfono");
  });

  it("busca al dejar de teclear", async () => {
    vi.useFakeTimers();
    try {
      render(<Clientes />);
      fireEvent.change(screen.getByLabelText("Buscar cliente"), { target: { value: "7123" } });
      await act(async () => {
        vi.advanceTimersByTime(350);
      });
      expect(apiAgenda.buscarClientes).toHaveBeenLastCalledWith("7123");
    } finally {
      vi.useRealTimers();
    }
  });

  it("la ficha trae el historial de citas con quién la atendió, y las compras", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ver la ficha de Rosa Mamani" }));
    });
    const panel = screen.getByRole("dialog", { name: "Ficha de Rosa Mamani" });
    expect(within(panel).getByText("Corte dama con Carla R.")).toBeInTheDocument();
    expect(within(panel).getByText(/V-000012/)).toBeInTheDocument();
    expect(within(panel).getByText("Corte dama, Shampoo")).toBeInTheDocument();
    // Alergias se ve, marcada como dato sensible.
    expect(within(panel).getByText("Amoníaco")).toBeInTheDocument();
    expect(within(panel).getByText("Dato sensible")).toBeInTheDocument();
    expect(within(panel).getByText("no permitidas")).toBeInTheDocument();
  });

  it("S2-06: la compra del paquete sale en las compras y la sesión dice de qué paquete", async () => {
    vi.mocked(apiAgenda.cliente).mockResolvedValue({
      ...detalle,
      compras: [
        {
          id: 80,
          comprobante: "V-000020",
          fecha: "2026-10-06T15:00:00.000Z",
          total: 0,
          estado: "APROBADO",
          citaId: 31,
          fiado: false,
          items: [{ producto: "Masaje relajante", cantidad: 1, subtotal: 0, paquete: "Bono 5 masajes" }],
        },
        {
          id: 79,
          comprobante: "V-000019",
          fecha: "2026-10-06T14:00:00.000Z",
          total: 800,
          estado: "APROBADO",
          citaId: null,
          fiado: false,
          items: [{ producto: "Bono 5 masajes", cantidad: 1, subtotal: 800 }],
        },
      ],
    });
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ver la ficha de Rosa Mamani" }));
    });
    const panel = screen.getByRole("dialog", { name: "Ficha de Rosa Mamani" });
    expect(within(panel).getByText("Masaje relajante (sesión de Bono 5 masajes)")).toBeInTheDocument();
    expect(within(panel).getByText(/V-000019/)).toBeInTheDocument();
  });

  it("edita alergias, notas y el bloqueo online; vacío borra", async () => {
    vi.mocked(apiAgenda.editarCliente).mockResolvedValue({ ...rosa, alergias: null, notas: "Viene los sábados", bloqueadoOnline: false });
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ver la ficha de Rosa Mamani" }));
    });
    fireEvent.click(screen.getByRole("button", { name: /Editar/ }));
    fireEvent.change(screen.getByPlaceholderText("Ej.: amoníaco, látex"), { target: { value: "  " } });
    fireEvent.change(screen.getByPlaceholderText(/prefiere a Ana/), { target: { value: "Viene los sábados" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /No permitir reservas online/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(apiAgenda.editarCliente).toHaveBeenCalledWith(5, {
      alergias: null,
      notas: "Viene los sábados",
      bloqueadoOnline: false,
    });
    expect(screen.getByText("Ficha guardada")).toBeInTheDocument();
    expect(screen.getByText("permitidas")).toBeInTheDocument();
  });
});
