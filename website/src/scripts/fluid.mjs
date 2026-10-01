// Self-contained WebGL fluid simulation (Stable Fluids) with vorticity
// confinement, pointer splats, and brand-blue dye. No dependencies.
// Algorithm reference: Jos Stam, "Stable Fluids" (SIGGRAPH 1999) and the GPU
// implementation described in GPU Gems ch. 38 ("Fast Fluid Dynamics Simulation
// on the GPU").

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const COPY_FRAGMENT = `
precision mediump float;
precision mediump sampler2D;
varying vec2 vUv;
uniform sampler2D uTexture;
void main () { gl_FragColor = texture2D(uTexture, vUv); }`;

const CLEAR_FRAGMENT = `
precision mediump float;
precision mediump sampler2D;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`;

const SPLAT_FRAGMENT = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main () {
  vec2 p = vUv - point.xy;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(base + splat, 1.0);
}`;

const ADVECTION_FRAGMENT = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform vec2 dyeTexelSize;
uniform float dt;
uniform float dissipation;
void main () {
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
  vec4 result = texture2D(uSource, coord);
  float decay = 1.0 + dissipation * dt;
  gl_FragColor = result / decay;
}`;

const DIVERGENCE_FRAGMENT = `
precision mediump float;
precision mediump sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}`;

const CURL_FRAGMENT = `
precision mediump float;
precision mediump sampler2D;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).y;
  float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x;
  float B = texture2D(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}`;

const VORTICITY_FRAGMENT = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main () {
  float L = texture2D(uCurl, vL).x;
  float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x;
  float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity += force * dt;
  velocity = min(max(velocity, -1000.0), 1000.0);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}`;

const PRESSURE_FRAGMENT = `
precision mediump float;
precision mediump sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float divergence = texture2D(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`;

const GRADIENT_SUBTRACT_FRAGMENT = `
precision mediump float;
precision mediump sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}`;

const DISPLAY_FRAGMENT = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uTexture;
void main () {
  vec3 c = texture2D(uTexture, vUv).rgb;
  float lc = length(texture2D(uTexture, vL).rgb);
  float rc = length(texture2D(uTexture, vR).rgb);
  float tc = length(texture2D(uTexture, vT).rgb);
  float bc = length(texture2D(uTexture, vB).rgb);
  c *= 1.0 + (lc - rc) * 0.6;
  c *= 1.0 + (tc - bc) * 0.6;
  c *= 1.3;
  float intensity = clamp(max(max(c.r, c.g), c.b), 0.0, 1.0);
  gl_FragColor = vec4(c, intensity);
}`;

function compileShader (gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

class Program {
  constructor (gl, vertexShader, fragmentShader) {
    this.gl = gl;
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.bindAttribLocation(this.program, 0, 'aPosition');
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      gl.deleteProgram(this.program);
      this.program = null;
      return;
    }
    this.uniforms = {};
    const count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(this.program, i).name;
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }
  }
  bind () {
    this.gl.useProgram(this.program);
  }
}

class Framebuffer {
  constructor (gl, width, height, internalFormat, format, type, filter) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.texelSizeX = 1 / width;
    this.texelSizeY = 1 / height;
    this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  dispose () {
    this.gl.deleteTexture(this.texture);
    this.gl.deleteFramebuffer(this.fbo);
  }
}

class DoubleFramebuffer {
  constructor (gl, width, height, internalFormat, format, type, filter) {
    this.gl = gl;
    this.read = new Framebuffer(gl, width, height, internalFormat, format, type, filter);
    this.write = new Framebuffer(gl, width, height, internalFormat, format, type, filter);
  }
  get texelSizeX () { return this.read.texelSizeX; }
  get texelSizeY () { return this.read.texelSizeY; }
  swap () {
    const tmp = this.read;
    this.read = this.write;
    this.write = tmp;
  }
  dispose () {
    this.read.dispose();
    this.write.dispose();
  }
}

function getResolution (gl, resolution) {
  let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
  if (aspectRatio < 1) aspectRatio = 1 / aspectRatio;
  const min = Math.round(resolution);
  const max = Math.round(resolution * aspectRatio);
  if (gl.drawingBufferWidth > gl.drawingBufferHeight) {
    return { width: max, height: min };
  }
  return { width: min, height: max };
}

export class Fluid {
  constructor (canvas, config = {}) {
    this.canvas = canvas;
    this.config = {
      simResolution: 192,
      dyeResolution: 1024,
      densityDissipation: 0.9,
      velocityDissipation: 0.22,
      pressureIterations: 20,
      pressure: 0.8,
      curl: 26,
      splatRadius: 0.24,
      ...config,
    };
    this.ready = false;
    this._init();
  }

