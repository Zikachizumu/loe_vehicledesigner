/* 3B görüntüleyici (three.js): araç, kemik hiyerarşisi, X-ışını, iskelet, kapı animasyonu, doku eşlemesi ve seçim. */
(function (root) {
    'use strict';
    const T = THREE;
    if (T.ColorManagement) T.ColorManagement.legacyMode = false;   // hex renkler sRGB → doğrusal çevrilsin
    const CLASS = VSVehicle.CLASS;

    const CHART_COLORS = { top: 0x38bdf8, left: 0xff2e93, right: 0x34d399, front: 0xfb923c, rear: 0xa855f7 };
    const CHART_IDS = ['top', 'left', 'right', 'front', 'rear'];

    const FINISHES = {
        gloss:    { metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 },
        metallic: { metalness: 0.85, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.06 },
        matte:    { metalness: 0.08, roughness: 0.88, clearcoat: 0, clearcoatRoughness: 0.6 },
        satin:    { metalness: 0.3, roughness: 0.52, clearcoat: 0.35, clearcoatRoughness: 0.35 },
        chrome:   { metalness: 1, roughness: 0.06, clearcoat: 0, clearcoatRoughness: 0 },
        pearl:    { metalness: 0.6, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03 },
    };

    function lightColor(boneName) {
        const n = (boneName || '').toLowerCase();
        if (n.includes('head') || n.includes('reverse') || n.includes('reversing')) return 0xfff3d6;
        if (n.includes('tail') || n.includes('brake')) return 0xff2a2a;
        if (n.includes('indicator')) return 0xff9a1a;
        if (n.includes('extralight') || n.includes('siren')) return 0x3b82f6;
        return 0xffd9a0;
    }

    // Siren LED'leri için ışıma ve seçim halkası dokuları (tek sefer üretilir)
    let glowTex = null, ringTex = null;
    function glowTexture() {
        if (glowTex) return glowTex;
        const cv = document.createElement('canvas'); cv.width = cv.height = 128;
        const x = cv.getContext('2d');
        const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.14, 'rgba(255,255,255,0.9)'); g.addColorStop(0.38, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(0, 0, 128, 128);
        return (glowTex = new T.CanvasTexture(cv));
    }
    function ringTexture() {
        if (ringTex) return ringTex;
        const cv = document.createElement('canvas'); cv.width = cv.height = 128;
        const x = cv.getContext('2d');
        x.strokeStyle = '#fff'; x.lineWidth = 7; x.beginPath(); x.arc(64, 64, 54, 0, Math.PI * 2); x.stroke();
        x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 3; x.beginPath(); x.arc(64, 64, 42, 0, Math.PI * 2); x.stroke();
        return (ringTex = new T.CanvasTexture(cv));
    }

    class Scene3D {
        constructor(container) {
            this.container = container;
            this.size = 4096;
            this.vd = null;
            this.charts = null;
            this.xray = false;
            this.skeleton = false;
            this.labels = false;
            this.dirty = true;
            this.onFrame = null;
            this.boneColors = {};
            this.hidden = new Set();
            this.open = {};
            this.selBone = -1;
            this.hoverBone = -1;
            this.body = { color: '#2b2f36', finish: 'gloss' };
            this.tint = 3;
            this.rimColor = '#b9bec6';
            this.neon = { on: false, color: '#ff2e93' };

            const r = this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
            r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            r.outputEncoding = T.sRGBEncoding;
            r.toneMapping = T.ACESFilmicToneMapping;
            r.toneMappingExposure = 1.05;
            r.shadowMap.enabled = true;
            r.shadowMap.type = T.PCFSoftShadowMap;
            container.appendChild(r.domElement);
            r.domElement.className = 'gl';

            this.scene = new T.Scene();
            this.scene.background = new T.Color(0x0b0c10);
            this.camera = new T.PerspectiveCamera(32, 1, 0.1, 400);
            this.camera.position.set(6.5, 3.2, 7.5);
            const c = this.controls = new T.OrbitControls(this.camera, r.domElement);
            c.enableDamping = false;
            c.minDistance = 1.2;
            c.maxDistance = 60;
            c.maxPolarAngle = Math.PI * 0.51;
            c.target.set(0, 0.7, 0);
            c.addEventListener('change', () => this.invalidate());

            this.makeEnvironment();
            this.makeLights();
            this.makeFloor();

            this.root = new T.Group();
            this.root.rotation.x = -Math.PI / 2;     // GTA (+Z yukarı, +Y ön) → three (+Y yukarı, -Z ön)
            this.scene.add(this.root);

            this.raycaster = new T.Raycaster();
            this.ro = new ResizeObserver(() => this.resize());
            this.ro.observe(container);
            this.resize();
            const loop = () => {
                requestAnimationFrame(loop);
                if (this.controls.autoRotate) { this.controls.update(); this.dirty = true; }
                if (this.propTest && this.propObjs && this.propObjs.size) { this.flashProps(); this.dirty = true; }
                if (this.sirenPlay && this.sirens && this.sirens.length) { this.updateSirens(); this.dirty = true; }
                if (!this.dirty) return;
                this.dirty = false;
                this.updateSkeleton();
                r.render(this.scene, this.camera);
                if (this.onFrame) this.onFrame();
            };
            loop();
        }

        invalidate() { this.dirty = true; }

        resize() {
            const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
            this.renderer.setSize(w, h, false);
            this.renderer.domElement.style.width = '100%';
            this.renderer.domElement.style.height = '100%';
            const sh = Math.min(this.viewShift || 0, w * 0.5);
            this.camera.aspect = (w - sh) / h;
            if (sh > 0) this.camera.setViewOffset(w - sh, h, -sh, 0, w, h); else this.camera.clearViewOffset();
            this.camera.updateProjectionMatrix();
            this.invalidate();
        }

        // Sol seçenek paneli açıkken sahne merkezini sağa kaydırır (px)
        setViewShift(px) {
            px = px || 0;
            if (px === (this.viewShift || 0)) return;
            const w = this.container.clientWidth || 1;
            const k = (w - Math.min(this.viewShift || 0, w * 0.5)) / (w - Math.min(px, w * 0.5));     // aynı çerçeve: görünür genişliğe göre uzaklaş / yaklaş
            this.viewShift = px;
            if (this.vd) {
                const d = this.camera.position.clone().sub(this.controls.target).multiplyScalar(k);
                this.camera.position.copy(this.controls.target).add(d);
                this.controls.update();
            }
            this.resize();
        }

        // ------------------------------------------------------------------ ortam / ışık / zemin
        makeEnvironment() {
            const pm = new T.PMREMGenerator(this.renderer);
            const env = new T.Scene();
            const dome = new T.Mesh(
                new T.SphereGeometry(60, 48, 24),
                new T.ShaderMaterial({
                    side: T.BackSide,
                    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
                    fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 top = vec3(0.50,0.56,0.66); vec3 hor = vec3(0.17,0.19,0.23); vec3 bot = vec3(0.03,0.03,0.04); vec3 c = h>0.0 ? mix(hor, top, pow(h,0.6)) : mix(hor, bot, pow(-h,0.5)); gl_FragColor = vec4(c,1.0); }',
                })
            );
            env.add(dome);
            const box = (w, h, x, y, z, col, k) => {
                const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(k), side: T.DoubleSide }));
                m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
            };
            box(30, 18, 0, 34, 0, 0xffffff, 3.2);          // üst yumuşak ışık
            box(5, 22, -26, 8, 4, 0xffffff, 4.5);           // sol şerit
            box(5, 22, 26, 8, -6, 0xdfe8ff, 4.0);           // sağ şerit
            box(18, 4, 0, 6, -30, 0xffffff, 2.4);           // arka
            box(8, 8, 22, 4, 24, 0xff2e93, 3.0);            // LOE vurgusu (magenta yansıma)
            this.scene.environment = pm.fromScene(env, 0.03).texture;
            pm.dispose();
        }

        makeLights() {
            const key = new T.DirectionalLight(0xffffff, 1.6);
            key.position.set(6, 12, 7);
            key.castShadow = true;
            key.shadow.mapSize.set(2048, 2048);
            const sc = key.shadow.camera;
            sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 40;
            key.shadow.bias = -0.0004;
            key.shadow.normalBias = 0.03;
            this.scene.add(key);
            this.key = key;
            const rim = new T.DirectionalLight(0xff6bb3, 0.55);
            rim.position.set(-8, 4, -6);
            this.scene.add(rim);
            this.scene.add(new T.HemisphereLight(0x8a9bb5, 0x15171c, 0.35));
        }

        makeFloor() {
            const cv = document.createElement('canvas');
            cv.width = cv.height = 512;
            const x = cv.getContext('2d');
            const g = x.createRadialGradient(256, 256, 10, 256, 256, 256);
            g.addColorStop(0, 'rgba(34,37,45,1)');
            g.addColorStop(0.55, 'rgba(20,22,27,0.9)');
            g.addColorStop(1, 'rgba(11,12,16,0)');
            x.fillStyle = g; x.fillRect(0, 0, 512, 512);
            const tex = new T.CanvasTexture(cv);
            tex.encoding = T.sRGBEncoding;
            const disc = new T.Mesh(new T.CircleGeometry(16, 64), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
            disc.rotation.x = -Math.PI / 2;
            disc.position.y = -0.002;
            disc.renderOrder = -2;
            const shadow = new T.Mesh(new T.PlaneGeometry(40, 40), new T.ShadowMaterial({ opacity: 0.5 }));
            shadow.rotation.x = -Math.PI / 2;
            shadow.receiveShadow = true;
            const grid = new T.GridHelper(32, 32, 0x2b303a, 0x1a1d24);
            grid.position.y = 0.001;
            grid.material.transparent = true; grid.material.opacity = 0.55;
            this.floor = new T.Group();
            this.floor.add(disc, shadow, grid);
            this.scene.add(this.floor);
            this.grid = grid;
        }

        setGrid(on) { this.grid.visible = !!on; this.invalidate(); }

        // ------------------------------------------------------------------ doku
        setCanvas(canvas, size) {
            this.size = size || this.size;
            if (this.tex) this.tex.dispose();
            const t = this.tex = new T.CanvasTexture(canvas);
            t.encoding = T.sRGBEncoding;
            t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
            t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
            t.needsUpdate = true;
            this.eachPaintMat(m => { m.map = t; m.needsUpdate = true; });
            this.invalidate();
        }

        touchTexture() { if (this.tex) { this.tex.needsUpdate = true; this.invalidate(); } }

        eachPaintMat(fn) {
            if (this.paintMat) fn(this.paintMat);
            for (const k in this.boneMats) fn(this.boneMats[k]);
        }

        makePaintMaterial(color) {
            const f = FINISHES[this.body.finish] || FINISHES.gloss;
            const m = new T.MeshPhysicalMaterial({ color: new T.Color(color), map: this.tex || null, envMapIntensity: 1.1, ...f });
            m.onBeforeCompile = (sh) => {
                sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>',
                    `#ifdef USE_MAP
                        vec4 sampledDiffuseColor = texture2D( map, vUv );
                        diffuseColor.rgb = mix( diffuseColor.rgb, sampledDiffuseColor.rgb, sampledDiffuseColor.a );
                    #endif`);
            };
            m.customProgramCacheKey = () => 'vs-paint';
            return m;
        }

        applyFinish() {
            const f = FINISHES[this.body.finish] || FINISHES.gloss;
            this.eachPaintMat(m => { Object.assign(m, f); m.needsUpdate = true; });
        }

        setBody(color, finish) {
            if (color) this.body.color = color;
            if (finish) this.body.finish = finish;
            if (this.paintMat) { this.paintMat.color.set(this.body.color); this.applyFinish(); }
            this.invalidate();
        }

        setBoneColor(i, color) {
            if (!color) { delete this.boneColors[i]; } else this.boneColors[i] = color;
            this.rebuildBoneMats();
            this.invalidate();
        }

        rebuildBoneMats() {
            // kemik başına renk geçersiz kılma: aynı dokuyu paylaşan ayrı malzemeler
            for (const k in this.boneMats) this.boneMats[k].dispose();
            this.boneMats = {};
            for (const k in this.boneColors) this.boneMats[k] = this.makePaintMaterial(this.boneColors[k]);
            for (const m of this.paintMeshes) {
                const k = m.userData.bone;
                m.material = this.boneMats[k] || this.paintMat;
            }
        }

        setTint(n) {
            this.tint = n;
            if (this.glassMat) {
                const o = [0.12, 0.28, 0.42, 0.55, 0.7, 0.82, 0.94][Math.max(0, Math.min(6, n))];
                this.glassMat.opacity = o;
                const d = [0.5, 0.35, 0.22, 0.12, 0.07, 0.04, 0.02][Math.max(0, Math.min(6, n))];
                this.glassMat.color.setRGB(d, d * 1.05, d * 1.12);
            }
            this.invalidate();
        }

        setRimColor(c) {
            this.rimColor = c;
            if (this.rimMat) this.rimMat.color.set(c);
            this.invalidate();
        }

        setNeon(on, color) {
            this.neon = { on: !!on, color: color || this.neon.color };
            if (this.neonGlow) {
                this.neonGlow.visible = !!on;
                this.neonGlow.material.color.set(this.neon.color);
                this.neonLight.visible = !!on;
                this.neonLight.color.set(this.neon.color);
            }
            this.invalidate();
        }

        // ------------------------------------------------------------------ araç kurulumu
        clearVehicle() {
            if (!this.vd) return;
            this.clearSirens();
            this.root.traverse(o => {
                if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose();
            });
            this.root.clear();
            this.propObjs = new Map();
            for (const m of this.ownedMats || []) m.dispose();
            this.ownedMats = [];
            this.vd = null;
            this.boneGroups = [];
        }

        setVehicle(vd, charts, size) {
            this.clearVehicle();
            this.vd = vd;
            this.charts = charts;
            this.size = size || this.size;
            this.hidden = new Set();
            this.open = {};
            this.boneColors = {};
            this.boneMats = {};
            this.propObjs = new Map();
            this.selBone = -1;
            this.hoverBone = -1;
            const H = vd.header, bones = H.bones, nb = bones.length;
            const bb = H.bbox;
            this.bbox = bb;

            // ortak öznitelikler
            const posAttr = new T.BufferAttribute(vd.pos, 3);
            const nrmAttr = new T.BufferAttribute(vd.nrm, 3);
            const idx = this.fixWinding(vd);

            // kemik grupları (hiyerarşi)
            const groups = this.boneGroups = bones.map((b, i) => { const g = new T.Group(); g.name = b.n; g.userData.bone = i; return g; });
            bones.forEach((b, i) => {
                const p = b.p;
                if (p >= 0 && p < nb && p !== i) {
                    groups[p].add(groups[i]);
                    groups[i].position.set(b.t[0] - bones[p].t[0], b.t[1] - bones[p].t[1], b.t[2] - bones[p].t[2]);
                } else {
                    this.root.add(groups[i]);
                    groups[i].position.set(b.t[0], b.t[1], b.t[2]);
                }
            });

            // malzemeler
            const own = this.ownedMats = [];
            const std = (o) => { const m = new T.MeshStandardMaterial(o); own.push(m); return m; };
            this.paintMat = this.makePaintMaterial(this.body.color); own.push(this.paintMat);
            this.glassMat = new T.MeshPhysicalMaterial({ color: 0x0a0b0d, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.55, envMapIntensity: 1.4, side: T.DoubleSide, depthWrite: false });
            own.push(this.glassMat);
            this.metalMat = std({ color: 0x6d727b, metalness: 0.9, roughness: 0.32 });
            this.tireMat = std({ color: 0x0d0d10, metalness: 0.0, roughness: 0.92 });
            this.interiorMat = std({ color: 0x2b2e35, metalness: 0.05, roughness: 0.85 });
            this.detailMat = std({ color: 0x15161a, metalness: 0.3, roughness: 0.55 });
            this.otherMat = std({ color: 0x5a5e66, metalness: 0.3, roughness: 0.6 });
            this.rimMat = std({ color: this.rimColor, metalness: 1, roughness: 0.18 });
            const lightMats = {};
            const lightMat = (col) => lightMats[col] || (lightMats[col] = std({ color: 0x1a1a1a, emissive: col, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0 }));
            // siren<n> kemiklerinin camı: her LED kendi malzemesini alır (renk / yanıp sönme ayrı ayrı)
            this.sirenLensMats = {};
            const sirenLens = (b) => this.sirenLensMats[b] || (this.sirenLensMats[b] = std({ color: 0x15161b, emissive: 0x3b82f6, emissiveIntensity: 1.2, roughness: 0.25, metalness: 0 }));

            this.meshes = []; this.paintMeshes = [];
            this.boneMeshes = bones.map(() => []);
            for (const g of H.groups) {
                const b = Math.min(g.b, nb - 1);
                const geo = new T.BufferGeometry();
                let mat;
                if (g.c === CLASS.PAINT) {
                    this.buildPaintGeometry(geo, vd, idx, g.s, g.n);
                    mat = this.paintMat;
                } else {
                    geo.setAttribute('position', posAttr);
                    geo.setAttribute('normal', nrmAttr);
                    geo.setIndex(new T.BufferAttribute(idx.subarray(g.s, g.s + g.n), 1));
                    geo.userData.shared = true;
                    mat = g.c === CLASS.GLASS ? this.glassMat
                        : g.c === CLASS.METAL ? this.metalMat
                        : g.c === CLASS.TIRE ? this.tireMat
                        : g.c === CLASS.LIGHT ? (/^siren\d+$/.test(bones[b].n) ? sirenLens(b) : lightMat(lightColor(bones[b].n)))
                        : g.c === CLASS.INTERIOR ? this.interiorMat
                        : g.c === CLASS.DETAIL ? this.detailMat : this.otherMat;
                }
                const mesh = new T.Mesh(geo, mat);
                mesh.position.set(-bones[b].t[0], -bones[b].t[1], -bones[b].t[2]);
                mesh.castShadow = g.c !== CLASS.GLASS;
                mesh.userData = { bone: b, cls: g.c, sharedGeo: g.c !== CLASS.PAINT };
                if (g.c === CLASS.GLASS) mesh.renderOrder = 2;
                groups[b].add(mesh);
                this.meshes.push(mesh);
                this.boneMeshes[b].push(mesh);
                if (g.c === CLASS.PAINT) this.paintMeshes.push(mesh);
            }

            this.buildWheels();
            this.buildDoors();
            this.placeOnGround();
            this.buildSkeletonOverlay();
            this.buildNeon();
            this.applyXray();
            this.setTint(this.tint);
            this.frame();
            this.invalidate();
        }

        // üçgen sarımını köşe normaline göre düzelt (dışa bakan yüz = ön yüz)
        fixWinding(vd) {
            if (vd.idxFixed) return vd.idxFixed;
            const idx = Uint32Array.from(vd.idx);
            const p = vd.pos, n = vd.nrm;
            for (let i = 0; i + 2 < idx.length; i += 3) {
                const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
                const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
                const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
                const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
                const nx = n[a] + n[b] + n[c], ny = n[a + 1] + n[b + 1] + n[c + 1], nz = n[a + 2] + n[b + 2] + n[c + 2];
                if (fx * nx + fy * ny + fz * nz < 0) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
            }
            vd.idxFixed = idx;
            return idx;
        }

        // Boya üçgenleri: her üçgen yüz normaline göre bir yüzeye (chart) izdüşürülür → köşeler kopyalanır
        buildPaintGeometry(geo, vd, idx, start, count) {
            const nt = count / 3;
            const P = new Float32Array(nt * 9), N = new Float32Array(nt * 9), UV = new Float32Array(nt * 6), CH = new Float32Array(nt * 3), COL = new Float32Array(nt * 9);
            const p = vd.pos, n = vd.nrm, size = this.size, charts = this.charts;
            for (let t = 0; t < nt; t++) {
                const ia = idx[start + t * 3], ib = idx[start + t * 3 + 1], ic = idx[start + t * 3 + 2];
                const a = ia * 3, b = ib * 3, c = ic * 3;
                const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
                const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
                let fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
                const l = Math.hypot(fx, fy, fz) || 1;
                fx /= l; fy /= l; fz /= l;
                const cid = VSLayout.chartIdForNormal(fx, fy, fz);
                const chart = charts[VSLayout.chartIndex(cid)];
                const col = new T.Color(CHART_COLORS[cid]);
                [ia, ib, ic].forEach((vi, k) => {
                    const o = t * 9 + k * 3;
                    P[o] = p[vi * 3]; P[o + 1] = p[vi * 3 + 1]; P[o + 2] = p[vi * 3 + 2];
                    N[o] = n[vi * 3]; N[o + 1] = n[vi * 3 + 1]; N[o + 2] = n[vi * 3 + 2];
                    const q = VSLayout.project(chart, P[o], P[o + 1], P[o + 2]);
                    UV[t * 6 + k * 2] = q[0] / size;
                    UV[t * 6 + k * 2 + 1] = 1 - q[1] / size;
                    CH[t * 3 + k] = VSLayout.chartIndex(cid);
                    COL[o] = col.r; COL[o + 1] = col.g; COL[o + 2] = col.b;
                });
            }
            geo.setAttribute('position', new T.BufferAttribute(P, 3));
            geo.setAttribute('normal', new T.BufferAttribute(N, 3));
            geo.setAttribute('uv', new T.BufferAttribute(UV, 2));
            geo.setAttribute('chart', new T.BufferAttribute(CH, 1));
            geo.setAttribute('color', new T.BufferAttribute(COL, 3));
        }

        // Tekerlekler: kemik konumlarından üretilen lastik + jant
        buildWheels() {
            const wheels = VSVehicle.wheels(this.vd);
            const hei = this.bbox.max[2] - this.bbox.min[2];
            let r = Math.max(0.27, Math.min(0.52, hei * 0.27));
            const bike = this.vd.header.bones.length && wheels.length && wheels.length <= 2;
            this.wheelR = r;
            this.wheelMeshes = [];
            if (!wheels.length) return;
            const width = bike ? 0.16 : r * 0.62;
            const tireGeo = new T.CylinderGeometry(r, r, width, 36, 1);
            const rimGeo = new T.CylinderGeometry(r * 0.62, r * 0.62, width * 1.04, 28, 1);
            const spokeGeo = new T.BoxGeometry(r * 1.0, width * 1.06, r * 0.1);
            for (const w of wheels) {
                const grp = new T.Group();
                grp.rotation.z = Math.PI / 2;
                const tire = new T.Mesh(tireGeo, this.tireMat); tire.castShadow = true;
                const rim = new T.Mesh(rimGeo, this.rimMat);
                grp.add(tire, rim);
                for (let k = 0; k < 5; k++) {
                    const s = new T.Mesh(spokeGeo, this.rimMat);
                    s.rotation.y = k * Math.PI / 5;
                    grp.add(s);
                }
                grp.userData = { wheel: true, boneIndex: w.i };
                const holder = new T.Group();
                holder.position.set(w.p[0], w.p[1], w.p[2]);
                holder.add(grp);
                this.root.add(holder);
                this.wheelMeshes.push(holder);
            }
        }

        // Kapı / kaput / bagaj eksen ve yönleri (kemik merkezine göre geometri ağırlık merkezinden)
        buildDoors() {
            const bones = this.vd.header.bones;
            this.movables = [];
            const pos = this.vd.pos, idx = this.vd.idxFixed;
            bones.forEach((b, i) => {
                const role = VSVehicle.boneRole(b.n);
                if (!role || !['door', 'hood', 'boot'].includes(role.kind)) return;
                // ağırlık merkezi
                let cx = 0, cy = 0, cz = 0, cn = 0;
                for (const m of this.boneMeshes[i]) {
                    const g = this.vd.header.groups.find(gr => gr.b === i && gr.c === m.userData.cls);
                    if (!g) continue;
                    for (let k = g.s; k < g.s + g.n; k++) {
                        const v = idx[k] * 3;
                        cx += pos[v]; cy += pos[v + 1]; cz += pos[v + 2]; cn++;
                    }
                }
                if (!cn) return;
                cx = cx / cn - b.t[0]; cy = cy / cn - b.t[1]; cz = cz / cn - b.t[2];
                const mv = { bone: i, kind: role.kind, label: role.label, max: role.kind === 'door' ? 58 : 52 };
                if (role.kind === 'door') {
                    mv.axis = 'z';
                    const wx = cx + b.t[0];
                    const outward = wx >= 0 ? 1 : -1;
                    const dx = (th) => (cx * Math.cos(th) - cy * Math.sin(th)) - cx;
                    mv.sign = (dx(0.1) * outward > 0) ? 1 : -1;
                } else {
                    mv.axis = 'x';
                    mv.sign = cy >= 0 ? 1 : -1;
                }
                this.movables.push(mv);
            });
        }

        setOpen(boneIndex, t) {
            const mv = this.movables.find(m => m.bone === boneIndex);
            if (!mv) return;
            this.open[boneIndex] = t;
            const g = this.boneGroups[boneIndex];
            const a = mv.sign * mv.max * (Math.PI / 180) * t;
            g.rotation.set(0, 0, 0);
            if (mv.axis === 'z') g.rotation.z = a; else g.rotation.x = a;
            this.invalidate();
        }

        // Zemin: tekerlek eksen yüksekliği − yarıçap
        placeOnGround() {
            const bb = this.bbox;
            const wheels = VSVehicle.wheels(this.vd);
            let ground = bb.min[2];
            if (wheels.length) ground = Math.min(...wheels.map(w => w.p[2])) - this.wheelR;
            this.ground = ground;
            const cx = (bb.min[0] + bb.max[0]) / 2, cy = (bb.min[1] + bb.max[1]) / 2;
            this.root.position.set(-cx, -ground, cy);
            this.center = new T.Vector3(0, (bb.max[2] - ground) * 0.5, 0);
            this.radius = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]) * 0.5;
            this.key.target.position.copy(this.center);
            this.scene.add(this.key.target);
            const k = Math.max(7, this.radius * 1.4);
            const sc = this.key.shadow.camera;
            sc.left = -k; sc.right = k; sc.top = k; sc.bottom = -k; sc.updateProjectionMatrix();
        }

        buildNeon() {
            if (this.neonGlow) { this.scene.remove(this.neonGlow, this.neonLight); }
            const bb = this.bbox;
            const L = bb.max[1] - bb.min[1], W = bb.max[0] - bb.min[0];
            const cv = document.createElement('canvas'); cv.width = cv.height = 256;
            const x = cv.getContext('2d');
            const g = x.createRadialGradient(128, 128, 20, 128, 128, 128);
            g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
            x.fillStyle = g; x.fillRect(0, 0, 256, 256);
            const mat = new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv), color: this.neon.color, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
            this.neonGlow = new T.Mesh(new T.PlaneGeometry(W * 1.9, L * 1.35), mat);
            this.neonGlow.rotation.x = -Math.PI / 2;
            this.neonGlow.position.y = 0.012;
            this.neonGlow.visible = this.neon.on;
            this.neonLight = new T.PointLight(this.neon.color, 2.4, 6, 2);
            this.neonLight.position.set(0, 0.25, 0);
            this.neonLight.visible = this.neon.on;
            this.scene.add(this.neonGlow, this.neonLight);
        }

        // ------------------------------------------------------------------ kamera
        // sınır küresini hem dikey hem yatay görüş alanına sığdıran uzaklık
        fitDistance() {
            const vf = this.camera.fov * Math.PI / 180;
            const hf = 2 * Math.atan(Math.tan(vf / 2) * this.camera.aspect);
            const f = Math.min(vf, hf);
            return Math.max(3.2, (this.radius * 1.18) / Math.tan(f / 2));
        }

        frame() { this.view('iso'); this.controls.minDistance = Math.max(0.8, this.radius * 0.5); this.controls.maxDistance = Math.max(30, this.radius * 14); }

        view(name) {
            if (!this.vd) return;
            const d = this.fitDistance();
            const c = this.center;
            const dir = {
                iso: [0.62, 0.30, 0.72], front: [0, 0.07, -1], rear: [0, 0.07, 1],
                left: [-1, 0.05, 0], right: [1, 0.05, 0], top: [0, 1, 0.02],
            }[name] || [0.62, 0.3, 0.72];
            const l = Math.hypot(dir[0], dir[1], dir[2]);
            const k = (name === 'top' ? d * 1.02 : d) / l;
            this.camera.position.set(c.x + dir[0] * k, c.y + dir[1] * k, c.z + dir[2] * k);
            this.controls.target.copy(c);
            this.controls.update();
            this.invalidate();
        }

        // ------------------------------------------------------------------ X-ışını
        setXray(on) { this.xray = !!on; this.applyXray(); }

        applyXray() {
            if (!this.meshes) return;
            if (!this.xrayMat) {
                this.xrayMat = new T.MeshBasicMaterial({ color: 0x7b8494, transparent: true, opacity: 0.12, depthWrite: false });
                this.wireMat = new T.MeshBasicMaterial({ wireframe: true, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false });
                this.wireGrey = new T.MeshBasicMaterial({ wireframe: true, color: 0x6a7280, transparent: true, opacity: 0.35, depthWrite: false });
            }
            for (const m of this.meshes) {
                if (this.xray) {
                    if (!m.userData.orig) m.userData.orig = m.material;
                    m.material = this.xrayMat;
                    m.castShadow = false;
                    if (!m.userData.wire) {
                        const w = new T.Mesh(m.geometry, m.userData.cls === CLASS.PAINT ? this.wireMat : this.wireGrey);
                        w.userData.sharedGeo = true;
                        w.renderOrder = 3;
                        m.add(w);
                        m.userData.wire = w;
                    }
                    m.userData.wire.visible = true;
                } else {
                    if (m.userData.orig) { m.material = m.userData.cls === CLASS.PAINT ? (this.boneMats[m.userData.bone] || this.paintMat) : m.userData.orig; m.userData.orig = null; }
                    m.castShadow = m.userData.cls !== CLASS.GLASS;
                    if (m.userData.wire) m.userData.wire.visible = false;
                }
            }
            this.invalidate();
        }

        // ------------------------------------------------------------------ kemik görünürlüğü / vurgulama
        setBoneVisible(i, vis, withChildren) {
            const list = withChildren ? VSVehicle.subtree(this.vd, i) : [i];
            for (const b of list) {
                if (vis) this.hidden.delete(b); else this.hidden.add(b);
                this.boneMeshes[b].forEach(m => { m.visible = vis; });
            }
            this.invalidate();
        }

        showAllBones() {
            this.hidden.clear();
            this.meshes.forEach(m => { m.visible = true; });
            this.invalidate();
        }

        isolateBone(i) {
            const keep = new Set(VSVehicle.subtree(this.vd, i));
            this.hidden.clear();
            this.vd.header.bones.forEach((b, k) => {
                const vis = keep.has(k);
                if (!vis) this.hidden.add(k);
                this.boneMeshes[k].forEach(m => { m.visible = vis; });
            });
            this.invalidate();
        }

        highlightBone(i) {
            if (this.hl) { this.hl.forEach(m => m.parent && m.parent.remove(m)); }
            this.hl = [];
            this.selBone = i;
            if (i >= 0 && this.boneMeshes[i]) {
                if (!this.hlMat) this.hlMat = new T.MeshBasicMaterial({ color: 0xff2e93, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
                for (const m of this.boneMeshes[i]) {
                    const h = new T.Mesh(m.geometry, this.hlMat);
                    h.userData.sharedGeo = true; h.renderOrder = 4;
                    m.add(h); this.hl.push(h);
                }
            }
            this.invalidate();
        }

        // ------------------------------------------------------------------ iskelet katmanı
        buildSkeletonOverlay() {
            if (this.skelGroup) { this.scene.remove(this.skelGroup); }
            const bones = this.vd.header.bones, nb = bones.length;
            const lineGeo = new T.BufferGeometry();
            lineGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(nb * 6), 3));
            const lines = new T.LineSegments(lineGeo, new T.LineBasicMaterial({ color: 0xff2e93, transparent: true, opacity: 0.85, depthTest: false }));
            lines.frustumCulled = false; lines.renderOrder = 10;
            const ptGeo = new T.BufferGeometry();
            ptGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(nb * 3), 3));
            ptGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(nb * 3), 3));
            const pts = new T.Points(ptGeo, new T.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, depthTest: false, transparent: true }));
            pts.frustumCulled = false; pts.renderOrder = 11;
            this.skelGroup = new T.Group();
            this.skelGroup.add(lines, pts);
            this.skelGroup.visible = this.skeleton;
            this.skelLines = lines; this.skelPts = pts;
            this.scene.add(this.skelGroup);
            this.boneWorld = new Float32Array(nb * 3);
            // LOD yardımcı kemikleri (ör. wheelmesh_lf_l1) araçtan metrelerce uzaktadır; iskelet çiziminde gösterilmez
            const bb = this.bbox, M = 1.6;
            this.far = bones.map(b => b.t[0] < bb.min[0] - M || b.t[0] > bb.max[0] + M || b.t[1] < bb.min[1] - M || b.t[1] > bb.max[1] + M || b.t[2] < bb.min[2] - M || b.t[2] > bb.max[2] + M);
        }

        setSkeleton(on, labels) {
            this.skeleton = !!on;
            this.labels = !!labels;
            if (this.skelGroup) this.skelGroup.visible = this.skeleton;
            this.invalidate();
        }

        updateSkeleton() {
            if (!this.skeleton || !this.vd || !this.skelLines) return;
            this.root.updateMatrixWorld(true);
            const bones = this.vd.header.bones, nb = bones.length;
            const v = new T.Vector3();
            const lp = this.skelLines.geometry.attributes.position.array;
            const pp = this.skelPts.geometry.attributes.position.array;
            const pc = this.skelPts.geometry.attributes.color.array;
            const bw = this.boneWorld;
            for (let i = 0; i < nb; i++) {
                this.boneGroups[i].getWorldPosition(v);
                bw[i * 3] = v.x; bw[i * 3 + 1] = v.y; bw[i * 3 + 2] = v.z;
                pp[i * 3] = v.x; pp[i * 3 + 1] = v.y; pp[i * 3 + 2] = v.z;
                if (this.far[i]) { pp[i * 3] = pp[i * 3 + 1] = pp[i * 3 + 2] = 1e5; }
                const sel = i === this.selBone, hov = i === this.hoverBone;
                const hid = this.hidden.has(i);
                pc[i * 3] = sel ? 1 : hov ? 1 : hid ? 0.3 : 0.95;
                pc[i * 3 + 1] = sel ? 0.18 : hov ? 0.85 : hid ? 0.3 : 0.95;
                pc[i * 3 + 2] = sel ? 0.58 : hov ? 0.2 : hid ? 0.35 : 0.98;
            }
            let n = 0;
            for (let i = 0; i < nb; i++) {
                const p = bones[i].p;
                if (p < 0 || p >= nb || p === i || this.far[i] || this.far[p]) continue;
                lp[n++] = bw[p * 3]; lp[n++] = bw[p * 3 + 1]; lp[n++] = bw[p * 3 + 2];
                lp[n++] = bw[i * 3]; lp[n++] = bw[i * 3 + 1]; lp[n++] = bw[i * 3 + 2];
            }
            this.skelLines.geometry.setDrawRange(0, n / 3);
            this.skelLines.geometry.attributes.position.needsUpdate = true;
            this.skelPts.geometry.attributes.position.needsUpdate = true;
            this.skelPts.geometry.attributes.color.needsUpdate = true;
        }

        // Ekran konumuna en yakın kemik (px içinde)
        nearestBone(clientX, clientY, maxPx) {
            if (!this.skeleton || !this.boneWorld) return -1;
            const rect = this.renderer.domElement.getBoundingClientRect();
            const v = new T.Vector3();
            let best = -1, bd = (maxPx || 12) ** 2;
            const nb = this.vd.header.bones.length;
            for (let i = 0; i < nb; i++) {
                if (this.far[i]) continue;
                v.set(this.boneWorld[i * 3], this.boneWorld[i * 3 + 1], this.boneWorld[i * 3 + 2]).project(this.camera);
                if (v.z > 1) continue;
                const sx = rect.left + (v.x * 0.5 + 0.5) * rect.width, sy = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
                const d = (sx - clientX) ** 2 + (sy - clientY) ** 2;
                if (d < bd) { bd = d; best = i; }
            }
            return best;
        }

        boneScreen(i) {
            const rect = this.renderer.domElement.getBoundingClientRect();
            const v = new T.Vector3(this.boneWorld[i * 3], this.boneWorld[i * 3 + 1], this.boneWorld[i * 3 + 2]).project(this.camera);
            return { x: (v.x * 0.5 + 0.5) * rect.width, y: (-v.y * 0.5 + 0.5) * rect.height, behind: v.z > 1 };
        }

        // ------------------------------------------------------------------ seçim (ışın)
        pick(clientX, clientY, paintOnly) {
            if (!this.vd) return null;
            this.scene.updateMatrixWorld(true);       // kapı/kemik animasyonu sonrası güncel matrisler
            this.camera.updateMatrixWorld(true);
            const rect = this.renderer.domElement.getBoundingClientRect();
            const ndc = new T.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
            this.raycaster.setFromCamera(ndc, this.camera);
            const list = (paintOnly ? this.paintMeshes : this.meshes).filter(m => m.visible && this.boneVisible(m.userData.bone));
            const hits = this.raycaster.intersectObjects(list, false);
            for (const h of hits) {
                const m = h.object;
                if (m.userData.cls === CLASS.GLASS && !paintOnly) continue;
                const res = { bone: m.userData.bone, cls: m.userData.cls, point: h.point };
                if (h.face) res.normal = h.face.normal.clone().transformDirection(m.matrixWorld);
                if (m.userData.cls === CLASS.PAINT && h.uv) {
                    res.px = h.uv.x * this.size;
                    res.py = (1 - h.uv.y) * this.size;
                    res.chart = CHART_IDS[Math.round(m.geometry.attributes.chart.getX(h.face.a))];
                }
                return res;
            }
            return null;
        }

        boneVisible(i) { return !this.hidden.has(i); }

        // GTA uzayına çevrilmiş dünya noktası
        toLocal(point) {
            const p = this.root.worldToLocal(point.clone());
            return [p.x, p.y, p.z];
        }

        // ------------------------------------------------------------------ siren LED'leri
        // set: sirens.json içindeki siren seti (null → LED yok);  st: { off: {n:true}, col: {n:'#hex'} } kullanıcı değişiklikleri
        clearSirens() {
            for (const s of this.sirens || []) { if (s.sprite.parent) s.sprite.parent.remove(s.sprite); s.sprite.material.dispose(); }
            if (this.sirenRing) { if (this.sirenRing.parent) this.sirenRing.parent.remove(this.sirenRing); this.sirenRing.material.dispose(); }
            this.sirens = []; this.sirenSet = null; this.sirenRing = null;
        }

        setSirens(set, st) {
            if (!this.vd) return;
            st = st || { off: {}, col: {} };
            if (set !== this.sirenSet || !this.sirens) {
                this.clearSirens();
                this.sirenSet = set;
                if (set) {
                    const bones = this.vd.header.bones, idx = {};
                    bones.forEach((b, i) => { idx[b.n] = i; });
                    for (const led of set.L) {
                        const bi = idx['siren' + led.n];
                        if (bi === undefined) continue;
                        const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), color: led.c, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
                        sp.renderOrder = 12;
                        this.boneGroups[bi].add(sp);
                        this.sirens.push({ led, n: led.n, bone: bi, sprite: sp, lens: this.sirenLensMats[bi] || null, color: new T.Color(led.c), off: false, k: 1,
                            size: Math.min(0.6, Math.max(0.16, 0.16 + 0.22 * Math.min(led.z || 1, 2))) });
                    }
                    this.sirens.sort((a, b) => a.n - b.n);
                }
            }
            for (const s of this.sirens) { s.off = !!st.off[s.n]; s.color.set(st.col[s.n] || s.led.c); }
            this.updateSirens();
            this.invalidate();
        }

        // Her LED'in parlaklığı (0..1): kapalı → 0; animasyon kapalıysa sürekli yanık; açıksa sequencer deseni / dönen far
        updateSirens() {
            if (!this.sirens || !this.sirens.length) return;
            const set = this.sirenSet, sp = this.sirenSpeed || 1;
            const t = performance.now() / 1000;
            const bit = 60 / Math.max(30, (set ? set.b * (set.t || 1) : 200)) / 2 / sp;     // bir sequencer biti (sn)
            const bi = Math.floor(t / bit) & 31;
            const emph = this.sirenEmph;
            for (const s of this.sirens) {
                const led = s.led;
                let k = 1;
                if (s.off) k = 0;
                else if (this.sirenPlay) {
                    if (led.f) k = (led.q >>> bi) & 1;
                    else if (led.r) { const a = (led.a || 0) + (led.d ? -1 : 1) * t * (led.s || 1) * Math.PI * 2 * sp * 0.8; k = Math.pow(0.5 + 0.5 * Math.cos(a), 2.2); }
                }
                s.k = k;
                const hidden = this.hidden.has(s.bone);
                const spr = s.sprite;
                spr.visible = !hidden && k > 0.02;
                spr.material.color.copy(s.color);
                spr.material.opacity = k * (emph ? 1 : 0.75);
                spr.scale.setScalar(s.size * (emph ? 1 : 0.55) * (0.62 + 0.38 * k));
                if (s.lens) { s.lens.emissive.copy(s.color); s.lens.emissiveIntensity = 0.06 + 2.9 * k; }
            }
            if (this.sirenRing) {
                const s = this.sirens.find(x => x.n === this.sirenSel);
                this.sirenRing.visible = !!s && !this.hidden.has(s.bone);
                if (s) { if (this.sirenRing.parent !== s.sprite.parent) s.sprite.parent.add(this.sirenRing); this.sirenRing.scale.setScalar(0.17 + 0.012 * Math.sin(t * 6)); this.sirenRing.material.color.copy(s.color).lerp(new T.Color(0xffffff), 0.55); }
            }
        }

        setSirenMode(play, emph, speed) {
            this.sirenPlay = !!play; this.sirenEmph = !!emph; this.sirenSpeed = speed || 1;
            this.updateSirens();
            this.invalidate();
        }

        selectSiren(n) {
            this.sirenSel = n || 0;
            if (n && !this.sirenRing && this.sirens && this.sirens.length) {
                this.sirenRing = new T.Sprite(new T.SpriteMaterial({ map: ringTexture(), color: 0xffffff, transparent: true, depthTest: false, depthWrite: false }));
                this.sirenRing.renderOrder = 30;
            }
            this.updateSirens();
            this.invalidate();
        }

        // Ekran konumuna en yakın LED (px içinde) → siren numarası, yoksa 0
        nearestSiren(clientX, clientY, maxPx) {
            if (!this.sirens || !this.sirens.length) return 0;
            this.scene.updateMatrixWorld(true);
            this.camera.updateMatrixWorld(true);
            const rect = this.renderer.domElement.getBoundingClientRect();
            const v = new T.Vector3();
            let best = 0, bd = (maxPx || 20) ** 2;
            for (const s of this.sirens) {
                if (this.hidden.has(s.bone)) continue;
                s.sprite.getWorldPosition(v).project(this.camera);
                if (v.z > 1) continue;
                const sx = rect.left + (v.x * 0.5 + 0.5) * rect.width, sy = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
                const d = (sx - clientX) ** 2 + (sy - clientY) ** 2;
                if (d < bd) { bd = d; best = s.n; }
            }
            return best;
        }

        focusSiren(n) {
            const s = this.sirens && this.sirens.find(x => x.n === n);
            if (!s) return;
            this.scene.updateMatrixWorld(true);
            const p = s.sprite.getWorldPosition(new T.Vector3());
            const dir = this.camera.position.clone().sub(this.controls.target).normalize();
            this.controls.target.copy(p);
            this.camera.position.copy(p).addScaledVector(dir, Math.max(this.controls.minDistance, 1.9));
            this.controls.update();
            this.invalidate();
        }

        // ------------------------------------------------------------------ aksesuarlar (prop)
        propParent(rec) {
            const i = this.vd.header.bones.findIndex(b => b.n === rec.bone);
            return i >= 0 ? this.boneGroups[i] : this.root;
        }

        addProp(rec) {
            if (!this.vd) return null;
            this.removeProp(rec.id);
            const obj = VSProps.build(rec);
            obj.position.set(rec.pos[0], rec.pos[1], rec.pos[2]);
            obj.rotation.set(rec.rot[0] * Math.PI / 180, rec.rot[1] * Math.PI / 180, rec.rot[2] * Math.PI / 180, 'XYZ');
            obj.scale.setScalar(rec.s || 1);
            obj.traverse(o => { if (o.isMesh) o.userData.propId = rec.id; });
            this.propParent(rec).add(obj);
            this.propObjs.set(rec.id, obj);
            this.invalidate();
            return obj;
        }

        removeProp(id) {
            const o = this.propObjs && this.propObjs.get(id);
            if (o) {
                o.parent && o.parent.remove(o);
                o.traverse(m => { if (m.isMesh) { m.geometry.dispose(); const ms = Array.isArray(m.material) ? m.material : [m.material]; ms.forEach(x => x.dispose()); } });
                this.propObjs.delete(id);
                this.invalidate();
            }
        }

        clearProps() { for (const id of [...this.propObjs.keys()]) this.removeProp(id); }

        setPropTest(on) {
            this.propTest = !!on;
            if (!on) this.flashProps(true);
            this.invalidate();
        }

        // ışık testi: soldaki/sağdaki camlar sırayla yanıp söner
        flashProps(reset) {
            const ph = Math.floor(performance.now() / 150) % 4;
            this.propObjs.forEach(obj => obj.traverse(m => {
                if (!m.isMesh || m.userData.lens === undefined) return;
                const base = 0.55;
                if (reset) { m.material.emissiveIntensity = base; return; }
                const on = (m.userData.lens === 0) ? (ph === 0 || ph === 1) : (ph === 2 || ph === 3);
                m.material.emissiveIntensity = on ? 3.4 : 0.12;
            }));
        }

        // Araç uzayında (x, y) noktasının üstünden aşağı ışın: tavan/kaput yüzeyi
        surfaceAt(x, y) {
            if (!this.vd) return null;
            this.scene.updateMatrixWorld(true);
            const bb = this.bbox;
            const o = new T.Vector3(x, y, bb.max[2] + 1.5);
            const w = this.root.localToWorld(o.clone());
            const dir = this.root.localToWorld(new T.Vector3(x, y, bb.max[2] + 0.5)).sub(w).normalize();   // aşağı (araç -Z)
            this.raycaster.set(w, dir);
            const list = this.meshes.filter(m => m.visible && m.userData.cls !== CLASS.GLASS && !this.hidden.has(m.userData.bone));
            const hits = this.raycaster.intersectObjects(list, false);
            if (!hits.length) return null;
            const h = hits[0];
            return { bone: h.object.userData.bone, cls: h.object.userData.cls, point: h.point, normal: h.face.normal.clone().transformDirection(h.object.matrixWorld) };
        }

        // Araç önünden geriye doğru yatay ışın (tampon/ızgara yüzeyi): x, z araç uzayında
        surfaceFront(x, z) {
            if (!this.vd) return null;
            this.scene.updateMatrixWorld(true);
            const bb = this.bbox;
            const o = this.root.localToWorld(new T.Vector3(x, bb.max[1] + 1.5, z));
            const t = this.root.localToWorld(new T.Vector3(x, bb.max[1] - 0.5, z));
            this.raycaster.set(o, t.sub(o).normalize());
            const list = this.meshes.filter(m => m.visible && m.userData.cls !== CLASS.GLASS && !this.hidden.has(m.userData.bone));
            const hits = this.raycaster.intersectObjects(list, false);
            if (!hits.length) return null;
            const h = hits[0];
            return { bone: h.object.userData.bone, cls: h.object.userData.cls, point: h.point, normal: h.face.normal.clone().transformDirection(h.object.matrixWorld) };
        }

        capture(w, h) {
            const r = this.renderer;
            this.updateSkeleton();
            r.render(this.scene, this.camera);
            const src = r.domElement;
            const c = document.createElement('canvas');
            c.width = w || 320; c.height = h || 180;
            const x = c.getContext('2d');
            const sr = src.width / src.height, tr = c.width / c.height;
            let sw = src.width, sh = src.height, sx = 0, sy = 0;
            if (sr > tr) { sw = src.height * tr; sx = (src.width - sw) / 2; } else { sh = src.width / tr; sy = (src.height - sh) / 2; }
            x.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
            return c.toDataURL('image/jpeg', 0.8);
        }
    }

    root.Scene3D = Scene3D;
    root.VS3D = { CHART_COLORS, CHART_IDS, FINISHES };
})(window);
