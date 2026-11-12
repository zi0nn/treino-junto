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
  aba: 'hoje',
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

// ---------- Ícones ----------
const ICONE = {
  hoje: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg>',
  semana: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  perfil: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  acompanhar: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  progresso: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
};
const ABAS = [['hoje', 'Hoje'], ['semana', 'Semana'], ['progresso', 'Progresso'], ['acompanhar', 'Acompanhar'], ['perfil', 'Perfil']];

function mostrarNav(visivel) {
  $('#nav').hidden = !visivel;
  const pedidos = pedidosRecebidos().length;
  if (visivel) $('#navin').innerHTML = ABAS.map(([k, l]) => `<button class="${S.aba === k ? 'on' : ''}" data-aba="${k}">${ICONE[k]}${l}${k === 'perfil' && pedidos ? ` <span class="badge">${pedidos}</span>` : ''}</button>`).join('');
}

// ---------- Conexões ----------
const meuUid = () => S.user?.uid;
const pedidosRecebidos = () => S.conexoes.filter(c => c.atleta === meuUid() && c.status === 'pendente');
const meusAcompanhantes = () => S.conexoes.filter(c => c.atleta === meuUid() && c.status === 'aceita');
const quemAcompanho = () => S.conexoes.filter(c => c.viewer === meuUid());
const nomeDe = (c, lado) => (lado === 'atleta' ? c.atletaNome : c.viewerNome) || 'Alguém';

