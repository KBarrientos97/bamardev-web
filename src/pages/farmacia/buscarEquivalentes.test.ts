import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";

/**
 * La lógica de los equivalentes (#11): qué se le pide al backend y en qué
 * orden se ofrecen. La pieza que los dibuja se prueba en `Equivalentes.test.tsx`.
 */

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  request: vi.fn(),
}));

import { request } from "../../lib/api";
import {
  drogaDe,
  ordenarEquivalentes,
  pedirEquivalentes,
  textoStock,
  tienePrincipioActivo,
} from "./buscarEquivalentes";

function med(over: Partial<Producto>): Producto {
  return {
    id: 1,
    nombre: "Ibuprofeno 400 mg",
    descripcion: null,
    codBarra: null,
    tipoProducto: "ALMACENABLE",
    precio: 0.7,
    costo: 0.3,
    stockMinimo: 10,
    habilitado: true,
    icono: null,
    categoria: null,
    unidadMedida: null,
    stockTotal: 180,
    componentes: [],
    principioActivo: "Ibuprofeno",
    concentracion: "400 mg",
    formaFarmaceutica: "Comprimido",
    laboratorio: "INTI",
    registroSanitario: null,
    condicionVenta: "LIBRE",
    manejaLote: true,
    controlado: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(request).mockResolvedValue([]);
});

describe("pedirEquivalentes", () => {
  it("pide los del medicamento con el stock y el precio de esa sucursal", async () => {
    await pedirEquivalentes(42, 917);
    expect(request).toHaveBeenCalledWith("/productos/42/equivalentes?sucursalId=917");
  });

  it("sin sucursal no manda el parámetro: el backend usa la de quien pregunta", async () => {
    await pedirEquivalentes(42, null);
    expect(request).toHaveBeenCalledWith("/productos/42/equivalentes");
  });
});

describe("el orden", () => {
  it("primero lo que se puede vender, y dentro de cada grupo el más barato", () => {
    // Ordenando sólo por precio, el más barato era justo el que no había: la
    // respuesta útil empieza por lo que hay y sale menos.
    const bago = med({ id: 1, laboratorio: "BAGÓ", precio: 0.6, stockTotal: 0 });
    const inti = med({ id: 2, laboratorio: "INTI", precio: 0.45, stockTotal: 120 });
    // Sólo cajas vencidas: en el estante, pero no se venden.
    const ifa = med({ id: 3, laboratorio: "IFA", precio: 0.4, stockTotal: 6, stockVencido: 6 });
    const lafar = med({ id: 4, laboratorio: "LAFAR", precio: 0.5, stockTotal: 30 });

    expect(ordenarEquivalentes([bago, inti, ifa, lafar]).map((p) => p.laboratorio)).toEqual([
      "INTI",
      "LAFAR",
      "IFA",
      "BAGÓ",
    ]);
  });

  it("a igual precio va por nombre, y no toca la lista que recibió", () => {
    const b = med({ id: 1, nombre: "Zetalgin", precio: 0.5 });
    const a = med({ id: 2, nombre: "Algiflex", precio: 0.5 });
    const lista = [b, a];
    expect(ordenarEquivalentes(lista).map((p) => p.nombre)).toEqual(["Algiflex", "Zetalgin"]);
    expect(lista[0]).toBe(b);
  });
});

describe("el stock que se le dice al cliente", () => {
  it("cuánto hay, Agotado, Vencido o que no se vende acá", () => {
    expect(textoStock(med({ stockTotal: 120 }))).toEqual({ texto: "120 u.", sinStock: false });
    expect(textoStock(med({ stockTotal: 0 }))).toEqual({ texto: "Agotado", sinStock: true });
    // Lo vencido sigue en el estante pero no se vende: cuenta como "no hay"
    // y dice por qué, como la tarjeta del punto de venta.
    expect(textoStock(med({ stockTotal: 6, stockVencido: 6 }))).toEqual({
      texto: "Vencido",
      sinStock: true,
    });
    expect(textoStock(med({ stockTotal: 10, stockVencido: 4 }))).toEqual({
      texto: "6 u.",
      sinStock: false,
    });
    expect(textoStock(med({ stockTotal: 10, disponible: false }))).toEqual({
      texto: "No se vende acá",
      sinStock: true,
    });
  });
});

describe("la droga", () => {
  it("un principio activo en blanco cuenta como no cargado", () => {
    expect(tienePrincipioActivo({ principioActivo: null })).toBe(false);
    expect(tienePrincipioActivo({ principioActivo: "   " })).toBe(false);
    expect(tienePrincipioActivo({ principioActivo: "Ibuprofeno" })).toBe(true);
  });

  it("drogaDe junta droga y concentración, o la droga sola", () => {
    expect(drogaDe({ principioActivo: "Ibuprofeno", concentracion: "400 mg" })).toBe(
      "Ibuprofeno 400 mg",
    );
    expect(drogaDe({ principioActivo: "Ibuprofeno", concentracion: null })).toBe("Ibuprofeno");
  });
});
