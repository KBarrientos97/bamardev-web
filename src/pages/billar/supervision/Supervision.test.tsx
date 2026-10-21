import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Supervision from "./Supervision";

vi.setConfig({ testTimeout: 60_000 });

/**
 * La pantalla de Supervisión del administrador (21-oct): lo que hace la
 * cajera, en vivo y sin poder tocar nada, con el nombre de quien hizo cada
 * cosa. Lo único que se puede hacer es pausar una mesa, sin PIN. Backend y
 * sesión de mentira: lo que se mira es lo que ve el administrador y lo que
 * se le manda al backend.
 */

const request = vi.hoisted(() => vi.fn());
const sesion = vi.hoisted(() => ({ alias: "billar-sup-0" }));

vi.mock("../../../lib/api", async (original) => ({
  ...(await original<typeof import("../../../lib/api")>()),
  request,
}));

vi.mock("../../../lib/useSucursales", () => ({
  useSucursales: () => ({ elegir: false, sucursales: [], sugerida: null }),
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, sucursalId: null, sucursal: null, permisos: ["billar.admin"] },
    negocio: { alias: sesion.alias, nombre: "Billar de prueba" },
  }),
}));

const AHORA = Date.now();
const MIN = 60_000;
const POOL = { id: "pool", nombre: "Pool", tarifa: 20, fraccion: 15, tolerancia: 3, minimo: 30, paquetes: [], promos: [] };

const sesionApi = (id: number, extra: object = {}) => ({
  id,
  version: 1,
  start: AHORA - 60 * MIN,
  abierta: AHORA - 60 * MIN,
  pausedAt: null,
  pausedTotal: 0,
  pausas: [],
  prepago: null,
  prev: null,
  tarifa: POOL,
  abiertaPor: "Pepe Mamani",
  consumos: [
    { id: 5, productoId: 1, nombre: "Paceña 620 ml", precio: 15, cant: 2, hora: AHORA - 30 * MIN, anulado: false, por: "Pepe Mamani" },
    { id: 6, productoId: 2, nombre: "Coca-Cola", precio: 12, cant: 1, hora: AHORA - 20 * MIN, anulado: true, por: "Pepe Mamani", anuladoPor: "Pepe Mamani" },
  ],
  pagos: [],
  pagado: 0,
  ...extra,
});

function supervision() {
  return {
    ahora: Date.now(),
    sucursal: { id: 1, nombre: "Principal" },
    desde: AHORA - 6 * 60 * MIN,
    hoy: { ventas: 4, vendido: 180.5 },
    ajustes: { avisos: [10, 5, 1], sonido: false, voz: false, pin: { anularConsumo: true, anularMesa: true, pausar: true }, tieneTokenSalon: false },
    tipos: [POOL],
    mesas: [
      { id: 11, numero: 1, tipo: "pool", estado: "abierta", sesion: sesionApi(101) },
      {
        id: 12,
        numero: 2,
        tipo: "pool",
        estado: "abierta",
        sesion: sesionApi(102, {
          pausedAt: AHORA - 5 * MIN,
          pauseMotivo: "Se fue a comer",
          pausadaPor: { quien: "Kevin Dueño", autorizo: "Kevin Dueño", sinPin: true },
          consumos: [],
        }),
      },
      { id: 13, numero: 3, tipo: "pool", estado: "libre", libreDesde: AHORA - 120 * MIN },
    ],
    cuentas: [
      {
        id: 201,
        nombre: "Juan",
        sucursalId: 1,
        estado: "abierta",
        sesion: sesionApi(201, { tarifa: { ...POOL, id: "cuenta", tarifa: 0, minimo: 0 }, start: AHORA - 20 * MIN, consumos: [] }),
      },
    ],
    cajas: [
      { id: 1, abierta: true, cajero: "Pepe Mamani", desde: AHORA - 4 * 60 * MIN, hasta: null, inicial: 100, ventas: 3, vendido: 120.5, anuladas: 0 },
      {
        id: 2,
        abierta: false,
        cajero: "Kevin Dueño",
        desde: AHORA - 5 * 60 * MIN,
        hasta: AHORA - 4.5 * 60 * MIN,
        inicial: 50,
        contado: 110,
        diferencia: -2,
        ventas: 1,
        vendido: 60,
        anuladas: 1,
      },
    ],
    actividad: [
      { id: "ev3", hora: AHORA - 5 * MIN, quien: "Kevin Dueño", texto: "Pausó la mesa (Se fue a comer) desde Supervisión, sin PIN", lugar: "Mesa 2", codigo: "PAUSAR" },
      { id: "co1", hora: AHORA - 30 * MIN, quien: "Pepe Mamani", texto: "Cargó 2× Paceña 620 ml · Bs 30,00", lugar: "Mesa 1", codigo: "CONSUMO" },
      { id: "ve1", hora: AHORA - 60 * MIN, quien: "Kevin Dueño", texto: "Cobró V-000001 · Bs 60,00", lugar: "Cuenta «Barra»", codigo: "VENTA" },
      { id: "ca1", hora: AHORA - 4 * 60 * MIN, quien: "Pepe Mamani", texto: "Abrió la caja con Bs 100,00", codigo: "CAJA_ABIERTA" },
    ],
  };
}

