/* Treino Junto · js/ficha.js
   Ler a ficha de treino por uma foto: o texto é lido no próprio celular
   (Tesseract.js, gratuito, a foto não sai do aparelho), vira uma lista de
   treinos e exercícios, e a pessoa confere tudo antes de salvar no plano. */
import * as Store from '../store.js';
import { planoDoDia, render, uid } from '../app.js';
import { DIAS_NOME, S, esc, mensagemErro, novoId, toast } from './base.js';
import { interpretarFicha, limparImagem } from './ficha-leitura.js';

// Versões fixas: o leitor só é baixado quando a pessoa usa (cerca de 4 MB na primeira vez, depois fica guardado)
const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const IDIOMA = 'https://tessdata.projectnaptha.com/4.0.0_fast'; // modelo "rápido" de português (2 MB)

// ---------- Leitura da foto ----------
let carregando = null;
function carregarLeitor() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  carregando ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TESSERACT;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => { carregando = null; reject(new Error('Não foi possível baixar o leitor de fichas. Confira a internet e tente de novo.')); };
    document.head.append(s);
  });
  return carregando;
}

// Amplia letras pequenas e limpa a foto (cor, sombra, inclinação): assim o leitor erra bem menos.
// O iPhone não desenha imagens com mais de ~16 milhões de pontos: fica abaixo disso.
function prepararImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const largura = Math.max(2800, Math.min(img.width, 4000));
      let escala = Math.min(4, largura / img.width);
      escala = Math.min(escala, Math.sqrt(15e6 / (img.width * img.height)));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const px = ctx.getImageData(0, 0, c.width, c.height);
      const { pixels } = limparImagem(px.data, c.width, c.height);
      const d = px.data;
      for (let i = 0, j = 0; i < pixels.length; i++, j += 4) { d[j] = d[j + 1] = d[j + 2] = pixels[i]; d[j + 3] = 255; }
      ctx.putImageData(px, 0, 0);
      resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir essa foto. Tente outra.')); };
    img.src = url;
  });
}

export async function lerFicha(arquivo) {
  S.ficha = { estado: 'lendo', etapa: 'Preparando a foto…', pct: 0 };
  render();
  let worker;
  try {
    const [Tesseract, imagem] = await Promise.all([carregarLeitor(), prepararImagem(arquivo)]);
    S.ficha.etapa = 'Baixando o leitor…'; render();
    worker = await Tesseract.createWorker('por', 1, {
      langPath: IDIOMA,
      logger: m => {
        if (!S.ficha || S.ficha.estado !== 'lendo') return;
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          if (pct !== S.ficha.pct) { S.ficha.etapa = 'Lendo a ficha…'; S.ficha.pct = pct; render(); }
        }
      },
    });
    await worker.setParameters({ tessedit_pageseg_mode: '6' }); // a página como um bloco de linhas (tabela)
    const { data } = await worker.recognize(imagem);
    if (!S.ficha) return; // cancelou enquanto lia
    const treinos = interpretarFicha(data.text.split('\n')).filter(t => t.exercicios.length);
    if (!treinos.length) {
      S.ficha = { estado: 'erro', erro: 'Não encontrei exercícios nessa foto. Tente uma foto mais de perto, reta e com boa luz, ou um print da ficha.' };
    } else {
      // Dia escrito na própria ficha ("Treino A - Segunda") tem prioridade
      const dias = treinos.every(t => t.diaFicha !== undefined) ? treinos.map(t => t.diaFicha) : diasPadrao(treinos.length);
      S.ficha = { estado: 'revisar', treinos: treinos.map((t, i) => ({ ...t, dia: dias[i] ?? '' })) };
    }
  } catch (err) {
    console.error(err);
    if (S.ficha) S.ficha = { estado: 'erro', erro: err.message?.startsWith('Não') ? err.message : mensagemErro(err) };
  } finally {
    worker?.terminate();
    render();
  }
}

