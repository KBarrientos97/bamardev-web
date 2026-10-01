import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Chips } from "../../components/filtros";
import { Icon, type NombreIcono } from "../../components/Icon";
import { Badge, Cargando, ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtFecha, fmtMoney, fmtNum, isoDia } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useSucursales } from "../../lib/useSucursales";
import { useAuth } from "../../store/AuthContext";
import type { Dashboard, TramoVencimiento, Vencimientos } from "../../types";
import { TRAMOS, type FiltroVencimientos } from "./medicamento";

/**
 * El Dashboard de la farmacia: lo primero que abre el dueño.
 *
 * Responde tres preguntas en este orden: cuánto tengo (los cuatro números),
 * qué se me está por perder (el semáforo de vencimientos) y qué tengo que
 * reponer (stock crítico, al lado de lo que más sale hoy). Las tres llevan a
 * la pantalla donde se actúa: tocar un tramo abre Vencimientos filtrado.
 *
 * Es la pantalla de `/inventario` sólo en farmacia (se elige en `App.tsx`): el
 * Dashboard de siempre sigue siendo el de los demás rubros, sin enterarse.
 *
 * Se diseña desde el teléfono: los números van de a dos, el semáforo de a dos
 * y las dos listas una abajo de la otra. Recién en pantalla ancha se abren a
 * cuatro columnas y a dos listas lado a lado.
 */

/** Cuántas filas de stock crítico entran antes de mandar al catálogo. */
const CRITICOS_A_LA_VISTA = 6;

/** Lo que devuelve `/reportes/top-productos`, con lo que se usa acá. */
interface MasVendido {
  nombre: string;
  unidades: number;
}

