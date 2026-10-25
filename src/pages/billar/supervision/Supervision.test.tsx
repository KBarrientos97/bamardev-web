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
const caja = vi.hoisted(() => ({ crear: vi.fn(), anular: vi.fn() }));
const sesion = vi.hoisted(() => ({ alias: "billar-sup-0", movimientos: true }));

vi.mock("../../../lib/api", async (original) => {
  const real = await original<typeof import("../../../lib/api")>();
  return {
    ...real,
    request,
    // Lo de la caja del POS: `api` llama a su propio `request`, no al de arriba.
    api: { ...real.api, crearMovimientoCaja: caja.crear, anularCenaCaja: caja.anular },
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

  it("anular una cena pide confirmar y la anula en esa caja", async () => {
    conEfectivo(efectivo());
    await montar();
    await act(async () => {
      fireEvent.click(within(tarjeta()).getByRole("button", { name: /Anular la cena de/ }));
    });
    const confirmar = await screen.findByRole("dialog");
    expect(within(confirmar).getByText(/no se borra/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(confirmar).getByRole("button", { name: "Anular la cena" }));
    });
    expect(caja.anular).toHaveBeenCalledWith(1, 7);
  });

  it("una cena anulada se ve tachada y ya no se puede anular otra vez", async () => {
    conEfectivo(
      efectivo({
        esperado: 165,
        movimientos: [
          { id: 7, tipo: "EGRESO", monto: 20, texto: "Cena", cena: true, anulada: true, quien: "Kevin Dueño", hora: AHORA - 10 * MIN },
          { id: 8, tipo: "INGRESO", monto: 20, texto: "Cena anulada · #7", cena: true, anulaA: 7, quien: "Kevin Dueño", hora: AHORA - 5 * MIN },
        ],
      }),
      false,
    );
    await montar();
    const t = tarjeta();
    expect(within(t).getByText("Anulada")).toBeInTheDocument();
    expect(within(t).getByText("Cena anulada")).toBeInTheDocument();
    expect(within(t).queryByRole("button", { name: /Anular la cena de/ })).toBeNull();
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
