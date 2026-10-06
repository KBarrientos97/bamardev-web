import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstadoEditor } from "../../lib/pagina/tipos";

/** "Mi página" con la API simulada: editar, ver la vista previa y guardar. */

vi.mock("../../lib/pagina/apiPagina", () => ({
  BASE_API: "/api",
  urlDeImagen: (r: string | null) => (r ? `/api${r}` : null),
  apiPagina: {
    estado: vi.fn(),
    guardar: vi.fn(),
    crearEnlace: vi.fn(),
    editarEnlace: vi.fn(),
    borrarEnlace: vi.fn(),
    ordenar: vi.fn(),
    sucursal: vi.fn(),
    borrarImagen: vi.fn(),
    subirImagen: vi.fn(),
    enlaceCorto: vi.fn(),
  },
}));

import { apiPagina } from "../../lib/pagina/apiPagina";
import MiPagina from "./MiPagina";

const MUESTRAS = [
  { clave: "CIRUELA", nombre: "Ciruela", hex: "#9B2C6B" },
  { clave: "LAVANDA", nombre: "Lavanda", hex: "#7357B8" },
];

function estado(cambios: Partial<EstadoEditor["pagina"]> = {}): EstadoEditor {
  return {
    subdominio: "bellavista",
    urlPublica: "https://app-qa.bamardev.com/p/bellavista",
    negocio: { nombre: "Salón Bella Vista", rubro: "PELUQUERIA", iniciales: "SB" },
    pagina: {
      publicada: false,
      bloqueada: false,
      motivoBloqueo: null,
      descripcion: null,
      colorClave: "CIRUELA",
      formaBotones: "REDONDEADO",
      tipografia: "MODERNA",
      anuncioTexto: null,
      anuncioHasta: null,
      anuncioUrl: null,
      enlaceDestacadoId: null,
      mostrarReservar: true,
      actualizadoEn: "2026-10-06T00:00:00Z",
      ...cambios,
    },
    imagenes: { logo: null, portada: null },
    enlaces: [
      { id: 1, tipo: "INSTAGRAM", formato: "ICONO", etiqueta: "Instagram", valor: "@bv", url: "https://www.instagram.com/bv", icono: null, orden: 1, visible: true, clics: 124 },
      { id: 2, tipo: "TIKTOK", formato: "ICONO", etiqueta: "TikTok", valor: "@bv", url: "https://www.tiktok.com/@bv", icono: null, orden: 2, visible: true, clics: 87 },
    ],
    sucursales: [
      { id: 10, nombre: "Centro", direccion: "Junín 245", telefono: "33445566", esPrincipal: true, publicarEnPagina: true, horarioTexto: "9 a 20", mapsUrl: null },
    ],
    reservaOnline: true,
    enlacesCortos: false,
    muestras: MUESTRAS,
  };
}

async function montar() {
  render(
    <MemoryRouter>
      <MiPagina />
    </MemoryRouter>,
  );
  await act(async () => {});
}

const previa = () => screen.getByTestId("vista-pagina");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiPagina.estado).mockResolvedValue(estado());
});

describe("Mi página", () => {
  it("muestra la dirección, los enlaces con sus clics y la vista previa", async () => {
    await montar();
    expect(screen.getByText("app-qa.bamardev.com/p/bellavista")).toBeInTheDocument();
    expect(screen.getByText("124 clics")).toBeInTheDocument();
    expect(screen.getByText("Sin publicar")).toBeInTheDocument();
    expect(within(previa()).getByRole("heading", { name: "Salón Bella Vista" })).toBeInTheDocument();
    expect(within(previa()).getByText("Reservar turno")).toBeInTheDocument();
  });

  it("la vista previa es la página de verdad: rubro, Privacidad, sin otro main ni h1 (B24)", async () => {
    const base = estado();
    vi.mocked(apiPagina.estado).mockResolvedValue({
      ...base,
      negocio: { ...base.negocio, rubroNombre: "Peluquería" },
      sucursales: base.sucursales.map((s) => ({ ...s, publicaReservas: true, slugReservas: "centro" })),
    });
    await montar();
    expect(within(previa()).getByText("Peluquería")).toBeInTheDocument();
    expect(within(previa()).getByRole("link", { name: "Privacidad" })).toBeInTheDocument();
    expect(within(previa()).queryByRole("main")).not.toBeInTheDocument();
    expect(within(previa()).queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    // La tarjeta de la sucursal que publica reservas también lleva Reservar (B07).
    expect(within(previa()).getByRole("link", { name: "Reservar" })).toBeInTheDocument();
  });

  it("la vista previa cambia en vivo y Guardar manda sólo lo cambiado", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Descripción corta"), { target: { value: "Cortes y color" } });
    expect(within(previa()).getByText("Cortes y color")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Color Lavanda" }));
    expect(screen.getByRole("radio", { name: "Color Lavanda" })).toHaveAttribute("aria-checked", "true");

    vi.mocked(apiPagina.guardar).mockResolvedValue(estado({ descripcion: "Cortes y color", colorClave: "LAVANDA" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiPagina.guardar).toHaveBeenCalledWith({ descripcion: "Cortes y color", colorClave: "LAVANDA" });
    expect(screen.getByText("Cambios guardados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("Publicar manda publicada:true", async () => {
    vi.mocked(apiPagina.guardar).mockResolvedValue(estado({ publicada: true }));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await act(async () => {});
    expect(apiPagina.guardar).toHaveBeenCalledWith({ publicada: true });
    expect(screen.getByText("Publicada")).toBeInTheDocument();
  });

  it("bloqueada por BamarDev: lo explica y no ofrece publicar", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(estado({ bloqueada: true, motivoBloqueo: "Contenido indebido" }));
    await montar();
    expect(screen.getByText(/BamarDev despublicó tu página: Contenido indebido/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publicar" })).not.toBeInTheDocument();
  });

  it("ordenar con las flechas manda el orden nuevo", async () => {
    vi.mocked(apiPagina.ordenar).mockResolvedValue(estado());
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Bajar Instagram" }));
    await act(async () => {});
    expect(apiPagina.ordenar).toHaveBeenCalledWith([2, 1]);
  });

  it("alta de un WhatsApp: pide el número, no la URL", async () => {
    vi.mocked(apiPagina.crearEnlace).mockResolvedValue(estado().enlaces[0]);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Red social" }));
    const dialogo = screen.getByRole("dialog", { name: "Nueva red o enlace" });
    fireEvent.change(within(dialogo).getByLabelText("Número"), { target: { value: "70123456" } });
    fireEvent.change(within(dialogo).getByLabelText("Mensaje inicial"), { target: { value: "Hola" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await act(async () => {});
    expect(apiPagina.crearEnlace).toHaveBeenCalledWith({
      tipo: "WHATSAPP",
      formato: "ICONO",
      etiqueta: undefined,
      valor: "70123456",
      mensaje: "Hola",
      icono: undefined,
    });
  });

  it("el error del backend se muestra en el formulario", async () => {
    vi.mocked(apiPagina.crearEnlace).mockRejectedValue(new Error("Ese enlace no es de Instagram"));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Red social" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("Tipo"), { target: { value: "INSTAGRAM" } });
    fireEvent.change(within(dialogo).getByLabelText("@usuario"), { target: { value: "https://evil.com" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await act(async () => {});
    expect(within(dialogo).getByText("Ese enlace no es de Instagram")).toBeInTheDocument();
  });
});
