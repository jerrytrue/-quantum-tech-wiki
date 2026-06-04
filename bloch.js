/* =========================================================
   Bloch Sphere — interactive single-qubit visualization
   Uses three.js (loaded from CDN in index.html as window.THREE)
   ========================================================= */

(function () {
  // helpers for complex arithmetic
  const cMul = (a, b) => ({ re: a.re*b.re - a.im*b.im, im: a.re*b.im + a.im*b.re });
  const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
  const cMag2 = (z) => z.re*z.re + z.im*z.im;
  const cConj = (z) => ({ re: z.re, im: -z.im });

  // Spherical interpolation between two Vector3s (both should be roughly unit length).
  function slerpVec(THREE, a, b, t) {
    let dot = Math.max(-1, Math.min(1, a.dot(b)));
    if (dot > 0.9995 || dot < -0.9995) {
      // Nearly identical or antipodal — fall back to linear lerp + renormalize
      const v = a.clone().lerp(b, t);
      if (v.length() > 1e-6) v.normalize();
      return v;
    }
    const omega = Math.acos(dot);
    const sinO = Math.sin(omega);
    return a.clone().multiplyScalar(Math.sin((1 - t) * omega) / sinO)
      .add(b.clone().multiplyScalar(Math.sin(t * omega) / sinO));
  }

  class BlochSphere {
    constructor(container) {
      if (!window.THREE) {
        container.innerHTML = '<div style="padding:20px;color:#8b97c2;font-size:12px">three.js failed to load — Bloch sphere unavailable.</div>';
        return;
      }
      this.container = container;
      this.alpha = { re: 1, im: 0 };
      this.beta  = { re: 0, im: 0 };

      // Animation state for arrow movement (state updates are instant, arrow lerps).
      // _displayedDir is what's drawn; _targetDir is the true Bloch direction.
      this._displayedDir = null;  // initialized after THREE is ready
      this._targetDir = null;
      this._targetLen = 1;
      this._displayedLen = 1;
      this._animStart = 0;
      this._animDuration = 450;  // ms

      this._initScene();
      this._render(/* skipAnimate */ true);  // initial paint with no transition
      this._resizeHandler = () => this._resize();
      window.addEventListener('resize', this._resizeHandler);
    }

    _initScene() {
      const THREE = window.THREE;
      const w = this.container.clientWidth || 400;
      const h = this.container.clientHeight || 320;

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
      this.camera.position.set(3.2, 2.2, 3.2);
      this.camera.lookAt(0, 0, 0);

      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(window.devicePixelRatio || 1);
      this.renderer.setSize(w, h);
      this.renderer.setClearColor(0x000000, 0);
      this.container.appendChild(this.renderer.domElement);

      // OrbitControls: mouse-drag rotation, auto-rotate when idle, stops on user interaction.
      if (THREE.OrbitControls) {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.enableZoom = false;
        this.controls.enablePan = false;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.6;
        this.controls.target.set(0, 0, 0);
        this.controls.addEventListener('start', () => {
          // First drag → stop auto-rotation, hand control to the user.
          if (this.controls) this.controls.autoRotate = false;
        });
      }

      // Wireframe sphere
      const sphereGeo = new THREE.SphereGeometry(1, 28, 18);
      const wireframe = new THREE.WireframeGeometry(sphereGeo);
      this.scene.add(new THREE.LineSegments(
        wireframe,
        new THREE.LineBasicMaterial({ color: 0x29d8c5, transparent: true, opacity: 0.18 })
      ));

      // Axes (X = pink, Y = teal, Z = purple) — slightly shorter than label distance
      const axisLen = 1.12;
      const axes = [
        { from: [-axisLen, 0, 0], to: [axisLen, 0, 0], color: 0xff5cb0 },
        { from: [0, -axisLen, 0], to: [0, axisLen, 0], color: 0x29d8c5 },
        { from: [0, 0, -axisLen], to: [0, 0, axisLen], color: 0x7c5cff },
      ];
      axes.forEach(a => {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(...a.from),
          new THREE.Vector3(...a.to)
        ]);
        this.scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: a.color })));
      });

      // Bloch labels (physics convention)
      const D = 1.18;
      this._addLabel('|0⟩',  0, D, 0,  0x7c5cff);
      this._addLabel('|1⟩',  0, -D, 0, 0x7c5cff);
      this._addLabel('|+⟩',  D, 0, 0,  0xff5cb0);
      this._addLabel('|+i⟩', 0, 0, D,  0x29d8c5);

      // State arrow
      this.arrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, 0),
        1,
        0xff5cb0,
        0.18,
        0.09
      );
      this.scene.add(this.arrow);

      // Initialize displayed/target directions to |0⟩ pole
      this._displayedDir = new THREE.Vector3(0, 1, 0);
      this._targetDir    = new THREE.Vector3(0, 1, 0);

      this._tick = this._tick.bind(this);
      this._tick();
    }

    _addLabel(text, x, y, z, color) {
      const THREE = window.THREE;
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
      ctx.font = 'bold 56px ui-monospace, "SF Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 64, 64);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(x, y, z);
      sprite.scale.set(0.32, 0.32, 0.32);
      this.scene.add(sprite);
    }

    _resize() {
      if (!this.renderer) return;
      const w = this.container.clientWidth, h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }

    _tick() {
      if (!this.scene) return;
      const THREE = window.THREE;

      // Animate displayed arrow direction toward target via spherical interpolation
      if (this._animStart > 0 && this._displayedDir && this._targetDir) {
        const elapsed = performance.now() - this._animStart;
        const t = Math.min(1, elapsed / this._animDuration);
        const easeT = 1 - Math.pow(1 - t, 3);  // ease-out cubic
        this._displayedDir = slerpVec(THREE, this._animFromDir, this._targetDir, easeT);
        this._displayedLen = this._animFromLen + (this._targetLen - this._animFromLen) * easeT;
        this.arrow.setDirection(this._displayedDir);
        this.arrow.setLength(Math.min(this._displayedLen, 1), 0.18, 0.09);
        if (t >= 1) this._animStart = 0;
      }

      if (this.controls) this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(this._tick);
    }

    // Bloch vector from current state.
    //   ⟨σx⟩ = 2 Re(α* β),  ⟨σy⟩ = 2 Im(α* β),  ⟨σz⟩ = |α|² − |β|²
    _blochVector() {
      const a = this.alpha, b = this.beta;
      const aStarB = cMul(cConj(a), b);
      return { x: 2 * aStarB.re, y: 2 * aStarB.im, z: cMag2(a) - cMag2(b) };
    }

    // Update internal state + kick off animation toward the new Bloch direction.
    // Pass skipAnimate=true on the very first paint to avoid an initial slide-in.
    _render(skipAnimate) {
      const THREE = window.THREE;
      const v = this._blochVector();

      // Map physics (x, y, z) → three.js (x, z, y) so physics +Z is screen up.
      const newDir = new THREE.Vector3(v.x, v.z, v.y);
      const newLen = newDir.length();
      if (newLen > 1e-6) newDir.normalize();
      else newDir.set(0, 1, 0);

      if (skipAnimate || !this._displayedDir) {
        this._displayedDir = newDir.clone();
        this._displayedLen = newLen;
        if (this.arrow) {
          this.arrow.setDirection(this._displayedDir);
          this.arrow.setLength(Math.min(this._displayedLen, 1), 0.18, 0.09);
        }
      } else {
        this._animFromDir = this._displayedDir.clone();
        this._animFromLen = this._displayedLen;
        this._targetDir   = newDir;
        this._targetLen   = newLen;
        this._animStart   = performance.now();
      }

      this._updateDOM(v);
    }

    _updateDOM(v) {
      const fmt = (z) => {
        if (Math.abs(z.im) < 1e-4) return z.re.toFixed(3);
        const sign = z.im >= 0 ? '+' : '';
        return `(${z.re.toFixed(3)}${sign}${z.im.toFixed(3)}i)`;
      };
      const alphaEl = document.getElementById('blochAlpha');
      const betaEl  = document.getElementById('blochBeta');
      const vecEl   = document.getElementById('blochVec');
      if (alphaEl) alphaEl.textContent = fmt(this.alpha);
      if (betaEl)  betaEl.textContent  = fmt(this.beta);
      if (vecEl)   vecEl.textContent = `⟨σ⟩ = (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;

      // Measurement probabilities
      const p0 = cMag2(this.alpha);
      const p1 = cMag2(this.beta);
      const p0Bar = document.getElementById('blochP0Bar');
      const p1Bar = document.getElementById('blochP1Bar');
      const p0Pct = document.getElementById('blochP0Pct');
      const p1Pct = document.getElementById('blochP1Pct');
      if (p0Bar) p0Bar.style.width = (p0 * 100).toFixed(1) + '%';
      if (p1Bar) p1Bar.style.width = (p1 * 100).toFixed(1) + '%';
      if (p0Pct) p0Pct.textContent = (p0 * 100).toFixed(1) + '%';
      if (p1Pct) p1Pct.textContent = (p1 * 100).toFixed(1) + '%';
    }

    _applyMatrix(m) {
      const newA = cAdd(cMul(m[0][0], this.alpha), cMul(m[0][1], this.beta));
      const newB = cAdd(cMul(m[1][0], this.alpha), cMul(m[1][1], this.beta));
      this.alpha = newA;
      this.beta = newB;
      this._render();
    }

    gate(name) {
      const r = (re, im = 0) => ({ re, im });
      const s2 = 1 / Math.sqrt(2);
      const gates = {
        X: [[r(0), r(1)], [r(1), r(0)]],
        Y: [[r(0), r(0, -1)], [r(0, 1), r(0)]],
        Z: [[r(1), r(0)], [r(0), r(-1)]],
        H: [[r(s2), r(s2)], [r(s2), r(-s2)]],
        S: [[r(1), r(0)], [r(0), r(0, 1)]],
        T: [[r(1), r(0)], [r(0), r(s2, s2)]]
      };
      if (gates[name]) this._applyMatrix(gates[name]);
    }

    // Jump to a named preset state.
    setState(name) {
      const s2 = 1 / Math.sqrt(2);
      const map = {
        '0':  { a: { re: 1, im: 0 },  b: { re: 0,  im: 0 } },
        '1':  { a: { re: 0, im: 0 },  b: { re: 1,  im: 0 } },
        '+':  { a: { re: s2, im: 0 }, b: { re: s2, im: 0 } },
        '-':  { a: { re: s2, im: 0 }, b: { re: -s2, im: 0 } },
        '+i': { a: { re: s2, im: 0 }, b: { re: 0,  im: s2 } },
        '-i': { a: { re: s2, im: 0 }, b: { re: 0,  im: -s2 } },
      };
      const p = map[name];
      if (!p) return;
      this.alpha = p.a;
      this.beta = p.b;
      this._render();
    }

    reset() {
      this.setState('0');
    }

    destroy() {
      if (this._raf) cancelAnimationFrame(this._raf);
      if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
      if (this.controls) { this.controls.dispose(); this.controls = null; }
      if (this.renderer) {
        this.renderer.dispose();
        if (this.renderer.domElement && this.renderer.domElement.parentNode) {
          this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
      }
      this.scene = null;
      this.renderer = null;
    }
  }

  window.BlochSphere = BlochSphere;
})();
