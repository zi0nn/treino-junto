/* =========================================================
   Treino Junto · app.js (começa aqui)
   Primeiro acesso, confirmação de e-mail, desenhar a tela (render),
   login e escutas do banco, e o que cada botão e formulário faz.

   As telas ficam em js/: base, treino, perfil, progresso e juntos.
   Os dados (Firebase) ficam em store.js.
   ========================================================= */
import * as Store from './store.js';
import { $, DATA_MIN, DIAS_NOME, ROTAS, S, app, esc, hoje, isoDe, mensagemErro, meusAcompanhantes, mostrarNav, novoId, numero, pad, quemAcompanho, toast } from './js/base.js';
import { TELAS } from './js/juntos.js';
import { ativarAvisos, escolherTema, estadoAvisos, permissao, temaAtual } from './js/perfil.js';
import { MEDIDAS, alturaBR, calcImc, dataCurta, faixaImc, faixaSaudavel, kgBR, mesAtual, treinosNoMes, verificarConquistas, verificarMetas } from './js/progresso.js';
import { MODELOS, ajustarDescanso, exercicioDeHoje, guardarSeries, iniciarDescanso, marcarSerie, pararDescanso, prepararFoto, salvarDescansoPadrao, seriesFeitas, telaLogin, telaSemConfig, entrarModoTreino, sairModoTreino, telaModoTreino } from './js/treino.js';

// ---------- Primeiro acesso guiado ----------
export const temAlgumTreino = () => Object.values(S.plano).some(p => p?.exercicios?.length);
// Continua no passo a passo enquanto ele estiver aberto (o modelo escolhido no passo 2 já cria treinos)
export const precisaBoasVindas = () => S.perfil && !S.perfil.boasVindas
  && (S.bv?.passo > 1 || (S.carregado.plano && !temAlgumTreino()));

// Quem já usava o app antes do primeiro acesso guiado não precisa passar por ele
export let boasVindasMigrado = false;
export function migrarBoasVindas() {
  if (S.bv || boasVindasMigrado || !S.perfil || S.perfil.boasVindas || !S.carregado.plano || !temAlgumTreino()) return;
  boasVindasMigrado = true;
  Store.salvarPerfil(uid(), { boasVindas: isoDe(hoje()) }).catch(console.warn);
}

