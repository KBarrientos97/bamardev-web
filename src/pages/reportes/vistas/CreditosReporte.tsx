import { useState, type ReactNode } from "react";
import { esCero, esPositivo } from "../../../lib/dinero";
import { fmtFechaHora, fmtMoney, fmtNum } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { apiReportes, type CreditosApi } from "../api";
import { useExportar, useReporte } from "../contexto";
import { bsConSigno, bsEntero, pct, plural } from "../formato";
import { textoRango } from "../periodo";
import { Cargador, Chip, Destacado, FilaLista, Tarjeta } from "../ui";
import {
  esVencido,
  fraccionVencida,
  hojasCreditos,
  lineaDeudor,
  sinNadaDeCreditos,
  tramosDeDeuda,
} from "./CreditosReporte.datos";

/**
 * Créditos (fiado): quién debe, hace cuánto y cuánto se fió y se cobró.
 *
 * Es la contracara de Cuentas por cobrar: ahí la cajera ve a quién cobrarle
 * hoy; acá el dueño ve si la cobranza está sana. Por eso mezcla dos tiempos,
 * como el backend: lo que se debe es una foto de HOY —elija el período que
 * elija— y lo fiado y lo cobrado sí son del período. La tarjeta grande lo dice
 * con todas las letras, porque un "por cobrar" que cambiara con el período no
 * coincidiría con el de Cuentas por cobrar.
 *
 * No hay "plazo de pago" configurado en el backend: cada crédito trae su
 * fecha de compromiso, y lo vencido sale de ahí.
 */

const VISIBLES = 8;

export default function CreditosReporte() {
  const { rango, periodo } = useReporte();
  const { puede } = useAuth();
  const datos = useApi(() => apiReportes.creditos(rango), [rango.desde, rango.hasta, rango.sucursalId]);
  const d = datos.datos;
  useExportar("creditos", d && !sinNadaDeCreditos(d) ? () => hojasCreditos(d) : null);
  // Cada deudor lleva a Cuentas por cobrar, que es donde se le cobra. Sin esa
  // sección el link lo devolvería al inicio sin explicación: no se dibuja.
  const aCobrar = puede("creditos") ? "/creditos" : undefined;

  return (
    <Cargador
      estado={datos}
      vacio={(x) =>
        sinNadaDeCreditos(x)
          ? {
              titulo: "Nadie te debe",
              texto: "No hay nada por cobrar, y en este período no se fió ni se cobró nada.",
              icono: "checkCirculo",
            }
          : null
      }
    >
      {(x) => {
        const r = x.resumen;
        return (
          <>
            <Destacado tono="ambar" etiqueta="Total por cobrar" valor={fmtMoney(r.totalPorCobrar)}>
              <p>Al día de hoy, no del período elegido</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Pastilla>
                  {esPositivo(r.totalVencido)
                    ? `${bsEntero(r.totalVencido)} vencido (${pct(fraccionVencida(r))})`
                    : "Nada vencido"}
                </Pastilla>
                <Pastilla>
                  {plural(r.creditosAbiertos, "crédito", "créditos")} · {plural(r.clientesConSaldo, "cliente", "clientes")}
                </Pastilla>
              </div>
            </Destacado>
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <Tarjeta
                  titulo="Movimiento del período"
                  subtitulo={textoRango(periodo.desde, periodo.hasta)}
                  cuerpo="grid grid-cols-2 divide-x divide-borde-soft"
                >
                  <Cifra etiqueta="Se fió" valor={r.fiadoEnPeriodo} color="text-amber-700" />
                  <Cifra
                    etiqueta="Se cobró"
                    valor={r.cobradoEnPeriodo}
                    color="text-primary-700"
                    pie={r.abonosEnPeriodo > 0 ? plural(r.abonosEnPeriodo, "cobro", "cobros") : undefined}
                  />
                </Tarjeta>
                <Antiguedad d={x} />
              </div>
              <div className="space-y-4">
                <QuienDebe deudores={x.deudores} aCobrar={aCobrar} />
                {x.cobros.length > 0 && <Cobros cobros={x.cobros} total={r.cobradoEnPeriodo} />}
              </div>
            </div>
          </>
        );
      }}
    </Cargador>
  );
}

/** Una píldora sobre el fondo ámbar de la tarjeta grande. */
function Pastilla({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[12px] font-bold tabular-nums text-white">
      {children}
    </span>
  );
}

function Cifra({ etiqueta, valor, color, pie }: { etiqueta: string; valor: number; color: string; pie?: string }) {
  return (
    <div className="min-w-0 px-4 py-3.5 sm:px-5">
      <p className="text-[12px] text-texto-3">{etiqueta}</p>
      {/* Un cero va en gris: con el color de la plata se leía como un monto más. */}
      <p className={`mt-0.5 truncate text-[20px] font-extrabold tabular-nums ${esCero(valor) ? "text-texto-4" : color}`}>
        {fmtMoney(valor)}
      </p>
      {pie && <p className="text-[12px] text-texto-3">{pie}</p>}
    </div>
  );
}

