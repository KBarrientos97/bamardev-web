import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InfoPedidos, SucursalPedido } from "../../lib/pedidosWeb/tipos";
import type { PaginaPublica as Pagina } from "../../lib/pagina/tipos";
import PaginaPublica from "./PaginaPublica";

/**
 * El carrito de la página con pedidos EN EL SISTEMA (13-nov): cuándo reemplaza
 * al WhatsApp, qué exige antes de mandar, el cuerpo que manda y los casos
 * malos (cerrado, sin pedidos, error del backend). El mapa se simula: MapLibre
 * no corre en jsdom.
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
    items: [{ id: 41, titulo: "Arroz con leche grande", descripcion: null, precio: 50, precioDesde: false, fotoUrl: null, icono: null, categoria: null }],
  },
  pie: { atribucionUrl: "https://bamardev.com/?utm_campaign=elganadero" },
  og: { titulo: "El Ganadero", descripcion: "Arroz", imagen: null, url: "https://app-qa.bamardev.com/p/elganadero" },
};

const TARIFA = { tramos: [{ hastaKm: 2, base: 7 }, { hastaKm: 5, porKm: 2 }, { hastaKm: 10, porKm: 1.5 }, { hastaKm: null, porKm: 1 }], maxKm: 12 };
const suc = (id: number, nombre: string, lat: number, abierta = true): SucursalPedido => ({
  id,
  nombre,
  latitud: lat,
  longitud: -63.18,
  abierta,
  tarifa: TARIFA,
});
// El pin del test está en -17.77: «Centro» (-17.78) queda a ~1,4 km y «Las Brisas» (-17.75) a ~2,9.
const BRISAS = suc(3, "Las Brisas", -17.75);
const CENTRO = suc(4, "Centro", -17.78);
const INFO: InfoPedidos = { recibe: true, motivo: null, tipos: ["DELIVERY", "RECOGER"], sucursales: [BRISAS] };

interface Servidor {
  info: InfoPedidos;
  respuestaCrear: { status: number; cuerpo: unknown };
}

/** Un backend de juguete: la página, la info de pedidos y el POST. */
function servidor(s: Partial<Servidor> & { pagina?: Pagina } = {}) {
  const estado: Servidor = {
    info: s.info ?? INFO,
    respuestaCrear: s.respuestaCrear ?? { status: 201, cuerpo: { token: "T".repeat(40), numero: 7, estado: "RECIBIDO" } },
  };
  const llamadas: { url: string; init?: RequestInit }[] = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url, init });
    const json = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
    if (url === "/api/publico/pagina/elganadero") return json(200, s.pagina ?? { ...PAGINA, pedidosSistema: true });
    if (url === "/api/publico/pedidos/elganadero" && init?.method === "POST") return json(estado.respuestaCrear.status, estado.respuestaCrear.cuerpo);
    if (url === "/api/publico/pedidos/elganadero") return json(200, estado.info);
    return json(404, { message: "no" });
  });
  vi.stubGlobal("fetch", f);
  return { f, llamadas, posteos: () => llamadas.filter((l) => l.init?.method === "POST") };
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

/** Suma el arroz al carrito y abre el pedido. */
async function abrirPedido() {
  fireEvent.click(screen.getByRole("button", { name: /^Arroz con leche grande, Bs 50/ }));
  fireEvent.click(screen.getByRole("button", { name: "Agregar al pedido" }));
  fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  fireEvent.click(await screen.findByRole("button", { name: /Ver tu pedido/ }));
  await screen.findByRole("dialog", { name: "Tu pedido" });
}

