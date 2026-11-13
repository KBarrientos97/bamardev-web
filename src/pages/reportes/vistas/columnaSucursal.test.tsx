import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CierreApi, CreditosApi, DescuentosApi } from "../api";
import { ContextoReporte, type DatosReporte, type Exportacion } from "../contexto";
import Cierres from "./Cierres";
import { hojaCierres } from "./Cierres.datos";
import CreditosReporte from "./CreditosReporte";
import { hojasCreditos } from "./CreditosReporte.datos";
import Descuentos from "./Descuentos";
import { hojasDescuentos } from "./Descuentos.datos";
import { hojaMovimientos } from "./MovimientosCaja.datos";

/**
 * La columna «Sucursal» de los reportes (PLAN-SUCURSAL-TOTAL §1 y §9.2/§9.3):
 * sólo la organización con 2+ locales y sólo si las filas son de más de uno.
 * Con un local, o asignado a una sede, la pantalla y el Excel son los de siempre.
 */

const reporte = vi.fn();

vi.mock("../../../lib/api", () => ({
  api: { reporte: (...a: unknown[]) => reporte(...a) },
  qs: () => "",
  request: () => Promise.resolve(null),
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({ rubro: "RESTAURANTE", negocio: { features: [] }, puede: () => true }),
}));

const CENTRO = { id: 1, nombre: "Centro" };
const NORTE = { id: 2, nombre: "Norte" };

const cierre = (id: number, sucursal: CierreApi["sucursal"]): CierreApi => ({
  id,
  sucursal,
  fecha: "05 nov",
  fechaApertura: "2026-11-05T12:00:00.000Z",
  fechaCierre: "2026-11-05T20:00:00.000Z",
  cajero: `Cajero ${id}`,
  duracion: "8 h",
  totalDia: 100,
  apertura: 50,
  efectivo: 80,
  qr: 20,
  esperado: 130,
  conteo: 130,
});

let exportacion: Exportacion | null = null;

function mostrar(vista: ReactElementLike, { varias }: { varias: boolean }) {
  const datos: DatosReporte = {
    periodo: { preset: "mes", desde: "2026-11-01", hasta: "2026-11-30" },
    comparacion: { desde: "2026-10-02", hasta: "2026-10-31", contra: "x", leyenda: "Período anterior" },
    rango: { desde: "2026-11-01", hasta: "2026-11-30" },
    rangoAnterior: { desde: "2026-10-02", hasta: "2026-10-31" },
    sucursalNombre: "",
    sucursalArchivo: varias ? { nombre: "Todas las sucursales", rotulo: "Sucursal" } : null,
    variasSucursales: varias,
    registrarExportacion: (e) => {
      exportacion = e;
    },
    veReporte: () => true,
  };
  return render(
    <MemoryRouter>
      <ContextoReporte.Provider value={datos}>{vista}</ContextoReporte.Provider>
    </MemoryRouter>,
  );
}
type ReactElementLike = React.ReactElement;

beforeEach(() => {
  reporte.mockReset();
  exportacion = null;
});

describe("Cierres de caja", () => {
  const dos = { performance: [], historial: [cierre(1, CENTRO), cierre(2, NORTE)] };

  it("la organización con cierres de 2+ locales ve de cuál es cada caja", async () => {
    reporte.mockResolvedValue(dos);
    mostrar(<Cierres />, { varias: true });
    expect(await screen.findByText("Centro")).toBeInTheDocument();
    expect(screen.getByText("Norte")).toBeInTheDocument();
    await waitFor(() => expect(exportacion).not.toBeNull());
    const titulos = exportacion!.hojas()[0].filas[0] as string[];
    expect(titulos.slice(0, 4)).toEqual(["Día", "Turno", "Cajero (abrió)", "Sucursal"]);
  });

  it("si todos los cierres son del mismo local, no repite el nombre en cada fila", async () => {
    reporte.mockResolvedValue({ performance: [], historial: [cierre(1, CENTRO), cierre(2, CENTRO)] });
    mostrar(<Cierres />, { varias: true });
    expect(await screen.findByText(/Cajero 1/)).toBeInTheDocument();
    expect(screen.queryByText("Centro")).toBeNull();
    await waitFor(() => expect(exportacion).not.toBeNull());
    expect(exportacion?.hojas()[0].filas[0]).not.toContain("Sucursal");
  });

  it("quien no es de organización (un local, o asignado a una sede) no ve columna aunque el dato llegue", async () => {
    reporte.mockResolvedValue(dos);
    mostrar(<Cierres />, { varias: false });
    expect(await screen.findByText(/Cajero 1/)).toBeInTheDocument();
    expect(screen.queryByText("Centro")).toBeNull();
    expect(screen.queryByText("Norte")).toBeNull();
    await waitFor(() => expect(exportacion).not.toBeNull());
    expect(exportacion?.hojas()[0].filas[0]).not.toContain("Sucursal");
  });
});

