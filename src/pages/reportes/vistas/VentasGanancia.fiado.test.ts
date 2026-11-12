import { describe, expect, it } from "vitest";
import type { ReporteCierreGanancia } from "../../../types";
import { armarGananciaTurno, documentoVentasGanancia, notasFiadoDelTurno } from "./VentasGanancia.datos";

/**
 * Lo fiado en el cuadro de un turno del dueño (11-nov): lo mismo que ve la
 * cajera en su lista, con las mismas palabras, también en el PDF.
 */

const turno = (): ReporteCierreGanancia => ({
  unidades: 5,
  total: 100,
  lineas: 2,
  costo: 40,
  ganancia: 60,
  categorias: [
    {
      nombre: "POLLOS",
      unidades: 5,
      total: 100,
      costo: 40,
      ganancia: 60,
      items: [
        { productoId: 1, nombre: "Cuarto", cantidad: 3, precio: 20, total: 60, costo: 24, ganancia: 36, fiado: 1 },
        { productoId: 2, nombre: "Medio", cantidad: 2, precio: 20, total: 40, costo: 16, ganancia: 24 },
      ],
    },
  ],
  fiado: { ventas: 1, unidades: 1, total: 20, adelantos: 0, porCobrar: 20 },
  cobrosDeFiado: { total: 50 },
});

describe("lo fiado en el cuadro de ganancia del turno", () => {
  it("cada producto lleva cuántas salieron fiadas, y sólo si salió alguna", () => {
    const v = armarGananciaTurno(turno());
    expect(v.categorias[0].productos[0].fiado).toBe(1);
    expect(v.categorias[0].productos[1].fiado).toBeUndefined();
  });

  it("las notas dicen lo que salió sin plata y la plata que entró sin producto", () => {
    expect(notasFiadoDelTurno(turno())).toEqual([
      "1 unidad en 1 venta al fiado: Bs 20,00 que no entraron al cajón.",
      "Además entraron Bs 50,00 de cobros de fiado, sin producto: esos salieron el día que se fiaron.",
    ]);
    expect(notasFiadoDelTurno({})).toEqual([]);
    expect(notasFiadoDelTurno({ fiado: { ventas: 0, unidades: 0, total: 0, adelantos: 0, porCobrar: 0 } })).toEqual([]);
  });

  it("el PDF lo dice debajo del producto, como el de la cajera", () => {
    const doc = documentoVentasGanancia(armarGananciaTurno(turno()), { subtitulo: "Turno" });
    expect(doc.grupos[0].filas[0].detalle).toBe("1 al fiado");
    expect(doc.grupos[0].filas[1].detalle).toBeUndefined();
  });
});
