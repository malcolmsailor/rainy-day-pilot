const VALID_SEQUENCES = ["A", "B", "test"];
const EMAIL = "malcolm.sailor@gmail.com";
const PROBE_BAR_LEAD_TIME = 4;
const INTER_TRIAL_PAUSE = 2000;
const ALL_TRIALS = {
  A: [
    {
      trial_id: "6",
      complete_audio: "5c3b79b0.mp3",
      probe_audio: "87d7d01c.mp3",
    },
    {
      trial_id: "5a",
      complete_audio: "ee2b728e.mp3",
      probe_audio: "888ddbfc.mp3",
    },
    {
      trial_id: "4a",
      complete_audio: "155db229.mp3",
      probe_audio: "24e5dc31.mp3",
    },
    {
      trial_id: "2a",
      complete_audio: "71ba9c46.mp3",
      probe_audio: "cfa90be2.mp3",
    },
    {
      trial_id: "7",
      complete_audio: "d2c99d8a.mp3",
      probe_audio: "d4f32e6a.mp3",
    },
    {
      trial_id: "3a",
      complete_audio: "612d3645.mp3",
      probe_audio: "8f2eb966.mp3",
    },
  ],
  B: [
    {
      trial_id: "3b",
      complete_audio: "74855b16.mp3",
      probe_audio: "576f55fb.mp3",
    },
    {
      trial_id: "4b",
      complete_audio: "79f8d604.mp3",
      probe_audio: "59c7f6bf.mp3",
    },
    {
      trial_id: "7",
      complete_audio: "d2c99d8a.mp3",
      probe_audio: "d4f32e6a.mp3",
    },
    {
      trial_id: "2b",
      complete_audio: "a6577a9f.mp3",
      probe_audio: "025c3665.mp3",
    },
    {
      trial_id: "5b",
      complete_audio: "219c5240.mp3",
      probe_audio: "8d3f106e.mp3",
    },
    {
      trial_id: "6",
      complete_audio: "5c3b79b0.mp3",
      probe_audio: "87d7d01c.mp3",
    },
  ],
  test: [
    {
      trial_id: "0",
      complete_audio: "5c3b79b0.mp3",
      probe_audio: "87d7d01c.mp3",
    },
  ],
};

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const seq = params.get("seq");

  if (!seq || !VALID_SEQUENCES.includes(seq)) {
    showScreen("screen-error");
    return;
  }

  const trials = ALL_TRIALS[seq];

  const state = {
    sequence: seq,
    trials,
    currentTrial: 0,
    phase: null,
    results: [],
    currentResult: {},
  };

  preloadAudio(trials);
  setupBeginButton(state);
  showScreen("screen-welcome");
});

function showScreen(id) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

function preloadAudio(trials) {
  for (const trial of trials) {
    new Audio(`audio/${trial.complete_audio}`);
    new Audio(`audio/${trial.probe_audio}`);
  }
}

function setupBeginButton(state) {
  document.getElementById("btn-begin").addEventListener("click", () => {
    // Activate beforeunload guard
    window.addEventListener("beforeunload", onBeforeUnload);
    startTrial(state);
  });
}

function onBeforeUnload(e) {
  e.preventDefault();
}

function startTrial(state) {
  showScreen("screen-trial");

  const trial = state.trials[state.currentTrial];
  state.currentResult = { trial_id: trial.trial_id };

  document.getElementById("trial-counter").textContent =
    `Trial ${state.currentTrial + 1} of ${state.trials.length}`;

  playPhase(state, "complete", trial.complete_audio);
}

