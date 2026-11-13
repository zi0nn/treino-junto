/* Treino Junto · js/treino.js
   Login, cabeçalho, treino do dia, séries e cronômetro de descanso,
   modelos prontos, check-in com foto, tela Hoje, Semana e Histórico. */
import * as Store from '../store.js';
import { render, salvar, uid } from '../app.js';
import { $, ABAS, DIAS, DIAS_NOME, S, SUGESTOES, app, esc, hoje, isoDe, meuUid, mostrarNav, nomeDe, pad, pedidosRecebidos, resumoSemana, semanaAtual, statusDia, subnav, temTreinoNoDia, toast } from './base.js';
import { convitAvisos, permissao } from './perfil.js';
import { campoCarga, convitResumoMes, diaDe, kgBR, porTempo, sequencias, sugestaoCarga } from './progresso.js';

// ---------- Telas ----------
export function telaSemConfig() {
  mostrarNav(false);
  app.innerHTML = `<div class="hero"><span class="label">Falta um passo</span><h1>Treino Junto</h1>
    <p class="muted">O app ainda não está ligado ao Firebase. Abra o arquivo <b>firebase-config.js</b> e cole os dados do seu projeto, como explicado no <b>COMO-CONFIGURAR.md</b>.</p></div>`;
}

export function telaLogin() {
  mostrarNav(false);
  const criar = S.modoLogin === 'criar';
  app.innerHTML = `
  <div class="hero"><h1>Treino Junto</h1>
    <p class="muted">Monte seus treinos da semana, marque o que já fez e treine junto com quem te incentiva.</p></div>
  <div class="seg" role="tablist">
    <button type="button" data-modo="entrar" class="${criar ? '' : 'on'}">Entrar</button>
    <button type="button" data-modo="criar" class="${criar ? 'on' : ''}">Criar conta</button>
  </div>
  <form class="stack" id="formLogin" style="margin-top:14px" novalidate>
    ${criar ? `<div class="field"><label class="label" for="lnome">Nome</label><input id="lnome" autocomplete="given-name" placeholder="Como quer ser chamada(o)" required maxlength="40"></div>` : ''}
    <div class="field"><label class="label" for="lemail">E-mail</label>
      <input id="lemail" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="nome@email.com" required></div>
    <div class="field"><label class="label" for="lsenha">Senha</label>
      <input id="lsenha" type="password" autocomplete="${criar ? 'new-password' : 'current-password'}" placeholder="${criar ? 'Pelo menos 6 caracteres' : '••••••••'}" required></div>
    <p class="erro" id="loginErro" hidden></p>
    <button class="btn" type="submit" id="loginBtn">${criar ? 'Criar conta' : 'Entrar'}</button>
    ${criar ? '' : '<button class="link" type="button" data-acao="esqueci">Esqueci minha senha</button>'}
  </form>
  <div class="ou"><span>ou</span></div>
  <button class="btn ghost google" data-acao="google">
    <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.7 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.6-2.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7.1l3.6 2.8C6.6 7.4 9.1 5.4 12 5.4z"/></svg>
    Entrar com Google</button>
  <p class="small muted centro">Ao entrar, você concorda com a nossa <a class="link" href="privacidade.html">política de privacidade</a>.</p>`;
}

// Título da tela + subabas. Na tela Hoje o título é o "Oi, fulano".
export function cabecalho() {
  const d = hoje();
  const nome = S.perfil?.nome || S.user?.nome || '';
  const titulo = S.aba === 'treino' && S.sub.treino === 'hoje' ? `Oi, ${esc(nome.split(' ')[0])}` : ABAS.find(a => a[0] === S.aba)[1];
  return `<div class="top"><div class="grow"><span class="label">${DIAS_NOME[d.getDay()]}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
    <h1>${titulo}</h1></div></div>${subnav()}`;
}

export function cartaoTreino(dia, data, planoSemana = S.plano, registros = S.registros, editavel = true) {
  const plano = planoSemana[dia];
  if (!plano?.exercicios?.length) {
    return `<div class="card stack"><h3>Dia de descanso</h3><p class="muted small">Nenhum treino planejado para ${DIAS_NOME[dia].toLowerCase()}.</p>
      ${editavel ? `<button class="btn sm ghost" data-aba="semana" data-dia="${dia}">Montar treino deste dia</button>` : ''}</div>`;
  }
  const feitos = registros[data]?.feitos || [];
  const qtd = plano.exercicios.filter(e => feitos.includes(e.id)).length;
  const pct = Math.round(100 * qtd / plano.exercicios.length);
  return `<div class="card stack">
    <div class="row between"><h2 class="grow">${esc(plano.titulo || 'Treino de ' + DIAS_NOME[dia].toLowerCase())}</h2><span class="small muted tabular">${qtd}/${plano.exercicios.length}</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div>${plano.exercicios.map(e => {
      const ok = feitos.includes(e.id);
      return `<div class="ex ${ok ? 'ok' : ''}">
        ${editavel ? `<button class="chk" data-marcar="${e.id}" aria-pressed="${ok}" aria-label="${ok ? 'Desmarcar' : 'Marcar'} ${esc(e.nome)}">${ok ? '✓' : ''}</button>`
          : `<span class="chk" aria-label="${ok ? 'Feito' : 'Não feito'}">${ok ? '✓' : ''}</span>`}
        <div class="grow"><div class="ex-nome">${esc(e.nome)}</div><div class="small muted tabular">${descricaoEx(e)}</div>
          ${editavel && data === isoDe(hoje()) && !ok ? linhaSugestao(e) : ''}
          ${editavel && data === isoDe(hoje()) ? controlesSerie(e, ok) : ''}</div>
        ${editavel ? campoCarga(e, registros[data]?.cargas?.[e.id]?.kg) : registros[data]?.cargas?.[e.id] ? `<span class="small tabular">${kgBR(registros[data].cargas[e.id].kg)} kg</span>` : ''}</div>`;
    }).join('')}</div></div>`;
}
// Carga do plano só com número ("40") ganha o "kg" para não ficar ambígua
const cargaPlano = c => /^\d+([.,]\d+)?$/.test(String(c).trim()) ? `${String(c).trim()} kg` : c;
export const descricaoEx = e => [e.series && `${e.series} × ${esc(e.reps || '—')}`, e.carga && esc(cargaPlano(e.carga)), `⏱ ${tempoBR(descansoDe(e))}`].filter(Boolean).join(' · ');

