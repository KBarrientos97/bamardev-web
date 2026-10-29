import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fmtMoney } from "../../../lib/format";
import type { Gasto } from "../../../types";
import type { ClasesAcademiaApi } from "../api";
import { ContextoReporte, type DatosReporte, type Exportacion } from "../contexto";
import EstadoResultado from "./EstadoResultado";

/**
 * El Estado de resultado de la academia (L5, 28-oct): "Cobrado por clases" y
 * "Ventas de productos" arriba, "Sueldos docentes" (lo pagado) debajo de los
 * gastos del local y la planilla pendiente al costado, sin restar. Los demás
 * rubros los cubre `EstadoResultado.test.tsx`, que no cambió.
 */

const reporte = vi.fn();
const getGastos = vi.fn();
const request = vi.fn();
let rubro = "ACADEMIA";

vi.mock("../../../lib/api", () => ({
  api: {
    reporte: (...a: unknown[]) => reporte(...a),
    getGastos: (...a: unknown[]) => getGastos(...a),
  },
  qs: () => "",
  request: (...a: unknown[]) => request(...a),
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({ rubro, negocio: { features: [] }, puede: () => true }),
}));

vi.mock("../../../lib/useSucursales", () => ({
  useSucursales: () => ({ elegir: false, sucursales: [], sucursalId: null }),
}));

function gasto(id: number, concepto: string, categoria: string, monto: number): Gasto {
  return { id, concepto, categoria, categoriaNombre: categoria, monto, pagado: monto, fecha: "2026-10-03" } as Gasto;
}

const GASTOS = [gasto(1, "Alquiler del aula", "ALQUILER", 1500), gasto(2, "Recepción", "SUELDOS", 800), gasto(3, "Planilla docente Ana · 2026-09", "SUELDOS", 1200)];

const CLASES: ClasesAcademiaApi = {
  desde: "2026-10-01",
  hasta: "2026-10-31",
  sede: null,
  cobradoCuotas: 5000,
  cursos: [
    {
      curso: { id: 1, nombre: "Barbería" },
      precioModulo: 500,
      cobrado: 5000,
      pagaron: 9,
      sinModulo: 0,
      modulos: [
        {
          materia: { id: 10, nombre: "Corte clásico", orden: 1 },
          precio: 500,
          cobrado: 5000,
          pagaron: 9,
          alumnos: 12,
          grupos: [
            { id: 7, nombre: "Barbería L-M-V", sede: { id: 1, nombre: "Central" }, dias: [1, 3, 5], horaInicio: "18:00", horaFin: "20:00", alumnos: 12, desde: "2026-10-10", hasta: "2026-11-09" },
          ],
        },
      ],
    },
  ],
  sueldos: {
    pagado: 1200,
    gastoIds: [3],
    pagos: [{ gastoId: 3, concepto: "Planilla docente Ana · 2026-09", docente: "Ana", fecha: "2026-10-03", monto: 1200, sede: { id: 1, nombre: "Central" } }],
    pendiente: { meses: [{ mes: "2026-10", cerrada: 0, enCurso: 900 }], cerrada: 0, enCurso: 900, total: 900 },
  },
};

function respuestas({ clases = CLASES as ClasesAcademiaApi | Error, cobradoCuotas = 5000 as number | undefined } = {}) {
  reporte.mockImplementation((nombre: string) => {
    if (nombre === "financiero") {
      return Promise.resolve({
        ventas: 5320,
        costoVentas: 120,
        utilidadBruta: 5200,
        utilidadBrutaDeltaPct: null,
        ventasSinCosto: 0,
        mermas: 0,
        cobradoCuotas,
        compras: { total: 0, insumos: 0, productos: 0 },
        desglose: [],
      });
    }
    if (nombre === "resumen") return Promise.resolve({ tickets: { valor: 14, deltaPct: null } });
    return Promise.resolve(null);
  });
  getGastos.mockResolvedValue(GASTOS);
  request.mockImplementation((url: string) =>
    url.includes("/academia/reportes/clases") ? (clases instanceof Error ? Promise.reject(clases) : Promise.resolve(clases)) : Promise.resolve(null),
  );
}

let exportacion: Exportacion | null = null;

