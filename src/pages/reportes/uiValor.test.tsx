import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { claseDelValor, KpiR } from "./ui";

/**
 * El número principal de una tarjeta de Reportes se lee ENTERO en el celular
 * (QA de plataformas, ronda 2): sin «…», achica por tramos y, si no entra,
 * baja de renglón. La tarjeta es de todos los reportes.
 */
describe("KpiR: el valor no se corta", () => {
  it("el número no lleva `truncate` y puede bajar de renglón", () => {
    render(
      <MemoryRouter>
        <KpiR etiqueta="Ingresos totales" valor="Bs 509.000,00" />
      </MemoryRouter>,
    );
    const valor = screen.getByText("Bs 509.000,00");
    expect(valor.className).not.toContain("truncate");
    expect(valor.className).toContain("break-words");
  });

  it("la etiqueta larga tampoco se corta", () => {
    render(
      <MemoryRouter>
        <KpiR etiqueta="Ingresos totales del período" valor="1" />
      </MemoryRouter>,
    );
    expect(screen.getByText("Ingresos totales del período").className).not.toContain("truncate");
  });

  it("achica la letra según el largo (más cifras, letra más chica)", () => {
    expect(claseDelValor("Bs 5,00")).toBe("text-[22px]");
    expect(claseDelValor("Bs 130,00")).toBe("text-[20px]");
    expect(claseDelValor("Bs 5.090,00")).toBe("text-[20px]");
    expect(claseDelValor("Bs 50.900,00")).toBe("text-[18px]");
    expect(claseDelValor("Bs 509.000,00")).toBe("text-[18px]");
    expect(claseDelValor("Bs 5.090.000,00")).toBe("text-[15px]");
  });

  it("un valor envuelto en un elemento se mide por su texto (el «+Bs 70,00» del neto)", () => {
    expect(claseDelValor(<span>Bs 1,00</span>)).toBe("text-[22px]");
    expect(claseDelValor(<span>+Bs 70,00</span>)).toBe("text-[20px]");
    expect(claseDelValor(<b>{["Bs ", 509000, ",00"]}</b>)).toBe("text-[18px]");
    expect(claseDelValor(null)).toBe("text-[22px]");
  });
});
