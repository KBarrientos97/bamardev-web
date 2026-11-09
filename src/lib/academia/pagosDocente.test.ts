import { describe, expect, it } from "vitest";
import {
  archivoComprobante,
  datosClases,
  hayAtrasosSinJustificar,
  mensajeComprobanteDocente,
  textoAtrasos,
  textoGrupoDelMes,
  textoGrupoPlanilla,
  textoMetodoPago,
  textoPagado,
  whatsappComprobante,
} from "./pagosDocente";
import type { ResumenClasesDocente } from "./tipos";

const SIN_ATRASOS = { cantidad: 0, minutos: 0, justificados: 0, minutosJustificados: 0 };

const clases = (p: Partial<ResumenClasesDocente>): ResumenClasesDocente => ({
  programadas: 12,
  suspendidas: 0,
  porReemplazo: 0,
  porDar: 0,
  conLista: 12,
  conLlegada: 12,
  sinLista: 0,
  comoReemplazo: 0,
  atrasos: SIN_ATRASOS,
  ...p,
});

/** Ítem 15 de la revisión del 08-nov: si el docente dio sus clases, en frases cortas. */
describe("las clases del mes en la tarjeta", () => {
  it("de título las clases del mes; debajo con lista y con llegada, aunque sean cero", () => {
    expect(datosClases(clases({ conLista: 0, conLlegada: 0, sinLista: 12 }))).toEqual({
      titulo: "12 clases en el mes",
      datos: [
        { texto: "0 con lista", tono: "normal" },
        { texto: "0 con llegada", tono: "normal" },
        { texto: "12 sin lista", tono: "aviso" },
      ],
    });
  });

  it("D7: la que dio un reemplazo se dice aparte, no como «sin lista»; lo que no llegó, «todavía no»", () => {
    const c = datosClases(clases({ programadas: 1, conLista: 0, conLlegada: 0, porReemplazo: 1 }))!;
    expect(c.titulo).toBe("1 clase en el mes");
    expect(c.datos.map((x) => x.texto)).toEqual(["0 con lista", "0 con llegada", "1 la dio un reemplazo"]);
    expect(datosClases(clases({ porDar: 3, porReemplazo: 2 }))!.datos.map((x) => x.texto)).toContain("2 las dio un reemplazo");
    expect(datosClases(clases({ porDar: 3 }))!.datos.map((x) => x.texto)).toContain("3 todavía no llegan");
    expect(datosClases(clases({ porDar: 1 }))!.datos.map((x) => x.texto)).toContain("1 todavía no llega");
  });

  it("el que sólo reemplazó: sin lista ni llegada que contar, sí las clases que dio", () => {
    expect(datosClases(clases({ programadas: 0, conLista: 0, conLlegada: 0, comoReemplazo: 2 }))).toEqual({
      titulo: "0 clases en el mes",
      datos: [{ texto: "Reemplazó en 2 clases", tono: "normal" }],
    });
  });

  it("sin clases, nada; las suspendidas se cuentan aparte", () => {
    expect(datosClases(clases({ programadas: 0, conLista: 0, conLlegada: 0 }))).toBeNull();
    expect(datosClases(undefined)).toBeNull();
    expect(datosClases(clases({ suspendidas: 1 }))!.datos.map((x) => x.texto)).toContain("1 suspendida");
  });
});

describe("los atrasos (D2: no descuentan solos)", () => {
  it("cuántos y los minutos; aparte los justificados", () => {
    expect(textoAtrasos(SIN_ATRASOS)).toBe("Sin atrasos");
    expect(textoAtrasos({ cantidad: 2, minutos: 25, justificados: 0, minutosJustificados: 0 })).toBe("2 atrasos · 25 min");
    expect(textoAtrasos({ cantidad: 3, minutos: 40, justificados: 1, minutosJustificados: 15 })).toBe("3 atrasos · 40 min (1 justificado, 15 min)");
    expect(textoAtrasos({ cantidad: 1, minutos: 12, justificados: 1, minutosJustificados: 12 })).toBe("1 atraso · 12 min (justificado)");
    expect(textoAtrasos({ cantidad: 2, minutos: 30, justificados: 2, minutosJustificados: 30 })).toBe("2 atrasos · 30 min (todos justificados)");
  });

  it("piden mirarlos los que no se justificaron", () => {
    expect(hayAtrasosSinJustificar({ cantidad: 2, minutos: 30, justificados: 2, minutosJustificados: 30 })).toBe(false);
    expect(hayAtrasosSinJustificar({ cantidad: 2, minutos: 30, justificados: 1, minutosJustificados: 10 })).toBe(true);
    expect(hayAtrasosSinJustificar(SIN_ATRASOS)).toBe(false);
  });
});

