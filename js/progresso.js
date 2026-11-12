/* Treino Junto · js/progresso.js
   Peso, IMC, medidas, cargas, fotos de antes e depois, conquistas,
   sequências (sua e do casal), frequência, calendário do ano e meta do casal. */
import * as Store from '../store.js';
import { render, uid } from '../app.js';
import { S, SEMANAS_HISTORICO, esc, hoje, isoDe, mensagemErro, meuUid, meusAcompanhantes, nomeDe, resumoSemana, semanaAtual, statusDia, temTreinoNoDia, toast } from './base.js';
import { cabecalho } from './treino.js';

// ---------- Progresso: peso e frequência ----------
export const kgBR = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const dataCurta = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const diaDe = iso => new Date(iso + 'T12:00');

// Treinos feitos x planejados nas últimas semanas (planejado = plano atual da semana)
export function semanasFrequencia(planoSemana, registros, checkins, quantas = SEMANAS_HISTORICO) {
  const inicio = semanaAtual()[0];
  const hojeIso = isoDe(hoje());
  // Só conta a partir da primeira semana com alguma atividade
  const datas = [...Object.keys(registros).filter(d => registros[d]?.feitos?.length), ...checkins.map(c => c.data)].sort();
  const primeira = datas[0] || hojeIso;
  const semanas = [];
  for (let n = quantas - 1; n >= 0; n--) {
    const seg = new Date(inicio); seg.setDate(inicio.getDate() - 7 * n);
    const fim = new Date(seg); fim.setDate(seg.getDate() + 6);
    if (isoDe(fim) < primeira) continue;
    let feitos = 0, planejados = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(seg); d.setDate(seg.getDate() + i);
      if (isoDe(d) > hojeIso) break;
      if (temTreinoNoDia(planoSemana, d)) planejados++;
      if (statusDia(d, planoSemana, registros, checkins) === 'done') feitos++;
    }
    semanas.push({ inicio: isoDe(seg), feitos, planejados, atual: n === 0 });
  }
  return semanas;
}

// Gráfico de linha (peso ou medida). Toque num ponto mostra data e valor embaixo.
export const graficoPeso = (id, pesos, meta) => graficoLinha(id, pesos.map(p => ({ data: p.data, kg: p.kg })), meta, 'kg', 'peso');

export function graficoLinha(id, pesos, meta, unidade, nome) {
  if (!pesos.length) return `<p class="small muted">Nenhum registro de ${nome} ainda.</p>`;
  const W = 340, H = 170, esq = 34, dir = 14, topo = 14, base = 26;
  const kgs = pesos.map(p => p.kg).concat(meta ? [meta] : []);
  let min = Math.floor(Math.min(...kgs) - 0.5), max = Math.ceil(Math.max(...kgs) + 0.5);
  if (max - min < 2) { min -= 1; max += 1; }
  const t0 = diaDe(pesos[0].data).getTime(), t1 = diaDe(pesos.at(-1).data).getTime();
  const x = data => pesos.length === 1 ? (esq + W - dir) / 2 : esq + (diaDe(data).getTime() - t0) / (t1 - t0) * (W - esq - dir);
  const y = kg => topo + (max - kg) / (max - min) * (H - topo - base);
  const passo = Math.max(1, Math.ceil((max - min) / 3));
  const ticks = []; for (let v = Math.ceil(min); v <= max; v += passo) ticks.push(v);
  const pts = pesos.map(p => `${x(p.data).toFixed(1)},${y(p.kg).toFixed(1)}`);
  const sel = Math.min(S.dica[id] ?? pesos.length - 1, pesos.length - 1);
  const p = pesos[sel];
  return `<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img" aria-label="Gráfico de ${nome}: de ${kgBR(pesos[0].kg)} ${unidade} em ${dataCurta(pesos[0].data)} a ${kgBR(pesos.at(-1).kg)} ${unidade} em ${dataCurta(pesos.at(-1).data)}">
    ${ticks.map(v => `<line x1="${esq}" x2="${W - dir}" y1="${y(v)}" y2="${y(v)}" class="g-grade"/><text x="${esq - 6}" y="${y(v) + 3.5}" text-anchor="end" class="g-texto">${v}</text>`).join('')}
    ${meta ? `<line x1="${esq}" x2="${W - dir}" y1="${y(meta)}" y2="${y(meta)}" class="g-meta"/><text x="${W - dir}" y="${y(meta) - 5}" text-anchor="end" class="g-texto">meta ${kgBR(meta)}</text>` : ''}
    ${pesos.length > 1 ? `<polygon points="${x(pesos[0].data)},${H - base} ${pts.join(' ')} ${x(pesos.at(-1).data)},${H - base}" class="g-area"/>
      <polyline points="${pts.join(' ')}" class="g-linha"/>` : ''}
    ${pesos.map((q, i) => `<circle cx="${x(q.data)}" cy="${y(q.kg)}" r="${i === sel ? 6 : 4}" class="g-ponto ${i === sel ? 'sel' : ''}"/>`).join('')}
    <text x="${esq}" y="${H - 8}" class="g-texto">${dataCurta(pesos[0].data)}</text>
    ${pesos.length > 1 ? `<text x="${W - dir}" y="${H - 8}" text-anchor="end" class="g-texto">${dataCurta(pesos.at(-1).data)}</text>` : ''}
    ${pesos.map((q, i) => `<circle cx="${x(q.data)}" cy="${y(q.kg)}" r="16" class="g-alvo" data-dica="${id}" data-i="${i}" tabindex="0" role="button" aria-label="${dataCurta(q.data)}: ${kgBR(q.kg)} ${unidade}"/>`).join('')}
  </svg>
  <p class="small dica tabular"><b>${kgBR(p.kg)} ${unidade}</b> em ${dataCurta(p.data)}${sel > 0 ? ` · ${variacao(p.kg - pesos[sel - 1].kg, unidade)} desde o registro anterior` : ''}</p>`;
}
export const variacao = (d, unidade = 'kg') => Math.abs(d) < 0.05 ? 'igual' : `${d < 0 ? '−' : '+'}${kgBR(Math.abs(d))} ${unidade}`;

// ---------- Evolução de carga ----------

// Todas as cargas anotadas, por nome do exercício: { 'Agachamento livre': [{ data, kg }] }
export function historicoCargas(registros) {
  const porNome = {};
  Object.keys(registros).sort().forEach(data => {
    Object.values(registros[data]?.cargas || {}).forEach(c => {
      if (!c?.nome || !Number.isFinite(c.kg)) return;
      const lista = porNome[c.nome] ||= [];
      const mesmoDia = lista.find(p => p.data === data);
      if (mesmoDia) mesmoDia.kg = Math.max(mesmoDia.kg, c.kg); else lista.push({ data, kg: c.kg });
    });
  });
  return porNome;
}

