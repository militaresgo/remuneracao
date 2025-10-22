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

// ====== Tabela de Subsídio Efetivo por Posto/Graduação ======
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
const FAS = 95.84;
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
const grupoIpasgoValor = byId("grupoIpasgoValor");
const valorIpasgoInput = byId("valorIpasgo");
const ipasgoPercentInput = byId("ipasgoPercent");
const btnReajuste = byId('simularReajuste');
const reajusteWrap = byId('reajusteWrap');
const reajustePercentInput = byId('reajustePercent');
let __reajustePercent = 0;
const MAX_REAJUSTE_PERCENT = 100;
const MIN_REAJUSTE_PERCENT = 0;
ipasgoSel.addEventListener("change", () => {
  const show = ipasgoSel.value === "sim";
  grupoIpasgoValor.classList.toggle("hidden", !show);
  if (valorIpasgoInput) valorIpasgoInput.disabled = !show;
  if (ipasgoPercentInput) ipasgoPercentInput.disabled = !show;
  if (!show) { valorIpasgoInput.value = ""; if (ipasgoPercentInput) ipasgoPercentInput.value=""; }
});



// Recalcula o percentual a partir do valor em R$
function recomputePercentFromValor(){
  if (!ipasgoSel || ipasgoSel.value !== "sim") return;
  if (!ipasgoPercentInput) return;
  const posto = byId("posto").value;
  if (!posto) return;
  const subsidio = SUBSIDIO[posto] || 0;
  const valor = parseMoney(valorIpasgoInput.value);
  if (subsidio > 0){
    const perc = (valor / subsidio) * 100;
    if (isFinite(perc)){
      ipasgoPercentInput.value = String((Math.round(perc * 100) / 100).toFixed(2)).replace(".", ",");
    }
  } else {
    ipasgoPercentInput.value = "";
  }
}

// Quando o usuário digitar o valor em R$, sincroniza o %
if (valorIpasgoInput){
  valorIpasgoInput.addEventListener("input", () => {
    // Só calcula se houver posto escolhido
    recomputePercentFromValor();
  });
}

// Se mudar o posto/graduação, sincroniza para ambos os sentidos
byId("posto").addEventListener("change", () => { 
  recomputeIpasgoFromPercent(); 
  recomputePercentFromValor(); 
});


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
  const ipasgoSelecionado = ipasgoSel.value === "sim";
  let ipasgoValor = 0;
  if (ipasgoSelecionado){
      ipasgoValor = parseMoney(valorIpasgoInput.value);
  }
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
  if (ipasgoSelecionado) descontos.push({ desc: "IPASGO", valor: ipasgoValor });
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
  metodoIrpfEl.textContent = ``;

  resultado.hidden = false;
  const badge = byId('autoBadge');
if (badge){
    badge.classList.remove('hidden');
    badge.classList.add('show');
    clearTimeout(window.__autoBadgeTimer);
    window.__autoBadgeTimer = setTimeout(()=>{ badge.classList.remove('show'); }, 1200);
  }
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
      <td>${escapeHtml(it.desc)}</td>
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
  if (!ipasgoSel || ipasgoSel.value !== "sim") return;
  if (!ipasgoPercentInput) return;
  const posto = byId("posto").value;
  if (!posto) return;
  const subsidio = SUBSIDIO[posto] || 0;
  const perc = parseMoney(ipasgoPercentInput.value);
  const valor = Math.round(subsidio * (perc/100) * 100) / 100;
  if (isFinite(valor)){
    valorIpasgoInput.value = String(valor.toFixed(2)).replace(".", ",");
  }
}
function recomputePercentFromValor(){
  if (!ipasgoSel || ipasgoSel.value !== "sim") return;
  if (!ipasgoPercentInput) return;
  const posto = byId("posto").value;
  if (!posto) return;
  const subsidio = SUBSIDIO[posto] || 0;
  const valor = parseMoney(valorIpasgoInput.value);
  if (subsidio > 0){
    const perc = Math.round((valor / subsidio) * 100 * 100) / 100;
    if (isFinite(perc)){
      ipasgoPercentInput.value = String(perc.toFixed(2)).replace(".", ",");
    }
  } else {
    ipasgoPercentInput.value = "";
  }
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
byId("posto").addEventListener("change", () => { 
  recomputeIpasgoFromPercent(); 
  recomputePercentFromValor(); 
});



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
    computeDetalhamento();
  });
}
// Ao trocar o posto, reaplica o mesmo percentual sobre o novo subsídio
byId("posto").addEventListener("change", () => { computeDetalhamento(); });

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
