import type { CSSProperties } from "react";
import { NOCHE } from "../../lib/pagina/estilos";
import { BRILLO_NOCHE, rgbaCapa } from "../../lib/pagina/estilosPagina";
import ArmadoCarta from "./ArmadoCarta";
import ArmadoDulce from "./ArmadoDulce";
import ArmadoMosaico from "./ArmadoMosaico";
import ArmadoPostal from "./ArmadoPostal";
import {
  BotonesEnGrilla,
  columna,
  conAlfa,
  Nombre,
  Portada,
  Raiz,
  rubroYDescripcion,
  tamanoNombre,
  type PiezasArmado,
} from "./piezasArmado";
import { LogoNegocio, RedesPagina } from "./piezasPagina";

export type { PiezasArmado } from "./piezasArmado";

/**
 * Los armados de los estilos de página nuevos (IDEAS/5 §4.3, maqueta aprobada
 * el 09-oct): Vitrina, Vivo, Noche y Boutique, cada uno en celular y en
 * computadora. Reciben las piezas ya hechas por `VistaPagina` (botones,
 * anuncio, catálogo, sucursales, pie) y sólo deciden dónde va cada una y cómo
 * es el encabezado. El Clásico no pasa por acá: sigue en VistaPagina tal cual.
 * Los de la fase 2 (Postal, Carta, Dulce y Mosaico) van cada uno en su
 * archivo; las piezas comunes, en piezasArmado.tsx.
 */

/**
 * El encabezado de color: el de Vivo y el de Vitrina cuando no hay portada.
 * Logo redondo con aro blanco, nombre y descripción en blanco y las redes en
 * círculos blancos translúcidos.
 */
function EncabezadoColor({ x, fondo, padding }: { x: PiezasArmado; fondo: string; padding: string }) {
  const { p, c, chico } = x;
  return (
    <header
      style={{
        background: fondo,
        padding,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        textAlign: "center",
        color: x.t.textoEncabezado,
      }}
    >
      <LogoNegocio
        logo={x.logo}
        p={p}
        lado={chico ? 84 : 96}
        radio={999}
        fondoIniciales={c.oscuro}
        letra={x.letra}
        estilo={{ border: "4px solid #ffffff", boxShadow: "0 6px 20px rgba(0,0,0,0.18)" }}
      />
      <Nombre x={x} tamano={x.escritorio ? 32 : 28} style={{ marginTop: 6, lineHeight: 1.15, color: x.t.textoEncabezado }} />
      {p.rubro && <span style={{ fontSize: 13, color: x.t.texto2Encabezado }}>{p.rubro}</span>}
      {p.descripcion && (
        <p style={{ margin: 0, maxWidth: 440, fontSize: 14.5, lineHeight: 1.45, color: x.t.texto2Encabezado }}>{p.descripcion}</p>
      )}
      {p.redes.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <RedesPagina redes={p.redes} variante="circulo" fondo="rgba(255,255,255,0.2)" trazo="#ffffff" clic={x.clic} />
        </div>
      )}
    </header>
  );
}

// ── Vitrina ────────────────────────────────────────────────────────────────

/**
 * El texto de Vitrina sobre la foto. La capa oscura crece con el texto: arriba
 * se funde con la foto y detrás de cada letra hay al menos la capa mínima
 * (60 % de negro), así un nombre largo nunca queda sobre la foto limpia.
 */
function TextoSobreFoto({ x, tamano, conPrincipal }: { x: PiezasArmado; tamano: number; conPrincipal: boolean }) {
  const { p, t } = x;
  const capa = t.capa;
  const texto = rubroYDescripcion(p);
  return (
    <div
      style={{
        position: "relative",
        padding: x.escritorio ? "96px 40px 40px" : "64px 20px 22px",
        background: capa
          ? `linear-gradient(to top, rgba(0,0,0,0.72) 0%, ${rgbaCapa(capa)} calc(100% - ${x.escritorio ? 96 : 64}px), rgba(0,0,0,0) 100%)`
          : undefined,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 8,
        color: t.textoEncabezado,
      }}
    >
      <LogoNegocio
        logo={x.logo}
        p={p}
        lado={x.escritorio ? 64 : 56}
        radio={16}
        fondoIniciales={x.c.acento}
        letra={x.letra}
        estilo={{ border: "2px solid rgba(255,255,255,0.85)" }}
      />
      <Nombre x={x} tamano={tamano} style={{ marginTop: 4, lineHeight: 1.05, letterSpacing: "-0.01em", color: t.textoEncabezado }} />
      {texto && <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.45, color: t.texto2Encabezado }}>{texto}</p>}
      {conPrincipal && x.principal && <div style={{ width: "100%", marginTop: 10 }}>{x.principal}</div>}
    </div>
  );
}

