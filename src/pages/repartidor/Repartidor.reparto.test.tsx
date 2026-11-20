import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Venta } from "../../types";

/**
 * La vista del repartidor con el delivery full (18-nov, CONTRATO-delivery-full
 * §9): la lista se refresca cada 20 s, un pedido nuevo suena y se anuncia
 * arriba (nunca en la primera carga), la rendición suma lo que llevó y el
 * cuadre con la caja, y la dirección de respaldo no deja nada roto.
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

// El sonido de verdad necesita Web Audio: acá basta con saber que se pidió.
vi.mock("../../lib/pedidosWeb/contador", async (original) => ({
  ...(await original<typeof import("../../lib/pedidosWeb/contador")>()),
  sonarPedido: vi.fn(() => true),
}));

import { api } from "../../lib/api";
import { sonarPedido } from "../../lib/pedidosWeb/contador";
import { llegados, pendientesDe, REFRESCO_ENTREGAS_MS } from "./avisoPedidoNuevo";
import Repartidor from "./Repartidor";

const PEDIDO = {
  id: 31,
  comprobante: "V-000031",
  estado: "APROBADO",
  fecha: "2026-11-18T20:00:00.000Z",
  total: 100,
  totalACobrar: 107,
  tarifaEnvio: 7,
  montoRendicion: 100,
  prepagado: false,
  tipoPedido: "DELIVERY",
  estadoEntrega: "PENDIENTE",
  clienteNombre: "Carla Mamani",
  clienteDireccion: "Calle Sucre 450",
  clienteTelefono: "70000000",
  minutosEstimados: null,
  notaPedido: null,
  entregadoEn: null,
  formasPago: [],
  pagos: [],
  detalles: [],
  repartidor: { id: 129, nombre: "Pedro Rojas" },
  pedidoWeb: null,
} as unknown as Venta;

const OTRO = { ...PEDIDO, id: 32, comprobante: "V-000032", clienteNombre: "Juan Pérez" } as Venta;

const RENDICION = {
  activa: true,
  desde: "2026-11-18T10:00:00.000Z",
  pendiente: 130,
  recibido: 120,
  repartidores: [
    {
      repartidorId: 129,
      nombre: "Pedro Rojas",
      entregados: 3,
      enCamino: 1,
      cobradoEfectivo: 250,
      cobradoQr: 0,
      envios: 21,
      pendiente: 130,
      recibido: 120,
      entregas: [],
      productos: {
        unidades: 8,
        categorias: [
          { nombre: "Pollos", unidades: 5, items: [{ nombre: "Brasa entero", cantidad: 5 }] },
          { nombre: "Bebidas", unidades: 3, items: [{ nombre: "Gaseosa 2L", cantidad: 3 }] },
        ],
      },
    },
  ],
};

async function montar(lista: Venta[]) {
  vi.mocked(api.getMisEntregas).mockResolvedValue(lista);
  render(<Repartidor />);
  await act(async () => {});
}

/** Pasa el tiempo del refresco con la lista que devuelve el servidor esa vez. */
async function refrescar(lista: Venta[], ms = REFRESCO_ENTREGAS_MS) {
  vi.mocked(api.getMisEntregas).mockResolvedValue(lista);
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  vi.mocked(api.getFormasPago).mockResolvedValue([]);
  vi.mocked(api.rendicionReparto).mockResolvedValue(RENDICION);
});

