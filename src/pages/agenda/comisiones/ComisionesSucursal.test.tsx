import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  FilaComisionSucursal,
  LiquidacionDetalle,
  PreviaLiquidacion,
} from "../../../lib/agenda/tiposComisiones";

/**
 * Liquidar comisiones con el desglose por sucursal (PLAN-SUCURSAL-TOTAL §8.1):
 * la previa, la confirmación y el detalle de una liquidación cerrada. Con un solo
 * local, o con una liquidación vieja (`porSucursal: []`), no se ve nada nuevo.
 */

const sesion = vi.hoisted(() => ({ hayVarias: true, asignado: false }));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, rol: "ADMIN", permisos: ["comisiones.ver", "comisiones.liquidar"] },
    negocio: { id: 3, nombre: "Salón", tipoNegocio: "PELUQUERIA", features: ["agenda", "comisiones", "gastos"] },
    rubro: "PELUQUERIA",
    vocabulario: undefined,
  }),
}));

vi.mock("../../../lib/useSucursales", () => ({
  useSucursales: () => ({
    hayVarias: sesion.hayVarias,
    modo: !sesion.hayVarias ? "una" : sesion.asignado ? "asignado" : "organizacion",
  }),
}));

vi.mock("../../../lib/agenda/apiComisiones", () => ({
  apiComisiones: {
    config: vi.fn(),
    previa: vi.fn(),
    liquidar: vi.fn(),
    liquidaciones: vi.fn(),
    liquidacion: vi.fn(),
  },
}));

import { apiComisiones } from "../../../lib/agenda/apiComisiones";
import TabLiquidaciones from "./TabLiquidaciones";
import TabLiquidar from "./TabLiquidar";

const DOS: FilaComisionSucursal[] = [
  { almacenId: 3, sucursal: "Centro", produccion: 100, comision: 30, ajustes: 0, neto: 24 },
  { almacenId: 4, sucursal: "Norte", produccion: 50, comision: 15, ajustes: -3, neto: 12 },
];

const PREVIA: PreviaLiquidacion = {
  recurso: { id: 7, nombre: "Beto" },
  desde: "2020-10-12",
  hasta: "2020-10-18",
  produccion: 150,
  comision: 45,
  ajustes: -3,
  adelantos: 9,
  saldoAnterior: 0,
  neto: 36,
  lineas: [],
  lineasAjuste: [],
  adelantosPendientes: [{ id: 4, fecha: "2020-10-13", monto: 9, nota: null }],
  atrasadas: 0,
  porSucursal: DOS,
  gastoPorSucursal: true,
};

const PERIODO = { tipo: "SEMANA" as const, desde: "2020-10-12", hasta: "2020-10-18" };

async function montarLiquidar(previa: PreviaLiquidacion) {
  vi.mocked(apiComisiones.previa).mockResolvedValue(previa);
  render(<TabLiquidar periodo={PERIODO} recursoId={7} onRecurso={() => {}} />);
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.hayVarias = true;
  sesion.asignado = false;
  vi.mocked(apiComisiones.config).mockResolvedValue([
    { recursoId: 7, nombre: "Beto", activo: true, comisionPct: 50, comisionProductoPct: 10, servicios: [] },
  ]);
});

