import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaginaPublica as Pagina } from "../../lib/pagina/tipos";
import PaginaPublica from "./PaginaPublica";

/**
 * La página pública (`/p/:subdominio`) con el fetch simulado: lo que ve el
 * cliente del negocio, sin sesión y sin pasar por el `request` de la app.
 */

const PAGINA: Pagina = {
  subdominio: "buensabor",
  nombre: "Pollería El Buen Sabor",
  rubro: "Restaurante",
  iniciales: "PB",
  descripcion: "Pollo a la brasa desde 2009.",
  color: { clave: "NARANJA", hex: "#B4501A" },
  formaBotones: "PILDORA",
  tipografia: "FUERTE",
  logoUrl: "/publico/pagina/buensabor/imagen/logo?v=abc",
  portadaUrl: null,
  anuncio: { texto: "Martes 2x1", url: null },
  reservar: false,
  destacado: { id: 7, tipo: "WHATSAPP", etiqueta: "Hacé tu pedido por WhatsApp", url: "https://wa.me/59170123456", icono: null },
  redes: [{ id: 8, tipo: "FACEBOOK", etiqueta: "Facebook", url: "https://www.facebook.com/bs", icono: null }],
  botones: [{ id: 9, tipo: "BOTON", etiqueta: "Ver el menú", url: "https://bs.bo/menu.pdf", icono: "menu" }],
  sucursales: [
    { id: 1, nombre: "Av. Banzer", direccion: "Av. Banzer, 4to anillo", telefono: "33112233", horario: "11 a 23", mapaUrl: "https://maps.app.goo.gl/x" },
  ],
  pie: { atribucionUrl: "https://bamardev.com/?utm_campaign=buensabor" },
  og: { titulo: "Pollería El Buen Sabor", descripcion: "Pollo a la brasa", imagen: null, url: "https://app-qa.bamardev.com/p/buensabor" },
};

function responder(status: number, cuerpo: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } }));
}

async function montar(ruta = "/p/buensabor") {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/p/:subdominio" element={<PaginaPublica />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

const beacon = vi.fn(() => true);

beforeEach(() => {
  Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
  beacon.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.title = "";
});

describe("página pública", () => {
  it("pide la página del subdominio sin token y la dibuja", async () => {
    const fetchMock = responder(200, PAGINA);
    vi.stubGlobal("fetch", fetchMock);
    await montar();
    expect(fetchMock).toHaveBeenCalledWith("/api/publico/pagina/buensabor");
    expect(screen.getByRole("heading", { level: 1, name: "Pollería El Buen Sabor" })).toBeInTheDocument();
    expect(screen.getByText("Restaurante")).toBeInTheDocument();
    expect(screen.getByText("Martes 2x1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Hacé tu pedido por WhatsApp/ })).toHaveAttribute("href", "https://wa.me/59170123456");
    expect(screen.getByRole("link", { name: "Facebook" })).toHaveAttribute("href", "https://www.facebook.com/bs");
    expect(screen.getByRole("link", { name: "Cómo llegar" })).toHaveAttribute("href", "https://maps.app.goo.gl/x");
    expect(screen.getByRole("link", { name: "Llamar" })).toHaveAttribute("href", "tel:+59133112233");
    expect(screen.getByAltText("Logo de Pollería El Buen Sabor")).toHaveAttribute(
      "src",
      "/api/publico/pagina/buensabor/imagen/logo?v=abc",
    );
    // Sin reserva online no hay botón Reservar.
    expect(screen.queryByText("Reservar turno")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Hecho con BamarDev/ })).toHaveAttribute(
      "href",
      "https://bamardev.com/?utm_campaign=buensabor",
    );
    expect(screen.getByRole("link", { name: "Privacidad" })).toHaveAttribute("href", "/p/buensabor/privacidad");
    expect(document.title).toBe("Pollería El Buen Sabor");
  });

  it("con reserva online, Reservar lleva a /r/<subdominio>/reservar", async () => {
    vi.stubGlobal("fetch", responder(200, { ...PAGINA, reservar: true, destacado: null }));
    await montar();
    expect(screen.getByRole("link", { name: /Reservar turno/ })).toHaveAttribute("href", "/r/buensabor/reservar");
    expect(screen.getByRole("link", { name: "Reservar" })).toHaveAttribute("href", "/r/buensabor/reservar?sucursal=1");
  });

  it("un toque en un enlace avisa el clic por beacon", async () => {
    vi.stubGlobal("fetch", responder(200, PAGINA));
    await montar();
    fireEvent.click(screen.getByRole("link", { name: "Ver el menú" }));
    expect(beacon).toHaveBeenCalledWith("/api/publico/pagina/buensabor/clic/9");
  });

  it("si no está disponible lo dice, sin mandar al login", async () => {
    vi.stubGlobal("fetch", responder(404, { message: "Esta página no está disponible" }));
    await montar("/p/no-existe");
    expect(screen.getByRole("heading", { name: "Esta página no está disponible" })).toBeInTheDocument();
    expect(screen.queryByText("Iniciar sesión")).not.toBeInTheDocument();
  });

  it("sin conexión, un mensaje claro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await montar();
    expect(screen.getByRole("heading", { name: /No se pudo cargar la página/ })).toBeInTheDocument();
  });
});
