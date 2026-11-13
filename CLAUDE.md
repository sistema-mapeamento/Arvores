# Avaliação de Árvores

Sistema de avaliação de risco de queda de árvores (Usiminas Ipatinga), recebido de um colega (v34) em 12/11/2026 para o Warlison continuar.

- Regras do cofre valem aqui: ler `C:\Users\PC\Desktop\TRABALHO\SEGUNDO CEREBRO - IDE\CLAUDE.md` e `0 - Regras e Histórico\Agora.md`.
- Análise e portfólios: cofre, `2 - Projetos\SGE\Departamentos\10 - Apresentações\Relatórios\2026-11-12 ... Arvores ...`.
- Ver no computador: `node ferramentas/ver-local.js` -> http://localhost:8790 (usa o histórico de EXEMPLO `ferramentas/exemplo-historico.json`, gerado por `ferramentas/gerar_exemplo.py`).
- Rotas: `/` = mapa (tela principal), `/avaliar` = formulário, `/mapa` = mapa.
- `original-v34/` = arquivos do colega antes das mudanças (para comparar).
- Ainda NÃO publicado. A hospedagem atual é do colega (OpenAI + Google Forms/Planilha).
- **Contas deste projeto (decidido 12/11/2026), nunca as do Grupo GPS nem do SGE:**
  - Banco de dados: Supabase projeto `vzukefbkvkkvkfijuduu` (ligado pelo `.mcp.json` desta pasta).
  - Fotos: Google Drive (pasta por árvore: `Fotos/ARV-.../AAAA-MM-DD_R?_fotoN.jpg`). Conta Google: a definir.
- Os testes `server/verify.mjs` e `verify-two-steps.cjs` ainda conferem a tela antiga do mapa; ajustar antes de publicar.
- Nunca gravar senhas, chaves ou .env aqui.
