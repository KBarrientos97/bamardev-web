import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El aviso de pedidos web nuevos, visible desde cualquier pantalla (13-nov):
 * el contador cada 10 s, el título de la pestaña «(2) Pedidos nuevos», y el
 * sonido, que con Web Audio sólo puede sonar después de un toque.
 */

const sesion = vi.hoisted(() => ({ ve: true }));

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({ puede: (s: string) => (s === "pedidos_web" ? sesion.ve : true) }),
}));

vi.mock("../lib/pedidosWeb/apiPrivada", () => ({
  apiPedidosWeb: { contador: vi.fn() },
}));

import { apiPedidosWeb } from "../lib/pedidosWeb/apiPrivada";
import { CADA_MS, REPETIR_SONIDO_MS, reiniciarContador, reiniciarSonido } from "../lib/pedidosWeb/contador";
import AvisoPedidosWeb from "./AvisoPedidosWeb";

const contador = vi.mocked(apiPedidosWeb.contador);

/** Un AudioContext de juguete que cuenta los tonos que se tocan. */
const tonos = vi.fn();
class AudioFalso {
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {});
  createGain() {
    const g = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: () => ({ connect: () => {} }) };
    return { ...g, connect: () => this.destination };
  }
  createOscillator() {
    const o = {
      type: "",
      frequency: { value: 0 },
      connect: () => ({ connect: () => {} }),
      start: () => tonos(o.frequency.value),
      stop: () => {},
    };
    return o;
  }
}

async function montar(ruta = "/clientes") {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <AvisoPedidosWeb />
    </MemoryRouter>,
  );
  await act(async () => {});
}

