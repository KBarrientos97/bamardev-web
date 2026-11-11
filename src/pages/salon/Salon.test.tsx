import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mesa } from "../../types/salon";

/**
 * El salón del mesero (UX-MESEROS §1): los contadores filtran, "Mis mesas" va
 * primero y las mesas van en tandas, con las libres chicas.
 */

vi.mock("../../lib/api", () => ({
  api: { salon: vi.fn() },
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ usuario: { id: 7, nombre: "Mesero Prueba", username: "mesero.prueba" } }),
}));

import { api } from "../../lib/api";
import Salon from "./Salon";

function mesa(p: Partial<Mesa>): Mesa {
  return {
    id: 1,
    codigo: "M1",
    nombre: "Mesa M1",
    zonaCodigo: "salon",
    zonaNombre: "Salón",
    capacidad: 4,
    capacidadTotal: 4,
    unidas: [],
    activa: true,
    estado: "LIBRE",
    comensales: 0,
    consumo: 0,
    propina: 0,
    comandas: [],
    ...p,
  } as Mesa;
}

const MESAS = [
  mesa({ id: 1, codigo: "M1", estado: "OCUPADA", comensales: 2, consumo: 85, meseroId: 7, meseroNombre: "Mesero Prueba", referencia: "Sr. Mamani" }),
  mesa({ id: 2, codigo: "M2" }),
  mesa({ id: 3, codigo: "T1", zonaCodigo: "terraza", zonaNombre: "Terraza", estado: "CUENTA", comensales: 2, consumo: 46, meseroId: 9, meseroNombre: "Juan Vargas" }),
  mesa({ id: 4, codigo: "M3" }),
];

const ZONAS = [
  { id: 1, codigo: "salon", nombre: "Salón" },
  { id: 2, codigo: "terraza", nombre: "Terraza" },
];

function montar() {
  render(
    <Salon onAbrirMesa={vi.fn()} onVerMesa={vi.fn()} onIrAPorServir={vi.fn()} onIrAMiTurno={vi.fn()} />,
  );
}

/** El contador de un estado: el botón que arranca con el número. */
const contador = (etiqueta: string) =>
  screen
    .getAllByRole("button")
    .find((b) => within(b).queryByText(etiqueta) && /^\d/.test(b.textContent ?? ""))!;

beforeEach(() => {
  vi.mocked(api.salon).mockResolvedValue({ mesas: MESAS, zonas: ZONAS, meserosCobran: false } as never);
});

describe("el salón del mesero (UX-MESEROS §1)", () => {
  it("la tarjeta muestra a nombre de quién está la mesa", async () => {
    montar();
    expect(await screen.findByText("Sr. Mamani")).toBeInTheDocument();
  });

  it("«Mis mesas» va antes que las zonas", async () => {
    montar();
    await screen.findByText("Sr. Mamani");
    const chips = screen.getAllByRole("button").map((b) => b.textContent);
    expect(chips.indexOf("Mis mesas")).toBeLessThan(chips.indexOf("Todas"));
  });

  it("las libres van aparte y chicas, con cuántos entran", async () => {
    montar();
    expect(await screen.findByRole("button", { name: "Abrir M2, 4 lugares" })).toBeInTheDocument();
    expect(screen.getByText("Libres · 2")).toBeInTheDocument();
  });

  it("tocar «Por cobrar» deja sólo esas, y «Ver todas» vuelve", async () => {
    montar();
    await screen.findByText("Sr. Mamani");
    fireEvent.click(contador("Por cobrar"));
    expect(screen.getByText("Viendo: Por cobrar · 1")).toBeInTheDocument();
    expect(screen.getByText("T1")).toBeInTheDocument();
    expect(screen.queryByText("Sr. Mamani")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Abrir M2/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ver todas" }));
    expect(screen.getByText("Sr. Mamani")).toBeInTheDocument();
  });

  it("tocar el mismo contador otra vez saca el filtro", async () => {
    montar();
    await screen.findByText("Sr. Mamani");
    fireEvent.click(contador("Ocupadas"));
    expect(screen.queryByText("T1")).not.toBeInTheDocument();
    fireEvent.click(contador("Ocupadas"));
    expect(screen.getByText("T1")).toBeInTheDocument();
  });

  it("los contadores cuentan la zona elegida", async () => {
    montar();
    await screen.findByText("Sr. Mamani");
    fireEvent.click(screen.getByRole("button", { name: "Terraza" }));
    expect(contador("Ocupadas").textContent).toMatch(/^0/);
    expect(contador("Por cobrar").textContent).toMatch(/^1/);
  });

  it("sin mesas en el filtro lo dice y ofrece ver todas", async () => {
    montar();
    await screen.findByText("Sr. Mamani");
    fireEvent.click(contador("Por liberar"));
    expect(screen.getByText("No hay mesas en «Por liberar».")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Ver todas" }).length).toBeGreaterThan(0);
  });
});
