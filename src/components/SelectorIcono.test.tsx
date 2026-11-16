import { configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IconoPropio } from "../lib/apiIconos";
import { CATEGORIAS_ICONO } from "../lib/iconosArticulo";
import SelectorIcono from "./SelectorIcono";

/**
 * «Mis íconos» (16-nov) pide la lista al abrir. Por defecto no contesta nunca:
 * las pruebas del catálogo de abajo son las de siempre, con la lista
 * «cargando», que es justo el caso en que el catálogo tiene que andar igual.
 */
const apiIconos = vi.hoisted(() => ({ listar: vi.fn(), subir: vi.fn(), renombrar: vi.fn(), borrar: vi.fn() }));
vi.mock("../lib/apiIconos", () => ({ apiIconos }));
// jsdom no tiene canvas: la subida se prueba con la imagen ya "preparada".
const prepararIcono = vi.hoisted(() => vi.fn());
vi.mock("../lib/pagina/imagen", async (original) => ({
  ...(await original<typeof import("../lib/pagina/imagen")>()),
  prepararIcono,
}));
// Cada vuelta de «Mis íconos» redibuja los 231 del catálogo: con la máquina
// cargada, el segundo de espera de siempre no alcanza (sólo lo usan las nuevas).
configure({ asyncUtilTimeout: 10_000 });

/**
 * jsdom no calcula layout: cada sección queda en `offsetTop` 0 y la lista no
 * tiene alto. Para probar el scroll le damos a cada sección una altura fija de
 * 1000 px según su orden, que es todo lo que el selector mira.
 */
const ALTO_SECCION = 1000;
const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");
const scrollToOriginal = HTMLElement.prototype.scrollTo;

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get(this: HTMLElement) {
      const i = CATEGORIAS_ICONO.findIndex((c) => c.clave === this.dataset.categoria);
      return i < 0 ? 0 : i * ALTO_SECCION;
    },
  });
  HTMLElement.prototype.scrollTo = vi.fn() as unknown as typeof HTMLElement.prototype.scrollTo;
  apiIconos.listar.mockReset().mockReturnValue(new Promise(() => {}));
  apiIconos.subir.mockReset();
  apiIconos.borrar.mockReset();
  prepararIcono.mockReset();
});

afterEach(() => {
  if (original) Object.defineProperty(HTMLElement.prototype, "offsetTop", original);
  HTMLElement.prototype.scrollTo = scrollToOriginal;
  vi.restoreAllMocks();
});

function abrir(props: Partial<Parameters<typeof SelectorIcono>[0]> = {}) {
  const onElegir = vi.fn();
  render(
    <SelectorIcono actual={null} rubro="RESTAURANTE" onElegir={onElegir} onCerrar={() => {}} {...props} />,
  );
  return { onElegir, lista: screen.getByTestId("lista-iconos") };
}

const pestana = (nombre: string) =>
  screen.getByRole("navigation", { name: "Secciones de íconos" }).querySelector(`[aria-label="${nombre}"]`);

