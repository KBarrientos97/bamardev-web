import { describe, expect, it } from "vitest";
import {
  agregarCorte,
  agruparSemana,
  cierreDelDiaSiguiente,
  errorDelDia,
  estadoHorario,
  HorarioInvalido,
  mismoHorario,
  normalizarHorario,
  opcionesHora,
  resumenHorario,
  semanaDesdeTramos,
  textoEstado,
  tramosDesdeSemana,
  type DiaEditor,
  type Tramo,
} from "./horario";

/**
 * Los mismos casos que `src/pagina/horario.spec.ts` del backend: la regla es
 * una sola y vive de los dos lados.
 */

function error(valor: unknown): string | null {
  try {
    normalizarHorario(valor);
    return null;
  } catch (e) {
    expect(e).toBeInstanceOf(HorarioInvalido);
    return (e as Error).message;
  }
}

/** Un instante dado en la hora de Bolivia (UTC−4, sin horario de verano). */
const bolivia = (fechaHora: string) => new Date(`${fechaHora}:00-04:00`);
// 12-oct-2026 es lunes.
const LUNES = "2026-10-12";
const DOMINGO = "2026-10-18";

describe("normalizarHorario (los mensajes del backend)", () => {
  it("null o lista vacía = sin horario cargado", () => {
    expect(normalizarHorario(null)).toBeNull();
    expect(normalizarHorario(undefined)).toBeNull();
    expect(normalizarHorario([])).toBeNull();
  });

  it("no es una lista", () => {
    expect(error({ dia: 1 })).toBe("El horario tiene que ser una lista de tramos");
    expect(error("lunes a viernes")).toBe("El horario tiene que ser una lista de tramos");
  });

  it("el día va del 1 (lunes) al 7 (domingo)", () => {
    const msg = "Cada tramo tiene que tener un día del 1 (lunes) al 7 (domingo)";
    for (const dia of [0, 8, 1.5, "1", null]) expect(error([{ dia, desde: "09:00", hasta: "18:00" }])).toBe(msg);
    expect(error(["lunes"])).toBe(msg);
    expect(error([null])).toBe(msg);
  });

  it("las horas van en HH:MM; 24:00 sólo como cierre", () => {
    for (const desde of ["9", "9h", "25:00", "12:60", "", 900, "24:00"])
      expect(error([{ dia: 1, desde, hasta: "18:00" }])).toBe(
        "El lunes: la hora de apertura tiene que ser HH:MM, entre 00:00 y 23:59",
      );
    for (const hasta of ["18", "24:01", "25:00", "noche", null])
      expect(error([{ dia: 3, desde: "09:00", hasta }])).toBe(
        "El miércoles: la hora de cierre tiene que ser HH:MM, entre 00:00 y 24:00",
      );
    expect(normalizarHorario([{ dia: 5, desde: "18:00", hasta: "24:00" }])).toEqual([{ dia: 5, desde: "18:00", hasta: "24:00" }]);
  });

  it("el cierre va después de la apertura, sin cruzar la medianoche", () => {
    expect(error([{ dia: 1, desde: "09:00", hasta: "09:00" }])).toBe(
      "El lunes: la hora de cierre tiene que ser después de la de apertura (si cerrás pasada la medianoche, cargá hasta las 24:00 y seguí el martes desde las 00:00)",
    );
    expect(error([{ dia: 7, desde: "18:00", hasta: "01:00" }])).toContain(
      "El domingo: la hora de cierre tiene que ser después de la de apertura (si cerrás pasada la medianoche, cargá hasta las 24:00 y seguí el lunes",
    );
  });

  it("hasta 2 tramos por día", () => {
    expect(
      error([
        { dia: 2, desde: "08:00", hasta: "10:00" },
        { dia: 2, desde: "11:00", hasta: "13:00" },
        { dia: 2, desde: "15:00", hasta: "19:00" },
      ]),
    ).toBe("El martes: hasta 2 tramos por día (por ejemplo, mañana y tarde)");
    // Una lista que no puede ser válida (más de 3 por día de 7) se corta antes de recorrerla.
    expect(error(Array.from({ length: 22 }, () => ({ dia: 1, desde: "09:00", hasta: "10:00" })))).toBe(
      "Hasta 2 tramos por día (por ejemplo, mañana y tarde)",
    );
    expect(error(Array.from({ length: 15 }, () => ({ dia: 1, desde: "09:00", hasta: "10:00" })))).toBe(
      "El lunes: hasta 2 tramos por día (por ejemplo, mañana y tarde)",
    );
  });

  it("un tercero sólo si el primero es la madrugada de la noche anterior", () => {
    // El lunes cierra el martes a la 1:00 y el martes tiene sus 2 propios (12:00–15:00 y 19:00 a 1:00).
    const conMadrugada = [
      { dia: 1, desde: "19:00", hasta: "24:00" },
      { dia: 2, desde: "00:00", hasta: "01:00" },
      { dia: 2, desde: "12:00", hasta: "15:00" },
      { dia: 2, desde: "19:00", hasta: "24:00" },
      { dia: 3, desde: "00:00", hasta: "01:00" },
    ];
    expect(normalizarHorario(conMadrugada)).toEqual(conMadrugada);
    // Del domingo al lunes, igual.
    const domingo = [
      { dia: 1, desde: "00:00", hasta: "02:00" },
      { dia: 1, desde: "12:00", hasta: "15:00" },
      { dia: 1, desde: "19:00", hasta: "22:00" },
      { dia: 7, desde: "20:00", hasta: "24:00" },
    ];
    expect(normalizarHorario(domingo)).toEqual(domingo);
    // Los 7 días con 3 (21 tramos): entra justo en el techo.
    const todos = [1, 2, 3, 4, 5, 6, 7].flatMap((dia) => [
      { dia, desde: "00:00", hasta: "01:00" },
      { dia, desde: "12:00", hasta: "15:00" },
      { dia, desde: "19:00", hasta: "24:00" },
    ]);
    expect(normalizarHorario(todos)).toHaveLength(21);

    const tope = "El martes: hasta 2 tramos por día (por ejemplo, mañana y tarde)";
    // El lunes no cierra a las 24:00: esa madrugada no sigue de nadie.
    expect(error([{ dia: 1, desde: "19:00", hasta: "23:00" }, ...conMadrugada.slice(1)])).toBe(tope);
    // El primero del martes no arranca a las 00:00.
    expect(
      error([
        { dia: 1, desde: "19:00", hasta: "24:00" },
        { dia: 2, desde: "00:30", hasta: "01:00" },
        { dia: 2, desde: "12:00", hasta: "15:00" },
        { dia: 2, desde: "19:00", hasta: "22:00" },
      ]),
    ).toBe(tope);
    // Con la madrugada y 3 propios, tampoco.
    expect(error([...conMadrugada, { dia: 2, desde: "16:00", hasta: "17:00" }])).toBe(tope);
  });

  it("los tramos del mismo día no se pisan (que se toquen, sí)", () => {
    expect(
      error([
        { dia: 6, desde: "12:00", hasta: "18:00" },
        { dia: 6, desde: "09:00", hasta: "13:00" },
      ]),
    ).toBe("El sábado: los tramos 09:00-13:00 y 12:00-18:00 se pisan");
    expect(
      error([
        { dia: 6, desde: "09:00", hasta: "13:00" },
        { dia: 6, desde: "13:00", hasta: "18:00" },
      ]),
    ).toBeNull();
  });

  it("el error dice de qué día es (para ponerlo en su fila del popup)", () => {
    let dia: number | null | undefined;
    try {
      normalizarHorario([{ dia: 4, desde: "20:00", hasta: "10:00" }]);
    } catch (e) {
      dia = (e as HorarioInvalido).dia;
    }
    expect(dia).toBe(4);
  });

  it("ordena por día y hora, completa el cero y descarta campos de más", () => {
    expect(
      normalizarHorario([
        { dia: 2, desde: "15:00", hasta: "21:00" },
        { dia: 1, desde: "15:00", hasta: "21:00", nota: "x" },
        { dia: 2, desde: "9:00", hasta: "13:00" },
        { dia: 1, desde: " 09:30 ", hasta: "13:00" },
      ]),
    ).toEqual([
      { dia: 1, desde: "09:30", hasta: "13:00" },
      { dia: 1, desde: "15:00", hasta: "21:00" },
      { dia: 2, desde: "09:00", hasta: "13:00" },
      { dia: 2, desde: "15:00", hasta: "21:00" },
    ]);
  });
});

