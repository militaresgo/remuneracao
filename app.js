// ====== Utilidades ======
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const parseMoney = (str) => {
  if (!str) return 0;
  return Number(String(str).replace(/\s/g, "").replace(/\./g, "").replace(",", ".")) || 0;
};
const fmt = (n) => BRL.format(Number(n || 0).toFixed ? Number(n).toFixed(2) : Number(n));

const byId = (id) => document.getElementById(id);
const tbodyProventos = byId("tbodyProventos");
const tbodyDescontos = byId("tbodyDescontos");

// ====== Tabela de Subsídio Efetivo por Posto/Graduação ====== SUBTEN ATUAL 14821.93
const SUBSIDIO = {
  "CEL": 38645.68,
  "TC": 34837.44,
  "MAJ": 31299.27,
  "CAP": 27380.60,
  "1º TEN": 19878.17,
  "2º TEN": 17095.24,
  "SUBTEN / ASP OF": 14821.93,
  "1º SGT / Cadete 3º Ano": 12964.02,
  "2º SGT / Cadete 2º Ano": 11235.49,
  "3º SGT / Cadete 1º Ano": 10371.20,
  "CB": 9458.55,
  "SD 1º CLASSE": 8613.45,
  "SD 2º CLASSE": 7812.64
};

// ====== Constantes fixas ======
const ABONO_FARDAMENTO = 51.99;
const FARDAMENTO = 51.99;
const FAS = round2(SUBSIDIO["CAP"] * 0.0035);
const ALIQUOTA_PENSAO = 0.105;

