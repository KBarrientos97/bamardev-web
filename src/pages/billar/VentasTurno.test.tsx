import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RutasBillar from "./RutasBillar";

// La primera vez se transforma todo el billar: en una máquina cargada pasa los 5 s.
vi.setConfig({ testTimeout: 60_000 });

/**
 * "Ventas" del billar con una cajera (sin `autorizar.pin`): anular desde la
 * fila y corregir el medio de pago (QA del dueño, 23-oct). Backend y sesión de
 * mentira.
 */

const request = vi.hoisted(() => vi.fn());
const anularVenta = vi.hoisted(() => vi.fn());
const sesion = vi.hoisted(() => ({ alias: "billar-ventas-0" }));

vi.mock("../../lib/api", async (original) => ({
  ...(await original<typeof import("../../lib/api")>()),
  request,
  api: {
    getFormasPago: vi.fn(async () => [
      { id: 1, nombre: "Efectivo" },
      { id: 2, nombre: "QR" },
    ]),
    anularVenta,
  },
}));

vi.mock("../../lib/useSucursales", () => ({
  useSucursales: () => ({ elegir: false, sucursales: [], sugerida: null }),
}));

// Los permisos de la cajera de un billar: pide anular, pero no autoriza con su PIN.
vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 7, sucursalId: null, sucursal: null, permisos: ["billar.operar", "ventas.vender", "ventas.anular"] },
    negocio: { id: 1, alias: sesion.alias, nombre: "Billar de prueba", tipoNegocio: "BILLAR", features: ["pos", "billar"] },
    licencia: null,
  }),
}));

function tablero() {
  return {
    ahora: Date.now(),
    sucursal: { id: 1, nombre: "Principal" },
    caja: { abierta: true, id: 9, desde: Date.now() - 3_600_000, inicial: 0, sucursalId: null },
    ajustes: { avisos: [10, 5, 1], sonido: false, voz: false, pin: { anularConsumo: true, anularMesa: true, pausar: true }, tieneTokenSalon: false },
    tipos: [{ id: "pool", nombre: "Pool", tarifa: 20, fraccion: 15, tolerancia: 3, minimo: 30, paquetes: [], promos: [] }],
    mesas: [],
  };
}

/** Una venta de una cuenta abierta: un encendedor de Bs 5, cobrado como diga `metodo`. */
function venta(metodo: "Efectivo" | "QR", anulada = false) {
  const hora = Date.now() - 60_000;
  return {
    id: 300,
    codigo: "V-000003",
    hora,
    cajero: "Cajera Prueba",
    origen: "cuenta",
    cuenta: "m1",
    tiempoMin: 0,
    tiempoBs: 0,
    items: [{ productoId: 5, nombre: "ENCENDEDOR", precio: 5, cant: 1 }],
    consumosBs: 5,
    total: 5,
    pagos: [{ id: "p1", hora, metodo, monto: 5 }],
    ...(anulada ? { anulada: { hora: Date.now(), quien: "admin", motivo: "Cobro duplicado" } } : {}),
  };
}

let ventas: ReturnType<typeof venta>[] = [];
const corregir = vi.fn();

let vuelta = 0;
beforeEach(() => {
  sesion.alias = `billar-ventas-${++vuelta}`;
  ventas = [venta("QR")];
  corregir.mockReset();
  corregir.mockImplementation(() => ({ corregida: true }));
  anularVenta.mockReset();
  request.mockReset();
  request.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
    if (url.startsWith("/billar/tablero")) return tablero();
    if (url === "/billar/ventas/300/pagos") return corregir(JSON.parse(init?.body ?? "{}"));
    if (url.startsWith("/billar/ventas")) return ventas;
    return [];
  });
});

