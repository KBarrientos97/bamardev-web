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
// jsdom no tiene canvas: el quitado de fondo se prueba aparte (quitarFondo.test).
const prepararLogo = vi.hoisted(() => vi.fn());
vi.mock("../../lib/pagina/imagen", async (original) => {
  const real = await original<typeof import("../../lib/pagina/imagen")>();
  return { ...real, prepararLogo };
});
vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, sucursalId: null, permisos: ["menu_digital.editar", "tickets.configurar", "tickets.despachar", "recibo.configurar"] },
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

describe("Menú digital: los diseños animados y los atajos (8-nov)", () => {
  /** Lo último que se mandó a guardar, ya con el reloj de 700 ms vencido. */
  async function ultimoGuardado() {
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    await waitFor(() => expect(request).toHaveBeenCalledWith("/menu-digital/pantallas", expect.objectContaining({ method: "PUT" })));
    const llamadas = request.mock.calls.filter((c) => c[0] === "/menu-digital/pantallas");
    return (JSON.parse((llamadas.at(-1)![1] as { body: string }).body) as { pantallas: Record<string, unknown>[] }).pantallas[0];
  }

  async function abrirEditor() {
    const { default: MenuDigital } = await import("./MenuDigital");
    render(
      <MemoryRouter>
        <MenuDigital />
      </MemoryRouter>,
    );
    await screen.findByDisplayValue("Pollos a la brasa y broaster");
  }

  it("los tres de siempre quedan; un animado se guarda con su quieto de respaldo y volver a uno quieto lo apaga", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await abrirEditor();
    for (const nombre of ["Fotos", "Lista", "Destacado", "Presentación", "Carrusel", "Mosaico"]) {
      expect(screen.getByRole("button", { name: nombre })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "Carrusel" }));
    // El quieto de al lado es lo que dibuja una pestaña de la web de antes.
    expect(await ultimoGuardado()).toMatchObject({ animado: "carrusel", diseno: "destacado" });
    expect(screen.getByRole("button", { name: "Carrusel" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Destacado" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Animación")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(await ultimoGuardado()).toMatchObject({ animado: null, diseno: "lista" });
    expect(screen.queryByText("Animación")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("«Sólo bebidas» elige la categoría, no apaga plato por plato", async () => {
    // Kevin: "destiquear todo lo que es bebidas rápido". Por categoría, una
    // gaseosa nueva de Inventario no aparece sola en la TV de los pollos.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await abrirEditor();
    // La TV de la prueba muestra sólo Pollos: el atajo prendido es «Sólo comida».
    expect(screen.getByRole("button", { name: "Sólo comida" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Sólo bebidas" }));
    expect(await ultimoGuardado()).toMatchObject({ categorias: [2], ocultos: [] });

    fireEvent.click(screen.getByRole("button", { name: "Todo" }));
    expect(await ultimoGuardado()).toMatchObject({ categorias: [] });
    vi.useRealTimers();
  });

  it("el interruptor de una categoría apaga y prende todos sus platos en esta TV", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await abrirEditor();
    fireEvent.click(screen.getByRole("switch", { name: "Todos los de Pollos" }));
    expect(await ultimoGuardado()).toMatchObject({ ocultos: [1, 2] });

    fireEvent.click(screen.getByRole("switch", { name: "Todos los de Pollos" }));
    expect(await ultimoGuardado()).toMatchObject({ ocultos: [] });
    vi.useRealTimers();
  });

  it("las flechas cambian el orden de los platos y queda guardado para esa TV", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await abrirEditor();
    fireEvent.click(screen.getByRole("button", { name: "Bajar Brasa cuarto" }));
    expect(await ultimoGuardado()).toMatchObject({ orden: [2, 1] });
    vi.useRealTimers();
  });

  it("los agotados: tachados, no salen o normales, y cada uno se guarda (9-nov)", async () => {
    // La TV de la pollería tenía las gaseosas en gris con "AGOTADO" porque
    // el stock de Inventario decía cero, y el local no lo lleva al día.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await abrirEditor();
    const agotados = screen.getByRole("radiogroup", { name: "Agotados" });
    expect(within(agotados).getByRole("radio", { name: "Tachados" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(within(agotados).getByRole("radio", { name: "Normales" }));
    expect(await ultimoGuardado()).toMatchObject({ agotadosTachados: true, agotadoPorStock: false });
    expect(screen.getByText(/aunque Inventario diga que no hay stock/)).toBeInTheDocument();

    fireEvent.click(within(agotados).getByRole("radio", { name: "No salen" }));
    expect(await ultimoGuardado()).toMatchObject({ agotadosTachados: false, agotadoPorStock: true });
    vi.useRealTimers();
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

  it("la letra de cada papel: sin la del servidor sale Normal, y cambiarla la guarda y la muestra", async () => {
    // El recibo simulado no trae la letra, como el backend de QA o de PROD el
    // día que la web sale antes: sin el de fábrica no quedaba ninguna marcada
    // y el papel se dibujaba con `undefined`.
    const { default: ConfigRecibo } = await import("./ConfigRecibo");
    render(
      <MemoryRouter>
        <ConfigRecibo />
      </MemoryRouter>,
    );
    await screen.findByText("Brasa y broasted");
    const recibo = screen.getByRole("radiogroup", { name: "Letra del recibo" });
    const comanda = screen.getByRole("radiogroup", { name: "Letra de la comanda" });
    expect(within(recibo).getByRole("radio", { name: "Normal" })).toHaveAttribute("aria-checked", "true");
    expect(within(comanda).getByRole("radio", { name: "Normal" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(within(recibo).getByRole("radio", { name: "Chica" }));
    // Tocar la de la comanda pasa la vista previa a la comanda.
    fireEvent.click(within(comanda).getByRole("radio", { name: "Grande" }));
    expect(screen.getByText("COMANDA · COCINA")).toBeInTheDocument();

    await waitFor(
      () => expect(request).toHaveBeenCalledWith("/pantallas/recibo", expect.objectContaining({ method: "PATCH" })),
      { timeout: 3000 },
    );
    const guardado = request.mock.calls.find(
      ([ruta, op]) => ruta === "/pantallas/recibo" && (op as RequestInit | undefined)?.method === "PATCH",
    )!;
    const { recibo: cuerpo } = JSON.parse((guardado[1] as RequestInit).body as string);
    expect(cuerpo.tamanoLetra).toBe("s");
    expect(cuerpo.tamanoLetraComanda).toBe("l");
  });
});

describe("Configuración del recibo: lo que se saca del papel (8-nov)", () => {
  const LINEA = "INF. BamarDev - 67865462";

  it("mesa y para llevar: arranca separado y al elegir M y LL cambia la vista previa y se guarda", async () => {
    const { default: ConfigRecibo } = await import("./ConfigRecibo");
    render(
      <MemoryRouter>
        <ConfigRecibo />
      </MemoryRouter>,
    );
    await screen.findByText("Brasa y broasted");
    const modelo = screen.getByRole("radiogroup", { name: "Mesa y para llevar" });
    expect(within(modelo).getByRole("radio", { name: "Separado" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("EN MESA")).toBeInTheDocument();

    fireEvent.click(within(modelo).getByRole("radio", { name: "M y LL" }));

    expect(screen.queryByText("EN MESA")).not.toBeInTheDocument();
    expect(screen.queryByText("PARA LLEVAR")).not.toBeInTheDocument();
    expect(screen.getAllByText("M")).toHaveLength(2);
    expect(screen.getByText("LL")).toBeInTheDocument();
    await waitFor(
      () => {
        const guardados = request.mock.calls.filter(
          ([ruta, op]) => ruta === "/pantallas/recibo" && (op as RequestInit | undefined)?.method === "PATCH",
        );
        const { recibo } = JSON.parse((guardados[guardados.length - 1][1] as RequestInit).body as string);
        expect(recibo.modeloConsumo).toBe("letras");
      },
      { timeout: 3000 },
    );
  });

  it("subtotal, total y mensaje se apagan en la vista previa y se guardan; la línea de BamarDev no tiene interruptor", async () => {
    const { default: ConfigRecibo } = await import("./ConfigRecibo");
    render(
      <MemoryRouter>
        <ConfigRecibo />
      </MemoryRouter>,
    );
    await screen.findByText("Brasa y broasted");

    // El recibo simulado no trae los interruptores, como el backend viejo:
    // arrancan prendidos. Y trae un mensaje2, que ya no se muestra.
    expect(screen.getByText("Subtotal", { selector: "dt" })).toBeInTheDocument();
    expect(screen.getByText("TOTAL", { selector: "dt" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mensaje")).toHaveValue("¡Gracias por su compra!");
    expect(screen.queryByText("Mensaje secundario")).not.toBeInTheDocument();
    expect(screen.queryByText("Conserve este recibo")).not.toBeInTheDocument();
    expect(screen.getByText(LINEA)).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /BamarDev/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Subtotal" }));
    fireEvent.click(screen.getByRole("switch", { name: "Total" }));
    fireEvent.click(screen.getByRole("switch", { name: "Mensaje principal" }));

    expect(screen.queryByText("Subtotal", { selector: "dt" })).not.toBeInTheDocument();
    expect(screen.queryByText("TOTAL", { selector: "dt" })).not.toBeInTheDocument();
    expect(screen.queryByText("¡Gracias por su compra!")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mensaje")).not.toBeInTheDocument();
    expect(screen.getByText(LINEA)).toBeInTheDocument();

    await waitFor(
      () => {
        const guardados = request.mock.calls.filter(
          ([ruta, op]) => ruta === "/pantallas/recibo" && (op as RequestInit | undefined)?.method === "PATCH",
        );
        const { recibo } = JSON.parse((guardados[guardados.length - 1][1] as RequestInit).body as string);
        expect(recibo).toMatchObject({ subtotal: false, total: false, mostrarMensaje: false });
      },
      { timeout: 3000 },
    );
  });
});

describe("Configuración del recibo: el logo sin fondo (9-nov)", () => {
  it("al subirlo se le saca el fondo, y se puede volver a subir con su fondo sin buscar el archivo", async () => {
    // El logo de la pollería, con fondo negro o blanco, era un cuadrado
    // pegado encima del rojo de la TV. Si la varita se come algo del dibujo,
    // el dueño lo vuelve a subir tal cual con un toque.
    prepararLogo.mockImplementation(async (_f: File, sacarFondo: boolean) => ({
      blob: new Blob(["logo"], { type: "image/webp" }),
      fondoQuitado: sacarFondo,
    }));
    request.mockImplementation((ruta: string, op?: RequestInit) =>
      ruta === "/pantallas/logo" && op?.method === "POST" ? Promise.resolve({ logo: "/pantallas/logo/7/abcdef123" }) : responder(ruta),
    );
    const { default: ConfigRecibo } = await import("./ConfigRecibo");
    const { container } = render(
      <MemoryRouter>
        <ConfigRecibo />
      </MemoryRouter>,
    );
    await screen.findByText("Brasa y broasted");
    fireEvent.click(screen.getByRole("tab", { name: /Logo y datos/ }));

    const archivo = new File(["jpg"], "logo-tio-fabio.jpg", { type: "image/jpeg" });
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [archivo] } });

    expect(await screen.findByText("Le sacamos el fondo para que en las TVs se vea sólo el dibujo.")).toBeInTheDocument();
    expect(prepararLogo).toHaveBeenLastCalledWith(archivo, true);

    fireEvent.click(screen.getByRole("button", { name: "Dejarlo con su fondo" }));
    expect(await screen.findByText("Quedó con su fondo, tal cual el archivo.")).toBeInTheDocument();
    expect(prepararLogo).toHaveBeenLastCalledWith(archivo, false);
    expect(request.mock.calls.filter(([ruta, op]) => ruta === "/pantallas/logo" && (op as RequestInit).method === "POST")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Sacarle el fondo" }));
    expect(await screen.findByText("Le sacamos el fondo para que en las TVs se vea sólo el dibujo.")).toBeInTheDocument();
    expect(prepararLogo).toHaveBeenLastCalledWith(archivo, true);
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
    expect((await screen.findAllByText("072")).length).toBeGreaterThan(0);
    expect(screen.getByText("073")).toBeInTheDocument();
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
    expect(await screen.findByText("068")).toBeInTheDocument();
    expect(screen.getByText("Listos para entregar")).toBeInTheDocument();
    expect(screen.getByText("069")).toBeInTheDocument();
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
    expect(screen.getAllByText("069").length).toBeGreaterThan(0);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
