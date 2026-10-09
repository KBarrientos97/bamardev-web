import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PaginaPublica } from "../../lib/pagina/tipos";
import VistaPagina from "./VistaPagina";

/** Los estilos de página (09-oct): cada uno arma la página entera, en celular y en computadora. */

const PAGINA: PaginaPublica = {
  subdominio: "elfilo",
  nombre: "Barbería El Filo",
  rubro: "Barbería",
  iniciales: "EF",
  descripcion: "Fade, clásico y barba. Sin apuro.",
  color: { clave: "TEJA", hex: "#B23A2E" },
  formaBotones: "RECTO",
  tipografia: "BEBAS",
  logoUrl: "/publico/pagina/elfilo/imagen/logo?v=1",
  portadaUrl: "/publico/pagina/elfilo/imagen/portada?v=1",
  anuncio: { texto: "Corte + barba a Bs 70", url: null },
  reservar: true,
  destacado: null,
  redes: [{ id: 1, tipo: "INSTAGRAM", etiqueta: "Instagram", url: "https://www.instagram.com/elfilo", icono: null }],
  botones: [{ id: 2, tipo: "BOTON", etiqueta: "Promos del mes", url: "https://elfilo.bo/promos", icono: "promo" }],
  sucursales: [
    { nombre: "Centro", reservaSlug: "centro", direccion: "Calle Sucre #312", telefono: "33112233", horario: "Lun a sáb 10 a 21", mapaUrl: "https://maps.app.goo.gl/x" },
    { nombre: "Norte", reservaSlug: null, direccion: "Av. Banzer 4to anillo", telefono: null, horario: null, mapaUrl: null },
  ],
  catalogo: {
    titulo: "Cortes",
    items: [
      { id: 1, titulo: "Fade", descripcion: "Con navaja", precio: 50, precioDesde: false, fotoUrl: null },
      { id: 2, titulo: "Barba", descripcion: null, precio: 30, precioDesde: true, fotoUrl: null },
    ],
  },
  pie: { atribucionUrl: "https://bamardev.com" },
  og: { titulo: "Barbería El Filo", descripcion: "", imagen: null, url: "" },
};

const ESTILOS = ["CLASICO", "VITRINA", "VIVO", "NOCHE", "BOUTIQUE"] as const;
const MODOS = ["movil", "escritorio"] as const;

function montar(p: Partial<PaginaPublica>, modo: (typeof MODOS)[number]) {
  return render(<VistaPagina pagina={{ ...PAGINA, ...p }} urlReservar="/r/elfilo/reservar" urlPrivacidad="/p/elfilo/privacidad" modo={modo} />);
}