// ---------- Regras do dia ----------
// Treinou = marcou algum exercício OU fez check-in naquele dia
function statusDia(d, planoSemana = S.plano, registros = S.registros, checkins = S.checkins) {
  const data = isoDe(d);
  const plano = planoSemana[d.getDay()];
  const temTreino = plano && plano.exercicios?.length;
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
    planejados: semana.filter(d => planoSemana[d.getDay()]?.exercicios?.length).length,
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

function cabecalho() {
  const d = hoje();
  const nome = S.perfil?.nome || S.user?.nome || '';
  return `<div class="top"><div class="grow"><span class="label">${DIAS_NOME[d.getDay()]}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
    <h1>Oi, ${esc(nome.split(' ')[0])}</h1></div></div>`;
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
        <div class="grow"><div class="ex-nome">${esc(e.nome)}</div><div class="small muted tabular">${descricaoEx(e)}</div></div></div>`;
    }).join('')}</div></div>`;
}
const descricaoEx = e => [e.series && `${e.series} × ${esc(e.reps || '—')}`, e.carga && esc(e.carga)].filter(Boolean).join(' · ');

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
  const pill = !total ? '<span class="pill ok">Descanso</span>'
    : feitos >= total ? '<span class="pill ok">Treino completo</span>'
    : feitos ? '<span class="pill wait">Em andamento</span>'
    : fezCheckin ? '<span class="pill ok">Na academia</span>' : '<span class="pill wait">Ainda não começou</span>';
  const pedidos = pedidosRecebidos();
  return `${cabecalho()}
  ${pedidos.length ? `<section class="block"><div class="card stack aviso">
    <h3>${pedidos.length === 1 ? `${esc(nomeDe(pedidos[0], 'viewer'))} quer te acompanhar` : `${pedidos.length} pessoas querem te acompanhar`}</h3>
    <button class="btn sm" data-aba="perfil">Ver pedido</button></div></section>` : ''}
  ${secaoCheckinHoje()}
  ${convitAvisos()}
  ${meusAcompanhantes().map(c => cartaoMetaCasal(c, 'atleta', treinosNoMes(S.registros, S.checkins))).join('')}
  ${meusAcompanhantes().map(c => secaoRecados(c, nomeDe(c, 'viewer'), 3, ['Valeu! ❤️', 'Tô indo!', 'Hoje não deu 😕'])).join('')}
  <section class="block">
    <div class="grid3">
      <div class="stat"><span class="label">Semana</span><b class="tabular">${r.feitos}</b><span class="small muted">${r.planejados ? `de ${r.planejados} treinos` : (r.feitos === 1 ? 'treino' : 'treinos')}</span></div>
      <div class="stat"><span class="label">Hoje</span><b class="tabular">${feitos}/${total}</b><span class="small muted">exercícios</span></div>
      <div class="stat"><span class="label">Meta</span><b class="tabular">${S.perfil?.metaPeso ?? '—'}</b><span class="small muted">kg</span></div>
    </div>
  </section>
  <section class="block">
    <div class="row between"><span class="label">Treino de hoje</span>${pill}</div>
    ${cartaoTreino(d.getDay(), isoDe(d))}
  </section>
  ${Object.keys(S.plano).length ? '' : `<section class="block"><div class="card stack"><h3>Comece montando sua semana</h3>
    <p class="muted small">Na aba Semana você escolhe os exercícios de cada dia. Depois é só marcar aqui o que já fez.</p>
    <button class="btn" data-aba="semana">Montar minha semana</button></div></section>`}`;
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
    <div class="card">${plano.exercicios.length ? plano.exercicios.map((e, i) => `<div class="ex">
        <div class="grow"><div class="ex-nome">${esc(e.nome)}</div><div class="small muted tabular">${descricaoEx(e)}</div></div>
        <button class="icone" data-subir="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir ${esc(e.nome)}">↑</button>
        <button class="icone" data-remover="${e.id}" aria-label="Remover ${esc(e.nome)}">×</button></div>`).join('')
      : '<p class="muted small">Nenhum exercício. Sem exercícios, o dia conta como descanso.</p>'}</div>
  </section>
  <section class="block"><span class="label">Adicionar exercício</span>
    <form id="formEx" class="stack">
      <div class="field"><label class="label" for="exnome">Exercício</label>
        <input id="exnome" list="sugestoes" placeholder="Ex.: Supino reto" required maxlength="60">
        <datalist id="sugestoes">${SUGESTOES.map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist></div>
      <div class="grid3">
        <div class="field"><label class="label" for="exseries">Séries</label><input id="exseries" type="number" inputmode="numeric" min="1" max="20" value="3"></div>
        <div class="field"><label class="label" for="exreps">Reps</label><input id="exreps" value="12" maxlength="12"></div>
        <div class="field"><label class="label" for="excarga">Carga</label><input id="excarga" placeholder="20 kg" maxlength="16"></div>
      </div>
      <button class="btn" type="submit">Adicionar em ${DIAS_NOME[dia].toLowerCase()}</button>
    </form>
    ${plano.exercicios.length ? `<div class="row"><span class="small muted grow">Copiar este treino para outro dia:</span>
      <select id="copiarPara" class="input" style="width:auto"><option value="">Escolher dia</option>${[1, 2, 3, 4, 5, 6, 0].filter(x => x !== dia).map(x => `<option value="${x}">${DIAS_NOME[x]}</option>`).join('')}</select></div>` : ''}
  </section>`;
}

function telaPerfil() {
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
    </div>`).join('') : '<p class="small muted">Ninguém ainda. Passe o código abaixo para quem vai te incentivar.</p>'}
  </section>
  ${secaoAvisos()}
  <section class="block"><span class="label">Seu código de conexão</span>
    <div class="card stack"><div class="code">${esc(p.codigo || '—')}</div>
      <p class="small muted">A pessoa digita esse código na aba Acompanhar. Você recebe o pedido aqui e decide se aceita.</p>
      <button class="btn sm ghost" data-acao="copiar">Copiar código</button></div>
  </section>
  <section class="block"><button class="btn ghost" data-acao="sair">Sair da conta</button></section>`;
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
      if (planoSemana[d.getDay()]?.exercicios?.length) planejados++;
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
  const bloqueadas = mostrarBloqueadas ? CONQUISTAS.filter(q => !lista.includes(q)) : [];
  if (!lista.length && !bloqueadas.length) return '<p class="small muted">Nenhuma conquista ainda.</p>';
  return `<div class="selos">${lista.map(q => `<div class="selo"><span class="selo-icone">${q.icone}</span><b>${esc(q.nome)}</b>
      <span class="small muted">${guardadas?.[q.id] ? dataCurta(guardadas[q.id]) : esc(q.desc)}</span></div>`).join('')}
    ${bloqueadas.map(q => `<div class="selo bloqueado"><span class="selo-icone">${q.icone}</span><b>${esc(q.nome)}</b><span class="small muted">${esc(q.desc)}</span></div>`).join('')}</div>`;
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
  const pct = feitos === null ? 0 : Math.min(100, Math.round(100 * feitos / meta.treinos));
  const batida = feitos !== null && feitos >= meta.treinos;
  return `<section class="block"><div class="row between"><span class="label">Meta do casal · ${nomeMes(mes)}</span>
      <button class="link" data-editar-meta="${c.id}">Editar</button></div>
    <div class="card stack ${batida ? 'aviso' : ''}">
      <div class="row between"><h3 class="grow">${meta.treinos} treinos</h3>${feitos === null ? '' : `<span class="small tabular">${feitos}/${meta.treinos}</span>`}</div>
      ${feitos === null ? `<p class="small muted">Para ver o progresso, ${esc(outro)} precisa liberar ver treinos ou check-ins.</p>` : `<div class="bar"><i style="width:${pct}%"></i></div>`}
      <p class="small">🎁 ${esc(meta.recompensa || 'Recompensa a combinar')}</p>
      ${batida ? `<p><b>Meta batida! 🎉</b> ${lado === 'atleta' ? `Hora de cobrar de ${esc(outro)}.` : 'Hora de cumprir a recompensa.'}</p>`
        : feitos !== null ? `<p class="small muted">Faltam ${meta.treinos - feitos} ${meta.treinos - feitos === 1 ? 'treino' : 'treinos'}.</p>` : ''}
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
      <button class="btn sm ghost" data-aba="perfil">Colocar altura</button></div>` : '';
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

function telaProgresso() {
  const meta = S.perfil?.metaPeso || null;
  const semanas = semanasFrequencia(S.plano, S.registros, S.checkins);
  const media = semanas.length ? semanas.reduce((a, s) => a + s.feitos, 0) / semanas.length : 0;
  const recentes = S.pesos.slice(-5).reverse();
  const ctx = contextoConquistas(S.plano, S.registros, S.checkins, S.pesos, S.perfil?.alturaCm);
  const qtd = CONQUISTAS.filter(q => S.perfil?.conquistas?.[q.id] || q.ok(ctx)).length;
  return `${cabecalho()}
  <section class="block"><span class="label">Sequência</span>${cartaoSequencia(ctx)}</section>
  <section class="block"><div class="row between"><span class="label">Conquistas</span><span class="small muted tabular">${qtd} de ${CONQUISTAS.length}</span></div>
    ${gradeConquistas(ctx, S.perfil?.conquistas, true)}</section>
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
    <p class="small muted">Quem te acompanha só vê seu peso e IMC se você ligar "Ver meu peso" no Perfil.</p>
  </section>
  ${secaoMedidas()}
  <section class="block"><div class="row between"><span class="label">Treinos por semana</span>
    ${semanas.length ? `<span class="small muted tabular">média ${media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por semana</span>` : ''}</div>
    <div class="card">${graficoFrequencia('minhaFreq', semanas)}</div>
  </section>`;
}

function formConectar() {
  return `<form id="formConexao" class="stack">
    <div class="field"><label class="label" for="codigoIn">Código da pessoa</label>
      <input id="codigoIn" placeholder="FIT-AB12" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="10" required></div>
    <p class="erro" id="conexaoErro" hidden></p>
    <button class="btn" type="submit" id="conexaoBtn">Pedir para acompanhar</button>
  </form>`;
}

function telaAcompanhar() {
  const lista = quemAcompanho();
  const aceitas = lista.filter(c => c.status === 'aceita');
  const pendentes = lista.filter(c => c.status === 'pendente');
  const atual = aceitas.find(c => c.id === S.acompId) || aceitas[0];
  const aguardando = pendentes.map(c => `<div class="card row between"><div class="grow"><h3>Código ${esc(c.codigo)}</h3>
    <p class="small muted">Esperando a pessoa aceitar</p></div><button class="btn sm ghost" data-remover-con="${c.id}">${S.confirmar === c.id ? 'Confirmar' : 'Cancelar'}</button></div>`).join('');

  if (!atual) {
    return `<div class="top"><div class="grow"><span class="label">Acompanhar</span><h1>Treine junto</h1></div></div>
    <section class="block"><p class="muted">Digite o código de quem você quer incentivar. Ele aparece na aba Perfil da pessoa.</p>${formConectar()}</section>
    ${aguardando ? `<section class="block"><span class="label">Pedidos enviados</span>${aguardando}</section>` : ''}`;
  }

  const nome = nomeDe(atual, 'atleta');
  const A = S.acomp && S.acomp.chave === chaveAcomp(atual) ? S.acomp : null;
  const semana = semanaAtual();
  const hojeIso = isoDe(hoje());
  const verCheckins = atual.perm?.checkins && A && !A.bloqCheckins;
  const checkins = verCheckins ? A.checkins : [];

  // Check-ins: o de hoje com reações, ou o último que ela fez
  let secaoCheckins = '';
  if (!atual.perm?.checkins || A?.bloqCheckins) {
    secaoCheckins = `<section class="block"><div class="card stack"><h3>Check-ins privados</h3>
      <p class="small muted">${esc(nome)} ainda não liberou ver os check-ins e fotos.</p></div></section>`;
  } else if (!A?.temCheckins) {
    secaoCheckins = '<section class="block"><p class="muted">Carregando check-ins…</p></section>';
  } else {
    const deHoje = checkins.filter(c => c.data === hojeIso);
    secaoCheckins = deHoje.length
      ? `<section class="block"><span class="label">Check-in de hoje</span>${deHoje.map(c => cartaoCheckin(atual.atleta, c, true)).join('')}</section>`
      : `<section class="block"><span class="label">Check-in de hoje</span><div class="card stack"><h3>Ainda não fez check-in hoje</h3>
          <p class="small muted">Que tal mandar um recado de incentivo aí embaixo?</p></div>
          ${checkins[0] ? `<span class="label">Último check-in</span>${cartaoCheckin(atual.atleta, checkins[0], true)}` : ''}</section>`;
  }

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

  return `<div class="top"><div class="grow"><span class="label">Acompanhando</span><h1>${esc(nome)}</h1></div></div>
  ${aceitas.length > 1 ? `<div class="chips">${aceitas.map(c => `<button class="chip ${c.id === atual.id ? 'on' : ''}" data-acomp="${c.id}">${esc(nomeDe(c, 'atleta'))}</button>`).join('')}</div>` : ''}
  ${secaoCheckins}
  ${cartaoMetaCasal(atual, 'viewer', atual.perm?.treinos || atual.perm?.checkins
      ? treinosNoMes(A?.registros || {}, checkins) : null, nome)}
  ${secaoRecados(atual, nome, 10, ['Bora treinar! 💪', 'Tô orgulhoso de você', 'Só 1 hora e tá feito', 'Arrasou hoje!'])}
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
      : `${resumoPesoAcomp(A.pesos)}${cartaoImc(A.pesos, atual.alturaCm, false, null)}<div class="card">${graficoPeso('pesoAcomp', A.pesos, null)}</div>`}</section>` : ''}
  <section class="block"><span class="label">Acompanhar outra pessoa</span>${formConectar()}</section>
  ${aguardando ? `<section class="block"><span class="label">Pedidos enviados</span>${aguardando}</section>` : ''}
  <section class="block"><button class="btn ghost" data-remover-con="${atual.id}">${S.confirmar === atual.id ? `Tocar de novo para parar de acompanhar ${esc(nome)}` : `Parar de acompanhar ${esc(nome)}`}</button></section>`;
}

