import { useId, type ReactNode } from "react";
import {
  corto,
  esDiseno,
  fechaCorta,
  mezclar,
  montoTexto,
  motivoDe,
  tonos,
  type DisenoRegalo,
  type Icono,
} from "../../lib/regalos/disenos";

/**
 * Una gift card dibujada como SVG (IDEAS/6 #6): escala sin perder calidad en
 * la galería del editor, en la página y en la vista del que la recibe, y se
 * exporta a PNG tal cual para mandarla por WhatsApp. 10 estilos × los
 * motivos del rubro × el color de la página.
 *
 * Lo largo (la dedicatoria) va FUERA de la tarjeta: acá sólo entra lo corto,
 * recortado con "…" para que nunca se desborde.
 */

export interface DatosTarjeta {
  diseno: DisenoRegalo | string;
  /** Clave del rubro (`PELUQUERIA`) o su nombre visible ("Peluquería"). */
  rubro: string | null | undefined;
  /** El color de la página (#RRGGBB). */
  color: string;
  negocio: string;
  monto: number | null;
  para?: string | null;
  de?: string | null;
  codigo?: string | null;
  /** "AAAA-MM-DD" o null (no vence). */
  vence?: string | null;
  /** Para el estilo FOTO: la portada o el logo de la página. */
  fotoUrl?: string | null;
}

const W = 340;
const H = 214;
const SANS = "Inter, Roboto, system-ui, -apple-system, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const MANO = "'Segoe Script', 'Bradley Hand', 'Comic Sans MS', cursive";
const ORO = "#D4B26A";

