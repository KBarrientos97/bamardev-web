import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreferenciaNotificacion } from "../lib/push/apiNotificaciones";
import type { EntornoPush } from "../lib/push/estadoPush";

/**
 * Notificaciones (PLAN-PUSH §10.2): la lista que manda el backend agrupada,
 * los interruptores optimistas y el permiso de este equipo.
 */

vi.mock("../lib/push/apiNotificaciones", () => ({
  apiNotificaciones: { preferencias: vi.fn(), cambiar: vi.fn(), prueba: vi.fn() },
}));
vi.mock("../lib/push/registroPush", () => ({ sincronizarPushSilencioso: vi.fn() }));
vi.mock("../lib/push/firebasePush", () => ({ activarPush: vi.fn() }));

let entorno: EntornoPush;
vi.mock("../lib/push/estadoPush", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/push/estadoPush")>();
  return { ...real, entornoActual: () => entorno };
});

import { ApiError } from "../lib/api";
import { apiNotificaciones } from "../lib/push/apiNotificaciones";
import { activarPush } from "../lib/push/firebasePush";
import { sincronizarPushSilencioso } from "../lib/push/registroPush";
import Notificaciones from "./Notificaciones";

const api = vi.mocked(apiNotificaciones);

function aviso(p: Partial<PreferenciaNotificacion> & Pick<PreferenciaNotificacion, "tipo" | "grupo">): PreferenciaNotificacion {
  return { nombre: p.tipo, descripcion: `Descripción de ${p.tipo}`, apagable: true, activa: true, ...p };
}

const LISTA: PreferenciaNotificacion[] = [
  aviso({ tipo: "PIN_ALERTA", grupo: "SEGURIDAD", nombre: "PIN mal escrito" }),
  aviso({ tipo: "CAJA_ABIERTA", grupo: "CAJA", nombre: "Caja abierta" }),
  aviso({ tipo: "CAJA_CERRADA", grupo: "CAJA", nombre: "Caja cerrada", activa: false }),
  aviso({ tipo: "LICENCIA_SUSPENDIDA", grupo: "CUENTA", nombre: "Cuenta suspendida", apagable: false }),
];

async function abrir() {
  await act(async () => {
    render(<Notificaciones />);
  });
}

const interruptor = (nombre: string) => screen.getByRole("switch", { name: nombre });

beforeEach(() => {
  vi.clearAllMocks();
  entorno = { hayNotification: true, hayServiceWorker: true, permiso: "granted", ios: false, instalada: false };
  api.preferencias.mockResolvedValue(LISTA);
});

