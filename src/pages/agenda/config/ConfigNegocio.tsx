import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EncabezadoPagina } from "../../../components/filtros";
import { Icon } from "../../../components/Icon";
import {
  AvisoOk,
  Badge,
  Boton,
  Campo,
  Cargando,
  ErrorMsg,
  Input,
  Select,
  useAviso,
} from "../../../components/ui";
import { apiConfigAgenda } from "../../../lib/agenda/apiConfigAgenda";
import {
  CAMPOS_ANTICIPO,
  camposDe,
  cambiosReglas,
  erroresReglas,
  etiquetaCampo,
  fmtValorRegla,
  META_REGLAS,
  MODOS_CONFIRMACION,
  motivoAnticipo,
  textoOrigen,
  TITULO_GRUPO,
  valoresDe,
} from "../../../lib/agenda/reglas";
import type {
  CambioRegla,
  CampoRegla,
  ModoConfirmacion,
  Reglas,
  ValoresReglas,
} from "../../../lib/agenda/tiposConfigAgenda";
import { fechaNegocio, horaNegocio } from "../../../lib/agenda/horaAgenda";
import { fmtFechaNegocio } from "../../../lib/agenda/horarios";
import { useApi } from "../../../lib/useApi";
import { useSucursales } from "../../../lib/useSucursales";
import { useAuth } from "../../../store/AuthContext";
import { Bloque, Casilla } from "./comun";
import { mensajeDe, useNombreProfesional } from "./utilConfig";

/**
 * A11 · Configuración del negocio (PLAN-AGENDA-BELLEZA §8.9): las reglas de la
 * agenda y de la reserva online en un solo lugar. Sólo el dueño (ADMIN).
 *
 * Cada regla vale para todo el negocio salvo que una sucursal tenga la suya.
 * El backend devuelve los valores ya resueltos con su `origen`, y la pantalla
 * dice cuál es propio y cuál heredado. Al guardar se manda SÓLO lo que cambió:
 * mandar todo fijaría en la sucursal valores que hoy hereda.
 */
export default function ConfigNegocio() {
  const suc = useSucursales();
  const reglas = useApi(() => apiConfigAgenda.reglas(suc.sucursalId), [suc.sucursalId]);
  const historial = useApi(() => apiConfigAgenda.historialReglas(), []);
  const [version, setVersion] = useState(0);
  // Acá y no en el formulario: guardar lo vuelve a montar (la clave cambia)
  // y el aviso se perdería en el mismo instante en que aparece.
  const [aviso, setAviso] = useAviso();

  const nombreSucursal = (id: number | null) =>
    id == null ? "Todo el negocio" : (suc.sucursales.find((s) => s.id === id)?.nombre ?? `Sucursal #${id}`);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Configuración del negocio"
        subtitulo="Cómo se reciben las reservas y qué reglas sigue la agenda."
      />

      {suc.elegir && (
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1 basis-56">
            <Campo label="Reglas de" hint="Una sucursal hereda lo de todo el negocio salvo lo que cambies para ella.">
              <Select aria-label="Reglas de" value={suc.valorSelect} onChange={(e) => suc.alElegirSelect(e.target.value)}>
                <option value="">Todo el negocio</option>
                {suc.sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>
        </div>
      )}

      {reglas.error ? (
        <ErrorMsg onReintentar={reglas.recargar}>{reglas.error}</ErrorMsg>
      ) : reglas.cargando || !reglas.datos ? (
        <Cargando />
      ) : (
        <FormReglas
          // Al cambiar de sucursal (o después de guardar) el borrador arranca
          // de nuevo con lo que dice el backend.
          key={`${suc.sucursalId ?? "negocio"}-${version}`}
          reglas={reglas.datos}
          sucursalId={suc.sucursalId}
          onGuardado={(r) => {
            setAviso("Reglas guardadas.");
            reglas.setDatos(r);
            setVersion((v) => v + 1);
            historial.recargar();
          }}
        />
      )}

      <AvisoOk>{aviso}</AvisoOk>

      <Bloque titulo="Historial de cambios" subtitulo="Quién cambió qué regla y cuándo.">
        {historial.error ? (
          <ErrorMsg onReintentar={historial.recargar}>{historial.error}</ErrorMsg>
        ) : historial.cargando ? (
          <Cargando />
        ) : !historial.datos?.length ? (
          <p className="py-2 text-sm text-texto-3">Todavía no se cambió ninguna regla.</p>
        ) : (
          <Historial filas={historial.datos} nombreSucursal={nombreSucursal} />
        )}
      </Bloque>
    </div>
  );
}

