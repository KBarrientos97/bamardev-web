import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";

/**
 * El catálogo es una pantalla COMPARTIDA: la usa bamardev-restaurant tal como
 * estaba y la farmacia le cuelga sus piezas detrás de `esFarmacia(rubro)`.
 *
 * Estos tests fijan lo que el sistema de restaurante tiene que seguir viendo
 * igual que antes de que existiera el rubro farmacia. Si uno se rompe mientras se
 * trabaja en farmacia, lo que se rompió es el restaurante, no el test.
 */

const sesion = vi.hoisted(() => ({
  rubro: "RESTAURANTE" as string | undefined,
  /** Las secciones que el usuario puede abrir, aparte del catálogo. */
  secciones: [] as string[],
  /** `lotes` es PRO: una farmacia BASICO no tiene Vencimientos. */
  lotes: true,
  /** Sucursal del usuario (null = organización) y cuántas sucursales tiene el negocio. */
  sucursalId: null as number | null,
  locales: undefined as number | undefined,
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: sesion.rubro,
    incluye: (c: string) => (c === "lotes" ? sesion.lotes : true),
    puede: (s: string) => sesion.secciones.includes(s),
    usuario: { sucursalId: sesion.sucursalId, sucursal: sesion.sucursalId == null ? null : "Norte" },
    negocio: { sucursalesActivas: sesion.locales },
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getProductos: vi.fn(),
    getProducto: vi.fn(),
    existenciasProducto: vi.fn(async () => []),
    getCategorias: vi.fn(async () => []),
    getUnidades: vi.fn(async () => []),
    getAlmacenes: vi.fn(async () => []),
    // El selector de sucursal (useSucursales): con cero locales no se dibuja.
    getSucursales: vi.fn(async () => []),
    buscarProductos: vi.fn(async () => ({ items: [], total: 0, limite: 30, offset: 0 })),
    crearProducto: vi.fn(async () => ({})),
    actualizarProducto: vi.fn(async () => ({})),
    // Las sugerencias de la ficha del negocio entero (farmacia, 12-nov).
    sugerenciasFicha: vi.fn(async () => ({ principiosActivos: [], laboratorios: [], formas: [] })),
    // La ficha del medicamento (la que abre Artículos en una farmacia).
    lotesDeProducto: vi.fn(async () => []),
    ubicacionesUsadas: vi.fn(async () => []),
  },
}));

import { api } from "../../lib/api";
import Productos from "./Productos";

const getProductos = vi.mocked(api.getProductos);
const crearProducto = vi.mocked(api.crearProducto);
const actualizarProducto = vi.mocked(api.actualizarProducto);

function producto(datos: Partial<Producto> = {}): Producto {
  return {
    id: 1,
    nombre: "Pollo entero",
    descripcion: null,
    codBarra: null,
    tipoProducto: "ALMACENABLE",
    precio: 60,
    costo: 40,
    stockMinimo: 5,
    habilitado: true,
    icono: null,
    categoria: null,
    unidadMedida: null,
    stockTotal: 2,
    componentes: [],
    principioActivo: null,
    concentracion: null,
    formaFarmaceutica: null,
    laboratorio: null,
    registroSanitario: null,
    condicionVenta: "LIBRE",
    manejaLote: false,
    controlado: false,
    ...datos,
  };
}

/** Una respuesta que queda colgada hasta que el test la suelta. */
function pendiente<T>() {
  let soltar!: (valor: T) => void;
  const promesa = new Promise<T>((r) => {
    soltar = r;
  });
  return { promesa, soltar };
}

function buscar(texto: string) {
  fireEvent.change(screen.getByPlaceholderText(/^Buscar por/), { target: { value: texto } });
}

beforeEach(() => {
  getProductos.mockReset();
  crearProducto.mockClear();
  actualizarProducto.mockClear();
  vi.mocked(api.getUnidades).mockResolvedValue([]);
  vi.mocked(api.sugerenciasFicha).mockClear();
  vi.mocked(api.sugerenciasFicha).mockResolvedValue({ principiosActivos: [], laboratorios: [], formas: [] });
  vi.mocked(api.buscarProductos).mockResolvedValue({ items: [], total: 0, limite: 30, offset: 0 });
  sesion.secciones = [];
  sesion.lotes = true;
  sesion.sucursalId = null;
  sesion.locales = undefined;
  localStorage.clear();
});