// Dica de carga embaixo do exercício (some depois que o exercício é feito)
export function linhaSugestao(e) {
  const s = sugestaoCarga(e.nome);
  return s ? `<p class="sugestao small ${s.subir ? 'subir' : ''}">${s.subir ? '📈' : '💡'} ${esc(s.texto)}</p>` : '';
}

// ---------- Descanso entre séries ----------
export const DESCANSOS = [30, 45, 60, 75, 90, 120, 150, 180, 240];
export const descansoDe = e => Number.isFinite(e?.descanso) ? e.descanso : 60;
export const tempoBR = s => `${Math.floor(s / 60)}:${pad(Math.max(0, s) % 60)}`;
export const opcoesDescanso = atual => DESCANSOS.map(s => `<option value="${s}" ${s === atual ? 'selected' : ''}>${tempoBR(s)}</option>`).join('');

// ---------- Séries e cronômetro de descanso ----------
// Séries feitas hoje ficam só neste aparelho (não precisam ir para o banco)
export const chaveSeries = () => `series-${meuUid()}-${isoDe(hoje())}`;
export function seriesFeitas() {
  try { return JSON.parse(localStorage.getItem(chaveSeries()) || '{}'); } catch { return S.seriesMem || (S.seriesMem = {}); }
}
export function guardarSeries(obj) {
  S.seriesMem = obj;
  try { localStorage.setItem(chaveSeries(), JSON.stringify(obj)); } catch { /* fica só na memória */ }
}

export function controlesSerie(e, ok) {
  const total = e.series || 1;
  const feitas = Math.min(seriesFeitas()[e.id] || 0, total);
  if (ok) return '<div class="ex-acoes"><span class="small muted">Séries completas ✓</span></div>';
  return `<div class="ex-acoes">
    <button class="mini" data-serie="${e.id}" aria-label="Marcar série ${feitas + 1} de ${total} de ${esc(e.nome)} e descansar">✓ Série ${feitas + 1}/${total}</button>
    <button class="mini ghost" data-descansar="${e.id}" aria-label="Só descansar ${tempoBR(descansoDe(e))}">⏱ ${tempoBR(descansoDe(e))}</button>
  </div>`;
}

export const T = { fim: 0, total: 0, exId: null, nome: '', ajuste: 0, intervalo: null, audio: null };

export function exercicioDeHoje(id) {
  return S.plano[hoje().getDay()]?.exercicios?.find(x => x.id === id);
}

export function iniciarDescanso(e) {
  const segundos = descansoDe(e);
  Object.assign(T, { fim: Date.now() + segundos * 1000, total: segundos, exId: e.id, nome: e.nome, ajuste: 0 });
  // O som só pode tocar depois de um toque: prepara agora, aproveitando este toque
  try { T.audio ||= new (window.AudioContext || window.webkitAudioContext)(); T.audio.resume?.(); } catch { /* sem som */ }
  // Tela acesa durante o descanso (quando o aparelho deixa)
  navigator.wakeLock?.request('screen').then(w => { T.wake = w; }, () => {});
  clearInterval(T.intervalo);
  T.intervalo = setInterval(atualizarTimer, 250);
  atualizarTimer();
}

export function pararDescanso() {
  clearInterval(T.intervalo); T.intervalo = null; T.fim = 0;
  try { T.wake?.release(); } catch { /* ok */ }
  T.wake = null;
  const el = $('#timer'); if (el) el.hidden = true;
}

export function ajustarDescanso(seg) {
  if (!T.fim) return;
  T.fim = Math.max(Date.now() + 5000, T.fim + seg * 1000);
  T.total = Math.max(5, T.total + seg);
  T.ajuste += seg;
  atualizarTimer();
}

export function bip() {
  const ctx = T.audio; if (!ctx) return;
  [0, 0.25, 0.5].forEach(t => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.15;
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.15);
  });
}

