import { describe, expect, it } from "vitest";
import { coordsDeEnlace, pinDeEntrega, pinImpreciso, urlBuscarEnMaps, urlWazeBuscar } from "./ubicacionEntrega";

/**
 * Dónde se entrega un delivery: el pin de la venta, o el del pedido de la
 * página con un backend anterior; y el punto de un enlace de Google Maps que
 * la cajera pega del WhatsApp del cliente.
 */

describe("pinDeEntrega", () => {
  it("el de la venta primero, con su precisión", () => {
    expect(pinDeEntrega({ latitud: -17.78, longitud: -63.18, precisionM: 40 })).toEqual({ lat: -17.78, lng: -63.18, precisionM: 40 });
  });

  it("sin el de la venta (backend anterior), el del pedido de la página", () => {
    expect(pinDeEntrega({ pedidoWeb: { latitud: -17.7, longitud: -63.1 } })).toEqual({ lat: -17.7, lng: -63.1, precisionM: null });
  });

  it("sin coordenadas, o con un (0, 0) o algo fuera de rango, no hay pin", () => {
    expect(pinDeEntrega({})).toBeNull();
    expect(pinDeEntrega({ latitud: null, longitud: null, pedidoWeb: null })).toBeNull();
    expect(pinDeEntrega({ latitud: 0, longitud: 0 })).toBeNull();
    expect(pinDeEntrega({ latitud: 120, longitud: -63 })).toBeNull();
  });

  it("más de 100 m de precisión es un pin dudoso", () => {
    expect(pinImpreciso({ lat: 1, lng: 1, precisionM: 150 })).toBe(true);
    expect(pinImpreciso({ lat: 1, lng: 1, precisionM: 30 })).toBe(false);
    expect(pinImpreciso({ lat: 1, lng: 1, precisionM: null })).toBe(false);
    expect(pinImpreciso(null)).toBe(false);
  });
});

describe("coordsDeEnlace", () => {
  it("el enlace largo de Google Maps: el lugar marcado antes que el centro de la vista", () => {
    expect(
      coordsDeEnlace("https://www.google.com/maps/place/Calle+Sucre/@-17.7800000,-63.1800000,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-17.7834123!4d-63.1821456"),
    ).toEqual({ lat: -17.783412, lng: -63.182146 });
    expect(coordsDeEnlace("https://www.google.com/maps/@-17.78,-63.18,15z")).toEqual({ lat: -17.78, lng: -63.18 });
  });

  it("q=, query= y destination=, también codificados", () => {
    expect(coordsDeEnlace("https://maps.google.com/?q=-17.7834,-63.1821")).toEqual({ lat: -17.7834, lng: -63.1821 });
    expect(coordsDeEnlace("https://www.google.com/maps/search/?api=1&query=-17.7834%2C-63.1821")).toEqual({ lat: -17.7834, lng: -63.1821 });
    expect(coordsDeEnlace("https://www.google.com/maps/dir/?api=1&destination=-17.78,-63.18")).toEqual({ lat: -17.78, lng: -63.18 });
  });

  it("las coordenadas sueltas, como las copia la app de Maps", () => {
    expect(coordsDeEnlace("  -17.7834, -63.1821 ")).toEqual({ lat: -17.7834, lng: -63.1821 });
  });

  it("un enlace corto, un texto cualquiera o un «%» suelto no dan punto (ni rompen)", () => {
    expect(coordsDeEnlace("https://maps.app.goo.gl/AbCdEf123")).toBeNull();
    expect(coordsDeEnlace("Calle Sucre 450")).toBeNull();
    expect(coordsDeEnlace("100% -17,78")).toBeNull();
    expect(coordsDeEnlace("")).toBeNull();
  });
});

describe("buscar sin pin", () => {
  it("Maps y Waze por la dirección escrita", () => {
    expect(urlBuscarEnMaps("Calle Sucre 450")).toBe("https://www.google.com/maps/search/?api=1&query=Calle%20Sucre%20450");
    expect(urlWazeBuscar("Calle Sucre 450")).toBe("https://waze.com/ul?q=Calle%20Sucre%20450&navigate=yes");
  });
});
