import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Venta } from "../../types";

/**
 * La pantalla del repartidor en el celular (20-nov, pedido del dueño): arriba
 * quedan dos tarjetas y no tres, sin perder ningún número; tirar para abajo
 * vuelve a pedir lo mismo que el refresco solo; «Mi día» es el reporte corto
 * de los envíos, y la rendición dice de qué pedido sale cada peso y quién lo
 * recibió.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 129, nombre: "Pedro Rojas", username: "pedro" },
    negocio: { nombre: "Negocio de prueba", features: [] },
  }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getMisEntregas: vi.fn(),
    getFormasPago: vi.fn(),
    getVenta: vi.fn(),
    entregarPedido: vi.fn(),
    cancelarPedido: vi.fn(),
    rendicionReparto: vi.fn(),
  },
}));

vi.mock("../../lib/pedidosWeb/apiPrivada", () => ({
  apiPedidosWeb: { sali: vi.fn(), posicion: vi.fn() },
}));

import { api } from "../../lib/api";
import { fmtHora } from "../../lib/format";
import Repartidor from "./Repartidor";

/** La hora como la ve el test: `toHaveTextContent` lee los espacios duros como espacios. */
const hora = (iso: string) => fmtHora(iso).replace(/\s/g, " ");

const BASE = {
  estado: "APROBADO",
  fecha: "2026-11-20T18:00:00.000Z",
  prepagado: false,
  tipoPedido: "DELIVERY",
  clienteDireccion: "Calle Sucre 450",
  clienteTelefono: "70000000",
  minutosEstimados: null,
  notaPedido: null,
  detalles: [],
  repartidor: { id: 129, nombre: "Pedro Rojas" },
  pedidoWeb: null,
};

/** Por entregar: Bs 50 + Bs 7 de envío. */
const PENDIENTE = {
  ...BASE,
  id: 31,
  comprobante: "V-000031",
  total: 50,
  totalACobrar: 57,
  tarifaEnvio: 7,
  montoRendicion: 50,
  estadoEntrega: "PENDIENTE",
  clienteNombre: "Carla Mamani",
  entregadoEn: null,
  formasPago: [],
  pagos: [],
} as unknown as Venta;

/** Entregado en efectivo a las 19:00: Bs 60 + Bs 8 de envío. */
const EFECTIVO = {
  ...BASE,
  id: 40,
  comprobante: "V-000040",
  total: 60,
  totalACobrar: 68,
  tarifaEnvio: 8,
  montoRendicion: 60,
  estadoEntrega: "ENTREGADO",
  clienteNombre: "Ana Rojas",
  entregadoEn: "2026-11-20T19:00:00.000Z",
  formasPago: ["Efectivo"],
  pagos: [{ formaPagoId: 10, formaPago: "Efectivo", monto: 60 }],
} as unknown as Venta;

/** Entregado antes (18:30), todo por QR: Bs 40 + Bs 5 de envío. */
const QR = {
  ...EFECTIVO,
  id: 41,
  comprobante: "V-000041",
  total: 40,
  totalACobrar: 45,
  tarifaEnvio: 5,
  montoRendicion: 40,
  clienteNombre: "Luis Vaca",
  entregadoEn: "2026-11-20T18:30:00.000Z",
  formasPago: ["QR"],
  pagos: [{ formaPagoId: 11, formaPago: "QR", monto: 40 }],
} as unknown as Venta;

/** La caja ya le recibió los Bs 60 de V-000040 (Caja Uno, 19:30). */
const RENDICION = {
  activa: true,
  desde: "2026-11-20T10:00:00.000Z",
  pendiente: 0,
  recibido: 60,
  aEntregar: 0,
  repartidores: [
    {
      repartidorId: 129,
      nombre: "Pedro Rojas",
      entregados: 2,
      enCamino: 1,
      cobradoEfectivo: 60,
      cobradoQr: 40,
      envios: 13,
      pendiente: 0,
      recibido: 60,
      aEntregar: 0,
      entregas: [
        {
          id: 5, ventaId: 40, comprobante: "V-000040", cliente: "Ana Rojas", entregadoEn: EFECTIVO.entregadoEn,
          total: 60, efectivo: 60, qr: 0, envio: 8, estado: "RECIBIDA", recibidaEn: "2026-11-20T19:30:00.000Z",
          recibidaPorNombre: "Caja Uno",
        },
      ],
      productos: { unidades: 0, categorias: [] },
    },
  ],
};

async function montar(lista: Venta[]) {
  vi.mocked(api.getMisEntregas).mockResolvedValue(lista);
  const r = render(<Repartidor />);
  await act(async () => {});
  return r;
}

