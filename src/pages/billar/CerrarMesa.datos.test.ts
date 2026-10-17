import { describe, expect, it } from "vitest";
import { cobroQueFigura, medioDelBoton, pagosFinales } from "./CerrarMesa.datos";

const pago = (metodo: string, monto: number) => ({ id: `${metodo}${monto}`, hora: 0, metodo, monto });

describe("el cobro de la mesa", () => {
  it("el botón dice el medio con que se cobra", () => {
    // El cobro arranca en Efectivo y el botón no lo decía: el medio mal
    // marcado salía de la pantalla misma (revisión del 17-oct).
    expect(medioDelBoton("Efectivo")).toBe("en efectivo");
    expect(medioDelBoton("QR")).toBe("por QR");
    expect(medioDelBoton("Mixto")).toBe("mixto (efectivo + QR)");
  });

  it("el mixto se compara en sus dos partes, como lo guarda la venta", () => {
    expect(pagosFinales({ metodo: "Mixto", monto: 40, partes: { efectivo: 25, qr: 15 } })).toEqual([
      { metodo: "Efectivo", monto: 25 },
      { metodo: "QR", monto: 15 },
    ]);
  });

  it("si el reintento devolvió la venta con otro medio, dice cómo figura", () => {
    // Se cortó la respuesta, el cliente dijo "por QR" y la venta ya estaba en
    // efectivo: el aviso decía QR y la caja esperaba un efectivo que no entró.
    expect(cobroQueFigura([pago("Efectivo", 45)], [], 45, [{ metodo: "QR", monto: 45 }])).toBe("Efectivo Bs 45,00");
  });

  it("si coincide no avisa nada, contando lo que cubren los adelantos", () => {
    expect(cobroQueFigura([pago("Efectivo", 45)], [], 45, [{ metodo: "Efectivo", monto: 45 }])).toBeNull();
    // Adelanto de Bs 20 por QR y el resto en efectivo: la venta tiene los dos.
    expect(
      cobroQueFigura([pago("QR", 20), pago("Efectivo", 25)], [pago("QR", 20)], 45, [{ metodo: "Efectivo", monto: 25 }]),
    ).toBeNull();
    // El QR del negocio puede llamarse "qr": se compara sin mayúsculas.
    expect(cobroQueFigura([pago("qr", 10)], [], 10, [{ metodo: "QR", monto: 10 }])).toBeNull();
  });

  it("un fiado no se compara: lo que falta es una cuenta por cobrar", () => {
    expect(cobroQueFigura([pago("Fiado", 30)], [], 30, [])).toBeNull();
  });
});
