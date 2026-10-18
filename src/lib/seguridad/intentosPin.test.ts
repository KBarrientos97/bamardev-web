import { describe, expect, it } from "vitest";
import type { IntentoPin, RespuestaIntentos } from "./apiSeguridad";
import {
  agrupar,
  conQueIncidente,
  cuando,
  cuandoFuturo,
  desenlaceDe,
  franjaDe,
  lineaDeTiempo,
  nivelDe,
  quePin,
  textoAlarma,
  textoRevisar,
} from "./intentosPin";

const AHORA = new Date(2026, 9, 18, 21, 20, 0).toISOString();
const ahoraMs = new Date(AHORA).getTime();
const hace = (seg: number) => new Date(ahoraMs - seg * 1000).toISOString();
const ANA = { id: 5, nombre: "Ana", usuario: "ana", rol: "Cajero" };
const KEVIN = { id: 1, nombre: "Kevin", usuario: "admin" };

let n = 0;
function intento(p: Partial<IntentoPin>): IntentoPin {
  n += 1;
  return {
    id: n,
    tipo: "FALLO",
    creadoEn: hace(300),
    operador: ANA,
    propio: false,
    tecleado: "admin",
    autorizador: KEVIN,
    motivo: "PIN_INCORRECTO",
    accion: "BILLAR_PAUSAR",
    descripcion: "Pausar la Mesa 3",
    sucursalId: null,
    seguidos: 1,
    delDia: 1,
    alarma: null,
    bloqueadoHasta: null,
    avisado: false,
    visto: false,
    vistoPor: null,
    ...p,
  };
}
const resp = (intentos: IntentoPin[], frenados: RespuestaIntentos["frenados"] = []): RespuestaIntentos => ({
  ahora: AHORA,
  hayMas: false,
  frenados,
  intentos,
});

describe("los incidentes: los intentos seguidos de una persona", () => {
  it("los fallos de menos de 15 min se juntan y el acierto los cierra", () => {
    const a = intento({ creadoEn: hace(600) });
    const b = intento({ creadoEn: hace(590), seguidos: 2 });
    const c = intento({ tipo: "ACIERTO", motivo: null, creadoEn: hace(580), seguidos: 2, alarma: "ACIERTO_TRAS_FALLOS" });
    const [inc] = agrupar([c, a, b]);
    expect(inc.filas.map((f) => f.id)).toEqual([a.id, b.id, c.id]);
    expect(inc.desenlace).toBe("exito");
    expect(inc.alarma).toBe("ACIERTO_TRAS_FALLOS");
  });

  it("un fallo de hace más de 15 min abre otro incidente", () => {
    const viejo = intento({ creadoEn: hace(3600) });
    const nuevo = intento({ creadoEn: hace(60) });
    expect(agrupar([viejo, nuevo])).toHaveLength(2);
  });
});

describe("qué tan grave es cada uno", () => {
  it("un fallo corregido enseguida por la misma persona es un error de tipeo", () => {
    const f = intento({ creadoEn: hace(120) });
    const a = intento({ tipo: "ACIERTO", motivo: null, creadoEn: hace(110) });
    expect(nivelDe(agrupar([f, a])[0], ahoraMs, KEVIN.id)).toBe("tipeo");
  });

  it("un fallo de hace segundos espera: todavía puede ser un dedo torpe", () => {
    expect(nivelDe(agrupar([intento({ creadoEn: hace(10) })])[0], ahoraMs)).toBe("esperando");
  });

  it("el que mira equivocándose su propio PIN no le enciende la franja a sí mismo", () => {
    const f = intento({ operador: KEVIN, propio: true, autorizador: null, tecleado: null });
    expect(nivelDe(agrupar([f])[0], ahoraMs, KEVIN.id)).toBe("propio");
    expect(franjaDe(resp([f]), KEVIN.id)).toBeNull();
  });
});

describe("la franja del dueño", () => {
  it("un fallo suelto va en gris, con quién, con qué PIN y para qué, y se puede dar por visto", () => {
    // El dueño, 18-oct: "que muestre que están intentando ingresar un PIN
    // erróneo, qué usuario".
    const f = franjaDe(resp([intento({})]), KEVIN.id);
    expect(f).toMatchObject({ tono: "gris", boton: "Ver", cerrable: true });
    expect(f?.texto).toBe("Desde el usuario de Ana se escribió mal tu PIN, para pausar la Mesa 3 · hoy 21:15 · no se autorizó después");
  });

  it("el error de tipeo no enciende nada", () => {
    expect(franjaDe(resp([intento({ creadoEn: hace(120) }), intento({ tipo: "ACIERTO", motivo: null, creadoEn: hace(110) })]))).toBeNull();
  });

  it("una alarma va en rojo y no se cierra desde la franja: se revisa en el detalle", () => {
    const f = franjaDe(resp([intento({ seguidos: 3, alarma: "TRES_SEGUIDOS", creadoEn: hace(60) }), intento({})]));
    expect(f).toMatchObject({ tono: "rojo", fija: false, boton: "Ver qué pasó", cerrable: false });
    expect(f?.texto).toBe("Desde el usuario de Ana se escribió mal 3 veces seguidas el PIN de Kevin, para pausar la Mesa 3 · hoy 21:19");
  });

  it("alguien frenado deja la franja roja fija, con su hora de vuelta", () => {
    const frenada = { usuarioId: ANA.id, nombre: "Ana", rol: "Cajero", desde: hace(60), hasta: new Date(ahoraMs + 24 * 3600_000 - 60_000).toISOString() };
    const f = franjaDe(resp([], [frenada]), KEVIN.id);
    expect(f).toMatchObject({ tono: "rojo", fija: true, boton: "Ver y habilitar", cerrable: false });
    expect(f?.texto).toBe("Ana no puede pedir autorizaciones con PIN: llegó a 10 equivocados en 24 horas. El freno se levanta solo mañana a las 21:19, o lo levantás vos.");
  });

  it("varias alarmas se resumen por persona", () => {
    const beto = { id: 6, nombre: "Beto" };
    // La de ayer primero: en la base los ids van en orden de llegada.
    const deAyer = intento({ alarma: "BLOQUEO", operador: beto, creadoEn: hace(26 * 3600) });
    const f = franjaDe(resp([deAyer, intento({ alarma: "TRES_SEGUIDOS" })]));
    expect(f?.texto).toBe("2 alertas de PIN sin revisar · desde los usuarios de Ana (hoy 21:15) y Beto (ayer 19:20)");
  });
});

