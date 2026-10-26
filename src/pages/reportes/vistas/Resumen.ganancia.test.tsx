import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fmtMoney } from "../../../lib/format";
import type { CodigoMotivoEfectivo, Gasto } from "../../../types";
import type { EfectivoBillarApi, ResumenApi } from "../api";
import { ContextoReporte, type DatosReporte, type Exportacion } from "../contexto";
import EstadoResultado from "./EstadoResultado";
import Resumen from "./Resumen";

/**
 * La "Ganancia real" del Resumen es el mismo número que el final del Estado de
 * resultado (25-oct). En un billar no lo era: el Resumen no restaba las cenas
 * del personal y mostraba más ganancia que el Estado, con una tarjeta que dice
 * que son lo mismo. Ahora los dos restan lo que se pagó de la caja.
 */

const reporte = vi.fn();
const getGastos = vi.fn();
const request = vi.fn();
let rubro = "BILLAR";

vi.mock("../../../lib/api", () => ({
  api: {
    reporte: (...a: unknown[]) => reporte(...a),
    getGastos: (...a: unknown[]) => getGastos(...a),
  },
  qs: () => "",
  request: (...a: unknown[]) => request(...a),
}));

vi.mock("../../../store/AuthContext", () => ({
  // Ve la rentabilidad y los gastos: el Resumen arma la ganancia real.
  useAuth: () => ({
    rubro,
    negocio: { features: [] },
    usuario: { permisos: ["reportes.ver", "reportes.rentabilidad"] },
    puede: (s: string) => s === "gastos",
    incluye: (s: string) => s === "reportes_rentabilidad",
  }),
}));

vi.mock("../../../lib/useSucursales", () => ({
  useSucursales: () => ({ elegir: false, sucursales: [], sucursalId: null }),
}));

const RANGO = { desde: "2026-10-01", hasta: "2026-10-20" };

const GASTOS = [
  { id: 1, concepto: "Alquiler", categoria: "ALQUILER", categoriaNombre: "Alquiler", monto: 200, pagado: 0, fecha: "2026-10-01" },
  { id: 2, concepto: "Luz", categoria: "LUZ", categoriaNombre: "Luz", monto: 50, pagado: 50, fecha: "2026-10-05" },
] as Gasto[];

function resumen(p: Partial<ResumenApi> = {}): ResumenApi {
  return {
    ventas: 520,
    ventasDeltaPct: null,
    ventasPeriodoAnterior: 0,
    finanzas: { ingresosBrutos: 520, descuentos: 0, ingresosNetos: 520, costoVenta: 140, utilidadBruta: 380, margenPct: 73, deltaUtilidadPct: null },
    tickets: { valor: 8, deltaPct: null },
    ticketPromedio: { valor: 65, deltaPct: null },
    unidades: { valor: 20, deltaPct: null },
    tendencia: [],
    ...p,
  };
}

function respuestas(r: ResumenApi = resumen()) {
  reporte.mockImplementation((nombre: string) => {
    if (nombre === "resumen") return Promise.resolve(r);
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
      });
    }
    return Promise.resolve(null);
  });
  getGastos.mockResolvedValue(GASTOS);
}

const CODIGOS: CodigoMotivoEfectivo[] = ["CENA", "GASTO", "PROVEEDOR", "RETIRO", "OTRA_SALIDA", "SENCILLO", "OTRA_ENTRADA"];

function efectivo(montos: Partial<Record<CodigoMotivoEfectivo, number>>): EfectivoBillarApi {
  return {
    ...RANGO,
    porMotivo: Object.fromEntries(CODIGOS.map((c) => [c, { monto: montos[c] ?? 0, cantidad: montos[c] ? 1 : 0 }])) as EfectivoBillarApi["porMotivo"],
    gastos: [],
  };
}

/** El efectivo del billar (o su falla); el resto de `request` no se usa acá. */
function caja(e: EfectivoBillarApi | Error) {
  request.mockImplementation((url: string) =>
    url.includes("/efectivo") ? (e instanceof Error ? Promise.reject(e) : Promise.resolve(e)) : Promise.resolve(null),
  );
}

let exportacion: Exportacion | null = null;

