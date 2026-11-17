import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";

/**
 * Pausar un producto en la sucursal desde el punto de venta (PLAN-ELGANADERO-
 * 16NOV §4.1): la hoja de pausar o reactivar con `productos.pausar`, la
 * tarjeta en gris con «Pausado», el chip «Pausados (N)» y la confirmación al
 * venderlo.
 */

const sesion = vi.hoisted(() => ({ permisos: ["productos.pausar"] as string[] }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: { alias: "elganadero" },
    usuario: { username: "ana", permisos: sesion.permisos },
    rubro: "RESTAURANTE",
    incluye: () => false,
    puede: () => true,
  }),
}));

vi.mock("../../lib/api", () => ({
  api: { productosPausados: vi.fn(), pausarProducto: vi.fn(), reactivarProducto: vi.fn() },
}));

import { api } from "../../lib/api";
import PantallaVenta from "./PantallaVenta";
import type { Carrito } from "./useCarrito";

const producto = (id: number, nombre: string): Producto =>
  ({
    id,
    nombre,
    precio: 35,
    tipoProducto: "ALMACENABLE",
    stockTotal: 10,
    habilitado: true,
    componentes: [],
  }) as unknown as Producto;

const NUTELLA = producto(1, "Nutella L");
const OREO = producto(2, "Oreo");

function carritoVacio(): Carrito {
  return {
    lineas: [],
    unidades: 0,
    subtotal: 0,
    total: 0,
    agregar: vi.fn(),
    setCantidad: vi.fn(),
    setAgregados: vi.fn(),
    setNota: vi.fn(),
    setEnMesa: vi.fn(),
    setConsumo: vi.fn(),
    setConsumoTodo: vi.fn(),
    quitar: vi.fn(),
    vaciar: vi.fn(),
    aDetalles: vi.fn(() => []),
  };
}

const lista = (ids: number[]) => ({
  sucursal: { id: 3, nombre: "Plazuela Fátima" },
  pausados: ids.map((productoId) => ({ productoId, nombre: "x", desde: "2026-11-16T12:00:00Z", por: "darwin" })),
});

let carrito: Carrito;

async function montar() {
  carrito = carritoVacio();
  render(
    <MemoryRouter>
      <PantallaVenta productos={[NUTELLA, OREO]} categorias={[]} carrito={carrito} onCobrar={() => {}} sucursalId={3} />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  sesion.permisos = ["productos.pausar"];
  vi.mocked(api.productosPausados).mockResolvedValue(lista([]));
});

