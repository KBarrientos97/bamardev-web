import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CursoPublico } from "../../lib/academia/tipos";
import type { TonosPagina } from "../../lib/pagina/estilosPagina";
import CursosPagina from "./CursosPagina";

/**
 * P1 · Cursos en la página del instituto (ronda 2): el precio de las dos
 * formas con lo que se ahorra, los módulos, y "Inscribirme" al próximo grupo.
 * Con la tarjeta «opción A · Ordenada» (08-nov): precio arriba, el adelanto
 * destacado, los módulos numerados y cada inicio con su cuadrito de fecha.
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
    // Una sola sede entre los grupos: va en la línea de datos. Sin grupos, sólo los módulos.
    expect(screen.getByText("3 módulos · Central")).toBeInTheDocument();
    expect(screen.getByText("3 módulos")).toBeInTheDocument();
    expect(screen.getAllByText("Bs 500")).toHaveLength(2);
    expect(screen.getAllByText("por módulo")).toHaveLength(2);
    expect(screen.getAllByText(/el curso completo/)[0]).toHaveTextContent("o Bs 1.350 el curso completo");
    expect(screen.getAllByText("ahorrás Bs 150")).toHaveLength(2);
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
    expect(screen.getByText("Asegurá tu cupo con Bs 100")).toBeInTheDocument();
    expect(screen.getByText("Se descuenta del primer mes")).toBeInTheDocument();
    // Es un adelanto a cuenta del primer mes, nunca una «reserva» (RM 0008/2016).
    expect(screen.queryByText(/reserva/i)).not.toBeInTheDocument();
  });

  it("sin adelanto (sin QR o sin mínimo) no lo menciona", () => {
    render(<CursosPagina cursos={[CURSO]} t={T} colorBoton="#282D73" radio={12} titulo={<h2>Cursos</h2>} escritorio={false} urlInscribirme={(g) => `/p/horizonte/inscribirme/${g}`} />);
    expect(screen.queryByText(/Asegurá tu cupo/)).not.toBeInTheDocument();
    expect(screen.queryByText("Se descuenta del primer mes")).not.toBeInTheDocument();
  });

  it("los módulos van numerados, sin el número que ya traen en el nombre", () => {
    const conPrefijo: CursoPublico = { ...CURSO, modulos: ["Modulo 1: Fundamentos", "M2 - Degradados", "Barba y color"] };
    render(<CursosPagina cursos={[conPrefijo]} t={T} colorBoton="#282D73" radio={12} titulo={<h2>Cursos</h2>} escritorio={false} />);
    expect(screen.getByText("QUÉ VAS A APRENDER")).toBeInTheDocument();
    const lista = screen.getByText("QUÉ VAS A APRENDER").nextElementSibling as HTMLElement;
    const items = within(lista).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["1Fundamentos", "2Degradados", "3Barba y color"]);
    expect(screen.queryByText(/Modulo 1/)).not.toBeInTheDocument();
  });

  it("cada inicio con su cuadrito de fecha, los días en palabras y el horario", () => {
    const dosSedes: CursoPublico = {
      ...CURSO,
      grupos: [
        { ...CURSO.grupos[0], id: 21, fechaInicio: "2026-11-14", dias: [6], horaInicio: "08:00", horaFin: "12:00", cuposLibres: 20 },
        { ...CURSO.grupos[0], id: 22, sede: { id: 2, nombre: "Norte" } },
      ],
    };
    render(<CursosPagina cursos={[dosSedes]} t={T} colorBoton="#282D73" radio={12} titulo={<h2>Cursos</h2>} escritorio={false} />);
    expect(screen.getByText("PRÓXIMOS INICIOS")).toBeInTheDocument();
    const fecha = screen.getByText("14").closest("time");
    expect(fecha).toHaveAttribute("dateTime", "2026-11-14");
    expect(fecha).toHaveTextContent("14NOV");
    expect(screen.getByText("Sábados")).toBeInTheDocument();
    expect(screen.getByText("Lunes, miércoles y viernes")).toBeInTheDocument();
    // Con varias sedes, la sede va en cada inicio y no en la línea de datos.
    expect(screen.getByText("08:00 a 12:00 · Central")).toBeInTheDocument();
    expect(screen.getByText("19:00 a 21:00 · Norte")).toBeInTheDocument();
    expect(screen.getByText("3 módulos")).toBeInTheDocument();
    // Con más de 10 lugares no se dice cuántos quedan; con 8, sí.
    expect(screen.getAllByText(/^quedan/)).toHaveLength(1);
    expect(screen.getByText("quedan 8")).toBeInTheDocument();
  });

  it("M5: un grupo lleno se ve apagado y dice «lleno»", () => {
    const llenoYLibre: CursoPublico = {
      ...CURSO,
      grupos: [
        { ...CURSO.grupos[0], id: 21, fechaInicio: "2026-11-03", cuposLibres: 0 },
        { ...CURSO.grupos[0], id: 22, fechaInicio: "2026-12-01", cuposLibres: 5 },
      ],
    };
    const { container } = render(<CursosPagina cursos={[llenoYLibre]} t={T} colorBoton="#282D73" radio={12} titulo={<h2>Cursos</h2>} escritorio={false} />);
    expect(screen.getByText("lleno")).toBeInTheDocument();
    const [lleno, libre] = Array.from(container.querySelectorAll("time"));
    expect(lleno).toHaveTextContent("3NOV");
    expect(lleno).toHaveStyle({ opacity: "0.55" });
    expect(libre).toHaveTextContent("1DIC");
    expect(libre).not.toHaveStyle({ opacity: "0.55" });
  });
});
