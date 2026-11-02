import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M5 · Pagar mi inscripción: carnet + fecha de nacimiento. Si coinciden, el
 * estudiante pasa a su estado de cuenta (con una sola inscripción) o elige
 * cuál (con varias); si no, un mensaje que no dice si el carnet existe.
 */

vi.mock("../../lib/pagina/usePaginaPublica", () => ({
  usePaginaPublica: () => ({ pagina: { nombre: "CCTP Horizonte", color: { clave: "INDIGO", hex: "#3B42A9" } }, error: null }),
}));

vi.mock("../../lib/academia/apiPublica", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiPublica")>();
  return { ...real, apiAcademiaPublica: { identificar: vi.fn() } };
});

import { apiAcademiaPublica, ErrorPublico } from "../../lib/academia/apiPublica";
import MiCuentaPagina from "./MiCuentaPagina";

/** Dónde quedó la navegación, para ver a dónde lo llevó. */
function Lugar() {
  return <p data-testid="lugar">{useLocation().pathname}</p>;
}

async function montar() {
  render(
    <MemoryRouter initialEntries={["/p/horizonte/mi-cuenta"]}>
      <Routes>
        <Route path="/p/:subdominio/mi-cuenta" element={<MiCuentaPagina />} />
        <Route path="/p/:subdominio/pagar/:token" element={<Lugar />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

function llenar(ci = "14550221", fecha = "2000-03-04") {
  fireEvent.change(screen.getByLabelText("Carnet de identidad"), { target: { value: ci } });
  fireEvent.change(screen.getByLabelText("Fecha de nacimiento"), { target: { value: fecha } });
}

async function enviar() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Ver lo que debo" }));
  });
}

beforeEach(() => vi.clearAllMocks());

describe("M5 · Pagar mi inscripción", () => {
  it("pide el carnet y la fecha antes de buscar", async () => {
    await montar();
    await enviar();
    expect(screen.getByRole("alert")).toHaveTextContent("Escribí tu carnet de identidad");
    fireEvent.change(screen.getByLabelText("Carnet de identidad"), { target: { value: "14550221" } });
    await enviar();
    expect(screen.getByRole("alert")).toHaveTextContent("Escribí tu fecha de nacimiento");
    expect(apiAcademiaPublica.identificar).not.toHaveBeenCalled();
  });

  it("con una sola inscripción lo lleva directo a su estado de cuenta", async () => {
    vi.mocked(apiAcademiaPublica.identificar).mockResolvedValue({
      inscripciones: [{ token: "K7Q2abcdef", estado: "PREINSCRITA", nombres: "Ana", curso: "Barbería", grupo: "L-M-V", sede: "Central" }],
    });
    await montar();
    llenar();
    await enviar();
    expect(apiAcademiaPublica.identificar).toHaveBeenCalledWith("horizonte", { ci: "14550221", fechaNacimiento: "2000-03-04" });
    expect(screen.getByTestId("lugar")).toHaveTextContent("/p/horizonte/pagar/K7Q2abcdef");
  });

  it("con varias, elige cuál pagar", async () => {
    vi.mocked(apiAcademiaPublica.identificar).mockResolvedValue({
      inscripciones: [
        { token: "AAAAAAAAAA", estado: "ACTIVA", nombres: "Ana", curso: "Barbería", grupo: "L-M-V 07:00", sede: "Central" },
        { token: "BBBBBBBBBB", estado: "PREINSCRITA", nombres: "Ana", curso: "Maquillaje", grupo: "Sáb 08:00", sede: "Norte" },
      ],
    });
    await montar();
    llenar();
    await enviar();
    expect(screen.getByRole("heading", { name: "Elegí cuál querés pagar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Barbería/ })).toHaveAttribute("href", "/p/horizonte/pagar/AAAAAAAAAA");
    expect(screen.getByRole("link", { name: /Maquillaje.*Preinscrito/ })).toHaveAttribute("href", "/p/horizonte/pagar/BBBBBBBBBB");
  });

  it("si no coincide, el mensaje es el del servidor y no dice si el carnet existe", async () => {
    vi.mocked(apiAcademiaPublica.identificar).mockRejectedValue(
      new ErrorPublico("No encontramos una inscripción con esos datos. Revisá tu carnet y tu fecha de nacimiento, o escribinos.", 404, "NO_ENCONTRADO"),
    );
    await montar();
    llenar("9999999", "2000-03-04");
    await enviar();
    expect(screen.getByRole("alert")).toHaveTextContent("No encontramos una inscripción con esos datos");
    // Sigue en el formulario, para corregir.
    expect(screen.getByRole("button", { name: "Ver lo que debo" })).toBeEnabled();
  });

  it("los demasiados intentos se dicen tal cual", async () => {
    vi.mocked(apiAcademiaPublica.identificar).mockRejectedValue(
      new ErrorPublico("Hubo muchos intentos con esos datos. Probá más tarde o acercate al instituto.", 429, "TOPE_MI_CUENTA"),
    );
    await montar();
    llenar();
    await enviar();
    expect(screen.getByRole("alert")).toHaveTextContent("Hubo muchos intentos");
  });
});
