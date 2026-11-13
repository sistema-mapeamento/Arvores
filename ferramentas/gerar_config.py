# Gera dist/config.js a partir do .env (só o endereço do banco e a chave PÚBLICA).
# Uso: python ferramentas/gerar_config.py
import os, json, base64, sys
raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
for linha in open(os.path.join(raiz, '.env'), encoding='utf-8'):
    linha = linha.strip()
    if linha and not linha.startswith('#') and '=' in linha:
        k, v = linha.split('=', 1); env[k.strip()] = v.strip()
url, chave = env.get('SUPABASE_URL', ''), env.get('SUPABASE_ANON_KEY', '')
if not url.startswith('https://') or not url.endswith('.supabase.co'):
    sys.exit('SUPABASE_URL inválido no .env')
if chave.startswith('sb_secret_'):
    sys.exit('PARE: a chave no .env é SECRETA. Use a chave pública (anon / publishable).')
if chave.count('.') == 2:
    corpo = chave.split('.')[1]; corpo += '=' * (-len(corpo) % 4)
    if json.loads(base64.urlsafe_b64decode(corpo)).get('role') != 'anon':
        sys.exit('PARE: a chave no .env não é a pública (anon).')
elif not chave.startswith('sb_publishable_'):
    sys.exit('SUPABASE_ANON_KEY em formato desconhecido.')
conteudo = ('// Gerado por ferramentas/gerar_config.py a partir do .env. Só dados públicos.\n'
            'window.ARVORES_CONFIG = ' + json.dumps({'supabaseUrl': url, 'supabaseAnonKey': chave}) + ';\n')
open(os.path.join(raiz, 'dist', 'config.js'), 'w', encoding='utf-8').write(conteudo)
print('ok: dist/config.js')
