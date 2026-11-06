import { describe, expect, it } from "vitest";
import { enPollos, presasVendidas, textoPollos, textoPollosCorto } from "./pollos";

describe("los pollos que salieron", () => {
  it("diez presas sueltas son un pollo y dos presas (el ejemplo de Kevin)", () => {
    // Broaster económico, 10 vendidos: 8 presas = 1 pollo, y sobran 2.
    expect(enPollos(presasVendidas([{ cantidad: 10, presas: 1 }]))).toEqual({ pollos: 1, presas: 2 });
    expect(textoPollos(10)).toBe("1 pollo y 2 presas");
  });

  it("suma cantidad por presas de cada plato, y lo que no lleva pollo no cuenta", () => {
    const presas = presasVendidas([
      { cantidad: 10, presas: 1 }, // económico
      { cantidad: 8, presas: 2 }, // cuarto
      { cantidad: 6, presas: 4 }, // medio
      { cantidad: 5, presas: 8 }, // entero
      { cantidad: 2 }, // Coca Cola: sin presas
      { cantidad: 1, presas: null },
    ]);
    expect(presas).toBe(10 + 16 + 24 + 40);
    expect(textoPollos(presas)).toBe("11 pollos y 2 presas");
  });

  it("sin nada que lleve pollo no dice «0 pollos»", () => {
    expect(presasVendidas([{ cantidad: 3 }])).toBe(0);
    expect(textoPollos(0)).toBeNull();
    expect(textoPollosCorto(0)).toBe("—");
  });

  it("singular y plural", () => {
    expect(textoPollos(8)).toBe("1 pollo");
    expect(textoPollos(16)).toBe("2 pollos");
    expect(textoPollos(1)).toBe("1 presa");
    expect(textoPollos(9)).toBe("1 pollo y 1 presa");
  });

  it("la celda de la tabla es corta", () => {
    expect(textoPollosCorto(40)).toBe("5");
    expect(textoPollosCorto(10)).toBe("1 y 2 pr.");
    expect(textoPollosCorto(3)).toBe("3 pr.");
  });
});
