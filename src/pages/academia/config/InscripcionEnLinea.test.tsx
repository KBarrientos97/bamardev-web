import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Carrera, GrupoResumen } from "../../../lib/academia/tipos";
import { ajustesDePrueba } from "../../../test/academiaFixtures";

/**
 * C7 · la tarjeta «Inscripción en línea»: el ✔/✖ de cada condición y el botón
 * que lleva a la pantalla que la corrige.
 */

const sesion = vi.hoisted(() => ({ features: ["academia", "preinscripcion_online"] as string[] }));

vi.mock("../../../store/AuthContext", async () => {
  const { SESION_ADMIN: s } = await import("../../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, negocio: { ...s.negocio, features: sesion.features }, puede: () => true }) };
});

vi.mock("../../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { grupos: vi.fn() } };
});

import { apiAcademia } from "../../../lib/academia/apiAcademia";
import { InscripcionEnLinea } from "./InscripcionEnLinea";

const curso = (extra: Partial<Carrera> = {}) => ({ id: 1, nombre: "Barbería", activa: true, publicarEnPagina: true, ...extra }) as Carrera;
const grupo = (extra: Partial<GrupoResumen> = {}) =>
  ({ id: 7, inscripcionAbierta: true, cancelado: false, estado: "EN_CURSO", ...extra }) as GrupoResumen;

beforeEach(() => {
  vi.clearAllMocks();
  sesion.features = ["academia", "preinscripcion_online"];
  vi.mocked(apiAcademia.grupos).mockResolvedValue({ items: [grupo()], total: 1, page: 1, pageSize: 100 });
});

async function montar(props: Partial<Parameters<typeof InscripcionEnLinea>[0]> = {}) {
  const onActivarRecibir = vi.fn();
  render(
    <MemoryRouter>
      <InscripcionEnLinea
        ajustes={ajustesDePrueba({ preinscripcionActiva: true, paginaPublicada: true })}
        cursos={[curso()]}
        onActivarRecibir={onActivarRecibir}
        {...props}
      />
    </MemoryRouter>,
  );
  await act(async () => {});
  return { tarjeta: screen.getByRole("group", { name: "Inscripción en línea" }), onActivarRecibir };
}

describe("C7 · tarjeta «Inscripción en línea»", () => {
  it("con todo en orden: cinco ✔ y «Todo listo», sin botones para arreglar nada", async () => {
    const { tarjeta } = await montar();
    expect(within(tarjeta).getAllByRole("listitem")).toHaveLength(5);
    expect(within(tarjeta).getAllByText("Listo:")).toHaveLength(5);
    expect(within(tarjeta).queryByText("Falta:")).not.toBeInTheDocument();
    expect(within(tarjeta).getByTestId("resumen-en-linea")).toHaveTextContent("Todo listo");
    expect(within(tarjeta).queryByRole("link")).not.toBeInTheDocument();
    expect(within(tarjeta).queryByRole("button")).not.toBeInTheDocument();
  });

  it("ronda 1 · W12: si el backend no dice si la página está publicada, son cuatro y el texto no dice «las cinco»", async () => {
    const { tarjeta } = await montar({ ajustes: ajustesDePrueba({ preinscripcionActiva: true, paginaPublicada: undefined }) });
    expect(within(tarjeta).getAllByRole("listitem")).toHaveLength(4);
    expect(tarjeta).toHaveTextContent("tienen que estar las cuatro");
    expect(tarjeta).not.toHaveTextContent("las cinco");
  });

  it("cada condición que falta lleva a su pantalla: Cursos, Mi página y Calendario", async () => {
    vi.mocked(apiAcademia.grupos).mockResolvedValue({ items: [grupo({ inscripcionAbierta: false })], total: 1, page: 1, pageSize: 100 });
    const { tarjeta } = await montar({
      ajustes: ajustesDePrueba({ preinscripcionActiva: true, paginaPublicada: false }),
      cursos: [curso({ publicarEnPagina: false })],
    });
    expect(within(tarjeta).getByTestId("resumen-en-linea")).toHaveTextContent("Faltan 3 cosas");
    expect(within(tarjeta).getByRole("link", { name: /Ir a Cursos/ })).toHaveAttribute("href", "/configuracion/carreras");
    expect(within(tarjeta).getByRole("link", { name: /Ir a Mi página/ })).toHaveAttribute("href", "/mi-pagina");
    expect(within(tarjeta).getByRole("link", { name: /Ir al Calendario/ })).toHaveAttribute("href", "/academia/calendario");
    expect(within(tarjeta).getAllByText("Falta:")).toHaveLength(3);
  });

  it("«Recibir inscripciones» apagado se activa desde la misma tarjeta", async () => {
    const { tarjeta, onActivarRecibir } = await montar({ ajustes: ajustesDePrueba({ preinscripcionActiva: false, paginaPublicada: true }) });
    expect(within(tarjeta).getByTestId("resumen-en-linea")).toHaveTextContent("Falta 1 cosa");
    fireEvent.click(within(tarjeta).getByRole("button", { name: "Activar" }));
    expect(onActivarRecibir).toHaveBeenCalledTimes(1);
  });

  it("sin la feature en el plan lo dice, sin enlace (lo cambia BamarDev)", async () => {
    sesion.features = ["academia"];
    const { tarjeta } = await montar();
    expect(within(tarjeta).getByText(/Tu plan no la incluye/)).toBeInTheDocument();
    expect(within(tarjeta).getByText("Tu plan incluye la inscripción en línea").parentElement).toHaveTextContent(/^Falta: /);
    expect(within(tarjeta).queryByRole("link")).not.toBeInTheDocument();
  });

  it("si no se pueden pedir los grupos, la tarjeta sigue y ese renglón queda sin comprobar", async () => {
    vi.mocked(apiAcademia.grupos).mockRejectedValue(new Error("Sin conexión"));
    const { tarjeta } = await montar();
    expect(within(tarjeta).getByText("No se pudieron comprobar los grupos.")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Un grupo con la inscripción abierta").parentElement).toHaveTextContent(/^Sin comprobar: /);
    // Lo que no se sabe no cuenta como falta: no se anuncia «Faltan …».
    expect(within(tarjeta).queryByText("Falta:")).not.toBeInTheDocument();
    expect(within(tarjeta).queryByTestId("resumen-en-linea")).not.toBeInTheDocument();
  });
});
