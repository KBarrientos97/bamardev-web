import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Control } from "../../lib/nutricion/tipos";
import { CATALOGO, control } from "../../test/nutricionFixtures";
import { Planilla } from "./PlanillaControles";

/**
 * La tarjeta «Controles» con muchos controles (CONTRATO-nutricion-evaluacion-22nov
 * §8): PC por defecto (sin `ResizeObserver` el ancho vale 1046), tablet (720) y
 * teléfono (358) con un `ResizeObserver` de mentira.
 */

vi.setConfig({ testTimeout: 20_000 });

/** Doce controles: uno por mes de 2026, el primero inicial, con el peso bajando y el último con un grado. */
function doce(): Control[] {
  return Array.from({ length: 12 }, (_, i) =>
    control({
      id: i + 1,
      fecha: `2026-${String(i + 1).padStart(2, "0")}-10`,
      inicial: i === 0,
      pesoKg: 100 - i * 2,
      imc: i === 11 ? 29.5 : 38 - i,
      imcGrado: i === 11 ? "SOBREPESO" : "OBESIDAD_2",
      grasaPct: i === 0 ? 40 : null,
      nota: i === 0 ? "Primera visita" : null,
    }),
  );
}

function conAncho(ancho: number) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      cb: (e: { contentRect: { width: number } }[]) => void;
      constructor(cb: (e: { contentRect: { width: number } }[]) => void) {
        this.cb = cb;
      }
      observe() {
        this.cb([{ contentRect: { width: ancho } }]);
      }
      disconnect() {}
      unobserve() {}
    },
  );
}

afterEach(() => vi.unstubAllGlobals());

const encabezados = () => screen.getAllByRole("columnheader").map((h) => h.textContent ?? "");

describe("PC (sin medir el ancho)", () => {
  it("con 12 controles se ven el inicial y los 3 últimos, y la columna de anteriores", () => {
    render(<Planilla controles={doce()} catalogo={CATALOGO} />);
    const t = encabezados().join("|");
    expect(t).toContain("10/01/2026");
    expect(t).toContain("10/10/2026");
    expect(t).toContain("10/12/2026");
    expect(t).not.toContain("10/05/2026");
    expect(screen.getByText("Se ven 4 de 12: el inicial y los 3 últimos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Últimos 3" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("columnheader", { name: /Cambio/ })).toBeInTheDocument();
  });

  it("los renglones van como la hoja, y las tres cintas como el cuerpo: Pecho, Cintura, Cadera", () => {
    render(<Planilla controles={doce()} catalogo={CATALOGO} />);
    const renglones = screen.getAllByRole("rowheader").map((h) => h.textContent ?? "");
    expect(renglones).toEqual(["Peso(kg)", "IMC", "% de grasa", "% de músculo", "Edad corporal(años)", "Grasa visceral", "Pecho(cm)", "Cintura(cm)", "Cadera(cm)", "Nota"]);
  });

  it("«Ver los 8 controles anteriores» pasa a Todos", () => {
    render(<Planilla controles={doce()} catalogo={CATALOGO} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver los 8 controles anteriores" }));
    expect(screen.getByRole("button", { name: "Todos (12)" })).toHaveAttribute("aria-pressed", "true");
    expect(encabezados().join("|")).toContain("10/05/2026");
    expect(screen.queryByRole("button", { name: /controles anteriores/ })).not.toBeInTheDocument();
  });

  it("«Elegir fechas» filtra y avisa cuando no hay nada", () => {
    render(<Planilla controles={doce()} catalogo={CATALOGO} />);
    fireEvent.click(screen.getByRole("button", { name: /Elegir fechas/ }));
    expect(screen.getByLabelText("Desde")).toHaveValue("2026-10-10");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2026-12-10");
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-03-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-04-30" } });
    expect(screen.getByText("Se ven 3 de 12: el inicial y los 2 del 01/03/2026 al 30/04/2026")).toBeInTheDocument();
    expect(encabezados().join("|")).toContain("10/04/2026");
    expect(encabezados().join("|")).not.toContain("10/12/2026");
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-04-30" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-04-30" } });
    expect(screen.getByText("No hay controles en esas fechas: se ve sólo el inicial")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Cambio/ })).not.toBeInTheDocument();
  });

  it("con 3 controles no hay filtro; se ve todo, con el cambio desde el inicial", () => {
    render(<Planilla controles={doce().slice(0, 3)} catalogo={CATALOGO} />);
    expect(screen.queryByRole("group", { name: "Ver" })).not.toBeInTheDocument();
    expect(screen.getByText("Se ven los 3 controles")).toBeInTheDocument();
    expect(screen.getByText(/↓ 4\s+kg/)).toBeInTheDocument();
  });

  it("con un solo control, sólo el inicial y ninguna columna de cambio", () => {
    render(<Planilla controles={doce().slice(0, 1)} catalogo={CATALOGO} />);
    expect(encabezados()).toHaveLength(2);
    expect(screen.queryByRole("columnheader", { name: /Cambio/ })).not.toBeInTheDocument();
  });

  it("con onAbrir, la fecha corrige ese control y la pista está adentro; sin onAbrir no hay «Corregir»", () => {
    const abrir = vi.fn();
    const { unmount } = render(<Planilla controles={doce()} catalogo={CATALOGO} onAbrir={abrir} />);
    expect(screen.getByText("Tocá una fecha para corregir ese control.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Corregir el control del 10/12/2026" }));
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ id: 12 }));
    fireEvent.click(screen.getByRole("button", { name: "Corregir el control del 10/01/2026" }));
    expect(abrir).toHaveBeenLastCalledWith(expect.objectContaining({ id: 1 }));
    unmount();
    render(<Planilla controles={doce()} catalogo={CATALOGO} />);
    expect(screen.queryByRole("button", { name: /Corregir/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Tocá una fecha/)).not.toBeInTheDocument();
  });

  it("el grado va en la celda sin cortarse (sin alto fijo ni «…»)", () => {
    const { container } = render(<Planilla controles={doce()} catalogo={CATALOGO} />);
    expect(screen.getAllByText("Sobrepeso").length).toBeGreaterThan(0);
    expect(container.innerHTML).not.toContain("truncate");
    expect(container.innerHTML).not.toContain("text-ellipsis");
  });
});

