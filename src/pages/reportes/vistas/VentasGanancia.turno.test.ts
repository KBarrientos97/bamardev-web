import { describe, expect, it } from "vitest";
import type { ReporteCierreGanancia } from "../../../types";
import {
  armarGananciaTurno,
  documentoVentasGanancia,
  NOTAS_GANANCIA_TURNO,
  sinCosto,
  textoSinCosto,
  veGananciaDelTurno,
} from "./VentasGanancia.datos";

const turno = (): ReporteCierreGanancia => ({
  unidades: 12,
  total: 132,
  lineas: 3,
  costo: 72.66,
  ganancia: 59.34,
  categorias: [
    {
      nombre: "POLLOS",
      unidades: 4,
      total: 72,
      costo: 48,
      ganancia: 24,
      items: [{ productoId: 1, nombre: "Broaster", cantidad: 4, precio: 18, total: 72, costo: 48, ganancia: 24 }],
    },
    {
      nombre: "BEBIDAS",
      unidades: 8,
      total: 60,
      costo: 24.66,
      ganancia: 35.34,
      items: [
        { productoId: 3, nombre: "Agua", cantidad: 6, precio: 5.33, total: 32, costo: 0, ganancia: 32 },
        { productoId: 2, nombre: "Coca", cantidad: 2, precio: 14, total: 28, costo: 24.66, ganancia: 3.34 },
      ],
    },
  ],
});

describe("el cuadro de ganancia de un turno", () => {
  it("usa las sumas del backend: son las mismas filas que ve el arqueo", () => {
    const v = armarGananciaTurno(turno());
    expect(v).toMatchObject({ unidades: 12, total: 132, costo: 72.66, ganancia: 59.34, productos: 3 });
    expect(v.categorias[1]).toMatchObject({ nombre: "BEBIDAS", costo: 24.66, ganancia: 35.34 });
  });

  it("respeta el orden del backend, sin volver a ordenar por lo vendido", () => {
    // Es la lista del arqueo: si acá saliera en otro orden, el dueño no la
    // podría ir comparando renglón por renglón.
    const v = armarGananciaTurno(turno());
    expect(v.categorias.map((c) => c.nombre)).toEqual(["POLLOS", "BEBIDAS"]);
    expect(v.categorias[1].productos.map((p) => p.nombre)).toEqual(["Agua", "Coca"]);
  });

  it("marca lo vendido sin costo cargado, que no es una ganancia real", () => {
    const v = armarGananciaTurno(turno());
    expect(sinCosto(v.categorias[1].productos[0])).toBe(true);
    expect(v.ventasSinCosto).toBe(32);
    expect(textoSinCosto(v)).toContain("sin costo cargado");
  });

  it("el PDF del turno dice lo que es: productos vendidos, con sus notas", () => {
    const doc = documentoVentasGanancia(armarGananciaTurno(turno()), {
      negocio: "Don Omar",
      subtitulo: "07 nov · Cajera",
      titulo: "Productos vendidos",
      notas: [...NOTAS_GANANCIA_TURNO],
    });
    expect(doc.titulo).toBe("Productos vendidos");
    expect(doc.subtitulo).toBe("07 nov · Cajera");
    expect(doc.columnas).toEqual(["PRODUCTO", "CANT.", "TOTAL", "COSTO", "GANANCIA"]);
    expect(doc.notas).toEqual([...NOTAS_GANANCIA_TURNO]);
  });

  it("sin título ni notas, el PDF de Ventas y ganancia sigue igual que antes", () => {
    const doc = documentoVentasGanancia(armarGananciaTurno(turno()), { subtitulo: "Noviembre" });
    expect(doc.titulo).toBe("Ventas y ganancia");
    expect(doc.notas?.[0]).toContain("antes de promos");
  });
});

describe("quién ve la ganancia del turno", () => {
  const conPermiso = ["reportes.ver", "reportes.rentabilidad"];

  it("el dueño del restaurante, con el plan y el permiso", () => {
    expect(veGananciaDelTurno("RESTAURANTE", true, conPermiso)).toBe(true);
  });

  it("un rol sin rentabilidad no: Kevin, «por seguridad del local»", () => {
    expect(veGananciaDelTurno("RESTAURANTE", true, ["reportes.ver"])).toBe(false);
  });

  it("un plan sin rentabilidad tampoco, aunque el rol la tenga", () => {
    expect(veGananciaDelTurno("RESTAURANTE", false, conPermiso)).toBe(false);
  });

  it("los demás rubros siguen viendo su lista", () => {
    expect(veGananciaDelTurno("BILLAR", true, conPermiso)).toBe(false);
    expect(veGananciaDelTurno("FARMACIA", true, conPermiso)).toBe(false);
    expect(veGananciaDelTurno(undefined, true, conPermiso)).toBe(false);
  });
});