describe("bamardev-restaurant: el catálogo se ve como siempre", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
  });

  it("Lista 2 #9: el filtro de local dice «sucursales» acá y «sedes» en el instituto", async () => {
    const dos = [
      { id: 1, nombre: "Central", activo: true, tipo: "SUCURSAL", esPrincipal: true },
      { id: 2, nombre: "Norte", activo: true, tipo: "SUCURSAL", esPrincipal: false },
    ];
    vi.mocked(api.getSucursales).mockResolvedValue(dos as never);
    getProductos.mockResolvedValue([producto()]);
    const { unmount } = render(<Productos />);
    expect(await screen.findByRole("button", { name: "Todas las sucursales" })).toBeInTheDocument();
    unmount();
    sesion.rubro = "ACADEMIA";
    render(<Productos />);
    expect(await screen.findByRole("button", { name: "Todas las sedes" })).toBeInTheDocument();
    expect(screen.queryByText(/sucursal/i)).not.toBeInTheDocument();
    vi.mocked(api.getSucursales).mockResolvedValue([]);
  });

  it("un supervisor atado a una sede ve que el catálogo es de todo el negocio (sólo con 2+ locales)", async () => {
    // Decisión del dueño (13-nov): puede editar el catálogo, pero hay que dejar claro que no es de su sede.
    getProductos.mockResolvedValue([producto()]);
    sesion.sucursalId = 2;
    sesion.locales = 2;
    const { unmount } = render(<Productos />);
    expect(await screen.findByText(/son de todo el negocio, no sólo de Norte/)).toBeInTheDocument();
    unmount();

    // Un solo local: nada nuevo a la vista.
    sesion.locales = 1;
    render(<Productos />);
    await screen.findByText("Pollo entero");
    expect(screen.queryByText(/son de todo el negocio/)).not.toBeInTheDocument();
  });

  it("vendiendo sin stock: ni «Sin stock» en rojo ni el negativo, y el aviso de por qué", async () => {
    // Configuración › Inventario y stock (09-nov). La venta sigue descontando,
    // así que el número queda en negativo: "−4" y "Sin stock" sobre cada
    // bebida decían lo contrario de lo que pasa (se vende igual).
    getProductos.mockResolvedValue([
      producto({ nombre: "Coca Cola 2L", stockTotal: -4, vendeSinStock: true }),
    ]);
    render(<Productos />);
    await screen.findByText("Coca Cola 2L");

    expect(screen.queryByText("Sin stock")).not.toBeInTheDocument();
    expect(screen.queryByText(/-4|−4/)).not.toBeInTheDocument();
    expect(screen.getByText("Estás vendiendo sin control de stock")).toBeInTheDocument();
    // Filtrar por un número que nadie mira daría siempre la lista vacía.
    expect(screen.queryByRole("button", { name: "Bajo stock" })).not.toBeInTheDocument();
  });

  it("controlando el stock (el de siempre), sin aviso y con «Sin stock»", async () => {
    getProductos.mockResolvedValue([producto({ nombre: "Coca Cola 2L", stockTotal: 0 })]);
    render(<Productos />);
    await screen.findByText("Coca Cola 2L");
    expect(screen.getByText("Sin stock", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByText("Estás vendiendo sin control de stock")).not.toBeInTheDocument();
  });

  it("buscar algo que no está dice 'Sin resultados'", async () => {
    getProductos.mockResolvedValue([producto()]);
    render(<Productos />);
    await screen.findByText("Pollo entero");

    buscar("zzz");

    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
    expect(screen.getByText("Probá con otro texto o quitá los filtros.")).toBeInTheDocument();
    expect(screen.queryByText(/No hay nada con/)).not.toBeInTheDocument();
  });

  it("con el catálogo vacío invita a cargar el primero, aunque haya texto en el buscador", async () => {
    getProductos.mockResolvedValue([]);
    render(<Productos />);
    await screen.findByText("Todavía no hay artículos");

    buscar("zzz");

    expect(screen.getByText("Todavía no hay artículos")).toBeInTheDocument();
    expect(screen.getByText("Cargá el primer producto de tu catálogo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nuevo artículo/ })).toBeInTheDocument();
  });

  it("al pasar a 'Dados de baja' muestra 'Cargando…' y no la lista de activos", async () => {
    const papelera = pendiente<Producto[]>();
    getProductos
      .mockResolvedValueOnce([producto()])
      .mockReturnValueOnce(papelera.promesa);
    render(<Productos />);
    await screen.findByText("Pollo entero");

    fireEvent.click(screen.getByRole("button", { name: "Dados de baja" }));

    // Mientras llega la papelera, un artículo activo bajo el chip "Dados de
    // baja" se abre con el botón de Restaurar: no puede verse ni un instante.
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
    expect(screen.queryByText("Pollo entero")).not.toBeInTheDocument();

    await act(async () => papelera.soltar([producto({ id: 2, nombre: "Gaseosa 2L" })]));
    expect(screen.getByText("Gaseosa 2L")).toBeInTheDocument();
  });

  it("la receta del combo va sin ceros de más", async () => {
    // Kevin, 25-oct: la receta decía "1,000" y "0,250".
    getProductos.mockResolvedValue([
      producto({
        nombre: "Combo familiar",
        tipoProducto: "COMPUESTO",
        stockTotal: 4,
        componentes: [
          { ingredienteId: 2, nombre: "Pollo entero", cantidad: 1 },
          { ingredienteId: 3, nombre: "Papas fritas", cantidad: 0.25 },
        ],
      }),
    ]);
    render(<Productos />);
    fireEvent.click(await screen.findByText("Combo familiar"));

    expect(screen.getByText("Pollo entero").closest("li")).toHaveTextContent(/^Pollo entero1$/);
    expect(screen.getByText("Papas fritas").closest("li")).toHaveTextContent(/^Papas fritas0,25$/);
  });

  it("no ofrece cargar desde Excel, aunque el usuario pueda cargar mercadería", async () => {
    // La carga desde Excel es de farmacia: el encabezado del restaurante queda
    // con su "Nuevo" y nada más.
    sesion.secciones = ["ingreso_mercaderia"];
    getProductos.mockResolvedValue([producto()]);
    render(<Productos />);
    await screen.findByText("Pollo entero");
    expect(screen.queryByRole("button", { name: /Cargar desde Excel/ })).not.toBeInTheDocument();
  });
});

describe("farmacia: lo propio del rubro sigue en pie", () => {
  beforeEach(() => {
    sesion.rubro = "FARMACIA";
  });

  it("quien carga mercadería ve 'Cargar desde Excel' y lo lleva a la carga", async () => {
    sesion.secciones = ["ingreso_mercaderia"];
    getProductos.mockResolvedValue([]);
    render(
      <MemoryRouter initialEntries={["/inventario/productos"]}>
        <Routes>
          <Route path="/inventario/productos" element={<Productos />} />
          <Route path="/inventario/productos/importar" element={<p>Pantalla de carga</p>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Cargar desde Excel/ }));
    expect(screen.getByText("Pantalla de carga")).toBeInTheDocument();
  });

  it("sin permiso para cargar mercadería, el botón no aparece", async () => {
    getProductos.mockResolvedValue([]);
    render(<Productos />);
    await screen.findByRole("button", { name: "Nuevo" });
    expect(screen.queryByRole("button", { name: /Cargar desde Excel/ })).not.toBeInTheDocument();
  });

  it("buscar algo que no está nombra lo que se buscó", async () => {
    getProductos.mockResolvedValue([producto({ nombre: "Amoxicilina", stockTotal: 2 })]);
    render(<Productos />);
    // "Bajo stock" lee el catálogo entero, sin pasar por el buscador del servidor.
    fireEvent.click(screen.getByRole("button", { name: "Bajo stock" }));
    await screen.findByText("Amoxicilina");

    buscar("zzz");

    expect(screen.getByText('No hay nada con "zzz"')).toBeInTheDocument();
  });

  it("entre dos filtros del catálogo tampoco deja la lista anterior mientras carga", async () => {
    const papelera = pendiente<Producto[]>();
    getProductos
      .mockResolvedValueOnce([producto({ nombre: "Amoxicilina", stockTotal: 2 })])
      .mockReturnValueOnce(papelera.promesa);
    render(<Productos />);
    fireEvent.click(screen.getByRole("button", { name: "Bajo stock" }));
    await screen.findByText("Amoxicilina");

    fireEvent.click(screen.getByRole("button", { name: "Dados de baja" }));

    expect(screen.getByText("Cargando…")).toBeInTheDocument();
    expect(screen.queryByText("Amoxicilina")).not.toBeInTheDocument();
  });
});

/*
 * El alta, en los dos rubros. Un producto nace sin stock: lo que entra va por
 * Movimientos (así lo hacen el backend desde el 28-ago y la app). El "Stock
 * inicial" que ofrecía la web se tiraba sin avisar y el artículo quedaba
 * agotado. El combo sí fija su stock acá, y eso no cambia.
 */
