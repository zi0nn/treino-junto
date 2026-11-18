/* Treino Junto · js/ficha-leitura.js
   A parte do "ler ficha pela foto" que não depende do navegador:
   limpar a imagem antes da leitura e transformar o texto lido em treinos.
   Sem imports, para dar para testar no computador (testes/ficha.test.mjs). */

// ---------- Limpar a foto ----------
// Recebe os pontos da imagem (RGBA, como no canvas) e devolve tons de cinza prontos para o leitor:
//  1. cor clara vira branco (linhas e faixas amarelas da tabela não atrapalham);
//  2. sombra e mesa em volta somem (cada ponto é comparado com o papel em volta dele);
//  3. foto torta é endireitada pelas próprias linhas do texto.
export function limparImagem(rgba, largura, altura) {
  const n = largura * altura;
  const cinza = new Uint8ClampedArray(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const r = rgba[j], g = rgba[j + 1], b = rgba[j + 2];
    const luz = 0.299 * r + 0.587 * g + 0.114 * b;
    const max = Math.max(r, g, b);
    // cor forte (linha e faixa amarela da tabela) vira o tom mais claro dela; tinta preta continua preta
    cinza[i] = max - Math.min(r, g, b) > 60 ? max : 0.5 * max + 0.5 * luz;
  }
  const limpa = tirarSombra(cinza, largura, altura);
  const angulo = acharInclinacao(limpa, largura, altura);
  return { pixels: Math.abs(angulo) >= 0.2 ? girar(limpa, largura, altura, angulo) : limpa, angulo };
}

// Divide cada ponto pelo "papel" em volta (o ponto mais claro da vizinhança)
function tirarSombra(cinza, w, h) {
  const B = Math.max(16, Math.round(Math.max(w, h) / 60)); // bloco bem maior que uma letra
  const bw = Math.ceil(w / B), bh = Math.ceil(h / B);
  const papel = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let max = 0;
      const y1 = Math.min(h, (by + 1) * B), x1 = Math.min(w, (bx + 1) * B);
      for (let y = by * B; y < y1; y += 2) for (let x = bx * B; x < x1; x += 2) { const v = cinza[y * w + x]; if (v > max) max = v; }
      papel[by * bw + bx] = max;
    }
  }
  // espalha o papel para os blocos vizinhos (letra grande ou célula preenchida não vira "papel escuro")
  const suave = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let max = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = by + dy, xx = bx + dx;
        if (yy >= 0 && yy < bh && xx >= 0 && xx < bw && papel[yy * bw + xx] > max) max = papel[yy * bw + xx];
      }
      suave[by * bw + bx] = max;
    }
  }
  const saida = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(bh - 1.001, Math.max(0, y / B - 0.5)), y0 = Math.floor(fy), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(bw - 1.001, Math.max(0, x / B - 0.5)), x0 = Math.floor(fx), tx = fx - x0;
      const i = y0 * bw + x0;
      const p = (suave[i] * (1 - tx) + suave[i + 1 < suave.length ? i + 1 : i] * tx) * (1 - ty)
        + ((suave[i + bw] ?? suave[i]) * (1 - tx) + (suave[i + bw + 1] ?? suave[i]) * tx) * ty;
      const v = cinza[y * w + x] * 255 / Math.max(p, 40);
      saida[y * w + x] = (v - 120) * 255 / 100; // contraste: tinta bem escura, papel branco
    }
  }
  return saida;
}

// Testa ângulos de -8° a 8°: o certo é o que deixa as linhas de texto mais "alinhadas" (histograma com picos)
function acharInclinacao(img, w, h) {
  const passo = Math.max(1, Math.round(w / 700));
  const k = passo * 3;
  const xs = [], ys = [];
  // Só traço fino (letra): ponto escuro com papel claro logo acima ou abaixo.
  // Mancha escura grande (mesa em volta, sombra) não conta, senão a borda reta dela "ganha".
  for (let y = k; y < h - k; y += passo) {
    for (let x = 0; x < w; x += passo) {
      const i = y * w + x;
      if (img[i] < 100 && (img[i - k * w] > 170 || img[i + k * w] > 170)) { xs.push(x / passo); ys.push(y / passo); }
    }
  }
  if (xs.length < 200) return 0;
  const nota = graus => {
    const a = graus * Math.PI / 180, s = Math.sin(a), c = Math.cos(a);
    const hist = new Map();
    for (let i = 0; i < xs.length; i++) { const k = Math.round(xs[i] * s + ys[i] * c); hist.set(k, (hist.get(k) || 0) + 1); }
    let soma = 0; for (const v of hist.values()) soma += v * v;
    return soma;
  };
  let melhor = 0, notaMelhor = nota(0);
  for (let g = -8; g <= 8; g += 0.5) { const v = nota(g); if (v > notaMelhor) { notaMelhor = v; melhor = g; } }
  const base = melhor;
  for (let g = base - 0.4; g <= base + 0.4; g += 0.1) { const v = nota(g); if (v > notaMelhor) { notaMelhor = v; melhor = g; } }
  return Math.round(melhor * 10) / 10;
}

