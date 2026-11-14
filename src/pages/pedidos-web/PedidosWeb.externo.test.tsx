import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Bandeja, PedidoWeb } from "../../lib/pedidosWeb/tipos";

/**
 * La bandeja con delivery por un servicio externo y con pedidos para recoger
 * (PLAN-DELIVERY-EXTERNO §2.4 y §2.8): aceptar sin repartidor y con el envío que
 * escribe la caja, y avanzar el pedido (pago recibido, salió con…, entregado);
 * entregar un RECOGER desde la bandeja. La API y el mapa se simulan.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, nombre: "Rosa", username: "rosa", sucursalId: 3 },
    negocio: { nombre: "El Ganadero", features: ["delivery"], tipoNegocio: "RESTAURANTE" },
    rubro: "RESTAURANTE",
    vocabulario: undefined,
    incluye: () => true,
  }),
}));

vi.mock("../../lib/api", async (importar) => {
  const real = await importar<typeof import("../../lib/api")>();
  return {
    ...real,
    api: {
      getRepartidores: vi.fn(async () => [{ id: 21, nombre: "Pedro", zona: null, vehiculo: null }]),
      getSucursales: vi.fn(async () => []),
      getFormasPago: vi.fn(async () => [
        { id: 1, nombre: "Efectivo" },
        { id: 2, nombre: "QR" },
      ]),
      entregarPedido: vi.fn(),
    },
  };
});

vi.mock("../../lib/pedidosWeb/apiPrivada", () => ({
  apiPedidosWeb: {
    bandeja: vi.fn(),
    detalle: vi.fn(),
    aceptar: vi.fn(),
    rechazar: vi.fn(),
    contador: vi.fn(),
    pagoRecibido: vi.fn(),
    salio: vi.fn(),
    entregado: vi.fn(),
    entregarRecoger: vi.fn(),
  },
}));

vi.mock("../pagina/MapaSeguimiento", () => ({
  default: ({ moto }: { moto?: unknown }) => <div data-testid="mapa-pin" data-moto={JSON.stringify(moto ?? null)} />,
}));

import { ApiError, api } from "../../lib/api";
import { apiPedidosWeb } from "../../lib/pedidosWeb/apiPrivada";
import PedidosWeb from "./PedidosWeb";

const ahora = Date.now();
const hace = (min: number) => new Date(ahora - min * 60_000).toISOString();

const NUEVO: PedidoWeb = {
  id: 12,
  numero: 7,
  estado: "NUEVO",
  tipo: "DELIVERY",
  almacenId: 3,
  sucursal: "Las Brisas",
  nombre: "Lucía",
  telefono: "71234567",
  direccion: "Calle Los Tajibos 23",
  referencia: null,
  nota: null,
  latitud: -17.76,
  longitud: -63.18,
  precisionM: 12,
  distanciaKm: 2.9,
  formaPago: "QR",
  pagaCon: null,
  subtotal: 100,
  envioSugerido: 0,
  lineas: [{ titulo: "Arroz con leche grande", cantidad: 2, precio: 50, subtotal: 100 }],
  motivoRechazo: null,
  ventaId: null,
  creadoEn: hace(2),
  aceptadoEn: null,
  salioEn: null,
  modoEntrega: "EXTERNO",
  servicio: null,
};
const ACEPTADO: PedidoWeb = { ...NUEVO, estado: "ACEPTADO", ventaId: 900, envio: 12, total: 112, aceptadoEn: hace(1), pagoConfirmadoEn: null };
const RECOGER: PedidoWeb = { ...NUEVO, id: 13, numero: 8, nombre: "Jorge", tipo: "RECOGER", estado: "ACEPTADO", ventaId: 901, direccion: null, latitud: null, longitud: null, formaPago: "EFECTIVO", pagaCon: 200, modoEntrega: undefined, total: 100 };

const bandeja = (c: Partial<Bandeja> = {}): Bandeja => ({ nuevos: [], aceptados: [], enCamino: [], entregadosHoy: [], noTomadosHoy: [], ...c });

const mock = {
  bandeja: vi.mocked(apiPedidosWeb.bandeja),
  detalle: vi.mocked(apiPedidosWeb.detalle),
  aceptar: vi.mocked(apiPedidosWeb.aceptar),
  pagoRecibido: vi.mocked(apiPedidosWeb.pagoRecibido),
  salio: vi.mocked(apiPedidosWeb.salio),
  entregado: vi.mocked(apiPedidosWeb.entregado),
  entregarRecoger: vi.mocked(apiPedidosWeb.entregarRecoger),
};

async function montar() {
  render(
    <MemoryRouter>
      <PedidosWeb />
    </MemoryRouter>,
  );
  await act(async () => {});
}

async function abrirDesde(pestana: RegExp, texto: RegExp) {
  await montar();
  fireEvent.click(await screen.findByRole("button", { name: pestana }));
  fireEvent.click(await screen.findByText(texto));
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.bandeja.mockResolvedValue(bandeja());
  mock.detalle.mockImplementation(async (id) => (id === 12 ? NUEVO : id === 13 ? RECOGER : NUEVO));
  mock.pagoRecibido.mockResolvedValue(ACEPTADO);
  mock.salio.mockResolvedValue(ACEPTADO);
  mock.entregado.mockResolvedValue(ACEPTADO);
  mock.entregarRecoger.mockResolvedValue(RECOGER);
});

describe("aceptar un delivery por un servicio externo", () => {
  async function abrirAceptar() {
    mock.bandeja.mockResolvedValue(bandeja({ nuevos: [NUEVO] }));
    await montar();
    fireEvent.click(await screen.findByText(/N° 07 · Lucía/));
    await screen.findByRole("heading", { name: /Pedido N° 07 · Lucía/ });
    fireEvent.click(screen.getByRole("button", { name: "Aceptar pedido" }));
    return screen.findByRole("region", { name: "Aceptar el pedido" });
  }

  it("no pide repartidor: pide el envío en Bs y manda sólo la tarifa", async () => {
    mock.aceptar.mockResolvedValue({ ...NUEVO, estado: "ACEPTADO" });
    const form = await abrirAceptar();
    expect(within(form).queryByLabelText("Repartidor")).not.toBeInTheDocument();
    expect(within(form).getByText(/Lo lleva/)).toHaveTextContent("Yango");
    // Sin envío escrito no deja: el botón dice qué falta.
    expect(within(form).getByRole("button", { name: "Escribí el envío." })).toBeDisabled();
    fireEvent.change(within(form).getByLabelText("Envío"), { target: { value: "12" } });
    fireEvent.click(within(form).getByRole("button", { name: "Aceptar pedido" }));
    await waitFor(() => expect(mock.aceptar).toHaveBeenCalledWith(12, { tarifaEnvio: 12 }));
    expect(api.getRepartidores).not.toHaveBeenCalled();
    expect(await screen.findByText(/Aceptaste el pedido N° 07/)).toBeInTheDocument();
  });

  it("un envío de Bs 0 es válido (el servicio no cobra) y no pide motivo", async () => {
    mock.aceptar.mockResolvedValue({ ...NUEVO, estado: "ACEPTADO" });
    const form = await abrirAceptar();
    fireEvent.change(within(form).getByLabelText("Envío"), { target: { value: "0" } });
    expect(within(form).queryByLabelText("Motivo del envío")).not.toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Aceptar pedido" }));
    await waitFor(() => expect(mock.aceptar).toHaveBeenCalledWith(12, { tarifaEnvio: 0 }));
  });

  it("muestra el servicio con su nombre y que el envío se escribe al aceptar", async () => {
    mock.bandeja.mockResolvedValue(bandeja({ nuevos: [{ ...NUEVO, servicio: "PedidosYa" }] }));
    mock.detalle.mockResolvedValue({ ...NUEVO, servicio: "PedidosYa" });
    await montar();
    fireEvent.click(await screen.findByText(/N° 07 · Lucía/));
    expect(await screen.findByText("Envío por PedidosYa")).toBeInTheDocument();
    expect(screen.getByText("Lo escribís al aceptar")).toBeInTheDocument();
    expect(screen.getByText(/Paga con/)).toHaveTextContent("antes de que salga");
  });
});

describe("avanzar un pedido por servicio externo desde Aceptados", () => {
  beforeEach(() => {
    mock.bandeja.mockResolvedValue(bandeja({ aceptados: [ACEPTADO] }));
    mock.detalle.mockResolvedValue(ACEPTADO);
  });

  it("en la lista se ve a cuáles les falta el pago", async () => {
    await montar();
    fireEvent.click(await screen.findByRole("button", { name: /Aceptados/ }));
    expect(await screen.findByText("Falta el pago")).toBeInTheDocument();
    expect(screen.getByText("Yango")).toBeInTheDocument();
  });

  it("Pago recibido → Salió con Yango (con el enlace) → Entregado", async () => {
    await abrirDesde(/Aceptados/, /N° 07 · Lucía/);
    // Aceptado: no hay repartidor ni moto en vivo.
    expect(await screen.findByText(/Falta confirmar el pago/)).toBeInTheDocument();
    expect(screen.getByText(/no hay repartidor propio ni moto en vivo/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Salió con/ })).not.toBeInTheDocument();

    // 1. El pago: aparece el monto con envío y, recién ahí, el paso siguiente.
    expect(screen.getByRole("region", { name: "Envío con servicio externo" })).toHaveTextContent("Bs 112,00");
    fireEvent.click(screen.getByRole("button", { name: "Pago recibido" }));
    await waitFor(() => expect(mock.pagoRecibido).toHaveBeenCalledWith(12));
    expect(await screen.findByRole("button", { name: "Salió con Yango" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pago recibido" })).not.toBeInTheDocument();

    // 2. Salió: el enlace es opcional pero tiene que ser https.
    const enlace = screen.getByLabelText("Enlace de seguimiento");
    fireEvent.change(enlace, { target: { value: "http://yango.com/x" } });
    expect(screen.getByRole("button", { name: "Salió con Yango" })).toBeDisabled();
    expect(screen.getByText(/tiene que empezar con https/)).toBeInTheDocument();
    fireEvent.change(enlace, { target: { value: "https://yango.com/track/abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Salió con Yango" }));
    await waitFor(() => expect(mock.salio).toHaveBeenCalledWith(12, "https://yango.com/track/abc"));
    expect(await screen.findByRole("button", { name: "Entregado" })).toBeInTheDocument();
    expect(screen.getByText(/Salió con Yango a las/)).toBeInTheDocument();
    // Sin posición del repartidor ni mapa con moto: el servicio externo no la manda.
    expect(screen.getByTestId("mapa-pin")).toHaveAttribute("data-moto", "null");

    // 3. Entregado: vuelve a la lista con el aviso.
    fireEvent.click(screen.getByRole("button", { name: "Entregado" }));
    await waitFor(() => expect(mock.entregado).toHaveBeenCalledWith(12));
    expect(await screen.findByText(/Marcaste el pedido N° 07 como entregado/)).toBeInTheDocument();
  });

  it("salir sin enlace manda sólo el pedido", async () => {
    mock.detalle.mockResolvedValue({ ...ACEPTADO, pagoConfirmadoEn: hace(1) });
    mock.bandeja.mockResolvedValue(bandeja({ aceptados: [{ ...ACEPTADO, pagoConfirmadoEn: hace(1) }] }));
    await abrirDesde(/Aceptados/, /N° 07 · Lucía/);
    fireEvent.click(await screen.findByRole("button", { name: "Salió con Yango" }));
    await waitFor(() => expect(mock.salio).toHaveBeenCalledWith(12, undefined));
  });

  it("el 409 «Primero confirmá el pago» se queda en el paso, sin sacar a la caja del pedido", async () => {
    mock.pagoRecibido.mockRejectedValue(new ApiError("No se pudo confirmar el pago", 500));
    await abrirDesde(/Aceptados/, /N° 07 · Lucía/);
    fireEvent.click(await screen.findByRole("button", { name: "Pago recibido" }));
    expect(await screen.findByText("No se pudo confirmar el pago")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Pedido N° 07 · Lucía/ })).toBeInTheDocument();
    // Y se puede volver a intentar.
    expect(screen.getByRole("button", { name: "Pago recibido" })).toBeEnabled();
  });

  it("ya en camino, se puede corregir el enlace sin volver a salir", async () => {
    const enCamino = { ...ACEPTADO, pagoConfirmadoEn: hace(5), salioEn: hace(2), enlaceSeguimiento: "https://yango.com/viejo" };
    mock.bandeja.mockResolvedValue(bandeja({ enCamino: [enCamino] }));
    mock.detalle.mockResolvedValue(enCamino);
    await abrirDesde(/En camino/, /N° 07 · Lucía/);
    const enlace = await screen.findByLabelText("Enlace de seguimiento");
    expect(enlace).toHaveValue("https://yango.com/viejo");
    expect(screen.queryByRole("button", { name: /Salió con/ })).not.toBeInTheDocument();
    fireEvent.change(enlace, { target: { value: "https://yango.com/nuevo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar el enlace" }));
    await waitFor(() => expect(mock.salio).toHaveBeenCalledWith(12, "https://yango.com/nuevo"));
  });

  it("desde «Hoy» no hay botones para avanzar", async () => {
    mock.bandeja.mockResolvedValue(bandeja({ entregadosHoy: [{ ...ACEPTADO, pagoConfirmadoEn: hace(9), salioEn: hace(5) }] }));
    mock.detalle.mockResolvedValue({ ...ACEPTADO, pagoConfirmadoEn: hace(9), salioEn: hace(5) });
    await abrirDesde(/Hoy/, /N° 07 · Lucía/);
    await screen.findByRole("heading", { name: /Pedido N° 07 · Lucía/ });
    expect(screen.queryByRole("button", { name: "Entregado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pago recibido" })).not.toBeInTheDocument();
  });
});

describe("un pedido para recoger aceptado", () => {
  beforeEach(() => {
    mock.bandeja.mockResolvedValue(bandeja({ aceptados: [RECOGER] }));
    mock.detalle.mockResolvedValue(RECOGER);
  });

  it("«Cobrar y entregar» cobra en efectivo y llama a entregar-recoger del pedido", async () => {
    await abrirDesde(/Aceptados/, /N° 08 · Jorge/);
    fireEvent.click(await screen.findByRole("button", { name: "Cobrar y entregar" }));
    const dialogo = await screen.findByRole("dialog");
    // Dijo que paga con Bs 200: «Efectivo recibido» arranca ahí.
    expect(within(dialogo).getByText("Total del pedido").parentElement).toHaveTextContent("Bs 100,00");
    fireEvent.click(await within(dialogo).findByRole("button", { name: "Cobrar y entregar" }));
    await waitFor(() => expect(mock.entregarRecoger).toHaveBeenCalledWith(13, [{ formaPagoId: 1, monto: 100, recibido: 200 }]));
    // No usa la ruta de la venta del historial.
    expect(api.entregarPedido).not.toHaveBeenCalled();
    expect(await screen.findByText(/Entregaste el pedido N° 08/)).toBeInTheDocument();
  });

  it("ya pagado dice «Entregar» y no cobra nada", async () => {
    mock.detalle.mockResolvedValue({ ...RECOGER, prepagado: true });
    await abrirDesde(/Aceptados/, /N° 08 · Jorge/);
    fireEvent.click(await screen.findByRole("button", { name: "Entregar" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText(/ya se cobró al tomarlo/)).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Entregar" }));
    await waitFor(() => expect(mock.entregarRecoger).toHaveBeenCalledWith(13, undefined));
  });

  it("un pedido propio (con repartidor) no muestra botones de servicio externo", async () => {
    const propio = { ...ACEPTADO, modoEntrega: "PROPIO" as const, servicio: null, repartidor: { id: 21, nombre: "Pedro" } };
    mock.bandeja.mockResolvedValue(bandeja({ aceptados: [propio] }));
    mock.detalle.mockResolvedValue(propio);
    await abrirDesde(/Aceptados/, /N° 07 · Lucía/);
    expect(await screen.findByText(/lo lleva Pedro/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pago recibido" })).not.toBeInTheDocument();
    expect(screen.queryByText("Yango")).not.toBeInTheDocument();
  });
});
