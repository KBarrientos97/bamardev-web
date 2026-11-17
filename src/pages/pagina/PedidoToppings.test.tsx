import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InfoPedidos, SucursalPedido } from "../../lib/pedidosWeb/tipos";
import type { PaginaPublica as Pagina } from "../../lib/pagina/tipos";
import PaginaPublica from "./PaginaPublica";

/**
 * Los toppings en la página del cliente (PLAN-AGREGADOS §8.3): la tarjeta dice
 * «Incluye 2 toppings», «Agregar» abre la hoja, el carrito guarda los toppings
 * bajo cada vaso, tocarlos reabre la hoja, dos vasos distintos son dos líneas y
 * el pedido sale con `agregados` por línea.
 */

vi.mock("./ElegirPin", () => ({
  default: ({ valor, onCambio }: { valor: { lat: number; lng: number } | null; onCambio: (u: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => onCambio({ lat: -17.77, lng: -63.18 })}>
      {valor ? "Pin puesto" : "Marcar mi casa"}
    </button>
  ),
}));

const NUTELLA = { id: 84, titulo: "Nutella M", descripcion: null, precio: 20, precioDesde: false, fotoUrl: null, icono: null, categoria: "M" };
const AGUA = { id: 99, titulo: "Agua", descripcion: null, precio: 5, precioDesde: false, fotoUrl: null, icono: null, categoria: "Bebidas" };

const PAGINA: Pagina = {
  subdominio: "elganadero",
  nombre: "El Ganadero",
  rubro: "Postres",
  rubroClave: "GASTRONOMIA",
  iniciales: "EG",
  descripcion: "Arroz con leche.",
  color: { clave: "CAFE", hex: "#7C5A45" },
  formaBotones: "REDONDEADO",
  tipografia: "MODERNA",
  logoUrl: null,
  portadaUrl: null,
  anuncio: null,
  reservar: false,
  destacado: null,
  redes: [],
  botones: [],
  sucursales: [{ nombre: "Las Brisas", reservaSlug: null, direccion: "Calle 1", telefono: null, horario: null, mapaUrl: null }],
  catalogo: { titulo: "La carta", items: [NUTELLA, AGUA] },
  pedidosSistema: true,
  sitio: { plantilla: "GASTRONOMIA", bloques: [{ tipo: "CATALOGO", titulo: "La carta" }] },
  agregados: {
    grupos: [
      {
        id: 1,
        nombre: "Toppings",
        incluidos: 2,
        precioExtra: null,
        maximo: null,
        opciones: [
          { productoId: 201, nombre: "Oreo", precio: 5, icono: null },
          { productoId: 202, nombre: "Chubi", precio: 5, icono: null },
          { productoId: 203, nombre: "Coco", precio: 2, icono: null },
        ],
      },
    ],
    items: [{ itemId: 84, grupos: [{ grupoId: 1, incluidos: 2 }] }],
  },
  pie: { atribucionUrl: "https://bamardev.com" },
  og: { titulo: "El Ganadero", descripcion: "Arroz", imagen: null, url: "" },
};

const TARIFA = { tramos: [{ hastaKm: 2, base: 7 }, { hastaKm: null, porKm: 1 }], maxKm: 12 };
const BRISAS: SucursalPedido = { id: 3, nombre: "Las Brisas", latitud: -17.75, longitud: -63.18, abierta: true, tarifa: TARIFA };
const INFO: InfoPedidos = { recibe: true, motivo: null, tipos: ["RECOGER"], sucursales: [BRISAS] };

function servidor(over: { pagina?: Pagina; info?: InfoPedidos } = {}) {
  const llamadas: { url: string; init?: RequestInit }[] = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url, init });
    const json = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
    if (url === "/api/publico/pagina/elganadero") return json(200, over.pagina ?? PAGINA);
    if (url === "/api/publico/pedidos/elganadero" && init?.method === "POST") return json(201, { token: "T".repeat(40), numero: 7, estado: "RECIBIDO" });
    if (url === "/api/publico/pedidos/elganadero") return json(200, over.info ?? INFO);
    return json(404, { message: "no" });
  });
  vi.stubGlobal("fetch", f);
  return { posteos: () => llamadas.filter((l) => l.init?.method === "POST") };
}