export function atualizarTimer() {
  let el = $('#timer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'timer'; el.className = 'timer'; el.setAttribute('role', 'timer');
    document.body.appendChild(el);
  }
  if (!T.fim) { el.hidden = true; return; }
  const resta = Math.ceil((T.fim - Date.now()) / 1000);
  if (resta <= 0) {
    clearInterval(T.intervalo); T.intervalo = null; T.fim = 0;
    try { T.wake?.release(); } catch { /* ok */ }
    navigator.vibrate?.([250, 120, 250]);
    bip();
    el.hidden = false;
    el.innerHTML = `<div class="timer-in"><b>⏰ Descanso acabou!</b><span class="small">Próxima série de ${esc(T.nome)}</span>
      <button class="mini" data-timer="fechar">OK</button></div>`;
    if (document.hidden && permissao() === 'granted') {
      navigator.serviceWorker?.ready.then(r => r.showNotification('Descanso acabou! ⏰', { body: `Próxima série de ${T.nome}`, tag: 'descanso' })).catch(() => {});
    }
    setTimeout(() => { if (!T.fim) el.hidden = true; }, 6000);
    return;
  }
  const pct = Math.min(100, Math.max(0, 100 * (1 - resta / T.total)));
  const ex = exercicioDeHoje(T.exId);
  const novoPadrao = T.ajuste && ex ? descansoDe(ex) + T.ajuste : null;
  el.hidden = false;
  el.innerHTML = `<div class="timer-in">
      <div class="grow"><span class="small">Descanso · ${esc(T.nome)}</span><b class="timer-tempo tabular">${tempoBR(resta)}</b></div>
      <button class="mini ghost" data-timer="-15" aria-label="Menos 15 segundos">−15</button>
      <button class="mini ghost" data-timer="15" aria-label="Mais 15 segundos">+15</button>
      <button class="mini ghost" data-timer="fechar" aria-label="Parar descanso">✕</button>
    </div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    ${novoPadrao && novoPadrao >= 15 && novoPadrao <= 600 ? `<button class="link timer-padrao" data-timer="padrao">Usar ${tempoBR(novoPadrao)} como descanso padrão de ${esc(T.nome)}</button>` : ''}`;
}

// Marca uma série; na última, o exercício conta como feito
export function marcarSerie(id) {
  const e = exercicioDeHoje(id);
  if (!e) return;
  const series = seriesFeitas();
  const total = e.series || 1;
  series[id] = Math.min(total, (series[id] || 0) + 1);
  guardarSeries(series);
  const data = isoDe(hoje());
  if (series[id] >= total) {
    pararDescanso();
    if (!(S.registros[data]?.feitos || []).includes(id)) salvar(Store.marcarExercicio(uid(), data, id, true));
    toast(`${e.nome}: séries completas! 💪`);
    // No modo treino, já vai para o próximo exercício que falta
    if (S.modo) S.modo.i = proximoPendente(S.modo.i, id);
  } else {
    iniciarDescanso(e);
  }
  render();
}

// ---------- Modo "treinando agora" (tela cheia, um exercício por vez) ----------
const exerciciosDeHoje = () => S.plano[hoje().getDay()]?.exercicios || [];
const feitosHoje = () => S.registros[isoDe(hoje())]?.feitos || [];

// Próximo exercício que ainda falta (dá a volta na lista); -1 quando acabou tudo
export function proximoPendente(i, acabouDeFazer) {
  const exs = exerciciosDeHoje();
  const feitos = new Set([...feitosHoje(), acabouDeFazer]);
  for (let k = 1; k <= exs.length; k++) {
    const j = (i + k) % exs.length;
    if (!feitos.has(exs[j].id)) return j;
  }
  return -1;
}

export function entrarModoTreino() {
  const exs = exerciciosDeHoje();
  if (!exs.length) return;
  const feitos = feitosHoje();
  const i = exs.findIndex(e => !feitos.includes(e.id));
  S.modo = { i: i < 0 ? -1 : i };
  navigator.wakeLock?.request('screen').then(w => { S.modo && (S.modo.wake = w); }, () => {});
  window.scrollTo(0, 0);
  render();
}

export function sairModoTreino() {
  try { S.modo?.wake?.release(); } catch { /* ok */ }
  S.modo = null;
  render();
  window.scrollTo(0, 0);
}

