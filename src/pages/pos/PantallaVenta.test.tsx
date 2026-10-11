import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto, RecetaVenta } from "../../types";

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
import PantallaVenta, { type ProfesionalesDelCarrito } from "./PantallaVenta";
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
const pedirReceta = vi.fn();
const onCobrar = vi.fn();

async function montar(
  productos: Producto[],
  recetas = new Map<number, RecetaVenta>(),
  profesionales?: ProfesionalesDelCarrito,
) {
  const carrito = carritoCon(productos);
  const pantalla = (
    <PantallaVenta
      productos={productos}
      categorias={[]}
      carrito={carrito}
      onCobrar={onCobrar}
      sucursalId={917}
      profesionales={profesionales}
    />
  );
  const venta: VentaFarmacia = {
    carrito,
    agregar: vi.fn(),
    fijarCantidad,
    recetas,
    pedirReceta,
  };
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

  it("la concentración va al lado del nombre si el nombre no la trae", async () => {
    const acido = med({ id: 3, nombre: "Ácido fólico", concentracion: "5 mg", manejaLote: false });
    await montar([acido, med({ concentracion: "500 mg" })]);
    expect(screen.getByText("5 mg")).toBeInTheDocument();
    // "Amoxicilina 500 mg" ya la trae: no se repite.
    expect(screen.queryByText("500 mg")).not.toBeInTheDocument();
  });
});

describe("la receta de un controlado", () => {
  const clonazepam = med({
    id: 14,
    nombre: "Clonazepam 2 mg",
    manejaLote: false,
    condicionVenta: "RECETA_VALORADA",
    controlado: true,
  });

  it("sin receta, el renglón lo dice y Cobrar la pide en vez de cobrar", async () => {
    await montar([clonazepam]);
    const falta = screen.getByRole("button", { name: /Falta la receta/ });
    fireEvent.click(falta);
    expect(pedirReceta).toHaveBeenCalledWith(clonazepam);

    pedirReceta.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Cobrar/ }));
    expect(pedirReceta).toHaveBeenCalledWith(clonazepam);
    expect(onCobrar).not.toHaveBeenCalled();
  });

  it("con receta, se ve de quién es, se puede corregir, y se cobra", async () => {
    await montar(
      [clonazepam],
      new Map([
        [
          14,
          {
            pacienteNombre: "Juan Pérez",
            medicoNombre: "Dra. Ana Rojas",
            medicoMatricula: "R-1234",
            recetaNumero: "V-981",
            recetaFecha: "2026-09-28",
          },
        ],
      ]),
    );
    const receta = screen.getByRole("button", { name: /Receta N° V-981 · Juan Pérez/ });
    fireEvent.click(receta);
    expect(pedirReceta).toHaveBeenCalledWith(clonazepam);

    fireEvent.click(screen.getByRole("button", { name: /Cobrar/ }));
    expect(onCobrar).toHaveBeenCalled();
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

  it("el renglón dice sólo el nombre, como siempre", async () => {
    sesion.rubro = "RESTAURANTE";
    // Aunque un artículo tuviera concentración cargada, acá no se dibuja.
    await montar([med({ id: 7, nombre: "1/4 Pollo", concentracion: "x", manejaLote: false })]);
    // El renglón del carrito es el <p>; el <h3> es la tarjeta de la grilla.
    expect(screen.getByText("1/4 Pollo", { selector: "p" }).textContent).toBe("1/4 Pollo");
  });
});

describe("QA PER-07b: el profesional de cada línea (belleza con agenda)", () => {
  const marco = { id: 3, nombre: "Marco", precios: {}, servicioIds: [7], comisionaProductos: false };
  const nico = { id: 4, nombre: "Nico", precios: {}, servicioIds: [7], comisionaProductos: false };
  const corte = med({ id: 7, nombre: "Corte clásico", tipoProducto: "SERVICIO", manejaLote: false });
  const pomada = med({ id: 8, nombre: "Pomada", manejaLote: false });

  it("dice quién tiene la línea y se cambia tocándolo; la que no lleva no dice nada", async () => {
    sesion.rubro = "BARBERIA";
    sesion.features = new Set();
    const onCambiar = vi.fn();
    await montar([corte, pomada], undefined, {
      de: (l) =>
        l.producto.id === 7 ? { actual: 4, nombre: "Nico", opciones: [marco, nico] } : null,
      onCambiar,
    });
    const linea = screen.getByLabelText("Quién atendió Corte clásico") as HTMLSelectElement;
    expect(linea.value).toBe("4");
    expect(linea.selectedOptions[0].textContent).toBe("Nico");
    expect(Array.from(linea.options).map((o) => o.textContent)).toEqual(["sin asignar", "Marco", "Nico"]);
    expect(screen.queryByLabelText("Quién atendió Pomada")).not.toBeInTheDocument();
    fireEvent.change(linea, { target: { value: "3" } });
    expect(onCambiar).toHaveBeenCalledWith(7, 3);
    fireEvent.change(linea, { target: { value: "" } });
    expect(onCambiar).toHaveBeenLastCalledWith(7, null);
  });

  it("sin profesionales (Omar) el renglón es el de siempre", async () => {
    sesion.rubro = "RESTAURANTE";
    await montar([med({ id: 7, nombre: "1/4 Pollo", manejaLote: false })]);
    expect(screen.queryByLabelText(/Quién atendió/)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
