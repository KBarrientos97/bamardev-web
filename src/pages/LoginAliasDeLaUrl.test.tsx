import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SesionNegocio } from "../types";

/**
 * PLAN-ALTA-LANDING B5: la landing manda al login con `?negocio=<alias>` y el
 * login de siempre lo toma (también `?alias=…`), en cualquier ruta en la que
 * aparezca sin sesión. Se prueba con la app entera, como App.test, y no en
 * Login.test: lo que importa es la dirección real del navegador.
 */

vi.mock("../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/api")>();
  // La licencia queda pendiente para siempre: acá no importa y así no pinta
  // nada después de que el test terminó.
  return {
    ...real,
    api: {
      login: vi.fn(),
      me: vi.fn(),
      licencia: vi.fn(() => new Promise(() => {})),
    },
  };
});

// Las pantallas no importan, sólo cuál se abre.
vi.mock("../components/Layout", async () => {
  const { Outlet } = await import("react-router-dom");
  return { default: () => <Outlet /> };
});
vi.mock("./inventario/Dashboard", () => ({
  default: () => <p>Inicio del administrador</p>,
}));

import App from "../App";
import "../AppNegocio";
import { NEGOCIO_KEY, USER_KEY, tokenStore } from "../lib/api";
import { usuarioDe } from "../test/sesiones";

const BILLAR: SesionNegocio = {
  id: 31,
  nombre: "Billar Los Pinos",
  alias: "billarlospinos",
  tipoNegocio: "RESTAURANTE",
};
const ADMIN = usuarioDe("ADMIN", { id: 90, username: "admin", nombre: "Juan Pérez" });

async function abrir(ruta: string) {
  window.history.replaceState(null, "", ruta);
  render(<App />);
  await act(async () => {
    await import("../AppNegocio");
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("el login con el alias en la dirección", () => {
  const campoNegocio = () => screen.getByPlaceholderText("cafeteriakevin");

  it("lo rellena, gana sobre el recordado y lo saca de la dirección", async () => {
    localStorage.setItem("bamardev_web_alias", "pollosdonomar");
    await abrir("/?negocio=BillarLosPinos&modo=1#arriba");

    expect(campoNegocio()).toHaveValue("billarlospinos");
    // Sin recargar: lo demás de la dirección queda como estaba.
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?modo=1");
    expect(window.location.hash).toBe("#arriba");
    // El recordado no se toca hasta que entre.
    expect(localStorage.getItem("bamardev_web_alias")).toBe("pollosdonomar");
  });

  it("acepta ?alias= y conserva la ruta a la que apuntaba el enlace", async () => {
    await abrir("/inventario?alias=billarlospinos");

    expect(campoNegocio()).toHaveValue("billarlospinos");
    expect(window.location.pathname + window.location.search).toBe("/inventario");
  });

  it("lo que no tiene forma de alias no pisa el recordado, pero igual se limpia", async () => {
    localStorage.setItem("bamardev_web_alias", "pollosdonomar");
    await abrir("/?negocio=%3Cscript%3E");

    expect(campoNegocio()).toHaveValue("pollosdonomar");
    expect(window.location.search).toBe("");
  });

  it("con la sesión abierta no toca nada", async () => {
    tokenStore.set("token-alta");
    localStorage.setItem(USER_KEY, JSON.stringify(ADMIN));
    localStorage.setItem(NEGOCIO_KEY, JSON.stringify(BILLAR));
    localStorage.setItem("bamardev_web_alias", "billarlospinos");
    await abrir("/inventario?negocio=otronegocio");

    expect(screen.getByText("Inicio del administrador")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("cafeteriakevin")).not.toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe("/inventario?negocio=otronegocio");
    expect(tokenStore.get()).toBe("token-alta");
    expect(localStorage.getItem("bamardev_web_alias")).toBe("billarlospinos");
  });
});
