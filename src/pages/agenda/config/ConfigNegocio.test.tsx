import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Reglas } from "../../../lib/agenda/tiposConfigAgenda";

/**
 * A11 · Configuración del negocio, con la API mockeada (el backend de agenda
 * se programa en paralelo contra §10.1).
 */

const sesion = vi.hoisted(() => ({ features: ["agenda"] as string[] }));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, rol: "ADMIN", sucursalId: null },
    negocio: {
      id: 16,
      nombre: "Salón de prueba",
      tipoNegocio: "PELUQUERIA",
      features: sesion.features,
      perfil: { etiquetasRol: { PROFESIONAL: "Estilista" } },
    },
    puede: () => true,
  }),
}));

vi.mock("../../../lib/api", () => ({
  api: {
    getSucursales: vi.fn(async () => [
      { id: 1, nombre: "Centro", activo: true, tipo: "SUCURSAL", esPrincipal: true },
      { id: 2, nombre: "Sur", activo: true, tipo: "SUCURSAL", esPrincipal: false },
    ]),
  },
}));

vi.mock("../../../lib/agenda/apiConfigAgenda", () => ({
  apiConfigAgenda: {
    reglas: vi.fn(),
    guardarReglas: vi.fn(),
    historialReglas: vi.fn(),
  },
}));

import { apiConfigAgenda } from "../../../lib/agenda/apiConfigAgenda";
import ConfigNegocio from "./ConfigNegocio";

const REGLAS: Reglas = {
  granularidadMin: 15,
  bufferGeneralMin: 0,
  profesionalPuedeAgendar: false,
  profesionalPuedeBloquear: false,
  profesionalVeTelefono: false,
  profesionalVePrecios: true,
  modoConfirmacion: "MANUAL",
  anticipacionMinHoras: 2,
  anticipacionMaxDias: 30,
  ventanaCancelacionHoras: 4,
  vencimientoSolicitudHoras: 12,
  citasActivasPorTelefono: 2,
  citasPorTelefonoPorDia: 1,
  noShowsParaBloquear: 3,
  mostrarPreciosOnline: true,
  anticipoPct: 30,
  anticipoPlazoMin: 15,
  origen: {},
};

async function montar() {
  render(
    <MemoryRouter>
      <ConfigNegocio />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.features = ["agenda"];
  vi.mocked(apiConfigAgenda.reglas).mockResolvedValue(REGLAS);
  vi.mocked(apiConfigAgenda.historialReglas).mockResolvedValue([]);
});

describe("modo de confirmación", () => {
  it("tiene cuatro opciones (B28 suma «sólo conocidos») y la del anticipo por QR está deshabilitada: Próximamente", async () => {
    await montar();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4);
    expect(screen.getByRole("radio", { name: /La apruebo yo/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Queda lista cuando el cliente la confirma/ })).toBeEnabled();
    const anticipo = screen.getByRole("radio", { name: /anticipo por QR/ });
    expect(anticipo).toBeDisabled();
    // El motivo de D20 viaja como descripción del radio.
    expect(anticipo).toHaveAccessibleDescription(/Próximamente\. Disponible en el plan Profesional\./);
    expect(screen.getAllByText("Próximamente").length).toBeGreaterThan(0);
  });

  it("con el plan Profesional el motivo es el QR del banco", async () => {
    sesion.features = ["agenda", "sena_online"];
    await montar();
    expect(screen.getByRole("radio", { name: /anticipo por QR/ })).toHaveAccessibleDescription(
      /QR automático de tu banco integrado con BamarDev/,
    );
  });

  it("elegir la automática y guardar manda sólo ese cambio, para todo el negocio", async () => {
    vi.mocked(apiConfigAgenda.guardarReglas).mockResolvedValue({
      ...REGLAS,
      modoConfirmacion: "AUTOMATICA",
    });
    await montar();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Queda lista cuando el cliente la confirma/ }));
    expect(screen.getByText("1 cambio sin guardar")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(apiConfigAgenda.guardarReglas).toHaveBeenCalledWith({
      sucursalId: null,
      modoConfirmacion: "AUTOMATICA",
    });
    expect(screen.getByText("Reglas guardadas.")).toBeInTheDocument();
  });
});

describe("B28: automática sólo para clientes conocidos", () => {
  it("es una opción más, con su explicación, y se guarda como AUTOMATICA_CONOCIDOS", async () => {
    vi.mocked(apiConfigAgenda.guardarReglas).mockResolvedValue({
      ...REGLAS,
      modoConfirmacion: "AUTOMATICA_CONOCIDOS",
    });
    await montar();
    const conocidos = screen.getByRole("radio", { name: /Lista sola si ya es tu cliente/ });
    expect(conocidos).toBeEnabled();
    expect(screen.getByText(/al menos una cita completada/)).toBeInTheDocument();
    fireEvent.click(conocidos);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(apiConfigAgenda.guardarReglas).toHaveBeenCalledWith({
      sucursalId: null,
      modoConfirmacion: "AUTOMATICA_CONOCIDOS",
    });
  });
});

