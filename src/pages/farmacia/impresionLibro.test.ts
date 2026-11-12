import { describe, expect, it } from "vitest";
import type { AsientoControlado } from "../../types";
import {
  medicamentoImpreso,
  resumenPorMedicamento,
  textoPeriodo,
  tituloLibro,
  totalUnidades,
} from "./impresionLibro";

/**
 * Lo que el libro impreso calcula antes de dibujarse: el título, el período y
 * el resumen por medicamento que el inspector del SEDES cruza con el stock.
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

const morfina = { id: 20, nombre: "Morfina 10 mg", principioActivo: "Morfina", concentracion: "10 mg" };

describe("el título", () => {
  it("nombra el libro elegido, y con los dos juntos dice controlados", () => {
    expect(tituloLibro("PSICOTROPICOS")).toBe("Libro de Psicotrópicos");
    expect(tituloLibro("ESTUPEFACIENTES")).toBe("Libro de Estupefacientes");
    expect(tituloLibro("")).toBe("Libro de controlados");
    expect(tituloLibro(null)).toBe("Libro de controlados");
  });
});

describe("el período", () => {
  it("va del primer día al último, en el día que dice el texto", () => {
    // "2026-09-01" parseado como UTC caía al 31/08 en Bolivia: el período del
    // libro empezaría un día antes de lo que el dueño eligió.
    expect(textoPeriodo("2026-09-01", "2026-09-30")).toBe("del 01/09/2026 al 30/09/2026");
  });

  it("un solo día no se repite", () => {
    expect(textoPeriodo("2026-09-15", "2026-09-15")).toBe("del día 15/09/2026");
  });
});

describe("el medicamento", () => {
  it("suma la concentración cuando el nombre no la dice", () => {
    expect(
      medicamentoImpreso({ id: 1, nombre: "Alprazolam", principioActivo: "Alprazolam", concentracion: "0,5 mg" }),
    ).toBe("Alprazolam 0,5 mg");
  });

  it("no la repite cuando el nombre ya la trae", () => {
    // "Clonazepam 2 mg 2 mg" es lo que salía al concatenar sin mirar.
    expect(
      medicamentoImpreso({ id: 1, nombre: "Clonazepam 2 mg", principioActivo: "Clonazepam", concentracion: "2 mg" }),
    ).toBe("Clonazepam 2 mg");
    expect(
      medicamentoImpreso({ id: 1, nombre: "Clonazepam 2 MG", principioActivo: null, concentracion: "2 mg" }),
    ).toBe("Clonazepam 2 MG");
  });

  it("sin concentración queda el nombre solo", () => {
    expect(medicamentoImpreso({ id: 1, nombre: "Diazepam", principioActivo: null, concentracion: null })).toBe(
      "Diazepam",
    );
    expect(medicamentoImpreso({ id: 1, nombre: "Diazepam", principioActivo: null, concentracion: "  " })).toBe(
      "Diazepam",
    );
  });
});

describe("el resumen por medicamento", () => {
  it("suma las unidades de cada medicamento y cuenta sus asientos", () => {
    const resumen = resumenPorMedicamento([
      asiento({ id: 1, cantidad: 10 }),
      asiento({ id: 2, cantidad: 5, pacienteNombre: "Rosa Mamani" }),
      asiento({ id: 3, cantidad: 2, producto: morfina }),
    ]);
    expect(resumen).toEqual([
      { medicamento: "Clonazepam 2 mg", asientos: 2, unidades: 15 },
      { medicamento: "Morfina 10 mg", asientos: 1, unidades: 2 },
    ]);
  });

  it("una venta anulada no suma: el medicamento volvió al estante", () => {
    // Si sumara, el total del libro daría más que lo que falta en el stock, y
    // esa diferencia es justo lo que una inspección pregunta.
    const resumen = resumenPorMedicamento([
      asiento({ id: 1, cantidad: 10 }),
      asiento({ id: 2, cantidad: 5, anuladaEn: "2026-09-28T16:00:00.000Z" }),
    ]);
    expect(resumen).toEqual([{ medicamento: "Clonazepam 2 mg", asientos: 1, unidades: 10 }]);
  });

  it("un medicamento con todo anulado no figura en el resumen", () => {
    expect(
      resumenPorMedicamento([asiento({ producto: morfina, anuladaEn: "2026-09-28T16:00:00.000Z" })]),
    ).toEqual([]);
  });

  it("junta el mismo nombre escrito distinto y ordena alfabéticamente", () => {
    // Mayúsculas y minúsculas son el mismo renglón para quien lee; el orden
    // alfabético es el que permite encontrar un medicamento en una lista larga.
    const resumen = resumenPorMedicamento([
      asiento({ id: 1, cantidad: 2, producto: morfina }),
      asiento({
        id: 2,
        cantidad: 10,
        producto: { id: 14, nombre: "CLONAZEPAM 2 mg", principioActivo: null, concentracion: "2 mg" },
      }),
      asiento({ id: 3, cantidad: 5 }),
    ]);
    expect(resumen.map((r) => r.medicamento)).toEqual(["CLONAZEPAM 2 mg", "Morfina 10 mg"]);
    expect(resumen[0].unidades).toBe(15);
  });

  it("el total es la suma del resumen", () => {
    expect(
      totalUnidades([
        { medicamento: "Clonazepam 2 mg", asientos: 2, unidades: 15 },
        { medicamento: "Morfina 10 mg", asientos: 1, unidades: 2 },
      ]),
    ).toBe(17);
    expect(totalUnidades([])).toBe(0);
  });
});
