import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ajustesDePrueba, grupoDetalle } from "../../test/academiaFixtures";

/**
 * B9 · Compartir enlace de inscripción: la dirección pública del grupo
 * (`/p/<sub>/inscribirme/<grupo>`), copiarla y mandarla por WhatsApp con un
 * texto armado. El subdominio sale de los ajustes (si el backend lo manda) o
 * de "Mi página" (sólo el dueño).
 */

const sesion = vi.hoisted(() => ({ conPagina: false }));

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA: s } = await import("../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, puede: (sec: string) => (sec === "mi_pagina" ? sesion.conPagina : true) }) };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { ajustes: vi.fn(), grupos: vi.fn() } };
});

vi.mock("../../lib/pagina/apiPagina", () => ({ apiPagina: { estado: vi.fn() } }));

vi.mock("../../lib/agenda/recordatorio", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/recordatorio")>();
  return { ...real, copiarTexto: vi.fn(async () => true) };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import { copiarTexto } from "../../lib/agenda/recordatorio";
import { apiPagina } from "../../lib/pagina/apiPagina";
import { BotonCompartirInscripcion } from "./CompartirInscripcion";

const GRUPO = grupoDetalle();

beforeEach(() => {
  vi.clearAllMocks();
  sesion.conPagina = false;
  vi.spyOn(window, "open").mockImplementation(() => null);
  vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ subdominio: "horizonte" }));
  vi.mocked(apiAcademia.grupos).mockResolvedValue({
    items: [
      { ...GRUPO, id: 7, inscripcionAbierta: true },
      { ...GRUPO, id: 8, horaInicio: "19:00", horaFin: "21:00", inscripcionAbierta: true },
      { ...GRUPO, id: 9, inscripcionAbierta: false },
    ],
    total: 3,
    page: 1,
    pageSize: 100,
  });
});

async function abrir(props: Parameters<typeof BotonCompartirInscripcion>[0] = {}) {
  render(
    <MemoryRouter>
      <BotonCompartirInscripcion {...props} />
    </MemoryRouter>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Compartir enlace de inscripción" }));
  });
  await act(async () => {});
}

describe("B9 · compartir enlace de inscripción", () => {
  it("con el grupo de la ficha: la dirección pública, copiarla y WhatsApp con el texto armado", async () => {
    await abrir({ grupo: GRUPO });
    const enlace = screen.getByLabelText("Enlace de inscripción") as HTMLInputElement;
    expect(enlace.value).toBe(`${window.location.origin}/p/horizonte/inscribirme/7`);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copiar enlace" }));
    });
    expect(copiarTexto).toHaveBeenCalledWith(enlace.value);
    expect(screen.getByText("Enlace copiado.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mandar por WhatsApp" }));
    const url = vi.mocked(window.open).mock.calls[0][0] as string;
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    const texto = decodeURIComponent(url.split("text=")[1]);
    expect(texto).toContain("Barbería y Peluquería");
    expect(texto).toContain("/p/horizonte/inscribirme/7");
    expect(apiAcademia.grupos).not.toHaveBeenCalled();
  });

  it("sin grupo (Preinscripciones, Cursos): elige entre los que tienen la inscripción abierta", async () => {
    await abrir({ carreraId: 3 });
    expect(apiAcademia.grupos).toHaveBeenCalledWith({ pageSize: 100, carreraId: 3 });
    const select = screen.getByRole("combobox", { name: "Grupo" });
    // El 9 tiene la inscripción cerrada: no se ofrece.
    expect(select.querySelectorAll("option")).toHaveLength(3);
    expect(screen.queryByLabelText("Enlace de inscripción")).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: "8" } });
    expect((screen.getByLabelText("Enlace de inscripción") as HTMLInputElement).value).toMatch(/\/p\/horizonte\/inscribirme\/8$/);
  });

  it("si los ajustes no traen el subdominio, el dueño lo toma de «Mi página»", async () => {
    sesion.conPagina = true;
    vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba());
    vi.mocked(apiPagina.estado).mockResolvedValue({ subdominio: "elmana" } as never);
    await abrir({ grupo: GRUPO });
    expect((screen.getByLabelText("Enlace de inscripción") as HTMLInputElement).value).toMatch(/\/p\/elmana\/inscribirme\/7$/);
  });

  it("sin subdominio a la vista lo dice, sin enlace roto", async () => {
    vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba());
    await abrir({ grupo: GRUPO });
    expect(apiPagina.estado).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Enlace de inscripción")).not.toBeInTheDocument();
    expect(screen.getByText(/todavía no tiene página propia/)).toBeInTheDocument();
  });
});
