/* Treino Junto · js/perfil.js
   Perfil: dados, apagar conta, conexões e avisos no celular. */
import * as Store from '../store.js';
import { render, uid } from '../app.js';
import { S, esc, meusAcompanhantes, nomeDe, pad, pedidosRecebidos, quemAcompanho, toast } from './base.js';
import { formConectar, kgBR } from './progresso.js';
import { cabecalho } from './treino.js';

// ---------- Perfil ----------
export function telaDados() {
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
  <section class="block"><span class="label">Aparência</span>
    <div class="seg tres" role="radiogroup" aria-label="Tema">
      ${[['auto', 'Automático'], ['light', '☀️ Claro'], ['dark', '🌙 Escuro']].map(([v, l]) => `<button type="button" role="radio"
        aria-checked="${temaAtual() === v}" class="${temaAtual() === v ? 'on' : ''}" data-tema="${v}">${l}</button>`).join('')}
    </div>
    <p class="small muted">"Automático" segue o tema do celular. A escolha vale só para este aparelho.</p>
  </section>
  <section class="block"><span class="label">Mandar sugestão</span>
    <form id="formSugestao" class="card stack">
      <div class="seg" role="radiogroup" aria-label="Tipo">
        <button type="button" role="radio" aria-checked="${S.tipoSugestao !== 'problema'}" class="${S.tipoSugestao !== 'problema' ? 'on' : ''}" data-tipo-sugestao="ideia">💡 Ideia</button>
        <button type="button" role="radio" aria-checked="${S.tipoSugestao === 'problema'}" class="${S.tipoSugestao === 'problema' ? 'on' : ''}" data-tipo-sugestao="problema">🐞 Problema</button>
      </div>
      <div class="field"><label class="label" for="sugestaoTexto">${S.tipoSugestao === 'problema' ? 'O que aconteceu? Em qual tela?' : 'O que podia ser melhor?'}</label>
        <textarea id="sugestaoTexto" class="input" rows="4" maxlength="1000" placeholder="Escreva aqui"></textarea></div>
      <button class="btn" type="submit">Enviar</button>
    </form>
  </section>
  <section class="block">
    <button class="btn ghost" data-acao="baixar-dados">📥 Baixar meus dados</button>
    <a class="btn ghost" href="privacidade.html">🔒 Privacidade: quem vê o quê</a>
    <button class="btn ghost" data-acao="sair">Sair da conta</button>
  </section>
  ${secaoApagarConta()}`;
}

// ---------- Tema claro / escuro (guardado só neste aparelho) ----------
export function temaAtual() {
  try { return localStorage.getItem('tema') || 'auto'; } catch { return 'auto'; }
}
export function escolherTema(tema) {
  try { if (tema === 'auto') localStorage.removeItem('tema'); else localStorage.setItem('tema', tema); } catch { /* fica só agora */ }
  if (tema === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = tema;
  // Cor da barra do celular acompanha o tema
  const escuro = tema === 'dark' || (tema === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro ? '#0E1412' : '#1E7A58');
}

// Apagar a conta: aviso claro, digitar APAGAR e confirmar a senha (ou o Google)
export function secaoApagarConta() {
  const a = S.apagar;
  if (!a) return `<section class="block"><button class="link perigo" data-acao="apagar-conta">Apagar minha conta e meus dados</button></section>`;
  const google = Store.provedorAtual() === 'google.com';
  return `<section class="block"><div class="card stack perigo-card">
    <h2>Apagar minha conta</h2>
    <p>Isso apaga <b>para sempre</b>: perfil, treinos, check-ins e fotos, peso, medidas, fotos de antes e depois, conexões, reações e o seu login.
      Quem te acompanha deixa de ver tudo na hora. <b>Não tem como desfazer.</b></p>
    ${a.andamento ? `<p class="small"><b>${esc(a.andamento)}</b></p>` : `
    <form id="formApagar" class="stack">
      <div class="field"><label class="label" for="apagarTexto">Para confirmar, digite APAGAR</label>
        <input id="apagarTexto" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
      ${google ? '<p class="small muted">Vamos pedir para você entrar com o Google de novo, por segurança.</p>'
        : `<div class="field"><label class="label" for="apagarSenha">Sua senha</label><input id="apagarSenha" type="password" autocomplete="current-password"></div>`}
      <p class="erro" id="apagarErro" hidden></p>
      <div class="row"><button class="btn ghost" type="button" data-acao="cancelar-apagar">Cancelar</button>
        <button class="btn perigo-btn" type="submit">Apagar tudo</button></div>
    </form>`}
  </div></section>`;
}

export function telaAvisos() {
  return `${cabecalho()}${secaoAvisos()}`;
}

export function telaConexoes() {
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
export const ehIphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
export const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const permissao = () => globalThis.Notification?.permission; // 'default' | 'granted' | 'denied' | undefined

export const TIPOS_AVISO = [
  ['checkin', 'Quando quem eu acompanho fizer check-in'],
  ['lembrete', 'No horário do lembrete, se quem eu acompanho ainda não treinou'],
  ['meuLembrete', 'No horário do lembrete, se eu ainda não treinei no dia de treino'],
  ['reacoes', 'Reações aos meus check-ins'],
  ['conquistas', 'Conquistas e meta do mês de quem eu acompanho'],
  ['resumo', 'Resumo da semana no domingo às 20h'],
];

// Situação dos avisos neste aparelho, em texto para a pessoa
export function estadoAvisos() {
  if (!Store.avisosConfigurados) return { pode: false, texto: 'Os avisos ainda não foram configurados no app.' };
  if (ehIphone && !instalado()) return { pode: false, texto: 'No iPhone, os avisos só funcionam com o app na Tela de Início: no Safari, toque em Compartilhar ⬆ e em "Adicionar à Tela de Início". Depois abra por lá.' };
  if (!globalThis.Notification) return { pode: false, texto: 'Este navegador não recebe avisos. No Android, use o Chrome.' };
  if (permissao() === 'denied') return { pode: false, texto: 'Os avisos estão bloqueados para este app. Libere nas configurações de notificação do celular e abra o app de novo.' };
  if (permissao() === 'granted') return { pode: true, ativo: true, texto: 'Avisos ligados neste aparelho.' };
  return { pode: true, ativo: false, texto: 'Receba um aviso quando alguém fizer check-in ou reagir à sua foto.' };
}

export function secaoAvisos() {
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

export function convitAvisos() {
  const e = estadoAvisos();
  let dispensado = false;
  try { dispensado = localStorage.getItem('avisos-dispensado') === '1'; } catch { /* sem armazenamento */ }
  if (!e.pode || e.ativo || dispensado) return '';
  return `<section class="block"><div class="card stack aviso"><h3>Ative os avisos</h3>
    <p class="small">Saiba na hora quando alguém fizer check-in ou reagir à sua foto, e receba o lembrete do treino.</p>
    <div class="row"><button class="btn ghost" data-acao="dispensar-avisos">Agora não</button><button class="btn" data-acao="ativar-avisos">Ativar</button></div></div></section>`;
}

export async function ativarAvisos() {
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
