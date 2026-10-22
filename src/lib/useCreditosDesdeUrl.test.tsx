import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { EVENTO_HOJA_CUPO } from "./hojaCupo";
import { pideComprarCreditos, useCreditosDesdeUrl } from "./useCreditosDesdeUrl";

/**
 * `?creditos=comprar` (a donde llevan las push del cupo) abre la hoja de
 * comprar créditos una vez y se saca de la dirección.
 */

function Donde() {
  const { pathname, search } = useLocation();
  return <p data-testid="donde">{`${pathname}${search}`}</p>;
}

/** Como el Layout: el hook arriba y las pantallas adentro. */
function Marco() {
  useCreditosDesdeUrl();
  return (
    <>
      <Routes>
        {/* Igual que `Inicio`: "/" redirige y pierde el parámetro. */}
        <Route path="/" element={<Navigate to="/pos" replace />} />
        <Route path="*" element={null} />
      </Routes>
      <Donde />
    </>
  );
}

let pedidos: number;
const contar = () => {
  pedidos++;
};

beforeEach(() => {
  pedidos = 0;
  window.addEventListener(EVENTO_HOJA_CUPO, contar);
});
afterEach(() => window.removeEventListener(EVENTO_HOJA_CUPO, contar));

function abrirEn(ruta: string) {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Marco />
    </MemoryRouter>,
  );
}

describe("comprar créditos desde la dirección", () => {
  it("lee sólo creditos=comprar", () => {
    expect(pideComprarCreditos("?creditos=comprar")).toBe(true);
    expect(pideComprarCreditos("?x=1&creditos=comprar")).toBe(true);
    expect(pideComprarCreditos("?creditos=ver")).toBe(false);
    expect(pideComprarCreditos("")).toBe(false);
  });

  it("en el inicio abre la hoja una vez y deja que siga a la pantalla de cada uno", async () => {
    abrirEn("/?creditos=comprar");
    expect(pedidos).toBe(1);
    expect(screen.getByTestId("donde")).toHaveTextContent(/^\/pos$/);
    // Ni un turno después vuelve a "/" (era el bug: quedaba en blanco).
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByTestId("donde")).toHaveTextContent(/^\/pos$/);
    expect(pedidos).toBe(1);
  });

  it("en otra pantalla abre la hoja y saca sólo ese parámetro", async () => {
    abrirEn("/reportes/ventas?desde=2026-10-01&creditos=comprar");
    expect(pedidos).toBe(1);
    await waitFor(() =>
      expect(screen.getByTestId("donde")).toHaveTextContent(/^\/reportes\/ventas\?desde=2026-10-01$/),
    );
    expect(pedidos).toBe(1);
  });

  it("sin el parámetro no abre nada", () => {
    abrirEn("/pos");
    expect(pedidos).toBe(0);
  });
});
