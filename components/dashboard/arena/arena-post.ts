import * as THREE from 'three';

const fragmentShader = `
  uniform sampler2D tColor, tDepth;
  uniform vec2 uTexel, uSun;
  uniform float uNear, uFar, uAspect, uFlare;
  varying vec2 vUv;

  float ghost(vec2 center, float radius, float edge) {
    float distanceToCenter = length((vUv - center) * vec2(uAspect, 1.0));
    return 1.0 - smoothstep(radius * edge, radius, distanceToCenter);
  }

  float inverseZ(vec2 uv) {
    float ndc = texture2D(tDepth, uv).x * 2.0 - 1.0;
    return (uFar + uNear - ndc * (uFar - uNear)) / (2.0 * uNear * uFar);
  }

  void main() {
    vec3 color = texture2D(tColor, vUv).rgb;

    // 1/z ist auf Ebenen linear im Bildraum: Der Laplace-Wert schlägt nur an Silhouetten aus.
    float center = inverseZ(vUv);
    float laplace = abs(inverseZ(vUv + vec2(uTexel.x, 0.0)) + inverseZ(vUv - vec2(uTexel.x, 0.0))
      + inverseZ(vUv + vec2(0.0, uTexel.y)) + inverseZ(vUv - vec2(0.0, uTexel.y)) - 4.0 * center) / center;
    float viewZ = 1.0 / center;
    float ink = smoothstep(0.035, 0.11, laplace) * smoothstep(240.0, 95.0, viewZ);
    color = mix(color, vec3(0.022, 0.035, 0.065), ink * 0.92);

    vec2 march = (uSun - vUv) / 26.0;
    vec2 point = vUv;
    float rays = 0.0;
    float weight = 1.0;
    for (int index = 0; index < 26; index++) {
      point += march;
      rays += step(0.99999, texture2D(tDepth, point).x) * weight;
      weight *= 0.95;
    }
    vec2 toSun = (vUv - uSun) * vec2(uAspect, 1.0);
    float falloff = smoothstep(1.35, 0.1, length(toSun));
    color += vec3(1.0, 0.9, 0.68) * rays / 15.0 * falloff * falloff * 0.24;

    vec2 axis = vec2(0.5) - uSun;
    float sky = step(0.99999, texture2D(tDepth, vUv).x);
    color += uFlare * sky * (
      vec3(0.5, 0.8, 1.0) * ghost(uSun + axis * 0.22, 0.034, 0.93) * 0.16
      + vec3(1.0, 0.74, 0.5) * ghost(uSun + axis * 0.36, 0.014, 0.86) * 0.22
      + vec3(0.6, 1.0, 0.8) * ghost(uSun + axis * 0.5, 0.05, 0.96) * 0.07);

    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luma), color, 1.16);
    color = mix(color * vec3(0.84, 0.9, 1.12), color, smoothstep(0.02, 0.42, luma));
    color = mix(color, smoothstep(vec3(-0.04), vec3(1.06), color), 0.5);
    vec2 corner = vUv - 0.5;
    color *= 1.0 - dot(corner, corner) * 0.34;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }`;

/** Tuschelinien, Sonnenstrahlen und Farbstimmung als ein Vollbild-Durchgang. */
export function createArenaPost(camera: THREE.PerspectiveCamera) {
  const scene = new THREE.Scene();
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tColor: { value: null },
      tDepth: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uSun: { value: new THREE.Vector2(0.2, 0.9) },
      uFlare: { value: 0 },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uAspect: { value: 1 },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader,
  });

  const triangle = new THREE.BufferGeometry();
  triangle.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  triangle.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quad = new THREE.Mesh(triangle, material);
  quad.frustumCulled = false;
  scene.add(quad);

  let target: THREE.WebGLRenderTarget | null = null;

  return {
    uniforms: material.uniforms,
    resize(width: number, height: number) {
      target?.depthTexture?.dispose();
      target?.dispose();
      target = new THREE.WebGLRenderTarget(width, height, { samples: 4, type: THREE.HalfFloatType });
      target.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
      material.uniforms.tColor.value = target.texture;
      material.uniforms.tDepth.value = target.depthTexture;
      material.uniforms.uTexel.value.set(1.2 / width, 1.2 / height);
    },
    render(renderer: THREE.WebGLRenderer, sceneToRender: THREE.Scene) {
      if (!target) return;
      renderer.setRenderTarget(target);
      renderer.render(sceneToRender, camera);
      renderer.setRenderTarget(null);
      renderer.render(scene, postCamera);
    },
    dispose() {
      target?.depthTexture?.dispose();
      target?.dispose();
      triangle.dispose();
      material.dispose();
    },
  };
}