// Campo de carga ao lado do exercício: sugere a última carga usada (ou a do plano)
// Sugestão de carga para hoje, olhando os treinos anteriores do mesmo exercício:
// - mesma carga nos 2 últimos treinos → hora de subir um pouco
// - senão → repetir a última, até ela ficar confortável
export function passoDeCarga(kg) { return kg <= 10 ? 1 : kg < 60 ? 2.5 : 5; }
export function sugestaoCarga(nome) {
  const hojeIso = isoDe(hoje());
  const antes = (historicoCargas(S.registros)[nome] || []).filter(p => p.data < hojeIso);
  if (!antes.length) return null;
  const ultima = antes.at(-1);
  const penultima = antes.at(-2);
  if (penultima && penultima.kg === ultima.kg && ultima.kg > 0) {
    return { kg: ultima.kg + passoDeCarga(ultima.kg), subir: true, ultima,
      texto: `Tente ${kgBR(ultima.kg + passoDeCarga(ultima.kg))} kg hoje: foram 2 treinos seguidos com ${kgBR(ultima.kg)} kg.` };
  }
  return { kg: ultima.kg, subir: false, ultima, texto: `Último treino: ${kgBR(ultima.kg)} kg (${dataCurta(ultima.data)}). Repita até ficar confortável.` };
}

export function campoCarga(e, kgHoje) {
  const doPlano = parseFloat(String(e.carga || '').replace(',', '.'));
  const sug = sugestaoCarga(e.nome);
  const sugestao = sug?.kg ?? (Number.isFinite(doPlano) ? doPlano : null);
  return `<label class="carga"><span class="sr">Carga usada em ${esc(e.nome)} (kg)</span>
    <input id="carga-${e.id}" data-carga="${e.id}" data-nome="${esc(e.nome)}" type="text" inputmode="decimal" maxlength="5" autocomplete="off"
      value="${kgHoje != null ? kgBR(kgHoje) : ''}" placeholder="${sugestao != null ? kgBR(sugestao) : 'kg'}"><span class="small muted">kg</span></label>`;
}

export function secaoCargas() {
  const hist = historicoCargas(S.registros);
  const nomes = Object.keys(hist).sort((a, b) => hist[b].length - hist[a].length || a.localeCompare(b));
  if (!nomes.length) {
    return `<section class="block"><span class="label">Evolução de carga</span>
      <p class="small muted">Na tela Hoje, anote ao lado de cada exercício a carga que usou. Aqui aparece como ela foi subindo.</p></section>`;
  }
  const sel = hist[S.exSel] ? S.exSel : nomes[0];
  const pts = hist[sel];
  const ini = pts[0].kg, fim = pts.at(-1).kg, dif = fim - ini;
  return `<section class="block"><span class="label">Evolução de carga</span>
    <div class="chips">${nomes.map(n => `<button class="chip ${n === sel ? 'on' : ''}" data-ex-sel="${esc(n)}">${esc(n)}</button>`).join('')}</div>
    ${pts.length > 1 ? `<p class="small">De <b class="tabular">${kgBR(ini)} kg</b> para <b class="tabular">${kgBR(fim)} kg</b> desde ${dataCurta(pts[0].data)}${ini > 0 && dif > 0 ? ` <span class="pill ok">+${Math.round(100 * dif / ini)}%</span>` : ''}</p>` : ''}
    <div class="card">${graficoLinha('carga-' + sel, pts, null, 'kg', 'carga')}</div>
  </section>`;
}

// ---------- Fotos de antes e depois ----------

export async function carregarFotosProgresso() {
  if (S.fotosProg !== undefined) return;
  S.fotosProg = null; // carregando
  try { S.fotosProg = await Store.lerFotosProgresso(uid()); } catch (err) { console.error(err); S.fotosProg = []; toast(mensagemErro(err)); }
  render();
}

// Peso registrado mais perto (antes ou no dia) da foto, para mostrar junto
export const pesoNoDia = data => S.pesos.filter(p => p.data <= data).at(-1);

export function secaoFotosProgresso() {
  if (S.fotosProg === undefined) setTimeout(carregarFotosProgresso, 0);
  const fotos = S.fotosProg || [];
  const antes = fotos.find(f => f.data === S.fotoAntes) || fotos[0];
  const depois = fotos.find(f => f.data === S.fotoDepois) || fotos.at(-1);
  const legenda = f => { const p = pesoNoDia(f.data); return `${dataCurta(f.data)}${p ? ` · ${kgBR(p.kg)} kg` : ''}`; };
  const opcoes = atual => fotos.map(f => `<option value="${f.data}" ${f.data === atual.data ? 'selected' : ''}>${dataCurta(f.data)}/${f.data.slice(2, 4)}</option>`).join('');
  return `<section class="block"><div class="row between"><span class="label">Fotos de antes e depois</span><span class="pill ok">🔒 Só você vê</span></div>
    ${S.fotosProg === null ? '<p class="muted">Carregando fotos…</p>' : ''}
    ${fotos.length >= 2 ? `<div class="comparar">
        <figure><img src="${antes.img}" alt="Foto de ${dataCurta(antes.data)}"><figcaption>
          <select id="fotoAntesSel" class="input" aria-label="Foto da esquerda">${opcoes(antes)}</select><span class="small muted">${legenda(antes)}</span></figcaption></figure>
        <figure><img src="${depois.img}" alt="Foto de ${dataCurta(depois.data)}"><figcaption>
          <select id="fotoDepoisSel" class="input" aria-label="Foto da direita">${opcoes(depois)}</select><span class="small muted">${legenda(depois)}</span></figcaption></figure>
      </div>` : fotos.length === 1 ? `<figure class="unica"><img src="${fotos[0].img}" alt="Foto de ${dataCurta(fotos[0].data)}"><figcaption class="small muted">${legenda(fotos[0])} · tire a próxima daqui a um mês para comparar</figcaption></figure>` : ''}
    <label class="drop" for="fotoProgIn">${S.fotoProgEnviando ? '<b>Salvando…</b>'
      : '<b>Adicionar foto de hoje</b><span class="small muted">Mesma pose, mesmo lugar e mesma luz a cada mês: a comparação fica justa.</span>'}</label>
    <input id="fotoProgIn" type="file" accept="image/*" hidden>
    ${fotos.length ? `<div class="miniaturas">${fotos.map(f => `<div><img src="${f.img}" alt="Foto de ${dataCurta(f.data)}"><span class="small tabular">${dataCurta(f.data)}</span>
      <button class="link" data-apagar-foto-prog="${f.data}">${S.confirmar === 'fp:' + f.data ? 'Confirmar' : 'Apagar'}</button></div>`).join('')}</div>` : ''}
  </section>`;
}

// ---------- Sequência e conquistas ----------

// Dias em que treinou (marcou exercício ou fez check-in), sem repetir
export function diasTreinados(registros, checkins) {
  const dias = new Set(checkins.map(c => c.data));
  Object.keys(registros).forEach(d => { if (registros[d]?.feitos?.length) dias.add(d); });
  return [...dias].sort();
}

// Sequência = dias de treino planejado cumpridos seguidos (descanso não quebra; hoje ainda não conta como falta)
export function sequencias(planoSemana, registros, checkins) {
  const dias = diasTreinados(registros, checkins);
  if (!dias.length) return { atual: 0, recorde: 0 };
  const hojeIso = isoDe(hoje());
  let atual = 0, recorde = 0, corrente = 0;
  const d = diaDe(dias[0]);
  while (isoDe(d) <= hojeIso) {
    const st = statusDia(d, planoSemana, registros, checkins);
    if (st === 'done') { corrente++; recorde = Math.max(recorde, corrente); }
    else if (st === 'missed') corrente = 0;
    d.setDate(d.getDate() + 1);
  }
  atual = corrente;
  return { atual, recorde };
}

