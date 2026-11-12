/* =========================================================
   Treino Junto: interface
   Etapa 1: login, perfil, plano da semana e checklist do dia.
   ========================================================= */

import * as Store from './store.js';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_NOME = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const SUGESTOES = ['Agachamento livre', 'Leg press 45°', 'Cadeira extensora', 'Cadeira flexora', 'Stiff', 'Elevação pélvica',
  'Abdutora', 'Panturrilha em pé', 'Supino reto', 'Puxada frontal', 'Remada baixa', 'Desenvolvimento com halter',
  'Elevação lateral', 'Rosca direta', 'Tríceps corda', 'Prancha', 'Abdominal infra', 'Esteira', 'Bicicleta', 'Escada', 'Elíptico'];

const ERROS = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/missing-email': 'Digite o e-mail.',
  'auth/missing-password': 'Digite a senha.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'Não existe conta com esse e-mail.',
  'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Use "Entrar".',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem internet. Confira a conexão e tente de novo.',
  'permission-denied': 'Sem permissão para isso. Confira se as regras do Firestore foram publicadas.',
};
const mensagemErro = err => ERROS[err?.code] || err?.message || 'Algo deu errado. Tente de novo.';

// ---------- Datas (sempre no fuso do aparelho) ----------
const pad = n => String(n).padStart(2, '0');
const isoDe = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = () => new Date();
function semanaAtual() { // segunda a domingo
  const d = hoje(); d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x; });
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const novoId = () => crypto.randomUUID().slice(0, 8);
const $ = s => document.querySelector(s);
const app = $('#app');

function toast(texto) {
  const el = $('#toast');
  el.textContent = texto; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2400);
}

// ---------- Estado ----------
const S = {
  user: undefined,   // undefined = ainda carregando; null = sem login
  perfil: undefined,
  plano: {},
  registros: {},
  aba: 'treino',
  sub: { treino: 'hoje', corpo: 'peso', juntos: 'mural', evolucao: 'conquistas', perfil: 'dados' },
  diaSel: hoje().getDay(),
  modoLogin: 'entrar',
  conexoes: [],      // todas as conexões em que eu apareço (dos dois lados)
  acompId: null,     // id da conexão que estou vendo na aba Acompanhar
  acomp: null,       // { chave, plano, registros, carregado, bloqueado } da pessoa acompanhada
  confirmar: null,   // id esperando o segundo toque (remover conexão, apagar check-in)
  checkins: [],      // meus check-ins desta semana
  fotos: {},         // fotos já carregadas: 'uid/idDoCheckin' → dataUrl | null | 'carregando'
  mensagens: {},     // recados por conexão
  checkin: { aberto: false, foto: null, processando: false, enviando: false },
  pesos: [],         // meus registros de peso [{ data, kg }], do mais antigo ao mais novo
  medidas: [],       // minhas medidas [{ data, cintura, quadril, braco }]
  medidaSel: 'cintura',
  carregado: {},     // quais escutas já responderam (conquistas só são calculadas com tudo carregado)
  editandoMeta: null,
  dica: {},          // ponto/barra tocado em cada gráfico: { idDoGrafico: índice }
};
const SEMANAS_HISTORICO = 8;
let pararEscutas = [];
let pararAcomp = [];
let pararMsgs = {};  // escuta de recados por conexão
const tentativasMsgs = {};
let cadastrando = false;

// ---------- Navegação: 5 abas, cada uma com subabas ----------
const ICONE = {
  treino: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg>',
  corpo: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M8 9a4 4 0 0 1 8 0"/><path d="M12 9l1.5-2"/></svg>',
  juntos: '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9 11.5h.01M12 11.5h.01M15 11.5h.01"/></svg>',
  evolucao: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  perfil: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
};
const ABAS = [
  ['treino', 'Treino', [['hoje', 'Hoje'], ['semana', 'Semana'], ['historico', 'Histórico']]],
  ['corpo', 'Corpo', [['peso', 'Peso e IMC'], ['medidas', 'Medidas'], ['fotos', 'Fotos']]],
  ['juntos', 'Juntos', [['mural', 'Check-in'], ['recados', 'Recados'], ['acompanhar', 'Acompanhar']]],
  ['evolucao', 'Evolução', [['conquistas', 'Conquistas'], ['frequencia', 'Frequência'], ['cargas', 'Cargas']]],
  ['perfil', 'Perfil', [['dados', 'Dados'], ['conexoes', 'Conexões'], ['avisos', 'Avisos']]],
];
// Endereço (#nome) → [aba, subaba]. Também aceita os nomes antigos usados nos avisos.
const ROTAS = { progresso: ['evolucao', 'conquistas'], checkin: ['juntos', 'mural'] };
ABAS.forEach(([aba, , subs]) => { ROTAS[aba] = [aba, null]; subs.forEach(([s]) => { ROTAS[s] = [aba, s]; }); });

// Recados que chegaram e eu ainda não abri (por conexão)
function recadosNovos() {
  let lidos = {};
  try { lidos = JSON.parse(localStorage.getItem('recados-lidos') || '{}'); } catch { /* sem armazenamento */ }
  return Object.entries(S.mensagens).reduce((n, [id, msgs]) => {
    const ult = msgs.at(-1);
    const quando = ult?.criadoEm?.toMillis?.() || 0;
    return n + (ult && ult.de !== meuUid() && quando > (lidos[id] || 0) ? 1 : 0);
  }, 0);
}
function marcarRecadosLidos() {
  const lidos = {};
  Object.entries(S.mensagens).forEach(([id, msgs]) => { lidos[id] = msgs.at(-1)?.criadoEm?.toMillis?.() || Date.now(); });
  try { localStorage.setItem('recados-lidos', JSON.stringify(lidos)); } catch { /* sem armazenamento */ }
}

const contagens = () => ({ conexoes: pedidosRecebidos().length, recados: recadosNovos() });
const BADGE_DA_ABA = { perfil: 'conexoes', juntos: 'recados' };

function mostrarNav(visivel) {
  $('#nav').hidden = !visivel;
  if (!visivel) return;
  const n = contagens();
  $('#navin').innerHTML = ABAS.map(([k, l]) => {
    const qtd = n[BADGE_DA_ABA[k]] || 0;
    return `<button class="${S.aba === k ? 'on' : ''}" data-aba="${k}" aria-label="${l}${qtd ? `, ${qtd} novidade(s)` : ''}">${ICONE[k]}${l}${qtd ? `<span class="badge">${qtd}</span>` : ''}</button>`;
  }).join('');
}

// Subabas logo abaixo do título
function subnav() {
  const subs = ABAS.find(a => a[0] === S.aba)[2];
  const n = contagens();
  return `<div class="subnav" role="tablist">${subs.map(([k, l]) => `<button role="tab" aria-selected="${S.sub[S.aba] === k}"
    class="${S.sub[S.aba] === k ? 'on' : ''}" data-aba="${k}">${l}${n[k] ? `<span class="badge-in">${n[k]}</span>` : ''}</button>`).join('')}</div>`;
}

// ---------- Conexões ----------
const meuUid = () => S.user?.uid;
const pedidosRecebidos = () => S.conexoes.filter(c => c.atleta === meuUid() && c.status === 'pendente');
const meusAcompanhantes = () => S.conexoes.filter(c => c.atleta === meuUid() && c.status === 'aceita');
const quemAcompanho = () => S.conexoes.filter(c => c.viewer === meuUid());
const nomeDe = (c, lado) => (lado === 'atleta' ? c.atletaNome : c.viewerNome) || 'Alguém';

// ---------- Regras do dia ----------
// Treinou = marcou algum exercício OU fez check-in naquele dia
// Tinha treino planejado nesse dia? (dias antes de o treino ser montado não contam)
function temTreinoNoDia(planoSemana, d) {
  const plano = planoSemana[d.getDay()];
  return !!(plano?.exercicios?.length && (!plano.desde || isoDe(d) >= plano.desde));
}

function statusDia(d, planoSemana = S.plano, registros = S.registros, checkins = S.checkins) {
  const data = isoDe(d);
  const temTreino = temTreinoNoDia(planoSemana, d);
  const feitos = registros[data]?.feitos?.length || 0;
  if (feitos || checkins.some(c => c.data === data)) return 'done';
  if (!temTreino) return 'rest';
  const hojeIso = isoDe(hoje());
  if (data < hojeIso) return 'missed';
  return 'future';
}
function resumoSemana(planoSemana = S.plano, registros = S.registros, checkins = S.checkins) {
  const semana = semanaAtual();
  return {
    feitos: semana.filter(d => statusDia(d, planoSemana, registros, checkins) === 'done').length,
    planejados: semana.filter(d => temTreinoNoDia(planoSemana, d)).length,
    faltas: semana.filter(d => statusDia(d, planoSemana, registros, checkins) === 'missed').length,
  };
}

// ---------- Telas ----------
function telaSemConfig() {
  mostrarNav(false);
  app.innerHTML = `<div class="hero"><span class="label">Falta um passo</span><h1>Treino Junto</h1>
    <p class="muted">O app ainda não está ligado ao Firebase. Abra o arquivo <b>firebase-config.js</b> e cole os dados do seu projeto, como explicado no <b>COMO-CONFIGURAR.md</b>.</p></div>`;
}