export function telaModoTreino() {
  mostrarNav(false);
  const exs = exerciciosDeHoje();
  const feitos = feitosHoje();
  const qtd = exs.filter(e => feitos.includes(e.id)).length;
  const pct = exs.length ? Math.round(100 * qtd / exs.length) : 0;
  const topo = `<div class="modo-topo"><button class="mini ghost" data-acao="sair-modo">✕ Sair</button>
      <span class="small muted tabular">${qtd} de ${exs.length} exercícios</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>`;
  // Se o treino do dia mudou com o modo aberto (exercício removido), vai para o próximo que falta
  if (S.modo.i >= exs.length) S.modo.i = proximoPendente(-1);
  const i = S.modo.i;
  if (i < 0 || !exs[i]) {
    const ck = S.checkins.some(c => c.data === isoDe(hoje()));
    app.innerHTML = `<div class="modo">${topo}
      <div class="modo-fim"><div class="modo-emoji" aria-hidden="true">🎉</div><h1>Treino completo!</h1>
        <p class="muted">${exs.length} ${exs.length === 1 ? 'exercício feito' : 'exercícios feitos'}. Mandou bem!</p>
        ${ck ? '' : '<button class="btn grande" data-acao="abrir-checkin">📍 Fazer o check-in</button>'}
        <button class="btn ghost" data-acao="sair-modo">Voltar para o app</button></div></div>`;
    return;
  }
  const e = exs[i];
  const ok = feitos.includes(e.id);
  const total = e.series || 1;
  const feitas = ok ? total : Math.min(seriesFeitas()[e.id] || 0, total);
  const proximo = exs.slice(i + 1).concat(exs.slice(0, i)).find(x => !feitos.includes(x.id) && x.id !== e.id);
  const kgHoje = S.registros[isoDe(hoje())]?.cargas?.[e.id]?.kg;
  app.innerHTML = `<div class="modo">${topo}
    <div class="modo-ex">
      <span class="label">Exercício ${i + 1} de ${exs.length}</span>
      <h1 class="modo-nome">${esc(e.nome)}</h1>
      <p class="muted tabular">${descricaoEx(e)}</p>
      ${ok ? '' : linhaSugestao(e)}
      ${kgHoje == null && porTempo(e) ? '' : `<div class="modo-carga"><span class="label">Carga de hoje</span>${campoCarga(e, kgHoje)}</div>`}
      <div class="modo-series" aria-label="Série ${Math.min(feitas + 1, total)} de ${total}">
        ${Array.from({ length: total }, (_, k) => `<i class="${k < feitas ? 'on' : ''}"></i>`).join('')}
      </div>
      ${ok ? '<p class="ok-txt">✓ Exercício feito</p>'
        : `<button class="btn modo-btn" data-serie="${e.id}">✓ Série ${feitas + 1} de ${total} feita</button>
           <button class="btn ghost" data-descansar="${e.id}">⏱ Só descansar ${tempoBR(descansoDe(e))}</button>`}
    </div>
    <div class="modo-nav">
      <button class="mini ghost" data-modo-ir="-1" ${exs.length < 2 ? 'disabled' : ''}>‹ Anterior</button>
      <span class="small muted grow centro">${proximo ? `Próximo: ${esc(proximo.nome)}` : 'Último que falta'}</span>
      <button class="mini ghost" data-modo-ir="1" ${exs.length < 2 ? 'disabled' : ''}>Próximo ›</button>
    </div>
  </div>`;
}

// Guarda o tempo ajustado no cronômetro como o novo padrão do exercício
export function salvarDescansoPadrao() {
  const dia = hoje().getDay();
  const p = structuredClone(S.plano[dia]);
  const e = p?.exercicios?.find(x => x.id === T.exId);
  if (!e) return;
  e.descanso = Math.min(600, Math.max(15, descansoDe(e) + T.ajuste));
  T.ajuste = 0;
  salvar(Store.salvarDia(uid(), dia, p), `Descanso de ${e.nome}: ${tempoBR(e.descanso)}`);
  atualizarTimer();
}

// ---------- Modelos de treino prontos ----------
export const ex = (nome, series, reps, carga, descanso) => ({ nome, series, reps, carga, descanso });
export const MODELOS = [
  {
    id: 'abc', nome: 'Iniciante ABC', desc: '3 dias por semana: pernas, parte de cima e cardio com abdômen.',
    dias: {
      1: ['Treino A · Inferiores', [ex('Agachamento livre', 3, '12', '', 90), ex('Leg press 45°', 3, '12', '', 90), ex('Cadeira extensora', 3, '15', '', 60), ex('Cadeira flexora', 3, '15', '', 60), ex('Elevação pélvica', 3, '12', '', 60)]],
      3: ['Treino B · Superiores', [ex('Puxada frontal', 3, '12', '', 75), ex('Remada baixa', 3, '12', '', 75), ex('Supino reto', 3, '12', '', 75), ex('Desenvolvimento com halter', 3, '10', '', 60), ex('Tríceps corda', 3, '15', '', 45)]],
      5: ['Treino C · Cardio e abdômen', [ex('Esteira', 1, '25 min', '', 60), ex('Prancha', 3, '30 s', '', 45), ex('Abdominal infra', 3, '15', '', 45), ex('Bicicleta', 1, '15 min', '', 60)]],
    },
  },
  {
    id: 'emagrecer', nome: 'Emagrecimento 4x', desc: 'Musculação com cardio no fim, 4 dias por semana.',
    dias: {
      1: ['Pernas + cardio', [ex('Agachamento livre', 4, '12', '', 75), ex('Leg press 45°', 4, '12', '', 75), ex('Stiff', 3, '12', '', 60), ex('Abdutora', 3, '15', '', 45), ex('Esteira', 1, '20 min', '', 60)]],
      2: ['Superiores + cardio', [ex('Puxada frontal', 4, '12', '', 60), ex('Supino reto', 3, '12', '', 60), ex('Remada baixa', 3, '12', '', 60), ex('Elevação lateral', 3, '15', '', 45), ex('Elíptico', 1, '20 min', '', 60)]],
      4: ['Glúteos + abdômen', [ex('Elevação pélvica', 4, '12', '', 75), ex('Agachamento livre', 3, '15', '', 60), ex('Abdutora', 3, '15', '', 45), ex('Prancha', 3, '40 s', '', 45), ex('Abdominal infra', 3, '15', '', 45)]],
      5: ['Corpo todo + cardio', [ex('Leg press 45°', 3, '15', '', 60), ex('Puxada frontal', 3, '12', '', 60), ex('Desenvolvimento com halter', 3, '12', '', 60), ex('Escada', 1, '15 min', '', 60)]],
    },
  },
  {
    id: 'fullbody', nome: 'Corpo todo 3x', desc: 'O mesmo treino completo segunda, quarta e sexta. Bom para pouco tempo.',
    dias: Object.fromEntries([1, 3, 5].map(d => [d, ['Corpo todo', [ex('Agachamento livre', 3, '12', '', 90), ex('Supino reto', 3, '12', '', 75), ex('Puxada frontal', 3, '12', '', 75), ex('Elevação pélvica', 3, '12', '', 60), ex('Prancha', 3, '30 s', '', 45)]]])),
  },
  {
    id: 'cardio', nome: 'Cardio e abdômen', desc: '3 dias leves, para começar ou para dias corridos.',
    dias: Object.fromEntries([2, 4, 6].map(d => [d, ['Cardio e abdômen', [ex('Esteira', 1, '30 min', '', 60), ex('Prancha', 3, '30 s', '', 45), ex('Abdominal infra', 3, '15', '', 45)]]])),
  },
];

