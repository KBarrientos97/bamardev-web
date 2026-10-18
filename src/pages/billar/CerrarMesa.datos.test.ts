import { describe, expect, it } from "vitest";
import {
  avisoCuentaRecalculada,
  cobroQueFigura,
  inicioParaCobrarLaPausa,
  medioDelBoton,
  pagosFinales,
} from "./CerrarMesa.datos";

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

describe("una mesa en pausa que en realidad siguió jugando", () => {
  // Prueba profunda del 18-oct: el aviso mandaba a "corregir la hora de
  // inicio" sin decir cuánto.
  const MIN = 60_000;
  const ahora = Date.UTC(2026, 9, 19, 2, 0);
  const pausada = { start: ahora - 90 * MIN, pausedAt: ahora - 25 * MIN, pausaDesde: ahora - 25 * MIN, prev: null };

  it("dice a qué hora correr el inicio: lo que pasó desde la pausa", () => {
    expect(inicioParaCobrarLaPausa(pausada, ahora)).toEqual({ inicio: ahora - 115 * MIN, pausaMs: 25 * MIN });
  });

  it("con la cuenta traída de otra mesa, o a más de 12 h, ya no se puede", () => {
    expect(inicioParaCobrarLaPausa({ ...pausada, prev: { secs: 2400, min: 45, bs: 15 } }, ahora)).toBeNull();
    expect(inicioParaCobrarLaPausa({ ...pausada, start: ahora - 11.9 * 60 * MIN }, ahora)).toBeNull();
    expect(inicioParaCobrarLaPausa({ ...pausada, pausedAt: null }, ahora)).toBeNull();
  });
});

describe("el aviso de la pausa no promete de más", () => {
  it("si correr el inicio devolvería una pausa que sacó una corrección anterior, no da la cuenta", () => {
    // Revisión del 18-oct: abierta 18:00, pausa 18:10-18:40 sacada al correr
    // el inicio a 19:00; con el aviso se corría a 16:00 y el backend devolvía
    // esos 30 min: quedaba con media hora menos de la que decía.
    const MIN = 60_000;
    const h = (hh: number, mm: number) => Date.UTC(2026, 9, 19, hh + 4, mm);
    const s = {
      start: h(19, 0),
      pausedAt: h(20, 30),
      pausaDesde: h(20, 30),
      prev: null,
      pausas: [{ desde: h(18, 10), hasta: h(18, 40) }],
    };
    expect(inicioParaCobrarLaPausa(s, h(23, 30))).toBeNull();
    // Sin esa pausa de antes, sí.
    expect(inicioParaCobrarLaPausa({ ...s, pausas: [] }, h(23, 30))).toEqual({ inicio: h(16, 0), pausaMs: 180 * MIN });
  });
});