describe("estadoHorario (hora de Bolivia)", () => {
  const corrido: Tramo[] = [
    { dia: 1, desde: "09:00", hasta: "13:00" },
    { dia: 1, desde: "15:00", hasta: "21:00" },
    { dia: 3, desde: "09:00", hasta: "18:00" },
  ];

  it("sin horario: cerrado y sin próxima apertura (y sin cartel)", () => {
    expect(estadoHorario(null, bolivia(`${LUNES}T10:00`))).toEqual({ abierto: false, abre: null });
    expect(estadoHorario([], bolivia(`${LUNES}T10:00`))).toEqual({ abierto: false, abre: null });
    expect(textoEstado({ abierto: false, abre: null })).toBeNull();
  });

  it("abierto dice a qué hora cierra; en el corte, cuándo vuelve", () => {
    expect(estadoHorario(corrido, bolivia(`${LUNES}T10:00`))).toEqual({ abierto: true, cierra: "13:00" });
    expect(estadoHorario(corrido, bolivia(`${LUNES}T13:00`))).toEqual({ abierto: false, abre: { dia: 1, hora: "15:00", enDias: 0 } });
    expect(estadoHorario(corrido, bolivia(`${LUNES}T08:59`))).toEqual({ abierto: false, abre: { dia: 1, hora: "09:00", enDias: 0 } });
  });

  it("cerrado de noche: abre otro día, y la semana da la vuelta", () => {
    expect(estadoHorario(corrido, bolivia(`${LUNES}T22:00`))).toEqual({ abierto: false, abre: { dia: 3, hora: "09:00", enDias: 2 } });
    expect(estadoHorario(corrido, bolivia(`${DOMINGO}T12:00`))).toEqual({ abierto: false, abre: { dia: 1, hora: "09:00", enDias: 1 } });
    const soloLunes = [{ dia: 1, desde: "09:00", hasta: "12:00" }];
    expect(estadoHorario(soloLunes, bolivia(`${LUNES}T15:00`))).toEqual({ abierto: false, abre: { dia: 1, hora: "09:00", enDias: 7 } });
  });

  it("el que cierra pasada la medianoche se lee como un solo tramo, también de domingo a lunes", () => {
    const tarde: Tramo[] = [
      { dia: 7, desde: "18:00", hasta: "24:00" },
      { dia: 1, desde: "00:00", hasta: "01:00" },
    ];
    expect(estadoHorario(tarde, bolivia(`${DOMINGO}T23:00`))).toEqual({ abierto: true, cierra: "01:00" });
    expect(estadoHorario(tarde, bolivia(`${LUNES}T00:30`))).toEqual({ abierto: true, cierra: "01:00" });
    // De viernes a sábado, igual.
    const viernes: Tramo[] = [
      { dia: 5, desde: "18:00", hasta: "24:00" },
      { dia: 6, desde: "00:00", hasta: "02:00" },
    ];
    expect(estadoHorario(viernes, bolivia("2026-10-16T22:00"))).toEqual({ abierto: true, cierra: "02:00" });
    expect(estadoHorario([{ dia: 1, desde: "18:00", hasta: "24:00" }], bolivia(`${LUNES}T23:00`))).toEqual({
      abierto: true,
      cierra: "24:00",
    });
  });

  it("abierto las 24 horas los 7 días: no cierra", () => {
    const siempre = [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia, desde: "00:00", hasta: "24:00" }));
    expect(estadoHorario(siempre, bolivia(`${LUNES}T03:00`))).toEqual({ abierto: true, cierra: null });
  });

  it("la hora es la de Bolivia y no la del dispositivo (UTC)", () => {
    // 00:30 UTC del martes = 20:30 del lunes en Bolivia (abierto); 01:30 UTC = 21:30 (ya cerró).
    expect(estadoHorario(corrido, new Date("2026-10-13T00:30:00Z"))).toEqual({ abierto: true, cierra: "21:00" });
    expect(estadoHorario(corrido, new Date("2026-10-13T01:30:00Z"))).toEqual({
      abierto: false,
      abre: { dia: 3, hora: "09:00", enDias: 2 },
    });
  });
});

