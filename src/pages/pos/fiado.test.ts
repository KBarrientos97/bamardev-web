import { describe, expect, it } from "vitest";
import { isoDia } from "../../lib/format";
import type { ClienteCredito } from "../../types";
import {
  claveCliente,
  clientePorNombre,
  diaLocal,
  fechaDelPlazo,
  finDeMes,
  leerPorcentaje,
  problemaDeLaFecha,
  sumarDias,
  textoPorcentaje,
} from "./fiado";

/** Una hora local cualquiera: las cuentas no dependen de la zona del equipo. */
const a = (anio: number, mes: number, dia: number, hora = 10) => new Date(anio, mes - 1, dia, hora);

describe("BUG-cobro-1: «Fin de mes» es el último día del mes, a cualquier hora", () => {
  it("fiado el 28-oct a las 15:00 se compromete al 31-oct, no al 30", () => {
    // El turno de la pollería es de 12:00 a la madrugada: el redondeo de los
    // días que faltaban daba 2 de tarde y la cuenta vencía un día antes.
    expect(isoDia(finDeMes(a(2026, 10, 28, 15)))).toBe("2026-10-31");
    expect(isoDia(finDeMes(a(2026, 10, 28, 9)))).toBe("2026-10-31");
    expect(isoDia(finDeMes(a(2026, 10, 28, 23)))).toBe("2026-10-31");
  });

  it("el anteúltimo día de tarde no salta al mes siguiente", () => {
    // Redondeaba a 0, caía en la rama del mes siguiente y daba el 29-nov.
    expect(isoDia(finDeMes(a(2026, 10, 30, 15)))).toBe("2026-10-31");
  });

  it("el último día del mes pasa al cierre del mes siguiente (el plazo tiene que ser futuro)", () => {
    expect(isoDia(finDeMes(a(2026, 10, 31, 8)))).toBe("2026-11-30");
    expect(isoDia(finDeMes(a(2026, 12, 31, 20)))).toBe("2027-01-31");
    expect(isoDia(finDeMes(a(2028, 1, 31)))).toBe("2028-02-29");
  });

  it("febrero cierra el 28 o el 29 según el año", () => {
    expect(isoDia(finDeMes(a(2027, 2, 10)))).toBe("2027-02-28");
    expect(isoDia(finDeMes(a(2028, 2, 10)))).toBe("2028-02-29");
  });
});

describe("los plazos de un toque cuentan días del calendario", () => {
  it("7, 15 y 30 días cruzan el fin de mes y de año", () => {
    expect(isoDia(fechaDelPlazo(7, a(2026, 10, 28, 22), "")!)).toBe("2026-11-04");
    expect(isoDia(fechaDelPlazo(15, a(2026, 12, 20), "")!)).toBe("2027-01-04");
    expect(isoDia(fechaDelPlazo(30, a(2026, 1, 31), "")!)).toBe("2026-03-02");
  });

  it("«Otra fecha» es el día elegido en el calendario, leído en hora local", () => {
    // `new Date("2026-11-05")` es medianoche UTC: en Bolivia, el 4 a las 20:00.
    expect(isoDia(fechaDelPlazo("OTRA", a(2026, 10, 28), "2026-11-05")!)).toBe("2026-11-05");
    expect(fechaDelPlazo("OTRA", a(2026, 10, 28), "")).toBeNull();
  });

  it("una fecha que no existe no se acepta (el constructor la correría de mes)", () => {
    expect(diaLocal("2026-02-30")).toBeNull();
    expect(diaLocal("2026-13-01")).toBeNull();
    expect(diaLocal("05/11/2026")).toBeNull();
  });

  it("sumarDias da la medianoche local del día", () => {
    const d = sumarDias(a(2026, 10, 28, 15), 1);
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([29, 0, 0]);
  });
});

describe("CRE-1: la fecha libre va desde mañana y hasta un año", () => {
  const hoy = a(2026, 10, 28, 15);

  it("mañana sí; hoy y ayer no", () => {
    expect(problemaDeLaFecha(diaLocal("2026-10-29"), hoy)).toBeNull();
    expect(problemaDeLaFecha(diaLocal("2026-10-28"), hoy)).toMatch(/desde mañana/);
    expect(problemaDeLaFecha(diaLocal("2026-10-01"), hoy)).toMatch(/desde mañana/);
  });

  it("sin fecha elegida pide el calendario", () => {
    expect(problemaDeLaFecha(null, hoy)).toMatch(/calendario/);
  });

  it("no pasa de un año: el backend mide hasta las 23:59 y rechazaría el día 365", () => {
    expect(problemaDeLaFecha(sumarDias(hoy, 364), hoy)).toBeNull();
    expect(problemaDeLaFecha(sumarDias(hoy, 365), hoy)).toMatch(/un año/);
  });
});

describe("CRE-4: el cliente se reconoce por el nombre como lo compara el backend", () => {
  const cliente = (id: number, nombre: string) => ({ id, nombre }) as ClienteCredito;

  it("sin tildes, mayúsculas ni espacios de más (y la ñ cuenta como n, igual que el backend)", () => {
    expect(claveCliente("  Pensión   DOÑA  Elena ")).toBe("pension dona elena");
    expect(claveCliente("pension dona elena")).toBe(claveCliente("Pensión Doña Elena"));
  });

  it("encuentra al cliente tecleado a mano; un nombre distinto es un cliente nuevo", () => {
    const lista = [cliente(4, "Juan Pérez"), cliente(5, "Rosa Mamani")];
    expect(clientePorNombre(lista, "rosa  mamani")?.id).toBe(5);
    expect(clientePorNombre(lista, "ROSA MAMANÍ")?.id).toBe(5);
    expect(clientePorNombre(lista, "Rosa")).toBeNull();
    expect(clientePorNombre(lista, "   ")).toBeNull();
  });
});

describe("CRE-2: el adelanto en % y en Bs se escriben uno al otro", () => {
  it("el % sale entero si es redondo y con un decimal si no", () => {
    expect(textoPorcentaje(50, 100)).toBe("50");
    expect(textoPorcentaje(33.33, 100)).toBe("33,3");
    expect(textoPorcentaje(20, 60)).toBe("33,3");
  });

  it("sin adelanto (o sin total) el % queda vacío, no en «0»", () => {
    expect(textoPorcentaje(0, 100)).toBe("");
    expect(textoPorcentaje(10, 0)).toBe("");
  });

  it("el % tecleado se lee con coma o punto y no pasa de 100", () => {
    expect(leerPorcentaje("33,5")).toBe(33.5);
    expect(leerPorcentaje("33.5")).toBe(33.5);
    expect(leerPorcentaje("150")).toBe(100);
    expect(leerPorcentaje("")).toBe(0);
    expect(leerPorcentaje("abc")).toBe(0);
  });
});
