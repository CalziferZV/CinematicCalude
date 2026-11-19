// Materiales que simulan el aspecto de cada tipo de filamento.
import * as THREE from 'three';

const cache = new Map();

// Líneas de capa (aspecto de pieza impresa): uniforms compartidos por todos los materiales,
// así se encienden y apagan sin recompilar nada.
export const layerLines = { uLayerOn: { value: 0 }, uLayerH: { value: 0.2 }, uLayerAmp: { value: 0.38 } };
export function setLayerLines(on, height) {
  layerLines.uLayerOn.value = on ? 1 : 0;
  if (height > 0) layerLines.uLayerH.value = height;
}
function injectLayerLines(shader) {
  shader.uniforms.uLayerOn = layerLines.uLayerOn;
  shader.uniforms.uLayerH = layerLines.uLayerH;
  shader.uniforms.uLayerAmp = layerLines.uLayerAmp;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLLPos;\nvarying vec3 vLLNrm;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvLLPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvLLNrm = normalize(mat3(modelMatrix) * objectNormal);');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLLPos;\nvarying vec3 vLLNrm;\nuniform float uLayerOn;\nuniform float uLayerH;\nuniform float uLayerAmp;')
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
float llFade = 0.0;
float llPh = 0.0;
if (uLayerOn > 0.5) {
  llPh = vLLPos.z / uLayerH;
  // se desvanecen cuando cada capa ocupa menos de ~2-4 píxeles (evita el muaré)
  llFade = (1.0 - smoothstep(0.22, 0.5, fwidth(llPh))) * smoothstep(0.15, 0.6, 1.0 - abs(normalize(vLLNrm).z));
  diffuseColor.rgb *= 1.0 - 0.07 * llFade * (0.5 + 0.5 * cos(llPh * 6.2831853));
}`,
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
if (llFade > 0.001) {
  vec3 llUp = normalize((viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
  normal = normalize(normal + llUp * (sin(llPh * 6.2831853) * uLayerAmp * llFade));
}`,
    );
}

function hexToColor(h) {
  // los negros puros (#000000) se ven planos en pantalla: se aclaran un poco solo para el render
  const c = new THREE.Color(h || '#ECECEC');
  const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  if (l < 0.004) c.lerp(new THREE.Color('#2a2a2a'), 0.75);
  return c;
}

