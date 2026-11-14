/**
 * Lo que cuenta el numerito de una entrada del menú, para el lector de
 * pantalla: «1 pedido nuevo», «3 pedidos nuevos», «1 mesa abierta». Con el
 * plural mal ("1 pedidos nuevos") el rótulo suena a error.
 */
export function queCuentaElMenu(seccion: string, cantidad: number): string {
  const uno = cantidad === 1;
  if (seccion === "billar") return uno ? "mesa abierta" : "mesas abiertas";
  if (seccion === "pedidos_web") return uno ? "pedido nuevo" : "pedidos nuevos";
  return "por atender";
}
