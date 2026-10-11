import { mezcla } from "../../lib/pagina/aspecto";
import { BotonesEnGrilla, columna, Nombre, Raiz, tamanoNombre, type PiezasArmado } from "./piezasArmado";
import { LogoNegocio, RedesPagina } from "./piezasPagina";

/**
 * Dulce (IDEAS/5 §4.3, maqueta del 09-oct): el fondo es el tinte del color
 * (pastel), la portada termina en una onda en vez de un corte recto, el logo
 * lleva un aro del color y las tarjetas son blancas, bien redondas, con una
 * sombra del color y no gris. En computadora, una columna centrada de 640 px.
 */

/** La onda del borde de abajo de la portada, pintada del color de la página. */
function Onda({ color, alto }: { color: string; alto: number }) {
  return (
    <svg
      viewBox="0 0 360 40"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ position: "absolute", left: 0, bottom: -1, width: "100%", height: alto, display: "block" }}
    >
      <path d="M0 22 C 60 0, 120 40, 180 20 S 300 0, 360 22 L360 40 L0 40Z" fill={color} />
    </svg>
  );
}

export default function ArmadoDulce(x: PiezasArmado) {
  const { p, c, t, escritorio, chico, Principal } = x;
  const alto = escritorio ? 280 : chico ? 150 : 180;
  const lado = chico ? 84 : 96;
  return (
    <Raiz x={x}>
      <header>
        {/* La portada con la onda abajo; sin foto, un bloque del color con la misma onda. */}
        <div
          style={{
            position: "relative",
            height: alto,
            overflow: "hidden",
            background: x.portada ? "#E5E7EB" : `linear-gradient(160deg, ${c.acento}, ${mezcla(c.acento, "#ffffff", 0.35)})`,
          }}
        >
          {x.portada && (
            <img
              src={x.portada}
              alt=""
              width={1600}
              height={600}
              decoding="async"
              fetchPriority={x.prioridad ? "high" : undefined}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          )}
          <Onda color={t.fondo} alto={escritorio ? 56 : 40} />
        </div>
        <div
          style={{
            ...columna,
            position: "relative",
            alignItems: "center",
            gap: 6,
            textAlign: "center",
            marginTop: -Math.round(lado * 0.58),
            padding: "0 20px",
          }}
        >
          <LogoNegocio
            logo={x.logo}
            p={p}
            lado={lado}
            radio={999}
            fondoIniciales={c.acento}
            letra={x.letra}
            estilo={{ border: "4px solid #ffffff", boxShadow: [`0 0 0 3px ${c.acento}`, t.sombra].filter(Boolean).join(", ") }}
          />
          <Nombre
            x={x}
            tamano={tamanoNombre(p.nombre, escritorio ? 32 : 27)}
            style={{ marginTop: 8, lineHeight: 1.15, color: t.textoEncabezado }}
          />
          {p.rubro && <span style={{ fontSize: 13, fontWeight: 600, color: t.texto3 }}>{p.rubro}</span>}
          {p.descripcion && (
            <p style={{ margin: 0, maxWidth: 460, fontSize: 15, lineHeight: 1.45, color: t.texto2Encabezado }}>{p.descripcion}</p>
          )}
          {p.redes.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <RedesPagina redes={p.redes} variante="circulo" fondo={t.redFondo} trazo={t.redTrazo} clic={x.clic} />
            </div>
          )}
        </div>
      </header>
      <Principal
        aria-label={x.etiquetaPrincipal}
        style={{
          ...columna,
          gap: 14,
          maxWidth: escritorio ? 640 : 480,
          margin: "0 auto",
          padding: escritorio ? "24px 0 40px" : "18px 18px 24px",
        }}
      >
        {x.anuncio}
        {x.principal}
        <BotonesEnGrilla botones={x.botones} dos={escritorio} />
        {x.catalogo}
        {x.sucursales}
        {x.pie}
      </Principal>
    </Raiz>
  );
}
