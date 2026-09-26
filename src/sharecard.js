// All In Jefferson: the Sunday card.
//
// Draws a shareable, portrait, 1080x1350 PNG of the end-of-night results so a
// player can save it (or, on a phone, share it straight to a group text).
// Pure canvas 2D drawing only: no html2canvas, no new libraries. game.js calls
// initShareCardButtons(...) once, from endNight(), right after it calls
// renderer.render(scene, camera) again — the WebGL canvas is not created with
// preserveDrawingBuffer, so the frame is only guaranteed to still be in the
// drawing buffer if we grab it immediately. Everything after that (button
// wiring, the actual PNG draw, the download/share) can happen lazily, on click,
// using the snapshot captured here.

const CARD_W = 1080;
const CARD_H = 1350;
const CREAM = "#f3e9d2";
const CREAM_DIM = "rgba(243,233,210,0.75)";
const ORANGE = "#ff8c1a";
const GOLD = "#ffd98a";
const FONT = "'Trebuchet MS', 'Helvetica Neue', Helvetica, Arial, sans-serif";

// ---------- small canvas helpers ----------

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

let logoPromise = null;
function loadLogo() {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = "assets/logo.png";
    });
  }
  return logoPromise;
}

// Snapshot the live WebGL canvas into a plain 2D offscreen canvas, right now,
// while the drawing buffer is still valid. Downscaled a bit since it only
// needs to read back clearly at card size, not full resolution.
function captureScene(sourceCanvas) {
  if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) return null;
  try {
    const targetW = 960;
    const targetH = Math.round(targetW * (sourceCanvas.height / sourceCanvas.width));
    const snap = document.createElement("canvas");
    snap.width = targetW;
    snap.height = targetH;
    snap.getContext("2d").drawImage(sourceCanvas, 0, 0, targetW, targetH);
    return snap;
  } catch (e) {
    return null; // WebGL context lost, zero-size canvas, etc: the card just skips this band.
  }
}

function toBlobSafe(canvas) {
  return new Promise((resolve) => {
    try {
      if (!canvas.toBlob) { resolve(null); return; }
      canvas.toBlob((blob) => resolve(blob || null), "image/png");
    } catch (e) {
      resolve(null);
    }
  });
}

// ---------- layout pieces ----------

function drawBackground(ctx) {
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, "#0b1020");
  bg.addColorStop(0.5, "#161331");
  bg.addColorStop(1, "#241206");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = ctx.createRadialGradient(CARD_W / 2, CARD_H + 40, 60, CARD_W / 2, CARD_H + 40, 950);
  glow.addColorStop(0, "rgba(255,140,26,0.55)");
  glow.addColorStop(1, "rgba(255,140,26,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
}

async function drawHeader(ctx, data) {
  ctx.textAlign = "center";
  let y = 44;
  const logo = await loadLogo();
  if (logo && logo.width) {
    const lw = 320;
    const lh = lw * (logo.height / logo.width);
    ctx.drawImage(logo, (CARD_W - lw) / 2, y, lw, lh);
    y += lh + 14;
  } else {
    ctx.fillStyle = CREAM;
    ctx.font = `700 42px ${FONT}`;
    ctx.fillText("ALL IN JEFFERSON", CARD_W / 2, y + 38);
    y += 68;
  }
  ctx.fillStyle = CREAM_DIM;
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(`JEFFERSON, NY   •   ${data.dateStr}`, CARD_W / 2, y + 8);
  return y + 44;
}

function drawIdentity(ctx, data, yStart) {
  let y = yStart;
  ctx.textAlign = "center";
  ctx.fillStyle = CREAM;
  ctx.font = `700 78px ${FONT}`;
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowOffsetY = 4;
  ctx.fillText(data.camperName.toUpperCase(), CARD_W / 2, y + 66);
  ctx.shadowOffsetY = 0;
  y += 88;

  ctx.font = `700 23px ${FONT}`;
  const diffW = ctx.measureText(data.difficulty).width + 46;
  const pillH = 42;
  const pillX = CARD_W / 2 - diffW / 2;
  roundRect(ctx, pillX, y, diffW, pillH, pillH / 2);
  ctx.fillStyle = "rgba(255,140,26,0.22)";
  ctx.fill();
  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.fillText(data.difficulty, CARD_W / 2, y + pillH / 2 + 8);
  y += pillH + 26;

  ctx.fillStyle = ORANGE;
  ctx.font = `700 52px ${FONT}`;
  ctx.fillText(`SCORE ${data.score}`, CARD_W / 2, y + 44);
  y += 68;

  ctx.fillStyle = CREAM;
  ctx.font = `italic 600 27px ${FONT}`;
  const lines = wrapText(ctx, data.verdict, CARD_W - 160).slice(0, 2);
  lines.forEach((l) => { ctx.fillText(l, CARD_W / 2, y + 26); y += 34; });
  return y + 14;
}

