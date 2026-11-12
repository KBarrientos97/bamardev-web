import { describe, expect, it } from "vitest";
import type { Actividad, CajaSupervision } from "./api";
import {
  conteoDeBloques,
  cuando,
  duracion,
  estadoDeCaja,
  estadoDeEncargo,
  etiquetaDeTurno,
  filtrarActividad,
  grupoDeActividad,
  haceCuanto,
  iconoDeActividad,
  iniciales,
  llevaControlado,
  mediosDeVenta,
  opcionesDeTurno,
  ordenarActividad,
  rangoDeSemana,
  rangoDeTurno,
  resumenPorMedio,
  situacionDelTurno,
  textoDiferencia,
  tonoDeActividad,
  tonoDiferencia,
} from "./Supervision.datos";

const H = 3_600_000;
const caja = (extra: Partial<CajaSupervision> = {}): CajaSupervision => ({
  id: 1,
  abierta: true,
  cajero: "Rosa Quispe",
  cajeroId: 7,
  desde: 1_000,
  hasta: null,
  inicial: 100,
  ventas: 0,
  vendido: 0,
  anuladas: 0,
  anulado: 0,
  ...extra,
});
const renglon = (id: string, codigo: string, hora = 0): Actividad => ({ id, hora, quien: "Rosa Quispe", texto: id, codigo });

describe("Supervisión de la farmacia: el tiempo", () => {
  it("cuándo pasó: la hora si es de hoy, ayer con la hora, y el día de la semana con la fecha si es más viejo", () => {
    const ahora = new Date(2026, 10, 11, 15, 30).getTime();
    expect(cuando(new Date(2026, 10, 11, 14, 2).getTime(), ahora)).toBe("14:02");
    expect(cuando(new Date(2026, 10, 10, 22, 10).getTime(), ahora)).toBe("ayer 22:10");
    expect(cuando(new Date(2026, 10, 8, 9, 5).getTime(), ahora)).toBe("Dom 08/11 09:05");
  });

  it("cuánto lleva abierta una caja o cuánto duró", () => {
    expect(duracion(20_000)).toBe("menos de 1 min");
    expect(duracion(45 * 60_000)).toBe("45 min");
    expect(duracion(3 * H + 12 * 60_000)).toBe("3 h 12 min");
    expect(duracion(2 * H)).toBe("2 h");
  });

  it("hace cuánto llegó lo último: en segundos hasta el minuto, después como el resto de la app", () => {
    expect(haceCuanto(0)).toBe("recién");
    expect(haceCuanto(3_200)).toBe("hace 3 s");
    expect(haceCuanto(125_000)).toBe("hace 2 min");
    expect(haceCuanto(65 * 60_000)).toBe("hace 1 h 5 min");
  });

  it("el turno: desde cuándo si sigue abierta, de punta a punta si cerró", () => {
    const ahora = new Date(2026, 10, 11, 15, 30).getTime();
    expect(rangoDeTurno({ desde: new Date(2026, 10, 11, 8, 2).getTime(), hasta: null }, ahora)).toBe("desde 08:02");
    expect(rangoDeTurno({ desde: new Date(2026, 10, 10, 8, 2).getTime(), hasta: new Date(2026, 10, 10, 20, 10).getTime() }, ahora)).toBe(
      "ayer 08:02 – 20:10",
    );
  });

  it("la semana, de lunes a domingo", () => {
    expect(rangoDeSemana({ desde: new Date(2026, 10, 9, 13, 0).getTime() })).toBe("lun 09/11 al dom 15/11");
  });
});

