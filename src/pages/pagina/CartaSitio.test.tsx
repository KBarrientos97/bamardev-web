import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ItemCatalogoPublico, PaginaPublica } from "../../lib/pagina/tipos";
import { usePedido } from "../../lib/pagina/usePedido";
import { categoriasDe } from "../../lib/pagina/carta";
import PedidoPagina from "./PedidoPagina";
import VistaPagina from "./VistaPagina";

/**
 * La carta del sitio con «+» en cada fila y la barra del pedido (09-nov):
 * sumar sin abrir el visor, «− n +» en la fila, filtro por categoría y el
 * panel que dice qué falta antes de mandar.
 */

const producto = (id: number, titulo: string, precio: number, categoria: string | null): ItemCatalogoPublico => ({
  id,
  titulo,
  descripcion: null,
  precio,
  precioDesde: false,
  fotoUrl: null,
  icono: null,
  categoria,
});

const ITEMS = [
  producto(1, "Silpancho", 30, "Platos"),
  producto(2, "Pique macho", 45, "Platos"),
  producto(3, "Mocochinchi", 6, "Bebidas"),
];

const PAGINA: PaginaPublica = {
  subdominio: "saborcriollo",
  nombre: "Sabor Criollo",
  rubro: "Restaurante",
  rubroClave: "RESTAURANTE",
  iniciales: "SC",
  descripcion: null,
  color: { clave: "ROJO", hex: "#C0262D" },
  formaBotones: "REDONDEADO",
  tipografia: "BEBAS",
  logoUrl: null,
  portadaUrl: null,
  anuncio: null,
  reservar: false,
  destacado: null,
  redes: [],
  botones: [{ id: 7, tipo: "WHATSAPP", etiqueta: "WhatsApp", url: "https://wa.me/59170000127", icono: null }],
  sucursales: [],
  catalogo: { titulo: "Carta", items: ITEMS },
  pedidos: true,
  pie: { atribucionUrl: "https://bamardev.com" },
  og: { titulo: "Sabor Criollo", descripcion: "", imagen: null, url: "" },
  sitio: { plantilla: "GASTRONOMIA", bloques: [{ tipo: "CATALOGO", titulo: "La carta" }] },
};

