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

// ====== Tabela de Subsídio Efetivo por Posto/Graduação ====== SUBTEN ATUAL 17185.74
const SUBSIDIO = {
  "CEL": 40294.19,
  "TC": 36321.50,
  "MAJ": 32632.62,
  "CAP": 28547.01,
  "1º TEN": 20724.98,
  "2º TEN": 17823.47,
  "SUBTEN / ASP OF": 17185.74,
  "1º SGT / Cadete 3º Ano": 13516.29,
  "2º SGT / Cadete 2º Ano": 11714.11,
  "3º SGT / Cadete 1º Ano": 10813.02,
  "CB": 9861.48,
  "SD 1º CLASSE": 8980.36,
  "SD 2º CLASSE": 8145.45
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
const adicionaisSelect = byId("adicionaisSelect");
const adicionaisChips = byId("adicionaisChips");
const ac4Modal = byId("ac4Modal");
const ac4TotalPreview = byId("ac4TotalPreview");
const ac4BreakdownPreview = byId("ac4BreakdownPreview");
const ac4ConfirmBtn = byId("ac4Confirm");
const ac4CancelBtn = byId("ac4Cancel");
const AC2_VALOR = 1050.00;
const AC3_VALOR = 828.00;
const AC5_VALOR = 1000.00;
const AC4_TOTAL_24H = {
  seg: 658.59,
  ter: 658.59,
  qua: 658.59,
  qui: 658.59,
  sex: 908.63,
  sab: 908.63,
  dom: 888.75
};
const AC4_LABEL_DIA = {
  seg: "Seg",
  ter: "Ter",
  qua: "Qua",
  qui: "Qui",
  sex: "Sex",
  sab: "Sab",
  dom: "Dom"
};
const AC_LABELS = {
  AC2: "AC2 (Horas-Aulas Ministradas)",
  AC3: "AC3 (Indenização por localidade)",
  AC4: "AC4 (Indenização por Serviço Extraordinário)",
  AC5: "AC5 (Auxílio Alimentação)"
};
let adicionaisSelecionados = new Set(["AC5"]);
let ac4Config = buildAc4DefaultConfig();
let ac4DraftConfig = buildAc4DefaultConfig();
let __reajustePercent = 0;
const MAX_REAJUSTE_PERCENT = 30;
const MIN_REAJUSTE_PERCENT = 0;
ipasgoSel.addEventListener("change", () => {
  const show = ipasgoSel.value === "manual";
  if (grupoIpasgoValor) grupoIpasgoValor.classList.toggle("hidden", !show);
  recomputePercentFromValor();
  computeDetalhamento();
});

function buildAc4DefaultConfig(){
  return {
    seg: { enabled: false, qty: 0 },
    ter: { enabled: false, qty: 0 },
    qua: { enabled: false, qty: 0 },
    qui: { enabled: false, qty: 0 },
    sex: { enabled: false, qty: 0 },
    sab: { enabled: false, qty: 0 },
    dom: { enabled: false, qty: 0 }
  };
}

function cloneAc4Config(cfg){
  return JSON.parse(JSON.stringify(cfg || buildAc4DefaultConfig()));
}

function calcAc4Total(cfg){
  let total = 0;
  Object.keys(AC4_TOTAL_24H).forEach((day) => {
    const data = cfg && cfg[day] ? cfg[day] : { enabled: false, qty: 0 };
    if (!data.enabled) return;
    const qty = Math.max(0, Math.min(5, Number(data.qty ?? 0)));
    total += AC4_TOTAL_24H[day] * qty;
  });
  return round2(total);
}

function getAdicionaisCalculo(){
  const items = [];
  let totalTributavel = 0;
  let totalIsento = 0;
  if (adicionaisSelecionados.has("AC2")) {
    items.push({ sigla: "AC2", desc: AC_LABELS.AC2, valor: AC2_VALOR, isento: true });
    totalIsento += AC2_VALOR;
  }
  if (adicionaisSelecionados.has("AC3")) {
    items.push({ sigla: "AC3", desc: AC_LABELS.AC3, valor: AC3_VALOR, isento: true });
    totalIsento += AC3_VALOR;
  }
  if (adicionaisSelecionados.has("AC4")) {
    const ac4Total = calcAc4Total(ac4Config);
    items.push({ sigla: "AC4", desc: AC_LABELS.AC4, valor: ac4Total, isento: true });
    totalIsento += ac4Total;
  }
  if (adicionaisSelecionados.has("AC5")) {
    items.push({ sigla: "AC5", desc: AC_LABELS.AC5, valor: AC5_VALOR, isento: true });
    totalIsento += AC5_VALOR;
  }
  return {
    items,
    totalTributavel: round2(totalTributavel),
    totalIsento: round2(totalIsento),
    total: round2(totalTributavel + totalIsento)
  };
}

function updateAc4Preview(){
  if (!ac4TotalPreview || !ac4BreakdownPreview) return;
  const total = calcAc4Total(ac4DraftConfig);
  const breakdown = [];
  Object.keys(AC4_TOTAL_24H).forEach((day) => {
    const data = ac4DraftConfig && ac4DraftConfig[day] ? ac4DraftConfig[day] : { enabled: false, qty: 0 };
    const qty = Math.max(0, Math.min(5, Number(data.qty ?? 0)));
    const fator = data.enabled ? qty : 0;
    const dayTotal = round2(AC4_TOTAL_24H[day] * fator);
    breakdown.push(`${AC4_LABEL_DIA[day]}: ${fator}x ${fmt(AC4_TOTAL_24H[day])} = ${fmt(dayTotal)}`);
  });
  ac4TotalPreview.textContent = fmt(total);
  ac4BreakdownPreview.textContent = breakdown.join(" | ");
}

function syncAc4ModalInputs(){
  if (!ac4Modal) return;
  const checks = ac4Modal.querySelectorAll(".ac4-day input[type='checkbox']");
  checks.forEach((el) => {
    const day = el.dataset.day;
    const data = ac4DraftConfig[day];
    if (!data) return;
    el.checked = !!data.enabled;
    const qtyEl = ac4Modal.querySelector(`.ac4-qty[data-day='${day}']`);
    if (qtyEl){
      qtyEl.value = String(Math.max(0, Math.min(5, Number(data.qty ?? 0))));
      qtyEl.disabled = !data.enabled;
    }
  });
  updateAc4Preview();
}

function openAc4Modal(){
  if (!ac4Modal) return;
  ac4DraftConfig = cloneAc4Config(ac4Config);
  ac4Modal.classList.remove("hidden");
  syncAc4ModalInputs();
}

function closeAc4Modal(){
  if (!ac4Modal) return;
  ac4Modal.classList.add("hidden");
}

function renderAdicionaisChips(){
  if (!adicionaisChips) return;
  const ordem = ["AC2", "AC3", "AC4", "AC5"];
  const chips = ordem.filter((cod) => adicionaisSelecionados.has(cod));
  adicionaisChips.innerHTML = chips.map((cod) => `
    <div class="adicional-chip" title="${escapeHtml(AC_LABELS[cod] || cod)}">
      <span>${escapeHtml(cod)}</span>
      <button type="button" class="chip-remove" data-remove-adicional="${escapeHtml(cod)}" aria-label="Remover ${escapeHtml(cod)}">x</button>
    </div>
  `).join("");
}

function bindAdicionaisEventos(){
  if (adicionaisSelect){
    adicionaisSelect.addEventListener("change", () => {
      const val = adicionaisSelect.value || "";
      if (!val) return;
      if (val === "AC4"){
        openAc4Modal();
      } else {
        adicionaisSelecionados.add(val);
        renderAdicionaisChips();
        computeDetalhamento();
      }
      adicionaisSelect.value = "";
    });
  }
  if (adicionaisChips){
    adicionaisChips.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove-adicional]");
      if (!btn) return;
      const cod = btn.getAttribute("data-remove-adicional");
      if (!cod) return;
      adicionaisSelecionados.delete(cod);
      if (cod === "AC4"){
        ac4Config = buildAc4DefaultConfig();
        ac4DraftConfig = buildAc4DefaultConfig();
      }
      renderAdicionaisChips();
      computeDetalhamento();
    });
  }
  if (ac4Modal){
    ac4Modal.addEventListener("change", (e) => {
      const target = e.target;
      if (!target) return;
      if (target.matches(".ac4-day input[type='checkbox']")){
        const day = target.dataset.day;
        if (!ac4DraftConfig[day]) return;
        ac4DraftConfig[day].enabled = !!target.checked;
        const qtyEl = ac4Modal.querySelector(`.ac4-qty[data-day='${day}']`);
        if (qtyEl) qtyEl.disabled = !target.checked;
        updateAc4Preview();
        return;
      }
      if (target.matches(".ac4-qty")){
        const day = target.dataset.day;
        if (!ac4DraftConfig[day]) return;
        let qty = Number(target.value ?? 0);
        if (!isFinite(qty)) qty = 0;
        qty = Math.max(0, Math.min(5, qty));
        ac4DraftConfig[day].qty = qty;
        updateAc4Preview();
      }
    });
    if (ac4ConfirmBtn){
      ac4ConfirmBtn.addEventListener("click", () => {
        ac4Config = cloneAc4Config(ac4DraftConfig);
        const hasAnyDay = Object.keys(ac4Config).some((day) => ac4Config[day] && ac4Config[day].enabled);
        if (hasAnyDay) adicionaisSelecionados.add("AC4");
        else adicionaisSelecionados.delete("AC4");
        renderAdicionaisChips();
        closeAc4Modal();
        computeDetalhamento();
      });
    }
    if (ac4CancelBtn){
      ac4CancelBtn.addEventListener("click", () => {
        closeAc4Modal();
      });
    }
    ac4Modal.addEventListener("click", (e) => {
      if (e.target === ac4Modal) closeAc4Modal();
    });
  }
}

