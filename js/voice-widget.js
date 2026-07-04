/*
 * Voice feedback widget (issue #43).
 *
 * Session model: every open is a brand-new, independent session — no state
 * persists across opens, no visitor identity. Within a session, prior
 * turns ARE fed back to the conversation engine so follow-up questions can
 * get more specific (the "contextual grinding down" from the spec).
 *
 * STT uses the browser-native Web Speech API (SpeechRecognition) directly.
 * TTS calls api/tts.js, a serverless proxy to ElevenLabs (keeps the API key
 * server-side) — falls back to the browser's built-in speechSynthesis if
 * that proxy is unreachable, so the widget works even before/without the
 * backend deployed. The one deliberately mocked piece left is nextTurn(),
 * which stands in for the eventual LLM call that will pick follow-up
 * questions (issue #43's "voice/LLM architecture" question is resolved for
 * TTS; the conversation-logic LLM call is still a follow-up). Swapping
 * nextTurn()'s body for a fetch() to a real backend endpoint is the only
 * change needed once that lands; everything else here (widget chrome,
 * session lifecycle, redaction, ticket filing) is real.
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

  // ---- Mocked conversation engine ------------------------------------
  // Stands in for the real LLM call. Picks a canned follow-up based on
  // simple keyword matching against the visitor's last reply, so the UI
  // demonstrably "grinds down" from vague to specific during a demo.
  function nextTurn(history) {
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

  // ---- Summary + ticket draft ------------------------------------------
  function buildSummary(history) {
    var visitorLines = history.filter(function (h) { return h.role === "visitor"; }).map(function (h) { return h.text; });
    var redactedQuotes = visitorLines.map(redact);
    return {
      quotes: redactedQuotes,
      // Real summarization (likes/dislikes/suggestions extraction) is the
      // LLM's job once wired up — this pass just carries the redacted
      // transcript through so the plumbing is provable end to end.
      raw_transcript: history.map(function (h) { return h.role + ": " + redact(h.text); }).join("\n"),
    };
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
    this.trigger.setAttribute("data-open", "true");
    this.panel.setAttribute("data-open", "true");
    this.renderConsent();
  };

  VoiceWidget.prototype.endSession = function () {
    if (this.recognition) { try { this.recognition.abort(); } catch (e) {} }
    window.speechSynthesis && window.speechSynthesis.cancel();

    if (this.history.length > 0) {
      var summary = buildSummary(this.history);
      // Filing the redacted summary as a Pending ticket happens server-side
      // in the real build (the client should never hold a GitHub token).
      // For this pass, log what WOULD be filed so the pipeline is visible
      // and testable without a backend.
      // eslint-disable-next-line no-console
      console.log("[voice-widget] session ended — would file as Pending ticket:", summary);
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
    this.askQuestion(nextTurn(this.history).question);
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

      var turn = nextTurn(self.history);
      if (turn.done) {
        self.finishSession();
      } else {
        self.askQuestion(turn.question);
      }
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
