import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';

// ---- Config ----
const GRID = 30;
const CELL_SIZE = 1;

// パレット（5色）: 表示名とHEX
const PALETTE = [
  { name: 'red',    hex: 0xEF4444 },
  { name: 'green',  hex: 0x22C55E },
  { name: 'blue',   hex: 0x3B82F6 },
  { name: 'yellow', hex: 0xEAB308 },
  { name: 'purple', hex: 0xA855F7 },
];
// 未塗りの出力名
const NONE = 'none';

// ---- Scene setup ----
const app = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

// Orthographic camera（平行投影で塗りやすく）
const camera = new THREE.OrthographicCamera();
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
app.appendChild(renderer.domElement);

// 照明（BasicMaterialでもグリッド見やすさのため軽く補助）
const hemi = new THREE.HemisphereLight(0xffffff, 0x222244, 0.6);
scene.add(hemi);

// グリッドデータ
const group = new THREE.Group();
scene.add(group);

// 各セルの色インデックスを記録（-1=none）
const colorIndex = Array.from({ length: GRID }, () => Array(GRID).fill(-1));

// 1セル用の共有ジオメトリ（隙間が見えるように少し小さく）
const geo = new THREE.PlaneGeometry(CELL_SIZE * 0.96, CELL_SIZE * 0.96);

// 個別マテリアル（色ごとに変更するのでセルごとに持たせる）
const defaultColor = new THREE.Color(0x2a2d2f);

function cellMaterial() {
  return new THREE.MeshBasicMaterial({ color: defaultColor, side: THREE.DoubleSide });
}

// セル生成（中心にそろえる）
for (let j = 0; j < GRID; j++) {
  for (let i = 0; i < GRID; i++) {
    const mesh = new THREE.Mesh(geo, cellMaterial());
    // 0,0 を左上にしたい場合は計算式を入れ替える
    const x = (i - GRID / 2) * CELL_SIZE + CELL_SIZE * 0.5;
    const y = (GRID / 2 - j) * CELL_SIZE - CELL_SIZE * 0.5;
    mesh.position.set(x, y, 0);
    mesh.userData = { i, j };
    group.add(mesh);
  }
}

// 輪郭（任意）
const gridHelper = new THREE.GridHelper(GRID * CELL_SIZE, GRID, 0x666666, 0x333333);
gridHelper.rotation.x = Math.PI / 2;
scene.add(gridHelper);

// ---- Palette UI ----
const paletteEl = document.getElementById('palette');
let current = 0; // 現在選択中の色 index（0..4）

PALETTE.forEach((c, idx) => {
  const div = document.createElement('div');
  div.className = 'swatch' + (idx === current ? ' active' : '');
  div.style.background = `#${c.hex.toString(16).padStart(6, '0')}`;
  div.title = c.name;
  div.addEventListener('click', () => {
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    div.classList.add('active');
    current = idx;
  });
  paletteEl.appendChild(div);
});

// ---- Picking（クリック/ドラッグで塗る） ----
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let painting = false;

function setPointerFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ( (event.clientX ?? event.touches?.[0]?.clientX) - rect.left ) / rect.width;
  const y = ( (event.clientY ?? event.touches?.[0]?.clientY) - rect.top  ) / rect.height;
  pointer.set(x * 2 - 1, - (y * 2 - 1));
}

function paintUnderPointer() {
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(group.children, false);
  if (intersects.length) {
    const mesh = intersects[0].object;
    const { i, j } = mesh.userData;
    colorIndex[j][i] = current;
    mesh.material.color.setHex(PALETTE[current].hex);
  }
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  painting = true;
  setPointerFromEvent(e);
  paintUnderPointer();
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!painting) return;
  setPointerFromEvent(e);
  paintUnderPointer();
});
window.addEventListener('pointerup', () => painting = false);
window.addEventListener('pointercancel', () => painting = false);

// ---- CSV Export ----
function toCSV() {
  // colorIndex は [row=j][col=i]。CSVは上→下、左→右
  const rows = [];
  for (let j = 0; j < GRID; j++) {
    const cols = [];
    for (let i = 0; i < GRID; i++) {
      const idx = colorIndex[j][i];
      cols.push(idx >= 0 ? PALETTE[idx].name : NONE);
    }
    rows.push(cols.join(','));
  }
  return rows.join('\n');
}

document.getElementById('exportCsv').addEventListener('click', () => {
  const csv = toCSV();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'grid_colors_30x30.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// ---- Reset ----
document.getElementById('clear').addEventListener('click', () => {
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      colorIndex[j][i] = -1;
    }
  }
  group.children.forEach((m) => m.material.color.copy(defaultColor));
});

// ---- Resize / Camera framing ----
function onResize() {
  const w = app.clientWidth || window.innerWidth;
  const h = app.clientHeight || window.innerHeight;

  renderer.setSize(w, h);

  const aspect = w / h;
  const worldW = GRID * CELL_SIZE;
  const worldH = GRID * CELL_SIZE;

  // 画面アスペクトに応じてカメラ枠を調整（全体が入るように）
  let viewW = worldW;
  let viewH = worldH;
  if (viewW / viewH < aspect) {
    viewW = viewH * aspect;
  } else {
    viewH = viewW / aspect;
  }
  camera.left = -viewW / 2;
  camera.right =  viewW / 2;
  camera.top =    viewH / 2;
  camera.bottom = -viewH / 2;
  camera.near = 0.1;
  camera.far = 100;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// ---- Render loop ----
function tick() {
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
