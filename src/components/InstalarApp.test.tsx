import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guiaPara, textoInstalar } from "../lib/pwa/guia";
import { reiniciarEstadoPwa, type EventoInstalar } from "../lib/pwa/pwa";
import { AVISAR_VERSION_TRAS_MS, AvisoVersionNueva, HojaInstalar } from "./InstalarApp";

const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const CHROME_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

function conUserAgent(ua: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
}

function eventoInstalar(outcome: "accepted" | "dismissed" = "accepted") {
  return Object.assign(new Event("beforeinstallprompt"), {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome }),
  }) as EventoInstalar;
}

beforeEach(() => reiniciarEstadoPwa());
afterEach(() => vi.restoreAllMocks());

describe("guiaPara", () => {
  const equipo = (userAgent: string, maxTouchPoints = 0) => ({ userAgent, maxTouchPoints });
  const nada = { instalada: false, instalable: null };

  it("ya instalada: no hay nada que ofrecer", () => {
    expect(guiaPara({ ...nada, instalada: true }, equipo(SAFARI_IPHONE))).toEqual({ tipo: "instalada" });
  });

  it("con el aviso de Chrome, el botón (en Android o en la PC)", () => {
    expect(guiaPara({ ...nada, instalable: eventoInstalar() }, equipo(CHROME_WINDOWS))).toEqual({ tipo: "boton" });
  });

  it("en iOS, los pasos de su navegador", () => {
    expect(guiaPara(nada, equipo(SAFARI_IPHONE))).toEqual({ tipo: "ios", navegador: "safari" });
    expect(guiaPara(nada, equipo(CHROME_IPHONE))).toEqual({ tipo: "ios", navegador: "chrome" });
  });

  it("Android sin el aviso: desde el menú del navegador; la PC sin aviso: nada", () => {
    expect(guiaPara(nada, equipo(CHROME_ANDROID))).toEqual({ tipo: "android" });
    expect(guiaPara(nada, equipo(CHROME_WINDOWS))).toEqual({ tipo: "ninguna" });
  });
});

describe("HojaInstalar", () => {
  it("en el iPhone con Safari explica Compartir → Agregar a inicio", () => {
    conUserAgent(SAFARI_IPHONE);
    render(<HojaInstalar onClose={() => {}} />);
    expect(screen.getByText("Compartir")).toBeInTheDocument();
    expect(screen.getByText(/abajo en el iPhone/)).toBeInTheDocument();
    expect(screen.getByText("Agregar a inicio")).toBeInTheDocument();
    // La app instalada no comparte la sesión de Safari: hay que avisarlo.
    expect(screen.getByText(/su propia\s+sesión/)).toBeInTheDocument();
  });

  it("con Chrome en el iPhone, Compartir está en la barra de la dirección", () => {
    conUserAgent(CHROME_IPHONE);
    render(<HojaInstalar onClose={() => {}} />);
    expect(screen.getByText(/barra de la dirección/)).toBeInTheDocument();
  });

  it("con el aviso de Chrome, Instalar abre su diálogo y cierra la hoja", async () => {
    conUserAgent(CHROME_ANDROID);
    const evento = eventoInstalar();
    reiniciarEstadoPwa({ instalable: evento });
    const onClose = vi.fn();
    render(<HojaInstalar onClose={onClose} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Instalar/ }));
    });
    expect(evento.prompt).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalled();
  });

  it("en la computadora habla de la computadora, no del celular", () => {
    conUserAgent(CHROME_WINDOWS);
    reiniciarEstadoPwa({ instalable: eventoInstalar() });
    render(<HojaInstalar onClose={() => {}} />);
    expect(screen.getByText("Instalá BamarDev en esta computadora")).toBeInTheDocument();
    expect(screen.getByText(/escritorio y en el menú de inicio/)).toBeInTheDocument();
    expect(screen.queryByText(/celular/)).toBeNull();
  });
});

describe("textoInstalar", () => {
  it("una sola palabra en todos los equipos (26-oct): el renglón no se parte en dos", () => {
    for (const ua of [CHROME_ANDROID, SAFARI_IPHONE, CHROME_WINDOWS]) {
      conUserAgent(ua);
      expect(textoInstalar()).toBe("Instalar");
    }
  });
});

describe("AvisoVersionNueva", () => {
  const HORAS_2 = AVISAR_VERSION_TRAS_MS;

  it("no aparece mientras no haya un deploy nuevo", () => {
    const { container } = render(<AvisoVersionNueva />);
    expect(container).toBeEmptyDOMElement();
  });

  it("en una pestaña del navegador no aparece nunca, aunque pasen horas", () => {
    reiniciarEstadoPwa({ versionNueva: true, versionNuevaDesde: Date.now() - 10 * HORAS_2, instalada: false });
    const { container } = render(<AvisoVersionNueva />);
    expect(container).toBeEmptyDOMElement();
  });

  it("instalada: recién llegada no molesta (se aplica al cambiar de pantalla)", () => {
    reiniciarEstadoPwa({ versionNueva: true, versionNuevaDesde: Date.now(), instalada: true });
    const { container } = render(<AvisoVersionNueva />);
    expect(container).toBeEmptyDOMElement();
  });

  it("instalada y horas en la misma pantalla: aparece, y se cierra sin recargar", () => {
    vi.useFakeTimers();
    try {
      reiniciarEstadoPwa({ versionNueva: true, versionNuevaDesde: Date.now(), instalada: true });
      render(<AvisoVersionNueva />);
      expect(screen.queryByText(/versión nueva/)).toBeNull();
      act(() => {
        vi.advanceTimersByTime(HORAS_2);
      });
      expect(screen.getByText(/versión nueva/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Actualizar" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
      expect(screen.queryByText(/versión nueva/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("instalada con la versión esperando desde hace horas: aparece al abrir", () => {
    reiniciarEstadoPwa({ versionNueva: true, versionNuevaDesde: Date.now() - HORAS_2 - 1, instalada: true });
    render(<AvisoVersionNueva />);
    expect(screen.getByText(/versión nueva/)).toBeInTheDocument();
  });
});