// Semanas completas seguidas (treinou tudo o que estava planejado), contando a partir da passada
export function semanasCompletas(planoSemana, registros, checkins) {
  const semanas = semanasFrequencia(planoSemana, registros, checkins, 52);
  let seguidas = 0, melhor = 0, alguma = false;
  for (const s of semanas) {
    const completa = s.planejados > 0 && s.feitos >= s.planejados && (!s.atual || s.planejados === semanaPlanejada(planoSemana));
    if (s.atual && !completa) continue; // semana atual em andamento não quebra
    if (completa) { seguidas++; alguma = true; melhor = Math.max(melhor, seguidas); } else seguidas = 0;
  }
  return { seguidas, melhor, alguma };
}
export const semanaPlanejada = planoSemana => [0, 1, 2, 3, 4, 5, 6].filter(d => planoSemana[d]?.exercicios?.length).length;

export const CONQUISTAS = [
  { id: 'primeiro-treino', icone: '🏁', nome: 'Primeiro treino', desc: 'Marcou o primeiro treino', ok: c => c.total >= 1 },
  { id: 'primeiro-checkin', icone: '📸', nome: 'Primeiro check-in', desc: 'Fez o primeiro check-in na academia', ok: c => c.checkins >= 1 },
  { id: 'sequencia-3', icone: '🔥', nome: 'Pegando ritmo', desc: '3 treinos seguidos', ok: c => c.recorde >= 3 },
  { id: 'sequencia-7', icone: '🔥', nome: 'Imparável', desc: '7 treinos seguidos', ok: c => c.recorde >= 7 },
  { id: 'sequencia-20', icone: '⚡', nome: 'Máquina', desc: '20 treinos seguidos', ok: c => c.recorde >= 20 },
  { id: 'semana-completa', icone: '✅', nome: 'Semana completa', desc: 'Fez todos os treinos da semana', ok: c => c.semanaCompleta },
  { id: 'quatro-semanas', icone: '🏆', nome: 'Um mês firme', desc: '4 semanas completas seguidas', ok: c => c.melhorSemanas >= 4 },
  { id: 'treinos-10', icone: '💪', nome: '10 treinos', desc: '10 dias de treino', ok: c => c.total >= 10 },
  { id: 'treinos-50', icone: '🥇', nome: '50 treinos', desc: '50 dias de treino', ok: c => c.total >= 50 },
  { id: 'treinos-100', icone: '👑', nome: '100 treinos', desc: '100 dias de treino', ok: c => c.total >= 100 },
  { id: 'kg-1', icone: '⬇️', nome: 'Primeiro quilo', desc: 'Perdeu 1 kg desde o primeiro registro', ok: c => c.perdeu >= 1 },
  { id: 'kg-5', icone: '🎯', nome: '5 kg a menos', desc: 'Perdeu 5 kg desde o primeiro registro', ok: c => c.perdeu >= 5 },
  { id: 'kg-10', icone: '🌟', nome: '10 kg a menos', desc: 'Perdeu 10 kg desde o primeiro registro', ok: c => c.perdeu >= 10 },
  { id: 'faixa-saudavel', icone: '💚', nome: 'Faixa saudável', desc: 'Chegou à faixa de peso saudável', ok: c => c.entrouNaFaixa },
];

export function contextoConquistas(planoSemana, registros, checkins, pesos, alturaCm) {
  const seq = sequencias(planoSemana, registros, checkins);
  const sem = semanasCompletas(planoSemana, registros, checkins);
  const perdeu = pesos.length > 1 ? pesos[0].kg - pesos.at(-1).kg : 0;
  let entrouNaFaixa = false;
  if (alturaCm && pesos.length > 1) {
    const [min, max] = faixaSaudavel(alturaCm);
    entrouNaFaixa = pesos[0].kg > max && pesos.at(-1).kg <= max && pesos.at(-1).kg >= min;
  }
  return {
    total: diasTreinados(registros, checkins).length, checkins: checkins.length,
    atual: seq.atual, recorde: seq.recorde, semanaCompleta: sem.alguma, melhorSemanas: sem.melhor,
    semanasSeguidas: sem.seguidas, perdeu, entrouNaFaixa,
  };
}

// Selos: desbloqueados com a data (guardada no perfil) e os que faltam, apagados
export function gradeConquistas(ctx, guardadas, mostrarBloqueadas) {
  const lista = CONQUISTAS.filter(q => guardadas?.[q.id] || q.ok(ctx));
  const todasBloqueadas = mostrarBloqueadas ? CONQUISTAS.filter(q => !lista.includes(q)) : [];
  // Por padrão mostra só as próximas 3 a conquistar, para não encher a tela de selos apagados
  const bloqueadas = S.verTodasConquistas ? todasBloqueadas : todasBloqueadas.slice(0, 3);
  if (!lista.length && !bloqueadas.length) return '<p class="small muted">Nenhuma conquista ainda.</p>';
  return `<div class="selos">${lista.map(q => `<div class="selo"><span class="selo-icone">${q.icone}</span><b>${esc(q.nome)}</b>
      <span class="small muted">${guardadas?.[q.id] ? dataCurta(guardadas[q.id]) : esc(q.desc)}</span>
      </div>`).join('')}
    ${bloqueadas.map(q => `<div class="selo bloqueado"><span class="selo-icone">${q.icone}</span><b>${esc(q.nome)}</b><span class="small muted">${esc(q.desc)}</span></div>`).join('')}</div>
    ${todasBloqueadas.length > 3 ? `<button class="link" data-ver-conquistas>${S.verTodasConquistas ? 'Mostrar menos' : `Ver todas as ${CONQUISTAS.length} conquistas`}</button>` : ''}`;
}

export function cartaoSequencia(ctx) {
  const recorde = ctx.atual >= 2 && ctx.atual >= ctx.recorde ? 'Recorde atual! 🎉' : `Recorde: ${ctx.recorde}`;
  const semanas = ctx.semanasSeguidas ? ` · ${ctx.semanasSeguidas} ${ctx.semanasSeguidas === 1 ? 'semana completa' : 'semanas completas seguidas'}` : '';
  return `<div class="card row sequencia">
    <div class="fogo" aria-hidden="true">🔥</div>
    <div class="grow"><b class="tabular">${ctx.atual} ${ctx.atual === 1 ? 'treino seguido' : 'treinos seguidos'}</b>
      <p class="small muted">${recorde}${semanas}</p></div>
  </div>`;
}

