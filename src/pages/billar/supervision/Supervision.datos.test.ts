import { describe, expect, it } from "vitest";
import type { ActividadApi, CajaSupervisionApi, SupervisionApi } from "../api";
import { cuentaDe } from "../calculo";
import { vistaCuenta, vistaDe } from "../vista";
import {
  armarSupervision,
  cuando,
  diaYHora,
  duracion,
  estadoDeCaja,
  filtrarActividad,
  grupoDeActividad,
  iniciales,
  opcionesDeTurno,
  rangoDeSemana,
  rangoDeTurno,
  rangoDeTurnoCompleto,
  reinicioDeSemana,
  resumenSupervision,
  situacionDelTurno,
  textoDiferencia,
  tonoDeActividad,
} from "./Supervision.datos";

const H = 3_600_000;
const caja = (extra: Partial<CajaSupervisionApi> = {}): CajaSupervisionApi => ({
  id: 1,
  abierta: true,
  cajero: "Pepe Mamani",
  desde: 1_000,
  hasta: null,
  inicial: 100,
  ventas: 0,
  vendido: 0,
  anuladas: 0,
  ...extra,
});

describe("Supervisión: cómo se lee cada cosa", () => {
  it("cuándo pasó: la hora si es de hoy, ayer con la hora, y el día de la semana con la fecha si es más viejo", () => {
    const ahora = new Date(2026, 9, 21, 15, 30).getTime();
    expect(cuando(new Date(2026, 9, 21, 14, 2).getTime(), ahora)).toBe("14:02");
    expect(cuando(new Date(2026, 9, 20, 22, 10).getTime(), ahora)).toBe("ayer 22:10");
    expect(cuando(new Date(2026, 9, 18, 9, 5).getTime(), ahora)).toBe("Dom 18/10 09:05");
    // Pasada la medianoche, lo de la tarde anterior es de ayer.
    const unaAM = new Date(2026, 9, 22, 1, 0).getTime();
    expect(cuando(new Date(2026, 9, 21, 23, 30).getTime(), unaAM)).toBe("ayer 23:30");
  });

  it("cuánto lleva abierta una caja o cuánto duró", () => {
    expect(duracion(20_000)).toBe("menos de 1 min");
    expect(duracion(45 * 60_000)).toBe("45 min");
    expect(duracion(3 * H + 12 * 60_000)).toBe("3 h 12 min");
    expect(duracion(2 * H)).toBe("2 h");
    expect(duracion(-5)).toBe("menos de 1 min");
  });

  it("una caja abierta de antes de la jornada se marca: es una caja olvidada", () => {
    expect(estadoDeCaja(caja({ desde: 5_000 }), 4_000)).toBe("abierta");
    expect(estadoDeCaja(caja({ desde: 3_000 }), 4_000)).toBe("vieja");
    expect(estadoDeCaja(caja({ abierta: false, desde: 3_000, hasta: 9_000 }), 4_000)).toBe("cerrada");
  });

  it("el arqueo: cuadra, sobra o falta", () => {
    expect(textoDiferencia(0)).toBe("cuadra");
    expect(textoDiferencia(0.001)).toBe("cuadra");
    expect(textoDiferencia(5)).toMatch(/^sobran Bs\s5,00$/);
    expect(textoDiferencia(-12.5)).toMatch(/^faltan Bs\s12,50$/);
  });

  it("las letras del avatar", () => {
    expect(iniciales("Pepe Mamani")).toBe("PM");
    expect(iniciales("  kevin  ")).toBe("K");
    expect(iniciales("")).toBe("?");
  });
});