describe("textoEstado", () => {
  it("abierto: a qué hora cierra, a medianoche o las 24 horas", () => {
    expect(textoEstado({ abierto: true, cierra: "21:00" })).toBe("Abierto ahora · cierra 21:00");
    expect(textoEstado({ abierto: true, cierra: "01:00" })).toBe("Abierto ahora · cierra 1:00");
    expect(textoEstado({ abierto: true, cierra: "24:00" })).toBe("Abierto ahora · cierra a medianoche");
    expect(textoEstado({ abierto: true, cierra: null })).toBe("Abierto las 24 horas");
  });

  it("cerrado: hoy, mañana, el día o el próximo (si es el mismo día la semana que viene)", () => {
    expect(textoEstado({ abierto: false, abre: { dia: 1, hora: "16:00", enDias: 0 } })).toBe("Cerrado · abre hoy 16:00");
    expect(textoEstado({ abierto: false, abre: { dia: 2, hora: "09:00", enDias: 1 } })).toBe("Cerrado · abre mañana 9:00");
    expect(textoEstado({ abierto: false, abre: { dia: 1, hora: "09:00", enDias: 3 } })).toBe("Cerrado · abre el lunes 9:00");
    expect(textoEstado({ abierto: false, abre: { dia: 1, hora: "09:00", enDias: 7 } })).toBe("Cerrado · abre el próximo lunes 9:00");
  });
});

