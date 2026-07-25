import * as THREE from 'three';

const floorVertexShader = `
varying vec2 vUv;
#include <common>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>
}`;

const floorFragmentShader = `
uniform vec3 color;
uniform sampler2D tScratches;
varying vec2 vUv;
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec3 col = color;
  vec4 scratchesCol = texture2D(tScratches, vUv);
  float inkValue = max(max(scratchesCol.r, scratchesCol.g), scratchesCol.b);
  col = mix(col, scratchesCol.rgb, inkValue);
  col = min(col, vec3(1.0));
  col.gb -= (1.0 - getShadowMask()) * .1;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const simulationVertexShader = `
precision highp float;
uniform float time;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * modelViewPosition;
}`;

const simulationFragmentShader = `
uniform sampler2D inputTexture;
uniform sampler2D noiseTexture;
uniform vec2 tipPosOld;
uniform vec2 tipPosNew;
uniform float speed;
uniform float persistence;
uniform float thickness;
uniform float time;
uniform float waterQuantity;
uniform float waterDiffusion;
uniform float gravity;
uniform vec3 inkColor;
varying vec2 vUv;

float lineSegment(vec2 p, vec2 a, vec2 b, float thickness) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa,ba) / max(dot(ba,ba), .000001), 0.0, 1.0);
  float d = length(pa - ba * h);
  return smoothstep(thickness, thickness * .5, d);
}

vec4 blur(sampler2D image, vec2 uv, vec2 resolution, vec2 direction) {
  vec4 color = vec4(0.0);
  vec2 off1 = vec2(.013846153846) * direction;
  vec2 off2 = vec2(.032307692308) * direction;
  color += texture2D(image, uv) * .2270270270;
  color += texture2D(image, uv + off1 * resolution) * .3162162162;
  color += texture2D(image, uv - off1 * resolution) * .3162162162;
  color += texture2D(image, uv + off2 * resolution) * .0702702703;
  color += texture2D(image, uv - off2 * resolution) * .0702702703;
  return color;
}

