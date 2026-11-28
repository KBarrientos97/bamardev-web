import { describe, expect, it } from "vitest";
import { DIAS_SEMANA, esDiaSemana, nombreDia, pluralDia, vieneLos } from "./dias";

describe("el día que viene el paciente (§11)", () => {
  it("los seis días, de lunes a sábado, con su nombre corto", () => {
    expect(DIAS_SEMANA.map((d) => `${d.dia} ${d.nombre} ${d.corto}`)).toEqual([
      "1 Lunes Lun",
      "2 Martes Mar",
      "3 Miércoles Mié",
      "4 Jueves Jue",
      "5 Viernes Vie",
      "6 Sábado Sáb",
    ]);
  });

  it("el nombre y «Viene los …», con el plural de cada uno (el sábado, «sábados»)", () => {
    expect(nombreDia(2)).toBe("Martes");
    expect(nombreDia(6)).toBe("Sábado");
    expect(vieneLos(1)).toBe("Viene los lunes");
    expect(vieneLos(3)).toBe("Viene los miércoles");
    expect(vieneLos(6)).toBe("Viene los sábados");
    expect(pluralDia(5)).toBe("viernes");
  });

  it("sin día (null, un backend anterior que no lo manda) o fuera de 1..6: nada", () => {
    for (const x of [null, undefined, 0, 7, 2.5, -1, Number.NaN]) {
      expect(nombreDia(x)).toBeNull();
      expect(vieneLos(x)).toBeNull();
      expect(esDiaSemana(x)).toBe(false);
    }
    expect(esDiaSemana("2")).toBe(false);
    expect(esDiaSemana(4)).toBe(true);
  });
});