describe("el alta: el stock de un producto entra por Movimientos", () => {
  async function abrirAlta() {
    getProductos.mockResolvedValue([]);
    render(<Productos />);
    const nuevo = await screen.findAllByRole("button", { name: /Nuevo/ });
    await act(async () => {
      fireEvent.click(nuevo[0]);
    });
  }

  it("restaurante: no ofrece un stock inicial que no se guarda, y dice dónde se carga", async () => {
    sesion.rubro = "RESTAURANTE";
    await abrirAlta();
    expect(screen.queryByText("Stock inicial")).not.toBeInTheDocument();
    expect(
      screen.getByText("El stock entra después, con una entrada en Movimientos."),
    ).toBeInTheDocument();
  });

  it("restaurante: el combo sigue fijando su stock", async () => {
    sesion.rubro = "RESTAURANTE";
    await abrirAlta();
    fireEvent.change(screen.getByDisplayValue("Producto"), { target: { value: "COMPUESTO" } });
    // Con el asterisco: desde INV-02 es obligatorio.
    expect(screen.getByText("Stock del combo *")).toBeInTheDocument();
    expect(screen.queryByText(/El stock entra después/)).not.toBeInTheDocument();
  });

  it("farmacia: el stock entra con el ingreso, que es donde van lote y vencimiento", async () => {
    sesion.rubro = "FARMACIA";
    await abrirAlta();
    expect(screen.queryByText("Stock inicial")).not.toBeInTheDocument();
    expect(screen.getByText(/con un Ingreso de mercadería: ahí van el lote/)).toBeInTheDocument();
  });

  it("farmacia: un medicamento nuevo arranca controlado por lote y vencimiento", async () => {
    // Apagado por defecto, olvidarse de prenderlo dejaba el medicamento sin
    // control de vencimiento: el ingreso mostraba "—" donde van lote y fecha.
    sesion.rubro = "FARMACIA";
    await abrirAlta();
    expect(screen.getByRole("checkbox", { name: /Maneja lote y vencimiento/ })).toBeChecked();
  });

  it("restaurante: el alta no tiene nada de lote", async () => {
    sesion.rubro = "RESTAURANTE";
    await abrirAlta();
    expect(screen.queryByRole("checkbox", { name: /Maneja lote/ })).not.toBeInTheDocument();
  });

  it("farmacia sin `lotes`: no hay «Maneja lote» ni se promete lote en el ingreso", async () => {
    // El bug del 16-oct: nacía con lote prendido en un plan sin Vencimientos,
    // y el mostrador decía "Vence hoy" de algo que el plan no controla.
    sesion.rubro = "FARMACIA";
    sesion.lotes = false;
    await abrirAlta();
    expect(screen.queryByRole("checkbox", { name: /Maneja lote/ })).not.toBeInTheDocument();
    expect(screen.getByText("El stock entra después, con un Ingreso de mercadería.")).toBeInTheDocument();
    // El controlado sigue: es la ley, no el plan.
    expect(screen.getByRole("checkbox", { name: /Medicamento controlado/ })).toBeInTheDocument();
  });
});

const UNIDAD = { id: 1, nombre: "Unidad" };

/** Abre el alta con un catálogo que tiene un producto para usar de ingrediente. */
async function abrirAltaCon(catalogo: Producto[] = [producto({ id: 2, nombre: "Gaseosa 2L" })]) {
  vi.mocked(api.getUnidades).mockResolvedValue([UNIDAD] as never);
  getProductos.mockResolvedValue(catalogo);
  render(<Productos />);
  await screen.findByText(catalogo[0]?.nombre ?? "Todavía no hay artículos");
  await act(async () => {
    fireEvent.click(screen.getAllByRole("button", { name: /Nuevo/ })[0]);
  });
}

/** Llena lo mínimo del alta: nombre, precio (si se da) y unidad. */
function llenar({ nombre = "Combo familiar", precio = "45" }: { nombre?: string; precio?: string } = {}) {
  fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: nombre } });
  fireEvent.change(screen.getByLabelText(/^Precio de venta/), { target: { value: precio } });
  fireEvent.change(screen.getByDisplayValue("Elegí una"), { target: { value: "1" } });
}

function pasarACombo() {
  fireEvent.change(screen.getByDisplayValue("Producto"), { target: { value: "COMPUESTO" } });
  fireEvent.change(screen.getByDisplayValue("+ Agregar ingrediente…"), { target: { value: "2" } });
}

async function guardar() {
  // "Guardar" en el restaurante, "Guardar medicamento" (o como lo llame) en la farmacia.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^Guardar/ }));
  });
}

describe("BUG-catalogo-2: el precio es obligatorio", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
  });

  it("con el precio vacío no guarda: antes quedaba a Bs 0 y el POS lo cobraba gratis", async () => {
    // `Number("")` da 0, que pasaba la validación.
    await abrirAltaCon();
    llenar({ nombre: "Pollo a la brasa", precio: "" });
    await guardar();
    expect(screen.getByText("Poné el precio de venta.")).toBeInTheDocument();
    expect(crearProducto).not.toHaveBeenCalled();
  });

  it("un 0 escrito a propósito sí se guarda, como en la app", async () => {
    await abrirAltaCon();
    llenar({ nombre: "Agua de cortesía", precio: "0" });
    await guardar();
    expect(crearProducto).toHaveBeenCalledWith(expect.objectContaining({ precio: 0 }));
  });

  it("la coma decimal se toma como en la caja", async () => {
    await abrirAltaCon();
    llenar({ nombre: "Pollo a la brasa", precio: "45,50" });
    await guardar();
    expect(crearProducto).toHaveBeenCalledWith(expect.objectContaining({ precio: 45.5 }));
  });

  it("farmacia: tampoco guarda un medicamento sin precio", async () => {
    // El formulario es el mismo: un medicamento a Bs 0 es el mismo error.
    // La carga por Excel de la farmacia ya pedía el precio.
    sesion.rubro = "FARMACIA";
    vi.mocked(api.getUnidades).mockResolvedValue([UNIDAD] as never);
    getProductos.mockResolvedValue([]);
    render(<Productos />);
    const nuevo = await screen.findByRole("button", { name: "Nuevo" });
    await act(async () => {
      fireEvent.click(nuevo);
    });
    fireEvent.change(screen.getByLabelText(/^Nombre comercial/), { target: { value: "Paracetamol" } });
    // La unidad ya viene puesta (B11): no hay "Elegí una" que cambiar.
    expect(screen.getByLabelText(/^Unidad/)).toHaveValue(String(UNIDAD.id));
    await guardar();
    expect(screen.getByText("Poné el precio de venta.")).toBeInTheDocument();
    expect(crearProducto).not.toHaveBeenCalled();
  });

  /** Abre la edición de un artículo que ya está en el catálogo. */
  async function editarArticulo(p: Producto) {
    vi.mocked(api.getUnidades).mockResolvedValue([UNIDAD] as never);
    getProductos.mockResolvedValue([p]);
    render(<Productos />);
    fireEvent.click(await screen.findByText(p.nombre));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    });
  }

  it("quien no ve los precios igual edita el artículo: el precio no se pide ni viaja", async () => {
    // Regresión de este mismo arreglo: sin `ventas.ver_precios` el catálogo
    // llega con `precio: null`, el campo arrancaba vacío y "Poné el precio de
    // venta." no dejaba guardar ni el nombre. El backend le descarta el
    // precio a ese usuario, así que el campo ni se muestra.
    await editarArticulo(
      producto({ id: 7, precio: null as unknown as number, unidadMedida: UNIDAD }),
    );
    expect(screen.queryByLabelText(/^Precio de venta/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Pollo entero grande" } });
    await guardar();

    expect(screen.queryByText("Poné el precio de venta.")).not.toBeInTheDocument();
    expect(actualizarProducto).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ nombre: "Pollo entero grande" }),
    );
    // Ni un 0: si le dieran el permiso con el formulario abierto, el backend
    // ya no lo descartaría.
    expect(actualizarProducto.mock.calls[0][1]).not.toHaveProperty("precio");
  });

  it("al editar con el precio a la vista, vaciarlo tampoco guarda", async () => {
    // Guarda: lo de arriba es sólo para el precio que no llega, no un permiso
    // para dejarlo vacío.
    await editarArticulo(producto({ id: 7, precio: 60, unidadMedida: UNIDAD }));
    fireEvent.change(screen.getByLabelText(/^Precio de venta/), { target: { value: "" } });
    await guardar();
    expect(screen.getByText("Poné el precio de venta.")).toBeInTheDocument();
    expect(actualizarProducto).not.toHaveBeenCalled();
  });
});

