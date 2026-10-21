import { describe, expect, it } from "vitest";
import type { ActividadApi, CajaSupervisionApi, SupervisionApi } from "../api";
import { cuentaDe } from "../calculo";
import { vistaCuenta, vistaDe } from "../vista";
import {
  armarSupervision,
  cuando,
  duracion,
  estadoDeCaja,
  filtrarActividad,
  grupoDeActividad,
  iniciales,
  resumenSupervision,
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
  it("cuándo pasó: la hora si es de hoy, ayer con la hora y la fecha si es más viejo", () => {
    const ahora = new Date(2026, 9, 21, 15, 30).getTime();
    expect(cuando(new Date(2026, 9, 21, 14, 2).getTime(), ahora)).toBe("14:02");
    expect(cuando(new Date(2026, 9, 20, 22, 10).getTime(), ahora)).toBe("ayer 22:10");
    expect(cuando(new Date(2026, 9, 18, 9, 5).getTime(), ahora)).toBe("18/10 09:05");
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
  });

  it("sin cajas ni mesas, todo en cero", () => {
    expect(resumenSupervision({ cajas: [], hoy: { ventas: 0, vendido: 0 }, desde: 0 }, [], [])).toEqual({
      cajasAbiertas: 0,
      cajasTotal: 0,
      cajasViejas: 0,
      vendido: 0,
      ventas: 0,
      mesasEnJuego: 0,
      mesasTotal: 0,
      pausadas: 0,
      cuentas: 0,
      totalAbierto: 0,
      porCobrar: 0,
    });
  });
});
