#!/usr/bin/env python3
"""生成 tabBar 线描图标（81×81，4x 超采样抗锯齿）。

用法：python3 scripts/gen-tab-icons.py
输出：miniprogram/assets/tab/{home,wordbook,library,progress,settings}[-active].png
若本机没有 Pillow，可单独运行 `node scripts/gen-wordbook-icon.mjs` 生成生词本图标（无需第三方依赖）。
配色与 app.json tabBar 一致：普通态 #7A7168、选中态 #17283B，透明背景。
"""
import os
from PIL import Image, ImageDraw

S = 4  # 超采样倍数
SIZE = 81 * S
W = 22  # 线宽（超采样坐标）
NORMAL = (0x7A, 0x71, 0x68, 255)
ACTIVE = (0x17, 0x28, 0x3B, 255)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'miniprogram', 'assets', 'tab')


def stroke(d, pts, color, w=W):
    """圆头折线：line + 两端圆帽。"""
    d.line(pts, fill=color, width=w, joint='curve')
    r = w / 2
    for p in (pts[0], pts[-1]):
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=color)


def dot(d, cx, cy, r, color):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)


def draw_home(d, c):
    stroke(d, [(52, 196), (162, 86), (272, 196)], c)              # 屋顶
    stroke(d, [(88, 166), (88, 268), (236, 268), (236, 166)], c)  # 屋体
    stroke(d, [(138, 268), (138, 214), (186, 214), (186, 268)], c)  # 门


def draw_library(d, c):
    stroke(d, [(162, 112), (162, 252)], c)                       # 书脊
    stroke(d, [(162, 112), (78, 90), (78, 232), (162, 252)], c)   # 左页
    stroke(d, [(162, 112), (246, 90), (246, 232), (162, 252)], c)  # 右页


def draw_progress(d, c):
    for x, y in [(66, 192), (142, 142), (218, 86)]:               # 三根上升柱
        d.rounded_rectangle([x, y, x + 40, 262], radius=16, fill=c)
    stroke(d, [(46, 272), (278, 272)], c)                         # 基线


def draw_settings(d, c):
    for y, dx in [(104, 112), (162, 212), (220, 142)]:            # 滑块
        stroke(d, [(62, y), (262, y)], c)
        dot(d, dx, y, 32, c)


def draw_wordbook(d, c):
    """书签形状：生词本 tab（与 gen-wordbook-icon.mjs 使用同一组线段）。"""
    stroke(d, [(86, 76), (86, 268), (162, 214), (238, 268), (238, 76)])  # 书签轮廓
    stroke(d, [(86, 76), (238, 76)])                                      # 顶边
    stroke(d, [(86, 146), (238, 146)])                                     # 内横线


ICONS = {'home': draw_home, 'wordbook': draw_wordbook, 'library': draw_library,
         'progress': draw_progress, 'settings': draw_settings}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in ICONS.items():
        for suffix, color in (('', NORMAL), ('-active', ACTIVE)):
            img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
            fn(ImageDraw.Draw(img), color)
            img.resize((81, 81), Image.LANCZOS).save(os.path.join(OUT, f'{name}{suffix}.png'))
            print(f'{name}{suffix}.png')


if __name__ == '__main__':
    main()
