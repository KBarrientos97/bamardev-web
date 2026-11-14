import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InfoPedidos, SucursalPedido } from "../../lib/pedidosWeb/tipos";
import type { PaginaPublica as Pagina } from "../../lib/pagina/tipos";
import type { OpcionesTurnstile } from "../../lib/turnstile";
import PaginaPublica from "./PaginaPublica";

/**
 * Ronda 2 de QA de «Pedidos web» (14-nov), lado del cliente que arma el pedido:
 * el error de agotado que se va al cambiar de local o sacar la línea (M2), el
 * pedido que sale solo cuando llega el captcha que se esperaba (M8) y el botón
 * «atrás» del celular, que cierra la hoja (M4). El mapa y Cloudflare se simulan.
 */

vi.mock("./ElegirPin", () => ({
  default: ({ valor, onCambio }: { valor: { lat: number; lng: number } | null; onCambio: (u: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => onCambio({ lat: -17.77, lng: -63.18 })}>
      {valor ? "Pin puesto" : "Marcar mi casa"}
    </button>
  ),
}));

const PAGINA: Pagina = {
  subdominio: "elganadero",
  nombre: "El Ganadero",
  rubro: "Restaurante",
  iniciales: "EG",
  descripcion: "Arroz con leche.",
  color: { clave: "NARANJA", hex: "#B4501A" },
  formaBotones: "PILDORA",
  tipografia: "FUERTE",
  logoUrl: null,
  portadaUrl: null,
  anuncio: null,
  reservar: false,
  destacado: { id: 7, tipo: "WHATSAPP", etiqueta: "WhatsApp", url: "https://wa.me/59170123456", icono: null },
  redes: [],
  botones: [],
  sucursales: [{ nombre: "Las Brisas", reservaSlug: null, direccion: "Calle 1", telefono: null, horario: null, mapaUrl: null }],
  catalogo: {
    titulo: "Menú",
    items: [
      { id: 41, titulo: "Arroz con leche grande", descripcion: null, precio: 50, precioDesde: false, fotoUrl: null, icono: null, categoria: null },
      { id: 42, titulo: "Mocochinchi", descripcion: null, precio: 8, precioDesde: false, fotoUrl: null, icono: null, categoria: null },
    ],
  },
  pie: { atribucionUrl: "https://bamardev.com/?utm_campaign=elganadero" },
  og: { titulo: "El Ganadero", descripcion: "Arroz", imagen: null, url: "https://app-qa.bamardev.com/p/elganadero" },
};

const TARIFA = { tramos: [{ hastaKm: 2, base: 7 }, { hastaKm: 5, porKm: 2 }, { hastaKm: 10, porKm: 1.5 }, { hastaKm: null, porKm: 1 }], maxKm: 12 };
const suc = (id: number, nombre: string, lat: number, extra: Partial<SucursalPedido> = {}): SucursalPedido => ({
  id,
  nombre,
  latitud: lat,
  longitud: -63.18,
  abierta: true,
  tarifa: TARIFA,
  ...extra,
});
const BRISAS = suc(3, "Las Brisas", -17.75);
const INFO: InfoPedidos = { recibe: true, motivo: null, tipos: ["DELIVERY", "RECOGER"], sucursales: [BRISAS] };

function servidor(s: { info?: InfoPedidos; respuestaCrear?: { status: number; cuerpo: unknown } } = {}) {
  const info = s.info ?? INFO;
  const crear = s.respuestaCrear ?? { status: 201, cuerpo: { token: "T".repeat(40), numero: 7, estado: "RECIBIDO" } };
  const llamadas: { url: string; init?: RequestInit }[] = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url, init });
    const json = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
    if (url === "/api/publico/pagina/elganadero") return json(200, { ...PAGINA, pedidosSistema: true });
    if (url === "/api/publico/pedidos/elganadero" && init?.method === "POST") return json(crear.status, crear.cuerpo);
    if (url === "/api/publico/pedidos/elganadero") return json(200, info);
    return json(404, { message: "no" });
  });
  vi.stubGlobal("fetch", f);
  return { llamadas, posteos: () => llamadas.filter((l) => l.init?.method === "POST") };
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

