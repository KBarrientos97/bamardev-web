import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El pin del cliente cuando el GPS contesta ANTES de que el mapa termine de
 * bajarse (PW-11): el formulario ya tenía el pin y el mapa nacía sin él.
 * MapLibre se simula; la carga del mapa se suelta a mano.
 */

const mapa = vi.hoisted(() => ({
  pines: [] as { lngLat: number[] }[],
  soltar: () => {},
}));

vi.mock("../../lib/mapa", () => {
  class Marker {
    registro = { lngLat: [] as number[] };
    constructor() {
      mapa.pines.push(this.registro);
    }
    setLngLat(p: number[]) {
      this.registro.lngLat = p;
      return this;
    }
    addTo() {
      return this;
    }
    on() {}
    getLngLat() {
      return { lat: 0, lng: 0 };
    }
  }
  class Map {
    addControl() {}
    on() {}
    flyTo() {}
    getZoom() {
      return 14;
    }
    remove() {}
  }
  class AttributionControl {}
  class NavigationControl {}
  return {
    TEXTOS_MAPA: {},
    cargarMaplibre: () =>
      new Promise((resolver) => {
        mapa.soltar = () => resolver({ Map, Marker, AttributionControl, NavigationControl });
      }),
    plegarAtribucion: () => {},
    redondear: (u: unknown) => u,
    SANTA_CRUZ: { lat: -17.78, lng: -63.18 },
  };
});

import ElegirPin from "./ElegirPin";

beforeEach(() => {
  mapa.pines.length = 0;
});

describe("el pin del mapa", () => {
  it("si el GPS contestó antes de que el mapa cargara, el pin aparece igual cuando carga", async () => {
    const { rerender } = render(<ElegirPin valor={null} centro={{ lat: -17.75, lng: -63.17 }} onCambio={() => {}} />);
    // El GPS responde con el mapa todavía bajándose.
    rerender(<ElegirPin valor={{ lat: -17.77, lng: -63.18 }} centro={{ lat: -17.75, lng: -63.17 }} onCambio={() => {}} />);
    expect(mapa.pines).toHaveLength(0);
    mapa.soltar();
    await waitFor(() => expect(mapa.pines).toHaveLength(1));
    expect(mapa.pines[0].lngLat).toEqual([-63.18, -17.77]);
  });

  it("sin pin todavía, el mapa nace sin pin", async () => {
    render(<ElegirPin valor={null} onCambio={() => {}} />);
    mapa.soltar();
    await new Promise((r) => setTimeout(r, 20));
    expect(mapa.pines).toHaveLength(0);
  });
});
