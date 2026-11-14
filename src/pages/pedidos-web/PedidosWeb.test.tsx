import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bandeja, PedidoWeb } from "../../lib/pedidosWeb/tipos";

/**
 * La bandeja «Pedidos web» (13-nov): las columnas, el detalle con el pin, y
 * aceptar (repartidor, envío editable con motivo, el 409 «Ya lo aceptó Rosa») y
 * rechazar (con los códigos del contrato). La API y el mapa se simulan.
 */

const sesion = vi.hoisted(() => ({ usuario: { id: 1, nombre: "Rosa", username: "rosa", sucursalId: 3 } }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: sesion.usuario,
    negocio: { nombre: "El Ganadero", features: ["delivery"], tipoNegocio: "RESTAURANTE" },
    rubro: "RESTAURANTE",
    vocabulario: undefined,
  }),
}));

vi.mock("../../lib/api", async (importar) => {
  const real = await importar<typeof import("../../lib/api")>();
  return {
    ...real,
    api: {
      getRepartidores: vi.fn(async () => [
        { id: 21, nombre: "Pedro", zona: null, vehiculo: null },
        { id: 22, nombre: "Mario", zona: null, vehiculo: null },
      ]),
      getSucursales: vi.fn(async () => []),
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
  },
}));

vi.mock("../pagina/MapaSeguimiento", () => ({
  default: ({ destino, moto }: { destino: { latitud: number; longitud: number } | null; moto?: unknown }) => (
    <div data-testid="mapa-pin" data-moto={JSON.stringify(moto ?? null)}>
      {JSON.stringify(destino)}
    </div>
  ),
}));

import { ApiError, api } from "../../lib/api";
import { apiPedidosWeb } from "../../lib/pedidosWeb/apiPrivada";
import { REFRESCO_DETALLE_MS } from "./DetallePedidoWeb";
import PedidosWeb, { DURACION_AVISO_MS, REFRESCO_BANDEJA_MS } from "./PedidosWeb";

const ahora = Date.now();
const hace = (min: number) => new Date(ahora - min * 60_000).toISOString();

const LUCIA: PedidoWeb = {
  id: 12,
  numero: 7,
  estado: "NUEVO",
  tipo: "DELIVERY",
  almacenId: 3,
  sucursal: "Las Brisas",
  nombre: "Lucía",
  telefono: "71234567",
  direccion: "Calle Los Tajibos 23",
  referencia: "Portón negro",
  nota: "Sin cebolla",
  latitud: -17.76,
  longitud: -63.18,
  precisionM: 12,
  distanciaKm: 2.9,
  formaPago: "EFECTIVO",
  pagaCon: 200,
  subtotal: 100,
  envioSugerido: 9,
  lineas: [{ titulo: "Arroz con leche grande", cantidad: 2, precio: 50, subtotal: 100 }],
  motivoRechazo: null,
  ventaId: null,
  creadoEn: hace(3),
  aceptadoEn: null,
  salioEn: null,
};
const JORGE: PedidoWeb = { ...LUCIA, id: 13, numero: 8, nombre: "Jorge", tipo: "RECOGER", direccion: null, latitud: null, longitud: null, envioSugerido: 0, creadoEn: hace(9) };

function bandeja(c: Partial<Bandeja> = {}): Bandeja {
  return { nuevos: [LUCIA, JORGE], aceptados: [], enCamino: [], entregadosHoy: [], noTomadosHoy: [], ...c };
}

async function montar() {
  render(
    <MemoryRouter>
      <PedidosWeb />
    </MemoryRouter>,
  );
  await act(async () => {});
}

/** Las opciones llegan del servidor: se espera a que estén antes de elegir. */
async function elegirRepartidor(form: HTMLElement, id: string) {
  await within(form).findByRole("option", { name: "Pedro" });
  fireEvent.change(within(form).getByLabelText("Repartidor"), { target: { value: id } });
}

