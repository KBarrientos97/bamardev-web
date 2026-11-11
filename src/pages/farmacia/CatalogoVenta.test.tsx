import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Categoria, Producto } from "../../types";

/**
 * La grilla del punto de venta de farmacia: chips de categoría que filtran en
 * el servidor, tarjetas que se tocan para sumar a la venta, y el campo que
 * recibe al lector de código de barras.
 */

/** `lotes` es PRO: una farmacia BASICO no tiene Vencimientos. */
const plan = vi.hoisted(() => ({ lotes: true }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ puede: () => true, incluye: (c: string) => (c === "lotes" ? plan.lotes : true) }),
}));

vi.mock("../../lib/api", () => ({
  api: { buscarProductos: vi.fn(), crearEncargo: vi.fn() },
}));

// El pitido del lector: en jsdom no hay audio, y lo que importa es CUÁNDO suena.
vi.mock("./sonido", () => ({ pitidoDeError: vi.fn() }));

import { api } from "../../lib/api";
import CatalogoVenta from "./CatalogoVenta";
import { pitidoDeError } from "./sonido";
import { ContextoVentaFarmacia, type VentaFarmacia } from "./ventaFarmacia";

function med(over: Partial<Producto>): Producto {
  return {
    id: 1,
    nombre: "Ibuprofeno 400 mg",
    descripcion: null,
    codBarra: null,
    tipoProducto: "ALMACENABLE",
    precio: 0.7,
    costo: 0.3,
    stockMinimo: 10,
    habilitado: true,
    icono: null,
    categoria: null,
    unidadMedida: null,
    stockTotal: 180,
    componentes: [],
    principioActivo: "Ibuprofeno",
    concentracion: "400 mg",
    formaFarmaceutica: "Comprimido",
    laboratorio: "INTI",
    registroSanitario: null,
    condicionVenta: "LIBRE",
    manejaLote: true,
    controlado: false,
    proximoVencimiento: { fecha: "2026-10-09", dias: 13, tramo: "HASTA_30" },
    ...over,
  };
}

const ibuprofeno = med({});
const ranitidina = med({
  id: 2,
  nombre: "Ranitidina 150 mg",
  concentracion: "150 mg",
  stockTotal: 0,
  proximoVencimiento: null,
});

const categorias: Categoria[] = [
  { id: 3, nombre: "Antibióticos", activo: true } as Categoria,
  { id: 4, nombre: "Vieja", activo: false } as Categoria,
];

const agregar = vi.fn();
const avisar = vi.fn();

function montar(enCarrito = new Map<number, number>()) {
  const venta = { carrito: {} as VentaFarmacia["carrito"], agregar, fijarCantidad: vi.fn(), recetas: new Map(), pedirReceta: vi.fn(), avisar } satisfies VentaFarmacia;
  render(
    <MemoryRouter>
      <ContextoVentaFarmacia.Provider value={venta}>
        <CatalogoVenta categorias={categorias} enCarrito={enCarrito} />
      </ContextoVentaFarmacia.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  plan.lotes = true;
  vi.mocked(api.buscarProductos).mockResolvedValue({
    items: [ibuprofeno, ranitidina],
    total: 2,
    limite: 24,
    offset: 0,
  });
});

