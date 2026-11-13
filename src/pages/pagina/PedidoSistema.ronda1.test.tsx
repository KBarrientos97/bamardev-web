import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InfoPedidos, SucursalPedido } from "../../lib/pedidosWeb/tipos";
import type { PaginaPublica as Pagina } from "../../lib/pagina/tipos";
import type { OpcionesTurnstile } from "../../lib/turnstile";
import PaginaPublica from "./PaginaPublica";
import { ESPERA_CAPTCHA_MS } from "./PanelSistema";

/**
 * Ronda 1 de QA de «Pedidos web» (13-nov), lado del cliente que arma el pedido:
 * el captcha que pide un clic o falla (N1), el campo con error al que sube la
 * hoja (N4, N5), lo agotado en el local elegido (N3), el campo trampa (A5) y los
 * textos de recoger. El mapa y Cloudflare se simulan.
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

describe("N1: el captcha en la hoja del pedido", () => {
  async function conCaptcha() {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
    const ts = turnstileDeJuguete();
    const s = servidor();
    await montar();
    await abrirPedido();
    await screen.findByRole("button", { name: "Marcar mi casa" });
    await waitFor(() => expect(ts.render).toHaveBeenCalled());
    return { ts, s };
  }

  it("cuando Cloudflare pide tildar el recuadro, sube hasta él y lo dice", async () => {
    const { ts } = await conCaptcha();
    await llenarDelivery();
    (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear();
    act(() => ts.ultimo()["before-interactive-callback"]?.());
    expect(await screen.findByText(/Tildá el recuadro para seguir/)).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    // Y al pie, donde mira, un aviso que lo lleva al recuadro.
    expect(screen.getByRole("button", { name: "Falta tildar el recuadro de verificación" })).toBeInTheDocument();
    // Al tocar «Hacer pedido» sin tildar, el mensaje ya no es «esperá un segundo».
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    expect(screen.getAllByText(/Tildá el recuadro de verificación/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Esperá un segundo/)).not.toBeInTheDocument();
  });

  it("si la verificación falla, lo dice y ofrece reintentar (monta otro widget)", async () => {
    const { ts } = await conCaptcha();
    const antes = ts.render.mock.calls.length;
    act(() => ts.ultimo()["error-callback"]?.());
    expect(await screen.findByText("No pudimos verificar que no sos un robot.")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /eintentar/ })[0]);
    await waitFor(() => expect(ts.render.mock.calls.length).toBe(antes + 1));
    expect(screen.queryByText("No pudimos verificar que no sos un robot.")).not.toBeInTheDocument();
  });

  it("si Cloudflare no contesta nunca, el «Esperá un segundo» no es eterno: a los segundos ofrece reintentar", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
    // El reloj de mentira sigue corriendo solo, para que las esperas de la pantalla no se cuelguen.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    turnstileDeJuguete();
    servidor();
    await montar();
    await abrirPedido();
    await llenarDelivery();
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    expect(screen.getAllByText(/Esperá un segundo/).length).toBeGreaterThan(0);
    await act(async () => {
      vi.advanceTimersByTime(ESPERA_CAPTCHA_MS + 100);
    });
    expect(screen.getAllByRole("button", { name: /eintentar/ }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Esperá un segundo/)).not.toBeInTheDocument();
  });

  it("con el token en mano no queda nada de esto", async () => {
    const { ts } = await conCaptcha();
    act(() => ts.ultimo().callback?.("tok"));
    expect(screen.queryByText(/Tildá el recuadro/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eintentar/ })).not.toBeInTheDocument();
  });
});

describe("N4, N5: el campo con error", () => {
  async function listo() {
    servidor();
    await montar();
    await abrirPedido();
    await screen.findByRole("button", { name: "Marcar mi casa" });
  }

  it("un nombre de una letra dice «nombre completo (mínimo 2 letras)», no «Escribí tu nombre»", async () => {
    await listo();
    escribir("Tu nombre", "A");
    escribir("Tu WhatsApp", "71234567");
    escribir("Dirección", "Calle Los Tajibos 23");
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    expect(await screen.findByText("Escribí tu nombre completo (mínimo 2 letras).", { selector: "p" })).toBeInTheDocument();
  });

  it("al tocar «Hacer pedido» con un dato mal, sube al campo, lo enfoca y lo marca inválido", async () => {
    await listo();
    escribir("Tu nombre", "Lucía");
    escribir("Tu WhatsApp", "31234567");
    expect(screen.getByLabelText("Tu WhatsApp")).not.toHaveAttribute("aria-invalid");
    (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    const tel = screen.getByLabelText("Tu WhatsApp");
    expect(tel).toHaveAttribute("aria-invalid", "true");
    expect(tel).toHaveFocus();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByLabelText("Tu nombre")).not.toHaveAttribute("aria-invalid");
  });

  it("sin pin, sube al mapa", async () => {
    await listo();
    escribir("Tu nombre", "Lucía");
    escribir("Tu WhatsApp", "71234567");
    escribir("Dirección", "Calle Los Tajibos 23");
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    expect(await screen.findByText("Marcá en el mapa dónde te lo llevamos.", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByLabelText("Dirección")).not.toHaveAttribute("aria-invalid", "true");
    expect(document.activeElement?.textContent).toMatch(/Marcá dónde te lo llevamos|Marcar mi casa/);
  });
});

describe("N2: un local sin caja abierta no «está cerrado»", () => {
  it("en la hoja dice que no está recibiendo pedidos ahora, en delivery y en recoger", async () => {
    const info: InfoPedidos = { ...INFO, sucursales: [BRISAS, suc(4, "Centro", -17.78, { abierta: false })] };
    servidor({ info });
    await montar();
    await abrirPedido();
    fireEvent.click(await screen.findByRole("button", { name: "Marcar mi casa" }));
    expect(screen.getByText("No está recibiendo pedidos ahora")).toBeInTheDocument();
    expect(screen.queryByText(/Cerrado ahora/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Paso a recoger" }));
    expect(screen.getByText("No está recibiendo pedidos ahora")).toBeInTheDocument();
  });

  it("en recoger muestra la dirección del local para saber cuál es", async () => {
    const info: InfoPedidos = { ...INFO, sucursales: [suc(3, "Las Brisas", -17.75, { direccion: "Av. Las Brisas 123" }), suc(4, "Centro", -17.78, { direccion: "Calle Comercio 45" })] };
    servidor({ info });
    await montar();
    await abrirPedido();
    await screen.findByRole("button", { name: "Marcar mi casa" });
    fireEvent.click(screen.getByRole("radio", { name: "Paso a recoger" }));
    expect(screen.getByText("Av. Las Brisas 123")).toBeInTheDocument();
    expect(screen.getByText("Calle Comercio 45")).toBeInTheDocument();
  });

  it("recoger dice «al retirar», no «al recibir»", async () => {
    servidor();
    await montar();
    await abrirPedido();
    await screen.findByRole("button", { name: "Marcar mi casa" });
    expect(screen.getByText("¿Cómo pagás? Al recibir")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Paso a recoger" }));
    expect(screen.getByText("¿Cómo pagás? Al retirar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "QR" }));
    expect(screen.getByText(/cuando lo retires/)).toBeInTheDocument();
    expect(screen.queryByText(/cuando recibas/)).not.toBeInTheDocument();
  });
});

describe("N3: lo agotado en el local elegido", () => {
  const conAgotado: InfoPedidos = { ...INFO, sucursales: [suc(3, "Las Brisas", -17.75, { agotados: [41] })] };

  async function conLineaAgotada(respuestaCrear?: { status: number; cuerpo: unknown }, info = conAgotado) {
    // El carrito ya armado (vive en sessionStorage): el ítem se agotó después de sumarlo.
    sessionStorage.setItem("pedido:elganadero", JSON.stringify([{ id: 41, titulo: "Arroz con leche grande", precio: 50, desde: false, cantidad: 1 }]));
    const s = servidor({ info, respuestaCrear });
    await montar();
    fireEvent.click(await screen.findByRole("button", { name: /Ver tu pedido/ }));
    await screen.findByRole("dialog", { name: "Tu pedido" });
    await llenarDelivery();
    return s;
  }

  it("marca la línea en el carrito y no deja mandar, diciendo cuál es", async () => {
    const s = await conLineaAgotada();
    const hoja = screen.getByRole("dialog", { name: "Tu pedido" });
    expect(within(hoja).getByText("Agotado en Las Brisas: sacalo del pedido")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    expect(await screen.findByText(/«Arroz con leche grande» está agotado en Las Brisas/, { selector: "p[role=alert]" })).toBeInTheDocument();
    expect(s.posteos()).toHaveLength(0);
  });

  it("sacar la línea agotada deja mandar el resto", async () => {
    await conLineaAgotada();
    fireEvent.click(screen.getByRole("button", { name: /^Quitar uno de Arroz con leche grande/ }));
    await waitFor(() => expect(screen.queryByText(/Agotado en Las Brisas/)).not.toBeInTheDocument());
  });

  it("si el backend dice ITEM_AGOTADO (se acabó recién), muestra el mensaje y marca esa línea", async () => {
    const respuesta = {
      status: 400,
      cuerpo: { statusCode: 400, codigo: "ITEM_AGOTADO", itemIds: [41], message: "«Arroz con leche grande» está agotado en Las Brisas. Sacalo del pedido o elegí otra sucursal." },
    };
    const s = await conLineaAgotada(respuesta, INFO);
    const hoja = screen.getByRole("dialog", { name: "Tu pedido" });
    expect(within(hoja).queryByText(/Agotado en Las Brisas/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    expect(await within(hoja).findByText("Agotado en Las Brisas: sacalo del pedido")).toBeInTheDocument();
    expect(screen.getAllByText(/está agotado en Las Brisas/).length).toBeGreaterThan(0);
    expect(s.posteos()).toHaveLength(1);
  });

  it("la carta de la página marca «Agotado en este local» y no deja sumarlo", async () => {
    servidor({ info: conAgotado });
    await montar();
    fireEvent.click(await screen.findByRole("button", { name: /^Arroz con leche grande, Bs 50/ }));
    expect(await screen.findByText("Agotado en este local")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar al pedido" })).not.toBeInTheDocument();
  });

  it("lo que no está agotado se suma como siempre", async () => {
    servidor({ info: { ...INFO, sucursales: [suc(3, "Las Brisas", -17.75, { agotados: [42] })] } });
    await montar();
    fireEvent.click(await screen.findByRole("button", { name: /^Arroz con leche grande, Bs 50/ }));
    expect(await screen.findByRole("button", { name: "Agregar al pedido" })).toBeInTheDocument();
    expect(screen.queryByText("Agotado en este local")).not.toBeInTheDocument();
  });
});

describe("A5: el campo trampa", () => {
  async function listoParaMandar() {
    const s = servidor();
    await montar();
    await abrirPedido();
    fireEvent.click(await screen.findByRole("button", { name: "Marcar mi casa" }));
    escribir("Tu nombre", "Lucía");
    escribir("Tu WhatsApp", "71234567");
    escribir("Dirección", "Calle Los Tajibos 23");
    return s;
  }

  it("una persona manda el campo vacío (no viaja)", async () => {
    const s = await listoParaMandar();
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    await screen.findByText("Seguimiento del pedido");
    expect(JSON.parse(String(s.posteos()[0].init?.body))).not.toHaveProperty("sitioWeb");
  });

  it("el campo existe, escondido de personas y del lector de pantalla, y fuera del Tab", async () => {
    await listoParaMandar();
    const trampa = document.querySelector<HTMLInputElement>('input[name="sitioWeb"]')!;
    expect(trampa).not.toBeNull();
    expect(trampa.tabIndex).toBe(-1);
    expect(trampa.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("un bot que lo llena lo manda tal cual", async () => {
    const s = await listoParaMandar();
    fireEvent.change(document.querySelector<HTMLInputElement>('input[name="sitioWeb"]')!, { target: { value: "http://spam" } });
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    await screen.findByText("Seguimiento del pedido");
    expect(JSON.parse(String(s.posteos()[0].init?.body)).sitioWeb).toBe("http://spam");
  });
});

describe("N7: el pie fijo ocupa poco", () => {
  it("productos y envío van en un renglón y la nota del pie ya no ocupa lugar fijo", async () => {
    servidor();
    await montar();
    await abrirPedido();
    const pie = document.querySelector(".pie-pedido")!;
    expect(pie.querySelectorAll("dl > div")).toHaveLength(3);
    // La frase «El local acepta tu pedido…» vive en el cuerpo que se desplaza, no en el pie.
    expect(within(pie as HTMLElement).queryByText(/El local acepta tu pedido/)).not.toBeInTheDocument();
    expect(screen.getByText(/El local acepta tu pedido y lo seguís desde tu celular/)).toBeInTheDocument();
  });
});