describe("liquidar: la previa por sucursal", () => {
  it("con 2+ locales y 2+ filas, la tabla corta con comisión, ajustes y neto de cada una", async () => {
    await montarLiquidar(PREVIA);
    const tabla = screen.getByRole("table");
    expect(within(tabla).getByRole("columnheader", { name: "Sucursal" })).toBeInTheDocument();
    const centro = within(tabla).getByRole("row", { name: /Centro/ });
    expect(centro).toHaveTextContent("30,00");
    expect(centro).toHaveTextContent("24,00");
    const norte = within(tabla).getByRole("row", { name: /Norte/ });
    expect(norte).toHaveTextContent("-3,00");
    expect(norte).toHaveTextContent("12,00");
  });

  it("la confirmación nombra el gasto de sueldos por sucursal, sólo si se registra el gasto", async () => {
    await montarLiquidar(PREVIA);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar liquidación" }));
    // Sin tildar el gasto, no hay gasto que nombrar.
    expect(screen.getByRole("dialog")).not.toHaveTextContent("gasto de sueldos");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));

    fireEvent.click(screen.getByRole("checkbox", { name: /Registrar el pago como gasto/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar liquidación" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Se registra un gasto de sueldos por sucursal: Centro Bs 24,00 · Norte Bs 12,00.",
    );
  });

  it("si la cuenta no se reparte (gastoPorSucursal false) no promete gastos por sucursal", async () => {
    await montarLiquidar({
      ...PREVIA,
      gastoPorSucursal: false,
      porSucursal: DOS.map((f) => ({ ...f, neto: null })),
    });
    expect(screen.getByText(/se carga uno solo, general/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Registrar el pago como gasto/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar liquidación" }));
    expect(screen.getByRole("dialog")).not.toHaveTextContent("gasto de sueldos por");
  });

  it("con un solo local no se ve nada nuevo, aunque el backend mande filas", async () => {
    sesion.hayVarias = false;
    await montarLiquidar(PREVIA);
    expect(screen.queryByRole("columnheader", { name: "Sucursal" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Registrar el pago como gasto/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar liquidación" }));
    expect(screen.getByRole("dialog")).not.toHaveTextContent("gasto de sueldos por");
  });

  it("el asignado a una sede no ve la tabla ni la frase: la previa trae los montos de los otros locales", async () => {
    sesion.asignado = true;
    await montarLiquidar(PREVIA);
    expect(screen.queryByRole("columnheader", { name: "Sucursal" })).not.toBeInTheDocument();
    expect(screen.queryByText("Norte")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Registrar el pago como gasto/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar liquidación" }));
    expect(screen.getByRole("dialog")).not.toHaveTextContent("gasto de sueldos por");
  });

  it("con una sola fila (el profesional trabaja en un local) tampoco se desglosa", async () => {
    await montarLiquidar({ ...PREVIA, porSucursal: [DOS[0]] });
    expect(screen.queryByRole("columnheader", { name: "Sucursal" })).not.toBeInTheDocument();
  });

  it("sin el campo (backend viejo) la previa es la de siempre", async () => {
    const { porSucursal: _a, gastoPorSucursal: _b, ...vieja } = PREVIA;
    await montarLiquidar(vieja);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("liquidaciones cerradas: el detalle por sucursal", () => {
  const CERRADA: LiquidacionDetalle = {
    id: 9,
    recursoId: 7,
    recurso: "Beto",
    periodo: "SEMANA",
    desde: "2020-10-12",
    hasta: "2020-10-18",
    produccion: 150,
    comision: 45,
    ajustes: -3,
    adelantos: 9,
    saldoAnterior: 0,
    neto: 36,
    nota: null,
    gastoId: 77,
    gastoIds: [77, 78],
    cerradaEn: "2020-10-19T15:00:00.000Z",
    cerradaPor: "admin",
    lineas: [],
    adelantosDescontados: [],
    porSucursal: DOS,
    gastos: [
      { id: 77, almacenId: 3, sucursal: "Centro", monto: 24 },
      { id: 78, almacenId: 4, sucursal: "Norte", monto: 12 },
    ],
  };

  async function abrir(detalle: LiquidacionDetalle) {
    vi.mocked(apiComisiones.liquidaciones).mockResolvedValue([detalle]);
    vi.mocked(apiComisiones.liquidacion).mockResolvedValue(detalle);
    render(<TabLiquidaciones />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Beto/ }));
    await act(async () => {});
    return screen.getByRole("dialog");
  }

  it("muestra cómo cayó en cada sucursal y que cada neto es su gasto", async () => {
    const dialogo = await abrir(CERRADA);
    expect(within(dialogo).getByText("Cómo cayó en cada sucursal")).toBeInTheDocument();
    expect(within(dialogo).getByRole("row", { name: /Norte/ })).toHaveTextContent("12,00");
    expect(within(dialogo).getByText(/gasto de sueldos que se le cargó/)).toBeInTheDocument();
  });

  it("una liquidación vieja (porSucursal vacío) no muestra nada nuevo", async () => {
    const dialogo = await abrir({ ...CERRADA, porSucursal: [], gastos: [] });
    expect(within(dialogo).queryByText("Cómo cayó en cada sucursal")).not.toBeInTheDocument();
  });

  it("con un solo local no muestra el desglose", async () => {
    sesion.hayVarias = false;
    const dialogo = await abrir(CERRADA);
    expect(within(dialogo).queryByText("Cómo cayó en cada sucursal")).not.toBeInTheDocument();
  });

  it("el asignado a una sede tampoco: el detalle trae los montos de los otros locales", async () => {
    sesion.asignado = true;
    const dialogo = await abrir(CERRADA);
    expect(within(dialogo).queryByText("Cómo cayó en cada sucursal")).not.toBeInTheDocument();
    expect(within(dialogo).queryByText("Norte")).not.toBeInTheDocument();
  });
});