const mock = {
  bandeja: vi.mocked(apiPedidosWeb.bandeja),
  detalle: vi.mocked(apiPedidosWeb.detalle),
  aceptar: vi.mocked(apiPedidosWeb.aceptar),
  rechazar: vi.mocked(apiPedidosWeb.rechazar),
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.bandeja.mockResolvedValue(bandeja());
  mock.detalle.mockImplementation(async (id) => (id === 12 ? LUCIA : JORGE));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("la bandeja de pedidos web", () => {
  it("lista los nuevos con cuánto llevan esperando, y cuenta cada columna", async () => {
    await montar();
    expect(await screen.findByText(/N° 07 · Lucía/)).toBeInTheDocument();
    expect(screen.getByText(/N° 08 · Jorge/)).toBeInTheDocument();
    expect(screen.getByText("hace 3 min")).toBeInTheDocument();
    // 9 min sin respuesta: a punto de vencer.
    expect(screen.getByText("hace 9 min")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevos (2)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Aceptados (0)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "En camino (0)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hoy" })).toBeInTheDocument();
    // El total incluye el envío sugerido del delivery.
    expect(screen.getByText("Bs 109,00")).toBeInTheDocument();
  });

  it("las cuatro columnas pasan al renglón de abajo en vez de esconder «Hoy» en una fila que se desliza (sesion 2)", async () => {
    await montar();
    const hoy = await screen.findByRole("button", { name: "Hoy" });
    const fila = hoy.parentElement as HTMLElement;
    expect(fila.className).not.toMatch(/overflow-x-auto/);
    expect(fila.className).toMatch(/flex-wrap/);
  });

  it("sin pedidos: estado vacío; mientras carga no inventa ceros", async () => {
    mock.bandeja.mockReturnValue(new Promise(() => {}));
    await montar();
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
    // Las etiquetas sin número hasta saber: «Nuevos», no «Nuevos (0)».
    expect(screen.getByRole("button", { name: "Nuevos" })).toBeInTheDocument();
  });

  it("vacío cuando no hay ninguno", async () => {
    mock.bandeja.mockResolvedValue(bandeja({ nuevos: [] }));
    await montar();
    expect(await screen.findByText("No hay pedidos nuevos")).toBeInTheDocument();
  });

  it("Hoy junta los entregados y los que no se tomaron, con su motivo", async () => {
    mock.bandeja.mockResolvedValue(
      bandeja({
        nuevos: [],
        entregadosHoy: [{ ...LUCIA, id: 30, numero: 3, estado: "ACEPTADO", nombre: "Ana" }],
        noTomadosHoy: [{ ...LUCIA, id: 31, numero: 4, estado: "VENCIDO", nombre: "Beto" }],
      }),
    );
    await montar();
    fireEvent.click(await screen.findByRole("button", { name: "Hoy" }));
    expect(screen.getByRole("region", { name: "Entregados hoy" })).toHaveTextContent("N° 03 · Ana");
    const noTomados = screen.getByRole("region", { name: "No tomados hoy" });
    expect(noTomados).toHaveTextContent("N° 04 · Beto");
    expect(within(noTomados).getByText("Venció")).toBeInTheDocument();
  });

  it("se refresca solo cada 10 s y, si se corta la señal, conserva lo último con un aviso", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    await montar();
    await screen.findByText(/N° 07 · Lucía/);
    mock.bandeja.mockRejectedValue(new ApiError("No se pudo conectar con el servidor", 0));
    await act(async () => {
      vi.advanceTimersByTime(REFRESCO_BANDEJA_MS);
    });
    expect(await screen.findByText(/te mostramos lo último que supimos/)).toBeInTheDocument();
    expect(screen.getByText(/N° 07 · Lucía/)).toBeInTheDocument();
  });
});