  _init () {
    const gl = this.canvas.getContext('webgl', {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return;
    this.gl = gl;
    gl.clearColor(0, 0, 0, 0);

    // Dye is colour, so 8-bit is fine. Velocity/pressure are signed and need
    // range, so they need float textures: RGBA8 wraps negatives to ~255 and
    // advection stops working. Probe half-float support at runtime instead of
    // assuming it, and fall back to 8-bit only when the driver refuses.
    this.halfFloatType = gl.getExtension('OES_texture_half_float')
      ? gl.getExtension('OES_texture_half_float').HALF_FLOAT_OES
      : null;

    const velocityFormat = this._probeFormat(this.halfFloatType || gl.UNSIGNED_BYTE);
    const dyeFormat = this._probeFormat(gl.UNSIGNED_BYTE);
    if (!velocityFormat || !dyeFormat) return;
    this.velocityFormat = velocityFormat;
    this.dyeFormat = dyeFormat;
    this.filter = gl.LINEAR;

    this.vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    if (!this.vertexShader) return;
    const frag = (src) => compileShader(gl, gl.FRAGMENT_SHADER, src);
    this.programs = {
      copy: new Program(gl, this.vertexShader, frag(COPY_FRAGMENT)),
      clear: new Program(gl, this.vertexShader, frag(CLEAR_FRAGMENT)),
      splat: new Program(gl, this.vertexShader, frag(SPLAT_FRAGMENT)),
      advection: new Program(gl, this.vertexShader, frag(ADVECTION_FRAGMENT)),
      divergence: new Program(gl, this.vertexShader, frag(DIVERGENCE_FRAGMENT)),
      curl: new Program(gl, this.vertexShader, frag(CURL_FRAGMENT)),
      vorticity: new Program(gl, this.vertexShader, frag(VORTICITY_FRAGMENT)),
      pressure: new Program(gl, this.vertexShader, frag(PRESSURE_FRAGMENT)),
      gradientSubtract: new Program(gl, this.vertexShader, frag(GRADIENT_SUBTRACT_FRAGMENT)),
      display: new Program(gl, this.vertexShader, frag(DISPLAY_FRAGMENT)),
    };
    for (const program of Object.values(this.programs)) {
      if (!program.program) return;
    }

    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    this.velocity = null;
    this.dye = null;
    this.divergence = null;
    this.curlFBO = null;
    this.pressure = null;
    this.resize();
    this.ready = true;
  }

  // Half-float textures are only linearly filterable with
  // OES_texture_half_float_linear, so probe LINEAR first and fall back to
  // NEAREST before giving up on the format entirely.
  _probeFormat (type) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, type, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, type, null);
      status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(texture);

    if (status !== gl.FRAMEBUFFER_COMPLETE) return null;
    return {
      internalFormat: gl.RGBA,
      format: gl.RGBA,
      type,
      filter: type === this.halfFloatType ? gl.NEAREST : gl.LINEAR,
    };
  }

  resize () {
    const gl = this.gl;
    if (!gl) return;
    const c = this.canvas;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.floor(c.clientWidth * pixelRatio));
    const h = Math.max(1, Math.floor(c.clientHeight * pixelRatio));
    if (c.width === w && c.height === h && this.dye) return;
    c.width = w;
    c.height = h;

    const simRes = getResolution(gl, this.config.simResolution);
    const dyeRes = getResolution(gl, this.config.dyeResolution);
    const vf = this.velocityFormat;
    const df = this.dyeFormat;

