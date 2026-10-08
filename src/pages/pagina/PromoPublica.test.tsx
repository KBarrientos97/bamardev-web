import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BASE_API } from "../../lib/pagina/apiPagina";
import { esRutaDePaginaPublica } from "../../lib/pagina/rutas";
import PromoPublica from "./PromoPublica";

/** El fetch público, simulado: la página no pasa por la sesión. */
function responder(status: number, cuerpo: unknown = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(cuerpo), { status })),
  );
}

const dibujar = () =>
  render(
    <MemoryRouter initialEntries={["/p/omar/promo/verano"]}>
      <Routes>
        <Route path="/p/:subdominio/promo/:slug" element={<PromoPublica />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => vi.unstubAllGlobals());

describe("página pública de la promo", () => {
  it("se atiende sin sesión, como la página del negocio", () => {
    expect(esRutaDePaginaPublica("/p/omar/promo/verano")).toBe(true);
    expect(esRutaDePaginaPublica("/p/omar/promo")).toBe(false);
  });

  it("muestra el beneficio, las condiciones, el código y el WhatsApp", async () => {
    responder(200, {
      negocio: {
        nombre: "Pollos Omar",
        subdominio: "omar",
        paginaUrl: null,
        color: null,
        logoUrl: null,
        iniciales: "PO",
      },
      promo: {
        nombre: "Verano",
        descripcion: null,
        beneficio: "Bs 15 menos en tu compra",
        condiciones: ["Bs 15 menos en tu compra", "Compra mínima Bs 100", "Con código"],
        codigo: "VERANO15",
        conCodigo: true,
        vigenciaHasta: null,
        programada: false,
        url: "x",
      },
      whatsapp: "https://wa.me/59170000000?text=Hola",
    });
    dibujar();
    expect(await screen.findByText("Bs 15 menos en tu compra")).toBeInTheDocument();
    expect(screen.getByText("Compra mínima Bs 100")).toBeInTheDocument();
    expect(screen.getByText("VERANO15")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Quiero la promo/ })).toHaveAttribute(
      "href",
      "https://wa.me/59170000000?text=Hola",
    );
  });

  it("CUP-02: el logo del negocio se pide al API, no a la SPA", async () => {
    responder(200, {
      negocio: {
        nombre: "Salón",
        subdominio: "omar",
        paginaUrl: null,
        color: null,
        logoUrl: "/publico/pagina/omar/imagen/logo?v=3",
        iniciales: "S",
      },
      promo: {
        nombre: "Verano",
        descripcion: null,
        beneficio: "Bs 15 menos",
        condiciones: [],
        codigo: null,
        conCodigo: true,
        vigenciaHasta: null,
        programada: false,
        url: "x",
      },
      whatsapp: null,
    });
    const { container } = dibujar();
    await screen.findByText("Bs 15 menos");
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      `${BASE_API}/publico/pagina/omar/imagen/logo?v=3`,
    );
  });

  it("en la computadora: la tarjeta del negocio a la izquierda y la promo a la derecha", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    responder(200, {
      negocio: { nombre: "Salón", subdominio: "omar", paginaUrl: "/p/omar", color: null, logoUrl: null, iniciales: "S" },
      promo: {
        nombre: "Verano",
        descripcion: null,
        beneficio: "Bs 15 menos",
        condiciones: [],
        codigo: null,
        conCodigo: false,
        vigenciaHasta: null,
        programada: false,
        url: "x",
      },
      whatsapp: null,
    });
    dibujar();
    await screen.findByText("Bs 15 menos");
    const negocio = screen.getByRole("complementary", { name: "El negocio" });
    expect(negocio).toHaveTextContent("Salón");
    // El enlace a la página va una sola vez, en la tarjeta del negocio.
    expect(screen.getAllByRole("link", { name: "Ver la página del negocio" })).toHaveLength(1);
    expect(negocio).toContainElement(screen.getByRole("link", { name: "Ver la página del negocio" }));
  });

  it("una promo que no existe o terminó: no disponible", async () => {
    responder(404, { message: "no" });
    dibujar();
    expect(await screen.findByText("Esta promoción no está disponible")).toBeInTheDocument();
  });
});
