import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IconoPropio } from "../lib/apiIconos";
import SubirIconos from "./SubirIconos";

// Con la máquina cargada, el segundo de espera de siempre no alcanza.
vi.setConfig({ testTimeout: 30_000 });
configure({ asyncUtilTimeout: 10_000 });

/**
 * Subir íconos propios (16-nov): hasta 10 por vez, de a uno y en fila, y un
 * fallo no frena a los demás. jsdom no tiene canvas: la imagen "preparada" la
 * da el mock, que dice si se le sacó el fondo según lo que se pidió.
 */

const apiIconos = vi.hoisted(() => ({ listar: vi.fn(), subir: vi.fn(), renombrar: vi.fn(), borrar: vi.fn() }));
vi.mock("../lib/apiIconos", () => ({ apiIconos }));
const prepararIcono = vi.hoisted(() => vi.fn());
vi.mock("../lib/pagina/imagen", async (original) => ({
  ...(await original<typeof import("../lib/pagina/imagen")>()),
  prepararIcono,
}));

const crearUrl = URL.createObjectURL;
const liberarUrl = URL.revokeObjectURL;
let urls = 0;

beforeEach(() => {
  apiIconos.subir.mockReset();
  prepararIcono.mockReset().mockImplementation(async (archivo: File, sacarFondo: boolean) => ({
    blob: new Blob([archivo.name], { type: "image/webp" }),
    fondoQuitado: sacarFondo,
    yaSinFondo: false,
  }));
  urls = 0;
  URL.createObjectURL = vi.fn(() => `blob:vista-${++urls}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  // Desmontar antes de devolver las funciones de jsdom: al cerrar se liberan las vistas previas.
  cleanup();
  URL.createObjectURL = crearUrl;
  URL.revokeObjectURL = liberarUrl;
});

const archivo = (nombre: string) => new File([nombre], nombre, { type: "image/jpeg" });
const archivos = (n: number) => Array.from({ length: n }, (_, i) => archivo(`foto ${i + 1}.jpg`));
const icono = (id: number, nombre: string): IconoPropio => ({
  id,
  llave: `mio:${id.toString(16).padStart(24, "0")}`,
  nombre,
  ruta: `/publico/iconos/${id.toString(16).padStart(24, "0")}`,
  enUso: 0,
});

/** Una promesa que se resuelve o se rechaza desde la prueba. */
function diferida<T>() {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

function abrir(lista: File[], libres = 200) {
  const onSubido = vi.fn();
  const onCerrar = vi.fn();
  render(<SubirIconos archivos={lista} libres={libres} onSubido={onSubido} onCerrar={onCerrar} />);
  return { onSubido, onCerrar };
}

const nombres = () => (screen.getAllByLabelText("Nombre") as HTMLInputElement[]).map((i) => i.value);

describe("SubirIconos", () => {
  it("toma hasta 10 por vez y avisa que dejó afuera las demás", async () => {
    abrir(archivos(12));
    expect(nombres()).toHaveLength(10);
    expect(nombres()[0]).toBe("foto 1");
    expect(nombres()[9]).toBe("foto 10");
    expect(screen.getByText("Se pueden subir hasta 10 por vez: se tomaron las primeras 10.")).toBeInTheDocument();
    // Las diez se procesan de a una.
    expect(await screen.findByRole("button", { name: "Guardar 10 íconos" })).toBeEnabled();
    expect(prepararIcono).toHaveBeenCalledTimes(10);
  });

  it("si queda menos lugar que eso antes del tope, toma sólo lo que entra", () => {
    abrir(archivos(5), 3);
    expect(nombres()).toEqual(["foto 1", "foto 2", "foto 3"]);
    expect(screen.getByText("Sólo queda lugar para 3 íconos más: se tomaron las primeras 3.")).toBeInTheDocument();
  });

  it("muestra la vista previa ya procesada, grande y al tamaño real, con el fondo sacado por defecto", async () => {
    abrir([archivo("Vaso grande.png")]);
    const vista = await screen.findByAltText("Vista previa de «Vaso grande»");
    expect(vista).toHaveAttribute("src", "blob:vista-1");
    expect(prepararIcono).toHaveBeenCalledWith(expect.any(File), true);
    expect(screen.getByRole("switch", { name: "Sacarle el fondo" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Tamaño real")).toBeInTheDocument();
  });

  it("si no se pudo sacar el fondo, el interruptor queda apagado y lo aclara", async () => {
    prepararIcono.mockImplementation(async () => ({ blob: new Blob(["x"]), fondoQuitado: false, yaSinFondo: false }));
    abrir([archivo("Vaso sobre la mesa.jpg")]);
    expect(await screen.findByText("No pudimos sacarle el fondo: quedó como foto.")).toBeInTheDocument();
    const interruptor = screen.getByRole("switch", { name: "Sacarle el fondo" });
    expect(interruptor).toHaveAttribute("aria-checked", "false");
    expect(interruptor).toBeDisabled();
  });

  it("apagar el interruptor vuelve a procesar esa imagen dejándole el fondo, y libera la vista previa vieja", async () => {
    abrir([archivo("Botella.png")]);
    await screen.findByAltText("Vista previa de «Botella»");
    fireEvent.click(screen.getByRole("switch", { name: "Sacarle el fondo" }));
    await waitFor(() => expect(prepararIcono).toHaveBeenLastCalledWith(expect.any(File), false));
    expect(await screen.findByAltText("Vista previa de «Botella»")).toHaveAttribute("src", "blob:vista-2");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:vista-1");
    expect(screen.getByRole("switch", { name: "Sacarle el fondo" })).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText("No pudimos sacarle el fondo: quedó como foto.")).toBeNull();
  });

  it("los sube de a uno, en fila, con el nombre de cada uno, y al terminar vuelve al selector", async () => {
    const llamadas = [diferida<IconoPropio>(), diferida<IconoPropio>()];
    let n = 0;
    apiIconos.subir.mockImplementation(() => llamadas[n++].promesa);
    const { onSubido, onCerrar } = abrir([archivo("vaso_chico.jpg"), archivo("vaso-grande.jpg")]);
    fireEvent.change(screen.getAllByLabelText("Nombre")[1], { target: { value: "  Vaso XL  " } });
    fireEvent.click(await screen.findByRole("button", { name: "Guardar 2 íconos" }));

    // El segundo espera a que termine el primero.
    await waitFor(() => expect(apiIconos.subir).toHaveBeenCalledTimes(1));
    expect(apiIconos.subir).toHaveBeenLastCalledWith(expect.any(Blob), "vaso chico");
    expect(screen.getByText("En fila…")).toBeInTheDocument();
    await act(async () => llamadas[0].resolver(icono(1, "vaso chico")));
    await waitFor(() => expect(apiIconos.subir).toHaveBeenCalledTimes(2));
    expect(apiIconos.subir).toHaveBeenLastCalledWith(expect.any(Blob), "Vaso XL");
    expect(onSubido).toHaveBeenCalledWith(icono(1, "vaso chico"));
    expect(onCerrar).not.toHaveBeenCalled();

    await act(async () => llamadas[1].resolver(icono(2, "Vaso XL")));
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect(onSubido).toHaveBeenCalledTimes(2);
  });

  it("si uno falla, los demás siguen; el fallido queda con su error y «Reintentar»", async () => {
    apiIconos.subir
      .mockResolvedValueOnce(icono(1, "foto 1"))
      .mockRejectedValueOnce(new Error("La imagen no se pudo guardar."))
      .mockResolvedValueOnce(icono(3, "foto 3"));
    const { onSubido, onCerrar } = abrir(archivos(3));
    fireEvent.click(await screen.findByRole("button", { name: "Guardar 3 íconos" }));

    expect(await screen.findByText("La imagen no se pudo guardar.")).toBeInTheDocument();
    await waitFor(() => expect(apiIconos.subir).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(onSubido).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("Guardado")).toHaveLength(2);
    expect(onCerrar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Guardar 1 ícono" })).toBeEnabled();

    apiIconos.subir.mockResolvedValueOnce(icono(2, "foto 2"));
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect(apiIconos.subir).toHaveBeenCalledTimes(4);
    expect(apiIconos.subir).toHaveBeenLastCalledWith(expect.any(Blob), "foto 2");
    expect(onSubido).toHaveBeenLastCalledWith(icono(2, "foto 2"));
  });

  it("una imagen que no se puede leer queda con su error y no frena a las demás", async () => {
    prepararIcono.mockImplementation(async (a: File) => {
      if (a.name === "rota.jpg") throw new Error("La imagen es muy chica: tiene que medir al menos 96 px de cada lado.");
      return { blob: new Blob(["x"]), fondoQuitado: true, yaSinFondo: false };
    });
    apiIconos.subir.mockResolvedValue(icono(1, "buena"));
    const { onCerrar } = abrir([archivo("rota.jpg"), archivo("buena.jpg")]);
    expect(await screen.findByText(/La imagen es muy chica/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Guardar 1 ícono" }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect(apiIconos.subir).toHaveBeenCalledTimes(1);
  });

  it("se puede quitar una antes de guardar", async () => {
    abrir(archivos(2));
    await screen.findByRole("button", { name: "Guardar 2 íconos" });
    const fila = screen.getAllByRole("listitem")[0];
    fireEvent.click(within(fila).getByRole("button", { name: "Quitar «foto 1»" }));
    expect(nombres()).toEqual(["foto 2"]);
    expect(screen.getByRole("button", { name: "Guardar 1 ícono" })).toBeInTheDocument();
  });
});
