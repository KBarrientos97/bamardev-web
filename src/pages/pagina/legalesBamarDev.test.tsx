import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaginaPublica as Pagina } from "../../lib/pagina/tipos";
import { PiePagina } from "./piezasPagina";
import PrivacidadNegocio from "./PrivacidadNegocio";

/**
 * Decisión D1 del pase de octubre: los textos legales de BamarDev quedan
 * ocultos hasta completarlos, y bamardev.com/terminos y /privacidad redirigen
 * a la portada. La página de cada negocio no puede seguir enlazándolos (sería
 * un enlace "Términos" que lleva a la home). La privacidad PROPIA del negocio
 * sigue: esa es del negocio, no de BamarDev.
 */

const PAGINA: Pagina = {
  subdominio: "buensabor",
  nombre: "Pollería El Buen Sabor",
  rubro: "Restaurante",
  iniciales: "PB",
  descripcion: null,
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
  sucursales: [],
  catalogo: null,
  pie: { atribucionUrl: "https://bamardev.com" },
  og: { titulo: "Pollería El Buen Sabor", descripcion: "", imagen: null, url: "https://app.bamardev.com/p/buensabor" },
};

const enlacesLegalesBamarDev = () =>
  screen
    .queryAllByRole("link")
    .filter((a) => /bamardev\.com\/(terminos|privacidad)/.test(a.getAttribute("href") ?? ""));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("D1: sin enlaces a los textos legales de BamarDev", () => {
  it("el pie de la página muestra la privacidad del negocio y nada de BamarDev", () => {
    render(<PiePagina p={PAGINA} urlPrivacidad="/p/buensabor/privacidad" color="#666" />);
    expect(enlacesLegalesBamarDev()).toEqual([]);
    expect(screen.queryByText(/Términos de BamarDev|Privacidad de BamarDev/)).toBeNull();
    expect(screen.getByRole("link", { name: "Privacidad" })).toHaveAttribute("href", "/p/buensabor/privacidad");
    expect(screen.getByRole("link", { name: /Powered by BamarDev/ })).toBeInTheDocument();
  });

  it("sin privacidad del negocio, el pie no deja una fila vacía", () => {
    const { container } = render(<PiePagina p={PAGINA} color="#666" />);
    const pie = container.querySelector("footer")!;
    // Sólo queda la atribución: ningún contenedor vacío que sume el `gap`.
    expect(pie.children).toHaveLength(1);
    expect(enlacesLegalesBamarDev()).toEqual([]);
  });

  it("la privacidad del negocio conserva su texto y no enlaza la de BamarDev", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(PAGINA), { status: 200, headers: { "Content-Type": "application/json" } })),
    );
    render(
      <MemoryRouter initialEntries={["/p/buensabor/privacidad"]}>
        <Routes>
          <Route path="/p/:subdominio/privacidad" element={<PrivacidadNegocio />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(await screen.findByRole("heading", { name: "Tus datos en Pollería El Buen Sabor" })).toBeInTheDocument();
    expect(enlacesLegalesBamarDev()).toEqual([]);
    expect(screen.queryByText("Privacidad de BamarDev")).toBeNull();
  });
});
