import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemToma, PaginaToma } from "./toma";

/**
 * La Toma de inventario: se cuenta lote por lote, se ve la diferencia al
 * escribir, el borrador sobrevive al F5 y "Aplicar ajuste" crea el AJUSTE
 * con los renglones que exige el backend y lo aprueba si se puede.
 */

const sesion = vi.hoisted(() => ({
  dobleControl: false,
  sucursalId: 917 as number | null,
  permisos: ["inventario.mover"] as string[],
  features: [] as string[],
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: {
      id: 1,
      rol: "ADMIN",
      permisos: sesion.permisos,
      permisosPropios: [],
      sucursalId: sesion.sucursalId,
      sucursal: sesion.sucursalId == null ? null : "Sucursal Centro",
    },
    negocio: { id: 1, nombre: "Farmacia", tipoNegocio: "FARMACIA", features: sesion.features },
    rubro: "FARMACIA",
    vocabulario: undefined,
    puede: () => true,
    incluye: (c: string) => (c === "aprobacion_inventario" ? sesion.dobleControl : true),
  }),
}));

// La ruta del estante vive con la pantalla (`toma.ts`), el resto en `lib/api`.
vi.mock("./toma", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./toma")>()),
  pedirToma: vi.fn(),
}));

vi.mock("../../../lib/api", () => ({
  api: {
    getCategorias: vi.fn(async () => [
      { id: 1, nombre: "Antibióticos", activo: true },
      { id: 2, nombre: "Analgésicos", activo: true },
    ]),
    getSucursales: vi.fn(async () => []),
    crearMovimiento: vi.fn(async () => ({ id: 77 })),
    aprobarMovimiento: vi.fn(async () => ({})),
  },
}));

import { api } from "../../../lib/api";
import TomaInventario from "./TomaInventario";
import { claveBorrador, pedirToma } from "./toma";

const AMOXI: ItemToma = {
  productoId: 1,
  nombre: "Amoxicilina 500 mg",
  concentracion: "500 mg",
  laboratorio: "BAGÓ",
  codBarra: "7501",
  unidad: "Caja",
  ubicacion: "Estante 3",
  manejaLote: true,
  stock: 12,
  lotes: [
    { codigo: "AMX-1", vencimiento: "2027-03-31", cantidad: 8 },
    { codigo: "AMX-2", vencimiento: "2027-09-30", cantidad: 4 },
  ],
};

const ALCOHOL: ItemToma = {
  productoId: 2,
  nombre: "Alcohol 70%",
  concentracion: null,
  laboratorio: null,
  codBarra: null,
  unidad: "Unidad",
  ubicacion: null,
  manejaLote: false,
  stock: 10,
  lotes: [],
};

function pagina(items: ItemToma[], over: Partial<PaginaToma> = {}): PaginaToma {
  return { items, total: items.length, limite: 50, offset: 0, ...over };
}

function montar() {
  return render(
    <MemoryRouter>
      <TomaInventario />
    </MemoryRouter>,
  );
}

const contado = (etiqueta: string) => screen.getByLabelText(etiqueta) as HTMLInputElement;
const escribir = (etiqueta: string, valor: string) =>
  fireEvent.change(contado(etiqueta), { target: { value: valor } });
const tarjeta = (nombre: string) => screen.getByText(nombre).closest("li")!;
const dialogo = () => screen.getByRole("dialog", { name: "Revisar diferencias" });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sesion.dobleControl = false;
  sesion.sucursalId = 917;
  sesion.permisos = ["inventario.mover"];
  sesion.features = [];
  vi.mocked(pedirToma).mockResolvedValue(pagina([AMOXI, ALCOHOL]));
  vi.mocked(api.crearMovimiento).mockResolvedValue({ id: 77 } as never);
});

