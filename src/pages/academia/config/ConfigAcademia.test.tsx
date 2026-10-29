import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La Configuración del instituto (26-oct): una entrada en el menú y una
 * pestaña por pantalla. Fuera de la academia, Almacenes queda como siempre.
 */

const sesion = { rubro: "ACADEMIA", puede: (_: string) => true, usuario: { permisos: [] as string[] }, negocio: { id: 20, features: ["academia"] } };
vi.mock("../../../store/AuthContext", () => ({ useAuth: () => sesion }));
vi.mock("../../../lib/academia/usePalabras", () => ({
  usePalabras: () => ({ Carreras: "Cursos", Sedes: "Sedes", docente: "docente" }),
}));

vi.mock("../../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/api")>();
  return { ...real, api: { ...real.api, getAlmacenes: vi.fn().mockResolvedValue([]) } };
});

vi.mock("../../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: {
      sedes: vi.fn().mockResolvedValue([]),
      ajustes: vi.fn().mockResolvedValue({ franjas: [] }),
      carreras: vi.fn().mockResolvedValue([]),
      docentes: vi.fn().mockResolvedValue([]),
      grupos: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }),
    },
  };
});

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
  localStorage.clear();
  sesion.rubro = "ACADEMIA";
  sesion.puede = () => true;
  sesion.usuario.permisos = [];
});

describe("Configuración del instituto", () => {
  it("una pestaña por pantalla, encendida la de la ruta", () => {
    montar("/configuracion/sedes");
    const nav = screen.getByRole("navigation", { name: "Configuración del instituto" });
    // Sin pestaña «Aulas» suelta: las aulas viven dentro de cada sede (WEB-8).
    expect(Array.from(nav.querySelectorAll("a"), (a) => a.textContent)).toEqual(["Cursos", "Sedes", "Planilla docentes", "Ajustes"]);
    expect(screen.getByRole("link", { name: "Sedes" })).toHaveAttribute("aria-current", "page");
  });

  it("cada quien ve sólo las pestañas de lo que puede, y la entrada lleva a la primera", () => {
    sesion.puede = (s: string) => s === "academia_planilla" || s === "academia_ajustes";
    montar("/academia/configuracion");
    // Sedes comparte la sección de Ajustes (academia.configurar) y va antes que la planilla.
    expect(screen.getByTestId("donde")).toHaveTextContent("/configuracion/sedes");
    expect(screen.getByRole("link", { name: "Sedes" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Aulas" })).not.toBeInTheDocument();
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

describe("L1 · «Configuración rápida» a la derecha de las pestañas", () => {
  const boton = () => screen.queryByRole("button", { name: /^Configuración rápida/ });

  it("quien configura el instituto ve el botón (no una tarjeta) mientras falten pasos", async () => {
    sesion.usuario.permisos = ["academia.configurar"];
    montar("/configuracion/academia");
    await act(async () => {});
    expect(boton()).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Primeros pasos" })).not.toBeInTheDocument();
  });

  it("quien no configura no lo ve", async () => {
    montar("/configuracion/academia");
    await act(async () => {});
    expect(boton()).not.toBeInTheDocument();
  });

  it("fuera del instituto no existe", async () => {
    sesion.rubro = "RESTAURANTE";
    sesion.usuario.permisos = ["academia.configurar"];
    montar("/inventario/almacenes");
    await act(async () => {});
    expect(boton()).not.toBeInTheDocument();
  });
});