describe("Supervisión de la farmacia: las cajas", () => {
  it("una caja abierta de otro día y con más de 12 horas es una caja olvidada", () => {
    const hoy9 = new Date(2026, 10, 11, 9, 0).getTime();
    expect(estadoDeCaja(caja({ abierta: false }), hoy9)).toBe("cerrada");
    expect(estadoDeCaja(caja({ desde: new Date(2026, 10, 11, 8, 0).getTime() }), hoy9)).toBe("abierta");
    expect(estadoDeCaja(caja({ desde: new Date(2026, 10, 10, 8, 0).getTime() }), hoy9)).toBe("vieja");
  });

  it("una farmacia de turno cruza la medianoche sin que la caja se dé por olvidada", () => {
    // A propósito: a las 00:30 la caja de las 22:00 es de "otro día" pero
    // lleva 2 h 30 min. Sólo con el día calendario se marcaba como olvidada
    // justo en la noche en que más se la mira.
    const madrugada = new Date(2026, 10, 11, 0, 30).getTime();
    expect(estadoDeCaja(caja({ desde: new Date(2026, 10, 10, 22, 0).getTime() }), madrugada)).toBe("abierta");
    // Y una de 13 horas que sigue en el mismo día tampoco: todavía es su jornada.
    const noche = new Date(2026, 10, 11, 23, 30).getTime();
    expect(estadoDeCaja(caja({ desde: new Date(2026, 10, 11, 10, 0).getTime() }), noche)).toBe("abierta");
  });

  it("el arqueo: cuadró, sobra en verde o falta en rojo", () => {
    expect(textoDiferencia(0)).toBe("cuadró");
    // Medio centavo de redondeo no es un faltante.
    expect(textoDiferencia(-0.004)).toBe("cuadró");
    expect(textoDiferencia(5)).toMatch(/^sobran Bs\s5,00$/);
    expect(textoDiferencia(-12.5)).toMatch(/^faltan Bs\s12,50$/);
    expect(tonoDiferencia(0)).toBe("cuadra");
    expect(tonoDiferencia(5)).toBe("sobra");
    expect(tonoDiferencia(-5)).toBe("falta");
  });

  it("las letras del avatar", () => {
    expect(iniciales("Rosa Quispe")).toBe("RQ");
    expect(iniciales("  marta  ")).toBe("M");
    expect(iniciales("")).toBe("?");
  });
});

describe("Supervisión de la farmacia: el turno", () => {
  const ahora = new Date(2026, 10, 11, 15, 0).getTime();
  const turno = (cajaId: number | null, defectoId: number | null) => ({
    cajaId,
    defectoId,
    desde: 0,
    hasta: null,
    ventas: 0,
    vendido: 0,
    anuladas: 0,
    anulado: 0,
    fiado: 0,
    descuentos: 0,
    controlados: 0,
    porMedio: { efectivo: { monto: 0, cobros: 0 }, qr: { monto: 0, cobros: 0 }, otros: [], mixtas: 0 },
    encargos: { anotados: 0, entregados: 0 },
  });
  const abierta = caja({ id: 1, desde: ahora - 3 * H });
  const cerrada = caja({ id: 2, abierta: false, desde: ahora - 30 * H, hasta: ahora - 18 * H });
  const olvidada = caja({ id: 3, desde: ahora - 30 * H });

  it("sin caja en la semana no hay turno: los números son de hoy", () => {
    expect(situacionDelTurno({ cajas: [], turno: turno(null, null) }, ahora)).toEqual({ situacion: "sinCaja" });
    // La caja que dice el servidor ya no está en la lista: tampoco.
    expect(situacionDelTurno({ cajas: [abierta], turno: turno(9, 9) }, ahora).situacion).toBe("sinCaja");
  });

  it("la caja que trabaja ahora es el turno en curso; cerrada, cómo terminó; de antes y abierta, olvidada", () => {
    expect(situacionDelTurno({ cajas: [abierta], turno: turno(1, 1) }, ahora)).toEqual({ situacion: "enCurso", caja: abierta });
    expect(situacionDelTurno({ cajas: [cerrada], turno: turno(2, 2) }, ahora)).toEqual({ situacion: "cerrado", caja: cerrada });
    expect(situacionDelTurno({ cajas: [olvidada], turno: turno(3, 3) }, ahora)).toEqual({ situacion: "olvidada", caja: olvidada });
  });

  it("una caja elegida a mano es un turno elegido, aunque esté abierta", () => {
    expect(situacionDelTurno({ cajas: [abierta, cerrada], turno: turno(2, 1) }, ahora)).toEqual({ situacion: "elegido", caja: cerrada });
    expect(situacionDelTurno({ cajas: [abierta, olvidada], turno: turno(3, 1) }, ahora).situacion).toBe("elegido");
  });

  it("el texto de cada turno dice quién, cuándo y qué es; la lista va de la más nueva a la más vieja", () => {
    const api = { cajas: [cerrada, olvidada, abierta], turno: turno(1, 1) };
    expect(etiquetaDeTurno(abierta, api, ahora)).toMatch(/^Turno en curso · Rosa Quispe · desde Miércoles 11\/11 12:00$/);
    expect(etiquetaDeTurno(cerrada, api, ahora)).toMatch(/^Rosa Quispe · Martes 10\/11 09:00 → 21:00$/);
    expect(etiquetaDeTurno(olvidada, api, ahora)).toMatch(/^Quedó abierta · Rosa Quispe · desde Martes 10\/11 09:00$/);
    // Cerrada y la que corresponde ahora: el último turno. Abierta pero no la que corresponde: otra caja abierta.
    expect(etiquetaDeTurno(cerrada, { turno: turno(2, 2) }, ahora)).toMatch(/^Último turno · /);
    expect(etiquetaDeTurno(abierta, { turno: turno(2, 2) }, ahora)).toMatch(/^Caja abierta · /);
    expect(opcionesDeTurno(api, ahora).map((o) => o.id)).toEqual([1, 2, 3]);
  });
});

