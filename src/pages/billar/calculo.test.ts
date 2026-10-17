import { describe, expect, it } from "vitest";
import {
  cobroTiempo,
  cuentaDe,
  devolucionDe,
  estadoVisual,
  etiquetaPagoFijo,
  fmtCobrado,
  fmtCrono,
  fmtHace,
  imputarPagos,
  precioFijo,
  precioHoras,
  promoPara,
  segundosDesdeQueSeAbrio,
  segundosJugados,
  sePuedeAnular,
  textoDevolucion,
} from "./calculo";
import type { Mesa, Sesion, TipoMesa } from "./tipos";

// Los tipos del seed del prototipo (BILLAR_MODULO_SPEC §10).
const POOL: TipoMesa = {
  id: "pool",
  nombre: "Pool",
  tarifa: 20,
  fraccion: 15,
  tolerancia: 3,
  minimo: 30,
  paquetes: [
    { h: 1, precio: 20 },
    { h: 2, precio: 40 },
    { h: 3, precio: 55 },
  ],
  promos: [{ id: "p3", nombre: "Promo 3 h o más", desde: 3, pct: 10, activa: true, fijo: false }],
};

const CARAMBOLA: TipoMesa = {
  ...POOL,
  id: "carambola",
  nombre: "Carambola",
  tarifa: 25,
  paquetes: [
    { h: 1, precio: 25 },
    { h: 2, precio: 50 },
    { h: 3, precio: 70 },
  ],
  promos: [],
};

const hms = (h: number, m: number, s = 0) => h * 3600 + m * 60 + s;
const AHORA = Date.UTC(2026, 9, 8, 1, 40); // 08/10 21:40 en Bolivia

function sesion(parcial: Partial<Sesion> & { jugados: number }): Sesion {
  const { jugados, ...resto } = parcial;
  return {
    id: "s",
    start: AHORA - jugados * 1000,
    pausedAt: null,
    pausedTotal: 0,
    prepago: null,
    prev: null,
    consumos: [],
    pagos: [],
    ...resto,
  };
}

describe("cobroTiempo (§5.2)", () => {
  it("cobra por fracción con tolerancia y mínimo, como el ejemplo de la spec", () => {
    expect(cobroTiempo(hms(0, 20), POOL)).toMatchObject({ min: 30, bs: 10 });
    expect(cobroTiempo(hms(0, 47), POOL)).toMatchObject({ min: 45, bs: 15 });
    expect(cobroTiempo(hms(0, 49), POOL)).toMatchObject({ min: 60, bs: 20 });
  });

  it("dentro de la tolerancia no sube; pasado un segundo, sí", () => {
    expect(cobroTiempo(hms(0, 48), POOL).min).toBe(45);
    expect(cobroTiempo(hms(0, 48, 1), POOL).min).toBe(60);
  });

  it("dice cuándo sube y a cuánto (la tarjeta: 'sube a la 0:48')", () => {
    const c = cobroTiempo(hms(0, 47, 9), POOL);
    expect(c.nextSecs).toBe(hms(0, 48));
    expect(c.nextBs).toBe(20);
  });

  it("al arrancar cobra el mínimo y avisa que sube pasada la media hora", () => {
    const c = cobroTiempo(0, POOL);
    expect(c).toMatchObject({ min: 30, bs: 10, nextSecs: hms(0, 33) });
  });

  it("sin mínimo (el excedente del tiempo fijo) arranca en cero", () => {
    expect(cobroTiempo(0, POOL, false)).toMatchObject({ min: 0, bs: 0 });
    expect(cobroTiempo(hms(0, 3, 1), POOL, false)).toMatchObject({ min: 15, bs: 5 });
  });
});

describe("precioHoras (§5.3)", () => {
  it("usa los paquetes tal cual para 1, 2 y 3 h", () => {
    expect(precioHoras(POOL, 1).precio).toBe(20);
    expect(precioHoras(POOL, 2).precio).toBe(40);
    expect(precioHoras(POOL, 3).precio).toBe(55);
  });

  it("combina paquetes para la más barata: 5 h = 3 h + 2 h = Bs 95", () => {
    expect(precioHoras(POOL, 5)).toEqual({ precio: 95, partes: ["3 h", "2 h"] });
  });

  it("4 h = 3 h + 1 h = Bs 75 (la captura del modal)", () => {
    expect(precioHoras(POOL, 4)).toEqual({ precio: 75, partes: ["3 h", "1 h"] });
  });

  it("sin un paquete de 1 h completa con horas sueltas a la tarifa", () => {
    const sinUno = { ...POOL, paquetes: [{ h: 3, precio: 55 }] };
    expect(precioHoras(sinUno, 4)).toEqual({ precio: 75, partes: ["3 h", "1 h suelta"] });
  });

  it("24 h no se cuelga y repite el paquete de 3 h", () => {
    expect(precioHoras(POOL, 24).precio).toBe(8 * 55);
  });
});

