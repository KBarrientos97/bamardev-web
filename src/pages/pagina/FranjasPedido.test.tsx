import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FranjasPedido from "./FranjasPedido";
import RutasPaginaPublica from "./RutasPagina";
import RutasLink from "./RutasLink";

/**
 * «Tenés un pedido en curso» (13-nov): si el cliente vuelve a la página del
 * local, el navegador recuerda su pedido y le deja el enlace. Y las rutas del
 * seguimiento existen en los dos dominios, como `/tienda`.
 */

const TOKEN = "T".repeat(40);
const seg = (estado: string) => new Response(JSON.stringify({ numero: 7, estado }), { status: 200 });

async function montar(aviso: string | null = null) {
  render(
    <MemoryRouter>
      <FranjasPedido subdominio="elganadero" fuerte="#753411" aviso={aviso} />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("la franja del pedido en curso", () => {
  it("con un pedido sin terminar, ofrece seguirlo", async () => {
    localStorage.setItem("pedido-curso:elganadero", JSON.stringify({ token: TOKEN, numero: 7 }));
    vi.stubGlobal("fetch", vi.fn(async () => seg("EN_CAMINO")));
    await montar();
    const franja = screen.getByRole("link", { name: /Tenés un pedido en curso · N° 07/ });
    expect(franja).toHaveAttribute("href", `/p/elganadero/pedido/${TOKEN}`);
  });

  it("si el pedido ya terminó, la franja se va y se olvida", async () => {
    localStorage.setItem("pedido-curso:elganadero", JSON.stringify({ token: TOKEN, numero: 7 }));
    vi.stubGlobal("fetch", vi.fn(async () => seg("ENTREGADO")));
    await montar();
    expect(screen.queryByRole("link", { name: /pedido en curso/ })).not.toBeInTheDocument();
    expect(localStorage.getItem("pedido-curso:elganadero")).toBeNull();
  });

  it("sin señal conserva la franja: mejor que perder el enlace", async () => {
    localStorage.setItem("pedido-curso:elganadero", JSON.stringify({ token: TOKEN, numero: 7 }));
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await montar();
    expect(screen.getByRole("link", { name: /pedido en curso/ })).toBeInTheDocument();
  });

  it("sin pedido ni aviso no dibuja nada; el aviso de «cerrado» sale solo", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await montar();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    render(
      <MemoryRouter>
        <FranjasPedido subdominio="otro" fuerte="#753411" aviso="Ahora no estamos recibiendo pedidos" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Ahora no estamos recibiendo pedidos");
  });
});

describe("las rutas del seguimiento", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/publico/pedidos/")
          ? new Response(JSON.stringify({ numero: 7, tipo: "RECOGER", estado: "RECIBIDO", lineas: [], subtotal: 0, envio: 0, total: 0, formaPago: "QR", sucursal: { nombre: "A" } }), { status: 200 })
          : new Response(JSON.stringify({ message: "no" }), { status: 404 }),
      ),
    );
  });

  it("existe en /p/<sub>/pedido/<token>", async () => {
    render(
      <MemoryRouter initialEntries={[`/p/elganadero/pedido/${TOKEN}`]}>
        <RutasPaginaPublica />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Pedido N° 07" })).toBeInTheDocument();
  });

  it("y en el host link: /<sub>/pedido/<token>", async () => {
    render(
      <MemoryRouter initialEntries={[`/elganadero/pedido/${TOKEN}`]}>
        <RutasLink />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Pedido N° 07" })).toBeInTheDocument();
  });
});