describe("Supervisión de la farmacia: los números de arriba", () => {
  it("lo cobrado por medio: efectivo y QR siempre, los otros medios sólo si hubo", () => {
    const sinOtros = resumenPorMedio({ efectivo: { monto: 60.5, cobros: 2 }, qr: { monto: 0, cobros: 0 }, otros: [], mixtas: 0 });
    expect(sinOtros.medios.map((m) => [m.nombre, m.monto, m.cobros])).toEqual([
      ["Efectivo", 60.5, 2],
      ["QR", 0, 0],
    ]);
    const conTarjeta = resumenPorMedio({
      efectivo: { monto: 10, cobros: 1 },
      qr: { monto: 20, cobros: 1 },
      otros: [{ nombre: "Tarjeta", monto: 30, cobros: 1 }],
      mixtas: 1,
    });
    expect(conTarjeta.medios.map((m) => m.nombre)).toEqual(["Efectivo", "QR", "Tarjeta"]);
    expect(conTarjeta.mixtas).toBe(1);
  });

  it("cuántos renglones trae cada bloque", () => {
    expect(conteoDeBloques({ ventas: [{} as never, {} as never], controlados: [], encargos: [{} as never], efectivo: [], inventario: [] })).toEqual({
      ventas: 2,
      controlados: 0,
      encargos: 1,
      efectivo: 0,
      inventario: 0,
    });
  });
});

describe("Supervisión de la farmacia: las ventas", () => {
  it("una venta lleva controlado si alguno de sus renglones lo es", () => {
    expect(llevaControlado({ items: [{ controlado: false } as never, { controlado: true } as never] })).toBe(true);
    expect(llevaControlado({ items: [{ controlado: false } as never] })).toBe(false);
  });

  it("con qué se pagó, sin repetir el medio; lo fiado se dice", () => {
    expect(mediosDeVenta({ fiada: false, pagos: [{ medio: "Efectivo", monto: 10 }, { medio: "Efectivo", monto: 5 }] })).toBe("Efectivo");
    expect(mediosDeVenta({ fiada: false, pagos: [{ medio: "QR", monto: 10 }, { medio: "Efectivo", monto: 5 }] })).toBe("QR + Efectivo");
    expect(mediosDeVenta({ fiada: true, pagos: [] })).toBe("Fiado");
    expect(mediosDeVenta({ fiada: true, pagos: [{ medio: "Efectivo", monto: 5 }] })).toBe("Efectivo y el resto fiado");
  });

  it("un estado de encargo que no se reconoce se muestra tal cual, en gris", () => {
    expect(estadoDeEncargo("LLEGO")).toEqual({ texto: "Llegó", tono: "amarillo" });
    expect(estadoDeEncargo("RARO")).toEqual({ texto: "RARO", tono: "gris" });
  });
});