// Em que dias colocar: se a pessoa já treina em N dias e a ficha tem N treinos, mantém os mesmos dias
function diasPadrao(n) {
  const atuais = [1, 2, 3, 4, 5, 6, 0].filter(d => S.plano[d]?.exercicios?.length);
  if (atuais.length === n) return atuais;
  return { 1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [1, 2, 3, 4, 5, 6, 0] }[n] || [];
}

// ---------- Telas ----------
export function botaoFicha() {
  return `<section class="block">
    <label class="btn ghost" for="fichaIn">📷 Ler ficha de treino pela foto</label>
    <input id="fichaIn" type="file" accept="image/*" hidden>
    <p class="small muted">Tire uma foto ou um print da ficha da academia. O app monta os treinos e você confere antes de salvar.</p>
  </section>`;
}

export function telaFicha() {
  const f = S.ficha;
  if (f.estado === 'lendo') {
    return `<section class="block"><div class="card stack ficha-lendo" role="status" aria-live="polite">
      <h3>📷 ${esc(f.etapa)}${f.pct ? ` ${f.pct}%` : ''}</h3>
      <div class="barra"><span style="width:${f.pct || 3}%"></span></div>
      <p class="small muted">A leitura é feita no seu celular e a foto não é enviada para lugar nenhum. Na primeira vez o app baixa o leitor (cerca de 4 MB).</p>
      <button class="btn ghost sm" data-ficha="cancelar">Cancelar</button></div></section>`;
  }
  if (f.estado === 'erro') {
    return `<section class="block"><div class="card stack">
      <h3>Não deu para ler a ficha</h3><p class="small muted">${esc(f.erro)}</p>
      <div class="row"><button class="btn ghost" data-ficha="cancelar">Voltar</button>
        <label class="btn" for="fichaIn">Tentar outra foto</label></div>
      <input id="fichaIn" type="file" accept="image/*" hidden></div></section>`;
  }
  const opcoesDia = sel => `<option value="" ${sel === '' ? 'selected' : ''}>Não usar</option>`
    + [1, 2, 3, 4, 5, 6, 0].map(d => `<option value="${d}" ${sel === d ? 'selected' : ''}>${DIAS_NOME[d]}</option>`).join('');
  const usados = f.treinos.map(t => t.dia).filter(d => d !== '');
  const duvidas = f.treinos.reduce((n, t) => n + t.exercicios.filter(e => e.duvida).length, 0);
  return `<section class="block">
    <div class="row between"><h2>Confira a ficha</h2><button class="link" data-ficha="cancelar">Cancelar</button></div>
    <p class="small muted">Achei ${f.treinos.length} ${f.treinos.length === 1 ? 'treino' : 'treinos'}. A leitura pode errar alguma letra: corrija o que precisar, escolha o dia de cada treino e salve.
      ${duvidas ? `<b>${duvidas} ${duvidas === 1 ? 'campo marcado' : 'campos marcados'} em amarelo</b> não ${duvidas === 1 ? 'ficou legível' : 'ficaram legíveis'}: confira.` : ''}</p>
  </section>
  ${f.treinos.map((t, i) => {
    const existente = t.dia !== '' ? S.plano[t.dia] : null;
    const repetido = t.dia !== '' && usados.filter(d => d === t.dia).length > 1;
    return `<section class="block"><div class="card stack ficha-treino">
      <div class="grid2">
        <div class="field"><label class="label" for="fichaTit${i}">Nome do treino</label>
          <input id="fichaTit${i}" maxlength="60" value="${esc(t.titulo)}" data-ficha-campo="titulo" data-t="${i}"></div>
        <div class="field"><label class="label" for="fichaDia${i}">Dia</label>
          <select id="fichaDia${i}" class="input" data-ficha-campo="dia" data-t="${i}">${opcoesDia(t.dia)}</select></div>
      </div>
      ${repetido ? '<p class="small erro">Outro treino da ficha já está neste dia. Escolha um dia diferente.</p>'
        : existente?.exercicios?.length ? `<p class="small muted">Vai substituir o treino de ${DIAS_NOME[t.dia].toLowerCase()} (${esc(existente.titulo || `${existente.exercicios.length} exercícios`)}).</p>` : ''}
      <div class="ficha-ex ficha-cab small muted" aria-hidden="true"><span>Exercício</span><span>Séries</span><span>Reps</span><span></span></div>
      ${t.exercicios.map((e, j) => `<div class="ficha-ex ${e.duvida ? 'duvida' : ''}">
        <input aria-label="Exercício ${j + 1}" maxlength="60" value="${esc(e.nome)}" data-ficha-campo="nome" data-t="${i}" data-e="${j}">
        <input aria-label="Séries de ${esc(e.nome)}" type="number" inputmode="numeric" min="1" max="20" value="${e.series}" data-ficha-campo="series" data-t="${i}" data-e="${j}">
        <input aria-label="Repetições de ${esc(e.nome)}" maxlength="12" value="${esc(e.reps)}" data-ficha-campo="reps" data-t="${i}" data-e="${j}">
        <button class="icone" data-ficha-remover="${i}:${j}" aria-label="Tirar ${esc(e.nome)}">×</button></div>`).join('')}
      ${t.exercicios.length ? '' : '<p class="small muted">Sem exercícios: este treino não será salvo.</p>'}
    </div></section>`;
  }).join('')}
  <section class="block"><button class="btn" data-ficha="salvar">Salvar no meu plano</button>
    <p class="small muted">Só os dias escolhidos mudam. Depois dá para ajustar cada exercício aqui em Semana.</p></section>`;
}

