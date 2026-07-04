/*
 * Voice feedback widget (issue #43).
 *
 * Session model: every open is a brand-new, independent session — no state
 * persists across opens, no visitor identity. Within a session, prior
 * turns ARE fed back to the conversation engine so follow-up questions can
 * get more specific (the "contextual grinding down" from the spec).
 *
 * STT uses the browser-native Web Speech API (SpeechRecognition) directly.
 * TTS calls api/tts.js (ElevenLabs proxy); conversation logic calls
 * api/next-turn.js (Groq proxy) — both keep their API keys server-side
 * and both fall back to a local, non-LLM stand-in if the endpoint is
 * unreachable (e.g. backend not yet deployed, or a transient failure), so
 * the widget degrades gracefully instead of breaking mid-session.
 */
(function () {
  "use strict";

  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var supportsVoice = !!(SpeechRecognition && window.speechSynthesis);

  var OPENING_QUESTION = "Thanks for stopping by. What's one thing you liked or disliked about this page?";
  var MAX_TURNS = 6; // safety cap so a session can't run forever if "done" detection misses

  // ---- PII redaction -------------------------------------------------
  // Pattern-based only for this pass (see issue #43 open questions — an
  // LLM-based redaction pass is a follow-up decision, not blocking this
  // build). Emails, phone numbers, and common "my name is X" patterns.
  var PII_PATTERNS = [
    { re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, tag: "[redacted-email]" },
    { re: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, tag: "[redacted-phone]" },
    { re: /\b(?:my name is|i'?m|this is)\s+[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?/gi, tag: "$&".replace(/[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?$/, "[redacted-name]") },
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
      return { done: false, question: "Got it — was that about how the nav looks, or how it behaves (e.g. hard to find something)?" };
    }
    if (/\b(slow|loading|lag|performance)\b/.test(lastVisitorLine)) {
      return { done: false, question: "Noted. Was that on a specific page, or the whole site generally?" };
    }
    if (/\b(color|colour|dark|silver|design|look)\b/.test(lastVisitorLine)) {
      return { done: false, question: "Interesting — is there a specific section where that stood out most?" };
    }
    if (turnCount === 1) {
      return { done: false, question: "Thanks — is there anything specific you'd change about it, even a small thing?" };
    }
    return { done: false, question: "Anything else on your mind about the page, or is that everything for now?" };
  }

  function fetchNextTurn(history) {
    if (history.length === 0) {
      return Promise.resolve({ done: false, question: OPENING_QUESTION });
    }
    if (history.filter(function (h) { return h.role === "visitor"; }).length >= MAX_TURNS) {
      return Promise.resolve({ done: true });
    }
    return fetch("/api/next-turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: history }),
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
  // Redaction happens here, client-side, before the transcript ever leaves
  // the browser — api/file-feedback.js (which does the real LLM
  // summarization + gh issue create) only ever sees already-redacted text.
  function redactedTranscript(history) {
    return history.map(function (h) { return h.role + ": " + redact(h.text); }).join("\n");
  }

  function fileFeedback(history, pageContext, sessionId) {
    return fetch("/api/file-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: redactedTranscript(history),
        pageContext: pageContext,
        sessionId: sessionId,
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

  // ---- Widget state machine -------------------------------------------
  function VoiceWidget(root) {
    this.root = root;
    this.trigger = root.querySelector(".vcp-voice-trigger");
    this.panel = root.querySelector(".vcp-voice-panel");
    this.body = root.querySelector(".vcp-voice-panel__body");
    this.statusState = root.querySelector(".vcp-voice-status__state");
    this.closeBtn = root.querySelector(".vcp-voice-panel__close");
    this.open = false;
    this.history = []; // reset every session — no cross-session memory
    this.recognition = null;

    this.trigger.addEventListener("click", this.toggle.bind(this));
    this.closeBtn.addEventListener("click", this.endSession.bind(this));
  }

  VoiceWidget.prototype.toggle = function () {
    if (this.open) { this.endSession(); } else { this.startSession(); }
  };

  VoiceWidget.prototype.startSession = function () {
    this.open = true;
    this.history = [];
    this.sessionId = makeSessionId(); // fresh per open — no cross-session identity, per spec
    this.trigger.setAttribute("data-open", "true");
    this.panel.setAttribute("data-open", "true");
    this.renderConsent();
  };

  VoiceWidget.prototype.endSession = function () {
    if (this.recognition) { try { this.recognition.abort(); } catch (e) {} }
    window.speechSynthesis && window.speechSynthesis.cancel();

    // Only file when the visitor actually said something — a session where
    // only the opening question was ever spoken has no feedback to extract.
    var hasVisitorReply = this.history.some(function (h) { return h.role === "visitor"; });
    if (hasVisitorReply) {
      fileFeedback(this.history, window.location.pathname, this.sessionId).then(function (result) {
        if (result.filed) {
          // eslint-disable-next-line no-console
          console.log("[voice-widget] filed feedback as " + result.issueUrl);
        } else {
          // eslint-disable-next-line no-console
          console.log("[voice-widget] feedback not filed:", result.reason || result.error || "unknown");
        }
      });
    }

    this.open = false;
    this.history = [];
    this.trigger.removeAttribute("data-open");
    this.trigger.removeAttribute("data-state");
    this.panel.removeAttribute("data-open");
    this.body.innerHTML = "";
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
    line.textContent = text;
    this.body.appendChild(line);
    this.body.scrollTop = this.body.scrollHeight;
  };

  VoiceWidget.prototype.setState = function (state) {
    this.trigger.setAttribute("data-state", state);
    if (this.statusState) this.statusState.textContent = state;
  };

  VoiceWidget.prototype.askQuestion = function (question) {
    this.addLine("assistant", question);
    this.setState("speaking");
    var self = this;

    // ElevenLabs via the serverless proxy (api/tts.js) — falls back to the
    // browser's built-in speechSynthesis if the proxy is unreachable or
    // not yet configured (e.g. local dev with no ELEVENLABS_API_KEY set),
    // so the widget stays fully usable before/without the backend.
    fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: question }),
    })
      .then(function (resp) {
        if (!resp.ok) throw new Error("tts proxy status " + resp.status);
        return resp.blob();
      })
      .then(function (blob) {
        var audio = new Audio(URL.createObjectURL(blob));
        audio.onended = function () { self.listen(); };
        audio.onerror = function () { self.listen(); };
        audio.play();
      })
      .catch(function () {
        self.speakWithBrowserTts(question);
      });
  };

  VoiceWidget.prototype.speakWithBrowserTts = function (question) {
    var self = this;
    var utter = new SpeechSynthesisUtterance(question);
    utter.onend = function () { self.listen(); };
    utter.onerror = function () { self.listen(); }; // TTS failure shouldn't strand the session
    window.speechSynthesis.speak(utter);
  };

  VoiceWidget.prototype.listen = function () {
    if (!this.open) return;
    this.setState("listening");

    var recognition = new SpeechRecognition();
    this.recognition = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    var self = this;
    recognition.onresult = function (event) {
      var transcript = event.results[0][0].transcript;
      self.addLine("visitor", transcript);
      self.setState("thinking");

      fetchNextTurn(self.history).then(function (turn) {
        if (!self.open) return; // session was closed while the request was in flight
        if (turn.done) {
          self.finishSession();
        } else {
          self.askQuestion(turn.question);
        }
      });
    };
    recognition.onerror = function () { self.setState("idle"); };
    recognition.onend = function () {
      if (self.trigger.getAttribute("data-state") === "listening") self.setState("idle");
    };
    recognition.start();
  };

  VoiceWidget.prototype.finishSession = function () {
    this.addLine("assistant", "Thanks — that's really helpful. Closing this out now.");
    this.setState("idle");
    var self = this;
    setTimeout(function () { self.endSession(); }, 1600);
  };

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.getElementById("vcp-voice-widget");
    if (root) new VoiceWidget(root);
  });
})();