function Motivo({
  icono,
  x,
  y,
  tam,
  color,
  grosor = 1.6,
  opacidad = 1,
  filtro,
}: {
  icono: Icono;
  x: number;
  y: number;
  tam: number;
  color: string;
  grosor?: number;
  opacidad?: number;
  filtro?: string;
}) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${tam / 24})`}
      fill="none"
      stroke={color}
      strokeWidth={grosor}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={opacidad}
      filter={filtro}
    >
      {icono.map((d, i) => (
        <path key={i} d={d} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
}

function T({
  x,
  y,
  children,
  tam = 11,
  color,
  peso = 400,
  familia = SANS,
  ancla = "start",
  espaciado = 0,
  opacidad = 1,
  italica = false,
  filtro,
}: {
  x: number;
  y: number;
  children: ReactNode;
  tam?: number;
  color: string;
  peso?: number;
  familia?: string;
  ancla?: "start" | "middle" | "end";
  espaciado?: number;
  opacidad?: number;
  italica?: boolean;
  filtro?: string;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={tam}
      fill={color}
      fontWeight={peso}
      fontFamily={familia}
      textAnchor={ancla}
      letterSpacing={espaciado}
      opacity={opacidad}
      fontStyle={italica ? "italic" : undefined}
      filter={filtro}
    >
      {children}
    </text>
  );
}

/** "Para Ana · De Luis", o lo que haya. */
function paraDe(para?: string | null, de?: string | null, max = 22): string {
  const partes = [para ? `Para ${corto(para, max)}` : "", de ? `De ${corto(de, max)}` : ""].filter(Boolean);
  return partes.join(" · ");
}

export default function TarjetaRegalo({
  datos,
  titulo,
  className,
  style,
}: {
  datos: DatosTarjeta;
  /** Texto para lectores de pantalla. */
  titulo?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const uid = useId().replace(/:/g, "");
  const diseno: DisenoRegalo = esDiseno(datos.diseno) ? datos.diseno : "MINIMAL";
  const c = tonos(datos.color);
  const m = motivoDe(datos.rubro);
  const monto = montoTexto(datos.monto);
  const negocio = corto(datos.negocio, 28);
  const pd = paraDe(datos.para, datos.de);
  const codigo = datos.codigo ?? null;
  const vence = fechaCorta(datos.vence);
  const pie = vence ? `Válida hasta ${vence}` : "";
  // Con el diseño y el color en el id, dos tarjetas renderizadas por separado
  // (PNG exportado, galerías estáticas) no se pisan los degradados.
  const id = (s: string) => `rg-${s}-${uid}-${diseno}-${c.base.slice(1)}`;

  let cuerpo: ReactNode;
  switch (diseno) {
    case "MINIMAL":
      cuerpo = (
        <>
          <rect width={W} height={H} fill="#FFFFFF" />
          <rect width={10} height={H} fill={c.base} />
          <Motivo icono={m.principal} x={W - 58} y={20} tam={34} color={c.base} />
          <T x={30} y={36} tam={11} color="#6B7280" peso={600} espaciado={1.5}>
            {negocio.toUpperCase()}
          </T>
          <T x={30} y={54} tam={11} color="#9CA3AF">Tarjeta de regalo</T>
          <T x={28} y={118} tam={46} color={c.base} peso={800}>{monto}</T>
          <T x={30} y={142} tam={11} color="#6B7280">{m.frase}</T>
          <T x={30} y={184} tam={11} color="#374151" peso={500}>{pd}</T>
          {pie && <T x={30} y={200} tam={9} color="#9CA3AF">{pie}</T>}
          {codigo && (
            <T x={W - 20} y={200} tam={12} color={c.oscuro} familia={MONO} ancla="end" peso={600}>
              {codigo}
            </T>
          )}
        </>
      );
      break;

    case "CLASICA":
      cuerpo = (
        <>
          <rect width={W} height={H} fill={c.tinte} />
          <rect x={8} y={8} width={W - 16} height={H - 16} rx={10} fill="none" stroke={c.base} strokeWidth={1.6} />
          <rect x={14} y={14} width={W - 28} height={H - 28} rx={7} fill="none" stroke={c.base} strokeWidth={0.7} />
          <Motivo icono={m.secundario} x={24} y={22} tam={18} color={c.base} opacidad={0.8} />
          <Motivo icono={m.secundario} x={W - 42} y={H - 40} tam={18} color={c.base} opacidad={0.8} />
          <T x={W / 2} y={48} tam={10} color={c.base} ancla="middle" espaciado={3} peso={700}>
            TARJETA DE REGALO
          </T>
          <T x={W / 2} y={74} tam={18} color={c.oscuro} ancla="middle" familia={SERIF} peso={700}>
            {negocio}
          </T>
          <T x={W / 2} y={124} tam={40} color={c.base} ancla="middle" familia={SERIF} peso={700}>
            {monto}
          </T>
          <T x={W / 2} y={146} tam={11} color={c.oscuro} ancla="middle" familia={SERIF} italica>
            {m.frase}
          </T>
          <T x={W / 2} y={174} tam={11} color="#374151" ancla="middle">{pd}</T>
          <T x={W / 2} y={192} tam={9} color="#6B7280" ancla="middle" familia={codigo ? MONO : SANS}>
            {[codigo, pie].filter(Boolean).join("  ·  ")}
          </T>
        </>
      );
      break;

    case "ELEGANTE":
      cuerpo = (
        <>
          <rect width={W} height={H} fill={c.profundo} />
          <rect x={10} y={10} width={W - 20} height={H - 20} rx={8} fill="none" stroke={ORO} strokeWidth={0.8} />
          <Motivo icono={m.principal} x={W / 2 - 15} y={22} tam={30} color={ORO} grosor={1.3} />
          <T x={W / 2} y={74} tam={10} color={ORO} ancla="middle" familia={SERIF} espaciado={4}>
            GIFT CARD
          </T>
          <T x={W / 2} y={96} tam={15} color="#F3F4F6" ancla="middle" familia={SERIF}>
            {negocio}
          </T>
          <T x={W / 2} y={140} tam={38} color={ORO} ancla="middle" familia={SERIF} peso={700}>
            {monto}
          </T>
          <T x={W / 2} y={176} tam={11} color="#E5E7EB" ancla="middle" opacidad={0.85}>
            {pd || m.frase}
          </T>
          <T x={W / 2} y={196} tam={10} color={ORO} ancla="middle" familia={MONO}>
            {[codigo, pie].filter(Boolean).join("  ·  ")}
          </T>
        </>
      );
      break;

    case "GRADIENTE":
      cuerpo = (
        <>
          <defs>
            <linearGradient id={id("g")} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={mezclar(c.base, "#FFFFFF", 0.12)} />
              <stop offset="1" stopColor={mezclar(c.base, "#000000", 0.55)} />
            </linearGradient>
          </defs>
          <rect width={W} height={H} fill={`url(#${id("g")})`} />
          <Motivo icono={m.principal} x={W - 150} y={H - 140} tam={160} color="#FFFFFF" grosor={2} opacidad={0.14} />
          <T x={22} y={36} tam={14} color="#FFFFFF" peso={700}>{negocio}</T>
          <T x={22} y={54} tam={11} color="#FFFFFF" opacidad={0.8}>Tarjeta de regalo</T>
          <rect x={20} y={88} width={176} height={58} rx={14} fill="#FFFFFF" opacity={0.16} />
          <T x={34} y={129} tam={34} color="#FFFFFF" peso={800}>{monto}</T>
          <T x={22} y={172} tam={11} color="#FFFFFF" opacidad={0.85}>{m.frase}</T>
          <T x={22} y={194} tam={11} color="#FFFFFF" peso={500}>{pd}</T>
          {codigo && (
            <T x={W - 20} y={36} tam={11} color="#FFFFFF" familia={MONO} ancla="end" opacidad={0.85}>
              {codigo}
            </T>
          )}
          {pie && <T x={W - 20} y={196} tam={9} color="#FFFFFF" ancla="end" opacidad={0.75}>{pie}</T>}
        </>
      );
      break;

    case "VALE": {
      const corte = 240;
      cuerpo = (
        <>
          <defs>
            <mask id={id("m")}>
              <rect width={W} height={H} fill="#fff" />
              <circle cx={corte} cy={0} r={11} fill="#000" />
              <circle cx={corte} cy={H} r={11} fill="#000" />
            </mask>
          </defs>
          <g mask={`url(#${id("m")})`}>
            <rect width={corte} height={H} fill={c.base} />
            <rect x={corte} width={W - corte} height={H} fill={c.tinte} />
          </g>
          <line x1={corte} y1={16} x2={corte} y2={H - 16} stroke={c.base} strokeWidth={2} strokeDasharray="2 6" strokeLinecap="round" />
          <T x={22} y={46} tam={11} color={c.sobreBase} espaciado={3} peso={700} opacidad={0.9}>VALE POR</T>
          <T x={20} y={102} tam={44} color={c.sobreBase} peso={800}>{monto}</T>
          <T x={22} y={132} tam={13} color={c.sobreBase} peso={600}>{corto(datos.negocio, 26)}</T>
          <T x={22} y={152} tam={10} color={c.sobreBase} opacidad={0.85}>{m.frase}</T>
          <T x={22} y={190} tam={11} color={c.sobreBase} peso={500}>{paraDe(datos.para, datos.de, 14)}</T>
          <Motivo icono={m.principal} x={corte + 30} y={30} tam={40} color={c.base} />
          <T x={(corte + W) / 2} y={112} tam={8} color={c.oscuro} ancla="middle" espaciado={2}>CÓDIGO</T>
          <T x={(corte + W) / 2} y={130} tam={11} color={c.oscuro} ancla="middle" familia={MONO} peso={700}>
            {codigo ?? "····-····"}
          </T>
          {vence && (
            <>
              <T x={(corte + W) / 2} y={168} tam={8} color={c.oscuro} ancla="middle" espaciado={1}>VÁLIDA HASTA</T>
              <T x={(corte + W) / 2} y={184} tam={10} color={c.oscuro} ancla="middle" peso={600}>{vence}</T>
            </>
          )}
        </>
      );
      break;
    }

    case "BOTANICA":
      cuerpo = (
        <>
          <rect width={W} height={H} fill={c.tinte} />
          <path d="M210 -20 C 300 10, 380 60, 350 140 C 330 200, 260 240, 220 214 C 180 190, 150 120, 170 70 C 180 30, 190 -10, 210 -20 Z" fill={c.claro} opacity={0.55} />
          <path d="M260 120 C 320 110, 370 170, 340 230 L 230 230 C 220 190, 230 130, 260 120 Z" fill={c.base} opacity={0.22} />
          <path d="M-30 170 C 10 150, 60 170, 80 214 L -30 214 Z" fill={c.claro} opacity={0.45} />
          <Motivo icono={m.principal} x={232} y={52} tam={92} color={c.oscuro} grosor={1.4} opacidad={0.55} />
          <T x={24} y={42} tam={16} color={c.oscuro} familia={SERIF} italica>{negocio}</T>
          <T x={24} y={60} tam={10} color={c.oscuro} espaciado={2} opacidad={0.75}>TARJETA DE REGALO</T>
          <T x={22} y={118} tam={40} color={c.base} familia={SERIF} peso={700}>{monto}</T>
          <T x={24} y={140} tam={11} color={c.oscuro} familia={SERIF} italica>{m.frase}</T>
          <T x={24} y={176} tam={11} color="#374151" peso={500}>{pd}</T>
          <T x={24} y={194} tam={9} color="#6B7280" familia={codigo ? MONO : SANS}>
            {[codigo, pie].filter(Boolean).join("  ·  ")}
          </T>
        </>
      );
      break;

    case "POSTAL":
      cuerpo = (
        <>
          <rect width={W} height={H} fill="#FBF8F2" />
          <rect x={250} y={16} width={72} height={86} fill="#FFFFFF" stroke={c.base} strokeWidth={2} strokeDasharray="3 3" />
          <Motivo icono={m.principal} x={270} y={28} tam={32} color={c.base} />
          <T x={286} y={88} tam={13} color={c.base} ancla="middle" peso={800}>{monto}</T>
          <circle cx={238} cy={88} r={24} fill="none" stroke={c.oscuro} strokeWidth={1} opacity={0.45} />
          <T x={238} y={86} tam={7} color={c.oscuro} ancla="middle" opacidad={0.6} espaciado={1}>GIFT</T>
          <T x={238} y={95} tam={7} color={c.oscuro} ancla="middle" opacidad={0.6} espaciado={1}>CARD</T>
          <path d="M150 70 q8 -6 16 0 t16 0 t16 0" fill="none" stroke={c.oscuro} opacity={0.35} />
          <path d="M150 80 q8 -6 16 0 t16 0 t16 0" fill="none" stroke={c.oscuro} opacity={0.35} />
          <T x={22} y={44} tam={20} color={c.oscuro} familia={SERIF} italica>Tarjeta de regalo</T>
          <T x={22} y={64} tam={11} color="#6B7280">{negocio}</T>
          <T x={22} y={110} tam={18} color={c.base} peso={800}>{`Vale por ${monto}`}</T>
          <T x={22} y={146} tam={10} color="#9CA3AF">Para</T>
          <line x1={50} y1={147} x2={318} y2={147} stroke="#D1D5DB" />
          <T x={56} y={143} tam={15} color="#1F2937" familia={MANO}>{corto(datos.para, 26)}</T>
          <T x={22} y={176} tam={10} color="#9CA3AF">De</T>
          <line x1={50} y1={177} x2={318} y2={177} stroke="#D1D5DB" />
          <T x={56} y={173} tam={15} color="#1F2937" familia={MANO}>{corto(datos.de, 26)}</T>
          <T x={22} y={202} tam={9} color="#6B7280" familia={codigo ? MONO : SANS}>
            {[codigo, pie].filter(Boolean).join("  ·  ")}
          </T>
        </>
      );
      break;

    case "NEON": {
      const neon = mezclar(c.base, "#FFFFFF", 0.4);
      const brillo = `url(#${id("brillo")})`;
      cuerpo = (
        <>
          <defs>
            <filter id={id("brillo")} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect width={W} height={H} fill="#0B0B12" />
          <rect x={12} y={12} width={W - 24} height={H - 24} rx={14} fill="none" stroke={neon} strokeWidth={1.6} filter={brillo} />
          <Motivo icono={m.principal} x={W - 96} y={44} tam={62} color={neon} grosor={1.8} filtro={brillo} />
          <T x={30} y={44} tam={10} color={neon} espaciado={3} peso={700} filtro={brillo}>GIFT CARD</T>
          <T x={30} y={64} tam={13} color="#F9FAFB" peso={600}>{negocio}</T>
          {/* El brillo en el texto grande lo empasta: el monto va nítido. */}
          <T x={28} y={124} tam={42} color={neon} peso={800}>{monto}</T>
          <T x={30} y={168} tam={11} color="#F9FAFB" opacidad={0.75}>{pd || m.frase}</T>
          <T x={30} y={190} tam={10} color={neon} familia={MONO}>
            {[codigo, pie].filter(Boolean).join("  ·  ")}
          </T>
        </>
      );
      break;
    }

    case "GEOMETRICA":
      cuerpo = (
        <>
          <rect width={W} height={H} fill={c.base} />
          <polygon points="220,0 340,0 340,120" fill={c.oscuro} opacity={0.55} />
          <polygon points="250,214 340,110 340,214" fill={c.claro} opacity={0.35} />
          <circle cx={285} cy={150} r={34} fill={c.oscuro} opacity={0.35} />
          <polygon points="0,214 0,150 60,214" fill={c.claro} opacity={0.3} />
          <rect x={20} y={28} width={210} height={158} rx={12} fill="#FFFFFF" />
          <Motivo icono={m.secundario} x={262} y={36} tam={42} color="#FFFFFF" opacidad={0.9} />
          <T x={36} y={54} tam={12} color={c.base} peso={800}>{corto(datos.negocio, 24)}</T>
          <T x={36} y={70} tam={10} color="#6B7280">Tarjeta de regalo</T>
          <T x={34} y={116} tam={36} color={c.oscuro} peso={800}>{monto}</T>
          <T x={36} y={136} tam={10} color="#6B7280">{corto(m.frase, 34)}</T>
          <T x={36} y={160} tam={10} color="#374151" peso={500}>{paraDe(datos.para, datos.de, 12)}</T>
          <T x={36} y={176} tam={9} color="#6B7280" familia={codigo ? MONO : SANS}>
            {[codigo, pie].filter(Boolean).join("  ·  ")}
          </T>
        </>
      );
      break;

    case "FOTO":
      cuerpo = (
        <>
          <defs>
            <linearGradient id={id("velo")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#000" stopOpacity={0.15} />
              <stop offset="1" stopColor="#000" stopOpacity={0.78} />
            </linearGradient>
            <linearGradient id={id("sin")} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={c.base} />
              <stop offset="1" stopColor={c.profundo} />
            </linearGradient>
          </defs>
          {datos.fotoUrl ? (
            <image href={datos.fotoUrl} width={W} height={H} preserveAspectRatio="xMidYMid slice" crossOrigin="anonymous" />
          ) : (
            <>
              <rect width={W} height={H} fill={`url(#${id("sin")})`} />
              <Motivo icono={m.principal} x={W / 2 - 60} y={20} tam={120} color="#FFFFFF" opacidad={0.18} grosor={2} />
            </>
          )}
          <rect width={W} height={H} fill={`url(#${id("velo")})`} />
          <T x={22} y={36} tam={14} color="#FFFFFF" peso={800}>{negocio}</T>
          <T x={22} y={53} tam={10} color="#FFFFFF" espaciado={2} opacidad={0.85}>TARJETA DE REGALO</T>
          <T x={20} y={160} tam={40} color="#FFFFFF" peso={800}>{monto}</T>
          <T x={22} y={186} tam={11} color="#FFFFFF" peso={500}>{pd || m.frase}</T>
          <T x={22} y={202} tam={9} color="#FFFFFF" opacidad={0.8}>{pie}</T>
          {codigo && (
            <T x={W - 20} y={202} tam={11} color="#FFFFFF" familia={MONO} ancla="end" peso={600}>
              {codigo}
            </T>
          )}
        </>
      );
      break;
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={titulo ?? `Gift card de ${datos.negocio} por ${monto}`}
      className={className}
      style={{ display: "block", width: "100%", height: "auto", borderRadius: 14, ...style }}
    >
      <defs>
        <clipPath id={id("borde")}>
          <rect width={W} height={H} rx={16} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id("borde")})`}>{cuerpo}</g>
    </svg>
  );
}
