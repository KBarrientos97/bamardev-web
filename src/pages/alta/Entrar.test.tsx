import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoginResponse, SesionNegocio } from "../../types";

/**
 * `/entrar#c=<código>` (PLAN-ALTA-LANDING): la landing crea la cuenta y salta
 * acá con un código de un solo uso. Se prueba con la app entera, como
 * App.test: lo que importa es que la sesión quede igual que con el login y
 * que cada uno caiga en su inicio.
 */

vi.mock("../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/api")>();
  // La licencia queda pendiente para siempre: acá no importa y así no pinta
  // nada después de que el test terminó.
  return {
    ...real,
    api: {
      login: vi.fn(),
      me: vi.fn(),
      entrarConCodigo: vi.fn(),
      licencia: vi.fn(() => new Promise(() => {})),
    },
  };
});

// Las pantallas no importan, sólo cuál se abre.
vi.mock("../../components/Layout", async () => {
  const { Outlet } = await import("react-router-dom");
  return { default: () => <Outlet /> };
});
vi.mock("../inventario/Dashboard", () => ({
  default: () => <p>Inicio del administrador</p>,
}));

import App from "../../App";
import "../../AppNegocio";
import { ApiError, NEGOCIO_KEY, USER_KEY, api, tokenStore } from "../../lib/api";
import { reiniciarEntradaParaTests } from "../../lib/alta/entrada";
import { usuarioDe } from "../../test/sesiones";

const BILLAR: SesionNegocio = {
  id: 31,
  nombre: "Billar Los Pinos",
  alias: "billarlospinos",
  tipoNegocio: "RESTAURANTE",
};
const ADMIN = usuarioDe("ADMIN", { id: 90, username: "admin", nombre: "Juan Pérez" });

const RESPUESTA: LoginResponse = {
  accessToken: "token-alta",
  usuario: ADMIN,
  negocio: BILLAR,
  licencia: {
    vencimiento: "2026-10-27",
    diasGracia: 3,
    urlPago: "",
    situacion: "activa",
    vigente: true,
    diasRestantes: 7,
    diasParaBloqueo: null,
    mensaje: "",
  },
};

async function abrir(ruta: string, { estricto = false } = {}) {
  window.history.replaceState(null, "", ruta);
  render(estricto ? <StrictMode><App /></StrictMode> : <App />);
  await act(async () => {
    await import("../../AppNegocio");
  });
}

const bienvenida = () => screen.queryByRole("dialog", { name: "¡Listo, tu cuenta está creada!" });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  reiniciarEntradaParaTests();
});

describe("canjear el código de la landing", () => {
  it("deja la sesión como el login y lleva al inicio del administrador", async () => {
    vi.mocked(api.entrarConCodigo).mockResolvedValue(RESPUESTA);
    // StrictMode monta dos veces: el código es de un solo uso y no puede
    // salir dos pedidos (el segundo diría "ya se usó").
    await abrir("/entrar#c=abc123", { estricto: true });

    expect(api.entrarConCodigo).toHaveBeenCalledTimes(1);
    expect(api.entrarConCodigo).toHaveBeenCalledWith("abc123");
    // Lo mismo que guarda el login: token, usuario, negocio y alias recordado.
    expect(tokenStore.get()).toBe("token-alta");
    expect(JSON.parse(localStorage.getItem(USER_KEY) ?? "{}").username).toBe("admin");
    expect(JSON.parse(localStorage.getItem(NEGOCIO_KEY) ?? "{}").alias).toBe("billarlospinos");
    expect(localStorage.getItem("bamardev_web_alias")).toBe("billarlospinos");
    // Y cae donde caería entrando por el login.
    expect(screen.getByText("Inicio del administrador")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/inventario");
    expect(window.location.hash).toBe("");
  });

  it("borra el código de la dirección antes de que el backend conteste", async () => {
    vi.mocked(api.entrarConCodigo).mockReturnValue(new Promise(() => {}));
    await abrir("/entrar?negocio=billarlospinos#c=abc123");

    expect(screen.getByText("Entrando a tu cuenta…")).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain("abc123");
    // El `?` se conserva: es el alias del login de respaldo.
    expect(window.location.pathname + window.location.search).toBe("/entrar?negocio=billarlospinos");
  });
});

describe("la bienvenida", () => {
  it("muestra el código del negocio y el usuario, y sale una sola vez", async () => {
    const copiar = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: copiar }, configurable: true });
    vi.mocked(api.entrarConCodigo).mockResolvedValue(RESPUESTA);
    await abrir("/entrar#c=abc123");

    const dialogo = bienvenida();
    expect(dialogo).toBeInTheDocument();
    expect(screen.getByTestId("bienvenida-alias")).toHaveTextContent("billarlospinos");
    expect(dialogo).toHaveTextContent("admin");
    expect(dialogo).toHaveTextContent("Es la que elegiste");
    expect(dialogo).toHaveTextContent("7 días de prueba gratis (hasta el 27/10/2026)");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copiar mis datos" }));
    });
    expect(copiar).toHaveBeenCalledWith(expect.stringContaining("Código del negocio: billarlospinos"));
    expect(copiar.mock.calls[0][0]).toContain("Usuario: admin");
    expect(screen.getByRole("button", { name: "Datos copiados" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Empezar" }));
    expect(bienvenida()).not.toBeInTheDocument();

    // Otro día, con la sesión guardada: ya no sale.
    cleanup();
    reiniciarEntradaParaTests();
    await abrir("/");
    expect(screen.getByText("Inicio del administrador")).toBeInTheDocument();
    expect(bienvenida()).not.toBeInTheDocument();
  });

  it("si recarga sin cerrarla, sigue ahí", async () => {
    vi.mocked(api.entrarConCodigo).mockResolvedValue(RESPUESTA);
    await abrir("/entrar#c=abc123");
    expect(bienvenida()).toBeInTheDocument();

    cleanup();
    reiniciarEntradaParaTests();
    await abrir("/inventario");
    expect(bienvenida()).toBeInTheDocument();
  });

  it("no sale a quien entra por el login", async () => {
    tokenStore.set("token-alta");
    localStorage.setItem(USER_KEY, JSON.stringify(ADMIN));
    localStorage.setItem(NEGOCIO_KEY, JSON.stringify(BILLAR));
    await abrir("/");
    expect(screen.getByText("Inicio del administrador")).toBeInTheDocument();
    expect(bienvenida()).not.toBeInTheDocument();
  });
});

