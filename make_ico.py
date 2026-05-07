"""
Genera el isotype de CurvaBarro y lo exporta como:
  public/isotype.png  (512x512, fondo transparente)
  public/favicon.ico  (16/32/48/64/128/256 px)

Si existe public/logo.png (el PNG completo del logotipo), extrae
automáticamente el isotipo del lado izquierdo.
Si no existe, genera uno vectorial equivalente.
"""

from PIL import Image, ImageDraw
import math, os, sys

OUT_DIR = os.path.join(os.path.dirname(__file__), "public")
LOGO_PATH = os.path.join(OUT_DIR, "logo.png")
ICO_PATH  = os.path.join(OUT_DIR, "favicon.ico")
ISO_PATH  = os.path.join(OUT_DIR, "isotype.png")

SIZE = 512   # canvas del isotipo
PAD  = 44    # padding interior


# ── Helpers Bezier ─────────────────────────────────────────────────────────

def cbez(p0, p1, p2, p3, n=400):
    """Puntos de una curva Bezier cúbica."""
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u**3*p0[0] + 3*u**2*t*p1[0] + 3*u*t**2*p2[0] + t**3*p3[0]
        y = u**3*p0[1] + 3*u**2*t*p1[1] + 3*u*t**2*p2[1] + t**3*p3[1]
        pts.append((round(x), round(y)))
    return pts

def s_curve(from_x, to_x, y_top, y_mid, y_bot):
    """Curva en S: empieza en from_x, pasa por to_x en el medio, vuelve a from_x."""
    span_y = y_bot - y_top
    ctrl   = span_y * 0.38
    upper = cbez(
        (from_x, y_top),
        (from_x, y_top + ctrl),
        (to_x,   y_mid - ctrl),
        (to_x,   y_mid),
    )
    lower = cbez(
        (to_x,   y_mid),
        (to_x,   y_mid + ctrl),
        (from_x, y_bot - ctrl),
        (from_x, y_bot),
    )
    return upper + lower[1:]

def draw_thick(draw, pts, color, width):
    """Trazo grueso con casquetes redondeados."""
    flat = [c for p in pts for c in p]
    if len(pts) >= 2:
        draw.line(flat, fill=color, width=width, joint="curve")
    r = width // 2
    for p in (pts[0], pts[-1]):
        draw.ellipse([p[0]-r, p[1]-r, p[0]+r, p[1]+r], fill=color)


# ── Genera el isotipo vectorial ────────────────────────────────────────────

def generate_isotype() -> Image.Image:
    img  = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cy = SIZE // 2
    # Las dos S comparten aproximadamente el mismo centro horizontal,
    # pero se abren hacia lados opuestos.
    left_from  = int(SIZE * 0.565)   # arranque/llegada de la S izquierda
    left_to    = int(SIZE * 0.135)   # punto más a la izquierda en el medio
    right_from = int(SIZE * 0.435)   # arranque/llegada de la S derecha
    right_to   = int(SIZE * 0.865)   # punto más a la derecha en el medio

    left_pts  = s_curve(left_from,  left_to,  PAD, cy, SIZE - PAD)
    right_pts = s_curve(right_from, right_to, PAD, cy, SIZE - PAD)

    so = int(SIZE * 0.136)   # grosor exterior del trazo
    si = int(SIZE * 0.066)   # grosor interior (hueco)

    BLACK = (0, 0, 0, 255)
    CLEAR = (0, 0, 0, 0)

    # Orden de capas para el entrelazado (left sobre right):
    # 1. right negro
    draw_thick(draw, right_pts, BLACK, so)
    # 2. left negro
    draw_thick(draw, left_pts,  BLACK, so)
    # 3. right hueco (transparent) — queda parcialmente encima del left en el cruce
    draw_thick(draw, right_pts, CLEAR, si)
    # 4. left hueco
    draw_thick(draw, left_pts,  CLEAR, si)

    return img


# ── Extrae isotipo del logo si existe ─────────────────────────────────────

def extract_from_logo() -> Image.Image | None:
    if not os.path.exists(LOGO_PATH):
        return None
    logo = Image.open(LOGO_PATH).convert("RGBA")
    w, h = logo.size
    # Convierte a escala de grises para detectar píxeles oscuros
    gray = logo.convert("L")
    import numpy as np
    arr = np.array(gray)
    dark = arr < 128   # True donde hay contenido oscuro

    # Busca la columna vacía más a la izquierda entre x=w*0.18 y x=w*0.45
    # que separa el isotipo del texto
    split_x = None
    for x in range(int(w * 0.18), int(w * 0.48)):
        if not dark[:, x].any():
            # Busca columna vacía durante al menos 10px seguidos
            run = 0
            for xx in range(x, min(x + 40, w)):
                if not dark[:, xx].any():
                    run += 1
                else:
                    break
            if run >= 8:
                split_x = x + run // 2
                break

    if split_x is None:
        split_x = int(w * 0.26)   # fallback al 26 % del ancho

    # Recorta el isotipo (con algo de margen) y lo cuadra
    iso = logo.crop((0, 0, split_x, h))
    # Trim: bounding box del contenido oscuro
    rows = np.where(dark[:, :split_x].any(axis=1))[0]
    cols = np.where(dark[:, :split_x].any(axis=0))[0]
    if len(rows) == 0 or len(cols) == 0:
        return None
    margin = int(h * 0.06)
    top  = max(0, rows[0]  - margin)
    bot  = min(h, rows[-1] + margin)
    left = max(0, cols[0]  - margin)
    right = min(split_x, cols[-1] + margin)

    iso = logo.crop((left, top, right, bot))
    # Cuadrar
    side = max(iso.size)
    sq   = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(iso, ((side - iso.width) // 2, (side - iso.height) // 2))

    # Hacer fondo blanco → transparente
    data = np.array(sq)
    r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]
    white_mask = (r > 230) & (g > 230) & (b > 230) & (a > 128)
    data[white_mask, 3] = 0
    return Image.fromarray(data)


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    import sys
    sys.stdout.reconfigure(encoding='utf-8')

    print("Generando isotipo CurvaBarro...")

    iso = extract_from_logo()
    if iso is not None:
        print("  OK Isotipo extraido del logo original")
    else:
        iso = generate_isotype()
        print("  OK Isotipo generado vectorialmente")

    # Guarda PNG 512x512
    iso.save(ISO_PATH, "PNG")
    print(f"  -> {ISO_PATH}")

    # Crea ICO con múltiples resoluciones
    ico_sizes = [256, 128, 64, 48, 32, 16]
    frames = [iso.resize((s, s), Image.LANCZOS) for s in ico_sizes]

    # PIL necesita fondo blanco para ICO si no soporta alpha completo
    def to_rgb(im, size):
        bg = Image.new("RGBA", (size, size), (255, 255, 255, 255))
        bg.paste(im, mask=im.split()[3] if im.mode == "RGBA" else None)
        return bg.convert("RGB")

    ico_frames = [to_rgb(f, s) for f, s in zip(frames, ico_sizes)]
    ico_frames[0].save(
        ICO_PATH,
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_frames[1:],
    )
    print(f"  -> {ICO_PATH}  ({', '.join(str(s) for s in ico_sizes)} px)")
    print("Listo!")


if __name__ == "__main__":
    main()
