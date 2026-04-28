"""
把应用里的 CoaseMark（src/components/Icons.tsx 里那个 SVG）渲染成多尺寸 favicon.ico。
matplotlib 用 PathPatch 精确画 cubic Bezier，PIL 打包多尺寸 ICO。

形状定义 = CoaseMark：
- circle cx=12 cy=12 r=9
- 上眉 M8.5 9.5 c1.1,-1.4 2.3,-2 3.5,-2 1.6,0 3,0.9 4,2.5
- 下眉 M15.5 14.5 c-1.1,1.4 -2.3,2 -3.5,2 -1.6,0 -3,-0.9 -4,-2.5
- 左下折线 M10.2 8.2 L8 11 L10.2 13.8
- 右上折线 M13.8 15.8 L16 13 L13.8 10.2

输出：site/assets/favicon.ico  (16/32/48)
     site/assets/favicon.svg  (现代浏览器优先用)
"""

from __future__ import annotations

import io
from pathlib import Path as FsPath

import matplotlib.pyplot as plt
from matplotlib.patches import Circle, PathPatch
from matplotlib.path import Path as MplPath
from PIL import Image

# 24x24 viewBox 下的 CoaseMark 路径段
UPPER_BROW = [
    (8.5, 9.5),                           # MOVETO
    (9.6, 8.1), (10.8, 7.5), (12.0, 7.5), # CURVE4 (cp1, cp2, end)
    (13.6, 7.5), (15.0, 8.4), (16.0, 10), # CURVE4
]
UPPER_BROW_CODES = [
    MplPath.MOVETO,
    MplPath.CURVE4, MplPath.CURVE4, MplPath.CURVE4,
    MplPath.CURVE4, MplPath.CURVE4, MplPath.CURVE4,
]
LOWER_BROW = [
    (15.5, 14.5),
    (14.4, 15.9), (13.2, 16.5), (12.0, 16.5),
    (10.4, 16.5), (9.0, 15.6), (8.0, 14.0),
]
LOWER_BROW_CODES = UPPER_BROW_CODES  # 同结构
LEFT_ARROW = [(10.2, 8.2), (8.0, 11.0), (10.2, 13.8)]
LEFT_ARROW_CODES = [MplPath.MOVETO, MplPath.LINETO, MplPath.LINETO]
RIGHT_ARROW = [(13.8, 15.8), (16.0, 13.0), (13.8, 10.2)]
RIGHT_ARROW_CODES = LEFT_ARROW_CODES


def render_png(size_px: int) -> Image.Image:
    """渲染指定像素尺寸的方形 PNG（黑色描边、透明背景）。"""
    dpi = 100
    fig_in = size_px / dpi
    fig, ax = plt.subplots(figsize=(fig_in, fig_in), dpi=dpi)
    ax.set_xlim(0, 24)
    ax.set_ylim(24, 0)  # 翻转 y 轴对齐 SVG 坐标系
    ax.set_aspect('equal')
    ax.axis('off')
    fig.subplots_adjust(left=0, right=1, top=1, bottom=0)

    # SVG stroke-width=1.4（在 24-unit viewBox 里）。matplotlib linewidth 用 points，
    # 但只要保持各 patch 一致，相对粗细就稳。1.4 单位换算到 points：
    # 在 size_px 像素的画布上，1 unit = (size_px / 24) px = (size_px/24) / dpi inch = 那么 points 是 inch * 72。
    # 简化：直接给一个相对值——视觉上 stroke ≈ 直径的 5.8%。
    # 用 size_px / 24 * 1.4 px → 转 points = (size_px/24*1.4) / dpi * 72
    lw_px = size_px / 24 * 1.4
    lw_pt = lw_px / dpi * 72

    common = dict(
        edgecolor='black',
        facecolor='none',
        linewidth=lw_pt,
        capstyle='round',
        joinstyle='round',
    )

    ax.add_patch(Circle((12, 12), 9, **common))
    ax.add_patch(PathPatch(MplPath(UPPER_BROW, UPPER_BROW_CODES), **common))
    ax.add_patch(PathPatch(MplPath(LOWER_BROW, LOWER_BROW_CODES), **common))
    ax.add_patch(PathPatch(MplPath(LEFT_ARROW, LEFT_ARROW_CODES), **common))
    ax.add_patch(PathPatch(MplPath(RIGHT_ARROW, RIGHT_ARROW_CODES), **common))

    buf = io.BytesIO()
    fig.savefig(buf, format='png', transparent=True, dpi=dpi)
    plt.close(fig)
    buf.seek(0)
    return Image.open(buf).convert('RGBA')


def main() -> None:
    repo_root = FsPath(__file__).resolve().parents[1]
    assets = repo_root / 'site' / 'assets'
    assets.mkdir(parents=True, exist_ok=True)

    # 高分辨率源图，PIL 自己缩放到目标尺寸更好看
    src = render_png(256)

    ico_path = assets / 'favicon.ico'
    src.save(
        ico_path,
        format='ICO',
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
    )
    print(f'wrote {ico_path}')

    # SVG 版（现代浏览器会优先用它，矢量永不糊）
    svg_path = assets / 'favicon.svg'
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
        'stroke="#0a0a0a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">\n'
        '  <circle cx="12" cy="12" r="9"/>\n'
        '  <path d="M8.5 9.5c1.1-1.4 2.3-2 3.5-2 1.6 0 3 .9 4 2.5"/>\n'
        '  <path d="M15.5 14.5c-1.1 1.4-2.3 2-3.5 2-1.6 0-3-.9-4-2.5"/>\n'
        '  <path d="M10.2 8.2 8 11l2.2 2.8"/>\n'
        '  <path d="M13.8 15.8 16 13l-2.2-2.8"/>\n'
        '</svg>\n'
    )
    svg_path.write_text(svg, encoding='utf-8')
    print(f'wrote {svg_path}')


if __name__ == '__main__':
    main()
