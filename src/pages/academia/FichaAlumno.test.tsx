import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FotoAlumno } from "../../lib/academia/tipos";

/**
 * E6 · Ficha: las fotos sólo las ve quien tiene `academia.fotos` (los demás,
 * un candado), el administrador las marca revisadas, y el QR por WhatsApp va
 * con el recordatorio de la cuota que se debe.
 */

const sesion = vi.hoisted(() => ({ admin: false }));

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA, SESION_ADMIN } = await import("../../test/academiaFixtures");
  return { useAuth: () => ({ ...(sesion.admin ? SESION_ADMIN : SESION_SECRETARIA), puede: () => true }) };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: { alumno: vi.fn(), fotoComoUrl: vi.fn(), revisarFotos: vi.fn(), recordatorio: vi.fn(), subirFoto: vi.fn() },
  };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import { fichaCamila } from "../../test/academiaFixtures";
import FichaAlumno from "./FichaAlumno";

const FOTOS: FotoAlumno[] = (["FOTO", "CI_ANVERSO", "CI_REVERSO"] as const).map((tipo) => ({
  tipo,
  subidaEn: "2026-08-17T14:00:00.000Z",
  revisadaEn: null,
  revisadaPor: null,
  observacion: null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  sesion.admin = false;
  vi.mocked(apiAcademia.alumno).mockResolvedValue({ ...fichaCamila(), fotos: FOTOS });
  vi.mocked(apiAcademia.fotoComoUrl).mockResolvedValue("blob:foto");
  vi.mocked(apiAcademia.revisarFotos).mockResolvedValue({});
});

async function montar() {
  render(
    <MemoryRouter initialEntries={["/academia/alumnos/52"]}>
      <Routes>
        <Route path="/academia/alumnos/:id" element={<FichaAlumno />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("E6 · ficha del estudiante", () => {
  it("la recepción ve que las fotos están, con candado, sin pedir las imágenes", async () => {
    await montar();
    const fotos = screen.getByRole("region", { name: "Fotos y carnet" });
    expect(within(fotos).getByText("Sólo el administrador ve las fotos")).toBeInTheDocument();
    expect(within(fotos).getByText("Por revisar")).toBeInTheDocument();
    expect(apiAcademia.fotoComoUrl).not.toHaveBeenCalled();
    expect(within(fotos).queryByRole("button", { name: "Marcar revisadas" })).not.toBeInTheDocument();
  });

  it("el administrador ve las imágenes y las marca revisadas", async () => {
    sesion.admin = true;
    await montar();
    const fotos = screen.getByRole("region", { name: "Fotos y carnet" });
    expect(apiAcademia.fotoComoUrl).toHaveBeenCalledTimes(3);
    expect(within(fotos).getAllByRole("img")).toHaveLength(3);
    await act(async () => {
      fireEvent.click(within(fotos).getByRole("button", { name: "Marcar revisadas" }));
    });
    expect(apiAcademia.revisarFotos).toHaveBeenCalledWith(52, { ok: true });
  });

  it("el QR por WhatsApp manda el recordatorio de la cuota vencida, con su enlace", async () => {
    const abrir = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.mocked(apiAcademia.recordatorio).mockResolvedValue({ telefono: "591", texto: "Hola", url: "https://wa.me/591?text=Hola" });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Más acciones del estudiante/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: /Enviar QR por WhatsApp/ }));
    });
    expect(apiAcademia.recordatorio).toHaveBeenCalledWith(902);
    expect(abrir).toHaveBeenCalledWith("https://wa.me/591?text=Hola", "_blank", "noopener,noreferrer");
    abrir.mockRestore();
  });
});