// ---------- Calendário do ano (um quadradinho por dia, 52 semanas) ----------
export function calendarioAno() {
  const hojeIso = isoDe(hoje());
  const primeiro = diasTreinados(S.registros, S.checkins)[0];
  const inicio = new Date(semanaAtual()[0]); inicio.setDate(inicio.getDate() - 7 * 52);
  const semanas = [];
  const porMes = {};
  let total = 0;
  for (let w = 0; w < 53; w++) {
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicio); d.setDate(inicio.getDate() + w * 7 + i);
      const iso = isoDe(d);
      let st = iso > hojeIso ? 'futuro' : !primeiro || iso < primeiro ? 'antes' : statusDia(d);
      if (st === 'future') st = 'futuro';
      if (st === 'done') { total++; porMes[iso.slice(0, 7)] = (porMes[iso.slice(0, 7)] || 0) + 1; }
      dias.push({ iso, d, st });
    }
    semanas.push(dias);
  }
  const melhor = Object.entries(porMes).sort((a, b) => b[1] - a[1])[0];
  const nomeMesAbrev = d => d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  const rotulos = semanas.map((s, i) => (i === 0 || s[0].d.getMonth() !== semanas[i - 1][0].d.getMonth()) ? nomeMesAbrev(s[0].d) : '');
  // Rola até o fim (hoje) depois de desenhar
  setTimeout(() => { const el = document.getElementById('anoScroll'); if (el) el.scrollLeft = el.scrollWidth; }, 0);
  return `<section class="block"><div class="row between"><span class="label">Últimos 12 meses</span>
      <span class="small muted tabular">${total} ${total === 1 ? 'dia' : 'dias'} de treino</span></div>
    <div class="card">
      <div class="ano-scroll" id="anoScroll" role="img" aria-label="${total} dias de treino nos últimos 12 meses">
        <div class="ano">
          ${rotulos.map((r, i) => `<span class="ano-mes" style="grid-column:${i + 2}">${r}</span>`).join('')}
          ${['S', '', 'Q', '', 'S', '', 'D'].map((l, i) => `<span class="ano-dow" style="grid-row:${i + 2}">${l}</span>`).join('')}
          ${semanas.map((s, w) => s.map((dia, i) => `<i class="q ${dia.st}" style="grid-column:${w + 2};grid-row:${i + 2}" title="${dataCurta(dia.iso)}"></i>`).join('')).join('')}
        </div>
      </div>
      <div class="legend" style="margin-top:10px"><span><i style="background:var(--accent)"></i>Treinou</span><span><i style="background:var(--hot-soft);border:1px solid var(--hot)"></i>Faltou</span><span><i style="border:2px solid var(--rest);background:transparent"></i>Descanso</span></div>
    </div>
    ${melhor ? `<p class="small muted">Mês mais forte: <b>${new Date(melhor[0] + '-15T12:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</b>, com ${melhor[1]} ${melhor[1] === 1 ? 'dia' : 'dias'} de treino.</p>` : ''}
  </section>`;
}

// ---------- Sequência do casal ----------
// Conta os dias em que os dois treinaram; falta de qualquer um zera; descanso de um não quebra.
export function sequenciaCasal(eu, ela) {
  const diasEu = diasTreinados(eu.registros, eu.checkins), diasEla = diasTreinados(ela.registros, ela.checkins);
  if (!diasEu.length || !diasEla.length) return { atual: 0, recorde: 0, mes: 0 };
  const hojeIso = isoDe(hoje()), mes = hojeIso.slice(0, 7);
  const inicio = diasEu[0] > diasEla[0] ? diasEu[0] : diasEla[0];
  let corrente = 0, recorde = 0, noMes = 0;
  const d = diaDe(inicio);
  while (isoDe(d) <= hojeIso) {
    const a = statusDia(d, eu.plano, eu.registros, eu.checkins), b = statusDia(d, ela.plano, ela.registros, ela.checkins);
    if (a === 'done' && b === 'done') {
      corrente++; recorde = Math.max(recorde, corrente);
      if (isoDe(d).startsWith(mes)) noMes++;
    } else if (a === 'missed' || b === 'missed') corrente = 0;
    d.setDate(d.getDate() + 1);
  }
  return { atual: corrente, recorde, mes: noMes };
}

export function cartaoSequenciaCasal(atual, A, checkins) {
  if (!atual?.perm?.treinos || !A?.temPlano || !A?.temRegistros || A.bloqTreinos) return '';
  const nome = nomeDe(atual, 'atleta');
  const s = sequenciaCasal(
    { plano: S.plano, registros: S.registros, checkins: S.checkins },
    { plano: A.plano, registros: A.registros, checkins },
  );
  // Ela também me acompanha? Se não, só eu vejo este cartão
  const elaMeVe = S.conexoes.some(c => c.atleta === meuUid() && c.viewer === atual.atleta && c.status === 'aceita' && c.perm?.treinos);
  return `<section class="block"><span class="label">Vocês dois</span>
    <div class="card stack casal">
      <div class="row"><div class="fogo" aria-hidden="true">🔥</div>
        <div class="grow"><b class="tabular">${s.atual} ${s.atual === 1 ? 'dia' : 'dias'} treinando juntos</b>
          <p class="small muted">Recorde: ${s.recorde} · ${s.mes} ${s.mes === 1 ? 'dia' : 'dias'} juntos neste mês</p></div>
        </div>
      <p class="small muted">Conta quando os dois treinam no mesmo dia. Se alguém falta num dia de treino, recomeça; descanso não atrapalha.</p>
      ${elaMeVe ? '' : `<p class="small">Para ${esc(nome)} ver isso também, ela(e) precisa te acompanhar: passe o seu código (Perfil › Conexões).</p>`}
    </div></section>`;
}

// Quando aparece conquista nova, guarda no perfil e avisa quem acompanha (uma vez só)
export let verificandoConquistas = null;
export function verificarConquistas() {
  clearTimeout(verificandoConquistas);
  verificandoConquistas = setTimeout(async () => {
    const C = S.carregado;
    if (!S.user || !S.perfil || !(C.plano && C.registros && C.checkins && C.pesos)) return;
    const ctx = contextoConquistas(S.plano, S.registros, S.checkins, S.pesos, S.perfil.alturaCm);
    const guardadas = S.perfil.conquistas;
    const novas = CONQUISTAS.filter(q => q.ok(ctx) && !guardadas?.[q.id]);
    if (!novas.length) return;
    const primeiraVez = !guardadas; // quem já usava o app antes das conquistas: registra sem alarde
    try {
      await Store.registrarConquistas(uid(), novas.map(q => q.id), isoDe(hoje()));
      if (primeiraVez) return;
      toast(`🏆 Nova conquista: ${novas.map(q => q.nome).join(', ')}`);
      novas.forEach(q => Store.avisar({ evento: 'conquista', id: q.id, nome: `${q.icone} ${q.nome}` }));
    } catch (err) { console.warn('Conquistas', err); }
  }, 800);
}

// ---------- Meta do casal (por mês, com recompensa) ----------
export const mesAtual = () => isoDe(hoje()).slice(0, 7);
export const nomeMes = mes => new Date(mes + '-15T12:00').toLocaleDateString('pt-BR', { month: 'long' });
export const treinosNoMes = (registros, checkins, mes = mesAtual()) => diasTreinados(registros, checkins).filter(d => d.startsWith(mes)).length;

// lado = 'atleta' (ela, vendo a meta com quem acompanha) ou 'viewer' (quem acompanha)
// feitos = treinos no mês, ou null quando quem acompanha não tem permissão de ver
export function cartaoMetaCasal(c, lado, feitos, nomeOutro) {
  const mes = mesAtual();
  const meta = c.meta?.mes === mes ? c.meta : null;
  const outro = lado === 'atleta' ? nomeDe(c, 'viewer') : nomeOutro || nomeDe(c, 'atleta');
  const editando = S.editandoMeta === c.id || !meta;
  const form = `<form class="stack" data-meta-casal="${c.id}">
      <div class="row">
        <div class="field" style="width:96px"><label class="label" for="metaTreinos-${c.id}">Treinos</label>
          <input id="metaTreinos-${c.id}" type="text" inputmode="numeric" maxlength="2" value="${meta?.treinos ?? c.meta?.treinos ?? 12}"></div>
        <div class="field grow"><label class="label" for="metaRecompensa-${c.id}">Recompensa</label>
          <input id="metaRecompensa-${c.id}" maxlength="60" value="${esc(meta?.recompensa ?? c.meta?.recompensa ?? '')}" placeholder="Ex.: jantar especial"></div>
      </div>
      <div class="row">${meta ? `<button class="btn ghost" type="button" data-cancelar-meta>Cancelar</button>` : ''}<button class="btn" type="submit">Salvar meta</button></div>
    </form>`;
  if (!meta || editando) {
    return `<section class="block"><span class="label">Meta do casal · ${nomeMes(mes)}</span>
      <div class="card stack">${meta ? '' : (lado === 'atleta'
        ? `<p class="small">Combine com ${esc(outro)} quantos treinos você vai fazer em ${nomeMes(mes)} e qual é a recompensa quando bater.</p>`
        : `<p class="small">Combine com ${esc(outro)} quantos treinos fazer em ${nomeMes(mes)} e qual é a recompensa quando bater.</p>`)}${form}</div></section>`;
  }
  // Quem acompanha pode não ver todos os treinos (permissões): a marca "batida" vale de qualquer jeito
  if (meta.batida && feitos !== null) feitos = Math.max(feitos, meta.treinos);
  const pct = feitos === null ? 0 : Math.min(100, Math.round(100 * feitos / meta.treinos));
  const batida = meta.batida || (feitos !== null && feitos >= meta.treinos);
  const falta = feitos === null ? 0 : meta.treinos - feitos;
  return `<section class="block"><div class="row between"><span class="label">Meta do casal · ${nomeMes(mes)}</span>
      <button class="link" data-editar-meta="${c.id}">Editar</button></div>
    <div class="card stack ${batida ? 'aviso' : ''}">
      <div class="row between"><h3 class="grow">${meta.treinos} ${meta.treinos === 1 ? 'treino' : 'treinos'}</h3>${feitos === null ? '' : `<span class="small tabular">${Math.min(feitos, meta.treinos)}/${meta.treinos}</span>`}</div>
      ${feitos === null && !batida ? `<p class="small muted">Para ver o progresso, ${esc(outro)} precisa liberar ver treinos ou check-ins.</p>` : `<div class="bar"><i style="width:${batida ? 100 : pct}%"></i></div>`}
      <p class="small">🎁 ${esc(meta.recompensa || 'Recompensa a combinar')}</p>
      ${batida ? `<p><b>Meta batida! 🎉</b> ${lado === 'atleta' ? `Hora de cobrar de ${esc(outro)}.` : 'Hora de cumprir a recompensa.'}</p>`
        : feitos !== null ? `<p class="small muted">${falta === 1 ? 'Falta 1 treino' : `Faltam ${falta} treinos`}.</p>` : ''}
    </div></section>`;
}

// Quando ela bate a meta, marca na conexão e avisa quem acompanha (uma vez por mês)
export function verificarMetas() {
  if (!S.user || !(S.carregado.registros && S.carregado.checkins)) return;
  const feitos = treinosNoMes(S.registros, S.checkins);
  meusAcompanhantes().forEach(c => {
    const m = c.meta;
    if (!m || m.mes !== mesAtual() || m.batida || feitos < m.treinos) return;
    Store.salvarMetaCasal(c.id, { ...m, batida: true }).then(() => {
      toast(`🎉 Meta do mês batida! ${m.recompensa ? 'Recompensa: ' + m.recompensa : ''}`);
      Store.avisar({ evento: 'metaBatida', conexaoId: c.id });
    }, err => console.warn('Meta do casal', err));
  });
}

// ---------- IMC ----------
export const FAIXAS_IMC = [
  { ate: 18.5, nome: 'Abaixo do peso', cor: 'wait' },
  { ate: 25, nome: 'Peso normal', cor: 'ok' },
  { ate: 30, nome: 'Sobrepeso', cor: 'wait' },
  { ate: 35, nome: 'Obesidade grau I', cor: 'bad' },
  { ate: 40, nome: 'Obesidade grau II', cor: 'bad' },
  { ate: Infinity, nome: 'Obesidade grau III', cor: 'bad' },
];
export const calcImc = (kg, cm) => kg / ((cm / 100) ** 2);
export const faixaImc = imc => FAIXAS_IMC.find(f => imc < f.ate);
export const faixaSaudavel = cm => [18.5 * (cm / 100) ** 2, 24.9 * (cm / 100) ** 2];
export const alturaBR = cm => (cm / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Ritmo das últimas 4 semanas em kg por semana (negativo = perdendo). null = poucos dados.
export function ritmoSemanal(pesos) {
  if (pesos.length < 2) return null;
  const fim = diaDe(pesos.at(-1).data);
  const janela = pesos.filter(p => (fim - diaDe(p.data)) / 86400000 <= 28);
  const ini = janela[0], ult = janela.at(-1);
  const dias = (diaDe(ult.data) - diaDe(ini.data)) / 86400000;
  if (janela.length < 2 || dias < 7) return null;
  return (ult.kg - ini.kg) / (dias / 7);
}

// Régua do IMC de 15 a 40 com as faixas coloridas e um marcador
export function reguaImc(imc) {
  const de = 15, ate = 40, pos = v => (Math.min(ate, Math.max(de, v)) - de) / (ate - de) * 100;
  const zonas = [[de, 18.5, 'z-alerta'], [18.5, 25, 'z-ok'], [25, 30, 'z-alerta'], [30, ate, 'z-ruim']];
  return `<div class="regua" aria-hidden="true">
    ${zonas.map(([a, b, c]) => `<span class="${c}" style="left:${pos(a)}%;width:${pos(b) - pos(a)}%"></span>`).join('')}
    <i style="left:${pos(imc)}%"></i>
  </div>
  <div class="regua-num tabular" aria-hidden="true">${[18.5, 25, 30, 35].map(v => `<span style="left:${pos(v)}%">${String(v).replace('.', ',')}</span>`).join('')}</div>`;
}

// proprio = é o meu IMC (mostra quanto falta e a previsão); senão é o de quem eu acompanho
export function cartaoImc(pesos, alturaCm, proprio, meta) {
  if (!pesos.length) return '';
  if (!alturaCm) {
    return proprio ? `<div class="card stack"><h3>Veja seu IMC</h3><p class="small muted">Coloque sua altura no Perfil para ver o IMC e a faixa de peso saudável.</p>
      <button class="btn sm ghost" data-aba="dados">Colocar altura</button></div>` : '';
  }
  const kg = pesos.at(-1).kg, imc = calcImc(kg, alturaCm), faixa = faixaImc(imc);
  const [min, max] = faixaSaudavel(alturaCm);
  let detalhe = '';
  if (proprio) {
    const ritmo = ritmoSemanal(pesos);
    if (kg > max) {
      const falta = kg - max;
      detalhe = `<p>Faltam <b class="tabular">${kgBR(falta)} kg</b> para chegar a ${kgBR(max)} kg, o topo da faixa saudável.</p>`;
      if (ritmo !== null && ritmo < -0.05) {
        const semanas = Math.ceil(falta / -ritmo);
        const quando = new Date(); quando.setDate(quando.getDate() + semanas * 7);
        detalhe += `<p class="small">Nesse ritmo (${variacao(ritmo)} por semana), cerca de <b>${semanas} ${semanas === 1 ? 'semana' : 'semanas'}</b>, perto de ${quando.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}.</p>`;
      } else if (ritmo === null) {
        detalhe += '<p class="small muted">Registre o peso toda semana para ver em quanto tempo você chega lá.</p>';
      } else {
        detalhe += '<p class="small muted">Nas últimas semanas o peso ficou estável. Normal acontecer: o corpo às vezes dá uma pausa.</p>';
      }
      if (ritmo !== null && ritmo < -1.2) {
        detalhe += '<p class="small erro">Você está perdendo mais de 1 kg por semana. É bastante: vale conversar com um nutricionista para perder de forma segura.</p>';
      }
      if (!meta) detalhe += `<button class="btn sm ghost" data-meta-sugerida="${max.toFixed(1)}">Usar ${kgBR(max)} kg como meta</button>`;
    } else if (kg < min) {
      detalhe = '<p>Você está abaixo da faixa saudável. Antes de continuar perdendo peso, vale conversar com um nutricionista.</p>';
    } else {
      detalhe = '<p>Você está na faixa saudável 🎉</p>';
    }
  }
  return `<div class="card stack">
    <div class="row between"><div><span class="label">IMC</span><div class="imc tabular">${imc.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}</div></div>
      <span class="pill ${faixa.cor}">${faixa.nome}</span></div>
    ${reguaImc(imc)}
    <p class="small">Faixa saudável para ${alturaBR(alturaCm)} m: <b class="tabular">${kgBR(min)} a ${kgBR(max)} kg</b></p>
    ${detalhe}
    ${proprio ? '<p class="small muted">O IMC não separa músculo de gordura. Com musculação, o peso pode travar enquanto o corpo muda: acompanhe também as medidas.</p>' : ''}
  </div>`;
}

// ---------- Medidas ----------
export const MEDIDAS = [['cintura', 'Cintura'], ['quadril', 'Quadril'], ['braco', 'Braço']];

export function secaoMedidas() {
  const lista = S.medidas;
  const sel = S.medidaSel || 'cintura';
  const pontos = lista.filter(m => Number.isFinite(m[sel])).map(m => ({ data: m.data, kg: m[sel] }));
  const resumo = MEDIDAS.map(([k, nome]) => {
    const vals = lista.filter(m => Number.isFinite(m[k]));
    if (!vals.length) return `<div class="stat"><span class="label">${nome}</span><b>—</b><span class="small muted">cm</span></div>`;
    const dif = vals.at(-1)[k] - vals[0][k];
    return `<div class="stat"><span class="label">${nome}</span><b class="tabular">${kgBR(vals.at(-1)[k])}</b>
      <span class="small muted">${vals.length > 1 ? `${variacao(dif, 'cm')} desde ${dataCurta(vals[0].data)}` : 'cm'}</span></div>`;
  }).join('');
  const recentes = lista.slice(-3).reverse();
  return `<section class="block"><span class="label">Medidas (cm)</span>
    ${lista.length ? `<div class="grid3">${resumo}</div>
      <div class="chips">${MEDIDAS.map(([k, nome]) => `<button class="chip ${k === sel ? 'on' : ''}" data-medida-sel="${k}">${nome}</button>`).join('')}</div>
      <div class="card">${graficoLinha('medida-' + sel, pontos, null, 'cm', MEDIDAS.find(m => m[0] === sel)[1].toLowerCase())}</div>`
      : '<p class="small muted">Meça uma vez por mês, sempre no mesmo lugar: cintura na altura do umbigo, quadril na parte mais larga e braço no meio, relaxado.</p>'}
    <form id="formMedida" class="card stack">
      <div class="field"><label class="label" for="medData">Dia</label><input id="medData" type="date" max="${isoDe(hoje())}" value="${isoDe(hoje())}" required></div>
      <div class="grid3">${MEDIDAS.map(([k, nome]) => `<div class="field"><label class="label" for="med-${k}">${nome}</label>
        <input id="med-${k}" type="text" inputmode="decimal" autocomplete="off" maxlength="5" placeholder="cm"></div>`).join('')}</div>
      <button class="btn" type="submit">Registrar medidas</button>
    </form>
    ${recentes.length ? `<div class="card">${recentes.map(m => `<div class="ex"><div class="grow small tabular"><b>${dataCurta(m.data)}</b> ·
      ${MEDIDAS.filter(([k]) => Number.isFinite(m[k])).map(([k, nome]) => `${nome.toLowerCase()} ${kgBR(m[k])}`).join(' · ')}</div>
      <button class="link" data-apagar-medida="${m.data}">${S.confirmar === 'medida:' + m.data ? 'Confirmar' : 'Apagar'}</button></div>`).join('')}</div>` : ''}
    <p class="small muted">Suas medidas são só suas: quem te acompanha não vê.</p>
  </section>`;
}

// Barras de treinos por semana: trilho = planejados, barra = feitos
export function graficoFrequencia(id, semanas) {
  if (!semanas.length) return '<p class="small muted">Ainda sem semanas para comparar.</p>';
  const W = 340, H = 140, esq = 8, dir = 8, topo = 10, base = 24;
  const teto = Math.max(1, ...semanas.map(s => Math.max(s.planejados, s.feitos)));
  const larg = (W - esq - dir) / semanas.length;
  const barra = Math.min(26, larg - 8);
  const y = v => topo + (teto - v) / teto * (H - topo - base);
  const sel = Math.min(S.dica[id] ?? semanas.length - 1, semanas.length - 1);
  const s = semanas[sel];
  // Barra com as pontas de cima arredondadas (4px), apoiada na base
  const coluna = (cx, v, classe) => {
    if (!v) return '';
    const x0 = cx - barra / 2, y0 = y(v), y1 = H - base, r = Math.min(4, (y1 - y0) / 2);
    return `<path d="M${x0},${y1} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + barra - r} Q${x0 + barra},${y0} ${x0 + barra},${y0 + r} V${y1} Z" class="${classe}"/>`;
  };
  return `<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img" aria-label="Treinos por semana nas últimas ${semanas.length} semanas">
    <line x1="${esq}" x2="${W - dir}" y1="${H - base}" y2="${H - base}" class="g-grade"/>
    ${semanas.map((q, i) => {
      const cx = esq + larg * (i + 0.5);
      return `${coluna(cx, q.planejados, 'g-trilho')}${coluna(cx, q.feitos, `g-barra ${i === sel ? 'sel' : ''}`)}
        <text x="${cx}" y="${H - 8}" text-anchor="middle" class="g-texto">${q.atual ? 'agora' : dataCurta(q.inicio)}</text>
        <rect x="${cx - larg / 2}" y="0" width="${larg}" height="${H}" class="g-alvo" data-dica="${id}" data-i="${i}" tabindex="0" role="button" aria-label="Semana de ${dataCurta(q.inicio)}: ${q.feitos} de ${q.planejados} treinos"/>`;
    }).join('')}
  </svg>
  <p class="small dica tabular"><b>${s.feitos} de ${s.planejados} treinos</b> na semana ${s.atual ? 'atual (até hoje)' : `de ${dataCurta(s.inicio)}`}</p>
  <div class="legend"><span><i style="background:var(--accent)"></i>Treinou</span><span><i style="background:var(--plan-soft);border:1px solid var(--plan)"></i>Planejado</span></div>`;
}

export function resumoPeso(pesos, meta) {
  if (!pesos.length) return '';
  const atual = pesos.at(-1).kg, perdeu = pesos[0].kg - atual;
  const falta = meta ? atual - meta : null;
  return `<div class="grid3">
    <div class="stat"><span class="label">Atual</span><b class="tabular">${kgBR(atual)}</b><span class="small muted">kg</span></div>
    <div class="stat"><span class="label">${perdeu >= 0 ? 'Perdeu' : 'Ganhou'}</span><b class="tabular">${kgBR(Math.abs(perdeu))}</b><span class="small muted">kg desde ${dataCurta(pesos[0].data)}</span></div>
    <div class="stat"><span class="label">Meta</span><b class="tabular">${meta ? (falta > 0 ? kgBR(falta) : '✓') : '—'}</b><span class="small muted">${meta ? (falta > 0 ? `kg para ${kgBR(meta)}` : 'meta batida!') : 'defina no Perfil'}</span></div>
  </div>`;
}

// Quem acompanha não vê a meta (fica no perfil dela, que é privado)
export function resumoPesoAcomp(pesos) {
  if (!pesos.length) return '';
  const atual = pesos.at(-1).kg, perdeu = pesos[0].kg - atual;
  return `<div class="grid3">
    <div class="stat"><span class="label">Atual</span><b class="tabular">${kgBR(atual)}</b><span class="small muted">kg</span></div>
    <div class="stat"><span class="label">${perdeu >= 0 ? 'Perdeu' : 'Ganhou'}</span><b class="tabular">${kgBR(Math.abs(perdeu))}</b><span class="small muted">kg</span></div>
    <div class="stat"><span class="label">Desde</span><b class="tabular">${dataCurta(pesos[0].data)}</b><span class="small muted">${pesos.length} registros</span></div>
  </div>`;
}

// ---------- Corpo ----------
export function telaPeso() {
  const meta = S.perfil?.metaPeso || null;
  const recentes = S.pesos.slice(-5).reverse();
  return `${cabecalho()}
  <section class="block"><span class="label">Peso</span>
    ${resumoPeso(S.pesos, meta)}
    ${cartaoImc(S.pesos, S.perfil?.alturaCm, true, meta)}
    <div class="card">${graficoPeso('meuPeso', S.pesos, meta)}</div>
    <form id="formPeso" class="card stack">
      <div class="row">
        <div class="field grow"><label class="label" for="pesoData">Dia</label><input id="pesoData" type="date" max="${isoDe(hoje())}" value="${isoDe(hoje())}" required></div>
        <div class="field grow"><label class="label" for="pesoKg">Peso (kg)</label><input id="pesoKg" type="text" inputmode="decimal" autocomplete="off" maxlength="6" placeholder="${S.pesos.at(-1) ? kgBR(S.pesos.at(-1).kg) : 'Ex.: 72,5'}" required></div>
      </div>
      <button class="btn" type="submit">Registrar peso</button>
      <p class="small muted">Dica: pese-se sempre no mesmo horário, de preferência de manhã. Uma vez por semana já mostra a tendência.</p>
    </form>
    ${recentes.length ? `<div class="card">${recentes.map(p => `<div class="ex"><div class="grow tabular"><b>${kgBR(p.kg)} kg</b> <span class="small muted">${dataCurta(p.data)}</span></div>
      <button class="link" data-apagar-peso="${p.data}">${S.confirmar === 'peso:' + p.data ? 'Confirmar' : 'Apagar'}</button></div>`).join('')}</div>` : ''}
    <p class="small muted">Quem te acompanha só vê seu peso e IMC se você ligar "Ver meu peso" em Perfil › Conexões.</p>
  </section>`;
}
export function telaMedidas() { return cabecalho() + secaoMedidas(); }
export function telaFotos() { return cabecalho() + secaoFotosProgresso(); }

// ---------- Evolução ----------
export function telaConquistas() {
  const ctx = contextoConquistas(S.plano, S.registros, S.checkins, S.pesos, S.perfil?.alturaCm);
  const qtd = CONQUISTAS.filter(q => S.perfil?.conquistas?.[q.id] || q.ok(ctx)).length;
  return `${cabecalho()}
  <section class="block"><span class="label">Sequência</span>${cartaoSequencia(ctx)}</section>
  <section class="block"><div class="row between"><span class="label">Conquistas</span><span class="small muted tabular">${qtd} de ${CONQUISTAS.length}</span></div>
    ${gradeConquistas(ctx, S.perfil?.conquistas, true)}</section>`;
}

// ---------- Resumo do mês (retrospectiva) ----------
// Mês mostrado: até o dia 5, o mês que passou (o "fechado"); depois, o mês atual até hoje
export const mesPadraoResumo = () => {
  const d = hoje();
  if (d.getDate() > 5) return mesAtual();
  return isoDe(new Date(d.getFullYear(), d.getMonth() - 1, 15)).slice(0, 7);
};
const mesAnterior = mes => { const [a, m] = mes.split('-').map(Number); return isoDe(new Date(a, m - 2, 15)).slice(0, 7); };
const mesSeguinte = mes => { const [a, m] = mes.split('-').map(Number); return isoDe(new Date(a, m, 15)).slice(0, 7); };

export function resumoDoMes(mes) {
  const hojeIso = isoDe(hoje());
  const [a, m] = mes.split('-').map(Number);
  const dias = Array.from({ length: new Date(a, m, 0).getDate() }, (_, i) => new Date(a, m - 1, i + 1, 12)).filter(d => isoDe(d) <= hojeIso);
  const st = dias.map(d => statusDia(d));
  const treinos = st.filter(s => s === 'done').length;
  const faltas = st.filter(s => s === 'missed').length;
  const planejados = dias.filter(d => temTreinoNoDia(S.plano, d)).length;
  // Maior sequência dentro do mês
  let seq = 0, melhorSeq = 0;
  st.forEach(s => { if (s === 'done') { seq++; melhorSeq = Math.max(melhorSeq, seq); } else if (s === 'missed') seq = 0; });
  const checkins = S.checkins.filter(c => c.data.startsWith(mes)).length;
  // Peso: último registro antes do mês (ou o primeiro do mês) até o último do mês
  const noMes = S.pesos.filter(p => p.data.startsWith(mes));
  const antes = S.pesos.filter(p => p.data < mes + '-01').at(-1) || noMes[0];
  const peso = noMes.length && antes ? { de: antes.kg, para: noMes.at(-1).kg, dif: noMes.at(-1).kg - antes.kg } : null;
  // Cintura do mesmo jeito
  const medNoMes = S.medidas.filter(x => x.data.startsWith(mes) && Number.isFinite(x.cintura));
  const medAntes = S.medidas.filter(x => x.data < mes + '-01' && Number.isFinite(x.cintura)).at(-1) || medNoMes[0];
  const cintura = medNoMes.length && medAntes ? medNoMes.at(-1).cintura - medAntes.cintura : null;
  // Carga que mais subiu: maior carga no mês × maior carga antes do mês
  let destaque = null;
  Object.entries(historicoCargas(S.registros)).forEach(([nome, pts]) => {
    const antesKg = Math.max(0, ...pts.filter(p => p.data < mes + '-01').map(p => p.kg));
    const mesKg = Math.max(0, ...pts.filter(p => p.data.startsWith(mes)).map(p => p.kg));
    if (antesKg > 0 && mesKg > antesKg) {
      const pct = Math.round(100 * (mesKg - antesKg) / antesKg);
      if (!destaque || pct > destaque.pct) destaque = { nome, de: antesKg, para: mesKg, pct };
    }
  });
  const conquistas = CONQUISTAS.filter(q => S.perfil?.conquistas?.[q.id]?.startsWith(mes));
  return { treinos, faltas, planejados, melhorSeq, checkins, peso, cintura, destaque, conquistas, terminou: mes < mesAtual() };
}

export function telaResumoMes() {
  const mes = S.mesResumo || mesPadraoResumo();
  const r = resumoDoMes(mes);
  const ant = resumoDoMes(mesAnterior(mes));
  const nome = new Date(mes + '-15T12:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const titulo = nome.charAt(0).toUpperCase() + nome.slice(1);
  const difTreinos = r.treinos - ant.treinos;
  const pct = r.planejados ? Math.round(100 * Math.min(r.treinos, r.planejados) / r.planejados) : null;
  const frase = !r.treinos ? 'Nenhum treino registrado neste mês.'
    : pct !== null && pct >= 90 ? 'Mês impecável. Constância é o que dá resultado 🏆'
    : pct !== null && pct >= 60 ? 'Bom mês! Dá para chegar ainda mais longe no próximo 💪'
    : 'Todo treino conta. O próximo mês é uma página em branco 🌱';
  const item = (icone, valor, texto) => `<div class="ret-item"><span class="ret-icone" aria-hidden="true">${icone}</span><div><b class="tabular">${valor}</b><p class="small muted">${texto}</p></div></div>`;
  return `${cabecalho()}
  <section class="block">
    <div class="row between"><button class="icone" data-mes-resumo="${mesAnterior(mes)}" aria-label="Mês anterior">‹</button>
      <h2 class="mes-titulo">${titulo}${r.terminou ? '' : ' <span class="small muted">(até hoje)</span>'}</h2>
      <button class="icone" data-mes-resumo="${mesSeguinte(mes)}" aria-label="Próximo mês" ${mes >= mesAtual() ? 'disabled' : ''}>›</button></div>
    <div class="card stack retro">
      <div class="ret-topo"><span class="ret-grande tabular">${r.treinos}</span>
        <div><b>${r.treinos === 1 ? 'treino' : 'treinos'}</b><p class="small muted">${r.planejados ? `de ${r.planejados} planejados${pct !== null ? ` · ${pct}%` : ''}` : 'no mês'}</p></div></div>
      <p>${frase}</p>
      ${ant.treinos || r.treinos ? `<p class="small ${difTreinos >= 0 ? 'ok-txt' : 'muted'}">${difTreinos > 0 ? `▲ ${difTreinos} a mais que o mês anterior` : difTreinos < 0 ? `▼ ${-difTreinos} a menos que o mês anterior` : 'Mesmo número de treinos do mês anterior'}</p>` : ''}
    </div>
    <div class="ret-grade">
      ${item('🔥', r.melhorSeq, r.melhorSeq === 1 ? 'treino seguido (maior sequência)' : 'treinos seguidos (maior sequência)')}
      ${item('📍', r.checkins, r.checkins === 1 ? 'check-in na academia' : 'check-ins na academia')}
      ${r.peso ? item('⚖️', `${r.peso.dif <= 0 ? '−' : '+'}${kgBR(Math.abs(r.peso.dif))} kg`, `de ${kgBR(r.peso.de)} para ${kgBR(r.peso.para)} kg`) : ''}
      ${r.cintura !== null ? item('📏', `${r.cintura <= 0 ? '−' : '+'}${kgBR(Math.abs(r.cintura))} cm`, 'na cintura') : ''}
      ${r.destaque ? item('🏋️', `+${r.destaque.pct}%`, `${esc(r.destaque.nome)}: de ${kgBR(r.destaque.de)} para ${kgBR(r.destaque.para)} kg`) : ''}
      ${r.faltas ? item('🗓️', r.faltas, r.faltas === 1 ? 'falta em dia de treino' : 'faltas em dias de treino') : ''}
    </div>
    ${r.conquistas.length ? `<span class="label">Conquistas do mês</span>
      <div class="selos">${r.conquistas.map(q => `<div class="selo"><span class="selo-icone">${q.icone}</span><b>${esc(q.nome)}</b></div>`).join('')}</div>` : ''}
  </section>`;
}

// Do dia 1 ao 5, a tela Hoje lembra que o resumo do mês que passou está pronto
export function convitResumoMes() {
  if (hoje().getDate() > 5) return '';
  const mes = mesPadraoResumo();
  if (!resumoDoMes(mes).treinos) return '';
  let visto = false;
  try { visto = localStorage.getItem('resumo-visto') === mes; } catch { /* ok */ }
  if (visto) return '';
  return `<section class="block"><button class="card row atalho" data-aba="mes" data-mes-resumo="${mes}">📊 <span class="grow">Seu resumo de ${nomeMes(mes)} está pronto</span><span class="link">Ver</span></button></section>`;
}

export function telaFrequencia() {
  const semanas = semanasFrequencia(S.plano, S.registros, S.checkins);
  const media = semanas.length ? semanas.reduce((a, s) => a + s.feitos, 0) / semanas.length : 0;
  const r = resumoSemana();
  return `${cabecalho()}
  <section class="block"><span class="label">Esta semana</span>
    <div class="grid3">
      <div class="stat"><span class="label">Treinou</span><b class="tabular">${r.feitos}</b><span class="small muted">${r.feitos === 1 ? 'dia' : 'dias'}</span></div>
      <div class="stat"><span class="label">Faltou</span><b class="tabular">${r.faltas}</b><span class="small muted">${r.faltas === 1 ? 'dia' : 'dias'}</span></div>
      <div class="stat"><span class="label">Planejado</span><b class="tabular">${r.planejados}</b><span class="small muted">${r.planejados === 1 ? 'treino' : 'treinos'}</span></div>
    </div></section>
  <section class="block"><div class="row between"><span class="label">Treinos por semana</span>
    ${semanas.length ? `<span class="small muted tabular">média ${media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por semana</span>` : ''}</div>
    <div class="card">${graficoFrequencia('minhaFreq', semanas)}</div>
  </section>
  ${calendarioAno()}`;
}
export function telaCargas() { return cabecalho() + secaoCargas(); }

export function formConectar() {
  return `<form id="formConexao" class="stack">
    <div class="field"><label class="label" for="codigoIn">Código da pessoa</label>
      <input id="codigoIn" placeholder="FIT-AB12" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="10" required></div>
    <p class="erro" id="conexaoErro" hidden></p>
    <button class="btn" type="submit" id="conexaoBtn">Pedir para acompanhar</button>
  </form>`;
}
