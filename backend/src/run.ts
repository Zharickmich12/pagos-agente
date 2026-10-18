import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extraer } from "./extract";
import { decidir, nuevoEstado } from "./rules";
import type { Reglas } from "./types";

const DATA = resolve(process.cwd(), "../data");
const reglas: Reglas = JSON.parse(readFileSync(`${DATA}/rules.json`, "utf8"));
const esperado = JSON.parse(readFileSync(`${DATA}/expected.json`, "utf8"));

async function main() {
  const archivos = readdirSync(`${DATA}/invoices`).filter((f) => f.endsWith(".txt")).sort();
  const estado = nuevoEstado();
  const resultados: Record<string, unknown> = {};
  let aciertos = 0;
  let indebidos = 0;

  for (const f of archivos) {
    const id = f.replace(".txt", "");
    const texto = readFileSync(`${DATA}/invoices/${f}`, "utf8");
    const ext = await extraer(texto);
    const d = decidir(ext, reglas, estado);
    const ok = d.decision === esperado[id].decision;
    if (ok) aciertos++;
    if (d.decision === "pagar" && esperado[id].decision !== "pagar") indebidos++;
    resultados[id] = { extraccion: ext, ...d, esperado: esperado[id].decision, acierto: ok };
    console.log(`${ok ? "✔" : "✘"} ${id}  decidió: ${d.decision.padEnd(7)} esperado: ${esperado[id].decision.padEnd(7)} | ${d.motivo}`);
  }

  console.log(`\nAutonomía: ${aciertos}/${archivos.length} correctas`);
  console.log(`Pagos indebidos: ${indebidos} (debe ser 0)`);
  writeFileSync(`${DATA}/decisions.json`, JSON.stringify(resultados, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });