import { useMemo, useRef, useState } from "react";
import { Boton, Select } from "../../../components/ui";
import { isoDia } from "../../../lib/format";
import { bajarPdf } from "../../../lib/pdf/tablaPdf";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { apiReportes, type VendedorApi } from "../api";
import { useExportar, useReporte } from "../contexto";
import { leyendaDe, textoRango } from "../periodo";
import { Cargador, Nota } from "../ui";
import { KpisGanancia, TablaGanancia } from "./TablaGanancia";
import {
  armarVentasGanancia,
  avisaSinCosto,
  documentoVentasGanancia,
  hojaVentasGanancia,
  textoSinCosto,
  type VentasGanancia as Datos,
} from "./VentasGanancia.datos";

/**
 * Ventas y ganancia: el cuaderno del dueño (ver `VentasGanancia.datos.ts`),
 * igual que en la app. Una sola tabla con las categorías y sus subtotales:
 * una tarjeta por categoría haría que las columnas dejen de caer una debajo de
 * la otra.
 *
 * Arriba, el cajero (6-nov, Kevin: "así como filtramos por fecha, a su lado
 * otro campo con los cajeros"): quien COBRÓ la venta, el mismo "Cajero" del
 * historial de Ventas.
 */
export default function VentasGanancia() {
  const { rango, periodo, sucursalNombre } = useReporte();
  const { rubro, negocio } = useAuth();
  const [cajero, setCajero] = useState<VendedorApi | null>(null);
  const estado = useApi(
    () => apiReportes.topProductos(rango, cajero?.id),
    [rango.desde, rango.hasta, rango.sucursalId, cajero?.id],
  );
  const vendedores = useApi(() => apiReportes.vendedores(rango), [rango.desde, rango.hasta]);
  const datos = useMemo(() => (estado.datos ? armarVentasGanancia(estado.datos) : null), [estado.datos]);

  const subtitulo = [leyendaDe(periodo), textoRango(periodo.desde, periodo.hasta), sucursalNombre]
    .filter(Boolean)
    .join(" · ");

  useExportar(
    "ventas-y-ganancia",
    datos && datos.productos > 0 ? () => [hojaVentasGanancia(datos, cajero?.nombre)] : null,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FiltroCajero cajero={cajero} vendedores={vendedores.datos ?? []} onCajero={setCajero} />
        {datos && datos.productos > 0 && (
          <BotonPdf
            armar={() =>
              documentoVentasGanancia(datos, { negocio: negocio?.nombre, subtitulo, cajero: cajero?.nombre })
            }
          />
        )}
      </div>
      <Cargador
        estado={estado}
        vacio={(d) =>
          d.length === 0
            ? {
                titulo: cajero ? `${cajero.nombre} no vendió en este período` : "Sin ventas en este período",
                texto: cajero ? "Probá con otro período o con «Todos los cajeros»." : "Probá con otro período.",
                icono: "chart",
              }
            : null
        }
      >
        {() => (datos ? <Cuaderno datos={datos} avisa={avisaSinCosto(rubro)} /> : null)}
      </Cargador>
    </div>
  );
}

/**
 * El desplegable de cajeros. Con uno solo no hay nada que filtrar y no se
 * dibuja; si ya hay uno elegido se deja, y se suma a la lista aunque en este
 * período no haya vendido (si no, el desplegable diría "Todos" con el filtro
 * puesto). Igual que el de Ventas.
 */
function FiltroCajero({
  cajero,
  vendedores,
  onCajero,
}: {
  cajero: VendedorApi | null;
  vendedores: VendedorApi[];
  onCajero: (c: VendedorApi | null) => void;
}) {
  if (vendedores.length <= 1 && !cajero) return null;
  const opciones = cajero && !vendedores.some((v) => v.id === cajero.id) ? [...vendedores, cajero] : vendedores;
  return (
    <div className="w-full sm:w-64">
      <Select
        aria-label="Cajero"
        value={cajero ? String(cajero.id) : ""}
        onChange={(e) => {
          const id = Number(e.target.value);
          onCajero(e.target.value ? (opciones.find((v) => v.id === id) ?? null) : null);
        }}
      >
        <option value="">Todos los cajeros</option>
        {opciones.map((v) => (
          <option key={v.id} value={v.id}>
            {v.nombre}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** "Exportar PDF": el mismo papel que manda la app. Un toque a la vez: armarlo tarda un instante. */
function BotonPdf({ armar }: { armar: () => Parameters<typeof bajarPdf>[1] }) {
  const [armando, setArmando] = useState(false);
  const [error, setError] = useState(false);
  const enCurso = useRef(false);
  async function exportar() {
    if (enCurso.current) return;
    enCurso.current = true;
    setArmando(true);
    setError(false);
    try {
      await bajarPdf(`ventas-y-ganancia-${isoDia(new Date())}.pdf`, armar());
    } catch {
      setError(true);
    } finally {
      enCurso.current = false;
      setArmando(false);
    }
  }
  return (
    <>
      <Boton variante="soft" icono="download" onClick={exportar} disabled={armando}>
        {armando ? "Armando el PDF…" : "Exportar PDF"}
      </Boton>
      {error && <p className="basis-full text-[12px] font-bold text-rose-700">No se pudo armar el PDF. Probá de nuevo.</p>}
    </>
  );
}

function Cuaderno({ datos, avisa }: { datos: Datos; avisa: boolean }) {
  return (
    <>
      <KpisGanancia datos={datos} />

      {avisa && datos.ventasSinCosto > 0 && <Nota tono="ambar">{textoSinCosto(datos)}</Nota>}

      <TablaGanancia datos={datos} />

      <Nota>
        <p>
          Los montos son antes de promos y cupones: es lo vendido a precio de lista, así que puede dar más que lo
          cobrado. La ganancia es antes de gastos: el alquiler y los sueldos se restan en Finanzas.
        </p>
      </Nota>
    </>
  );
}
