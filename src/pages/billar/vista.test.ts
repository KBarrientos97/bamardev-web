import { describe, expect, it } from "vitest";
import { contenidoTarjeta, vistaSalon } from "./SalonTv.datos";
import type { EstadoBillar } from "./store";
import type { CuentaSinMesa, ItemConsumo, Mesa, Sesion, TipoMesa } from "./tipos";
import { PAUSA_LARGA_SEG, segundosEnPausa } from "./calculo";
import { etiquetaOrigen, pasaBusqueda, pasaBusquedaCuenta, resumenTurno, vistaCuenta, vistaDe } from "./vista";

const POOL: TipoMesa = {
  id: "pool",
  nombre: "Pool",
  tarifa: 20,
  fraccion: 15,
  tolerancia: 3,
  minimo: 30,
  paquetes: [],
  promos: [],
};
const AHORA = Date.UTC(2026, 9, 17, 23, 0);

const enPausaHace = (min: number): Mesa => {
  const sesion: Sesion = {
    id: "s",
    start: AHORA - 60 * 60_000,
    pausedAt: AHORA - min * 60_000,
    pausedTotal: 0,
    prepago: null,
    prev: null,
    consumos: [],
    pagos: [],
  };
  return { id: 3, idInterno: 30, tipo: "pool", estado: "abierta", sesion };
};

describe("la pausa a la vista", () => {
  it("cuenta cuánto lleva en pausa, y nada si no está pausada", () => {
    expect(segundosEnPausa(enPausaHace(12), AHORA)).toBe(12 * 60);
    expect(segundosEnPausa({ id: 1, idInterno: 10, tipo: "pool", estado: "libre" }, AHORA)).toBeNull();
  });

  it("después de un cambio de mesa la pausa se cuenta desde que se pausó, no desde el cambio", () => {
    // Revisión del 17-oct: el cambio a otra tarifa corre pausedAt a la hora
    // del cambio (para cobrar bien) y el "hace N min" volvía a cero.
    const mesa = enPausaHace(1);
    mesa.sesion!.pausaDesde = AHORA - 30 * 60_000;
    expect(segundosEnPausa(mesa, AHORA)).toBe(30 * 60);
  });

  it("en la TV dice cuánto lleva y la pausa larga se ve en ámbar", () => {
    // Revisión del 17-oct: una pausa olvidada (o "para un conocido") es tiempo
    // que no se cobra, y en la TV sólo decía "Pausada".
    const corta = contenidoTarjeta(vistaSalon(enPausaHace(4), { pool: POOL }, [10, 5, 1], AHORA));
    expect(corta.chico).toBe("Pausada · hace 4 min");
    expect(corta.color).toBe("text-white/50");
    const larga = contenidoTarjeta(vistaSalon(enPausaHace(PAUSA_LARGA_SEG / 60 + 2), { pool: POOL }, [10, 5, 1], AHORA));
    expect(larga.chico).toBe("Pausada · hace 12 min");
    expect(larga.color).toBe("text-amber-300");
  });
});

describe("anular la mesa", () => {
  it("con algo consumido no se ofrece anular la mesa, aunque esté en los 5 minutos", () => {
    // El dueño, 18-oct: el link aparecía y el diálogo decía que no se podía.
    // "Si ya consumieron, no es un error: se le tiene que cobrar".
    const e = { tipos: { pool: POOL }, ajustes: { avisos: [10, 5, 1] } } as unknown as EstadoBillar;
    const cerveza: ItemConsumo = { id: "c1", productoId: 7, nombre: "Cerveza", precio: 15, cant: 6, hora: AHORA };
    const abiertaCon = (consumos: ItemConsumo[]): Mesa => ({
      id: 1,
      idInterno: 10,
      tipo: "pool",
      estado: "abierta",
      sesion: {
        id: "s",
        start: AHORA - 60_000,
        abierta: AHORA - 60_000,
        pausedAt: null,
        pausedTotal: 0,
        prepago: null,
        prev: null,
        consumos,
        pagos: [],
      },
    });
    expect(vistaDe(e, abiertaCon([]), AHORA).anulable).toBe(true);
    expect(vistaDe(e, abiertaCon([cerveza]), AHORA).anulable).toBe(false);
    // Aunque valga Bs 0: el backend la rechaza igual (ANULAR_CON_CONSUMOS).
    expect(vistaDe(e, abiertaCon([{ ...cerveza, precio: 0 }]), AHORA).anulable).toBe(false);
    // Lo anulado no cuenta: anulado el consumo cargado por error, se puede.
    expect(vistaDe(e, abiertaCon([{ ...cerveza, anulado: true }]), AHORA).anulable).toBe(true);
  });
});

