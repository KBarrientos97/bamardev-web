import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { fmtMoney } from "../../lib/format";
import { fmtHace } from "./calculo";
import { BotonB, Fila } from "./ui";
import type { VistaCuenta } from "./vista";

/**
 * Una cuenta abierta en el tablero (pestaña Cuentas): el nombre, desde cuándo,
 * el total y lo que falta cobrar. Tocarla abre su panel, como una mesa; el
 * botón de abajo hace lo más común, cargarle consumo.
 */
export default function TarjetaCuenta({
  v,
  ahora,
  seleccionada,
  onSeleccionar,
}: {
  v: VistaCuenta;
  ahora: number;
  seleccionada: boolean;
  onSeleccionar: () => void;
}) {
  const navigate = useNavigate();
  const { cuenta, calc } = v;
  const productos = cuenta.sesion.consumos.filter((c) => !c.anulado).reduce((t, c) => t + c.cant, 0);

  return (
    <article
      className={[
        "group relative flex min-h-[190px] cursor-pointer flex-col rounded-2xl border-2 border-primary/60 bg-primary-50/70 p-3 text-left transition-shadow sm:p-4",
        seleccionada ? "shadow-lg ring-2 ring-primary/40 ring-offset-2 ring-offset-fondo" : "hover:shadow-md",
      ].join(" ")}
      onClick={onSeleccionar}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-primary-700">
          <Icon name="users" size={16} />
        </span>
        <div className="min-w-0">
          {/* Un botón de verdad para el teclado: la tarjeta entera es para el mouse. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSeleccionar();
            }}
            className="block max-w-full truncate text-left text-[15px] font-extrabold uppercase tracking-wide text-texto focus-visible:underline focus-visible:outline-none"
            aria-pressed={seleccionada}
          >
            {cuenta.nombre}
          </button>
          <p className="text-[12px] text-texto-3">Abierta hace {fmtHace(ahora - cuenta.sesion.start)}</p>
        </div>
      </div>

      <div className="my-3 border-t border-black/5" />
      <div className="space-y-0.5 text-[13px]">
        <Fila etiqueta="Consumos" valor={productos ? `${productos} ${productos === 1 ? "producto" : "productos"}` : "Nada todavía"} />
        {calc.pagado > 0 && <Fila etiqueta="Ya pagó" valor={fmtMoney(calc.pagado)} />}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-lg font-extrabold tabular-nums text-primary-700">{fmtMoney(calc.total)}</span>
        {calc.pagado > 0 &&
          (calc.saldo > 0 ? (
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
              FALTA <span className="tabular-nums">{fmtMoney(calc.saldo)}</span>
            </span>
          ) : (
            <span className="rounded-md bg-primary-100 px-2 py-0.5 text-[11px] font-bold uppercase text-primary-700">
              Pagado
            </span>
          ))}
      </div>

      <div className="mt-auto pt-4">
        <BotonB
          icono="plus"
          className="w-full"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/billar/cuenta/${cuenta.id}/consumo`);
          }}
        >
          Consumo
        </BotonB>
      </div>
    </article>
  );
}
