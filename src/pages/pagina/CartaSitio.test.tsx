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

  it("con pocos ítems, las categorías filtran ahí mismo", () => {
    render(<Pagina />);
    const filtros = within(screen.getByRole("group", { name: "Categorías" }));
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

const muchos = (n: number) =>
  Array.from({ length: n }, (_, i) => producto(i + 1, `Plato ${i + 1}`, 10 + i, i % 2 ? "Bebidas" : "Platos"));

describe("portada y tienda", () => {
  it("con más de seis, la portada muestra seis y lleva a la tienda; las categorías también", () => {
    const pagina = { ...PAGINA, catalogo: { titulo: "Carta", items: muchos(9) } };
    render(<VistaPagina pagina={pagina} urlReservar="/r/x" modo="movil" urlTienda="/saborcriollo/tienda" />);
    expect(screen.getAllByTestId("fila-carta")).toHaveLength(6);
    expect(screen.getByRole("link", { name: "Ver toda la carta (9)" })).toHaveAttribute("href", "/saborcriollo/tienda");
    expect(screen.getByRole("link", { name: "Bebidas" })).toHaveAttribute("href", "/saborcriollo/tienda?categoria=Bebidas");
  });

  it("la tienda muestra todo, con buscador y la categoría con la que se llegó", () => {
    const pagina = { ...PAGINA, catalogo: { titulo: "Carta", items: muchos(9) } };
    render(
      <VistaPagina pagina={pagina} urlReservar="/r/x" modo="movil" urlTienda="/x/tienda" tienda={{ urlInicio: "/saborcriollo", categoria: "Bebidas" }} />,
    );
    expect(screen.getByRole("link", { name: /Volver al inicio/ })).toHaveAttribute("href", "/saborcriollo");
    expect(screen.queryByRole("link", { name: /Ver toda la carta/ })).toBeNull();
    expect(screen.getAllByTestId("fila-carta")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Todo" }));
    expect(screen.getAllByTestId("fila-carta")).toHaveLength(9);
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar en la tienda" }), { target: { value: "plato 7" } });
    expect(screen.getAllByTestId("fila-carta")).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar en la tienda" }), { target: { value: "pizza" } });
    expect(screen.getByText("No encontramos «pizza».")).toBeInTheDocument();
  });

  it("en la computadora, la tienda pone las categorías en una columna", () => {
    const pagina = { ...PAGINA, catalogo: { titulo: "Carta", items: muchos(9) } };
    render(<VistaPagina pagina={pagina} urlReservar="/r/x" modo="escritorio" tienda={{ urlInicio: "/s", categoria: null }} />);
    expect(screen.getByTestId("menu-categorias")).toBeInTheDocument();
  });
});

const servicio = (id: number, titulo: string, precio: number, servicioId: number, duracionMin: number): ItemCatalogoPublico => ({
  ...producto(id, titulo, precio, null),
  servicioId,
  duracionMin,
});

const BELLEZA: PaginaPublica = {
  ...PAGINA,
  subdominio: "bellavista",
  nombre: "Bella Vista",
  rubroClave: "PELUQUERIA",
  sitio: { plantilla: "BELLEZA", bloques: [{ tipo: "CATALOGO", titulo: "Servicios" }] },
  catalogo: {
    titulo: "Servicios",
    items: [servicio(1, "Corte de dama", 60, 191, 45), servicio(2, "Alisado", 500, 356, 120), producto(3, "Acondicionador", 60, "Productos")],
  },
};

describe("servicios y productos", () => {
  it("con reserva online: el servicio dice su duración y lleva a reservar ése; el producto se suma", () => {
    render(<VistaPagina pagina={{ ...BELLEZA, reservar: true }} urlReservar="/r/bellavista/reservar" modo="movil" alAgregarAlPedido={() => {}} />);
    expect(screen.getAllByTestId("fila-servicio")).toHaveLength(2);
    expect(screen.getByText("45 min")).toBeInTheDocument();
    expect(screen.getByText("2 h")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reservar Corte de dama" })).toHaveAttribute("href", "/r/bellavista/reservar?servicio=191");
    expect(screen.queryByRole("button", { name: "Agregar Corte de dama al pedido" })).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Productos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar Acondicionador al pedido" })).toBeInTheDocument();
  });

  it("sin reserva online: el servicio se agrega una sola vez, sin cantidad", () => {
    render(<Pagina pagina={BELLEZA} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar Corte de dama al pedido" }));
    expect(screen.getByRole("button", { name: "Quitar Corte de dama del pedido" })).toHaveTextContent("Agregado");
    expect(screen.queryByRole("button", { name: "Sumar uno de Corte de dama" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ver tu pedido: 1 producto/ }));
    const panel = within(screen.getByRole("dialog", { name: "Tu pedido" }));
    expect(panel.queryByRole("button", { name: "Sumar uno de Corte de dama" })).toBeNull();
    expect(panel.getByRole("button", { name: "Quitar Corte de dama del pedido" })).toBeInTheDocument();
  });
});

describe("dónde estamos", () => {
  const sucursal = (nombre: string) => ({ nombre, reservaSlug: null, direccion: `Calle ${nombre}`, telefono: null, horario: null, mapaUrl: null });
  it("en la computadora, varias sucursales van una al lado de la otra", () => {
    const pagina = {
      ...PAGINA,
      sitio: { plantilla: "GASTRONOMIA", bloques: [{ tipo: "UBICACION" as const, titulo: "Dónde estamos" }] },
      sucursales: [sucursal("Centro"), sucursal("Norte")],
    };
    render(<VistaPagina pagina={pagina} urlReservar="/r/x" modo="escritorio" />);
    expect(screen.getByTestId("tarjetas-sucursal").style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
  });
});
