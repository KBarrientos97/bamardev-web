import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstadoEditor, EstadoSitio, Sitio } from "../../lib/pagina/tipos";

/** "Sitio web" en Mi página (PLAN-PAGINA-PRO M1), con la API simulada. */

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
    elegirPlantillaSitio: vi.fn(),
    guardarSitio: vi.fn(),
    quitarSitio: vi.fn(),
    subirFotoSitio: vi.fn(),
    borrarFotoSitio: vi.fn(),
  },
}));

vi.mock("../../lib/pagina/imagen", () => ({
  prepararImagen: vi.fn(async () => new Blob(["x"], { type: "image/webp" })),
}));

import { apiPagina } from "../../lib/pagina/apiPagina";
import MiPagina from "./MiPagina";

const LIMITES = {
  titulo: 60,
  subtitulo: 160,
  texto: 600,
  leyenda: 80,
  datoValor: 12,
  datoEtiqueta: 30,
  datos: 3,
  fotosPortada: 5,
  fotosGaleria: 30,
  pregunta: 140,
  respuesta: 500,
  preguntas: 8,
  fotos: 40,
};

const SITIO: Sitio = {
  plantilla: "GASTRONOMIA",
  bloques: [
    { tipo: "PORTADA", visible: true, datos: { titulo: null, subtitulo: null, fotos: [] } },
    { tipo: "CATALOGO", visible: true, datos: { titulo: "La carta" } },
    { tipo: "GALERIA", visible: false, datos: { titulo: "Galería", fotos: [] } },
    {
      tipo: "PREGUNTAS",
      visible: true,
      datos: { titulo: "Preguntas", items: [{ pregunta: "¿Hacen delivery?", respuesta: "Sí, [zonas a las que llegan]." }] },
    },
  ],
};

function conSitio(actual: Sitio | null, cambios: Partial<EstadoSitio> = {}): EstadoSitio {
  return {
    disponible: true,
    plantillaSugerida: "GASTRONOMIA",
    plantillas: ["GASTRONOMIA", "BELLEZA", "COMERCIO"],
    tiposBloque: ["PORTADA", "DESTACADO", "CATALOGO", "QUIENES", "GALERIA", "UBICACION", "PREGUNTAS", "RESENAS", "VIDEO"],
    limites: LIMITES,
    actual,
    publicado: false,
    enBorrador: !!actual,
    fotos: [
      { foto: "FOTO_1", url: "/publico/pagina/elfogon/imagen/FOTO_1?v=a" },
      { foto: "FOTO_2", url: "/publico/pagina/elfogon/imagen/FOTO_2?v=b" },
    ],
    fotosPublicadas: ["FOTO_2"],
    ...cambios,
  };
}

function estado(sitio?: EstadoSitio): EstadoEditor {
  return {
    subdominio: "elfogon",
    urlPublica: "https://link-qa.bamardev.com/elfogon",
    negocio: { nombre: "Pollos El Fogón", rubro: "RESTAURANTE", iniciales: "EF" },
    pagina: {
      publicada: true,
      bloqueada: false,
      motivoBloqueo: null,
      descripcion: null,
      colorClave: "ROJO",
      formaBotones: "REDONDEADO",
      tipografia: "MODERNA",
      anuncioTexto: null,
      anuncioHasta: null,
      anuncioUrl: null,
      enlaceDestacadoId: null,
      mostrarReservar: false,
      actualizadoEn: "2026-11-08T00:00:00Z",
    },
    borrador: { hay: false, actualizadoEn: null },
    imagenes: { logo: null, portada: null },
    enlaces: [],
    sucursales: [],
    reservaOnline: false,
    enlacesCortos: false,
    muestras: [{ clave: "ROJO", nombre: "Rojo", hex: "#C0262D" }],
    catalogo: [],
    topeCatalogo: 60,
    sitio,
  };
}

async function montar() {
  render(
    <MemoryRouter>
      <MiPagina />
    </MemoryRouter>,
  );
  await act(async () => {});
}

const seccion = () => screen.getByRole("heading", { name: "Sitio web" }).closest("section") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiPagina.publicarCambios).mockResolvedValue(estado(conSitio(SITIO)));
});

