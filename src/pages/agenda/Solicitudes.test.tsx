import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cita } from "../../test/agendaFixtures";
import type { CitaSolicitud } from "../../lib/agenda/apiReservaOnline";
import { puedeVer } from "../../lib/permisos";
import { permisosDe } from "../../test/sesiones";

/** A9 · Solicitudes online: aprobar, rechazar con motivo, las "nuevas" y quién la ve. */

/** Plan Emprendedor: sin cupo en los casos de siempre. */
const sesion = vi.hoisted(() => ({
  cupo: undefined as import("../../types").CupoEstado | undefined,
  actualizarCupo: vi.fn(),
  refrescarCupo: vi.fn(async () => {}),
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 3, username: "recepcion", rol: "CAJERO", sucursalId: 1, permisos: ["agenda.ver", "reservas.aprobar"] },
    negocio: { id: 1, nombre: "Salón Bella Vista", tipoNegocio: "PELUQUERIA", features: ["agenda", "reserva_online"] },
    cupo: sesion.cupo,
    actualizarCupo: sesion.actualizarCupo,
    refrescarCupo: sesion.refrescarCupo,
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
import { fechaNegocio } from "../../lib/agenda/horaAgenda";
import { EVENTO_HOJA_CUPO } from "../../lib/hojaCupo";
import { CUPO_ILIMITADO, cupoEmprendedor } from "../../test/cupoFixtures";
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
  sesion.cupo = undefined;
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
  const base = { rubro: "PELUQUERIA" };
  it("recepción y encargados de belleza (reservas.aprobar), con la reserva online", () => {
    for (const rol of ["ADMIN", "SUPERVISOR", "CAJERO"] as const) {
      expect(puedeVer({ ...base, ...permisosDe(rol), features: ["agenda", "reserva_online"] }, "solicitudes")).toBe(true);
    }
    expect(
      puedeVer({ ...base, ...permisosDe("PROFESIONAL"), features: ["agenda", "reserva_online"] }, "solicitudes"),
    ).toBe(false);
  });

  it("sin la feature no existe, ni aunque la lista venga vacía", () => {
    const admin = permisosDe("ADMIN");
    expect(puedeVer({ ...base, ...admin, features: ["agenda"] }, "solicitudes")).toBe(false);
    expect(puedeVer({ ...base, ...admin, features: [] }, "solicitudes")).toBe(false);
    expect(puedeVer({ ...admin, rubro: "RESTAURANTE", features: ["reserva_online"] }, "solicitudes")).toBe(false);
  });
});

describe("Plan Emprendedor: aprobar sin cupo (D20)", () => {
  const AVISO = "No te queda cupo de citas hoy. Comprá créditos para aprobarla; la solicitud sigue pendiente.";

  it("un negocio Básico (ilimitado) aprueba como siempre", async () => {
    sesion.cupo = CUPO_ILIMITADO;
    vi.mocked(apiReservaOnline.aprobar).mockResolvedValue({ ...solicitud, estado: "RESERVADA" });
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    });
    expect(apiReservaOnline.aprobar).toHaveBeenCalledWith(7);
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
    expect(sesion.refrescarCupo).not.toHaveBeenCalled();
  });

  it("sin cupo ni créditos (1 no alcanza: una cita usa 2) no llama, avisa y ofrece comprar", async () => {
    sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), citas: 50, saldo: 1 });
    const pedidos: Event[] = [];
    const escuchar = (e: Event) => pedidos.push(e);
    window.addEventListener(EVENTO_HOJA_CUPO, escuchar);
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    });
    expect(apiReservaOnline.aprobar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(AVISO);
    // La solicitud sigue en la bandeja.
    expect(screen.getByRole("article", { name: "Solicitud de María Flores" })).toBeInTheDocument();
    // La hoja no se abre sola: la abre el botón.
    expect(pedidos).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Comprar créditos" }));
    expect((pedidos[0] as CustomEvent).detail).toEqual({ unidad: "CITA", agotado: true });
    window.removeEventListener(EVENTO_HOJA_CUPO, escuchar);
  });

  it("un 403 CUPO_AGOTADO deja la solicitud pendiente y guarda el cupo del servidor", async () => {
    sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), citas: 49, saldo: 0 });
    const delServidor = cupoEmprendedor({ fecha: fechaNegocio(), citas: 50, saldo: 0 });
    vi.mocked(apiReservaOnline.aprobar).mockRejectedValue(
      Object.assign(new Error("Llegaste a tus 50 citas de hoy y no te quedan créditos."), {
        status: 403,
        codigo: "CUPO_AGOTADO",
        detalle: { codigo: "CUPO_AGOTADO", unidad: "CITA", cupo: delServidor },
      }),
    );
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    });
    expect(apiReservaOnline.aprobar).toHaveBeenCalledWith(7);
    expect(sesion.actualizarCupo).toHaveBeenCalledWith(delServidor);
    expect(screen.getByRole("alert")).toHaveTextContent(AVISO);
    expect(screen.getByRole("article", { name: "Solicitud de María Flores" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comprar créditos" })).toBeInTheDocument();
  });

  it("aprobar con lugar guarda el consumo que trae la respuesta", async () => {
    sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), citas: 3, saldo: 0 });
    const despues = cupoEmprendedor({ fecha: fechaNegocio(), citas: 4, saldo: 0 });
    vi.mocked(apiReservaOnline.aprobar).mockResolvedValue({
      ...solicitud,
      estado: "RESERVADA",
      consumo: { unidad: "CITA", fuente: "CUPO", creditos: 0, cupo: despues },
    });
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    });
    expect(sesion.actualizarCupo).toHaveBeenCalledWith(despues);
    expect(screen.queryByRole("article", { name: "Solicitud de María Flores" })).not.toBeInTheDocument();
  });
});
