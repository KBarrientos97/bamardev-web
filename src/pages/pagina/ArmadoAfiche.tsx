import { estiloLetra } from "../../lib/pagina/estilos";
import { AFICHE } from "../../lib/pagina/estilosPagina";
import { ColumnaContenido, columna, conAlfa, Raiz, tamanoNombre, type PiezasArmado } from "./piezasArmado";
import { LogoNegocio, RedesPagina } from "./piezasPagina";

/**
 * Afiche (maqueta aprobada el 20-nov): un afiche de grilla. Arriba un bloque
 * del color con el nombre en mayúsculas apilado palabra por palabra, la
 * portada recortada en círculo a dos tonos (gris multiplicado sobre el color)
 * y una línea negra gruesa que lo cierra. Sin portada, un aro blanco
 * translúcido en la esquina. En la compu el bloque va a la izquierda, alto,
 * y el contenido a la derecha.
 */
export default function ArmadoAfiche(x: PiezasArmado) {
  const { p, c, t, escritorio, chico } = x;
  const T = x.Titulo;
  // Las mayúsculas las pone el estilo (textTransform): el texto sigue siendo el nombre tal cual.
  const palabras = p.nombre.trim().split(/\s+/);
  const larga = palabras.some((w) => w.length > 8);
  const tamano = tamanoNombre(p.nombre, escritorio ? 84 : chico ? 44 : larga ? 50 : 60);
  const circulo = escritorio ? 300 : chico ? 130 : 170;
  const bloque = (
    <header
      style={{
        ...columna,
        position: "relative",
        overflow: "hidden",
        background: c.acento,
        color: t.textoEncabezado,
        padding: escritorio ? "48px 44px" : "20px 18px 20px",
        borderBottom: `6px solid ${AFICHE.tinta}`,
        gap: 14,
        minHeight: escritorio ? "100%" : undefined,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, position: "relative", zIndex: 1 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>{p.rubro ?? ""}</span>
        {x.logo && (
          <LogoNegocio logo={x.logo} p={p} lado={chico ? 36 : 44} radio={0} fondoIniciales={c.oscuro} letra={x.letra} estilo={{ border: "2px solid #ffffff" }} />
        )}
      </div>
      <T
        style={{
          margin: 0,
          ...estiloLetra(x.letra, tamano),
          textTransform: "uppercase",
          lineHeight: 0.86,
          letterSpacing: "-0.03em",
          position: "relative",
          zIndex: 1,
          overflowWrap: "anywhere",
          color: t.textoEncabezado,
        }}
      >
        {palabras.map((w, i) => (
          <span key={i} style={{ display: "block" }}>
            {w}
            {i < palabras.length - 1 ? " " : ""}
          </span>
        ))}
      </T>
      {p.descripcion && (
        <p style={{ margin: 0, maxWidth: escritorio ? 380 : "24ch", fontSize: escritorio ? 16 : 14, lineHeight: 1.4, position: "relative", zIndex: 1 }}>
          {p.descripcion}
        </p>
      )}
      {p.redes.length > 0 && (
        <div style={{ position: "relative", zIndex: 1 }}>
          <RedesPagina redes={p.redes} variante="cuadrado" fondo={conAlfa("#ffffff", 0.18)} trazo="#ffffff" centradas={false} clic={x.clic} />
        </div>
      )}
      {x.portada ? (
        <img
          src={x.portada}
          alt=""
          width={600}
          height={600}
          decoding="async"
          fetchPriority={x.prioridad ? "high" : undefined}
          style={{
            position: "absolute",
            right: -circulo * 0.12,
            bottom: -circulo * 0.12,
            width: circulo,
            height: circulo,
            borderRadius: "50%",
            objectFit: "cover",
            filter: "grayscale(1) contrast(1.3)",
            mixBlendMode: "multiply",
            opacity: 0.9,
          }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -circulo * 0.18,
            bottom: -circulo * 0.18,
            width: circulo,
            height: circulo,
            borderRadius: "50%",
            border: `${Math.round(circulo / 6.5)}px solid ${conAlfa("#ffffff", 0.22)}`,
          }}
        />
      )}
    </header>
  );
  if (escritorio) {
    return (
      <Raiz x={x}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 5fr) minmax(0, 6fr)", minHeight: x.altoPantalla }}>
          <div style={{ position: "sticky", top: 0, height: x.altoPantalla, borderRight: `6px solid ${AFICHE.tinta}` }}>{bloque}</div>
          <ColumnaContenido x={{ ...x, escritorio: false }} padding="36px 40px 40px" />
        </div>
      </Raiz>
    );
  }
  return (
    <Raiz x={x}>
      {bloque}
      <ColumnaContenido x={x} padding="20px 18px 26px" />
    </Raiz>
  );
}
