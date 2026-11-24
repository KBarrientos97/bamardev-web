import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avisaAlCerrar, historialDePrueba } from "../test/historial";
import { useAtrasConCambios } from "./useAtrasConCambios";
import { useSalidaConCambios } from "./useSalidaConCambios";

/**
 * Salir con cambios sin guardar (23-nov): con `todaLaApp`, el menú lateral (un
 * enlace de AFUERA de la pantalla) y el atrás / adelante del navegador también
 * preguntan, sin desmontar la pantalla ni sumar entradas al historial. Sin la
 * opción, todo como antes (Notas y Pasar lista).
 */

function Formulario({ cambios, todaLaApp }: { cambios: boolean; todaLaApp?: boolean }) {
  const salida = useSalidaConCambios(cambios, todaLaApp ? { todaLaApp } : undefined);
  const [escrito, setEscrito] = useState("");
  return (
    <div onClickCapture={salida.alClicEnEnlace}>
      <Link to="/volver">Volver</Link>
      <input aria-label="Nombre" value={escrito} onChange={(e) => setEscrito(e.target.value)} />
      {salida.salida && (
        <div role="dialog" aria-label="¿Salir sin guardar?">
          <button onClick={salida.quedarse}>Seguir</button>
          <button onClick={salida.salirSinGuardar}>Salir sin guardar</button>
          <button onClick={() => void salida.guardarYSalir(async () => true)}>Guardar y salir</button>
        </div>
      )}
    </div>
  );
}

function Donde() {
  return <p data-testid="donde">{useLocation().pathname}</p>;
}

