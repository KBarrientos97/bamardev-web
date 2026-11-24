import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiNutricion } from "../../lib/nutricion/api";
import { bajarPdfEvaluacion, documentoEvaluacion } from "../../lib/nutricion/pdfEvaluacion";
import type { Paciente, PesoDelPaciente } from "../../lib/nutricion/tipos";
import { CATALOGO, control, paciente } from "../../test/nutricionFixtures";
import PlanillaPaciente from "./PlanillaPaciente";

/**
 * La planilla del paciente con el PDF (CONTRATO-nutricion-evaluacion-22nov
 * §6.1): «Descargar PDF» y «Enviar por WhatsApp» en la tarjeta «Controles»,
 * también para el que sólo mira y con el paciente archivado; sin nada para el
 * papel (ni controles ni pesos), no están. Y el papel dice lo mismo que las
 * tarjetas de arriba.
 */

const sesion = vi.hoisted(() => ({ permisos: [] as string[] }));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, username: "prueba", rol: "PROFESIONAL", rolNombre: "Nutricionista", permisos: sesion.permisos, permisosPropios: [] },
    negocio: { nombre: "Consultorio de prueba", tipoNegocio: "NUTRICION", features: ["nutricion"] },
    puede: () => false,
  }),
}));

vi.mock("../../lib/nutricion/api", async (original) => ({
  ...(await original<typeof import("../../lib/nutricion/api")>()),
  apiNutricion: { catalogo: vi.fn(), paciente: vi.fn() },
}));

vi.mock("../../lib/nutricion/pdfEvaluacion", async (original) => ({
  ...(await original<typeof import("../../lib/nutricion/pdfEvaluacion")>()),
  bajarPdfEvaluacion: vi.fn(),
  enviarPdfEvaluacionPorWhatsapp: vi.fn(),
}));

// La planilla entera es pesada: con la máquina cargada pasaba los 5 s de fábrica.
vi.setConfig({ testTimeout: 20_000 });

const controles = [
  control({ id: 1, fecha: "2026-10-01", inicial: true, pesoKg: 72, imc: 28.8, imcGrado: "SOBREPESO", grasaPct: 35.2, grasaGrado: "SOBRE_PROMEDIO", cinturaCm: 92 }),
  control({ id: 2, fecha: "2026-10-15", pesoKg: 71.5, imc: 28.6, imcGrado: "SOBREPESO", grasaPct: 34, grasaGrado: "SOBRE_PROMEDIO", cinturaCm: 90 }),
  control({ id: 3, fecha: "2026-11-01", pesoKg: 70.95, imc: 28.4, imcGrado: "SOBREPESO", musculoPct: 25, musculoGrado: "NORMAL", grasaVisceral: 7.5, visceralGrado: "NORMAL" }),
];
const semana = (fecha: string, pesoKg: number, imc: number): PesoDelPaciente => ({ fecha, pesoKg, imc, imcGrado: "SOBREPESO", origen: "SEGUIMIENTO", controlId: null, registroId: 9, semana: 1 });

async function abrir(p: Paciente) {
  vi.mocked(apiNutricion.paciente).mockResolvedValue(p);
  const r = render(
    <MemoryRouter initialEntries={[`/evaluacion/${p.id}`]}>
      <Routes>
        <Route path="/evaluacion/:id" element={<PlanillaPaciente />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { level: 1 }, { timeout: 5000 });
  return r;
}

beforeEach(() => {
  vi.mocked(apiNutricion.catalogo).mockResolvedValue(CATALOGO);
  vi.mocked(bajarPdfEvaluacion).mockReset();
  sesion.permisos = ["nutricion.ver"];
});

describe("los botones del PDF", () => {
  it("están para el que sólo mira, en la tarjeta «Controles» (sin «Nuevo control»)", async () => {
    await abrir(paciente({ controles }));
    const tarjeta = screen.getByRole("heading", { name: /^Controles/ }).closest("section")!;
    expect(tarjeta).toContainElement(screen.getByRole("button", { name: "Descargar PDF" }));
    expect(tarjeta).toContainElement(screen.getByRole("button", { name: "Enviar por WhatsApp" }));
    expect(screen.queryByRole("button", { name: /Nuevo control/ })).not.toBeInTheDocument();
  });

  it("con el paciente archivado, también", async () => {
    await abrir(paciente({ controles, activo: false }));
    expect(screen.getByText("Archivado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descargar PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar por WhatsApp" })).toBeInTheDocument();
  });

  it("sin controles ni pesos no están (no hay nada para el papel); con pesos del seguimiento, sí", async () => {
    const { unmount } = await abrir(paciente({ controles: [], pesos: [] }));
    expect(screen.getByText("Todavía no hay controles")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Descargar PDF" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar por WhatsApp" })).not.toBeInTheDocument();
    unmount();
    await abrir(paciente({ controles: [], pesos: [semana("2026-11-08", 70.5, 28.2)] }));
    expect(screen.getByRole("button", { name: "Descargar PDF" })).toBeInTheDocument();
  });

  it("«Descargar PDF»: «Armando…» con los dos apagados, el papel con el negocio, y el aviso al terminar", async () => {
    sesion.permisos = ["nutricion.ver", "nutricion.editar"];
    let terminar: (r: "descargado") => void = () => {};
    vi.mocked(bajarPdfEvaluacion).mockImplementation(() => new Promise((ok) => (terminar = ok)));
    await abrir(paciente({ controles }));
    fireEvent.click(screen.getByRole("button", { name: "Descargar PDF" }));
    expect(screen.getByRole("button", { name: "Descargar PDF" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar por WhatsApp" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Descargar PDF" })).toHaveTextContent("Armando…");
    const doc = vi.mocked(bajarPdfEvaluacion).mock.calls[0][0];
    expect(doc.negocio).toBe("Consultorio de prueba");
    expect(doc.paciente).toBe("Lucía Paredes Soria");
    await act(async () => terminar("descargado"));
    await waitFor(() => expect(screen.getByText("PDF de la evaluación listo.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Descargar PDF" })).toBeEnabled();
  });
});

