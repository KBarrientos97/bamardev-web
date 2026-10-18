import { useState, type KeyboardEvent } from "react";
import { Icon } from "../../../components/Icon";
import { Input } from "../../../components/ui";
import { fmtMoney } from "../../../lib/format";
import { fmtCobrado, parsearDuracion, simularLibre } from "../calculo";
import { CampoBs } from "../Cobro";
import type { TipoMesa } from "../tipos";
import { BotonB, Tarjeta } from "../ui";
import {
  FRACCIONES,
  decimal,
  ejemploPromo,
  entero,
  errorPaquete,
  nombrePromo,
  nuevaPromo,
  paquetesQueNoConvienen,
  tipoDeBorrador,
  type BorradorPromo,
  type BorradorTipo,
  type ErroresTipo,
} from "./borrador";
import {
  AyudaFraccion,
  AyudaMinimo,
  AyudaPaquetes,
  AyudaPrecio,
  AyudaPromos,
  AyudaSimulador,
  AyudaTolerancia,
} from "./ayudas";
import { minimoEfectivo } from "./ayudas.datos";
import { CampoSufijo, Casilla, ErrorCampo, Etiqueta } from "./piezas";

/**
 * Un tipo de mesa en Tarifas y paquetes (§7.14): precio por hora, fracción,
 * mínimo y tolerancia, paquetes de tiempo fijo, promociones por tiempo y el
 * simulador. Edita un borrador: nada se guarda hasta "Guardar cambios".
 */
export function TarjetaTipo({
  b,
  errores,
  mostrarErrores,
  onCambiar,
}: {
  b: BorradorTipo;
  errores: ErroresTipo;
  /** Los errores se muestran después del primer intento de guardar. */
  mostrarErrores: boolean;
  onCambiar: (b: BorradorTipo) => void;
}) {
  const err = (clave: string) => (mostrarErrores ? errores[clave] : undefined);
  const poner = (cambio: Partial<BorradorTipo>) => onCambiar({ ...b, ...cambio });
  const tarifa = decimal(b.tarifa);
  const valida = tarifa !== null && tarifa > 0 ? tarifa : null;
  // null mientras el borrador tenga errores: las ayudas usan entonces una tarifa típica.
  const tipo = tipoDeBorrador(b);
  const minimo = entero(b.minimo);
  const minimoReal = minimo !== null ? minimoEfectivo({ minimo, fraccion: b.fraccion }) : null;

  return (
    <Tarjeta icono="bola" titulo={b.nombre}>
      <div className="space-y-5">
        <div>
          <Etiqueta ayuda={<AyudaPrecio tipo={tipo} nombre={b.nombre} />}>Precio por hora</Etiqueta>
          <div className="max-w-[13rem]">
            <CampoBs etiqueta={`Precio por hora de ${b.nombre}`} valor={b.tarifa} onCambiar={(t) => poner({ tarifa: t })} />
          </div>
          <ErrorCampo>{err("tarifa")}</ErrorCampo>
        </div>

        <div>
          <Etiqueta ayuda={<AyudaFraccion tipo={tipo} />}>Cobro por fracción</Etiqueta>
          <Fracciones
            etiqueta={`Cobro por fracción de ${b.nombre}`}
            valor={b.fraccion}
            onCambiar={(v) => poner({ fraccion: v, tolerancia: v === 1 ? "0" : b.tolerancia })}
          />
          <p className="mt-1.5 text-xs text-texto-4">Se redondea hacia arriba pasada la tolerancia.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Etiqueta ayuda={<AyudaMinimo tipo={tipo} />}>Mínimo</Etiqueta>
            <CampoSufijo
              etiqueta={`Mínimo de ${b.nombre}`}
              sufijo="min"
              valor={b.minimo}
              error={err("minimo")}
              onCambiar={(t) => poner({ minimo: t.replace(/\D/g, "") })}
            />
            <ErrorCampo>{err("minimo")}</ErrorCampo>
            {/* Un mínimo de 20 con fracción de 15 se cobra 30 (se completa el bloque): sin
                esto, el dueño ponía 20 y la mesa cobraba media hora sin explicación. */}
            {!err("minimo") && minimo !== null && minimoReal !== minimo && (
              <p className="mt-1 text-xs text-amber-700">
                De a {b.fraccion} min se cobra como {minimoReal} min.
              </p>
            )}
          </div>
          <div>
            <Etiqueta ayuda={<AyudaTolerancia tipo={tipo} />}>Tolerancia</Etiqueta>
            <CampoSufijo
              etiqueta={`Tolerancia de ${b.nombre}`}
              sufijo="min"
              valor={b.tolerancia}
              error={err("tolerancia")}
              disabled={b.fraccion === 1}
              onCambiar={(t) => poner({ tolerancia: t.replace(/\D/g, "") })}
            />
            <ErrorCampo>{err("tolerancia")}</ErrorCampo>
          </div>
        </div>

        <Paquetes b={b} tipo={tipo} tarifa={valida} onCambiar={(paquetes) => poner({ paquetes })} />

        <Promociones
          b={b}
          tipo={tipo}
          tarifa={valida}
          err={err}
          onCambiar={(promos) => poner({ promos })}
        />

        <Simulador tipo={tipo} />
      </div>
    </Tarjeta>
  );
}