function App(props: { cambios: boolean; todaLaApp?: boolean }) {
  return (
    <MemoryRouter initialEntries={["/formulario"]}>
      {/* El menú lateral: afuera del contenedor de la pantalla. */}
      <nav>
        <Link to="/seguimiento">Seguimiento</Link>
        <a href="/planilla.pdf" download>
          Bajar planilla
        </a>
        <a href="/seguimiento" target="_blank">
          En otra pestaña
        </a>
      </nav>
      <Donde />
      <Routes>
        <Route path="/formulario" element={<Formulario {...props} />} />
        <Route path="*" element={<p>Otra pantalla</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const pregunta = () => screen.queryByRole("dialog", { name: "¿Salir sin guardar?" });
const donde = () => screen.getByTestId("donde").textContent;

/** Si el clic llegó al final frenado (sin evitar que jsdom intente navegar de verdad). */
function clicFrenado(el: HTMLElement, opciones: MouseEventInit = {}) {
  let frenado: boolean | null = null;
  const mirar = (e: Event) => {
    frenado = e.defaultPrevented;
    e.preventDefault();
  };
  window.addEventListener("click", mirar);
  fireEvent.click(el, opciones);
  window.removeEventListener("click", mirar);
  return frenado;
}

let h: ReturnType<typeof historialDePrueba>;
beforeEach(() => {
  h = historialDePrueba(5);
});
afterEach(() => {
  h.limpiar();
  vi.restoreAllMocks();
});

describe("con `todaLaApp`: un enlace de afuera de la pantalla", () => {
  it("con cambios pregunta y no se va; «Seguir» se queda; «Salir sin guardar» va", () => {
    render(<App cambios todaLaApp />);
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Lo escrito" } });

    expect(clicFrenado(screen.getByRole("link", { name: "Seguimiento" }))).toBe(true);
    expect(pregunta()).toBeInTheDocument();
    expect(donde()).toBe("/formulario");

    fireEvent.click(screen.getByRole("button", { name: "Seguir" }));
    expect(pregunta()).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Lo escrito");

    fireEvent.click(screen.getByRole("link", { name: "Seguimiento" }));
    fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));
    expect(donde()).toBe("/seguimiento");
    expect(screen.getByText("Otra pantalla")).toBeInTheDocument();
  });

  it("sin cambios se va directo", () => {
    render(<App cambios={false} todaLaApp />);
    fireEvent.click(screen.getByRole("link", { name: "Seguimiento" }));
    expect(pregunta()).not.toBeInTheDocument();
    expect(donde()).toBe("/seguimiento");
  });

  it("«Guardar y salir» va adonde iba el enlace", async () => {
    render(<App cambios todaLaApp />);
    fireEvent.click(screen.getByRole("link", { name: "Seguimiento" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar y salir" })));
    expect(donde()).toBe("/seguimiento");
  });

  it("el de adentro pregunta una sola vez (lo frena el documento antes que el contenedor)", () => {
    render(<App cambios todaLaApp />);
    fireEvent.click(screen.getByRole("link", { name: "Volver" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));
    expect(donde()).toBe("/volver");
  });

  it("no frena una descarga, otra pestaña ni un clic con Ctrl o el botón del medio", () => {
    render(<App cambios todaLaApp />);
    expect(clicFrenado(screen.getByRole("link", { name: "Bajar planilla" }))).toBe(false);
    expect(clicFrenado(screen.getByRole("link", { name: "En otra pestaña" }))).toBe(false);
    expect(clicFrenado(screen.getByRole("link", { name: "Seguimiento" }), { ctrlKey: true })).toBe(false);
    expect(clicFrenado(screen.getByRole("link", { name: "Seguimiento" }), { button: 1 })).toBe(false);
    expect(pregunta()).not.toBeInTheDocument();
    expect(donde()).toBe("/formulario");
  });
});

describe("con `todaLaApp`: el atrás y el adelante del navegador", () => {
  it("atrás con cambios: el router no se entera, se vuelve a la entrada y pregunta; «Salir sin guardar» repite el viaje", () => {
    render(<App cambios todaLaApp />);
    h.viajar(4);
    expect(h.router).not.toHaveBeenCalled();
    expect(h.go).toHaveBeenCalledWith(1);
    // Todavía no: la pregunta sale cuando la dirección ya volvió a la del formulario.
    expect(pregunta()).not.toBeInTheDocument();
    h.viajar(5);
    expect(h.router).not.toHaveBeenCalled();
    expect(pregunta()).toBeInTheDocument();
    expect(donde()).toBe("/formulario");

    fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));
    expect(h.go).toHaveBeenLastCalledWith(-1);
    // El viaje de «Salir sin guardar» sí lo ve el router.
    h.viajar(4);
    expect(h.router).toHaveBeenCalledTimes(1);
    expect(h.go).toHaveBeenCalledTimes(2);
  });

  it("adelante: lo mismo, al revés", () => {
    render(<App cambios todaLaApp />);
    h.viajar(7);
    expect(h.go).toHaveBeenCalledWith(-2);
    h.viajar(5);
    expect(pregunta()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));
    expect(h.go).toHaveBeenLastCalledWith(2);
  });

  it("«Seguir» se queda con lo escrito, y el siguiente atrás vuelve a preguntar", () => {
    render(<App cambios todaLaApp />);
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Lo escrito" } });
    h.viajar(4);
    h.viajar(5);
    fireEvent.click(screen.getByRole("button", { name: "Seguir" }));
    expect(pregunta()).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Lo escrito");
    h.viajar(4);
    h.viajar(5);
    expect(pregunta()).toBeInTheDocument();
    expect(h.router).not.toHaveBeenCalled();
  });

  it("dos atrás seguidos con la pregunta abierta: una sola pregunta y el router sin enterarse", () => {
    render(<App cambios todaLaApp />);
    h.viajar(4);
    h.viajar(5);
    h.viajar(4);
    h.viajar(5);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(h.router).not.toHaveBeenCalled();
    expect(h.go.mock.calls).toEqual([[1], [1]]);
    fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));
    expect(h.go).toHaveBeenLastCalledWith(-1);
    h.viajar(4);
    expect(h.router).toHaveBeenCalledTimes(1);
  });

  it("si eligió salir mientras volvía de otro atrás, no vuelve a preguntar y se va", () => {
    render(<App cambios todaLaApp />);
    h.viajar(4);
    h.viajar(5);
    h.viajar(4); // otro atrás con la pregunta abierta: la vuelta está en camino…
    fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" })); // …y eligió salir
    h.viajar(5); // llega la vuelta: se traga, sin otra pregunta
    expect(pregunta()).not.toBeInTheDocument();
    expect(h.router).not.toHaveBeenCalled();
    h.viajar(4); // y el viaje de salir lo ve el router
    expect(h.router).toHaveBeenCalledTimes(1);
  });

  it("«Guardar y salir» después de un atrás termina donde llevaba el atrás", async () => {
    render(<App cambios todaLaApp />);
    h.viajar(3);
    h.viajar(5);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar y salir" })));
    expect(h.go).toHaveBeenLastCalledWith(-2);
  });

  it("una entrada sin `idx` se toma como un atrás", () => {
    window.history.replaceState(null, "");
    render(<App cambios todaLaApp />);
    h.viajar(null);
    expect(h.go).toHaveBeenCalledWith(1);
    h.viajar(null);
    expect(pregunta()).toBeInTheDocument();
  });

  it("sin cambios el atrás pasa derecho al router", () => {
    render(<App cambios={false} todaLaApp />);
    h.viajar(4);
    expect(h.router).toHaveBeenCalledTimes(1);
    expect(h.go).not.toHaveBeenCalled();
    expect(pregunta()).not.toBeInTheDocument();
  });

  it("el aviso del navegador al cerrar o recargar, sólo con cambios", () => {
    const { rerender } = render(<App cambios todaLaApp />);
    expect(avisaAlCerrar()).toBe(true);
    rerender(<App cambios={false} todaLaApp />);
    expect(avisaAlCerrar()).toBe(false);
  });
});

