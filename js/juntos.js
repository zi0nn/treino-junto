/* Treino Junto · js/juntos.js
   Aba Juntos (check-in de quem você acompanha e o acompanhamento)
   e a lista de qual tela desenhar em cada aba (TELAS). */
import { chaveAcomp } from '../app.js';
import { DIAS, DIAS_NOME, S, esc, hoje, isoDe, meusAcompanhantes, nomeDe, quemAcompanho, resumoSemana, semanaAtual, statusDia } from './base.js';
import { telaAvisos, telaConexoes, telaDados } from './perfil.js';
import { cartaoImc, cartaoMetaCasal, cartaoSequencia, cartaoSequenciaCasal, contextoConquistas, gradeConquistas, graficoFrequencia, graficoPeso, resumoPesoAcomp, semanasFrequencia, telaCargas, telaConquistas, telaFotos, telaFrequencia, telaMedidas, telaPeso, telaResumoMes, treinosNoMes } from './progresso.js';
import { cabecalho, cartaoCheckin, cartaoTreino, legenda, secaoCheckinHoje, telaHistorico, telaHoje, telaSemana } from './treino.js';

// ---------- Juntos ----------
// Quem eu acompanho (aceitas) e qual está selecionada; dados dela já carregados em S.acomp
export function contextoAcomp() {
  const aceitas = quemAcompanho().filter(c => c.status === 'aceita');
  const atual = aceitas.find(c => c.id === S.acompId) || aceitas[0];
  if (!atual) return { aceitas };
  const A = S.acomp && S.acomp.chave === chaveAcomp(atual) ? S.acomp : null;
  const checkins = atual.perm?.checkins && A && !A.bloqCheckins ? A.checkins : [];
  return { aceitas, atual, A, checkins, nome: nomeDe(atual, 'atleta') };
}
export const chipsAcomp = (aceitas, atual) => aceitas.length > 1
  ? `<div class="chips">${aceitas.map(c => `<button class="chip ${c.id === atual.id ? 'on' : ''}" data-acomp="${c.id}">${esc(nomeDe(c, 'atleta'))}</button>`).join('')}</div>` : '';
export const semConexao = texto => `<section class="block"><div class="card stack"><h3>Treine junto</h3><p class="small muted">${texto}</p>
  <button class="btn sm" data-aba="conexoes">Conectar com alguém</button></div></section>`;

// Check-in: o meu e o de quem eu acompanho, com reações, e a meta do casal
export function telaMural() {
  const { aceitas, atual, A, checkins, nome } = contextoAcomp();
  const hojeIso = isoDe(hoje());
  let deQuemAcompanho = '';
  if (atual) {
    if (!atual.perm?.checkins || A?.bloqCheckins) {
      deQuemAcompanho = `<div class="card stack"><h3>Check-ins de ${esc(nome)} são privados</h3>
        <p class="small muted">${esc(nome)} ainda não liberou ver os check-ins e fotos.</p></div>`;
    } else if (!A?.temCheckins) {
      deQuemAcompanho = '<p class="muted">Carregando check-ins…</p>';
    } else {
      const deHoje = checkins.filter(c => c.data === hojeIso);
      deQuemAcompanho = deHoje.length ? deHoje.map(c => cartaoCheckin(atual.atleta, c, true)).join('')
        : `<div class="card stack"><h3>${esc(nome)} ainda não fez check-in hoje</h3>
            <p class="small muted">Quando fizer, aparece aqui para você reagir.</p></div>
          ${checkins[0] ? `<span class="label">Último check-in de ${esc(nome)}</span>${cartaoCheckin(atual.atleta, checkins[0], true)}` : ''}`;
    }
  }
  const metas = [
    ...meusAcompanhantes().map(c => cartaoMetaCasal(c, 'atleta', treinosNoMes(S.registros, S.checkins))),
    ...(atual ? [cartaoMetaCasal(atual, 'viewer', atual.perm?.treinos || atual.perm?.checkins ? treinosNoMes(A?.registros || {}, checkins) : null, nome)] : []),
  ].join('');
  return `${cabecalho()}
  ${secaoCheckinHoje()}
  ${cartaoSequenciaCasal(atual, A, checkins)}
  ${atual ? `<section class="block"><span class="label">${esc(nome)} hoje</span>${chipsAcomp(aceitas, atual)}${deQuemAcompanho}</section>` : ''}
  ${metas}
  ${!atual && !meusAcompanhantes().length ? semConexao('Conecte-se com quem você quer incentivar (ou com quem vai te incentivar) para ver os check-ins um do outro, reagir e combinar metas.') : ''}`;
}