describe("Supervisión: el turno", () => {
  // Hoy 22-oct 18:00; la jornada empezó a las 06:00. Anoche hubo un turno de 16:00 a 02:41.
  const ahora = new Date(2026, 9, 22, 18, 0).getTime();
  const jornada = new Date(2026, 9, 22, 6, 0).getTime();
  const hora = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
  const anoche = caja({ id: 1, cajero: "Pepe Mamani", abierta: false, desde: hora(21, 16), hasta: hora(22, 2, 41) });
  const hoy = caja({ id: 2, cajero: "Ana Rojas", desde: hora(22, 16, 2) });
  const turno = (cajaId: number | null, defectoId: number | null) => ({
    cajaId,
    defectoId,
    desde: 0,
    hasta: null,
    ventas: 0,
    vendido: 0,
  });

  it("por defecto es el de la caja que trabaja ahora", () => {
    const api = { cajas: [hoy, anoche], desde: jornada, turno: turno(2, 2) };
    expect(situacionDelTurno(api)).toEqual({ situacion: "enCurso", caja: hoy });
  });

  it("con todas cerradas, sigue mostrando cómo terminó la última hasta que abran otra", () => {
    const api = { cajas: [anoche], desde: jornada, turno: turno(1, 1) };
    expect(situacionDelTurno(api)).toEqual({ situacion: "cerrado", caja: anoche });
  });

  it("una caja que sigue abierta de antes de la jornada es una olvidada", () => {
    const olvidada = caja({ id: 3, desde: hora(21, 21, 9) });
    expect(situacionDelTurno({ cajas: [olvidada], desde: jornada, turno: turno(3, 3) })).toEqual({
      situacion: "olvidada",
      caja: olvidada,
    });
  });

  it("elegir otra caja es mirar un turno que no es el de ahora", () => {
    const api = { cajas: [hoy, anoche], desde: jornada, turno: turno(1, 2) };
    expect(situacionDelTurno(api)).toEqual({ situacion: "elegido", caja: anoche });
  });

  it("sin turno (nadie abrió caja, o un servidor anterior) se ve lo de hoy", () => {
    expect(situacionDelTurno({ cajas: [], desde: jornada, turno: turno(null, null) }).situacion).toBe("hoy");
    expect(situacionDelTurno({ cajas: [hoy], desde: jornada }).situacion).toBe("hoy");
    // Una caja que ya no está en la lista tampoco da turno.
    expect(situacionDelTurno({ cajas: [hoy], desde: jornada, turno: turno(99, 2) }).situacion).toBe("hoy");
  });

  it("cuándo fue el turno: desde la apertura, o de la apertura al cierre sin repetir el día", () => {
    expect(rangoDeTurno(hoy, ahora)).toBe("desde 16:02");
    expect(rangoDeTurno(anoche, ahora)).toBe("ayer 16:00 – 02:41");
    // Si abrió y cerró el mismo día, la hora de cierre va sola.
    expect(rangoDeTurno({ desde: hora(22, 9), hasta: hora(22, 15, 30) }, ahora)).toBe("09:00 – 15:30");
    // Una caja olvidada: desde cuándo.
    expect(rangoDeTurno({ desde: hora(21, 21, 9), hasta: null }, ahora)).toBe("desde ayer 21:09");
  });

  it("las opciones del selector: la más nueva primero, con el día de la semana, y cada una dice qué es", () => {
    const api = { cajas: [anoche, hoy], desde: jornada, turno: turno(2, 2) };
    expect(opcionesDeTurno(api)).toEqual([
      { id: 2, etiqueta: "Turno en curso · Ana Rojas · desde Jueves 22/10 16:02" },
      { id: 1, etiqueta: "Pepe Mamani · Miércoles 21/10 16:00 → Jueves 22/10 02:41" },
    ]);
    // Con todas cerradas, la última se marca; una abierta de antes, olvidada.
    expect(opcionesDeTurno({ cajas: [anoche], desde: jornada, turno: turno(1, 1) })[0].etiqueta).toBe(
      "Último turno · Pepe Mamani · Miércoles 21/10 16:00 → Jueves 22/10 02:41",
    );
    const olvidada = caja({ id: 3, cajero: "Luis", desde: hora(21, 21, 9) });
    expect(opcionesDeTurno({ cajas: [olvidada], desde: jornada, turno: turno(3, 3) })[0].etiqueta).toBe(
      "Quedó abierta · Luis · desde Miércoles 21/10 21:09",
    );
  });

  it("toda la semana en el selector, del lunes al domingo, con el día de cada hora", () => {
    // La semana del lunes 19 al domingo 25-oct, vista el lunes 26 de mañana: el turno del domingo cerró de madrugada.
    const semana = { desde: hora(19, 13), hasta: hora(26, 13) };
    const dom = caja({ id: 7, cajero: "pepe", abierta: false, desde: hora(25, 16), hasta: hora(26, 3, 30) });
    const mar = caja({ id: 2, cajero: "pepe", abierta: false, desde: hora(20, 16), hasta: hora(21, 3) });
    const lun = caja({ id: 1, cajero: "pepe", abierta: false, desde: hora(19, 16), hasta: hora(20, 2, 15) });
    const api = { cajas: [lun, dom, mar], desde: new Date(2026, 9, 26, 6, 0).getTime(), turno: turno(7, 7) };
    expect(opcionesDeTurno(api).map((o) => o.etiqueta)).toEqual([
      "Último turno · pepe · Domingo 25/10 16:00 → Lunes 26/10 03:30",
      "pepe · Martes 20/10 16:00 → Miércoles 21/10 03:00",
      "pepe · Lunes 19/10 16:00 → Martes 20/10 02:15",
    ]);
    expect(rangoDeSemana(semana)).toBe("lun 19/10 al dom 25/10");
    expect(reinicioDeSemana(semana)).toBe("lunes 26/10 a las 13:00");
  });

  it("el turno de punta a punta: con el día de cada hora, o sólo la hora de cierre si es el mismo día", () => {
    expect(diaYHora(hora(25, 16))).toBe("Domingo 25/10 16:00");
    expect(rangoDeTurnoCompleto({ desde: hora(25, 16), hasta: hora(26, 3, 30) })).toBe("Domingo 25/10 16:00 → Lunes 26/10 03:30");
    expect(rangoDeTurnoCompleto({ desde: hora(22, 9), hasta: hora(22, 15, 30) })).toBe("Jueves 22/10 09:00 → 15:30");
    expect(rangoDeTurnoCompleto({ desde: hora(22, 16, 2), hasta: null })).toBe("desde Jueves 22/10 16:02");
  });
});