describe("sin `todaLaApp` (Notas, Pasar lista): como antes", () => {
  it("no registra nada en el documento ni en el historial", () => {
    const enVentana = vi.spyOn(window, "addEventListener");
    const enDocumento = vi.spyOn(document, "addEventListener");
    render(<App cambios />);
    expect(enVentana.mock.calls.map((c) => c[0])).not.toContain("popstate");
    expect(enDocumento.mock.calls.map((c) => c[0])).not.toContain("click");
    // El aviso al cerrar sigue como siempre.
    expect(enVentana.mock.calls.map((c) => c[0])).toContain("beforeunload");
  });

  it("el menú de afuera se va sin preguntar y el atrás pasa al router; los enlaces de adentro sí preguntan", () => {
    render(<App cambios />);
    h.viajar(4);
    expect(h.router).toHaveBeenCalledTimes(1);
    expect(h.go).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Volver" }));
    expect(pregunta()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Seguir" }));
    fireEvent.click(screen.getByRole("link", { name: "Seguimiento" }));
    expect(pregunta()).not.toBeInTheDocument();
    expect(donde()).toBe("/seguimiento");
  });
});

describe("useAtrasConCambios", () => {
  function Prueba({ activo, alIntentar }: { activo: boolean; alIntentar: (irIgual: () => void) => void }) {
    useAtrasConCambios(activo, alIntentar);
    const navigate = useNavigate();
    // Como un `replace` del router: cambia la ubicación (y acá también el idx de la entrada).
    const reemplazar = () => {
      window.history.replaceState({ idx: 8 }, "");
      navigate("/otra", { replace: true });
    };
    return <button onClick={reemplazar}>Reemplazar</button>;
  }
  const montar = (activo: boolean, alIntentar = vi.fn()) => {
    const r = render(
      <MemoryRouter>
        <Prueba activo={activo} alIntentar={alIntentar} />
      </MemoryRouter>,
    );
    const cambiar = (a: boolean) =>
      r.rerender(
        <MemoryRouter>
          <Prueba activo={a} alIntentar={alIntentar} />
        </MemoryRouter>,
      );
    return { alIntentar, cambiar };
  };

  it("apagado no registra nada ni atiende el atrás", () => {
    const enVentana = vi.spyOn(window, "addEventListener");
    montar(false);
    expect(enVentana.mock.calls.map((c) => c[0])).not.toContain("popstate");
    h.viajar(4);
    expect(h.router).toHaveBeenCalledTimes(1);
    expect(h.go).not.toHaveBeenCalled();
  });

  it("al apagarse deja de atender: el atrás vuelve a ser del router", () => {
    const { cambiar, alIntentar } = montar(true);
    cambiar(false);
    h.viajar(4);
    expect(h.router).toHaveBeenCalledTimes(1);
    expect(h.go).not.toHaveBeenCalled();
    expect(alIntentar).not.toHaveBeenCalled();
  });

  it("al volver a prenderse arranca de cero (una vuelta que quedó en camino no se confunde)", () => {
    const { cambiar, alIntentar } = montar(true);
    h.viajar(4); // se va a deshacer…
    cambiar(false); // …y se apaga antes de que llegue la vuelta
    cambiar(true);
    h.viajar(4); // un atrás nuevo: se deshace, no se toma por la vuelta
    expect(h.go.mock.calls).toEqual([[1], [1]]);
    expect(alIntentar).not.toHaveBeenCalled();
    h.viajar(5);
    expect(alIntentar).toHaveBeenCalledTimes(1);
  });

  it("toma el idx nuevo cuando la ubicación cambia sin salir (un `replace`)", () => {
    const { alIntentar } = montar(true);
    fireEvent.click(screen.getByRole("button", { name: "Reemplazar" }));
    h.viajar(7);
    expect(h.go).toHaveBeenCalledWith(1);
    h.viajar(8);
    expect(alIntentar).toHaveBeenCalledTimes(1);
  });

  it("con dos prendidos atiende el último; al apagarse, vuelve a atender el anterior", () => {
    const primero = vi.fn();
    const segundo = vi.fn();
    const Dos = ({ otro }: { otro: boolean }) => (
      <MemoryRouter>
        <Prueba activo alIntentar={primero} />
        <Prueba activo={otro} alIntentar={segundo} />
      </MemoryRouter>
    );
    const { rerender } = render(<Dos otro />);
    h.viajar(4);
    h.viajar(5);
    expect(segundo).toHaveBeenCalledTimes(1);
    expect(primero).not.toHaveBeenCalled();
    rerender(<Dos otro={false} />);
    h.viajar(4);
    h.viajar(5);
    expect(primero).toHaveBeenCalledTimes(1);
    expect(h.router).not.toHaveBeenCalled();
  });

  it("`irIgual` vale una sola vez", () => {
    const { alIntentar } = montar(true);
    h.viajar(4);
    h.viajar(5);
    const irIgual = alIntentar.mock.calls[0][0] as () => void;
    irIgual();
    irIgual();
    expect(h.go.mock.calls).toEqual([[1], [-1]]);
  });
});
