import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La moto del mapa del seguimiento: aparece con la posición, se mueve, y SE
 * VA cuando el backend la esconde (más de 2 minutos sin actualizarse). Antes
 * quedaba clavada en el último punto mientras el texto decía «Esperando la
 * ubicación del repartidor…» (PW-04). MapLibre se simula.
 */

const marcadores = vi.hoisted(() => [] as { letra: string; quitado: boolean; lngLat: number[] }[]);

vi.mock("../../lib/mapa", () => {
  class Marker {
    registro: { letra: string; quitado: boolean; lngLat: number[] };
    constructor(opciones: { element: HTMLElement }) {
      this.registro = { letra: opciones.element.textContent ?? "", quitado: false, lngLat: [] };
      marcadores.push(this.registro);
    }
    setLngLat(p: number[]) {
      this.registro.lngLat = p;
      return this;
    }
    addTo() {
      return this;
    }
    remove() {
      this.registro.quitado = true;
    }
  }
  class LngLatBounds {
    extend() {}
  }
  class Map {
    addControl() {}
    fitBounds() {}
    easeTo() {}
    getBounds() {
      return { contains: () => true };
    }
    remove() {}
  }
  class AttributionControl {}
  class NavigationControl {}
  return {
    cargarMaplibre: async () => ({ Map, Marker, LngLatBounds, AttributionControl, NavigationControl }),
    plegarAtribucion: () => {},
  };
});

import MapaSeguimiento from "./MapaSeguimiento";

const DESTINO = { latitud: -17.76, longitud: -63.18 };
const LOCAL = { latitud: -17.7496, longitud: -63.1748 };

const vivos = (letra: string) => marcadores.filter((m) => m.letra === letra && !m.quitado);

function montar(moto: { latitud: number; longitud: number } | null) {
  return <MapaSeguimiento destino={DESTINO} local={LOCAL} moto={moto} color="#B4501A" />;
}

beforeEach(() => {
  marcadores.length = 0;
});

describe("el mapa del seguimiento", () => {
  it("con posición dibuja la moto y la mueve cuando llega otra", async () => {
    const { rerender } = render(montar({ latitud: -17.755, longitud: -63.178 }));
    await waitFor(() => expect(vivos("M")).toHaveLength(1));
    rerender(montar({ latitud: -17.756, longitud: -63.179 }));
    await waitFor(() => expect(vivos("M")[0].lngLat).toEqual([-63.179, -17.756]));
    expect(vivos("M")).toHaveLength(1);
  });

  it("cuando la posición se esconde (viene null) la moto desaparece del mapa", async () => {
    const { rerender } = render(montar({ latitud: -17.755, longitud: -63.178 }));
    await waitFor(() => expect(vivos("M")).toHaveLength(1));
    rerender(montar(null));
    await waitFor(() => expect(vivos("M")).toHaveLength(0));
    // La casa y el local siguen donde estaban.
    expect(vivos("C")).toHaveLength(1);
    expect(vivos("L")).toHaveLength(1);
  });

  it("y vuelve cuando el repartidor retoma la señal", async () => {
    const { rerender } = render(montar({ latitud: -17.755, longitud: -63.178 }));
    await waitFor(() => expect(vivos("M")).toHaveLength(1));
    rerender(montar(null));
    await waitFor(() => expect(vivos("M")).toHaveLength(0));
    rerender(montar({ latitud: -17.757, longitud: -63.18 }));
    await waitFor(() => expect(vivos("M")).toHaveLength(1));
  });
});
