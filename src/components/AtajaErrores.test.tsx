import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Una pantalla que revienta no deja la página en blanco. Pasó en Usuarios al
 * editar a un mesero: React desmontaba todo y no quedaba ni el menú.
 */

vi.mock("../lib/telemetria", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/telemetria")>()),
  reportarError: vi.fn(),
}));

import { reportarError } from "../lib/telemetria";
import AtajaErrores from "./AtajaErrores";

function Revienta(): never {
  throw new Error("rol desconocido");
}

beforeEach(() => {
  vi.clearAllMocks();
  // React avisa por consola cada error atajado; acá es lo esperado.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("la red contra la pantalla en blanco", () => {
  it("sin error devuelve la pantalla tal cual", () => {
    render(
      <AtajaErrores reiniciarCon="/usuarios">
        <p>Usuarios</p>
      </AtajaErrores>,
    );
    expect(screen.getByText("Usuarios")).toBeInTheDocument();
  });

  it("si revienta, avisa, deja salir y lo reporta", () => {
    render(
      <AtajaErrores reiniciarCon="/usuarios">
        <Revienta />
      </AtajaErrores>,
    );
    expect(screen.getByText("Esta pantalla tuvo un error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volver al inicio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recargar" })).toBeInTheDocument();
    expect(reportarError).toHaveBeenCalledWith(
      "pantalla",
      expect.objectContaining({ message: "rol desconocido" }),
      expect.anything(),
    );
  });

  it("al ir a otra dirección se rearma y muestra la nueva pantalla", () => {
    const { rerender } = render(
      <AtajaErrores reiniciarCon="/usuarios">
        <Revienta />
      </AtajaErrores>,
    );
    rerender(
      <AtajaErrores reiniciarCon="/inventario">
        <p>Inventario</p>
      </AtajaErrores>,
    );
    expect(screen.getByText("Inventario")).toBeInTheDocument();
  });
});