// ---------- Check-in ----------
export function fotoHtml(dono, c) {
  if (!c.temFoto) return '';
  const k = `${dono}/${c.id}`, v = S.fotos[k];
  if (v === undefined) {
    S.fotos[k] = 'carregando';
    Store.lerFoto(dono, c.id).then(img => { S.fotos[k] = img; render(); }, () => { S.fotos[k] = null; render(); });
  }
  if (typeof v === 'string' && v.startsWith('data:')) return `<img class="foto" src="${v}" alt="Foto do check-in">`;
  return `<div class="foto vazia">${v === null ? 'Foto indisponível' : 'Carregando foto…'}</div>`;
}

export function quandoCheckin(c) {
  const hojeIso = isoDe(hoje());
  if (c.data === hojeIso) return `Hoje às ${esc(c.hora)}`;
  const d = new Date(c.data + 'T12:00');
  return `${DIAS_NOME[d.getDay()]}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} às ${esc(c.hora)}`;
}

// dono = uid de quem fez o check-in; podeReagir = estou vendo o check-in de outra pessoa
export function cartaoCheckin(dono, c, podeReagir) {
  const reacoes = Object.entries(c.reacoes || {});
  const minha = c.reacoes?.[meuUid()];
  const nomeViewer = quem => nomeDe(S.conexoes.find(x => x.viewer === quem && x.atleta === meuUid()) || {}, 'viewer');
  return `<div class="card stack">
    <div class="row between"><h3 class="grow">Check-in · ${quandoCheckin(c)}</h3>
      ${podeReagir ? '' : `<button class="link" data-apagar-ck="${c.id}">${S.confirmar === 'ck:' + c.id ? 'Confirmar' : 'Apagar'}</button>`}</div>
    ${fotoHtml(dono, c)}
    ${c.legenda ? `<p>${esc(c.legenda)}</p>` : ''}
    ${podeReagir
      ? `<div class="reacoes">${Store.REACOES.map(e => `<button class="${minha === e ? 'on' : ''}" data-reagir="${c.id}" data-emoji="${e}" aria-pressed="${minha === e}">${e}</button>`).join('')}</div>`
      : reacoes.length ? `<div class="reacoes">${reacoes.map(([quem, emoji]) => `<span class="pill ok">${emoji} ${esc(nomeViewer(quem))}</span>`).join('')}</div>` : ''}
  </div>`;
}

export function secaoCheckinHoje() {
  const hojeIso = isoDe(hoje());
  const checkinsDeHoje = S.checkins.filter(c => c.data === hojeIso);
  const ck = S.checkin;
  if (ck.aberto) {
    return `<section class="block"><span class="label">Check-in</span>
      <div class="card stack">
        <label class="drop" for="fotoIn">${ck.foto ? `<img class="foto" src="${ck.foto}" alt="Prévia da foto">`
          : ck.processando ? '<b>Preparando a foto…</b>' : '<b>Tirar ou escolher foto</b><span class="small muted">Uma selfie no espelho da academia já vale</span>'}</label>
        <input id="fotoIn" type="file" accept="image/*" hidden>
        <div class="field"><label class="label" for="legendaIn">Legenda (opcional)</label><input id="legendaIn" maxlength="140" placeholder="Ex.: Hoje é dia de perna!"></div>
        <div class="row"><button class="btn ghost" data-acao="cancelar-checkin">Cancelar</button>
          <button class="btn" data-acao="enviar-checkin" ${ck.enviando || ck.processando ? 'disabled' : ''}>${ck.enviando ? 'Enviando…' : 'Enviar check-in'}</button></div>
      </div></section>`;
  }
  if (checkinsDeHoje.length) {
    return `<section class="block"><span class="label">Check-in de hoje</span>${checkinsDeHoje.map(c => cartaoCheckin(meuUid(), c, false)).join('')}</section>`;
  }
  return `<section class="block"><button class="btn grande" data-acao="abrir-checkin">Cheguei na academia · fazer check-in</button></section>`;
}