// Gira a imagem (o que sobra nos cantos fica branco)
function girar(img, w, h, graus) {
  const a = graus * Math.PI / 180, s = Math.sin(a), c = Math.cos(a);
  const cx = w / 2, cy = h / 2;
  const saida = new Uint8ClampedArray(w * h).fill(255);
  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const sx = dx * c + dy * s + cx, sy = -dx * s + dy * c + cy;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue;
      const tx = sx - x0, ty = sy - y0, i = y0 * w + x0;
      saida[y * w + x] = (img[i] * (1 - tx) + img[i + 1] * tx) * (1 - ty) + (img[i + w] * (1 - tx) + img[i + w + 1] * tx) * ty;
    }
  }
  return saida;
}

// ---------- Do texto lido para treinos ----------
// Funciona com fichas em tabela numerada (Nº | exercício | série | repetição) e também
// com linhas soltas como "Supino reto 3x12". 
const LETRAS = /[A-Za-zÀ-ÿ]{3,}/;
export function interpretarFicha(linhas) {
  const limpas = linhas.map(l => l.replace(/[|[\]{}_=“”"'´`~—–]+/g, ' ').replace(/\s+/g, ' ').trim()
    // a borda da tabela às vezes vira "I", "1" ou "+" entre a série e a repetição ("3 | 12" → "3 1 12")
    .replace(/(\d)\s+(?:[Il!1]|[^\s\p{L}\p{N}]{1,2})\s+(?=\d{1,3}$)/gu, '$1 '))
    .filter(Boolean);
  // Cabeçalho: "TREINO A", "Nº | SÉRIE | REPETIÇÃO" (sem números) ou só o nome do dia ("Segunda")
  // (a linha de cabeçalho não tem "3 12" nem "3x12": isso seria um exercício como "Agachamento 4 séries de 10")
  const cabecalho = l => /TREINO/i.test(l)
    || (/S[ÉE]RI|REPETI/i.test(l) && !/\d\s*[xX×]?\s*\d/.test(l) && !/s[ée]ries?\s+de/i.test(l))
    || (diaEscrito(l) !== null && l.split(' ').length <= 2);
  // Linha da tabela: começa pelo número da linha (1 a 30); linha vazia da tabela tem só o número
  const numerada = l => l.match(/^\W{0,2}(\d{1,2})[).:]?(?:\s+(.*))?$/);
  const tabela = limpas.filter(l => { const m = numerada(l); return m && +m[1] <= 30 && LETRAS.test(m[2] || ''); }).length >= 3;
  let ultimoNum = 0;
  // Com 2 ou mais cabeçalhos legíveis, eles é que separam os treinos (a numeração serve só de reserva)
  const temCabecalhos = limpas.filter(cabecalho).length >= 2;

  const treinos = [];
  let atual = null;
  const novo = () => { atual = { exercicios: [] }; treinos.push(atual); };
  for (const l of limpas) {
    if (cabecalho(l)) {
      // "TREINO A", "Nº | SÉRIE | REPETIÇÃO" ou "Segunda": começa outro treino (se o atual já tem exercícios)
      const dia = diaEscrito(l);
      if (!atual || atual.exercicios.length) novo();
      if (dia !== null) atual.diaFicha = dia;
      continue;
    }
    let resto = l;
    if (tabela) {
      const m = numerada(l);
      if (!m || +m[1] > 30) {
        // Número da linha ilegível ("Pa Cadeira adutora 3 12"): só vale se tiver séries e repetições
        const ex = interpretarLinha(semLixoNoInicio(l), true);
        if (ex && ex.reps && !ex.duvida && /\d\s+\d|\d\s*[xX×]/.test(l)) { if (!atual) novo(); atual.exercicios.push(ex); }
        continue; // título da academia, nome da pessoa etc.
      }
      // Numeração voltou ao 1 sem cabeçalho legível: começou outro treino.
      // (depois do 10 não conta: o leitor às vezes lê "11" como "1")
      const n = +m[1];
      const recomecou = !temCabecalhos && n === 1 && ultimoNum >= 2 && ultimoNum !== 10 && atual?.exercicios.length;
      ultimoNum = n;
      if (recomecou) novo();
      resto = semLixoNoInicio(m[2] || '');
    }
    const ex = interpretarLinha(resto, tabela);
    if (!ex) continue;
    if (!atual) novo();
    atual.exercicios.push(ex);
  }
  // Repetição que não deu para ler (ex.: "3 *"): usa a mais comum da ficha e marca para conferir
  const contagem = {};
  treinos.forEach(t => t.exercicios.forEach(e => { if (e.reps && !e.duvida) contagem[e.reps] = (contagem[e.reps] || 0) + 1; }));
  const comum = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]?.[0] || '12';
  treinos.forEach(t => t.exercicios.forEach(e => { if (e.duvida && !e.reps) e.reps = comum; }));
  // Treinos vazios (o "TREINO D" em branco) saem; os nomes seguem a ordem da ficha (A, B, C…),
  // porque a letra lida às vezes vem trocada
  const cheios = treinos.filter(t => t.exercicios.length);
  cheios.forEach((t, i) => { t.titulo = `Treino ${String.fromCharCode(65 + i)}`; });
  return cheios;
}