describe("SelectorIcono", () => {
  it("muestra todas las secciones, no sólo la del rubro", () => {
    abrir({ rubro: "FARMACIA" });
    for (const c of CATEGORIAS_ICONO) {
      expect(screen.getByRole("heading", { name: c.nombre })).toBeInTheDocument();
    }
    // Una farmacia que vende agua tiene que poder elegirla.
    expect(screen.getByRole("button", { name: "Agua" })).toBeInTheDocument();
  });

  it.each([
    ["FARMACIA", "Farmacia", 5],
    ["FERRETERIA", "Ferretería", 6],
    ["BARBERIA", "Belleza y spa", 8],
    ["BILLAR", "Licorería y kiosco", 10],
    ["ACADEMIA", "Educación", 11],
  ])("con rubro %s abre en la sección %s", (rubro, nombre, indice) => {
    const { lista } = abrir({ rubro });
    expect(pestana(nombre)).toHaveAttribute("aria-current", "true");
    expect(lista.scrollTop).toBe(indice * ALTO_SECCION);
  });

  it("con un ícono ya puesto abre en la sección de ese ícono, no en la del rubro", () => {
    // Una pollería que le puso el martillo a algo: al editar tiene que verlo.
    const { lista } = abrir({ rubro: "RESTAURANTE", actual: "martillo" });
    expect(pestana("Ferretería")).toHaveAttribute("aria-current", "true");
    expect(pestana("Pollería")).not.toHaveAttribute("aria-current");
    expect(lista.scrollTop).toBe(6 * ALTO_SECCION);
  });

  it("con un ícono puesto que ya no existe abre en la del rubro", () => {
    const { lista } = abrir({ rubro: "FARMACIA", actual: "icono_de_una_version_nueva" });
    expect(pestana("Farmacia")).toHaveAttribute("aria-current", "true");
    expect(lista.scrollTop).toBe(5 * ALTO_SECCION);
  });

  it("sin rubro conocido abre en la primera sección", () => {
    const { lista } = abrir({ rubro: undefined });
    expect(pestana("Pollería")).toHaveAttribute("aria-current", "true");
    expect(lista.scrollTop).toBe(0);
  });

  it("tocar una pestaña la marca y desliza la lista hasta su sección", () => {
    const { lista } = abrir();
    fireEvent.click(pestana("Ferretería")!);
    expect(pestana("Ferretería")).toHaveAttribute("aria-current", "true");
    expect(pestana("Pollería")).not.toHaveAttribute("aria-current");
    expect(lista.scrollTo).toHaveBeenCalledWith({ top: 6 * ALTO_SECCION, behavior: "smooth" });
  });

  it("al desplazar a mano se marca sola la pestaña de la sección visible", () => {
    const { lista } = abrir();
    Object.defineProperty(lista, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(lista, "scrollHeight", { configurable: true, value: 12 * ALTO_SECCION });
    // Pasada la pausa que sigue al salto inicial.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5000);

    lista.scrollTop = 3 * ALTO_SECCION + 120;
    fireEvent.scroll(lista);
    expect(pestana("Almacén")).toHaveAttribute("aria-current", "true");

    // Al fondo se marca la última aunque no llegue arriba de todo.
    lista.scrollTop = 12 * ALTO_SECCION - 400;
    fireEvent.scroll(lista);
    expect(pestana("Educación")).toHaveAttribute("aria-current", "true");
  });

  it("buscar filtra por etiqueta sin tildes ni mayúsculas y esconde las pestañas", () => {
    abrir();
    fireEvent.change(screen.getByPlaceholderText("Buscar ícono…"), { target: { value: "CAFE" } });
    expect(screen.getByRole("button", { name: "Café" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Martillo" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Secciones de íconos" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Bebidas" })).toBeNull();
  });

  it("una búsqueda sin coincidencias lo dice", () => {
    abrir();
    fireEvent.change(screen.getByPlaceholderText("Buscar ícono…"), { target: { value: "xyzw" } });
    expect(screen.getByText(/No hay íconos con «xyzw»/)).toBeInTheDocument();
  });

  it("al borrar la búsqueda vuelven las secciones en la que estaba marcada", () => {
    const { lista } = abrir({ rubro: "MINIMARKET" });
    const buscador = screen.getByPlaceholderText("Buscar ícono…");
    fireEvent.change(buscador, { target: { value: "pan" } });
    fireEvent.change(buscador, { target: { value: "" } });
    expect(pestana("Almacén")).toHaveAttribute("aria-current", "true");
    expect(lista.scrollTop).toBe(3 * ALTO_SECCION);
  });

  it("elegir un ícono devuelve su llave, también desde la búsqueda", () => {
    const { onElegir } = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Martillo" }));
    expect(onElegir).toHaveBeenLastCalledWith("martillo");

    fireEvent.change(screen.getByPlaceholderText("Buscar ícono…"), { target: { value: "termó" } });
    fireEvent.click(screen.getByRole("button", { name: "Termómetro" }));
    expect(onElegir).toHaveBeenLastCalledWith("termometro");
  });

  it("los íconos viejos de pollería se siguen pudiendo elegir con su llave", () => {
    const { onElegir } = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Broaster medio" }));
    expect(onElegir).toHaveBeenLastCalledWith("medio_pollo_broaster");
  });

  it("'Sin ícono' vuelve al monograma", () => {
    const { onElegir } = abrir({ actual: "pan" });
    fireEvent.click(screen.getByRole("button", { name: /Sin ícono/ }));
    expect(onElegir).toHaveBeenLastCalledWith(null);
  });

  it("el ícono elegido se ve marcado", () => {
    abrir({ actual: "pan" });
    expect(screen.getByRole("button", { name: "Pan" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Leche" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Sin ícono/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("sin ícono puesto, 'Sin ícono' es el marcado", () => {
    abrir({ actual: null });
    expect(screen.getByRole("button", { name: /Sin ícono/ })).toHaveAttribute("aria-pressed", "true");
  });
});

const BASE = import.meta.env.VITE_API_URL || "/api";
const token = (id: number) => id.toString(16).padStart(24, "0");
const propio = (id: number, nombre: string, enUso = 0): IconoPropio => ({
  id,
  llave: `mio:${token(id)}`,
  nombre,
  ruta: `/publico/iconos/${token(id)}`,
  enUso,
});
const conLista = (iconos: IconoPropio[], tope = 200) => apiIconos.listar.mockResolvedValue({ tope, iconos });
/**
 * Las consultas van a la sección «Mis íconos»: por rol sobre los 231 botones
 * del catálogo, cada vuelta de jsdom tarda segundos con la máquina cargada.
 */
const misIconos = (lista: HTMLElement) => within(lista.querySelector<HTMLElement>('[data-categoria="propios"]')!);

describe("SelectorIcono: Mis íconos (16-nov)", { timeout: 40_000 }, () => {
  it("muestra «Mis íconos» arriba de todas, con su pestaña y lo que devuelve la lista", async () => {
    conLista([propio(2, "Vaso grande"), propio(1, "Flan de la casa")]);
    const { lista } = abrir();
    const vaso = await misIconos(lista).findByRole("button", { name: "Vaso grande" });
    expect(vaso.querySelector("img")).toHaveAttribute("src", `${BASE}/publico/iconos/${token(2)}`);
    expect(lista.querySelector("section")).toHaveAttribute("data-categoria", "propios");
    expect(misIconos(lista).getByRole("heading", { name: "Mis íconos" })).toBeInTheDocument();
    expect(pestana("Mis íconos")).toBeInTheDocument();
    // En el orden de la lista (los más nuevos primero), después de «Subir».
    const celdas = misIconos(lista).getAllByRole("button").map((b) => b.textContent);
    expect(celdas).toEqual(["Administrar", "Subir", "Vaso grande", "Flan de la casa"]);
    // Sin ícono propio puesto, abre en la del rubro, como siempre.
    expect(pestana("Pollería")).toHaveAttribute("aria-current", "true");
  });

  it("elegir uno propio devuelve su llave", async () => {
    conLista([propio(7, "Vaso grande")]);
    const { onElegir, lista } = abrir();
    fireEvent.click(await misIconos(lista).findByRole("button", { name: "Vaso grande" }));
    expect(onElegir).toHaveBeenLastCalledWith(`mio:${token(7)}`);
  });

  it("con un ícono propio puesto abre en «Mis íconos» (no en la del rubro) y se ve marcado", async () => {
    conLista([propio(7, "Vaso grande"), propio(8, "Flan casero")]);
    const { lista } = abrir({ rubro: "FARMACIA", actual: `mio:${token(7)}` });
    expect(pestana("Mis íconos")).toHaveAttribute("aria-current", "true");
    expect(pestana("Farmacia")).not.toHaveAttribute("aria-current");
    expect(lista.scrollTop).toBe(0);
    expect(await misIconos(lista).findByRole("button", { name: "Vaso grande" })).toHaveAttribute("aria-pressed", "true");
    expect(misIconos(lista).getByRole("button", { name: "Flan casero" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Sin ícono/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("el buscador encuentra los propios por su nombre, sin tildes ni mayúsculas, y primero", async () => {
    conLista([propio(3, "Café de la casa"), propio(4, "Flan casero")]);
    const { onElegir, lista } = abrir();
    await misIconos(lista).findByRole("button", { name: "Café de la casa" });
    const buscador = screen.getByPlaceholderText("Buscar ícono…");

    fireEvent.change(buscador, { target: { value: "CAFE DE LA" } });
    expect(within(lista).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Café de la casa"]);

    fireEvent.change(buscador, { target: { value: "cafe" } });
    expect(within(lista).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Café de la casa", "Café"]);
    fireEvent.click(within(lista).getByRole("button", { name: "Café de la casa" }));
    expect(onElegir).toHaveBeenLastCalledWith(`mio:${token(3)}`);
  });

  it("si la lista falla, el catálogo se sigue pudiendo elegir y se puede reintentar", async () => {
    apiIconos.listar.mockRejectedValueOnce(new Error("sin red"));
    const { onElegir, lista } = abrir();
    expect(await misIconos(lista).findByText("No pudimos traer tus íconos.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Martillo" }));
    expect(onElegir).toHaveBeenLastCalledWith("martillo");

    conLista([propio(5, "Vaso grande")]);
    fireEvent.click(misIconos(lista).getByRole("button", { name: "Reintentar" }));
    expect(await misIconos(lista).findByRole("button", { name: "Vaso grande" })).toBeInTheDocument();
    expect(apiIconos.listar).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("No pudimos traer tus íconos.")).toBeNull();
  });

  it("mientras la lista no llega, se puede elegir del catálogo igual", () => {
    const { onElegir } = abrir();
    expect(screen.getByText("Cargando tus íconos…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pan" }));
    expect(onElegir).toHaveBeenLastCalledWith("pan");
  });

  it("sin íconos propios explica para qué sirve la sección, y no hay nada que administrar", async () => {
    conLista([]);
    const { lista } = abrir();
    expect(
      await misIconos(lista).findByText("Subí fotos de tus productos y usalas como íconos. Sólo las ve tu negocio."),
    ).toBeInTheDocument();
    expect(misIconos(lista).getAllByRole("button").map((b) => b.textContent)).toEqual(["Subir"]);
  });

  it("borrar pide confirmación diciendo cuántos productos lo usan, y deja el formulario sin ícono", async () => {
    conLista([propio(7, "Vaso grande", 3), propio(8, "Flan casero")]);
    apiIconos.borrar.mockResolvedValue({ productos: 3 });
    const onIconoBorrado = vi.fn();
    const { onElegir, lista } = abrir({ actual: `mio:${token(7)}`, onIconoBorrado });
    await misIconos(lista).findByRole("button", { name: "Vaso grande" });

    fireEvent.click(misIconos(lista).getByRole("button", { name: "Administrar" }));
    fireEvent.click(misIconos(lista).getByRole("button", { name: "Borrar «Vaso grande»" }));
    // En modo «Administrar» tocar un ícono no lo elige.
    expect(onElegir).not.toHaveBeenCalled();
    const dialogo = screen.getByRole("dialog", { name: "¿Borrar este ícono?" });
    expect(dialogo).toHaveTextContent("«Vaso grande» lo usan 3 productos: van a volver a mostrar sus iniciales.");
    expect(apiIconos.borrar).not.toHaveBeenCalled();

    fireEvent.click(within(dialogo).getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(onIconoBorrado).toHaveBeenCalledWith(`mio:${token(7)}`));
    expect(apiIconos.borrar).toHaveBeenCalledWith(7);
    expect(misIconos(lista).queryByRole("button", { name: "Borrar «Vaso grande»" })).toBeNull();
    expect(misIconos(lista).getByRole("button", { name: "Borrar «Flan casero»" })).toBeInTheDocument();
  });

  it("cancelar el borrado no borra nada", async () => {
    conLista([propio(8, "Flan casero")]);
    const { lista } = abrir();
    fireEvent.click(await misIconos(lista).findByRole("button", { name: "Administrar" }));
    fireEvent.click(misIconos(lista).getByRole("button", { name: "Borrar «Flan casero»" }));
    const dialogo = screen.getByRole("dialog", { name: "¿Borrar este ícono?" });
    expect(dialogo).toHaveTextContent("«Flan casero» no lo usa ningún producto.");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(apiIconos.borrar).not.toHaveBeenCalled();
    expect(misIconos(lista).getByRole("button", { name: "Borrar «Flan casero»" })).toBeInTheDocument();
  });

  it("con el tope lleno, «Subir» lo dice en vez de abrir el explorador", async () => {
    conLista([propio(1, "Uno"), propio(2, "Dos")], 2);
    const { lista } = abrir();
    await misIconos(lista).findByRole("button", { name: "Uno" });
    const explorador = vi.spyOn(screen.getByLabelText("Elegir fotos para subir como íconos"), "click");
    fireEvent.click(misIconos(lista).getByRole("button", { name: "Subir" }));
    expect(
      misIconos(lista).getByText("Llegaste al máximo de 2 íconos propios. Borrá alguno para subir otro."),
    ).toBeInTheDocument();
    expect(explorador).not.toHaveBeenCalled();
  });

  it("con lugar, «Subir» abre el explorador; lo subido aparece primero y queda marcada «Mis íconos»", async () => {
    conLista([propio(1, "Viejo")]);
    prepararIcono.mockResolvedValue({ blob: new Blob(["x"], { type: "image/webp" }), fondoQuitado: true, yaSinFondo: false });
    apiIconos.subir.mockResolvedValue(propio(9, "Vaso nuevo"));
    const { lista } = abrir({ rubro: "FARMACIA" });
    await misIconos(lista).findByRole("button", { name: "Viejo" });

    const explorador = screen.getByLabelText("Elegir fotos para subir como íconos");
    const abrirExplorador = vi.spyOn(explorador, "click");
    fireEvent.click(misIconos(lista).getByRole("button", { name: "Subir" }));
    expect(abrirExplorador).toHaveBeenCalled();

    fireEvent.change(explorador, { target: { files: [new File(["x"], "Vaso nuevo.jpg", { type: "image/jpeg" })] } });
    const subida = await screen.findByRole("dialog", { name: "Subir íconos" });
    const guardar = await within(subida).findByRole("button", { name: "Guardar 1 ícono" });
    fireEvent.click(guardar);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Subir íconos" })).toBeNull());
    expect(apiIconos.subir).toHaveBeenCalledWith(expect.any(Blob), "Vaso nuevo");
    expect(misIconos(lista).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Administrar",
      "Subir",
      "Vaso nuevo",
      "Viejo",
    ]);
    expect(pestana("Mis íconos")).toHaveAttribute("aria-current", "true");
  });
});