// Reduz a foto no próprio aparelho (lado maior até 1080 px) para caber no banco
export function prepararFoto(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let lado = 1080, qualidade = 0.75, dataUrl;
      do {
        const escala = Math.min(1, lado / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        dataUrl = c.toDataURL('image/jpeg', qualidade);
        lado = Math.round(lado * 0.8); qualidade = Math.max(0.5, qualidade - 0.1);
      } while (dataUrl.length > 600000 && lado > 300);
      resolve(dataUrl);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir essa foto. Tente outra.')); };
    img.src = url;
  });
}

export function telaHoje() {
  const d = hoje();
  const plano = S.plano[d.getDay()];
  const r = resumoSemana();
  const marcados = S.registros[isoDe(d)]?.feitos || [];
  // Só conta o que ainda está no plano (um exercício removido depois de feito não vale mais)
  const feitos = plano?.exercicios?.length ? plano.exercicios.filter(e => marcados.includes(e.id)).length : marcados.length;
  const total = plano?.exercicios?.length || 0;
  const fezCheckin = S.checkins.some(c => c.data === isoDe(d));
  const pill = !total ? (feitos || fezCheckin ? '<span class="pill ok">Treinou</span>' : '<span class="pill ok">Descanso</span>')
    : feitos >= total ? '<span class="pill ok">Treino completo</span>'
    : feitos ? '<span class="pill wait">Em andamento</span>'
    : fezCheckin ? '<span class="pill ok">Na academia</span>' : '<span class="pill wait">Ainda não começou</span>';
  const pedidos = pedidosRecebidos();
  const seq = sequencias(S.plano, S.registros, S.checkins);
  const ckHoje = S.checkins.find(c => c.data === isoDe(d));
  return `${cabecalho()}
  ${pedidos.length ? `<section class="block"><div class="card stack aviso">
    <h3>${pedidos.length === 1 ? `${esc(nomeDe(pedidos[0], 'viewer'))} quer te acompanhar` : `${pedidos.length} pessoas querem te acompanhar`}</h3>
    <button class="btn sm" data-aba="conexoes">Ver pedido</button></div></section>` : ''}
  <section class="block">${ckHoje
    ? `<button class="card row atalho" data-aba="mural">✅ <span class="grow">Check-in feito às ${esc(ckHoje.hora)}</span><span class="link">Ver</span></button>`
    : '<button class="btn grande" data-acao="abrir-checkin">📍 Cheguei na academia · fazer check-in</button>'}</section>
  <section class="block">
    <div class="row between"><span class="label">Treino de hoje</span>${pill}</div>
    ${total && feitos < total ? `<button class="btn grande" data-acao="modo-treino">▶ ${feitos ? 'Continuar o treino' : 'Começar o treino'}</button>` : ''}
    ${cartaoTreino(d.getDay(), isoDe(d))}
  </section>
  ${Object.keys(S.plano).length ? '' : `<section class="block"><div class="card stack"><h3>Comece montando sua semana</h3>
    <p class="muted small">Em Semana você monta os exercícios de cada dia, ou escolhe um modelo pronto. Depois é só marcar aqui o que já fez.</p>
    <button class="btn" data-aba="semana">Montar minha semana</button></div></section>`}
  <section class="block">
    <div class="grid3">
      <div class="stat"><span class="label">Semana</span><b class="tabular">${r.feitos}</b><span class="small muted">${r.planejados ? `de ${r.planejados} ${r.planejados === 1 ? 'treino' : 'treinos'}` : (r.feitos === 1 ? 'treino' : 'treinos')}</span></div>
      <div class="stat"><span class="label">Hoje</span><b class="tabular">${total ? `${Math.min(feitos, total)}/${total}` : feitos || '—'}</b><span class="small muted">${total || feitos ? 'exercícios' : 'descanso'}</span></div>
      <div class="stat"><span class="label">Sequência</span><b class="tabular">🔥 ${seq.atual}</b><span class="small muted">${seq.atual === 1 ? 'treino seguido' : 'seguidos'}</span></div>
    </div>
  </section>
  ${convitResumoMes()}
  ${convitAvisos()}`;
}

export function legenda() {
  return `<div class="legend"><span><i style="background:var(--accent)"></i>Treinou</span><span><i style="background:var(--hot)"></i>Faltou</span>
    <span><i style="background:var(--plan)"></i>Planejado</span><span><i style="border:2px solid var(--rest);background:transparent"></i>Descanso</span></div>`;
}

