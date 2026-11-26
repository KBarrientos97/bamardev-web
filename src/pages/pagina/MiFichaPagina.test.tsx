import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiConsultaNutricion, type ConsultaPaciente } from "../../lib/nutricion/consulta";
import { bajarPdfSeguimiento } from "../../lib/nutricion/seguimiento/pdf";
import { CATALOGO, control, paciente } from "../../test/nutricionFixtures";
import { armarTratamiento, CATALOGO_SEGUIMIENTO, pacientesDePrueba } from "../../test/seguimientoFixtures";
import MiFichaPagina from "./MiFichaPagina";

/**
 * «Consultar mi ficha» (nutrición, 25-nov): con el carnet se ve la evaluación
 * y el tratamiento de sólo lectura, sin pagos y sin nada que edite; «Salir»
 * lo borra; un carnet que no lleva a nada muestra el mensaje del servidor.
 */

vi.mock("../../lib/nutricion/consulta", async (original) => ({
  ...(await original<typeof import("../../lib/nutricion/consulta")>()),
  apiConsultaNutricion: { info: vi.fn(), consultar: vi.fn() },
}));
// Sin página publicada: igual se consulta (con el verde de nutrición).
vi.mock("../../lib/pagina/usePaginaPublica", () => ({ usePaginaPublica: () => ({ pagina: null, error: "" }) }));
vi.mock("../../lib/nutricion/seguimiento/pdf", async (original) => ({
  ...(await original<typeof import("../../lib/nutricion/seguimiento/pdf")>()),
  bajarPdfSeguimiento: vi.fn(),
}));

vi.setConfig({ testTimeout: 20_000 });

const HOY = "2026-11-25";

function consulta(): ConsultaPaciente {
  const prueba = pacientesDePrueba(HOY).find((p) => p.tratamientos.length > 0)!;
  // Como lo manda el backend: el tratamiento sin pagos.
  const t = armarTratamiento(prueba.tratamientos[0], { avisarPagos: false });
  const sinPagos = {
    ...t,
    nota: null,
    resumen: { ...t.resumen, pagado: { medicamento: 0, control: 0, otro: 0, total: 0 }, pagosPendientes: [], proximoPago: null },
    registros: t.registros.map((r) => ({ ...r, tocaPago: false, pagoMedicamento: null, pagoControl: null, pagoOtro: null, pagoNota: null, registradoPor: null, actualizadoPor: null })),
  };
  const { clienteId: _c, ...p } = paciente({
    nombre: "Ana Rojas",
    ci: "8958703",
    controles: [control({ id: 1, fecha: "2026-10-01", inicial: true, pesoKg: 90, imc: 35.2, imcGrado: "OBESIDAD_2" })],
  });
  void _c;
  const { ajustes: _a, ...catSeg } = CATALOGO_SEGUIMIENTO;
  void _a;
  return { negocio: "Consultorio Vida", paciente: p, catalogo: CATALOGO, seguimiento: { catalogo: catSeg, tratamientos: [sinPagos] } };
}

function abrir() {
  return render(
    <MemoryRouter initialEntries={["/p/vida/mi-ficha"]}>
      <Routes>
        <Route path="/p/:subdominio/mi-ficha" element={<MiFichaPagina />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Consultar mi ficha (página pública de nutrición)", () => {
  beforeEach(() => {
    vi.mocked(apiConsultaNutricion.info).mockResolvedValue({ negocio: "Consultorio Vida", telefono: null });
    vi.mocked(apiConsultaNutricion.consultar).mockReset();
  });

  it("con el carnet ve su evaluación y su tratamiento, sin pagos ni nada para editar", async () => {
    vi.mocked(apiConsultaNutricion.consultar).mockResolvedValue(consulta());
    abrir();
    fireEvent.change(await screen.findByLabelText("Carnet de identidad"), { target: { value: " 8958703 " } });
    fireEvent.click(screen.getByRole("button", { name: "Ver mi ficha" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Ana Rojas" })).toBeInTheDocument();
    expect(apiConsultaNutricion.consultar).toHaveBeenCalledWith("vida", { ci: "8958703" });
    // La evaluación: sus controles, sin «Nuevo control» ni «Editar ficha».
    expect(screen.getByText("Controles")).toBeInTheDocument();
    expect(screen.queryByText(/Nuevo control/)).toBeNull();
    expect(screen.queryByText(/Editar ficha/)).toBeNull();
    // El tratamiento: las semanas, sin «Pagado» ni «Pagos».
    fireEvent.click(screen.getByRole("button", { name: "Tratamiento" }));
    expect(await screen.findByText(/semana a semana/)).toBeInTheDocument();
    expect(screen.queryByText(/Pagado/)).toBeNull();
    expect(screen.queryByText(/Pagos/)).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /Descargar PDF/ })[0]);
    expect(bajarPdfSeguimiento).toHaveBeenCalled();
    // «Salir» borra lo consultado y vuelve al carnet (vacío).
    fireEvent.click(screen.getByRole("button", { name: /Salir/ }));
    expect(screen.queryByText("Ana Rojas")).toBeNull();
    expect((screen.getByLabelText("Carnet de identidad") as HTMLInputElement).value).toBe("");
  });

  it("un carnet que no lleva a nada muestra el mensaje del servidor", async () => {
    vi.mocked(apiConsultaNutricion.consultar).mockRejectedValue(new Error("No encontramos una ficha con ese carnet. Revisalo o escribinos."));
    abrir();
    fireEvent.change(await screen.findByLabelText("Carnet de identidad"), { target: { value: "0000001" } });
    fireEvent.click(screen.getByRole("button", { name: "Ver mi ficha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No encontramos una ficha con ese carnet");
  });

  it("otro rubro (404) dice que no está disponible", async () => {
    vi.mocked(apiConsultaNutricion.info).mockRejectedValue(new Error("Esta consulta no está disponible."));
    abrir();
    expect(await screen.findByText(/no está disponible/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Carnet de identidad")).toBeNull();
  });
});