describe("promoPara (§5.5)", () => {
  it("aplica desde las horas pedidas", () => {
    expect(promoPara(POOL, 2.75)).toBeNull();
    expect(promoPara(POOL, 3)?.pct).toBe(10);
  });

  it("en tiempo fijo sólo si la promo lo dice", () => {
    expect(promoPara(POOL, 5, true)).toBeNull();
    const conFijo = { ...POOL, promos: [{ ...POOL.promos[0], fijo: true }] };
    expect(precioFijo(conFijo, 5)).toMatchObject({ bruto: 95, precio: 85.5, descuento: 9.5 });
  });

  it("de las que alcanzan, la de mayor %; una pausada no cuenta", () => {
    const t = {
      ...POOL,
      promos: [
        { id: "a", nombre: "A", desde: 2, pct: 5, activa: true, fijo: false },
        { id: "b", nombre: "B", desde: 3, pct: 15, activa: true, fijo: false },
        { id: "c", nombre: "C", desde: 1, pct: 50, activa: false, fijo: false },
      ],
    };
    expect(promoPara(t, 3)?.id).toBe("b");
    expect(promoPara(t, 2)?.id).toBe("a");
  });
});

describe("cuentaDe (§5.4, §5.6)", () => {
  it("Mesa 3 del seed: 1:37 jugados, Bs 67 de consumo y Bs 50 de adelanto", () => {
    const s = sesion({
      jugados: hms(1, 37, 9),
      consumos: [{ id: "c", productoId: 1, nombre: "Paceña", precio: 67, cant: 1, hora: AHORA }],
      pagos: [{ id: "p", hora: AHORA, metodo: "QR", monto: 50 }],
    });
    expect(cuentaDe(s, POOL, AHORA)).toMatchObject({
      cobradoMin: 105,
      tiempoBs: 35,
      consumosBs: 67,
      total: 102,
      pagado: 50,
      saldo: 52,
    });
  });

  it("un consumo anulado no suma", () => {
    const s = sesion({
      jugados: hms(0, 10),
      consumos: [
        { id: "a", productoId: 1, nombre: "Paceña", precio: 15, cant: 2, hora: AHORA },
        { id: "b", productoId: 2, nombre: "Maní", precio: 5, cant: 1, hora: AHORA, anulado: true },
      ],
    });
    expect(cuentaDe(s, POOL, AHORA).consumosBs).toBe(30);
  });

  it("tiempo libre con promo: a las 3 h el tiempo sale 10 % menos", () => {
    const c = cuentaDe(sesion({ jugados: hms(3, 0) }), POOL, AHORA);
    expect(c.promo).toEqual({ nombre: "Promo 3 h o más", pct: 10, descuento: 6 });
    expect(c.tiempoBs).toBe(54);
  });

  it("'sube a' ya mira la promo del bloque siguiente", () => {
    // 2:47 → se cobra 2:45 (Bs 55); el próximo bloque llega a 3 h y entra la promo.
    const c = cuentaDe(sesion({ jugados: hms(2, 47) }), POOL, AHORA);
    expect(c.tiempoBs).toBe(55);
    expect(c.nextSecs).toBe(hms(2, 48));
    expect(c.nextBs).toBe(54);
  });

  it("la promo nunca descuenta los consumos", () => {
    const s = sesion({
      jugados: hms(3, 0),
      consumos: [{ id: "a", productoId: 1, nombre: "Paceña", precio: 15, cant: 2, hora: AHORA }],
    });
    expect(cuentaDe(s, POOL, AHORA).total).toBe(54 + 30);
  });

  it("tiempo fijo: lo contratado más el excedente por fracción, sin mínimo", () => {
    const fijo = { min: 120, precio: 40, pagado: true };
    expect(cuentaDe(sesion({ jugados: hms(2, 0, 12), prepago: fijo }), POOL, AHORA)).toMatchObject({
      restante: -12,
      tiempoBs: 40,
      excedenteBs: 0,
    });
    expect(cuentaDe(sesion({ jugados: hms(2, 3, 1), prepago: fijo }), POOL, AHORA)).toMatchObject({
      tiempoBs: 45,
      excedenteMin: 15,
    });
  });

  it("la pausa congela el cronómetro", () => {
    const s = sesion({ jugados: hms(0, 50), pausedAt: AHORA - hms(0, 11, 50) * 1000 });
    expect(segundosJugados(s, AHORA)).toBe(hms(0, 38, 10));
    expect(segundosJugados(s, AHORA + 60_000)).toBe(hms(0, 38, 10));
  });

  it("lo traído de otra mesa se cobra a la tarifa de allá y sin volver a cobrar el mínimo", () => {
    const s = sesion({ jugados: hms(0, 10), prev: { secs: hms(1, 0), min: 60, bs: 20 } });
    const c = cuentaDe(s, CARAMBOLA, AHORA);
    expect(c.secs).toBe(hms(1, 10));
    // 10 min en Carambola: un bloque de 15 → Bs 6,25.
    expect(c.tiempoBs).toBe(26.25);
  });
});