async function montarVentas() {
  render(
    <MemoryRouter initialEntries={["/billar/ventas"]}>
      <Routes>
        <Route path="/billar/*" element={<RutasBillar />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
  await screen.findAllByText("V-000003");
}

async function tocar(nombre: string | RegExp, dentro: HTMLElement = document.body) {
  await act(async () => {
    fireEvent.click(within(dentro).getByRole("button", { name: nombre }));
  });
}

/** El medio de pago es un grupo de radios ("Método de pago"). */
async function elegir(medio: string, dentro: HTMLElement) {
  await act(async () => {
    fireEvent.click(within(dentro).getByRole("radio", { name: medio }));
  });
}

const dialogo = () => screen.queryByRole("dialog");

describe("Billar: Ventas del turno", () => {
  it("cancelar «Anular» desde la lista vuelve a la lista, sin abrir el detalle de la venta", async () => {
    // QA del 23-oct: el detalle se abría debajo del PIN y, al cancelar,
    // quedaba a la vista una venta que nadie había pedido ver.
    await montarVentas();
    await tocar("Anular");
    expect(within(dialogo()!).getByText("Anular venta V-000003 · Bs 5,00")).toBeInTheDocument();
    await tocar("Cancelar", dialogo()!);
    expect(dialogo()).toBeNull();
  });

  it("la X también vuelve a la lista", async () => {
    await montarVentas();
    await tocar("Anular");
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(dialogo()).toBeNull();
  });

  it("anulada desde la lista, se ve el detalle que dice «Anulada»", async () => {
    anularVenta.mockImplementation(async () => {
      ventas = [venta("QR", true)];
    });
    await montarVentas();
    await tocar("Anular");
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Usuario del encargado"), { target: { value: "admin" } });
      fireEvent.change(screen.getByLabelText("PIN del encargado"), { target: { value: "1234" } });
    });
    await tocar("Autorizar", dialogo()!);
    await act(async () => {});
    expect(anularVenta).toHaveBeenCalledWith(300, expect.objectContaining({ autorizadorUsername: "admin", autorizadorPin: "1234" }));
    expect(within(dialogo()!).getByText(/^Anulada/)).toBeInTheDocument();
  });

  it("la cajera no corrige el medio de pago sola: lo firma un encargado, también de QR a efectivo", async () => {
    // QA del 23-oct: de QR a efectivo pasaba sólo con el motivo.
    await montarVentas();
    await tocar("Ver");
    await tocar("Corregir pago", dialogo()!);
    const d = dialogo()!;
    expect(within(d).getByText("Esto necesita el PIN de un encargado.")).toBeInTheDocument();
    await elegir("Efectivo", d);
    await tocar(/^Justo/, d);
    const autorizar = within(d).getByRole("button", { name: "Autorizar" });
    expect(autorizar).toBeDisabled();
    await act(async () => {
      fireEvent.change(within(d).getByLabelText("Usuario del encargado"), { target: { value: "admin" } });
      fireEvent.change(within(d).getByLabelText("PIN del encargado"), { target: { value: "1234" } });
    });
    expect(autorizar).toBeEnabled();
    await tocar("Autorizar", d);
    expect(corregir).toHaveBeenCalledWith(
      expect.objectContaining({
        autorizadorUsername: "admin",
        autorizadorPin: "1234",
        pagos: [{ formaPagoId: 1, monto: 5, recibido: 5 }],
      }),
    );
  });

  it("elegir el medio con que ya figura no habilita nada: no hay qué firmar", async () => {
    ventas = [venta("Efectivo")];
    await montarVentas();
    await tocar("Ver");
    await tocar("Corregir pago", dialogo()!);
    const d = dialogo()!;
    await elegir("Efectivo", d);
    await tocar(/^Justo/, d);
    await act(async () => {
      fireEvent.change(within(d).getByLabelText("Usuario del encargado"), { target: { value: "admin" } });
      fireEvent.change(within(d).getByLabelText("PIN del encargado"), { target: { value: "1234" } });
    });
    expect(within(d).getByText("Así ya figura la venta: no hay nada que corregir.")).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: "Autorizar" })).toBeDisabled();
    expect(corregir).not.toHaveBeenCalled();
  });
});
