import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorMenu, PlatoMenu } from "../../types/menuDigital";

/**
 * El editor del menú digital con el local elegido (PLAN-SUCURSAL-TOTAL §10.5):
 * la organización con 2+ locales ve los precios y la disponibilidad de un local
 * y lo dice; con un solo local o atada a uno, el editor es el de siempre.
 */

const local = vi.hoisted(() => ({
  elegir: false,
  sucursalId: null as number | null,
  setLocal: vi.fn(),
}));

vi.mock("../tickets/useLocalDeTickets", async (original) => {
  const real = await original<typeof import("../tickets/useLocalDeTickets")>();
  return {
    ...real,
    useLocalDeTickets: () => ({
      elegir: local.elegir,
      locales: [
        { id: 1, nombre: "Centro" },
        { id: 2, nombre: "Norte" },
      ],
      sucursalId: local.sucursalId,
      nombre: local.sucursalId === 2 ? "Norte" : local.sucursalId === 1 ? "Centro" : "",
      setLocal: local.setLocal,
      miSede: null,
    }),
  };
});

vi.mock("../tickets/TelevisoresDelLocal", () => ({ default: () => null }));

const apiMenu = vi.hoisted(() => ({ editor: vi.fn(), editarPlato: vi.fn() }));
vi.mock("../../lib/apiMenuDigital", () => ({
  apiMenuDigital: apiMenu,
  urlApi: (r: string) => r,
}));
vi.mock("../../lib/apiTickets", () => ({
  apiTickets: { llave: vi.fn(async () => ({ llave: "llave-de-prueba" })) },
}));
vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, sucursalId: null, permisos: ["menu_digital.editar"] },
    negocio: { id: 7, nombre: "Pollos", features: ["menu_digital"] },
    rubro: "RESTAURANTE",
    puede: () => true,
    incluye: () => true,
  }),
}));

import MenuDigital from "./MenuDigital";

const plato = (id: number, nombre: string, precio: number, extra: Partial<PlatoMenu> = {}): PlatoMenu => ({
  id,
  nombre,
  precio,
  icono: null,
  categoriaId: 1,
  categoria: "Pollos",
  foto: null,
  descripcion: null,
  etiqueta: null,
  destacado: false,
  enMenu: true,
  agotadoHoy: false,
  agotado: false,
  ...extra,
});

const editor = (precio: number): EditorMenu => ({
  pantallas: [],
  platos: [plato(1, "Brasa cuarto", precio, { disponible: true })],
  categorias: [{ id: 1, nombre: "Pollos" }],
  logo: null,
});

async function abrir() {
  render(
    <MemoryRouter>
      <MenuDigital />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  local.elegir = false;
  local.sucursalId = null;
  apiMenu.editor.mockImplementation(async (sucursalId?: number | null) => editor(sucursalId === 2 ? 30 : 26));
});

describe("Menú digital: el local del editor", () => {
  it("la organización con 2+ locales ve el selector y el aviso, y pide el editor de ese local", async () => {
    local.elegir = true;
    local.sucursalId = 2;
    await abrir();
    expect(apiMenu.editor).toHaveBeenCalledWith(2);
    expect(screen.getByRole("combobox", { name: "Sucursal" })).toHaveValue("2");
    expect(screen.getByRole("note")).toHaveTextContent(
      "Los precios y la disponibilidad son los de Norte. Marcar un plato como agotado vale para todos los locales.",
    );
    fireEvent.click(screen.getByRole("tab", { name: /Platos y fotos/ }));
    expect(await screen.findByText("Brasa cuarto")).toBeInTheDocument();
  });

  it("elegir otro local lo cambia en el hook (que vuelve a pedir el editor de ese local)", async () => {
    local.elegir = true;
    local.sucursalId = 1;
    await abrir();
    fireEvent.change(screen.getByRole("combobox", { name: "Sucursal" }), { target: { value: "2" } });
    expect(local.setLocal).toHaveBeenCalledWith(2);
  });

  it("un local, o atado a uno: sin selector ni aviso, y el editor se pide sin sucursal", async () => {
    await abrir();
    expect(apiMenu.editor).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("combobox", { name: "Sucursal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("al editar un plato, la respuesta del PATCH no pisa el precio del local que se mira", async () => {
    local.elegir = true;
    local.sucursalId = 2;
    // El PATCH responde con el plato resuelto en el principal (Bs 26), no en Norte (Bs 30).
    apiMenu.editarPlato.mockResolvedValue(plato(1, "Brasa cuarto", 26, { agotado: true, agotadoHoy: true }));
    await abrir();
    fireEvent.click(screen.getByRole("tab", { name: /Platos y fotos/ }));
    const fila = (await screen.findByText("Brasa cuarto")).closest("li")!;
    expect(fila).toHaveTextContent("30");
    await act(async () => {
      fireEvent.click(within(fila).getByRole("button", { name: "Marcar agotado" }));
    });
    await waitFor(() => expect(apiMenu.editarPlato).toHaveBeenCalledWith(1, { agotado: true }));
    // Quedó agotado, pero sigue con el precio de Norte.
    const despues = screen.getByText("Brasa cuarto").closest("li")!;
    expect(despues).toHaveTextContent("30");
    expect(despues).not.toHaveTextContent("26");
  });
});