describe("Sitio web en Mi página", () => {
  it("sin la feature no ofrece nada del sitio", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(estado(conSitio(null, { disponible: false })));
    await montar();
    expect(screen.queryByRole("heading", { name: "Sitio web" })).toBeNull();
  });

  it("un backend anterior (sin `sitio`) tampoco", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(estado());
    await montar();
    expect(screen.queryByRole("heading", { name: "Sitio web" })).toBeNull();
  });

  it("sin sitio todavía: las tres plantillas, la del rubro marcada, y elegir arma el sitio", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(estado(conSitio(null)));
    vi.mocked(apiPagina.elegirPlantillaSitio).mockResolvedValue(estado(conSitio({ ...SITIO, plantilla: "BELLEZA" })));
    await montar();
    const s = seccion();
    const gastro = within(s).getByRole("button", { name: /Gastronomía/ });
    expect(within(gastro).getByText("Sugerida")).toBeInTheDocument();
    fireEvent.click(within(s).getByRole("button", { name: /Belleza/ }));
    await act(async () => {});
    expect(apiPagina.elegirPlantillaSitio).toHaveBeenCalledWith("BELLEZA");
    expect(within(seccion()).getByRole("list", { name: "Bloques del sitio" })).toBeInTheDocument();
    expect(screen.getByTestId("vista-pagina")).toHaveAttribute("data-sitio", "BELLEZA");
  });

  it("con sitio: el porcentaje con lo que falta, y las preguntas sugeridas para revisar", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(estado(conSitio(SITIO)));
    await montar();
    const s = seccion();
    // Portada sin título ni fotos y preguntas con corchetes: 0 de 2.
    expect(within(s).getByText("Tu sitio está al 0 %")).toBeInTheDocument();
    expect(within(s).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    fireEvent.click(within(s).getByRole("button", { name: /Preguntas: completá lo que está entre \[corchetes\]/ }));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByText(/Revisala: completá lo que está entre \[corchetes\]/)).toBeInTheDocument();
    fireEvent.change(within(modal).getByLabelText("Respuesta 1"), { target: { value: "Sí, en todo el centro." } });
    expect(within(modal).queryByText(/Revisala/)).toBeNull();
    fireEvent.click(within(modal).getByRole("button", { name: "Listo" }));
    expect(within(s).getByText("Tu sitio está al 50 %")).toBeInTheDocument();
  });

  it("prender, ordenar y editar va al borrador con el sitio entero", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(estado(conSitio(SITIO)));
    vi.mocked(apiPagina.guardarSitio).mockImplementation(async (s) => estado(conSitio(s)));
    await montar();
    const s = seccion();
    const galeria = within(s).getByRole("switch", { name: "Mostrar Galería" });
    expect(galeria).toHaveAttribute("aria-checked", "false");
    fireEvent.click(galeria);
    expect(galeria).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(s).getByRole("button", { name: "Bajar Portada" }));
    fireEvent.click(within(s).getByRole("button", { name: "Editar Portada" }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText("Título"), { target: { value: "Pollo a la leña" } });
    fireEvent.click(within(modal).getByRole("button", { name: "Foto 1" }));
    fireEvent.click(within(modal).getByRole("button", { name: "Listo" }));
    // La vista previa ya lo muestra, antes de guardar.
    expect(within(screen.getByTestId("vista-pagina")).getByText("Pollo a la leña")).toBeInTheDocument();
    expect(screen.getByText("Cambios sin publicar")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Publicar cambios" }));
    await act(async () => {});
    expect(apiPagina.guardarSitio).toHaveBeenCalledTimes(1);
    const enviado = vi.mocked(apiPagina.guardarSitio).mock.calls[0][0];
    expect(enviado.bloques.map((b) => b.tipo)).toEqual(["CATALOGO", "PORTADA", "GALERIA", "PREGUNTAS"]);
    expect(enviado.bloques[1].datos).toEqual({ titulo: "Pollo a la leña", subtitulo: null, fotos: ["FOTO_1"] });
    expect(enviado.bloques[2].visible).toBe(true);
    expect(apiPagina.publicarCambios).toHaveBeenCalled();
  });

  it("un año fuera de rango no se guarda: lo dice en el formulario", async () => {
    const conQuienes: Sitio = {
      ...SITIO,
      bloques: [...SITIO.bloques, { tipo: "QUIENES", visible: true, datos: { titulo: null, texto: null, desde: null, datos: [], foto: null } }],
    };
    vi.mocked(apiPagina.estado).mockResolvedValue(estado(conSitio(conQuienes)));
    await montar();
    fireEvent.click(within(seccion()).getByRole("button", { name: "Editar Quiénes somos" }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText("Desde qué año"), { target: { value: "1850" } });
    fireEvent.click(within(modal).getByRole("button", { name: "Listo" }));
    expect(within(modal).getByRole("alert")).toHaveTextContent(/entre 1900 y/);
  });

  it("la foto del sitio publicado no se borra; las otras sí", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(estado(conSitio(SITIO)));
    vi.mocked(apiPagina.borrarFotoSitio).mockResolvedValue(estado(conSitio(SITIO, { fotos: [{ foto: "FOTO_2", url: "/x" }] })));
    await montar();
    const fotos = within(seccion()).getByRole("list", { name: "Fotos del sitio" });
    expect(within(fotos).getByRole("button", { name: "La foto 2 está en tu sitio publicado" })).toBeDisabled();
    fireEvent.click(within(fotos).getByRole("button", { name: "Borrar la foto 1" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Borrar" }));
    await act(async () => {});
    expect(apiPagina.borrarFotoSitio).toHaveBeenCalledWith("FOTO_1");
  });

  it("subir una foto la achica, la sube y queda en la lista", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(estado(conSitio(SITIO)));
    const conTres = conSitio(SITIO, {
      fotos: [...conSitio(SITIO).fotos, { foto: "FOTO_3", url: "/publico/pagina/elfogon/imagen/FOTO_3?v=c" }],
    });
    vi.mocked(apiPagina.subirFotoSitio).mockResolvedValue({ foto: "FOTO_3", estado: estado(conTres) });
    await montar();
    const archivo = new File(["x"], "local.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Subir fotos al sitio"), { target: { files: [archivo] } });
    await act(async () => {});
    expect(apiPagina.subirFotoSitio).toHaveBeenCalledTimes(1);
    expect(within(seccion()).getByText("Tus fotos (3 de 40)")).toBeInTheDocument();
  });

  it("volver a la página simple pide confirmación y va al borrador", async () => {
    vi.mocked(apiPagina.estado).mockResolvedValue(estado(conSitio(SITIO)));
    vi.mocked(apiPagina.quitarSitio).mockResolvedValue(estado(conSitio(null)));
    await montar();
    fireEvent.click(within(seccion()).getByRole("button", { name: "Volver a la página simple" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Volver a la página simple" }));
    await act(async () => {});
    expect(apiPagina.quitarSitio).toHaveBeenCalled();
    expect(within(seccion()).getByRole("button", { name: /Gastronomía/ })).toBeInTheDocument();
    expect(screen.getByTestId("vista-pagina")).not.toHaveAttribute("data-sitio");
  });
});
