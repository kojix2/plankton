import { validateGraph } from './graph.js';
export const VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
export const COPY_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() { vec4 c = texture(u_texture, v_uv); fragColor = vec4(c.rgb * c.a, 1.0); }
`;
const HEADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform float u_time;
uniform float u_frame;
uniform float u_delta;
uniform float u_bpm;
uniform float u_audio_level;
uniform float u_fft[32];
uniform vec2 u_mouse;
uniform vec2 u_resolution;
uniform int u_output;
uniform sampler2D u_o0;
uniform sampler2D u_o1;
uniform sampler2D u_o2;
uniform sampler2D u_o3;
uniform sampler2D u_s0;
uniform sampler2D u_s1;
uniform sampler2D u_s2;
uniform sampler2D u_s3;
const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;
float nonzero(float x) { return abs(x) < 0.000001 ? (x < 0.0 ? -0.000001 : 0.000001) : x; }
float luminance(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec2 turn(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c*p.x-s*p.y, s*p.x+c*p.y); }
vec2 centered(vec2 uv) { return (uv - 0.5) * vec2(u_resolution.x/u_resolution.y, 1.0); }
vec2 uncentered(vec2 p) { return p / vec2(u_resolution.x/u_resolution.y, 1.0) + 0.5; }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(37.17, 71.71, 19.93))) * 43711.137); }
vec2 hash2(vec2 p) { return vec2(hash3(vec3(p, 1.0)), hash3(vec3(p, 7.0))); }
float valueNoise(vec3 p) {
  vec3 cell = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = mix(hash3(cell), hash3(cell + vec3(1,0,0)), f.x);
  float b = mix(hash3(cell + vec3(0,1,0)), hash3(cell + vec3(1,1,0)), f.x);
  float c = mix(hash3(cell + vec3(0,0,1)), hash3(cell + vec3(1,0,1)), f.x);
  float d = mix(hash3(cell + vec3(0,1,1)), hash3(cell + vec3(1,1,1)), f.x);
  return mix(mix(a,b,f.y), mix(c,d,f.y), f.z);
}
vec3 rgbToHsv(vec3 c) {
  float hi = max(c.r, max(c.g,c.b)), lo = min(c.r, min(c.g,c.b)), delta = hi-lo;
  float h = 0.0;
  if (delta > 0.00001) {
    if (hi == c.r) h = (c.g-c.b)/delta;
    else if (hi == c.g) h = (c.b-c.r)/delta+2.0;
    else h = (c.r-c.g)/delta+4.0;
  }
  return vec3(fract(h/6.0), hi <= 0.00001 ? 0.0 : delta/hi, hi);
}
vec3 hsvToRgb(vec3 c) {
  vec3 triangle = clamp(abs(fract(c.x + vec3(0, 2.0/3.0, 1.0/3.0))*6.0-3.0)-1.0, 0.0, 1.0);
  return c.z * mix(vec3(1), triangle, c.y);
}
`;
function float(value) {
    // Validation runs before generation, so the only variable text here is numeric.
    if (!Number.isFinite(value))
        throw new Error('Non-finite shader literal');
    const s = String(value);
    if (/[eE]/.test(s))
        return s.replace(/^(\-?\d+)([eE])/, '$1.0$2');
    return s.includes('.') ? s : `${s}.0`;
}
export function signalGLSL(expr, parameterIndex) {
    if (expr.op === 'const')
        return float(expr.value);
    if (expr.op === 'param')
        return `u_p${parameterIndex.get(expr.key)}`;
    if (expr.op === 'fft')
        return `u_fft[${expr.value}]`;
    const uniforms = { time: 'u_time', frame: 'u_frame', mouse_x: 'u_mouse.x', mouse_y: 'u_mouse.y', delta: 'u_delta', beat: '(u_time * u_bpm / 60.0)', audio_level: 'u_audio_level' };
    if (Object.hasOwn(uniforms, expr.op))
        return uniforms[expr.op];
    const a = (expr.args ?? []).map((arg) => signalGLSL(arg, parameterIndex));
    const binary = { add: '+', sub: '-', mul: '*' };
    if (Object.hasOwn(binary, expr.op))
        return `(${a[0]} ${binary[expr.op]} ${a[1]})`;
    if (expr.op === 'div')
        return `(${a[0]} / nonzero(${a[1]}))`;
    if (expr.op === 'neg')
        return `(-${a[0]})`;
    if (expr.op === 'sqrt')
        return `sqrt(max(0.0, ${a[0]}))`;
    if (expr.op === 'pow')
        return `pow(max(abs(${a[0]}), 0.000001), clamp(${a[1]}, -16.0, 16.0))`;
    if (expr.op === 'clamp')
        return `clamp(${a[0]}, min(${a[1]}, ${a[2]}), max(${a[1]}, ${a[2]}))`;
    if (['sin', 'cos', 'abs', 'floor', 'fract', 'min', 'max', 'mix'].includes(expr.op))
        return `${expr.op}(${a.join(', ')})`;
    throw new Error(`Unsupported signal ${expr.op}`);
}
function nodeBody(node, params) {
    const a = node.args.map((x) => signalGLSL(x, params));
    const call = (slot = 0, uv = 'uv') => `n${node.inputs[slot]}(${uv})`;
    const c = `vec4 c = ${call()}; `;
    const both = `${c}vec4 d = ${call(1)}; `;
    switch (node.op) {
        case 'src': return `return texture(u_o${node.args[0].value}, fract(uv));`;
        case 'input': return `return texture(u_s${node.args[0].value}, fract(uv));`;
        case 'osc': return `return vec4(0.5 + 0.5 * sin((uv.x * ${a[0]} + u_time * ${a[1]}) * TAU + vec3(0.0, ${a[2]}, 2.0 * ${a[2]})), 1.0);`;
        case 'noise': return `float n = valueNoise(vec3(uv * ${a[0]}, u_time * ${a[1]})); return vec4(vec3(n), 1.0);`;
        case 'voronoi': return `vec2 p = uv * max(abs(${a[0]}),0.001), cell = floor(p), f = fract(p); float nearDist = 9.0; vec2 winner = vec2(0);
      for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
        vec2 offset = vec2(float(x),float(y)); vec2 seed = hash2(cell+offset);
        vec2 point = offset + 0.5 + 0.45*sin(TAU*seed+u_time*${a[1]}) - f;
        float dist = dot(point,point); if (dist < nearDist) { nearDist = dist; winner = seed; }
      }
      float edge = clamp(sqrt(nearDist),0.0,1.0); return vec4(mix(vec3(edge), vec3(winner,1.0-edge), clamp(${a[2]},0.0,1.0)),1.0);`;
        case 'solid': return `return vec4(${a.join(', ')});`;
        case 'gradient': return `return vec4(hsvToRgb(vec3(fract(uv.x + uv.y * 0.25 + u_time * ${a[0]}), 0.8, 1.0)), 1.0);`;
        case 'shape': return `vec2 p = centered(uv); float sides = max(3.0, floor(abs(${a[0]}))); float sector = TAU/sides;
      float angle = atan(p.y,p.x)+PI*0.5; float d = cos(floor(0.5+angle/sector)*sector-angle)*length(p);
      float aa = max(abs(${a[2]}), 1.0/u_resolution.y); float mask = 1.0-smoothstep(${a[1]}-aa, ${a[1]}+aa, d);
      return vec4(vec3(mask),mask);`;
        case 'circle': return `float aa = max(abs(${a[1]}), 1.0/u_resolution.y); float mask = 1.0-smoothstep(${a[0]}-aa,${a[0]}+aa,length(centered(uv))); return vec4(vec3(mask),mask);`;
        case 'rect': return `vec2 d = abs(centered(uv))-abs(vec2(${a[0]},${a[1]}))*0.5; float dist = length(max(d,0.0))+min(max(d.x,d.y),0.0); float aa=max(abs(${a[2]}),1.0/u_resolution.y); float mask=1.0-smoothstep(-aa,aa,dist); return vec4(vec3(mask),mask);`;
        case 'rotate': return `return ${call(0, `uncentered(turn(centered(uv), ${a[0]} + u_time * ${a[1]}))`)};`;
        case 'scale': return `return ${call(0, `(uv-0.5)/vec2(nonzero(${a[0]}*${a[1]}), nonzero(${a[0]}*${a[2]}))+0.5`)};`;
        case 'scroll_x': return `return ${call(0, `fract(uv + vec2(${a[0]} + u_time * ${a[1]},0.0))`)};`;
        case 'scroll_y': return `return ${call(0, `fract(uv + vec2(0.0,${a[0]} + u_time * ${a[1]}))`)};`;
        case 'repeat': return `return ${call(0, `fract(uv * vec2(${a[0]},${a[1]}))`)};`;
        case 'pixelate': return `vec2 grid=max(abs(vec2(${a[0]},${a[1]})),vec2(1)); return ${call(0, '(floor(uv*grid)+0.5)/grid')};`;
        case 'kaleid': return `vec2 p = centered(uv); float sector=TAU/max(abs(${a[0]}),1.0); float angle=abs(mod(atan(p.y,p.x)+sector*0.5,sector)-sector*0.5); return ${call(0, 'uncentered(length(p)*vec2(cos(angle),sin(angle)))')};`;
        case 'color': return `${c}return c * vec4(${a.join(', ')});`;
        case 'brightness': return `${c}return vec4(c.rgb + ${a[0]},c.a);`;
        case 'contrast': return `${c}return vec4((c.rgb-0.5)*${a[0]}+0.5,c.a);`;
        case 'saturate': return `${c}return vec4(mix(vec3(luminance(c.rgb)),c.rgb,${a[0]}),c.a);`;
        case 'invert': return `${c}return vec4(mix(c.rgb,1.0-c.rgb,${a[0]}),c.a);`;
        case 'hue': return `${c}vec3 hsv=rgbToHsv(max(c.rgb,0.0)); hsv.x=fract(hsv.x+${a[0]}); return vec4(hsvToRgb(hsv),c.a);`;
        case 'colorama': return `${c}vec3 hsv=rgbToHsv(max(c.rgb,0.0)); hsv=fract(hsv+vec3(${a[0]},${a[0]}*0.7,${a[0]}*0.3)); return vec4(hsvToRgb(hsv),c.a);`;
        case 'posterize': return `${c}float bins=max(2.0,abs(${a[0]})); float gamma=max(0.01,abs(${a[1]})); vec3 levels=floor(pow(clamp(c.rgb,0.0,1.0),vec3(gamma))*(bins-1.0)+0.5)/(bins-1.0); return vec4(pow(levels,vec3(1.0/gamma)),c.a);`;
        case 'thresh': return `${c}float tol=max(0.00001,abs(${a[1]})); float value=smoothstep(${a[0]}-tol,${a[0]}+tol,luminance(c.rgb)); return vec4(vec3(value),c.a);`;
        case 'luma': return `${c}float tol=max(0.00001,abs(${a[1]})); return vec4(c.rgb,c.a*smoothstep(${a[0]}-tol,${a[0]}+tol,luminance(c.rgb)));`;
        case 'blend': return `${both}return mix(c,d,${a[0]});`;
        case 'add': return `${both}return vec4(c.rgb+d.rgb*${a[0]},max(c.a,d.a));`;
        case 'sub': return `${both}return vec4(c.rgb-d.rgb*${a[0]},c.a);`;
        case 'mult': return `${both}return vec4(c.rgb*mix(vec3(1),d.rgb,${a[0]}),c.a);`;
        case 'diff': return `${both}return vec4(abs(c.rgb-d.rgb),max(c.a,d.a));`;
        case 'mask': return `${both}return vec4(c.rgb,c.a*clamp(luminance(d.rgb)*d.a,0.0,1.0));`;
        case 'layer': return `${both}float alpha=d.a+c.a*(1.0-d.a); return vec4((d.rgb*d.a+c.rgb*c.a*(1.0-d.a))/max(alpha,0.000001),alpha);`;
        case 'modulate': return `vec4 d=${call(1)}; return ${call(0, `uv+(d.rg-0.5)*${a[0]}`)};`;
        case 'modulate_scale': return `vec4 d=${call(1)}; vec2 s=vec2(${a[1]})+(d.rg-0.5)*${a[0]}; s=vec2(nonzero(s.x),nonzero(s.y)); return ${call(0, '(uv-0.5)/s+0.5')};`;
        case 'modulate_rotate': return `vec4 d=${call(1)}; return ${call(0, `uncentered(turn(centered(uv), (d.r-0.5)*${a[0]}+${a[1]}))`)};`;
        case 'modulate_pixelate': return `vec4 d=${call(1)}; vec2 grid=max(abs(d.rg*${a[0]}+${a[1]}),vec2(1)); return ${call(0, '(floor(uv*grid)+0.5)/grid')};`;
        default: throw new Error(`No shader implementation for ${node.op}`);
    }
}
/** One generated function per graph node prevents source-code expansion. */
export function createFragmentShader(input) {
    const graph = validateGraph(input);
    const params = new Map(graph.params.map((p, i) => [p.key, i]));
    const uniforms = graph.params.map((_, i) => `uniform float u_p${i};`).join('\n');
    const functions = graph.nodes.map((node, i) => `vec4 n${i}(vec2 uv) { ${nodeBody(node, params)} }`).join('\n');
    const cases = graph.outputs.map((id, i) => `case ${i}: c = ${id === null ? 'vec4(0,0,0,1)' : `n${id}(v_uv)`}; break;`).join('\n');
    return `${HEADER}\n${uniforms}\n${functions}\nvoid main() { vec4 c=vec4(0,0,0,1); switch(u_output) { ${cases} } fragColor=clamp(c,0.0,1.0); }\n`;
}