describe("el detalle", () => {
  async function abrirLucia() {
    await montar();
    fireEvent.click(await screen.findByText(/N° 07 · Lucía/));
    return screen.findByRole("heading", { name: /Pedido N° 07 · Lucía/ });
  }

  it("muestra productos, nota, cliente con llamar y WhatsApp, el pin, la distancia y cómo paga", async () => {
    await abrirLucia();
    expect(screen.getByText("Arroz con leche grande")).toBeInTheDocument();
    expect(screen.getByText(/Sin cebolla/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Llamar/ })).toHaveAttribute("href", "tel:+59171234567");
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", expect.stringContaining("https://wa.me/59171234567"));
    expect(await screen.findByTestId("mapa-pin")).toHaveTextContent('{"latitud":-17.76,"longitud":-63.18}');
    expect(screen.getByText(/Envío sugerido \(2,9 km\)/)).toBeInTheDocument();
    expect(screen.getByText(/trae Bs 200,00, cambio Bs 91,00/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Abrir el pin en Google Maps/ })).toHaveAttribute("href", expect.stringContaining("destination=-17.76,-63.18"));
  });

  it("en camino: dice desde cuándo y con quién, y marca dónde va el repartidor", async () => {
    const enCamino = {
      ...LUCIA,
      estado: "ACEPTADO" as const,
      ventaId: 900,
      repartidor: { id: 22, nombre: "Pedro" },
      salioEn: hace(8),
      posicion: { latitud: -17.755, longitud: -63.178, en: hace(1) },
    };
    mock.bandeja.mockResolvedValue(bandeja({ nuevos: [], enCamino: [enCamino] }));
    mock.detalle.mockResolvedValue(enCamino);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /En camino/ }));
    fireEvent.click(await screen.findByText(/N° 07 · Lucía/));
    expect(await screen.findByText(/En camino desde las \d\d:\d\d con Pedro/)).toBeInTheDocument();
    expect(screen.getByText(/La última posición del repartidor es de hace 1 min/)).toBeInTheDocument();
    expect(await screen.findByTestId("mapa-pin")).toHaveAttribute("data-moto", '{"latitud":-17.755,"longitud":-63.178,"en":"' + enCamino.posicion.en + '"}');
  });

  it("con un nombre largo, Llamar y WhatsApp bajan al renglón de abajo y no aplastan el nombre (sesion 2)", async () => {
    mock.detalle.mockResolvedValue({ ...LUCIA, nombre: "Maria de los Angeles Fernandez-Quispe de la Torre Mamani" });
    mock.bandeja.mockResolvedValue(bandeja({ nuevos: [{ ...LUCIA, nombre: "Maria de los Angeles Fernandez-Quispe de la Torre Mamani" }] }));
    await montar();
    fireEvent.click(await screen.findByText(/N° 07 · Maria de los Angeles/));
    const cliente = await screen.findByRole("region", { name: "Cliente" });
    const fila = within(cliente).getByRole("link", { name: /Llamar/ }).parentElement!.parentElement as HTMLElement;
    expect(fila.className).toMatch(/flex-wrap/);
    // El teléfono no se parte en dos renglones.
    expect(within(cliente).getByText("+591 71234567").className).toMatch(/whitespace-nowrap/);
  });

  it("al abrir aceptar o rechazar, el formulario se trae a la vista (en el celular nace bajo el mapa)", async () => {
    const ver = vi.fn();
    Element.prototype.scrollIntoView = ver;
    try {
      await abrirLucia();
      fireEvent.click(screen.getByRole("button", { name: "Aceptar pedido" }));
      expect(ver).toHaveBeenCalledTimes(1);
      expect(ver.mock.contexts[0]).toBe(screen.getByRole("region", { name: "Aceptar el pedido" }));
      fireEvent.click(within(screen.getByRole("region", { name: "Aceptar el pedido" })).getByRole("button", { name: "Volver" }));
      fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
      expect(ver).toHaveBeenCalledTimes(2);
      expect(ver.mock.contexts[1]).toBe(screen.getByRole("region", { name: "Rechazar el pedido" }));
    } finally {
      // jsdom no lo trae: se deja como estaba.
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });

  it("aceptar: elige repartidor, el envío viene precargado y manda el cuerpo del contrato", async () => {
    mock.aceptar.mockResolvedValue({ ...LUCIA, estado: "ACEPTADO", ventaId: 900 });
    await abrirLucia();
    fireEvent.click(screen.getByRole("button", { name: "Aceptar pedido" }));
    const form = screen.getByRole("region", { name: "Aceptar el pedido" });
    // Sin repartidor, el botón dice qué falta y no manda nada.
    expect(within(form).getByRole("button", { name: "Elegí quién lo lleva." })).toBeDisabled();
    expect(within(form).getByLabelText("Envío")).toHaveValue("9,00");
    await elegirRepartidor(form, "22");
    fireEvent.click(within(form).getByRole("button", { name: "Aceptar pedido" }));
    expect(await screen.findByText("Aceptaste el pedido N° 07.")).toBeInTheDocument();
    expect(mock.aceptar).toHaveBeenCalledWith(12, { repartidorId: 22, tarifaEnvio: 9 });
    // Vuelve a la bandeja y la recarga.
    expect(screen.getByRole("heading", { name: "Pedidos web" })).toBeInTheDocument();
    expect(mock.bandeja.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("aceptar sólo ofrece los repartidores de la sucursal del pedido (o de toda la organización)", async () => {
    // El pedido es de la sucursal 3. Mario es de la 5: no puede ni salir ni entregarlo.
    vi.mocked(api.getRepartidores).mockResolvedValue([
      { id: 21, nombre: "Pedro", zona: null, vehiculo: null, sucursalId: 3 },
      { id: 22, nombre: "Mario", zona: null, vehiculo: null, sucursalId: 5 },
      { id: 23, nombre: "Lola", zona: null, vehiculo: null, sucursalId: null },
    ]);
    try {
      await abrirLucia();
      fireEvent.click(screen.getByRole("button", { name: "Aceptar pedido" }));
      const form = screen.getByRole("region", { name: "Aceptar el pedido" });
      await within(form).findByRole("option", { name: "Pedro" });
      expect(within(form).getByRole("option", { name: "Lola" })).toBeInTheDocument();
      expect(within(form).queryByRole("option", { name: "Mario" })).not.toBeInTheDocument();
    } finally {
      vi.mocked(api.getRepartidores).mockResolvedValue([
        { id: 21, nombre: "Pedro", zona: null, vehiculo: null },
        { id: 22, nombre: "Mario", zona: null, vehiculo: null },
      ]);
    }
  });

  it("si ningún repartidor es de esa sucursal, lo dice (no «no hay repartidores cargados»)", async () => {
    vi.mocked(api.getRepartidores).mockResolvedValue([{ id: 22, nombre: "Mario", zona: null, vehiculo: null, sucursalId: 5 }]);
    try {
      await abrirLucia();
      fireEvent.click(screen.getByRole("button", { name: "Aceptar pedido" }));
      const form = screen.getByRole("region", { name: "Aceptar el pedido" });
      expect(await within(form).findByText(/No hay repartidores de Las Brisas/)).toBeInTheDocument();
    } finally {
      vi.mocked(api.getRepartidores).mockResolvedValue([
        { id: 21, nombre: "Pedro", zona: null, vehiculo: null },
        { id: 22, nombre: "Mario", zona: null, vehiculo: null },
      ]);
    }
  });

  it("si cambia el envío, pide un motivo corto y lo manda", async () => {
    mock.aceptar.mockResolvedValue({ ...LUCIA, estado: "ACEPTADO", ventaId: 900 });
    await abrirLucia();
    fireEvent.click(screen.getByRole("button", { name: "Aceptar pedido" }));
    const form = screen.getByRole("region", { name: "Aceptar el pedido" });
    await elegirRepartidor(form, "21");
    fireEvent.change(within(form).getByLabelText("Envío"), { target: { value: "12" } });
    expect(within(form).getByRole("button", { name: "Contá en pocas palabras por qué cambiás el envío." })).toBeDisabled();
    fireEvent.change(within(form).getByLabelText("Motivo del envío"), { target: { value: "Calle en obra" } });
    fireEvent.click(within(form).getByRole("button", { name: "Aceptar pedido" }));
    await screen.findByText("Aceptaste el pedido N° 07.");
    expect(mock.aceptar).toHaveBeenCalledWith(12, { repartidorId: 21, tarifaEnvio: 12, motivoTarifa: "Calle en obra" });
  });

  it("para recoger no pide repartidor ni envío", async () => {
    mock.aceptar.mockResolvedValue({ ...JORGE, estado: "ACEPTADO", ventaId: 901 });
    await montar();
    fireEvent.click(await screen.findByText(/N° 08 · Jorge/));
    await screen.findByRole("heading", { name: /Pedido N° 08 · Jorge/ });
    fireEvent.click(screen.getByRole("button", { name: "Aceptar pedido" }));
    const form = screen.getByRole("region", { name: "Aceptar el pedido" });
    expect(within(form).queryByLabelText("Repartidor")).not.toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Aceptar pedido" }));
    await screen.findByText("Aceptaste el pedido N° 08.");
    expect(mock.aceptar).toHaveBeenCalledWith(13, { tarifaEnvio: 0 });
  });

  it("el 409: «Ya lo aceptó Rosa» vuelve a la bandeja con el aviso", async () => {
    mock.aceptar.mockRejectedValue(new ApiError("Ya lo aceptó Rosa", 409));
    await abrirLucia();
    fireEvent.click(screen.getByRole("button", { name: "Aceptar pedido" }));
    const form = screen.getByRole("region", { name: "Aceptar el pedido" });
    await elegirRepartidor(form, "21");
    fireEvent.click(within(form).getByRole("button", { name: "Aceptar pedido" }));
    expect(await screen.findByText("Ya lo aceptó Rosa")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pedidos web" })).toBeInTheDocument();
  });

  it("si cambió un precio (409 PRECIO_CAMBIO) la cajera se queda en el pedido, con el aviso y el total nuevo (PW-01)", async () => {
    const aviso = "Cambió el precio de Arroz con leche grande (de Bs 50 a Bs 55) desde que el cliente pidió: avisale antes de aceptar";
    mock.aceptar.mockRejectedValueOnce(new ApiError(aviso, 409, { codigo: "PRECIO_CAMBIO" }));
    await abrirLucia();
    fireEvent.click(screen.getByRole("button", { name: "Aceptar pedido" }));
    const form = screen.getByRole("region", { name: "Aceptar el pedido" });
    await elegirRepartidor(form, "21");
    // El backend deja el pedido NUEVO con los precios de hoy: el detalle que se vuelve a pedir ya trae el total nuevo.
    const nuevoPrecio: PedidoWeb = { ...LUCIA, subtotal: 110, total: 119, lineas: [{ titulo: "Arroz con leche grande", cantidad: 2, precio: 55, subtotal: 110 }] };
    mock.detalle.mockImplementation(async (id) => (id === 12 ? nuevoPrecio : JORGE));
    fireEvent.click(within(form).getByRole("button", { name: "Aceptar pedido" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(aviso);
    // No vuelve a la lista: sigue en el pedido, sin el formulario, y con el total de hoy.
    expect(screen.queryByRole("region", { name: "Aceptar el pedido" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pedidos web" })).not.toBeInTheDocument();
    expect(await screen.findByText("Bs 119,00")).toBeInTheDocument();
    // Avisado el cliente, vuelve a aceptar y esta vez pasa.
    mock.aceptar.mockResolvedValue({ ...nuevoPrecio, estado: "ACEPTADO" });
    fireEvent.click(screen.getByRole("button", { name: "Aceptar pedido" }));
    const otra = screen.getByRole("region", { name: "Aceptar el pedido" });
    await elegirRepartidor(otra, "21");
    fireEvent.click(within(otra).getByRole("button", { name: "Aceptar pedido" }));
    expect(await screen.findByText("Aceptaste el pedido N° 07.")).toBeInTheDocument();
  });

  it("cuenta la espera con la hora del servidor, no con la de la PC (PW-17)", async () => {
    // El servidor está 5 minutos adelante de esta PC: Lucía pidió «hace 3 min» según la PC, pero van 8.
    mock.bandeja.mockResolvedValue(bandeja({ ahora: new Date(ahora + 5 * 60_000).toISOString() }));
    await montar();
    expect(await screen.findByText("hace 8 min")).toBeInTheDocument();
    expect(screen.getByText("hace 14 min")).toBeInTheDocument();
  });

  it("una respuesta lenta que llega después de otra más nueva no la pisa (PW-17)", async () => {
    const eventos = await import("../../lib/pedidosWeb/contador");
    let soltarVieja: (b: Bandeja) => void = () => {};
    mock.bandeja.mockReset();
    mock.bandeja.mockImplementationOnce(() => new Promise<Bandeja>((r) => (soltarVieja = r)));
    mock.bandeja.mockResolvedValue(bandeja({ nuevos: [JORGE] }));
    await montar();
    // Mientras la primera sigue colgada, otro pedido dispara un refresco que contesta rápido.
    await act(async () => {
      window.dispatchEvent(new Event(eventos.EVENTO_PEDIDOS_WEB));
    });
    expect(await screen.findByText(/N° 08 · Jorge/)).toBeInTheDocument();
    await act(async () => {
      soltarVieja(bandeja({ nuevos: [LUCIA] }));
    });
    expect(screen.getByText(/N° 08 · Jorge/)).toBeInTheDocument();
    expect(screen.queryByText(/N° 07 · Lucía/)).not.toBeInTheDocument();
  });

  it("sin caja abierta, el error del servidor se queda en el formulario para poder corregirlo", async () => {
    mock.aceptar.mockRejectedValue(new ApiError("Abrí la caja de Las Brisas para aceptar el pedido", 400));
    await abrirLucia();
    fireEvent.click(screen.getByRole("button", { name: "Aceptar pedido" }));
    const form = screen.getByRole("region", { name: "Aceptar el pedido" });
    await elegirRepartidor(form, "21");
    fireEvent.click(within(form).getByRole("button", { name: "Aceptar pedido" }));
    expect(await screen.findByText("Abrí la caja de Las Brisas para aceptar el pedido")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Aceptar el pedido" })).toBeInTheDocument();
  });

  it("si la venta falla por falta de stock, ofrece rechazar con «se acabó» para que el cliente sepa por qué (PW-25)", async () => {
    mock.aceptar.mockRejectedValue(new ApiError("Stock insuficiente de Arroz con leche grande", 400));
    mock.rechazar.mockResolvedValue({ ...LUCIA, estado: "RECHAZADO" });
    await abrirLucia();
    fireEvent.click(screen.getByRole("button", { name: "Aceptar pedido" }));
    const form = screen.getByRole("region", { name: "Aceptar el pedido" });
    await elegirRepartidor(form, "21");
    fireEvent.click(within(form).getByRole("button", { name: "Aceptar pedido" }));
    expect(await screen.findByText("Stock insuficiente de Arroz con leche grande")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rechazar el pedido: se acabó" }));
    expect(await screen.findByText(/Rechazaste el pedido N° 07: se acabó/)).toBeInTheDocument();
    expect(mock.rechazar).toHaveBeenCalledWith(12, { codigo: "AGOTADO" });
  });

  it("un error que no es de stock no ofrece rechazar por agotado", async () => {
    mock.aceptar.mockRejectedValue(new ApiError("Abrí la caja de Las Brisas para aceptar el pedido", 400));
    await abrirLucia();
    fireEvent.click(screen.getByRole("button", { name: "Aceptar pedido" }));
    const form = screen.getByRole("region", { name: "Aceptar el pedido" });
    await elegirRepartidor(form, "21");
    fireEvent.click(within(form).getByRole("button", { name: "Aceptar pedido" }));
    await screen.findByText("Abrí la caja de Las Brisas para aceptar el pedido");
    expect(screen.queryByRole("button", { name: "Rechazar el pedido: se acabó" })).not.toBeInTheDocument();
  });

  it("rechazar: los atajos del contrato; «Otro motivo» pide el texto", async () => {
    mock.rechazar.mockResolvedValue({ ...LUCIA, estado: "RECHAZADO" });
    await abrirLucia();
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    const form = screen.getByRole("region", { name: "Rechazar el pedido" });
    for (const atajo of ["Se acabó", "No llegamos a esa zona", "Ya cerramos", "Pedido falso", "Otro motivo"]) {
      expect(within(form).getByRole("button", { name: atajo })).toBeInTheDocument();
    }
    expect(within(form).getByRole("button", { name: "Elegí un motivo." })).toBeDisabled();
    fireEvent.click(within(form).getByRole("button", { name: "Se acabó" }));
    fireEvent.click(within(form).getByRole("button", { name: "Rechazar pedido" }));
    expect(await screen.findByText(/Rechazaste el pedido N° 07/)).toBeInTheDocument();
    expect(mock.rechazar).toHaveBeenCalledWith(12, { codigo: "AGOTADO" });
  });

  it("rechazar con «Otro motivo» manda el texto", async () => {
    mock.rechazar.mockResolvedValue({ ...LUCIA, estado: "RECHAZADO" });
    await abrirLucia();
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    const form = screen.getByRole("region", { name: "Rechazar el pedido" });
    fireEvent.click(within(form).getByRole("button", { name: "Otro motivo" }));
    expect(within(form).getByRole("button", { name: "Escribí el motivo." })).toBeDisabled();
    fireEvent.change(within(form).getByPlaceholderText("Contale al cliente qué pasó"), { target: { value: "Se cortó el gas" } });
    fireEvent.click(within(form).getByRole("button", { name: "Rechazar pedido" }));
    await screen.findByText(/Rechazaste el pedido N° 07/);
    expect(mock.rechazar).toHaveBeenCalledWith(12, { codigo: "OTRO", motivo: "Se cortó el gas" });
  });

  it("volver deja la bandeja como estaba", async () => {
    await abrirLucia();
    fireEvent.click(screen.getByRole("button", { name: "Volver a los pedidos" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Pedidos web" })).toBeInTheDocument());
  });
});

describe("ronda 1 de QA (13-nov)", () => {
  async function abrirLucia() {
    await montar();
    fireEvent.click(await screen.findByText(/N° 07 · Lucía/));
    return screen.findByRole("heading", { name: /Pedido N° 07 · Lucía/ });
  }

  it("N11: un pedido que vence con el detalle abierto deja de poder aceptarse", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"], shouldAdvanceTime: true });
    // Lleva 9 min esperando: vence en uno.
    const casiVencido: PedidoWeb = { ...LUCIA, creadoEn: new Date(Date.now() - 9 * 60_000).toISOString(), venceEn: new Date(Date.now() + 60_000).toISOString() };
    mock.bandeja.mockResolvedValue(bandeja({ nuevos: [casiVencido] }));
    mock.detalle.mockResolvedValue(casiVencido);
    await montar();
    fireEvent.click(await screen.findByText(/N° 07 · Lucía/));
    expect(await screen.findByRole("button", { name: "Aceptar pedido" })).toBeEnabled();
    await act(async () => {
      vi.advanceTimersByTime(REFRESCO_DETALLE_MS * 7);
    });
    expect(await screen.findByText(/Venció: nadie lo respondió a tiempo\. Ya no se puede aceptar\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aceptar pedido" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rechazar" })).not.toBeInTheDocument();
  });

  it("N11: si el servidor ya lo marcó vencido al refrescar, también", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"], shouldAdvanceTime: true });
    await abrirLucia();
    mock.detalle.mockResolvedValue({ ...LUCIA, estado: "VENCIDO" });
    await act(async () => {
      vi.advanceTimersByTime(REFRESCO_DETALLE_MS);
    });
    expect(await screen.findByText("Venció: nadie lo respondió a tiempo.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aceptar pedido" })).not.toBeInTheDocument();
  });

  it("N12: el aviso «Rechazaste el pedido…» se va solo y no queda pegado en «Hoy»", async () => {
    mock.rechazar.mockResolvedValue({ ...LUCIA, estado: "RECHAZADO" });
    await abrirLucia();
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    const form = screen.getByRole("region", { name: "Rechazar el pedido" });
    fireEvent.click(within(form).getByRole("button", { name: "Se acabó" }));
    fireEvent.click(within(form).getByRole("button", { name: "Rechazar pedido" }));
    expect(await screen.findByText(/Rechazaste el pedido N° 07/)).toBeInTheDocument();
    // Al pasar a «Hoy» ya no está.
    fireEvent.click(screen.getByRole("button", { name: "Hoy" }));
    expect(screen.queryByText(/Rechazaste el pedido N° 07/)).not.toBeInTheDocument();
  });

  it("N12: y si no cambia de pestaña, se va a los segundos", async () => {
    mock.rechazar.mockResolvedValue({ ...LUCIA, estado: "RECHAZADO" });
    await abrirLucia();
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    const form = screen.getByRole("region", { name: "Rechazar el pedido" });
    fireEvent.click(within(form).getByRole("button", { name: "Se acabó" }));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
    fireEvent.click(within(form).getByRole("button", { name: "Rechazar pedido" }));
    expect(await screen.findByText(/Rechazaste el pedido N° 07/)).toBeInTheDocument();
    // Primero se deja que React arme el temporizador (con el reloj de mentira su planificador también espera).
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    await act(async () => {
      vi.advanceTimersByTime(DURACION_AVISO_MS + 100);
    });
    await waitFor(() => expect(screen.queryByText(/Rechazaste el pedido N° 07/)).not.toBeInTheDocument());
  });

  it("N15: «Pedido falso» avisa, antes de elegirlo, que bloquea el teléfono 30 días", async () => {
    await abrirLucia();
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    const form = screen.getByRole("region", { name: "Rechazar el pedido" });
    expect(within(form).getByText(/«Pedido falso» bloquea el teléfono del cliente por 30 días/)).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Pedido falso" }));
    expect(within(form).getByRole("alert")).toHaveTextContent(/bloquea el teléfono de este cliente por 30 días/);
    // Con otro motivo la advertencia fuerte no está.
    fireEvent.click(within(form).getByRole("button", { name: "Se acabó" }));
    expect(within(form).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("N13: la barra Rechazar / Aceptar va al fondo de la pantalla aunque el pedido sea corto", async () => {
    await abrirLucia();
    const barra = screen.getByRole("button", { name: "Aceptar pedido" }).parentElement!;
    expect(barra.className).toMatch(/\bsticky\b/);
    expect(barra.className).toMatch(/\bmt-auto\b/);
    expect(barra.parentElement!.className).toMatch(/\bmin-h-full\b/);
  });
});

describe("ronda 2 de QA (14-nov)", () => {
  it("S1: «Rechazar» un pedido para recoger no ofrece «No llegamos a esa zona»; uno a domicilio sí", async () => {
    await montar();
    fireEvent.click(await screen.findByText(/N° 08 · Jorge/));
    await screen.findByRole("heading", { name: /Pedido N° 08 · Jorge/ });
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    const form = screen.getByRole("region", { name: "Rechazar el pedido" });
    expect(within(form).queryByRole("button", { name: "No llegamos a esa zona" })).not.toBeInTheDocument();
    for (const atajo of ["Se acabó", "Ya cerramos", "Pedido falso", "Otro motivo"]) {
      expect(within(form).getByRole("button", { name: atajo })).toBeInTheDocument();
    }
  });
});

