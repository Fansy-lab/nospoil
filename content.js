(() => {
  'use strict';

  const ATTR = 'data-nospoil';
  const BLOCKED_SEL = `[${ATTR}]`;
  const TEXT_ATTRS = ['alt', 'title', 'aria-label'];
  const TEXT_ATTRS_SEL = TEXT_ATTRS.map((a) => `[${a}]`).join(',');
  // Never scan these: not visible text, or text the user is typing.
  const SKIP_SEL = 'script,style,noscript,template,title,textarea,input,select';
  // When a match sits inside one of these, block the whole thing (thumbnail included).
  const CARD_SEL = [
    'article', 'li', 'tr',
    '[role="article"]', '[role="listitem"]', '[role="row"]',
    'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer',
    'yt-lockup-view-model', 'shreddit-post',
  ].join(',');
  const CARD_MAX_TEXT = 1500; // don't swallow huge containers that happen to be an <li>/<article>

  // Keep in sync with content.css
  const SHADOW_CSS = `
    [${ATTR}="hide"] { display: none !important; }
    [${ATTR}="blur"] { filter: blur(16px) grayscale(1) !important; cursor: pointer !important; user-select: none !important; }
    [${ATTR}="blur"] * { pointer-events: none !important; }
  `;

  const DEFAULTS = { enabled: true, keywords: [], mode: 'blur', wholeWord: false };
  const OBSERVE_OPTS = {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: TEXT_ATTRS,
  };

  let settings = { ...DEFAULTS };
  let re = null;
  const shadowRoots = new Set();
  const observer = new MutationObserver(onMutations);

  // ---------- matching ----------

  function buildRegex() {
    const words = (settings.keywords || []).map((k) => k.trim()).filter(Boolean);
    if (!settings.enabled || !words.length) return null;
    const alts = words
      .sort((a, b) => b.length - a.length)
      .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
      .join('|');
    const body = settings.wholeWord
      ? `(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`
      : alts;
    return new RegExp(body, 'iu');
  }

  function matchesDeep(el) {
    if (re.test(el.textContent)) return true;
    const candidates = [el, ...el.querySelectorAll(TEXT_ATTRS_SEL)];
    return candidates.some((c) => TEXT_ATTRS.some((a) => c.hasAttribute(a) && re.test(c.getAttribute(a))));
  }

  // ---------- DOM helpers ----------

  function isSkipped(el) {
    return el.isContentEditable || !!el.closest(SKIP_SEL);
  }

  // closest() that also walks out of shadow roots
  function closestBlocked(el) {
    while (el) {
      const hit = el.closest(BLOCKED_SEL);
      if (hit) return hit;
      const root = el.getRootNode();
      el = root instanceof ShadowRoot ? root.host : null;
    }
    return null;
  }

  function isInline(el) {
    const d = getComputedStyle(el).display;
    return d === 'inline' || d === 'contents';
  }

  function isPageRoot(el) {
    return el === document.body || el === document.documentElement;
  }

  // Decide which element to block for a match found in `el`.
  function pickTarget(el) {
    let t = el;
    while (t.parentElement && !isPageRoot(t.parentElement) && isInline(t)) t = t.parentElement;
    t = t.closest('a') || t;
    const card = t.closest(CARD_SEL);
    if (card && !isPageRoot(card) && card.textContent.length <= CARD_MAX_TEXT) t = card;
    return isPageRoot(t) ? null : t;
  }

  function block(el) {
    if (!el || el.hasAttribute(ATTR)) return;
    el.setAttribute(ATTR, settings.mode === 'hide' ? 'hide' : 'blur');
  }

  // ---------- scanning ----------

  function checkText(node) {
    const text = node.nodeValue;
    if (!text || !re.test(text)) return;
    const parent = node.parentNode;
    if (!parent) return;
    let el;
    if (parent instanceof ShadowRoot) {
      el = parent.host;
    } else if (parent.nodeType !== 1) {
      return;
    } else if (isPageRoot(parent)) {
      // Bare text directly in <body>: wrap it so there is something to block.
      el = document.createElement('span');
      node.replaceWith(el);
      el.append(node);
      block(el);
      return;
    } else {
      el = parent;
    }
    if (closestBlocked(el)) return;
    block(pickTarget(el));
  }

  function checkElement(el) {
    if (el.shadowRoot) watchShadow(el.shadowRoot);
    for (const a of TEXT_ATTRS) {
      if (el.hasAttribute(a) && re.test(el.getAttribute(a))) {
        if (!closestBlocked(el)) block(pickTarget(el));
        return;
      }
    }
  }

  function scan(root) {
    if (!re) return;
    const type = root.nodeType;
    if (type === 3) return checkText(root);
    if (type !== 1 && type !== 9 && type !== 11) return;
    if (type === 1) {
      if (root.matches(SKIP_SEL) || root.isContentEditable || root.hasAttribute(ATTR)) return;
      checkElement(root);
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1 && (n.matches(SKIP_SEL) || n.isContentEditable || n.hasAttribute(ATTR))) {
          return NodeFilter.FILTER_REJECT; // skip whole subtree
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === 3) checkText(n);
      else checkElement(n);
    }
  }

  function watchShadow(root) {
    if (!shadowRoots.has(root)) {
      shadowRoots.add(root);
      const style = document.createElement('style');
      style.textContent = SHADOW_CSS;
      root.append(style);
      observer.observe(root, OBSERVE_OPTS);
    }
    scan(root);
  }

  function onMutations(mutations) {
    if (!re) return;
    const recheck = new Set();
    for (const m of mutations) {
      const t = m.target;
      const host = t.nodeType === 1 ? t : t.parentElement || t.host || null;
      if (host) {
        // Changes inside an already-blocked element: verify it still deserves it
        // (sites with virtualised lists recycle DOM nodes for new content).
        const blocked = closestBlocked(host);
        if (blocked) {
          recheck.add(blocked);
          continue;
        }
        if (isSkipped(host)) continue;
      }
      if (m.type === 'childList') m.addedNodes.forEach(scan);
      else if (m.type === 'characterData') checkText(t);
      else checkElement(t);
    }
    for (const el of recheck) {
      if (!el.isConnected || matchesDeep(el)) continue;
      el.removeAttribute(ATTR);
      scan(el);
    }
  }

  // ---------- click to reveal (blur mode) ----------

  // The confirm prompt is drawn over the blocked element's rectangle. It lives in
  // its own closed shadow root on <html> (it can't be a child of the blocked
  // element, or it would be blurred too) and follows the element on scroll/resize.
  const PROMPT_CSS = `
    .box { box-sizing: border-box; display: flex; flex-wrap: wrap; align-content: center;
           align-items: center; justify-content: center; gap: 8px; padding: 8px 12px;
           background: rgba(20, 20, 24, .88); color: #fff; border-radius: 8px;
           font: 13px/1.3 system-ui, sans-serif; text-align: center; user-select: none;
           box-shadow: 0 2px 10px rgba(0, 0, 0, .35); }
    .box > span { white-space: nowrap; }
    .btns { display: flex; gap: 6px; }
    button { white-space: nowrap; font: inherit; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,.5);
             background: transparent; color: #fff; cursor: pointer; }
    button.yes { background: #fff; color: #111; border-color: #fff; }
    button:hover { opacity: .85; }
  `;
  let prompt = null; // { host, target }
  let placeQueued = false;

  function placePrompt() {
    placeQueued = false;
    if (!prompt) return;
    const { host, target } = prompt;
    if (!target.isConnected || target.getAttribute(ATTR) !== 'blur') return closePrompt();
    const r = target.getBoundingClientRect();
    // Cover the visible part of the element. The panel is at least that big but
    // grows to fit its own content, so on small elements it overflows their
    // edges (centred) instead of clipping the buttons.
    const left = Math.max(r.left, 0);
    const top = Math.max(r.top, 0);
    const right = Math.min(r.right, window.innerWidth);
    const bottom = Math.min(r.bottom, window.innerHeight);
    if (right <= left || bottom <= top) return closePrompt(); // scrolled out of view
    host.style.minWidth = `${right - left}px`;
    host.style.minHeight = `${bottom - top}px`;
    const w = host.offsetWidth;
    const h = host.offsetHeight;
    const clamp = (v, size, max) => Math.max(Math.min(v, max - size), 0); // keep on screen
    const x = clamp((left + right) / 2 - w / 2, w, window.innerWidth);
    const y = clamp((top + bottom) / 2 - h / 2, h, window.innerHeight);
    host.style.transform = `translate(${x}px, ${y}px)`;
  }

  function queuePlace() {
    if (placeQueued) return;
    placeQueued = true;
    requestAnimationFrame(placePrompt);
  }

  function onPromptKey(e) {
    if (e.key === 'Escape') closePrompt();
  }

  function closePrompt() {
    if (!prompt) return;
    prompt.host.remove();
    prompt = null;
    window.removeEventListener('scroll', queuePlace, true);
    window.removeEventListener('resize', queuePlace, true);
    window.removeEventListener('keydown', onPromptKey, true);
  }

  function openPrompt(target) {
    closePrompt();
    const host = document.createElement('div');
    // Pinned at 0,0 and moved with a transform so its shrink-to-fit width is
    // measured against the whole viewport; grid makes the panel fill min sizes.
    host.style.cssText = 'all: initial; position: fixed; left: 0; top: 0; z-index: 2147483647; '
      + 'display: grid; box-sizing: border-box; max-width: 100vw;';
    const root = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = PROMPT_CSS;
    const box = document.createElement('div');
    box.className = 'box';
    const label = document.createElement('span');
    label.textContent = 'Blocked by NoSpoil. Reveal?';
    const btns = document.createElement('div');
    btns.className = 'btns';
    const yes = document.createElement('button');
    yes.className = 'yes';
    yes.textContent = 'Reveal';
    const no = document.createElement('button');
    no.textContent = 'Keep hidden';
    btns.append(yes, no);
    box.append(label, btns);
    root.append(style, box);

    yes.addEventListener('click', () => {
      if (target.getAttribute(ATTR) === 'blur') target.setAttribute(ATTR, 'revealed');
      closePrompt();
    });
    no.addEventListener('click', closePrompt);
    // Keep the page from seeing clicks on the prompt.
    host.addEventListener('click', (e) => e.stopPropagation());

    prompt = { host, target };
    document.documentElement.append(host);
    window.addEventListener('scroll', queuePlace, true);
    window.addEventListener('resize', queuePlace, true);
    window.addEventListener('keydown', onPromptKey, true);
    placePrompt();
  }

  function onClick(e) {
    const path = e.composedPath();
    if (prompt && path.includes(prompt.host)) return; // click on the prompt itself
    const hit = path.find((n) => n.nodeType === 1 && n.getAttribute(ATTR) === 'blur');
    if (!hit) return closePrompt(); // clicked elsewhere: dismiss
    e.preventDefault();
    e.stopImmediatePropagation();
    openPrompt(hit);
  }

  // ---------- lifecycle ----------

  function reset() {
    closePrompt();
    for (const root of [document, ...shadowRoots]) {
      root.querySelectorAll(BLOCKED_SEL).forEach((el) => el.removeAttribute(ATTR));
    }
  }

  function apply(stored) {
    settings = { ...DEFAULTS, ...stored };
    re = buildRegex();
    reset();
    scan(document);
  }

  window.addEventListener('click', onClick, true);
  observer.observe(document, OBSERVE_OPTS);
  chrome.storage.local.get(DEFAULTS).then(apply);
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') chrome.storage.local.get(DEFAULTS).then(apply);
  });
})();
