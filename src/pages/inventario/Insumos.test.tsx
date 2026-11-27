import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fmtFecha, fmtMoney } from "../../lib/format";
import { DESCARTABLES_CON_RECETAS } from "../../lib/rubro";
import type { Almacen, ComprasInsumos, Insumo, SesionRecetas, UnidadMedida } from "../../types";

/**
 * Insumos, según el rubro (decisión de Kevin, 28-oct).
 *
 * En el restaurante el stock de un insumo no baja nunca —vender un plato no
 * descuenta insumos: no hay recetas—, así que la pantalla no lo muestra en
 * ningún lado y en su lugar dice cuánto se invirtió en el mes. Las compras se
 * siguen cargando como siempre, como entradas en Movimientos.
 *
 * Belleza y los demás rubros ven la pantalla exactamente como antes: en un
 * salón el insumo se gasta con cada servicio y el stock sí es un dato.
 */

const sesion = vi.hoisted(() => ({
  rubro: "RESTAURANTE" as string | undefined,
  /** Las secciones que puede abrir: "movimientos" es la que pide Registrar compra. */
  secciones: ["movimientos"] as string[],
  /** Atado a una sucursal: el selector no se dibuja. Null = de organización, lo ve. */
  sucursalId: 1 as number | null,
  /** Las recetas del plato (27-nov). Sin el dato están apagadas: así corre todo lo de arriba. */
  recetas: undefined as SesionRecetas | undefined,
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: sesion.rubro,
    puede: (s: string) => sesion.secciones.includes(s),
    usuario: { sucursalId: sesion.sucursalId },
    negocio: { tipoNegocio: sesion.rubro, features: [], recetas: sesion.recetas },
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getInsumos: vi.fn(),
    getComprasInsumos: vi.fn(),
    getCategorias: vi.fn(async () => [{ id: 1, nombre: "Carnes" }]),
    getUnidades: vi.fn(async () => [{ id: 1, nombre: "Kilogramo", abreviatura: "kg" }]),
    getAlmacenes: vi.fn(async () => []),
    getSucursales: vi.fn(async () => []),
    crearInsumo: vi.fn(async () => ({})),
    actualizarInsumo: vi.fn(async () => ({})),
  },
}));

import { api } from "../../lib/api";
import Insumos from "./Insumos";

function insumo(id: number, nombre: string, extra: Partial<Insumo> = {}): Insumo {
  return {
    id,
    nombre,
    codigo: null,
    categoria: { id: 1, nombre: "Carnes" },
    categoriaId: 1,
    unidad: { id: 1, nombre: "Kilogramo", abreviatura: "kg" },
    unidadMedidaId: 1,
    stock: 300,
    costoCompra: 25,
    puntoReorden: 10,
    proveedor: "Avícola Sofía",
    vencimiento: null,
    almacen: null,
    habilitado: true,
    ...extra,
  };
}

// Los tres estados de stock de la tarjeta: de sobra, en cero y bajo el punto
// de reorden. En el restaurante ninguno se tiene que ver.
const POLLO = insumo(1, "Pollo crudo", { stock: 300 });
const ACEITE = insumo(2, "Aceite", {
  stock: 0,
  costoCompra: 16,
  unidad: { id: 2, nombre: "Litro", abreviatura: "L" },
  unidadMedidaId: 2,
});
const PAPA = insumo(3, "Papa", { stock: 5, costoCompra: 4 });

const COMPRAS: ComprasInsumos = {
  total: 3450.5,
  numCompras: 12,
  porInsumo: [
    { insumoId: 1, total: 3000, cantidad: 120, compras: 8, ultimaFecha: "2026-10-25T14:00:00.000Z" },
    { insumoId: 2, total: 450.5, cantidad: 28.5, compras: 4, ultimaFecha: "2026-10-20T14:00:00.000Z" },
  ],
};

/** El mes de hoy como lo nombra la pantalla ("octubre"), y su rango: del 1 al 1 del siguiente. */
const HOY = new Date();
const MES = HOY.toLocaleDateString("es-BO", { month: "long" });
const dia1 = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const DESDE = dia1(HOY);
const HASTA = dia1(new Date(HOY.getFullYear(), HOY.getMonth() + 1, 1));

function Ubicacion() {
  const l = useLocation();
  return <p>ahora en {`${l.pathname}${l.search}`}</p>;
}

