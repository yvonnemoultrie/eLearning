/* ==========================================================================
   THE ROSE THAT GREW FROM CONCRETE — Lesson logic
   Static, self-contained, no backend, no login, no database.
   Sends a completion ping (name, module title, score) to a Google Sheet
   via a Google Apps Script Web App when the learner finishes screen 10.
   ========================================================================== */

(function () {
  "use strict";

  const TOTAL_SCREENS = 10;
  const STORAGE_KEY = "rose-lesson-progress-v1";
  const CLUE_TARGET = 3;
  const MODULE_TITLE = "The Rose That Grew From Concrete";
  const TOTAL_QUIZ_QUESTIONS = 7; // screens 2, 3, 4, 5, 7, 8, 9

  // Replace with your own Apps Script Web App URL if this ever changes.
  const SHEET_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbyFVds-awzHt26e6eC-QsuaaJ3Qvx1Ix6p_zfNTTI2Q-WmRIsCZ4NEUq7VUehZPcsVS/exec";

  const screens = Array.from(document.querySelectorAll(".screen"));
  const dotTrack = document.getElementById("dot-track");
  const progressLabel = document.getElementById("progress-label");
  const crackFill = document.getElementById("crack-fill");
  const navBack = document.getElementById("nav-back");
  const navContinue = document.getElementById("nav-continue");

  /** Lesson state — tracks answers so later screens can reuse them,
   *  so "Continue" can be gated on correctness where required,
   *  and so a lightweight completion score can be reported. */
  const state = {
    current: 1,
    correct: {},          // screenNumber -> boolean, for gated multiple-choice screens
    attemptedWrong: {},   // screenNumber -> true if the learner missed it at least once
    correctFirstTry: 0,   // used only for the completion "score" sent to the sheet
    speakerAnswer: "",
    subjectAnswer: "",
    clueCounts: { 6: 0, 8: 0 },
    learnerName: ""
  };

  /* ---------------- small text helpers (used in several places) ---------------- */

  function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value || "" : "";
  }

  function countSentences(text) {
    return (text || "")
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0).length;
  }

  function escapeHtml(str) {
    return (str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // Wraps the learner's name in a bold, colored highlight. Use variant
  // "dark" when the surrounding text sits on a dark background (like the
  // final completion card) so the color still has enough contrast.
  function nameHtml(variant) {
    const cls = variant === "dark" ? "name-highlight name-highlight--dark" : "name-highlight";
    return `<strong class="${cls}">${escapeHtml(state.learnerName)}</strong>`;
  }

  function isFullSentence(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) return false;
    if (!/[.!?]$/.test(trimmed)) return false;
    return trimmed.split(/\s+/).filter(Boolean).length >= 3;
  }

  /* ---------------- persistence (nice-to-have, not required) ---------------- */

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ current: state.current }));
    } catch (e) { /* storage unavailable — lesson still works */ }
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && saved.current >= 1 && saved.current <= TOTAL_SCREENS) {
        state.current = saved.current;
      }
    } catch (e) { /* ignore */ }
  }

  /* ---------------- name gate ---------------- */

  const nameGate = document.getElementById("name-gate");
  const nameInput = document.getElementById("learner-name-input");
  const nameError = document.getElementById("name-gate-error");
  const nameStartBtn = document.getElementById("name-gate-start");
  const appEl = document.getElementById("app");

  function submitName() {
    const val = (nameInput.value || "").trim();
    if (!val) {
      nameError.hidden = false;
      nameInput.focus();
      return;
    }
    state.learnerName = val;
    nameGate.hidden = true;
    appEl.hidden = false;
    const heading = document.querySelector(".screen.is-active h1");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus();
    }
  }

  nameStartBtn.addEventListener("click", submitName);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitName();
  });
  nameInput.addEventListener("input", () => {
    if (!nameError.hidden) nameError.hidden = true;
  });

  /* ---------------- dot track build ---------------- */

  function buildDots() {
    dotTrack.innerHTML = "";
    for (let i = 1; i <= TOTAL_SCREENS; i++) {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.dataset.n = i;
      dotTrack.appendChild(dot);
    }
  }

  /* ---------------- navigation gating ---------------- */

  // Screens whose Continue button requires a condition to be met first.
  function isContinueAllowed(n) {
    switch (n) {
      case 2: return !!state.correct[2];
      case 4: return !!state.correct[4];
      case 5: return !!state.correct[5];
      case 6: return state.clueCounts[6] >= CLUE_TARGET;
      case 7: return !!state.correct[7];
      case 8: return !!state.correct[8] && state.clueCounts[8] >= CLUE_TARGET;
      case 9: return !!state.correct[9] && isFullSentence(getVal("s9-reflection"));
      default: return true; // 1, 3, 10 — reflective/intro screens, never trapped
    }
  }

  function render() {
    screens.forEach((s) => {
      s.classList.toggle("is-active", Number(s.dataset.screen) === state.current);
    });

    progressLabel.textContent = `Screen ${state.current} of ${TOTAL_SCREENS}`;

    // crack "grows" as a filled rose-colored path across the concrete track
    const pct = ((state.current - 1) / (TOTAL_SCREENS - 1)) * 100;
    crackFill.style.strokeDasharray = `${pct} 100`;

    // dots
    Array.from(dotTrack.children).forEach((dot) => {
      const n = Number(dot.dataset.n);
      dot.classList.toggle("is-active", n === state.current);
      dot.classList.toggle("is-done", n < state.current);
    });

    navBack.disabled = state.current === 1;

    const allowed = isContinueAllowed(state.current);
    navContinue.disabled = !allowed;
    navContinue.textContent = state.current === TOTAL_SCREENS ? "Finish" : "Continue →";
    if (state.current === TOTAL_SCREENS) {
      navContinue.style.visibility = "hidden"; // completion card has its own actions
    } else {
      navContinue.style.visibility = "visible";
    }

    saveProgress();
    // move focus to the new screen's heading for keyboard/screen-reader users
    const activeHeading = document.querySelector(".screen.is-active h1");
    if (activeHeading && !appEl.hidden) {
      activeHeading.setAttribute("tabindex", "-1");
      activeHeading.focus({ preventScroll: false });
    }
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  // Lightweight version of the Continue-button refresh, safe to call while
  // the learner is actively typing — unlike render(), it never moves focus
  // or scrolls, so it won't interrupt someone mid-sentence.
  function updateContinueState() {
    navContinue.disabled = !isContinueAllowed(state.current);
  }

  function goTo(n) {
    if (n < 1 || n > TOTAL_SCREENS) return;
    state.current = n;
    render();
  }

  navBack.addEventListener("click", () => goTo(state.current - 1));
  navContinue.addEventListener("click", () => {
    if (!isContinueAllowed(state.current)) return;
    goTo(state.current + 1);
  });

  document.getElementById("btn-restart").addEventListener("click", () => {
    if (confirm("Start over? Your answers on this device will be cleared.")) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      window.location.reload();
    }
  });
  document.getElementById("btn-review").addEventListener("click", () => goTo(1));

  // basic keyboard support: left/right arrows move between screens
  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key === "ArrowRight" && !navContinue.disabled && state.current < TOTAL_SCREENS) goTo(state.current + 1);
    if (e.key === "ArrowLeft" && state.current > 1) goTo(state.current - 1);
  });

  /* ==========================================================================
     GENERIC MULTIPLE-CHOICE QUIZ HANDLER
     Works for .option-card and .option-chip buttons inside a .quiz-block.
     Allows retry after an incorrect answer; locks once correct is chosen.
     feedback.incorrect may be a single string (same message for any wrong
     choice) or an object keyed by option value (a unique message per choice).
     ========================================================================== */

  function setupQuiz(blockEl, screenNum, feedback) {
    if (!blockEl) return;
    const correctValue = blockEl.dataset.correct;
    const optionsContainer = blockEl.querySelector(".quiz-options");
    const options = Array.from(blockEl.querySelectorAll(".option-card, .option-chip"));
    const feedbackEl = blockEl.querySelector(".quiz-feedback");

    if ([3, 4, 5, 7, 8, 9].includes(screenNum) && optionsContainer) {
      const shuffledOptions = [...options];
      for (let i = shuffledOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
      }
      shuffledOptions.forEach((option) => optionsContainer.appendChild(option));
      Array.from(optionsContainer.querySelectorAll(".opt-letter")).forEach((label, index) => {
        label.textContent = String.fromCharCode(65 + index);
      });
    }

    function incorrectMessage(value) {
      if (feedback.incorrect && typeof feedback.incorrect === "object") {
        return feedback.incorrect[value] || "Not quite — look back at the poem and try again.";
      }
      return feedback.incorrect;
    }

    options.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (state.correct[screenNum]) return; // already solved
        const isRight = btn.dataset.value === correctValue;

        options.forEach((b) => b.classList.remove("is-incorrect"));

        if (isRight) {
          btn.classList.add("is-correct");
          options.forEach((b) => (b.disabled = true));
          feedbackEl.innerHTML = typeof feedback.correct === "function" ? feedback.correct() : feedback.correct;
          feedbackEl.className = "quiz-feedback is-correct";
          state.correct[screenNum] = true;
          if (!state.attemptedWrong[screenNum]) state.correctFirstTry++;
          if (typeof feedback.onCorrect === "function") feedback.onCorrect(btn.dataset.value);
        } else {
          btn.classList.add("is-incorrect");
          state.attemptedWrong[screenNum] = true;
          feedbackEl.textContent = incorrectMessage(btn.dataset.value);
          feedbackEl.className = "quiz-feedback is-incorrect";
        }
        render();
      });
    });
  }

  /* ---------------- Screen 1: welcome pills (ungraded) ---------------- */

  const s1Choices = document.getElementById("s1-choices");
  const s1Reveal = document.getElementById("s1-reveal");
  s1Choices.querySelectorAll(".choice-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      s1Choices.querySelectorAll(".choice-pill").forEach((b) => b.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      s1Reveal.hidden = false;
    });
  });

  /* ---------------- Screen 2: Meet Tupac ---------------- */

  setupQuiz(document.getElementById("s2-quiz"), 2, {
    correct: "That's right. Tupac expressed his ideas through music, acting, and poetry.",
    incorrect: {
      rapper: "That's true, but there's more to Tupac's creative work than music alone. Try again.",
      actor: "That's true, but there's more to Tupac's creative work than film alone. Try again.",
      poet: "That's true, but there's more to Tupac's creative work than poetry alone. Try again."
    }
  });

  /* ---------------- Screen 3: vocabulary micro-check + audio ---------------- */

  setupQuiz(document.getElementById("s3-quiz"), 3, {
    correct: "Yes — cement is a close synonym for concrete.",
    incorrect: {
      soft: "Soft is actually the opposite quality of concrete — concrete is hard. Try again.",
      flexible: "Concrete is rigid, not flexible. Think about what concrete is made from."
    }
  });

  const audio = document.getElementById("poem-audio");
  const audioPlay = document.getElementById("audio-play");
  const audioPause = document.getElementById("audio-pause");
  const audioReplay = document.getElementById("audio-replay");
  const audioNote = document.getElementById("audio-note");

  audio.load();

  function tryAudio(action) {
    try {
      if (action === "play") {
        const p = audio.play();
        if (p && p.catch) p.catch(() => { audioNote.textContent = "Audio isn't available yet — read the full poem below."; });
        audioPlay.setAttribute("aria-pressed", "true");
      } else if (action === "pause") {
        audio.pause();
        audioPlay.setAttribute("aria-pressed", "false");
      } else if (action === "replay") {
        audio.currentTime = 0;
        const p = audio.play();
        if (p && p.catch) p.catch(() => {});
        audioPlay.setAttribute("aria-pressed", "true");
      }
    } catch (e) { /* audio optional — text transcript always available */ }
  }
  audioPlay.addEventListener("click", () => tryAudio("play"));
  audioPause.addEventListener("click", () => tryAudio("pause"));
  audioReplay.addEventListener("click", () => tryAudio("replay"));

  /* ---------------- Screen 4: speaker ---------------- */

  const speakerLabels = {
    rose: "the rose",
    observer: "the person who sees the rose",
    concrete: "the concrete",
    tupac: "Tupac himself"
  };
  setupQuiz(document.getElementById("s4-quiz"), 4, {
    correct: 'That\u2019s right! The speaker is telling us about the rose. Notice the words \u201cDid you hear\u2026\u201d \u2014 the speaker is talking directly to us about what they have observed.',
    incorrect: {
      rose: "The rose is what's being described, not who's doing the describing. Look again at who is talking.",
      concrete: "The concrete is where the rose grows — it isn't speaking. Look for who is telling us about the rose.",
      tupac: "Tupac wrote the poem, but the voice inside a poem isn't automatically the poet. Who is telling us what they observed?"
    },
    onCorrect: (val) => { state.speakerAnswer = speakerLabels[val] || val; }
  });

  /* ---------------- Screen 5: subject ---------------- */

  const subjectLabels = { rose: "a rose", concrete: "concrete", city: "a city", musician: "a musician" };
  setupQuiz(document.getElementById("s5-quiz"), 5, {
    correct: "Yes! The speaker is telling us about a rose that grew through a crack in concrete.",
    incorrect: {
      concrete: "Concrete is part of the setting, but it isn't what the poem is mainly about. Look at the opening lines again.",
      city: "There's no city mentioned in this poem. What does the speaker ask us to hear about?",
      musician: "There's no musician in this poem. Look at the opening lines again."
    },
    onCorrect: (val) => {
      state.subjectAnswer = subjectLabels[val] || val;
      document.getElementById("s5-transition").hidden = false;
    }
  });

  /* ==========================================================================
     CLUE / ANNOTATION INTERACTION (Screens 6 and 8)
     Each poem has real evidence buttons (data-clue) plus two decoy buttons
     (data-correct="false") that give unique, explanatory feedback instead
     of counting toward the target.
     ========================================================================== */

  function setupClueInteraction(containerId, countElId, feedbackElId, screenNum, onTarget) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const countEl = document.getElementById(countElId);
    const feedbackEl = document.getElementById(feedbackElId);
    const found = new Set();

    container.querySelectorAll(".clue").forEach((btn) => {
      const isDecoy = btn.dataset.correct === "false";

      btn.addEventListener("click", () => {
        if (isDecoy) {
          btn.classList.add("is-decoy-flagged");
          feedbackEl.textContent = btn.dataset.feedback || "That phrase doesn't quite tell us about the rose's situation — keep looking.";
          feedbackEl.classList.remove("is-positive");
          render();
          return;
        }

        const key = btn.dataset.clue;
        if (!found.has(key)) {
          found.add(key);
          btn.classList.add("is-found");
          feedbackEl.textContent = "Good clue! This phrase tells us something about the rose's situation.";
          feedbackEl.classList.add("is-positive");
        } else {
          feedbackEl.textContent = "You've already marked that one — try another phrase.";
          feedbackEl.classList.remove("is-positive");
        }
        state.clueCounts[screenNum] = found.size;
        countEl.textContent = Math.min(found.size, CLUE_TARGET);

        if (found.size >= CLUE_TARGET && typeof onTarget === "function") onTarget();
        render();
      });
    });
  }

  setupClueInteraction("poem-detective", "s6-count", "s6-feedback", 6, () => {
    document.getElementById("s6-complete").hidden = false;
    document.getElementById("s6-complete-text").innerHTML =
      `You found the clues, ${nameHtml()}. The speaker describes a rose that continues to grow and survive even though its surroundings make survival difficult.`;
  });

  /* ---------------- Screen 7: literal meaning synthesis ---------------- */

  setupQuiz(document.getElementById("s7-quiz"), 7, {
    correct: "Exactly. The poem describes a rose growing through a crack in concrete, even though its environment makes it difficult to survive.",
    incorrect: {
      a: "The poem doesn't describe an easy, beautiful garden — the rose grows somewhere difficult. Look again at where the rose is growing.",
      c: "The speaker isn't angry, and nothing in the poem describes the rose being destroyed. Re-read the poem's tone."
    },
    onCorrect: () => {
      document.getElementById("s7-fill-speaker").textContent = state.speakerAnswer || "the person who sees the rose";
      document.getElementById("s7-fill-subject").textContent = state.subjectAnswer || "a rose";
      document.getElementById("s7-scaffold").hidden = false;
      document.getElementById("s7-transition").hidden = false;
    }
  });

  /* ---------------- Screen 8: symbol + evidence + reflection ---------------- */

  setupQuiz(document.getElementById("s8-quiz"), 8, {
    correct: "Yes. The rose can represent a person who grows, survives, and succeeds despite difficult circumstances.",
    incorrect: {
      a: "The poem does not show the rose receiving support from others. Look for the idea supported by its difficult surroundings and continued growth.",
      c: "The poem does not compare talent with effort. Look for the idea supported by the rose's struggle and survival.",
      d: "The poem shows the rose adapting, but not creating change around it. Look for the larger idea supported by its survival."
    },
    onCorrect: () => {
      document.getElementById("s8-evidence-block").hidden = false;
    }
  });

  setupClueInteraction("poem-symbol", "s8-count", "s8-feedback", 8, () => {
    document.getElementById("s8-reflection").hidden = false;
  });

  const s8Reflection = document.getElementById("s8-reflection");
  s8Reflection.querySelectorAll(".choice-pill").forEach((btn) => {
    btn.addEventListener("click", () => btn.classList.toggle("is-selected"));
  });

  /* ---------------- Screen 9: deeper meaning ---------------- */

  setupQuiz(document.getElementById("s9-quiz"), 9, {
    correct: () => `Exactly, ${nameHtml()}. The rose can represent someone who continues to grow and succeed despite obstacles.`,
    incorrect: {
      a: "That describes a literal fact about roses, not the poem's bigger message. Think about what the rose's survival could mean for a person.",
      b: "The poem does not show other people providing encouragement. Think about what the rose's survival could mean for a person.",
      d: "Concrete isn't harmful in this poem — the rose grows through it. Think about what the rose's survival could mean for a person."
    },
    onCorrect: () => { document.getElementById("s9-frame").hidden = false; }
  });

  const s9Reflection = document.getElementById("s9-reflection");
  const s9ReflectionError = document.getElementById("s9-reflection-error");
  s9Reflection.addEventListener("input", () => {
    if (isFullSentence(s9Reflection.value)) s9ReflectionError.hidden = true;
    updateContinueState();
  });
  s9Reflection.addEventListener("blur", () => {
    if (s9Reflection.value.trim() && !isFullSentence(s9Reflection.value)) {
      s9ReflectionError.hidden = false;
    }
  });

  /* ---------------- Screen 10: central idea ---------------- */

  // Checks one scaffold field for sentence structure only.
  function ensureScaffoldFieldReady(key) {
    const input = document.getElementById(`s10-${key}`);
    const feedbackEl = document.getElementById(`s10-${key}-feedback`);
    const text = input.value.trim();

    if (!isFullSentence(text)) {
      feedbackEl.textContent = "Please write this as a complete sentence (a few words, ending with a period).";
      feedbackEl.hidden = false;
      return false;
    }

    feedbackEl.hidden = true;
    return true;
  }

  ["speaker", "subject", "message"].forEach((key) => {
    document.getElementById(`s10-${key}`).addEventListener("blur", () => ensureScaffoldFieldReady(key));
  });

  document.getElementById("s10-submit").addEventListener("click", () => {
    const textarea = document.getElementById("s10-central");
    const errorEl = document.getElementById("s10-error");

    // Scaffold fields first — each must be a full sentence, and each
    // gets its one coaching pass before being allowed through.
    const fieldOrder = ["speaker", "subject", "message"];
    for (const key of fieldOrder) {
      if (!ensureScaffoldFieldReady(key)) {
        document.getElementById(`s10-${key}`).focus();
        return;
      }
    }

    const text = textarea.value.trim();
    const sentenceCount = countSentences(text);

    if (!text) {
      errorEl.textContent = "Please write your central idea response before continuing.";
      errorEl.hidden = false;
      textarea.focus();
      return;
    }
    if (sentenceCount < 3) {
      errorEl.textContent = "Please write at least three complete sentences explaining the central idea before continuing.";
      errorEl.hidden = false;
      textarea.focus();
      return;
    }

    errorEl.hidden = true;
    document.getElementById("s10-check").hidden = false;
    document.getElementById("completion-title").innerHTML = `You Did It, ${nameHtml("dark")}!`;
    document.getElementById("s10-check").scrollIntoView({ behavior: "smooth", block: "start" });
    sendCompletionToSheet();
  });

  /* ==========================================================================
     COMPLETION REPORTING — sends name, module title, and score to a
     Google Sheet via a Google Apps Script Web App. Uses mode:"no-cors"
     because Apps Script web apps don't return CORS headers; the request
     still delivers, but the response can't be read back in the browser.
     ========================================================================== */

  function sendCompletionToSheet() {
    if (!SHEET_WEBAPP_URL) return;
    const payload = {
      name: state.learnerName || "Anonymous",
      module: MODULE_TITLE,
      score: `${state.correctFirstTry}/${TOTAL_QUIZ_QUESTIONS}`,
      completedAt: new Date().toISOString()
    };
    fetch(SHEET_WEBAPP_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).catch((err) => {
      // A reporting failure should never block the learner's completion experience.
      console.warn("Could not send completion data to Google Sheet:", err);
    });
  }

  /* ---------------- boot ---------------- */

  loadProgress();
  buildDots();
  render();
  nameInput.focus();
})();
