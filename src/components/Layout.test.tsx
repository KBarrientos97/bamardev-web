import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El menú de Inventario según el rubro.
 *
 * En farmacia, Inventario es un grupo cuya primera pantalla se llama
 * "Dashboard", como Medicamentos o Categorías. En bamardev-restaurant nada de
 * eso existe: Inventario sigue siendo un ítem solo que abre su Dashboard, y la
 * barra tiene que quedar exactamente como estaba.
 */

const sesion = vi.hoisted(() => ({
  rubro: "FARMACIA" as string,
  features: [] as string[],
  rol: "ADMIN" as string,
  /** Plan Emprendedor: sin cupo (lo de siempre) salvo en sus casos. */
  cupo: null as import("../types").CupoEstado | null,
}));

vi.mock("../store/AuthContext", async () => {
  const { puedeVer } = await import("../lib/permisos");
  // Los permisos de la plantilla de ese rol: el menú se arma sólo con ellos.
  const { permisosDe } = await import("../test/sesiones");
  return {
    useAuth: () => ({
      usuario: { id: 7, nombre: "Regente", username: "admin", rol: sesion.rol, rolNombre: "Regente general" },
      negocio: { id: 3, nombre: "Negocio de prueba" },
      licencia: null,
      cupo: sesion.cupo,
      logout: () => {},
      rubro: sesion.rubro,
      puede: (s: Parameters<typeof puedeVer>[1]) =>
        puedeVer(
          {
            ...permisosDe(sesion.rol as Parameters<typeof permisosDe>[0]),
            features: sesion.features,
            rubro: sesion.rubro,
          },
          s,
        ),
    }),
  };
});

import { fechaNegocio } from "../lib/agenda/horaAgenda";
import { CUPO_ILIMITADO, cupoEmprendedor } from "../test/cupoFixtures";
import Layout from "./Layout";