describe("cuando el código no sirve", () => {
  it("vencido o usado: lo dice y manda al login con el alias de la dirección", async () => {
    vi.mocked(api.entrarConCodigo).mockRejectedValue(
      new ApiError("Código inválido o vencido", 401, { codigo: "CODIGO_INVALIDO" }),
    );
    await abrir("/entrar?negocio=billarlospinos#c=viejo");

    expect(screen.getByRole("alert")).toHaveTextContent("El enlace ya se usó o venció");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Entrá con tu código de negocio, el usuario admin y tu contraseña",
    );
    expect(tokenStore.get()).toBeNull();
    expect(window.location.hash).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Ir a iniciar sesión" }));
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("cafeteriakevin")).toHaveValue("billarlospinos");
    expect(window.location.pathname).toBe("/");
  });

  it("con ?negocio= y un código inválido, el login queda con ese alias y no con el recordado", async () => {
    // La compu ya tenía otro negocio recordado: gana el de la cuenta nueva.
    localStorage.setItem("bamardev_web_alias", "pollosdonomar");
    vi.mocked(api.entrarConCodigo).mockRejectedValue(new ApiError("Código inválido", 400));
    await abrir("/entrar?negocio=x#c=inv%C3%A1lido");

    expect(api.entrarConCodigo).toHaveBeenCalledWith("inválido");
    fireEvent.click(screen.getByRole("button", { name: "Ir a iniciar sesión" }));
    expect(screen.getByPlaceholderText("cafeteriakevin")).toHaveValue("x");
    expect(window.location.pathname + window.location.search).toBe("/");
  });

  it("sin alias en la dirección, el login queda sin prellenar", async () => {
    vi.mocked(api.entrarConCodigo).mockRejectedValue(new ApiError("Código inválido", 400));
    await abrir("/entrar#c=viejo");

    fireEvent.click(screen.getByRole("button", { name: "Ir a iniciar sesión" }));
    expect(screen.getByPlaceholderText("cafeteriakevin")).toHaveValue("");
  });

  it("sin código en la dirección no llama al backend", async () => {
    await abrir("/entrar");
    expect(api.entrarConCodigo).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("El enlace ya se usó o venció");
  });

  it("sin internet ofrece reintentar con el mismo código", async () => {
    vi.mocked(api.entrarConCodigo)
      .mockRejectedValueOnce(new ApiError("Sin conexión", 0))
      .mockResolvedValueOnce(RESPUESTA);
    await abrir("/entrar#c=abc123");
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos conectar");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    expect(api.entrarConCodigo).toHaveBeenCalledTimes(2);
    expect(api.entrarConCodigo).toHaveBeenLastCalledWith("abc123");
    expect(screen.getByText("Inicio del administrador")).toBeInTheDocument();
  });
});

/**
 * B5: el login de siempre toma el alias del enlace (`?negocio=…` o
 * `?alias=…`), en cualquier ruta en la que aparezca sin sesión. Va acá y no
 * en Login.test porque lo que importa es la dirección real del navegador.
 */
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
