import { useMemo, useState } from "react";
import { fmtFechaHora, fmtNum } from "../../../../lib/format";
import { hoja, useExportar } from "../../contexto";
import { plural } from "../../formato";
import { Cargador, Chip, FilaLista, KpiR, Lista, Nota, Segmentos, Tarjeta } from "../../ui";
import {
  NOMBRE_TIPO,
  TOPE_AJUSTES,
  cuando,
  lugarDe,
  porPersona,
  resumenAjustes,
  tipoDe,
  type Ajuste,
  type TipoAjuste,
} from "./PausasAjustes.datos";
import { NotaSucursal } from "./NotaSucursal";
import { useReporteBillar } from "./useReporteBillar";

/**
 * Pausas y ajustes: quién pausó, anuló, corrigió la hora o movió una cuenta,
 * y por qué. Lee la misma respuesta que los otros reportes del billar.
 */
export default function PausasAjustes() {
  const estado = useReporteBillar();
  const lista = estado.datos?.auditoria;

  useExportar(
    "pausas-y-ajustes",
    lista?.length
      ? () => [
          hoja<Ajuste>(
            "Pausas y ajustes",
            [
              ["Fecha y hora", (a) => fmtFechaHora(new Date(a.hora))],
              ["Mesa", (a) => lugarDe(a)],
              ["Acción", (a) => a.accion],
              ["Quién", (a) => a.quien],
              ["Autorizó", (a) => a.autorizo ?? ""],
              ["Motivo", (a) => a.motivo ?? ""],
            ],
            lista,
          ),
        ]
      : null,
  );

  return (
    <Cargador
      estado={estado}
      vacio={(d) =>
        d.auditoria.length === 0
          ? { titulo: "Sin pausas ni anulaciones en este período", texto: "Ninguna mesa se tocó después de abrirla.", icono: "pausa" }
          : null
      }
    >
      {(d) => <Contenido lista={d.auditoria} />}
    </Cargador>
  );
}

type Filtro = "todo" | TipoAjuste;

