import "./animado.css";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import IconoProducto from "../../components/IconoProducto";
import { conAnimacion, type Escena } from "../../lib/menuDigital/animado";
import { coloresMenu, conAlfa } from "../../lib/menuDigital/colores";
import { filasFotos, LETRA, precioTv, simboloMoneda, type BloqueLista, type PlatoTv } from "../../lib/menuDigital/paginar";
import { TEXTO_ETIQUETA, type EtiquetaPlato } from "../../types/menuDigital";
import type { DatosTableroMenu } from "./TableroMenu";

/**
 * Una TV animada del menú digital (Presentación, Carrusel o Mosaico) sobre el
 * mismo lienzo de 1600 × 900 que TableroMenu: lo que se ve en el editor es lo
 * que ve el local.
 *
 * Dibuja UNA escena (la que le pasan); qué escena toca y cuánto dura lo decide
 * `armarAnimacion` y el reloj es `useRelojEscenas`. El encabezado y la cinta
 * de abajo no se vuelven a montar al cambiar de escena: sólo el medio entra
 * animado, así el título no "parpadea" cada seis segundos.
 *
 * `quieto` es para las miniaturas del editor: la escena terminada, sin nada
 * que se mueva (cuatro TVs animándose en una fila cansan la vista).
 *
 * El logo se mueve siempre (Kevin, 8-nov: "que el logo que pongan sea animado
 * siempre"): flota, da un saltito cada tanto y lo cruza un brillo.
 */

type Colores = ReturnType<typeof coloresMenu>;

const REBOTE = "cubic-bezier(0.2, 0.9, 0.3, 1.3)";
const SUAVE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/**
 * La animación de un elemento. Las que se repiten van sin `fill` hacia atrás:
 * con `both`, mientras esperan su demora pisaban el transform de la animación
 * de entrada del mismo elemento.
 */
function anim(nombre: string, ms: number, o: { demora?: number; curva?: string; repetir?: boolean } = {}): CSSProperties {
  const veces = o.repetir ? "infinite" : "1";
  const fill = o.repetir ? "none" : "both";
  return { animation: `${nombre} ${Math.max(1, Math.round(ms))}ms ${o.curva ?? SUAVE} ${Math.round(o.demora ?? 0)}ms ${veces} normal ${fill}` };
}

export function TableroAnimado({
  datos,
  escena,
  vuelta,
  cinta,
  quieto = false,
  pausado = false,
}: {
  datos: DatosTableroMenu;
  escena: Escena | undefined;
  /** Cambia en cada paso del reloj: vuelve a montar la escena para que entre animada. */
  vuelta: number;
  /** Lo que corre por la cinta de abajo (las bebidas, en Carrusel y Mosaico). */
  cinta: PlatoTv[];
  quieto?: boolean;
  /** El editor la frenó en una escena: la presentación no se desvanece al terminar. */
  pausado?: boolean;
}) {
  const p = datos.pantalla;
  const a = conAnimacion(p);
  const c = coloresMenu(p);
  const presentacion = a.animado === "presentacion";
  const pantallaEntera = escena?.tipo === "intro";
  const conCinta = !presentacion && (cinta.length > 0 || !!p.cinta);
  const arriba = presentacion ? 140 : 166;
  const abajo = presentacion ? 76 : conCinta ? 92 : 36;
  const cuerpo: CSSProperties = pantallaEntera ? { inset: 0 } : { top: arriba, bottom: abajo, left: 56, right: 56 };

  return (
    <div
      className={`md-tablero relative overflow-hidden ${quieto ? "md-quieto" : ""}`}
      style={{ width: 1600, height: 900, background: c.fondo, color: c.texto }}
    >
      <Fondo c={c} />
      {!pantallaEntera && <Encabezado datos={datos} c={c} chico={presentacion} />}
      <div className="absolute" style={cuerpo}>
        {escena && <Cuerpo escena={escena} datos={datos} c={c} vuelta={vuelta} alto={900 - arriba - abajo} quieto={quieto} pausado={pausado} />}
      </div>
      {!pantallaEntera && presentacion && <PieDePresentacion datos={datos} c={c} escena={escena} vuelta={vuelta} />}
      {!pantallaEntera && conCinta && <CintaQueCorre datos={datos} c={c} platos={cinta} />}
    </div>
  );
}

function Cuerpo({
  escena: e,
  datos,
  c,
  vuelta,
  alto,
  quieto,
  pausado,
}: {
  escena: Escena;
  datos: DatosTableroMenu;
  c: Colores;
  vuelta: number;
  alto: number;
  quieto: boolean;
  pausado: boolean;
}) {
  // Cada escena con la vuelta en la key: se vuelve a montar y entra animada,
  // aunque sea el mismo plato. El Carrusel maneja sus keys adentro.
  switch (e.tipo) {
    case "intro":
      return <Intro key={vuelta} datos={datos} c={c} ms={e.ms} sinSalida={pausado || quieto} />;
    case "categoria":
      return <Categoria key={vuelta} nombre={e.nombre} cuantos={e.cuantos} c={c} />;
    case "plato":
      return <PlatoGrande key={vuelta} e={e} datos={datos} c={c} />;
    case "grupo":
      return <Grupo key={vuelta} e={e} datos={datos} c={c} />;
    case "carrusel":
      return <Carrusel e={e} datos={datos} c={c} vuelta={vuelta} />;
    case "mosaico":
      return <Mosaico key={vuelta} e={e} datos={datos} c={c} alto={alto} quieto={quieto} />;
  }
}

