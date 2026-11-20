// PS1-style rendering: vertex snapping + affine texture warp on materials,
// low-res render target + 15-bit dithered color in a post pass.
import * as THREE from 'three';

const shared = {
  uSnap: { value: new THREE.Vector2(160, 120) },
  uAffine: { value: 0.3 }, // 0 = perspective-correct, 1 = full PS1 affine warp
};

function patch(material, affine = true) {
  if (!affine) material.defines = { ...material.defines, PS1_NO_AFFINE: '' };
  material.onBeforeCompile = (s) => {
    s.uniforms.uSnap = shared.uSnap;
    s.uniforms.uAffine = shared.uAffine;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        uniform vec2 uSnap; varying vec2 vAffUv; varying float vAffW;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 p = gl_Position; p.xy = floor(p.xy / p.w * uSnap + 0.5) / uSnap * p.w; gl_Position = p; }
        #ifdef USE_MAP
          vAffUv = vMapUv * gl_Position.w;
        #endif
        vAffW = gl_Position.w;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uAffine; varying vec2 vAffUv; varying float vAffW;`)
      .replace('#include <map_fragment>', `#if defined(USE_MAP) && defined(PS1_NO_AFFINE)
          diffuseColor *= texture2D(map, vMapUv);
        #elif defined(USE_MAP)
          diffuseColor *= texture2D(map, mix(vMapUv, vAffUv / vAffW, uAffine));
        #endif`);
  };
  material.customProgramCacheKey = () => (affine ? 'ps1' : 'ps1-flat');
  return material;
}

function crunchTexture(tex) {
  if (!tex) return null;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.anisotropy = 1;
  tex.needsUpdate = true;
  return tex;
}

/** Convert any glTF material into a PS1-patched Lambert material (no specular, like the real thing).
 *  affine=false for big surfaces (walls/floors) where texture warp just looks broken. */
export function toPS1(src, { affine = true } = {}) {
  if (Array.isArray(src)) return src.map((m) => toPS1(m, { affine }));
  const color = src.color ? src.color.clone() : new THREE.Color(1, 1, 1);
  if ((src.metalness ?? 0) > 0.5) color.multiplyScalar(1.25); // stainless reads too dark without specular
  const m = new THREE.MeshLambertMaterial({
    name: src.name,
    color,
    map: crunchTexture(src.map),
    emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0),
    emissiveMap: crunchTexture(src.emissiveMap),
    emissiveIntensity: src.emissiveIntensity ?? 1,
    transparent: src.transparent,
    opacity: src.opacity ?? 1,
    alphaTest: src.alphaTest ?? 0,
    side: src.side ?? THREE.FrontSide,
    vertexColors: src.vertexColors,
    depthWrite: src.depthWrite ?? true,
  });
  return patch(m, affine);
}

export function ps1Material(params) {
  return patch(new THREE.MeshLambertMaterial(params));
}

export class PS1Post {
  constructor(renderer, { height = 240 } = {}) {
    this.renderer = renderer;
    this.height = height;
    this.enabled = true;
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.uniforms = {
      tDiffuse: { value: this.rt.texture },
      res: { value: new THREE.Vector2(4, 4) },
      fade: { value: 0 },
      noise: { value: 0.0 },
      time: { value: 0 },
    };
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        depthTest: false,
        depthWrite: false,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: /* glsl */`
          uniform sampler2D tDiffuse; uniform vec2 res; uniform float fade; uniform float noise; uniform float time;
          varying vec2 vUv;
          float bayer4(vec2 p) {
            int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
            int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
            return float(m[y * 4 + x]) / 16.0 - 0.5;
          }
          vec3 toSRGB(vec3 c) {
            return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
          }
          float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 37.0) * 43758.5453); }
          void main() {
            vec2 px = floor(vUv * res);
            vec3 c = toSRGB(clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0));
            c += (hash(px) - 0.5) * noise;
            c = floor(c * 31.0 + 0.5 + bayer4(px)) / 31.0;     // 15-bit color with ordered dither
            vec2 d = vUv - 0.5;
            c *= 1.0 - dot(d, d) * 0.9;                          // vignette
            gl_FragColor = vec4(c * fade, 1.0);
          }`,
      }),
    );
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize(w, h) {
    const rh = this.height;
    const rw = Math.round(rh * (w / h));
    this.rt.setSize(rw, rh);
    this.uniforms.res.value.set(rw, rh);
    shared.uSnap.value.set(rw / 2, rh / 2);
  }

  render(scene, camera, t) {
    this.uniforms.time.value = t;
    const r = this.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
  }
}