function arbol(ruta: string) {
  return (
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<p>pantalla</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function abrir(ruta: string) {
  render(arbol(ruta));
  // La barra de escritorio; el cajón del celular sólo existe abierto.
  return within(screen.getByRole("navigation"));
}

beforeEach(() => {
  sesion.rubro = "FARMACIA";
  sesion.features = [];
  sesion.rol = "ADMIN";
  sesion.cupo = null;
  localStorage.clear();
});

describe("Almacenes según el rubro", () => {
  // La sección existe con varias sucursales: es la feature del plan.
  beforeEach(() => {
    sesion.features = ["multi_almacen"];
  });

  it("en farmacia el ítem se llama Sucursales", () => {
    const nav = abrir("/inventario/almacenes");
    expect(nav.getByRole("link", { name: "Sucursales" })).toHaveAttribute(
      "href",
      "/inventario/almacenes",
    );
    expect(nav.queryByRole("link", { name: "Almacenes" })).not.toBeInTheDocument();
  });

  it("farmacia con varias sucursales: Transferir mercadería, debajo de Movimientos", () => {
    const nav = abrir("/inventario/movimientos");
    expect(nav.getByRole("link", { name: "Transferir mercadería" })).toHaveAttribute(
      "href",
      "/inventario/movimientos/transferencia",
    );
  });

  it("sin el plan de varias sucursales no aparece", () => {
    sesion.features = ["inventario"];
    const nav = abrir("/inventario/movimientos");
    expect(nav.queryByRole("link", { name: "Transferir mercadería" })).not.toBeInTheDocument();
  });

  it("en el restaurante no existe", () => {
    sesion.rubro = "RESTAURANTE";
    const nav = abrir("/inventario/movimientos");
    expect(nav.queryByRole("link", { name: "Transferir mercadería" })).not.toBeInTheDocument();
  });

  it("en el restaurante sigue siendo Almacenes", () => {
    sesion.rubro = "RESTAURANTE";
    const nav = abrir("/inventario/almacenes");
    expect(nav.getByRole("link", { name: "Almacenes" })).toBeInTheDocument();
    expect(nav.queryByRole("link", { name: "Sucursales" })).not.toBeInTheDocument();
  });
});

describe("farmacia: Dashboard es la primera pantalla de Inventario", () => {
  it("aparece como sub-ítem y lleva a /inventario", () => {
    const nav = abrir("/inventario");
    expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/inventario");
    expect(nav.getByRole("link", { name: "Inventario" })).toHaveAttribute("href", "/inventario");
  });

  it("en /inventario el marcado es Dashboard, no los dos", () => {
    const nav = abrir("/inventario");
    expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Dashboard" }).className).toContain(
      "bg-barra-activo text-barra-texto",
    );
    // Inventario queda como título del grupo: en blanco, sin el bloque.
    expect(nav.getByRole("link", { name: "Inventario" })).not.toHaveAttribute("aria-current");
    expect(nav.getByRole("link", { name: "Inventario" }).className).not.toMatch(
      /(^| )bg-barra-activo/,
    );
  });

  it("en Medicamentos se marca Medicamentos y Dashboard se apaga", () => {
    const nav = abrir("/inventario/productos");
    expect(nav.getByRole("link", { name: "Medicamentos" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(nav.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });
});

describe("bamardev-restaurant: Inventario queda como estaba", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
  });

  it("no hay sub-ítem Dashboard", () => {
    const nav = abrir("/inventario");
    expect(nav.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
  });

  it("Inventario se marca como siempre en /inventario, y sólo ahí", () => {
    const nav = abrir("/inventario");
    expect(nav.getByRole("link", { name: "Inventario" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Artículos" })).not.toHaveAttribute("aria-current");
  });

  it("en Artículos Inventario no queda encendido", () => {
    const nav = abrir("/inventario/productos");
    expect(nav.getByRole("link", { name: "Inventario" })).not.toHaveAttribute("aria-current");
    expect(nav.getByRole("link", { name: "Artículos" })).toHaveAttribute("aria-current", "page");
  });
});

/**
 * Los grupos se despliegan y se pliegan. Las pruebas van por los atributos
 * ARIA y no por las clases: es lo que un lector de pantalla (y el usuario con
 * teclado) de verdad recibe.
 */
describe("grupos colapsables", () => {
  const flecha = (nav: ReturnType<typeof abrir>, grupo: string) =>
    nav.getByRole("button", { name: `Submenú de ${grupo}` });

  it("fuera del grupo arranca cerrado y sus pantallas no se alcanzan", () => {
    const nav = abrir("/pos");
    expect(flecha(nav, "Inventario")).toHaveAttribute("aria-expanded", "false");
    expect(nav.queryByRole("link", { name: "Categorías" })).not.toBeInTheDocument();
    // Cerrado queda inert: Tab no entra a sus enlaces.
    const panel = document.getElementById(
      flecha(nav, "Inventario").getAttribute("aria-controls")!,
    );
    expect(panel).toHaveAttribute("inert");
  });

  it("la flecha despliega y vuelve a plegar, sin navegar", () => {
    const nav = abrir("/pos");
    fireEvent.click(flecha(nav, "Inventario"));
    expect(flecha(nav, "Inventario")).toHaveAttribute("aria-expanded", "true");
    expect(nav.getByRole("link", { name: "Categorías" })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: "Punto de venta" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    fireEvent.click(flecha(nav, "Inventario"));
    expect(flecha(nav, "Inventario")).toHaveAttribute("aria-expanded", "false");
    expect(nav.queryByRole("link", { name: "Categorías" })).not.toBeInTheDocument();
  });

  it("el nombre del grupo lleva a su pantalla y lo despliega", () => {
    const nav = abrir("/pos");
    fireEvent.click(nav.getByRole("link", { name: "Inventario" }));
    expect(flecha(nav, "Inventario")).toHaveAttribute("aria-expanded", "true");
    expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });

  it("por URL directa abre todo el camino hasta la pantalla", () => {
    const nav = abrir("/inventario/movimientos/ingreso");
    expect(flecha(nav, "Inventario")).toHaveAttribute("aria-expanded", "true");
    expect(flecha(nav, "Movimientos")).toHaveAttribute("aria-expanded", "true");
    expect(nav.getByRole("link", { name: "Ingreso de mercadería" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Movimientos contiene la pantalla, pero no ES la pantalla.
    expect(nav.getByRole("link", { name: "Movimientos" })).not.toHaveAttribute("aria-current");
  });

  it("al navegar a una pantalla de un grupo cerrado, el grupo se abre", () => {
    const nav = abrir("/pos");
    fireEvent.click(flecha(nav, "Inventario"));
    expect(flecha(nav, "Movimientos")).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(nav.getByRole("link", { name: "Movimientos" }));
    expect(flecha(nav, "Movimientos")).toHaveAttribute("aria-expanded", "true");
    expect(nav.getByRole("link", { name: "Salida de mercadería" })).toBeInTheDocument();
  });

  it("se pueden tener varios grupos abiertos a la vez", () => {
    const nav = abrir("/inventario/movimientos");
    fireEvent.click(nav.getByRole("link", { name: "Medicamentos" }));
    expect(flecha(nav, "Inventario")).toHaveAttribute("aria-expanded", "true");
    expect(flecha(nav, "Movimientos")).toHaveAttribute("aria-expanded", "true");
  });

  it("con teclado: flecha derecha abre, izquierda cierra, abajo baja de fila", () => {
    const nav = abrir("/pos");
    const inventario = nav.getByRole("link", { name: "Inventario" });
    inventario.focus();
    fireEvent.keyDown(inventario, { key: "ArrowRight" });
    expect(flecha(nav, "Inventario")).toHaveAttribute("aria-expanded", "true");
    // Ya abierto, la derecha entra al primer hijo.
    fireEvent.keyDown(inventario, { key: "ArrowRight" });
    expect(nav.getByRole("link", { name: "Dashboard" })).toHaveFocus();
    // Desde un hijo, la izquierda vuelve al padre; y ahí lo cierra.
    fireEvent.keyDown(nav.getByRole("link", { name: "Dashboard" }), { key: "ArrowLeft" });
    expect(inventario).toHaveFocus();
    fireEvent.keyDown(inventario, { key: "ArrowLeft" });
    expect(flecha(nav, "Inventario")).toHaveAttribute("aria-expanded", "false");
    // Cerrado, abajo salta el grupo entero.
    fireEvent.keyDown(inventario, { key: "ArrowDown" });
    expect(nav.getByRole("link", { name: "Cuentas por cobrar" })).toHaveFocus();
  });
});

describe("lo abierto se recuerda", () => {
  it("entre recargas, por negocio y usuario", () => {
    const { unmount } = render(arbol("/pos"));
    fireEvent.click(screen.getByRole("button", { name: "Submenú de Inventario" }));
    unmount();

    expect(JSON.parse(localStorage.getItem("bamardev.menu.abiertos.3.7")!)).toMatchObject({
      "inventario:/inventario": true,
    });

    render(arbol("/pos"));
    expect(screen.getByRole("button", { name: "Submenú de Inventario" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("un grupo cerrado a mano sigue cerrado al volver", () => {
    const { unmount } = render(arbol("/inventario/productos"));
    fireEvent.click(screen.getByRole("button", { name: "Submenú de Inventario" }));
    unmount();
    render(arbol("/pos"));
    expect(screen.getByRole("button", { name: "Submenú de Inventario" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("sin localStorage el menú funciona igual", () => {
    const leer = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const escribir = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    try {
      const nav = abrir("/inventario/productos");
      const boton = nav.getByRole("button", { name: "Submenú de Inventario" });
      expect(boton).toHaveAttribute("aria-expanded", "true");
      fireEvent.click(boton);
      expect(boton).toHaveAttribute("aria-expanded", "false");
    } finally {
      leer.mockRestore();
      escribir.mockRestore();
    }
  });
});

describe("el árbol según permisos y rubro", () => {
  it("separa los bloques con su rótulo", () => {
    const nav = abrir("/pos");
    expect(nav.getByRole("list", { name: "Vender" })).toBeInTheDocument();
    expect(nav.getByRole("list", { name: "Stock" })).toBeInTheDocument();
    expect(nav.getByRole("list", { name: "Administración" })).toBeInTheDocument();
    expect(
      within(nav.getByRole("list", { name: "Vender" })).getByRole("link", {
        name: "Buscar medicamento",
      }),
    ).toBeInTheDocument();
  });

  it("con un solo bloque no hay rótulos", () => {
    sesion.rol = "REPARTIDOR";
    const nav = abrir("/reparto");
    expect(nav.getByRole("link", { name: "Mis entregas" })).toBeInTheDocument();
    expect(nav.queryByText("Vender")).not.toBeInTheDocument();
  });

  it("restaurante: Inventario es grupo y a la vez pantalla, con su flecha aparte", () => {
    sesion.rubro = "RESTAURANTE";
    const nav = abrir("/inventario/insumos");
    expect(nav.getByRole("button", { name: "Submenú de Inventario" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // Movimientos del restaurante no tiene hijos: sigue siendo un ítem solo.
    expect(nav.queryByRole("button", { name: "Submenú de Movimientos" })).not.toBeInTheDocument();
    expect(nav.getByRole("link", { name: "Mesas del salón" })).toBeInTheDocument();
  });

  it("un grupo con un solo hijo visible se muestra plano", () => {
    // Sin catálogo, insumos ni sucursales, a Inventario le queda Movimientos.
    sesion.rubro = "RESTAURANTE";
    sesion.features = ["inventario"];
    const nav = abrir("/pos");
    expect(nav.queryByRole("button", { name: /Submenú/ })).not.toBeInTheDocument();
    expect(nav.getByRole("link", { name: "Inventario" })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: "Movimientos" })).toBeInTheDocument();
  });

  it("si el plan esconde al padre, los hijos suben a su lugar", () => {
    // Catálogo sin la feature de inventario: no hay Inventario, pero sí dónde
    // cargar los artículos.
    sesion.rubro = "RESTAURANTE";
    sesion.features = ["catalogo", "pos"];
    const nav = abrir("/inventario/productos");
    expect(nav.queryByRole("link", { name: "Inventario" })).not.toBeInTheDocument();
    expect(nav.getByRole("link", { name: "Artículos" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Categorías" })).toBeInTheDocument();
    expect(
      within(nav.getByRole("list", { name: "Stock" })).getByRole("link", { name: "Artículos" }),
    ).toBeInTheDocument();
  });

  it("si el panel apaga una feature en caliente, el menú se actualiza", () => {
    sesion.features = ["inventario", "catalogo", "multi_almacen", "lotes"];
    const { rerender } = render(arbol("/inventario/movimientos"));
    expect(screen.getByRole("link", { name: "Transferir mercadería" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sucursales" })).toBeInTheDocument();

    sesion.features = ["inventario", "catalogo", "lotes"];
    rerender(arbol("/inventario/movimientos"));
    expect(screen.queryByRole("link", { name: "Transferir mercadería" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sucursales" })).not.toBeInTheDocument();
    // Los grupos que siguen existiendo conservan su estado.
    expect(screen.getByRole("button", { name: "Submenú de Movimientos" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});

describe("barra de sólo íconos", () => {
  beforeEach(() => {
    localStorage.setItem("bamardev.sidebar.colapsada", "1");
  });

  it("muestra todas las pantallas como íconos con nombre, sin flechas", () => {
    const nav = abrir("/pos");
    expect(nav.queryByRole("button", { name: /Submenú/ })).not.toBeInTheDocument();
    // Las de adentro de un grupo también: en 68 px no hay cómo desplegar.
    expect(nav.getByRole("link", { name: "Categorías" })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: "Ingreso de mercadería" })).toBeInTheDocument();
  });

  it("el tooltip sale al pasar o enfocar un ícono", () => {
    const nav = abrir("/pos");
    fireEvent.focus(nav.getByRole("link", { name: "Encargos" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Encargos");
    fireEvent.blur(nav.getByRole("link", { name: "Encargos" }));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("la cuenta de quien está sentado (API-12)", () => {
  it("«Cambiar mi contraseña» está en el menú, para cualquier rol, y abre el formulario", () => {
    sesion.rol = "CAJERO";
    sesion.rubro = "RESTAURANTE";
    const nav = abrir("/pos");
    fireEvent.click(nav.getByRole("button", { name: "Cambiar mi contraseña" }));
    const dialogo = screen.getByRole("dialog", { name: "Cambiar mi contraseña" });
    expect(within(dialogo).getByLabelText("Contraseña actual")).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Plan Emprendedor: el chip de ventas junto al aviso de licencia", () => {
  it("un negocio Básico o Profesional (ilimitado) no ve ningún chip", () => {
    sesion.rubro = "RESTAURANTE";
    sesion.cupo = CUPO_ILIMITADO;
    abrir("/pos");
    expect(screen.queryByRole("button", { name: /Créditos/ })).not.toBeInTheDocument();
  });

  it("un Emprendedor ve «Hoy 32/50 · Créditos 240»", () => {
    sesion.rubro = "RESTAURANTE";
    sesion.cupo = cupoEmprendedor({ fecha: fechaNegocio(), ventas: 32, saldo: 240 });
    abrir("/pos");
    expect(screen.getByRole("button", { name: /Créditos 240/ })).toHaveTextContent("Hoy 32/50 · Créditos 240");
  });
});