function playPhase(state, phase, audioFile) {
  const audio = document.getElementById("trial-audio");
  const instruction = document.getElementById("trial-instruction");
  const playbackStatus = document.getElementById("playback-status");
  const ratingContainer = document.getElementById("rating-container");

  ratingContainer.classList.add("hidden");

  if (phase === "complete") {
    instruction.textContent = "Please listen to this excerpt.";
  } else {
    instruction.textContent = "Now you'll hear part of the excerpt again.";
  }

  // Set labels for the upcoming rating
  const labelLeft = document.getElementById("label-left");
  const labelRight = document.getElementById("label-right");
  if (phase === "complete") {
    labelLeft.textContent = "Sad";
    labelRight.textContent = "Happy";
  } else {
    labelLeft.textContent = "Fits poorly";
    labelRight.textContent = "Fits well";
  }

  playbackStatus.textContent = "Playing...";

  audio.src = `audio/${audioFile}`;
  const playPromise = audio.play();

  if (playPromise !== undefined) {
    playPromise.catch(() => {
      playbackStatus.textContent = "Click anywhere to start playback.";
      const clickHandler = () => {
        audio.play();
        playbackStatus.textContent = "Playing...";
        document.removeEventListener("click", clickHandler);
      };
      document.addEventListener("click", clickHandler);
    });
  }

  function showRatingBar() {
    playbackStatus.textContent = "";
    if (phase === "complete") {
      instruction.textContent = "How happy or sad was the music?";
    } else {
      instruction.textContent =
        "How well does the tone fit the music you heard?";
    }
    ratingContainer.classList.remove("hidden");
    setupRatingClick(state, phase);
  }

  if (phase === "probe") {
    let barShown = false;
    audio.ontimeupdate = () => {
      if (
        !barShown &&
        audio.duration - audio.currentTime <= PROBE_BAR_LEAD_TIME
      ) {
        barShown = true;
        showRatingBar();
      }
    };
    audio.onended = () => {
      if (!barShown) showRatingBar();
      audio.ontimeupdate = null;
    };
  } else {
    audio.ontimeupdate = null;
    audio.onended = showRatingBar;
  }
}

function setupRatingClick(state, phase) {
  const ratingBar = document.getElementById("rating-bar");
  const indicator = document.getElementById("rating-indicator");

  const handler = (e) => {
    const rect = ratingBar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const value = Math.max(
      0,
      Math.min(100, Math.round((x / rect.width) * 100)),
    );

    indicator.style.left = `${x}px`;
    indicator.style.display = "block";

    if (phase === "complete") {
      state.currentResult.sentiment_rating = value;
    } else {
      state.currentResult.probe_fit_rating = value;
    }

    ratingBar.removeEventListener("click", handler);
    ratingBar.removeEventListener("touchend", touchHandler);

    setTimeout(() => {
      indicator.style.display = "none";
      advanceTrial(state, phase);
    }, 200);
  };

  const touchHandler = (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const rect = ratingBar.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const value = Math.max(
      0,
      Math.min(100, Math.round((x / rect.width) * 100)),
    );

    indicator.style.left = `${x}px`;
    indicator.style.display = "block";

    if (phase === "complete") {
      state.currentResult.sentiment_rating = value;
    } else {
      state.currentResult.probe_fit_rating = value;
    }

    ratingBar.removeEventListener("click", handler);
    ratingBar.removeEventListener("touchend", touchHandler);

    setTimeout(() => {
      indicator.style.display = "none";
      advanceTrial(state, phase);
    }, 200);
  };

  ratingBar.addEventListener("click", handler);
  ratingBar.addEventListener("touchend", touchHandler);
}

function advanceTrial(state, completedPhase) {
  if (completedPhase === "complete") {
    const trial = state.trials[state.currentTrial];
    playPhase(state, "probe", trial.probe_audio);
  } else {
    state.results.push({ ...state.currentResult });
    state.currentTrial++;

    if (state.currentTrial < state.trials.length) {
      setTimeout(() => startTrial(state), INTER_TRIAL_PAUSE);
    } else {
      window.removeEventListener("beforeunload", onBeforeUnload);
      showResults(state);
    }
  }
}

function showResults(state) {
  showScreen("screen-results");

  const commentsEl = document.getElementById("comments");
  const mailtoLink = document.getElementById("mailto-link");
  const copyLink = document.getElementById("copy-link");
  const copyConfirmation = document.getElementById("copy-confirmation");

  function getResultsData() {
    return {
      sequence: state.sequence,
      timestamp: new Date().toISOString(),
      trials: state.results,
      comments: commentsEl.value,
    };
  }

  const updateMailto = () => {
    const data = getResultsData();
    const subject = encodeURIComponent("Tonicization Experiment Results");
    const body = encodeURIComponent(JSON.stringify(data, null, 2));
    mailtoLink.href = `mailto:${EMAIL}?subject=${subject}&body=${body}`;
  };

  copyLink.addEventListener("click", (e) => {
    e.preventDefault();
    const text = JSON.stringify(getResultsData(), null, 2);
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    copyConfirmation.classList.remove("hidden");
    setTimeout(() => copyConfirmation.classList.add("hidden"), 3000);
  });

  commentsEl.addEventListener("input", updateMailto);
  updateMailto();
}
