import { describe, expect, it } from "vitest";
import { evaluarSucursales, motivoSinCobertura, sucursalMasCercana } from "./sucursal";
import { TARIFA_POR_DEFECTO } from "./tarifa";
import type { SucursalPedido } from "./tipos";

const suc = (id: number, nombre: string, latitud: number | null, abierta = true): SucursalPedido => ({
  id,
  nombre,
  latitud,
  longitud: latitud == null ? null : -63.18,
  abierta,
  tarifa: TARIFA_POR_DEFECTO,
});

// Cada 0,01° de latitud son ~1,45 km por calles.
const BRISAS = suc(3, "Las Brisas", -17.75);
const CENTRO = suc(4, "Centro", -17.78);
const NORTE = suc(5, "Norte", -17.7);
const PIN = { latitud: -17.77, longitud: -63.18 };

describe("la sucursal más cercana", () => {
  it("elige la más cerca del pin", () => {
    const e = sucursalMasCercana(PIN, [BRISAS, CENTRO, NORTE]);
    expect(e?.sucursal.nombre).toBe("Centro");
    expect(e?.envio).toBe(7);
  });

  it("salta la que está cerrada, aunque sea la más cerca", () => {
    const e = sucursalMasCercana(PIN, [BRISAS, { ...CENTRO, abierta: false }, NORTE]);
    expect(e?.sucursal.nombre).toBe("Las Brisas");
  });

  it("salta la que deja el pin fuera de su zona", () => {
    const cortita = { ...CENTRO, tarifa: { ...TARIFA_POR_DEFECTO, maxKm: 1 } };
    const e = sucursalMasCercana(PIN, [cortita, BRISAS]);
    expect(e?.sucursal.nombre).toBe("Las Brisas");
  });

  it("una sucursal sin coordenadas no sirve para delivery", () => {
    const e = sucursalMasCercana(PIN, [suc(9, "Sin mapa", null), BRISAS]);
    expect(e?.sucursal.nombre).toBe("Las Brisas");
  });

  it("sin pin no hay sugerencia; con todas cerradas tampoco", () => {
    expect(sucursalMasCercana(null, [BRISAS])).toBeNull();
    expect(sucursalMasCercana(PIN, [{ ...BRISAS, abierta: false }])).toBeNull();
  });

  it("devuelve todas ordenadas: primero las que atienden, de cerca a lejos", () => {
    const lista = evaluarSucursales(PIN, [NORTE, { ...CENTRO, abierta: false }, BRISAS]);
    expect(lista.map((e) => e.sucursal.nombre)).toEqual(["Las Brisas", "Norte", "Centro"]);
    expect(lista.map((e) => e.atiende)).toEqual([true, true, false]);
    // El índice sigue siendo el de la lista original (el del catálogo de la página).
    expect(lista.map((e) => e.indice)).toEqual([2, 0, 1]);
  });
});

describe("por qué no hay cobertura", () => {
  it("fuera de la zona", () => {
    const lejos = { latitud: -17.2, longitud: -63.18 };
    expect(motivoSinCobertura(lejos, [BRISAS, CENTRO])).toMatch(/fuera de la zona/);
  });

  it("cerrados", () => {
    expect(motivoSinCobertura(PIN, [{ ...BRISAS, abierta: false }])).toMatch(/cerrados/);
  });

  it("sin coordenadas en ninguna: sólo recoger", () => {
    expect(motivoSinCobertura(PIN, [suc(1, "A", null)])).toMatch(/recoger/);
  });

  it("si alguna atiende, o no hay pin, no hay motivo", () => {
    expect(motivoSinCobertura(PIN, [BRISAS])).toBeNull();
    expect(motivoSinCobertura(null, [BRISAS])).toBeNull();
  });
});