describe("el precio de un local no pisa el del catálogo (PLAN-SUCURSAL-TOTAL, etapa 3)", () => {
  // La lista con un local elegido (o la de quien es de un local) trae `precio`
  // resuelto para ese local, y el PATCH escribe el precio BASE. Mandarlo sin
  // que nadie lo toque movía el precio de todas las sucursales.
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
    vi.mocked(api.getProducto).mockClear();
  });

  async function editarConLocales(p: Producto) {
    vi.mocked(api.getUnidades).mockResolvedValue([UNIDAD] as never);
    getProductos.mockResolvedValue([p]);
    render(<Productos />);
    fireEvent.click(await screen.findByText(p.nombre));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    });
  }

  it("si el precio no se tocó, el PATCH no lo manda", async () => {
    await editarConLocales(producto({ id: 7, precio: 70, unidadMedida: UNIDAD }));
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Pollo entero grande" } });
    await guardar();
    expect(actualizarProducto).toHaveBeenCalledWith(7, expect.objectContaining({ nombre: "Pollo entero grande" }));
    expect(actualizarProducto.mock.calls[0][1]).not.toHaveProperty("precio");
  });

  it("si se cambia, sí viaja", async () => {
    await editarConLocales(producto({ id: 7, precio: 70, unidadMedida: UNIDAD }));
    fireEvent.change(screen.getByLabelText(/^Precio de venta/), { target: { value: "75" } });
    await guardar();
    expect(actualizarProducto).toHaveBeenCalledWith(7, expect.objectContaining({ precio: 75 }));
  });

  it("con un local elegido, el formulario precarga el precio del catálogo y no el del local", async () => {
    vi.mocked(api.getSucursales).mockResolvedValue([
      { id: 1, nombre: "Central", activo: true, tipo: "SUCURSAL", esPrincipal: true },
      { id: 2, nombre: "Norte", activo: true, tipo: "SUCURSAL", esPrincipal: false },
    ] as never);
    vi.mocked(api.getProducto).mockResolvedValue(producto({ id: 7, precio: 60 }));
    vi.mocked(api.getUnidades).mockResolvedValue([UNIDAD] as never);
    // En Norte el pollo vale 70 (precio propio); en el catálogo, 60.
    getProductos.mockResolvedValue([producto({ id: 7, precio: 70, unidadMedida: UNIDAD })]);
    render(<Productos />);
    fireEvent.click(await screen.findByRole("button", { name: "Norte" }));
    fireEvent.click(await screen.findByText("Pollo entero"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    });
    expect(api.getProducto).toHaveBeenCalledWith(7);
    expect(await screen.findByLabelText(/^Precio de venta/)).toHaveDisplayValue("60");
    vi.mocked(api.getSucursales).mockResolvedValue([]);
  });

  it("el usuario de un local: se le avisa de qué precio se trata", async () => {
    sesion.sucursalId = 2;
    sesion.locales = 2;
    await editarConLocales(producto({ id: 7, precio: 70, unidadMedida: UNIDAD }));
    expect(screen.getByText(/precio con el que se vende en tu sucursal/)).toBeInTheDocument();
  });

  it("con un solo local no hay aviso ni cambia nada", async () => {
    await editarConLocales(producto({ id: 7, precio: 70, unidadMedida: UNIDAD }));
    expect(screen.queryByText(/en tu sucursal/)).not.toBeInTheDocument();
    expect(api.getProducto).not.toHaveBeenCalled();
  });
});

describe("INV-02: la cantidad del combo es obligatoria, al crear y al editar", () => {
  // Sin ella el combo nacía en 0 y el POS no lo podía vender hasta editarlo
  // de nuevo. Vacío no; un 0 escrito sí (como `validarStockCombo` en la app).
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
  });

  it("al crear, vacía no deja guardar", async () => {
    await abrirAltaCon();
    llenar();
    pasarACombo();
    await guardar();
    expect(screen.getByText("Poné cuántos combos tenés para vender (0 si hoy no hay).")).toBeInTheDocument();
    expect(crearProducto).not.toHaveBeenCalled();
  });

  it("al crear, con la cantidad escrita viaja aunque sea 0", async () => {
    await abrirAltaCon();
    llenar();
    pasarACombo();
    fireEvent.change(screen.getByLabelText(/^Stock del combo/), { target: { value: "0" } });
    await guardar();
    expect(crearProducto).toHaveBeenCalledWith(
      expect.objectContaining({ tipoProducto: "COMPUESTO", stockInicial: 0 }),
    );
  });

  it("una cantidad que no es número no se guarda", async () => {
    await abrirAltaCon();
    llenar();
    pasarACombo();
    fireEvent.change(screen.getByLabelText(/^Stock del combo/), { target: { value: "muchos" } });
    await guardar();
    expect(screen.getByText("La cantidad de combos tiene que ser un número, 0 o más.")).toBeInTheDocument();
    expect(crearProducto).not.toHaveBeenCalled();
  });

  const comboGuardado = (stockTotal: number) =>
    producto({
      id: 5,
      nombre: "Combo familiar",
      tipoProducto: "COMPUESTO",
      stockTotal,
      unidadMedida: UNIDAD,
      componentes: [{ ingredienteId: 2, nombre: "Gaseosa 2L", cantidad: 1 }],
    });

  async function editar(combo: Producto) {
    vi.mocked(api.getUnidades).mockResolvedValue([UNIDAD] as never);
    getProductos.mockResolvedValue([combo, producto({ id: 2, nombre: "Gaseosa 2L" })]);
    render(<Productos />);
    fireEvent.click(await screen.findByText("Combo familiar"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    });
  }

  it("al editar un combo en 0, el campo arranca vacío y hay que escribir la cantidad", async () => {
    // A propósito, como en la app: un 0 heredado no es un valor que alguien
    // eligió, y autocompletarlo daba el campo obligatorio por cumplido solo.
    await editar(comboGuardado(0));
    expect(screen.getByLabelText(/^Stock del combo/)).toHaveValue("");
    await guardar();
    expect(screen.getByText("Poné cuántos combos tenés para vender (0 si hoy no hay).")).toBeInTheDocument();
    expect(actualizarProducto).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^Stock del combo/), { target: { value: "0" } });
    await guardar();
    expect(actualizarProducto).toHaveBeenCalledWith(5, expect.objectContaining({ stockInicial: 0 }));
  });

  it("al editar un combo con stock, viaja el que tiene", async () => {
    await editar(comboGuardado(4));
    expect(screen.getByLabelText(/^Stock del combo/)).toHaveValue("4");
    await guardar();
    expect(actualizarProducto).toHaveBeenCalledWith(5, expect.objectContaining({ stockInicial: 4 }));
  });

  it("guarda: un elaborado no pide cantidad ni la manda", async () => {
    await abrirAltaCon();
    llenar({ nombre: "Sopa del día" });
    fireEvent.change(screen.getByDisplayValue("Producto"), { target: { value: "SERVICIO" } });
    expect(screen.queryByLabelText(/^Stock del combo/)).not.toBeInTheDocument();
    await guardar();
    expect(crearProducto).toHaveBeenCalledWith(expect.objectContaining({ tipoProducto: "SERVICIO" }));
    expect(crearProducto.mock.calls[0][0]).not.toHaveProperty("stockInicial");
  });
});

