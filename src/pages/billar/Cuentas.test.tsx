import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RutasBillar from "./RutasBillar";
import { leerBillar } from "./store";

// La primera vez se transforma todo el billar: en una máquina cargada pasa los 5 s.
vi.setConfig({ testTimeout: 60_000 });

/**
 * Las cuentas abiertas del billar (21-oct): gente que se sienta a tomar sin
 * jugar. En el tablero, la pestaña "Cuentas": abrirla con un nombre, cobrar de
 * a poco y al final el saldo. Backend y sesión de mentira: lo que se mira es
 * lo que ve el cajero y lo que se le manda al backend.
 */

const request = vi.hoisted(() => vi.fn());
const servidor = vi.hoisted(() => ({ cuentas: [] as unknown[] }));
/** Un negocio distinto por test: el store es de módulo y se vacía al cambiar de negocio. */
const sesion = vi.hoisted(() => ({ alias: "billar-cuentas-0" }));

vi.mock("../../lib/api", async (original) => ({
  ...(await original<typeof import("../../lib/api")>()),
  request,
  api: {
    getFormasPago: vi.fn(async () => [
      { id: 1, nombre: "Efectivo" },
      { id: 2, nombre: "QR" },
    ]),
  },
}));

vi.mock("../../lib/useSucursales", () => ({
  useSucursales: () => ({ elegir: false, sucursales: [], sugerida: null }),
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, sucursalId: null, sucursal: null, permisos: ["billar.operar", "ventas.vender"] },
    negocio: { alias: sesion.alias, nombre: "Billar de prueba" },
  }),
}));

const AHORA = Date.now();

/** Una cuenta como la manda el backend: 4 Paceña (Bs 60) y Bs 40 ya cobrados. */
function cuentaJuan(extra: { estado?: string; consumos?: unknown[]; pagos?: unknown[] } = {}) {
  return {
    id: 77,
    nombre: "Mesa de afuera",
    sucursalId: 1,
    estado: extra.estado ?? "abierta",
    sesion: {
      id: 77,
      version: 3,
      start: AHORA - 90 * 60_000,
      abierta: AHORA - 90 * 60_000,
      pausedAt: null,
      pausedTotal: 0,
      pausas: [],
      prepago: null,
      prev: null,
      tarifa: { id: "cuenta", codigo: "cuenta", nombre: "Cuenta", tarifa: 0, fraccion: 15, tolerancia: 0, minimo: 0, paquetes: [], promos: [] },
      consumos: extra.consumos ?? [
        { id: 1, productoId: 5, nombre: "Paceña 620 ml", precio: 15, cant: 4, hora: AHORA - 80 * 60_000, anulado: false },
      ],
      pagos: extra.pagos ?? [
        { id: 9, hora: AHORA - 30 * 60_000, formaPagoId: 1, metodo: "Efectivo", monto: 40, recibido: 50, concepto: "ADELANTO", cajaId: 9, cobradoPor: "Pepe" },
      ],
      pagado: 40,
    },
  };
}

function tablero() {
  return {
    ahora: Date.now(),
    sucursal: { id: 1, nombre: "Principal" },
    caja: { abierta: true, id: 9, desde: Date.now() - 3_600_000, inicial: 100, sucursalId: null },
    ajustes: { avisos: [10, 5, 1], sonido: false, voz: false, pin: { anularConsumo: true, anularMesa: true, pausar: true }, tieneTokenSalon: false },
    tipos: [{ id: "pool", nombre: "Pool", tarifa: 20, fraccion: 15, tolerancia: 3, minimo: 30, paquetes: [], promos: [] }],
    mesas: [],
    cuentas: servidor.cuentas,
  };
}

/** [url, cuerpo] de los POST que se le mandaron al backend. */
const enviados = () =>
  request.mock.calls
    .filter((c) => (c[1] as { method?: string } | undefined)?.method === "POST")
    .map((c) => [c[0] as string, JSON.parse((c[1] as { body: string }).body) as Record<string, unknown>] as const);

