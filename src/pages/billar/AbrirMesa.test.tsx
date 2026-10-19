import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HojaCupoHost } from "../../components/ComprarCreditos";
import { ApiError } from "../../lib/api";
import { fechaNegocio } from "../../lib/agenda/horaAgenda";
import { cupoEmprendedor } from "../../test/cupoFixtures";
import type { CupoEstado } from "../../types";
import RutasBillar from "./RutasBillar";

// La primera vez se transforma todo el billar: en una máquina cargada pasa los 5 s.
vi.setConfig({ testTimeout: 60_000 });

/**
 * Plan Emprendedor (D29): abrir una mesa de billar ocupa un lugar del cupo de
 * ventas del día. Sin lugar ni créditos se ve la MISMA hoja de comprar
 * créditos que en el POS, sin cartel de error, y el contador se guarda como
 * después de una venta. Backend y sesión de mentira.
 */

const request = vi.hoisted(() => vi.fn());
const sesion = vi.hoisted(() => ({
  /** Un negocio distinto por test: el store es de módulo y se vacía al cambiar de negocio. */
  alias: "billar-cupo-0",
  cupo: undefined as import("../../types").CupoEstado | undefined,
  actualizarCupo: vi.fn(),
  refrescarCupo: vi.fn(async () => {}),
}));

vi.mock("../../lib/api", async (original) => ({
  ...(await original<typeof import("../../lib/api")>()),
  request,
  api: { getFormasPago: vi.fn(async () => []) },
}));

vi.mock("../../lib/useSucursales", () => ({
  useSucursales: () => ({ elegir: false, sucursales: [], sugerida: null }),
}));

vi.mock("../../lib/apiMonedero", () => ({
  apiMonedero: { paquetesCreditos: vi.fn(async () => []), comprarCreditos: vi.fn(), compraCreditos: vi.fn() },
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, sucursalId: null, sucursal: null, permisos: ["billar.operar", "ventas.vender"] },
    negocio: { id: 1, alias: sesion.alias, nombre: "Billar de prueba" },
    cupo: sesion.cupo,
    licencia: null,
    actualizarCupo: sesion.actualizarCupo,
    refrescarCupo: sesion.refrescarCupo,
  }),
}));

const MESA = { id: 70, numero: 7, tipo: "pool", estado: "libre" as const, libreDesde: Date.now() - 60_000 };

function tablero() {
  return {
    ahora: Date.now(),
    sucursal: { id: 1, nombre: "Principal" },
    caja: { abierta: true, id: 9, desde: Date.now() - 3_600_000, inicial: 100, sucursalId: null },
    ajustes: { avisos: [10, 5, 1], sonido: false, voz: false, pin: { anularConsumo: true, anularMesa: true, pausar: true }, tieneTokenSalon: false },
    tipos: [{ id: "pool", nombre: "Pool", tarifa: 20, fraccion: 15, tolerancia: 3, minimo: 30, paquetes: [], promos: [] }],
    mesas: [MESA],
  };
}

/** Lo que contesta el POST de abrir; por defecto, la mesa abierta sin `consumo` (Básico, Profesional). */
let alAbrir: () => Promise<unknown> = async () => abierta();

function abierta(extra: object = {}) {
  const ahora = Date.now();
  return {
    ...MESA,
    estado: "juego",
    libreDesde: undefined,
    sesion: {
      id: 500,
      version: 1,
      start: ahora,
      pausedAt: null,
      pausedTotal: 0,
      prepago: null,
      prev: null,
      tarifa: tablero().tipos[0],
      consumos: [],
      pagos: [],
    },
    ...extra,
  };
}

const abrirPedidos = () => request.mock.calls.filter((c) => String(c[0]).endsWith("/abrir"));

async function montarYAbrir() {
  render(
    <MemoryRouter initialEntries={["/billar"]}>
      <Routes>
        <Route path="/billar/*" element={<RutasBillar />} />
      </Routes>
      {/* Como en el Layout: la hoja la dibuja un solo host. */}
      <HojaCupoHost />
    </MemoryRouter>,
  );
  await act(async () => {});
  await screen.findByRole("heading", { name: /Billar/ });
  // La acción principal de una mesa libre, en su tarjeta.
  await act(async () => {
    fireEvent.click(screen.getAllByRole("button", { name: "Abrir mesa" })[0]);
  });
  return screen.getByRole("dialog", { name: /Abrir Mesa 7/ });
}

const hoja = () => screen.queryByRole("dialog", { name: "Llegaste a tus 50 ventas de hoy" });

