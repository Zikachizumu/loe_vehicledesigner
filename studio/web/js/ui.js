/* Küçük arayüz yapı taşları (DOM üreticileri). */
(function () {
    'use strict';
    const VS = window.VS;
    const { esc } = VS;

    function h(tag, attrs, ...kids) {
        const el = document.createElement(tag);
        if (attrs) for (const k in attrs) {
            const v = attrs[k];
            if (v == null || v === false) continue;
            if (k === 'class') el.className = v;
            else if (k === 'html') el.innerHTML = v;
            else if (k === 'text') el.textContent = v;
            else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
            else if (k === 'style' && typeof v === 'object') { for (const sk in v) { if (sk.startsWith('--')) el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk]; } }
            else el.setAttribute(k, v === true ? '' : v);
        }
        for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
        return el;
    }

    // Kaydırıcı: onInput (canlı), onChange (bırakınca)
    function slider(label, min, max, value, opts) {
        opts = opts || {};
        const step = opts.step || 1;
        const num = (v) => (opts.fmt ? opts.fmt(v) : (Math.round(v * 100) / 100) + (opts.unit || ''));
        const inp = h('input', { type: 'range', min, max, step, value });
        const val = h('span', { class: 'v', text: num(+value) });
        const upd = () => { inp.style.setProperty('--p', ((inp.value - min) / (max - min) * 100) + '%'); };
        upd();
        inp.addEventListener('input', () => { upd(); val.textContent = num(+inp.value); if (opts.onInput) opts.onInput(+inp.value); });
        inp.addEventListener('change', () => { if (opts.onChange) opts.onChange(+inp.value); });
        const el = h('div', { class: 'sl' }, label ? h('span', { class: 'nm', text: label }) : null, inp, val);
        el.set = (v) => { inp.value = v; upd(); val.textContent = num(+v); };
        return el;
    }

    // Renk alanı: tıklayınca altında renk seçici açılır
    function colorField(label, value, onInput, onCommit) {
        const wrap = h('div');
        const sw = h('button', { class: 'swatch', type: 'button' }, h('i'), h('span', { text: label }), h('span', { class: 'hex mono' }));
        const pop = h('div', { class: 'pop hidden' });
        let picker = null;
        const set = (hex) => {
            sw.querySelector('i').style.setProperty('--c', hex);
            sw.querySelector('.hex').textContent = hex;
        };
        set(value);
        sw.addEventListener('click', () => {
            const open = pop.classList.toggle('hidden') === false;
            if (open && !picker) {
                picker = new ColorPicker(pop, {
                    value, t: (k) => ({ recent: 'Son kullanılanlar' }[k] || k),
                    onInput: (c) => { set(c); if (onInput) onInput(c); },
                    onCommit: (c) => { if (onCommit) onCommit(c); },
                });
            }
        });
        wrap.append(sw, pop);
        wrap.set = (hex) => { value = hex; set(hex); if (picker) picker.setValue(hex, true); };
        return wrap;
    }

    function seg(items, value, onPick) {
        const el = h('div', { class: 'seg' });
        for (const [k, t] of items) {
            const b = h('button', { type: 'button', 'data-k': k, class: k === value ? 'on' : '', text: t });
            b.addEventListener('click', () => {
                el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
                onPick(k);
            });
            el.append(b);
        }
        return el;
    }

    function select(items, value, onChange) {
        const el = h('select', { class: 'inp' });
        for (const it of items) {
            const [k, t] = Array.isArray(it) ? it : [it, it];
            el.append(h('option', { value: k, text: t, selected: k === value }));
        }
        el.addEventListener('change', () => onChange(el.value));
        return el;
    }

    function card(title, iconName, body, closed) {
        const c = h('div', { class: 'card' + (closed ? ' closed' : '') });
        const hd = h('div', { class: 'card-h' }, iconName ? h('span', { html: icon(iconName), style: { display: 'contents' } }) : null, title, h('span', { class: 'chev', html: icon('chevUp') }));
        hd.addEventListener('click', () => c.classList.toggle('closed'));
        c.append(hd, h('div', { class: 'card-b' }, body));
        return c;
    }

    function lbl(t) { return h('span', { class: 'lbl', text: t }); }

    function swatches(list, current, onPick) {
        const el = h('div', { class: 'colors' });
        for (const c of list) {
            const b = h('button', { type: 'button', style: { '--c': c }, title: c, class: c === current ? 'on' : '' });
            b.addEventListener('click', () => { el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); onPick(c); });
            el.append(b);
        }
        return el;
    }

    VS.ui = { h, slider, colorField, seg, select, card, lbl, swatches };
})();
