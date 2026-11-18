/* Testes do "ler ficha pela foto" (só a parte de entender o texto; não precisa do simulador).
   ficha-exemplos.json tem o que o leitor (Tesseract) devolveu de uma ficha de academia de verdade,
   sem o nome da aluna e do personal: um print do celular e uma foto com sombra forte.
   Rodar: npm run ficha */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { interpretarFicha } from '../js/ficha-leitura.js';

const { print: PRINT, fotoComSombra: FOTO_COM_SOMBRA } = JSON.parse(readFileSync(new URL('./ficha-exemplos.json', import.meta.url), 'utf8'));
const resumo = treinos => treinos.map(t => `${t.titulo}:${t.exercicios.length}`).join(' ');
const acha = (treinos, nome) => treinos.flatMap(t => t.exercicios).find(e => e.nome === nome);

describe('Ficha em tabela', () => {
  it('separa os 3 treinos e ignora o treino D vazio', () => {
    assert.equal(resumo(interpretarFicha(PRINT)), 'Treino A:11 Treino B:10 Treino C:12');
  });
  it('lê nome, séries e repetições', () => {
    const t = interpretarFicha(PRINT);
    assert.deepEqual(acha(t, 'Leg 45'), { nome: 'Leg 45', series: 3, reps: '12', duvida: false });
    assert.deepEqual(acha(t, 'Crucifixo banco inclinado'), { nome: 'Crucifixo banco inclinado', series: 3, reps: '12', duvida: false });
    assert.equal(acha(t, 'Alongamentos').reps, '');
  });
  it('aeróbico vira exercício de tempo', () => {
    assert.equal(interpretarFicha(PRINT)[2].exercicios.at(-1).reps, '30 min');
  });
  it('sem nenhum cabeçalho legível, separa pela numeração que recomeça', () => {
    const semCabecalho = PRINT.filter(l => !/TREINO|S[ÉE]RIE|REPETI/i.test(l));
    assert.equal(resumo(interpretarFicha(semCabecalho)), 'Treino A:11 Treino B:10 Treino C:12');
  });
  it('foto com sombra: aproveita as linhas legíveis e não inventa treino', () => {
    const t = interpretarFicha(FOTO_COM_SOMBRA);
    assert.equal(t.length, 3);
    const todos = t.flatMap(x => x.exercicios);
    assert.ok(todos.length >= 25, `leu só ${todos.length} exercícios`);
    assert.ok(todos.every(e => e.series >= 1 && e.series <= 20));
  });
});

describe('Ficha escrita em linhas', () => {
  const t = interpretarFicha(['TREINO A - Segunda', 'Supino reto 3x12', 'Crucifixo 3 x 10-12', 'Esteira 20 min', 'Prancha 3x30s',
    'Quarta', 'Agachamento 4 séries de 10', 'Leg press 45 4x12', 'Abdominal 3x15 reps', 'Academia Fit', 'Rua das Flores 123']);
  it('entende os formatos comuns', () => {
    assert.deepEqual(t.map(x => x.exercicios.map(e => `${e.nome} ${e.series}x${e.reps}`)), [
      ['Supino reto 3x12', 'Crucifixo 3x10-12', 'Esteira 1x20 min', 'Prancha 3x30 s'],
      ['Agachamento 4x10', 'Leg press 45 4x12', 'Abdominal 3x15'],
    ]);
  });
  it('usa o dia escrito na ficha', () => {
    assert.deepEqual(t.map(x => x.diaFicha), [1, 3]);
  });
  it('texto sem exercício não vira treino', () => {
    assert.deepEqual(interpretarFicha(['Academia Fit', 'Telefone 3333-4444', 'Bom treino!']), []);
  });
});