describe("el papel dice lo mismo que las tarjetas", () => {
  /** Lo que dice cada tarjeta de arriba, con el cambio pasado a palabras como en el papel. */
  function tarjetas(contenedor: HTMLElement) {
    const nb = (s: string | null) => (s ?? "").replace(/ /g, " ").trim();
    const conPalabras = (t: string) =>
      t.replace(/^([+−]?)([\d,]+)(.*) desde el (inicio|anterior)$/, (_, signo: string, cifra: string, resto: string, desde: string) =>
        cifra === "0" ? (desde === "inicio" ? "Igual que al inicio" : "Igual que el anterior") : `${signo === "+" ? "Subió" : "Bajó"} ${cifra}${resto} desde el ${desde}`,
      );
    return Array.from(contenedor.querySelectorAll(".grid > div.card")).slice(0, 6).map((c) => {
      const ps = Array.from(c.querySelectorAll(":scope > p")).map((p) => nb(p.textContent));
      const chip = c.querySelector(":scope > span");
      return {
        etiqueta: ps[0].toUpperCase(),
        valor: ps[1],
        grado: chip ? nb(chip.textContent) : null,
        cambios: ps.slice(2).filter((t) => / desde el /.test(t)).map(conPalabras),
        delSeguimiento: ps.slice(2).find((t) => t.startsWith("del seguimiento")) ?? null,
      };
    });
  }

  it("sin la serie del seguimiento", async () => {
    const p = paciente({ controles });
    const { container } = await abrir(p);
    const doc = documentoEvaluacion({ negocio: null, paciente: p, catalogo: CATALOGO });
    expect(tarjetas(container)).toEqual(doc.hoy.map((k) => ({ ...k, grado: k.grado?.nombre ?? null })));
    expect(doc.hoy[0].cambios).toEqual(["Bajó 1,05 kg desde el inicio", "Bajó 0,55 kg desde el anterior"]);
  });

  it("con pesos del seguimiento", async () => {
    const p = paciente({
      controles,
      pesos: [
        { fecha: "2026-10-01", pesoKg: 72, imc: 28.8, imcGrado: "SOBREPESO", origen: "CONTROL", controlId: 1, registroId: null, semana: null },
        semana("2026-10-08", 71.8, 28.8),
        { fecha: "2026-10-15", pesoKg: 71.5, imc: 28.6, imcGrado: "SOBREPESO", origen: "CONTROL", controlId: 2, registroId: null, semana: null },
        { fecha: "2026-11-01", pesoKg: 70.95, imc: 28.4, imcGrado: "SOBREPESO", origen: "CONTROL", controlId: 3, registroId: null, semana: null },
        semana("2026-11-08", 70.5, 28.2),
      ],
    });
    const { container } = await abrir(p);
    const doc = documentoEvaluacion({ negocio: null, paciente: p, catalogo: CATALOGO });
    expect(tarjetas(container)).toEqual(doc.hoy.map((k) => ({ ...k, grado: k.grado?.nombre ?? null })));
    expect(doc.hoy[0]).toMatchObject({ valor: "70,5 kg", delSeguimiento: "del seguimiento (08/11/2026)" });
  });
});
