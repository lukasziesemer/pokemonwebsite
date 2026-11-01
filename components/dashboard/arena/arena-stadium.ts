import * as THREE from 'three';
import { canvasTexture, seeded, type ToonFactory } from './arena-kit';
import type { ArenaPlayer, ArenaSceneData } from './arena-model';

export const SUN_POSITION = new THREE.Vector3(-176, 158, -640);

const FIELD_WIDTH = 112;
const FIELD_DEPTH = 68;
const FIELD_Z = 4;
const WALL_RADIUS = 112;

interface StadiumOptions {
  scene: THREE.Scene;
  players: readonly ArenaPlayer[];
  displayFont: string;
  toon: ToonFactory;
}

const quadVertex = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

function addSky(scene: THREE.Scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y * 2.6, 0.0, 1.0);
          vec3 horizon = vec3(0.70, 0.90, 0.97), middle = vec3(0.17, 0.60, 0.95), zenith = vec3(0.03, 0.27, 0.80);
          vec3 color = h < 0.4 ? mix(horizon, middle, h / 0.4) : mix(middle, zenith, (h - 0.4) / 0.6);
          gl_FragColor = vec4(color, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -10;
  scene.add(sky);

  const sunDisc = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(256, 256, (ctx, size) => {
        const glow = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2);
        glow.addColorStop(0, 'rgba(255,255,250,1)');
        glow.addColorStop(0.1, 'rgba(255,253,235,1)');
        glow.addColorStop(0.14, 'rgba(255,245,205,.5)');
        glow.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, size, size);
      }),
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sunDisc.position.copy(SUN_POSITION);
  sunDisc.lookAt(0, 20, 0);
  sunDisc.renderOrder = -9;
  scene.add(sunDisc);

  const cloudTextures = [11, 29, 73, 151].map(seed => {
    const random = seeded(seed);
    return canvasTexture(1024, 512, (ctx, width, height) => {
      const puffs = Array.from({ length: 46 }, () => {
        const x = 0.08 + random() * 0.84;
        const envelope = Math.sin(x * Math.PI) ** 0.8;
        return {
          x: x * width,
          y: height * (0.74 - envelope * random() * 0.46),
          r: (32 + random() * 62) * (0.55 + envelope * 0.75),
        };
      });
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, height * 0.8);
      ctx.clip();
      const layer = (color: string, dx: number, dy: number, scale: number) => {
        ctx.fillStyle = color;
        puffs.forEach(puff => {
          ctx.beginPath();
          ctx.arc(puff.x + dx, puff.y + dy, puff.r * scale, 0, Math.PI * 2);
          ctx.fill();
        });
      };
      layer('#9fc6ea', 0, 16, 1);
      layer('#d4e8f7', -5, 2, 0.96);
      layer('#ffffff', -13, -13, 0.84);
      ctx.restore();
    });
  });

  const cloudRandom = seeded(5);
  [
    [-300, 118, 470], [-40, 172, 300], [190, 112, 400], [440, 196, 520], [-560, 214, 540],
    [40, 278, 460], [-260, 318, 380], [600, 92, 420], [-700, 100, 420],
  ].forEach(([x, y, width], index) => {
    const cloud = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width / 2),
      new THREE.MeshBasicMaterial({ map: cloudTextures[index % 4], transparent: true, depthWrite: false, fog: false, alphaTest: 0.02 }),
    );
    cloud.position.set(x, y, -600 - cloudRandom() * 120);
    cloud.renderOrder = -8;
    scene.add(cloud);
  });
}

