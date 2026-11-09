import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BloquePublico, PaginaPublica } from "../../lib/pagina/tipos";
import VistaPagina from "./VistaPagina";
import { PASO_PORTADA_MS } from "./SitioPagina";

/**
 * El sitio del Profesional (PLAN-PAGINA-PRO M1) dentro de la página: los
 * bloques en el orden que vienen, cada uno con lo suyo, y nada del sitio
 * cuando la página no lo trae.
 */

const PAGINA: PaginaPublica = {
  subdominio: "elfogon",
  nombre: "Pollos El Fogón",
  rubro: "Restaurante",
  rubroClave: "RESTAURANTE",
  iniciales: "EF",
  descripcion: "Pollo a la leña desde 2009.",
  color: { clave: "ROJO", hex: "#C0262D" },
  formaBotones: "REDONDEADO",
  tipografia: "BEBAS",
  logoUrl: null,
  portadaUrl: null,
  anuncio: null,
  reservar: false,
  destacado: { id: 7, tipo: "WHATSAPP", etiqueta: "Pedí por WhatsApp", url: "https://wa.me/59170123456", icono: null },
  redes: [{ id: 8, tipo: "FACEBOOK", etiqueta: "Facebook", url: "https://www.facebook.com/elfogon", icono: null }],
  botones: [],
  sucursales: [
    { nombre: "Cañoto", reservaSlug: null, direccion: "Av. Cañoto 455", telefono: "33112233", horario: null, mapaUrl: null },
  ],
  catalogo: {
    titulo: "Catálogo",
    items: [{ id: 1, titulo: "¼ de pollo", descripcion: "Con papas", precio: 28, precioDesde: false, fotoUrl: null }],
  },
  pie: { atribucionUrl: "https://bamardev.com" },
  og: { titulo: "Pollos El Fogón", descripcion: "", imagen: null, url: "" },
};

const BLOQUES: BloquePublico[] = [
  {
    tipo: "PORTADA",
    titulo: "Pollo a la leña",
    subtitulo: "Retirá sin fila",
    fotos: [
      { url: "/publico/pagina/elfogon/imagen/FOTO_1?v=a", leyenda: "El horno" },
      { url: "/publico/pagina/elfogon/imagen/FOTO_2?v=b", leyenda: null },
    ],
  },
  { tipo: "DESTACADO" },
  { tipo: "CATALOGO", titulo: "La carta" },
  { tipo: "QUIENES", titulo: "Quiénes somos", texto: "Empezamos con un horno.\nHoy somos tres.", desde: 2009, datos: [{ valor: "3", etiqueta: "sucursales" }], foto: null },
  { tipo: "GALERIA", titulo: "Galería", fotos: [{ url: "/g1", leyenda: "El salón" }, { url: "/g2", leyenda: null }] },
  { tipo: "UBICACION", titulo: "Dónde estamos" },
  { tipo: "PREGUNTAS", titulo: "Preguntas", items: [{ pregunta: "¿Hacen delivery?", respuesta: "Sí, en el centro." }] },
  { tipo: "RESENAS", googleUrl: "https://g.page/r/elfogon/review" },
  { tipo: "VIDEO", titulo: "Así lo hacemos", url: "https://www.youtube.com/watch?v=abcdefghijk" },
];

const conSitio = (bloques = BLOQUES, extra: Partial<PaginaPublica> = {}): PaginaPublica => ({
  ...PAGINA,
  sitio: { plantilla: "GASTRONOMIA", bloques },
  ...extra,
});

afterEach(() => vi.useRealTimers());