describe("estadoVisual (§5.7)", () => {
  const abierta = (s: Sesion): Mesa => ({ id: 5, idInterno: 50, tipo: "pool", estado: "abierta", sesion: s });
  const fijo = { min: 120, precio: 40, pagado: true };

  it("lo guardado pasa tal cual", () => {
    expect(estadoVisual({ id: 1, idInterno: 10, tipo: "pool", estado: "libre" }, AHORA, [10, 5, 1])).toBe("libre");
    expect(estadoVisual({ id: 8, idInterno: 80, tipo: "pool", estado: "fuera" }, AHORA, [10, 5, 1])).toBe("fuera");
  });

  it("tiempo fijo: por vencer dentro del aviso más grande, cumplido en cero", () => {
    expect(estadoVisual(abierta(sesion({ jugados: hms(1, 49), prepago: fijo })), AHORA, [10, 5, 1])).toBe("juego");
    expect(estadoVisual(abierta(sesion({ jugados: hms(1, 53, 45), prepago: fijo })), AHORA, [10, 5, 1])).toBe("vence");
    expect(estadoVisual(abierta(sesion({ jugados: hms(2, 0), prepago: fijo })), AHORA, [10, 5, 1])).toBe("cumplido");
  });

  it("pausada gana a por vencer", () => {
    const s = sesion({ jugados: hms(1, 55), prepago: fijo, pausedAt: AHORA });
    expect(estadoVisual(abierta(s), AHORA, [10, 5, 1])).toBe("pausada");
  });
});

describe("etiquetaPagoFijo (§5.8)", () => {
  const fijo = { min: 120, precio: 40, pagado: false };
  it("pagado, parte por cobrar o al final", () => {
    expect(etiquetaPagoFijo(sesion({ jugados: 0, prepago: fijo }))).toBe("cobrar al final");
    expect(
      etiquetaPagoFijo(sesion({ jugados: 0, prepago: fijo, pagos: [{ id: "p", hora: 0, metodo: "QR", monto: 20 }] })),
    ).toBe("parte por cobrar");
    expect(
      etiquetaPagoFijo(sesion({ jugados: 0, prepago: fijo, pagos: [{ id: "p", hora: 0, metodo: "QR", monto: 40 }] })),
    ).toBe("pagado");
  });
});

describe("formatos (§5.9)", () => {
  it("cronómetro, cobrado y 'libre hace'", () => {
    expect(fmtCrono(hms(1, 35, 12))).toBe("1:35:12");
    expect(fmtCrono(-5)).toBe("0:00:00");
    expect(fmtCobrado(90)).toBe("1:30");
    expect(fmtHace(27 * 60_000)).toBe("27 min");
    expect(fmtHace(62 * 60_000)).toBe("1 h 2 min");
  });
});