describe("el aviso de pedido nuevo", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("la lista se refresca cada 20 s (era un minuto)", async () => {
    await montar([PEDIDO]);
    expect(api.getMisEntregas).toHaveBeenCalledTimes(1);
    await refrescar([PEDIDO], REFRESCO_ENTREGAS_MS - 100);
    expect(api.getMisEntregas).toHaveBeenCalledTimes(1);
    await refrescar([PEDIDO], 100);
    expect(api.getMisEntregas).toHaveBeenCalledTimes(2);
  });

  it("lo que ya estaba asignado al abrir no suena ni se anuncia", async () => {
    await montar([PEDIDO]);
    expect(sonarPedido).not.toHaveBeenCalled();
    expect(screen.queryByText(/pedido nuevo para entregar/)).not.toBeInTheDocument();
    // Y un refresco con lo mismo, tampoco.
    await refrescar([PEDIDO]);
    expect(sonarPedido).not.toHaveBeenCalled();
  });

  it("uno que aparece en un refresco suena una vez y se anuncia arriba; «Ver» lleva a «Por entregar» y lo apaga", async () => {
    await montar([PEDIDO]);
    fireEvent.click(screen.getByRole("button", { name: "Entregadas" }));
    await refrescar([PEDIDO, OTRO]);
    expect(sonarPedido).toHaveBeenCalledTimes(1);
    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent("Tenés un pedido nuevo para entregar");
    fireEvent.click(within(aviso).getByRole("button", { name: "Ver" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Juan Pérez/ })).toBeInTheDocument();
    // El siguiente refresco con lo mismo no vuelve a sonar.
    await refrescar([PEDIDO, OTRO]);
    expect(sonarPedido).toHaveBeenCalledTimes(1);
  });

  it("dos de golpe se cuentan; uno que se canceló antes de verlo deja de contarse", async () => {
    await montar([]);
    const tercero = { ...PEDIDO, id: 33, clienteNombre: "Luz Rocha" } as Venta;
    await refrescar([OTRO, tercero]);
    expect(screen.getByRole("alert")).toHaveTextContent("Tenés 2 pedidos nuevos para entregar");
    await refrescar([OTRO]);
    expect(screen.getByRole("alert")).toHaveTextContent("Tenés un pedido nuevo para entregar");
  });

  it("abrir el pedido también lo da por visto", async () => {
    await montar([]);
    vi.mocked(api.getVenta).mockResolvedValue(OTRO);
    await refrescar([OTRO]);
    fireEvent.click(screen.getByRole("button", { name: /Juan Pérez/ }));
    await act(async () => {});
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("con la pestaña oculta no se pide nada (ahorra datos: avisa la push)", async () => {
    await montar([PEDIDO]);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await refrescar([PEDIDO, OTRO]);
    expect(api.getMisEntregas).toHaveBeenCalledTimes(1);
    expect(sonarPedido).not.toHaveBeenCalled();
  });
});

describe("qué cuenta como pedido nuevo", () => {
  it("sólo los por entregar de este repartidor (o sin repartidor en la fila)", () => {
    const ajeno = { ...PEDIDO, id: 40, repartidor: { id: 7, nombre: "Luis Vaca" } } as Venta;
    const entregado = { ...PEDIDO, id: 41, estadoEntrega: "ENTREGADO" } as Venta;
    const sinRepartidor = { ...PEDIDO, id: 42, repartidor: null } as Venta;
    expect(pendientesDe([PEDIDO, ajeno, entregado, sinRepartidor], 129)).toEqual([31, 42]);
  });

  it("la primera carga nunca trae nuevos", () => {
    expect(llegados(null, [31, 32])).toEqual([]);
    expect(llegados(new Set([31]), [31, 32])).toEqual([32]);
  });
});

describe("la rendición con el cuadre de la caja", () => {
  async function abrirRendicion() {
    await montar([PEDIDO]);
    fireEvent.click(screen.getByRole("button", { name: "Rendición" }));
    await act(async () => {});
    return screen.getByRole("dialog", { name: "Rendición del turno" });
  }

  it("con el control prendido: lo ya entregado, lo que falta y lo que llevó", async () => {
    const r = await abrirRendicion();
    expect(within(r).getByText("Ya entregaste a la caja").nextElementSibling).toHaveTextContent("Bs 120");
    expect(within(r).getByText("Te falta entregar").nextElementSibling).toHaveTextContent("Bs 130");
    const llevo = within(r).getByRole("button", { name: /Lo que llevaste: Pollos 5 · Bebidas 3/ });
    fireEvent.click(llevo);
    expect(within(r).getByText("Brasa entero")).toBeInTheDocument();
  });

  it("con el control apagado: sólo lo que llevó", async () => {
    vi.mocked(api.rendicionReparto).mockResolvedValue({ ...RENDICION, activa: false });
    const r = await abrirRendicion();
    expect(within(r).queryByText("Te falta entregar")).not.toBeInTheDocument();
    expect(within(r).getByRole("button", { name: /Lo que llevaste: Pollos 5/ })).toBeInTheDocument();
  });

  it("un backend anterior (404): la rendición de siempre, sin nada roto", async () => {
    vi.mocked(api.rendicionReparto).mockRejectedValue(new Error("Not Found"));
    const r = await abrirRendicion();
    expect(within(r).getByText("A entregar al negocio")).toBeInTheDocument();
    expect(within(r).queryByText(/Lo que llevaste/)).not.toBeInTheDocument();
    expect(within(r).queryByText("Te falta entregar")).not.toBeInTheDocument();
  });

  it("lo de otro repartidor no se muestra como propio", async () => {
    vi.mocked(api.rendicionReparto).mockResolvedValue({
      ...RENDICION,
      repartidores: [{ ...RENDICION.repartidores[0], repartidorId: 7, nombre: "Luis Vaca" }],
    });
    const r = await abrirRendicion();
    expect(within(r).queryByText("Te falta entregar")).not.toBeInTheDocument();
  });
});

describe("QA 18-nov, bug 2: «A rendir» y «A entregar al negocio» bajan cuando la caja recibe la plata", () => {
  /** Entregó un pedido de Bs 148 cobrado en efectivo: la cuenta de «Mis entregas» dice 148. */
  const ENTREGADO = {
    ...PEDIDO,
    id: 50,
    clienteNombre: "Juan Pérez",
    total: 148,
    totalACobrar: 155,
    montoRendicion: 148,
    estadoEntrega: "ENTREGADO",
    entregadoEn: "2026-11-18T21:00:00.000Z",
    formasPago: ["Efectivo"],
    pagos: [{ formaPagoId: 10, formaPago: "Efectivo", monto: 148 }],
  } as unknown as Venta;

  const cuadre = (activa: boolean, extra: Record<string, unknown>) => ({
    ...RENDICION,
    activa,
    repartidores: [{ ...RENDICION.repartidores[0], ...extra }],
  });

  const aRendir = () => screen.getByText("A rendir").closest(".card") as HTMLElement;

  async function rendicion() {
    fireEvent.click(screen.getByRole("button", { name: "Rendición" }));
    await act(async () => {});
    return screen.getByRole("dialog", { name: "Rendición del turno" });
  }

  it("la caja ya le recibió todo: «A rendir», el cartel y «Te falta entregar» dicen Bs 0", async () => {
    vi.mocked(api.rendicionReparto).mockResolvedValue(cuadre(true, { pendiente: 0, recibido: 148, aEntregar: 0 }));
    await montar([ENTREGADO]);
    expect(aRendir()).toHaveTextContent(/A rendir\s*Bs 0/);
    const r = await rendicion();
    expect(within(r).getByText("A entregar al negocio").parentElement).toHaveTextContent(/A entregar al negocio\s*Bs 0/);
    expect(within(r).getByText("Te falta entregar").nextElementSibling).toHaveTextContent("Bs 0");
    expect(within(r).getByText("Ya entregaste a la caja").nextElementSibling).toHaveTextContent("Bs 148");
  });

  it("con el control apagado también es el `aEntregar` del backend", async () => {
    vi.mocked(api.rendicionReparto).mockResolvedValue(cuadre(false, { pendiente: 0, recibido: 0, aEntregar: 76 }));
    await montar([ENTREGADO]);
    expect(aRendir()).toHaveTextContent(/A rendir\s*Bs 76/);
    const r = await rendicion();
    expect(within(r).getByText("A entregar al negocio").parentElement).toHaveTextContent(/Bs 76/);
  });

  it("un backend sin `aEntregar` con el control prendido: el cartel dice lo mismo que «Te falta entregar»", async () => {
    vi.mocked(api.rendicionReparto).mockResolvedValue(cuadre(true, { pendiente: 80, recibido: 68 }));
    await montar([ENTREGADO]);
    expect(aRendir()).toHaveTextContent(/A rendir\s*Bs 80/);
    const r = await rendicion();
    expect(within(r).getByText("A entregar al negocio").parentElement).toHaveTextContent(/Bs 80/);
    expect(within(r).getByText("Te falta entregar").nextElementSibling).toHaveTextContent("Bs 80");
  });

  it("si la rendición no carga (backend viejo, sin señal), la cuenta de siempre", async () => {
    vi.mocked(api.rendicionReparto).mockRejectedValue(new Error("Not Found"));
    await montar([ENTREGADO]);
    expect(aRendir()).toHaveTextContent(/A rendir\s*Bs 148/);
  });

  describe("con el refresco", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("la caja recibe mientras mira: «A rendir» baja en el siguiente refresco", async () => {
      vi.mocked(api.rendicionReparto).mockResolvedValue(cuadre(true, { pendiente: 148, recibido: 0, aEntregar: 148 }));
      await montar([ENTREGADO]);
      expect(aRendir()).toHaveTextContent(/A rendir\s*Bs 148/);
      vi.mocked(api.rendicionReparto).mockResolvedValue(cuadre(true, { pendiente: 0, recibido: 148, aEntregar: 0 }));
      await refrescar([ENTREGADO]);
      expect(aRendir()).toHaveTextContent(/A rendir\s*Bs 0/);
    });

    it("a un backend que no tiene la rendición no se le vuelve a preguntar cada 20 s", async () => {
      vi.mocked(api.rendicionReparto).mockRejectedValue(new Error("Not Found"));
      await montar([ENTREGADO]);
      await refrescar([ENTREGADO]);
      await refrescar([ENTREGADO]);
      expect(api.rendicionReparto).toHaveBeenCalledTimes(1);
      expect(api.getMisEntregas).toHaveBeenCalledTimes(3);
    });
  });
});