describe("la lista de avisos", () => {
  it("muestra lo que manda el backend, agrupado y en orden", async () => {
    await abrir();
    const titulos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titulos).toEqual(["En este equipo", "Caja", "Cuenta y plan", "Seguridad"]);
    const caja = screen.getByRole("region", { name: "Caja" });
    expect(within(caja).getAllByRole("switch").map((s) => s.getAttribute("aria-label"))).toEqual(["Caja abierta", "Caja cerrada"]);
    expect(within(caja).getByText("Descripción de CAJA_ABIERTA")).toBeInTheDocument();
    expect(interruptor("Caja abierta")).toHaveAttribute("aria-checked", "true");
    expect(interruptor("Caja cerrada")).toHaveAttribute("aria-checked", "false");
    // Sólo los que manda: no inventa "Ventas" ni "Cobros".
    expect(screen.queryByRole("region", { name: "Ventas" })).not.toBeInTheDocument();
  });

  it("el que no se apaga se ve prendido, deshabilitado y con el porqué", async () => {
    await abrir();
    const fijo = interruptor("Cuenta suspendida");
    expect(fijo).toHaveAttribute("aria-checked", "true");
    expect(fijo).toBeDisabled();
    expect(screen.getByText(/Siempre activo: no se puede apagar/)).toBeInTheDocument();
  });

  it("al tocar cambia al instante y guarda", async () => {
    let responder!: (l: PreferenciaNotificacion[]) => void;
    api.cambiar.mockReturnValue(new Promise((r) => (responder = r)));
    await abrir();
    fireEvent.click(interruptor("Caja abierta"));
    expect(interruptor("Caja abierta")).toHaveAttribute("aria-checked", "false");
    expect(interruptor("Caja abierta")).toBeDisabled();
    expect(api.cambiar).toHaveBeenCalledWith("CAJA_ABIERTA", false);
    await act(async () => responder(LISTA.map((p) => (p.tipo === "CAJA_ABIERTA" ? { ...p, activa: false } : p))));
    expect(interruptor("Caja abierta")).toHaveAttribute("aria-checked", "false");
    expect(interruptor("Caja abierta")).toBeEnabled();
  });

  it("si el backend no lo acepta, vuelve a como estaba y lo dice", async () => {
    api.cambiar.mockRejectedValue(new ApiError("Este aviso no se puede apagar", 400));
    await abrir();
    await act(async () => {
      fireEvent.click(interruptor("Caja cerrada"));
    });
    expect(interruptor("Caja cerrada")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/No se pudo prender «Caja cerrada». Este aviso no se puede apagar/)).toBeInTheDocument();
  });

  it("un 404 (ya no le corresponde) además recarga la lista", async () => {
    api.cambiar.mockRejectedValue(new ApiError("No encontrado", 404));
    await abrir();
    await act(async () => {
      fireEvent.click(interruptor("PIN mal escrito"));
    });
    expect(api.preferencias).toHaveBeenCalledTimes(2);
  });

  it("lista vacía: no hay avisos para este usuario", async () => {
    api.preferencias.mockResolvedValue([]);
    await abrir();
    expect(screen.getByText("No hay avisos para tu usuario")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("mientras carga lo dice, y si falla deja reintentar", async () => {
    let fallar!: (e: Error) => void;
    api.preferencias.mockReturnValueOnce(new Promise((_, rej) => (fallar = rej)));
    await abrir();
    expect(screen.getByText("Cargando tus avisos…")).toBeInTheDocument();
    await act(async () => fallar(new Error("Sin conexión")));
    expect(screen.getByText("Sin conexión")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    expect(interruptor("Caja abierta")).toBeInTheDocument();
  });
});

describe("este equipo", () => {
  it("con el permiso dado lo dice y asegura el registro del token", async () => {
    await abrir();
    expect(screen.getByText(/Activadas: los avisos prendidos/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activar notificaciones" })).not.toBeInTheDocument();
    expect(sincronizarPushSilencioso).toHaveBeenCalled();
  });

  it("sin preguntar todavía, el botón pide el permiso y registra", async () => {
    entorno = { ...entorno, permiso: "default" };
    vi.mocked(activarPush).mockImplementation(async () => {
      entorno = { ...entorno, permiso: "granted" };
      return { ok: true, token: "tok", registrado: true };
    });
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Activar notificaciones" }));
    });
    expect(activarPush).toHaveBeenCalled();
    expect(screen.getByText("Listo: este equipo ya recibe tus avisos.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activar notificaciones" })).not.toBeInTheDocument();
  });

  it("si no se pudo activar, dice por qué", async () => {
    entorno = { ...entorno, permiso: "default" };
    vi.mocked(activarPush).mockResolvedValue({ ok: false, motivo: "No se dio el permiso de notificaciones." });
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Activar notificaciones" }));
    });
    expect(screen.getByText("No se dio el permiso de notificaciones.")).toBeInTheDocument();
  });

  it("bloqueadas: explica cómo habilitarlas y no ofrece el botón", async () => {
    entorno = { ...entorno, permiso: "denied" };
    await abrir();
    expect(screen.getByText(/Las bloqueaste en este navegador/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activar notificaciones" })).not.toBeInTheDocument();
  });

  it("en el iPhone sin instalar avisa que hay que agregarla al inicio", async () => {
    entorno = { hayNotification: false, hayServiceWorker: true, permiso: null, ios: true, instalada: false };
    await abrir();
    expect(screen.getByText(/sólo llegan con la app agregada a la pantalla de inicio \(iOS 16.4 o más\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cómo agregarla al inicio" })).toBeInTheDocument();
  });

  it("un navegador sin push lo dice", async () => {
    entorno = { hayNotification: false, hayServiceWorker: false, permiso: null, ios: false, instalada: false };
    await abrir();
    expect(screen.getByText(/Este navegador no puede recibir notificaciones/)).toBeInTheDocument();
  });
});

describe("sin prueba (26-oct)", () => {
  it("no hay botón para mandarse un aviso de prueba", async () => {
    await abrir();
    expect(screen.queryByRole("button", { name: /de prueba/ })).not.toBeInTheDocument();
  });
});