let vuelta = 0;
beforeEach(() => {
  sesion.alias = `billar-cupo-${++vuelta}`;
  sesion.cupo = undefined;
  sesion.actualizarCupo.mockReset();
  sesion.refrescarCupo.mockClear();
  alAbrir = async () => abierta();
  request.mockReset();
  request.mockImplementation(async (url: string) => {
    if (url.startsWith("/billar/tablero")) return tablero();
    if (url.endsWith("/abrir")) return alAbrir();
    return [];
  });
});

describe("Billar: abrir una mesa con el cupo del Plan Emprendedor", () => {
  it("un 403 CUPO_AGOTADO abre la hoja de compra con el cupo del servidor, sin cartel de error", async () => {
    sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), ventas: 49, saldo: 0 });
    const delServidor = cupoEmprendedor({ fecha: fechaNegocio(), ventas: 50, saldo: 0 });
    alAbrir = async () => {
      throw new ApiError("Llegaste a tus 50 ventas de hoy y no te quedan créditos.", 403, {
        codigo: "CUPO_AGOTADO",
        unidad: "VENTA",
        cupo: delServidor,
      });
    };
    const dialogo = await montarYAbrir();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Abrir mesa y arrancar" }));
    });
    await act(async () => {});

    expect(abrirPedidos()).toHaveLength(1);
    expect(sesion.actualizarCupo).toHaveBeenCalledWith(delServidor);
    expect(hoja()).toBeInTheDocument();
    // No es una falla: el mensaje del servidor no queda en rojo en ningún lado.
    expect(screen.queryByText(/no te quedan créditos\./)).not.toBeInTheDocument();
    // Una sola capa: "Abrir Mesa 7" se cerró y queda sólo la hoja (QA del 19-oct).
    expect(screen.queryByRole("dialog", { name: /Abrir Mesa 7/ })).not.toBeInTheDocument();
  });

  it("si ya se sabe que no hay lugar ni créditos, abre la hoja sin ir al servidor y cierra el diálogo", async () => {
    sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), ventas: 50, saldo: 0 });
    const dialogo = await montarYAbrir();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Abrir mesa y arrancar" }));
    });
    expect(hoja()).toBeInTheDocument();
    expect(abrirPedidos()).toHaveLength(0);
    expect(screen.queryByRole("dialog", { name: /Abrir Mesa 7/ })).not.toBeInTheDocument();
  });

  it("«Cobrar Bs X y abrir» sin lugar: la hoja, sin pasar al cobro, y el diálogo se cierra", async () => {
    sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), ventas: 50, saldo: 0 });
    const dialogo = await montarYAbrir();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("radio", { name: /Tiempo fijo/ }));
    });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: /^Cobrar Bs.* y abrir$/ }));
    });
    expect(hoja()).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /Cobrar tiempo fijo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /Abrir Mesa 7/ })).not.toBeInTheDocument();
    expect(abrirPedidos()).toHaveLength(0);
  });

  it("con lugar, «Cobrar Bs X y abrir» pasa al cobro como siempre", async () => {
    sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), ventas: 10, saldo: 0 });
    const dialogo = await montarYAbrir();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("radio", { name: /Tiempo fijo/ }));
    });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: /^Cobrar Bs.* y abrir$/ }));
    });
    expect(screen.getByRole("dialog", { name: /Cobrar tiempo fijo · Mesa 7/ })).toBeInTheDocument();
    expect(hoja()).not.toBeInTheDocument();
  });

  it("al abrir guarda el consumo.cupo que trae la respuesta, como una venta", async () => {
    sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), ventas: 10, saldo: 0 });
    const despues: CupoEstado = cupoEmprendedor({ fecha: fechaNegocio(), ventas: 11, saldo: 0 });
    alAbrir = async () => abierta({ consumo: { unidad: "VENTA", fuente: "CUPO", creditos: 0, cupo: despues } });
    const dialogo = await montarYAbrir();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Abrir mesa y arrancar" }));
    });
    expect(abrirPedidos()).toHaveLength(1);
    expect(sesion.actualizarCupo).toHaveBeenCalledWith(despues);
    expect(hoja()).not.toBeInTheDocument();
  });

  it("sin cupo (Básico, Profesional) abre como siempre y no pide el contador", async () => {
    const dialogo = await montarYAbrir();
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Abrir mesa y arrancar" }));
    });
    expect(abrirPedidos()).toHaveLength(1);
    expect(sesion.actualizarCupo).not.toHaveBeenCalled();
    expect(sesion.refrescarCupo).not.toHaveBeenCalled();
  });
});
