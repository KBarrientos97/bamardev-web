import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Almacen, Producto } from "../../types";

/**
 * Configuración › Inventario y stock (pedido del 09-nov): la pollería que no
 * tiene un día para contar sus bebidas vende sin control de stock, y cuando
 * cuenta lo vuelve a prender cargando lo contado.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ negocio: { id: 7 }, usuario: { sucursalId: null } }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    controlStock: vi.fn(),
    venderSinStock: vi.fn(),
    controlarStock: vi.fn(),
    getSucursales: vi.fn(),
    getProductos: vi.fn(),
  },
}));

import { api } from "../../lib/api";
import ConfigInventario from "./ConfigInventario";

function producto(over: Partial<Producto>): Producto {
  return {
    id: 1,
    nombre: "Producto",
    descripcion: null,
    codBarra: null,
    tipoProducto: "ALMACENABLE",
    precio: 10,
    costo: 6,
    stockMinimo: 0,
    habilitado: true,
    icono: null,
    categoria: { id: 1, nombre: "Bebidas" },
    unidadMedida: { id: 1, nombre: "u" },
    stockTotal: -4,
    componentes: [],
    vendeSinStock: true,
    ...over,
  } as Producto;
}

const PRINCIPAL = { id: 3, nombre: "Principal", activo: true, tipo: "SUCURSAL", esPrincipal: true } as Almacen;

async function montar() {
  render(
    <MemoryRouter>
      <ConfigInventario />
    </MemoryRouter>,
  );
  await act(async () => {});
}

const interruptor = () => screen.getByRole("switch", { name: "Controlar el stock al vender" });

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.mocked(api.getSucursales).mockResolvedValue([PRINCIPAL]);
  vi.mocked(api.getProductos).mockResolvedValue([
    producto({ id: 1, nombre: "Fanta 2L" }),
    producto({ id: 2, nombre: "Coca Cola 2L" }),
    // El elaborado no se cuenta: nunca llevó stock.
    producto({ id: 3, nombre: "Brasa cuarto", tipoProducto: "SERVICIO", categoria: { id: 2, nombre: "Pollos" } }),
    // Lo que no se vende hoy, tampoco: si quedó en negativo, el backend lo pone en 0.
    producto({ id: 4, nombre: "Sprite 2L", habilitado: false }),
  ]);
});

describe("Configuración › Inventario y stock", () => {
  it("prendido (como nace todo negocio): apagarlo pide confirmación y avisa", async () => {
    vi.mocked(api.controlStock).mockResolvedValue({ controlaStock: true, sePuedeApagar: true });
    vi.mocked(api.venderSinStock).mockResolvedValue({ controlaStock: false, sePuedeApagar: true });
    await montar();

    expect(interruptor()).toHaveAttribute("aria-checked", "true");
    fireEvent.click(interruptor());
    // Un clic suelto no cambia cómo vende el local: primero se confirma.
    expect(api.venderSinStock).not.toHaveBeenCalled();
    const dialogo = screen.getByRole("dialog", { name: "¿Vender sin control de stock?" });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Vender sin stock" }));
    });

    expect(api.venderSinStock).toHaveBeenCalledTimes(1);
    expect(interruptor()).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/desde ahora se vende sin mirar el stock/)).toBeInTheDocument();
  });

  it("apagado: prenderlo lleva al conteo, y lo vacío viaja como 0", async () => {
    vi.mocked(api.controlStock).mockResolvedValue({ controlaStock: false, sePuedeApagar: true });
    vi.mocked(api.controlarStock).mockResolvedValue({
      controlaStock: true,
      sePuedeApagar: true,
      contados: 2,
      puestosEnCero: 1,
    });
    await montar();

    fireEvent.click(screen.getByRole("button", { name: /Contar y empezar a controlar/ }));
    await act(async () => {});
    expect(api.getProductos).toHaveBeenCalledWith(false, PRINCIPAL.id);
    expect(screen.queryByText("Brasa cuarto")).not.toBeInTheDocument();
    expect(screen.queryByText("Sprite 2L")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Cuántos hay de Coca Cola 2L" }), {
      target: { value: "12" },
    });
    expect(screen.getByText(/Lo que quede vacío arranca en 0/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Prender el control de stock" }));

    const dialogo = screen.getByRole("dialog", { name: "¿Prender el control de stock?" });
    expect(dialogo).toHaveTextContent("1 sin contar quedan en 0");
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Prender" }));
    });

    expect(api.controlarStock).toHaveBeenCalledWith(PRINCIPAL.id, [
      { productoId: 2, cantidad: 12 },
      { productoId: 1, cantidad: 0 },
    ]);
    // De vuelta en la configuración, prendido y con lo que pasó.
    expect(interruptor()).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/prendido con 2 artículos contados/)).toBeInTheDocument();
  });

  it("algo que no es un número frena el conteo y dice cuál", async () => {
    vi.mocked(api.controlStock).mockResolvedValue({ controlaStock: false, sePuedeApagar: true });
    await montar();
    fireEvent.click(interruptor());
    await act(async () => {});

    fireEvent.change(screen.getByRole("textbox", { name: "Cuántos hay de Fanta 2L" }), {
      target: { value: "doce" },
    });
    expect(screen.getByText("Escribí un número (0 o más)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prender el control de stock" })).toBeDisabled();
  });

  it("lo contado sobrevive a una recarga de la pestaña", async () => {
    // Contar un local lleva un rato; la tablet del mostrador recarga sola.
    vi.mocked(api.controlStock).mockResolvedValue({ controlaStock: false, sePuedeApagar: true });
    await montar();
    fireEvent.click(interruptor());
    await act(async () => {});
    fireEvent.change(screen.getByRole("textbox", { name: "Cuántos hay de Fanta 2L" }), {
      target: { value: "5" },
    });

    document.body.innerHTML = "";
    await montar();
    fireEvent.click(interruptor());
    await act(async () => {});
    expect(screen.getByRole("textbox", { name: "Cuántos hay de Fanta 2L" })).toHaveValue("5");
  });
});