function render() {
  if (!Store.configurado) return telaSemConfig();
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
  app.innerHTML = S.aba === 'semana' ? telaSemana() : S.aba === 'perfil' ? telaPerfil()
    : S.aba === 'acompanhar' ? telaAcompanhar() : S.aba === 'progresso' ? telaProgresso() : telaHoje();
  for (const [id, valor] of Object.entries(rascunho)) {
    const el = document.getElementById(id);
    if (el) el.value = valor;
  }
  if (foco) document.getElementById(foco)?.focus();
}

function irPara(aba) {
  S.aba = aba;
  app.innerHTML = ''; // troca de aba começa limpa, sem levar o rascunho da outra
  render();
  window.scrollTo(0, 0);
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
      S.perfil = perfil; render(); verificarConquistas();
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
function aposMudanca() { render(); verificarConquistas(); verificarMetas(); }

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
    S.conexoes = []; S.acomp = null; S.acompId = null; S.confirmar = null;
    S.checkin = { aberto: false, foto: null, processando: false, enviando: false };
    pararDeAcompanhar(); pararMensagens();
    if (user) comecarEscutas(user); else { pararEscutas.forEach(f => f()); pararEscutas = []; }
    // Mantém o registro do aparelho atualizado (o código do aparelho pode mudar com o tempo)
    if (user && Store.avisosConfigurados && permissao() === 'granted') Store.registrarAparelho(user.uid).catch(console.warn);
    S.aba = abaDoEndereco(location.hash) || 'hoje';
    app.innerHTML = '';
    render();
  });
}

