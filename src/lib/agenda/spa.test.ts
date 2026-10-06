import { describe, expect, it } from "vitest";
import { cita, recursoDelDia } from "../../test/agendaFixtures";
import { aCambiosSpa, valoresIniciales } from "./servicioSpa";
import {
  densidadDeFirma,
  detallesDePaquete,
  espacioDeLinea,
  featuresSpa,
  idLineaReal,
  partirPorPose,
  sinLineasConPaquete,
  sinUsarPaquetes,
  textoCabinaYPose,
  textoPose,
  vistaPorEspacio,
  vistaPorProfesional,
} from "./spa";
import type { CarritoCita } from "./tiposAgenda";

/**
 * Las piezas sin pantalla del spa completo (agenda fase 3): features
 * estrictas, la agenda por espacio, la pose partida en dos bloques, el cobro
 * con sesiones de paquete y el formulario de pose del servicio.
 */

describe("features del spa", () => {
  it("son estrictas: un negocio sin features no ve cabinas ni paquetes", () => {
    expect(featuresSpa(undefined)).toEqual({ espacios: false, paquetes: false, consentimientos: false });
    expect(featuresSpa([])).toEqual({ espacios: false, paquetes: false, consentimientos: false });
    expect(featuresSpa(["agenda", "espacios", "paquetes"])).toEqual({
      espacios: true,
      paquetes: true,
      consentimientos: false,
    });
  });
});

describe("agenda por espacio", () => {
  const ana = recursoDelDia({ id: 1, nombre: "Ana" });
  const cabina = recursoDelDia({ id: 7, tipo: "ESPACIO", nombre: "Cabina 1", tramos: [] });

  it("una columna por espacio; la línea va a su cabina con el nombre del profesional", () => {
    const c = cita({
      lineas: [{ ...cita().lineas[0], recursoId: 1, recurso: "Ana", servicio: "Masaje", espacioId: 7, espacio: "Cabina 1" }],
    });
    const sinCabina = cita({ id: 2 });
    const v = vistaPorEspacio([ana, cabina], [c, sinCabina]);
    expect(v.recursos.map((r) => r.id)).toEqual([7]);
    // Sin horario propio, se pinta con la jornada del equipo.
    expect(v.recursos[0].tramos).toEqual([{ desde: "09:00", hasta: "19:00" }]);
    expect(v.citas).toHaveLength(1);
    expect(v.citas[0].lineas[0]).toMatchObject({ recursoId: 7, servicio: "Masaje · Ana" });
  });

  it("la cita agendada por cabina va a esa columna sin repetir el nombre", () => {
    const c = cita({ lineas: [{ ...cita().lineas[0], recursoId: 7, recurso: "Cabina 1", servicio: "Masaje" }] });
    expect(espacioDeLinea(c.lineas[0], (id) => id === 7)).toBe(7);
    expect(vistaPorEspacio([ana, cabina], [c]).citas[0].lineas[0].servicio).toBe("Masaje");
  });
});

describe("tiempo de pose", () => {
  const conPose = cita({
    lineas: [
      {
        ...cita().lineas[0],
        id: 11,
        inicio: "2026-10-21T18:00:00.000Z",
        fin: "2026-10-21T19:30:00.000Z",
        poseDesde: "2026-10-21T18:30:00.000Z",
        poseHasta: "2026-10-21T19:10:00.000Z",
      },
    ],
  });

  it("la línea se dibuja en dos bloques y el medio queda libre", () => {
    const [c] = partirPorPose([conPose]);
    expect(c.lineas.map((l) => [l.id, l.inicio, l.fin])).toEqual([
      [11, "2026-10-21T18:00:00.000Z", "2026-10-21T18:30:00.000Z"],
      [-11, "2026-10-21T19:10:00.000Z", "2026-10-21T19:30:00.000Z"],
    ]);
    expect(idLineaReal(-11)).toBe(11);
    expect(textoPose(conPose.lineas[0])).toBe("Pose 14:30 – 15:10: queda libre");
  });

  it("sin pose, la cita queda igual", () => {
    const c = cita();
    expect(partirPorPose([c])[0]).toBe(c);
    expect(textoPose(c.lineas[0])).toBeNull();
  });
});

