import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AvisoAgenda } from "../../lib/agenda/tiposAgenda";
import { cita } from "../../test/agendaFixtures";

/**
 * La campana de la agenda (§9.1): cuenta lo nuevo, se pone en cero al abrirla
 * y lleva a la cita.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ usuario: { id: 3, username: "recepcion", rol: "CAJERO" } }),
}));

vi.mock("../../lib/agenda/apiAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiAgenda")>();
  return { ...real, apiAgenda: { avisos: vi.fn(), cita: vi.fn() } };
});

import { apiAgenda } from "../../lib/agenda/apiAgenda";
import CampanaAvisos from "./CampanaAvisos";

const aviso = (clave: string, en: string, texto: string, citaId = 1): AvisoAgenda => ({
  clave,
  tipo: "CITA_NUEVA",
  citaId,
  codigo: "K7M2QX",
  cliente: "Rosa Mamani",
  sucursalId: 1,
  inicio: "2026-10-21T14:00:00.000Z",
  recursos: ["Carla R."],
  usuario: "Lucía",
  en,
  texto,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(apiAgenda.avisos).mockResolvedValue({
    ahora: "2026-10-21T15:00:00.000Z",
    avisos: [
      aviso("e2", "2026-10-21T14:58:00.000Z", "Se movió la cita de Rosa Mamani", 2),
      aviso("e1", "2026-10-21T14:50:00.000Z", "Nueva cita de Rosa Mamani el 21/10 10:00 con Carla R."),
    ],
  });
});

async function montar(onAbrirCita = vi.fn()) {
  render(<CampanaAvisos onAbrirCita={onAbrirCita} />);
  await act(async () => {});
  return onAbrirCita;
}

describe("campana de avisos", () => {
  it("cuenta lo que no se vio y al abrirla vuelve a cero", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Avisos (2 sin ver)" }));
    expect(screen.getByText("Se movió la cita de Rosa Mamani")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Avisos" })).toBeInTheDocument();
    // Queda guardado para la próxima vez.
    expect(localStorage.getItem("bamar.avisos.vistoHasta.3")).toBe("2026-10-21T15:00:00.000Z");
  });

  it("lo ya visto no vuelve a contar", async () => {
    localStorage.setItem("bamar.avisos.vistoHasta.3", "2026-10-21T14:55:00.000Z");
    await montar();
    expect(screen.getByRole("button", { name: "Avisos (1 sin ver)" })).toBeInTheDocument();
  });

  it("tocar un aviso abre su cita", async () => {
    const llegada = cita({ id: 2 });
    vi.mocked(apiAgenda.cita).mockResolvedValue(llegada);
    const onAbrir = await montar();
    fireEvent.click(screen.getByRole("button", { name: /Avisos/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Se movió la cita/ }));
    });
    expect(apiAgenda.cita).toHaveBeenCalledWith(2);
    expect(onAbrir).toHaveBeenCalledWith(llegada);
  });

  it("si el pedido falla, la campana queda quieta", async () => {
    vi.mocked(apiAgenda.avisos).mockRejectedValue(new Error("sin red"));
    await montar();
    expect(screen.getByRole("button", { name: "Avisos" })).toBeInTheDocument();
  });
});

describe("el panel en el celular (QA A-04)", () => {
  function conPantalla(celular: boolean) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: celular,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  }

  it("a 390 px queda dentro de la pantalla: fijo, con 1rem a cada lado, bajo el botón", async () => {
    conPantalla(true);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Avisos/ }));
    const panel = screen.getByRole("dialog", { name: "Avisos de la agenda" });
    expect(panel).toHaveClass("fixed", "inset-x-4", "max-w-[22rem]");
    // No queda anclado a la derecha del botón (eso lo sacaba por la izquierda).
    expect(panel).not.toHaveClass("absolute", "right-0");
    expect(panel.style.top).not.toBe("");
    vi.unstubAllGlobals();
  });

  it("en escritorio sigue anclado al botón, como siempre", async () => {
    conPantalla(false);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Avisos/ }));
    const panel = screen.getByRole("dialog", { name: "Avisos de la agenda" });
    expect(panel).toHaveClass("lg:absolute", "lg:right-0", "lg:w-[min(22rem,calc(100vw-2rem))]");
    expect(panel.style.top).toBe("");
    vi.unstubAllGlobals();
  });
});
