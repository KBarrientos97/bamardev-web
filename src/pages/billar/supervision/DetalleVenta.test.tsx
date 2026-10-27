import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DetalleSupervisionApi, VentaApi } from "../api";
import { ContenidoDetalleVenta, ModalDetalleVenta } from "./DetalleVenta";
import { cuandoSeCobro, lugarDeVenta, subtituloVenta, textoJuego } from "./DetalleVenta.datos";

vi.setConfig({ testTimeout: 60_000 });

/**
 * El "Detalle de venta" del billar (26-oct): lo abren Supervisión y Reportes.
 * Lo que se mira es "Cómo se pagó": cada pago con su medio a la vista y la
 * hora en que entró de verdad. Un adelanto por QR de las 21:30 figuraba a la
 * hora de la venta (23:11) y Miguel no lo encontraba en el banco.
 */

const request = vi.hoisted(() => vi.fn());

vi.mock("../../../lib/api", async (original) => {
  const real = await original<typeof import("../../../lib/api")>();
  return { ...real, request };
});

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({ usuario: { id: 1, permisos: ["billar.admin"] }, negocio: { alias: "billar-detalle", nombre: "Billar" } }),
}));

const H = (h: number, m: number) => new Date(2026, 9, 24, h, m).getTime();
const AHORA = new Date(2026, 9, 28, 12, 0).getTime();

const VENTA: VentaApi = {
  id: 10,
  codigo: "V-000010",
  hora: H(23, 11),
  cajero: "Flavia Suarez",
  origen: "mesa",
  mesaId: 1,
  tipoMesa: "pool",
  tipoNombre: "Pool",
  tiempoMin: 125,
  tiempoBs: 62.5,
  items: [{ productoId: 1, nombre: "Paceña", precio: 15, cant: 3 }],
  consumosBs: 45,
  total: 107.5,
  juego: { desde: H(21, 5), hasta: H(23, 10) },
  pagos: [
    // El adelanto por QR, a su hora de verdad, y el saldo en efectivo al cerrar.
    { id: "1", hora: H(23, 11), metodo: "QR", monto: 50, previo: { hora: H(21, 30), concepto: "ADELANTO", por: "Flavia Suarez" } },
    { id: "2", hora: H(23, 11), metodo: "Efectivo", monto: 57.5 },
  ],
  recibido: 60,
  cambio: 2.5,
};

const detalle = (v: VentaApi | null = VENTA): DetalleSupervisionApi => ({
  abierta: false,
  sesionId: 900,
  venta: v,
  historial: [{ id: "ev1", hora: H(21, 5), quien: "Flavia Suarez", texto: "Abrió la mesa en tiempo libre", codigo: "ABRIR" }],
});

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async () => detalle());
});

async function abrir(v: VentaApi = VENTA) {
  request.mockImplementation(async () => detalle(v));
  render(<ModalDetalleVenta consulta={{ venta: v.id }} ahora={AHORA} onClose={() => {}} />);
  await act(async () => {});
  const d = screen.getByRole("dialog", { name: "Detalle de venta" });
  await within(d).findByText("Cómo se pagó");
  return d;
}

describe("Detalle de venta: cómo se pagó", () => {
  it("se llama «Detalle de venta», con el comprobante, la mesa y su tipo", async () => {
    const d = await abrir();
    expect(request).toHaveBeenCalledWith("/billar/supervision/detalle?venta=10");
    expect(within(d).getByText("V-000010 · Mesa 1 · Pool")).toBeInTheDocument();
    expect(within(d).getByText("de 21:05 a 23:10")).toBeInTheDocument();
    expect(within(d).getByText("3 × Paceña")).toBeInTheDocument();
  });

  it("el adelanto por QR va con su hora real y quién lo cobró; el saldo en efectivo, al cobrar", async () => {
    const d = await abrir();
    const qr = within(d).getByText("Adelanto · Sáb 24/10 21:30 · cobró Flavia Suarez");
    expect(qr.parentElement!.textContent).toMatch(/QR.*Bs\s50,00/);
    const efectivo = within(d).getByText("Al cobrar · Sáb 24/10 23:11");
    expect(efectivo.parentElement!.textContent).toMatch(/Efectivo.*Bs\s57,50/);
    // Le dieron y el cambio, como siempre.
    expect(within(d).getByText("Le dieron")).toBeInTheDocument();
  });

  it("con dos medios, arriba lo que fue por cada uno", async () => {
    const d = await abrir();
    const resumen = within(d).getByText("Por QR").parentElement!;
    expect(resumen.textContent).toMatch(/Por QR\s*Bs\s50,00/);
    expect(resumen.textContent).toMatch(/En efectivo\s*Bs\s57,50/);
  });

  it("con un solo medio no hay resumen, y sin `previo` (un backend anterior) todo es «Al cobrar»", async () => {
    const vieja: VentaApi = { ...VENTA, juego: undefined, pagos: [{ id: "9", hora: H(23, 11), metodo: "Efectivo", monto: 107.5 }] };
    const d = await abrir(vieja);
    expect(within(d).queryByText("Por QR")).toBeNull();
    expect(within(d).queryByText("En efectivo")).toBeNull();
    expect(within(d).getByText("Al cobrar · Sáb 24/10 23:11")).toBeInTheDocument();
    expect(within(d).queryByText(/^de \d/)).toBeNull();
  });

  it("dentro de otro diálogo lleva su «Volver»", async () => {
    const volver = vi.fn();
    render(<ContenidoDetalleVenta consulta={{ venta: 10 }} ahora={AHORA} volver={{ texto: "Volver a la caja", onVolver: volver }} />);
    await act(async () => {});
    expect(await screen.findByText("Cómo se pagó")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Detalle de venta" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver a la caja" }));
    expect(volver).toHaveBeenCalled();
  });
});

describe("Detalle de venta: los textos", () => {
  it("de dónde salió la venta: el tipo con su nombre, o el de la lista, o el código", () => {
    expect(lugarDeVenta(VENTA)).toBe("Mesa 1 · Pool");
    expect(lugarDeVenta({ ...VENTA, tipoNombre: undefined }, { pool: { nombre: "Pool grande" } })).toBe("Mesa 1 · Pool grande");
    expect(lugarDeVenta({ ...VENTA, tipoNombre: undefined })).toBe("Mesa 1 · pool");
    expect(lugarDeVenta({ ...VENTA, origen: "cuenta", cuenta: "Juan" })).toBe("Cuenta «Juan»");
    expect(subtituloVenta({ ...VENTA, origen: "rapida" })).toBe("V-000010 · Venta rápida");
  });

  it("cuándo entró cada pago", () => {
    expect(cuandoSeCobro(VENTA.pagos[0], AHORA)).toBe("Adelanto · Sáb 24/10 21:30 · cobró Flavia Suarez");
    expect(cuandoSeCobro({ ...VENTA.pagos[0], previo: { hora: H(20, 5), concepto: "PREPAGO" } }, AHORA)).toBe("Tiempo fijo · Sáb 24/10 20:05");
    expect(cuandoSeCobro(VENTA.pagos[1], AHORA)).toBe("Al cobrar · Sáb 24/10 23:11");
    expect(cuandoSeCobro({ metodo: "Fiado", hora: H(23, 11), nota: "Don Raúl" }, AHORA)).toBe("Lo debe Don Raúl");
  });

  it("el juego pasa la medianoche y se lee igual", () => {
    expect(textoJuego({ desde: H(23, 30), hasta: new Date(2026, 9, 25, 1, 10).getTime() })).toBe("de 23:30 a 01:10");
  });
});