describe("sePuedeAnular", () => {
  it("una mesa se anula sólo en los primeros 5 minutos de juego", () => {
    // QA del 12-oct: "Anular mesa (se abrió por error)" seguía a los 50 min,
    // cuando ya no es un error sino una mesa jugada.
    expect(sePuedeAnular(cuentaDe(sesion({ jugados: hms(0, 4, 59) }), POOL, AHORA))).toBe(true);
    expect(sePuedeAnular(cuentaDe(sesion({ jugados: hms(0, 5) }), POOL, AHORA))).toBe(false);
    expect(sePuedeAnular(null)).toBe(false);
  });

  it("sin nada que cobrar se puede anular aunque pasen los 5 minutos", () => {
    // Con mínimo 0 y tolerancia de más de 5 min, la mesa no se podía finalizar
    // ("no tiene nada para cobrar") ni anular, y la caja no cerraba.
    expect(sePuedeAnular({ secs: hms(0, 7), total: 0 })).toBe(true);
    expect(sePuedeAnular({ secs: hms(0, 7), total: 10 })).toBe(false);
  });

  it("lo traído de otra mesa cuenta como jugado", () => {
    const s = sesion({ jugados: hms(0, 1), prev: { secs: hms(0, 40), min: 45, bs: 15 } });
    expect(sePuedeAnular(cuentaDe(s, POOL, AHORA))).toBe(false);
  });

  it("los 5 minutos corren desde que se abrió, aunque la pausen o le corran el inicio", () => {
    // Revisión del 16-oct: pausada a los 2 minutos (o con el inicio corrido
    // hacia adelante), el reloj de juego no llegaba a 5 y una mesa jugada horas
    // se anulaba sin dejar venta.
    const c = { secs: hms(0, 2), total: 10 };
    expect(sePuedeAnular(c, hms(0, 4, 59))).toBe(true);
    expect(sePuedeAnular(c, hms(3, 0))).toBe(false);
    // Sin nada que cobrar sigue pudiéndose (si no, la caja no cierra).
    expect(sePuedeAnular({ secs: hms(0, 2), total: 0 }, hms(3, 0))).toBe(true);
  });

  it("sin la hora de apertura (backend viejo) cuenta desde el inicio", () => {
    expect(segundosDesdeQueSeAbrio({ start: AHORA - 90_000 }, AHORA)).toBe(90);
    expect(segundosDesdeQueSeAbrio({ start: AHORA - 90_000, abierta: AHORA - 600_000 }, AHORA)).toBe(600);
  });
});

// Los mismos casos que `bamardev-backend/src/billar/calculo.spec.ts`: la
// pantalla dice cuánto devolver con la misma cuenta con que la venta lo guarda.
describe("lo pagado de más", () => {
  it("lo que no es efectivo cubre primero y el sobrante se devuelve en efectivo", () => {
    // Prueba del 16-oct: Bs 40 en efectivo y Bs 30 por QR, y la cuenta bajó a
    // Bs 10. La pantalla pedía devolver Bs 60 sin decir en qué, el cajero los
    // sacaba del cajón y al cerrar faltaban Bs 30.
    const pagos = [
      { metodo: "Efectivo", monto: 40 },
      { metodo: "QR", monto: 30 },
    ];
    expect(imputarPagos(pagos, 10).map((x) => [x.pago.metodo, x.cubre, x.sobra])).toEqual([
      ["QR", 10, 20],
      ["Efectivo", 0, 40],
    ]);
    const d = devolucionDe(pagos, 10);
    expect(d).toEqual({ efectivo: 40, otros: [{ metodo: "QR", monto: 20 }] });
    expect(textoDevolucion(d)).toBe("Bs 40,00 en efectivo y Bs 20,00 por QR");
  });

  it("si el efectivo alcanza, el sobrante sale entero del cajón", () => {
    const d = devolucionDe(
      [
        { metodo: "Efectivo", monto: 40 },
        { metodo: "QR", monto: 35 },
      ],
      50,
    );
    expect(d).toEqual({ efectivo: 25, otros: [] });
    expect(textoDevolucion(d)).toBe("Bs 25,00 en efectivo");
  });

  it("sin sobrante no hay nada que devolver", () => {
    const pagos = [
      { metodo: "Efectivo", monto: 20 },
      { metodo: "QR", monto: 10 },
    ];
    expect(devolucionDe(pagos, 45)).toEqual({ efectivo: 0, otros: [] });
    expect(textoDevolucion(devolucionDe(pagos, 45))).toBe("");
    expect(imputarPagos(pagos, 45).map((x) => x.cubre)).toEqual([10, 20]);
  });

  it("una mesa anulada devuelve todo, cada parte por donde entró", () => {
    const pagos = [
      { metodo: "Efectivo", monto: 20 },
      { metodo: "QR", monto: 10 },
      { metodo: "QR", monto: 5 },
    ];
    expect(devolucionDe(pagos, 0)).toEqual({ efectivo: 20, otros: [{ metodo: "QR", monto: 15 }] });
  });

  it("reconoce el efectivo aunque el negocio lo haya llamado distinto", () => {
    expect(devolucionDe([{ metodo: "Efectivo Bs", monto: 30 }], 10)).toEqual({ efectivo: 20, otros: [] });
  });
});

