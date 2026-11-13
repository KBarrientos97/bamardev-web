import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Almacen, Producto } from "../../types";

/**
 * Configuración › Inventario y stock (pedido del 09-nov): la pollería que no
 * tiene un día para contar sus bebidas vende sin control de stock, y cuando
 * cuenta lo vuelve a prender cargando lo contado.
 */

/** Los permisos del dueño de la prueba: con "reportes.ver" ve el reporte de lo vendido sin stock. */
let permisos: string[] = ["reportes.ver"];
/** El local del usuario (null = organización) y cuántas sucursales tiene el negocio. */
let sede: { sucursalId: number | null; locales: number | undefined } = { sucursalId: null, locales: undefined };

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: "RESTAURANTE",
    negocio: { id: 7, features: [], sucursalesActivas: sede.locales },
    usuario: { id: 1, sucursalId: sede.sucursalId, permisos },
    puede: (s: string) => s === "reportes" || s === "config_inventario",
    incluye: () => true,
  }),
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
  permisos = ["reportes.ver"];
  sede = { sucursalId: null, locales: undefined };
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
  it("apagado: lleva al reporte de lo vendido sin stock, sólo a quien lo puede abrir", async () => {
    // Mientras no cuenta, ese reporte es lo que reemplaza al stock.
    vi.mocked(api.controlStock).mockResolvedValue({ controlaStock: false, sePuedeApagar: true });
    await montar();
    expect(screen.getByRole("link", { name: "Reportes › Vendido sin stock" })).toHaveAttribute(
      "href",
      "/reportes/vendido-sin-stock",
    );
  });

  it("quien no ve las ventas no recibe el enlace a un reporte que no puede abrir", async () => {
    // Lo dejaba en la lista de reportes sin decirle por qué.
    permisos = [];
    vi.mocked(api.controlStock).mockResolvedValue({ controlaStock: false, sePuedeApagar: true });
    await montar();
    expect(screen.getByRole("button", { name: "Contar y empezar a controlar" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Reportes › Vendido sin stock" })).not.toBeInTheDocument();
  });

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

describe("el conteo con varios locales (PLAN-SUCURSAL-TOTAL, etapa 3)", () => {
  const NORTE = { id: 4, nombre: "Norte", activo: true, tipo: "SUCURSAL", esPrincipal: false } as Almacen;
  const prendido = () => vi.mocked(api.controlStock).mockResolvedValue({ controlaStock: true, sePuedeApagar: true });

  it("con el control ya prendido y 2+ locales, se puede contar otro local", async () => {
    prendido();
    vi.mocked(api.getSucursales).mockResolvedValue([PRINCIPAL, NORTE]);
    vi.mocked(api.controlarStock).mockResolvedValue({
      controlaStock: true,
      sePuedeApagar: true,
      contados: 1,
      puestosEnCero: 0,
    });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Contar un local" }));
    await act(async () => {});
    // Los dos locales se ofrecen y el botón no promete "prender" lo que ya está.
    fireEvent.click(screen.getByRole("radio", { name: "Norte" }));
    await act(async () => {});
    expect(api.getProductos).toHaveBeenLastCalledWith(false, NORTE.id);
    fireEvent.change(screen.getByRole("textbox", { name: "Cuántos hay de Fanta 2L" }), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar el conteo" }));
    const dialogo = screen.getByRole("dialog", { name: "¿Guardar el conteo?" });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(api.controlarStock).toHaveBeenCalledWith(NORTE.id, expect.arrayContaining([{ productoId: 1, cantidad: 8 }]));
    expect(screen.getByText(/se guardó el conteo con 1 artículo contado/)).toBeInTheDocument();
  });

  it("con un solo local no aparece nada nuevo", async () => {
    prendido();
    await montar();
    expect(screen.queryByRole("button", { name: "Contar un local" })).not.toBeInTheDocument();
  });

  it("con el control prendido, el usuario de un local no ve la tarjeta «Contar otro local»", async () => {
    sede = { sucursalId: 4, locales: 2 };
    prendido();
    vi.mocked(api.getSucursales).mockResolvedValue([PRINCIPAL, NORTE]);
    await montar();
    expect(screen.queryByRole("button", { name: "Contar un local" })).not.toBeInTheDocument();
    expect(screen.queryByText("Contar otro local")).not.toBeInTheDocument();
  });

  it("el usuario de un local cuenta el suyo: ni selector ni otros locales", async () => {
    sede = { sucursalId: 4, locales: 2 };
    vi.mocked(api.controlStock).mockResolvedValue({ controlaStock: false, sePuedeApagar: true });
    vi.mocked(api.getSucursales).mockResolvedValue([PRINCIPAL, NORTE]);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Contar y empezar a controlar" }));
    await act(async () => {});
    expect(screen.queryByRole("radiogroup", { name: "Local que se cuenta" })).not.toBeInTheDocument();
    expect(api.getProductos).toHaveBeenLastCalledWith(false, NORTE.id);
  });
});
