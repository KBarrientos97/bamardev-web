import { describe, expect, it } from "vitest";
import type { ArqueoCajaApi, MovimientoSupervisionApi } from "../api";
import { cuentaDelEfectivo, montoDeRenglon, renglonDiferencia, subtituloCaja, textoVendido } from "./DetalleCaja.datos";

/**
 * La cuenta del efectivo de una caja (26-oct), con los números del arqueo de la
 * cajera. La captura de Miguel: abrió con 50, cobró 556 en efectivo (y 120 por
 * QR, que no entran al cajón), contó 616. Debía haber 606: sobran 10.
 */

const AHORA = new Date(2026, 9, 25, 3, 0).getTime();

const arqueo = (p: Partial<ArqueoCajaApi> = {}): ArqueoCajaApi => ({
  inicial: 50,
  efectivoVentas: 556,
  adelantosBillar: 0,
  abonosEfectivo: 0,
  ingresos: 0,
  egresos: 0,
  enPoderDeMeseros: 0,
  esperado: 606,
  esperadoAlCerrar: 606,
  contado: 616,
  diferencia: 10,
  ...p,
});

const mov = (p: Partial<MovimientoSupervisionApi>): MovimientoSupervisionApi => ({
  id: 1,
  tipo: "EGRESO",
  monto: 20,
  texto: "Cena",
  cena: true,
  codigo: "CENA",
  quien: "Kevin Dueño",
  hora: new Date(2026, 9, 24, 22, 10).getTime(),
  ...p,
});

const suma = (r: { monto: number }[]) => Math.round(r.reduce((t, x) => t + x.monto, 0) * 100) / 100;

describe("la cuenta del efectivo de una caja", () => {
  it("la de Miguel: cambio inicial más lo cobrado en efectivo da lo que debía haber", () => {
    const c = cuentaDelEfectivo(arqueo(), [], { cerrada: true, ahora: AHORA });
    expect(c.renglones.map((r) => r.etiqueta)).toEqual(["Cambio inicial", "Cobrado en efectivo"]);
    // El renglón del efectivo explica por qué el QR no está.
    expect(c.renglones[1].pie).toMatch(/QR va a tu cuenta/);
    expect(c.total).toBe(606);
    expect(suma(c.renglones)).toBe(606);
    expect(c.hoyDaria).toBeNull();
  });

  it("cada movimiento con quién lo registró; el anulado va tachado y no suma", () => {
    const movimientos = [
      mov({ id: 1 }),
      mov({ id: 2, tipo: "EGRESO", monto: 300, texto: "Retiro", cena: false, codigo: "RETIRO", anulada: true, anuladoPor: "Ana" }),
      // La anulación del retiro: es la otra mitad del anulado, no un renglón más.
      mov({ id: 3, tipo: "INGRESO", monto: 300, texto: "Retiro anulado · #2", cena: false, codigo: "RETIRO", anulaA: 2 }),
      mov({ id: 4, tipo: "INGRESO", monto: 100, texto: "Sencillo", cena: false, codigo: "SENCILLO" }),
    ];
    const a = arqueo({ ingresos: 400, egresos: 320, esperado: 686, esperadoAlCerrar: 686, diferencia: -70 });
    const c = cuentaDelEfectivo(a, movimientos, { cerrada: true, ahora: AHORA });
    expect(c.renglones.map((r) => r.clave)).toEqual(["inicial", "efectivo", "mov-1", "mov-2", "mov-4"]);
    const [, , cena, retiro, sencillo] = c.renglones;
    expect(cena).toMatchObject({ etiqueta: "Cena", monto: -20 });
    expect(cena.pie).toMatch(/^Registró Kevin Dueño · /);
    expect(retiro).toMatchObject({ monto: 0, anulado: { monto: -300 } });
    expect(retiro.pie).toMatch(/lo anuló Ana, no cuenta/);
    expect(sencillo.monto).toBe(100);
    // Y la cuenta llega al esperado, sin un renglón de "otros".
    expect(suma(c.renglones)).toBe(686);
    expect(c.total).toBe(686);
  });

  it("los adelantos de mesas suman o restan con su explicación", () => {
    const suman = cuentaDelEfectivo(arqueo({ adelantosBillar: 40, esperado: 646, esperadoAlCerrar: null }), [], { cerrada: false, ahora: AHORA });
    expect(suman.renglones[2]).toMatchObject({ etiqueta: "Adelantos de mesas", monto: 40 });
    expect(suman.renglones[2].pie).toMatch(/ya están en el cajón/);
    const restan = cuentaDelEfectivo(arqueo({ adelantosBillar: -30, esperado: 576, esperadoAlCerrar: 576 }), [], { cerrada: true, ahora: AHORA });
    expect(restan.renglones[2]).toMatchObject({ etiqueta: "Adelantos que cobró otra caja", monto: -30 });
    expect(suma(restan.renglones)).toBe(576);
  });

  it("con adelantos para los dos lados, un renglón para cada uno con su monto", () => {
    // Dos cajas abiertas: acá entraron Bs 10 de una mesa que sigue en juego, y
    // una venta de acá cuenta Bs 30 que cobró la otra caja. El neto es −20; con
    // un solo renglón se leía "cobró otra caja − Bs 20".
    const c = cuentaDelEfectivo(
      arqueo({ adelantosBillar: -20, adelantosAca: 10, adelantosDeOtraCaja: 30, esperado: 586, esperadoAlCerrar: null }),
      [],
      { cerrada: false, ahora: AHORA },
    );
    expect(c.renglones.slice(2).map((r) => [r.etiqueta, r.monto])).toEqual([
      ["Adelantos de mesas", 10],
      ["Adelantos que cobró otra caja", -30],
    ]);
    expect(suma(c.renglones)).toBe(586);
    // Con uno solo de los lados, el renglón de siempre.
    const unLado = cuentaDelEfectivo(arqueo({ adelantosBillar: 40, adelantosAca: 40, adelantosDeOtraCaja: 0, esperado: 646, esperadoAlCerrar: null }), [], {
      cerrada: false,
      ahora: AHORA,
    });
    expect(unLado.renglones.slice(2).map((r) => [r.etiqueta, r.monto])).toEqual([["Adelantos de mesas", 40]]);
  });

  it("los cobros de fiado y lo que tienen los meseros, sólo si los hay", () => {
    const c = cuentaDelEfectivo(arqueo({ abonosEfectivo: 25, enPoderDeMeseros: 15, esperado: 616, esperadoAlCerrar: 616 }), [], {
      cerrada: true,
      ahora: AHORA,
    });
    expect(c.renglones.map((r) => r.clave)).toEqual(["inicial", "efectivo", "abonos", "meseros"]);
    expect(c.renglones[3].monto).toBe(-15);
    expect(suma(c.renglones)).toBe(616);
  });

  it("si algo no entra en ningún renglón, va en uno propio: la cuenta siempre suma", () => {
    // Un movimiento que no vino en la lista (no debería pasar): no se esconde.
    const c = cuentaDelEfectivo(arqueo({ ingresos: 10, esperado: 616, esperadoAlCerrar: 616 }), [], { cerrada: true, ahora: AHORA });
    expect(c.renglones.at(-1)).toMatchObject({ clave: "otros", monto: 10 });
    expect(suma(c.renglones)).toBe(616);
  });

  it("una venta anulada después del cierre: la cuenta llega al esperado del cierre y dice cuánto daría hoy", () => {
    // Al cerrar debía haber 606; después se anuló V-000011 (50 en efectivo) y hoy el arqueo da 556.
    const a = arqueo({ efectivoVentas: 506, esperado: 556, esperadoAlCerrar: 606 });
    const anuladas = [{ id: 11, codigo: "V-000011", total: 50, hora: AHORA, quien: "Kevin", despuesDelCierre: true }];
    const c = cuentaDelEfectivo(a, [], { cerrada: true, anuladas, ahora: AHORA });
    expect(c.renglones.at(-1)).toMatchObject({ clave: "cierre", etiqueta: "Venta anulada después del cierre", monto: 50 });
    expect(c.renglones.at(-1)!.pie).toMatch(/^V-000011: al cerrar todavía contaba/);
    expect(c.total).toBe(606);
    expect(c.hoyDaria).toBe(556);
    expect(suma(c.renglones)).toBe(606);
  });

  it("con la caja abierta el total es lo de ahora, sin esperado del cierre", () => {
    const c = cuentaDelEfectivo(arqueo({ esperadoAlCerrar: null, contado: null, diferencia: null }), [], { cerrada: false, ahora: AHORA });
    expect(c.total).toBe(606);
    expect(c.hoyDaria).toBeNull();
  });
});

