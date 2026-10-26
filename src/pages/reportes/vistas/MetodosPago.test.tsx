import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CobroApi } from "../../billar/api";
import type { CobrosDelMedioApi, MetodoPagoApi } from "../api";
import { ContextoReporte, type DatosReporte } from "../contexto";
import MetodosPago from "./MetodosPago";

vi.setConfig({ testTimeout: 60_000 });

/**
 * Métodos de pago (26-oct): en un billar cada medio se toca y dice qué se
 * cobró con él, venta por venta y día por día. Miguel, el administrador, veía
 * "QR · 3 cobros · Bs 120" y no sabía cuáles eran ni de qué producto: los
 * compara contra el extracto de su banco. Los demás rubros ven lo de siempre.
 */

const sesion = vi.hoisted(() => ({ rubro: "BILLAR" as string, permisos: ["billar.admin", "reportes.operacion"] as string[] }));
const request = vi.hoisted(() => vi.fn());

// `api.reporte` arma la URL como el real y la pide al `request` de mentira:
// así se ve lo que de verdad viaja al backend.
vi.mock("../../../lib/api", async (original) => {
  const real = await original<typeof import("../../../lib/api")>();
  const { rangoParaApi } = await import("../../../lib/rangoApi");
  return {
    ...real,
    request,
    api: {
      ...real.api,
      reporte: (nombre: string, rango = {}, extra = {}) => request(`/reportes/${nombre}${real.qs({ ...rangoParaApi(rango), ...extra })}`),
    },
  };
});

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: sesion.rubro,
    usuario: { id: 1, permisos: sesion.permisos },
    negocio: { alias: "billar-metodos", nombre: "Billar", features: ["reportes_operacion"] },
  }),
}));

const RANGO = { desde: "2026-10-01", hasta: "2026-10-26", corteMin: 360 };

const METODOS: MetodoPagoApi[] = [
  { nombre: "Efectivo", monto: 556, porcentaje: 82.25, cantidad: 12 },
  { nombre: "QR", monto: 120, porcentaje: 17.75, cantidad: 3 },
];

const cobro = (id: string, hora: Date, monto: number, venta: Partial<NonNullable<CobroApi["venta"]>> = {}): CobroApi => ({
  id,
  hora: hora.getTime(),
  medio: "QR",
  monto,
  por: "Flavia Suarez",
  venta: { id: Number(id.slice(2)), codigo: `V-0000${id.slice(2)}`, total: monto, origen: "mesa", mesaId: 2, tiempoMin: 60, items: [], medios: ["QR"], ...venta },
});

// La noche del sábado 24: un QR a las 22:10 y otro a la 1:50 del domingo (con
// corte a las 6:00 es la misma noche). Y uno del viernes.
const PAGINA_1: CobrosDelMedioApi = {
  medio: "QR",
  totales: { monto: 120, cobros: 3, ventas: 3, mixtas: 1 },
  productos: {
    solo: {
      categorias: [
        {
          nombre: "Cervezas",
          unidades: 2,
          total: 30,
          items: [{ nombre: "Paceña 620 ml", cantidad: 2, precio: 15, total: 30 }],
        },
      ],
      unidades: 2,
      total: 30,
      lineas: 1,
    },
    mixtas: {
      categorias: [{ nombre: "Gaseosas", unidades: 1, total: 12, items: [{ nombre: "Coca-Cola", cantidad: 1, precio: 12, total: 12 }] }],
      unidades: 1,
      total: 12,
      lineas: 1,
    },
    mixtasMonto: 40,
  },
  cobros: [
    cobro("vp31", new Date(2026, 9, 25, 1, 50), 30),
    cobro("vp30", new Date(2026, 9, 24, 22, 10), 40, { total: 80, medios: ["Efectivo", "QR"], items: [{ nombre: "Coca-Cola", cant: 1 }] }),
  ],
  tanda: { limite: 100, total: 3, quedan: 1, siguiente: `${new Date(2026, 9, 24, 22, 10).getTime()}_30` },
};

