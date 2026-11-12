/* =========================================================
   Testes das regras de segurança do Firestore
   Rodam num simulador do Firebase (nada toca no banco de verdade).
   Para rodar: abra a pasta "testes" no terminal e digite  npm test

   Personagens:
     ana   → quem treina (atleta)
     beto  → acompanha a Ana (conexão aceita)
     caio  → estranho, sem conexão com ninguém
     novo  → conta criada, e-mail ainda NÃO confirmado
   ========================================================= */

import { readFileSync } from 'node:fs';
import { describe, it, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, addDoc, query, where, serverTimestamp, deleteField,
} from 'firebase/firestore';

let env;
const ANA = 'ana', BETO = 'beto', CAIO = 'caio', NOVO = 'novo';
const CON = `${ANA}_${BETO}`;

// Banco de cada pessoa, logada e com e-mail confirmado (ou não)
const banco = (uid, verificado = true) =>
  env.authenticatedContext(uid, { email: `${uid}@teste.com`, email_verified: verificado }).firestore();
const anonimo = () => env.unauthenticatedContext().firestore();

const perfil = (nome, codigo) => ({ nome, email: `${nome}@teste.com`, codigo, metaPeso: null, criadoEm: new Date() });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-treino-junto',
    firestore: { rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env?.cleanup(); });

// Antes de cada teste: banco limpo com a Ana, o Beto acompanhando (treinos e check-ins liberados, peso não) e o Caio
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', ANA), perfil('Ana', 'FIT-AAAA'));
    await setDoc(doc(db, 'users', BETO), perfil('Beto', 'FIT-BBBB'));
    await setDoc(doc(db, 'users', CAIO), perfil('Caio', 'FIT-CCCC'));
    await setDoc(doc(db, 'codigos', 'FIT-AAAA'), { uid: ANA });
    await setDoc(doc(db, 'codigos', 'FIT-BBBB'), { uid: BETO });
    await setDoc(doc(db, 'conexoes', CON), {
      atleta: ANA, viewer: BETO, codigo: 'FIT-AAAA', atletaNome: 'Ana', viewerNome: 'Beto', status: 'aceita',
      perm: { treinos: true, checkins: true, peso: false }, criadoEm: new Date(),
    });
    await setDoc(doc(db, 'users', ANA, 'plano', '1'), { titulo: 'Treino A', exercicios: [{ id: 'e1', nome: 'Agachamento' }] });
    await setDoc(doc(db, 'users', ANA, 'registros', '2026-11-10'), { feitos: ['e1'] });
    await setDoc(doc(db, 'users', ANA, 'checkins', 'ck1'), { data: '2026-11-10', hora: '18:00', legenda: '', temFoto: true, criadoEm: new Date(), reacoes: {} });
    await setDoc(doc(db, 'users', ANA, 'fotos', 'ck1'), { img: 'data:image/jpeg;base64,AAAA' });
    await setDoc(doc(db, 'users', ANA, 'pesos', '2026-11-10'), { kg: 70, criadoEm: new Date() });
    await setDoc(doc(db, 'users', ANA, 'medidas', '2026-11-10'), { cintura: 80, criadoEm: new Date() });
    await setDoc(doc(db, 'users', ANA, 'fotosProgresso', '2026-11-10'), { img: 'data:image/jpeg;base64,AAAA' });
  });
});

describe('Login e e-mail confirmado', () => {
  it('sem login não lê nada', async () => {
    await assertFails(getDoc(doc(anonimo(), 'users', ANA, 'plano', '1')));
  });
  it('conta sem e-mail confirmado consegue criar o próprio perfil (cadastro)', async () => {
    const db = banco(NOVO, false);
    await assertSucceeds(setDoc(doc(db, 'codigos', 'FIT-NNNN'), { uid: NOVO }));
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'codigos', 'FIT-NNNN'), { uid: NOVO }));
    await assertSucceeds(setDoc(doc(db, 'users', NOVO), perfil('Novo', 'FIT-NNNN')));
  });
  it('conta sem e-mail confirmado não usa o resto do app', async () => {
    const db = banco(NOVO, false);
    await assertFails(setDoc(doc(db, 'users', NOVO, 'plano', '1'), { titulo: 'x', exercicios: [] }));
    await assertFails(addDoc(collection(db, 'sugestoes'), { uid: NOVO, nome: 'n', email: 'e', tipo: 'ideia', texto: 'oi', versao: '1', criadoEm: serverTimestamp() }));
  });
});