const escribir = (etiqueta: string, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

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

describe("el carrito con pedidos en el sistema", () => {
  it("con pedidosSistema el carrito no abre WhatsApp: pide «Hacer pedido»", async () => {
    servidor();
    await montar();
    await abrirPedido();
    expect(screen.getByRole("button", { name: "Hacer pedido" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Enviar pedido por WhatsApp" })).not.toBeInTheDocument();
  });

  it("si los dos están prendidos, gana WhatsApp", async () => {
    servidor({ pagina: { ...PAGINA, pedidos: true, pedidosSistema: true } });
    await montar();
    await abrirPedido();
    expect(screen.getByRole("link", { name: "Enviar pedido por WhatsApp" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hacer pedido" })).not.toBeInTheDocument();
  });

  it("WhatsApp prendido pero sin ningún número cargado cuenta como apagado: sale el carrito del sistema", async () => {
    // Sin el WhatsApp general ni el de ninguna sucursal: no hay a quién mandarle el pedido.
    servidor({ pagina: { ...PAGINA, destacado: null, pedidos: true, pedidosSistema: true } });
    await montar();
    await abrirPedido();
    expect(screen.getByRole("button", { name: "Hacer pedido" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Enviar pedido por WhatsApp" })).not.toBeInTheDocument();
  });

  it("un negocio sin pedidosSistema no pide la info de pedidos", async () => {
    const s = servidor({ pagina: { ...PAGINA, pedidos: true } });
    await montar();
    expect(s.llamadas.some((l) => l.url.includes("/publico/pedidos/"))).toBe(false);
  });

  it("en delivery exige el pin: sin él no manda nada y dice qué falta", async () => {
    const s = servidor();
    await montar();
    await abrirPedido();
    await screen.findByRole("button", { name: "Marcar mi casa" });
    escribir("Tu nombre", "Lucía");
    escribir("Tu WhatsApp", "71234567");
    escribir("Dirección", "Calle Los Tajibos 23");
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    expect(await screen.findByText("Marcá en el mapa dónde te lo llevamos.", { selector: "p" })).toBeInTheDocument();
    expect(s.posteos()).toHaveLength(0);
  });

  it("manda el cuerpo del contrato y lleva al seguimiento", async () => {
    const s = servidor();
    await montar();
    await abrirPedido();
    fireEvent.click(await screen.findByRole("button", { name: "Marcar mi casa" }));
    escribir("Tu nombre", "Lucía");
    escribir("Tu WhatsApp", "712 34567");
    escribir("Dirección", "Calle Los Tajibos 23");
    escribir("Referencia", "Portón negro");
    escribir("Nota para el negocio", "Sin cebolla");
    fireEvent.click(screen.getByRole("button", { name: "Bs 100" }));
    // El envío estimado ya está a la vista: ~2,9 km por calles de Las Brisas = Bs 9.
    expect(screen.getByText("≈ Bs 9")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    expect(await screen.findByText("Seguimiento del pedido")).toBeInTheDocument();

    const [post] = s.posteos();
    expect(post.url).toBe("/api/publico/pedidos/elganadero");
    const cuerpo = JSON.parse(String(post.init?.body));
    expect(cuerpo.clienteRequestId).toEqual(expect.any(String));
    expect(cuerpo).toMatchObject({
      almacenId: 3,
      tipo: "DELIVERY",
      nombre: "Lucía",
      telefono: "71234567",
      direccion: "Calle Los Tajibos 23",
      referencia: "Portón negro",
      latitud: -17.77,
      longitud: -63.18,
      formaPago: "EFECTIVO",
      pagaCon: 100,
      nota: "Sin cebolla",
      lineas: [{ itemId: 41, cantidad: 1 }],
    });
    // El navegador no manda precios ni captcha sin site key.
    expect(cuerpo).not.toHaveProperty("captcha");
    expect(JSON.stringify(cuerpo)).not.toMatch(/precio|total/);
    // Lo recuerda para la próxima y deja el pedido en curso.
    expect(JSON.parse(localStorage.getItem("pedido-datos:elganadero")!)).toMatchObject({ nombre: "Lucía", telefono: "71234567", direccion: "Calle Los Tajibos 23" });
    expect(JSON.parse(localStorage.getItem("pedido-curso:elganadero")!)).toEqual({ token: "T".repeat(40), numero: 7 });
    expect(sessionStorage.getItem("pedido:elganadero")).toBeNull();
  });

  it("para recoger no pide pin ni dirección", async () => {
    const s = servidor();
    await montar();
    await abrirPedido();
    await screen.findByRole("button", { name: "Marcar mi casa" });
    fireEvent.click(screen.getByRole("radio", { name: "Paso a recoger" }));
    expect(screen.queryByRole("button", { name: "Marcar mi casa" })).not.toBeInTheDocument();
    escribir("Tu nombre", "Lucía");
    escribir("Tu WhatsApp", "61234567");
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    await screen.findByText("Seguimiento del pedido");
    const cuerpo = JSON.parse(String(s.posteos()[0].init?.body));
    expect(cuerpo).toMatchObject({ tipo: "RECOGER", almacenId: 3, formaPago: "EFECTIVO" });
    expect(cuerpo).not.toHaveProperty("latitud");
    expect(cuerpo).not.toHaveProperty("pagaCon");
  });

  it("el WhatsApp tiene que ser de 8 dígitos y empezar con 6 o 7", async () => {
    const s = servidor();
    await montar();
    await abrirPedido();
    await screen.findByRole("button", { name: "Marcar mi casa" });
    fireEvent.click(screen.getByRole("radio", { name: "Paso a recoger" }));
    escribir("Tu nombre", "Lucía");
    escribir("Tu WhatsApp", "31234567");
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    expect(await screen.findByText(/Escribí tu WhatsApp de 8 dígitos/, { selector: "p[role=alert]" })).toBeInTheDocument();
    expect(s.posteos()).toHaveLength(0);
  });

  it("elige la sucursal abierta más cercana al pin y deja cambiarla", async () => {
    const s = servidor({ info: { ...INFO, sucursales: [BRISAS, CENTRO] } });
    await montar();
    await abrirPedido();
    fireEvent.click(await screen.findByRole("button", { name: "Marcar mi casa" }));
    expect(screen.getByRole("radio", { name: /Centro/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /Las Brisas/ }));
    escribir("Tu nombre", "Lucía");
    escribir("Tu WhatsApp", "71234567");
    escribir("Dirección", "Calle Los Tajibos 23");
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    await screen.findByText("Seguimiento del pedido");
    expect(JSON.parse(String(s.posteos()[0].init?.body)).almacenId).toBe(3);
  });

  it("una sucursal cerrada no se puede elegir y la más cercana abierta toma el pedido", async () => {
    servidor({ info: { ...INFO, sucursales: [BRISAS, { ...CENTRO, abierta: false }] } });
    await montar();
    await abrirPedido();
    fireEvent.click(await screen.findByRole("button", { name: "Marcar mi casa" }));
    expect(screen.getByRole("radio", { name: /Centro/ })).toBeDisabled();
    expect(screen.getByText("Cerrado ahora")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Las Brisas/ })).toBeChecked();
  });

  it("fuera de la zona: lo dice y no deja mandar", async () => {
    const lejos = { ...BRISAS, latitud: -17.2 };
    servidor({ info: { ...INFO, sucursales: [lejos] } });
    await montar();
    await abrirPedido();
    fireEvent.click(await screen.findByRole("button", { name: "Marcar mi casa" }));
    expect(await screen.findByText(/queda fuera de la zona de entrega/)).toBeInTheDocument();
  });

  it("si el negocio no recibe pedidos, se dice antes de armar todo y no se manda", async () => {
    const s = servidor({ info: { recibe: false, motivo: "APAGADO", tipos: [], sucursales: [BRISAS] } });
    await montar();
    expect(await screen.findByText("Por ahora no estamos recibiendo pedidos por acá.")).toBeInTheDocument();
    await abrirPedido();
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    expect(s.posteos()).toHaveLength(0);
    expect(screen.queryByLabelText("Tu nombre")).not.toBeInTheDocument();
  });

  it("con todas las sucursales cerradas avisa en la franja de la página", async () => {
    servidor({ info: { ...INFO, sucursales: [{ ...BRISAS, abierta: false }] } });
    await montar();
    expect(await screen.findByText(/el local está cerrado/)).toBeInTheDocument();
  });

  it("reintentar el MISMO pedido conserva la clave; si cambió el carrito, sale con otra (PW-10)", async () => {
    const s = servidor({ respuestaCrear: { status: 400, cuerpo: { message: "se cayó" } } });
    await montar();
    await abrirPedido();
    fireEvent.click(await screen.findByRole("button", { name: "Marcar mi casa" }));
    escribir("Tu nombre", "Lucía");
    escribir("Tu WhatsApp", "71234567");
    escribir("Dirección", "Calle Los Tajibos 23");
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    await screen.findByText("se cayó");
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    await waitFor(() => expect(s.posteos()).toHaveLength(2));
    const clave = (i: number) => JSON.parse(String(s.posteos()[i].init?.body)).clienteRequestId;
    // Idéntico: la misma clave, para que un envío que sí entró no se duplique.
    expect(clave(1)).toBe(clave(0));
    // Edita el pedido y reintenta: es otro pedido, con otra clave.
    escribir("Nota para el negocio", "Le agrego una bebida");
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    await waitFor(() => expect(s.posteos()).toHaveLength(3));
    expect(clave(2)).not.toBe(clave(0));
  });

  it("muestra en lenguaje humano lo que contesta el backend y no pierde lo escrito", async () => {
    servidor({ respuestaCrear: { status: 400, cuerpo: { message: "Esa dirección queda fuera de la zona de entrega" } } });
    await montar();
    await abrirPedido();
    fireEvent.click(await screen.findByRole("button", { name: "Marcar mi casa" }));
    escribir("Tu nombre", "Lucía");
    escribir("Tu WhatsApp", "71234567");
    escribir("Dirección", "Calle Los Tajibos 23");
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    expect(await screen.findByText("Esa dirección queda fuera de la zona de entrega")).toBeInTheDocument();
    expect(screen.getByLabelText("Tu nombre")).toHaveValue("Lucía");
    expect(sessionStorage.getItem("pedido:elganadero")).not.toBeNull();
  });

  it.each([
    ["FUERA_DE_ZONA", /queda fuera de la zona de entrega/],
    ["SUCURSAL_CERRADA", /acaba de cerrar/],
    ["NO_DISPONIBLE_ONLINE", /Escribile al local por WhatsApp/],
    ["CAPTCHA", /No pudimos verificar que no sos un robot/],
  ])("el código %s se explica en lenguaje del cliente", async (codigo, texto) => {
    servidor({ respuestaCrear: { status: 409, cuerpo: { statusCode: 409, message: "texto técnico", codigo } } });
    await montar();
    await abrirPedido();
    fireEvent.click(await screen.findByRole("button", { name: "Marcar mi casa" }));
    escribir("Tu nombre", "Lucía");
    escribir("Tu WhatsApp", "71234567");
    escribir("Dirección", "Calle Los Tajibos 23");
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    expect(await screen.findByText(texto)).toBeInTheDocument();
    expect(screen.queryByText("texto técnico")).not.toBeInTheDocument();
  });

  it.each([
    ["Ya tenés 2 pedidos en curso. Esperá a que los atiendan para hacer otro."],
    ["Ahora hay muchos pedidos esperando desde esta conexión: probá en unos minutos o escribile al local."],
  ])("TOPE_PEDIDOS muestra el mensaje del backend, que distingue el teléfono de la conexión (R2-04): %s", async (mensaje) => {
    servidor({ respuestaCrear: { status: 409, cuerpo: { statusCode: 409, message: mensaje, codigo: "TOPE_PEDIDOS" } } });
    await montar();
    await abrirPedido();
    fireEvent.click(await screen.findByRole("button", { name: "Marcar mi casa" }));
    escribir("Tu nombre", "Lucía");
    escribir("Tu WhatsApp", "71234567");
    escribir("Dirección", "Calle Los Tajibos 23");
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    expect(await screen.findByText(mensaje)).toBeInTheDocument();
  });

  it("un GPS poco preciso pide mover el pin antes de mandar", async () => {
    const s = servidor();
    const pedirPosicion = vi.fn((ok: PositionCallback) =>
      ok({ coords: { latitude: -17.77, longitude: -63.18, accuracy: 250 } } as GeolocationPosition),
    );
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: pedirPosicion }, configurable: true });
    await montar();
    await abrirPedido();
    await screen.findByRole("button", { name: "Marcar mi casa" });
    escribir("Tu nombre", "Lucía");
    escribir("Tu WhatsApp", "71234567");
    escribir("Dirección", "Calle Los Tajibos 23");
    fireEvent.click(screen.getByRole("button", { name: /Usar mi ubicación/ }));
    expect(await screen.findByText(/poco precisa \(±250 m\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    // Lo que falta, dicho al lado del botón.
    expect(screen.getAllByText(/movela en el mapa hasta tu puerta/).length).toBeGreaterThan(0);
    expect(s.posteos()).toHaveLength(0);
    // Moverlo en el mapa lo confirma.
    fireEvent.click(screen.getByRole("button", { name: "Pin puesto" }));
    await waitFor(() => expect(screen.queryByText(/poco precisa/)).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    await screen.findByText("Seguimiento del pedido");
    expect(JSON.parse(String(s.posteos()[0].init?.body))).not.toHaveProperty("precisionM");
  });

  it("si el GPS falla y después marca el pin a mano, el error de la ubicación se va", async () => {
    servidor();
    const rechazar = vi.fn((_ok: PositionCallback, mal: PositionErrorCallback) => mal({ code: 1, message: "negado" } as GeolocationPositionError));
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: rechazar }, configurable: true });
    await montar();
    await abrirPedido();
    await screen.findByRole("button", { name: "Marcar mi casa" });
    fireEvent.click(screen.getByRole("button", { name: /Usar mi ubicación/ }));
    expect(await screen.findByText(/No pudimos leer tu ubicación/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Marcar mi casa" }));
    await waitFor(() => expect(screen.queryByText(/No pudimos leer tu ubicación/)).not.toBeInTheDocument());
  });

  it("recuerda el nombre y el WhatsApp para la próxima vez", async () => {
    localStorage.setItem("pedido-datos:elganadero", JSON.stringify({ nombre: "Lucía", telefono: "71234567", direccion: "Calle 5", entrega: "DELIVERY" }));
    servidor();
    await montar();
    await abrirPedido();
    expect(await screen.findByLabelText("Tu nombre")).toHaveValue("Lucía");
    expect(screen.getByLabelText("Tu WhatsApp")).toHaveValue("71234567");
    expect(screen.getByLabelText("Dirección")).toHaveValue("Calle 5");
  });

  it("si el billete elegido deja de alcanzar porque sube el total, vuelve a «Justo» y no queda un monto invisible que bloquea (sesion 2)", async () => {
    const s = servidor();
    await montar();
    await abrirPedido();
    fireEvent.click(await screen.findByRole("button", { name: "Marcar mi casa" }));
    escribir("Tu nombre", "Lucía");
    escribir("Tu WhatsApp", "71234567");
    escribir("Dirección", "Calle Los Tajibos 23");
    // Total 59 (50 + 9 de envío): el atajo de Bs 100 alcanza.
    fireEvent.click(screen.getByRole("button", { name: "Bs 100" }));
    expect(screen.getByRole("button", { name: "Bs 100" })).toHaveAttribute("aria-pressed", "true");
    // Dos más: 150 + 9 = 159. El atajo de 100 ya no se ofrece.
    fireEvent.click(screen.getByRole("button", { name: /^Sumar uno de Arroz con leche grande/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Sumar uno de Arroz con leche grande/ }));
    expect(screen.queryByRole("button", { name: "Bs 100" })).not.toBeInTheDocument();
    // Queda en «Justo» (visible), y el pedido sale sin pagaCon en vez de trabarse con «no alcanza».
    expect(screen.getByRole("button", { name: "Justo" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Hacer pedido" }));
    expect(await screen.findByText("Seguimiento del pedido")).toBeInTheDocument();
    expect(JSON.parse(String(s.posteos()[0].init?.body))).not.toHaveProperty("pagaCon");
  });

  it("con la pantalla baja (celular de costado o teclado abierto) el pie deja de ser fijo: el formulario no queda en una rendija (sesion 2)", async () => {
    servidor();
    await montar();
    await abrirPedido();
    const hoja = document.querySelector(".hoja-pedido");
    expect(hoja).not.toBeNull();
    expect(document.querySelector(".cuerpo-pedido")).not.toBeNull();
    expect(document.querySelector(".pie-pedido")).not.toBeNull();
    // jsdom no evalúa media queries: se comprueba que la regla viaja con la hoja.
    const css = Array.from(document.querySelectorAll("style")).map((e) => e.textContent).join(" ");
    expect(css).toMatch(/@media \(max-height:520px\)\{\.hoja-pedido\{overflow-y:auto!important/);
    expect(css).toMatch(/\.cuerpo-pedido\{overflow:visible!important/);
  });

  it("quitar a mano un producto del pedido no dice «sacamos… porque ese local no lo ofrece» (sesion 2)", async () => {
    const dos = { ...PAGINA, pedidosSistema: true, catalogo: { titulo: "Menú", items: [...PAGINA.catalogo!.items, { id: 42, titulo: "Mocochinchi", descripcion: null, precio: 8, precioDesde: false, fotoUrl: null, icono: null, categoria: null }] } };
    // El pedido ya armado (vive en sessionStorage, como si el cliente lo hubiera sumado).
    sessionStorage.setItem(
      "pedido:elganadero",
      JSON.stringify([
        { id: 41, titulo: "Arroz con leche grande", precio: 50, desde: false, cantidad: 1 },
        { id: 42, titulo: "Mocochinchi", precio: 8, desde: false, cantidad: 1 },
      ]),
    );
    servidor({ pagina: dos });
    await montar();
    fireEvent.click(await screen.findByRole("button", { name: /Ver tu pedido/ }));
    const hoja = await screen.findByRole("dialog", { name: "Tu pedido" });
    fireEvent.click(screen.getByRole("button", { name: /^Quitar uno de Mocochinchi/ }));
    await waitFor(() => expect(within(hoja).queryByText("Mocochinchi")).not.toBeInTheDocument());
    expect(screen.queryByText(/Sacamos/)).not.toBeInTheDocument();
  });
});
