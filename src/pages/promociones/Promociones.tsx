import { useState } from "react";
import { Icon } from "../../components/Icon";
import {
  AvisoOk,
  Badge,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Modal,
  Select,
  Vacio,
} from "../../components/ui";
import { api } from "../../lib/api";
import { fmtFecha, fmtMoney } from "../../lib/format";
import { apiPromociones } from "../../lib/promociones/apiPromociones";
import {
  DIAS_SEMANA,
  ESTADO_VISIBLE,
  PLANTILLAS,
  TIPOS,
  resumenVentana,
} from "../../lib/promociones/textos";
import type {
  Cupon,
  EnlaceCampana,
  Promocion,
  PromocionInput,
  ReportePromocion,
} from "../../lib/promociones/tipos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";

/**
 * Promociones y cupones (PLAN-CRM-Y-PROMOCIONES §4): la lista, el editor con
 * plantillas, los cupones de cada una y el enlace para compartirla.
 *
 * El descuento lo calcula el backend (`/ventas/cotizar`): acá sólo se
 * configuran las reglas. Sin `cupones` en el plan, las promociones "con
 * código" no se ofrecen.
 */
export default function Promociones() {
  const { negocio } = useAuth();
  const conCupones = !!negocio?.features?.includes("cupones");
  const lista = useApi(() => apiPromociones.listar(), []);
  const [editando, setEditando] = useState<Partial<Promocion> | null>(null);
  const [cupones, setCupones] = useState<Promocion | null>(null);
  const [compartir, setCompartir] = useState<Promocion | null>(null);
  const [archivar, setArchivar] = useState<Promocion | null>(null);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");

  const cambiarEstado = async (p: Promocion, estado: Promocion["estado"]) => {
    setError("");
    try {
      await apiPromociones.estado(p.id, estado);
      lista.recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado");
    }
  };

  const promos = lista.datos ?? [];
  const vivas = promos.filter((p) => p.estado !== "ARCHIVADA");
  const archivadas = promos.filter((p) => p.estado === "ARCHIVADA");

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-texto">Promociones</h1>
          <p className="text-sm text-texto-3">
            Se aplican solas en el punto de venta cuando se cumplen sus condiciones
            {conCupones ? ", o con un código de cupón." : "."}
          </p>
        </div>
        <Boton icono="plus" onClick={() => setEditando({})}>
          Nueva promoción
        </Boton>
      </div>

      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>

      {lista.cargando ? (
        <Cargando texto="Cargando promociones…" />
      ) : lista.error ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : vivas.length === 0 ? (
        <div className="rounded-2xl border border-borde bg-white">
          <Vacio
            icono="dollar"
            titulo="Todavía no hay promociones"
            texto="Empezá con una plantilla: 2x1 los martes, happy hour o un cupón de bienvenida."
            accion={
              <div className="flex flex-wrap justify-center gap-2">
                {PLANTILLAS.filter((t) => conCupones || t.datos.disparo !== "CODIGO").map((t) => (
                  <Boton key={t.nombre} variante="soft" onClick={() => setEditando(t.datos)}>
                    {t.nombre}
                  </Boton>
                ))}
              </div>
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {vivas.map((p) => (
            <TarjetaPromocion
              key={p.id}
              p={p}
              conCupones={conCupones}
              onEditar={() => setEditando(p)}
              onCupones={() => setCupones(p)}
              onCompartir={() => setCompartir(p)}
              onPausar={() => void cambiarEstado(p, p.estado === "PAUSADA" ? "ACTIVA" : "PAUSADA")}
              onArchivar={() => setArchivar(p)}
            />
          ))}
        </ul>
      )}

      {archivadas.length > 0 && (
        <details className="rounded-2xl border border-borde bg-white p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-texto-2">
            Archivadas ({archivadas.length})
          </summary>
          <ul className="mt-2 divide-y divide-borde-soft">
            {archivadas.map((p) => (
              <li key={p.id} className="flex justify-between py-2 text-texto-3">
                <span>{p.nombre}</span>
                <span>
                  {p.usos} usos · {fmtMoney(p.descontado)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {editando && (
        <EditorPromocion
          inicial={editando}
          conCupones={conCupones}
          onCerrar={() => setEditando(null)}
          onGuardada={(p, nueva) => {
            setEditando(null);
            setAviso(nueva ? `Se creó "${p.nombre}"` : `Se guardó "${p.nombre}"`);
            lista.recargar();
          }}
        />
      )}
      {cupones && <PanelCupones promo={cupones} onCerrar={() => { setCupones(null); lista.recargar(); }} />}
      {compartir && <PanelCompartir promo={compartir} onCerrar={() => setCompartir(null)} />}
      <Confirmar
        abierto={!!archivar}
        titulo="¿Archivar la promoción?"
        texto="Deja de aplicarse y no vuelve: si la querés de nuevo, creá otra. Su historia se conserva."
        etiquetaOk="Archivar"
        peligroso
        onCancel={() => setArchivar(null)}
        onOk={() => {
          if (archivar) void cambiarEstado(archivar, "ARCHIVADA");
          setArchivar(null);
        }}
      />
    </div>
  );
}

function TarjetaPromocion({
  p,
  conCupones,
  onEditar,
  onCupones,
  onCompartir,
  onPausar,
  onArchivar,
}: {
  p: Promocion;
  conCupones: boolean;
  onEditar: () => void;
  onCupones: () => void;
  onCompartir: () => void;
  onPausar: () => void;
  onArchivar: () => void;
}) {
  const estado = ESTADO_VISIBLE[p.estadoVisible] ?? ESTADO_VISIBLE.ACTIVA;
  const [reporte, setReporte] = useState<ReportePromocion | null>(null);
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-borde bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-bold text-texto">{p.nombre}</h2>
          <p className="text-xs text-texto-3">
            {p.disparo === "CODIGO" ? "Con código" : "Automática"} · {resumenVentana(p)}
          </p>
        </div>
        <Badge tono={estado.tono}>{estado.texto}</Badge>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {p.condiciones.map((c) => (
          <li key={c} className="rounded-lg bg-muted px-2 py-0.5 text-xs text-texto-2">
            {c}
          </li>
        ))}
      </ul>
      <p className="text-sm text-texto-2">
        {p.usos} {p.usos === 1 ? "uso" : "usos"}
        {p.usosMax != null && ` de ${p.usosMax}`} · descontado {fmtMoney(p.descontado)}
        {p.disparo === "CODIGO" && ` · ${p.cupones} ${p.cupones === 1 ? "cupón" : "cupones"}`}
      </p>
      {reporte && (
        <p className="rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-700">
          Ventas que la usaron: {fmtMoney(reporte.ventasNetas)}
          {reporte.ticketMedio != null && ` · ticket medio ${fmtMoney(reporte.ticketMedio)}`} ·{" "}
          {reporte.clientesUnicos} clientes identificados
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-1.5">
        <Boton variante="ghost" icono="edit" onClick={onEditar} className="px-3 py-1.5">
          Editar
        </Boton>
        {p.disparo === "CODIGO" && conCupones && (
          <Boton variante="ghost" onClick={onCupones} className="px-3 py-1.5">
            Cupones
          </Boton>
        )}
        {p.publica && p.estado === "ACTIVA" && (
          <Boton variante="ghost" icono="arrowUpRight" onClick={onCompartir} className="px-3 py-1.5">
            Compartir
          </Boton>
        )}
        <Boton
          variante="ghost"
          icono="chart"
          onClick={() => void apiPromociones.reporte(p.id).then(setReporte).catch(() => undefined)}
          className="px-3 py-1.5"
        >
          Resultado
        </Boton>
        <Boton variante="ghost" onClick={onPausar} className="px-3 py-1.5">
          {p.estado === "PAUSADA" ? "Reanudar" : "Pausar"}
        </Boton>
        <Boton variante="ghost" icono="archive" onClick={onArchivar} className="px-3 py-1.5">
          Archivar
        </Boton>
      </div>
    </li>
  );
}

// ── Editor ─────────────────────────────────────────────────────────────────

/** "2026-10-06" ↔ ISO: el día entero en hora de Bolivia (UTC−4). */
const inicioDia = (d: string) => (d ? new Date(`${d}T00:00:00-04:00`).toISOString() : null);
const finDia = (d: string) => (d ? new Date(`${d}T23:59:59-04:00`).toISOString() : null);
const aDia = (iso: string | null | undefined) =>
  iso ? new Date(new Date(iso).getTime() - 4 * 3_600_000).toISOString().slice(0, 10) : "";
const num = (v: string) => (v.trim() === "" ? null : Number(v));

export function EditorPromocion({
  inicial,
  conCupones,
  onCerrar,
  onGuardada,
}: {
  inicial: Partial<Promocion>;
  conCupones: boolean;
  onCerrar: () => void;
  onGuardada: (p: Promocion, nueva: boolean) => void;
}) {
  const productos = useApi(() => api.getProductos(), []);
  const categorias = useApi(() => api.getCategorias(false), []);
  const [f, setF] = useState({
    nombre: inicial.nombre ?? "",
    descripcion: inicial.descripcion ?? "",
    tipo: inicial.tipo ?? "PORCENTAJE",
    disparo: inicial.disparo ?? "AUTOMATICA",
    alcance: inicial.alcance ?? "LINEA",
    valor: inicial.valor != null ? String(inicial.valor) : "",
    llevaN: String(inicial.llevaN ?? 2),
    pagaM: String(inicial.pagaM ?? 1),
    minimoCompra: inicial.minimoCompra != null ? String(inicial.minimoCompra) : "",
    topeDescuento: inicial.topeDescuento != null ? String(inicial.topeDescuento) : "",
    desde: aDia(inicial.vigenciaDesde),
    hasta: aDia(inicial.vigenciaHasta),
    dias: inicial.diasSemana ?? [],
    horaDesde: inicial.horaDesde ?? "",
    horaHasta: inicial.horaHasta ?? "",
    usosMax: inicial.usosMax != null ? String(inicial.usosMax) : "",
    usosPorCliente: inicial.usosPorCliente != null ? String(inicial.usosPorCliente) : "",
    acumulable: inicial.acumulable ?? false,
    publica: inicial.publica ?? false,
    productoIds: inicial.productoIds ?? [],
    categoriaIds: inicial.categoriaIds ?? [],
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const nueva = inicial.id == null;
  const conAlcance = f.tipo === "PORCENTAJE" || f.tipo === "MONTO";

  const guardar = async () => {
    setError("");
    setGuardando(true);
    const input: PromocionInput = {
      nombre: f.nombre.trim(),
      descripcion: f.descripcion.trim() || null,
      tipo: f.tipo,
      disparo: f.disparo,
      alcance: conAlcance ? f.alcance : "LINEA",
      valor: f.tipo === "NXM" ? null : num(f.valor),
      llevaN: f.tipo === "NXM" ? Number(f.llevaN) : null,
      pagaM: f.tipo === "NXM" ? Number(f.pagaM) : null,
      minimoCompra: num(f.minimoCompra),
      topeDescuento: num(f.topeDescuento),
      vigenciaDesde: inicioDia(f.desde),
      vigenciaHasta: finDia(f.hasta),
      diasSemana: f.dias,
      horaDesde: f.horaDesde || null,
      horaHasta: f.horaHasta || null,
      usosMax: num(f.usosMax),
      usosPorCliente: num(f.usosPorCliente),
      acumulable: f.acumulable,
      publica: f.publica,
      productoIds: f.productoIds,
      categoriaIds: f.categoriaIds,
    };
    try {
      const p = nueva
        ? await apiPromociones.crear(input)
        : await apiPromociones.editar(inicial.id!, input);
      onGuardada(p, nueva);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const nombreProducto = (id: number) => productos.datos?.find((p) => p.id === id)?.nombre ?? `#${id}`;
  const etiquetaValor =
    f.tipo === "PORCENTAJE" ? "Porcentaje (%)" : f.tipo === "MONTO" ? "Monto (Bs)" : "Precio especial (Bs)";

  return (
    <Modal
      abierto
      titulo={nueva ? "Nueva promoción" : "Editar promoción"}
      onClose={onCerrar}
      ancho="max-w-2xl"
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={() => void guardar()} disabled={guardando || f.nombre.trim().length < 2}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorMsg>{error}</ErrorMsg>
        <Campo label="Nombre">
          <Input value={f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="2x1 los martes" />
        </Campo>
        <Campo label="Descripción para el cliente (opcional)">
          <Input value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} maxLength={300} />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Tipo" hint={TIPOS.find((t) => t.valor === f.tipo)?.ayuda}>
            <Select value={f.tipo} onChange={(e) => set("tipo", e.target.value as Promocion["tipo"])}>
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo label="Se aplica" hint={f.disparo === "CODIGO" ? "Sólo con un cupón: los cargás después" : "Sola, en el punto de venta"}>
            <Select value={f.disparo} onChange={(e) => set("disparo", e.target.value as Promocion["disparo"])}>
              <option value="AUTOMATICA">Automáticamente</option>
              {(conCupones || f.disparo === "CODIGO") && <option value="CODIGO">Con código (cupón)</option>}
            </Select>
          </Campo>
        </div>

        {f.tipo === "NXM" ? (
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Lleva">
              <Input type="number" value={f.llevaN} onChange={(e) => set("llevaN", e.target.value)} />
            </Campo>
            <Campo label="Paga">
              <Input type="number" value={f.pagaM} onChange={(e) => set("pagaM", e.target.value)} />
            </Campo>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label={etiquetaValor}>
              <Input type="number" value={f.valor} onChange={(e) => set("valor", e.target.value)} />
            </Campo>
            {conAlcance && (
              <Campo label="Sobre">
                <Select value={f.alcance} onChange={(e) => set("alcance", e.target.value as Promocion["alcance"])}>
                  <option value="LINEA">Cada artículo elegido</option>
                  <option value="TICKET">El total de la compra</option>
                </Select>
              </Campo>
            )}
          </div>
        )}

        <fieldset className="space-y-2">
          <legend className="mb-1 text-[13px] font-semibold text-texto-2">
            Artículos (vacío = todo el catálogo)
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {(categorias.datos ?? []).map((c) => {
              const activa = f.categoriaIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={activa}
                  onClick={() =>
                    set(
                      "categoriaIds",
                      activa ? f.categoriaIds.filter((x) => x !== c.id) : [...f.categoriaIds, c.id],
                    )
                  }
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                    activa ? "border-primary bg-primary-50 text-primary-700" : "border-borde text-texto-3"
                  }`}
                >
                  {c.nombre}
                </button>
              );
            })}
          </div>
          <Select
            value=""
            aria-label="Agregar un artículo"
            onChange={(e) => {
              const id = Number(e.target.value);
              if (id && !f.productoIds.includes(id)) set("productoIds", [...f.productoIds, id]);
            }}
          >
            <option value="">Agregar un artículo…</option>
            {(productos.datos ?? [])
              .filter((p) => p.habilitado && !f.productoIds.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </Select>
          {f.productoIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {f.productoIds.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5 text-xs">
                  {nombreProducto(id)}
                  <button
                    type="button"
                    aria-label={`Quitar ${nombreProducto(id)}`}
                    onClick={() => set("productoIds", f.productoIds.filter((x) => x !== id))}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-[13px] font-semibold text-texto-2">Días (vacío = todos)</legend>
          <div className="flex flex-wrap gap-1.5">
            {DIAS_SEMANA.map((d) => {
              const activo = f.dias.includes(d.n);
              return (
                <button
                  key={d.n}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => set("dias", activo ? f.dias.filter((x) => x !== d.n) : [...f.dias, d.n])}
                  className={`h-9 w-10 rounded-lg border text-xs font-bold ${
                    activo ? "border-primary bg-primary-50 text-primary-700" : "border-borde text-texto-3"
                  }`}
                >
                  {d.corto}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-4">
          <Campo label="Desde la hora">
            <Input type="time" value={f.horaDesde} onChange={(e) => set("horaDesde", e.target.value)} />
          </Campo>
          <Campo label="Hasta la hora">
            <Input type="time" value={f.horaHasta} onChange={(e) => set("horaHasta", e.target.value)} />
          </Campo>
          <Campo label="Empieza">
            <Input type="date" value={f.desde} onChange={(e) => set("desde", e.target.value)} />
          </Campo>
          <Campo label="Termina">
            <Input type="date" value={f.hasta} onChange={(e) => set("hasta", e.target.value)} />
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Campo label="Compra mínima (Bs)">
            <Input type="number" value={f.minimoCompra} onChange={(e) => set("minimoCompra", e.target.value)} />
          </Campo>
          <Campo label="Descuento máximo (Bs)">
            <Input type="number" value={f.topeDescuento} onChange={(e) => set("topeDescuento", e.target.value)} />
          </Campo>
          <Campo label="Usos en total">
            <Input type="number" value={f.usosMax} onChange={(e) => set("usosMax", e.target.value)} placeholder="Sin límite" />
          </Campo>
          <Campo label="Usos por cliente">
            <Input
              type="number"
              value={f.usosPorCliente}
              onChange={(e) => set("usosPorCliente", e.target.value)}
              placeholder="Sin límite"
            />
          </Campo>
        </div>

        <label className="flex items-center gap-2 text-sm text-texto-2">
          <input type="checkbox" checked={f.acumulable} onChange={(e) => set("acumulable", e.target.checked)} />
          Se suma a otras promociones (si no, gana la que más descuenta)
        </label>
        <label className="flex items-center gap-2 text-sm text-texto-2">
          <input type="checkbox" checked={f.publica} onChange={(e) => set("publica", e.target.checked)} />
          Pública: tiene su página para compartir por WhatsApp y redes
        </label>
      </div>
    </Modal>
  );
}

// ── Cupones ────────────────────────────────────────────────────────────────

function PanelCupones({ promo, onCerrar }: { promo: Promocion; onCerrar: () => void }) {
  const lista = useApi(() => apiPromociones.cupones(promo.id), [promo.id]);
  const [modo, setModo] = useState<"codigo" | "lote">("codigo");
  const [codigo, setCodigo] = useState("");
  const [cantidad, setCantidad] = useState("20");
  const [prefijo, setPrefijo] = useState("");
  const [usosMax, setUsosMax] = useState("");
  const [vence, setVence] = useState("");
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);

  const crear = async () => {
    setError("");
    setCreando(true);
    try {
      await apiPromociones.crearCupones(promo.id, {
        ...(modo === "codigo" ? { codigo } : { cantidad: Number(cantidad), prefijo: prefijo || undefined }),
        ...(usosMax ? { usosMax: Number(usosMax) } : {}),
        ...(vence ? { venceEn: finDia(vence)! } : {}),
      });
      setCodigo("");
      lista.recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setCreando(false);
    }
  };

  const tono: Record<Cupon["estado"], "verde" | "rojo" | "gris" | "amarillo"> = {
    ACTIVO: "verde",
    AGOTADO: "amarillo",
    VENCIDO: "gris",
    ANULADO: "rojo",
  };

  return (
    <Modal abierto titulo={`Cupones · ${promo.nombre}`} onClose={onCerrar} ancho="max-w-xl">
      <div className="space-y-3">
        <div className="flex gap-1.5">
          {(["codigo", "lote"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={modo === m}
              onClick={() => setModo(m)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                modo === m ? "border-primary bg-primary-50 text-primary-700" : "border-borde text-texto-3"
              }`}
            >
              {m === "codigo" ? "Un código" : "Lote para imprimir"}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {modo === "codigo" ? (
            <Campo label="Código">
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="VERANO20" />
            </Campo>
          ) : (
            <>
              <Campo label="Cantidad">
                <Input type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
              </Campo>
              <Campo label="Prefijo">
                <Input value={prefijo} onChange={(e) => setPrefijo(e.target.value.toUpperCase())} maxLength={8} />
              </Campo>
            </>
          )}
          <Campo label="Usos máx." hint={modo === "lote" ? "1 por defecto" : "Vacío = sin límite"}>
            <Input type="number" value={usosMax} onChange={(e) => setUsosMax(e.target.value)} />
          </Campo>
          <Campo label="Vence">
            <Input type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
          </Campo>
        </div>
        <ErrorMsg>{error}</ErrorMsg>
        <div className="flex flex-wrap gap-2">
          <Boton onClick={() => void crear()} disabled={creando || (modo === "codigo" && codigo.trim().length < 3)}>
            {creando ? "Creando…" : "Crear"}
          </Boton>
          <Boton
            variante="ghost"
            icono="download"
            onClick={() => void apiPromociones.bajarCuponesCsv(promo.id).catch((e: Error) => setError(e.message))}
          >
            Bajar CSV
          </Boton>
        </div>
        {lista.cargando ? (
          <Cargando />
        ) : (
          <ul className="max-h-72 divide-y divide-borde-soft overflow-y-auto rounded-xl border border-borde">
            {(lista.datos ?? []).length === 0 && (
              <li className="p-3 text-sm text-texto-3">Todavía no hay cupones.</li>
            )}
            {(lista.datos ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="font-mono font-semibold text-texto">{c.codigo}</span>
                <span className="text-xs text-texto-3">
                  {c.usos}
                  {c.usosMax != null ? `/${c.usosMax}` : ""} usos
                  {c.venceEn ? ` · vence ${fmtFecha(c.venceEn)}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <Badge tono={tono[c.estado]}>{c.estado}</Badge>
                  {c.estado === "ACTIVO" && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-danger-text"
                      onClick={() => void apiPromociones.anularCupon(c.id).then(lista.recargar)}
                    >
                      Anular
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

// ── Compartir ──────────────────────────────────────────────────────────────

function PanelCompartir({ promo, onCerrar }: { promo: Promocion; onCerrar: () => void }) {
  const [canal, setCanal] = useState("WHATSAPP");
  const enlace = useApi<EnlaceCampana>(() => apiPromociones.enlace(promo.id, canal), [promo.id, canal]);
  const [texto, setTexto] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const mensaje = texto ?? enlace.datos?.texto.replace("{nombre}", "").replace("¡Hola ! ", "¡Hola! ") ?? "";

  const copiar = async (t: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setAviso(ok);
    } catch {
      setError("No se pudo copiar: seleccioná el texto y copialo a mano.");
    }
  };

  return (
    <Modal abierto titulo={`Compartir · ${promo.nombre}`} onClose={onCerrar} ancho="max-w-xl">
      <div className="space-y-3">
        <p className="text-sm text-texto-3">
          Un enlace corto a la página de la promo, con contador de clics por canal. Para mandarlo a tus
          clientes uno por uno, usá la lista de <strong>Clientes que no vuelven</strong>.
        </p>
        <Campo label="Dónde lo vas a publicar">
          <Select value={canal} onChange={(e) => setCanal(e.target.value)}>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="ESTADO_WA">Estado de WhatsApp</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="CARTEL">Cartel en el local</option>
          </Select>
        </Campo>
        {enlace.cargando ? (
          <Cargando />
        ) : enlace.error ? (
          <ErrorMsg onReintentar={enlace.recargar}>{enlace.error}</ErrorMsg>
        ) : (
          enlace.datos && (
            <>
              <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-mono">{enlace.datos.url}</span>
                <Boton variante="soft" className="px-3 py-1.5" onClick={() => void copiar(enlace.datos!.url, "Enlace copiado")}>
                  Copiar
                </Boton>
              </div>
              <Campo label="Texto">
                <textarea
                  value={mensaje}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto outline-none focus:border-primary"
                />
              </Campo>
              <div className="flex flex-wrap gap-2">
                <Boton variante="soft" onClick={() => void copiar(mensaje, "Texto copiado")}>
                  Copiar texto
                </Boton>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary-boton px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-boton-hover"
                >
                  Abrir WhatsApp
                </a>
                <Boton
                  variante="ghost"
                  icono="home"
                  onClick={() =>
                    void apiPromociones
                      .anunciar(promo.id)
                      .then(() => setAviso("Quedó como anuncio de tu página"))
                      .catch((e: Error) => setError(e.message))
                  }
                >
                  Anunciar en mi página
                </Boton>
              </div>
            </>
          )
        )}
        <AvisoOk>{aviso}</AvisoOk>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
