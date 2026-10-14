import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Reglas } from "../../../lib/agenda/tiposConfigAgenda";

/**
 * A11 · Las reglas del negocio, con la API mockeada: las piezas que la
 * Configuración de la agenda pone en Reglas (agenda interna e historial) y en
 * Reserva online, y la ruta vieja /configuracion/negocio que lleva ahí.
 */

const sesion = vi.hoisted(() => ({ features: ["agenda"] as string[], veRoles: true, veAgenda: true }));

vi.mock("../../../store/AuthContext", async () => {
  // Los permisos de la plantilla de ese rol: la pantalla decide sólo con ellos.
  const { permisosDe } = await import("../../../test/sesiones");
  return {
    useAuth: () => ({
      usuario: { id: 1, rol: "ADMIN", ...permisosDe("ADMIN"), sucursalId: null },
      negocio: {
        id: 16,
        nombre: "Salón de prueba",
        tipoNegocio: "PELUQUERIA",
        features: sesion.features,
        perfil: { etiquetasRol: { PROFESIONAL: "Estilista" } },
      },
      puede: (seccion: string) =>
        seccion === "roles" ? sesion.veRoles : seccion === "agenda_config" ? sesion.veAgenda : true,
    }),
  };
});

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
    modoAgenda: vi.fn(async () => ({})),
  },
}));

import { apiConfigAgenda } from "../../../lib/agenda/apiConfigAgenda";
import ConfigNegocio from "./ConfigNegocio";
import { HistorialReglas, ReglasInternas, ReglasOnline } from "./ReglasNegocio";

