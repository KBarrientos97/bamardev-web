import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BillarReporteApi } from "../../api";
import { ContextoReporte, type DatosReporte } from "../../contexto";

/**
 * Las pantallas del billar contra un backend con el rediseño y contra
 * uno anterior: con el anterior no se rompen ni muestran ceros inventados,
 * esconden lo que necesita los campos nuevos.
 */

const sucursales = vi.hoisted(() => ({ elegir: false }));

vi.mock("../../api", async (original) => ({
  ...(await original<typeof import("../../api")>()),
  apiReportes: { billar: vi.fn() },
}));

vi.mock("../../../../lib/useSucursales", () => ({
  useSucursales: () => ({
    elegir: sucursales.elegir,
    sucursales: [
      { id: 1, nombre: "Centro", esPrincipal: true },
      { id: 2, nombre: "Norte", esPrincipal: false },
    ],
  }),
}));

import { apiReportes } from "../../api";
import Ocupacion from "./Ocupacion";
import PausasAjustes from "./PausasAjustes";
import RendimientoMesas from "./RendimientoMesas";
import TiempoFijo from "./TiempoFijo";

const registrarExportacion = vi.fn();

const contexto: DatosReporte = {
  periodo: { preset: "semana", desde: "2026-10-02", hasta: "2026-10-08" },
  comparacion: { desde: "2026-09-25", hasta: "2026-10-01", contra: "la semana anterior", leyenda: "Semana anterior" },
  rango: { desde: "2026-10-02", hasta: "2026-10-08" },
  rangoAnterior: { desde: "2026-09-25", hasta: "2026-10-01" },
  sucursalNombre: "",
  registrarExportacion,
  veReporte: () => true,
};

function Envoltorio({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <ContextoReporte.Provider value={contexto}>{children}</ContextoReporte.Provider>
    </MemoryRouter>
  );
}

async function montar(vista: ReactNode) {
  render(<Envoltorio>{vista}</Envoltorio>);
  await act(async () => {});
}

/** Lo que mandaba el backend antes del rediseño. */
const viejo: BillarReporteApi = {
  desde: 0,
  hasta: 0,
  jornadas: 7,
  tiempoBs: 4601,
  consumosBs: 5892,
  horas: 230,
  ocupacion: 0.41,
  porMesa: [
    { mesaId: 7, horas: 36.6, pct: 0.16 },
    { mesaId: 5, horas: 34.5, pct: 0.15 },
  ],
  porHora: [
    { hora: 16, ocupacion: 0.13 },
    { hora: 22, ocupacion: 0.69 },
    { hora: 0, ocupacion: 0.3 },
  ],
  fijos: { vendidos: 56, monto: 1391, conExcedente: 23, excedenteBs: 251 },
  rapidas: { cantidad: 3, bs: 60 },
  productos: [],
  auditoria: [],
};

