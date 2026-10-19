import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Chips, FilaFiltros } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import MenuMas, { type AccionMenu } from "../../components/MenuMas";
import { Paginacion } from "../../components/Paginacion";
import PanelLateral from "../../components/PanelLateral";
import { Boton, Cargando, ErrorMsg, Select, Vacio } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { fechaCorta } from "../../lib/academia/formato";
import type { Antiguedad, FilaCobranza, Recordatorio, RespuestaCobranza, TipoCobranza } from "../../lib/academia/tipos";
import { useFiltroSede } from "../../lib/academia/useFiltroSede";
import { usePalabras } from "../../lib/academia/usePalabras";
import { abrirWhatsapp, nombreCuota, rutaCobroInscripcion } from "../../lib/academia/vista";
import { fmtHora, fmtMoney, tiempoRelativo } from "../../lib/format";
import { usePaginado } from "../../lib/paginado";
import { cobraCuotas } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { FiltrosConteo } from "./piezas";

const TIPOS: TipoCobranza[] = ["vencidas", "por-vencer", "parciales"];

/** "recordado hace 3 días", "sin recordar". */
function textoRecordatorio(f: Pick<FilaCobranza, "ultimoRecordatorioEn" | "recordatorios">): string {
  if (!f.ultimoRecordatorioEn) return "sin recordar";
  const cuando = tiempoRelativo(f.ultimoRecordatorioEn).toLowerCase();
  return f.recordatorios > 1 ? `recordado ${f.recordatorios} veces · ${cuando}` : `recordado ${cuando}`;
}

/** La cuota a recordar: la vencida más vieja, si no la primera con saldo. */
function cuotaARecordar(f: FilaCobranza) {
  const conSaldo = f.cuotas.filter((c) => c.saldo > 0 && c.estado !== "ANULADA");
  return conSaldo.find((c) => c.vencida) ?? conSaldo[0] ?? null;
}

/** Una fila se identifica por su inscripción (el backend agrupa por ella). */
const claveDe = (f: FilaCobranza) => String(f.inscripcionId ?? `${f.alumno.id}-${f.cuotas[0]?.id ?? 0}`);

/**
 * N7 · Cobranza con el QR por WhatsApp (ronda 2, requerimiento 9). Las
 * pestañas son los indicadores, con cuánto y cuántos (Vencidas · Por vencer ·
 * Abonos a medias). "Enviar QR" abre el panel: a quién va, y "Abrir WhatsApp"
 * pide al backend el mensaje con el enlace de pago del estudiante (y deja
 * anotado el recordatorio) y abre `wa.me` con todo escrito: la recepción sólo
 * toca enviar. No hay envío automático.
 *
 * Para varios, se marcan y la acción principal los recorre de a uno: "1 de N
 * · Siguiente". Cobrar sigue pasando por el POS.
 */