bindAdicionaisEventos();
renderAdicionaisChips();



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
  const adicionaisCalc = getAdicionaisCalculo();
  const adicionaisTributaveis = adicionaisCalc.totalTributavel;
  const adicionaisIsentos = adicionaisCalc.totalIsento;
  const rendimentoTributavel = round2(subsidio + adicionaisTributaveis);
  const proventos = [
    { desc: `Subsídio Efetivo (${posto})` + (__reajustePercent ? ` (+${(__reajustePercent).toFixed(2).replace(".",",")}% )` : ""), valor: subsidio },
    { desc: "Abono Fardamento", valor: ABONO_FARDAMENTO }
  ];
  adicionaisCalc.items.forEach((ad) => {
    const sufixo = ad.isento ? " (isento de IRPF e sem descontos)" : "";
    proventos.push({ desc: `${ad.desc}${sufixo}`, valor: round2(ad.valor) });
  });
  const totalBruto = sum(proventos.map(p => p.valor));

  // 2) Descontos fixos + pensão
  const pensao = round2(subsidio * ALIQUOTA_PENSAO);
  let ipasgoValor = 0;
let ipasgoSelecionado = false;
  let ipasgoTetoApplied = false;
const ipasgoMode = ipasgoSel ? ipasgoSel.value : "nao";
if (ipasgoMode === "basico") { ipasgoValor = round2(subsidio * 0.0681);
  if (ipasgoValor > 838.71) { ipasgoValor = 838.71; } ipasgoSelecionado = true; }
