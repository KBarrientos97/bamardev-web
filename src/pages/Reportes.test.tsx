import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Las tarjetas de Reportes según el rubro: la sugerencia de compra es de la
 * farmacia y abre su propia pantalla; bamardev-restaurant sigue viendo sus
 * reportes como siempre.
 */

const sesion = vi.hoisted(() => ({ rubro: "FARMACIA" as string }));

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: sesion.rubro,
    incluye: () => true,
    puede: () => true,
    usuario: { rol: "ADMIN", sucursalId: 917 },
    negocio: { id: 1, nombre: "Prueba" },
  }),
}));

vi.mock("../lib/api", () => ({
  api: {
    // El resumen queda cargando: acá sólo importan las tarjetas.
    reporte: vi.fn(() => new Promise(() => {})),
    getSucursales: vi.fn(async () => []),
  },
}));

import Reportes from "./Reportes";

async function montar() {
  render(
    <MemoryRouter initialEntries={["/reportes"]}>
      <Routes>
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/reportes/sugerencia-compra" element={<p>Pantalla de sugerencia</p>} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  sesion.rubro = "FARMACIA";
});

describe("la sugerencia de compra en Reportes", () => {
  it("en farmacia está, y abre su propia pantalla", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Sugerencia de compra/ }));
    });
    expect(screen.getByText("Pantalla de sugerencia")).toBeInTheDocument();
  });

  it("en bamardev-restaurant no aparece, y sus reportes siguen", async () => {
    sesion.rubro = "RESTAURANTE";
    await montar();
    expect(screen.queryByRole("button", { name: /Sugerencia de compra/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ventas por mesero/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Insumos/ })).toBeInTheDocument();
  });
});