/** El mismo período con todo lo del rediseño. */
const nuevo: BillarReporteApi = {
  ...viejo,
  porMesa: [
    { mesaId: 7, horas: 36.6, pct: 0.16, tipo: "Carambola", sesiones: 24, tiempoBs: 850, consumosBs: 884, total: 1734, ocupacion: 0.52, bsPorHoraAbierta: 25 },
    { mesaId: 5, horas: 34.5, pct: 0.15, tipo: "Pool", sesiones: 22, tiempoBs: 641, consumosBs: 980, total: 1621, ocupacion: 0.49, bsPorHoraAbierta: 23 },
  ],
  mesasParadas: [{ mesaId: 9, horas: 0, pct: 0, tipo: "Pool", sesiones: 0, tiempoBs: 0, consumosBs: 0, total: 0, ocupacion: 0, bsPorHoraAbierta: 0 }],
  sesiones: 147,
  minutosPromedio: 94,
  porTipo: [
    { tipo: "Pool", mesas: 6, horas: 161, tiempoBs: 3000, consumosBs: 4147, total: 7147, bsPorHoraAbierta: 17 },
    { tipo: "Carambola", mesas: 2, horas: 69.1, tiempoBs: 1606, consumosBs: 1740, total: 3346, bsPorHoraAbierta: 24 },
  ],
  calor: [
    { dia: 4, hora: 23, ocupacion: 0.88 },
    { dia: 5, hora: 22, ocupacion: 0.97 },
    { dia: 0, hora: 22, ocupacion: 0.56 },
  ],
  paquetes: [
    { minutos: 60, cantidad: 17, monto: 340 },
    { minutos: 120, cantidad: 25, monto: 900 },
  ],
  promos: [{ nombre: "Promo 3 h o más", pct: 10, tipo: "Pool", usos: 12, descuentoBs: 80.73, minutosPromedio: 202 }],
  minutosPromedioSinPromo: 94,
  libres: 91,
  anterior: {
    ocupacion: 0.37,
    horas: 200,
    tiempoBs: 4000,
    consumosBs: 5000,
    rapidasBs: 50,
    sesiones: 130,
    porHora: [{ hora: 22, ocupacion: 0.6 }],
    porMesa: [{ mesaId: 7, total: 1355, horas: 30 }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  sucursales.elegir = false;
});

describe("rendimiento por mesa", () => {
  it("con el rediseño: los tipos, la ocupación contra el anterior y cada mesa, con la parada al final", async () => {
    vi.mocked(apiReportes.billar).mockResolvedValue(nuevo);
    await montar(<RendimientoMesas />);
    expect(apiReportes.billar).toHaveBeenCalledWith(contexto.rango, contexto.rangoAnterior);
    expect(screen.getByText("Pool · 6 mesas")).toBeInTheDocument();
    expect(screen.getByText("Ocupación general")).toBeInTheDocument();
    expect(screen.getByText("+4 pts")).toBeInTheDocument();
    expect(screen.getAllByText("Sin juego").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+28 %").length).toBeGreaterThan(0);
    expect(registrarExportacion).toHaveBeenLastCalledWith(expect.objectContaining({ nombre: "rendimiento-por-mesa" }));
  });

  it("con un backend anterior no hay tabla ni tipos en cero: lo cobrado en total y las horas por mesa", async () => {
    vi.mocked(apiReportes.billar).mockResolvedValue(viejo);
    await montar(<RendimientoMesas />);
    expect(screen.queryByText(/· 6 mesas/)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Tiempo de mesa")).toBeInTheDocument();
    expect(screen.getByText("Horas por mesa")).toBeInTheDocument();
  });

  it("con 'Todas las sucursales' avisa que el billar muestra la principal", async () => {
    sucursales.elegir = true;
    vi.mocked(apiReportes.billar).mockResolvedValue(nuevo);
    await montar(<RendimientoMesas />);
    expect(screen.getByText(/ves las mesas de la principal \(Centro\)/)).toBeInTheDocument();
  });

  it("sin mesas cobradas lo dice, no dibuja ceros", async () => {
    vi.mocked(apiReportes.billar).mockResolvedValue({ ...viejo, jornadas: 0, porMesa: [], porHora: [] });
    await montar(<RendimientoMesas />);
    expect(screen.getByText("No se cobró ninguna mesa en este período")).toBeInTheDocument();
  });
});

describe("ocupación", () => {
  it("con el rediseño: la hora pico, el mejor día, el mapa y la curva contra el anterior", async () => {
    vi.mocked(apiReportes.billar).mockResolvedValue(nuevo);
    await montar(<Ocupacion />);
    expect(screen.getAllByText("10 p. m.").length).toBeGreaterThan(0);
    expect(screen.getByText("Mejor día")).toBeInTheDocument();
    expect(screen.getByText("Ocupación por día y hora")).toBeInTheDocument();
    expect(screen.getByText("Semana anterior")).toBeInTheDocument();
    expect(screen.getByText(/buena para promo/)).toBeInTheDocument();
  });

  it("con un backend anterior no hay mapa ni mejor día, y la curva va sola", async () => {
    vi.mocked(apiReportes.billar).mockResolvedValue(viejo);
    await montar(<Ocupacion />);
    expect(screen.queryByText("Mejor día")).toBeNull();
    expect(screen.queryByText("Ocupación por día y hora")).toBeNull();
    expect(screen.queryByText("Semana anterior")).toBeNull();
    expect(screen.getByText("Ocupación por hora")).toBeInTheDocument();
  });
});

describe("tiempo fijo y promos", () => {
  it("con el rediseño: los paquetes, el reparto libre/fijo y las promos", async () => {
    vi.mocked(apiReportes.billar).mockResolvedValue(nuevo);
    await montar(<TiempoFijo />);
    expect(screen.getByText("38 % de las sesiones")).toBeInTheDocument();
    expect(screen.getByText("41 %")).toBeInTheDocument();
    expect(screen.getByText("2 horas")).toBeInTheDocument();
    expect(screen.getByText("Promo 3 h o más")).toBeInTheDocument();
    expect(screen.getByText("−10 %")).toBeInTheDocument();
    expect(screen.getByText("−Bs 80,73")).toBeInTheDocument();
    expect(screen.getByText("3:22 h")).toBeInTheDocument();
  });

  it("con un backend anterior quedan los números del tiempo fijo y nada más", async () => {
    vi.mocked(apiReportes.billar).mockResolvedValue(viejo);
    await montar(<TiempoFijo />);
    expect(screen.getByText("Sesiones con tiempo fijo")).toBeInTheDocument();
    expect(screen.queryByText(/de las sesiones/)).toBeNull();
    expect(screen.queryByText("Paquetes más vendidos")).toBeNull();
    expect(screen.queryByText("Promociones")).toBeNull();
  });

  it("sin un tiempo fijo vendido, 'siguieron jugando' es una raya y no 0 %", async () => {
    vi.mocked(apiReportes.billar).mockResolvedValue({ ...viejo, fijos: { vendidos: 0, monto: 0, conExcedente: 0, excedenteBs: 0 } });
    await montar(<TiempoFijo />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("pausas y ajustes", () => {
  const auditoria: BillarReporteApi["auditoria"] = [
    { id: 3, hora: Date.UTC(2026, 9, 6, 3, 12), mesaId: 4, accion: "Anuló la mesa · devolver Bs 20", codigo: "ANULAR_MESA", quien: "Ana", motivo: "Se equivocó de mesa", autorizo: "Kevin" },
    { id: 2, hora: Date.UTC(2026, 9, 5, 2, 0), mesaId: 2, accion: "Corrigió la hora de inicio", codigo: "EDITAR_INICIO", quien: "Beto" },
    { id: 1, hora: Date.UTC(2026, 9, 4, 1, 0), mesaId: 2, accion: "Pausó 12 min", codigo: "REANUDAR", quien: "Ana" },
  ];

  it("cuenta las anulaciones y las horas corregidas, y dice quién y por qué", async () => {
    vi.mocked(apiReportes.billar).mockResolvedValue({ ...nuevo, auditoria });
    await montar(<PausasAjustes />);
    expect(screen.getByText("Mesas anuladas")).toBeInTheDocument();
    expect(screen.getByText("Hora corregida")).toBeInTheDocument();
    expect(screen.getAllByText("Anuló la mesa · devolver Bs 20").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Se equivocó de mesa/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Kevin/).length).toBeGreaterThan(0);
    expect(registrarExportacion).toHaveBeenCalled();
  });

  it("con un backend sin código no muestra conteos por tipo, sólo el total", async () => {
    vi.mocked(apiReportes.billar).mockResolvedValue({ ...viejo, auditoria: auditoria.map(({ codigo: _c, ...a }) => a) });
    await montar(<PausasAjustes />);
    expect(screen.queryByText("Mesas anuladas")).toBeNull();
    expect(screen.getByText("Ajustes")).toBeInTheDocument();
  });

  it("sin ajustes lo dice, no dibuja una tabla vacía", async () => {
    vi.mocked(apiReportes.billar).mockResolvedValue(viejo);
    await montar(<PausasAjustes />);
    expect(screen.getByText("Sin pausas ni anulaciones en este período")).toBeInTheDocument();
  });
});
