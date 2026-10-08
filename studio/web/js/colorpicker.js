/* Renk seçici: doygunluk/parlaklık alanı + ton çubuğu + HEX/RGB/HSL + son kullanılanlar + hazır renkler. */
(function () {
    'use strict';

    const PRESETS = ['#ff2e4d', '#ff8a00', '#ffd500', '#22c55e', '#2ee6c8', '#3b82f6', '#a855f7', '#ffffff', '#111111'];
    const RECENT_KEY = 'lvd_recent_colors';

    function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
    function hexToRgb(h) {
        h = String(h || '').replace('#', '');
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        const n = parseInt(h, 16);
        if (isNaN(n) || h.length !== 6) return null;
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
    }
    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        let h = 0;
        if (d) {
            if (mx === r) h = ((g - b) / d) % 6;
            else if (mx === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60; if (h < 0) h += 360;
        }
        return [h, mx ? d / mx : 0, mx];
    }
    function hsvToRgb(h, s, v) {
        const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
        let r = 0, g = 0, b = 0;
        if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
        else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
        else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
        return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
    }
    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        let h = 0, s = 0; const l = (mx + mn) / 2;
        if (mx !== mn) {
            const d = mx - mn;
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
            h *= 60;
        }
        return [h, s * 100, l * 100];
    }
    function hslToRgb(h, s, l) {
        s /= 100; l /= 100;
        const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
        const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return [f(0) * 255, f(8) * 255, f(4) * 255];
    }

    function loadRecent() {
        try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.slice(0, 16) : []; } catch (e) { return []; }
    }
    function saveRecent(list) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 16))); } catch (e) { /* yok say */ } }

    class ColorPicker {
        constructor(host, opts) {
            this.host = host;
            this.opts = opts || {};
            this.mode = 'hex';
            this.hsv = [0, 1, 1];
            this.build();
            this.setValue(this.opts.value || '#ffffff', true);
        }

        t(k) { return this.opts.t ? this.opts.t(k) : k; }

        build() {
            const el = document.createElement('div');
            el.className = 'cp';
            el.innerHTML = `
                <div class="cp-sv"><div class="cp-sv-w"></div><div class="cp-sv-b"></div><i class="cp-knob"></i></div>
                <div class="cp-hue"><i class="cp-knob"></i></div>
                <div class="cp-modes seg">
                    <button data-m="hex" class="on">HEX</button><button data-m="rgb">RGB</button><button data-m="hsl">HSL</button>
                </div>
                <div class="cp-inputs"></div>
                <div class="cp-sub">${this.t('recent')}</div>
                <div class="cp-sw cp-recent"></div>
                <div class="cp-cur"><i></i><span class="mono"></span></div>
                <div class="cp-sw cp-presets">${PRESETS.map(c => `<button style="--c:${c}" data-c="${c}"></button>`).join('')}</div>`;
            this.host.innerHTML = '';
            this.host.appendChild(el);
            this.el = el;
            this.sv = el.querySelector('.cp-sv');
            this.svKnob = this.sv.querySelector('.cp-knob');
            this.hue = el.querySelector('.cp-hue');
            this.hueKnob = this.hue.querySelector('.cp-knob');
            this.inputs = el.querySelector('.cp-inputs');
            this.recentEl = el.querySelector('.cp-recent');
            this.cur = el.querySelector('.cp-cur');

            const drag = (area, fn) => {
                area.addEventListener('pointerdown', e => {
                    e.preventDefault();
                    area.setPointerCapture(e.pointerId);
                    fn(e);
                    const mv = ev => fn(ev);
                    const up = () => {
                        area.removeEventListener('pointermove', mv);
                        area.removeEventListener('pointerup', up);
                        area.removeEventListener('pointercancel', up);
                        this.commit();
                    };
                    area.addEventListener('pointermove', mv);
                    area.addEventListener('pointerup', up);
                    area.addEventListener('pointercancel', up);
                });
            };
            drag(this.sv, e => {
                const r = this.sv.getBoundingClientRect();
                this.hsv[1] = clamp((e.clientX - r.left) / r.width, 0, 1);
                this.hsv[2] = 1 - clamp((e.clientY - r.top) / r.height, 0, 1);
                this.fromHsv();
            });
            drag(this.hue, e => {
                const r = this.hue.getBoundingClientRect();
                this.hsv[0] = clamp((e.clientX - r.left) / r.width, 0, 1) * 359.9;
                this.fromHsv();
            });
            el.querySelector('.cp-modes').addEventListener('click', e => {
                const b = e.target.closest('button[data-m]');
                if (!b) return;
                this.mode = b.dataset.m;
                el.querySelectorAll('.cp-modes button').forEach(x => x.classList.toggle('on', x === b));
                this.renderInputs();
            });
            el.addEventListener('click', e => {
                const b = e.target.closest('button[data-c]');
                if (!b) return;
                this.setValue(b.dataset.c);
                this.emit();
                this.commit();
            });
            this.renderRecent();
        }

        renderRecent() {
            const list = loadRecent();
            this.recentEl.innerHTML = list.length
                ? list.map(c => `<button style="--c:${c}" data-c="${c}" title="${c}"></button>`).join('')
                : '<span class="cp-empty">—</span>';
        }

        renderInputs() {
            const rgb = hexToRgb(this.value) || [255, 255, 255];
            let html;
            if (this.mode === 'hex') {
                html = `<input class="inp mono" data-k="hex" maxlength="7" value="${this.value}">`;
            } else if (this.mode === 'rgb') {
                html = ['R', 'G', 'B'].map((k, i) => `<label class="cp-num"><input class="inp mono" type="number" min="0" max="255" data-k="rgb" data-i="${i}" value="${Math.round(rgb[i])}"><span>${k}</span></label>`).join('');
            } else {
                const hsl = rgbToHsl(...rgb);
                const max = [360, 100, 100];
                html = ['H', 'S', 'L'].map((k, i) => `<label class="cp-num"><input class="inp mono" type="number" min="0" max="${max[i]}" data-k="hsl" data-i="${i}" value="${Math.round(hsl[i])}"><span>${k}</span></label>`).join('');
            }
            this.inputs.innerHTML = html;
            this.inputs.querySelectorAll('input').forEach(inp => {
                inp.addEventListener('change', () => this.onInput(inp));
                inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); });
            });
        }

        onInput(inp) {
            const k = inp.dataset.k;
            if (k === 'hex') {
                let v = inp.value.trim();
                if (!v.startsWith('#')) v = '#' + v;
                if (hexToRgb(v)) { this.setValue(v); this.emit(); this.commit(); } else inp.value = this.value;
                return;
            }
            const vals = [...this.inputs.querySelectorAll('input')].map(i => parseFloat(i.value) || 0);
            const rgb = k === 'rgb' ? vals.map(v => clamp(v, 0, 255)) : hslToRgb(clamp(vals[0], 0, 360), clamp(vals[1], 0, 100), clamp(vals[2], 0, 100));
            this.setValue(rgbToHex(...rgb));
            this.emit();
            this.commit();
        }

        fromHsv() {
            this.value = rgbToHex(...hsvToRgb(...this.hsv));
            this.paint(true);
            this.emit();
        }

        setValue(hex, silent) {
            const rgb = hexToRgb(hex);
            if (!rgb) return;
            this.value = rgbToHex(...rgb);
            const hsv = rgbToHsv(...rgb);
            if (hsv[1] === 0 || hsv[2] === 0) hsv[0] = this.hsv[0]; // gri tonlarda tonu koru
            this.hsv = hsv;
            this.paint(false);
            if (!silent) this.renderRecent();
        }

        paint(fromDrag) {
            const [h, s, v] = this.hsv;
            this.sv.style.setProperty('--hue', `hsl(${h}, 100%, 50%)`);
            this.svKnob.style.left = (s * 100) + '%';
            this.svKnob.style.top = ((1 - v) * 100) + '%';
            this.svKnob.style.background = this.value;
            this.hueKnob.style.left = (h / 359.9 * 100) + '%';
            this.hueKnob.style.background = `hsl(${h}, 100%, 50%)`;
            this.cur.querySelector('i').style.background = this.value;
            this.cur.querySelector('span').textContent = this.value;
            if (fromDrag && this.mode === 'hex') {
                const inp = this.inputs.querySelector('input');
                if (inp && document.activeElement !== inp) { inp.value = this.value; return; }
            }
            this.renderInputs();
        }

        emit() { if (this.opts.onInput) this.opts.onInput(this.value); }

        commit() {
            const list = loadRecent().filter(c => c !== this.value);
            list.unshift(this.value);
            saveRecent(list);
            this.renderRecent();
            if (this.opts.onCommit) this.opts.onCommit(this.value);
        }
    }

    window.ColorPicker = ColorPicker;
    window.VDColor = { hexToRgb, rgbToHex };
})();