describe("Supervisión: la actividad", () => {
  const a = (codigo: string, id = codigo): ActividadApi => ({ id, hora: 1, quien: "X", texto: "t", codigo });

  it("cada acción cae en un solo filtro: caja, ventas o mesas", () => {
    expect(grupoDeActividad("CAJA_ABIERTA")).toBe("caja");
    expect(grupoDeActividad("CAJA_CERRADA")).toBe("caja");
    expect(grupoDeActividad("VENTA")).toBe("ventas");
    expect(grupoDeActividad("VENTA_ANULADA")).toBe("ventas");
    expect(grupoDeActividad("CORREGIR_PAGO")).toBe("ventas");
    for (const c of ["ABRIR", "PAUSAR", "REANUDAR", "CONSUMO", "ANULAR_CONSUMO", "ABRIR_CUENTA", "PAGO", "ALGO_NUEVO"]) {
      expect(grupoDeActividad(c)).toBe("mesas");
    }
  });

  it("filtrar deja el orden y 'todo' no saca nada", () => {
    const lista = [a("CAJA_ABIERTA"), a("ABRIR"), a("VENTA"), a("CONSUMO")];
    expect(filtrarActividad(lista, "todo")).toHaveLength(4);
    expect(filtrarActividad(lista, "caja").map((x) => x.codigo)).toEqual(["CAJA_ABIERTA"]);
    expect(filtrarActividad(lista, "mesas").map((x) => x.codigo)).toEqual(["ABRIR", "CONSUMO"]);
    expect(filtrarActividad(lista, "ventas").map((x) => x.codigo)).toEqual(["VENTA"]);
  });

  it("lo que frena o resta llama la atención", () => {
    expect(tonoDeActividad("PAUSAR")).toBe("ambar");
    for (const c of ["ANULAR_CONSUMO", "ANULAR_MESA", "VENTA_ANULADA", "EDITAR_INICIO", "CORREGIR_PAGO"]) {
      expect(tonoDeActividad(c)).toBe("rosa");
    }
    expect(tonoDeActividad("VENTA")).toBe("verde");
    expect(tonoDeActividad("CAJA_CERRADA")).toBe("azul");
    expect(tonoDeActividad("ABRIR")).toBe("normal");
  });
});