async function abrirPedido() {
  fireEvent.click(screen.getByRole("button", { name: /^Arroz con leche grande, Bs 50/ }));
  fireEvent.click(screen.getByRole("button", { name: "Agregar al pedido" }));
  fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  fireEvent.click(await screen.findByRole("button", { name: /Ver tu pedido/ }));
  await screen.findByRole("dialog", { name: "Tu pedido" });
}

const escribir = (etiqueta: string, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

/** Cloudflare de juguete: guarda las opciones de cada widget para poder dispararle los avisos. */
function turnstileDeJuguete() {
  const widgets: OpcionesTurnstile[] = [];
  const render = vi.fn((_c: HTMLElement, o: OpcionesTurnstile) => {
    widgets.push(o);
    return `w${widgets.length}`;
  });
  window.turnstile = { render, reset: vi.fn(), remove: vi.fn() };
  return { widgets, render, ultimo: () => widgets[widgets.length - 1] };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
  Object.defineProperty(navigator, "sendBeacon", { value: vi.fn(() => true), configurable: true });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete window.turnstile;
});

/** Un pedido de delivery con todos los datos puestos: lo único que puede faltar es lo que cada prueba quiera romper. */
async function llenarDelivery() {
  fireEvent.click(await screen.findByRole("button", { name: "Marcar mi casa" }));
  escribir("Tu nombre", "Lucía");
  escribir("Tu WhatsApp", "71234567");
  escribir("Dirección", "Calle Los Tajibos 23");
}


const CENTRO = suc(4, "Centro", -17.78);
const AGOTADO = {
  status: 400,
  cuerpo: { statusCode: 400, codigo: "ITEM_AGOTADO", itemIds: [41], message: "«Arroz con leche grande» está agotado en Las Brisas. Sacalo del pedido o elegí otra sucursal." },
};
const CARRITO = [
  { id: 41, titulo: "Arroz con leche grande", precio: 50, desde: false, cantidad: 1 },
  { id: 42, titulo: "Mocochinchi", precio: 8, desde: false, cantidad: 1 },
];

