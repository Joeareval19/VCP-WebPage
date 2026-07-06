/*
 * Voice feedback widget (issue #43).
 *
 * Session model: every open is a brand-new, independent session — no state
 * persists across opens, no visitor identity. Within a session, prior
 * turns ARE fed back to the conversation engine so follow-up questions can
 * get more specific (the "contextual grinding down" from the spec).
 *
 * Voice IN, text OUT (revised 2026-07-05 — see issue #43's amended spec):
 * the visitor speaks via the browser-native Web Speech API
 * (SpeechRecognition); the assistant's questions/responses render as text
 * in the widget's transcript panel only — no TTS, no audio output of any
 * kind. api/tts.js and the ElevenLabs integration are retired.
 *
 * Conversation logic calls api/next-turn.js (Groq proxy), which keeps its
 * API key server-side and falls back to a local, non-LLM stand-in if the
 * endpoint is unreachable, so the widget degrades gracefully instead of
 * breaking mid-session. The conversation is framed to extract a scope of
 * work (why/what/acceptance-criteria/out-of-scope), not generic
 * likes/dislikes — see api/next-turn.js's system prompt.
 *
 * Durability (revised 2026-07-05, reconciled with issue #60/[70005]): every
 * turn is inserted directly into Supabase's vcp_voice_turns table from the
 * BROWSER, using the same publishable anon key js/telemetry.js already
 * exposes (INSERT-only under RLS — the anon role can never read/change/
 * delete). This replaced an earlier version of this file that had
 * api/next-turn.js upsert the growing transcript server-side via a
 * privileged SUPABASE_SERVICE_ROLE_KEY — a different session independently
 * shipped this simpler client-direct-insert design (one row per utterance,
 * joined by session_id) while that work was in flight, and it's the better
 * approach: no server round-trip or privileged key needed just to persist
 * a turn. api/next-turn.js and api/file-feedback.js no longer touch
 * Supabase at all for turn-level durability — only file-feedback.js's
 * final vcp_voice_sessions write (summary + filed_issue) still needs the
 * service-role key, since that's a genuine cross-row upsert.
 *
 * Positioning, minimize, and cross-page persistence (added 2026-07-05):
 * the widget's screen position is a single {right, bottom} pair (CSS
 * custom properties --widget-x/--widget-y on #vcp-voice-widget) that both
 * the ball and the panel anchor off of — dragging either one moves the
 * same point (see components.css's #vcp-voice-widget comment for why this
 * is one shared anchor, not two independent positions). Minimizing hides
 * the panel WITHOUT ending the session — recognition/mic/history all keep
 * running in the background, so a visitor can shrink the conversation out
 * of the way mid-turn and reopen it later without losing progress; this is
 * deliberately different from endSession(), which does tear all of that
 * down. Position + open/minimized state persist across page navigations
 * via sessionStorage (survives clicking a nav link, clears when the tab
 * closes) — the conversation itself does NOT persist across pages, since
 * a full page load already resets session_id/history by design (each page
 * is its own session, per the spec's session model above); carrying only
 * the chrome state forward means a visitor doesn't have to re-drag or
 * re-open the widget on every single page, without pretending a
 * conversation about one page continues to make sense on another.
 */
