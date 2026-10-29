import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fmtFecha, fmtMoney } from "../../lib/format";
import type { Almacen, ComprasInsumos, Insumo } from "../../types";

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
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: sesion.rubro,
    puede: (s: string) => sesion.secciones.includes(s),
    usuario: { sucursalId: sesion.sucursalId },
    negocio: { tipoNegocio: sesion.rubro, features: [] },
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