describe("sitio del Profesional", () => {
  it("sin sitio la página es la de siempre", () => {
    render(<VistaPagina pagina={PAGINA} urlReservar="/r/x" modo="movil" />);
    expect(screen.getByTestId("vista-pagina")).not.toHaveAttribute("data-sitio");
    expect(screen.queryByRole("region", { name: "Portada" })).toBeNull();
  });

  it("dibuja los bloques en orden, con el nombre como único h1", () => {
    render(<VistaPagina pagina={conSitio()} urlReservar="/r/x" modo="movil" />);
    expect(screen.getByTestId("vista-pagina")).toHaveAttribute("data-sitio", "GASTRONOMIA");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pollos El Fogón");
    const titulos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titulos).toEqual(["La carta", "Quiénes somos", "Galería", "Dónde estamos", "Preguntas", "¿Te gustó? Contalo en Google", "Así lo hacemos"]);
    expect(screen.getByText("Pollo a la leña")).toBeInTheDocument();
    expect(screen.getByText("DESDE 2009")).toBeInTheDocument();
    expect(screen.getByText("Hoy somos tres.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dejá tu reseña en Google" })).toHaveAttribute("href", "https://g.page/r/elfogon/review");
  });

  it("la primera foto de la portada baja ya y las demás, perezosas", () => {
    const { container } = render(<VistaPagina pagina={conSitio()} urlReservar="/r/x" modo="movil" />);
    const fotos = screen.getByRole("region", { name: "Portada" }).querySelectorAll("img");
    expect(fotos[0]).toHaveAttribute("loading", "eager");
    expect(fotos[1]).toHaveAttribute("loading", "lazy");
    expect(container.querySelectorAll("#galeria img[loading='lazy']")).toHaveLength(2);
  });

  it("el carrusel pasa de foto solo y se puede pausar", () => {
    vi.useFakeTimers();
    render(<VistaPagina pagina={conSitio()} urlReservar="/r/x" modo="movil" />);
    const fotos = () => screen.getByRole("region", { name: "Portada" }).querySelectorAll("img");
    expect(fotos()[0].style.opacity).toBe("1");
    act(() => vi.advanceTimersByTime(PASO_PORTADA_MS));
    expect(fotos()[1].style.opacity).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Pausar las fotos" }));
    act(() => vi.advanceTimersByTime(PASO_PORTADA_MS * 2));
    expect(fotos()[1].style.opacity).toBe("1");
  });

  it("el destacado del día sale sólo si viene y está vigente", () => {
    const { rerender } = render(<VistaPagina pagina={conSitio()} urlReservar="/r/x" modo="movil" />);
    expect(screen.queryByText("Almuerzo de hoy")).toBeNull();
    const destacadoDia = {
      tipo: "ALMUERZO",
      etiqueta: "Almuerzo de hoy",
      items: [{ titulo: "Sopa de maní", precio: 30, fotoUrl: null }],
      restante: 18,
      texto: "Con refresco",
      descuentoPct: null,
      turnos: null,
      hasta: new Date(Date.now() + 3_600_000).toISOString(),
      publicadoEn: new Date().toISOString(),
    };
    rerender(<VistaPagina pagina={conSitio(BLOQUES, { destacadoDia })} urlReservar="/r/x" modo="movil" />);
    expect(screen.getByRole("heading", { name: "Almuerzo de hoy" })).toBeInTheDocument();
    expect(screen.getByText("Sopa de maní")).toBeInTheDocument();
    expect(screen.getByText("Quedan 18")).toBeInTheDocument();
    const vencido = { ...destacadoDia, hasta: new Date(Date.now() - 1000).toISOString() };
    rerender(<VistaPagina pagina={conSitio(BLOQUES, { destacadoDia: vencido })} urlReservar="/r/x" modo="movil" />);
    expect(screen.queryByText("Almuerzo de hoy")).toBeNull();
  });

  it("las preguntas se abren como acordeón", () => {
    render(<VistaPagina pagina={conSitio()} urlReservar="/r/x" modo="movil" />);
    const boton = screen.getByRole("button", { name: /¿Hacen delivery\?/ });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Sí, en el centro.")).not.toBeVisible();
    fireEvent.click(boton);
    expect(boton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Sí, en el centro.")).toBeVisible();
  });

  it("la galería abre el visor y se cierra con Escape", () => {
    render(<VistaPagina pagina={conSitio()} urlReservar="/r/x" modo="movil" />);
    fireEvent.click(screen.getByRole("button", { name: "Ver foto: El salón" }));
    const visor = screen.getByRole("dialog", { name: "Foto 1 de 2" });
    fireEvent.click(within(visor).getByRole("button", { name: "Foto siguiente" }));
    expect(screen.getByRole("dialog", { name: "Foto 2 de 2" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("el video recién carga el reproductor al tocarlo", () => {
    const { container } = render(<VistaPagina pagina={conSitio()} urlReservar="/r/x" modo="movil" />);
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver el video: Así lo hacemos" }));
    expect(container.querySelector("iframe")?.getAttribute("src")).toContain("youtube-nocookie.com/embed/abcdefghijk");
  });

  it("un video de TikTok va como un botón que lo abre", () => {
    const bloques: BloquePublico[] = [{ tipo: "VIDEO", titulo: null, url: "https://www.tiktok.com/@elfogon/video/123" }];
    render(<VistaPagina pagina={conSitio(bloques)} urlReservar="/r/x" modo="movil" />);
    expect(screen.getByRole("link", { name: "Ver el video en TikTok" })).toHaveAttribute("href", "https://www.tiktok.com/@elfogon/video/123");
  });

  it("el WhatsApp flotante en gastronomía y la barra de reservar en belleza", () => {
    const { unmount } = render(<VistaPagina pagina={conSitio()} urlReservar="/r/x" modo="movil" />);
    expect(screen.getByRole("link", { name: "Escribinos por WhatsApp" })).toHaveAttribute("href", "https://wa.me/59170123456");
    unmount();
    render(
      <VistaPagina
        pagina={{ ...conSitio(), reservar: true, destacado: null, sitio: { plantilla: "BELLEZA", bloques: BLOQUES } }}
        urlReservar="/r/x/reservar"
        modo="movil"
      />,
    );
    expect(screen.getByTestId("vista-pagina")).toHaveAttribute("data-sitio", "BELLEZA");
    expect(screen.getAllByRole("link", { name: "Reservar" }).some((a) => a.getAttribute("href") === "/r/x/reservar")).toBe(true);
    expect(screen.getByRole("link", { name: /Reservá tu turno/ })).toHaveAttribute("href", "/r/x/reservar");
  });

  it("en la computadora, el menú de arriba lleva a los bloques que están", () => {
    render(<VistaPagina pagina={conSitio()} urlReservar="/r/x" modo="escritorio" />);
    const menu = screen.getByRole("navigation", { name: "Secciones" });
    const anclas = within(menu).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(anclas).toEqual(["#catalogo", "#nosotros", "#galeria", "#ubicacion", "#preguntas", "#video", "#catalogo"]);
  });

  it("en el celular el menú se abre con el botón", () => {
    render(<VistaPagina pagina={conSitio()} urlReservar="/r/x" modo="movil" />);
    expect(screen.queryByRole("navigation", { name: "Secciones" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
    expect(within(screen.getByRole("navigation", { name: "Secciones" })).getByRole("link", { name: "Carta" })).toHaveAttribute(
      "href",
      "#catalogo",
    );
  });

  it("las miniaturas del selector de estilos no dibujan el sitio", () => {
    render(<VistaPagina pagina={conSitio()} urlReservar="/r/x" modo="movil" miniatura />);
    expect(screen.getByTestId("miniatura-pagina")).not.toHaveAttribute("data-sitio");
  });
});
