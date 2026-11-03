import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HojaNueva } from "../../lib/planilla";
import { BotonExportar } from "./BotonExportar";
import type { ExportacionCompleta } from "./contexto";

/**
 * El botón "Exportar a Excel" de Reportes (REP-03, 28-oct): un reporte
 * paginado baja el período entero antes de armar la planilla, y eso tarda.
 */

const bajarXlsx = vi.hoisted(() => vi.fn());

vi.mock("./contexto", async (original) => ({
  ...(await original<typeof import("./contexto")>()),
  bajarXlsx,
}));

const HOJA: HojaNueva = { nombre: "Ventas", filas: [["Comprobante"], ["V-000001"]] };

beforeEach(() => bajarXlsx.mockReset());

describe("Exportar a Excel", () => {
  it("un reporte común baja al instante lo que arma, como siempre", () => {
    render(<BotonExportar exportacion={{ nombre: "top-productos", hojas: () => [HOJA] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Exportar a Excel" }));
    expect(bajarXlsx).toHaveBeenCalledWith("top-productos", [HOJA]);
  });

  it("uno paginado dice «Preparando…» mientras baja el período, y un segundo toque no lo pide de nuevo", async () => {
    let terminar: (r: ExportacionCompleta) => void = () => {};
    const completa = vi.fn(() => new Promise<ExportacionCompleta>((ok) => (terminar = ok)));
    const hojas = vi.fn(() => [HOJA]);
    render(<BotonExportar exportacion={{ nombre: "ventas-general", hojas, completa }} />);

    fireEvent.click(screen.getByRole("button", { name: "Exportar a Excel" }));
    fireEvent.click(screen.getByRole("button", { name: "Preparando…" }));
    expect(screen.getByRole("button", { name: "Preparando…" })).toBeDisabled();
    expect(completa).toHaveBeenCalledTimes(1);
    expect(bajarXlsx).not.toHaveBeenCalled();

    await act(async () => terminar({ hojas: [HOJA], aviso: null }));
    // Baja lo que trajo `completa`, no la página que se ve.
    expect(bajarXlsx).toHaveBeenCalledWith("ventas-general", [HOJA]);
    expect(hojas).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Exportar a Excel" })).toBeEnabled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("si la planilla vino recortada, lo dice debajo del botón", async () => {
    const aviso = "El Excel trae las 5.000 filas más nuevas de las 7.312 del período: acortá el período para bajar el resto.";
    render(
      <BotonExportar
        exportacion={{ nombre: "ventas-general", hojas: () => [], completa: async () => ({ hojas: [HOJA], aviso }) }}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Exportar a Excel" }));
    });
    expect(bajarXlsx).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(aviso);
  });

  it("si una página falla no baja nada y dice por qué", async () => {
    // Una planilla a la que le falta una página en silencio se lee como el
    // período entero.
    render(
      <BotonExportar
        exportacion={{
          nombre: "movimientos-de-caja",
          hojas: () => [],
          completa: async () => {
            throw new Error("Se cortó la conexión.");
          },
        }}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Exportar a Excel" }));
    });
    expect(bajarXlsx).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo armar el Excel: Se cortó la conexión.");
    expect(screen.getByRole("button", { name: "Exportar a Excel" })).toBeEnabled();
  });
});
