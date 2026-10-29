import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fmtMoney } from "../../../lib/format";
import type { PaginaMeta, Venta } from "../../../types";
import { ContextoReporte, type DatosReporte, type Exportacion } from "../contexto";
import type { LineaVenta, ReporteDetalle, ReporteVentas } from "./Ventas.datos";
import Ventas from "./Ventas";

vi.setConfig({ testTimeout: 60_000 });

/**
 * Reportes › Ventas (26-oct): en un billar, el administrador toca una venta y
 * ve su "Detalle de venta" (el tiempo de mesa, los productos y cómo se pagó).
 * Una venta pagada parte y parte dice cuánto fue por cada medio. En el
 * restaurante (REP-02, 28-oct) la venta se toca y abre su recibo, como en la
 * app. Los demás rubros, y quien no administra el billar, ven la lista de
 * siempre. Y en el restaurante el Excel de General y Detallado es del período
 * entero (REP-03); en los demás rubros, la página que se ve.
 */

const sesion = vi.hoisted(() => ({ rubro: "BILLAR" as string, permisos: ["billar.admin"] as string[] }));
const reporteVentas = vi.hoisted(() => vi.fn());
const reporteVentasDetalle = vi.hoisted(() => vi.fn());
const getVenta = vi.hoisted(() => vi.fn());
const request = vi.hoisted(() => vi.fn());

vi.mock("../../../lib/api", async (original) => {
  const real = await original<typeof import("../../../lib/api")>();
  return {
    ...real,
    request,
    api: {
      ...real.api,
      reporteVentas: (...a: unknown[]) => reporteVentas(...a),
      reporteVentasDetalle: (...a: unknown[]) => reporteVentasDetalle(...a),
      getVenta: (...a: unknown[]) => getVenta(...a),
    },
  };
});

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: sesion.rubro,
    usuario: { id: 1, permisos: sesion.permisos },
    negocio: { alias: "billar-ventas", nombre: "Billar", features: [] },
    incluye: () => true,
  }),
}));

const RANGO = { desde: "2026-10-01", hasta: "2026-10-26" };

const respuesta = (): ReporteVentas => ({
  totales: { ventas: 1, ingresos: 160, ticketPromedio: 160, anuladas: 0, pendientes: 0 },
  vendedores: [{ id: 1, nombre: "Flavia Suarez" }],
  items: [
    {
      id: 5,
      comprobante: "V-000005",
      fecha: "2026-10-25T03:11:00.000Z",
      cliente: "Consumidor final",
      vendedor: "Flavia Suarez",
      estado: "APROBADO",
      metodoPago: "Mixto",
      articulos: 2,
      sucursal: null,
      total: 160,
      origen: "Mesa 1",
      billar: true,
      partes: [
        { medio: "Efectivo", monto: 80 },
        { medio: "QR", monto: 80 },
      ],
    },
  ],
  pagina: { page: 1, limite: 50, total: 1, totalPaginas: 1 },
});

const VENTA = {
  id: 5,
  codigo: "V-000005",
  hora: new Date(2026, 9, 24, 23, 11).getTime(),
  cajero: "Flavia Suarez",
  origen: "mesa",
  mesaId: 1,
  tipoMesa: "pool",
  tipoNombre: "Pool",
  tiempoMin: 120,
  tiempoBs: 130,
  items: [{ productoId: 1, nombre: "Paceña", precio: 15, cant: 2 }],
  consumosBs: 30,
  total: 160,
  pagos: [
    { id: "1", hora: new Date(2026, 9, 24, 23, 11).getTime(), metodo: "QR", monto: 80, previo: { hora: new Date(2026, 9, 24, 21, 30).getTime(), concepto: "ADELANTO", por: "Flavia Suarez" } },
    { id: "2", hora: new Date(2026, 9, 24, 23, 11).getTime(), metodo: "Efectivo", monto: 80 },
  ],
};

/** El "Exportar a Excel" que anotó la pestaña a la vista. */
let exportacion: Exportacion | null = null;

