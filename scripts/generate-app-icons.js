const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const root = path.resolve(__dirname, "..");
const out = (...parts) => path.join(root, ...parts);

const hex = (value) => {
  const n = Number.parseInt(value.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const smooth = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

function blend(data, i, rgb, alpha) {
  const a = clamp(alpha);
  const inv = 1 - a;
  data[i] = Math.round(rgb[0] * a + data[i] * inv);
  data[i + 1] = Math.round(rgb[1] * a + data[i + 1] * inv);
  data[i + 2] = Math.round(rgb[2] * a + data[i + 2] * inv);
  data[i + 3] = 255;
}

function lineDistance(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const c = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy));
  const x = ax + vx * c;
  const y = ay + vy * c;
  return Math.hypot(px - x, py - y);
}

function drawLine(png, ax, ay, bx, by, width, color, opacity = 1) {
  const rgb = hex(color);
  const pad = width + 3;
  const minX = Math.max(0, Math.floor(Math.min(ax, bx) - pad));
  const maxX = Math.min(png.width - 1, Math.ceil(Math.max(ax, bx) + pad));
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - pad));
  const maxY = Math.min(png.height - 1, Math.ceil(Math.max(ay, by) + pad));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = lineDistance(x + 0.5, y + 0.5, ax, ay, bx, by) - width / 2;
      const a = (1 - smooth(-1.1, 1.1, d)) * opacity;
      if (a > 0) blend(png.data, (y * png.width + x) * 4, rgb, a);
    }
  }
}

function drawCircle(png, cx, cy, radius, color, opacity = 1, stroke = 0) {
  const rgb = hex(color);
  const minX = Math.max(0, Math.floor(cx - radius - stroke - 3));
  const maxX = Math.min(png.width - 1, Math.ceil(cx + radius + stroke + 3));
  const minY = Math.max(0, Math.floor(cy - radius - stroke - 3));
  const maxY = Math.min(png.height - 1, Math.ceil(cy + radius + stroke + 3));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const edge = stroke ? Math.abs(d - radius) - stroke / 2 : d - radius;
      const a = (1 - smooth(-1.1, 1.1, edge)) * opacity;
      if (a > 0) blend(png.data, (y * png.width + x) * 4, rgb, a);
    }
  }
}

function drawIcon(size, variant = "full") {
  const png = new PNG({ width: size, height: size });
  const bgA = hex(variant === "mono" ? "#F8FAFC" : "#06101F");
  const bgB = hex(variant === "mono" ? "#EAF0F7" : "#10283A");
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const gx = x / size;
      const gy = y / size;
      const col = mix(bgA, bgB, clamp(gy * 0.76 + gx * 0.24));
      png.data[i] = col[0];
      png.data[i + 1] = col[1];
      png.data[i + 2] = col[2];
      png.data[i + 3] = 255;
    }
  }

  const line = variant === "mono" ? "#172033" : "#E6F0FF";
  const muted = variant === "mono" ? "#59677A" : "#86A3C5";
  const blue = variant === "mono" ? "#172033" : "#2F6BFF";
  const mint = variant === "mono" ? "#172033" : "#27D6B6";

  drawCircle(png, cx, cy, size * 0.286, muted, 0.34, size * 0.018);
  drawCircle(png, cx, cy, size * 0.198, line, 0.88, size * 0.024);
  drawCircle(png, cx, cy, size * 0.078, blue, 1);

  const w = size * 0.034;
  const q = size * 0.178;
  const o = size * 0.304;
  drawLine(png, cx - o, cy - o, cx - q, cy - o, w, mint);
  drawLine(png, cx - o, cy - o, cx - o, cy - q, w, mint);
  drawLine(png, cx + o, cy - o, cx + q, cy - o, w, mint);
  drawLine(png, cx + o, cy - o, cx + o, cy - q, w, mint);
  drawLine(png, cx - o, cy + o, cx - q, cy + o, w, mint);
  drawLine(png, cx - o, cy + o, cx - o, cy + q, w, mint);
  drawLine(png, cx + o, cy + o, cx + q, cy + o, w, mint);
  drawLine(png, cx + o, cy + o, cx + o, cy + q, w, mint);

  const markW = size * 0.052;
  drawLine(png, cx - size * 0.292, cy + size * 0.178, cx - size * 0.292, cy - size * 0.178, markW, line, 0.96);
  drawLine(png, cx - size * 0.292, cy - size * 0.178, cx - size * 0.128, cy + size * 0.018, markW, line, 0.96);
  drawLine(png, cx - size * 0.128, cy + size * 0.018, cx + size * 0.018, cy - size * 0.178, markW, line, 0.96);
  drawLine(png, cx + size * 0.106, cy + size * 0.178, cx + size * 0.106, cy - size * 0.178, markW, blue, 0.98);
  drawLine(png, cx + size * 0.106, cy, cx + size * 0.306, cy - size * 0.178, markW, blue, 0.98);
  drawLine(png, cx + size * 0.106, cy, cx + size * 0.306, cy + size * 0.178, markW, blue, 0.98);

  drawLine(png, cx - size * 0.34, cy, cx - size * 0.14, cy, size * 0.014, muted, 0.72);
  drawLine(png, cx + size * 0.14, cy, cx + size * 0.34, cy, size * 0.014, muted, 0.72);
  drawLine(png, cx, cy - size * 0.34, cx, cy - size * 0.14, size * 0.014, muted, 0.72);
  drawLine(png, cx, cy + size * 0.14, cx, cy + size * 0.34, size * 0.014, muted, 0.72);

  if (variant === "maskable") {
    drawCircle(png, cx, cy, size * 0.42, "#07172A", 0.18, size * 0.012);
  }

  return png;
}

function write(file, png) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

write(out("assets", "images", "icon.png"), drawIcon(1024));
write(out("assets", "images", "favicon.png"), drawIcon(256));
write(out("public", "favicon.png"), drawIcon(256));
write(out("public", "icon-192.png"), drawIcon(192));
write(out("public", "icon-512.png"), drawIcon(512));
write(out("assets", "images", "android-icon-foreground.png"), drawIcon(1024, "maskable"));
write(out("assets", "images", "android-icon-background.png"), drawIcon(1024, "maskable"));
write(out("assets", "images", "android-icon-monochrome.png"), drawIcon(1024, "mono"));
write(out("assets", "icon.png"), drawIcon(1024));
write(out("assets", "favicon.png"), drawIcon(256));
write(out("assets", "android-icon-foreground.png"), drawIcon(1024, "maskable"));
write(out("assets", "android-icon-background.png"), drawIcon(1024, "maskable"));
write(out("assets", "android-icon-monochrome.png"), drawIcon(1024, "mono"));

console.log("Generated MyKit app icons.");