describe("BUG-catalogo-1: el combo no descuenta su receta", () => {
  // La web decía que vender un combo descontaba los ingredientes de su receta.
  // Desde el 25-ago el backend descuenta sólo el stock propio del combo: el
  // dueño podía creer que vender un combo bajaba las gaseosas que lleva.
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
  });

  it("el formulario dice que el combo tiene su propio stock", async () => {
    await abrirAltaCon();
    fireEvent.change(screen.getByDisplayValue("Producto"), { target: { value: "COMPUESTO" } });
    expect(screen.getByText(/Tiene su propio stock: los combos que armás/)).toBeInTheDocument();
    expect(
      screen.queryByText("El combo descuenta los ingredientes de su receta al venderse."),
    ).not.toBeInTheDocument();
  });

  it("el detalle dice que la receta es lo que lleva", async () => {
    getProductos.mockResolvedValue([
      producto({
        nombre: "Combo familiar",
        tipoProducto: "COMPUESTO",
        stockTotal: 4,
        componentes: [{ ingredienteId: 2, nombre: "Gaseosa 2L", cantidad: 1 }],
      }),
    ]);
    render(<Productos />);
    fireEvent.click(await screen.findByText("Combo familiar"));
    expect(screen.getByText(/lo que lleva; venderlo no descuenta los ingredientes/)).toBeInTheDocument();
    expect(screen.queryByText(/se descuenta al vender/)).not.toBeInTheDocument();
  });
});

describe("BUG-catalogo-4: un margen que no se puede calcular no se muestra", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
  });

  async function verDetalle(p: Producto) {
    getProductos.mockResolvedValue([p]);
    render(<Productos />);
    fireEvent.click(await screen.findByText(p.nombre));
  }

  it("con precio y costo, el margen de siempre", async () => {
    await verDetalle(producto({ precio: 60, costo: 40 }));
    expect(screen.getByText("Margen")).toBeInTheDocument();
    expect(screen.getByText("33%")).toBeInTheDocument();
  });

  it("sin permiso de costos no hay costo ni margen (antes: «NaN%» y «Bs 0,00»)", async () => {
    // Sin `costos.ver` el backend quita el campo `costo` de la respuesta.
    const { costo: _costo, ...sinCosto } = producto({ precio: 60 });
    await verDetalle(sinCosto as Producto);
    expect(screen.queryByText("Margen")).not.toBeInTheDocument();
    expect(screen.queryByText("Costo")).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it("sin permiso de costos tampoco ofrece el historial de costos", async () => {
    // El endpoint pide `costos.ver`: el botón abría un modal con el error del
    // 403 y "Sin compras registradas", como si nunca se hubiera comprado.
    const { costo: _costo, ...sinCosto } = producto({ precio: 60 });
    await verDetalle(sinCosto as Producto);
    expect(screen.queryByRole("button", { name: /Historial de costos/ })).not.toBeInTheDocument();
  });

  it("con permiso de costos el historial sigue, aunque el costo esté en 0", async () => {
    await verDetalle(producto({ precio: 60, costo: 0 }));
    expect(screen.getByRole("button", { name: /Historial de costos/ })).toBeInTheDocument();
  });

  it("sin costo cargado no dice «100%»", async () => {
    await verDetalle(producto({ precio: 60, costo: 0 }));
    expect(screen.queryByText("Margen")).not.toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });

  it("sin precio no dice «0%»", async () => {
    await verDetalle(producto({ precio: 0, costo: 40 }));
    expect(screen.queryByText("Margen")).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("vender por debajo del costo se muestra en negativo: es un dato, no un error", async () => {
    await verDetalle(producto({ precio: 50, costo: 60 }));
    expect(screen.getByText("-20%")).toBeInTheDocument();
  });
});

/**
 * El alta de farmacia ayuda a escribir menos (11-nov). Sólo farmacia: el
 * restaurante sigue arrancando con «Elegí una» y sin sugerencias de ficha.
 */
describe("farmacia: el alta ayuda a escribir menos (B11 y M11)", () => {
  const CLAVE = "bamar.farmacia.sugerencias";
  const UNIDADES = [
    { id: 3, nombre: "Caja" },
    { id: 1, nombre: "Unidad" },
  ];

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.getUnidades).mockResolvedValue(UNIDADES as never);
    vi.mocked(api.buscarProductos).mockResolvedValue({ items: [], total: 0, limite: 30, offset: 0 });
  });

  async function abrirNuevo() {
    getProductos.mockResolvedValue([]);
    render(<Productos />);
    const nuevo = await screen.findAllByRole("button", { name: /Nuevo/ });
    await act(async () => {
      fireEvent.click(nuevo[0]);
    });
  }

  /**
   * Lo que ofrece el combo de un campo (`CampoSugerido`, desde el 12-nov; antes
   * era un `<datalist>`), abriéndolo como lo abre la persona: tocándolo.
   */
  function opcionesDe(campo: RegExp): string[] {
    const input = screen.getByRole("combobox", { name: campo });
    fireEvent.click(input);
    // Dentro de la lista: los `<select>` del formulario también tienen opciones.
    const lista = screen.queryByRole("listbox");
    const textos = lista ? within(lista).getAllByRole("option").map((o) => o.textContent ?? "") : [];
    fireEvent.blur(input);
    return textos;
  }

  it("B11: en farmacia la unidad arranca en «Unidad», aunque no sea la primera de la lista", async () => {
    // Arrancaba en "Elegí una": un clic más por artículo, y un "Elegí una
    // unidad de medida" cada vez que se olvidaba, cuando el 99 % es Unidad.
    sesion.rubro = "FARMACIA";
    await abrirNuevo();
    expect(screen.getByLabelText(/^Unidad/)).toHaveValue("1");
  });

  it("B11: en el restaurante sigue pidiendo elegirla", async () => {
    sesion.rubro = "RESTAURANTE";
    await abrirNuevo();
    expect(screen.getByLabelText(/^Unidad de medida/)).toHaveValue("");
  });

  it("M11: sugiere laboratorio y forma de lo que se ve, aunque la lista venga del servidor", async () => {
    // En farmacia la lista en memoria está vacía (viene paginada del
    // servidor), y las sugerencias salían de ella: el datalist no ofrecía nada.
    sesion.rubro = "FARMACIA";
    vi.mocked(api.buscarProductos).mockResolvedValue({
      items: [
        producto({
          id: 9,
          nombre: "Ibuprofeno 400 mg",
          laboratorio: "BAGÓ",
          formaFarmaceutica: "Comprimido",
        }),
      ],
      total: 1,
      limite: 30,
      offset: 0,
    });
    getProductos.mockResolvedValue([]);
    render(<Productos />);
    await screen.findByText(/Ibuprofeno 400 mg/);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /Nuevo/ })[0]);
    });
    expect(opcionesDe(/^Laboratorio/)).toEqual(["BAGÓ"]);
    // Lo que se ve va antes que la lista base de formas.
    expect(opcionesDe(/^Forma farmacéutica/)[0]).toBe("Comprimido");
  });

  it("M11: recuerda lo tecleado al guardar y lo vuelve a sugerir", async () => {
    sesion.rubro = "FARMACIA";
    localStorage.setItem(CLAVE, JSON.stringify({ laboratorios: ["INTI"], formas: ["Jarabe"] }));
    await abrirNuevo();
    expect(opcionesDe(/^Laboratorio/)).toEqual(["INTI"]);
    expect(opcionesDe(/^Forma farmacéutica/)[0]).toBe("Jarabe");

    fireEvent.change(screen.getByLabelText(/^Nombre comercial/), { target: { value: "Amoxidal" } });
    fireEvent.change(screen.getByLabelText(/^Precio de venta/), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText(/^Laboratorio/), { target: { value: "Lafar" } });
    fireEvent.change(screen.getByLabelText(/^Forma farmacéutica/), { target: { value: "Cápsula" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Principio activo" }), {
      target: { value: "Amoxicilina," },
    });
    await guardar();

    expect(crearProducto).toHaveBeenCalledTimes(1);
    // Lo más reciente primero, y lo de antes se queda. Las drogas se suman
    // el 12-nov; lo guardado antes no las traía.
    expect(JSON.parse(localStorage.getItem(CLAVE)!)).toEqual({
      laboratorios: ["Lafar", "INTI"],
      formas: ["Cápsula", "Jarabe"],
      principios: ["Amoxicilina"],
    });
  });

  it("M11: con la memoria rota o sin almacenamiento, el alta sigue", async () => {
    sesion.rubro = "FARMACIA";
    localStorage.setItem(CLAVE, "{esto no es json");
    await abrirNuevo();
    expect(opcionesDe(/^Laboratorio/)).toEqual([]);
    expect(screen.getByLabelText(/^Nombre comercial/)).toBeInTheDocument();
  });

  it("M11: el restaurante no lee ni escribe esa memoria, ni pide las sugerencias", async () => {
    sesion.rubro = "RESTAURANTE";
    localStorage.setItem(CLAVE, JSON.stringify({ laboratorios: ["INTI"], formas: [] }));
    await abrirNuevo();
    expect(screen.queryByRole("combobox", { name: /^Laboratorio/ })).not.toBeInTheDocument();
    expect(api.sugerenciasFicha).not.toHaveBeenCalled();
  });

  it("suma lo del negocio entero (servidor) a lo que se ve, y si falla el alta sigue", async () => {
    sesion.rubro = "FARMACIA";
    vi.mocked(api.sugerenciasFicha).mockResolvedValue({
      principiosActivos: ["Tiocolchicósido"],
      laboratorios: ["Lafar"],
      formas: ["Granulado"],
    });
    await abrirNuevo();
    expect(opcionesDe(/^Laboratorio/)).toEqual(["Lafar"]);
    expect(opcionesDe(/^Forma farmacéutica/)[0]).toBe("Granulado");
    fireEvent.change(screen.getByRole("combobox", { name: "Principio activo" }), {
      target: { value: "tioco" },
    });
    expect(screen.getByRole("option", { name: "Tiocolchicósido" })).toBeInTheDocument();
  });

  it("si las sugerencias del servidor fallan, quedan la memoria y la lista base", async () => {
    sesion.rubro = "FARMACIA";
    vi.mocked(api.sugerenciasFicha).mockRejectedValue(new Error("404"));
    await abrirNuevo();
    expect(opcionesDe(/^Forma farmacéutica/)).toContain("Cápsula");
    expect(screen.queryByText(/404/)).not.toBeInTheDocument();
  });
});

