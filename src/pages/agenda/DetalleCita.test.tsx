import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cita, EstadoCita } from "../../lib/agenda/tiposAgenda";
import { cita } from "../../test/agendaFixtures";

/**
 * A4 · Detalle de la cita: las acciones que ofrece dependen del estado (§6) y
 * de quién mira; el aviso al cliente sale por wa.me sólo si hay teléfono.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 3, username: "recepcion", rol: "CAJERO", sucursalId: 1, modulos: [] },
    negocio: { id: 1, nombre: "Salón Bella Vista", tipoNegocio: "PELUQUERIA" },
  }),
}));

vi.mock("../../lib/agenda/apiAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiAgenda")>();
  return {
    ...real,
    apiAgenda: { cita: vi.fn(), cambiarEstado: vi.fn(), recursos: vi.fn(), huecos: vi.fn(), moverCita: vi.fn() },
  };
});

import { apiAgenda } from "../../lib/agenda/apiAgenda";
import DetalleCita from "./DetalleCita";

const EVENTOS: Cita["eventos"] = [
  { accion: "CREAR", de: null, a: "RESERVADA", usuario: "Lucía", en: "2026-10-19T14:00:00.000Z", origen: "WEB" },
];

async function abrir(c: Cita, modo: "recepcion" | "profesional" = "recepcion", onCambio = vi.fn()) {
  vi.mocked(apiAgenda.cita).mockResolvedValue({ ...c, eventos: EVENTOS });
  render(<DetalleCita cita={c} modo={modo} sucursal="Centro" onClose={vi.fn()} onCambio={onCambio} />);
  await act(async () => {});
  return onCambio;
}

const botones = () =>
  screen
    .getAllByRole("button")
    .map((b) => b.textContent?.trim())
    .filter((t) => t && !["", "Copiar recordatorio", "Compartir"].includes(t));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("A4 · acciones según el estado", () => {
  it.each<[EstadoCita, string[], string[]]>([
    ["RESERVADA", ["Confirmar", "Llegó", "Atender", "No vino", "Mover", "Cancelar cita"], ["Finalizar"]],
    ["CONFIRMADA", ["Llegó", "Atender", "No vino", "Mover", "Cancelar cita"], ["Confirmar", "Finalizar"]],
    ["EN_ESPERA", ["Atender", "Cancelar cita"], ["Mover", "Llegó"]],
    ["EN_ATENCION", ["Finalizar"], ["Mover", "Cancelar cita", "Llegó"]],
    ["POR_COBRAR", ["Cobrar · llega pronto", "Sin cargo"], ["Finalizar", "Cancelar cita"]],
    ["COMPLETADA", [], ["Finalizar", "Cancelar cita", "Mover", "Llegó"]],
    ["CANCELADA", [], ["Cancelar cita", "Mover", "Llegó", "Confirmar"]],
  ])("%s ofrece %j", async (estado, si, no) => {
    await abrir(cita({ estado }));
    const hay = botones();
    for (const b of si) expect(hay, b).toContain(b);
    for (const b of no) expect(hay, b).not.toContain(b);
  });

  it("cobrar se ve pero está apagado: llega en la próxima entrega", async () => {
    await abrir(cita({ estado: "POR_COBRAR" }));
    expect(screen.getByRole("button", { name: "Cobrar · llega pronto" })).toBeDisabled();
  });

  it("el profesional marca sus estados pero no mueve, no cancela ni confirma", async () => {
    await abrir(cita({ estado: "RESERVADA" }), "profesional");
    const hay = botones();
    expect(hay).toEqual(expect.arrayContaining(["Llegó", "Atender", "No vino"]));
    for (const b of ["Mover", "Cancelar cita", "Confirmar"]) expect(hay).not.toContain(b);
  });

  it("una acción llama al backend y avisa a la lista de atrás", async () => {
    const llegada = cita({ estado: "EN_ESPERA" });
    vi.mocked(apiAgenda.cambiarEstado).mockResolvedValue(llegada);
    const onCambio = await abrir(cita({ estado: "CONFIRMADA" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Llegó" }));
    });
    expect(apiAgenda.cambiarEstado).toHaveBeenCalledWith(1, "LLEGO", undefined);
    expect(onCambio).toHaveBeenCalledWith(llegada);
  });

  it("cancelar pide el motivo y lo manda", async () => {
    vi.mocked(apiAgenda.cambiarEstado).mockResolvedValue(cita({ estado: "CANCELADA" }));
    await abrir(cita({ estado: "CONFIRMADA" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar cita" }));
    fireEvent.click(screen.getByRole("button", { name: "Cliente avisó" }));
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Cancelar cita" }).at(-1)!);
    });
    expect(apiAgenda.cambiarEstado).toHaveBeenCalledWith(1, "CANCELAR", "Cliente avisó");
  });

  it("muestra el historial de la cita", async () => {
    await abrir(cita());
    expect(screen.getByText(/Lucía: creó la cita \(Reservada\)/)).toBeInTheDocument();
  });
});

describe("A4 · avisar al cliente", () => {
  it("con teléfono: Copiar recordatorio y Enviar por WhatsApp al 591", async () => {
    await abrir(cita());
    expect(screen.getByRole("button", { name: /Copiar recordatorio/ })).toBeInTheDocument();
    const wa = screen.getByRole("link", { name: /Enviar por WhatsApp/ });
    expect(wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/59171234567\?text=Hola%20Rosa/);
    expect(wa).toHaveAttribute("target", "_blank");
  });

  it("sin teléfono (el profesional que no lo ve): sólo copiar", async () => {
    const sinTel = cita({ cliente: { ...cita().cliente, telefono: null } });
    await abrir(sinTel, "profesional");
    expect(screen.getByText("Teléfono oculto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copiar recordatorio/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).not.toBeInTheDocument();
  });

  it("copiar deja el texto en el portapapeles y lo dice", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await abrir(cita());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Copiar recordatorio/ }));
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Hola Rosa"));
    expect(screen.getByText("Recordatorio copiado")).toBeInTheDocument();
  });
});