function mostrar() {
  const datos: DatosReporte = {
    periodo: { preset: "mes", ...RANGO },
    comparacion: { desde: "2026-09-01", hasta: "2026-09-26", contra: "1–26 de septiembre", leyenda: "1–26 de septiembre" },
    rango: RANGO,
    rangoAnterior: { desde: "2026-09-01", hasta: "2026-09-26" },
    sucursalNombre: "",
    registrarExportacion: (e) => {
      exportacion = e;
    },
    veReporte: () => false,
  };
  return render(
    <MemoryRouter>
      <ContextoReporte.Provider value={datos}>
        <Ventas />
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sesion.rubro = "BILLAR";
  sesion.permisos = ["billar.admin"];
  exportacion = null;
  getVenta.mockReset();
  reporteVentas.mockReset().mockResolvedValue(respuesta());
  reporteVentasDetalle.mockReset();
  request.mockReset().mockImplementation(async (url: string) => {
    if (url.startsWith("/billar/supervision/detalle")) return { abierta: false, sesionId: 900, venta: VENTA, historial: [] };
    throw new Error(`No esperado: ${url}`);
  });
});

describe("Reportes › Ventas en un billar", () => {
  it("la venta pagada parte y parte dice cuánto fue por cada medio", async () => {
    mostrar();
    expect(await screen.findByText("V-000005")).toBeInTheDocument();
    expect(screen.getByText(/Mixto \(Efectivo Bs\s80,00 \+ QR Bs\s80,00\)/)).toBeInTheDocument();
  });

  it("el administrador toca la venta y ve su detalle: cómo se pagó, con la hora del adelanto", async () => {
    mostrar();
    const fila = await screen.findByRole("button", { name: /V-000005/ });
    await act(async () => {
      fireEvent.click(fila);
    });
    const d = await screen.findByRole("dialog", { name: "Detalle de venta" });
    expect(request).toHaveBeenCalledWith("/billar/supervision/detalle?venta=5");
    expect(await within(d).findByText("V-000005 · Mesa 1 · Pool")).toBeInTheDocument();
    expect(within(d).getByText("Cómo se pagó")).toBeInTheDocument();
    expect(within(d).getByText(/^Adelanto · .*21:30 · cobró Flavia Suarez$/)).toBeInTheDocument();
    expect(within(d).getByText("2 × Paceña")).toBeInTheDocument();
  });

  it("sin el permiso de administrar el billar, la fila no se toca", async () => {
    sesion.permisos = ["reportes.operacion"];
    mostrar();
    expect(await screen.findByText("V-000005")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /V-000005/ })).toBeNull();
  });
});

/** Lo que devuelve `GET /ventas/5`: la mixta de la tabla, cobrada en el mostrador del restaurante. */
const VENTA_RESTAURANTE: Venta = {
  id: 5,
  comprobante: "V-000005",
  estado: "APROBADO",
  fecha: "2026-10-25T03:11:00.000Z",
  cajero: "Flavia Suarez",
  total: 160,
  detalles: [
    { productoId: 1, producto: "Brasa cuarto", cantidad: 4, precio: 26, subtotal: 104, nota: "Sin ensalada", consumo: "MESA" },
    { productoId: 2, producto: "Coca Cola 2L", cantidad: 2, precio: 28, subtotal: 56, nota: null, consumo: "LLEVAR" },
  ],
  pagos: [
    { formaPagoId: 1, formaPago: "Efectivo", monto: 80, recibido: 100, entregado: 20 },
    { formaPagoId: 2, formaPago: "QR", monto: 80, recibido: 80, entregado: 0 },
  ],
  mesa: "M3",
  mesero: "Juan",
  tipoPedido: "LOCAL",
  estadoEntrega: null,
  prepagado: false,
  clienteNombre: null,
  clienteDireccion: null,
  clienteTelefono: null,
  tarifaEnvio: 0,
  minutosEstimados: null,
  notaPedido: null,
  entregadoEn: null,
};