export function telaSemana() {
  const semana = semanaAtual();
  const dia = S.diaSel;
  const plano = S.plano[dia] || { titulo: '', exercicios: [] };
  const hojeIso = isoDe(hoje());
  return `${cabecalho()}
  <section class="block"><span class="label">Esta semana</span>
    <div class="week">${semana.map(d => `<button class="day ${statusDia(d)} ${d.getDay() === dia ? 'sel' : ''} ${isoDe(d) === hojeIso ? 'today' : ''}" data-dia="${d.getDay()}" aria-label="${DIAS_NOME[d.getDay()]}">
      <span>${DIAS[d.getDay()]}</span><b class="tabular">${d.getDate()}</b><span class="dot"></span></button>`).join('')}</div>
    ${legenda()}
  </section>
  <section class="block">
    <h2>${DIAS_NOME[dia]}</h2>
    <div class="field"><label class="label" for="titulo">Nome do treino</label>
      <input id="titulo" maxlength="60" value="${esc(plano.titulo)}" placeholder="Ex.: Treino A · Inferiores"></div>
    <div class="card">${plano.exercicios.length ? plano.exercicios.map((e, i) => S.editandoEx === e.id ? formEditarEx(e) : `<div class="ex">
        <div class="grow"><div class="ex-nome">${esc(e.nome)}</div><div class="small muted tabular">${descricaoEx(e)}</div></div>
        <button class="icone" data-editar-ex="${e.id}" aria-label="Editar ${esc(e.nome)}">✎</button>
        <button class="icone" data-subir="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir ${esc(e.nome)}">↑</button>
        <button class="icone" data-remover="${e.id}" aria-label="Remover ${esc(e.nome)}">×</button></div>`).join('')
      : '<p class="muted small">Nenhum exercício. Sem exercícios, o dia conta como descanso.</p>'}</div>
  </section>
  <section class="block"><span class="label">Adicionar exercício</span>
    <form id="formEx" class="stack">
      <div class="field"><label class="label" for="exnome">Exercício</label>
        <input id="exnome" list="sugestoes" placeholder="Ex.: Supino reto" required maxlength="60">
        <datalist id="sugestoes">${SUGESTOES.map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist></div>
      <div class="grid4">
        <div class="field"><label class="label" for="exseries">Séries</label><input id="exseries" type="number" inputmode="numeric" min="1" max="20" value="3"></div>
        <div class="field"><label class="label" for="exreps">Reps</label><input id="exreps" value="12" maxlength="12"></div>
        <div class="field"><label class="label" for="excarga">Carga</label><input id="excarga" placeholder="20 kg" maxlength="16"></div>
        <div class="field"><label class="label" for="exdescanso">Descanso</label><select id="exdescanso" class="input">${opcoesDescanso(60)}</select></div>
      </div>
      <button class="btn" type="submit">Adicionar em ${DIAS_NOME[dia].toLowerCase()}</button>
    </form>
    ${plano.exercicios.length ? `<div class="row"><span class="small muted grow">Copiar este treino para outro dia:</span>
      <select id="copiarPara" class="input" style="width:auto"><option value="">Escolher dia</option>${[1, 2, 3, 4, 5, 6, 0].filter(x => x !== dia).map(x => `<option value="${x}">${DIAS_NOME[x]}</option>`).join('')}</select></div>` : ''}
  </section>
  ${secaoModelos()}`;
}

// Edição de um exercício do plano, no lugar da linha dele
export function formEditarEx(e) {
  return `<form class="stack editar-ex" data-editar-form="${e.id}">
    <div class="field"><label class="label" for="edNome">Exercício</label><input id="edNome" list="sugestoes" maxlength="60" value="${esc(e.nome)}" required></div>
    <div class="grid4">
      <div class="field"><label class="label" for="edSeries">Séries</label><input id="edSeries" type="number" inputmode="numeric" min="1" max="20" value="${e.series || 1}"></div>
      <div class="field"><label class="label" for="edReps">Reps</label><input id="edReps" maxlength="12" value="${esc(e.reps || '')}"></div>
      <div class="field"><label class="label" for="edCarga">Carga</label><input id="edCarga" maxlength="16" value="${esc(e.carga || '')}"></div>
      <div class="field"><label class="label" for="edDescanso">Descanso</label><select id="edDescanso" class="input">${opcoesDescanso(descansoDe(e))}</select></div>
    </div>
    <div class="row"><button class="btn ghost" type="button" data-cancelar-ex>Cancelar</button><button class="btn" type="submit">Salvar</button></div>
  </form>`;
}

export function secaoModelos() {
  if (!S.verModelos) {
    return `<section class="block"><button class="btn ghost" data-ver-modelos>📋 Usar um modelo de treino pronto</button></section>`;
  }
  return `<section class="block"><div class="row between"><span class="label">Modelos prontos</span><button class="link" data-ver-modelos>Fechar</button></div>
    <p class="small muted">Monta a semana inteira de uma vez. Depois dá para editar qualquer exercício. <b>Substitui o treino que já está montado.</b></p>
    ${MODELOS.map(m => `<div class="card stack">
      <div><h3>${esc(m.nome)}</h3><p class="small muted">${esc(m.desc)}</p>
        <p class="small tabular">${[1, 2, 3, 4, 5, 6, 0].filter(d => m.dias[d]).map(d => `${DIAS[d]}: ${esc(m.dias[d][0])}`).join(' · ')}</p></div>
      <button class="btn sm ${S.confirmar === 'modelo:' + m.id ? '' : 'ghost'}" data-usar-modelo="${m.id}">${S.confirmar === 'modelo:' + m.id ? 'Tocar de novo para substituir minha semana' : 'Usar este'}</button>
    </div>`).join('')}
  </section>`;
}