describe("la tarjeta de un producto pausado", () => {
  it("sale en gris con «Pausado» y el chip «Pausados (N)» cuenta los de la grilla", async () => {
    vi.mocked(api.productosPausados).mockResolvedValue(lista([1]));
    await montar();
    expect(api.productosPausados).toHaveBeenCalledWith(3);
    const tarjeta = screen.getByRole("heading", { name: "Nutella L" }).closest("li")!;
    // Tres lugares (17-nov): la etiqueta de siempre si la tarjeta es ancha, una
    // pastilla al lado del ícono si es angosta, o debajo del nombre si es más
    // angosta todavía. Cuál se ve lo decide el CSS por el ancho de la tarjeta.
    expect(within(tarjeta).getAllByText("Pausado")).toHaveLength(3);
    expect(tarjeta.firstElementChild!.className).toContain("grayscale");
    // La que no está pausada no cambia.
    const otra = screen.getByRole("heading", { name: "Oreo" }).closest("li")!;
    expect(within(otra).queryByText("Pausado")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pausados (1)" })).toBeInTheDocument();
  });

  it("sin pausados no hay chip, y el «Pausados» filtra y se desarma al reactivar el último", async () => {
    await montar();
    expect(screen.queryByRole("button", { name: /Pausados/ })).not.toBeInTheDocument();
    // Los pausados de otro local no se mezclan: al cambiar la lista cambia el chip.
    vi.mocked(api.productosPausados).mockResolvedValue(lista([1]));
    // Lo pausa el encargado desde otro lado: la caja lo ve al volver a la pestaña.
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    fireEvent.click(screen.getByRole("button", { name: "Pausados (1)" }));
    expect(screen.getByRole("heading", { name: "Nutella L" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Oreo" })).not.toBeInTheDocument();
    // Reactivar el último vuelve a «Todos».
    fireEvent.click(screen.getByRole("button", { name: "Reactivar Nutella L" }));
    vi.mocked(api.reactivarProducto).mockResolvedValue({ productoId: 1, sucursalId: 3, pausado: false });
    vi.mocked(api.productosPausados).mockResolvedValue(lista([]));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reactivar" }));
    });
    expect(api.reactivarProducto).toHaveBeenCalledWith(1, 3);
    expect(screen.queryByRole("button", { name: /Pausados/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Oreo" })).toBeInTheDocument();
  });
});

describe("vender un producto pausado", () => {
  it("pregunta antes de agregarlo, con el texto del plan", async () => {
    vi.mocked(api.productosPausados).mockResolvedValue(lista([1]));
    await montar();
    fireEvent.click(screen.getByRole("heading", { name: "Nutella L" }));
    expect(
      screen.getByText("Nutella L está pausado en Plazuela Fátima (no se pide por la página). ¿Venderlo igual?"),
    ).toBeInTheDocument();
    expect(carrito.agregar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, venderlo" }));
    expect(carrito.agregar).toHaveBeenCalledWith(NUTELLA);
  });

  it("si dice que no, no se agrega", async () => {
    vi.mocked(api.productosPausados).mockResolvedValue(lista([1]));
    await montar();
    fireEvent.click(screen.getByRole("heading", { name: "Nutella L" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(carrito.agregar).not.toHaveBeenCalled();
  });

  it("un producto que no está pausado se agrega de una, sin preguntar", async () => {
    vi.mocked(api.productosPausados).mockResolvedValue(lista([1]));
    await montar();
    fireEvent.click(screen.getByRole("heading", { name: "Oreo" }));
    expect(carrito.agregar).toHaveBeenCalledWith(OREO);
    expect(screen.queryByText(/está pausado en/)).not.toBeInTheDocument();
  });
});

describe("la hoja de pausar", () => {
  it("con el permiso: «⋯», «Pausar en {sucursal}» y la tarjeta pasa a gris", async () => {
    vi.mocked(api.productosPausados).mockResolvedValue(lista([]));
    vi.mocked(api.pausarProducto).mockResolvedValue({ productoId: 2, sucursalId: 3, pausado: true });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Pausar Oreo" }));
    const hoja = await screen.findByRole("dialog", { name: "Pausar producto" });
    // Sin el nombre del local no sabe a cuál pausa: la lista ya lo trajo.
    vi.mocked(api.productosPausados).mockResolvedValue(lista([2]));
    await act(async () => {
      fireEvent.click(within(hoja).getByRole("button", { name: "Pausar en Plazuela Fátima" }));
    });
    expect(api.pausarProducto).toHaveBeenCalledWith(2, 3);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const tarjeta = screen.getByRole("heading", { name: "Oreo" }).closest("li")!;
    expect(within(tarjeta).getAllByText("Pausado").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Pausados (1)" })).toBeInTheDocument();
  });

  it("sin el permiso la tarjeta sale igual en gris, pero no se ofrece pausar ni reactivar", async () => {
    sesion.permisos = ["ventas.vender"];
    vi.mocked(api.productosPausados).mockResolvedValue(lista([1]));
    await montar();
    expect(screen.getAllByText("Pausado").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^(Pausar|Reactivar) / })).not.toBeInTheDocument();
    // Y el aviso al venderlo es el mismo.
    fireEvent.click(screen.getByRole("heading", { name: "Nutella L" }));
    expect(screen.getByText(/está pausado en Plazuela Fátima/)).toBeInTheDocument();
  });

  it("sin internet avisa y no manda nada ni lo deja en cola", async () => {
    await montar();
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Pausar Oreo" }));
    const hoja = await screen.findByRole("dialog", { name: "Pausar producto" });
    fireEvent.click(within(hoja).getByRole("button", { name: /^Pausar en/ }));
    expect(within(hoja).getByText(/Sin internet/)).toBeInTheDocument();
    expect(api.pausarProducto).not.toHaveBeenCalled();
    online.mockRestore();
  });

  it("si el servidor rechaza, lo dice y la hoja sigue abierta", async () => {
    vi.mocked(api.pausarProducto).mockRejectedValue(new Error("No tenés permiso para pausar productos"));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Pausar Oreo" }));
    const hoja = await screen.findByRole("dialog", { name: "Pausar producto" });
    await act(async () => {
      fireEvent.click(within(hoja).getByRole("button", { name: /^Pausar en/ }));
    });
    expect(within(hoja).getByText("No tenés permiso para pausar productos")).toBeInTheDocument();
    expect(screen.queryByText("Pausado")).not.toBeInTheDocument();
  });
});

describe("un backend sin la ruta (o sin conexión)", () => {
  it("la grilla sale como siempre, sin chip ni gris", async () => {
    vi.mocked(api.productosPausados).mockRejectedValue(new Error("Not Found"));
    await montar();
    expect(screen.queryByText("Pausado")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pausados/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("heading", { name: "Nutella L" }));
    expect(carrito.agregar).toHaveBeenCalledWith(NUTELLA);
  });
});
