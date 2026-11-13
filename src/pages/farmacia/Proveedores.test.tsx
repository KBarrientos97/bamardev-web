import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProveedorConCompras } from "../../types";

/**
 * Proveedores: a quién se le compra, ordenado por cuánto. Se crean, se editan
 * y se dan de baja sin borrar sus compras.
 */

// Quién mira: de organización (sucursalId null) o atado a un local, y cuántos
// locales activos tiene el negocio.
const sesion = vi.hoisted(() => ({
  sucursalId: null as number | null,
  sucursal: null as string | null,
  activas: 1,
}));
vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, sucursalId: sesion.sucursalId, sucursal: sesion.sucursal },
    negocio: { id: 1, tipoNegocio: "FARMACIA", sucursalesActivas: sesion.activas },
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getSucursales: vi.fn(),
    proveedores: vi.fn(),
    proveedor: vi.fn(),
    crearProveedor: vi.fn(async () => ({})),
    actualizarProveedor: vi.fn(async () => ({})),
    darDeBajaProveedor: vi.fn(async () => ({})),
  },
}));

import { api } from "../../lib/api";
import Proveedores from "./Proveedores";

function proveedor(over: Partial<ProveedorConCompras>): ProveedorConCompras {
  return {
    id: 1,
    nombre: "Droguería INTI",
    nit: "1020304",
    telefono: "3-3334444",
    contacto: "Juan",
    nota: null,
    activo: true,
    compras: { total: 350, ingresos: 2 },
    ultimaCompra: "2026-09-20T12:00:00.000Z",
    ...over,
  };
}

async function montar() {
  render(<Proveedores />);
  await act(async () => {});
}

const tarjetas = () => screen.getAllByRole("listitem").map((li) => li.textContent ?? "");

beforeEach(() => {
  vi.clearAllMocks();
  sesion.sucursalId = null;
  sesion.sucursal = null;
  sesion.activas = 1;
  vi.mocked(api.getSucursales).mockResolvedValue([
    { id: 1, nombre: "Centro", activo: true, tipo: "SUCURSAL", esPrincipal: true },
  ] as never);
  vi.mocked(api.proveedores).mockResolvedValue([
    proveedor({ id: 2, nombre: "Bagó", nit: null, compras: { total: 90, ingresos: 1 } }),
    proveedor({}),
    proveedor({ id: 3, nombre: "Terbol", compras: { total: 0, ingresos: 0 }, ultimaCompra: null }),
  ]);
  vi.mocked(api.proveedor).mockResolvedValue({
    ...proveedor({}),
    ultimosIngresos: [
      {
        id: 40,
        fecha: "2026-09-20T12:00:00.000Z",
        comprobante: "F-0012",
        estado: "APROBADO",
        almacen: "Sucursal Centro",
        items: 3,
        monto: 250,
      },
    ],
  });
});

describe("la lista", () => {
  it("arriba el que más se le compró, y cuánto en total", async () => {
    await montar();
    expect(api.proveedores).toHaveBeenCalledWith(
      expect.objectContaining({ desde: `${new Date().getFullYear()}-01-01`, inactivos: false }),
    );
    const t = tarjetas();
    expect(t[0]).toMatch(/^Droguería INTI/);
    expect(t[2]).toMatch(/^Terbol/);
    expect(t[2]).toContain("nunca se le compró");
    expect(screen.getByText(/Comprado esta gestión/)).toHaveTextContent("Bs 440,00 en 3 ingresos");
  });

  it("se busca por nombre o NIT, sin importar tildes", async () => {
    await montar();
    fireEvent.change(screen.getByPlaceholderText("Buscar por nombre o NIT"), {
      target: { value: "bago" },
    });
    expect(tarjetas()).toHaveLength(1);
    expect(tarjetas()[0]).toMatch(/^Bagó/);
  });
});

describe("la ficha", () => {
  it("muestra sus últimos ingresos y guarda lo editado", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByText("Droguería INTI"));
    });
    const ficha = screen.getByRole("dialog");
    expect(await within(ficha).findByText(/F-0012/)).toBeInTheDocument();
    expect(ficha).toHaveTextContent("Sucursal Centro · 3 artículos");

    fireEvent.change(within(ficha).getByLabelText(/^Teléfono/), { target: { value: "3-3339999" } });
    await act(async () => {
      fireEvent.click(within(ficha).getByRole("button", { name: /Guardar/ }));
    });
    expect(api.actualizarProveedor).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ telefono: "3-3339999", nombre: "Droguería INTI" }),
    );
  });

  it("dar de baja pregunta antes, y no borra", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByText("Droguería INTI"));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));
    });
    expect(screen.getByText(/Sus compras de antes siguen/)).toBeInTheDocument();
    const confirmar = screen.getAllByRole("button", { name: "Dar de baja" }).at(-1)!;
    await act(async () => {
      fireEvent.click(confirmar);
    });
    expect(api.darDeBajaProveedor).toHaveBeenCalledWith(1);
  });

  it("uno nuevo pide al menos el nombre", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Nuevo proveedor/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Crear proveedor/ }));
    });
    expect(screen.getByText("Escribí el nombre del proveedor")).toBeInTheDocument();
    expect(api.crearProveedor).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Droguería Nueva" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Crear proveedor/ }));
    });
    expect(api.crearProveedor).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Droguería Nueva" }),
    );
  });

  it("dos clics en el mismo tick crean uno solo", async () => {
    // El servidor acepta nombre y NIT repetidos: el único freno es acá.
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Nuevo proveedor/ }));
    });
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Droguería Nueva" } });
    await act(async () => {
      const crear = screen.getByRole("button", { name: /Crear proveedor/ });
      fireEvent.click(crear);
      fireEvent.click(crear);
    });
    expect(api.crearProveedor).toHaveBeenCalledTimes(1);
  });
});

describe("la sucursal", () => {
  const dosLocales = [
    { id: 1, nombre: "Centro", activo: true, tipo: "SUCURSAL", esPrincipal: true },
    { id: 2, nombre: "Equipetrol", activo: true, tipo: "SUCURSAL", esPrincipal: false },
  ];

  it("con un solo local no hay selector y se piden las compras del negocio", async () => {
    await montar();
    expect(screen.queryByRole("button", { name: "Equipetrol" })).toBeNull();
    expect(api.proveedores).toHaveBeenLastCalledWith(
      expect.objectContaining({ sucursalId: null }),
    );
  });

  it("la organización con 2 locales elige de cuál ver las compras, y la ficha usa el mismo", async () => {
    vi.mocked(api.getSucursales).mockResolvedValue(dosLocales as never);
    await montar();
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Equipetrol" }));
    });
    expect(api.proveedores).toHaveBeenLastCalledWith(
      expect.objectContaining({ sucursalId: 2 }),
    );
    expect(screen.getByText(/Comprado .* en Equipetrol:/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Droguería INTI"));
    });
    expect(api.proveedor).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ sucursalId: 2 }),
    );
  });

  it("el atado a un local no ve selector: sólo dice que son las compras de su sede", async () => {
    sesion.activas = 2;
    sesion.sucursalId = 2;
    sesion.sucursal = "Equipetrol";
    await montar();
    expect(screen.getByText(/Compras de Equipetrol/)).toBeInTheDocument();
    expect(api.getSucursales).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Centro" })).toBeNull();
  });
});
