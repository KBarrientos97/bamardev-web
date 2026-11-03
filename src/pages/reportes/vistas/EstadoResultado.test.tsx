import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fmtMoney } from "../../../lib/format";
import type { CodigoMotivoEfectivo, Gasto } from "../../../types";
import type { EfectivoBillarApi, FinancieroApi } from "../api";
import { ContextoReporte, type DatosReporte, type Exportacion } from "../contexto";
import { periodoDe, type Periodo } from "../periodo";
import EstadoResultado from "./EstadoResultado";

/**
 * El estado de resultado adaptado a cada rubro (pedido de Kevin del 14-oct):
 * el billar parte la venta en mesas y productos, el restaurante sigue como en
 * la app, y lo que no es parte de la cuenta (el resumen, las horas) no tumba
 * el reporte si falla. Lo que sí es parte (los gastos, el efectivo del billar)
 * lo tumba entero.
 */

const reporte = vi.fn();
const getGastos = vi.fn();
const request = vi.fn();
let rubro = "BILLAR";
/** ¿Puede editar el catálogo? Decide si el aviso de lo vendido sin costo lleva a Artículos. */
let editaCatalogo = true;

vi.mock("../../../lib/api", () => ({
  api: {
    reporte: (...a: unknown[]) => reporte(...a),
    getGastos: (...a: unknown[]) => getGastos(...a),
  },
  qs: () => "",
  request: (...a: unknown[]) => request(...a),
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({ rubro, negocio: { features: [] }, puede: (s: string) => s !== "productos" || editaCatalogo }),
}));

vi.mock("../../../lib/useSucursales", () => ({
  useSucursales: () => ({ elegir: false, sucursales: [], sucursalId: null }),
}));

const RANGO = { desde: "2026-09-01", hasta: "2026-09-30" };

function gasto(id: number, concepto: string, categoria: string, monto: number, pagado = 0): Gasto {
  return { id, concepto, categoria, categoriaNombre: categoria, monto, pagado, fecha: "2026-09-01" } as Gasto;
}

const GASTOS = [
  gasto(1, "Alquiler del local", "ALQUILER", 200),
  gasto(2, "Luz de las mesas", "LUZ", 50, 50),
];

/** El financiero (con lo que el test cambie), y el resumen con su composición (o un rechazo). */
function respuestas({ resumen = true, fin = {} }: { resumen?: boolean; fin?: Partial<FinancieroApi> } = {}) {
  reporte.mockImplementation((nombre: string) => {
    if (nombre === "financiero") {
      return Promise.resolve({
        ventas: 520,
        costoVentas: 140,
        utilidadBruta: 380,
        utilidadBrutaDeltaPct: null,
        ventasSinCosto: 0,
        mermas: 0,
        compras: { total: 0, insumos: 0, productos: 0 },
        desglose: [],
        ...fin,
      });
    }
    if (nombre === "resumen") {
      return resumen
        ? Promise.resolve({ tickets: { valor: 8, deltaPct: null }, composicion: { servicios: 280, productos: 240 } })
        : Promise.reject(new Error("sin resumen"));
    }
    return Promise.resolve(null);
  });
}

const CODIGOS: CodigoMotivoEfectivo[] = ["CENA", "GASTO", "PROVEEDOR", "RETIRO", "OTRA_SALIDA", "SENCILLO", "OTRA_ENTRADA"];

/** Lo que movió la caja del billar por motivo, como lo manda `GET /billar/reportes/efectivo`. */
function efectivo(montos: Partial<Record<CodigoMotivoEfectivo, number>> = {}, gastos: EfectivoBillarApi["gastos"] = []): EfectivoBillarApi {
  return {
    ...RANGO,
    porMotivo: Object.fromEntries(CODIGOS.map((c) => [c, { monto: montos[c] ?? 0, cantidad: montos[c] ? 1 : 0 }])) as EfectivoBillarApi["porMotivo"],
    gastos,
  };
}

const HORAS = { horas: 12.7, porMesa: [{ horas: 5 }, { horas: 4.2 }, { horas: 3.5 }] };

/** `request` responde según la ruta: el efectivo de la caja, o el reporte del billar (las horas). */
function billar({ caja = efectivo(), horas = HORAS }: { caja?: EfectivoBillarApi | Error; horas?: unknown } = {}) {
  request.mockImplementation((url: string) => {
    if (url.includes("/efectivo")) return caja instanceof Error ? Promise.reject(caja) : Promise.resolve(caja);
    return Promise.resolve(horas);
  });
}