describe("la lista del estante", () => {
  it("muestra cada artículo con sus lotes, lo que dice el sistema y el vencimiento legible", async () => {
    montar();
    expect(await screen.findByText("Amoxicilina 500 mg")).toBeInTheDocument();
    // La sucursal del usuario atado, sin preguntar.
    expect(pedirToma).toHaveBeenCalledWith({
      almacenId: 917,
      q: undefined,
      categoriaId: undefined,
      limite: 50,
      offset: 0,
    });
    // 31/03 y no 30/03: la fecha se arma del texto, no con `Date` en UTC.
    expect(screen.getByText("AMX-1 · vence 31/03/2027")).toBeInTheDocument();
    expect(screen.getByText("AMX-2 · vence 30/09/2027")).toBeInTheDocument();
    expect(contado("Contado de Amoxicilina 500 mg, lote AMX-1")).toHaveAttribute("inputmode", "numeric");
    // Sin lote: un solo campo, por el total.
    expect(contado("Contado de Alcohol 70%")).toBeInTheDocument();
    expect(screen.getByText("Estante 3")).toBeInTheDocument();
    expect(screen.getByText("0 artículos contados · 0 diferencias")).toBeInTheDocument();
  });

  it("al escribir un contado se ve la diferencia: ámbar si sobra, rojo si falta, verde si cuadra", async () => {
    montar();
    await screen.findByText("Amoxicilina 500 mg");
    escribir("Contado de Amoxicilina 500 mg, lote AMX-1", "10");
    escribir("Contado de Amoxicilina 500 mg, lote AMX-2", "1");
    escribir("Contado de Alcohol 70%", "10");
    expect(screen.getByText("+2")).toHaveClass("text-warning-text");
    expect(screen.getByText("−3")).toHaveClass("text-danger-text");
    expect(screen.getByText("Cuadra")).toHaveClass("text-primary-700");
    expect(screen.getByText("2 artículos contados · 2 diferencias")).toBeInTheDocument();
  });

  it("'Todo en 0' e 'Igual al sistema' llenan todos los lotes del artículo de un toque", async () => {
    montar();
    await screen.findByText("Amoxicilina 500 mg");
    fireEvent.click(within(tarjeta("Amoxicilina 500 mg")).getByRole("button", { name: "Todo en 0" }));
    expect(contado("Contado de Amoxicilina 500 mg, lote AMX-1").value).toBe("0");
    expect(contado("Contado de Amoxicilina 500 mg, lote AMX-2").value).toBe("0");
    expect(screen.getByText("−8")).toBeInTheDocument();
    expect(screen.getByText("−4")).toBeInTheDocument();
    fireEvent.click(within(tarjeta("Amoxicilina 500 mg")).getByRole("button", { name: "Igual al sistema" }));
    expect(contado("Contado de Amoxicilina 500 mg, lote AMX-1").value).toBe("8");
    expect(contado("Contado de Amoxicilina 500 mg, lote AMX-2").value).toBe("4");
    expect(screen.getAllByText("Cuadra")).toHaveLength(2);
    expect(screen.getByText("Todo cuadra: no hay nada que ajustar.")).toBeInTheDocument();
  });

  it("Enter en el buscador con un solo resultado lleva el foco al contado de ese artículo", async () => {
    // Es lo que hace que el lector de código de barras funcione solo: escribe
    // el código, manda Enter, y la persona ya está en el campo para contar.
    vi.mocked(pedirToma).mockImplementation(async (p) =>
      p.q === "7501" ? pagina([AMOXI]) : pagina([AMOXI, ALCOHOL]),
    );
    montar();
    await screen.findByText("Alcohol 70%");
    const buscador = screen.getByPlaceholderText("Buscá o escaneá: nombre, droga, laboratorio…");
    fireEvent.change(buscador, { target: { value: "7501" } });
    fireEvent.keyDown(buscador, { key: "Enter" });
    await waitFor(() =>
      expect(document.activeElement).toBe(contado("Contado de Amoxicilina 500 mg, lote AMX-1")),
    );
    expect(screen.queryByText("Alcohol 70%")).not.toBeInTheDocument();
  });

  it("con varias sucursales hay que elegir una antes de que se pida nada", async () => {
    sesion.sucursalId = null;
    sesion.features = ["multi_almacen"];
    vi.mocked(api.getSucursales).mockResolvedValue([
      { id: 1, nombre: "Mostrador", activo: true, tipo: "SUCURSAL", esPrincipal: true },
      { id: 2, nombre: "Depósito", activo: true, tipo: "DEPOSITO", esPrincipal: false },
    ] as never);
    montar();
    expect(await screen.findByText("¿Qué sucursal vas a contar?")).toBeInTheDocument();
    expect(screen.getByText("Elegí la sucursal")).toBeInTheDocument();
    expect(pedirToma).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Depósito" }));
    await screen.findByText("Amoxicilina 500 mg");
    expect(pedirToma).toHaveBeenCalledWith(expect.objectContaining({ almacenId: 2 }));
  });
});