const REGLAS: Reglas = {
  granularidadMin: 15,
  bufferGeneralMin: 0,
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

/** Una de las piezas, como la monta la Configuración de la agenda. */
async function montar(ui: React.ReactElement = <ReglasOnline />) {
  render(<MemoryRouter>{ui}</MemoryRouter>);
  await act(async () => {});
}

/** Dónde quedó la navegación (para ver la redirección de la ruta vieja). */
function Donde() {
  const l = useLocation();
  return <p data-testid="donde">{`${l.pathname}${l.search}`}</p>;
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.features = ["agenda"];
  sesion.veRoles = true;
  sesion.veAgenda = true;
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
  it("cada pieza muestra su grupo: la agenda interna en Reglas, la online con la reserva online", async () => {
    await montar(<ReglasInternas />);
    expect(screen.getByRole("region", { name: "Agenda interna" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Reglas de la reserva online" })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("la online ya no lleva a otra pestaña: está debajo de lo que se publica", async () => {
    await montar();
    const online = screen.getByRole("region", { name: "Reglas de la reserva online" });
    expect(online).not.toHaveTextContent("Llega con la reserva online");
    expect(within(online).queryByRole("link", { name: /Publicar y compartir/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Agenda interna" })).not.toBeInTheDocument();
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
    await montar(<ReglasInternas />);

    fireEvent.change(screen.getByLabelText("Reglas de"), { target: { value: "2" } });
    await act(async () => {});
    expect(apiConfigAgenda.reglas).toHaveBeenLastCalledWith(2);
    expect(screen.getByText("Propio de esta sucursal")).toBeInTheDocument();
    expect(screen.getByText("Heredado de todo el negocio")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Margen entre citas/), { target: { value: "5" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(apiConfigAgenda.guardarReglas).toHaveBeenCalledWith({ sucursalId: 2, bufferGeneralMin: 5 });
  });

  it("la online también se mira y se guarda por sucursal", async () => {
    vi.mocked(apiConfigAgenda.reglas).mockImplementation(async (sucursalId) =>
      sucursalId === 2 ? { ...REGLAS, origen: { anticipacionMinHoras: "DEFECTO" } } : REGLAS,
    );
    vi.mocked(apiConfigAgenda.guardarReglas).mockResolvedValue(REGLAS);
    await montar();
    fireEvent.change(screen.getByLabelText("Reglas de"), { target: { value: "2" } });
    await act(async () => {});
    expect(screen.getByText("Valor sugerido del rubro")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Mostrar precios en la página de reservas/));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(apiConfigAgenda.guardarReglas).toHaveBeenCalledWith({
      sucursalId: 2,
      mostrarPreciosOnline: false,
    });
  });

  it("muestra el error del backend tal cual", async () => {
    vi.mocked(apiConfigAgenda.guardarReglas).mockRejectedValue(new Error("Próximamente"));
    await montar();
    fireEvent.click(screen.getByLabelText(/Mostrar precios en la página de reservas/));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(screen.getByText("Próximamente", { selector: "span.flex-1" })).toBeInTheDocument();
  });
});

describe("lo del profesional (PLAN-ROLES-NEGOCIO)", () => {
  // Agendar, bloquear su horario, ver el teléfono y los precios pasaron a ser
  // permisos del rol: el backend ya no mira estas reglas.
  const CON_REGLAS_VIEJAS = {
    ...REGLAS,
    profesionalPuedeAgendar: true,
    profesionalPuedeBloquear: false,
    profesionalVeTelefono: false,
    profesionalVePrecios: true,
  } as Reglas;

  it("ya no hay interruptores: un texto lleva a Roles", async () => {
    vi.mocked(apiConfigAgenda.reglas).mockResolvedValue(CON_REGLAS_VIEJAS);
    await montar(<ReglasInternas />);
    expect(screen.queryByRole("region", { name: "Reglas del profesional" })).not.toBeInTheDocument();
    for (const texto of [/Puede agendar/, /Puede bloquear/, /Ve el teléfono/, /Ve precios y totales/]) {
      expect(screen.queryByLabelText(texto)).not.toBeInTheDocument();
    }
    expect(screen.getByText(/Lo que puede hacer cada profesional se configura en/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Roles" })).toHaveAttribute("href", "/roles");
  });

  it("aunque el backend las siga mandando, no vuelven en el PUT", async () => {
    vi.mocked(apiConfigAgenda.reglas).mockResolvedValue(CON_REGLAS_VIEJAS);
    vi.mocked(apiConfigAgenda.guardarReglas).mockResolvedValue(CON_REGLAS_VIEJAS);
    await montar();
    fireEvent.click(screen.getByLabelText(/Mostrar precios en la página de reservas/));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(apiConfigAgenda.guardarReglas).toHaveBeenCalledWith({ sucursalId: null, mostrarPreciosOnline: false });
  });

  it("sin acceso a Roles el texto queda, sin el enlace", async () => {
    sesion.veRoles = false;
    await montar(<ReglasInternas />);
    expect(screen.getByText(/Lo que puede hacer cada profesional se configura en/)).toHaveTextContent("Roles");
    expect(screen.queryByRole("link", { name: "Roles" })).not.toBeInTheDocument();
  });
});

describe("historial", () => {
  it("QA R1 W-14: no muestra los interruptores del profesional que pasaron a Roles", async () => {
    const viejo = (campo: string, en: string) => ({
      campo,
      antes: false,
      despues: null,
      despuesEfectivo: true,
      sucursalId: null,
      usuario: "Dueña",
      en,
    });
    vi.mocked(apiConfigAgenda.historialReglas).mockResolvedValue([
      viejo("profesionalPuedeAgendar", "2026-10-01T13:00:00.000Z"),
      viejo("profesionalPuedeBloquear", "2026-10-01T13:01:00.000Z"),
      viejo("profesionalVeTelefono", "2026-10-01T13:02:00.000Z"),
      viejo("profesionalVePrecios", "2026-10-01T13:03:00.000Z"),
      { campo: "granularidadMin", antes: 15, despues: 10, sucursalId: null, usuario: "Dueña", en: "2026-10-02T13:00:00.000Z" },
    ]);
    await montar(<HistorialReglas />);
    const historial = screen.getByRole("region", { name: "Historial de cambios" });
    expect(historial).toHaveTextContent("Los turnos empiezan cada");
    for (const texto of [/agendar/i, /bloquear/i, /teléfono/i, /Ve precios/, /profesional/]) {
      expect(historial).not.toHaveTextContent(texto);
    }
    expect(within(historial).getAllByRole("listitem")).toHaveLength(1);
  });

  it("si sólo había cambios de esos interruptores, queda como sin cambios", async () => {
    vi.mocked(apiConfigAgenda.historialReglas).mockResolvedValue([
      { campo: "profesionalVePrecios", antes: false, despues: true, sucursalId: null, usuario: "Dueña", en: "2026-10-01T13:00:00.000Z" },
    ]);
    await montar(<HistorialReglas />);
    expect(screen.getByRole("region", { name: "Historial de cambios" })).toHaveTextContent(
      "Todavía no se cambió ninguna regla.",
    );
  });

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
    await montar(<HistorialReglas />);
    const historial = screen.getByRole("region", { name: "Historial de cambios" });
    expect(historial).toHaveTextContent("Los turnos empiezan cada");
    expect(historial).toHaveTextContent("15 min");
    expect(historial).toHaveTextContent("10 min");
    expect(historial).toHaveTextContent("Dueña · Sur");
  });

  it("B-25: la hora va en 24 h de La Paz y el valor heredado se nombra", async () => {
    vi.mocked(apiConfigAgenda.historialReglas).mockResolvedValue([
      {
        campo: "mostrarPreciosOnline",
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
    await montar(<HistorialReglas />);
    const historial = screen.getByRole("region", { name: "Historial de cambios" });
    expect(historial).toHaveTextContent("Mostrar precios en la página de reservas");
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
    await montar(<HistorialReglas />);
    const historial = screen.getByRole("region", { name: "Historial de cambios" });
    const filas = within(historial).getAllByRole("listitem");
    // Lo más nuevo primero: volvió al sugerido del rubro.
    expect(filas[0]).toHaveTextContent("Queda lista cuando el cliente la confirma");
    expect(filas[0]).toHaveTextContent("La apruebo yo (heredado)");
    expect(filas[1]).toHaveTextContent(/La apruebo yo.*Queda lista cuando el cliente la confirma/);
    expect(filas[1]).not.toHaveTextContent("heredado");
  });
});

describe("la ruta vieja /configuracion/negocio", () => {
  const entrar = async () => {
    render(
      <MemoryRouter initialEntries={["/configuracion/negocio"]}>
        <Routes>
          <Route path="/configuracion/negocio" element={<ConfigNegocio />} />
          <Route path="/configuracion/agenda" element={null} />
        </Routes>
        <Donde />
      </MemoryRouter>,
    );
    await act(async () => {});
  };

  it("lleva a la pestaña Reglas de la Configuración de la agenda", async () => {
    await entrar();
    expect(screen.getByTestId("donde")).toHaveTextContent("/configuracion/agenda?pestana=reglas");
  });

  it("a quien tiene las reglas pero no la agenda le muestra la pantalla ahí mismo, sólo con lo suyo", async () => {
    sesion.veAgenda = false;
    await entrar();
    expect(screen.getByTestId("donde")).toHaveTextContent("/configuracion/negocio");
    expect(screen.getAllByRole("tab").map((t) => t.getAttribute("aria-label"))).toEqual(["Reserva online", "Reglas"]);
    expect(screen.getByRole("region", { name: "Agenda interna" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Historial de cambios" })).not.toBeInTheDocument();
  });
});
