import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EVENTO_NAVEGAR_PUSH, rutaDePush } from "./destino";

/**
 * `public/push-sw.js` no pasa por Vite: se lo carga tal cual, con un `self`
 * de mentira que guarda los oyentes, y se le disparan los eventos.
 */
const CODIGO = readFileSync(join(process.cwd(), "public/push-sw.js"), "utf8");

interface VentanaFalsa {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
}

function ventana(url: string): VentanaFalsa {
  return { url, focus: vi.fn().mockResolvedValue(undefined), postMessage: vi.fn() };
}

function cargarSw(ventanas: VentanaFalsa[] = []) {
  const oyentes: Record<string, (e: unknown) => void> = {};
  const self = {
    addEventListener: (tipo: string, fn: (e: unknown) => void) => {
      oyentes[tipo] = fn;
    },
    registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
    clients: {
      matchAll: vi.fn().mockResolvedValue(ventanas),
      openWindow: vi.fn().mockResolvedValue(null),
    },
  };
  const expuesto = new Function("self", `${CODIGO}\nreturn { rutaDePush };`)(self) as {
    rutaDePush: (u: unknown) => string;
  };
  return { self, oyentes, rutaSw: expuesto.rutaDePush };
}

/** Toca una notificación con esa `url` y espera a que el SW termine. */
async function tocar(sw: ReturnType<typeof cargarSw>, url: unknown) {
  let espera: Promise<unknown> = Promise.resolve();
  const cerrar = vi.fn();
  sw.oyentes.notificationclick({
    notification: { close: cerrar, data: { url } },
    waitUntil: (p: Promise<unknown>) => {
      espera = p;
    },
  });
  await espera;
  expect(cerrar).toHaveBeenCalled();
}

/** Lo que entra en `data.url` y a dónde tiene que llevar. */
const CASOS: [unknown, string][] = [
  ["/reportes/cierres", "/reportes/cierres"],
  ["/?creditos=comprar", "/?creditos=comprar"],
  ["/pagar", "/pagar"],
  ["/reportes/ventas#arriba", "/reportes/ventas#arriba"],
  ["https://otro.sitio/robar", "/"],
  ["//otro.sitio/robar", "/"],
  ["/\\otro.sitio", "/"],
  ["javascript:alert(1)", "/"],
  ["reportes/ventas", "/"],
  ["", "/"],
  [undefined, "/"],
  [null, "/"],
  [42, "/"],
];

describe("ruta de una notificación", () => {
  it.each(CASOS)("%s → %s, igual en la app y en el service worker", (url, esperada) => {
    expect(rutaDePush(url)).toBe(esperada);
    expect(cargarSw().rutaSw(url)).toBe(esperada);
  });
});

describe("push-sw.js", () => {
  it("muestra la notificación con la ruta ya limpia", async () => {
    const sw = cargarSw();
    let espera: Promise<unknown> = Promise.resolve();
    sw.oyentes.push({
      data: {
        json: () => ({
          notification: { title: "Caja cerrada", body: "María cerró" },
          data: { tipo: "CAJA_CERRADA", url: "https://otro.sitio" },
        }),
      },
      waitUntil: (p: Promise<unknown>) => {
        espera = p;
      },
    });
    await espera;
    expect(sw.self.registration.showNotification).toHaveBeenCalledWith(
      "Caja cerrada",
      expect.objectContaining({ body: "María cerró", data: { url: "/" } }),
    );
  });

  it("con la app abierta la trae al frente y le pide ir a la ruta, sin abrir otra", async () => {
    const app = ventana("https://app.bamardev.com/pos");
    const sw = cargarSw([app]);
    await tocar(sw, "/reportes/cierres");
    expect(app.focus).toHaveBeenCalled();
    expect(app.postMessage).toHaveBeenCalledWith({ tipo: EVENTO_NAVEGAR_PUSH, url: "/reportes/cierres" });
    expect(sw.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("si el navegador no deja enfocar, igual pide la ruta", async () => {
    const app = ventana("https://app.bamardev.com/pos");
    app.focus.mockRejectedValue(new Error("sin permiso"));
    const sw = cargarSw([app]);
    await tocar(sw, "/pagar");
    expect(app.postMessage).toHaveBeenCalledWith({ tipo: EVENTO_NAVEGAR_PUSH, url: "/pagar" });
  });

  it("sin ventana abierta abre una nueva directo en la ruta", async () => {
    const sw = cargarSw([]);
    await tocar(sw, "/?creditos=comprar");
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith("/?creditos=comprar");
  });

  it("una página pública abierta no cuenta como la app: abre otra ventana", async () => {
    const publica = ventana("https://app.bamardev.com/p/pollosdonomar");
    const tv = ventana("https://app.bamardev.com/tv/salon");
    const sw = cargarSw([publica, tv]);
    await tocar(sw, "/reportes/ventas");
    expect(publica.postMessage).not.toHaveBeenCalled();
    expect(tv.postMessage).not.toHaveBeenCalled();
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith("/reportes/ventas");
  });

  it("una URL ajena se ignora y lleva al inicio", async () => {
    const sw = cargarSw([]);
    await tocar(sw, "https://otro.sitio");
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith("/");
  });
});
