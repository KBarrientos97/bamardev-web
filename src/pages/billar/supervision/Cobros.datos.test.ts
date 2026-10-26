import { describe, expect, it } from "vitest";
import type { CobroApi } from "../api";
import {
  agruparPorJornada,
  etiquetaDia,
  horaCorta,
  lugarDeCobro,
  parteDe,
  porElMedio,
  porLaForma,
  porMedio,
  qrConNombre,
  resumenVendido,
  sumaCobros,
  textoConcepto,
  textoPorMedio,
  tipoDeMedio,
  tituloDeLaForma,
  tituloDeMedio,
} from "./Cobros.datos";

/**
 * Los cobros del billar (26-oct): cómo se lee cada renglón de lo cobrado por QR
 * y en efectivo. Miguel, el administrador, los pone al lado del extracto de su
 * banco: hora, monto, de qué mesa y qué se vendió.
 */

const cobro = (p: Partial<CobroApi> = {}): CobroApi => ({
  id: "vp1",
  hora: new Date(2026, 9, 24, 21, 30).getTime(),
  medio: "QR",
  monto: 50,
  por: "Flavia Suarez",
  venta: {
    id: 10,
    codigo: "V-000010",
    total: 50,
    origen: "mesa",
    mesaId: 2,
    tiempoMin: 90,
    items: [
      { nombre: "Paceña", cant: 2 },
      { nombre: "Coca Cola", cant: 1 },
    ],
    medios: ["QR"],
  },
  ...p,
});

describe("cobros: qué medio es", () => {
  it("el efectivo como lo cuenta el backend, aunque se llame distinto", () => {
    expect(tipoDeMedio("Efectivo")).toBe("efectivo");
    expect(tipoDeMedio("EFECTIVO Bs")).toBe("efectivo");
    expect(tipoDeMedio("QR")).toBe("qr");
    expect(tipoDeMedio("Pago QR Simple")).toBe("qr");
    expect(tipoDeMedio("Fiado")).toBe("fiado");
    expect(tipoDeMedio("Tarjeta")).toBe("otro");
  });

  it("los títulos y las partes se dicen como se habla", () => {
    expect(tituloDeMedio("QR")).toBe("Cobrado por QR");
    expect(tituloDeMedio("Efectivo")).toBe("Cobrado en efectivo");
    expect(tituloDeMedio("Tarjeta")).toBe("Cobrado con Tarjeta");
    expect(porElMedio("QR")).toBe("por QR");
    expect(textoPorMedio("Efectivo")).toBe("En efectivo");
    expect(textoPorMedio("QR")).toBe("Por QR");
  });

  it("con dos QR (dos bancos), lo que va por el nombre exacto dice cuál es", () => {
    // Las dos filas de Métodos de pago abrían "Cobrado por QR" y no se sabía
    // en el extracto de qué banco buscar.
    expect(tituloDeLaForma("QR BNB")).toBe("Cobrado por QR BNB");
    expect(porLaForma(" QR BCP ")).toBe("por QR BCP");
    expect(tituloDeLaForma("QR")).toBe("Cobrado por QR");
    expect(tituloDeLaForma("EFECTIVO Bs")).toBe("Cobrado en efectivo");
    expect(tituloDeLaForma("Tarjeta")).toBe("Cobrado con Tarjeta");
    expect(qrConNombre("QR BNB")).toBe("QR BNB");
    expect(qrConNombre("qr")).toBeNull();
    expect(qrConNombre("Efectivo")).toBeNull();
    // Donde los QR se juntan (lo pagado de una venta), el genérico: "por QR
    // BNB" le pondría ese banco a la plata del otro.
    expect(porElMedio("QR BNB")).toBe("por QR");
    expect(textoPorMedio("QR BNB")).toBe("Por QR");
  });

  it("lo pagado por medio en una venta junta los renglones del mismo medio, en orden", () => {
    // Un adelanto por QR y el saldo en efectivo, más otro efectivo: dos medios.
    const partes = porMedio([
      { metodo: "QR", monto: 50 },
      { metodo: "Efectivo", monto: 40 },
      { metodo: "Efectivo", monto: 27.5 },
    ]);
    expect(partes).toEqual([
      { medio: "QR", monto: 50 },
      { medio: "Efectivo", monto: 67.5 },
    ]);
    expect(porMedio([{ metodo: "Efectivo", monto: 10 }])).toHaveLength(1);
  });
});

