import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HistorialPagosDocente, LineaPlanilla, PlanillaDocente as TPlanillaDocente } from "../../../lib/academia/tipos";

/**
 * Pagos a docentes con 2+ sedes (PLAN-SUCURSAL-TOTAL §8.6): pagar es del mes
 * ENTERO del docente (todas sus sedes) aunque se esté mirando una. El botón y
 * la confirmación dicen `aPagar`, se avisa «además dicta en otra sede» antes
 * de ofrecer pagar, la confirmación dice cómo se reparte en Gastos por sede y
 * a quien está atado a una sede no se le ofrece pagar si el docente dicta
 * también en otra. Con una sola sede, nada de esto aparece.
 */

const sesion = vi.hoisted(() => ({ sucursalId: null as number | null, sucursal: null as string | null, sedes: 2 }));

vi.mock("../../../store/AuthContext", async () => {
  const { SESION_ADMIN: s } = await import("../../../test/academiaFixtures");
  return {
    useAuth: () => ({
      ...s,
      usuario: { ...s.usuario, sucursalId: sesion.sucursalId, sucursal: sesion.sucursal },
      negocio: { ...s.negocio, sucursalesActivas: sesion.sedes },
      puede: () => true,
    }),
  };
});

vi.mock("../../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/api")>();
  return {
    ...real,
    api: {
      ...real.api,
      getSucursales: vi.fn(async () =>
        [
          { id: 1, nombre: "Central", activo: true, tipo: "SUCURSAL", esPrincipal: true },
          { id: 2, nombre: "Norte", activo: true, tipo: "SUCURSAL", esPrincipal: false },
        ].slice(0, sesion.sedes),
      ),
    },
  };
});

vi.mock("../../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: {
      planilla: vi.fn(),
      planillaDocente: vi.fn(),
      cerrarPlanilla: vi.fn(),
      pagarPlanilla: vi.fn(),
      guardarMotivoNoPago: vi.fn(),
      quitarMotivoNoPago: vi.fn(),
      pagosDocente: vi.fn(),
    },
  };
});

vi.mock("../../../lib/compartirTicket", () => ({
  compartirComoImagen: vi.fn().mockResolvedValue({ ok: true }),
  enviarPorWhatsapp: vi.fn().mockResolvedValue({ ok: true }),
  puedeCompartirImagen: () => false,
}));

import { apiAcademia } from "../../../lib/academia/apiAcademia";
import HistorialPagos from "./HistorialPagos";
import PlanillaDocente from "./PlanillaDocente";
import PlanillaMes from "./PlanillaMes";

const CENTRAL = { id: 1, nombre: "Central" };
const NORTE = { id: 2, nombre: "Norte" };

const linea = (extra: Partial<LineaPlanilla>): LineaPlanilla => ({
  inscripcionId: 101,
  alumno: { id: 51, nombre: "Andrade Villca, Mateo" },
  grupo: { id: 7, nombre: "Barbería · L-M-V 09–11" },
  materia: { orden: 2, nombre: "Degradados" },
  formaPago: "COMPLETO",
  cobradoModulo: 450,
  abonado: 450,
  montoModulo: 450,
  modalidad: "PORCENTAJE",
  pct: 20,
  montoFijo: null,
  monto: 600,
  explicacion: "Pagó Bs 3.000 · 20 % = Bs 600",
  sede: CENTRAL,
  ...extra,
});

/** Marco dicta en Central (Bs 600) y en Norte (Bs 300): el mes entero son Bs 900. */
const PLANILLA: TPlanillaDocente = {
  docente: { personalId: 9, nombre: "Marco Rojas" },
  mes: "2026-10",
  estado: "EN_CURSO",
  pct: { defecto: 20, porCurso: [] },
  aPagar: 900,
  porSede: [
    { sede: CENTRAL, liquido: 600 },
    { sede: NORTE, liquido: 300 },
  ],
  otrasSedes: [],
  resumen: { cuentan: 2, postergados: 0, sinPagar: 0, atrasados: 0, bruto: 900, retencion: null, retencionActiva: false, atrasos: null, liquido: 900 },
  cuentan: [
    linea({}),
    linea({ inscripcionId: 102, alumno: { id: 52, nombre: "Durán Aguilar, Luciana" }, grupo: { id: 8, nombre: "Barbería · M-J 19–21" }, monto: 300, sede: NORTE }),
  ],
  postergados: [],
  atrasados: [],
  sinPagar: [],
  meses: [],
};

