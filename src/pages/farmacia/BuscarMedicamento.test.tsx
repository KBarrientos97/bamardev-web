import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Existencia, Producto } from "../../types";

/**
 * Buscar medicamento compara y vende: "Agregar" suma a la venta sin salir de
 * la pantalla, y la ficha es de consulta — sin costos ni botones del dueño —,
 * dice cuánto hay en cada sucursal y dónde está, si alguien lo cargó.
 */

const sesion = vi.hoisted(() => ({
  pos: true,
  rol: "ADMIN" as string,
  sucursalId: null as number | null,
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    puede: (s: string) => (s === "pos" ? sesion.pos : true),
    incluye: () => true,
    usuario: { rol: sesion.rol, sucursalId: sesion.sucursalId },
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    buscarProductos: vi.fn(),
    cajaActual: vi.fn(),
    existenciasProducto: vi.fn(),
    ubicacionesUsadas: vi.fn(async () => ["Estante 3 · fila B"]),
    fijarUbicacionProducto: vi.fn(async () => ({ ubicacion: "Vitrina 1" })),
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

function existencia(over: Partial<Existencia>): Existencia {
  return {
    almacenId: 917,
    nombre: "Sucursal Centro",
    tipo: "SUCURSAL",
    esPrincipal: true,
    direccion: null,
    telefono: "3-3336060",
    cantidad: 0,
    ubicacion: null,
    ...over,
  };
}

const amoxicilina = med({ ubicacion: "Estante 3 · fila B" });
const ranitidina = med({ id: 2, nombre: "Ranitidina 150 mg", stockTotal: 0 });
const agregar = vi.fn();

async function montar() {
  const venta = { carrito: {} as VentaFarmacia["carrito"], agregar, fijarCantidad: vi.fn(), recetas: new Map(), pedirReceta: vi.fn() } satisfies VentaFarmacia;
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

async function abrirFicha(nombre: string) {
  await tocar(within(fila(nombre)).getByRole("button", { name: /Ficha/ }));
  return screen.getByRole("dialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.pos = true;
  sesion.rol = "ADMIN";
  sesion.sucursalId = null;
  vi.mocked(api.cajaActual).mockResolvedValue({ caja: null });
  vi.mocked(api.buscarProductos).mockResolvedValue({
    items: [amoxicilina, ranitidina],
    total: 2,
    limite: 20,
    offset: 0,
  });
  vi.mocked(api.existenciasProducto).mockResolvedValue([
    existencia({ cantidad: 0 }),
    existencia({
      almacenId: 1141,
      nombre: "Sucursal Equipetrol",
      esPrincipal: false,
      telefono: "3-3441212",
      cantidad: 25,
    }),
  ]);
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
    const ficha = await abrirFicha("Ranitidina 150 mg");
    expect(within(ficha).queryByRole("button", { name: /Agregar a la venta/ })).toBeNull();
  });

  it("quien no vende consulta, pero no ve Agregar", async () => {
    sesion.pos = false;
    await montar();
    expect(within(fila("Amoxicilina 500 mg")).queryByRole("button", { name: "Agregar" })).toBeNull();
  });

  it("la ubicación se ve sólo si alguien la cargó", async () => {
    await montar();
    expect(within(fila("Amoxicilina 500 mg")).getByText("Estante 3 · fila B")).toBeInTheDocument();
    expect(within(fila("Ranitidina 150 mg")).queryByText(/Estante/)).toBeNull();
  });
});

describe("mientras carga", () => {
  it("no dice que el catálogo está vacío antes de la primera respuesta", async () => {
    // Mientras se averigua la caja la búsqueda está apagada: se leía "El
    // catálogo está vacío" en una farmacia con 400 medicamentos.
    let soltarCaja!: (v: { caja: null }) => void;
    vi.mocked(api.cajaActual).mockReturnValue(new Promise((r) => (soltarCaja = r)));
    render(
      <MemoryRouter>
        <BuscarMedicamento />
      </MemoryRouter>,
    );
    expect(screen.getByText("Buscando…")).toBeInTheDocument();
    expect(screen.queryByText("El catálogo está vacío")).not.toBeInTheDocument();

    await act(async () => soltarCaja({ caja: null }));
    // Ya con la caja, durante la espera del tecleo tampoco.
    expect(screen.queryByText("El catálogo está vacío")).not.toBeInTheDocument();
    expect(await screen.findAllByText("Amoxicilina 500 mg")).not.toHaveLength(0);
  });
});

describe("la sucursal de la caja", () => {
  it("con una caja abierta, el stock es el de su sucursal y lo dice", async () => {
    // El dueño no pertenece a ninguna sucursal: sin esto veía el stock del
    // negocio entero y "Agregar" le ofrecía lo que su mostrador no tiene.
    vi.mocked(api.cajaActual).mockResolvedValue({
      caja: { almacenId: 917, almacen: "Sucursal Centro" } as never,
    });
    await montar();
    expect(api.buscarProductos).toHaveBeenCalledWith(
      expect.objectContaining({ sucursalId: 917 }),
    );
    // Y no se pidió antes el total del negocio para después corregirlo.
    expect(api.buscarProductos).not.toHaveBeenCalledWith(
      expect.objectContaining({ sucursalId: null }),
    );
    expect(screen.getByText(/stock de Sucursal Centro/)).toBeInTheDocument();
  });
});

describe("la ficha del mostrador", () => {
  it("dice lo que se pregunta, sin costos ni botones del dueño, y agrega", async () => {
    await montar();
    const ficha = await abrirFicha("Amoxicilina 500 mg");
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

  it("acá no hay, pero en la otra sucursal sí: dice cuánto y ofrece llamar", async () => {
    sesion.rol = "CAJERO";
    sesion.sucursalId = 917;
    await montar();
    const ficha = await abrirFicha("Ranitidina 150 mg");
    expect(await within(ficha).findByText("Sucursal Equipetrol")).toBeInTheDocument();
    expect(ficha).toHaveTextContent("No hay");
    expect(ficha).toHaveTextContent("25 u.");
    const llamar = within(ficha).getByRole("link", { name: /Llamar/ });
    expect(llamar).toHaveAttribute("href", "tel:3-3441212");
    // A la propia no se ofrece llamarla.
    expect(within(ficha).getAllByRole("link", { name: /Llamar/ })).toHaveLength(1);
    // Y un cajero no ordena el local: no ve cómo cargar la ubicación.
    expect(within(ficha).queryByRole("button", { name: /ubicación/i })).toBeNull();
  });

  it("lo de acá va primero y la suma dice que es de todas las sucursales", async () => {
    // C: la tarjeta del punto de venta decía 25 y la ficha "Total 65", con el
    // número del negocio entero destacado como si fuera el de este local.
    vi.mocked(api.cajaActual).mockResolvedValue({
      caja: { almacenId: 1141, almacen: "Sucursal Equipetrol" } as never,
    });
    vi.mocked(api.existenciasProducto).mockResolvedValue([
      existencia({ cantidad: 40 }),
      existencia({ almacenId: 1141, nombre: "Sucursal Equipetrol", esPrincipal: false, cantidad: 25 }),
    ]);
    await montar();
    const ficha = await abrirFicha("Amoxicilina 500 mg");
    const aca = (await within(ficha).findByText("Sucursal Equipetrol")).closest("div")!;
    expect(aca).toHaveTextContent("acá");
    expect(aca).toHaveTextContent("25 u.");

    expect(within(ficha).queryByText("Total")).toBeNull();
    const todas = within(ficha).getByText("Todas las sucursales").closest("div")!;
    expect(todas).toHaveTextContent("65 u.");
    // Primero el de acá, después la suma.
    expect(aca.compareDocumentPosition(todas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("el dueño carga la ubicación ahí mismo, y la fila se actualiza", async () => {
    await montar();
    const ficha = await abrirFicha("Ranitidina 150 mg");
    await within(ficha).findByText("Sucursal Equipetrol");
    const pedidas = vi.mocked(api.buscarProductos).mock.calls.length;

    await tocar(within(ficha).getAllByRole("button", { name: "Agregar ubicación" })[0]);
    fireEvent.change(within(ficha).getByLabelText("Ubicación en Sucursal Centro"), {
      target: { value: "  Vitrina 1 " },
    });
    await tocar(within(ficha).getByRole("button", { name: "Guardar" }));

    expect(api.fijarUbicacionProducto).toHaveBeenCalledWith(2, 917, "Vitrina 1");
    await waitFor(() =>
      expect(vi.mocked(api.buscarProductos).mock.calls.length).toBeGreaterThan(pedidas),
    );
  });
});