    for (const fbo of [this.velocity, this.dye, this.divergence, this.curlFBO, this.pressure]) {
      if (fbo) fbo.dispose();
    }
    this.dye = new DoubleFramebuffer(gl, dyeRes.width, dyeRes.height, df.internalFormat, df.format, df.type, df.filter);
    this.velocity = new DoubleFramebuffer(gl, simRes.width, simRes.height, vf.internalFormat, vf.format, vf.type, vf.filter);
    this.divergence = new Framebuffer(gl, simRes.width, simRes.height, vf.internalFormat, vf.format, vf.type, vf.filter);
    this.curlFBO = new Framebuffer(gl, simRes.width, simRes.height, vf.internalFormat, vf.format, vf.type, vf.filter);
    this.pressure = new DoubleFramebuffer(gl, simRes.width, simRes.height, vf.internalFormat, vf.format, vf.type, vf.filter);
  }

  _blit (target) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  _bindTexture (texture, unit, location) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (location != null) gl.uniform1i(location, unit);
  }

  _splatPass (fbo, x, y, r, g, b) {
    const gl = this.gl;
    const program = this.programs.splat;
    program.bind();
    gl.uniform1f(program.uniforms.aspectRatio, this.canvas.width / this.canvas.height);
    gl.uniform2f(program.uniforms.point, x, y);
    gl.uniform3f(program.uniforms.color, r, g, b);
    gl.uniform1f(program.uniforms.radius, this.config.splatRadius / 100);
    this._bindTexture(fbo.read.texture, 0, program.uniforms.uTarget);
    this._blit(fbo.write);
    fbo.swap();
  }

  splat (x, y, dx, dy, color) {
    if (!this.ready) return;
    this._splatPass(this.velocity, x, y, dx, dy, 0);
    this._splatPass(this.dye, x, y, color[0], color[1], color[2]);
  }

  step (dt) {
    if (!this.ready) return;
    const gl = this.gl;
    const cfg = this.config;
    gl.disable(gl.BLEND);

    const curlProgram = this.programs.curl;
    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    this._bindTexture(this.velocity.read.texture, 0, curlProgram.uniforms.uVelocity);
    this._blit(this.curlFBO);

    const vorticityProgram = this.programs.vorticity;
    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1f(vorticityProgram.uniforms.curl, cfg.curl);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    this._bindTexture(this.velocity.read.texture, 0, vorticityProgram.uniforms.uVelocity);
    this._bindTexture(this.curlFBO.texture, 1, vorticityProgram.uniforms.uCurl);
    this._blit(this.velocity.write);
    this.velocity.swap();

    const divergenceProgram = this.programs.divergence;
    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    this._bindTexture(this.velocity.read.texture, 0, divergenceProgram.uniforms.uVelocity);
    this._blit(this.divergence);

    const clearProgram = this.programs.clear;
    clearProgram.bind();
    gl.uniform1f(clearProgram.uniforms.value, cfg.pressure);
    this._bindTexture(this.pressure.read.texture, 0, clearProgram.uniforms.uTexture);
    this._blit(this.pressure.write);
    this.pressure.swap();

    const pressureProgram = this.programs.pressure;
    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    for (let i = 0; i < cfg.pressureIterations; i++) {
      this._bindTexture(this.pressure.read.texture, 0, pressureProgram.uniforms.uPressure);
      this._bindTexture(this.divergence.texture, 1, pressureProgram.uniforms.uDivergence);
      this._blit(this.pressure.write);
      this.pressure.swap();
    }

    const gradientProgram = this.programs.gradientSubtract;
    gradientProgram.bind();
    gl.uniform2f(gradientProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    this._bindTexture(this.pressure.read.texture, 0, gradientProgram.uniforms.uPressure);
    this._bindTexture(this.velocity.read.texture, 1, gradientProgram.uniforms.uVelocity);
    this._blit(this.velocity.write);
    this.velocity.swap();

    const advectionProgram = this.programs.advection;
    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, this.dye.texelSizeX, this.dye.texelSizeY);
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    this._bindTexture(this.velocity.read.texture, 0, advectionProgram.uniforms.uVelocity);
    gl.uniform1f(advectionProgram.uniforms.dissipation, cfg.velocityDissipation);
    this._bindTexture(this.velocity.read.texture, 0, advectionProgram.uniforms.uSource);
    this._blit(this.velocity.write);
    this.velocity.swap();

    gl.uniform1f(advectionProgram.uniforms.dissipation, cfg.densityDissipation);
    this._bindTexture(this.velocity.read.texture, 0, advectionProgram.uniforms.uVelocity);
    this._bindTexture(this.dye.read.texture, 1, advectionProgram.uniforms.uSource);
    this._blit(this.dye.write);
    this.dye.swap();
  }

  render () {
    if (!this.ready) return;
    const gl = this.gl;
    const display = this.programs.display;
    display.bind();
    gl.uniform2f(display.uniforms.texelSize, this.dye.texelSizeX, this.dye.texelSizeY);
    this._bindTexture(this.dye.read.texture, 0, display.uniforms.uTexture);
    this._blit(null);
  }

  dispose () {
    if (!this.gl) return;
    for (const fbo of [this.velocity, this.dye, this.divergence, this.curlFBO, this.pressure]) {
      if (fbo) fbo.dispose();
    }
    this.ready = false;
  }
}
