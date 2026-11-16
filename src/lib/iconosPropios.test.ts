import { describe, expect, it } from "vitest";
import {
  LARGO_NOMBRE_ICONO,
  esLlavePropia,
  nombreDesdeArchivo,
  srcDeIconoPropio,
  tokenDeLlave,
  urlIconoPropio,
} from "./iconosPropios";

const BASE = import.meta.env.VITE_API_URL || "/api";
const TOKEN = "0123456789abcdef01234567";

describe("iconosPropios: la llave mio:<token>", () => {
  it("reconoce la llave de un ícono subido por el negocio", () => {
    expect(esLlavePropia(`mio:${TOKEN}`)).toBe(true);
    expect(tokenDeLlave(`mio:${TOKEN}`)).toBe(TOKEN);
  });

  it.each([
    ["una del catálogo", "medio_pollo_broaster"],
    ["con mayúsculas", `mio:${TOKEN.toUpperCase()}`],
    ["corta", "mio:0123456789abcdef"],
    ["larga", `mio:${TOKEN}00`],
    ["con letras que no son hex", "mio:0123456789abcdefghijklmn"],
    ["con espacios", ` mio:${TOKEN}`],
    ["sin el prefijo", TOKEN],
    ["vacía", ""],
  ])("no confunde %s con una propia", (_, llave) => {
    expect(esLlavePropia(llave)).toBe(false);
    expect(tokenDeLlave(llave)).toBeNull();
    expect(urlIconoPropio(llave)).toBeNull();
  });

  it("null y undefined no son propias", () => {
    expect(esLlavePropia(null)).toBe(false);
    expect(urlIconoPropio(undefined)).toBeNull();
  });

  it("la imagen se pide sin sesión a /publico/iconos/<token>, con la base del API", () => {
    expect(urlIconoPropio(`mio:${TOKEN}`)).toBe(`${BASE}/publico/iconos/${TOKEN}`);
  });

  it("la de la lista sale de la llave (la misma URL que el resto) o, si no, de la ruta", () => {
    const ruta = `/publico/iconos/${TOKEN}`;
    expect(srcDeIconoPropio({ llave: `mio:${TOKEN}`, ruta })).toBe(`${BASE}${ruta}`);
    expect(srcDeIconoPropio({ llave: "rara", ruta: "/publico/iconos/otro" })).toBe(`${BASE}/publico/iconos/otro`);
  });
});

describe("iconosPropios: el nombre que propone el archivo", () => {
  it.each([
    ["coca_cola-2L.jpg", "coca cola 2L"],
    ["Vaso de arroz con leche.jpeg", "Vaso de arroz con leche"],
    ["  pan__casero .webp", "pan casero"],
    ["sin-extension", "sin extension"],
    ["foto.final.png", "foto.final"],
  ])("%s → %s", (archivo, esperado) => {
    expect(nombreDesdeArchivo(archivo)).toBe(esperado);
  });

  it("se corta a lo que acepta el backend", () => {
    const largo = nombreDesdeArchivo(`${"Hamburguesa doble con queso y tocino ".repeat(3)}.png`);
    expect(largo.length).toBeLessThanOrEqual(LARGO_NOMBRE_ICONO);
    expect(largo).toBe(largo.trim());
  });
});