describe("M2: el aviso de agotado del pie no se queda pegado", () => {
  async function conError() {
    sessionStorage.setItem("pedido:elganadero", JSON.stringify(CARRITO));
    const s = servidor({ info: { ...INFO, sucursales: [BRISAS, CENTRO] }, respuestaCrear: AGOTADO });
    await montar();
    fireEvent.click(await screen.findByRole("button", { name: /Ver tu pedido/ }));
    await screen.findByRole("dialog", { name: "Tu pedido" });
    await screen.findByRole("button", { name: "Marcar mi casa" });
    fireEvent.click(screen.getByRole("radio", { name: "Paso a recoger" }));
    escribir("Tu nombre", "Lucía");
    escribir("Tu WhatsApp", "71234567");
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    expect(await screen.findByText(/elegí otra sucursal\./, { selector: "p[role=alert]" })).toBeInTheDocument();
    return s;
  }

  it("al elegir otro local, el mensaje rojo se va", async () => {
    await conError();
    fireEvent.click(screen.getByRole("radio", { name: /Centro/ }));
    await waitFor(() => expect(screen.queryByText(/elegí otra sucursal\./)).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("al sacar la línea agotada, también", async () => {
    await conError();
    fireEvent.click(screen.getByRole("button", { name: /^Quitar uno de Arroz con leche grande/ }));
    await waitFor(() => expect(screen.queryByText(/elegí otra sucursal\./)).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("M8: «Hacer pedido» mientras el captcha verifica", () => {
  async function conCaptcha() {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
    const ts = turnstileDeJuguete();
    const s = servidor();
    await montar();
    await abrirPedido();
    await llenarDelivery();
    await waitFor(() => expect(ts.render).toHaveBeenCalled());
    return { ts, s };
  }

  it("el toque se guarda y el pedido sale solo, una vez, cuando llega el token", async () => {
    const { ts, s } = await conCaptcha();
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    // Todavía sin token: nada salió y la pantalla dice que se manda solo.
    expect(s.posteos()).toHaveLength(0);
    expect(screen.getAllByText(/se manda solo apenas termine/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Verificando… se envía solo" })).toBeInTheDocument();
    // Un segundo toque impaciente no duplica nada.
    fireEvent.click(screen.getByRole("button", { name: "Verificando… se envía solo" }));
    expect(s.posteos()).toHaveLength(0);

    await act(async () => ts.ultimo().callback?.("tok-lento"));
    expect(await screen.findByText("Seguimiento del pedido")).toBeInTheDocument();
    expect(s.posteos()).toHaveLength(1);
    expect(JSON.parse(String(s.posteos()[0].init?.body))).toMatchObject({ captcha: "tok-lento", nombre: "Lucía" });
  });

  it("sin haber tocado el botón, el token que llega no manda nada", async () => {
    const { ts, s } = await conCaptcha();
    await act(async () => ts.ultimo().callback?.("tok"));
    expect(s.posteos()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Hacer pedido" })).toBeInTheDocument();
  });

  it("si la verificación falla mientras esperaba, no manda y deja reintentar", async () => {
    const { ts, s } = await conCaptcha();
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    act(() => ts.ultimo()["error-callback"]?.());
    expect(await screen.findByText("No pudimos verificar que no sos un robot.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hacer pedido" })).toBeInTheDocument();
    // Y si después llega un token (reintentó), tampoco sale solo: el cliente ya lo había visto fallar.
    await act(async () => ts.ultimo().callback?.("tok"));
    expect(s.posteos()).toHaveLength(0);
  });

  it("si mientras esperaba se rompió otro dato, no manda: avisa qué falta", async () => {
    const { ts, s } = await conCaptcha();
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    escribir("Tu WhatsApp", "31234567");
    await act(async () => ts.ultimo().callback?.("tok"));
    expect(s.posteos()).toHaveLength(0);
    expect(screen.getByLabelText("Tu WhatsApp")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("M4: el botón «atrás» del celular cierra la hoja", () => {
  const alAtras = () => act(() => void window.dispatchEvent(new PopStateEvent("popstate")));

  it("suma una entrada al historial al abrirse y «atrás» cierra la hoja sin salir de la página", async () => {
    servidor();
    await montar();
    expect(window.history.state?.hojaPedidoAbierta).toBeUndefined();
    await abrirPedido();
    // La entrada nueva lleva la marca de la hoja.
    expect(window.history.state?.hojaPedidoAbierta).toBe(true);
    alAtras();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Tu pedido" })).not.toBeInTheDocument());
    // La página sigue ahí, con su botón para volver a abrir el pedido.
    expect(screen.getByRole("button", { name: /Ver tu pedido/ })).toBeInTheDocument();
  });

  it("cerrar con la X saca la entrada que sumó la hoja (no queda un «atrás» que no hace nada)", async () => {
    servidor();
    await montar();
    await abrirPedido();
    const atrasPropio = vi.spyOn(window.history, "back");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar el pedido" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Tu pedido" })).not.toBeInTheDocument());
    expect(atrasPropio).toHaveBeenCalledTimes(1);
    atrasPropio.mockRestore();
  });

  it("el «atrás» que provoca la X no cierra una hoja que se vuelva a abrir enseguida", async () => {
    servidor();
    await montar();
    await abrirPedido();
    // Sin ejecutar el back real: el popstate se dispara a mano, como llega en el navegador.
    const atrasPropio = vi.spyOn(window.history, "back").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Cerrar el pedido" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Tu pedido" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Ver tu pedido/ }));
    await screen.findByRole("dialog", { name: "Tu pedido" });
    // Llega el popstate que provocó la X: se descarta, la hoja nueva sigue abierta.
    alAtras();
    expect(screen.getByRole("dialog", { name: "Tu pedido" })).toBeInTheDocument();
    // El «atrás» siguiente, ahora sí del cliente, la cierra.
    alAtras();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Tu pedido" })).not.toBeInTheDocument());
    atrasPropio.mockRestore();
  });

  it("al mandar el pedido el seguimiento reemplaza la entrada de la hoja (no se acumulan entradas)", async () => {
    servidor();
    await montar();
    await abrirPedido();
    await llenarDelivery();
    const antes = window.history.length;
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    expect(await screen.findByText("Seguimiento del pedido")).toBeInTheDocument();
    expect(window.history.length).toBe(antes);
  });
});
