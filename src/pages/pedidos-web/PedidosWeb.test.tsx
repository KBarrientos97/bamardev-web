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

import { ApiError } from "../../lib/api";
import { apiPedidosWeb } from "../../lib/pedidosWeb/apiPrivada";
import PedidosWeb, { REFRESCO_BANDEJA_MS } from "./PedidosWeb";

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
