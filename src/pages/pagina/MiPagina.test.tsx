import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstadoEditor, ItemCatalogoEditor } from "../../lib/pagina/tipos";

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
    crearItemCatalogo: vi.fn(),
    editarItemCatalogo: vi.fn(),
    ordenarCatalogo: vi.fn(),
    borrarItemCatalogo: vi.fn(),
    subirFotoCatalogo: vi.fn(),
    borrarFotoCatalogo: vi.fn(),
  },
}));

// jsdom no tiene canvas: la foto "achicada" es un blob cualquiera.
vi.mock("../../lib/pagina/imagen", () => ({
  prepararImagen: vi.fn(async () => new Blob(["x"], { type: "image/webp" })),
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
      catalogoTitulo: null,
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
    catalogo: [],
    topeCatalogo: 60,
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
/** Las elecciones muestran sólo lo elegido: las opciones están en su popup. */
const abrir = (etiqueta: string) =>
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${etiqueta}:`) }));
const fila = (etiqueta: string, elegido: string) =>
  screen.getByRole("button", { name: `${etiqueta}: ${elegido}. Cambiar` });

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
    expect(fila("Color de la página", "Ciruela")).toBeInTheDocument();
    abrir("Color de la página");
    fireEvent.click(screen.getByRole("radio", { name: "Color Lavanda" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fila("Color de la página", "Lavanda")).toBeInTheDocument();

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
    // A la vista sólo lo elegido, sin las cuatro opciones.
    expect(fila("Botón principal", "Reservar turno")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Sin botón principal/ })).not.toBeInTheDocument();
    abrir("Botón principal");
    expect(screen.getByRole("radio", { name: /Reservar turno/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /Sin botón principal/ }));
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(fila("Botón principal", "Sin botón principal")).toBeInTheDocument();
    expect(within(previa()).queryByText("Reservar turno")).not.toBeInTheDocument();

    vi.mocked(apiPagina.guardar).mockResolvedValue(estado({ mostrarReservar: false }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiPagina.guardar).toHaveBeenCalledWith({ mostrarReservar: false, enlaceDestacadoId: null });
  });

  it("botón principal sin reserva online (una pollería): no ofrece reservar", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue({ ...estado(), reservaOnline: false });
    await montar();
    expect(fila("Botón principal", "Sin botón principal")).toBeInTheDocument();
    abrir("Botón principal");
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
    abrir("Botón principal");
    fireEvent.click(screen.getByRole("radio", { name: /WhatsApp/ }));
    // Crear el WhatsApp cierra este popup y abre el del enlace.
    fireEvent.click(screen.getByRole("button", { name: "Agregar mi WhatsApp" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("Número"), { target: { value: "70123456" } });
    vi.mocked(apiPagina.estado).mockResolvedValue({ ...estado(), enlaces: [...estado().enlaces, wa] });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await act(async () => {});
    expect(apiPagina.crearEnlace).toHaveBeenCalledWith(expect.objectContaining({ tipo: "WHATSAPP", formato: "BOTON" }));
    expect(fila("Botón principal", "WhatsApp · Escribinos por WhatsApp")).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText("Aclaración del horario de Centro"), { target: { value: "9 a 21" } });
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Aclaración del horario de Centro"), { target: { value: "9 a 20" } });
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

  it("forma de los botones: a la vista la elegida; en el popup ≥ 9, en vivo y se manda al guardar", async () => {
    await montar();
    expect(fila("Forma de los botones", "Redondeados")).toBeInTheDocument();
    abrir("Forma de los botones");
    const dialogo = screen.getByRole("dialog", { name: "Forma de los botones" });
    expect(within(dialogo).getAllByRole("radio").length).toBeGreaterThanOrEqual(9);
    expect(within(dialogo).getByRole("radio", { name: "Redondeados" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(within(dialogo).getByRole("radio", { name: "Contorno" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fila("Forma de los botones", "Contorno")).toBeInTheDocument();
    // El botón principal de la vista previa ya es de contorno: blanco con borde de color.
    const reservar = within(previa()).getByText("Reservar turno");
    expect(reservar.style.border).toBe("2px solid rgb(155, 44, 107)");
    expect(reservar.style.background).toBe("rgb(255, 255, 255)");

    vi.mocked(apiPagina.guardar).mockResolvedValue(estado({ formaBotones: "CONTORNO" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiPagina.guardar).toHaveBeenCalledWith({ formaBotones: "CONTORNO" });
  });

  it("letra del nombre: a la vista la elegida; en el popup 30 agrupadas, y el catálogo baja sólo al abrir", async () => {
    await montar();
    expect(fila("Letra del nombre", "Moderna")).toBeInTheDocument();
    expect(document.getElementById("fuentes-pagina-catalogo")).toBeNull();
    abrir("Letra del nombre");
    const dialogo = screen.getByRole("dialog", { name: "Letra del nombre" });
    expect(document.getElementById("fuentes-pagina-catalogo")).not.toBeNull();
    expect(within(dialogo).getAllByRole("radio")).toHaveLength(30);
    expect(within(dialogo).getAllByText("Salón Bella Vista")).toHaveLength(30);
    for (const grupo of ["Modernas", "Redondeadas", "Elegantes", "Fuertes", "Manuscritas"]) {
      expect(within(dialogo).getByRole("heading", { name: grupo })).toBeInTheDocument();
    }

    fireEvent.click(within(dialogo).getByRole("radio", { name: "Pacifico" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fila("Letra del nombre", "Pacifico")).toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: /^Diseño del anuncio:/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Anuncio destacado"), { target: { value: "2x1 los martes" } });
    // A la vista, sólo el diseño elegido; estilos y colores, en el popup.
    expect(screen.queryByRole("radiogroup", { name: "Estilo del anuncio" })).not.toBeInTheDocument();
    abrir("Diseño del anuncio");
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
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(fila("Diseño del anuncio", "Franja llena · colores propios")).toBeInTheDocument();

    vi.mocked(apiPagina.guardar).mockResolvedValue(estado());
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiPagina.guardar).toHaveBeenCalledWith({
      anuncioTexto: "2x1 los martes",
      anuncioEstilo: "SOLIDO",
      anuncioColorFondo: "#111827",
      anuncioColorTexto: null,
    });
    // Popup con dos paletas de ~45 muestras: con la suite entera en paralelo
    // pasa los 5 s por defecto.
  }, 15_000);

  it("anuncio con estilo guardado: el editor lo muestra elegido", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(
      estado({ anuncioTexto: "Martes 2x1", anuncioEstilo: "MARQUESINA", anuncioColorFondo: "#111827", anuncioColorTexto: "#FFFFFF" }),
    );
    await montar();
    expect(fila("Diseño del anuncio", "Marquesina · colores propios")).toBeInTheDocument();
    abrir("Diseño del anuncio");
    expect(screen.getByRole("radio", { name: "Marquesina" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Color de la letra #FFFFFF" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Color del anuncio en hex")).toHaveValue("#111827");
    // La marquesina repite el texto para el bucle, pero la copia no se lee dos veces.
    const nota = within(previa()).getByRole("note");
    expect(within(nota).getAllByText("Martes 2x1")).toHaveLength(2);
    expect(nota.querySelectorAll('[aria-hidden="true"].bm-marquesina-copia')).toHaveLength(1);
  });
});

describe("Mi página: estilo", () => {
  it("la fila Estilo va primera en Apariencia, con la miniatura de la página y el estilo de hoy (Clásico)", async () => {
    await montar();
    const estilo = fila("Estilo", "Clásico");
    const color = fila("Color de la página", "Ciruela");
    // Antes que el color (y que todo lo demás de la apariencia).
    expect(estilo.compareDocumentPosition(color) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(estilo).getByTestId("miniatura-pagina")).toBeInTheDocument();
    // La miniatura no es la vista previa: hay una sola.
    expect(screen.getAllByTestId("vista-pagina")).toHaveLength(1);
  });

  it("el popup muestra los 9 con miniaturas y marca el recomendado para el rubro (peluquería → Boutique)", async () => {
    await montar();
    abrir("Estilo");
    const dialogo = screen.getByRole("dialog", { name: "Estilo de tu página" });
    const radios = within(dialogo).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([
      "Clásico",
      "Vitrina",
      "Vivo",
      "Noche",
      "Boutique (recomendado para tu rubro)",
      "Postal",
      "Carta",
      "Dulce",
      "Mosaico",
    ]);
    expect(within(dialogo).getAllByText("Recomendado")).toHaveLength(1);
    expect(within(dialogo).getAllByTestId("miniatura-pagina")).toHaveLength(9);
    // Con 9, la grilla sigue cómoda: 2 columnas en el celular y 3 en computadora.
    expect(within(dialogo).getByRole("radiogroup", { name: "Estilos de la página" })).toHaveClass("grid-cols-2", "sm:grid-cols-3");
    expect(within(dialogo).getByRole("radio", { name: "Clásico" })).toHaveAttribute("aria-checked", "true");
  });

  it("una barbería tiene Noche como recomendado", async () => {
    const base = estado();
    vi.mocked(apiPagina.estado).mockResolvedValue({ ...base, negocio: { ...base.negocio, rubro: "BARBERIA" } });
    await montar();
    abrir("Estilo");
    expect(screen.getByRole("radio", { name: "Noche (recomendado para tu rubro)" })).toBeInTheDocument();
  });

  it("uñas tiene Dulce como recomendado (antes Vivo)", async () => {
    const base = estado();
    vi.mocked(apiPagina.estado).mockResolvedValue({ ...base, negocio: { ...base.negocio, rubro: "UNAS" } });
    await montar();
    abrir("Estilo");
    expect(screen.getByRole("radio", { name: "Dulce (recomendado para tu rubro)" })).toBeInTheDocument();
    expect(screen.getAllByText("Recomendado")).toHaveLength(1);
  });

  it("un restaurante con ítems en el catálogo tiene Carta; sin ítems, Vivo", async () => {
    const base = conCatalogo();
    vi.mocked(apiPagina.estado).mockResolvedValue({ ...base, negocio: { ...base.negocio, rubro: "RESTAURANTE" } });
    await montar();
    abrir("Estilo");
    expect(screen.getByRole("radio", { name: "Carta (recomendado para tu rubro)" })).toBeInTheDocument();
    // La miniatura de Carta muestra la lista de menú (sin fotos); las de carrusel, nada del catálogo.
    const carta = screen.getByRole("radio", { name: /^Carta/ });
    expect(within(carta).getByText("Corte clásico")).toBeInTheDocument();
    expect(carta.querySelector("img[src*='catalogo']")).toBeNull();
    expect(within(screen.getByRole("radio", { name: "Vivo" })).queryByText("Corte clásico")).not.toBeInTheDocument();
  });

  it("un restaurante sin ítems en el catálogo tiene Vivo", async () => {
    const sin = estado();
    vi.mocked(apiPagina.estado).mockResolvedValue({ ...sin, negocio: { ...sin.negocio, rubro: "RESTAURANTE" } });
    await montar();
    abrir("Estilo");
    expect(screen.getByRole("radio", { name: "Vivo (recomendado para tu rubro)" })).toBeInTheDocument();
  });

  it("Carta sin catálogo: el popup y el editor avisan que luce con productos", async () => {
    await montar();
    abrir("Estilo");
    fireEvent.click(screen.getByRole("radio", { name: "Carta" }));
    expect(screen.getByText("Carta luce con tu catálogo.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Usar este estilo" }));
    expect(screen.getByText(/Carta luce con tu catálogo\. Sin productos/)).toBeInTheDocument();
    expect(fila("Letra del nombre", "Alfa Slab")).toBeInTheDocument();
    expect(fila("Forma de los botones", "Redondeados")).toBeInTheDocument();
    expect(previa()).toHaveAttribute("data-estilo", "CARTA");
  });

  it("elegir un estilo pasa la letra y los botones a los suyos; «Mantener los míos» los devuelve y Guardar manda el estilo", async () => {
    await montar();
    abrir("Estilo");
    const dialogo = screen.getByRole("dialog", { name: "Estilo de tu página" });
    fireEvent.click(within(dialogo).getByRole("radio", { name: "Noche" }));
    // Tocar sólo marca: todavía no cambia nada.
    expect(fila("Estilo", "Clásico")).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Usar este estilo" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fila("Estilo", "Noche")).toBeInTheDocument();
    expect(fila("Letra del nombre", "Bebas Neue")).toBeInTheDocument();
    expect(fila("Forma de los botones", "Rectos")).toBeInTheDocument();
    expect(previa()).toHaveAttribute("data-estilo", "NOCHE");
    // El color se conserva.
    expect(fila("Color de la página", "Ciruela")).toBeInTheDocument();
    expect(screen.getByText("Usamos la letra y los botones que mejor van con este estilo.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mantener los míos" }));
    expect(fila("Letra del nombre", "Moderna")).toBeInTheDocument();
    expect(fila("Forma de los botones", "Redondeados")).toBeInTheDocument();
    expect(fila("Estilo", "Noche")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mantener los míos" })).not.toBeInTheDocument();

    vi.mocked(apiPagina.guardar).mockResolvedValue(estado({ estiloClave: "NOCHE" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiPagina.guardar).toHaveBeenCalledWith({ estiloClave: "NOCHE" });
  });

  it("sin «Mantener los míos» se guardan el estilo, la letra y la forma", async () => {
    await montar();
    abrir("Estilo");
    fireEvent.click(screen.getByRole("radio", { name: /^Boutique/ }));
    fireEvent.click(screen.getByRole("button", { name: "Usar este estilo" }));
    vi.mocked(apiPagina.guardar).mockResolvedValue(estado({ estiloClave: "BOUTIQUE" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiPagina.guardar).toHaveBeenCalledWith({ estiloClave: "BOUTIQUE", tipografia: "CORMORANT", formaBotones: "SUBRAYADO" });
  });

  it("Vitrina sin portada: el popup y el editor avisan que luce con una foto", async () => {
    await montar();
    abrir("Estilo");
    fireEvent.click(screen.getByRole("radio", { name: "Vitrina" }));
    expect(screen.getByText("Vitrina luce con una foto de portada.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Usar este estilo" }));
    expect(screen.getByText(/Vitrina luce con una foto de portada\. Sin foto/)).toBeInTheDocument();
  });

  it("los popups de color, forma y letra muestran primero los recomendados para el estilo", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(estado({ estiloClave: "NOCHE", tipografia: "BEBAS", formaBotones: "RECTO" }));
    await montar();
    abrir("Forma de los botones");
    const recoForma = screen.getByRole("radiogroup", { name: "Formas recomendadas para este estilo" });
    expect(within(recoForma).getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["Rectos", "Contorno", "Esquina cortada"]);
    expect(screen.getAllByRole("radio")).toHaveLength(11);
    fireEvent.click(screen.getByRole("button", { name: /Cerrar/ }));

    abrir("Letra del nombre");
    const recoLetra = screen.getByRole("radiogroup", { name: "Letras recomendadas para este estilo" });
    expect(within(recoLetra).getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["Bebas Neue", "Anton", "Fuerte"]);
    expect(screen.getAllByRole("radio")).toHaveLength(30);
  });
});

const ITEMS: ItemCatalogoEditor[] = [
  { id: 1, titulo: "Corte clásico", descripcion: null, precio: 50, precioDesde: false, visible: true, orden: 1, fotoUrl: null },
  { id: 2, titulo: "Uñas acrílicas", descripcion: "Con diseño a elección", precio: 120, precioDesde: true, visible: true, orden: 2, fotoUrl: "/pagina/catalogo/2/foto?v=1" },
];

function conCatalogo(items: ItemCatalogoEditor[] = ITEMS): EstadoEditor {
  return { ...estado(), catalogo: items };
}

/** Los ítems de la grilla del editor, en el orden en que se ven. */
const tarjetas = () =>
  within(screen.getByRole("list", { name: "Ítems del catálogo" }))
    .getAllByRole("button", { name: /^Editar / })
    .map((b) => b.getAttribute("aria-label"));

describe("Mi página: catálogo", () => {
  it("vacío: un texto amable y un solo «Agregar», sin contador", async () => {
    await montar();
    expect(screen.getByText("Mostrá lo que hacés o vendés, con foto y precio.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Agregar" })).toHaveLength(1);
    expect(screen.queryByText(/de 60/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Título de la sección")).not.toBeInTheDocument();
  });

  it("agregar con título y precio con coma: manda el precio como número y se ve al toque", async () => {
    const nuevo: ItemCatalogoEditor = { id: 7, titulo: "Uñas acrílicas", descripcion: null, precio: 80.5, precioDesde: false, visible: true, orden: 1, fotoUrl: null };
    vi.mocked(apiPagina.crearItemCatalogo).mockResolvedValue(nuevo);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    const dialogo = screen.getByRole("dialog", { name: "Agregar al catálogo" });
    expect(within(dialogo).getByText("Si en la foto se reconoce a una persona, pedile permiso antes de publicarla.")).toBeInTheDocument();
    // "Es precio desde" sólo con precio.
    expect(within(dialogo).getByLabelText(/Es precio desde/)).toBeDisabled();
    fireEvent.change(within(dialogo).getByLabelText("Título"), { target: { value: "Uñas acrílicas" } });
    fireEvent.change(within(dialogo).getByLabelText("Precio"), { target: { value: "80,50" } });
    expect(within(dialogo).getByLabelText(/Es precio desde/)).toBeEnabled();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await act(async () => {});
    expect(apiPagina.crearItemCatalogo).toHaveBeenCalledWith({ titulo: "Uñas acrílicas", precio: 80.5, precioDesde: false, visible: true });
    expect(apiPagina.subirFotoCatalogo).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Agregado al catálogo")).toBeInTheDocument();
    expect(tarjetas()).toEqual(["Editar Uñas acrílicas"]);
    expect(screen.getByText("1 de 60")).toBeInTheDocument();
    // La vista previa ya lo muestra, con el precio formateado.
    expect(within(previa()).getByRole("heading", { name: "Catálogo" })).toBeInTheDocument();
    expect(within(previa()).getByText("Bs 80,50")).toBeInTheDocument();
  });

  it("valida antes de mandar: título vacío, precio 0 y con 3 decimales", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    const dialogo = screen.getByRole("dialog", { name: "Agregar al catálogo" });
    fireEvent.change(within(dialogo).getByLabelText("Precio"), { target: { value: "0" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(within(dialogo).getByText("Escribí un título.")).toBeInTheDocument();
    expect(within(dialogo).getByText(/El precio tiene que ser mayor a 0/)).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText("Título"), { target: { value: "Corte" } });
    fireEvent.change(within(dialogo).getByLabelText("Precio"), { target: { value: "80.555" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(within(dialogo).getByText("El precio puede tener hasta 2 decimales.")).toBeInTheDocument();
    expect(within(dialogo).queryByText("Escribí un título.")).not.toBeInTheDocument();
    await act(async () => {});
    expect(apiPagina.crearItemCatalogo).not.toHaveBeenCalled();
  });

  it("con ítems: contador, título de la sección al borrador y tarjetas con su precio", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(conCatalogo());
    await montar();
    expect(screen.getByText("2 de 60")).toBeInTheDocument();
    expect(tarjetas()).toEqual(["Editar Corte clásico", "Editar Uñas acrílicas"]);
    expect(within(screen.getByRole("list", { name: "Ítems del catálogo" })).getByText("Desde Bs 120")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Título de la sección"), { target: { value: "Nuestros trabajos" } });
    expect(within(previa()).getByRole("heading", { name: "Nuestros trabajos" })).toBeInTheDocument();

    vi.mocked(apiPagina.guardar).mockResolvedValue({ ...conCatalogo(), pagina: { ...estado().pagina, catalogoTitulo: "Nuestros trabajos" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiPagina.guardar).toHaveBeenCalledWith({ catalogoTitulo: "Nuestros trabajos" });
  });

  it("editar un ítem manda sólo lo que cambió", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(conCatalogo());
    vi.mocked(apiPagina.editarItemCatalogo).mockResolvedValue({ ...ITEMS[0], titulo: "Corte y peinado", precio: 65 });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Editar Corte clásico" }));
    const dialogo = screen.getByRole("dialog", { name: "Editar" });
    expect(within(dialogo).getByLabelText("Título")).toHaveValue("Corte clásico");
    expect(within(dialogo).getByLabelText("Precio")).toHaveValue("50");
    fireEvent.change(within(dialogo).getByLabelText("Título"), { target: { value: "Corte y peinado" } });
    fireEvent.change(within(dialogo).getByLabelText("Precio"), { target: { value: "65" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await act(async () => {});
    expect(apiPagina.editarItemCatalogo).toHaveBeenCalledWith(1, { titulo: "Corte y peinado", precio: 65 });
    expect(tarjetas()).toEqual(["Editar Corte y peinado", "Editar Uñas acrílicas"]);
  });

  it("ocultarlo lo atenúa en el editor y lo saca de la vista previa", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(conCatalogo());
    vi.mocked(apiPagina.editarItemCatalogo).mockResolvedValue({ ...ITEMS[1], visible: false });
    await montar();
    expect(within(previa()).getByText("Uñas acrílicas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar Uñas acrílicas" }));
    const dialogo = screen.getByRole("dialog", { name: "Editar" });
    fireEvent.click(within(dialogo).getByLabelText("Mostrar en mi página"));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await act(async () => {});
    expect(apiPagina.editarItemCatalogo).toHaveBeenCalledWith(2, { visible: false });
    expect(screen.getByRole("button", { name: "Editar Uñas acrílicas (oculto)" })).toBeInTheDocument();
    expect(screen.getByText("Oculto")).toBeInTheDocument();
    expect(within(previa()).queryByText("Uñas acrílicas")).not.toBeInTheDocument();
  });

  it("quitarlo pide confirmación", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(conCatalogo());
    vi.mocked(apiPagina.borrarItemCatalogo).mockResolvedValue(undefined);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Editar Corte clásico" }));
    fireEvent.click(screen.getByRole("button", { name: "Quitar del catálogo" }));
    const confirmar = screen.getByRole("dialog", { name: "Quitar del catálogo" });
    expect(apiPagina.borrarItemCatalogo).not.toHaveBeenCalled();
    fireEvent.click(within(confirmar).getByRole("button", { name: "Quitar" }));
    await act(async () => {});
    expect(apiPagina.borrarItemCatalogo).toHaveBeenCalledWith(1);
    expect(tarjetas()).toEqual(["Editar Uñas acrílicas"]);
    expect(screen.getByText("1 de 60")).toBeInTheDocument();
  });

  it("«Mover después» manda el orden nuevo con todos los ids", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(conCatalogo());
    vi.mocked(apiPagina.ordenarCatalogo).mockResolvedValue([
      { ...ITEMS[1], orden: 1 },
      { ...ITEMS[0], orden: 2 },
    ]);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Editar Corte clásico" }));
    const dialogo = screen.getByRole("dialog", { name: "Editar" });
    expect(within(dialogo).getByText("Lugar 1 de 2")).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Mover antes" })).toBeDisabled();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Mover después" }));
    await act(async () => {});
    expect(apiPagina.ordenarCatalogo).toHaveBeenCalledWith([2, 1]);
    expect(within(dialogo).getByText("Lugar 2 de 2")).toBeInTheDocument();
    expect(tarjetas()).toEqual(["Editar Uñas acrílicas", "Editar Corte clásico"]);
  });

  it("si el orden no se guarda, vuelve al de antes y lo dice", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(conCatalogo());
    vi.mocked(apiPagina.ordenarCatalogo).mockRejectedValue(new Error("Sin conexión"));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Editar Corte clásico" }));
    fireEvent.click(screen.getByRole("button", { name: "Mover después" }));
    await act(async () => {});
    expect(apiPagina.ordenarCatalogo).toHaveBeenCalledWith([2, 1]);
    expect(screen.getByText("Sin conexión")).toBeInTheDocument();
    expect(tarjetas()).toEqual(["Editar Corte clásico", "Editar Uñas acrílicas"]);
  });

  it("agregar con foto: si la foto falla, el ítem queda creado y el reintento no lo duplica", async () => {
    const nuevo: ItemCatalogoEditor = { id: 7, titulo: "Pollo entero", descripcion: null, precio: null, precioDesde: false, visible: true, orden: 1, fotoUrl: null };
    vi.mocked(apiPagina.crearItemCatalogo).mockResolvedValue(nuevo);
    vi.mocked(apiPagina.subirFotoCatalogo)
      .mockRejectedValueOnce(new Error("La imagen pesa más de 2 MB."))
      .mockResolvedValueOnce({ ...nuevo, fotoUrl: "/pagina/catalogo/7/foto?v=1" });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    let dialogo = screen.getByRole("dialog", { name: "Agregar al catálogo" });
    fireEvent.change(within(dialogo).getByLabelText("Título"), { target: { value: "Pollo entero" } });
    const archivo = new File(["x"], "pollo.jpg", { type: "image/jpeg" });
    fireEvent.change(within(dialogo).getByLabelText("Elegir foto"), { target: { files: [archivo] } });
    await act(async () => {});
    expect(within(dialogo).getByRole("button", { name: /Cambiar foto/ })).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await act(async () => {});
    expect(apiPagina.crearItemCatalogo).toHaveBeenCalledTimes(1);
    expect(apiPagina.subirFotoCatalogo).toHaveBeenCalledWith(7, expect.any(Blob));
    // Sigue abierto, ya editando el ítem creado, con el error.
    dialogo = screen.getByRole("dialog", { name: "Editar" });
    expect(within(dialogo).getByText(/Se agregó al catálogo, pero la foto no se pudo subir: La imagen pesa más de 2 MB/)).toBeInTheDocument();
    expect(tarjetas()).toEqual(["Editar Pollo entero"]);

    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await act(async () => {});
    expect(apiPagina.crearItemCatalogo).toHaveBeenCalledTimes(1);
    expect(apiPagina.subirFotoCatalogo).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(tarjetas()).toEqual(["Editar Pollo entero"]);
  });

  it("con el catálogo lleno no deja agregar", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue({ ...conCatalogo(), topeCatalogo: 2 });
    await montar();
    expect(screen.getByText("2 de 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar" })).toBeDisabled();
  });
});

describe("Mi página: horario por día de la sucursal", () => {
  const HABILES = [1, 2, 3, 4, 5].map((dia) => ({ dia, desde: "09:00", hasta: "20:00" }));
  const filaHorario = () => screen.getByRole("button", { name: /^Horario de Centro:/ });

  it("se carga en el popup (copiar a días hábiles, corte, error) y se guarda con «Guardar cambios»", async () => {
    await montar();
    expect(filaHorario()).toHaveTextContent("Sin horario cargado");
    fireEvent.click(filaHorario());
    const d = screen.getByRole("dialog", { name: "Horario de Centro" });

    // Lunes 9 a 20, y lo mismo de martes a viernes.
    fireEvent.click(within(d).getByRole("switch", { name: "Lunes abierto" }));
    expect(within(d).getByLabelText("Lunes: abre")).toHaveValue("09:00");
    fireEvent.change(within(d).getByLabelText("Lunes: cierra"), { target: { value: "20:00" } });
    fireEvent.click(within(d).getByRole("button", { name: "Copiar a todos los días hábiles" }));
    expect(within(d).getByRole("switch", { name: "Viernes abierto" })).toHaveAttribute("aria-checked", "true");
    expect(within(d).getByLabelText("Viernes: cierra")).toHaveValue("20:00");
    expect(within(d).getByRole("switch", { name: "Sábado abierto" })).toHaveAttribute("aria-checked", "false");

    // El sábado arranca con las horas del viernes; cierra a la una.
    fireEvent.click(within(d).getByRole("switch", { name: "Sábado abierto" }));
    fireEvent.change(within(d).getByLabelText("Sábado: cierra"), { target: { value: "13:00" } });

    // Un corte el lunes que se pisa: el error va en el lunes y "Listo" no cierra.
    fireEvent.click(within(d).getByRole("button", { name: "Agregar corte el lunes" }));
    expect(within(d).getByLabelText("Lunes: cierra")).toHaveValue("13:00");
    expect(within(d).getByLabelText("Lunes: abre (después del corte)")).toHaveValue("15:00");
    fireEvent.change(within(d).getByLabelText("Lunes: abre (después del corte)"), { target: { value: "12:00" } });
    expect(within(d).getByRole("alert")).toHaveTextContent("El lunes: los tramos 09:00-13:00 y 12:00-20:00 se pisan");
    fireEvent.click(within(d).getByRole("button", { name: "Listo" }));
    expect(screen.getByRole("dialog", { name: "Horario de Centro" })).toBeInTheDocument();

    // Sin el corte vuelve a 9 a 13: se deja el lunes 9 a 20 otra vez.
    fireEvent.click(within(d).getByRole("button", { name: "Quitar el segundo horario del lunes" }));
    fireEvent.change(within(d).getByLabelText("Lunes: cierra"), { target: { value: "20:00" } });
    expect(within(d).queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(within(d).getByRole("button", { name: "Listo" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(filaHorario()).toHaveTextContent("Lun a vie 9:00–20:00 · Sáb 9:00–13:00 · Dom cerrado");
    // La vista previa ya lo muestra.
    expect(within(previa()).getByText("Ver horario")).toBeInTheDocument();
    expect(within(previa()).getByTestId("estado-sucursal")).toBeInTheDocument();

    const s = estado().sucursales[0];
    vi.mocked(apiPagina.sucursal).mockResolvedValue({ ...s, horarioSemanal: [...HABILES, { dia: 6, desde: "09:00", hasta: "13:00" }] });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiPagina.sucursal).toHaveBeenCalledWith(10, {
      horarioTexto: "9 a 20",
      mapsUrl: null,
      horarioSemanal: [...HABILES, { dia: 6, desde: "09:00", hasta: "13:00" }],
    });
    expect(screen.getByText("Cambios guardados")).toBeInTheDocument();
    expect(filaHorario()).toHaveTextContent("Lun a vie 9:00–20:00 · Sáb 9:00–13:00 · Dom cerrado");
  });

  it("Quitar horario lo deja en null; Descartar lo vuelve atrás", async () => {
    const base = estado();
    vi.mocked(apiPagina.estado).mockResolvedValue({
      ...base,
      sucursales: [{ ...base.sucursales[0], horarioSemanal: HABILES }],
    });
    await montar();
    expect(filaHorario()).toHaveTextContent("Lun a vie 9:00–20:00 · Sáb y dom cerrado");

    fireEvent.click(filaHorario());
    fireEvent.click(screen.getByRole("button", { name: "Quitar horario" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(filaHorario()).toHaveTextContent("Sin horario cargado");
    expect(within(previa()).queryByText("Ver horario")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(filaHorario()).toHaveTextContent("Lun a vie 9:00–20:00 · Sáb y dom cerrado");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();

    fireEvent.click(filaHorario());
    fireEvent.click(screen.getByRole("button", { name: "Quitar horario" }));
    vi.mocked(apiPagina.sucursal).mockResolvedValue({ ...base.sucursales[0], horarioSemanal: null });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(apiPagina.sucursal).toHaveBeenCalledWith(10, { horarioTexto: "9 a 20", mapsUrl: null, horarioSemanal: null });
  });

  it("cerrar el popup sin «Listo» no cambia nada; volver al horario guardado no deja cambios", async () => {
    const base = estado();
    vi.mocked(apiPagina.estado).mockResolvedValue({ ...base, sucursales: [{ ...base.sucursales[0], horarioSemanal: HABILES }] });
    await montar();
    fireEvent.click(filaHorario());
    fireEvent.click(screen.getByRole("switch", { name: "Lunes abierto" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(filaHorario()).toHaveTextContent("Lun a vie 9:00–20:00");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();

    // Cerrar el lunes y volver a abrirlo recupera sus horas: queda como estaba.
    fireEvent.click(filaHorario());
    fireEvent.click(screen.getByRole("switch", { name: "Lunes abierto" }));
    fireEvent.click(screen.getByRole("switch", { name: "Lunes abierto" }));
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("el error del backend dice de qué sucursal es", async () => {
    vi.mocked(apiPagina.sucursal).mockRejectedValue(new Error("El lunes: hasta 2 tramos por día (por ejemplo, mañana y tarde)"));
    await montar();
    fireEvent.click(filaHorario());
    fireEvent.click(screen.getByRole("switch", { name: "Lunes abierto" }));
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await act(async () => {});
    expect(screen.getByText("Centro: El lunes: hasta 2 tramos por día (por ejemplo, mañana y tarde)")).toBeInTheDocument();
    expect(filaHorario()).toHaveTextContent("Lun 9:00–18:00");
  });
});
