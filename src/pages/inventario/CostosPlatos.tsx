import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Chips, EncabezadoPagina, FilaFiltros } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { AvisoOk, Boton, Cargando, ErrorMsg, Select, Vacio, useAviso } from "../../components/ui";
import { fmtCantidad, fmtFecha, fmtMoney, fmtPlata } from "../../lib/format";
import { tienePermiso } from "../../lib/permisos";
import { apiRecetas } from "../../lib/recetas/api";
import { anchoDelCosto, margenDe, ordenarPorLoQueDeja, promedioQueQueda, round2 } from "../../lib/recetas/calculo";
import type { AvisoPlato, CostoDePlato, TableroCostos } from "../../lib/recetas/tipos";
import { useApi } from "../../lib/useApi";
import { useSucursales } from "../../lib/useSucursales";
import { useAuth } from "../../store/AuthContext";
import { RUTA_REGISTRAR_COMPRA } from "./Movimientos";
import EditorReceta from "./recetas/EditorReceta";
import { textoAlcanza, textoCausa, textoDiferencia, textoGanancia, textoQueQueda, tituloAviso } from "./recetas/textos";

/**
 * «Costos de platos» (CONTRATO-recetas-plato §3.5): cuánto cuesta hoy cada
 * plato con receta y cuánto deja, con el aviso cuando el costo se movió desde
 * la última vez que se miró. Lo arma el backend (`GET /recetas-plato/costos`):
 * acá sólo se ordena y se dice.
 *
 * Sólo existe con las recetas prendidas y para quien ve los costos (ver
 * `costos_platos` en `lib/permisos.ts`). Tocar un plato abre su receta, si
 * quien mira puede editar el catálogo.
 */
export default function CostosPlatos() {
  const navigate = useNavigate();
  const { usuario, puede } = useAuth();
  const suc = useSucursales({ incluirDepositos: true });
  // Con la clave del local: lo de otra sucursal no se ve mientras llega lo nuevo.
  const tablero = useApi(() => apiRecetas.costos(suc.sucursalId), [suc.sucursalId], { clave: suc.sucursalId });
  const [editando, setEditando] = useState<number | null>(null);
  const [aviso, setAviso] = useAviso();
  // El PUT de la receta pide `catalogo.editar`: sin él, el tablero se mira y nada más.
  const editaRecetas = tienePermiso(usuario, "catalogo.editar");
  const t = tablero.datos;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Costos de platos"
        subtitulo="Cuánto te cuesta hoy cada plato y cuánto te deja. Se actualiza solo con cada compra."
        accion={
          puede("movimientos") && (
            <Boton icono="plus" className="min-h-11" onClick={() => navigate(RUTA_REGISTRAR_COMPRA)}>
              Registrar compra
            </Boton>
          )
        }
      />

      {suc.elegirSucursal && (
        <FilaFiltros>
          <Chips titulo="Sucursal" valor={suc.valorChip} opciones={suc.opciones} onChange={suc.alElegir} />
        </FilaFiltros>
      )}

      <AvisoOk>{aviso}</AvisoOk>

      {tablero.error && !t ? (
        <ErrorMsg onReintentar={tablero.recargar}>{tablero.error}</ErrorMsg>
      ) : !t ? (
        <Cargando />
      ) : (
        <Tablero
          tablero={t}
          puedeVerInsumos={puede("insumos")}
          onAbrir={editaRecetas ? setEditando : undefined}
          onVisto={tablero.recargar}
          onIrAInsumos={() => navigate("/inventario/insumos")}
        />
      )}

      {editando != null && (
        <EditorReceta
          key={editando}
          platoId={editando}
          platos={(t?.platos ?? []).map((p) => ({ id: p.id, nombre: p.nombre }))}
          sucursalId={suc.sucursalId}
          onClose={() => setEditando(null)}
          onGuardada={(r) => {
            setEditando(null);
            tablero.recargar();
            setAviso(r.conReceta ? `Receta de ${r.nombre} guardada.` : `${r.nombre} volvió a Elaborado.`);
          }}
        />
      )}
    </div>
  );
}

