import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorMenu, MenuPublicoApi } from "../../types/menuDigital";
import { AJUSTES_TV_DE_FABRICA } from "../../types/tickets";

vi.setConfig({ testTimeout: 60_000 });

/**
 * Las pantallas del local (29-oct): Menú digital, Configuración del recibo,
 * Tickets y pedidos y las TVs públicas, dibujadas con el backend de mentira.
 * Lo que se cuida es que abran y muestren lo que el dueño tiene que ver; el
 * cálculo de páginas y de qué platos van en cada TV está en menuDigital.test.
 */

const request = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api", async (original) => {
  const real = await original<typeof import("../../lib/api")>();
  return { ...real, request };
});
vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, sucursalId: null, permisos: ["menu_digital.editar", "tickets.configurar", "tickets.despachar"] },
    negocio: { id: 7, nombre: "Pollos de prueba", tipoNegocio: "RESTAURANTE", features: ["menu_digital", "tickets_pedido"] },
    rubro: "RESTAURANTE",
    puede: () => true,
    incluye: () => true,
  }),
}));

const plato = (id: number, nombre: string, categoriaId: number, extra: object = {}) => ({
  id,
  nombre,
  precio: 18,
  icono: null,
  categoriaId,
  categoria: categoriaId === 1 ? "Pollos" : "Bebidas",
  foto: null,
  descripcion: null,
  etiqueta: null,
  destacado: false,
  enMenu: true,
  agotadoHoy: false,
  agotado: false,
  ...extra,
});

const EDITOR: EditorMenu = {
  pantallas: [
    {
      numero: 1,
      nombre: "TV 1 · Pollos",
      diseno: "fotos",
      tema: "brasa",
      colores: { fondo: "#1A1210", acento: "#FF9F1C", texto: "#FFF4E6" },
      titulo: "Pollos a la brasa y broaster",
      subtitulo: "Todos con papas y ensalada",
      cinta: "Pedidos y delivery 700 00000",
      categorias: [1],
      ocultos: [],
      columnas: 4,
      tamano: "m",
      rotarSeg: 12,
      logo: true,
      fotos: true,
      descripciones: true,
      etiquetas: true,
      agotadosTachados: true,
    },
  ],
  platos: [
    plato(1, "Brasa cuarto", 1, { etiqueta: "MAS_VENDIDO", descripcion: "Cuarto de pollo, papas y ensalada" }),
    plato(2, "Brasa medio", 1, { agotado: true, agotadoHoy: true }),
    plato(3, "Coca Cola 2L", 2),
  ],
  categorias: [
    { id: 1, nombre: "Pollos" },
    { id: 2, nombre: "Bebidas" },
  ],
  logo: null,
};

function responder(ruta: string) {
  if (ruta === "/menu-digital") return Promise.resolve(structuredClone(EDITOR));
  if (ruta === "/pantallas/llave") return Promise.resolve({ llave: "llave-de-prueba-123456789" });
  if (ruta === "/pantallas/recibo")
    return Promise.resolve({
      recibo: {
        ancho: 80,
        logo: true,
        tamanoLogo: "s",
        nombre: true,
        lema: "Brasa y broasted",
        direccion: "Av. Principal #123",
        telefono: "700 00000",
        nit: "",
        cajero: true,
        totalEnLetras: true,
        pagoYCambio: true,
        minutosEstimados: 20,
        qr: { mostrar: false, titulo: "", texto: "", enlace: "" },
        mensaje: "¡Gracias por su compra!",
        mensaje2: "Conserve este recibo",
        alCobrar: { recibo: false, comanda: false, juntos: true },
      },
      logo: null,
    });
  if (ruta === "/tickets/ajustes") return Promise.resolve(structuredClone(AJUSTES_TV_DE_FABRICA));
  if (ruta.startsWith("/tickets"))
    return Promise.resolve({
      ahora: Date.now(),
      sucursalId: 1,
      siguiente: 73,
      tickets: [
        {
          id: 1,
          numero: 72,
          estado: "PREPARANDO",
          creadoEn: new Date().toISOString(),
          listoEn: null,
          llamadoEn: null,
          llamados: 0,
          entregadoEn: null,
          comprobante: "V-000029",
          items: [{ producto: "Brasa cuarto", cantidad: 2, nota: "sin ensalada", consumo: "LLEVAR" }],
        },
      ],
    });
  return Promise.reject(new Error(`ruta no simulada: ${ruta}`));
}

beforeEach(() => {
  request.mockReset();
  request.mockImplementation((ruta: string) => responder(ruta));
});

