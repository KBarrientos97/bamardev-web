import { describe, expect, it } from "vitest";
import { altoMenu, ubicarMenu } from "./TarjetaMesa.datos";

const MENU = { ancho: 208, alto: altoMenu(6) };
const boton = (left: number, top: number) => ({ left, right: left + 36, top, bottom: top + 36 });

describe("ubicarMenu: el menú … se abre hacia donde hay lugar", () => {
  it("lo de siempre: alineado a la derecha del botón y para abajo", () => {
    expect(ubicarMenu(boton(700, 100), { ancho: 1024, alto: 768 }, MENU)).toEqual({
      horizontal: "derecha",
      vertical: "abajo",
    });
  });

  it("la tarjeta de la primera columna en una pantalla angosta: se abre hacia la derecha", () => {
    // QA del 13-oct: a la izquierda no entraban los 208 px y se cortaba.
    expect(ubicarMenu(boton(130, 100), { ancho: 700, alto: 768 }, MENU).horizontal).toBe("izquierda");
  });

  it("si no entra para ningún lado se queda como siempre", () => {
    expect(ubicarMenu(boton(100, 100), { ancho: 220, alto: 768 }, MENU).horizontal).toBe("derecha");
  });

  it("en la última fila se abre para arriba", () => {
    expect(ubicarMenu(boton(700, 700), { ancho: 1024, alto: 768 }, MENU).vertical).toBe("arriba");
  });

  it("si no entra ni arriba ni abajo, va para donde hay más lugar", () => {
    const corto = { ancho: 1024, alto: 300 };
    expect(ubicarMenu(boton(700, 60), corto, MENU).vertical).toBe("abajo");
    expect(ubicarMenu(boton(700, 200), corto, MENU).vertical).toBe("arriba");
  });
});
