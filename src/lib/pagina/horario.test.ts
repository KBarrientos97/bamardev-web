import { describe, expect, it } from "vitest";
import {
  agregarCorte,
  agruparSemana,
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
    expect(error(Array.from({ length: 15 }, () => ({ dia: 1, desde: "09:00", hasta: "10:00" })))).toBe(
      "Hasta 2 tramos por día (por ejemplo, mañana y tarde)",
    );
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
    expect(errorDelDia({ dia: 2, abierto: true, tramos: [{ desde: "09:00", hasta: "18:00" }] })).toBeNull();
    expect(errorDelDia({ dia: 2, abierto: false, tramos: [{ desde: "20:00", hasta: "09:00" }] })).toBeNull();
    expect(
      errorDelDia({
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