// Inyecta un shader para filamentos multicolor:
//  - gradient: el color cambia a lo largo de la altura (como un filamento degradado)
//  - multi: bicolor/tricolor coextruido -> el color depende del lado desde el que se mira la pieza
function addMultiColor(mat, hexes, kind, zRange) {
  const cols = hexes.slice(0, 6).map((h) => new THREE.Color(h));
  while (cols.length < 6) cols.push(cols[cols.length - 1]);
  mat.userData.uniforms = {
    uCols: { value: cols },
    uCount: { value: Math.min(hexes.length, 6) },
    uMode: { value: kind === 'gradient' ? 0 : 1 },
    uZ: { value: new THREE.Vector2(zRange[0], zRange[1]) },
  };
  mat.onBeforeCompile = (shader) => {
    injectLayerLines(shader);
    Object.assign(shader.uniforms, mat.userData.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNorm = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWPos;
varying vec3 vWNorm;
uniform vec3 uCols[6];
uniform int uCount;
uniform int uMode;
uniform vec2 uZ;
vec3 pickCol(float t){
  float n = float(uCount);
  float x = fract(t) * n;
  int i = int(floor(x));
  float f = smoothstep(0.0, 1.0, fract(x));
  vec3 a = uCols[0]; vec3 b = uCols[0];
  for (int k = 0; k < 6; k++) { if (k == i) a = uCols[k]; if (k == int(mod(float(i + 1), n))) b = uCols[k]; }
  return mix(a, b, f);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float t;
  if (uMode == 0) {
    t = (vWPos.z - uZ.x) / max(uZ.y - uZ.x, 0.001);
    diffuseColor.rgb = pickCol(t * 0.999 * (float(uCount) - 1.0) / float(uCount));
  } else {
    float ang = atan(vWNorm.y, vWNorm.x) / 6.28318 + 0.5;
    float n = float(uCount);
    float x = ang * n;
    int i = int(floor(x));
    float e = smoothstep(0.42, 0.58, fract(x));
    vec3 a = uCols[0]; vec3 b = uCols[0];
    for (int k = 0; k < 6; k++) { if (k == i) a = uCols[k]; if (k == int(mod(float(i + 1), n))) b = uCols[k]; }
    diffuseColor.rgb = mix(a, b, e);
  }
}`,
      );
  };
  mat.customProgramCacheKey = () => `ll-multi-${kind}-${hexes.length}`;
}

export function filamentMaterial(fil, { zRange = [0, 100] } = {}) {
  const key = `${fil.hex}|${(fil.hexes || []).join(',')}|${fil.finish}|${fil.kind}|${fil.alpha || 1}|${zRange.join(',')}`;
  if (cache.has(key)) return cache.get(key);
  const color = hexToColor(fil.hex);
  const p = { color, roughness: 0.45, metalness: 0.0, clearcoat: 0.15, clearcoatRoughness: 0.4, side: THREE.DoubleSide };
  switch (fil.finish) {
    case 'matte':
      Object.assign(p, { roughness: 0.92, clearcoat: 0 });
      break;
    case 'silk':
      Object.assign(p, { roughness: 0.22, metalness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.15, sheen: 1, sheenColor: color.clone(), sheenRoughness: 0.3 });
      break;
    case 'metal':
      Object.assign(p, { roughness: 0.3, metalness: 0.85, clearcoat: 0.3 });
      break;
    case 'sparkle':
      Object.assign(p, { roughness: 0.3, metalness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.05, iridescence: 0.4 });
      break;
    case 'marble':
      Object.assign(p, { roughness: 0.7, clearcoat: 0.1 });
      break;
    case 'wood':
      Object.assign(p, { roughness: 0.85, clearcoat: 0 });
      break;
    case 'carbon':
      Object.assign(p, { roughness: 0.75, clearcoat: 0.05, metalness: 0.1 });
      break;
    case 'translucent':
      Object.assign(p, { roughness: 0.25, transmission: 0.55, thickness: 3, ior: 1.45, clearcoat: 0.5, transparent: true, opacity: 0.92 });
      break;
    case 'glow':
      Object.assign(p, { roughness: 0.6, emissive: color.clone(), emissiveIntensity: 0.35 });
      break;
    case 'satin':
      Object.assign(p, { roughness: 0.55, sheen: 0.6, sheenColor: color.clone() });
      break;
    default:
      break;
  }
  if (fil.alpha && fil.finish !== 'translucent') Object.assign(p, { transmission: 0.5, thickness: 3, transparent: true, opacity: 0.9, roughness: 0.25 });
  if (fil.blank) Object.assign(p, { roughness: 0.6, clearcoat: 0 });
  const mat = new THREE.MeshPhysicalMaterial(p);
  if (fil.hexes && fil.hexes.length > 1) addMultiColor(mat, fil.hexes, fil.kind === 'gradient' ? 'gradient' : 'multi', zRange);
  else {
    mat.onBeforeCompile = injectLayerLines;
    mat.customProgramCacheKey = () => 'll';
  }
  cache.set(key, mat);
  return mat;
}

// Material de color "falso" para la vista de partes (análisis / IA)
const PALETTE = ['#E6194B', '#3CB44B', '#4363D8', '#F58231', '#911EB4', '#42D4F4', '#F032E6', '#BFEF45', '#FABED4', '#469990', '#DCBEFF', '#9A6324', '#FFE119', '#800000', '#AAFFC3', '#808000', '#000075', '#A9A9A9'];
export function falseColor(i) {
  return PALETTE[i % PALETTE.length];
}
const flat = new Map();
export function flatMaterial(hex) {
  if (!flat.has(hex)) flat.set(hex, new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.8, side: THREE.DoubleSide }));
  return flat.get(hex);
}

// CSS para pintar una muestra (swatch) de un filamento en la interfaz.
export function swatchCss(fil) {
  if (!fil) return '#ECECEC';
  if (fil.hexes && fil.hexes.length > 1) {
    return fil.kind === 'gradient'
      ? `linear-gradient(180deg, ${fil.hexes.join(', ')})`
      : `conic-gradient(${fil.hexes.map((h, i, a) => `${h} ${(i * 100) / a.length}% ${((i + 1) * 100) / a.length}%`).join(', ')})`;
  }
  if (fil.finish === 'silk' || fil.finish === 'metal') return `linear-gradient(135deg, ${shade(fil.hex, 0.35)} 0%, ${fil.hex} 45%, ${shade(fil.hex, -0.35)} 100%)`;
  if (fil.finish === 'sparkle') return `radial-gradient(circle at 30% 30%, #fff8 0 6%, transparent 7%), radial-gradient(circle at 70% 60%, #fff8 0 5%, transparent 6%), ${fil.hex}`;
  return fil.hex;
}
export function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt)));
  return '#' + c.getHexString();
}
