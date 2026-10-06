import { describe, expect, it } from "vitest";
import { ApiError } from "../api";
import { cita, servicio } from "../../test/agendaFixtures";
import { clienteDelConflicto, esperaDelConflicto, huecosDelConflicto } from "./apiAgenda";
import { accionesPara, accionesRapidas, esTerminal, vaEnGrilla } from "./estadosCita";
import {
  aMinutos,
  deMinutos,
  diaSemana,
  fechaLarga,
  fechaNegocio,
  horaNegocio,
  instante,
  lunesDe,
  sumarDias,
} from "./horaAgenda";
import { citaMovida, lineasManuales, moverLineas } from "./lineasCita";
import { enlaceWhatsApp, textoRecordatorio } from "./recordatorio";
import type { EstadoCita } from "./tiposAgenda";

describe("la hora del negocio, no la del equipo", () => {
  it("convierte fecha y hora de La Paz a UTC y de vuelta", () => {
    expect(instante("2026-10-21", "10:00")).toBe("2026-10-21T14:00:00.000Z");
    expect(horaNegocio("2026-10-21T14:00:00.000Z")).toBe("10:00");
    // Las 22:00 de La Paz ya son el día siguiente en UTC: la fecha es la del local.
    expect(fechaNegocio("2026-10-22T02:00:00.000Z")).toBe("2026-10-21");
  });

  it("cuenta días y semanas sin pasar por la zona del equipo", () => {
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(diaSemana("2026-10-21")).toBe(3);
    expect(diaSemana("2026-10-25")).toBe(7);
    expect(lunesDe("2026-10-25")).toBe("2026-10-19");
    expect(fechaLarga("2026-10-10")).toBe("sábado 10 de octubre");
    expect(deMinutos(aMinutos("09:30") + 45)).toBe("10:15");
  });
});

describe("acciones según el estado de la cita (§6)", () => {
  it("recepción: cada estado ofrece sólo sus transiciones", () => {
    expect(accionesPara("RESERVADA")).toEqual(["CONFIRMAR", "LLEGO", "ATENDER", "NO_ASISTIO", "CANCELAR"]);
    expect(accionesPara("CONFIRMADA")).toEqual(["LLEGO", "ATENDER", "NO_ASISTIO", "CANCELAR"]);
    expect(accionesPara("EN_ESPERA")).toEqual(["ATENDER", "CANCELAR"]);
    expect(accionesPara("EN_ATENCION")).toEqual(["FINALIZAR"]);
    expect(accionesPara("POR_COBRAR")).toEqual(["SIN_CARGO"]);
    expect(accionesPara("EN_COLA")).toEqual(["ABANDONO"]);
  });

  it("los terminales no ofrecen nada: una cancelada no se reabre", () => {
    const terminales: EstadoCita[] = ["COMPLETADA", "CANCELADA", "RECHAZADA", "EXPIRADA", "ABANDONADA"];
    for (const e of terminales) {
      expect(esTerminal(e), e).toBe(true);
      expect(accionesPara(e), e).toEqual([]);
    }
  });

  it("un «No vino» por error se deshace, pero el profesional no lo ofrece", () => {
    expect(esTerminal("NO_ASISTIO")).toBe(true);
    expect(accionesPara("NO_ASISTIO")).toEqual(["DESHACER_NO_ASISTIO"]);
    expect(accionesPara("NO_ASISTIO", { profesional: true })).toEqual([]);
  });

  it("el profesional marca llegó, atender, finalizar y no vino; nunca cancela ni confirma", () => {
    expect(accionesPara("RESERVADA", { profesional: true })).toEqual(["LLEGO", "ATENDER", "NO_ASISTIO"]);
    expect(accionesPara("EN_ATENCION", { profesional: true })).toEqual(["FINALIZAR"]);
    expect(accionesPara("POR_COBRAR", { profesional: true })).toEqual([]);
  });

  it("los botones rápidos siguen el momento de la cita", () => {
    const de = (estado: EstadoCita, extra = {}) =>
      accionesRapidas(cita({ estado, ...extra })).map((r) => `${r.accion}${r.principal ? "*" : ""}`);
    expect(de("RESERVADA")).toEqual(["CONFIRMAR*", "LLEGO"]);
    expect(de("CONFIRMADA")).toEqual(["LLEGO*", "NO_ASISTIO"]);
    expect(de("EN_ESPERA")).toEqual(["ATENDER*"]);
    expect(de("EN_ATENCION")).toEqual(["FINALIZAR*"]);
    // Cobrar se ve, pero es la siguiente entrega: la tarjeta lo dibuja apagado.
    expect(de("POR_COBRAR")).toEqual(["COBRAR*"]);
    // El sistema sugiere el no-show, no lo marca: va primero, con "Llegó" al lado.
    expect(de("CONFIRMADA", { noShowSugerido: true })).toEqual(["NO_ASISTIO*", "LLEGO"]);
  });

  it("lo que liberó el hueco no se dibuja en la grilla", () => {
    expect(vaEnGrilla("CANCELADA")).toBe(false);
    expect(vaEnGrilla("EN_COLA")).toBe(false);
    expect(vaEnGrilla("POR_COBRAR")).toBe(true);
  });
});

