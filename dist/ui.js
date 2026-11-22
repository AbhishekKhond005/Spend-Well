const paths = {
  theme:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  swap: '<path d="M3 7h16m-4-4 4 4-4 4M21 17H5m4 4-4-4 4-4"/>',
  budget:
    '<path d="M12 3v9h9A9 9 0 1 1 9 3.5"/><path d="M15 2.6a8 8 0 0 1 6.4 6.4H15z"/>',
  people:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m2-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5"/>',
  home: '<path d="m3 10 9-7 9 7M5 9v11h14V9m-9 11v-6h4v6"/>',
  chevs: '<path d="m8 9 4-4 4 4m-8 6 4 4 4-4"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  diag: '<path d="M6 18 18 6M6 6h12v12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  wallet:
    '<path d="M19 7V5a2 2 0 0 0-2-2L5 6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5"/><path d="M21 12h-6v5h6"/>',
  income: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  balance:
    '<rect x="3" y="6" width="18" height="13" rx="2"/><circle cx="12" cy="12.5" r="3"/><path d="M6 10h1m10 5h1"/>',
  trend: '<path d="m3 17 6-6 4 4 8-9m-6 0h6v6"/>',
  fall: '<path d="m3 6 6 6 4-4 8 9m-6 0h6v-6"/>',
  bag: '<path d="M5 8h14l1 13H4zM9 9V6a3 3 0 0 1 6 0v3"/>',
  cart: '<path d="M2 4h3l2 12h12l2-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
  dining: '<path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18m12 0V3c-4 2-4 7-4 10h4"/>',
  car: '<path d="m4 10 3-6h10l3 6M3 17v-6l2-1h14l2 1v6zm2 0v3m14-3v3M6 13h2m8 0h2"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  other:
    '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  work: '<rect x="2" y="7" width="20" height="14" rx="3"/><path d="M8 7V4h8v3M2 12a28 28 0 0 0 20 0m-10 0v3"/>',
  coffee:
    '<path d="M4 8h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zm12 1h2a3 3 0 0 1 0 6h-2M7 3v2m5-2v2"/>',
  cloud: '<path d="M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5.5 5.5 0 0 1 .5 11z"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 4 2 2-1 3 3 3 3-1 2 3 4-1 1-3 3-1 1-4-2-2 1-3-4-3-3 1z"/><circle cx="12" cy="12" r="3"/>',
  bell: '<path d="M4 17c2 0 2-3 2-7a6 6 0 0 1 12 0c0 4 0 7 2 7zm6 3a3 3 0 0 0 4 0"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  search: '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/>',
  filter: '<path d="M3 6h18M6 12h12m-9 6h6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  edit: '<path d="m4 16 11-12 4 4L8 20l-5 1zm9-9 4 4"/>',
  trash: '<path d="M3 6h18m-16 0 1 15h12l1-15m-10 0V3h6v3M10 9v9m4-9v9"/>',
  check: '<path d="m4 12 5 5 11-11"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  target:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  shield:
    '<path d="m12 2 8 4v6c0 5-4 8-8 10-4-2-8-5-8-10V6z"/><path d="m8 12 3 3 5-6"/>',
  layers: '<path d="m3 8 9-5 9 5-9 5zm0 5 9 5 9-5m-18 5 9 5 9-5"/>',
  sync: '<path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 14-2l1 4M4 14l1 4a8 8 0 0 0 14-2"/>',
};
export const icon = (name, size = 20) =>
  '<svg aria-hidden="true" width="' +
  size +
  '" height="' +
  size +
  '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  (paths[name] || paths.other) +
  "</svg>";

export function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