function mostrar(vista: "resumen" | "resultado") {
  const datos: DatosReporte = {
    periodo: { preset: "rango", ...RANGO },
    comparacion: { desde: "2026-09-11", hasta: "2026-09-30", contra: "el período anterior", leyenda: "Período anterior" },
    rango: RANGO,
    rangoAnterior: { desde: "2026-09-11", hasta: "2026-09-30" },
    sucursalNombre: "",
    registrarExportacion: (e) => {
      exportacion = e;
    },
    veReporte: () => false,
  };
  return render(
    <MemoryRouter>
      <ContextoReporte.Provider value={datos}>{vista === "resumen" ? <Resumen /> : <EstadoResultado />}</ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

/** La tarjeta "Resumen financiero" del Resumen. */
async function tarjetaFinanciera() {
  return (await screen.findByText("Resumen financiero")).closest("section")!;
}

beforeEach(() => {
  reporte.mockReset();
  getGastos.mockReset();
  request.mockReset();
  rubro = "BILLAR";
  exportacion = null;
});

describe("Resumen: la ganancia real de un billar", () => {
  it("resta las cenas y los gastos de la caja, y da el mismo número que el Estado de resultado", async () => {
    // 380 − 250 (gastos) − 40 (cenas) − 30 (gastos de la caja) = 60. Un pago
    // a proveedor o un retiro no la tocan.
    respuestas();
    caja(efectivo({ CENA: 40, GASTO: 30, PROVEEDOR: 800, RETIRO: 300 }));
    const { unmount } = mostrar("resumen");

    const tarjeta = await tarjetaFinanciera();
    await within(tarjeta).findByText("Ganancia real");
    expect(within(tarjeta).getByText("− Cenas del personal")).toBeInTheDocument();
    expect(within(tarjeta).getByText("− Gastos pagados de la caja")).toBeInTheDocument();
    expect(within(tarjeta).getByText(fmtMoney(60))).toBeInTheDocument();
    unmount();

    mostrar("resultado");
    const final = (await screen.findByText(/Ganancia líquida del período/)).parentElement!;
    expect(final).toHaveTextContent(fmtMoney(60));
  });

  it("si no llega lo de la caja, la tarjeta falla con su Reintentar y no muestra una ganancia sin las cenas", async () => {
    respuestas();
    caja(new Error("No se pudo cargar el efectivo de la caja"));
    mostrar("resumen");

    const tarjeta = await tarjetaFinanciera();
    expect(await within(tarjeta).findByText("No se pudo cargar el efectivo de la caja")).toBeInTheDocument();
    expect(within(tarjeta).queryByText("Ganancia real")).not.toBeInTheDocument();
    // Las ventas, que no dependen de eso, siguen.
    expect(screen.getByText("Ticket prom.")).toBeInTheDocument();
  });

  it("el Excel lleva lo de la caja y la misma ganancia real", async () => {
    respuestas();
    caja(efectivo({ CENA: 40, GASTO: 30 }));
    mostrar("resumen");

    await within(await tarjetaFinanciera()).findByText("Ganancia real");
    await waitFor(() => expect(exportacion).not.toBeNull());
    const filas = exportacion!.hojas()[0].filas;
    expect(filas).toContainEqual(["Cenas del personal (Bs)", 40]);
    expect(filas).toContainEqual(["Gastos pagados de la caja (Bs)", 30]);
    expect(filas).toContainEqual(["Ganancia real (Bs)", 60]);
  });

  it("un restaurante no pide lo de la caja y su ganancia real es la de siempre", async () => {
    rubro = "RESTAURANTE";
    respuestas();
    caja(efectivo({ CENA: 40 }));
    mostrar("resumen");

    const tarjeta = await tarjetaFinanciera();
    await within(tarjeta).findByText("Ganancia real");
    expect(within(tarjeta).getByText(fmtMoney(130))).toBeInTheDocument();
    expect(within(tarjeta).queryByText("− Cenas del personal")).not.toBeInTheDocument();
    expect(request.mock.calls.some(([url]) => String(url).includes("/efectivo"))).toBe(false);
  });
});

describe("Resumen: las unidades", () => {
  it("van sin ceros de más: enteras sin decimales y con fracción sólo la que hay", async () => {
    // Kevin, 25-oct: "3,00 en unidad no da".
    respuestas(resumen({ unidades: { valor: 12.5, deltaPct: null } }));
    caja(efectivo({}));
    mostrar("resumen");
    expect((await screen.findByText("Unidades")).closest("div")!).toHaveTextContent("12,5");
  });
});
