import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InfoPedidos } from "../../lib/pedidosWeb/tipos";
import type { PaginaPublica as Pagina } from "../../lib/pagina/tipos";
import { esRutaDePaginaPublica } from "../../lib/pagina/rutas";
import PaginaPublica from "./PaginaPublica";

/**
 * El modo pedir (`/<negocio>/pedir`, 20-nov): el enlace para vender abre
 * directo en la carta, sin la presentación del negocio ni el selector de
 * sucursal, y el carrito es el de siempre.
 */

vi.mock("./ElegirPin", () => ({ default: () => <button type="button">Marcar mi casa</button> }));

const PAGINA: Pagina = {
  subdominio: "elganadero",
  nombre: "El Ganadero",
  rubro: "Restaurante",
  rubroClave: "RESTAURANTE",
  iniciales: "EG",
  descripcion: "Arroz con leche cremoso.",
  color: { clave: "NARANJA", hex: "#B4501A" },
  formaBotones: "PILDORA",
  tipografia: "FUERTE",
  logoUrl: null,
  portadaUrl: null,
  anuncio: null,
  reservar: false,
  destacado: null,
  redes: [],
  botones: [],
  sucursales: [
    { nombre: "Las Brisas", reservaSlug: null, direccion: "Calle 1", telefono: null, horario: null, mapaUrl: null },
    { nombre: "Centro", reservaSlug: null, direccion: "Calle 2", telefono: null, horario: null, mapaUrl: null },
  ],
  catalogo: {
    titulo: "Menú",
    sucursales: ["Las Brisas", "Centro"],
    items: [
      { id: 41, titulo: "Arroz con leche grande", descripcion: null, precio: 50, precioDesde: false, fotoUrl: null, icono: null, categoria: "Arroz" },
      { id: 42, titulo: "Jugo de naranja", descripcion: null, precio: 12, precioDesde: false, fotoUrl: null, icono: null, categoria: "Bebidas" },
    ],
  },
  pie: { atribucionUrl: "https://bamardev.com/?utm_campaign=elganadero" },
  og: { titulo: "El Ganadero", descripcion: "Arroz", imagen: null, url: "https://app-qa.bamardev.com/p/elganadero" },
};

const INFO: InfoPedidos = {
  recibe: true,
  motivo: null,
  tipos: ["DELIVERY", "RECOGER"],
  sucursales: [{ id: 3, nombre: "Las Brisas", latitud: -17.75, longitud: -63.18, abierta: true, tarifa: { tramos: [{ hastaKm: null, base: 7 }], maxKm: 12 } }],
};

function servidor(pagina: Pagina) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const json = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
      if (url === "/api/publico/pagina/elganadero") return json(200, pagina);
      if (url === "/api/publico/pedidos/elganadero") return json(200, INFO);
      return json(404, { message: "no" });
    }),
  );
}

async function montar(ruta = "/p/elganadero/pedir") {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/p/:subdominio" element={<p>La página de siempre</p>} />
        <Route path="/p/:subdominio/pedir" element={<PaginaPublica pedir />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
  Object.defineProperty(navigator, "sendBeacon", { value: vi.fn(() => true), configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("modo pedir", () => {
  it("abre directo en la carta, con buscador y categorías, sin elegir sucursal", async () => {
    servidor({ ...PAGINA, pedidosSistema: true });
    await montar();
    expect(await screen.findByTestId("modo-pedir")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "El Ganadero" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hacé tu pedido" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Buscar en la tienda" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bebidas" })).toBeInTheDocument();
    // Ni «Precios de:» ni la presentación del negocio.
    expect(screen.queryByRole("radio", { name: "Centro" })).not.toBeInTheDocument();
    expect(screen.queryByText("Arroz con leche cremoso.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver la página" })).toHaveAttribute("href", "/p/elganadero");
  });

  it("el buscador filtra la carta", async () => {
    servidor({ ...PAGINA, pedidosSistema: true });
    await montar();
    fireEvent.change(await screen.findByRole("searchbox", { name: "Buscar en la tienda" }), { target: { value: "jugo" } });
    expect(screen.getByText("Jugo de naranja")).toBeInTheDocument();
    expect(screen.queryByText("Arroz con leche grande")).not.toBeInTheDocument();
  });

  it("suma al pedido y abre el mismo carrito de la página", async () => {
    servidor({ ...PAGINA, pedidosSistema: true });
    await montar();
    fireEvent.click(await screen.findByRole("button", { name: "Agregar Arroz con leche grande al pedido" }));
    fireEvent.click(await screen.findByRole("button", { name: /Ver tu pedido/ }));
    expect(await screen.findByRole("dialog", { name: "Tu pedido" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hacer pedido" })).toBeInTheDocument();
  });

  it("sin pedidos (ni WhatsApp ni al sistema) vuelve a la página de siempre", async () => {
    servidor({ ...PAGINA, pedidosSistema: false, destacado: null });
    await montar();
    expect(await screen.findByText("La página de siempre")).toBeInTheDocument();
  });

  it("es una ruta pública (se atiende sin sesión)", () => {
    expect(esRutaDePaginaPublica("/p/elganadero/pedir")).toBe(true);
  });
});
