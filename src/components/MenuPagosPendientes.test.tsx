import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El número del atajo «Pagos pendientes» en el menú (26-nov): cuántos pacientes
 * deben, en rojo; y con los avisos de pago apagados el atajo no se dibuja.
 */

vi.mock("../pages/billar/DeFondo", () => ({ default: () => null }));

vi.mock("../store/AuthContext", async () => {
  const { puedeVer } = await import("../lib/permisos");
  const { permisosDe } = await import("../test/sesiones");
  return {
    useAuth: () => ({
      usuario: { id: 7, nombre: "Doctora", username: "doc", rol: "ADMIN", rolNombre: "Dueña", sucursalId: null, sucursal: null },
      negocio: { id: 3, nombre: "Consultorio de prueba", features: undefined, sucursalesActivas: undefined },
      licencia: null,
      cupo: null,
      logout: () => {},
      rubro: "NUTRICION",
      puede: (s: Parameters<typeof puedeVer>[1]) =>
        puedeVer({ ...permisosDe("ADMIN", {}), features: ["nutricion"], rubro: "NUTRICION" }, s),
    }),
  };
});

vi.mock("../lib/nutricion/seguimiento/api", async (original) => {
  const real = await original<typeof import("../lib/nutricion/seguimiento/api")>();
  return { ...real, apiSeguimiento: { ...real.apiSeguimiento, pagosPendientes: vi.fn() } };
});

import { apiSeguimiento } from "../lib/nutricion/seguimiento/api";
import { reiniciarContadorPagos } from "../lib/nutricion/seguimiento/contadorPagos";
import type { PagosPendientes } from "../lib/nutricion/seguimiento/tipos";
import Layout from "./Layout";

const debe = (id: number) => ({ paciente: { id } }) as unknown as PagosPendientes["deben"][number];

function abrir() {
  render(
    <MemoryRouter initialEntries={["/seguimiento/pagos"]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<p>pantalla</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return within(screen.getByRole("navigation"));
}

beforeEach(() => {
  localStorage.clear();
  reiniciarContadorPagos();
});

describe("«Pagos pendientes» en el menú lateral", () => {
  it("muestra cuántos pacientes deben y es el único encendido en su pantalla", async () => {
    vi.mocked(apiSeguimiento.pagosPendientes).mockResolvedValue({ avisarPagos: true, deben: [debe(1), debe(2)], proximos: [] });
    const nav = abrir();
    const enlace = nav.getByRole("link", { name: /Pagos pendientes/ });
    await waitFor(() => expect(within(enlace).getByLabelText("2 deben")).toHaveTextContent("2"));
    expect(within(enlace).getByLabelText("2 deben")).toHaveClass("bg-danger");
    expect(enlace).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Seguimiento" })).not.toHaveAttribute("aria-current");
  });

  it("con los avisos de pago apagados el atajo no se dibuja", async () => {
    vi.mocked(apiSeguimiento.pagosPendientes).mockResolvedValue({ avisarPagos: false, deben: [], proximos: [] });
    const nav = abrir();
    await waitFor(() => expect(apiSeguimiento.pagosPendientes).toHaveBeenCalled());
    await waitFor(() => expect(nav.queryByRole("link", { name: /Pagos pendientes/ })).not.toBeInTheDocument());
    expect(nav.getByRole("link", { name: "Seguimiento" })).toBeInTheDocument();
  });
});