async function montar(ruta = "/billar?ver=cuentas") {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/billar/*" element={<RutasBillar />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
  await screen.findByRole("heading", { name: /Billar/ });
}

let vuelta = 0;
beforeEach(() => {
  sesion.alias = `billar-cuentas-${++vuelta}`;
  servidor.cuentas = [];
  request.mockReset();
  request.mockImplementation(async (url: string) => {
    if (url.startsWith("/billar/tablero")) return tablero();
    if (url === "/billar/cuentas") return { ...cuentaJuan({ consumos: [], pagos: [] }), id: 88, nombre: "Barra" };
    if (url === "/billar/cuentas/77/cerrar") return { venta: { id: 500, comprobante: "V-000500" }, cuenta: cuentaJuan({ estado: "cerrada" }) };
    if (url === "/billar/cuentas/77/pagos") return cuentaJuan();
    return [];
  });
  localStorage.clear();
});

describe("Billar: las cuentas abiertas", () => {
  it("la pestaña Cuentas muestra la cuenta con su total y lo que falta, y arriba suma con las mesas", async () => {
    servidor.cuentas = [cuentaJuan()];
    await montar("/billar");
    // Por defecto se ven las mesas; la pestaña dice cuántas cuentas hay.
    expect(screen.getByRole("radio", { name: "Cuentas · 1" })).toHaveAttribute("aria-checked", "false");
    // "Cuentas abiertas" y "Por cobrar" ya cuentan la cuenta (Bs 60 y Bs 20).
    expect(screen.getByText("0 mesas y 1 cuenta")).toBeInTheDocument();
    expect(screen.getByText("Bs 60,00")).toBeInTheDocument();
    expect(screen.getByText("Bs 20,00")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "Cuentas · 1" }));
    });
    const tarjeta = screen.getByRole("button", { name: "Mesa de afuera" }).closest("article")!;
    expect(within(tarjeta).getByText("Bs 60,00")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Bs 20,00")).toBeInTheDocument();
    // Las cuentas no tienen los filtros de las mesas (En juego, Pausadas…).
    expect(screen.queryByRole("button", { name: /Pausadas/ })).toBeNull();
  });

  it("«Nueva cuenta» pide sólo el nombre, la abre en el local del tablero y muestra su panel", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Nueva cuenta/ }));
    });
    const abrir = screen.getByRole("button", { name: "Abrir cuenta" });
    // Una letra no alcanza: así no se distingue en el tablero.
    fireEvent.change(screen.getByPlaceholderText(/Mesa de afuera, Juan, Barra/), { target: { value: "B" } });
    expect(abrir).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Mesa de afuera, Juan, Barra/), { target: { value: "  Barra  " } });
    await act(async () => {
      fireEvent.click(abrir);
    });
    const [url, cuerpo] = enviados().find(([u]) => u === "/billar/cuentas")!;
    expect(url).toBe("/billar/cuentas");
    expect(cuerpo).toMatchObject({ nombre: "Barra", sucursalId: 1 });
    expect(typeof cuerpo.clienteRequestId).toBe("string");
    // Queda elegida: su panel ofrece cargarle consumo y dice que no hay nada.
    expect(await screen.findByRole("heading", { name: "Barra" })).toBeInTheDocument();
    expect(screen.getByText("Sin consumos todavía.")).toBeInTheDocument();
    // Sin nada cargado no hay qué cobrar: se anula.
    expect(screen.getByRole("button", { name: "Cerrar cuenta" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Anular cuenta/ })).toBeInTheDocument();
  });

  it("un cobro parcial dice el saldo de la cuenta y manda lo que se cobra", async () => {
    servidor.cuentas = [cuentaJuan()];
    await montar("/billar?ver=cuentas&cuenta=77");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Registrar cobro" }));
    });
    expect(screen.getByText("Saldo de la cuenta: Bs 20,00.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Monto a pagar ahora"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /^Justo/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Registrar Bs 10,00" }));
    });
    const [, cuerpo] = enviados().find(([u]) => u === "/billar/cuentas/77/pagos")!;
    expect(cuerpo).toMatchObject({ pagos: [{ formaPagoId: 1, monto: 10 }] });
  });

  it("cobrar y cerrar manda el saldo con el total que vio el cajero, y la cuenta sale del tablero", async () => {
    servidor.cuentas = [cuentaJuan()];
    await montar("/billar?ver=cuentas&cuenta=77");
    // Con consumos no se ofrece anularla: se cobra.
    expect(screen.queryByRole("button", { name: /Anular cuenta/ })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cobrar Bs 20,00 y cerrar" }));
    });
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText("4× Paceña 620 ml")).toBeInTheDocument();
    expect(within(dialogo).getByText("− Bs 40,00")).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Justo/ }));
    servidor.cuentas = [];
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Cobrar Bs 20,00 y cerrar" }));
    });
    const [, cuerpo] = enviados().find(([u]) => u === "/billar/cuentas/77/cerrar")!;
    expect(cuerpo).toMatchObject({ totalEsperado: 60, pagos: [{ formaPagoId: 1, monto: 20 }] });
    expect(typeof cuerpo.clienteRequestId).toBe("string");
    // El aviso verde (lo dibuja el Layout) con el ticket a mano.
    expect(leerBillar().toasts.at(-1)).toMatchObject({
      tono: "verde",
      titulo: "Venta V-000500 completada · Cuenta «Mesa de afuera» cobrada",
      texto: "Cambio Bs 0,00",
      accion: { tipo: "ticket", codigo: "V-000500" },
    });
    expect(screen.queryByRole("heading", { name: "Mesa de afuera" })).toBeNull();
  });
});