function drawSceneBand(ctx, snapshot, yStart, height) {
  const x = 70;
  const w = CARD_W - 140;
  if (!snapshot) return yStart;
  roundRect(ctx, x, yStart, w, height, 18);
  ctx.save();
  ctx.clip();
  const scale = Math.max(w / snapshot.width, height / snapshot.height);
  const dw = snapshot.width * scale;
  const dh = snapshot.height * scale;
  ctx.drawImage(snapshot, x + (w - dw) / 2, yStart + (height - dh) / 2, dw, dh);
  // Warm the shot a touch so it reads as firelight, not a flat screenshot.
  const tint = ctx.createLinearGradient(0, yStart, 0, yStart + height);
  tint.addColorStop(0, "rgba(11,16,32,0.15)");
  tint.addColorStop(1, "rgba(255,120,20,0.18)");
  ctx.fillStyle = tint;
  ctx.fillRect(x, yStart, w, height);
  ctx.restore();
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 3;
  roundRect(ctx, x, yStart, w, height, 18);
  ctx.stroke();
  return yStart + height + 30;
}

function drawNameColumn(ctx, title, names, x, y, w, h) {
  ctx.textAlign = "left";
  ctx.fillStyle = ORANGE;
  ctx.font = `700 21px ${FONT}`;
  const titleLines = wrapText(ctx, title.toUpperCase(), w);
  let ty = y;
  titleLines.forEach((l) => { ctx.fillText(l, x, ty); ty += 24; });
  ty += 10;

  const list = names && names.length ? names : ["Nobody"];
  ctx.font = `600 25px ${FONT}`;
  const lineH = 30;
  const maxLines = Math.max(1, Math.floor((y + h - ty) / lineH));
  const shown = list.slice(0, maxLines);
  ctx.fillStyle = CREAM;
  shown.forEach((n) => { ctx.fillText(n, x, ty); ty += lineH; });
  if (list.length > shown.length) {
    ctx.fillStyle = CREAM_DIM;
    ctx.font = `italic 600 21px ${FONT}`;
    ctx.fillText(`+${list.length - shown.length} more`, x, ty);
  }
}

function drawLists(ctx, data, yStart, height) {
  const x = 70;
  const totalW = CARD_W - 140;
  const gap = 26;
  const colW = (totalW - gap * 2) / 3;
  drawNameColumn(ctx, "Still at the fire", data.stillAtFire, x, yStart, colW, height);
  drawNameColumn(ctx, "Went to bed", data.wentToBed, x + colW + gap, yStart, colW, height);
  drawNameColumn(ctx, "Taken by the bear", data.takenByBear, x + (colW + gap) * 2, yStart, colW, height);
  return yStart + height + 18;
}

// Highlight chips: short warm/orange pill tags that wrap left to right, matching
// the game's HUD chip look (rounded panel, cream border, orange fill).
function drawHighlights(ctx, items, yStart) {
  const x = 70;
  const maxW = CARD_W - 140;
  ctx.textAlign = "left";
  ctx.fillStyle = ORANGE;
  ctx.font = `700 21px ${FONT}`;
  ctx.fillText("THE NIGHT", x, yStart);
  let y = yStart + 22;

  const font = `600 23px ${FONT}`;
  ctx.font = font;
  ctx.textBaseline = "middle";
  const padX = 16;
  const boxH = 44;
  const gap = 10;
  const lineGap = 10;
  let cx = x;
  let cy = y + 14;
  for (const text of items) {
    const tw = ctx.measureText(text).width;
    const boxW = tw + padX * 2;
    if (cx !== x && cx + boxW > x + maxW) {
      cx = x;
      cy += boxH + lineGap;
    }
    roundRect(ctx, cx, cy, boxW, boxH, boxH / 2);
    ctx.fillStyle = "rgba(255,140,26,0.16)";
    ctx.fill();
    ctx.strokeStyle = "rgba(243,233,210,0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = CREAM;
    ctx.fillText(text, cx + padX, cy + boxH / 2 + 1);
    cx += boxW + gap;
  }
  ctx.textBaseline = "alphabetic";
  return cy + boxH;
}