const avanzar = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  reiniciarContador();
  reiniciarSonido();
  tonos.mockClear();
  sesion.ve = true;
  contador.mockReset();
  contador.mockResolvedValue({ nuevos: 0, masViejoEn: null });
  document.title = "Mi negocio";
  vi.stubGlobal("AudioContext", AudioFalso);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("el aviso de pedidos web", () => {
  it("sin pedidos nuevos no se dibuja nada", async () => {
    await montar();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(document.title).toBe("Mi negocio");
  });

  it("con pedidos nuevos: la franja, el título «(2) Pedidos nuevos» y el enlace a la bandeja", async () => {
    contador.mockResolvedValue({ nuevos: 2, masViejoEn: "2026-11-13T20:00:00.000Z" });
    await montar();
    expect(screen.getByRole("link", { name: /2 pedidos web nuevos/ })).toHaveAttribute("href", "/pedidos-web");
    expect(document.title).toBe("(2) Pedidos nuevos");
  });

  it("el título vuelve a su lugar cuando ya no hay nada por atender", async () => {
    contador.mockResolvedValue({ nuevos: 2, masViejoEn: null });
    await montar();
    expect(document.title).toBe("(2) Pedidos nuevos");
    contador.mockResolvedValue({ nuevos: 0, masViejoEn: null });
    await avanzar(CADA_MS);
    expect(document.title).toBe("Mi negocio");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("consulta el contador cada 10 s", async () => {
    await montar();
    expect(contador).toHaveBeenCalledTimes(1);
    await avanzar(CADA_MS);
    expect(contador).toHaveBeenCalledTimes(2);
    await avanzar(CADA_MS * 2);
    expect(contador).toHaveBeenCalledTimes(4);
  });

  it("no se dibuja en el POS ni en la bandeja, que ya tienen lo suyo", async () => {
    contador.mockResolvedValue({ nuevos: 1, masViejoEn: null });
    await montar("/pos");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // Pero el título sí avisa: el cajero puede estar en otra pestaña.
    expect(document.title).toBe("(1) Pedidos nuevos");
  });

  it("quien no ve la bandeja no consulta nada", async () => {
    sesion.ve = false;
    contador.mockResolvedValue({ nuevos: 5, masViejoEn: null });
    await montar();
    expect(contador).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("sin señal conserva el último número en vez de inventar un cero", async () => {
    contador.mockResolvedValue({ nuevos: 3, masViejoEn: null });
    await montar();
    expect(screen.getByRole("link", { name: /3 pedidos web nuevos/ })).toBeInTheDocument();
    contador.mockRejectedValue(new Error("sin red"));
    await avanzar(CADA_MS);
    expect(screen.getByRole("link", { name: /3 pedidos web nuevos/ })).toBeInTheDocument();
  });

  it("al cerrar sesión (reiniciarContador) el número de esta sesión no se lo hereda la siguiente (PW-21)", async () => {
    contador.mockResolvedValue({ nuevos: 4, masViejoEn: null });
    await montar();
    expect(screen.getByRole("link", { name: /4 pedidos web nuevos/ })).toBeInTheDocument();
    // El logout vacía el conteo; otro negocio que no puede consultar no ve el 4.
    contador.mockRejectedValue(new Error("403"));
    act(() => reiniciarContador());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await avanzar(CADA_MS);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  describe("con la pestaña oculta (R2-05)", () => {
    const visibilidad = (valor: "hidden" | "visible") =>
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => valor });
    afterEach(() => visibilidad("visible"));

    /** Una Notification de juguete: cuenta lo que se muestra y trae el permiso del usuario. */
    const mostradas = vi.fn();
    function notificacionesCon(permiso: NotificationPermission) {
      class Falsa {
        static permission = permiso;
        onclick: (() => void) | null = null;
        close = vi.fn();
        constructor(
          public titulo: string,
          public opciones: NotificationOptions,
        ) {
          mostradas(titulo, opciones);
        }
      }
      vi.stubGlobal("Notification", Falsa);
    }
    beforeEach(() => mostradas.mockClear());

    it("sigue consultando el contador y suena igual", async () => {
      visibilidad("hidden");
      await montar();
      expect(contador).toHaveBeenCalledTimes(1);
      await avanzar(CADA_MS);
      expect(contador).toHaveBeenCalledTimes(2);

      fireEvent.pointerDown(window); // el toque que habilita el sonido
      contador.mockResolvedValue({ nuevos: 1, masViejoEn: null });
      await avanzar(CADA_MS);
      expect(tonos).toHaveBeenCalled();
      expect(document.title).toBe("(1) Pedidos nuevos");
    });

    it("con permiso: una notificación del sistema al llegar un pedido, muda si el sonido ya está", async () => {
      visibilidad("hidden");
      notificacionesCon("granted");
      await montar();
      fireEvent.pointerDown(window);
      contador.mockResolvedValue({ nuevos: 1, masViejoEn: null });
      await avanzar(CADA_MS);
      expect(mostradas).toHaveBeenCalledTimes(1);
      expect(mostradas.mock.calls[0][0]).toBe("Pedido web nuevo");
      expect(mostradas.mock.calls[0][1]).toMatchObject({ tag: "pedidos-web-nuevos", silent: true });
    });

    it("no hace spam: el mismo número y la repetición del sonido no la repiten; uno más sí", async () => {
      visibilidad("hidden");
      notificacionesCon("granted");
      contador.mockResolvedValue({ nuevos: 1, masViejoEn: null });
      await montar();
      expect(mostradas).toHaveBeenCalledTimes(1);
      await avanzar(CADA_MS * 5); // sigue el 1 sin atender
      await avanzar(REPETIR_SONIDO_MS); // y vuelve a sonar
      expect(mostradas).toHaveBeenCalledTimes(1);

      contador.mockResolvedValue({ nuevos: 2, masViejoEn: null });
      await avanzar(CADA_MS);
      expect(mostradas).toHaveBeenCalledTimes(2);
      expect(mostradas.mock.calls[1][0]).toBe("2 pedidos web nuevos");
      // Sin sonido habilitado, la notificación trae el del sistema.
      expect(mostradas.mock.calls[1][1]).toMatchObject({ silent: false });
    });

    it.each(["default", "denied"] as const)("con el permiso en «%s» no muestra nada, ni se lo pide", async (permiso) => {
      visibilidad("hidden");
      const pedir = vi.fn();
      notificacionesCon(permiso);
      (globalThis.Notification as unknown as { requestPermission: () => void }).requestPermission = pedir;
      contador.mockResolvedValue({ nuevos: 1, masViejoEn: null });
      await montar();
      await avanzar(CADA_MS);
      expect(mostradas).not.toHaveBeenCalled();
      expect(pedir).not.toHaveBeenCalled();
    });

    it("con la pestaña a la vista no hay notificación (ya están la franja, el título y el sonido)", async () => {
      notificacionesCon("granted");
      contador.mockResolvedValue({ nuevos: 1, masViejoEn: null });
      await montar();
      expect(mostradas).not.toHaveBeenCalled();
    });

    it("un navegador que lanza al crear la notificación no rompe el aviso", async () => {
      visibilidad("hidden");
      vi.stubGlobal(
        "Notification",
        Object.assign(
          function () {
            throw new TypeError("Illegal constructor");
          },
          { permission: "granted" },
        ),
      );
      contador.mockResolvedValue({ nuevos: 1, masViejoEn: null });
      await montar();
      expect(document.title).toBe("(1) Pedidos nuevos");
    });
  });

  describe("el sonido", () => {
    it("antes del primer toque no suena y ofrece «Activar sonido»", async () => {
      contador.mockResolvedValue({ nuevos: 1, masViejoEn: null });
      await montar();
      expect(tonos).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Activar sonido" })).toBeInTheDocument();
    });

    it("el botón lo activa, y desde ahí suena cuando llega uno nuevo", async () => {
      await montar();
      // Sin pedidos todavía: se activa el sonido (un toque del cajero).
      contador.mockResolvedValue({ nuevos: 1, masViejoEn: null });
      await avanzar(CADA_MS);
      fireEvent.click(screen.getByRole("button", { name: "Activar sonido" }));
      expect(screen.queryByRole("button", { name: "Activar sonido" })).not.toBeInTheDocument();
      tonos.mockClear();
      // Llega un segundo pedido: suena.
      contador.mockResolvedValue({ nuevos: 2, masViejoEn: null });
      await avanzar(CADA_MS);
      expect(tonos).toHaveBeenCalled();
    });

    it("si el navegador durmió el contexto (iOS, pantalla bloqueada) no dice que sonó y vuelve a ofrecer «Activar sonido»", async () => {
      let ctx!: AudioDormible;
      class AudioDormible extends AudioFalso {
        state = "running";
        onstatechange: (() => void) | null = null;
        constructor() {
          super();
          ctx = this;
        }
      }
      vi.stubGlobal("AudioContext", AudioDormible);
      await montar();
      contador.mockResolvedValue({ nuevos: 1, masViejoEn: null });
      await avanzar(CADA_MS);
      fireEvent.click(screen.getByRole("button", { name: "Activar sonido" }));
      expect(screen.queryByRole("button", { name: "Activar sonido" })).not.toBeInTheDocument();

      // La tablet se bloquea: el contexto queda suspendido y llega otro pedido.
      ctx.state = "suspended";
      tonos.mockClear();
      contador.mockResolvedValue({ nuevos: 2, masViejoEn: null });
      await avanzar(CADA_MS);
      expect(tonos).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Activar sonido" })).toBeInTheDocument();
      // Se intentó despertarlo (si el navegador lo permite, vuelve solo).
      expect(ctx.resume).toHaveBeenCalled();

      // El navegador lo levanta (o la cajera toca el botón): vuelve a sonar.
      ctx.state = "running";
      act(() => ctx.onstatechange?.());
      expect(screen.queryByRole("button", { name: "Activar sonido" })).not.toBeInTheDocument();
      contador.mockResolvedValue({ nuevos: 3, masViejoEn: null });
      await avanzar(CADA_MS);
      expect(tonos).toHaveBeenCalled();
    });

    it("mientras haya pedidos sin atender vuelve a sonar cada 30 s", async () => {
      await montar();
      contador.mockResolvedValue({ nuevos: 1, masViejoEn: null });
      await avanzar(CADA_MS);
      fireEvent.click(screen.getByRole("button", { name: "Activar sonido" }));
      tonos.mockClear();
      await avanzar(REPETIR_SONIDO_MS);
      expect(tonos).toHaveBeenCalled();
    });
  });
});