else if (ipasgoMode === "especial") { ipasgoValor = round2(subsidio * 0.1248);
  if (ipasgoValor > 1247.93) { ipasgoValor = 1247.93; } ipasgoSelecionado = true; }
else if (ipasgoMode === "manual") { ipasgoValor = round2(parseMoney(valorIpasgoInput ? valorIpasgoInput.value : "0")); ipasgoSelecionado = ipasgoValor > 0; }

  const associacaoValor = parseMoney(byId("associacaoValor").value);

  // 3) IRPF automático (IRRF mensal) — período do mês
  const periodo = ["Janeiro","Fevereiro","Março","Abril"].includes(mes) ? "jan_abr" : "mai_dez";
  const P = PARAMS_IRRF[periodo];
  const dedDependentes = round2(P.dependente * dependentes);

  // Deduções legais permitidas no mês (para o simulador): previdência oficial + dependentes
  const deducoesLegais = round2(pensao + dedDependentes);

  // Desconto simplificado mensal: 25% do rendimento, limitado
  const simplificado = Math.min(rendimentoTributavel * 0.25, P.desconto_simplificado_limite);

  // Usa o MAIOR entre deduções legais e desconto simplificado
  const descontoAplicado = Math.max(deducoesLegais, simplificado);
  const metodo = descontoAplicado === simplificado;

  let baseCalc = rendimentoTributavel - descontoAplicado;
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
    totalBrutoBase = round2(baseSubs + ABONO_FARDAMENTO + adicionaisCalc.total);
    const pensaoBase = round2(baseSubs * ALIQUOTA_PENSAO);
    const rendimentoTributavelBase = round2(baseSubs + adicionaisTributaveis);

    const periodoBase = ["Janeiro","Fevereiro","Março","Abril"].includes(mes) ? "jan_abr" : "mai_dez";
    const Pbase = PARAMS_IRRF[periodoBase];
    const dedDependentesBase = round2(Pbase.dependente * dependentes);
    const deducoesLegaisBase = round2(pensaoBase + dedDependentesBase);
    const simplificadoBase = Math.min(rendimentoTributavelBase * 0.25, Pbase.desconto_simplificado_limite);
    const descontoAplicadoBase = Math.max(deducoesLegaisBase, simplificadoBase);
    let baseCalcBase = rendimentoTributavelBase - descontoAplicadoBase;
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
      const _adicionaisTrib = (typeof adicionaisTributaveis !== "undefined" && isFinite(adicionaisTributaveis)) ? adicionaisTributaveis : 0;
      const _adicionaisIsentos = (typeof adicionaisIsentos !== "undefined" && isFinite(adicionaisIsentos)) ? adicionaisIsentos : 0;
      const _adicionaisTotal = round2(_adicionaisTrib + _adicionaisIsentos);

      // Helpers
      const headCols = meses;
      const renderHead = () => { thead.innerHTML = '<tr><th></th>' + headCols.map(c=>`<th>${c}</th>`).join('') + '</tr>'; };

      const computeMensal = (mi) => {
        const PM = PARAMS_IRRF[ mi <= 3 ? "jan_abr" : "mai_dez" ];
        const rendimentoTribMensal = round2(_subsidio + _adicionaisTrib);
        const bruto = round2(_subsidio + _ABONO_FARDAMENTO + _adicionaisTotal);
        const pensaoM = round2(_subsidio * _ALIQUOTA_PENSAO);
        const dedDepM = round2(PM.dependente * _dependentes);
        const simplifM = Math.min(rendimentoTribMensal * 0.25, PM.desconto_simplificado_limite);
        const dedLegaisM = round2(pensaoM + dedDepM);
        let baseCalcM = rendimentoTribMensal - Math.max(dedLegaisM, simplifM);
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
      const _adTrib = (typeof adicionaisTributaveis !== "undefined" && isFinite(adicionaisTributaveis)) ? adicionaisTributaveis : 0;
      const _adIsentos = (typeof adicionaisIsentos !== "undefined" && isFinite(adicionaisIsentos)) ? adicionaisIsentos : 0;
      const _adTot = round2(_adTrib + _adIsentos);
      function calcMensal(mi){
        const PM = mi<=3 ? PM_JA : PM_MD;
        const rendimentoTrib = round2(_subsidio + _adTrib);
        const bruto = round2(_subsidio + _AF + _adTot);
        const pens = round2(_subsidio * _ALI);
        const dedDep = round2(PM.dependente * _dep);
        const simpl = Math.min(rendimentoTrib * 0.25, PM.desconto_simplificado_limite);
        const dedLeg = round2(pens + dedDep);
        let base = rendimentoTrib - Math.max(dedLeg, simpl);
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
  adicionaisSelecionados = new Set(["AC5"]);
  ac4Config = buildAc4DefaultConfig();
  ac4DraftConfig = buildAc4DefaultConfig();
  if (adicionaisSelect) adicionaisSelect.value = "";
  renderAdicionaisChips();
  closeAc4Modal();
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


// Permitir digitação direta no valor ao lado da barra (reajusteRangeVal)
if (reajusteRangeVal){
  const applyRangeValPercent = (commit) => {
    try {
      let rawTxt = (reajusteRangeVal.textContent || reajusteRangeVal.innerText || "").replace("%", "").trim();
      // Sanitiza para manter no máximo 2 casas decimais e apenas dígitos + vírgula
      if (typeof sanitizePercentInput === "function"){
        const masked = sanitizePercentInput(rawTxt);
        if (masked !== rawTxt){
          rawTxt = masked;
          reajusteRangeVal.textContent = masked;
        }
      }
      let perc = 0;
      if (typeof normalizePercentToNumber === "function"){
        perc = normalizePercentToNumber(rawTxt);
      } else if (typeof parseMoney === "function"){
        perc = parseMoney(rawTxt);
      } else {
        perc = Number(String(rawTxt).replace(",", ".") || 0);
      }
      if (typeof clampPercent === "function"){
        perc = clampPercent(perc);
      }
      __reajustePercent = perc;
      if (reajusteRange) reajusteRange.value = String(perc);
      if (commit && typeof updateReajusteRangeUI === "function"){
        // No commit, normaliza visualmente para XX,XX% usando a função padrão
        updateReajusteRangeUI(perc);
      }
      if (typeof computeDetalhamento === "function"){
        // Qualquer mudança válida de percentual já recalcula imediatamente o detalhamento
        computeDetalhamento();
      }
    } catch(_e){
      // silencioso
    }
  };

  // Ao focar/clicar para editar, limpa o conteúdo para evitar mistura com o símbolo de porcentagem
  const clearOnFocus = () => {
    try {
      const rawTxt = (reajusteRangeVal.textContent || reajusteRangeVal.innerText || "").trim();
      // Só limpa se ainda estiver com "%"
      if (rawTxt.endsWith("%")){
        reajusteRangeVal.textContent = "";
      }
    } catch(_e){}
  };
  reajusteRangeVal.addEventListener("focus", clearOnFocus);
  reajusteRangeVal.addEventListener("click", clearOnFocus);

  // Enquanto digita, aplica o percentual em tempo real (sem forçar o % para não atrapalhar a digitação)
  reajusteRangeVal.addEventListener("input", () => applyRangeValPercent(false));

  // Ao sair do campo, normaliza o valor (2 casas, vírgula, sufixo %) e sincroniza tudo.
  reajusteRangeVal.addEventListener("blur", () => applyRangeValPercent(true));

  // Se o usuário pressionar Enter, também comita imediatamente o valor e aplica o reajuste
  reajusteRangeVal.addEventListener("keydown", (e) => {
    if (e.key === "Enter"){
      e.preventDefault();
      applyRangeValPercent(true);
      // Remove o foco para disparar o mesmo fluxo visual do blur
      reajusteRangeVal.blur();
    }
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










/* ===== v208-lite — Performance + Delta Rebase (sem F5, sem piscadas) ===== */
(function(){
  if (window.__V208_LITE__) return; window.__V208_LITE__ = true;

  const $  = (id)=>document.getElementById(id);
  const q  = (sel,root=document)=>root.querySelector(sel);
  const qa = (sel,root=document)=>Array.from(root.querySelectorAll(sel));
  const norm = (s)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();

  const parseBR = (txt)=>{
    if (txt == null) return 0;
    let s = String(txt).replace(/\u00A0/g,' ')
                       .replace(/[^0-9.,\-]/g,'')
                       .replace(/\./g,'')
                       .replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };
  const fmtBR = (n)=>{
    try { return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
    catch(_){ n = Math.round((+n||0)*100)/100; return 'R$ '+n.toFixed(2).replace('.',','); }
  };

  window.__reajuste_aplicado = !!window.__reajuste_aplicado;
  let REAPPLY_GUARD = false;
  let DEBOUNCE_RAF = 0, DEBOUNCE_TMO = 0, DEBOUNCE_DIRTY = false, WRITING = false;

  const setDeltasOn = (on)=> document.body.classList.toggle('deltas-on', !!on);

  function getReajustePercent(){
    const el = document.getElementById('reajusteRange');
    const v = el ? parseFloat(el.value) : 0;
    return Number.isFinite(v) ? v : 0;
  }

  function getResumoAnualTotals(){
    try {
      const tabela = document.getElementById("tabelaDetalhamentoAnual");
      if (!tabela) return null;

      const tbody =
        (tabela.tBodies && tabela.tBodies.length ? tabela.tBodies[0] : null) ||
        tabela.querySelector("tbody") ||
        tabela;

      if (!tbody) return null;

      const rows = tbody.querySelectorAll("tr");
      if (!rows || rows.length < 3) return null;

      const parseCellValue = (cell) => {
        if (!cell) return 0;
        let txt = (cell.textContent || cell.innerText || "").replace(/\u00A0/g, " ").trim();
        if (!txt || txt === "—" || txt === "-") return 0;

        if (typeof parseMoney === "function") {
          const v = parseMoney(txt);
          if (Number.isFinite(v)) return v;
        }

        const norm = txt.replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", ".");
        const n = Number(norm);
        return Number.isFinite(n) ? n : 0;
      };

      const sumRow = (row) => {
        let total = 0;
        for (let i = 1; i < row.cells.length; i++) {
          total += parseCellValue(row.cells[i]);
        }
        return total;
      };

      const proventos = sumRow(rows[0]);
      const descontos = sumRow(rows[1]);
      const liquido   = sumRow(rows[2]);

      return { proventos, descontos, liquido };
    } catch (e) {
      return null;
    }
  }

  function writeAnualTotalsFromTable(){
    const totals = getResumoAnualTotals();
    if (!totals) return;

    const vp = document.getElementById("valoresAnuaisProventos");
    const vd = document.getElementById("valoresAnuaisDescontos");
    const vl = document.getElementById("valoresAnuaisLiquido");

    if (vp) vp.textContent = fmt(totals.proventos);
    if (vd) vd.textContent = fmt(totals.descontos);
    if (vl) vl.textContent = fmt(totals.liquido);
  }

  function snapshotResumoAnual(){
    const totals = getResumoAnualTotals();
    return totals
      ? {
          proventos: totals.proventos,
          descontos: totals.descontos,
          liquido: totals.liquido,
        }
      : null;
  }

  function scheduleRecompute(){
    DEBOUNCE_DIRTY = true;
    if (DEBOUNCE_RAF) return;
    DEBOUNCE_RAF = requestAnimationFrame(()=>{
      DEBOUNCE_TMO = setTimeout(()=>{
        DEBOUNCE_RAF = 0; DEBOUNCE_TMO = 0;
        if (!DEBOUNCE_DIRTY || WRITING) return;
        WRITING = true;
        try {
          if (typeof window.recalcEverythingNoReload === 'function') window.recalcEverythingNoReload();
          if (typeof window.computeDetalhamento === 'function') window.computeDetalhamento();
          if (typeof window.computeFerias13 === 'function') window.computeFerias13();
          if (typeof window.fillDetalhamentoAnual === 'function') window.fillDetalhamentoAnual();
          if (typeof window.recalcValoresAnuaisFinal === 'function') window.recalcValoresAnuaisFinal();
          if (typeof window.recalcValoresAnuaisRobusto === 'function') window.recalcValoresAnuaisRobusto();

          writeAnualTotalsFromTable();
        } finally {
          WRITING = false;
          DEBOUNCE_DIRTY = false;
        }
      }, 40);
    });
  }


  // Observador para atualizar VALORES ANUAIS sempre que o Detalhamento Anual mudar
  (function(){
    try {
      const tabela = document.getElementById("tabelaDetalhamentoAnual");
      if (!tabela || typeof MutationObserver === "undefined") return;
      const tbody = (tabela.tBodies && tabela.tBodies.length ? tabela.tBodies[0] : null) ||
                    tabela.querySelector("tbody") || tabela;
      if (!tbody) return;
      const obs = new MutationObserver(function(){
        try { writeAnualTotalsFromTable(); } catch(_e) {}
      });
      obs.observe(tbody, { childList: true, subtree: true, characterData: true });
      // Atualiza uma vez na carga, se já houver dados
      writeAnualTotalsFromTable();
    } catch(_e) {}
  })();

  function isIpasgoManual(){
    const sel = document.getElementById('ipasgo'); if (!sel) return false;
    const v = (sel.value||'').toLowerCase();
    const t = (sel.options[sel.selectedIndex]?.text||'').toLowerCase();
    return v.includes('manual') || t.includes('manual');
  }

  function rebaseDeltasAfterPostoChange(){
    if (!window.__reajuste_aplicado) { scheduleRecompute(); return; }
    if (REAPPLY_GUARD) return;
    REAPPLY_GUARD = true;

    scheduleRecompute(); // pinta novo posto
    const pct = getReajustePercent();
    setTimeout(()=>{
      window.__deltaBaseAnual = snapshotResumoAnual(); // nova base
      setDeltasOn(true); // mantém deltas visíveis, sem piscar

      if (typeof window.applyReajustePercent === 'function'){
        try { window.applyReajustePercent(pct); } catch(e){}
      } else {
        scheduleRecompute(); // fallback
      }
      setTimeout(()=>{ REAPPLY_GUARD = false; }, 80);
    }, 80);
  }

  function attachInputs(){
    const ids = ['mes','posto','dependentes','associacaoValor','ipasgo'];
    ids.forEach(id=>{
      const el = document.getElementById(id); if (!el) return;
      const handler = ()=>{
        if (id === 'posto'){ rebaseDeltasAfterPostoChange(); return; }
        if (id === 'ipasgo' && isIpasgoManual()){ return; } // só recalcula quando valorIpasgo mudar
        scheduleRecompute();
      };
      el.addEventListener('change', handler, true);
      el.addEventListener('input',  handler, true);
      el.addEventListener('blur',   handler, true);
    });

    const vi = document.getElementById('valorIpasgo');
    if (vi){
      let last = vi.value;
      const h = ()=>{
        if (!isIpasgoManual()) return;
        if (vi.value !== last){ last = vi.value; scheduleRecompute(); }
      };
      vi.addEventListener('input',  h, true);
      vi.addEventListener('change', h, true);
      vi.addEventListener('blur',   h, true);
    }
  }

  function attachReajusteHooks(){
    document.addEventListener('click', (ev)=>{
      const t = ev.target; if (!t) return;
      if (t.matches('#btnAplicarReajuste, [data-action="aplicar-reajuste"], .btn-aplicar-reajuste')){
        window.__reajuste_aplicado = true;
        setTimeout(()=>{ window.__deltaBaseAnual = snapshotResumoAnual(); document.body.classList.add('deltas-on'); }, 30);
        setTimeout(scheduleRecompute, 40);
      }
      if (t.matches('#btnLimparReajuste, [data-action="limpar-reajuste"], .btn-limpar-reajuste, .btn-reset-reajuste')){
        window.__reajuste_aplicado = false;
        document.body.classList.remove('deltas-on');
        scheduleRecompute();
      }
    }, true);
  }

  function boot(){
    if (window.__reajuste_aplicado) document.body.classList.add('deltas-on');
    attachInputs();
    attachReajusteHooks();
    scheduleRecompute();
    setTimeout(scheduleRecompute, 60);
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
/* ===== end v208-lite ===== */

/* ===== end v209 ===== */

/* =================== fim v220 =================== */





// v231 — Recalc imediato do Resumo Adicional Férias e 13º ao alterar apenas o posto
(function () {
  function triggerFromPosto() {
    try {
      if (typeof window.computeDetalhamento === "function") {
        window.computeDetalhamento();
      }
    } catch (e) {
      console && console.error && console.error("Erro ao recalcular Férias/13º em alteração de posto", e);
    }
  }

  function bindRecalcPosto() {
    const el = document.getElementById("posto");
    if (!el) return;
    ["change", "input"].forEach((evt) => {
      el.addEventListener(evt, triggerFromPosto, true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindRecalcPosto);
  } else {
    bindRecalcPosto();
  }
})();
;
