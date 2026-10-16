import { describe, expect, it } from "vitest";
import { detalleAnularVenta, efectivoEnOtraCaja } from "./Avisos.datos";

const pago = (metodo: string, monto: number) => ({ id: metodo, hora: 0, metodo, monto });

describe("detalleAnularVenta: qué devolver y de dónde sale", () => {
  it("separa efectivo y QR", () => {
    // Decía "el monto sale de la caja del turno": con parte por QR, el cajero
    // devolvía todo del cajón y al cerrar le faltaba (revisión del 16-oct).
    expect(
      detalleAnularVenta({ origen: "mesa", mesaId: 3, pagos: [pago("QR", 10), pago("Efectivo", 35)] }),
    ).toBe(
      "Mesa 3. Los productos vuelven al stock. Devolvé al cliente Bs 35,00 en efectivo y Bs 10,00 por QR. Ojo: el tiempo de la mesa no se puede volver a cobrar.",
    );
  });

  it("lo fiado no se devuelve: sale de Cuentas por cobrar", () => {
    expect(
      detalleAnularVenta({ origen: "mesa", mesaId: 2, pagos: [pago("Efectivo", 40), pago("Fiado", 30)] }),
    ).toBe(
      "Mesa 2. Los productos vuelven al stock. Devolvé al cliente Bs 40,00 en efectivo. Bs 30,00 eran fiado: salen de Cuentas por cobrar. Ojo: el tiempo de la mesa no se puede volver a cobrar.",
    );
  });

  it("si el adelanto lo cobró otra caja, dice quién tiene esa plata", () => {
    // Ana cobró el tiempo fijo (Bs 40) y Beto cerró la mesa: al anular, la caja
    // de Ana deja de esperar esos 40, así que se los tiene que pasar a Beto.
    expect(
      detalleAnularVenta({
        origen: "mesa",
        mesaId: 2,
        pagos: [pago("Efectivo", 45)],
        adelantosOtraCaja: [{ cajero: "Ana", monto: 40 }],
      }),
    ).toBe(
      "Mesa 2. Los productos vuelven al stock. Devolvé al cliente Bs 45,00 en efectivo. De ese efectivo, Bs 40,00 entraron en la caja de Ana: pedíselos, porque su arqueo deja de esperarlos. Ojo: el tiempo de la mesa no se puede volver a cobrar.",
    );
  });

  it("una venta rápida", () => {
    expect(detalleAnularVenta({ origen: "rapida", pagos: [pago("QR", 8)] })).toBe(
      "Venta rápida. Los productos vuelven al stock. Devolvé al cliente Bs 8,00 por QR.",
    );
  });
});

describe("efectivoEnOtraCaja: al anular una mesa abierta", () => {
  const pagos = [
    { metodo: "Efectivo", monto: 20, cajaId: 1, cobradoPor: "Ana" },
    { metodo: "Efectivo", monto: 15, cajaId: 2, cobradoPor: "Beto" },
    { metodo: "QR", monto: 10, cajaId: 1, cobradoPor: "Ana" },
  ];

  it("sólo el efectivo que entró en otro cajón", () => {
    expect(efectivoEnOtraCaja(pagos, 2)).toBe("Bs 20,00 entraron en la caja de Ana");
  });

  it("todo en la propia caja: nada que avisar", () => {
    expect(efectivoEnOtraCaja(pagos.slice(1), 2)).toBe("");
  });
});
