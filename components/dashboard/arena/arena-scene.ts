import * as THREE from 'three';
import {
  canvasTexture,
  clamp01,
  createToonFactory,
  drawPokeballEmblem,
  easeOutBack,
  easeOutCubic,
  makePokeball,
  roundedRect,
  seeded,
  type ToonFactory,
} from './arena-kit';
import { getArenaAnchors, resolveArenaFocus, type ArenaAnchor, type ArenaPlayer, type ArenaPokemon, type ArenaSceneData } from './arena-model';
import { createArenaPost } from './arena-post';
import { buildStadium, SUN_POSITION } from './arena-stadium';

const RISER = 4.7;
const DAIS = 1.2;
const SPRITE_SIZE = 6.8;
const SHADOW_ANGLE = -0.9;
const SHADOW_LENGTH = SPRITE_SIZE * 0.72;
const SLOT_POSITIONS: readonly (readonly [number, number, number])[] = [
  [-6.8, -3.7, RISER], [0, -3.7, RISER], [6.8, -3.7, RISER],
  [-6.8, 3.9, 0], [0, 3.9, 0], [6.8, 3.9, 0],
];
const IDLE_FPS = 12;
const INTRO_START = new THREE.Vector3(-38, 58, 102);
const HOP_INTERVAL = 4.5;
const HOP_DURATION = 0.45;

const spriteVertex = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const spriteFragment = `
  uniform sampler2D map; uniform float uFlash; varying vec2 vUv;
  void main() {
    vec4 texel = texture2D(map, vUv);
    if (texel.a < 0.45) discard;
    float lit = 1.0 - texture2D(map, vUv + vec2(-0.014, 0.018)).a;
    float shade = 1.0 - texture2D(map, vUv + vec2(0.024, -0.03)).a;
    vec3 color = texel.rgb;
    color *= mix(vec3(1.0), vec3(0.62, 0.66, 0.86), smoothstep(0.3, 0.7, shade));
    color += vec3(1.0, 0.86, 0.62) * smoothstep(0.3, 0.7, lit) * 0.34;
    color = mix(color, vec3(1.0, 1.0, 0.96), uFlash);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }`;
const shadowFragment = `
  uniform sampler2D map; varying vec2 vUv;
  void main() {
    if (texture2D(map, vUv).a < 0.45) discard;
    gl_FragColor = vec4(0.1, 0.13, 0.3, 0.5);
    #include <colorspace_fragment>
  }`;

interface LoadedSprite {
  texture: THREE.Texture;
  top: number;
  bottom: number;
}

interface PodiumSlot {
  playerIndex: number;
  slotIndex: number;
  x: number;
  z: number;
  surface: number;
  group: THREE.Group;
  ball: THREE.Group;
  glow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  sprite: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  shadow: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  burst: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  tag: HTMLSpanElement;
  pokemon: ArenaPokemon | null;
  loaded: LoadedSprite | null;
  baseY: number;
  arrive: number;
  loadToken: number;
}

export interface ArenaSceneOptions {
  host: HTMLElement;
  tagHost: HTMLElement;
  data: ArenaSceneData;
  displayFont: string;
  tagClassName: string;
  hotTagClassName: string;
  reducedMotion: boolean;
  onFocusChange: (playerIndex: number) => void;
  onPokemonActivate: (playerIndex: number, slotIndex: number) => void;
  onFailure: () => void;
}

export interface ArenaSceneHandle {
  update: (data: ArenaSceneData) => void;
  setFocus: (playerIndex: number) => void;
  dispose: () => void;
}

function readArtBounds(image: HTMLImageElement) {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { top: 0.05, bottom: 0.05 };

  context.drawImage(image, 0, 0, size, size);
  const { data } = context.getImageData(0, 0, size, size);
  let top = size;
  let bottom = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[(y * size + x) * 4 + 3] > 100) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return { top: top / size, bottom: 1 - (bottom + 1) / size };
}

function loadSprite(url: string): Promise<LoadedSprite> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      texture.needsUpdate = true;
      resolve({ texture, ...readArtBounds(image) });
    };
    image.onerror = () => reject(new Error(`Sprite konnte nicht geladen werden: ${url}`));
    image.src = url;
  });
}