function fondoVitrina(x: PiezasArmado): CSSProperties {
  return x.portada
    ? {
        backgroundColor: "#1F2937",
        backgroundImage: `url("${x.portada}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { background: `linear-gradient(160deg, ${x.c.acento}, ${x.c.oscuro})` };
}

function Vitrina(x: PiezasArmado) {
  const { p, t, escritorio, Principal } = x;
  const redesPlanas = (
    <RedesPagina redes={p.redes} variante="plano" trazo={t.redTrazo} centradas={false} clic={x.clic} />
  );

  if (escritorio) {
    // Pantalla partida: la foto fija a la izquierda mientras se baja.
    return (
      <Raiz x={x} style={{ display: "grid", gridTemplateColumns: "minmax(0, 44%) minmax(0, 1fr)", alignItems: "start" }}>
        <header
          style={{
            position: "sticky",
            top: 0,
            height: x.altoPantalla,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            ...fondoVitrina(x),
          }}
        >
          <TextoSobreFoto x={x} tamano={tamanoNombre(p.nombre, 46)} conPrincipal={false} />
        </header>
        <Principal
          aria-label={x.etiquetaPrincipal}
          style={{ ...columna, gap: 16, padding: "48px 56px 40px", maxWidth: 780, boxSizing: "border-box" }}
        >
          {redesPlanas}
          {x.principal}
          {x.anuncio}
          <BotonesEnGrilla botones={x.botones} dos />
          {x.catalogo}
          {x.sucursales}
          {x.pie}
        </Principal>
      </Raiz>
    );
  }

  if (!x.portada) {
    // Sin foto, Vitrina cae al encabezado de color (el de Vivo): una portada
    // vacía a media pantalla se ve rota.
    return (
      <Raiz x={x}>
        <EncabezadoColor x={x} fondo={`linear-gradient(160deg, ${x.c.acento}, ${x.c.oscuro})`} padding="34px 20px 28px" />
        <Principal
          aria-label={x.etiquetaPrincipal}
          style={{ ...columna, gap: 14, padding: "20px 20px 24px", maxWidth: 520, margin: "0 auto" }}
        >
          {x.principal}
          {x.anuncio}
          {x.botones}
          {x.catalogo}
          {x.sucursales}
          {x.pie}
        </Principal>
      </Raiz>
    );
  }

  return (
    <Raiz x={x}>
      <header
        style={{
          minHeight: x.chico ? 400 : "max(380px, 65dvh)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          ...fondoVitrina(x),
        }}
      >
        <TextoSobreFoto x={x} tamano={tamanoNombre(p.nombre, 34)} conPrincipal />
      </header>
      <Principal
        aria-label={x.etiquetaPrincipal}
        style={{ ...columna, gap: 14, padding: "14px 20px 24px", maxWidth: 520, margin: "0 auto" }}
      >
        {redesPlanas}
        {x.anuncio}
        {x.botones}
        {x.catalogo}
        {x.sucursales}
        {x.pie}
      </Principal>
    </Raiz>
  );
}

// ── Vivo ───────────────────────────────────────────────────────────────────

function Vivo(x: PiezasArmado) {
  const { escritorio, Principal } = x;
  return (
    <Raiz x={x}>
      <div
        style={{
          ...columna,
          gap: 16,
          maxWidth: escritorio ? 560 : 480,
          margin: "0 auto",
          padding: escritorio ? "44px 0 0" : x.chico ? "26px 18px 0" : "34px 20px 0",
        }}
      >
        <EncabezadoColor x={x} fondo="transparent" padding="0" />
        {/* La portada, si hay, como una tarjeta: el color es el protagonista. */}
        <Portada
          x={x}
          proporcion="16 / 9"
          ancho={1600}
          alto={900}
          style={{ borderRadius: 18, boxShadow: "0 10px 30px rgba(0,0,0,0.25)", marginTop: 6 }}
        />
        <Principal aria-label={x.etiquetaPrincipal} style={{ ...columna, gap: 14, paddingBottom: escritorio ? 40 : 24 }}>
          {x.anuncio}
          {x.principal}
          <BotonesEnGrilla botones={x.botones} dos={escritorio} />
          {x.catalogo}
          {x.sucursales}
          {x.pie}
        </Principal>
      </div>
    </Raiz>
  );
}

// ── Noche ──────────────────────────────────────────────────────────────────

function Noche(x: PiezasArmado) {
  const { p, c, t, escritorio, chico, Principal } = x;
  const fondo: CSSProperties = x.portada
    ? {
        backgroundColor: NOCHE.fondo,
        backgroundImage: `url("${x.portada}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        // Sin foto: negro con un brillo suave del color en la esquina.
        backgroundColor: NOCHE.fondo,
        backgroundImage: `radial-gradient(circle at 85% 12%, ${conAlfa(c.acento, BRILLO_NOCHE)} 0%, rgba(0,0,0,0) 62%)`,
      };
  const texto = rubroYDescripcion(p);
  const identidad = (
    <div style={{ ...columna, position: "relative", alignItems: "flex-start" }}>
      {x.logo && (
        <LogoNegocio
          logo={x.logo}
          p={p}
          lado={escritorio ? 60 : 52}
          radio={6}
          fondoIniciales={c.acento}
          letra={x.letra}
          estilo={{ marginBottom: 14, border: "1px solid rgba(255,255,255,0.3)" }}
        />
      )}
      <Nombre
        x={x}
        tamano={tamanoNombre(p.nombre, escritorio ? 84 : chico ? 50 : 58)}
        style={{ lineHeight: 0.95, letterSpacing: "0.02em", textTransform: "uppercase", color: t.textoEncabezado }}
      />
      <span aria-hidden="true" style={{ display: "block", width: 56, height: 3, background: t.titulo, margin: "12px 0 10px" }} />
      {texto && <p style={{ margin: 0, fontSize: escritorio ? 16 : 14, lineHeight: 1.45, color: t.texto2Encabezado }}>{texto}</p>}
    </div>
  );
  const capa = t.capa && <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: rgbaCapa(t.capa) }} />;
  const redes = (
    <RedesPagina redes={p.redes} variante="cuadrado" trazo={t.redTrazo} borde={NOCHE.bordeChip} centradas={false} clic={x.clic} />
  );

  if (escritorio) {
    return (
      <Raiz x={x}>
        <header style={{ position: "relative", minHeight: 340, display: "flex", alignItems: "flex-end", ...fondo }}>
          {capa}
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 1120,
              margin: "0 auto",
              padding: "48px 32px 34px",
              boxSizing: "border-box",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 40,
            }}
          >
            <div style={{ flex: "1 1 420px", minWidth: 0 }}>{identidad}</div>
            {x.principal && <div style={{ flex: "0 0 320px" }}>{x.principal}</div>}
          </div>
        </header>
        <Principal
          aria-label={x.etiquetaPrincipal}
          style={{ ...columna, gap: 14, maxWidth: 1120, margin: "0 auto", padding: "26px 32px 40px", boxSizing: "border-box" }}
        >
          {redes}
          {x.anuncio}
          <BotonesEnGrilla botones={x.botones} dos />
          {x.catalogo}
          {x.sucursales}
          {x.pie}
        </Principal>
      </Raiz>
    );
  }

  return (
    <Raiz x={x}>
      <header
        style={{
          position: "relative",
          minHeight: chico ? 240 : 280,
          boxSizing: "border-box",
          padding: "28px 20px 22px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          ...fondo,
        }}
      >
        {capa}
        {identidad}
      </header>
      <Principal
        aria-label={x.etiquetaPrincipal}
        style={{ ...columna, gap: 12, padding: "18px 20px 24px", maxWidth: 520, margin: "0 auto" }}
      >
        {redes}
        {x.principal}
        {x.anuncio}
        {x.botones}
        {x.catalogo}
        {x.sucursales}
        {x.pie}
      </Principal>
    </Raiz>
  );
}