function Ubicacion() {
  const l = useLocation();
  return <p>ahora en {l.pathname} · {JSON.stringify(l.state)}</p>;
}

let exportacion: Exportacion | null = null;

function mostrar({ periodo = { preset: "rango", ...RANGO } }: { periodo?: Periodo } = {}) {
  const datos: DatosReporte = {
    periodo,
    comparacion: { desde: "2026-08-02", hasta: "2026-08-31", contra: "del 02/08 al 31/08/2026", leyenda: "Período anterior" },
    rango: { desde: periodo.desde, hasta: periodo.hasta },
    rangoAnterior: { desde: "2026-08-02", hasta: "2026-08-31" },
    sucursalNombre: "",
    registrarExportacion: (e) => {
      exportacion = e;
    },
    veReporte: () => true,
  };
  return render(
    <MemoryRouter initialEntries={["/reportes/resultado"]}>
      <ContextoReporte.Provider value={datos}>
        <Routes>
          <Route path="/reportes/resultado" element={<EstadoResultado />} />
          <Route path="/reportes/:id" element={<Ubicacion />} />
        </Routes>
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

describe("estado de resultado por rubro", () => {
  beforeEach(() => {
    reporte.mockReset();
    getGastos.mockReset();
    request.mockReset();
    rubro = "BILLAR";
    editaCatalogo = true;
    exportacion = null;
  });

  it("el billar muestra el tiempo de mesa con sus horas, los productos y lo que dejó cada parte", async () => {
    respuestas();
    getGastos.mockResolvedValue(GASTOS);
    billar();
    mostrar();

    expect(await screen.findByText("Tiempo de mesa")).toBeInTheDocument();
    expect(await screen.findByText("12,7 h jugadas en 3 mesas")).toBeInTheDocument();
    expect(screen.getByText("Bebidas y productos")).toBeInTheDocument();
    expect(screen.getByText("Ganancia de mesas y productos")).toBeInTheDocument();
    expect(screen.getByText(/8 ventas/)).toBeInTheDocument();
    // La ganancia líquida, dicha en palabras: 380 − 250 = 130.
    expect(
      screen.getByText(
        `Las mesas dejaron ${fmtMoney(280)} y los productos ${fmtMoney(100)}. Restando los gastos del local (${fmtMoney(250)}), te quedan ${fmtMoney(130)}: es tu ganancia líquida.`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ganancia líquida del período/i)).toBeInTheDocument();
  });

  it("las cenas del personal restan en su propia línea del billar, y se cuentan en la ganancia", async () => {
    respuestas();
    getGastos.mockResolvedValue(GASTOS);
    billar({ caja: efectivo({ CENA: 40 }) });
    mostrar();

    expect(await screen.findByText("Cenas del personal")).toBeInTheDocument();
    expect(screen.getByText("Efectivo que salió de la caja para la cena")).toBeInTheDocument();
    // 380 − 250 (gastos del local) − 40 (cenas) = 90; las cenas no se mezclan con los gastos del local.
    expect(
      screen.getByText(
        `Las mesas dejaron ${fmtMoney(280)} y los productos ${fmtMoney(100)}. Restando los gastos del local (${fmtMoney(250)}) y las cenas del personal (${fmtMoney(40)}), te quedan ${fmtMoney(90)}: es tu ganancia líquida.`,
      ),
    ).toBeInTheDocument();
    // Una sola llamada para lo de la caja: la de las cenas ya no se pide.
    expect(request.mock.calls.some(([url]) => String(url).includes("/cenas"))).toBe(false);
  });

  it("sin cenas ni gastos de la caja las líneas no se dibujan (ni en cero)", async () => {
    respuestas();
    getGastos.mockResolvedValue(GASTOS);
    billar();
    mostrar();

    expect(await screen.findByText("Ganancia de mesas y productos")).toBeInTheDocument();
    expect(screen.queryByText("Cenas del personal")).not.toBeInTheDocument();
    expect(screen.queryByText(/cenas del personal/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Gastos pagados de la caja")).not.toBeInTheDocument();
    expect(screen.queryByText("Lo que movió la caja sin cambiar tu ganancia")).not.toBeInTheDocument();
  });

  it("los gastos pagados de la caja restan en su línea y abren su detalle: qué, quién y de qué caja", async () => {
    respuestas();
    getGastos.mockResolvedValue(GASTOS);
    billar({
      caja: efectivo({ CENA: 40, GASTO: 30 }, [
        { id: 11, fecha: "2026-09-12T23:40:00.000Z", descripcion: "Hielo", monto: 18, quien: "Kevin", cajera: "Pepe" },
        { id: 12, fecha: "2026-09-13T22:10:00.000Z", descripcion: "Tiza", monto: 12, quien: "Kevin", cajera: "Ana" },
      ]),
    });
    mostrar();

    const cascada = (await screen.findByText("Cómo se llega al resultado")).closest("section")!;
    expect(within(cascada).getByText("Hielo y tiza")).toBeInTheDocument();
    // 380 − 250 − 40 − 30 = 60.
    expect(
      screen.getByText(
        `Las mesas dejaron ${fmtMoney(280)} y los productos ${fmtMoney(100)}. Restando los gastos del local (${fmtMoney(250)}), las cenas del personal (${fmtMoney(40)}) y los gastos pagados de la caja (${fmtMoney(30)}), te quedan ${fmtMoney(60)}: es tu ganancia líquida.`,
      ),
    ).toBeInTheDocument();

    fireEvent.click(within(cascada).getByText("Gastos pagados de la caja"));
    const detalle = await screen.findByRole("dialog");
    expect(within(detalle).getByText("Hielo")).toBeInTheDocument();
    expect(within(detalle).getByText(/Registró Kevin · caja de Pepe/)).toBeInTheDocument();
    expect(within(detalle).getByText(/caja de Ana/)).toBeInTheDocument();
    expect(within(detalle).getByText(/se restaría dos veces/)).toBeInTheDocument();
    expect(within(detalle).getByText("Ver movimientos de caja")).toBeInTheDocument();
  });

  it("lo que movió la caja sin cambiar la ganancia va al costado, sólo lo que hubo, y no resta", async () => {
    respuestas();
    getGastos.mockResolvedValue(GASTOS);
    billar({ caja: efectivo({ PROVEEDOR: 800, RETIRO: 300 }) });
    mostrar();

    const tarjeta = (await screen.findByText("Lo que movió la caja sin cambiar tu ganancia")).closest("section")!;
    expect(within(tarjeta).getByText("Pagos a proveedores")).toBeInTheDocument();
    expect(within(tarjeta).getByText(`−${fmtMoney(800)}`)).toBeInTheDocument();
    expect(within(tarjeta).getByText("Retiros")).toBeInTheDocument();
    expect(within(tarjeta).queryByText("Sencillo")).not.toBeInTheDocument();
    // La ganancia es la de siempre: 380 − 250.
    expect(screen.getByText(/te quedan Bs 130,00: es tu ganancia líquida/)).toBeInTheDocument();
  });

  it("el Excel lleva la línea de los gastos de la caja y su detalle en una hoja", async () => {
    respuestas();
    getGastos.mockResolvedValue(GASTOS);
    billar({
      caja: efectivo({ GASTO: 18 }, [{ id: 11, fecha: "2026-09-12T23:40:00.000Z", descripcion: "Hielo", monto: 18, quien: "Kevin", cajera: "Pepe" }]),
    });
    mostrar();

    await screen.findByText("Gastos pagados de la caja");
    await waitFor(() => expect(exportacion).not.toBeNull());
    const hojas = exportacion!.hojas();
    expect(hojas[0].filas).toContainEqual(["Gastos pagados de la caja", -18, 3.5]);
    const caja = hojas.find((h) => h.nombre === "Gastos de la caja")!;
    expect(caja.filas[0]).toEqual(["Fecha", "Concepto", "Registró", "Caja de", "Monto (Bs)"]);
    expect(caja.filas[1].slice(1)).toEqual(["Hielo", "Kevin", "Pepe", 18]);
  });

  it("sin gastos de la caja el Excel no lleva ni la fila ni la hoja", async () => {
    respuestas();
    getGastos.mockResolvedValue(GASTOS);
    billar({ caja: efectivo({ CENA: 40 }) });
    mostrar();

    await screen.findByText("Cenas del personal");
    await waitFor(() => expect(exportacion).not.toBeNull());
    const hojas = exportacion!.hojas();
    expect(hojas.map((h) => h.nombre)).toEqual(["Estado de resultado", "Gastos", "Compras (informativo)"]);
    expect(hojas[0].filas.map((f) => f[0])).not.toContain("Gastos pagados de la caja");
  });

  it("en el mes en curso las cenas solas no arman la tarjeta del mes", async () => {
    // Con las cenas y nada cargado decía "Ya cubriste los gastos" del mes.
    respuestas();
    getGastos.mockResolvedValue([]);
    billar({ caja: efectivo({ CENA: 40 }) });
    mostrar({ periodo: periodoDe("mes") });

    expect(await screen.findByText("Cenas del personal")).toBeInTheDocument();
    expect(screen.queryByText("Mes en curso")).not.toBeInTheDocument();
    expect(screen.getByText(/Todavía no cargaste los gastos del local/)).toBeInTheDocument();
  });

  it("en el mes en curso la meta suma las cenas llevadas al mes y lo dice", async () => {
    respuestas();
    getGastos.mockResolvedValue(GASTOS);
    billar({ caja: efectivo({ CENA: 40 }) });
    mostrar({ periodo: periodoDe("mes") });

    expect(await screen.findByText("Mes en curso")).toBeInTheDocument();
    expect(screen.getByText(/Son los gastos cargados \(Bs 250,00\) y las cenas del personal del mes entero/)).toBeInTheDocument();
  });

  it("el restaurante va con una sola línea de ventas y habla de la comida, como en la app", async () => {
    rubro = "RESTAURANTE";
    respuestas();
    getGastos.mockResolvedValue(GASTOS);
    mostrar();

    expect(await screen.findByText("Ganancia de la comida")).toBeInTheDocument();
    expect(screen.getByText("Costo cargado en cada plato")).toBeInTheDocument();
    expect(screen.queryByText("Tiempo de mesa")).not.toBeInTheDocument();
    // Ni el reporte del billar ni el efectivo de la caja se piden fuera del billar.
    expect(request).not.toHaveBeenCalled();
    expect(screen.queryByText("Lo que movió la caja sin cambiar tu ganancia")).not.toBeInTheDocument();
  });

  it("si el resumen falla, el billar sigue con la venta en una sola línea", async () => {
    // El resumen sólo parte la primera línea: no es una mitad de la cuenta.
    respuestas({ resumen: false });
    getGastos.mockResolvedValue(GASTOS);
    billar({ horas: null });
    mostrar();

    expect(await screen.findByText("Ganancia de mesas y productos")).toBeInTheDocument();
    expect(screen.queryByText("Tiempo de mesa")).not.toBeInTheDocument();
    expect(screen.getByText("Ventas")).toBeInTheDocument();
  });

  it("si fallan los gastos, falla el reporte entero y no muestra una ganancia inflada", async () => {
    respuestas();
    getGastos.mockRejectedValue(new Error("No se pudieron cargar los gastos"));
    billar({ horas: null });
    mostrar();

    expect(await screen.findByText("No se pudieron cargar los gastos")).toBeInTheDocument();
    expect(screen.queryByText(/ganancia líquida/i)).not.toBeInTheDocument();
  });

  it("si falla el efectivo de la caja, falla el reporte entero: sin las cenas la ganancia sale inflada", async () => {
    // Invariante 6: un reporte de plata que muestra un número incompleto en
    // silencio miente peor que uno que no carga.
    respuestas();
    getGastos.mockResolvedValue(GASTOS);
    billar({ caja: new Error("No se pudo cargar el efectivo de la caja") });
    mostrar();

    expect(await screen.findByText("No se pudo cargar el efectivo de la caja")).toBeInTheDocument();
    expect(screen.queryByText(/ganancia líquida/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Cómo se llega al resultado")).not.toBeInTheDocument();
  });

  it("los gastos del local abren su detalle: qué son, agrupados, con lo pagado y lo que falta", async () => {
    respuestas();
    getGastos.mockResolvedValue(GASTOS);
    billar({ horas: null });
    mostrar();

    const cascada = (await screen.findByText("Cómo se llega al resultado")).closest("section")!;
    fireEvent.click(within(cascada).getByText("Gastos del local"));
    const detalle = await screen.findByRole("dialog");
    expect(within(detalle).getByText("Qué son los gastos del local")).toBeInTheDocument();
    expect(within(detalle).getByText(/paños, tacos, bolas/)).toBeInTheDocument();
    expect(within(detalle).getByText(`Pagado ${fmtMoney(50)}`)).toBeInTheDocument();
    expect(within(detalle).getByText(`Falta pagar ${fmtMoney(200)}`)).toBeInTheDocument();
  });

  it("tocar Ventas lleva al historial y le avisa a dónde volver", async () => {
    respuestas();
    getGastos.mockResolvedValue(GASTOS);
    billar({ horas: null });
    mostrar();

    const cascada = (await screen.findByText("Cómo se llega al resultado")).closest("section")!;
    fireEvent.click(within(cascada).getByText("Ventas"));
    expect(await screen.findByText(/ahora en \/reportes\/ventas/)).toHaveTextContent('"volverA":"Estado de resultado"');
  });
});

describe("restaurante: platos sin costo e insumos (28-oct)", () => {
  // Desde el backend del 28-oct, en un restaurante lo vendido sin costo cuenta
  // también los platos (Elaborados), y viene QUÉ se vendió sin costo.
  const SIN_COSTO = [
    { id: 11, nombre: "Broaster medio", ventas: 112 },
    { id: 12, nombre: "Salchipapa", ventas: 34 },
    { id: 13, nombre: "Coca 2L", ventas: 20 },
    { id: 14, nombre: "Té", ventas: 4 },
  ];

  beforeEach(() => {
    reporte.mockReset();
    getGastos.mockReset();
    request.mockReset();
    rubro = "RESTAURANTE";
    editaCatalogo = true;
    getGastos.mockResolvedValue(GASTOS);
  });

  async function cascada() {
    return (await screen.findByText("Cómo se llega al resultado")).closest("section")!;
  }

  it("el aviso bajo el costo nombra los platos que más pesan, y el detalle los nombra a todos con el enlace a Artículos", async () => {
    // Con el total solo ("Bs 170 de platos sin costo") el dueño no sabía a
    // cuál cargarle el costo y tenía que revisar el menú entero.
    respuestas({ fin: { ventasSinCosto: 170, productosSinCosto: SIN_COSTO } });
    mostrar();

    const pasos = await cascada();
    expect(
      within(pasos).getByText(
        `Ojo: ${fmtMoney(170)} de estas ventas son de platos sin costo cargado. Esa parte figura con 100 % de ganancia.`,
      ),
    ).toBeInTheDocument();
    expect(
      within(pasos).getByText(
        `Sin costo cargado: Broaster medio (${fmtMoney(112)}), Salchipapa (${fmtMoney(34)}), Coca 2L (${fmtMoney(20)}) y 1 más.`,
      ),
    ).toBeInTheDocument();

    fireEvent.click(within(pasos).getByText("Costo de lo vendido"));
    const detalle = await screen.findByRole("dialog", { name: "Costo de lo vendido" });
    expect(
      within(detalle).getByText(
        `Sin costo cargado: Broaster medio (${fmtMoney(112)}), Salchipapa (${fmtMoney(34)}), Coca 2L (${fmtMoney(20)}), Té (${fmtMoney(4)}).`,
      ),
    ).toBeInTheDocument();
    expect(within(detalle).getByRole("link", { name: /Cargales el costo en Artículos/ })).toHaveAttribute(
      "href",
      "/inventario/productos",
    );
  });

  it("sin permiso para el catálogo dice dónde se carga el costo, sin enlace", async () => {
    editaCatalogo = false;
    respuestas({ fin: { ventasSinCosto: 146, productosSinCosto: SIN_COSTO.slice(0, 2) } });
    mostrar();

    fireEvent.click(within(await cascada()).getByText("Costo de lo vendido"));
    const detalle = await screen.findByRole("dialog", { name: "Costo de lo vendido" });
    expect(within(detalle).getByText("El costo se carga en Artículos.")).toBeInTheDocument();
    expect(within(detalle).queryByRole("link", { name: /Cargales el costo/ })).not.toBeInTheDocument();
  });

  it("con un backend anterior, sin la lista, el aviso queda con el texto de siempre", async () => {
    respuestas({ fin: { ventasSinCosto: 146 } });
    mostrar();

    const pasos = await cascada();
    expect(
      within(pasos).getByText(
        `Ojo: ${fmtMoney(146)} de estas ventas son de platos sin costo cargado. Esa parte figura con 100 % de ganancia.`,
      ),
    ).toBeInTheDocument();
    expect(within(pasos).queryByText(/^Sin costo cargado:/)).not.toBeInTheDocument();

    fireEvent.click(within(pasos).getByText("Costo de lo vendido"));
    const detalle = await screen.findByRole("dialog", { name: "Costo de lo vendido" });
    expect(within(detalle).getByText(/cuentan como si no costaran nada/)).toBeInTheDocument();
    expect(within(detalle).queryByText(/^Sin costo cargado:/)).not.toBeInTheDocument();
    expect(within(detalle).queryByRole("link", { name: /Cargales el costo/ })).not.toBeInTheDocument();
  });

  it("las compras de insumos no restan: la tarjeta dice por qué y la ganancia es la de siempre", async () => {
    // Invariante del 28-oct: los insumos ya están en el costo de cada plato.
    // Una línea de insumos en la cascada contaría la comida dos veces.
    respuestas({ fin: { compras: { total: 3000, insumos: 2400, productos: 600 } } });
    mostrar();

    const pasos = await cascada();
    expect(within(pasos).queryByText(/insumo/i)).not.toBeInTheDocument();
    // 380 − 250 de gastos del local: las compras no tocan la cuenta.
    expect(screen.getByText(/te quedan Bs 130,00: es tu ganancia líquida/)).toBeInTheDocument();

    const compras = screen.getByText(`Compras del período · ${fmtMoney(3000)}`).closest("section")!;
    expect(within(compras).getByText(/los insumos ya entran en el costo de cada plato/)).toBeInTheDocument();
    expect(within(compras).getByText(/van en Gastos → Descartables, y ahí sí restan/)).toBeInTheDocument();
  });
});

describe("los demás rubros: el aviso de lo vendido sin costo, como siempre (28-oct)", () => {
  // La lista con nombre es del restaurante: Kevin lo decidió así ("farmacia,
  // billar, minimarket: sin cambios") y el backend la manda en todos los
  // rubros. En belleza, además, contradecía al aviso: dice "servicios sin
  // costo cargado" y nombraba productos, porque ahí los servicios no cuentan.
  const SIN_COSTO = [
    { id: 21, nombre: "Shampoo", ventas: 90 },
    { id: 22, nombre: "Gel fijador", ventas: 56 },
  ];

  beforeEach(() => {
    reporte.mockReset();
    getGastos.mockReset();
    request.mockReset();
    editaCatalogo = true;
    getGastos.mockResolvedValue(GASTOS);
    // Lo que pide el billar además (el efectivo de la caja, las horas).
    billar();
  });

  it.each([
    ["BILLAR", "productos", "Costo de los productos"],
    ["FARMACIA", "medicamentos", "Costo de lo vendido"],
    ["MINIMARKET", "productos", "Costo de lo vendido"],
    ["PELUQUERIA", "servicios", "Costo de lo vendido"],
  ])("%s: el aviso dice el total, sin la lista ni el enlace", async (r, cosas, costoTitulo) => {
    rubro = r;
    respuestas({ fin: { ventasSinCosto: 146, productosSinCosto: SIN_COSTO } });
    mostrar();

    const pasos = (await screen.findByText("Cómo se llega al resultado")).closest("section")!;
    expect(
      within(pasos).getByText(
        `Ojo: ${fmtMoney(146)} de estas ventas son de ${cosas} sin costo cargado. Esa parte figura con 100 % de ganancia.`,
      ),
    ).toBeInTheDocument();
    expect(within(pasos).queryByText(/Sin costo cargado:/)).not.toBeInTheDocument();
    expect(within(pasos).queryByText(/Shampoo/)).not.toBeInTheDocument();

    fireEvent.click(within(pasos).getByText(costoTitulo));
    const detalle = await screen.findByRole("dialog", { name: costoTitulo });
    expect(within(detalle).getByText(/cuentan como si no costaran nada/)).toBeInTheDocument();
    expect(within(detalle).queryByText(/Sin costo cargado:/)).not.toBeInTheDocument();
    expect(within(detalle).queryByText(/Shampoo/)).not.toBeInTheDocument();
    expect(within(detalle).queryByRole("link", { name: /Cargales el costo/ })).not.toBeInTheDocument();
  });
});
