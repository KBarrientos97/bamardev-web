import { describe, expect, it } from "vitest";
import type { Tramo } from "../pagina/horario";
import { avisoSinPedidos } from "./aviso";
import type { InfoPedidos } from "./tipos";

/** Una info mínima: sólo importan `recibe`, `motivo` y si la caja está abierta. */
function info(abierta: boolean): InfoPedidos {
  return { recibe: true, motivo: null, sucursales: [{ abierta }] } as unknown as InfoPedidos;
}

/** Pollos Don Omar: de 12:00 a 2:00 todos los días, guardado sin cruzar la medianoche. */
const OMAR: Tramo[] = [1, 2, 3, 4, 5, 6, 7].flatMap((dia) => [
  { dia, desde: "00:00", hasta: "02:00" },
  { dia, desde: "12:00", hasta: "24:00" },
]);

/** Hora de Bolivia (UTC−4) del martes 24-nov-2026. */
const bolivia = (hhmm: string) => new Date(`2026-11-24T${hhmm}:00-04:00`);

describe("avisoSinPedidos", () => {
  it("con una caja abierta no avisa nada", () => {
    expect(avisoSinPedidos(info(true), { horarios: [OMAR], ahora: bolivia("10:00") })).toBeNull();
  });

  it("fuera de horario dice cuándo abre", () => {
    expect(avisoSinPedidos(info(false), { horarios: [OMAR], ahora: bolivia("10:00"), enLaCarta: true })).toBe(
      "Cerrado ahora · Abrimos hoy a las 12:00. Mirá la carta mientras tanto.",
    );
    expect(avisoSinPedidos(info(false), { horarios: [OMAR], ahora: bolivia("03:00") })).toBe("Cerrado ahora · Abrimos hoy a las 12:00.");
  });

  it("a la 1:00 se dice «a la»", () => {
    const tarde: Tramo[] = [{ dia: 3, desde: "01:00", hasta: "05:00" }];
    expect(avisoSinPedidos(info(false), { horarios: [tarde], ahora: bolivia("10:00") })).toBe("Cerrado ahora · Abrimos mañana a la 1:00.");
  });

  it("en horario sin caja abierta: en un ratito, también cerca del cierre", () => {
    expect(avisoSinPedidos(info(false), { horarios: [OMAR], ahora: bolivia("12:05"), enLaCarta: true })).toBe(
      "En un ratito empezamos a tomar pedidos. Mirá la carta mientras tanto.",
    );
    // A media hora de cerrar igual: el local puede abrir la caja y vender hasta el final.
    expect(avisoSinPedidos(info(false), { horarios: [OMAR], ahora: bolivia("01:30") })).toBe("En un ratito empezamos a tomar pedidos.");
  });

  it("sin horario cargado, el texto general", () => {
    expect(avisoSinPedidos(info(false), { horarios: [null] })).toBe("Por ahora no estamos tomando pedidos. Volvé en un rato.");
    expect(avisoSinPedidos(info(false))).toBe("Por ahora no estamos tomando pedidos. Volvé en un rato.");
  });

  it("si el negocio no recibe pedidos, el motivo de siempre", () => {
    const apagado = { recibe: false, motivo: "APAGADO", sucursales: [] } as unknown as InfoPedidos;
    expect(avisoSinPedidos(apagado, { horarios: [OMAR] })).toBe("Por ahora no estamos recibiendo pedidos por acá.");
  });
});
