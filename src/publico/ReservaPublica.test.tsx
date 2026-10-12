import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CitaPublica, NegocioPublico } from "./apiReserva";

/**
 * La reserva pública (P1-P8) con la API mockeada: el recorrido completo, el
 * 409 que no pierde lo cargado, el campo trampa, el 404 genérico y el enlace
 * de gestión (confirmar, cancelar, fuera de ventana).
 */

vi.mock("./apiReserva", async (importOriginal) => {
  const real = await importOriginal<typeof import("./apiReserva")>();
  return {
    ...real,
    apiReserva: {
      negocio: vi.fn(),
      disponibilidad: vi.fn(),
      reservar: vi.fn(),
      ver: vi.fn(),
      confirmar: vi.fn(),
      cancelar: vi.fn(),
      reprogramar: vi.fn(),
      pedirBorrado: vi.fn(),
      urlIcs: (sub: string, token: string) => `/api/publico/reservas/${sub}/citas/${token}/ics`,
    },
  };
});

import { apiReserva, ErrorReserva } from "./apiReserva";
import ReservaPublica from "./ReservaPublica";

/** Martes 13-oct-2026: las 14:30Z son las 10:30 de La Paz. */
const H1030 = "2026-10-13T14:30:00.000Z";
const H1100 = "2026-10-13T15:00:00.000Z";
const H1500 = "2026-10-13T19:00:00.000Z";

const NEGOCIO: NegocioPublico = {
  negocio: {
    nombre: "Salón Bella Vista",
    subdominio: "bellavista",
    rubro: "PELUQUERIA",
    telefono: "33000000",
    direccion: "Av. Busch 123",
    tema: null,
  },
  privacidadVersion: "v0.1",
  sucursales: [
    {
      slug: "centro",
      nombre: "Centro",
      direccion: "Av. Busch 123",
      telefono: "33000000",
      servicios: [
        { id: 1, nombre: "Corte dama", categoria: "Cortes", duracionMin: 45, precio: 80 },
        { id: 2, nombre: "Lavado y secado", categoria: "Cortes", duracionMin: 30, precio: 40 },
        { id: 3, nombre: "Tinte raíz", categoria: "Color", duracionMin: 90, precio: 180 },
      ],
      profesionales: [
        { id: 10, nombre: "Carla", servicioIds: [1, 2, 3] },
        { id: 11, nombre: "Marcos", servicioIds: [1] },
      ],
      reglas: {
        modoConfirmacion: "MANUAL",
        anticipacionMinHoras: 2,
        anticipacionMaxDias: 30,
        ventanaCancelacionHoras: 4,
        mostrarPrecios: true,
        primeraFecha: "2026-10-13",
        ultimaFecha: "2026-11-12",
      },
    },
  ],
};

function citaPublica(extra: Partial<CitaPublica> = {}): CitaPublica {
  return {
    codigo: "K7M2QX",
    estado: "SOLICITADA",
    inicio: H1030,
    fin: "2026-10-13T15:45:00.000Z",
    primerNombre: "María",
    servicios: [
      { id: 1, nombre: "Corte dama", duracionMin: 45 },
      { id: 2, nombre: "Lavado y secado", duracionMin: 30 },
    ],
    profesional: null,
    sucursal: { slug: "centro", nombre: "Centro", direccion: "Av. Busch 123", telefono: "33000000" },
    negocio: { nombre: "Salón Bella Vista", telefono: "33000000" },
    motivoRechazo: null,
    canceladaPorCliente: false,
    borradoSolicitado: false,
    ventanaCancelacionHoras: 4,
    limiteCambiosEn: "2026-10-13T10:30:00.000Z",
    puede: { confirmar: false, cancelar: true, reprogramar: true, pedirBorrado: true },
    ...extra,
  };
}