(function () {
  "use strict";

  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var supportsVoice = !!SpeechRecognition; // no speechSynthesis dependency — output is text-only

  var OPENING_QUESTION = "Thanks for stopping by. What's one idea, request, or piece of feedback you'd like to turn into a scope of work?";
  var MAX_TURNS = 6; // safety cap so a session can't run forever if "done" detection misses

  // ---- Chrome state persistence (position, open/minimized) -------------
  // sessionStorage, not localStorage: this is meant to survive a page
  // navigation within one visit, not outlive the tab — a returning visitor
  // days later should see the default corner, not wherever they last left
  // it. Wrapped in try/catch: sessionStorage can throw in some
  // privacy-mode/third-party-context configurations, and losing this
  // convenience should never break the widget itself.
  var STORAGE_KEY = "vcp-voice-widget-chrome";

  function loadChromeState() {
    try {
      var raw = window.sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveChromeState(state) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {} // best-effort — see function header comment
  }

  // ---- PII redaction -------------------------------------------------
  // Pattern-based only for this pass (see issue #43 open questions — an
  // LLM-based redaction pass is a follow-up decision, not blocking this
  // build). Emails, phone numbers, and common "my name is X" patterns.
  var PII_PATTERNS = [
    { re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, tag: "[redacted-email]" },
    { re: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, tag: "[redacted-phone]" },
    // Capture the lead-in phrase as $1 so the replacement is a literal
    // template string, not a function call — an earlier version called
    // .replace() at array-definition time against the literal 2-char
    // string "$&" (no match, no-op), so names were never actually redacted.
    // No /i flag: case-insensitivity would let [A-Z] match lowercase words
    // too (e.g. "this is Miguel from Vegas" would swallow "from" into the
    // name), so capitalized lead-in variants are spelled out explicitly
    // instead of relying on case-folding.
    { re: /\b(my name is|My name is|i'?m|I'?m|this is|This is)\s+([A-Z][a-zA-Z'-]+)(?:\s+([A-Z][a-zA-Z'-]+))?/g, tag: "$1 [redacted-name]" },
  ];

  function redact(text) {
    var out = text;
    PII_PATTERNS.forEach(function (p) {
      out = out.replace(p.re, p.tag);
    });
    return out;
  }

  // ---- Conversation engine --------------------------------------------
  // Real path: api/next-turn.js (Groq). Fallback path (used only if that
  // endpoint is unreachable): canned follow-ups via keyword matching
  // against the visitor's last reply, so a backend outage degrades the
  // conversation's specificity rather than breaking the session outright.
  function nextTurnFallback(history) {
    var lastVisitorLine = "";
    for (var i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "visitor") { lastVisitorLine = history[i].text.toLowerCase(); break; }
    }
    var turnCount = history.filter(function (h) { return h.role === "visitor"; }).length;

    if (turnCount === 0) return { done: false, question: OPENING_QUESTION };

    if (/\b(done|nothing else|that'?s it|that'?s all|no more)\b/.test(lastVisitorLine)) {
      return { done: true };
    }
    if (turnCount >= MAX_TURNS) return { done: true };

    if (/\b(nav|navigation|menu)\b/.test(lastVisitorLine)) {
      return { done: false, question: "Got it — who runs into this, and what should happen instead once it's fixed?" };
    }
    if (/\b(slow|loading|lag|performance)\b/.test(lastVisitorLine)) {
      return { done: false, question: "Noted. Is this on a specific page, and what would 'fast enough' look like?" };
    }
    if (/\b(color|colour|dark|silver|design|look)\b/.test(lastVisitorLine)) {
      return { done: false, question: "Interesting — which section, and what would you change about it specifically?" };
    }
    if (turnCount === 1) {
      return { done: false, question: "Got it. What would you consider 'done' here — how would you know this was fixed or built?" };
    }
    return { done: false, question: "Anything that should explicitly stay out of scope for this, or is that everything for now?" };
  }

  // Redaction happens here, client-side, before ANYTHING leaves the browser
  // — both api/next-turn.js (which now persists every turn to Supabase,
  // see api/file-feedback.js) never sees raw visitor text. Structure-
  // preserving (returns the same {role, text} shape) so it can feed either
  // the chat-messages array next-turn needs or be flattened into
  // file-feedback's transcript string.
  function redactedHistory(history) {
    return history.map(function (h) { return { role: h.role, text: redact(h.text) }; });
  }

  function fetchNextTurn(history) {
    if (history.length === 0) {
      return Promise.resolve({ done: false, question: OPENING_QUESTION });
    }
    if (history.filter(function (h) { return h.role === "visitor"; }).length >= MAX_TURNS) {
      return Promise.resolve({ done: true });
    }
    var safeHistory = redactedHistory(history);
    return fetch("/api/next-turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: safeHistory }),
    })
      .then(function (resp) {
        if (!resp.ok) throw new Error("next-turn status " + resp.status);
        return resp.json();
      })
      .catch(function () {
        return nextTurnFallback(history);
      });
  }

  // ---- Ticket filing ---------------------------------------------------
  function redactedTranscript(history) {
    return redactedHistory(history).map(function (h) { return h.role + ": " + h.text; }).join("\n");
  }

  function fileFeedback(history, pageContext, sessionId, durationMs) {
    return fetch("/api/file-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: redactedTranscript(history),
        pageContext: pageContext,
        sessionId: sessionId,
        durationMs: durationMs,
      }),
    })
      .then(function (resp) { return resp.json(); })
      .catch(function (err) { return { filed: false, reason: err.message }; });
  }

  function makeSessionId() {
    // Opaque, not tied to visitor identity — per spec's content model
    // (session_id: "opaque, not tied to visitor identity").
    return "vf-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  // ---- Per-turn durability (vcp_voice_turns, issue #60/[70005]) --------
  // Same Supabase project + publishable anon key js/telemetry.js already
  // uses — INSERT-only under RLS, so this is safe to call unconditionally
  // from the browser. Fire-and-forget: a write failure here must never
  // interrupt the actual conversation (matches telemetry.js's own
  // fail-silent contract). Text is redacted before this is ever called —
  // see addLine below.
  var SUPABASE_URL = "https://qaorlbgrkpldcatyntlw.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_MZQT-cWL_j0X4KNdqx4mDA_MgTqy073";

  function insertVoiceTurn(sessionId, turnIndex, role, text, pageContext) {
    if (!window.fetch) return;
    fetch(SUPABASE_URL + "/rest/v1/vcp_voice_turns", {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        session_id: sessionId,
        turn_index: turnIndex,
        role: role,
        text: text,
        page_context: pageContext,
      }),
    }).catch(function () {}); // fail-silent — see function header comment
  }

  // ---- Liquid ball motion ----------------------------------------------
  // Two modes, both driving the same 3 CSS custom properties (border-radius
  // shape, background-position, scale) so the CSS `transition` on those
  // properties (components.css) is what actually renders the smooth
  // morphing — this class only ever picks *targets*, never animates pixel
  // values itself.
  //
  // Idle: randomized organic morphing, no audio involved. Each cycle picks
  // a new random-ish blob shape and a new random duration (2.2s-4.2s), so
  // it never reads as a fixed repeating loop no matter how long you watch
  // it — the randomization IS the "liquid" quality, not just slowness.
  //
  // Active (listening): a Web Audio AnalyserNode reads real amplitude off
  // the visitor's own mic input and maps loudness directly to how extreme
  // the blob shape/scale gets, sampled every animation frame — this is
  // the literal "liquid shifting on sound input." There is no assistant
  // audio to react to (output is text-only, see issue #43's amended spec)
  // — the "speaking" state keeps idle randomized motion rather than faking
  // audio-reactivity for audio that doesn't exist.
  function LiquidBall(el) {
    this.el = el;
    this.idleTimer = null;
    this.audioCtx = null;
    this.analyser = null;
    this.dataArray = null;
    this.rafId = null;
    this.sourceNode = null;
  }

  LiquidBall.prototype.randomBlob = function () {
    // 4 corner radii + 4 for the second (vertical) axis, each wobbled
    // independently within a band that always still reads as "blob," never
    // a spike or a flat edge.
    function r() { return 38 + Math.floor(Math.random() * 24); } // 38-62%
    return r() + "% " + (100 - r()) + "% " + (100 - r()) + "% " + r() + "% / " +
           r() + "% " + r() + "% " + (100 - r()) + "% " + (100 - r()) + "%";
  };

  LiquidBall.prototype.startIdle = function () {
    this.stopAudioReactive();
    if (this.idleTimer) return; // already running
    // Respect the OS/browser-level motion preference at the JS level too —
    // the CSS !important override already suppresses the visual effect,
    // but running an indefinite setTimeout loop purely to compute values
    // nobody will see is wasted work and the wrong semantics for "reduce
    // motion" (it should mean less happening, not just less visible).
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var self = this;
    function cycle() {
      var duration = 2200 + Math.random() * 2000; // 2.2s-4.2s, different every time
      self.el.style.setProperty("--liquid-dur", duration + "ms");
      self.el.style.setProperty("--liquid-radius", self.randomBlob());
      self.el.style.setProperty("--liquid-bg-pos", Math.floor(Math.random() * 100) + "% " + Math.floor(Math.random() * 100) + "%");
      self.el.style.setProperty("--liquid-scale", (0.97 + Math.random() * 0.06).toFixed(3));
      self.idleTimer = setTimeout(cycle, duration);
    }
    cycle();
  };

  LiquidBall.prototype.stopIdle = function () {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
  };

  // source: an HTMLMediaElement (TTS playback) or a MediaStream (mic input).
  LiquidBall.prototype.startAudioReactive = function (source) {
    this.stopIdle();
    this.stopAudioReactive(); // tear down any previous session's nodes first

    // A visitor asking for reduced motion doesn't stop meaning that once
    // audio starts — the shape-warping is still decorative motion, just
    // driven by a different input. Skip the whole Web Audio graph.
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) { this.startIdle(); return; } // no Web Audio support — degrade to idle motion

    try {
      this.audioCtx = new AudioContextCtor();
      this.sourceNode = source instanceof MediaStream
        ? this.audioCtx.createMediaStreamSource(source)
        : this.audioCtx.createMediaElementSource(source);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.75; // smooths frame-to-frame jitter without lagging the actual voice
      this.sourceNode.connect(this.analyser);
      // MediaElementSource redirects the element's output through the Web
      // Audio graph — reconnect to actual speakers or TTS playback goes silent.
      if (!(source instanceof MediaStream)) this.analyser.connect(this.audioCtx.destination);
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    } catch (e) {
      this.startIdle(); // Web Audio setup can fail (e.g. already-connected source) — never let that break the widget
      return;
    }

    // Drift target, resampled only every DRIFT_HOLD_MS (not every frame) so
    // the ball settles briefly at each spot before tumbling to the next —
    // "clear motions and shifts," not a nervous jitter. transform's own
    // 120ms transition (components.css) smooths the trip between spots.
    var DRIFT_HOLD_MS = 260;
    var DRIFT_RADIUS_PX = 10; // how far it can wander from center at max loudness
    var lastDriftAt = 0;

    var self = this;
    function tick(now) {
      self.analyser.getByteFrequencyData(self.dataArray);
      var sum = 0;
      for (var i = 0; i < self.dataArray.length; i++) sum += self.dataArray[i];
      var level = sum / self.dataArray.length / 255; // 0..1 average loudness this frame

      // Louder -> larger scale + more extreme blob distortion; quiet moments
      // relax back toward a gentler shape, so the ball visibly "breathes"
      // with the actual audio rather than pulsing on a fixed timer.
      self.el.style.setProperty("--liquid-dur", "90ms"); // near-instant response to each frame's level
      self.el.style.setProperty("--liquid-scale", (1 + level * 0.22).toFixed(3));
      var spread = 30 + level * 40; // more level = more extreme corner variance
      function r() { return Math.max(20, Math.min(80, 50 + (Math.random() * 2 - 1) * spread)); }
      self.el.style.setProperty("--liquid-radius",
        Math.round(r()) + "% " + Math.round(100 - r()) + "% " + Math.round(100 - r()) + "% " + Math.round(r()) + "% / " +
        Math.round(r()) + "% " + Math.round(r()) + "% " + Math.round(100 - r()) + "% " + Math.round(100 - r()) + "%");

      // Positional drift — "liquid shifting in outer space": the ball
      // tumbles a few px off-center, further when louder, drifting back
      // toward center as the visitor quiets down. This is layered on top
      // of the caller's own drag position (--widget-x/--widget-y), never
      // replacing it — see components.css's translate()+scale() comment.
      if (now - lastDriftAt > DRIFT_HOLD_MS) {
        lastDriftAt = now;
        var angle = Math.random() * Math.PI * 2;
        var radius = level * DRIFT_RADIUS_PX;
        self.el.style.setProperty("--liquid-x", (Math.cos(angle) * radius).toFixed(1) + "px");
        self.el.style.setProperty("--liquid-y", (Math.sin(angle) * radius).toFixed(1) + "px");
      }

      self.rafId = requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };

  LiquidBall.prototype.stopAudioReactive = function () {
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    if (this.sourceNode) { try { this.sourceNode.disconnect(); } catch (e) {} this.sourceNode = null; }
    if (this.analyser) { try { this.analyser.disconnect(); } catch (e) {} this.analyser = null; }
    if (this.audioCtx) { try { this.audioCtx.close(); } catch (e) {} this.audioCtx = null; }
    this.dataArray = null;
    // Recenter the voice-driven drift — without this the ball could stay
    // visibly offset from its actual drag position after the visitor
    // stops talking, since --liquid-x/y otherwise just hold their last value.
    this.el.style.setProperty("--liquid-x", "0px");
    this.el.style.setProperty("--liquid-y", "0px");
  };

  LiquidBall.prototype.destroy = function () {
    this.stopIdle();
    this.stopAudioReactive();
  };

  // ---- Widget state machine -------------------------------------------
  function VoiceWidget(root) {
    this.root = root;
    this.trigger = root.querySelector(".vcp-voice-trigger");
    this.resetBtn = root.querySelector(".vcp-voice-reset");
    this.panel = root.querySelector(".vcp-voice-panel");
    this.panelHeader = root.querySelector(".vcp-voice-panel__header");
    this.body = root.querySelector(".vcp-voice-panel__body");
    this.statusState = root.querySelector(".vcp-voice-status__state");
    this.closeBtn = root.querySelector(".vcp-voice-panel__close");
    this.minimizeBtn = root.querySelector(".vcp-voice-panel__minimize");
    this.open = false;
    this.minimized = false;
    this.history = []; // reset every session — no cross-session memory
    this.recognition = null;
    this.finishTimer = null;
    this.liquid = new LiquidBall(this.trigger);
    this.liquid.startIdle(); // motion runs at all times, session open or not

    this.initPosition();
    this.initDrag(this.trigger);
    this.initDrag(this.panelHeader);

    // Click, not the drag gesture, opens/closes — see initDrag's own
    // comment for how a real drag suppresses the click that would
    // otherwise fire on pointerup.
    this.trigger.addEventListener("click", this.toggle.bind(this));
    this.closeBtn.addEventListener("click", this.endSession.bind(this));
    this.minimizeBtn.addEventListener("click", this.toggleMinimize.bind(this));
    this.resetBtn.addEventListener("click", this.resetPosition.bind(this));

    // Restore whatever open/minimized state the visitor left this page in
    // (see the file header comment on cross-page persistence) — a fresh
    // conversation still starts either way, since history/session_id are
    // never carried across a page load.
    var savedState = loadChromeState();
    if (savedState.open) {
      this.startSession();
      if (savedState.minimized) this.setMinimized(true);
    }
  }

  VoiceWidget.prototype.toggle = function () {
    if (this.open) { this.endSession(); } else { this.startSession(); }
  };

  // ---- Position: single shared anchor for ball + panel ------------------
  // { right: null, bottom: null } means "use components.css's default
  // --space-5 corner" — there's no separate default-position constant
  // because null already IS the default, both here and in applyPosition.
  VoiceWidget.prototype.initPosition = function () {
    var saved = loadChromeState().position;
    this.position = saved || { right: null, bottom: null };
    this.applyPosition();
  };

  VoiceWidget.prototype.applyPosition = function () {
    if (this.position.right == null || this.position.bottom == null) {
      this.root.style.removeProperty("--widget-x");
      this.root.style.removeProperty("--widget-y");
      this.root.removeAttribute("data-repositioned");
    } else {
      this.root.style.setProperty("--widget-x", this.position.right + "px");
      this.root.style.setProperty("--widget-y", this.position.bottom + "px");
      this.root.setAttribute("data-repositioned", "true"); // reveals the hover reset control — see components.css
    }
  };

  VoiceWidget.prototype.resetPosition = function () {
    this.position = { right: null, bottom: null };
    this.applyPosition();
    this.persistChromeState();
  };

  VoiceWidget.prototype.persistChromeState = function () {
    saveChromeState({
      open: this.open,
      minimized: this.minimized,
      position: (this.position.right == null) ? null : this.position,
    });
  };

  // A single pointer-drag implementation shared by the ball and the panel
  // header — both move the SAME this.position (see components.css's
  // #vcp-voice-widget comment for why there's one shared anchor, not two).
  // Distinguishes a real drag from a click by distance moved: a drag under
  // ~4px is almost certainly an imprecise click, not an intentional
  // reposition, and letting the trigger's click handler fire normally in
  // that case keeps "click the ball to open it" working exactly as before.
  var DRAG_THRESHOLD_PX = 4;

  VoiceWidget.prototype.initDrag = function (handleEl) {
    var self = this;
    var startX, startY, startRight, startBottom, dragged, pointerId;

    function onPointerMove(e) {
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (!dragged && (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)) {
        dragged = true;
      }
      if (!dragged) return;
      // right/bottom are measured from the viewport's right/bottom edges,
      // matching the CSS custom properties they feed — moving the pointer
      // right/down means SHRINKING the distance from those edges.
      self.position = {
        right: Math.max(0, startRight - dx),
        bottom: Math.max(0, startBottom - dy),
      };
      self.applyPosition();
    }

    function onPointerUp(e) {
      handleEl.releasePointerCapture(pointerId);
      handleEl.removeEventListener("pointermove", onPointerMove);
      handleEl.removeEventListener("pointerup", onPointerUp);
      if (dragged) {
        // Suppress the click that a browser fires after pointerup even
        // after a real drag — without this, dragging the ball would also
        // toggle the panel open/closed as an unwanted side effect.
        var suppressClick = function (ce) { ce.stopPropagation(); ce.preventDefault(); handleEl.removeEventListener("click", suppressClick, true); };
        handleEl.addEventListener("click", suppressClick, true);
        self.persistChromeState();
      }
    }

    handleEl.addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return; // left click / primary touch only
      // The panel header contains the minimize/close buttons — a pointerdown
      // that starts on one of THOSE should never arm the drag at all, or
      // setPointerCapture on the header could interfere with the button's
      // own click in some browsers even though the distance stays under
      // DRAG_THRESHOLD_PX. (Not a concern for the trigger ball itself,
      // which has no interactive children.)
      if (e.target.closest && e.target.closest("button") && e.target.closest("button") !== handleEl) return;
      startX = e.clientX;
      startY = e.clientY;
      var rect = self.root.getBoundingClientRect();
      startRight = window.innerWidth - rect.right;
      startBottom = window.innerHeight - rect.bottom;
      dragged = false;
      pointerId = e.pointerId;
      handleEl.setPointerCapture(pointerId);
      handleEl.addEventListener("pointermove", onPointerMove);
      handleEl.addEventListener("pointerup", onPointerUp);
    });
  };

  // ---- Minimize: hide the panel, keep the session alive -----------------
  // Deliberately NOT endSession() — recognition/mic/history/Supabase turn
  // inserts all keep running exactly as before. This is a visibility
  // toggle on the panel only, so a visitor can tuck the conversation out
  // of the way mid-turn (e.g. to read something else on the page) and
  // come back to find it exactly where they left it.
  VoiceWidget.prototype.toggleMinimize = function () {
    this.setMinimized(!this.minimized);
  };

  VoiceWidget.prototype.setMinimized = function (minimized) {
    this.minimized = minimized;
    if (minimized) {
      this.panel.setAttribute("data-minimized", "true");
      this.trigger.setAttribute("data-minimized", "true");
    } else {
      this.panel.removeAttribute("data-minimized");
      this.trigger.removeAttribute("data-minimized");
    }
    this.persistChromeState();
  };

  VoiceWidget.prototype.startSession = function () {
    if (this.finishTimer) { clearTimeout(this.finishTimer); this.finishTimer = null; }
    this.open = true;
    this.minimized = false;
    this.history = [];
    this.sessionId = makeSessionId(); // fresh per open — no cross-session identity, per spec
    this.startedAt = Date.now();
    this.trigger.setAttribute("data-open", "true");
    this.trigger.removeAttribute("data-minimized");
    this.panel.setAttribute("data-open", "true");
    this.panel.removeAttribute("data-minimized");
    this.renderConsent();
    this.persistChromeState();
  };

  VoiceWidget.prototype.endSession = function () {
    if (this.finishTimer) { clearTimeout(this.finishTimer); this.finishTimer = null; }
    if (this.recognition) { try { this.recognition.abort(); } catch (e) {} }
    this.stopMicVisualizer();
    this.liquid.startIdle(); // resume ambient motion — the ball keeps living outside a session too

    // Only file when the visitor actually said something — a session where
    // only the opening question was ever spoken has no scope of work to extract.
    var hasVisitorReply = this.history.some(function (h) { return h.role === "visitor"; });
    if (hasVisitorReply) {
      var durationMs = this.startedAt ? Date.now() - this.startedAt : null;
      fileFeedback(this.history, window.location.pathname, this.sessionId, durationMs).then(function (result) {
        if (result.filed) {
          // eslint-disable-next-line no-console
          console.log("[voice-widget] filed as " + result.issueUrl);
          if (result.boardWarning) {
            // eslint-disable-next-line no-console
            console.warn("[voice-widget] " + result.boardWarning);
          }
        } else {
          // eslint-disable-next-line no-console
          console.log("[voice-widget] not filed:", result.reason || result.error || "unknown");
        }
      });
    }

    this.open = false;
    this.minimized = false;
    this.history = [];
    this.trigger.removeAttribute("data-open");
    this.trigger.removeAttribute("data-state");
    this.trigger.removeAttribute("data-minimized");
    this.panel.removeAttribute("data-open");
    this.panel.removeAttribute("data-minimized");
    this.body.innerHTML = "";
    this.persistChromeState(); // clears the saved open/minimized flags — a genuinely ended session shouldn't reopen on the next page
  };

  VoiceWidget.prototype.renderConsent = function () {
    this.body.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "vcp-voice-consent";

    var notice = document.createElement("p");
    notice.className = "vcp-voice-consent__notice";
    notice.textContent = "This conversation is transcribed to help improve the site and may inform a public GitHub ticket. Don't share personal info you don't want recorded.";
    wrap.appendChild(notice);

    var startBtn = document.createElement("button");
    startBtn.type = "button";
    startBtn.className = "vcp-btn vcp-btn--silver vcp-btn--sm";
    startBtn.textContent = supportsVoice ? "Start" : "Voice not supported in this browser";
    startBtn.disabled = !supportsVoice;
    startBtn.addEventListener("click", this.arm.bind(this));
    wrap.appendChild(startBtn);

    this.body.appendChild(wrap);
  };

  VoiceWidget.prototype.arm = function () {
    this.body.innerHTML = "";
    var self = this;
    fetchNextTurn(this.history).then(function (turn) {
      self.askQuestion(turn.question);
    });
  };

  VoiceWidget.prototype.addLine = function (role, text) {
    this.history.push({ role: role, text: text });
    var line = document.createElement("div");
    line.className = "vcp-voice-line vcp-voice-line--" + role;
    line.textContent = text; // visitor sees their own real words, unredacted — redaction is a storage/filing concern, not a display one
    this.body.appendChild(line);
    this.body.scrollTop = this.body.scrollHeight;

    // Durable per-turn write — redacted before it ever leaves the browser,
    // same contract as the eventual vcp_voice_sessions/file-feedback write.
    insertVoiceTurn(this.sessionId, this.history.length - 1, role, redact(text), window.location.pathname);
  };

  VoiceWidget.prototype.setState = function (state) {
    this.trigger.setAttribute("data-state", state);
    if (this.statusState) this.statusState.textContent = state;
  };

  // Text-only output: the assistant's question renders in the transcript
  // panel, the ball keeps its idle randomized motion (no audio to react
  // to — see issue #43's amended spec, output is voice-in/text-out with
  // no TTS of any kind), and the mic re-arms almost immediately. The
  // brief pause is just enough for a visitor to actually read the
  // question before the mic comes back — see READ_PAUSE_MS below.
  var READ_PAUSE_MS = 900;

  VoiceWidget.prototype.askQuestion = function (question) {
    this.addLine("assistant", question);
    this.setState("speaking"); // kept as a distinct state for the status label, even with no audio
    this.liquid.startIdle();
    var self = this;
    setTimeout(function () {
      if (!self.open) return; // session closed during the pause
      self.listen();
    }, READ_PAUSE_MS);
  };

  VoiceWidget.prototype.listen = function () {
    if (!this.open) return;
    this.setState("listening");

    var recognition = new SpeechRecognition();
    this.recognition = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // Web Speech API's SpeechRecognition doesn't expose the raw mic stream
    // it's transcribing from, so a second, independent getUserMedia() call
    // is what actually feeds the liquid ball while listening. This is a
    // real, honest limitation, not a shortcut: the browser prompts for mic
    // permission once (both APIs share the same permission grant), but
    // recognition.start() and this stream are technically two separate
    // consumers of the microphone hardware.
    var self = this;
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        self.micStream = stream;
        self.liquid.startAudioReactive(stream);
      }).catch(function () {
        self.liquid.startIdle(); // mic access denied for the visualizer specifically — recognition may still work
      });
    }

    recognition.onresult = function (event) {
      self.stopMicVisualizer();
      var transcript = event.results[0][0].transcript;
      self.addLine("visitor", transcript);
      self.setState("thinking");
      self.liquid.startIdle(); // brief "thinking" gap between mic close and the next question rendering

      fetchNextTurn(self.history).then(function (turn) {
        if (!self.open) return; // session was closed while the request was in flight
        if (turn.done) {
          self.finishSession();
        } else {
          self.askQuestion(turn.question);
        }
      });
    };
    recognition.onerror = function (event) {
      self.stopMicVisualizer();
      self.setState("idle");
      // "no-speech"/"aborted" are transient (visitor paused, or we aborted
      // it ourselves on close) — just re-listen. Permission-related errors
      // need an explicit retry affordance instead of silently re-arming
      // the mic, since the browser won't re-prompt automatically and a
      // silent retry would just error again in a loop.
      if (event.error === "no-speech" || event.error === "aborted") {
        self.listen();
      } else {
        self.liquid.startIdle();
        self.renderMicError(event.error);
      }
    };
    recognition.onend = function () {
      if (self.trigger.getAttribute("data-state") === "listening") self.setState("idle");
    };
    recognition.start();
  };

  // Releases the getUserMedia() stream opened purely for the ball's
  // visualizer — recognition.start()'s own internal mic usage is separate
  // and stops itself via recognition.abort()/onend. Without this, the
  // browser's mic-in-use indicator would stay lit after the visitor
  // finishes speaking, which is both wrong and a real privacy signal.
  VoiceWidget.prototype.stopMicVisualizer = function () {
    if (this.micStream) {
      this.micStream.getTracks().forEach(function (t) { t.stop(); });
      this.micStream = null;
    }
  };

  VoiceWidget.prototype.renderMicError = function (errorCode) {
    var wrap = document.createElement("div");
    wrap.className = "vcp-voice-consent"; // reuse the consent layout — notice + single action button
    var notice = document.createElement("p");
    notice.className = "vcp-voice-consent__notice";
    notice.textContent = errorCode === "not-allowed" || errorCode === "service-not-allowed"
      ? "Microphone access was blocked. Allow microphone access for this site, then try again."
      : "Didn't catch that. Want to try again?";
    wrap.appendChild(notice);

    var retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "vcp-btn vcp-btn--silver vcp-btn--sm";
    retryBtn.textContent = "Try again";
    var self = this;
    retryBtn.addEventListener("click", function () { self.listen(); });
    wrap.appendChild(retryBtn);

    this.body.appendChild(wrap);
  };

  VoiceWidget.prototype.finishSession = function () {
    this.addLine("assistant", "Thanks — that's really helpful. Closing this out now.");
    this.setState("idle");
    var self = this;
    this.finishTimer = setTimeout(function () {
      self.finishTimer = null;
      self.endSession();
    }, 1600);
  };

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.getElementById("vcp-voice-widget");
    if (root) new VoiceWidget(root);
  });
})();