/** La lista vista desde Central: el subtotal de la sede es 600, el pago del mes entero 900. */
const FILA = { personalId: 9, nombre: "Marco Rojas", grupos: 1, cuentan: 10, total: 12, bruto: 600, retencion: null, liquido: 600, estado: "EN_CURSO" as const };
const OTRAS = [{ sede: NORTE, liquido: 300 }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 16, 10, 0));
  sesion.sucursalId = null;
  sesion.sucursal = null;
  sesion.sedes = 2;
  vi.mocked(apiAcademia.planilla).mockResolvedValue({
    mes: "2026-10",
    retencionActiva: false,
    docentes: [{ ...FILA, aPagar: 900, otrasSedes: OTRAS }],
    totales: { bruto: 600, liquido: 600 },
  });
  vi.mocked(apiAcademia.planillaDocente).mockResolvedValue(PLANILLA);
  vi.mocked(apiAcademia.cerrarPlanilla).mockResolvedValue({});
  vi.mocked(apiAcademia.pagarPlanilla).mockResolvedValue({});
  vi.mocked(apiAcademia.pagosDocente).mockResolvedValue({ docente: { personalId: 9, nombre: "Marco Rojas", telefono: null }, pagos: [] });
});

afterEach(() => vi.useRealTimers());

async function montarMes() {
  render(
    <MemoryRouter>
      <PlanillaMes />
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("Pagos a docentes con 2 sedes", () => {
  it("el botón y la tarjeta dicen lo que realmente se paga y avisan que dicta en otra sede", async () => {
    await montarMes();
    const marco = screen.getByRole("listitem", { name: "Marco Rojas" });
    // El botón es el mes entero (900), no el subtotal de la sede (600).
    expect(within(marco).getByRole("button", { name: "Pagar Bs 900,00" })).toBeInTheDocument();
    expect(within(marco).queryByRole("button", { name: "Pagar Bs 600,00" })).not.toBeInTheDocument();
    expect(marco).toHaveTextContent(/Además dicta en Norte \(Bs 300,00\): el pago es de todo el mes/);
    expect(marco).toHaveTextContent(/en esta sede: Bs 600,00/);
    // Los totales de arriba siguen siendo de la sede y lo dicen.
    expect(screen.getByRole("region", { name: "Resumen del mes" })).toHaveTextContent(/sólo lo de esta sede/);
  });

  it("la confirmación dice el monto del mes, el aviso y cómo se reparte en Gastos por sede", async () => {
    await montarMes();
    const marco = screen.getByRole("listitem", { name: "Marco Rojas" });
    fireEvent.click(within(marco).getByRole("button", { name: "Pagar Bs 900,00" }));
    const dialogo = screen.getByRole("dialog", { name: "Pagar a Marco Rojas" });
    expect(dialogo).toHaveTextContent(/¿Pagar Bs 900,00 a Marco Rojas/);
    expect(dialogo).toHaveTextContent(/Además dicta en Norte/);
    expect(dialogo).toHaveTextContent("Se reparte en Gastos por sede: Central Bs 600,00 · Norte Bs 300,00.");
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Pagar Bs 900,00" }));
    });
    expect(apiAcademia.pagarPlanilla).toHaveBeenCalledWith(9, "2026-10", "EFECTIVO");
    expect(screen.getByText(/Pagaste Bs 900,00 a Marco Rojas/)).toBeInTheDocument();
  });

  it("quien está atado a una sede no puede pagar a un docente que dicta también en otra: lo paga la organización", async () => {
    sesion.sucursalId = 1;
    sesion.sucursal = "Central";
    await montarMes();
    const marco = screen.getByRole("listitem", { name: "Marco Rojas" });
    expect(within(marco).queryByRole("button", { name: /Pagar/ })).not.toBeInTheDocument();
    expect(marco).toHaveTextContent("Lo paga la organización");
    expect(marco).toHaveTextContent(/Además dicta en Norte/);
  });

  it("si el docente dicta sólo en la sede de quien está atado, sí puede pagar", async () => {
    sesion.sucursalId = 1;
    sesion.sucursal = "Central";
    vi.mocked(apiAcademia.planilla).mockResolvedValue({
      mes: "2026-10",
      retencionActiva: false,
      docentes: [{ ...FILA, aPagar: 600, otrasSedes: [] }],
      totales: { bruto: 600, liquido: 600 },
    });
    vi.mocked(apiAcademia.planillaDocente).mockResolvedValue({ ...PLANILLA, aPagar: 600, porSede: [{ sede: CENTRAL, liquido: 600 }], otrasSedes: [] });
    await montarMes();
    const marco = screen.getByRole("listitem", { name: "Marco Rojas" });
    expect(within(marco).getByRole("button", { name: "Pagar Bs 600,00" })).toBeInTheDocument();
    expect(marco).not.toHaveTextContent(/Además dicta/);
    fireEvent.click(within(marco).getByRole("button", { name: "Pagar Bs 600,00" }));
    expect(screen.getByRole("dialog", { name: "Pagar a Marco Rojas" })).not.toHaveTextContent(/Se reparte en Gastos por sede/);
  });

  it("un backend anterior sin aPagar sigue mostrando el líquido de siempre", async () => {
    vi.mocked(apiAcademia.planilla).mockResolvedValue({
      mes: "2026-10",
      retencionActiva: false,
      docentes: [FILA],
      totales: { bruto: 600, liquido: 600 },
    });
    vi.mocked(apiAcademia.planillaDocente).mockResolvedValue({ ...PLANILLA, aPagar: undefined, porSede: undefined, otrasSedes: undefined });
    await montarMes();
    const marco = screen.getByRole("listitem", { name: "Marco Rojas" });
    expect(within(marco).getByRole("button", { name: "Pagar Bs 600,00" })).toBeInTheDocument();
  });
});