describe("la grilla", () => {
  it("tocar una tarjeta la suma; una agotada no se puede tocar", async () => {
    montar();
    // Más margen que el segundo por defecto: la búsqueda espera a que se deje
    // de teclear, y con toda la suite corriendo a la vez eso se pasaba.
    const tarjeta = await screen.findByRole(
      "button",
      { name: /Ibuprofeno 400 mg/ },
      { timeout: 4000 },
    );
    await act(async () => {
      fireEvent.click(tarjeta);
    });
    expect(agregar).toHaveBeenCalledWith(ibuprofeno);

    expect(screen.getByRole("button", { name: /Ranitidina 150 mg/ })).toBeDisabled();
    expect(screen.getByText("Agotado")).toBeInTheDocument();
  });

  it("lo que sólo tiene cajas vencidas dice Vencido y no se puede tocar", async () => {
    // El bug: FEFO vendía primero la caja vencida. Ahora no se vende, y la
    // tarjeta lo dice en vez de ofrecerla.
    vi.mocked(api.buscarProductos).mockResolvedValue({
      items: [
        med({ id: 7, nombre: "Diclofenaco 50 mg", stockTotal: 6, stockVencido: 6, proximoVencimiento: null }),
        med({ id: 8, nombre: "Loratadina 10 mg", stockTotal: 30, stockVencido: 4 }),
      ],
      total: 2,
      limite: 24,
      offset: 0,
    });
    montar();
    const vencido = await screen.findByRole("button", { name: /Diclofenaco 50 mg/ }, { timeout: 4000 });
    expect(vencido).toBeDisabled();
    expect(vencido).toHaveTextContent("Vencido");
    // Con cajas buenas: se vende lo vigente y avisa las vencidas.
    const conVencidas = screen.getByRole("button", { name: /Loratadina 10 mg/ });
    expect(conVencidas).toBeEnabled();
    expect(conVencidas).toHaveTextContent("26 u.");
    expect(conVencidas).toHaveTextContent("4 u. vencidas: no se venden");
  });

  it("un combo en 0 se ve agotado y no se puede tocar, como un producto", async () => {
    // El combo tiene su propio stock y el carrito ya lo topa; la tarjeta
    // miraba sólo el almacenable y lo ofrecía como vendible (POS-2).
    vi.mocked(api.buscarProductos).mockResolvedValue({
      items: [
        med({ id: 9, nombre: "Combo botiquín", tipoProducto: "COMPUESTO", stockTotal: 0, proximoVencimiento: null }),
      ],
      total: 1,
      limite: 24,
      offset: 0,
    });
    montar();
    const combo = await screen.findByRole("button", { name: /Combo botiquín/ }, { timeout: 4000 });
    expect(combo).toBeDisabled();
    expect(combo).toHaveTextContent("Agotado");
  });

  it("el punto dice cuándo vence el lote que se vende primero", async () => {
    montar();
    expect(await screen.findByLabelText("Vencimiento: 13 días")).toHaveClass("bg-danger");
  });

  it("sin `lotes` en el plan no hay punto de vencimiento: no tiene adónde llevar", async () => {
    // El bug del 16-oct: una farmacia sin Vencimientos veía "Vence hoy".
    plan.lotes = false;
    montar();
    await screen.findByRole("button", { name: /Ibuprofeno 400 mg/ }, { timeout: 4000 });
    expect(screen.queryByLabelText(/^Vencimiento:/)).not.toBeInTheDocument();
  });

  it("marca lo que ya está en la venta", async () => {
    montar(new Map([[1, 2]]));
    expect(await screen.findByText("2 en la venta")).toBeInTheDocument();
  });

  it("si la búsqueda falla se ve sólo el error, con Reintentar; no 'No hay nada'", async () => {
    // B14: la búsqueda fallida deja la lista vacía, y debajo del error
    // aparecía "No hay nada con …": quien atiende leía que el remedio no
    // existía cuando lo que no había era conexión.
    vi.mocked(api.buscarProductos).mockRejectedValue(new Error("Sin conexión"));
    montar();
    expect(await screen.findByText("Sin conexión", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(/No hay nada/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No hay medicamentos/)).not.toBeInTheDocument();

    vi.mocked(api.buscarProductos).mockResolvedValue({
      items: [ibuprofeno],
      total: 1,
      limite: 24,
      offset: 0,
    });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("button", { name: /Ibuprofeno 400 mg/ })).toBeInTheDocument();
    expect(screen.queryByText("Sin conexión")).not.toBeInTheDocument();
  });
});