describe('Dados próprios', () => {
  it('a Ana lê e altera o próprio plano', async () => {
    const db = banco(ANA);
    await assertSucceeds(getDoc(doc(db, 'users', ANA, 'plano', '1')));
    await assertSucceeds(setDoc(doc(db, 'users', ANA, 'plano', '2'), { titulo: 'B', exercicios: [], desde: '2026-11-12' }));
  });
  it('ninguém muda o próprio código de conexão', async () => {
    await assertFails(updateDoc(doc(banco(ANA), 'users', ANA), { codigo: 'FIT-ZZZZ' }));
  });
  it('peso fora da faixa é recusado', async () => {
    await assertFails(setDoc(doc(banco(ANA), 'users', ANA, 'pesos', '2026-11-11'), { kg: 500, criadoEm: serverTimestamp() }));
  });
});

describe('Quem acompanha só vê o que foi liberado', () => {
  it('o Beto vê treinos e check-ins (liberados)', async () => {
    const db = banco(BETO);
    await assertSucceeds(getDoc(doc(db, 'users', ANA, 'plano', '1')));
    await assertSucceeds(getDoc(doc(db, 'users', ANA, 'registros', '2026-11-10')));
    await assertSucceeds(getDoc(doc(db, 'users', ANA, 'checkins', 'ck1')));
    await assertSucceeds(getDoc(doc(db, 'users', ANA, 'fotos', 'ck1')));
  });
  it('o Beto não vê o peso (não liberado)', async () => {
    await assertFails(getDoc(doc(banco(BETO), 'users', ANA, 'pesos', '2026-11-10')));
  });
  it('o Beto passa a ver o peso quando a Ana libera', async () => {
    await assertSucceeds(updateDoc(doc(banco(ANA), 'conexoes', CON), { perm: { treinos: true, checkins: true, peso: true } }));
    await assertSucceeds(getDoc(doc(banco(BETO), 'users', ANA, 'pesos', '2026-11-10')));
  });
  it('medidas e fotos de antes e depois nunca aparecem para quem acompanha', async () => {
    const db = banco(BETO);
    await assertFails(getDoc(doc(db, 'users', ANA, 'medidas', '2026-11-10')));
    await assertFails(getDoc(doc(db, 'users', ANA, 'fotosProgresso', '2026-11-10')));
  });
  it('o perfil da Ana (e-mail, meta) não aparece para o Beto', async () => {
    await assertFails(getDoc(doc(banco(BETO), 'users', ANA)));
  });
  it('o Beto não altera nada da Ana', async () => {
    await assertFails(setDoc(doc(banco(BETO), 'users', ANA, 'plano', '1'), { titulo: 'hack', exercicios: [] }));
  });
  it('o Caio (estranho) não vê nada da Ana', async () => {
    const db = banco(CAIO);
    await assertFails(getDoc(doc(db, 'users', ANA, 'plano', '1')));
    await assertFails(getDoc(doc(db, 'users', ANA, 'checkins', 'ck1')));
    await assertFails(getDoc(doc(db, 'conexoes', CON)));
  });
  it('pedido ainda pendente não libera nada', async () => {
    await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'conexoes', CON), { status: 'pendente' }));
    await assertFails(getDoc(doc(banco(BETO), 'users', ANA, 'plano', '1')));
  });
});

describe('Pedidos de conexão', () => {
  it('o Caio pede para acompanhar a Ana com o código certo', async () => {
    await assertSucceeds(setDoc(doc(banco(CAIO), 'conexoes', `${ANA}_${CAIO}`), {
      atleta: ANA, viewer: CAIO, codigo: 'FIT-AAAA', atletaNome: '', viewerNome: 'Caio', status: 'pendente',
      perm: { treinos: true, checkins: true, peso: false }, criadoEm: serverTimestamp(),
    }));
  });
  it('não dá para pedir com o código de outra pessoa', async () => {
    await assertFails(setDoc(doc(banco(CAIO), 'conexoes', `${ANA}_${CAIO}`), {
      atleta: ANA, viewer: CAIO, codigo: 'FIT-BBBB', atletaNome: '', viewerNome: 'Caio', status: 'pendente',
      perm: { treinos: true, checkins: true, peso: false }, criadoEm: serverTimestamp(),
    }));
  });
  it('não dá para criar o pedido já aceito', async () => {
    await assertFails(setDoc(doc(banco(CAIO), 'conexoes', `${ANA}_${CAIO}`), {
      atleta: ANA, viewer: CAIO, codigo: 'FIT-AAAA', atletaNome: '', viewerNome: 'Caio', status: 'aceita',
      perm: { treinos: true, checkins: true, peso: true }, criadoEm: serverTimestamp(),
    }));
  });
  it('quem acompanha não muda as próprias permissões', async () => {
    await assertFails(updateDoc(doc(banco(BETO), 'conexoes', CON), { perm: { treinos: true, checkins: true, peso: true } }));
  });
  it('quem acompanha só atualiza o próprio nome', async () => {
    await assertSucceeds(updateDoc(doc(banco(BETO), 'conexoes', CON), { viewerNome: 'Beto S.' }));
    await assertFails(updateDoc(doc(banco(BETO), 'conexoes', CON), { atletaNome: 'Outra' }));
  });
  it('qualquer um dos dois desfaz a conexão', async () => {
    await assertSucceeds(deleteDoc(doc(banco(BETO), 'conexoes', CON)));
  });
});