/** Abre el alta de un medicamento con lo mínimo ya escrito (nombre y precio). */
async function abrirAltaFarmacia() {
  sesion.rubro = "FARMACIA";
  vi.mocked(api.getUnidades).mockResolvedValue([UNIDAD] as never);
  getProductos.mockResolvedValue([]);
  render(<Productos />);
  const nuevo = await screen.findAllByRole("button", { name: /Nuevo/ });
  await act(async () => {
    fireEvent.click(nuevo[0]);
  });
  fireEvent.change(screen.getByLabelText(/^Nombre comercial/), { target: { value: "Clofexan" } });
  fireEvent.change(screen.getByLabelText(/^Precio de venta/), { target: { value: "8" } });
}

/** Lo que viajó en el alta. */
const altaEnviada = () => crearProducto.mock.calls[0][0];

describe("farmacia: los principios activos son fichas (12-nov)", () => {
  const principio = () => screen.getByRole("combobox", { name: "Principio activo" });

  it("dos drogas viajan en la misma columna como «A, B»", async () => {
    // Clofexan = diclofenaco + paracetamol: el campo de texto invitaba a
    // cargar una sola.
    await abrirAltaFarmacia();
    fireEvent.change(principio(), { target: { value: "diclo" } });
    fireEvent.click(screen.getByRole("option", { name: "Diclofenaco" }));
    fireEvent.change(principio(), { target: { value: "Paracetamol" } });
    fireEvent.keyDown(principio(), { key: "Enter" });
    await guardar();
    expect(altaEnviada()).toEqual(
      expect.objectContaining({ principioActivo: "Diclofenaco, Paracetamol" }),
    );
    // Más tiempo que el de siempre: es el primer alta de farmacia del bloque
    // y con la máquina cargada pasó de los 5 s (dio 3 s suelta).
  }, 15_000);

  it("los atajos traen la lista base aunque la farmacia sea nueva", async () => {
    await abrirAltaFarmacia();
    fireEvent.change(principio(), { target: { value: "losar" } });
    expect(screen.getByRole("option", { name: "Losartán" })).toBeInTheDocument();
  });

  it("al editar, el texto guardado vuelve partido en fichas", async () => {
    sesion.rubro = "FARMACIA";
    sesion.secciones = ["productos"];
    vi.mocked(api.getUnidades).mockResolvedValue([UNIDAD] as never);
    const guardado = producto({
      id: 4,
      nombre: "Dolofen",
      principioActivo: "Paracetamol + Cafeína",
      unidadMedida: UNIDAD,
    });
    vi.mocked(api.buscarProductos).mockResolvedValue({ items: [guardado], total: 1, limite: 30, offset: 0 });
    getProductos.mockResolvedValue([]);
    render(<Productos />);
    fireEvent.click(await screen.findByText("Dolofen"));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    });
    expect(screen.getByRole("button", { name: "Quitar Paracetamol" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar Cafeína" })).toBeInTheDocument();

    await guardar();
    expect(actualizarProducto).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ principioActivo: "Paracetamol, Cafeína" }),
    );
  });

  it("más de lo que entra en la columna no se manda: se dice cuánto sobra", async () => {
    // El backend corta en 120 y devolvía un 400 que no nombraba el campo.
    await abrirAltaFarmacia();
    fireEvent.change(principio(), { target: { value: `${"A".repeat(70)}, ${"B".repeat(60)},` } });
    await guardar();
    expect(screen.getByText(/Los principios activos no entran/)).toBeInTheDocument();
    expect(crearProducto).not.toHaveBeenCalled();
  });
});

