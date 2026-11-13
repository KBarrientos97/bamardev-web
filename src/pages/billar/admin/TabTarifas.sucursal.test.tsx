import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BorradorTarifas } from "./borrador";

/**
 * La nota «valen para todos los locales» (PLAN-SUCURSAL-TOTAL §1): la ve quien
 * administra el negocio entero, no el asignado a un local ni quien tiene uno solo.
 */

const sesionSuc = vi.hoisted(() => ({ modo: "una" as "una" | "asignado" | "organizacion" }));

vi.mock("../../../lib/useSucursales", () => ({
  useSucursales: () => ({ modo: sesionSuc.modo, hayVarias: sesionSuc.modo !== "una" }),
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({ usuario: { id: 1, esAdministrador: true } }),
}));

import { TabTarifas } from "./TabTarifas";

const BORRADOR: BorradorTarifas = {
  tipos: [],
  avisos: [],
  sonido: false,
  voz: false,
  pin: { anularConsumo: false, anularMesa: false, pausar: false },
  horaCorteMin: 0,
};

const montar = () =>
  render(
    <TabTarifas b={BORRADOR} guardado={BORRADOR} errores={{}} mostrarErrores={false} onCambiar={() => {}} />,
  );

const NOTA = /valen para todos los locales/;

describe("TabTarifas: la nota de que valen para todos los locales", () => {
  beforeEach(() => {
    sesionSuc.modo = "una";
  });

  it("la organización con 2+ locales la ve", () => {
    sesionSuc.modo = "organizacion";
    montar();
    expect(screen.getByText(NOTA)).toBeInTheDocument();
  });

  it("el asignado a un local no la ve", () => {
    sesionSuc.modo = "asignado";
    montar();
    expect(screen.queryByText(NOTA)).not.toBeInTheDocument();
  });

  it("con un solo local no la ve nadie", () => {
    montar();
    expect(screen.queryByText(NOTA)).not.toBeInTheDocument();
  });
});