/**
 * Un valor de la bitácora. `null` es que no había valor propio y se usaba el
 * heredado (de la sucursal, del negocio o del rubro): "—" se leía como "no
 * tenía nada" (QA B-25).
 */
function valorHistorial(campo: string, valor: CambioRegla["antes"]): string {
  return valor === null || valor === undefined ? "heredado" : fmtValorRegla(campo, valor);
}

/** "06/10/2026 00:21": en 24 h y en la hora del negocio, como el resto de la agenda. */
function fmtCuando(iso: string): string {
  return `${fmtFechaNegocio(fechaNegocio(iso))} ${horaNegocio(iso)}`;
}

function Historial({
  filas,
  nombreSucursal,
}: {
  filas: CambioRegla[];
  nombreSucursal: (id: number | null) => string;
}) {
  const [todas, setTodas] = useState(false);
  const ordenadas = [...filas].sort((a, b) => b.en.localeCompare(a.en));
  const visibles = todas ? ordenadas : ordenadas.slice(0, 10);
  return (
    <>
      <ul className="divide-y divide-borde-soft">
        {visibles.map((f, i) => (
          <li key={`${f.en}-${f.campo}-${i}`} className="py-2.5 text-sm">
            <p className="text-texto">
              <span className="font-semibold">{etiquetaCampo(f.campo)}</span>:{" "}
              <span className="text-texto-3 line-through">{valorHistorial(f.campo, f.antes)}</span>{" "}
              <Icon name="arrowRight" size={13} className="inline" />{" "}
              <span className="font-semibold">{valorHistorial(f.campo, f.despues)}</span>
            </p>
            <p className="text-xs text-texto-4">
              {fmtCuando(f.en)} · {f.usuario ?? "—"} · {nombreSucursal(f.sucursalId)}
            </p>
          </li>
        ))}
      </ul>
      {ordenadas.length > 10 && (
        <button
          type="button"
          onClick={() => setTodas(!todas)}
          className="text-[13px] font-semibold text-primary-700 hover:underline"
        >
          {todas ? "Ver menos" : `Ver los ${ordenadas.length} cambios`}
        </button>
      )}
    </>
  );
}

/** El borrador: los números como texto, para poder tipear y borrar libremente. */
type Borrador = Record<CampoRegla, string | boolean>;

function aBorrador(v: ValoresReglas): Borrador {
  const b = {} as Borrador;
  for (const c of Object.keys(META_REGLAS) as CampoRegla[]) {
    const x = v[c];
    b[c] = typeof x === "number" ? String(x) : x;
  }
  return b;
}

function aValores(b: Borrador): ValoresReglas {
  const v: Record<string, unknown> = {};
  for (const c of Object.keys(META_REGLAS) as CampoRegla[]) {
    const meta = META_REGLAS[c];
    const x = b[c];
    v[c] = meta.tipo === "numero" ? (String(x).trim() === "" ? Number.NaN : Number(x)) : x;
  }
  return v as unknown as ValoresReglas;
}

/** Granularidades que se ofrecen; si el backend trae otra, se suma. */
const GRANULARIDADES = [5, 10, 15, 20, 30, 60];

