import { Icon } from "../../components/Icon";
import { esPositivo } from "../../lib/dinero";
import { fmtMoney } from "../../lib/format";

/**
 * Debajo de la cuenta de un local: lo que NO incluye (ver `useGastosGenerales`).
 * Los gastos generales del negocio son los que no se cargaron a ningún local
 * (PLAN-SUCURSAL-TOTAL §9.1).
 * Sin monto, no se dibuja.
 */
export function NotaGenerales({ monto }: { monto: number }) {
  if (!esPositivo(monto)) return null;
  return (
    <p className="flex items-start gap-1.5 px-1 text-[12px] leading-snug text-texto-3">
      <span className="mt-px shrink-0">
        <Icon name="info" size={14} />
      </span>
      <span>No incluye gastos generales del negocio ({fmtMoney(monto)}).</span>
    </p>
  );
}