describe("encargar lo que no hay", () => {
  it("la tarjeta agotada ofrece Encargar y abre el alta con el producto; la que tiene stock no", async () => {
    // #17: "hoy no tengo, te lo consigo" es una venta. Antes anotarla eran
    // siete acciones por el menú y nadie las hacía con el cliente enfrente.
    vi.mocked(api.crearEncargo).mockResolvedValue({} as never);
    montar();
    await screen.findByRole("button", { name: /Ranitidina 150 mg/ }, { timeout: 4000 });
    const encargar = screen.getAllByRole("button", { name: /Encargar/ });
    expect(encargar).toHaveLength(1);
    // El de la tarjeta: hermano del botón deshabilitado, no adentro.
    expect(encargar[0].closest("li")).toHaveTextContent("Ranitidina 150 mg");
    expect(screen.getByRole("button", { name: /Ibuprofeno 400 mg/ }).closest("li")).not.toHaveTextContent("Encargar");

    await act(async () => {
      fireEvent.click(encargar[0]);
    });
    expect(screen.getByRole("dialog", { name: "Nuevo encargo" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("La crema para la alergia, la de pomo azul")).toHaveValue(
      "Ranitidina 150 mg",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anotar" }));
    });
    expect(api.crearEncargo).toHaveBeenCalledWith(
      expect.objectContaining({ productoId: 2, descripcion: "Ranitidina 150 mg", cantidad: 1 }),
    );
    expect(avisar).toHaveBeenCalledWith("Encargo anotado: Ranitidina 150 mg");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("los chips de categoría", () => {
  it("piden esa categoría al servidor, y no ofrecen las apagadas", async () => {
    montar();
    await screen.findByRole("button", { name: /Ibuprofeno/ });
    expect(screen.queryByRole("button", { name: "Vieja" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Antibióticos" }));
    await waitFor(() =>
      expect(api.buscarProductos).toHaveBeenLastCalledWith(
        expect.objectContaining({ categoriaId: 3, soloHabilitados: true }),
      ),
    );
  });
});

describe("el lector de código de barras", () => {
  it("Enter con un solo resultado lo suma y deja el campo listo para el próximo", async () => {
    montar();
    await screen.findByRole("button", { name: /Ibuprofeno/ });
    vi.mocked(api.buscarProductos).mockResolvedValue({
      items: [ibuprofeno],
      total: 1,
      limite: 24,
      offset: 0,
    });
    const campo = screen.getByPlaceholderText(/Buscá o escaneá/);
    fireEvent.change(campo, { target: { value: "7790001" } });
    await waitFor(() =>
      expect(api.buscarProductos).toHaveBeenLastCalledWith(expect.objectContaining({ q: "7790001" })),
    );
    await screen.findByText("Ibuprofeno 400 mg");
    await waitFor(() => expect(screen.queryByText("Ranitidina 150 mg")).not.toBeInTheDocument());

    fireEvent.keyDown(campo, { key: "Enter" });
    expect(agregar).toHaveBeenCalledWith(ibuprofeno);
    expect(campo).toHaveValue("");
    // Se cargó: nada que avisar ni que hacer sonar.
    expect(avisar).not.toHaveBeenCalled();
    expect(pitidoDeError).not.toHaveBeenCalled();
  });

  it("con un solo resultado agotado igual se lo pasa a la venta, que dice por qué no, y suena", async () => {
    // B9: el Enter sobre un agotado no hacía nada, en silencio. Ahora la venta
    // decide (y avisa "agotado", "vencido" o "no se vende acá"); acá se oye.
    montar();
    await screen.findByRole("button", { name: /Ranitidina/ });
    responderSegunTexto({ "7790002": [ranitidina] });

    const campo = screen.getByPlaceholderText(/Buscá o escaneá/);
    fireEvent.change(campo, { target: { value: "7790002" } });
    fireEvent.keyDown(campo, { key: "Enter" });

    await waitFor(() => expect(agregar).toHaveBeenCalledWith(ranitidina));
    expect(pitidoDeError).toHaveBeenCalledTimes(1);
    // El texto se queda: la tarjeta del agotado (con "Encargar") sigue a la vista.
    expect(campo).toHaveValue("7790002");
  });

  /*
   * Así escribe un lector de verdad: el código y el Enter en milisegundos,
   * antes de que la búsqueda pregunte nada. En pantalla todavía está la lista
   * anterior (dos productos), y decidir con eso dejaba el producto afuera.
   */
  function responderSegunTexto(porTexto: Record<string, Producto[]>) {
    vi.mocked(api.buscarProductos).mockImplementation(async ({ q }) => {
      const items = porTexto[q ?? ""] ?? [ibuprofeno, ranitidina];
      return { items, total: items.length, limite: 24, offset: 0 };
    });
  }

  it("el Enter que llega antes que la respuesta igual suma el producto", async () => {
    montar();
    await screen.findByRole("button", { name: /Ranitidina/ });
    responderSegunTexto({ "7790001": [ibuprofeno] });

    const campo = screen.getByPlaceholderText(/Buscá o escaneá/);
    fireEvent.change(campo, { target: { value: "7790001" } });
    fireEvent.keyDown(campo, { key: "Enter" });

    await waitFor(() => expect(agregar).toHaveBeenCalledWith(ibuprofeno));
    expect(agregar).toHaveBeenCalledTimes(1);
    expect(campo).toHaveValue("");
  });

  it("con dos resultados el Enter no elige por la persona, llegue cuando llegue; avisa y suena", async () => {
    montar();
    await screen.findByRole("button", { name: /Ranitidina/ });
    responderSegunTexto({ ibu: [ibuprofeno, med({ id: 3, nombre: "Ibuprofeno 600 mg" })] });

    const campo = screen.getByPlaceholderText(/Buscá o escaneá/);
    fireEvent.change(campo, { target: { value: "ibu" } });
    fireEvent.keyDown(campo, { key: "Enter" });

    // Se ve la respuesta de "ibu", y nadie la eligió.
    expect(await screen.findByText("Ibuprofeno 600 mg")).toBeInTheDocument();
    expect(agregar).not.toHaveBeenCalled();
    expect(campo).toHaveValue("ibu");
    // B9: antes no pasaba nada, en silencio, y quien escaneaba daba el remedio
    // por cargado.
    await waitFor(() =>
      expect(avisar).toHaveBeenCalledWith('Hay 2 coincidencias con "ibu": elegí en la grilla'),
    );
    expect(pitidoDeError).toHaveBeenCalledTimes(1);
  });

  it("si después del Enter se siguió escribiendo, ese Enter ya no carga nada", async () => {
    montar();
    await screen.findByRole("button", { name: /Ranitidina/ });
    let responder!: (p: { items: Producto[]; total: number; limite: number; offset: number }) => void;
    vi.mocked(api.buscarProductos).mockImplementation(({ q }) =>
      q === "ibu"
        ? new Promise((r) => {
            responder = r;
          })
        : Promise.resolve({ items: [ibuprofeno], total: 1, limite: 24, offset: 0 }),
    );

    const campo = screen.getByPlaceholderText(/Buscá o escaneá/);
    fireEvent.change(campo, { target: { value: "ibu" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    fireEvent.change(campo, { target: { value: "ibupro" } });
    await act(async () => {
      responder({ items: [ibuprofeno], total: 1, limite: 24, offset: 0 });
    });

    expect(agregar).not.toHaveBeenCalled();
    expect(campo).toHaveValue("ibupro");
  });
});

describe("la sucursal de la caja", () => {
  it("pide el stock de la sucursal de la caja, y muestra la ubicación si la hay", async () => {
    vi.mocked(api.buscarProductos).mockResolvedValue({
      items: [med({ ubicacion: "Estante 3 · fila B" }), ranitidina],
      total: 2,
      limite: 24,
      offset: 0,
    });
    const venta = { carrito: {} as VentaFarmacia["carrito"], agregar, fijarCantidad: vi.fn(), recetas: new Map(), pedirReceta: vi.fn() } satisfies VentaFarmacia;
    render(
      <MemoryRouter>
        <ContextoVentaFarmacia.Provider value={venta}>
          <CatalogoVenta categorias={categorias} enCarrito={new Map()} sucursalId={917} />
        </ContextoVentaFarmacia.Provider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Estante 3 · fila B")).toBeInTheDocument();
    expect(api.buscarProductos).toHaveBeenCalledWith(expect.objectContaining({ sucursalId: 917 }));
    // La que no tiene ubicación no dibuja nada: es opcional.
    const sinUbicacion = screen.getByRole("button", { name: /Ranitidina/ });
    expect(sinUbicacion).not.toHaveTextContent("Estante");
  });
});
