import * as THREE from 'three';

export type ToonFactory = (
  color: THREE.ColorRepresentation,
  extra?: THREE.MeshToonMaterialParameters,
) => THREE.MeshToonMaterial;

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export const easeOutBack = (t: number) => {
  const c = 1.45;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

export function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

export function canvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas-2D-Kontext ist nicht verfügbar.');

  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function roundedRect(width: number, height: number, radius: number) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

export function createToonFactory(): ToonFactory {
  // Drei harte Lichtstufen ergeben den Cel-Look.
  const ramp = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...extra });
}

export function drawPokeballEmblem(ctx: CanvasRenderingContext2D, radius: number) {
  ctx.beginPath(); ctx.arc(0, 0, radius, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#e0262c'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI); ctx.closePath(); ctx.fillStyle = '#fbf8ee'; ctx.fill();
  ctx.fillStyle = '#16202e';
  ctx.fillRect(-radius, -radius * 0.076, radius * 2, radius * 0.152);
  ctx.lineWidth = radius * 0.093;
  ctx.strokeStyle = '#16202e';
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, radius * 0.32, 0, Math.PI * 2); ctx.fillStyle = '#16202e'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, radius * 0.2, 0, Math.PI * 2); ctx.fillStyle = '#fbf8ee'; ctx.fill();
}

export function makePokeball(toon: ToonFactory) {
  const group = new THREE.Group();
  const upper = new THREE.Mesh(new THREE.SphereGeometry(0.8, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), toon('#e0262c'));
  const lower = new THREE.Mesh(new THREE.SphereGeometry(0.8, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon('#fbf8ee'));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.81, 0.81, 0.12, 28), toon('#16202e'));
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 20), toon('#16202e'));
  socket.rotation.x = Math.PI / 2;
  socket.position.z = 0.76;
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.14, 20), toon('#fbf8ee'));
  button.rotation.x = Math.PI / 2;
  button.position.z = 0.8;
  group.add(upper, lower, band, socket, button);
  group.traverse(child => { child.castShadow = true; });
  return group;
}
