import type { CSSProperties } from "react";
import { POSTAL } from "../../lib/pagina/estilosPagina";
import { columna, conAlfa, Nombre, Raiz, tamanoNombre, type PiezasArmado } from "./piezasArmado";
import { LogoNegocio, RedesPagina } from "./piezasPagina";

/**
 * Postal (IDEAS/5 §4.3, maqueta del 09-oct): una sola tarjeta blanca que
 * contiene todo, flotando sobre la portada desenfocada a pantalla completa;
 * el logo sobresale del borde de arriba. En computadora es la misma tarjeta,
 * centrada: el "link-in-bio" puro.
 */

/** Cuánto sobresale el logo del borde de la tarjeta (la mitad de su lado). */
const SOBRESALE = 48;

/**
 * El fondo: la portada desenfocada y oscurecida, o un degradado del color al
 * tinte si no hay. En la página de verdad queda fijo mientras se baja; en el
 * editor (marco o miniatura), absoluto dentro de la página: ahí "fijo" se
 * mediría contra el marco y no contra la ventana.
 */
function Fondo({ x }: { x: PiezasArmado }) {
  const capa: CSSProperties = { position: x.enMarco ? "absolute" : "fixed", inset: 0, zIndex: 0 };
  if (!x.portada) {
    return <div aria-hidden="true" style={{ ...capa, background: `linear-gradient(135deg, ${x.c.acento}, ${x.c.tinte})` }} />;
  }
  return (
    <>
      {/* La misma portada, ampliada y borroneada: el borde se corre afuera para que el desenfoque no deje un halo claro. */}
      <img
        src={x.portada}
        alt=""
        width={1600}
        height={900}
        decoding="async"
        fetchPriority={x.prioridad ? "high" : undefined}
        style={{
          ...capa,
          inset: undefined,
          top: -40,
          left: -40,
          width: "calc(100% + 80px)",
          height: "calc(100% + 80px)",
          objectFit: "cover",
          filter: "blur(24px)",
        }}
      />
      <div aria-hidden="true" style={{ ...capa, background: conAlfa("#000000", POSTAL.oscurecer) }} />
    </>
  );
}

export default function ArmadoPostal(x: PiezasArmado) {
  const { p, c, t, escritorio, chico, Principal } = x;
  const lado = chico ? 84 : 96;
  const sobresale = chico ? 42 : SOBRESALE;
  return (
    <Raiz
      x={x}
      style={{
        position: "relative",
        isolation: "isolate",
        overflow: x.enMarco ? "hidden" : undefined,
        // Mientras llega la portada (o si falla), un gris oscuro y no un blanco.
        background: x.portada ? "#3F3F46" : c.acento,
      }}
    >
      <Fondo x={x} />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: escritorio ? 560 : 480,
          margin: "0 auto",
          padding: escritorio ? `${sobresale + 40}px 0 48px` : `${sobresale + (chico ? 14 : 20)}px 14px 24px`,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            ...columna,
            gap: 12,
            background: t.fondo,
            borderRadius: 26,
            boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            padding: escritorio ? "0 28px 14px" : "0 18px 8px",
          }}
        >
          <header
            style={{
              ...columna,
              alignItems: "center",
              gap: 6,
              textAlign: "center",
              marginTop: -sobresale,
            }}
          >
            <LogoNegocio
              logo={x.logo}
              p={p}
              lado={lado}
              radio={999}
              fondoIniciales={c.acento}
              letra={x.letra}
              estilo={{ border: "5px solid #ffffff", boxShadow: "0 6px 18px rgba(0,0,0,0.16)" }}
            />
            <Nombre
              x={x}
              tamano={tamanoNombre(p.nombre, escritorio ? 28 : 25)}
              style={{ marginTop: 6, lineHeight: 1.15, color: t.textoEncabezado }}
            />
            {p.rubro && <span style={{ fontSize: 13, color: t.texto3 }}>{p.rubro}</span>}
            {p.descripcion && (
              <p style={{ margin: 0, maxWidth: 420, fontSize: 14.5, lineHeight: 1.45, color: t.texto2Encabezado }}>
                {p.descripcion}
              </p>
            )}
            {p.redes.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <RedesPagina redes={p.redes} variante="circulo" fondo={t.redFondo} trazo={t.redTrazo} clic={x.clic} />
              </div>
            )}
          </header>
          <Principal aria-label={x.etiquetaPrincipal} style={{ ...columna, gap: 12, paddingTop: 6 }}>
            {x.anuncio}
            {x.principal}
            {x.botones}
            {x.catalogo}
            {x.sucursales}
            {x.pie}
          </Principal>
        </div>
      </div>
    </Raiz>
  );
}
