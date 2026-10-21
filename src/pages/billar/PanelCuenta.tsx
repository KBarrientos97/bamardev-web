import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { fmtMoney } from "../../lib/format";
import { fmtHace, horaDe } from "./calculo";
import { useDialogos } from "./dialogos";
import { ListaConsumos, ListaPagos } from "./PanelMesa";
import { BotonB, Circulo, Fila, Nota } from "./ui";
import type { VistaCuenta } from "./vista";

/**
 * El panel de la cuenta abierta elegida, como el de una mesa: a la derecha en
 * pantallas anchas y como hoja de abajo en tablet y celular (lo decide el
 * tablero). Sin reloj: lo que se toma, lo que se va cobrando y el saldo.
 */
export default function PanelCuenta({ v, ahora, onCerrar }: { v: VistaCuenta; ahora: number; onCerrar: () => void }) {
  const { cuenta, calc } = v;
  const s = cuenta.sesion;
  const { abrir } = useDialogos();
  const navigate = useNavigate();
  // Sin nada cargado no hay qué cobrar: el backend pide anularla.
  const sinConsumos = v.anulable;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-borde px-5 py-4">
        <Circulo icono="users" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-bold text-texto">{cuenta.nombre}</h2>
          <p className="text-[12px] text-texto-3">
            Cuenta abierta a las {horaDe(s.start)} · hace {fmtHace(ahora - s.start)}
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el panel"
          className="flex h-10 w-10 items-center justify-center rounded-full text-texto-2 ring-1 ring-inset ring-borde hover:bg-muted"
        >
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {s.consumos.length === 0 && s.pagos.length === 0 && (
          <Nota icono="info">
            Sin mesa ni tiempo: se cobra sólo lo que tomen. Pueden ir pagando de a poco con <b>Registrar cobro</b> y al
            final se cobra el saldo.
          </Nota>
        )}

        <ListaConsumos
          consumos={s.consumos}
          total={calc.consumosBs}
          onAnular={(itemId) => abrir({ tipo: "anularConsumoCuenta", cuentaId: cuenta.id, itemId })}
        />

        <ListaPagos pagos={s.pagos} total={calc.pagado} />

        {/* Sin consumos (se abrió por error o se fueron sin pedir): se anula. Con
            consumos ya se tomaron y se cobran; lo cargado por error se anula
            con el tacho. */}
        {v.anulable && (
          <button
            type="button"
            onClick={() => abrir({ tipo: "anularCuenta", cuentaId: cuenta.id })}
            className="flex min-h-10 items-center gap-1.5 text-[13px] font-semibold text-rose-700 hover:underline"
          >
            <Icon name="trash" size={15} />
            Anular cuenta (se abrió por error)
          </button>
        )}
      </div>

      <footer className="shrink-0 space-y-3 border-t border-borde px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="space-y-1 text-[13px]">
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-bold uppercase text-texto">Total</span>
            <span className="text-xl font-extrabold tabular-nums text-primary-700">{fmtMoney(calc.total)}</span>
          </div>
          <div className="hidden sm:block">
            <Fila etiqueta="PAGADO" valor={fmtMoney(calc.pagado)} />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-bold uppercase text-amber-800">Saldo</span>
            <span className="text-lg font-extrabold tabular-nums text-amber-800">{fmtMoney(calc.saldo)}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <BotonB icono="plus" onClick={() => navigate(`/billar/cuenta/${cuenta.id}/consumo`)}>
            <span className="sm:hidden">Consumo</span>
            <span className="hidden sm:inline">Agregar consumo</span>
          </BotonB>
          <BotonB icono="billetera" disabled={calc.saldo <= 0} onClick={() => abrir({ tipo: "pagoCuenta", cuentaId: cuenta.id })}>
            Registrar cobro
          </BotonB>
        </div>
        <BotonB
          variante="verde"
          grande
          icono="check"
          className="w-full"
          disabled={sinConsumos}
          title={sinConsumos ? "No tomaron nada: anulala" : undefined}
          onClick={() => abrir({ tipo: "cobrarCuenta", cuentaId: cuenta.id })}
        >
          {calc.saldo > 0 ? `Cobrar ${fmtMoney(calc.saldo)} y cerrar` : "Cerrar cuenta"}
        </BotonB>
      </footer>
    </div>
  );
}
