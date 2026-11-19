const DEFAULTS = { enabled: true, keywords: [], mode: 'blur', wholeWord: false };

const $enabled = document.getElementById('enabled');
const $keywords = document.getElementById('keywords');
const $wholeWord = document.getElementById('wholeWord');
const $modes = [...document.querySelectorAll('input[name="mode"]')];

function save() {
  chrome.storage.local.set({
    enabled: $enabled.checked,
    keywords: $keywords.value.split('\n').map((k) => k.trim()).filter(Boolean),
    mode: $modes.find((m) => m.checked)?.value || 'blur',
    wholeWord: $wholeWord.checked,
  });
}

let timer;
function saveSoon() {
  clearTimeout(timer);
  timer = setTimeout(save, 300);
}

chrome.storage.local.get(DEFAULTS).then((s) => {
  $enabled.checked = s.enabled;
  $keywords.value = s.keywords.join('\n');
  $wholeWord.checked = s.wholeWord;
  $modes.forEach((m) => { m.checked = m.value === s.mode; });

  $keywords.addEventListener('input', saveSoon);
  [$enabled, $wholeWord, ...$modes].forEach((el) => el.addEventListener('change', save));
});

// Flush a pending debounce if the popup closes mid-typing.
window.addEventListener('pagehide', () => {
  if (timer) { clearTimeout(timer); save(); }
});
