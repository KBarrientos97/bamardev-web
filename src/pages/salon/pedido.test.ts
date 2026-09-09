import { describe, expect, it } from "vitest";
import {
  agregar,
  aItemsDeComanda,
  cantidadDeProducto,
  cantidadPedido,
  quitarUno,
  setCantidadLinea,
  setNotaLinea,
  totalPedido,
  type LineaPedido,
} from "./pedido";

const COCA = { id: 1, nombre: "Coca-Cola", precio: 10 };
const BRASA = { id: 2, nombre: "Brasa cuarto", precio: 26 };

describe("armar el pedido", () => {
  it("tocar tres veces el mismo producto da una línea de 3", () => {
    // "3× Coca-Cola" y no tres renglones iguales en la comanda.
    let l: LineaPedido[] = [];
    l = agregar(l, COCA, 1);
    l = agregar(l, COCA, 2);
    l = agregar(l, COCA, 3);
    expect(l).toHaveLength(1);
    expect(l[0].cantidad).toBe(3);
    expect(totalPedido(l)).toBe(30);
    expect(cantidadPedido(l)).toBe(3);
  });

  it("no toca las líneas que ya tienen indicación", () => {
    // Esa nota es de esa unidad concreta.
    let l: LineaPedido[] = [{ id: 1, productoId: 1, nombre: "Coca-Cola", precio: 10, cantidad: 1, nota: "Sin hielo" }];
    l = agregar(l, COCA, 2);
    expect(l).toHaveLength(2);
    expect(l[0].nota).toBe("Sin hielo");
    expect(l[0].cantidad).toBe(1);
    expect(l[1].cantidad).toBe(1);
    expect(l[1].nota).toBeUndefined();
  });

  it("cuenta un producto sumando todas sus líneas", () => {
    const l: LineaPedido[] = [
      { id: 1, productoId: 1, nombre: "Coca", precio: 10, cantidad: 2, nota: "Sin hielo" },
      { id: 2, productoId: 1, nombre: "Coca", precio: 10, cantidad: 3 },
      { id: 3, productoId: 2, nombre: "Brasa", precio: 26, cantidad: 1 },
    ];
    expect(cantidadDeProducto(l, 1)).toBe(5);
    expect(cantidadDeProducto(l, 2)).toBe(1);
    expect(cantidadDeProducto(l, 99)).toBe(0);
  });

  it("líneas distintas del mismo plato suman al total", () => {
    let l = agregar([], BRASA, 1);
    l = setNotaLinea(l, 1, "Sin sal");
    l = agregar(l, BRASA, 2);
    expect(l).toHaveLength(2);
    expect(totalPedido(l)).toBe(52);
  });
});

describe("bajar cantidades desde la grilla", () => {
  it("descuenta primero de la línea sin nota", () => {
    // Borrar la que lleva indicación sería tirar el dato que costó anotar.
    const l: LineaPedido[] = [
      { id: 1, productoId: 1, nombre: "Coca", precio: 10, cantidad: 1, nota: "Sin hielo" },
      { id: 2, productoId: 1, nombre: "Coca", precio: 10, cantidad: 2 },
    ];
    const r = quitarUno(l, 1);
    expect(r).toHaveLength(2);
    expect(r[0].nota).toBe("Sin hielo");
    expect(r[1].cantidad).toBe(1);
  });

  it("si sólo quedan líneas con nota, saca de la última", () => {
    const l: LineaPedido[] = [
      { id: 1, productoId: 1, nombre: "Coca", precio: 10, cantidad: 1, nota: "Sin hielo" },
      { id: 2, productoId: 1, nombre: "Coca", precio: 10, cantidad: 1, nota: "Sin sal" },
    ];
    const r = quitarUno(l, 1);
    expect(r.map((x) => x.nota)).toEqual(["Sin hielo"]);
  });

  it("en la última unidad la línea desaparece", () => {
    const l = agregar([], COCA, 1);
    expect(quitarUno(l, 1)).toHaveLength(0);
  });

  it("bajar algo que no está no rompe nada", () => {
    const l = agregar([], COCA, 1);
    expect(quitarUno(l, 99)).toEqual(l);
  });
});

describe("ajustar una línea del carrito", () => {
  it("cantidad cero la saca del pedido", () => {
    const l = agregar([], COCA, 1);
    expect(setCantidadLinea(l, 1, 0)).toHaveLength(0);
  });

  it("cambia sólo la línea que se toca", () => {
    let l = agregar([], COCA, 1);
    l = agregar(l, BRASA, 2);
    const r = setCantidadLinea(l, 2, 4);
    expect(r[0].cantidad).toBe(1);
    expect(r[1].cantidad).toBe(4);
  });
});

describe("las indicaciones", () => {
  it("se ponen sobre la línea", () => {
    let l = agregar([], COCA, 1);
    l = setNotaLinea(l, 1, "Sin hielo");
    expect(l[0].nota).toBe("Sin hielo");
  });

  it("tocar la misma indicación la saca", () => {
    // Es el gesto que espera cualquiera cuando se equivocó de chip.
    let l = agregar([], COCA, 1);
    l = setNotaLinea(l, 1, "Sin hielo");
    l = setNotaLinea(l, 1, "Sin hielo");
    expect(l[0].nota).toBeUndefined();
  });

  it("una indicación vacía también la saca", () => {
    let l = agregar([], COCA, 1);
    l = setNotaLinea(l, 1, "Sin hielo");
    l = setNotaLinea(l, 1, "   ");
    expect(l[0].nota).toBeUndefined();
  });
});

describe("lo que viaja al backend", () => {
  it("manda producto, cantidad y la nota sólo si existe", () => {
    let l = agregar([], COCA, 1);
    l = agregar(l, BRASA, 2);
    l = setNotaLinea(l, 2, "Sin sal");
    expect(aItemsDeComanda(l)).toEqual([
      { productoId: 1, cantidad: 1 },
      { productoId: 2, cantidad: 1, nota: "Sin sal" },
    ]);
  });
});