async function abrirRecibo() {
  const fila = await screen.findByRole("button", { name: /V-000005/ });
  await act(async () => {
    fireEvent.click(fila);
  });
  return screen.findByRole("dialog", { name: "Recibo de venta" });
}

describe("Reportes › Ventas en el restaurante (REP-02, 28-oct)", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
    sesion.permisos = ["reportes.ver", "ventas.historial"];
    getVenta.mockResolvedValue(VENTA_RESTAURANTE);
  });

  it("tocar una venta abre su recibo: qué se vendió y a qué precio, el mixto con cada monto, lo recibido y el cambio", async () => {
    // Antes la fila no se tocaba: una venta de otro día no se podía ver en
    // ningún lado (el historial del POS es sólo el del turno).
    mostrar();
    const d = await abrirRecibo();
    expect(getVenta).toHaveBeenCalledWith(5);
    expect(await within(d).findByText("Brasa cuarto")).toBeInTheDocument();
    expect(within(d).getByText(`4 × ${fmtMoney(26)}`)).toBeInTheDocument();
    expect(within(d).getByText("Sin ensalada")).toBeInTheDocument();
    expect(within(d).getByText("M")).toBeInTheDocument();
    expect(within(d).getByText("LL")).toBeInTheDocument();
    expect(within(d).getByText(`Efectivo ${fmtMoney(80)} · QR ${fmtMoney(80)}`)).toBeInTheDocument();
    expect(within(d).getByText("Efectivo recibido").nextSibling).toHaveTextContent(fmtMoney(100));
    expect(within(d).getByText("Cambio").nextSibling).toHaveTextContent(fmtMoney(20));
    expect(within(d).getByText("M3")).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: "Imprimir" })).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: "Compartir" })).toBeInTheDocument();
    // El papel es lo único que sale al imprimir.
    expect(d.querySelector("#area-impresion")).toHaveTextContent("TOTAL");
  });

  it("un pedido a domicilio dice cliente, teléfono, dirección, repartidor, envío y nota", async () => {
    getVenta.mockResolvedValue({
      ...VENTA_RESTAURANTE,
      mesa: null,
      mesero: null,
      tipoPedido: "DELIVERY",
      estadoEntrega: "ENTREGADO",
      prepagado: true,
      clienteNombre: "Juan Pérez",
      clienteTelefono: "70490686",
      clienteDireccion: "Av. Blanco Galindo km 4",
      repartidor: { id: 9, nombre: "Rodrigo" },
      tarifaEnvio: 8,
      notaPedido: "Tocar el timbre",
      entregadoEn: "2026-10-25T03:40:00.000Z",
    } satisfies Venta);
    mostrar();
    const d = await abrirRecibo();
    const bloque = await within(d).findByRole("region", { name: "Pedido a domicilio" });
    expect(bloque).toHaveTextContent("Juan Pérez");
    expect(bloque).toHaveTextContent("+591 70490686");
    expect(bloque).toHaveTextContent("Av. Blanco Galindo km 4");
    expect(bloque).toHaveTextContent("Rodrigo");
    // El envío va aparte del total: lo cobra y se lo queda el repartidor.
    expect(bloque).toHaveTextContent(`${fmtMoney(8)} (lo cobra el repartidor, va aparte del total)`);
    expect(bloque).toHaveTextContent("Tocar el timbre");
    // Un pedido va todo para llevar: sin la marca M/LL en cada renglón.
    expect(within(d).queryByText("LL")).toBeNull();
  });

  it("una venta anulada lo dice, también en el papel", async () => {
    getVenta.mockResolvedValue({ ...VENTA_RESTAURANTE, estado: "ANULADO", motivoAnulacion: "Error al cobrar", anulacionAutorizadaPor: "Kevin" });
    mostrar();
    const d = await abrirRecibo();
    expect(await within(d).findByText("Venta anulada")).toBeInTheDocument();
    expect(within(d).getByText("Motivo: Error al cobrar")).toBeInTheDocument();
    expect(d.querySelector("#area-impresion")).toHaveTextContent("*** ANULADA ***");
  });

  it("si el recibo no llega, lo dice con Reintentar en vez de quedar en blanco", async () => {
    getVenta.mockRejectedValueOnce(new Error("Venta 5 no encontrada")).mockResolvedValue(VENTA_RESTAURANTE);
    mostrar();
    const d = await abrirRecibo();
    expect(await within(d).findByText("Venta 5 no encontrada")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Reintentar" }));
    });
    expect(await within(d).findByText("Brasa cuarto")).toBeInTheDocument();
  });

  it("sin el permiso del historial de ventas, la fila no se toca", async () => {
    // Es el permiso que pide el backend para leer una venta.
    sesion.permisos = ["reportes.ver"];
    mostrar();
    expect(await screen.findByText("V-000005")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /V-000005/ })).toBeNull();
  });

  it("la fila sigue diciendo «Mixto» como siempre: los montos van en el recibo", async () => {
    mostrar();
    expect(await screen.findByText(/· Mixto ·/)).toBeInTheDocument();
    expect(screen.queryByText(/Mixto \(/)).toBeNull();
  });
});

