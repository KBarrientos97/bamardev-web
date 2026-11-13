import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListaVales, ReportePropinas, Vale } from "../../lib/belleza/apiExtras";
import type { ResumenComisiones } from "../../lib/agenda/tiposComisiones";

/**
 * Sucursal en propinas, gift cards y producción (PLAN-SUCURSAL-TOTAL §1): con
 * 2+ locales la organización elige y el backend recibe el local; quien está
 * atado a uno no ve selector; con un local no cambia nada.
 */

const sesion = vi.hoisted(() => ({
  sucursalId: null as number | null,
  sucursal: null as string | null,
  locales: 2,
}));

vi.mock("../../store/AuthContext", () => {
  const valor = () => ({
    negocio: {
      id: 1,
      tipoNegocio: "SPA",
      features: ["propinas", "gift_cards", "comisiones"],
      sucursalesActivas: sesion.locales,
    },
    usuario: {
      id: 1,
      username: "dueno",
      rol: "ADMIN",
      sucursalId: sesion.sucursalId,
      sucursal: sesion.sucursal,
      permisos: ["propinas.ver", "propinas.pagar", "vales.vender", "vales.anular", "comisiones.ver"],
      permisosPropios: [],
    },
  });
  return { useAuth: valor, useAuthOpcional: valor };
});

vi.mock("../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...real,
    api: {
      ...real.api,
      getFormasPago: vi.fn(async () => []),
      getSucursales: vi.fn(async () =>
        [
          { id: 1, nombre: "Central", activo: true, tipo: "SUCURSAL", esPrincipal: true },
          { id: 2, nombre: "Norte", activo: true, tipo: "SUCURSAL", esPrincipal: false },
        ].slice(0, sesion.locales),
      ),
    },
  };
});

vi.mock("../../lib/belleza/apiExtras", () => ({
  apiExtras: {
    propinas: vi.fn(),
    pagarPropinas: vi.fn(),
    vales: vi.fn(),
    vale: vi.fn(),
    consultarVale: vi.fn(),
    disenoVale: vi.fn(),
  },
}));

vi.mock("../../lib/agenda/apiComisiones", () => ({
  apiComisiones: { resumen: vi.fn(), detalle: vi.fn() },
}));

import { apiComisiones } from "../../lib/agenda/apiComisiones";
import { apiExtras } from "../../lib/belleza/apiExtras";
import TabProduccion from "../agenda/comisiones/TabProduccion";
import GiftCards from "./GiftCards";
import Propinas from "./Propinas";

beforeEach(() => {
  vi.clearAllMocks();
  sesion.sucursalId = null;
  sesion.sucursal = null;
  sesion.locales = 2;
});

const montar = async (ui: React.ReactElement) => {
  render(<MemoryRouter>{ui}</MemoryRouter>);
  await act(async () => {});
};

// ── Propinas ─────────────────────────────────────────────────────────────────

const PROPINAS: ReportePropinas = {
  desde: "2026-11-01",
  hasta: "2026-11-30",
  total: 20,
  pendiente: 20,
  profesionales: [
    { recursoId: 7, nombre: "Ana", total: 20, efectivo: 20, otras: 0, cantidad: 2, pendiente: 20, pendienteEfectivo: 20, pendienteOtras: 0 },
  ],
  detalle: [
    { id: 1, fecha: "2026-11-02T10:00:00Z", ventaId: 10, comprobante: "V-10", sucursalId: 1, sucursal: "Central", recursoId: 7, recurso: "Ana", monto: 10, formaPago: "Efectivo", pagadaEn: null },
    { id: 2, fecha: "2026-11-03T10:00:00Z", ventaId: 11, comprobante: "V-11", sucursalId: 2, sucursal: "Norte", recursoId: 7, recurso: "Ana", monto: 10, formaPago: "Efectivo", pagadaEn: null },
  ],
};

describe("Propinas por local", () => {
  beforeEach(() => {
    vi.mocked(apiExtras.propinas).mockResolvedValue(PROPINAS);
  });

  it("la organización elige el local: el reporte y la entrega van con ese local, y el modal lo dice", async () => {
    vi.mocked(apiExtras.pagarPropinas).mockResolvedValue({ recursoId: 7, recurso: "Ana", cantidad: 1, total: 10, desdeCaja: true });
    await montar(<Propinas />);
    expect(apiExtras.propinas).toHaveBeenLastCalledWith({ desde: undefined, hasta: undefined, sucursalId: null });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Norte" }));
    });
    expect(apiExtras.propinas).toHaveBeenLastCalledWith({ desde: undefined, hasta: undefined, sucursalId: 2 });

    fireEvent.click(within(screen.getByText("Ana").closest("li")!).getByText("Entregar"));
    expect(screen.getByText("Las propinas cobradas en Norte")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getAllByText("Entregar").at(-1)!);
    });
    expect(apiExtras.pagarPropinas).toHaveBeenCalledWith(7, true, false, 2);
  });

  it("con «Todas» el modal avisa que entrega lo de todos los locales y no manda local", async () => {
    vi.mocked(apiExtras.pagarPropinas).mockResolvedValue({ recursoId: 7, recurso: "Ana", cantidad: 2, total: 20, desdeCaja: true });
    await montar(<Propinas />);
    fireEvent.click(within(screen.getByText("Ana").closest("li")!).getByText("Entregar"));
    expect(screen.getByText("Las propinas cobradas en todos los locales")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getAllByText("Entregar").at(-1)!);
    });
    expect(apiExtras.pagarPropinas).toHaveBeenCalledWith(7, true, false);
  });

  it("el detalle dice el local de cada propina cuando hay de 2", async () => {
    await montar(<Propinas />);
    const detalle = screen.getByText("Detalle").closest("details")!;
    expect(detalle).toHaveTextContent("V-10 · Efectivo · Central");
    expect(detalle).toHaveTextContent("V-11 · Efectivo · Norte");
  });

  it("quien está atado a un local no ve selector: sólo su sede en el subtítulo", async () => {
    sesion.sucursalId = 2;
    sesion.sucursal = "Norte";
    await montar(<Propinas />);
    expect(screen.queryByRole("button", { name: "Todas las sucursales" })).not.toBeInTheDocument();
    expect(screen.getByText(/No suma a las ventas del negocio\. · Norte/)).toBeInTheDocument();
    // Y el detalle no repite el local en cada fila.
    expect(screen.getByText("Detalle").closest("details")).not.toHaveTextContent("Central");
  });

  it("con un solo local no aparece nada nuevo", async () => {
    sesion.locales = 1;
    await montar(<Propinas />);
    expect(screen.queryByRole("button", { name: "Todas las sucursales" })).not.toBeInTheDocument();
    expect(screen.getByText("Detalle").closest("details")).not.toHaveTextContent("Central");
  });
});

