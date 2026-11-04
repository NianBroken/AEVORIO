import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// 图像尺寸、生成数目和板卡面积统一在此集中管理。
const IMAGE_WIDTH = 920;
const IMAGE_HEIGHT = 680;
const HERO_WIDTH = 1920;
const HERO_HEIGHT = 1100;
const PRODUCT_IMAGE_COUNT = 45;
const EDITORIAL_IMAGE_NAMES = new Set([
  "home-hero.png",
  "home-engineering.png",
  "home-workbench.png",
  "home-testbench.png",
  "about-research.png",
  "about-assembly.png",
  "about-precision.png",
]);

interface MediaEntry {
  resourceKey: string;
  fileName: string;
}

const rootDirectory = path.resolve(__dirname, "..");
const schemaPath = path.join(rootDirectory, "database/default.sql");
const mediaDirectory = path.join(rootDirectory, "storage/media");

async function main(): Promise<void> {
  const schema = await readFile(schemaPath, "utf8");
  const entries = [
    ...schema.matchAll(/\('media-[^']+',\s*'([^']+)',\s*'([^']+\.png)'/gu),
  ].map((match) => {
    const resourceKey = match[1];
    const fileName = match[2];
    if (!resourceKey || !fileName)
      throw new Error("媒体清单有一项没有提供有效名称。");
    return { resourceKey, fileName } satisfies MediaEntry;
  });
  const productEntries = entries.filter(({ resourceKey }) =>
    resourceKey.startsWith("product-"),
  );
  const knownNames = new Set(entries.map(({ fileName }) => fileName));

  if (
    productEntries.length !== PRODUCT_IMAGE_COUNT ||
    entries.length !== 52 ||
    knownNames.size !== entries.length
  ) {
    throw new Error(
      "媒体清单校验失败：数据库必须配置七张工程图和四十五张不同的产品图。",
    );
  }

  await mkdir(mediaDirectory, { recursive: true });

  for (const entry of entries) {
    const output = path.join(mediaDirectory, path.basename(entry.fileName));
    try {
      const svg = EDITORIAL_IMAGE_NAMES.has(entry.fileName)
        ? makeEditorialArtwork(entry)
        : makeProductArtwork(entry);
      await sharp(Buffer.from(svg))
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toFile(output);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "未知图像生成错误。";
      throw new Error(`生成 ${entry.fileName} 时失败：${reason}`, {
        cause: error,
      });
    }
  }

  console.log(
    `已生成 ${productEntries.length} 张独立产品位图和 ${entries.length - productEntries.length} 张工程图片。`,
  );
}

function makeProductArtwork(entry: MediaEntry): string {
  const hash = createHash("sha256").update(entry.fileName).digest();
  const seed = hash.readUInt32BE(0);
  const width = randomIn(seed, 525, 730);
  const height = randomIn(seed ^ 0xa56b42, 315, 455);
  const left = Math.round((IMAGE_WIDTH - width) / 2);
  const top = Math.round((IMAGE_HEIGHT - height) / 2);
  const palette = boardPalette(seed);
  const category = boardCategory(entry.resourceKey);

  const components =
    category === "wireless"
      ? wirelessParts(seed, left, top, width, height)
      : category === "power"
        ? powerParts(seed, left, top, width, height)
        : category === "network"
          ? networkParts(seed, left, top, width, height)
          : category === "sensing"
            ? sensingParts(seed, left, top, width, height)
            : category === "motion"
              ? motionParts(seed, left, top, width, height)
              : category === "expansion"
                ? expansionParts(seed, left, top, width, height)
                : category === "lab"
                  ? labParts(seed, left, top, width, height)
                  : controlParts(seed, left, top, width, height);

  return wrapSvg(
    IMAGE_WIDTH,
    IMAGE_HEIGHT,
    `<defs>
    <linearGradient id="surface" x2="1" y2="1"><stop stop-color="#e8eeea"/><stop offset="1" stop-color="#dce5df"/></linearGradient>
    <linearGradient id="board" x2=".83" y2="1"><stop stop-color="${palette.boardLight}"/><stop offset=".55" stop-color="${palette.board}"/><stop offset="1" stop-color="${palette.boardDark}"/></linearGradient>
    <linearGradient id="silk" x2=".1" y2="1"><stop stop-color="#f3eed9"/><stop offset="1" stop-color="#bdcfb5"/></linearGradient>
    <filter id="shadow" x="-.4" y="-.5" width="1.8" height="2"><feGaussianBlur stdDeviation="15"/></filter>
    <pattern id="desk" width="38" height="38" patternUnits="userSpaceOnUse"><circle cx="19" cy="19" r="1" fill="#60746a" opacity=".12"/></pattern>
  </defs>
  <rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" rx="36" fill="url(#surface)"/>
  <rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" rx="36" fill="url(#desk)"/>
  <ellipse cx="${IMAGE_WIDTH / 2}" cy="${IMAGE_HEIGHT / 2 + 46}" rx="${width * 0.66}" ry="${height * 0.54}" fill="#52635d" opacity=".2" filter="url(#shadow)"/>
    <g stroke-linejoin="round" stroke-linecap="round">
    ${boardOutline(seed, left, top, width, height)}
    ${copperTraces(seed, left, top, width, height)}
    ${silkscreen(seed, left, top, width, height)}
    ${boardMounts(seed, left, top, width, height)}
    ${connectors(seed, left, top, width, height, category)}
    ${components}
  </g>
  <circle cx="${IMAGE_WIDTH - 34}" cy="38" r="5" fill="#deaa70"/>`,
  );
}

function makeEditorialArtwork(entry: MediaEntry): string {
  const hash = createHash("sha256").update(entry.fileName).digest();
  const seed = hash.readUInt32BE(0);
  const title = entry.fileName.replace(/\.png$/u, "");
  const palettes: [BoardPalette, BoardPalette, BoardPalette] = [
    boardPalette(seed),
    boardPalette(seed ^ 0x783f19),
    boardPalette(seed ^ 0xced32),
  ];
  const hero = title === "home-hero";
  const width = hero ? HERO_WIDTH : 1500;
  const height = hero ? HERO_HEIGHT : 920;
  const geometry = `
    <rect width="100%" height="100%" fill="#eef2ed"/>
    <rect width="100%" height="100%" fill="url(#grain)"/>
    <path d="M0 ${height * 0.82} H${width} M0 ${height * 0.85} H${width}" fill="none" stroke="#dce3dd" stroke-width="2"/>
    <path d="M${width * 0.74} 0 H${width} V${height}" fill="#e5ece4" opacity=".48"/>
    ${
      hero
        ? assembleWorkspace(width, height, palettes)
        : assembleEditorialBoard(title, width, height, palettes[0], seed)
    }
    <path d="M${width * 0.71} ${height * 0.12} h${width * 0.2}" stroke="#dd9e67" stroke-width="3" opacity=".72"/>`;

  return wrapSvg(
    width,
    height,
    `<defs>
    <linearGradient id="light" x2="1" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#e2e9e0"/></linearGradient>
    <pattern id="grain" width="56" height="56" patternUnits="userSpaceOnUse"><circle cx="10" cy="18" r="1.4" fill="#5f7768" opacity=".13"/><circle cx="38" cy="43" r=".9" fill="#667d6f" opacity=".12"/></pattern>
    <linearGradient id="board" x2=".8" y2="1"><stop stop-color="${palettes[0].boardLight}"/><stop offset="1" stop-color="${palettes[0].boardDark}"/></linearGradient>
    <linearGradient id="board-alt" x2=".8" y2="1"><stop stop-color="${palettes[1].boardLight}"/><stop offset="1" stop-color="${palettes[1].boardDark}"/></linearGradient>
    <filter id="shadow" x="-.4" y="-.4" width="1.8" height="1.9"><feGaussianBlur stdDeviation="22"/></filter>
  </defs>${geometry}`,
  );
}

function assembleWorkspace(
  width: number,
  height: number,
  palettes: [BoardPalette, BoardPalette, BoardPalette],
): string {
  const scale = height / 1100;
  const boards = [
    { x: 950, y: 28, w: 460, h: 286, rotation: -12, seed: 0x240cf },
    { x: 1325, y: 360, w: 510, h: 308, rotation: 10, seed: 0x61d3f },
    { x: 915, y: 718, w: 470, h: 288, rotation: -8, seed: 0xa48fe },
  ];

  return `<ellipse cx="${width * 0.76}" cy="${height * 0.5}" rx="${width * 0.32}" ry="${height * 0.44}" fill="#607167" opacity=".1" filter="url(#shadow)"/>
    <g transform="scale(${scale})">
      ${boards
        .map((board, index) => {
          const palette = palettes[index];
          const category = (["compute", "network", "power"] as const)[index];
          if (!palette || !category)
            throw new Error("首页硬件场景缺少对应配色或板卡类型。");
          return `<g transform="translate(${board.x} ${board.y}) rotate(${board.rotation} ${board.w / 2} ${board.h / 2}) scale(${board.w / 710} ${board.h / 430})">
        ${boardOutline(board.seed + index, 0, 0, 710, 430, index === 1 ? "url(#board-alt)" : "url(#board)")}
        ${copperTraces(board.seed, 0, 0, 710, 430)}
        ${boardMounts(board.seed, 0, 0, 710, 430)}
        ${connectors(board.seed, 0, 0, 710, 430, category)}
        ${heroComponents(board.seed, 0, 0, palette, index)}
      </g>`;
        })
        .join("")}
      <path d="M1200 340 C1390 225 1480 255 1590 188 M1410 565 C1530 490 1590 540 1690 520 M1130 860 C1260 812 1370 842 1470 782" fill="none" stroke="#ba8c5d" stroke-width="3" opacity=".55"/>
    </g>`;
}

function assembleEditorialBoard(
  title: string,
  width: number,
  height: number,
  palette: ReturnType<typeof boardPalette>,
  seed: number,
): string {
  const boardWidth = title === "about-precision" ? 640 : 765;
  const boardHeight = title === "home-workbench" ? 410 : 455;
  const x = (width - boardWidth) / 2;
  const y = (height - boardHeight) / 2 + 15;

  return `<ellipse cx="${width / 2}" cy="${height * 0.65}" rx="${boardWidth * 0.76}" ry="${boardHeight * 0.48}" fill="#5b6e62" opacity=".11" filter="url(#shadow)"/>
    <g transform="translate(${x} ${y})">
      ${boardOutline(seed, 0, 0, boardWidth, boardHeight)}
      ${copperTraces(seed, 0, 0, boardWidth, boardHeight)}
      ${silkscreen(seed, 0, 0, boardWidth, boardHeight)}
      ${boardMounts(seed, 0, 0, boardWidth, boardHeight)}
      ${connectors(seed, 0, 0, boardWidth, boardHeight, title.includes("assembly") ? "power" : "compute")}
      ${heroComponents(seed, 0, 0, palette, title.includes("test") ? 2 : title.includes("precision") ? 1 : 0)}
    </g>
    <rect x="${x + 70}" y="${y - 56}" width="110" height="24" rx="12" fill="#ffffff" stroke="#dae3da" transform="rotate(-6 ${x + 70} ${y - 56})"/>
    <path d="M${width * 0.09} ${height * 0.83} H${width * 0.37}" stroke="#aab8ad" stroke-width="2"/>
    <circle cx="${width * 0.09}" cy="${height * 0.83}" r="6" fill="#bc966a"/>`;
}

function boardCategory(resourceKey: string): string {
  const slug = resourceKey.replace(/^product-/u, "");
  const categorySlugs: Record<string, string[]> = {
    compute: [
      "origin-compute",
      "peak-core",
      "refract-main",
      "weave-gateway",
      "graphite-core",
    ],
    control: [
      "second-control",
      "southstar-eco",
      "arc-touch",
      "quadrant-io",
      "wutong-learning",
    ],
    wireless: [
      "swallow-radio",
      "dawn-node",
      "prism-front",
      "vault-antenna",
      "spectrum-filter",
    ],
    network: [
      "ironbridge-485",
      "blueridge-can",
      "cityrail-ethernet",
      "squareport-poe",
      "dual-protocol-gateway",
    ],
    power: [
      "stable-buck",
      "cell-bms",
      "sunlight-harvest",
      "lightarc-usbc",
      "isolated-power",
    ],
    sensing: [
      "fine-rain-sensor",
      "core-vibration",
      "morningstar-imu",
      "glass-optical",
      "celadon-acquisition",
    ],
    motion: [
      "master-stepper",
      "leiger-servo",
      "bluebird-robot",
      "streamline-axis",
      "halfmoon-actuator",
    ],
    expansion: [
      "silverwing-backplane",
      "fluorescent-bridge",
      "stream-audio",
      "lens-vision",
      "beacon-usb",
    ],
    lab: [
      "folded-fpga",
      "iron-guard",
      "warp-geospatial",
      "echo-haptics",
      "master-gauge-fixture",
    ],
  };

  return (
    Object.entries(categorySlugs).find(([, slugs]) =>
      slugs.includes(slug),
    )?.[0] ?? "control"
  );
}

type BoardPalette = {
  boardLight: string;
  board: string;
  boardDark: string;
  copper: string;
};

function boardPalette(seed: number): BoardPalette {
  const palettes: [BoardPalette, BoardPalette, BoardPalette] = [
    {
      boardLight: "#528769",
      board: "#315d48",
      boardDark: "#254433",
      copper: "#dfb078",
    },
    {
      boardLight: "#497981",
      board: "#315b60",
      boardDark: "#26464d",
      copper: "#deb58c",
    },
    {
      boardLight: "#738268",
      board: "#4b614e",
      boardDark: "#3a4b3c",
      copper: "#e5b07c",
    },
  ];
  return palettes[(seed >>> 0) % palettes.length] ?? palettes[0];
}

function boardOutline(
  seed: number,
  left: number,
  top: number,
  width: number,
  height: number,
  color = "url(#board)",
): string {
  const cut = Math.max(
    25,
    Math.min(width, height) * (0.047 + (seed % 8) / 250),
  );
  const nib = (seed >>> 4) % 2 === 0 ? cut * 0.72 : cut;
  const points = [
    `${left + cut},${top}`,
    `${left + width - cut * 1.8},${top}`,
    `${left + width},${top + cut * 1.8}`,
    `${left + width},${top + height - cut}`,
    `${left + width - cut},${top + height}`,
    `${left + cut * 1.6},${top + height}`,
    `${left},${top + height - cut * 1.55}`,
    `${left},${top + nib}`,
  ].join(" ");
  return `<polygon points="${points}" fill="#607168" opacity=".2" transform="translate(0 13)"/>
    <polygon points="${points}" fill="${color}" stroke="#b0c297" stroke-width="4"/>
    <polygon points="${left + cut + 9},${top + 12} ${left + width - cut * 1.8 - 9},${top + 12} ${left + width - 12},${top + cut * 1.8} ${left + width - 12},${top + height - cut - 9} ${left + width - cut - 9},${top + height - 12} ${left + cut * 1.6 + 8},${top + height - 12} ${left + 12},${top + height - cut * 1.55 - 8} ${left + 12},${top + nib + 5}" fill="none" stroke="#9baa79" stroke-width="2" opacity=".76"/>`;
}

function copperTraces(
  seed: number,
  left: number,
  top: number,
  width: number,
  height: number,
): string {
  const traces = Array.from({ length: 14 }, (_, index) => {
    const fraction = (index + 1) / 16;
    const startY = top + Math.round(height * fraction);
    const endY = top + Math.round(height * (1 - fraction * 0.82));
    const startX = left + 36 + randomIn(seed + index * 149, 18, width * 0.32);
    const endX =
      left + width - 32 - randomIn(seed ^ (index * 277 + 63), 12, width * 0.24);
    const midX =
      left + randomIn(seed ^ (index * 87), width * 0.4, width * 0.72);
    const tone = index % 4 === 0 ? "#dca872" : "#a6ba88";
    const opacity = (0.3 + (index % 5) * 0.06).toFixed(2);
    return `<path d="M${startX} ${startY} H${midX} l14 -16 H${endX}" fill="none" stroke="${tone}" stroke-width="${index % 4 === 0 ? 2.8 : 1.8}" opacity="${opacity}"/><circle cx="${endX}" cy="${endY}" r="3.2" fill="${tone}" opacity=".74"/>`;
  }).join("");

  return `${traces}<path d="M${left + width * 0.22} ${top + height * 0.36} h${width * 0.16} v${height * 0.17} h${width * 0.09} M${left + width * 0.69} ${top + height * 0.26} h${width * 0.12} M${left + width * 0.3} ${top + height * 0.76} h${width * 0.14} v-${height * 0.12} h${width * 0.13}" fill="none" stroke="#dfae76" stroke-width="1.8" opacity=".72"/>`;
}

function boardMounts(
  seed: number,
  left: number,
  top: number,
  width: number,
  height: number,
): string {
  const inset = Math.max(28, Math.min(width, height) * 0.075);
  const positions = [
    [left + inset, top + inset],
    [left + width - inset, top + inset],
    [left + inset, top + height - inset],
    [left + width - inset, top + height - inset],
  ];
  return positions
    .map(
      ([cx, cy], index) =>
        `<circle cx="${cx}" cy="${cy}" r="${index === seed % 4 ? 13 : 10}" fill="#d6ddcd" stroke="#dbaf77" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="4" fill="#c0c9ba"/>`,
    )
    .join("");
}

function silkscreen(
  seed: number,
  left: number,
  top: number,
  width: number,
  height: number,
): string {
  const marks = Array.from({ length: 19 }, (_, index) => {
    const x = left + 56 + randomIn(seed + index * 27, 0, width * 0.84);
    const y = top + 42 + randomIn(seed ^ (index * 81), 0, height * 0.79);
    return `<path d="M${x} ${y} h${8 + (index % 4) * 3}" stroke="url(#silk)" stroke-width="1.5" opacity=".7"/>`;
  }).join("");
  return `<path d="M${left + width * 0.1} ${top + height * 0.17} h${width * 0.14} m-${width * 0.12} 9 h${width * 0.1} M${left + width * 0.67} ${top + height * 0.8} h${width * 0.19}" fill="none" stroke="url(#silk)" stroke-width="1.8" opacity=".62"/>${marks}`;
}

function connectors(
  seed: number,
  left: number,
  top: number,
  width: number,
  height: number,
  category: string,
): string {
  if (category === "wireless") {
    return `<rect x="${left + width * 0.14}" y="${top + height * 0.5}" width="36" height="31" rx="5" fill="#c7ab76"/><circle cx="${left + width * 0.14 + 18}" cy="${top + height * 0.5 + 15}" r="8" fill="#dfebd6" stroke="#82674b" stroke-width="3"/>`;
  }
  if (category === "power" || category === "motion") {
    return [0, 1, 2, 3]
      .map(
        (index) =>
          `<rect x="${left + width * 0.18 + index * width * 0.17}" y="${top + height - 35}" width="${width * 0.13}" height="27" rx="5" fill="#d6be91" stroke="#8b7352" stroke-width="3"/><rect x="${left + width * 0.2 + index * width * 0.17}" y="${top + height - 28}" width="${width * 0.09}" height="10" rx="2" fill="#576962"/>`,
      )
      .join("");
  }
  if (category === "network") {
    return [0, 1]
      .map(
        (index) =>
          `<g transform="translate(${left + width * 0.22 + index * width * 0.46} ${top + height * 0.57})"><rect width="${width * 0.26}" height="${height * 0.17}" rx="9" fill="#becabe" stroke="#e3c58f" stroke-width="5"/><rect x="9" y="9" width="${width * 0.26 - 18}" height="${height * 0.17 - 18}" rx="5" fill="#344b45"/><path d="${Array.from({ length: 8 }, (_, pin) => `M${13 + pin * 13} ${height * 0.17 - 27} v15`).join(" ")}" stroke="#daba84" stroke-width="3"/></g>`,
      )
      .join("");
  }
  const count =
    category === "expansion" ? 16 : category === "lab" ? 12 : 8 + (seed % 5);
  const padSize = Math.min(9, width / (count * 2.35));
  return Array.from({ length: count }, (_, index) => {
    const column = index % Math.ceil(count / 2);
    const row = index < Math.ceil(count / 2) ? 0 : 1;
    const px =
      left + width * 0.18 + (column * width * 0.64) / Math.ceil(count / 2);
    const py = row === 0 ? top + height * 0.11 : top + height * 0.89;
    return `<rect x="${px}" y="${py - padSize / 2}" width="${padSize * 1.2}" height="${padSize * 2.2}" rx="${padSize / 2}" fill="#e3bc84" opacity=".9"/>`;
  }).join("");
}

function wirelessParts(
  seed: number,
  left: number,
  top: number,
  width: number,
  height: number,
): string {
  const main = centralChip(
    seed,
    left,
    top,
    width,
    height,
    0.31,
    0.31,
    0.24,
    0.24,
  );
  const shieldX = left + width * 0.67;
  return `<g>${main}${chip(seed ^ 0xa29bc, left + width * 0.2, top + height * 0.22, 55, 43, "#393f41")}</g>
    <rect x="${shieldX}" y="${top + height * 0.3}" width="${width * 0.19}" height="${height * 0.35}" rx="7" fill="#c4cbc2" stroke="#e1daca" stroke-width="4"/>
    <rect x="${shieldX + 9}" y="${top + height * 0.3 + 9}" width="${width * 0.19 - 18}" height="${height * 0.35 - 18}" rx="4" fill="#84918a"/>
    <circle cx="${left + width * 0.18}" cy="${top + height * 0.72}" r="${Math.min(width, height) * 0.055}" fill="#dbb881" stroke="#7d634b" stroke-width="4"/>
    ${resistorArray(seed, left + width * 0.29, top + height * 0.72, 6)}
    <path d="M${left + width * 0.22} ${top + height * 0.2} v-${height * 0.1} h${width * 0.57} v${height * 0.1}" fill="none" stroke="#e4bd84" stroke-width="4" opacity=".8"/>`;
}

function powerParts(
  seed: number,
  left: number,
  top: number,
  width: number,
  height: number,
): string {
  const coilX = left + width * 0.65;
  const coilY = top + height * 0.4;
  const coilSize = Math.min(height, width) * 0.18;
  return `${centralChip(seed, left, top, width, height, 0.22, 0.28, 0.24, 0.23)}
    <rect x="${coilX}" y="${coilY}" width="${coilSize * 1.45}" height="${coilSize * 1.05}" rx="13" fill="#a58966" stroke="#d7bd94" stroke-width="5"/>
    ${Array.from({ length: 6 }, (_, index) => `<path d="M${coilX + 11 + index * coilSize * 0.19} ${coilY + 6} v${coilSize * 0.79}" stroke="#604d3e" stroke-width="4" opacity=".75"/>`).join("")}
    <rect x="${left + width * 0.26}" y="${top + height * 0.66}" width="${width * 0.42}" height="${height * 0.12}" rx="8" fill="#687673" stroke="#d2c7ac" stroke-width="4"/>
    ${chip(seed ^ 0x795ab, left + width * 0.68, top + height * 0.68, 65, 46, "#343d41")}
    ${resistorArray(seed, left + width * 0.29, top + height * 0.53, 6)}`;
}

function networkParts(
  seed: number,
  left: number,
  top: number,
  width: number,
  height: number,
): string {
  return `${centralChip(seed, left, top, width, height, 0.38, 0.32, 0.24, 0.26)}
    ${chip(seed ^ 0x190db, left + width * 0.22, top + height * 0.27, 80, 56, "#454c49")}
    ${chip(seed ^ 0x759a, left + width * 0.64, top + height * 0.29, 68, 50, "#535956")}
    ${chip(seed ^ 0x8bac, left + width * 0.29, top + height * 0.65, 64, 46, "#363e3b")}
    ${resistorArray(seed, left + width * 0.66, top + height * 0.66, 5)}
    <path d="M${left + width * 0.48} ${top + height * 0.2} v-${height * 0.1} h${width * 0.12} M${left + width * 0.53} ${top + height * 0.75} v${height * 0.13} h${width * 0.13}" fill="none" stroke="#e4b67f" stroke-width="4"/>`;
}

function sensingParts(
  seed: number,
  left: number,
  top: number,
  width: number,
  height: number,
): string {
  const centerX = left + width * (0.42 + (seed % 4) / 45);
  const centerY = top + height * 0.43;
  const optical = seed % 7 === 0;
  const sensor = optical
    ? `<circle cx="${centerX}" cy="${centerY}" r="${height * 0.13}" fill="#c3c9c1" stroke="#e0c092" stroke-width="6"/><circle cx="${centerX}" cy="${centerY}" r="${height * 0.083}" fill="#314044" stroke="#849b87" stroke-width="6"/><circle cx="${centerX}" cy="${centerY}" r="${height * 0.048}" fill="#678091" stroke="#c1d5cc" stroke-width="5"/>`
    : `<g>${centralChip(seed, left, top, width, height, centerX / width - left / width - 0.09, 0.35, 0.2, 0.2)}<rect x="${centerX - 50}" y="${centerY - 43}" width="100" height="86" rx="7" fill="#59634f" stroke="#c9b284" stroke-width="6"/><path d="M${centerX - 38} ${centerY - 28} h75 M${centerX - 38} ${centerY - 12} h75 M${centerX - 38} ${centerY + 7} h75 M${centerX - 38} ${centerY + 24} h75" stroke="#a7b792" stroke-width="3"/></g>`;
  return `${sensor}
    ${chip(seed ^ 0x5733, left + width * 0.67, top + height * 0.29, 78, 54, "#424b47")}
    ${chip(seed ^ 0x117e, left + width * 0.19, top + height * 0.61, 69, 48, "#48524d")}
    ${resistorArray(seed, left + width * 0.59, top + height * 0.65, 8)}
    <path d="M${left + width * 0.16} ${centerY} h${centerX - (left + width * 0.16) - 58} M${centerX + height * 0.13} ${centerY} h${left + width * 0.8 - centerX - height * 0.13}" stroke="#e0b581" stroke-width="4" fill="none"/>`;
}

function motionParts(
  seed: number,
  left: number,
  top: number,
  width: number,
  height: number,
): string {
  return `${chip(seed, left + width * 0.35, top + height * 0.24, 110, 76, "#363e3c")}
    <rect x="${left + width * 0.64}" y="${top + height * 0.28}" width="${width * 0.16}" height="${height * 0.33}" rx="12" fill="#c0c8bd" stroke="#d9bd8b" stroke-width="5"/>
    ${Array.from({ length: 5 }, (_, index) => `<path d="M${left + width * (0.66 + index * 0.025)} ${top + height * 0.31} v${height * 0.27}" stroke="#68756b" stroke-width="3"/>`).join("")}
    ${chip(seed ^ 0x5721f, left + width * 0.22, top + height * 0.58, 74, 55, "#39433f")}
    ${chip(seed ^ 0x62324, left + width * 0.51, top + height * 0.62, 81, 52, "#434b46")}
    ${resistorArray(seed, left + width * 0.36, top + height * 0.66, 5)}
    <path d="M${left + width * 0.1} ${top + height * 0.22} H${left + width * 0.3} v${height * 0.13} M${left + width * 0.78} ${top + height * 0.76} h-${width * 0.22} v-${height * 0.12}" fill="none" stroke="#e4b67f" stroke-width="4"/>`;
}

function expansionParts(
  seed: number,
  left: number,
  top: number,
  width: number,
  height: number,
): string {
  const connectorWidth = width * 0.48;
  return `<rect x="${left + width * 0.27}" y="${top + height * 0.16}" width="${connectorWidth}" height="${height * 0.16}" rx="7" fill="#d7c59d" stroke="#6e806e" stroke-width="5"/>
    ${Array.from({ length: 14 }, (_, index) => `<path d="M${left + width * 0.29 + (index * connectorWidth) / 14} ${top + height * 0.2} v${height * 0.095}" stroke="#967d59" stroke-width="2.5"/>`).join("")}
    ${chip(seed ^ 0xa7622, left + width * 0.38, top + height * 0.46, 115, 77, "#3a4643")}
    ${chip(seed ^ 0x881b6, left + width * 0.19, top + height * 0.55, 73, 52, "#505751")}
    ${chip(seed ^ 0xcc91, left + width * 0.67, top + height * 0.56, 73, 52, "#505751")}
    <rect x="${left + width * 0.56}" y="${top + height * 0.73}" width="${width * 0.22}" height="${height * 0.12}" rx="7" fill="#c5c8b8" stroke="#dfc18a" stroke-width="4"/>
    ${resistorArray(seed, left + width * 0.26, top + height * 0.39, 5)}`;
}

function labParts(
  seed: number,
  left: number,
  top: number,
  width: number,
  height: number,
): string {
  const centerX = left + width * 0.49;
  const centerY = top + height * 0.45;
  const chipWidth = width * 0.24;
  return `<rect x="${centerX - chipWidth / 2}" y="${centerY - chipWidth / 2}" width="${chipWidth}" height="${chipWidth * 0.88}" rx="17" fill="#323a39" stroke="#bdc4ad" stroke-width="8"/>
    ${Array.from({ length: 9 }, (_, index) => `<rect x="${centerX - chipWidth * 0.35 + index * chipWidth * 0.0875}" y="${centerY - chipWidth * 0.36}" width="${chipWidth * 0.04}" height="${chipWidth * 0.6}" fill="#b9a67f" opacity=".85"/>`).join("")}
    ${[0.2, 0.79].map((fraction, index) => chip(seed ^ (index * 719), left + width * fraction, top + height * 0.64, 78, 54, "#464d49")).join("")}
    ${[0, 1, 2, 3].map((index) => `<rect x="${left + width * 0.33 + index * width * 0.1}" y="${top + height * 0.12}" width="${width * 0.065}" height="${height * 0.08}" rx="5" fill="#b8c3b5" stroke="#d3b27f" stroke-width="4"/>`).join("")}
    ${resistorArray(seed, left + width * 0.35, top + height * 0.75, 5)}`;
}

function controlParts(
  seed: number,
  left: number,
  top: number,
  width: number,
  height: number,
): string {
  return `${centralChip(seed, left, top, width, height, 0.35, 0.31, 0.25, 0.26)}
    ${chip(seed ^ 0x91ea2, left + width * 0.68, top + height * 0.31, 74, 49, "#535852")}
    ${chip(seed ^ 0xb1c7b, left + width * 0.22, top + height * 0.63, 71, 49, "#4c514b")}
    ${resistorArray(seed, left + width * 0.6, top + height * 0.65, 7)}
    ${Array.from({ length: 4 }, (_, index) => `<rect x="${left + width * 0.14 + index * width * 0.19}" y="${top + height * 0.73}" width="${width * 0.12}" height="${height * 0.09}" rx="7" fill="#c8b98d" stroke="#718071" stroke-width="4"/>`).join("")}`;
}

function heroComponents(
  seed: number,
  left: number,
  top: number,
  palette: ReturnType<typeof boardPalette>,
  variant: number,
): string {
  const centerX = left + (variant === 1 ? 0.53 : 0.48) * 710;
  const centerY = top + 0.48 * 430;
  const chipSizes = [112, 132, 105] as const;
  const coreWidth = chipSizes[variant] ?? 112;
  return `<rect x="${centerX - coreWidth / 2}" y="${centerY - coreWidth / 2}" width="${coreWidth}" height="${coreWidth}" rx="14" fill="#35403c" stroke="#bdb89c" stroke-width="7"/>
    ${Array.from({ length: 9 }, (_, index) => `<path d="M${centerX - coreWidth * 0.32 + index * coreWidth * 0.08} ${centerY - coreWidth * 0.32} h${coreWidth * 0.055} v${coreWidth * 0.62} h-${coreWidth * 0.055}" fill="${variant === 2 ? "#9c9a79" : palette.copper}" opacity="${0.52 + (index % 3) * 0.1}"/>`).join("")}
    ${chip(seed ^ 0xffdb, left + 110, top + 93, 85, 64, "#46504b")}
    ${chip(seed ^ 0xe529, left + 512, top + 107, 85, 61, "#38433e")}
    ${chip(seed ^ 0x71b3, left + 133, top + 253, 96, 59, "#5e6453")}
    ${chip(seed ^ 0x8bc1, left + 498, top + 264, 98, 62, "#535e55")}
    ${resistorArray(seed, left + 278, top + 112, 8)}`;
}

function centralChip(
  seed: number,
  left: number,
  top: number,
  width: number,
  height: number,
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  const chipWidth = width * w;
  const chipHeight = height * h;
  return `<rect x="${left + width * x}" y="${top + height * y}" width="${chipWidth}" height="${chipHeight}" rx="${5 + (seed % 9)}" fill="#363f3d" stroke="#e0c18b" stroke-width="4"/>
    ${chip(seed ^ 0x4557, left + width * (x + 0.045), top + height * (y + 0.065), chipWidth * 0.91, chipHeight * 0.84, "#414947")}`;
}

function chip(
  seed: number,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): string {
  const radius = 4 + (seed % 8);
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${color}" stroke="#a6ad96" stroke-width="3"/>
    <rect x="${x + width * 0.12}" y="${y + height * 0.12}" width="${width * 0.76}" height="${height * 0.76}" rx="${radius / 2}" fill="none" stroke="#838d80" stroke-width="2"/>
    ${Array.from({ length: 5 }, (_, index) => `<path d="M${x - 5} ${y + 10 + (index * (height - 20)) / 4} h${width * 0.08} M${x + width * 0.92} ${y + 10 + (index * (height - 20)) / 4} h7" stroke="#d5bd8b" stroke-width="3"/>`).join("")}`;
}

function resistorArray(
  seed: number,
  left: number,
  top: number,
  count: number,
): string {
  return Array.from({ length: count }, (_, index) => {
    const width = 16 + ((seed + index * 11) % 12);
    const height = 8 + ((seed >>> (index % 12)) % 7);
    const x = left + index * 21;
    const y = top + (index % 2) * 15;
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="3" fill="${index % 3 === 0 ? "#cfbd91" : "#b7bbaa"}" stroke="#68766a" stroke-width="2"/><path d="M${x + width / 2} ${y + 2} v${height - 4}" stroke="#917952" stroke-width="2"/>`;
  }).join("");
}

function randomIn(seed: number, min: number, max: number): number {
  const mixed = Math.sin(seed * 0.000071 + 2.137) * 43758.5453;
  return Math.round(min + (mixed - Math.floor(mixed)) * (max - min));
}

function wrapSvg(width: number, height: number, content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`;
}

main().catch((error: unknown) => {
  const reason =
    error instanceof Error ? error.message : "图片生成过程中遇到未知错误。";
  console.error(`AEVORIO 媒体生成失败：${reason}`);
  process.exitCode = 1;
});