// ── Lo que queda fijo ─────────────────────────────────────────────────────

/** Dos manchas de luz del color del tema que van y vienen despacio. */
function Fondo({ c }: { c: Colores }) {
  const mancha = (extra: CSSProperties): CSSProperties => ({
    position: "absolute",
    borderRadius: "50%",
    pointerEvents: "none",
    background: `radial-gradient(circle, ${conAlfa(c.acento, 0.2)}, transparent 65%)`,
    ...extra,
  });
  return (
    <>
      <div style={mancha({ width: 900, height: 900, left: -260, top: -320, ...anim("md-deriva", 18000, { repetir: true, curva: "ease-in-out" }) })} />
      <div
        style={mancha({
          width: 1000,
          height: 1000,
          right: -320,
          bottom: -380,
          ...anim("md-deriva", 24000, { repetir: true, curva: "ease-in-out", demora: -9000 }),
        })}
      />
    </>
  );
}

/** El logo que nunca está quieto: flota, salta cada tanto y lo cruza un brillo. */
function LogoVivo({ src, alt, alto, ancho }: { src: string; alt: string; alto: number; ancho: number }) {
  const mascara = `url("${src}")`;
  return (
    <div className="shrink-0" style={anim("md-mecer", 5200, { repetir: true, curva: "ease-in-out" })}>
      <div className="relative w-fit" style={anim("md-salto", 9000, { repetir: true, curva: "ease-in-out", demora: 2500 })}>
        <img src={src} alt={alt} className="block" style={{ maxHeight: alto, maxWidth: ancho, objectFit: "contain" }} />
        <span className="md-brillo" style={{ WebkitMaskImage: mascara, maskImage: mascara }} />
      </div>
    </div>
  );
}