describe("la cuenta que cambió mientras se cobraba", () => {
  // Pool, 47 min: Bs 15 sin adelantos, cobrados en efectivo.
  const antes = { hasta: 0, total: 15, saldo: 15, pagado: 0, aFavor: 0, qr: 0, efectivo: 15 };
  const ahora = (total: number, pagado = 0) => ({ total, saldo: Math.max(0, total - pagado), pagado });

  it("con el mismo total y lo mismo pagado no avisa nada", () => {
    expect(avisoCuentaRecalculada(antes, ahora(15), "vieja")).toBeNull();
  });

  it("si subió en efectivo, dice el saldo nuevo y qué escribir en Recibido si ya dio el vuelto", () => {
    expect(avisoCuentaRecalculada(antes, ahora(20), "vieja")?.texto).toBe(
      "Pasaron 5 minutos y la cuenta se recalculó a la hora de ahora: ahora el saldo es Bs 20,00 (era Bs 15,00). Si ya diste el vuelto, en «Recibido» escribí Bs 15,00 (lo que te quedó): el cambio o lo que falta sale solo.",
    );
  });

  it("con lo pagado de más compara el total: la devolución cambia aunque el saldo siga en 0", () => {
    // Revisión del 18-oct: adelanto de Bs 30 por una cuenta de 15. El saldo
    // era 0 antes y después, la devolución pasaba de 15 a 10 sin aviso y el
    // cajero que ya había devuelto 15 dejaba el cajón Bs 5 corto.
    const pagoDeMas = { ...antes, saldo: 0, pagado: 30, aFavor: 15, efectivo: 0 };
    expect(avisoCuentaRecalculada(pagoDeMas, ahora(20, 30), "vieja")?.texto).toBe(
      "Pasaron 5 minutos y la cuenta se recalculó a la hora de ahora: ahora hay que devolver Bs 10,00 (era Bs 15,00). Si ya devolviste Bs 15,00, pedile Bs 5,00 al cliente antes de cerrar.",
    );
    // Y si ya no queda nada para devolver, que no se lo quede el cliente.
    expect(avisoCuentaRecalculada(pagoDeMas, ahora(30, 30), "vieja")?.texto).toMatch(
      /ya no hay nada que devolver \(era Bs 15,00\)\. Si ya lo devolviste, pedíselo al cliente antes de cerrar\.$/,
    );
    // Si pasa a deber, el saldo se cobra y lo devuelto se pide aparte: el
    // formulario daba cambio sobre esa misma plata (revisión del 18-oct).
    expect(avisoCuentaRecalculada(pagoDeMas, ahora(35, 30), "vieja")?.texto).toMatch(
      /ahora el saldo es Bs 5,00 \(era Bs 0,00\)\. Si ya le devolviste Bs 15,00, cobrá el saldo y pedile aparte los Bs 15,00 que le devolviste\.$/,
    );
  });

  it("si ya entró un QR, no se cobra otra vez: queda en Mixto con lo que ya entró", () => {
    // Revisión del 18-oct: el cliente transfirió Bs 15 y, con la cuenta en
    // Bs 20, la pantalla pedía confirmar un QR de 20 mirando uno de 15 en el
    // banco. Se registraban Bs 5 que no llegaron.
    const porQr = { ...antes, qr: 15, efectivo: 0 };
    expect(avisoCuentaRecalculada(porQr, ahora(20), "vieja")).toEqual({
      texto:
        "Pasaron 5 minutos y la cuenta se recalculó a la hora de ahora: ahora el saldo es Bs 20,00 (era Bs 15,00). Si ya te pagaron Bs 15,00 por QR, no lo cobres otra vez: al aceptar queda en Mixto, con Bs 15,00 por QR y Bs 5,00 en efectivo.",
      sugerido: { metodo: "Mixto", efectivo: 5 },
    });
  });

  it("si la cuenta baja por debajo del QR que ya entró, queda todo por QR", () => {
    // Revisión del 18-oct: volvía a Efectivo y con «Justo» se registraban
    // Bs 10 en efectivo que nunca entraron; el arqueo daba el cajón corto.
    const porQr = { ...antes, qr: 15, efectivo: 0 };
    expect(avisoCuentaRecalculada(porQr, ahora(10), "vieja")).toEqual({
      texto:
        "Pasaron 5 minutos y la cuenta se recalculó a la hora de ahora: ahora el saldo es Bs 10,00 (era Bs 15,00). Si ya te pagaron Bs 15,00 por QR, eso cubre el saldo y sobran Bs 5,00: al aceptar queda todo por QR, y los Bs 5,00 se los devuelve el encargado.",
      sugerido: { metodo: "QR" },
    });
  });

  it("en el mixto dice qué hacer con el efectivo que ya dio", () => {
    // Revisión del 18-oct: Bs 5 en efectivo + Bs 10 por QR. Con la cuenta en
    // baja, el efectivo del cliente no se registraba ni se mandaba a devolver.
    const mixto = { ...antes, qr: 10, efectivo: 5 };
    expect(avisoCuentaRecalculada(mixto, ahora(20), "vieja")?.texto).toMatch(
      /con Bs 10,00 por QR y Bs 10,00 en efectivo\. De efectivo ya te dio Bs 5,00: pedile Bs 5,00 más\.$/,
    );
    expect(avisoCuentaRecalculada(mixto, ahora(14), "vieja")?.texto).toMatch(
      /con Bs 10,00 por QR y Bs 4,00 en efectivo\. De efectivo ya te dio Bs 5,00: devolvele Bs 1,00\.$/,
    );
    expect(avisoCuentaRecalculada(mixto, ahora(10), "vieja")).toEqual({
      texto:
        "Pasaron 5 minutos y la cuenta se recalculó a la hora de ahora: ahora el saldo es Bs 10,00 (era Bs 15,00). Si ya te pagaron Bs 10,00 por QR, eso cubre el saldo: al aceptar queda todo por QR. De efectivo ya te dio Bs 5,00: devolvele Bs 5,00.",
      sugerido: { metodo: "QR" },
    });
  });

  it("si lo cobrado en efectivo ya no hace falta, dice que se lo devuelva", () => {
    // Revisión del 18-oct: decía "ajustalo antes de cobrar" sin nada que
    // cobrar, y el efectivo recién recibido no se devolvía.
    const conAdelanto = { ...antes, total: 25, saldo: 5, pagado: 20, efectivo: 5 };
    expect(avisoCuentaRecalculada(conAdelanto, ahora(16, 20), "vieja")?.texto).toMatch(
      /ahora el saldo es Bs 0,00 \(era Bs 5,00\)\. Ya no queda saldo: si ya te dio Bs 5,00 en efectivo, devolvéselos y además Bs 4,00\.$/,
    );
  });

  it("dice por qué cambió: la hora, o lo que cargó o cobró otro equipo", () => {
    // Revisión del 18-oct: un rechazo con la hora al día que cruza un tramo
    // decía "Pasaron más de 5 minutos".
    expect(avisoCuentaRecalculada(antes, ahora(20), "hora")?.texto).toMatch(
      /^La cuenta se recalculó a la hora de ahora: ahora el saldo es Bs 20,00/,
    );
    // Otro equipo cobró un adelanto: el total es el mismo, cambió lo pagado.
    expect(avisoCuentaRecalculada(antes, ahora(15, 10), "otroEquipo")?.texto).toMatch(
      /^La cuenta cambió mientras cobrabas \(otro equipo cargó o cobró algo\): ahora el saldo es Bs 5,00 \(era Bs 15,00\)\./,
    );
  });
});