// "Ver más": la tanda que sigue a la marca del último cobro que se vio. Los
// productos ya llegaron con la primera.
const PAGINA_2: CobrosDelMedioApi = {
  ...PAGINA_1,
  productos: null,
  cobros: [cobro("vp20", new Date(2026, 9, 23, 21, 0), 50, { items: [{ nombre: "Paceña 620 ml", cant: 2 }] })],
  tanda: { limite: 100, total: 3, quedan: 0, siguiente: null },
};

const VENTA_30 = {
  id: 30,
  codigo: "V-000030",
  hora: new Date(2026, 9, 24, 22, 10).getTime(),
  cajero: "Flavia Suarez",
  origen: "mesa",
  mesaId: 2,
  tipoMesa: "pool",
  tipoNombre: "Pool",
  tiempoMin: 60,
  tiempoBs: 68,
  items: [{ productoId: 2, nombre: "Coca-Cola", precio: 12, cant: 1 }],
  consumosBs: 12,
  total: 80,
  pagos: [
    { id: "30", hora: new Date(2026, 9, 24, 22, 10).getTime(), metodo: "QR", monto: 40 },
    { id: "29", hora: new Date(2026, 9, 24, 22, 10).getTime(), metodo: "Efectivo", monto: 40 },
  ],
};

function mostrar() {
  const datos: DatosReporte = {
    periodo: { preset: "mes", desde: RANGO.desde, hasta: RANGO.hasta },
    comparacion: { desde: "2026-09-01", hasta: "2026-09-26", contra: "1–26 de septiembre", leyenda: "1–26 de septiembre" },
    rango: RANGO,
    rangoAnterior: { desde: "2026-09-01", hasta: "2026-09-26", corteMin: 360 },
    sucursalNombre: "",
    corteMin: 360,
    registrarExportacion: () => {},
    veReporte: () => false,
  };
  return render(
    <MemoryRouter>
      <ContextoReporte.Provider value={datos}>
        <MetodosPago />
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

/** Lo que se le pidió al backend. */
const pedidos = () => request.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  sesion.rubro = "BILLAR";
  sesion.permisos = ["billar.admin", "reportes.operacion"];
  request.mockReset().mockImplementation(async (url: string) => {
    if (url.startsWith("/reportes/metodos-pago/cobros")) return url.includes("antesDe=") ? PAGINA_2 : PAGINA_1;
    if (url.startsWith("/reportes/metodos-pago")) return METODOS;
    if (url.startsWith("/billar/supervision/detalle")) return { abierta: false, sesionId: 900, venta: VENTA_30, historial: [] };
    // Lo fiado (Créditos) es un dato de más: si no llega, la dona se arma sin él.
    throw new Error(`No esperado: ${url}`);
  });
});

async function abrirQr() {
  mostrar();
  const qr = await screen.findByRole("button", { name: /^Ver lo cobrado por QR: Bs\s120,00$/ });
  await act(async () => {
    fireEvent.click(qr);
  });
  const d = await screen.findByRole("dialog", { name: "Cobrado por QR" });
  await within(d).findByText("Sáb 24/10");
  return d;
}

