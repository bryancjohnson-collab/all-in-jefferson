// Tom W's truck: a chunky low-poly pickup, flat-shaded to match the rest of the
// diorama (props.js's style). Generic, no real badges. Local convention: +Z is
// the front (nose), matching the camper/player rig elsewhere in the game (see
// the "front = +Z" note in world.js/game.js) so rotation.y = atan2(dx, dz) and
// mesh.lookAt(x, 0, z) both work on it exactly like they do on a camper or the
// player.
//
// New file rather than an addition to props.js: another pass is working on
// camper props in props.js in a different copy of this repo, so this stays
// self-contained (same reasoning game.js already uses for canBombMesh/
// glassBottleMesh — see the comment there).
import * as THREE from "three";

const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const basic = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: opacity < 1, opacity });

// Shared with game.js so the SpotLight/beam-cone/lens-glow rig it builds around
// this mesh lines up with the actual geometry below without duplicating numbers.
// bodyColor is the one Bryan should see and approve/replace: a generic faded
// barn red, documented in docs/CAMPERS.md.
export const TRUCK_GEOM = {
  bodyColor: "#8a3530",
  halfWidth: 0.95,
  halfLength: 2.25,        // bumper to bumper, for parking-clearance reasoning
  headlightX: 0.62,
  headlightY: 0.72,
  headlightZ: 2.05,
  tailLightX: 0.72,
  tailLightY: 0.62,
  tailLightZ: -2.05,
};

export function buildPickupTruck() {
  const g = new THREE.Group();
  const G = TRUCK_GEOM;
  const body = lambert(G.bodyColor);
  const dark = lambert("#1b1c1a");
  const chrome = lambert("#aeb4b8");
  const glass = lambert("#11151c");
  const wheelMat = lambert("#212220");
  const hubMat = lambert("#6d7276");

  const mesh = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    // The truck sits parked well underground until midnight (see game.js) so
    // its buffers/textures upload to the GPU during the idle title/lobby
    // frames instead of on the frame it first actually needs to appear.
    // Frustum culling would skip that upload entirely while it's buried and
    // off-camera, so it's disabled here, on every part, permanently -- a
    // chunky, few-dozen-triangle prop costs nothing rendered every frame.
    m.frustumCulled = false;
    g.add(m);
    return m;
  };

  // ---- bed (rear, -Z): floor + two low side rails + tailgate ----
  mesh(new THREE.BoxGeometry(G.halfWidth * 2 - 0.08, 0.14, 1.85), body, 0, 0.58, -1.2);
  [-1, 1].forEach((side) => mesh(new THREE.BoxGeometry(0.1, 0.34, 1.85), body, side * (G.halfWidth - 0.05), 0.79, -1.2));
  mesh(new THREE.BoxGeometry(G.halfWidth * 2 - 0.08, 0.34, 0.1), body, 0, 0.79, -2.1);

  // ---- cab ----
  mesh(new THREE.BoxGeometry(G.halfWidth * 2, 0.6, 1.35), body, 0, 0.86, 0.35);      // lower cab / doors
  mesh(new THREE.BoxGeometry(G.halfWidth * 1.84, 0.58, 1.05), body, 0, 1.46, 0.2);    // upper cab (window belt up)
  mesh(new THREE.BoxGeometry(G.halfWidth * 1.9, 0.12, 1.25), dark, 0, 1.8, 0.2);      // roof
  // windshield (raked) and rear window
  mesh(new THREE.BoxGeometry(G.halfWidth * 1.7, 0.5, 0.06), glass, 0, 1.5, 0.76, 0.35, 0, 0);
  mesh(new THREE.BoxGeometry(G.halfWidth * 1.7, 0.42, 0.06), glass, 0, 1.5, -0.32, -0.25, 0, 0);
  // side windows + mirrors
  [-1, 1].forEach((side) => {
    mesh(new THREE.BoxGeometry(0.04, 0.4, 0.85), glass, side * (G.halfWidth * 0.94 + 0.02), 1.48, 0.15);
    mesh(new THREE.BoxGeometry(0.06, 0.22, 0.16), dark, side * (G.halfWidth + 0.16), 1.1, 0.55);
  });

  // ---- hood + grille + front bumper ----
  mesh(new THREE.BoxGeometry(G.halfWidth * 1.86, 0.46, 1.3), body, 0, 0.92, 1.55);
  mesh(new THREE.BoxGeometry(G.halfWidth * 1.6, 0.3, 0.08), dark, 0, 0.74, G.headlightZ + 0.08);
  mesh(new THREE.BoxGeometry(G.halfWidth * 2 + 0.1, 0.16, 0.18), chrome, 0, 0.4, G.headlightZ + 0.14);
  // rear bumper
  mesh(new THREE.BoxGeometry(G.halfWidth * 2 + 0.1, 0.16, 0.18), chrome, 0, 0.4, G.tailLightZ - 0.1);

  // ---- headlight lenses (bright, chrome-ringed) and red tail lights ----
  const lensMat = basic("#fff3d6");
  [-1, 1].forEach((side) => {
    const ring = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 12), chrome, side * G.headlightX, G.headlightY, G.headlightZ + 0.09, Math.PI / 2, 0, 0);
    ring.castShadow = false;
    const lens = mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.03, 12), lensMat, side * G.headlightX, G.headlightY, G.headlightZ + 0.115, Math.PI / 2, 0, 0);
    lens.castShadow = false;
  });
  const tailMat = basic("#c0362c", 0.95);
  [-1, 1].forEach((side) => {
    const t = mesh(new THREE.BoxGeometry(0.18, 0.16, 0.05), tailMat, side * G.tailLightX, G.tailLightY, G.tailLightZ - 0.05);
    t.castShadow = false;
  });

  // ---- wheels ----
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.26, 12);
  const hubGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.28, 8);
  [1.25, -1.35].forEach((z) => {
    [-1, 1].forEach((side) => {
      const x = side * (G.halfWidth + 0.03);
      mesh(wheelGeo, wheelMat, x, 0.38, z, 0, 0, Math.PI / 2);
      mesh(hubGeo, hubMat, x, 0.38, z, 0, 0, Math.PI / 2);
    });
  });

  return g;
}
