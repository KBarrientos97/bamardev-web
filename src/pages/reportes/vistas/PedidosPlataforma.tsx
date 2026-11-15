import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Icon } from "../../../components/Icon";
import { AvisoOk, Boton, useAviso } from "../../../components/ui";
import { api } from "../../../lib/api";
import { fmtCantidad, fmtFechaHora, fmtMoney } from "../../../lib/format";
import { plataformasQueVe, puedeAnularPedidos } from "../../../lib/pedidosPlataforma/acceso";
import {
  NOMBRE_PLATAFORMA,
  PERIODO_MAS_VIEJO,
  type PedidoPlataforma,
  type Plataforma,
} from "../../../lib/pedidosPlataforma/tipos";
import { tienePermiso } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { useReporte } from "../contexto";
import { plural } from "../formato";
import type { ReactNode } from "react";
import { Cargador, Chip, FilaLista, KpiR, Lista, Nota, Segmentos } from "../ui";
import DialogoAnularPedido from "./DialogoAnularPedido";
import {
  diaCorto,
  resumenDeLineas,
  textoAnulado,
  textoAnulados,
  textoDelPeriodo,
} from "./PedidosPlataforma.datos";
import ResumenPedidosImpreso from "./ResumenPedidosImpreso";

/**
 * Yango / PedidosYa: los pedidos que se tomaron en el punto de venta y que la
 * app de delivery paga después, por período de liquidación
 * (PLAN-PEDIDOS-PLATAFORMA §5 y §6).
 *
 * No son ventas: no están en Ventas ni en el cierre de caja. Esto es para
 * cuadrar lo que paga cada app: PedidosYa los jueves (de jueves a miércoles) y
 * Yango los lunes y viernes (viernes a domingo, lunes a jueves). Los períodos
 * los arma el backend; acá se navega con ← y → (0 = el que corre, -1 = el
 * anterior…) y NO se calculan fechas. Por eso Reportes no dibuja arriba su
 * barra de período para esta ficha (`periodoPropio`).
 *
 * La sucursal sale del selector de arriba (la organización con 2+ locales); un
 * usuario de una sede ve sólo la suya, como lo decide el backend.
 */
export default function PedidosPlataforma() {
  const { negocio, usuario } = useAuth();
  const { rango } = useReporte();
  const disponibles = plataformasQueVe(negocio?.features, usuario);
  const [elegida, setElegida] = useState<Plataforma | null>(null);
  // Si la elegida ya no está entre las que ve (le apagaron la feature), se pasa a la primera.
  const plataforma = elegida && disponibles.includes(elegida) ? elegida : (disponibles[0] ?? null);
  const [periodo, setPeriodo] = useState(0);
  const [anulando, setAnulando] = useState<PedidoPlataforma | null>(null);
  const [aviso, setAviso] = useAviso();
  const [impresoEn, setImpresoEn] = useState<Date | null>(null);
  const almacenId = rango.sucursalId ?? null;

  const datos = useApi(
    () =>
      plataforma
        ? api.reportePedidosPlataforma({ plataforma, periodo, almacenId })
        : new Promise<never>(() => {}),
    [plataforma, periodo, almacenId],
  );

  // La hora que lleva el papel es la de mandar a imprimir, no la de abrir la
  // pantalla (igual que el libro de controlados). `flushSync` la deja en el
  // DOM antes de que el navegador arme la vista previa.
  const imprimir = () => {
    flushSync(() => setImpresoEn(new Date()));
    window.print();
  };
  useEffect(() => {
    const sellar = () => flushSync(() => setImpresoEn(new Date()));
    window.addEventListener("beforeprint", sellar);
    return () => window.removeEventListener("beforeprint", sellar);
  }, []);

  if (!plataforma) {
    return (
      <div className="card p-6 text-center text-[14px] text-texto-3">
        Tu negocio no tiene pedidos de Yango ni de PedidosYa activados.
      </div>
    );
  }
  const nombre = NOMBRE_PLATAFORMA[plataforma];
  const pideUsuario = !tienePermiso(usuario, "autorizar.pin");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {disponibles.length > 1 ? (
          <Segmentos
            valor={plataforma}
            opciones={disponibles.map((p) => [p, NOMBRE_PLATAFORMA[p]] as const)}
            onChange={(p) => {
              setElegida(p);
              // Cada plataforma tiene sus propios cortes: no se arrastra el índice.
              setPeriodo(0);
            }}
          />
        ) : (
          <span className="text-[15px] font-bold text-texto">{nombre}</span>
        )}
      </div>

      <section className="card flex flex-wrap items-center gap-3 px-3.5 py-3" aria-label="Período de liquidación">
        <button
          type="button"
          onClick={() => setPeriodo((p) => Math.max(PERIODO_MAS_VIEJO, p - 1))}
          disabled={periodo <= PERIODO_MAS_VIEJO}
          aria-label="Período anterior"
          title="Período anterior"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-borde bg-white text-texto-2 transition-colors hover:bg-muted disabled:opacity-40"
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-[16px] font-extrabold text-texto">
            {datos.datos?.periodo.etiqueta ?? "Cargando período…"}
          </p>
          <p className="truncate text-[12.5px] text-texto-3">
            {datos.datos ? textoDelPeriodo(datos.datos.periodo) : " "}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPeriodo((p) => Math.min(0, p + 1))}
          disabled={periodo >= 0}
          aria-label="Período siguiente"
          title="Período siguiente"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-borde bg-white text-texto-2 transition-colors hover:bg-muted disabled:opacity-40"
        >
          <Icon name="arrowRight" size={18} />
        </button>
        <Boton variante="ghost" icono="printer" onClick={imprimir} disabled={!datos.datos}>
          Imprimir resumen
        </Boton>
      </section>

      <AvisoOk>{aviso}</AvisoOk>

      <Cargador estado={datos}>
        {(r) => (
          <>
            <div className="grid grid-cols-2 gap-3">
              <KpiR etiqueta="Pedidos" valor={fmtCantidad(r.cantidad)} icono="bolsa" />
              <KpiR
                etiqueta={`Total de ${nombre}`}
                valor={fmtMoney(r.total)}
                tono="marca"
                icono="dollar"
                pie={textoAnulados(r.anulados) ?? undefined}
              />
            </div>

            {r.cantidad === 0 && r.anulados.cantidad === 0 && (
              <Nota>No hay pedidos de {nombre} en este período.</Nota>
            )}

            <Bloque titulo="Por día">
              <Lista>
                {r.porDia.map((d) => (
                  <FilaLista
                    key={d.fecha}
                    titulo={diaCorto(d.fecha)}
                    linea={plural(d.cantidad, "pedido", "pedidos")}
                    valor={fmtMoney(d.total)}
                    tonoValor={d.cantidad === 0 ? "apagado" : "normal"}
                  />
                ))}
              </Lista>
            </Bloque>

            {r.porProducto.length > 0 && (
              <Bloque titulo="Por producto">
                <Lista>
                  {r.porProducto.map((p) => (
                    <FilaLista
                      key={p.productoId ?? p.nombre}
                      titulo={p.nombre}
                      linea={`${fmtCantidad(p.cantidad)} ${p.cantidad === 1 ? "unidad" : "unidades"}`}
                      valor={fmtMoney(p.total)}
                    />
                  ))}
                </Lista>
              </Bloque>
            )}

            {r.porSucursal.length > 1 && (
              <Bloque titulo="Por sucursal">
                <Lista>
                  {r.porSucursal.map((s) => (
                    <FilaLista
                      key={s.almacenId}
                      titulo={s.nombre}
                      linea={plural(s.cantidad, "pedido", "pedidos")}
                      valor={fmtMoney(s.total)}
                    />
                  ))}
                </Lista>
              </Bloque>
            )}

            {r.pedidos.length > 0 && (
              <Bloque titulo="Pedidos" subtitulo="Con el N° de la app, para cruzarlos con su liquidación">
                <Lista>
                  {r.pedidos.map((p) => (
                    <FilaPedido
                      key={p.id}
                      p={p}
                      conSucursal={r.porSucursal.length > 1}
                      onAnular={puedeAnularPedidos(usuario) && !p.anuladoEn ? () => setAnulando(p) : undefined}
                    />
                  ))}
                </Lista>
              </Bloque>
            )}

            <ResumenPedidosImpreso
              reporte={r}
              negocio={negocio?.nombre ?? ""}
              sucursal={almacenId != null ? (r.porSucursal.find((s) => s.almacenId === almacenId)?.nombre ?? "") : ""}
              impresoPor={usuario?.nombre ?? usuario?.username ?? ""}
              impresoEn={impresoEn ?? new Date()}
            />
          </>
        )}
      </Cargador>

      {anulando && (
        <DialogoAnularPedido
          pedido={anulando}
          pideUsuario={pideUsuario}
          onClose={() => setAnulando(null)}
          onAnulado={() => {
            const n = anulando.codigoExterno ? ` ${anulando.codigoExterno}` : "";
            setAnulando(null);
            setAviso(`Pedido${n} anulado. El stock volvió a la sucursal.`);
            datos.recargar();
          }}
        />
      )}
    </div>
  );
}

