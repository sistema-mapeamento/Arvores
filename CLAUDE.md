# Avaliação de Árvores

Sistema de avaliação de risco de queda de árvores (Usiminas Ipatinga), recebido de um colega (v34) em 12/11/2026 para o Warlison continuar.

- Regras do cofre valem aqui: ler `C:\Users\PC\Desktop\TRABALHO\SEGUNDO CEREBRO - IDE\CLAUDE.md` e `0 - Regras e Histórico\Agora.md`.
- Análise e portfólios: cofre, `2 - Projetos\SGE\Departamentos\10 - Apresentações\Relatórios\2026-11-12 ... Arvores ...`.
- Ver no computador: `node ferramentas/ver-local.js` -> http://localhost:8790 (banco real) ou http://localhost:8790/?exemplo (dados de exemplo em `dist/exemplo/`).
- Site = pasta `dist/`, publicada pelo GitHub Actions no GitHub Pages (repo público sistema-mapeamento/Arvores). `dist/index.html` = mapa; `dist/avaliar/` = formulário. Caminhos relativos.
- Sistema ABERTO (decisão 12/11): todos veem e registram sem login. Gravação só pela função `registrar_inspecao` (SQL 02). `dist/config.js` vem do `.env` por `ferramentas/gerar_config.py` (só chave pública).
- `server/` e `integration/` = sistema antigo do colega (Worker/Google Forms), não usados mais.
- `original-v34/` = arquivos do colega antes das mudanças (para comparar).
- Publicado: https://sistema-mapeamento.github.io/Arvores/ (GitHub Actions publica dist/ a cada envio).
- **Contas deste projeto (decidido 12/11/2026), nunca as do Grupo GPS nem do SGE:**
  - Banco de dados: Supabase projeto `vzukefbkvkkvkfijuduu` (ligado pelo `.mcp.json` desta pasta).
  - Fotos: Supabase Storage, bucket público `fotos` (`<árvore>/<avaliação>/fotoN.jpg` + `fotoN_mini.jpg`), SQL 03. Plano grátis: 1 GB. Dono pode trocar para Google Drive depois.
- Os testes `server/verify.mjs` e `verify-two-steps.cjs` ainda conferem a tela antiga do mapa; ajustar antes de publicar.
- Nunca gravar senhas, chaves ou .env aqui.
