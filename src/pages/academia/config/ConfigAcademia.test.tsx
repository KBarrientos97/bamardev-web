import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La Configuración del instituto (26-oct): una entrada en el menú y una
 * pestaña por pantalla. Fuera de la academia, Almacenes queda como siempre.
 */

const sesion = { rubro: "ACADEMIA", puede: (_: string) => true };
vi.mock("../../../store/AuthContext", () => ({ useAuth: () => sesion }));
vi.mock("../../../lib/academia/usePalabras", () => ({
  usePalabras: () => ({ Carreras: "Cursos", Sedes: "Sedes", docente: "docente" }),
}));

import { ConPestanasConfig, InicioConfig } from "./ConfigAcademia";

function Donde() {
  return <p data-testid="donde">{useLocation().pathname}</p>;
}

function montar(ruta: string) {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/academia/configuracion" element={<InicioConfig />} />
        <Route
          path="*"
          element={
            <ConPestanasConfig>
              <Donde />
            </ConPestanasConfig>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sesion.rubro = "ACADEMIA";
  sesion.puede = () => true;
});

describe("Configuración del instituto", () => {
  it("una pestaña por pantalla, encendida la de la ruta", () => {
    montar("/inventario/almacenes");
    const nav = screen.getByRole("navigation", { name: "Configuración del instituto" });
    expect(Array.from(nav.querySelectorAll("a"), (a) => a.textContent)).toEqual(["Cursos", "Sedes", "Planilla docentes", "Ajustes"]);
    expect(screen.getByRole("link", { name: "Sedes" })).toHaveAttribute("aria-current", "page");
  });

  it("cada quien ve sólo las pestañas de lo que puede, y la entrada lleva a la primera", () => {
    sesion.puede = (s: string) => s === "academia_planilla" || s === "academia_ajustes";
    montar("/academia/configuracion");
    expect(screen.getByTestId("donde")).toHaveTextContent("/academia/planilla");
    expect(screen.queryByRole("link", { name: "Cursos" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ajustes" })).toBeInTheDocument();
  });

  it("fuera del instituto Almacenes queda como siempre: sin pestañas", () => {
    sesion.rubro = "RESTAURANTE";
    montar("/inventario/almacenes");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.getByTestId("donde")).toHaveTextContent("/inventario/almacenes");
  });
});