// ====== Parâmetros IRRF Mensal 2025 (oficiais RFB) ======
// Fonte: gov.br/receitafederal - Tributação de 2025 (incidência mensal)
const PARAMS_IRRF = {
  jan_abr: {
    dependente: 189.59,
    desconto_simplificado_limite: 564.80,
    faixas: [
      { ate: 2259.20, aliquota: 0.00, deducao: 0.00 },
      { ate: 2826.65, aliquota: 0.075, deducao: 169.44 },
      { ate: 3751.05, aliquota: 0.15, deducao: 381.44 },
      { ate: 4664.68, aliquota: 0.225, deducao: 662.77 },
      { ate: Infinity, aliquota: 0.275, deducao: 896.00 },
    ]
  },
  mai_dez: {
    dependente: 189.59,
    desconto_simplificado_limite: 607.20,
    faixas: [
      { ate: 2428.80, aliquota: 0.00, deducao: 0.00 },
      { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
      { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
      { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
      { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
    ]
  }
};

// ====== Dinâmica de campos ======
const ipasgoSel = byId("ipasgo");
const ipasgoManualInfo = byId("ipasgoManualInfo");
const ipasgoPercentBadge = byId("ipasgoPercentBadge");
const grupoIpasgoValor = byId("grupoIpasgoValor");
const valorIpasgoInput = byId("valorIpasgo");
const ipasgoPercentInput = byId("ipasgoPercent");
const btnReajuste = byId('simularReajuste');
const reajusteWrap = byId('reajusteWrap');
const reajustePercentInput = byId('reajustePercent');
let __reajustePercent = 0;
const MAX_REAJUSTE_PERCENT = 30;
const MIN_REAJUSTE_PERCENT = 0;
ipasgoSel.addEventListener("change", () => {
  const show = ipasgoSel.value === "manual";
  if (grupoIpasgoValor) grupoIpasgoValor.classList.toggle("hidden", !show);
  recomputePercentFromValor();
  computeDetalhamento();
});



// Recalcula o percentual a partir do valor em R$
function recomputePercentFromValor(){
  if (!ipasgoSel || ipasgoSel.value !== "manual") {
    if (ipasgoPercentBadge) ipasgoPercentBadge.textContent = "0,00 %";
    if (ipasgoManualInfo) ipasgoManualInfo.textContent = "Plano de Saúde (Manual - 0,00%), sendo que esse percentual é calculado na hora a partir do valor em R$ e do subsídio do posto/graduação selecionado.";
    return;
  }
  const postoSel = byId("posto");
  const posto = postoSel ? postoSel.value : "";
  const baseSubs = SUBSIDIO[posto] || 0;
  const valEl = byId("valorIpasgo");
  const val = parseMoney(valEl && valEl.value ? valEl.value : "0");
  let perc = 0;
  if (baseSubs > 0) perc = (val / baseSubs) * 100;
  const percTxt = String((Math.round(perc * 100) / 100).toFixed(2)).replace(".", ",") + " %";
  if (ipasgoPercentBadge){ ipasgoPercentBadge.textContent = percTxt; }
  if (ipasgoManualInfo){ ipasgoManualInfo.textContent = "Plano de Saúde (Manual - " + percTxt.replace(" %","%") + "), sendo que esse percentual é calculado na hora a partir do valor em R$ e do subsídio do posto/graduação selecionado."; }
}
// Quando o usuário digitar o valor em R$, sincroniza o %
if (valorIpasgoInput){
  valorIpasgoInput.addEventListener("input", () => {
    // Só calcula se houver posto escolhido
    recomputePercentFromValor();
  });
}

// Se mudar o posto/graduação, sincroniza para ambos os sentidos
byId("posto").addEventListener("change", () => { recomputePercentFromValor(); if (typeof recomputeIpasgoFromPercent === "function") recomputeIpasgoFromPercent(); computeDetalhamento(); });
// Máscara simples para inputs monetários
["valorIpasgo", "associacaoValor"].forEach(id => {
  const el = byId(id);
  el.addEventListener("input", (e) => {
    let v = e.target.value.replace(/[^\d,\.]/g, "");
    const parts = v.split(",");
    if (parts.length > 2) v = parts[0] + "," + parts.slice(1).join("");
    e.target.value = v;
  });
});

// ====== Cálculo ======
const form = byId("formRemuneracao");
const resultado = byId("resultado");
const totalBrutoEl = byId("totalBruto");
const totalDescontosEl = byId("totalDescontos");
const resumoBrutoEl = byId("resumoBruto");
const resumoDescontosEl = byId("resumoDescontos");
const resumoLiquidoEl = byId("resumoLiquido");
const metodoIrpfEl = byId("metodoIrpf");

form.addEventListener("submit", (e) => { e.preventDefault(); computeDetalhamento(); });


function computeDetalhamento() {
  // Campos obrigatórios
  const mes = byId("mes").value;
  const posto = byId("posto").value;
  const dependentes = Number(byId("dependentes").value || 0);

  if (!mes || !posto) {
    return;
  }
  // 1) Proventos
  const baseSubs = SUBSIDIO[posto];
  const subsidio = round2(baseSubs * (1 + (__reajustePercent||0)/100));
  const proventos = [
    { desc: `Subsídio Efetivo (${posto})` + (__reajustePercent ? ` (+${(__reajustePercent).toFixed(2).replace(".",",")}% )` : ""), valor: subsidio },
    { desc: "Abono Fardamento", valor: ABONO_FARDAMENTO }
  ];
  const totalBruto = sum(proventos.map(p => p.valor));

  // 2) Descontos fixos + pensão
  const pensao = round2(subsidio * ALIQUOTA_PENSAO);
  let ipasgoValor = 0;
let ipasgoSelecionado = false;
  let ipasgoTetoApplied = false;
const ipasgoMode = ipasgoSel ? ipasgoSel.value : "nao";
if (ipasgoMode === "basico") { ipasgoValor = round2(subsidio * 0.0681);
  if (ipasgoValor >= 785.46) { ipasgoValor = 785.46; } ipasgoSelecionado = true; }
else if (ipasgoMode === "especial") { ipasgoValor = round2(subsidio * 0.1248);
  if (ipasgoValor >= 1025.40) { ipasgoValor = 1025.40; } ipasgoSelecionado = true; }
else if (ipasgoMode === "manual") { ipasgoValor = round2(parseMoney(valorIpasgoInput ? valorIpasgoInput.value : "0")); ipasgoSelecionado = ipasgoValor > 0; }

  const associacaoValor = parseMoney(byId("associacaoValor").value);

  // 3) IRPF automático (IRRF mensal) — período do mês
  const periodo = ["Janeiro","Fevereiro","Março","Abril"].includes(mes) ? "jan_abr" : "mai_dez";
  const P = PARAMS_IRRF[periodo];
  const dedDependentes = round2(P.dependente * dependentes);

  // Deduções legais permitidas no mês (para o simulador): previdência oficial + dependentes
  const deducoesLegais = round2(pensao + dedDependentes);

  // Desconto simplificado mensal: 25% do rendimento, limitado
  const simplificado = Math.min(subsidio * 0.25, P.desconto_simplificado_limite);

  // Usa o MAIOR entre deduções legais e desconto simplificado
  const descontoAplicado = Math.max(deducoesLegais, simplificado);
  const metodo = descontoAplicado === simplificado;

  let baseCalc = subsidio - descontoAplicado;
  if (baseCalc < 0) baseCalc = 0;

  // Aplica a tabela progressiva mensal
  let aliquota = 0, deducao = 0;
  for (const faixa of P.faixas) {
    if (baseCalc <= faixa.ate) { aliquota = faixa.aliquota; deducao = faixa.deducao; break; }
  }
  let irpf = baseCalc * aliquota - deducao;
  if (irpf < 0) irpf = 0;
  irpf = round2(irpf);

  // 4) Descontos finais
  const descontos = [
    { desc: "Fardamento", valor: FARDAMENTO },
    { desc: "FAS – militar – ativo", valor: FAS },
    { desc: "Contribuição Pensão e Inatividade (10,5%)", valor: pensao },
    { desc: `IRPF`, valor: irpf }
  ];
if (ipasgoSelecionado) {
  let modeLabel = "";
  if (ipasgoMode === "basico") modeLabel = "Plano Padrão 6,81%";
  else if (ipasgoMode === "especial") modeLabel = "Plano Especial 12,48%";
  if (ipasgoMode === "manual") {
    const perc = (subsidio > 0) ? (Math.round((ipasgoValor / subsidio) * 10000) / 100) : 0;
    const percTxt = String(perc.toFixed(2)).replace(".", ",") + "%";
    const label = "Plano de Saúde (Manual – " + percTxt + ")";
    descontos.push({ desc: label, valor: ipasgoValor });
  } else { const label = "IPASGO (" + modeLabel + ")"; const _item = { desc: label, valor: ipasgoValor }; if (ipasgoTetoApplied) _item.badge = "teto"; descontos.push(_item); }
}

  if (associacaoValor > 0) descontos.push({ desc: "Filiação a Associação", valor: associacaoValor });

  const totalDescontos = sum(descontos.map(d => d.valor));
  const liquido = totalBruto - totalDescontos;

  
  // ====== Deltas por Reajuste (comparativo com base sem reajuste) ======
  let deltaBruto = 0, deltaDesc = 0, deltaLiq = 0;
  // Totais base (sem reajuste) — declarados fora do if para uso seguro no pós-cálculo
  let totalBrutoBase = 0, totalDescontosBase = 0, liquidoBase = 0;
  if ((__reajustePercent||0) > 0){
    // Totais base (sem reajuste) para comparação
    totalBrutoBase = round2(baseSubs + ABONO_FARDAMENTO);
    const pensaoBase = round2(baseSubs * ALIQUOTA_PENSAO);

    const periodoBase = ["Janeiro","Fevereiro","Março","Abril"].includes(mes) ? "jan_abr" : "mai_dez";
    const Pbase = PARAMS_IRRF[periodoBase];
    const dedDependentesBase = round2(Pbase.dependente * dependentes);
    const deducoesLegaisBase = round2(pensaoBase + dedDependentesBase);
    const simplificadoBase = Math.min(baseSubs * 0.25, Pbase.desconto_simplificado_limite);
    const descontoAplicadoBase = Math.max(deducoesLegaisBase, simplificadoBase);
    let baseCalcBase = baseSubs - descontoAplicadoBase;
    if (baseCalcBase < 0) baseCalcBase = 0;
    let aliquotaBase = 0, deducaoBase = 0;
    for (const faixa of Pbase.faixas) {
      if (baseCalcBase <= faixa.ate) { aliquotaBase = faixa.aliquota; deducaoBase = faixa.deducao; break; }
    }
    let irpfBase = baseCalcBase * aliquotaBase - deducaoBase;
    if (irpfBase < 0) irpfBase = 0;
    irpfBase = round2(irpfBase);

    totalDescontosBase = FARDAMENTO + FAS + pensaoBase + irpfBase;
    if (ipasgoSelecionado) totalDescontosBase += ipasgoValor;
    if (associacaoValor > 0) totalDescontosBase += associacaoValor;
    totalDescontosBase = round2(totalDescontosBase);

    liquidoBase = round2(totalBrutoBase - totalDescontosBase);

    deltaBruto = round2(totalBruto - totalBrutoBase);
    deltaDesc  = round2(totalDescontos - totalDescontosBase);
    deltaLiq   = round2(liquido - liquidoBase);
  }

  // Render
  renderRows(tbodyProventos, proventos, "azul");
  renderRows(tbodyDescontos, descontos, "vermelho");

  // Atualiza totais com indicativo de acréscimo (valor e %) quando houver reajuste
  const showDelta = ((__reajustePercent||0) > 0);
  const fmtPerc = (n) => `${(n>=0?'+':'')}${Math.abs(n).toFixed(2).replace('.',',')}%`;
  const deltaPercBruto = showDelta && totalBrutoBase > 0 ? (deltaBruto / totalBrutoBase * 100) : 0;
  const deltaPercDesc  = showDelta && totalDescontosBase > 0 ? (deltaDesc  / totalDescontosBase * 100) : 0;
  const deltaPercLiq   = showDelta && liquidoBase > 0 ? (deltaLiq   / liquidoBase * 100) : 0;

  totalBrutoEl.innerHTML = showDelta ? (fmt(totalBruto) + ` <small>(+${fmt(deltaBruto)} | ${fmtPerc(deltaPercBruto)})</small>`) : fmt(totalBruto);
  totalDescontosEl.innerHTML = showDelta ? (fmt(totalDescontos) + ` <small>(+${fmt(deltaDesc)} | ${fmtPerc(deltaPercDesc)})</small>`) : fmt(totalDescontos);
  resumoBrutoEl.innerHTML = showDelta ? (fmt(totalBruto) + ` <small>(+${fmt(deltaBruto)} | ${fmtPerc(deltaPercBruto)})</small>`) : fmt(totalBruto);
  resumoDescontosEl.innerHTML = showDelta ? (fmt(totalDescontos) + ` <small>(+${fmt(deltaDesc)} | ${fmtPerc(deltaPercDesc)})</small>`) : fmt(totalDescontos);
  resumoLiquidoEl.innerHTML = showDelta ? (fmt(liquido) + ` <small>(+${fmt(deltaLiq)} | ${fmtPerc(deltaPercLiq)})</small>`) : fmt(liquido);
  metodoIrpfEl.textContent = ``;  // ===== Férias (1/3) e 13º =====
  try {
    const noPrevTerco = true; // toggle removed

    // Terço de férias sobre o subsídio atual
    const terco = round2(subsidio / 3);
    const prevFerias = 0;

    // IR sobre férias (incremental no mês do pagamento)
    // Reaproveita P (tabela mensal) e variáveis já calculadas: pensao, irpf, dependentes, subsidio
    const dedDependentes2 = round2(P.dependente * dependentes);
    const deducoesLegais2 = round2((pensao + prevFerias) + dedDependentes2);
    const simplificado2 = Math.min((subsidio + terco) * 0.25, P.desconto_simplificado_limite);
    const descontoAplicado2 = Math.max(deducoesLegais2, simplificado2);

    let baseCalc2 = (subsidio + terco) - descontoAplicado2;
    if (baseCalc2 < 0) baseCalc2 = 0;

    let aliquota2 = 0, deducao2 = 0;
    for (const faixa of P.faixas) {
      if (baseCalc2 <= faixa.ate) { aliquota2 = faixa.aliquota; deducao2 = faixa.deducao; break; }
    }
    let irpf2 = baseCalc2 * aliquota2 - deducao2;
    if (irpf2 < 0) irpf2 = 0;
    irpf2 = round2(irpf2);

    const irFerias = round2(Math.max(0, irpf2 - irpf));
    const descFerias = round2(prevFerias + irFerias);
    const liquidoFerias = round2(terco - descFerias);

    // 13º (exclusivo na fonte) — base simplificada: subsídio atual
    const bruto13 = subsidio;
    const prev13 = round2(bruto13 * ALIQUOTA_PENSAO);
    const dedDependentes13 = round2(PARAMS_IRRF["jan_abr"].dependente * dependentes);
const base13 = bruto13 - prev13 - dedDependentes13;
    const P13 = PARAMS_IRRF["jan_abr"]; // usa faixas de mai_dez por ser apurado em dezembro
    let aliquota13 = 0, deducao13 = 0;
    for (const faixa of P13.faixas) {
      if (base13 <= faixa.ate) { aliquota13 = faixa.aliquota; deducao13 = faixa.deducao; break; }
    }
    if (base13 < 0) base13 = 0;
    let ir13 = base13 * aliquota13 - deducao13;
    if (ir13 < 0) ir13 = 0;
    ir13 = round2(ir13);

    const desc13 = round2(prev13 + ir13);
    const liquido13 = round2(bruto13 - desc13);

    // Totais
    const totalBrutoFerias13 = round2(terco + bruto13);
    const totalDescFerias13 = round2(descFerias + desc13);
    const totalLiqFerias13 = round2(liquidoFerias + liquido13);

    // Atualiza DOM (se existir a seção)
    const elCheck = byId("noPrevTerco");
    if (byId("feriasBruto")) {
      byId("feriasBruto").textContent = fmt(terco);
      byId("feriasDesc").textContent = fmt(descFerias);
      byId("feriasDescBreak").textContent = `Prev: ${fmt(prevFerias)} | IR: ${fmt(irFerias)}`;
      byId("feriasLiquido").textContent = fmt(liquidoFerias);

      byId("decimoBruto").textContent = fmt(bruto13);
      byId("decimoDesc").textContent = fmt(desc13);
      byId("decimoDescBreak").textContent = `Prev: ${fmt(prev13)} | IR: ${fmt(ir13)}`;
      byId("decimoLiquido").textContent = fmt(liquido13);

      byId("ferias13TotBruto").textContent = fmt(totalBrutoFerias13);
      byId("ferias13TotDesc").textContent = fmt(totalDescFerias13);
      byId("ferias13TotLiquido").textContent = fmt(totalLiqFerias13);
    
    // ===== Deltas do Resumo Adicional Férias e 13º (comparado à base sem reajuste) =====
    (function(){
      try {
        const showDelta = (__reajustePercent||0) > 0;
        if (!showDelta) {
          if (byId("ferias13TotBruto")) byId("ferias13TotBruto").innerHTML = fmt(totalBrutoFerias13);
          if (byId("ferias13TotDesc")) byId("ferias13TotDesc").innerHTML = fmt(totalDescFerias13);
          if (byId("ferias13TotLiquido")) byId("ferias13TotLiquido").innerHTML = fmt(totalLiqFerias13);
          if (byId("ferias13TotBrutoDelta")) byId("ferias13TotBrutoDelta").textContent = "";
          if (byId("ferias13TotDescDelta")) byId("ferias13TotDescDelta").textContent = "";
          if (byId("ferias13TotLiquidoDelta")) byId("ferias13TotLiquidoDelta").textContent = "";
          return;
        }
        // Base SEM reajuste
        const tercoBase = round2(baseSubs / 3);
        const prevFeriasBase = 0; // sem previdência sobre o terço no simulador
        // IR férias (base) incremental
        const dedDependentesBase2 = round2(P.dependente * dependentes);
        const deducoesLegaisBase2 = round2((pensao + prevFeriasBase) + dedDependentesBase2);
        const simplificadoBase2 = Math.min((baseSubs + tercoBase) * 0.25, P.desconto_simplificado_limite);
        const descontoAplicadoBase2 = Math.max(deducoesLegaisBase2, simplificadoBase2);
        let baseCalcBase2 = (baseSubs + tercoBase) - descontoAplicadoBase2;
        if (baseCalcBase2 < 0) baseCalcBase2 = 0;
        let aliquotaBase2 = 0, deducaoBase2 = 0;
        for (const faixa of P.faixas) {
          if (baseCalcBase2 <= faixa.ate) { aliquotaBase2 = faixa.aliquota; deducaoBase2 = faixa.deducao; break; }
        }
        let irpfBase2 = baseCalcBase2 * aliquotaBase2 - deducaoBase2;
        if (irpfBase2 < 0) irpfBase2 = 0;
        irpfBase2 = round2(irpfBase2);
        // Recalcula IR mensal sem terço para achar somente o incremento do terço (base)
        let baseCalcSemTercoBase = baseSubs - (Math.max(baseSubs * 0.25, P.desconto_simplificado_limite, pensao + round2(P.dependente * dependentes)));
        if (baseCalcSemTercoBase < 0) baseCalcSemTercoBase = 0;
        let aliquotaSemTercoBase = 0, deducaoSemTercoBase = 0;
        for (const faixa of P.faixas) {
          if (baseCalcSemTercoBase <= faixa.ate) { aliquotaSemTercoBase = faixa.aliquota; deducaoSemTercoBase = faixa.deducao; break; }
        }
        let irpfSemTercoBase = baseCalcSemTercoBase * aliquotaSemTercoBase - deducaoSemTercoBase;
        if (irpfSemTercoBase < 0) irpfSemTercoBase = 0;
        irpfSemTercoBase = round2(irpfSemTercoBase);
        const irFeriasBase = round2(Math.max(0, irpfBase2 - irpfSemTercoBase));
        const descFeriasBase = round2(prevFeriasBase + irFeriasBase);
        const liquidoFeriasBase = round2(tercoBase - descFeriasBase);

        // 13º base (Janeiro + dependentes)
        const bruto13Base = baseSubs;
        const prev13Base = round2(bruto13Base * ALIQUOTA_PENSAO);
        const P13b = PARAMS_IRRF["jan_abr"];
        const dedDependentes13b = round2(P13b.dependente * dependentes);
        let base13b = bruto13Base - prev13Base - dedDependentes13b;
        if (base13b < 0) base13b = 0;
        let aliquota13b = 0, deducao13b = 0;
        for (const faixa of P13b.faixas) {
          if (base13b <= faixa.ate) { aliquota13b = faixa.aliquota; deducao13b = faixa.deducao; break; }
        }
        let ir13b = base13b * aliquota13b - deducao13b;
        if (ir13b < 0) ir13b = 0;
        ir13b = round2(ir13b);
        const desc13b = round2(prev13Base + ir13b);
        const liq13b = round2(bruto13Base - desc13b);

        const totalBrutoBaseF13 = round2(tercoBase + bruto13Base);
        const totalDescBaseF13 = round2(descFeriasBase + desc13b);
        const totalLiqBaseF13  = round2(liquidoFeriasBase + liq13b);

        // Deltas
        const dBruto = round2(totalBrutoFerias13 - totalBrutoBaseF13);
        const dDesc  = round2(totalDescFerias13  - totalDescBaseF13);
        const dLiq   = round2(totalLiqFerias13   - totalLiqBaseF13);

        const pBruto = totalBrutoBaseF13 ? round2(dBruto / totalBrutoBaseF13 * 100) : 0;
        const pDesc  = totalDescBaseF13  ? round2(dDesc  / totalDescBaseF13  * 100) : 0;
        const pLiq   = totalLiqBaseF13   ? round2(dLiq   / totalLiqBaseF13   * 100) : 0;

        // Render com sufixo " (+R$ X | +Y%)"
        const sufBruto = ` <small class="muted">(+${fmt(Math.abs(dBruto))} | ${fmtPerc(Math.abs(pBruto))})</small>`;
        const sufDesc  = ` <small class="muted">(+${fmt(Math.abs(dDesc))} | ${fmtPerc(Math.abs(pDesc))})</small>`;
        const sufLiq   = ` <small class="muted">(+${fmt(Math.abs(dLiq))} | ${fmtPerc(Math.abs(pLiq))})</small>`;

        if (byId("ferias13TotBruto")) byId("ferias13TotBruto").innerHTML = fmt(totalBrutoFerias13);
        if (byId("ferias13TotBrutoDelta")) byId("ferias13TotBrutoDelta").textContent = `(+${fmt(Math.abs(dBruto))} | ${fmtPerc(Math.abs(pBruto))})`;
        if (byId("ferias13TotDesc")) byId("ferias13TotDesc").innerHTML = fmt(totalDescFerias13);
        if (byId("ferias13TotDescDelta")) byId("ferias13TotDescDelta").textContent = `(+${fmt(Math.abs(dDesc))} | ${fmtPerc(Math.abs(pDesc))})`;
        if (byId("ferias13TotLiquido")) byId("ferias13TotLiquido").innerHTML = fmt(totalLiqFerias13);
        if (byId("ferias13TotLiquidoDelta")) byId("ferias13TotLiquidoDelta").textContent = `(+${fmt(Math.abs(dLiq))} | ${fmtPerc(Math.abs(pLiq))})`;
      } catch(e){ /* silencioso */ }
    })();
}
  } catch (e) {
    // ignora se a seção ainda não existe
  }

  
  
  
// === Publish Férias (1/3) & 13º to global state for Detalhamento Anual ===
  try {
    window.__F13__ = {
      ferias:  { bruto: terco,   descontos: descFerias,  liquido: liquidoFerias },
      decimo:  { bruto: bruto13, descontos: desc13,      liquido: liquido13 }
    };
  } catch(_e) { /* no-op */ }
// ===== Detalhamento Anual =====
  try {
    const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const thead = byId("theadDetalhamentoAnual");
    const tbody = byId("tbodyDetalhamentoAnual");
    if (!thead || !tbody) { /* sem seção */ } else {
      
      // Helper para ler valores monetários do DOM com robustez
      const getNumByIdAnual = (id) => {
        const el = byId(id);
        if (!el) return null;
        const txt = (el.textContent || el.innerText || "").replace(/\u00A0/g,' ').trim();
        if (!txt) return null;
        if (typeof parseMoney === "function") {
          const v = parseMoney(txt);
          if (Number.isFinite(v)) return v;
        }
        const norm = txt.replace(/[^\d,-]/g,"").replace(/\./g,"").replace(",",".");
        const n = Number(norm);
        return Number.isFinite(n) ? n : null;
      };
// Snapshot seguro dos insumos
      const _subsidio = (typeof subsidio !== "undefined" && isFinite(subsidio)) ? subsidio : 0;
      const _ABONO_FARDAMENTO = (typeof ABONO_FARDAMENTO !== "undefined") ? ABONO_FARDAMENTO : 0;
      const _FARDAMENTO = (typeof FARDAMENTO !== "undefined") ? FARDAMENTO : 0;
      const _FAS = (typeof FAS !== "undefined") ? FAS : 0;
      const _ALIQUOTA_PENSAO = (typeof ALIQUOTA_PENSAO !== "undefined") ? ALIQUOTA_PENSAO : 0.105;
      const _dependentes = (typeof dependentes !== "undefined" && isFinite(dependentes)) ? dependentes : (parseInt(byId("dependentes")?.value||"0",10)||0);
      const _ipasgoValor = (typeof ipasgoValor !== "undefined" && isFinite(ipasgoValor)) ? ipasgoValor : (typeof parseMoney === "function" ? parseMoney(byId("valorIpasgo")?.value || "0") : 0);
      const _associacaoValor = (typeof associacaoValor !== "undefined" && isFinite(associacaoValor)) ? associacaoValor : (typeof parseMoney === "function" ? parseMoney(byId("associacaoValor")?.value || "0") : 0);

      // Helpers
      const headCols = meses;
      const renderHead = () => { thead.innerHTML = '<tr><th></th>' + headCols.map(c=>`<th>${c}</th>`).join('') + '</tr>'; };

      const computeMensal = (mi) => {
        const PM = PARAMS_IRRF[ mi <= 3 ? "jan_abr" : "mai_dez" ];
        const bruto = round2(_subsidio + _ABONO_FARDAMENTO);
        const pensaoM = round2(_subsidio * _ALIQUOTA_PENSAO);
        const dedDepM = round2(PM.dependente * _dependentes);
        const simplifM = Math.min(_subsidio * 0.25, PM.desconto_simplificado_limite);
        const dedLegaisM = round2(pensaoM + dedDepM);
        let baseCalcM = _subsidio - Math.max(dedLegaisM, simplifM);
        if (baseCalcM < 0) baseCalcM = 0;
        let aM = 0, dM = 0;
        for (const faixa of PM.faixas) { if (baseCalcM <= faixa.ate) { aM = faixa.aliquota; dM = faixa.deducao; break; } }
        let irpfM = round2(baseCalcM * aM - dM); if (irpfM < 0) irpfM = 0;

        const descontos = round2(_FARDAMENTO + _FAS + pensaoM + irpfM + (_ipasgoValor||0) + (_associacaoValor||0));
        const liquido = round2(bruto - descontos);
        return { bruto, descontos, liquido };
      };

      const provs = [], descs = [], liqs = [];
      for (let i=0;i<12;i++){ const r = computeMensal(i); provs.push(r.bruto); descs.push(r.descontos); liqs.push(r.liquido); }

      // Colunas finais (copiadas do card Férias e 13º já computado acima)
      const _terco = (typeof terco !== "undefined") ? terco : 0;
      const _descFerias = (typeof descFerias !== "undefined") ? descFerias : 0;
      const _liqFerias = (typeof liquidoFerias !== "undefined") ? liquidoFerias : Math.max(0, _terco - _descFerias);
      const _bruto13 = (typeof bruto13 !== "undefined") ? bruto13 : _subsidio;
      const _desc13 = (typeof desc13 !== "undefined") ? desc13 : 0;
      const _liq13 = (typeof liquido13 !== "undefined") ? liquido13 : Math.max(0, _bruto13 - _desc13);

      
      // Colunas finais: ler diretamente do DOM da seção "Férias e 13º" (garante sincronismo)
      

      const tercoAnual = getNumByIdAnual("feriasBruto");
      const descFeriasAnual = getNumByIdAnual("feriasDesc");
      const liqFeriasAnual = getNumByIdAnual("feriasLiquido");

      const bruto13Anual = getNumByIdAnual("decimoBruto");
      const desc13Anual = getNumByIdAnual("decimoDesc");
      const liq13Anual = getNumByIdAnual("decimoLiquido");

      
      // Colunas finais: ler DOM (se já renderizado) com fallback para variáveis computadas
      

      let feriasBrutoVal = getNumByIdAnual("feriasBruto");
      let feriasDescVal  = getNumByIdAnual("feriasDesc");
      let feriasLiqVal   = getNumByIdAnual("feriasLiquido");
      if ((!feriasBrutoVal || feriasBrutoVal === 0) && typeof terco !== "undefined") feriasBrutoVal = terco;
      if ((!feriasDescVal  || feriasDescVal  === 0) && typeof descFerias !== "undefined") feriasDescVal = descFerias;
      if ((!feriasLiqVal   || feriasLiqVal   === 0) && typeof liquidoFerias !== "undefined") feriasLiqVal = liquidoFerias;

      let decimoBrutoVal = getNumByIdAnual("decimoBruto");
      let decimoDescVal  = getNumByIdAnual("decimoDesc");
      let decimoLiqVal   = getNumByIdAnual("decimoLiquido");
      if ((!decimoBrutoVal || decimoBrutoVal === 0) && typeof bruto13 !== "undefined") decimoBrutoVal = bruto13;
      if ((!decimoDescVal  || decimoDescVal  === 0) && typeof desc13  !== "undefined") decimoDescVal  = desc13;
      if ((!decimoLiqVal   || decimoLiqVal   === 0) && typeof liquido13 !== "undefined") decimoLiqVal = liquido13;

      provs.push(feriasBrutoVal, decimoBrutoVal);
      descs.push(feriasDescVal,  decimoDescVal);
      liqs.push(feriasLiqVal,    decimoLiqVal);

      
      
      renderHead();
      const row = (label, arr) => {
        const cls = label === 'Proventos' ? 'f13-row-proventos' : (label === 'Descontos' ? 'f13-row-descontos' : 'f13-row-liquido');
        return '<tr class="'+cls+'"><td><strong>'+label+'</strong></td>' + arr.map(v=>`<td class="right">${fmt(v)}</td>`).join('') + '</tr>';
      };
      
      const f13 = (window && window.__F13__) ? window.__F13__ : { ferias:{bruto:0,descontos:0,liquido:0}, decimo:{bruto:0,descontos:0,liquido:0} };
      const provsAll = provs.concat([f13.ferias.bruto, f13.decimo.bruto]);
      const descsAll = descs.concat([f13.ferias.descontos, f13.decimo.descontos]);
      const liqsAll  = liqs .concat([f13.ferias.liquido, f13.decimo.liquido]);
      tbody.innerHTML = row("Proventos", provsAll) + row("Descontos", descsAll) + row("Remuneração Líquida", liqsAll);
;

}
} catch(e){ /* silencioso */ }
  // ===== Detalhamento Anual (12 meses: Jan–Dez) =====
  try {
    const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const thead = byId("theadDetalhamentoAnual");
    const tbody = byId("tbodyDetalhamentoAnual");
    if (thead && tbody){
      const PM_JA = PARAMS_IRRF["jan_abr"];
      const PM_MD = PARAMS_IRRF["mai_dez"];
      const _subsidio = (typeof subsidio !== "undefined" && isFinite(subsidio)) ? subsidio : 0;
      const _AF = (typeof ABONO_FARDAMENTO !== "undefined") ? ABONO_FARDAMENTO : 0;
      const _FARD = (typeof FARDAMENTO !== "undefined") ? FARDAMENTO : 0;
      const _FAS = (typeof FAS !== "undefined") ? FAS : 0;
      const _ALI = (typeof ALIQUOTA_PENSAO !== "undefined") ? ALIQUOTA_PENSAO : 0.105;
      const _dep = (typeof dependentes !== "undefined" && isFinite(dependentes)) ? dependentes : (parseInt(byId("dependentes")?.value||"0",10)||0);
      const _ipas = (typeof ipasgoValor !== "undefined" && isFinite(ipasgoValor)) ? ipasgoValor : (typeof parseMoney==="function" ? parseMoney(byId("valorIpasgo")?.value||"0") : 0);
      const _assoc = (typeof associacaoValor !== "undefined" && isFinite(associacaoValor)) ? associacaoValor : (typeof parseMoney==="function" ? parseMoney(byId("associacaoValor")?.value||"0") : 0);
      function calcMensal(mi){
        const PM = mi<=3 ? PM_JA : PM_MD;
        const bruto = round2(_subsidio + _AF);
        const pens = round2(_subsidio * _ALI);
        const dedDep = round2(PM.dependente * _dep);
        const simpl = Math.min(_subsidio * 0.25, PM.desconto_simplificado_limite);
        const dedLeg = round2(pens + dedDep);
        let base = _subsidio - Math.max(dedLeg, simpl);
        if (base < 0) base = 0;
        let a=0,d=0;
        for (const fx of PM.faixas){ if (base <= fx.ate){ a=fx.aliquota; d=fx.deducao; break; } }
        let ir = base*a - d; if (ir < 0) ir = 0; ir = round2(ir);
        const descontos = round2(_FARD + _FAS + pens + ir + (_ipas||0) + (_assoc||0));
        const liquido = round2(bruto - descontos);
        return {bruto, descontos, liquido};
      }
      const provs=[], descs=[], liqs=[];
      for (let i=0;i<12;i++){ const r = calcMensal(i); provs.push(r.bruto); descs.push(r.descontos); liqs.push(r.liquido); }
      thead.innerHTML = '<tr><th></th>' + meses.map(m=>`<th>${m}</th>`).join('') + `<th>Adicional Férias (1/3)</th><th>13º (gratificação natalina)</th></tr>`;
      const row = (label, arr) => '<tr><td><strong>'+label+'</strong></td>' + arr.map(v=>`<td class="right">${fmt(v)}</td>`).join('') + '</tr>';
      
      // Acrescentar as colunas finais com valores da seção "Férias e 13º"
      const getNumByIdAnual2 = (id) => {
        const el = byId(id);
        if (!el) return null;
        const txt = (el.textContent || el.innerText || "").trim();
        if (!txt) return null;
        if (typeof parseMoney === "function") return parseMoney(txt);
        return Number(txt.replace(/[^\d,-]/g,"").replace(/\./g,"").replace(",",".") || 0);
      };
      let feriasB = getNumByIdAnual2("feriasBruto");
      let feriasD = getNumByIdAnual2("feriasDesc");
      let feriasL = getNumByIdAnual2("feriasLiquido");
      if (feriasB == null && typeof terco !== "undefined") feriasB = terco;
      if (feriasD == null && typeof descFerias !== "undefined") feriasD = descFerias;
      if (feriasL == null && typeof liquidoFerias !== "undefined") feriasL = liquidoFerias;
      let decimoB = getNumByIdAnual2("decimoBruto");
      let decimoD = getNumByIdAnual2("decimoDesc");
      let decimoL = getNumByIdAnual2("decimoLiquido");
      if (decimoB == null && typeof bruto13 !== "undefined") decimoB = bruto13;
      if (decimoD == null && typeof desc13  !== "undefined") decimoD = desc13;
      if (decimoL == null && typeof liquido13 !== "undefined") decimoL = liquido13;
      feriasB = +((feriasB ?? 0)); feriasD = +((feriasD ?? 0)); feriasL = +((feriasL ?? (feriasB - feriasD)));
      decimoB = +((decimoB ?? 0)); decimoD = +((decimoD ?? 0)); decimoL = +((decimoL ?? (decimoB - decimoD)));
      const provsAll = provs.concat([feriasB, decimoB]);
      const descsAll = descs.concat([feriasD, decimoD]);
      const liqsAll  = liqs.concat([feriasL, decimoL]);
      tbody.innerHTML = row("Proventos", provsAll) + row("Descontos", descsAll) + row("Remuneração Líquida", liqsAll);
    }
  } catch(e){ /* silencioso */ }
  resultado.hidden = false;
  const badge = byId('autoBadge');
if (badge){
    badge.classList.remove('hidden');
    badge.classList.add('show');
    clearTimeout(window.__autoBadgeTimer);
    window.__autoBadgeTimer = setTimeout(()=>{ badge.classList.remove('show'); }, 1200);
  }

  // ---- END-SYNC: atualiza as duas colunas extras do Detalhamento Anual com TEXTO dos cards ----
  try {
    const thead = byId("theadDetalhamentoAnual");
    const tbody = byId("tbodyDetalhamentoAnual");
    if (thead && tbody) {
      const ensureHeadExtras = () => {
        const tr = thead.querySelector("tr");
        if (!tr) return;
        const cols = tr.children.length;
        if (cols < 15) {
          tr.insertAdjacentHTML("beforeend",
            '<th>Adicional Férias (1/3)</th><th>13º (gratificação natalina)</th>');
        }
      };
      const getTxt = (id) => {
        const el = byId(id);
        if (!el) return null;
        const t = (el.textContent || el.innerText || "").replace(/\u00A0/g," ").trim();
        return t || null;
      };
      const setLastTwo = (row, t1, t2) => {
        if (!row) return;
        const headCols = thead.querySelector("tr")?.children?.length || 15;
        while (row.cells.length < headCols) {
          const td = document.createElement("td");
          td.className = "right";
          row.appendChild(td);
        }
        const c1 = row.cells[row.cells.length - 2];
        const c2 = row.cells[row.cells.length - 1];
        c1.textContent = t1 ?? "—";
        c2.textContent = t2 ?? "—";
        c1.classList.add("right");
        c2.classList.add("right");
      };
      const syncOnce = () => {
        const rows = tbody.querySelectorAll("tr");
        if (rows.length < 3) return false;
        const fB = getTxt("feriasBruto");
        const fD = getTxt("feriasDesc");
        const fL = getTxt("feriasLiquido");
        const dB = getTxt("decimoBruto");
        const dD = getTxt("decimoDesc");
        const dL = getTxt("decimoLiquido");
        if ([fB,fD,fL,dB,dD,dL].some(v => v == null)) return false;
        ensureHeadExtras();
        setLastTwo(rows[0], fB, dB); // Proventos
        setLastTwo(rows[1], fD, dD); // Descontos
        setLastTwo(rows[2], fL, dL);
        // Força cores por classe e inline (backup)
        try {
          rows[0].classList.add("f13-row-proventos");
          rows[1].classList.add("f13-row-descontos");
          rows[2].classList.add("f13-row-liquido");
          const col0 = "#1e40af", col1 = "#b91c1c", col2 = "#15803d";
          [...rows[0].cells].forEach((td,i)=>{ if(i>0) td.style.color = col0; });
          [...rows[1].cells].forEach((td,i)=>{ if(i>0) td.style.color = col1; });
          [...rows[2].cells].forEach((td,i)=>{ if(i>0) td.style.color = col2; });
        } catch(_e) { /* silencioso */ }
     // Líquido
        // Atualiza os totais novamente (garantia)
      try {
        const rows = byId("tbodyDetalhamentoAnual")?.querySelectorAll("tr") || [];
        if (rows.length>=3){
          ensureHeadExtras();
          // reusa setTotalMonthsOnly se presente
          if (typeof setTotalMonthsOnly === "function") {
            setTotalMonthsOnly(rows[0]);
            setTotalMonthsOnly(rows[1]);
            setTotalMonthsOnly(rows[2]);
          }
        }
      } catch(_e) {}
return true;
      };
      // tentar já, depois no próximo frame e com pequenos atrasos
      if (!syncOnce()) {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => { syncOnce() || setTimeout(syncOnce, 50); });
        } else {
          setTimeout(syncOnce, 50);
        }
        // Observa alterações nos cards e na própria tabela para re-sincronizar
        try {
          const targets = [byId("ferias13Box"), byId("tabelaDetalhamentoAnual")].filter(Boolean);
          if (targets.length && typeof MutationObserver !== "undefined") {
            const obs = new MutationObserver(() => { syncOnce(); });
            targets.forEach(t => obs.observe(t, { childList:true, subtree:true, characterData:true }));
            const stopIfDone = () => { if (syncOnce()) obs.disconnect(); };
            setTimeout(stopIfDone, 200);
            setTimeout(stopIfDone, 600);
          }
        } catch(_e) { /* silencioso */ }
      }
    }
  } catch(_e) { /* silencioso */ }
}

// Botão limpar
byId("limpar").addEventListener("click", () => {
  form.reset();
  valorIpasgoInput.value = "";
  byId("associacaoValor").value = "";
  grupoIpasgoValor.classList.add("hidden");
  if (reajusteWrap) reajusteWrap.classList.add("hidden");
  
  __reajustePercent = 0;
  resultado.hidden = true;
  tbodyProventos.innerHTML = "";
  tbodyDescontos.innerHTML = "";
  metodoIrpfEl.textContent = "";
});

// Helpers
function sum(arr){ return arr.reduce((a,b)=> a + (Number(b)||0), 0); }
function round2(n){ return Math.round(n * 100) / 100; }

function renderRows(tbody, items, colorClass){
  tbody.innerHTML = items.map(it => `
    <tr>
      <td class="cell-left">
        <span>${escapeHtml(it.desc)}</span>
        ${it.badge ? `<span class="badge badge-teto">${escapeHtml(it.badge)}</span>` : ``}
      </td>
      <td class="right ${colorClass}"><strong>${fmt(it.valor)}</strong></td>
    </tr>
  `).join("");
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Ano no rodapé
document.getElementById("ano").textContent = new Date().getFullYear();


// === Sincronização IPASGO (duas vias) ===
function recomputeIpasgoFromPercent(){
  if (!ipasgoSel || ipasgoSel.value !== "manual") return;
  if (!ipasgoPercentInput) return;
  const posto = byId("posto").value; if (!posto) return;
  const subsidio = SUBSIDIO[posto] || 0;
  const perc = parseMoney(String(ipasgoPercentInput.value).replace("%",""));
  const valor = Math.round(subsidio * (perc/100) * 100) / 100;
  if (isFinite(valor) && valorIpasgoInput){ valorIpasgoInput.value = String(valor.toFixed(2)).replace(".", ","); }
}
function recomputePercentFromValor(){
  if (!ipasgoSel || ipasgoSel.value !== "manual") {
    if (ipasgoPercentBadge) ipasgoPercentBadge.textContent = "0,00 %";
    if (ipasgoManualInfo) ipasgoManualInfo.textContent = "Plano de Saúde (Manual - 0,00%), sendo que esse percentual é calculado na hora a partir do valor em R$ e do subsídio do posto/graduação selecionado.";
    return;
  }
  const postoSel = byId("posto");
  const posto = postoSel ? postoSel.value : "";
  const baseSubs = SUBSIDIO[posto] || 0;
  const valEl = byId("valorIpasgo");
  const val = parseMoney(valEl && valEl.value ? valEl.value : "0");
  let perc = 0;
  if (baseSubs > 0) perc = (val / baseSubs) * 100;
  if (ipasgoPercentBadge){ ipasgoPercentBadge.textContent = String((Math.round(perc * 100) / 100).toFixed(2)).replace(".", ",") + " %"; }
}
// Listeners
if (ipasgoPercentInput){
  ipasgoPercentInput.addEventListener("input", () => {
    let v = ipasgoPercentInput.value.replace(/[^\d,\.]/g, "");
    const parts = v.split(",");
    if (parts.length > 2) v = parts[0] + "," + parts.slice(1).join("");
    ipasgoPercentInput.value = v;
    recomputeIpasgoFromPercent();
  });
}
if (valorIpasgoInput){
  valorIpasgoInput.addEventListener("input", () => { recomputePercentFromValor(); computeDetalhamento(); });
}
byId("posto").addEventListener("change", () => { recomputePercentFromValor(); if (typeof recomputeIpasgoFromPercent === "function") recomputeIpasgoFromPercent(); computeDetalhamento(); });
// ====== Reajuste: UI e sincronização ======

// ====== Reajuste: validação/máscara e botões rápidos ======

// ====== Reajuste: slider/barra ======
const reajusteRange = document.getElementById("reajusteRange");
const reajusteRangeVal = document.getElementById("reajusteRangeVal");

function updateReajusteRangeUI(val){
  if (reajusteRange) reajusteRange.value = String(val);
  if (reajusteRangeVal) reajusteRangeVal.textContent = formatPercentTwoDecimals(val) + "%";
}

// ====== Reajuste: reset ao ocultar ======
function resetReajuste(){
  __reajustePercent = 0;
  const range = document.getElementById("reajusteRange");
  if (range){ range.value = "0"; }
  if (typeof updateReajusteRangeUI === "function"){ updateReajusteRangeUI(0); }
  computeDetalhamento && computeDetalhamento();
}


if (reajusteRange){
  reajusteRange.addEventListener("input", () => {
    let v = Number(reajusteRange.value || 0);
    v = clampPercent(v);
    __reajustePercent = v;
    // sincroniza campo de texto e badge

    updateReajusteRangeUI(v);
    computeDetalhamento();
  });
}

// Quando o usuário digitar no campo de texto, sincroniza a barra também
if (reajustePercentInput){
  reajustePercentInput.addEventListener("input", () => {
    updateReajusteRangeUI(__reajustePercent);
  });
  reajustePercentInput.addEventListener("blur", () => {
    updateReajusteRangeUI(__reajustePercent);
  });
}

// Reset da barra ao limpar
byId("limpar").addEventListener("click", () => {
  updateReajusteRangeUI(0);
});


// ====== Reajuste: seletor de valor exato (3, 5, 10) ======
const reajusteSelect = document.getElementById("reajusteSelect");
if (reajusteSelect && reajustePercentInput){
  reajusteSelect.addEventListener("change", () => {
    const v = Number(reajusteSelect.value || 0);
    if (!v){ return; } // "Escolher…"
    __reajustePercent = v;
    // Atualiza o campo com formatação 2 casas e recalcula
    reajustePercentInput.value = String(v.toFixed(2)).replace(".", ",");
    reajustePercentInput.classList.remove("invalid");
    computeDetalhamento();
  });
}

const reajusteQuick = document.getElementById("reajusteQuickBtns");

function sanitizePercentInput(str){
  // Mantém apenas dígitos e vírgula, uma vírgula no máximo, e no máx 2 casas decimais
  if (!str) return "";
  let s = String(str).replace(/[^\d,]/g, "");
  const parts = s.split(",");
  if (parts.length > 2){
    s = parts[0] + "," + parts.slice(1).join("");
  }
  if (s.includes(",")){
    const [intp, decp=""] = s.split(",");
    s = intp.replace(/^0+(\d)/, "$1") + "," + decp.slice(0,2);
  } else {
    // sem vírgula por enquanto; deixamos formatar no blur
    s = s.replace(/^0+(\d)/, "$1");
  }
  return s;
}

function normalizePercentToNumber(str){
  // Converte "12,34" -> 12.34; "12" -> 12
  if (!str) return 0;
  return parseMoney(str); // parseMoney já trata vírgula
}

function formatPercentTwoDecimals(n){
  const val = Math.round(Number(n||0) * 100) / 100;
  return String(val.toFixed(2)).replace(".", ",");
}

function clampPercent(n){
  if (n > MAX_REAJUSTE_PERCENT) return MAX_REAJUSTE_PERCENT;
  if (n < MIN_REAJUSTE_PERCENT) return MIN_REAJUSTE_PERCENT;
  return n;
}

if (reajustePercentInput){
  // Máscara em tempo real (somente números e vírgula; no máx 2 decimais)
  reajustePercentInput.addEventListener("input", (e) => {
    const cur = e.target.value;
    const masked = sanitizePercentInput(cur);
    if (masked !== cur) e.target.value = masked;

    // Atualiza variável e calcula
    let perc = normalizePercentToNumber(masked);
    perc = clampPercent(perc);
    __reajustePercent = perc;

    // Marcação de inválido se ultrapassar limites (antes de clamp visualmente)
    if (normalizePercentToNumber(masked) > MAX_REAJUSTE_PERCENT){
      e.target.classList.add("invalid");
    } else {
      e.target.classList.remove("invalid");
    }

    computeDetalhamento();
  });

  // Ao sair do campo, padroniza para 2 casas e adiciona ,00 se necessário
  reajustePercentInput.addEventListener("blur", (e) => {
    let perc = normalizePercentToNumber(e.target.value);
    perc = clampPercent(perc);
    __reajustePercent = perc;
    e.target.value = formatPercentTwoDecimals(perc);
  });
}

// Botões rápidos: incrementam o valor atual (+3, +5, +10)
if (reajusteQuick){
  reajusteQuick.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-inc]");
    if (!btn || !reajustePercentInput) return;
    const inc = Number(btn.getAttribute("data-inc") || 0);
    let cur = normalizePercentToNumber(reajustePercentInput.value);
    let next = clampPercent(cur + inc);
    __reajustePercent = next;
    reajustePercentInput.value = formatPercentTwoDecimals(next);
    reajustePercentInput.classList.remove("invalid");
    computeDetalhamento();
  });
}