export function telaBoasVindas() {
  mostrarNav(false);
  const passo = S.bv?.passo || 1;
  const p = S.perfil || {};
  const barra = `<div class="passos" aria-label="Passo ${passo} de 3">${[1, 2, 3].map(n => `<i class="${n <= passo ? 'on' : ''}"></i>`).join('')}</div>`;
  let corpo;
  if (passo === 1) {
    corpo = `<h1>Bem-vinda(o), ${esc((p.nome || '').split(' ')[0])}! 👋</h1>
      <p class="muted">Três passos rápidos e você já sai com a semana montada. Pode pular o que quiser.</p>
      <form id="formBv1" class="card stack">
        <div class="field"><label class="label" for="bvNome">Como quer ser chamada(o)?</label><input id="bvNome" maxlength="40" value="${esc(p.nome)}"></div>
        <div class="grid3" style="grid-template-columns:1fr 1fr">
          <div class="field"><label class="label" for="bvAltura">Altura (cm)</label><input id="bvAltura" inputmode="numeric" maxlength="4" placeholder="165" value="${p.alturaCm ?? ''}"></div>
          <div class="field"><label class="label" for="bvPeso">Peso atual (kg)</label><input id="bvPeso" inputmode="decimal" maxlength="6" placeholder="72,5" value="${S.pesos.at(-1) ? kgBR(S.pesos.at(-1).kg) : ''}"></div>
        </div>
        <p class="small muted">Com a altura e o peso o app calcula o seu IMC e mostra a faixa de peso saudável para você. A meta dá para definir depois, com essa ajuda.</p>
        <button class="btn" type="submit">Continuar</button>
      </form>`;
  } else if (passo === 2) {
    const sel = S.bv.modelo ?? 'sozinho';
    corpo = `${pontoDePartida(p)}<h1>Como quer treinar?</h1>
      <p class="muted">Escolha um modelo para começar. Dá para editar qualquer exercício depois, em Treino › Semana.</p>
      <div class="stack">
        ${MODELOS.map(m => `<button class="card modelo-opcao ${sel === m.id ? 'on' : ''}" data-bv-modelo="${m.id}" aria-pressed="${sel === m.id}">
          <h3>${esc(m.nome)}</h3><p class="small muted">${esc(m.desc)}</p></button>`).join('')}
        <button class="card modelo-opcao ${sel === 'sozinho' ? 'on' : ''}" data-bv-modelo="sozinho" aria-pressed="${sel === 'sozinho'}">
          <h3>Vou montar sozinha(o)</h3><p class="small muted">Já tenho uma ficha da academia e vou passar para o app.</p></button>
        <button class="btn" data-acao="bv-2">Continuar</button>
      </div>`;
  } else {
    const e = estadoAvisos();
    corpo = `<h1>Treine junto 🤝</h1>
      <p class="muted">O app fica melhor com alguém do lado: a pessoa vê seus check-ins, reage e manda força. Você escolhe o que ela pode ver.</p>
      <div class="card stack"><span class="label">Seu código</span><div class="code">${esc(p.codigo || '—')}</div>
        <p class="small muted">Passe esse código para quem vai te incentivar. Ou, se você quer acompanhar alguém, peça o código dessa pessoa e digite em Perfil › Conexões.</p>
        <button class="btn sm ghost" data-acao="copiar">Copiar código</button></div>
      ${e.pode && !e.ativo ? '<button class="btn ghost" data-acao="ativar-avisos">🔔 Ativar avisos no celular</button>' : ''}
      <button class="btn" data-acao="bv-fim">Começar a treinar</button>`;
  }
  app.innerHTML = `<div class="stack boas-vindas">${barra}${corpo}
    ${passo < 3 ? '<button class="link" data-acao="bv-pular">Pular e ir direto para o app</button>' : ''}</div>`;
}

export // Resultado do passo 1: IMC e faixa saudável com o peso e a altura que a pessoa acabou de informar
function pontoDePartida(p) {
  const kg = S.pesos.at(-1)?.kg;
  if (!kg || !p.alturaCm) return '';
  const imc = calcImc(kg, p.alturaCm), faixa = faixaImc(imc);
  const [min, max] = faixaSaudavel(p.alturaCm);
  const conta = kg > max ? `Para chegar à faixa saudável, faltam <b class="tabular">${kgBR(kg - max)} kg</b>. O app acompanha esse caminho com você.`
    : kg < min ? 'Você está abaixo da faixa saudável: vale conversar com um nutricionista antes de pensar em perder peso.'
    : 'Você já está na faixa saudável. O foco agora pode ser força e condicionamento 💪';
  return `<div class="card stack aviso">
    <span class="label">Seu ponto de partida</span>
    <div class="row between"><div><span class="small muted">IMC</span><div class="imc tabular">${imc.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div></div>
      <span class="pill ${faixa.cor}">${faixa.nome}</span></div>
    <p class="small">Faixa saudável para ${alturaBR(p.alturaCm)} m: <b class="tabular">${kgBR(min)} a ${kgBR(max)} kg</b>. ${conta}</p>
  </div>`;
}