async function montar() {
  render(
    <MemoryRouter initialEntries={["/p/elganadero"]}>
      <Routes>
        <Route path="/p/:subdominio" element={<PaginaPublica />} />
        <Route path="/p/:subdominio/pedido/:token" element={<p>Seguimiento del pedido</p>} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

const hoja = () => screen.getByRole("dialog", { name: "Toppings de Nutella M" });
const toque = (nombre: string) => fireEvent.click(within(hoja()).getByRole("button", { name: `Agregar ${nombre}` }));
const total = () => within(hoja()).getByTestId("total-hoja").textContent;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
  Object.defineProperty(navigator, "sendBeacon", { value: vi.fn(() => true), configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("toppings en la carta de la página", () => {
  it("la tarjeta del vaso dice «Incluye 2 toppings» y la bebida no dice nada", async () => {
    servidor();
    await montar();
    const tarjetas = screen.getAllByTestId("fila-carta");
    expect(tarjetas).toHaveLength(2);
    expect(within(tarjetas[0]).getByTestId("incluye")).toHaveTextContent("Incluye 2 toppings");
    expect(within(tarjetas[1]).queryByTestId("incluye")).toBeNull();
  });

  it("con la página sin toppings (agregados null) la carta es la de siempre", async () => {
    servidor({ pagina: { ...PAGINA, agregados: null } });
    await montar();
    expect(screen.queryByTestId("incluye")).toBeNull();
    // «Agregar» suma directo, sin hoja.
    fireEvent.click(screen.getByRole("button", { name: "Agregar Nutella M al pedido" }));
    expect(screen.queryByRole("dialog", { name: "Toppings de Nutella M" })).toBeNull();
    expect(screen.getByRole("group", { name: "Nutella M: 1 en el pedido" })).toBeInTheDocument();
  });

  it("«Agregar» abre la hoja; elegir 3 toppings da 2 incluidos y 1 extra con el total en vivo", async () => {
    servidor();
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Agregar Nutella M al pedido" }));
    expect(hoja()).toHaveTextContent("Incluye 2 toppings");
    expect(total()).toBe("Bs 20");
    expect(within(hoja()).getByRole("button", { name: "Agregar sin toppings" })).toBeInTheDocument();
    toque("Oreo");
    toque("Chubi");
    expect(within(hoja()).getByRole("status")).toHaveTextContent("2 de 2 incluidos");
    expect(total()).toBe("Bs 20");
    toque("Coco");
    expect(within(hoja()).getByRole("status")).toHaveTextContent("2 de 2 incluidos · 1 extra");
    expect(total()).toBe("Bs 22");
    expect(within(hoja()).getByText(/Extra: Coco/)).toBeInTheDocument();
    // Quitar el último vuelve al total anterior.
    fireEvent.click(within(hoja()).getByRole("button", { name: "Quitar Coco" }));
    expect(total()).toBe("Bs 20");
  });

  it("un topping agotado en el local sale deshabilitado en la hoja", async () => {
    servidor({ info: { ...INFO, sucursales: [{ ...BRISAS, agotadosAgregados: [202] }] } });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Agregar Nutella M al pedido" }));
    expect(within(hoja()).getByText("Agotado en este local")).toBeInTheDocument();
    expect(within(hoja()).getByRole("button", { name: "Agregar Chubi" })).toBeDisabled();
    expect(within(hoja()).getByRole("button", { name: "Agregar Oreo" })).toBeEnabled();
  });

  it("el carrito guarda los toppings bajo el vaso, tocarlos reabre la hoja y dos vasos distintos son dos líneas", async () => {
    servidor();
    await montar();
    // Vaso 1: Oreo + Chubi + Coco (un extra).
    fireEvent.click(screen.getByRole("button", { name: "Agregar Nutella M al pedido" }));
    toque("Oreo");
    toque("Chubi");
    toque("Coco");
    fireEvent.click(within(hoja()).getByRole("button", { name: "Agregar al pedido" }));
    expect(screen.queryByRole("dialog", { name: "Toppings de Nutella M" })).toBeNull();
    // Vaso 2: sin toppings.
    fireEvent.click(screen.getByRole("button", { name: "Agregar Nutella M al pedido" }));
    fireEvent.click(within(hoja()).getByRole("button", { name: "Agregar sin toppings" }));

    fireEvent.click(await screen.findByRole("button", { name: /Ver tu pedido: 2 productos, Bs 42/ }));
    const carrito = await screen.findByRole("dialog", { name: "Tu pedido" });
    const lineas = within(carrito).getAllByRole("listitem").filter((li) => li.querySelector("[aria-label^='Cantidad de']"));
    expect(lineas).toHaveLength(2);
    const toppings = within(lineas[0]).getAllByTestId("topping-linea");
    expect(toppings.map((t) => t.textContent)).toEqual(["+ Oreoincluido", "+ Chubiincluido", "+ CocoBs 2"]);
    expect(within(lineas[1]).queryByTestId("topping-linea")).toBeNull();
    expect(within(lineas[1]).getByRole("button", { name: "Elegir los toppings de Nutella M" })).toBeInTheDocument();

    // Tocar los toppings reabre la hoja con lo elegido; sacar el Coco deja el vaso en Bs 20.
    fireEvent.click(within(lineas[0]).getByRole("button", { name: "Cambiar los toppings de Nutella M" }));
    expect(total()).toBe("Bs 22");
    expect(within(hoja()).getByRole("button", { name: "Guardar cambios" })).toBeInTheDocument();
    fireEvent.click(within(hoja()).getByRole("button", { name: "Quitar Coco" }));
    fireEvent.click(within(hoja()).getByRole("button", { name: "Guardar cambios" }));
    expect(within(screen.getByRole("dialog", { name: "Tu pedido" })).getAllByTestId("topping-linea")).toHaveLength(2);
    // El total del carrito ya no lleva el Coco: 2 vasos de Bs 20.
    expect(within(screen.getByRole("dialog", { name: "Tu pedido" })).getAllByText(/Bs 40/).length).toBeGreaterThan(0);
  });

  it("hace el pedido con los toppings por línea, en el orden elegido y sin precios", async () => {
    const s = servidor();
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Agregar Nutella M al pedido" }));
    toque("Coco");
    toque("Oreo");
    toque("Oreo");
    fireEvent.click(within(hoja()).getByRole("button", { name: "Agregar al pedido" }));
    fireEvent.click(screen.getByRole("button", { name: "Agregar Agua al pedido" }));
    fireEvent.click(await screen.findByRole("button", { name: /Ver tu pedido: 2 productos, Bs 30/ }));
    await screen.findByRole("dialog", { name: "Tu pedido" });
    fireEvent.click(screen.getByRole("radio", { name: "Paso a recoger" }));
    fireEvent.change(screen.getByLabelText("Tu nombre"), { target: { value: "Prueba QA" } });
    fireEvent.change(screen.getByLabelText("Tu WhatsApp"), { target: { value: "71234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    expect(await screen.findByText("Seguimiento del pedido")).toBeInTheDocument();

    const cuerpo = JSON.parse(String(s.posteos()[0].init?.body));
    expect(cuerpo.lineas).toEqual([
      {
        itemId: 84,
        cantidad: 1,
        agregados: [
          { productoId: 203, cantidad: 1, grupoId: 1 },
          { productoId: 201, cantidad: 2, grupoId: 1 },
        ],
      },
      { itemId: 99, cantidad: 1 },
    ]);
  });
});
