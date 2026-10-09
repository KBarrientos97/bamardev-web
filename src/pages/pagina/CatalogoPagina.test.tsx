import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PaginaPublica } from "../../lib/pagina/tipos";
import VistaPagina from "./VistaPagina";

/** El catálogo en la página pública: la grilla y el visor que se abre al tocar. */

const PAGINA: PaginaPublica = {
  subdominio: "bellavista",
  nombre: "Salón Bella Vista",
  rubro: "Peluquería",
  iniciales: "SB",
  descripcion: null,
  color: { clave: "CIRUELA", hex: "#9B2C6B" },
  formaBotones: "REDONDEADO",
  tipografia: "MODERNA",
  logoUrl: null,
  portadaUrl: null,
  anuncio: null,
  reservar: false,
  destacado: null,
  redes: [{ id: 8, tipo: "INSTAGRAM", etiqueta: "Instagram", url: "https://www.instagram.com/bv", icono: null }],
  botones: [],
  sucursales: [],
  catalogo: {
    titulo: "Nuestros trabajos",
    items: [
      { id: 1, titulo: "Uñas acrílicas", descripcion: "Con diseño a elección", precio: 80, precioDesde: true, fotoUrl: "/publico/pagina/bellavista/catalogo/1?v=a" },
      { id: 2, titulo: "Corte clásico", descripcion: null, precio: 50.5, precioDesde: false, fotoUrl: null },
      { id: 3, titulo: "Asesoría de color", descripcion: null, precio: null, precioDesde: false, fotoUrl: null },
    ],
  },
  pie: { atribucionUrl: "https://bamardev.com" },
  og: { titulo: "Salón Bella Vista", descripcion: "", imagen: null, url: "" },
};

const WHATSAPP = { id: 9, tipo: "WHATSAPP", etiqueta: "WhatsApp", url: "https://wa.me/59170123456", icono: null };

function montar(p: Partial<PaginaPublica> = {}, alClic = vi.fn()) {
  render(<VistaPagina pagina={{ ...PAGINA, ...p }} urlReservar="/r/bellavista/reservar" alClic={alClic} />);
  return alClic;
}

const visor = () => screen.getByRole("dialog");

describe("catálogo de la página pública", () => {
  it("muestra la sección con su título, las fotos y los precios formateados", () => {
    montar();
    expect(screen.getByRole("heading", { name: "Nuestros trabajos" })).toBeInTheDocument();
    expect(screen.getByText("Desde Bs 80")).toBeInTheDocument();
    expect(screen.getByText("Bs 50,50")).toBeInTheDocument();
    // Sin precio no muestra nada; sin foto, la inicial.
    expect(screen.getByRole("button", { name: "Asesoría de color" })).toHaveTextContent(/^AAsesoría de color$/);
    const foto = screen.getByAltText("Uñas acrílicas");
    expect(foto).toHaveAttribute("src", "/api/publico/pagina/bellavista/catalogo/1?v=a");
    expect(foto).toHaveAttribute("loading", "lazy");
    expect(screen.getByText("Con diseño a elección")).toBeInTheDocument();
  });

  it("sin catálogo no hay sección", () => {
    montar({ catalogo: null });
    expect(screen.queryByRole("heading", { name: "Nuestros trabajos" })).not.toBeInTheDocument();
    montar({ catalogo: undefined });
    expect(screen.queryByText("Desde Bs 80")).not.toBeInTheDocument();
  });

  it("el visor: se abre al tocar, avanza, y Esc lo cierra devolviendo el foco", () => {
    montar();
    const tarjeta = screen.getByRole("button", { name: "Uñas acrílicas, Desde Bs 80" });
    tarjeta.focus();
    fireEvent.click(tarjeta);
    expect(visor()).toHaveAttribute("aria-modal", "true");
    expect(within(visor()).getByText("1 de 3")).toBeInTheDocument();
    expect(within(visor()).getByRole("heading", { name: "Uñas acrílicas" })).toBeInTheDocument();
    expect(within(visor()).getByRole("button", { name: "Anterior" })).toBeDisabled();
    expect(within(visor()).getByRole("button", { name: "Cerrar" })).toHaveFocus();

    fireEvent.click(within(visor()).getByRole("button", { name: "Siguiente" }));
    expect(within(visor()).getByText("2 de 3")).toBeInTheDocument();
    expect(within(visor()).getByRole("heading", { name: "Corte clásico" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(within(visor()).getByText("3 de 3")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(within(visor()).getByText("2 de 3")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(tarjeta).toHaveFocus();
  });

  it("un clic en el fondo lo cierra; en la foto, no", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Uñas acrílicas, Desde Bs 80" }));
    fireEvent.click(within(visor()).getAllByAltText("Uñas acrílicas")[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(visor());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("con reserva online, el botón del visor es Reservar", () => {
    montar({ reservar: true, redes: [WHATSAPP] });
    fireEvent.click(screen.getByRole("button", { name: "Corte clásico, Bs 50,50" }));
    expect(within(visor()).getByRole("link", { name: /^Reservar$/ })).toHaveAttribute("href", "/r/bellavista/reservar");
    expect(within(visor()).queryByText("Consultar por WhatsApp")).not.toBeInTheDocument();
  });

  it("sin reserva y con WhatsApp: consultar con el ítem en el mensaje (y cuenta el clic)", () => {
    const alClic = montar({ redes: [WHATSAPP] });
    fireEvent.click(screen.getByRole("button", { name: "Corte clásico, Bs 50,50" }));
    const consultar = within(visor()).getByRole("link", { name: /Consultar por WhatsApp/ });
    expect(consultar).toHaveAttribute("href", "https://wa.me/59170123456?text=Hola%2C%20me%20interesa%3A%20Corte%20cl%C3%A1sico");
    fireEvent.click(consultar);
    expect(alClic).toHaveBeenCalledWith(WHATSAPP);
  });

  it("sin reserva ni WhatsApp, el visor no tiene botón", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Corte clásico, Bs 50,50" }));
    expect(within(visor()).queryByRole("link")).not.toBeInTheDocument();
  });

  it("en la computadora también está, con las mismas tarjetas", () => {
    render(<VistaPagina pagina={PAGINA} urlReservar="#" modo="escritorio" />);
    expect(screen.getByTestId("vista-pagina")).toHaveAttribute("data-modo", "escritorio");
    expect(screen.getByRole("heading", { name: "Nuestros trabajos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uñas acrílicas, Desde Bs 80" })).toBeInTheDocument();
    // Dentro del <main>, aunque vaya debajo de las dos columnas.
    expect(within(screen.getByRole("main")).getByText("Corte clásico")).toBeInTheDocument();
  });
});