describe("reglas", () => {
  it("se agrupan en agenda interna, profesional y reserva online", async () => {
    await montar();
    expect(screen.getByRole("region", { name: "Agenda interna" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Reglas del profesional" })).toHaveTextContent(
      "cada estilista",
    );
    const online = screen.getByRole("region", { name: "Reserva online" });
    // Desde la fase 2 la reserva online existe: ya no dice "llega pronto" y
    // lleva a publicar y compartir el enlace.
    expect(online).not.toHaveTextContent("Llega con la reserva online");
    expect(within(online).getByRole("link", { name: /Publicar y compartir/ })).toHaveAttribute(
      "href",
      "/configuracion/agenda?pestana=reservas",
    );
  });

  it("un número fuera de rango no deja guardar", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Bloquear reservas online después de"), {
      target: { value: "-1" },
    });
    expect(screen.getByText("Entre 0 y 50.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("mirando una sucursal dice qué es propio y qué heredado, y guarda para esa sucursal", async () => {
    vi.mocked(apiConfigAgenda.reglas).mockImplementation(async (sucursalId) =>
      sucursalId === 2
        ? {
            ...REGLAS,
            granularidadMin: 10,
            origen: { granularidadMin: "SUCURSAL", bufferGeneralMin: "NEGOCIO", anticipacionMinHoras: "DEFECTO" },
          }
        : REGLAS,
    );
    vi.mocked(apiConfigAgenda.guardarReglas).mockResolvedValue(REGLAS);
    await montar();

    fireEvent.change(screen.getByLabelText("Reglas de"), { target: { value: "2" } });
    await act(async () => {});
    expect(apiConfigAgenda.reglas).toHaveBeenLastCalledWith(2);
    expect(screen.getByText("Propio de esta sucursal")).toBeInTheDocument();
    expect(screen.getByText("Heredado de todo el negocio")).toBeInTheDocument();
    expect(screen.getByText("Valor sugerido del rubro")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Ve el teléfono del cliente/));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(apiConfigAgenda.guardarReglas).toHaveBeenCalledWith({
      sucursalId: 2,
      profesionalVeTelefono: true,
    });
  });

  it("muestra el error del backend tal cual", async () => {
    vi.mocked(apiConfigAgenda.guardarReglas).mockRejectedValue(new Error("Próximamente"));
    await montar();
    fireEvent.click(screen.getByLabelText(/Ve precios y totales/));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(screen.getByText("Próximamente", { selector: "span.flex-1" })).toBeInTheDocument();
  });
});

describe("historial", () => {
  it("lista quién cambió qué, con el valor anterior y el nuevo", async () => {
    vi.mocked(apiConfigAgenda.historialReglas).mockResolvedValue([
      {
        campo: "granularidadMin",
        antes: 15,
        despues: 10,
        sucursalId: 2,
        usuario: "Dueña",
        en: "2026-10-21T13:00:00.000Z",
      },
    ]);
    await montar();
    const historial = screen.getByRole("region", { name: "Historial de cambios" });
    expect(historial).toHaveTextContent("Los turnos empiezan cada");
    expect(historial).toHaveTextContent("15 min");
    expect(historial).toHaveTextContent("10 min");
    expect(historial).toHaveTextContent("Dueña · Sur");
  });

  it("B-25: la hora va en 24 h de La Paz y el valor heredado se nombra", async () => {
    vi.mocked(apiConfigAgenda.historialReglas).mockResolvedValue([
      {
        campo: "profesionalVeTelefono",
        antes: null,
        despues: true,
        sucursalId: null,
        usuario: "Dueña",
        // 00:21 del 06/10 en La Paz.
        en: "2026-10-06T04:21:00.000Z",
      },
      {
        campo: "granularidadMin",
        antes: 15,
        despues: null,
        sucursalId: null,
        usuario: "Dueña",
        en: "2026-10-06T16:30:00.000Z",
      },
    ]);
    await montar();
    const historial = screen.getByRole("region", { name: "Historial de cambios" });
    expect(historial).toHaveTextContent("06/10/2026 00:21");
    expect(historial).toHaveTextContent("06/10/2026 12:30");
    expect(historial).not.toHaveTextContent(/a\. m\.|p\. m\./);
    expect(historial).toHaveTextContent("heredado");
    expect(historial).not.toHaveTextContent("—");
  });

  it("B11: con el valor efectivo del backend dice lo que regía, no «heredado»", async () => {
    vi.mocked(apiConfigAgenda.historialReglas).mockResolvedValue([
      {
        campo: "modoConfirmacion",
        antes: null,
        despues: "AUTOMATICA",
        antesEfectivo: "MANUAL",
        despuesEfectivo: "AUTOMATICA",
        sucursalId: null,
        usuario: "Dueña",
        en: "2026-10-06T16:30:00.000Z",
      },
      {
        campo: "modoConfirmacion",
        antes: "AUTOMATICA",
        despues: null,
        antesEfectivo: "AUTOMATICA",
        despuesEfectivo: "MANUAL",
        sucursalId: null,
        usuario: "Dueña",
        en: "2026-10-06T17:30:00.000Z",
      },
    ]);
    await montar();
    const historial = screen.getByRole("region", { name: "Historial de cambios" });
    const filas = within(historial).getAllByRole("listitem");
    // Lo más nuevo primero: volvió al sugerido del rubro.
    expect(filas[0]).toHaveTextContent("Queda lista cuando el cliente la confirma");
    expect(filas[0]).toHaveTextContent("La apruebo yo (heredado)");
    expect(filas[1]).toHaveTextContent(/La apruebo yo.*Queda lista cuando el cliente la confirma/);
    expect(filas[1]).not.toHaveTextContent("heredado");
  });
});