// ---------- Ações ----------
// Digitação nos campos da revisão (sem redesenhar a tela, para não perder o cursor)
export function editarCampo(el) {
  const t = S.ficha?.treinos?.[+el.dataset.t];
  if (!t) return false;
  const campo = el.dataset.fichaCampo;
  if (campo === 'titulo') t.titulo = el.value;
  else if (campo === 'dia') { t.dia = el.value === '' ? '' : +el.value; return true; } // redesenha (aviso de dia)
  else {
    const e = t.exercicios[+el.dataset.e];
    if (!e) return false;
    if (campo === 'series') e.series = el.value;
    else { e[campo] = el.value; if (campo === 'reps') e.duvida = false; }
  }
  return false;
}

export function removerExercicio(chave) {
  const [i, j] = chave.split(':').map(Number);
  S.ficha?.treinos?.[i]?.exercicios.splice(j, 1);
  render();
}

export async function salvarFicha(botao) {
  const escolhidos = S.ficha.treinos.filter(t => t.dia !== '' && t.exercicios.some(e => e.nome.trim()));
  if (!escolhidos.length) return toast('Escolha o dia de pelo menos um treino.');
  const dias = escolhidos.map(t => t.dia);
  if (new Set(dias).size !== dias.length) return toast('Dois treinos estão no mesmo dia. Escolha dias diferentes.');
  botao.disabled = true; botao.textContent = 'Salvando…';
  try {
    await Promise.all(escolhidos.map(t => Store.salvarDia(uid(), t.dia, {
      titulo: t.titulo.trim().slice(0, 60),
      exercicios: t.exercicios.filter(e => e.nome.trim()).slice(0, 40).map(e => ({
        id: novoId(), nome: e.nome.trim().slice(0, 60),
        series: Math.min(20, Math.max(1, parseInt(e.series, 10) || 1)),
        reps: String(e.reps || '').trim().slice(0, 12), carga: '', descanso: 60,
      })),
      desde: planoDoDia(t.dia).desde,
    })));
    S.ficha = null;
    S.diaSel = escolhidos[0].dia;
    toast(`Ficha salva: ${escolhidos.length} ${escolhidos.length === 1 ? 'treino' : 'treinos'} no seu plano 💪`);
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    toast(mensagemErro(err));
    botao.disabled = false; botao.textContent = 'Salvar no meu plano';
  }
  render();
}