describe("tablet (720)", () => {
  it("se ven el inicial y los 2 últimos", () => {
    conAncho(720);
    render(<Planilla controles={doce()} catalogo={CATALOGO} />);
    expect(screen.getByRole("button", { name: "Últimos 2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Se ven 3 de 12: el inicial y los 2 últimos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver los 9 controles anteriores" })).toBeInTheDocument();
    expect(encabezados().join("|")).not.toContain("10/10/2026");
  });
});

describe("teléfono (358)", () => {
  const abrirTelefono = (onAbrir?: (c: Control) => void, controles = doce()) => {
    conAncho(358);
    return render(<Planilla controles={controles} catalogo={CATALOGO} onAbrir={onAbrir} />);
  };

  it("arranca comparando el inicial con el último", () => {
    abrirTelefono();
    expect(screen.getByText("Elegí dos fechas y mirá cuánto cambió.")).toBeInTheDocument();
    expect(screen.getByLabelText("Desde")).toHaveDisplayValue("10/01/2026 · Inicial");
    expect(screen.getByLabelText("Hasta")).toHaveDisplayValue("10/12/2026 · Último");
    expect(screen.getByText("Del 10/01/2026 al 10/12/2026: 11 meses")).toBeInTheDocument();
    expect(screen.getByText(/↓ 22\s+kg/)).toBeInTheDocument();
    expect(screen.getByText("Sin medir en esas fechas: % de músculo, Edad corporal, Grasa visceral, Pecho, Cintura y Cadera.")).toBeInTheDocument();
    expect(screen.getByText("Nota del 10/01/2026:")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("cambiar los selectores cambia los números, la misma fecha avisa y al revés se avisa", () => {
    abrirTelefono();
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "5" } });
    expect(screen.getByText(/↓ 12\s+kg/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "5" } });
    expect(screen.getByText("Elegiste la misma fecha dos veces: no hay cambios que mostrar.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "1" } });
    expect(screen.getByText("Pusiste las fechas al revés: se comparan de la más vieja a la más nueva.")).toBeInTheDocument();
    expect(screen.getByText("Del 10/02/2026 al 10/06/2026: 4 meses")).toBeInTheDocument();
  });

  it("«Ver la tabla completa» y «Comparar dos fechas» van y vuelven", () => {
    abrirTelefono();
    fireEvent.click(screen.getByRole("button", { name: /Ver la tabla completa/ }));
    const tabla = screen.getByRole("table");
    expect(within(tabla).getAllByRole("columnheader")).toHaveLength(13);
    expect(screen.queryByRole("columnheader", { name: /Cambio/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Comparar dos fechas/ }));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Desde")).toBeInTheDocument();
  });

  it("con onAbrir, «Corregir este control» abre el de ese selector, y la tabla también", () => {
    const abrir = vi.fn();
    abrirTelefono(abrir);
    const botones = screen.getAllByRole("button", { name: /Corregir el control del/ });
    expect(botones).toHaveLength(2);
    fireEvent.click(botones[0]);
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    fireEvent.click(screen.getByRole("button", { name: /Ver la tabla completa/ }));
    expect(screen.getByText("Tocá una fecha para corregir ese control.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Corregir el control del 10/12/2026" }));
    expect(abrir).toHaveBeenLastCalledWith(expect.objectContaining({ id: 12 }));
  });

  it("sin onAbrir no hay ningún «Corregir»", () => {
    abrirTelefono();
    expect(screen.queryByRole("button", { name: /Corregir/ })).not.toBeInTheDocument();
  });

  it("con un solo control, la tabla chica sin comparar", () => {
    abrirTelefono(undefined, doce().slice(0, 1));
    expect(screen.queryByText("Elegí dos fechas y mirá cuánto cambió.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Comparar dos fechas/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("table")).getAllByRole("columnheader")).toHaveLength(2);
  });
});

describe("las notas largas", () => {
  it("se pliegan y se abren todas con un botón (una nota larga estiraba la tabla)", () => {
    const larga = "Refiere comer a deshoras y picotear entre comidas; se le indica ordenar los horarios. ".repeat(4);
    const lista = doce().map((c, i) => (i === 11 ? { ...c, nota: larga } : c));
    render(<Planilla controles={lista} catalogo={CATALOGO} />);
    const boton = screen.getByRole("button", { name: "Ver las notas enteras" });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(larga.trim(), { normalizer: (s) => s.trim() })).toHaveClass("line-clamp-5");
    expect(screen.getByText("Primera visita")).not.toHaveClass("line-clamp-5");
    fireEvent.click(boton);
    expect(screen.getByRole("button", { name: "Plegar las notas" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(larga.trim(), { normalizer: (s) => s.trim() })).not.toHaveClass("line-clamp-5");
  });

  it("con notas cortas no hay botón", () => {
    render(<Planilla controles={doce()} catalogo={CATALOGO} />);
    expect(screen.queryByRole("button", { name: /notas enteras/ })).not.toBeInTheDocument();
  });
});