describe("el Excel con la columna", () => {
  it("cierres: la columna va después del cajero, y sin ella el Excel es el de siempre", () => {
    const filas = [cierre(1, CENTRO), cierre(2, NORTE)];
    const con = hojaCierres(filas, true, "Sede");
    expect(con.filas[0]).toContain("Sede");
    expect(con.filas[1][3]).toBe("Centro");
    expect(con.filas[2][3]).toBe("Norte");
    const sin = hojaCierres(filas);
    expect(sin.filas[0]).not.toContain("Sede");
    expect(sin.filas[0]).toHaveLength((con.filas[0] as unknown[]).length - 1);
  });

  it("movimientos de caja: sólo si es organización y las filas son de 2+ locales", () => {
    const m = (id: number, sucursal: { id: number; nombre: string } | null) => ({
      id, clase: "INGRESO" as const, fecha: "2026-11-05T12:00:00.000Z", concepto: "Sencillo", detalle: null, usuario: "Ana", turnoId: 9, monto: 10, sucursal,
    });
    const mezcla = [m(1, CENTRO), m(2, NORTE)];
    expect(hojaMovimientos(mezcla, "Mov", { permitida: true }).filas[0]).toContain("Sucursal");
    expect(hojaMovimientos(mezcla, "Mov", { permitida: false }).filas[0]).not.toContain("Sucursal");
    expect(hojaMovimientos(mezcla, "Mov").filas[0]).not.toContain("Sucursal");
    // Un solo local entre las filas (más una vieja sin local): sin columna.
    expect(hojaMovimientos([m(1, CENTRO), m(3, null)], "Mov", { permitida: true }).filas[0]).not.toContain("Sucursal");
  });

  it("créditos: dónde debe cada deudor (uno o varios locales) y dónde entró cada cobro", () => {
    const d = {
      resumen: { totalPorCobrar: 90 },
      antiguedad: [],
      deudores: [
        { clienteId: 7, cliente: "Ana", telefono: null, saldoTotal: 90, montoVencido: 0, creditos: 2, diasAtrasoMax: 0, sucursales: [CENTRO, NORTE], sucursal: null },
      ],
      cobros: [{ id: 1, fecha: "2026-11-05T12:00:00.000Z", codigo: "CR1", cliente: "Ana", monto: 10, formaPago: "Efectivo", usuario: "Luis", sucursal: NORTE }],
    } as unknown as CreditosApi;
    const [debe, , cobros] = hojasCreditos(d, true, "Sucursal");
    expect(debe.filas[0]).toContain("Sucursal");
    expect(debe.filas[1]).toContain("Centro, Norte");
    expect(cobros.filas[1]).toContain("Norte");
    const [debeSin, , cobrosSin] = hojasCreditos(d);
    expect(debeSin.filas[0]).not.toContain("Sucursal");
    expect(cobrosSin.filas[0]).not.toContain("Sucursal");
  });

  it("anulaciones: el local de la venta anulada", () => {
    const d = {
      descuentosPorCajero: [],
      anulacionesPorCajero: [],
      ultimasAnulaciones: [{ fecha: "12 oct", idVenta: "V-1", cajero: "Ana", monto: 20, autorizadoPor: null, motivo: null, sucursal: NORTE }],
    } as unknown as DescuentosApi;
    const hojas = hojasDescuentos(d, true);
    expect(hojas[hojas.length - 1].filas[0]).toContain("Sucursal");
    expect(hojas[hojas.length - 1].filas[1]).toContain("Norte");
    expect(hojasDescuentos(d)[hojas.length - 1].filas[0]).not.toContain("Sucursal");
  });
});

describe("créditos y anulaciones en pantalla", () => {
  it("créditos: el nombre del local en el deudor y en el cobro, sólo con 2+ locales", async () => {
    const d = {
      resumen: { totalPorCobrar: 90, totalVencido: 0, creditosAbiertos: 2, clientesConSaldo: 1, fiadoEnPeriodo: 0, cobradoEnPeriodo: 10, abonosEnPeriodo: 1 },
      antiguedad: [],
      deudores: [
        { clienteId: 7, cliente: "Ana", telefono: null, saldoTotal: 90, montoVencido: 0, creditos: 2, diasAtrasoMax: 0, sucursales: [CENTRO, NORTE], sucursal: null },
      ],
      cobros: [{ id: 1, fecha: "2026-11-05T12:00:00.000Z", codigo: "CR1", cliente: "Ana", monto: 10, formaPago: "Efectivo", usuario: "Luis", sucursal: NORTE }],
    } as unknown as CreditosApi;
    reporte.mockResolvedValue(d);
    mostrar(<CreditosReporte />, { varias: true });
    expect(await screen.findByText("Centro, Norte")).toBeInTheDocument();
    expect(screen.getByText(/Cobró Luis · Norte/)).toBeInTheDocument();
  });

  it("anulaciones: el local de cada una, sólo con 2+ locales", async () => {
    const d = {
      totalPerdido: 20, totalDescuentos: 0, totalAnulado: 20, pctConDescuento: 0,
      descuentosPorCajero: [],
      anulacionesPorCajero: [{ cajero: "Ana", monto: 20, cantidad: 2 }],
      ultimasAnulaciones: [
        { fecha: "12 oct", idVenta: "V-1", cajero: "Ana", monto: 10, autorizadoPor: null, motivo: null, sucursal: CENTRO },
        { fecha: "12 oct", idVenta: "V-2", cajero: "Ana", monto: 10, autorizadoPor: null, motivo: null, sucursal: NORTE },
      ],
    } as unknown as DescuentosApi;
    reporte.mockImplementation((nombre: string) =>
      Promise.resolve(nombre === "resumen" ? { tickets: { valor: 5 }, ventas: 200 } : d),
    );
    mostrar(<Descuentos />, { varias: true });
    expect(await screen.findByText("Anulación · V-2")).toBeInTheDocument();
    expect(screen.getByText("Centro")).toBeInTheDocument();
    expect(screen.getByText("Norte")).toBeInTheDocument();
  });
});
