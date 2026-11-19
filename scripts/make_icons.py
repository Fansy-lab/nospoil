"""Render the NoSpoil icon (slashed eye on a purple rounded square) as PNGs, no dependencies."""
import math
import struct
import sys
import zlib

BG = (91, 63, 214)
FG = (255, 255, 255)
SS = 4  # supersampling factor


def sample(x, y):
    """Return RGBA for a point in the unit square."""
    # rounded-square background
    r = 0.22
    cx = min(max(x, r), 1 - r)
    cy = min(max(y, r), 1 - r)
    if math.hypot(x - cx, y - cy) > r:
        return (0, 0, 0, 0)
    color = BG
    # eye: intersection of two circles
    R, d = 0.42, 0.22
    if math.hypot(x - 0.5, y - (0.5 + d)) < R and math.hypot(x - 0.5, y - (0.5 - d)) < R:
        color = FG
        if math.hypot(x - 0.5, y - 0.5) < 0.115:
            color = BG
    # slash
    ax, ay, bx, by = 0.23, 0.80, 0.77, 0.20
    t = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)
    t = min(max(t, 0), 1)
    dist = math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)))
    if dist < 0.04:
        color = FG
    elif dist < 0.085:
        color = BG
    return (*color, 255)


def render(size):
    rows = []
    for py in range(size):
        row = bytearray([0])  # filter type: none
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    r, g, b, a = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size)
                    acc[0] += r * a
                    acc[1] += g * a
                    acc[2] += b * a
                    acc[3] += a
            if acc[3]:
                row += bytes([round(acc[0] / acc[3]), round(acc[1] / acc[3]), round(acc[2] / acc[3]), round(acc[3] / (SS * SS))])
            else:
                row += bytes(4)
        rows.append(bytes(row))
    return b"".join(rows)


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def write_png(path, size):
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(render(size), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


out_dir = sys.argv[1]
for s in (16, 32, 48, 128):
    write_png(f"{out_dir}/icon-{s}.png", s)
    print("wrote", s)