function montar() {
  return render(
    <MemoryRouter initialEntries={["/inventario/insumos"]}>
      <Routes>
        <Route path="/inventario/insumos" element={<Insumos />} />
        <Route path="/inventario/movimientos" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** La tarjeta de un insumo, cuando la lista ya llegó. */
async function tarjeta(nombre: string) {
  return (await screen.findByText(nombre, { selector: "h3" })).closest("li")!;
}

/** Espera la lista y lo invertido del mes. */
async function cargada() {
  await screen.findByText("Pollo crudo", { selector: "h3" });
  return screen.findByRole("region", { name: "Lo invertido en insumos" });
}

async function abrirDetalle(nombre: string) {
  fireEvent.click(within(await tarjeta(nombre)).getByRole("button"));
  return screen.getByRole("dialog", { name: "Detalle del insumo" });
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.rubro = "RESTAURANTE";
  sesion.secciones = ["movimientos"];
  sesion.sucursalId = 1;
  vi.mocked(api.getInsumos).mockResolvedValue([POLLO, ACEITE, PAPA]);
  vi.mocked(api.getComprasInsumos).mockResolvedValue(COMPRAS);
  vi.mocked(api.getSucursales).mockResolvedValue([]);
});

function sucursal(id: number, nombre: string): Almacen {
  return {
    id,
    nombre,
    grupo: null,
    activo: true,
    tipo: "SUCURSAL",
    esPrincipal: id === 1,
    direccion: null,
    telefono: null,
  };
}

describe("Restaurante: sin stock en ningún lado", () => {
  it("las tarjetas no muestran stock ni avisan que hay que reponer", async () => {
    // Vender no descuenta insumos: el aceite en cero decía "Sin stock" y la
    // papa "Reponer" sobre algo que se compra todos los días.
    montar();
    await cargada();
    expect(screen.queryByText("Stock")).not.toBeInTheDocument();
    expect(screen.queryByText("300 kg")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin stock")).not.toBeInTheDocument();
    expect(screen.queryByText("Reponer")).not.toBeInTheDocument();
  });

  it("los filtros por stock se van: quedan Todos y la papelera", async () => {
    montar();
    await cargada();
    expect(screen.getByRole("button", { name: "Todos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dados de baja" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bajo stock" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sin stock" })).not.toBeInTheDocument();
  });

  it("el detalle no muestra stock, lo que vale, el punto de reorden ni el estado del stock", async () => {
    montar();
    await cargada();
    const detalle = await abrirDetalle("Pollo crudo");
    for (const no of ["Stock actual", "Valor en stock", "Punto de reorden", "Con stock", "Reponer", "Sin stock"]) {
      expect(within(detalle).queryByText(no)).not.toBeInTheDocument();
    }
    expect(within(detalle).getByText("Costo de compra")).toBeInTheDocument();
  });
});

describe("Restaurante: lo invertido en el mes", () => {
  it("arriba dice cuánto se compró en el mes y en cuántas compras, con centavos", async () => {
    montar();
    const resumen = await cargada();
    expect(resumen).toHaveTextContent(`En ${MES} compraste ${fmtMoney(3450.5)} en insumos · 12 compras`);
    // Dónde resta esa plata es lo primero que se pregunta al verla.
    expect(resumen).toHaveTextContent(/no se resta aparte: entra por el costo cargado en cada plato/);
  });

  it("pide lo comprado del mes en curso, del 1 al 1 del siguiente", async () => {
    montar();
    await cargada();
    expect(api.getComprasInsumos).toHaveBeenCalledWith({ desde: DESDE, hasta: HASTA, sucursalId: null });
  });

  it("cada tarjeta dice lo comprado este mes en el lugar del stock, o que no hubo compras", async () => {
    montar();
    await cargada();
    const pollo = await tarjeta("Pollo crudo");
    expect(within(pollo).getByText("Este mes")).toBeInTheDocument();
    expect(within(pollo).getByText(fmtMoney(3000))).toBeInTheDocument();
    expect(within(await tarjeta("Aceite")).getByText(fmtMoney(450.5))).toBeInTheDocument();
    expect(within(await tarjeta("Papa")).getByText("Sin compras")).toBeInTheDocument();
  });

  it("el detalle dice lo comprado este mes: plata, cantidad con su unidad, cuántas compras y la última", async () => {
    montar();
    await cargada();
    const detalle = await abrirDetalle("Pollo crudo");
    const mes = within(detalle).getByRole("region", { name: "Comprado este mes" });
    expect(mes).toHaveTextContent(fmtMoney(3000));
    expect(mes).toHaveTextContent(`120 kg en 8 compras · la última el ${fmtFecha("2026-10-25T14:00:00.000Z")}`);
  });

  it("un insumo que no se compró en el mes lo dice en el detalle", async () => {
    montar();
    await cargada();
    const detalle = await abrirDetalle("Papa");
    expect(within(detalle).getByRole("region", { name: "Comprado este mes" })).toHaveTextContent("Sin compras este mes");
  });

  it("un mes sin compras lo dice con palabras, no con «Bs 0,00 · 0 compras»", async () => {
    vi.mocked(api.getComprasInsumos).mockResolvedValue({ total: 0, numCompras: 0, porInsumo: [] });
    montar();
    const resumen = await cargada();
    expect(resumen).toHaveTextContent(`En ${MES} todavía no registraste compras de insumos.`);
    expect(resumen).not.toHaveTextContent(fmtMoney(0));
    expect(within(await tarjeta("Pollo crudo")).getByText("Sin compras")).toBeInTheDocument();
  });

  it("con un backend que no tiene lo invertido, la pantalla sigue igual pero sin el dato", async () => {
    // El backend anterior no tiene GET /insumos/compras: la ruta cae en
    // GET /insumos/:id y responde 400. Un "Bs 0,00" o un "Sin compras" ahí
    // dirían que no se compró nada, y no es lo que pasó.
    let fallar!: (e: Error) => void;
    vi.mocked(api.getComprasInsumos).mockReturnValue(
      new Promise<ComprasInsumos>((_, rechazar) => {
        fallar = rechazar;
      }),
    );
    montar();
    await screen.findByText("Pollo crudo", { selector: "h3" });
    await act(async () => fallar(new Error("Validation failed (numeric string is expected)")));

    expect(screen.queryByRole("region", { name: "Lo invertido en insumos" })).not.toBeInTheDocument();
    expect(screen.queryByText("Este mes")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin compras")).not.toBeInTheDocument();
    expect(screen.queryByText(fmtMoney(0))).not.toBeInTheDocument();
    expect(screen.queryByText(/numeric string/)).not.toBeInTheDocument();
    // Lo que falta es el dato, no la decisión: el stock tampoco aparece.
    expect(screen.queryByText("Stock")).not.toBeInTheDocument();
    expect(within(await tarjeta("Pollo crudo")).getByText(fmtMoney(25))).toBeInTheDocument();

    const detalle = await abrirDetalle("Pollo crudo");
    expect(within(detalle).queryByRole("region", { name: "Comprado este mes" })).not.toBeInTheDocument();
    expect(within(detalle).queryByText("Stock actual")).not.toBeInTheDocument();
  });
});

describe("Restaurante: lo invertido al cambiar de sucursal", () => {
  it("mientras llega lo de la sucursal nueva no queda la plata de la anterior", async () => {
    // `useApi` conserva los datos viejos al recargar: el "compraste Bs
    // 3.450,50" de todas las sucursales seguía arriba con el chip de Norte ya
    // marcado, y la lista de Norte salía con los montos de las demás.
    sesion.sucursalId = null;
    vi.mocked(api.getSucursales).mockResolvedValue([sucursal(1, "Centro"), sucursal(2, "Norte")]);
    montar();
    expect(await cargada()).toHaveTextContent(fmtMoney(3450.5));

    let llegar!: (c: ComprasInsumos) => void;
    vi.mocked(api.getComprasInsumos).mockReturnValue(
      new Promise<ComprasInsumos>((resolver) => {
        llegar = resolver;
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Norte" }));
    await waitFor(() => expect(api.getInsumos).toHaveBeenLastCalledWith(false, 2));
    // La lista de Norte ya llegó; lo invertido de Norte, todavía no.
    await tarjeta("Pollo crudo");

    expect(screen.queryByRole("region", { name: "Lo invertido en insumos" })).not.toBeInTheDocument();
    expect(screen.queryByText(fmtMoney(3450.5))).not.toBeInTheDocument();
    expect(screen.queryByText("Este mes")).not.toBeInTheDocument();
    expect(screen.queryByText(fmtMoney(3000))).not.toBeInTheDocument();

    await act(async () =>
      llegar({
        total: 800,
        numCompras: 2,
        porInsumo: [{ insumoId: 1, total: 800, cantidad: 32, compras: 2, ultimaFecha: "2026-10-22T14:00:00.000Z" }],
      }),
    );
    expect(api.getComprasInsumos).toHaveBeenLastCalledWith({ desde: DESDE, hasta: HASTA, sucursalId: 2 });
    expect(await screen.findByRole("region", { name: "Lo invertido en insumos" })).toHaveTextContent(
      `En ${MES} compraste ${fmtMoney(800)} en insumos · 2 compras`,
    );
    expect(within(await tarjeta("Pollo crudo")).getByText(fmtMoney(800))).toBeInTheDocument();
    expect(within(await tarjeta("Aceite")).getByText("Sin compras")).toBeInTheDocument();
  });
});

describe("Restaurante: Registrar compra", () => {
  it("lleva a Movimientos con el formulario de la entrada abierto", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Registrar compra" }));
    expect(await screen.findByText("ahora en /inventario/movimientos?nuevo=entrada")).toBeInTheDocument();
  });

  it("sin permiso para mover inventario no se ofrece: llevaría a una pantalla que no puede abrir", async () => {
    sesion.secciones = [];
    montar();
    await cargada();
    expect(screen.queryByRole("button", { name: "Registrar compra" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevo" })).toBeInTheDocument();
  });

  it("en la papelera no se ofrece, igual que Nuevo", async () => {
    montar();
    await cargada();
    fireEvent.click(screen.getByRole("button", { name: "Dados de baja" }));
    await waitFor(() => expect(api.getInsumos).toHaveBeenLastCalledWith(true, null));
    expect(screen.queryByRole("button", { name: "Registrar compra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuevo" })).not.toBeInTheDocument();
  });
});

describe("Restaurante: el formulario", () => {
  it("el alta no pide punto de reorden, nace en 0 y avisa dónde van los descartables", async () => {
    montar();
    await cargada();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    const form = screen.getByRole("dialog", { name: "Nuevo insumo" });

    expect(within(form).queryByText("Punto de reorden")).not.toBeInTheDocument();
    expect(
      within(form).getByText(
        /Los descartables \(platos y vasos desechables, servilletas, bolsas, envases para llevar\) no son insumos de un plato: van en Gastos operativos, categoría Descartables/,
      ),
    ).toBeInTheDocument();
    // La nota de abajo habla de compras, no de stock.
    expect(within(form).getByText(/cargá la compra en Movimientos como una entrada/)).toBeInTheDocument();
    expect(within(form).queryByText(/nace sin stock/)).not.toBeInTheDocument();

    fireEvent.change(within(form).getByRole("textbox", { name: "Nombre" }), { target: { value: "Harina" } });
    const unidad = within(form).getByRole("combobox", { name: "Unidad de medida" });
    await within(unidad).findByRole("option", { name: "Kilogramo" });
    fireEvent.change(unidad, { target: { value: "1" } });
    const categoria = within(form).getByRole("combobox", { name: "Categoría" });
    await within(categoria).findByRole("option", { name: "Carnes" });
    fireEvent.change(categoria, { target: { value: "1" } });
    // `Input` dibuja los numéricos como texto (para aceptar la coma): es un textbox.
    fireEvent.change(within(form).getByRole("textbox", { name: "Costo de compra" }), { target: { value: "5" } });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(api.crearInsumo).toHaveBeenCalled());
    expect(vi.mocked(api.crearInsumo).mock.calls[0][0]).toMatchObject({
      nombre: "Harina",
      unidadMedidaId: 1,
      categoriaId: 1,
      costoCompra: 5,
      puntoReorden: 0,
    });
  });

  it("al editar, el punto de reorden escondido viaja con el valor que ya tenía", async () => {
    // Mandarlo vacío lo pisaba con cero sin que nadie lo tocara.
    montar();
    await cargada();
    const detalle = await abrirDetalle("Papa");
    fireEvent.click(within(detalle).getByRole("button", { name: "Editar" }));
    const form = screen.getByRole("dialog", { name: "Editar insumo" });
    expect(within(form).queryByText("Punto de reorden")).not.toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(api.actualizarInsumo).toHaveBeenCalled());
    expect(vi.mocked(api.actualizarInsumo).mock.calls[0]).toEqual([3, expect.objectContaining({ puntoReorden: 10 })]);
  });
});

describe("Belleza y los demás rubros: igual que antes", () => {
  it.each(["PELUQUERIA", "BILLAR", "MINIMARKET", undefined])(
    "%s ve el stock, los avisos y los filtros, y no pide lo invertido",
    async (rubro) => {
      // A propósito: en un salón el insumo se gasta con cada servicio y su
      // stock sí baja. Esconderlo ahí sería esconder un dato real.
      sesion.rubro = rubro;
      montar();
      const pollo = await tarjeta("Pollo crudo");
      expect(within(pollo).getByText("Stock")).toBeInTheDocument();
      expect(within(pollo).getByText("300 kg")).toBeInTheDocument();
      expect(within(await tarjeta("Aceite")).getByText("Sin stock")).toBeInTheDocument();
      expect(within(await tarjeta("Papa")).getByText("Reponer")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Bajo stock" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sin stock" })).toBeInTheDocument();

      expect(api.getComprasInsumos).not.toHaveBeenCalled();
      expect(screen.queryByRole("region", { name: "Lo invertido en insumos" })).not.toBeInTheDocument();
      expect(screen.queryByText("Este mes")).not.toBeInTheDocument();
      // Aunque pueda mover inventario: el atajo es del restaurante.
      expect(screen.queryByRole("button", { name: "Registrar compra" })).not.toBeInTheDocument();
    },
  );

  it("el filtro «Sin stock» sigue filtrando", async () => {
    sesion.rubro = "PELUQUERIA";
    montar();
    await tarjeta("Pollo crudo");
    fireEvent.click(screen.getByRole("button", { name: "Sin stock" }));
    expect(screen.getByText("Aceite", { selector: "h3" })).toBeInTheDocument();
    expect(screen.queryByText("Pollo crudo", { selector: "h3" })).not.toBeInTheDocument();
    expect(screen.queryByText("Papa", { selector: "h3" })).not.toBeInTheDocument();
  });

  it("el detalle y el formulario siguen con el stock y el punto de reorden", async () => {
    sesion.rubro = "PELUQUERIA";
    montar();
    const detalle = await abrirDetalle("Pollo crudo");
    for (const si of ["Stock actual", "Punto de reorden", "Valor en stock", "Con stock"]) {
      expect(within(detalle).getByText(si)).toBeInTheDocument();
    }
    expect(within(detalle).queryByRole("region", { name: "Comprado este mes" })).not.toBeInTheDocument();

    fireEvent.click(within(detalle).getByRole("button", { name: "Editar" }));
    const form = screen.getByRole("dialog", { name: "Editar insumo" });
    expect(within(form).getByText("Punto de reorden")).toBeInTheDocument();
    expect(within(form).getByText(/nace sin stock/)).toBeInTheDocument();
    expect(within(form).queryByText(/descartables/i)).not.toBeInTheDocument();
  });
});

describe("Insumos con varios almacenes (PLAN-SUCURSAL-TOTAL, etapa 3)", () => {
  it("el formulario ya no tiene el campo «Almacén» que el backend ignoraba, ni lo manda", async () => {
    sesion.rubro = "PELUQUERIA";
    montar();
    const detalle = await abrirDetalle("Pollo crudo");
    fireEvent.click(within(detalle).getByRole("button", { name: "Editar" }));
    const form = screen.getByRole("dialog", { name: "Editar insumo" });
    expect(within(form).queryByRole("combobox", { name: "Almacén" })).not.toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.actualizarInsumo).toHaveBeenCalled());
    expect(vi.mocked(api.actualizarInsumo).mock.calls[0][1]).not.toHaveProperty("almacenId");
    // Y no pide la lista de almacenes sólo para llenar un desplegable.
    expect(api.getAlmacenes).not.toHaveBeenCalled();
  });

  it("con stock en 2+ almacenes el detalle abre el desglose y no dice que vive en uno solo", async () => {
    sesion.rubro = "PELUQUERIA";
    vi.mocked(api.getInsumos).mockResolvedValue([
      insumo(1, "Pollo crudo", {
        almacen: { id: 1, nombre: "Centro" },
        stockPorAlmacen: [
          { almacenId: 1, nombre: "Centro", tipo: "SUCURSAL", cantidad: 100 },
          { almacenId: 9, nombre: "Galpón", tipo: "DEPOSITO", cantidad: 200 },
        ],
      }),
    ]);
    montar();
    const detalle = await abrirDetalle("Pollo crudo");
    expect(within(detalle).getByText("Stock por almacén")).toBeInTheDocument();
    expect(within(detalle).getByText("Galpón")).toBeInTheDocument();
    expect(within(detalle).getByText("Depósito")).toBeInTheDocument();
    expect(within(detalle).getByText(/^200 kg/)).toBeInTheDocument();
    expect(within(detalle).queryByText("Almacén")).not.toBeInTheDocument();
  });

  it("con un solo almacén el detalle queda como siempre", async () => {
    sesion.rubro = "PELUQUERIA";
    vi.mocked(api.getInsumos).mockResolvedValue([
      insumo(1, "Pollo crudo", {
        almacen: { id: 1, nombre: "Centro" },
        stockPorAlmacen: [{ almacenId: 1, nombre: "Centro", tipo: "SUCURSAL", cantidad: 300 }],
      }),
    ]);
    montar();
    const detalle = await abrirDetalle("Pollo crudo");
    expect(within(detalle).queryByText("Stock por almacén")).not.toBeInTheDocument();
    expect(within(detalle).getByText("Almacén")).toBeInTheDocument();
  });

  it("la organización con 2+ sucursales ve los depósitos en el selector, como Inventario", async () => {
    sesion.sucursalId = null;
    vi.mocked(api.getSucursales).mockResolvedValue([
      sucursal(1, "Centro"),
      sucursal(2, "Norte"),
      { ...sucursal(7, "Galpón"), tipo: "DEPOSITO", esPrincipal: false },
    ]);
    montar();
    expect(await screen.findByRole("button", { name: "Galpón" })).toBeInTheDocument();
  });

  it("con una sucursal y un depósito no hay selector nuevo: el depósito no es una sucursal", async () => {
    sesion.sucursalId = null;
    vi.mocked(api.getSucursales).mockResolvedValue([
      sucursal(1, "Centro"),
      { ...sucursal(7, "Galpón"), tipo: "DEPOSITO", esPrincipal: false },
    ]);
    montar();
    await screen.findByText("Pollo crudo");
    expect(screen.queryByRole("button", { name: "Galpón" })).not.toBeInTheDocument();
  });
});

// El formulario entero, campo por campo: corrido junto a otras suites pasaba
// los 5 s de fábrica por tiempo, no por lo que prueba.
describe("Restaurante con las recetas del plato prendidas (27-nov)", { timeout: 30_000 }, () => {
  /**
   * Con recetas la venta descuenta los insumos: el stock vuelve a ser un dato.
   * Y el costo ya no se escribe en la ficha: sale de las compras de
   * Movimientos. La ficha dice cómo se compra y para cuánto alcanza.
   */
  const KG: UnidadMedida = { id: 1, nombre: "Kilogramo", abreviatura: "kg", activo: true };
  const LITRO: UnidadMedida = { id: 2, nombre: "Litro", abreviatura: "l", activo: true };
  const UNIDAD: UnidadMedida = { id: 3, nombre: "Unidad", abreviatura: "und", activo: true };

  const ARROZ = insumo(10, "Arroz", {
    stock: 46,
    costoCompra: 6.3,
    compraUnidad: "Quintal",
    compraContenido: 46,
    rindeCantidad: 1,
    rindePorciones: 12,
    porcionNombre: "porción",
    seCuenta: false,
    partes: null,
    configurado: true,
    porciones: 552,
    costoPorcion: 0.525,
    enRecetas: 3,
  });
  const POLLO_BROASTER = insumo(11, "Pollo para broaster", {
    unidad: { id: 3, nombre: "Unidad", abreviatura: "und" },
    unidadMedidaId: 3,
    stock: 15,
    costoCompra: 36.9,
    compraUnidad: "Unidad",
    compraContenido: 1,
    rindeCantidad: 1,
    rindePorciones: 8,
    porcionNombre: "presa",
    seCuenta: true,
    partes: "POLLO_8",
    configurado: true,
    porciones: 120,
    costoPorcion: 4.6125,
  });
  /** Uno de antes de las recetas: sin cómo se compra, sin rinde y sin compras. */
  const YUCA = insumo(12, "Yuca", {
    stock: 0,
    costoCompra: 0,
    compraUnidad: null,
    compraContenido: null,
    rindeCantidad: null,
    rindePorciones: null,
    porcionNombre: null,
    seCuenta: false,
    configurado: false,
    porciones: null,
    costoPorcion: null,
  });

  beforeEach(() => {
    sesion.recetas = { activas: true, elegirPresa: false, puroDoble: true };
    vi.mocked(api.getInsumos).mockResolvedValue([ARROZ, POLLO_BROASTER, YUCA]);
    vi.mocked(api.getUnidades).mockResolvedValue([KG, LITRO, UNIDAD]);
  });

  afterEach(() => {
    sesion.recetas = undefined;
    vi.mocked(api.getUnidades).mockImplementation(async () => [{ id: 1, nombre: "Kilogramo", abreviatura: "kg", activo: true }]);
  });

  /** Abre «Nuevo», con el nombre y la categoría ya puestos. */
  async function nuevo(nombre: string) {
    montar();
    await tarjeta("Arroz");
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    const form = screen.getByRole("dialog", { name: "Nuevo insumo" });
    fireEvent.change(within(form).getByRole("textbox", { name: "Nombre" }), { target: { value: nombre } });
    const categoria = within(form).getByRole("combobox", { name: "Categoría" });
    await within(categoria).findByRole("option", { name: "Carnes" });
    fireEvent.change(categoria, { target: { value: "1" } });
    return form;
  }

  const comoLoCompra = (form: HTMLElement) => within(form).getByRole("group", { name: "Cómo lo comprás" });

  it("cada tarjeta dice cómo se compra, el rinde, cuánto queda y lo que sale cada porción", async () => {
    montar();
    const arroz = await tarjeta("Arroz");
    expect(within(arroz).getByText("Quintal de 46 kg · 1 kg rinde 12 porciones")).toBeInTheDocument();
    // Lo que se estima «debería quedar»; lo que se cuenta, «queda».
    expect(within(arroz).getByText("Debería quedar")).toBeInTheDocument();
    expect(within(arroz).getByText("46 kg")).toBeInTheDocument();
    expect(within(arroz).getByText("552 porciones")).toBeInTheDocument();
    expect(within(arroz).getByText("Cada porción")).toBeInTheDocument();
    expect(within(arroz).getByText(fmtMoney(0.525))).toBeInTheDocument();
    expect(within(arroz).queryByText("Falta completar")).not.toBeInTheDocument();

    const pollo = await tarjeta("Pollo para broaster");
    expect(within(pollo).getByText("Por unidad · 1 unidad rinde 8 presas")).toBeInTheDocument();
    expect(within(pollo).getByText("Queda")).toBeInTheDocument();
    expect(within(pollo).getByText("120 presas")).toBeInTheDocument();
    expect(within(pollo).getByText("Cada presa")).toBeInTheDocument();
    expect(within(pollo).getByText(fmtMoney(4.6125))).toBeInTheDocument();
  });

  it("el que no tiene rinde dice «Falta completar», el que nunca se compró «Todavía sin costo», y el stock vuelve", async () => {
    montar();
    const yuca = await tarjeta("Yuca");
    expect(within(yuca).getByText("Falta completar")).toBeInTheDocument();
    expect(within(yuca).getByText("Todavía sin costo")).toBeInTheDocument();
    expect(within(yuca).getByText("Sin stock")).toBeInTheDocument();
  });

  it("no pide lo invertido del mes; vuelven los filtros por stock, y están «Registrar compra» y «Lista sugerida»", async () => {
    montar();
    await tarjeta("Arroz");
    expect(api.getComprasInsumos).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Lo invertido en insumos" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bajo stock" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sin stock" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar compra" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lista sugerida" })).toBeInTheDocument();
  });

  it("el detalle tiene el stock y lo de las recetas, sin el punto de reorden que la ficha no pide", async () => {
    montar();
    await tarjeta("Arroz");
    const detalle = await abrirDetalle("Arroz");
    expect(within(detalle).getByText("Stock actual")).toBeInTheDocument();
    expect(within(detalle).queryByText("Punto de reorden")).not.toBeInTheDocument();
    const recetas = within(detalle).getByRole("region", { name: "Para las recetas" });
    expect(recetas).toHaveTextContent("Quintal de 46 kg");
    expect(recetas).toHaveTextContent("1 kg rinde 12 porciones");
    expect(recetas).toHaveTextContent("Lo estimo");
    expect(recetas).toHaveTextContent("552 porciones");
    expect(recetas).toHaveTextContent(fmtMoney(0.525));
    expect(recetas).toHaveTextContent("En 3 platos");
  });

  it("el alta no tiene precio: arranca vacía y arma el bulto, el rinde y cómo se controla", async () => {
    const form = await nuevo("Fideo");
    expect(within(form).queryByText("Costo de compra")).not.toBeInTheDocument();
    expect(within(form).queryByRole("textbox", { name: /costo/i })).not.toBeInTheDocument();
    // El aviso de descartables es el de las recetas.
    expect(within(form).getByText(DESCARTABLES_CON_RECETAS)).toBeInTheDocument();
    expect(within(form).queryByText(/no son insumos de un plato/)).not.toBeInTheDocument();

    // Todo vacío: ningún chip elegido, nada escrito.
    for (const b of within(comoLoCompra(form)).getAllByRole("button")) expect(b).toHaveAttribute("aria-pressed", "false");
    expect(within(form).getByRole("textbox", { name: "Sirvo (cuántas)" })).toHaveValue("");
    expect(within(form).getByRole("button", { name: /^Lo cuento/ })).toHaveAttribute("aria-pressed", "false");
    expect(within(form).getByRole("button", { name: /^Lo estimo/ })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(within(comoLoCompra(form)).getByRole("button", { name: "Quintal" }));
    expect(within(form).getByRole("textbox", { name: "Cada quintal trae" })).toHaveValue("46");
    // «Con cuánto» vacío vale 1: el 1 se ve de ayuda.
    const conCuanto = within(form).getByRole("textbox", { name: "Con cuánto (en kilos)" });
    expect(conCuanto).toHaveValue("");
    expect(conCuanto).toHaveAttribute("placeholder", "1");
    fireEvent.change(within(form).getByRole("textbox", { name: "Sirvo (cuántas)" }), { target: { value: "12" } });
    fireEvent.click(within(form).getByRole("button", { name: "porciones" }));
    expect(within(form).getByText("Un quintal te alcanza para 552 porciones.")).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: /^Lo estimo/ }));

    // Sin compras todavía, y en un alta no hay qué ir a comprar.
    const costo = within(form).getByRole("region", { name: "Costo" });
    expect(costo).toHaveTextContent("Costo · sale de tus compras");
    expect(costo).toHaveTextContent("No se carga acá");
    expect(costo).toHaveTextContent("Todavía sin costo");
    expect(within(costo).queryByRole("button", { name: "Registrar una compra" })).not.toBeInTheDocument();

    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.crearInsumo).toHaveBeenCalled());
    const enviado = vi.mocked(api.crearInsumo).mock.calls[0][0];
    expect(enviado).toEqual({
      nombre: "Fideo",
      unidadMedidaId: 1,
      categoriaId: 1,
      puntoReorden: 0,
      proveedor: "",
      compraUnidad: "Quintal",
      compraContenido: 46,
      rindeCantidad: 1,
      rindePorciones: 12,
      porcionNombre: "porción",
      seCuenta: false,
      partes: null,
    });
    // El costo entra sólo por las compras.
    expect(enviado).not.toHaveProperty("costoCompra");
  });

  it("sin decir cómo se compra no se guarda", async () => {
    const form = await nuevo("Fideo");
    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    expect(await within(form).findByText("Elegí cómo lo comprás.")).toBeInTheDocument();
    expect(api.crearInsumo).not.toHaveBeenCalled();
  });

  it("una bolsa pregunta cuánto trae (vacío) y en qué viene; sin eso no se guarda", async () => {
    const form = await nuevo("Sal gruesa");
    fireEvent.click(within(comoLoCompra(form)).getByRole("button", { name: "Bolsa" }));
    const trae = within(form).getByRole("textbox", { name: "Cada bolsa trae" });
    expect(trae).toHaveValue("");
    const enQue = within(form).getByRole("combobox", { name: "En qué viene la bolsa" });
    expect(enQue).toHaveValue("KILO");

    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    expect(await within(form).findByText("Escribí cuánto trae cada bolsa.")).toBeInTheDocument();
    expect(api.crearInsumo).not.toHaveBeenCalled();

    fireEvent.change(trae, { target: { value: "5" } });
    fireEvent.change(enQue, { target: { value: "LITRO" } });
    expect(within(form).getByRole("textbox", { name: "Con cuánto (en litros)" })).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.crearInsumo).toHaveBeenCalled());
    expect(vi.mocked(api.crearInsumo).mock.calls[0][0]).toMatchObject({
      unidadMedidaId: 2,
      compraUnidad: "Bolsa",
      compraContenido: 5,
    });
  });

  it("un pollo entero: una unidad que sirve 8 presas ofrece la casilla y manda POLLO_8", async () => {
    const form = await nuevo("Pollo para brasa");
    fireEvent.click(within(comoLoCompra(form)).getByRole("button", { name: "Unidad" }));
    fireEvent.change(within(form).getByRole("textbox", { name: "Sirvo (cuántas)" }), { target: { value: "8" } });
    fireEvent.click(within(form).getByRole("button", { name: "presas" }));
    expect(within(form).getByText("Una unidad te alcanza para 8 presas.")).toBeInTheDocument();
    const entero = within(form).getByRole("checkbox", { name: "Es un pollo entero: 2 alas, 2 pechos, 2 piernas y 2 contras" });
    expect(entero).not.toBeChecked();
    fireEvent.click(entero);
    fireEvent.click(within(form).getByRole("button", { name: /^Lo cuento/ }));

    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.crearInsumo).toHaveBeenCalled());
    expect(vi.mocked(api.crearInsumo).mock.calls[0][0]).toMatchObject({
      unidadMedidaId: 3,
      compraUnidad: "Unidad",
      compraContenido: 1,
      rindeCantidad: 1,
      rindePorciones: 8,
      porcionNombre: "presa",
      seCuenta: true,
      partes: "POLLO_8",
    });
  });

  it("la casilla del pollo entero se va si ya no son 8 presas de una unidad", async () => {
    const form = await nuevo("Pollo para brasa");
    fireEvent.click(within(comoLoCompra(form)).getByRole("button", { name: "Unidad" }));
    fireEvent.change(within(form).getByRole("textbox", { name: "Sirvo (cuántas)" }), { target: { value: "8" } });
    fireEvent.click(within(form).getByRole("button", { name: "presas" }));
    fireEvent.click(within(form).getByRole("checkbox", { name: /Es un pollo entero/ }));
    fireEvent.change(within(form).getByRole("textbox", { name: "Sirvo (cuántas)" }), { target: { value: "4" } });
    expect(within(form).queryByRole("checkbox", { name: /Es un pollo entero/ })).not.toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.crearInsumo).toHaveBeenCalled());
    expect(vi.mocked(api.crearInsumo).mock.calls[0][0]).toMatchObject({ rindePorciones: 4, partes: null });
  });

  it("si el negocio no tiene la unidad del chip, la pide a mano", async () => {
    vi.mocked(api.getUnidades).mockResolvedValue([UNIDAD]);
    const form = await nuevo("Fideo");
    fireEvent.click(within(comoLoCompra(form)).getByRole("button", { name: "Arroba" }));
    // La ayuda de debajo entra en el nombre del campo (está dentro de su <label>).
    const unidad = within(form).getByRole("combobox", { name: /^Unidad de medida/ });
    expect(within(form).getByText("Tu negocio no tiene una unidad de kilos: elegí con cuál lo llevás.")).toBeInTheDocument();
    fireEvent.change(unidad, { target: { value: "3" } });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.crearInsumo).toHaveBeenCalled());
    expect(vi.mocked(api.crearInsumo).mock.calls[0][0]).toMatchObject({
      unidadMedidaId: 3,
      compraUnidad: "Arroba",
      compraContenido: 11.5,
    });
  });

  it("«Lista sugerida»: sólo lo que falta, y tocar uno abre el formulario con lo de fábrica", async () => {
    montar();
    await tarjeta("Arroz");
    fireEvent.click(screen.getByRole("button", { name: "Lista sugerida" }));
    const lista = screen.getByRole("dialog", { name: "Lista sugerida" });
    // Ya están el arroz, el pollo («Pollo para broaster») y la yuca.
    for (const ya of ["Arroz", "Pollo", "Yuca"]) {
      expect(within(lista).queryByRole("button", { name: ya })).not.toBeInTheDocument();
    }
    fireEvent.click(within(lista).getByRole("button", { name: "Aceite" }));

    // Una hoja por vez: la lista se cierra y abre el formulario.
    expect(screen.queryByRole("dialog", { name: "Lista sugerida" })).not.toBeInTheDocument();
    const form = screen.getByRole("dialog", { name: "Nuevo insumo" });
    expect(within(form).getByRole("textbox", { name: "Nombre" })).toHaveValue("Aceite");
    expect(within(comoLoCompra(form)).getByRole("button", { name: "Bidón" })).toHaveAttribute("aria-pressed", "true");
    expect(within(form).getByRole("textbox", { name: "Cada bidón trae" })).toHaveValue("20");
    expect(within(form).getByRole("combobox", { name: "En qué viene el bidón" })).toHaveValue("LITRO");
    expect(within(form).getByRole("textbox", { name: "Con cuánto (en litros)" })).toHaveValue("20");
    expect(within(form).getByRole("textbox", { name: "Sirvo (cuántas)" })).toHaveValue("500");
    expect(within(form).getByRole("button", { name: "porciones" })).toHaveAttribute("aria-pressed", "true");
    expect(within(form).getByRole("button", { name: /^Lo estimo/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(form).getByText("Un bidón te alcanza para 500 porciones.")).toBeInTheDocument();

    // La categoría es de cada negocio: no viene en la plantilla.
    const categoria = within(form).getByRole("combobox", { name: "Categoría" });
    expect(categoria).toHaveValue("");
    await within(categoria).findByRole("option", { name: "Carnes" });
    fireEvent.change(categoria, { target: { value: "1" } });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.crearInsumo).toHaveBeenCalled());
    expect(vi.mocked(api.crearInsumo).mock.calls[0][0]).toMatchObject({
      nombre: "Aceite",
      unidadMedidaId: 2,
      compraUnidad: "Bidón",
      compraContenido: 20,
      rindeCantidad: 20,
      rindePorciones: 500,
      porcionNombre: "porción",
      seCuenta: false,
      partes: null,
    });
  });

  it("la edición muestra el costo de las compras, de sólo lectura, y lleva a registrar una compra", async () => {
    montar();
    await tarjeta("Arroz");
    const detalle = await abrirDetalle("Arroz");
    fireEvent.click(within(detalle).getByRole("button", { name: "Editar" }));
    const form = screen.getByRole("dialog", { name: "Editar insumo" });
    expect(within(comoLoCompra(form)).getByRole("button", { name: "Quintal" })).toHaveAttribute("aria-pressed", "true");
    expect(within(form).getByRole("textbox", { name: "Cada quintal trae" })).toHaveValue("46");
    // Un 1 guardado en «Con cuánto» se ve vacío: vacío vale 1.
    expect(within(form).getByRole("textbox", { name: "Con cuánto (en kilos)" })).toHaveValue("");
    expect(within(form).getByRole("textbox", { name: "Sirvo (cuántas)" })).toHaveValue("12");

    const costo = within(form).getByRole("region", { name: "Costo" });
    // El quintal, cada kilo y cada porción.
    expect(costo).toHaveTextContent(`El quintal${fmtMoney(6.3 * 46)}`);
    expect(costo).toHaveTextContent(`Cada kilo${fmtMoney(6.3)}`);
    expect(costo).toHaveTextContent(`Cada porción${fmtMoney(0.525)}`);
    expect(costo).toHaveTextContent("Es lo que pagaste en tu última compra.");
    fireEvent.click(within(costo).getByRole("button", { name: "Registrar una compra" }));
    expect(await screen.findByText("ahora en /inventario/movimientos?nuevo=entrada")).toBeInTheDocument();
  });

  it("al guardar una edición no manda el costo (no se toca) y el punto de reorden escondido viaja como estaba", async () => {
    montar();
    await tarjeta("Arroz");
    fireEvent.click(within(await abrirDetalle("Arroz")).getByRole("button", { name: "Editar" }));
    const form = screen.getByRole("dialog", { name: "Editar insumo" });
    fireEvent.change(within(form).getByRole("textbox", { name: "Sirvo (cuántas)" }), { target: { value: "13" } });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.actualizarInsumo).toHaveBeenCalled());
    const [id, enviado] = vi.mocked(api.actualizarInsumo).mock.calls[0];
    expect(id).toBe(10);
    expect(enviado).toMatchObject({
      unidadMedidaId: 1,
      compraUnidad: "Quintal",
      compraContenido: 46,
      rindeCantidad: 1,
      rindePorciones: 13,
      porcionNombre: "porción",
      seCuenta: false,
      puntoReorden: 10,
    });
    expect(enviado).not.toHaveProperty("costoCompra");
  });

  it("un insumo de antes, sin cómo se compra, se edita con la unidad que ya tiene", async () => {
    montar();
    await tarjeta("Yuca");
    const detalle = await abrirDetalle("Yuca");
    expect(within(detalle).getByText(/Falta completar para cuánto te alcanza/)).toBeInTheDocument();
    fireEvent.click(within(detalle).getByRole("button", { name: "Editar" }));
    const form = screen.getByRole("dialog", { name: "Editar insumo" });
    for (const b of within(comoLoCompra(form)).getAllByRole("button")) expect(b).toHaveAttribute("aria-pressed", "false");
    const unidad = within(form).getByRole("combobox", { name: "Unidad de medida" });
    await within(unidad).findByRole("option", { name: "Kilogramo" });
    expect(unidad).toHaveValue("1");
    fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.actualizarInsumo).toHaveBeenCalled());
    const enviado = vi.mocked(api.actualizarInsumo).mock.calls[0][1];
    expect(enviado).toMatchObject({ unidadMedidaId: 1 });
    expect(enviado).not.toHaveProperty("compraUnidad");
    expect(enviado).not.toHaveProperty("rindePorciones");
    expect(enviado).not.toHaveProperty("costoCompra");
  });

  it("cambiar de bulto a otra unidad avisa que el stock se va a leer distinto", async () => {
    montar();
    await tarjeta("Arroz");
    fireEvent.click(within(await abrirDetalle("Arroz")).getByRole("button", { name: "Editar" }));
    const form = screen.getByRole("dialog", { name: "Editar insumo" });
    fireEvent.click(within(comoLoCompra(form)).getByRole("button", { name: "Litro" }));
    expect(within(form).getByRole("note")).toHaveTextContent(
      "Ojo: la unidad pasa de Kilogramo a Litro. El stock y el costo que ya tiene se van a leer en litros.",
    );
  });

  it("apagadas otra vez, la pantalla es la de siempre", async () => {
    sesion.recetas = { activas: false, elegirPresa: false, puroDoble: true };
    vi.mocked(api.getInsumos).mockResolvedValue([POLLO]);
    montar();
    await cargada();
    expect(screen.queryByRole("button", { name: "Lista sugerida" })).not.toBeInTheDocument();
    expect(screen.queryByText("Stock")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo" }));
    expect(within(screen.getByRole("dialog", { name: "Nuevo insumo" })).getByRole("textbox", { name: "Costo de compra" })).toBeInTheDocument();
  });
});
