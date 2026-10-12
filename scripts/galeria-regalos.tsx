// Galería estática de los diseños de gift card para revisarlos a ojo.
// Uso: npx tsx scripts/galeria-regalos.tsx <salida.html>
import React from "react";
import { writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

// tsx compila el JSX con el runtime clásico: el componente necesita `React` global.
(globalThis as { React?: typeof React }).React = React;
const { default: TarjetaRegalo } = await import("../src/components/regalos/TarjetaRegalo");
const { DISENOS_REGALO, NOMBRE_DISENO } = await import("../src/lib/regalos/disenos");

const MUESTRAS = [
  { rubro: "BARBERIA", color: "#3F3C3A", negocio: "Barbería El Navajazo" },
  { rubro: "SPA", color: "#2F6F5E", negocio: "Spa Aurora" },
  { rubro: "RESTAURANTE", color: "#B4501A", negocio: "Fresas con Crema Doña Rosa" },
];

const filas = MUESTRAS.map(
  (m) =>
    `<h2>${m.rubro} · ${m.color}</h2><div class="grid">${DISENOS_REGALO.map(
      (d) =>
        `<figure>${renderToStaticMarkup(
          <TarjetaRegalo
            datos={{
              diseno: d,
              rubro: m.rubro,
              color: m.color,
              negocio: m.negocio,
              monto: 150,
              para: "María Fernanda",
              de: "Luis",
              codigo: "K7QM-2XPA",
              vence: "2027-04-30",
            }}
          />,
        )}<figcaption>${NOMBRE_DISENO[d].nombre}</figcaption></figure>`,
    ).join("")}</div>`,
).join("");

writeFileSync(
  process.argv[2] ?? "galeria.html",
  `<!doctype html><meta charset="utf-8"><title>Gift cards</title>
<style>body{font-family:system-ui;background:#eef0f3;margin:16px}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}figure{margin:0}figcaption{font-size:12px;color:#555;margin-top:4px}h2{font-size:14px;margin:18px 0 8px}</style>${filas}`,
);