function Tablero({
  tablero: t,
  puedeVerInsumos,
  onAbrir,
  onVisto,
  onIrAInsumos,
}: {
  tablero: TableroCostos;
  puedeVerInsumos: boolean;
  /** Abre la receta del plato. Sin él (no edita el catálogo), las filas no se tocan. */
  onAbrir?: (platoId: number) => void;
  onVisto: () => void;
  onIrAInsumos: () => void;
}) {
  const ordenados = ordenarPorLoQueDeja(t.platos);
  const peor = ordenados.find((p) => margenDe(p.precio, p.costo) != null);
  const gananciaPeor = peor ? round2(peor.precio! - peor.costo!) : 0;
  const promedio = promedioQueQueda(t.platos);
  const total = t.platos.length + t.sinReceta.length;
  // El gráfico arranca en el primero del aviso o, si no hay, en el que menos deja.
  const delAviso = t.aviso.platos.find((a) => t.platos.some((p) => p.id === a.id));
  const inicialGrafico = delAviso?.id ?? ordenados[0]?.id ?? null;

  return (
    <div className="space-y-4">
      <AvisoDeCostos tablero={t} onAbrir={onAbrir} onVisto={onVisto} />

      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))]">
        <Cifra
          etiqueta="Platos con receta"
          valor={`${t.platos.length} de ${total}`}
          pie={t.sinReceta.length ? `${t.sinReceta.length} todavía sin receta` : "Todos tienen receta"}
        />
        <Cifra
          etiqueta={`De cada ${fmtPlata(100)} que vendés`}
          valor={promedio != null ? `te quedan ${fmtPlata(promedio)}` : "—"}
          pie="después de pagar los insumos, en promedio"
          verde
        />
        <Cifra
          etiqueta="El plato que menos deja"
          valor={peor?.nombre ?? "—"}
          pie={
            peor
              ? `${gananciaPeor < 0 ? textoGanancia(gananciaPeor) : fmtMoney(gananciaPeor)} por plato · ${Math.round(margenDe(peor.precio, peor.costo)! * 100)} % del precio`
              : undefined
          }
          nombre
        />
      </div>

      <section className="card space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-texto">Lo que te deja cada plato</h2>
          <div aria-hidden="true" className="flex gap-3.5 text-xs text-texto-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-slate-400" />
              Costo
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-primary" />
              Ganancia
            </span>
          </div>
        </div>
        {ordenados.length === 0 ? (
          <Vacio
            icono="cubiertos"
            titulo="Todavía no hay platos con receta"
            texto="Armale la receta a un plato desde Artículos o desde «Platos todavía sin receta»."
          />
        ) : (
          <ul aria-label="Lo que te deja cada plato" className="divide-y divide-borde-soft">
            {ordenados.map((p) => (
              <li key={p.id}>
                <FilaPlato plato={p} onAbrir={onAbrir ? () => onAbrir(p.id) : undefined} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid items-start gap-4 grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))]">
        <section className="card space-y-2 p-4">
          <h2 className="text-base font-bold text-texto">Lo que menos te queda</h2>
          <p className="text-[13px] text-texto-3">
            Lo que contás dice cuánto queda; lo que estimás, cuánto debería quedar según lo que se vendió.
          </p>
          {t.insumos.length === 0 ? (
            <p className="py-2 text-[13px] text-texto-3">
              Cuando registres las compras de tus insumos, acá ves lo que se está acabando.
            </p>
          ) : (
            <ul aria-label="Lo que menos te queda" className="divide-y divide-borde-soft">
              {t.insumos.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <span className="min-w-0 flex-[1_1_140px] break-words font-semibold text-texto">{i.nombre}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      i.seCuenta ? "bg-primary-50 text-primary-700" : "bg-slate-100 text-texto-2"
                    }`}
                  >
                    {i.seCuenta ? "Se cuenta" : "Se estima"}
                  </span>
                  <span className="basis-full text-[13px] text-texto-2">{textoQueQueda(i)}</span>
                </li>
              ))}
            </ul>
          )}
          {puedeVerInsumos && (
            <div className="pt-1">
              <Boton variante="ghost" className="min-h-11" onClick={onIrAInsumos}>
                Ver todos los insumos
              </Boton>
            </div>
          )}
        </section>

        <div className="min-w-0 space-y-4">
          <GraficoCosto platos={ordenados} inicial={inicialGrafico} />

          <section className="card space-y-2.5 p-4">
            <h2 className="text-base font-bold text-texto">Platos todavía sin receta</h2>
            {t.sinReceta.length === 0 ? (
              <p className="text-[13px] text-texto-3">Todos tus platos tienen receta.</p>
            ) : (
              <>
                <p className="text-[13px] text-texto-3">
                  A estos el costo se les sigue poniendo a mano, como hoy. Les armás la receta cuando quieras.
                </p>
                <div className="flex flex-wrap gap-2">
                  {t.sinReceta.map((p) =>
                    onAbrir ? (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onAbrir(p.id)}
                        className="min-h-11 rounded-full bg-slate-100 px-4 text-[13px] font-semibold text-texto-2 hover:bg-slate-200"
                      >
                        {p.nombre}
                      </button>
                    ) : (
                      <span
                        key={p.id}
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-[13px] font-semibold text-texto-2"
                      >
                        {p.nombre}
                      </span>
                    ),
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** El aviso ámbar si algún plato cambió de costo desde la última vez; si no, la tarjeta verde. */
function AvisoDeCostos({
  tablero: t,
  onAbrir,
  onVisto,
}: {
  tablero: TableroCostos;
  onAbrir?: (platoId: number) => void;
  onVisto: () => void;
}) {
  const [marcando, setMarcando] = useState(false);
  const [error, setError] = useState("");

  async function marcarVisto() {
    if (marcando) return;
    setMarcando(true);
    setError("");
    try {
      await apiRecetas.marcarVisto();
      onVisto();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar como visto.");
    } finally {
      setMarcando(false);
    }
  }

  if (!t.aviso.platos.length) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3.5">
        <span className="shrink-0 text-primary-700">
          <Icon name="check" size={22} />
        </span>
        <p className="text-sm text-texto">
          Ningún plato cambió de costo {fmtCantidad(t.avisoPct)} % o más desde la última vez que miraste. Ese margen lo
          ajustás en Configuración.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Cambios de costo"
      className="space-y-3.5 rounded-2xl border border-warning-borde bg-warning-suave p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-[1_1_260px] items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-bg text-warning-text"
          >
            <Icon name="alert" size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-texto">{tituloAviso(t.aviso.platos)}</h2>
            {t.aviso.causas.map((c) => (
              <p key={c.insumoId} className="mt-0.5 text-[13px] text-texto-2">
                {textoCausa(c)}
              </p>
            ))}
          </div>
        </div>
        <Boton variante="ghost" className="min-h-11" onClick={() => void marcarVisto()} disabled={marcando}>
          {marcando ? "Un momento…" : "Ya lo vi"}
        </Boton>
      </div>
      <ul className="space-y-2">
        {t.aviso.platos.map((a) => (
          <li key={a.id}>
            <FilaAviso plato={a} onAbrir={onAbrir ? () => onAbrir(a.id) : undefined} />
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-texto-2">El precio de venta no se toca: lo decidís vos. Esto sólo te avisa.</p>
      <ErrorMsg>{error}</ErrorMsg>
    </section>
  );
}

function FilaAviso({ plato: a, onAbrir }: { plato: AvisoPlato; onAbrir?: () => void }) {
  const cuerpo = (
    <>
      <span className="min-w-0 flex-[1_1_170px] break-words text-[15px] font-semibold text-texto">{a.nombre}</span>
      <span className="text-[13px] text-texto-2">
        Te costaba {fmtMoney(a.antes)} · ahora <strong className="text-texto">{fmtMoney(a.ahora)}</strong>
      </span>
      <span className="rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-bold text-warning-text">
        {textoDiferencia(a.antes, a.ahora)}
      </span>
      {a.precio != null && (
        <span className="flex-[1_1_150px] text-right text-[13px] text-texto-2">
          {textoGanancia(round2(a.precio - a.ahora))} por plato
        </span>
      )}
    </>
  );
  const clase =
    "flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-warning-borde bg-white px-3.5 py-3 text-left";
  return onAbrir ? (
    <button type="button" onClick={onAbrir} className={`${clase} min-h-11 hover:bg-warning-suave`}>
      {cuerpo}
    </button>
  ) : (
    <div className={clase}>{cuerpo}</div>
  );
}

/** Una fila de «Lo que te deja cada plato»: la barra gris es el costo y la verde lo que queda. */
function FilaPlato({ plato: p, onAbrir }: { plato: CostoDePlato; onAbrir?: () => void }) {
  const ancho = anchoDelCosto(p.precio, p.costo);
  const margen = margenDe(p.precio, p.costo);
  const ganancia = p.precio != null && p.costo != null ? round2(p.precio - p.costo) : null;
  const alcanza = textoAlcanza(p.alcanza);
  const cuerpo = (
    <>
      <span className="flex min-w-0 flex-[1_1_180px] flex-col gap-0.5">
        <span className="break-words text-[15px] font-semibold text-texto">{p.nombre}</span>
        {alcanza && <span className="text-xs text-texto-3">{alcanza}</span>}
        {p.sinCosto.length > 0 && (
          <span className="self-start rounded-full bg-warning-bg px-2 py-px text-[11px] font-semibold text-warning-text">
            Costo incompleto
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-[3_1_220px] flex-col gap-1.5">
        {ancho != null && (
          <span aria-hidden="true" className="flex h-3 overflow-hidden rounded-full bg-primary">
            <span className="bg-slate-400" style={{ width: `${ancho}%` }} />
          </span>
        )}
        <span className="text-xs text-texto-2">
          Costo {p.costo != null ? fmtMoney(p.costo) : "—"} · {p.precio != null ? `Precio ${fmtMoney(p.precio)}` : "Sin precio"}
        </span>
      </span>
      <span className="flex flex-[1_1_140px] flex-col text-right">
        {ganancia != null && (
          <span className={`text-[15px] font-bold ${ganancia < 0 ? "text-danger-text" : "text-primary-700"}`}>
            {textoGanancia(ganancia)}
          </span>
        )}
        {margen != null && <span className="text-xs text-texto-3">{Math.round(margen * 100)} % del precio</span>}
      </span>
    </>
  );
  const clase = "flex w-full flex-wrap items-center gap-x-4 gap-y-2 py-3.5 text-left";
  return onAbrir ? (
    <button type="button" onClick={onAbrir} className={`${clase} min-h-11 rounded-lg hover:bg-muted`}>
      {cuerpo}
    </button>
  ) : (
    <div className={clase}>{cuerpo}</div>
  );
}

function Cifra({
  etiqueta,
  valor,
  pie,
  verde,
  nombre,
}: {
  etiqueta: string;
  valor: string;
  pie?: string;
  verde?: boolean;
  /** El valor es el nombre de un plato: más chico, y se parte en renglones en vez de cortarse. */
  nombre?: boolean;
}) {
  return (
    <div className="card min-w-0 px-4 py-3.5">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-texto-4">{etiqueta}</p>
      <p
        className={`mt-1.5 break-words font-bold ${nombre ? "text-lg" : "text-2xl"} ${
          verde ? "text-primary-700" : "text-texto"
        }`}
      >
        {valor}
      </p>
      {pie && <p className="text-[13px] text-texto-3">{pie}</p>}
    </div>
  );
}

/** «Cómo se movió el costo»: una línea chica del plato elegido, del costo más viejo al de hoy. */
function GraficoCosto({ platos, inicial }: { platos: CostoDePlato[]; inicial: number | null }) {
  const [elegido, setElegido] = useState<number | null>(null);
  const id = elegido ?? inicial;
  const plato = platos.find((p) => p.id === id);
  const historial = useApi(
    () => (id == null ? Promise.resolve(null) : apiRecetas.historial(id)),
    [id],
    { clave: id },
  );
  return (
    <section className="card space-y-2.5 p-4">
      <h2 className="text-base font-bold text-texto">Cómo se movió el costo</h2>
      {!plato ? (
        <p className="text-[13px] text-texto-3">Cuando un plato tenga receta, acá ves cómo cambia su costo con cada compra.</p>
      ) : (
        <>
          {platos.length > 1 && (
            <Select
              aria-label="Plato del gráfico"
              className="min-h-11"
              value={String(plato.id)}
              onChange={(e) => setElegido(Number(e.target.value))}
            >
              {platos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          )}
          <p className="text-[13px] text-texto-3">{plato.nombre}: lo que costó hacerlo cada vez que cambió.</p>
          {historial.error ? (
            <ErrorMsg onReintentar={historial.recargar}>{historial.error}</ErrorMsg>
          ) : !historial.datos ? (
            <p className="text-[13px] text-texto-3">Cargando…</p>
          ) : (
            <Linea puntos={historial.datos.puntos} nombre={plato.nombre} />
          )}
        </>
      )}
    </section>
  );
}

function Linea({ puntos, nombre }: { puntos: { fecha: string; costo: number }[]; nombre: string }) {
  if (puntos.length === 0) return <p className="text-[13px] text-texto-3">Todavía no hay costos guardados de este plato.</p>;
  const primero = puntos[0];
  const hoy = puntos[puntos.length - 1];
  if (puntos.length === 1) {
    return <p className="text-[13px] text-texto-2">Todavía no cambió de costo: {fmtMoney(hoy.costo)}.</p>;
  }
  // Escala propia, como en la maqueta: el eje no arranca en 0, para que un
  // cambio de centavos se vea (con el 0 abajo, la línea quedaba plana).
  const valores = puntos.map((p) => p.costo);
  const min = Math.min(...valores) * 0.97;
  const rango = Math.max(...valores) * 1.03 - min || 1;
  const x = (i: number) => 14 + (i * 292) / (puntos.length - 1);
  const y = (v: number) => 92 - ((v - min) / rango) * 74;
  const ultimo = { x: x(puntos.length - 1), y: y(hoy.costo) };
  return (
    <>
      <svg
        viewBox="0 0 320 104"
        role="img"
        aria-label={`Costo de ${nombre}: pasó de ${fmtMoney(primero.costo)} a ${fmtMoney(hoy.costo)}`}
        className="block h-auto max-h-52 w-full"
      >
        <line x1="10" y1="98" x2="310" y2="98" stroke="#E2E8F0" strokeWidth="1" />
        <polyline
          points={puntos.map((p, i) => `${x(i).toFixed(1)},${y(p.costo).toFixed(1)}`).join(" ")}
          fill="none"
          stroke="var(--color-primary-boton)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={ultimo.x.toFixed(1)} cy={ultimo.y.toFixed(1)} r="5" fill="var(--color-primary-boton)" />
      </svg>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-texto-2">
        <span>
          {fmtFecha(primero.fecha)}: {fmtMoney(primero.costo)}
        </span>
        <span>
          Hoy: <strong className="text-texto">{fmtMoney(hoy.costo)}</strong>
        </span>
      </div>
    </>
  );
}