// ---------- Ações ----------
const uid = () => S.user.uid;
const planoDoDia = dia => structuredClone(S.plano[dia] || { titulo: '', exercicios: [] });

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
  if (acao === 'abrir-checkin') { S.checkin = { aberto: true, foto: null, processando: false, enviando: false }; render(); return; }
  if (acao === 'cancelar-checkin') { S.checkin.aberto = false; S.checkin.foto = null; render(); return; }
  if (acao === 'enviar-checkin') { enviarCheckin(); return; }
  if (acao === 'ativar-avisos') { ativarAvisos(); return; }
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
    const copia = { titulo: origem.titulo, exercicios: origem.exercicios.map(x => ({ ...x, id: novoId() })) };
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
    });
    $('#exnome').value = ''; $('#excarga').value = '';
    await salvar(Store.salvarDia(uid(), S.diaSel, p), 'Exercício adicionado');
    $('#exnome')?.focus();
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
      toast('Dados salvos');
    } catch (err) { console.error(err); toast(mensagemErro(err)); }
  }
});

// ---------- Abrir na aba certa (ex.: tocar no aviso "fez check-in" abre o Acompanhar) ----------
function abaDoEndereco(endereco) {
  const aba = String(endereco || '').split('#')[1];
  return ABAS.some(([k]) => k === aba) ? aba : null;
}
navigator.serviceWorker?.addEventListener('message', e => {
  const aba = abaDoEndereco(e.data?.abrir);
  if (aba && S.user) irPara(aba);
});

// ---------- App instalável e offline ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(console.warn));
}

render();
