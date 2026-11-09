import type { ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EstadoEditor } from "../../lib/pagina/tipos";

/**
 * Mi página abierta por BamarDev (`/soporte`, "Te la armamos", PLAN-PAGINA-PRO
 * M5) y el aviso que ve el dueño después.
 */

vi.mock("../../lib/pagina/apiPagina", () => ({
  BASE_API: "/api",
  urlDeImagen: (r: string | null) => (r ? `/api${r}` : null),
  apiPagina: { estado: vi.fn(), guardar: vi.fn(), publicarCambios: vi.fn(), descartarBorrador: vi.fn(), publicacion: vi.fn() },
}));

import { apiPagina } from "../../lib/pagina/apiPagina";
import MiPagina from "./MiPagina";
import SoporteNegocio from "./SoporteNegocio";

function estado(armadoPorBamarDev = false): EstadoEditor {
  return {
    subdominio: "elfogon",
    urlPublica: "https://link-qa.bamardev.com/elfogon",
    negocio: { nombre: "Pollos El Fogón", rubro: "RESTAURANTE", iniciales: "EF" },
    pagina: {
      publicada: true,
      bloqueada: false,
      motivoBloqueo: null,
      descripcion: null,
      colorClave: "ROJO",
      formaBotones: "REDONDEADO",
      tipografia: "MODERNA",
      anuncioTexto: null,
      anuncioHasta: null,
      anuncioUrl: null,
      enlaceDestacadoId: null,
      mostrarReservar: false,
      actualizadoEn: "2026-11-08T00:00:00Z",
    },
    borrador: { hay: true, actualizadoEn: "2026-11-08T00:00:00Z", armadoPorBamarDev },
    imagenes: { logo: null, portada: null },
    enlaces: [],
    sucursales: [
      { id: 1, nombre: "Cañoto", direccion: "Av. Cañoto 455", telefono: null, esPrincipal: true, publicarEnPagina: true, horarioTexto: null },
    ],
    reservaOnline: false,
    enlacesCortos: true,
    muestras: [{ clave: "ROJO", nombre: "Rojo", hex: "#C0262D" }],
    catalogo: [],
    topeCatalogo: 60,
  };
}

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (p: Record<string, unknown>) => `${b64({ alg: "HS256" })}.${b64(p)}.firma`;

async function montar(nodo: ReactNode) {
  render(<MemoryRouter>{nodo}</MemoryRouter>);
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiPagina.estado).mockResolvedValue(estado());
});

afterEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("Mi página en modo armado", () => {
  it("la franja con el negocio y cuánto le queda; sin publicar ni descartar ni salir del editor", async () => {
    await montar(<MiPagina soporte={{ armado: true, vence: Date.now() + 25 * 60_000 + 5_000 }} />);
    expect(screen.getByText(/Estás armando el sitio de Pollos El Fogón como BamarDev · se vence en 25 min/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publicar cambios" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Descartar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Despublicar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Compartir" })).toBeNull();
    expect(screen.queryByRole("button", { name: /cartel QR/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Ver mis enlaces cortos" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Editar dirección, horario y ubicación/ })).toBeNull();
    // El catálogo no pasa por el borrador: no se ofrece.
    expect(screen.getByText(/El catálogo se guarda al toque y no pasa por el borrador/)).toBeInTheDocument();
  });

  it("soporte puro: la franja de sólo lectura", async () => {
    await montar(<MiPagina soporte={{ armado: false, vence: Date.now() + 10 * 60_000 + 5_000 }} />);
    expect(screen.getByText("Modo soporte · sólo lectura · se vence en 10 min")).toBeInTheDocument();
  });
});

describe("el dueño, después", () => {
  it("ve que BamarDev le armó el sitio y lo publica él", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(estado(true));
    await montar(<MiPagina />);
    expect(screen.getByRole("note")).toHaveTextContent("BamarDev te armó el sitio: revisalo y apretá «Publicar cambios» cuando te guste.");
    expect(screen.getByRole("button", { name: "Publicar cambios" })).toBeEnabled();
  });

  it("sin armado, ningún aviso", async () => {
    await montar(<MiPagina />);
    expect(screen.queryByText(/BamarDev te armó el sitio/)).toBeNull();
  });
});

describe("/soporte", () => {
  it("con el acceso vigente abre Mi página en modo armado", async () => {
    sessionStorage.setItem("bamardev_web_token_soporte", jwt({ soporte: true, armado: true, exp: Date.now() / 1000 + 1800 }));
    window.history.replaceState(null, "", "/soporte");
    await montar(<SoporteNegocio />);
    await act(async () => {});
    expect(await screen.findByText(/Estás armando el sitio de Pollos El Fogón/)).toBeInTheDocument();
  });

  it("vencido, el cartel para volver a abrirlo desde el panel", async () => {
    sessionStorage.setItem("bamardev_web_token_soporte", jwt({ soporte: true, armado: true, exp: Date.now() / 1000 - 10 }));
    await montar(<SoporteNegocio />);
    expect(screen.getByRole("alert")).toHaveTextContent("Se venció el acceso");
    expect(screen.getByRole("alert")).toHaveTextContent("Volvé a abrirlo desde el panel");
    expect(sessionStorage.getItem("bamardev_web_token_soporte")).toBeNull();
  });

  it("sin acceso guardado, lo mismo", async () => {
    await montar(<SoporteNegocio />);
    expect(screen.getByRole("alert")).toHaveTextContent("Se venció el acceso");
  });
});