describe("Supervisión: mesas, cuentas y los números de arriba", () => {
  const AHORA = Date.now();
  const POOL = { id: "pool", nombre: "Pool", tarifa: 20, fraccion: 15, tolerancia: 3, minimo: 30, paquetes: [], promos: [] };
  const sesion = (id: number, extra: object = {}) => ({
    id,
    version: 1,
    start: AHORA - 60 * 60_000,
    abierta: AHORA - 60 * 60_000,
    pausedAt: null,
    pausedTotal: 0,
    prepago: null,
    prev: null,
    tarifa: POOL,
    abiertaPor: "Pepe Mamani",
    consumos: [{ id: 5, productoId: 1, nombre: "Paceña", precio: 15, cant: 2, hora: AHORA - 30 * 60_000, anulado: false, por: "Pepe Mamani" }],
    pagos: [],
    ...extra,
  });
  const api = {
    ahora: AHORA,
    sucursal: { id: 1, nombre: "Principal" },
    desde: AHORA - 8 * H,
    ajustes: { avisos: [10, 5, 1], sonido: false, voz: false, pin: { anularConsumo: true, anularMesa: true, pausar: true }, tieneTokenSalon: false },
    tipos: [POOL],
    mesas: [
      { id: 11, numero: 1, tipo: "pool", estado: "abierta", sesion: sesion(101) },
      {
        id: 12,
        numero: 2,
        tipo: "pool",
        estado: "abierta",
        sesion: sesion(102, {
          pausedAt: AHORA - 5 * 60_000,
          pauseMotivo: "Se fue a comer",
          pausadaPor: { quien: "Kevin Dueño", autorizo: "Kevin Dueño", sinPin: true },
        }),
      },
      { id: 13, numero: 3, tipo: "pool", estado: "libre" },
    ],
    cuentas: [
      {
        id: 201,
        nombre: "Juan",
        sucursalId: 1,
        estado: "abierta",
        sesion: sesion(201, { tarifa: { ...POOL, id: "cuenta", tarifa: 0, minimo: 0 }, start: AHORA - 20 * 60_000 }),
      },
    ],
    // Lo vendido hoy no es la suma de las cajas: la 3 sigue abierta de ayer y trae sus ventas de entonces.
    hoy: { ventas: 4, vendido: 150 },
    cajas: [
      caja({ id: 1, desde: AHORA - 3 * H, ventas: 3, vendido: 120.5 }),
      caja({ id: 2, abierta: false, desde: AHORA - 5 * H, hasta: AHORA - 4 * H, ventas: 1, vendido: 29.5 }),
      caja({ id: 3, desde: AHORA - 30 * H, ventas: 9, vendido: 700 }),
    ],
    actividad: [],
  } as unknown as SupervisionApi;

  it("arma las mesas con quién abrió y las cuentas con su nombre", () => {
    const { mesas, cuentas } = armarSupervision(api);
    expect(mesas.map((m) => m.mesa.id)).toEqual([1, 2, 3]);
    expect(mesas[0]).toMatchObject({ sesionId: 101, quien: { abrio: "Pepe Mamani" } });
    expect(mesas[0].quien?.consumos.get("5")).toEqual({ por: "Pepe Mamani", anuladoPor: undefined });
    expect(mesas[1].quien?.pausadaPor).toEqual({ quien: "Kevin Dueño", autorizo: "Kevin Dueño", sinPin: true });
    // Una mesa libre no tiene sesión ni quién.
    expect(mesas[2]).toMatchObject({ sesionId: null, quien: null });
    expect(cuentas[0]).toMatchObject({ sesionId: 201, quien: { abrio: "Pepe Mamani" }, cuenta: { nombre: "Juan" } });
  });

  it("los números de arriba cuentan cajas, ventas, mesas en juego, pausas y lo que falta cobrar", () => {
    const { mesas, cuentas } = armarSupervision(api);
    const contexto = { tipos: { pool: POOL }, ajustes: { avisos: [10, 5, 1] } };
    const r = resumenSupervision(
      api,
      mesas.map((m) => vistaDe(contexto, m.mesa, AHORA)),
      cuentas.map((c) => vistaCuenta(c.cuenta, AHORA)),
    );
    expect(r).toMatchObject({
      cajasAbiertas: 2,
      cajasTotal: 3,
      // La caja 3 se abrió antes de la jornada (8 h atrás): se olvidaron de cerrarla.
      cajasViejas: 1,
      vendido: 150,
      ventas: 4,
      mesasEnJuego: 2,
      mesasTotal: 3,
      pausadas: 1,
      cuentas: 1,
    });
    // La cuenta de Juan: 2 Paceña a Bs 15 y nada cobrado.
    const juan = cuentaDe(cuentas[0].cuenta.sesion, { ...POOL, tarifa: 0, minimo: 0 }, AHORA);
    expect(juan.total).toBe(30);
    expect(r.porCobrar).toBeGreaterThanOrEqual(30);
    expect(r.totalAbierto).toBeGreaterThanOrEqual(r.porCobrar);
    // El rótulo de "Cuentas abiertas" suma sólo las cuentas, no las mesas en
    // juego (revisión del 23-oct: decía el total de todo).
    expect(r.totalCuentas).toBe(30);
    expect(r.totalAbierto).toBeGreaterThan(r.totalCuentas);
  });

  it("lo vendido es del turno que se mira y el día entero va aparte; las cajas de ayer no son de hoy", () => {
    const delTurno = { cajaId: 1, defectoId: 1, desde: AHORA - 3 * H, hasta: null, ventas: 3, vendido: 120.5 };
    const ayer = caja({ id: 4, abierta: false, desde: AHORA - 20 * H, hasta: AHORA - 12 * H });
    const r = resumenSupervision({ ...api, cajas: [...api.cajas, ayer], turno: delTurno }, [], []);
    expect(r).toMatchObject({ vendido: 120.5, ventas: 3, vendidoHoy: 150, ventasHoy: 4 });
    // Las 3 de antes (una abierta, otra cerrada hoy, la olvidada) y no la cerrada ayer.
    expect(r.cajasTotal).toBe(3);
    // Un servidor anterior no manda el turno: lo vendido es lo de hoy.
    expect(resumenSupervision(api, [], [])).toMatchObject({ vendido: 150, ventas: 4, vendidoHoy: 150 });
  });

  it("sin cajas ni mesas, todo en cero", () => {
    expect(resumenSupervision({ cajas: [], hoy: { ventas: 0, vendido: 0 }, desde: 0 }, [], [])).toEqual({
      cajasAbiertas: 0,
      cajasTotal: 0,
      cajasViejas: 0,
      vendido: 0,
      ventas: 0,
      vendidoHoy: 0,
      ventasHoy: 0,
      mesasEnJuego: 0,
      mesasTotal: 0,
      pausadas: 0,
      cuentas: 0,
      totalAbierto: 0,
      porCobrar: 0,
      totalCuentas: 0,
    });
  });
});

describe("el efectivo en la actividad (24-oct)", () => {
  const a = (codigo: string): ActividadApi => ({ id: codigo, hora: 1, quien: "Kevin", texto: "x", codigo });

  it("los movimientos de efectivo van en su propio filtro, y no en el de las mesas", () => {
    expect(grupoDeActividad("EFECTIVO")).toBe("efectivo");
    expect(grupoDeActividad("EFECTIVO_CENA")).toBe("efectivo");
    const lista = [a("EFECTIVO_CENA"), a("EFECTIVO"), a("PAUSAR"), a("VENTA")];
    expect(filtrarActividad(lista, "efectivo").map((x) => x.codigo)).toEqual(["EFECTIVO_CENA", "EFECTIVO"]);
    expect(filtrarActividad(lista, "mesas").map((x) => x.codigo)).toEqual(["PAUSAR"]);
  });

  it("la cena va en violeta y el resto de los movimientos, sin color", () => {
    expect(tonoDeActividad("EFECTIVO_CENA")).toBe("violeta");
    expect(tonoDeActividad("EFECTIVO")).toBe("normal");
  });
});
