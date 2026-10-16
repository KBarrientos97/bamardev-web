import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CursoPublico } from "../../lib/academia/tipos";

/**
 * P2 y P3 · Preinscribirme: el horario, los datos, el tutor si es menor, la
 * privacidad, y la confirmación con el grupo y la sede. Sin captcha en el
 * test (el build no trae la site key).
 */

vi.mock("../../lib/pagina/usePaginaPublica", () => ({
  usePaginaPublica: () => ({
    pagina: {
      subdominio: "horizonte",
      nombre: "CCTP Horizonte",
      color: { clave: "INDIGO", hex: "#3B42A9" },
      destacado: null,
      botones: [{ id: 1, tipo: "WHATSAPP", etiqueta: "WhatsApp", url: "https://wa.me/59170000000", icono: null }],
      redes: [],
    },
    error: null,
  }),
}));

vi.mock("../../lib/academia/apiPublica", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiPublica")>();
  return { ...real, apiAcademiaPublica: { cursos: vi.fn(), preinscribir: vi.fn() } };
});

import { apiAcademiaPublica } from "../../lib/academia/apiPublica";
import InscribirmePagina from "./InscribirmePagina";

const CURSO: CursoPublico = {
  id: 3,
  nombre: "Barbería y Peluquería",
  descripcion: null,
  horasTotales: 120,
  fotoUrl: null,
  materias: ["Corte clásico", "Degradados", "Barba y color"],
  desde: 533,
  grupos: [
    { id: 21, sede: { id: 1, nombre: "Central" }, dias: [1, 2, 3, 4, 5], horaInicio: "19:00", horaFin: "21:00", fechaInicio: "2026-11-03", cuposLibres: 16 },
    { id: 22, sede: { id: 2, nombre: "Norte" }, dias: [6], horaInicio: "08:00", horaFin: "12:00", fechaInicio: "2026-11-08", cuposLibres: 8 },
  ],
};

async function montar(grupo = 22) {
  render(
    <MemoryRouter initialEntries={[`/p/horizonte/inscribirme/${grupo}`]}>
      <Routes>
        <Route path="/p/:subdominio/inscribirme/:grupoId" element={<InscribirmePagina />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiAcademiaPublica.cursos).mockResolvedValue([CURSO]);
  vi.mocked(apiAcademiaPublica.preinscribir).mockResolvedValue({
    ok: true,
    grupo: { nombre: "Barbería · Sáb 08:00", sede: "Norte", fechaInicio: "2026-11-08", direccion: "Av. Banzer, 4.º anillo" },
  });
});

describe("P2 · Preinscribirme", () => {
  it("viene elegido el horario del enlace y se puede cambiar", async () => {
    await montar();
    expect(screen.getByRole("heading", { name: "Barbería y Peluquería" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /S 08:00–12:00 · Norte|Sáb 08:00–12:00 · Norte/ })).toBeChecked();
  });

  it("un menor completa al tutor y la confirmación dice dónde ir", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Nombres"), { target: { value: "Thiago" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Rojas Lima" } });
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "77788990" } });
    fireEvent.change(screen.getByLabelText("Edad"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar preinscripción" }));
    expect(screen.getByRole("alert")).toHaveTextContent("los datos de tu tutor");
    expect(apiAcademiaPublica.preinscribir).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Nombre del tutor"), { target: { value: "Ana Lima" } });
    fireEvent.change(screen.getByLabelText("WhatsApp del tutor"), { target: { value: "77788991" } });
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar preinscripción" }));
    });
    expect(apiAcademiaPublica.preinscribir).toHaveBeenCalledWith("horizonte", {
      grupoId: 22,
      nombres: "Thiago",
      apellidos: "Rojas Lima",
      telefono: "77788990",
      edad: 15,
      tutor: { nombre: "Ana Lima", telefono: "77788991" },
      privacidad: true,
    });
    expect(screen.getByRole("heading", { name: "¡Listo, Thiago!" })).toBeInTheDocument();
    expect(screen.getByText("Av. Banzer, 4.º anillo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Escribirnos por WhatsApp" })).toHaveAttribute("href", "https://wa.me/59170000000");
  });

  it("un grupo que ya no está publicado no ofrece el formulario", async () => {
    await montar(99);
    expect(screen.getByText("Este grupo ya no recibe preinscripciones")).toBeInTheDocument();
  });
});