describe("resumen agrupado", () => {
  const habiles = [1, 2, 3, 4, 5].map((dia) => ({ dia, desde: "09:00", hasta: "20:00" }));

  it("junta los días seguidos con el mismo horario", () => {
    expect(resumenHorario([...habiles, { dia: 6, desde: "09:00", hasta: "13:00" }])).toBe(
      "Lun a vie 9:00–20:00 · Sáb 9:00–13:00 · Dom cerrado",
    );
  });

  it("dos días seguidos van con «y»; el corte del mediodía, también", () => {
    expect(
      resumenHorario([
        { dia: 6, desde: "10:00", hasta: "14:00" },
        { dia: 7, desde: "10:00", hasta: "14:00" },
        { dia: 1, desde: "15:00", hasta: "21:00" },
        { dia: 1, desde: "09:00", hasta: "13:00" },
      ]),
    ).toBe("Lun 9:00–13:00 y 15:00–21:00 · Mar a vie cerrado · Sáb y dom 10:00–14:00");
  });

  it("todos los días igual, y las 24 horas", () => {
    expect(resumenHorario([1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia, desde: "08:00", hasta: "22:00" })))).toBe(
      "Todos los días 8:00–22:00",
    );
    expect(resumenHorario([1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia, desde: "00:00", hasta: "24:00" })))).toBe(
      "Todos los días 24 horas",
    );
  });

  it("sin tramos no hay resumen", () => {
    expect(resumenHorario(null)).toBeNull();
    expect(resumenHorario([])).toBeNull();
    expect(agruparSemana(undefined)).toEqual([]);
  });

  it("un día que no es seguido no se junta (lun y mié iguales, mar distinto)", () => {
    expect(
      agruparSemana([
        { dia: 1, desde: "09:00", hasta: "18:00" },
        { dia: 3, desde: "09:00", hasta: "18:00" },
      ]).slice(0, 3),
    ).toEqual([
      { dias: "Lun", horas: "9:00–18:00" },
      { dias: "Mar", horas: null },
      { dias: "Mié", horas: "9:00–18:00" },
    ]);
  });
});

describe("el popup del horario", () => {
  it("ida y vuelta: los días cerrados guardan sus horas pero no se mandan", () => {
    const semana = semanaDesdeTramos([
      { dia: 1, desde: "15:00", hasta: "20:00" },
      { dia: 1, desde: "09:00", hasta: "13:00" },
    ]);
    expect(semana).toHaveLength(7);
    expect(semana[0]).toEqual({
      dia: 1,
      abierto: true,
      tramos: [
        { desde: "09:00", hasta: "13:00" },
        { desde: "15:00", hasta: "20:00" },
      ],
    });
    expect(semana[6]).toEqual({ dia: 7, abierto: false, tramos: [] });
    const cerrado = semana.map((d) => (d.dia === 1 ? { ...d, abierto: false } : d));
    expect(tramosDesdeSemana(cerrado)).toEqual([]);
    expect(tramosDesdeSemana(semana)).toHaveLength(2);
  });

  it("el error de cada día, con el mensaje del backend", () => {
    const solo = (d: DiaEditor) => errorDelDia(d, [d]);
    expect(solo({ dia: 2, abierto: true, tramos: [{ desde: "09:00", hasta: "18:00" }] })).toBeNull();
    expect(solo({ dia: 2, abierto: false, tramos: [{ desde: "20:00", hasta: "09:00" }] })).toBeNull();
    expect(
      solo({
        dia: 1,
        abierto: true,
        tramos: [
          { desde: "09:00", hasta: "13:00" },
          { desde: "12:00", hasta: "18:00" },
        ],
      }),
    ).toBe("El lunes: los tramos 09:00-13:00 y 12:00-18:00 se pisan");
  });

  it("agregar corte parte el día en mañana y tarde", () => {
    expect(agregarCorte([{ desde: "09:00", hasta: "20:00" }])).toEqual([
      { desde: "09:00", hasta: "13:00" },
      { desde: "15:00", hasta: "20:00" },
    ]);
    expect(agregarCorte([{ desde: "08:00", hasta: "12:00" }])).toEqual([
      { desde: "08:00", hasta: "12:00" },
      { desde: "13:00", hasta: "17:00" },
    ]);
    expect(agregarCorte([{ desde: "18:00", hasta: "23:00" }])[1]).toEqual({ desde: "23:00", hasta: "24:00" });
  });

  it("las horas de los selectores: cada media hora, 24:00 sólo para cerrar, y la guardada aunque no caiga justo", () => {
    expect(opcionesHora(false)).toHaveLength(48);
    expect(opcionesHora(false)[0]).toBe("00:00");
    expect(opcionesHora(false)).not.toContain("24:00");
    expect(opcionesHora(true)[0]).toBe("00:30");
    expect(opcionesHora(true).at(-1)).toBe("24:00");
    const conRara = opcionesHora(false, "09:15");
    expect(conRara.slice(18, 21)).toEqual(["09:00", "09:15", "09:30"]);
  });

  it("mismoHorario: null y vacío son lo mismo; el orden no importa", () => {
    expect(mismoHorario(null, [])).toBe(true);
    expect(mismoHorario(undefined, null)).toBe(true);
    const a = [
      { dia: 2, desde: "09:00", hasta: "13:00" },
      { dia: 1, desde: "09:00", hasta: "13:00" },
    ];
    expect(mismoHorario(a, [...a].reverse())).toBe(true);
    expect(mismoHorario(a, a.slice(1))).toBe(false);
  });
});