describe('Reações e meta do casal', () => {
  it('o Beto reage com um emoji permitido', async () => {
    await assertSucceeds(updateDoc(doc(banco(BETO), 'users', ANA, 'checkins', 'ck1'), { [`reacoes.${BETO}`]: '💪' }));
  });
  it('emoji fora da lista é recusado', async () => {
    await assertFails(updateDoc(doc(banco(BETO), 'users', ANA, 'checkins', 'ck1'), { [`reacoes.${BETO}`]: '💩' }));
  });
  it('o Beto não mexe na reação de outra pessoa nem na legenda', async () => {
    await assertFails(updateDoc(doc(banco(BETO), 'users', ANA, 'checkins', 'ck1'), { [`reacoes.${CAIO}`]: '💪' }));
    await assertFails(updateDoc(doc(banco(BETO), 'users', ANA, 'checkins', 'ck1'), { legenda: 'hack' }));
  });
  it('o Beto tira a própria reação', async () => {
    const db = banco(BETO);
    await assertSucceeds(updateDoc(doc(db, 'users', ANA, 'checkins', 'ck1'), { [`reacoes.${BETO}`]: '🔥' }));
    await assertSucceeds(updateDoc(doc(db, 'users', ANA, 'checkins', 'ck1'), { [`reacoes.${BETO}`]: deleteField() }));
  });
  it('os dois combinam a meta do mês; meta absurda é recusada', async () => {
    const meta = { mes: '2026-11', treinos: 16, recompensa: 'Jantar', batida: false };
    await assertSucceeds(updateDoc(doc(banco(BETO), 'conexoes', CON), { meta }));
    await assertSucceeds(updateDoc(doc(banco(ANA), 'conexoes', CON), { meta: { ...meta, batida: true } }));
    await assertFails(updateDoc(doc(banco(BETO), 'conexoes', CON), { meta: { ...meta, treinos: 99 } }));
  });
});

describe('Recados (chat removido)', () => {
  it('ninguém cria recado novo', async () => {
    await assertFails(addDoc(collection(banco(BETO), 'conexoes', CON, 'mensagens'), { de: BETO, texto: 'oi', criadoEm: serverTimestamp() }));
  });
});

describe('Registro de erros', () => {
  const erro = uid => ({ uid, mensagem: 'TypeError: x is undefined', detalhe: 'app.js:10', tela: 'hoje', versao: '1', aparelho: 'teste', criadoEm: serverTimestamp() });
  it('grava erro em nome próprio, mas ninguém lê pelo app', async () => {
    const db = banco(ANA);
    await assertSucceeds(addDoc(collection(db, 'erros'), erro(ANA)));
    await assertFails(getDocs(collection(db, 'erros')));
  });
  it('não grava erro em nome de outra pessoa nem sem login', async () => {
    await assertFails(addDoc(collection(banco(ANA), 'erros'), erro(BETO)));
    await assertFails(addDoc(collection(anonimo(), 'erros'), erro(ANA)));
  });
});

describe('Sugestões, aparelhos e apagar conta', () => {
  it('sugestão: envia em nome próprio, mas ninguém lê pelo app', async () => {
    const db = banco(ANA);
    await assertSucceeds(addDoc(collection(db, 'sugestoes'), { uid: ANA, nome: 'Ana', email: 'a', tipo: 'ideia', texto: 'Mais modelos', versao: '1', criadoEm: serverTimestamp() }));
    await assertFails(addDoc(collection(db, 'sugestoes'), { uid: BETO, nome: 'x', email: 'x', tipo: 'ideia', texto: 'fingindo', versao: '1', criadoEm: serverTimestamp() }));
    await assertFails(getDocs(collection(db, 'sugestoes')));
  });
  it('cada um só cadastra e vê o próprio aparelho', async () => {
    await assertSucceeds(setDoc(doc(banco(ANA), 'dispositivos', 'tok1'), { uid: ANA, atualizadoEm: serverTimestamp() }));
    await assertFails(setDoc(doc(banco(CAIO), 'dispositivos', 'tok2'), { uid: ANA, atualizadoEm: serverTimestamp() }));
    await assertFails(getDocs(query(collection(banco(CAIO), 'dispositivos'), where('uid', '==', ANA))));
  });
  it('a Ana apaga o próprio perfil e código; o Caio não apaga os dela', async () => {
    await assertFails(deleteDoc(doc(banco(CAIO), 'users', ANA)));
    await assertFails(deleteDoc(doc(banco(CAIO), 'codigos', 'FIT-AAAA')));
    await assertSucceeds(deleteDoc(doc(banco(ANA), 'codigos', 'FIT-AAAA')));
    await assertSucceeds(deleteDoc(doc(banco(ANA), 'users', ANA)));
  });
});