async function abrir(ruta: string) {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/r/*" element={<ReservaPublica />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T14:00:00.000Z"));
  vi.mocked(apiReserva.negocio).mockResolvedValue(NEGOCIO);
  vi.mocked(apiReserva.disponibilidad).mockResolvedValue({
    desde: "2026-10-13",
    ultimaFecha: "2026-11-12",
    dias: [
      { fecha: "2026-10-13", inicios: [H1030, H1100, H1500] },
      { fecha: "2026-10-14", inicios: [] },
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reservar (P2-P6)", () => {
  async function hastaElHorario() {
    await abrir("/r/bellavista/reservar");
    fireEvent.click(screen.getByRole("checkbox", { name: /Corte dama/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Lavado y secado/ }));
    expect(screen.getByText("2 servicios · 1 h 15")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await act(async () => {});
  }

  function completarDatos() {
    fireEvent.click(screen.getByRole("button", { name: "10:30" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "María Flores" } });
    fireEvent.change(screen.getByLabelText("Teléfono"), { target: { value: "76543210" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /cancelo con el enlace hasta 4 horas/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Acepto la política de privacidad/ }));
  }

  it("sólo ofrece a quien hace todos los servicios y manda la reserva entera", async () => {
    await hastaElHorario();
    // Marcos no hace "Lavado y secado": no aparece.
    const quien = screen.getByRole("region", { name: "Con quién" });
    expect(within(quien).getByRole("button", { name: /Carla/ })).toBeInTheDocument();
    expect(within(quien).queryByRole("button", { name: /Marcos/ })).toBeNull();
    // El día sin lugar se ve, pero no se toca.
    expect(screen.getByRole("button", { name: /Miércoles 14 de octubre, sin lugar/ })).toBeDisabled();

    vi.mocked(apiReserva.reservar).mockResolvedValue({ token: "tok_tok_tok_tok_tok_12", cita: citaPublica() });
    completarDatos();
    fireEvent.click(screen.getByRole("button", { name: "Reservar Martes 13 · 10:30" }));
    await act(async () => {});

    expect(apiReserva.reservar).toHaveBeenCalledWith("bellavista", {
      sucursal: "centro",
      servicioIds: [1, 2],
      profesionalId: null,
      inicio: H1030,
      nombre: "María Flores",
      telefono: "76543210",
      nota: undefined,
      aceptaPrivacidad: true,
      privacidadVersion: "v0.1",
      sitioWeb: undefined,
    });
    expect(screen.getByRole("heading", { name: "Reserva enviada" })).toBeInTheDocument();
    expect(screen.getByText("K7M2QX")).toBeInTheDocument();
    // Sin mensajes salientes: no promete un aviso que nunca llega (B18).
    expect(screen.getByText("Con quien esté libre (lo vas a ver en tu enlace cuando la confirmen)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver mi reserva" })).toHaveAttribute(
      "href",
      "/r/bellavista/c/tok_tok_tok_tok_tok_12",
    );
    expect(screen.getByRole("link", { name: /Agregar a mi calendario/ })).toHaveAttribute(
      "href",
      "/api/publico/reservas/bellavista/citas/tok_tok_tok_tok_tok_12/ics",
    );
    // Queda guardada en el teléfono para "Ver mi última reserva".
    expect(localStorage.getItem("bamardev_reserva_bellavista")).toBe("tok_tok_tok_tok_tok_12");
  });

  it("desde el asistente llega con el servicio y la hora elegidos: sólo faltan sus datos", async () => {
    await abrir(`/r/bellavista/reservar/centro?paso=horario&servicio=1&inicio=${encodeURIComponent(H1500)}`);
    expect(apiReserva.disponibilidad).toHaveBeenCalledWith(
      "bellavista",
      expect.objectContaining({ servicios: [1], desde: "2026-10-13" }),
    );
    expect(screen.getByRole("button", { name: "15:00" })).toHaveAttribute("aria-pressed", "true");

    vi.mocked(apiReserva.reservar).mockResolvedValue({ token: "tok_tok_tok_tok_tok_12", cita: citaPublica() });
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "María Flores" } });
    fireEvent.change(screen.getByLabelText("Teléfono"), { target: { value: "76543210" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /cancelo con el enlace hasta 4 horas/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Acepto la política de privacidad/ }));
    fireEvent.click(screen.getByRole("button", { name: "Reservar Martes 13 · 15:00" }));
    await act(async () => {});
    expect(apiReserva.reservar).toHaveBeenCalledWith(
      "bellavista",
      expect.objectContaining({ servicioIds: [1], inicio: H1500 }),
    );
  });

  it("un servicio que no es de la sucursal o una hora inválida se ignoran", async () => {
    await abrir("/r/bellavista/reservar/centro?paso=horario&servicio=99&inicio=mañana");
    // Sin servicio válido vuelve a P2, como cualquier recarga sin selección.
    expect(screen.getByRole("checkbox", { name: /Corte dama/ })).not.toBeChecked();
  });

  it("QA N2-06: precio y duración del profesional elegido, y \"desde\" con cualquiera", async () => {
    const suc = NEGOCIO.sucursales[0];
    vi.mocked(apiReserva.negocio).mockResolvedValue({
      ...NEGOCIO,
      sucursales: [
        {
          ...suc,
          servicios: suc.servicios.map((s) =>
            s.id === 1
              ? { ...s, precioDesde: 80, precioHasta: 100, duracionDesde: 45, duracionHasta: 60 }
              : { ...s, precioDesde: s.precio, precioHasta: s.precio, duracionDesde: s.duracionMin, duracionHasta: s.duracionMin },
          ),
          profesionales: [
            { id: 10, nombre: "Carla", servicioIds: [1, 2, 3] },
            {
              id: 11,
              nombre: "Marcos",
              servicioIds: [1],
              servicios: [{ servicioId: 1, precio: 100, duracionMin: 60 }],
            },
          ],
        },
      ],
    });
    await abrir("/r/bellavista/reservar");
    const corte = screen.getByRole("checkbox", { name: /Corte dama/ }).closest("label")!;
    expect(corte).toHaveTextContent("desde Bs 80");
    fireEvent.click(screen.getByRole("checkbox", { name: /Corte dama/ }));
    expect(screen.getByText(/desde Bs 80 · Se paga en el local/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await act(async () => {});
    fireEvent.click(within(screen.getByRole("region", { name: "Con quién" })).getByRole("button", { name: /Marcos/ }));
    await act(async () => {});
    expect(screen.getByText(/Corte dama · 1 h · Bs 100/)).toBeInTheDocument();
  });

  it("el Atrás vuelve a los servicios sin perder la selección y los pasos son 1 y 2 de 2 (B16)", async () => {
    await abrir("/r/bellavista/reservar");
    expect(screen.getByRole("navigation", { name: "Paso 1 de 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Corte dama/ }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await act(async () => {});
    expect(screen.getByRole("navigation", { name: "Paso 2 de 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver a los servicios" }));
    await act(async () => {});
    expect(screen.getByRole("checkbox", { name: /Corte dama/ })).toBeChecked();
    expect(screen.getByRole("navigation", { name: "Paso 1 de 2" })).toBeInTheDocument();
  });

  it("el error de las casillas se trae a la vista (B17)", async () => {
    const llevar = vi.fn();
    Element.prototype.scrollIntoView = llevar;
    await hastaElHorario();
    fireEvent.click(screen.getByRole("button", { name: "10:30" }));
    fireEvent.click(screen.getByRole("button", { name: /Reservar Martes 13/ }));
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent("marcá las dos casillas");
    expect(llevar).toHaveBeenCalled();
  });

  it("sin las casillas no manda nada", async () => {
    await hastaElHorario();
    fireEvent.click(screen.getByRole("button", { name: "10:30" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "María" } });
    fireEvent.change(screen.getByLabelText("Teléfono"), { target: { value: "76543210" } });
    fireEvent.click(screen.getByRole("button", { name: /Reservar Martes 13/ }));
    await act(async () => {});
    expect(apiReserva.reservar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("marcá las dos casillas");
  });

  it("si el horario se ocupó (409), avisa, recalcula y no pierde los datos", async () => {
    await hastaElHorario();
    completarDatos();
    vi.mocked(apiReserva.reservar).mockRejectedValue(
      new ErrorReserva("Ese horario se acaba de ocupar. Elegí otro de los que siguen libres.", 409, {
        codigo: "HUECO_OCUPADO",
        huecos: [H1100],
      }),
    );
    vi.mocked(apiReserva.disponibilidad).mockResolvedValue({
      desde: "2026-10-13",
      ultimaFecha: "2026-11-12",
      dias: [{ fecha: "2026-10-13", inicios: [H1100] }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Reservar Martes 13 · 10:30" }));
    await act(async () => {});
    await act(async () => {});

    expect(screen.getByRole("alert")).toHaveTextContent("se acaba de ocupar");
    expect(apiReserva.disponibilidad).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "10:30" })).toBeNull();
    expect(screen.getByLabelText("Nombre")).toHaveValue("María Flores");
    expect(screen.getByRole("button", { name: "Elegí un horario" })).toBeInTheDocument();
  });

  it("el campo trampa no se ve ni se alcanza con Tab, y viaja si un bot lo llena", async () => {
    await hastaElHorario();
    const trampa = document.querySelector<HTMLInputElement>('input[name="sitioWeb"]')!;
    expect(trampa).toHaveAttribute("tabindex", "-1");
    expect(trampa.closest("[aria-hidden='true']")).not.toBeNull();
    completarDatos();
    fireEvent.change(trampa, { target: { value: "http://spam" } });
    vi.mocked(apiReserva.reservar).mockResolvedValue({ token: "x".repeat(22), cita: citaPublica() });
    fireEvent.click(screen.getByRole("button", { name: /Reservar Martes 13/ }));
    await act(async () => {});
    expect(vi.mocked(apiReserva.reservar).mock.calls[0][1].sitioWeb).toBe("http://spam");
  });

  describe("captcha Turnstile", () => {
    /** El Turnstile falso: cada widget que se dibuja entrega su propio token. */
    let dibujados = 0;
    const turnstile = {
      render: vi.fn((_caja: HTMLElement, o: { callback?: (t: string) => void }) => {
        dibujados += 1;
        o.callback?.(`tok-${dibujados}`);
        return `w${dibujados}`;
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };

    beforeEach(() => {
      dibujados = 0;
      window.turnstile = turnstile;
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      delete window.turnstile;
    });

    it("sin site key no se dibuja ni viaja nada (como siempre)", async () => {
      vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
      await hastaElHorario();
      expect(screen.queryByTestId("captcha")).toBeNull();
      vi.mocked(apiReserva.reservar).mockResolvedValue({ token: "x".repeat(22), cita: citaPublica() });
      completarDatos();
      fireEvent.click(screen.getByRole("button", { name: /Reservar Martes 13/ }));
      await act(async () => {});
      expect(turnstile.render).not.toHaveBeenCalled();
      expect(vi.mocked(apiReserva.reservar).mock.calls[0][1]).not.toHaveProperty("captcha");
    });

    it("con site key: dibuja el widget en castellano y el token viaja con la reserva", async () => {
      vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "0xCLAVE_PUBLICA");
      await hastaElHorario();
      await act(async () => {});
      expect(screen.getByTestId("captcha")).toBeInTheDocument();
      expect(turnstile.render).toHaveBeenCalledWith(
        screen.getByTestId("captcha"),
        expect.objectContaining({ sitekey: "0xCLAVE_PUBLICA", language: "es" }),
      );
      vi.mocked(apiReserva.reservar).mockResolvedValue({ token: "x".repeat(22), cita: citaPublica() });
      completarDatos();
      fireEvent.click(screen.getByRole("button", { name: /Reservar Martes 13/ }));
      await act(async () => {});
      expect(vi.mocked(apiReserva.reservar).mock.calls[0][1].captcha).toBe("tok-1");
    });

    it("sin token todavía no manda la reserva", async () => {
      vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "0xCLAVE_PUBLICA");
      // Cloudflare todavía no resolvió: el widget está, pero sin token.
      turnstile.render.mockImplementationOnce(() => "w-pendiente");
      await hastaElHorario();
      await act(async () => {});
      completarDatos();
      fireEvent.click(screen.getByRole("button", { name: /Reservar Martes 13/ }));
      await act(async () => {});
      expect(apiReserva.reservar).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent("completá la verificación anti-robots");
    });

    it("400 CAPTCHA: muestra el mensaje, pide otro token y el reintento lo lleva", async () => {
      vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "0xCLAVE_PUBLICA");
      await hastaElHorario();
      await act(async () => {});
      vi.mocked(apiReserva.reservar)
        .mockRejectedValueOnce(
          new ErrorReserva("No pudimos verificar que seas una persona. Volvé a intentar.", 400, {
            codigo: "CAPTCHA",
          }),
        )
        .mockResolvedValueOnce({ token: "x".repeat(22), cita: citaPublica() });
      completarDatos();
      fireEvent.click(screen.getByRole("button", { name: /Reservar Martes 13/ }));
      await act(async () => {});
      await act(async () => {});
      expect(screen.getByRole("alert")).toHaveTextContent("No pudimos verificar que seas una persona");
      // El widget viejo se quita y se dibuja otro: el token gastado no se reusa.
      expect(turnstile.remove).toHaveBeenCalledWith("w1");
      expect(turnstile.render).toHaveBeenCalledTimes(2);

      fireEvent.click(screen.getByRole("button", { name: /Reservar Martes 13/ }));
      await act(async () => {});
      const llamadas = vi.mocked(apiReserva.reservar).mock.calls;
      expect(llamadas[0][1].captcha).toBe("tok-1");
      expect(llamadas[1][1].captcha).toBe("tok-2");
      expect(screen.getByRole("heading", { name: "Reserva enviada" })).toBeInTheDocument();
    });
  });
});