describe("Métodos de pago en un billar", () => {
  it("cada medio se toca, y la nota lo dice", async () => {
    mostrar();
    expect(await screen.findByRole("button", { name: /^Ver lo cobrado en efectivo: Bs\s556,00$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Ver lo cobrado por QR/ })).toBeInTheDocument();
    expect(screen.getByText(/Tocá un medio para ver qué se cobró con él, venta por venta\./)).toBeInTheDocument();
  });

  it("el QR abre lo cobrado en el período, por día de la jornada, pidiendo sólo ese medio", async () => {
    const d = await abrirQr();
    const url = pedidos().find((u) => u.startsWith("/reportes/metodos-pago/cobros"))!;
    expect(url).toMatch(/[?&]medio=QR(&|$)/);
    // La primera tanda va sin marca.
    expect(url).not.toMatch(/antesDe=/);
    expect(within(d).getByText("Del 1 al 26 de octubre")).toBeInTheDocument();
    // Arriba los números de la fila.
    expect(within(d).getByText(/^Bs\s120,00$/)).toBeInTheDocument();
    expect(within(d).getByText(/3 cobros · en 3 ventas · 1 pagada parte y parte/)).toBeInTheDocument();
    // El QR de la 1:50 del domingo es de la noche del sábado.
    const sabado = within(d).getByRole("group", { name: "Sáb 24/10" });
    expect(within(sabado).getAllByRole("button")).toHaveLength(2);
    expect(sabado.textContent).toMatch(/Bs\s70,00 · 2 cobros/);
    expect(sabado.textContent).toMatch(/01:50/);
    // El que es parte de una venta pagada con dos medios lo dice.
    expect(sabado.textContent).toMatch(/parte de Bs\s80,00/);
  });

  it("«Ver más» trae la tanda siguiente con la marca del último cobro y la suma a la lista", async () => {
    const d = await abrirQr();
    expect(within(d).getByText(/Puede haber más cobros de este día/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Ver más · quedan 1" }));
    });
    const marca = `${new Date(2026, 9, 24, 22, 10).getTime()}_30`;
    expect(pedidos().some((u) => u.startsWith("/reportes/metodos-pago/cobros") && u.includes(`antesDe=${marca}`))).toBe(true);
    const viernes = await within(d).findByRole("group", { name: "Vie 23/10" });
    expect(viernes.textContent).toMatch(/Bs\s50,00 · 1 cobro/);
    expect(within(d).getByRole("group", { name: "Sáb 24/10" })).toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: /^Ver más/ })).toBeNull();
    expect(within(d).queryByText(/Puede haber más cobros de este día/)).toBeNull();
  });

  it("«Ver más» nunca muestra dos veces el mismo cobro ni lo suma dos veces en el día", async () => {
    // Si el servidor devolviera otra vez el último cobro que se vio (antes
    // pasaba al entrar un cobro nuevo entre una página y la otra), el total
    // del día que se coteja con el banco no puede sumarlo dos veces.
    request.mockImplementation(async (url: string) => {
      if (url.startsWith("/reportes/metodos-pago/cobros")) {
        return url.includes("antesDe=") ? { ...PAGINA_2, cobros: [PAGINA_1.cobros[1], ...PAGINA_2.cobros] } : PAGINA_1;
      }
      if (url.startsWith("/reportes/metodos-pago")) return METODOS;
      throw new Error(`No esperado: ${url}`);
    });
    const d = await abrirQr();
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Ver más · quedan 1" }));
    });
    await within(d).findByRole("group", { name: "Vie 23/10" });
    const sabado = within(d).getByRole("group", { name: "Sáb 24/10" });
    expect(within(sabado).getAllByRole("button")).toHaveLength(2);
    expect(sabado.textContent).toMatch(/Bs\s70,00 · 2 cobros/);
  });

  it("arriba van los números del período que se lista, no los de la fila cargada antes", async () => {
    // La fila se cargó a las 22:00 (3 cobros, Bs 120); al abrir el QR a las
    // 23:30 ya eran 5 por Bs 200. Arriba decía "3 cobros · en 5 ventas".
    request.mockImplementation(async (url: string) => {
      if (url.startsWith("/reportes/metodos-pago/cobros")) {
        return { ...PAGINA_1, totales: { monto: 200, cobros: 5, ventas: 5, mixtas: 1 }, tanda: { ...PAGINA_1.tanda, total: 5 } };
      }
      if (url.startsWith("/reportes/metodos-pago")) return METODOS;
      throw new Error(`No esperado: ${url}`);
    });
    const d = await abrirQr();
    expect(within(d).getByText(/^Bs\s200,00$/)).toBeInTheDocument();
    expect(within(d).getByText(/5 cobros · en 5 ventas · 1 pagada parte y parte/)).toBeInTheDocument();
  });

  it("si se toca otro medio con el diálogo abierto, arranca de cero: no arrastra las tandas del anterior", async () => {
    const d = await abrirQr();
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Ver más · quedan 1" }));
    });
    await within(d).findByRole("group", { name: "Vie 23/10" });
    // El foco puede quedar en la fila de atrás: Efectivo se toca sin cerrar el QR.
    request.mockImplementation(async (url: string) => {
      if (url.startsWith("/reportes/metodos-pago/cobros")) {
        return {
          ...PAGINA_1,
          medio: "Efectivo",
          cobros: [{ ...cobro("vp40", new Date(2026, 9, 24, 23, 0), 25), medio: "Efectivo" }],
          tanda: { limite: 100, total: 1, quedan: 0, siguiente: null },
        };
      }
      if (url.startsWith("/reportes/metodos-pago")) return METODOS;
      throw new Error(`No esperado: ${url}`);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Ver lo cobrado en efectivo/ }));
    });
    const ef = await screen.findByRole("dialog", { name: "Cobrado en efectivo" });
    await within(ef).findByText("Sáb 24/10");
    // Sólo el cobro en efectivo: nada del viernes ni de los QR del sábado.
    expect(within(ef).queryByRole("group", { name: "Vie 23/10" })).toBeNull();
    expect(within(within(ef).getByRole("group", { name: "Sáb 24/10" })).getAllByRole("button")).toHaveLength(1);
  });

  it("tocar un cobro muestra su venta dentro del mismo diálogo, y «Volver a los cobros» vuelve", async () => {
    const d = await abrirQr();
    await act(async () => {
      fireEvent.click(within(within(d).getByRole("group", { name: "Sáb 24/10" })).getByRole("button", { name: /V-000030/ }));
    });
    expect(await within(d).findByText("Cómo se pagó")).toBeInTheDocument();
    expect(pedidos()).toContain("/billar/supervision/detalle?venta=30");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Volver a los cobros" }));
    });
    expect(within(d).getByRole("group", { name: "Sáb 24/10" })).toBeInTheDocument();
    expect(within(d).queryByText("Cómo se pagó")).toBeNull();
  });

  it("sin el permiso de administrar el billar se ven los cobros, pero no se abren", async () => {
    sesion.permisos = ["reportes.operacion"];
    const d = await abrirQr();
    expect(within(within(d).getByRole("group", { name: "Sáb 24/10" })).queryAllByRole("button")).toHaveLength(0);
  });

  it("Productos: lo pagado sólo por QR y, aparte, lo de las ventas pagadas parte y parte", async () => {
    const d = await abrirQr();
    fireEvent.click(within(d).getByRole("tab", { name: "Productos" }));
    const solo = within(d).getByRole("region", { name: "Pagados sólo por QR" });
    expect(within(solo).getByText("Paceña 620 ml")).toBeInTheDocument();
    const mixtas = within(d).getByRole("region", { name: "En ventas pagadas parte y parte" });
    expect(mixtas.textContent).toMatch(/De estas ventas entraron Bs\s40,00 por QR\. No se puede decir qué producto pagó cada medio\./);
    expect(within(mixtas).getByText("Coca-Cola")).toBeInTheDocument();
  });
});

describe("Métodos de pago en otro rubro", () => {
  it("queda exactamente como antes: los medios no se tocan", async () => {
    sesion.rubro = "RESTAURANTE";
    mostrar();
    expect(await screen.findByText("QR")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver lo cobrado/ })).toBeNull();
    expect(screen.queryByText(/Tocá un medio/)).toBeNull();
    expect(pedidos().some((u) => u.includes("/cobros"))).toBe(false);
  });
});