describe("cobro con sesiones de paquete", () => {
  const carrito: CarritoCita = {
    citaId: 9,
    codigo: "X",
    estado: "POR_COBRAR",
    ventaId: null,
    cobroRevisar: false,
    sucursalId: 1,
    cliente: { id: 5, nombre: "Rosa" },
    lineas: [
      {
        productoId: 100,
        descripcion: "Masaje",
        cantidad: 1,
        precio: 150,
        recursoId: 1,
        recurso: "Ana",
        paquete: { paqueteClienteId: 3, nombre: "5 masajes", restantes: 2, ultimoDia: "2026-12-31" },
      },
      { productoId: 101, descripcion: "Facial", cantidad: 1, precio: 90, recursoId: 1, recurso: "Ana", paquete: null },
    ],
    total: 240,
    totalConPaquetes: 90,
  };

  it("lo cubierto no entra al carrito y va como línea a 0 con usarPaquete", () => {
    expect(sinLineasConPaquete(carrito).lineas.map((l) => l.productoId)).toEqual([101]);
    expect(detallesDePaquete(carrito)).toEqual([
      { productoId: 100, cantidad: 1, precio: 0, recursoId: 1, usarPaquete: true },
    ]);
  });

  it("cobrar sin usar el paquete lo saca de todas las líneas", () => {
    expect(detallesDePaquete(sinUsarPaquetes(carrito))).toEqual([]);
    expect(detallesDePaquete(null)).toEqual([]);
  });
});

describe("formulario de pose del servicio", () => {
  const inicial = valoresIniciales({ poseInicioMin: null, poseMin: null, requiereEspacioTipoId: null });

  it("sin cambios no manda nada nuevo", () => {
    expect(aCambiosSpa(inicial, 60, true, inicial)).toEqual({ cambios: {} });
  });

  it("la pose va completa y antes del fin", () => {
    expect(aCambiosSpa({ ...inicial, poseInicio: "30" }, 90, false, inicial)).toEqual({
      error: "Para la pose indicá a los cuántos minutos empieza y cuánto dura.",
    });
    expect(aCambiosSpa({ ...inicial, poseInicio: "30", poseMin: "60" }, 90, false, inicial)).toEqual({
      error: "La pose tiene que terminar antes del fin del servicio.",
    });
    expect(aCambiosSpa({ ...inicial, poseInicio: "30", poseMin: "40" }, 90, false, inicial)).toEqual({
      cambios: { poseInicioMin: 30, poseMin: 40 },
    });
  });

  it("el espacio sólo viaja con la feature", () => {
    const v = { ...inicial, requiereEspacioTipoId: "4" };
    expect(aCambiosSpa(v, 60, true, inicial)).toEqual({ cambios: { requiereEspacioTipoId: 4 } });
    expect(aCambiosSpa(v, 60, false, inicial)).toEqual({ cambios: {} });
  });
});

// ── Ronda 2 de QA del spa ──────────────────────────────────────────────────

describe("vista por terapeuta (QA S2-04)", () => {
  const ana = recursoDelDia({ id: 1, nombre: "Ana" });
  const cabina = recursoDelDia({ id: 7, tipo: "ESPACIO", nombre: "Cabina 1", tramos: [] });

  it("con `espacios`, las cabinas no son columnas: tienen su vista propia", () => {
    expect(vistaPorProfesional([ana, cabina], [], true).recursos.map((r) => r.id)).toEqual([1]);
  });

  it("sin la feature (agenda por cabina) siguen siendo columnas", () => {
    expect(vistaPorProfesional([ana, cabina], [], false).recursos.map((r) => r.id)).toEqual([1, 7]);
  });
});

describe("cabina y pose en las listas (QA S2-14)", () => {
  it("dice a qué cabina ir y cuándo queda libre", () => {
    const l = {
      ...cita().lineas[0],
      espacioId: 7,
      espacio: "Cabina 1",
      // 11:45 a 12:15 en La Paz.
      poseDesde: "2026-10-21T15:45:00.000Z",
      poseHasta: "2026-10-21T16:15:00.000Z",
    };
    expect(textoCabinaYPose([l])).toBe("Cabina 1 · pose 11:45–12:15");
    expect(textoCabinaYPose([{ ...l, poseDesde: null, poseHasta: null }])).toBe("Cabina 1");
  });

  it("sin cabina ni pose no agrega nada", () => {
    expect(textoCabinaYPose(cita().lineas)).toBeNull();
  });
});

describe("firma nítida en el celular (QA S2-16)", () => {
  it("usa la densidad de la pantalla, entre 1 y 2", () => {
    expect(densidadDeFirma(3)).toBe(2);
    expect(densidadDeFirma(1.5)).toBe(1.5);
    expect(densidadDeFirma(0)).toBe(1);
    expect(densidadDeFirma(Number.NaN)).toBe(1);
  });
});
