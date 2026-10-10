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
import { api } from "../lib/api";

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
  // Cada test arranca con el resumen cargando para siempre, como el mock base.
  vi.mocked(api.reporte).mockImplementation(() => new Promise(() => {}));
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

/**
 * Tope de reportes: el backend rechaza con un `message` pensado para el
 * cliente ("elegí un período más corto"). Se ve ese texto, donde iba el
 * reporte, y no un error genérico ni la pantalla rota.
 */
describe("un reporte rechazado por el tope", () => {
  const DEMASIADO_GRANDE =
    "Este período tiene 18.230 ventas y el máximo por reporte es 15.000. Elegí un período más corto.";

  it("al abrir un reporte muestra el mensaje del backend en su lugar, con Reintentar", async () => {
    sesion.rubro = "RESTAURANTE";
    vi.mocked(api.reporte).mockImplementation((nombre: string) =>
      nombre === "top-productos"
        ? Promise.reject(new Error(DEMASIADO_GRANDE))
        : new Promise(() => {}),
    );
    await montar();
    await act(async () => {
      fireEvent.click(tarjeta("Productos más vendidos")!);
    });
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveTextContent(DEMASIADO_GRANDE);
    expect(dialogo).not.toHaveTextContent(/Error 422/);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("si el resumen del período es el rechazado, el mensaje va arriba y las tarjetas siguen", async () => {
    sesion.rubro = "RESTAURANTE";
    const ocupado = "Hay otro reporte grande en curso. Probá de nuevo en unos segundos.";
    vi.mocked(api.reporte).mockImplementation((nombre: string) =>
      nombre === "resumen" ? Promise.reject(new Error(ocupado)) : new Promise(() => {}),
    );
    await montar();
    expect(screen.getByText(ocupado)).toBeInTheDocument();
    expect(tarjeta("Productos más vendidos")).not.toBeNull();
  });
});
