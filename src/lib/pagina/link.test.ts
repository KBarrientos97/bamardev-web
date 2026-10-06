import { describe, expect, it } from "vitest";
import { destinoLink, esHostLink, ROBOTS_LINK, rutaCortaDeVieja, rutaLargaDeLink } from "./link";

/** Qué es cada dirección en `link(-qa).bamardev.com`. */

describe("el host link", () => {
  it("link, link-qa y link-<ambiente> de bamardev.com, y link.localhost para probar", () => {
    for (const h of ["link.bamardev.com", "link-qa.bamardev.com", "LINK-QA.bamardev.com", "link-dev2.bamardev.com", "link.localhost"]) {
      expect(esHostLink(h)).toBe(true);
    }
    for (const h of [
      "app.bamardev.com",
      "app-qa.bamardev.com",
      "go-qa.bamardev.com",
      "bamardev.com",
      "localhost",
      "link.bamardev.com.evil.com",
      "milink.bamardev.com",
      "link.qa.bamardev.com",
      "bamar-app.pages.dev",
    ]) {
      expect(esHostLink(h)).toBe(false);
    }
  });
});

describe("dirección corta → la de siempre", () => {
  it("las cinco formas", () => {
    expect(rutaLargaDeLink("/bellavista")).toBe("/p/bellavista");
    expect(rutaLargaDeLink("/BellaVista/")).toBe("/p/bellavista");
    expect(rutaLargaDeLink("/bellavista/privacidad")).toBe("/p/bellavista/privacidad");
    expect(rutaLargaDeLink("/bellavista/promo/martes-2x1")).toBe("/p/bellavista/promo/martes-2x1");
    expect(rutaLargaDeLink("/bellavista/reservar")).toBe("/r/bellavista/reservar");
    expect(rutaLargaDeLink("/bellavista/reservar/centro")).toBe("/r/bellavista/reservar/centro");
    expect(rutaLargaDeLink("/bellavista/c/Ab3_x-9QkLm2")).toBe("/r/bellavista/c/Ab3_x-9QkLm2");
  });

  it("lo demás no es la página de nadie", () => {
    for (const ruta of [
      "/",
      "/inventario/productos",
      "/bellavista/reservar/centro/otra",
      "/bellavista/promo",
      "/bellavista/c",
      "/bellavista/algo",
      "/%3Cscript%3E",
      "/%E0%A4%A",
      "/bella vista",
    ]) {
      expect(rutaLargaDeLink(ruta)).toBeNull();
    }
  });

  it("las viejas (/p y /r) pasan a la corta", () => {
    expect(rutaCortaDeVieja("/p/bellavista")).toBe("/bellavista");
    expect(rutaCortaDeVieja("/p/bellavista/promo/x")).toBe("/bellavista/promo/x");
    expect(rutaCortaDeVieja("/p/bellavista/privacidad")).toBe("/bellavista/privacidad");
    expect(rutaCortaDeVieja("/r/bellavista")).toBe("/bellavista");
    expect(rutaCortaDeVieja("/r/bellavista/reservar/centro")).toBe("/bellavista/reservar/centro");
    expect(rutaCortaDeVieja("/r/bellavista/c/TOKEN")).toBe("/bellavista/c/TOKEN");
    expect(rutaCortaDeVieja("/r/bellavista/nada/mas")).toBeNull();
    expect(rutaCortaDeVieja("/p")).toBeNull();
    expect(rutaCortaDeVieja("/pos")).toBeNull();
  });
});

describe("qué hace la Function con cada pedido", () => {
  it("raíz, robots, archivos, páginas, viejas y lo que no existe", () => {
    expect(destinoLink("/")).toEqual({ tipo: "raiz" });
    expect(destinoLink("/robots.txt")).toEqual({ tipo: "robots" });
    expect(destinoLink("/assets/index-abc.js")).toEqual({ tipo: "archivo" });
    expect(destinoLink("/favicon.ico")).toEqual({ tipo: "archivo" });
    expect(destinoLink("/bellavista")).toEqual({ tipo: "publica", larga: "/p/bellavista" });
    expect(destinoLink("/bellavista/reservar")).toEqual({ tipo: "publica", larga: "/r/bellavista/reservar" });
    expect(destinoLink("/p/bellavista")).toEqual({ tipo: "vieja", corta: "/bellavista" });
    expect(destinoLink("/r/bellavista/reservar")).toEqual({ tipo: "vieja", corta: "/bellavista/reservar" });
    expect(destinoLink("/inventario/productos")).toEqual({ tipo: "ninguna" });
    // `/pos` tiene la forma de un negocio: la SPA y el API dicen que no existe.
    expect(destinoLink("/pos")).toEqual({ tipo: "publica", larga: "/p/pos" });
  });

  it("robots: la página se indexa, la reserva y el enlace de gestión no", () => {
    expect(ROBOTS_LINK).toContain("Allow: /");
    expect(ROBOTS_LINK).toContain("Disallow: /*/reservar");
    expect(ROBOTS_LINK).toContain("Disallow: /*/c/");
    expect(ROBOTS_LINK).not.toMatch(/^Disallow: \/$/m);
  });
});