describe("farmacia: «Para qué sirve» guarda en la descripción", () => {
  it("se escribe en la ficha y viaja como `descripcion`", async () => {
    // En farmacia el formulario esconde la descripción libre; el buscador
    // del servidor ya busca por ella ("fiebre" encuentra el paracetamol).
    await abrirAltaFarmacia();
    fireEvent.change(screen.getByLabelText(/^Para qué sirve/), {
      target: { value: "Analgésico y antifebril " },
    });
    await guardar();
    expect(altaEnviada()).toEqual(expect.objectContaining({ descripcion: "Analgésico y antifebril" }));
  });
});

describe("farmacia: el registro sanitario avisa, no bloquea", () => {
  const registro = () => screen.getByLabelText(/^Registro sanitario/);

  it("un número suelto muestra el aviso ámbar al salir del campo, y se guarda igual", async () => {
    // Kevin cargó "65165156165" y el sistema no dijo nada.
    await abrirAltaFarmacia();
    fireEvent.focus(registro());
    fireEvent.change(registro(), { target: { value: "65165156165" } });
    // Mientras se escribe no se reta.
    expect(screen.queryByText(/No tiene la forma de un registro de AGEMED/)).not.toBeInTheDocument();
    fireEvent.blur(registro());
    expect(screen.getByText(/No tiene la forma de un registro de AGEMED/)).toBeInTheDocument();
    expect(screen.getByText(/Se guarda igual/)).toBeInTheDocument();

    await guardar();
    expect(altaEnviada()).toEqual(expect.objectContaining({ registroSanitario: "65165156165" }));
  });

  it("al salir del campo queda en mayúsculas y sin espacios de más, y sin aviso si tiene la forma", async () => {
    await abrirAltaFarmacia();
    fireEvent.focus(registro());
    fireEvent.change(registro(), { target: { value: " ii - 12345 / 2024 " } });
    fireEvent.blur(registro());
    expect(registro()).toHaveValue("II-12345/2024");
    expect(screen.queryByText(/No tiene la forma de un registro de AGEMED/)).not.toBeInTheDocument();
  });
});

describe("farmacia: la condición de venta dice lo que hace y manda el controlado", () => {
  const controlado = () => screen.getByRole("checkbox", { name: /Medicamento controlado/ });
  const condicion = (nombre: string) =>
    fireEvent.click(screen.getByRole("button", { name: nombre, pressed: false }));

  it("cada condición se explica debajo de los chips", async () => {
    await abrirAltaFarmacia();
    expect(screen.getByText("Se vende sin pedir nada.")).toBeInTheDocument();
    condicion("Receta");
    expect(screen.getByText(/No frena la venta, no pide datos y no va a ningún libro/)).toBeInTheDocument();
    condicion("Receta archivada");
    expect(
      screen.getByText(/pide paciente, médico, matrícula y fecha de la receta, y la venta queda asentada en el libro de psicotrópicos/),
    ).toBeInTheDocument();
    condicion("Receta valorada");
    expect(screen.getByText(/número del formulario de la receta valorada/)).toBeInTheDocument();
  });

  it("archivada o valorada prenden y bloquean el controlado; al volver, queda lo que se había elegido", async () => {
    await abrirAltaFarmacia();
    expect(controlado()).not.toBeChecked();
    condicion("Receta archivada");
    expect(controlado()).toBeChecked();
    expect(controlado()).toBeDisabled();
    expect(screen.getByText("Ya va al libro de psicotrópicos por la receta archivada")).toBeInTheDocument();
    condicion("Receta valorada");
    expect(screen.getByText("Ya va al libro de estupefacientes por la receta valorada")).toBeInTheDocument();

    condicion("Libre");
    expect(controlado()).not.toBeChecked();
    expect(controlado()).toBeEnabled();
  });

  it("con archivada viaja `controlado: true` aunque nadie haya tocado el interruptor", async () => {
    await abrirAltaFarmacia();
    condicion("Receta archivada");
    await guardar();
    expect(altaEnviada()).toEqual(
      expect.objectContaining({ condicionVenta: "RECETA_ARCHIVADA", controlado: true }),
    );
  });

  it("un Libre marcado a mano como controlado dice que igual va al libro", async () => {
    await abrirAltaFarmacia();
    fireEvent.click(controlado());
    expect(screen.queryByText("Se vende sin pedir nada.")).not.toBeInTheDocument();
    expect(screen.getByText(/Como está marcado controlado/)).toBeInTheDocument();
    condicion("Receta archivada");
    condicion("Receta");
    // Lo elegido a mano sigue: la condición no lo pisó.
    expect(controlado()).toBeChecked();
  });
});

describe("farmacia: el tipo es Producto o Servicio", () => {
  const tipo = () => screen.getByLabelText(/^Tipo/);
  const opcionesTipo = () =>
    Array.from((tipo() as HTMLSelectElement).options).map((o) => o.textContent);

  it("no ofrece Elaborado ni Combo, que son del restaurante", async () => {
    // El plan trae `combos` (el mock dice que sí a todo): igual no se ofrece.
    await abrirAltaFarmacia();
    expect(opcionesTipo()).toEqual(["Producto", "Servicio"]);
  });

  it("un servicio se explica, no pide lote y viaja sin lote", async () => {
    await abrirAltaFarmacia();
    expect(screen.getByRole("checkbox", { name: /Maneja lote/ })).toBeChecked();
    fireEvent.change(tipo(), { target: { value: "SERVICIO" } });
    expect(screen.getByText(/Inyectable aplicado, toma de presión, curación: se cobra sin stock/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Maneja lote/ })).not.toBeInTheDocument();
    await guardar();
    expect(altaEnviada()).toEqual(
      expect.objectContaining({ tipoProducto: "SERVICIO", manejaLote: false }),
    );
  });

  it("un combo que ya existe se sigue editando como combo (no se convierte al guardar)", async () => {
    sesion.rubro = "FARMACIA";
    sesion.secciones = ["productos"];
    vi.mocked(api.getUnidades).mockResolvedValue([UNIDAD] as never);
    const combo = producto({
      id: 6,
      nombre: "Kit de curación",
      tipoProducto: "COMPUESTO",
      stockTotal: 3,
      unidadMedida: UNIDAD,
      componentes: [{ ingredienteId: 2, nombre: "Gasa", cantidad: 1 }],
    });
    vi.mocked(api.buscarProductos).mockResolvedValue({ items: [combo], total: 1, limite: 30, offset: 0 });
    getProductos.mockResolvedValue([]);
    render(<Productos />);
    fireEvent.click(await screen.findByText("Kit de curación"));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    });
    expect(opcionesTipo()).toEqual(["Producto", "Servicio", "Combo"]);
    expect(tipo()).toHaveValue("COMPUESTO");
  });

  it("en el restaurante el tipo sigue siendo Producto / Elaborado / Combo", async () => {
    sesion.rubro = "RESTAURANTE";
    await abrirAltaCon();
    expect(opcionesTipo()).toEqual(["Producto", "Elaborado", "Combo"]);
    fireEvent.change(tipo(), { target: { value: "SERVICIO" } });
    expect(screen.getByText("Se prepara al vender: no lleva stock propio.")).toBeInTheDocument();
  });
});

