import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MarcaPlataforma from "../../components/MarcaPlataforma";
import { colorDeHex, PALETA } from "../colores/paleta";
import { colorDePlataforma, estiloDePlataforma } from "./marca";
import { PLATAFORMAS } from "./tipos";

/** La marca de plataforma (PLAN-PEDIDOS-PLATAFORMA §10.4): texto siempre, tono de la paleta única. */
describe("la marca de plataforma", () => {
  it("cada tono es un color de la paleta única, no un hex inventado", () => {
    for (const p of PLATAFORMAS) {
      const c = colorDeHex(colorDePlataforma(p));
      expect(c, p).not.toBeNull();
      expect(PALETA).toContain(c);
    }
  });

  it("Yango en la familia roja/rosa y PedidosYa en la naranja/ámbar", () => {
    expect(["Rojo", "Rosa"]).toContain(colorDeHex(colorDePlataforma("YANGO"))!.familia);
    expect(["Naranja", "Amarillo"]).toContain(colorDeHex(colorDePlataforma("PEDIDOS_YA"))!.familia);
  });

  it("son los mismos hex que Android: Rojo #C0262D y Naranja #B4501A", () => {
    expect(colorDePlataforma("YANGO")).toBe("#C0262D");
    expect(colorDePlataforma("PEDIDOS_YA")).toBe("#B4501A");
  });

  it("la letra es el color pleno y el fondo una tinta suave del mismo", () => {
    const e = estiloDePlataforma("YANGO");
    expect(e.color).toBe(colorDePlataforma("YANGO"));
    expect(e.backgroundColor.startsWith(e.color)).toBe(true);
  });

  it("el texto va siempre: «Yango» y «PedidosYa»", () => {
    render(
      <>
        <MarcaPlataforma plataforma="YANGO" />
        <MarcaPlataforma plataforma="PEDIDOS_YA" />
      </>,
    );
    expect(screen.getByText("Yango")).toBeInTheDocument();
    expect(screen.getByText("PedidosYa")).toBeInTheDocument();
  });
});