// Gera um arquivo .json com todos os dados da pessoa e baixa no aparelho
async function baixarMeusDados() {
  toast('Juntando seus dados…');
  try {
    const dados = await Store.exportarDados(uid());
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `treino-junto-meus-dados-${isoDe(hoje())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Arquivo baixado: treino-junto-meus-dados.json');
  } catch (err) { console.error(err); toast(mensagemErro(err)); }
}

async function concluirBoasVindas() {
  try { await Store.salvarPerfil(uid(), { boasVindas: isoDe(hoje()) }); } catch (err) { toast(mensagemErro(err)); return; }
  S.bv = null;
  irPara('hoje');
}

// Conta criada, mas o e-mail ainda não foi confirmado
export function telaVerificar() {
  mostrarNav(false);
  const envio = Store.ultimoEnvio();
  const quando = envio ? new Date(envio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;
  app.innerHTML = `<div class="hero"><span class="label">Falta um passo</span><h1>Confirme seu e-mail</h1>
    <p class="muted">Para usar o app, confirme que o e-mail <b>${esc(S.user.email)}</b> é seu: abra o link que enviamos para ele e volte aqui.</p>
    ${quando ? `<p class="small">📨 Último envio às <b>${quando}</b>. Pode levar alguns minutos para chegar.</p>` : ''}</div>
  <div class="stack">
    <button class="btn" data-acao="ja-confirmei">Já confirmei</button>
    <button class="btn ghost" data-acao="reenviar-verificacao" id="reenviarBtn">Enviar o link de novo</button>
    <div class="card stack">
      <b>Não chegou?</b>
      <ul class="lista small">
        <li>Procure na caixa de <b>spam</b>, em <b>Promoções</b> e em <b>Lixeira</b>.</li>
        <li>Pesquise no e-mail por <b>firebaseapp.com</b> ou <b>Treino Junto</b>.</li>
        <li>Confira se o endereço acima está certo. Se tiver erro, toque em "Errei o e-mail" e crie de novo.</li>
        <li>Hotmail e Outlook às vezes seguram o e-mail por alguns minutos.</li>
        <li>Mais fácil: saia e use <b>Entrar com Google</b>, que já vem confirmado.</li>
      </ul>
    </div>
    <p class="erro" id="verificarErro" hidden></p>
    <button class="link" data-acao="sair">Errei o e-mail · usar outra conta</button>
  </div>`;
}

export async function jaConfirmei(silencioso) {
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
// Voltou para o app:
// - confere sozinho se o e-mail foi confirmado (veio do aplicativo de e-mail)
// - no modo treino, pede de novo para a tela não apagar (o celular solta isso ao sair do app)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (S.user && !S.user.verificado) jaConfirmei(true);
  if (S.modo) navigator.wakeLock?.request('screen').then(w => { if (S.modo) S.modo.wake = w; }, () => {});
});

export function render() {
  if (!Store.configurado) return telaSemConfig();
  if (S.user && !S.user.verificado) return telaVerificar();
  if (S.user === undefined || (S.user && S.perfil === undefined)) {
    mostrarNav(false);
    app.innerHTML = '<p class="muted carregando">Carregando…</p>';
    return;
  }
  if (!S.user) return telaLogin();
  // Modo "treinando agora": tela cheia, sem a barra de abas
  if (S.modo) { telaModoTreino(); return; }
  if (precisaBoasVindas()) {
    // Mantém o que estava sendo digitado no primeiro acesso
    const r = {}; app.querySelectorAll('input[id]').forEach(i => { r[i.id] = i.value; });
    telaBoasVindas();
    Object.entries(r).forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.value = v; });
    return;
  }
  mostrarNav(true);
  // Mantém o que estava sendo digitado quando os dados mudam no banco
  const foco = document.activeElement?.id;
  const rascunho = {};
  app.querySelectorAll('input[id]:not([type=file]):not([type=checkbox]), textarea[id]').forEach(i => { rascunho[i.id] = i.value; });
  app.innerHTML = TELAS[S.aba][S.sub[S.aba]]();
  for (const [id, valor] of Object.entries(rascunho)) {
    const el = document.getElementById(id);
    if (el) el.value = valor;
  }
  if (foco) document.getElementById(foco)?.focus();
}

// nome = aba ('treino') ou subaba ('semana'); aba sozinha volta para a última subaba usada nela
export function irPara(nome) {
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
export let pararEscutas = [];
export let pararAcomp = [];
export let cadastrando = false;
export function comecarEscutas(user) {
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
      render();
      verificarMetas();
    }, erro),
  );
}

// Meus dados mudaram: redesenha e confere conquistas e metas do casal
export function aposMudanca() { render(); migrarPlanoAntigo(); migrarBoasVindas(); verificarConquistas(); verificarMetas(); }

// Escuta os dados da pessoa que estou acompanhando. Refaz a escuta quando a pessoa
// muda, aceita o pedido ou liga/desliga as permissões de treinos e check-ins.
export const chaveAcomp = c => `${c.id}:${c.status}:${!!c.perm?.treinos}:${!!c.perm?.checkins}:${!!c.perm?.peso}`;
export function pararDeAcompanhar() { pararAcomp.forEach(f => f()); pararAcomp = []; }
export function acompAtual() {
  const aceitas = quemAcompanho().filter(c => c.status === 'aceita');
  return aceitas.find(c => c.id === S.acompId) || aceitas[0];
}
export function sincronizarAcomp() {
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
export const inicioHistorico = () => '2000-01-01';


// Tema escolhido neste aparelho (a cor da barra do celular também)
escolherTema(temaAtual());

// ---------- Registro de erros ----------
// Erros inesperados vão para o banco (no máximo 5 por vez que o app abre, sem repetir o mesmo)
const errosEnviados = new Set();
function reportarErro(mensagem, detalhe) {
  const msg = String(mensagem || 'Erro sem mensagem');
  if (errosEnviados.size >= 5 || errosEnviados.has(msg)) return;
  // Falta de internet, permissões do celular e recusas esperadas do banco não são erros do app
  if (/network|offline|Failed to fetch|NotAllowedError|AbortError|quota|permission-denied|insufficient permissions|auth\//i.test(msg)) return;
  errosEnviados.add(msg);
  Store.registrarErro({ mensagem: msg, detalhe, tela: S.sub?.[S.aba] || S.aba }).catch(() => {});
}
window.addEventListener('error', e => reportarErro(e.message, `${e.filename || ''}:${e.lineno || ''}:${e.colno || ''}\n${e.error?.stack || ''}`));
window.addEventListener('unhandledrejection', e => reportarErro(e.reason?.message || String(e.reason), e.reason?.stack || ''));
// Erros que o próprio app captura (ex.: falha ao salvar) também são registrados
const consoleErrorOriginal = console.error.bind(console);
console.error = (...args) => {
  consoleErrorOriginal(...args);
  const err = args.find(a => a instanceof Error) || args[0];
  if (err?.code === 'permission-denied' || err?.code?.startsWith?.('auth/')) return; // esperados, já mostrados na tela
  reportarErro(err?.message || String(err), err?.stack || args.map(String).join(' ').slice(0, 1500));
};

if (Store.configurado) {
  // Voltando do login do Google pelo redirecionamento: mostra o erro, se houver
  Store.resultadoGoogle().catch(err => { console.warn(err); setTimeout(() => mostrarErroLogin(mensagemErro(err)), 500); });
  Store.onAuthChange(user => {
    S.user = user;
    S.perfil = undefined; S.plano = {}; S.registros = {}; S.checkins = []; S.fotos = {}; S.pesos = []; S.medidas = []; S.dica = {}; S.carregado = {}; S.editandoMeta = null;
    S.fotosProg = undefined; S.fotoAntes = S.fotoDepois = S.exSel = null; S.fotoProgEnviando = false;
    S.conexoes = []; S.acomp = null; S.acompId = null; S.confirmar = null;
    S.checkin = { aberto: false, foto: null, processando: false, enviando: false };
    pararDeAcompanhar();
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
export const uid = () => S.user.uid;
// Cópia do plano de um dia para editar. Se o dia era descanso, o treino passa a valer a partir de hoje.
export function planoDoDia(dia) {
  const p = structuredClone(S.plano[dia] || { titulo: '', exercicios: [] });
  if (!p.exercicios?.length) p.desde = isoDe(hoje());
  return p;
}

// Planos antigos (antes do campo "desde") passam a valer a partir da criação da conta
export let planoMigrado = false;
export function migrarPlanoAntigo() {
  if (planoMigrado || !S.perfil?.criadoEm?.toDate || !S.carregado.plano) return;
  planoMigrado = true;
  const desde = isoDe(S.perfil.criadoEm.toDate());
  Object.entries(S.plano).forEach(([dia, p]) => {
    if (p.exercicios?.length && !p.desde) Store.salvarDia(uid(), dia, { ...p, desde }).catch(console.warn);
  });
}

export async function salvar(promessa, sucesso) {
  try { await promessa; if (sucesso) toast(sucesso); } catch (err) { console.error(err); toast(mensagemErro(err)); }
}

// Tocar num ponto ou barra do gráfico mostra o valor embaixo dele
export function mostrarDica(alvo) {
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
  if (b.dataset.aba) {
    if (b.dataset.dia !== undefined) S.diaSel = +b.dataset.dia;
    if (b.dataset.mesResumo) { S.mesResumo = b.dataset.mesResumo; try { localStorage.setItem('resumo-visto', b.dataset.mesResumo); } catch { /* ok */ } }
    irPara(b.dataset.aba); return;
  }

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

  // Check-ins e reações
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
  if (b.dataset.modoIr && S.modo) {
    const n = (S.plano[hoje().getDay()]?.exercicios || []).length;
    if (n) S.modo.i = ((S.modo.i < 0 ? 0 : S.modo.i) + +b.dataset.modoIr + n) % n;
    render(); return;
  }
  if (b.dataset.mesResumo) { S.mesResumo = b.dataset.mesResumo; render(); return; }
  if (b.dataset.diaHist) { S.diaHist = b.dataset.diaHist; render(); return; }
  if (b.dataset.mes) {
    const atual = S.mesHist || isoDe(hoje()).slice(0, 7);
    const [a, m] = atual.split('-').map(Number);
    const novo = new Date(a, m - 1 + +b.dataset.mes, 15);
    S.mesHist = isoDe(novo).slice(0, 7); S.diaHist = null; render();
    return;
  }
  if (b.dataset.serie) { marcarSerie(b.dataset.serie); return; }
  if (b.dataset.descansar) { const exercicio = exercicioDeHoje(b.dataset.descansar); if (exercicio) iniciarDescanso(exercicio); return; }
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
  if (b.dataset.bvModelo) { S.bv = { ...(S.bv || {}), passo: 2, modelo: b.dataset.bvModelo }; render(); return; }
  if (b.dataset.tipoSugestao) { S.tipoSugestao = b.dataset.tipoSugestao; render(); return; }
  if (b.dataset.tema) { escolherTema(b.dataset.tema); render(); return; }
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
    if (S.modo) { try { S.modo.wake?.release(); } catch { /* ok */ } S.modo = null; } // do fim do modo treino vai direto para o check-in
    S.checkin = { aberto: true, foto: null, processando: false, enviando: false };
    if (S.sub.juntos === 'mural' && S.aba === 'juntos') render(); else irPara('mural');
    return;
  }
  if (acao === 'cancelar-checkin') { S.checkin.aberto = false; S.checkin.foto = null; render(); return; }
  if (acao === 'enviar-checkin') { enviarCheckin(); return; }
  if (acao === 'ativar-avisos') { ativarAvisos(); return; }
  if (acao === 'ja-confirmei') { jaConfirmei(false); return; }
  if (acao === 'bv-pular' || acao === 'bv-fim') { concluirBoasVindas(); return; }
  if (acao === 'bv-2') {
    const m = MODELOS.find(x => x.id === S.bv?.modelo);
    S.bv = { ...S.bv, passo: 3 };
    if (m) usarModelo(m); else render();
    return;
  }
  if (acao === 'modo-treino') { entrarModoTreino(); return; }
  if (acao === 'sair-modo') { sairModoTreino(); return; }
  if (acao === 'baixar-dados') { baixarMeusDados(); return; }
  if (acao === 'apagar-conta') { S.apagar = {}; render(); document.getElementById('apagarTexto')?.focus(); return; }
  if (acao === 'cancelar-apagar') { S.apagar = null; render(); return; }
  if (acao === 'google') {
    Store.entrarComGoogle().catch(err => mostrarErroLogin(mensagemErro(err)));
    return;
  }
  if (acao === 'reenviar-verificacao') {
    const btn = $('#reenviarBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
    Store.reenviarVerificacao().then(() => { render(); toast('Link enviado! Olhe também no spam e em Promoções.'); }, err => {
      console.error(err);
      const el = $('#verificarErro');
      if (el) { el.textContent = err.code === 'auth/too-many-requests' ? 'Muitos envios seguidos. Espere uns 10 minutos e tente de novo (o último link enviado continua valendo).' : mensagemErro(err); el.hidden = false; }
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar o link de novo'; }
    });
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
export async function usarModelo(m) {
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


export async function enviarCheckin() {
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

export function mostrarErroLogin(texto) { const el = $('#loginErro'); if (el) { el.textContent = texto; el.hidden = false; } }

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'fotoIn' && t.files?.[0]) {
    S.checkin.processando = true; S.checkin.foto = null; render();
    prepararFoto(t.files[0]).then(foto => { S.checkin.foto = foto; }, err => toast(err.message))
      .finally(() => { S.checkin.processando = false; render(); });
    return;
  }
  if (t.dataset.carga) {
    const kg = numero(t.value);
    if (kg !== null && !(kg >= 0 && kg <= 500)) {
      toast('Digite a carga em kg, por exemplo 22,5.');
      const antes = S.registros[isoDe(hoje())]?.cargas?.[t.dataset.carga]?.kg;
      t.value = antes != null ? kgBR(antes) : '';
      return;
    }
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
      if (criar) {
        const { erroEmail } = await Store.criarConta(nome, email, senha);
        if (erroEmail) setTimeout(() => { const el = $('#verificarErro'); if (el) { el.textContent = 'Não conseguimos enviar o e-mail de confirmação agora (' + mensagemErro(erroEmail) + '). Toque em "Enviar o link de novo".'; el.hidden = false; } }, 300);
      } else await Store.entrar(email, senha);
    } catch (err) {
      cadastrando = false;
      if (S.user) { // a conta foi criada, só o perfil falhou: tenta de novo
        Store.criarPerfil(S.user.uid, nome || S.user.email.split('@')[0], S.user.email).catch(erroPerfil => toast(mensagemErro(erroPerfil)));
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
    const editado = p.exercicios.find(x => x.id === f.dataset.editarForm);
    const nome = $('#edNome').value.trim();
    if (!editado || !nome) return toast('Digite o nome do exercício.');
    Object.assign(editado, {
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

  if (f.id === 'formBv1') {
    const nome = $('#bvNome').value.trim() || S.perfil?.nome || 'Você';
    let altura = numero($('#bvAltura').value);
    if (altura > 0 && altura < 3) altura *= 100;
    if (altura !== null) altura = Math.round(altura);
    const peso = numero($('#bvPeso').value);
    if (altura !== null && !(altura >= 100 && altura <= 230)) return toast('Digite a altura em centímetros, por exemplo 165.');
    if (peso !== null && !(peso >= 20 && peso <= 300)) return toast('Digite o peso em kg, por exemplo 72,5.');
    try {
      await Store.salvarPerfil(uid(), { nome: nome.slice(0, 40), alturaCm: altura });
      // O peso de hoje vira o primeiro registro do gráfico (e o ponto de partida do IMC)
      if (peso !== null) await Store.salvarPeso(uid(), isoDe(hoje()), peso);
    } catch (err) { return toast(mensagemErro(err)); }
    S.bv = { passo: 2, modelo: S.bv?.modelo ?? 'abc' };
    render();
    return;
  }

  if (f.id === 'formSugestao') {
    const texto = $('#sugestaoTexto').value.trim();
    if (texto.length < 5) return toast('Escreva um pouco mais, por favor.');
    const tipo = S.tipoSugestao === 'problema' ? 'problema' : 'ideia';
    try {
      await Store.enviarSugestao(uid(), S.perfil?.nome, S.user.email, tipo, texto);
      $('#sugestaoTexto').value = '';
      toast('Recebido! Obrigado por ajudar a melhorar o app 💚');
      Store.avisar({ evento: 'sugestao', tipo });
    } catch (err) { console.error(err); toast(mensagemErro(err)); }
    return;
  }

  if (f.id === 'formApagar') {
    const erroEl = $('#apagarErro');
    const mostrar = t => { if (erroEl) { erroEl.textContent = t; erroEl.hidden = false; } };
    if ($('#apagarTexto').value.trim().toUpperCase() !== 'APAGAR') return mostrar('Digite APAGAR para confirmar.');
    const senha = $('#apagarSenha')?.value || '';
    if (Store.provedorAtual() !== 'google.com' && !senha) return mostrar('Digite sua senha.');
    try {
      await Store.confirmarIdentidade(senha);
    } catch (err) { return mostrar(mensagemErro(err)); }
    const codigo = S.perfil?.codigo;
    S.apagando = true; // evita recriar o perfil enquanto apaga
    pararEscutas.forEach(fn => fn()); pararEscutas = []; pararDeAcompanhar(); pararDescanso();
    try {
      await Store.apagarTudo(uid(), codigo, texto => { S.apagar = { andamento: texto }; render(); });
      try { localStorage.clear(); } catch { /* ok */ }
      toast('Sua conta e seus dados foram apagados.');
    } catch (err) {
      console.error(err);
      S.apagar = { andamento: 'Parou no meio: ' + mensagemErro(err) + ' Saia e entre de novo para tentar outra vez.' };
      render();
    } finally { S.apagando = false; }
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
      const v = numero(txt);
      if (!Number.isFinite(v) || v < 10 || v > 250) return toast(`${nome}: digite em centímetros, por exemplo 82,5.`);
      medidas[k] = v;
    }
    if (!Object.keys(medidas).length) return toast('Preencha pelo menos uma medida.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > isoDe(hoje()) || data < DATA_MIN) return toast('Escolha um dia entre 2015 e hoje.');
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
    const kg = numero($('#pesoKg').value);
    const data = $('#pesoData').value;
    if (!Number.isFinite(kg) || kg < 20 || kg > 300) return toast('Digite o peso em kg, por exemplo 72,5.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > isoDe(hoje()) || data < DATA_MIN) return toast('Escolha um dia entre 2015 e hoje.');
    $('#pesoKg').value = '';
    delete S.dica.meuPeso; // o gráfico volta a destacar o registro mais novo
    await salvar(Store.salvarPeso(uid(), data, kg), `Peso de ${dataCurta(data)} registrado`);
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
    const meta = numero($('#pmeta').value);
    let altura = numero($('#paltura').value);
    if (altura > 0 && altura < 3) altura *= 100; // digitou em metros (1,65)
    if (altura !== null) altura = Math.round(altura);
    if (!nome) return toast('Digite seu nome.');
    if (meta !== null && !(meta >= 30 && meta <= 250)) return toast('A meta precisa estar entre 30 e 250 kg.');
    if (altura !== null && !(altura >= 100 && altura <= 230)) return toast('Digite a altura em centímetros, por exemplo 165.');
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

// ---------- Abrir na tela certa (ex.: tocar no aviso de check-in abre o Check-in) ----------
export function rotaDoEndereco(endereco) {
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
