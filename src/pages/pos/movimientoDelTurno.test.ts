import { describe, expect, it } from "vitest";
import type { ResumenCaja } from "../../types";
import { efectivoDelTurno, mediosDelTurno, vendidoDelTurno } from "./movimientoDelTurno";

function resumen(extra: Partial<ResumenCaja> = {}): ResumenCaja {
  return {
    cajaId: 1,
    estado: "ABIERTA",
    montoApertura: 0,
    cantidadVentas: 0,
    totalVentas: 0,
    anuladas: 0,
    porFormaPago: [],
    efectivo: 0,
    cambioEntregado: 0,
    ingresos: 0,
    egresos: 0,
    movimientos: [],
    creditoOtorgado: 0,
    abonosCredito: 0,
    abonosEfectivo: 0,
    abonosPorFormaPago: [],
    saldoEsperado: 0,
    ...extra,
  };
}

const suma = (xs: { monto: number }[]) => Math.round(xs.reduce((s, x) => s + x.monto, 0) * 100) / 100;

describe("lo vendido del turno", () => {
  it("efectivo + QR + fiado dan el total vendido, con el efectivo primero", () => {
    const v = vendidoDelTurno(
      resumen({
        totalVentas: 1429,
        porFormaPago: [
          { nombre: "QR", monto: 362 },
          { nombre: "Efectivo", monto: 953 },
        ],
        creditoOtorgado: 114,
      }),
    );
    expect(v.filas.map((f) => f.etiqueta)).toEqual(["En efectivo", "Por QR", "Al fiado"]);
    expect(suma(v.filas)).toBe(v.total);
    expect(v.filas[2].fiado).toBe(true);
  });

  it("los abonos de fiado no son venta: no entran en lo vendido", () => {
    // Antes salía "Abonos por QR" entre las filas de las ventas, sin sumar.
    const v = vendidoDelTurno(
      resumen({
        totalVentas: 50,
        porFormaPago: [{ nombre: "Efectivo", monto: 50 }],
        abonosCredito: 84,
        abonosPorFormaPago: [{ nombre: "QR", monto: 84 }],
      }),
    );
    expect(v.filas).toEqual([{ etiqueta: "En efectivo", monto: 50 }]);
    expect(v.total).toBe(50);
  });

  it("sin fiado no hay renglón de fiado en cero", () => {
    const v = vendidoDelTurno(resumen({ totalVentas: 10, porFormaPago: [{ nombre: "QR", monto: 10 }] }));
    expect(v.filas).toEqual([{ etiqueta: "Por QR", monto: 10 }]);
  });

  it("17-nov: con plata devuelta, «En efectivo» es lo cobrado y lo devuelto va al final, en negativo", () => {
    const v = vendidoDelTurno(
      resumen({
        totalVentas: 25,
        porFormaPago: [
          { nombre: "Efectivo", monto: 15 },
          { nombre: "QR", monto: 10 },
        ],
        efectivo: 15,
        cambioEntregado: 35,
        devueltoEfectivo: 5,
      }),
    );
    expect(v.filas).toEqual([
      { etiqueta: "En efectivo", monto: 20 },
      { etiqueta: "Por QR", monto: 10 },
      { etiqueta: "Devuelto en efectivo", monto: -5 },
    ]);
    expect(suma(v.filas)).toBe(v.total);
  });
});

describe("17-nov: el efectivo del turno con plata devuelta por ventas modificadas", () => {
  it("(a) QR 23 con 3 devueltos: nada cobrado en efectivo, sin vuelto y 3 devueltos", () => {
    expect(efectivoDelTurno(resumen({ efectivo: -3, cambioEntregado: 3, devueltoEfectivo: 3 }))).toEqual({
      cobrado: 0,
      cambio: 0,
      devuelto: 3,
    });
  });

  it("(b) efectivo 20 recibido 50 y 5 devueltos: cobrado 20, vuelto 30", () => {
    const e = efectivoDelTurno(resumen({ efectivo: 15, cambioEntregado: 35, devueltoEfectivo: 5 }));
    expect(e).toEqual({ cobrado: 20, cambio: 30, devuelto: 5 });
    // Lo recibido no cambia: 20 cobrados + 30 de vuelto = el billete de 50.
    expect(e.cobrado + e.cambio).toBe(50);
  });

  it("el pago en efectivo borrado al modificar: el cambio nunca queda negativo", () => {
    // El servidor borra la fila del efectivo que quedó en 0 con su «entregado».
    expect(efectivoDelTurno(resumen({ efectivo: 0, cambioEntregado: 0, devueltoEfectivo: 5 }))).toEqual({
      cobrado: 5,
      cambio: 0,
      devuelto: 5,
    });
  });

  it("(c) sin el campo (o en cero), los números de siempre", () => {
    expect(efectivoDelTurno(resumen({ efectivo: -3, cambioEntregado: 3 }))).toEqual({ cobrado: -3, cambio: 3, devuelto: 0 });
    expect(efectivoDelTurno(resumen({ efectivo: 15, cambioEntregado: 35, devueltoEfectivo: 0 }))).toEqual({
      cobrado: 15,
      cambio: 35,
      devuelto: 0,
    });
  });
});

describe("lo que entró por cada medio que no es efectivo", () => {
  it("el QR del turno es lo vendido por QR más lo abonado por QR", () => {
    expect(
      mediosDelTurno(
        resumen({
          porFormaPago: [
            { nombre: "Efectivo", monto: 953 },
            { nombre: "QR", monto: 362 },
          ],
          abonosPorFormaPago: [
            { nombre: "Efectivo", monto: 30 },
            { nombre: "QR", monto: 84 },
          ],
        }),
      ),
    ).toEqual([{ nombre: "QR", ventas: 362, abonos: 84, total: 446 }]);
  });

  it("un abono por QR sin ventas por QR igual aparece: entró a la cuenta", () => {
    expect(mediosDelTurno(resumen({ abonosPorFormaPago: [{ nombre: "QR", monto: 20 }] }))).toEqual([
      { nombre: "QR", ventas: 0, abonos: 20, total: 20 },
    ]);
  });

  it("el efectivo nunca va acá, se llame como se llame: es del cajón", () => {
    expect(
      mediosDelTurno(
        resumen({
          porFormaPago: [{ nombre: "EFECTIVO Bs", monto: 100 }],
          abonosPorFormaPago: [{ nombre: "Efectivo", monto: 10 }],
        }),
      ),
    ).toEqual([]);
  });

  it("cada medio en su bloque, en el orden en que llegan", () => {
    const medios = mediosDelTurno(
      resumen({
        porFormaPago: [
          { nombre: "QR", monto: 10 },
          { nombre: "Tarjeta", monto: 5 },
        ],
      }),
    );
    expect(medios.map((m) => m.nombre)).toEqual(["QR", "Tarjeta"]);
  });

  it("los centavos no dejan un total con cola de decimales", () => {
    const [qr] = mediosDelTurno(
      resumen({
        porFormaPago: [{ nombre: "QR", monto: 0.1 }],
        abonosPorFormaPago: [{ nombre: "QR", monto: 0.2 }],
      }),
    );
    expect(qr.total).toBe(0.3);
  });
});