describe("la dirección de respaldo", () => {
  const WEB = { id: 12, numero: 7, latitud: -17.76, longitud: -63.18, referencia: null, formaPago: "QR", pagaCon: null, salioEn: null };

  it("QA 18-nov: la referencia va una sola vez («Referencia: …» del bloque de la página)", async () => {
    const conRef = {
      ...PEDIDO,
      clienteDireccion: "Ubicación marcada en el mapa · Portón negro",
      pedidoWeb: { ...WEB, referencia: "Portón negro" },
    } as unknown as Venta;
    vi.mocked(api.getVenta).mockResolvedValue({ ...conRef, pedidoWeb: undefined } as unknown as Venta);
    await montar([conRef]);
    fireEvent.click(screen.getByRole("button", { name: /Carla Mamani/ }));
    await act(async () => {});
    const detalle = screen.getByRole("dialog", { name: "Carla Mamani" });
    expect(within(detalle).getByText("Ubicación marcada en el mapa")).toBeInTheDocument();
    expect(detalle.textContent!.match(/Portón negro/g)).toHaveLength(1);
    expect(within(detalle).getByText("Referencia: Portón negro")).toBeInTheDocument();
    // Los botones del mapa, con sus textos de siempre y sin partirse en dos renglones.
    expect(within(detalle).getByRole("link", { name: /Ir con Google Maps/ })).toHaveClass("whitespace-nowrap");
    expect(within(detalle).getByRole("link", { name: /Abrir en Waze/ })).toHaveClass("whitespace-nowrap");
  });

  it("con dirección escrita y referencia, también una sola vez", async () => {
    const conDir = {
      ...PEDIDO,
      clienteDireccion: "Calle Sucre 450 · Portón negro",
      pedidoWeb: { ...WEB, referencia: "Portón negro" },
    } as unknown as Venta;
    vi.mocked(api.getVenta).mockResolvedValue(conDir);
    await montar([conDir]);
    fireEvent.click(screen.getByRole("button", { name: /Carla Mamani/ }));
    await act(async () => {});
    const detalle = screen.getByRole("dialog", { name: "Carla Mamani" });
    expect(within(detalle).getByText("Calle Sucre 450")).toBeInTheDocument();
    expect(detalle.textContent!.match(/Portón negro/g)).toHaveLength(1);
  });

  it("un pedido de la página sólo con el pin: «Ubicación marcada en el mapa» y sin «Copiar dirección»", async () => {
    const soloPin = { ...PEDIDO, clienteDireccion: "Ubicación marcada en el mapa", pedidoWeb: WEB } as unknown as Venta;
    vi.mocked(api.getVenta).mockResolvedValue({ ...soloPin, pedidoWeb: undefined } as unknown as Venta);
    await montar([soloPin]);
    const tarjeta = screen.getByRole("button", { name: /Carla Mamani/ });
    expect(tarjeta).toHaveTextContent("Ubicación marcada en el mapa");
    fireEvent.click(tarjeta);
    await act(async () => {});
    const detalle = screen.getByRole("dialog", { name: "Carla Mamani" });
    expect(within(detalle).getByText("Ubicación marcada en el mapa")).toBeInTheDocument();
    expect(within(detalle).queryByRole("button", { name: /Copiar dirección/ })).not.toBeInTheDocument();
    expect(within(detalle).getByRole("link", { name: /Google Maps/ })).toBeInTheDocument();
  });

  it("vacía del todo (un backend que no la rellenó) tampoco deja el renglón en blanco", async () => {
    const vacia = { ...PEDIDO, clienteDireccion: null, pedidoWeb: WEB } as unknown as Venta;
    await montar([vacia]);
    expect(screen.getByRole("button", { name: /Carla Mamani/ })).toHaveTextContent("Ubicación marcada en el mapa");
  });

  it("con dirección escrita se copia como siempre", async () => {
    const conDir = { ...PEDIDO, clienteDireccion: "Calle Sucre 450 · Portón negro", pedidoWeb: WEB } as unknown as Venta;
    vi.mocked(api.getVenta).mockResolvedValue(conDir);
    await montar([conDir]);
    fireEvent.click(screen.getByRole("button", { name: /Carla Mamani/ }));
    await act(async () => {});
    expect(within(screen.getByRole("dialog", { name: "Carla Mamani" })).getByRole("button", { name: /Copiar dirección/ })).toBeInTheDocument();
  });
});
