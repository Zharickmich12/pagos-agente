export type Moneda = "USD" | "COP" | "MXN";

export interface Extraccion {
  emisor: string | null;
  pais: string | null;
  numero_factura: string | null;
  monto: number | null;
  moneda: string | null;
  fecha_vencimiento: string | null;
  cuenta: string | null;
  concepto: string | null;
  confianza: number;
  texto_sospechoso: boolean;
}

export interface Beneficiario {
  nombre: string;
  pais: string;
  moneda: string;
  acordado_max: number;
  cuenta: string;
}

export interface Reglas {
  empresa: string;
  periodo: string;
  limite_por_pago_usd: number;
  limite_mensual_usd: number;
  tasas_a_usd: Record<string, number>;
  monedas_aceptadas: string[];
  umbral_confianza: number;
  beneficiarios: Beneficiario[];
}

export type Accion = "pagar" | "frenar" | "escalar";

export interface Decision {
  decision: Accion;
  motivo: string;
  monto_usd: number | null;
  reglas_evaluadas: string[];
}

export interface Estado {
  acumuladoUsd: number;
  vistas: Set<string>;
}