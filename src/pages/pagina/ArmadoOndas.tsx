import { estiloLetra } from "../../lib/pagina/estilos";
import { bandasOndas } from "../../lib/pagina/estilosPagina";
import { ColumnaContenido, columna, Raiz, tamanoNombre, type PiezasArmado } from "./piezasArmado";
import { LogoNegocio, RedesPagina } from "./piezasPagina";

/**
 * Ondas (maqueta aprobada el 20-nov): setentero. Arriba un arcoíris de cuatro
 * bandas hecho con tonos del color del negocio (del oscuro al más claro),
 * el nombre en la letra del estilo, y la portada en una ventana de arco con
 * un marco grueso. Al pie, las cuatro bandas en franjas.
 */
export default function ArmadoOndas(x: PiezasArmado) {
  const { p, c, t, escritorio, chico } = x;
  const T = x.Titulo;
  const bandas = bandasOndas(c);
  const altoArco = escritorio ? 230 : chico ? 140 : 180;
  const ventana = escritorio ? 300 : chico ? 160 : 220;
  return (
    <Raiz x={x}>
      <header style={{ ...columna, alignItems: "center", textAlign: "center", gap: 10 }}>
        <div style={{ position: "relative", width: "100%", height: altoArco, overflow: "hidden" }}>
          <svg
            viewBox="0 0 320 170"
            aria-hidden="true"
            style={{ position: "absolute", left: "50%", bottom: 0, width: altoArco * 2, transform: "translateX(-50%)" }}
          >
            {bandas.map((col, i) => (
              <path key={i} d={`M${20 + i * 26} 170 A${140 - i * 26} ${140 - i * 26} 0 0 1 ${300 - i * 26} 170`} stroke={col} strokeWidth="26" fill="none" />
            ))}
          </svg>
          {x.logo && (
            <div style={{ position: "absolute", left: "50%", bottom: 0, transform: "translateX(-50%)" }}>
              <LogoNegocio logo={x.logo} p={p} lado={chico ? 56 : 68} radio={999} fondoIniciales={c.acento} letra={x.letra} estilo={{ border: `4px solid ${t.fondo}` }} />
            </div>
          )}
        </div>
        <div style={{ ...columna, alignItems: "center", gap: 8, padding: "0 18px", maxWidth: 560 }}>
          {p.rubro && <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: t.textoEncabezado }}>{p.rubro}</span>}
          <T style={{ margin: 0, ...estiloLetra(x.letra, tamanoNombre(p.nombre, escritorio ? 58 : chico ? 34 : 46)), lineHeight: 1, color: t.textoEncabezado, overflowWrap: "anywhere" }}>
            {p.nombre}
          </T>
          {p.descripcion && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: t.texto2Encabezado }}>{p.descripcion}</p>}
          {p.redes.length > 0 && <RedesPagina redes={p.redes} variante="circulo" fondo={t.redFondo} trazo={t.redTrazo} borde={bandas[3]} clic={x.clic} />}
        </div>
        {x.portada && (
          <div style={{ marginTop: 8, padding: 8, borderRadius: "999px 999px 18px 18px", background: bandas[2] }}>
            <img
              src={x.portada}
              alt=""
              width={800}
              height={800}
              decoding="async"
              fetchPriority={x.prioridad ? "high" : undefined}
              style={{ width: ventana, height: ventana, objectFit: "cover", display: "block", borderRadius: "999px 999px 12px 12px", border: `6px solid ${t.fondo}`, boxSizing: "border-box" }}
            />
          </div>
        )}
      </header>
      <ColumnaContenido x={x} padding="20px 18px 26px" />
      <div aria-hidden="true" style={{ height: 44, background: `linear-gradient(${bandas[3]} 0 25%, ${bandas[2]} 0 50%, ${bandas[1]} 0 75%, ${bandas[0]} 0)` }} />
    </Raiz>
  );
}
