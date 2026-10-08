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

  it("botón principal: sin botón saca «Reservar turno» de la página", async () => {
    await montar();
    expect(screen.getByRole("radio", { name: /Reservar turno/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /Sin botón principal/ }));
    expect(within(previa()).queryByText("Reservar turno")).not.toBeInTheDocument();

    vi.mocked(apiPagina.guardar).mockResolvedValue(estado({ mostrarReservar: false }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiPagina.guardar).toHaveBeenCalledWith({ mostrarReservar: false, enlaceDestacadoId: null });
  });

  it("botón principal sin reserva online (una pollería): no ofrece reservar", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue({ ...estado(), reservaOnline: false });
    await montar();
    expect(screen.queryByRole("radio", { name: /Reservar turno/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Sin botón principal/ })).toBeChecked();
  });

  it("botón principal WhatsApp sin cargar: lo crea y queda como principal", async () => {
    const wa = {
      id: 5,
      tipo: "WHATSAPP" as const,
      formato: "BOTON" as const,
      etiqueta: "Escribinos por WhatsApp",
      valor: "70123456",
      url: "https://wa.me/59170123456",
      icono: null,
      orden: 3,
      visible: true,
      clics: 0,
    };
    vi.mocked(apiPagina.crearEnlace).mockResolvedValue(wa);
    await montar();
    fireEvent.click(screen.getByRole("radio", { name: /WhatsApp/ }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar mi WhatsApp" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("Número"), { target: { value: "70123456" } });
    vi.mocked(apiPagina.estado).mockResolvedValue({ ...estado(), enlaces: [...estado().enlaces, wa] });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await act(async () => {});
    expect(apiPagina.crearEnlace).toHaveBeenCalledWith(expect.objectContaining({ tipo: "WHATSAPP", formato: "BOTON" }));
    expect(screen.getByRole("radio", { name: /WhatsApp/ })).toBeChecked();
    expect(within(previa()).getByRole("link", { name: /Escribinos por WhatsApp/ })).toBeInTheDocument();
    expect(within(previa()).queryByText("Reservar turno")).not.toBeInTheDocument();

    vi.mocked(apiPagina.guardar).mockResolvedValue(estado({ mostrarReservar: false, enlaceDestacadoId: 5 }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiPagina.guardar).toHaveBeenCalledWith({ mostrarReservar: false, enlaceDestacadoId: 5 });
  });

  it("la vista previa se puede ver en computadora", async () => {
    await montar();
    expect(previa()).toHaveAttribute("data-modo", "movil");
    fireEvent.click(screen.getByRole("button", { name: "Computadora" }));
    expect(previa()).toHaveAttribute("data-modo", "escritorio");
    expect(screen.getByRole("button", { name: "Computadora" })).toHaveAttribute("aria-pressed", "true");
    expect(within(previa()).getByText("Reservar turno")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Celular" }));
    expect(previa()).toHaveAttribute("data-modo", "movil");
  });

  it("el mapa y el horario de la sucursal se guardan con «Guardar cambios» y se ven en la vista previa", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Mapa de Centro"), { target: { value: "https://maps.app.goo.gl/abc" } });
    expect(within(previa()).getByRole("link", { name: "Cómo llegar" })).toHaveAttribute("href", "https://maps.app.goo.gl/abc");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();

    const s = estado().sucursales[0];
    vi.mocked(apiPagina.sucursal).mockResolvedValue({ ...s, mapsUrl: "https://maps.app.goo.gl/abc" });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiPagina.sucursal).toHaveBeenCalledWith(10, { horarioTexto: "9 a 20", mapsUrl: "https://maps.app.goo.gl/abc" });
    // Sólo cambió la sucursal: la página no se manda.
    expect(apiPagina.guardar).not.toHaveBeenCalled();
    expect(screen.getByText("Cambios guardados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("un mapa que no es de Google Maps: dice de qué sucursal y no pierde lo escrito", async () => {
    vi.mocked(apiPagina.sucursal).mockRejectedValue(new Error("Ese enlace no es de Google Maps"));
    await montar();
    fireEvent.change(screen.getByLabelText("Mapa de Centro"), { target: { value: "https://otro.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(screen.getByText("Centro: Ese enlace no es de Google Maps")).toBeInTheDocument();
    expect(screen.getByLabelText("Mapa de Centro")).toHaveValue("https://otro.com");
  });

  it("volver a escribir lo guardado no deja la página como cambiada", async () => {
    await montar();
    fireEvent.change(screen.getByLabelText("Horario de Centro"), { target: { value: "9 a 21" } });
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Horario de Centro"), { target: { value: "9 a 20" } });
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
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

  it("Más formas: popup con al menos 9 formas; la elegida se ve en vivo y se manda al guardar", async () => {
    await montar();
    expect(screen.getByRole("button", { name: "Redondeados" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Más formas" }));
    const dialogo = screen.getByRole("dialog", { name: "Forma de los botones" });
    expect(within(dialogo).getAllByRole("radio").length).toBeGreaterThanOrEqual(9);
    expect(within(dialogo).getByRole("radio", { name: "Redondeados" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(within(dialogo).getByRole("radio", { name: "Contorno" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Más formas (elegida: Contorno)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Redondeados" })).toHaveAttribute("aria-pressed", "false");
    // El botón principal de la vista previa ya es de contorno: blanco con borde de color.
    const reservar = within(previa()).getByText("Reservar turno");
    expect(reservar.style.border).toBe("2px solid rgb(155, 44, 107)");
    expect(reservar.style.background).toBe("rgb(255, 255, 255)");

    vi.mocked(apiPagina.guardar).mockResolvedValue(estado({ formaBotones: "CONTORNO" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiPagina.guardar).toHaveBeenCalledWith({ formaBotones: "CONTORNO" });
  });

  it("Más letras: 30 letras agrupadas con el nombre del negocio; carga el catálogo sólo al abrir", async () => {
    await montar();
    expect(document.getElementById("fuentes-pagina-catalogo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Más letras" }));
    const dialogo = screen.getByRole("dialog", { name: "Letra del nombre" });
    expect(document.getElementById("fuentes-pagina-catalogo")).not.toBeNull();
    expect(within(dialogo).getAllByRole("radio")).toHaveLength(30);
    expect(within(dialogo).getAllByText("Salón Bella Vista")).toHaveLength(30);
    for (const grupo of ["Modernas", "Redondeadas", "Elegantes", "Fuertes", "Manuscritas"]) {
      expect(within(dialogo).getByRole("heading", { name: grupo })).toBeInTheDocument();
    }

    fireEvent.click(within(dialogo).getByRole("radio", { name: "Pacifico" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Más letras (elegida: Pacifico)" })).toHaveAttribute("aria-pressed", "true");
    expect(within(previa()).getByRole("heading", { name: "Salón Bella Vista" }).style.fontFamily).toContain("Pacifico");
    // La vista previa baja la letra elegida.
    expect(document.getElementById("fuentes-pagina-pacifico")).not.toBeNull();

    vi.mocked(apiPagina.guardar).mockResolvedValue(estado({ tipografia: "PACIFICO" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiPagina.guardar).toHaveBeenCalledWith({ tipografia: "PACIFICO" });
  });

  it("anuncio: 10 estilos y colores; avisa si la letra se lee mal y se manda al guardar", async () => {
    await montar();
    // Sin texto no hay nada que estilizar.
    expect(screen.queryByRole("radiogroup", { name: "Estilo del anuncio" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Anuncio destacado"), { target: { value: "2x1 los martes" } });
    const estilos = screen.getByRole("radiogroup", { name: "Estilo del anuncio" });
    expect(within(estilos).getAllByRole("radio")).toHaveLength(10);
    // Por defecto, la franja de siempre.
    expect(within(estilos).getByRole("radio", { name: "Franja suave" })).toHaveAttribute("aria-checked", "true");
    expect(within(previa()).getByRole("note")).toHaveStyle({ background: "#FFFBEB" });

    fireEvent.click(within(estilos).getByRole("radio", { name: "Franja llena" }));
    // Automático: el color de la página con letra blanca.
    expect(within(previa()).getByRole("note")).toHaveStyle({ background: "#9B2C6B" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Amarillo con letra blanca: se puede, pero avisa.
    fireEvent.click(screen.getByRole("radio", { name: "Color del anuncio #FDE047" }));
    fireEvent.click(screen.getByRole("radio", { name: "Color de la letra #FFFFFF" }));
    expect(within(previa()).getByRole("note")).toHaveStyle({ background: "#FDE047" });
    expect(screen.getByRole("alert")).toHaveTextContent(/La letra se va a leer mal/);
    expect(screen.getByRole("alert")).toHaveTextContent(/4,5 a 1/);

    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Usar automático" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Color del anuncio: automático" })).toHaveAttribute("aria-checked", "true");

    // A mano, en hex (sin el #, como lo copiaría cualquiera).
    fireEvent.change(screen.getByLabelText("Color del anuncio en hex"), { target: { value: "111827" } });
    expect(within(previa()).getByRole("note")).toHaveStyle({ background: "#111827" });

    vi.mocked(apiPagina.guardar).mockResolvedValue(estado());
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiPagina.guardar).toHaveBeenCalledWith({
      anuncioTexto: "2x1 los martes",
      anuncioEstilo: "SOLIDO",
      anuncioColorFondo: "#111827",
      anuncioColorTexto: null,
    });
  });

  it("anuncio con estilo guardado: el editor lo muestra elegido", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(
      estado({ anuncioTexto: "Martes 2x1", anuncioEstilo: "MARQUESINA", anuncioColorFondo: "#111827", anuncioColorTexto: "#FFFFFF" }),
    );
    await montar();
    expect(screen.getByRole("radio", { name: "Marquesina" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Color de la letra #FFFFFF" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Color del anuncio en hex")).toHaveValue("#111827");
    // La marquesina repite el texto para el bucle, pero la copia no se lee dos veces.
    const nota = within(previa()).getByRole("note");
    expect(within(nota).getAllByText("Martes 2x1")).toHaveLength(2);
    expect(nota.querySelectorAll('[aria-hidden="true"].bm-marquesina-copia')).toHaveLength(1);
  });
});
