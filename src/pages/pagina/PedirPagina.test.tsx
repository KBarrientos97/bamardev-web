import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InfoPedidos } from "../../lib/pedidosWeb/tipos";
import type { PaginaPublica as Pagina } from "../../lib/pagina/tipos";
import { esRutaDePaginaPublica } from "../../lib/pagina/rutas";
import PaginaPublica from "./PaginaPublica";
import { agruparCarta } from "./PedirMovil";
import { paleta } from "../../lib/pagina/aspecto";

/**
 * El modo pedir (`/<negocio>/pedir`, 20-nov): el enlace para vender abre
 * directo en la carta, sin la presentación del negocio ni el selector de
 * sucursal, y el carrito es el de siempre. En el celular, como una app
 * (barra fija, secciones por categoría); en la computadora, la tienda.
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

/** La computadora: `useCoincideMedia` lee `matchMedia` (sin él, jsdom es un celular). */
function enComputadora() {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("min-width"), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
}

describe("modo pedir en el celular", () => {
  it("abre como app: barra fija del negocio, buscador, categorías y la carta en secciones", async () => {
    servidor({ ...PAGINA, pedidosSistema: true });
    await montar();
    const raiz = await screen.findByTestId("modo-pedir");
    expect(raiz).toHaveAttribute("data-armado", "movil");
    expect(screen.getByRole("heading", { level: 1, name: "El Ganadero" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Buscar en la carta" })).toBeInTheDocument();
    const categorias = screen.getByRole("group", { name: "Categorías" });
    expect(within(categorias).getAllByRole("button").map((b) => b.textContent)).toEqual(["Arroz", "Bebidas"]);
    expect(screen.getByRole("region", { name: "Arroz" })).toHaveTextContent("Arroz con leche grande");
    expect(screen.getByRole("region", { name: "Bebidas" })).toHaveTextContent("Jugo de naranja");
    // Ni «Precios de:» ni la presentación del negocio.
    expect(screen.queryByRole("radio", { name: "Centro" })).not.toBeInTheDocument();
    expect(screen.queryByText("Arroz con leche cremoso.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver la página de El Ganadero" })).toHaveAttribute("href", "/p/elganadero");
  });

  // Cuál se marca al deslizar depende de dónde está cada sección en pantalla: jsdom no
  // dibuja (todo queda en 0), así que eso se probó en el navegador. Acá, el toque.
  it("tocar una categoría la marca", async () => {
    servidor({ ...PAGINA, pedidosSistema: true });
    await montar();
    fireEvent.click(await screen.findByRole("button", { name: "Arroz" }));
    expect(screen.getByRole("button", { name: "Arroz" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Bebidas" }));
    expect(screen.getByRole("button", { name: "Bebidas" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Arroz" })).toHaveAttribute("aria-pressed", "false");
  });

  it("el buscador filtra la carta y se borra con la X", async () => {
    servidor({ ...PAGINA, pedidosSistema: true });
    await montar();
    fireEvent.change(await screen.findByRole("searchbox", { name: "Buscar en la carta" }), { target: { value: "jugo" } });
    expect(screen.getByText("Jugo de naranja")).toBeInTheDocument();
    expect(screen.queryByText("Arroz con leche grande")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar en la carta" }), { target: { value: "pizza" } });
    expect(screen.getByText("No encontramos «pizza».")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Borrar la búsqueda" }));
    expect(screen.getByText("Arroz con leche grande")).toBeInTheDocument();
  });

  it("«+» suma, pasa a «− n +» y abre el mismo carrito de la página", async () => {
    servidor({ ...PAGINA, pedidosSistema: true });
    await montar();
    fireEvent.click(await screen.findByRole("button", { name: "Agregar Arroz con leche grande al pedido" }));
    expect(screen.getByRole("group", { name: "Arroz con leche grande: 1 en el pedido" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sumar uno de Arroz con leche grande" }));
    expect(screen.getByRole("group", { name: "Arroz con leche grande: 2 en el pedido" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Ver tu pedido/ }));
    expect(await screen.findByRole("dialog", { name: "Tu pedido" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hacer pedido" })).toBeInTheDocument();
  });

  it("tocar el nombre abre el detalle con «Agregar al pedido»", async () => {
    servidor({ ...PAGINA, pedidosSistema: true });
    await montar();
    fireEvent.click(await screen.findByRole("button", { name: /^Jugo de naranja, Bs 12: ver detalle/ }));
    expect(await screen.findByRole("button", { name: "Agregar al pedido" })).toBeInTheDocument();
  });

  it("sin pedidos (ni WhatsApp ni al sistema) vuelve a la página de siempre", async () => {
    servidor({ ...PAGINA, pedidosSistema: false, destacado: null });
    await montar();
    expect(await screen.findByText("La página de siempre")).toBeInTheDocument();
  });

  it("la barra del navegador toma el color de la barra fija (cambia el theme-color que ya había)", async () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "#10B981";
    document.head.appendChild(meta);
    try {
      servidor({ ...PAGINA, pedidosSistema: true });
      await montar();
      await screen.findByTestId("modo-pedir");
      const metas = document.querySelectorAll('meta[name="theme-color"]');
      expect(metas).toHaveLength(1);
      expect(meta.content).toBe(paleta(PAGINA.color.hex).oscuro);
    } finally {
      meta.remove();
    }
  });

  it("es una ruta pública (se atiende sin sesión)", () => {
    expect(esRutaDePaginaPublica("/p/elganadero/pedir")).toBe(true);
  });
});

describe("modo pedir en la computadora", () => {
  it("la carta de la tienda, con buscador y las categorías al costado", async () => {
    enComputadora();
    servidor({ ...PAGINA, pedidosSistema: true });
    await montar();
    expect(await screen.findByTestId("modo-pedir")).toHaveAttribute("data-armado", "escritorio");
    expect(screen.getByRole("heading", { name: "Hacé tu pedido" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Buscar en la tienda" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver la página" })).toHaveAttribute("href", "/p/elganadero");
    expect(screen.queryByRole("radio", { name: "Centro" })).not.toBeInTheDocument();
  });
});

describe("agruparCarta", () => {
  const item = (id: number, categoria: string | null) => ({ ...PAGINA.catalogo!.items[0], id, categoria });

  it("una sección por categoría, en el orden de la carta; lo sin categoría, al final en «Otros»", () => {
    const g = agruparCarta([item(1, "Bebidas"), item(2, null), item(3, "Arroz"), item(4, "Bebidas")]);
    expect(g.map((x) => [x.titulo, x.items.map((i) => i.id)])).toEqual([
      ["Bebidas", [1, 4]],
      ["Arroz", [3]],
      ["Otros", [2]],
    ]);
  });

  it("sin categorías, una sola sección sin título", () => {
    expect(agruparCarta([item(1, null), item(2, "  ")])).toEqual([{ titulo: null, items: [item(1, null), item(2, "  ")] }]);
  });
});
