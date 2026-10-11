import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatPagina from "./ChatPagina";

/**
 * El asistente de la página con el servicio simulado: aparece sólo si el
 * servicio responde, pinta los bloques (nunca HTML) y no deja pasar enlaces
 * raros.
 */

type Ruta = (url: string, init?: RequestInit) => { status: number; body?: unknown };

function servicio(rutas: Ruta) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const r = rutas(url, init);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  });
}

const montar = () =>
  render(<ChatPagina subdominio="elnavajazo" nombre="Barbería El Navajazo" color="#3F3C3A" reservar />);

beforeEach(() => {
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ChatPagina", () => {
  it("con el servicio caído no aparece nada", async () => {
    vi.stubGlobal("fetch", servicio(() => ({ status: 502 })));
    const { container } = montar();
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("abre con el saludo armado acá, sin llamar al servicio", async () => {
    const fetchMock = servicio(() => ({ status: 200, body: { ok: true } }));
    vi.stubGlobal("fetch", fetchMock);
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Abrir el asistente" }));
    expect(screen.getByText(/asistente automático de Barbería El Navajazo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reservar" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/chat/salud");
  });

  it("manda la opción elegida, guarda la sesión y pinta los precios", async () => {
    const fetchMock = servicio((url) =>
      url.endsWith("/salud")
        ? { status: 200, body: { ok: true } }
        : {
            status: 200,
            body: {
              sesionId: "s-1",
              bloques: [{ tipo: "items", items: [{ nombre: "Corte degradado", precio: "Bs 50", duracion: "40 min", reservable: true }] }],
            },
          },
    );
    vi.stubGlobal("fetch", fetchMock);
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Abrir el asistente" }));
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

  it("las horas libres llevan a la reserva; un enlace que no es http no se pinta", async () => {
    vi.stubGlobal(
      "fetch",
      servicio((url) =>
        url.endsWith("/salud")
          ? { status: 200, body: { ok: true } }
          : {
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
                    horas: ["16:00", "16:10"],
                    reservarUrl: "https://link-qa.bamardev.com/elnavajazo/reservar/principal",
                  },
                  { tipo: "enlace", etiqueta: "Truco", url: "javascript:alert(1)" },
                  { tipo: "enlace", etiqueta: "Escribir por WhatsApp", url: "https://wa.me/59170000000" },
                ],
              },
            },
      ),
    );
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Abrir el asistente" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Horarios" }));
    });
    expect(await screen.findByRole("link", { name: "16:00" })).toHaveAttribute(
      "href",
      "https://link-qa.bamardev.com/elnavajazo/reservar/principal",
    );
    expect(screen.queryByText("Truco")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Escribir por WhatsApp" })).toHaveAttribute("href", "https://wa.me/59170000000");
  });

  it("con Turnstile, no manda sin verificar", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "0xCLAVE_PUBLICA");
    const fetchMock = servicio(() => ({ status: 200, body: { ok: true } }));
    vi.stubGlobal("fetch", fetchMock);
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Abrir el asistente" }));
    expect(screen.getByTestId("captcha")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Precios" }));
    });
    expect(screen.getByText(/Completá la verificación/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("si el servicio falla al responder, avisa sin romper la página", async () => {
    vi.stubGlobal(
      "fetch",
      servicio((url) => (url.endsWith("/salud") ? { status: 200, body: { ok: true } } : { status: 503, body: { mensaje: "x" } })),
    );
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Abrir el asistente" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ubicación" }));
    });
    expect(await screen.findByText(/No pude responder ahora/)).toBeInTheDocument();
  });
});
