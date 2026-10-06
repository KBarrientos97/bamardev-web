import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Las tarjetas de Reportes según el rubro: la sugerencia de compra es de la
 * farmacia y abre su propia pantalla; bamardev-restaurant sigue viendo sus
 * reportes como siempre.
 */

const sesion = vi.hoisted(() => ({ rubro: "FARMACIA" as string }));

vi.mock("../store/AuthContext", async () => {
  // Los permisos de la plantilla de ese rol: la pantalla decide sólo con ellos.
  const { permisosDe } = await import("../test/sesiones");
  return {
    useAuth: () => ({
      rubro: sesion.rubro,
      incluye: () => true,
      puede: () => true,
      usuario: { rol: "ADMIN", ...permisosDe("ADMIN"), sucursalId: 917 },
      negocio: { id: 1, nombre: "Prueba" },
    }),
  };
});

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
        <Route path="/reportes/mermas" element={<p>Pantalla de mermas</p>} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  sesion.rubro = "FARMACIA";
});

/**
 * La tarjeta de un reporte, por su título. Por texto y no por rol: Reportes es
 * una pantalla grande y `getByRole` la recorría entera en cada consulta; con
 * la suite en paralelo pasaba el límite de 5 s por test.
 */
const tarjeta = (titulo: string) => screen.queryByText(titulo, { selector: "h3" })?.closest("button") ?? null;

describe("los reportes propios de la farmacia", () => {
  it("en farmacia está, y abre su propia pantalla", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(tarjeta("Sugerencia de compra")!);
    });
    expect(screen.getByText("Pantalla de sugerencia")).toBeInTheDocument();
  });

  it("en farmacia están también las mermas, con su pantalla", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(tarjeta("Vencimientos y mermas")!);
    });
    expect(screen.getByText("Pantalla de mermas")).toBeInTheDocument();
  });

  it("en bamardev-restaurant no aparece, y sus reportes siguen", async () => {
    sesion.rubro = "RESTAURANTE";
    await montar();
    expect(tarjeta("Sugerencia de compra")).toBeNull();
    expect(tarjeta("Vencimientos y mermas")).toBeNull();
    expect(tarjeta("Ventas por mesero")).not.toBeNull();
    expect(tarjeta("Insumos")).not.toBeNull();
  });
});
