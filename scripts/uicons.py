"""Genera src/ds/atoms/Icon/uicons.ts desde las fuentes oficiales de Flaticon UIcons.

Uso (una vez, solo al agregar o cambiar íconos):
  git clone --depth 1 https://github.com/freepik-company/flaticon-uicons /tmp/uicons
  python3 scripts/uicons.py /tmp/uicons

Saca el contorno de cada glifo de las fuentes Regular Rounded y Bold Rounded
y lo deja como un path en una grilla de 24. Así el app no carga la fuente
entera (miles de íconos), solo los que usa.

Licencia: gratis con atribución ("Uicons by Flaticon"), que está al pie de Ajustes.
"""
import re
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

# Nombre en el app (API pública del componente Icon) → nombre en UIcons.
MAP = {
    'home': 'home',
    'list': 'list',
    'pie': 'chart-pie',
    'wallet': 'wallet',
    'plus': 'plus-small',
    'close': 'cross-small',
    'chevDown': 'angle-small-down',
    'chevUp': 'angle-small-up',
    'chevRight': 'angle-small-right',
    'chevLeft': 'angle-small-left',
    'search': 'search',
    'arrowRight': 'arrow-right',
    'arrowUpRight': 'arrow-up-right',
    'dots': 'menu-dots',
    'check': 'check',
    'trash': 'trash',
    'back': 'angle-left',
    'calendar': 'calendar',
    'refresh': 'refresh',
    'repeat': 'arrows-repeat',
    'pencil': 'pencil',
    'camera': 'camera',
    'grid': 'apps',
    'house': 'home',
    'cards': 'credit-card',
    'chart': 'chart-line-up',
    'plusCircle': 'add',
    'sliders': 'settings-sliders',
    'user': 'user',
    'gear': 'settings',
    'bell': 'bell',
    'logout': 'sign-out-alt',
    'sparkle': 'sparkles',
    'arrowUp': 'arrow-up',
    'deltaUp': 'arrow-small-up',
    'deltaDown': 'arrow-small-down',
    'spinner': 'spinner',
}

STYLES = {'regular': ('rr', 'regular'), 'bold': ('br', 'bold')}


def fmt(m):
    v = round(float(m.group(0)), 2)
    return ('%g' % v) if v != int(v) else str(int(v))


def extract(root: Path, style: str):
    prefix, folder = STYLES[style]
    css = (root / f'src/uicons/css/{folder}/rounded.css').read_text()
    font = TTFont(root / f'src/uicons/webfonts/uicons-{folder}-rounded.woff')
    upm = font['head'].unitsPerEm
    asc = font['hhea'].ascent
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    s = 24 / upm
    out = {}
    for name, ui in MAP.items():
        m = re.search(r'\.fi-%s-%s:before\s*\{\s*content:\s*"\\([0-9a-f]+)"' % (prefix, re.escape(ui)), css)
        if not m:
            sys.exit(f'No existe fi-{prefix}-{ui}')
        pen = SVGPathPen(glyphs)
        # y hacia abajo y escala a 24 px
        glyphs[cmap[int(m.group(1), 16)]].draw(TransformPen(pen, (s, 0, 0, -s, 0, asc * s)))
        out[name] = re.sub(r'-?\d+(?:\.\d+)?', fmt, pen.getCommands())
    return out


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/uicons')
    reg, bold = extract(root, 'regular'), extract(root, 'bold')
    lines = [
        '// Generado por scripts/uicons.py desde Flaticon UIcons (Regular y Bold Rounded). No editar a mano.',
        '// Licencia: gratis con atribución. El crédito "Uicons by Flaticon" está al pie de Ajustes.',
        '',
        'export const UICON: Record<string, string> = {',
        *[f'  {k}: {MAP[k]!r},' for k in MAP],
        '};',
        '',
        'export const regular: Record<string, string> = {',
        *[f"  {k}: '{v}'," for k, v in reg.items()],
        '};',
        '',
        'export const bold: Record<string, string> = {',
        *[f"  {k}: '{v}'," for k, v in bold.items()],
        '};',
        '',
    ]
    dest = Path(__file__).resolve().parent.parent / 'src/ds/atoms/Icon/uicons.ts'
    dest.write_text('\n'.join(lines))
    print(f'{len(MAP)} íconos → {dest}')


if __name__ == '__main__':
    main()
