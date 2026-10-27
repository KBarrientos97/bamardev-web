import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CajaSupervisionApi, CobroApi } from "../api";
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
const caja = vi.hoisted(() => ({ crear: vi.fn(), anular: vi.fn(), resumen: vi.fn() }));
const sesion = vi.hoisted(() => ({ alias: "billar-sup-0", movimientos: true }));

vi.mock("../../../lib/api", async (original) => {
  const real = await original<typeof import("../../../lib/api")>();
  return {
    ...real,
    request,
    // Lo de la caja del POS: `api` llama a su propio `request`, no al de arriba.
    api: { ...real.api, crearMovimientoCaja: caja.crear, anularMovimientoCaja: caja.anular, resumenCaja: caja.resumen },
  };
});

vi.mock("../../../lib/useSucursales", () => ({
  useSucursales: () => ({ elegir: false, sucursales: [], sugerida: null }),
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, sucursalId: null, sucursal: null, permisos: ["billar.admin"] },
    negocio: { alias: sesion.alias, nombre: "Billar de prueba" },
    // Mover efectivo de la caja pide el permiso caja.movimientos y el plan: el administrador lo tiene.
    incluye: (capacidad: string) => capacidad !== "movimientos_caja" || sesion.movimientos,
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
    // El turno que se mira: el de la caja de Pepe, la que trabaja ahora.
    turno: { cajaId: 1, defectoId: 1, desde: AHORA - 4 * 60 * MIN, hasta: null as number | null, ventas: 3, vendido: 120.5 },
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

/**
 * El detalle de una caja como lo manda `/billar/supervision/caja/:id` (backend
 * del 26-oct): por defecto sin cobros, con el arqueo de la fila.
 */
function detalleDeCaja(caja: CajaSupervisionApi, extra: object = {}) {
  return {
    caja,
    arqueo: {
      inicial: caja.inicial,
      efectivoVentas: 0,
      adelantosBillar: 0,
      abonosEfectivo: 0,
      ingresos: 0,
      egresos: 0,
      enPoderDeMeseros: 0,
      esperado: caja.inicial,
      esperadoAlCerrar: caja.abierta ? null : caja.inicial,
      contado: caja.contado ?? null,
      diferencia: caja.diferencia ?? null,
    },
    movimientos: [],
    cobros: [],
    enCurso: [],
    anuladas: [],
    ...extra,
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
  sesion.movimientos = true;
  caja.crear.mockReset().mockResolvedValue({ id: 8 });
  caja.anular.mockReset().mockResolvedValue({ id: 9 });
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

  it.each([
    ["otro (el administrador destraba la de la cajera): lo dice", "Pepe Mamani", /la cerró Pepe Mamani/],
    ["quien la abrió: no se repite", "Kevin Dueño", /^(?!.*la cerró)/],
  ])("la caja la cerró %s", async (_caso, cerroPor, esperado) => {
    request.mockImplementation(async () => {
      const s = supervision();
      return { ...s, cajas: [s.cajas[0], { ...s.cajas[1], cerroPor }] };
    });
    await montar();
    const cajas = screen.getByRole("heading", { name: "Cajas" }).closest("section")!;
    expect(within(cajas).getByText("Kevin Dueño").closest("li")!.textContent).toMatch(esperado);
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
    const actividad = screen.getByRole("complementary", { name: "Actividad del turno" });
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

  it("una respuesta vieja que llega tarde no tapa la pausa recién hecha", async () => {
    // Revisión del 23-oct: el sondeo que ya iba en camino cuando se pausó
    // llegaba después del `recargar()` y la mesa volvía a verse en juego.
    let pausada = false;
    let llegaLaVieja: (() => void) | null = null;
    let pedidos = 0;
    request.mockImplementation(async (url: string) => {
      if (url.startsWith("/billar/supervision/sesiones/")) {
        pausada = true;
        return { id: 11, numero: 1 };
      }
      if (!url.startsWith("/billar/supervision")) return [];
      pedidos++;
      const s = supervision();
      if (pedidos === 2) return new Promise((r) => (llegaLaVieja = () => r(s)));
      if (!pausada) return s;
      const [m1, ...resto] = s.mesas;
      const enPausa = { ...m1.sesion!, pausedAt: Date.now(), pauseMotivo: "Corte de luz", pausadaPor: { quien: "Kevin Dueño", sinPin: true } };
      return { ...s, mesas: [{ ...m1, sesion: enPausa }, ...resto] };
    });
    await montar();
    // Un sondeo sale (al volver a la pestaña) y se queda en el camino.
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pausar Mesa 1" }));
    });
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("radio", { name: "Corte de luz" }));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Pausar" }));
    });
    expect(screen.queryByRole("button", { name: "Pausar Mesa 1" })).toBeNull();
    await act(async () => {
      llegaLaVieja!();
    });
    expect(screen.queryByRole("button", { name: "Pausar Mesa 1" })).toBeNull();
  });

  it("con todas las cajas cerradas, el aviso dice quién cerró la última, no quién la abrió", async () => {
    // Revisión del 23-oct: el administrador cerró la caja que la cajera dejó
    // abierta y el aviso decía "Pepe Mamani cerró…".
    request.mockImplementation(async () => {
      const s = supervision();
      const cerrada = { ...s.cajas[0], abierta: false, hasta: AHORA - 10 * MIN, contado: 100, diferencia: 0, cerroPor: "Kevin Dueño" };
      return { ...s, cajas: [cerrada], turno: { ...s.turno, hasta: cerrada.hasta } };
    });
    await montar();
    expect(screen.getByText("No hay caja abierta.").parentElement!.textContent).toMatch(/Kevin Dueño cerró/);
  });

  it("el rótulo de las cuentas abiertas suma sólo las cuentas, no las mesas", async () => {
    // Revisión del 23-oct: decía lo abierto de mesas y cuentas juntas.
    request.mockImplementation(async () => {
      const s = supervision();
      const consumo = { id: 9, productoId: 1, nombre: "Paceña 620 ml", precio: 15, cant: 2, hora: AHORA - 10 * MIN, anulado: false, por: "Pepe Mamani" };
      const juan = { ...s.cuentas[0], sesion: { ...s.cuentas[0].sesion, consumos: [consumo] } };
      return { ...s, cuentas: [juan] };
    });
    await montar();
    const seccion = screen.getByRole("region", { name: "Cuentas abiertas" });
    expect(within(seccion).getByText("Cuentas abiertas").closest("div")!.textContent).toMatch(/Bs\s30,00$/);
  });

  describe("el turno: lo de cada caja no se mezcla con lo de la anterior", () => {
    /** Las llamadas a `/billar/supervision` (no a pausar), con su query. */
    const pedidos = () => request.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/billar/supervision") && !u.includes("/sesiones/"));
    const selector = () => screen.getByRole("combobox", { name: "Turno que estás viendo" });

    it("lo vendido y la actividad son del turno de la caja que trabaja; el día entero va aparte", async () => {
      await montar();
      // El selector dice cuál es: la de Pepe, en curso.
      expect(selector()).toHaveValue("1");
      expect(within(selector()).getByRole("option", { name: /^Turno en curso · Pepe Mamani · desde / })).toBeInTheDocument();
      expect(within(selector()).getByRole("option", { name: /^Kevin Dueño · .* → / })).toBeInTheDocument();
      // Lo vendido de arriba es lo del turno (Bs 120,50), no lo del día (Bs 180,50).
      const kpi = screen.getByText("Vendido en el turno").closest("div")!;
      expect(within(kpi).getByText(/120,50/)).toBeInTheDocument();
      expect(within(kpi).getByText("3 ventas")).toBeInTheDocument();
      // El día entero, en la lista de cajas.
      const cajas = screen.getByRole("heading", { name: "Cajas" }).closest("section")!;
      expect(within(cajas).getByText(/Vendido hoy en todas las cajas/).textContent).toMatch(/180,50.*4 ventas/);
      // La caja que se está mirando se marca en la lista.
      expect(within(cajas).getByText("Pepe Mamani").closest("li")).toHaveAttribute("aria-current", "true");
      expect(within(cajas).getByText("Kevin Dueño").closest("li")).not.toHaveAttribute("aria-current");
      // Y la actividad se llama del turno; con la caja en curso no hay avisos.
      expect(screen.getByRole("complementary", { name: "Actividad del turno" })).toBeInTheDocument();
      expect(screen.queryByText(/Volver al turno actual/)).toBeNull();
      expect(screen.queryByText(/No hay caja abierta/)).toBeNull();
    });

    it("elegir un turno anterior lo pide al servidor, avisa que no es el de ahora y se vuelve con un toque", async () => {
      request.mockImplementation(async (url: string) => {
        if (url.includes("/sesiones/")) return { id: 12, numero: 1 };
        if (url.includes("turno=2")) {
          return {
            ...supervision(),
            turno: { cajaId: 2, defectoId: 1, desde: AHORA - 5 * 60 * MIN, hasta: AHORA - 4.5 * 60 * MIN, ventas: 1, vendido: 60 },
            actividad: [{ id: "ve1", hora: AHORA - 4.6 * 60 * MIN, quien: "Kevin Dueño", texto: "Cobró V-000001 · Bs 60,00", codigo: "VENTA" }],
          };
        }
        return supervision();
      });
      await montar();
      await act(async () => {
        fireEvent.change(selector(), { target: { value: "2" } });
      });
      expect(pedidos().at(-1)).toBe("/billar/supervision?turno=2");
      expect(selector()).toHaveValue("2");
      expect(screen.getByText(/Estás viendo un turno anterior/)).toBeInTheDocument();
      // Lo del turno elegido, y nada de lo del otro.
      const kpi = screen.getByText("Vendido en el turno").closest("div")!;
      expect(within(kpi).getByText(/60,00/)).toBeInTheDocument();
      const actividad = screen.getByRole("complementary", { name: "Actividad del turno" });
      expect(within(actividad).getByText(/Cobró V-000001/)).toBeInTheDocument();
      expect(within(actividad).queryByText(/Cargó 2×/)).toBeNull();
      // Volver: otra vez el turno de ahora, sin pedir uno en particular.
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Volver al turno actual" }));
      });
      expect(pedidos().at(-1)).toBe("/billar/supervision");
      expect(selector()).toHaveValue("1");
      expect(screen.queryByText(/Estás viendo un turno anterior/)).toBeNull();
    });

    it("elegir en el selector el turno que ya es el de ahora lo vuelve a seguir solo", async () => {
      request.mockImplementation(async (url: string) => {
        if (url.includes("turno=2")) {
          return { ...supervision(), turno: { cajaId: 2, defectoId: 1, desde: AHORA - 5 * 60 * MIN, hasta: AHORA - 4.5 * 60 * MIN, ventas: 1, vendido: 60 } };
        }
        return supervision();
      });
      await montar();
      await act(async () => {
        fireEvent.change(selector(), { target: { value: "2" } });
      });
      await act(async () => {
        fireEvent.change(selector(), { target: { value: "1" } });
      });
      // Sin `turno=`: así cuando abran otra caja, la pantalla pasa sola a la nueva.
      expect(pedidos().at(-1)).toBe("/billar/supervision");
    });

    it("con todas las cajas cerradas muestra cómo terminó la última y avisa que empieza de cero cuando abran otra", async () => {
      request.mockImplementation(async () => {
        const s = supervision();
        return {
          ...s,
          cajas: [s.cajas[1]],
          turno: { cajaId: 2, defectoId: 2, desde: AHORA - 5 * 60 * MIN, hasta: AHORA - 4.5 * 60 * MIN, ventas: 1, vendido: 60 },
        };
      });
      await montar();
      expect(screen.getByText(/No hay caja abierta/)).toBeInTheDocument();
      expect(screen.getByText(/empieza de cero/)).toBeInTheDocument();
      expect(within(selector()).getByRole("option", { name: /^Último turno · Kevin Dueño/ })).toBeInTheDocument();
    });

    it("una caja que sigue abierta de antes de la jornada avisa que quizás se olvidaron de cerrarla", async () => {
      request.mockImplementation(async () => {
        const s = supervision();
        const vieja = { ...s.cajas[0], desde: AHORA - 30 * 60 * MIN * 60 };
        return { ...s, cajas: [vieja], turno: { cajaId: 1, defectoId: 1, desde: vieja.desde, hasta: null, ventas: 0, vendido: 0 } };
      });
      await montar();
      expect(screen.getByText(/¿Se olvidaron de cerrarla\?/)).toBeInTheDocument();
      expect(within(selector()).getByRole("option", { name: /^Quedó abierta · Pepe Mamani/ })).toBeInTheDocument();
    });

    describe("la semana: de lunes a domingo, se reinicia el lunes a las 13:00", () => {
      // La semana del lunes 19 al domingo 25-oct; se reinicia el lunes 26 a las 13:00.
      const semana = { desde: new Date(2026, 9, 19, 13).getTime(), hasta: new Date(2026, 9, 26, 13).getTime() };
      const DIA = 24 * 60 * MIN;
      const conSemana = (cerradas: number) => {
        const s = supervision();
        const cajas = [
          s.cajas[0],
          ...Array.from({ length: cerradas }, (_, i) => ({
            ...s.cajas[1],
            id: 10 + i,
            cajero: "pepe",
            desde: AHORA - (i + 1) * DIA,
            hasta: AHORA - (i + 1) * DIA + 11 * 60 * MIN,
          })),
        ];
        return { ...s, semana, cajas };
      };
      const filas = () => within(screen.getByRole("heading", { name: "Cajas" }).closest("section")!).queryAllByRole("listitem");

      it("dice qué semana es y cuándo empieza la nueva", async () => {
        request.mockImplementation(async () => conSemana(2));
        await montar();
        // En el selector y en el encabezado de las cajas.
        expect(screen.getAllByText(/Semana del lun 19\/10 al dom 25\/10/)).toHaveLength(2);
        expect(screen.getByText(/La semana nueva empieza el lunes 26\/10 a las 13:00/)).toBeInTheDocument();
        // Cada turno con el día de la semana: quién, de cuándo a cuándo.
        expect(within(selector()).getAllByRole("option")).toHaveLength(3);
        expect(within(selector()).getAllByRole("option")[1].textContent).toMatch(/^pepe · (Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo) \d\d\/\d\d \d\d:\d\d → /);
      });

      it("con la semana entera la lista de cajas se pliega: las últimas y un botón para el resto", async () => {
        request.mockImplementation(async () => conSemana(5));
        await montar();
        // El selector sí lista los 6 turnos; la lista de cajas, 3 de entrada.
        expect(within(selector()).getAllByRole("option")).toHaveLength(6);
        expect(filas()).toHaveLength(3);
        fireEvent.click(screen.getByRole("button", { name: "Ver 3 más de la semana" }));
        expect(filas()).toHaveLength(6);
        fireEvent.click(screen.getByRole("button", { name: "Mostrar menos" }));
        expect(filas()).toHaveLength(3);
      });

      it("con pocas cajas no hay botón", async () => {
        request.mockImplementation(async () => conSemana(2));
        await montar();
        expect(filas()).toHaveLength(3);
        expect(screen.queryByRole("button", { name: /más de la semana/ })).toBeNull();
      });

      it("el lunes después de las 13:00, sin cajas nuevas, no hay selector y avisa que se reinicia la semana", async () => {
        request.mockImplementation(async () => ({
          ...supervision(),
          semana,
          cajas: [],
          turno: { cajaId: null, defectoId: null, desde: AHORA - 6 * 60 * MIN, hasta: null, ventas: 0, vendido: 0 },
        }));
        await montar();
        expect(screen.queryByRole("combobox", { name: "Turno que estás viendo" })).toBeNull();
        expect(screen.getByText(/Nadie abrió caja esta semana todavía/)).toBeInTheDocument();
      });

      it("un servidor anterior, sin semana, sigue como antes", async () => {
        request.mockImplementation(async () => supervision());
        await montar();
        expect(screen.queryByText(/Semana del/)).toBeNull();
        expect(screen.getByText("Llegada y salida del personal")).toBeInTheDocument();
      });
    });

    it("un servidor anterior, que no manda el turno, sigue mostrando lo de hoy", async () => {
      request.mockImplementation(async () => {
        const { turno: _sin, ...anterior } = supervision();
        void _sin;
        return anterior;
      });
      await montar();
      expect(screen.queryByRole("combobox", { name: "Turno que estás viendo" })).toBeNull();
      expect(screen.getByText("Vendido hoy")).toBeInTheDocument();
      expect(screen.getByRole("complementary", { name: "Actividad de hoy" })).toBeInTheDocument();
    });
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

describe("Billar (24-oct): los movimientos de efectivo y la cena de la cajera", () => {
  /** La caja de Pepe, abierta, con la cena de Bs 20 que registró el administrador. */
  const efectivo = (extra: object = {}) => ({
    cajaId: 1,
    abierta: true,
    esperado: 145,
    movimientos: [{ id: 7, tipo: "EGRESO", monto: 20, texto: "Cena", cena: true, quien: "Kevin Dueño", hora: AHORA - 10 * MIN }],
    ...extra,
  });
  const conEfectivo = (e: object | null, cena = true) => {
    request.mockImplementation(async (url: string) => {
      if (url.startsWith("/billar/supervision")) {
        const s = supervision();
        return {
          ...s,
          cajas: [{ ...s.cajas[0], ...(cena ? { cena: { monto: 20, por: "Kevin Dueño" } } : {}) }, s.cajas[1]],
          efectivo: e,
          actividad: [
            {
              id: "mo7",
              hora: AHORA - 10 * MIN,
              quien: "Kevin Dueño",
              texto: "Registró una salida de efectivo de Bs 20,00: Cena",
              lugar: "Caja de Pepe Mamani",
              codigo: "EFECTIVO_CENA",
            },
            ...s.actividad,
          ],
        };
      }
      if (url.startsWith("/caja/")) return { id: 8 };
      return [];
    });
  };
  const tarjeta = () => screen.getByRole("region", { name: "Movimientos de efectivo" });

  it("muestra lo registrado con quién lo hizo y el efectivo que debería haber en la caja", async () => {
    conEfectivo(efectivo());
    await montar();
    const t = tarjeta();
    expect(within(t).getByText("Caja de Pepe Mamani · abierta")).toBeInTheDocument();
    // La fila de lo registrado y el botón de registrar otra.
    expect(within(t).getAllByText("Cena")).toHaveLength(2);
    expect(within(t).getByText(/Registró Kevin Dueño/)).toBeInTheDocument();
    expect(within(t).getByText("Efectivo que debería haber en la caja")).toBeInTheDocument();
    expect(within(t).getByText(/145,00/)).toBeInTheDocument();
    // Cada caja trae su dato "Cena" y la actividad tiene su renglón.
    const cajas = screen.getByRole("heading", { name: "Cajas" }).closest("section")!;
    expect(within(cajas).getByText(/Registró Kevin Dueño/)).toBeInTheDocument();
    const actividad = screen.getByRole("complementary", { name: "Actividad del turno" });
    expect(within(actividad).getByText(/Registró una salida de efectivo de Bs 20,00: Cena/)).toBeInTheDocument();
  });

  it("el filtro Efectivo deja sólo los movimientos de efectivo", async () => {
    conEfectivo(efectivo());
    await montar();
    const actividad = screen.getByRole("complementary", { name: "Actividad del turno" });
    await act(async () => {
      fireEvent.click(within(actividad).getByRole("button", { name: "Efectivo" }));
    });
    expect(within(actividad).getByText(/Registró una salida de efectivo/)).toBeInTheDocument();
    expect(within(actividad).queryByText(/Cargó 2×/)).toBeNull();
  });

  it("«Cena» abre el cuadro de movimiento con la cena elegida y a qué caja va", async () => {
    conEfectivo(efectivo());
    await montar();
    await act(async () => {
      fireEvent.click(within(tarjeta()).getByRole("button", { name: "Cena" }));
    });
    const cuadro = await screen.findByRole("dialog");
    expect(within(cuadro).getByText("Movimiento de efectivo")).toBeInTheDocument();
    expect(within(cuadro).getByText("Pepe Mamani")).toBeInTheDocument();
    expect(within(cuadro).getByText("Sale plata de la caja")).toBeInTheDocument();
    // Montos para tocar, y cómo cambia el cierre de ella.
    fireEvent.click(within(cuadro).getByRole("button", { name: "20" }));
    expect(within(cuadro).getByText(/el efectivo esperado pasa de/)).toHaveTextContent(/145,00.*125,00/);
  });

  it("registra la cena en la caja de la cajera, marcada como cena", async () => {
    conEfectivo(efectivo());
    await montar();
    await act(async () => {
      fireEvent.click(within(tarjeta()).getByRole("button", { name: "Cena" }));
    });
    const cuadro = await screen.findByRole("dialog");
    fireEvent.click(within(cuadro).getByRole("button", { name: "30" }));
    await act(async () => {
      fireEvent.click(within(cuadro).getByRole("button", { name: "Registrar" }));
    });
    expect(caja.crear).toHaveBeenCalledWith(1, { tipo: "EGRESO", monto: 30, descripcion: "Cena", origen: "CENA" });
  });

  it("con la caja del administrador a la vista, la tarjeta dice que va a la de la cajera, y al registrar pasa a su turno", async () => {
    // El turno por defecto es la caja abierta más vieja: la del propio
    // administrador. La tarjeta decía "aparece en el cierre de tu caja", el
    // cuadro lo mandaba a la de Pepe y no se veía en ningún lado: se cargaba dos veces.
    caja.crear.mockResolvedValue({ id: 9 });
    caja.resumen.mockResolvedValue({ cajaId: 1, saldoEsperado: 300 });
    request.mockImplementation(async (url: string) => {
      if (url.startsWith("/billar/supervision")) {
        const s = supervision();
        const dePepe = url.includes("turno=1");
        return {
          ...s,
          turno: { ...s.turno, cajaId: dePepe ? 1 : 3, defectoId: 3 },
          cajas: [
            { id: 3, abierta: true, cajero: "Kevin Dueño", cajeroId: 1, desde: AHORA - 5 * 60 * MIN, hasta: null, inicial: 50, ventas: 0, vendido: 0, anuladas: 0 },
            { ...s.cajas[0], cajeroId: 20 },
          ],
          efectivo: dePepe
            ? { cajaId: 1, abierta: true, esperado: 280, movimientos: [{ id: 9, tipo: "EGRESO", monto: 20, texto: "Cena", cena: true, codigo: "CENA", quien: "Kevin Dueño", hora: AHORA }] }
            : { cajaId: 3, abierta: true, esperado: 50, movimientos: [] },
        };
      }
      return [];
    });
    await montar();
    expect(within(tarjeta()).getByText(/va a la caja de Pepe Mamani y aparece en su cierre, no en esta lista/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(tarjeta()).getByRole("button", { name: "Cena" }));
    });
    const cuadro = await screen.findByRole("dialog");
    expect(within(cuadro).getByRole("combobox")).toHaveValue("1");
    fireEvent.click(within(cuadro).getByRole("button", { name: "20" }));
    // El esperado del aviso es el de Pepe (lo pidió el cuadro), no el de la caja a la vista.
    expect(await within(cuadro).findByText(/el efectivo esperado pasa de/)).toHaveTextContent(/300,00.*280,00/);
    await act(async () => {
      fireEvent.click(within(cuadro).getByRole("button", { name: "Registrar" }));
    });
    expect(caja.crear).toHaveBeenCalledWith(1, { tipo: "EGRESO", monto: 20, descripcion: "Cena", origen: "CENA" });
    expect(await screen.findByText(/Registrado en la caja de Pepe Mamani/)).toBeInTheDocument();
    expect(request.mock.calls.some((c) => String(c[0]).includes("turno=1"))).toBe(true);
    expect(await within(tarjeta()).findByText("Caja de Pepe Mamani · abierta")).toBeInTheDocument();
  });

  it("anular una cena pide confirmar y la anula en esa caja", async () => {
    conEfectivo(efectivo());
    await montar();
    await act(async () => {
      fireEvent.click(within(tarjeta()).getByRole("button", { name: /Anular la cena de/ }));
    });
    const confirmar = await screen.findByRole("dialog");
    expect(within(confirmar).getByText(/no se borra/i)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(confirmar).getByRole("button", { name: "Anular la cena" }));
    });
    expect(caja.anular).toHaveBeenCalledWith(1, 7);
  });

  it("una cena anulada se ve tachada, con quién la anuló, y ya no se puede anular otra vez", async () => {
    conEfectivo(
      efectivo({
        esperado: 165,
        movimientos: [
          {
            id: 7,
            tipo: "EGRESO",
            monto: 20,
            texto: "Cena",
            cena: true,
            codigo: "CENA",
            anulada: true,
            anuladoPor: "Ana Encargada",
            anuladoHora: AHORA - 5 * MIN,
            quien: "Kevin Dueño",
            hora: AHORA - 10 * MIN,
          },
          { id: 8, tipo: "INGRESO", monto: 20, texto: "Cena anulada · #7", cena: true, codigo: "CENA", anulaA: 7, quien: "Ana Encargada", hora: AHORA - 5 * MIN },
        ],
      }),
      false,
    );
    await montar();
    const t = tarjeta();
    expect(within(t).getByText("Anulada")).toBeInTheDocument();
    expect(within(t).getByText(/Lo anuló Ana Encargada/)).toBeInTheDocument();
    // La anulación no es un renglón más: antes "Cena anulada +Bs 20,00 · entra
    // plata a la caja" se leía como plata que entró de verdad.
    expect(within(t).queryByText("Cena anulada")).toBeNull();
    expect(within(t).queryByText(/\+Bs 20,00/)).toBeNull();
    expect(within(t).queryByRole("button", { name: /Anular la cena de/ })).toBeNull();
  });

  it("cualquier movimiento con motivo se anula, no sólo la cena", async () => {
    conEfectivo(
      efectivo({
        esperado: 165,
        movimientos: [
          { id: 9, tipo: "EGRESO", monto: 300, texto: "Retiro", cena: false, codigo: "RETIRO", quien: "Kevin Dueño", hora: AHORA - 10 * MIN },
          { id: 10, tipo: "EGRESO", monto: 30, texto: "Hielo", cena: false, codigo: "GASTO", quien: "Kevin Dueño", hora: AHORA - 8 * MIN },
          // Sin motivo (el cierre de caja, o un backend anterior): no se anula desde acá.
          { id: 11, tipo: "INGRESO", monto: 5, texto: "Vuelto", cena: false, quien: "Pepe Mamani", hora: AHORA - 6 * MIN },
        ],
      }),
    );
    await montar();
    const t = tarjeta();
    expect(within(t).getByText("Gasto · Hielo")).toBeInTheDocument();
    expect(within(t).getByRole("button", { name: "Anular «Retiro» de Bs 300,00" })).toBeInTheDocument();
    expect(within(t).getByRole("button", { name: "Anular «Gasto · Hielo» de Bs 30,00" })).toBeInTheDocument();
    expect(within(t).getAllByRole("button", { name: /^Anular/ })).toHaveLength(2);
    await act(async () => {
      fireEvent.click(within(t).getByRole("button", { name: "Anular «Retiro» de Bs 300,00" }));
    });
    const confirmar = screen.getByRole("dialog");
    expect(within(confirmar).getByText(/vuelve a subir/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(confirmar).getByRole("button", { name: "Anular" }));
    });
    expect(caja.anular).toHaveBeenCalledWith(1, 9);
  });

  it("con la caja cerrada se ve lo registrado pero no se puede registrar ni anular", async () => {
    conEfectivo(efectivo({ abierta: false, esperado: null }));
    await montar();
    const t = tarjeta();
    expect(within(t).getByText(/La caja está cerrada/)).toBeInTheDocument();
    expect(within(t).queryByRole("button", { name: "Cena" })).toBeNull();
    expect(within(t).queryByRole("button", { name: /Registrar movimiento de efectivo/ })).toBeNull();
    expect(within(t).queryByRole("button", { name: /Anular la cena de/ })).toBeNull();
    expect(within(t).queryByText("Efectivo que debería haber en la caja")).toBeNull();
  });

  it("sin el permiso de mover efectivo, se mira pero no se registra", async () => {
    sesion.movimientos = false;
    conEfectivo(efectivo());
    await montar();
    const t = tarjeta();
    expect(within(t).getByText("Cena")).toBeInTheDocument();
    expect(within(t).queryByRole("button", { name: "Cena" })).toBeNull();
    expect(within(t).queryByRole("button", { name: /Anular la cena de/ })).toBeNull();
  });

  it("un servidor anterior, sin efectivo, no dibuja la tarjeta", async () => {
    conEfectivo(null);
    await montar();
    expect(screen.queryByRole("region", { name: "Movimientos de efectivo" })).toBeNull();
  });
});

