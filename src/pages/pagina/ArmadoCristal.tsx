import { mezcla } from "../../lib/pagina/aspecto";
import { estiloLetra } from "../../lib/pagina/estilos";
import { CRISTAL } from "../../lib/pagina/estilosPagina";
import { ColumnaContenido, columna, conAlfa, Raiz, tamanoNombre, type PiezasArmado } from "./piezasArmado";
import { LogoNegocio, RedesPagina } from "./piezasPagina";

/**
 * Cristal (maqueta aprobada el 20-nov): manchas de luz del color del negocio
 * y de sus dos vecinos en el círculo cromático, y encima el encabezado en una
 * tarjeta de vidrio esmerilado. Las manchas llevan al menos la mitad de
 * blanco (`CRISTAL.blancoManchas`): la letra casi negra se lee encima de
 * cualquiera, aun con la muestra Negro.
 */

/** El mismo color girado en el círculo cromático (los "vecinos" de las manchas). */
function girarTono(hex: string, grados: number): string {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let tono = 0;
  if (d) tono = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  tono = (((tono * 60 + grados) % 360) + 360) % 360;
  const C = (1 - Math.abs(2 * l - 1)) * s;
  const X = C * (1 - Math.abs(((tono / 60) % 2) - 1));
  const m = l - C / 2;
  const [a, bb, cc] =
    tono < 60 ? [C, X, 0] : tono < 120 ? [X, C, 0] : tono < 180 ? [0, C, X] : tono < 240 ? [0, X, C] : tono < 300 ? [X, 0, C] : [C, 0, X];
  return `#${[a, bb, cc].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export default function ArmadoCristal(x: PiezasArmado) {
  const { p, c, t, escritorio, chico } = x;
  const T = x.Titulo;
  const blanco = CRISTAL.blancoManchas;
  const base = mezcla(c.acento, "#ffffff", 0.86);
  const m1 = mezcla(c.acento, "#ffffff", blanco);
  const m2 = mezcla(girarTono(c.acento, 45), "#ffffff", blanco + 0.1);
  const m3 = mezcla(girarTono(c.acento, -40), "#ffffff", blanco + 0.1);
  const fondo = {
    background: base,
    backgroundImage: `radial-gradient(circle at 15% 8%, ${m1} 0, transparent 42%), radial-gradient(circle at 90% 30%, ${m2} 0, transparent 40%), radial-gradient(circle at 20% 70%, ${m3} 0, transparent 45%), radial-gradient(circle at 85% 95%, ${m1} 0, transparent 35%)`,
  };
  const vidrio = {
    background: "rgba(255,255,255,0.62)",
    WebkitBackdropFilter: "blur(18px) saturate(1.4)",
    backdropFilter: "blur(18px) saturate(1.4)",
    border: "1px solid rgba(255,255,255,0.75)",
  };
  return (
    <Raiz x={x} style={fondo}>
      <header style={{ maxWidth: escritorio ? 640 : 480, margin: "0 auto", padding: escritorio ? "44px 0 0" : "22px 16px 0", boxSizing: "border-box", width: "100%" }}>
        <div style={{ ...vidrio, ...columna, alignItems: "center", textAlign: "center", gap: 6, borderRadius: 28, padding: x.portada ? "10px 10px 20px" : "22px 16px 20px" }}>
          {x.portada && (
            <img
              src={x.portada}
              alt=""
              width={1200}
              height={700}
              decoding="async"
              fetchPriority={x.prioridad ? "high" : undefined}
              style={{ width: "100%", height: escritorio ? 260 : chico ? 120 : 170, objectFit: "cover", display: "block", borderRadius: 20 }}
            />
          )}
          <LogoNegocio
            logo={x.logo}
            p={p}
            lado={chico ? 58 : 70}
            radio={22}
            fondoIniciales={c.acento}
            letra={x.letra}
            estilo={{ marginTop: x.portada ? -36 : 0, position: "relative", border: "3px solid rgba(255,255,255,0.9)", boxShadow: `0 10px 24px -10px ${conAlfa(c.oscuro, 0.8)}` }}
          />
          <T style={{ margin: "8px 0 0", ...estiloLetra(x.letra, tamanoNombre(p.nombre, escritorio ? 42 : chico ? 28 : 34)), lineHeight: 1.05, letterSpacing: "-0.02em", color: t.textoEncabezado, overflowWrap: "anywhere" }}>
            {p.nombre}
          </T>
          {p.rubro && <span style={{ fontSize: 13.5, color: t.texto2Encabezado }}>{p.rubro}</span>}
          {p.descripcion && <p style={{ margin: "4px 6px 0", fontSize: 15, lineHeight: 1.5, color: t.texto2Encabezado }}>{p.descripcion}</p>}
          {p.redes.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <RedesPagina redes={p.redes} variante="circulo" fondo={t.redFondo} trazo={t.redTrazo} clic={x.clic} />
            </div>
          )}
        </div>
      </header>
      <ColumnaContenido x={x} padding="14px 16px 28px" gap={12} />
    </Raiz>
  );
}
