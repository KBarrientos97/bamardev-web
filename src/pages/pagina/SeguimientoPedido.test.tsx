import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Seguimiento } from "../../lib/pedidosWeb/tipos";
import SeguimientoPedido, { REFRESCO_SEGUIMIENTO_MS } from "./SeguimientoPedido";

/**
 * El seguimiento del pedido (13-nov): cada estado del §4 del contrato, el
 * refresco cada 10 s, el mapa sólo en camino, cancelar sólo en «Recibido» y los
 * casos malos (rechazado, vencido, sin señal). El mapa se simula.
 */

vi.mock("./MapaSeguimiento", () => ({
  default: ({ destino, local, moto }: { destino: unknown; local: unknown; moto: unknown }) => (
    <div data-testid="mapa" data-destino={JSON.stringify(destino)} data-local={JSON.stringify(local)} data-moto={JSON.stringify(moto)} />
  ),
}));

const TOKEN = "Ab3_x-9QkLm2Ab3_x-9QkLm2Ab3_x-9QkLm2";

const BASE: Seguimiento = {
  numero: 7,
  tipo: "DELIVERY",
  estado: "RECIBIDO",
  motivoRechazo: null,
  creadoEn: "2026-11-13T20:00:00.000Z",
  aceptadoEn: null,
  salioEn: null,
  entregadoEn: null,
  lineas: [{ titulo: "Arroz con leche grande", cantidad: 2, precio: 50, subtotal: 100 }],
  subtotal: 100,
  envio: 9,
  total: 109,
  formaPago: "EFECTIVO",
  pagaCon: 200,
  cambio: 91,
  direccion: "Calle Los Tajibos 23",
  referencia: "Portón negro",
  destino: { latitud: -17.76, longitud: -63.18 },
  sucursal: { nombre: "Las Brisas", latitud: -17.7496, longitud: -63.1748 },
  repartidor: null,
  posicion: null,
  whatsappLocal: "https://wa.me/59170123456",
};

const PAGINA = {
  subdominio: "elganadero",
  nombre: "El Ganadero",
  color: { clave: "NARANJA", hex: "#B4501A" },
};

/** El servidor: la página y el seguimiento, que se puede ir cambiando entre llamadas. */
function servidor(inicial: Partial<Seguimiento> | (() => Response)) {
  let actual: Partial<Seguimiento> | (() => Response) = inicial;
  const llamadas: { url: string; init?: RequestInit }[] = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url, init });
    if (url === "/api/publico/pagina/elganadero") return new Response(JSON.stringify(PAGINA), { status: 200 });
    if (url.endsWith("/cancelar")) return new Response(JSON.stringify({ ...BASE, estado: "CANCELADO" }), { status: 200 });
    if (typeof actual === "function") return actual();
    return new Response(JSON.stringify({ ...BASE, ...actual }), { status: 200 });
  });
  vi.stubGlobal("fetch", f);
  return {
    f,
    llamadas,
    cambiar: (c: Partial<Seguimiento> | (() => Response)) => {
      actual = c;
    },
    seguimientos: () => llamadas.filter((l) => l.url === `/api/publico/pedidos/elganadero/${TOKEN}`),
  };
}