/** Una fila de la lista: el N° de la app, quién y cuándo, lo que llevaba y el total. */
function FilaPedido({
  p,
  conSucursal,
  onAnular,
}: {
  p: PedidoPlataforma;
  conSucursal: boolean;
  onAnular?: () => void;
}) {
  const anulado = !!p.anuladoEn;
  return (
    <div>
      <FilaLista
        icono="bolsa"
        tono={anulado ? "rosa" : "verde"}
        titulo={p.codigoExterno ? `N° ${p.codigoExterno}` : `Pedido #${p.id}`}
        tachado={anulado}
        chip={
          <>
            {anulado && <Chip tono="rojo">Anulado</Chip>}
            {/* Discreto: salió sin respaldo en el inventario (ya no había stock cargado). */}
            {p.sinStock && !anulado && (
              <span className="text-[11.5px] font-semibold text-amber-700" title="Alguna línea dejó el stock en negativo">
                sin stock
              </span>
            )}
          </>
        }
        linea={[
          fmtFechaHora(p.fecha),
          conSucursal ? p.almacen.nombre : null,
          p.usuario?.nombre ?? null,
        ]
          .filter(Boolean)
          .join(" · ")}
        linea2={anulado ? textoAnulado(p) : resumenDeLineas(p)}
        valor={fmtMoney(p.total)}
        ajustar
      />
      {onAnular && (
        <div className="-mt-1.5 flex justify-end px-4 pb-3 sm:px-5">
          <button
            type="button"
            onClick={onAnular}
            aria-label={`Anular el pedido ${p.codigoExterno ?? `#${p.id}`}`}
            className="rounded-lg border border-borde px-2.5 py-1 text-xs font-semibold text-danger-text hover:bg-danger-bg"
          >
            Anular
          </button>
        </div>
      )}
    </div>
  );
}

/** Un bloque del reporte: su título arriba y la lista abajo. */
function Bloque({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="px-1 text-[13px] font-bold uppercase tracking-wide text-texto-4">{titulo}</h3>
      {subtitulo && <p className="mb-2 px-1 text-[12px] text-texto-3">{subtitulo}</p>}
      {!subtitulo && <div className="mb-2" />}
      {children}
    </section>
  );
}
