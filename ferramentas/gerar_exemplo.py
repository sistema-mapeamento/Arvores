# Gera ferramentas/exemplo-historico.json: árvores INVENTADAS, só para ver o mapa no computador (ver-local.js).
# Uso: python ferramentas/gerar_exemplo.py
import json, random, os
from datetime import datetime, timedelta
raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(raiz, 'server/data/cercas-usiminas.geojson'), encoding='utf-8-sig'))
areas = [f for f in d['features'] if f['properties'].get('tipo') != 'planta']
random.seed(7)
def centro(f):
    ring = f['geometry']['coordinates'][0]
    return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
escolhidas = random.sample(areas, 30)
riscos = [1] * 18 + [2] * 14 + [3] * 9 + [4] * 4
random.shuffle(riscos)
alvos = ['Vias e estacionamentos', 'Escritório e posto de trabalho', 'Áreas abertas e vegetadas', 'Rede elétrica e subestação', 'Restaurante, vestiário e vivência', 'Ferrovia e área de manobra']
comp = ['Árvore inteira', 'Galho / forquilha', 'Tronco', 'Parte da copa', 'Raiz']
esp = ['Eucalipto', 'Mangueira', 'Ipê', 'Oiti', 'Sibipiruna', 'Flamboyant', 'Fícus']
tipos = ['Pessoas', 'Instalação / estrutura fixa alcançável', 'Veículo / equipamento / bem móvel']
hoje = datetime(2026, 11, 12, 8, 0)
cab = ['ID da árvore', 'Unidade / setor / localização', 'Espécie', 'Componente avaliado', 'Local / alvo exposto', 'Tipo de alvo', 'Situação dos controles', 'Data e hora da inspeção', 'Geometria, alcance e ocupação', 'R registrado', 'Fotos']
linhas = [cab]
for i, r in enumerate(riscos):
    lon, lat = centro(escolhidas[i % len(escolhidas)])
    lon += random.uniform(-0.0006, 0.0006); lat += random.uniform(-0.0005, 0.0005)
    quando = hoje - timedelta(days=random.randint(0, 85), hours=random.randint(0, 9))
    alvo = random.choice(alvos)
    geo = '' if i in (5, 33) else f'Coordenadas da árvore (latitude, longitude): {lat:.6f}; {lon:.6f}'
    linhas.append([f'ARV-0{101+i:03d}', alvo, random.choice(esp), random.choice(comp), alvo, random.choice(tipos), 'Exposição inicial', quando.strftime('%d/%m/%Y %H:%M'), geo, f'R{r}', ';'.join(f'/exemplo-fotos/arvore-{n}.jpg' for n in random.sample(range(1, 13), random.choice([1, 1, 2, 2, 3, 3])))])
# 3 reavaliações (mesma árvore, data mais nova) para mostrar o histórico na ficha
for i in (2, 9, 17):
    l = list(linhas[i + 1]); l[10] = f'/exemplo-fotos/arvore-{(i % 12) + 1}.jpg'; l[7] = (hoje - timedelta(days=1, hours=i)).strftime('%d/%m/%Y %H:%M'); l[9] = f'R{max(1, int(l[9][1]) - 1)}'
    linhas.append(l)
json.dump({'table': linhas, 'updatedAt': hoje.isoformat(), 'googleBaseAvailable': False, 'exemplo': True},
          open(os.path.join(raiz, 'ferramentas/exemplo-historico.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('ok', len(linhas) - 1, 'linhas')