describe("con qué se pagó (ítem 3)", () => {
  it("el método y la fecha; sin método (resuelta sin pago), sólo la fecha", () => {
    expect(textoMetodoPago("TRANSFERENCIA")).toBe("Transferencia");
    expect(textoMetodoPago(null)).toBe("");
    expect(textoPagado({ pagadaEn: "2026-11-03T15:00:00.000Z", metodoPago: "EFECTIVO", pagadoPor: "Ana" })).toBe("Pagado el 03-nov · Efectivo");
    expect(textoPagado({ pagadaEn: null, metodoPago: null, pagadoPor: null }, "2026-11-03T15:00:00.000Z")).toBe("Pagado el 03-nov");
    expect(textoPagado(null)).toBe("Pagado");
  });
});

describe("los grupos con días y horario (ítem 4)", () => {
  it("el curso, el módulo, el horario y las clases; el que reemplazó lo dice", () => {
    const g = {
      grupoId: 7,
      materiaId: 11,
      nombre: "L-M-V 09–11",
      carrera: { id: 3, nombre: "Barbería" },
      materia: { orden: 2, nombre: "Degradados" },
      dias: [1, 3, 5],
      horaInicio: "09:00",
      horaFin: "11:00",
      clases: 12,
      comoReemplazo: false,
    };
    expect(textoGrupoDelMes(g)).toBe("Barbería · M2 Degradados · L Mi V 09:00–11:00 · 12 clases");
    expect(textoGrupoDelMes({ ...g, clases: 1, comoReemplazo: true })).toBe("Barbería · M2 Degradados · L Mi V 09:00–11:00 · 1 clase · como reemplazo");
  });

  it("un grupo de la planilla: con el horario si viene; si no, el nombre del grupo", () => {
    const g = { nombre: "L-M-V 09–11", carrera: { id: 3, nombre: "Barbería" } };
    expect(textoGrupoPlanilla({ ...g, dias: [1, 2, 3, 4, 5], horaInicio: "09:00", horaFin: "11:00" })).toBe("Barbería · L-V 09:00–11:00");
    expect(textoGrupoPlanilla(g)).toBe("Barbería · L-M-V 09–11");
  });
});

describe("el comprobante por WhatsApp (ítem 17)", () => {
  const datos = { docente: "Marco Rojas", negocio: "Instituto Drick", mes: "2026-10", monto: 1850, metodoPago: "QR" as const, pagadaEn: "2026-11-03T15:00:00.000Z" };

  it("el mensaje: por su nombre, el monto, el mes y cómo se pagó", () => {
    expect(mensajeComprobanteDocente(datos)).toBe(
      "Hola Marco, te pagamos Bs 1.850,00 por tus clases de octubre 2026, por QR, el 03-nov. Te paso el comprobante. ¡Gracias! Instituto Drick.",
    );
    expect(mensajeComprobanteDocente({ ...datos, metodoPago: "EFECTIVO", pagadaEn: null, negocio: null })).toBe(
      "Hola Marco, te pagamos Bs 1.850,00 por tus clases de octubre 2026, en efectivo. Te paso el comprobante. ¡Gracias!",
    );
  });

  it("al chat del docente si tiene WhatsApp; si no, el de elegir contacto", () => {
    expect(whatsappComprobante("70412386", "Hola")).toBe("https://wa.me/59170412386?text=Hola");
    expect(whatsappComprobante(null, "Hola Marco")).toBe("https://wa.me/?text=Hola%20Marco");
  });

  it("el archivo de la imagen, sin tildes ni espacios", () => {
    expect(archivoComprobante("Lucía Fernández", "2026-10")).toBe("comprobante-lucia-fernandez-2026-10");
    expect(archivoComprobante("", "2026-10")).toBe("comprobante-docente-2026-10");
  });
});