describe("Billar (25-oct): lo que salió en el turno y el detalle de cada renglón de la actividad", () => {
  const PRODUCTOS = {
    unidades: 4,
    total: 60,
    lineas: 1,
    categorias: [{ nombre: "Cervezas", unidades: 4, total: 60, items: [{ nombre: "Paceña 620 ml", cantidad: 4, precio: 15, total: 60 }] }],
  };
  const HISTORIAL = [
    { id: "ev1", hora: AHORA - 60 * MIN, quien: "Pepe Mamani", texto: "Abrió la mesa en tiempo libre", codigo: "ABRIR" },
    { id: "co5", hora: AHORA - 30 * MIN, quien: "Pepe Mamani", texto: "Cargó 2× Paceña 620 ml · Bs 30,00", codigo: "CONSUMO" },
    { id: "ve77", hora: AHORA - 10 * MIN, quien: "Pepe Mamani", texto: "Cobró V-000077 · Bs 45,00", codigo: "VENTA" },
  ];
  const VENTA = {
    id: 77,
    codigo: "V-000077",
    hora: AHORA - 10 * MIN,
    cajero: "Pepe Mamani",
    cliente: "Don Raúl",
    origen: "mesa",
    mesaId: 1,
    tipoMesa: "pool",
    tiempoMin: 45,
    tiempoBs: 15,
    items: [{ productoId: 1, nombre: "Paceña 620 ml", precio: 15, cant: 2 }],
    consumosBs: 30,
    total: 45,
    pagos: [{ id: "9", hora: AHORA - 10 * MIN, metodo: "Efectivo", monto: 45 }],
    recibido: 50,
    cambio: 5,
  };

  /** Servidor con renglones que se pueden abrir y el detalle de cada uno. */
  const conRefs = (extra: object = {}) => {
    request.mockImplementation(async (url: string) => {
      if (url.startsWith("/billar/supervision/caja/")) return detalleDeCaja(supervision().cajas[0]);
      if (url.startsWith("/billar/supervision/detalle")) {
        return url.includes("venta=77") || url.includes("sesion=900")
          ? { abierta: false, sesionId: 900, venta: VENTA, historial: HISTORIAL }
          : { abierta: true, sesionId: 101, venta: null, historial: HISTORIAL.slice(0, 2) };
      }
      if (url.startsWith("/billar/supervision")) {
        const s = supervision();
        return {
          ...s,
          productos: PRODUCTOS,
          actividad: [
            { id: "ve77", hora: AHORA - 10 * MIN, quien: "Pepe Mamani", texto: "Cobró V-000077 · Bs 45,00", lugar: "Mesa 5", codigo: "VENTA", ref: { venta: 77 } },
            { id: "co5", hora: AHORA - 30 * MIN, quien: "Pepe Mamani", texto: "Cargó 2× Paceña 620 ml · Bs 30,00", lugar: "Mesa 1", codigo: "CONSUMO", ref: { sesion: 101 } },
            { id: "ca1", hora: AHORA - 4 * 60 * MIN, quien: "Pepe Mamani", texto: "Abrió la caja con Bs 100,00", codigo: "CAJA_ABIERTA", ref: { caja: 1 } },
            { id: "ev9", hora: AHORA - 5 * 60 * MIN, quien: "Kevin Dueño", texto: "Cambió qué pide PIN", codigo: "AJUSTE_PIN" },
          ],
          ...extra,
        };
      }
      return [];
    });
  };
  const actividadDe = () => screen.getByRole("complementary", { name: "Actividad del turno" });

  it("lo que salió: lo cobrado por producto, lo pedido en las mesas abiertas y la cuenta hasta el «Por cobrar»", async () => {
    conRefs();
    await montar();
    const t = screen.getByRole("region", { name: "Lo que salió en el turno" });
    // La plata con centavos y la cantidad sin ceros: "4 u × Bs 15,00" (Kevin, 25-oct).
    expect(within(t).getByText("Bs 60,00 cobrado")).toBeInTheDocument();
    expect(within(t).getByText("4 unidades · 1 producto")).toBeInTheDocument();
    expect(within(t).getByText("4 u × Bs 15,00")).toBeInTheDocument();
    expect(within(t).queryByText(/4,00/)).toBeNull();
    expect(within(t).getByText("Cervezas")).toBeInTheDocument();
    // La Paceña ya cobrada, y las 2 que lleva la Mesa 1 (la Coca-Cola anulada no cuenta).
    expect(within(t).getAllByText("Paceña 620 ml")).toHaveLength(2);
    expect(within(t).getByText("Pedido en mesas y cuentas abiertas")).toBeInTheDocument();
    expect(within(t).getByText("2 u × Bs 15,00")).toBeInTheDocument();
    expect(within(t).queryByText("Coca-Cola")).toBeNull();
    // El pie llega al mismo número que el KPI "Por cobrar" de arriba.
    const kpi = screen.getByText("Por cobrar").closest("div")!;
    const porCobrar = kpi.querySelectorAll("p")[1].textContent!;
    expect(within(t.querySelector("footer")!).getByText(porCobrar)).toBeInTheDocument();
  });

  it("sin nada cobrado ni nada pedido lo dice", async () => {
    conRefs({ productos: { unidades: 0, total: 0, lineas: 0, categorias: [] }, mesas: [], cuentas: [] });
    await montar();
    const t = screen.getByRole("region", { name: "Lo que salió en el turno" });
    expect(within(t).getByText("Todavía no se cobró nada en este turno.")).toBeInTheDocument();
    expect(within(t).getByText("Nada pedido en mesas y cuentas abiertas.")).toBeInTheDocument();
  });

  it("sin un turno que mirar no se dibuja, aunque el servidor mande lo vendido de la jornada", async () => {
    // Desde el 25-oct el servidor manda `productos` también sin caja: la
    // tarjeta diría "En este turno no se cobró nada" sin que haya turno.
    conRefs({
      cajas: [],
      turno: { cajaId: null, defectoId: null, desde: AHORA - 6 * 60 * MIN, hasta: null, ventas: 0, vendido: 0 },
      productos: { unidades: 0, total: 0, lineas: 0, categorias: [] },
    });
    await montar();
    expect(screen.getByText("Vendido hoy")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Lo que salió en el turno" })).toBeNull();
  });

  it("lo que pasó el tope de la actividad va después de un corte en «Todo», y no en «Caja»", async () => {
    // Noche movida: el servidor corta en 150 pero manda igual la apertura de la
    // caja. Sin el corte, la apertura de las 16:00 quedaba pegada al último
    // renglón del tope como si en el medio no hubiera pasado nada.
    conRefs({
      actividad: [
        { id: "co9", hora: AHORA - 10 * MIN, quien: "Pepe Mamani", texto: "Cargó 1× Paceña 620 ml · Bs 15,00", lugar: "Mesa 1", codigo: "CONSUMO" },
        { id: "co8", hora: AHORA - 20 * MIN, quien: "Pepe Mamani", texto: "Cargó 1× Coca-Cola · Bs 8,00", lugar: "Mesa 1", codigo: "CONSUMO" },
        { id: "ca1", hora: AHORA - 4 * 60 * MIN, quien: "Pepe Mamani", texto: "Abrió la caja con Bs 100,00", codigo: "CAJA_ABIERTA", fueraDelTope: true },
      ],
    });
    await montar();
    const corte = /sólo se ven la caja y el efectivo/;
    const lista = actividadDe();
    expect(within(lista).getByText(corte)).toBeInTheDocument();
    expect(within(lista).getByText("Abrió la caja con Bs 100,00", { exact: false })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(lista).getByRole("button", { name: "Caja" }));
    });
    expect(within(lista).getByText("Abrió la caja con Bs 100,00", { exact: false })).toBeInTheDocument();
    expect(within(lista).queryByText(corte)).toBeNull();
  });

  it("un servidor anterior, sin lo vendido, no dibuja la tarjeta", async () => {
    conRefs({ productos: undefined });
    await montar();
    expect(screen.queryByRole("region", { name: "Lo que salió en el turno" })).toBeNull();
  });

  it("tocar una venta abre el ticket con todo lo que se hizo", async () => {
    conRefs();
    await montar();
    await act(async () => {
      fireEvent.click(within(actividadDe()).getByRole("button", { name: /Cobró V-000077/ }));
    });
    const d = await screen.findByRole("dialog", { name: "Detalle de venta" });
    // El "Detalle de venta" (26-oct): el comprobante, la mesa y su tipo abajo del título.
    expect(await within(d).findByText("V-000077 · Mesa 1 · Pool")).toBeInTheDocument();
    expect(request.mock.calls.map((c) => c[0] as string)).toContain("/billar/supervision/detalle?venta=77");
    // El ticket: quién cobró, el tiempo, los consumos, el total y con qué se pagó.
    expect(within(d).getByText(/Pepe Mamani · /)).toBeInTheDocument();
    expect(within(d).getByText("Don Raúl")).toBeInTheDocument();
    expect(within(d).getByText("2 × Paceña 620 ml")).toBeInTheDocument();
    expect(within(d).getByText("Cómo se pagó")).toBeInTheDocument();
    expect(within(d).getByText(/^Al cobrar · /)).toBeInTheDocument();
    expect(within(d).getByText("Le dieron")).toBeInTheDocument();
    // Y la historia de la mesa, en orden.
    const pasos = within(d).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(pasos[0]).toMatch(/Abrió la mesa en tiempo libre/);
    expect(pasos[1]).toMatch(/Cargó 2× Paceña 620 ml/);
    expect(pasos[2]).toMatch(/Cobró V-000077/);
  });

  it("tocar un consumo de una mesa abierta abre su detalle en vivo, con lo que se hizo abajo", async () => {
    conRefs();
    await montar();
    await act(async () => {
      fireEvent.click(within(actividadDe()).getByRole("button", { name: /Cargó 2× Paceña/ }));
    });
    const d = await screen.findByRole("dialog");
    // El detalle de siempre de la Mesa 1 (consumos con quién y a qué hora)…
    expect(within(d).getAllByText("Consumos").length).toBeGreaterThan(0);
    // …y lo que se hizo, que se pide por la mesa.
    expect(await within(d).findByText("Lo que se hizo")).toBeInTheDocument();
    expect(request.mock.calls.map((c) => c[0] as string)).toContain("/billar/supervision/detalle?sesion=101");
    expect(await within(d).findByText(/Abrió la mesa en tiempo libre/)).toBeInTheDocument();
  });

  it("el detalle de una mesa desde su tarjeta también cuenta lo que se hizo", async () => {
    conRefs();
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mesa 1" }));
    });
    const d = await screen.findByRole("dialog");
    expect(await within(d).findByText("Lo que se hizo")).toBeInTheDocument();
    expect(request.mock.calls.map((c) => c[0] as string)).toContain("/billar/supervision/detalle?sesion=101");
  });

  it("tocar la caja abre su detalle, que pide lo cobrado al servidor", async () => {
    // Hasta el 25-oct el resumen no pedía nada; desde el 26 trae lo cobrado por
    // QR y en efectivo, venta por venta (ver el describe del 26-oct).
    conRefs();
    await montar();
    request.mockClear();
    await act(async () => {
      fireEvent.click(within(actividadDe()).getByRole("button", { name: /Abrió la caja con/ }));
    });
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText("Caja de Pepe Mamani")).toBeInTheDocument();
    expect(within(d).getByText("Lleva")).toBeInTheDocument();
    expect(request.mock.calls.map((c) => c[0] as string)).toContain("/billar/supervision/caja/1");
  });

  it("un renglón sin nada más que contar no es un botón", async () => {
    conRefs();
    await montar();
    expect(within(actividadDe()).queryByRole("button", { name: /Cambió qué pide PIN/ })).toBeNull();
    expect(within(actividadDe()).getByText(/Cambió qué pide PIN/)).toBeInTheDocument();
  });

  it("si el servidor no puede dar el detalle lo dice y deja reintentar", async () => {
    conRefs();
    const original = request.getMockImplementation()!;
    request.mockImplementation(async (url: string, ...resto: unknown[]) => {
      if (url.startsWith("/billar/supervision/detalle")) throw new Error("Esa venta no existe");
      return original(url, ...resto);
    });
    await montar();
    await act(async () => {
      fireEvent.click(within(actividadDe()).getByRole("button", { name: /Cobró V-000077/ }));
    });
    const d = await screen.findByRole("dialog");
    expect(await within(d).findByText(/Esa venta no existe/)).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
  });
});