/** Tira la lista para abajo con el dedo, desde arriba de todo, y suelta. */
async function tirarParaAbajo(caja: HTMLElement) {
  await act(async () => {
    fireEvent.touchStart(caja, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(caja, { touches: [{ clientX: 100, clientY: 120 }] });
    fireEvent.touchMove(caja, { touches: [{ clientX: 100, clientY: 300 }] });
    fireEvent.touchEnd(caja, { touches: [] });
  });
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  vi.mocked(api.getFormasPago).mockResolvedValue([]);
  vi.mocked(api.rendicionReparto).mockResolvedValue(RENDICION);
});

describe("dos tarjetas arriba, con lo que antes decían tres", () => {
  it("«Por entregar» lleva debajo las entregadas de hoy; «A rendir», el efectivo", async () => {
    vi.mocked(api.rendicionReparto).mockRejectedValue(new Error("Not Found"));
    await montar([PENDIENTE, EFECTIVO, QR]);
    const pedidos = screen.getByTitle("Ver mi día");
    const plata = screen.getByTitle("Ver la rendición");
    // Las dos en el mismo renglón, y nada más en él.
    expect(pedidos.parentElement).toBe(plata.parentElement);
    expect(pedidos.parentElement?.children).toHaveLength(2);
    expect(pedidos).toHaveTextContent(/Por entregar\s*1\s*2 entregadas hoy/);
    // Sin el cuadre de la caja, la cuenta de siempre: sólo el efectivo, sin el QR.
    expect(plata).toHaveTextContent(/A rendir\s*Bs 60\s*en efectivo/);
    // Ya no hay una tarjeta suelta para las entregadas: sólo la pestaña.
    expect(screen.getAllByText("Entregadas")).toHaveLength(1);
  });

  it("una sola entregada se dice en singular, y mientras carga no muestra ceros", async () => {
    vi.mocked(api.getMisEntregas).mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<Repartidor />);
    expect(screen.getByTitle("Ver mi día")).toHaveTextContent(/Por entregar\s*—/);
    expect(screen.getByRole("status", { name: "Cargando tus entregas" })).toBeInTheDocument();
    unmount();
    await montar([EFECTIVO]);
    expect(screen.getByTitle("Ver mi día")).toHaveTextContent("1 entregada hoy");
  });

  it("tocar «A rendir» abre la rendición, y tocar los pedidos abre «Mi día»", async () => {
    await montar([PENDIENTE, EFECTIVO]);
    fireEvent.click(screen.getByTitle("Ver la rendición"));
    await act(async () => {});
    expect(screen.getByRole("dialog", { name: "Rendición del turno" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Rendición del turno" })).getByRole("button", { name: "Entendido" }));
    fireEvent.click(screen.getByTitle("Ver mi día"));
    expect(screen.getByRole("dialog", { name: "Mi día" })).toBeInTheDocument();
  });
});

describe("tirar para actualizar", () => {
  it("vuelve a pedir la lista y el cuadre, una vez cada uno, y la lista no se va mientras tanto", async () => {
    const { container } = await montar([PENDIENTE]);
    expect(api.getMisEntregas).toHaveBeenCalledTimes(1);
    expect(api.rendicionReparto).toHaveBeenCalledTimes(1);
    const caja = container.firstElementChild as HTMLElement;
    vi.mocked(api.getMisEntregas).mockResolvedValue([PENDIENTE, { ...PENDIENTE, id: 32, clienteNombre: "Juan Pérez" } as Venta]);
    await tirarParaAbajo(caja);
    expect(api.getMisEntregas).toHaveBeenCalledTimes(2);
    expect(api.rendicionReparto).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: /Juan Pérez/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Carla Mamani/ })).toBeInTheDocument();
  });

  it("un tirón corto no actualiza", async () => {
    const { container } = await montar([PENDIENTE]);
    const caja = container.firstElementChild as HTMLElement;
    await act(async () => {
      fireEvent.touchStart(caja, { touches: [{ clientX: 100, clientY: 100 }] });
      fireEvent.touchMove(caja, { touches: [{ clientX: 100, clientY: 140 }] });
      fireEvent.touchEnd(caja, { touches: [] });
    });
    expect(api.getMisEntregas).toHaveBeenCalledTimes(1);
  });

  it("a un backend sin la rendición no se le vuelve a preguntar al tirar (como el refresco solo)", async () => {
    vi.mocked(api.rendicionReparto).mockRejectedValue(new Error("Not Found"));
    const { container } = await montar([PENDIENTE]);
    await tirarParaAbajo(container.firstElementChild as HTMLElement);
    expect(api.getMisEntregas).toHaveBeenCalledTimes(2);
    expect(api.rendicionReparto).toHaveBeenCalledTimes(1);
  });
});

