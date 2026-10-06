import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("una promo que no existe o terminó: no disponible", async () => {
    responder(404, { message: "no" });
    dibujar();
    expect(await screen.findByText("Esta promoción no está disponible")).toBeInTheDocument();
  });
});