function Encabezado({ datos, c, chico }: { datos: DatosTableroMenu; c: Colores; chico: boolean }) {
  const p = datos.pantalla;
  const a = conAnimacion(p);
  const logo =
    p.logo && datos.logo ? (
      <LogoVivo src={datos.url(datos.logo)} alt={datos.negocio} alto={chico ? 84 : 108} ancho={chico ? 230 : 290} />
    ) : null;
  const izquierda = a.ladoLogo === "izquierda";
  return (
    <header className="absolute flex items-center" style={{ top: 28, left: 56, right: 56, height: chico ? 92 : 116, gap: 30 }}>
      {izquierda && logo}
      <div className="min-w-0 flex-1" style={anim(izquierda ? "md-entra-der" : "md-entra-izq", 800)}>
        <h1 className="truncate font-black" style={{ fontSize: chico ? 48 : 60, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
          {p.titulo || datos.negocio}
        </h1>
        {p.subtitulo && (
          <p className="truncate" style={{ fontSize: chico ? 22 : 26, opacity: 0.82, marginTop: 4 }}>
            {p.subtitulo}
          </p>
        )}
        <span
          className="block"
          style={{ width: 120, height: 6, borderRadius: 99, background: c.acento, marginTop: 8, transformOrigin: "left", ...anim("md-barra", 700, { demora: 400 }) }}
        />
      </div>
      {!izquierda && logo}
    </header>
  );
}

/** Abajo en la Presentación: la cinta del dueño y la barra que cuenta lo que le queda al plato. */
function PieDePresentacion({ datos, c, escena, vuelta }: { datos: DatosTableroMenu; c: Colores; escena: Escena | undefined; vuelta: number }) {
  const cuenta = escena && (escena.tipo === "plato" || escena.tipo === "grupo");
  return (
    <>
      {datos.pantalla.cinta && (
        <p className="absolute truncate font-semibold" style={{ left: 56, right: 56, bottom: 26, fontSize: 24, opacity: 0.9 }}>
          {datos.pantalla.cinta}
        </p>
      )}
      {cuenta && (
        <span
          key={vuelta}
          className="absolute"
          style={{ left: 0, bottom: 0, height: 10, width: "100%", background: c.acento, transformOrigin: "left", ...anim("md-barra", escena.ms, { curva: "linear" }) }}
        />
      )}
    </>
  );
}

/**
 * La cinta que corre abajo: el texto del dueño y las bebidas con su precio
 * ("las bebidas en otro lado"). Se repite hasta pasar el ancho de la TV: con
 * dos bebidas y sin texto, la vuelta dejaba media pantalla vacía.
 */
function CintaQueCorre({ datos, c, platos }: { datos: DatosTableroMenu; c: Colores; platos: PlatoTv[] }) {
  const p = datos.pantalla;
  const piezas: { clave: string; nodo: ReactNode; largo: number }[] = [];
  if (p.cinta) {
    piezas.push({ clave: "texto", nodo: <span className="font-black">{p.cinta}</span>, largo: p.cinta.length * 17 + 60 });
  }
  for (const x of platos) {
    piezas.push({
      clave: `p${x.id}`,
      largo: x.nombre.length * 17 + 230,
      nodo: (
        <span className="inline-flex items-center" style={{ gap: 12, opacity: x.agotado ? 0.6 : 1 }}>
          <Imagen plato={x} datos={datos} lado={48} conFoto={p.fotos} redondo />
          <span className="font-extrabold" style={{ textDecoration: x.agotado ? "line-through" : undefined }}>
            {x.nombre}
          </span>
          <span className="font-black tabular-nums">
            <span style={{ fontSize: 16, verticalAlign: "top", marginRight: 2 }}>{simboloMoneda(datos.moneda)}</span>
            {precioTv(x.precio)}
          </span>
        </span>
      ),
    });
  }
  const largo = piezas.reduce((s, x) => s + x.largo, 0) || 1;
  const veces = Math.max(1, Math.ceil(1700 / largo));
  const segundos = Math.max(18, (largo * veces) / 110);
  const tira = (copia: number) => (
    <div className="flex shrink-0 items-center" aria-hidden={copia > 0 || undefined}>
      {Array.from({ length: veces }, (_, v) =>
        piezas.map((x) => (
          <span key={`${copia}-${v}-${x.clave}`} className="flex shrink-0 items-center" style={{ paddingRight: 36 }}>
            {x.nodo}
            <span style={{ width: 12, height: 12, borderRadius: 99, background: c.sobreAcento, opacity: 0.55, marginLeft: 36 }} />
          </span>
        )),
      )}
    </div>
  );
  return (
    <div
      className="absolute flex items-center overflow-hidden whitespace-nowrap"
      style={{ left: 0, right: 0, bottom: 0, height: 70, background: c.acento, color: c.sobreAcento, fontSize: 28 }}
    >
      <div className="md-cinta-pista" style={{ animationDuration: `${segundos}s` }}>
        {tira(0)}
        {tira(1)}
      </div>
    </div>
  );
}

// ── Piezas ────────────────────────────────────────────────────────────────

function Precio({ valor, moneda, tam, c, color }: { valor: number; moneda?: string; tam: number; c: Colores; color?: string }) {
  return (
    <span className="shrink-0 whitespace-nowrap font-black tabular-nums" style={{ color: color ?? c.acento, lineHeight: 1 }}>
      <span style={{ fontSize: Math.round(tam * 0.42), verticalAlign: "top", marginRight: 3 }}>{simboloMoneda(moneda)}</span>
      <span style={{ fontSize: tam }}>{precioTv(valor)}</span>
    </span>
  );
}

function Etiqueta({ etiqueta, c, tam = 15 }: { etiqueta: EtiquetaPlato; c: Colores; tam?: number }) {
  return (
    <span
      className="inline-block font-extrabold uppercase"
      style={{ background: c.acento, color: c.sobreAcento, fontSize: tam, letterSpacing: "0.1em", borderRadius: 999, padding: `${Math.round(tam / 3)}px ${tam}px` }}
    >
      {TEXTO_ETIQUETA[etiqueta]}
    </span>
  );
}

/** La foto del plato o, sin foto (o con las fotos apagadas), su ícono. */
function Imagen({
  plato,
  datos,
  lado,
  conFoto,
  redondo = false,
}: {
  plato: PlatoTv;
  datos: DatosTableroMenu;
  lado: number;
  conFoto: boolean;
  redondo?: boolean;
}) {
  if (conFoto && plato.foto) {
    return (
      <img
        src={datos.url(plato.foto)}
        alt=""
        className="shrink-0 object-cover"
        style={{ width: lado, height: lado, borderRadius: redondo ? "50%" : Math.round(lado * 0.16), filter: plato.agotado ? "grayscale(1)" : undefined }}
      />
    );
  }
  return (
    <span className="inline-flex shrink-0" style={{ opacity: plato.agotado ? 0.5 : 1 }}>
      <IconoProducto nombre={plato.nombre} icono={plato.icono} size={lado} />
    </span>
  );
}

/** "AGOTADO" como un sello que cae encima de la foto. */
function Sello({ tam = 64 }: { tam?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span
        className="font-black uppercase"
        style={{
          transform: "rotate(-14deg)",
          border: "6px solid #FFFFFF",
          color: "#FFFFFF",
          background: "rgba(190, 18, 18, 0.88)",
          fontSize: tam,
          letterSpacing: "0.1em",
          padding: "6px 26px",
          borderRadius: 16,
          ...anim("md-sello", 650, { demora: 500 }),
        }}
      >
        Agotado
      </span>
    </div>
  );
}

/** Los puntos de una estrella de `puntas` en un cuadro de 100 × 100. */
function puntosEstrella(puntas: number, interior: number): string {
  const r: string[] = [];
  for (let i = 0; i < puntas * 2; i++) {
    const radio = i % 2 === 0 ? 50 : interior;
    const ang = (Math.PI * i) / puntas - Math.PI / 2;
    r.push(`${(50 + radio * Math.cos(ang)).toFixed(2)},${(50 + radio * Math.sin(ang)).toFixed(2)}`);
  }
  return r.join(" ");
}
const ESTRELLA = puntosEstrella(18, 43);

/** El precio en una estrella de oferta: entra de un golpe, late y la estrella gira despacio. */
function Estrella({ valor, moneda, c, lado, demora }: { valor: number; moneda?: string; c: Colores; lado: number; demora: number }) {
  const texto = precioTv(valor);
  return (
    <div style={{ width: lado, height: lado, ...anim("md-pop", 800, { demora, curva: REBOTE }) }}>
      <div className="relative flex h-full w-full items-center justify-center" style={anim("md-latido", 1700, { repetir: true, demora: demora + 900, curva: "ease-in-out" })}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" style={anim("md-girar", 30000, { repetir: true, curva: "linear" })}>
          <polygon points={ESTRELLA} fill={c.acento} />
        </svg>
        <span className="relative font-black tabular-nums" style={{ color: c.sobreAcento, lineHeight: 1 }}>
          <span style={{ fontSize: Math.round(lado * 0.13), verticalAlign: "top", marginRight: 4 }}>{simboloMoneda(moneda)}</span>
          <span style={{ fontSize: Math.round(lado * (texto.length > 4 ? 0.24 : texto.length > 3 ? 0.28 : 0.36)) }}>{texto}</span>
        </span>
      </div>
    </div>
  );
}

/** Puntitos o burbujas que suben. Lugares fijos (no al azar): la misma TV se ve igual cada vuelta. */
function Particulas({ c, cuantas, burbujas = false }: { c: Colores; cuantas: number; burbujas?: boolean }) {
  return (
    <>
      {Array.from({ length: cuantas }, (_, i) => {
        const lado = burbujas ? 18 + ((i * 13) % 40) : 8 + ((i * 7) % 12);
        const ms = 5200 + ((i * 731) % 4200);
        return (
          <span
            key={i}
            className="md-particula pointer-events-none absolute rounded-full"
            style={{
              left: `${(i * 37 + 5) % 100}%`,
              bottom: -60,
              width: lado,
              height: lado,
              background: burbujas ? "transparent" : i % 2 ? c.acento : conAlfa(c.texto, 0.7),
              border: burbujas ? `3px solid ${conAlfa(c.texto, 0.35)}` : undefined,
              ...anim("md-subir", ms, { repetir: true, curva: "ease-in", demora: -((i * 977) % ms) }),
            }}
          />
        );
      })}
    </>
  );
}

/**
 * Cada letra cae en su lugar, una detrás de otra; las palabras no se parten.
 * Entre palabra y palabra va un espacio de verdad (no un margen): si no, el
 * texto del título era "PollosTíoFabio" para quien lo lee o lo copia.
 */
function Letras({ texto, demora }: { texto: string; demora: number }) {
  let n = 0;
  const palabras = texto.split(" ").filter(Boolean);
  return (
    <>
      {palabras.map((palabra, w) => (
        <span key={w}>
          <span className="inline-block whitespace-nowrap">
            {[...palabra].map((l, k) => (
              <span key={k} className="inline-block" style={anim("md-letra", 650, { demora: demora + n++ * 45, curva: REBOTE })}>
                {l}
              </span>
            ))}
          </span>
          {w < palabras.length - 1 && " "}
        </span>
      ))}
    </>
  );
}

// ── Las escenas ───────────────────────────────────────────────────────────

/** El logo en grande con el nombre: lo primero de cada vuelta. */
function Intro({ datos, c, ms, sinSalida }: { datos: DatosTableroMenu; c: Colores; ms: number; sinSalida: boolean }) {
  const p = datos.pantalla;
  const a = conAnimacion(p);
  const nombre = a.textoIntro || datos.negocio || p.titulo;
  const logo = p.logo && datos.logo ? datos.url(datos.logo) : null;
  const hayLogo = !!logo;
  const tam = nombre.length > 28 ? 64 : nombre.length > 18 ? 82 : hayLogo ? 104 : 150;
  const finLetras = 1000 + nombre.replace(/\s/g, "").length * 45;
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden" style={sinSalida ? undefined : anim("md-salida", 700, { demora: ms - 700, curva: "ease-in" })}>
      <div
        className="pointer-events-none absolute"
        style={{
          width: 2600,
          height: 2600,
          left: 800 - 1300,
          top: 400 - 1300,
          borderRadius: "50%",
          background: `repeating-conic-gradient(${conAlfa(c.acento, 0.16)} 0deg 7deg, transparent 7deg 18deg)`,
          ...anim("md-girar", 60000, { repetir: true, curva: "linear" }),
        }}
      />
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 50% 44%, transparent 0%, ${conAlfa(c.fondo, 0.25)} 32%, ${c.fondo} 80%)` }} />
      <Particulas c={c} cuantas={16} />
      <div className="relative flex flex-col items-center text-center" style={{ maxWidth: 1440 }}>
        {logo && (
          <div className="relative flex items-center justify-center" style={{ marginBottom: 30 }}>
            {[0, 1].map((i) => (
              <span
                key={i}
                className="md-particula pointer-events-none absolute rounded-full"
                style={{ width: 470, height: 470, left: "50%", top: "50%", marginLeft: -235, marginTop: -235, border: `8px solid ${conAlfa(c.acento, 0.75)}`, ...anim("md-onda", 2600, { repetir: true, demora: 900 + i * 1300, curva: "ease-out" }) }}
              />
            ))}
            <div style={anim("md-pop", 1100, { curva: REBOTE })}>
              <div style={anim("md-flotar", 3400, { repetir: true, demora: 1100, curva: "ease-in-out" })}>
                <div className="relative w-fit">
                  <img
                    src={logo}
                    alt={datos.negocio}
                    className="block"
                    style={{ maxHeight: 400, maxWidth: 620, objectFit: "contain", filter: `drop-shadow(0 18px 40px ${conAlfa("#000000", 0.45)})` }}
                  />
                  <span className="md-brillo" style={{ WebkitMaskImage: `url("${logo}")`, maskImage: `url("${logo}")` }} />
                </div>
              </div>
            </div>
          </div>
        )}
        {/* El nombre entero en la etiqueta: letra por letra se leía "PollosTíoFabio". */}
        <h1 aria-label={nombre} className="font-black" style={{ fontSize: tam, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
          <span aria-hidden="true">
            <Letras texto={nombre} demora={hayLogo ? 1000 : 300} />
          </span>
        </h1>
        <span
          className="block"
          style={{ width: 380, height: 10, borderRadius: 99, background: c.acento, marginTop: 24, ...anim("md-barra", 700, { demora: finLetras }) }}
        />
        {p.subtitulo && (
          <p className="font-semibold" style={{ fontSize: 36, marginTop: 20, opacity: 0.92, ...anim("md-entra-arriba", 700, { demora: finLetras + 300 }) }}>
            {p.subtitulo}
          </p>
        )}
      </div>
    </div>
  );
}

/** El título de la categoría que viene ("PLATOS", "BEBIDAS") en una franja que cruza la pantalla. */
function Categoria({ nombre, cuantos, c }: { nombre: string; cuantos: number; c: Colores }) {
  const tam = nombre.length > 22 ? 80 : nombre.length > 14 ? 104 : 150;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <div
        className="absolute"
        style={{
          left: -56,
          right: -56,
          top: "50%",
          height: 310,
          marginTop: -155,
          background: c.acento,
          transformOrigin: "left",
          ...anim("md-barra", 600, { curva: "cubic-bezier(0.7, 0, 0.2, 1)" }),
        }}
      />
      <h2
        className="relative max-w-full truncate font-black uppercase"
        style={{ color: c.sobreAcento, fontSize: tam, lineHeight: 1.05, letterSpacing: "0.05em", ...anim("md-entra-zoom", 700, { demora: 350, curva: REBOTE }) }}
      >
        {nombre}
      </h2>
      <p className="relative font-bold" style={{ color: c.sobreAcento, fontSize: 34, opacity: 0.85, marginTop: 6, ...anim("md-entra-arriba", 600, { demora: 750 }) }}>
        {cuantos} {cuantos === 1 ? "opción" : "opciones"}
      </p>
    </div>
  );
}

/** Presentación: un plato solo, en toda la pantalla. */
function PlatoGrande({ e, datos, c }: { e: Extract<Escena, { tipo: "plato" }>; datos: DatosTableroMenu; c: Colores }) {
  const x = e.plato;
  const p = datos.pantalla;
  const tamNombre = x.nombre.length > 24 ? 64 : x.nombre.length > 14 ? 80 : 96;
  return (
    <div className="absolute inset-0 flex items-center" style={{ gap: 56 }}>
      <div className="relative flex shrink-0 items-center justify-center" style={{ width: 760, height: "100%" }}>
        <div
          className="pointer-events-none absolute"
          style={{
            width: 900,
            height: 900,
            left: -70,
            top: "calc(50% - 450px)",
            borderRadius: "50%",
            background: `repeating-conic-gradient(${conAlfa(c.acento, 0.13)} 0deg 8deg, transparent 8deg 20deg)`,
            ...anim("md-girar", 40000, { repetir: true, curva: "linear" }),
          }}
        />
        <div className="pointer-events-none absolute" style={{ width: 720, height: 720, left: 20, top: "calc(50% - 360px)", borderRadius: "50%", background: `radial-gradient(circle, ${conAlfa(c.acento, 0.42)}, transparent 68%)` }} />
        <div className="relative" style={anim("md-entra-izq", 850, { curva: "cubic-bezier(0.2, 0.9, 0.3, 1.1)" })}>
          {p.fotos && x.foto ? (
            <div className="overflow-hidden" style={{ width: 720, height: 540, borderRadius: 40, border: `6px solid ${conAlfa(c.texto, 0.9)}`, boxShadow: "0 30px 80px rgba(0,0,0,0.45)" }}>
              <img
                src={datos.url(x.foto)}
                alt=""
                className="h-full w-full object-cover"
                style={{ filter: x.agotado ? "grayscale(1)" : undefined, ...anim("md-ken", e.ms, { curva: "linear" }) }}
              />
            </div>
          ) : (
            <div style={anim("md-flotar", 3200, { repetir: true, curva: "ease-in-out" })}>
              <Imagen plato={x} datos={datos} lado={440} conFoto={false} />
            </div>
          )}
          {x.agotado && <Sello tam={72} />}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="font-extrabold uppercase" style={{ color: c.acento, fontSize: 26, letterSpacing: "0.2em", ...anim("md-entra-arriba", 600, { demora: 200 }) }}>
          {e.categoria} · {e.numero} de {e.de}
        </p>
        <h2
          className="font-black"
          style={{
            fontSize: tamNombre,
            lineHeight: 1.02,
            marginTop: 14,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            textDecoration: x.agotado ? "line-through" : undefined,
            ...anim("md-entra-der", 750, { demora: 300 }),
          }}
        >
          {x.nombre}
        </h2>
        {p.etiquetas && x.etiqueta && !x.agotado && (
          <div style={{ marginTop: 18, ...anim("md-entra-izq", 600, { demora: 1000, curva: REBOTE }) }}>
            <Etiqueta etiqueta={x.etiqueta} c={c} tam={22} />
          </div>
        )}
        {p.descripciones && x.descripcion && (
          <p style={{ fontSize: 30, lineHeight: 1.3, opacity: 0.86, marginTop: 18, ...anim("md-entra-arriba", 700, { demora: 550 }) }}>{x.descripcion}</p>
        )}
        <div style={{ marginTop: 26 }}>
          {x.agotado ? (
            <span className="font-black uppercase" style={{ fontSize: 56, letterSpacing: "0.12em", opacity: 0.85 }}>
              Agotado
            </span>
          ) : (
            <Estrella valor={x.precio} moneda={datos.moneda} c={c} lado={290} demora={800} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Presentación: las bebidas en grupo, con burbujas que suben. */
function Grupo({ e, datos, c }: { e: Extract<Escena, { tipo: "grupo" }>; datos: DatosTableroMenu; c: Colores }) {
  const p = datos.pantalla;
  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Recortadas al medio: si no, subían por encima del título de la TV. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <Particulas c={c} cuantas={14} burbujas />
      </div>
      <div className="relative flex shrink-0 items-end justify-between" style={{ marginBottom: 20 }}>
        <h2 className="truncate font-black uppercase" style={{ color: c.acento, fontSize: 62, lineHeight: 1, letterSpacing: "0.05em", ...anim("md-entra-izq", 700) }}>
          {e.titulo}
        </h2>
        {e.partes > 1 && (
          <span className="shrink-0 font-bold" style={{ fontSize: 26, opacity: 0.8 }}>
            {e.parte} / {e.partes}
          </span>
        )}
      </div>
      <div className="relative grid min-h-0 flex-1" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gridTemplateRows: "repeat(2, minmax(0, 1fr))", gap: 22 }}>
        {e.platos.map((x, i) => (
          <div key={x.id} className="min-h-0" style={anim("md-entra-arriba", 700, { demora: 250 + i * 110, curva: REBOTE })}>
            <article
              className="flex h-full flex-col items-center justify-center text-center"
              style={{ background: c.tarjeta, border: `2px solid ${c.borde}`, borderRadius: 28, padding: "12px 16px", opacity: x.agotado ? 0.55 : 1 }}
            >
              <div style={anim("md-mecer", 3600 + (i % 3) * 500, { repetir: true, demora: -i * 400, curva: "ease-in-out" })}>
                <Imagen plato={x} datos={datos} lado={136} conFoto={p.fotos} />
              </div>
              <h3
                className="w-full truncate font-extrabold"
                style={{ fontSize: 27, lineHeight: 1.15, marginTop: 8, textDecoration: x.agotado ? "line-through" : undefined }}
              >
                {x.nombre}
              </h3>
              <div style={{ marginTop: 6 }}>
                {x.agotado ? (
                  <span className="font-extrabold uppercase" style={{ fontSize: 22, letterSpacing: "0.12em" }}>
                    Agotado
                  </span>
                ) : (
                  <Precio valor={x.precio} moneda={datos.moneda} tam={44} c={c} />
                )}
              </div>
            </article>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Carrusel: el protagonista pasa plato por plato y la lista de al lado marca
 * cuál es. El protagonista entra en cada paso; la lista sólo cuando cambia de
 * página (su key es el primer plato de la página): si entrara de nuevo cada
 * seis segundos, la carta se leería a saltos.
 */
function Carrusel({ e, datos, c, vuelta }: { e: Extract<Escena, { tipo: "carrusel" }>; datos: DatosTableroMenu; c: Colores; vuelta: number }) {
  const x = e.heroe;
  const p = datos.pantalla;
  const pagina = e.columna[0]?.platos[0]?.id ?? 0;
  return (
    <div className="absolute inset-0 flex" style={{ gap: 48 }}>
      <article
        key={vuelta}
        className="relative flex shrink-0 flex-col overflow-hidden"
        style={{ width: 620, background: c.tarjeta, border: `1.5px solid ${c.borde}`, borderRadius: 30, ...anim("md-entra-zoom", 600) }}
      >
        <div className="relative shrink-0 overflow-hidden" style={{ height: 390 }}>
          <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 55%, ${conAlfa(c.acento, 0.45)}, transparent 70%)` }} />
          <div className="absolute inset-0 flex items-center justify-center" style={anim("md-entra-der", 750, { curva: "cubic-bezier(0.2, 0.9, 0.3, 1.1)" })}>
            {p.fotos && x.foto ? (
              <img
                src={datos.url(x.foto)}
                alt=""
                className="h-full w-full object-cover"
                style={{ filter: x.agotado ? "grayscale(1)" : undefined, ...anim("md-ken", e.ms, { curva: "linear" }) }}
              />
            ) : (
              <div style={anim("md-flotar", 3200, { repetir: true, curva: "ease-in-out" })}>
                <Imagen plato={x} datos={datos} lado={290} conFoto={false} />
              </div>
            )}
          </div>
          {p.etiquetas && x.etiqueta && !x.agotado && (
            <div className="absolute" style={{ top: 18, left: 18, ...anim("md-entra-izq", 600, { demora: 500, curva: REBOTE }) }}>
              <Etiqueta etiqueta={x.etiqueta} c={c} tam={17} />
            </div>
          )}
          {x.agotado && <Sello tam={56} />}
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center" style={{ padding: "12px 26px 18px" }}>
          <h3
            className="font-black"
            style={{ fontSize: x.nombre.length > 22 ? 36 : 44, lineHeight: 1.08, textDecoration: x.agotado ? "line-through" : undefined, ...anim("md-entra-arriba", 600, { demora: 150 }) }}
          >
            {x.nombre}
          </h3>
          {p.descripciones && x.descripcion && (
            <p className="w-full truncate" style={{ fontSize: 21, opacity: 0.82, marginTop: 6, ...anim("md-entra-arriba", 600, { demora: 300 }) }}>
              {x.descripcion}
            </p>
          )}
          <div style={{ marginTop: 10, ...anim("md-pop", 700, { demora: 400, curva: REBOTE }) }}>
            <div style={anim("md-latido", 1700, { repetir: true, demora: 1200, curva: "ease-in-out" })}>
              {x.agotado ? (
                <span className="font-black uppercase" style={{ fontSize: 40, letterSpacing: "0.12em" }}>
                  Agotado
                </span>
              ) : (
                <Precio valor={x.precio} moneda={datos.moneda} tam={84} c={c} />
              )}
            </div>
          </div>
        </div>
        <span
          className="absolute bottom-0 left-0 block w-full"
          style={{ height: 7, background: c.acento, transformOrigin: "left", ...anim("md-barra", e.ms, { curva: "linear" }) }}
        />
      </article>
      <div className="min-w-0 flex-1">
        <ListaMarcada key={pagina} bloques={e.columna} marcado={x.id} datos={datos} c={c} />
      </div>
    </div>
  );
}

