# Remuneração CBMGO – IRPF automático (2025)

Este pacote calcula o IRPF mensal automaticamente, **sem acessar sites externos**, com base na **tabela oficial da Receita Federal (2025)**.

## Regras adotadas
- Períodos 2025:
  - **Jan–Abr/2025**: limite do desconto simplificado = R$ 564,80.
  - **Mai–Dez/2025**: limite do desconto simplificado = R$ 607,20.
- **Dedução mensal por dependente**: R$ 189,59.
- **Cálculo do IRPF** (IRRF mensal):
  1. Calcula as **deduções legais**: Previdência oficial (10,5% do subsídio) + dependentes.
  2. Calcula o **desconto simplificado mensal**: 25% do rendimento, limitado (conforme o período).
  3. **Aplica o maior** entre deduções legais e desconto simplificado para obter a base de cálculo.
  4. Aplica a **tabela progressiva mensal** (alíquota e parcela a deduzir).
- Tabela e parâmetros extraídos da página oficial da Receita (tributação 2025).

## Uso
Abra `index.html`, preencha os campos e clique em **Calcular**. O IRPF aparece automaticamente em **Descontos**.

