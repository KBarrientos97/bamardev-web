import { describe, expect, it } from "vitest";
import { filasDe, tarifaDeFilas } from "./tarifaEditor";
import { TARIFA_POR_DEFECTO } from "./tarifa";

/** Las reglas del PUT de la tarifa (CONTRATO-PEDIDOS-WEB §5), antes de mandarlo. */
describe("la tarifa que edita el dueño", () => {
  it("ida y vuelta: la tarifa por defecto se escribe en filas y vuelve igual", () => {
    expect(tarifaDeFilas(filasDe(TARIFA_POR_DEFECTO), "12")).toEqual({ tarifa: TARIFA_POR_DEFECTO });
  });

  it("acepta coma decimal", () => {
    const r = tarifaDeFilas([{ hasta: "1,5", valor: "6,5" }, { hasta: "", valor: "2,5" }], "8");
    expect(r).toEqual({ tarifa: { tramos: [{ hastaKm: 1.5, base: 6.5 }, { hastaKm: null, porKm: 2.5 }], maxKm: 8 } });
  });

  it("un solo tramo es un precio fijo para toda la zona (PW-18)", () => {
    expect(tarifaDeFilas([{ hasta: "", valor: "8" }], "12")).toEqual({ tarifa: { tramos: [{ hastaKm: null, base: 8 }], maxKm: 12 } });
    // Y lo que el backend guarda vuelve a la pantalla como una fila.
    expect(filasDe({ tramos: [{ hastaKm: null, base: 8 }], maxKm: 12 })).toEqual([{ hasta: "", valor: "8" }]);
  });

  it.each([
    [[], "12", /al menos un tramo/],
    [[{ hasta: "5", valor: "7" }, { hasta: "5", valor: "2" }, { hasta: "", valor: "1" }], "12", /creciendo/],
    [[{ hasta: "5", valor: "7" }, { hasta: "3", valor: "2" }, { hasta: "", valor: "1" }], "12", /creciendo/],
    [[{ hasta: "2", valor: "" }, { hasta: "", valor: "1" }], "12", /precio del tramo 1/],
    [[{ hasta: "2", valor: "7" }, { hasta: "", valor: "-1" }], "12", /precio del tramo 2/],
    [[{ hasta: "", valor: "7" }, { hasta: "", valor: "1" }], "12", /hasta qué km/],
    [[{ hasta: "2", valor: "7" }, { hasta: "", valor: "1" }], "0,5", /entre 1 y 50/],
    [[{ hasta: "2", valor: "7" }, { hasta: "", valor: "1" }], "51", /entre 1 y 50/],
  ])("rechaza lo que el backend rechazaría", (filas, max, mensaje) => {
    const r = tarifaDeFilas(filas, max);
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).toMatch(mensaje);
  });
});
