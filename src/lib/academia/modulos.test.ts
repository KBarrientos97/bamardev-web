import { describe, expect, it } from "vitest";
import { descripcionDeCuota, modulosDeCuotas, nombresDe, type ModulosDeCuotas } from "./modulos";
import { ventaConCuotas, type CobroCuotas } from "./cobroCuotas";
import type { Materia } from "./tipos";
import type { Venta } from "../../types";

/** D6: de dónde salen los nombres de los módulos de una cuota. */

const materia = (orden: number, nombre: string) => ({ materia: { id: orden, orden, nombre } as Materia });
const INFO: ModulosDeCuotas = {
  curso: "Barbería",
  porCuota: { 905: [2], 906: [3], 907: [] },
  nombres: nombresDe([materia(1, "Corte clásico"), materia(2, "Degradados"), materia(3, "Barba y color")]),
};

describe("los nombres de los módulos del grupo", () => {
  it("salen del detalle del grupo, por orden", () => {
    expect(INFO.nombres).toEqual({ 1: "Corte clásico", 2: "Degradados", 3: "Barba y color" });
    expect(nombresDe(undefined)).toEqual({});
  });

  it("la línea de «Cobrar» dice «Barbería · M2 Degradados»", () => {
    expect(descripcionDeCuota(INFO, 905, "Barbería · Cuota 2/3")).toBe("Barbería · M2 Degradados");
  });

  it("sin datos (todavía cargando o sin permiso) queda lo que mandó el backend", () => {
    expect(descripcionDeCuota(null, 905, "Barbería · Cuota 2/3")).toBe("Barbería · Cuota 2/3");
    expect(descripcionDeCuota(INFO, 907, "Barbería · Pago único")).toBe("Barbería · Pago único");
    expect(descripcionDeCuota(INFO, 999, "Barbería · Cuota 9/9")).toBe("Barbería · Cuota 9/9");
    expect(descripcionDeCuota({ ...INFO, nombres: {} }, 905, "Barbería · Cuota 2/3")).toBe("Barbería · Cuota 2/3");
  });

  it("para el recibo: los módulos con nombre de cada cuota; vacío si no se saben", () => {
    expect(modulosDeCuotas(INFO)).toEqual({ 905: "M2 Degradados", 906: "M3 Barba y color" });
    expect(modulosDeCuotas(null)).toEqual({});
    expect(modulosDeCuotas({ ...INFO, nombres: {} })).toEqual({});
  });

  it("la venta recién cobrada lleva los módulos en sus cuotas", () => {
    const cobro = { inscripcionId: 5, alumno: { id: 3, nombre: "Camila" }, pagadores: [], pagadorId: null, sedeGrupo: null, otraSede: false, lineas: [] } as unknown as CobroCuotas;
    const conLineas = { ...cobro, lineas: [{ cuotaId: 905, productoId: 77, descripcion: "x", monto: 1, saldo: 1, vencida: false }] };
    const venta = {
      detalles: [{ productoId: 77, producto: "Barbería", cantidad: 1, precio: 1, subtotal: 1, nota: null, consumo: "LLEVAR" }],
      cuotas: [{ cuotaId: 905, concepto: "Cuota 2/3", alumno: "Camila", cobrado: 1, pagado: 1, saldo: 0, estado: "PAGADA", saldoCurso: 0, proximaCuota: null }],
    } as unknown as Venta;
    expect(ventaConCuotas(venta, conLineas, modulosDeCuotas(INFO)).cuotas?.[0].modulos).toBe("M2 Degradados");
    expect(ventaConCuotas(venta, conLineas).cuotas?.[0].modulos).toBeUndefined();
  });
});
