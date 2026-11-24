import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avisaAlCerrar, historialDePrueba } from "../../../test/historial";
import { CATALOGO_SEGUIMIENTO } from "../../../test/seguimientoFixtures";
import HojaTratamiento from "./HojaTratamiento";

/**
 * «Iniciar tratamiento» y el atrás del navegador (23-nov): con algo escrito
 * se llevaba la página de abajo y la hoja, sin preguntar.
 */

vi.mock("../../../lib/nutricion/seguimiento/api", async (original) => ({
  ...(await original<typeof import("../../../lib/nutricion/seguimiento/api")>()),
  apiSeguimiento: { iniciar: vi.fn(), cambiarTratamiento: vi.fn() },
}));

function abrir() {
  const onCerrar = vi.fn();
  render(
    <MemoryRouter>
      <HojaTratamiento
        modo="iniciar"
        pacienteId={20}
        pacienteNombre="Paciente de prueba"
        catalogo={CATALOGO_SEGUIMIENTO}
        ultimoControl={null}
        onCerrar={onCerrar}
        onGuardado={vi.fn()}
      />
    </MemoryRouter>,
  );
  return { onCerrar };
}

describe("iniciar tratamiento: el atrás del navegador", () => {
  let h: ReturnType<typeof historialDePrueba>;
  beforeEach(() => {
    h = historialDePrueba(5);
  });
  afterEach(() => h.limpiar());

  it("con algo escrito se queda y pregunta; «Cancelar» conserva lo escrito y «Cerrar sin guardar» cierra la hoja", () => {
    const { onCerrar } = abrir();
    fireEvent.change(screen.getByLabelText("Tratamiento"), { target: { value: "Un tratamiento" } });

    h.viajar(6);
    expect(h.go).toHaveBeenCalledWith(-1);
    h.viajar(5);
    expect(h.router).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog", { name: "¿Cerrar sin guardar?" })).getByRole("button", { name: "Cancelar" }));
    expect(screen.getByLabelText("Tratamiento")).toHaveValue("Un tratamiento");
    expect(onCerrar).not.toHaveBeenCalled();

    h.viajar(4);
    h.viajar(5);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sin guardar" }));
    expect(onCerrar).toHaveBeenCalledTimes(1);
    expect(h.router).not.toHaveBeenCalled();
  });

  it("sin nada escrito el atrás hace lo de siempre", () => {
    const { onCerrar } = abrir();
    h.viajar(4);
    expect(h.router).toHaveBeenCalledTimes(1);
    expect(h.go).not.toHaveBeenCalled();
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it("cerrar o recargar la pestaña avisa sólo con algo escrito", () => {
    abrir();
    expect(avisaAlCerrar()).toBe(false);
    fireEvent.change(screen.getByLabelText("Tratamiento"), { target: { value: "Un tratamiento" } });
    expect(avisaAlCerrar()).toBe(true);
  });
});