function telaLogin() {
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
  </form>`;
}

// Título da tela + subabas. Na tela Hoje o título é o "Oi, fulano".
function cabecalho() {
  const d = hoje();
  const nome = S.perfil?.nome || S.user?.nome || '';
  const titulo = S.aba === 'treino' && S.sub.treino === 'hoje' ? `Oi, ${esc(nome.split(' ')[0])}` : ABAS.find(a => a[0] === S.aba)[1];
  return `<div class="top"><div class="grow"><span class="label">${DIAS_NOME[d.getDay()]}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
    <h1>${titulo}</h1></div></div>${subnav()}`;
}

function cartaoTreino(dia, data, planoSemana = S.plano, registros = S.registros, editavel = true) {
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
          ${editavel && data === isoDe(hoje()) ? controlesSerie(e, ok) : ''}</div>
        ${editavel ? campoCarga(e, registros[data]?.cargas?.[e.id]?.kg) : registros[data]?.cargas?.[e.id] ? `<span class="small tabular">${kgBR(registros[data].cargas[e.id].kg)} kg</span>` : ''}</div>`;
    }).join('')}</div></div>`;
}
const descricaoEx = e => [e.series && `${e.series} × ${esc(e.reps || '—')}`, e.carga && esc(e.carga), `⏱ ${tempoBR(descansoDe(e))}`].filter(Boolean).join(' · ');

// ---------- Descanso entre séries ----------
const DESCANSOS = [30, 45, 60, 75, 90, 120, 150, 180, 240];
const descansoDe = e => Number.isFinite(e?.descanso) ? e.descanso : 60;
const tempoBR = s => `${Math.floor(s / 60)}:${pad(Math.max(0, s) % 60)}`;
const opcoesDescanso = atual => DESCANSOS.map(s => `<option value="${s}" ${s === atual ? 'selected' : ''}>${tempoBR(s)}</option>`).join('');

// ---------- Séries e cronômetro de descanso ----------
// Séries feitas hoje ficam só neste aparelho (não precisam ir para o banco)
const chaveSeries = () => `series-${meuUid()}-${isoDe(hoje())}`;
function seriesFeitas() {
  try { return JSON.parse(localStorage.getItem(chaveSeries()) || '{}'); } catch { return S.seriesMem || (S.seriesMem = {}); }
}
function guardarSeries(obj) {
  S.seriesMem = obj;
  try { localStorage.setItem(chaveSeries(), JSON.stringify(obj)); } catch { /* fica só na memória */ }
}

function controlesSerie(e, ok) {
  const total = e.series || 1;
  const feitas = Math.min(seriesFeitas()[e.id] || 0, total);
  if (ok) return '<div class="ex-acoes"><span class="small muted">Séries completas ✓</span></div>';
  return `<div class="ex-acoes">
    <button class="mini" data-serie="${e.id}" aria-label="Marcar série ${feitas + 1} de ${total} de ${esc(e.nome)} e descansar">✓ Série ${feitas + 1}/${total}</button>
    <button class="mini ghost" data-descansar="${e.id}" aria-label="Só descansar ${tempoBR(descansoDe(e))}">⏱ ${tempoBR(descansoDe(e))}</button>
  </div>`;
}

const T = { fim: 0, total: 0, exId: null, nome: '', ajuste: 0, intervalo: null, audio: null };

function exercicioDeHoje(id) {
  return S.plano[hoje().getDay()]?.exercicios?.find(x => x.id === id);
}

function iniciarDescanso(e) {
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

function pararDescanso() {
  clearInterval(T.intervalo); T.intervalo = null; T.fim = 0;
  try { T.wake?.release(); } catch { /* ok */ }
  T.wake = null;
  const el = $('#timer'); if (el) el.hidden = true;
}

function ajustarDescanso(seg) {
  if (!T.fim) return;
  T.fim = Math.max(Date.now() + 5000, T.fim + seg * 1000);
  T.total = Math.max(5, T.total + seg);
  T.ajuste += seg;
  atualizarTimer();
}

function bip() {
  const ctx = T.audio; if (!ctx) return;
  [0, 0.25, 0.5].forEach(t => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.15;
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.15);
  });
}

function atualizarTimer() {
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
function marcarSerie(id) {
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
  } else {
    iniciarDescanso(e);
  }
  render();
}

// Guarda o tempo ajustado no cronômetro como o novo padrão do exercício
function salvarDescansoPadrao() {
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
const ex = (nome, series, reps, carga, descanso) => ({ nome, series, reps, carga, descanso });
const MODELOS = [
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
function fotoHtml(dono, c) {
  if (!c.temFoto) return '';
  const k = `${dono}/${c.id}`, v = S.fotos[k];
  if (v === undefined) {
    S.fotos[k] = 'carregando';
    Store.lerFoto(dono, c.id).then(img => { S.fotos[k] = img; render(); }, () => { S.fotos[k] = null; render(); });
  }
  if (typeof v === 'string' && v.startsWith('data:')) return `<img class="foto" src="${v}" alt="Foto do check-in">`;
  return `<div class="foto vazia">${v === null ? 'Foto indisponível' : 'Carregando foto…'}</div>`;
}

function quandoCheckin(c) {
  const hojeIso = isoDe(hoje());
  if (c.data === hojeIso) return `Hoje às ${esc(c.hora)}`;
  const d = new Date(c.data + 'T12:00');
  return `${DIAS_NOME[d.getDay()]}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} às ${esc(c.hora)}`;
}

// dono = uid de quem fez o check-in; podeReagir = estou vendo o check-in de outra pessoa
function cartaoCheckin(dono, c, podeReagir) {
  const reacoes = Object.entries(c.reacoes || {});
  const minha = c.reacoes?.[meuUid()];
  const nomeViewer = uid => nomeDe(S.conexoes.find(x => x.viewer === uid && x.atleta === meuUid()) || {}, 'viewer');
  return `<div class="card stack">
    <div class="row between"><h3 class="grow">Check-in · ${quandoCheckin(c)}</h3>
      ${podeReagir ? '' : `<button class="link" data-apagar-ck="${c.id}">${S.confirmar === 'ck:' + c.id ? 'Confirmar' : 'Apagar'}</button>`}</div>
    ${fotoHtml(dono, c)}
    ${c.legenda ? `<p>${esc(c.legenda)}</p>` : ''}
    ${podeReagir
      ? `<div class="reacoes">${Store.REACOES.map(e => `<button class="${minha === e ? 'on' : ''}" data-reagir="${c.id}" data-emoji="${e}" aria-pressed="${minha === e}">${e}</button>`).join('')}</div>`
      : reacoes.length ? `<div class="reacoes">${reacoes.map(([uid, e]) => `<span class="pill ok">${e} ${esc(nomeViewer(uid))}</span>`).join('')}</div>` : ''}
  </div>`;
}

function secaoCheckinHoje() {
  const hojeIso = isoDe(hoje());
  const feitosHoje = S.checkins.filter(c => c.data === hojeIso);
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
  if (feitosHoje.length) {
    return `<section class="block"><span class="label">Check-in de hoje</span>${feitosHoje.map(c => cartaoCheckin(meuUid(), c, false)).join('')}</section>`;
  }
  return `<section class="block"><button class="btn grande" data-acao="abrir-checkin">Cheguei na academia · fazer check-in</button></section>`;
}

// Reduz a foto no próprio aparelho (lado maior até 1080 px) para caber no banco
function prepararFoto(arquivo) {
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

// ---------- Recados ----------
function horaMsg(m) {
  const d = m.criadoEm?.toDate ? m.criadoEm.toDate() : new Date();
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return isoDe(d) === isoDe(hoje()) ? hm : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hm}`;
}

function secaoRecados(c, outroNome, quantos, rapidos) {
  const msgs = (S.mensagens[c.id] || []).slice(-quantos);
  return `<section class="block"><span class="label">Recados com ${esc(outroNome)}</span>
    ${msgs.length ? `<div class="conversa">${msgs.map(m => `<div class="msg ${m.de === meuUid() ? 'eu' : ''}">${esc(m.texto)}<span class="small muted">${horaMsg(m)}</span></div>`).join('')}</div>`
      : '<p class="small muted">Nenhum recado ainda.</p>'}
    <div class="rapidos">${rapidos.map(t => `<button data-rapido="${esc(t)}" data-con="${c.id}">${esc(t)}</button>`).join('')}</div>
    <form class="row" data-recado="${c.id}">
      <input id="recadoIn-${c.id}" class="input grow" maxlength="300" placeholder="Escreva um recado" autocomplete="off">
      <button class="btn sm" type="submit">Enviar</button></form>
  </section>`;
}

function telaHoje() {
  const d = hoje();
  const r = resumoSemana();
  const plano = S.plano[d.getDay()];
  const feitos = S.registros[isoDe(d)]?.feitos?.length || 0;
  const total = plano?.exercicios?.length || 0;
  const fezCheckin = S.checkins.some(c => c.data === isoDe(d));
  const pill = !total ? (feitos || fezCheckin ? '<span class="pill ok">Treinou</span>' : '<span class="pill ok">Descanso</span>')
    : feitos >= total ? '<span class="pill ok">Treino completo</span>'
    : feitos ? '<span class="pill wait">Em andamento</span>'
    : fezCheckin ? '<span class="pill ok">Na academia</span>' : '<span class="pill wait">Ainda não começou</span>';
  const pedidos = pedidosRecebidos();
  const seq = sequencias(S.plano, S.registros, S.checkins);
  const ckHoje = S.checkins.find(c => c.data === isoDe(d));
  const novos = recadosNovos();
  return `${cabecalho()}
  ${pedidos.length ? `<section class="block"><div class="card stack aviso">
    <h3>${pedidos.length === 1 ? `${esc(nomeDe(pedidos[0], 'viewer'))} quer te acompanhar` : `${pedidos.length} pessoas querem te acompanhar`}</h3>
    <button class="btn sm" data-aba="conexoes">Ver pedido</button></div></section>` : ''}
  ${novos ? `<section class="block"><button class="card row atalho" data-aba="recados">💬 <span class="grow">${novos === 1 ? 'Você tem um recado novo' : `Você tem ${novos} recados novos`}</span><span class="link">Ler</span></button></section>` : ''}
  <section class="block">${ckHoje
    ? `<button class="card row atalho" data-aba="mural">✅ <span class="grow">Check-in feito às ${esc(ckHoje.hora)}</span><span class="link">Ver</span></button>`
    : '<button class="btn grande" data-acao="abrir-checkin">📍 Cheguei na academia · fazer check-in</button>'}</section>
  <section class="block">
    <div class="row between"><span class="label">Treino de hoje</span>${pill}</div>
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
  ${convitAvisos()}`;
}

function legenda() {
  return `<div class="legend"><span><i style="background:var(--accent)"></i>Treinou</span><span><i style="background:var(--hot)"></i>Faltou</span>
    <span><i style="background:var(--line)"></i>Planejado</span><span><i style="border:1px dashed var(--muted)"></i>Descanso</span></div>`;
}