/** Lo mismo que arma PaginaPublica: la vista y el pedido con el mismo estado. */
function Pagina({ pagina = PAGINA }: { pagina?: PaginaPublica }) {
  const pedido = usePedido(pagina.subdominio);
  return (
    <>
      <VistaPagina
        pagina={pagina}
        urlReservar="/r/x"
        modo="movil"
        alAgregarAlPedido={pedido.agregar}
        lineasPedido={pedido.lineas}
        alCambiarPedido={pedido.cambiar}
      />
      <PedidoPagina
        negocio={pagina.nombre}
        color={pagina.color.hex}
        destinos={[{ etiqueta: "General", url: "https://wa.me/59170000127" }]}
        pedido={pedido}
        subdominio={pagina.subdominio}
      />
    </>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("carta del sitio", () => {
  it("las categorías salen en el orden en que aparecen, sin repetir", () => {
    expect(categoriasDe([...ITEMS, producto(4, "Chairo", 18, "Platos"), producto(5, "Extra", 5, null)])).toEqual(["Platos", "Bebidas"]);
  });

  it("cada fila suma con su «+», sin abrir nada, y pasa a «− n +»", () => {
    render(<Pagina />);
    expect(screen.queryByTestId("barra-pedido")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Agregar Silpancho al pedido" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("group", { name: "Silpancho: 1 en el pedido" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sumar uno de Silpancho" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar Mocochinchi al pedido" }));
    expect(screen.getByRole("button", { name: "Ver tu pedido: 3 productos, Bs 66" })).toBeInTheDocument();
    // Con uno solo, el «−» lo saca del pedido y vuelve el «+».
    fireEvent.click(screen.getByRole("button", { name: "Quitar Mocochinchi del pedido" }));
    expect(screen.getByRole("button", { name: "Agregar Mocochinchi al pedido" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver tu pedido: 2 productos, Bs 60" })).toBeInTheDocument();
  });

  it("filtra por categoría y con «Todo» la agrupa como una carta", () => {
    render(<Pagina />);
    const filtros = within(screen.getByRole("group", { name: "Categorías" }));
    expect(screen.getByRole("heading", { level: 3, name: "Platos" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Bebidas" })).toBeInTheDocument();
    fireEvent.click(filtros.getByRole("button", { name: "Bebidas" }));
    expect(screen.getAllByTestId("fila-carta")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Agregar Silpancho al pedido" })).toBeNull();
    fireEvent.click(filtros.getByRole("button", { name: "Todo" }));
    expect(screen.getAllByTestId("fila-carta")).toHaveLength(3);
  });

  it("tocar la fila abre el visor con el detalle", () => {
    render(<Pagina />);
    fireEvent.click(screen.getByRole("button", { name: "Pique macho, Bs 45: ver detalle" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("sin el interruptor de pedidos la carta es la misma, sin «+»", () => {
    render(<VistaPagina pagina={{ ...PAGINA, pedidos: false }} urlReservar="/r/x" modo="movil" />);
    expect(screen.getAllByTestId("fila-carta")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /al pedido$/ })).toBeNull();
  });

  it("en la vista previa del editor el «+» se ve pero no suma", () => {
    render(<VistaPagina pagina={PAGINA} urlReservar="/r/x" modo="movil" enMarco />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar Silpancho al pedido" }));
    expect(screen.getByRole("button", { name: "Agregar Silpancho al pedido" })).toBeInTheDocument();
  });

  it("con el pedido armado se va el WhatsApp flotante: abajo queda la barra", () => {
    render(<Pagina />);
    expect(screen.getByRole("link", { name: "Escribinos por WhatsApp" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Agregar Silpancho al pedido" }));
    expect(screen.queryByRole("link", { name: "Escribinos por WhatsApp" })).toBeNull();
  });
});

describe("panel del pedido", () => {
  it("delivery sin dirección: dice qué falta en vez de quedar gris sin más", () => {
    render(<Pagina />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar Silpancho al pedido" }));
    fireEvent.click(screen.getByRole("button", { name: /Ver tu pedido/ }));
    const panel = within(screen.getByRole("dialog", { name: "Tu pedido" }));
    fireEvent.click(panel.getByRole("radio", { name: "Delivery" }));
    fireEvent.click(panel.getByRole("link", { name: "Enviar pedido por WhatsApp" }));
    expect(panel.getByRole("alert")).toHaveTextContent("Escribí la dirección para el delivery.");
    fireEvent.change(panel.getByRole("textbox", { name: "Dirección de entrega" }), { target: { value: "Av. América 1250" } });
    const enviar = panel.getByRole("link", { name: "Enviar pedido por WhatsApp" });
    expect(enviar).toHaveAttribute("aria-disabled", "false");
    expect(decodeURIComponent(enviar.getAttribute("href") ?? "")).toContain("Delivery a: Av. América 1250");
  });

  it("recuerda nombre y dirección en este navegador, no la nota", () => {
    const { unmount } = render(<Pagina />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar Silpancho al pedido" }));
    fireEvent.click(screen.getByRole("button", { name: /Ver tu pedido/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tu nombre" }), { target: { value: "Ana" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Nota para el negocio" }), { target: { value: "Sin cebolla" } });
    unmount();
    render(<Pagina />);
    fireEvent.click(screen.getByRole("button", { name: /Ver tu pedido/ }));
    expect(screen.getByRole("textbox", { name: "Tu nombre" })).toHaveValue("Ana");
    expect(screen.getByRole("textbox", { name: "Nota para el negocio" })).toHaveValue("");
  });

  it("«Agregar más productos» vuelve a la carta y vaciar lo cierra", () => {
    render(<Pagina />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar Silpancho al pedido" }));
    fireEvent.click(screen.getByRole("button", { name: /Ver tu pedido/ }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar más productos" }));
    expect(screen.queryByRole("dialog", { name: "Tu pedido" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ver tu pedido/ }));
    fireEvent.click(screen.getByRole("button", { name: "Vaciar pedido" }));
    expect(screen.queryByRole("dialog", { name: "Tu pedido" })).toBeNull();
    expect(screen.queryByTestId("barra-pedido")).toBeNull();
  });
});