describe("farmacia: la búsqueda corregida se dice arriba de la lista", () => {
  it("muestra lo tecleado y lo que se buscó, y deja pasar al buscador lo corregido", async () => {
    sesion.rubro = "FARMACIA";
    getProductos.mockResolvedValue([]);
    vi.mocked(api.buscarProductos).mockResolvedValue({
      items: [producto({ id: 8, nombre: "Ibuprofeno 400 mg" })],
      total: 1,
      limite: 30,
      offset: 0,
      corregido: "ibuprofeno",
    });
    render(<Productos />);
    buscar("ibprofen");
    expect(await screen.findByRole("status")).toHaveTextContent("No hay nada con «ibprofen». Mostrando «ibuprofeno».");
    fireEvent.click(screen.getByRole("button", { name: "Buscar «ibuprofeno»" }));
    expect(screen.getByPlaceholderText(/^Buscar por/)).toHaveValue("ibuprofeno");
  });

  it("sin corrección no hay aviso", async () => {
    sesion.rubro = "FARMACIA";
    getProductos.mockResolvedValue([]);
    vi.mocked(api.buscarProductos).mockResolvedValue({
      items: [producto({ id: 8, nombre: "Ibuprofeno 400 mg" })],
      total: 1,
      limite: 30,
      offset: 0,
    });
    render(<Productos />);
    buscar("ibupro");
    await screen.findByText("Ibuprofeno 400 mg");
    expect(screen.queryByText(/Mostrando «/)).not.toBeInTheDocument();
  });
});

describe("el stock del combo es de UN local (PLAN-SUCURSAL-TOTAL §8.5)", () => {
  // Antes el formulario precargaba la SUMA de los locales y el backend la
  // escribía entera en la principal: guardar duplicaba el stock.
  const LOCALES = [
    { id: 1, nombre: "Central", activo: true, tipo: "SUCURSAL", esPrincipal: true },
    { id: 2, nombre: "Norte", activo: true, tipo: "SUCURSAL", esPrincipal: false },
  ];
  const existencia = (almacenId: number, nombre: string, cantidad: number) => ({
    almacenId,
    nombre,
    tipo: "SUCURSAL",
    esPrincipal: almacenId === 1,
    direccion: null,
    telefono: null,
    cantidad,
    ubicacion: null,
  });
  const combo = producto({
    id: 5,
    nombre: "Combo familiar",
    tipoProducto: "COMPUESTO",
    stockTotal: 12, // la suma: 5 en Central + 7 en Norte
    unidadMedida: UNIDAD,
    componentes: [{ ingredienteId: 2, nombre: "Gaseosa 2L", cantidad: 1 }],
  });

  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
    vi.mocked(api.existenciasProducto).mockClear();
    vi.mocked(api.getSucursales).mockResolvedValue(LOCALES as never);
    vi.mocked(api.existenciasProducto).mockResolvedValue([
      existencia(1, "Central", 5),
      existencia(2, "Norte", 7),
    ] as never);
  });

  async function editarCombo() {
    vi.mocked(api.getUnidades).mockResolvedValue([UNIDAD] as never);
    getProductos.mockResolvedValue([combo, producto({ id: 2, nombre: "Gaseosa 2L" })]);
    render(<Productos />);
    fireEvent.click(await screen.findByText("Combo familiar"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    });
  }

  it("organización con 2 locales: pide el local y precarga el stock de ESE local, no la suma", async () => {
    sesion.locales = 2;
    await editarCombo();
    const selector = await screen.findByLabelText("¿En qué local cargás el stock del combo?");
    // La sugerida (la principal) y su stock, no los 12 del total.
    expect(selector).toHaveValue("1");
    await vi.waitFor(() => expect(screen.getByLabelText(/^Stock del combo/)).toHaveValue("5"));

    fireEvent.change(selector, { target: { value: "2" } });
    await vi.waitFor(() => expect(screen.getByLabelText(/^Stock del combo/)).toHaveValue("7"));

    fireEvent.change(screen.getByLabelText(/^Stock del combo/), { target: { value: "9" } });
    await guardar();
    expect(actualizarProducto).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ stockInicial: 9, almacenId: 2 }),
    );
  });

  it("un local sin stock del combo arranca vacío y hay que escribir el 0", async () => {
    sesion.locales = 2;
    vi.mocked(api.existenciasProducto).mockResolvedValue([
      existencia(1, "Central", 5),
      existencia(2, "Norte", 0),
    ] as never);
    await editarCombo();
    const selector = await screen.findByLabelText("¿En qué local cargás el stock del combo?");
    fireEvent.change(selector, { target: { value: "2" } });
    await vi.waitFor(() => expect(screen.getByLabelText(/^Stock del combo/)).toHaveValue(""));
    await guardar();
    expect(actualizarProducto).not.toHaveBeenCalled();
  });

  it("crear un combo: también pide el local y lo manda con el stock", async () => {
    sesion.locales = 2;
    await abrirAltaCon();
    llenar();
    pasarACombo();
    const selector = await screen.findByLabelText("¿En qué local cargás el stock del combo?");
    fireEvent.change(selector, { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/^Stock del combo/), { target: { value: "3" } });
    await guardar();
    expect(crearProducto).toHaveBeenCalledWith(
      expect.objectContaining({ stockInicial: 3, almacenId: 2 }),
    );
  });

  it("un solo local: el formulario es el de siempre, sin selector ni almacenId", async () => {
    sesion.locales = 1;
    vi.mocked(api.getSucursales).mockResolvedValue([LOCALES[0]] as never);
    await editarCombo();
    expect(screen.queryByLabelText("¿En qué local cargás el stock del combo?")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Stock del combo/)).toHaveValue("12");
    expect(api.existenciasProducto).not.toHaveBeenCalled();
    await guardar();
    expect(actualizarProducto.mock.calls[0][1]).not.toHaveProperty("almacenId");
  });

  it("usuario de un local: no ve el selector, el backend usa el suyo", async () => {
    sesion.locales = 2;
    sesion.sucursalId = 2;
    await editarCombo();
    expect(screen.queryByLabelText("¿En qué local cargás el stock del combo?")).not.toBeInTheDocument();
    await guardar();
    expect(actualizarProducto.mock.calls[0][1]).not.toHaveProperty("almacenId");
  });
});