void main() {
  vec4 noise1 = texture2D(noiseTexture, vUv * 4.0 + vec2(time * .1, .0));
  vec4 noise2 = texture2D(noiseTexture, vUv * 8.0 + vec2(.0, time * .1) + noise1.rg * .5);
  vec4 noise3 = texture2D(noiseTexture, vUv * 16.0 + vec2(-time * .05, 0.) + noise2.rg * .5);
  vec4 noise = (noise1 + noise2 * .5 + noise3 * .25) / 1.75;
  float dirX = (-.5 + noise.g) * noise.r * 10.;
  float dirY = (-.5 + noise.b) * noise.r * 10.;
  vec4 oldTexture = texture2D(inputTexture, vUv);
  float br = 1. - (oldTexture.r + oldTexture.g + oldTexture.b) / 3.0;
  vec4 col = oldTexture * (1.0 - waterDiffusion);
  float p2 = waterDiffusion / 4.0;
  vec2 stretchUv = vUv * vec2(1.0, 1.0 + gravity);
  col += blur(inputTexture, stretchUv, vec2(waterQuantity * br), vec2(dirX, dirY)) * p2;
  col += blur(inputTexture, stretchUv, vec2(waterQuantity * br), vec2(dirY, dirX)) * p2;
  col += blur(inputTexture, stretchUv, vec2(waterQuantity * br), vec2(-dirX, -dirY)) * p2;
  col += blur(inputTexture, stretchUv, vec2(waterQuantity * br), vec2(-dirY, -dirX)) * p2;
  col.rgb *= persistence;
  if (speed > 0.0) {
    float th = clamp(thickness + speed * .3, .0001, .1);
    float lineValue = lineSegment(vUv, tipPosOld, tipPosNew, th);
    col.rgb = mix(col.rgb, inkColor, lineValue);
    col.rgb = clamp(col.rgb, vec3(0.), vec3(1.));
  }
  gl_FragColor = vec4(col);
}`;

class BufferSim {
  constructor(renderer, size, shader) {
    this.renderer = renderer;
    this.shader = shader;
    this.scene = new THREE.Scene();
    const target = new THREE.WebGLRenderTarget(size, size, {
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      stencilBuffer: false,
      depthBuffer: false
    });
    target.texture.generateMipmaps = false;
    this.fbos = [target, target.clone()];
    this.current = 0;
    this.output = this.fbos[0];
    const camera = new THREE.OrthographicCamera(size / -2, size / 2, size / 2, size / -2, .00001, 1000);
    this.camera = camera;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(size, size), shader);
    this.scene.add(this.quad);
  }

  render() {
    this.shader.uniforms.inputTexture.value = this.fbos[this.current].texture;
    this.current = 1 - this.current;
    this.output = this.fbos[this.current];
    this.renderer.setRenderTarget(this.output);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }

  clear() {
    const oldColor = this.renderer.getClearColor(new THREE.Color());
    const oldAlpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 1);
    this.fbos.forEach((target) => {
      this.renderer.setRenderTarget(target);
      this.renderer.clear(true, true, true);
    });
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(oldColor, oldAlpha);
  }
}

export class InkExperience {
  constructor(canvas, noiseUrl, callbacks = {}) {
    this.canvas = canvas;
    this.noiseUrl = noiseUrl;
    this.callbacks = callbacks;
    this.winWidth = innerWidth;
    this.winHeight = innerHeight;
    this.bgrColor = 0x332e2e;
    this.inkColor = 0x7beeff;
    this.floorSize = 30;
    this.targetHeroUVPos = new THREE.Vector2(.5, .5);
    this.heroOldUVPos = new THREE.Vector2(.5, .5);
    this.heroNewUVPos = new THREE.Vector2(.5, .5);
    this.targetHeroRotation = new THREE.Vector2();
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock(false);
    this.time = 0;
    this.mouseDown = false;
    this.demo = false;
    this.pressure = 0;
    this.persistence = .98;
    this.thickness = .004;
    this.gravity = .5;
    this.pointers = new Map();
    this.lastUserUv = null;
    this.pinchStart = null;
    this.lastWaterTone = 0;
    this.running = false;
    this.frame = 0;
    this.boundDraw = this.draw.bind(this);
  }

  async init() {
    this.noiseTexture = await new THREE.TextureLoader().loadAsync(this.noiseUrl.href);
    this.noiseTexture.wrapS = THREE.RepeatWrapping;
    this.noiseTexture.wrapT = THREE.RepeatWrapping;
    this.createScene();
    this.createRenderer();
    this.createSim();
    this.createHero();
    this.createFloor();
    this.createLight();
    this.createListeners();
    this.reset();
    this.play();
  }

  createScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(this.bgrColor, 13, 20);
    this.camera = new THREE.PerspectiveCamera(60, this.winWidth / this.winHeight, 1, 100);
    this.camera.position.set(0, 7, 8);
    this.camera.lookAt(new THREE.Vector3());
    this.scene.add(this.camera);
  }

  createRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      preserveDrawingBuffer: true
    });
    this.renderer.setClearColor(this.bgrColor);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(this.winWidth, this.winHeight);
    this.renderer.toneMapping = THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.localClippingEnabled = true;
  }

  createSim() {
    this.floorSimMat = new THREE.ShaderMaterial({
      uniforms: {
        inputTexture: { value: null },
        noiseTexture: { value: this.noiseTexture },
        persistence: { value: this.persistence },
        thickness: { value: this.thickness },
        waterDiffusion: { value: .1 },
        waterQuantity: { value: .3 },
        gravity: { value: this.gravity },
        time: { value: 0 },
        tipPosOld: { value: new THREE.Vector2(.5, .5) },
        tipPosNew: { value: new THREE.Vector2(.5, .5) },
        speed: { value: 0 },
        inkColor: { value: new THREE.Color(this.inkColor) }
      },
      vertexShader: simulationVertexShader,
      fragmentShader: simulationFragmentShader
    });
    const size = Math.min(innerWidth, innerHeight) < 700 ? 768 : 1024;
    this.bufferSim = new BufferSim(this.renderer, size, this.floorSimMat);
  }

  createHero() {
    const geometry = new THREE.CylinderGeometry(.05, .2, 1, 16, 1);
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI));
    geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(0, .5, 0));
    this.hero = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: this.inkColor,
      roughness: 1
    }));
    this.hero.position.y = .2;
    this.hero.castShadow = true;
    this.scene.add(this.hero);
  }

  createFloor() {
    const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.common,
      THREE.UniformsLib.shadowmap,
      THREE.UniformsLib.lights,
      {
        color: { value: new THREE.Color(this.bgrColor) },
        tScratches: { value: this.bufferSim.output.texture }
      }
    ]);
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(this.floorSize, this.floorSize),
      new THREE.ShaderMaterial({
        uniforms,
        fragmentShader: floorFragmentShader,
        vertexShader: floorVertexShader,
        lights: true
      })
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
  }

  createLight() {
    this.scene.add(new THREE.AmbientLight(0xffffff));
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(2, 3, 1);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    Object.assign(light.shadow.camera, { near: .5, far: 12, left: -12, right: 12, bottom: -12, top: 12 });
    this.scene.add(light);
  }

  createListeners() {
    this.onResize = () => {
      this.winWidth = innerWidth;
      this.winHeight = innerHeight;
      this.camera.aspect = this.winWidth / this.winHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.winWidth, this.winHeight);
    };
    this.onPointerDown = (event) => {
      this.callbacks.onFirstInteraction?.();
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 1) {
        this.mouseDown = true;
        this.moveFromClient(event.clientX, event.clientY, true);
      } else {
        this.mouseDown = false;
        this.beginPinch();
      }
    };
    this.onPointerMove = (event) => {
      if (event.pointerType === 'mouse' && this.pointers.size === 0) {
        this.moveFromClient(event.clientX, event.clientY, false);
        return;
      }
      if (!this.pointers.has(event.pointerId)) return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 1) this.moveFromClient(event.clientX, event.clientY, true);
      else this.updatePinch();
    };
    this.onPointerEnd = (event) => {
      this.pointers.delete(event.pointerId);
      this.pinchStart = null;
      this.mouseDown = this.pointers.size === 1;
      this.lastUserUv = null;
    };
    addEventListener('resize', this.onResize);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerEnd);
    this.canvas.addEventListener('pointercancel', this.onPointerEnd);
  }

  moveFromClient(clientX, clientY, countPath) {
    this.mouse.set(clientX / this.winWidth * 2 - 1, -(clientY / this.winHeight * 2 - 1));
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hit = this.raycaster.intersectObject(this.floor)[0];
    if (!hit?.uv) return;
    this.targetHeroUVPos.copy(hit.uv);
    if (countPath) {
      if (this.lastUserUv) this.callbacks.onPath?.(hit.uv.distanceTo(this.lastUserUv));
      this.lastUserUv = hit.uv.clone();
    }
  }

  beginPinch() {
    const points = [...this.pointers.values()].slice(0, 2);
    if (points.length < 2) return;
    this.pinchStart = {
      distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
      water: this.floorSimMat.uniforms.waterQuantity.value,
      diffusion: this.floorSimMat.uniforms.waterDiffusion.value
    };
  }

  updatePinch() {
    if (!this.pinchStart) return this.beginPinch();
    const points = [...this.pointers.values()].slice(0, 2);
    const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    const delta = (distance - this.pinchStart.distance) / Math.max(this.winWidth, 320);
    this.floorSimMat.uniforms.waterQuantity.value = THREE.MathUtils.clamp(this.pinchStart.water + delta * .9, .08, .72);
    this.floorSimMat.uniforms.waterDiffusion.value = THREE.MathUtils.clamp(this.pinchStart.diffusion + delta * .35, .04, .28);
    this.canvas.dataset.water = this.floorSimMat.uniforms.waterQuantity.value.toFixed(3);
    if (performance.now() - this.lastWaterTone > 180) {
      this.lastWaterTone = performance.now();
      this.callbacks.onWaterChange?.();
    }
  }

  startDemo() {
    this.demo = true;
    this.mouseDown = true;
  }

  setDemoPoint(x, y) {
    if (this.demo) this.targetHeroUVPos.set(x, y);
  }

  stopDemo() {
    this.demo = false;
    if (this.pointers.size === 0) this.mouseDown = false;
  }

  update() {
    const dt = Math.min(this.clock.getDelta(), .05);
    this.time += dt;
    this.heroNewUVPos.lerp(this.targetHeroUVPos, dt * 5);
    this.hero.position.x = (this.heroNewUVPos.x - .5) * this.floorSize;
    this.hero.position.z = (.5 - this.heroNewUVPos.y) * this.floorSize;
    const heroSpeed = new THREE.Vector2().subVectors(this.heroNewUVPos, this.heroOldUVPos);
    this.targetHeroRotation.lerp(heroSpeed.clone().multiplyScalar(90), dt * 30);
    this.hero.rotation.z = this.targetHeroRotation.x;
    this.hero.rotation.x = this.targetHeroRotation.y;

    const uniforms = this.floorSimMat.uniforms;
    uniforms.tipPosNew.value.copy(this.heroNewUVPos);
    uniforms.tipPosOld.value.copy(this.heroOldUVPos);
    uniforms.speed.value = heroSpeed.length();
    const r = Math.abs(Math.sin(this.time * .61));
    const g = Math.abs(Math.sin(this.time * .43 + 2.09));
    const b = Math.abs(Math.sin(this.time * .36 + 4.18));
    const color = new THREE.Color(r, g, b);
    uniforms.inkColor.value.copy(color);
    uniforms.time.value = this.time;
    uniforms.persistence.value = Math.pow(this.persistence, dt * 10);
    uniforms.gravity.value = this.gravity * dt;
    if (this.mouseDown && this.pressure < .02) this.pressure += dt * .02;
    else if (!this.mouseDown) this.pressure *= Math.pow(.9, dt * 30);
    uniforms.thickness.value = this.thickness + this.pressure;
    this.hero.scale.set(1 + this.pressure * 40, 1 - this.pressure * 10, 1 + this.pressure * 40);
    this.bufferSim.render();
    this.floor.material.uniforms.tScratches.value = this.bufferSim.output.texture;
    this.hero.material.color.copy(color);
    this.heroOldUVPos.copy(this.heroNewUVPos);
  }

  draw() {
    if (!this.running) return;
    this.update();
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.boundDraw);
  }

  play() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.draw();
  }

  pause() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.clock.stop();
  }

  reset() {
    this.bufferSim.clear();
    this.targetHeroUVPos.set(.5, .5);
    this.heroOldUVPos.set(.5, .5);
    this.heroNewUVPos.set(.5, .5);
    this.pressure = 0;
    this.mouseDown = false;
    this.demo = false;
    this.lastUserUv = null;
  }
}
