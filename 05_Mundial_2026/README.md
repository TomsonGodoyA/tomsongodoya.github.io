# Polla Mundial 2026 · Las Compas FC

Dashboard estático para la polla mundialera entre 5 amigos. Tabla de posiciones,
perfiles tipo carta FIFA, próximos partidos y gráfico de evolución. Sin backend:
todo se calcula en el navegador a partir de archivos JSON.

## Estructura

```
polla/
├── index.html              ← la página
├── css/styles.css          ← estilos
├── js/app.js               ← motor (puntuación + render)
├── data/
│   ├── participantes.json   ← perfiles, reseñas y skills (se edita rara vez)
│   ├── pronosticos.json     ← picks de los 5 (se genera una vez al inicio)
│   └── resultados.json      ← EL ARCHIVO QUE EDITAS A DIARIO
└── img/                    ← fotos y banner
```

## Reglas de puntuación (fase de grupos · sistema avanzado)

- **4 puntos** por marcador exacto.
- **2 puntos** por acertar el ganador o empate.
- **+1 punto extra** si además aciertas la diferencia de goles (ej. pronosticaste 3-1 y quedó 2-0).
- **0 puntos** por fallar el ganador.
- Desempate en la tabla: cantidad de marcadores exactos.

El "ganador" lo calcula la app sola a partir de los goles. Tú nunca escribes "Empate".

## Tu rutina diaria: cargar resultados

1. Abre `data/resultados.json`.
2. Busca el partido terminado por su `id` (M01, M02, …).
3. Cambia los dos `null` por los goles reales:
   ```json
   { "id": "M01", ... "golesLocal": 2, "golesVisitante": 0 }
   ```
4. Actualiza la fecha de arriba: `"actualizado": "2026-06-12"`.
5. Guarda y haz commit + push (o edítalo directo en github.com).

GitHub Pages se actualiza solo en 1-2 minutos.

## Cargar los pronósticos de los amigos

Cuando los 5 manden sus Excel completos, se convierten a `pronosticos.json`
(mismo formato: cada participante con sus picks por `id` de partido). Pídeselo a
Claude o edítalo a mano en Sublime.

## Publicar en GitHub Pages

1. Crea un repo y sube esta carpeta.
2. Settings → Pages → Source: rama `main`, carpeta `/root`.
3. Tu sitio queda en `https://TU-USUARIO.github.io/TU-REPO/`.

## Verlo en tu computador antes de subir

Como la página carga JSON, necesita un servidor (no sirve abrir el archivo directo):

```bash
cd polla
python3 -m http.server 8000
# abre http://localhost:8000
```

## Futuro: fase de eliminación directa (Fase 2)

El sistema ya está preparado. `resultados.json` trae `"fase": "grupos"`. Para las
eliminatorias se añadirá a cada partido un campo `"clasifica"` y la regla del punto
extra por acertar quién pasa de ronda, sin tocar lo ya construido.