// ── Boutique ───────────────────────────────────────────────────────────────

function Boutique(x: PiezasArmado) {
  const { p, c, t, escritorio, chico, Principal } = x;
  const lado = chico ? 72 : 80;
  const encabezado = (
    <header style={{ ...columna, alignItems: "center", gap: 10, textAlign: "center" }}>
      {/* El logo dentro de un marco fino, con aire alrededor. */}
      <div style={{ padding: 5, border: `1px solid ${t.texto}`, borderRadius: 999 }}>
        <LogoNegocio logo={x.logo} p={p} lado={lado} radio={999} fondoIniciales={c.acento} letra={x.letra} />
      </div>
      <Nombre x={x} tamano={escritorio ? 40 : 36} style={{ marginTop: 6, lineHeight: 1.05, color: t.textoEncabezado }} />
      {p.rubro && (
        <span style={{ fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", color: t.texto3 }}>{p.rubro}</span>
      )}
      <span aria-hidden="true" style={{ display: "block", width: 40, height: 2, background: c.acento, margin: "4px 0" }} />
      {p.descripcion && (
        <p style={{ margin: 0, maxWidth: 380, fontSize: 15, fontStyle: "italic", lineHeight: 1.5, color: t.texto2Encabezado }}>
          {p.descripcion}
        </p>
      )}
      {p.redes.length > 0 && (
        <div style={{ marginTop: 2 }}>
          <RedesPagina redes={p.redes} variante="plano" trazo={t.redTrazo} clic={x.clic} />
        </div>
      )}
    </header>
  );
  // La portada como una ventana: rectángulo con arco arriba, con margen.
  const ventana = <Portada x={x} proporcion="4 / 3" ancho={1200} alto={900} style={{ borderRadius: "999px 999px 0 0" }} />;
  const contenido = (
    <>
      {x.anuncio}
      {x.principal}
      {x.botones.length > 0 && <div style={{ ...columna, gap: 8 }}>{x.botones}</div>}
      {x.catalogo}
      {x.sucursales && <div style={{ ...columna, alignItems: "stretch" }}>{x.sucursales}</div>}
      {x.pie}
    </>
  );

  if (escritorio) {
    return (
      <Raiz x={x}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "60px 64px 0",
            boxSizing: "border-box",
            display: "grid",
            gridTemplateColumns: "minmax(0, 420px) minmax(0, 1fr)",
            gap: 72,
            alignItems: "start",
          }}
        >
          <div style={{ ...columna, gap: 24, position: "sticky", top: 40 }}>
            {encabezado}
            {ventana}
          </div>
          <Principal aria-label={x.etiquetaPrincipal} style={{ ...columna, gap: 18, padding: "20px 0 40px" }}>
            {contenido}
          </Principal>
        </div>
      </Raiz>
    );
  }

  return (
    <Raiz x={x}>
      <div
        style={{
          ...columna,
          gap: 20,
          maxWidth: 480,
          margin: "0 auto",
          padding: chico ? "32px 22px 0" : "40px 26px 0",
        }}
      >
        {encabezado}
        {ventana}
        <Principal aria-label={x.etiquetaPrincipal} style={{ ...columna, gap: 18, paddingBottom: 24 }}>
          {contenido}
        </Principal>
      </div>
    </Raiz>
  );
}

/** El armado del estilo de la página (todos menos el Clásico). */
export default function ArmadoEstilo(x: PiezasArmado) {
  switch (x.estilo.clave) {
    case "VITRINA":
      return <Vitrina {...x} />;
    case "VIVO":
      return <Vivo {...x} />;
    case "NOCHE":
      return <Noche {...x} />;
    case "POSTAL":
      return <ArmadoPostal {...x} />;
    case "CARTA":
      return <ArmadoCarta {...x} />;
    case "DULCE":
      return <ArmadoDulce {...x} />;
    case "MOSAICO":
      return <ArmadoMosaico {...x} />;
    default:
      return <Boutique {...x} />;
  }
}
