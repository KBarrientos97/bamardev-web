import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";

/**
 * El carrito del punto de venta es el mismo para los dos rubros. En la
 * farmacia la cantidad se escribe y cada renglón dice de qué lote sale; en
 * bamardev-restaurant tiene que quedar exactamente como estaba: el contador
 * con − y +, y ni una consulta de lotes.
 */

const sesion = vi.hoisted(() => ({
  rubro: "FARMACIA" as string,
  features: new Set<string>(["lotes"]),
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: { alias: "prueba" },
    usuario: { username: "cajero" },
    rubro: sesion.rubro,
    incluye: (f: string) => sesion.features.has(f),
    puede: () => true,
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    buscarProductos: vi.fn(async () => ({ items: [], total: 0, limite: 30, offset: 0 })),
    lotesParaVender: vi.fn(),
  },
}));

import { api } from "../../lib/api";
import { ContextoVentaFarmacia, type VentaFarmacia } from "../farmacia/ventaFarmacia";
import PantallaVenta from "./PantallaVenta";
import type { Carrito } from "./useCarrito";

function med(over: Partial<Producto>): Producto {
  return {
    id: 1,
    nombre: "Amoxicilina 500 mg",
    descripcion: null,
    codBarra: null,
    tipoProducto: "ALMACENABLE",
    precio: 1.3,
    costo: 0.42,
    stockMinimo: 10,
    habilitado: true,
    icono: null,
    categoria: null,
    unidadMedida: null,
    stockTotal: 140,
    componentes: [],
    manejaLote: true,
    ...over,
  } as Producto;
}

const amoxicilina = med({});
const barbijo = med({ id: 2, nombre: "Barbijo quirúrgico x10", manejaLote: false });

function carritoCon(productos: Producto[]): Carrito {
  const lineas = productos.map((producto) => ({ producto, cantidad: 2, enMesa: 0, nota: "" }));
  return {
    lineas,
    unidades: lineas.length * 2,
    subtotal: 0,
    total: 0,
    agregar: vi.fn(),
    setCantidad: vi.fn(),
    setNota: vi.fn(),
    setEnMesa: vi.fn(),
    setConsumo: vi.fn(),
    setConsumoTodo: vi.fn(),
    quitar: vi.fn(),
    vaciar: vi.fn(),
    aDetalles: vi.fn(() => []),
  };
}

const fijarCantidad = vi.fn();

async function montar(productos: Producto[]) {
  const carrito = carritoCon(productos);
  const pantalla = (
    <PantallaVenta
      productos={productos}
      categorias={[]}
      carrito={carrito}
      onCobrar={() => {}}
      sucursalId={917}
    />
  );
  const venta: VentaFarmacia = { carrito, agregar: vi.fn(), fijarCantidad };
  render(
    <MemoryRouter>
      {sesion.rubro === "FARMACIA" ? (
        <ContextoVentaFarmacia.Provider value={venta}>{pantalla}</ContextoVentaFarmacia.Provider>
      ) : (
        pantalla
      )}
    </MemoryRouter>,
  );
  await act(async () => {});
  return carrito;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sesion.rubro = "FARMACIA";
  sesion.features = new Set(["lotes"]);
  vi.mocked(api.lotesParaVender).mockResolvedValue([
    {
      productoId: 1,
      lotes: [
        {
          codigo: "AMX-2601",
          vencimiento: "2028-04-30T00:00:00.000Z",
          dias: 580,
          tramo: "LEJOS",
          cantidad: 100,
        },
      ],
    },
  ]);
});

describe("el carrito de la farmacia", () => {
  it("cada renglón dice de qué lote sale, en la sucursal de la caja", async () => {
    await montar([amoxicilina, barbijo]);
    expect(api.lotesParaVender).toHaveBeenCalledWith([1, 2], 917);
    expect((await screen.findByText(/FEFO/)).closest("li")).toHaveTextContent("FEFO · AMX-2601 · vence 04/2028");
    // El barbijo no maneja lote: no dice nada, ni "sin lote asignado".
    expect(screen.getAllByText(/FEFO/)).toHaveLength(1);
  });

  it("la cantidad se escribe: un blíster de 10 son 10 unidades", async () => {
    await montar([amoxicilina]);
    const campo = screen.getByRole("textbox", { name: "Cantidad de Amoxicilina 500 mg" });
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "10" } });
    expect(fijarCantidad).toHaveBeenLastCalledWith(amoxicilina, 10);
  });

  it("sin la feature de lotes no los pide ni los muestra", async () => {
    sesion.features = new Set();
    await montar([amoxicilina]);
    expect(api.lotesParaVender).not.toHaveBeenCalled();
    expect(screen.queryByText(/FEFO/)).not.toBeInTheDocument();
  });
});

describe("el carrito de bamardev-restaurant no cambia", () => {
  it("el contador de siempre, sin campo para escribir ni lotes", async () => {
    sesion.rubro = "RESTAURANTE";
    sesion.features = new Set(["lotes", "mesa_llevar"]);
    const pollo = med({ id: 7, nombre: "1/4 Pollo", manejaLote: false });
    const carrito = await montar([pollo]);

    expect(screen.queryByRole("textbox", { name: /Cantidad de/ })).not.toBeInTheDocument();
    expect(api.lotesParaVender).not.toHaveBeenCalled();
    expect(screen.queryByText(/FEFO/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Agregar una unidad" }));
    expect(carrito.setCantidad).toHaveBeenCalledWith(7, 3);
  });
});
