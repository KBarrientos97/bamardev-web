import { usePalabras } from "../lib/academia/usePalabras";
import { fmtMoney } from "../lib/format";
import {
  ETIQUETA_GENERAL,
  FILTRO_GENERAL,
  SIN_ELEGIR,
  type useFiltroSucursalGasto,
  type useSucursalDelGasto,
} from "../lib/useSucursalGasto";
import type { ResumenGastos } from "../types";
import { Campo, Select } from "./ui";

/**
 * Las piezas de pantalla de la sucursal en los gastos (PLAN-SUCURSAL-TOTAL
 * §3 etapa 4). La lógica vive en `lib/useSucursalGasto.ts`; acá sólo se dibuja,
 * igual en Gastos, Gastos automáticos y la farmacia.
 */

/**
 * El `<Select>` del filtro de una lista: «Todas», cada local y «General del
 * negocio». Quien lo monta decide si se muestra (`suc.elegir`): con un local o
 * con un usuario atado no existe.
 */
export function SelectFiltroSucursal({
  filtro,
  className,
  ...props
}: {
  filtro: ReturnType<typeof useFiltroSucursalGasto>;
  className?: string;
  "aria-label"?: string;
}) {
  const { suc } = filtro;
  return (
    <Select
      value={filtro.valor}
      onChange={(e) => filtro.alElegir(e.target.value)}
      className={className}
      {...props}
    >
      <option value="">{suc.todas}</option>
      {suc.sucursales.map((s) => (
        <option key={s.id} value={s.id}>
          {s.nombre}
        </option>
      ))}
      <option value={FILTRO_GENERAL}>{ETIQUETA_GENERAL}</option>
    </Select>
  );
}

/**
 * El campo «Sucursal» de un formulario de gasto o de gasto automático. No se
 * dibuja si no hay nada que elegir (un local, o usuario atado: el backend le
 * pone el suyo).
 */
export function CampoSucursalGasto({
  control,
  ayuda,
}: {
  control: ReturnType<typeof useSucursalDelGasto>;
  /** Una línea de explicación bajo el campo; por defecto, qué es «General». */
  ayuda?: string;
}) {
  const pal = usePalabras();
  if (!control.elegir) return null;
  return (
    <Campo
      label={pal.Sede}
      error={control.errorCampo}
      hint={
        ayuda ??
        `«${ETIQUETA_GENERAL}» es para lo que no es de ningún local, como el alquiler de la oficina.`
      }
    >
      <Select value={control.valor} onChange={(e) => control.setValor(e.target.value)}>
        {control.falta && (
          <option value={SIN_ELEGIR} disabled>
            Elegí una {pal.sede}…
          </option>
        )}
        {control.opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
        <option value="">{ETIQUETA_GENERAL}</option>
      </Select>
    </Campo>
  );
}

/**
 * Con UN local elegido, las cifras del resumen no incluyen los gastos
 * generales del negocio, y quien lee «Total del período» podría creer que sí.
 * La nota lo dice con el monto (`generales` del resumen, §9.1). No se dibuja
 * con todas las sucursales, con «General», sin generales o con un backend que
 * no manda el dato.
 */
export function NotaGastosGenerales({
  generales,
  unLocalElegido,
}: {
  generales: ResumenGastos["generales"];
  unLocalElegido: boolean;
}) {
  if (!unLocalElegido || !generales || !(generales.total > 0)) return null;
  return (
    <p role="note" className="-mt-1 text-xs text-texto-3">
      No incluye gastos generales del negocio ({fmtMoney(generales.total)})
    </p>
  );
}