describe("cobros: cómo se lee un renglón", () => {
  it("lo vendido, corto: el tiempo, y cada producto con su cantidad (sin «1 ×»)", () => {
    expect(resumenVendido(cobro().venta!)).toBe("Tiempo 1 h 30 min · 2 × Paceña · Coca Cola");
    // Sin tiempo (una venta rápida o una cuenta), sólo los productos.
    expect(resumenVendido({ tiempoMin: 0, items: [{ nombre: "Agua", cant: 1 }] })).toBe("Agua");
    // Una mesa que sólo jugó.
    expect(resumenVendido({ tiempoMin: 45, items: [] })).toBe("Tiempo 45 min");
  });

  it("con muchos productos dice cuántos más hay: el detalle está al tocar", () => {
    const items = ["A", "B", "C", "D", "E"].map((nombre) => ({ nombre, cant: 1 }));
    expect(resumenVendido({ tiempoMin: 0, items })).toBe("A · B · C · y 2 más");
  });

  it("una cantidad por peso no lleva ceros de más", () => {
    expect(resumenVendido({ tiempoMin: 0, items: [{ nombre: "Maní", cant: 1.5 }] })).toBe("1,5 × Maní");
  });

  it("de dónde es: la mesa, la cuenta o la venta rápida", () => {
    expect(lugarDeCobro(cobro())).toBe("Mesa 2");
    expect(lugarDeCobro(cobro({ venta: { ...cobro().venta!, origen: "cuenta", mesaId: undefined, cuenta: "Juan" } }))).toBe("Cuenta «Juan»");
    expect(lugarDeCobro(cobro({ venta: { ...cobro().venta!, origen: "rapida", mesaId: undefined } }))).toBe("Venta rápida");
    // Un adelanto de una mesa que sigue abierta: todavía no hay venta, sí sesión.
    expect(lugarDeCobro({ venta: undefined, sesion: { id: 7, mesaId: 3 } })).toBe("Mesa 3");
    expect(lugarDeCobro({ venta: undefined, sesion: { id: 8, cuenta: "Barra" } })).toBe("Cuenta «Barra»");
    expect(lugarDeCobro({})).toBeNull();
  });

  it("el concepto de lo cobrado antes de cerrar", () => {
    expect(textoConcepto("ADELANTO")).toBe("Adelanto");
    expect(textoConcepto("PREPAGO")).toBe("Tiempo fijo");
    expect(textoConcepto("EXTENSION")).toBe("Extensión");
    expect(textoConcepto(undefined)).toBeNull();
  });

  it("un cobro de una venta pagada con dos medios dice de cuánto es parte", () => {
    // Sin decirlo, un QR de Bs 80 de una mesa de Bs 160 se leía como la mesa entera.
    const mixta = cobro({ monto: 80, venta: { ...cobro().venta!, total: 160, medios: ["Efectivo", "QR"] } });
    expect(parteDe(mixta)).toMatch(/^parte de Bs\s160,00$/);
    expect(parteDe(cobro())).toBeNull();
    expect(parteDe({ venta: undefined })).toBeNull();
  });

  it("la hora y el día, en el reloj del local", () => {
    expect(horaCorta(new Date(2026, 9, 25, 1, 5).getTime())).toBe("01:05");
    expect(etiquetaDia("2026-10-24")).toBe("Sáb 24/10");
    expect(etiquetaDia("2026-10-26")).toBe("Lun 26/10");
  });

  it("la suma de unos cobros, sin residuos", () => {
    expect(sumaCobros([{ monto: 0.1 }, { monto: 0.2 }])).toBe(0.3);
    expect(sumaCobros([])).toBe(0);
  });
});

describe("cobros: por día de la jornada", () => {
  const a = (id: string, d: Date, monto: number) => cobro({ id, hora: d.getTime(), monto });

  it("un QR de la 1:50 con corte a las 6:00 es de la noche anterior, como lo busca el administrador", () => {
    const cobros = [
      a("vp3", new Date(2026, 9, 25, 1, 50), 30), // domingo de madrugada: es la noche del sábado
      a("vp2", new Date(2026, 9, 24, 22, 10), 50),
      a("vp1", new Date(2026, 9, 23, 21, 0), 40),
    ];
    const dias = agruparPorJornada(cobros, 360);
    expect(dias.map((d) => d.dia)).toEqual(["2026-10-24", "2026-10-23"]);
    expect(dias[0].cobros.map((c) => c.id)).toEqual(["vp3", "vp2"]);
    expect(dias[0].total).toBe(80);
    expect(dias[1].total).toBe(40);
  });

  it("sin corte (otro rubro) es el día del calendario", () => {
    const dias = agruparPorJornada([a("vp3", new Date(2026, 9, 25, 1, 50), 30), a("vp2", new Date(2026, 9, 24, 22, 10), 50)]);
    expect(dias.map((d) => d.dia)).toEqual(["2026-10-25", "2026-10-24"]);
  });

  it("sin cobros no hay días", () => {
    expect(agruparPorJornada([], 360)).toEqual([]);
  });
});
