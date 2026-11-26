import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import "./escenaConsulta.css";

/** Variables CSS que leen los keyframes (retraso, giro, pivote). */
const v = (o: Record<string, string>): CSSProperties => o as CSSProperties;

/**
 * La ilustración que acompaña la consulta por carnet en la página de un
 * consultorio de nutrición (25-nov, el dueño: que la tarjeta no quede sola y
 * que se mueva como las de la landing). La ficha del paciente con la curva del
 * peso que se dibuja, la manzana, el vaso de agua y el PDF que se baja.
 *
 * Es fija de la web (no depende de que el dueño suba fotos) y decorativa:
 * va con aria-hidden. El dibujo entra siempre entero (`meet`) y el degradado
 * del fondo llena lo que sobra a los costados: así sirve igual en una franja
 * baja (celular) que en una columna alta (computadora). Se pausa fuera de
 * pantalla para no gastar batería.
 */
export default function EscenaConsulta({
  className = "",
}: {
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const g = (n: string) => `${id}${n}`;
  const ref = useRef<HTMLDivElement>(null);
  const [visto, setVisto] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisto(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setVisto(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-vista={visto ? "" : undefined}
      className={`ecn relative overflow-hidden bg-gradient-to-br from-emerald-100 via-emerald-50 to-lime-50 ${className}`}
    >
      <div className="ecn-deriva pointer-events-none absolute -left-10 top-4 h-36 w-36 rounded-full bg-white/60 blur-2xl" />
      <div className="ecn-deriva-b pointer-events-none absolute -right-8 bottom-0 h-32 w-32 rounded-full bg-lime-100/70 blur-2xl" />

      <svg
        viewBox="0 0 320 260"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id={g("t")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6ee7b7" />
            <stop offset="1" stopColor="#10b981" />
          </linearGradient>
          <linearGradient id={g("a")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#10b981" stopOpacity=".28" />
            <stop offset="1" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={g("m")} cx=".38" cy=".35" r=".75">
            <stop offset="0" stopColor="#fca5a5" />
            <stop offset=".55" stopColor="#ef4444" />
            <stop offset="1" stopColor="#b91c1c" />
          </radialGradient>
          <linearGradient id={g("w")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#bae6fd" />
            <stop offset="1" stopColor="#7dd3fc" />
          </linearGradient>
          <linearGradient id={g("p")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fb7185" />
            <stop offset="1" stopColor="#e11d48" />
          </linearGradient>
          {/* la curva sólo se ve dentro del gráfico (la cortina se corre por ahí) */}
          <clipPath id={g("c")}>
            <rect x="118" y="98" width="86" height="56" />
          </clipPath>
          {/* el adentro del vaso: el agua y las burbujas no se salen */}
          <clipPath id={g("v")}>
            <path d="M234 122 L274 122 L268.5 197 Q268 200 265 200 L243 200 Q240 200 239.5 197 Z" />
          </clipPath>
        </defs>

        {/* ramitas del fondo, por fuera de la manzana y del vaso. Los rotate()
            van sin centro: `.ecn svg *` ya gira cada forma sobre el suyo. */}
        <g className="ecn-mece" style={v({ "--g": "5deg", "--d": "-1.2s" })}>
          <path
            d="M16 214Q16 184 26 156"
            stroke="#10b981"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse
            cx="11"
            cy="196"
            rx="9"
            ry="4.5"
            fill="#34d399"
            transform="rotate(-40)"
          />
          <ellipse
            cx="24"
            cy="186"
            rx="9"
            ry="4.5"
            fill="#6ee7b7"
            transform="rotate(-140)"
          />
          <ellipse
            cx="14"
            cy="172"
            rx="8.5"
            ry="4.2"
            fill="#34d399"
            transform="rotate(-50)"
          />
          <ellipse
            cx="27"
            cy="162"
            rx="8"
            ry="4"
            fill="#6ee7b7"
            transform="rotate(-120)"
          />
          <ellipse
            cx="27"
            cy="151"
            rx="6.5"
            ry="3.4"
            fill="#34d399"
            transform="rotate(-80)"
          />
        </g>
        <g className="ecn-mece" style={v({ "--g": "4deg", "--d": "-2.4s" })}>
          <path
            d="M304 214Q305 188 296 164"
            stroke="#10b981"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse
            cx="310"
            cy="194"
            rx="9"
            ry="4.5"
            fill="#34d399"
            transform="rotate(40)"
          />
          <ellipse
            cx="296"
            cy="184"
            rx="9"
            ry="4.5"
            fill="#6ee7b7"
            transform="rotate(140)"
          />
          <ellipse
            cx="306"
            cy="172"
            rx="8"
            ry="4"
            fill="#34d399"
            transform="rotate(50)"
          />
          <ellipse
            cx="294"
            cy="161"
            rx="6.5"
            ry="3.4"
            fill="#6ee7b7"
            transform="rotate(100)"
          />
        </g>

        {/* el piso: sombras de contacto */}
        <ellipse
          cx="160"
          cy="214"
          rx="132"
          ry="8"
          fill="#065f46"
          opacity=".06"
        />
        <ellipse
          className="ecn-sombra"
          cx="160"
          cy="207"
          rx="60"
          ry="5"
          fill="#065f46"
        />
        <ellipse
          className="ecn-sombra"
          style={v({ "--d": "-1.6s" })}
          cx="66"
          cy="207"
          rx="26"
          ry="4"
          fill="#065f46"
        />
        <ellipse
          className="ecn-sombra"
          style={v({ "--d": "-3.2s" })}
          cx="254"
          cy="207"
          rx="22"
          ry="3.5"
          fill="#065f46"
        />

        {/* la manzana */}
        <g className="ecn-flota" style={v({ "--d": "-1.6s" })}>
          <path
            d="M66 136c-7-5-27-5-29 14c-2 18 11 36 21 36c4 0 6-2 8-2s4 2 8 2c10 0 23-18 21-36c-2-19-22-19-29-14z"
            fill={`url(#${g("m")})`}
          />
          <ellipse
            cx="51"
            cy="153"
            rx="4.5"
            ry="8.5"
            fill="#fff"
            opacity=".45"
            transform="rotate(-18)"
          />
          <path
            d="M66 137q1-8 5-12"
            stroke="#78350f"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <g
            className="ecn-mece"
            style={v({ "--g": "9deg", "--o": "0% 100%" })}
          >
            <path d="M70 127q10-11 21-6q-9 11-21 6z" fill="#22c55e" />
            <path
              d="M71 126.5q8-3 17-4.5"
              stroke="#15803d"
              strokeWidth="1"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        </g>

        {/* la ficha del paciente */}
        <g className="ecn-flota">
          <rect
            x="102"
            y="54"
            width="116"
            height="148"
            rx="14"
            fill={`url(#${g("t")})`}
          />
          <rect
            x="108"
            y="58"
            width="104"
            height="3"
            rx="1.5"
            fill="#fff"
            opacity=".35"
          />
          <rect x="112" y="66" width="96" height="128" rx="8" fill="#fff" />
          <rect x="138" y="45" width="44" height="18" rx="6" fill="#047857" />
          <rect x="150" y="49" width="20" height="6" rx="3" fill="#a7f3d0" />

          {/* el paciente */}
          <circle cx="128" cy="84" r="9" fill="#d1fae5" />
          <circle cx="128" cy="81.5" r="3.4" fill="#10b981" />
          <path d="M122.5 90a5.5 4.5 0 0 1 11 0z" fill="#10b981" />
          <rect x="142" y="78" width="52" height="5" rx="2.5" fill="#cbd5e1" />
          <rect x="142" y="87" width="34" height="4" rx="2" fill="#e2e8f0" />

          {/* el gráfico del peso */}
          <path
            d="M120 106H202M120 120H202M120 134H202M120 148H202"
            stroke="#eef2f7"
            strokeWidth="1"
          />
          <g clipPath={`url(#${g("c")})`}>
            <g className="ecn-grafico">
              <path
                d="M122 110L138 117L152 114L166 127L180 131L198 143V154H122Z"
                fill={`url(#${g("a")})`}
              />
              <path
                d="M122 110L138 117L152 114L166 127L180 131L198 143"
                stroke="#10b981"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect
                className="ecn-cortina"
                x="118"
                y="98"
                width="86"
                height="56"
                fill="#fff"
              />
            </g>
          </g>
          <circle
            className="ecn-aro"
            cx="198"
            cy="143"
            r="5"
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
          />
          <circle
            className="ecn-punto"
            cx="198"
            cy="143"
            r="4"
            fill="#10b981"
            stroke="#fff"
            strokeWidth="2"
          />

          {/* IMC y la barrita del objetivo */}
          <rect x="120" y="162" width="40" height="14" rx="7" fill="#d1fae5" />
          <text
            x="140"
            y="172"
            textAnchor="middle"
            fontSize="7.5"
            fontWeight="800"
            fill="#047857"
            fontFamily="inherit"
          >
            IMC 24,1
          </text>
          <rect x="166" y="165" width="34" height="8" rx="4" fill="#eef2f7" />
          <rect x="166" y="165" width="23" height="8" rx="4" fill="#fbbf24" />
          <rect x="120" y="182" width="58" height="4" rx="2" fill="#eef2f7" />
        </g>

        {/* el PDF que se baja */}
        <g className="ecn-flota" style={v({ "--d": "-0.8s" })}>
          <g className="ecn-salto">
            <path
              d="M198 168h22l8 8v20a4 4 0 0 1-4 4h-26a4 4 0 0 1-4-4v-24a4 4 0 0 1 4-4z"
              fill={`url(#${g("p")})`}
            />
            <path d="M220 168v6a2 2 0 0 0 2 2h6z" fill="#fecdd3" />
            <text
              x="211"
              y="192"
              textAnchor="middle"
              fontSize="9"
              fontWeight="800"
              fill="#fff"
              fontFamily="inherit"
            >
              PDF
            </text>
          </g>
        </g>

        {/* el vaso de agua con limón */}
        <g className="ecn-flota" style={v({ "--d": "-3.2s" })}>
          <path
            d="M244 104L250 186"
            stroke="#34d399"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <g clipPath={`url(#${g("v")})`}>
            <path
              className="ecn-ola"
              d="M196 138q6-4 12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0V204H196Z"
              fill={`url(#${g("w")})`}
              opacity=".9"
            />
            <circle
              className="ecn-burbuja"
              style={v({ "--d": "0s" })}
              cx="248"
              cy="192"
              r="2"
              fill="#fff"
            />
            <circle
              className="ecn-burbuja"
              style={v({ "--d": "-1.1s" })}
              cx="258"
              cy="194"
              r="1.6"
              fill="#fff"
            />
            <circle
              className="ecn-burbuja"
              style={v({ "--d": "-2.2s" })}
              cx="253"
              cy="190"
              r="1.3"
              fill="#fff"
            />
          </g>
          <path
            d="M232 120L276 120L270 198Q269 202 265 202L243 202Q239 202 238 198Z"
            fill="#fff"
            fillOpacity=".25"
            stroke="#bae6fd"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M237 126L241 192"
            stroke="#fff"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity=".7"
          />
          <g
            className="ecn-mece"
            style={v({ "--g": "6deg", "--o": "50% 50%" })}
          >
            <circle
              cx="268"
              cy="121"
              r="11"
              fill="#fde047"
              stroke="#facc15"
              strokeWidth="2"
            />
            <path
              d="M268 112v18M259 121h18M262 115l12 12M274 115l-12 12"
              stroke="#fef9c3"
              strokeWidth="1.2"
            />
          </g>
        </g>

        {/* brillitos */}
        <path
          className="ecn-brillo"
          style={v({ "--d": "0s" })}
          d="M90 70l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"
          fill="#fff"
        />
        <path
          className="ecn-brillo"
          style={v({ "--d": "-1.1s" })}
          d="M236 80l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z"
          fill="#fff"
        />
        <path
          className="ecn-brillo"
          style={v({ "--d": "-2.2s" })}
          d="M52 104l1.4 3.4 3.4 1.4-3.4 1.4-1.4 3.4-1.4-3.4-3.4-1.4 3.4-1.4z"
          fill="#a7f3d0"
        />
      </svg>

      {/* el aviso del sistema: el control de la semana */}
      <div className="ecn-chip pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-xl bg-white/95 py-1.5 pl-1.5 pr-3 shadow-[0_10px_28px_-10px_rgba(15,23,42,.45)] ring-1 ring-slate-900/5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-sm">
          <svg
            viewBox="0 0 20 20"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4.5 10.5l3.5 3.5 7.5-8" />
          </svg>
        </span>
        <span className="leading-tight">
          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Control de la semana
          </span>
          <span className="block text-xs font-extrabold text-slate-800">
            −1,2 kg · vas bien
          </span>
        </span>
      </div>
    </div>
  );
}
