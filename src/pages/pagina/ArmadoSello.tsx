import { useId } from "react";
import { estiloLetra, oscuroLegible } from "../../lib/pagina/estilos";
import { SELLO } from "../../lib/pagina/estilosPagina";
import { ColumnaContenido, columna, conAlfa, inicialesNombre, Raiz, tamanoNombre, type PiezasArmado } from "./piezasArmado";
import { LogoNegocio, RedesPagina } from "./piezasPagina";

/**
 * Sello (maqueta aprobada el 20-nov): papel madera con grano y tinta. El
 * logo va en un sello de goma redondo, girado, con el nombre del negocio
 * escrito alrededor; sin logo, las iniciales al centro. Debajo el nombre en
 * la letra del estilo, el rubro en cursiva y la portada con borde de papel
 * claro, en sepia y apenas torcida.
 */
export default function ArmadoSello(x: PiezasArmado) {
  const { p, c, t, escritorio, chico } = x;
  const T = x.Titulo;
  const arco = `sello-${useId().replace(/:/g, "")}`;
  // La tinta del sello: el color del negocio, oscurecido hasta leerse sobre el papel madera.
  const tinta = oscuroLegible(c.acento, SELLO.kraft);
  const lado = escritorio ? 190 : chico ? 120 : 150;
  const papel = {
    background: SELLO.kraft,
    backgroundImage: `radial-gradient(${conAlfa("#7a5a33", 0.18)} 1px, transparent 1.4px), radial-gradient(${conAlfa("#ffffff", 0.2)} 1px, transparent 1.4px)`,
    backgroundSize: "9px 9px, 13px 13px",
    backgroundPosition: "0 0, 4px 6px",
  };
  const vuelta = `${p.nombre.toUpperCase()} · ${(p.rubro ?? "").toUpperCase()} · `;
  return (
    <Raiz x={x} style={papel}>
      <header style={{ ...columna, alignItems: "center", gap: 8, textAlign: "center", padding: escritorio ? "44px 24px 0" : "24px 18px 0", maxWidth: 640, margin: "0 auto", boxSizing: "border-box", width: "100%" }}>
        <div style={{ position: "relative", width: lado, height: lado, transform: "rotate(-9deg)" }}>
          <svg viewBox="0 0 200 200" width={lado} height={lado} aria-hidden="true" style={{ position: "absolute", inset: 0, opacity: 0.92 }}>
            <defs>
              <path id={arco} d="M100 100 m-70 0 a70 70 0 1 1 140 0 a70 70 0 1 1 -140 0" />
            </defs>
            <circle cx="100" cy="100" r="94" fill="none" stroke={tinta} strokeWidth="5" />
            <circle cx="100" cy="100" r="84" fill="none" stroke={tinta} strokeWidth="1.5" />
            <circle cx="100" cy="100" r="52" fill="none" stroke={tinta} strokeWidth="2.5" />
            <text fontFamily={x.letra.familia} fontSize={vuelta.length > 34 ? 13 : 16} letterSpacing="2" fill={tinta}>
              <textPath href={`#${arco}`}>{vuelta}</textPath>
            </text>
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            {x.logo ? (
              <LogoNegocio logo={x.logo} p={p} lado={Math.round(lado * 0.46)} radio={999} fondoIniciales={c.acento} letra={x.letra} />
            ) : (
              <span aria-hidden="true" style={{ ...estiloLetra(x.letra, Math.round(lado * 0.2)), color: tinta }}>{inicialesNombre(p.nombre)}</span>
            )}
          </div>
        </div>
        <T style={{ margin: "6px 0 0", ...estiloLetra(x.letra, tamanoNombre(p.nombre, escritorio ? 42 : chico ? 28 : 34)), lineHeight: 1.05, color: t.textoEncabezado, overflowWrap: "anywhere" }}>
          {p.nombre}
        </T>
        {p.rubro && <span style={{ fontStyle: "italic", fontSize: 16, color: t.texto2Encabezado }}>{p.rubro}</span>}
        {x.portada && (
          <img
            src={x.portada}
            alt=""
            width={1200}
            height={800}
            decoding="async"
            fetchPriority={x.prioridad ? "high" : undefined}
            style={{
              width: "100%",
              height: escritorio ? 320 : chico ? 130 : 170,
              objectFit: "cover",
              display: "block",
              marginTop: 10,
              boxSizing: "border-box",
              border: `8px solid ${SELLO.etiqueta}`,
              boxShadow: "0 10px 18px -10px rgba(0,0,0,0.45)",
              filter: "sepia(0.55) contrast(1.05)",
              transform: "rotate(1deg)",
            }}
          />
        )}
        {p.descripcion && <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: 1.55, color: t.texto }}>{p.descripcion}</p>}
        {p.redes.length > 0 && <RedesPagina redes={p.redes} variante="circulo" fondo={null} borde={t.redTrazo} trazo={t.redTrazo} clic={x.clic} />}
      </header>
      <ColumnaContenido x={x} padding="18px 18px 28px" />
    </Raiz>
  );
}
