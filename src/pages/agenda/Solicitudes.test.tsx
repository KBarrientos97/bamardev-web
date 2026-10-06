import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cita } from "../../test/agendaFixtures";
import type { CitaSolicitud } from "../../lib/agenda/apiReservaOnline";
import { puedeVer } from "../../lib/permisos";

/** A9 · Solicitudes online: aprobar, rechazar con motivo, las "nuevas" y quién la ve. */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 3, username: "recepcion", rol: "CAJERO", sucursalId: 1, modulos: [] },
    negocio: { id: 1, nombre: "Salón Bella Vista", tipoNegocio: "PELUQUERIA", features: ["agenda", "reserva_online"] },
  }),
}));

vi.mock("../../lib/agenda/apiReservaOnline", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiReservaOnline")>();
  return {
    ...real,
    apiReservaOnline: { bandeja: vi.fn(), aprobar: vi.fn(), rechazar: vi.fn(), revisar: vi.fn() },
  };
});

import { apiReservaOnline } from "../../lib/agenda/apiReservaOnline";
import Solicitudes from "./Solicitudes";

const solicitud: CitaSolicitud = {
  ...cita({
    id: 7,
    codigo: "K7M2QX",
    estado: "SOLICITADA",
    origen: "ONLINE",
    nota: "Tengo el pelo largo",
    cliente: { id: 9, nombre: "María Flores", telefono: "76543210", noShows: 1, nuevo: true, alergias: null },
  }),
  venceEn: "2026-10-21T20:00:00.000Z",
};
const nueva: CitaSolicitud = {
  ...cita({ id: 8, estado: "RESERVADA", origen: "ONLINE", cliente: { ...cita().cliente, nombre: "Ana Paz" } }),
  venceEn: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T13:00:00.000Z"));
  vi.mocked(apiReservaOnline.bandeja).mockResolvedValue({
    solicitudes: [solicitud],
    nuevas: [nueva],
    contador: { pendientes: 1, nuevas: 1 },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

async function montar() {
  render(
    <MemoryRouter>
      <Solicitudes />
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("bandeja de solicitudes (A9)", () => {
  it("muestra al cliente con su historial, la nota, el vencimiento y cómo contactarlo", async () => {
    await montar();
    expect(apiReservaOnline.bandeja).toHaveBeenCalledWith(1);
    const t = screen.getByRole("article", { name: "Solicitud de María Flores" });
    expect(t).toHaveTextContent("Nuevo");
    expect(t).toHaveTextContent("1 vez no vino");
    expect(t).toHaveTextContent("Tengo el pelo largo");
    expect(t).toHaveTextContent("Si nadie responde, se libera en 7 h");
    expect(within(t).getByRole("link", { name: /Llamar/ })).toHaveAttribute("href", "tel:+59176543210");
    expect(within(t).getByRole("link", { name: /WhatsApp/ }).getAttribute("href")).toMatch(/^https:\/\/wa\.me\/59176543210\?text=/);
  });

  it("aprobar la saca de la lista", async () => {
    vi.mocked(apiReservaOnline.aprobar).mockResolvedValue({ ...solicitud, estado: "RESERVADA" });
    await montar();
    const t = screen.getByRole("article", { name: "Solicitud de María Flores" });
    fireEvent.click(within(t).getByRole("button", { name: /Aprobar/ }));
    await act(async () => {});
    expect(apiReservaOnline.aprobar).toHaveBeenCalledWith(7);
    expect(screen.queryByRole("article", { name: "Solicitud de María Flores" })).toBeNull();
    expect(screen.getByText(/Aprobada la cita de María Flores/)).toBeInTheDocument();
  });

  it("rechazar pide el motivo, que ve el cliente", async () => {
    vi.mocked(apiReservaOnline.rechazar).mockResolvedValue({ ...solicitud, estado: "RECHAZADA" });
    await montar();
    const t = screen.getByRole("article", { name: "Solicitud de María Flores" });
    fireEvent.click(within(t).getByRole("button", { name: "Rechazar" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Ese día no atendemos" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Rechazar" }));
    await act(async () => {});
    expect(apiReservaOnline.rechazar).toHaveBeenCalledWith(7, "Ese día no atendemos");
  });

  it("las nuevas automáticas se marcan como vistas", async () => {
    vi.mocked(apiReservaOnline.revisar).mockResolvedValue(nueva);
    await montar();
    const t = screen.getByRole("article", { name: "Solicitud de Ana Paz" });
    fireEvent.click(within(t).getByRole("button", { name: /Vista/ }));
    await act(async () => {});
    expect(apiReservaOnline.revisar).toHaveBeenCalledWith(8);
    expect(screen.queryByRole("article", { name: "Solicitud de Ana Paz" })).toBeNull();
  });
});

describe("quién ve la bandeja", () => {
  const base = { modulos: [], rubro: "PELUQUERIA" };
  it("recepción y encargados de belleza, con la reserva online", () => {
    for (const rol of ["ADMIN", "SUPERVISOR", "CAJERO"] as const) {
      expect(puedeVer({ ...base, rol, features: ["agenda", "reserva_online"] }, "solicitudes")).toBe(true);
    }
    expect(puedeVer({ ...base, rol: "PROFESIONAL", features: ["agenda", "reserva_online"] }, "solicitudes")).toBe(false);
  });

  it("sin la feature no existe, ni aunque la lista venga vacía", () => {
    expect(puedeVer({ ...base, rol: "ADMIN", features: ["agenda"] }, "solicitudes")).toBe(false);
    expect(puedeVer({ ...base, rol: "ADMIN", features: [] }, "solicitudes")).toBe(false);
    expect(puedeVer({ rol: "ADMIN", modulos: [], rubro: "RESTAURANTE", features: ["reserva_online"] }, "solicitudes")).toBe(
      false,
    );
  });
});