/** [url, cuerpo] de los POST que se le mandaron al backend. */
const enviados = () =>
  request.mock.calls
    .filter((c) => (c[1] as { method?: string } | undefined)?.method === "POST")
    .map((c) => [c[0] as string, JSON.parse((c[1] as { body: string }).body) as Record<string, unknown>] as const);

async function montar() {
  render(
    <MemoryRouter>
      <Supervision />
    </MemoryRouter>,
  );
  await act(async () => {});
  await screen.findByRole("heading", { name: /Supervisión/ });
}

let vuelta = 0;
beforeEach(() => {
  sesion.alias = `billar-sup-${++vuelta}`;
  request.mockReset();
  request.mockImplementation(async (url: string) => {
    if (url.startsWith("/billar/supervision/sesiones/")) return { id: 12, numero: 1 };
    if (url.startsWith("/billar/supervision")) return supervision();
    return [];
  });
  localStorage.clear();
});

describe("Billar: la supervisión del administrador", () => {
  it("dice quién abrió y quién cerró cada caja, a qué hora y cómo quedó el arqueo", async () => {
    await montar();
    const cajas = screen.getByRole("heading", { name: "Cajas" }).closest("section")!;
    const pepe = within(cajas).getByText("Pepe Mamani").closest("li")!;
    expect(within(pepe).getByText("Abierta")).toBeInTheDocument();
    expect(within(pepe).getByText("3 ventas")).toBeInTheDocument();
    expect(within(pepe).getByText("Sigue abierta")).toBeInTheDocument();
    const kevin = within(cajas).getByText("Kevin Dueño").closest("li")!;
    expect(within(kevin).getByText("Cerrada")).toBeInTheDocument();
    expect(within(kevin).getByText(/cerró/)).toBeInTheDocument();
    expect(within(kevin).getByText(/faltan Bs\s2,00/)).toBeInTheDocument();
    expect(within(kevin).getByText(/1 anulada/)).toBeInTheDocument();
  });

  it("las mesas dicen quién las abrió y quién pausó la que está en pausa", async () => {
    await montar();
    const mesa1 = screen.getByRole("button", { name: "Mesa 1" }).closest("article")!;
    expect(within(mesa1).getByText("Pepe Mamani")).toBeInTheDocument();
    // Las unidades sin anular: 2 Paceña (la Coca-Cola anulada no cuenta).
    expect(within(mesa1).getByText("2 consumos")).toBeInTheDocument();
    const mesa2 = screen.getByRole("button", { name: "Mesa 2" }).closest("article")!;
    expect(within(mesa2).getByText("Pausó Kevin Dueño desde Supervisión")).toBeInTheDocument();
    // Una pausada ya no ofrece pausar.
    expect(within(mesa2).queryByRole("button", { name: /Pausar/ })).toBeNull();
    // La libre no tiene quién.
    const mesa3 = screen.getByRole("button", { name: "Mesa 3" }).closest("article")!;
    expect(within(mesa3).queryByText(/Abrió/)).toBeNull();
    expect(screen.getByText("Juan")).toBeInTheDocument();
  });

  it("es sólo para mirar: nada de abrir mesas, cargar consumos, cobrar ni cerrar la caja", async () => {
    await montar();
    for (const no of [/Abrir mesa/, /^Consumo/, /Cobrar/, /Cerrar caja/, /Venta rápida/, /Anular/, /Nueva cuenta/]) {
      expect(screen.queryByRole("button", { name: no })).toBeNull();
    }
    // Lo único que se hace es pausar las que corren (la 1; la 2 ya está pausada).
    expect(screen.getAllByRole("button", { name: /^Pausar Mesa/ })).toHaveLength(1);
  });

  it("la actividad lleva el nombre de cada usuario y se filtra", async () => {
    await montar();
    const actividad = screen.getByRole("complementary", { name: "Actividad de hoy" });
    expect(within(actividad).getByText("Pausó la mesa (Se fue a comer) desde Supervisión, sin PIN", { exact: false })).toBeInTheDocument();
    expect(within(actividad).getAllByText("Kevin Dueño").length).toBeGreaterThan(0);
    expect(within(actividad).getByText("Abrió la caja con Bs 100,00", { exact: false })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(actividad).getByRole("button", { name: "Caja" }));
    });
    expect(within(actividad).getByText("Abrió la caja con Bs 100,00", { exact: false })).toBeInTheDocument();
    expect(within(actividad).queryByText(/Cargó 2×/)).toBeNull();
    await act(async () => {
      fireEvent.click(within(actividad).getByRole("button", { name: "Ventas" }));
    });
    expect(within(actividad).getByText(/Cobró V-000001/)).toBeInTheDocument();
    expect(within(actividad).queryByText(/Abrió la caja/)).toBeNull();
  });

  it("el detalle de una mesa dice quién cargó cada consumo y quién anuló el que se sacó", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(within(screen.getByRole("button", { name: "Mesa 1" }).closest("article")!).getByRole("button", { name: "Detalle" }));
    });
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText("2× Paceña 620 ml")).toBeInTheDocument();
    expect(within(dialogo).getAllByText(/Cargó Pepe Mamani/, { selector: "p" })).toHaveLength(2);
    expect(within(dialogo).getByText(/anulado por Pepe Mamani/)).toBeInTheDocument();
  });

  it("pausar pide sólo el motivo, sin PIN, y manda la pausa de la sesión por la ruta de Supervisión", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pausar Mesa 1" }));
    });
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText(/sin PIN/)).toBeInTheDocument();
    // Ni usuario ni PIN: el administrador ya está identificado.
    expect(within(dialogo).queryByLabelText(/PIN/i)).toBeNull();
    expect(within(dialogo).queryByLabelText(/usuario/i)).toBeNull();
    fireEvent.click(within(dialogo).getByRole("radio", { name: "Corte de luz" }));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Pausar" }));
    });
    const [url, cuerpo] = enviados().find(([u]) => u.includes("/pausar"))!;
    expect(url).toBe("/billar/supervision/sesiones/101/pausar");
    expect(cuerpo).toEqual({ motivo: "Corte de luz" });
    // Y la pantalla vuelve a pedir lo que pasa.
    expect(request.mock.calls.filter((c) => String(c[0]).startsWith("/billar/supervision") && !String(c[0]).includes("/sesiones/")).length).toBeGreaterThan(1);
  });

  it("«Otro» pide escribir el motivo y no deja pausar sin él", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pausar Mesa 1" }));
    });
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("radio", { name: "Otro" }));
    const pausar = within(dialogo).getByRole("button", { name: "Pausar" });
    expect(pausar).toBeDisabled();
    fireEvent.change(within(dialogo).getByLabelText("Otro motivo"), { target: { value: "Se cayó el paño" } });
    expect(pausar).toBeEnabled();
    await act(async () => {
      fireEvent.click(pausar);
    });
    expect(enviados().find(([u]) => u.includes("/pausar"))![1]).toEqual({ motivo: "Se cayó el paño" });
  });

  it("si el servidor rechaza la pausa, el motivo queda a la vista y el diálogo sigue abierto", async () => {
    request.mockImplementation(async (url: string) => {
      if (url.startsWith("/billar/supervision/sesiones/")) throw new Error("La mesa ya está pausada");
      return supervision();
    });
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pausar Mesa 1" }));
    });
    const dialogo = screen.getByRole("dialog");
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Pausar" }));
    });
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("La mesa ya está pausada");
  });

  it("sin conexión desde el principio ofrece reintentar", async () => {
    request.mockImplementation(async () => {
      throw new Error("Failed to fetch");
    });
    render(
      <MemoryRouter>
        <Supervision />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(await screen.findByText(/Failed to fetch/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
  });
});