// Los mismos casos que `bamardev-backend/src/billar/calculo.spec.ts`.
describe("la promo al cambiar de mesa", () => {
  // 3 h de Pool (Bs 60) con la "Promo 3 h o más" ya ganada: Bs 6 de descuento.
  const DE_POOL = {
    secs: hms(3, 0),
    min: 180,
    bs: 60,
    promo: { nombre: "Promo 3 h o más", pct: 10, descuento: 6 },
  };
  const conPromo = (t: TipoMesa, pct: number): TipoMesa => ({
    ...t,
    promos: [{ id: "c3", nombre: "Promo Carambola", desde: 3, pct, activa: true, fijo: false }],
  });
  const SIN_PROMOS: TipoMesa = { ...CARAMBOLA, promos: [] };

  it("lo jugado en la otra mesa conserva la promo que ya había ganado aunque la nueva no tenga", () => {
    // Antes: sin promociones en la mesa nueva, el descuento ganado en el Pool
    // desaparecía al pasarlos (Bs 72,50 en vez de Bs 66,50).
    const c = cuentaDe(sesion({ jugados: hms(0, 30), prev: DE_POOL }), SIN_PROMOS, AHORA);
    expect(c.promo).toEqual({ nombre: "Promo 3 h o más (mesa anterior)", pct: 10, descuento: 6 });
    expect(c.tiempoBs).toBe(66.5);
    expect(c.nextBs).toBe(72.75);
  });

  it("si la promo de la mesa nueva le da más a lo de allá, va la nueva sobre todo, como antes", () => {
    const c = cuentaDe(sesion({ jugados: hms(0, 30), prev: DE_POOL }), conPromo(CARAMBOLA, 20), AHORA);
    expect(c.promo).toEqual({ nombre: "Promo Carambola", pct: 20, descuento: 14.5 });
    expect(c.tiempoBs).toBe(58);
  });

  it("con promo en las dos, lo de allá conserva la suya y lo de acá lleva la de acá", () => {
    const prev = { ...DE_POOL, promo: { nombre: "Promo Pool", pct: 20, descuento: 12 } };
    const c = cuentaDe(sesion({ jugados: hms(0, 30), prev }), conPromo(CARAMBOLA, 10), AHORA);
    expect(c.promo).toEqual({ nombre: "Promo Carambola + mesa anterior", pct: 10, descuento: 13.25 });
    expect(c.tiempoBs).toBe(59.25);
  });

  it("sin promo ganada en la otra mesa da lo mismo que antes", () => {
    const sin = sesion({ jugados: hms(0, 30), prev: { ...DE_POOL, promo: null } });
    expect(cuentaDe(sin, SIN_PROMOS, AHORA).promo).toBeNull();
    expect(cuentaDe(sin, SIN_PROMOS, AHORA).tiempoBs).toBe(72.5);
    const viejo = sesion({ jugados: hms(0, 30), prev: { secs: hms(3, 0), min: 180, bs: 60 } });
    expect(cuentaDe(viejo, conPromo(CARAMBOLA, 10), AHORA).promo).toEqual({
      nombre: "Promo Carambola",
      pct: 10,
      descuento: 7.25,
    });
  });

  it("el nombre no se encadena si la cuenta pasa por una tercera mesa", () => {
    const prev = { ...DE_POOL, promo: { ...DE_POOL.promo, nombre: "Promo 3 h o más (mesa anterior)" } };
    expect(cuentaDe(sesion({ jugados: hms(0, 30), prev }), SIN_PROMOS, AHORA).promo?.nombre).toBe(
      "Promo 3 h o más (mesa anterior)",
    );
  });
});