describe("Billar (26-oct): qué se cobró por QR y qué en efectivo", () => {
  // La caja de la captura de Miguel, el administrador: abrió con 50, vendió 676
  // (556 en efectivo y 120 por QR, que van a la cuenta y no al cajón) y contó
  // 616. Sumaba 50 + 676 y no le daba: debía haber 50 + 556 = 606, sobran 10.
  const MIGUEL: CajaSupervisionApi = {
    id: 2,
    abierta: false,
    cajero: "Kevin Dueño",
    desde: AHORA - 5 * 60 * MIN,
    hasta: AHORA - 4.5 * 60 * MIN,
    inicial: 50,
    contado: 616,
    diferencia: 10,
    ventas: 14,
    vendido: 676,
    anuladas: 0,
    cobrado: { efectivo: { monto: 556, cobros: 12 }, qr: { monto: 120, cobros: 3 }, otros: [], mixtas: 1 },
    esperado: 606,
  };
  const MESA_2 = {
    id: 77,
    codigo: "V-000077",
    total: 160,
    origen: "mesa" as const,
    mesaId: 2,
    tiempoMin: 90,
    items: [{ nombre: "Paceña 620 ml", cant: 2 }],
    medios: ["Efectivo", "QR"],
  };
  const COBROS: CobroApi[] = [
    { id: "vp30", hora: AHORA - 4.6 * 60 * MIN, medio: "QR", monto: 80, por: "Kevin Dueño", venta: MESA_2 },
    {
      id: "vp29",
      hora: AHORA - 4.7 * 60 * MIN,
      medio: "QR",
      monto: 40,
      concepto: "ADELANTO",
      por: "Pepe Mamani",
      venta: { id: 76, codigo: "V-000076", total: 40, origen: "cuenta", cuenta: "Juan", tiempoMin: 0, items: [{ nombre: "Coca-Cola", cant: 1 }], medios: ["QR"] },
    },
    { id: "vp28", hora: AHORA - 4.6 * 60 * MIN, medio: "Efectivo", monto: 80, por: "Kevin Dueño", venta: MESA_2 },
    {
      id: "vp27",
      hora: AHORA - 4.8 * 60 * MIN,
      medio: "Efectivo",
      monto: 476,
      por: "Kevin Dueño",
      venta: { id: 75, codigo: "V-000075", total: 476, origen: "rapida", tiempoMin: 0, items: [{ nombre: "Paceña 620 ml", cant: 30 }], medios: ["Efectivo"] },
    },
  ];
  const VENTA_77 = {
    id: 77,
    codigo: "V-000077",
    hora: AHORA - 4.6 * 60 * MIN,
    cajero: "Kevin Dueño",
    origen: "mesa",
    mesaId: 2,
    tipoMesa: "pool",
    tiempoMin: 90,
    tiempoBs: 130,
    items: [{ productoId: 1, nombre: "Paceña 620 ml", precio: 15, cant: 2 }],
    consumosBs: 30,
    total: 160,
    pagos: [
      { id: "30", hora: AHORA - 4.6 * 60 * MIN, metodo: "QR", monto: 80 },
      { id: "28", hora: AHORA - 4.6 * 60 * MIN, metodo: "Efectivo", monto: 80 },
    ],
  };

  /** El servidor con estas cajas; `caja` responde el detalle de una. */
  const servidor = (cajas: CajaSupervisionApi[], caja: (url: string) => unknown) => {
    request.mockImplementation(async (url: string) => {
      if (url.startsWith("/billar/supervision/caja/")) return caja(url);
      if (url.startsWith("/billar/supervision/detalle")) return { abierta: false, sesionId: 900, venta: VENTA_77, historial: [] };
      if (url.startsWith("/billar/supervision")) return { ...supervision(), cajas };
      return [];
    });
  };
  /** La caja de Pepe sigue abierta, también con lo cobrado y lo que debería haber ahora. */
  const pepe = (): CajaSupervisionApi => ({
    ...supervision().cajas[0],
    cobrado: { efectivo: { monto: 100.5, cobros: 2 }, qr: { monto: 20, cobros: 1 }, otros: [], mixtas: 0 },
    esperado: 200.5,
  });
  const deMiguel = () =>
    servidor([pepe(), MIGUEL], () =>
      detalleDeCaja(MIGUEL, {
        arqueo: { ...detalleDeCaja(MIGUEL).arqueo, efectivoVentas: 556, esperado: 606, esperadoAlCerrar: 606 },
        cobros: COBROS,
      }),
    );
  const cajaDe = (quien: string) => within(screen.getByRole("heading", { name: "Cajas" }).closest("section")!).getByText(quien).closest("li")!;
  /** Un dato de la tarjeta (rótulo, monto y pie), por su rótulo. */
  const dato = (li: HTMLElement, etiqueta: string) => within(li).getByText(etiqueta).closest("div")!;
  const abrirCaja = async (quien: string) => {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^Ver el detalle de la caja de ${quien}, abrió `) }));
    });
    return screen.findByRole("dialog", { name: `Caja de ${quien}` });
  };

  it("la tarjeta dice cuánto fue en efectivo y cuánto por QR, cuánto debía haber y cuánto se contó", async () => {
    deMiguel();
    await montar();
    const kevin = cajaDe("Kevin Dueño");
    // El nombre dice cuál caja es (la misma cajera tiene una por noche) y los
    // montos se leen como descripción: un lector de pantalla no los perdía.
    const boton = within(kevin).getByRole("button", { name: /^Ver el detalle de la caja de Kevin Dueño, abrió .+/ });
    expect(boton).toHaveAccessibleDescription(/En efectivo.*Bs\s556,00.*Por QR.*Bs\s120,00/);
    expect(dato(kevin, "Vendió").textContent).toMatch(/Bs\s676,00.*14 ventas/);
    expect(dato(kevin, "En efectivo").textContent).toMatch(/Bs\s556,00.*12 cobros/);
    expect(dato(kevin, "Por QR").textContent).toMatch(/Bs\s120,00.*3 cobros/);
    expect(dato(kevin, "Cambio inicial").textContent).toMatch(/Bs\s50,00$/);
    // De dónde sale lo que debía haber: el cambio más el efectivo, sin el QR.
    expect(dato(kevin, "Debía haber").textContent).toMatch(/Bs\s606,00Bs\s50,00 \+\sBs\s556,00$/);
    expect(dato(kevin, "Efectivo contado").textContent).toMatch(/Bs\s616,00sobran Bs\s10,00$/);
    // Los rótulos que no se entendían ya no están.
    expect(within(kevin).queryByText("Abrió con")).toBeNull();
    expect(within(kevin).queryByText("Contó al cerrar")).toBeNull();
    expect(within(kevin).getByText("Ver el detalle: qué se cobró por QR y qué en efectivo")).toBeInTheDocument();
    // La que sigue abierta: lo que debería haber AHORA, y todavía no se contó.
    const pepeLi = cajaDe("Pepe Mamani");
    expect(dato(pepeLi, "Debería haber ahora").textContent).toMatch(/Bs\s200,50Bs\s100,00 \+\sBs\s100,50$/);
    expect(within(pepeLi).getByText("Sigue abierta")).toBeInTheDocument();
    // Sigue siendo sólo para mirar: la tarjeta es un botón con nombre propio.
    for (const no of [/Abrir mesa/, /^Consumo/, /Cobrar/, /Cerrar caja/, /Venta rápida/, /Anular/, /Nueva cuenta/]) {
      expect(screen.queryByRole("button", { name: no })).toBeNull();
    }
  });

  it("tocar la tarjeta abre el detalle de la caja: la cuenta del efectivo y cada QR con su venta", async () => {
    deMiguel();
    await montar();
    const d = await abrirCaja("Kevin Dueño");
    const cuenta = await within(d).findByRole("region", { name: "El efectivo de la caja" });
    expect(request.mock.calls.map((c) => c[0] as string)).toContain("/billar/supervision/caja/2");
    // La cuenta que Miguel hacía a mano y no le cerraba.
    expect(within(cuenta).getByText("Cambio inicial").closest("li")!.textContent).toMatch(/Bs\s50,00$/);
    expect(within(cuenta).getByText("Cobrado en efectivo").closest("li")!.textContent).toMatch(/\+ Bs\s556,00$/);
    expect(within(cuenta).getByText("= Debía haber").parentElement!.textContent).toMatch(/Bs\s606,00$/);
    expect(within(cuenta).getByText("Efectivo contado").closest("div")!.textContent).toMatch(/Bs\s616,00$/);
    expect(within(cuenta).getByText("Sobran").parentElement!.textContent).toMatch(/^Sobran\s*Bs\s10,00$/);
    // Lo cobrado por QR: cada cobro con su venta, lo que se vendió y de cuánto es parte.
    const qr = within(d).getByRole("region", { name: /^Cobrado por QR · Bs\s120,00$/ });
    const cobros = within(qr).getAllByRole("button");
    expect(cobros).toHaveLength(2);
    expect(cobros[0].textContent).toMatch(/V-000077 · Mesa 2/);
    expect(cobros[0].textContent).toMatch(/Tiempo 1 h 30 min · 2 × Paceña 620 ml/);
    expect(cobros[0].textContent).toMatch(/parte de Bs\s160,00/);
    expect(cobros[1].textContent).toMatch(/V-000076 · Cuenta «Juan»/);
    expect(within(cobros[1]).getByText("Adelanto")).toBeInTheDocument();
    // Lo cobró otro que la cajera de la caja: se nombra.
    expect(cobros[1].textContent).toMatch(/cobró Pepe Mamani/);
    expect(cobros[0].textContent).not.toMatch(/cobró Kevin/);
    expect(within(d).getByRole("region", { name: /^Cobrado en efectivo · Bs\s556,00$/ })).toBeInTheDocument();
    // Lo vendido abajo de las fichas, con lo pagado parte y parte.
    expect(within(d).getByText(/^Vendió Bs\s676,00 en 14 ventas · 1 pagada parte en efectivo y parte por QR$/)).toBeInTheDocument();
  });

  it("tocar un cobro muestra su venta dentro del mismo diálogo, y «Volver a la caja» vuelve", async () => {
    deMiguel();
    await montar();
    const d = await abrirCaja("Kevin Dueño");
    const qr = await within(d).findByRole("region", { name: /^Cobrado por QR/ });
    await act(async () => {
      fireEvent.click(within(qr).getAllByRole("button")[0]);
    });
    expect(await within(d).findByText("Cómo se pagó")).toBeInTheDocument();
    expect(request.mock.calls.map((c) => c[0] as string)).toContain("/billar/supervision/detalle?venta=77");
    // Un solo diálogo: con dos, Escape cerraba los dos.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(d).getByRole("heading", { name: "Detalle de venta" })).toBeInTheDocument();
    expect(within(d).getByText("V-000077 · Mesa 2 · Pool")).toBeInTheDocument();
    expect(within(d).queryByRole("region", { name: "El efectivo de la caja" })).toBeNull();
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Volver a la caja" }));
    });
    expect(within(d).getByRole("region", { name: "El efectivo de la caja" })).toBeInTheDocument();
    expect(within(d).queryByRole("heading", { name: "Detalle de venta" })).toBeNull();
  });

  it("con un servidor anterior la tarjeta se ve como antes con los rótulos nuevos, y el detalle no queda en blanco", async () => {
    // Sin `cobrado` ni `esperado`, y sin la ruta del detalle.
    servidor(supervision().cajas, (url) => {
      throw new Error(`Cannot GET ${url}`);
    });
    await montar();
    const kevin = cajaDe("Kevin Dueño");
    expect(dato(kevin, "Cambio inicial").textContent).toMatch(/Bs\s50,00$/);
    expect(dato(kevin, "Efectivo contado").textContent).toMatch(/Bs\s110,00faltan Bs\s2,00$/);
    expect(within(kevin).queryByText("En efectivo")).toBeNull();
    expect(within(kevin).queryByText("Por QR")).toBeNull();
    expect(within(kevin).queryByText("Debía haber")).toBeNull();
    const d = await abrirCaja("Kevin Dueño");
    expect(await within(d).findByText(/Cannot GET \/billar\/supervision\/caja\/2/)).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    // Lo que ya trae la lista, en vez de una caja en blanco.
    expect(within(d).getByText("Vendió").parentElement!.textContent).toMatch(/Bs\s60,00 · 1 venta/);
    expect(within(d).getByText("Diferencia").parentElement!.textContent).toMatch(/faltan Bs\s2,00/);
  });
});
