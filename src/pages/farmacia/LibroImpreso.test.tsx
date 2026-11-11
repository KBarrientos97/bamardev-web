import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AsientoControlado } from "../../types";
import LibroImpreso, { type DatosLibroImpreso } from "./LibroImpreso";

/**
 * El libro de controlados en papel: el que firma el regente y la farmacia
 * presenta al SEDES. Lo que importa es que el encabezado diga de quién es, de
 * qué período y quién lo emitió, que cada asiento esté completo, que la venta
 * anulada quede marcada y que el resumen no la sume.
 */

function asiento(over: Partial<AsientoControlado>): AsientoControlado {
  return {
    id: 1,
    fecha: "2026-09-28T14:30:00.000Z",
    ventaId: 50,
    comprobante: "V-000012",
    producto: { id: 14, nombre: "Clonazepam 2 mg", principioActivo: "Clonazepam", concentracion: "2 mg" },
    condicionVenta: "RECETA_ARCHIVADA",
    controlado: true,
    cantidad: 10,
    pacienteNombre: "Juan Pérez",
    pacienteDocumento: "4567890 LP",
    medicoNombre: "Dra. Ana Rojas",
    medicoMatricula: "R-1234",
    recetaNumero: null,
    recetaFecha: "2026-09-27T00:00:00.000Z",
    almacen: { id: 917, nombre: "Sucursal Centro" },
    despachadoPor: { id: 3, nombre: "Regente" },
    anuladaEn: null,
    ...over,
  };
}

/** Dos de clonazepam (10 y 5) y una de morfina que se anuló. */
const filas = [
  asiento({}),
  asiento({ id: 2, ventaId: 51, comprobante: "V-000013", cantidad: 5, pacienteNombre: "Rosa Mamani" }),
  asiento({
    id: 3,
    ventaId: 52,
    comprobante: "V-000014",
    producto: { id: 20, nombre: "Morfina 10 mg", principioActivo: "Morfina", concentracion: "10 mg" },
    condicionVenta: "RECETA_VALORADA",
    pacienteNombre: "Carlos Flores",
    pacienteDocumento: "7654321 LP",
    recetaNumero: "V-000981",
    anuladaEn: "2026-09-28T16:00:00.000Z",
  }),
];

function montar(over: Partial<DatosLibroImpreso> = {}): HTMLElement {
  render(
    <LibroImpreso
      negocio={{ nombre: "Farmacia San Rafael", direccion: "Av. Arce 123", telefono: "2-2441234" }}
      libro="PSICOTROPICOS"
      sucursal="Sucursal Centro"
      desde="2026-09-01"
      hasta="2026-09-30"
      impresoPor="Marcela Quiroga"
      impresoEn={new Date(2026, 10, 11, 10, 30)}
      filas={filas}
      {...over}
    />,
  );
  return document.querySelector<HTMLElement>(".libro-impreso")!;
}

/** El detalle y el resumen: las dos tablas del papel, en ese orden. */
function tablas(papel: HTMLElement) {
  // `hidden`: el papel es `aria-hidden`, y Testing Library lo saltea si no se le pide.
  const [detalle, resumen] = within(papel).getAllByRole("table", { hidden: true });
  return { detalle, resumen };
}

describe("el encabezado", () => {
  it("dice de qué farmacia es, qué libro, de qué período y quién lo imprimió", () => {
    const papel = montar();
    expect(within(papel).getByRole("heading", { level: 1, hidden: true })).toHaveTextContent(
      "Farmacia San Rafael",
    );
    expect(papel).toHaveTextContent("Dirección: Av. Arce 123");
    expect(papel).toHaveTextContent("Teléfono: 2-2441234");
    expect(papel).toHaveTextContent("Libro de Psicotrópicos");
    expect(papel).toHaveTextContent("Sucursal: Sucursal Centro");
    expect(papel).toHaveTextContent("Período: del 01/09/2026 al 30/09/2026");
    expect(papel).toHaveTextContent(/Impreso el 11\/11\/2026 .*por Marcela Quiroga/);
  });

  it("sin dirección ni teléfono deja el renglón para completarlo a mano", () => {
    // La sesión no trae esos datos del negocio: antes de presentar el libro
    // alguien los escribe, y para eso tiene que haber dónde.
    const papel = montar({ negocio: { nombre: "Farmacia San Rafael" } });
    expect(papel).toHaveTextContent("Dirección:");
    expect(papel).toHaveTextContent("Teléfono:");
    expect(papel.querySelectorAll(".renglon")).toHaveLength(2);
  });

  it("sin sucursal elegida no la nombra, y con los dos libros dice controlados", () => {
    const papel = montar({ sucursal: "", libro: "" });
    expect(papel).not.toHaveTextContent("Sucursal:");
    expect(papel).toHaveTextContent("Libro de controlados");
  });
});

describe("el detalle", () => {
  it("cada asiento lleva receta, paciente, médico, medicamento y quién despachó", () => {
    const { detalle } = tablas(montar());
    const fila = within(detalle).getByText("Juan Pérez").closest("tr")!;
    expect(fila).toHaveTextContent("27/09/2026");
    expect(fila).toHaveTextContent("4567890 LP");
    expect(fila).toHaveTextContent("Dra. Ana Rojas");
    expect(fila).toHaveTextContent("R-1234");
    expect(fila).toHaveTextContent("Clonazepam 2 mg");
    expect(within(fila).getByText("10")).toBeInTheDocument();
    expect(fila).toHaveTextContent("Regente");
    expect(fila).toHaveTextContent("V-000012");
  });

  it("la venta anulada queda marcada, con el número de la receta valorada", () => {
    const { detalle } = tablas(montar());
    const fila = within(detalle).getByText("Morfina 10 mg").closest("tr")!;
    expect(fila).toHaveClass("anulada");
    expect(fila).toHaveTextContent("ANULADA el 28/09/2026");
    expect(fila).toHaveTextContent("V-000981");
  });

  it("el encabezado de la tabla se repite en cada hoja", () => {
    // `thead` con `display: table-header-group` es lo que hace que la hoja 2
    // de un libro de la gestión no arranque con una fila sin títulos.
    const papel = montar();
    expect(papel.querySelector("style")!.textContent).toMatch(/thead\s*\{\s*display:\s*table-header-group/);
  });
});

describe("el resumen por medicamento", () => {
  it("suma las unidades de cada medicamento y deja afuera la venta anulada", () => {
    const papel = montar();
    const { resumen } = tablas(papel);
    const clonazepam = within(resumen).getByText("Clonazepam 2 mg").closest("tr")!;
    expect(within(clonazepam).getByText("2")).toBeInTheDocument();
    expect(within(clonazepam).getByText("15")).toBeInTheDocument();
    expect(within(resumen).queryByText("Morfina 10 mg")).toBeNull();
    expect(resumen).toHaveTextContent("Total215");
    expect(papel).toHaveTextContent("Sin la venta anulada, que figura marcada en el detalle.");
  });

  it("sin anuladas no hay nota que aclarar", () => {
    const papel = montar({ filas: filas.slice(0, 2) });
    // Por la clase y no por el texto: el `<style>` del papel nombra `.anulada`.
    expect(papel.querySelector(".nota")).toBeNull();
    expect(papel).not.toHaveTextContent("venta anulada");
  });
});

describe("las firmas", () => {
  it("firman el regente y el propietario, con nombre y sello", () => {
    const papel = montar();
    expect(papel).toHaveTextContent("Regente farmacéutico");
    expect(papel).toHaveTextContent("Propietario / Administrador");
    expect(within(papel).getAllByText("Nombre y sello")).toHaveLength(2);
  });
});