describe("el que cierra pasada la medianoche (de 10:00 a 1:00)", () => {
  /** Un día abierto del popup: `abierto(2, "10:00-01:00")`. */
  const abierto = (dia: number, ...tramos: string[]): DiaEditor => ({
    dia,
    abierto: true,
    tramos: tramos.map((t) => {
      const [desde, hasta] = t.split("-");
      return { desde, hasta };
    }),
  });
  /** La semana del popup: los días que no se nombran, cerrados y sin horas. */
  const semana = (...dias: DiaEditor[]): DiaEditor[] =>
    [1, 2, 3, 4, 5, 6, 7].map((dia) => dias.find((d) => d.dia === dia) ?? { dia, abierto: false, tramos: [] });
  const todaLaSemana = (...tramos: string[]) => semana(...[1, 2, 3, 4, 5, 6, 7].map((dia) => abierto(dia, ...tramos)));
  const guardar = (s: DiaEditor[]) => normalizarHorario(tramosDesdeSemana(s));
  const errores = (s: DiaEditor[]) => s.map((d) => errorDelDia(d, s));
  /** Todos los días de 10:00 a 1:00, como queda guardado (14 tramos). */
  const hasta1Guardado: Tramo[] = [1, 2, 3, 4, 5, 6, 7].flatMap((dia) => [
    { dia, desde: "00:00", hasta: "01:00" },
    { dia, desde: "10:00", hasta: "24:00" },
  ]);

  it("al guardar se parte: hasta las 24:00 ese día y desde las 00:00 el siguiente", () => {
    expect(guardar(semana(abierto(2, "10:00-01:00")))).toEqual([
      { dia: 2, desde: "10:00", hasta: "24:00" },
      { dia: 3, desde: "00:00", hasta: "01:00" },
    ]);
    // El domingo sigue en el lunes.
    expect(guardar(semana(abierto(7, "18:00-02:00")))).toEqual([
      { dia: 1, desde: "00:00", hasta: "02:00" },
      { dia: 7, desde: "18:00", hasta: "24:00" },
    ]);
    // Aunque el día siguiente esté cerrado en el popup (sus horas escondidas no viajan).
    const conMiercolesCerrado = semana(abierto(2, "10:00-01:00"), {
      dia: 3,
      abierto: false,
      tramos: [{ desde: "09:00", hasta: "18:00" }],
    });
    expect(guardar(conMiercolesCerrado)).toEqual([
      { dia: 2, desde: "10:00", hasta: "24:00" },
      { dia: 3, desde: "00:00", hasta: "01:00" },
    ]);
    expect(guardar(todaLaSemana("10:00-01:00"))).toEqual(hasta1Guardado);
  });

  it("al abrir se junta en el día que abre; el que sólo tenía esa madrugada se ve cerrado", () => {
    const s = semanaDesdeTramos([
      { dia: 2, desde: "10:00", hasta: "24:00" },
      { dia: 3, desde: "00:00", hasta: "01:00" },
    ]);
    expect(s[1]).toEqual({ dia: 2, abierto: true, tramos: [{ desde: "10:00", hasta: "01:00" }] });
    expect(s[2]).toEqual({ dia: 3, abierto: false, tramos: [] });
    expect(semanaDesdeTramos(hasta1Guardado)).toEqual(todaLaSemana("10:00-01:00"));
    // Del domingo al lunes.
    const domingo = semanaDesdeTramos([
      { dia: 1, desde: "00:00", hasta: "02:00" },
      { dia: 7, desde: "18:00", hasta: "24:00" },
    ]);
    expect(domingo[6].tramos).toEqual([{ desde: "18:00", hasta: "02:00" }]);
    expect(domingo[0]).toEqual({ dia: 1, abierto: false, tramos: [] });
    // El día siguiente con sus propios tramos: le queda lo suyo.
    expect(
      semanaDesdeTramos([
        { dia: 2, desde: "19:00", hasta: "24:00" },
        { dia: 3, desde: "00:00", hasta: "01:00" },
        { dia: 3, desde: "12:00", hasta: "15:00" },
        { dia: 3, desde: "19:00", hasta: "24:00" },
        { dia: 4, desde: "00:00", hasta: "01:00" },
      ]).slice(1, 4),
    ).toEqual([abierto(2, "19:00-01:00"), abierto(3, "12:00-15:00", "19:00-01:00"), { dia: 4, abierto: false, tramos: [] }]);
  });

  it("con una hora de la madrugada igual o posterior a la apertura no se junta: 24 horas queda como está", () => {
    expect(semanaDesdeTramos([1, 2].map((dia) => ({ dia, desde: "00:00", hasta: "24:00" }))).slice(0, 2)).toEqual([
      abierto(1, "00:00-24:00"),
      abierto(2, "00:00-24:00"),
    ]);
    expect(semanaDesdeTramos([1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia, desde: "00:00", hasta: "24:00" })))).toEqual(
      todaLaSemana("00:00-24:00"),
    );
    expect(
      semanaDesdeTramos([
        { dia: 1, desde: "00:00", hasta: "24:00" },
        { dia: 2, desde: "00:00", hasta: "05:00" },
      ]).slice(0, 2),
    ).toEqual([abierto(1, "00:00-24:00"), abierto(2, "00:00-05:00")]);
    // Justo hasta la hora en que abrió (10:00 a 10:00 del otro día) tampoco: sería "igual".
    expect(
      semanaDesdeTramos([
        { dia: 1, desde: "10:00", hasta: "24:00" },
        { dia: 2, desde: "00:00", hasta: "10:00" },
      ]).slice(0, 2),
    ).toEqual([abierto(1, "10:00-24:00"), abierto(2, "00:00-10:00")]);
    // Si no cierra a las 24:00, la madrugada del otro día es de ese día.
    expect(
      semanaDesdeTramos([
        { dia: 1, desde: "10:00", hasta: "22:00" },
        { dia: 2, desde: "00:00", hasta: "01:00" },
      ]).slice(0, 2),
    ).toEqual([abierto(1, "10:00-22:00"), abierto(2, "00:00-01:00")]);
  });

  it("ida y vuelta exacta: guardar(abrir(guardado)) = guardado y abrir(guardar(popup)) = popup", () => {
    const guardados: Tramo[][] = [
      hasta1Guardado,
      [
        ...[1, 2, 3, 4, 5].flatMap((dia) => [
          { dia, desde: "09:00", hasta: "13:00" },
          { dia, desde: "15:00", hasta: "20:00" },
        ]),
        { dia: 6, desde: "09:00", hasta: "13:00" },
      ],
      // 2 propios + la madrugada de la noche anterior (3 guardados), los 7 días.
      [1, 2, 3, 4, 5, 6, 7].flatMap((dia) => [
        { dia, desde: "00:00", hasta: "01:00" },
        { dia, desde: "12:00", hasta: "15:00" },
        { dia, desde: "19:00", hasta: "24:00" },
      ]),
      [
        { dia: 1, desde: "00:00", hasta: "02:00" },
        { dia: 7, desde: "18:00", hasta: "24:00" },
      ],
      [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia, desde: "00:00", hasta: "24:00" })),
      [
        { dia: 1, desde: "00:00", hasta: "24:00" },
        { dia: 2, desde: "00:00", hasta: "05:00" },
      ],
      [
        { dia: 1, desde: "10:00", hasta: "24:00" },
        { dia: 2, desde: "00:00", hasta: "10:00" },
      ],
      [
        { dia: 5, desde: "20:00", hasta: "24:00" },
        { dia: 6, desde: "00:00", hasta: "02:00" },
        { dia: 6, desde: "20:00", hasta: "24:00" },
        { dia: 7, desde: "00:00", hasta: "03:00" },
      ],
      // Una noche que sigue en otra que también cruza.
      [
        { dia: 1, desde: "22:00", hasta: "24:00" },
        { dia: 2, desde: "00:00", hasta: "03:00" },
        { dia: 2, desde: "03:00", hasta: "24:00" },
        { dia: 3, desde: "00:00", hasta: "02:00" },
      ],
    ];
    for (const g of guardados) {
      expect(guardar(semanaDesdeTramos(g))).toEqual(normalizarHorario(g));
      expect(errores(semanaDesdeTramos(g))).toEqual([null, null, null, null, null, null, null]);
    }

    const popups: DiaEditor[][] = [
      todaLaSemana("10:00-01:00"),
      todaLaSemana("12:00-15:00", "19:00-01:00"),
      semana(abierto(1, "12:00-15:00", "19:00-01:00"), abierto(2, "12:00-15:00", "19:00-01:00")),
      semana(abierto(7, "18:00-02:00")),
      semana(abierto(2, "22:00-03:00"), abierto(3, "03:00-02:00")),
      semana(abierto(5, "20:00-02:00"), abierto(6, "20:00-03:00")),
      todaLaSemana("00:00-24:00"),
      semana(abierto(1, "09:00-13:00", "15:00-20:00"), abierto(6, "09:00-13:00")),
      semana(abierto(1, "10:00-09:00")),
    ];
    for (const p of popups) {
      expect(errores(p)).toEqual([null, null, null, null, null, null, null]);
      expect(semanaDesdeTramos(guardar(p))).toEqual(p);
    }
  });

  it("lo guardado se lee como siempre: abierto y cierra 1:00", () => {
    const tramos = guardar(semana(abierto(1, "10:00-01:00")));
    expect(estadoHorario(tramos, bolivia(`${LUNES}T23:30`))).toEqual({ abierto: true, cierra: "01:00" });
    expect(estadoHorario(tramos, bolivia("2026-10-13T00:30"))).toEqual({ abierto: true, cierra: "01:00" });
    expect(estadoHorario(tramos, bolivia("2026-10-13T01:00"))).toEqual({
      abierto: false,
      abre: { dia: 1, hora: "10:00", enDias: 6 },
    });
  });

  it("la hora de cierre no puede ser igual a la de apertura", () => {
    expect(errores(semana(abierto(2, "10:00-10:00")))[1]).toBe(
      "El martes: la hora de cierre no puede ser igual a la de apertura (si atendés las 24 horas, cargá de 0:00 a 24:00)",
    );
    expect(errores(semana(abierto(2, "00:00-24:00")))[1]).toBeNull();
  });

  it("el que cruza no puede pisar la apertura del día siguiente (el error va en el día que cruza)", () => {
    // Con espacios duros para que "se pisan" o "a las 2:00" no se partan en dos renglones.
    const plano = (e: string | null) => e?.replace(/\u00A0/g, " ") ?? null;
    const pisa = semana(abierto(2, "20:00-03:00"), abierto(3, "02:00-12:00"));
    expect(errores(pisa).map(plano)).toEqual([
      null,
      "El martes cierra a las 3:00 del miércoles, pero el miércoles ya abre a las 2:00: se pisan",
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(errores(pisa)[1]).toContain("ya abre a\u00A0las\u00A02:00: se\u00A0pisan");
    // "a la 1:00", y la apertura más temprana del día aunque esté cargada segunda.
    expect(plano(errores(semana(abierto(4, "20:00-01:00"), abierto(5, "15:00-20:00", "00:30-05:00")))[3])).toBe(
      "El jueves cierra a la 1:00 del viernes, pero el viernes ya abre a las 0:30: se pisan",
    );
    // Del domingo al lunes.
    expect(plano(errores(semana(abierto(7, "20:00-03:00"), abierto(1, "01:00-12:00")))[6])).toBe(
      "El domingo cierra a las 3:00 del lunes, pero el lunes ya abre a la 1:00: se pisan",
    );
    // Que cierre justo cuando abre el otro no se pisa; con el otro cerrado, tampoco.
    expect(errores(semana(abierto(2, "20:00-03:00"), abierto(3, "03:00-12:00"))).every((e) => e === null)).toBe(true);
    const cerrado = semana(abierto(2, "20:00-03:00"), { dia: 3, abierto: false, tramos: [{ desde: "02:00", hasta: "12:00" }] });
    expect(errores(cerrado).every((e) => e === null)).toBe(true);
  });

  it("sólo el último del día puede cruzar; el dueño sigue con 2 tramos por día", () => {
    expect(errores(semana(abierto(1, "19:00-01:00", "22:00-23:00")))[0]).toBe(
      "El lunes: los tramos 19:00-01:00 y 22:00-23:00 se pisan",
    );
    // Cargados al revés, igual (se ordenan por la apertura).
    expect(errores(semana(abierto(1, "22:00-23:00", "19:00-01:00")))[0]).toBe(
      "El lunes: los tramos 19:00-01:00 y 22:00-23:00 se pisan",
    );
    expect(errores(semana(abierto(1, "12:00-15:00", "19:00-01:00")))[0]).toBeNull();
    expect(errores(semana(abierto(2, "08:00-10:00", "11:00-13:00", "15:00-19:00")))[1]).toBe(
      "El martes: hasta 2 tramos por día (por ejemplo, mañana y tarde)",
    );
    // Sus 2 y la madrugada del lunes: el martes queda con 3 guardados, y se acepta.
    const tres = semana(abierto(1, "19:00-01:00"), abierto(2, "12:00-15:00", "19:00-01:00"));
    expect(errores(tres).every((e) => e === null)).toBe(true);
    expect(guardar(tres)).toEqual([
      { dia: 1, desde: "19:00", hasta: "24:00" },
      { dia: 2, desde: "00:00", hasta: "01:00" },
      { dia: 2, desde: "12:00", hasta: "15:00" },
      { dia: 2, desde: "19:00", hasta: "24:00" },
      { dia: 3, desde: "00:00", hasta: "01:00" },
    ]);
  });

  it("la ayuda gris dice a qué hora y qué día cierra", () => {
    expect(cierreDelDiaSiguiente(2, { desde: "10:00", hasta: "01:00" })).toBe("Cierre: 1:00 del miércoles (madrugada)");
    expect(cierreDelDiaSiguiente(7, { desde: "18:00", hasta: "02:30" })).toBe("Cierre: 2:30 del lunes (madrugada)");
    // El que eligió mal (quería 21:00) lo ve: cierra a las 9:00 de otro día.
    expect(cierreDelDiaSiguiente(1, { desde: "10:00", hasta: "09:00" })).toBe("Cierre: 9:00 del martes");
    expect(cierreDelDiaSiguiente(1, { desde: "10:00", hasta: "24:00" })).toBeNull();
    expect(cierreDelDiaSiguiente(1, { desde: "09:00", hasta: "18:00" })).toBeNull();
  });

  it("agregar corte sobre uno que cruza da dos tramos válidos", () => {
    const casos: [string, string[]][] = [
      ["10:00-01:00", ["10:00-13:00", "15:00-01:00"]],
      ["19:00-01:00", ["12:00-15:00", "19:00-01:00"]],
      ["14:00-02:00", ["14:00-17:00", "19:00-02:00"]],
    ];
    for (const [antes, despues] of casos) {
      const corte = agregarCorte(abierto(1, antes).tramos);
      expect(corte).toEqual(abierto(1, ...despues).tramos);
      expect(errores(semana({ dia: 1, abierto: true, tramos: corte }))[0]).toBeNull();
    }
  });

  it("el resumen y la semana agrupada lo dicen como el dueño: 10:00–1:00", () => {
    expect(resumenHorario(hasta1Guardado)).toBe("Todos los días 10:00–1:00");
    expect(resumenHorario(tramosDesdeSemana(todaLaSemana("12:00-15:00", "19:00-01:00")))).toBe(
      "Todos los días 12:00–15:00 y 19:00–1:00",
    );
    // El que ya lo había cargado partido, también.
    expect(
      resumenHorario([
        { dia: 5, desde: "18:00", hasta: "24:00" },
        { dia: 6, desde: "00:00", hasta: "02:00" },
      ]),
    ).toBe("Lun a jue cerrado · Vie 18:00–2:00 · Sáb y dom cerrado");
    expect(
      resumenHorario([
        { dia: 7, desde: "18:00", hasta: "24:00" },
        { dia: 1, desde: "00:00", hasta: "01:00" },
      ]),
    ).toBe("Lun a sáb cerrado · Dom 18:00–1:00");
    expect(
      agruparSemana([
        { dia: 5, desde: "20:00", hasta: "24:00" },
        { dia: 6, desde: "00:00", hasta: "02:00" },
        { dia: 6, desde: "20:00", hasta: "24:00" },
        { dia: 7, desde: "00:00", hasta: "03:00" },
      ]),
    ).toEqual([
      { dias: "Lun a jue", horas: null },
      { dias: "Vie", horas: "20:00–2:00" },
      { dias: "Sáb", horas: "20:00–3:00" },
      { dias: "Dom", horas: null },
    ]);
    // Lo que no se junta queda como hoy.
    expect(
      resumenHorario([
        { dia: 1, desde: "00:00", hasta: "24:00" },
        { dia: 2, desde: "00:00", hasta: "05:00" },
      ]),
    ).toBe("Lun 24 horas · Mar 0:00–5:00 · Mié a dom cerrado");
  });
});