function FormReglas({
  reglas,
  sucursalId,
  onGuardado,
}: {
  reglas: Reglas;
  sucursalId: number | null;
  onGuardado: (r: Reglas) => void;
}) {
  const { negocio } = useAuth();
  const nombres = useNombreProfesional();
  const original = useMemo(() => valoresDe(reglas), [reglas]);
  const [borrador, setBorrador] = useState<Borrador>(() => aBorrador(original));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const valores = aValores(borrador);
  const errores = erroresReglas(valores);
  const cambios = cambiosReglas(original, valores);
  const hayCambios = Object.keys(cambios).length > 0;
  const hayErrores = Object.keys(errores).length > 0;
  const mirando = sucursalId == null ? "NEGOCIO" : "SUCURSAL";

  const poner = (c: CampoRegla, v: string | boolean) => setBorrador((b) => ({ ...b, [c]: v }));
  const origen = (c: CampoRegla) => {
    const t = textoOrigen(reglas.origen?.[c], mirando);
    return t && !(c in cambios) ? t : undefined;
  };

  const guardar = async () => {
    setGuardando(true);
    setError("");
    try {
      const r = await apiConfigAgenda.guardarReglas({ sucursalId, ...cambios });
      onGuardado(r);
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setGuardando(false);
    }
  };

  const numero = (c: CampoRegla) => {
    const meta = META_REGLAS[c];
    if (meta.tipo !== "numero") return null;
    return (
      <Campo key={c} label={meta.etiqueta} error={errores[c]} hint={origen(c) ?? meta.ayuda}>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            aria-label={meta.etiqueta}
            value={String(borrador[c])}
            onChange={(e) => poner(c, e.target.value)}
            className="max-w-[7rem]"
          />
          <span className="text-[13px] text-texto-3">{meta.unidad}</span>
        </div>
      </Campo>
    );
  };

  const casilla = (c: CampoRegla, etiqueta?: string) => {
    const meta = META_REGLAS[c];
    const ayuda = [origen(c), meta.tipo === "booleano" ? meta.ayuda : undefined].filter(Boolean).join(" · ");
    return (
      <Casilla key={c} checked={borrador[c] === true} onChange={(v) => poner(c, v)} ayuda={ayuda || undefined}>
        {etiqueta ?? meta.etiqueta}
      </Casilla>
    );
  };

  const granularidad = Number(borrador.granularidadMin);
  const opcionesGranularidad = GRANULARIDADES.includes(granularidad)
    ? GRANULARIDADES
    : [...GRANULARIDADES, granularidad].filter(Number.isFinite).sort((a, b) => a - b);
  const modo = borrador.modoConfirmacion as ModoConfirmacion;

  return (
    <div className="space-y-4">
      <Bloque titulo={TITULO_GRUPO.interna} subtitulo="Cómo se arma la agenda del día.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo
            label={META_REGLAS.granularidadMin.etiqueta}
            hint={origen("granularidadMin") ?? (META_REGLAS.granularidadMin.tipo === "numero" ? META_REGLAS.granularidadMin.ayuda : undefined)}
          >
            <Select value={String(borrador.granularidadMin)} onChange={(e) => poner("granularidadMin", e.target.value)}>
              {opcionesGranularidad.map((g) => (
                <option key={g} value={g}>
                  {g} minutos
                </option>
              ))}
            </Select>
          </Campo>
          {numero("bufferGeneralMin")}
        </div>
      </Bloque>

      <Bloque
        titulo={TITULO_GRUPO.profesional}
        subtitulo={`Qué puede hacer y ver cada ${nombres.singular.toLowerCase()} que entra con su usuario.`}
      >
        <div className="space-y-1">{camposDe("profesional").map((c) => casilla(c))}</div>
      </Bloque>

      <Bloque
        titulo={TITULO_GRUPO.online}
        subtitulo="Cómo entran y qué reglas siguen las reservas que llegan por tu página."
        accion={
          <Link
            to="/configuracion/agenda?pestana=reservas"
            className="inline-flex items-center gap-1.5 rounded-xl border border-borde bg-white px-3 py-2 text-[13px] font-semibold text-texto-2 hover:bg-muted"
          >
            <Icon name="arrowUpRight" size={15} />
            Publicar y compartir el enlace
          </Link>
        }
      >
        <fieldset className="space-y-2">
          <legend className="mb-1 text-[13px] font-semibold text-texto-2">
            {META_REGLAS.modoConfirmacion.etiqueta}
            {origen("modoConfirmacion") && (
              <span className="ml-2 font-normal text-texto-4">({origen("modoConfirmacion")})</span>
            )}
          </legend>
          {MODOS_CONFIRMACION.map((m) => {
            // D21: el anticipo por QR es deuda técnica; se ve, pero no se elige.
            const deshabilitado = m.modo === "ANTICIPO_QR";
            const elegido = modo === m.modo;
            return (
              <label
                key={m.modo}
                className={`flex gap-3 rounded-2xl border p-3.5 ${
                  deshabilitado
                    ? "border-borde bg-muted"
                    : elegido
                      ? "cursor-pointer border-primary bg-primary-50 ring-1 ring-primary"
                      : "cursor-pointer border-borde hover:bg-muted"
                }`}
              >
                <input
                  type="radio"
                  name="modoConfirmacion"
                  value={m.modo}
                  checked={elegido}
                  disabled={deshabilitado}
                  aria-describedby={deshabilitado ? "motivo-anticipo" : undefined}
                  onChange={() => poner("modoConfirmacion", m.modo)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className={`flex flex-wrap items-center gap-2 text-[15px] font-bold ${deshabilitado ? "text-texto-3" : "text-texto"}`}>
                    {m.titulo}
                    {deshabilitado && <Badge tono="amarillo">Próximamente</Badge>}
                  </span>
                  <span className="block text-[13px] text-texto-3">{m.texto}</span>
                  {deshabilitado && (
                    <>
                      <span className="flex flex-wrap items-center gap-3 opacity-60">
                        {CAMPOS_ANTICIPO.map((c) => {
                          const meta = META_REGLAS[c];
                          return meta.tipo === "numero" ? (
                            <span key={c} className="inline-flex items-center gap-1.5 text-[13px] text-texto-2">
                              {meta.etiqueta}: <strong>{String(borrador[c])} {meta.unidad}</strong>
                            </span>
                          ) : null;
                        })}
                      </span>
                      <span
                        id="motivo-anticipo"
                        className="flex items-start gap-2 rounded-xl bg-warning-bg px-3 py-2 text-[13px] text-warning-text"
                      >
                        <Icon name="lock" size={15} />
                        <span>
                          Próximamente. {motivoAnticipo(negocio?.features)}
                        </span>
                      </span>
                    </>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
          {camposDe("online")
            .filter((c) => META_REGLAS[c].tipo === "numero" && !CAMPOS_ANTICIPO.includes(c))
            .map((c) => numero(c))}
        </div>
        {casilla("mostrarPreciosOnline")}
      </Bloque>

      <ErrorMsg>{error}</ErrorMsg>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-borde-soft bg-fondo/95 px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
        {hayCambios && (
          <span className="mr-auto text-[13px] text-texto-3">
            {Object.keys(cambios).length === 1 ? "1 cambio sin guardar" : `${Object.keys(cambios).length} cambios sin guardar`}
          </span>
        )}
        <Boton
          variante="ghost"
          onClick={() => {
            setBorrador(aBorrador(original));
            setError("");
          }}
          disabled={!hayCambios || guardando}
        >
          Descartar
        </Boton>
        <Boton onClick={guardar} disabled={!hayCambios || hayErrores || guardando} icono="save">
          {guardando ? "Guardando…" : "Guardar"}
        </Boton>
      </div>
    </div>
  );
}
