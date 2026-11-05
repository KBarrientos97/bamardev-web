import { describe, expect, it } from "vitest";
import { conteosDeSede, datosQueFaltan, filaFinDeSemana, filaSiguiente, filasDeLosDetalles, mismasFilas, problemasDeLasFilas } from "./sedes";

describe("C5 · validar las franjas de una sede antes de mandarlas", () => {
  it("una lista bien armada no tiene problemas", () => {
    const r = problemasDeLasFilas([
      { inicio: "08:00", fin: "10:00" },
      { inicio: "10:00", fin: "12:00" },
    ]);
    expect(r.mensajes).toEqual([]);
    expect(r.filas.size).toBe(0);
  });

  it("una franja al revés, de cero minutos o sin hora marca su fila", () => {
    expect(problemasDeLasFilas([{ inicio: "08:00", fin: "10:00" }, { inicio: "12:00", fin: "11:00" }]).filas).toEqual(new Set([1]));
    expect(problemasDeLasFilas([{ inicio: "09:00", fin: "09:00" }]).filas).toEqual(new Set([0]));
    const sinHora = problemasDeLasFilas([{ inicio: "", fin: "10:00" }]);
    expect(sinHora.filas).toEqual(new Set([0]));
    expect(sinHora.mensajes[0]).toMatch(/Falta la hora/);
  });

  it("las que se pisan se marcan las dos, en el orden en que estén en pantalla", () => {
    const r = problemasDeLasFilas([
      { inicio: "14:00", fin: "16:00" },
      { inicio: "08:00", fin: "10:00" },
      { inicio: "09:30", fin: "11:00" },
    ]);
    expect(r.filas).toEqual(new Set([1, 2]));
    expect(r.mensajes).toEqual(["Las franjas 08:00–10:00 y 09:30–11:00 se pisan."]);
  });
});

describe("C5 · ubicar la fila que el backend rechazó", () => {
  const filas = [
    { inicio: "14:00", fin: "16:00" },
    { inicio: "08:00", fin: "10:00" },
    { inicio: "09:00", fin: "11:00" },
  ];

  it("por las horas que menciona", () => {
    const r = filasDeLosDetalles(["Las franjas 08:00–10:00 y 09:00–11:00 se pisan en la misma sede."], filas);
    expect(r).toEqual(new Set([1, 2]));
  });

  it("por el número de franja, que el backend cuenta ya ordenadas por hora", () => {
    // Ordenadas: 08:00 (fila 1), 09:00 (fila 2), 14:00 (fila 0): la franja 3 es la de la fila 0.
    expect(filasDeLosDetalles(["La franja 3 tiene que empezar antes de terminar."], filas)).toEqual(new Set([0]));
  });

  it("un detalle que no entiende no marca nada (el mensaje se muestra igual)", () => {
    expect(filasDeLosDetalles(["Algo raro pasó"], filas).size).toBe(0);
  });
});

describe("C5 · agregar franja y detectar cambios", () => {
  it("la nueva dura 2 horas desde donde termina la última", () => {
    expect(filaSiguiente([])).toEqual({ inicio: "08:00", fin: "10:00" });
    expect(filaSiguiente([{ inicio: "08:00", fin: "10:00" }, { inicio: "19:00", fin: "21:00" }])).toEqual({ inicio: "21:00", fin: "23:00" });
  });

  it("no se pasa de la medianoche", () => {
    const f = filaSiguiente([{ inicio: "21:00", fin: "23:00" }]);
    expect(f).toEqual({ inicio: "23:00", fin: "23:30" });
  });

  it("ronda 2 · B9: si la última termina a las 23:30, la nueva no queda de cero minutos", () => {
    const f = filaSiguiente([{ inicio: "21:30", fin: "23:30" }]);
    expect(f).toEqual({ inicio: "08:00", fin: "10:00" });
    // Y la lista resultante es válida salvo por lo que se pise: nunca "empezar antes de terminar".
    expect(problemasDeLasFilas([{ inicio: "21:30", fin: "23:30" }, f]).mensajes.join(" ")).not.toMatch(/antes de terminar/);
  });

  it("mismasFilas ignora la marca «de todas las sedes»", () => {
    expect(mismasFilas([{ inicio: "08:00", fin: "10:00", todasLasSedes: true }], [{ inicio: "08:00", fin: "10:00" }])).toBe(true);
    expect(mismasFilas([{ inicio: "08:00", fin: "10:00" }], [{ inicio: "08:00", fin: "11:00" }])).toBe(false);
    expect(mismasFilas([], [{ inicio: "08:00", fin: "10:00" }])).toBe(false);
  });
});

describe("C4 · textos chicos de la sede", () => {
  it("conteos en singular y plural", () => {
    expect(conteosDeSede({ aulas: 1, franjas: 5, gruposVigentes: 0 })).toEqual(["1 aula", "5 franjas", "0 grupos"]);
  });

  it("qué datos faltan, sin contar los vacíos como cargados", () => {
    expect(datosQueFaltan({ direccion: "  ", telefono: null, horarioSemanal: null, horarioAtencion: "Lun a Vie" })).toEqual(["la dirección", "el teléfono"]);
    expect(datosQueFaltan({ direccion: "A", telefono: "1", horarioSemanal: null, horarioAtencion: "B" })).toEqual([]);
    // El horario por día cuenta como cargado; una lista vacía y un texto en blanco, no.
    const lunes = [{ dia: 1, desde: "08:00", hasta: "12:00" }];
    expect(datosQueFaltan({ direccion: "A", telefono: "1", horarioSemanal: lunes, horarioAtencion: null })).toEqual([]);
    expect(datosQueFaltan({ direccion: "A", telefono: "1", horarioSemanal: [], horarioAtencion: " " })).toEqual(["el horario de atención"]);
  });
});

describe("franjas de sábado y domingo (Derick, 04-nov)", () => {
  it("una de fin de semana no se pisa con las de entre semana, pero sí con otra de fin de semana", () => {
    expect(
      problemasDeLasFilas([
        { inicio: "08:00", fin: "10:00" },
        { inicio: "08:00", fin: "12:00", finDeSemana: true },
      ]).mensajes,
    ).toEqual([]);
    const r = problemasDeLasFilas([
      { inicio: "08:00", fin: "10:00" },
      { inicio: "08:00", fin: "12:00", finDeSemana: true },
      { inicio: "11:00", fin: "13:00", finDeSemana: true },
    ]);
    expect(r.mensajes).toEqual(["Las franjas 08:00–12:00 y 11:00–13:00 se pisan."]);
    expect([...r.filas].sort()).toEqual([1, 2]);
  });

  it("la primera de fin de semana es de 08:00 a 12:00 y la siguiente arranca donde termina la anterior", () => {
    expect(filaFinDeSemana([{ inicio: "19:00", fin: "21:00" }])).toEqual({ inicio: "08:00", fin: "12:00", finDeSemana: true });
    expect(filaFinDeSemana([{ inicio: "08:00", fin: "12:00", finDeSemana: true }])).toEqual({ inicio: "12:00", fin: "16:00", finDeSemana: true });
    // "Agregar franja" sigue a la última de entre semana, no a la de 4 h del sábado.
    expect(filaSiguiente([{ inicio: "08:00", fin: "10:00" }, { inicio: "14:00", fin: "18:00", finDeSemana: true }])).toEqual({ inicio: "10:00", fin: "12:00" });
  });

  it("cambiar de lado es un cambio sin guardar", () => {
    expect(mismasFilas([{ inicio: "08:00", fin: "12:00" }], [{ inicio: "08:00", fin: "12:00", finDeSemana: true }])).toBe(false);
  });
});