function buildPodiumBody(
  group: THREE.Group,
  player: ArenaPlayer,
  playerIndex: number,
  toon: ToonFactory,
  displayFont: string,
  flameMaterial: THREE.ShaderMaterial,
  emblem: THREE.Texture,
  windTime: THREE.IUniform<number>,
) {
  const stone = toon('#b9ae95');
  const stoneLight = toon('#e9e3d2');
  const steel = toon('#dfe5ec');
  const braziers: THREE.Mesh[] = [];

  const daisGeometry = new THREE.ExtrudeGeometry(roundedRect(22.5, 15.5, 1), { depth: DAIS, bevelEnabled: false, curveSegments: 6 });
  daisGeometry.rotateX(-Math.PI / 2);
  const dais = new THREE.Mesh(daisGeometry, stone);
  dais.castShadow = dais.receiveShadow = true;
  group.add(dais);

  const trim = new THREE.Mesh(new THREE.BoxGeometry(22.6, 0.36, 15.6), new THREE.MeshBasicMaterial({ color: player.color }));
  trim.position.y = 0.46;
  group.add(trim);

  const masonry = canvasTexture(1024, 230, (ctx, width, height) => {
    const random = seeded(31 + playerIndex);
    ctx.fillStyle = '#a99d84';
    ctx.fillRect(0, 0, width, height);
    const courseHeight = height / 4;
    for (let course = 0; course < 4; course++) {
      for (let x = -((course % 2) * 62); x < width; x += 124) {
        ctx.fillStyle = ['#e2d9c4', '#d8cfb9', '#cbc1a9', '#ded5bf'][Math.floor(random() * 4)];
        ctx.fillRect(x + 3, course * courseHeight + 3, 118, courseHeight - 6);
      }
    }
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 150, 0); ctx.lineTo(width / 2 + 150, 0); ctx.lineTo(width / 2 + 150, height - 44);
    ctx.lineTo(width / 2, height - 6); ctx.lineTo(width / 2 - 150, height - 44); ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#16202e';
    ctx.stroke();
  });
  const riserSide = toon('#d3cab4');
  const riser = new THREE.Mesh(
    new THREE.BoxGeometry(21.2, RISER, 6.4),
    [riserSide, riserSide, stoneLight, riserSide, toon('#ffffff', { map: masonry }), riserSide],
  );
  riser.position.set(0, DAIS + RISER / 2, -3.7);
  riser.castShadow = riser.receiveShadow = true;
  group.add(riser);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(22, 0.42, 7.2), stone);
  cap.position.set(0, DAIS + RISER + 0.12, -3.7);
  cap.castShadow = cap.receiveShadow = true;
  group.add(cap);

  [0, 1].forEach(step => {
    const stair = new THREE.Mesh(new THREE.BoxGeometry(9 - step * 1.4, 0.4, 1.3), stoneLight);
    stair.position.set(0, 0.2 + step * 0.4, 8.3 - step * 0.65);
    stair.castShadow = stair.receiveShadow = true;
    group.add(stair);
  });

  [-10.2, 10.2].forEach(x => {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.45, 0.8, 12), toon('#d9a43a'));
    bowl.position.set(x, DAIS + RISER + 0.72, -1.6);
    const flame = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.6), flameMaterial);
    flame.position.set(x, DAIS + RISER + 2.1, -1.6);
    group.add(bowl, flame);
    braziers.push(flame);
  });

  const crest = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 32),
    new THREE.MeshBasicMaterial({ map: emblem, transparent: true, alphaTest: 0.5 }),
  );
  crest.position.set(0, DAIS + RISER / 2, -0.48);
  group.add(crest);

  const clothMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    map: canvasTexture(1024, 262, (ctx, width, height) => {
      ctx.fillStyle = player.color;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(22,32,46,.14)';
      for (let fold = 0; fold < 6; fold++) ctx.fillRect(70 + fold * 172, 0, 46, height);
      ctx.fillStyle = '#16202e';
      ctx.fillRect(0, 0, width, 12);
      ctx.fillRect(0, height - 12, width, 12);
      ctx.font = `400 196px ${displayFont}`;
      ctx.textAlign = 'center';
      ctx.fillText(player.name, width / 2, 176, width - 80);
    }),
  });
  clothMaterial.onBeforeCompile = shader => {
    shader.uniforms.uWind = windTime;
    shader.uniforms.uSeed = { value: playerIndex * 2.1 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind; uniform float uSeed;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.z += sin(position.x * 0.42 - uWind * 2.2 + uSeed) * 0.34 + sin(position.x * 0.9 + uWind * 1.4) * 0.12;`);
  };
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.6, 24, 1), clothMaterial);
  cloth.position.set(0, 17.2, -9.2);
  group.add(cloth);

  [-9.3, 9.3].forEach(x => {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 19.8, 8), steel);
    mast.position.set(x, 9.9, -9.2);
    mast.castShadow = true;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 8), new THREE.MeshBasicMaterial({ color: player.color }));
    tip.position.set(x, 20, -9.2);
    group.add(mast, tip);
  });

  return { braziers, stoneLight };
}

export function createArenaScene(options: ArenaSceneOptions): ArenaSceneHandle {
  const { host, tagHost, data: initialData, displayFont, reducedMotion } = options;

  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  } catch (error) {
    canvas.remove();
    throw error;
  }
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Nur Pokébälle ändern den Schattenwurf, die Schattenkarte muss nicht jedes Bild neu entstehen.
  renderer.shadowMap.autoUpdate = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#d3ecf8', 150, 520);
  const camera = new THREE.PerspectiveCamera(36, 2, 2, 1100);
  const post = createArenaPost(camera);
  const toon = createToonFactory();

  scene.add(new THREE.AmbientLight('#d3e4ff', 0.9));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.8);
  sun.position.set(-70, 110, 62);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 70, bottom: -70, far: 320 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  const stadium = buildStadium({ scene, players: initialData.players, displayFont, toon });

  const emblem = canvasTexture(256, 256, (ctx, size) => {
    ctx.translate(size / 2, size / 2);
    drawPokeballEmblem(ctx, 118);
  });
  const ringTexture = canvasTexture(256, 256, (ctx, size) => {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2); ctx.stroke();
  });
  const spriteGeometry = new THREE.PlaneGeometry(1, 1);
  spriteGeometry.translate(0, 0.5, 0);
  const shadowGeometry = new THREE.PlaneGeometry(1, 1);
  shadowGeometry.translate(0, 0.5, 0);
  shadowGeometry.rotateX(-Math.PI / 2);

  const anchors: ArenaAnchor[] = getArenaAnchors(initialData.players.length);
  const slots: PodiumSlot[] = [];
  const braziers: THREE.Mesh[] = [];
  const sprites = new Map<string, Promise<LoadedSprite>>();

  let needsFrames = 8;
  let busyUntil = 0;
  let seconds = 0;
  let disposed = false;

  initialData.players.forEach((player, playerIndex) => {
    const anchor = anchors[playerIndex];
    const group = new THREE.Group();
    group.position.set(anchor.x, 0, anchor.z);
    group.rotation.y = anchor.yaw;
    group.scale.setScalar(anchor.scale);
    scene.add(group);

    const body = buildPodiumBody(group, player, playerIndex, toon, displayFont, stadium.flameMaterial, emblem, stadium.windTime);
    braziers.push(...body.braziers);

    SLOT_POSITIONS.forEach(([x, z, rise], slotIndex) => {
      const surface = DAIS + rise;
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.34, 28), body.stoneLight);
      pedestal.position.set(x, surface + 0.17, z);
      pedestal.castShadow = pedestal.receiveShadow = true;
      const inlay = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.09, 8, 36), new THREE.MeshBasicMaterial({ color: player.color }));
      inlay.rotation.x = Math.PI / 2;
      inlay.position.set(x, surface + 0.36, z);

      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(2.02, 30),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6 }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(x, surface + 0.35, z);
      glow.visible = false;

      const ball = makePokeball(toon);
      ball.position.set(x, surface + 1.14, z);
      ball.rotation.y = 0.24 * Math.sign(-x || 1);

      const sprite = new THREE.Mesh(spriteGeometry, new THREE.ShaderMaterial({
        vertexShader: spriteVertex,
        fragmentShader: spriteFragment,
        side: THREE.DoubleSide,
        uniforms: { map: { value: null }, uFlash: { value: 0 } },
      }));
      sprite.visible = false;
      const shadow = new THREE.Mesh(shadowGeometry, new THREE.ShaderMaterial({
        vertexShader: spriteVertex,
        fragmentShader: shadowFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { map: { value: null } },
      }));
      shadow.visible = false;
      shadow.rotation.y = SHADOW_ANGLE;

      const burst = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: ringTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }),
      );
      burst.rotation.x = -Math.PI / 2;
      burst.position.set(x, surface + 0.5, z);
      burst.visible = false;

      group.add(pedestal, inlay, glow, ball, sprite, shadow, burst);

      const tag = document.createElement('span');
      tag.className = options.tagClassName;
      tag.hidden = true;
      tagHost.append(tag);

      const slot: PodiumSlot = {
        playerIndex, slotIndex, x, z, surface, group, ball, glow, sprite, shadow, burst, tag,
        pokemon: null, loaded: null, baseY: surface, arrive: 0, loadToken: 0,
      };
      sprite.userData.slot = slot;
      slots.push(slot);
    });
  });

  const hitTargets = slots.map(slot => slot.sprite);

  function clearSlot(slot: PodiumSlot) {
    slot.pokemon = null;
    slot.loaded = null;
    slot.loadToken += 1;
    slot.ball.visible = true;
    slot.glow.visible = false;
    slot.sprite.visible = false;
    slot.shadow.visible = false;
    slot.burst.visible = false;
    slot.tag.hidden = true;
    renderer.shadowMap.needsUpdate = true;
  }

  function assignSlot(slot: PodiumSlot, pokemon: ArenaPokemon, arrive: number) {
    clearSlot(slot);
    slot.pokemon = pokemon;
    slot.tag.textContent = pokemon.name;
    slot.glow.material.color.set(pokemon.typeColor);
    slot.glow.visible = true;

    if (!pokemon.spriteUrl) return;
    let sprite = sprites.get(pokemon.spriteUrl);
    if (!sprite) {
      sprite = loadSprite(pokemon.spriteUrl);
      sprites.set(pokemon.spriteUrl, sprite);
    }

    const token = slot.loadToken;
    sprite.then(loaded => {
      if (disposed || token !== slot.loadToken) return;
      slot.loaded = loaded;
      slot.sprite.material.uniforms.map.value = loaded.texture;
      slot.shadow.material.uniforms.map.value = loaded.texture;
      slot.baseY = slot.surface + 0.34 - loaded.bottom * SPRITE_SIZE;
      slot.sprite.position.set(slot.x, slot.baseY, slot.z);
      slot.shadow.scale.set(SPRITE_SIZE, 1, SHADOW_LENGTH);
      const offset = -loaded.bottom * SHADOW_LENGTH;
      slot.shadow.position.set(
        slot.x - Math.sin(SHADOW_ANGLE) * offset,
        slot.surface + 0.37,
        slot.z - Math.cos(SHADOW_ANGLE) * offset,
      );
      slot.arrive = Math.max(arrive, seconds + 0.05);
      busyUntil = Math.max(busyUntil, slot.arrive + 1);
      needsFrames = Math.max(needsFrames, 4);
    }).catch(() => {
      // Ohne Sprite bleibt der Pokéball stehen, die Kampfbox nennt das Pokémon weiter.
      sprites.delete(pokemon.spriteUrl as string);
    });
  }

  function applyData(data: ArenaSceneData, introStart: number | null) {
    data.players.forEach((player, playerIndex) => {
      player.slots.forEach((pokemon, slotIndex) => {
        const slot = slots.find(entry => entry.playerIndex === playerIndex && entry.slotIndex === slotIndex);
        if (!slot) return;
        if (slot.pokemon?.key === pokemon?.key) {
          if (pokemon) {
            slot.pokemon = pokemon;
            slot.tag.textContent = pokemon.name;
          }
          return;
        }
        if (!pokemon) {
          clearSlot(slot);
          return;
        }
        const arrive = introStart === null ? seconds : introStart + playerIndex * 0.42 + (slotIndex - 2) * 0.13;
        assignSlot(slot, pokemon, arrive);
      });
    });
    stadium.drawScoreboard(data);
    needsFrames = Math.max(needsFrames, 2);
  }

  /* Kamera */
  const totalShot = { position: new THREE.Vector3(0, 16, 90), target: new THREE.Vector3(0, 12.4, -8) };
  let shot = totalShot;
  let focus = -1;
  let portrait = false;
  let playerFit = 1;
  let viewWidth = 1;
  let viewHeight = 1;
  let visible = true;

  const playerShot = (index: number) => {
    const anchor = anchors[index];
    const distance = 47 * playerFit * Math.max(0.7, anchor.scale);
    const origin = new THREE.Vector3(anchor.x, 0, anchor.z);
    return {
      position: origin.clone().add(new THREE.Vector3(Math.sin(anchor.yaw) * distance, 9, Math.cos(anchor.yaw) * distance)),
      target: origin.clone().add(new THREE.Vector3(0, 7.4, 0)),
    };
  };

  const applyFocus = (next: number) => {
    focus = next;
    shot = focus < 0 || !anchors[focus] ? totalShot : playerShot(focus);
    needsFrames = Math.max(needsFrames, 4);
  };

  const requestFocus = (requested: number) => {
    const next = resolveArenaFocus(requested, focus, anchors.length, portrait);
    if (next !== requested) options.onFocusChange(next);
    if (next !== focus) applyFocus(next);
  };

  function layout() {
    viewWidth = Math.max(1, host.clientWidth);
    viewHeight = Math.max(1, host.clientHeight);
    renderer.setSize(viewWidth, viewHeight, false);
    const ratio = renderer.getPixelRatio();
    post.resize(Math.floor(viewWidth * ratio), Math.floor(viewHeight * ratio));

    camera.aspect = viewWidth / viewHeight;
    portrait = camera.aspect < 1;
    camera.fov = portrait ? 52 : 36;
    camera.updateProjectionMatrix();
    post.uniforms.uAspect.value = camera.aspect;

    const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const fit = Math.max(1, 92 / (2 * 98 * halfTan * camera.aspect));
    playerFit = Math.max(1, (portrait ? 25 : 31) / (2 * 47 * halfTan * camera.aspect));
    totalShot.position.set(0, 16, Math.min(106, 90 * fit));

    requestFocus(focus);
    applyFocus(focus);
    needsFrames = Math.max(needsFrames, 4);
  }

  /* Eingaben */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered: PodiumSlot | null = null;

  const pick = (event: PointerEvent | MouseEvent) => {
    const box = canvas.getBoundingClientRect();
    pointer.set(
      (event.clientX - box.left) / box.width * 2 - 1,
      -(event.clientY - box.top) / box.height * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const visibleTargets = hitTargets.filter(target => target.visible);
    return (raycaster.intersectObjects(visibleTargets)[0]?.object.userData.slot as PodiumSlot | undefined) ?? null;
  };

  const setHovered = (slot: PodiumSlot | null) => {
    if (slot === hovered) return;
    if (hovered?.pokemon) {
      hovered.tag.classList.remove(options.hotTagClassName);
      hovered.tag.textContent = hovered.pokemon.name;
    }
    hovered = slot;
    if (hovered?.pokemon) {
      hovered.tag.classList.add(options.hotTagClassName);
      hovered.tag.textContent = `${hovered.pokemon.name}, ${hovered.pokemon.baseTotal} BP`;
    }
    canvas.style.cursor = slot ? 'pointer' : '';
  };

  const handlePointerMove = (event: PointerEvent) => setHovered(pick(event));
  const handlePointerLeave = () => setHovered(null);
  const handleClick = (event: MouseEvent) => {
    const slot = pick(event);
    if (!slot) return;
    if (slot.playerIndex === focus) {
      options.onPokemonActivate(slot.playerIndex, slot.slotIndex);
      return;
    }
    applyFocus(slot.playerIndex);
    options.onFocusChange(slot.playerIndex);
  };
  const handleContextLost = (event: Event) => {
    event.preventDefault();
    options.onFailure();
  };

  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerleave', handlePointerLeave);
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('webglcontextlost', handleContextLost);

  const resizeObserver = new ResizeObserver(layout);
  resizeObserver.observe(host);
  const visibilityObserver = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    if (visible) needsFrames = Math.max(needsFrames, 2);
  });
  visibilityObserver.observe(host);

  layout();
  const currentPosition = reducedMotion ? shot.position.clone() : INTRO_START.clone();
  const currentTarget = shot.target.clone();

  /* Bildschleife */
  const worldPoint = new THREE.Vector3();
  const sunProjected = new THREE.Vector3();
  const INTRO_END = 3.8;
  const INTRO_SEND_OUT = 0.95;
  let startTime: number | null = null;
  let lastRender = -1;
  let frameRequest = 0;

  function updateSlots() {
    const activeSlots = slots.filter(slot => slot.loaded);
    activeSlots.forEach(slot => {
      const { sprite, shadow, ball, burst, tag, loaded } = slot;
      if (!loaded) return;

      sprite.parent?.getWorldPosition(worldPoint);
      const yaw = Math.atan2(camera.position.x - worldPoint.x, camera.position.z - worldPoint.z);
      sprite.rotation.y = yaw - (sprite.parent?.rotation.y ?? 0);

      const age = reducedMotion ? 9 : seconds - slot.arrive;
      const out = age >= 0;
      if (ball.visible === out) renderer.shadowMap.needsUpdate = true;
      ball.visible = !out;
      sprite.visible = out;
      shadow.visible = age > 0.22;

      if (out) {
        const pop = easeOutBack(clamp01(age / 0.34));
        sprite.scale.set(SPRITE_SIZE * pop, SPRITE_SIZE * pop, 1);
        sprite.material.uniforms.uFlash.value = 1 - clamp01((age - 0.14) / 0.36);
        const blast = clamp01(age / 0.5);
        burst.scale.setScalar(1 + easeOutCubic(blast) * 11);
        burst.material.opacity = (1 - blast) * 0.95;
        burst.visible = blast < 1;

        // Wie im Kampfbildschirm hüpft reihum immer nur ein Pokémon kurz.
        let hop = 0;
        if (!reducedMotion && seconds > INTRO_END) {
          const beat = seconds / HOP_INTERVAL;
          const turn = (beat % 1) * HOP_INTERVAL;
          if (activeSlots[Math.floor(beat) % activeSlots.length] === slot && turn < HOP_DURATION) {
            hop = Math.sin(turn / HOP_DURATION * Math.PI) * 0.75;
          }
        }
        sprite.position.y = slot.baseY + hop;
      }

      tag.hidden = !out || age < 0.4;
      if (!tag.hidden) {
        worldPoint.set(slot.x, slot.baseY + SPRITE_SIZE * (1 - loaded.top) + 0.3, slot.z);
        slot.group.localToWorld(worldPoint).project(camera);
        const x = (worldPoint.x + 1) / 2 * viewWidth;
        const y = (1 - worldPoint.y) / 2 * viewHeight;
        tag.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      }
    });
  }

  // Anime läuft "on twos": Im Ruhezustand reichen 12 Bilder pro Sekunde, das schont die GPU neben dem Spiel.
  function frame(time: number) {
    frameRequest = requestAnimationFrame(frame);
    if (!visible) return;

    startTime ??= time;
    const previous = seconds;
    seconds = (time - startTime) / 1000;
    const moving = currentPosition.distanceTo(shot.position) > 0.02 || currentTarget.distanceTo(shot.target) > 0.02;
    const busy = (!reducedMotion && seconds < INTRO_END) || seconds < busyUntil || moving || needsFrames > 0;
    if (!busy && (reducedMotion || time - lastRender < 1000 / IDLE_FPS)) return;
    lastRender = time;
    if (needsFrames > 0) needsFrames -= 1;

    const delta = Math.min(0.1, seconds - previous);
    const speed = reducedMotion ? 1 : 1 - Math.exp(-delta * (seconds > INTRO_END ? 2.6 : 1.5));
    currentPosition.lerp(shot.position, speed);
    currentTarget.lerp(shot.target, speed);
    camera.position.copy(currentPosition);
    camera.lookAt(currentTarget);
    camera.updateMatrixWorld();

    stadium.tick(reducedMotion ? 0 : Math.floor(seconds * IDLE_FPS) / IDLE_FPS, camera);
    braziers.forEach(flame => {
      flame.parent?.getWorldPosition(worldPoint);
      flame.rotation.y = Math.atan2(camera.position.x - worldPoint.x, camera.position.z - worldPoint.z)
        - (flame.parent?.rotation.y ?? 0);
    });
    updateSlots();

    sunProjected.copy(SUN_POSITION).project(camera);
    post.uniforms.uSun.value.set((sunProjected.x + 1) / 2, (sunProjected.y + 1) / 2);
    post.uniforms.uFlare.value = focus < 0 && Math.abs(sunProjected.x) < 1.05 && Math.abs(sunProjected.y) < 1.05 ? 1 : 0;

    post.render(renderer, scene);
  }

  renderer.shadowMap.needsUpdate = true;
  applyData(initialData, INTRO_SEND_OUT);
  frameRequest = requestAnimationFrame(frame);

  return {
    update: data => applyData(data, null),
    setFocus: requestFocus,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frameRequest);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      slots.forEach(slot => slot.tag.remove());
      sprites.forEach(sprite => {
        sprite.then(loaded => loaded.texture.dispose()).catch(() => undefined);
      });

      scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        materials.forEach(material => {
          (material as THREE.MeshBasicMaterial).map?.dispose();
          material.dispose();
        });
      });
      post.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
