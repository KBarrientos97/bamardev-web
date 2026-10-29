import { act, fireEvent, render, screen } from "@testing-library/react";
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
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: sesion.rubro,
    incluye: (c: string) => (c === "lotes" ? sesion.lotes : true),
    puede: (s: string) => sesion.secciones.includes(s),
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getProductos: vi.fn(),
    getCategorias: vi.fn(async () => []),
    getUnidades: vi.fn(async () => []),
    getAlmacenes: vi.fn(async () => []),
    // El selector de sucursal (useSucursales): con cero locales no se dibuja.
    getSucursales: vi.fn(async () => []),
    buscarProductos: vi.fn(async () => ({ items: [], total: 0, limite: 30, offset: 0 })),
    crearProducto: vi.fn(async () => ({})),
    actualizarProducto: vi.fn(async () => ({})),
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
  sesion.secciones = [];
  sesion.lotes = true;
});

describe("bamardev-restaurant: el catálogo se ve como siempre", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
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
    fireEvent.change(screen.getByDisplayValue("Elegí una"), { target: { value: "1" } });
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
