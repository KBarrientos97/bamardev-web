import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaginaPublica } from "../../lib/pagina/tipos";
import VistaPagina from "./VistaPagina";

/** El catálogo en la página pública: el carrusel y el visor que se abre al tocar. */

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

/** La tarjeta por su título: el nombre accesible suma precio y "(1 de 3)". */
const tarjeta = (titulo: string) => screen.getByRole("button", { name: new RegExp(`^${titulo}[,( ]`) });
const fila = () => screen.getByTestId("fila-catalogo");

afterEach(() => vi.useRealTimers());

const visor = () => screen.getByRole("dialog");

describe("catálogo de la página pública", () => {
  it("muestra la sección con su título, las fotos y los precios formateados", () => {
    montar();
    expect(screen.getByRole("heading", { name: "Nuestros trabajos" })).toBeInTheDocument();
    expect(screen.getByText("Desde Bs 80")).toBeInTheDocument();
    expect(screen.getByText("Bs 50,50")).toBeInTheDocument();
    // Sin precio no muestra nada; sin foto, la inicial.
    // (La 3.ª está fuera de la vista en el celular: aria-hidden, sin nombre accesible.)
    expect(screen.getByText("Asesoría de color").closest("button")).toHaveTextContent(/^AAsesoría de color$/);
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
    const primera = tarjeta("Uñas acrílicas");
    primera.focus();
    fireEvent.click(primera);
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
    expect(primera).toHaveFocus();
  });

  it("un clic en el fondo lo cierra; en la foto, no", () => {
    montar();
    fireEvent.click(tarjeta("Uñas acrílicas"));
    fireEvent.click(within(visor()).getAllByAltText("Uñas acrílicas")[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(visor());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("con reserva online, el botón del visor es Reservar", () => {
    montar({ reservar: true, redes: [WHATSAPP] });
    fireEvent.click(screen.getByRole("button", { name: "Ver Corte clásico" }));
    fireEvent.click(tarjeta("Corte clásico"));
    expect(within(visor()).getByRole("link", { name: /^Reservar$/ })).toHaveAttribute("href", "/r/bellavista/reservar");
    expect(within(visor()).queryByText("Consultar por WhatsApp")).not.toBeInTheDocument();
  });

  it("sin reserva y con WhatsApp: consultar con el ítem en el mensaje (y cuenta el clic)", () => {
    const alClic = montar({ redes: [WHATSAPP] });
    fireEvent.click(screen.getByRole("button", { name: "Ver Corte clásico" }));
    fireEvent.click(tarjeta("Corte clásico"));
    const consultar = within(visor()).getByRole("link", { name: /Consultar por WhatsApp/ });
    expect(consultar).toHaveAttribute("href", "https://wa.me/59170123456?text=Hola%2C%20me%20interesa%3A%20Corte%20cl%C3%A1sico");
    fireEvent.click(consultar);
    expect(alClic).toHaveBeenCalledWith(WHATSAPP);
  });

  it("sin reserva ni WhatsApp, el visor no tiene botón", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver Corte clásico" }));
    fireEvent.click(tarjeta("Corte clásico"));
    expect(within(visor()).queryByRole("link")).not.toBeInTheDocument();
  });

  it("en la computadora se ven tres a la vez: con tres justos no hay puntitos ni flechas", () => {
    render(<VistaPagina pagina={PAGINA} urlReservar="#" modo="escritorio" />);
    expect(screen.getByTestId("vista-pagina")).toHaveAttribute("data-modo", "escritorio");
    expect(screen.getByRole("heading", { name: "Nuestros trabajos" })).toBeInTheDocument();
    for (const t of ["Uñas acrílicas", "Corte clásico", "Asesoría de color"]) expect(tarjeta(t)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Ver / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Siguiente" })).not.toBeInTheDocument();
    // Dentro del <main>, aunque vaya debajo de las dos columnas.
    expect(within(screen.getByRole("main")).getByText("Corte clásico")).toBeInTheDocument();
  });

  it("en el celular se ve uno y pasa solo cada 3 s, volviendo al primero al final", () => {
    vi.useFakeTimers();
    montar();
    expect(tarjeta("Uñas acrílicas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Corte clásico/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Ver / })).toHaveLength(3);
    act(() => vi.advanceTimersByTime(3000));
    expect(tarjeta("Corte clásico")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver Corte clásico" })).toHaveAttribute("aria-current", "true");
    act(() => vi.advanceTimersByTime(3000));
    expect(tarjeta("Asesoría de color")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(tarjeta("Uñas acrílicas")).toBeInTheDocument();
  });

  it("al presionarlo se queda quieto ahí", () => {
    vi.useFakeTimers();
    montar();
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.pointerDown(fila(), { clientX: 100, clientY: 100 });
    fireEvent.pointerUp(fila(), { clientX: 100, clientY: 100 });
    act(() => vi.advanceTimersByTime(9000));
    expect(tarjeta("Corte clásico")).toBeInTheDocument();
  });

  it("se desliza con el dedo, y el deslizamiento no abre el visor", () => {
    montar();
    fireEvent.pointerDown(fila(), { clientX: 300, clientY: 100 });
    fireEvent.pointerUp(fila(), { clientX: 180, clientY: 110 });
    fireEvent.click(screen.getByText("Uñas acrílicas").closest("button")!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(tarjeta("Corte clásico")).toBeInTheDocument();
    fireEvent.pointerDown(fila(), { clientX: 100, clientY: 100 });
    fireEvent.pointerUp(fila(), { clientX: 220, clientY: 100 });
    expect(tarjeta("Uñas acrílicas")).toBeInTheDocument();
  });

  it("en la computadora, con más de tres, avanza de a uno con flechas y puntitos", () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      titulo: `Plato ${i + 1}`,
      descripcion: null,
      precio: 20 + i,
      precioDesde: false,
      fotoUrl: null,
    }));
    render(
      <VistaPagina pagina={{ ...PAGINA, catalogo: { titulo: "Menú", items } }} urlReservar="#" modo="escritorio" />,
    );
    // 5 ítems de a 3: tres posiciones.
    expect(screen.getAllByRole("button", { name: /^Ver / })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /^Plato 4/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(tarjeta("Plato 4")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Plato 1/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver Plato 3" }));
    expect(tarjeta("Plato 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    expect(fila().style.transform).toContain("-2 *");
  });
});