describe("aplicar el ajuste", () => {
  it("abre la revisión, exige el motivo y crea y aprueba el AJUSTE con un renglón por lote", async () => {
    montar();
    await screen.findByText("Amoxicilina 500 mg");
    escribir("Contado de Amoxicilina 500 mg, lote AMX-1", "10");
    escribir("Contado de Amoxicilina 500 mg, lote AMX-2", "0");
    escribir("Contado de Alcohol 70%", "7");

    fireEvent.click(screen.getByRole("button", { name: "Aplicar ajuste" }));
    const d = dialogo();
    expect(within(d).getByText("Lote AMX-2 · vence 30/09/2027", { exact: false })).toBeInTheDocument();
    expect(within(d).getByText("−4")).toBeInTheDocument();

    // Sin motivo no sale nada.
    fireEvent.click(within(d).getByRole("button", { name: "Aplicar ajuste" }));
    expect(within(d).getByText("Elegí el motivo del ajuste.")).toBeInTheDocument();
    expect(api.crearMovimiento).not.toHaveBeenCalled();

    fireEvent.click(within(d).getByRole("button", { name: "Vencidos tirados" }));
    fireEvent.change(within(d).getByLabelText("Nota (opcional)"), { target: { value: " caja mojada " } });
    fireEvent.click(within(d).getByRole("button", { name: "Aplicar ajuste" }));

    await waitFor(() => expect(api.aprobarMovimiento).toHaveBeenCalledWith(77));
    expect(api.crearMovimiento).toHaveBeenCalledWith({
      tipo: "AJUSTE",
      almacenId: 917,
      descripcion: "Toma de inventario · Vencidos tirados · caja mojada",
      detalles: [
        // El AMX-2 en 0 también viaja: "conté 0" fija ese lote en 0. Ningún
        // renglón del artículo con lote va sin `loteCodigo`.
        { productoId: 1, cantidad: 10, loteCodigo: "AMX-1" },
        { productoId: 1, cantidad: 0, loteCodigo: "AMX-2" },
        { productoId: 2, cantidad: 7 },
      ],
    });
    expect(await screen.findByText("Ajuste aplicado: 2 artículos")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // El borrador se limpió y la lista se volvió a pedir.
    expect(localStorage.getItem(claveBorrador(917))).toBeNull();
    expect(pedirToma).toHaveBeenCalledTimes(2);
  });

  it("un lote que apareció en el estante viaja como nuevo, con su vencimiento", async () => {
    montar();
    await screen.findByText("Amoxicilina 500 mg");
    fireEvent.click(screen.getByRole("button", { name: "Agregar lote" }));
    const form = tarjeta("Amoxicilina 500 mg");
    fireEvent.change(within(form).getByLabelText("Código del lote"), { target: { value: "NUEVO-9" } });
    // MM/AAAA como en el ingreso: se guarda el último día del mes.
    fireEvent.change(within(form).getByLabelText("Vence (MM/AAAA)"), { target: { value: "032027" } });
    fireEvent.change(within(form).getByLabelText("Cantidad contada"), { target: { value: "5" } });
    fireEvent.click(within(form).getByRole("button", { name: "Agregar" }));

    expect(screen.getByText("NUEVO-9 · vence 31/03/2027")).toBeInTheDocument();
    expect(screen.getByText("+5")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Aplicar ajuste" }));
    fireEvent.click(within(dialogo()).getByRole("button", { name: "Conteo mensual" }));
    fireEvent.click(within(dialogo()).getByRole("button", { name: "Aplicar ajuste" }));
    await waitFor(() =>
      expect(api.crearMovimiento).toHaveBeenCalledWith(
        expect.objectContaining({
          descripcion: "Toma de inventario · Conteo mensual",
          detalles: [{ productoId: 1, cantidad: 5, loteCodigo: "NUEVO-9", loteVencimiento: "2027-03-31" }],
        }),
      ),
    );
  });

  it("un código que ya está en la lista no se agrega dos veces", async () => {
    // Mandarlo aparte fijaría el mismo lote dos veces: se cuenta en su renglón.
    montar();
    await screen.findByText("Amoxicilina 500 mg");
    fireEvent.click(screen.getByRole("button", { name: "Agregar lote" }));
    const form = tarjeta("Amoxicilina 500 mg");
    fireEvent.change(within(form).getByLabelText("Código del lote"), { target: { value: "amx-1" } });
    fireEvent.change(within(form).getByLabelText("Vence (MM/AAAA)"), { target: { value: "032027" } });
    fireEvent.change(within(form).getByLabelText("Cantidad contada"), { target: { value: "5" } });
    fireEvent.click(within(form).getByRole("button", { name: "Agregar" }));
    expect(screen.getByText("Ese lote ya está en la lista: contalo ahí.")).toBeInTheDocument();
    expect(screen.queryByText("Nuevo")).not.toBeInTheDocument();
  });

  it("con el doble control el botón dice que se guarda para que lo aprueben, y no aprueba", async () => {
    sesion.dobleControl = true;
    montar();
    await screen.findByText("Alcohol 70%");
    escribir("Contado de Alcohol 70%", "7");
    const boton = screen.getByRole("button", { name: "Guardar para que lo aprueben" });
    fireEvent.click(boton);
    fireEvent.click(within(dialogo()).getByRole("button", { name: "Rotura" }));
    fireEvent.click(within(dialogo()).getByRole("button", { name: "Guardar para que lo aprueben" }));
    await waitFor(() => expect(api.crearMovimiento).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/Conteo guardado: 1 artículo\. Queda pendiente/),
    ).toBeInTheDocument();
    expect(api.aprobarMovimiento).not.toHaveBeenCalled();
  });

  it("si el backend rechaza el ajuste, el error se ve en la revisión y el conteo no se pierde", async () => {
    vi.mocked(api.crearMovimiento).mockRejectedValueOnce(new Error("El lote AMX-1 no existe en esa sucursal"));
    montar();
    await screen.findByText("Amoxicilina 500 mg");
    escribir("Contado de Amoxicilina 500 mg, lote AMX-1", "10");
    fireEvent.click(screen.getByRole("button", { name: "Aplicar ajuste" }));
    fireEvent.click(within(dialogo()).getByRole("button", { name: "Conteo mensual" }));
    fireEvent.click(within(dialogo()).getByRole("button", { name: "Aplicar ajuste" }));
    expect(
      await within(dialogo()).findByText("El lote AMX-1 no existe en esa sucursal"),
    ).toBeInTheDocument();
    expect(api.aprobarMovimiento).not.toHaveBeenCalled();
    // Sigue todo: el campo, el borrador y el diálogo para corregir y reintentar.
    expect(contado("Contado de Amoxicilina 500 mg, lote AMX-1").value).toBe("10");
    expect(localStorage.getItem(claveBorrador(917))).not.toBeNull();
  });
});

describe("el borrador", () => {
  it("sobrevive a desmontar y volver a montar la pantalla", async () => {
    const { unmount } = montar();
    await screen.findByText("Amoxicilina 500 mg");
    escribir("Contado de Amoxicilina 500 mg, lote AMX-1", "10");
    unmount();

    montar();
    await screen.findByText("Amoxicilina 500 mg");
    expect(contado("Contado de Amoxicilina 500 mg, lote AMX-1").value).toBe("10");
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByText(/Borrador guardado en este dispositivo/)).toBeInTheDocument();
    expect(screen.getByText("1 artículo contado · 1 diferencia")).toBeInTheDocument();
  });

  it("es por sucursal: el conteo del mostrador no aparece en el depósito", async () => {
    montar();
    await screen.findByText("Amoxicilina 500 mg");
    escribir("Contado de Alcohol 70%", "3");
    expect(localStorage.getItem(claveBorrador(917))).not.toBeNull();
    expect(localStorage.getItem(claveBorrador(918))).toBeNull();
  });

  it("'Descartar conteo' lo borra, pero recién al confirmar", async () => {
    montar();
    await screen.findByText("Amoxicilina 500 mg");
    escribir("Contado de Alcohol 70%", "3");
    fireEvent.click(screen.getByRole("button", { name: "Descartar conteo" }));
    const confirmar = screen.getByRole("dialog", { name: "Descartar el conteo" });
    fireEvent.click(within(confirmar).getByRole("button", { name: "Cancelar" }));
    expect(contado("Contado de Alcohol 70%").value).toBe("3");

    fireEvent.click(screen.getByRole("button", { name: "Descartar conteo" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Descartar el conteo" })).getByRole("button", {
        name: "Descartar",
      }),
    );
    await act(async () => {});
    expect(contado("Contado de Alcohol 70%").value).toBe("");
    expect(localStorage.getItem(claveBorrador(917))).toBeNull();
    expect(screen.queryByRole("button", { name: "Descartar conteo" })).not.toBeInTheDocument();
  });
});
