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
  // La recepción: ve y da de alta clientes (`cliente.editar`).
  const auth = { negocio: { features: [] }, usuario: { permisos: ["cliente.ver_ficha", "cliente.editar"] } };
  return { useAuth: () => auth, useAuthOpcional: () => auth };
});

vi.mock("../../lib/agenda/apiAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiAgenda")>();
  return {
    ...real,
    apiAgenda: { buscarClientes: vi.fn(), cliente: vi.fn(), editarCliente: vi.fn(), crearCliente: vi.fn() },
  };
});

vi.mock("../../lib/crm/apiCrm", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/crm/apiCrm")>();
  return { ...real, apiCrm: { marketing: vi.fn(async () => ({ acepta: true, en: null, canal: "LOCAL" })) } };
});

import { apiAgenda } from "../../lib/agenda/apiAgenda";
import { apiCrm } from "../../lib/crm/apiCrm";
import { ApiError } from "../../lib/api";
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

  describe("alta sin cita (DIA-09)", () => {
    const abrir = async () => {
      await montar();
      fireEvent.click(screen.getByRole("button", { name: "Nuevo cliente" }));
      return screen.getByRole("dialog", { name: "Nuevo cliente" });
    };

    it("pide nombre y teléfono como Nueva cita, y guarda si acepta promociones", async () => {
      const nueva = ficha({ id: 40, nombre: "Elena Spa", telefono: "70044001" });
      vi.mocked(apiAgenda.crearCliente).mockResolvedValue(nueva);
      const dialogo = await abrir();
      fireEvent.change(within(dialogo).getByLabelText("Nombre"), { target: { value: "Elena Spa" } });
      fireEvent.change(within(dialogo).getByLabelText(/Teléfono/), { target: { value: "700 44" } });
      await act(async () => {
        fireEvent.click(within(dialogo).getByRole("button", { name: "Crear cliente" }));
      });
      expect(within(dialogo).getByText(/Poné el teléfono del cliente/)).toBeInTheDocument();
      expect(apiAgenda.crearCliente).not.toHaveBeenCalled();

      fireEvent.change(within(dialogo).getByLabelText(/Teléfono/), { target: { value: "700-44 001" } });
      fireEvent.change(within(dialogo).getByLabelText("¿Acepta recibir promociones?"), { target: { value: "si" } });
      await act(async () => {
        fireEvent.click(within(dialogo).getByRole("button", { name: "Crear cliente" }));
      });
      expect(apiAgenda.crearCliente).toHaveBeenCalledWith({ nombre: "Elena Spa", telefono: "70044001" });
      expect(apiCrm.marketing).toHaveBeenCalledWith(40, true);
      expect(screen.getByText('"Elena Spa" quedó como cliente.')).toBeInTheDocument();
      // Se abre su ficha.
      expect(apiAgenda.cliente).toHaveBeenCalledWith(40);
    });

    it("sin preguntar por promociones no marca nada; un teléfono que ya existe lleva a esa ficha", async () => {
      vi.mocked(apiAgenda.crearCliente).mockRejectedValue(
        new ApiError("Ya existe", 409, { codigo: "TELEFONO_EXISTE", cliente: rosa }),
      );
      const dialogo = await abrir();
      fireEvent.change(within(dialogo).getByLabelText("Nombre"), { target: { value: "Otra Rosa" } });
      fireEvent.change(within(dialogo).getByLabelText(/Teléfono/), { target: { value: "70012345" } });
      await act(async () => {
        fireEvent.click(within(dialogo).getByRole("button", { name: "Crear cliente" }));
      });
      expect(apiCrm.marketing).not.toHaveBeenCalled();
      expect(within(dialogo).getByText(`Ese teléfono ya es de ${rosa.nombre}.`)).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(within(dialogo).getByRole("button", { name: `Abrir la ficha de ${rosa.nombre}` }));
      });
      expect(apiAgenda.cliente).toHaveBeenCalledWith(rosa.id);
    });
  });
});
