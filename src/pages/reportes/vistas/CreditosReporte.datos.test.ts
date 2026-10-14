import { describe, expect, it } from "vitest";
import type { CreditosApi } from "../api";
import { fraccionVencida, hojasCreditos, lineaDeudor, sinNadaDeCreditos, tramosDeDeuda } from "./CreditosReporte.datos";

type Tramo = CreditosApi["antiguedad"][number];

function tramo(clave: Tramo["clave"], monto: number, cantidad: number): Tramo {
  return { clave, etiqueta: clave, monto, cantidad, porcentaje: 0 };
}

function reporte(p: Omit<Partial<CreditosApi>, "resumen"> & { resumen?: Partial<CreditosApi["resumen"]> } = {}): CreditosApi {
  return {
    antiguedad: [],
    deudores: [],
    cobros: [],
    ...p,
    resumen: {
      totalPorCobrar: 0,
      totalVencido: 0,
      creditosAbiertos: 0,
      clientesConSaldo: 0,
      fiadoEnPeriodo: 0,
      cobradoEnPeriodo: 0,
      abonosEnPeriodo: 0,
      ...p.resumen,
    },
  };
}

describe("créditos: antigüedad de la deuda", () => {
  it("los tramos salen siempre en orden, de al día a más de 60, aunque lleguen mezclados", () => {
    const filas = tramosDeDeuda(
      [tramo("atraso_31_60", 155, 3), tramo("al_dia", 103, 4), tramo("atraso_1_30", 303, 5)],
      561,
    );
    expect(filas.map((t) => t.clave)).toEqual(["al_dia", "atraso_1_30", "atraso_31_60", "atraso_60_mas"]);
    // El que no vino no se pierde: queda en cero.
    expect(filas[3]).toMatchObject({ monto: 0, cantidad: 0, fraccion: 0 });
    expect(filas[1].fraccion).toBeCloseTo(303 / 561);
  });

  it("cada tramo lleva su color: al día con la marca, lo recién vencido ámbar y lo viejo rojo", () => {
    const colores = tramosDeDeuda([], 100).map((t) => t.color);
    expect(colores).toEqual(["bg-primary", "bg-amber-500", "bg-rose-500", "bg-rose-800"]);
  });

  it("sin deuda el peso de cada tramo es null, que se escribe —, no 0 %", () => {
    expect(tramosDeDeuda([tramo("al_dia", 0, 0)], 0).every((t) => t.fraccion === null)).toBe(true);
  });

  it("un tramo que no se conoce (un backend más nuevo) va al final con su etiqueta", () => {
    const raro = { clave: "atraso_90_mas", etiqueta: "Más de 90 días", monto: 10, cantidad: 1, porcentaje: 10 } as unknown as Tramo;
    const filas = tramosDeDeuda([raro], 100);
    expect(filas).toHaveLength(5);
    expect(filas[4]).toMatchObject({ nombre: "Más de 90 días", monto: 10, color: "bg-slate-400" });
  });

  it("lo vencido es parte de lo que se debe; sin deuda no se calcula", () => {
    expect(fraccionVencida({ totalVencido: 458, totalPorCobrar: 561 })).toBeCloseTo(0.8164, 3);
    expect(fraccionVencida({ totalVencido: 0, totalPorCobrar: 0 })).toBeNull();
  });
});

describe("créditos: quién debe", () => {
  it("dice el atraso del crédito más atrasado del cliente", () => {
    expect(lineaDeudor({ creditos: 2, diasAtrasoMax: 18 })).toBe("2 créditos · atrasado 18 días");
    expect(lineaDeudor({ creditos: 1, diasAtrasoMax: 1 })).toBe("1 crédito · atrasado 1 día");
  });

  it("sin atraso dice al día", () => {
    expect(lineaDeudor({ creditos: 4, diasAtrasoMax: 0 })).toBe("4 créditos · al día");
  });
});

describe("créditos: vacío", () => {
  it("sin deuda ni movimiento en el período el reporte se muestra vacío, no en ceros", () => {
    expect(sinNadaDeCreditos(reporte())).toBe(true);
  });

  it("con movimiento en el período no está vacío aunque hoy nadie deba", () => {
    // Se fió y se cobró todo dentro del período: hay algo que contar.
    expect(sinNadaDeCreditos(reporte({ resumen: { fiadoEnPeriodo: 100, cobradoEnPeriodo: 100 } }))).toBe(false);
  });

  it("una deuda de centavos no cuenta como deuda", () => {
    expect(sinNadaDeCreditos(reporte({ resumen: { totalPorCobrar: 0.004 } }))).toBe(true);
  });
});

describe("créditos: el Excel", () => {
  it("baja quién debe y la antigüedad; los cobros, sólo si hubo", () => {
    const sinCobros = hojasCreditos(reporte({ resumen: { totalPorCobrar: 50 } }));
    expect(sinCobros.map((h) => h.nombre)).toEqual(["Quién debe", "Antigüedad"]);
    const conCobros = hojasCreditos(
      reporte({
        resumen: { totalPorCobrar: 50 },
        cobros: [{ id: 1, fecha: "2026-10-08T15:00:00.000Z", codigo: "C-1", cliente: "Don Pepe", monto: 20, formaPago: "Efectivo", usuario: "Ana" }],
      }),
    );
    expect(conCobros.map((h) => h.nombre)).toEqual(["Quién debe", "Antigüedad", "Cobros del período"]);
  });
});