async function montar() {
  render(
    <MemoryRouter initialEntries={[`/p/elganadero/pedido/${TOKEN}`]}>
      <Routes>
        <Route path="/p/:subdominio" element={<p>La página del local</p>} />
        <Route path="/p/:subdominio/pedido/:token" element={<SeguimientoPedido />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("el seguimiento del pedido", () => {
  it("Recibido: dice que está esperando, muestra el total y el cambio, y deja cancelar", async () => {
    const s = servidor({});
    await montar();
    expect(await screen.findByRole("heading", { name: "Pedido N° 07" })).toBeInTheDocument();
    expect(screen.getByText(/el local lo está revisando/)).toBeInTheDocument();
    expect(screen.getByText("Arroz con leche grande")).toBeInTheDocument();
    expect(screen.getByText("Total a pagar").nextElementSibling).toHaveTextContent("Bs 109");
    expect(screen.getByText(/te llevan/)).toHaveTextContent("Bs 91");
    expect(screen.getByRole("button", { name: "Cancelar pedido" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Escribir al local" })).toHaveAttribute("href", "https://wa.me/59170123456");
    // Los cuatro pasos y el actual marcado.
    expect(screen.getByText("Recibido", { selector: "span" }).closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.queryByTestId("mapa")).not.toBeInTheDocument();
    // La página del negocio da el nombre y el color; el seguimiento es suyo, sin cuenta ni cabecera de auth.
    expect(s.seguimientos()[0].init?.headers).toEqual({});
    expect(document.title).toBe("Pedido N° 07 · El Ganadero");
  });

  it("Aceptado: avisa que se está preparando y ya no deja cancelar", async () => {
    servidor({ estado: "ACEPTADO", aceptadoEn: "2026-11-13T20:02:00.000Z" });
    await montar();
    expect(await screen.findByText(/¡Aceptado! Lo estamos preparando/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar pedido" })).not.toBeInTheDocument();
    expect(screen.getByText("Aceptado", { selector: "span" }).closest("li")).toHaveAttribute("aria-current", "step");
  });

  it("En camino: mapa con la casa, el local y la moto, y el nombre del repartidor", async () => {
    servidor({
      estado: "EN_CAMINO",
      salioEn: "2026-11-13T20:10:00.000Z",
      repartidor: { nombre: "Pedro" },
      posicion: { latitud: -17.755, longitud: -63.178, en: "2026-11-13T20:11:00.000Z" },
    });
    await montar();
    const mapa = await screen.findByTestId("mapa");
    expect(JSON.parse(mapa.dataset.destino!)).toEqual({ latitud: -17.76, longitud: -63.18 });
    expect(JSON.parse(mapa.dataset.local!)).toEqual({ latitud: -17.7496, longitud: -63.1748 });
    expect(JSON.parse(mapa.dataset.moto!)).toEqual({ latitud: -17.755, longitud: -63.178, en: "2026-11-13T20:11:00.000Z" });
    expect(screen.getByText("Pedro va con tu pedido")).toBeInTheDocument();
  });

  it("En camino sin posición reciente: el mapa sale sin moto y lo dice", async () => {
    servidor({ estado: "EN_CAMINO", salioEn: "2026-11-13T20:10:00.000Z", repartidor: { nombre: "Pedro" }, posicion: null });
    await montar();
    const mapa = await screen.findByTestId("mapa");
    expect(mapa.dataset.moto).toBe("null");
    expect(screen.getByText("Esperando la ubicación del repartidor…")).toBeInTheDocument();
  });

  it("Entregado: termina, deja de refrescar y olvida el pedido en curso", async () => {
    localStorage.setItem("pedido-curso:elganadero", JSON.stringify({ token: TOKEN, numero: 7 }));
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const s = servidor({ estado: "ENTREGADO", entregadoEn: "2026-11-13T20:30:00.000Z" });
    await montar();
    expect(await screen.findByText(/Entregado\. ¡Que lo disfrutes!/)).toBeInTheDocument();
    expect(localStorage.getItem("pedido-curso:elganadero")).toBeNull();
    const antes = s.seguimientos().length;
    await act(async () => {
      vi.advanceTimersByTime(REFRESCO_SEGUIMIENTO_MS * 3);
    });
    expect(s.seguimientos()).toHaveLength(antes);
  });

  it("para recoger no hay «En camino» y el paso se llama «Listo para retirar»", async () => {
    servidor({ tipo: "RECOGER", estado: "ACEPTADO", envio: 0, total: 100, destino: null, direccion: null, referencia: null });
    await montar();
    expect(await screen.findByText(/Pasá a retirarlo cuando esté listo/)).toBeInTheDocument();
    expect(screen.getByText("Listo para retirar", { selector: "span" }).closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.queryByText("En camino", { selector: "span" })).not.toBeInTheDocument();
    expect(screen.getByText(/Retirás en/)).toHaveTextContent("Las Brisas");
  });

  it("Rechazado: muestra el motivo y sale a WhatsApp", async () => {
    servidor({ estado: "RECHAZADO", motivoRechazo: "Se acabó" });
    await montar();
    expect(await screen.findByRole("heading", { name: "Pedido rechazado" })).toBeInTheDocument();
    expect(screen.getByText("Se acabó", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Escribir al local" })).toHaveAttribute("href", "https://wa.me/59170123456");
    expect(screen.queryByRole("button", { name: "Cancelar pedido" })).not.toBeInTheDocument();
  });

  it("Vencido: «El local no respondió», con salida a WhatsApp", async () => {
    servidor({ estado: "VENCIDO" });
    await montar();
    expect(await screen.findByRole("heading", { name: "El local no respondió" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Escribir al local" })).toBeInTheDocument();
  });

  it("Cancelado: sin WhatsApp, vuelve a la página del local", async () => {
    servidor({ estado: "CANCELADO", whatsappLocal: null });
    await montar();
    expect(await screen.findByRole("heading", { name: "Pedido cancelado" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Volver a la página" }));
    expect(await screen.findByText("La página del local")).toBeInTheDocument();
  });

  it("cancelar pide confirmación y pasa a Cancelado", async () => {
    const s = servidor({});
    await montar();
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar pedido" }));
    expect(screen.getByRole("dialog", { name: "Cancelar el pedido" })).toBeInTheDocument();
    // «No, seguir esperando» no manda nada.
    fireEvent.click(screen.getByRole("button", { name: "No, seguir esperando" }));
    expect(s.llamadas.some((l) => l.url.endsWith("/cancelar"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar el pedido" }));
    expect(await screen.findByRole("heading", { name: "Pedido cancelado" })).toBeInTheDocument();
    expect(s.llamadas.find((l) => l.url.endsWith("/cancelar"))?.init?.method).toBe("POST");
  });

  it("si el local ya lo aceptó, el 409 se muestra y el estado se refresca", async () => {
    const s = servidor({});
    let intentado = false;
    s.f.mockImplementation(async (url: string) => {
      if (url === "/api/publico/pagina/elganadero") return new Response(JSON.stringify(PAGINA), { status: 200 });
      if (url.endsWith("/cancelar")) {
        intentado = true;
        return new Response(JSON.stringify({ message: "El local ya lo aceptó: escribiles si querés cambiarlo" }), { status: 409 });
      }
      // Mientras nadie cancela sigue «Recibido»; en el medio, el local lo aceptó.
      return new Response(JSON.stringify({ ...BASE, estado: intentado ? "ACEPTADO" : "RECIBIDO" }), { status: 200 });
    });
    await montar();
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar pedido" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar el pedido" }));
    expect(await screen.findByText("El local ya lo aceptó: escribiles si querés cambiarlo")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cancelar pedido" })).not.toBeInTheDocument());
  });

  it("se refresca cada 10 s y la moto se mueve", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const s = servidor({
      estado: "EN_CAMINO",
      repartidor: { nombre: "Pedro" },
      posicion: { latitud: -17.755, longitud: -63.178, en: "2026-11-13T20:11:00.000Z" },
    });
    await montar();
    expect(JSON.parse((await screen.findByTestId("mapa")).dataset.moto!).latitud).toBe(-17.755);
    s.cambiar({ estado: "EN_CAMINO", repartidor: { nombre: "Pedro" }, posicion: { latitud: -17.757, longitud: -63.179, en: "2026-11-13T20:11:10.000Z" } });
    await act(async () => {
      vi.advanceTimersByTime(REFRESCO_SEGUIMIENTO_MS);
    });
    await waitFor(() => expect(JSON.parse(screen.getByTestId("mapa").dataset.moto!).latitud).toBe(-17.757));
    expect(s.seguimientos().length).toBeGreaterThanOrEqual(2);
  });

  it("sin señal conserva lo último que vio, con un aviso, y se recupera", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const s = servidor({ estado: "ACEPTADO" });
    await montar();
    await screen.findByText(/¡Aceptado!/);
    s.f.mockImplementation(async (url: string) => {
      if (url === "/api/publico/pagina/elganadero") return new Response(JSON.stringify(PAGINA), { status: 200 });
      throw new TypeError("Failed to fetch");
    });
    await act(async () => {
      vi.advanceTimersByTime(REFRESCO_SEGUIMIENTO_MS);
    });
    expect(await screen.findByText(/Sin conexión: te mostramos lo último que supimos/)).toBeInTheDocument();
    expect(screen.getByText(/¡Aceptado!/)).toBeInTheDocument();
    s.f.mockImplementation(async (url: string) => {
      if (url === "/api/publico/pagina/elganadero") return new Response(JSON.stringify(PAGINA), { status: 200 });
      return new Response(JSON.stringify({ ...BASE, estado: "EN_CAMINO", repartidor: { nombre: "Pedro" } }), { status: 200 });
    });
    await act(async () => {
      vi.advanceTimersByTime(REFRESCO_SEGUIMIENTO_MS);
    });
    await waitFor(() => expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument());
    expect(await screen.findByText("Pedro va con tu pedido")).toBeInTheDocument();
  });

  it("un enlace que no existe dice que no lo encontró, sin mostrar un pedido en blanco", async () => {
    servidor(() => new Response(JSON.stringify({ message: "Pedido no encontrado" }), { status: 404 }));
    await montar();
    expect(await screen.findByRole("heading", { name: "No encontramos este pedido" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ir a la página de/ })).toBeInTheDocument();
  });
});