function mostrar() {
  const datos: DatosReporte = {
    periodo: { preset: "rango", desde: "2026-10-01", hasta: "2026-10-31" },
    comparacion: { desde: "2026-09-01", hasta: "2026-09-30", contra: "septiembre", leyenda: "Período anterior" },
    rango: { desde: "2026-10-01", hasta: "2026-10-31" },
    rangoAnterior: { desde: "2026-09-01", hasta: "2026-09-30" },
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
        </Routes>
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

describe("estado de resultado de la academia", () => {
  beforeEach(() => {
    reporte.mockReset();
    getGastos.mockReset();
    request.mockReset();
    rubro = "ACADEMIA";
    exportacion = null;
  });

  it("parte lo que entra en clases y productos, y los sueldos docentes van en su línea", async () => {
    respuestas();
    mostrar();
    const cascada = (await screen.findByText("Cómo se llega al resultado")).closest("section")!;
    expect(within(cascada).getByText("Cobrado por clases")).toBeInTheDocument();
    expect(within(cascada).getByText("1 curso · 9 estudiantes pagaron")).toBeInTheDocument();
    expect(within(cascada).getByText("Ventas de productos")).toBeInTheDocument();
    expect(within(cascada).getByText(fmtMoney(320))).toBeInTheDocument();
    expect(within(cascada).getByText("Sueldos docentes")).toBeInTheDocument();
    expect(within(cascada).getByText("Lo pagado de la planilla en el período")).toBeInTheDocument();
    // Los gastos del local sin la planilla: 1.500 + 800 (la recepción sigue acá).
    expect(within(cascada).getAllByText(`−${fmtMoney(2300)}`).length).toBeGreaterThan(0);
    // El resultado es el de la cuenta común: 5.200 − 2.300 − 1.200.
    expect(
      screen.getByText(
        `Las clases dejaron ${fmtMoney(5000)} y los productos ${fmtMoney(200)}. Restando los gastos del local (${fmtMoney(2300)}) y los sueldos docentes (${fmtMoney(1200)}), te quedan ${fmtMoney(1700)}: es tu ganancia líquida.`,
      ),
    ).toBeInTheDocument();
  });

  it("la planilla pendiente se ve al costado y no resta", async () => {
    respuestas();
    mostrar();
    expect(await screen.findByText(`Planilla pendiente de pagar · ${fmtMoney(900)}`)).toBeInTheDocument();
    expect(screen.getByText(`${fmtMoney(900)} del mes en curso`)).toBeInTheDocument();
    expect(screen.getByText(/No resta del resultado/)).toBeInTheDocument();
  });

  it("al tocar Cobrado por clases se ve el detalle por curso y módulo, con los horarios", async () => {
    respuestas();
    mostrar();
    fireEvent.click(await screen.findByText("Cobrado por clases"));
    const dialogo = await screen.findByRole("dialog", { name: "Cobrado por clases" });
    expect(within(dialogo).getByText("Barbería")).toBeInTheDocument();
    expect(within(dialogo).getByText(/Módulo 1 · Corte clásico/)).toBeInTheDocument();
    expect(within(dialogo).getByText("12 inscritos · 9 pagaron")).toBeInTheDocument();
    expect(within(dialogo).getByText(/L Mi V 18:00–20:00 · Central/)).toBeInTheDocument();
  });

  it("los gastos del local no repiten la planilla: la tarjeta lista el alquiler y los sueldos a mano", async () => {
    respuestas();
    mostrar();
    await screen.findByText("Cómo se llega al resultado");
    const tarjeta = screen.getByText("Cuentan aunque todavía no los pagués").closest("section")!;
    // ALQUILER 1.500 y SUELDOS 800 (sin los 1.200 de la planilla).
    expect(within(tarjeta).getByText(fmtMoney(800))).toBeInTheDocument();
    expect(within(tarjeta).queryByText(fmtMoney(2000))).not.toBeInTheDocument();
  });

  it("si el detalle de las clases falla, la cuenta sigue: la planilla queda en los gastos del local", async () => {
    respuestas({ clases: new Error("sin red") });
    mostrar();
    const cascada = (await screen.findByText("Cómo se llega al resultado")).closest("section")!;
    expect(within(cascada).getByText("Cobrado por clases")).toBeInTheDocument();
    expect(within(cascada).getByText("No se pagó planilla en este período")).toBeInTheDocument();
    expect(within(cascada).getAllByText(`−${fmtMoney(3500)}`).length).toBeGreaterThan(0);
    expect(screen.getByText(/te quedan Bs\s?1\.700,00/)).toBeInTheDocument();
  });

  it("el Excel trae las líneas de la academia y el detalle por módulo", async () => {
    respuestas();
    mostrar();
    await screen.findByText("Cómo se llega al resultado");
    const hojas = exportacion!.hojas() as { nombre: string; filas: unknown[][] }[];
    expect(hojas.map((h) => h.nombre)).toEqual(expect.arrayContaining(["Estado de resultado", "Cobrado por clases", "Planilla pendiente sin pagar"]));
    const resultado = JSON.stringify(hojas.find((h) => h.nombre === "Estado de resultado"));
    expect(resultado).toContain("Cobrado por clases");
    expect(resultado).toContain("Sueldos docentes (pagados)");
  });
});