describe("Menú digital", () => {
  it("muestra las TVs con su vista previa y el editor de la elegida", async () => {
    const { default: MenuDigital } = await import("./MenuDigital");
    render(
      <MemoryRouter>
        <MenuDigital />
      </MemoryRouter>,
    );
    expect(await screen.findAllByText("TV 1 · Pollos")).not.toHaveLength(0);
    // La vista previa dibuja la TV: título, plato con su etiqueta y el agotado.
    expect(screen.getAllByText("Pollos a la brasa y broaster").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Más vendido").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Agotado").length).toBeGreaterThan(0);
    // De la categoría Bebidas no sale nada en esta TV.
    expect(screen.queryByText("Coca Cola 2L")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agregar pantalla/ })).toBeInTheDocument();
  });

  it("cambiar el título se guarda solo, con la lista entera de TVs", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { default: MenuDigital } = await import("./MenuDigital");
    render(
      <MemoryRouter>
        <MenuDigital />
      </MemoryRouter>,
    );
    const titulo = await screen.findByDisplayValue("Pollos a la brasa y broaster");
    fireEvent.change(titulo, { target: { value: "Pollos" } });
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("/menu-digital/pantallas", expect.objectContaining({ method: "PUT" })),
    );
    const cuerpo = JSON.parse(
      (request.mock.calls.find((c) => c[0] === "/menu-digital/pantallas")![1] as { body: string }).body,
    ) as { pantallas: { titulo: string }[] };
    expect(cuerpo.pantallas[0].titulo).toBe("Pollos");
    vi.useRealTimers();
  });

  it("Platos y fotos: el precio con candado y el agotado de hoy se desmarca", async () => {
    const { default: MenuDigital } = await import("./MenuDigital");
    render(
      <MemoryRouter>
        <MenuDigital />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: /Platos y fotos/ }));
    const fila = screen.getByText("Brasa medio").closest("li")!;
    request.mockImplementationOnce(() => Promise.resolve(plato(2, "Brasa medio", 1)));
    fireEvent.click(within(fila).getByRole("button", { name: "Agotado hoy" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/menu-digital/platos/2",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ agotado: false }) }),
      ),
    );
    expect(await within(fila).findByRole("button", { name: "Marcar agotado" })).toBeInTheDocument();
  });

  it("un cambio y enseguida «Platos y fotos»: se guarda igual, no se pierde", async () => {
    // 31-oct: cambiar de pestaña antes de los 700 ms cancelaba el guardado;
    // el cambio quedaba a la vista pero la TV nunca lo recibía.
    const { default: MenuDigital } = await import("./MenuDigital");
    render(
      <MemoryRouter>
        <MenuDigital />
      </MemoryRouter>,
    );
    const titulo = await screen.findByDisplayValue("Pollos a la brasa y broaster");
    fireEvent.change(titulo, { target: { value: "Pollos y más" } });
    fireEvent.click(screen.getByRole("tab", { name: /Platos y fotos/ }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("/menu-digital/pantallas", expect.objectContaining({ method: "PUT" })),
    );
    const cuerpo = JSON.parse(
      (request.mock.calls.find((c) => c[0] === "/menu-digital/pantallas")![1] as { body: string }).body,
    ) as { pantallas: { titulo: string }[] };
    expect(cuerpo.pantallas[0].titulo).toBe("Pollos y más");
  });

  it("si la llave no llegó al abrir, «Copiar enlace» usa la que hay y no corta las TVs", async () => {
    // 31-oct: con la llave sin cargar (el wifi parpadeó), copiar el enlace
    // generaba una nueva y la TV de tickets y las del menú dejaban de andar.
    let pedidosLlave = 0;
    request.mockImplementation((ruta: string, opciones?: { method?: string }) => {
      if (ruta === "/pantallas/llave" && opciones?.method === "POST") return Promise.resolve({ llave: "llave-nueva-que-corta-todo" });
      if (ruta === "/pantallas/llave") {
        pedidosLlave += 1;
        // La primera vez (al abrir) falla; la segunda contesta la vigente.
        return pedidosLlave === 1 ? Promise.reject(new Error("sin red")) : Promise.resolve({ llave: "llave-de-prueba-123456789" });
      }
      return responder(ruta);
    });
    const portapapeles = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText: portapapeles }, configurable: true });
    const { default: MenuDigital } = await import("./MenuDigital");
    render(
      <MemoryRouter>
        <MenuDigital />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Copiar enlace/ }));
    await waitFor(() => expect(portapapeles).toHaveBeenCalled());
    expect(portapapeles).toHaveBeenCalledWith(expect.stringContaining("/tv/menu/llave-de-prueba-123456789/1"));
    expect(request).not.toHaveBeenCalledWith("/pantallas/llave", expect.objectContaining({ method: "POST" }));
  });
});

