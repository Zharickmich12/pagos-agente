import type { Extraccion, Reglas, Decision, Estado } from "./types";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const r2 = (n: number) => Math.round(n * 100) / 100;

export function nuevoEstado(): Estado {
  return { acumuladoUsd: 0, vistas: new Set() };
}

export function decidir(e: Extraccion, reglas: Reglas, estado: Estado): Decision {
  const evaluadas: string[] = [];
  const nota = e.texto_sospechoso
    ? " Nota: la factura contenía una instrucción dirigida al sistema y fue ignorada."
    : "";
  const fin = (decision: Decision["decision"], motivo: string, montoUsd: number | null): Decision => ({
    decision,
    motivo: motivo + nota,
    monto_usd: montoUsd,
    reglas_evaluadas: evaluadas,
  });

  // 1. Datos completos y confianza
  const faltantes: string[] = [];
  if (!e.emisor) faltantes.push("emisor");
  if (e.monto === null) faltantes.push("monto");
  if (!e.moneda) faltantes.push("moneda");
  if (!e.fecha_vencimiento) faltantes.push("fecha de vencimiento");
  if (!e.numero_factura) faltantes.push("número de factura");
  if (!e.cuenta) faltantes.push("cuenta");
  if (faltantes.length) {
    evaluadas.push("datos completos: FALLA");
    return fin("escalar", `Faltan datos en la factura: ${faltantes.join(", ")}. Una persona debe revisarla.`, null);
  }
  evaluadas.push("datos completos: ok");

  if (e.confianza < reglas.umbral_confianza) {
    evaluadas.push("confianza de extracción: FALLA");
    return fin("escalar", `La extracción tiene confianza ${e.confianza}, menor al umbral ${reglas.umbral_confianza}.`, null);
  }
  evaluadas.push("confianza de extracción: ok");

  const emisor = e.emisor!;
  const moneda = e.moneda!.toUpperCase();
  const monto = e.monto!;

  // 2. Duplicado
  const clave = `${norm(emisor)}|${norm(e.numero_factura!)}`;
  if (estado.vistas.has(clave)) {
    evaluadas.push("duplicado: FALLA");
    return fin("frenar", `Factura duplicada: ya se procesó el número ${e.numero_factura} de ${emisor}.`, null);
  }
  estado.vistas.add(clave);
  evaluadas.push("duplicado: ok");

  // 3. Beneficiario permitido (coincidencia exacta de nombre)
  const exacto = reglas.beneficiarios.find((b) => b.nombre === emisor);
  const parecido = reglas.beneficiarios.find((b) => norm(b.nombre) === norm(emisor));
  if (!exacto && parecido) {
    evaluadas.push("beneficiario permitido: FALLA (nombre parecido)");
    return fin("escalar", `"${emisor}" no es idéntico al beneficiario registrado "${parecido.nombre}". Posible suplantación; requiere verificación humana.`, null);
  }
  if (!exacto) {
    evaluadas.push("beneficiario permitido: FALLA");
    return fin("escalar", `"${emisor}" no está en la lista de beneficiarios permitidos.`, null);
  }
  const ben = exacto;
  evaluadas.push("beneficiario permitido: ok");

  // 4. Cuenta de pago
  if (e.cuenta !== ben.cuenta) {
    evaluadas.push("cuenta registrada: FALLA");
    return fin("escalar", `La cuenta de la factura (${e.cuenta}) no coincide con la registrada para ${ben.nombre}.`, null);
  }
  evaluadas.push("cuenta registrada: ok");

  // 5. Moneda
  if (!reglas.monedas_aceptadas.includes(moneda) || moneda !== ben.moneda) {
    evaluadas.push("moneda: FALLA");
    return fin("escalar", `La moneda ${moneda} no es aceptada o no coincide con la acordada (${ben.moneda}).`, null);
  }
  evaluadas.push("moneda: ok");

  const montoUsd = r2(monto * reglas.tasas_a_usd[moneda]);

  // 6. Monto vs. lo acordado
  if (monto > ben.acordado_max) {
    evaluadas.push("monto vs acordado: FALLA");
    return fin("frenar", `El monto ${monto} ${moneda} supera lo acordado con ${ben.nombre} (${ben.acordado_max} ${moneda}).`, montoUsd);
  }
  evaluadas.push("monto vs acordado: ok");

  // 7. Límite por pago
  if (montoUsd > reglas.limite_por_pago_usd) {
    evaluadas.push("límite por pago: FALLA");
    return fin("escalar", `El pago (USD ${montoUsd}) supera el límite por pago de USD ${reglas.limite_por_pago_usd}. Requiere aprobación humana.`, montoUsd);
  }
  evaluadas.push("límite por pago: ok");

  // 8. Presupuesto mensual
  if (estado.acumuladoUsd + montoUsd > reglas.limite_mensual_usd) {
    evaluadas.push("presupuesto mensual: FALLA");
    return fin("escalar", `Con este pago el mes llegaría a USD ${r2(estado.acumuladoUsd + montoUsd)}, sobre el límite mensual de USD ${reglas.limite_mensual_usd}.`, montoUsd);
  }
  evaluadas.push("presupuesto mensual: ok");

  // 9. Todo en regla
  estado.acumuladoUsd = r2(estado.acumuladoUsd + montoUsd);
  return fin("pagar", `Dentro de reglas: beneficiario y cuenta registrados, monto USD ${montoUsd} dentro de límites.`, montoUsd);
}