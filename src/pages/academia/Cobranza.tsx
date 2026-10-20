import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Chips } from "../../components/filtros";
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
import {
  BotonFila,
  Chip,
  EncabezadoPagina,
  GrillaKpi,
  KpiTarjeta,
  LISTA,
  PaginaAcademia,
  ResumenPanel,
  SeccionPanel,
  TABLA,
  Tarjeta,
} from "./piezas";

const TIPOS: TipoCobranza[] = ["vencidas", "por-vencer", "parciales"];

/** El título de la tarjeta de la lista: el indicador elegido arriba. */
const TITULO_TIPO: Record<TipoCobranza, string> = {
  vencidas: "Vencidas",
  "por-vencer": "Por vencer",
  parciales: "Abonos a medias",
};

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
  const cobra = cobraCuotas({
    features: negocio?.features,
    rubro,
    permisos: usuario?.permisos,
    permisosPropios: usuario?.permisosPropios,
  });

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
      claveDe(x) === claveDe(f)
        ? {
            ...x,
            ultimoRecordatorioEn: ahora,
            recordatorios: x.recordatorios + 1,
            enlacePago: r.enlacePago ?? x.enlacePago,
          }
        : x;
    lista.setItems(lista.items.map(marcar));
    setCola((c) => c.map(marcar));
  }

  const acciones: AccionMenu[] = [
    {
      clave: "texto",
      etiqueta: "Editar el texto del mensaje",
      icono: "edit",
      detalle: "Pronto",
      deshabilitada: true,
      onClick: () => {},
    },
    {
      clave: "excel",
      etiqueta: "Exportar Excel",
      icono: "download",
      detalle: "Pronto",
      deshabilitada: true,
      separar: true,
      onClick: () => {},
    },
  ];

  const dia = ajustes.datos?.diaInicioModulo;
  const subtitulo = [sede.nombre || usuario?.sucursal, dia ? `los ${p.materias} vencen el ${dia} de cada mes` : "lo que se debe"]
    .filter(Boolean)
    .join(" · ");

  const elegirTipo = (v: TipoCobranza) => {
    setTipo(v);
    setCola([]);
  };
  const cuotas = (n: number | null | undefined) => (n == null ? undefined : `${n} ${n === 1 ? "cuota" : "cuotas"}`);
  const conCarreras = (carreras.datos?.length ?? 0) > 1;

  return (
    // Con el panel abierto se corre a la izquierda; `w-auto` porque el `w-full` del marco más el margen se salía de la pantalla.
    <PaginaAcademia className={actual ? "md:mr-[380px] md:w-auto" : ""}>
      <EncabezadoPagina
        titulo="Cobranza"
        bajada={subtitulo}
        acciones={
          <>
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
          </>
        }
      />

      {sede.selector}

      {/* Los indicadores SON los filtros: tocar uno cambia la lista de abajo. */}
      <div role="group" aria-label="Filtrar deudas">
        <GrillaKpi>
          <KpiTarjeta
            etiqueta="Vencidas"
            valor={t ? fmtMoney(t.vencido) : "—"}
            pie={cuotas(t?.vencidoCuotas)}
            tono={t && t.vencidoCuotas > 0 ? "urgente" : "normal"}
            etiquetaAria={t ? `Vencidas ${fmtMoney(t.vencido)} · ${t.vencidoCuotas}` : "Vencidas"}
            seleccionado={tipo === "vencidas"}
            onClick={() => elegirTipo("vencidas")}
          />
          <KpiTarjeta
            etiqueta="Por vencer"
            valor={t ? fmtMoney(t.venceMes) : "—"}
            pie={cuotas(t?.venceMesCuotas)}
            etiquetaAria={t ? `Por vencer ${fmtMoney(t.venceMes)} · ${t.venceMesCuotas}` : "Por vencer"}
            seleccionado={tipo === "por-vencer"}
            onClick={() => elegirTipo("por-vencer")}
          />
          <KpiTarjeta
            etiqueta="Abonos a medias"
            valor={t?.parciales != null ? fmtMoney(t.parciales) : "—"}
            pie={cuotas(t?.parcialesCuotas)}
            tono={t?.parcialesCuotas ? "ambar" : "normal"}
            etiquetaAria={t?.parciales != null ? `Abonos a medias ${fmtMoney(t.parciales)} · ${t.parcialesCuotas ?? 0}` : "Abonos a medias"}
            seleccionado={tipo === "parciales"}
            onClick={() => elegirTipo("parciales")}
          />
          <KpiTarjeta etiqueta="Cobrado este mes" valor={t ? fmtMoney(t.cobradoMes) : "—"} tono="ok" />
        </GrillaKpi>
      </div>

      <Tarjeta
        id="t-cobranza"
        titulo={TITULO_TIPO[tipo]}
        contador={lista.items.length ? lista.total : undefined}
        sinRelleno
        barra={
          tipo === "vencidas" || conCarreras ? (
            <div className="flex flex-wrap items-center justify-between gap-3 py-3">
              {tipo === "vencidas" ? (
                <div className="min-w-0 max-w-full">
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
                </div>
              ) : null}
              {conCarreras && (
                <div className="w-full sm:w-56">
                  <Select
                    aria-label={p.Carrera}
                    value={carreraId ?? ""}
                    onChange={(e) => setCarreraId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">{p.Carrera}: todos</option>
                    {carreras.datos?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          ) : undefined
        }
        pie={lista.items.length > 0 && lista.total > 20 ? <Paginacion {...lista.paginacion} /> : undefined}
      >
        {lista.error && !lista.items.length ? (
          <div className="p-4 sm:p-5">
            <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
          </div>
        ) : lista.cargando && !lista.items.length ? (
          <Cargando />
        ) : lista.items.length === 0 ? (
          <Vacio
            icono="coins"
            titulo={tipo === "vencidas" ? "No hay cuotas vencidas" : tipo === "por-vencer" ? "Nada por vencer" : "No hay abonos a medias"}
          />
        ) : (
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
        )}
      </Tarjeta>

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
    </PaginaAcademia>
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
  const chequeo = "h-4 w-4 accent-[var(--color-primary-boton)]";
  /** El vencimiento en chip: rojo si ya venció, gris si todavía no. */
  const chipVence = (v: { texto: string; urgente: boolean }) =>
    v.texto === "—" ? <span className="text-texto-4">—</span> : <Chip tono={v.urgente ? "rojo" : "gris"}>{v.texto}</Chip>;
  /** "sin recordar" con algo vencido es lo que hay que mirar: en ámbar. */
  const recordatorio = (f: FilaCobranza, urgente: boolean) =>
    !f.ultimoRecordatorioEn && urgente ? (
      <Chip tono="ambar">{textoRecordatorio(f)}</Chip>
    ) : (
      <span className="text-[13px] text-texto-3">{textoRecordatorio(f)}</span>
    );

  return (
    <>
      {/* scroll-lateral-ok: la tabla de escritorio, con scroll dentro de su tarjeta. Con el panel abierto se
          esconde la columna de "Enviar QR" (el nombre también lo abre) para que los nombres no queden cortados. */}
      <div className={`hidden md:block ${TABLA.envoltura}`}>
        <table className={TABLA.tabla}>
          <thead>
            <tr className={TABLA.encabezado}>
              <th className={`${TABLA.th} w-10`}>
                <input
                  type="checkbox"
                  className={`${chequeo} align-middle`}
                  checked={todos}
                  onChange={onAlternarTodos}
                  aria-label="Marcar todos los de esta página"
                />
              </th>
              <th className={TABLA.th}>{p.Alumno}</th>
              <th className={`${TABLA.th} text-right`}>Debe</th>
              <th className={TABLA.th}>Vencimiento</th>
              <th className={TABLA.th}>Recordatorio</th>
              <th className={`${TABLA.th} ${abierta ? "hidden" : ""}`}>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const v = vencimiento(f);
              const abiertaEsta = abierta && claveDe(abierta) === claveDe(f);
              return (
                <tr key={claveDe(f)} className={`${TABLA.fila} ${abiertaEsta ? "bg-primary-50 hover:bg-primary-50" : ""}`}>
                  <td className={`${TABLA.td} w-10`}>
                    <input
                      type="checkbox"
                      className={`${chequeo} align-middle`}
                      checked={marcados.has(claveDe(f))}
                      onChange={() => onAlternar(f)}
                      aria-label={`Marcar a ${f.alumno.nombre}`}
                    />
                  </td>
                  <td className={`${TABLA.td} w-full max-w-0`}>
                    <button type="button" onClick={() => onAbrir(f)} className="block w-full min-w-0 text-left">
                      <span className="block truncate text-sm font-semibold text-texto hover:text-primary-700">{f.alumno.nombre}</span>
                      <span className="block truncate text-[12px] text-texto-3">{sub(f)}</span>
                    </button>
                  </td>
                  <td className={`${TABLA.td} ${TABLA.numero} whitespace-nowrap font-semibold ${v.urgente ? "text-danger-text" : "text-texto"}`}>
                    {fmtMoney(f.saldo)}
                  </td>
                  <td className={`${TABLA.td} whitespace-nowrap`}>{chipVence(v)}</td>
                  <td className={`${TABLA.td} whitespace-nowrap`}>{recordatorio(f, v.urgente)}</td>
                  <td className={`${TABLA.td} text-right whitespace-nowrap ${abierta ? "hidden" : ""}`}>
                    <BotonFila icono="qr" onClick={() => onAbrir(f)}>
                      Enviar QR
                    </BotonFila>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className={`${LISTA.lista} md:hidden`}>
        {filas.map((f) => {
          const v = vencimiento(f);
          const abiertaEsta = abierta && claveDe(abierta) === claveDe(f);
          return (
            <li key={claveDe(f)} className={`flex items-start gap-3 ${LISTA.item} ${abiertaEsta ? "bg-primary-50" : ""}`}>
              <input
                type="checkbox"
                className={`${chequeo} mt-1 shrink-0`}
                checked={marcados.has(claveDe(f))}
                onChange={() => onAlternar(f)}
                aria-label={`Marcar a ${f.alumno.nombre}`}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <button type="button" onClick={() => onAbrir(f)} className="block w-full min-w-0 text-left">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 truncate text-[15px] font-semibold text-texto">{f.alumno.nombre}</span>
                    <span className={`shrink-0 text-[15px] font-bold tabular-nums ${v.urgente ? "text-danger-text" : "text-texto"}`}>
                      {fmtMoney(f.saldo)}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-texto-3">{sub(f)}</span>
                </button>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {chipVence(v)}
                    {recordatorio(f, v.urgente)}
                  </span>
                  <BotonFila icono="qr" className="ml-auto" onClick={() => onAbrir(f)}>
                    Enviar QR
                  </BotonFila>
                </div>
              </div>
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
      <div>
        {posicion && (
          <ResumenPanel className="mb-4 space-y-2.5">
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="text-texto-2">Enviando a los {posicion.total} marcados</span>
              <span className="font-semibold tabular-nums text-texto">
                {posicion.actual + 1} de {posicion.total}
              </span>
            </div>
            <div aria-hidden="true" className="flex gap-1">
              {Array.from({ length: posicion.total }, (_, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= posicion.actual ? "bg-primary" : "bg-primary-100"}`} />
              ))}
            </div>
            <div className="flex justify-between gap-2">
              <BotonFila variante="ghost" disabled={posicion.actual === 0} onClick={onAnterior}>
                ‹ Anterior
              </BotonFila>
              <BotonFila variante={ultimo ? "ghost" : "soft"} onClick={onSiguiente}>
                {ultimo ? "Terminar" : "Siguiente ›"}
              </BotonFila>
            </div>
          </ResumenPanel>
        )}

        <SeccionPanel titulo="Se envía a">
          <div className="flex items-center gap-3 text-sm">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700">
              <Icon name={fila.contacto.esTutor ? "users" : "user"} size={18} />
            </span>
            <dl className="min-w-0">
              <dt className="sr-only">Se envía a</dt>
              <dd className="font-semibold text-texto">
                {fila.contacto.nombre}
                {fila.contacto.esTutor ? " (tutor)" : ""}
              </dd>
              <dd className={fila.contacto.telefono ? "text-texto-2" : "font-semibold text-danger-text"}>
                {fila.contacto.telefono ? `WhatsApp ${fila.contacto.telefono}` : "No tiene un celular cargado"}
              </dd>
            </dl>
          </div>
        </SeccionPanel>

        {enviado ? (
          <SeccionPanel titulo="El mensaje">
            <div className="space-y-2">
              {/* El enlace de pago es una sola "palabra" larga: sin cortarla se salía del globo (QA ronda 2, B-20). */}
              <p className="whitespace-pre-wrap break-all rounded-xl rounded-tl-sm border border-primary-100 bg-primary-50 p-3 text-[13px] text-texto">
                {enviado.texto}
              </p>
              <p role="status" className="flex items-center gap-1.5 text-[13px] font-semibold text-primary-700">
                <Icon name="check" size={15} /> Anotado: recordado hoy a las {fmtHora(enviado.en)}
              </p>
            </div>
          </SeccionPanel>
        ) : (
          <p className="border-t border-borde-soft pt-4 text-[13px] text-texto-3">
            WhatsApp se abre con el mensaje y el enlace de pago listos; vos sólo tocás enviar. Queda anotado "recordado hoy".
          </p>
        )}
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </PanelLateral>
  );
}
