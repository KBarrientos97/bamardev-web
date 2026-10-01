import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProveedorConCompras } from "../../types";

/**
 * Proveedores: a quién se le compra, ordenado por cuánto. Se crean, se editan
 * y se dan de baja sin borrar sus compras.
 */

vi.mock("../../lib/api", () => ({
  api: {
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
});