function drawField(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const random = seeded(9);
  const unit = width / FIELD_WIDTH;
  ctx.fillStyle = '#e0b37a';
  ctx.fillRect(0, 0, width, height);
  for (let index = 0; index < 2600; index++) {
    ctx.fillStyle = random() > 0.5 ? 'rgba(160,104,56,.2)' : 'rgba(255,226,176,.28)';
    const size = 1 + random() * 16;
    ctx.beginPath();
    ctx.ellipse(random() * width, random() * height, size * 3, size, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#fffdf2';
  ctx.lineWidth = 0.5 * unit;
  ctx.strokeRect(1.4 * unit, 1.4 * unit, width - 2.8 * unit, height - 2.8 * unit);
  const cx = width / 2;
  const cy = height * 0.66;
  ctx.beginPath(); ctx.moveTo(1.4 * unit, cy); ctx.lineTo(width - 1.4 * unit, cy); ctx.stroke();

  ctx.save();
  ctx.lineCap = 'round';
  for (let index = 0; index < 34; index++) {
    const x = random() * width;
    const y = height * (0.55 + random() * 0.42);
    ctx.strokeStyle = random() > 0.5 ? 'rgba(138,84,44,.34)' : 'rgba(255,232,190,.42)';
    ctx.lineWidth = 3 + random() * 11;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 70 + random() * 170, y - 30 + random() * 60, x + 120 + random() * 280, y - 40 + random() * 80);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = '#fffdf2';
  ctx.lineWidth = 0.42 * unit;
  [-40, 0, 40].forEach(x => {
    ctx.strokeRect(cx + (x - 9) * unit, height - 13.4 * unit, 18 * unit, 12 * unit);
  });

  const radius = 15 * unit;
  ctx.save();
  ctx.setLineDash([2.2 * unit, 1.6 * unit]);
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius * 1.25 + 3.4 * unit, radius + 3.4 * unit, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1.25, 1);
  ctx.beginPath(); ctx.arc(0, 0, radius, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#e0262c'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI); ctx.closePath(); ctx.fillStyle = '#fbf8ee'; ctx.fill();
  ctx.fillStyle = '#16202e';
  ctx.fillRect(-radius, -0.75 * unit, radius * 2, 1.5 * unit);
  ctx.lineWidth = 1.1 * unit;
  ctx.strokeStyle = '#16202e';
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 4.4 * unit, 0, Math.PI * 2); ctx.fillStyle = '#16202e'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, 2.8 * unit, 0, Math.PI * 2); ctx.fillStyle = '#fbf8ee'; ctx.fill();
  ctx.restore();
}

function addGround(scene: THREE.Scene, toon: ToonFactory) {
  const turf = new THREE.Mesh(
    new THREE.CircleGeometry(WALL_RADIUS, 96),
    toon('#ffffff', {
      map: canvasTexture(1024, 1024, (ctx, size) => {
        ctx.fillStyle = '#5ec24b';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#4fb342';
        for (let stripe = 0; stripe < 22; stripe += 2) ctx.fillRect(stripe * size / 22, 0, size / 22, size);
      }),
    }),
  );
  turf.rotation.x = -Math.PI / 2;
  turf.receiveShadow = true;
  scene.add(turf);

  const fieldMap = canvasTexture(2240, 1360, drawField);
  fieldMap.anisotropy = 16;
  const field = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_WIDTH, FIELD_DEPTH), toon('#ffffff', { map: fieldMap }));
  field.rotation.x = -Math.PI / 2;
  field.position.set(0, 0.06, FIELD_Z);
  field.receiveShadow = true;
  scene.add(field);
}

function getStandRows() {
  const rows: { radius: number; height: number }[] = [];
  let radius = WALL_RADIUS + 1.6;
  let height = 7;
  for (let row = 0; row < 21; row++) {
    rows.push({ radius, height });
    radius += row === 10 ? 4.6 : 1.8;
    height += row === 10 ? 3 : 1.2;
  }
  return { rows, topRadius: radius, topHeight: height };
}