if (btnReajuste){
  btnReajuste.addEventListener("click", () => {
    if (reajusteWrap){ 
      reajusteWrap.classList.toggle("hidden");
      if (reajusteWrap.classList.contains("hidden")){ resetReajuste(); }
      if (!reajusteWrap.classList.contains("hidden") && reajustePercentInput){
        reajustePercentInput.focus();
        reajustePercentInput.select && reajustePercentInput.select();
      }
    }
  });
}
if (reajustePercentInput){
  reajustePercentInput.addEventListener("input", (e) => {
    let v = e.target.value.replace(/[^\d,\.]/g, "");
    const parts = v.split(",");
    if (parts.length > 2) v = parts[0] + "," + parts.slice(1).join("");
    e.target.value = v;
    __reajustePercent = parseMoney(e.target.value);
    if (__reajustePercent < 0) __reajustePercent = 0; if (__reajustePercent > 30) __reajustePercent = 30;
    computeDetalhamento();
  });
}
// Ao trocar o posto, reaplica o mesmo percentual sobre o novo subsídio
byId("posto").addEventListener("change", () => { recomputePercentFromValor(); if (typeof recomputeIpasgoFromPercent === "function") recomputeIpasgoFromPercent(); computeDetalhamento(); });
const noPrevTercoEl = byId("noPrevTerco");
if (noPrevTercoEl) noPrevTercoEl.addEventListener("change", () => { computeDetalhamento(); });
// ====== Auto-recalcular quando campos mudarem ======
const camposRecalcChange = ["mes","posto","dependentes","ipasgo"];
camposRecalcChange.forEach(id => {
  const el = byId(id);
  if (el) el.addEventListener("change", () => { computeDetalhamento(); });
});
const camposRecalcInput = ["valorIpasgo","ipasgoPercent","associacaoValor"];
camposRecalcInput.forEach(id => {
  const el = byId(id);
  if (el) el.addEventListener("input", () => { computeDetalhamento(); });
});

