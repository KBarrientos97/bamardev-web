import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { numeroDeLaFicha, numeroParaWhatsapp } from "../../lib/nutricion/pdfComun";
import BotonesPdf from "./BotonesPdf";
import DialogoWhatsapp, { type EnvioPorWhatsapp } from "./DialogoWhatsapp";

/**
 * «Enviar por WhatsApp» del PDF de nutrición (26-nov-2026): lo que importa
 * es que llegue el PDF, sin mensaje. Donde el equipo puede compartir
 * archivos, «Compartir el PDF» es lo principal (el PDF va adjunto); debajo,
 * el número de la ficha y el botón que abre el chat de ESE número
 * (`wa.me/<número>`, sin texto) y baja el PDF. Lo que cuida el envío: a qué
 * número va, que el incompleto no abre nada, que no viaja ningún mensaje, y
 * que cada vez arranca con el de la ficha (no recuerda otro).
 */

const ARCHIVO = "seguimiento-tratamiento-2026-11-26.pdf";

function envio(cambios: Partial<EnvioPorWhatsapp> = {}): EnvioPorWhatsapp {
  return {
    telefono: "70490686",
    paciente: "Lucía Paredes Soria",
    que: "Seguimiento",
    nombreArchivo: ARCHIVO,
    armar: vi.fn(() => Promise.resolve(new Blob(["%PDF-1.3"], { type: "application/pdf" }))),
    ...cambios,
  };
}

function abrir(e: EnvioPorWhatsapp = envio()) {
  const props = { onCerrar: vi.fn(), onAviso: vi.fn(), onError: vi.fn() };
  render(<DialogoWhatsapp envio={e} {...props} />);
  return { ...props, dialogo: screen.getByRole("dialog", { name: "Enviar por WhatsApp" }), campo: screen.getByLabelText("Número de WhatsApp") as HTMLInputElement };
}

/** El teléfono o la tablet: pantalla táctil sin mouse. */
function conElDedo() {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(hover: none) and (pointer: coarse)", media: q, addEventListener() {}, removeEventListener() {} }));
}

const escribir = (campo: HTMLElement, valor: string) => fireEvent.change(campo, { target: { value: valor } });
const botonChat = (dialogo: HTMLElement) => within(dialogo).getByRole("button", { name: /^Abrir el chat de WhatsApp/ });
const AYUDA_PC = "Se abre WhatsApp en el chat de ese número y el PDF se descarga: arrastralo al chat o adjuntalo con el clip.";
const AYUDA_DEDO = "Se abre su chat y el PDF se descarga: adjuntalo ahí con el clip.";

let abrirVentana: ReturnType<typeof vi.spyOn>;
let bajados: string[];
const antesUrl = { crear: URL.createObjectURL, soltar: URL.revokeObjectURL };

beforeEach(() => {
  abrirVentana = vi.spyOn(window, "open").mockReturnValue(null);
  bajados = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    bajados.push(this.download);
  });
  // jsdom no tiene `URL.createObjectURL`: uno de mentira mientras dura la prueba.
  Object.assign(URL, { createObjectURL: () => "blob:prueba", revokeObjectURL: () => {} });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.assign(URL, { createObjectURL: antesUrl.crear, revokeObjectURL: antesUrl.soltar });
  Object.assign(navigator, { share: undefined, canShare: undefined });
});

/** El chat que se abrió: siempre `https://wa.me/<número>`, sin `?text=`. */
function chatAbierto(): string {
  expect(abrirVentana).toHaveBeenCalledTimes(1);
  return String(abrirVentana.mock.calls[0][0]);
}