describe("cómo se dice cada cosa", () => {
  it("el acierto tras fallos le pregunta al dueño del PIN si fue él", () => {
    const a = intento({ tipo: "ACIERTO", motivo: null, seguidos: 2, alarma: "ACIERTO_TRAS_FALLOS" });
    expect(textoAlarma(a, AHORA, KEVIN.id)).toBe(
      "Después de 2 equivocados, se autorizó con tu PIN desde el usuario de Ana: pausar la Mesa 3 · hoy 21:15. ¿Fuiste vos? Si no, cambiá tu PIN ya.",
    );
    expect(textoAlarma(a, AHORA, 99)).toBe(
      "Después de 2 equivocados, se autorizó con el PIN de Kevin desde el usuario de Ana: pausar la Mesa 3 · hoy 21:15. Si no fue Kevin, cambiale el PIN.",
    );
  });

  it("los grises dicen cómo terminó", () => {
    const otro = { id: 7, nombre: "Pedro" };
    const fallo = intento({ autorizador: otro, creadoEn: hace(600) });
    const acierto = intento({ tipo: "ACIERTO", motivo: null, creadoEn: hace(300) });
    expect(textoRevisar(agrupar([fallo, acierto])[0], AHORA, 99)).toBe(
      "Desde el usuario de Ana se escribió mal el PIN de Pedro, para pausar la Mesa 3 · hoy 21:10 · después se autorizó con el PIN de Kevin",
    );
    const desconocido = intento({ autorizador: null, tecleado: "kevn", motivo: "USUARIO_DESCONOCIDO" });
    expect(textoRevisar(agrupar([desconocido])[0], AHORA)).toBe(
      "Desde el usuario de Ana se escribió un PIN con el usuario «kevn», que no existe, para pausar la Mesa 3 · hoy 21:15",
    );
  });

  it("la línea de tiempo lleva los segundos, para buscarlo en la cámara", () => {
    const f = intento({ creadoEn: new Date(2026, 9, 18, 21, 14, 5).toISOString(), alarma: "TRES_SEGUIDOS", avisado: true });
    expect(lineaDeTiempo(f)).toBe("21:14:05 · PIN incorrecto · te avisamos (llegó al celular)");
    expect(lineaDeTiempo(intento({ tipo: "BLOQUEADO", motivo: "CORTO", creadoEn: new Date(2026, 9, 18, 21, 16, 40).toISOString() }))).toBe(
      "21:16:40 · siguió intentando con el PIN frenado",
    );
  });

  it("el desenlace del incidente, uno solo", () => {
    const f = intento({ creadoEn: hace(120) });
    const a = intento({ tipo: "ACIERTO", motivo: null, creadoEn: hace(114) });
    const inc = agrupar([f, a])[0];
    expect(desenlaceDe(inc, nivelDe(inc, ahoraMs), undefined, AHORA)).toBe(
      "A los 6 segundos se autorizó con el PIN de Kevin: parece un error de tipeo.",
    );
    const solo = agrupar([intento({ creadoEn: hace(600) })])[0];
    expect(desenlaceDe(solo, "revisar", undefined, AHORA)).toBe("No se volvió a intentar.");
    expect(conQueIncidente(agrupar([intento({ creadoEn: hace(900) }), intento({ creadoEn: hace(890), seguidos: 2 })])[0])).toBe(
      "Con el PIN de Kevin · 2 equivocados",
    );
  });

  it("con qué PIN se probó", () => {
    expect(quePin(intento({ propio: true, autorizador: null, tecleado: null }))).toBe("su propio PIN");
    expect(quePin(intento({ autorizador: null, tecleado: null, accion: "AGENDA_SOBRE_TURNO" }))).toBe(
      "un PIN que no es de ningún encargado",
    );
  });

  it("hoy, ayer, mañana o la fecha", () => {
    expect(cuando(hace(60), AHORA)).toBe("hoy 21:19");
    expect(cuando(hace(24 * 3600), AHORA)).toBe("ayer 21:20");
    expect(cuando(hace(3 * 24 * 3600), AHORA)).toBe("15/10 21:20");
    expect(cuandoFuturo(new Date(ahoraMs + 24 * 3600_000).toISOString(), AHORA)).toBe("mañana a las 21:20");
  });
});