export default function Cobranza() {
  const { usuario, negocio, rubro } = useAuth();
  const p = usePalabras();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inicial = TIPOS.includes(params.get("tipo") as TipoCobranza) ? (params.get("tipo") as TipoCobranza) : "vencidas";
  const sede = useFiltroSede();
  const [tipo, setTipo] = useState<TipoCobranza>(inicial);
  const [carreraId, setCarreraId] = useState<number | null>(null);
  const [antiguedad, setAntiguedad] = useState<"" | Antiguedad>("");
  const [totales, setTotales] = useState<RespuestaCobranza["totales"] | null>(null);
  // Los marcados, con su fila: sobreviven al cambio de página.
  const [marcados, setMarcados] = useState<Map<string, FilaCobranza>>(new Map());
  // El panel: una fila suelta, o la cola de los marcados con su posición.
  const [cola, setCola] = useState<FilaCobranza[]>([]);
  const [pos, setPos] = useState(0);
  const [enviados, setEnviados] = useState<Record<string, Recordatorio & { en: string }>>({});

  const carreras = useApi(() => apiAcademia.carreras().catch(() => []), []);
  const ajustes = useApi(() => apiAcademia.ajustes().catch(() => null), []);
  const lista = usePaginado(
    async (pg) => {
      const r = await apiAcademia.cobranza({
        ...pg,
        tipo,
        sede: sede.sucursalId,
        carreraId,
        antiguedad: tipo === "vencidas" ? antiguedad : "",
      });
      setTotales(r.totales);
      return r;
    },
    [tipo, sede.sucursalId, carreraId, antiguedad],
  );
  const cobra = cobraCuotas({ features: negocio?.features, rubro, permisos: usuario?.permisos, permisosPropios: usuario?.permisosPropios });

  const actual = cola[pos] ?? null;
  const t = totales;
  const nMarcados = marcados.size;
  const visiblesMarcados = lista.items.length > 0 && lista.items.every((f) => marcados.has(claveDe(f)));

  function alternar(f: FilaCobranza) {
    setMarcados((m) => {
      const n = new Map(m);
      if (n.has(claveDe(f))) n.delete(claveDe(f));
      else n.set(claveDe(f), f);
      return n;
    });
  }

  function alternarPagina() {
    setMarcados((m) => {
      const n = new Map(m);
      for (const f of lista.items) {
        if (visiblesMarcados) n.delete(claveDe(f));
        else n.set(claveDe(f), f);
      }
      return n;
    });
  }

  function cobrar(f: FilaCobranza) {
    // Con la inscripción, su carrito; si no vino, el POS busca al estudiante.
    const destino = f.inscripcionId
      ? rutaCobroInscripcion(f.inscripcionId, f.sede)
      : `/pos?alumno=${f.alumno.id}&q=${encodeURIComponent(f.alumno.codigo ?? f.alumno.nombre)}`;
    navigate(destino);
  }

  /** Lo que se recordó queda anotado en la fila sin recargar la lista. */
  function anotar(f: FilaCobranza, r: Recordatorio) {
    const ahora = new Date().toISOString();
    setEnviados((e) => ({ ...e, [claveDe(f)]: { ...r, en: ahora } }));
    const marcar = (x: FilaCobranza) =>
      claveDe(x) === claveDe(f) ? { ...x, ultimoRecordatorioEn: ahora, recordatorios: x.recordatorios + 1, enlacePago: r.enlacePago ?? x.enlacePago } : x;
    lista.setItems(lista.items.map(marcar));
    setCola((c) => c.map(marcar));
  }

  const acciones: AccionMenu[] = [
    { clave: "texto", etiqueta: "Editar el texto del mensaje", icono: "edit", detalle: "Pronto", deshabilitada: true, onClick: () => {} },
    { clave: "excel", etiqueta: "Exportar Excel", icono: "download", detalle: "Pronto", deshabilitada: true, separar: true, onClick: () => {} },
  ];

  const dia = ajustes.datos?.diaInicioModulo;
  const subtitulo = [sede.nombre || usuario?.sucursal, dia ? `los ${p.materias} vencen el ${dia} de cada mes` : "lo que se debe"]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={`mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8 ${actual ? "md:mr-[380px]" : ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-texto">Cobranza</h1>
          <p className="mt-0.5 text-[13px] text-texto-3">{subtitulo}</p>
        </div>
        <div className="flex items-center gap-2">
          <Boton
            disabled={nMarcados === 0}
            onClick={() => {
              setCola([...marcados.values()]);
              setPos(0);
            }}
          >
            {nMarcados === 0 ? "Enviar QR a los marcados" : `Enviar QR a ${nMarcados} ${nMarcados === 1 ? "marcado" : "marcados"}`}
          </Boton>
          <MenuMas etiqueta="Más acciones de cobranza" titulo="Cobranza" acciones={acciones} />
        </div>
      </header>

      <FilaFiltros>
        {sede.selector}
        {tipo === "vencidas" ? (
          <Chips
            titulo="Antigüedad"
            valor={antiguedad}
            opciones={[
              ["", "Todas"],
              ["1-7", "1–7 días"],
              ["8-30", "8–30 días"],
              ["30+", "Más de 30"],
            ]}
            onChange={setAntiguedad}
          />
        ) : null}
        {(carreras.datos?.length ?? 0) > 1 && (
          <div className="w-full sm:w-56">
            <Select aria-label={p.Carrera} value={carreraId ?? ""} onChange={(e) => setCarreraId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{p.Carrera}: todos</option>
              {carreras.datos?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </div>
        )}
      </FilaFiltros>

      <FiltrosConteo<TipoCobranza>
        etiqueta="Filtrar deudas"
        opciones={[
          { clave: "vencidas", label: t ? `Vencidas ${fmtMoney(t.vencido)} ·` : "Vencidas", n: t?.vencidoCuotas ?? null, urgente: true },
          { clave: "por-vencer", label: t ? `Por vencer ${fmtMoney(t.venceMes)} ·` : "Por vencer", n: t?.venceMesCuotas ?? null },
          {
            clave: "parciales",
            label: t?.parciales != null ? `Abonos a medias ${fmtMoney(t.parciales)} ·` : "Abonos a medias",
            n: t?.parcialesCuotas ?? null,
          },
        ]}
        valor={tipo}
        onChange={(v) => {
          setTipo(v);
          setCola([]);
        }}
      />
      {t && <p className="text-[13px] text-texto-3">Cobrado este mes {fmtMoney(t.cobradoMes)}</p>}

      {lista.error && !lista.items.length ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : lista.cargando && !lista.items.length ? (
        <Cargando />
      ) : lista.items.length === 0 ? (
        <Vacio
          icono="coins"
          titulo={tipo === "vencidas" ? "No hay cuotas vencidas" : tipo === "por-vencer" ? "Nada por vencer" : "No hay abonos a medias"}
        />
      ) : (
        <>
          <ListaCobranza
            filas={lista.items}
            conSede={sede.variasSedes}
            marcados={marcados}
            todos={visiblesMarcados}
            abierta={actual}
            onAlternar={alternar}
            onAlternarTodos={alternarPagina}
            onAbrir={(f) => {
              setCola([f]);
              setPos(0);
            }}
          />
          <Paginacion {...lista.paginacion} />
        </>
      )}

      {actual && (
        <PanelEnvio
          key={claveDe(actual)}
          fila={actual}
          posicion={cola.length > 1 ? { actual: pos, total: cola.length } : null}
          enviado={enviados[claveDe(actual)] ?? null}
          cobra={cobra}
          onEnviado={(r) => anotar(actual, r)}
          onCobrar={() => cobrar(actual)}
          onAnterior={() => setPos((x) => Math.max(0, x - 1))}
          onSiguiente={() => {
            if (pos + 1 < cola.length) setPos(pos + 1);
            else {
              setCola([]);
              setMarcados(new Map());
            }
          }}
          onCerrar={() => setCola([])}
        />
      )}
    </div>
  );
}

function ListaCobranza({
  filas,
  conSede,
  marcados,
  todos,
  abierta,
  onAlternar,
  onAlternarTodos,
  onAbrir,
}: {
  filas: FilaCobranza[];
  conSede: boolean;
  marcados: Map<string, FilaCobranza>;
  todos: boolean;
  abierta: FilaCobranza | null;
  onAlternar: (f: FilaCobranza) => void;
  onAlternarTodos: () => void;
  onAbrir: (f: FilaCobranza) => void;
}) {
  const p = usePalabras();
  const sub = (f: FilaCobranza) => {
    const c = cuotaARecordar(f);
    const cuota = f.cuotas.length === 1 && c ? nombreCuota(c) : `${f.cuotas.length} cuotas`;
    const abono = f.cuotas.length === 1 && c && c.pagado > 0 ? ` · abonó ${fmtMoney(c.pagado)} de ${fmtMoney(c.monto)}` : "";
    return [f.grupo.nombre, conSede ? f.sede.nombre : null, `${cuota}${abono}`, f.contacto.esTutor ? `tutor ${f.contacto.nombre}` : null]
      .filter(Boolean)
      .join(" · ");
  };
  const vencimiento = (f: FilaCobranza) => {
    const c = cuotaARecordar(f);
    if (!c) return { texto: "—", urgente: false };
    return c.vencida ? { texto: `vencida hace ${c.diasAtraso} d`, urgente: true } : { texto: `vence el ${fechaCorta(c.vence)}`, urgente: false };
  };
  const col = "grid-cols-[32px_minmax(200px,2fr)_100px_130px_150px_90px]";
  const chequeo = "h-4 w-4 accent-[var(--color-primary-boton)]";

  return (
    <>
      <div className="hidden md:block">
        <div className={`grid ${col} items-center gap-3 px-3 pb-2 text-[12px] text-texto-3`}>
          <label className="flex">
            <input type="checkbox" className={chequeo} checked={todos} onChange={onAlternarTodos} aria-label="Marcar todos los de esta página" />
          </label>
          <span>{p.Alumno}</span>
          <span className="text-right">Debe</span>
          <span>Vencimiento</span>
          <span>Recordatorio</span>
          <span />
        </div>
        <ul>
          {filas.map((f) => {
            const v = vencimiento(f);
            const sinRecordar = !f.ultimoRecordatorioEn && v.urgente;
            return (
              <li key={claveDe(f)}>
                <div
                  className={`grid ${col} items-center gap-3 rounded-xl px-3 py-3 transition-colors ${
                    abierta && claveDe(abierta) === claveDe(f) ? "bg-primary-50" : "hover:bg-muted"
                  }`}
                >
                  <label className="flex">
                    <input
                      type="checkbox"
                      className={chequeo}
                      checked={marcados.has(claveDe(f))}
                      onChange={() => onAlternar(f)}
                      aria-label={`Marcar a ${f.alumno.nombre}`}
                    />
                  </label>
                  <button type="button" onClick={() => onAbrir(f)} className="min-w-0 text-left">
                    <span className="block truncate text-sm font-semibold text-texto">{f.alumno.nombre}</span>
                    <span className="block truncate text-[12px] text-texto-3">{sub(f)}</span>
                  </button>
                  <span className={`text-right text-sm font-semibold tabular-nums ${v.urgente ? "text-danger-text" : "text-texto-2"}`}>
                    {fmtMoney(f.saldo)}
                  </span>
                  <span className={`text-[13px] ${v.urgente ? "text-danger-text" : "text-texto-3"}`}>{v.texto}</span>
                  <span className={`text-[13px] ${sinRecordar ? "font-semibold text-warning-text" : "text-texto-3"}`}>{textoRecordatorio(f)}</span>
                  <span className="text-right">
                    <button type="button" onClick={() => onAbrir(f)} className="text-[13px] font-semibold text-primary-700 hover:underline">
                      Enviar QR
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <ul className="space-y-2 md:hidden">
        {filas.map((f) => {
          const v = vencimiento(f);
          return (
            <li key={claveDe(f)} className="flex items-start gap-3 rounded-xl border border-borde bg-white p-3.5">
              <input
                type="checkbox"
                className={`${chequeo} mt-1`}
                checked={marcados.has(claveDe(f))}
                onChange={() => onAlternar(f)}
                aria-label={`Marcar a ${f.alumno.nombre}`}
              />
              <button type="button" onClick={() => onAbrir(f)} className="min-w-0 flex-1 text-left">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 truncate text-[15px] font-semibold text-texto">{f.alumno.nombre}</span>
                  <span className={`shrink-0 text-[15px] font-bold tabular-nums ${v.urgente ? "text-danger-text" : "text-texto"}`}>
                    {fmtMoney(f.saldo)}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-texto-3">{sub(f)}</span>
                <span className="block truncate text-[12px] text-texto-4">
                  {v.texto} · {textoRecordatorio(f)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * El panel "Enviar QR por WhatsApp": a quién va (el tutor si es menor o no
 * tiene celular, como decide el backend), y el botón que arma el mensaje con
 * el enlace de pago y abre WhatsApp. Después muestra lo que se mandó y lo
 * deja anotado. En la cola de los marcados, "1 de N" y Siguiente.
 */
function PanelEnvio({
  fila,
  posicion,
  enviado,
  cobra,
  onEnviado,
  onCobrar,
  onAnterior,
  onSiguiente,
  onCerrar,
}: {
  fila: FilaCobranza;
  posicion: { actual: number; total: number } | null;
  enviado: (Recordatorio & { en: string }) | null;
  cobra: boolean;
  onEnviado: (r: Recordatorio) => void;
  onCobrar: () => void;
  onAnterior: () => void;
  onSiguiente: () => void;
  onCerrar: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState(false);
  const cuota = cuotaARecordar(fila);

  async function abrir() {
    if (!cuota) return;
    // Ya armado: se vuelve a abrir el mismo, sin anotar dos veces.
    if (enviado) return abrirWhatsapp(enviado.url);
    setEnviando(true);
    setError("");
    try {
      const r = await apiAcademia.recordatorio(cuota.id);
      abrirWhatsapp(r.url);
      onEnviado(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo armar el mensaje");
    } finally {
      setEnviando(false);
    }
  }

  async function copiar() {
    if (!enviado) return;
    try {
      await navigator.clipboard.writeText(enviado.texto);
      setCopiado(true);
    } catch {
      setError("No se pudo copiar: seleccioná el texto a mano.");
    }
  }

  const ultimo = posicion ? posicion.actual + 1 === posicion.total : true;
  return (
    <PanelLateral
      abierto
      titulo={fila.alumno.nombre}
      subtitulo={`Debe ${fmtMoney(fila.saldo)}${cuota ? ` · ${nombreCuota(cuota)}` : ""}`}
      onClose={onCerrar}
      acciones={
        <>
          <Boton className="w-full" icono="phone" disabled={enviando || !cuota || !fila.contacto.telefono} onClick={() => void abrir()}>
            {enviando ? "Armando el mensaje…" : "Abrir WhatsApp"}
          </Boton>
          <div className="flex gap-2">
            {enviado && (
              <Boton variante="ghost" className="flex-1" onClick={() => void copiar()}>
                {copiado ? "Copiado" : "Copiar mensaje"}
              </Boton>
            )}
            {cobra && (
              <Boton variante="ghost" className="flex-1" onClick={onCobrar}>
                Cobrar
              </Boton>
            )}
          </div>
        </>
      }
    >
      <div className="space-y-5">
        {posicion && (
          <div className="space-y-2 rounded-xl bg-muted p-3">
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="text-texto-2">Enviando a los {posicion.total} marcados</span>
              <span className="font-semibold tabular-nums text-texto">
                {posicion.actual + 1} de {posicion.total}
              </span>
            </div>
            <div aria-hidden="true" className="flex gap-1">
              {Array.from({ length: posicion.total }, (_, i) => (
                <span key={i} className={`h-1 flex-1 rounded-full ${i <= posicion.actual ? "bg-primary" : "bg-primary-100"}`} />
              ))}
            </div>
            <div className="flex justify-between gap-2">
              <button type="button" disabled={posicion.actual === 0} onClick={onAnterior} className="text-[13px] font-semibold text-texto-2 disabled:opacity-40">
                ‹ Anterior
              </button>
              <button type="button" onClick={onSiguiente} className="text-[13px] font-semibold text-primary-700">
                {ultimo ? "Terminar" : "Siguiente ›"}
              </button>
            </div>
          </div>
        )}

        <dl className="space-y-1 text-sm">
          <dt className="text-[12px] text-texto-3">Se envía a</dt>
          <dd className="font-semibold text-texto">
            {fila.contacto.nombre}
            {fila.contacto.esTutor ? " (tutor)" : ""}
          </dd>
          <dd className="text-texto-2">{fila.contacto.telefono ? `WhatsApp ${fila.contacto.telefono}` : "No tiene un celular cargado"}</dd>
        </dl>

        {enviado ? (
          <section aria-label="El mensaje" className="space-y-2">
            <p className="text-[12px] text-texto-3">El mensaje</p>
            <p className="whitespace-pre-wrap rounded-xl bg-primary-50 p-3 text-[13px] text-texto">{enviado.texto}</p>
            <p role="status" className="flex items-center gap-1.5 text-[13px] text-texto-3">
              <Icon name="check" size={15} /> Anotado: recordado hoy a las {fmtHora(enviado.en)}
            </p>
          </section>
        ) : (
          <p className="text-[13px] text-texto-3">
            WhatsApp se abre con el mensaje y el enlace de pago listos; vos sólo tocás enviar. Queda anotado "recordado hoy".
          </p>
        )}
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </PanelLateral>
  );
}