describe("cómo se lee cada renglón", () => {
  it("con su signo, menos el primero", () => {
    expect(montoDeRenglon({ monto: 50, inicial: true })).toMatch(/^Bs\s50,00$/);
    expect(montoDeRenglon({ monto: 556 })).toMatch(/^\+ Bs\s556,00$/);
    expect(montoDeRenglon({ monto: -20 })).toMatch(/^− Bs\s20,00$/);
  });

  it("sobran, faltan o cuadra", () => {
    // Sobrar no es faltar: azul, como en Reportes → Cierres (antes las dos en rojo).
    expect(renglonDiferencia(10)).toMatchObject({ etiqueta: "Sobran", tono: "sobra" });
    expect(renglonDiferencia(10).valor).toMatch(/^Bs\s10,00$/);
    expect(renglonDiferencia(-2)).toMatchObject({ etiqueta: "Faltan", tono: "falta" });
    expect(renglonDiferencia(0.001)).toMatchObject({ etiqueta: "Cuadra", tono: "cuadra" });
  });

  it("lo vendido, con las pagadas parte y parte", () => {
    const cobrado = { efectivo: { monto: 556, cobros: 12 }, qr: { monto: 120, cobros: 3 }, otros: [], mixtas: 1 };
    expect(textoVendido({ vendido: 676, ventas: 14 }, cobrado)).toMatch(
      /^Vendió Bs\s676,00 en 14 ventas · 1 pagada parte en efectivo y parte por QR$/,
    );
    expect(textoVendido({ vendido: 676, ventas: 14 }, { ...cobrado, mixtas: 0 })).toMatch(/^Vendió Bs\s676,00 en 14 ventas$/);
    expect(textoVendido({ vendido: 10, ventas: 1 })).toMatch(/en 1 venta$/);
  });

  it("el subtítulo: de cuándo a cuándo y cuánto duró", () => {
    const desde = new Date(2026, 9, 24, 16, 58).getTime();
    const hasta = new Date(2026, 9, 25, 2, 33).getTime();
    expect(subtituloCaja({ abierta: false, desde, hasta }, AHORA)).toBe("Cerrada · ayer 16:58 → 02:33 (9 h 35 min)");
    expect(subtituloCaja({ abierta: true, desde, hasta: null }, AHORA)).toMatch(/^Abierta · desde ayer 16:58 \(lleva 10 h 2 min\)$/);
  });
});
