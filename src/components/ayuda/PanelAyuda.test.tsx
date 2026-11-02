import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El panel de la Ayuda: del menú de botones a la respuesta, el buscador, la
 * rama Reportes que se arma sola y el WhatsApp con el contexto.
 */

const sesion = vi.hoisted(() => ({ rol: "ADMIN" as string, rubro: "RESTAURANTE" as string }));

vi.mock("../../store/AuthContext", async () => {
  const { puedeVer } = await import("../../lib/permisos");
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => {
      const p = permisosDe(sesion.rol as Parameters<typeof permisosDe>[0]);
      return {
        usuario: { id: 1, username: "u", rol: sesion.rol, rolNombre: sesion.rol === "ADMIN" ? "Administrador" : "Cajero", ...p },
        negocio: { id: 3, nombre: "Pollos Don Omar", alias: "pollosdonomar", features: [] },
        rubro: sesion.rubro,
        puede: (s: Parameters<typeof puedeVer>[1]) => puedeVer({ ...p, rubro: sesion.rubro }, s),
        incluye: () => true,
      };
    },
  };
});

import PanelAyuda from "./PanelAyuda";

function Ruta() {
  return <p data-testid="ruta">{useLocation().pathname}</p>;
}

function abrir() {
  const onClose = vi.fn();
  render(
    <MemoryRouter initialEntries={["/"]}>
      <PanelAyuda abierto onClose={onClose} />
      <Routes>
        <Route path="*" element={<Ruta />} />
      </Routes>
    </MemoryRouter>,
  );
  return onClose;
}

beforeEach(() => {
  sesion.rol = "ADMIN";
  sesion.rubro = "RESTAURANTE";
});

describe("PanelAyuda", () => {
  it("del botón de la rama a la respuesta, y Llevame ahí lleva a la pantalla", () => {
    const onClose = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Caja" }));
    fireEvent.click(screen.getByRole("button", { name: /Me sobró plata/ }));
    expect(screen.getByRole("heading", { name: /Me sobró plata/ })).toBeInTheDocument();
    expect(screen.getByText(/Importante:/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Llevame ahí" }));
    expect(screen.getByTestId("ruta")).toHaveTextContent("/pos");
    expect(onClose).toHaveBeenCalled();
  });

  it("Volver sube un nivel", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Vender" }));
    expect(screen.getByRole("button", { name: /Anular una venta/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.getByText("¿Sobre qué es tu duda?")).toBeInTheDocument();
  });

  it("el buscador encuentra y, si no, ofrece WhatsApp con lo que buscó", () => {
    abrir();
    const campo = screen.getByPlaceholderText(/Escribí tu duda/);
    fireEvent.change(campo, { target: { value: "como anulo una venta" } });
    expect(screen.getByRole("button", { name: /Anular una venta/ })).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "receta de pizza" } });
    expect(screen.getByText(/No encontré una respuesta/)).toBeInTheDocument();
    const wa = screen.getByRole("link", { name: /Escribir a soporte/ });
    expect(decodeURIComponent(wa.getAttribute("href")!)).toContain('Busqué: "receta de pizza"');
  });

  it("Reportes explica cada reporte con su Cómo se calcula", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Reportes" }));
    expect(screen.getByText("¿Para qué sirve cada reporte?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Cierres de caja/ }));
    expect(screen.getByRole("heading", { name: "Cierres de caja" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir reporte" }));
    expect(screen.getByTestId("ruta")).toHaveTextContent("/reportes/cierres");
  });

  it("al cajero no le ofrece Mi equipo", () => {
    sesion.rol = "CAJERO";
    abrir();
    expect(screen.getByRole("button", { name: "Vender" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mi equipo" })).not.toBeInTheDocument();
  });
});
