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

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function drawPolygon(png, points, color, opacity = 1) {
  const rgb = hex(color);
  const minX = Math.max(0, Math.floor(Math.min(...points.map(([x]) => x)) - 2));
  const maxX = Math.min(png.width - 1, Math.ceil(Math.max(...points.map(([x]) => x)) + 2));
  const minY = Math.max(0, Math.floor(Math.min(...points.map(([, y]) => y)) - 2));
  const maxY = Math.min(png.height - 1, Math.ceil(Math.max(...points.map(([, y]) => y)) + 2));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!pointInPolygon(x + 0.5, y + 0.5, points)) continue;
      blend(png.data, (y * png.width + x) * 4, rgb, opacity);
    }
  }
}

function drawIcon(size, variant = "full") {
  const png = new PNG({ width: size, height: size });
  const bgA = hex(variant === "mono" ? "#F8FAFC" : "#07111E");
  const bgB = hex(variant === "mono" ? "#EAF0F7" : "#142B3B");
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

  const ink = variant === "mono" ? "#172033" : "#DDEAFF";
  const panel = variant === "mono" ? "#FFFFFF" : "#0D2233";
  const panelEdge = variant === "mono" ? "#172033" : "#21445F";
  const blue = variant === "mono" ? "#172033" : "#2F6BFF";
  const mint = variant === "mono" ? "#172033" : "#26D6B8";
  const amber = variant === "mono" ? "#172033" : "#FFB84D";

  drawCircle(png, cx, cy, size * 0.34, "#020812", 0.22);
  drawLine(png, cx - size * 0.3, cy - size * 0.2, cx - size * 0.12, cy - size * 0.09, size * 0.026, mint, 0.82);
  drawLine(png, cx + size * 0.3, cy - size * 0.2, cx + size * 0.12, cy - size * 0.09, size * 0.026, blue, 0.82);
  drawLine(png, cx, cy + size * 0.33, cx, cy + size * 0.14, size * 0.026, amber, 0.82);

  const hexOuter = [
    [cx, cy - size * 0.285],
    [cx + size * 0.247, cy - size * 0.142],
    [cx + size * 0.247, cy + size * 0.142],
    [cx, cy + size * 0.285],
    [cx - size * 0.247, cy + size * 0.142],
    [cx - size * 0.247, cy - size * 0.142],
  ];
  const hexInner = [
    [cx, cy - size * 0.225],
    [cx + size * 0.195, cy - size * 0.112],
    [cx + size * 0.195, cy + size * 0.112],
    [cx, cy + size * 0.225],
    [cx - size * 0.195, cy + size * 0.112],
    [cx - size * 0.195, cy - size * 0.112],
  ];
  drawPolygon(png, hexOuter, panelEdge, 1);
  drawPolygon(png, hexInner, panel, 1);

  drawRoundRect(png, cx - size * 0.118, cy - size * 0.178, size * 0.236, size * 0.356, size * 0.04, ink, 1);
  drawRoundRect(png, cx - size * 0.078, cy - size * 0.138, size * 0.156, size * 0.276, size * 0.03, panel, 1);
  drawLine(png, cx - size * 0.055, cy - size * 0.07, cx + size * 0.055, cy - size * 0.07, size * 0.018, mint, 1);
  drawLine(png, cx - size * 0.055, cy, cx + size * 0.055, cy, size * 0.018, blue, 1);
  drawLine(png, cx - size * 0.055, cy + size * 0.07, cx + size * 0.055, cy + size * 0.07, size * 0.018, amber, 1);

  drawCircle(png, cx - size * 0.34, cy - size * 0.22, size * 0.074, mint, 1);
  drawCircle(png, cx + size * 0.34, cy - size * 0.22, size * 0.074, blue, 1);
  drawCircle(png, cx, cy + size * 0.38, size * 0.074, amber, 1);
  drawCircle(png, cx, cy, size * 0.052, "#F7FBFF", variant === "mono" ? 0 : 1);

  if (variant === "maskable") {
    drawCircle(png, cx, cy, size * 0.43, "#07172A", 0.12);
  }

  return png;
}

function write(file, png) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

write(out("assets", "images", "icon.png"), drawIcon(1024));
write(out("assets", "images", "favicon.png"), drawIcon(256));
write(out("assets", "images", "splash-icon.png"), drawIcon(1024));
write(out("public", "favicon.png"), drawIcon(256));
write(out("public", "icon-192.png"), drawIcon(192));
write(out("public", "icon-512.png"), drawIcon(512));
write(out("assets", "images", "android-icon-foreground.png"), drawIcon(1024, "maskable"));
write(out("assets", "images", "android-icon-background.png"), drawIcon(1024, "maskable"));
write(out("assets", "images", "android-icon-monochrome.png"), drawIcon(1024, "mono"));
write(out("assets", "icon.png"), drawIcon(1024));
write(out("assets", "favicon.png"), drawIcon(256));
write(out("assets", "splash-icon.png"), drawIcon(1024));
write(out("assets", "android-icon-foreground.png"), drawIcon(1024, "maskable"));
write(out("assets", "android-icon-background.png"), drawIcon(1024, "maskable"));
write(out("assets", "android-icon-monochrome.png"), drawIcon(1024, "mono"));

console.log("Generated MyKit app icons.");
