import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto, Venta } from "../../types";
import type { PlataDelCambio } from "./cambioDeVenta";

/**
 * El POS cuando se modifica una venta ya cobrada (15-nov): las pantallas son
 * de mentira; lo que se prueba es lo que decide el propio POS. Que el cambio
 * se abra con el catálogo recién pedido (el stock y los precios de ahora), que
 * al guardar el recibo salga como el de una venta recién cobrada —el cliente
 * se lleva el papel nuevo y la cocina la comanda nueva— diciendo qué hacer con
 * la plata, y que ese aviso no se le pegue a otro recibo.
 */

vi.mock("../../store/AuthContext", async () => {
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({
      negocio: { id: 1, nombre: "Pollería", features: ["pos", "caja"] },
      usuario: { id: 1, username: "caja", rol: "CAJERO", ...permisosDe("CAJERO") },
      rubro: "RESTAURANTE",
      incluye: () => true,
      puede: () => false,
      cupo: undefined,
      licencia: null,
      actualizarCupo: vi.fn(),
      refrescarCupo: vi.fn(async () => {}),
    }),
  };
});

vi.mock("../../lib/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(mensaje: string, status = 500) {
      super(mensaje);
      this.status = status;
    }
  },
  USER_KEY: "usuario",
  NEGOCIO_KEY: "negocio",
  api: {
    cajaActual: vi.fn(async () => ({
      caja: { id: 3, almacenId: 1, almacen: null, fechaApertura: "2026-11-15T12:00:00.000Z", montoApertura: 100 },
    })),
    getProductos: vi.fn(),
    getCategorias: vi.fn(async () => []),
    getFormasPago: vi.fn(async () => [{ id: 1, nombre: "Efectivo" }]),
    getRepartidores: vi.fn(async () => []),
    mesasPorCobrar: vi.fn(async () => []),
    entregasMesero: vi.fn(async () => null),
    crearVenta: vi.fn(),
  },
}));

vi.mock("../../lib/apiMonedero", () => ({
  apiMonedero: { paquetesCreditos: vi.fn(), comprarCreditos: vi.fn(), compraCreditos: vi.fn() },
}));
vi.mock("../../lib/agenda/apiConfigAgenda", () => ({ apiConfigAgenda: { recursos: vi.fn(async () => []) } }));
vi.mock("../../lib/agenda/apiAgenda", () => ({
  apiAgenda: { hoy: vi.fn(async () => ({ citas: [] })), carrito: vi.fn() },
  mensajeDe: (_e: unknown, d: string) => d,
}));

const VENTA = {
  id: 7,
  comprobante: "V-000007",
  estado: "APROBADO",
  total: 51,
  cajaId: 3,
  tipoPedido: "LOCAL",
  detalles: [],
  pagos: [],
} as unknown as Venta;
const MODIFICADA = { ...VENTA, total: 46, vecesModificada: 1 } as Venta;
const PLATA: PlataDelCambio = { diferencia: -5, devolucion: { formaPagoId: 1, nombre: "Efectivo", saleDelCajon: true } };

// La lista del turno: deja pedir el cambio de una venta y reabrir un comprobante.
vi.mock("./PantallaHistorial", () => ({
  default: (props: { onModificar?: (v: Venta) => void; onVerComprobante: (v: Venta) => void }) => (
    <div>
      <p>ventas del turno</p>
      <p>{props.onModificar ? "ofrece modificar" : "no ofrece modificar"}</p>
      <button onClick={() => props.onModificar?.(VENTA)}>modificar la 7</button>
      <button onClick={() => props.onVerComprobante(MODIFICADA)}>ver el comprobante de la 7</button>
    </div>
  ),
}));

// El cambio: dice con qué venta y qué catálogo se abrió, y deja guardar o cancelar.
vi.mock("./ModificarVenta", () => ({
  default: (props: {
    venta: Venta;
    productos: Producto[];
    sucursalId?: number | null;
    onCancelar: () => void;
    onModificada: (v: Venta, plata: PlataDelCambio) => void;
  }) => (
    <div>
      <p>
        modificando {props.venta.comprobante} con {props.productos.map((p) => `${p.nombre} (${p.stockTotal})`).join(", ")} en
        la sucursal {props.sucursalId}
      </p>
      <button onClick={() => props.onModificada(MODIFICADA, PLATA)}>guardar el cambio</button>
      <button onClick={props.onCancelar}>cancelar el cambio</button>
    </div>
  ),
}));