/**
 * Cómo se reparte la deuda según cuánto hace que venció. Es la cifra que avisa
 * que fiar se está yendo de las manos mucho antes que el total: mientras más
 * pesa abajo, menos probable es cobrarla.
 */
function Antiguedad({ d }: { d: CreditosApi }) {
  const total = d.resumen.totalPorCobrar;
  return (
    <Tarjeta titulo="Antigüedad de la deuda">
      {esPositivo(total) ? (
        <div className="space-y-4">
          {tramosDeDeuda(d.antiguedad, total).map((t) => (
            <div key={t.clave}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="font-semibold text-texto">{t.nombre}</span>
                <span className={`font-bold tabular-nums ${esCero(t.monto) ? "text-texto-4" : "text-texto"}`}>
                  {fmtMoney(t.monto)}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                <div className={`h-full rounded-full ${t.color}`} style={{ width: `${(t.fraccion ?? 0) * 100}%` }} />
              </div>
              <p className="mt-1 text-[12px] text-texto-3">
                {plural(t.cantidad, "crédito abierto", "créditos abiertos")} · {pct(t.fraccion)} del total
              </p>
            </div>
          ))}
          <p className="border-t border-borde-soft pt-3 text-[12px] text-texto-3">
            Mientras más deuda caiga en los tramos de abajo, más difícil es cobrarla.
          </p>
        </div>
      ) : (
        <p className="text-[13px] text-texto-3">Hoy nadie te debe: no hay deuda que ordenar por antigüedad.</p>
      )}
    </Tarjeta>
  );
}

function QuienDebe({ deudores, aCobrar }: { deudores: CreditosApi["deudores"]; aCobrar?: string }) {
  const [todos, setTodos] = useState(false);
  const lista = todos ? deudores : deudores.slice(0, VISIBLES);
  return (
    <Tarjeta titulo="Quién debe" subtitulo={deudores.length > 0 ? "Los que más deben, primero" : undefined} cuerpo="">
      {deudores.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-texto-3 sm:px-5">Hoy nadie te debe.</p>
      ) : (
        <>
          <div className="divide-y divide-borde-soft">
            {lista.map((p) => {
              const vencido = esVencido(p);
              // Si sólo una parte venció, se dice cuánto: el chip solo hacía
              // creer que vencía todo el saldo.
              const enParte = vencido && esPositivo(p.saldoTotal - p.montoVencido);
              return (
                <FilaLista
                  key={p.clienteId}
                  icono="user"
                  // Ámbar = plata que te deben; rojo = vencido. Los mismos
                  // colores que en Cuentas por cobrar.
                  tono={vencido ? "rosa" : "ambar"}
                  titulo={p.cliente}
                  chip={vencido ? <Chip tono="rojo">Vencido</Chip> : undefined}
                  linea={lineaDeudor(p)}
                  linea2={p.telefono || undefined}
                  valor={fmtMoney(p.saldoTotal)}
                  valorPie={enParte ? `${fmtMoney(p.montoVencido)} vencido` : undefined}
                  a={aCobrar}
                />
              );
            })}
          </div>
          <VerTodos total={deudores.length} todos={todos} onCambio={setTodos} />
        </>
      )}
    </Tarjeta>
  );
}

function Cobros({ cobros, total }: { cobros: CreditosApi["cobros"]; total: number }) {
  const [todos, setTodos] = useState(false);
  const lista = todos ? cobros : cobros.slice(0, VISIBLES);
  return (
    <Tarjeta titulo="Cobros del período" subtitulo={`${plural(cobros.length, "cobro", "cobros")} · ${fmtMoney(total)}`} cuerpo="">
      <div className="divide-y divide-borde-soft">
        {lista.map((c) => (
          <FilaLista
            key={c.id}
            icono="billetera"
            tono="verde"
            titulo={c.cliente}
            linea={[fmtFechaHora(c.fecha), c.formaPago, c.codigo].filter(Boolean).join(" · ")}
            linea2={c.usuario ? `Cobró ${c.usuario}` : undefined}
            valor={bsConSigno(c.monto)}
            tonoValor="marca"
          />
        ))}
      </div>
      <VerTodos total={cobros.length} todos={todos} onCambio={setTodos} />
    </Tarjeta>
  );
}

/** "Ver todos (N)": una lista de 40 deudores dejaba lo importante, los primeros, perdido arriba. */
function VerTodos({ total, todos, onCambio }: { total: number; todos: boolean; onCambio: (t: boolean) => void }) {
  if (total <= VISIBLES) return null;
  return (
    <button
      type="button"
      onClick={() => onCambio(!todos)}
      aria-expanded={todos}
      className="block w-full border-t border-borde-soft px-4 py-3 text-center text-[13px] font-bold text-primary-700 transition-colors hover:bg-muted"
    >
      {todos ? "Mostrar menos" : `Ver todos (${fmtNum(total)})`}
    </button>
  );
}