describe("«Mi día»: los pedidos de hoy y su envío", () => {
  it("cuenta lo entregado y lo en camino, y lista cada envío con cómo pagó, del primero al último", async () => {
    await montar([PENDIENTE, EFECTIVO, QR]);
    fireEvent.click(screen.getByTitle("Ver mi día"));
    const dia = screen.getByRole("dialog", { name: "Mi día" });
    expect(within(dia).getByText("Pedidos llevados").parentElement).toHaveTextContent(/Pedidos llevados\s*2\s*1 en camino/);
    expect(within(dia).getByText("Envío cobrado").nextElementSibling).toHaveTextContent("Bs 13");
    const filas = within(within(dia).getByRole("region", { name: "Pedidos de hoy" })).getAllByRole("listitem");
    expect(filas).toHaveLength(2);
    expect(filas[0]).toHaveTextContent(`V-000041 · Luis Vaca${hora(QR.entregadoEn!)} · QRBs 5envío`);
    expect(filas[1]).toHaveTextContent(`V-000040 · Ana Rojas${hora(EFECTIVO.entregadoEn!)} · EfectivoBs 8envío`);
    expect(dia).toHaveTextContent(/Total de envíos cobrados\s*Bs 13/);
  });

  it("sin entregas todavía, lo dice amable y sin lista", async () => {
    await montar([PENDIENTE]);
    fireEvent.click(screen.getByTitle("Ver mi día"));
    const dia = screen.getByRole("dialog", { name: "Mi día" });
    expect(dia).toHaveTextContent("Todavía no entregaste pedidos hoy");
    expect(within(dia).queryByRole("region", { name: "Pedidos de hoy" })).not.toBeInTheDocument();
  });
});

describe("la rendición dice de qué pedido sale cada peso", () => {
  it("cada renglón: número, hora, cómo se cobró, su envío y quién recibió la plata", async () => {
    await montar([EFECTIVO, QR]);
    fireEvent.click(screen.getByRole("button", { name: "Rendición" }));
    await act(async () => {});
    const r = screen.getByRole("dialog", { name: "Rendición del turno" });
    const filas = within(within(r).getByRole("region", { name: "De dónde sale la plata" })).getAllByRole("listitem");
    const ana = filas.find((f) => f.textContent?.includes("Ana Rojas")) as HTMLElement;
    expect(ana).toHaveTextContent(`V-000040 · ${hora(EFECTIVO.entregadoEn!)} · Efectivo`);
    expect(ana).toHaveTextContent("+ Bs 8 de envío (tuyo)");
    expect(ana).toHaveTextContent(`Recibida por Caja Uno · ${hora("2026-11-20T19:30:00.000Z")}`);
    const luis = filas.find((f) => f.textContent?.includes("Luis Vaca")) as HTMLElement;
    expect(luis).toHaveTextContent("· QR");
    // Por QR no pasa por la caja: no se inventa un estado.
    expect(luis).not.toHaveTextContent(/Recibida|Falta entregarla/);
  });

  it("lo que la caja todavía no recibió se marca como pendiente", async () => {
    const entrega = { ...RENDICION.repartidores[0].entregas[0], estado: "PENDIENTE", recibidaEn: null, recibidaPorNombre: null };
    vi.mocked(api.rendicionReparto).mockResolvedValue({
      ...RENDICION,
      repartidores: [{ ...RENDICION.repartidores[0], pendiente: 60, recibido: 0, aEntregar: 60, entregas: [entrega] }],
    });
    await montar([EFECTIVO]);
    fireEvent.click(screen.getByRole("button", { name: "Rendición" }));
    await act(async () => {});
    const r = screen.getByRole("dialog", { name: "Rendición del turno" });
    expect(within(r).getByText("A entregar al negocio").parentElement).toHaveTextContent(/Bs 60\s*en efectivo/);
    expect(within(r).getByText("Falta entregarla a la caja")).toBeInTheDocument();
  });

  it("sin entregas, un vacío amable en vez de una lista en blanco", async () => {
    await montar([PENDIENTE]);
    fireEvent.click(screen.getByRole("button", { name: "Rendición" }));
    await act(async () => {});
    expect(screen.getByRole("dialog", { name: "Rendición del turno" })).toHaveTextContent("Todavía no entregaste ningún pedido");
  });
});