export default function DashboardFarmacia() {
  const navigate = useNavigate();
  const { puede, incluye } = useAuth();
  // Con depósitos: la mercadería entra ahí antes de pasar al mostrador, así
  // que su stock es parte de lo que este resumen valoriza.
  const suc = useSucursales({ incluirDepositos: true });

  // Cada bloque pide lo suyo y respeta su propio permiso: una farmacia sin
  // `lotes` (plan BASICO) no ve el semáforo, y quien no tiene reportes no ve
  // lo más vendido. El resto del tablero no espera a nadie.
  const conLotes = incluye("lotes");
  const conVentas = puede("reportes") && incluye("reportes_operacion");

  const resumen = useApi(() => api.getDashboard(suc.sucursalId), [suc.sucursalId]);
  const venc = useApi(
    () =>
      conLotes
        ? api.vencimientos({ almacenId: suc.sucursalId ?? undefined })
        : Promise.resolve(null),
    [conLotes, suc.sucursalId],
  );
  const hoy = isoDia(new Date());
  const vendidos = useApi(
    () =>
      conVentas
        ? api.reporte<MasVendido[]>("top-productos", {
            desde: hoy,
            hasta: hoy,
            sucursalId: suc.sucursalId ?? undefined,
          })
        : Promise.resolve(null),
    [conVentas, suc.sucursalId, hoy],
  );

  const datos = resumen.datos;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:space-y-5 sm:p-5">
      <header>
        <h1 className="text-xl font-bold text-texto">Dashboard</h1>
        <p className="mt-0.5 text-[13px] text-texto-3">
          {suc.nombre ? `${suc.nombre} · ` : "Vista general de la farmacia · "}
          hoy, {fmtFecha(new Date())}
        </p>
      </header>

      {suc.elegir && (
        <Chips valor={suc.valorChip} opciones={suc.opciones} onChange={suc.alElegir} />
      )}

      {resumen.cargando ? (
        <Cargando />
      ) : resumen.error ? (
        <ErrorMsg onReintentar={resumen.recargar}>{resumen.error}</ErrorMsg>
      ) : !datos ? null : (
        <>
          <Numeros
            datos={datos}
            ubicaciones={
              suc.nombre || nombresDe(suc.sucursales.map((s) => s.nombre)) || "Ubicaciones"
            }
            porVencer={
              conLotes && venc.datos
                ? TRAMOS.reduce((n, t) => n + venc.datos![t.campo].lotes, 0)
                : null
            }
          />

          {conLotes && (
            <Semaforo
              cargando={venc.cargando}
              error={venc.error}
              datos={venc.datos}
              onTramo={(tramo) => {
                const filtro: FiltroVencimientos = { tramo };
                navigate("/vencimientos", { state: filtro });
              }}
            />
          )}

          <div className={`grid gap-4 sm:gap-5 ${conVentas ? "lg:grid-cols-2" : ""}`}>
            <StockCritico lista={datos.stockCritico} />
            {conVentas && (
              <MasVendidosHoy
                cargando={vendidos.cargando}
                error={vendidos.error}
                lista={vendidos.datos ?? []}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** "Mostrador y Depósito"; con más de tres, mejor no enumerar. */
function nombresDe(nombres: string[]): string {
  if (nombres.length === 0 || nombres.length > 3) return "";
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

// ── Los cuatro números ──────────────────────────────────────────────────────

function Numeros({
  datos,
  ubicaciones,
  porVencer,
}: {
  datos: Dashboard;
  ubicaciones: string;
  /** null = la farmacia no tiene lotes: en su lugar va el bajo stock. */
  porVencer: number | null;
}) {
  return (
    // De a dos hasta pantalla ancha: en cuatro columnas de un monitor chico o
    // de una tablet, "Bs 48.320,00" no entra y se corta.
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Numero
        etiqueta="Medicamentos"
        valor={fmtNum(datos.articulos)}
        pie="En catálogo"
        icono="box"
        tono="azul"
      />
      <Numero
        etiqueta="Almacenes"
        valor={fmtNum(datos.almacenes)}
        pie={ubicaciones}
        icono="warehouse"
        tono="azul"
      />
      <Numero
        etiqueta="Valor inventario"
        valor={fmtMoney(datos.totalInventario)}
        pie="Total en stock, al costo"
        icono="dollar"
        tono="azul"
        destacado
      />
      {porVencer != null ? (
        <Numero
          etiqueta="Por vencer"
          valor={fmtNum(porVencer)}
          pie={porVencer > 0 ? "Lotes vencidos o a ≤ 90 días" : "Nada vence en 90 días"}
          icono="alert"
          tono={porVencer > 0 ? "amarillo" : "verde"}
          a="/vencimientos"
        />
      ) : (
        <Numero
          etiqueta="Bajo stock"
          valor={fmtNum(datos.bajoStock)}
          pie={datos.bajoStock > 0 ? "Requiere atención" : "Todo en orden"}
          icono="alert"
          tono={datos.bajoStock > 0 ? "amarillo" : "verde"}
        />
      )}
    </div>
  );
}

const TONO_NUMERO = {
  azul: { chip: "bg-info-bg text-info-text", valor: "text-texto", borde: "" },
  amarillo: {
    chip: "bg-warning-bg text-warning-text",
    valor: "text-warning-text",
    borde: "border-warning/40",
  },
  verde: { chip: "bg-primary-50 text-primary-700", valor: "text-texto", borde: "" },
} as const;

function Numero({
  etiqueta,
  valor,
  pie,
  icono,
  tono,
  destacado,
  a,
}: {
  etiqueta: string;
  valor: string;
  pie: string;
  icono: NombreIcono;
  tono: keyof typeof TONO_NUMERO;
  /** La plata va en el color de marca: es el número que más se mira. */
  destacado?: boolean;
  /** Si lleva a algún lado, la tarjeta entera es el enlace. */
  a?: string;
}) {
  const t = TONO_NUMERO[tono];
  const cuerpo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-texto-4 sm:text-[12px]">
          {etiqueta}
        </span>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.chip}`}
        >
          <Icon name={icono} size={16} />
        </span>
      </div>
      {/* Sin `truncate`: una cifra cortada es una cifra falsa. Si no entra,
          baja de renglón; el tamaño está elegido para que en 375 px entre. */}
      <p
        className={`mt-2 break-words text-lg font-extrabold leading-tight tracking-tight sm:text-2xl ${
          destacado ? "text-primary-700" : t.valor
        }`}
      >
        {valor}
      </p>
      <p className="mt-1 text-xs leading-snug text-texto-3">{pie}</p>
    </>
  );
  const clase = `card block min-w-0 p-3.5 sm:p-4 ${t.borde}`;
  return a ? (
    <Link to={a} className={`${clase} transition-shadow hover:shadow-md`}>
      {cuerpo}
    </Link>
  ) : (
    <div className={clase}>{cuerpo}</div>
  );
}

// ── Semáforo de vencimientos ────────────────────────────────────────────────

function Semaforo({
  cargando,
  error,
  datos,
  onTramo,
}: {
  cargando: boolean;
  error: string | null;
  datos: Vencimientos | null;
  onTramo: (tramo: TramoVencimiento) => void;
}) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-[15px] font-bold text-texto">Semáforo de vencimientos</h2>
          <p className="mt-0.5 text-xs font-medium text-primary">
            Tocá un tramo para ver sus lotes
          </p>
        </div>
        {datos && (
          <div className="sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">
              Valor en riesgo
            </p>
            <p className="text-lg font-extrabold text-danger-text sm:text-xl">
              {fmtMoney(datos.valorEnRiesgo)}
            </p>
          </div>
        )}
      </div>

      {cargando ? (
        <p className="py-4 text-center text-[13px] text-texto-3">Revisando los lotes…</p>
      ) : error ? (
        <ErrorMsg>{error}</ErrorMsg>
      ) : !datos ? null : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          {TRAMOS.map((t) => {
            const c = datos[t.campo];
            return (
              <button
                key={t.clave}
                onClick={() => onTramo(t.clave)}
                className={`rounded-xl p-3 text-left transition-shadow hover:shadow-md sm:p-4 ${
                  c.lotes ? t.fondo : "bg-muted"
                }`}
              >
                <p
                  className={`text-2xl font-extrabold sm:text-3xl ${
                    c.lotes ? t.texto : "text-texto-4"
                  }`}
                >
                  {c.lotes}
                </p>
                <p className="text-[13px] font-semibold text-texto-2">{t.titulo}</p>
                {c.lotes > 0 && (
                  <p className="text-xs text-texto-3">{fmtMoney(c.valor)}</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Stock crítico ───────────────────────────────────────────────────────────

function StockCritico({ lista }: { lista: Dashboard["stockCritico"] }) {
  // Lo más urgente arriba: primero lo que ya no hay, después lo que está más
  // lejos de su mínimo. El backend los devuelve en el orden del catálogo.
  const ordenada = useMemo(
    () =>
      [...lista].sort(
        (a, b) =>
          a.stock / Math.max(a.stockMinimo, 1) - b.stock / Math.max(b.stockMinimo, 1),
      ),
    [lista],
  );
  const resto = ordenada.length - CRITICOS_A_LA_VISTA;

  return (
    <section className="card min-w-0 p-4 sm:p-5">
      <div className="mb-2">
        <h2 className="text-[15px] font-bold text-texto">Stock crítico</h2>
        <p className="mt-0.5 text-xs font-medium text-primary">
          Medicamentos con bajo inventario
        </p>
      </div>
      {ordenada.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-texto-3">
          Ningún medicamento por debajo de su mínimo
        </p>
      ) : (
        <>
          <ul className="divide-y divide-borde-soft">
            {ordenada.slice(0, CRITICOS_A_LA_VISTA).map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-texto">{a.nombre}</p>
                  <p className="mt-0.5 truncate text-xs text-texto-3">
                    Mínimo: {fmtNum(a.stockMinimo)}
                    {a.laboratorio ? ` · ${a.laboratorio}` : ""}
                  </p>
                </div>
                <Badge tono={a.stock <= 0 ? "rojo" : "amarillo"} className="shrink-0">
                  {a.stock <= 0 ? "Sin stock" : `${fmtNum(a.stock)} restantes`}
                </Badge>
              </li>
            ))}
          </ul>
          {resto > 0 && (
            <Link
              to="/inventario/productos"
              className="mt-2 flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-700"
            >
              Y {resto} más con bajo stock
              <Icon name="chevronRight" size={15} />
            </Link>
          )}
        </>
      )}
    </section>
  );
}

// ── Más vendidos hoy ────────────────────────────────────────────────────────

function MasVendidosHoy({
  cargando,
  error,
  lista,
}: {
  cargando: boolean;
  error: string | null;
  lista: MasVendido[];
}) {
  // El reporte ordena por plata; acá importa cuántas cajas salieron, que es lo
  // que dice qué reponer primero.
  const top = useMemo(
    () => [...lista].sort((a, b) => b.unidades - a.unidades).slice(0, 5),
    [lista],
  );

  return (
    <section className="card min-w-0 p-4 sm:p-5">
      <div className="mb-2">
        <h2 className="text-[15px] font-bold text-texto">Más vendidos hoy</h2>
        <p className="mt-0.5 text-xs font-medium text-primary">Unidades despachadas</p>
      </div>
      {cargando ? (
        <p className="py-4 text-center text-[13px] text-texto-3">Sumando las ventas…</p>
      ) : error ? (
        <ErrorMsg>{error}</ErrorMsg>
      ) : top.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-texto-3">
          Todavía no se vendió nada hoy
        </p>
      ) : (
        <ol className="divide-y divide-borde-soft">
          {top.map((p) => (
            <li key={p.nombre} className="flex items-center gap-3 py-3">
              <p className="min-w-0 flex-1 truncate text-sm font-bold text-texto">{p.nombre}</p>
              <p className="shrink-0 text-sm font-bold text-primary-700">
                {fmtNum(p.unidades)} u.
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
