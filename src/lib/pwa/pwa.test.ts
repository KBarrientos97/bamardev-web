import { afterEach, describe, expect, it, vi } from "vitest";
import { iniciarPwa, instalar, reiniciarEstadoPwa, type EventoInstalar } from "./pwa";

/**
 * El manifest y las etiquetas de iOS sólo en la app: la página pública de un
 * negocio agregada a inicio tiene que seguir siendo la del negocio.
 */

function ventana(hostname: string, pathname: string, standalone = false) {
  const doc = document.implementation.createHTMLDocument("prueba");
  doc.head.innerHTML =
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">';
  const oyentes: Record<string, (e: Event) => void> = {};
  const win = {
    location: { hostname, pathname },
    document: doc,
    navigator: { standalone },
    matchMedia: () => ({ matches: false }),
    addEventListener: (tipo: string, f: (e: Event) => void) => {
      oyentes[tipo] = f;
    },
  };
  return { win: win as unknown as Window, doc, oyentes };
}

afterEach(() => reiniciarEstadoPwa());

describe("iniciarPwa", () => {
  it("en la app pone el manifest, las etiquetas de iOS y el viewport-fit", () => {
    const { win, doc } = ventana("app.bamardev.com", "/pos");
    iniciarPwa(win);
    expect(doc.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe("/manifest.webmanifest");
    expect(doc.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute("content")).toBe("yes");
    expect(doc.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute("content")).toBe("BamarDev");
    expect(doc.querySelector('meta[name="viewport"]')?.getAttribute("content")).toContain("viewport-fit=cover");
  });

  it.each([
    ["app.bamardev.com", "/p/barberia-juan"],
    ["app.bamardev.com", "/r/barberia-juan/reservar"],
    ["link.bamardev.com", "/barberia-juan"],
  ])("en lo público (%s%s) no toca nada", (host, ruta) => {
    const { win, doc, oyentes } = ventana(host, ruta);
    iniciarPwa(win);
    expect(doc.querySelector('link[rel="manifest"]')).toBeNull();
    expect(doc.querySelector('meta[name="apple-mobile-web-app-capable"]')).toBeNull();
    expect(doc.querySelector('meta[name="viewport"]')?.getAttribute("content")).not.toContain("viewport-fit");
    expect(Object.keys(oyentes)).toEqual([]);
  });

  it("guarda el aviso de Chrome para el botón Instalar y lo usa una sola vez", async () => {
    const { win, oyentes } = ventana("app.bamardev.com", "/");
    iniciarPwa(win);
    const evento = Object.assign(new Event("beforeinstallprompt"), {
      prompt: vi.fn(async () => {}),
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    }) as EventoInstalar;
    const sinBarrita = vi.spyOn(evento, "preventDefault");
    oyentes.beforeinstallprompt(evento);
    expect(sinBarrita).toHaveBeenCalled();

    expect(await instalar()).toBe(true);
    expect(evento.prompt).toHaveBeenCalledOnce();
    // Ya instalada: no hay un segundo diálogo.
    expect(await instalar()).toBe(false);
  });
});