describe("el número", () => {
  it("abre con el teléfono de la ficha (sin el 591 si lo trae) y lo dice", () => {
    const { dialogo, campo } = abrir();
    expect(campo).toHaveValue("70490686");
    expect(campo).toHaveAttribute("type", "tel");
    expect(campo).toHaveAttribute("inputmode", "tel");
    expect(within(dialogo).getByText("+591")).toBeInTheDocument();
    expect(within(dialogo).getByText("Es el teléfono de su ficha. Podés cambiarlo.")).toBeInTheDocument();
    expect(botonChat(dialogo)).toHaveAccessibleName("Abrir el chat de WhatsApp del +591 70490686");
    expect(within(dialogo).getByText("Seguimiento de Lucía Paredes Soria")).toBeInTheDocument();
    expect(numeroDeLaFicha("+591 70490686")).toBe("70490686");
    expect(numeroDeLaFicha("59170490686")).toBe("70490686");
    expect(numeroDeLaFicha("+54 9 11 1234-5678")).toBe("+54 9 11 1234-5678");
  });

  it("sin teléfono en la ficha abre vacío y pide escribirlo", () => {
    const { dialogo, campo } = abrir(envio({ telefono: null }));
    expect(campo).toHaveValue("");
    expect(within(dialogo).getByText("No tiene teléfono en su ficha: escribí el número.")).toBeInTheDocument();
    expect(within(dialogo).queryByRole("button", { name: "Borrar el número" })).not.toBeInTheDocument();
    expect(botonChat(dialogo)).toHaveAccessibleName("Abrir el chat de WhatsApp");
  });

  it("8 dígitos van con 591 adelante; 11 con el 591, tal cual; con «+», de otro país, tal cual", () => {
    expect(numeroParaWhatsapp("70490686")).toBe("59170490686");
    expect(numeroParaWhatsapp("7049 0686")).toBe("59170490686");
    expect(numeroParaWhatsapp("591 70490686")).toBe("59170490686");
    expect(numeroParaWhatsapp("+591 70490686")).toBe("59170490686");
    expect(numeroParaWhatsapp("+54 9 11 1234-5678")).toBe("5491112345678");
    // Incompletos o de más.
    expect(numeroParaWhatsapp("7049068")).toBeNull();
    expect(numeroParaWhatsapp("704906861")).toBeNull();
    expect(numeroParaWhatsapp("+591 7049068")).toBeNull();
    expect(numeroParaWhatsapp("+1234567")).toBeNull();
    expect(numeroParaWhatsapp("")).toBeNull();
  });

  it("mientras se escribe acepta dígitos, espacios, «+» y guiones; con «+» se esconde el «+591»", () => {
    const { dialogo, campo } = abrir(envio({ telefono: null }));
    escribir(campo, "+54 (9) 11-1234 abc");
    expect(campo).toHaveValue("+54 9 11-1234 ");
    expect(within(dialogo).queryByText("+591")).not.toBeInTheDocument();
  });

  it("la ✕ lo vacía", () => {
    const { dialogo, campo } = abrir();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Borrar el número" }));
    expect(campo).toHaveValue("");
  });
});

describe("lo que se manda", () => {
  it("el PDF solo, con su nombre entero; ningún mensaje", () => {
    const { dialogo } = abrir();
    expect(dialogo).toHaveTextContent(ARCHIVO);
    expect(within(dialogo).getByText("Documento PDF")).toBeInTheDocument();
    expect(within(dialogo).queryByText("Se envía")).not.toBeInTheDocument();
    expect(dialogo).not.toHaveTextContent(/mensaje/i);
  });
});

