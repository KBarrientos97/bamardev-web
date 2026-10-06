import { describe, expect, it } from "vitest";
import { cita, recurso } from "../../test/agendaFixtures";
import { profesionalesParaCola, serviciosDeLaCola } from "./cola";

describe("cola de espera: piezas puras", () => {
  const carla = recurso({ id: 1, nombre: "Carla", orden: 2, servicioIds: [100, 101] });
  const beto = recurso({ id: 2, nombre: "Beto", orden: 1, servicioIds: [100] });
  const norte = recurso({ id: 3, nombre: "Del Norte", sucursalIds: [2], servicioIds: [100] });
  const baja = recurso({ id: 4, nombre: "De baja", activo: false, servicioIds: [100] });
  const cabina = recurso({ id: 5, nombre: "Cabina", tipo: "ESPACIO", servicioIds: [100] });
  const todos = [carla, beto, norte, baja, cabina];

  it("ofrece profesionales activos de la sucursal que hacen TODO lo pedido, en el orden de la agenda", () => {
    expect(profesionalesParaCola(todos, [100], 1).map((r) => r.nombre)).toEqual(["Beto", "Carla"]);
    expect(profesionalesParaCola(todos, [100, 101], 1).map((r) => r.nombre)).toEqual(["Carla"]);
    // Sin servicios elegidos todavía: todos los de la sucursal.
    expect(profesionalesParaCola(todos, [], 1).map((r) => r.nombre)).toEqual(["Beto", "Carla"]);
    expect(profesionalesParaCola(todos, [100], 2).map((r) => r.nombre)).toEqual(["Del Norte"]);
  });

  it("lo pedido sale de serviciosPedidos (el walk-in no tiene líneas)", () => {
    const enCola = cita({
      estado: "EN_COLA",
      lineas: [],
      serviciosPedidos: [
        { id: 100, nombre: "Corte" },
        { id: 101, nombre: "Barba" },
      ],
    });
    expect(serviciosDeLaCola(enCola)).toBe("Corte + Barba");
    // Una respuesta sin serviciosPedidos sigue leyendo las líneas.
    expect(serviciosDeLaCola(cita())).toBe("Corte dama");
  });
});
