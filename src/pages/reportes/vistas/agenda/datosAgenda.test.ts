import { describe, expect, it } from "vitest";
import type { ReporteAgenda } from "../../../../lib/agenda/tiposComisiones";
import {
  filasOcupacion,
  filasOrigen,
  parteReservada,
  serviciosDestacados,
  totalesProduccion,
  tramosAsistencia,
} from "./datosAgenda";

const asistencia = (over: Partial<ReporteAgenda["asistencia"]> = {}): ReporteAgenda["asistencia"] => ({
  total: 20,
  completadas: 14,
  noShows: 2,
  canceladas: 3,
  abandonadas: 0,
  pendientes: 1,
  tasaNoShow: 10,
  tasaCancelacion: 15,
  porOrigen: [
    { origen: "INTERNA", total: 12, noShows: 1 },
    { origen: "ONLINE", total: 8, noShows: 1 },
    { origen: "WALKIN", total: 0, noShows: 0 },
  ],
  ...over,
});

describe("producción por profesional", () => {
  it("lo producido se suma entre todos, separado en servicios y productos", () => {
    const t = totalesProduccion([
      { recursoId: 1, nombre: "Ana", color: "#000", produccion: 350, produccionServicios: 300, produccionProductos: 50, servicios: 3, clientes: 3, ticketMedio: 116.67 },
      { recursoId: 2, nombre: "Luz", color: "#111", produccion: 200, produccionServicios: 200, produccionProductos: 0, servicios: 2, clientes: 2, ticketMedio: 100 },
    ]);
    expect(t).toEqual({ produccion: 550, servicios: 500, productos: 50, cantidadServicios: 5 });
  });
});

describe("servicios más pedidos", () => {
  const servicio = (servicioId: number, servicio: string, pedidos: number, ingresos: number) => ({ servicioId, servicio, pedidos, cobrados: pedidos, ingresos });

  it("el más pedido y el que más deja pueden ser distintos", () => {
    const d = serviciosDestacados([servicio(1, "Corte", 30, 900), servicio(2, "Color", 8, 2400)]);
    expect(d.masPedido?.servicio).toBe("Corte");
    expect(d.masDeja?.servicio).toBe("Color");
  });

  it("si nada se cobró todavía, no hay uno que 'más deja'", () => {
    expect(serviciosDestacados([servicio(1, "Corte", 3, 0)]).masDeja).toBeNull();
    expect(serviciosDestacados([])).toEqual({ masPedido: null, masDeja: null });
  });
});

describe("asistencia", () => {
  it("los orígenes sin citas no van: un 0 % de no-shows de nada no es un dato", () => {
    const filas = filasOrigen(asistencia());
    expect(filas.map((o) => o.nombre)).toEqual(["Agendadas", "Reserva online"]);
    expect(filas[1].tasa).toBeCloseTo(1 / 8);
  });

  it("cómo terminaron las citas, sin los tramos en cero", () => {
    const tramos = tramosAsistencia(asistencia());
    expect(tramos.map((t) => [t.nombre, t.cantidad])).toEqual([
      ["Atendidas", 14],
      ["No vinieron", 2],
      ["Canceladas", 3],
      ["Por venir o cobrar", 1],
    ]);
    expect(tramos[0].fraccion).toBeCloseTo(0.7);
  });

  it("sin citas no hay reparto", () => {
    expect(tramosAsistencia(asistencia({ total: 0, completadas: 0, noShows: 0, canceladas: 0, pendientes: 0 }))).toEqual([]);
  });
});

describe("ocupación de la agenda", () => {
  const recurso = (recursoId: number, nombre: string, pct: number | null) => ({
    recursoId,
    nombre,
    color: "#000",
    minutosDisponibles: pct == null ? 0 : 600,
    minutosReservados: pct == null ? 0 : pct * 6,
    pct,
    dias: [],
  });

  it("del más ocupado al menos; uno sin horario va al final, no como 0 %", () => {
    const filas = filasOcupacion({
      minutosDisponibles: 1200,
      minutosReservados: 600,
      pct: 50,
      recursos: [recurso(1, "Ana", 30), recurso(2, "Bea", null), recurso(3, "Caro", 70)],
    });
    expect(filas.map((r) => r.nombre)).toEqual(["Caro", "Ana", "Bea"]);
  });

  it("la barra es lo reservado sobre el horario, y sin horario no hay barra", () => {
    expect(parteReservada(150, 600)).toBe(0.25);
    expect(parteReservada(700, 600)).toBe(1);
    expect(parteReservada(0, 0)).toBeNull();
  });
});