describe("abrir el chat del número", () => {
  it("abre el chat de ese número en el mismo toque, sin `text=`, baja el PDF, cierra y avisa", async () => {
    const e = envio();
    const { dialogo, onCerrar, onAviso } = abrir(e);
    // El PDF se empieza a armar al abrir.
    expect(e.armar).toHaveBeenCalledTimes(1);
    fireEvent.click(botonChat(dialogo));
    // Todavía sin esperar nada: el chat ya se abrió, a secas.
    expect(chatAbierto()).toBe("https://wa.me/59170490686");
    expect(onCerrar).toHaveBeenCalled();
    await waitFor(() => expect(onAviso).toHaveBeenCalledWith("Se abrió el chat de +591 70490686. El PDF se descargó: adjuntalo con el clip."));
    expect(bajados).toEqual([ARCHIVO]);
    expect(e.armar).toHaveBeenCalledTimes(1);
  });

  it("Enter en el campo también abre el chat; un número de otro país va tal cual", () => {
    const { campo } = abrir(envio({ telefono: null }));
    escribir(campo, "+54 9 11 1234-5678");
    fireEvent.submit(campo.form!);
    expect(chatAbierto()).toBe("https://wa.me/5491112345678");
  });

  it("un número que cambió de a mano es el que va", () => {
    const { dialogo, campo } = abrir();
    escribir(campo, "71234567");
    expect(within(dialogo).queryByText("Es el teléfono de su ficha. Podés cambiarlo.")).not.toBeInTheDocument();
    fireEvent.click(botonChat(dialogo));
    expect(chatAbierto()).toBe("https://wa.me/59171234567");
  });

  it("el número incompleto no abre nada: el error en rojo y el diálogo abierto", () => {
    const { dialogo, campo, onCerrar } = abrir();
    escribir(campo, "7049068");
    fireEvent.click(botonChat(dialogo));
    expect(abrirVentana).not.toHaveBeenCalled();
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("Escribí el número completo: 8 dígitos.");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(onCerrar).not.toHaveBeenCalled();
    // Al corregirlo, el error se va.
    escribir(campo, "70490686");
    expect(within(dialogo).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("vacío, tampoco", () => {
    const { dialogo } = abrir(envio({ telefono: null }));
    fireEvent.click(botonChat(dialogo));
    expect(abrirVentana).not.toHaveBeenCalled();
    expect(within(dialogo).getByRole("alert")).toBeInTheDocument();
  });

  it("si armar el PDF falla, el chat se abre igual y sale el error", async () => {
    const { dialogo, onError, onAviso } = abrir(envio({ armar: vi.fn(() => Promise.reject(new Error("jsPDF"))) }));
    fireEvent.click(botonChat(dialogo));
    expect(abrirVentana).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onError).toHaveBeenCalledWith("No se pudo armar el PDF. Probá de nuevo."));
    expect(onAviso).not.toHaveBeenCalled();
    expect(bajados).toEqual([]);
  });
});

describe("«Compartir el PDF»", () => {
  it("en la PC (sin pantalla táctil) no está: sólo el número, sin la alternativa, y la ayuda de la PC", () => {
    Object.assign(navigator, { share: vi.fn(), canShare: () => true });
    const { dialogo } = abrir();
    expect(within(dialogo).queryByRole("button", { name: /Compartir el PDF/ })).not.toBeInTheDocument();
    expect(within(dialogo).queryByText("¿No lo tenés agendado?")).not.toBeInTheDocument();
    expect(within(dialogo).getByText(AYUDA_PC)).toBeInTheDocument();
  });

  it("con el dedo pero sin poder compartir archivos, tampoco", () => {
    conElDedo();
    const { dialogo } = abrir();
    expect(within(dialogo).queryByRole("button", { name: /Compartir el PDF/ })).not.toBeInTheDocument();
    expect(within(dialogo).getByText(AYUDA_PC)).toBeInTheDocument();
  });

  it("con el dedo y donde se puede: arriba el PDF, después «Compartir el PDF» y, como alternativa, el número", () => {
    conElDedo();
    Object.assign(navigator, { share: vi.fn(), canShare: () => true });
    const { dialogo, campo } = abrir();
    const compartir = within(dialogo).getByRole("button", { name: "Compartir el PDF" });
    expect(compartir).toHaveAccessibleDescription("Elegís WhatsApp y el chat del paciente: el PDF va adjunto.");
    const pdf = within(dialogo).getByText("Documento PDF");
    const alternativa = within(dialogo).getByText("¿No lo tenés agendado?");
    const despues = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(despues(pdf, compartir)).toBe(true);
    expect(despues(compartir, alternativa)).toBe(true);
    expect(despues(alternativa, campo)).toBe(true);
    expect(within(dialogo).getByText(AYUDA_DEDO)).toBeInTheDocument();
  });

  it("comparte el PDF solo, sin texto, y cierra; cancelado, queda abierto", async () => {
    conElDedo();
    const share = vi.fn().mockRejectedValueOnce(new DOMException("cancelado", "AbortError")).mockResolvedValueOnce(undefined);
    Object.assign(navigator, { share, canShare: () => true });
    const { dialogo, onCerrar, onError } = abrir();
    const compartir = within(dialogo).getByRole("button", { name: "Compartir el PDF" });
    fireEvent.click(compartir);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(compartir).toBeEnabled());
    expect(onCerrar).not.toHaveBeenCalled();
    fireEvent.click(compartir);
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    const datos = share.mock.calls[1][0] as ShareData;
    expect(Object.keys(datos).sort()).toEqual(["files", "title"]);
    expect(datos.files?.[0].name).toBe(ARCHIVO);
    expect(datos.files?.[0].type).toBe("application/pdf");
    expect(abrirVentana).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("desde los botones del PDF", () => {
  it("no recuerda el número anterior: cada vez abre con el de la ficha", () => {
    render(<BotonesPdf listo="Listo." descargar={vi.fn()} whatsapp={envio()} onAviso={vi.fn()} onError={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar por WhatsApp" }));
    const campo = screen.getByLabelText("Número de WhatsApp");
    escribir(campo, "71234567");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enviar por WhatsApp" }));
    expect(screen.getByLabelText("Número de WhatsApp")).toHaveValue("70490686");
  });

  it("el botón ya no envía: abre el diálogo", async () => {
    render(<BotonesPdf listo="Listo." descargar={vi.fn()} whatsapp={envio()} onAviso={vi.fn()} onError={vi.fn()} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Enviar por WhatsApp" })));
    expect(screen.getByRole("dialog", { name: "Enviar por WhatsApp" })).toBeInTheDocument();
    expect(abrirVentana).not.toHaveBeenCalled();
  });
});