function buildHighlights(data) {
  const items = [];
  if (data.hellsAnusPeak) items.push(`${data.hellsAnusPeak}, ${data.hellsAnusSeconds}s`);
  else items.push("Never hit Hell's Anus");
  if (data.beerCanInFire) items.push(`Beer can in the fire (${data.beerCanInFire})`);
  if (data.beerBomb === "exploded") items.push("Beer bomb went off");
  else if (data.beerBomb === "wasted") items.push("Beer bomb, wasted");
  if (data.hasGandalf) items.push("Had Gandalf");
  if (data.fireBreathing) items.push("Fire-breathing with the bottle");
  items.push(`Gas used: ${data.gasUsed}`);
  if (data.alanAndBees) items.push("Alan and the bees");
  if (data.takenByBear && data.takenByBear.length) items.push(`The bear took ${data.takenByBear.join(" and ")}`);
  else items.push("No bear tonight");
  return items;
}

async function buildCardCanvas(data, includeScene) {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  drawBackground(ctx);
  let y = await drawHeader(ctx, data);
  y = drawIdentity(ctx, data, y);
  const sceneH = 250;
  if (includeScene && data.sceneSnapshot) {
    y = drawSceneBand(ctx, data.sceneSnapshot, y, sceneH);
  } else {
    y += 10;
  }
  y = drawLists(ctx, data, y, 300);
  ctx.strokeStyle = "rgba(243,233,210,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, y);
  ctx.lineTo(CARD_W - 70, y);
  ctx.stroke();
  y += 26;
  drawHighlights(ctx, data.highlights, y);
  return canvas;
}

async function exportCard(data) {
  // Try the version with the real scene frame first. If drawing it tainted the
  // canvas (a cross-origin texture without CORS headers, WebGL context loss,
  // etc.), toBlob comes back null and we rebuild without that band instead of
  // failing the whole save.
  let canvas = await buildCardCanvas(data, true);
  let blob = await toBlobSafe(canvas);
  if (!blob) {
    canvas = await buildCardCanvas(data, false);
    blob = await toBlobSafe(canvas);
  }
  return { canvas, blob };
}

function todayParts() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return { dateStr: `${mm}/${dd}/${yyyy}`, mmddyyyy: `${mm}${dd}${yyyy}` };
}

function fileNameFor(data) {
  const safe = (data.camperName || "camper").replace(/[^a-z0-9]+/gi, "").toLowerCase() || "camper";
  return `all-in-jefferson-${safe}-${data.mmddyyyy}.png`;
}

function isIOS() {
  return /iP(hone|od|ad)/.test(navigator.platform || "") ||
    (navigator.userAgent.includes("Mac") && "ontouchend" in document);
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------- public entry point ----------
// Called once from game.js's endNight(), right after renderer.render(). Captures
// the scene snapshot immediately, then wires the SAVE CARD / SHARE buttons that
// already exist in the end-card markup (index.html: #save-card-btn, #share-card-btn).
export function initShareCardButtons(raw) {
  const saveBtn = document.getElementById("save-card-btn");
  const shareBtn = document.getElementById("share-card-btn");
  if (!saveBtn) return;

  const { dateStr, mmddyyyy } = todayParts();
  const data = { ...raw, dateStr, mmddyyyy };
  data.highlights = buildHighlights(data);
  data.sceneSnapshot = captureScene(raw.canvas);

  const saveLabel = saveBtn.textContent;
  saveBtn.disabled = false;
  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "SAVING…";
    try {
      const { canvas, blob } = await exportCard(data);
      const name = fileNameFor(data);
      if (blob && !isIOS()) {
        downloadBlob(blob, name);
      } else {
        // iPhone Safari download UX is awkward for a synthesized PNG (and a
        // tainted-canvas export has no blob at all); open it in a new tab
        // instead so it can be long-pressed and saved to Photos.
        const dataUrl = canvas.toDataURL("image/png");
        const win = window.open(dataUrl, "_blank");
        if (!win) downloadBlob(blob || (await (await fetch(dataUrl)).blob()), name);
      }
    } catch (e) {
      console.warn("Save card failed:", e);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = saveLabel;
    }
  };

  if (shareBtn) {
    const canNativeShare = !!(navigator.share && navigator.canShare);
    shareBtn.hidden = !canNativeShare;
    shareBtn.onclick = async () => {
      shareBtn.disabled = true;
      try {
        const { blob } = await exportCard(data);
        if (!blob) throw new Error("no blob to share");
        const file = new File([blob], fileNameFor(data), { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "All In Jefferson", text: data.verdict });
        } else {
          throw new Error("canShare rejected files");
        }
      } catch (e) {
        if (!e || e.name !== "AbortError") saveBtn.onclick();
      } finally {
        shareBtn.disabled = false;
      }
    };
  }
}