function ListaMarcada({ bloques, marcado, datos, c }: { bloques: BloqueLista[]; marcado: number; datos: DatosTableroMenu; c: Colores }) {
  const p = datos.pantalla;
  const letra = LETRA[p.tamano];
  let n = 0;
  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      {bloques.map((b, bi) => (
        <section key={`${b.categoria}-${bi}`}>
          <h2
            className="font-extrabold uppercase"
            style={{
              color: c.acento,
              fontSize: 22,
              letterSpacing: "0.2em",
              borderBottom: `2px solid ${c.borde}`,
              paddingBottom: 6,
              marginBottom: 6,
              ...anim("md-entra-der", 600, { demora: n++ * 45 }),
            }}
          >
            {b.categoria}
          </h2>
          <ul className="flex flex-col" style={{ gap: 2 }}>
            {b.platos.map((x) => {
              const marcadoAhora = x.id === marcado;
              return (
                <li key={x.id} style={anim("md-entra-der", 600, { demora: n++ * 45 })}>
                  <div
                    className="md-renglon flex items-end"
                    style={{
                      gap: 12,
                      padding: "4px 14px",
                      borderRadius: 14,
                      background: marcadoAhora ? conAlfa(c.acento, 0.2) : "transparent",
                      boxShadow: marcadoAhora ? `inset 6px 0 0 ${c.acento}` : "none",
                      transform: marcadoAhora ? "translateX(12px)" : "none",
                      opacity: x.agotado ? 0.55 : 1,
                    }}
                  >
                    <span className="truncate font-bold" style={{ fontSize: letra.lista, textDecoration: x.agotado ? "line-through" : undefined }}>
                      {x.nombre}
                    </span>
                    {p.etiquetas && x.etiqueta && !x.agotado && <Etiqueta etiqueta={x.etiqueta} c={c} tam={12} />}
                    <span className="min-w-6 flex-1" style={{ borderBottom: `2px dotted ${c.borde}`, marginBottom: 8 }} />
                    {x.agotado ? (
                      <span className="shrink-0 font-extrabold uppercase" style={{ fontSize: Math.round(letra.lista * 0.85), letterSpacing: "0.14em", opacity: 0.85 }}>
                        Agotado
                      </span>
                    ) : (
                      <Precio valor={x.precio} moneda={datos.moneda} tam={Math.round(letra.lista * 1.15)} c={c} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Mosaico: las tarjetas entran en cascada y después un foco las recorre una
 * por una (se agranda, brilla y la foto se acerca). El foco arranca cuando
 * terminó de entrar la última.
 */
function Mosaico({
  e,
  datos,
  c,
  alto,
  quieto,
}: {
  e: Extract<Escena, { tipo: "mosaico" }>;
  datos: DatosTableroMenu;
  c: Colores;
  alto: number;
  quieto: boolean;
}) {
  const p = datos.pantalla;
  const n = e.platos.length;
  const [foco, setFoco] = useState(-1);
  const entrada = 500 + n * 90;

  useEffect(() => {
    if (quieto || n === 0) return;
    const paso = Math.max(1100, Math.floor((e.ms - entrada) / n));
    let intervalo: ReturnType<typeof setInterval> | null = null;
    const arranque = setTimeout(() => {
      let i = 0;
      setFoco(0);
      intervalo = setInterval(() => {
        i = (i + 1) % n;
        setFoco(i);
      }, paso);
    }, entrada);
    return () => {
      clearTimeout(arranque);
      if (intervalo) clearInterval(intervalo);
    };
  }, [e.ms, n, entrada, quieto]);

  const filas = filasFotos(p.tamano, p.fotos);
  const gap = 22;
  const altoTarjeta = Math.floor((alto - 8 - (filas - 1) * gap) / filas);
  const altoImagen = p.fotos ? Math.round(altoTarjeta * (filas === 3 ? 0.5 : 0.58)) : 0;
  const letra = LETRA[p.tamano];

  return (
    <div className="absolute inset-0" style={{ paddingTop: 8 }}>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${p.columnas}, minmax(0, 1fr))`, gridAutoRows: altoTarjeta, gap }}>
        {e.platos.map((x, i) => {
          const enFoco = i === foco;
          return (
            <div key={x.id} className="relative" style={{ zIndex: enFoco ? 2 : 1, ...anim("md-entra-arriba", 650, { demora: i * 90, curva: REBOTE }) }}>
              <article
                className="md-foco relative flex h-full flex-col overflow-hidden"
                style={{
                  background: c.tarjeta,
                  border: `2px solid ${enFoco ? c.acento : c.borde}`,
                  borderRadius: 22,
                  transform: enFoco ? "scale(1.06) translateY(-6px)" : "none",
                  boxShadow: enFoco ? `0 18px 48px ${conAlfa(c.acento, 0.45)}` : "none",
                }}
              >
                {p.fotos && (
                  <div
                    className="relative flex shrink-0 items-center justify-center overflow-hidden"
                    style={{ height: altoImagen, background: `radial-gradient(circle at 50% 55%, ${conAlfa(c.acento, 0.3)}, transparent 70%)` }}
                  >
                    {x.foto ? (
                      <img
                        src={datos.url(x.foto)}
                        alt=""
                        className="md-foco-foto h-full w-full object-cover"
                        style={{ transform: enFoco ? "scale(1.12)" : "none", filter: x.agotado ? "grayscale(1) opacity(0.55)" : undefined }}
                      />
                    ) : (
                      <span className="md-foco-foto inline-flex" style={{ transform: enFoco ? "scale(1.14) rotate(-4deg)" : "none", opacity: x.agotado ? 0.4 : 1 }}>
                        <IconoProducto nombre={x.nombre} icono={x.icono} size={Math.round(altoImagen * 0.72)} />
                      </span>
                    )}
                    {enFoco && <span className="md-destello" />}
                  </div>
                )}
                {(x.agotado || (p.etiquetas && x.etiqueta)) && (
                  <div className="absolute" style={{ top: 12, left: 12 }}>
                    {x.agotado ? (
                      <span className="inline-block font-extrabold uppercase" style={{ background: "#111111", color: "#FFFFFF", fontSize: 13, letterSpacing: "0.08em", borderRadius: 999, padding: "4px 12px" }}>
                        Agotado
                      </span>
                    ) : (
                      x.etiqueta && <Etiqueta etiqueta={x.etiqueta} c={c} tam={13} />
                    )}
                  </div>
                )}
                <div className="flex min-h-0 flex-1 flex-col" style={{ padding: "12px 18px 14px", opacity: x.agotado ? 0.55 : 1 }}>
                  <div className="flex items-start justify-between" style={{ gap: 10 }}>
                    <h3 className="min-w-0 font-extrabold" style={{ fontSize: letra.nombre, lineHeight: 1.12, textDecoration: x.agotado ? "line-through" : undefined }}>
                      {x.nombre}
                    </h3>
                    <span className="inline-block shrink-0" style={{ transform: enFoco ? "scale(1.18)" : "none", transformOrigin: "right top", transition: "transform 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.3)" }}>
                      <Precio valor={x.precio} moneda={datos.moneda} tam={letra.precio} c={c} />
                    </span>
                  </div>
                  {p.descripciones && x.descripcion && (
                    <p
                      className="overflow-hidden"
                      style={{ fontSize: letra.desc, lineHeight: 1.3, opacity: 0.8, marginTop: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}
                    >
                      {x.descripcion}
                    </p>
                  )}
                </div>
                {!p.fotos && enFoco && <span className="md-destello" />}
              </article>
            </div>
          );
        })}
      </div>
    </div>
  );
}
