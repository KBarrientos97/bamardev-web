import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatPagina from "./ChatPagina";

/**
 * El asistente de la página con el servicio simulado: aparece sólo si el
 * servicio saluda, pinta los bloques (nunca HTML), no deja pasar enlaces
 * raros, espera el captcha y deja mensajes al negocio.
 */

type Ruta = (url: string, init?: RequestInit) => { status: number; body?: unknown };

const SALUDO = {
  bloques: [
    { tipo: "texto", texto: "¡Hola! Soy el asistente automático de Barbería El Navajazo." },
    { tipo: "opciones", opciones: ["Horarios", "Precios", "Ubicación", "Reservar"] },
  ],
};

function servicio(rutas: Ruta) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const r = url.endsWith("/inicio") ? { status: 200, body: SALUDO } : rutas(url, init);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  });
}

const montar = () => render(<ChatPagina subdominio="elnavajazo" nombre="Barbería El Navajazo" color="#3F3C3A" />);

async function abrir() {
  fireEvent.click(await screen.findByRole("button", { name: "Abrir el asistente" }));
}

beforeEach(() => {
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ChatPagina", () => {
  it("si el servicio no saluda (sin el extra o caído) no aparece nada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    const { container } = montar();
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("el saludo y las opciones vienen del servicio, sin abrir sesión", async () => {
    const fetchMock = servicio(() => ({ status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    montar();
    await abrir();
    expect(screen.getByText(/asistente automático de Barbería El Navajazo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reservar" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/chat/elnavajazo/inicio");
  });

  it("manda la opción elegida, guarda la sesión y pinta los precios", async () => {
    const fetchMock = servicio(() => ({
      status: 200,
      body: {
        sesionId: "s-1",
        bloques: [{ tipo: "items", items: [{ nombre: "Corte degradado", precio: "Bs 50", duracion: "40 min", reservable: true }] }],
      },
    }));
    vi.stubGlobal("fetch", fetchMock);
    montar();
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Precios" }));
    });
    expect(await screen.findByText("Corte degradado")).toBeInTheDocument();
    expect(screen.getByText("Bs 50")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("/chat/elnavajazo/mensajes");
    expect(JSON.parse(String(init?.body))).toEqual({ texto: "Precios" });
    expect(sessionStorage.getItem("chat:elnavajazo")).toBe("s-1");

    // El segundo mensaje ya va con la sesión.
    fireEvent.change(screen.getByRole("textbox", { name: "Tu consulta" }), { target: { value: "y a qué hora abren" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2]![1]?.body))).toEqual({ sesionId: "s-1", texto: "y a qué hora abren" });
  });

  it("cada hora lleva a la reserva precargada; un enlace que no es http no se pinta", async () => {
    const reservar = "https://link-qa.bamardev.com/elnavajazo/reservar/principal?paso=horario&servicio=12";
    vi.stubGlobal(
      "fetch",
      servicio(() => ({
        status: 200,
        body: {
          sesionId: "s-2",
          bloques: [
            {
              tipo: "horas",
              servicio: "Corte degradado",
              sucursal: "Principal",
              fecha: "2026-10-12",
              etiquetaFecha: "el lunes 12/10",
              horas: [
                { hora: "16:00", url: `${reservar}&inicio=2026-10-12T20%3A00%3A00.000Z` },
                { hora: "16:30", url: `${reservar}&inicio=2026-10-12T20%3A30%3A00.000Z` },
              ],
              masUrl: reservar,
            },
            { tipo: "enlace", etiqueta: "Truco", url: "javascript:alert(1)" },
            { tipo: "enlace", etiqueta: "Escribir por WhatsApp", url: "https://wa.me/59170000000" },
          ],
        },
      })),
    );
    montar();
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Horarios" }));
    });
    expect(await screen.findByRole("link", { name: "Reservar el lunes 12/10 a las 16:00" })).toHaveAttribute(
      "href",
      `${reservar}&inicio=2026-10-12T20%3A00%3A00.000Z`,
    );
    expect(screen.getByRole("link", { name: /Ver más horarios/ })).toHaveAttribute("href", reservar);
    expect(screen.queryByText("Truco")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Escribir por WhatsApp" })).toHaveAttribute("href", "https://wa.me/59170000000");
  });

  it("con Turnstile, el primer mensaje espera la verificación en vez de fallar", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "0xCLAVE_PUBLICA");
    const fetchMock = servicio(() => ({ status: 200, body: { sesionId: "s", bloques: [] } }));
    vi.stubGlobal("fetch", fetchMock);
    montar();
    await abrir();
    expect(screen.getByTestId("captcha")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Precios" }));
    });
    // Se ve lo que escribió y que está verificando; todavía no salió nada.
    expect(screen.getByText("Precios", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Verificando…")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Esc cierra y el foco vuelve a la burbuja; al abrir, va al campo", async () => {
    vi.stubGlobal("fetch", servicio(() => ({ status: 500 })));
    montar();
    await abrir();
    expect(screen.getByRole("textbox", { name: "Tu consulta" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Abrir el asistente" })).toHaveFocus();
  });

  it("dejar un mensaje: el formulario va al backend y confirma", async () => {
    const fetchMock = servicio((url) =>
      url.includes("/asistente/mensajes")
        ? { status: 201, body: { ok: true } }
        : { status: 200, body: { sesionId: "s-3", bloques: [{ tipo: "texto", texto: "Dejá tus datos:" }, { tipo: "dejarMensaje" }] } },
    );
    vi.stubGlobal("fetch", fetchMock);
    montar();
    await abrir();
    fireEvent.change(screen.getByRole("textbox", { name: "Tu consulta" }), { target: { value: "dejar un mensaje" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    });
    fireEvent.change(screen.getByLabelText("Tu nombre"), { target: { value: "Ana Pérez" } });
    fireEvent.change(screen.getByLabelText("Tu teléfono"), { target: { value: "70012345" } });
    fireEvent.change(screen.getByLabelText("Tu consulta para el negocio"), { target: { value: "¿Tienen parqueo?" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar al negocio" }));
    });
    const llamada = fetchMock.mock.calls.find(([u]) => String(u).includes("/asistente/mensajes"))!;
    expect(llamada[0]).toBe("/api/publico/pagina/elnavajazo/asistente/mensajes");
    expect(JSON.parse(String(llamada[1]?.body))).toEqual({ nombre: "Ana Pérez", telefono: "70012345", mensaje: "¿Tienen parqueo?" });
    expect(await screen.findByText(/Le pasé tu mensaje al negocio/)).toBeInTheDocument();
  });

  it("si el servicio falla al responder, avisa sin romper la página", async () => {
    vi.stubGlobal("fetch", servicio(() => ({ status: 503, body: { mensaje: "x" } })));
    montar();
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ubicación" }));
    });
    expect(await screen.findByText(/No pude responder ahora/)).toBeInTheDocument();
  });
});
