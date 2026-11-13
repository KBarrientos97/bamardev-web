import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstadoEditor } from "../../lib/pagina/tipos";

/**
 * Publicar en Mi página mueve «Pedidos web» del menú (CONTRATO-PEDIDOS-WEB §9):
 * el dueño prende «Recibir pedidos en el sistema», publica, y la entrada sale
 * en su menú sin esperar al chequeo de la licencia.
 */

vi.mock("../../lib/pagina/apiPagina", () => ({
  BASE_API: "/api",
  urlDeImagen: (r: string | null) => (r ? `/api${r}` : null),
  apiPagina: {
    estado: vi.fn(),
    guardar: vi.fn(),
    publicacion: vi.fn(),
    publicarCambios: vi.fn(),
    descartarBorrador: vi.fn(),
    sucursal: vi.fn(),
  },
}));

const fijarPedidosWeb = vi.fn();
let features: string[] = ["pos", "pagina_publica", "delivery"];
vi.mock("../../store/AuthContext", async (original) => {
  const real = await original<typeof import("../../store/AuthContext")>();
  return {
    ...real,
    useAuthOpcional: () => ({ negocio: { id: 1, nombre: "Don Pepe", features }, fijarPedidosWeb }),
  };
});

import { apiPagina } from "../../lib/pagina/apiPagina";
import MiPagina from "./MiPagina";

function estado(cambios: Partial<EstadoEditor["pagina"]> = {}): EstadoEditor {
  return {
    subdominio: "donpepe",
    urlPublica: "https://app-qa.bamardev.com/p/donpepe",
    negocio: { nombre: "Don Pepe", rubro: "RESTAURANTE", iniciales: "DP" },
    pagina: {
      publicada: true,
      bloqueada: false,
      motivoBloqueo: null,
      descripcion: null,
      colorClave: "CIRUELA",
      formaBotones: "REDONDEADO",
      tipografia: "MODERNA",
      anuncioTexto: null,
      anuncioHasta: null,
      anuncioUrl: null,
      enlaceDestacadoId: null,
      mostrarReservar: false,
      catalogoTitulo: null,
      actualizadoEn: "2026-11-13T00:00:00Z",
      ...cambios,
    },
    imagenes: { logo: null, portada: null },
    enlaces: [],
    sucursales: [{ id: 10, nombre: "Centro", direccion: "Junín 245", telefono: "33445566", esPrincipal: true, publicarEnPagina: true, horarioTexto: null }],
    reservaOnline: false,
    enlacesCortos: false,
    muestras: [{ clave: "CIRUELA", nombre: "Ciruela", hex: "#9B2C6B" }],
    catalogo: [],
    topeCatalogo: 60,
  };
}

async function montarYPublicar() {
  render(
    <MemoryRouter>
      <MiPagina />
    </MemoryRouter>,
  );
  await act(async () => {});
  fireEvent.change(screen.getByLabelText("Descripción corta"), { target: { value: "Arroz con leche" } });
  fireEvent.click(await screen.findByRole("button", { name: "Publicar cambios" }));
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  features = ["pos", "pagina_publica", "delivery"];
  vi.mocked(apiPagina.estado).mockResolvedValue(estado());
  vi.mocked(apiPagina.guardar).mockResolvedValue(estado());
});

describe("Mi página y la entrada «Pedidos web»", () => {
  it("al publicar con el interruptor prendido, la sesión pasa a recibir pedidos", async () => {
    vi.mocked(apiPagina.publicarCambios).mockResolvedValue(estado({ pedidosSistema: true }));
    await montarYPublicar();
    expect(apiPagina.publicarCambios).toHaveBeenCalled();
    expect(fijarPedidosWeb).toHaveBeenCalledWith(true);
  });

  it("al publicar con el interruptor apagado, la entrada se va", async () => {
    vi.mocked(apiPagina.publicarCambios).mockResolvedValue(estado({ pedidosSistema: false }));
    await montarYPublicar();
    expect(fijarPedidosWeb).toHaveBeenCalledWith(false);
  });

  it("sin la feature delivery en el plan no se toca la sesión", async () => {
    features = ["pos", "pagina_publica"];
    vi.mocked(apiPagina.publicarCambios).mockResolvedValue(estado({ pedidosSistema: true }));
    await montarYPublicar();
    expect(apiPagina.publicarCambios).toHaveBeenCalled();
    expect(fijarPedidosWeb).not.toHaveBeenCalled();
  });
});