describe("estilos de página", () => {
  for (const estilo of ESTILOS) {
    for (const modo of MODOS) {
      for (const conPortada of [true, false]) {
        it(`${estilo} en ${modo}, ${conPortada ? "con" : "sin"} portada: todo lo de la página, con un solo h1 y un main`, () => {
          const { unmount } = montar({ estilo, portadaUrl: conPortada ? PAGINA.portadaUrl : null }, modo);
          const vista = screen.getByTestId("vista-pagina");
          expect(vista).toHaveAttribute("data-estilo", estilo);
          expect(vista).toHaveAttribute("data-modo", modo);
          expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
          expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Barbería El Filo");
          expect(screen.getAllByRole("main")).toHaveLength(1);
          expect(screen.getByAltText("Logo de Barbería El Filo")).toBeInTheDocument();
          expect(screen.getByRole("link", { name: /Reservar turno/ })).toHaveAttribute("href", "/r/elfilo/reservar");
          expect(screen.getByRole("link", { name: /Promos del mes/ })).toBeInTheDocument();
          expect(screen.getByRole("link", { name: "Instagram" })).toBeInTheDocument();
          expect(screen.getByRole("note")).toHaveTextContent("Corte + barba a Bs 70");
          expect(screen.getByRole("heading", { level: 2, name: "Cortes" })).toBeInTheDocument();
          expect(screen.getByRole("heading", { level: 2, name: /sucursales/i })).toBeInTheDocument();
          expect(screen.getByRole("link", { name: "Reservar" })).toHaveAttribute("href", "/r/elfilo/reservar/centro");
          expect(screen.getByRole("link", { name: "Llamar" })).toHaveAttribute("href", "tel:+59133112233");
          expect(screen.getByRole("link", { name: /Hecho con BamarDev/ })).toBeInTheDocument();
          // La portada: como <img> decorativa (Vivo, Boutique) o de fondo (el resto).
          const html = vista.innerHTML;
          expect(html.includes("imagen/portada")).toBe(conPortada);
          unmount();
        });
      }
    }
  }

  it("Vitrina sin portada cae al encabezado de color (degradado del acento al oscuro)", () => {
    montar({ estilo: "VITRINA", portadaUrl: null }, "movil");
    const encabezado = screen.getByRole("heading", { level: 1 }).closest("header")!;
    expect(encabezado.style.background).toContain("linear-gradient");
    expect(encabezado.style.background).toContain("rgb(178, 58, 46)");
  });

  it("Vitrina con portada: la foto arriba y el botón principal encima de ella", () => {
    montar({ estilo: "VITRINA" }, "movil");
    const encabezado = screen.getByRole("heading", { level: 1 }).closest("header")!;
    expect(encabezado.style.backgroundImage).toContain("imagen/portada");
    expect(within(encabezado).getByRole("link", { name: /Reservar turno/ })).toBeInTheDocument();
  });

  it("Vivo: el fondo es el color y el botón principal va blanco con letra del color", () => {
    montar({ estilo: "VIVO", formaBotones: "RELIEVE" }, "movil");
    expect(screen.getByTestId("vista-pagina")).toHaveStyle({ background: "#B23A2E" });
    const reservar = screen.getByRole("link", { name: /Reservar turno/ });
    expect(reservar.style.background).toBe("rgb(255, 255, 255)");
    // La portada como tarjeta, pedida antes que el resto y con su proporción.
    const portada = screen.getByTestId("vista-pagina").querySelector("img[src*='portada']")!;
    expect(portada).toHaveAttribute("fetchpriority", "high");
    expect(portada).toHaveAttribute("width", "1600");
  });

  it("Noche: oscuro, el nombre en mayúsculas y las tarjetas de sucursal oscuras", () => {
    montar({ estilo: "NOCHE" }, "movil");
    expect(screen.getByTestId("vista-pagina")).toHaveStyle({ background: "#111113" });
    expect(screen.getByRole("heading", { level: 1 }).style.textTransform).toBe("uppercase");
    const centro = screen.getByText("Centro").closest("article")!;
    expect(centro.style.background).toBe("rgb(28, 28, 31)");
  });

  it("Boutique: sucursales como texto (sin tarjeta) y el catálogo sin caja", () => {
    montar({ estilo: "BOUTIQUE" }, "movil");
    expect(screen.getByTestId("vista-pagina")).toHaveStyle({ background: "#FAF7F2" });
    const centro = screen.getByText("Centro").closest("article")!;
    expect(centro.style.background).toBe("");
    expect(screen.getByRole("button", { name: /^Fade/ }).style.background).toBe("transparent");
  });

  it("cada estilo aguanta una página casi vacía y un nombre largo", () => {
    const vacia: Partial<PaginaPublica> = {
      nombre: "Peluquería y Centro de Estética Integral Las Hermanas Gutiérrez",
      descripcion: null,
      rubro: "",
      logoUrl: null,
      portadaUrl: null,
      anuncio: null,
      reservar: false,
      destacado: null,
      redes: [],
      botones: [],
      sucursales: [],
      catalogo: null,
    };
    for (const estilo of ESTILOS) {
      for (const modo of MODOS) {
        const { unmount } = montar({ ...vacia, estilo }, modo);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Hermanas Gutiérrez/);
        expect(screen.queryByRole("note")).not.toBeInTheDocument();
        expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Hecho con BamarDev/ })).toBeInTheDocument();
        unmount();
      }
    }
  });

  it("sin estilo (un backend anterior) es el Clásico, idéntico", () => {
    const { container: sin, unmount } = montar({ estilo: undefined }, "movil");
    // Sin los ids de useId, que cambian de un montaje a otro.
    const limpio = (h: string) => h.replace(/(id|aria-labelledby)="[^"]*"/g, "");
    const html = limpio(sin.innerHTML);
    unmount();
    const { container: con } = montar({ estilo: "CLASICO" }, "movil");
    expect(limpio(con.innerHTML)).toBe(html);
    expect(screen.getByTestId("vista-pagina")).toHaveAttribute("data-estilo", "CLASICO");
  });

  it("un estilo desconocido también cae en el Clásico", () => {
    // (Hasta el 09-oct era "MOSAICO", que desde la fase 2 existe.)
    montar({ estilo: "INEXISTENTE" }, "escritorio");
    expect(screen.getByTestId("vista-pagina")).toHaveAttribute("data-estilo", "CLASICO");
  });
});