describe("Reportes › Ventas en otro rubro", () => {
  it("la fila no es un botón y el método se lee como siempre", async () => {
    // Guarda: el recibo es del restaurante; la farmacia sigue igual aunque
    // tenga el permiso del historial.
    sesion.rubro = "FARMACIA";
    sesion.permisos = ["reportes.ver", "ventas.historial"];
    mostrar();
    expect(await screen.findByText("V-000005")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /V-000005/ })).toBeNull();
    expect(screen.queryByText(/Mixto \(/)).toBeNull();
    expect(screen.getByText(/· Mixto ·/)).toBeInTheDocument();
    expect(getVenta).not.toHaveBeenCalled();
  });
});

/** Dos cajeros, para que haya filtro, y la página 1 de 2: la hoja de la pantalla dice cuál es. */
const conDosCajeros = (): ReporteVentas => ({
  ...respuesta(),
  vendedores: [
    { id: 1, nombre: "Flavia Suarez" },
    { id: 2, nombre: "Rodrigo Vaca" },
  ],
  pagina: { page: 1, limite: 50, total: 60, totalPaginas: 2 },
});

/** Una venta distinta en cada página de 200, para ver que entran todas al Excel. */
const ventaDePagina = (page: number) => ({ ...respuesta().items[0], id: 100 + page, comprobante: `V-00010${page}`, vendedor: "Rodrigo Vaca" });

const LINEA: LineaVenta = {
  ventaId: 101,
  comprobante: "V-000101",
  fecha: "2026-10-25T03:11:00.000Z",
  vendedor: "Rodrigo Vaca",
  producto: "Brasa cuarto",
  codigo: null,
  cantidad: 2,
  precio: 26,
  subtotal: 52,
};

const detalle = (items: LineaVenta[], pagina: PaginaMeta): ReporteDetalle => ({
  totales: { productos: 2 * items.length, recaudado: 52 * items.length, precioPromedio: 26, lineas: items.length },
  items,
  pagina,
});