describe("La planilla de un docente con 2 sedes", () => {
  async function montarDetalle() {
    render(
      <MemoryRouter initialEntries={["/academia/planilla/9?mes=2026-10"]}>
        <Routes>
          <Route path="/academia/planilla/:id" element={<PlanillaDocente />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
  }

  it("dice cómo cae el pago en cada sede, con la sede en cada grupo", async () => {
    await montarDetalle();
    const porSede = screen.getByRole("region", { name: "El pago por sede" });
    expect(porSede).toHaveTextContent(/Central.*600,00/);
    expect(porSede).toHaveTextContent(/Norte.*300,00/);
    expect(porSede).toHaveTextContent(/Total del mes.*900,00/);
    expect(screen.getByRole("region", { name: "Barbería · L-M-V 09–11" })).toHaveTextContent("Central");
    expect(screen.getByRole("region", { name: "Barbería · M-J 19–21" })).toHaveTextContent("Norte");
    expect(screen.getByRole("button", { name: "Cerrar planilla" })).toBeInTheDocument();
  });

  it("atado a una sede con el docente en otra: el aviso y ni cerrar ni pagar", async () => {
    sesion.sucursalId = 1;
    sesion.sucursal = "Central";
    vi.mocked(apiAcademia.planillaDocente).mockResolvedValue({
      ...PLANILLA,
      otrasSedes: OTRAS,
      resumen: { ...PLANILLA.resumen, liquido: 600 },
      cuentan: [PLANILLA.cuentan[0]],
    });
    await montarDetalle();
    expect(screen.getByRole("note")).toHaveTextContent(/Además dicta en Norte.*Lo cierra y lo paga la organización/);
    expect(screen.queryByRole("button", { name: "Cerrar planilla" })).not.toBeInTheDocument();
    expect(screen.getByText(/El pago del mes completo es Bs 900,00/)).toBeInTheDocument();
  });

  it("con una sola sede no aparece nada de sedes", async () => {
    sesion.sedes = 1;
    vi.mocked(apiAcademia.planillaDocente).mockResolvedValue({
      ...PLANILLA,
      aPagar: 600,
      porSede: [{ sede: CENTRAL, liquido: 600 }],
      cuentan: [PLANILLA.cuentan[0]],
      resumen: { ...PLANILLA.resumen, liquido: 600 },
    });
    await montarDetalle();
    expect(screen.queryByRole("region", { name: "El pago por sede" })).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe("El historial de pagos con 2 sedes", () => {
  const HISTORIAL: HistorialPagosDocente = {
    docente: { personalId: 9, nombre: "Marco Rojas", telefono: null },
    pagos: [{ mes: "2026-10", estado: "PAGADA", liquido: 900, cerradaEn: "2026-11-02T14:00:00.000Z", pagadaEn: "2026-11-03T15:00:00.000Z", metodoPago: "QR", pagadoPor: "Hugo Salinas" }],
  };

  it("a quien está atado a una sede le dice que el monto es del pago completo del mes", async () => {
    sesion.sucursalId = 1;
    sesion.sucursal = "Central";
    vi.mocked(apiAcademia.pagosDocente).mockResolvedValue(HISTORIAL);
    render(
      <MemoryRouter>
        <HistorialPagos personalId={9} />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByText(/pagos completos de cada mes \(todas sus sedes\)/)).toBeInTheDocument();
  });

  it("la organización y un negocio de una sede no ven esa aclaración", async () => {
    vi.mocked(apiAcademia.pagosDocente).mockResolvedValue(HISTORIAL);
    render(
      <MemoryRouter>
        <HistorialPagos personalId={9} />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByText(/Pagado en total/)).toBeInTheDocument();
    expect(screen.queryByText(/pagos completos de cada mes/)).not.toBeInTheDocument();
  });
});
