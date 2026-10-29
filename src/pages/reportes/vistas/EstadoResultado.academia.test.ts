import { describe, expect, it } from "vitest";
import { fmtMoney } from "../../../lib/format";
import { estadoResultado } from "../../../lib/resultado";
import type { Gasto } from "../../../types";
import { explicarResultado, partirClases, partirVentas, perfilResultado, separarSueldosDocentes } from "./EstadoResultado.datos";

/**
 * El perfil ACADEMIA del Estado de resultado (L5, 28-oct): la venta se parte
 * en "Cobrado por clases" y "Ventas de productos" y los sueldos docentes
 * pagados se nombran aparte de los gastos del local. La cuenta común
 * (`estadoResultado`) no cambia: Omar, el billar y belleza siguen igual.
 */

function gasto(id: number, monto: number, categoria = "ALQUILER"): Gasto {
  return { id, concepto: categoria, categoria, categoriaNombre: categoria, monto, pagado: 0 } as Gasto;
}

/** Un mes del instituto: Bs 5.000 en cuotas y Bs 320 en poleras que costaron Bs 120. */
const FIN = { ventas: 5320, costoVentas: 120, utilidadBruta: 5200, cobradoCuotas: 5000 };
const ALQUILER = gasto(1, 1500);
const RECEPCION = gasto(2, 800, "SUELDOS");
const PLANILLA = gasto(3, 1200, "SUELDOS");

describe("perfil ACADEMIA", () => {
  it("parte en clases y productos, y los sueldos docentes no van en los gastos del local", () => {
    const p = perfilResultado("ACADEMIA");
    expect(p.partir).toBe("clases");
    expect(p.gananciaTitulo).toBe("Ganancia de clases y productos");
    expect(p.costoDetalle).toMatch(/clases no tienen costo/);
    expect(p.queVaLocal).toMatch(/sueldos de los docentes no van acá/);
  });

  it("los demás rubros siguen con su perfil de siempre", () => {
    expect(perfilResultado("RESTAURANTE").partir).toBeNull();
    expect(perfilResultado("BILLAR").partir).toBe("billar");
    expect(perfilResultado("PELUQUERIA").partir).toBe("servicios");
    expect(perfilResultado("FARMACIA").partir).toBeNull();
  });
});

describe("partir las ventas de la academia", () => {
  it("las cuotas del financiero y lo que falta, que son los productos: suman las ventas", () => {
    expect(partirClases(5320, 5000)).toEqual({ servicios: 5000, productos: 320 });
  });

  it("va partida aunque no se haya vendido ningún producto (el dueño pidió las dos líneas)", () => {
    expect(partirClases(5000, 5000)).toEqual({ servicios: 5000, productos: 0 });
    expect(partirClases(320, 0)).toEqual({ servicios: 0, productos: 320 });
  });

  it("sin el dato (un backend anterior) la línea va entera; nunca más cuotas que ventas", () => {
    expect(partirClases(5320, undefined)).toBeNull();
    expect(partirClases(100, 150)).toEqual({ servicios: 100, productos: 0 });
  });

  it("el billar sigue partiendo con la composición del resumen, como antes", () => {
    expect(partirVentas(520, { servicios: 280 })).toEqual({ servicios: 280, productos: 240 });
  });
});

describe("separar los sueldos docentes", () => {
  it("saca de los gastos del local sólo los pagos de la planilla; un sueldo cargado a mano se queda", () => {
    const s = separarSueldosDocentes([ALQUILER, RECEPCION, PLANILLA], [3]);
    expect(s.sueldosDocentes).toBe(1200);
    expect(s.gastosLocal.map((g) => g.id)).toEqual([1, 2]);
  });

  it("sin planilla (o sin el dato) no separa nada", () => {
    const gastos = [ALQUILER, RECEPCION];
    expect(separarSueldosDocentes(gastos, [])).toEqual({ gastosLocal: gastos, sueldosDocentes: 0 });
    expect(separarSueldosDocentes(gastos, undefined)).toEqual({ gastosLocal: gastos, sueldosDocentes: 0 });
  });

  it("no cambia la cuenta: el resultado con la planilla aparte es el mismo", () => {
    const todos = estadoResultado(FIN, [ALQUILER, RECEPCION, PLANILLA]);
    const { gastosLocal, sueldosDocentes } = separarSueldosDocentes([ALQUILER, RECEPCION, PLANILLA], [3]);
    const local = estadoResultado(FIN, gastosLocal);
    expect(local.gastosOperativos + sueldosDocentes).toBe(todos.gastosOperativos);
    expect(todos.utilidadNeta).toBe(5200 - 1500 - 800 - 1200);
  });
});

describe("el resultado en palabras de la academia", () => {
  const p = perfilResultado("ACADEMIA");

  it("dice lo que dejaron las clases y los productos y nombra los sueldos docentes aparte", () => {
    const er = estadoResultado(FIN, [ALQUILER, RECEPCION, PLANILLA]);
    expect(explicarResultado(er, p, partirClases(FIN.ventas, FIN.cobradoCuotas), 1200)).toBe(
      `Las clases dejaron ${fmtMoney(5000)} y los productos ${fmtMoney(200)}. Restando los gastos del local (${fmtMoney(2300)}) y los sueldos docentes (${fmtMoney(1200)}), te quedan ${fmtMoney(1700)}: es tu ganancia líquida.`,
    );
  });

  it("sin productos vendidos habla sólo de las clases", () => {
    const fin = { ventas: 5000, costoVentas: 0, utilidadBruta: 5000, cobradoCuotas: 5000 };
    const er = estadoResultado(fin, [ALQUILER]);
    expect(explicarResultado(er, p, partirClases(5000, 5000))).toMatch(/^Las clases dejaron Bs\s?5\.000,00\. Restando/);
  });

  it("con sólo la planilla pagada avisa que faltan los gastos del local", () => {
    const er = estadoResultado(FIN, [PLANILLA]);
    expect(explicarResultado(er, p, partirClases(FIN.ventas, FIN.cobradoCuotas), 1200)).toMatch(/Todavía no cargaste los gastos del local/);
  });

  it("sin sueldos docentes (cualquier otro rubro) el texto es el de siempre", () => {
    const billar = perfilResultado("BILLAR");
    const er = estadoResultado({ ventas: 520, costoVentas: 140, utilidadBruta: 380 }, [gasto(1, 200), gasto(2, 50, "LUZ")]);
    expect(explicarResultado(er, billar, { servicios: 280, productos: 240 })).toBe(
      explicarResultado(er, billar, { servicios: 280, productos: 240 }, 0),
    );
    expect(explicarResultado(er, billar, { servicios: 280, productos: 240 })).toMatch(/Restando los gastos del local \(Bs\s?250,00\), te quedan/);
  });
});