/**
 * Por minuto, 5, 10, 15 o 30 min. Como el `Segmentado` pero cada opción del
 * ancho de su texto: "Por minuto" no se parte en dos renglones. Si no entran,
 * pasan a dos renglones en vez de correr de costado: con el scroll, "30 min"
 * quedaba cortado a 375 px y en el celular la barra no se ve (prueba
 * profunda, 18-oct).
 */
function Fracciones({
  etiqueta,
  valor,
  onCambiar,
}: {
  etiqueta: string;
  valor: number;
  onCambiar: (v: number) => void;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex flex-wrap rounded-3xl bg-slate-100 p-1">
      {FRACCIONES.map((f) => (
        <button
          key={f}
          type="button"
          role="radio"
          aria-checked={valor === f}
          onClick={() => onCambiar(f)}
          className={`min-h-9 flex-auto whitespace-nowrap rounded-full px-2 text-[13px] font-semibold transition-colors ${
            valor === f ? "bg-white text-texto shadow-sm" : "text-texto-3 hover:text-texto"
          }`}
        >
          {f === 1 ? "Por minuto" : `${f} min`}
        </button>
      ))}
    </div>
  );
}

function Paquetes({
  b,
  tipo,
  tarifa,
  onCambiar,
}: {
  b: BorradorTipo;
  tipo: TipoMesa | null;
  tarifa: number | null;
  onCambiar: (p: BorradorTipo["paquetes"]) => void;
}) {
  const [horas, setHoras] = useState("");
  const [precio, setPrecio] = useState("");
  const [error, setError] = useState("");
  const noConvienen = tarifa ? paquetesQueNoConvienen(tarifa, b.paquetes) : [];

  const agregar = () => {
    const e = errorPaquete(horas, precio, b.paquetes);
    if (e) return setError(e);
    onCambiar([...b.paquetes, { h: Number(horas), precio: decimal(precio)! }].sort((x, y) => x.h - y.h));
    setHoras("");
    setPrecio("");
    setError("");
  };
  const alEnter = (ev: KeyboardEvent) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      agregar();
    }
  };

  return (
    <div>
      <Etiqueta ayuda={<AyudaPaquetes tipo={tipo} />}>Paquetes de tiempo fijo</Etiqueta>
      {b.paquetes.length === 0 ? (
        <p className="text-[13px] text-texto-3">Sin paquetes: el tiempo fijo se cobra por hora suelta.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {b.paquetes.map((p) => (
            <li
              key={p.h}
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white pl-3.5 pr-1 text-[13px] font-semibold text-texto ring-1 ring-inset ring-borde"
            >
              <span className="tabular-nums">
                {p.h} h · {fmtMoney(p.precio)}
              </span>
              <button
                type="button"
                onClick={() => onCambiar(b.paquetes.filter((x) => x !== p))}
                aria-label={`Quitar el paquete de ${p.h} h`}
                className="flex h-8 w-8 items-center justify-center rounded-full text-texto-4 hover:bg-muted hover:text-texto"
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {noConvienen.map((n) => (
        <p key={n.h} className="mt-1.5 text-xs text-amber-700">
          El de {n.h} h nunca se usa: se cobra la combinación más barata, y {n.h} h salen {fmtMoney(n.mejor)}.
        </p>
      ))}
      <div className="mt-3 flex flex-wrap items-start gap-2" onKeyDown={alEnter}>
        <div className="w-24">
          <CampoSufijo
            etiqueta={`Horas del paquete nuevo de ${b.nombre}`}
            sufijo="h"
            valor={horas}
            onCambiar={(t) => {
              setError("");
              setHoras(t.replace(/\D/g, "").slice(0, 2));
            }}
          />
        </div>
        <div className="w-32">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm font-semibold text-texto-4">
              Bs
            </span>
            <Input
              type="number"
              aria-label={`Precio del paquete nuevo de ${b.nombre}`}
              placeholder="Precio"
              value={precio}
              onChange={(ev) => {
                setError("");
                setPrecio(ev.target.value);
              }}
              className="pl-10 tabular-nums"
            />
          </div>
        </div>
        <BotonB icono="plus" onClick={agregar} disabled={!horas || !precio}>
          Agregar
        </BotonB>
      </div>
      <ErrorCampo>{error}</ErrorCampo>
    </div>
  );
}

let secuenciaPromo = 0;

function Promociones({
  b,
  tipo,
  tarifa,
  err,
  onCambiar,
}: {
  b: BorradorTipo;
  tipo: TipoMesa | null;
  tarifa: number | null;
  err: (clave: string) => string | undefined;
  onCambiar: (p: BorradorPromo[]) => void;
}) {
  const cambiar = (id: string, cambio: Partial<BorradorPromo>) =>
    onCambiar(b.promos.map((p) => (p.id === id ? { ...p, ...cambio } : p)));

  return (
    <div>
      <Etiqueta ayuda={<AyudaPromos tipo={tipo} />}>Promociones por tiempo</Etiqueta>
      <p className="-mt-1 mb-2 text-xs text-texto-4">
        Descuento en el tiempo de mesa cuando juegan muchas horas. No toca los consumos. Si alcanzan dos, va la de mayor
        descuento.
      </p>
      {b.promos.length === 0 && <p className="mb-2 text-[13px] text-texto-3">Sin promociones.</p>}
      <div className="space-y-3">
        {b.promos.map((p) => {
          const ej = ejemploPromo(tarifa, p);
          return (
            <div
              key={p.id}
              className={`rounded-2xl border p-3.5 ${p.activa ? "border-primary-200 bg-primary-50/50" : "border-borde bg-slate-50"}`}
            >
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Nombre de la promoción"
                  value={p.nombre}
                  maxLength={40}
                  onChange={(ev) => cambiar(p.id, { nombre: ev.target.value })}
                  className="min-w-0 flex-1 font-semibold"
                />
                <label className="flex min-h-10 shrink-0 cursor-pointer items-center gap-2 px-1 text-[13px] font-semibold text-texto">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-primary"
                    checked={p.activa}
                    onChange={(ev) => cambiar(p.id, { activa: ev.target.checked })}
                  />
                  Activa
                </label>
                <button
                  type="button"
                  onClick={() => onCambiar(b.promos.filter((x) => x.id !== p.id))}
                  aria-label={`Quitar ${p.nombre || "la promoción"}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-texto-3 hover:bg-white hover:text-rose-700"
                >
                  <Icon name="trash" size={17} />
                </button>
              </div>
              <ErrorCampo>{err(`promo:${p.id}:nombre`)}</ErrorCampo>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px] text-texto-2">
                <span className="font-semibold text-texto">Desde</span>
                <CampoSufijo
                  className="w-24"
                  etiqueta="Desde cuántas horas"
                  sufijo="h"
                  inputMode="decimal"
                  valor={p.desde}
                  error={err(`promo:${p.id}:desde`)}
                  onCambiar={(t) => {
                    const desde = t.replace(/[^\d,.]/g, "").slice(0, 4);
                    // El nombre sugerido sigue a las horas mientras no lo hayan cambiado.
                    const auto = p.nombre === nombrePromo(p.desde);
                    cambiar(p.id, { desde, ...(auto ? { nombre: nombrePromo(desde) } : {}) });
                  }}
                />
                <span>jugadas →</span>
                <CampoSufijo
                  className="w-24"
                  etiqueta="Porcentaje de descuento"
                  sufijo="%"
                  inputMode="decimal"
                  valor={p.pct}
                  error={err(`promo:${p.id}:pct`)}
                  onCambiar={(t) => cambiar(p.id, { pct: t.replace(/[^\d,.]/g, "").slice(0, 4) })}
                />
                <span>de descuento</span>
              </div>
              <ErrorCampo>{err(`promo:${p.id}:desde`) ?? err(`promo:${p.id}:pct`)}</ErrorCampo>
              <div className="mt-1">
                <Casilla marcada={p.fijo} onCambiar={(v) => cambiar(p.id, { fijo: v })}>
                  <span className="text-[13px]">También en tiempo fijo (paquetes y otra cantidad)</span>
                </Casilla>
              </div>
              {ej && (
                <p className="text-xs text-texto-3">
                  {ej.cuenta} <b className="text-primary-700">{ej.total}</b>
                </p>
              )}
            </div>
          );
        })}
      </div>
      <BotonB
        icono="plus"
        className="mt-3"
        onClick={() => onCambiar([...b.promos, nuevaPromo(b.promos, `nueva-${Date.now().toString(36)}-${secuenciaPromo++}`)])}
      >
        Agregar promoción
      </BotonB>
    </div>
  );
}

/**
 * "Si juegan 1:32 → se cobra 1:30 → Bs 30,00" (§7.14). Usa el borrador sin
 * guardar: el administrador prueba la tarifa antes de guardarla.
 */
function Simulador({ tipo }: { tipo: TipoMesa | null }) {
  const [texto, setTexto] = useState("1:32");
  const secs = parsearDuracion(texto);
  const r = tipo && secs !== null ? simularLibre(tipo, secs) : null;

  return (
    <div className="rounded-2xl border border-primary-200 bg-primary-50/60 p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary-700">
        <Icon name="cronometro" size={14} />
        Simulador
        <AyudaSimulador />
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-texto">
        <span className="font-semibold">Si juegan</span>
        <input
          value={texto}
          onChange={(ev) => setTexto(ev.target.value.replace(/[^\d:]/g, "").slice(0, 5))}
          aria-label="Tiempo jugado (horas:minutos)"
          inputMode="numeric"
          className="h-10 w-20 rounded-full border border-borde bg-white text-center text-sm font-semibold tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
        />
        {r ? (
          <span className="flex flex-wrap items-center gap-x-2">
            <span>
              → se cobra <b className="tabular-nums">{fmtCobrado(r.min)}</b> →
            </span>
            {r.promo && <s className="tabular-nums text-texto-4">{fmtMoney(r.bruto)}</s>}
            <b className="tabular-nums text-primary-700">{fmtMoney(r.total)}</b>
            {r.promo && (
              <span className="rounded-md bg-primary-100 px-1.5 py-0.5 text-[11px] font-bold text-primary-700">
                −{String(r.promo.pct).replace(".", ",")} %
              </span>
            )}
          </span>
        ) : (
          <span className="text-[13px] text-texto-3">
            {tipo ? "Escribilo como 1:32 (horas:minutos)." : "Completá la tarifa para simular."}
          </span>
        )}
      </div>
    </div>
  );
}
