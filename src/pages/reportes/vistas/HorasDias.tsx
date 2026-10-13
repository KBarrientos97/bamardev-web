import { useMemo } from "react";
import { esBillar } from "../../../lib/rubro";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { apiReportes, type HorasApi } from "../api";
import { hoja, useExportar, useReporte } from "../contexto";
import { bsEntero } from "../formato";
import { BarrasVerticales } from "../graficos";
import { Cargador, KpiR, Nota, Tarjeta } from "../ui";
import {
  DIAS_CORTOS,
  etiquetaHora,
  hayVentas,
  horaLarga,
  horaPico,
  mejorDia,
  tramoJornada,
  vecesDelDia,
  vecesPorDia,
} from "./HorasDias.datos";

/**
 * Horas y días: cuándo se vende.
 *
 * Todo va en la hora del negocio y por lo COBRADO (después de promos). Los
 * montos por día de la semana suman todos los lunes, todos los martes… del
 * período: no son un promedio, y cada barra dice cuántas veces cayó ese día,
 * porque en un mes un día puede repetirse una vez más que otro y ganar sólo
 * por eso.
 */
export default function HorasDias() {
  const { rango, periodo } = useReporte();
  const { rubro } = useAuth();
  const estado = useApi(() => apiReportes.horas(rango), [rango.desde, rango.hasta, rango.sucursalId]);
  const veces = useMemo(() => vecesPorDia(periodo.desde, periodo.hasta), [periodo.desde, periodo.hasta]);
  // Con un solo día no hay "mejor día de la semana" que buscar: sería decir
  // que el día elegido fue el mejor de sí mismo.
  const unDia = periodo.desde === periodo.hasta;
  const d = estado.datos;

  useExportar(
    "horas-y-dias",
    d && hayVentas(d)
      ? () => [
          hoja<number>(
            "Por hora",
            [
              ["Hora", (h) => horaLarga(h)],
              ["Ventas (Bs)", (h) => d.porHora[h] ?? 0],
            ],
            Array.from({ length: 24 }, (_, h) => h),
          ),
          ...(unDia
            ? []
            : [
                hoja<number>(
                  "Por día de la semana",
                  [
                    ["Día", (i) => DIAS_CORTOS[i]],
                    ["Ventas (Bs)", (i) => d.porDia[i]?.monto ?? 0],
                    ["Veces en el período", (i) => veces[i]],
                  ],
                  Array.from({ length: 7 }, (_, i) => i),
                ),
              ]),
        ]
      : null,
  );

  return (
    <Cargador
      estado={estado}
      vacio={(x) => (hayVentas(x) ? null : { titulo: "Sin ventas en este período", texto: "Probá con otro período.", icono: "calendar" })}
    >
      {(x) => <Contenido d={x} veces={veces} unDia={unDia} billar={esBillar(rubro)} />}
    </Cargador>
  );
}

function Contenido({ d, veces, unDia, billar }: { d: HorasApi; veces: number[]; unDia: boolean; billar: boolean }) {
  const pico = horaPico(d.porHora);
  const mejor = mejorDia(d.porDia);
  const tramo = tramoJornada(d.porHora);
  const totalDia = d.porHora.reduce((a, m) => a + m, 0);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <KpiR
          etiqueta="Hora pico"
          icono="trendingUp"
          valor={pico ? horaLarga(pico.hora) : "—"}
          pie={pico ? (unDia ? bsEntero(pico.monto) : `${bsEntero(pico.monto)} sumando todos los días`) : undefined}
        />
        {unDia ? (
          <KpiR etiqueta="Vendido en el día" icono="calendar" valor={bsEntero(totalDia)} pie="cobrado, después de promos" />
        ) : (
          <KpiR
            etiqueta="Mejor día"
            icono="calendar"
            valor={mejor ? DIAS_CORTOS[mejor.indice] : "—"}
            pie={
              mejor
                ? veces[mejor.indice] > 1
                  ? `${bsEntero(mejor.monto)} en ${vecesDelDia(mejor.indice, veces[mejor.indice])}`
                  : bsEntero(mejor.monto)
                : undefined
            }
          />
        )}
      </div>
      <div className={`grid items-start gap-4 ${unDia ? "" : "xl:grid-cols-2"}`}>
        <Tarjeta
          titulo="Ventas por hora del día"
          subtitulo={unDia ? "Mirá cuándo conviene tener más personal" : "Mirá cuándo conviene tener más personal · suma de todos los días del período"}
        >
          <div className="pt-6">
            <BarrasVerticales
              barras={tramo.map((h) => ({ etiqueta: etiquetaHora(h), valor: d.porHora[h] ?? 0, detalle: horaLarga(h) }))}
              formato={bsEntero}
            />
          </div>
        </Tarjeta>
        {!unDia && (
          <Tarjeta titulo="Ventas por día de la semana" subtitulo="La suma de todos los lunes, martes… del período: no es un promedio">
            <div className="pt-6">
              <BarrasVerticales
                barras={DIAS_CORTOS.map((dia, i) => ({
                  etiqueta: d.porDia[i]?.etiqueta || dia,
                  valor: d.porDia[i]?.monto ?? 0,
                  detalle: vecesDelDia(i, veces[i]),
                }))}
                formato={bsEntero}
              />
            </div>
          </Tarjeta>
        )}
      </div>
      <Nota>
        Cada venta cuenta en la hora en que se cobró, con el reloj del negocio, y por lo cobrado (después de promos).
        {billar && " Una mesa que jugó de 9 a 11 p. m. cuenta a las 11, cuando se cerró."}
      </Nota>
    </>
  );
}