describe("Reportes › Ventas: en el restaurante el Excel es del período entero (REP-03, 28-oct)", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
    sesion.permisos = ["reportes.ver", "ventas.historial"];
  });

  it("General baja todas las páginas de a 200, con el cajero del filtro y el período", async () => {
    // Ningún test miraba este cableado: si el pedido perdía el `usuarioId`, la
    // planilla salía con las ventas de todos los cajeros mientras la pantalla
    // mostraba las de uno.
    reporteVentas.mockImplementation(async (p: { page: number; limite: number }) =>
      p.limite === 200
        ? { ...conDosCajeros(), items: [ventaDePagina(p.page)], pagina: { page: p.page, limite: 200, total: 2, totalPaginas: 2 } }
        : conDosCajeros(),
    );
    mostrar();
    fireEvent.change(await screen.findByRole("combobox", { name: "Cajero" }), { target: { value: "2" } });
    await waitFor(() => expect(reporteVentas).toHaveBeenLastCalledWith({ ...RANGO, usuarioId: 2, page: 1, limite: 50 }));
    await waitFor(() => expect(exportacion?.completa).toBeDefined());

    const r = await exportacion!.completa!();
    expect(reporteVentas).toHaveBeenCalledWith({ ...RANGO, usuarioId: 2, page: 1, limite: 200 });
    expect(reporteVentas).toHaveBeenCalledWith({ ...RANGO, usuarioId: 2, page: 2, limite: 200 });
    // Los títulos y una venta de cada página; la hoja ya no dice "pág.".
    expect(r.hojas[0].nombre).toBe("Ventas");
    expect(r.hojas[0].filas.map((f) => f[0])).toEqual(["Comprobante", "V-000101", "V-000102"]);
    expect(r.aviso).toBeNull();
  });

  it("Detallado también: todas las líneas del período, con el cajero del filtro", async () => {
    reporteVentas.mockResolvedValue(conDosCajeros());
    reporteVentasDetalle.mockImplementation(async (p: { page: number; limite: number }) =>
      p.limite === 200
        ? detalle([{ ...LINEA, ventaId: 100 + p.page, comprobante: `V-00010${p.page}` }], { page: p.page, limite: 200, total: 2, totalPaginas: 2 })
        : detalle([LINEA], { page: 1, limite: 50, total: 60, totalPaginas: 2 }),
    );
    mostrar();
    fireEvent.click(screen.getByRole("tab", { name: "Detallado" }));
    fireEvent.change(await screen.findByRole("combobox", { name: "Cajero" }), { target: { value: "2" } });
    await waitFor(() => expect(reporteVentasDetalle).toHaveBeenLastCalledWith({ ...RANGO, usuarioId: 2, page: 1, limite: 50 }));
    await waitFor(() => expect(exportacion?.completa).toBeDefined());

    const r = await exportacion!.completa!();
    expect(reporteVentasDetalle).toHaveBeenCalledWith({ ...RANGO, usuarioId: 2, page: 1, limite: 200 });
    expect(reporteVentasDetalle).toHaveBeenCalledWith({ ...RANGO, usuarioId: 2, page: 2, limite: 200 });
    expect(r.hojas[0].nombre).toBe("Detallado");
    // Los títulos y una línea de cada página.
    expect(r.hojas[0].filas).toHaveLength(3);
  });
});

describe("Reportes › Ventas: en los demás rubros el Excel sigue siendo la página que se ve", () => {
  it("en el billar, General y Detallado bajan la página a la vista y la hoja lo dice", async () => {
    // Guarda de REP-03: el período entero es del restaurante. La primera
    // versión se lo cambiaba también al billar (y a belleza, farmacia y
    // academia), que no lo habían pedido.
    sesion.rubro = "BILLAR";
    reporteVentas.mockResolvedValue(conDosCajeros());
    reporteVentasDetalle.mockResolvedValue(detalle([LINEA], { page: 1, limite: 50, total: 60, totalPaginas: 2 }));
    mostrar();
    await waitFor(() => expect(exportacion?.nombre).toBe("ventas-general"));
    expect(exportacion!.completa).toBeUndefined();
    expect(exportacion!.hojas()[0].nombre).toBe("Ventas pág. 1 de 2");

    fireEvent.click(screen.getByRole("tab", { name: "Detallado" }));
    await waitFor(() => expect(exportacion?.nombre).toBe("ventas-detallado"));
    expect(exportacion!.completa).toBeUndefined();
    expect(exportacion!.hojas()[0].nombre).toBe("Detallado pág. 1 de 2");
    expect(reporteVentas).not.toHaveBeenCalledWith(expect.objectContaining({ limite: 200 }));
    expect(reporteVentasDetalle).not.toHaveBeenCalledWith(expect.objectContaining({ limite: 200 }));
  });
});
