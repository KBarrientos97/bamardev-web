import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPagina } from "../../lib/pagina/apiPagina";
import type { EstadoEditor, EstadoSitio, Sitio } from "../../lib/pagina/tipos";
import SitioEditor from "./SitioEditor";

/**
 * Las fotos del sitio en el editor (26-nov, pedido del dueño): «Cambiar» y
 * «Borrar» en cualquiera, también en las publicadas (antes salían con
 * candado), y el orden del carrusel con flechas.
 */

vi.mock("../../lib/pagina/apiPagina", async (original) => ({
  ...(await original<typeof import("../../lib/pagina/apiPagina")>()),
  apiPagina: { cambiarFotoSitio: vi.fn(), borrarFotoSitio: vi.fn() },
}));
vi.mock("../../lib/pagina/imagen", () => ({ prepararImagen: vi.fn(async () => new Blob(["x"], { type: "image/webp" })) }));

const LIMITES = {
  titulo: 80,
  subtitulo: 200,
  texto: 1500,
  leyenda: 80,
  datoValor: 8,
  datoEtiqueta: 30,
  datos: 4,
  fotosPortada: 5,
  fotosGaleria: 24,
  pregunta: 120,
  respuesta: 600,
  preguntas: 12,
  fotos: 40,
};

const SITIO = {
  plantilla: "COMERCIO",
  bloques: [{ tipo: "PORTADA", visible: true, datos: { titulo: "Hola", subtitulo: null, fotos: ["FOTO_1", "FOTO_2", "FOTO_3"] } }],
} as unknown as Sitio;

function estado(): EstadoSitio {
  return {
    disponible: true,
    plantillaSugerida: "COMERCIO",
    plantillas: ["GASTRONOMIA", "BELLEZA", "COMERCIO"],
    tiposBloque: ["PORTADA"],
    limites: LIMITES,
    actual: SITIO,
    publicado: true,
    enBorrador: false,
    fotos: ["FOTO_1", "FOTO_2", "FOTO_3"].map((foto) => ({ foto, url: `/publico/pagina/vida/imagen/${foto.toLowerCase()}?v=1` })),
    fotosPublicadas: ["FOTO_1", "FOTO_2", "FOTO_3"],
  } as EstadoSitio;
}

function montar() {
  const props = {
    estado: estado(),
    sitio: SITIO,
    onCambiar: vi.fn(),
    onEstado: vi.fn(),
    antes: vi.fn(async () => {}),
    onError: vi.fn(),
    onAviso: vi.fn(),
  };
  render(<SitioEditor {...props} />);
  return props;
}

beforeEach(() => {
  vi.mocked(apiPagina.cambiarFotoSitio).mockReset();
  vi.mocked(apiPagina.borrarFotoSitio).mockReset();
});

describe("fotos del sitio en el editor", () => {
  it("las publicadas ya no salen con candado: se pueden cambiar y borrar", async () => {
    const respuesta = { sitio: estado() } as unknown as EstadoEditor;
    vi.mocked(apiPagina.borrarFotoSitio).mockResolvedValue(respuesta);
    const p = montar();
    const lista = screen.getByRole("list", { name: "Fotos del sitio" });
    expect(within(lista).getByRole("button", { name: "Borrar la foto 1" })).toBeEnabled();
    expect(within(lista).getByRole("button", { name: "Cambiar la foto 1" })).toBeEnabled();
    expect(within(lista).queryByRole("button", { name: /está en tu sitio publicado/ })).toBeNull();

    fireEvent.click(within(lista).getByRole("button", { name: "Borrar la foto 2" }));
    expect(screen.getByText(/Tu página la sigue mostrando hasta que publiques/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    });
    expect(p.antes).toHaveBeenCalled();
    expect(apiPagina.borrarFotoSitio).toHaveBeenCalledWith("FOTO_2");
    expect(p.onEstado).toHaveBeenCalledWith(respuesta);
  });

  it("«Cambiar» sube la nueva para esa foto", async () => {
    const respuesta = { sitio: estado() } as unknown as EstadoEditor;
    vi.mocked(apiPagina.cambiarFotoSitio).mockResolvedValue({ foto: "FOTO_4", estado: respuesta });
    const p = montar();
    fireEvent.click(within(screen.getByRole("list", { name: "Fotos del sitio" })).getByRole("button", { name: "Cambiar la foto 3" }));
    const archivo = new File(["abc"], "nueva.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Elegir la foto nueva"), { target: { files: [archivo] } });
    });
    expect(p.antes).toHaveBeenCalled();
    expect(apiPagina.cambiarFotoSitio).toHaveBeenCalledWith("FOTO_3", expect.any(Blob));
    expect(p.onEstado).toHaveBeenCalledWith(respuesta);
    expect(p.onAviso).toHaveBeenCalledWith(expect.stringMatching(/cuando publiques/));
  });

  it("el orden del carrusel se cambia con flechas", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Editar Portada" }));
    const orden = screen.getByRole("list", { name: "Orden de las fotos elegidas" });
    expect(within(orden).getByRole("button", { name: "Mover la foto del lugar 1 antes" })).toBeDisabled();
    fireEvent.click(within(orden).getByRole("button", { name: "Mover la foto del lugar 3 antes" }));
    // La 3 pasó al lugar 2: en el selector de arriba se ve el número nuevo.
    expect(screen.getByRole("button", { name: "Foto 3, elegida en el lugar 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Foto 2, elegida en el lugar 3" })).toBeInTheDocument();
  });
});