describe("Configuración del recibo", () => {
  it("la vista previa usa los datos cargados: lema, dirección, total en letras y tiempo estimado", async () => {
    const { default: ConfigRecibo } = await import("./ConfigRecibo");
    render(
      <MemoryRouter>
        <ConfigRecibo />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Brasa y broasted")).toBeInTheDocument();
    expect(screen.getByText(/Av\. Principal #123 · Tel\. 700 00000/)).toBeInTheDocument();
    expect(screen.getByText("Son: ciento veintitrés 00/100 bolivianos")).toBeInTheDocument();
    expect(screen.getByText("20–25 min")).toBeInTheDocument();
    // La comanda, en la otra pestaña de la vista previa.
    fireEvent.click(screen.getByRole("radio", { name: "Comanda de cocina" }));
    expect(screen.getByText("COMANDA · COCINA")).toBeInTheDocument();
  });
});

describe("Tickets y pedidos", () => {
  it("el tablero, el número que sigue y la vista previa de la TV", async () => {
    const { default: TicketsPedidos } = await import("../tickets/TicketsPedidos");
    render(
      <MemoryRouter>
        <TicketsPedidos />
      </MemoryRouter>,
    );
    expect((await screen.findAllByText("0072")).length).toBeGreaterThan(0);
    expect(screen.getByText("0073")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Listo · llamar/ })).toBeInTheDocument();
    expect(screen.getAllByText("Listos para entregar").length).toBeGreaterThan(0);
  });
});

describe("TV del menú, sin sesión", () => {
  it("muestra el título, los platos con su precio y pasa de página", async () => {
    const muchos: MenuPublicoApi = {
      negocio: "Pollos de prueba",
      moneda: "BOB",
      ahora: Date.now(),
      logo: null,
      pantalla: { ...EDITOR.pantallas[0], categorias: [], rotarSeg: 8 },
      categorias: EDITOR.categorias,
      platos: Array.from({ length: 10 }, (_, i) => ({
        ...plato(i + 1, `Plato ${i + 1}`, 1),
        precio: 18 + i,
      })),
    };
    const fetchFalso = vi.fn(() => Promise.resolve(new Response(JSON.stringify(muchos), { status: 200 })));
    vi.stubGlobal("fetch", fetchFalso);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { default: RutasMenu } = await import("../../publico/tv/TvMenu");
    render(
      <MemoryRouter initialEntries={["/llave-de-prueba-123456789/1"]}>
        <Routes>
          <Route path="/*" element={<RutasMenu />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Pollos a la brasa y broaster")).toBeInTheDocument();
    expect(screen.getByText("Plato 1")).toBeInTheDocument();
    // 4 columnas × 2 filas: el noveno va en la página siguiente.
    expect(screen.queryByText("Plato 9")).not.toBeInTheDocument();
    // Primero que la TV arme su reloj de páginas (el efecto corre después de
    // dibujar); recién después pasan los 8 segundos.
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(8_100);
    });
    expect(await screen.findByText("Plato 9")).toBeInTheDocument();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});

describe("TV de tickets, sin sesión", () => {
  it("lo que ya estaba llamado no suena; un llamado nuevo pasa a «¡Llamando!» con su número", async () => {
    const ahora = Date.now();
    let respuesta = {
      negocio: "Pollos de prueba",
      ahora,
      ajustes: AJUSTES_TV_DE_FABRICA,
      logo: null,
      preparando: [
        { numero: 69, desde: ahora - 5 * 60_000 },
        { numero: 70, desde: ahora - 2 * 60_000 },
      ],
      listos: [{ numero: 68, llamadoEn: ahora - 60_000, llamados: 1 }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(respuesta), { status: 200 }))),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { default: TvTickets } = await import("../../publico/tv/TvTickets");
    render(
      <MemoryRouter initialEntries={["/llave-de-prueba-123456789"]}>
        <Routes>
          <Route path="/:llave" element={<TvTickets />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("0068")).toBeInTheDocument();
    expect(screen.getByText("Listos para entregar")).toBeInTheDocument();
    expect(screen.getByText("0069")).toBeInTheDocument();
    expect(screen.getByText("5 min")).toBeInTheDocument();
    // Sin un toque, el navegador no deja sonar: la TV lo pide.
    expect(screen.getByText(/Tocá la pantalla una vez/)).toBeInTheDocument();

    const t = Date.now();
    respuesta = {
      ...respuesta,
      ahora: t,
      preparando: [{ numero: 70, desde: ahora - 2 * 60_000 }],
      listos: [
        { numero: 69, llamadoEn: t, llamados: 1 },
        { numero: 68, llamadoEn: ahora - 60_000, llamados: 1 },
      ],
    };
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(2_600);
    });
    expect(await screen.findByText("¡Llamando!")).toBeInTheDocument();
    expect(screen.getAllByText("0069").length).toBeGreaterThan(0);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