function Contenido({ lista }: { lista: Ajuste[] }) {
  const resumen = useMemo(() => resumenAjustes(lista), [lista]);
  const personas = useMemo(() => porPersona(lista), [lista]);
  const [filtro, setFiltro] = useState<Filtro>("todo");

  // Sólo los grupos que tuvieron algo: un chip que filtra a una lista vacía es un clic de más.
  const opciones = useMemo(() => {
    const t = resumen.porTipo;
    if (!t) return null;
    const conAlgo = (Object.keys(NOMBRE_TIPO) as TipoAjuste[]).filter((k) => t[k] > 0);
    if (conAlgo.length < 2) return null;
    return [["todo", "Todo"] as const, ...conAlgo.map((k) => [k, `${NOMBRE_TIPO[k]} (${t[k]})`] as const)];
  }, [resumen]);
  const visibles = filtro === "todo" ? lista : lista.filter((a) => tipoDe(a) === filtro);
  const maxPersona = personas[0]?.ajustes ?? 0;

  return (
    <div className="space-y-4">
      <NotaSucursal />

      {resumen.porTipo ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiR
            etiqueta="Mesas anuladas"
            icono="x"
            valor={fmtNum(resumen.mesasAnuladas ?? 0)}
            tono={resumen.mesasAnuladas ? "alerta" : "normal"}
            pie={resumen.consumosAnulados ? plural(resumen.consumosAnulados, "consumo anulado", "consumos anulados") : "Ningún consumo anulado"}
          />
          <KpiR
            etiqueta="Hora corregida"
            icono="clock"
            valor={fmtNum(resumen.porTipo.horas)}
            tono={resumen.porTipo.horas ? "alerta" : "normal"}
            pie="Inicios de mesa movidos a mano"
          />
          <KpiR etiqueta="Pausas" icono="pausa" valor={fmtNum(resumen.porTipo.pausas)} pie="El reloj paró y siguió" />
          <KpiR
            etiqueta="Cambios de mesa"
            icono="swap"
            valor={fmtNum(resumen.porTipo.cambios)}
            pie={resumen.porTipo.extensiones ? plural(resumen.porTipo.extensiones, "extensión", "extensiones") + " de tiempo" : "Cuentas pasadas a otra mesa"}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiR etiqueta="Ajustes" icono="lista" valor={fmtNum(resumen.total)} pie="Pausas, anulaciones y cambios" />
        </div>
      )}

      {/* Una columna: al lado de "Quién los hizo", los grupos del filtro no entraban y la tabla quedaba apretada. */}
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="px-1 text-[13px] font-bold text-texto">Quién los hizo</h3>
          <Lista>
            {personas.map((p) => (
              <FilaLista
                key={p.quien}
                icono="user"
                tono="gris"
                titulo={p.quien}
                linea={p.anulaciones ? plural(p.anulaciones, "anulación", "anulaciones") : undefined}
                valor={fmtNum(p.ajustes)}
                valorPie={p.ajustes === 1 ? "ajuste" : "ajustes"}
                barra={maxPersona > 0 ? { fraccion: p.ajustes / maxPersona, tono: p.anulaciones ? "rosa" : "marca" } : undefined}
              />
            ))}
          </Lista>
        </div>

        <Tarjeta titulo="El detalle" subtitulo="Del más nuevo al más viejo" cuerpo="">
          {/* En el cuerpo y no en el encabezado: con cinco grupos no entraba al lado del título y se cortaba. */}
          {opciones && (
            <div className="border-b border-borde-soft px-4 py-3 sm:px-5">
              <Segmentos valor={filtro} opciones={opciones} onChange={setFiltro} />
            </div>
          )}
          <Detalle lista={visibles} />
        </Tarjeta>
      </div>

      {lista.length >= TOPE_AJUSTES && (
        <Nota tono="ambar">
          Se ven los últimos {fmtNum(TOPE_AJUSTES)} ajustes del período. Para ver los anteriores, elegí un período más
          corto.
        </Nota>
      )}
      <Nota>
        Una pausa o una corrección de hora no es un error: pasa cuando un cliente sale a comer o se abrió la mesa
        tarde. Lo que conviene mirar es quién las hace seguido y con qué motivo.
      </Nota>
    </div>
  );
}

function Detalle({ lista }: { lista: Ajuste[] }) {
  const th = "px-3 py-3 text-[11px] font-bold uppercase leading-tight tracking-wider text-texto-3";
  return (
    <>
      {/* Tabla desde tablet; en el celular, una tarjeta por ajuste. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Cuándo</th>
              <th className={th}>Mesa</th>
              <th className={th}>Qué pasó</th>
              <th className={th}>Quién</th>
              <th className={th}>Motivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde-soft">
            {lista.map((a) => (
              <tr key={a.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-3 tabular-nums text-texto-2">{cuando(a.hora)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-bold text-texto">{lugarDe(a) || "—"}</td>
                <td className="px-3 py-3 text-texto">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {a.accion}
                    {tipoDe(a) === "anulaciones" && <Chip tono="rojo">Anulación</Chip>}
                  </span>
                </td>
                <td className="px-3 py-3 text-texto-2">
                  {a.quien}
                  {a.autorizo && <span className="block text-[11px] text-texto-4">Autorizó: {a.autorizo}</span>}
                </td>
                <td className="px-3 py-3 text-texto-3">{a.motivo ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-borde-soft md:hidden">
        {lista.map((a) => (
          <li key={a.id} className="px-4 py-3 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-1.5 font-bold text-texto">
                {lugarDe(a) || "—"}
                {tipoDe(a) === "anulaciones" && <Chip tono="rojo">Anulación</Chip>}
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-texto-3">{cuando(a.hora)}</span>
            </div>
            <p className="mt-0.5 text-texto">{a.accion}</p>
            <p className="mt-0.5 text-[12px] text-texto-3">
              {a.quien}
              {a.autorizo ? ` · autorizó ${a.autorizo}` : ""}
              {a.motivo ? ` · ${a.motivo}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
