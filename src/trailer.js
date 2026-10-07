// Low-poly 1990s white travel trailer, flat-shaded to match the rest of the diorama.
// Local +x is the front (tongue/hitch end), local +z is the door side. Origin sits at
// ground center.
import * as THREE from "three";

const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
// Windows and marker lights: self-lit glow, kept out of ACES tone mapping so it
// still reads warm against the tone-mapped siding.
const basic = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });

// One canvas texture: white base, faint horizontal ribs, the maroon/green pinstripe
// band, and a sawtooth accent row beneath it. Used on the two long side walls only,
// stretched 1:1 across each wall so the band lands at the same height on both.
function buildSidingTexture() {
  const w = 1024, h = 420;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");

  ctx.fillStyle = "#f2f0ea";
  ctx.fillRect(0, 0, w, h);

  // horizontal ribs, kept coarse so they read as siding instead of shimmering at distance
  ctx.strokeStyle = "rgba(20,20,10,0.10)";
  ctx.lineWidth = 2;
  for (let y = 26; y < h - 60; y += 30) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // pinstripe band in the lower third: green hairline, thick maroon, thin maroon
  const bandY = h * 0.72;
  ctx.fillStyle = "#2f5a3a";
  ctx.fillRect(0, bandY, w, 5);
  ctx.fillStyle = "#7a1f2b";
  ctx.fillRect(0, bandY + 13, w, 17);
  ctx.fillRect(0, bandY + 37, w, 6);

  // sawtooth accent row beneath the band
  const toothY = bandY + 56, toothH = 18, toothW = 24;
  ctx.fillStyle = "#5a1620";
  ctx.beginPath();
  for (let x = 0; x < w; x += toothW) {
    ctx.moveTo(x, toothY);
    ctx.lineTo(x + toothW / 2, toothY + toothH);
    ctx.lineTo(x + toothW, toothY);
  }
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

export function buildTravelTrailer() {
  const g = new THREE.Group();

  // ---- overall dimensions ----
  const BOTTOM_Y = 0.45;     // body underside off the ground
  const WALL_TOP_Y = 2.3;    // top of the wall, where the roof trim sits (roof ~2.4 total)
  const HALF_LEN = 2.2;      // 4.4 long overall
  const HALF_DEPTH = 1.0;    // 2.0 deep overall
  const REAR_X = -HALF_LEN;
  const FRONT_BOT_X = HALF_LEN;     // front-most point, at the bottom
  const FRONT_TOP_X = 1.5;          // slant leans back at the top
  const slantAngle = Math.atan2(FRONT_BOT_X - FRONT_TOP_X, WALL_TOP_Y - BOTTOM_Y);
  const nx = Math.cos(slantAngle), ny = Math.sin(slantAngle); // front slant's outward normal (xy)

  const white = new THREE.MeshLambertMaterial({ color: "#f2f0ea", flatShading: true, side: THREE.DoubleSide });
  const skin = new THREE.MeshLambertMaterial({ map: buildSidingTexture(), flatShading: true, side: THREE.DoubleSide });
  const maroon = lambert("#7a1f2b"), green = lambert("#2f5a3a");
  const dark = lambert("#141810"), frameMat = lambert("#23241f"), metal = lambert("#8a8f8c"), tongueMat = lambert("#6f7570");
  const warm = basic("#ffd580"), amber = basic("#ffb23c");

  // ---- body shell: one extruded trapezoid. The extrusion "sides" (bottom, roof, rear
  // wall, front slant) get plain white; the two end caps ARE the long side walls (the
  // z=0 and z=depth faces), so they get the ribbed siding texture, planar-mapped.
  // ExtrudeGeometry assigns material index 0 to the caps and 1 to the perimeter sides.
  const shape = new THREE.Shape();
  shape.moveTo(REAR_X, BOTTOM_Y);
  shape.lineTo(FRONT_BOT_X, BOTTOM_Y);
  shape.lineTo(FRONT_TOP_X, WALL_TOP_Y);
  shape.lineTo(REAR_X, WALL_TOP_Y);
  shape.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: HALF_DEPTH * 2, bevelEnabled: false, steps: 1 });
  // ExtrudeGeometry's default UV generator writes raw shape coordinates for the cap
  // faces (not 0..1), so the ribbed texture would sample one clamped edge pixel and
  // look blank. Remap just the cap vertices (group 0, the first N verts) onto 0..1
  // over the shape's bounding box so the siding texture lands cleanly on both walls.
  const capCount = bodyGeo.groups.find((gr) => gr.materialIndex === 0).count;
  const uv = bodyGeo.getAttribute("uv");
  const posAttr = bodyGeo.getAttribute("position");
  for (let i = 0; i < capCount; i++) {
    const x = posAttr.getX(i), y = posAttr.getY(i);
    uv.setXY(i, (x - REAR_X) / (FRONT_BOT_X - REAR_X), (y - BOTTOM_Y) / (WALL_TOP_Y - BOTTOM_Y));
  }
  uv.needsUpdate = true;
  bodyGeo.translate(0, 0, -HALF_DEPTH);
  const body = new THREE.Mesh(bodyGeo, [skin, white]);
  body.castShadow = true;
  g.add(body);

  // roof edge trim: a thin cap slightly larger than the roof footprint
  const roofTrim = new THREE.Mesh(
    new THREE.BoxGeometry(FRONT_TOP_X - REAR_X + 0.1, 0.1, HALF_DEPTH * 2 + 0.08),
    metal
  );
  roofTrim.position.set((FRONT_TOP_X + REAR_X) / 2, WALL_TOP_Y + 0.05, 0);
  g.add(roofTrim);

  // rear wall pinstripe (flat wall at x = REAR_X, facing -x)
  function rearStripe(y, h, mat) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, HALF_DEPTH * 2 - 0.05), mat);
    b.position.set(REAR_X - 0.02, y, 0);
    return b;
  }
  g.add(rearStripe(BOTTOM_Y + 0.72, 0.05, green));
  g.add(rearStripe(BOTTOM_Y + 0.58, 0.15, maroon));
  g.add(rearStripe(BOTTOM_Y + 0.43, 0.06, maroon));

  // a box aligned to the slanted front face, at height fraction f up the slant (0=bottom, 1=top)
  function slantBox(f, w, h, mat, depthZ, eps) {
    const x = FRONT_BOT_X + (FRONT_TOP_X - FRONT_BOT_X) * f;
    const y = BOTTOM_Y + (WALL_TOP_Y - BOTTOM_Y) * f;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, depthZ), mat);
    b.position.set(x + nx * eps, y + ny * eps, 0);
    b.rotation.z = slantAngle;
    return b;
  }
  // matching pinstripe treatment on the front slant
  g.add(slantBox(0.38, 0.03, 0.05, green, HALF_DEPTH * 2 - 0.1, 0.02));
  g.add(slantBox(0.31, 0.03, 0.15, maroon, HALF_DEPTH * 2 - 0.1, 0.02));
  g.add(slantBox(0.22, 0.03, 0.06, maroon, HALF_DEPTH * 2 - 0.1, 0.02));

  // ---- windows and door on the +z (door) wall ----
  const Z = HALF_DEPTH + 0.015;
  function wallWindow(x, y, w, h, paneMat, curtain) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.03), frameMat);
    frame.position.set(x, y, Z);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), paneMat);
    pane.position.set(x, y, Z + 0.025);
    g.add(frame, pane);
    if (curtain) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(w * 0.45, h * 0.4, 0.02), lambert("#d8cfb2"));
      c.position.set(x - w * 0.22, y + h * 0.2, Z + 0.03);
      g.add(c);
    }
  }
  wallWindow(-1.85, 1.55, 0.32, 0.5, dark);          // small rear window
  wallWindow(-0.75, 1.5, 0.85, 0.55, warm, true);    // large window, warm and occupied at night
  const doorX = 0.75;
  wallWindow(doorX, 1.72, 0.2, 0.24, dark);          // small door window

  // entry door
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.45, 0.05), lambert("#e9e6da"));
  door.position.set(doorX, BOTTOM_Y + 1.45 / 2, Z);
  g.add(door);

  // porch light by the door (rear side, clear of the awning arm), warm like the cabin's
  const lampArm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.15, 5), metal);
  lampArm.rotation.x = Math.PI / 2;
  lampArm.position.set(doorX - 0.42, BOTTOM_Y + 1.45 + 0.12, Z + 0.05);
  g.add(lampArm);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 7, 6), warm);
  lamp.position.set(doorX - 0.42, BOTTOM_Y + 1.45 + 0.12, Z + 0.13);
  g.add(lamp);

  // ---- large dark-tinted wraparound front window, set into the slant ----
  {
    const f = 0.52, w = HALF_DEPTH * 2 - 0.3, h = 0.9;
    const x = FRONT_BOT_X + (FRONT_TOP_X - FRONT_BOT_X) * f;
    const y = BOTTOM_Y + (WALL_TOP_Y - BOTTOM_Y) * f;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, h + 0.1, w + 0.1), frameMat);
    frame.position.set(x + nx * 0.02, y + ny * 0.02, 0);
    frame.rotation.z = slantAngle;
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, w), dark);
    pane.position.set(x + nx * 0.05, y + ny * 0.05, 0);
    pane.rotation.z = slantAngle;
    g.add(frame, pane);
  }

  // ---- rolled awning tube along the top of the door wall, plus two support arms ----
  const awnY = WALL_TOP_Y - 0.08, awnZ = HALF_DEPTH + 0.12;
  const awnLen = HALF_LEN + FRONT_TOP_X - 0.3;
  const awning = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, awnLen, 8, 1, true), metal);
  awning.rotation.z = Math.PI / 2;
  awning.position.set((FRONT_TOP_X + REAR_X) / 2 - 0.15, awnY, awnZ);
  g.add(awning);
  function awningArm(x) {
    const armLen = awnY - (BOTTOM_Y + 0.15);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, armLen, 5), metal);
    arm.position.set(x, awnY - armLen / 2, HALF_DEPTH + 0.06);
    g.add(arm);
  }
  awningArm(-1.9);
  awningArm(1.3);

  // ---- tandem axle: two wheels close together on each side, low ----
  const wheelMat = lambert("#2b2b2b");
  const axleX = -0.15, wheelGap = 0.5, wheelR = 0.32;
  [-1, 1].forEach((side) => {
    [axleX - wheelGap / 2, axleX + wheelGap / 2].forEach((wx) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.2, 10), wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, wheelR, side * (HALF_DEPTH + 0.05));
      wheel.castShadow = true;
      g.add(wheel);
    });
  });

  // ---- A-frame tongue with a propane tank cover ----
  const tipX = FRONT_BOT_X + 0.9;
  [-0.35, 0.35].forEach((z0) => {
    const dx = tipX - FRONT_BOT_X, dz = -z0;
    const len = Math.sqrt(dx * dx + dz * dz);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), tongueMat);
    bar.position.set((FRONT_BOT_X + tipX) / 2, BOTTOM_Y - 0.05, z0 / 2);
    bar.rotation.y = -Math.atan2(dz, dx);
    g.add(bar);
  });
  const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.65), tongueMat);
  crossBar.position.set(FRONT_BOT_X + 0.2, BOTTOM_Y - 0.05, 0);
  g.add(crossBar);
  const hitch = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), tongueMat);
  hitch.position.set(tipX, BOTTOM_Y - 0.08, 0);
  g.add(hitch);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 8), white);
  const tankA = tank.clone(); tankA.position.set(tipX - 0.4, BOTTOM_Y + 0.15, -0.14);
  const tankB = tank.clone(); tankB.position.set(tipX - 0.4, BOTTOM_Y + 0.15, 0.14);
  g.add(tankA, tankB);

  // ---- amber marker lights, mounted proud of the wall just under the roof trim ----
  const cornerZ = HALF_DEPTH + 0.02;
  [[REAR_X + 0.12, -cornerZ], [REAR_X + 0.12, cornerZ], [FRONT_TOP_X - 0.12, -cornerZ], [FRONT_TOP_X - 0.12, cornerZ]]
    .forEach(([x, z]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.03), amber);
      m.position.set(x, WALL_TOP_Y - 0.08, z);
      g.add(m);
    });

  return g;
}