// force ipasgo default
(function(){ const s = byId("ipasgo"); if (s) { s.value = "nao"; const ev = new Event("change"); s.dispatchEvent(ev);} })();

byId("valorIpasgo").addEventListener("input", () => { recomputePercentFromValor(); computeDetalhamento(); });


// === Valores Anuais: soma das colunas da tabelaDetalhamentoAnual por linha (robusto) ===
(function(){
  function byId(id){ return document.getElementById(id); }
  function norm(s){
    return (s||"").toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  }
  function parseBRLnum(txt){
    const s = (txt||"").replace(/\u00A0/g," ").trim();
    if (!s) return 0;
    try {
      if (typeof parseMoney === "function") {
        const v = parseMoney(s);
        if (Number.isFinite(v)) return v;
      }
    } catch(_e){}
    const normv = s.replace(/[^\d,-]/g,"").replace(/\./g,"").replace(",",".").trim();
    const n = Number(normv||"0");
    return Number.isFinite(n) ? n : 0;
  }
  function fmtBRL(n){
    try { return typeof fmt === "function" ? fmt(n) : n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
    catch(_e){ return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
  }
  function getAnnualTable(){
    return byId("tabelaDetalhamentoAnual") || document.querySelector("#detalhamentoAnualBox table");
  }
  function getHeaderTexts(tbl){
    const trHead = (tbl.tHead && tbl.tHead.querySelector("tr")) || tbl.querySelector("thead tr") || tbl.querySelector("tr");
    if (!trHead) return [];
    return Array.from(trHead.children).map(th => (th.textContent||"").trim());
  }
  function getBodyRows(tbl){
    const tb = (tbl.tBodies && tbl.tBodies[0]) || tbl.querySelector("tbody");
    let rows = [];
    if (tb) rows = Array.from(tb.querySelectorAll("tr"));
    else {
      const all = Array.from(tbl.querySelectorAll("tr"));
      rows = all.slice(1); // assume first is header
    }
    return rows;
  }
  function sumRow(labelNeedle){
    const tbl = getAnnualTable();
    if (!tbl) return 0;
    const headers = getHeaderTexts(tbl);
    const idxTotal = headers.findIndex(h => /^Total$/i.test(h));
    const rows = getBodyRows(tbl);
    const row = rows.find(r => norm(r.cells?.[0]?.textContent).includes(labelNeedle));
    if (!row) return 0;
    let sum = 0;
    for (let i=1; i<row.cells.length; i++){
      if (i === idxTotal) continue; // não soma a própria coluna Total
      sum += parseBRLnum(row.cells[i].textContent);
    }
    return sum;
  }
  function recalcValores(){
    const outP = byId("valoresAnuaisProventos");
    const outD = byId("valoresAnuaisDescontos");
    const outL = byId("valoresAnuaisLiquido");
    if (!outP || !outD || !outL) return;
    const prov = sumRow("proventos");
    const desc = sumRow("descontos");
    // lida com acento/sem acento automaticamente via norm()
    const liq  = sumRow("remuneracao liquida");
    outP.textContent = fmtBRL(prov);
    outD.textContent = fmtBRL(desc);
    outL.textContent = fmtBRL(liq);
  }
  window.__recalcValoresAnuais = recalcValores;

  // Atualiza no load e quando a tabela anual mudar
  window.addEventListener("load", function(){
    setTimeout(recalcValores, 0);
    setTimeout(recalcValores, 120);
  });
  try {
    const tbl = getAnnualTable();
    if (tbl && typeof MutationObserver !== "undefined"){
      const obs = new MutationObserver(() => { recalcValores(); });
      obs.observe(tbl, { childList:true, subtree:true, characterData:true });
    }
  } catch(_e){}
})();


// === VALORES ANUAIS (FINAL): soma por rótulo exato; sem alterar a tabela anual ===
(function(){
  if (window.__VALORES_ANUAIS_FINAL__) return; window.__VALORES_ANUAIS_FINAL__ = true;
  function byId(id){ return document.getElementById(id); }
  function getTable(){
    return document.querySelector("#detalhamentoAnualBox table") || document.getElementById("tabelaDetalhamentoAnual");
  }
  function parseNumBR(txt){
    var s = (txt||"").replace(/\u00A0/g," ");
    var m = s.match(/(\d{1,3}(\.\d{3})+,\d{2}|\d+,\d{2}|\d+)/);
    if (!m) return 0;
    var raw = m[0];
    var norm = raw.replace(/\./g,"").replace(",","."); // milhar->nada, vírgula->ponto
    var n = Number(norm);
    return isFinite(n) ? n : 0;
  }
  function headerTexts(tbl){
    var tr = (tbl.tHead && tbl.tHead.rows && tbl.tHead.rows[0]) || (tbl.querySelector && tbl.querySelector("thead tr"));
    if (!tr) return [];
    var res = [];
    for (var i=0; i<tr.cells.length; i++){ res.push((tr.cells[i].textContent||"").trim()); }
    return res;
  }
  function bodyRows(tbl){
    var tb = (tbl.tBodies && tbl.tBodies[0]) || (tbl.querySelector && tbl.querySelector("tbody"));
    if (tb && tb.rows) return Array.prototype.slice.call(tb.rows);
    var all = tbl.querySelectorAll ? tbl.querySelectorAll("tr") : [];
    return Array.prototype.slice.call(all, 1);
  }
  function findRow(rows, label){
    for (var i=0; i<rows.length; i++){
      var c0 = rows[i].cells && rows[i].cells[0] ? (rows[i].cells[0].textContent||"").trim() : "";
      if (c0 === label) return rows[i];
    }
    return null;
  }
  function sumRow(tbl, label){
    var heads = headerTexts(tbl);
    var idxTotal = -1;
    for (var i=0; i<heads.length; i++){
      if ((heads[i]||"").trim().toLowerCase() === "total"){ idxTotal = i; break; }
    }
    var rows = bodyRows(tbl);
    var row = findRow(rows, label);
    if (!row) return 0;
    var sum = 0;
    for (var c=1; c<row.cells.length; c++){
      if (c === idxTotal) continue;
      sum += parseNumBR(row.cells[c].textContent || row.cells[c].innerText || "");
    }
    return sum;
  }
  function fmtBRL(n){
    try { return n.toLocaleString('pt-BR', {style:'currency', currency:'BRL'}); }
    catch(_e){ return "R$ " + (Math.round(n*100)/100).toFixed(2).replace(".",","); }
  }
  function recalcValoresAnuaisFinal(){
    var outP = byId("valoresAnuaisProventos");
    var outD = byId("valoresAnuaisDescontos");
    var outL = byId("valoresAnuaisLiquido");
    if (!outP || !outD || !outL) return;
    var tbl = getTable(); if (!tbl) return;
    var prov = sumRow(tbl, "Proventos");
    var desc = sumRow(tbl, "Descontos");
    var liq  = sumRow(tbl, "Remuneração Líquida");
    outP.textContent = fmtBRL(prov);
    outD.textContent = fmtBRL(desc);
    outL.textContent = fmtBRL(liq);
    // console debug once
    if (!window.__VAL_AN_LOGGED__){
      window.__VAL_AN_LOGGED__ = true;
      try { console.log("Valores Anuais =>", {prov: outP.textContent, desc: outD.textContent, liq: outL.textContent}); } catch(_e){}
    }
  }
  window.recalcValoresAnuaisFinal = recalcValoresAnuaisFinal;

  // Run a few times after load and after interactions (no observers)
  var _t=null; function ping(){ clearTimeout(_t); _t=setTimeout(recalcValoresAnuaisFinal, 120); }
  try { window.addEventListener("load", function(){ setTimeout(recalcValoresAnuaisFinal,0); setTimeout(recalcValoresAnuaisFinal,200); setTimeout(recalcValoresAnuaisFinal,800); }); } catch(_e){}
  document.addEventListener("click", ping, true);
  document.addEventListener("input", ping, true);
})();



// === FÉRIAS E 13º (Resumo): deltas corretos e só após aplicar reajuste ===
(function(){
  if (window.__FERIAS13_DELTAS_FIX__) return; window.__FERIAS13_DELTAS_FIX__ = true;

  function byId(id){ return document.getElementById(id); }
  function parseBRL(txt){
    var s = (txt||"").replace(/\u00A0/g," ");
    var m = s.match(/(\d{1,3}(\.\d{3})+,\d{2}|\d+,\d{2}|\d+)/);
    if (!m) return 0;
    var raw = m[0].replace(/\./g,"").replace(",","."); 
    var n = Number(raw);
    return isFinite(n) ? n : 0;
  }
  function fmtBRL(n){
    try { return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
    catch(_e){ return "R$ " + (Math.round(n*100)/100).toFixed(2).replace(".",","); }
  }
  function formatDelta(delta, base){
    if (!isFinite(delta)) return "";
    if (!isFinite(base) || Math.abs(base) < 1e-9){
      var sign = delta >= 0 ? "+" : "−";
      return "(" + sign + fmtBRL(Math.abs(delta)) + " | —)";
    }
    var pct = (delta / base) * 100;
    var signAmt = delta >= 0 ? "+" : "−";
    var pctStr = (pct >= 0 ? "+" : "−") + Math.abs(pct).toFixed(2).replace(".", ",") + "%";
    return "(" + signAmt + fmtBRL(Math.abs(delta)) + " | " + pctStr + ")";
  }
  function ensureDeltaEl(valueId, deltaId, cls){
    var valueEl = byId(valueId);
    if (!valueEl) return null;
    var el = byId(deltaId);
    if (el) return el;
    var span = document.createElement("div");
    span.id = deltaId;
    span.className = "delta-right " + cls;
    span.textContent = "";
    valueEl.insertAdjacentElement("afterend", span); // abaixo e à direita (td/right)
    return span;
  }

  function readTotals(){
    // Preferir os totais já prontos se existirem
    var bruto   = byId("ferias13TotBruto");
    var desc    = byId("ferias13TotDesc");
    var liquido = byId("ferias13TotLiquido");
    var v = {
      bruto:   bruto ? parseBRL(bruto.textContent||bruto.innerText||"") : 0,
      desc:    desc ? parseBRL(desc.textContent||desc.innerText||"") : 0,
      liquido: liquido ? parseBRL(liquido.textContent||liquido.innerText||"") : 0
    };
    // Se algum total não existir, somar a partir dos componentes (fallback)
    if (!bruto){
      v.bruto = parseBRL((byId("feriasBruto")||{}).textContent) + parseBRL((byId("decimoBruto")||{}).textContent);
    }
    if (!desc){
      v.desc = parseBRL((byId("feriasDesc")||{}).textContent) + parseBRL((byId("decimoDesc")||{}).textContent);
    }
    if (!liquido){
      v.liquido = parseBRL((byId("feriasLiquido")||{}).textContent) + parseBRL((byId("decimoLiquido")||{}).textContent);
    }
    return v;
  }

  function captureBase(force){
    if (!force && window.__FERIAS13_BASE) return window.__FERIAS13_BASE;
    var b = readTotals();
    window.__FERIAS13_BASE = b;
    return b;
  }

  function showDeltas(){
    var range = byId("reajusteRange");
    var pct = range ? parseFloat(range.value||"0") : 0;
    var applied = !!window.__REAJUSTE_APLICADO__ && Math.abs(pct) > 1e-9;

    var elB = ensureDeltaEl("ferias13TotBruto",   "ferias13TotBrutoDelta",   "delta-blue");
    var elD = ensureDeltaEl("ferias13TotDesc",    "ferias13TotDescDelta",    "delta-red");
    var elL = ensureDeltaEl("ferias13TotLiquido", "ferias13TotLiquidoDelta", "delta-green");
    if (!elB || !elD || !elL) return;

    if (!applied){ elB.textContent = elD.textContent = elL.textContent = ""; return; }

    // Garante que os totais foram reescritos antes de ler
    setTimeout(function(){
      var base = captureBase(false);
      var now  = readTotals();
      var dB = now.bruto   - base.bruto;
      var dD = now.desc    - base.desc;
      var dL = now.liquido - base.liquido;

      elB.textContent = Math.abs(dB) < 0.005 ? "" : formatDelta(dB, base.bruto);
      elD.textContent = Math.abs(dD) < 0.005 ? "" : formatDelta(dD, base.desc);
      elL.textContent = Math.abs(dL) < 0.005 ? "" : formatDelta(dL, base.liquido);
    }, 40);
  }

  function bind(){
    // Captura base após os totais existirem
    setTimeout(function(){ captureBase(true); }, 200);

    var btn = byId("simularReajuste");
    var range = byId("reajusteRange");
    if (btn){
      btn.addEventListener("click", function(){
        var pct = range ? parseFloat(range.value||"0") : 0;
        window.__REAJUSTE_APLICADO__ = Math.abs(pct) > 1e-9;
        showDeltas();
      });
    }
    if (range){
      ["change"].forEach(function(evt){
        range.addEventListener(evt, function(){
          if (Math.abs(parseFloat(range.value||"0")) < 1e-9){
            window.__REAJUSTE_APLICADO__ = false;
          }
          showDeltas();
        });
      });
    }
    // atualizações ocasionais
    document.addEventListener("input", showDeltas, true);
    document.addEventListener("click", showDeltas, true);
    setTimeout(showDeltas, 400);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();



// === FÉRIAS & 13º: DELTAS INLINE (apenas após aplicar; via data-delta + ::after) ===
(function(){
  if (window.__FERIAS13_DELTAS_INLINE__) return; window.__FERIAS13_DELTAS_INLINE__ = true;

  function byId(id){ return document.getElementById(id); }
  function parseBRL(txt){
    var s = (txt||"").replace(/\u00A0/g," ");
    var m = s.match(/(\d{1,3}(\.\d{3})+,\d{2}|\d+,\d{2}|\d+)/);
    if (!m) return 0;
    var raw = m[0].replace(/\./g,"").replace(",",".");
    var n = Number(raw);
    return isFinite(n) ? n : 0;
  }
  function fmtBRL(n){
    try { return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
    catch(_e){ return "R$ " + (Math.round(n*100)/100).toFixed(2).replace(".",","); }
  }
  function setDeltaAttr(id, text){
    var el = byId(id);
    if (!el) return;
    if (text && text.trim()) el.setAttribute("data-delta", text);
    else el.removeAttribute("data-delta");
  }
  function readTotals(){
    var brutoEl   = byId("ferias13TotBruto");
    var descEl    = byId("ferias13TotDesc");
    var liquiEl   = byId("ferias13TotLiquido");
    var bruto = brutoEl ? parseBRL(brutoEl.textContent||brutoEl.innerText||"") : 0;
    var desc  = descEl  ? parseBRL(descEl.textContent||descEl.innerText||"")   : 0;
    var liqui = liquiEl ? parseBRL(liquiEl.textContent||liquiEl.innerText||""): 0;

    // Fallback caso não existam os totais agregados
    if (!brutoEl){
      bruto = parseBRL((byId("feriasBruto")||{}).textContent) + parseBRL((byId("decimoBruto")||{}).textContent);
    }
    if (!descEl){
      desc  = parseBRL((byId("feriasDesc")||{}).textContent) + parseBRL((byId("decimoDesc")||{}).textContent);
    }
    if (!liquiEl){
      liqui = parseBRL((byId("feriasLiquido")||{}).textContent) + parseBRL((byId("decimoLiquido")||{}).textContent);
    }
    return { bruto: bruto, desc: desc, liquido: liqui };
  }
  function formatDelta(delta, base){
    if (!isFinite(delta)) return "";
    if (!isFinite(base) || Math.abs(base) < 1e-9){
      var sign = delta >= 0 ? "+" : "−";
      return "(" + sign + fmtBRL(Math.abs(delta)) + " | —)";
    }
    var pct = (delta / base) * 100;
    var signAmt = delta >= 0 ? "+" : "−";
    var pctStr = (pct >= 0 ? "+" : "−") + Math.abs(pct).toFixed(2).replace(".", ",") + "%";
    return "(" + signAmt + fmtBRL(Math.abs(delta)) + " | " + pctStr + ")";
  }
  function clearInline(){
    setDeltaAttr("ferias13TotBruto", "");
    setDeltaAttr("ferias13TotDesc", "");
    setDeltaAttr("ferias13TotLiquido", "");
  }

  function recalcFerias13DeltasInline(){
    var range = byId("reajusteRange");
    var pct = range ? parseFloat(range.value || "0") : 0;
    var applied = !!window.__REAJUSTE_APLICADO__ && Math.abs(pct) > 1e-9;
    if (!applied){ clearInline(); return; }

    // garanta que os totais foram atualizados antes de ler
    try {
      if (typeof recalcFerias13Totais === "function") recalcFerias13Totais();
    } catch(_e){}
    setTimeout(function(){
      var base = window.__FERIAS13_BASE_INLINE__;
      if (!base){
        // se base ainda não capturada, captura agora e não mostra delta nesta passada
        window.__FERIAS13_BASE_INLINE__ = readTotals();
        clearInline();
        return;
      }
      var now = readTotals();
      var dB = now.bruto - base.bruto;
      var dD = now.desc - base.desc;
      var dL = now.liquido - base.liquido;

      setDeltaAttr("ferias13TotBruto",   Math.abs(dB) < 0.005 ? "" : formatDelta(dB, base.bruto));
      setDeltaAttr("ferias13TotDesc",    Math.abs(dD) < 0.005 ? "" : formatDelta(dD, base.desc));
      setDeltaAttr("ferias13TotLiquido", Math.abs(dL) < 0.005 ? "" : formatDelta(dL, base.liquido));
    }, 40);
  }
  window.recalcFerias13DeltasInline = recalcFerias13DeltasInline;

  function bind(){
    // captura base após a primeira composição dos totais
    setTimeout(function(){ window.__FERIAS13_BASE_INLINE__ = readTotals(); }, 300);

    var btn = byId("simularReajuste");
    var range = byId("reajusteRange");
    if (btn){
      btn.addEventListener("click", function(){
        var pct = range ? parseFloat(range.value||"0") : 0;
        window.__REAJUSTE_APLICADO__ = Math.abs(pct) > 1e-9;
        recalcFerias13DeltasInline();
        setTimeout(recalcFerias13DeltasInline, 120);
      });
    }
    if (range){
      ["change"].forEach(function(evt){
        range.addEventListener(evt, function(){
          if (Math.abs(parseFloat(range.value||"0")) < 1e-9){
            window.__REAJUSTE_APLICADO__ = false;
          }
          recalcFerias13DeltasInline();
        });
      });
    }

    // Tentativas iniciais
    setTimeout(recalcFerias13DeltasInline, 500);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();



// === FÉRIAS & 13º: DELTAS INLINE robustos com MutationObserver ===
(function(){
  if (window.__FERIAS13_DELTAS_OBS__) return; window.__FERIAS13_DELTAS_OBS__ = true;

  function byId(id){ return document.getElementById(id); }
  function parseBRL(txt){
    var s = (txt||"").replace(/\u00A0/g," ");
    var m = s.match(/(\d{1,3}(\.\d{3})+,\d{2}|\d+,\d{2}|\d+)/);
    if (!m) return 0;
    var raw = m[0].replace(/\./g,"").replace(",","."); 
    var n = Number(raw);
    return isFinite(n) ? n : 0;
  }
  function fmtBRL(n){
    try { return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
    catch(_e){ return "R$ " + (Math.round(n*100)/100).toFixed(2).replace(".",","); }
  }
  function setDeltaAttr(id, text){
    var el = byId(id);
    if (!el) return;
    if (text && text.trim()) el.setAttribute("data-delta", text);
    else el.removeAttribute("data-delta");
  }
  function readTotals(){
    var brutoEl   = byId("ferias13TotBruto");
    var descEl    = byId("ferias13TotDesc");
    var liquiEl   = byId("ferias13TotLiquido");
    var bruto = brutoEl ? parseBRL(brutoEl.textContent||brutoEl.innerText||"") : 0;
    var desc  = descEl  ? parseBRL(descEl.textContent||descEl.innerText||"")   : 0;
    var liqui = liquiEl ? parseBRL(liquiEl.textContent||liquiEl.innerText||""): 0;

    if (!brutoEl){
      bruto = parseBRL((byId("feriasBruto")||{}).textContent) + parseBRL((byId("decimoBruto")||{}).textContent);
    }
    if (!descEl){
      desc  = parseBRL((byId("feriasDesc")||{}).textContent) + parseBRL((byId("decimoDesc")||{}).textContent);
    }
    if (!liquiEl){
      liqui = parseBRL((byId("feriasLiquido")||{}).textContent) + parseBRL((byId("decimoLiquido")||{}).textContent);
    }
    return { bruto: bruto, desc: desc, liquido: liqui };
  }
  function formatDelta(delta, base){
    if (!isFinite(delta)) return "";
    if (!isFinite(base) || Math.abs(base) < 1e-9){
      var sign = delta >= 0 ? "+" : "−";
      return "(" + sign + fmtBRL(Math.abs(delta)) + " | —)";
    }
    var pct = (delta / base) * 100;
    var signAmt = delta >= 0 ? "+" : "−";
    var pctStr = (pct >= 0 ? "+" : "−") + Math.abs(pct).toFixed(2).replace(".", ",") + "%";
    return "(" + signAmt + fmtBRL(Math.abs(delta)) + " | " + pctStr + ")";
  }

  function ensureBase(forceIfZero){
    var base = window.__FERIAS13_BASE_INLINE__ || {bruto:0,desc:0,liquido:0};
    if (!window.__FERIAS13_BASE_INLINE__ || (forceIfZero && (base.bruto===0 && base.desc===0 && base.liquido===0))){
      // tenta capturar com um pequeno atraso para garantir preenchimento
      base = readTotals();
      // só fixa base se houver números plausíveis (evita capturar tudo 0)
      if ((base.bruto+base.desc+base.liquido) > 0.01){
        window.__FERIAS13_BASE_INLINE__ = base;
      }
    }
    return window.__FERIAS13_BASE_INLINE__ || base;
  }

  function recompute(){
    var range = byId("reajusteRange");
    var pct = range ? parseFloat(range.value||"0") : 0;
    var applied = !!window.__REAJUSTE_APLICADO__ && Math.abs(pct) > 1e-9;
    if (!applied){
      setDeltaAttr("ferias13TotBruto","");
      setDeltaAttr("ferias13TotDesc","");
      setDeltaAttr("ferias13TotLiquido","");
      return;
    }
    var base = ensureBase(false);
    var now  = readTotals();
    if (!base || !now) return;

    var dB = now.bruto   - base.bruto;
    var dD = now.desc    - base.desc;
    var dL = now.liquido - base.liquido;

    setDeltaAttr("ferias13TotBruto",   Math.abs(dB) < 0.005 ? "" : formatDelta(dB, base.bruto));
    setDeltaAttr("ferias13TotDesc",    Math.abs(dD) < 0.005 ? "" : formatDelta(dD, base.desc));
    setDeltaAttr("ferias13TotLiquido", Math.abs(dL) < 0.005 ? "" : formatDelta(dL, base.liquido));
  }

  // MutationObserver para re-aplicar os deltas sempre que os textos forem reescritos
  function observeTargets(){
    var targets = ["ferias13TotBruto","ferias13TotDesc","ferias13TotLiquido"]
      .map(function(id){ return byId(id); })
      .filter(Boolean);
    if (!targets.length) return;
    var obs = new MutationObserver(function(_){ recompute(); });
    targets.forEach(function(el){
      obs.observe(el, {characterData:true, subtree:true, childList:true});
    });
    // guarda pra possível uso futuro
    window.__FERIAS13_OBS = obs;
  }

  function bind(){
    // Atraso breve para garantir que os totais iniciais existam e capturar base não-zero
    setTimeout(function(){ ensureBase(true); recompute(); observeTargets(); }, 400);

    var btn = byId("simularReajuste");
    var range = byId("reajusteRange");
    if (btn){
      btn.addEventListener("click", function(){
        var pct = range ? parseFloat(range.value||"0") : 0;
        window.__REAJUSTE_APLICADO__ = Math.abs(pct) > 1e-9;
        setTimeout(recompute, 20);
        setTimeout(recompute, 150);
      });
    }
    if (range){
      ["change","input"].forEach(function(evt){
        range.addEventListener(evt, function(){
          if (Math.abs(parseFloat(range.value||"0")) < 1e-9){
            window.__REAJUSTE_APLICADO__ = false;
          }
          setTimeout(recompute, 20);
        });
      });
    }
    document.addEventListener("click", function(){ setTimeout(recompute, 20); }, true);
    document.addEventListener("input", function(){ setTimeout(recompute, 20); }, true);

    // Expor para debug manual
    window.debugFerias13Deltas = function(){
      var base = window.__FERIAS13_BASE_INLINE__;
      var now = readTotals();
      console.log("Férias&13º DELTAS DEBUG =>", {base:base, now:now});
      recompute();
      return {
        bruto: document.getElementById("ferias13TotBruto")?.getAttribute("data-delta"),
        desc:  document.getElementById("ferias13TotDesc")?.getAttribute("data-delta"),
        liq:   document.getElementById("ferias13TotLiquido")?.getAttribute("data-delta"),
      };
    };
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();



// === FÉRIAS & 13º: Base capture fix (v146) ===
(function(){
  if (window.__FERIAS13_BASEFIX__) return; window.__FERIAS13_BASEFIX__ = true;

  function byId(id){ return document.getElementById(id); }
  function parseBRL(txt){
    var s = (txt||"").replace(/\u00A0/g," ");
    var m = s.match(/(\d{1,3}(\.\d{3})+,\d{2}|\d+,\d{2}|\d+)/);
    if (!m) return 0;
    var raw = m[0].replace(/\./g,"").replace(",","."); 
    var n = Number(raw);
    return isFinite(n) ? n : 0;
  }
  function readTotals(){
    var brutoEl = byId("ferias13TotBruto");
    var descEl  = byId("ferias13TotDesc");
    var liqEl   = byId("ferias13TotLiquido");
    var bruto = brutoEl ? parseBRL(brutoEl.textContent||brutoEl.innerText||"") : 0;
    var desc  = descEl  ? parseBRL(descEl.textContent||descEl.innerText||"")   : 0;
    var liq   = liqEl   ? parseBRL(liqEl.textContent||liqEl.innerText||"")     : 0;
    if (!brutoEl){
      bruto = parseBRL((byId("feriasBruto")||{}).textContent) + parseBRL((byId("decimoBruto")||{}).textContent);
    }
    if (!descEl){
      desc  = parseBRL((byId("feriasDesc")||{}).textContent) + parseBRL((byId("decimoDesc")||{}).textContent);
    }
    if (!liqEl){
      liq   = parseBRL((byId("feriasLiquido")||{}).textContent) + parseBRL((byId("decimoLiquido")||{}).textContent);
    }
    return {bruto:bruto, desc:desc, liquido:liq};
  }
  function sum(v){ return (v?.bruto||0)+(v?.desc||0)+(v?.liquido||0); }

  // Polling até base != 0 (para páginas que demoram a renderizar)
  function waitBaseNonZero(timeoutMs){
    var started = Date.now();
    function tryOnce(){
      var v = readTotals();
      if (sum(v) > 0.01){
        window.__FERIAS13_BASE_INLINE__ = v;
        return true;
      }
      if (Date.now() - started > timeoutMs) return false;
      setTimeout(tryOnce, 150);
      return null;
    }
    return tryOnce();
  }

  // Observer no container para capturar base assim que números surgirem
  function observeForBase(){
    var host = byId("ferias13Box") || document.body;
    try{
      var mo = new MutationObserver(function(_){
        if (!window.__FERIAS13_BASE_INLINE__ || sum(window.__FERIAS13_BASE_INLINE__) <= 0.01){
          var ok = waitBaseNonZero(0); // tentativa imediata
          if (ok) { mo.disconnect(); }
        }
      });
      mo.observe(host, {childList:true, subtree:true, characterData:true});
      window.__FERIAS13_BASE_OBS = mo;
    }catch(_e){}
  }

  function bindBaseFix(){
    // 1) Poll por até 5s
    var done = waitBaseNonZero(5000);
    if (!done){ observeForBase(); }

    // 2) No clique de aplicar, se base ainda 0, captura antes da alteração
    var btn = byId("simularReajuste");
    var range = byId("reajusteRange");
    if (btn){
      btn.addEventListener("click", function(){
        var pct = range ? parseFloat(range.value||"0") : 0;
        // Se base não existe ou é 0, snapshot antes da atualização
        if (!window.__FERIAS13_BASE_INLINE__ || sum(window.__FERIAS13_BASE_INLINE__) <= 0.01){
          window.__FERIAS13_BASE_INLINE__ = readTotals();
        }
        // marca aplicado
        window.__REAJUSTE_APLICADO__ = Math.abs(pct) > 1e-9;
        // deixa o restante do pipeline recalcular os deltas
        try{
          if (typeof recalcFerias13DeltasInline === "function"){ setTimeout(recalcFerias13DeltasInline, 120); }
          if (typeof debugFerias13Deltas === "function"){ setTimeout(debugFerias13Deltas, 200); }
        }catch(_e){}
      });
    }

    // Se slider voltar a 0 e aplicar, mantemos a base (para futuras simulações)
    if (range){
      range.addEventListener("change", function(){
        if (Math.abs(parseFloat(range.value||"0")) < 1e-9){
          window.__REAJUSTE_APLICADO__ = false;
          // não apagamos a base; deltas serão limpos pela lógica existente
        }
      });
    }
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bindBaseFix);
  } else {
    bindBaseFix();
  }
})();



// === v147: Férias&13º deltas sem depender do flag aplicado; usa diferença real ===
(function(){
  if (window.__FERIAS13_DIF_MONITOR__) return; window.__FERIAS13_DIF_MONITOR__ = true;
  function byId(id){ return document.getElementById(id); }
  function parseBRL(txt){
    var s = (txt||"").replace(/\u00A0/g," ");
    var m = s.match(/(\d{1,3}(\.\d{3})+,\d{2}|\d+,\d{2}|\d+)/);
    if (!m) return 0;
    var raw = m[0].replace(/\./g,"").replace(",","."); 
    var n = Number(raw);
    return isFinite(n) ? n : 0;
  }
  function fmtBRL(n){
    try{ return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
    catch(_){ return "R$ " + (Math.round(n*100)/100).toFixed(2).replace(".",","); }
  }
  function setDeltaAttr(id, text){
    var el = byId(id); if (!el) return;
    if (text && text.trim()) el.setAttribute("data-delta", text);
    else el.removeAttribute("data-delta");
  }
  function readTotals(){
    var brutoEl = byId("ferias13TotBruto");
    var descEl  = byId("ferias13TotDesc");
    var liqEl   = byId("ferias13TotLiquido");
    var bruto = brutoEl ? parseBRL(brutoEl.textContent||brutoEl.innerText||"") : 0;
    var desc  = descEl  ? parseBRL(descEl.textContent||descEl.innerText||"")   : 0;
    var liq   = liqEl   ? parseBRL(liqEl.textContent||liqEl.innerText||"")     : 0;
    if (!brutoEl){
      bruto = parseBRL((byId("feriasBruto")||{}).textContent) + parseBRL((byId("decimoBruto")||{}).textContent);
    }
    if (!descEl){
      desc  = parseBRL((byId("feriasDesc")||{}).textContent) + parseBRL((byId("decimoDesc")||{}).textContent);
    }
    if (!liqEl){
      liq   = parseBRL((byId("feriasLiquido")||{}).textContent) + parseBRL((byId("decimoLiquido")||{}).textContent);
    }
    return {bruto:bruto, desc:desc, liquido:liq};
  }
  function sum(v){ return (v?.bruto||0)+(v?.desc||0)+(v?.liquido||0); }
  function formatDelta(delta, base){
    if (!isFinite(delta)) return "";
    if (!isFinite(base) || Math.abs(base) < 1e-9){
      var sign = delta >= 0 ? "+" : "−";
      return "(" + sign + fmtBRL(Math.abs(delta)) + " | —)";
    }
    var pct = (delta / base) * 100;
    var signAmt = delta >= 0 ? "+" : "−";
    var pctStr = (pct >= 0 ? "+" : "−") + Math.abs(pct).toFixed(2).replace(".", ",") + "%";
    return "(" + signAmt + fmtBRL(Math.abs(delta)) + " | " + pctStr + ")";
  }

  function ensureBase(){
    var base = window.__FERIAS13_BASE_INLINE__;
    if (!base || sum(base) <= 0.01){
      base = readTotals();
      if (sum(base) > 0.01){
        window.__FERIAS13_BASE_INLINE__ = base;
      }
    }
    return window.__FERIAS13_BASE_INLINE__ || {bruto:0,desc:0,liquido:0};
  }

  function recomputeByDiff(){
    var base = ensureBase();
    var now  = readTotals();
    var dB = now.bruto   - base.bruto;
    var dD = now.desc    - base.desc;
    var dL = now.liquido - base.liquido;
    setDeltaAttr("ferias13TotBruto",   Math.abs(dB) < 0.005 ? "" : formatDelta(dB, base.bruto));
    setDeltaAttr("ferias13TotDesc",    Math.abs(dD) < 0.005 ? "" : formatDelta(dD, base.desc));
    setDeltaAttr("ferias13TotLiquido", Math.abs(dL) < 0.005 ? "" : formatDelta(dL, base.liquido));
  }

  // Observe o container inteiro da seção
  function observeFerias13(){
    var root = byId("ferias13Box") || document.body;
    try{
      var mo = new MutationObserver(function(){ setTimeout(recomputeByDiff, 10); });
      mo.observe(root, {childList:true, subtree:true, characterData:true});
      window.__FERIAS13_DIFF_OBS = mo;
    }catch(_){}
  }

  function bind(){
    // Snapshot inicial da base quando números aparecerem
    setTimeout(function(){ ensureBase(); recomputeByDiff(); }, 400);
    observeFerias13();

    var btn = document.getElementById("simularReajuste");
    var range = document.getElementById("reajusteRange");
    if (btn){
      btn.addEventListener("click", function(){
        setTimeout(recomputeByDiff, 60);
        setTimeout(recomputeByDiff, 180);
      });
    }
    if (range){
      ["input","change"].forEach(function(evt){
        range.addEventListener(evt, function(){ setTimeout(recomputeByDiff, 60); });
      });
    }
    // Expor debug
    window.debugFerias13DeltasV147 = function(){
      var base = window.__FERIAS13_BASE_INLINE__;
      var now = readTotals();
      recomputeByDiff();
      return {
        base, now,
        attrs: {
          bruto: document.getElementById("ferias13TotBruto")?.getAttribute("data-delta"),
          desc:  document.getElementById("ferias13TotDesc")?.getAttribute("data-delta"),
          liq:   document.getElementById("ferias13TotLiquido")?.getAttribute("data-delta")
        }
      };
    };
  }
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();



// v149 — RESUMO ANUAL: deltas abaixo/direita via data-delta (apenas após aplicar)
(function(){
  if (window.__RESUMO_ANUAL_DATADELTA__) return; window.__RESUMO_ANUAL_DATADELTA__ = true;
  function byId(id){ return document.getElementById(id); }
  function parseBRL(txt){
    var s=(txt||"").replace(/\u00A0/g," ");
    var m=s.match(/(\d{1,3}(\.\d{3})+,\d{2}|\d+,\d{2}|\d+)/);
    if(!m) return 0;
    var raw=m[0].replace(/\./g,"").replace(",","."); var n=Number(raw);
    return isFinite(n)?n:0;
  }
  function fmtBRL(n){
    try{return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}catch(_){return "R$ "+(Math.round(n*100)/100).toFixed(2).replace(".",",");}
  }
  function setDeltaAttr(id, text){
    var el=byId(id); if(!el) return;
    if(text && text.trim()) el.setAttribute("data-delta", text); else el.removeAttribute("data-delta");
  }
  function formatDelta(delta, base){
    if(!isFinite(delta)) return "";
    if(!isFinite(base)||Math.abs(base)<1e-9){
      var sign=delta>=0?"+":"−"; return "("+sign+fmtBRL(Math.abs(delta))+" | —)";
    }
    var pct=(delta/base)*100, signAmt=delta>=0?"+":"−";
    var pctStr=(pct>=0?"+":"−")+Math.abs(pct).toFixed(2).replace(".",",")+"%";
    return "("+signAmt+fmtBRL(Math.abs(delta))+" | "+pctStr+")";
  }
  function readResumo(){
    var P=byId("resumoAnualProventos"), D=byId("resumoAnualDescontos"), L=byId("resumoAnualLiquido");
    if(!P||!D||!L) return null;
    return { prov:parseBRL(P.textContent||P.innerText||""), desc:parseBRL(D.textContent||D.innerText||""), liq:parseBRL(L.textContent||L.innerText||"") };
  }
  function captureBase(){
    if(window.__RESUMO_ANUAL_BASE_DATA) return window.__RESUMO_ANUAL_BASE_DATA;
    var v=readResumo(); if(!v) return null;
    if((v.prov+v.desc+v.liq)>0.01){ window.__RESUMO_ANUAL_BASE_DATA=v; return v; }
    return null;
  }
  function showResumoDeltas(){
    var range=byId("reajusteRange");
    var pct=range?parseFloat(range.value||"0"):0;
    var applied=!!window.__REAJUSTE_APLICADO__ && Math.abs(pct)>1e-9;
    // esconder se não aplicado
    if(!applied){ setDeltaAttr("resumoAnualProventos",""); setDeltaAttr("resumoAnualDescontos",""); setDeltaAttr("resumoAnualLiquido",""); return; }
    // garantir base
    var base=captureBase(); if(!base){ setTimeout(showResumoDeltas,150); return; }
    // ler atuais
    try{
      if (typeof recalcValoresAnuaisFinal === "function") recalcValoresAnuaisFinal();
      else if (typeof recalcValoresAnuaisSimples === "function") recalcValoresAnuaisSimples();
      else if (typeof recalcValoresAnuaisSumRows === "function") recalcValoresAnuaisSumRows();
      else if (typeof recalcValoresAnuais === "function") recalcValoresAnuais();
    }catch(_){}
    var now=readResumo(); if(!now) return;
    var dP=now.prov-base.prov, dD=now.desc-base.desc, dL=now.liq-base.liq;
    setDeltaAttr("resumoAnualProventos",  Math.abs(dP)<0.005?"":formatDelta(dP,base.prov));
    setDeltaAttr("resumoAnualDescontos", Math.abs(dD)<0.005?"":formatDelta(dD,base.desc));
    setDeltaAttr("resumoAnualLiquido",   Math.abs(dL)<0.005?"":formatDelta(dL,base.liq));
  }
  function bind(){
    setTimeout(captureBase,400);
    var btn=byId("simularReajuste"), range=byId("reajusteRange");
    if(btn){ btn.addEventListener("click", function(){ window.__REAJUSTE_APLICADO__ = Math.abs(parseFloat(range?.value||"0"))>1e-9; setTimeout(showResumoDeltas,60); setTimeout(showResumoDeltas,180); }); }
    if(range){ ["change","input"].forEach(function(e){ range.addEventListener(e,function(){ if(Math.abs(parseFloat(range.value||"0"))<1e-9){ window.__REAJUSTE_APLICADO__=false; } setTimeout(showResumoDeltas,60); }); }); }
    // observer para reaplicar após re-render
    var root=byId("resumoAnualBox")||document.body;
    try{ var mo=new MutationObserver(function(){ setTimeout(showResumoDeltas,10); }); mo.observe(root,{childList:true,subtree:true,characterData:true}); window.__RESUMO_ANUAL_OBS=mo; }catch(_){}
  }
  if(document.readyState==="loading"){ document.addEventListener("DOMContentLoaded", bind); } else { bind(); }
})();



// === v150: VALORES ANUAIS — deltas abaixo/direita via data-delta (apenas após aplicar) ===
(function(){
  if (window.__VALORES_ANUAIS_DATADELTA__) return; window.__VALORES_ANUAIS_DATADELTA__ = true;

  function byId(id){ return document.getElementById(id); }
  function parseBRL(txt){
    var s = (txt||"").replace(/\u00A0/g," ");
    var m = s.match(/(\d{1,3}(\.\d{3})+,\d{2}|\d+,\d{2}|\d+)/);
    if (!m) return 0;
    var raw = m[0].replace(/\./g,"").replace(",","."); 
    var n = Number(raw);
    return isFinite(n) ? n : 0;
  }
  function fmtBRL(n){
    try { return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
    catch(_e){ return "R$ " + (Math.round(n*100)/100).toFixed(2).replace(".",","); }
  }
  function setDeltaAttr(id, text){
    var el = byId(id); if (!el) return;
    if (text && text.trim()) el.setAttribute("data-delta", text);
    else el.removeAttribute("data-delta");
  }
  function formatDelta(delta, base){
    if (!isFinite(delta)) return "";
    if (!isFinite(base) || Math.abs(base) < 1e-9){
      var sign = delta >= 0 ? "+" : "−";
      return "(" + sign + fmtBRL(Math.abs(delta)) + " | —)";
    }
    var pct = (delta / base) * 100;
    var signAmt = delta >= 0 ? "+" : "−";
    var pctStr = (pct >= 0 ? "+" : "−") + Math.abs(pct).toFixed(2).replace(".", ",") + "%";
    return "(" + signAmt + fmtBRL(Math.abs(delta)) + " | " + pctStr + ")";
  }

  function readValoresAnuais(){
    var P = byId("valoresAnuaisProventos");
    var D = byId("valoresAnuaisDescontos");
    var L = byId("valoresAnuaisLiquido");
    if (!P || !D || !L) return null;
    return {
      prov: parseBRL(P.textContent || P.innerText || ""),
      desc: parseBRL(D.textContent || D.innerText || ""),
      liq:  parseBRL(L.textContent || L.innerText || ""),
    };
  }

  function captureBase(){
    if (window.__VALORES_ANUAIS_BASE_DATA) return window.__VALORES_ANUAIS_BASE_DATA;
    var v = readValoresAnuais(); if(!v) return null;
    if ((v.prov + v.desc + v.liq) > 0.01){
      window.__VALORES_ANUAIS_BASE_DATA = v;
      return v;
    }
    return null;
  }

  function showValoresAnuaisDeltas(){
    var range = byId("reajusteRange");
    var pct = range ? parseFloat(range.value || "0") : 0;
    var applied = !!window.__REAJUSTE_APLICADO__ && Math.abs(pct) > 1e-9;

    if (!applied){
      setDeltaAttr("valoresAnuaisProventos","");
      setDeltaAttr("valoresAnuaisDescontos","");
      setDeltaAttr("valoresAnuaisLiquido","");
      return;
    }

    // garantir base
    var base = captureBase();
    if (!base){ setTimeout(showValoresAnuaisDeltas, 150); return; }

    // garantir que os totais atuais já foram recalculados
    try {
      if (typeof recalcValoresAnuaisFinal === "function") recalcValoresAnuaisFinal();
      else if (typeof recalcValoresAnuaisSimples === "function") recalcValoresAnuaisSimples();
      else if (typeof recalcValoresAnuaisSumRows === "function") recalcValoresAnuaisSumRows();
      else if (typeof recalcValoresAnuais === "function") recalcValoresAnuais();
    } catch(_e){}

    var now = readValoresAnuais(); if (!now) return;
    var dP = now.prov - base.prov;
    var dD = now.desc - base.desc;
    var dL = now.liq  - base.liq;

    setDeltaAttr("valoresAnuaisProventos",  Math.abs(dP) < 0.005 ? "" : formatDelta(dP, base.prov));
    setDeltaAttr("valoresAnuaisDescontos", Math.abs(dD) < 0.005 ? "" : formatDelta(dD, base.desc));
    setDeltaAttr("valoresAnuaisLiquido",   Math.abs(dL) < 0.005 ? "" : formatDelta(dL, base.liq));
  }

  function observeValoresAnuais(){
    var root = byId("valoresAnuaisBox") || byId("resultado") || document.body;
    try{
      var mo = new MutationObserver(function(){ setTimeout(showValoresAnuaisDeltas, 10); });
      mo.observe(root, {childList:true, subtree:true, characterData:true});
      window.__VALORES_ANUAIS_OBS = mo;
    }catch(_e){}
  }

  function bind(){
    // Capturar base depois que os valores aparecem
    setTimeout(captureBase, 400);

    var btn = byId("simularReajuste");
    var range = byId("reajusteRange");

    if (btn){
      btn.addEventListener("click", function(){
        // marca aplicado
        var pct = range ? parseFloat(range.value || "0") : 0;
        window.__REAJUSTE_APLICADO__ = Math.abs(pct) > 1e-9;
        setTimeout(showValoresAnuaisDeltas, 60);
        setTimeout(showValoresAnuaisDeltas, 180);
      });
    }
    if (range){
      ["change","input"].forEach(function(evt){
        range.addEventListener(evt, function(){
          if (Math.abs(parseFloat(range.value||"0")) < 1e-9){
            window.__REAJUSTE_APLICADO__ = false;
          }
          setTimeout(showValoresAnuaisDeltas, 60);
        });
      });
    }
    observeValoresAnuais();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();



// === v151: Console helper — debugValoresAnuaisDeltas() ===
(function(){
  if (window.__VAL_ANUAIS_DEBUG__) return; window.__VAL_ANUAIS_DEBUG__ = true;
  function byId(id){ return document.getElementById(id); }
  function parseBRL(txt){
    var s = (txt||"").replace(/\u00A0/g," ");
    var m = s.match(/(\d{1,3}(\.\d{3})+,\d{2}|\d+,\d{2}|\d+)/);
    if (!m) return 0;
    var raw = m[0].replace(/\./g,"").replace(",","."); 
    var n = Number(raw);
    return isFinite(n) ? n : 0;
  }
  function fmtBRL(n){
    try { return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
    catch(_e){ return "R$ " + (Math.round(n*100)/100).toFixed(2).replace(".",","); }
  }
  function setDeltaAttr(id, text){
    var el = byId(id); if (!el) return;
    if (text && text.trim()) el.setAttribute("data-delta", text);
    else el.removeAttribute("data-delta");
  }
  function formatDelta(delta, base){
    if (!isFinite(delta)) return "";
    if (!isFinite(base) || Math.abs(base) < 1e-9){
      var sign = delta >= 0 ? "+" : "−";
      return "(" + sign + fmtBRL(Math.abs(delta)) + " | —)";
    }
    var pct = (delta / base) * 100;
    var signAmt = delta >= 0 ? "+" : "−";
    var pctStr = (pct >= 0 ? "+" : "−") + Math.abs(pct).toFixed(2).replace(".", ",") + "%";
    return "(" + signAmt + fmtBRL(Math.abs(delta)) + " | " + pctStr + ")";
  }
  function readValoresAnuais(){
    var P = byId("valoresAnuaisProventos");
    var D = byId("valoresAnuaisDescontos");
    var L = byId("valoresAnuaisLiquido");
    if (!P || !D || !L) return null;
    return {
      prov: parseBRL(P.textContent || P.innerText || ""),
      desc: parseBRL(D.textContent || D.innerText || ""),
      liq:  parseBRL(L.textContent || L.innerText || ""),
    };
  }
  function ensureBase(){
    var base = window.__VALORES_ANUAIS_BASE_DATA;
    if (!base || (base.prov+base.desc+base.liq) <= 0.01){
      var v = readValoresAnuais();
      if (v && (v.prov+v.desc+v.liq) > 0.01){
        window.__VALORES_ANUAIS_BASE_DATA = v;
        base = v;
      }
    }
    return base || {prov:0,desc:0,liq:0};
  }

  window.debugValoresAnuaisDeltas = function(){
    var base = ensureBase();
    // tentar garantir que os valores atuais estejam recalculados
    try {
      if (typeof recalcValoresAnuaisFinal === "function") recalcValoresAnuaisFinal();
      else if (typeof recalcValoresAnuaisSimples === "function") recalcValoresAnuaisSimples();
      else if (typeof recalcValoresAnuaisSumRows === "function") recalcValoresAnuaisSumRows();
      else if (typeof recalcValoresAnuais === "function") recalcValoresAnuais();
    } catch(_e){}

    var now = readValoresAnuais() || {prov:0,desc:0,liq:0};
    var dP = now.prov - base.prov;
    var dD = now.desc - base.desc;
    var dL = now.liq  - base.liq;

    setDeltaAttr("valoresAnuaisProventos",  Math.abs(dP) < 0.005 ? "" : formatDelta(dP, base.prov));
    setDeltaAttr("valoresAnuaisDescontos", Math.abs(dD) < 0.005 ? "" : formatDelta(dD, base.desc));
    setDeltaAttr("valoresAnuaisLiquido",   Math.abs(dL) < 0.005 ? "" : formatDelta(dL, base.liq));

    var attrs = {
      prov: byId("valoresAnuaisProventos")?.getAttribute("data-delta"),
      desc: byId("valoresAnuaisDescontos")?.getAttribute("data-delta"),
      liq:  byId("valoresAnuaisLiquido")?.getAttribute("data-delta"),
    };
    console.log("VALORES ANUAIS DELTAS DEBUG =>", { base, now, attrs, applied: !!window.__REAJUSTE_APLICADO__ });
    return { base, now, attrs };
  };
})();



// === v152: VALORES ANUAIS — detecção robusta de "aplicar" + delta zero visível ===
(function(){
  if (window.__VALORES_ANUAIS_V152__) return; window.__VALORES_ANUAIS_V152__ = true;

  function byId(id){ return document.getElementById(id); }
  function parseBRL(txt){
    var s=(txt||"").replace(/\u00A0/g," ");
    var m=s.match(/(\d{1,3}(\.\d{3})+,\d{2}|\d+,\d{2}|\d+)/);
    if(!m) return 0;
    var raw=m[0].replace(/\./g,"").replace(",","."); var n=Number(raw);
    return isFinite(n)?n:0;
  }
  function fmtBRL(n){
    try{return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}catch(_){return "R$ "+(Math.round(n*100)/100).toFixed(2).replace(".",",");}
  }
  function setDeltaAttr(id, text){
    var el = byId(id); if (!el) return;
    if (text!=null) el.setAttribute("data-delta", String(text));
    else el.removeAttribute("data-delta");
  }
  function formatDelta(delta, base){
    if (!isFinite(delta)) return "";
    var pct = (isFinite(base)&&Math.abs(base)>1e-9) ? (delta/base*100) : NaN;
    var signAmt = delta >= 0 ? "+" : "−";
    var amt = fmtBRL(Math.abs(delta));
    var pctStr = isFinite(pct) ? ((pct>=0?"+":"−")+Math.abs(pct).toFixed(2).replace(".", ",")+"%") : "—";
    return "(" + signAmt + amt + " | " + pctStr + ")";
  }
  function readValoresAnuais(){
    var P=byId("valoresAnuaisProventos"), D=byId("valoresAnuaisDescontos"), L=byId("valoresAnuaisLiquido");
    if(!P||!D||!L) return null;
    return { prov:parseBRL(P.textContent||P.innerText||""), desc:parseBRL(D.textContent||D.innerText||""), liq:parseBRL(L.textContent||L.innerText||"") };
  }
  function ensureBase(){
    var base = window.__VALORES_ANUAIS_BASE_DATA;
    if (!base || (base.prov+base.desc+base.liq)<=0.01){
      var v = readValoresAnuais();
      if (v && (v.prov+v.desc+v.liq)>0.01){ window.__VALORES_ANUAIS_BASE_DATA=v; base=v; }
    }
    return base || {prov:0,desc:0,liq:0};
  }
  function difSum(a,b){ return Math.abs((a?.prov||0)-(b?.prov||0)) + Math.abs((a?.desc||0)-(b?.desc||0)) + Math.abs((a?.liq||0)-(b?.liq||0)); }

  function showValoresAnuaisDeltas_v152(){
    var base = ensureBase();
    var now = readValoresAnuais();
    if (!now){ setDeltaAttr("valoresAnuaisProventos",null); setDeltaAttr("valoresAnuaisDescontos",null); setDeltaAttr("valoresAnuaisLiquido",null); return; }

    // Detectar "aplicado": flag OU diferença real contra a base (protege em caso de id de botão diferente)
    var range = byId("reajusteRange");
    var pct = range ? parseFloat(range.value||"0") : NaN;
    var appliedFlag = !!window.__REAJUSTE_APLICADO__ && isFinite(pct) && Math.abs(pct)>1e-9;
    var diffDetected = difSum(now, base) > 0.01;
    var appliedDetected = appliedFlag || diffDetected;

    if (!appliedDetected){
      // Sem aplicar: limpa atributos
      setDeltaAttr("valoresAnuaisProventos", null);
      setDeltaAttr("valoresAnuaisDescontos", null);
      setDeltaAttr("valoresAnuaisLiquido", null);
      return;
    }

    var dP = now.prov - base.prov;
    var dD = now.desc - base.desc;
    var dL = now.liq  - base.liq;

    // Após aplicar, mostramos mesmo se ~0: exibir (+R$ 0,00 | +0,00%)
    setDeltaAttr("valoresAnuaisProventos",  formatDelta(dP, base.prov));
    setDeltaAttr("valoresAnuaisDescontos",  formatDelta(dD, base.desc));
    setDeltaAttr("valoresAnuaisLiquido",    formatDelta(dL, base.liq));
  }
  window.showValoresAnuaisDeltas_v152 = showValoresAnuaisDeltas_v152;

  function bind(){
    // Observa mudanças no bloco para reaplicar automaticamente
    var root = byId("valoresAnuaisBox") || byId("resultado") || document.body;
    try{
      var mo = new MutationObserver(function(){ setTimeout(showValoresAnuaisDeltas_v152, 10); });
      mo.observe(root, {childList:true, subtree:true, characterData:true});
      window.__VALORES_ANUAIS_OBS_V152 = mo;
    }catch(_){}
    // Botão aplicar (se existir)
    var btn = byId("simularReajuste");
    var range = byId("reajusteRange");
    if(btn){
      btn.addEventListener("click", function(){
        if (range){ window.__REAJUSTE_APLICADO__ = Math.abs(parseFloat(range.value||"0"))>1e-9; }
        setTimeout(showValoresAnuaisDeltas_v152, 60);
        setTimeout(showValoresAnuaisDeltas_v152, 180);
      });
    }
    if(range){
      ["input","change"].forEach(function(evt){
        range.addEventListener(evt, function(){ setTimeout(showValoresAnuaisDeltas_v152, 60); });
      });
    }
    setTimeout(showValoresAnuaisDeltas_v152, 400);
  }
  if (document.readyState === "loading"){ document.addEventListener("DOMContentLoaded", bind); } else { bind(); }

  // Debug avançado
  window.debugValoresAnuaisDeltasV152 = function(){
    var base = ensureBase();
    var now = readValoresAnuais();
    var range = byId("reajusteRange");
    var pct = range ? parseFloat(range.value||"0") : NaN;
    var appliedFlag = !!window.__REAJUSTE_APLICADO__ && isFinite(pct) && Math.abs(pct)>1e-9;
    var diffDetected = difSum(now, base) > 0.01;
    var attrs = {
      prov: byId("valoresAnuaisProventos")?.getAttribute("data-delta"),
      desc: byId("valoresAnuaisDescontos")?.getAttribute("data-delta"),
      liq:  byId("valoresAnuaisLiquido")?.getAttribute("data-delta"),
    };
    console.log("VALORES ANUAIS v152 DEBUG =>", {base, now, appliedFlag, diffDetected, attrs});
    // força uma atualização imediata
    showValoresAnuaisDeltas_v152();
    // retorna estado pós-força
    attrs = {
      prov: byId("valoresAnuaisProventos")?.getAttribute("data-delta"),
      desc: byId("valoresAnuaisDescontos")?.getAttribute("data-delta"),
      liq:  byId("valoresAnuaisLiquido")?.getAttribute("data-delta"),
    };
    return {base, now, appliedFlag, diffDetected, attrs};
  };
})();



// === v154: Auto F5 ao trocar Posto/Graduação (somente se reajuste foi aplicado) e restaurar apenas o PG ===
(function(){
  if (window.__PG_AUTO_F5_ONLY__) return; window.__PG_AUTO_F5_ONLY__ = true;

  function byId(id){ return document.getElementById(id); }

  // Tenta encontrar o <select> de Posto/Graduação de forma resiliente
  function getPGSelect(){
    var ids = ['postoGraduacao','posto','graduacao','selPosto','selGraduacao','posto-grad','postoGrad','pg','posto_graduacao'];
    for (var i=0;i<ids.length;i++){
      var el = byId(ids[i]);
      if (el && el.tagName === 'SELECT') return el;
    }
    var q = document.querySelector("select[id*='posto' i], select[name*='posto' i], select[id*='grad' i], select[name*='grad' i]");
    return q || null;
  }

  // Decide se há reajuste efetivamente aplicado
  function isReajusteAplicado(){
    var range = byId('reajusteRange');
    var pct = range ? parseFloat(range.value||"0") : NaN;
    // considera aplicado se flag estiver setada ou se o slider estiver != 0
    if (window.__REAJUSTE_APLICADO__ && typeof pct === 'number' && isFinite(pct)) {
      return Math.abs(pct) > 1e-9;
    }
    // fallback: somente slider != 0
    return isFinite(pct) && Math.abs(pct) > 1e-9;
  }

  function savePGAndReload(selectedValue, selectedText){
    var payload = {
      pgValue: selectedValue == null ? null : String(selectedValue),
      pgText:  selectedText == null ? null : String(selectedText),
      ts: Date.now()
    };
    try { localStorage.setItem('persistPGOnly', JSON.stringify(payload)); } catch(_e){}
    try { location.reload(); } catch(_e){ window.location = window.location.href; }
  }

  function restorePG(){
    var raw = null;
    try { raw = localStorage.getItem('persistPGOnly'); } catch(_e){}
    if (!raw) return;
    var data = null;
    try { data = JSON.parse(raw); } catch(_e){ data = null; }
    if (!data) return;

    var sel = getPGSelect();
    if (sel){
      if (data.pgValue != null){
        sel.value = String(data.pgValue);
        if (sel.value !== String(data.pgValue)){
          // fallback por texto
          var targetText = (data.pgText||"").trim().toLowerCase();
          var opt = Array.from(sel.options).find(function(o){ return (o.text||"").trim().toLowerCase() === targetText; });
          if (opt){ sel.value = opt.value; }
        }
        // dispara change para recalcular a página com o PG restaurado
        sel.dispatchEvent(new Event('change', {bubbles:true}));
      }
    }
    try { localStorage.removeItem('persistPGOnly'); } catch(_e){}
  }

  function bind(){
    // restaurar PG ao carregar (sem mexer no percentual)
    if (document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", restorePG);
    } else {
      restorePG();
    }

    // quando o usuário trocar o PG E houver reajuste aplicado, salvar e recarregar
    var sel = getPGSelect();
    if (sel){
      sel.addEventListener('change', function(){
        if (!isReajusteAplicado()) return;
        var val = sel.value;
        var txt = sel.options[sel.selectedIndex]?.text || "";
        savePGAndReload(val, txt);
      });
    }
  }

  bind();
})();



// v157 — Forçar "RESUMO ANUAL" em amarelo dentro de #resumoAnualBox
(function(){
  if (window.__RESUMO_ANUAL_TIT_YELLOW__) return; window.__RESUMO_ANUAL_TIT_YELLOW__ = true;

  function byId(id){ return document.getElementById(id); }
  function markResumoTitle(){
    var root = byId('resumoAnualBox');
    if (!root) return;
    // candidatos comuns a título
    var nodes = root.querySelectorAll('h1, h2, h3, h4, h5, .section-title, .title, .card-title, .box-title');
    var rx = /resumo\s*anual/i;
    nodes.forEach(function(n){
      var txt = (n.textContent || "").trim();
      if (rx.test(txt)){
        n.classList.add('resumo-annual-title');
      }
    });
  }
  function bind(){
    // tentativa imediata
    markResumoTitle();
    // atraso breve para cenários com render assíncrono
    setTimeout(markResumoTitle, 120);
    setTimeout(markResumoTitle, 400);

    // Observer para reaplicar em re-render dinâmico
    var root = byId('resumoAnualBox') || document.body;
    try{
      var mo = new MutationObserver(function(){ setTimeout(markResumoTitle, 10); });
      mo.observe(root, {childList:true, subtree:true, characterData:true});
      window.__RESUMO_ANUAL_TIT_MO__ = mo;
    }catch(_e){}
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();



// === v169: Auto F5 + restauração robusta (PG/Dependentes/Associações/IPASGO),
//            mas SÓ recarrega se Posto/Graduação não estiver em "Selecione..." ===
(function(){
  if (window.__AUTOREFRESH_RESTORE_V169__) return; window.__AUTOREFRESH_RESTORE_V169__ = true;

  var STORE_KEY = 'persistEntrada_v169';
  var RESTORE_WINDOW_MS = 2000;
  var restoring = false;

  function byId(id){ return document.getElementById(id); }

  // Localiza o select de Posto/Graduação (PG)
  function getPGSelect(){
    var ids = ['postoGraduacao','posto','graduacao','selPosto','selGraduacao','posto-grad','postoGrad','pg','posto_graduacao','pgSelect'];
    for (var i=0;i<ids.length;i++){
      var el = byId(ids[i]);
      if (el && el.tagName === 'SELECT') return el;
    }
    return document.querySelector("select[id*='posto' i], select[name*='posto' i], select[id*='grad' i], select[name*='grad' i], select[id*='pg' i], select[name*='pg' i]") || null;
  }

  // PG é válido (não está em "Selecione...")?
  function isPGValid(){
    var sel = getPGSelect();
    if (!sel) return true; // se não existe PG, não bloqueia
    var val = (sel.value || '').trim().toLowerCase();
    var txt = '';
    try { txt = (sel.options && sel.options[sel.selectedIndex] ? (sel.options[sel.selectedIndex].text || '') : '').trim().toLowerCase(); } catch(_){}
    if (!val || val === '0' || /selecion/.test(val) || /selecion/.test(txt)) return false;
    return true;
  }

  // Heurísticas para achar os 4 campos monitorados
  function isCandidate(el, kind){
    if (!el) return false;
    var idn = (el.id||'') + ' ' + (el.name||'');
    if (kind === 'pg'){
      if (el.tagName === 'SELECT' && /posto|grad|pg/i.test(idn)) return true;
      try{
        var t = (el.options && el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '').toLowerCase();
        if (/soldado|cabo|sargento|tenente|capit|major|coronel|cel|cbmgo/.test(t)) return true;
      }catch(_){}
      return false;
    }
    if (kind === 'dependentes') return /depend/i.test(idn);
    if (kind === 'associacoes') return /associa/i.test(idn);
    if (kind === 'ipasgo')      return /ipasgo|plano|saude/i.test(idn);
    return false;
  }
  function findField(kind){
    if (kind === 'pg') return getPGSelect() || Array.from(document.querySelectorAll('select')).find(s=>isCandidate(s,'pg')) || null;
    return Array.from(document.querySelectorAll('input,select')).find(el=>isCandidate(el, kind)) || null;
  }
  function findFields(){
    return {
      pg:           findField('pg'),
      dependentes:  findField('dependentes'),
      associacoes:  findField('associacoes'),
      ipasgo:       findField('ipasgo')
    };
  }

  function readEntry(el){
    if (!el) return null;
    var t = (el.type||'').toLowerCase();
    var e = { tag: el.tagName, id: el.id || null, name: el.name || null, type: t || null };
    if (t === 'checkbox' || t === 'radio'){
      e.checked = !!el.checked;
      e.value = el.value != null ? String(el.value) : null;
    } else if (el.tagName === 'SELECT'){
      e.value = el.value != null ? String(el.value) : null;
      e.selectedIndex = typeof el.selectedIndex === 'number' ? el.selectedIndex : null;
      try { e.selectedText = el.options && el.options[el.selectedIndex] ? (el.options[el.selectedIndex].text || null) : null; } catch(_){ e.selectedText = null; }
    } else {
      e.value = el.value != null ? String(el.value) : (el.textContent || null);
    }
    return e;
  }
  function takeSnapshot(){
    var f = findFields();
    return { ts: Date.now(), fields: {
      pg: readEntry(f.pg),
      dependentes: readEntry(f.dependentes),
      associacoes: readEntry(f.associacoes),
      ipasgo: readEntry(f.ipasgo)
    }};
  }

  function restoreToElement(el, entry){
    if (!el || !entry) return;
    var t = (el.type||'').toLowerCase();
    if (t === 'checkbox' || t === 'radio'){
      if (entry.value != null){ el.checked = (String(el.value) === String(entry.value)) ? !!entry.checked : el.checked; }
      else { el.checked = !!entry.checked; }
    } else if (el.tagName === 'SELECT'){
      var ok = false;
      if (entry.value != null){
        el.value = String(entry.value);
        ok = (el.value === String(entry.value));
      }
      if (!ok && entry.selectedText){
        var want = (entry.selectedText||'').trim().toLowerCase();
        var opt = Array.from(el.options||[]).find(o => (o.text||'').trim().toLowerCase() === want);
        if (opt){ el.value = opt.value; ok = true; }
      }
      if (!ok && entry.selectedIndex != null){ el.selectedIndex = entry.selectedIndex; }
    } else {
      if (entry.value != null) el.value = String(entry.value);
    }
    try { el.dispatchEvent(new Event('input',  {bubbles:true})); } catch(_){}
    try { el.dispatchEvent(new Event('change', {bubbles:true})); } catch(_){}
  }

  function restoreSnapshot(){
    var raw = null, data = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch(_){}
    if (!raw) return;
    try { data = JSON.parse(raw); } catch(_){ data = null; }
    if (!data || !data.fields) return;

    restoring = true;
    var deadline = Date.now() + RESTORE_WINDOW_MS;

    function applyOnce(){
      var f = findFields();
      restoreToElement(f.pg,          data.fields.pg);
      restoreToElement(f.dependentes, data.fields.dependentes);
      restoreToElement(f.associacoes, data.fields.associacoes);
      restoreToElement(f.ipasgo,      data.fields.ipasgo);
    }

    applyOnce();
    setTimeout(applyOnce, 50);
    setTimeout(applyOnce, 150);
    setTimeout(applyOnce, 400);
    setTimeout(applyOnce, 900);
    setTimeout(applyOnce, 1400);

    try {
      var mo = new MutationObserver(function(){
        if (Date.now() > deadline) { try { mo.disconnect(); } catch(_) {} return; }
        applyOnce();
      });
      mo.observe(document.body, {childList:true, subtree:true, characterData:true});
      setTimeout(function(){ try { mo.disconnect(); } catch(_) {} }, RESTORE_WINDOW_MS + 200);
    } catch(_){}

    setTimeout(function(){
      try { localStorage.removeItem(STORE_KEY); } catch(_){}
      restoring = false;
    }, RESTORE_WINDOW_MS + 250);
  }

  function saveSnapshotAndReloadIfAllowed(){
    // SÓ recarrega se PG já estiver definido (não "Selecione...")
    if (!isPGValid()) return;
    if (restoring) return;
    var snap = takeSnapshot();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(snap)); } catch(_){}
    try { location.reload(); } catch(_){ window.location = window.location.href; }
  }

  function onMaybeWatched(ev){
    var t = ev.target;
    if (!t || !t.tagName) return;
    if (restoring) return; // evita loop
    var idn = (t.id||'') + ' ' + (t.name||'');
    var isWatched = /depend|associa|ipasgo|plano|saude|posto|grad|pg/i.test(idn) || t === getPGSelect();
    if (isWatched){ saveSnapshotAndReloadIfAllowed(); }
  }

  function start(){
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', restoreSnapshot);
    } else {
      restoreSnapshot();
    }
    document.addEventListener('change', onMaybeWatched, true);
    document.addEventListener('blur', onMaybeWatched, true);
  }
  start();

  // Debug
  window.debugEntradaV169 = function(){
    var f = findFields();
    return {
      isPGValid: isPGValid(),
      snapshotNow: takeSnapshot(),
      found: {
        pg: !!f.pg, dependentes: !!f.dependentes, associacoes: !!f.associacoes, ipasgo: !!f.ipasgo
      },
      nodes: {
        pg: f.pg && (f.pg.id || f.pg.name || f.pg.tagName),
        dependentes: f.dependentes && (f.dependentes.id || f.dependentes.name || f.dependentes.tagName),
        associacoes: f.associacoes && (f.associacoes.id || f.associacoes.name || f.associacoes.tagName),
        ipasgo: f.ipasgo && (f.ipasgo.id || f.ipasgo.name || f.ipasgo.tagName)
      },
      stored: (function(){ try { return localStorage.getItem(STORE_KEY); } catch(_){ return null; } })()
    };
  };
})();



// === v171: Persistência de IPASGO Manual (#valorIpasgo) no auto-reload ===
(function(){
  if (window.__PERSIST_IPASGO_MANUAL_V171__) return; 
  window.__PERSIST_IPASGO_MANUAL_V171__ = true;

  var LS_KEY = 'persist_valor_ipasgo_v171';
  var RESTORE_WINDOW_MS = 2000;

  function byId(id){ return document.getElementById(id); }

  function getIpasgoSelect(){
    var el = byId('ipasgo');
    if (el && el.tagName === 'SELECT') return el;
    return document.querySelector("select#ipasgo, select[name='ipasgo'], select[id*='ipasgo' i], select[name*='ipasgo' i]");
  }
  function getIpasgoValorInput(){
    var el = byId('valorIpasgo');
    if (el) return el;
    return document.querySelector("input#valorIpasgo, input[name='valorIpasgo'], input[id*='valor' i][id*='ipasgo' i], input[name*='valor' i][name*='ipasgo' i]");
  }
  function isManual(sel){
    if (!sel) return false;
    var v = (sel.value||'').toLowerCase();
    var t = '';
    try { t = (sel.options && sel.options[sel.selectedIndex] ? (sel.options[sel.selectedIndex].text||'') : '').toLowerCase(); } catch(_){}
    return /manual/.test(v) || /manual/.test(t);
  }

  function saveSnapshot(){
    var sel = getIpasgoSelect();
    var inp = getIpasgoValorInput();
    if (!sel && !inp) return;
    var data = {
      sval: sel ? String(sel.value||'') : null,
      stxt: (function(){ 
        try { return sel && sel.options && sel.options[sel.selectedIndex] ? (sel.options[sel.selectedIndex].text||null) : null; } 
        catch(_){ return null; } 
      })(),
      val:  inp ? String(inp.value||'') : null,
      ts:   Date.now()
    };
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch(_){}
  }

  function restoreSnapshot(){
    var raw = null, data = null;
    try { raw = localStorage.getItem(LS_KEY); } catch(_){}
    if (!raw) return;
    try { data = JSON.parse(raw); } catch(_){ data = null; }
    if (!data) return;

    var deadline = Date.now() + RESTORE_WINDOW_MS;

    function applyOnce(){
      var sel = getIpasgoSelect();
      var inp = getIpasgoValorInput();
      if (inp && data.val != null){
        var manualNow = isManual(sel);
        var manualSaved = !!(data.sval && /manual/i.test(data.sval)) || !!(data.stxt && /manual/i.test(data.stxt||''));
        if (manualNow || manualSaved){
          inp.value = String(data.val);
        }
      }
    }

    applyOnce();
    setTimeout(applyOnce, 50);
    setTimeout(applyOnce, 150);
    setTimeout(applyOnce, 400);
    setTimeout(applyOnce, 900);
    setTimeout(applyOnce, 1400);

    try {
      var mo = new MutationObserver(function(){
        if (Date.now() > deadline) { try { mo.disconnect(); } catch(_){ } return; }
        applyOnce();
      });
      mo.observe(document.body, {childList:true, subtree:true, characterData:true});
      setTimeout(function(){ try { mo.disconnect(); } catch(_){ } }, RESTORE_WINDOW_MS + 200);
    } catch(_){}
  }

  function bind(){
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', restoreSnapshot);
    } else {
      restoreSnapshot();
    }

    ['change','input','blur'].forEach(function(evt){
      document.addEventListener(evt, function(e){
        var t = e.target;
        if (!t || !t.tagName) return;
        if (t === getIpasgoSelect() || t === getIpasgoValorInput()){
          saveSnapshot();
        }
      }, true);
    });
  }

  bind();

  window.debugIpasgoManualV171 = function(){
    var sel = getIpasgoSelect();
    var inp = getIpasgoValorInput();
    var stored = null;
    try { stored = localStorage.getItem(LS_KEY); } catch(_){}
    return {
      manualNow: isManual(sel),
      selectVal: sel && sel.value,
      inputVal:  inp && inp.value,
      stored
    };
  };
})();



// === v172: Blindagem do IPASGO Manual — preserva #valorIpasgo após auto‑reload ===
(function(){
  if (window.__IPASGO_MANUAL_FIX_V172__) return; window.__IPASGO_MANUAL_FIX_V172__ = true;

  var LS_KEY = 'persist_valor_ipasgo_v172';
  var RESTORE_WINDOW_MS = 2500;
  var INTERVAL_MS = 120;
  var REGRESS_MARKS = ['0,00', '0.00', '0'];
  var timer = null;

  function byId(id){ return document.getElementById(id); }
  function getIpasgoSelect(){
    var el = byId('ipasgo'); if (el && el.tagName === 'SELECT') return el;
    return document.querySelector("select#ipasgo, select[name='ipasgo'], select[id*='ipasgo' i], select[name*='ipasgo' i]");
  }
  function getIpasgoValorInput(){
    var el = byId('valorIpasgo'); if (el) return el;
    return document.querySelector("input#valorIpasgo, input[name='valorIpasgo'], input[id*='valor' i][id*='ipasgo' i], input[name*='valor' i][name*='ipasgo' i]");
  }
  function isManual(sel){
    if (!sel) return false;
    var v = (sel.value||'').toLowerCase();
    var t = '';
    try { t = (sel.options && sel.options[sel.selectedIndex] ? (sel.options[sel.selectedIndex].text||'') : '').toLowerCase(); } catch(_){}
    return /manual/.test(v) || /manual/.test(t);
  }

  function readCurrent(){
    var sel = getIpasgoSelect();
    var inp = getIpasgoValorInput();
    return {
      manual: isManual(sel),
      sval: sel ? String(sel.value||'') : null,
      stxt: (function(){ 
        try { return sel && sel.options && sel.options[sel.selectedIndex] ? (sel.options[sel.selectedIndex].text||null) : null; } 
        catch(_){ return null; } 
      })(),
      val:  inp ? String(inp.value||'') : null,
      ts:   Date.now()
    };
  }

  function saveLS(data){
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch(_){}
  }
  function loadLS(){
    var raw = null; try { raw = localStorage.getItem(LS_KEY); } catch(_){}
    if (!raw) return null;
    try { return JSON.parse(raw); } catch(_){ return null; }
  }

  // Salva sempre que o usuário vai sair/recarregar (pega o último valor digitado)
  window.addEventListener('beforeunload', function(){
    var cur = readCurrent();
    saveLS(cur);
  });

  // Defende contra regressões para "0,00" depois do init de outros scripts
  function applyPersisted(force){
    var data = loadLS();
    if (!data) return;
    var sel = getIpasgoSelect();
    var inp = getIpasgoValorInput();
    if (!inp) return;

    var manualNow = isManual(sel);
    var manualSaved = !!(data.sval && /manual/i.test(data.sval)) || !!(data.stxt && /manual/i.test(data.stxt||''));

    if (!(manualNow || manualSaved)) return; // só em modo manual

    // Se valor salvo parece válido (não vazio)
    if (data.val != null && String(data.val).trim() !== ''){
      // Se for force ou se detectar valor "regredido"
      var need = !!force || REGRESS_MARKS.includes((inp.value||'').trim());
      if (need){
        inp.value = String(data.val);
        // Não dispare eventos aqui para não re‑encadear reloads.
      }
    }
  }

  function startRecoveryLoop(){
    var start = Date.now();
    if (timer) { try { clearInterval(timer); } catch(_){ } }
    // Loop curto para "ganhar" de scripts que setam 0,00 após o DOM pronto
    timer = setInterval(function(){
      applyPersisted(false);
      if (Date.now() - start > RESTORE_WINDOW_MS){
        try { clearInterval(timer); } catch(_){}
        timer = null;
      }
    }, INTERVAL_MS);
  }

  function once(){
    // 1) Aplicação imediata (forçada) ao carregar
    applyPersisted(true);
    // 2) Passadas adicionais
    setTimeout(function(){ applyPersisted(true); }, 60);
    setTimeout(function(){ applyPersisted(true); }, 180);
    setTimeout(function(){ applyPersisted(true); }, 420);
    setTimeout(function(){ applyPersisted(true); }, 900);
    setTimeout(function(){ applyPersisted(true); }, 1400);
    // 3) Loop de recuperação contra re‑set para 0,00
    startRecoveryLoop();
    // 4) Observer por curto período
    try {
      var deadline = Date.now() + RESTORE_WINDOW_MS;
      var mo = new MutationObserver(function(){
        if (Date.now() > deadline) { try { mo.disconnect(); } catch(_){ } return; }
        applyPersisted(false);
      });
      mo.observe(document.body, {childList:true, subtree:true, characterData:true});
      setTimeout(function(){ try { mo.disconnect(); } catch(_){ } }, RESTORE_WINDOW_MS + 200);
    } catch(_){}
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', once);
  } else {
    once();
  }

  // Debug
  window.debugIpasgoManualV172 = function(){
    return { current: readCurrent(), stored: loadLS() };
  };
})();



// === v173: Gatilho de recálculo após restaurar #valorIpasgo (Manual) ===
(function(){
  if (window.__IPASGO_MANUAL_RECALC_V173__) return; window.__IPASGO_MANUAL_RECALC_V173__ = true;
  function tryRecalc(){
    try { if (typeof recomputePercentFromValor === 'function') recomputePercentFromValor(); } catch(_){}
    try { if (typeof computeDetalhamento === 'function') computeDetalhamento(); } catch(_){}
  }
  // Observa mudanças específicas no campo #valorIpasgo após a restauração e recalcula
  function kick(){
    // múltiplas passagens para garantir após as restaurações do v172
    tryRecalc();
    setTimeout(tryRecalc, 60);
    setTimeout(tryRecalc, 180);
    setTimeout(tryRecalc, 420);
    setTimeout(tryRecalc, 900);
    setTimeout(tryRecalc, 1400);
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', kick);
  } else {
    kick();
  }
  // Além disso, caso o usuário edite manualmente após reload, recalcula no input
  document.addEventListener('input', function(ev){
    var t = ev.target;
    if (!t || !t.id) return;
    if (t.id === 'valorIpasgo'){
      tryRecalc();
    }
  }, true);
})();



// === v174: Hold de UI para #valorIpasgo (Manual) — mantém visível após recálculo ===
(function(){
  if (window.__IPASGO_MANUAL_UI_HOLD_V174__) return; window.__IPASGO_MANUAL_UI_HOLD_V174__ = true;

  function byId(id){ return document.getElementById(id); }
  function getIpasgoSelect(){
    var el = byId('ipasgo'); if (el && el.tagName === 'SELECT') return el;
    return document.querySelector("select#ipasgo, select[name='ipasgo'], select[id*='ipasgo' i], select[name*='ipasgo' i]");
  }
  function getIpasgoValorInput(){
    var el = byId('valorIpasgo'); if (el) return el;
    return document.querySelector("input#valorIpasgo, input[name='valorIpasgo'], input[id*='valor' i][id*='ipasgo' i], input[name*='valor' i][name*='ipasgo' i]");
  }
  function isManual(sel){
    if (!sel) return false;
    var v = (sel.value||'').toLowerCase();
    var t = '';
    try { t = (sel.options && sel.options[sel.selectedIndex] ? (sel.options[sel.selectedIndex].text||'') : '').toLowerCase(); } catch(_){}
    return /manual/.test(v) || /manual/.test(t);
  }
  function loadSnapshot(){
    var keys = ['persist_valor_ipasgo_v172','persist_valor_ipasgo_v171'];
    for (var i=0;i<keys.length;i++){
      try {
        var raw = localStorage.getItem(keys[i]);
        if (raw){ try { return JSON.parse(raw); } catch(_){ } }
      } catch(_){}
    }
    return null;
  }
  function forceVisible(){
    var data = loadSnapshot(); if (!data) return;
    var sel = getIpasgoSelect();
    var inp = getIpasgoValorInput(); if (!inp) return;

    var manualNow   = isManual(sel);
    var manualSaved = !!(data.sval && /manual/i.test(data.sval)) || !!(data.stxt && /manual/i.test((data.stxt||'')));
    if (!(manualNow || manualSaved)) return;

    if (data.val != null && String(data.val).trim() !== ''){
      // Reaplica o valor salvo, caso outro script tenha setado "0,00"
      inp.value = String(data.val);
    }
  }
  function scheduleHold(){
    forceVisible();
    [80, 200, 400, 800, 1300, 1800, 2300].forEach(function(ms){
      setTimeout(forceVisible, ms);
    });
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', scheduleHold); }
  else { scheduleHold(); }

  // Reforça após cada mudança do seletor ipasgo (especialmente quando entra em "Manual")
  document.addEventListener('change', function(e){
    if (e && e.target && e.target.id === 'ipasgo'){
      scheduleHold();
    }
  }, true);
})();



// v180 — posiciona #accessCounter à direita na mesma linha do título "Simulador de proventos e descontos"
(function(){
  if (window.__ACCESS_ALIGN_V180__) return; window.__ACCESS_ALIGN_V180__ = true;
  function norm(s){ try{ return (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }catch(_){ return (s||'').toString().toLowerCase().trim(); } }
  function initAlign(){
    var counter = document.getElementById('accessCounter');
    if (!counter) return;
    var titles = Array.from(document.querySelectorAll('h1,h2,h3'));
    var title = titles.find(function(el){
      var t = norm(el.textContent);
      return t.indexOf('simulador de proventos e descontos') !== -1;
    });
    if (!title || !title.parentElement) return;
    var parent = title.parentElement;
    // Mover o counter para junto do título, se ainda não for o mesmo pai
    if (counter.parentElement !== parent){
      try { parent.appendChild(counter); } catch(_){}
    }
    // Tornar a linha flex e empurrar o counter à direita
    try { parent.classList.add('header-title-row'); } catch(_){}
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initAlign);
  } else {
    initAlign();
  }
  // Reaplica caso haja re-render dinâmico
  setTimeout(initAlign, 300);
  setTimeout(initAlign, 900);
})();



// v184 — Garantir #accessCounter à direita no local atual (sem mover DOM)
(function(){
  if (window.__ACCESS_ALIGN_V184__) return; window.__ACCESS_ALIGN_V184__ = true;
  // neutraliza scripts antigos que moviam o contador
  window.__ACCESS_ALIGN_V180__ = true;
  window.__ACCESS_ALIGN_V182__ = true;

  function apply(){
    var el = document.getElementById('accessCounter');
    if (!el) return;
    var parent = el.parentElement;
    if (!parent) return;
    // Adiciona classe no pai para usar flex + space-between
    if (!parent.classList.contains('access-rightline')){
      try{ parent.classList.add('access-rightline'); }catch(_){}
    }
    // Margem auto para empurrar à direita
    try{ el.style.marginLeft = 'auto'; }catch(_){}
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
  // Reforça após pequenas janelas (em caso de renderização tardia)
  setTimeout(apply, 200);
  setTimeout(apply, 800);
})();