// ---------- Histórico (calendário do mês) ----------
export function telaHistorico() {
  const hojeIso = isoDe(hoje());
  const mes = S.mesHist || hojeIso.slice(0, 7);
  const [ano, m] = mes.split('-').map(Number);
  const primeiro = new Date(ano, m - 1, 1, 12);
  const diasNoMes = new Date(ano, m, 0).getDate();
  const vazios = (primeiro.getDay() + 6) % 7; // semana começa na segunda
  const sel = S.diaHist && S.diaHist.startsWith(mes) ? S.diaHist : (hojeIso.startsWith(mes) ? hojeIso : null);
  const dias = Array.from({ length: diasNoMes }, (_, i) => new Date(ano, m - 1, i + 1, 12));
  const st = dias.map(d => statusDia(d));
  const treinou = st.filter(s => s === 'done').length;
  const faltou = st.filter(s => s === 'missed').length;
  const checkinsMes = S.checkins.filter(c => c.data.startsWith(mes)).length;
  const tituloBruto = primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const titulo = tituloBruto.charAt(0).toUpperCase() + tituloBruto.slice(1);
  return `${cabecalho()}
  <section class="block">
    <div class="row between"><button class="icone" data-mes="-1" aria-label="Mês anterior">‹</button>
      <h2 class="mes-titulo">${titulo}</h2>
      <button class="icone" data-mes="1" aria-label="Próximo mês" ${mes >= hojeIso.slice(0, 7) ? 'disabled' : ''}>›</button></div>
    <div class="cal">
      ${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map(l => `<span class="cal-dow">${l}</span>`).join('')}
      ${'<span></span>'.repeat(vazios)}
      ${dias.map((d, i) => {
        const iso = isoDe(d);
        return `<button class="cal-dia ${st[i]} ${iso === hojeIso ? 'today' : ''} ${iso === sel ? 'sel' : ''}" data-dia-hist="${iso}"
          aria-label="${d.getDate()} de ${titulo}: ${({ done: 'treinou', missed: 'faltou', rest: 'descanso', future: 'planejado' })[st[i]]}">${d.getDate()}</button>`;
      }).join('')}
    </div>
    ${legenda()}
    <div class="grid3">
      <div class="stat"><span class="label">Treinou</span><b class="tabular">${treinou}</b><span class="small muted">${treinou === 1 ? 'dia' : 'dias'}</span></div>
      <div class="stat"><span class="label">Faltou</span><b class="tabular">${faltou}</b><span class="small muted">${faltou === 1 ? 'dia' : 'dias'}</span></div>
      <div class="stat"><span class="label">Check-ins</span><b class="tabular">${checkinsMes}</b><span class="small muted">no mês</span></div>
    </div>
  </section>
  ${sel ? detalheDia(sel) : '<section class="block"><p class="small muted">Toque num dia para ver o que foi feito.</p></section>'}`;
}

// O que aconteceu num dia: exercícios, cargas, check-in e peso
export function detalheDia(iso) {
  const d = diaDe(iso);
  const status = statusDia(d);
  const reg = S.registros[iso] || {};
  const plano = S.plano[d.getDay()];
  const nomes = (reg.feitos || []).map(id => plano?.exercicios?.find(x => x.id === id)?.nome || reg.cargas?.[id]?.nome || null);
  const conhecidos = nomes.filter(Boolean);
  const outros = nomes.length - conhecidos.length;
  const cargas = Object.values(reg.cargas || {}).filter(c => c?.nome);
  const checkins = S.checkins.filter(c => c.data === iso);
  const peso = S.pesos.find(p => p.data === iso);
  const pill = { done: '<span class="pill ok">Treinou</span>', missed: '<span class="pill bad">Faltou</span>', rest: '<span class="pill">Descanso</span>', future: '<span class="pill plan">Planejado</span>' }[status];
  const titulo = `${DIAS_NOME[d.getDay()]}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}`;
  // Dia que ainda vai chegar (ou que faltou): mostra o treino que estava/está planejado
  const planejado = (status === 'future' || status === 'missed') && temTreinoNoDia(S.plano, d) ? plano : null;
  return `<section class="block"><div class="row between"><h2 class="grow">${titulo}</h2>${pill}</div>
    ${planejado ? `<div class="card stack"><div class="row between"><span class="label">${status === 'missed' ? 'Treino que estava planejado' : 'Treino planejado'}</span>
        <button class="link" data-aba="semana" data-dia="${d.getDay()}">Editar</button></div>
      <h3>${esc(planejado.titulo || 'Treino de ' + DIAS_NOME[d.getDay()].toLowerCase())}</h3>
      ${planejado.exercicios.map(e => `<div class="ex"><div class="grow"><div class="ex-nome">${esc(e.nome)}</div><div class="small muted tabular">${descricaoEx(e)}</div></div></div>`).join('')}
    </div>` : ''}
    ${nomes.length ? `<div class="card stack"><span class="label">Exercícios feitos</span>
      <ul class="lista">${conhecidos.map(n => `<li>${esc(n)}</li>`).join('')}${outros ? `<li class="muted">${outros === 1 ? 'mais 1 exercício' : `mais ${outros} exercícios`} (já tirado do plano)</li>` : ''}</ul></div>` : ''}
    ${cargas.length ? `<div class="card stack"><span class="label">Cargas</span>
      ${cargas.map(c => `<div class="row between"><span>${esc(c.nome)}</span><b class="tabular">${kgBR(c.kg)} kg</b></div>`).join('')}</div>` : ''}
    ${peso ? `<div class="card row between"><span>Peso registrado</span><b class="tabular">${kgBR(peso.kg)} kg</b></div>` : ''}
    ${checkins.map(c => cartaoCheckin(meuUid(), c, false)).join('')}
    ${!nomes.length && !checkins.length && !peso && !planejado ? `<p class="small muted">${status === 'future' ? 'Ainda não chegou.' : 'Nada registrado neste dia.'}</p>` : ''}
  </section>`;
}
