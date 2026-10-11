import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaginaPublica as Pagina } from "../../lib/pagina/tipos";
import type { NegocioPublico } from "../../publico/apiReserva";

/**
 * La SPA en `link(-qa).bamardev.com` (simulado con `VITE_HOST_LINK=1`): las
 * direcciones cortas, los enlaces que se quedan en el host y nada de la app.
 */

vi.mock("../../publico/apiReserva", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../publico/apiReserva")>();
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
      urlIcs: () => "",
    },
  };
});

import { apiReserva, ErrorReserva } from "../../publico/apiReserva";
import { rutaPublica } from "../../publico/util";
import { urlPaginaDe, urlPrivacidadDe, urlReservaDe } from "../../lib/pagina/rutas";
import { esRutaPublica } from "../../lib/telemetria";
import RutasLink from "./RutasLink";

const PAGINA: Pagina = {
  subdominio: "bellavista",
  nombre: "Salón Bella Vista",
  rubro: "Peluquería",
  iniciales: "BV",
  descripcion: null,
  color: { clave: "VERDE", hex: "#0C875E" },
  formaBotones: "PILDORA",
  tipografia: "FUERTE",
  logoUrl: null,
  portadaUrl: null,
  anuncio: null,
  reservar: true,
  destacado: null,
  redes: [],
  botones: [],
  sucursales: [
    { nombre: "Centro", reservaSlug: "centro", direccion: null, telefono: null, horario: null, mapaUrl: null },
  ],
  catalogo: null,
  pie: { atribucionUrl: "https://bamardev.com" },
  og: { titulo: "Salón Bella Vista", descripcion: "", imagen: null, url: "https://link-qa.bamardev.com/bellavista" },
};

const NEGOCIO: NegocioPublico = {
  negocio: {
    nombre: "Salón Bella Vista",
    subdominio: "bellavista",
    rubro: "PELUQUERIA",
    telefono: "33000000",
    direccion: null,
    tema: null,
  },
  privacidadVersion: "v0.1",
  sucursales: [
    {
      slug: "centro",
      nombre: "Centro",
      direccion: null,
      telefono: null,
      servicios: [{ id: 1, nombre: "Corte dama", categoria: "Cortes", duracionMin: 45, precio: 80 }],
      profesionales: [{ id: 10, nombre: "Carla", servicioIds: [1] }],
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

let dondeEstoy = "";
function Ubicacion() {
  dondeEstoy = useLocation().pathname;
  return null;
}

async function montar(ruta: string) {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <RutasLink />
      <Ubicacion />
    </MemoryRouter>,
  );
  await act(async () => {});
}

function fetchDePagina(status: number, cuerpo: unknown) {
  const f = vi.fn(async () => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", f);
  return f;
}

beforeEach(() => {
  vi.stubEnv("VITE_HOST_LINK", "1");
  vi.mocked(apiReserva.negocio).mockResolvedValue(NEGOCIO);
  Object.defineProperty(navigator, "sendBeacon", { value: vi.fn(() => true), configurable: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.mocked(apiReserva.negocio).mockReset();
  document.title = "";
});

describe("direcciones del host link", () => {
  it("los enlaces se arman cortos (y en la app, como siempre)", () => {
    expect(urlPaginaDe("bellavista")).toBe("/bellavista");
    expect(urlReservaDe("bellavista")).toBe("/bellavista/reservar");
    expect(urlPrivacidadDe("bellavista")).toBe("/bellavista/privacidad");
    expect(rutaPublica("bellavista", "/c/TOKEN")).toBe("/bellavista/c/TOKEN");
    // Nada del host link va a PostHog.
    expect(esRutaPublica("/bellavista")).toBe(true);

    vi.unstubAllEnvs();
    expect(urlPaginaDe("bellavista")).toBe("/p/bellavista");
    expect(urlReservaDe("bellavista")).toBe("/r/bellavista/reservar");
    expect(urlPrivacidadDe("bellavista")).toBe("/p/bellavista/privacidad");
    expect(rutaPublica("bellavista", "/c/TOKEN")).toBe("/r/bellavista/c/TOKEN");
    expect(esRutaPublica("/pos")).toBe(false);
  });
});

describe("la SPA en el host link", () => {
  it("/<sub> es la página, y Reservar y Privacidad se quedan en el host", async () => {
    const f = fetchDePagina(200, PAGINA);
    await montar("/bellavista");
    // Las pantallas son diferidas (lazy): se espera a que lleguen.
    expect(await screen.findByRole("heading", { level: 1, name: "Salón Bella Vista" })).toBeInTheDocument();
    expect(f).toHaveBeenCalledWith("/api/publico/pagina/bellavista");
    expect(screen.getByRole("link", { name: /Reservar turno/ })).toHaveAttribute("href", "/bellavista/reservar");
    expect(screen.getByRole("link", { name: "Privacidad" })).toHaveAttribute("href", "/bellavista/privacidad");
  });

  it("/<sub>/reservar es la reserva", async () => {
    await montar("/bellavista/reservar");
    expect(await screen.findByText("Corte dama")).toBeInTheDocument();
    expect(apiReserva.negocio).toHaveBeenCalledWith("bellavista");
  });

  it("la privacidad es la de la página si está publicada", async () => {
    fetchDePagina(200, PAGINA);
    await montar("/bellavista/privacidad");
    expect(await screen.findByRole("heading", { name: "Tus datos en Salón Bella Vista" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Volver a Salón Bella Vista/ })).toHaveAttribute("href", "/bellavista");
  });

  it("sin página publicada, la privacidad sale de la reserva", async () => {
    fetchDePagina(404, { message: "Esta página no está disponible" });
    await montar("/bellavista/privacidad");
    expect(await screen.findByRole("link", { name: "Volver a reservar" })).toHaveAttribute("href", "/bellavista/reservar");
    expect(apiReserva.negocio).toHaveBeenCalledWith("bellavista");
  });

  it("las direcciones viejas pasan a la corta", async () => {
    fetchDePagina(200, PAGINA);
    await montar("/p/bellavista");
    await waitFor(() => expect(dondeEstoy).toBe("/bellavista"));
  });

  it("la app no existe: ni login ni pantallas, sólo 'no disponible'", async () => {
    fetchDePagina(404, {});
    for (const ruta of ["/inventario/productos", "/configuracion/negocio", "/bellavista/algo/mas"]) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[ruta]}>
          <RutasLink />
        </MemoryRouter>,
      );
      expect(await screen.findByRole("heading", { name: "Esta página no está disponible" })).toBeInTheDocument();
      expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument();
      expect(apiReserva.negocio).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("un negocio sin reserva online: el 404 de la reserva", async () => {
    vi.mocked(apiReserva.negocio).mockRejectedValue(new ErrorReserva("No disponible", 404));
    await montar("/bellavista/reservar");
    expect(await screen.findByText("No disponible por internet")).toBeInTheDocument();
  });
});