vi.mock("./PantallaRecibo", () => ({
  default: (props: { venta: Venta; reimpresion?: boolean; modificada?: PlataDelCambio | null; onHistorial: () => void }) => (
    <div>
      <p>
        recibo de {props.venta.comprobante} por {props.venta.total} · {props.reimpresion ? "reimpresión" : "recién cobrada"} ·{" "}
        {props.modificada ? `modificada, diferencia ${props.modificada.diferencia}` : "sin aviso"}
      </p>
      <button onClick={props.onHistorial}>al historial</button>
    </div>
  ),
}));

vi.mock("./PantallaVenta", () => ({ default: (props: { cabecera?: ReactNode }) => <div>{props.cabecera}</div> }));
vi.mock("./PantallaCobro", () => ({ default: () => <p>cobro</p> }));
vi.mock("./PantallaCierre", () => ({ default: () => <p>cierre de caja</p>, CierreOk: () => null }));

import { api } from "../../lib/api";
import Pos from "./Pos";

const coca = (stockTotal: number) =>
  ({ id: 2, nombre: "Coca Cola 3L", precio: 23, tipoProducto: "ALMACENABLE", stockTotal, habilitado: true, componentes: [] }) as unknown as Producto;

/** El POS en «Caja»: la lista del turno. */
async function montar() {
  render(
    <MemoryRouter initialEntries={["/pos/caja"]}>
      <Pos />
    </MemoryRouter>,
  );
  await act(async () => {});
  await act(async () => {});
}

const tocar = async (nombre: string) => {
  fireEvent.click(screen.getByRole("button", { name: nombre }));
  await act(async () => {});
  await act(async () => {});
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.mocked(api.getProductos).mockResolvedValue([coca(9)]);
});

describe("El POS al modificar una venta ya cobrada", () => {
  it("la lista del turno ofrece el cambio, y se abre con el catálogo recién pedido", async () => {
    await montar();
    expect(screen.getByText("ofrece modificar")).toBeInTheDocument();
    expect(api.getProductos).toHaveBeenCalledTimes(1);
    // Entre que abrió el POS y ahora se vendieron dos más: el cambio tiene que ver las 7 de ahora.
    vi.mocked(api.getProductos).mockResolvedValue([coca(7)]);
    await tocar("modificar la 7");
    expect(api.getProductos).toHaveBeenCalledTimes(2);
    expect(screen.getByText("modificando V-000007 con Coca Cola 3L (7) en la sucursal 1")).toBeInTheDocument();
  });

  it("al guardar, el recibo sale como el de una venta recién cobrada y dice qué hacer con la plata", async () => {
    await montar();
    await tocar("modificar la 7");
    await tocar("guardar el cambio");
    // No es una reimpresión: el cliente se lleva el recibo nuevo y la cocina la comanda nueva.
    expect(screen.getByText("recibo de V-000007 por 46 · recién cobrada · modificada, diferencia -5")).toBeInTheDocument();
    // El stock cambió (lo que salió volvió, lo que entró bajó): el catálogo se pide otra vez.
    expect(api.getProductos).toHaveBeenCalledTimes(3);
  });

  it("cancelar vuelve a la lista del turno sin guardar nada", async () => {
    await montar();
    await tocar("modificar la 7");
    await tocar("cancelar el cambio");
    expect(screen.getByText("ventas del turno")).toBeInTheDocument();
    expect(screen.queryByText(/^recibo de/)).not.toBeInTheDocument();
  });

  it("reabrir después el comprobante de esa venta ya no lleva el aviso de la plata", async () => {
    await montar();
    await tocar("modificar la 7");
    await tocar("guardar el cambio");
    await tocar("al historial");
    await tocar("ver el comprobante de la 7");
    // La cajera ya devolvió la plata: decírselo otra vez la haría devolver dos veces.
    expect(screen.getByText("recibo de V-000007 por 46 · reimpresión · sin aviso")).toBeInTheDocument();
  });

  it("mientras llega el catálogo no abre el cambio con el de antes", async () => {
    await montar();
    let llego: (p: Producto[]) => void = () => {};
    vi.mocked(api.getProductos).mockReturnValue(new Promise<Producto[]>((ok) => (llego = ok)));
    await tocar("modificar la 7");
    expect(screen.queryByText(/^modificando/)).not.toBeInTheDocument();
    expect(screen.getByText("Cargando el catálogo…")).toBeInTheDocument();
    await act(async () => llego([coca(4)]));
    expect(screen.getByText("modificando V-000007 con Coca Cola 3L (4) en la sucursal 1")).toBeInTheDocument();
  });
});