// Acompanhar: treino, semana, sequência, conquistas e peso de quem eu acompanho
export function telaAcompanhar() {
  const { aceitas, atual, A, checkins, nome } = contextoAcomp();
  if (!atual) return cabecalho() + semConexao('Aqui você acompanha os treinos, a semana e o progresso de quem você incentiva.');
  const semana = semanaAtual();
  const hojeIso = isoDe(hoje());

  let corpo;
  if (!atual.perm?.treinos || A?.bloqTreinos) {
    corpo = `<section class="block"><div class="card stack"><h3>Treinos privados</h3>
      <p class="small muted">${esc(nome)} ainda não liberou ver os treinos. Quando liberar, eles aparecem aqui.</p></div></section>`;
  } else if (!(A?.temPlano && A?.temRegistros)) {
    corpo = '<section class="block"><p class="muted">Carregando…</p></section>';
  } else {
    const r = resumoSemana(A.plano, A.registros, checkins);
    const d = hoje();
    const planoHoje = A.plano[d.getDay()];
    const total = planoHoje?.exercicios?.length || 0;
    const marcados = A.registros[hojeIso]?.feitos || [];
    const feitos = total ? planoHoje.exercicios.filter(e => marcados.includes(e.id)).length : marcados.length;
    const fezCheckin = checkins.some(c => c.data === hojeIso);
    const pill = !total ? (feitos || fezCheckin ? '<span class="pill ok">Treinou</span>' : '<span class="pill ok">Descanso</span>')
      : feitos >= total ? '<span class="pill ok">Treino completo</span>'
      : feitos ? '<span class="pill wait">Treinando agora</span>'
      : fezCheckin ? '<span class="pill ok">Na academia</span>' : '<span class="pill wait">Ainda não treinou</span>';
    corpo = `
    <section class="block"><div class="row between"><span class="label">Treino de hoje</span>${pill}</div>
      ${cartaoTreino(d.getDay(), hojeIso, A.plano, A.registros, false)}</section>
    <section class="block"><div class="row between"><span class="label">Semana</span><span class="small muted tabular">${r.planejados ? `${r.feitos} de ${r.planejados} treinos` : `${r.feitos} ${r.feitos === 1 ? 'treino' : 'treinos'}`}</span></div>
      <div class="week">${semana.map(x => `<div class="day ${statusDia(x, A.plano, A.registros, checkins)} ${isoDe(x) === hojeIso ? 'today' : ''}" aria-label="${DIAS_NOME[x.getDay()]}">
        <span>${DIAS[x.getDay()]}</span><b class="tabular">${x.getDate()}</b><span class="dot"></span></div>`).join('')}</div>
      ${legenda()}
      <div class="grid3">
        <div class="stat"><span class="label">Treinou</span><b class="tabular">${r.feitos}</b><span class="small muted">nesta semana</span></div>
        <div class="stat"><span class="label">Faltou</span><b class="tabular">${r.faltas}</b><span class="small muted">nesta semana</span></div>
        <div class="stat"><span class="label">Planejado</span><b class="tabular">${r.planejados}</b><span class="small muted">treinos</span></div>
      </div></section>`;
  }

  return `${cabecalho()}
  <section class="block"><span class="label">Acompanhando</span><h2>${esc(nome)}</h2>${chipsAcomp(aceitas, atual)}</section>
  ${cartaoSequenciaCasal(atual, A, checkins)}
  ${corpo}
  ${atual.perm?.treinos && A?.temPlano && A?.temRegistros && !A.bloqTreinos ? (() => {
    const ctx = contextoConquistas(A.plano, A.registros, checkins, A.pesos || [], atual.alturaCm);
    return `<section class="block"><span class="label">Sequência</span>${cartaoSequencia(ctx)}</section>
    <section class="block"><span class="label">Treinos por semana</span>
      <div class="card">${graficoFrequencia('freqAcomp', semanasFrequencia(A.plano, A.registros, checkins))}</div></section>
    <section class="block"><span class="label">Conquistas de ${esc(nome)}</span>${gradeConquistas(ctx, null, false)}</section>`;
  })() : ''}
  ${atual.perm?.peso && !A?.bloqPeso ? `<section class="block"><span class="label">Peso</span>
    ${!A?.temPesos ? '<p class="muted">Carregando…</p>'
      : `${resumoPesoAcomp(A.pesos)}${cartaoImc(A.pesos, atual.alturaCm, false, null)}<div class="card">${graficoPeso('pesoAcomp', A.pesos, null)}</div>`}</section>` : ''}`;
}

// Qual tela desenhar em cada aba/subaba
export const TELAS = {
  treino: { hoje: () => telaHoje(), semana: () => telaSemana(), historico: () => telaHistorico() },
  corpo: { peso: telaPeso, medidas: telaMedidas, fotos: telaFotos },
  juntos: { mural: telaMural, acompanhar: telaAcompanhar },
  evolucao: { mes: telaResumoMes, conquistas: telaConquistas, frequencia: telaFrequencia, cargas: telaCargas },
  perfil: { dados: telaDados, conexoes: telaConexoes, avisos: telaAvisos },
};