describe("Supervisión de la farmacia: la actividad", () => {
  it("cada código cae en su filtro; una venta fiada es una venta", () => {
    expect(grupoDeActividad("VENTA")).toBe("ventas");
    expect(grupoDeActividad("CREDITO")).toBe("ventas");
    expect(grupoDeActividad("ANULACION")).toBe("anulaciones");
    expect(grupoDeActividad("CONTROLADO")).toBe("controlados");
    expect(grupoDeActividad("ENCARGO")).toBe("encargos");
    expect(grupoDeActividad("CAJA_ABIERTA")).toBe("caja");
    expect(grupoDeActividad("CAJA_CERRADA")).toBe("caja");
    expect(grupoDeActividad("EFECTIVO")).toBe("efectivo");
    expect(grupoDeActividad("INVENTARIO_SALIDA")).toBe("inventario");
    expect(grupoDeActividad("INVENTARIO_TRANSFERENCIA")).toBe("inventario");
  });

  it("un código que no se reconoce queda en Todo y en ningún filtro: no desaparece de la lista", () => {
    const lista = [renglon("a", "VENTA"), renglon("b", "NUEVO_DEL_BACKEND"), renglon("c", "ANULACION")];
    expect(grupoDeActividad("NUEVO_DEL_BACKEND")).toBeNull();
    expect(filtrarActividad(lista, "todo")).toHaveLength(3);
    expect(filtrarActividad(lista, "ventas").map((a) => a.id)).toEqual(["a"]);
    expect(filtrarActividad(lista, "anulaciones").map((a) => a.id)).toEqual(["c"]);
    expect(filtrarActividad(lista, "inventario")).toEqual([]);
  });

  it("lo más nuevo primero, y a la misma hora en un orden fijo", () => {
    const lista = [renglon("venta-1", "VENTA", 10), renglon("caja-1-cierra", "CAJA_CERRADA", 30), renglon("efectivo-9", "EFECTIVO", 30), renglon("venta-2", "VENTA", 20)];
    expect(ordenarActividad(lista).map((a) => a.id)).toEqual(["caja-1-cierra", "efectivo-9", "venta-2", "venta-1"]);
    // No toca la lista que le dan.
    expect(lista[0].id).toBe("venta-1");
  });

  it("anulación en rojo, controlado y fiado en ámbar, venta en verde, inventario en azul, encargo en violeta", () => {
    expect(tonoDeActividad("ANULACION")).toBe("rosa");
    expect(tonoDeActividad("CONTROLADO")).toBe("ambar");
    expect(tonoDeActividad("CREDITO")).toBe("ambar");
    expect(tonoDeActividad("VENTA")).toBe("verde");
    expect(tonoDeActividad("INVENTARIO_AJUSTE")).toBe("azul");
    expect(tonoDeActividad("ENCARGO")).toBe("violeta");
    expect(tonoDeActividad("CAJA_ABIERTA")).toBe("normal");
    expect(tonoDeActividad("EFECTIVO")).toBe("normal");
  });

  it("cada código tiene su ícono y lo desconocido lleva el de información", () => {
    expect(iconoDeActividad("CAJA_ABIERTA")).toBe("lock");
    expect(iconoDeActividad("ANULACION")).toBe("x");
    expect(iconoDeActividad("INVENTARIO_TRANSFERENCIA")).toBe("truck");
    expect(iconoDeActividad("LO_QUE_SEA")).toBe("info");
  });
});
