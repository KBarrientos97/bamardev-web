import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Encargo, ListaEncargos, Producto } from "../../types";

/**
 * El alta de un encargo: el artículo del catálogo se BUSCA.
 *
 * Antes era un desplegable con los primeros 100 productos, y con el catálogo
 * de una farmacia de verdad (2.000 medicamentos) lo que pedían casi nunca
 * estaba ahí.
 *
 * Y la lista (B14, 11-nov): un corte de red no dice "no hay encargos", y mover
 * uno no la manda entera a spinner.
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
    getEncargos: vi.fn(),
    getSucursales: vi.fn(),
    cajaActual: vi.fn(),
    buscarProductos: vi.fn(),
    crearEncargo: vi.fn(),
    cambiarEstadoEncargo: vi.fn(),
  },
}));

import { api } from "../../lib/api";
import Encargos from "./Encargos";

const tramadol = {
  id: 2796,
  nombre: "Tramadol",
  concentracion: "50 mg",
  principioActivo: "Tramadol clorhidrato",
  laboratorio: "LAFAR",
  formaFarmaceutica: "Cápsula",
  stockTotal: 29,
  unidadMedida: { id: 1, nombre: "Unidad" },
} as unknown as Producto;

beforeEach(() => {
  vi.clearAllMocks();
  sesion.sucursalId = null;
  sesion.sucursal = null;
  sesion.activas = 1;
  vi.mocked(api.getSucursales).mockResolvedValue([
    { id: 1, nombre: "Centro", activo: true, tipo: "SUCURSAL", esPrincipal: true },
    { id: 2, nombre: "Equipetrol", activo: true, tipo: "SUCURSAL", esPrincipal: false },
  ] as never);
  vi.mocked(api.cajaActual).mockResolvedValue({ caja: null });
  vi.mocked(api.getEncargos).mockResolvedValue({
    abiertos: 0,
    anotados: 0,
    pedidos: 0,
    llegaron: 0,
    entregados: 0,
    items: [],
  } as never);
  vi.mocked(api.buscarProductos).mockResolvedValue({
    items: [tramadol],
    total: 1,
    limite: 8,
    offset: 0,
  });
  vi.mocked(api.crearEncargo).mockResolvedValue({} as never);
  vi.mocked(api.cambiarEstadoEncargo).mockResolvedValue({} as never);
});

async function abrirFormulario() {
  render(<Encargos />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
  });
}

describe("el artículo del encargo", () => {
  it("abrir el formulario no trae el catálogo: se busca lo que se escribe", async () => {
    await abrirFormulario();
    // Sin texto no se pide nada (antes: los primeros 100, siempre).
    await new Promise((r) => setTimeout(r, 300));
    expect(api.buscarProductos).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Artículo del catálogo"), {
      target: { value: "trama" },
    });
    await waitFor(() =>
      expect(api.buscarProductos).toHaveBeenCalledWith(expect.objectContaining({ q: "trama" })),
    );
    expect(await screen.findByText("50 mg")).toBeInTheDocument();
  });

  it("el elegido dice cuánto hay y viaja con el encargo", async () => {
    await abrirFormulario();
    fireEvent.change(screen.getByLabelText("Artículo del catálogo"), {
      target: { value: "trama" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /Tramadol/ }));

    expect(screen.getByText("LAFAR · Hay 29 u.")).toBeInTheDocument();
    // Tocar el nombre no lo quita (dentro de un <label> sí lo hacía).
    fireEvent.click(screen.getByText("Tramadol"));
    expect(screen.getByRole("button", { name: "Quitar el artículo" })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/La crema para la alergia/), {
      target: { value: "Tramadol de 50" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anotar" }));
    });
    expect(api.crearEncargo).toHaveBeenCalledWith(
      expect.objectContaining({ productoId: 2796, descripcion: "Tramadol de 50" }),
    );
  });

  it("quitado, el encargo se anota sin artículo", async () => {
    await abrirFormulario();
    fireEvent.change(screen.getByLabelText("Artículo del catálogo"), {
      target: { value: "trama" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /Tramadol/ }));
    fireEvent.click(screen.getByRole("button", { name: "Quitar el artículo" }));
    expect(screen.getByLabelText("Artículo del catálogo")).toHaveValue("");

    fireEvent.change(screen.getByPlaceholderText(/La crema para la alergia/), {
      target: { value: "La crema del pomo azul" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anotar" }));
    });
    expect(api.crearEncargo).toHaveBeenCalledWith(
      expect.not.objectContaining({ productoId: expect.anything() }),
    );
  });

  it("dos clics en el mismo tick anotan uno solo", async () => {
    await abrirFormulario();
    fireEvent.change(screen.getByPlaceholderText(/La crema para la alergia/), {
      target: { value: "La crema del pomo azul" },
    });
    await act(async () => {
      const anotar = screen.getByRole("button", { name: "Anotar" });
      fireEvent.click(anotar);
      fireEvent.click(anotar);
    });
    expect(api.crearEncargo).toHaveBeenCalledTimes(1);
  });
});

const crema: Encargo = {
  id: 1,
  descripcion: "La crema del pomo azul",
  cantidad: 1,
  estado: "ANOTADO",
  clienteNombre: "Doña Marta",
  clienteTelefono: null,
  nota: null,
  producto: null,
  almacen: null,
  usuario: null,
  creadoEn: "2026-11-10T12:00:00.000Z",
  llegoEn: null,
  entregadoEn: null,
  pedidoPor: 1,
  muyPedido: false,
  hayStock: false,
  diasEsperando: 1,
};

const conLaCrema: ListaEncargos = {
  abiertos: 1,
  anotados: 1,
  pedidos: 0,
  llegaron: 0,
  entregados: 0,
  cancelados: 0,
  items: [crema],
};

describe("la lista", () => {
  it("si falla la carga, dice el error con Reintentar y no que no hay encargos", async () => {
    // B14: se pintaban el cartel rojo Y "No hay nada pendiente" a la vez, y
    // las dos cosas juntas se leían como que no había encargos.
    vi.mocked(api.getEncargos).mockRejectedValueOnce(new Error("Sin conexión"));
    render(<Encargos />);
    expect(await screen.findByText("Sin conexión")).toBeInTheDocument();
    expect(screen.queryByText("No hay nada pendiente")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    expect(await screen.findByText("No hay nada pendiente")).toBeInTheDocument();
    expect(screen.queryByText("Sin conexión")).toBeNull();
  });

  it("mover un encargo no manda la lista a spinner: las filas se quedan hasta que llega la nueva", async () => {
    let soltar!: (v: ListaEncargos) => void;
    vi.mocked(api.getEncargos)
      .mockResolvedValueOnce(conLaCrema)
      .mockReturnValueOnce(new Promise((r) => (soltar = r)));
    render(<Encargos />);
    expect(await screen.findByText("La crema del pomo azul")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ya lo pedí" }));
    });
    expect(api.cambiarEstadoEncargo).toHaveBeenCalledWith(1, "PEDIDO");
    expect(screen.getByText("La crema del pomo azul")).toBeInTheDocument();
    expect(screen.queryByText("Cargando…")).toBeNull();

    await act(async () =>
      soltar({ ...conLaCrema, anotados: 0, pedidos: 1, items: [{ ...crema, estado: "PEDIDO" }] }),
    );
    expect(screen.getByText("Pedido")).toBeInTheDocument();
  });

  it("cambiar el chip no deja la lista anterior debajo del chip nuevo", async () => {
    // Lo de "Pendientes" bajo el chip "Entregados", con sus botones de avanzar,
    // mientras llegaba la lista buena.
    let soltar!: (v: ListaEncargos) => void;
    vi.mocked(api.getEncargos)
      .mockResolvedValueOnce(conLaCrema)
      .mockReturnValueOnce(new Promise((r) => (soltar = r)));
    render(<Encargos />);
    expect(await screen.findByText("La crema del pomo azul")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Entregados" }));
    });
    expect(screen.queryByText("La crema del pomo azul")).toBeNull();
    expect(screen.getByText("Cargando…")).toBeInTheDocument();

    await act(async () => soltar({ ...conLaCrema, items: [] }));
    expect(screen.getByText("Sin encargos acá")).toBeInTheDocument();
  });
});

describe("la sucursal", () => {
  const deEquipetrol: Encargo = {
    ...crema,
    id: 2,
    descripcion: "El jarabe de la tos",
    almacen: { id: 2, nombre: "Equipetrol" },
  };
  const deCentro: Encargo = { ...crema, almacen: { id: 1, nombre: "Centro" } };
  const mezcla: ListaEncargos = { ...conLaCrema, abiertos: 2, items: [deCentro, deEquipetrol] };

  it("con un solo local no aparece nada: ni selector ni etiqueta", async () => {
    vi.mocked(api.getSucursales).mockResolvedValue([
      { id: 1, nombre: "Centro", activo: true, tipo: "SUCURSAL", esPrincipal: true },
    ] as never);
    vi.mocked(api.getEncargos).mockResolvedValue(mezcla);
    render(<Encargos />);
    expect(await screen.findByText("El jarabe de la tos")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Equipetrol" })).toBeNull();
    expect(screen.queryByText("Equipetrol")).toBeNull();
  });

  it("la organización con 2 locales elige cuál ve y cada tarjeta dice el suyo", async () => {
    sesion.activas = 2;
    vi.mocked(api.getEncargos).mockResolvedValue(mezcla);
    render(<Encargos />);
    expect(await screen.findByText("El jarabe de la tos")).toBeInTheDocument();
    // La etiqueta está porque la lista mezcla dos locales.
    // Selector (botón) + etiqueta de la tarjeta (badge): dos de cada local.
    expect(screen.getAllByText("Equipetrol")).toHaveLength(2);
    expect(screen.getAllByText("Centro")).toHaveLength(2);

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Equipetrol" })[0]);
    });
    expect(api.getEncargos).toHaveBeenLastCalledWith(expect.objectContaining({ sucursalId: 2 }));
  });

  it("al cambiar de local no queda la lista del anterior (con sus botones) mientras llega la nueva", async () => {
    sesion.activas = 2;
    let soltar!: (v: ListaEncargos) => void;
    vi.mocked(api.getEncargos)
      .mockResolvedValueOnce(mezcla)
      .mockReturnValueOnce(new Promise((r) => (soltar = r)));
    render(<Encargos />);
    expect(await screen.findByText("El jarabe de la tos")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Equipetrol" })[0]);
    });
    expect(screen.queryByText("La crema del pomo azul")).toBeNull();
    expect(screen.queryByText("El jarabe de la tos")).toBeNull();
    expect(screen.getByText("Cargando…")).toBeInTheDocument();

    await act(async () => soltar({ ...conLaCrema, items: [deEquipetrol] }));
    expect(screen.getByText("El jarabe de la tos")).toBeInTheDocument();
  });

  it("si todos los encargos son del mismo local no repite el nombre en cada tarjeta", async () => {
    sesion.activas = 2;
    vi.mocked(api.getEncargos).mockResolvedValue({ ...conLaCrema, items: [deCentro] });
    render(<Encargos />);
    expect(await screen.findByText("La crema del pomo azul")).toBeInTheDocument();
    // "Centro" sólo está en el selector, no como etiqueta de la tarjeta.
    expect(screen.getAllByText("Centro")).toHaveLength(1);
  });

  it("el atado a un local no ve selector y sólo lee el nombre de su sede", async () => {
    sesion.activas = 2;
    sesion.sucursalId = 2;
    sesion.sucursal = "Equipetrol";
    vi.mocked(api.getEncargos).mockResolvedValue({ ...conLaCrema, items: [deEquipetrol] });
    render(<Encargos />);
    expect(await screen.findByText("El jarabe de la tos")).toBeInTheDocument();
    expect(screen.getByText(/esperando · Equipetrol/)).toBeInTheDocument();
    expect(api.getSucursales).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Centro" })).toBeNull();
  });

  it("al anotar, la organización elige el local y viaja como almacenId", async () => {
    sesion.activas = 2;
    vi.mocked(api.getEncargos).mockResolvedValue(conLaCrema);
    // Con la caja abierta en Equipetrol, ahí se propone anotar.
    vi.mocked(api.cajaActual).mockResolvedValue({ caja: { almacenId: 2 } } as never);
    render(<Encargos />);
    await screen.findByText("La crema del pomo azul");
    await waitFor(() => expect(api.cajaActual).toHaveBeenCalled());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    });
    const local = screen.getByLabelText("Sucursal del encargo");
    expect(local).toHaveValue("2");
    fireEvent.change(local, { target: { value: "1" } });
    fireEvent.change(screen.getByPlaceholderText(/La crema para la alergia/), {
      target: { value: "Algo que no había" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anotar" }));
    });
    expect(api.crearEncargo).toHaveBeenCalledWith(
      expect.objectContaining({ descripcion: "Algo que no había", almacenId: 1 }),
    );
  });

  it("con un solo local el alta no muestra el campo ni manda almacenId", async () => {
    vi.mocked(api.getSucursales).mockResolvedValue([
      { id: 1, nombre: "Centro", activo: true, tipo: "SUCURSAL", esPrincipal: true },
    ] as never);
    await abrirFormulario();
    expect(screen.queryByLabelText("Sucursal del encargo")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText(/La crema para la alergia/), {
      target: { value: "Algo" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anotar" }));
    });
    expect(api.crearEncargo).toHaveBeenCalledWith(
      expect.not.objectContaining({ almacenId: expect.anything() }),
    );
  });
});