// ── Gift cards ───────────────────────────────────────────────────────────────

const vale = (over: Partial<Vale>): Vale => ({
  id: 5,
  codigo: "K7QM-2XPA",
  montoInicial: 200,
  saldo: 80,
  venceEn: null,
  estado: "USABLE",
  beneficiario: "María",
  comprador: null,
  nota: null,
  formaPago: "Efectivo",
  creadoEn: "2026-11-01T10:00:00Z",
  anuladaEn: null,
  motivoAnulacion: null,
  ...over,
});

const LISTA: ListaVales = {
  vales: [
    vale({ id: 5, codigo: "AAAA-1111", emitidaEn: { id: 1, nombre: "Central" } }),
    vale({ id: 6, codigo: "BBBB-2222", emitidaEn: { id: 2, nombre: "Norte" } }),
  ],
  saldoVigente: 160,
  vigentes: 2,
};

describe("Gift cards por local", () => {
  beforeEach(() => {
    vi.mocked(apiExtras.vales).mockResolvedValue(LISTA);
  });

  it("la organización filtra por local y cada vale dice dónde se vendió", async () => {
    await montar(<GiftCards />);
    expect(apiExtras.vales).toHaveBeenLastCalledWith("USABLES", undefined);
    const lista = screen.getByRole("list", { name: "Vales" });
    expect(lista).toHaveTextContent("vendido en Central");
    expect(lista).toHaveTextContent("vendido en Norte");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Norte" }));
    });
    expect(apiExtras.vales).toHaveBeenLastCalledWith("USABLES", undefined, 2);
    expect(screen.getByText(/vendidos en Norte/)).toBeInTheDocument();
  });

  it("con un solo local no aparece nada nuevo", async () => {
    sesion.locales = 1;
    await montar(<GiftCards />);
    expect(screen.queryByRole("button", { name: "Todas las sucursales" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Vales" })).not.toHaveTextContent("vendido en");
  });
});

// ── Producción de comisiones ─────────────────────────────────────────────────

const RESUMEN: ResumenComisiones = {
  desde: "2026-11-02",
  hasta: "2026-11-08",
  sucursalId: null,
  profesionales: [
    {
      recursoId: 7,
      nombre: "Beto",
      color: "#7357B8",
      activo: true,
      produccion: 90,
      produccionServicios: 50,
      produccionProductos: 40,
      servicios: 1,
      comision: 19,
      porLiquidar: 19,
      adelantosPendientes: 0,
    },
  ],
  totales: { produccion: 90, comision: 19, porLiquidar: 19 },
};

describe("Producción por local", () => {
  const periodo = { tipo: "SEMANA" as const, desde: "2026-11-02", hasta: "2026-11-08" };

  it("la organización elige el local y el resumen se pide con ese local", async () => {
    vi.mocked(apiComisiones.resumen).mockResolvedValue(RESUMEN);
    await montar(<TabProduccion periodo={periodo} />);
    expect(apiComisiones.resumen).toHaveBeenLastCalledWith({ desde: "2026-11-02", hasta: "2026-11-08" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Norte" }));
    });
    expect(apiComisiones.resumen).toHaveBeenLastCalledWith({ desde: "2026-11-02", hasta: "2026-11-08", sucursalId: 2 });
  });

  it("si el local no tiene profesionales se puede volver a «Todas»", async () => {
    vi.mocked(apiComisiones.resumen).mockImplementation(async (p) =>
      p.sucursalId === 2 ? { ...RESUMEN, profesionales: [] } : RESUMEN,
    );
    await montar(<TabProduccion periodo={periodo} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Norte" }));
    });
    expect(screen.getByText("Nadie atiende en esa sucursal.")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Todas las sucursales" }));
    });
    expect(screen.getByText("Beto")).toBeInTheDocument();
  });

  it("quien está atado a un local ve su sede y ningún selector", async () => {
    sesion.sucursalId = 1;
    sesion.sucursal = "Central";
    vi.mocked(apiComisiones.resumen).mockResolvedValue(RESUMEN);
    await montar(<TabProduccion periodo={periodo} />);
    expect(screen.getByText("Lo cobrado en Central.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Todas las sucursales" })).not.toBeInTheDocument();
  });
});
