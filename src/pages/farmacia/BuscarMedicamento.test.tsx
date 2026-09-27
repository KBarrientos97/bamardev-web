import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";

/**
 * Buscar medicamento compara y vende: "Agregar" suma a la venta sin salir de
 * la pantalla, y la ficha es de consulta — sin costos ni botones del dueño.
 */

const permisos = vi.hoisted(() => ({ pos: true }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    puede: (s: string) => (s === "pos" ? permisos.pos : true),
    incluye: () => true,
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    buscarProductos: vi.fn(),
    getAlmacenes: vi.fn(async () => []),
    lotesDeProducto: vi.fn(async () => [
      {
        loteId: 1,
        codigo: "AMX-2601",
        vencimiento: "2028-04-30",
        diasRestantes: 581,
        tramo: "LEJOS",
        cantidad: 100,
        costoUnitario: 0.42,
        almacen: { id: 1, nombre: "Depósito" },
      },
    ]),
  },
}));

import { api } from "../../lib/api";
import BuscarMedicamento from "./BuscarMedicamento";
import { ContextoVentaFarmacia, type VentaFarmacia } from "./ventaFarmacia";

function med(over: Partial<Producto>): Producto {
  return {
    id: 1,
    nombre: "Amoxicilina 500 mg",
    descripcion: null,
    codBarra: "7790001",
    tipoProducto: "ALMACENABLE",
    precio: 1.3,
    costo: 0.42,
    stockMinimo: 10,
    habilitado: true,
    icono: null,
    categoria: null,
    unidadMedida: null,
    stockTotal: 240,
    componentes: [],
    principioActivo: "Amoxicilina",
    concentracion: "500 mg",
    formaFarmaceutica: "Cápsula",
    laboratorio: "BAGÓ",
    registroSanitario: "II-40233/2022",
    condicionVenta: "RECETA_MEDICA",
    manejaLote: true,
    controlado: false,
    proximoVencimiento: { fecha: "2027-08-31", dias: 338, tramo: "LEJOS" },
    ...over,
  };
}

const amoxicilina = med({});
const ranitidina = med({ id: 2, nombre: "Ranitidina 150 mg", stockTotal: 0 });
const agregar = vi.fn();

async function montar() {
  const venta = { carrito: {} as VentaFarmacia["carrito"], agregar } satisfies VentaFarmacia;
  render(
    <MemoryRouter>
      <ContextoVentaFarmacia.Provider value={venta}>
        <BuscarMedicamento />
      </ContextoVentaFarmacia.Provider>
    </MemoryRouter>,
  );
  await screen.findAllByText("Amoxicilina 500 mg");
}

const fila = (nombre: string) => screen.getAllByText(nombre)[0].closest("li")!;

async function tocar(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  permisos.pos = true;
  vi.mocked(api.buscarProductos).mockResolvedValue({
    items: [amoxicilina, ranitidina],
    total: 2,
    limite: 20,
    offset: 0,
  });
});

describe("la tabla", () => {
  it("Agregar suma a la venta sin salir de la pantalla", async () => {
    await montar();
    await tocar(within(fila("Amoxicilina 500 mg")).getByRole("button", { name: "Agregar" }));
    expect(agregar).toHaveBeenCalledWith(amoxicilina);
  });

  it("lo agotado se ve y su ficha se abre, pero no se puede agregar", async () => {
    await montar();
    const agotado = fila("Ranitidina 150 mg");
    expect(within(agotado).getByRole("button", { name: "Agregar" })).toBeDisabled();
    await tocar(within(agotado).getByRole("button", { name: /Ficha/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", { name: /Agregar a la venta/ }),
    ).not.toBeInTheDocument();
  });

  it("quien no vende consulta, pero no ve Agregar", async () => {
    permisos.pos = false;
    await montar();
    expect(within(fila("Amoxicilina 500 mg")).queryByRole("button", { name: "Agregar" })).toBeNull();
  });
});

describe("la ficha del mostrador", () => {
  it("dice lo que se pregunta, sin costos ni botones del dueño, y agrega", async () => {
    await montar();
    await tocar(within(fila("Amoxicilina 500 mg")).getByRole("button", { name: /Ficha/ }));
    const ficha = screen.getByRole("dialog");
    expect(ficha).toHaveTextContent("II-40233/2022");
    expect(await within(ficha).findByText("AMX-2601")).toBeInTheDocument();
    // El costo del lote (Bs 0,42) y el margen son del dueño.
    expect(ficha).not.toHaveTextContent("0,42");
    expect(ficha).not.toHaveTextContent("Margen");
    expect(within(ficha).queryByRole("button", { name: /Editar|Eliminar/ })).toBeNull();

    await tocar(within(ficha).getByRole("button", { name: /Agregar a la venta/ }));
    expect(agregar).toHaveBeenCalledWith(amoxicilina);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
