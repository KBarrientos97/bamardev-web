import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CursoPublico } from "../../lib/academia/tipos";
import type { TonosPagina } from "../../lib/pagina/estilosPagina";
import CursosPagina from "./CursosPagina";

/**
 * P1 · Cursos en la página del instituto (ronda 2): el precio de las dos
 * formas con lo que se ahorra, los módulos, y "Inscribirme" al próximo grupo.
 */

const T = {
  tarjeta: "#fff",
  borde: null,
  sombra: null,
  textoTarjeta: "#111",
  texto2Tarjeta: "#333",
  texto3Tarjeta: "#666",
  precio: "#3B42A9",
} as unknown as TonosPagina;

const CURSO: CursoPublico = {
  id: 3,
  nombre: "Barbería",
  descripcion: null,
  horasTotales: 120,
  fotoUrl: null,
  materias: ["Corte clásico", "Degradados", "Barba y color"],
  desde: 500,
  precioModulo: 500,
  precioCompleto: 1350,
  ahorro: 150,
  modulos: ["Corte clásico", "Degradados", "Barba y color"],
  planes: [],
  grupos: [{ id: 21, sede: { id: 1, nombre: "Central" }, dias: [1, 3, 5], horaInicio: "19:00", horaFin: "21:00", fechaInicio: "2026-11-10", cuposLibres: 8 }],
};

describe("P1 · Cursos", () => {
  it("dice el precio por módulo y todo junto, lo que ahorra, y lleva a inscribirse", () => {
    render(<CursosPagina cursos={[CURSO, { ...CURSO, id: 4, nombre: "Maquillaje", grupos: [] }]} t={T} colorBoton="#282D73" radio={12} titulo={<h2>Cursos</h2>} escritorio={false} urlInscribirme={(g) => `/p/horizonte/inscribirme/${g}`} />);
    expect(screen.getAllByText(/3 módulos · Corte clásico · Degradados · Barba y color/)).toHaveLength(2);
    expect(screen.getAllByText(/todo junto/)[0]).toHaveTextContent("Bs 500 por módulo · o Bs 1.350 todo junto");
    expect(screen.getAllByText("Pagando todo junto ahorrás Bs 150")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Inscribirme" })).toHaveAttribute("href", "/p/horizonte/inscribirme/21");
    expect(screen.getByText("Próximo grupo por confirmar.")).toBeInTheDocument();
  });

  it("M5: lleva a «Pagar mi inscripción» y manda al primer grupo con lugar", () => {
    const llenoYLibre: CursoPublico = {
      ...CURSO,
      grupos: [
        { ...CURSO.grupos[0], id: 21, cuposLibres: 0 },
        { ...CURSO.grupos[0], id: 22, cuposLibres: 5 },
      ],
    };
    render(<CursosPagina cursos={[llenoYLibre]} t={T} colorBoton="#282D73" radio={12} titulo={<h2>Cursos</h2>} escritorio={false} urlInscribirme={(g) => `/p/horizonte/inscribirme/${g}`} urlMiCuenta="/p/horizonte/mi-cuenta" />);
    expect(screen.getByRole("link", { name: "Pagar mi inscripción" })).toHaveAttribute("href", "/p/horizonte/mi-cuenta");
    // El 21 está lleno: ya no recibe preinscripciones, se va al 22.
    expect(screen.getByRole("link", { name: "Inscribirme" })).toHaveAttribute("href", "/p/horizonte/inscribirme/22");
  });

  it("M5: con todos los grupos llenos no hay botón: se comunican con la academia", () => {
    const lleno: CursoPublico = { ...CURSO, grupos: [{ ...CURSO.grupos[0], cuposLibres: 0 }] };
    render(<CursosPagina cursos={[lleno]} t={T} colorBoton="#282D73" radio={12} titulo={<h2>Cursos</h2>} escritorio={false} urlInscribirme={(g) => `/p/horizonte/inscribirme/${g}`} />);
    expect(screen.queryByRole("link", { name: "Inscribirme" })).not.toBeInTheDocument();
    expect(screen.getByText("Los grupos están llenos, comunicate con la academia.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Pagar mi inscripción" })).not.toBeInTheDocument();
  });

  it("Drick, 08-nov: dice desde cuánto se asegura el cupo, el menor de los grupos con lugar", () => {
    const conAdelanto: CursoPublico = {
      ...CURSO,
      grupos: [
        { ...CURSO.grupos[0], id: 21, cuposLibres: 0, adelantoDesde: 50 },
        { ...CURSO.grupos[0], id: 22, cuposLibres: 5, adelantoDesde: 150 },
        { ...CURSO.grupos[0], id: 23, cuposLibres: null, adelantoDesde: 100 },
      ],
    };
    render(<CursosPagina cursos={[conAdelanto]} t={T} colorBoton="#282D73" radio={12} titulo={<h2>Cursos</h2>} escritorio={false} urlInscribirme={(g) => `/p/horizonte/inscribirme/${g}`} />);
    // El 21 está lleno: su adelanto no cuenta.
    expect(screen.getByText(/Asegurá tu cupo desde/)).toHaveTextContent("Asegurá tu cupo desde Bs 100, a cuenta del primer mes");
  });

  it("sin adelanto (sin QR o sin mínimo) no lo menciona", () => {
    render(<CursosPagina cursos={[CURSO]} t={T} colorBoton="#282D73" radio={12} titulo={<h2>Cursos</h2>} escritorio={false} urlInscribirme={(g) => `/p/horizonte/inscribirme/${g}`} />);
    expect(screen.queryByText(/Asegurá tu cupo/)).not.toBeInTheDocument();
  });
});