function telaSemana() {
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
function formEditarEx(e) {
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

function secaoModelos() {
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
function telaHistorico() {
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
function detalheDia(iso) {
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
  const pill = { done: '<span class="pill ok">Treinou</span>', missed: '<span class="pill bad">Faltou</span>', rest: '<span class="pill">Descanso</span>', future: '<span class="pill wait">Planejado</span>' }[status];
  const titulo = `${DIAS_NOME[d.getDay()]}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}`;
  return `<section class="block"><div class="row between"><h2 class="grow">${titulo}</h2>${pill}</div>
    ${nomes.length ? `<div class="card stack"><span class="label">Exercícios feitos</span>
      <ul class="lista">${conhecidos.map(n => `<li>${esc(n)}</li>`).join('')}${outros ? `<li class="muted">${outros === 1 ? 'mais 1 exercício' : `mais ${outros} exercícios`} (já tirado do plano)</li>` : ''}</ul></div>` : ''}
    ${cargas.length ? `<div class="card stack"><span class="label">Cargas</span>
      ${cargas.map(c => `<div class="row between"><span>${esc(c.nome)}</span><b class="tabular">${kgBR(c.kg)} kg</b></div>`).join('')}</div>` : ''}
    ${peso ? `<div class="card row between"><span>Peso registrado</span><b class="tabular">${kgBR(peso.kg)} kg</b></div>` : ''}
    ${checkins.map(c => cartaoCheckin(meuUid(), c, false)).join('')}
    ${!nomes.length && !checkins.length && !peso ? `<p class="small muted">${status === 'missed' ? 'Tinha treino planejado e nada foi marcado.' : status === 'future' ? 'Ainda não chegou.' : 'Nada registrado neste dia.'}</p>` : ''}
  </section>`;
}

// ---------- Perfil ----------
function telaDados() {
  const p = S.perfil || {};
  return `${cabecalho()}
  <section class="block"><span class="label">Seus dados</span>
    <form id="formPerfil" class="card stack">
      <div class="field"><label class="label" for="pnome">Nome</label><input id="pnome" value="${esc(p.nome)}" maxlength="40" required></div>
      <div class="field"><label class="label" for="paltura">Altura (cm)</label><input id="paltura" type="text" inputmode="numeric" autocomplete="off" maxlength="3" value="${p.alturaCm ?? ''}" placeholder="Ex.: 165 (para o IMC)"></div>
      <div class="field"><label class="label" for="pmeta">Meta de peso (kg)</label><input id="pmeta" type="text" inputmode="decimal" autocomplete="off" maxlength="6" value="${p.metaPeso != null ? kgBR(p.metaPeso) : ''}" placeholder="Opcional"></div>
      <p class="small muted">${esc(p.email || S.user.email)}</p>
      <button class="btn" type="submit">Salvar</button>
    </form>
  </section>
  <section class="block"><button class="btn ghost" data-acao="sair">Sair da conta</button></section>`;
}

function telaAvisos() {
  return `${cabecalho()}${secaoAvisos()}`;
}

function telaConexoes() {
  const p = S.perfil || {};
  const acompanho = quemAcompanho();
  return `${cabecalho()}
  ${pedidosRecebidos().length ? `<section class="block"><span class="label">Pedidos para te acompanhar</span>
    ${pedidosRecebidos().map(c => `<div class="card stack aviso">
      <div><h3>${esc(nomeDe(c, 'viewer'))}</h3><p class="small muted">Quer ver seus treinos. Você escolhe o que mostrar depois de aceitar.</p></div>
      <div class="row"><button class="btn ghost" data-recusar="${c.id}">Recusar</button><button class="btn" data-aceitar="${c.id}">Aceitar</button></div>
    </div>`).join('')}</section>` : ''}
  <section class="block"><span class="label">Quem te acompanha</span>
    ${meusAcompanhantes().length ? meusAcompanhantes().map(c => `<div class="card stack">
      <div class="row between"><h3 class="grow">${esc(nomeDe(c, 'viewer'))}</h3><span class="pill ok">Conectado</span></div>
      ${[['treinos', 'Ver meus treinos e faltas'], ['checkins', 'Ver meus check-ins e fotos'], ['peso', 'Ver meu peso']].map(([k, t]) => `
        <label class="row between" for="perm-${c.id}-${k}"><span>${t}</span>
          <span class="switch"><input type="checkbox" id="perm-${c.id}-${k}" data-perm="${k}" data-con="${c.id}" ${c.perm?.[k] ? 'checked' : ''}><span></span></span></label>`).join('')}
      <button class="btn sm ghost" data-remover-con="${c.id}">${S.confirmar === c.id ? 'Tocar de novo para remover' : 'Remover'}</button>
    </div>`).join('') : '<p class="small muted">Ninguém ainda. Passe o seu código (logo abaixo) para quem vai te incentivar.</p>'}
  </section>
  <section class="block"><span class="label">Seu código de conexão</span>
    <div class="card stack"><div class="code">${esc(p.codigo || '—')}</div>
      <p class="small muted">A pessoa digita esse código aqui em Conexões, no app dela. Você recebe o pedido e decide se aceita.</p>
      <button class="btn sm ghost" data-acao="copiar">Copiar código</button></div>
  </section>
  <section class="block"><span class="label">Quem você acompanha</span>
    ${acompanho.length ? acompanho.map(c => `<div class="card row between">
      <div class="grow"><h3>${c.status === 'aceita' ? esc(nomeDe(c, 'atleta')) : `Código ${esc(c.codigo)}`}</h3>
        <p class="small muted">${c.status === 'aceita' ? 'Conectado' : 'Esperando a pessoa aceitar'}</p></div>
      <button class="btn sm ghost" data-remover-con="${c.id}">${S.confirmar === c.id ? 'Confirmar' : c.status === 'aceita' ? 'Parar' : 'Cancelar'}</button></div>`).join('')
      : '<p class="small muted">Você ainda não acompanha ninguém.</p>'}
    <span class="label">Acompanhar alguém</span>
    ${formConectar()}
  </section>`;
}

// ---------- Avisos no celular ----------
const ehIphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const permissao = () => globalThis.Notification?.permission; // 'default' | 'granted' | 'denied' | undefined

const TIPOS_AVISO = [
  ['checkin', 'Quando quem eu acompanho fizer check-in'],
  ['lembrete', 'No horário do lembrete, se quem eu acompanho ainda não treinou'],
  ['meuLembrete', 'No horário do lembrete, se eu ainda não treinei no dia de treino'],
  ['recados', 'Recados novos'],
  ['reacoes', 'Reações aos meus check-ins'],
  ['conquistas', 'Conquistas e meta do mês de quem eu acompanho'],
  ['resumo', 'Resumo da semana no domingo às 20h'],
];

// Situação dos avisos neste aparelho, em texto para a pessoa
function estadoAvisos() {
  if (!Store.avisosConfigurados) return { pode: false, texto: 'Os avisos ainda não foram configurados no app.' };
  if (ehIphone && !instalado()) return { pode: false, texto: 'No iPhone, os avisos só funcionam com o app na Tela de Início: no Safari, toque em Compartilhar ⬆ e em "Adicionar à Tela de Início". Depois abra por lá.' };
  if (!globalThis.Notification) return { pode: false, texto: 'Este navegador não recebe avisos. No Android, use o Chrome.' };
  if (permissao() === 'denied') return { pode: false, texto: 'Os avisos estão bloqueados para este app. Libere nas configurações de notificação do celular e abra o app de novo.' };
  if (permissao() === 'granted') return { pode: true, ativo: true, texto: 'Avisos ligados neste aparelho.' };
  return { pode: true, ativo: false, texto: 'Receba um aviso quando alguém fizer check-in, reagir ou mandar recado.' };
}

function secaoAvisos() {
  const e = estadoAvisos();
  const prefs = S.perfil?.avisos || {};
  return `<section class="block"><span class="label">Avisos no celular</span>
    <div class="card stack">
      <div class="row between"><p class="small grow ${e.ativo ? '' : 'muted'}">${esc(e.texto)}</p>${e.ativo ? '<span class="pill ok">Ligados</span>' : ''}</div>
      ${e.pode && !e.ativo ? '<button class="btn" data-acao="ativar-avisos">Ativar avisos neste aparelho</button>' : ''}
      ${TIPOS_AVISO.map(([k, t]) => `<label class="row between" for="aviso-${k}"><span>${t}</span>
        <span class="switch"><input type="checkbox" id="aviso-${k}" data-aviso="${k}" ${prefs[k] === false ? '' : 'checked'}><span></span></span></label>`).join('')}
      <div class="row between"><label for="horaLembrete">Horário do lembrete</label>
        <select id="horaLembrete" class="input" style="width:auto">${Array.from({ length: 17 }, (_, i) => i + 6)
          .map(h => `<option value="${h}" ${(S.perfil?.horaLembrete ?? 19) === h ? 'selected' : ''}>${pad(h)}:00</option>`).join('')}</select></div>
      <p class="small muted">Nesse horário chegam o seu lembrete e o aviso de quem você acompanha, se ainda não treinou. Escolha um pouco antes da hora em que costuma treinar.</p>
    </div></section>`;
}

function convitAvisos() {
  const e = estadoAvisos();
  let dispensado = false;
  try { dispensado = localStorage.getItem('avisos-dispensado') === '1'; } catch { /* sem armazenamento */ }
  if (!e.pode || e.ativo || dispensado) return '';
  return `<section class="block"><div class="card stack aviso"><h3>Ative os avisos</h3>
    <p class="small">Saiba na hora quando alguém reagir ou mandar recado, e receba o lembrete do treino.</p>
    <div class="row"><button class="btn ghost" data-acao="dispensar-avisos">Agora não</button><button class="btn" data-acao="ativar-avisos">Ativar</button></div></div></section>`;
}

async function ativarAvisos() {
  try {
    const resultado = await Notification.requestPermission();
    if (resultado !== 'granted') { toast('Sem permissão, o app não consegue mandar avisos.'); render(); return; }
    const ok = await Store.registrarAparelho(uid());
    toast(ok ? 'Avisos ligados neste aparelho 🔔' : 'Este aparelho não suporta avisos.');
  } catch (err) {
    console.error(err);
    toast('Não deu para ligar os avisos: ' + (err.message || err));
  }
  render();
}

// ---------- Progresso: peso e frequência ----------
const kgBR = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dataCurta = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const diaDe = iso => new Date(iso + 'T12:00');

// Treinos feitos x planejados nas últimas semanas (planejado = plano atual da semana)
function semanasFrequencia(planoSemana, registros, checkins, quantas = SEMANAS_HISTORICO) {
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
const graficoPeso = (id, pesos, meta) => graficoLinha(id, pesos.map(p => ({ data: p.data, kg: p.kg })), meta, 'kg', 'peso');

function graficoLinha(id, pesos, meta, unidade, nome) {
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
const variacao = (d, unidade = 'kg') => Math.abs(d) < 0.05 ? 'igual' : `${d < 0 ? '−' : '+'}${kgBR(Math.abs(d))} ${unidade}`;

// ---------- Evolução de carga ----------

// Todas as cargas anotadas, por nome do exercício: { 'Agachamento livre': [{ data, kg }] }
function historicoCargas(registros) {
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
function campoCarga(e, kgHoje) {
  const ultima = historicoCargas(S.registros)[e.nome]?.at(-1)?.kg;
  const doPlano = parseFloat(String(e.carga || '').replace(',', '.'));
  const sugestao = ultima ?? (Number.isFinite(doPlano) ? doPlano : null);
  return `<label class="carga"><span class="sr">Carga usada em ${esc(e.nome)} (kg)</span>
    <input id="carga-${e.id}" data-carga="${e.id}" data-nome="${esc(e.nome)}" type="text" inputmode="decimal" maxlength="5" autocomplete="off"
      value="${kgHoje != null ? kgBR(kgHoje) : ''}" placeholder="${sugestao != null ? kgBR(sugestao) : 'kg'}"><span class="small muted">kg</span></label>`;
}

function secaoCargas() {
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

async function carregarFotosProgresso() {
  if (S.fotosProg !== undefined) return;
  S.fotosProg = null; // carregando
  try { S.fotosProg = await Store.lerFotosProgresso(uid()); } catch (err) { console.error(err); S.fotosProg = []; toast(mensagemErro(err)); }
  render();
}

// Peso registrado mais perto (antes ou no dia) da foto, para mostrar junto
const pesoNoDia = data => S.pesos.filter(p => p.data <= data).at(-1);

function secaoFotosProgresso() {
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
function diasTreinados(registros, checkins) {
  const dias = new Set(checkins.map(c => c.data));
  Object.keys(registros).forEach(d => { if (registros[d]?.feitos?.length) dias.add(d); });
  return [...dias].sort();
}

// Sequência = dias de treino planejado cumpridos seguidos (descanso não quebra; hoje ainda não conta como falta)
function sequencias(planoSemana, registros, checkins) {
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
function semanasCompletas(planoSemana, registros, checkins) {
  const semanas = semanasFrequencia(planoSemana, registros, checkins, 52);
  let seguidas = 0, melhor = 0, alguma = false;
  for (const s of semanas) {
    const completa = s.planejados > 0 && s.feitos >= s.planejados && (!s.atual || s.planejados === semanaPlanejada(planoSemana));
    if (s.atual && !completa) continue; // semana atual em andamento não quebra
    if (completa) { seguidas++; alguma = true; melhor = Math.max(melhor, seguidas); } else seguidas = 0;
  }
  return { seguidas, melhor, alguma };
}
const semanaPlanejada = planoSemana => [0, 1, 2, 3, 4, 5, 6].filter(d => planoSemana[d]?.exercicios?.length).length;

const CONQUISTAS = [
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

function contextoConquistas(planoSemana, registros, checkins, pesos, alturaCm) {
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
function gradeConquistas(ctx, guardadas, mostrarBloqueadas) {
  const lista = CONQUISTAS.filter(q => guardadas?.[q.id] || q.ok(ctx));
  const todasBloqueadas = mostrarBloqueadas ? CONQUISTAS.filter(q => !lista.includes(q)) : [];
  // Por padrão mostra só as próximas 3 a conquistar, para não encher a tela de selos apagados
  const bloqueadas = S.verTodasConquistas ? todasBloqueadas : todasBloqueadas.slice(0, 3);
  if (!lista.length && !bloqueadas.length) return '<p class="small muted">Nenhuma conquista ainda.</p>';
  return `<div class="selos">${lista.map(q => `<div class="selo"><span class="selo-icone">${q.icone}</span><b>${esc(q.nome)}</b>
      <span class="small muted">${guardadas?.[q.id] ? dataCurta(guardadas[q.id]) : esc(q.desc)}</span></div>`).join('')}
    ${bloqueadas.map(q => `<div class="selo bloqueado"><span class="selo-icone">${q.icone}</span><b>${esc(q.nome)}</b><span class="small muted">${esc(q.desc)}</span></div>`).join('')}</div>
    ${todasBloqueadas.length > 3 ? `<button class="link" data-ver-conquistas>${S.verTodasConquistas ? 'Mostrar menos' : `Ver todas as ${CONQUISTAS.length} conquistas`}</button>` : ''}`;
}

function cartaoSequencia(ctx) {
  const recorde = ctx.atual >= 2 && ctx.atual >= ctx.recorde ? 'Recorde atual! 🎉' : `Recorde: ${ctx.recorde}`;
  const semanas = ctx.semanasSeguidas ? ` · ${ctx.semanasSeguidas} ${ctx.semanasSeguidas === 1 ? 'semana completa' : 'semanas completas seguidas'}` : '';
  return `<div class="card row sequencia">
    <div class="fogo" aria-hidden="true">🔥</div>
    <div class="grow"><b class="tabular">${ctx.atual} ${ctx.atual === 1 ? 'treino seguido' : 'treinos seguidos'}</b>
      <p class="small muted">${recorde}${semanas}</p></div>
  </div>`;
}

// Quando aparece conquista nova, guarda no perfil e avisa quem acompanha (uma vez só)
let verificandoConquistas = null;
function verificarConquistas() {
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
const mesAtual = () => isoDe(hoje()).slice(0, 7);
const nomeMes = mes => new Date(mes + '-15T12:00').toLocaleDateString('pt-BR', { month: 'long' });
const treinosNoMes = (registros, checkins, mes = mesAtual()) => diasTreinados(registros, checkins).filter(d => d.startsWith(mes)).length;

// lado = 'atleta' (ela, vendo a meta com quem acompanha) ou 'viewer' (quem acompanha)
// feitos = treinos no mês, ou null quando quem acompanha não tem permissão de ver
function cartaoMetaCasal(c, lado, feitos, nomeOutro) {
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
function verificarMetas() {
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
const FAIXAS_IMC = [
  { ate: 18.5, nome: 'Abaixo do peso', cor: 'wait' },
  { ate: 25, nome: 'Peso normal', cor: 'ok' },
  { ate: 30, nome: 'Sobrepeso', cor: 'wait' },
  { ate: 35, nome: 'Obesidade grau I', cor: 'bad' },
  { ate: 40, nome: 'Obesidade grau II', cor: 'bad' },
  { ate: Infinity, nome: 'Obesidade grau III', cor: 'bad' },
];
const calcImc = (kg, cm) => kg / ((cm / 100) ** 2);
const faixaImc = imc => FAIXAS_IMC.find(f => imc < f.ate);
const faixaSaudavel = cm => [18.5 * (cm / 100) ** 2, 24.9 * (cm / 100) ** 2];
const alturaBR = cm => (cm / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Ritmo das últimas 4 semanas em kg por semana (negativo = perdendo). null = poucos dados.
function ritmoSemanal(pesos) {
  if (pesos.length < 2) return null;
  const fim = diaDe(pesos.at(-1).data);
  const janela = pesos.filter(p => (fim - diaDe(p.data)) / 86400000 <= 28);
  const ini = janela[0], ult = janela.at(-1);
  const dias = (diaDe(ult.data) - diaDe(ini.data)) / 86400000;
  if (janela.length < 2 || dias < 7) return null;
  return (ult.kg - ini.kg) / (dias / 7);
}

// Régua do IMC de 15 a 40 com as faixas coloridas e um marcador
function reguaImc(imc) {
  const de = 15, ate = 40, pos = v => (Math.min(ate, Math.max(de, v)) - de) / (ate - de) * 100;
  const zonas = [[de, 18.5, 'z-alerta'], [18.5, 25, 'z-ok'], [25, 30, 'z-alerta'], [30, ate, 'z-ruim']];
  return `<div class="regua" aria-hidden="true">
    ${zonas.map(([a, b, c]) => `<span class="${c}" style="left:${pos(a)}%;width:${pos(b) - pos(a)}%"></span>`).join('')}
    <i style="left:${pos(imc)}%"></i>
  </div>
  <div class="regua-num tabular" aria-hidden="true">${[18.5, 25, 30, 35].map(v => `<span style="left:${pos(v)}%">${String(v).replace('.', ',')}</span>`).join('')}</div>`;
}

// proprio = é o meu IMC (mostra quanto falta e a previsão); senão é o de quem eu acompanho
function cartaoImc(pesos, alturaCm, proprio, meta) {
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
const MEDIDAS = [['cintura', 'Cintura'], ['quadril', 'Quadril'], ['braco', 'Braço']];

function secaoMedidas() {
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
function graficoFrequencia(id, semanas) {
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
  <div class="legend"><span><i style="background:var(--accent)"></i>Treinou</span><span><i style="background:var(--line)"></i>Planejado</span></div>`;
}

function resumoPeso(pesos, meta) {
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
function resumoPesoAcomp(pesos) {
  if (!pesos.length) return '';
  const atual = pesos.at(-1).kg, perdeu = pesos[0].kg - atual;
  return `<div class="grid3">
    <div class="stat"><span class="label">Atual</span><b class="tabular">${kgBR(atual)}</b><span class="small muted">kg</span></div>
    <div class="stat"><span class="label">${perdeu >= 0 ? 'Perdeu' : 'Ganhou'}</span><b class="tabular">${kgBR(Math.abs(perdeu))}</b><span class="small muted">kg</span></div>
    <div class="stat"><span class="label">Desde</span><b class="tabular">${dataCurta(pesos[0].data)}</b><span class="small muted">${pesos.length} registros</span></div>
  </div>`;
}

// ---------- Corpo ----------
function telaPeso() {
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
const telaMedidas = () => cabecalho() + secaoMedidas();
const telaFotos = () => cabecalho() + secaoFotosProgresso();

// ---------- Evolução ----------
function telaConquistas() {
  const ctx = contextoConquistas(S.plano, S.registros, S.checkins, S.pesos, S.perfil?.alturaCm);
  const qtd = CONQUISTAS.filter(q => S.perfil?.conquistas?.[q.id] || q.ok(ctx)).length;
  return `${cabecalho()}
  <section class="block"><span class="label">Sequência</span>${cartaoSequencia(ctx)}</section>
  <section class="block"><div class="row between"><span class="label">Conquistas</span><span class="small muted tabular">${qtd} de ${CONQUISTAS.length}</span></div>
    ${gradeConquistas(ctx, S.perfil?.conquistas, true)}</section>`;
}

function telaFrequencia() {
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
  </section>`;
}
const telaCargas = () => cabecalho() + secaoCargas();

function formConectar() {
  return `<form id="formConexao" class="stack">
    <div class="field"><label class="label" for="codigoIn">Código da pessoa</label>
      <input id="codigoIn" placeholder="FIT-AB12" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="10" required></div>
    <p class="erro" id="conexaoErro" hidden></p>
    <button class="btn" type="submit" id="conexaoBtn">Pedir para acompanhar</button>
  </form>`;
}

// ---------- Juntos ----------
// Quem eu acompanho (aceitas) e qual está selecionada; dados dela já carregados em S.acomp
function contextoAcomp() {
  const aceitas = quemAcompanho().filter(c => c.status === 'aceita');
  const atual = aceitas.find(c => c.id === S.acompId) || aceitas[0];
  if (!atual) return { aceitas };
  const A = S.acomp && S.acomp.chave === chaveAcomp(atual) ? S.acomp : null;
  const checkins = atual.perm?.checkins && A && !A.bloqCheckins ? A.checkins : [];
  return { aceitas, atual, A, checkins, nome: nomeDe(atual, 'atleta') };
}
const chipsAcomp = (aceitas, atual) => aceitas.length > 1
  ? `<div class="chips">${aceitas.map(c => `<button class="chip ${c.id === atual.id ? 'on' : ''}" data-acomp="${c.id}">${esc(nomeDe(c, 'atleta'))}</button>`).join('')}</div>` : '';
const semConexao = texto => `<section class="block"><div class="card stack"><h3>Treine junto</h3><p class="small muted">${texto}</p>
  <button class="btn sm" data-aba="conexoes">Conectar com alguém</button></div></section>`;

// Check-in: o meu e o de quem eu acompanho, com reações, e a meta do casal
function telaMural() {
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
            <p class="small muted">Que tal mandar um recado de incentivo?</p><button class="btn sm ghost" data-aba="recados">Mandar recado</button></div>
          ${checkins[0] ? `<span class="label">Último check-in de ${esc(nome)}</span>${cartaoCheckin(atual.atleta, checkins[0], true)}` : ''}`;
    }
  }
  const metas = [
    ...meusAcompanhantes().map(c => cartaoMetaCasal(c, 'atleta', treinosNoMes(S.registros, S.checkins))),
    ...(atual ? [cartaoMetaCasal(atual, 'viewer', atual.perm?.treinos || atual.perm?.checkins ? treinosNoMes(A?.registros || {}, checkins) : null, nome)] : []),
  ].join('');
  return `${cabecalho()}
  ${secaoCheckinHoje()}
  ${atual ? `<section class="block"><span class="label">${esc(nome)} hoje</span>${chipsAcomp(aceitas, atual)}${deQuemAcompanho}</section>` : ''}
  ${metas}
  ${!atual && !meusAcompanhantes().length ? semConexao('Conecte-se com quem você quer incentivar (ou com quem vai te incentivar) para ver os check-ins um do outro, reagir e combinar metas.') : ''}`;
}

// Recados: uma conversa para cada conexão aceita, dos dois lados
function telaRecados() {
  const conversas = S.conexoes.filter(c => c.status === 'aceita');
  setTimeout(() => { marcarRecadosLidos(); mostrarNav(true); }, 0);
  if (!conversas.length) return cabecalho() + semConexao('Depois de conectar com alguém, vocês trocam recados por aqui.');
  return cabecalho() + conversas.map(c => c.atleta === meuUid()
    ? secaoRecados(c, nomeDe(c, 'viewer'), 20, ['Valeu! ❤️', 'Tô indo!', 'Hoje não deu 😕', 'Treino feito! 💪'])
    : secaoRecados(c, nomeDe(c, 'atleta'), 20, ['Bora treinar! 💪', 'Tô orgulhoso de você', 'Só 1 hora e tá feito', 'Arrasou hoje!'])).join('');
}

// Acompanhar: treino, semana, sequência, conquistas e peso de quem eu acompanho
function telaAcompanhar() {
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
    const feitos = A.registros[hojeIso]?.feitos?.length || 0;
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
const TELAS = {
  treino: { hoje: () => telaHoje(), semana: () => telaSemana(), historico: () => telaHistorico() },
  corpo: { peso: telaPeso, medidas: telaMedidas, fotos: telaFotos },
  juntos: { mural: telaMural, recados: telaRecados, acompanhar: telaAcompanhar },
  evolucao: { conquistas: telaConquistas, frequencia: telaFrequencia, cargas: telaCargas },
  perfil: { dados: telaDados, conexoes: telaConexoes, avisos: telaAvisos },
};

// Conta criada, mas o e-mail ainda não foi confirmado
function telaVerificar() {
  mostrarNav(false);
  app.innerHTML = `<div class="hero"><span class="label">Falta um passo</span><h1>Confirme seu e-mail</h1>
    <p class="muted">Para usar o app, confirme que o e-mail <b>${esc(S.user.email)}</b> é seu: abra o link que enviamos para ele e volte aqui.
      Se ainda não recebeu, toque em "Enviar o link de novo".</p></div>
  <div class="stack">
    <button class="btn" data-acao="ja-confirmei">Já confirmei</button>
    <button class="btn ghost" data-acao="reenviar-verificacao">Enviar o link de novo</button>
    <p class="small muted">Não chegou? Olhe a caixa de spam e as promoções. O remetente é o Treino Junto (noreply@…firebaseapp.com).</p>
    <p class="erro" id="verificarErro" hidden></p>
    <button class="link" data-acao="sair">Errei o e-mail · usar outra conta</button>
  </div>`;
}

async function jaConfirmei(silencioso) {
  try {
    if (await Store.conferirVerificacao()) {
      S.user = { ...S.user, verificado: true };
      comecarEscutas(S.user);
      toast('E-mail confirmado. Bem-vinda(o)! 🎉');
      render();
    } else if (!silencioso) {
      const el = $('#verificarErro');
      if (el) { el.textContent = 'Ainda não aparece como confirmado. Toque no link do e-mail e tente de novo.'; el.hidden = false; }
    }
  } catch (err) { if (!silencioso) toast(mensagemErro(err)); }
}
// Voltou do aplicativo de e-mail: confere sozinho
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.user && !S.user.verificado) jaConfirmei(true);
});

function render() {
  if (!Store.configurado) return telaSemConfig();
  if (S.user && !S.user.verificado) return telaVerificar();
  if (S.user === undefined || (S.user && S.perfil === undefined)) {
    mostrarNav(false);
    app.innerHTML = '<p class="muted carregando">Carregando…</p>';
    return;
  }
  if (!S.user) return telaLogin();
  mostrarNav(true);
  // Mantém o que estava sendo digitado quando os dados mudam no banco
  const foco = document.activeElement?.id;
  const rascunho = {};
  app.querySelectorAll('input[id]:not([type=file]):not([type=checkbox])').forEach(i => { rascunho[i.id] = i.value; });
  app.innerHTML = TELAS[S.aba][S.sub[S.aba]]();
  for (const [id, valor] of Object.entries(rascunho)) {
    const el = document.getElementById(id);
    if (el) el.value = valor;
  }
  if (foco) document.getElementById(foco)?.focus();
}

// nome = aba ('treino') ou subaba ('semana'); aba sozinha volta para a última subaba usada nela
function irPara(nome) {
  const rota = ROTAS[nome];
  if (!rota) return;
  S.aba = rota[0];
  if (rota[1]) S.sub[rota[0]] = rota[1];
  S.editandoEx = null;
  app.innerHTML = ''; // troca de tela começa limpa, sem levar o rascunho da outra
  render();
  window.scrollTo(0, 0);
  // Endereço com o nome da tela: dá para salvar o atalho e os avisos abrem no lugar certo
  try { history.replaceState(null, '', '#' + S.sub[S.aba]); } catch { /* ok */ }
}

// ---------- Login e escutas ----------
function comecarEscutas(user) {
  pararEscutas.forEach(f => f()); pararEscutas = [];
  const erro = err => { console.error(err); toast(mensagemErro(err)); };
  const desde = inicioHistorico(); // semanas anteriores entram no gráfico de frequência
  pararEscutas.push(
    Store.escutarPerfil(user.uid, async perfil => {
      if (!perfil) { // conta criada sem perfil (ex.: falhou a internet no cadastro)
        if (cadastrando) return; // o cadastro já está criando o perfil com o nome digitado
        try { await Store.criarPerfil(user.uid, user.nome || user.email.split('@')[0], user.email); } catch (e) { erro(e); }
        return;
      }
      S.perfil = perfil; render(); migrarPlanoAntigo(); verificarConquistas();
    }, erro),
    Store.escutarPlano(user.uid, plano => { S.plano = plano; S.carregado.plano = true; aposMudanca(); }, erro),
    Store.escutarRegistros(user.uid, desde, registros => { S.registros = registros; S.carregado.registros = true; aposMudanca(); }, erro),
    Store.escutarCheckins(user.uid, desde, lista => { S.checkins = lista; S.carregado.checkins = true; aposMudanca(); }, erro),
    Store.escutarPesos(user.uid, pesos => { S.pesos = pesos; S.carregado.pesos = true; aposMudanca(); }, erro),
    Store.escutarMedidas(user.uid, medidas => { S.medidas = medidas; render(); }, erro),
    Store.escutarConexoes(user.uid, conexoes => {
      S.conexoes = conexoes;
      if (S.confirmar && !S.confirmar.includes(':') && !conexoes.some(c => c.id === S.confirmar)) S.confirmar = null;
      sincronizarAcomp();
      sincronizarMensagens();
      render();
      verificarMetas();
    }, erro),
  );
}

// Meus dados mudaram: redesenha e confere conquistas e metas do casal
function aposMudanca() { render(); migrarPlanoAntigo(); verificarConquistas(); verificarMetas(); }

// Escuta os dados da pessoa que estou acompanhando. Refaz a escuta quando a pessoa
// muda, aceita o pedido ou liga/desliga as permissões de treinos e check-ins.
const chaveAcomp = c => `${c.id}:${c.status}:${!!c.perm?.treinos}:${!!c.perm?.checkins}:${!!c.perm?.peso}`;
function pararDeAcompanhar() { pararAcomp.forEach(f => f()); pararAcomp = []; }
function acompAtual() {
  const aceitas = quemAcompanho().filter(c => c.status === 'aceita');
  return aceitas.find(c => c.id === S.acompId) || aceitas[0];
}
function sincronizarAcomp() {
  const atual = acompAtual();
  const chave = atual && (atual.perm?.treinos || atual.perm?.checkins || atual.perm?.peso) ? chaveAcomp(atual) : null;
  if ((S.acomp?.chave ?? null) === chave) return;
  pararDeAcompanhar();
  if (!chave) { S.acomp = null; return; }
  const alvo = S.acomp = {
    chave, plano: {}, registros: {}, checkins: [], pesos: [],
    temPlano: false, temRegistros: false, temCheckins: false, temPesos: false,
    bloqTreinos: false, bloqCheckins: false, bloqPeso: false,
  };
  const atualizar = () => { if (S.acomp === alvo) render(); };
  const falhou = campo => err => {
    if (err.code !== 'permission-denied') { console.error(err); toast(mensagemErro(err)); }
    alvo[campo] = true; atualizar();
  };
  const desde = inicioHistorico();
  if (atual.perm?.treinos) pararAcomp.push(
    Store.escutarPlano(atual.atleta, plano => { alvo.plano = plano; alvo.temPlano = true; atualizar(); }, falhou('bloqTreinos')),
    Store.escutarRegistros(atual.atleta, desde, reg => { alvo.registros = reg; alvo.temRegistros = true; atualizar(); }, falhou('bloqTreinos')),
  );
  if (atual.perm?.checkins) pararAcomp.push(
    Store.escutarCheckins(atual.atleta, desde, lista => { alvo.checkins = lista; alvo.temCheckins = true; atualizar(); }, falhou('bloqCheckins')),
  );
  if (atual.perm?.peso) pararAcomp.push(
    Store.escutarPesos(atual.atleta, pesos => { alvo.pesos = pesos; alvo.temPesos = true; atualizar(); }, falhou('bloqPeso')),
  );
}

// Histórico inteiro de treinos e check-ins (documentos pequenos; as fotos ficam à parte).
// É o que permite calcular sequências, conquistas e a meta do mês.
const inicioHistorico = () => '2000-01-01';

// Uma escuta de recados para cada conexão aceita
function sincronizarMensagens() {
  const ids = new Set(S.conexoes.filter(c => c.status === 'aceita').map(c => c.id));
  for (const id of Object.keys(pararMsgs)) {
    if (!ids.has(id)) { pararMsgs[id](); delete pararMsgs[id]; delete S.mensagens[id]; }
  }
  for (const id of ids) {
    if (pararMsgs[id]) continue;
    pararMsgs[id] = Store.escutarMensagens(id, msgs => { S.mensagens[id] = msgs; render(); }, err => {
      // Logo depois de aceitar, o banco pode ainda não ter liberado: tenta de novo em instantes
      console.warn('Recados indisponíveis', err);
      tentativasMsgs[id] = (tentativasMsgs[id] || 0) + 1;
      if (tentativasMsgs[id] > 5) return; // desiste: provavelmente as regras não foram publicadas
      delete pararMsgs[id];
      setTimeout(() => { if (S.user) sincronizarMensagens(); }, 3000);
    });
  }
}
function pararMensagens() { Object.values(pararMsgs).forEach(f => f()); pararMsgs = {}; S.mensagens = {}; }

if (Store.configurado) {
  Store.onAuthChange(user => {
    S.user = user;
    S.perfil = undefined; S.plano = {}; S.registros = {}; S.checkins = []; S.fotos = {}; S.pesos = []; S.medidas = []; S.dica = {}; S.carregado = {}; S.editandoMeta = null;
    S.fotosProg = undefined; S.fotoAntes = S.fotoDepois = S.exSel = null; S.fotoProgEnviando = false;
    S.conexoes = []; S.acomp = null; S.acompId = null; S.confirmar = null;
    S.checkin = { aberto: false, foto: null, processando: false, enviando: false };
    pararDeAcompanhar(); pararMensagens();
    // Só carrega os dados depois que o e-mail foi confirmado (as regras do banco também exigem)
    if (user?.verificado) comecarEscutas(user); else { pararEscutas.forEach(f => f()); pararEscutas = []; }
    // Mantém o registro do aparelho atualizado (o código do aparelho pode mudar com o tempo)
    if (user && Store.avisosConfigurados && permissao() === 'granted') Store.registrarAparelho(user.uid).catch(console.warn);
    const rota = ROTAS[rotaDoEndereco(location.hash)] || ROTAS.hoje;
    S.aba = rota[0]; if (rota[1]) S.sub[rota[0]] = rota[1];
    app.innerHTML = '';
    render();
  });
}

// ---------- Ações ----------
const uid = () => S.user.uid;
// Cópia do plano de um dia para editar. Se o dia era descanso, o treino passa a valer a partir de hoje.
function planoDoDia(dia) {
  const p = structuredClone(S.plano[dia] || { titulo: '', exercicios: [] });
  if (!p.exercicios?.length) p.desde = isoDe(hoje());
  return p;
}

// Planos antigos (antes do campo "desde") passam a valer a partir da criação da conta
let planoMigrado = false;
function migrarPlanoAntigo() {
  if (planoMigrado || !S.perfil?.criadoEm?.toDate || !S.carregado.plano) return;
  planoMigrado = true;
  const desde = isoDe(S.perfil.criadoEm.toDate());
  Object.entries(S.plano).forEach(([dia, p]) => {
    if (p.exercicios?.length && !p.desde) Store.salvarDia(uid(), dia, { ...p, desde }).catch(console.warn);
  });
}

async function salvar(promessa, sucesso) {
  try { await promessa; if (sucesso) toast(sucesso); } catch (err) { console.error(err); toast(mensagemErro(err)); }
}

// Tocar num ponto ou barra do gráfico mostra o valor embaixo dele
function mostrarDica(alvo) {
  S.dica[alvo.dataset.dica] = +alvo.dataset.i;
  render();
  document.querySelector(`[data-dica="${alvo.dataset.dica}"][data-i="${alvo.dataset.i}"]`)?.focus({ preventScroll: true });
}
document.addEventListener('keydown', e => {
  const alvo = e.target.closest?.('[data-dica]');
  if (alvo && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); mostrarDica(alvo); }
});

document.addEventListener('click', e => {
  const alvo = e.target.closest('[data-dica]');
  if (alvo) { mostrarDica(alvo); return; }
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.modo) { S.modoLogin = b.dataset.modo; render(); return; }
  if (b.dataset.dia !== undefined && !b.dataset.aba) { S.diaSel = +b.dataset.dia; app.innerHTML = ''; render(); return; }
  if (b.dataset.aba) { if (b.dataset.dia !== undefined) S.diaSel = +b.dataset.dia; irPara(b.dataset.aba); return; }

  // Conexões
  if (b.dataset.aceitar) {
    salvar(Store.aceitarConexao(b.dataset.aceitar, S.perfil?.nome || '', S.perfil?.alturaCm || null), 'Pedido aceito. Escolha abaixo o que a pessoa pode ver.');
    return;
  }
  if (b.dataset.recusar) { salvar(Store.removerConexao(b.dataset.recusar), 'Pedido recusado'); return; }
  if (b.dataset.removerCon) {
    const id = b.dataset.removerCon;
    if (S.confirmar !== id) { S.confirmar = id; render(); return; } // primeiro toque só pede confirmação
    S.confirmar = null;
    if (S.acompId === id) S.acompId = null;
    salvar(Store.removerConexao(id), 'Conexão removida');
    return;
  }
  if (b.dataset.acomp) { S.acompId = b.dataset.acomp; sincronizarAcomp(); render(); return; }

  // Check-ins e recados
  if (b.dataset.apagarCk) {
    const chave = 'ck:' + b.dataset.apagarCk;
    if (S.confirmar !== chave) { S.confirmar = chave; render(); return; }
    S.confirmar = null;
    salvar(Store.apagarCheckin(uid(), b.dataset.apagarCk), 'Check-in apagado');
    return;
  }
  if (b.dataset.apagarMedida) {
    const chave = 'medida:' + b.dataset.apagarMedida;
    if (S.confirmar !== chave) { S.confirmar = chave; render(); return; }
    S.confirmar = null;
    salvar(Store.apagarMedida(uid(), b.dataset.apagarMedida), 'Medidas apagadas');
    return;
  }
  if (b.dataset.diaHist) { S.diaHist = b.dataset.diaHist; render(); return; }
  if (b.dataset.mes) {
    const atual = S.mesHist || isoDe(hoje()).slice(0, 7);
    const [a, m] = atual.split('-').map(Number);
    const novo = new Date(a, m - 1 + +b.dataset.mes, 15);
    S.mesHist = isoDe(novo).slice(0, 7); S.diaHist = null; render();
    return;
  }
  if (b.dataset.serie) { marcarSerie(b.dataset.serie); return; }
  if (b.dataset.descansar) { const e = exercicioDeHoje(b.dataset.descansar); if (e) iniciarDescanso(e); return; }
  if (b.dataset.timer) {
    const t = b.dataset.timer;
    if (t === 'fechar') pararDescanso(); else if (t === 'padrao') salvarDescansoPadrao(); else ajustarDescanso(+t);
    return;
  }
  if (b.dataset.editarEx) { S.editandoEx = b.dataset.editarEx; render(); document.getElementById('edNome')?.focus(); return; }
  if (b.dataset.cancelarEx !== undefined) { S.editandoEx = null; render(); return; }
  if (b.dataset.verModelos !== undefined) { S.verModelos = !S.verModelos; render(); return; }
  if (b.dataset.usarModelo) {
    const chave = 'modelo:' + b.dataset.usarModelo;
    if (S.confirmar !== chave) { S.confirmar = chave; render(); return; }
    S.confirmar = null; S.verModelos = false;
    usarModelo(MODELOS.find(m => m.id === b.dataset.usarModelo));
    return;
  }
  if (b.dataset.verConquistas !== undefined) { S.verTodasConquistas = !S.verTodasConquistas; render(); return; }
  if (b.dataset.exSel) { S.exSel = b.dataset.exSel; render(); return; }
  if (b.dataset.apagarFotoProg) {
    const data = b.dataset.apagarFotoProg, chave = 'fp:' + data;
    if (S.confirmar !== chave) { S.confirmar = chave; render(); return; }
    S.confirmar = null;
    Store.apagarFotoProgresso(uid(), data).then(() => {
      S.fotosProg = (S.fotosProg || []).filter(f => f.data !== data); render(); toast('Foto apagada');
    }, err => toast(mensagemErro(err)));
    return;
  }
  if (b.dataset.editarMeta) { S.editandoMeta = b.dataset.editarMeta; render(); return; }
  if (b.dataset.cancelarMeta !== undefined) { S.editandoMeta = null; render(); return; }
  if (b.dataset.medidaSel) { S.medidaSel = b.dataset.medidaSel; render(); return; }
  if (b.dataset.metaSugerida) {
    const p = S.perfil || {};
    salvar(Store.salvarPerfil(uid(), { nome: p.nome, metaPeso: +b.dataset.metaSugerida, alturaCm: p.alturaCm ?? null }), 'Meta definida');
    return;
  }
  if (b.dataset.apagarPeso) {
    const chave = 'peso:' + b.dataset.apagarPeso;
    if (S.confirmar !== chave) { S.confirmar = chave; render(); return; }
    S.confirmar = null;
    salvar(Store.apagarPeso(uid(), b.dataset.apagarPeso), 'Registro apagado');
    return;
  }
  if (S.confirmar) { S.confirmar = null; render(); } // tocar em outra coisa cancela a confirmação
  if (b.dataset.reagir) {
    const atual = acompAtual();
    const ck = S.acomp?.checkins.find(c => c.id === b.dataset.reagir);
    if (!atual || !ck) return;
    const emoji = ck.reacoes?.[uid()] === b.dataset.emoji ? null : b.dataset.emoji;
    Store.reagir(atual.atleta, ck.id, uid(), emoji).then(() => {
      if (emoji) Store.avisar({ evento: 'reacao', atleta: atual.atleta, checkinId: ck.id });
    }, err => toast(mensagemErro(err)));
    return;
  }
  if (b.dataset.rapido) { enviarRecado(b.dataset.con, b.dataset.rapido); return; }

  if (b.dataset.marcar) {
    const id = b.dataset.marcar, data = isoDe(hoje());
    const feito = !(S.registros[data]?.feitos || []).includes(id);
    salvar(Store.marcarExercicio(uid(), data, id, feito));
    // Marcou direto: todas as séries contam como feitas; desmarcou: zera as séries
    const series = seriesFeitas(); series[id] = feito ? (exercicioDeHoje(id)?.series || 1) : 0; guardarSeries(series);
    const plano = S.plano[hoje().getDay()];
    const depois = new Set(S.registros[data]?.feitos || []); feito ? depois.add(id) : depois.delete(id);
    if (feito && plano && plano.exercicios.every(x => depois.has(x.id))) toast('Treino completo! Arrasou 💪');
    return;
  }
  if (b.dataset.remover) {
    const p = planoDoDia(S.diaSel);
    p.exercicios = p.exercicios.filter(x => x.id !== b.dataset.remover);
    salvar(Store.salvarDia(uid(), S.diaSel, p));
    return;
  }
  if (b.dataset.subir) {
    const i = +b.dataset.subir, p = planoDoDia(S.diaSel);
    [p.exercicios[i - 1], p.exercicios[i]] = [p.exercicios[i], p.exercicios[i - 1]];
    salvar(Store.salvarDia(uid(), S.diaSel, p));
    return;
  }

  const acao = b.dataset.acao;
  if (acao === 'abrir-checkin') {
    S.checkin = { aberto: true, foto: null, processando: false, enviando: false };
    if (S.sub.juntos === 'mural' && S.aba === 'juntos') render(); else irPara('mural');
    return;
  }
  if (acao === 'cancelar-checkin') { S.checkin.aberto = false; S.checkin.foto = null; render(); return; }
  if (acao === 'enviar-checkin') { enviarCheckin(); return; }
  if (acao === 'ativar-avisos') { ativarAvisos(); return; }
  if (acao === 'ja-confirmei') { jaConfirmei(false); return; }
  if (acao === 'reenviar-verificacao') {
    Store.reenviarVerificacao().then(() => toast('E-mail reenviado. Olhe também no spam.'), err => toast(mensagemErro(err)));
    return;
  }
  if (acao === 'dispensar-avisos') { try { localStorage.setItem('avisos-dispensado', '1'); } catch { /* ok */ } render(); return; }
  if (acao === 'sair') salvar(Store.sair());
  if (acao === 'copiar') {
    const c = S.perfil?.codigo;
    navigator.clipboard?.writeText(c).then(() => toast('Código copiado'), () => toast('Seu código: ' + c));
  }
  if (acao === 'esqueci') {
    const email = $('#lemail').value;
    if (!email) { mostrarErroLogin('Digite seu e-mail acima e toque de novo em "Esqueci minha senha".'); return; }
    Store.esqueciSenha(email).then(() => toast('Enviamos um e-mail para criar nova senha. Olhe também no spam.'),
      err => mostrarErroLogin(mensagemErro(err)));
  }
});

// Aplica um modelo: dias do modelo ganham o treino; os outros viram descanso
async function usarModelo(m) {
  if (!m) return;
  try {
    await Promise.all([0, 1, 2, 3, 4, 5, 6].map(d => {
      const atual = S.plano[d];
      if (m.dias[d]) {
        const [titulo, lista] = m.dias[d];
        return Store.salvarDia(uid(), d, { titulo, exercicios: lista.map(x => ({ ...x, id: novoId() })), desde: planoDoDia(d).desde });
      }
      return atual?.exercicios?.length ? Store.salvarDia(uid(), d, { titulo: '', exercicios: [] }) : null;
    }));
    toast(`Semana montada com o modelo "${m.nome}" 💪`);
    window.scrollTo(0, 0);
  } catch (err) { console.error(err); toast(mensagemErro(err)); }
}

async function enviarRecado(conexaoId, texto, mostrarToast = true) {
  try {
    await Store.enviarMensagem(conexaoId, uid(), texto);
    if (mostrarToast) toast('Recado enviado');
    Store.avisar({ evento: 'recado', conexaoId, texto });
  } catch (err) { console.error(err); toast(mensagemErro(err)); }
}

async function enviarCheckin() {
  const ck = S.checkin;
  if (ck.enviando || ck.processando) return;
  ck.enviando = true; render();
  const agora = new Date();
  try {
    const id = await Store.criarCheckin(uid(), {
      data: isoDe(agora), hora: `${pad(agora.getHours())}:${pad(agora.getMinutes())}`, legenda: $('#legendaIn')?.value.trim() || '',
    }, ck.foto);
    if (ck.foto) S.fotos[`${uid()}/${id}`] = ck.foto; // já mostra a foto sem baixar de novo
    Store.avisar({ evento: 'checkin', checkinId: id });
    S.checkin = { aberto: false, foto: null, processando: false, enviando: false };
    render();
    toast('Check-in feito! Quem te acompanha vai ver 💪');
  } catch (err) {
    console.error(err);
    ck.enviando = false; render();
    toast(mensagemErro(err));
  }
}

function mostrarErroLogin(texto) { const el = $('#loginErro'); if (el) { el.textContent = texto; el.hidden = false; } }

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'fotoIn' && t.files?.[0]) {
    S.checkin.processando = true; S.checkin.foto = null; render();
    prepararFoto(t.files[0]).then(foto => { S.checkin.foto = foto; }, err => toast(err.message))
      .finally(() => { S.checkin.processando = false; render(); });
    return;
  }
  if (t.dataset.carga) {
    const txt = t.value.trim();
    const kg = txt ? parseFloat(txt.replace(',', '.')) : null;
    if (txt && !(kg >= 0 && kg <= 500)) { toast('Digite a carga em kg, por exemplo 22,5.'); return; }
    salvar(Store.anotarCarga(uid(), isoDe(hoje()), t.dataset.carga, t.dataset.nome, kg), kg === null ? 'Carga apagada' : `Carga anotada: ${kgBR(kg)} kg`);
    return;
  }
  if (t.id === 'fotoAntesSel') { S.fotoAntes = t.value; render(); return; }
  if (t.id === 'fotoDepoisSel') { S.fotoDepois = t.value; render(); return; }
  if (t.id === 'fotoProgIn' && t.files?.[0]) {
    S.fotoProgEnviando = true; render();
    const data = isoDe(hoje());
    prepararFoto(t.files[0])
      .then(img => Store.salvarFotoProgresso(uid(), data, img).then(() => {
        S.fotosProg = [...(S.fotosProg || []).filter(f => f.data !== data), { data, img }].sort((a, b) => a.data.localeCompare(b.data));
        S.fotoDepois = data;
        toast('Foto salva. Só você vê 🔒');
      }))
      .catch(err => toast(mensagemErro(err)))
      .finally(() => { S.fotoProgEnviando = false; render(); });
    return;
  }
  if (t.id === 'horaLembrete') {
    salvar(Store.salvarPerfil(uid(), { horaLembrete: +t.value }), `Lembrete às ${pad(+t.value)}:00`);
    return;
  }
  if (t.dataset.aviso) {
    const avisos = { ...(S.perfil?.avisos || {}), [t.dataset.aviso]: t.checked };
    salvar(Store.salvarAvisos(uid(), avisos), t.checked ? 'Aviso ligado' : 'Aviso desligado');
    return;
  }
  if (t.dataset.perm) {
    const c = S.conexoes.find(x => x.id === t.dataset.con);
    if (!c) return;
    const perm = { treinos: false, checkins: false, peso: false, ...c.perm, [t.dataset.perm]: t.checked };
    salvar(Store.salvarPermissoes(c.id, perm), t.checked ? 'Liberado' : 'Não aparece mais para essa pessoa');
    return;
  }
  if (t.id === 'titulo') {
    const p = planoDoDia(S.diaSel); p.titulo = t.value.trim();
    salvar(Store.salvarDia(uid(), S.diaSel, p), 'Nome do treino salvo');
  }
  if (t.id === 'copiarPara' && t.value !== '') {
    const destino = +t.value, origem = planoDoDia(S.diaSel);
    // O dia de destino mantém o "desde" que já tinha; se era descanso, passa a valer a partir de hoje
    const copia = { titulo: origem.titulo, exercicios: origem.exercicios.map(x => ({ ...x, id: novoId() })), desde: planoDoDia(destino).desde };
    salvar(Store.salvarDia(uid(), destino, copia), `Treino copiado para ${DIAS_NOME[destino].toLowerCase()}`);
    t.value = '';
  }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;

  if (f.id === 'formLogin') {
    const criar = S.modoLogin === 'criar';
    const email = $('#lemail').value, senha = $('#lsenha').value, nome = $('#lnome')?.value.trim();
    if (criar && !nome) return mostrarErroLogin('Digite seu nome.');
    const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = criar ? 'Criando conta…' : 'Entrando…';
    cadastrando = criar;
    try {
      if (criar) await Store.criarConta(nome, email, senha); else await Store.entrar(email, senha);
    } catch (err) {
      cadastrando = false;
      if (S.user) { // a conta foi criada, só o perfil falhou: tenta de novo
        Store.criarPerfil(S.user.uid, nome || S.user.email.split('@')[0], S.user.email).catch(e => toast(mensagemErro(e)));
        return;
      }
      mostrarErroLogin(mensagemErro(err));
      btn.disabled = false; btn.textContent = criar ? 'Criar conta' : 'Entrar';
    }
    cadastrando = false;
  }

  if (f.id === 'formEx') {
    const nome = $('#exnome').value.trim();
    if (!nome) return;
    const p = planoDoDia(S.diaSel);
    if (!p.titulo) p.titulo = $('#titulo').value.trim();
    p.exercicios.push({
      id: novoId(), nome: nome.slice(0, 60),
      series: Math.min(20, Math.max(1, parseInt($('#exseries').value, 10) || 1)),
      reps: $('#exreps').value.trim().slice(0, 12), carga: $('#excarga').value.trim().slice(0, 16),
      descanso: parseInt($('#exdescanso').value, 10) || 60,
    });
    $('#exnome').value = ''; $('#excarga').value = '';
    await salvar(Store.salvarDia(uid(), S.diaSel, p), 'Exercício adicionado');
    $('#exnome')?.focus();
  }

  if (f.dataset.editarForm) {
    const p = planoDoDia(S.diaSel);
    const e = p.exercicios.find(x => x.id === f.dataset.editarForm);
    const nome = $('#edNome').value.trim();
    if (!e || !nome) return toast('Digite o nome do exercício.');
    Object.assign(e, {
      nome: nome.slice(0, 60),
      series: Math.min(20, Math.max(1, parseInt($('#edSeries').value, 10) || 1)),
      reps: $('#edReps').value.trim().slice(0, 12),
      carga: $('#edCarga').value.trim().slice(0, 16),
      descanso: parseInt($('#edDescanso').value, 10) || 60,
    });
    S.editandoEx = null;
    await salvar(Store.salvarDia(uid(), S.diaSel, p), 'Exercício atualizado');
    return;
  }

  if (f.dataset.metaCasal) {
    const id = f.dataset.metaCasal;
    const treinos = parseInt(document.getElementById(`metaTreinos-${id}`).value, 10);
    const recompensa = document.getElementById(`metaRecompensa-${id}`).value.trim().slice(0, 60);
    if (!(treinos >= 1 && treinos <= 31)) return toast('Escolha de 1 a 31 treinos no mês.');
    const c = S.conexoes.find(x => x.id === id);
    // Se ela já fez mais treinos do que a nova meta, conta como batida (sem aviso repetido)
    const feitos = c?.atleta === uid() ? treinosNoMes(S.registros, S.checkins) : null;
    const batida = c?.meta?.mes === mesAtual() && c.meta.batida && treinos <= (c.meta.treinos || 0);
    S.editandoMeta = null;
    await salvar(Store.salvarMetaCasal(id, { mes: mesAtual(), treinos, recompensa, batida: !!batida }), 'Meta combinada 🤝');
    if (feitos !== null) verificarMetas();
    return;
  }

  if (f.id === 'formMedida') {
    const data = $('#medData').value;
    const medidas = {};
    for (const [k, nome] of MEDIDAS) {
      const txt = $(`#med-${k}`).value.trim();
      if (!txt) continue;
      const v = parseFloat(txt.replace(',', '.'));
      if (!Number.isFinite(v) || v < 10 || v > 250) return toast(`${nome}: digite em centímetros, por exemplo 82,5.`);
      medidas[k] = v;
    }
    if (!Object.keys(medidas).length) return toast('Preencha pelo menos uma medida.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > isoDe(hoje())) return toast('Escolha um dia até hoje.');
    // Mesmo dia: junta com o que já tinha (ex.: mediu a cintura de manhã e o quadril depois)
    const antes = S.medidas.find(m => m.data === data) || {};
    const juntas = {};
    for (const [k] of MEDIDAS) { const v = medidas[k] ?? antes[k]; if (Number.isFinite(v)) juntas[k] = v; }
    MEDIDAS.forEach(([k]) => { $(`#med-${k}`).value = ''; });
    delete S.dica['medida-' + S.medidaSel];
    await salvar(Store.salvarMedida(uid(), data, juntas), `Medidas de ${dataCurta(data)} registradas`);
    return;
  }

  if (f.id === 'formPeso') {
    const kg = parseFloat(String($('#pesoKg').value).replace(',', '.'));
    const data = $('#pesoData').value;
    if (!Number.isFinite(kg) || kg < 20 || kg > 300) return toast('Digite o peso em kg, por exemplo 72,5.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > isoDe(hoje())) return toast('Escolha um dia até hoje.');
    $('#pesoKg').value = '';
    delete S.dica.meuPeso; // o gráfico volta a destacar o registro mais novo
    await salvar(Store.salvarPeso(uid(), data, kg), `Peso de ${dataCurta(data)} registrado`);
    return;
  }

  if (f.dataset.recado) {
    const input = document.getElementById(`recadoIn-${f.dataset.recado}`);
    const texto = input?.value.trim();
    if (!texto) return;
    input.value = '';
    await enviarRecado(f.dataset.recado, texto, false);
    return;
  }

  if (f.id === 'formConexao') {
    $('#conexaoBtn').disabled = true; $('#conexaoErro').hidden = true;
    try {
      await Store.pedirConexao(uid(), S.perfil?.nome || '', $('#codigoIn').value);
      if ($('#codigoIn')) $('#codigoIn').value = '';
      toast('Pedido enviado. Agora é só a pessoa aceitar.');
    } catch (err) {
      const el = $('#conexaoErro'); // a tela pode ter sido redesenhada enquanto esperava
      if (el) { el.textContent = mensagemErro(err); el.hidden = false; }
    }
    if ($('#conexaoBtn')) $('#conexaoBtn').disabled = false;
    return;
  }

  if (f.id === 'formPerfil') {
    const nome = $('#pnome').value.trim();
    const meta = parseFloat($('#pmeta').value.replace(',', '.'));
    let altura = parseFloat($('#paltura').value.replace(',', '.'));
    if (altura > 0 && altura < 3) altura *= 100; // digitou em metros (1,65)
    altura = Number.isFinite(altura) ? Math.round(altura) : null;
    if (!nome) return toast('Digite seu nome.');
    if (Number.isFinite(meta) && (meta < 30 || meta > 250)) return toast('A meta precisa estar entre 30 e 250 kg.');
    if (altura !== null && (altura < 100 || altura > 230)) return toast('Digite a altura em centímetros, por exemplo 165.');
    try {
      await Store.salvarPerfil(uid(), { nome: nome.slice(0, 40), metaPeso: Number.isFinite(meta) ? meta : null, alturaCm: altura });
      // Quem acompanha precisa da altura para ver o IMC
      await Store.copiarAlturaParaConexoes(meusAcompanhantes().map(c => c.id), altura);
      // Quem me acompanha (e quem eu acompanho) passa a ver o nome novo
      const desatualizadas = S.conexoes.filter(c => (c.atleta === uid() ? c.atletaNome : c.viewerNome) !== nome.slice(0, 40)
        && (c.atleta === uid() ? c.status === 'aceita' : true));
      await Store.atualizarNomeNasConexoes(uid(), desatualizadas, nome.slice(0, 40));
      toast('Dados salvos');
    } catch (err) { console.error(err); toast(mensagemErro(err)); }
  }
});

// ---------- Abrir na tela certa (ex.: tocar no aviso de recado abre os Recados) ----------
function rotaDoEndereco(endereco) {
  const nome = String(endereco || '').split('#')[1];
  return nome && ROTAS[nome] ? nome : null;
}
navigator.serviceWorker?.addEventListener('message', e => {
  const nome = rotaDoEndereco(e.data?.abrir);
  if (nome && S.user) irPara(nome);
});
window.addEventListener('hashchange', () => {
  const nome = rotaDoEndereco(location.hash);
  if (nome && S.user && S.sub[S.aba] !== nome && S.aba !== nome) irPara(nome);
});

// ---------- App instalável e offline ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(console.warn));
}

render();
