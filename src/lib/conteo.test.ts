import { describe, expect, it } from "vitest";
import {
  conteoEnUso,
  cuadra,
  fraseContar,
  lineasCambiadas,
  mismoConteo,
  nombreConteo,
  normalizarConfigConteo,
} from "./conteo";

describe("nombreConteo y fraseContar", () => {
  it("sin nombre se lee «Unidades»", () => {
    expect(nombreConteo(null)).toBe("Unidades");
    expect(nombreConteo("   ")).toBe("Unidades");
  });

  it("el nombre se recorta y se respeta", () => {
    expect(nombreConteo("  Vasos ")).toBe("Vasos");
  });

  it("la frase con verbo baja la primera letra", () => {
    expect(fraseContar("Vasos")).toBe("Contar vasos");
    expect(fraseContar(undefined)).toBe("Contar unidades");
    expect(fraseContar("Cajas de pizza")).toBe("Contar cajas de pizza");
  });
});

describe("normalizarConfigConteo", () => {
  it.each([undefined, null, "x", 3])("sin un objeto (%s): apagado", (crudo) => {
    expect(normalizarConfigConteo(crudo)).toEqual({ activo: false, nombre: "Unidades", categorias: [] });
  });

  it("lo que viene bien se respeta y la basura de las categorías se descarta", () => {
    const c = normalizarConfigConteo({
      activo: true,
      nombre: "Vasos",
      categorias: [{ id: 1, nombre: "C" }, { id: "2", nombre: "M" }, null, { id: 3 }],
    });
    expect(c).toEqual({ activo: true, nombre: "Vasos", categorias: [{ id: 1, nombre: "C" }] });
  });

  it("devuelve copias: tocar el resultado no cambia lo de fábrica", () => {
    normalizarConfigConteo(null).categorias.push({ id: 9, nombre: "X" });
    expect(normalizarConfigConteo(null).categorias).toEqual([]);
  });
});

describe("conteoEnUso y mismoConteo", () => {
  it("prendido sin categorías no cuenta nada", () => {
    expect(conteoEnUso({ activo: true, nombre: "Vasos", categorias: [] })).toBe(false);
    expect(conteoEnUso({ activo: false, nombre: "Vasos", categorias: [{ id: 1, nombre: "C" }] })).toBe(false);
    expect(conteoEnUso({ activo: true, nombre: "Vasos", categorias: [{ id: 1, nombre: "C" }] })).toBe(true);
  });

  it("compara por contenido y por orden", () => {
    const a = { activo: true, nombre: "V", categorias: [{ id: 1, nombre: "C" }, { id: 2, nombre: "M" }] };
    expect(mismoConteo(a, { ...a, categorias: [...a.categorias] })).toBe(true);
    expect(mismoConteo(a, { ...a, categorias: [a.categorias[1], a.categorias[0]] })).toBe(false);
  });
});

describe("lineasCambiadas: lo que viaja en la apertura", () => {
  it("una fila que el cajero no tocó no viaja", () => {
    // A propósito: mandar todo pisaría el saldo con una foto vieja de la pantalla.
    expect(lineasCambiadas([{ categoriaId: 1, quedaban: 20, cantidad: 20 }])).toEqual([]);
  });

  it("una fila con otro número viaja (le quedaban 20 y repuso hasta 100)", () => {
    expect(lineasCambiadas([{ categoriaId: 1, quedaban: 20, cantidad: 100 }])).toEqual([
      { categoriaId: 1, cantidad: 100 },
    ]);
  });

  it("una que nunca se contó y ahora tiene número viaja, aunque sea 0", () => {
    expect(lineasCambiadas([{ categoriaId: 2, quedaban: null, cantidad: 0 }])).toEqual([
      { categoriaId: 2, cantidad: 0 },
    ]);
  });

  it("una que nunca se contó y sigue vacía no viaja", () => {
    expect(lineasCambiadas([{ categoriaId: 2, quedaban: null, cantidad: null }])).toEqual([]);
  });

  it("si lo que quedaba era negativo y el cajero lo deja, no viaja; si escribe un número, sí", () => {
    expect(lineasCambiadas([{ categoriaId: 1, quedaban: -3, cantidad: null }])).toEqual([]);
    expect(lineasCambiadas([{ categoriaId: 1, quedaban: -3, cantidad: 0 }])).toEqual([{ categoriaId: 1, cantidad: 0 }]);
  });

  it("un número negativo o roto no viaja", () => {
    expect(
      lineasCambiadas([
        { categoriaId: 1, quedaban: 5, cantidad: -1 },
        { categoriaId: 2, quedaban: 5, cantidad: NaN },
      ]),
    ).toEqual([]);
  });
});

describe("cuadra", () => {
  it("al abrir + repuesto − vendido = quedan: cuadra", () => {
    expect(cuadra({ alAbrir: 100, repuesto: 20, vendido: 30, quedan: 90 })).toBe(true);
  });

  it("si el local vendió en otra caja, no cuadra", () => {
    expect(cuadra({ alAbrir: 100, repuesto: 0, vendido: 30, quedan: 60 })).toBe(false);
  });

  it("sin con qué comparar (sin contar) no se avisa nada", () => {
    expect(cuadra({ alAbrir: null, repuesto: 0, vendido: 3, quedan: null })).toBe(true);
    expect(cuadra({ alAbrir: 10, repuesto: 0, vendido: 3, quedan: null })).toBe(true);
  });

  it("los decimales de más no cuentan", () => {
    expect(cuadra({ alAbrir: 10, repuesto: 0, vendido: 0.1 + 0.2, quedan: 9.7 })).toBe(true);
  });
});