describe("buscar en el tablero", () => {
  it("encuentra al cliente y el apodo sin las tildes, como los teclea el cajero", () => {
    // Prueba profunda del 18-oct: "perez" no encontraba a "Juan Pérez" y la
    // pantalla decía "Ninguna mesa coincide".
    const e = { tipos: { pool: POOL }, ajustes: { avisos: [10, 5, 1] } } as unknown as EstadoBillar;
    const mesa: Mesa = {
      ...enPausaHace(5),
      alias: "Rincón",
      sesion: { ...enPausaHace(5).sesion!, cliente: "Juan Pérez de la Fuente Rodríguez" },
    };
    const v = vistaDe(e, mesa, AHORA);
    for (const q of ["perez", "PEREZ", "rodriguez", "Pérez", "rincon", "mesa 3", "3"]) {
      expect(pasaBusqueda(v, q)).toBe(true);
    }
    expect(pasaBusqueda(v, "gonzalez")).toBe(false);
  });
});

describe("las cuentas abiertas (sin mesa ni tiempo, 21-oct)", () => {
  const cerveza: ItemConsumo = { id: "c1", productoId: 7, nombre: "Cerveza", precio: 15, cant: 4, hora: AHORA };
  const juan = (consumos: ItemConsumo[], pagos: Sesion["pagos"] = []): CuentaSinMesa => ({
    id: 77,
    nombre: "Juan Pérez",
    sesion: {
      id: "77",
      start: AHORA - 3 * 3_600_000,
      pausedAt: null,
      pausedTotal: 0,
      prepago: null,
      prev: null,
      // Aunque llegara una tarifa con precio, una cuenta no cobra tiempo.
      tarifa: POOL,
      consumos,
      pagos,
    },
  });

  it("la cuenta son los consumos menos lo cobrado, sin tiempo aunque pasen horas", () => {
    const v = vistaCuenta(juan([cerveza], [{ id: "p", hora: AHORA, metodo: "Efectivo", monto: 40 }]), AHORA);
    expect(v.calc).toMatchObject({ tiempoBs: 0, consumosBs: 60, total: 60, pagado: 40, saldo: 20 });
    expect(v.anulable).toBe(false);
  });

  it("sin consumos (o con todos anulados) se puede anular, sin plazo", () => {
    expect(vistaCuenta(juan([]), AHORA).anulable).toBe(true);
    expect(vistaCuenta(juan([{ ...cerveza, anulado: true }]), AHORA).anulable).toBe(true);
  });

  it("se busca por el nombre sin tildes ni mayúsculas", () => {
    for (const q of ["perez", "JUAN", "", "  "]) expect(pasaBusquedaCuenta(juan([]), q)).toBe(true);
    expect(pasaBusquedaCuenta(juan([]), "barra")).toBe(false);
  });

  it("una venta de cuenta se nombra con la cuenta", () => {
    expect(etiquetaOrigen({ origen: "cuenta", cuenta: "Barra" })).toBe("Cuenta «Barra»");
    expect(etiquetaOrigen({ origen: "mesa", mesaId: 4 })).toBe("Mesa 4");
    expect(etiquetaOrigen({ origen: "rapida" })).toBe("Venta rápida");
  });

  it("el turno cuenta lo cobrado de a poco a una cuenta que sigue abierta, y las cuentas cobradas", () => {
    const e = {
      caja: { abierta: true, desde: AHORA - 3_600_000, inicial: 0 },
      mesas: [],
      cuentas: [juan([cerveza], [{ id: "p", hora: AHORA - 60_000, metodo: "Efectivo", monto: 40 }])],
      ventas: [
        {
          id: 1,
          codigo: "V-1",
          hora: AHORA - 120_000,
          cajero: "Ana",
          origen: "cuenta",
          cuenta: "Barra",
          tiempoMin: 0,
          tiempoBs: 0,
          items: [],
          consumosBs: 30,
          total: 30,
          pagos: [{ id: "x", hora: AHORA - 120_000, metodo: "QR", monto: 30 }],
        },
      ],
    } as unknown as EstadoBillar;
    const r = resumenTurno(e);
    expect(r).toMatchObject({ adelantos: 40, efectivo: 40, qr: 30, cuentasCobradas: 1, cuentasBs: 30, mesasCerradas: 0, rapidas: 0 });
  });
});