// Tira o lixo que a borda da tabela deixa antes do nome ("Ê *", "oo", "Ss"): palavra de até 2 letras ou só símbolos
function semLixoNoInicio(texto) {
  const partes = texto.split(' ');
  while (partes.length > 1 && /^[^\p{L}\p{N}]*\p{L}{0,2}[^\p{L}\p{N}]*$/u.test(partes[0])) partes.shift();
  return partes.join(' ');
}

// "Segunda", "terça-feira", "SÁBADO" → número do dia (0 = domingo); null se não tiver dia escrito
const NOMES_DIAS = [/domingo/i, /segunda/i, /ter[çc]a/i, /quarta/i, /quinta/i, /sexta/i, /s[áa]bado/i];
function diaEscrito(l) {
  const i = NOMES_DIAS.findIndex(r => r.test(l));
  return i < 0 ? null : i;
}

function interpretarLinha(texto, tabela) {
  let resto = ` ${texto} `;
  let reps = '', series = null, duvida = false;
  // Tempo: "30min", "30 mim", "45s", "1h", com as séries antes ou não ("3x30s")
  const tempo = resto.match(/\s(?:(\d{1,2})\s*[xX×]\s*)?(\d{1,3})\s*(min|mim|mn|minutos?|s|seg|segundos?|h|horas?)(?!\p{L})/iu);
  if (tempo) {
    const unidade = /^m/i.test(tempo[3]) ? 'min' : /^h/i.test(tempo[3]) ? 'h' : 's';
    reps = `${tempo[2]} ${unidade}`;
    if (tempo[1]) series = +tempo[1];
    resto = resto.replace(tempo[0], ' ');
  }
  resto = resto.trim();
  let m;
  if ((m = resto.match(/^(.*?)\s+(\d{1,2})\s*[xX×]\s*(\d{1,3}(?:\s*[-/a]\s*\d{1,3})*)\s*(?:reps?|repeti\S*)?$/))
    || (m = resto.match(/^(.*?)\s+(\d{1,2})\s*s[ée]ries?\s*(?:de)?\s*(\d{1,3}(?:\s*[-/a]\s*\d{1,3})*)\s*(?:reps?|repeti\S*)?$/i))
    || (tabela && (m = resto.match(/^(.*?)\s+(\d{1,2})\s+(\d{1,3}(?:\s*[-/]\s*\d{1,3})*)$/)))) {
    resto = m[1]; series = +m[2]; reps = m[3].replace(/\s+/g, '').replace(/a/g, '-');
  } else if (tabela && !reps && (m = resto.match(/^(.*?)\s+(\d{1,2})(?:\s+\S{1,3})?$/)) && +m[2] <= 10 && LETRAS.test(m[1])) {
    // A série foi lida, a repetição veio ilegível: fica para conferir
    resto = m[1]; series = +m[2]; duvida = !reps;
  }
  const nome = resto.replace(/[^\p{L}\p{N}+°ºª().,/ -]/gu, ' ').replace(/\s+/g, ' ').replace(/^[\s.,-]+|[\s.,-]+$/g, '');
  if (!LETRAS.test(nome)) return null;
  if (!tabela && !series && !reps) return null; // fora de tabela, só linha com séries ou tempo vira exercício
  return {
    nome: (nome.charAt(0).toUpperCase() + nome.slice(1)).slice(0, 60),
    series: Math.min(20, Math.max(1, series || 1)),
    reps: reps.slice(0, 12),
    duvida,
  };
}
