import { describe, expect, it } from "vitest";
import { aplicarOrden, reordenarVisibles } from "./ordenPos";

/**
 * El cajero acomoda la grilla del POS a su gusto. Lo delicado es que puede
 * hacerlo con la grilla FILTRADA (una categoría o una búsqueda): mover algo
 * dentro de "Pollos" no puede reacomodar el resto del catálogo.
 *
 * Son los mismos ocho casos de `OrdenProductosPosTest.kt` (Android): si una
 * regla cambia en un lado, acá tiene que fallar algo.
 */
describe("ordenPos", () => {
  interface P {
    id: number;
  }
  const productos = (...ids: number[]): P[] => ids.map((id) => ({ id }));
  const idDe = (p: P) => p.id;

  it("sin orden guardado respeta el que trajo el backend", () => {
    const backend = productos(1, 2, 3);
    expect(aplicarOrden(backend, [], idDe)).toEqual(backend);
  });

  it("aplica el orden guardado", () => {
    const r = aplicarOrden(productos(1, 2, 3), [3, 1, 2], idDe);
    expect(r.map(idDe)).toEqual([3, 1, 2]);
  });

  it("un producto nuevo del backend va al final y no desaparece", () => {
    // 9 se creó después de que el cajero acomodara la grilla.
    const r = aplicarOrden(productos(1, 2, 9), [2, 1], idDe);
    expect(r.map(idDe)).toEqual([2, 1, 9]);
  });

  it("varios productos nuevos conservan entre sí el orden del backend", () => {
    const r = aplicarOrden(productos(1, 8, 9), [1], idDe);
    expect(r.map(idDe)).toEqual([1, 8, 9]);
  });

  it("reordenar sin filtro reemplaza el orden completo", () => {
    const r = reordenarVisibles(productos(1, 2, 3), [3, 2, 1], idDe);
    expect(r?.map(idDe)).toEqual([3, 2, 1]);
  });

  it("reordenar filtrado sólo toca las posiciones de los visibles", () => {
    // Catálogo: 1,2,3,4,5. Visibles (una categoría): 2 y 4, invertidos.
    // 1, 3 y 5 tienen que quedarse exactamente donde estaban.
    const r = reordenarVisibles(productos(1, 2, 3, 4, 5), [4, 2], idDe);
    expect(r?.map(idDe)).toEqual([1, 4, 3, 2, 5]);
  });

  it("no guarda nada si los visibles no calzan con el catálogo", () => {
    // El catálogo se recargó mientras se arrastraba: el id 99 ya no existe.
    expect(reordenarVisibles(productos(1, 2, 3), [1, 99], idDe)).toBeNull();
  });

  it("sin visibles no hay nada que guardar", () => {
    expect(reordenarVisibles(productos(1, 2), [], idDe)).toBeNull();
  });

  it("no muta la lista que recibe", () => {
    // React compara por referencia: mutar el array del estado haría que la
    // grilla no se repinte tras arrastrar.
    const backend = productos(1, 2, 3);
    aplicarOrden(backend, [3, 2, 1], idDe);
    reordenarVisibles(backend, [3, 2, 1], idDe);
    expect(backend.map(idDe)).toEqual([1, 2, 3]);
  });
});
