/* Çizgi ikonlar (24x24). icon('name') → <svg> metni. */
(function () {
    'use strict';
    const P = {
        cursor: 'M4 4l7.07 17 2.51-7.39L21 11.07z',
        type: 'M4 7V4h16v3M9 20h6M12 4v16',
        square: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
        shapeRect: 'M3 7h18v10H3z',
        layers: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
        surfaces: 'M12 3 3 8l9 5 9-5-9-5zM3 12.5l9 5 9-5',
        image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
        sparkles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9zM5 2l.6 1.4L7 4l-1.4.6L5 6l-.6-1.4L3 4l1.4-.6z',
        sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
        siren: 'M7 18v-6a5 5 0 1 1 10 0v6M5 21a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1zM21 12h1M18.5 4.5 18 5M2 12h1M12 2v1M4.93 4.93l.71.71M12 12v6',
        library: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
        trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
        undo: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5',
        redo: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5',
        x: 'M18 6 6 18M6 6l12 12',
        eye: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
        eyeOff: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22',
        lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4',
        unlock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 9.9-1',
        copy: 'M9 9h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
        up: 'M12 19V5M5 12l7-7 7 7',
        down: 'M12 5v14M19 12l-7 7-7-7',
        chevUp: 'M18 15l-6-6-6 6',
        chevDown: 'M6 9l6 6 6-6',
        search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
        star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
        plus: 'M12 5v14M5 12h14',
        mirror: 'M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4',
        info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
        check: 'M20 6 9 17l-5-5',
        mouse: 'M12 2a7 7 0 0 0-7 7v6a7 7 0 0 0 14 0V9a7 7 0 0 0-7-7zM12 6v4',
        save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
        car: 'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9 17h6',
        grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
        link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
        edit: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z',
        alert: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v4M12 16h.01',
        pipette: 'M2 22l1-1h3l9-9M3 21v-3l9-9M15 6l3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z',
        alignLeft: 'M3 6h18M3 12h12M3 18h15',
        alignCenter: 'M3 6h18M6 12h12M4 18h16',
        alignRight: 'M3 6h18M9 12h12M6 18h15',
        alignJustify: 'M3 6h18M3 12h18M3 18h18',
        wand: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5',
        flipH: 'M12 3v18M16 7l4 5-4 5zM8 7l-4 5 4 5z',
        flipV: 'M3 12h18M7 8l5-4 5 4zM7 16l5 4 5-4z',
        target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
        download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
        upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
        file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
        ratio: 'M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3',
    };
    const FILLED = { star: true };

    window.icon = function (name, cls) {
        const d = P[name];
        if (!d) return '';
        const fill = FILLED[name] && cls && cls.includes('on') ? 'currentColor' : 'none';
        return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
    };

    window.CROWN_SVG = `<svg class="crown" viewBox="0 0 120 80" aria-hidden="true">
        <defs><linearGradient id="crownGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:.45"/>
        </linearGradient></defs>
        <path d="M12 64 L21 27 L43 46 L60 13 L77 46 L99 27 L108 64 Z" fill="url(#crownGrad)" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round"/>
        <path d="M13 64h94v9a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2z" fill="var(--accent)"/>
        <circle cx="21" cy="22" r="4.4" fill="var(--accent)"/><circle cx="60" cy="8" r="4.4" fill="var(--accent)"/><circle cx="99" cy="22" r="4.4" fill="var(--accent)"/>
    </svg>`;
})();