describe("portada y P8", () => {
  it("la portada lleva a reservar", async () => {
    await abrir("/r/bellavista");
    // El nombre del negocio es el h1 de la portada (B27).
    expect(screen.getByRole("heading", { level: 1, name: "Salón Bella Vista" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reservar" })).toHaveAttribute("href", "/r/bellavista/reservar");
  });

  it("una sucursal sin teléfono muestra el del negocio (B27)", async () => {
    vi.mocked(apiReserva.negocio).mockResolvedValue({
      ...NEGOCIO,
      sucursales: [{ ...NEGOCIO.sucursales[0], telefono: null }],
    });
    await abrir("/r/bellavista");
    expect(screen.getByRole("link", { name: "33000000" })).toHaveAttribute("href", "tel:33000000");
  });

  it("la reserva no se indexa y lleva su descripción (B06/B19)", async () => {
    await abrir("/r/bellavista");
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    expect(document.head.querySelector('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "Reservar en Salón Bella Vista",
    );
  });

  it("negocio sin reserva online: el aviso genérico", async () => {
    vi.mocked(apiReserva.negocio).mockRejectedValue(
      new ErrorReserva("Este negocio no recibe reservas por internet.", 404, { codigo: "RESERVAS_NO_DISPONIBLES" }),
    );
    await abrir("/r/otro/reservar");
    expect(screen.getByRole("heading", { name: "No disponible por internet" })).toBeInTheDocument();
  });

  it("la política de privacidad nombra al negocio como responsable", async () => {
    await abrir("/r/bellavista/privacidad");
    expect(screen.getAllByText(/Salón Bella Vista/).length).toBeGreaterThan(0);
    expect(screen.getByText(/es el responsable de tus datos/)).toBeInTheDocument();
    expect(screen.getByText("Versión v0.1.")).toBeInTheDocument();
    // La misma política que /p: dice lo que se guarda y a quién escribir (B08).
    expect(screen.getByText(/huella cifrada de tu conexión/)).toBeInTheDocument();
    expect(screen.getByText(/no usan cookies/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "al 33000000" })).toHaveAttribute("href", "tel:33000000");
  });
});

describe("gestión (P7)", () => {
  const TOKEN = "abcdefghijklmnopqrstuv";

  it("una reservada: confirmo que voy", async () => {
    vi.mocked(apiReserva.ver).mockResolvedValue(
      citaPublica({
        estado: "RESERVADA",
        profesional: { id: 10, nombre: "Carla" },
        puede: { confirmar: true, cancelar: true, reprogramar: true, pedirBorrado: true },
      }),
    );
    vi.mocked(apiReserva.confirmar).mockResolvedValue(
      citaPublica({ estado: "CONFIRMADA", profesional: { id: 10, nombre: "Carla" } }),
    );
    await abrir(`/r/bellavista/c/${TOKEN}`);
    expect(screen.getByText("Hola, María")).toBeInTheDocument();
    expect(screen.getByText(/con Carla/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Confirmo que voy/ }));
    await act(async () => {});
    expect(apiReserva.confirmar).toHaveBeenCalledWith("bellavista", TOKEN);
    expect(screen.getByText("CONFIRMADA")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirmo que voy/ })).toBeNull();
  });

  it("cancelar pide confirmación y muestra el resultado", async () => {
    vi.mocked(apiReserva.ver).mockResolvedValue(citaPublica());
    vi.mocked(apiReserva.cancelar).mockResolvedValue(
      citaPublica({
        estado: "CANCELADA",
        canceladaPorCliente: true,
        puede: { confirmar: false, cancelar: false, reprogramar: false, pedirBorrado: true },
      }),
    );
    await abrir(`/r/bellavista/c/${TOKEN}`);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar mi cita" }));
    expect(apiReserva.cancelar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar mi cita" }));
    await act(async () => {});
    expect(screen.getByText("Cancelaste esta cita.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hacer otra reserva" })).toBeInTheDocument();
  });

  it("fuera de la ventana no ofrece cambiar ni cancelar", async () => {
    vi.mocked(apiReserva.ver).mockResolvedValue(
      citaPublica({
        estado: "RESERVADA",
        puede: { confirmar: true, cancelar: false, reprogramar: false, pedirBorrado: true },
      }),
    );
    await abrir(`/r/bellavista/c/${TOKEN}`);
    expect(screen.queryByRole("button", { name: "Cancelar mi cita" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cambiar día u hora" })).toBeNull();
    expect(screen.getByText(/Ya no se puede cambiar ni cancelar por acá/)).toBeInTheDocument();
  });

  it("rechazada: muestra el motivo del negocio", async () => {
    vi.mocked(apiReserva.ver).mockResolvedValue(
      citaPublica({
        estado: "RECHAZADA",
        motivoRechazo: "Ese día no atendemos",
        puede: { confirmar: false, cancelar: false, reprogramar: false, pedirBorrado: true },
      }),
    );
    await abrir(`/r/bellavista/c/${TOKEN}`);
    expect(screen.getByText("NO APROBADA")).toBeInTheDocument();
    expect(screen.getByText(/Ese día no atendemos/)).toBeInTheDocument();
  });

  it("un enlace que no existe", async () => {
    vi.mocked(apiReserva.ver).mockRejectedValue(new ErrorReserva("No encontramos esa reserva.", 404, {}));
    await abrir(`/r/bellavista/c/${TOKEN}`);
    expect(screen.getByRole("heading", { name: "No encontramos esa reserva" })).toBeInTheDocument();
  });

  it("pedir que borren los datos", async () => {
    vi.mocked(apiReserva.ver).mockResolvedValue(citaPublica());
    vi.mocked(apiReserva.pedirBorrado).mockResolvedValue(
      citaPublica({ borradoSolicitado: true, puede: { confirmar: false, cancelar: true, reprogramar: true, pedirBorrado: false } }),
    );
    await abrir(`/r/bellavista/c/${TOKEN}`);
    fireEvent.click(screen.getByRole("button", { name: "Quiero que borren mis datos" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, pedir que borren mis datos" }));
    await act(async () => {});
    expect(apiReserva.pedirBorrado).toHaveBeenCalledWith("bellavista", TOKEN);
    expect(screen.getByText(/Pediste que borren tus datos/)).toBeInTheDocument();
  });
});

describe("en la computadora", () => {
  /** Una pantalla que se puede agrandar o achicar en medio de la prueba. */
  function pantalla(escritorio: boolean) {
    const avisos = new Set<() => void>();
    const estado = { escritorio };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        get matches() {
          return estado.escritorio;
        },
        addEventListener: (_: string, fn: () => void) => avisos.add(fn),
        removeEventListener: (_: string, fn: () => void) => avisos.delete(fn),
      })),
    );
    return (nuevo: boolean) => {
      estado.escritorio = nuevo;
      act(() => avisos.forEach((fn) => fn()));
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("el resumen de lo elegido va en la columna izquierda", async () => {
    pantalla(true);
    await abrir("/r/bellavista/reservar");
    const resumen = () => screen.getByRole("complementary", { name: "Tu reserva" });
    expect(within(resumen()).getByText("Salón Bella Vista")).toBeInTheDocument();
    expect(within(resumen()).getByText("Todavía no elegiste ningún servicio.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Corte dama/ }));
    expect(within(resumen()).getByText("Corte dama")).toBeInTheDocument();
    expect(within(resumen()).getByText("Bs 80")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await act(async () => {});
    // Un solo h1 por pantalla, aunque el paso del horario no lo muestre.
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(resumen()).getByText("Cualquiera")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "10:30" }));
    expect(within(resumen()).getByText("Martes 13 de octubre · 10:30")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver a los servicios" }));
    expect(screen.getByRole("checkbox", { name: /Corte dama/ })).toBeChecked();
  });

  it("en el celular no hay columna aparte", async () => {
    pantalla(false);
    await abrir("/r/bellavista/reservar");
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("agrandar la ventana no vuelve a montar el paso ni pierde la hora", async () => {
    const cambiar = pantalla(false);
    await abrir("/r/bellavista/reservar");
    fireEvent.click(screen.getByRole("checkbox", { name: /Corte dama/ }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "10:30" }));
    expect(apiReserva.disponibilidad).toHaveBeenCalledTimes(1);

    cambiar(true);
    await act(async () => {});
    expect(screen.getByRole("complementary", { name: "Tu reserva" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10:30" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Reservar Martes 13 · 10:30" })).toBeInTheDocument();
    // Si el selector se hubiera vuelto a montar, habría pedido los horarios otra vez.
    expect(apiReserva.disponibilidad).toHaveBeenCalledTimes(1);
  });

  it("la gestión deja la cita a la izquierda y las acciones a la derecha", async () => {
    pantalla(true);
    vi.mocked(apiReserva.ver).mockResolvedValue(citaPublica());
    await abrir("/r/bellavista/c/abcdefghijklmnopqrstuv");
    const lado = screen.getByRole("complementary", { name: "Tu reserva" });
    expect(within(lado).getByRole("heading", { level: 1, name: "Hola, María" })).toBeInTheDocument();
    expect(within(lado).getByText("POR CONFIRMAR")).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByRole("button", { name: "Cancelar mi cita" })).toBeInTheDocument();
  });
});
