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

function drawRoundRect(png, x, y, width, height, radius, color, opacity = 1) {
  const rgb = hex(color);
  const maxX = Math.min(png.width - 1, Math.ceil(x + width + 3));
  const maxY = Math.min(png.height - 1, Math.ceil(y + height + 3));
  const minX = Math.max(0, Math.floor(x - 3));
  const minY = Math.max(0, Math.floor(y - 3));
  const cx = x + width / 2;
  const cy = y + height / 2;
  const hx = width / 2 - radius;
  const hy = height / 2 - radius;

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const qx = Math.abs(px + 0.5 - cx) - hx;
      const qy = Math.abs(py + 0.5 - cy) - hy;
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const inside = Math.min(Math.max(qx, qy), 0);
      const d = outside + inside - radius;
      const a = (1 - smooth(-1.1, 1.1, d)) * opacity;
      if (a > 0) blend(png.data, (py * png.width + px) * 4, rgb, a);
    }
  }
}

function drawIcon(size, variant = "full") {
  const png = new PNG({ width: size, height: size });
  const bgA = hex(variant === "mono" ? "#F8FAFC" : "#08111C");
  const bgB = hex(variant === "mono" ? "#EAF0F7" : "#14382F");
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

  const ink = variant === "mono" ? "#172033" : "#102033";
  const paper = variant === "mono" ? "#FFFFFF" : "#F4F8FF";
  const blue = variant === "mono" ? "#172033" : "#2F6BFF";
  const mint = variant === "mono" ? "#172033" : "#24D6B8";
  const lime = variant === "mono" ? "#172033" : "#B8F35C";

  drawRoundRect(png, size * 0.165, size * 0.19, size * 0.67, size * 0.64, size * 0.13, "#020812", 0.24);
  drawRoundRect(png, size * 0.18, size * 0.17, size * 0.64, size * 0.64, size * 0.13, paper, 1);
  drawRoundRect(png, size * 0.22, size * 0.21, size * 0.56, size * 0.56, size * 0.105, "#DCE8F8", 0.36);

  drawRoundRect(png, size * 0.19, size * 0.12, size * 0.19, size * 0.19, size * 0.045, mint, 1);
  drawRoundRect(png, size * 0.62, size * 0.12, size * 0.19, size * 0.19, size * 0.045, blue, 1);
  drawRoundRect(png, size * 0.62, size * 0.69, size * 0.19, size * 0.19, size * 0.045, lime, 1);

  const markW = size * 0.074;
  drawLine(png, cx - size * 0.245, cy + size * 0.205, cx - size * 0.245, cy - size * 0.17, markW, ink, 1);
  drawLine(png, cx - size * 0.245, cy - size * 0.17, cx - size * 0.02, cy + size * 0.065, markW, ink, 1);
  drawLine(png, cx - size * 0.02, cy + size * 0.065, cx + size * 0.205, cy - size * 0.17, markW, ink, 1);
  drawLine(png, cx + size * 0.205, cy - size * 0.17, cx + size * 0.205, cy + size * 0.205, markW, ink, 1);

  drawRoundRect(png, cx - size * 0.055, cy - size * 0.055, size * 0.11, size * 0.11, size * 0.03, blue, 1);
  drawCircle(png, cx + size * 0.275, cy - size * 0.225, size * 0.035, mint, 1);
  drawCircle(png, cx - size * 0.285, cy + size * 0.245, size * 0.035, blue, 1);

  if (variant === "maskable") {
    drawRoundRect(png, size * 0.11, size * 0.11, size * 0.78, size * 0.78, size * 0.17, "#07172A", 0.1);
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
