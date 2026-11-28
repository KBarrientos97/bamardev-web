import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CursoPublico, GrupoPublico } from "../../lib/academia/tipos";

/**
 * Qué grupo llega elegido (28-nov): el de la dirección si se publica; sin
 * grupo, el primero con lugar; con uno que no está, se pasa a `/inscribirme`
 * y se avisa.
 */

vi.mock("../../lib/pagina/usePaginaPublica", () => ({
  usePaginaPublica: () => ({ pagina: { nombre: "Horizonte", color: { clave: "INDIGO", hex: "#3B42A9" } }, error: null }),
}));

vi.mock("../../lib/academia/apiPublica", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiPublica")>();
  return { ...real, apiAcademiaPublica: { cursos: vi.fn(), carnet: vi.fn(), preinscribir: vi.fn() } };
});

import { apiAcademiaPublica } from "../../lib/academia/apiPublica";
import InscribirmePagina from "./InscribirmePagina";

const grupo = (id: number, horaInicio: string, cuposLibres: number): GrupoPublico => ({
  id,
  sede: { id: 1, nombre: "Central" },
  dias: [1, 3, 5],
  horaInicio,
  horaFin: "23:00",
  fechaInicio: "2099-01-11",
  cuposLibres,
});

const curso = (grupos: GrupoPublico[]): CursoPublico => ({
  id: 1,
  nombre: "Tatuajes",
  descripcion: null,
  horasTotales: 0,
  fotoUrl: null,
  materias: ["M1"],
  desde: 500,
  grupos,
});

function Donde() {
  return <p data-testid="ruta">{useLocation().pathname}</p>;
}

async function montar(ruta: string) {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/p/:subdominio/inscribirme" element={<InscribirmePagina />} />
        <Route path="/p/:subdominio/inscribirme/:grupoId" element={<InscribirmePagina />} />
      </Routes>
      <Donde />
    </MemoryRouter>,
  );
}

const elegido = () => screen.getAllByRole("radio").find((r) => r.getAttribute("aria-checked") === "true")?.textContent;
const AVISO = /ya no recibe inscripciones. Revisá/;

describe("InscribirmePagina: el grupo de la dirección", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(apiAcademiaPublica.cursos).mockResolvedValue([curso([grupo(1, "08:00", 0), grupo(2, "10:00", 5), grupo(3, "15:00", 5)])]);
  });

  it("sin grupo, llega elegido el primero con lugar", async () => {
    await montar("/p/horizonte/inscribirme");
    await screen.findByText("Elegí tu horario", { selector: "h1" });
    expect(elegido()).toContain("10:00");
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it("con un grupo que se publica, ese", async () => {
    await montar("/p/horizonte/inscribirme/3");
    await screen.findByText("Elegí tu horario", { selector: "h1" });
    expect(elegido()).toContain("15:00");
    expect(screen.getByTestId("ruta").textContent).toBe("/p/horizonte/inscribirme/3");
  });

  it.each(["99", "abc"])("con uno que no está (%s), va a /inscribirme y lo avisa", async (id) => {
    await montar(`/p/horizonte/inscribirme/${id}`);
    await screen.findByText(AVISO);
    expect(screen.getByTestId("ruta").textContent).toBe("/p/horizonte/inscribirme");
    expect(elegido()).toContain("10:00");
  });

  it("sin ningún grupo, lo dice en vez de dar vueltas", async () => {
    vi.mocked(apiAcademiaPublica.cursos).mockResolvedValue([curso([])]);
    await montar("/p/horizonte/inscribirme/99");
    await screen.findByText("Por ahora no hay grupos con la inscripción abierta");
  });
});

describe("InscribirmePagina: completar es más fácil (28-nov)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(apiAcademiaPublica.cursos).mockResolvedValue([{ ...curso([grupo(2, "10:00", 5)]), pideFotos: false }]);
    vi.mocked(apiAcademiaPublica.carnet).mockResolvedValue({ nombre: null });
  });

  const siguiente = () => fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

  async function hastaLosDatos() {
    await montar("/p/horizonte/inscribirme");
    await screen.findByText("Elegí tu horario", { selector: "h1" });
    siguiente();
    fireEvent.change(screen.getByLabelText("Carnet de identidad"), { target: { value: "1234567" } });
    siguiente();
    await screen.findByLabelText("Apellidos");
  }

  it("sin pedir fotos son 3 pasos, y «Siguiente» marca lo que falta", async () => {
    await hastaLosDatos();
    expect(screen.getByText(/Paso 2 de 3/)).toBeTruthy();
    expect(screen.queryByText("Escribí tus apellidos.")).toBeNull();
    siguiente();
    expect(screen.getByText("Escribí tus apellidos.")).toBeTruthy();
    expect(screen.getByLabelText(/^Apellidos/).getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(screen.getByLabelText(/^Apellidos/), { target: { value: "Rojas" } });
    fireEvent.change(screen.getByLabelText(/^Nombres/), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText(/^Fecha de nacimiento/), { target: { value: "05031999" } });
    fireEvent.change(screen.getByLabelText(/^WhatsApp/), { target: { value: "70000000" } });
    expect((screen.getByLabelText(/^Fecha de nacimiento/) as HTMLInputElement).value).toBe("05/03/1999");
    siguiente();
    // Del 2 se pasa al pago: sin el paso de las fotos.
    expect(screen.getByText("¿Cómo querés pagar?")).toBeTruthy();
    expect(screen.getByText(/Paso 3 de 3/)).toBeTruthy();
  });

  it("al recargar vuelve lo escrito y el paso", async () => {
    await hastaLosDatos();
    fireEvent.change(screen.getByLabelText(/^Apellidos/), { target: { value: "Rojas" } });
    cleanup();
    await montar("/p/horizonte/inscribirme");
    expect(((await screen.findByLabelText(/^Apellidos/)) as HTMLInputElement).value).toBe("Rojas");
    expect((screen.getByLabelText("Carnet de identidad") as HTMLInputElement).value).toBe("1234567");
  });
});
