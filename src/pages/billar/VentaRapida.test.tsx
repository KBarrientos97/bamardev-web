import { act, fireEvent, render, screen } from "@testing-library/react";
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
 * La venta rápida del billar es una venta del POS (`POST /ventas`) y consume
 * del cupo del Plan Emprendedor igual que el POS. QA del 19-oct: sin cupo ni
 * créditos sólo salía "Llegaste a tus 8 ventas de hoy y no te quedan
 * créditos." en rojo, sin ofrecer comprar. Ahora abre la misma hoja de compra.
 * Backend y sesión de mentira.
 */

const request = vi.hoisted(() => vi.fn());
const crearVenta = vi.hoisted(() => vi.fn());
const sesion = vi.hoisted(() => ({
  /** Un negocio distinto por test: el store es de módulo y se vacía al cambiar de negocio. */
  alias: "billar-rapida-0",
  cupo: undefined as import("../../types").CupoEstado | undefined,
  actualizarCupo: vi.fn(),
  refrescarCupo: vi.fn(async () => {}),
}));

vi.mock("../../lib/api", async (original) => ({
  ...(await original<typeof import("../../lib/api")>()),
  request,
  api: {
    getFormasPago: vi.fn(async () => [
      { id: 1, nombre: "Efectivo" },
      { id: 2, nombre: "QR" },
    ]),
    crearVenta,
  },
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
    negocio: { id: 1, alias: sesion.alias, nombre: "Billar de prueba", tipoNegocio: "BILLAR", features: ["pos", "billar"] },
    cupo: sesion.cupo,
    licencia: null,
    actualizarCupo: sesion.actualizarCupo,
    refrescarCupo: sesion.refrescarCupo,
  }),
}));

function tablero() {
  return {
    ahora: Date.now(),
    sucursal: { id: 1, nombre: "Principal" },
    caja: { abierta: true, id: 9, desde: Date.now() - 3_600_000, inicial: 100, sucursalId: null },
    ajustes: { avisos: [10, 5, 1], sonido: false, voz: false, pin: { anularConsumo: true, anularMesa: true, pausar: true }, tieneTokenSalon: false },
    tipos: [{ id: "pool", nombre: "Pool", tarifa: 20, fraccion: 15, tolerancia: 3, minimo: 30, paquetes: [], promos: [] }],
    mesas: [],
  };
}

const SODA = { id: 5, nombre: "Soda", precio: 10, categoria: "Bebidas", stock: 20 };

/** La venta que devuelve el POST, con el pago tal como se mandó. */
function venta(extra: object = {}) {
  return { id: 300, comprobante: "V-300", total: 10, pagos: [{ formaPagoId: 1, monto: 10 }], ...extra };
}

/** Un cupo de 8 ventas, como el negocio de la prueba en QA. */
const cupo = (ventas: number, saldo = 0): CupoEstado =>
  cupoEmprendedor({ fecha: fechaNegocio(), limiteVentas: 8, ventas, saldo });

const hoja = () => screen.queryByRole("dialog", { name: "Llegaste a tus 8 ventas de hoy" });

async function montarConUnaSoda() {
  render(
    <MemoryRouter initialEntries={["/billar/venta-rapida"]}>
      <Routes>
        <Route path="/billar/*" element={<RutasBillar />} />
      </Routes>
      {/* Como en el Layout: la hoja la dibuja un solo host. */}
      <HojaCupoHost />
    </MemoryRouter>,
  );
  await act(async () => {});
  const producto = await screen.findByRole("button", { name: /^Soda, / });
  await act(async () => {
    fireEvent.click(producto);
  });
  // Sin pantalla ancha (jsdom), el pedido es la hoja de abajo.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Ver pedido" }));
  });
}

async function irAlCobro() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^Cobrar Bs/ }));
  });
}

async function cobrarJusto() {
  await irAlCobro();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Justo" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^Confirmar venta/ }));
  });
  await act(async () => {});
}

let vuelta = 0;
beforeEach(() => {
  sesion.alias = `billar-rapida-${++vuelta}`;
  sesion.cupo = undefined;
  sesion.actualizarCupo.mockReset();
  sesion.refrescarCupo.mockClear();
  crearVenta.mockReset();
  crearVenta.mockImplementation(async () => venta());
  request.mockReset();
  request.mockImplementation(async (url: string) => {
    if (url.startsWith("/billar/tablero")) return tablero();
    if (url.startsWith("/billar/productos")) return [SODA];
    return [];
  });
});

describe("Billar: la venta rápida con el cupo del Plan Emprendedor", () => {
  it("un 403 CUPO_AGOTADO abre la hoja de compra con el cupo del servidor, sin el cartel rojo", async () => {
    sesion.cupo = cupo(7);
    const delServidor = cupo(8);
    crearVenta.mockRejectedValue(
      new ApiError("Llegaste a tus 8 ventas de hoy y no te quedan créditos.", 403, {
        codigo: "CUPO_AGOTADO",
        unidad: "VENTA",
        cupo: delServidor,
      }),
    );
    await montarConUnaSoda();
    await cobrarJusto();

    expect(crearVenta).toHaveBeenCalledTimes(1);
    expect(sesion.actualizarCupo).toHaveBeenCalledWith(delServidor);
    expect(hoja()).toBeInTheDocument();
    expect(screen.queryByText("Llegaste a tus 8 ventas de hoy y no te quedan créditos.")).not.toBeInTheDocument();
    // El cobro queda armado para reintentar después de comprar.
    expect(screen.getByRole("button", { name: /^Confirmar venta/ })).toBeInTheDocument();
  });

  it("si ya se sabe que no hay lugar ni créditos, «Cobrar» abre la hoja sin pasar al cobro", async () => {
    sesion.cupo = cupo(8);
    await montarConUnaSoda();
    await irAlCobro();
    expect(hoja()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Confirmar venta/ })).not.toBeInTheDocument();
    expect(crearVenta).not.toHaveBeenCalled();
  });

  it("con lugar vende y guarda el consumo.cupo que trae la respuesta", async () => {
    sesion.cupo = cupo(3);
    const despues = cupo(4);
    crearVenta.mockImplementation(async () =>
      venta({ consumo: { unidad: "VENTA", fuente: "CUPO", creditos: 0, cupo: despues } }),
    );
    await montarConUnaSoda();
    await cobrarJusto();
    expect(crearVenta).toHaveBeenCalledTimes(1);
    expect(sesion.actualizarCupo).toHaveBeenCalledWith(despues);
    expect(hoja()).not.toBeInTheDocument();
  });

  it("sin cupo (Básico, Profesional) vende como siempre y no pide el contador", async () => {
    await montarConUnaSoda();
    await cobrarJusto();
    expect(crearVenta).toHaveBeenCalledTimes(1);
    expect(sesion.actualizarCupo).not.toHaveBeenCalled();
    expect(sesion.refrescarCupo).not.toHaveBeenCalled();
    expect(hoja()).not.toBeInTheDocument();
  });
});