function addStands({ scene, players, displayFont, toon }: StadiumOptions) {
  const { rows, topRadius, topHeight } = getStandRows();

  const profile = [new THREE.Vector2(WALL_RADIUS, 0), new THREE.Vector2(WALL_RADIUS, 7)];
  rows.forEach(({ radius, height }) => {
    profile.push(new THREE.Vector2(radius, height), new THREE.Vector2(radius + 1.8, height));
  });
  scene.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 144), toon('#476ca3', { side: THREE.DoubleSide })));

  const wallTexture = canvasTexture(512, 256, (ctx, width, height) => {
    ctx.fillStyle = '#d6262b';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#fbf8ee';
    ctx.fillRect(0, 0, width, 18);
    ctx.fillRect(0, height - 18, width, 18);
    ctx.translate(width / 2, height / 2);
    ctx.beginPath(); ctx.arc(0, 0, 76, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#fbf8ee'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 76, 0, Math.PI); ctx.closePath(); ctx.fillStyle = '#16202e'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fillStyle = '#fbf8ee'; ctx.fill();
  });
  wallTexture.wrapS = THREE.RepeatWrapping;
  wallTexture.repeat.set(26, 1);
  const wallBand = new THREE.Mesh(
    new THREE.CylinderGeometry(WALL_RADIUS - 0.05, WALL_RADIUS - 0.05, 6.6, 144, 1, true),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide, map: wallTexture }),
  );
  wallBand.position.y = 3.3;
  scene.add(wallBand);

  const concourse = rows[11];
  const bandSpacing = players.length > 0 ? 1000 / players.length : 1000;
  const ledTexture = canvasTexture(1024, 64, (ctx, width, height) => {
    ctx.fillStyle = '#10243f';
    ctx.fillRect(0, 0, width, height);
    ctx.font = `400 46px ${displayFont}`;
    ctx.textBaseline = 'middle';
    players.forEach((player, index) => {
      ctx.fillStyle = player.color;
      ctx.fillText(player.name, 24 + index * bandSpacing, height / 2 + 2, bandSpacing - 70);
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath(); ctx.arc((index + 1) * bandSpacing - 22, height / 2, 9, 0, Math.PI * 2); ctx.fill();
    });
  });
  ledTexture.wrapS = THREE.RepeatWrapping;
  ledTexture.repeat.set(9, 1);
  const ledBand = new THREE.Mesh(
    new THREE.CylinderGeometry(concourse.radius - 0.7, concourse.radius - 0.7, 2.5, 144, 1, true),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide, map: ledTexture }),
  );
  ledBand.position.y = concourse.height - 1.9;
  scene.add(ledBand);

  const sectorWidth = players.length > 3 ? 1.02 / players.length : 0.34;
  const sectors = players.map((player, index) => ({
    angle: THREE.MathUtils.degToRad(-90 + (index - (players.length - 1) / 2) * (players.length > 3 ? 126 / players.length : 42)),
    color: new THREE.Color(player.color),
  }));
  const neutrals = ['#ffffff', '#ffd34d', '#ffb7c3', '#3e5e96', '#8cc6ef', '#f26a4b', '#f4efe0'].map(color => new THREE.Color(color));
  const standTint = new THREE.Color('#476ca3');
  const rimShade = new THREE.Color(0.5, 0.56, 0.86);
  const aisle = Math.PI / 12;
  const random = seeded(77);
  const seats: { angle: number; radius: number; height: number; color: THREE.Color }[] = [];
  rows.forEach(({ radius, height }) => {
    const count = Math.floor(radius * Math.PI * 2 / 1.02);
    for (let index = 0; index < count; index++) {
      if (random() < 0.1) continue;
      const angle = (index + random() * 0.5) / count * Math.PI * 2;
      if (angle % aisle < 0.022) continue;
      let color = neutrals[Math.floor(random() * neutrals.length)];
      for (const sector of sectors) {
        const distance = Math.abs(Math.atan2(Math.sin(angle - sector.angle), Math.cos(angle - sector.angle)));
        if (distance < sectorWidth && random() < 0.9) color = sector.color;
      }
      const tinted = color.clone().lerp(standTint, 0.2);
      const reach = Math.max(0, Math.cos(angle) * -0.95 + Math.sin(angle) * -0.2);
      if (height < 4 + reach * 37) tinted.multiply(rimShade);
      seats.push({ angle, radius: radius + 0.9, height, color: tinted });
    }
  });

  const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.74, 1.3, 0.7), new THREE.MeshLambertMaterial(), seats.length);
  const matrix = new THREE.Matrix4();
  seats.forEach((seat, index) => {
    matrix.makeRotationY(-seat.angle);
    matrix.setPosition(Math.cos(seat.angle) * seat.radius, seat.height + 0.65, Math.sin(seat.angle) * seat.radius);
    crowd.setMatrixAt(index, matrix);
    crowd.setColorAt(index, seat.color);
  });
  scene.add(crowd);

  const columnCount = 96;
  const columns = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 9, 2.4), toon('#f1ead8'), columnCount);
  for (let index = 0; index < columnCount; index++) {
    const angle = index / columnCount * Math.PI * 2;
    matrix.makeRotationY(-angle);
    matrix.setPosition(Math.cos(angle) * (topRadius + 1), topHeight + 4.5, Math.sin(angle) * (topRadius + 1));
    columns.setMatrixAt(index, matrix);
  }
  scene.add(columns);

  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(topRadius + 2.6, topRadius + 2.6, 3.2, 144, 1, true),
    toon('#f1ead8', { side: THREE.DoubleSide }),
  );
  ring.position.y = topHeight + 10.4;
  const trim = new THREE.Mesh(
    new THREE.CylinderGeometry(topRadius + 2.5, topRadius + 2.5, 0.8, 144, 1, true),
    new THREE.MeshBasicMaterial({ color: '#d6262b', side: THREE.BackSide }),
  );
  trim.position.y = topHeight + 9.6;
  scene.add(ring, trim);

  return { topRadius, topHeight };
}

