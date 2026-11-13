# Avaliação de Árvores

Sistema de campo para avaliar o risco de queda de árvores (Usiminas Ipatinga), pela Norma Corporativa de Criticidade, Poda e Supressão de Árvores (matrizes do item 6: F × E → J, J × C → R).

- `dist/` – o site: mapa (tela principal) e formulário de avaliação (`avaliar/`).
- `supabase/migrations/` – estrutura do banco (rodar no SQL Editor do Supabase).
- `ferramentas/ver-local.js` – ver no computador: `node ferramentas/ver-local.js` e abrir http://localhost:8790 (dados reais do banco; para exemplo use /?exemplo).
- `verify.cjs` – confere as 64 combinações da norma: `node verify.cjs`.

Fotos de exemplo: Wikimedia Commons (fontes em `dist/exemplo/fotos/FONTES.txt`).
