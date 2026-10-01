import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El menú de Inventario según el rubro.
 *
 * En farmacia, Inventario es un grupo cuya primera pantalla se llama
 * "Dashboard", como Medicamentos o Categorías. En bamardev-restaurant nada de
 * eso existe: Inventario sigue siendo un ítem solo que abre su Dashboard, y la
 * barra tiene que quedar exactamente como estaba.
 */

const sesion = vi.hoisted(() => ({ rubro: "FARMACIA" as string }));

vi.mock("../store/AuthContext", async () => {
  const { puedeVer } = await import("../lib/permisos");
  return {
    useAuth: () => ({
      usuario: { nombre: "Regente", username: "admin", rol: "ADMIN" },
      negocio: { nombre: "Negocio de prueba" },
      licencia: null,
      logout: () => {},
      rubro: sesion.rubro,
      puede: (s: Parameters<typeof puedeVer>[1]) =>
        puedeVer({ rol: "ADMIN", modulos: [], features: [], rubro: sesion.rubro }, s),
    }),
  };
});

import Layout from "./Layout";

function abrir(ruta: string) {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<p>pantalla</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  // La barra de escritorio; el cajón del celular sólo existe abierto.
  return within(screen.getByRole("navigation"));
}

beforeEach(() => {
  sesion.rubro = "FARMACIA";
});

describe("farmacia: Dashboard es la primera pantalla de Inventario", () => {
  it("aparece como sub-ítem y lleva a /inventario", () => {
    const nav = abrir("/inventario");
    expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/inventario");
    expect(nav.getByRole("link", { name: "Inventario" })).toHaveAttribute("href", "/inventario");
  });

  it("en /inventario el marcado es Dashboard, no los dos", () => {
    const nav = abrir("/inventario");
    expect(nav.getByRole("link", { name: "Dashboard" }).className).toContain(
      "bg-barra-activo text-barra-texto",
    );
    // Inventario queda como título del grupo: en blanco, sin el bloque.
    expect(nav.getByRole("link", { name: "Inventario" }).className).not.toMatch(
      /(^| )bg-barra-activo/,
    );
  });

  it("en Medicamentos se marca Medicamentos y Dashboard se apaga", () => {
    const nav = abrir("/inventario/productos");
    expect(nav.getByRole("link", { name: "Medicamentos" }).className).toMatch(
      /(^| )bg-barra-activo/,
    );
    expect(nav.getByRole("link", { name: "Dashboard" }).className).not.toMatch(
      /(^| )bg-barra-activo/,
    );
  });
});

describe("bamardev-restaurant: Inventario queda como estaba", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
  });

  it("no hay sub-ítem Dashboard", () => {
    const nav = abrir("/inventario");
    expect(nav.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
  });

  it("Inventario se marca como siempre en /inventario, y sólo ahí", () => {
    const nav = abrir("/inventario");
    expect(nav.getByRole("link", { name: "Inventario" }).className).toMatch(
      /(^| )bg-barra-activo/,
    );
  });

  it("en Artículos Inventario no queda encendido", () => {
    const nav = abrir("/inventario/productos");
    expect(nav.getByRole("link", { name: "Inventario" }).className).not.toMatch(
      /(^| )bg-barra-activo/,
    );
    expect(nav.getByRole("link", { name: "Artículos" }).className).toMatch(
      /(^| )bg-barra-activo/,
    );
  });
});