function addFlags(
  { scene, players, toon }: StadiumOptions,
  topRadius: number,
  topHeight: number,
  windTime: THREE.IUniform<number>,
) {
  const colors = [...players.map(player => new THREE.Color(player.color)), new THREE.Color('#fbf8ee')];
  const count = 40;
  const geometry = new THREE.PlaneGeometry(9, 5, 14, 1);
  geometry.translate(4.5, 0, 0);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    shader.uniforms.uWind = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float phase = instanceMatrix[3].x * 0.3 + instanceMatrix[3].z * 0.17;
        float amount = position.x / 9.0;
        transformed.z += sin(position.x * 0.9 - uWind * 3.2 + phase) * 0.8 * amount;
        transformed.y += sin(position.x * 0.6 - uWind * 2.4 + phase) * 0.4 * amount;`);
  };

  const flags = new THREE.InstancedMesh(geometry, material, count);
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.22, 11, 6), toon('#e9edf2'), count);
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.4);
  for (let index = 0; index < count; index++) {
    const angle = (index + 0.5) / count * Math.PI * 2;
    const x = Math.cos(angle) * (topRadius + 2.6);
    const z = Math.sin(angle) * (topRadius + 2.6);
    // Vor der Anzeigetafel steht keine Fahne.
    const size = Math.abs(x) < 52 && z < 0 ? 0 : 1;
    matrix.makeScale(size, size, size).setPosition(x, topHeight + 17, z);
    poles.setMatrixAt(index, matrix);
    matrix.compose(new THREE.Vector3(x, topHeight + 20, z), rotation, new THREE.Vector3(size, size, size));
    flags.setMatrixAt(index, matrix);
    flags.setColorAt(index, colors[index % colors.length]);
  }
  scene.add(flags, poles);
}

function addBirds(scene: THREE.Scene) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(
    [-3.2, 0.9, 0, 0, 0, 0, -0.7, -0.4, 0, 3.2, 0.9, 0, 0.7, -0.4, 0, 0, 0, 0],
    3,
  ));
  const birds = Array.from({ length: 9 }, (_, index) => ({
    x: 60 + (index % 3) * 22 + index * 5,
    y: 150 + (index % 4) * 11 - index,
    flap: index * 1.7,
  }));
  const mesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: '#27364f', side: THREE.DoubleSide, fog: false }),
    birds.length,
  );
  mesh.frustumCulled = false;
  scene.add(mesh);

  const matrix = new THREE.Matrix4();
  return (time: number) => {
    birds.forEach((bird, index) => {
      const x = ((bird.x + time * 7 + 420) % 840) - 420;
      const flap = Math.sin(time * 9 + bird.flap) > 0 ? 1 : 0.35;
      matrix.makeScale(1, flap, 1).setPosition(x, bird.y + Math.sin(time * 0.6 + index) * 2, -420);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
}

function createFlameMaterial(flameTime: THREE.IUniform<number>) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: flameTime },
    side: THREE.DoubleSide,
    vertexShader: quadVertex,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float y = vUv.y;
        float n = noise(vec2(vUv.x * 4.0, y * 3.2 - uTime * 2.2)) * 0.65 + noise(vec2(vUv.x * 9.0, y * 7.0 - uTime * 3.6)) * 0.35;
        float width = pow(1.0 - y, 0.75) * 0.44 * smoothstep(0.0, 0.1, y);
        float d = abs(vUv.x - 0.5 + (n - 0.5) * 0.3 * y) / max(width, 0.001);
        float v = 1.0 - d + (n - 0.5) * 0.75 * y;
        if (v < 0.08) discard;
        vec3 color = v > 0.66 ? vec3(1.0, 0.93, 0.56) : v > 0.36 ? vec3(1.0, 0.62, 0.1) : vec3(0.92, 0.2, 0.06);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function addTorches(
  scene: THREE.Scene,
  toon: ToonFactory,
  flameMaterial: THREE.ShaderMaterial,
  topRadius: number,
  topHeight: number,
) {
  const billboards: THREE.Mesh[] = [];
  const haloTexture = canvasTexture(128, 128, (ctx, size) => {
    const glow = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    glow.addColorStop(0, 'rgba(255,190,90,.75)');
    glow.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
  });

  [-76, 76].forEach(x => {
    const z = -Math.sqrt((topRadius + 4) ** 2 - x ** 2);
    const towerHeight = topHeight + 15;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.6, towerHeight, 10), toon('#f1ead8'));
    tower.position.set(x, towerHeight / 2, z);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 3.6, 5, 14), toon('#d9a43a'));
    bowl.position.set(x, towerHeight + 2.3, z);
    const flame = new THREE.Mesh(new THREE.PlaneGeometry(15, 27), flameMaterial);
    flame.position.set(x, towerHeight + 16.6, z);
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(58, 58),
      new THREE.MeshBasicMaterial({ map: haloTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    halo.position.set(x, towerHeight + 13, z - 1);
    scene.add(tower, bowl, flame, halo);
    billboards.push(flame, halo);
  });

  return billboards;
}

function createScoreboard(
  { scene, displayFont, toon }: StadiumOptions,
  topRadius: number,
  topHeight: number,
) {
  const texture = canvasTexture(1280, 540, () => undefined);
  const canvas = texture.image as HTMLCanvasElement;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(64, 27), new THREE.MeshBasicMaterial({ map: texture, fog: false }));
  const housing = new THREE.Mesh(new THREE.BoxGeometry(67.6, 30.4, 3), toon('#232f40'));
  housing.position.z = -1.7;
  const board = new THREE.Group();
  board.add(panel, housing);
  board.position.set(0, topHeight + 15, -topRadius + 9);
  scene.add(board);

  let drawnKey = '';

  return (data: ArenaSceneData) => {
    const key = JSON.stringify([
      data.runNumber,
      data.gameName,
      data.players.map(player => [player.knockedOut, player.slots.map(Boolean)]),
    ]);
    if (key === drawnKey) return;
    drawnKey = key;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#10243f';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#e0262c';
    ctx.fillRect(0, 0, width, 104);
    ctx.fillStyle = '#fff';
    ctx.font = `400 78px ${displayFont}`;
    ctx.fillText(data.runNumber === null ? 'Kein Run' : `Run ${data.runNumber}`, 34, 80);
    if (data.gameName) {
      ctx.textAlign = 'right';
      ctx.font = `400 56px ${displayFont}`;
      ctx.fillText(data.gameName, width - 34, 76, 800);
    }

    const rowHeight = Math.min(124, 424 / Math.max(1, data.players.length));
    const fontSize = Math.round(rowHeight * 0.71);
    const ballRadius = Math.min(25, rowHeight * 0.2);
    const miniBall = (x: number, y: number, filled: boolean) => {
      ctx.beginPath(); ctx.arc(x, y, ballRadius, 0, Math.PI * 2);
      ctx.fillStyle = filled ? '#fff' : '#1f3757';
      ctx.fill();
      if (!filled) return;
      ctx.beginPath(); ctx.arc(x, y, ballRadius, Math.PI, 0); ctx.fillStyle = '#e0262c'; ctx.fill();
      ctx.fillStyle = '#10243f'; ctx.fillRect(x - ballRadius, y - 3, ballRadius * 2, 6);
      ctx.beginPath(); ctx.arc(x, y, ballRadius * 0.32, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    };

    data.players.forEach((player, index) => {
      const y = 104 + rowHeight * index + rowHeight * 0.76;
      ctx.textAlign = 'left';
      ctx.fillStyle = player.color;
      ctx.font = `400 ${fontSize}px ${displayFont}`;
      ctx.fillText(player.name, 34, y, 380);
      player.slots.forEach((pokemon, slot) => miniBall(446 + slot * ballRadius * 2.48, y - fontSize * 0.34, Boolean(pokemon)));
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff';
      ctx.fillText(`${player.knockedOut} K.O.`, width - 34, y);
    });
    texture.needsUpdate = true;
  };
}

export function buildStadium(options: StadiumOptions) {
  const { scene, toon } = options;
  const windTime: THREE.IUniform<number> = { value: 0 };
  const flameTime: THREE.IUniform<number> = { value: 0 };
  const flameMaterial = createFlameMaterial(flameTime);

  addSky(scene);
  addGround(scene, toon);
  const { topRadius, topHeight } = addStands(options);
  addFlags(options, topRadius, topHeight, windTime);
  const updateBirds = addBirds(scene);
  const billboards = addTorches(scene, toon, flameMaterial, topRadius, topHeight);
  const drawScoreboard = createScoreboard(options, topRadius, topHeight);

  return {
    windTime,
    flameMaterial,
    drawScoreboard,
    tick(time: number, camera: THREE.Camera) {
      windTime.value = time;
      flameTime.value = time;
      updateBirds(time);
      billboards.forEach(mesh => {
        mesh.rotation.y = Math.atan2(camera.position.x - mesh.position.x, camera.position.z - mesh.position.z);
      });
    },
  };
}
