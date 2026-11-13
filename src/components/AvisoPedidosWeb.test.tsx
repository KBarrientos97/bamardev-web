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