describe("mover una cita arrastrándola", () => {
  const dosServicios = cita({
    lineas: [
      { ...cita().lineas[0] },
      {
        ...cita().lineas[0],
        id: 12,
        servicioId: 101,
        servicio: "Brushing",
        inicio: "2026-10-21T14:45:00.000Z",
        fin: "2026-10-21T15:15:00.000Z",
      },
    ],
  });

  it("corre toda la secuencia y pasa al profesional nuevo las líneas que eran del mismo", () => {
    expect(moverLineas(dosServicios, 11, 30, 2)).toEqual([
      { servicioId: 100, recursoId: 2, inicio: "2026-10-21T14:30:00.000Z" },
      { servicioId: 101, recursoId: 2, inicio: "2026-10-21T15:15:00.000Z" },
    ]);
  });

  it("la cita movida conserva la duración de cada línea", () => {
    const movida = citaMovida(dosServicios, moverLineas(dosServicios, 11, 30, 2), () => "Marcos T.");
    expect(movida.inicio).toBe("2026-10-21T14:30:00.000Z");
    expect(movida.fin).toBe("2026-10-21T15:45:00.000Z");
    expect(movida.lineas[0].recurso).toBe("Marcos T.");
  });

  it("un sobre-turno encadena los servicios desde la hora elegida", () => {
    const lineas = lineasManuales(
      "2026-10-21",
      "10:00",
      [
        { servicioId: 100, recursoId: 1 },
        { servicioId: 101, recursoId: 1 },
      ],
      [servicio(), servicio({ id: 101, nombre: "Brushing", duracionMin: 30 })],
    );
    expect(lineas.map((l) => l.inicio)).toEqual(["2026-10-21T14:00:00.000Z", "2026-10-21T14:45:00.000Z"]);
  });
});

describe("avisar al cliente (§9.2)", () => {
  it("con teléfono arma el enlace wa.me con el 591 y el texto del recordatorio", () => {
    const c = cita();
    const texto = textoRecordatorio(c, { negocio: "Salón Bella Vista" });
    expect(texto).toContain("Hola Rosa");
    expect(texto).toContain("miércoles 21 de octubre a las 10:00");
    expect(texto).toContain("Corte dama con Carla R.");
    expect(enlaceWhatsApp(c.cliente.telefono, texto)).toBe(
      `https://wa.me/59171234567?text=${encodeURIComponent(texto)}`,
    );
  });

  it("sin teléfono (el profesional que no lo ve) no hay enlace: sólo copiar", () => {
    expect(enlaceWhatsApp(null, "hola")).toBeNull();
    expect(enlaceWhatsApp("", "hola")).toBeNull();
  });

  it("un teléfono que ya trae el 591 no lo duplica", () => {
    expect(enlaceWhatsApp("+591 71234567", "x")).toBe("https://wa.me/59171234567?text=x");
  });
});

describe("los errores de la agenda que se manejan aparte", () => {
  it("un 409 HUECO_OCUPADO trae los huecos recalculados", () => {
    const huecos = [{ inicio: "2026-10-21T15:00:00.000Z", lineas: [] }];
    const e = new ApiError("Ocupado", 409, { codigo: "HUECO_OCUPADO", huecos });
    expect(huecosDelConflicto(e)).toEqual(huecos);
    expect(huecosDelConflicto(new ApiError("x", 400, { codigo: "FUERA_DE_HORARIO" }))).toBeNull();
  });

  it("SIN_RECURSO_LIBRE trae la espera y TELEFONO_EXISTE el cliente", () => {
    expect(esperaDelConflicto(new ApiError("x", 409, { codigo: "SIN_RECURSO_LIBRE", esperaEstimadaMin: 20 }))).toBe(20);
    const existente = { id: 9, nombre: "Ana" };
    expect(clienteDelConflicto(new ApiError("x", 409, { codigo: "TELEFONO_EXISTE", cliente: existente }))?.id).toBe(9);
  });
});
